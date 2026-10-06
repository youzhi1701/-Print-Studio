const crypto=require("crypto");
const {json,body,sameOrigin,sha256,redis,normalizePhone}=require("../_lib");

module.exports=async function(req,res){
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  try{
    const data=body(req);
    const phone=normalizePhone(data.phone);
    if(!phone)return json(res,400,{error:"invalid_phone",message:"手机号格式不正确"});
    const phoneHash=sha256(phone);
    const cooldownKey="sp:v1:otp-cooldown:"+phoneHash;
    const exists=await redis("GET",cooldownKey);
    if(exists)return json(res,429,{error:"too_many_requests",message:"请稍后再获取验证码"});

    const code=String(crypto.randomInt(100000,1000000));
    const proof=sha256(code+"|"+phoneHash+"|"+String(process.env.SESSION_SECRET||""));
    await redis("SET","sp:v1:otp:"+phoneHash,proof,"EX",300);
    await redis("SET",cooldownKey,"1","EX",60);

    const webhook=process.env.SMS_WEBHOOK_URL;
    if(webhook){
      const headers={"Content-Type":"application/json"};
      if(process.env.SMS_WEBHOOK_TOKEN)headers.Authorization="Bearer "+process.env.SMS_WEBHOOK_TOKEN;
      const sent=await fetch(webhook,{method:"POST",headers,body:JSON.stringify({phone,code,purpose:"super-print-login"})});
      if(!sent.ok)throw new Error("短信服务发送失败");
      return json(res,200,{ok:true,expiresIn:300});
    }

    if(process.env.ALLOW_DEV_OTP==="1"&&process.env.VERCEL_ENV!=="production"){
      return json(res,200,{ok:true,expiresIn:300,devCode:code});
    }
    await redis("DEL","sp:v1:otp:"+phoneHash);
    await redis("DEL",cooldownKey);
    return json(res,503,{error:"sms_not_configured",message:"短信验证码服务尚未配置"});
  }catch(err){
    json(res,503,{error:"sms_unavailable",message:err.message||"短信服务不可用"});
  }
};