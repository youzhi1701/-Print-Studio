import {STORAGE_KEYS,storageGet,storageSet} from "./state.js";

let lastPayload=null;
let listenerInstalled=false;

function sanitizeRecord(record){
  if(!record||typeof record!=="object")return null;
  return{
    id:record.id||"",
    data:record.data&&typeof record.data==="object"?{...record.data}:{},
    attachments:record.attachments&&typeof record.attachments==="object"?{...record.attachments}:{}
  }
}

function normalizePayload(payload){
  const p=payload&&typeof payload==="object"?payload:{};
  const selectedRecords=Array.isArray(p.selectedRecords)?p.selectedRecords.map(sanitizeRecord).filter(Boolean):[];
  const record=sanitizeRecord(p.record)||selectedRecords[0]||null;
  const list=selectedRecords.length?selectedRecords:(record?[record]:[]);
  const max=Math.max(0,list.length-1);
  const currentIndex=Math.max(0,Math.min(Number(p.currentIndex)||0,max));
  const selection=p.selection&&typeof p.selection==="object"?{
    tableId:p.selection.tableId||"",
    viewId:p.selection.viewId||"",
    recordId:p.selection.recordId||"",
    fieldId:p.selection.fieldId||""
  }:null;
  return{
    fields:Array.isArray(p.fields)?p.fields.map(f=>({id:f?.id||"",name:f?.name||"",type:f?.type??null})):[],
    selectedRecords:list,
    record:list[currentIndex]||record,
    template:p.template&&typeof p.template==="object"?p.template:null,
    activeTemplateId:p.activeTemplateId||p.template?.id||null,
    currentIndex,
    selection,
    bridgeUpdatedAt:Number(p.bridgeUpdatedAt)||0
  };
}

function installOpenerResponder(){
  if(listenerInstalled) return;
  listenerInstalled=true;
  window.addEventListener("message",event=>{
    const msg=event.data;
    if(!msg||typeof msg!=="object") return;
    if(msg.type==="SUPER_PRINT_READY"&&lastPayload){
      try{event.source?.postMessage({type:"SUPER_PRINT_DATA",payload:lastPayload},"*")}catch{}
    }
    if(msg.type==="SUPER_PRINT_REQUEST_DATA"&&lastPayload){
      try{event.source?.postMessage({type:"SUPER_PRINT_DATA",payload:lastPayload},"*")}catch{}
    }
  });
}

export function writeBridge(payload){
  lastPayload={...normalizePayload(payload),bridgeUpdatedAt:Date.now()};
  try{storageSet(STORAGE_KEYS.bridge,JSON.stringify(lastPayload))}catch(err){console.warn("bridge persistence failed",err)}
  installOpenerResponder();
}

export function readBridge(){
  try{
    const raw=JSON.parse(storageGet(STORAGE_KEYS.bridge)||"null");
    return raw?normalizePayload(raw):null
  }catch{return null}
}

export function requestBridgeFromOpener(timeout=1400){
  return new Promise(resolve=>{
    let settled=false;
    const done=v=>{if(settled)return;settled=true;window.removeEventListener("message",onMsg);resolve(v||readBridge())};
    const onMsg=event=>{
      const msg=event.data;
      if(msg?.type==="SUPER_PRINT_DATA") done(normalizePayload(msg.payload));
    };
    window.addEventListener("message",onMsg);
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage({type:"SUPER_PRINT_READY"},"*");
        window.opener.postMessage({type:"SUPER_PRINT_REQUEST_DATA"},"*");
      }
    }catch{}
    setTimeout(()=>done(readBridge()),timeout);
  });
}

export function onBridgeMessage(callback){
  const handler=event=>{
    const msg=event.data;
    if(msg?.type==="SUPER_PRINT_DATA") callback(normalizePayload(msg.payload));
  };
  window.addEventListener("message",handler);
  return ()=>window.removeEventListener("message",handler);
}

export function pushBridgeToDesigner(targetWindow){
  if(!lastPayload||!targetWindow)return;
  try{targetWindow.postMessage({type:"SUPER_PRINT_DATA",payload:lastPayload},"*")}catch{}
}

export function openDesigner(templateId){
  installOpenerResponder();
  const url=new URL("./designer.html",location.href);
  if(templateId)url.searchParams.set("template",templateId);
  const width=Math.min(1440,Math.max(720,Math.floor((screen.availWidth||1200)*0.92)));
  const height=Math.min(900,Math.max(600,Math.floor((screen.availHeight||800)*0.90)));
  const left=Math.max(0,Math.floor(((screen.availWidth||width)-width)/2));
  const top=Math.max(0,Math.floor(((screen.availHeight||height)-height)/2));
  const w=window.open(url.toString(),"super-print-designer",
    "popup=yes,width="+width+",height="+height+",left="+left+",top="+top+",resizable=yes,scrollbars=yes");
  if(w){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      pushBridgeToDesigner(w);
      if(tries>6||w.closed)clearInterval(timer);
    },500);
  }
  return w;
}


export function openPreviewWindow(){
  installOpenerResponder();
  const url=new URL("./preview.html",location.href);
  const aw=screen.availWidth||1000,ah=screen.availHeight||760;
  const width=Math.min(1180,Math.max(640,Math.floor(aw*0.82)),aw);
  const height=Math.min(900,Math.max(520,Math.floor(ah*0.86)),ah);
  const left=Math.max(0,Math.floor((aw-width)/2));
  const top=Math.max(0,Math.floor((ah-height)/2));
  const w=window.open(url.toString(),"super-print-preview",
    "popup=yes,resizable=yes,scrollbars=no,width="+width+",height="+height+",left="+left+",top="+top);
  if(w){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      pushBridgeToDesigner(w);
      if(tries>6||w.closed)clearInterval(timer);
    },500);
  }
  return w;
}
