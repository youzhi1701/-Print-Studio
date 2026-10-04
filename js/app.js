import {state} from "./state.js";
import {connectFeishu,readContext,readSelectedRecords,chooseRecords,resolveAttachmentUrls} from "./feishu.js";
import {loadTemplates,saveTemplates,exportTemplate,autoBindTemplateFields} from "./templates.js";
import {writeBridge,openDesigner} from "./bridge.js";
import {renderTemplateToHtml,hydrateCodes} from "./renderer.js";

const $=id=>document.getElementById(id);
let toastTimer,refreshing=false,currentIndex=0;

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

function fitPreview(){
  const viewport=$("previewViewport"),host=$("previewHost"),sheet=host.querySelector(".print-sheet");
  if(!viewport||!sheet)return;
  // Chrome supports CSS zoom and, unlike transform:scale(), it participates in layout.
  // That keeps the physical sheet centered instead of visually scaling a large off-center box.
  host.style.transform="none";
  host.style.zoom="1";
  host.style.width="auto";
  host.style.height="auto";
  const sw=sheet.offsetWidth,sh=sheet.offsetHeight;
  const sx=(viewport.clientWidth-12)/Math.max(1,sw);
  const sy=(viewport.clientHeight-12)/Math.max(1,sh);
  const scale=Math.max(.2,Math.min(sx,sy,1.15));
  host.style.zoom=String(scale);
}

function syncBridge(){
  writeBridge({fields:state.fields,record:activeRecord(),selection:state.selection,selectedRecords:state.selectedRecords});
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
    const rows=await chooseRecords(state.sdk,state.table,state.fields,state.selection);
    if(!rows.length){toast("没有选择记录");return}
    state.selectedRecords=single?[rows[0]]:rows;
    state.record=state.selectedRecords[0];
    currentIndex=0;autoBind();syncBridge();await renderPreview();
    toast(single?"已选择记录":("已选择 "+state.selectedRecords.length+" 条记录"));
  }catch(err){console.error(err);toast("选择记录失败")}
}

function printRecords(records){
  const tpl=activeTemplate();if(!tpl)return;
  const host=document.createElement("div");host.className="print-host";host.style.cssText="position:fixed;inset:0;z-index:9999;background:#fff;overflow:auto";
  host.innerHTML=records.map(r=>renderTemplateToHtml(tpl,r.data||{})).join("");
  document.body.appendChild(host);
  hydrateCodes(host).finally(()=>setTimeout(()=>{window.print();host.remove()},150));
}

function openPreviewModal(){
  const rec=activeRecord(),tpl=activeTemplate();if(!rec||!tpl){toast("请先选择记录");return}
  const body=$("previewModalBody");body.innerHTML=renderTemplateToHtml(tpl,rec.data||{});
  $("previewModal").classList.remove("hidden");
  hydrateCodes(body);
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

  $("zoomPreviewBtn").onclick=openPreviewModal;$("previewViewport").onclick=openPreviewModal;$("closePreviewModal").onclick=()=>$("previewModal").classList.add("hidden");
  $("previewModal").onclick=e=>{if(e.target===$("previewModal"))$("previewModal").classList.add("hidden")};

  $("moreBtn").onclick=e=>{e.stopPropagation();const m=$("moreMenu");m.classList.toggle("hidden");const r=$("moreBtn").getBoundingClientRect();m.style.top=(r.bottom+5)+"px";m.style.right="12px"};
  document.addEventListener("click",e=>{if(!e.target.closest("#moreMenu")&&!e.target.closest("#moreBtn"))$("moreMenu").classList.add("hidden")});
  $("refreshData").onclick=refresh;$("chooseOne").onclick=()=>chooseBatch(true);$("exportTemplate").onclick=()=>exportTemplate(activeTemplate());

  window.addEventListener("resize",()=>{clearTimeout(window.__previewResize);window.__previewResize=setTimeout(fitPreview,80)});
  window.addEventListener("focus",()=>{state.templates=loadTemplates();fillTemplates();autoBind();renderPreview()});

  await refresh();
  try{state.sdk?.base?.onSelectionChange?.(()=>refresh())}catch(err){console.warn("selection listener unavailable",err)}
  setInterval(refresh,5000);
}
init();