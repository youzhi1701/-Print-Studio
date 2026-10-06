const {json,body,sameOrigin,sha256,issueToken,bearer,verifyToken,identityKey,readUser,writeUser,getOrCreateIdentity,redis}=require("../_lib");

module.exports=async function(req,res){
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  try{
    const data=body(req);
    const baseUserId=String(data.baseUserId||"").trim();
    const tenantKey=String(data.tenantKey||"").trim();
    if(!baseUserId||baseUserId.length>256||!tenantKey||tenantKey.length>256){
      return json(res,400,{error:"invalid_identity",message:"飞书身份信息不完整"});
    }
    const identityHash=sha256("tenant:"+tenantKey+"|base:"+baseUserId);
    const existingToken=bearer(req);
    const existingSession=existingToken?verifyToken(existingToken):null;
    let user=null;

    const mappedId=await redis("GET",identityKey("feishu",identityHash));
    if(mappedId){
      user=await readUser(mappedId);
    }else if(existingSession?.sub){
      user=await readUser(existingSession.sub);
      if(user){
        await redis("SET",identityKey("feishu",identityHash),user.id);
        user.providers={...(user.providers||{}),feishu:true};
        user.feishuIdentityHash=identityHash;
        await writeUser(user);
      }
    }
    if(!user){
      user=await getOrCreateIdentity("feishu",identityHash,{feishuIdentityHash:identityHash});
    }
    const providers=Object.keys(user.providers||{}).filter(k=>user.providers[k]);
    const token=issueToken(user.id,providers);
    json(res,200,{token,user:{id:user.id,providers,phoneMasked:user.phoneMasked||null}});
  }catch(err){
    json(res,503,{error:"auth_unavailable",message:err.message||"身份服务不可用"});
  }
};