const {json,body,sameOrigin,requireSession,redis,tplIndexKey,tplKey,deletedKey,validTemplate,parseDeletedFlat}=require("./_lib");

module.exports=async function(req,res){
  if(!sameOrigin(req,res))return;
  const session=requireSession(req,res);if(!session)return;
  const ownerId=session.sub;
  try{
    if(req.method==="GET"){
      const ids=(await redis("SMEMBERS",tplIndexKey(ownerId)))||[];
      const templates=[];
      for(const id of ids){
        const raw=await redis("GET",tplKey(ownerId,id));
        if(!raw)continue;
        try{templates.push(JSON.parse(raw))}catch{}
      }
      const deleted=parseDeletedFlat(await redis("HGETALL",deletedKey(ownerId)));
      templates.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0));
      return json(res,200,{templates,deleted});
    }

    if(req.method==="PUT"){
      const tpl=body(req).template;
      if(!validTemplate(tpl))return json(res,400,{error:"invalid_template",message:"模板格式无效或过大"});
      const id=String(tpl.id);
      const deletedAt=Number(await redis("HGET",deletedKey(ownerId),id)||0);
      const incomingAt=Number(tpl.updatedAt||0);
      if(deletedAt&&deletedAt>=incomingAt){
        return json(res,409,{error:"deleted_newer",deletedAt,message:"云端删除版本更新"});
      }
      const currentRaw=await redis("GET",tplKey(ownerId,id));
      if(currentRaw){
        try{
          const current=JSON.parse(currentRaw);
          if(Number(current.updatedAt||0)>incomingAt){
            return json(res,409,{error:"cloud_newer",template:current,message:"云端模板版本更新"});
          }
        }catch{}
      }
      await redis("SET",tplKey(ownerId,id),JSON.stringify(tpl));
      await redis("SADD",tplIndexKey(ownerId),id);
      if(deletedAt)await redis("HDEL",deletedKey(ownerId),id);
      return json(res,200,{ok:true,template:tpl});
    }

    if(req.method==="DELETE"){
      const data=body(req),id=String(data.id||"");
      if(!/^[A-Za-z0-9._:-]{1,128}$/.test(id))return json(res,400,{error:"invalid_id"});
      const deletedAt=Math.max(Date.now(),Number(data.deletedAt||0));
      await redis("DEL",tplKey(ownerId,id));
      await redis("SREM",tplIndexKey(ownerId),id);
      await redis("HSET",deletedKey(ownerId),id,String(deletedAt));
      return json(res,200,{ok:true,id,deletedAt});
    }
    json(res,405,{error:"method_not_allowed"});
  }catch(err){
    json(res,503,{error:"template_store_unavailable",message:err.message||"私有模板库不可用"});
  }
};