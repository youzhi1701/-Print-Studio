import {state,uid,STORAGE_KEYS} from "./state.js?v=20261005-1";import {loadTemplates,saveTemplates,createTemplate,autoBindTemplateFields} from "./templates.js?v=20261005-1";import {readBridge,requestBridgeFromOpener,onBridgeMessage} from "./bridge.js?v=20261005-1";import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-1";
const MM=96/25.4,$=id=>document.getElementById(id);let selected=new Set(),selectedCells=[],zoom=75,zoomMode="fit",grid=true,snap=true,preview=false,history=[],hIndex=-1,dragType=null,toastTimer;
function toast(m){const n=$("toast");n.textContent=m;n.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove("show"),1500)}
function current(){return state.templates.find(t=>t.id===state.activeTemplateId)}
function pushHistory(){const t=current();if(!t)return;history=history.slice(0,hIndex+1);history.push(JSON.stringify(t));if(history.length>60)history.shift();hIndex=history.length-1;updateUndo()}
function restore(i){if(i<0||i>=history.length)return;const old=current();const parsed=JSON.parse(history[i]);const idx=state.templates.findIndex(t=>t.id===old.id);state.templates[idx]=parsed;hIndex=i;renderAll();updateUndo()}
function updateUndo(){$("undoBtn").disabled=hIndex<=0;$("redoBtn").disabled=hIndex>=history.length-1}
async function load(){state.templates=loadTemplates();const qs=new URLSearchParams(location.search).get("template");state.activeTemplateId=(qs&&state.templates.some(t=>t.id===qs))?qs:state.templates[0]?.id;const payload=await requestBridgeFromOpener();syncBridgeData(false,payload);renderAll();pushHistory()}
function populateFields(){
  const list=$("fieldList");
  const selects=["propField","imageField","codeField","tableDataField"].map(id=>$(id)).filter(Boolean);
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
function syncBridgeData(showToast=true,provided=null){
  const bridge=provided||readBridge();
  state.fields=bridge?.fields||[];
  state.record=bridge?.record||null;
  state.selectedRecords=bridge?.selectedRecords||[];
  if(bridge?.template?.id){
    const incoming=structuredClone(bridge.template);
    const i=state.templates.findIndex(t=>t.id===incoming.id);
    if(i>=0)state.templates[i]=incoming;else state.templates.push(incoming);
    state.activeTemplateId=incoming.id;
    saveTemplates(state.templates);
  }
  populateFields();
  const changed=autoBindTemplateFields(current(),state.fields);
  if(changed) saveTemplates(state.templates);
  const label=$("dataSyncState");
  if(label) label.textContent=state.fields.length?("已识别 "+state.fields.length+" 个字段"+(state.record?" · 已载入当前记录":"")):"未读取到飞书字段";
  if(showToast) toast(state.fields.length?("已同步 "+state.fields.length+" 个字段"):"未读取到字段，请先在快捷模式选择记录");
  return changed;
}
function autoBindNow(){
  const changed=autoBindTemplateFields(current(),state.fields);
  if(changed){saveTemplates(state.templates);renderAll();toast("已按字段名称自动绑定")}else{toast(state.fields.length?"当前字段已完成匹配":"没有可绑定的飞书字段")}
}
function renderAll(){const t=current();if(!t)return;$("templateName").value=t.name;$("pageW").value=t.page.width;$("pageH").value=t.page.height;$("safeArea").value=t.page.safeArea??4;applyPage(false);renderElements();renderLayers();syncProps();$("selectionState").textContent=(t.elements?.length||0)+" 个元素"}
function applyPage(save=true){const t=current();if(!t)return;const w=Math.max(20,Number($("pageW").value)||215),h=Math.max(20,Number($("pageH").value)||140),safe=Math.max(0,Number($("safeArea").value)||0);t.page.width=w;t.page.height=h;t.page.safeArea=safe;const p=$("printPage");p.style.width=w*MM+"px";p.style.height=h*MM+"px";const s=$("safeGuide");s.style.inset=safe*MM+"px";$("pageInfo").textContent=w+" × "+h+" mm";drawRulers(w,h);if(save){t.updatedAt=Date.now();pushHistory();autoSave();toast("页面尺寸已更新")}}
function drawRulers(w,h){const tr=$("topRuler"),lr=$("leftRuler");tr.innerHTML="";lr.innerHTML="";tr.style.width=w*MM+"px";lr.style.height=h*MM+"px";for(let m=0;m<=w;m+=10){const n=document.createElement("span");n.textContent=m;n.style.cssText="position:absolute;left:"+(m*MM)+"px;top:5px";tr.appendChild(n)}for(let m=0;m<=h;m+=10){const n=document.createElement("span");n.textContent=m;n.style.cssText="position:absolute;top:"+(m*MM)+"px;left:3px;transform:rotate(-90deg);transform-origin:left top";lr.appendChild(n)}}
function normalizeColumns(cols){
  let out;
  if(!Array.isArray(cols)||!cols.length) out=[
    {title:"商品名称",field:"商品名称",width:45,align:"left"},
    {title:"商品属性",field:"商品属性",width:25,align:"center"},
    {title:"数量",field:"数量",width:15,align:"center"},
    {title:"价格",field:"价格",width:15,align:"right"}
  ];
  else out=cols.map((col,i)=>{
    if(typeof col==="string")return{title:col,field:col,width:null,align:i===0?"left":"center"};
    return{title:col.title||col.field||("列"+(i+1)),field:col.field||col.title||"",width:col.width??null,align:col.align||"center"};
  });
  const valid=out.every(x=>Number.isFinite(Number(x.width))&&Number(x.width)>0);
  if(!valid){
    const base=100/out.length;out.forEach(x=>x.width=base);
  }else{
    const sum=out.reduce((n,x)=>n+Number(x.width),0)||100;
    out.forEach(x=>x.width=Number(x.width)*100/sum);
  }
  return out;
}
function columnConfigString(cols){
  return normalizeColumns(cols).map(c=>c.title+"="+c.field+(c.width?("@"+c.width):"")).join(",");
}
function parseColumnConfig(text){
  const parts=String(text||"").split(/[，,\n]/).map(s=>s.trim()).filter(Boolean);
  if(!parts.length)return normalizeColumns([]);
  return parts.map((part,i)=>{
    let width=null;let body=part;
    const at=body.lastIndexOf("@");
    if(at>0){const n=Number(body.slice(at+1));if(Number.isFinite(n)&&n>0){width=n;body=body.slice(0,at)}}
    const eq=body.indexOf("=");
    const title=(eq>=0?body.slice(0,eq):body).trim();
    const field=(eq>=0?body.slice(eq+1):body).trim();
    return{title:title||field||("列"+(i+1)),field:field||title,width,align:i===0?"left":(i===parts.length-1?"right":"center")};
  });
}
function parseMaybeRows(value){
  if(Array.isArray(value))return value;
  if(value&&typeof value==="object")return[value];
  if(typeof value==="string"){
    const t=value.trim();
    if(!t)return[];
    try{const v=JSON.parse(t);if(Array.isArray(v))return v;if(v&&typeof v==="object")return[v]}catch{}
    return t.split(/\r?\n/).filter(Boolean).map(x=>({value:x}));
  }
  return[];
}
function rowsForTable(e,data){
  if(e.dataField){
    const rows=parseMaybeRows(data?.[e.dataField]);
    if(rows.length)return rows;
  }
  return[data||{}];
}
function isImageValue(v){
  return typeof v==="string"&&(v.startsWith("data:image/")||/^https?:\/\//i.test(v));
}
function tableCellHtml(v,field,imageFit="contain"){
  if(isImageValue(v)) return '<div class="table-image-box"><img class="table-cell-image" data-fit="'+imageFit+'" src="'+String(v).replace(/"/g,"&quot;")+'" referrerpolicy="no-referrer" alt="'+String(field||"")+'"></div>';
  return String(v??"");
}
function elementTypeName(type){
  return({text:"文本",field:"数据字段",image:"图片",table:"明细表格",barcode:"条码",qrcode:"二维码",line:"分隔线",container:"容器"})[type]||type;
}
function defaults(type,field=""){
  const b={id:uid("el"),type,x:20,y:20,w:45,h:10,text:"",field,fontSize:11,fontWeight:"400",align:"left",locked:false,hidden:false};
  if(type==="text"){b.text="双击或在右侧修改文字";b.w=58;b.wrap=true;b.maxLines=0;b.overflowMode="clip";b.emptyBehavior="blank"}
  if(type==="field"){b.text="{{"+(field||"字段")+"}}";b.field=field;b.w=50;b.wrap=true;b.maxLines=0;b.overflowMode="clip";b.emptyBehavior="hide"}
  if(type==="image"){b.w=30;b.h=25;b.field=field;b.imageFit="contain";b.radius=0;b.aspectLock=true;b.alignX="center";b.alignY="center";b.padding=0;b.emptyBehavior="hide"}
  if(type==="table"){b.w=115;b.h=38;b.columns=normalizeColumns([]);b.showHeader=true;b.zebra=false;b.rowHeight=8;b.maxRows=5;b.designRowCount=1;b.borderWidth=.5;b.fontSize=9;b.dataField="";b.tableImageFit="contain";b.wrap=true;b.hideEmptyColumns=false;b.merges=[]}
  if(type==="barcode"){b.w=62;b.h=20;b.field=field||"订单编号";b.showText=true;b.barcodeFormat="CODE128"}
  if(type==="qrcode"){b.w=25;b.h=25;b.field=field||"订单编号";b.qrLevel="M";b.qrMargin=0}
  if(type==="line"){b.w=70;b.h=.5;b.borderWidth=.5;b.borderStyle="solid"}
  if(type==="container"){b.w=70;b.h=34;b.borderWidth=.5;b.borderStyle="solid";b.radius=0}
  return b
}
function addElement(type,x=25,y=25,field=""){const t=current();const e=defaults(type,field);e.x=x;e.y=y;t.elements.push(e);selected=new Set([e.id]);renderElements();renderLayers();syncProps();pushHistory();autoSave();toast("已添加组件")}
function renderElements(){const p=$("printPage");p.querySelectorAll(".design-element").forEach(n=>n.remove());const t=current();for(const e of t.elements){const n=document.createElement("div");n.className="design-element "+e.type+"-el"+(selected.has(e.id)?" selected":"")+(e.locked?" locked":"")+(e.hidden?" hidden-element":"");n.dataset.id=e.id;n.style.left=e.x*MM+"px";n.style.top=e.y*MM+"px";n.style.width=e.w*MM+"px";n.style.height=Math.max(1,e.h*MM)+"px";n.style.fontSize=(e.fontSize||11)+"px";n.style.fontWeight=e.fontWeight||400;n.style.textAlign=e.align||"left";content(n,e);n.addEventListener("pointerdown",ev=>startMove(ev,e));n.addEventListener("click",ev=>{ev.stopPropagation();if(ev.shiftKey){selected.has(e.id)?selected.delete(e.id):selected.add(e.id)}else selected=new Set([e.id]);renderElements();renderLayers();syncProps()});n.addEventListener("contextmenu",ev=>showContext(ev,e.id));if(selected.has(e.id)&&!preview&&!e.locked)addHandles(n,e);p.appendChild(n)}}

function hasValue(v){return !(v===undefined||v===null||v==="")}
function applyTextBehavior(n,e){
  n.style.whiteSpace=e.wrap===false?"nowrap":"normal";
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
function tableColumnsForPreview(e,rows,data){
  const cols=normalizeColumns(e.columns).map((col,i)=>({...col,_index:i}));
  let visible=(preview&&e.hideEmptyColumns)?cols.filter(col=>rows.some(r=>hasValue(r?.[col.field]??data?.[col.field]))):cols;
  if(!visible.length)visible=cols;
  const sum=visible.reduce((n,col)=>n+(Number(col.width)||0),0)||100;
  return visible.map(col=>({...col,width:(Number(col.width)||0)*100/sum}));
}
function mergeAt(e,row,col){return (e.merges||[]).find(m=>m.row===row&&m.col===col)||null}
function coveredByMerge(e,row,col){return (e.merges||[]).some(m=>!(m.row===row&&m.col===col)&&row>=m.row&&row<m.row+(m.rowSpan||1)&&col>=m.col&&col<m.col+(m.colSpan||1))}
function selectTableCell(ev,e,row,col){
  ev.stopPropagation();
  if(!ev.shiftKey)selectedCells=[{row,col}];
  else if(!selectedCells.length)selectedCells=[{row,col}];
  else{
    const a=selectedCells[0],r0=Math.min(a.row,row),r1=Math.max(a.row,row),c0=Math.min(a.col,col),c1=Math.max(a.col,col);
    selectedCells=[];for(let r=r0;r<=r1;r++)for(let cc=c0;cc<=c1;cc++)selectedCells.push({row:r,col:cc});
  }
  selected=new Set([e.id]);renderElements();renderLayers();syncProps()
}
function content(n,e){
  const data=state.record?.data||{};
  if(e.type==="text"){n.textContent=e.text||"";applyTextBehavior(n,e);return}
  if(e.type==="field"){
    const actual=data[e.field];
    if(hasValue(actual))n.textContent=(e.label||"")+actual;
    else if(e.emptyBehavior==="hide"){n.style.display="none";return}
    else if(e.emptyBehavior==="blank")n.textContent="";
    else n.textContent=e.text||"{{"+(e.field||"字段")+"}}";
    applyTextBehavior(n,e);return
  }
  if(e.type==="image"){
    const src=data[e.field]||"";
    if(!src&&e.emptyBehavior==="hide"){n.style.display="none";return}
    n.style.padding=(e.padding||0)*MM+"px";
    n.innerHTML=src?'<img alt="" src="'+String(src).replace(/"/g,"&quot;")+'" referrerpolicy="no-referrer">':(e.emptyBehavior==="blank"?"":'<div class="image-placeholder">暂无图片'+(e.field?(" · "+e.field):"")+'</div>');
    const img=n.querySelector("img");
    if(img){
      img.style.width="100%";img.style.height="100%";img.style.display="block";
      img.style.objectFit=e.imageFit==="original"?"none":(e.imageFit||"contain");
      img.style.objectPosition=imagePosition(e);
      img.style.borderRadius=(e.radius||0)+"px";
      img.onerror=()=>{n.innerHTML='<div class="image-placeholder">图片加载失败</div>'}
    }
    return
  }
  if(e.type==="container"){n.style.border=(e.borderWidth??.5)+"px "+(e.borderStyle||"solid")+" rgba(80,100,140,.35)";n.style.borderRadius=(e.radius||0)+"px";return}
  if(e.type==="line"){n.style.borderTop=(e.borderWidth??.5)+"px "+(e.borderStyle||"solid")+" #17223c";return}
  if(e.type==="barcode"){
    n.innerHTML='<div class="barcode-bars"></div>'+(e.showText?'<div class="barcode-label">'+(preview?(data[e.field]??""):"{{"+(e.field||"字段")+"}}")+'</div>':"");
    return
  }
  if(e.type==="qrcode"){n.innerHTML='<div class="qr-placeholder"></div>';return}
  if(e.type==="table"){
    const sourceRows=rowsForTable(e,data).slice(0,e.maxRows||5);
    const rows=(sourceRows.length?sourceRows:[{}]).map(r=>r||{});
    const wanted=Math.max(rows.length,Number(e.designRowCount)||1);
    while(rows.length<wanted)rows.push({});
    const cols=tableColumnsForPreview(e,rows,data);
    const configuredCols=normalizeColumns(e.columns);
    const hasAnyData=sourceRows.some(row=>configuredCols.some(col=>hasValue(row?.[col.field]??data?.[col.field])));
    if(!hasAnyData&&e.emptyBehavior==="hide"&&!selected.has(e.id)){n.style.display="none";return}
    n.classList.toggle("wrap-on",e.wrap!==false);n.classList.toggle("wrap-off",e.wrap===false);
    const head=e.showHeader===false?"":("<thead><tr>"+cols.map(col=>'<th style="width:'+col.width+'%;text-align:'+col.align+'">'+col.title+"</th>").join("")+"</tr></thead>");
    const bodyRows=rows.map((row,ri)=>{
      let cells="";
      for(const col of cols){
        const ci=col._index;
        if(coveredByMerge(e,ri,ci))continue;
        const merge=mergeAt(e,ri,ci),actual=row?.[col.field]??data?.[col.field];
        const shown=hasValue(actual)?tableCellHtml(actual,col.field,e.tableImageFit||"contain"):"";
        const sel=selectedCells.some(s=>s.row===ri&&s.col===ci);
        const rh=(e.rowHeights&&Number(e.rowHeights[ri]))||e.rowHeight||8;
        cells+='<td class="table-edit-cell'+(sel?' cell-selected':'')+'" data-row="'+ri+'" data-col="'+ci+'" '+(merge&&merge.colSpan>1?'colspan="'+merge.colSpan+'" ':'')+(merge&&merge.rowSpan>1?'rowspan="'+merge.rowSpan+'" ':'')+'style="text-align:'+col.align+';height:'+rh*MM+'px">'+shown+"</td>";
      }
      return "<tr"+(e.zebra&&ri%2?' class="zebra"':"")+">"+cells+"</tr>";
    }).join("");
    n.innerHTML='<table style="font-size:'+(e.fontSize||9)+'px">'+head+"<tbody>"+bodyRows+"</tbody></table>";
    n.querySelectorAll("th").forEach(cell=>{cell.style.borderWidth=(e.borderWidth??.5)+"px";cell.style.height=(e.headerHeight||e.rowHeight||8)*MM+"px"});
    n.querySelectorAll("td").forEach(cell=>{cell.style.borderWidth=(e.borderWidth??.5)+"px"});
    n.querySelectorAll(".table-cell-image").forEach(img=>{img.style.objectFit=img.dataset.fit==="original"?"none":(img.dataset.fit||"contain");img.style.width="100%";img.style.height="100%"});
    n.querySelectorAll("td.table-edit-cell").forEach(cell=>cell.addEventListener("click",ev=>selectTableCell(ev,e,Number(cell.dataset.row),Number(cell.dataset.col))));
    if(selected.has(e.id)&&!preview&&!e.locked){addTableColumnResizers(n,e,normalizeColumns(e.columns));addTableRowResizers(n,e,rows.length)}
    return
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
  const sx=ev.clientX,widthPx=Math.max(1,node.getBoundingClientRect().width),a0=Number(left.width)||0,b0=Number(right.width)||0,total=a0+b0,min=5;
  const move=m=>{
    const delta=(m.clientX-sx)/widthPx*100;
    left.width=Math.max(min,Math.min(total-min,a0+delta));right.width=total-left.width;e.columns=cols;
    const table=node.querySelector("table"),heads=table?.querySelectorAll("th")||[];
    if(heads[index])heads[index].style.width=left.width+"%";if(heads[index+1])heads[index+1].style.width=right.width+"%";
  };
  const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);e.columns=normalizeColumns(cols);renderElements();renderTableColumnEditor(e);pushHistory();autoSave()};
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}
function addTableRowResizers(n,e,rowCount){
  const headerH=e.showHeader===false?0:(e.headerHeight||e.rowHeight||8);
  let y=headerH;
  for(let ri=0;ri<rowCount;ri++){
    y+=(e.rowHeights&&Number(e.rowHeights[ri]))||e.rowHeight||8;
    const h=document.createElement("span");
    h.className="table-row-resizer";h.style.top=y*MM+"px";h.dataset.row=ri;h.title="拖动调整此行高度";
    h.addEventListener("pointerdown",ev=>startTableRowResize(ev,e,ri));n.appendChild(h)
  }
}
function startTableRowResize(ev,e,rowIndex){
  ev.preventDefault();ev.stopPropagation();
  const sy=ev.clientY,factor=zoom/100;
  e.rowHeights={...(e.rowHeights||{})};
  const start=Number(e.rowHeights[rowIndex])||e.rowHeight||8;
  const move=m=>{e.rowHeights[rowIndex]=Math.max(4,start+(m.clientY-sy)/factor/MM);renderElements();syncProps()};
  const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);pushHistory();autoSave()};
  addEventListener("pointermove",move);addEventListener("pointerup",up)
}
function mergeSelectedCells(){
  const e=selectedOne();if(!e||e.type!=="table"||selectedCells.length<2){toast("先在表格内 Shift 选择连续单元格");return}
  const rs=selectedCells.map(s=>s.row),cs=selectedCells.map(s=>s.col),r0=Math.min(...rs),r1=Math.max(...rs),c0=Math.min(...cs),c1=Math.max(...cs);
  if((r1-r0+1)*(c1-c0+1)!==selectedCells.length){toast("只能合并连续矩形区域");return}
  e.merges=(e.merges||[]).filter(m=>m.row<r0||m.row>r1||m.col<c0||m.col>c1);e.merges.push({row:r0,col:c0,rowSpan:r1-r0+1,colSpan:c1-c0+1});
  selectedCells=[{row:r0,col:c0}];renderElements();pushHistory();autoSave()
}
function unmergeSelectedCells(){
  const e=selectedOne();if(!e||e.type!=="table"||!selectedCells.length)return;const s=selectedCells[0];
  e.merges=(e.merges||[]).filter(m=>!(s.row>=m.row&&s.row<m.row+(m.rowSpan||1)&&s.col>=m.col&&s.col<m.col+(m.colSpan||1)));
  renderElements();pushHistory();autoSave()
}
function insertTableRow(){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const currentRows=Math.max(1,Number(e.designRowCount)||1);
  e.designRowCount=currentRows+1;
  renderElements();pushHistory();autoSave();toast("已插入一行")
}
function deleteTableRow(){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const currentRows=Math.max(1,Number(e.designRowCount)||1);
  if(currentRows<=1){toast("表格至少保留一行");return}
  e.designRowCount=currentRows-1;
  e.merges=(e.merges||[]).filter(m=>m.row<e.designRowCount);
  selectedCells=selectedCells.filter(s=>s.row<e.designRowCount);
  renderElements();pushHistory();autoSave();toast("已删除一行")
}
function addHandles(n,e){for(const d of ["nw","n","ne","e","se","s","sw","w"]){const h=document.createElement("span");h.className="resize-handle "+d;h.dataset.dir=d;h.addEventListener("pointerdown",ev=>startResize(ev,e,d));n.appendChild(h)}}
function startMove(ev,e){if(preview||e.locked||ev.target.closest(".resize-handle,.table-col-resizer,.table-row-resizer,.table-edit-cell"))return;ev.preventDefault();ev.stopPropagation();if(!selected.has(e.id))selected=ev.shiftKey?new Set([...selected,e.id]):new Set([e.id]);const sx=ev.clientX,sy=ev.clientY,start=[...selected].map(id=>{const x=current().elements.find(v=>v.id===id);return{x,id,ox:x.x,oy:x.y}}),factor=zoom/100;const move=m=>{let dx=(m.clientX-sx)/factor/MM,dy=(m.clientY-sy)/factor/MM;if(snap){dx=Math.round(dx*2)/2;dy=Math.round(dy*2)/2}for(const a of start){a.x.x=Math.max(0,a.ox+dx);a.x.y=Math.max(0,a.oy+dy)}renderElements();syncProps()};const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);pushHistory();autoSave()};addEventListener("pointermove",move);addEventListener("pointerup",up)}
function startResize(ev,e,dir){ev.preventDefault();ev.stopPropagation();const sx=ev.clientX,sy=ev.clientY,o={x:e.x,y:e.y,w:e.w,h:e.h},factor=zoom/100,ratio=o.w/Math.max(.1,o.h);const move=m=>{let dx=(m.clientX-sx)/factor/MM,dy=(m.clientY-sy)/factor/MM;if(snap){dx=Math.round(dx*2)/2;dy=Math.round(dy*2)/2}if(dir.includes("e"))e.w=Math.max(2,o.w+dx);if(dir.includes("s"))e.h=Math.max(.5,o.h+dy);if(dir.includes("w")){e.x=o.x+dx;e.w=Math.max(2,o.w-dx)}if(dir.includes("n")){e.y=o.y+dy;e.h=Math.max(.5,o.h-dy)}if(e.type==="image"&&e.aspectLock!==false&&(dir.length===2)){if(Math.abs(dx)>=Math.abs(dy)){e.h=Math.max(.5,e.w/ratio);if(dir.includes("n"))e.y=o.y+(o.h-e.h)}else{e.w=Math.max(2,e.h*ratio);if(dir.includes("w"))e.x=o.x+(o.w-e.w)}}renderElements();syncProps()};const up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up);pushHistory();autoSave()};addEventListener("pointermove",move);addEventListener("pointerup",up)}
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

    const commit=()=>{col.title=title.value.trim()||field.value||("列"+(index+1));col.field=field.value||title.value.trim();col.width=Math.max(1,Number(width.value)||1);e.columns=cols;renderElements();autoSave()};
    title.addEventListener("input",commit);field.addEventListener("change",commit);width.addEventListener("input",commit);
    up.onclick=()=>{if(index<1)return;[cols[index-1],cols[index]]=[cols[index],cols[index-1]];e.columns=cols;renderTableColumnEditor(e);renderElements();autoSave()};
    down.onclick=()=>{if(index>=cols.length-1)return;[cols[index],cols[index+1]]=[cols[index+1],cols[index]];e.columns=cols;renderTableColumnEditor(e);renderElements();autoSave()};
    remove.onclick=()=>{if(cols.length<=1){toast("表格至少保留 1 列");return}cols.splice(index,1);e.columns=cols;renderTableColumnEditor(e);renderElements();autoSave()};
    row.append(move,title,field,width,remove);list.appendChild(row);
  });
  $("tableColumns").value=columnConfigString(cols);
}
function addTableColumn(){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const cols=normalizeColumns(e.columns);cols.push({title:"新列",field:"",width:Math.round(100/(cols.length+1)),align:"center"});e.columns=cols;
  normalizeTableWidths(false);renderTableColumnEditor(e);renderElements();autoSave()
}
function normalizeTableWidths(save=true){
  const e=selectedOne();if(!e||e.type!=="table")return;
  const cols=normalizeColumns(e.columns);const base=Math.floor(100/cols.length);let rest=100-base*cols.length;
  cols.forEach((col,i)=>{col.width=base+(i<rest?1:0)});e.columns=cols;
  renderTableColumnEditor(e);renderElements();if(save)autoSave()
}
function syncProps(){
  const e=selectedOne();
  $("noSelection").classList.toggle("hidden",!!e);$("props").classList.toggle("hidden",!e);
  $("multiTools")?.classList.toggle("hidden",selected.size<2);
  if(!e)return;
  for(const [id,k] of [["propX","x"],["propY","y"],["propW","w"],["propH","h"]])$(id).value=Math.round(e[k]*10)/10;
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
    $("tableProps").classList.remove("hidden");$("tableDataField").value=e.dataField||"";renderTableColumnEditor(e);$("tableHeader").value=String(e.showHeader!==false);$("tableZebra").value=String(!!e.zebra);$("tableImageFit").value=e.tableImageFit||"contain";$("tableWrap").value=String(e.wrap!==false);$("tableHideEmptyColumns").value=String(e.hideEmptyColumns!==false);$("tableEmptyBehavior").value=e.emptyBehavior||"hide";$("tableRowHeight").value=e.rowHeight||8;$("tableMaxRows").value=e.maxRows||5;$("tableBorderWidth").value=e.borderWidth??.5;$("tableFontSize").value=e.fontSize||9;
  }
  if(["barcode","qrcode"].includes(e.type)){
    $("codeProps").classList.remove("hidden");$("codeField").value=e.field||"";$("barcodeOnly").classList.toggle("hidden",e.type!=="barcode");$("qrOnly").classList.toggle("hidden",e.type!=="qrcode");
    $("barcodeFormat").value=e.barcodeFormat||"CODE128";$("barcodeText").value=String(e.showText!==false);$("qrLevel").value=e.qrLevel||"M";$("qrMargin").value=e.qrMargin??0;
  }
  if(["line","container"].includes(e.type)){
    $("shapeProps").classList.remove("hidden");$("shapeBorderWidth").value=e.borderWidth??.5;$("shapeRadius").value=e.radius||0;$("shapeBorderStyle").value=e.borderStyle||"solid";
  }
  $("lockBtn").textContent=e.locked?"解锁":"锁定";$("hideBtn").textContent=e.hidden?"显示":"隐藏";
}
function updateProps(){
  const e=selectedOne();if(!e)return;
  e.x=Number($("propX").value)||0;e.y=Number($("propY").value)||0;e.w=Math.max(.5,Number($("propW").value)||1);e.h=Math.max(.5,Number($("propH").value)||1);
  if(["text","field"].includes(e.type)){e.text=$("propText").value;e.field=$("propField").value;e.fontSize=Math.max(6,Number($("propFontSize").value)||11);e.fontWeight=$("propWeight").value;e.wrap=$("textWrap").value==="true";e.maxLines=Math.max(0,Number($("textMaxLines").value)||0);e.overflowMode=$("textOverflow").value;e.emptyBehavior=$("textEmptyBehavior").value;if(e.type==="field"&&e.field)e.text="{{"+e.field+"}}"}
  if(e.type==="image"){e.field=$("imageField").value;e.imageFit=$("imageFit").value;e.radius=Math.max(0,Number($("imageRadius").value)||0);e.aspectLock=$("imageAspectLock").value==="true";e.alignX=$("imageAlignX").value;e.alignY=$("imageAlignY").value;e.padding=Math.max(0,Number($("imagePadding").value)||0);e.emptyBehavior=$("imageEmptyBehavior").value}
  if(e.type==="table"){e.dataField=$("tableDataField").value;e.showHeader=$("tableHeader").value==="true";e.zebra=$("tableZebra").value==="true";e.tableImageFit=$("tableImageFit").value;e.wrap=$("tableWrap").value==="true";e.hideEmptyColumns=$("tableHideEmptyColumns").value==="true";e.emptyBehavior=$("tableEmptyBehavior").value;e.rowHeight=Math.max(4,Number($("tableRowHeight").value)||8);e.maxRows=Math.max(1,Number($("tableMaxRows").value)||5);e.borderWidth=Math.max(0,Number($("tableBorderWidth").value)||0);e.fontSize=Math.max(6,Number($("tableFontSize").value)||9)}
  if(e.type==="barcode"){e.field=$("codeField").value;e.barcodeFormat=$("barcodeFormat").value;e.showText=$("barcodeText").value==="true"}
  if(e.type==="qrcode"){e.field=$("codeField").value;e.qrLevel=$("qrLevel").value;e.qrMargin=Math.max(0,Number($("qrMargin").value)||0)}
  if(["line","container"].includes(e.type)){e.borderWidth=Math.max(0,Number($("shapeBorderWidth").value)||0);e.borderStyle=$("shapeBorderStyle").value;e.radius=Math.max(0,Number($("shapeRadius").value)||0)}
  renderElements()
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
  const ids=[...$("layerList").querySelectorAll(".layer-row")].map(n=>n.dataset.id);
  const map=new Map(current().elements.map(e=>[e.id,e]));
  current().elements=ids.reverse().map(id=>map.get(id)).filter(Boolean);
  renderElements();renderLayers();pushHistory();autoSave()
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

    r.onclick=ev=>{if(ev.target.closest("button")||ev.target.classList.contains("layer-drag")||ev.target.tagName==="INPUT")return;selected=new Set([e.id]);selectedCells=[];renderElements();renderLayers();syncProps()};
    eye.onclick=ev=>{ev.stopPropagation();e.hidden=!e.hidden;renderElements();renderLayers();autoSave()};
    lock.onclick=ev=>{ev.stopPropagation();e.locked=!e.locked;renderElements();renderLayers();autoSave()};
    name.ondblclick=ev=>{
      ev.stopPropagation();const input=document.createElement("input");input.className="layer-name-input";input.value=e.name||label;name.replaceWith(input);input.focus();input.select();
      const done=()=>{e.name=input.value.trim()||"";renderLayers();autoSave()};input.onblur=done;input.onkeydown=k=>{if(k.key==="Enter")input.blur();if(k.key==="Escape"){input.value=e.name||label;input.blur()}}
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
  const left=Math.min(...els.map(e=>e.x)),right=Math.max(...els.map(e=>e.x+e.w)),top=Math.min(...els.map(e=>e.y)),bottom=Math.max(...els.map(e=>e.y+e.h));
  if(cmd==="left")els.forEach(e=>e.x=left);
  if(cmd==="right")els.forEach(e=>e.x=right-e.w);
  if(cmd==="hcenter"){const center=(left+right)/2;els.forEach(e=>e.x=center-e.w/2)}
  if(cmd==="top")els.forEach(e=>e.y=top);
  if(cmd==="bottom")els.forEach(e=>e.y=bottom-e.h);
  if(cmd==="vcenter"){const center=(top+bottom)/2;els.forEach(e=>e.y=center-e.h/2)}
  if(cmd==="distributeH"&&els.length>2){const s=[...els].sort((a,b)=>a.x-b.x);const occupied=s.reduce((n,e)=>n+e.w,0);const gap=Math.max(0,(right-left-occupied)/(s.length-1));let x=left;s.forEach(e=>{e.x=x;x+=e.w+gap})}
  if(cmd==="distributeV"&&els.length>2){const s=[...els].sort((a,b)=>a.y-b.y);const occupied=s.reduce((n,e)=>n+e.h,0);const gap=Math.max(0,(bottom-top-occupied)/(s.length-1));let y=top;s.forEach(e=>{e.y=y;y+=e.h+gap})}
  renderElements();syncProps();pushHistory();autoSave()
}
function autoSave(){
  const t=current();if(!t)return;
  t.name=$("templateName").value.trim()||"未命名模板";
  t.updatedAt=Date.now();
  saveTemplates(state.templates);
  $("saveState").innerHTML="<i></i>已自动保存";
  try{
    if(window.opener&&!window.opener.closed){
      window.opener.postMessage({type:"SUPER_PRINT_TEMPLATE_SAVE",template:structuredClone(t)},"*");
    }
  }catch(err){console.warn("template sync to opener failed",err)}
}
function del(){if(!selected.size)return;current().elements=current().elements.filter(e=>!selected.has(e.id));selected.clear();renderAll();pushHistory();autoSave()}
function duplicate(){const els=current().elements.filter(e=>selected.has(e.id));const ids=[];for(const e of els){const c=structuredClone(e);c.id=uid("el");c.x+=4;c.y+=4;c.locked=false;current().elements.push(c);ids.push(c.id)}selected=new Set(ids);renderAll();pushHistory();autoSave()}
function moveLayer(front){const t=current(),ids=[...selected];const take=t.elements.filter(e=>ids.includes(e.id)),rest=t.elements.filter(e=>!ids.includes(e.id));t.elements=front?[...rest,...take]:[...take,...rest];renderAll();pushHistory();autoSave()}
function toggleKey(k){for(const e of current().elements.filter(e=>selected.has(e.id)))e[k]=!e[k];renderAll();pushHistory();autoSave()}
function showContext(ev,id){ev.preventDefault();selected=new Set([id]);renderElements();renderLayers();syncProps();const m=$("contextMenu");m.style.left=ev.clientX+"px";m.style.top=ev.clientY+"px";m.classList.remove("hidden")}
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
  const p=t.page||{width:215,height:140};
  const host=document.createElement("div");host.className="print-host";host.style.cssText="position:fixed;inset:0;z-index:9999;background:#fff";
  host.innerHTML=renderTemplateToHtml(t,state.record?.data||{});
  const style=document.createElement("style");style.id="designerPrintPage";
  style.textContent="@media print{@page{size:"+p.width+"mm "+p.height+"mm;margin:0}.print-host .print-sheet{width:"+p.width+"mm!important;height:"+p.height+"mm!important}}";
  document.head.appendChild(style);document.body.appendChild(host);
  const cleanup=()=>{host.remove();style.remove();window.removeEventListener("afterprint",cleanup)};
  window.addEventListener("afterprint",cleanup);
  await hydrateCodes(host);setTimeout(()=>window.print(),120)
}
function bind(){document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("componentsTab").classList.toggle("hidden",b.dataset.tab!=="components");$("fieldsTab").classList.toggle("hidden",b.dataset.tab!=="fields")});document.querySelectorAll(".rtab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".rtab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("propsTab").classList.toggle("hidden",b.dataset.rtab!=="props");$("layersTab").classList.toggle("hidden",b.dataset.rtab!=="layers")});
document.querySelectorAll(".component-palette button").forEach(b=>{b.onclick=()=>addElement(b.dataset.type);b.ondragstart=e=>{dragType=b.dataset.type;e.dataTransfer.setData("text/plain",dragType)}});$("printPage").ondragover=e=>e.preventDefault();$("printPage").ondrop=e=>{e.preventDefault();const r=$("printPage").getBoundingClientRect(),type=e.dataTransfer.getData("text/plain")||dragType;let field="";let t=type;if(type.startsWith("field:")){t="field";field=type.slice(6)}addElement(t,(e.clientX-r.left)/(zoom/100)/MM,(e.clientY-r.top)/(zoom/100)/MM,field)};$("printPage").onclick=()=>{selected.clear();renderElements();renderLayers();syncProps()};
for(const id of ["propX","propY","propW","propH","propText","propField","propFontSize","propWeight","imageField","imageFit","imageRadius","imageAspectLock","imageAlignX","imageAlignY","imagePadding","imageEmptyBehavior","textWrap","textMaxLines","textOverflow","textEmptyBehavior","tableDataField","tableColumns","tableHeader","tableZebra","tableImageFit","tableWrap","tableHideEmptyColumns","tableEmptyBehavior","tableRowHeight","tableMaxRows","tableBorderWidth","tableFontSize","codeField","barcodeFormat","barcodeText","qrLevel","qrMargin","shapeBorderWidth","shapeRadius","shapeBorderStyle"]){const el=$(id);if(!el)continue;el.addEventListener("input",updateProps);el.addEventListener("change",()=>{updateProps();pushHistory();autoSave()})}document.querySelectorAll("[data-align]").forEach(b=>b.onclick=()=>{const e=selectedOne();if(!e)return;e.align=b.dataset.align;renderElements();syncProps();pushHistory();autoSave()});
document.querySelectorAll("[data-multi]").forEach(b=>b.onclick=()=>applyMulti(b.dataset.multi));$("duplicateBtn").onclick=duplicate;$("deleteBtn").onclick=del;$("lockBtn").onclick=()=>toggleKey("locked");$("hideBtn").onclick=()=>toggleKey("hidden");$("frontBtn").onclick=()=>moveLayer(true);$("backBtn").onclick=()=>moveLayer(false);$("applyPage").onclick=()=>applyPage(true);$("pagePreset").onchange=e=>{if(e.target.value!=="custom"){const [w,h]=e.target.value.split("x");$("pageW").value=w;$("pageH").value=h;applyPage(true)}};$("gridToggle").onchange=e=>{$("printPage").classList.toggle("grid-on",grid=e.target.checked)};$("snapToggle").onchange=e=>snap=e.target.checked;$("safeToggle").onchange=e=>$("safeGuide").classList.toggle("hidden",!e.target.checked);$("zoomRange").oninput=e=>setZoom(e.target.value,"manual");$("zoomOut").onclick=()=>setZoom(zoom-5,"manual");$("zoomIn").onclick=()=>setZoom(zoom+5,"manual");$("fitBtn").onclick=fitCanvas;$("previewBtn").onclick=()=>setPreview(!preview);$("printBtn").onclick=testPrint;$("saveBtn").onclick=()=>{autoSave();toast("模板已保存")};$("templateName").onchange=autoSave;$("undoBtn").onclick=()=>restore(hIndex-1);$("redoBtn").onclick=()=>restore(hIndex+1);$("fullBtn").onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},120)}catch{toast("浏览器未允许全屏")}};$("quickBtn").onclick=()=>{if(window.opener&&!window.opener.closed){window.opener.focus();window.close()}else{location.href="./index.html"}};
$("leftToggle").onclick=()=>{
  const g=document.querySelector(".designer-grid");
  if(window.innerWidth<=900){g.classList.toggle("left-open");if(g.classList.contains("left-open"))g.classList.remove("right-open")}
  else g.classList.toggle("left-collapsed");
  setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},80);
};
$("rightToggle").onclick=()=>{
  const g=document.querySelector(".designer-grid");
  if(window.innerWidth<=900){g.classList.toggle("right-open");if(g.classList.contains("right-open"))g.classList.remove("left-open")}
  else g.classList.toggle("right-collapsed");
  setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},80);
};$("newBtn").onclick=()=>{const t=createTemplate();state.templates.push(t);state.activeTemplateId=t.id;history=[];hIndex=-1;selected.clear();renderAll();pushHistory();autoSave()};$("fieldSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll(".field-item").forEach(n=>n.classList.toggle("hidden",!n.textContent.toLowerCase().includes(q)))};$("syncDataBtn").onclick=()=>{syncBridgeData(true);renderAll()};$("autoBindBtn").onclick=autoBindNow;$("addTableColumn").onclick=addTableColumn;$("normalizeTableWidths").onclick=()=>normalizeTableWidths(true);$("mergeCellsBtn").onclick=mergeSelectedCells;$("unmergeCellsBtn").onclick=unmergeSelectedCells;$("insertRowBtn").onclick=insertTableRow;$("deleteRowBtn").onclick=deleteTableRow;
$("layerSearch").oninput=renderLayers;$("layerTopBtn").onclick=()=>moveLayer(true);$("layerBottomBtn").onclick=()=>moveLayer(false);
$("contextMenu").onclick=e=>{const c=e.target.dataset.cmd;if(c==="duplicate")duplicate();if(c==="front")moveLayer(true);if(c==="back")moveLayer(false);if(c==="lock")toggleKey("locked");if(c==="delete")del();$("contextMenu").classList.add("hidden")};document.addEventListener("click",()=>$("contextMenu").classList.add("hidden"));document.addEventListener("keydown",e=>{const editing=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName);if(e.ctrlKey&&e.key.toLowerCase()==="s"){e.preventDefault();autoSave();toast("模板已保存");return}if(e.ctrlKey&&e.key.toLowerCase()==="z"){e.preventDefault();restore(hIndex-1);return}if(e.ctrlKey&&e.key.toLowerCase()==="y"){e.preventDefault();restore(hIndex+1);return}if(editing)return;if((e.key==="Delete"||e.key==="Backspace")&&selected.size){e.preventDefault();del();return}if(e.ctrlKey&&e.key.toLowerCase()==="d"){e.preventDefault();duplicate();return}const step=e.shiftKey?5:1;if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)&&selected.size){e.preventDefault();for(const x of current().elements.filter(v=>selected.has(v.id))){if(e.key==="ArrowLeft")x.x=Math.max(0,x.x-step);if(e.key==="ArrowRight")x.x+=step;if(e.key==="ArrowUp")x.y=Math.max(0,x.y-step);if(e.key==="ArrowDown")x.y+=step}renderElements();syncProps();pushHistory();autoSave()}})}
window.addEventListener("storage",e=>{if(e.key===STORAGE_KEYS.bridge){syncBridgeData(false);renderAll()}});
onBridgeMessage(payload=>{syncBridgeData(false,payload);renderAll()});
window.addEventListener("resize",()=>{clearTimeout(window.__spResize);window.__spResize=setTimeout(()=>{initResponsivePanels();if(zoomMode==="fit")fitCanvas()},100)});
document.addEventListener("fullscreenchange",()=>setTimeout(()=>{if(zoomMode==="fit")fitCanvas()},120));
bind();
load().then(()=>{initResponsivePanels();requestAnimationFrame(()=>fitCanvas())});