const {json,body,sameOrigin,sha256,redis,normalizePhone,maskPhone,issueToken,identityKey,readUser,writeUser,getOrCreateIdentity}=require("../_lib");

module.exports=async function(req,res){
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  try{
    const data=body(req);
    const phone=normalizePhone(data.phone);
    if(!phone)return json(res,400,{error:"invalid_phone",message:"手机号格式不正确"});

    const phoneHash=sha256(phone);
    const mappedId=await redis("GET",identityKey("phone",phoneHash));
    let user=mappedId?await readUser(mappedId):null;
    let created=false;

    if(mappedId&&!user){
      return json(res,409,{error:"account_missing",message:"该手机号账户数据异常，请重试"});
    }

    if(!user){
      const result=await getOrCreateIdentity("phone",phoneHash,{phoneHash,phoneMasked:maskPhone(phone)});
      user=result.user;
      created=!!result.created;
    }

    user.providers={...(user.providers||{}),phone:true};
    user.phoneHash=phoneHash;
    user.phoneMasked=maskPhone(phone);
    user.lastLoginAt=Date.now();
    user.templateStoreVersion=1;
    await writeUser(user);

    const providers=Object.keys(user.providers||{}).filter(k=>user.providers[k]);
    const token=issueToken(user.id,providers);
    json(res,200,{
      token,
      created,
      user:{id:user.id,providers,phoneMasked:user.phoneMasked,createdAt:user.createdAt,lastLoginAt:user.lastLoginAt}
    });
  }catch(err){
    json(res,503,{error:"phone_login_unavailable",message:err.message||"手机号登录失败"});
  }
};
