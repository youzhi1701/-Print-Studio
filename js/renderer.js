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
function commonStyle(el){return 'position:absolute;left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;font-size:'+(el.fontSize||10)+'px;font-weight:'+(el.fontWeight||400)+';text-align:'+(el.align||"left")+';overflow:hidden;'}

export function renderTemplateToHtml(tpl,data={}){
  const p=tpl.page||{width:215,height:140};
  const items=(tpl.elements||[]).filter(el=>!el.hidden).map(el=>{
    const common=commonStyle(el);
    if(el.type==="text")return '<div style="'+common+'">'+esc(el.text)+'</div>';
    if(el.type==="field")return '<div style="'+common+'">'+esc(fieldValue(el,data))+'</div>';
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
      return '<div style="'+common+'border-radius:'+(el.radius||0)+'px">'+(src?'<img src="'+esc(src)+'" style="width:100%;height:100%;object-fit:'+(el.imageFit||"contain")+';border-radius:'+(el.radius||0)+'px">':'')+'</div>';
    }
    if(el.type==="line")return '<div style="'+common+'border-top:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #17223c"></div>';
    if(el.type==="container")return '<div style="'+common+'border:'+(el.borderWidth??.5)+'px '+(el.borderStyle||"solid")+' #cbd2df;border-radius:'+(el.radius||0)+'px"></div>';
    if(el.type==="table"){
      const cols=normalizeColumns(el.columns);
      const rows=tableRows(el,data).slice(0,el.maxRows||5);
      const bw=el.borderWidth??.5;
      const widths=cols.map(c=>c.width).filter(v=>Number.isFinite(Number(v))&&Number(v)>0);
      const hasWidths=widths.length===cols.length;
      const head=el.showHeader===false?'':'<thead><tr>'+cols.map(c=>'<th style="border:'+bw+'px solid #667085;padding:2px;text-align:'+c.align+';'+(hasWidths?'width:'+c.width+'%;':'')+'">'+esc(c.title)+'</th>').join("")+'</tr></thead>';
      const body=rows.map((row,ri)=>'<tr style="'+(el.zebra&&ri%2?'background:rgba(120,140,180,.06);':'')+'">'+cols.map(c=>'<td style="border:'+bw+'px solid #cbd2df;padding:2px;text-align:'+c.align+';height:'+(el.rowHeight||8)+'mm">'+esc(row?.[c.field]??data?.[c.field]??"")+'</td>').join("")+'</tr>').join("");
      return '<table style="'+common+'border-collapse:collapse;table-layout:fixed;width:'+el.w+'mm;height:auto;font-size:'+(el.fontSize||9)+'px">'+head+'<tbody>'+body+'</tbody></table>';
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
