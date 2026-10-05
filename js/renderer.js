import {
  buildTableLayout,hasValue
} from "./table-model.js?v=20261005-19";

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function fieldValue(el,data){const v=data?.[el.field]??"";return (el.label||"")+String(v)}
function commonStyle(el){return 'position:absolute;box-sizing:border-box;left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;font-size:'+(el.fontSize||10)+'px;font-weight:'+(el.fontWeight||400)+';text-align:'+(el.align||"left")+';overflow:hidden;'}
function textCss(el){
  let s="white-space:"+(el.wrap===false?"nowrap":"pre-wrap")+";overflow-wrap:"+(el.wrap===false?"normal":"anywhere")+";word-break:"+(el.wrap===false?"normal":"break-word")+";";
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
  const layout=buildTableLayout(el,rootData,el.hideEmptyColumns===true);
  const {rows,cols,cellRows,hasAny,totalHeight}=layout;
  const bw=el.borderWidth??.5;
  if(!hasAny&&el.emptyBehavior==="hide")return"";

  const colgroup='<colgroup>'+cols.map(c=>'<col style="width:'+c.width+'%">').join("")+'</colgroup>';
  const head=el.showHeader===false?"":'<thead><tr>'+cols.map(c=>
    '<th style="box-sizing:border-box;border:'+bw+'px solid #667085;padding:2px;text-align:'+c.align+';width:'+c.width+'%;height:'+(el.headerHeight||el.rowHeight||8)+'mm;white-space:'+(el.wrap===false?'nowrap':'normal')+';overflow-wrap:anywhere">'+esc(c.title)+'</th>'
  ).join("")+'</tr></thead>';

  const printableRows=cellRows.map((cells,ri)=>({cells,ri,row:rows[ri]})).filter(({cells,row})=>{
    const hasRenderedValue=cells.some(cell=>hasValue(cell.value));
    const spansMultiple=(el.merges||[]).some(m=>m.rowIds?.includes(row.id)&&(m.rowIds?.length||0)>1);
    return el.emptyBehavior!=="hide"||hasRenderedValue||spansMultiple;
  });
  const renderedHeight=(el.showHeader===false?0:Number(el.headerHeight||el.rowHeight||8))+printableRows.reduce((sum,x)=>sum+Number(x.row?.height||el.rowHeight||8),0);

  const body=printableRows.map(({cells,ri,row})=>{
    const html=cells.map(cell=>{
      const pad=isImageValue(cell.value)?0:cell.cfg.padding;
      const rowspan=cell.rowspan>1?'rowspan="'+cell.rowspan+'" ':"";
      const colspan=cell.colspan>1?'colspan="'+cell.colspan+'" ':"";
      return '<td '+rowspan+colspan+'style="position:relative;box-sizing:border-box;border:'+bw+'px solid #cbd2df;padding:'+pad+'mm;text-align:'+cell.cfg.align+';height:'+cell.height+'mm;white-space:'+(cell.cfg.wrap?'pre-wrap':'nowrap')+';overflow-wrap:anywhere;word-break:'+(cell.cfg.wrap?'break-word':'normal')+';vertical-align:'+cell.cfg.valign+'">'+cellHtml(cell.value,cell.cfg.imageFit)+'</td>';
    }).join("");
    return '<tr style="height:'+row.height+'mm;'+(el.zebra&&ri%2?'background:rgba(120,140,180,.06);':'')+'">'+html+'</tr>';
  }).join("");

  const tableCommon=common.replace(/height:[^;]+;/,'height:'+renderedHeight+'mm;');
  return '<div style="'+tableCommon+'"><table style="width:100%;height:'+renderedHeight+'mm;border-collapse:collapse;table-layout:fixed;font-size:'+(el.fontSize||9)+'px">'+colgroup+head+'<tbody>'+body+'</tbody></table></div>';
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
      const v=data?.[el.field]||el.text||"";if(!hasValue(v))return"";
      return '<div style="'+common+'display:flex;flex-direction:column;align-items:center;justify-content:center"><svg class="barcode" data-value="'+esc(v)+'" data-format="'+esc(el.barcodeFormat||"CODE128")+'"></svg>'+(el.showText===false?'':'<small>'+esc(v)+'</small>')+'</div>';
    }
    if(el.type==="qrcode"){
      const v=data?.[el.field]||el.text||"";if(!hasValue(v))return"";
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

async function importFirst(urls){
  let last;
  for(const url of urls){try{return await import(url)}catch(err){last=err}}
  throw last||new Error("模块加载失败")
}
export async function hydrateCodes(root){
  try{
    const mod=await importFirst([
      "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/+esm",
      "https://esm.sh/jsbarcode@3.11.6"
    ]);
    const JsBarcode=mod.default||mod;
    root.querySelectorAll("svg.barcode").forEach(svg=>{
      try{JsBarcode(svg,svg.dataset.value||"",{format:svg.dataset.format||"CODE128",displayValue:false,margin:0,height:42});svg.dataset.hydrated="1"}catch{}
    })
  }catch(err){console.warn("条码模块加载失败",err)}
  try{
    const q=await importFirst([
      "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm",
      "https://esm.sh/qrcode@1.5.4"
    ]);const QR=q.default||q;
    for(const c of root.querySelectorAll("canvas.qrcode")){
      try{await QR.toCanvas(c,c.dataset.value||"",{margin:Number(c.dataset.margin||0),width:120,errorCorrectionLevel:c.dataset.level||"M"});c.dataset.hydrated="1"}catch{}
    }
  }catch(err){console.warn("二维码模块加载失败",err)}
}
