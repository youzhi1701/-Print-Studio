const CLOUD_TABLE_NAME="超级打印_云端模板库";
const FIELD_TEMPLATE_NAME="模板名称";
const FIELD_TEMPLATE_JSON="模板JSON";
const FIELD_UPDATED_AT="更新时间";
const FIELD_STATUS="状态";
const BUILTIN_TEMPLATE_ID="tpl_shipping_215x140";
const TEXT_FIELD_TYPE=1;

function asNumber(v){const n=Number(v);return Number.isFinite(n)?n:0}
function clone(v){return structuredClone?v=>structuredClone(v):v=>JSON.parse(JSON.stringify(v))}
const deepClone=v=>typeof structuredClone==="function"?structuredClone(v):JSON.parse(JSON.stringify(v));

async function findTableByName(base,name){
  try{
    if(base.getTableByName){
      const t=await base.getTableByName(name);
      if(t)return t;
    }
  }catch{}
  try{
    const list=await base.getTableList?.()||[];
    for(const t of list){
      try{if((await t.getName?.())===name)return t}catch{}
    }
  }catch{}
  return null;
}

async function ensureCloudTable(bitable){
  if(!bitable?.base)throw new Error("飞书多维表格未连接");
  const base=bitable.base;
  let table=await findTableByName(base,CLOUD_TABLE_NAME);
  if(!table){
    if(base.isEditable){
      const editable=await base.isEditable();
      if(!editable)throw new Error("当前多维表格没有编辑权限，无法创建云端模板库");
    }
    if(!base.addTable)throw new Error("当前飞书 SDK 不支持创建云端模板库");
    const created=await base.addTable({name:CLOUD_TABLE_NAME});
    table=await base.getTableById(created.tableId);
  }

  let meta=await table.getFieldMetaList();
  let primary=meta.find(f=>f.isPrimary)||meta[0];
  if(!primary)throw new Error("云端模板库缺少主字段");

  if(primary.name!=="模板ID"&&table.setField){
    try{
      await table.setField(primary.id,{name:"模板ID"});
      meta=await table.getFieldMetaList();
      primary=meta.find(f=>f.isPrimary)||meta.find(f=>f.id===primary.id)||primary;
    }catch(err){console.warn("云端模板库主字段重命名失败，将继续使用现有主字段",err)}
  }

  const byName=()=>new Map(meta.map(f=>[f.name,f]));
  let fields=byName();
  for(const name of [FIELD_TEMPLATE_NAME,FIELD_TEMPLATE_JSON,FIELD_UPDATED_AT,FIELD_STATUS]){
    if(fields.has(name))continue;
    if(!table.addField)throw new Error("当前飞书 SDK 不支持创建模板库字段");
    await table.addField({type:TEXT_FIELD_TYPE,name});
    meta=await table.getFieldMetaList();
    fields=byName();
  }

  return{
    table,
    ids:{
      templateId:primary.id,
      name:fields.get(FIELD_TEMPLATE_NAME)?.id,
      json:fields.get(FIELD_TEMPLATE_JSON)?.id,
      updatedAt:fields.get(FIELD_UPDATED_AT)?.id,
      status:fields.get(FIELD_STATUS)?.id
    }
  };
}

async function readCloudRows(bitable){
  const schema=await ensureCloudTable(bitable);
  const {table,ids}=schema;
  const recordIds=await table.getRecordIdList();
  const rows=[];
  for(const recordId of recordIds||[]){
    try{
      const [id,name,json,updatedAt,status]=await Promise.all([
        table.getCellString(ids.templateId,recordId),
        table.getCellString(ids.name,recordId),
        table.getCellString(ids.json,recordId),
        table.getCellString(ids.updatedAt,recordId),
        table.getCellString(ids.status,recordId)
      ]);
      if(!id)continue;
      let template=null;
      try{template=JSON.parse(json||"null")}catch{}
      rows.push({recordId,id:String(id),name:String(name||""),json:String(json||""),updatedAt:asNumber(updatedAt),status:String(status||""),template});
    }catch(err){console.warn("读取云端模板记录失败",recordId,err)}
  }
  return{...schema,rows};
}

function templateFields(ids,tpl){
  return{
    [ids.templateId]:String(tpl.id||""),
    [ids.name]:String(tpl.name||"未命名模板"),
    [ids.json]:JSON.stringify(tpl),
    [ids.updatedAt]:String(asNumber(tpl.updatedAt)||Date.now()),
    [ids.status]:String(tpl.status||"draft")
  };
}

async function findCloudRecord(table,ids,templateId){
  const recordIds=await table.getRecordIdList();
  for(const recordId of recordIds||[]){
    try{
      const id=await table.getCellString(ids.templateId,recordId);
      if(String(id||"")===String(templateId))return recordId;
    }catch{}
  }
  return null;
}

export async function upsertCloudTemplate(bitable,template){
  if(!template?.id||template.id===BUILTIN_TEMPLATE_ID)return{skipped:true};
  const {table,ids}=await ensureCloudTable(bitable);
  const recordId=await findCloudRecord(table,ids,template.id);
  const fields=templateFields(ids,template);
  if(recordId){
    await table.setRecord(recordId,{fields});
    return{created:false,recordId};
  }
  const id=await table.addRecord({fields});
  return{created:true,recordId:id};
}

export async function deleteCloudTemplate(bitable,templateId){
  if(!templateId||templateId===BUILTIN_TEMPLATE_ID)return false;
  const {table,ids}=await ensureCloudTable(bitable);
  const recordIds=await table.getRecordIdList();
  let deleted=false;
  for(const recordId of recordIds||[]){
    try{
      const id=await table.getCellString(ids.templateId,recordId);
      if(String(id||"")!==String(templateId))continue;
      await table.deleteRecord(recordId);
      deleted=true;
    }catch(err){console.warn("删除云端模板记录失败",recordId,err)}
  }
  return deleted;
}

export async function syncTemplatesWithCloud(bitable,localTemplates=[],deletedIds=[]){
  const deletedSet=new Set((deletedIds||[]).filter(id=>id&&id!==BUILTIN_TEMPLATE_ID));
  const {table,ids,rows}=await readCloudRows(bitable);

  const clearedDeletedIds=[];
  if(deletedSet.size){
    for(const id of deletedSet){
      const matching=rows.filter(row=>row.id===id);
      let ok=true;
      for(const row of matching){
        try{await table.deleteRecord(row.recordId)}
        catch(err){ok=false;console.warn("同步删除云端模板失败",row.id,err)}
      }
      if(ok)clearedDeletedIds.push(id);
    }
  }

  const cloudById=new Map();
  for(const row of rows){
    if(deletedSet.has(row.id)||row.id===BUILTIN_TEMPLATE_ID||!row.template?.elements)continue;
    const prev=cloudById.get(row.id);
    if(!prev||row.updatedAt>prev.updatedAt)cloudById.set(row.id,row);
  }

  const result=(localTemplates||[]).filter(Boolean).map(deepClone);
  const localById=new Map(result.map((t,i)=>[t.id,{template:t,index:i}]));
  let uploaded=0,downloaded=0,updatedLocal=0;

  for(const [id,row] of cloudById){
    const local=localById.get(id);
    if(!local){
      result.push(deepClone(row.template));
      localById.set(id,{template:result[result.length-1],index:result.length-1});
      downloaded++;
      continue;
    }
    const localTime=asNumber(local.template.updatedAt);
    const cloudTime=Math.max(row.updatedAt,asNumber(row.template.updatedAt));
    if(cloudTime>localTime){
      result[local.index]=deepClone(row.template);
      local.template=result[local.index];
      downloaded++;updatedLocal++;
    }
  }

  const latestCloudIds=new Set(cloudById.keys());
  for(const tpl of result){
    if(!tpl?.id||tpl.id===BUILTIN_TEMPLATE_ID||deletedSet.has(tpl.id))continue;
    const row=cloudById.get(tpl.id);
    const localTime=asNumber(tpl.updatedAt);
    const cloudTime=row?Math.max(row.updatedAt,asNumber(row.template?.updatedAt)):0;
    if(!row||localTime>cloudTime){
      const recordId=row?.recordId||await findCloudRecord(table,ids,tpl.id);
      const fields=templateFields(ids,tpl);
      if(recordId)await table.setRecord(recordId,{fields});
      else await table.addRecord({fields});
      uploaded++;
      latestCloudIds.add(tpl.id);
    }
  }

  return{
    templates:result,
    uploaded,
    downloaded,
    updatedLocal,
    clearedDeletedIds,
    tableName:CLOUD_TABLE_NAME
  };
}

export const CLOUD_TEMPLATE_TABLE_NAME=CLOUD_TABLE_NAME;
