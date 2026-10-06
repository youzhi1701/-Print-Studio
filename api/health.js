const {json,sameOrigin,redis}=require("./_lib");

module.exports=async function(req,res){
  if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"});
  if(!sameOrigin(req,res))return;
  const sessionConfigured=!!(process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=24);
  const storageConfigured=!!((process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL)&&(process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN));
  const smsConfigured=!!process.env.SMS_WEBHOOK_URL;
  let storageReady=false;
  if(storageConfigured){
    try{storageReady=String(await redis("PING")||"").toUpperCase()==="PONG"}catch{}
  }
  json(res,200,{sessionConfigured,storageConfigured,storageReady,smsConfigured});
};