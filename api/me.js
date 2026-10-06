const {json,sameOrigin,requireSession,readUser}=require("./_lib");

module.exports=async function(req,res){
  if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  const session=requireSession(req,res);if(!session)return;
  try{
    const user=await readUser(session.sub);
    if(!user)return json(res,401,{error:"user_not_found",message:"账户不存在"});
    const providers=Object.keys(user.providers||{}).filter(k=>user.providers[k]);
    json(res,200,{user:{id:user.id,providers,phoneMasked:user.phoneMasked||null}});
  }catch(err){
    json(res,503,{error:"account_unavailable",message:err.message||"账户服务不可用"});
  }
};