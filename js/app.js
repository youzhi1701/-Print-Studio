import {mountBuildVersion} from "./version.js?v=20261005-14";
import {state,storageAvailable,storageMode,storageGet,storageSet,safeJson,STORAGE_KEYS} from "./state.js?v=20261005-14";
import {connectFeishu,readContext,readSelectedRecords,chooseRecords,resolveAttachmentUrls} from "./feishu.js?v=20261005-14";
import {loadTemplates,saveTemplates,exportTemplate,importTemplateObject,autoBindTemplateFields} from "./templates.js?v=20261005-14";
import {writeBridge,openDesigner,openPreviewWindow} from "./bridge.js?v=20261005-14";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-14";
import {printTemplateRecords} from "./print.js?v=20261005-14";

mountBuildVersion();
const $=id=>document.getElementById(id);
let toastTimer,refreshing=false,currentIndex=0,lastPreviewKey="";let previewScale=1,previewFitScale=1,previewPanX=0,previewPanY=0,previewPanning=false,previewPointer=null;

function toast(msg){const n=$("toast");n.textContent=msg;n.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove("show"),1600)}
function status(text,type=""){const n=$("sdkState");n.textContent=text;n.className="status-pill "+type}
function compatInfo(extra=""){
  return [
    "URL="+location.href,
    "UA="+navigator.userAgent,
    "iframe="+String(window.self!==window.top),
    "storage="+storageMode()+" / available="+String(storageAvailable()),
    "online="+String(navigator.onLine),
    extra
  ].filter(Boolean).join("\n");
}
function showCompat(message,extra=""){
  const p=$("compatPanel");if(!p)return;
  $("compatMessage").textContent=message||"当前浏览器环境无法正常连接飞书插件。";
  $("compatDetails").textContent=compatInfo(extra);
  p.classList.remove("hidden");
}
function hideCompat(){$("compatPanel")?.classList.add("hidden")}

function activeTemplate(){return state.templates.find(t=>t.id===state.activeTemplateId)||state.templates[0]}
function fillTemplates(){const s=$("templateSelect");s.innerHTML="";state.templates.forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;s.appendChild(o)});if(state.activeTemplateId)s.value=state.activeTemplateId}
function persistActiveTemplate(){
  const currentSettings=safeJson(storageGet(STORAGE_KEYS.settings),{})||{};
  storageSet(STORAGE_KEYS.settings,JSON.stringify({...currentSettings,activeTemplateId:state.activeTemplateId||null}));
}
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
  $("previewCounter").textContent=!rec?"0 / 0":(state.selectedRecords.length>1?((currentIndex+1)+" / "+state.selectedRecords.length):"1 / 1");
  const multi=state.selectedRecords.length>1;
  $("prevRecord").hidden=!multi;$("nextRecord").hidden=!multi;
  $("prevRecord").disabled=!multi||currentIndex<=0;
  $("nextRecord").disabled=!multi||currentIndex>=state.selectedRecords.length-1;
  $("printCurrent").textContent=multi?("打印所选 "+state.selectedRecords.length+" 条"):"打印当前记录";
}

function validateRecord(rec){
  const data=rec?.data||{},missing=[];
  const has=k=>Object.prototype.hasOwnProperty.call(data,k);
  if(has("收件人")&&!data["收件人"])missing.push("收件人");
  if(has("收货地址")&&!data["收货地址"])missing.push("收货地址");
  const phoneKeys=["手机号","电话","联系电话"].filter(has);
  if(phoneKeys.length&&!phoneKeys.some(k=>data[k]))missing.push("联系电话");
  const bar=$("issueBar"),text=$("issueText");
  if(!rec){bar.className="preview-health warn";text.textContent="未选择";return}
  if(missing.length){bar.className="preview-health warn";text.textContent="缺 "+missing.length+" 项";return}
  bar.className="preview-health ok";text.textContent="数据正常";
}

function previewKey(rec,tpl){
  try{return JSON.stringify({
    rid:rec?.id||"",
    data:rec?.data||{},
    tid:tpl?.id||"",
    updatedAt:tpl?.updatedAt||0,
    elements:tpl?.elements||[],
    page:tpl?.page||{},
    index:currentIndex
  })}catch{return String(Date.now())}
}
async function renderPreview(force=false){
  const rec=activeRecord(),tpl=activeTemplate();
  $("previewEmpty").classList.toggle("hidden",!!rec);
  updateRecordMeta();validateRecord(rec);
  const host=$("previewHost");
  if(!rec||!tpl){
    if(force||lastPreviewKey!=="empty"){host.innerHTML="";lastPreviewKey="empty"}
    return
  }
  const key=previewKey(rec,tpl);
  if(!force&&key===lastPreviewKey)return;
  lastPreviewKey=key;
  const html=renderTemplateToHtml(tpl,rec.data||{});
  if(host.innerHTML!==html)host.innerHTML=html;
  await hydrateCodes(host);
  requestAnimationFrame(fitPreview);
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
  const previousRecordId=activeRecord()?.id||null;
  try{
    $("statusText").textContent="正在同步";
    const c=await connectFeishu();
    if(!c.connected){
      state.connected=false;$("statusText").textContent="未连接飞书";
      if(window.self!==window.top){
        status("连接失败","error");
        showCompat("这台电脑没有成功加载飞书 SDK，可能被网络、浏览器安全策略或第三方嵌入限制拦截。","reason="+(c.reason||"SDK unavailable"));
      }else{
        status("独立模式","warn");hideCompat();
      }
      await renderPreview();return
    }
    state.connected=true;state.sdk=c.bitable;status("已连接","success");hideCompat();
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
    const preserved=previousRecordId?state.selectedRecords.findIndex(r=>r.id===previousRecordId):-1;
    currentIndex=preserved>=0?preserved:0;
    state.record=activeRecord()||state.record;
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

async function printRecords(records){
  const tpl=activeTemplate();if(!tpl)return;
  try{await printTemplateRecords(tpl,records)}
  catch(err){console.error(err);toast(err?.message||"打印失败")}
}
async function applyDesignerTemplate(template){
  if(!template?.id)return;
  const i=state.templates.findIndex(t=>t.id===template.id);
  if(i>=0)state.templates[i]=structuredClone(template);else state.templates.push(structuredClone(template));
  state.activeTemplateId=template.id;persistActiveTemplate();
  saveTemplates(state.templates);
  fillTemplates();
  autoBind();
  syncBridge();
  await renderPreview();
  toast("模板已同步");
}

async function init(){
  if($("compatRetry"))$("compatRetry").onclick=()=>refresh();
  if($("compatOpen"))$("compatOpen").onclick=()=>window.open(location.href,"_blank","noopener");
  if($("compatCopy"))$("compatCopy").onclick=async()=>{try{await navigator.clipboard.writeText($("compatDetails")?.textContent||compatInfo());toast("诊断信息已复制")}catch{toast("复制失败，请手动复制")}};

  state.templates=loadTemplates();
  const settings=safeJson(storageGet(STORAGE_KEYS.settings),{})||{};
  state.activeTemplateId=state.templates.some(t=>t.id===settings.activeTemplateId)?settings.activeTemplateId:(state.templates[0]?.id||null);
  fillTemplates();

  $("templateSelect").onchange=async e=>{state.activeTemplateId=e.target.value;persistActiveTemplate();autoBind();syncBridge();await renderPreview()};
  $("recordChooser").onclick=()=>chooseBatch(true);
  $("chooseBatch").onclick=()=>chooseBatch(false);
  $("prevRecord").onclick=async()=>{if(currentIndex>0){currentIndex--;syncBridge();await renderPreview()}};
  $("nextRecord").onclick=async()=>{if(currentIndex<state.selectedRecords.length-1){currentIndex++;syncBridge();await renderPreview()}};
  $("printCurrent").onclick=()=>{const records=state.selectedRecords.length>1?state.selectedRecords:(activeRecord()?[activeRecord()]:[]);records.length?printRecords(records):toast("请先选择记录")};

  const openDesignerAction=()=>{syncBridge();const w=openDesigner(state.activeTemplateId);if(!w)toast("浏览器拦截了设计器窗口，请允许弹出窗口后重试")};
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

  $("moreBtn").onclick=e=>{e.stopPropagation();const m=$("moreMenu");m.classList.toggle("hidden");const r=$("moreBtn").getBoundingClientRect();m.style.top=(r.bottom+5)+"px";m.style.right="12px"};
  document.addEventListener("click",e=>{if(!e.target.closest("#moreMenu")&&!e.target.closest("#moreBtn"))$("moreMenu").classList.add("hidden")});
  $("refreshData").onclick=refresh;$("chooseOne").onclick=()=>chooseBatch(true);$("exportTemplate").onclick=()=>exportTemplate(activeTemplate());
  $("importTemplate").onclick=()=>$("importTemplateFile").click();
  $("importTemplateFile").onchange=async e=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      const tpl=importTemplateObject(parsed,state.templates);
      state.templates.push(tpl);state.activeTemplateId=tpl.id;
      persistActiveTemplate();saveTemplates(state.templates);fillTemplates();autoBind();syncBridge();await renderPreview(true);
      toast("模板已导入");
    }catch(err){console.error(err);toast(err?.message||"模板导入失败")}
  };
  $("deleteTemplate").onclick=async()=>{
    const tpl=activeTemplate();if(!tpl)return;
    if(tpl.id==="tpl_shipping_215x140"){toast("内置发货单模板不可删除");return}
    if(state.templates.length<=1){toast("至少保留一个模板");return}
    state.templates=state.templates.filter(t=>t.id!==tpl.id);
    state.activeTemplateId=state.templates[0]?.id||null;persistActiveTemplate();saveTemplates(state.templates);fillTemplates();syncBridge();await renderPreview(true);
    toast("模板已删除");
  };

  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="p"){
      e.preventDefault();
      const records=state.selectedRecords.length>1?state.selectedRecords:(activeRecord()?[activeRecord()]:[]);
      records.length?printRecords(records):toast("请先选择记录");
    }
  });
  window.addEventListener("resize",()=>{clearTimeout(window.__previewResize);window.__previewResize=setTimeout(()=>fitPreview(),80)});
  window.addEventListener("message",e=>{
    if(e.data?.type==="SUPER_PRINT_TEMPLATE_SAVE"&&e.data.template)applyDesignerTemplate(e.data.template);
  });
  window.addEventListener("focus",()=>{
    state.templates=loadTemplates();
    if(!state.templates.some(t=>t.id===state.activeTemplateId)){state.activeTemplateId=state.templates[0]?.id||null;persistActiveTemplate()}
    fillTemplates();autoBind();syncBridge();renderPreview(false)
  });

  await refresh();
  try{state.sdk?.base?.onSelectionChange?.(()=>refresh())}catch(err){console.warn("selection listener unavailable",err)}
  setInterval(()=>{if(document.visibilityState==="visible")refresh()},20000);
}
init().catch(err=>{console.error(err);showCompat("超级打印初始化失败。请尝试重新连接，或在新窗口中打开。","error="+(err?.stack||err?.message||String(err))) });
