import {
  ensureTableModel,materializeTableRows,visibleColumns,cellValue,
  mergeForCell,isMergeMaster,isCoveredCell,rowHeight,hasValue
} from "./table-model.js?v=20261005-7";

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function fieldValue(el,data){const v=data?.[el.field]??"";return (el.label||"")+String(v)}
function commonStyle(el){return 'position:absolute;box-sizing:border-box;left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;font-size:'+(el.fontSize||10)+'px;font-weight:'+(el.fontWeight||400)+';text-align:'+(el.align||"left")+';overflow:hidden;'}
function textCss(el){
  let s="white-space:"+(el.wrap===false?"nowrap":"normal")+";overflow-wrap:"+(el.wrap===false?"normal":"anywhere")+";word-break:"+(el.wrap===false?"normal":"break-word")+";";
  if(el.overflowMode==="ellipsis"&&el.wrap===false)s+="text-overflow:ellipsis;";
  if(el.maxLines>0&&el.wrap!==false)s+="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:"+el.maxLines+";";
  if(el.overflowMode==="grow")s+="height:auto;min-height:"+el.h+"mm;";
  return s
}
function imagePosition(el){return (el.alignX||"center")+" "+(el.alignY||"center")}
function isImageValue(v){return typeof v==="string"&&(v.startsWith("data:image/")||v.startsWith("blob:")||/^https?:\/\//i.test(v))}
function cellHtml(v,imageFit="contain"){
  if(isImageValue(v)){
    const fit=imageFit==="original"?"none":(imageFit||"contain");
    return '<div style="position:absolute;inset:0;overflow:hidden;background:#fff"><img src="'+esc(v)+'" decoding="async" loading="eager" style="width:100%;height:100%;object-fit:'+fit+';object-position:center center;display:block;margin:0" referrerpolicy="no-referrer"></div>';
  }
  return esc(v);
}

function renderTable(el,rootData,common){
  ensureTableModel(el,rootData);
  const rows=materializeTableRows(el,rootData);
  const cols=visibleColumns(el,rows,rootData,el.hideEmptyColumns===true);
  const bw=el.borderWidth??.5;
  const hasAny=rows.some(row=>cols.some(col=>hasValue(cellValue(el,row,col,rootData).value)));
  if(!hasAny&&el.emptyBehavior==="hide")return"";

  const head=el.showHeader===false?"":'<thead><tr>'+cols.map(c=>
    '<th style="box-sizing:border-box;border:'+bw+'px solid #667085;padding:2px;text-align:'+c.align+';width:'+c.width+'%;height:'+(el.headerHeight||el.rowHeight||8)+'mm;white-space:'+(el.wrap===false?'nowrap':'normal')+';overflow-wrap:anywhere">'+esc(c.title)+'</th>'
  ).join("")+'</tr></thead>';

  const body=rows.map((row,ri)=>{
    let cells="";
    for(const col of cols){
      if(isCoveredCell(el,row.id,col.id))continue;
      const merge=mergeForCell(el,row.id,col.id);
      const master=isMergeMaster(merge,row.id,col.id);
      const {cfg,value}=cellValue(el,row,col,rootData);
      const pad=isImageValue(value)?0:cfg.padding;
      const rowspan=master&&merge?.rowIds?.length>1?'rowspan="'+merge.rowIds.length+'" ':'';
      const colspan=master&&merge?.colIds?.length>1?'colspan="'+merge.colIds.length+'" ':'';
      cells+='<td '+rowspan+colspan+'style="position:relative;box-sizing:border-box;border:'+bw+'px solid #cbd2df;padding:'+pad+'px;text-align:'+cfg.align+';height:'+rowHeight(row,el)+'mm;white-space:'+(cfg.wrap?'normal':'nowrap')+';overflow-wrap:anywhere;word-break:'+(cfg.wrap?'break-word':'normal')+';vertical-align:'+cfg.valign+'">'+cellHtml(value,cfg.imageFit)+'</td>';
    }
    return '<tr style="'+(el.zebra&&ri%2?'background:rgba(120,140,180,.06);':'')+'">'+cells+'</tr>';
  }).join("");

  return '<div style="'+common+'"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:'+(el.fontSize||9)+'px">'+head+'<tbody>'+body+'</tbody></table></div>';
}

export function renderTemplateToHtml(tpl,data={}){
  const p=tpl.page||{width:215,height:140};
  const items=(tpl.elements||[]).filter(el=>!el.hidden).map(el=>{
    const common=commonStyle(el);
    if(el.type==="text")return '<div style="'+common+textCss(el)+'">'+esc(el.text)+'</div>';
    if(el.type==="field"){
      const raw=data?.[el.field];
      if(!hasValue(raw)&&el.emptyBehavior==="hide")return"";
      const value=hasValue(raw)?fieldValue(el,data):(el.emptyBehavior==="placeholder"?(el.text||""):"");
      return '<div style="'+common+textCss(el)+'">'+esc(value)+'</div>'
    }
    if(el.type==="barcode"){
      const v=data?.[el.field]||el.text||"";
      return '<div style="'+common+'display:flex;flex-direction:column;align-items:center;justify-content:center"><svg class="barcode" data-value="'+esc(v)+'" data-format="'+esc(el.barcodeFormat||"CODE128")+'"></svg>'+(el.showText===false?'':'<small>'+esc(v)+'</small>')+'</div>';
    }
    if(el.type==="qrcode"){
      const v=data?.[el.field]||el.text||"";
      return '<div style="'+common+'display:grid;place-items:center"><canvas class="qrcode" data-value="'+esc(v)+'" data-level="'+esc(el.qrLevel||"M")+'" data-margin="'+Number(el.qrMargin||0)+'"></canvas></div>';
    }
    if(el.type==="image"){
      const src=data?.[el.field]||"";
      if(!src&&el.emptyBehavior==="hide")return"";
      return '<div style="'+common+'padding:'+(el.padding||0)+'mm;border-radius:'+(el.radius||0)+'px">'+(src?'<img src="'+esc(src)+'" referrerpolicy="no-referrer" decoding="async" loading="eager" style="width:100%;height:100%;display:block;object-fit:'+(el.imageFit==="original"?"none":(el.imageFit||"contain"))+';object-position:'+imagePosition(el)+';border-radius:'+(el.radius||0)+'px">':'')+'</div>';
    }
    if(el.type==="line")return '<div style="'+common+'border-top:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #17223c"></div>';
    if(el.type==="container")return '<div style="'+common+'border:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #cbd2df;border-radius:'+(el.radius||0)+'px"></div>';
    if(el.type==="table")return renderTable(el,data,common);
    return""
  }).join("");
  return '<section class="print-sheet" style="position:relative;width:'+p.width+'mm;height:'+p.height+'mm;background:#fff;overflow:hidden">'+items+'</section>'
}

export async function hydrateCodes(root){
  try{
    const mod=await import("https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/+esm");
    const JsBarcode=mod.default||mod;
    root.querySelectorAll("svg.barcode").forEach(svg=>{
      try{JsBarcode(svg,svg.dataset.value||"",{format:svg.dataset.format||"CODE128",displayValue:false,margin:0,height:42})}catch{}
    })
  }catch{}
  try{
    const q=await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");const QR=q.default||q;
    for(const c of root.querySelectorAll("canvas.qrcode")){
      try{await QR.toCanvas(c,c.dataset.value||"",{margin:Number(c.dataset.margin||0),width:120,errorCorrectionLevel:c.dataset.level||"M"})}catch{}
    }
  }catch{}
}
