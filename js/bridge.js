import {STORAGE_KEYS} from "./state.js";
export function writeBridge(payload){localStorage.setItem(STORAGE_KEYS.bridge,JSON.stringify({...payload,updatedAt:Date.now()}))}
export function readBridge(){try{return JSON.parse(localStorage.getItem(STORAGE_KEYS.bridge)||"null")}catch{return null}}
export function openDesigner(templateId){const url=new URL("./designer.html",location.href);if(templateId)url.searchParams.set("template",templateId);const w=window.open(url.toString(),"super-print-designer","popup=yes,width=1440,height=900,resizable=yes,scrollbars=yes");if(!w)location.href=url.toString()}
