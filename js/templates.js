import {STORAGE_KEYS,uid,safeJson,storageGet,storageSet} from "./state.js";
import {ensureTableModel} from "./table-model.js?v=20261005-19";
const seed={id:"tpl_shipping_215x140",schemaVersion:7,name:"发货单 215×140",category:"发货",status:"published",page:{width:215,height:140,orientation:"landscape",margin:6,safeArea:4},elements:[
{id:"t1",type:"text",x:82,y:7,w:52,h:10,text:"发货单",fontSize:20,fontWeight:800,align:"center"},
{id:"f1",type:"field",x:12,y:24,w:78,h:8,label:"收件人：",field:"收件人",fontSize:11},
{id:"f2",type:"field",x:108,y:24,w:78,h:8,label:"手机号：",field:"手机号",fontSize:11},
{id:"f3",type:"field",x:12,y:34,w:174,h:12,label:"收货地址：",field:"收货地址",fontSize:10},
{id:"f4",type:"field",x:12,y:47,w:90,h:8,label:"订单编号：",field:"订单编号",fontSize:10},
{id:"tbl",type:"table",x:12,y:59,w:191,h:42,columns:[{title:"产品图",field:"产品图片",width:20,align:"center"},{title:"商品名称",field:"商品名称",width:32,align:"left"},{title:"商品属性",field:"商品属性",width:30,align:"center"},{title:"价格",field:"价格",width:18,align:"right"}],fontSize:9,showHeader:true,zebra:false,rowHeight:8,maxRows:5,designRowCount:1,borderWidth:.5,dataField:"",tableImageFit:"cover",wrap:true,hideEmptyColumns:true,emptyBehavior:"hide",merges:[],rowHeights:{},cells:{},tableEditorVersion:2},
{id:"bc1",type:"barcode",x:120,y:111,w:70,h:18,field:"订单编号",showText:true,barcodeFontSize:8}
],createdAt:Date.now(),updatedAt:Date.now()};
export function loadTemplates(){
  const raw=storageGet(STORAGE_KEYS.templates);
  const data=safeJson(raw,null);
  let list=Array.isArray(data)?data.filter(Boolean):[];
  // Migration guard: always keep the built-in shipping template available.
  // Older prototype builds may have stored only an empty "未命名模板".
  if(!list.some(t=>t?.id===seed.id)) list.unshift(structuredClone(seed));
  list=list.map(t=>({
    ...t,
    schemaVersion:7,
    category:t.category||"其他",
    status:t.status||"draft",
    page:{width:215,height:140,orientation:"landscape",margin:5,safeArea:4,...(t.page||{})},
    elements:Array.isArray(t.elements)?t.elements.map(el=>{
      const legacy=Number(t.schemaVersion||1)<7;
      if(el.type==="table"){
        const cols=Array.isArray(el.columns)?el.columns.map((col,i)=>typeof col==="string"?{id:uid("col"),title:col,field:col,width:null,align:i===0?"left":"center"}:{id:col.id||uid("col"),...col}):[];
        return{
          showHeader:true,zebra:false,rowHeight:8,maxRows:5,designRowCount:1,borderWidth:.5,dataField:"",
          tableImageFit:"contain",wrap:true,hideEmptyColumns:false,emptyBehavior:"hide",merges:[],rowHeights:{},cells:{},tableEditorVersion:2,
          ...el,columns:cols,
          ...(legacy?{tableImageFit:"cover",hideEmptyColumns:true,emptyBehavior:"hide"}:{})
        }
      }
      if(el.type==="image")return{
        imageFit:"contain",radius:0,aspectLock:true,alignX:"center",alignY:"center",padding:0,emptyBehavior:"hide",
        ...el,...(legacy?{imageFit:"cover"}:{})
      }
      if(el.type==="barcode")return{barcodeFormat:"CODE128",showText:true,barcodeFontSize:8,...el}
      if(el.type==="qrcode")return{qrLevel:"M",qrMargin:0,...el}
      if(el.type==="line"||el.type==="container")return{borderWidth:.5,borderStyle:"solid",radius:0,...el}
      if(el.type==="field")return{wrap:true,maxLines:0,overflowMode:"clip",emptyBehavior:"hide",...el}
      if(el.type==="text")return{wrap:true,maxLines:0,overflowMode:"clip",emptyBehavior:"blank",...el}
      return el
    }):[]
  }));
  for(const tpl of list){
    for(const el of tpl.elements||[])if(el.type==="table")ensureTableModel(el,{});
    tpl.schemaVersion=7;
  }
  storageSet(STORAGE_KEYS.templates,JSON.stringify(list));
  return list;
}
function normalizeTemplateTables(template){
  if(!template)return template;
  for(const el of template.elements||[])if(el.type==="table")ensureTableModel(el,{});
  template.schemaVersion=7;
  return template
}
export function saveTemplates(list){
  for(const tpl of list||[])normalizeTemplateTables(tpl);
  storageSet(STORAGE_KEYS.templates,JSON.stringify(list||[]))
}
export function createTemplate(name="未命名模板",page={width:215,height:140}){return{id:uid("tpl"),schemaVersion:7,name,category:"其他",status:"draft",page:{...page,orientation:page.width>=page.height?"landscape":"portrait",margin:5,safeArea:4},elements:[],createdAt:Date.now(),updatedAt:Date.now()}}
export function importTemplateObject(input,existing=[]){
  const raw=input?.template&&typeof input.template==="object"?input.template:input;
  if(!raw||typeof raw!=="object"||!Array.isArray(raw.elements))throw new Error("模板文件格式无效");
  const tpl=structuredClone(raw);
  const ids=new Set((existing||[]).map(t=>t.id));
  if(!tpl.id||ids.has(tpl.id))tpl.id=uid("tpl");
  tpl.name=String(tpl.name||"导入模板").trim()||"导入模板";
  tpl.category=tpl.category||"其他";
  tpl.status=tpl.status||"draft";
  tpl.page={width:215,height:140,orientation:"landscape",margin:5,safeArea:4,...(tpl.page||{})};
  tpl.createdAt=Number(tpl.createdAt)||Date.now();
  tpl.updatedAt=Date.now();
  normalizeTemplateTables(tpl);
  return tpl;
}

export function exportTemplate(tpl){normalizeTemplateTables(tpl);const blob=new Blob([JSON.stringify(tpl,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(tpl.name||"template")+".superprint.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}


const FIELD_ALIASES={
  "订单编号":["订单编号","订单号","订单id","单号","序号"],
  "收件人":["收件人","收货人","收件姓名","姓名","客户姓名","联系人"],
  "手机号":["手机号","手机","电话","联系电话","收件电话","收货电话"],
  "收货地址":["收货地址","地址","详细地址","买家地址"],
  "商品名称":["商品名称","商品","商品标题","产品标题","标题","sku名称","产品名称"],
  "商品属性":["商品属性","规格","规格型号","属性","sku"],
  "数量":["数量","件数","购买数量"],
  "价格":["价格","单价","金额","成交价","售价"],
  "产品图片":["产品图片","商品图片","图片","主图","SKU图片","sku图片"]
};

function norm(s){return String(s||"").trim().toLowerCase().replace(/[\s_\-]/g,"")}
export function matchFieldName(target,fields=[]){
  const names=fields.map(f=>f.name).filter(Boolean);
  if(!names.length) return "";
  const aliases=FIELD_ALIASES[target]||[target];
  for(const a of aliases){
    const exact=names.find(n=>norm(n)===norm(a));
    if(exact) return exact;
  }
  for(const a of aliases){
    const hit=names.find(n=>norm(n).includes(norm(a))||norm(a).includes(norm(n)));
    if(hit) return hit;
  }
  return "";
}

export function autoBindTemplateFields(template,fields=[]){
  if(!template||!Array.isArray(template.elements)||!fields.length) return false;
  let changed=false;
  for(const el of template.elements){
    if(el.type==="field"||el.type==="barcode"||el.type==="qrcode"||el.type==="image"){
      const current=el.field;
      if(current&&fields.some(f=>f.name===current)) continue;
      const matched=matchFieldName(current||el.label?.replace(/[：:]/g,"")||"",fields);
      if(matched){el.field=matched;if(el.type==="field")el.text="{{"+matched+"}}";changed=true}
    }
    if(el.type==="table"&&Array.isArray(el.columns)){
      el.columns=el.columns.map(col=>{
        if(typeof col==="string"){const m=matchFieldName(col,fields)||col;return{title:col,field:m,width:null,align:"center"}}
        if(col.field&&fields.some(f=>f.name===col.field))return col;
        const matched=matchFieldName(col.field||col.title,fields);
        if(matched&&matched!==col.field){changed=true;return{...col,field:matched}}
        return col
      });
      if(el.cellMap&&typeof el.cellMap==="object"){
        for(const cell of Object.values(el.cellMap)){
          if(!cell||!["field","image"].includes(cell.type)||!cell.field||fields.some(f=>f.name===cell.field))continue;
          const matched=matchFieldName(cell.field,fields);
          if(matched){cell.field=matched;changed=true}
        }
      }
    }
  }
  return changed;
}
