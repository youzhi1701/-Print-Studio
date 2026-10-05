import {mountBuildVersion} from "./version.js?v=20261005-21";
import {requestBridgeFromOpener,onBridgeMessage} from "./bridge.js?v=20261005-21";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-21";
import {printTemplateRecords} from "./print.js?v=20261005-21";

mountBuildVersion();
const $=id=>document.getElementById(id);
let payload=null,index=0,fitMode=true,lastRenderKey="",previewScale=1,fitScale=1,panX=0,panY=0,panning=false,pointer=null;

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
function applyTransform(){
  const host=$("sheetHost");if(!host)return;
  host.style.setProperty("--popup-scale",String(previewScale));
  host.style.setProperty("--popup-pan-x",panX+"px");
  host.style.setProperty("--popup-pan-y",panY+"px");
  $("zoomText").textContent=Math.round(previewScale*100)+"%";
}
function clampPan(){
  const stage=$("sheetStage"),sheet=$("sheetHost")?.querySelector(".print-sheet");
  if(!stage||!sheet)return;
  const sw=sheet.offsetWidth*previewScale,sh=sheet.offsetHeight*previewScale,keep=48;
  const maxX=Math.max(0,(stage.clientWidth+sw)/2-keep),maxY=Math.max(0,(stage.clientHeight+sh)/2-keep);
  panX=Math.max(-maxX,Math.min(maxX,panX));panY=Math.max(-maxY,Math.min(maxY,panY));
}
function setScale(next,anchorX=null,anchorY=null){
  const stage=$("sheetStage"),old=previewScale;if(!stage)return;
  next=Math.max(.2,Math.min(4,Number(next)||1));
  if(anchorX!=null&&anchorY!=null&&old>0){
    const rect=stage.getBoundingClientRect(),ox=anchorX-rect.left-stage.clientWidth/2,oy=anchorY-rect.top-stage.clientHeight/2;
    panX=ox-next*(ox-panX)/old;panY=oy-next*(oy-panY)/old;
  }
  previewScale=next;fitMode=false;clampPan();applyTransform();$("fitBtn").textContent="适配";
}
function fit(){
  const stage=$("sheetStage"),host=$("sheetHost"),sheet=host.querySelector(".print-sheet");
  if(!stage||!sheet)return;
  const sw=sheet.offsetWidth,sh=sheet.offsetHeight;
  const sx=(stage.clientWidth-24)/Math.max(1,sw),sy=(stage.clientHeight-24)/Math.max(1,sh);
  fitScale=Math.max(.2,Math.min(sx,sy,1.35));previewScale=fitScale;panX=0;panY=0;fitMode=true;
  applyTransform();$("fitBtn").textContent="适配 ✓";
}
function resetView(){previewScale=1;panX=0;panY=0;fitMode=false;applyTransform();$("fitBtn").textContent="适配"}
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
    telements:data?.template?.elements||[],tpage:data?.template?.page||{},
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

$("fitBtn").onclick=fit;$("resetBtn").onclick=resetView;
$("zoomOutBtn").onclick=()=>setScale(previewScale/1.15);
$("zoomInBtn").onclick=()=>setScale(previewScale*1.15);
const stage=$("sheetStage");
stage.addEventListener("wheel",e=>{e.preventDefault();setScale(previewScale*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY)},{passive:false});
stage.addEventListener("pointerdown",e=>{
  if(e.button!==0||e.target.closest(".preview-actions"))return;
  panning=true;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};stage.classList.add("is-panning");stage.setPointerCapture?.(e.pointerId);e.preventDefault();
});
stage.addEventListener("pointermove",e=>{
  if(!panning||!pointer||pointer.id!==e.pointerId)return;
  panX=pointer.px+(e.clientX-pointer.x);panY=pointer.py+(e.clientY-pointer.y);clampPan();applyTransform();
});
const stopPan=e=>{if(!panning)return;panning=false;pointer=null;stage.classList.remove("is-panning");try{stage.releasePointerCapture?.(e.pointerId)}catch{}};
stage.addEventListener("pointerup",stopPan);stage.addEventListener("pointercancel",stopPan);
stage.addEventListener("dblclick",()=>fit());
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
