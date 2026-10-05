import {requestBridgeFromOpener,onBridgeMessage} from "./bridge.js?v=20261005-5";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-5";
import {printTemplateRecords} from "./print.js?v=20261005-5";

const $=id=>document.getElementById(id);
let payload=null,index=0,fitMode=true,lastRenderKey="";

function records(){
  const arr=payload?.selectedRecords?.length?payload.selectedRecords:(payload?.record?[payload.record]:[]);
  return arr;
}
function template(){return payload?.template||null}
function currentRecord(){const list=records();if(!list.length)return null;index=Math.max(0,Math.min(index,list.length-1));return list[index]}
function recordLabel(rec){return rec?.data?.订单编号||rec?.data?.["订单号"]||rec?.data?.序号||rec?.data?.收件人||"当前记录"}

function renderKey(tpl,rec,list){
  try{return JSON.stringify({
    tid:tpl?.id||"",updatedAt:tpl?.updatedAt||0,elements:tpl?.elements||[],page:tpl?.page||{},
    rid:rec?.id||"",data:rec?.data||{},index,count:list.length
  })}catch{return String(Date.now())}
}
async function render(force=false){
  const host=$("sheetHost"),empty=$("emptyState"),tpl=template(),rec=currentRecord(),list=records();
  empty.style.display=tpl&&rec?"none":"flex";
  if(!tpl||!rec){
    if(force||lastRenderKey!=="empty"){host.innerHTML="";lastRenderKey="empty"}
    $("statusText").textContent="等待飞书数据";return
  }
  const key=renderKey(tpl,rec,list);
  if(!force&&key===lastRenderKey)return;
  lastRenderKey=key;
  const html=renderTemplateToHtml(tpl,rec.data||{});
  if(host.innerHTML!==html)host.innerHTML=html;
  await hydrateCodes(host);
  $("counter").textContent=(index+1)+" / "+list.length;
  $("previewMeta").textContent=(tpl.name||"模板")+" · "+recordLabel(rec);
  $("prevBtn").disabled=index<=0;
  $("nextBtn").disabled=index>=list.length-1;
  $("printAllBtn").style.display=list.length>1?"inline-flex":"none";
  $("statusText").textContent="已载入 "+list.length+" 条记录";
  if(fitMode)requestAnimationFrame(fit);
}
function fit(){
  const stage=$("sheetStage"),host=$("sheetHost"),sheet=host.querySelector(".print-sheet");
  if(!stage||!sheet)return;
  host.style.zoom="1";
  const sw=sheet.offsetWidth,sh=sheet.offsetHeight;
  const sx=(stage.clientWidth-24)/Math.max(1,sw),sy=(stage.clientHeight-24)/Math.max(1,sh);
  host.style.zoom=String(Math.max(.2,Math.min(sx,sy,1.35)));
  fitMode=true;$("fitBtn").textContent="适配 ✓";
}
async function printOne(){
  const tpl=template(),rec=currentRecord();if(!tpl||!rec)return;
  try{await printTemplateRecords(tpl,[rec])}
  catch(err){console.error(err);$("statusText").textContent=err?.message||"打印失败"}
}
async function printAll(){
  const tpl=template(),list=records();if(!tpl||!list.length)return;
  try{await printTemplateRecords(tpl,list)}
  catch(err){console.error(err);$("statusText").textContent=err?.message||"打印失败"}
}
function payloadIdentity(data){
  try{return JSON.stringify({
    tid:data?.template?.id||"",tUpdated:data?.template?.updatedAt||0,
    rid:data?.record?.id||"",rdata:data?.record?.data||{},
    selected:(data?.selectedRecords||[]).map(r=>[r.id,r.data])
  })}catch{return""}
}
let lastPayloadIdentity="";
function applyPayload(data){
  if(!data)return;
  const id=payloadIdentity(data);
  if(id===lastPayloadIdentity)return;
  lastPayloadIdentity=id;
  payload=data;
  index=Math.max(0,Math.min(Number(data.currentIndex)||0,Math.max(0,records().length-1)));
  render(false)
}

$("fitBtn").onclick=fit;
$("prevBtn").onclick=()=>{if(index>0){index--;render()}};
$("nextBtn").onclick=()=>{if(index<records().length-1){index++;render()}};
$("printCurrentBtn").onclick=printOne;
$("printAllBtn").onclick=printAll;
$("closeBtn").onclick=()=>window.close();
window.addEventListener("resize",()=>{clearTimeout(window.__pv);window.__pv=setTimeout(()=>{if(fitMode)fit()},80)});
document.addEventListener("keydown",e=>{if(e.key==="Escape")window.close();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="p"){e.preventDefault();printOne()}if(e.key==="ArrowLeft"&&index>0){index--;render()}if(e.key==="ArrowRight"&&index<records().length-1){index++;render()}});
onBridgeMessage(applyPayload);
const initial=await requestBridgeFromOpener(1800);
applyPayload(initial);
