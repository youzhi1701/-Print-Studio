let sdkModule=null;
const attachmentUrlCache=new Map();
const ATTACHMENT_CACHE_TTL=60*1000;

function attachmentCacheKey(recordId,fieldId,tokens=[]){
  return String(recordId||"")+"|"+String(fieldId||"")+"|"+tokens.join(",");
}
function getCachedAttachmentUrls(key){
  const hit=attachmentUrlCache.get(key);
  if(!hit)return null;
  if(Date.now()-hit.time>ATTACHMENT_CACHE_TTL){attachmentUrlCache.delete(key);return null}
  return hit.urls;
}
function setCachedAttachmentUrls(key,urls){
  if(urls?.length)attachmentUrlCache.set(key,{time:Date.now(),urls:[...urls]});
}
function clearCachedAttachmentUrls(key){attachmentUrlCache.delete(key)}
async function mapLimit(items,limit,worker){
  const list=Array.from(items||[]);
  if(!list.length)return[];
  const out=new Array(list.length);
  let next=0;
  async function run(){
    while(next<list.length){
      const i=next++;
      out[i]=await worker(list[i],i);
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit||1),list.length)},run));
  return out;
}

async function loadSdk(){
  if(sdkModule)return sdkModule;
  const sources=[
    "https://cdn.jsdelivr.net/npm/@lark-base-open/js-sdk/+esm",
    "https://esm.sh/@lark-base-open/js-sdk"
  ];
  for(const src of sources){
    try{
      sdkModule=await import(src);
      if(sdkModule?.bitable)return sdkModule;
    }catch(err){console.warn("飞书 SDK 源加载失败",src,err)}
  }
  console.warn("飞书 SDK 全部加载失败");
  return null;
}

function cellToText(v){
  if(v==null)return"";
  if(typeof v==="string"||typeof v==="number"||typeof v==="boolean")return String(v);
  if(Array.isArray(v))return v.map(cellToText).filter(Boolean).join("、");
  if(typeof v==="object"){
    if("text" in v)return cellToText(v.text);
    if("name" in v)return cellToText(v.name);
    if("value" in v)return cellToText(v.value);
    if("url" in v)return cellToText(v.url);
    return Object.values(v).map(cellToText).filter(Boolean).join("、");
  }
  return String(v);
}

async function getFields(table,selection){
  let meta=[];
  try{
    if(selection?.viewId){
      const view=await table.getViewById(selection.viewId);
      if(view?.getFieldMetaList)meta=await view.getFieldMetaList();
    }
  }catch{}
  if(!meta?.length){
    try{meta=await table.getFieldMetaList()}catch{meta=[]}
  }
  return(meta||[]).map(f=>({id:f.id,name:f.name,type:f.type}));
}

async function readRecord(table,fields,recordId){
  if(!recordId)return null;
  let raw=null;
  try{raw=await table.getRecordById(recordId)}catch{}
  const entries=await mapLimit(fields,8,async f=>{
    let value="";
    try{if(table.getCellString)value=await table.getCellString(f.id,recordId)}catch{}
    if(value==null||value==="")value=cellToText(raw?.fields?.[f.id]);
    return[f.name,value??""];
  });
  return{id:recordId,data:Object.fromEntries(entries),raw};
}

export async function connectFeishu(){
  const mod=await loadSdk();
  if(!mod?.bitable)return{connected:false,reason:"SDK unavailable"};
  return{connected:true,bitable:mod.bitable};
}

export async function readContext(bitable){
  const selection=await bitable.base.getSelection();
  let table=null;
  try{table=await bitable.base.getActiveTable()}catch{}
  if(!table&&selection?.tableId){
    try{table=await bitable.base.getTableById(selection.tableId)}catch{}
  }
  if(!table)return{selection,fields:[],record:null,table:null,tableName:""};

  const fields=await getFields(table,selection);
  let tableName="";
  try{tableName=await table.getName()}catch{}
  const record=selection?.recordId?await readRecord(table,fields,selection.recordId):null;
  return{selection,fields,record,table,tableName};
}

export async function readRecordsByIds(table,fields,ids=[]){
  const rows=await mapLimit(ids,6,id=>readRecord(table,fields,id));
  return rows.filter(Boolean);
}

export async function chooseRecords(bitable,table,fields,selection){
  if(!table)return[];
  const tableId=table.id||selection?.tableId;
  const viewId=selection?.viewId;
  if(!tableId||!viewId||!bitable.ui?.selectRecordIdList)return[];
  const ids=await bitable.ui.selectRecordIdList(tableId,viewId);
  return await readRecordsByIds(table,fields,ids||[]);
}

export async function readSelectedRecords(bitable,table,fields){
  try{
    const selection=await bitable.base.getSelection();
    if(selection?.viewId){
      try{
        const view=await table.getViewById(selection.viewId);
        if(view?.getSelectedRecordIdList){
          const ids=(await view.getSelectedRecordIdList())||[];
          if(ids.length)return await readRecordsByIds(table,fields,ids);
        }
      }catch(err){console.warn("getSelectedRecordIdList unavailable",err)}
    }
    if(selection?.recordId){
      const rec=await readRecord(table,fields,selection.recordId);
      return rec?[rec]:[];
    }
  }catch{}
  return[];
}

export async function resolveAttachmentUrls(table,record,fields,{force=false}={}){
  if(!table||!record)return record;
  const next={...record,data:{...record.data},attachments:{...(record.attachments||{})}};
  for(const f of fields){
    const raw=record.raw?.fields?.[f.id];
    if(!Array.isArray(raw)||!raw.length)continue;
    const tokens=raw.map(v=>v?.token).filter(Boolean);
    if(!tokens.length)continue;

    const cacheKey=attachmentCacheKey(record.id,f.id,tokens);
    if(force)clearCachedAttachmentUrls(cacheKey);
    let urls=force?[]:(getCachedAttachmentUrls(cacheKey)||[]);

    if(!urls.length&&table.getCellThumbnailUrls){
      try{
        const thumbs=(await table.getCellThumbnailUrls(tokens,f.id,record.id,1200))||[];
        if(thumbs.length)urls=thumbs;
      }catch(err){console.warn("getCellThumbnailUrls failed",f.name,err)}
    }

    if(!urls.length){
      try{
        const field=await table.getFieldById(f.id);
        if(field?.getAttachmentUrls)urls=(await field.getAttachmentUrls(record.id))||[];
      }catch(err){console.warn("attachmentField.getAttachmentUrls failed",f.name,err)}
    }

    if(!urls.length&&table.getCellAttachmentUrls){
      try{urls=(await table.getCellAttachmentUrls(tokens,f.id,record.id))||[]}
      catch(err){console.warn("getCellAttachmentUrls failed",f.name,err)}
    }

    if(urls.length){
      setCachedAttachmentUrls(cacheKey,urls);
      next.attachments[f.name]=urls;
      next.data[f.name]=urls[0];
    }else if(force){
      delete next.attachments[f.name];
      next.data[f.name]="";
    }
  }
  return next;
}

export async function resolveAttachmentUrlsForRecords(table,records,fields,options={}){
  const rows=await mapLimit(records,4,r=>resolveAttachmentUrls(table,r,fields,options));
  return rows.filter(Boolean);
}
