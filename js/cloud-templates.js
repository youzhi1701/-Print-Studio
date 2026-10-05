import {isBuiltinTemplate,isValidTemplateObject,normalizeTemplateObject} from "./templates.js?v=20261006-03";
const CLOUD_TABLE_NAME="超级打印_云端模板库";
const FIELD_TEMPLATE_NAME="模板名称";
const FIELD_TEMPLATE_JSON="模板JSON";
const FIELD_UPDATED_AT="更新时间";
const FIELD_STATUS="状态";
const STATUS_DELETED="deleted";
const TEXT_FIELD_TYPE=1;

function asNumber(v){const n=Number(v);return Number.isFinite(n)?n:0}
function isBuiltinId(id){return isBuiltinTemplate(id)}
function deepClone(v){return typeof structuredClone==="function"?structuredClone(v):JSON.parse(JSON.stringify(v))}
function rowTime(row){return Math.max(asNumber(row?.updatedAt),asNumber(row?.template?.updatedAt))}
function isDeleted(row){return String(row?.status||"").toLowerCase()===STATUS_DELETED}

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

  const ids={
    templateId:primary.id,
    name:fields.get(FIELD_TEMPLATE_NAME)?.id,
    json:fields.get(FIELD_TEMPLATE_JSON)?.id,
    updatedAt:fields.get(FIELD_UPDATED_AT)?.id,
    status:fields.get(FIELD_STATUS)?.id
  };
  if(Object.values(ids).some(v=>!v))throw new Error("云端模板库字段初始化不完整，请重新同步");
  return{table,ids};
}

async function readCloudRowsFromSchema(schema){
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
      try{
        const parsed=JSON.parse(json||"null");
        if(isValidTemplateObject(parsed))template=normalizeTemplateObject(parsed);
      }catch{}
      rows.push({
        recordId,
        id:String(id),
        name:String(name||""),
        json:String(json||""),
        updatedAt:asNumber(updatedAt),
        status:String(status||""),
        template
      });
    }catch(err){console.warn("读取云端模板记录失败",recordId,err)}
  }
  return rows;
}

async function readCloudRows(bitable){
  const schema=await ensureCloudTable(bitable);
  const rows=await readCloudRowsFromSchema(schema);
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

function deletedFields(ids,templateId,deletedAt=Date.now()){
  return{
    [ids.templateId]:String(templateId||""),
    [ids.name]:"已删除模板",
    [ids.json]:"",
    [ids.updatedAt]:String(asNumber(deletedAt)||Date.now()),
    [ids.status]:STATUS_DELETED
  };
}

function latestById(rows){
  const map=new Map();
  for(const row of rows||[]){
    const prev=map.get(row.id);
    if(!prev||rowTime(row)>=rowTime(prev))map.set(row.id,row);
  }
  return map;
}

async function removeDuplicateRows(table,rows,keepRecordId){
  for(const row of rows||[]){
    if(row.recordId===keepRecordId)continue;
    try{await table.deleteRecord(row.recordId)}
    catch(err){console.warn("清理重复云端模板记录失败",row.recordId,err)}
  }
}

async function writeDeletedRow(table,ids,rows,templateId,deletedAt=Date.now()){
  const same=(rows||[]).filter(r=>r.id===String(templateId));
  const latest=same.sort((a,b)=>rowTime(b)-rowTime(a))[0]||null;
  const fields=deletedFields(ids,templateId,deletedAt);
  if(latest){
    await table.setRecord(latest.recordId,{fields});
    await removeDuplicateRows(table,same,latest.recordId);
    return latest.recordId;
  }
  return await table.addRecord({fields});
}

export async function upsertCloudTemplate(bitable,template){
  if(!template?.id||isBuiltinId(template.id))return{skipped:true};
  const schema=await ensureCloudTable(bitable);
  const rows=await readCloudRowsFromSchema(schema);
  const same=rows.filter(r=>r.id===String(template.id));
  const latest=same.sort((a,b)=>rowTime(b)-rowTime(a))[0]||null;
  const localTime=asNumber(template.updatedAt)||Date.now();

  if(latest&&rowTime(latest)>localTime){
    return{skipped:true,reason:isDeleted(latest)?"cloud-deleted-newer":"cloud-newer"};
  }
  if(latest&&isDeleted(latest)&&rowTime(latest)>=localTime){
    return{skipped:true,reason:"cloud-deleted-newer"};
  }

  const fields=templateFields(schema.ids,template);
  let recordId;
  if(latest){
    recordId=latest.recordId;
    await schema.table.setRecord(recordId,{fields});
    await removeDuplicateRows(schema.table,same,recordId);
  }else{
    recordId=await schema.table.addRecord({fields});
  }
  return{created:!latest,recordId};
}

export async function deleteCloudTemplate(bitable,templateId,deletedAt=Date.now()){
  if(!templateId||isBuiltinId(templateId))return{deleted:false,skipped:true};
  const schema=await ensureCloudTable(bitable);
  const rows=await readCloudRowsFromSchema(schema);
  const recordId=await writeDeletedRow(schema.table,schema.ids,rows,templateId,deletedAt);
  return{deleted:true,recordId,updatedAt:deletedAt};
}

export async function syncTemplatesWithCloud(bitable,localTemplates=[],deletedIds=[]){
  const deletedSet=new Set((deletedIds||[]).filter(id=>id&&!isBuiltinId(id)).map(String));
  const schema=await ensureCloudTable(bitable);
  let rows=await readCloudRowsFromSchema(schema);

  const clearedDeletedIds=[];
  for(const id of deletedSet){
    try{
      await writeDeletedRow(schema.table,schema.ids,rows,id,Date.now());
      clearedDeletedIds.push(id);
    }catch(err){
      console.warn("同步云端删除标记失败",id,err);
    }
  }
  if(clearedDeletedIds.length)rows=await readCloudRowsFromSchema(schema);

  const grouped=new Map();
  for(const row of rows){
    if(isBuiltinId(row.id))continue;
    const arr=grouped.get(row.id)||[];
    arr.push(row);grouped.set(row.id,arr);
  }

  const cloudById=latestById(rows.filter(r=>!isBuiltinId(r.id)));
  for(const [id,arr] of grouped){
    const keep=cloudById.get(id);
    if(keep&&arr.length>1)await removeDuplicateRows(schema.table,arr,keep.recordId);
  }

  let result=(localTemplates||[]).filter(Boolean).map(deepClone);
  result=result.filter(t=>!deletedSet.has(String(t.id)));
  let localById=new Map(result.map((t,i)=>[String(t.id),{template:t,index:i}]));
  let uploaded=0,downloaded=0,updatedLocal=0,removedLocal=0;

  for(const [id,row] of cloudById){
    const local=localById.get(id);
    const cloudTime=rowTime(row);

    if(isDeleted(row)){
      if(local&&asNumber(local.template.updatedAt)<=cloudTime){
        result.splice(local.index,1);
        removedLocal++;
        localById=new Map(result.map((t,i)=>[String(t.id),{template:t,index:i}]));
      }
      continue;
    }

    if(!isValidTemplateObject(row.template))continue;
    if(!local){
      result.push(deepClone(row.template));
      localById.set(id,{template:result[result.length-1],index:result.length-1});
      downloaded++;
      continue;
    }

    if(cloudTime>asNumber(local.template.updatedAt)){
      result[local.index]=deepClone(row.template);
      local.template=result[local.index];
      downloaded++;updatedLocal++;
    }
  }

  for(const tpl of result){
    if(!tpl?.id||isBuiltinId(tpl.id)||deletedSet.has(String(tpl.id)))continue;
    const row=cloudById.get(String(tpl.id));
    const localTime=asNumber(tpl.updatedAt);
    const cloudTime=row?rowTime(row):0;

    if(row&&isDeleted(row)&&cloudTime>=localTime)continue;
    if(!row||localTime>cloudTime||isDeleted(row)){
      const same=grouped.get(String(tpl.id))||[];
      const latest=row||same.sort((a,b)=>rowTime(b)-rowTime(a))[0]||null;
      const fields=templateFields(schema.ids,tpl);
      if(latest){
        await schema.table.setRecord(latest.recordId,{fields});
        await removeDuplicateRows(schema.table,same,latest.recordId);
      }else{
        await schema.table.addRecord({fields});
      }
      uploaded++;
    }
  }

  return{
    templates:result,
    uploaded,
    downloaded,
    updatedLocal,
    removedLocal,
    clearedDeletedIds,
    tableName:CLOUD_TABLE_NAME
  };
}

export const CLOUD_TEMPLATE_TABLE_NAME=CLOUD_TABLE_NAME;
