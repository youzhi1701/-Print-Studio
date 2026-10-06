import {mountBuildVersion} from "./version.js?v=20261006-21";
import {state,uid,STORAGE_KEYS} from "./state.js?v=20261006-21";import {loadTemplates,saveTemplates,createTemplate,autoBindTemplateFields,isBuiltinTemplate} from "./templates.js?v=20261006-21";import {readBridge,requestBridgeFromOpener,onBridgeMessage,bridgeTargetOrigin,requestImageRefresh} from "./bridge.js?v=20261006-21";import {renderTemplateToHtml,renderElementToHtml,renderTableMarkup,hydrateCodes,applyTemplateCalibration} from "./renderer.js?v=20261006-21";import {printTemplateRecords} from "./print.js?v=20261006-21";import {upsertCloudTemplate,deleteCloudTemplate} from "./private-cloud.js?v=20261006-21";import {hasAccountSession} from "./account.js?v=20261006-21";import {
  ensureTableModel,materializeTableRows,normalizeTableColumns as tmNormalizeColumns,
  mergeForCell as tmMergeForCell,isCoveredCell as tmIsCoveredCell,
  mergeVisualRange,unmergeVisualRange,insertManualRow,deleteVisualRows,
  insertColumn as tmInsertColumn,deleteColumns as tmDeleteColumns,
  getCellOverride as tmGetCellOverride,setCellOverride as tmSetCellOverride,cellValue as tmCellValue,rowHeight as tmRowHeight,
  buildTableLayout,normalizeMergeContiguity
} from "./table-model.js?v=20261006-21";
mountBuildVersion();
const MM=96/25.4,$=id=>document.getElementById(id);let selected=new Set(),selectedCells=[],tableSelectionAnchor=null,tableSelecting=false,tableClipboard=null,elementClipboard=[],zoom=75,zoomMode="fit",grid=true,snap=true,preview=false,history=[],hIndex=-1,dragType=null,toastTimer,saveTimer=null,nudgeTimer=null,lastBridgeIdentity="",lastEditStamp=0;
function toast(m){const n=$("toast");n.textContent=m;n.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove("show"),1500)}
function current(){return state.templates.find(t=>t.id===state.activeTemplateId)}
function clearTableSelection(){selectedCells=[];tableSelectionAnchor=null;tableSelecting=false}
function selectElements(ids,{keepTable=false}={}){
  selected=new Set(Array.isArray(ids)?ids:[ids].filter(Boolean));
  if(!keepTable)clearTableSelection();
}
function refreshSelectionVisuals(previous=new Set()){
  const ids=new Set([...previous,...selected]);
  for(const id of ids){const e=current()?.elements?.find(x=>x.id===id);if(e)refreshElementNode(e)}
  renderLayers();syncProps()
}
function nextEditTimestamp(t=current()){
  const stamp=Math.max(Date.now(),Number(t?.updatedAt||0)+1,lastEditStamp+1);
  lastEditStamp=stamp;return stamp
}
function markTemplateEdited(t=current()){if(!t)return 0;t.updatedAt=nextEditTimestamp(t);return t.updatedAt}
function historySnapshot(t){
  const copy=structuredClone(t);delete copy.updatedAt;
  return JSON.stringify(copy)
}
function pushHistory(){const t=current();if(!t)return;const snap=historySnapshot(t);if(history[hIndex]===snap){updateUndo();return}history=history.slice(0,hIndex+1);history.push(snap);if(history.length>60)history.shift();hIndex=history.length-1;updateUndo()}
function commitEdit({immediate=false,recordHistory=true}={}){if(recordHistory)pushHistory();autoSave(immediate)}
function flushNudge(){if(nudgeTimer){clearTimeout(nudgeTimer);nudgeTimer=null;commitEdit()}}
function restore(i){
  flushNudge();if(i<0||i>=history.length)return;
  const old=current(),parsed=JSON.parse(history[i]),idx=state.templates.findIndex(t=>t.id===old.id);
  parsed.updatedAt=nextEditTimestamp(old);state.templates[idx]=parsed;hIndex=i;clearTableSelection();renderAll();updateUndo();autoSave(true)
}
function updateUndo(){$("undoBtn").disabled=hIndex<=0;$("redoBtn").disabled=hIndex>=history.length-1}
async function load(){state.templates=loadTemplates();const qs=new URLSearchParams(location.search).get("template");state.activeTemplateId=(qs&&state.templates.some(t=>t.id===qs))?qs:state.templates[0]?.id;const payload=await requestBridgeFromOpener();syncBridgeData(false,payload);renderAll();pushHistory()}
function populateFields(){
  const list=$("fieldList");
  const selects=["propField","imageField","codeField","tableDataField","tableCellField"].map(id=>$(id)).filter(Boolean);
  list.innerHTML="";
  for(const sel of selects){
    const keep=sel.value;
    sel.innerHTML=sel.id==="tableDataField"?'<option value="">当前记录（单行）</option>':'<option value="">未绑定</option>';
    sel.dataset.keep=keep||"";
  }
  if(!state.fields.length){
    const empty=document.createElement("div");
    empty.className="field-item";
    empty.innerHTML="<b>未读取到飞书字段</b><small>请回到快捷模式选择记录后重新同步</small>";
    list.appendChild(empty);
  }
  for(const f of state.fields){
    const item=document.createElement("div");
    item.className="field-item";item.draggable=true;item.dataset.field=f.name;
    item.innerHTML="<b></b><small></small>";
    item.children[0].textContent=f.name;item.children[1].textContent="字段类型 "+f.type;
    item.addEventListener("dragstart",e=>{dragType="field:"+f.name;e.dataTransfer.setData("text/plain",dragType)});
    item.addEventListener("dblclick",()=>addElement("field",30,30,f.name));
    list.appendChild(item);
    for(const sel of selects){
      const o=document.createElement("option");o.value=f.name;o.textContent=f.name;sel.appendChild(o);
    }
  }
  for(const sel of selects){
    if([...sel.options].some(o=>o.value===sel.dataset.keep))sel.value=sel.dataset.keep;
    delete sel.dataset.keep;
  }
}
function bridgeIdentity(bridge){
  try{return JSON.stringify({
    fields:(bridge?.fields||[]).map(f=>[f.id,f.name,f.type]),
    record:[bridge?.record?.id||"",bridge?.record?.data||{},bridge?.record?.attachments||{}],
    selected:(bridge?.selectedRecords||[]).map(r=>[r.id,r.data||{},r.attachments||{}]),
    template:[
      bridge?.template?.id||bridge?.activeTemplateId||"",
      bridge?.template?.updatedAt||0,
      bridge?.template?.page||{},
      bridge?.template?.elements||[]
    ]
  })}catch{return String(Date.now())}
}
function syncBridgeData(showToast=true,provided=null,{force=false}={}){
  const bridge=provided||readBridge();
  const identity=bridgeIdentity(bridge);
  if(!force&&identity===lastBridgeIdentity){
    if(showToast)toast("数据已经是最新状态");
    return{updated:false,templateChanged:false}
  }
  lastBridgeIdentity=identity;
  state.fields=bridge?.fields||[];
  state.record=bridge?.record||null;
  state.selectedRecords=bridge?.selectedRecords||[];
  let templateChanged=false;
  if(bridge?.template?.id){
    const incoming=structuredClone(bridge.template);
    const i=state.templates.findIndex(t=>t.id===incoming.id);
    if(i<0){
      state.templates.push(incoming);
      templateChanged=true;
    }else{
      const local=state.templates[i];
      const incomingNewer=Number(incoming.updatedAt||0)>Number(local?.updatedAt||0);
      if(incomingNewer){
        state.templates[i]=incoming;
        templateChanged=true;
      }
    }
    if(state.activeTemplateId!==incoming.id){
      state.activeTemplateId=incoming.id;
      templateChanged=true;
    }
    if(templateChanged){
      saveTemplates(state.templates);
      history=[];hIndex=-1;selected.clear();clearTableSelection();
    }
  }
  populateFields();
  const bound=autoBindTemplateFields(current(),state.fields);
  if(bound){
    const t=current();if(t)markTemplateEdited(t);
    saveTemplates(state.templates);
  }
  if(templateChanged)pushHistory();
  const label=$("dataSyncState");
  if(label)label.textContent=state.fields.length?("已识别 "+state.fields.length+" 个字段"+(state.record?" · 已载入当前记录":"")):"未读取到飞书字段";
  if(showToast)toast(state.fields.length?("已同步 "+state.fields.length+" 个字段"):"未读取到字段，请先在快捷模式选择记录");
  return{updated:true,templateChanged,bound}
}
function autoBindNow(){
  const changed=autoBindTemplateFields(current(),state.fields);
  if(changed){renderAll();commitEdit({immediate:true});toast("已按字段名称自动绑定")}else{toast(state.fields.length?"当前字段已完成匹配":"没有可绑定的飞书字段")}
}
function updateTemplateActionState(){
  const t=current();
  if(!t)return;
  const builtIn=isBuiltinTemplate(t);
  const addBtn=$("addToMineBtn"),saveBtn=$("saveTemplateBtn"),saveAsBtn=$("saveAsTemplateBtn"),deleteBtn=$("deleteTemplateBtn");
  if(addBtn){
    addBtn.classList.toggle("hidden",!builtIn);
    addBtn.disabled=!builtIn;
  }
  if(saveBtn){
    saveBtn.disabled=builtIn;
    saveBtn.title=builtIn?"内置模板请先添加到我的模板库":"保存当前修改";
  }
  if(saveAsBtn)saveAsBtn.disabled=false;
  if(deleteBtn){
    deleteBtn.disabled=builtIn;
    deleteBtn.title=builtIn?"内置模板不能删除":"删除当前私人模板";
  }
}
async function saveCurrentTemplateToCloud({announce=true}={}){
  const t=current();if(!t)return false;
  if(isBuiltinTemplate(t)){if(announce)toast("内置模板请先添加到我的模板库");return false}
  autoSave(true);
  if(!hasAccountSession()){
    if(announce)toast("已保存到本机；登录手机号后可同步私人模板库");
    return true
  }
  try{
    const result=await upsertCloudTemplate(null,structuredClone(t));
    if(result?.skipped){
      if(announce)toast("云端版本较新，请返回模板库同步后再试");
      return false
    }
    if(announce)toast("已保存到我的模板库");
    return true
  }catch(err){
    console.warn("save private template failed",err);
    if(announce)toast(err?.message||"私人模板保存失败");
    return false
  }
}
async function addCurrentToMyLibrary(){
  const src=current();if(!src)return;
  if(!isBuiltinTemplate(src)){toast("当前模板已经在我的模板库");return}
  const copy=structuredClone(src);
  copy.id=uid("tpl");
  copy.builtIn=false;
  copy.status="draft";
  copy.category=copy.category||"自定义";
  copy.name=String(src.name||"模板")+"（我的）";
  copy.createdAt=Date.now();
  copy.updatedAt=Date.now();
  state.templates.push(copy);
  state.activeTemplateId=copy.id;
  history=[];hIndex=-1;selected.clear();clearTableSelection();
  saveTemplates(state.templates);
  window.history.replaceState(null,"",new URL(location.href).toString().replace(/([?&])template=[^&]*/,(m,p)=>p+"template="+encodeURIComponent(copy.id)));
  renderAll();pushHistory();
  const ok=await saveCurrentTemplateToCloud({announce:false});
  toast(ok?"已添加到我的模板库":"已复制为私人模板，云端同步待重试");
}
async function saveAsTemplate(){
  const src=current();if(!src)return;
  const suggested=(String(src.name||"模板").replace(/（副本\d*）$/,"")||"模板")+"（副本）";
  const name=window.prompt("另存为模板名称",suggested);
  if(name===null)return;
  const copy=structuredClone(src);
  copy.id=uid("tpl");
  copy.builtIn=false;
  copy.status="draft";
  copy.name=String(name).trim()||suggested;
  copy.createdAt=Date.now();
  copy.updatedAt=Date.now();
  state.templates.push(copy);
  state.activeTemplateId=copy.id;
  history=[];hIndex=-1;selected.clear();clearTableSelection();
  saveTemplates(state.templates);
  const u=new URL(location.href);u.searchParams.set("template",copy.id);window.history.replaceState(null,"",u);
  renderAll();pushHistory();
  await saveCurrentTemplateToCloud({announce:false});
  toast("已另存到我的模板库");
}
async function deleteCurrentTemplate(){
  const t=current();if(!t)return;
  if(isBuiltinTemplate(t)){toast("内置模板不能删除");return}
  if(!window.confirm("确定删除模板「"+(t.name||"未命名模板")+"」吗？删除后将从当前手机号的私人模板库移除。"))return;
  const id=t.id,deletedAt=Date.now();
  state.templates=state.templates.filter(x=>x.id!==id);
  saveTemplates(state.templates);
  if(hasAccountSession()){
    try{await deleteCloudTemplate(null,id,deletedAt)}
    catch(err){console.warn("delete private template failed",err);toast("本机已删除，云端删除失败，请稍后同步")}
  }
  state.activeTemplateId=state.templates[0]?.id||null;
  history=[];hIndex=-1;selected.clear();clearTableSelection();
  if(state.activeTemplateId){const u=new URL(location.href);u.searchParams.set("template",state.activeTemplateId);window.history.replaceState(null,"",u)}
  renderAll();pushHistory();toast("模板已删除");
}
function renderAll(){const t=current();if(!t)return;$("templateName").value=t.name;updateTemplateActionState();$("pageW").value=t.page.width;$("pageH").value=t.page.height;$("safeArea").value=t.page.safeArea??4;$("printOffsetX").value=Number(t.printSettings?.offsetX||0);$("printOffsetY").value=Number(t.printSettings?.offsetY||0);$("printScale").value=Number(t.printSettings?.scale||100);applyPage(false);renderElements();renderLayers();syncProps();$("selectionState").textContent=(t.elements?.length||0)+" 个元素"}
function applyPage(save=true){
  const t=current();if(!t)return;
  const w=Math.max(20,Number($("pageW").value)||215),h=Math.max(20,Number($("pageH").value)||140),safe=Math.max(0,Number($("safeArea").value)||0);
  t.page.width=w;t.page.height=h;t.page.safeArea=safe;
  for(const el of t.elements||[]){if(el.type==="table"&&el.smartLayout!==false)fitTableToPage(el,{resetColumns:false,compact:false});else clampElementToPage(el)}
  const p=$("printPage");p.style.width=w*MM+"px";p.style.height=h*MM+"px";
  const s=$("safeGuide");s.style.inset=safe*MM+"px";$("pageInfo").textContent=w+" × "+h+" mm";drawRulers(w,h);
  if(save){renderElements();commitEdit();if(zoomMode==="fit")requestAnimationFrame(fitCanvas);toast("页面尺寸已更新")}
}
function applyPrintCalibration(){
  const t=current();if(!t)return;
  const scale=Math.max(90,Math.min(110,Number($("printScale").value)||100));
  const offsetX=Math.max(-20,Math.min(20,Number($("printOffsetX").value)||0));
  const offsetY=Math.max(-20,Math.min(20,Number($("printOffsetY").value)||0));
  t.printSettings={...(t.printSettings||{}),scale,offsetX,offsetY};
  commitEdit({immediate:true});
  toast("打印校准已保存");
}
function drawRulers(w,h){const tr=$("topRuler"),lr=$("leftRuler");tr.innerHTML="";lr.innerHTML="";tr.style.width=w*MM+"px";lr.style.height=h*MM+"px";for(let m=0;m<=w;m+=10){const n=document.createElement("span");n.textContent=m;n.style.cssText="position:absolute;left:"+(m*MM)+"px;top:5px";tr.appendChild(n)}for(let m=0;m<=h;m+=10){const n=document.createElement("span");n.textContent=m;n.style.cssText="position:absolute;top:"+(m*MM)+"px;left:3px;transform:rotate(-90deg);transform-origin:left top";lr.appendChild(n)}}
function normalizeColumns(cols){
  const holder={columns:Array.isArray(cols)?cols:[]};
  return tmNormalizeColumns(holder)
}
function elementTypeName(type){
  return({text:"文本",field:"数据字段",image:"图片",table:"明细表格",barcode:"条码",qrcode:"二维码",line:"分隔线",container:"容器"})[type]||type;
}
function smartTableColumnsForPage(pageWidth=215){
  if(pageWidth<=85)return[
    {title:"商品名称",field:"商品名称",width:55,align:"left"},
    {title:"数量",field:"数量",width:17,align:"center"},
    {title:"价格",field:"价格",width:28,align:"right"}
  ];
  if(pageWidth<=130)return[
    {title:"商品名称",field:"商品名称",width:40,align:"left"},
    {title:"商品属性",field:"商品属性",width:30,align:"left"},
    {title:"数量",field:"数量",width:12,align:"center"},
    {title:"价格",field:"价格",width:18,align:"right"}
  ];
  return[
    {title:"商品名称",field:"商品名称",width:44,align:"left"},
    {title:"商品属性",field:"商品属性",width:28,align:"left"},
    {title:"数量",field:"数量",width:12,align:"center"},
    {title:"价格",field:"价格",width:16,align:"right"}
  ]
}
function tableColumnWeight(col){
  const key=String(col?.field||col?.title||"");
  if(/商品名称|产品名称|标题/.test(key))return 5;
  if(/商品属性|规格|型号/.test(key))return 3.2;
  if(/产品图片|商品图片|图片/.test(key))return 2.6;
  if(/数量|件数/.test(key))return 1.45;
  if(/价格|金额|合计|单价/.test(key))return 2;
  return 2.5
}
function applySmartColumnWidths(e){
  const cols=tmNormalizeColumns(e);if(!cols.length)return;
  const weights=cols.map(tableColumnWeight),sum=weights.reduce((a,b)=>a+b,0)||1;
  const minPct=Math.min(18,Math.max(7,700/Math.max(40,Number(e.w)||100)));
  let widths=weights.map(w=>Math.max(minPct,w/sum*100));
  const total=widths.reduce((a,b)=>a+b,0)||100;
  widths=widths.map(w=>w/total*100);
  cols.forEach((c,i)=>c.width=Math.round(widths[i]*10)/10);
  e.columns=cols;e.smartColumns=true
}
function tableOverflowMm(e){
  const page=current()?.page||{height:140,safeArea:4};
  const safe=Math.max(0,Number(page.safeArea)||0);
  return Math.max(0,e.y+elementVisualHeight(e)-(page.height-safe))
}
function fitTableToPage(e,{resetColumns=false,compact=true}={}){
  if(!e||e.type!=="table")return 0;
  const page=current()?.page||{width:215,height:140,safeArea:4};
  const safe=Math.max(0,Number(page.safeArea)||0);
  e.x=safe;e.w=Math.max(20,page.width-safe*2);e.y=Math.max(safe,Number(e.y)||safe);
  if(resetColumns||!Array.isArray(e.columns)||!e.columns.length)e.columns=normalizeColumns(smartTableColumnsForPage(page.width));
  applySmartColumnWidths(e);
  e.autoRowHeight=true;e.wrap=true;e.hideEmptyColumns=true;e.smartLayout=true;
  if(compact){
    const target=page.width<=85?8:page.width<=130?8.5:9;
    e.fontSize=Math.min(Number(e.fontSize)||target,target);
    e.rowHeight=Math.min(Number(e.rowHeight)||8,page.width<=85?6:7.5);
    e.headerHeight=Math.min(Number(e.headerHeight||e.rowHeight||8),page.width<=85?6:7.5);
  }
  let overflow=tableOverflowMm(e);
  while(overflow>.1&&(Number(e.fontSize)||9)>7){
    e.fontSize=(Number(e.fontSize)||9)-.5;
    overflow=tableOverflowMm(e)
  }
  const visual=elementVisualHeight(e);
  e.y=Math.max(safe,Math.min(e.y,Math.max(safe,page.height-safe-visual)));
  return tableOverflowMm(e)
}
function updateTableFitState(e){
  const node=$("tableFitState");if(!node||e?.type!=="table")return;
  const overflow=tableOverflowMm(e);
  node.classList.toggle("warn",overflow>.1);
  node.textContent=overflow>.1?("超出页面 "+overflow.toFixed(1)+" mm · 点击自动适配"):("已适配当前页面 · 高度 "+elementVisualHeight(e).toFixed(1)+" mm")
}
function smartFitSelectedTable(){
  const e=selectedOne();if(!e||e.type!=="table")return;
  fitTableToPage(e,{resetColumns:false,compact:true});
  refreshElementNode(e);renderTableColumnEditor(e);syncProps();commitEdit();toast("已按当前纸张自动适配")
}
function defaults(type,field=""){
  const b={id:uid("el"),type,x:20,y:20,w:45,h:10,text:"",field,fontSize:11,fontWeight:"400",align:"left",locked:false,hidden:false};
  if(type==="text"){b.text="双击或在右侧修改文字";b.w=58;b.h=4.8;b.wrap=true;b.maxLines=0;b.overflowMode="grow";b.autoHeight=true;b.emptyBehavior="blank"}
  if(type==="field"){b.text="{{"+(field||"字段")+"}}";b.field=field;b.w=50;b.h=4.8;b.wrap=true;b.maxLines=0;b.overflowMode="grow";b.autoHeight=true;b.emptyBehavior="hide"}
  if(type==="image"){b.w=30;b.h=25;b.field=field;b.imageFit="contain";b.radius=0;b.aspectLock=true;b.alignX="center";b.alignY="center";b.padding=0;b.emptyBehavior="hide"}
  if(type==="table"){const p=current()?.page||{width:215,safeArea:4};const safe=Math.max(0,Number(p.safeArea)||0);b.w=Math.max(20,p.width-safe*2);b.h=14;b.columns=normalizeColumns(smartTableColumnsForPage(p.width));b.showHeader=true;b.zebra=false;b.rowHeight=p.width<=85?6:7.5;b.headerHeight=b.rowHeight;b.autoRowHeight=true;b.maxRows=5;b.borderWidth=.5;b.fontSize=p.width<=85?8:9;b.dataField="";b.tableImageFit="contain";b.wrap=true;b.hideEmptyColumns=true;b.emptyBehavior="hide";b.smartLayout=true;b.smartColumns=true;b.merges=[];b.rowDefs=[{id:uid("row"),type:"data",height:b.rowHeight}];b.cellMap={};b.tableModelVersion=3}
  if(type==="barcode"){b.w=62;b.h=20;b.field=field||"订单编号";b.showText=true;b.barcodeFormat="CODE128";b.barcodeFontSize=8}
  if(type==="qrcode"){b.w=25;b.h=25;b.field=field||"订单编号";b.qrLevel="M";b.qrMargin=0}
  if(type==="line"){b.w=70;b.h=.5;b.borderWidth=.5;b.borderStyle="solid"}
  if(type==="container"){b.w=70;b.h=34;b.borderWidth=.5;b.borderStyle="solid";b.radius=0}
  return b
}
function visibleTextValue(e){
  if(!e)return"";
  if(e.type==="text")return String(e.text||"");
  if(e.type==="field"){
    const data=state.record?.data||{};
    const raw=data?.[e.field];
    if(raw===undefined||raw===null||raw==="")return e.emptyBehavior==="placeholder"?String(e.text||""):"";
    return String((e.label||"")+raw)
  }
  return""
}
function measureAutoTextHeight(e){
  if(!e||!["text","field"].includes(e.type))return Number(e?.h)||4.8;
  const m=document.createElement("div");
  const width=Math.max(.5,Number(e.w)||1)*MM;
  m.style.cssText="position:fixed;left:-10000px;top:-10000px;visibility:hidden;box-sizing:border-box;width:"+width+"px;height:auto;min-height:0;padding:0;margin:0;border:0;white-space:"+(e.wrap===false?"nowrap":"pre-wrap")+";overflow-wrap:"+(e.wrap===false?"normal":"anywhere")+";word-break:"+(e.wrap===false?"normal":"break-word")+";font-size:"+(e.fontSize||11)+"px;font-weight:"+(e.fontWeight||400)+";line-height:1.25;font-family:Arial,'Microsoft YaHei',sans-serif";
  m.textContent=visibleTextValue(e)||" ";
  document.body.appendChild(m);
  const px=Math.max((e.fontSize||11)*1.25,m.scrollHeight,m.getBoundingClientRect().height);
  m.remove();
  return Math.max(3.6,Math.ceil((px/MM+0.35)*10)/10)
}
function syncAutoTextHeight(e){
  if(!e||!["text","field"].includes(e.type)||e.autoHeight!==true)return false;
  const next=measureAutoTextHeight(e);
  if(Math.abs((Number(e.h)||0)-next)<.05)return false;
  e.h=next;
  return true
}
function addElement(type,x=25,y=25,field=""){const t=current();const e=defaults(type,field);if(["text","field"].includes(type))syncAutoTextHeight(e);if(type==="table"){const safe=Math.max(0,Number(t.page?.safeArea)||0);e.y=Math.max(safe,Math.min(y,(t.page?.height||140)-safe));fitTableToPage(e,{resetColumns:true,compact:true})}else{e.x=Math.max(0,Math.min(x,(t.page?.width||215)-e.w));e.y=Math.max(0,Math.min(y,(t.page?.height||140)-e.h))}t.elements.push(e);selectElements(e.id);renderElements();renderLayers();syncProps();commitEdit();toast(type==="table"?"已添加自动适配表格":"已添加组件")}
function elementVisualHeight(e){
  if(e?.type==="table"){
    try{return Math.max(.5,Number(buildTableLayout(e,state.record?.data||{},false).totalHeight)||Number(e.h)||.5)}catch{}
  }
  return Math.max(.5,Number(e?.h)||.5)
}
function createElementNode(e){
  const visualH=elementVisualHeight(e);
  const n=document.createElement("div");
  n.className="design-element "+e.type+"-el"+(selected.has(e.id)?" selected":"")+(e.locked?" locked":"")+(e.hidden?" hidden-element":"");
  n.dataset.id=e.id;
  if(e.type==="table"){n.dataset.autoRow=String(e.autoRowHeight!==false);n.classList.toggle("table-overflow",tableOverflowMm(e)>.1)}
  n.style.left=e.x*MM+"px";n.style.top=e.y*MM+"px";n.style.width=e.w*MM+"px";n.style.height=Math.max(1,visualH*MM)+"px";
  n.style.fontSize=(e.fontSize||11)+"px";n.style.fontWeight=e.fontWeight||400;n.style.textAlign=e.align||"left";
  content(n,e);
  n.addEventListener("pointerdown",ev=>startMove(ev,e));
  n.addEventListener("click",ev=>{
    ev.stopPropagation();
    if(ev.target.closest(".table-edit-cell,.table-context-tools,.table-col-resizer,.table-row-resizer"))return;
    const previous=new Set(selected);
    if(ev.shiftKey){clearTableSelection();selected.has(e.id)?selected.delete(e.id):selected.add(e.id)}
    else selectElements(e.id);
    refreshSelectionVisuals(previous)
  });
  n.addEventListener("contextmenu",ev=>showContext(ev,e.id));
  if(e.type==="text"&&!e.locked){
    n.addEventListener("dblclick",ev=>{
      ev.stopPropagation();ev.preventDefault();
      const target=n.querySelector(".render-text")||n;
      n.classList.add("inline-editing");target.contentEditable="true";target.spellcheck=false;target.focus();
      const range=document.createRange();range.selectNodeContents(target);range.collapse(false);
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      const finish=()=>{
        target.removeEventListener("blur",finish);
        target.contentEditable="false";n.classList.remove("inline-editing");
        const next=target.textContent??"";
        if(next!==e.text){
          e.text=next;if(e.autoHeight!==false){e.autoHeight=true;syncAutoTextHeight(e)}refreshElementNode(e);syncProps();commitEdit();
        }else refreshElementNode(e);
      };
      target.addEventListener("blur",finish,{once:true});
      target.addEventListener("keydown",k=>{
        if(k.key==="Escape"){k.preventDefault();target.textContent=e.text||"";target.blur()}
        if((k.ctrlKey||k.metaKey)&&k.key==="Enter"){k.preventDefault();target.blur()}
      });
    });
  }
  if(selected.has(e.id)&&!e.locked)addHandles(n,e);
  return n
}
function refreshElementNode(e){
  if(preview||!e)return;
  const old=document.querySelector('.design-element[data-id="'+CSS.escape(e.id)+'"]');
  if(!old)return;
  const next=createElementNode(e);
  old.replaceWith(next);
}
function renderElements(){
  const p=$("printPage");
  p.querySelectorAll(".design-element,.actual-preview-layer").forEach(n=>n.remove());
  const t=current();if(!t)return;
  if(preview){
    const box=document.createElement("div");
    box.innerHTML=renderTemplateToHtml(t,state.record?.data||{});
    const sheet=box.querySelector(".print-sheet");
    const layer=document.createElement("div");
    layer.className="actual-preview-layer";
    layer.style.cssText="position:absolute;inset:0;pointer-events:none;overflow:hidden;background:#fff";
    if(sheet)while(sheet.firstChild)layer.appendChild(sheet.firstChild);
    const calibrationHost=document.createElement("div");
    calibrationHost.className="print-sheet";
    calibrationHost.style.cssText="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#fff";
    while(layer.firstChild)calibrationHost.appendChild(layer.firstChild);
    layer.appendChild(calibrationHost);
    applyTemplateCalibration(calibrationHost,t);
    p.appendChild(layer);
    requestAnimationFrame(()=>hydrateCodes(layer));
    return
  }
  const frag=document.createDocumentFragment();
  for(const e of t.elements)frag.appendChild(createElementNode(e));
  p.appendChild(frag);
}

function hasValue(v){return !(v===undefined||v===null||v==="")}
function htmlEsc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function applyTextBehavior(n,e){
  n.style.whiteSpace=e.wrap===false?"nowrap":"pre-wrap";
  n.style.overflowWrap=e.wrap===false?"normal":"anywhere";
  n.style.wordBreak=e.wrap===false?"normal":"break-word";
  n.style.overflow="hidden";
  n.style.textOverflow=(e.overflowMode==="ellipsis"&&e.wrap===false)?"ellipsis":"clip";
  if(e.maxLines>0&&e.wrap!==false){
    n.style.display="-webkit-box";
    n.style.webkitBoxOrient="vertical";
    n.style.webkitLineClamp=String(e.maxLines);
  }
  if(e.overflowMode==="grow"){n.style.height="auto";n.style.minHeight=Math.max(1,e.h*MM)+"px"}
}
function imagePosition(e){return (e.alignX||"center")+" "+(e.alignY||"center")}
function tableAxes(e,data=state.record?.data||{}){
  ensureTableModel(e,data);
  return{rows:materializeTableRows(e,data),cols:tmNormalizeColumns(e)}
}
function cellKey(row,col){return row+":"+col}
function expandedTableRange(e,a,b){
  let range={r0:Math.min(a.row,b.row),r1:Math.max(a.row,b.row),c0:Math.min(a.col,b.col),c1:Math.max(a.col,b.col)};
  const {rows,cols}=tableAxes(e);
  let changed=true,guard=0;
  while(changed&&guard++<20){
    changed=false;
    for(const m of e.merges||[]){
      const ris=(m.rowIds||[]).map(id=>rows.findIndex(r=>r.id===id)).filter(i=>i>=0);
      const cis=(m.colIds||[]).map(id=>cols.findIndex(c=>c.id===id)).filter(i=>i>=0);
      if(!ris.length||!cis.length)continue;
      const mr0=Math.min(...ris),mr1=Math.max(...ris),mc0=Math.min(...cis),mc1=Math.max(...cis);
      const intersects=!(mr1<range.r0||mr0>range.r1||mc1<range.c0||mc0>range.c1);
      if(!intersects)continue;
      const next={r0:Math.min(range.r0,mr0),r1:Math.max(range.r1,mr1),c0:Math.min(range.c0,mc0),c1:Math.max(range.c1,mc1)};
      if(next.r0!==range.r0||next.r1!==range.r1||next.c0!==range.c0||next.c1!==range.c1){range=next;changed=true}
    }
  }
  return range
}
function setCellRectSelection(a,b,e){
  const range=e?expandedTableRange(e,a,b):{r0:Math.min(a.row,b.row),r1:Math.max(a.row,b.row),c0:Math.min(a.col,b.col),c1:Math.max(a.col,b.col)};
  selectedCells=[];
  for(let r=range.r0;r<=range.r1;r++)for(let c=range.c0;c<=range.c1;c++)selectedCells.push({row:r,col:c});
}
function tableSelectionBounds(){
  if(!selectedCells.length)return null;
  const rs=selectedCells.map(s=>s.row),cs=selectedCells.map(s=>s.col);
  return{r0:Math.min(...rs),r1:Math.max(...rs),c0:Math.min(...cs),c1:Math.max(...cs)}
}
function paintTableSelection(e){
  const node=document.querySelector('.design-element[data-id="'+CSS.escape(e.id)+'"]');if(!node)return;
  const keys=new Set(selectedCells.map(s=>s.row+":"+s.col));
  node.querySelectorAll("td.table-edit-cell").forEach(cell=>{
    cell.classList.toggle("cell-selected",keys.has(cell.dataset.row+":"+cell.dataset.col));
  });
  const hint=$("tableSelectionHint"),b=tableSelectionBounds();
  if(hint&&b)hint.textContent="已选择 "+(b.r1-b.r0+1)+" 行 × "+(b.c1-b.c0+1)+" 列";
}
function beginTableCellDrag(ev,e,row,col){
  if(ev.button!==0)return;
  ev.stopPropagation();ev.preventDefault();
  selected=new Set([e.id]);tableSelecting=true;
  const cell={row,col};
  if(ev.shiftKey&&tableSelectionAnchor)setCellRectSelection(tableSelectionAnchor,cell,e);
  else{tableSelectionAnchor=cell;setCellRectSelection(cell,cell,e)}
  paintTableSelection(e);
}
function extendTableCellDrag(e,row,col){
  if(!tableSelecting||!tableSelectionAnchor)return;
  selected=new Set([e.id]);setCellRectSelection(tableSelectionAnchor,{row,col},e);
  paintTableSelection(e);
}
function endTableCellDrag(){
  if(!tableSelecting)return;
  tableSelecting=false;const e=selectedOne();if(e?.type==="table")refreshElementNode(e);renderLayers();syncProps();
}
window.addEventListener("pointerup",endTableCellDrag);
function content(n,e){
  const data=state.record?.data||{};
  if(e.type!=="table"){
    const html=renderElementToHtml({...e,hidden:false},data,false);
    n.classList.remove("output-empty");
    if(html){
      n.innerHTML=html;
      const img=n.querySelector("img");
      if(img)img.onerror=()=>requestImageRefresh(state.record?.id||"");
      if(e.type==="barcode"||e.type==="qrcode")requestAnimationFrame(()=>hydrateCodes(n));
    }else{
      n.innerHTML="";
      n.classList.add("output-empty");
      n.title="当前数据下该元素不会出现在最终打印结果中";
    }
    return
  }
  if(e.type==="table"){
    const rendered=renderTableMarkup(e,data,{editable:true,selectedCells});
    const {rows,allCols}=rendered.layout;
    n.classList.toggle("wrap-on",e.wrap!==false);n.classList.toggle("wrap-off",e.wrap===false);
    n.classList.toggle("output-empty",!rendered.html);
    n.innerHTML=rendered.html;
    if(!rendered.html){
      n.title="当前数据下该表格不会出现在最终打印结果中";
      return
    }
    n.querySelectorAll("td.table-edit-cell").forEach(cell=>{
      const row=Number(cell.dataset.row),col=Number(cell.dataset.col);
      cell.addEventListener("pointerdown",ev=>beginTableCellDrag(ev,e,row,col));
      cell.addEventListener("pointerenter",()=>extendTableCellDrag(e,row,col));
      cell.addEventListener("click",ev=>ev.stopPropagation());
    });
    n.querySelectorAll("th.table-head-cell").forEach(cell=>{
      cell.addEventListener("pointerdown",ev=>{
        ev.stopPropagation();ev.preventDefault();
        const col=Number(cell.dataset.col);
        const previous=new Set(selected);
        selected=new Set([e.id]);tableSelectionAnchor={row:0,col};selectedCells=[];
        for(let r=0;r<rows.length;r++)selectedCells.push({row:r,col});
        refreshElementNode(e);refreshSelectionVisuals(previous);
      });
    });
    if(selected.has(e.id)&&!preview&&!e.locked){
      addTableColumnResizers(n,e,allCols);
      addTableRowResizers(n,e,rows);
      if(selectedCells.length)addTableCellToolbar(n,e);
    }
  }
}
function addTableColumnResizers(n,e,cols){
  let cumulative=0;
  cols.slice(0,-1).forEach((col,index)=>{
    cumulative+=Number(col.width)||0;
    const h=document.createElement("span");
    h.className="table-col-resizer";
    h.style.left=cumulative+"%";
    h.dataset.index=index;
    h.title="拖动调整列宽";
    h.addEventListener("pointerdown",ev=>startTableColumnResize(ev,e,index,n));
    n.appendChild(h);
  });
}
function startTableColumnResize(ev,e,index,node){
  ev.preventDefault();ev.stopPropagation();
  const cols=normalizeColumns(e.columns),left=cols[index],right=cols[index+1];if(!left||!right)return;
  const sx=ev.clientX,widthPx=Math.max(1,node.getBoundingClientRect().width),a0=Number(left.width)||0,b0=Number(right.width)||0,total=a0+b0,min=Math.min(total/2-1,Math.max(6,800/Math.max(40,Number(e.w)||100)));
  const move=m=>{
    const delta=(m.clientX-sx)/widthPx*100;
    left.width=Math.max(min,Math.min(total-min,a0+delta));right.width=total-left.width;e.columns=cols;
    const table=node.querySelector("table"),heads=table?.querySelectorAll("th")||[],colEls=table?.querySelectorAll("col")||[];
    if(colEls[index])colEls[index].style.width=left.width+"%";if(colEls[index+1])colEls[index+1].style.width=right.width+"%";
    if(heads[index])heads[index].style.width=left.width+"%";if(heads[index+1])heads[index+1].style.width=right.width+"%";
  };
  const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);e.columns=normalizeColumns(cols);e.smartColumns=false;refreshElementNode(e);renderTableColumnEditor(e);syncProps();commitEdit()};
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}
function addTableRowResizers(n,e,rows){
  const headerH=e.showHeader===false?0:(e.headerHeight||e.rowHeight||8);
  let y=headerH;
  rows.forEach((row,ri)=>{
    y+=tmRowHeight(row,e);
    const h=document.createElement("span");
    h.className="table-row-resizer";h.style.top=y*MM+"px";h.dataset.row=ri;h.title="拖动调整此行高度";
    h.addEventListener("pointerdown",ev=>startTableRowResize(ev,e,ri,rows,n));n.appendChild(h)
  });
}
function updateTableRowGeometry(node,e,rows){
  const total=(e.showHeader===false?0:Number(e.headerHeight||e.rowHeight||8))+rows.reduce((sum,row)=>sum+tmRowHeight(row,e),0);
  node.style.height=total*MM+"px";
  const table=node.querySelector("table");if(table)table.style.height=total*MM+"px";
  const trs=node.querySelectorAll("tbody tr");
  rows.forEach((row,i)=>{const h=tmRowHeight(row,e)*MM;if(trs[i])trs[i].style.height=h+"px";trs[i]?.querySelectorAll("td").forEach(td=>td.style.height=h+"px")});
  let y=e.showHeader===false?0:(e.headerHeight||e.rowHeight||8);
  node.querySelectorAll(".table-row-resizer").forEach((handle,i)=>{y+=tmRowHeight(rows[i],e);handle.style.top=y*MM+"px"});
}
function startTableRowResize(ev,e,rowIndex,rows,node){
  ev.preventDefault();ev.stopPropagation();
  const row=rows[rowIndex];if(!row)return;
  const def=(e.rowDefs||[]).find(r=>r.id===row.id);if(!def)return;
  const sy=ev.clientY,factor=zoom/100,start=Number(def.height)||Number(e.rowHeight)||8;
  const move=m=>{e.autoRowHeight=false;def.height=Math.max(4,start+(m.clientY-sy)/factor/MM);row.height=def.height;updateTableRowGeometry(node,e,rows)};
  const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);refreshElementNode(e);syncProps();commitEdit()};
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}

function selectionIsRectangle(){
  const b=tableSelectionBounds();if(!b)return false;
  return (b.r1-b.r0+1)*(b.c1-b.c0+1)===selectedCells.length
}
function tableSelectionModelCells(e){
  const {rows,cols}=tableAxes(e);
  return selectedCells.map(s=>({visual:s,row:rows[s.row],col:cols[s.col]})).filter(x=>x.row&&x.col)
}
function clearSelectedTableCells(){
  const e=selectedOne();if(!e||e.type!=="table"||!selectedCells.length)return;
  for(const x of tableSelectionModelCells(e)){
    if(tmIsCoveredCell(e,x.row.id,x.col.id))continue;
    tmSetCellOverride(e,x.row.id,x.col.id,{type:"text",text:"",align:"",valign:"middle",padding:2,wrap:true,imageFit:e.tableImageFit||"contain"});
  }
  commitTableEdit("已清空选中单元格")
}
function copySelectedTableCells(){
  const e=selectedOne(),b=tableSelectionBounds();if(!e||e.type!=="table"||!b)return;
  const {rows,cols}=tableAxes(e),matrix=[],merges=[];
  for(let r=b.r0;r<=b.r1;r++){
    const line=[];
    for(let col=b.c0;col<=b.c1;col++){
      const row=rows[r],column=cols[col];
      line.push(row&&column?structuredClone(tmGetCellOverride(e,row.id,column.id)):null)
    }
    matrix.push(line)
  }
  for(const m of e.merges||[]){
    const ris=(m.rowIds||[]).map(id=>rows.findIndex(r=>r.id===id)).filter(i=>i>=0);
    const cis=(m.colIds||[]).map(id=>cols.findIndex(col=>col.id===id)).filter(i=>i>=0);
    if(!ris.length||!cis.length)continue;
    const r0=Math.min(...ris),r1=Math.max(...ris),c0=Math.min(...cis),c1=Math.max(...cis);
    if(r0>=b.r0&&r1<=b.r1&&c0>=b.c0&&c1<=b.c1)merges.push({r0:r0-b.r0,r1:r1-b.r0,c0:c0-b.c0,c1:c1-b.c0});
  }
  tableClipboard={rows:matrix.length,cols:matrix[0]?.length||0,matrix,merges};
  toast("已复制 "+tableClipboard.rows+"×"+tableClipboard.cols+" 单元格")
}
function pasteSelectedTableCells(){
  const e=selectedOne(),b=tableSelectionBounds();if(!e||e.type!=="table"||!b||!tableClipboard)return;
  const {rows,cols}=tableAxes(e);
  const target={r0:b.r0,r1:Math.min(rows.length-1,b.r0+tableClipboard.rows-1),c0:b.c0,c1:Math.min(cols.length-1,b.c0+tableClipboard.cols-1)};
  unmergeVisualRange(e,rows,cols,target);
  for(let dr=0;dr<tableClipboard.rows;dr++)for(let dc=0;dc<tableClipboard.cols;dc++){
    const row=rows[b.r0+dr],col=cols[b.c0+dc];if(!row||!col)continue;
    const value=tableClipboard.matrix[dr][dc];
    tmSetCellOverride(e,row.id,col.id,value?structuredClone(value):null);
  }
  for(const m of tableClipboard.merges||[]){
    const range={r0:b.r0+m.r0,r1:b.r0+m.r1,c0:b.c0+m.c0,c1:b.c0+m.c1};
    if(range.r1<rows.length&&range.c1<cols.length)mergeVisualRange(e,rows,cols,range);
  }
  selectedCells=[];for(let r=target.r0;r<=target.r1;r++)for(let col=target.c0;col<=target.c1;col++)selectedCells.push({row:r,col});
  tableSelectionAnchor={row:target.r0,col:target.c0};
  commitTableEdit("已粘贴 "+tableClipboard.rows+"×"+tableClipboard.cols+" 单元格")
}
function selectionHasMerge(e){
  return tableSelectionModelCells(e).some(x=>tmMergeForCell(e,x.row.id,x.col.id))
}
function commitTableEdit(message){
  const e=selectedOne();if(e?.type==="table")refreshElementNode(e);renderTableColumnEditor(e);syncProps();commitEdit();if(message)toast(message)
}
function mergeSelectedCells(){
  const e=selectedOne(),b=tableSelectionBounds();
  if(!e||e.type!=="table"||!b||selectedCells.length<2){toast("拖拽选择至少两个连续格子");return}
  if(!selectionIsRectangle()){toast("合并区域必须是连续矩形");return}
  const {rows,cols}=tableAxes(e);
  const merged=mergeVisualRange(e,rows,cols,b);
  if(!merged){toast("当前区域无法合并");return}
  commitTableEdit("已合并 "+(b.r1-b.r0+1)+"×"+(b.c1-b.c0+1)+" 区域")
}
function unmergeSelectedCells(){
  const e=selectedOne(),b=tableSelectionBounds();if(!e||e.type!=="table"||!b)return;
  const {rows,cols}=tableAxes(e),count=unmergeVisualRange(e,rows,cols,b);
  commitTableEdit(count?"已取消合并":"当前区域没有合并")
}
function insertTableRowAt(where="below"){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const {rows,cols}=tableAxes(e),b=tableSelectionBounds();
  const index=Math.max(0,Math.min(b?(where==="above"?b.r0:b.r1+1):rows.length,rows.length));
  insertManualRow(e,rows,index);
  const nextRows=materializeTableRows(e,state.record?.data||{});
  const target=Math.min(index,nextRows.length-1);
  selectedCells=cols.map((_,col)=>({row:target,col}));tableSelectionAnchor={row:target,col:0};
  commitTableEdit(where==="above"?"已在上方插入空白行":"已在下方插入空白行")
}
function deleteSelectedRows(){
  const e=selectedOne(),b=tableSelectionBounds();if(!e||e.type!=="table"||!b)return;
  const {rows,cols}=tableAxes(e),indexes=[];for(let r=b.r0;r<=b.r1;r++)indexes.push(r);
  if(!deleteVisualRows(e,rows,indexes)){toast("表格至少保留一行");return}
  const nextRows=materializeTableRows(e,state.record?.data||{});
  const row=Math.min(b.r0,nextRows.length-1),col=Math.min(b.c0,cols.length-1);
  selectedCells=[{row,col}];tableSelectionAnchor={row,col};commitTableEdit("已删除 "+indexes.length+" 行")
}
function insertTableColumnAt(where="right"){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const {cols}=tableAxes(e),b=tableSelectionBounds();
  const index=Math.max(0,Math.min(where==="left"?(b?.c0??0):(b?b.c1+1:cols.length),cols.length));
  tmInsertColumn(e,index);
  const nextCols=tmNormalizeColumns(e),row=b?.r0??0,col=Math.min(index,nextCols.length-1);
  selectedCells=[{row,col}];tableSelectionAnchor={row,col};
  commitTableEdit(where==="left"?"已在左侧插入列":"已在右侧插入列")
}
function deleteSelectedColumns(){
  const e=selectedOne(),b=tableSelectionBounds();if(!e||e.type!=="table"||!b)return;
  const {cols}=tableAxes(e),indexes=[];for(let col=b.c0;col<=b.c1;col++)indexes.push(col);
  if(!tmDeleteColumns(e,indexes)){toast("表格至少保留一列");return}
  const nextCols=tmNormalizeColumns(e),col=Math.min(b.c0,nextCols.length-1),row=b.r0;
  selectedCells=[{row,col}];tableSelectionAnchor={row,col};commitTableEdit("已删除 "+indexes.length+" 列")
}
function addTableCellToolbar(n,e){
  const b=tableSelectionBounds();if(!b)return;
  const bar=document.createElement("div");bar.className="table-context-tools";bar.dataset.role="table-tools";
  const pageH=current()?.page?.height||140;
  const visualH=elementVisualHeight(e);
  if(e.y<10)bar.style.top=(visualH+1.5)*MM+"px";
  else if(e.y+visualH+10>pageH)bar.style.top="4px";
  const defs=[
    ["merge","合并"],["unmerge","拆分"],["rowAbove","上插行"],["rowBelow","下插行"],
    ["colLeft","左插列"],["colRight","右插列"],["delRow","删行"],["delCol","删列"]
  ];
  for(const [cmd,label] of defs){
    const btn=document.createElement("button");btn.type="button";btn.dataset.cmd=cmd;btn.textContent=label;
    if(cmd==="merge")btn.disabled=selectedCells.length<2||!selectionIsRectangle();
    btn.addEventListener("pointerdown",ev=>{ev.preventDefault();ev.stopPropagation()});
    btn.onclick=ev=>{
      ev.stopPropagation();
      if(cmd==="merge")mergeSelectedCells();
      if(cmd==="unmerge")unmergeSelectedCells();
      if(cmd==="rowAbove")insertTableRowAt("above");
      if(cmd==="rowBelow")insertTableRowAt("below");
      if(cmd==="colLeft")insertTableColumnAt("left");
      if(cmd==="colRight")insertTableColumnAt("right");
      if(cmd==="delRow")deleteSelectedRows();
      if(cmd==="delCol")deleteSelectedColumns();
    };
    bar.appendChild(btn)
  }
  const meta=document.createElement("span");meta.className="table-context-meta";
  meta.textContent=(b.r1-b.r0+1)+"行 × "+(b.c1-b.c0+1)+"列";bar.appendChild(meta);
  n.appendChild(bar)
}
function insertTableRow(){insertTableRowAt("below")}
function deleteTableRow(){deleteSelectedRows()}

function syncGeometryProps(e){
  if(!e||selected.size!==1)return;
  const values={x:e.x,y:e.y,w:e.w,h:elementVisualHeight(e)};
  const map=[["propX","x"],["propY","y"],["propW","w"],["propH","h"]];
  for(const [id,k] of map){const input=$(id);if(input)input.value=Math.round(Number(values[k]||0)*10)/10}
}
function clearAlignmentGuides(){
  document.querySelectorAll("#printPage .alignment-guide").forEach(n=>n.remove());
}
function showAlignmentGuide(axis,value){
  const page=$("printPage");if(!page)return;
  const n=document.createElement("div");
  n.className="alignment-guide "+(axis==="x"?"vertical":"horizontal");
  if(axis==="x")n.style.left=value*MM+"px";else n.style.top=value*MM+"px";
  page.appendChild(n);
}
function smartSnapDelta(start,dx,dy){
  if(!snap||!start.length)return{dx,dy};
  const ids=new Set(start.map(a=>a.id));
  const others=current().elements.filter(el=>!ids.has(el.id)&&!el.hidden);
  const group={
    left:Math.min(...start.map(a=>a.ox)),
    right:Math.max(...start.map(a=>a.ox+a.x.w)),
    top:Math.min(...start.map(a=>a.oy)),
    bottom:Math.max(...start.map(a=>a.oy+elementVisualHeight(a.x)))
  };
  group.cx=(group.left+group.right)/2;group.cy=(group.top+group.bottom)/2;
  const page=current().page||{width:215,height:140};
  const xTargets=[0,page.width/2,page.width];
  const yTargets=[0,page.height/2,page.height];
  for(const el of others){
    xTargets.push(el.x,el.x+el.w/2,el.x+el.w);
    const vh=elementVisualHeight(el);yTargets.push(el.y,el.y+vh/2,el.y+vh);
  }
  const movingX=[group.left+dx,group.cx+dx,group.right+dx];
  const movingY=[group.top+dy,group.cy+dy,group.bottom+dy];
  const threshold=1.25;
  let bestX=null,bestY=null;
  for(const mv of movingX)for(const target of xTargets){
    const d=target-mv;if(Math.abs(d)<=threshold&&(!bestX||Math.abs(d)<Math.abs(bestX.d)))bestX={d,target};
  }
  for(const mv of movingY)for(const target of yTargets){
    const d=target-mv;if(Math.abs(d)<=threshold&&(!bestY||Math.abs(d)<Math.abs(bestY.d)))bestY={d,target};
  }
  clearAlignmentGuides();
  if(bestX){dx+=bestX.d;showAlignmentGuide("x",bestX.target)}
  if(bestY){dy+=bestY.d;showAlignmentGuide("y",bestY.target)}
  return{dx,dy};
}
function copySelectedElements(){
  const t=current();if(!t||!selected.size)return false;
  elementClipboard=t.elements.filter(e=>selected.has(e.id)).map(e=>structuredClone(e));
  if(elementClipboard.length)toast("已复制 "+elementClipboard.length+" 个组件");
  return elementClipboard.length>0;
}
function pasteSelectedElements(){
  const t=current();if(!t||!elementClipboard.length)return false;
  const ids=[];
  for(const src of elementClipboard){
    const e=structuredClone(src);
    e.id=uid("el");e.locked=false;e.x=Number(e.x||0)+4;e.y=Number(e.y||0)+4;
    clampElementToPage(e);t.elements.push(e);ids.push(e.id);
  }
  selectElements(ids);renderAll();commitEdit();toast("已粘贴 "+ids.length+" 个组件");
  return true;
}
function nudgeSelection(dx,dy){
  const t=current();if(!t||!selected.size)return;
  let changed=false;
  for(const e of t.elements.filter(x=>selected.has(x.id)&&!x.locked)){
    const ox=e.x,oy=e.y;e.x+=dx;e.y+=dy;clampElementToPage(e);
    if(e.x!==ox||e.y!==oy)changed=true;
  }
  if(!changed)return;
  for(const e of t.elements.filter(x=>selected.has(x.id)))updateElementNodeGeometry(e);
  syncProps();
  clearTimeout(nudgeTimer);
  nudgeTimer=setTimeout(()=>{nudgeTimer=null;commitEdit()},180);
}
function beginMarqueeSelection(ev){
  if(preview||ev.button!==0||ev.target.closest(".design-element,.table-context-tools,.resize-handle"))return;
  const page=$("printPage");if(!page)return;
  ev.preventDefault();
  clearTableSelection();
  const rect=page.getBoundingClientRect(),factor=zoom/100;
  const sx=(ev.clientX-rect.left)/factor,sy=(ev.clientY-rect.top)/factor;
  const box=document.createElement("div");box.className="marquee-selection";page.appendChild(box);
  const move=e=>{
    const x=(e.clientX-rect.left)/factor,y=(e.clientY-rect.top)/factor;
    const l=Math.max(0,Math.min(sx,x)),t=Math.max(0,Math.min(sy,y));
    const rr=Math.min(page.offsetWidth,Math.max(sx,x)),bb=Math.min(page.offsetHeight,Math.max(sy,y));
    box.style.left=l+"px";box.style.top=t+"px";box.style.width=Math.max(0,rr-l)+"px";box.style.height=Math.max(0,bb-t)+"px";
  };
  const up=e=>{
    removeEventListener("pointermove",move);removeEventListener("pointerup",up);
    const x=(e.clientX-rect.left)/factor,y=(e.clientY-rect.top)/factor;
    const l=Math.max(0,Math.min(sx,x))/MM,t=Math.max(0,Math.min(sy,y))/MM;
    const rr=Math.min(page.offsetWidth,Math.max(sx,x))/MM,bb=Math.min(page.offsetHeight,Math.max(sy,y))/MM;
    const dragDistance=Math.hypot(x-sx,y-sy);
    box.remove();
    const previous=new Set(selected);
    if(dragDistance<3){selected.clear()}
    else{
      const hits=current().elements.filter(el=>{const vh=elementVisualHeight(el);return !el.hidden&&el.x<rr&&el.x+el.w>l&&el.y<bb&&el.y+vh>t}).map(el=>el.id);
      selected=new Set(ev.shiftKey?[...selected,...hits]:hits);
    }
    refreshSelectionVisuals(previous);
  };
  addEventListener("pointermove",move);addEventListener("pointerup",up);
}
function clampElementToPage(e){
  const page=current()?.page||{width:215,height:140};
  e.w=Math.max(.5,Math.min(Number(e.w)||.5,page.width));
  if(e.type!=="table")e.h=Math.max(.5,Math.min(Number(e.h)||.5,page.height));
  const visualH=Math.min(elementVisualHeight(e),page.height);
  e.x=Math.max(0,Math.min(Number(e.x)||0,Math.max(0,page.width-e.w)));
  e.y=Math.max(0,Math.min(Number(e.y)||0,Math.max(0,page.height-visualH)));
  return e
}
function updateElementNodeGeometry(e){
  const node=document.querySelector('.design-element[data-id="'+CSS.escape(e.id)+'"]');if(!node)return;
  node.style.left=e.x*MM+"px";node.style.top=e.y*MM+"px";
  node.style.width=e.w*MM+"px";node.style.height=Math.max(1,elementVisualHeight(e)*MM)+"px";
}
function addHandles(n,e){const dirs=e.type==="table"?["e","w"]:["nw","n","ne","e","se","s","sw","w"];for(const d of dirs){const h=document.createElement("span");h.className="resize-handle "+d;h.dataset.dir=d;h.addEventListener("pointerdown",ev=>startResize(ev,e,d));n.appendChild(h)}}
function startMove(ev,e){
  if(preview||e.locked||ev.target.closest('[contenteditable="true"],.resize-handle,.table-col-resizer,.table-row-resizer,.table-edit-cell,.table-context-tools'))return;
  ev.preventDefault();ev.stopPropagation();
  if(!selected.has(e.id)){const previous=new Set(selected);clearTableSelection();selected=ev.shiftKey?new Set([...selected,e.id]):new Set([e.id]);refreshSelectionVisuals(previous)}
  const sx=ev.clientX,sy=ev.clientY,start=[...selected].map(id=>{const x=current().elements.find(v=>v.id===id);return{x,id,ox:x.x,oy:x.y}}).filter(a=>a.x),factor=zoom/100;
  let moved=false;
  const move=m=>{
    let dx=(m.clientX-sx)/factor/MM,dy=(m.clientY-sy)/factor/MM;
    if(snap){dx=Math.round(dx*2)/2;dy=Math.round(dy*2)/2}
    ({dx,dy}=smartSnapDelta(start,dx,dy));
    const page=current().page||{width:215,height:140};
    const groupLeft=Math.min(...start.map(a=>a.ox)),groupRight=Math.max(...start.map(a=>a.ox+a.x.w));
    const groupTop=Math.min(...start.map(a=>a.oy)),groupBottom=Math.max(...start.map(a=>a.oy+elementVisualHeight(a.x)));
    dx=Math.max(-groupLeft,Math.min(dx,page.width-groupRight));
    dy=Math.max(-groupTop,Math.min(dy,page.height-groupBottom));
    moved=moved||Math.abs(dx)>.001||Math.abs(dy)>.001;
    for(const a of start){a.x.x=a.ox+dx;a.x.y=a.oy+dy;updateElementNodeGeometry(a.x)}
    syncGeometryProps(selectedOne());
  };
  const up=()=>{
    removeEventListener("pointermove",move);removeEventListener("pointerup",up);clearAlignmentGuides();syncProps();
    const changed=moved&&start.some(a=>Math.abs(a.x.x-a.ox)>.001||Math.abs(a.x.y-a.oy)>.001);
    if(changed)commitEdit()
  };
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}
function startResize(ev,e,dir){
  ev.preventDefault();ev.stopPropagation();
  const sx=ev.clientX,sy=ev.clientY,o={x:e.x,y:e.y,w:e.w,h:e.h},factor=zoom/100,ratio=o.w/Math.max(.1,o.h);let changed=false;
  const move=m=>{
    let dx=(m.clientX-sx)/factor/MM,dy=(m.clientY-sy)/factor/MM;
    if(snap){dx=Math.round(dx*2)/2;dy=Math.round(dy*2)/2}
    const page=current().page||{width:215,height:140};
    if(dir.includes("e"))e.w=Math.max(2,Math.min(o.w+dx,page.width-o.x));
    if(dir.includes("s")&&e.type!=="table")e.h=Math.max(.5,Math.min(o.h+dy,page.height-o.y));
    if(dir.includes("w")){const nx=Math.max(0,Math.min(o.x+dx,o.x+o.w-2));e.x=nx;e.w=o.w+(o.x-nx)}
    if(dir.includes("n")&&e.type!=="table"){const ny=Math.max(0,Math.min(o.y+dy,o.y+o.h-.5));e.y=ny;e.h=o.h+(o.y-ny)}
    if(e.type==="image"&&e.aspectLock!==false&&(dir.length===2)){
      if(Math.abs(dx)>=Math.abs(dy)){e.h=Math.max(.5,e.w/ratio);if(dir.includes("n"))e.y=o.y+(o.h-e.h)}
      else{e.w=Math.max(2,e.h*ratio);if(dir.includes("w"))e.x=o.x+(o.w-e.w)}
      e.x=Math.max(0,e.x);e.y=Math.max(0,e.y);
      const maxW=Math.max(2,page.width-e.x),maxH=Math.max(.5,page.height-e.y);
      const scale=Math.min(1,maxW/e.w,maxH/e.h);
      if(scale<1){e.w*=scale;e.h*=scale}
    }
    changed=changed||Math.abs(e.x-o.x)>.001||Math.abs(e.y-o.y)>.001||Math.abs(e.w-o.w)>.001||Math.abs(e.h-o.h)>.001;updateElementNodeGeometry(e);syncGeometryProps(e);
  };
  const up=()=>{
    removeEventListener("pointermove",move);removeEventListener("pointerup",up);
    const finalChanged=changed&&(Math.abs(e.x-o.x)>.001||Math.abs(e.y-o.y)>.001||Math.abs(e.w-o.w)>.001||Math.abs(e.h-o.h)>.001);
    if(finalChanged){if(e.type==="table")e.smartLayout=false;refreshElementNode(e);syncProps();commitEdit()}
  };
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}
function selectedOne(){if(selected.size!==1)return null;return current().elements.find(e=>selected.has(e.id))}
function renderTableColumnEditor(e){
  const list=$("tableColumnList");if(!list)return;
  list.innerHTML="";
  const cols=normalizeColumns(e.columns);
  cols.forEach((col,index)=>{
    const row=document.createElement("div");row.className="table-column-row";
    const move=document.createElement("div");move.className="col-move";
    const up=document.createElement("button");up.type="button";up.textContent="▲";up.disabled=index===0;
    const down=document.createElement("button");down.type="button";down.textContent="▼";down.disabled=index===cols.length-1;
    move.append(up,down);

    const title=document.createElement("input");title.value=col.title||"";title.placeholder="表头";
    const field=document.createElement("select");
    field.innerHTML='<option value="">未绑定</option>';
    for(const f of state.fields){const o=document.createElement("option");o.value=f.name;o.textContent=f.name;field.appendChild(o)}
    field.value=col.field||"";
    const width=document.createElement("input");width.type="number";width.min="1";width.max="100";width.step="1";width.value=col.width??Math.round(100/Math.max(1,cols.length));width.title="宽度%";
    const remove=document.createElement("button");remove.type="button";remove.className="col-remove";remove.textContent="×";remove.title="删除列";

    const commit=()=>{col.title=title.value.trim()||field.value||("列"+(index+1));col.field=field.value||title.value.trim();col.width=Math.max(1,Number(width.value)||1);e.columns=cols;e.smartColumns=false;refreshElementNode(e);updateTableFitState(e);autoSave()};
    const checkpoint=()=>{commit();pushHistory()};
    title.addEventListener("input",commit);title.addEventListener("change",checkpoint);
    field.addEventListener("change",checkpoint);
    width.addEventListener("input",commit);width.addEventListener("change",checkpoint);
    up.onclick=()=>{if(index<1)return;[cols[index-1],cols[index]]=[cols[index],cols[index-1]];e.columns=cols;normalizeMergeContiguity(e);clearTableSelection();renderTableColumnEditor(e);refreshElementNode(e);commitEdit()};
    down.onclick=()=>{if(index>=cols.length-1)return;[cols[index],cols[index+1]]=[cols[index+1],cols[index]];e.columns=cols;normalizeMergeContiguity(e);clearTableSelection();renderTableColumnEditor(e);refreshElementNode(e);commitEdit()};
    remove.onclick=()=>{if(!tmDeleteColumns(e,[index])){toast("表格至少保留 1 列");return}selectedCells=[];tableSelectionAnchor=null;renderTableColumnEditor(e);refreshElementNode(e);commitEdit()};
    row.append(move,title,field,width,remove);list.appendChild(row);
  });
}
function addTableColumn(){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const cols=tmNormalizeColumns(e);tmInsertColumn(e,cols.length);
  selectedCells=[];tableSelectionAnchor=null;
  normalizeTableWidths(false);renderTableColumnEditor(e);refreshElementNode(e);commitEdit()
}
function normalizeTableWidths(save=true){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const cols=tmNormalizeColumns(e),base=Math.floor(100/cols.length);let rest=100-base*cols.length;
  cols.forEach((col,i)=>{col.width=base+(i<rest?1:0)});e.columns=cols;e.smartColumns=false;
  renderTableColumnEditor(e);refreshElementNode(e);if(save){commitEdit()}
}
function syncTableCellInspector(e){
  const panel=$("tableCellInspector"),hint=$("tableSelectionHint"),b=tableSelectionBounds();
  if(!panel)return;
  panel.classList.toggle("hidden",!b);
  if(hint)hint.textContent=b?("已选择 "+(b.r1-b.r0+1)+" 行 × "+(b.c1-b.c0+1)+" 列"):("单击或拖拽选择格子");
  if(!b)return;
  const {rows,cols}=tableAxes(e),row=rows[b.r0],col=cols[b.c0];
  const raw=row&&col?tmGetCellOverride(e,row.id,col.id)||{}:{};
  const type=raw.type||"inherit";
  $("tableCellType").value=type;
  $("tableCellField").value=raw.field||"";
  $("tableCellText").value=raw.text||"";
  $("tableCellAlign").value=raw.align||"";
  $("tableCellVAlign").value=raw.valign||"middle";
  $("tableCellPadding").value=raw.padding??2;
  $("tableCellWrap").value=String(raw.wrap!==false);
  $("tableCellImageFit").value=raw.imageFit||e.tableImageFit||"contain";

  $("tableCellFieldGroup")?.classList.toggle("hidden",!["field","image"].includes(type));
  $("tableCellTextGroup")?.classList.toggle("hidden",type!=="text");
  $("tableCellImageFitGroup")?.classList.toggle("hidden",type!=="image");

  const stateNode=$("tableCellValueState");
  if(stateNode){
    if(row&&col&&["field","image"].includes(type)){
      const resolved=tmCellValue(e,row,col,state.record?.data||{}).value;
      const field=raw.field||col.field||"";
      stateNode.classList.remove("hidden","ok","empty");
      if(hasValue(resolved)){
        stateNode.classList.add("ok");
        stateNode.textContent="当前值："+String(resolved).slice(0,60);
      }else{
        stateNode.classList.add("empty");
        stateNode.textContent="字段「"+(field||"未绑定")+"」当前无值 · 预览/打印自动隐藏空行";
      }
    }else stateNode.classList.add("hidden");
  }
}
function applyTableCellInspector(e){
  if(!selectedCells.length)return;
  const {rows,cols}=tableAxes(e);
  const cfg={
    type:$("tableCellType").value||"inherit",
    field:$("tableCellField").value||"",
    text:$("tableCellText").value||"",
    align:$("tableCellAlign").value||"",
    valign:$("tableCellVAlign").value||"middle",
    padding:Math.max(0,Number($("tableCellPadding").value)||0),
    wrap:$("tableCellWrap").value==="true",
    imageFit:$("tableCellImageFit").value||e.tableImageFit||"contain"
  };
  for(const s of selectedCells){
    const row=rows[s.row],col=cols[s.col];if(!row||!col||tmIsCoveredCell(e,row.id,col.id))continue;
    tmSetCellOverride(e,row.id,col.id,cfg);
  }
}
function syncProps(){
  const e=selectedOne();
  $("noSelection").classList.toggle("hidden",!!e);$("props").classList.toggle("hidden",!e);
  $("multiTools")?.classList.toggle("hidden",selected.size<2);
  if(!e)return;
  for(const [id,k] of [["propX","x"],["propY","y"],["propW","w"]])$(id).value=Math.round(e[k]*10)/10;$("propH").value=Math.round(elementVisualHeight(e)*10)/10;
  $("propH").disabled=e.type==="table";$("propH").title=e.type==="table"?"表格高度由表头和各行高度自动计算":"";
  $("elementTypeBadge").textContent=elementTypeName(e.type);
  ["textProps","imageProps","tableProps","codeProps","shapeProps"].forEach(id=>$(id).classList.add("hidden"));
  if(["text","field"].includes(e.type)){
    $("textProps").classList.remove("hidden");$("propText").value=e.text||"";$("propField").value=e.field||"";$("propFontSize").value=e.fontSize||11;$("propWeight").value=e.fontWeight||"400";$("textWrap").value=String(e.wrap!==false);$("textMaxLines").value=e.maxLines||0;$("textOverflow").value=e.overflowMode||"clip";$("textEmptyBehavior").value=e.emptyBehavior||"blank";
    document.querySelectorAll("[data-align]").forEach(b=>b.classList.toggle("active",b.dataset.align===(e.align||"left")));
  }
  if(e.type==="image"){
    $("imageProps").classList.remove("hidden");$("imageField").value=e.field||"";$("imageFit").value=e.imageFit||"contain";$("imageRadius").value=e.radius||0;$("imageAspectLock").value=String(e.aspectLock!==false);$("imageAlignX").value=e.alignX||"center";$("imageAlignY").value=e.alignY||"center";$("imagePadding").value=e.padding||0;$("imageEmptyBehavior").value=e.emptyBehavior||"hide";
  }
  if(e.type==="table"){
    $("tableProps").classList.remove("hidden");$("tableDataField").value=e.dataField||"";renderTableColumnEditor(e);$("tableHeader").value=String(e.showHeader!==false);$("tableZebra").value=String(!!e.zebra);$("tableImageFit").value=e.tableImageFit||"contain";$("tableWrap").value=String(e.wrap!==false);$("tableHideEmptyColumns").value=String(e.hideEmptyColumns!==false);$("tableEmptyBehavior").value=e.emptyBehavior||"hide";$("tableRowMode").value=e.autoRowHeight===false?"fixed":"auto";$("tableFixedRowHeightGroup")?.classList.toggle("hidden",e.autoRowHeight!==false);$("tableRowHeight").value=e.rowHeight||8;$("tableMaxRows").value=e.maxRows||5;$("tableBorderWidth").value=e.borderWidth??.5;$("tableFontSize").value=e.fontSize||9;updateTableFitState(e);
    syncTableCellInspector(e);
  }
  if(e.type!=="table")$("tableCellInspector")?.classList.add("hidden");
  if(["barcode","qrcode"].includes(e.type)){
    $("codeProps").classList.remove("hidden");$("codeField").value=e.field||"";$("barcodeOnly").classList.toggle("hidden",e.type!=="barcode");$("qrOnly").classList.toggle("hidden",e.type!=="qrcode");
    $("barcodeFormat").value=e.barcodeFormat||"CODE128";$("barcodeText").value=String(e.showText!==false);$("barcodeFontSize").value=e.barcodeFontSize||8;$("qrLevel").value=e.qrLevel||"M";$("qrMargin").value=e.qrMargin??0;
  }
  if(["line","container"].includes(e.type)){
    $("shapeProps").classList.remove("hidden");$("shapeBorderWidth").value=e.borderWidth??.5;$("shapeRadius").value=e.radius||0;$("shapeBorderStyle").value=e.borderStyle||"solid";
  }
  $("lockBtn").textContent=e.locked?"解锁":"锁定";$("hideBtn").textContent=e.hidden?"显示":"隐藏";
}
function updateProps(ev){
  const e=selectedOne();if(!e)return;
  const targetId=ev?.target?.id||"";
  e.x=Number($("propX").value)||0;e.y=Number($("propY").value)||0;e.w=Math.max(.5,Number($("propW").value)||1);if(e.type!=="table"){if(targetId==="propH")e.autoHeight=false;e.h=Math.max(.5,Number($("propH").value)||1);}

  if(["text","field"].includes(e.type)){e.text=$("propText").value;e.field=$("propField").value;e.fontSize=Math.max(6,Number($("propFontSize").value)||11);e.fontWeight=$("propWeight").value;e.wrap=$("textWrap").value==="true";e.maxLines=Math.max(0,Number($("textMaxLines").value)||0);e.overflowMode=$("textOverflow").value;e.emptyBehavior=$("textEmptyBehavior").value;if(e.type==="field"&&e.field)e.text="{{"+e.field+"}}";if(["propText","propField","propFontSize","propWeight","textWrap","propW"].includes(targetId)&&e.autoHeight!==false){e.autoHeight=true;syncAutoTextHeight(e)}}
  if(e.type==="image"){e.field=$("imageField").value;e.imageFit=$("imageFit").value;e.radius=Math.max(0,Number($("imageRadius").value)||0);e.aspectLock=$("imageAspectLock").value==="true";e.alignX=$("imageAlignX").value;e.alignY=$("imageAlignY").value;e.padding=Math.max(0,Number($("imagePadding").value)||0);e.emptyBehavior=$("imageEmptyBehavior").value}

  if(e.type==="table"){
    e.dataField=$("tableDataField").value;e.showHeader=$("tableHeader").value==="true";e.zebra=$("tableZebra").value==="true";e.tableImageFit=$("tableImageFit").value;e.wrap=$("tableWrap").value==="true";e.hideEmptyColumns=$("tableHideEmptyColumns").value==="true";e.emptyBehavior=$("tableEmptyBehavior").value;e.autoRowHeight=$("tableRowMode").value!=="fixed";e.rowHeight=Math.max(4,Number($("tableRowHeight").value)||8);e.maxRows=Math.max(1,Number($("tableMaxRows").value)||5);e.borderWidth=Math.max(0,Number($("tableBorderWidth").value)||0);e.fontSize=Math.max(6,Number($("tableFontSize").value)||9);$("tableFixedRowHeightGroup")?.classList.toggle("hidden",e.autoRowHeight);

    if(targetId==="tableCellText"&&$("tableCellText").value!==""){
      $("tableCellType").value="text";
    }else if(targetId==="tableCellField"&&$("tableCellField").value&&$("tableCellType").value!=="image"){
      $("tableCellType").value="field";
    }
    if(targetId.startsWith("tableCell"))applyTableCellInspector(e);
  }

  if(e.type==="barcode"){e.field=$("codeField").value;e.barcodeFormat=$("barcodeFormat").value;e.showText=$("barcodeText").value==="true";e.barcodeFontSize=Math.max(6,Math.min(24,Number($("barcodeFontSize").value)||8))}
  if(e.type==="qrcode"){e.field=$("codeField").value;e.qrLevel=$("qrLevel").value;e.qrMargin=Math.max(0,Number($("qrMargin").value)||0)}
  if(["line","container"].includes(e.type)){e.borderWidth=Math.max(0,Number($("shapeBorderWidth").value)||0);e.borderStyle=$("shapeBorderStyle").value;e.radius=Math.max(0,Number($("shapeRadius").value)||0)}

  clampElementToPage(e);refreshElementNode(e);syncGeometryProps(e);autoSave();
  if(e.type==="table"){updateTableFitState(e);if(targetId.startsWith("tableCell"))syncTableCellInspector(e)}
}
function layerLabel(e){
  if(e.name)return e.name;
  if(e.type==="field")return e.label?.replace(/[：:]$/,"")||e.field||"数据字段";
  if(e.type==="table")return"明细表格";
  if(e.type==="image")return e.field?("图片 · "+e.field):"图片";
  if(e.type==="barcode")return"条码 · "+(e.field||"");
  if(e.type==="qrcode")return"二维码 · "+(e.field||"");
  if(e.type==="text")return(e.text||"文本").slice(0,18);
  return elementTypeName(e.type)
}
function layerIcon(type){return({text:"T",field:"{}",image:"▧",table:"▦",barcode:"|||",qrcode:"▦",line:"—",container:"□"})[type]||"•"}
function reorderLayersFromDom(){
  const visibleOrder=[...$("layerList").querySelectorAll(".layer-row")].map(n=>n.dataset.id);
  if(!visibleOrder.length)return;
  const visibleSet=new Set(visibleOrder),topOrder=[...current().elements].reverse().map(e=>e.id);
  let cursor=0;
  const mergedTop=topOrder.map(id=>visibleSet.has(id)?visibleOrder[cursor++]:id);
  const map=new Map(current().elements.map(e=>[e.id,e]));
  current().elements=mergedTop.reverse().map(id=>map.get(id)).filter(Boolean);
  renderElements();renderLayers();commitEdit()
}
function renderLayers(){
  const list=$("layerList"),query=($("layerSearch")?.value||"").trim().toLowerCase();list.innerHTML="";
  [...current().elements].reverse().forEach(e=>{
    const label=layerLabel(e);if(query&&!label.toLowerCase().includes(query)&&!e.type.includes(query))return;
    const r=document.createElement("div");
    r.className="layer-row"+(selected.has(e.id)?" active":"")+(e.hidden?" hidden-layer":"")+(e.locked?" locked-layer":"");
    r.dataset.id=e.id;r.draggable=true;
    const drag=document.createElement("span");drag.className="layer-drag";drag.textContent="⋮⋮";drag.title="拖动调整层级";
    const type=document.createElement("span");type.className="layer-type";type.textContent=layerIcon(e.type);type.title=elementTypeName(e.type);
    const name=document.createElement("span");name.className="layer-name";name.textContent=label;name.title="双击重命名";
    const eye=document.createElement("button");eye.className="layer-icon-btn";eye.type="button";eye.title=e.hidden?"显示":"隐藏";eye.textContent=e.hidden?"○":"●";
    const lock=document.createElement("button");lock.className="layer-icon-btn";lock.type="button";lock.title=e.locked?"解锁":"锁定";lock.textContent=e.locked?"◆":"◇";
    r.append(drag,type,name,eye,lock);

    r.onclick=ev=>{if(ev.target.closest("button")||ev.target.classList.contains("layer-drag")||ev.target.tagName==="INPUT")return;const previous=new Set(selected);selectElements(e.id);refreshSelectionVisuals(previous)};
    eye.onclick=ev=>{ev.stopPropagation();e.hidden=!e.hidden;refreshElementNode(e);renderLayers();commitEdit()};
    lock.onclick=ev=>{ev.stopPropagation();e.locked=!e.locked;refreshElementNode(e);renderLayers();commitEdit()};
    name.ondblclick=ev=>{
      ev.stopPropagation();const input=document.createElement("input");input.className="layer-name-input";input.value=e.name||label;name.replaceWith(input);input.focus();input.select();
      const done=()=>{e.name=input.value.trim()||"";renderLayers();commitEdit()};input.onblur=done;input.onkeydown=k=>{if(k.key==="Enter")input.blur();if(k.key==="Escape"){input.value=e.name||label;input.blur()}}
    };
    r.onmouseenter=()=>document.querySelector('.design-element[data-id="'+e.id+'"]')?.classList.add("layer-hover");
    r.onmouseleave=()=>document.querySelector('.design-element[data-id="'+e.id+'"]')?.classList.remove("layer-hover");
    r.ondragstart=ev=>{r.classList.add("dragging");ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/layer-id",e.id)};
    r.ondragend=()=>{r.classList.remove("dragging");list.querySelectorAll(".drag-over").forEach(x=>x.classList.remove("drag-over"))};
    r.ondragover=ev=>{ev.preventDefault();r.classList.add("drag-over");ev.dataTransfer.dropEffect="move"};
    r.ondragleave=()=>r.classList.remove("drag-over");
    r.ondrop=ev=>{
      ev.preventDefault();r.classList.remove("drag-over");
      const id=ev.dataTransfer.getData("text/layer-id");if(!id||id===e.id)return;
      const moving=list.querySelector('.layer-row[data-id="'+id+'"]');if(!moving)return;
      const box=r.getBoundingClientRect();list.insertBefore(moving,ev.clientY<box.top+box.height/2?r:r.nextSibling);reorderLayersFromDom()
    };
    list.appendChild(r)
  })
}
function applyMulti(cmd){
  const els=current().elements.filter(e=>selected.has(e.id));if(els.length<2)return;
  const left=Math.min(...els.map(e=>e.x)),right=Math.max(...els.map(e=>e.x+e.w)),top=Math.min(...els.map(e=>e.y)),bottom=Math.max(...els.map(e=>e.y+elementVisualHeight(e)));
  if(cmd==="left")els.forEach(e=>e.x=left);
  if(cmd==="right")els.forEach(e=>e.x=right-e.w);
  if(cmd==="hcenter"){const center=(left+right)/2;els.forEach(e=>e.x=center-e.w/2)}
  if(cmd==="top")els.forEach(e=>e.y=top);
  if(cmd==="bottom")els.forEach(e=>e.y=bottom-elementVisualHeight(e));
  if(cmd==="vcenter"){const center=(top+bottom)/2;els.forEach(e=>e.y=center-elementVisualHeight(e)/2)}
  if(cmd==="distributeH"&&els.length>2){const s=[...els].sort((a,b)=>a.x-b.x);const occupied=s.reduce((n,e)=>n+e.w,0);const gap=Math.max(0,(right-left-occupied)/(s.length-1));let x=left;s.forEach(e=>{e.x=x;x+=e.w+gap})}
  if(cmd==="distributeV"&&els.length>2){const s=[...els].sort((a,b)=>a.y-b.y);const occupied=s.reduce((n,e)=>n+elementVisualHeight(e),0);const gap=Math.max(0,(bottom-top-occupied)/(s.length-1));let y=top;s.forEach(e=>{e.y=y;y+=elementVisualHeight(e)+gap})}
  els.forEach(updateElementNodeGeometry);syncProps();commitEdit()
}
function autoSave(immediate=false){
  const t=current();if(!t)return;
  t.name=$("templateName").value.trim()||"未命名模板";
  markTemplateEdited(t);
  const stateNode=$("saveState");
  if(isBuiltinTemplate(t)){
    clearTimeout(saveTimer);
    if(stateNode)stateNode.innerHTML="<i></i>内置模板 · 添加到我的模板库后保存";
    return
  }
  if(stateNode)stateNode.innerHTML="<i></i>保存中";
  clearTimeout(saveTimer);
  const commit=()=>{
    const persisted=saveTemplates(state.templates);
    if(stateNode)stateNode.innerHTML=persisted?"<i></i>已自动保存":"<i></i>当前会话已保存";
    if(!persisted)console.warn("模板未写入持久存储，当前仅保存在本次会话");
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage({type:"SUPER_PRINT_TEMPLATE_SAVE",template:structuredClone(t)},bridgeTargetOrigin());
      }
    }catch(err){console.warn("template sync to opener failed",err)}
  };
  if(immediate)commit();else saveTimer=setTimeout(commit,140);
}
function del(){if(!selected.size)return;current().elements=current().elements.filter(e=>!selected.has(e.id));selected.clear();clearTableSelection();renderAll();commitEdit()}
function duplicate(){const els=current().elements.filter(e=>selected.has(e.id));const ids=[];for(const e of els){const c=structuredClone(e);c.id=uid("el");c.x+=4;c.y+=4;c.locked=false;clampElementToPage(c);current().elements.push(c);ids.push(c.id)}selectElements(ids);renderAll();commitEdit()}
function moveLayer(front){const t=current(),ids=[...selected];const take=t.elements.filter(e=>ids.includes(e.id)),rest=t.elements.filter(e=>!ids.includes(e.id));t.elements=front?[...rest,...take]:[...take,...rest];renderAll();commitEdit()}
function toggleKey(k){const els=current().elements.filter(e=>selected.has(e.id));for(const e of els)e[k]=!e[k];els.forEach(refreshElementNode);renderLayers();syncProps();commitEdit()}
function showContext(ev,id){ev.preventDefault();const previous=new Set(selected);selectElements(id);refreshSelectionVisuals(previous);const m=$("contextMenu");m.style.left=ev.clientX+"px";m.style.top=ev.clientY+"px";m.classList.remove("hidden")}
function setZoom(v,mode="manual"){
  zoom=Math.max(25,Math.min(180,Number(v)));
  zoomMode=mode;
  const layer=$("zoomLayer");
  layer.style.transform="none";
  layer.style.zoom=zoom/100;
  $("zoomRange").value=zoom;
  $("zoomText").textContent=Math.round(zoom)+"%";
  $("fitBtn").classList.toggle("active",zoomMode==="fit");
}
function fitCanvas(){
  const scroller=$("canvasScroller"),page=$("printPage"),pad=document.querySelector(".page-pad"),top=$("topRuler"),left=$("leftRuler");
  if(!scroller||!page||!pad)return;
  const cs=getComputedStyle(pad);
  const naturalW=(left?.offsetWidth||25)+page.offsetWidth+parseFloat(cs.paddingLeft||0)+parseFloat(cs.paddingRight||0);
  const naturalH=(top?.offsetHeight||23)+page.offsetHeight+parseFloat(cs.paddingTop||0)+parseFloat(cs.paddingBottom||0);
  const sx=(scroller.clientWidth-12)/Math.max(1,naturalW);
  const sy=(scroller.clientHeight-12)/Math.max(1,naturalH);
  setZoom(Math.floor(Math.min(sx,sy,1.25)*100),"fit");
  requestAnimationFrame(()=>{scroller.scrollLeft=0;scroller.scrollTop=0});
}
function initResponsivePanels(){
  const grid=$("designerGrid")||document.querySelector(".designer-grid");
  if(!grid)return;
  const compact=window.innerWidth<=900;
  if(compact){
    grid.classList.remove("left-open","right-open");
  }
}
function setPreview(v){preview=v;document.body.classList.toggle("preview-mode",v);$("previewBtn").textContent=v?"退出预览":"实际预览";renderElements()}
async function testPrint(){
  const t=current();if(!t)return;
  try{await printTemplateRecords(t,[state.record||{data:{}}])}
  catch(err){console.error(err);toast(err?.message||"打印失败")}
}
function bind(){document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("componentsTab").classList.toggle("hidden",b.dataset.tab!=="components");$("fieldsTab").classList.toggle("hidden",b.dataset.tab!=="fields")});document.querySelectorAll(".rtab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".rtab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("propsTab").classList.toggle("hidden",b.dataset.rtab!=="props");$("layersTab").classList.toggle("hidden",b.dataset.rtab!=="layers")});
document.querySelectorAll(".component-palette button").forEach(b=>{b.onclick=()=>addElement(b.dataset.type);b.ondragstart=e=>{dragType=b.dataset.type;e.dataTransfer.setData("text/plain",dragType)}});$("printPage").ondragover=e=>e.preventDefault();$("printPage").addEventListener("pointerdown",beginMarqueeSelection);$("printPage").ondrop=e=>{e.preventDefault();const r=$("printPage").getBoundingClientRect(),type=e.dataTransfer.getData("text/plain")||dragType;let field="";let t=type;if(type.startsWith("field:")){t="field";field=type.slice(6)}addElement(t,(e.clientX-r.left)/(zoom/100)/MM,(e.clientY-r.top)/(zoom/100)/MM,field)};
for(const id of ["propX","propY","propW","propH","propText","propField","propFontSize","propWeight","imageField","imageFit","imageRadius","imageAspectLock","imageAlignX","imageAlignY","imagePadding","imageEmptyBehavior","textWrap","textMaxLines","textOverflow","textEmptyBehavior","tableDataField","tableHeader","tableRowMode","tableZebra","tableImageFit","tableWrap","tableHideEmptyColumns","tableEmptyBehavior","tableRowHeight","tableMaxRows","tableBorderWidth","tableFontSize","tableCellType","tableCellField","tableCellText","tableCellAlign","tableCellVAlign","tableCellPadding","tableCellWrap","tableCellImageFit","codeField","barcodeFormat","barcodeText","barcodeFontSize","qrLevel","qrMargin","shapeBorderWidth","shapeRadius","shapeBorderStyle"]){const el=$(id);if(!el)continue;el.addEventListener("input",updateProps);el.addEventListener("change",e=>{updateProps(e);pushHistory()})}document.querySelectorAll("[data-align]").forEach(b=>b.onclick=()=>{const e=selectedOne();if(!e)return;e.align=b.dataset.align;refreshElementNode(e);syncProps();commitEdit()});
document.querySelectorAll("[data-multi]").forEach(b=>b.onclick=()=>applyMulti(b.dataset.multi));$("duplicateBtn").onclick=duplicate;$("deleteBtn").onclick=del;$("applyPrintCalibration").onclick=applyPrintCalibration;$("lockBtn").onclick=()=>toggleKey("locked");$("hideBtn").onclick=()=>toggleKey("hidden");$("frontBtn").onclick=()=>moveLayer(true);$("backBtn").onclick=()=>moveLayer(false);$("applyPage").onclick=()=>applyPage(true);$("pagePreset").onchange=e=>{if(e.target.value!=="custom"){const [w,h]=e.target.value.split("x");$("pageW").value=w;$("pageH").value=h;applyPage(true)}};$("gridToggle").onchange=e=>{$("printPage").classList.toggle("grid-on",grid=e.target.checked)};$("snapToggle").onchange=e=>snap=e.target.checked;$("safeToggle").onchange=e=>$("safeGuide").classList.toggle("hidden",!e.target.checked);$("zoomRange").oninput=e=>setZoom(e.target.value,"manual");$("zoomOut").onclick=()=>setZoom(zoom-5,"manual");$("zoomIn").onclick=()=>setZoom(zoom+5,"manual");$("fitBtn").onclick=fitCanvas;$("previewBtn").onclick=()=>setPreview(!preview);$("printBtn").onclick=testPrint;$("templateName").onchange=autoSave;$("undoBtn").onclick=()=>restore(hIndex-1);$("redoBtn").onclick=()=>restore(hIndex+1);$("fullBtn").onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},120)}catch{toast("浏览器未允许全屏")}};$("quickBtn").onclick=()=>{if(window.opener&&!window.opener.closed){window.opener.focus();window.close()}else{location.href="./index.html"}};
$("leftToggle").onclick=()=>{
  const g=document.querySelector(".designer-grid");
  if(window.innerWidth<=900){g.classList.toggle("left-open");if(g.classList.contains("left-open"))g.classList.remove("right-open")}
  else g.classList.toggle("left-collapsed");
  setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},80);
};
$("addToMineBtn").onclick=addCurrentToMyLibrary;
$("saveTemplateBtn").onclick=()=>saveCurrentTemplateToCloud();
$("saveAsTemplateBtn").onclick=saveAsTemplate;
$("deleteTemplateBtn").onclick=deleteCurrentTemplate;
$("rightToggle").onclick=()=>{
  const g=document.querySelector(".designer-grid");
  if(window.innerWidth<=900){g.classList.toggle("right-open");if(g.classList.contains("right-open"))g.classList.remove("left-open")}
  else g.classList.toggle("right-collapsed");
  setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},80);
};$("newBtn").onclick=()=>{const t=createTemplate();state.templates.push(t);state.activeTemplateId=t.id;history=[];hIndex=-1;selected.clear();clearTableSelection();renderAll();commitEdit()};$("fieldSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll(".field-item").forEach(n=>n.classList.toggle("hidden",!n.textContent.toLowerCase().includes(q)))};$("syncDataBtn").onclick=()=>{const r=syncBridgeData(true,null,{force:true});if(r.templateChanged)renderAll();else{renderElements();syncProps()}};$("autoBindBtn").onclick=autoBindNow;$("addTableColumn").onclick=addTableColumn;$("smartFitTable").onclick=smartFitSelectedTable;$("normalizeTableWidths").onclick=()=>normalizeTableWidths(true);
$("layerSearch").oninput=renderLayers;
$("contextMenu").onclick=e=>{const c=e.target.dataset.cmd;if(c==="duplicate")duplicate();if(c==="front")moveLayer(true);if(c==="back")moveLayer(false);if(c==="lock")toggleKey("locked");if(c==="delete")del();$("contextMenu").classList.add("hidden")};document.addEventListener("click",()=>$("contextMenu").classList.add("hidden"));document.addEventListener("keydown",e=>{const editing=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)||!!document.activeElement?.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="p"){e.preventDefault();testPrint();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveCurrentTemplateToCloud();return}if(editing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();restore(hIndex-1);return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();restore(hIndex+1);return}if(e.key==="Escape"&&selectedCells.length){e.preventDefault();const t=selectedOne();clearTableSelection();if(t?.type==="table")refreshElementNode(t);syncProps();return}if(e.key==="Escape"&&selected.size){e.preventDefault();const previous=new Set(selected);selected.clear();refreshSelectionVisuals(previous);return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="m"&&selectedCells.length){e.preventDefault();const t=selectedOne();selectionHasMerge(t)?unmergeSelectedCells():mergeSelectedCells();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="a"){e.preventDefault();const previous=new Set(selected);clearTableSelection();selected=new Set(current().elements.filter(x=>!x.hidden).map(x=>x.id));refreshSelectionVisuals(previous);return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="c"&&selectedCells.length){e.preventDefault();copySelectedTableCells();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="v"&&selectedCells.length){e.preventDefault();pasteSelectedTableCells();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="c"&&selected.size){e.preventDefault();copySelectedElements();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="v"&&elementClipboard.length){e.preventDefault();pasteSelectedElements();return}if((e.key==="Delete"||e.key==="Backspace")&&selectedCells.length){e.preventDefault();clearSelectedTableCells();return}if((e.key==="Delete"||e.key==="Backspace")&&selected.size){e.preventDefault();del();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){e.preventDefault();duplicate();return}const step=e.altKey?.1:(e.shiftKey?5:.5);if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)&&selected.size){e.preventDefault();nudgeSelection(e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0,e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0)}})}
window.addEventListener("storage",e=>{if(e.key===STORAGE_KEYS.bridge){const r=syncBridgeData(false);if(!r.updated)return;if(r.templateChanged)renderAll();else{renderElements();syncProps()}}});
onBridgeMessage(payload=>{const r=syncBridgeData(false,payload);if(!r.updated)return;if(r.templateChanged)renderAll();else{renderElements();syncProps()}});
window.addEventListener("resize",()=>{clearTimeout(window.__spResize);window.__spResize=setTimeout(()=>{initResponsivePanels();if(zoomMode==="fit")fitCanvas()},100)});
document.addEventListener("fullscreenchange",()=>setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},120));
window.addEventListener("beforeunload",()=>{flushNudge();if(saveTimer){clearTimeout(saveTimer);autoSave(true)}});
bind();
load().then(()=>{initResponsivePanels();requestAnimationFrame(()=>fitCanvas())});