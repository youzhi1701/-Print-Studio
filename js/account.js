import {storageGet,storageSet,storageRemove,STORAGE_KEYS,safeJson} from "./state.js?v=20261006-08";

let profile=safeJson(storageGet(STORAGE_KEYS.authProfile),null);
let lastFeishuKey="";

function setSession(token,user){
  if(token)storageSet(STORAGE_KEYS.authToken,token);
  if(user){profile=user;storageSet(STORAGE_KEYS.authProfile,JSON.stringify(user))}
}
export function clearAccountSession(){
  storageRemove(STORAGE_KEYS.authToken);storageRemove(STORAGE_KEYS.authProfile);profile=null;lastFeishuKey="";
}
export function getAccountProfile(){return profile}
export function hasAccountSession(){return !!storageGet(STORAGE_KEYS.authToken)}
export function getAccountToken(){return storageGet(STORAGE_KEYS.authToken)||""}

export async function accountFetch(path,options={}){
  const headers={...(options.headers||{})};
  if(options.body&&!headers["Content-Type"])headers["Content-Type"]="application/json";
  const token=getAccountToken();if(token)headers.Authorization="Bearer "+token;
  const res=await fetch(path,{...options,headers,credentials:"same-origin"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    if(res.status===401)clearAccountSession();
    const err=new Error(data.message||data.error||("请求失败 "+res.status));
    err.status=res.status;err.data=data;throw err;
  }
  return data;
}

export async function restoreAccount(){
  if(!hasAccountSession())return null;
  try{
    const data=await accountFetch("/api/me");
    profile=data.user||null;
    if(profile)storageSet(STORAGE_KEYS.authProfile,JSON.stringify(profile));
    return profile;
  }catch{return null}
}

export async function loginWithFeishuIdentity(identity){
  const baseUserId=String(identity?.baseUserId||""),tenantKey=String(identity?.tenantKey||"");
  if(!baseUserId||!tenantKey)return profile;
  const key=tenantKey+"|"+baseUserId;
  if(key===lastFeishuKey&&hasAccountSession()&&profile)return profile;
  const data=await accountFetch("/api/auth/feishu",{method:"POST",body:JSON.stringify({baseUserId,tenantKey})});
  setSession(data.token,data.user);lastFeishuKey=key;
  return profile;
}

export async function requestPhoneCode(phone){
  return await accountFetch("/api/auth/request-code",{method:"POST",body:JSON.stringify({phone})});
}
export async function verifyPhoneCode(phone,code){
  const data=await accountFetch("/api/auth/verify-code",{method:"POST",body:JSON.stringify({phone,code})});
  setSession(data.token,data.user);return profile;
}

export async function getAccountHealth(){
  try{
    const res=await fetch("/api/health",{credentials:"same-origin",cache:"no-store"});
    return await res.json();
  }catch{return{sessionConfigured:false,storageConfigured:false,storageReady:false,smsConfigured:false}}
}
