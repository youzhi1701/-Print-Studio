let sdkModule=null;

async function loadSdk(){
  if(sdkModule) return sdkModule;
  try{
    sdkModule=await import("https://cdn.jsdelivr.net/npm/@lark-base-open/js-sdk/+esm");
    return sdkModule;
  }catch(err){
    console.warn("飞书 SDK 加载失败",err);
    return null;
  }
}

function cellToText(v){
  if(v==null) return "";
  if(typeof v==="string"||typeof v==="number"||typeof v==="boolean") return String(v);
  if(Array.isArray(v)) return v.map(cellToText).filter(Boolean).join("、");
  if(typeof v==="object"){
    if("text" in v) return cellToText(v.text);
    if("name" in v) return cellToText(v.name);
    if("value" in v) return cellToText(v.value);
    if("url" in v) return cellToText(v.url);
    return Object.values(v).map(cellToText).filter(Boolean).join("、");
  }
  return String(v);
}

async function getFields(table,selection){
  let meta=[];
  try{
    if(selection?.viewId){
      const view=await table.getViewById(selection.viewId);
      if(view?.getFieldMetaList) meta=await view.getFieldMetaList();
    }
  }catch{}
  if(!meta?.length){
    try{meta=await table.getFieldMetaList()}catch{meta=[]}
  }
  return (meta||[]).map(f=>({id:f.id,name:f.name,type:f.type}));
}

async function readRecord(table,fields,recordId){
  if(!recordId) return null;
  let raw=null;
  try{raw=await table.getRecordById(recordId)}catch{}
  const data={};
  for(const f of fields){
    let value="";
    try{
      if(table.getCellString) value=await table.getCellString(f.id,recordId);
    }catch{}
    if(value==null||value===""){
      value=cellToText(raw?.fields?.[f.id]);
    }
    data[f.name]=value??"";
  }
  return {id:recordId,data,raw};
}

export async function connectFeishu(){
  const mod=await loadSdk();
  if(!mod?.bitable) return {connected:false,reason:"SDK unavailable"};
  return {connected:true,bitable:mod.bitable};
}

export async function readContext(bitable){
  const selection=await bitable.base.getSelection();
  let table=null;
  try{table=await bitable.base.getActiveTable()}catch{}
  if(!table&&selection?.tableId){
    try{table=await bitable.base.getTableById(selection.tableId)}catch{}
  }
  if(!table) return {selection,fields:[],record:null,table:null,tableName:""};

  const fields=await getFields(table,selection);
  let tableName="";
  try{tableName=await table.getName()}catch{}
  const record=selection?.recordId?await readRecord(table,fields,selection.recordId):null;
  return {selection,fields,record,table,tableName};
}

export async function readRecordsByIds(table,fields,ids=[]){
  const rows=[];
  for(const id of ids){
    const rec=await readRecord(table,fields,id);
    if(rec) rows.push(rec);
  }
  return rows;
}

export async function chooseRecords(bitable,table,fields,selection){
  if(!table) return [];
  const tableId=table.id||selection?.tableId;
  const viewId=selection?.viewId;
  if(!tableId||!viewId||!bitable.ui?.selectRecordIdList) return [];
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
          if(ids.length) return await readRecordsByIds(table,fields,ids);
        }
      }catch(err){console.warn("getSelectedRecordIdList unavailable",err)}
    }
    if(selection?.recordId){
      const rec=await readRecord(table,fields,selection.recordId);
      return rec?[rec]:[];
    }
  }catch{}
  return [];
}

export async function resolveAttachmentUrls(table,record,fields){
  if(!table||!record) return record;
  const next={...record,data:{...record.data},attachments:{}};
  for(const f of fields){
    const raw=record.raw?.fields?.[f.id];
    if(!Array.isArray(raw)||!raw.length) continue;
    const items=raw.filter(v=>v&&typeof v==="object"&&(v.token||v.url||v.tmp_url||v.tmpUrl));
    if(!items.length) continue;
    const urls=[];
    for(const item of items){
      let url=item.url||item.tmp_url||item.tmpUrl||"";
      if(item.token&&table.getAttachmentUrl){
        try{url=await table.getAttachmentUrl(item.token)}catch(err){console.warn("getAttachmentUrl failed",f.name,err)}
      }
      if(url) urls.push(url);
    }
    if(urls.length){
      next.attachments[f.name]=urls;
      next.data[f.name]=urls[0];
    }
  }
  return next;
}
