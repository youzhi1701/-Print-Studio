const crypto=require("crypto");
const {json,body,sameOrigin,sha256,redis,normalizePhone,maskPhone,bearer,verifyToken,identityKey,readUser,writeUser,getOrCreateIdentity,issueToken}=require("../_lib");

function safeEqual(a,b){
  const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
module.exports=async function(req,res){
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  try{
    const data=body(req);
    const phone=normalizePhone(data.phone),code=String(data.code||"").trim();
    if(!phone||!/^\d{6}$/.test(code))return json(res,400,{error:"invalid_code",message:"手机号或验证码格式不正确"});

    const phoneHash=sha256(phone);
    const stored=await redis("GET","sp:v1:otp:"+phoneHash);
    const proof=sha256(code+"|"+phoneHash+"|"+String(process.env.SESSION_SECRET||""));
    if(!stored||!safeEqual(stored,proof))return json(res,400,{error:"code_mismatch",message:"验证码错误或已过期"});
    await redis("DEL","sp:v1:otp:"+phoneHash);

    const existingSession=verifyToken(bearer(req));
    const mappedId=await redis("GET",identityKey("phone",phoneHash));
    let user=null;

    if(existingSession?.sub){
      user=await readUser(existingSession.sub);
      if(mappedId&&mappedId!==existingSession.sub){
        return json(res,409,{error:"phone_bound_elsewhere",message:"该手机号已绑定其他账户"});
      }
      if(user){
        await redis("SET",identityKey("phone",phoneHash),user.id);
        user.providers={...(user.providers||{}),phone:true};
        user.phoneHash=phoneHash;user.phoneMasked=maskPhone(phone);
        await writeUser(user);
      }
    }
    if(!user){
      user=await getOrCreateIdentity("phone",phoneHash,{phoneHash,phoneMasked:maskPhone(phone)});
    }

    const providers=Object.keys(user.providers||{}).filter(k=>user.providers[k]);
    const token=issueToken(user.id,providers);
    json(res,200,{token,user:{id:user.id,providers,phoneMasked:user.phoneMasked||null}});
  }catch(err){
    json(res,503,{error:"verify_unavailable",message:err.message||"验证码验证失败"});
  }
};