import {mountBuildVersion} from "./version.js?v=20261006-11";
import {state,storageAvailable,storageMode,storageGet,storageSet,safeJson,STORAGE_KEYS} from "./state.js?v=20261006-11";
import {connectFeishu,readContext,readSelectedRecords,chooseRecords,resolveAttachmentUrls,resolveAttachmentUrlsForRecords,readFeishuIdentity} from "./feishu.js?v=20261006-11";
import {loadTemplates,saveTemplates,exportTemplate,importTemplateObject,autoBindTemplateFields,isBuiltinTemplate} from "./templates.js?v=20261006-11";
import {writeBridge,openDesigner,openPreviewWindow,bridgeTargetOrigin} from "./bridge.js?v=20261006-11";
import {renderTemplateToHtml,hydrateCodes,applyTemplateCalibration} from "./renderer.js?v=20261006-11";
import {printTemplateRecords} from "./print.js?v=20261006-11";
import {syncTemplatesWithCloud,upsertCloudTemplate,deleteCloudTemplate} from "./private-cloud.js?v=20261006-11";
import {restoreAccount,loginWithFeishuIdentity,loginWithPhone,clearAccountSession,getAccountProfile,hasAccountSession,getAccountHealth} from "./account.js?v=20261006-11";

mountBuildVersion();
const $=id=>document.getElementById(id);
let toastTimer,refreshing=false,currentIndex=0,lastPreviewKey="";let previewScale=1,previewFitScale=1,previewPanX=0,previewPanY=0,previewPanning=false,previewPointer=null;let cloudSyncBusy=false,lastCloudSyncAt=0;const cloudSaveTimers=new Map();let cloudOperation=Promise.resolve();const failedImageSources=new Map();let templateLibraryQuery="",templateLibraryCategory="全部",templateLibraryScope="mine";let templateThumbObserver=null;const templateThumbCache=new Map();let templateSearchTimer=null;

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
function escHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
const TEMPLATE_SAMPLE_IMAGE="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="140"><rect width="180" height="140" fill="#eef1f5"/><rect x="18" y="18" width="144" height="104" rx="10" fill="#d8dee8"/><path d="M42 96l28-28 18 18 20-25 30 35z" fill="#aab5c5"/><circle cx="64" cy="51" r="12" fill="#b8c3d2"/></svg>');
const TEMPLATE_SAMPLE_DATA={
  "订单编号":"SP202610060001","收件人":"示例客户","手机号":"138****8888","收货地址":"示例省示例市示例区 XX 路 88 号",
  "商品名称":"示例商品","商品属性":"标准规格","数量":"2","价格":"99.00","产品图片":TEMPLATE_SAMPLE_IMAGE,
  "SKU编码":"SKU-001","条码值":"6901234567892","运单号":"YT1234567890","备注":"示例备注","总金额":"198.00","重量":"1.2kg","批次号":"LOT-001"
};
function templateSearchText(t){
  return [t.name,t.category,t.description,...(t.tags||[]),t.page?.width+"x"+t.page?.height].filter(Boolean).join(" ").toLowerCase();
}
function scopeTemplates(){
  return state.templates.filter(t=>templateLibraryScope==="builtin"?isBuiltinTemplate(t):!isBuiltinTemplate(t));
}
function filteredTemplates(){
  const q=templateLibraryQuery.trim().toLowerCase();
  return scopeTemplates().filter(t=>{
    if(templateLibraryCategory!=="全部"&&String(t.category||"其他")!==templateLibraryCategory)return false;
    return !q||templateSearchText(t).includes(q);
  });
}
function populateTemplateCategories(){
  const select=$("templateCategoryFilter");if(!select)return;
  const current=templateLibraryCategory;
  const cats=[...new Set(scopeTemplates().map(t=>String(t.category||"其他")))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
  select.innerHTML='<option value="全部">全部分类</option>'+cats.map(x=>'<option value="'+escHtml(x)+'">'+escHtml(x)+'</option>').join("");
  select.value=cats.includes(current)?current:"全部";
  templateLibraryCategory=select.value;
}
function thumbnailCacheKey(tpl){return String(tpl?.id||"")+"@"+String(tpl?.updatedAt||0)}
async function renderOneTemplateThumbnail(host){
  if(!host||host.dataset.rendered==="1")return;
  const tpl=state.templates.find(t=>String(t.id)===host.dataset.templateId);if(!tpl)return;
  const key=thumbnailCacheKey(tpl);
  const cached=templateThumbCache.get(key);
  host.innerHTML=cached||renderTemplateToHtml(tpl,TEMPLATE_SAMPLE_DATA);
  try{await hydrateCodes(host)}catch{}
  const stage=host.parentElement,sheet=host.querySelector(".print-sheet");
  if(stage&&sheet){
    const sw=sheet.offsetWidth||1,sh=sheet.offsetHeight||1;
    const scale=Math.min((stage.clientWidth-8)/sw,(stage.clientHeight-8)/sh,1);
    host.style.transform="translate(-50%,-50%) scale("+Math.max(.05,scale)+")";
  }
  host.dataset.rendered="1";
  if(!cached&&!host.querySelector("canvas.qrcode"))templateThumbCache.set(key,host.innerHTML);
}
function renderTemplateThumbnails(){
  const list=$("templateLibraryList");if(!list)return;
  templateThumbObserver?.disconnect?.();
  const jobs=[...list.querySelectorAll(".template-thumb-inner[data-template-id]")];
  if(!("IntersectionObserver" in window)){
    jobs.forEach(host=>renderOneTemplateThumbnail(host));
    return;
  }
  templateThumbObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      templateThumbObserver.unobserve(entry.target);
      renderOneTemplateThumbnail(entry.target);
    }
  },{root:list,rootMargin:"100px"});
  jobs.forEach(host=>templateThumbObserver.observe(host));
}
function renderTemplateLibrary(){
  const list=$("templateLibraryList"),count=$("templateLibraryCount"),empty=$("templateLibraryEmpty");
  if(!list)return;
  populateTemplateCategories();
  const shown=filteredTemplates();
  const scoped=scopeTemplates();if(count)count.textContent=shown.length===scoped.length?(scoped.length+" 个模板"):(shown.length+" / "+scoped.length);
  list.innerHTML=shown.map(t=>{
    const active=t.id===state.activeTemplateId;
    const size=(Number(t.page?.width)||215)+"×"+(Number(t.page?.height)||140);
    const badge=isBuiltinTemplate(t)?"内置":"自定义";
    return '<button type="button" class="template-library-item'+(active?" active":"")+'" data-template-id="'+escHtml(t.id)+'" title="'+escHtml(t.description||t.name||"")+'">'
      +'<div class="template-thumb"><div class="template-thumb-inner" data-template-id="'+escHtml(t.id)+'"></div></div>'
      +'<span class="template-card-info"><span class="template-card-top"><strong>'+escHtml(t.name||"未命名模板")+'</strong><i class="template-card-badge">'+badge+'</i></span>'
      +'<span class="template-card-meta"><em>'+escHtml(size)+' mm</em><em>'+escHtml(t.category||"其他")+'</em></span>'
      +(t.description?'<span class="template-card-desc">'+escHtml(t.description)+'</span>':"")+'</span></button>';
  }).join("");
  if(empty)empty.classList.toggle("hidden",shown.length>0);
  requestAnimationFrame(renderTemplateThumbnails);
}
function fillTemplates(){
  const tpl=activeTemplate();
  const name=$("currentTemplateName");if(name)name.textContent=tpl?.name||"未选择模板";
  const modal=$("templateLibraryModal");
  if(modal&&!modal.classList.contains("hidden"))renderTemplateLibrary();
}
function updateAccountUi(){
  const user=getAccountProfile(),signed=hasAccountSession();
  const btn=$("accountBtn"),badge=$("accountBadge"),title=$("accountTitle"),sub=$("accountSub"),stateText=$("accountStateText");
  if(btn)btn.classList.toggle("signed-in",signed);
  if(badge)badge.textContent=signed?"我的":"账号";
  if(title)title.textContent=signed?(user?.phoneMasked||"飞书账户"):"未登录";
  if(sub)sub.textContent=signed?"私人模板已按账户隔离":"登录后模板可跨设备同步";
  if(stateText)stateText.textContent=signed?"账户已连接":"等待身份识别";
  if($("feishuIdentityState"))$("feishuIdentityState").textContent=user?.providers?.includes?.("feishu")?"已识别":"未识别";
  if($("accountLogout"))$("accountLogout").hidden=!signed;
  updateCloudState(signed?"私有云":"仅本地",signed?"ok":"warn");
}
async function openAccount(){
  $("accountModal")?.classList.remove("hidden");updateAccountUi();
  const health=await getAccountHealth();
  const stateText=$("accountStateText"),hint=$("phoneLoginHint");
  if(stateText){
    if(!health.sessionConfigured||!health.storageConfigured)stateText.textContent="私有云尚未配置";
    else if(!health.storageReady)stateText.textContent="私有云连接异常";
    else stateText.textContent=hasAccountSession()?"账户已连接":"私有云已就绪";
  }
  if(hint&&!hasAccountSession())hint.textContent="直接输入手机号即可进入对应私人模板库。";
}
function closeAccount(){$("accountModal")?.classList.add("hidden")}
function setTemplateScope(scope){
  templateLibraryScope=scope==="builtin"?"builtin":"mine";
  templateLibraryCategory="全部";
  document.querySelectorAll("[data-template-scope]").forEach(b=>b.classList.toggle("active",b.dataset.templateScope===templateLibraryScope));
  renderTemplateLibrary();
}
function openTemplateLibrary(){
  const modal=$("templateLibraryModal");if(!modal)return;
  templateLibraryScope=isBuiltinTemplate(activeTemplate())?"builtin":"mine";
  document.querySelectorAll("[data-template-scope]").forEach(b=>b.classList.toggle("active",b.dataset.templateScope===templateLibraryScope));
  modal.classList.remove("hidden");
  renderTemplateLibrary();
  requestAnimationFrame(()=>$("templateLibrarySearch")?.focus());
}
function closeTemplateLibrary(){
  $("templateLibraryModal")?.classList.add("hidden");
  templateThumbObserver?.disconnect?.();
}
function persistActiveTemplate(){
  const currentSettings=safeJson(storageGet(STORAGE_KEYS.settings),{})||{};
  storageSet(STORAGE_KEYS.settings,JSON.stringify({...currentSettings,activeTemplateId:state.activeTemplateId||null}));
}
function loadTemplateTombstones(){
  const raw=safeJson(storageGet(STORAGE_KEYS.templateTombstones),[]);
  if(!Array.isArray(raw))return[];
  let migrated=false;
  const list=raw.map(x=>{
    if(typeof x==="string"){migrated=true;return{id:x,deletedAt:Date.now()}}
    if(x&&typeof x==="object"&&x.id)return{id:String(x.id),deletedAt:Number(x.deletedAt)||Date.now()};
    return null
  }).filter(Boolean);
  if(migrated)saveTemplateTombstones(list);
  return list;
}
function saveTemplateTombstones(items){
  const map=new Map();
  for(const x of items||[])if(x?.id)map.set(String(x.id),{id:String(x.id),deletedAt:Number(x.deletedAt)||Date.now()});
  storageSet(STORAGE_KEYS.templateTombstones,JSON.stringify([...map.values()]));
}
function markTemplateDeleted(id,deletedAt=Date.now()){
  const items=loadTemplateTombstones(),i=items.findIndex(x=>x.id===String(id));
  const item={id:String(id),deletedAt:Number(deletedAt)||Date.now()};
  if(i>=0)items[i]=item;else items.push(item);saveTemplateTombstones(items);
}
function clearTemplateDeleted(id){
  saveTemplateTombstones(loadTemplateTombstones().filter(x=>x.id!==String(id)));
}
function updateCloudState(text,stateName=""){
  const n=$("templateLibraryState");if(!n)return;
  n.textContent=text;n.dataset.state=stateName;
}
function runCloudOperation(task){
  const op=cloudOperation.then(task,task);
  cloudOperation=op.catch(()=>{});
  return op;
}
function queueCloudTemplateSave(template){
  if(!hasAccountSession()||!template?.id||isBuiltinTemplate(template))return;
  const snapshot=structuredClone(template);
  clearTimeout(cloudSaveTimers.get(snapshot.id));
  cloudSaveTimers.set(snapshot.id,setTimeout(async()=>{
    cloudSaveTimers.delete(snapshot.id);
    try{
      const result=await runCloudOperation(()=>upsertCloudTemplate(null,snapshot));
      if(result?.reason){
        updateCloudState("云端版本较新","warn");
        setTimeout(()=>syncCloudTemplates(true),0);
      }else{
        clearTemplateDeleted(snapshot.id);
        updateCloudState("云端已保存","ok");
      }
    }catch(err){
      updateCloudState("云端待同步","warn");
      console.warn("云端模板自动保存失败",err);
    }
  },900));
}
async function syncCloudTemplates(force=false){
  if(!hasAccountSession()||cloudSyncBusy){updateCloudState("仅本地","warn");return null;}
  if(!force&&Date.now()-lastCloudSyncAt<60000)return null;
  cloudSyncBusy=true;
  const syncBtn=$("templateLibrarySync");if(syncBtn)syncBtn.disabled=true;
  updateCloudState("同步中…","busy");
  try{
    const previous=state.activeTemplateId;
    const result=await runCloudOperation(()=>syncTemplatesWithCloud(null,state.templates,loadTemplateTombstones()));
    state.templates=result.templates;
    templateThumbCache.clear();
    saveTemplates(state.templates);
    for(const id of result.clearedDeletedIds||[])clearTemplateDeleted(id);
    state.activeTemplateId=state.templates.some(t=>t.id===previous)?previous:(state.templates[0]?.id||null);
    persistActiveTemplate();fillTemplates();
    lastCloudSyncAt=Date.now();
    updateCloudState("云端已同步","ok");
    if(result.uploaded||result.downloaded||result.removedLocal)toast("云端模板已同步 · 上传 "+result.uploaded+" / 下载 "+result.downloaded+(result.removedLocal?(" / 删除同步 "+result.removedLocal):""));
    return result;
  }catch(err){
    updateCloudState("云端同步失败","error");
    console.warn("云端模板同步失败",err);
    return null;
  }finally{
    cloudSyncBusy=false;
    if(syncBtn)syncBtn.disabled=false;
  }
}
function autoBind(){
  const tpl=activeTemplate();if(!tpl)return false;
  const changed=autoBindTemplateFields(tpl,state.fields);
  if(changed){
    tpl.updatedAt=Date.now();
    saveTemplates(state.templates);
    queueCloudTemplateSave(tpl);
  }
  return changed;
}

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
  applyTemplateCalibration(host,tpl);
  armPreviewImageRecovery(host,rec);
  await hydrateCodes(host);
  requestAnimationFrame(fitPreview);
}

async function recoverPreviewImage(rec,src){
  if(!rec||!state.table||!state.fields.length)return;
  const key=String(src||"");
  const last=failedImageSources.get(key)||0;
  if(key&&Date.now()-last<30000)return;
  if(key)failedImageSources.set(key,Date.now());
  try{
    const fresh=await resolveAttachmentUrls(state.table,rec,state.fields,{force:true});
    if(!fresh)return;
    state.selectedRecords=state.selectedRecords.map(r=>r.id===fresh.id?fresh:r);
    if(state.record?.id===fresh.id)state.record=fresh;
    syncBridge();
    await renderPreview(true);
  }catch(err){console.warn("图片自动恢复失败",err)}
}
function armPreviewImageRecovery(host,rec){
  for(const img of host?.querySelectorAll?.("img")||[]){
    img.addEventListener("error",()=>recoverPreviewImage(rec,img.currentSrc||img.src),{once:true});
  }
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
    try{
      const identity=await readFeishuIdentity(c.bitable);
      if(identity)await loginWithFeishuIdentity(identity);
      updateAccountUi();
    }catch(err){console.warn("飞书身份自动识别失败",err);updateAccountUi()}
    const ctx=await readContext(c.bitable);
    state.selection=ctx.selection;state.table=ctx.table;state.fields=ctx.fields;
    await syncCloudTemplates(false);
    state.record=ctx.record?await resolveAttachmentUrls(ctx.table,ctx.record,ctx.fields):null;
    state.selectedRecords=await readSelectedRecords(c.bitable,ctx.table,ctx.fields);
    state.selectedRecords=await resolveAttachmentUrlsForRecords(ctx.table,state.selectedRecords,ctx.fields);
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
    rows=await resolveAttachmentUrlsForRecords(state.table,rows,state.fields);
    state.selectedRecords=single?[rows[0]]:rows;
    state.record=state.selectedRecords[0];
    currentIndex=0;autoBind();syncBridge();await renderPreview();
    toast(single?"已选择记录":("已选择 "+state.selectedRecords.length+" 条记录"));
  }catch(err){console.error(err);toast("选择记录失败")}
}

async function printRecords(records){
  const tpl=activeTemplate();if(!tpl)return;
  let list=(Array.isArray(records)?records:[records]).filter(Boolean);
  if(!list.length)return;
  try{
    if(state.connected&&state.table&&state.fields.length){
      $("statusText").textContent="正在检查打印图片";
      list=await resolveAttachmentUrlsForRecords(state.table,list,state.fields,{force:true});
      const freshById=new Map(list.map(r=>[r.id,r]));
      state.selectedRecords=state.selectedRecords.map(r=>freshById.get(r.id)||r);
      if(state.record?.id&&freshById.has(state.record.id))state.record=freshById.get(state.record.id);
      syncBridge();
    }
    await printTemplateRecords(tpl,list);
    $("statusText").textContent="已发送到打印";
  }catch(err){
    console.error(err);$("statusText").textContent="打印准备失败";toast(err?.message||"打印失败");
  }
}
async function applyDesignerTemplate(template){
  if(!template?.id)return;
  const i=state.templates.findIndex(t=>t.id===template.id);
  if(i>=0)state.templates[i]=structuredClone(template);else state.templates.push(structuredClone(template));
  state.activeTemplateId=template.id;persistActiveTemplate();
  saveTemplates(state.templates);
  templateThumbCache.clear();
  fillTemplates();
  queueCloudTemplateSave(template);
  autoBind();
  syncBridge();
  await renderPreview();
  toast("模板已同步");
}

async function init(){
  if($("compatRetry"))$("compatRetry").onclick=()=>refresh();
  if($("compatOpen"))$("compatOpen").onclick=()=>window.open(location.href,"_blank","noopener");
  if($("compatCopy"))$("compatCopy").onclick=async()=>{try{await navigator.clipboard.writeText($("compatDetails")?.textContent||compatInfo());toast("诊断信息已复制")}catch{toast("复制失败，请手动复制")}};

  await restoreAccount();
  updateAccountUi();
  state.templates=loadTemplates();
  const settings=safeJson(storageGet(STORAGE_KEYS.settings),{})||{};
  state.activeTemplateId=state.templates.some(t=>t.id===settings.activeTemplateId)?settings.activeTemplateId:(state.templates[0]?.id||null);
  fillTemplates();
  if(hasAccountSession())await syncCloudTemplates(true);

  $("templateLibraryList")?.addEventListener("click",async e=>{
    const item=e.target.closest("[data-template-id]");if(!item)return;
    state.activeTemplateId=item.dataset.templateId;persistActiveTemplate();autoBind();syncBridge();await renderPreview(true);
    closeTemplateLibrary();fillTemplates();
  });
  if($("templateLibrarySearch"))$("templateLibrarySearch").oninput=e=>{templateLibraryQuery=e.target.value||"";clearTimeout(templateSearchTimer);templateSearchTimer=setTimeout(renderTemplateLibrary,120)};
  if($("templateCategoryFilter"))$("templateCategoryFilter").onchange=e=>{templateLibraryCategory=e.target.value||"全部";renderTemplateLibrary()};
  if($("templateLibrarySync"))$("templateLibrarySync").onclick=async()=>{const r=await syncCloudTemplates(true);if(r)renderTemplateLibrary();else toast(hasAccountSession()?"模板库同步失败":"请先登录账户")};
  document.querySelectorAll("[data-template-scope]").forEach(b=>b.onclick=()=>setTemplateScope(b.dataset.templateScope));
  $("accountBtn").onclick=openAccount;
  $("accountClose").onclick=closeAccount;
  $("accountModal").addEventListener("click",e=>{if(e.target===$("accountModal"))closeAccount()});
  $("phoneLoginBtn").onclick=async()=>{
    const phone=$("accountPhone").value.trim(),hint=$("phoneLoginHint");
    hint.textContent="正在进入手机号模板库…";
    try{
      await loginWithPhone(phone);updateAccountUi();hint.textContent="已进入该手机号的私人模板库";
      await syncCloudTemplates(true);fillTemplates();toast("手机号账户已切换，私人模板已同步");
    }catch(err){hint.textContent=err.message;toast(err.message)}
  };
  $("accountSyncNow").onclick=async()=>{const r=await syncCloudTemplates(true);updateAccountUi();if(r){fillTemplates();toast("私人模板已同步")}else toast("请先登录账户")};
  $("accountLogout").onclick=()=>{clearAccountSession();updateAccountUi();closeAccount();toast("已退出本机账号，模板保留在本地")};
  $("templateChooser").onclick=openTemplateLibrary;
  $("templateLibraryClose").onclick=closeTemplateLibrary;
  $("templateLibraryModal").addEventListener("click",e=>{if(e.target===$("templateLibraryModal"))closeTemplateLibrary()});
  $("recordChooser").onclick=()=>chooseBatch(true);
  $("chooseBatch").onclick=()=>chooseBatch(false);
  $("prevRecord").onclick=async()=>{if(currentIndex>0){currentIndex--;syncBridge();await renderPreview()}};
  $("nextRecord").onclick=async()=>{if(currentIndex<state.selectedRecords.length-1){currentIndex++;syncBridge();await renderPreview()}};
  $("printCurrent").onclick=()=>{const records=state.selectedRecords.length>1?state.selectedRecords:(activeRecord()?[activeRecord()]:[]);records.length?printRecords(records):toast("请先选择记录")};

  const openDesignerAction=()=>{
    let tpl=activeTemplate();if(!tpl)return;
    if(isBuiltinTemplate(tpl)){
      const copy=importTemplateObject(tpl,state.templates);
      copy.name=(tpl.name||"模板")+" · 自定义";
      copy.category="自定义";copy.status="draft";copy.builtIn=false;copy.updatedAt=Date.now();
      state.templates.push(copy);state.activeTemplateId=copy.id;
      persistActiveTemplate();saveTemplates(state.templates);fillTemplates();queueCloudTemplateSave(copy);
      tpl=copy;toast("已创建可编辑副本");
    }
    syncBridge();
    const w=openDesigner(tpl.id);
    if(!w)toast("浏览器拦截了设计器窗口，请允许弹出窗口后重试");
  };
  $("openDesigner").onclick=openDesignerAction;

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
  document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("templateLibraryModal").classList.contains("hidden"))closeTemplateLibrary();if(!$("accountModal").classList.contains("hidden"))closeAccount()});
  $("refreshData").onclick=refresh;$("exportTemplate").onclick=()=>exportTemplate(activeTemplate());
  $("importTemplate").onclick=()=>$("importTemplateFile").click();
  $("importTemplateFile").onchange=async e=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      const tpl=importTemplateObject(parsed,state.templates);
      state.templates.push(tpl);state.activeTemplateId=tpl.id;
      templateThumbCache.clear();persistActiveTemplate();saveTemplates(state.templates);queueCloudTemplateSave(tpl);autoBind();syncBridge();await renderPreview(true);fillTemplates();if(!$("templateLibraryModal").classList.contains("hidden"))renderTemplateLibrary();
      toast("模板已导入并加入云端同步");
    }catch(err){console.error(err);toast(err?.message||"模板导入失败")}
  };
  $("deleteTemplate").onclick=async()=>{
    const tpl=activeTemplate();if(!tpl)return;
    if(isBuiltinTemplate(tpl)){toast("内置模板不可删除，可在设计器中复制后修改");return}
    if(state.templates.length<=1){toast("至少保留一个模板");return}
    const deletedAt=Date.now();
    markTemplateDeleted(tpl.id,deletedAt);
    clearTimeout(cloudSaveTimers.get(tpl.id));cloudSaveTimers.delete(tpl.id);
    state.templates=state.templates.filter(t=>t.id!==tpl.id);templateThumbCache.clear();
    state.activeTemplateId=state.templates[0]?.id||null;persistActiveTemplate();saveTemplates(state.templates);syncBridge();await renderPreview(true);fillTemplates();if(!$("templateLibraryModal").classList.contains("hidden"))renderTemplateLibrary();
    if(hasAccountSession()){
      try{
        const result=await runCloudOperation(()=>deleteCloudTemplate(null,tpl.id,deletedAt));
        if(result?.deleted)clearTemplateDeleted(tpl.id);
        updateCloudState("云端已同步","ok");
      }catch(err){
        updateCloudState("删除待同步","warn");
        console.warn("云端模板删除失败，已保留待同步删除标记",err);
      }
    }
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
    const origin=bridgeTargetOrigin();
    if(origin!=="*"&&e.origin!==origin)return;
    if(e.data?.type==="SUPER_PRINT_TEMPLATE_SAVE"&&e.data.template)applyDesignerTemplate(e.data.template);
    if(e.data?.type==="SUPER_PRINT_REFRESH_IMAGES"){
      const id=String(e.data.recordId||activeRecord()?.id||"");
      const rec=state.selectedRecords.find(r=>String(r.id)===id)||((state.record&&String(state.record.id)===id)?state.record:activeRecord());
      if(rec)recoverPreviewImage(rec,"child:"+id);
    }
  });
  window.addEventListener("focus",()=>{
    state.templates=loadTemplates();
    if(!state.templates.some(t=>t.id===state.activeTemplateId)){state.activeTemplateId=state.templates[0]?.id||null;persistActiveTemplate()}
    fillTemplates();autoBind();syncBridge();renderPreview(false)
  });

  await refresh();
  try{state.sdk?.base?.onSelectionChange?.(()=>refresh())}catch(err){console.warn("selection listener unavailable",err)}
  window.addEventListener("online",()=>refresh());
  window.addEventListener("offline",()=>{status("离线模式","warn");$("statusText").textContent="网络已断开";updateCloudState("离线","warn")});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastCloudSyncAt>30000)refresh()});
  setInterval(()=>{if(document.visibilityState==="visible")refresh()},60000);
}
init().catch(err=>{console.error(err);showCompat("超级打印初始化失败。请尝试重新连接，或在新窗口中打开。","error="+(err?.stack||err?.message||String(err))) });
