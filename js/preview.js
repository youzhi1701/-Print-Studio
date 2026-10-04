import {requestBridgeFromOpener,onBridgeMessage} from "./bridge.js?v=20261004-6";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261004-6";

const $=id=>document.getElementById(id);
let payload=null,index=0,fitMode=true;

function records(){
  const arr=payload?.selectedRecords?.length?payload.selectedRecords:(payload?.record?[payload.record]:[]);
  return arr;
}
function template(){return payload?.template||null}
function currentRecord(){const list=records();if(!list.length)return null;index=Math.max(0,Math.min(index,list.length-1));return list[index]}
function recordLabel(rec){return rec?.data?.订单编号||rec?.data?.["订单号"]||rec?.data?.序号||rec?.data?.收件人||"当前记录"}

async function render(){
  const host=$("sheetHost"),empty=$("emptyState"),tpl=template(),rec=currentRecord(),list=records();
  host.innerHTML="";
  empty.style.display=tpl&&rec?"none":"flex";
  if(!tpl||!rec){$("statusText").textContent="等待飞书数据";return}
  host.innerHTML=renderTemplateToHtml(tpl,rec.data||{});
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
  const host=$("sheetHost"),old=host.innerHTML,p=tpl.page||{width:215,height:140};
  host.innerHTML=renderTemplateToHtml(tpl,rec.data||{});
  await hydrateCodes(host);host.style.zoom="1";
  const style=document.createElement("style");style.id="previewPrintPage";
  style.textContent="@media print{@page{size:"+p.width+"mm "+p.height+"mm;margin:0}.print-sheet{width:"+p.width+"mm!important;height:"+p.height+"mm!important}}";
  document.head.appendChild(style);
  const cleanup=async()=>{style.remove();window.removeEventListener("afterprint",cleanup);host.innerHTML=old;await hydrateCodes(host);if(fitMode)fit()};
  window.addEventListener("afterprint",cleanup);
  window.print();
}
async function printAll(){
  const tpl=template(),list=records();if(!tpl||!list.length)return;
  const host=$("sheetHost"),old=host.innerHTML,p=tpl.page||{width:215,height:140};
  host.innerHTML=list.map(r=>renderTemplateToHtml(tpl,r.data||{})).join("");
  await hydrateCodes(host);host.style.zoom="1";
  const style=document.createElement("style");style.id="previewPrintPage";
  style.textContent="@media print{@page{size:"+p.width+"mm "+p.height+"mm;margin:0}.print-sheet{width:"+p.width+"mm!important;height:"+p.height+"mm!important}}";
  document.head.appendChild(style);
  const cleanup=async()=>{style.remove();window.removeEventListener("afterprint",cleanup);host.innerHTML=old;await hydrateCodes(host);if(fitMode)fit()};
  window.addEventListener("afterprint",cleanup);
  window.print();
}
function applyPayload(data){payload=data||payload;index=0;render()}

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
