import {STORAGE_KEYS} from "./state.js";

let lastPayload=null;
let listenerInstalled=false;

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
  lastPayload={...payload,updatedAt:Date.now()};
  try{localStorage.setItem(STORAGE_KEYS.bridge,JSON.stringify(lastPayload))}catch{}
  installOpenerResponder();
}

export function readBridge(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEYS.bridge)||"null")}catch{return null}
}

export function requestBridgeFromOpener(timeout=1400){
  return new Promise(resolve=>{
    let settled=false;
    const done=v=>{if(settled)return;settled=true;window.removeEventListener("message",onMsg);resolve(v||readBridge())};
    const onMsg=event=>{
      const msg=event.data;
      if(msg?.type==="SUPER_PRINT_DATA") done(msg.payload);
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
    if(msg?.type==="SUPER_PRINT_DATA") callback(msg.payload);
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
      if(tries>20||w.closed)clearInterval(timer);
    },250);
  }else{
    location.href=url.toString();
  }
}
