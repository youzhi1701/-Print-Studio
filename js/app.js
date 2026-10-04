import {state} from "./state.js?v=20261004-6";
import {connectFeishu,readContext,readSelectedRecords,chooseRecords,resolveAttachmentUrls} from "./feishu.js?v=20261004-6";
import {loadTemplates,saveTemplates,exportTemplate,autoBindTemplateFields} from "./templates.js?v=20261004-6";
import {writeBridge,openDesigner,openPreviewWindow} from "./bridge.js?v=20261004-6";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261004-6";

const $=id=>document.getElementById(id);
let toastTimer,refreshing=false,currentIndex=0;let previewScale=1,previewFitScale=1,previewPanX=0,previewPanY=0,previewPanning=false,previewPointer=null;

function toast(msg){const n=$("toast");n.textContent=msg;n.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove("show"),1600)}
function status(text,type=""){const n=$("sdkState");n.textContent=text;n.className="status-pill "+type}
function activeTemplate(){return state.templates.find(t=>t.id===state.activeTemplateId)||state.templates[0]}
function fillTemplates(){const s=$("templateSelect");s.innerHTML="";state.templates.forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;s.appendChild(o)});if(state.activeTemplateId)s.value=state.activeTemplateId}
function autoBind(){const tpl=activeTemplate();if(autoBindTemplateFields(tpl,state.fields))saveTemplates(state.templates)}

function activeRecord(){
  if(state.selectedRecords?.length){
    currentIndex=Math.max(0,Math.min(currentIndex,state.selectedRecords.length-1));
    return state.selectedRecords[currentIndex];
  }
  return state.record||null;
}

function recordName(rec){
  return rec?.data?.订单编号||rec?.data?.["订单号"]||rec?.data?.序号||rec?.data?.收件人||"当前记录";
}

function updateRecordMeta(){
  const rec=activeRecord();
  $("recordTitle").textContent=rec?recordName(rec):"未选择记录";
  $("recordSub").textContent=rec?(state.selectedRecords.length>1?("第 "+(currentIndex+1)+" / "+state.selectedRecords.length+" 条"):"点击切换"):"点击选择";
  $("selectionText").textContent=state.selectedRecords.length>1?("已选择 "+state.selectedRecords.length+" 条记录"):(rec?"已选择 1 条记录":"未选择记录");
  $("previewCounter").textContent=state.selectedRecords.length>1?((currentIndex+1)+" / "+state.selectedRecords.length):"1 / 1";
  $("printCurrent").textContent=state.selectedRecords.length>1?("打印 "+state.selectedRecords.length+" 条记录"):"打印当前记录";
  $("prevRecord").disabled=state.selectedRecords.length<=1||currentIndex<=0;
  $("nextRecord").disabled=state.selectedRecords.length<=1||currentIndex>=state.selectedRecords.length-1;
}

function validateRecord(rec){
  const data=rec?.data||{};
  const required=["收件人","电话","手机号","收货地址"];
  const missing=required.filter(k=>k in data && !data[k]);
  const bar=$("issueBar"),text=$("issueText");
  if(!rec){bar.className="preview-health warn";text.textContent="未选择";return}
  if(missing.length){bar.className="preview-health warn";text.textContent="缺 "+missing.length+" 项";return}
  bar.className="preview-health ok";text.textContent="数据正常";
}

async function renderPreview(){
  const rec=activeRecord(),tpl=activeTemplate();
  $("previewEmpty").classList.toggle("hidden",!!rec);
  const host=$("previewHost");
  host.innerHTML="";
  if(!rec||!tpl){updateRecordMeta();validateRecord(rec);return}
  host.innerHTML=renderTemplateToHtml(tpl,rec.data||{});
  await hydrateCodes(host);
  fitPreview();
  updateRecordMeta();
  validateRecord(rec);
}

function applyPreviewTransform(){
  const host=$("previewHost");if(!host)return;
  host.style.setProperty("--preview-scale",String(previewScale));
  host.style.setProperty("--preview-pan-x",previewPanX+"px");
  host.style.setProperty("--preview-pan-y",previewPanY+"px");
  const z=$("previewZoomText");if(z)z.textContent=Math.round(previewScale*100)+"%";
}
function clampPreviewPan(){
  const viewport=$("previewViewport"),sheet=$("previewHost")?.querySelector(".print-sheet");
  if(!viewport||!sheet)return;
  const vw=viewport.clientWidth,vh=viewport.clientHeight,sw=sheet.offsetWidth*previewScale,sh=sheet.offsetHeight*previewScale;
  const keep=42;
  const maxX=Math.max(0,(vw+sw)/2-keep),maxY=Math.max(0,(vh+sh)/2-keep);
  previewPanX=Math.max(-maxX,Math.min(maxX,previewPanX));
  previewPanY=Math.max(-maxY,Math.min(maxY,previewPanY));
}
function setPreviewScale(next,anchorX=null,anchorY=null){
  const viewport=$("previewViewport");if(!viewport)return;
  const old=previewScale;next=Math.max(.2,Math.min(3,next));
  if(anchorX!=null&&anchorY!=null&&old>0){
    const rect=viewport.getBoundingClientRect();
    const ox=anchorX-rect.left-viewport.clientWidth/2;
    const oy=anchorY-rect.top-viewport.clientHeight/2;
    previewPanX=ox-next*(ox-previewPanX)/old;
    previewPanY=oy-next*(oy-previewPanY)/old;
  }
  previewScale=next;clampPreviewPan();applyPreviewTransform();
}
function fitPreview(){
  const viewport=$("previewViewport"),host=$("previewHost"),sheet=host?.querySelector(".print-sheet");
  if(!viewport||!sheet)return;
  const sw=sheet.offsetWidth,sh=sheet.offsetHeight;
  const sx=(viewport.clientWidth-18)/Math.max(1,sw),sy=(viewport.clientHeight-18)/Math.max(1,sh);
  previewFitScale=Math.max(.2,Math.min(sx,sy,1.15));
  previewScale=previewFitScale;previewPanX=0;previewPanY=0;applyPreviewTransform();
}
function resetPreview(){
  previewScale=1;previewPanX=0;previewPanY=0;applyPreviewTransform();
}

function syncBridge(){
  writeBridge({fields:state.fields,record:activeRecord(),selection:state.selection,selectedRecords:state.selectedRecords,template:activeTemplate(),activeTemplateId:state.activeTemplateId,currentIndex});
}

async function refresh(){
  if(refreshing)return;refreshing=true;
  try{
    $("statusText").textContent="正在同步";
    const c=await connectFeishu();
    if(!c.connected){state.connected=false;status("演示模式","warn");$("statusText").textContent="未连接飞书";await renderPreview();return}
    state.connected=true;state.sdk=c.bitable;status("已连接","success");
    const ctx=await readContext(c.bitable);
    state.selection=ctx.selection;state.table=ctx.table;state.fields=ctx.fields;
    state.record=ctx.record?await resolveAttachmentUrls(ctx.table,ctx.record,ctx.fields):null;
    state.selectedRecords=await readSelectedRecords(c.bitable,ctx.table,ctx.fields);
    state.selectedRecords=await Promise.all(state.selectedRecords.map(r=>resolveAttachmentUrls(ctx.table,r,ctx.fields)));
    if(state.record){
      const same=state.selectedRecords.find(r=>r.id===state.record.id);
      if(same) state.record=same;
    }
    if(!state.record&&state.selectedRecords.length)state.record=state.selectedRecords[0];
    if(state.record&&!state.selectedRecords.length)state.selectedRecords=[state.record];
    currentIndex=0;
    autoBind();syncBridge();await renderPreview();
    $("statusText").textContent="已同步";
  }catch(err){
    console.error(err);status("连接异常","error");$("statusText").textContent="同步失败";toast("读取飞书数据失败");
  }finally{refreshing=false}
}

async function chooseBatch(single=false){
  if(!state.connected||!state.sdk||!state.table){toast("请先连接飞书数据表");return}
  try{
    let rows=await chooseRecords(state.sdk,state.table,state.fields,state.selection);
    if(!rows.length){toast("没有选择记录");return}
    rows=await Promise.all(rows.map(r=>resolveAttachmentUrls(state.table,r,state.fields)));
    state.selectedRecords=single?[rows[0]]:rows;
    state.record=state.selectedRecords[0];
    currentIndex=0;autoBind();syncBridge();await renderPreview();
    toast(single?"已选择记录":("已选择 "+state.selectedRecords.length+" 条记录"));
  }catch(err){console.error(err);toast("选择记录失败")}
}

function printRecords(records){
  const tpl=activeTemplate();if(!tpl)return;
  const page=tpl.page||{width:215,height:140};
  const host=document.createElement("div");
  host.className="print-host";
  host.style.cssText="position:fixed;inset:0;z-index:9999;background:#fff;overflow:auto";
  host.innerHTML=records.map(r=>renderTemplateToHtml(tpl,r.data||{})).join("");

  const pageStyle=document.createElement("style");
  pageStyle.id="dynamicPrintPage";
  pageStyle.textContent="@media print{@page{size:"+page.width+"mm "+page.height+"mm;margin:0}.print-host .print-sheet{width:"+page.width+"mm!important;height:"+page.height+"mm!important}}";

  document.head.appendChild(pageStyle);
  document.body.appendChild(host);

  const cleanup=()=>{
    host.remove();
    pageStyle.remove();
    window.removeEventListener("afterprint",cleanup);
  };
  window.addEventListener("afterprint",cleanup);

  hydrateCodes(host).finally(()=>setTimeout(()=>window.print(),180));
}

function fitPreviewModal(){
  const body=$("previewModalBody"),sheet=body?.querySelector(".print-sheet");
  if(!body||!sheet)return;
  sheet.style.zoom="1";
  const sw=sheet.offsetWidth,sh=sheet.offsetHeight;
  const sx=(body.clientWidth-16)/Math.max(1,sw);
  const sy=(body.clientHeight-16)/Math.max(1,sh);
  const scale=Math.max(.2,Math.min(sx,sy,1.25));
  sheet.style.zoom=String(scale);
}
async function openPreviewModal(){
  const rec=activeRecord(),tpl=activeTemplate();if(!rec||!tpl){toast("请先选择记录");return}
  const body=$("previewModalBody");body.innerHTML=renderTemplateToHtml(tpl,rec.data||{});
  $("previewModal").classList.remove("hidden");
  await hydrateCodes(body);
  requestAnimationFrame(fitPreviewModal);
}

async function applyDesignerTemplate(template){
  if(!template?.id)return;
  const i=state.templates.findIndex(t=>t.id===template.id);
  if(i>=0)state.templates[i]=structuredClone(template);else state.templates.push(structuredClone(template));
  state.activeTemplateId=template.id;
  saveTemplates(state.templates);
  fillTemplates();
  autoBind();
  syncBridge();
  await renderPreview();
  toast("模板已同步");
}

async function init(){
  state.templates=loadTemplates();state.activeTemplateId=state.templates[0]?.id||null;fillTemplates();

  $("templateSelect").onchange=async e=>{state.activeTemplateId=e.target.value;autoBind();syncBridge();await renderPreview()};
  $("recordChooser").onclick=()=>chooseBatch(true);
  $("chooseBatch").onclick=()=>chooseBatch(false);
  $("prevRecord").onclick=async()=>{if(currentIndex>0){currentIndex--;syncBridge();await renderPreview()}};
  $("nextRecord").onclick=async()=>{if(currentIndex<state.selectedRecords.length-1){currentIndex++;syncBridge();await renderPreview()}};
  $("printCurrent").onclick=()=>{const records=state.selectedRecords.length>1?state.selectedRecords:(activeRecord()?[activeRecord()]:[]);records.length?printRecords(records):toast("请先选择记录")};

  const openDesignerAction=()=>{syncBridge();openDesigner(state.activeTemplateId)};
  $("openDesigner").onclick=openDesignerAction;$("openDesignerMenu").onclick=openDesignerAction;

  const openPopupPreview=()=>{syncBridge();const w=openPreviewWindow();if(!w)toast("浏览器拦截了弹出窗口，请允许后重试")};
  $("zoomPreviewBtn").onclick=openPopupPreview;

  const viewport=$("previewViewport");
  $("previewFitBtn").onclick=e=>{e.stopPropagation();fitPreview()};
  $("previewResetBtn").onclick=e=>{e.stopPropagation();resetPreview()};
  $("previewZoomInBtn").onclick=e=>{e.stopPropagation();setPreviewScale(previewScale*1.15)};
  $("previewZoomOutBtn").onclick=e=>{e.stopPropagation();setPreviewScale(previewScale/1.15)};
  viewport.addEventListener("wheel",e=>{e.preventDefault();setPreviewScale(previewScale*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY)},{passive:false});
  viewport.addEventListener("pointerdown",e=>{
    if(e.button!==0||e.target.closest(".preview-float-tools"))return;
    previewPanning=true;previewPointer={id:e.pointerId,x:e.clientX,y:e.clientY,px:previewPanX,py:previewPanY};
    viewport.classList.add("is-panning");viewport.setPointerCapture?.(e.pointerId);e.preventDefault();
  });
  viewport.addEventListener("pointermove",e=>{
    if(!previewPanning||!previewPointer||e.pointerId!==previewPointer.id)return;
    previewPanX=previewPointer.px+(e.clientX-previewPointer.x);previewPanY=previewPointer.py+(e.clientY-previewPointer.y);
    clampPreviewPan();applyPreviewTransform();
  });
  const stopPan=e=>{if(!previewPanning)return;previewPanning=false;previewPointer=null;viewport.classList.remove("is-panning");try{viewport.releasePointerCapture?.(e.pointerId)}catch{}};
  viewport.addEventListener("pointerup",stopPan);viewport.addEventListener("pointercancel",stopPan);
  viewport.addEventListener("dblclick",e=>{if(!e.target.closest(".preview-float-tools"))fitPreview()});
  $("closePreviewModal").onclick=()=>$("previewModal").classList.add("hidden");
  $("previewModal").onclick=e=>{if(e.target===$("previewModal"))$("previewModal").classList.add("hidden")};

  $("moreBtn").onclick=e=>{e.stopPropagation();const m=$("moreMenu");m.classList.toggle("hidden");const r=$("moreBtn").getBoundingClientRect();m.style.top=(r.bottom+5)+"px";m.style.right="12px"};
  document.addEventListener("click",e=>{if(!e.target.closest("#moreMenu")&&!e.target.closest("#moreBtn"))$("moreMenu").classList.add("hidden")});
  $("refreshData").onclick=refresh;$("chooseOne").onclick=()=>chooseBatch(true);$("exportTemplate").onclick=()=>exportTemplate(activeTemplate());

  window.addEventListener("resize",()=>{clearTimeout(window.__previewResize);window.__previewResize=setTimeout(()=>{fitPreview();if(!$("previewModal").classList.contains("hidden"))fitPreviewModal()},80)});
  window.addEventListener("message",e=>{
    if(e.data?.type==="SUPER_PRINT_TEMPLATE_SAVE"&&e.data.template)applyDesignerTemplate(e.data.template);
  });
  window.addEventListener("focus",()=>{state.templates=loadTemplates();fillTemplates();autoBind();renderPreview()});

  await refresh();
  try{state.sdk?.base?.onSelectionChange?.(()=>refresh())}catch(err){console.warn("selection listener unavailable",err)}
  setInterval(refresh,5000);
}
init();