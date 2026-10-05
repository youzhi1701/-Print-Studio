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
  return{
    ...p,
    fields:Array.isArray(p.fields)?p.fields:[],
    selectedRecords:list,
    record:list[currentIndex]||record,
    template:p.template||null,
    activeTemplateId:p.activeTemplateId||p.template?.id||null,
    currentIndex
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
  const w=window.open(url.toString(),"super-print-designer","popup=yes,width=1440,height=900,resizable=yes,scrollbars=yes");
  if(w){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      pushBridgeToDesigner(w);
      if(tries>6||w.closed)clearInterval(timer);
    },500);
  }else{
    location.href=url.toString();
  }
}


export function openPreviewWindow(){
  installOpenerResponder();
  const url=new URL("./preview.html",location.href);
  const width=Math.min(1180,Math.max(860,Math.floor(screen.availWidth*0.72)));
  const height=Math.min(900,Math.max(680,Math.floor(screen.availHeight*0.82)));
  const left=Math.max(0,Math.floor((screen.availWidth-width)/2));
  const top=Math.max(0,Math.floor((screen.availHeight-height)/2));
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
