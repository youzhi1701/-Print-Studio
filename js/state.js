export const STORAGE_KEYS={templates:"super-print.templates.v1",settings:"super-print.settings.v1",bridge:"super-print.bridge.v1"};
export const state={sdk:null,connected:false,selection:null,table:null,fields:[],record:null,selectedRecords:[],templates:[],activeTemplateId:null};
export function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
export function uid(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}
