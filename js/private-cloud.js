import {isBuiltinTemplate,isValidTemplateObject,normalizeTemplateObject} from "./templates.js?v=20261006-12";
import {accountFetch,hasAccountSession} from "./account.js?v=20261006-12";

function clone(v){return typeof structuredClone==="function"?structuredClone(v):JSON.parse(JSON.stringify(v))}
function time(t){return Number(t?.updatedAt||0)||0}

export async function upsertCloudTemplate(_ignored,template){
  if(!hasAccountSession()||!template?.id||isBuiltinTemplate(template))return{skipped:true,reason:"no-session"};
  try{
    const data=await accountFetch("/api/templates",{method:"PUT",body:JSON.stringify({template})});
    return{created:true,template:data.template};
  }catch(err){
    if(err.status===409)return{skipped:true,reason:err.data?.error||"cloud-newer",template:err.data?.template,deletedAt:err.data?.deletedAt};
    throw err;
  }
}
export async function deleteCloudTemplate(_ignored,templateId,deletedAt=Date.now()){
  if(!hasAccountSession()||!templateId)return{deleted:false,skipped:true};
  const data=await accountFetch("/api/templates",{method:"DELETE",body:JSON.stringify({id:templateId,deletedAt})});
  return{deleted:true,...data};
}
export async function syncTemplatesWithCloud(_ignored,localTemplates=[],deletedIds=[]){
  if(!hasAccountSession())return{templates:(localTemplates||[]).map(clone),uploaded:0,downloaded:0,updatedLocal:0,removedLocal:0,clearedDeletedIds:[],skipped:true};

  const clearedDeletedIds=[];
  for(const entry of deletedIds||[]){
    const id=typeof entry==="string"?entry:entry?.id;
    const deletedAt=typeof entry==="object"?Number(entry?.deletedAt||0):0;
    if(!id||isBuiltinTemplate(id))continue;
    try{await deleteCloudTemplate(null,id,deletedAt||Date.now());clearedDeletedIds.push(String(id))}catch{}
  }

  let remote=await accountFetch("/api/templates");
  const deleted=remote.deleted||{};
  let result=(localTemplates||[]).filter(Boolean).map(clone);
  result=result.filter(t=>{
    if(isBuiltinTemplate(t))return true;
    const dt=Number(deleted[String(t.id)]||0);
    return !dt||time(t)>dt;
  });

  let removedLocal=(localTemplates||[]).length-result.length;
  let localMap=new Map(result.map((t,i)=>[String(t.id),{t,i}]));
  let downloaded=0,updatedLocal=0,uploaded=0;

  for(const rt of remote.templates||[]){
    if(!isValidTemplateObject(rt)||isBuiltinTemplate(rt))continue;
    const normalized=normalizeTemplateObject(clone(rt));
    const local=localMap.get(String(normalized.id));
    if(!local){
      result.push(normalized);downloaded++;
      localMap.set(String(normalized.id),{t:normalized,i:result.length-1});
    }else if(time(normalized)>time(local.t)){
      result[local.i]=normalized;local.t=normalized;downloaded++;updatedLocal++;
    }
  }

  const remoteMap=new Map((remote.templates||[]).filter(t=>t?.id).map(t=>[String(t.id),t]));
  for(let i=0;i<result.length;i++){
    const tpl=result[i];
    if(!tpl?.id||isBuiltinTemplate(tpl))continue;
    const rt=remoteMap.get(String(tpl.id));
    if(!rt||time(tpl)>time(rt)){
      const up=await upsertCloudTemplate(null,tpl);
      if(up?.reason==="cloud-newer"&&up.template){
        result[i]=normalizeTemplateObject(clone(up.template));downloaded++;updatedLocal++;
      }else if(up?.reason==="deleted_newer"){
        result.splice(i--,1);removedLocal++;
      }else if(!up?.skipped)uploaded++;
    }
  }
  return{templates:result,uploaded,downloaded,updatedLocal,removedLocal,clearedDeletedIds};
}
