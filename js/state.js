export const STORAGE_KEYS={templates:"super-print.templates.v1",settings:"super-print.settings.v1",bridge:"super-print.bridge.v1"};
export const state={sdk:null,connected:false,selection:null,table:null,fields:[],record:null,selectedRecords:[],templates:[],activeTemplateId:null};
export function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
export function uid(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}

const memoryStore=new Map();
function probeStore(store){
  try{const k="__super_print_probe__";store.setItem(k,"1");store.removeItem(k);return true}catch{return false}
}
export function storageMode(){
  if(typeof localStorage!=="undefined"&&probeStore(localStorage))return"local";
  if(typeof sessionStorage!=="undefined"&&probeStore(sessionStorage))return"session";
  return"memory";
}
export function storageAvailable(){return storageMode()!=="memory"}
function fallbackStore(){
  try{if(typeof localStorage!=="undefined"&&probeStore(localStorage))return localStorage}catch{}
  try{if(typeof sessionStorage!=="undefined"&&probeStore(sessionStorage))return sessionStorage}catch{}
  return null
}
export function storageGet(key){
  const store=fallbackStore();
  if(store){try{const v=store.getItem(key);if(v!=null)return v}catch{}}
  return memoryStore.has(key)?memoryStore.get(key):null
}
export function storageSet(key,value){
  const text=String(value);
  const store=fallbackStore();
  if(store){try{store.setItem(key,text);return true}catch{}}
  memoryStore.set(key,text);return false
}
export function storageRemove(key){
  const store=fallbackStore();
  if(store){try{store.removeItem(key)}catch{}}
  memoryStore.delete(key)
}
