function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function fieldValue(el,data){const v=data?.[el.field]??"";return (el.label||"")+String(v)}
function normalizeColumns(cols){
  if(!Array.isArray(cols)||!cols.length)return[
    {title:"商品名称",field:"商品名称",width:45,align:"left"},
    {title:"商品属性",field:"商品属性",width:25,align:"center"},
    {title:"数量",field:"数量",width:15,align:"center"},
    {title:"价格",field:"价格",width:15,align:"right"}
  ];
  return cols.map((c,i)=>typeof c==="string"?{title:c,field:c,width:null,align:i===0?"left":"center"}:{title:c.title||c.field||("列"+(i+1)),field:c.field||c.title||"",width:c.width??null,align:c.align||"center"});
}
function parseRows(value){
  if(Array.isArray(value))return value;
  if(value&&typeof value==="object")return[value];
  if(typeof value==="string"){
    const t=value.trim();if(!t)return[];
    try{const j=JSON.parse(t);if(Array.isArray(j))return j;if(j&&typeof j==="object")return[j]}catch{}
    return t.split(/\r?\n/).filter(Boolean).map(v=>({value:v}));
  }
  return[];
}
function tableRows(el,data){
  if(el.dataField){
    const rows=parseRows(data?.[el.dataField]);
    if(rows.length)return rows;
  }
  return[data||{}];
}
function commonStyle(el){return 'position:absolute;box-sizing:border-box;left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;font-size:'+(el.fontSize||10)+'px;font-weight:'+(el.fontWeight||400)+';text-align:'+(el.align||"left")+';overflow:hidden;'}
function hasValue(v){return !(v===undefined||v===null||v==="")}
function textCss(el){
  let s="white-space:"+(el.wrap===false?"nowrap":"normal")+";overflow-wrap:"+(el.wrap===false?"normal":"anywhere")+";word-break:"+(el.wrap===false?"normal":"break-word")+";";
  if(el.overflowMode==="ellipsis"&&el.wrap===false)s+="text-overflow:ellipsis;";
  if(el.maxLines>0&&el.wrap!==false)s+="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:"+el.maxLines+";";
  if(el.overflowMode==="grow")s+="height:auto;min-height:"+el.h+"mm;";
  return s
}
function imagePosition(el){return (el.alignX||"center")+" "+(el.alignY||"center")}
function visibleColumns(el,rows,data){
  const cols=normalizeColumns(el.columns).map((c,i)=>({...c,_index:i}));
  let v=el.hideEmptyColumns?cols.filter(col=>rows.some(r=>hasValue(r?.[col.field]??data?.[col.field]))):cols;
  if(!v.length)v=cols;
  const sum=v.reduce((n,col)=>n+(Number(col.width)||0),0)||100;
  return v.map(col=>({...col,width:(Number(col.width)||0)*100/sum}))
}
function mergeAt(el,row,col){return (el.merges||[]).find(m=>m.row===row&&m.col===col)||null}
function covered(el,row,col){return (el.merges||[]).some(m=>!(m.row===row&&m.col===col)&&row>=m.row&&row<m.row+(m.rowSpan||1)&&col>=m.col&&col<m.col+(m.colSpan||1))}
function isImageValue(v){return typeof v==="string"&&(v.startsWith("data:image/")||/^https?:\/\//i.test(v))}
function cellHtml(v,imageFit="contain"){
  if(isImageValue(v)){
    const fit=imageFit==="original"?"none":(imageFit||"contain");
    return '<div style="position:absolute;inset:0;overflow:hidden"><img src="'+esc(v)+'" style="width:100%;height:100%;object-fit:'+fit+';object-position:center center;display:block;margin:0" referrerpolicy="no-referrer"></div>';
  }
  return esc(v);
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
      return '<div style="'+common+'padding:'+(el.padding||0)+'mm;border-radius:'+(el.radius||0)+'px">'+(src?'<img src="'+esc(src)+'" referrerpolicy="no-referrer" style="width:100%;height:100%;display:block;object-fit:'+(el.imageFit==="original"?"none":(el.imageFit||"contain"))+';object-position:'+imagePosition(el)+';border-radius:'+(el.radius||0)+'px">':'')+'</div>';
    }
    if(el.type==="line")return '<div style="'+common+'border-top:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #17223c"></div>';
    if(el.type==="container")return '<div style="'+common+'border:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #cbd2df;border-radius:'+(el.radius||0)+'px"></div>';
    if(el.type==="table"){
      const rows0=tableRows(el,data).slice(0,el.maxRows||5),rows=rows0.length?rows0:[{}];
      const configured=normalizeColumns(el.columns);
      const hasAny=rows0.some(row=>configured.some(col=>hasValue(row?.[col.field]??data?.[col.field])));
      if(!hasAny&&el.emptyBehavior==="hide")return"";
      const cols=visibleColumns(el,rows,data),bw=el.borderWidth??.5;
      const head=el.showHeader===false?'':'<thead><tr>'+cols.map(c=>'<th style="border:'+bw+'px solid #667085;padding:2px;text-align:'+c.align+';width:'+c.width+'%;height:'+(el.headerHeight||el.rowHeight||8)+'mm;white-space:'+(el.wrap===false?'nowrap':'normal')+';overflow-wrap:anywhere">'+esc(c.title)+'</th>').join("")+'</tr></thead>';
      const body=rows.map((row,ri)=>{
        let cells="";
        for(const col of cols){
          const ci=col._index;if(covered(el,ri,ci))continue;
          const merge=mergeAt(el,ri,ci),value=row?.[col.field]??data?.[col.field]??"";
          const rh=(el.rowHeights&&Number(el.rowHeights[ri]))||el.rowHeight||8;
          cells+='<td '+(merge&&merge.colSpan>1?'colspan="'+merge.colSpan+'" ':'')+(merge&&merge.rowSpan>1?'rowspan="'+merge.rowSpan+'" ':'')+'style="position:relative;border:'+bw+'px solid #cbd2df;padding:'+(isImageValue(value)?'0':'2px')+';text-align:'+col.align+';height:'+rh+'mm;white-space:'+(el.wrap===false?'nowrap':'normal')+';overflow-wrap:anywhere;word-break:'+(el.wrap===false?'normal':'break-word')+';vertical-align:middle">'+cellHtml(value,el.tableImageFit||"contain")+'</td>';
        }
        return '<tr style="'+(el.zebra&&ri%2?'background:rgba(120,140,180,.06);':'')+'">'+cells+'</tr>';
      }).join("");
      return '<div style="'+common+'"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:'+(el.fontSize||9)+'px">'+head+'<tbody>'+body+'</tbody></table></div>';
    }
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
