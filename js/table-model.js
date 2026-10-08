// Shared table model used by editor, preview and print.
// v4 keeps one canonical table grid for editor, preview and print.

function id(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8)}
export function hasValue(v){return !(v===undefined||v===null||v==="")}

export function parseRows(value){
  if(Array.isArray(value))return value;
  if(value&&typeof value==="object")return[value];
  if(typeof value==="string"){
    const t=value.trim();if(!t)return[];
    try{const j=JSON.parse(t);if(Array.isArray(j))return j;if(j&&typeof j==="object")return[j]}catch{}
    return t.split(/\r?\n/).filter(Boolean).map(v=>({value:v}));
  }
  return[];
}

export function sourceRowsForTable(el,data){
  if(el?.dataField){
    return parseRows(data?.[el.dataField]);
  }
  return[data||{}];
}

function sourceEntriesForTable(el,data){
  const suppressed=new Set((el?.suppressedDataIndexes||[]).map(Number));
  return sourceRowsForTable(el,data).slice(0,el?.maxRows||5)
    .map((data,index)=>({data,index}))
    .filter(entry=>!suppressed.has(entry.index));
}

export function normalizeTableColumns(el){
  let cols=Array.isArray(el?.columns)&&el.columns.length?el.columns:[
    {title:"商品名称",field:"商品名称",width:45,align:"left"},
    {title:"商品属性",field:"商品属性",width:25,align:"center"},
    {title:"数量",field:"数量",width:15,align:"center"},
    {title:"价格",field:"价格",width:15,align:"right"}
  ];
  cols=cols.map((c,i)=>{
    if(typeof c==="string")return{id:id("col"),title:c,field:c,template:"{{"+c+"}}",width:null,align:i===0?"left":"center",headerAlign:i===0?"left":"center"};
    const field=c.field||c.title||"";
    const template=c.template!==undefined?String(c.template):(field?"{{"+field+"}}":"");
    const align=c.align||"center";
    return{id:c.id||id("col"),title:c.title||field||("列"+(i+1)),field,template,width:c.width??null,align,headerAlign:c.headerAlign||align};
  });
  const valid=cols.every(c=>Number.isFinite(Number(c.width))&&Number(c.width)>0);
  if(!valid){const w=100/cols.length;cols.forEach(c=>c.width=w)}
  else{const sum=cols.reduce((n,c)=>n+Number(c.width),0)||100;cols.forEach(c=>c.width=Number(c.width)*100/sum)}
  if(el)el.columns=cols;
  return cols;
}

function legacyRowCount(el,sourceCount){
  return Math.max(sourceCount||0,Number(el?.designRowCount)||0,1);
}

export function ensureTableModel(el,data={}){
  if(!el||el.type!=="table")return el;
  const cols=normalizeTableColumns(el);
  const srcEntries=sourceEntriesForTable(el,data),src=srcEntries.map(x=>x.data);

  if(!Array.isArray(el.rowDefs)||!el.rowDefs.length){
    const count=legacyRowCount(el,src.length);
    const headerHeight=el.showHeader===false?0:Number(el.headerHeight||el.rowHeight||8);
    const legacyBodyHeight=Math.max(0,Number(el.h||0)-headerHeight);
    const inferredHeight=legacyBodyHeight>0?Math.max(4,legacyBodyHeight/count):(Number(el.rowHeight)||8);
    el.rowDefs=Array.from({length:count},(_,i)=>({
      id:id("row"),
      type:i<Math.max(1,src.length)?"data":"manual",
      height:Number(el.rowHeights?.[i])||inferredHeight,
      heightMode:el.autoRowHeight===false?"fixed":"auto"
    }));
  }else{
    el.rowDefs=el.rowDefs.map((r,i)=>({
      id:r?.id||id("row"),
      type:["manual","summary"].includes(r?.type)?r.type:"data",
      height:Number(r?.height)||Number(el.rowHeight)||8,
      heightMode:r?.heightMode==="fixed"?"fixed":"auto"
    }));
  }

  // Migrate index-keyed cell overrides to stable row/column ids.
  if(!el.cellMap||typeof el.cellMap!=="object"){
    const migrated={};
    for(const [key,val] of Object.entries(el.cells||{})){
      const [ri,ci]=String(key).split(":").map(Number);
      const row=el.rowDefs[ri],col=cols[ci];
      if(row&&col)migrated[row.id+"::"+col.id]={...val};
    }
    el.cellMap=migrated;
  }

  // Migrate legacy numeric merge rectangles to stable member ids.
  const oldMerges=Array.isArray(el.merges)?el.merges:[];
  if(oldMerges.some(m=>Array.isArray(m.rowIds)||Array.isArray(m.colIds))){
    el.merges=oldMerges.map(m=>({
      id:m.id||id("merge"),
      rowIds:(m.rowIds||[]).filter(rid=>el.rowDefs.some(r=>r.id===rid)),
      colIds:(m.colIds||[]).filter(cid=>cols.some(c=>c.id===cid))
    })).filter(m=>m.rowIds.length&&m.colIds.length&&(m.rowIds.length*m.colIds.length>1));
  }else{
    el.merges=oldMerges.map(m=>{
      const rowIds=el.rowDefs.slice(Number(m.row)||0,(Number(m.row)||0)+(Number(m.rowSpan)||1)).map(r=>r.id);
      const colIds=cols.slice(Number(m.col)||0,(Number(m.col)||0)+(Number(m.colSpan)||1)).map(c=>c.id);
      return{id:id("merge"),rowIds,colIds}
    }).filter(m=>m.rowIds.length&&m.colIds.length&&(m.rowIds.length*m.colIds.length>1));
  }

  el.tableModelVersion=4;
  el.designRowCount=el.rowDefs.length; // compatibility only
  return el;
}

export function materializeTableRows(el,data={}){
  ensureTableModel(el,data);
  const sourceEntries=sourceEntriesForTable(el,data),source=sourceEntries.map(x=>x.data);
  const defs=el.rowDefs||[];
  let dataDefs=defs.filter(r=>r.type==="data");
  if(el.dataField&&source.length>dataDefs.length){
    let at=defs.reduce((last,r,i)=>r.type==="data"?i+1:last,0);
    for(let n=dataDefs.length;n<source.length;n++){
      const def={id:id("row"),type:"data",height:Number(el.rowHeight)||8};
      defs.splice(at++,0,def);
    }
    dataDefs=defs.filter(r=>r.type==="data");
  }
  const out=[];
  let si=0;
  for(const def of defs){
    if(def.type==="manual"||def.type==="summary"){
      out.push({id:def.id,type:def.type,height:def.height,heightMode:def.heightMode||"auto",data:{},sourceIndex:null});
    }else if(si<source.length){
      out.push({id:def.id,type:"data",height:def.height,heightMode:def.heightMode||"auto",data:source[si]||{},sourceIndex:sourceEntries[si]?.index??si});
      si++;
    }
  }
  // If data grows beyond saved data slots, append stable ephemeral rows after the last data slot.
  while(el.dataField&&si<source.length){
    const base=dataDefs[dataDefs.length-1]?.id||"data";
    out.push({id:base+"__auto_"+si,type:"data",height:Number(el.rowHeight)||8,heightMode:el.autoRowHeight===false?"fixed":"auto",data:source[si]||{},sourceIndex:sourceEntries[si]?.index??si,ephemeral:true});
    si++;
  }
  if(!out.length&&el.emptyBehavior!=="hide"){
    const def=defs.find(r=>r.type==="manual")||defs[0]||{id:id("row"),height:Number(el.rowHeight)||8};
    out.push({id:def.id,type:"manual",height:def.height,data:{},sourceIndex:null,placeholder:true});
  }
  return out;
}

export function cellKey(rowId,colId){return String(rowId)+"::"+String(colId)}
export function getCellOverride(el,rowId,colId){return el?.cellMap?.[cellKey(rowId,colId)]||null}
export function setCellOverride(el,rowId,colId,value){
  el.cellMap={...(el.cellMap||{})};
  const k=cellKey(rowId,colId);
  if(value==null)delete el.cellMap[k];else el.cellMap[k]={...value};
}

export function cellConfig(el,rowId,colId,column){
  const o=getCellOverride(el,rowId,colId)||{};
  return{
    type:o.type||"inherit",
    field:o.field??"",
    text:o.text??"",
    align:o.align||column?.align||"center",
    valign:o.valign||"middle",
    padding:Number.isFinite(Number(o.padding))?Number(o.padding):2,
    wrap:o.wrap!==undefined?o.wrap:el.wrap!==false,
    imageFit:o.imageFit||el.tableImageFit||"contain",
    mergeDefault:!!o.mergeDefault
  };
}

function templateValue(source,key){
  if(!source||!key)return undefined;
  if(Object.prototype.hasOwnProperty.call(source,key))return source[key];
  return undefined
}
function renderColumnTemplate(template,rowData,rootData){
  return String(template??"").replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,rawKey)=>{
    const key=String(rawKey||"").trim();
    const value=templateValue(rowData,key)??templateValue(rootData,key)??"";
    if(value===null||value===undefined)return"";
    if(Array.isArray(value))return value.map(v=>typeof v==="object"?(v?.text??v?.name??v?.url??""):v).filter(Boolean).join("、");
    if(typeof value==="object")return value.text??value.name??value.url??value.value??"";
    return String(value)
  })
}
export function cellValue(el,row,column,rootData={}){
  const cfg=cellConfig(el,row.id,column.id,column);
  if(cfg.type==="text")return{cfg,value:cfg.text||""};
  const field=(cfg.type==="field"||cfg.type==="image")?(cfg.field||column?.field):(column?.field||cfg.field);
  const rowData=row.data||{};
  if(row.type==="manual"&&cfg.type==="inherit"&&!Object.keys(rowData).length)return{cfg,value:""};
  if(cfg.type==="inherit"){
    const template=column?.template!==undefined?column.template:(field?"{{"+field+"}}":"");
    return{cfg,value:renderColumnTemplate(template,rowData,rootData)}
  }
  const value=rowData?.[field]??rootData?.[field]??"";
  return{cfg,value};
}

export function visualColumnSet(el){return normalizeTableColumns(el)}

export function normalizeRange(a,b){
  return{r0:Math.min(a.row,b.row),r1:Math.max(a.row,b.row),c0:Math.min(a.col,b.col),c1:Math.max(a.col,b.col)}
}
export function cellsInRange(range){
  const out=[];for(let r=range.r0;r<=range.r1;r++)for(let c=range.c0;c<=range.c1;c++)out.push({row:r,col:c});return out
}

export function mergeForCell(el,rowId,colId){
  return (el.merges||[]).find(m=>m.rowIds?.includes(rowId)&&m.colIds?.includes(colId))||null
}
export function isMergeMaster(merge,rowId,colId){return !!merge&&merge.rowIds?.[0]===rowId&&merge.colIds?.[0]===colId}
export function isCoveredCell(el,rowId,colId){
  const m=mergeForCell(el,rowId,colId);return !!m&&!isMergeMaster(m,rowId,colId)
}

function mergeIntersectsIds(m,rowIds,colIds){
  return m.rowIds?.some(r=>rowIds.includes(r))&&m.colIds?.some(c=>colIds.includes(c))
}

export function mergeVisualRange(el,visualRows,cols,range){
  ensureTableModel(el,{});
  const rowIds=visualRows.slice(range.r0,range.r1+1).map(r=>r.id);
  const colIds=cols.slice(range.c0,range.c1+1).map(c=>c.id);
  if(!rowIds.length||!colIds.length||rowIds.length*colIds.length<2)return null;
  el.merges=(el.merges||[]).filter(m=>!mergeIntersectsIds(m,rowIds,colIds));
  const merge={id:id("merge"),rowIds:[...rowIds],colIds:[...colIds]};
  el.merges.push(merge);

  const masterRow=rowIds[0],masterCol=colIds[0];
  const masterVisualRow=visualRows[range.r0];
  if(masterVisualRow?.type==="manual"&&!getCellOverride(el,masterRow,masterCol)){
    setCellOverride(el,masterRow,masterCol,{type:"text",text:"",align:"center",valign:"middle",padding:2,wrap:true,imageFit:el.tableImageFit||"contain",mergeDefault:true});
  }
  // Clear only explicit subordinate overrides; source data is never destroyed.
  for(const r of rowIds)for(const c of colIds){
    if(r===masterRow&&c===masterCol)continue;
    setCellOverride(el,r,c,null);
  }
  return merge;
}

export function unmergeVisualRange(el,visualRows,cols,range){
  const rowIds=visualRows.slice(range.r0,range.r1+1).map(r=>r.id);
  const colIds=cols.slice(range.c0,range.c1+1).map(c=>c.id);
  const removed=(el.merges||[]).filter(m=>mergeIntersectsIds(m,rowIds,colIds));
  el.merges=(el.merges||[]).filter(m=>!mergeIntersectsIds(m,rowIds,colIds));
  for(const m of removed){
    const r=m.rowIds?.[0],c=m.colIds?.[0],o=getCellOverride(el,r,c);
    if(o?.mergeDefault)setCellOverride(el,r,c,null);
  }
  return removed.length;
}

function rowDefIndex(el,rowId){return (el.rowDefs||[]).findIndex(r=>r.id===rowId)}
export function insertManualRow(el,visualRows,index){
  ensureTableModel(el,{});
  const newRow={id:id("row"),type:"manual",height:Number(el.rowHeight)||8,heightMode:el.autoRowHeight===false?"fixed":"auto"};
  let defIndex=el.rowDefs.length;
  if(index<visualRows.length){
    const target=visualRows[index];
    const idx=rowDefIndex(el,target.id);
    if(idx>=0)defIndex=idx;
  }
  const beforeRows=visualRows.map(r=>r.id);
  el.rowDefs.splice(defIndex,0,newRow);
  // If inserted strictly inside an existing merge, expand that merge.
  for(const m of el.merges||[]){
    const indexes=m.rowIds.map(r=>beforeRows.indexOf(r)).filter(i=>i>=0).sort((a,b)=>a-b);
    if(indexes.length&&index>indexes[0]&&index<=indexes[indexes.length-1]){
      const pos=m.rowIds.findIndex(r=>beforeRows.indexOf(r)>=index);
      m.rowIds.splice(pos<0?m.rowIds.length:pos,0,newRow.id);
    }
  }
  el.designRowCount=el.rowDefs.length;
  return newRow;
}

export function deleteVisualRows(el,visualRows,rowIndexes){
  ensureTableModel(el,{});
  const targets=[...new Set(rowIndexes)].map(i=>visualRows[i]).filter(Boolean);
  if(!targets.length)return false;

  const persistentIds=targets.map(r=>r.id).filter(rid=>rowDefIndex(el,rid)>=0);
  const suppressed=new Set((el.suppressedDataIndexes||[]).map(Number));
  for(const row of targets)if(row.type==="data"&&Number.isInteger(row.sourceIndex))suppressed.add(row.sourceIndex);
  el.suppressedDataIndexes=[...suppressed].sort((a,b)=>a-b);

  el.rowDefs=el.rowDefs.filter(r=>!persistentIds.includes(r.id));
  const nextMerges=[];
  for(const m of el.merges||[]){
    const rowIds=m.rowIds.filter(r=>!persistentIds.includes(r));
    if(rowIds.length*m.colIds.length>1)nextMerges.push({...m,rowIds});
  }
  el.merges=nextMerges;
  for(const key of Object.keys(el.cellMap||{})){
    const rowId=key.split("::")[0];if(persistentIds.includes(rowId))delete el.cellMap[key];
  }

  if(!el.rowDefs.length){
    el.rowDefs=[{id:id("row"),type:"manual",height:Number(el.rowHeight)||8,heightMode:el.autoRowHeight===false?"fixed":"auto"}];
  }
  el.designRowCount=el.rowDefs.length;
  return true;
}

export function insertColumn(el,index){
  const cols=normalizeTableColumns(el);
  const neighbor=cols[Math.min(index,cols.length-1)]||cols[cols.length-1];
  let width=20;
  if(neighbor){width=Math.max(8,Number(neighbor.width)/2);neighbor.width=Math.max(8,Number(neighbor.width)-width)}
  const col={id:id("col"),title:"新列",field:"",template:"",width,align:"center",headerAlign:"center"};
  const before=cols.map(c=>c.id);
  cols.splice(Math.max(0,Math.min(index,cols.length)),0,col);
  // Expand merges only when insertion occurs inside them.
  for(const m of el.merges||[]){
    const indexes=m.colIds.map(cid=>before.indexOf(cid)).filter(i=>i>=0).sort((a,b)=>a-b);
    if(indexes.length&&index>indexes[0]&&index<=indexes[indexes.length-1]){
      const pos=m.colIds.findIndex(cid=>before.indexOf(cid)>=index);
      m.colIds.splice(pos<0?m.colIds.length:pos,0,col.id);
    }
  }
  el.columns=cols;normalizeTableColumns(el);return col;
}

function contiguousRuns(ids,order){
  const indexed=ids.map(id=>({id,index:order.indexOf(id)})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index);
  const runs=[];let current=[];
  for(const item of indexed){
    if(!current.length||item.index===current[current.length-1].index+1)current.push(item);
    else{runs.push(current);current=[item]}
  }
  if(current.length)runs.push(current);
  return runs.map(run=>run.map(x=>x.id))
}
export function normalizeMergeContiguity(el){
  const rowOrder=(el.rowDefs||[]).map(r=>r.id),colOrder=normalizeTableColumns(el).map(c=>c.id);
  const next=[];
  for(const m of el.merges||[]){
    const rr=contiguousRuns(m.rowIds||[],rowOrder),cc=contiguousRuns(m.colIds||[],colOrder);
    for(const rows of rr)for(const cols of cc){
      if(rows.length*cols.length>1)next.push({id:id("merge"),rowIds:rows,colIds:cols});
    }
  }
  el.merges=next;
  return next
}

export function deleteColumns(el,indexes){
  const cols=normalizeTableColumns(el),unique=[...new Set(indexes)].sort((a,b)=>b-a);
  if(unique.length>=cols.length)return false;
  const ids=unique.map(i=>cols[i]?.id).filter(Boolean);
  for(const i of unique)if(cols[i])cols.splice(i,1);
  el.columns=cols;
  el.merges=(el.merges||[]).map(m=>({...m,colIds:m.colIds.filter(c=>!ids.includes(c))})).filter(m=>m.rowIds.length*m.colIds.length>1);
  for(const key of Object.keys(el.cellMap||{})){
    const colId=key.split("::")[1];if(ids.includes(colId))delete el.cellMap[key];
  }
  normalizeTableColumns(el);return true;
}

export function visibleColumns(el,visualRows,rootData={},hideEmpty=false){
  const cols=normalizeTableColumns(el);
  if(!hideEmpty)return cols;
  const requiredByMerge=new Set((el.merges||[]).flatMap(m=>m.colIds||[]));
  const visible=cols.filter(col=>
    requiredByMerge.has(col.id)||visualRows.some(row=>hasValue(cellValue(el,row,col,rootData).value))
  );
  return visible.length?visible:cols;
}

function estimatedWrappedRowHeight(el,row,cells){
  const base=rowHeight(row,el);
  if(row?.heightMode==="fixed"||el?.autoRowHeight===false||el?.wrap===false)return base;
  const fontPx=Math.max(6,Number(el?.fontSize)||9);
  const pxPerMm=96/25.4;
  const lineMm=(fontPx*1.35)/pxPerMm;
  let needed=base;
  for(const cell of cells){
    const valueText=String(cell.value??"");
    const imageLike=cell.cfg?.type==="image"||/图片|图像|image/i.test(String(cell.col?.field||cell.col?.title||""))||valueText.startsWith("data:image/")||valueText.startsWith("blob:");
    if(!hasValue(cell.value))continue;
    if(imageLike){
      needed=Math.max(needed,Math.max(base,14));
      continue
    }
    const widthPct=Math.max(1,Number(cell.col?.width)||100/Math.max(1,cells.length));
    const cellMm=Math.max(4,(Number(el?.w)||100)*widthPct/100);
    const pad=Math.max(0,Number(cell.cfg?.padding??2));
    const usable=Math.max(2,cellMm-pad*2);
    const charMm=Math.max(.9,(fontPx/pxPerMm)*.95);
    const chars=Math.max(1,Math.floor(usable/charMm));
    const lines=String(cell.value??"").split(/\n/).reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].length/chars)),0);
    needed=Math.max(needed,lines*lineMm+pad*2+.8);
  }
  return Math.ceil(Math.min(80,needed)*2)/2;
}

export function buildTableLayout(el,rootData={},hideEmpty=false){
  ensureTableModel(el,rootData);
  const rows=materializeTableRows(el,rootData);
  const allCols=normalizeTableColumns(el);
  let cols=visibleColumns(el,rows,rootData,hideEmpty).map(col=>({...col,index:allCols.findIndex(c=>c.id===col.id)}));
  if(hideEmpty&&cols.length&&cols.length<allCols.length){
    const sum=cols.reduce((n,c)=>n+(Number(c.width)||0),0)||100;
    cols=cols.map(c=>({...c,width:(Number(c.width)||0)*100/sum}));
  }
  const rowIdSet=new Set(rows.map(r=>r.id)),colIdSet=new Set(cols.map(c=>c.id));
  const rowHeights=[];
  const cellRows=rows.map((row,rowIndex)=>{
    const cells=[];
    for(const col of cols){
      if(isCoveredCell(el,row.id,col.id))continue;
      const merge=mergeForCell(el,row.id,col.id);
      const master=isMergeMaster(merge,row.id,col.id);
      const {cfg,value}=cellValue(el,row,col,rootData);
      const rowspan=master?Math.max(1,(merge?.rowIds||[]).filter(id=>rowIdSet.has(id)).length):1;
      const colspan=master?Math.max(1,(merge?.colIds||[]).filter(id=>colIdSet.has(id)).length):1;
      cells.push({row,rowIndex,col,colIndex:col.index,merge,master,rowspan,colspan,cfg,value,height:rowHeight(row,el)});
    }
    const visualHeight=estimatedWrappedRowHeight(el,row,cells);
    rowHeights[rowIndex]=visualHeight;
    cells.forEach(cell=>cell.height=visualHeight);
    return cells;
  });
  const hasAny=cellRows.some(row=>row.some(cell=>hasValue(cell.value)));
  const headerHeight=el.showHeader===false?0:Number(el.headerHeight||el.rowHeight||8);
  const totalHeight=headerHeight+rowHeights.reduce((sum,h)=>sum+(Number(h)||0),0);
  return{rows,cols,allCols,cellRows,rowHeights,hasAny,headerHeight,totalHeight};
}


export function buildTableGrid(el,rootData={},hideEmpty=false){
  const base=buildTableLayout(el,rootData,hideEmpty);
  const {rows,cols,allCols,cellRows}=base;

  const visibleRows=cellRows.map((cells,sourceRowIndex)=>({
    sourceRowIndex,
    row:rows[sourceRowIndex],
    cells,
    height:Math.max(Number(rows[sourceRowIndex]?.height)||0,...cells.map(c=>Number(c.height)||0))
  })).filter(({cells,row})=>{
    const hasRenderedValue=cells.some(cell=>hasValue(cell.value));
    const mergeKeepsRow=(el.merges||[]).some(m=>m.rowIds?.includes(row?.id)&&(m.rowIds?.length||0)>1);
    const persistent=row?.type==="manual"||row?.type==="summary";
    return persistent||el.emptyBehavior!=="hide"||hasRenderedValue||mergeKeepsRow;
  });

  const visibleRowIds=new Set(visibleRows.map(x=>x.row?.id).filter(Boolean));
  const visibleColIds=new Set(cols.map(c=>c.id));
  const gridRows=visibleRows.map((entry,visualRowIndex)=>({
    ...entry,
    visualRowIndex,
    cells:entry.cells.map(cell=>{
      const merge=cell.merge;
      const rowspan=cell.master?Math.max(1,(merge?.rowIds||[]).filter(id=>visibleRowIds.has(id)).length):1;
      const colspan=cell.master?Math.max(1,(merge?.colIds||[]).filter(id=>visibleColIds.has(id)).length):1;
      return {...cell,rowspan,colspan};
    })
  }));

  const headerHeight=el.showHeader===false?0:Number(el.headerHeight||el.rowHeight||8);
  const totalHeight=headerHeight+gridRows.reduce((sum,x)=>sum+(Number(x.height)||Number(el.rowHeight)||8),0);
  const hasAny=gridRows.some(r=>r.cells.some(cell=>hasValue(cell.value)));
  return{...base,allCols,cols,gridRows,visibleRows:gridRows,headerHeight,totalHeight,hasAny};
}

export function rowHeight(row,el){return Number(row?.height)||Number(el?.rowHeight)||8}
