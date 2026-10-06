import {
  buildTableLayout,hasValue
} from "./table-model.js?v=20261006-20";

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function fieldValue(el,data){const v=data?.[el.field]??"";return (el.label||"")+String(v)}
function commonStyle(el,positioned=true){
  const base='box-sizing:border-box;width:'+(positioned?el.w+'mm':'100%')+';height:'+(positioned?el.h+'mm':'100%')+';font-size:'+(el.fontSize||10)+'px;font-weight:'+(el.fontWeight||400)+';text-align:'+(el.align||"left")+';overflow:hidden;color:#111827;';
  return positioned?('position:absolute;left:'+el.x+'mm;top:'+el.y+'mm;'+base):('position:relative;left:auto;top:auto;'+base)
}
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

export function renderTableMarkup(el,rootData={},options={}){
  const editable=options.editable===true;
  const selectedKeys=new Set((options.selectedCells||[]).map(s=>String(s.row)+":"+String(s.col)));
  const layout=buildTableLayout(el,rootData,el.hideEmptyColumns===true);
  const {rows,cols,allCols,cellRows,hasAny}=layout;
  const bw=el.borderWidth??.5;
  if(!hasAny&&el.emptyBehavior==="hide")return{html:"",layout,renderedHeight:0};

  const colgroup='<colgroup>'+cols.map(c=>'<col style="width:'+c.width+'%">').join("")+'</colgroup>';
  const head=el.showHeader===false?"":'<thead><tr>'+cols.map((c,ci)=>{
    const cls=editable?' class="table-head-cell" data-col="'+(c.index??ci)+'"':"";
    return '<th'+cls+' style="box-sizing:border-box;border:'+bw+'px solid #333;color:#000;padding:2px;text-align:'+c.align+';width:'+c.width+'%;height:'+(el.headerHeight||el.rowHeight||8)+'mm;white-space:'+(el.wrap===false?'nowrap':'normal')+';overflow-wrap:anywhere">'+esc(c.title)+'</th>'
  }).join("")+'</tr></thead>';

  const visibleRows=cellRows.map((cells,ri)=>({cells,ri,row:rows[ri]})).filter(({cells,row})=>{
    const hasRenderedValue=cells.some(cell=>hasValue(cell.value));
    const spansMultiple=(el.merges||[]).some(m=>m.rowIds?.includes(row.id)&&(m.rowIds?.length||0)>1);
    return el.emptyBehavior!=="hide"||hasRenderedValue||spansMultiple;
  });

  const renderedHeight=(el.showHeader===false?0:Number(el.headerHeight||el.rowHeight||8))+visibleRows.reduce((sum,x)=>sum+Number(x.row?.height||el.rowHeight||8),0);
  const body=visibleRows.map(({cells,ri,row})=>{
    const html=cells.map(cell=>{
      const pad=isImageValue(cell.value)?0:cell.cfg.padding;
      const rowspan=cell.rowspan>1?'rowspan="'+cell.rowspan+'" ':"";
      const colspan=cell.colspan>1?'colspan="'+cell.colspan+'" ':"";
      const selected=editable&&selectedKeys.has(String(ri)+":"+String(cell.colIndex));
      const cls=editable?(' class="table-edit-cell'+(selected?' cell-selected':'')+'" data-row="'+ri+'" data-col="'+cell.colIndex+'"'):"";
      return '<td'+cls+' '+rowspan+colspan+'style="position:relative;box-sizing:border-box;border:'+bw+'px solid #444;color:#000;padding:'+pad+'mm;text-align:'+cell.cfg.align+';height:'+cell.height+'mm;white-space:'+(cell.cfg.wrap?'pre-wrap':'nowrap')+';overflow-wrap:anywhere;word-break:'+(cell.cfg.wrap?'break-word':'normal')+';vertical-align:'+cell.cfg.valign+'">'+cellHtml(cell.value,cell.cfg.imageFit)+'</td>';
    }).join("");
    return '<tr style="height:'+row.height+'mm;'+(el.zebra&&ri%2?'background:rgba(120,140,180,.06);':'')+'">'+html+'</tr>';
  }).join("");

  const html='<table style="width:100%;height:'+renderedHeight+'mm;border-collapse:collapse;border-spacing:0;table-layout:fixed;font-size:'+(el.fontSize||9)+'px;box-sizing:border-box;color:#000">'+colgroup+head+'<tbody>'+body+'</tbody></table>';
  return{html,layout,renderedHeight,allCols}
}

function renderTable(el,rootData,common){
  const rendered=renderTableMarkup(el,rootData,{editable:false});
  if(!rendered.html)return"";
  const tableCommon=common.replace(/height:[^;]+;/,'height:'+rendered.renderedHeight+'mm;').replace(/overflow:hidden;/,'overflow:visible;');
  return '<div style="'+tableCommon+'">'+rendered.html+'</div>';
}

export function renderElementToHtml(el,data={},positioned=true){
  if(!el||el.hidden)return"";
  const common=commonStyle(el,positioned);
  if(el.type==="text")return '<div class="render-element render-text" style="'+common+textCss(el)+'">'+esc(el.text)+'</div>';
  if(el.type==="field"){
    const raw=data?.[el.field];
    if(!hasValue(raw)&&el.emptyBehavior==="hide")return"";
    const value=hasValue(raw)?fieldValue(el,data):(el.emptyBehavior==="placeholder"?(el.text||""):"");
    return '<div class="render-element render-field" style="'+common+textCss(el)+'">'+esc(value)+'</div>'
  }
  if(el.type==="barcode"){
    const v=data?.[el.field]||el.text||"";if(!hasValue(v))return"";
    return '<div class="render-element render-barcode" style="'+common+'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px"><svg class="barcode" data-value="'+esc(v)+'" data-field="'+esc(el.field||"")+'" data-format="'+esc(el.barcodeFormat||"CODE128")+'" style="display:block;width:100%;flex:1 1 auto;min-height:0;max-height:100%"></svg>'+(el.showText===false?'':'<small style="display:block;flex:0 0 auto;font-size:'+(el.barcodeFontSize||8)+'px;line-height:1.15;white-space:nowrap">'+esc(v)+'</small>')+'</div>';
  }
  if(el.type==="qrcode"){
    const v=data?.[el.field]||el.text||"";if(!hasValue(v))return"";
    return '<div class="render-element render-qrcode" style="'+common+'display:grid;place-items:center"><canvas class="qrcode" data-value="'+esc(v)+'" data-level="'+esc(el.qrLevel||"M")+'" data-margin="'+Number(el.qrMargin||0)+'" data-size="600" style="display:block;width:100%;height:100%;max-width:100%;max-height:100%"></canvas></div>';
  }
  if(el.type==="image"){
    const src=data?.[el.field]||"";
    if(!src&&el.emptyBehavior==="hide")return"";
    return '<div class="render-element render-image" style="'+common+'padding:'+(el.padding||0)+'mm;border-radius:'+(el.radius||0)+'px">'+(src?'<img src="'+esc(src)+'" referrerpolicy="no-referrer" decoding="async" loading="eager" style="width:100%;height:100%;display:block;object-fit:'+(el.imageFit==="original"?"none":(el.imageFit||"contain"))+';object-position:'+imagePosition(el)+';border-radius:'+(el.radius||0)+'px">':'')+'</div>';
  }
  if(el.type==="line")return '<div class="render-element render-line" style="'+common+'border-top:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #17223c"></div>';
  if(el.type==="container")return '<div class="render-element render-container" style="'+common+'border:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #cbd2df;border-radius:'+(el.radius||0)+'px"></div>';
  if(el.type==="table")return renderTable(el,data,common);
  return""
}

export function renderTemplateToHtml(tpl,data={}){
  const p=tpl.page||{width:215,height:140};
  const items=(tpl.elements||[]).filter(el=>!el.hidden).map(el=>renderElementToHtml(el,data,true)).join("");
  return '<section class="print-sheet" style="position:relative;width:'+p.width+'mm;height:'+p.height+'mm;background:#fff;overflow:hidden">'+items+'</section>'
}
export function applyTemplateCalibration(root,tpl){
  const sheet=root?.matches?.(".print-sheet")?root:root?.querySelector?.(".print-sheet");
  if(!sheet)return;
  const s=tpl?.printSettings||{};
  const scale=Math.max(.9,Math.min(1.1,(Number(s.scale)||100)/100));
  const x=Math.max(-20,Math.min(20,Number(s.offsetX)||0));
  const y=Math.max(-20,Math.min(20,Number(s.offsetY)||0));
  sheet.style.transform="translate("+x+"mm,"+y+"mm) scale("+scale+")";
  sheet.style.transformOrigin="top left";
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
      const value=String(svg.dataset.value||"");
      const format=String(svg.dataset.format||"CODE128").toUpperCase();
      delete svg.dataset.error;delete svg.dataset.hydrated;
      if(format==="EAN13"&&!/^\d{12,13}$/.test(value)){
        svg.dataset.error="EAN13 需要 12 或 13 位数字";
        return;
      }
      try{
        JsBarcode(svg,value,{format,displayValue:false,margin:0,height:42});
        svg.dataset.hydrated="1";
      }catch(err){
        svg.dataset.error=err?.message||"条码数据无效";
      }
    })
  }catch(err){console.warn("条码模块加载失败",err)}
  try{
    const q=await importFirst([
      "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm",
      "https://esm.sh/qrcode@1.5.4"
    ]);const QR=q.default||q;
    for(const c of root.querySelectorAll("canvas.qrcode")){
      try{await QR.toCanvas(c,c.dataset.value||"",{margin:Number(c.dataset.margin||0),width:Math.max(120,Number(c.dataset.size||600)),errorCorrectionLevel:c.dataset.level||"M"});c.dataset.hydrated="1"}catch{}
    }
  }catch(err){console.warn("二维码模块加载失败",err)}
}
