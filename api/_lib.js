const crypto=require("crypto");

const PREFIX="sp:v1";
const MAX_TEMPLATE_BYTES=360000;

function json(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(data));
}
function body(req){
  if(req.body&&typeof req.body==="object")return req.body;
  if(typeof req.body==="string"){try{return JSON.parse(req.body)}catch{}}
  return{};
}
function sameOrigin(req,res){
  const origin=req.headers.origin;
  if(!origin)return true;
  try{
    if(new URL(origin).host===req.headers.host)return true;
  }catch{}
  json(res,403,{error:"origin_not_allowed",message:"请求来源不允许"});
  return false;
}
function sha256(v){return crypto.createHash("sha256").update(String(v)).digest("hex")}
function b64url(v){return Buffer.from(v).toString("base64url")}
function secret(){
  const s=process.env.SESSION_SECRET;
  if(!s||s.length<24)throw new Error("SESSION_SECRET 未配置或长度不足");
  return s;
}
function issueToken(userId,providers=[]){
  const payload={sub:userId,providers:[...new Set(providers)],iat:Date.now(),exp:Date.now()+30*24*3600*1000};
  const raw=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac("sha256",secret()).update(raw).digest("base64url");
  return raw+"."+sig;
}
function verifyToken(token){
  if(!token||typeof token!=="string"||!token.includes("."))return null;
  const [raw,sig]=token.split(".");
  const expected=crypto.createHmac("sha256",secret()).update(raw).digest("base64url");
  const a=Buffer.from(sig||""),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{
    const p=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));
    if(!p.sub||Number(p.exp||0)<Date.now())return null;
    return p;
  }catch{return null}
}
function bearer(req){
  const h=String(req.headers.authorization||"");
  return h.startsWith("Bearer ")?h.slice(7).trim():"";
}
function requireSession(req,res){
  let session=null;
  try{session=verifyToken(bearer(req))}catch(err){
    json(res,503,{error:"auth_not_configured",message:err.message});return null;
  }
  if(!session){json(res,401,{error:"unauthorized",message:"登录状态已失效"});return null}
  return session;
}
function redisConfig(){
  const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new Error("私有模板存储未配置");
  return{url:url.replace(/\/$/,""),token};
}
async function redis(...args){
  const {url,token}=redisConfig();
  const r=await fetch(url,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(args)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.error)throw new Error(data.error||("Redis 请求失败 "+r.status));
  return data.result;
}
function identityKey(type,hash){return PREFIX+":identity:"+type+":"+hash}
function userKey(id){return PREFIX+":user:"+id}
function tplIndexKey(id){return PREFIX+":tpl-index:"+id}
function tplKey(id,templateId){return PREFIX+":tpl:"+id+":"+templateId}
function deletedKey(id){return PREFIX+":tpl-deleted:"+id}

async function readUser(id){
  const raw=await redis("GET",userKey(id));
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
async function writeUser(user){
  user.updatedAt=Date.now();
  await redis("SET",userKey(user.id),JSON.stringify(user));
  return user;
}
async function getOrCreateIdentity(type,hash,profilePatch={}){
  let userId=await redis("GET",identityKey(type,hash));
  let user=userId?await readUser(userId):null;
  if(!user){
    userId=crypto.randomUUID();
    user={id:userId,createdAt:Date.now(),updatedAt:Date.now(),providers:{}};
    user.providers[type]=true;
    Object.assign(user,profilePatch);
    await writeUser(user);
    await redis("SET",identityKey(type,hash),userId);
  }else{
    user.providers={...(user.providers||{}),[type]:true};
    Object.assign(user,profilePatch);
    await writeUser(user);
  }
  return user;
}
function normalizePhone(input){
  let p=String(input||"").trim().replace(/[\s()-]/g,"");
  if(/^1[3-9]\d{9}$/.test(p))p="+86"+p;
  if(!/^\+[1-9]\d{7,14}$/.test(p))return null;
  return p;
}
function maskPhone(phone){
  const p=String(phone||"");
  if(p.startsWith("+86")&&p.length===14)return p.slice(0,6)+"****"+p.slice(-4);
  return p.slice(0,Math.min(4,p.length))+"****"+p.slice(-3);
}
function validTemplate(tpl){
  if(!tpl||typeof tpl!=="object"||!Array.isArray(tpl.elements)||!tpl.page)return false;
  if(typeof tpl.id!=="string"||!/^[A-Za-z0-9._:-]{1,128}$/.test(tpl.id))return false;
  if(tpl.builtIn===true||String(tpl.id).startsWith("tpl_shipping_")&&tpl.builtIn!==false)return false;
  const size=Buffer.byteLength(JSON.stringify(tpl),"utf8");
  return size<=MAX_TEMPLATE_BYTES;
}
function parseDeletedFlat(value){
  if(!Array.isArray(value))return{};
  const out={};
  for(let i=0;i<value.length;i+=2)out[value[i]]=Number(value[i+1])||0;
  return out;
}

module.exports={
  PREFIX,MAX_TEMPLATE_BYTES,json,body,sameOrigin,sha256,issueToken,verifyToken,bearer,requireSession,redis,
  identityKey,userKey,tplIndexKey,tplKey,deletedKey,readUser,writeUser,getOrCreateIdentity,
  normalizePhone,maskPhone,validTemplate,parseDeletedFlat
};
