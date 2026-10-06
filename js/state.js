export const STORAGE_KEYS={templates:"super-print.templates.v1",settings:"super-print.settings.v1",bridge:"super-print.bridge.v1",templateTombstones:"super-print.template-tombstones.v1",authToken:"super-print.auth-token.v1",authProfile:"super-print.auth-profile.v1",accountScope:"super-print.account-scope.v1"};
export const state={sdk:null,connected:false,selection:null,table:null,fields:[],record:null,selectedRecords:[],templates:[],activeTemplateId:null};
export function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
export function uid(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}

const memoryStore=new Map();
let resolvedStore;
let storeResolved=false;

function probeStore(store){
  try{
    const k="__super_print_probe__";
    store.setItem(k,"1");
    store.removeItem(k);
    return true
  }catch{return false}
}
function resolveStore(){
  if(storeResolved)return resolvedStore||null;
  storeResolved=true;
  try{
    if(typeof localStorage!=="undefined"&&probeStore(localStorage)){resolvedStore=localStorage;return resolvedStore}
  }catch{}
  try{
    if(typeof sessionStorage!=="undefined"&&probeStore(sessionStorage)){resolvedStore=sessionStorage;return resolvedStore}
  }catch{}
  resolvedStore=null;
  return null
}
export function storageMode(){
  const store=resolveStore();
  if(!store)return"memory";
  try{if(typeof localStorage!=="undefined"&&store===localStorage)return"local"}catch{}
  return"session";
}
export function storageAvailable(){return storageMode()!=="memory"}
export function storageGet(key){
  const store=resolveStore();
  if(store){
    try{
      const v=store.getItem(key);
      if(v!=null)return v
    }catch{}
  }
  return memoryStore.has(key)?memoryStore.get(key):null
}
export function storageSet(key,value){
  const text=String(value);
  const store=resolveStore();
  if(store){
    try{store.setItem(key,text);return true}catch{}
  }
  memoryStore.set(key,text);
  return false
}
export function storageRemove(key){
  const store=resolveStore();
  if(store){try{store.removeItem(key)}catch{}}
  memoryStore.delete(key)
}

export function getStorageScope(){return storageGet(STORAGE_KEYS.accountScope)||"local"}
export function setStorageScope(scope){const v=String(scope||"local").trim()||"local";storageSet(STORAGE_KEYS.accountScope,v);return v}
export function storageScopedKey(base,scope=getStorageScope()){return String(base)+"::"+String(scope||"local")}
