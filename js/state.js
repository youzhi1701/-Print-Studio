export const STORAGE_KEYS={templates:"super-print.templates.v1",settings:"super-print.settings.v1",bridge:"super-print.bridge.v1"};
export const state={sdk:null,connected:false,selection:null,table:null,fields:[],record:null,selectedRecords:[],templates:[],activeTemplateId:null};
export function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
export function uid(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}

const memoryStore=new Map();
export function storageAvailable(){
  try{
    const k="__super_print_probe__";
    localStorage.setItem(k,"1");localStorage.removeItem(k);return true;
  }catch{return false}
}
export function storageGet(key){
  try{return localStorage.getItem(key)}catch{return memoryStore.has(key)?memoryStore.get(key):null}
}
export function storageSet(key,value){
  try{localStorage.setItem(key,value);return true}catch{memoryStore.set(key,String(value));return false}
}
export function storageRemove(key){
  try{localStorage.removeItem(key)}catch{memoryStore.delete(key)}
}
