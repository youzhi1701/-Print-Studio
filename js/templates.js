import {STORAGE_KEYS,uid,safeJson} from "./state.js";
const seed={id:"tpl_shipping_215x140",schemaVersion:1,name:"发货单 215×140",category:"发货",status:"published",page:{width:215,height:140,orientation:"landscape",margin:6,safeArea:4},elements:[
{id:"t1",type:"text",x:82,y:7,w:52,h:10,text:"发货单",fontSize:20,fontWeight:800,align:"center"},
{id:"f1",type:"field",x:12,y:24,w:78,h:8,label:"收件人：",field:"收件人",fontSize:11},
{id:"f2",type:"field",x:108,y:24,w:78,h:8,label:"手机号：",field:"手机号",fontSize:11},
{id:"f3",type:"field",x:12,y:34,w:174,h:12,label:"收货地址：",field:"收货地址",fontSize:10},
{id:"f4",type:"field",x:12,y:47,w:90,h:8,label:"订单编号：",field:"订单编号",fontSize:10},
{id:"tbl",type:"table",x:12,y:59,w:191,h:48,columns:["商品名称","商品属性","数量","价格"],fontSize:9},
{id:"bc1",type:"barcode",x:120,y:111,w:70,h:18,field:"订单编号",showText:true}
],createdAt:Date.now(),updatedAt:Date.now()};
export function loadTemplates(){
  const raw=localStorage.getItem(STORAGE_KEYS.templates);
  const data=safeJson(raw,null);
  let list=Array.isArray(data)?data.filter(Boolean):[];
  // Migration guard: always keep the built-in shipping template available.
  // Older prototype builds may have stored only an empty "未命名模板".
  if(!list.some(t=>t?.id===seed.id)) list.unshift(structuredClone(seed));
  list=list.map(t=>({
    schemaVersion:1,
    category:"其他",
    status:"draft",
    page:{width:215,height:140,orientation:"landscape",margin:5,safeArea:4,...(t.page||{})},
    elements:Array.isArray(t.elements)?t.elements:[],
    ...t
  }));
  localStorage.setItem(STORAGE_KEYS.templates,JSON.stringify(list));
  return list;
}
export function saveTemplates(list){localStorage.setItem(STORAGE_KEYS.templates,JSON.stringify(list))}
export function createTemplate(name="未命名模板",page={width:215,height:140}){return{id:uid("tpl"),schemaVersion:1,name,category:"其他",status:"draft",page:{...page,orientation:page.width>=page.height?"landscape":"portrait",margin:5,safeArea:4},elements:[],createdAt:Date.now(),updatedAt:Date.now()}}
export function exportTemplate(tpl){const blob=new Blob([JSON.stringify(tpl,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(tpl.name||"template")+".superprint.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}


const FIELD_ALIASES={
  "订单编号":["订单编号","订单号","订单id","单号","序号"],
  "收件人":["收件人","收货人","收件姓名","姓名","客户姓名","联系人"],
  "手机号":["手机号","手机","电话","联系电话","收件电话","收货电话"],
  "收货地址":["收货地址","地址","详细地址","买家地址"],
  "商品名称":["商品名称","商品","商品标题","产品标题","标题","sku名称","产品名称"],
  "商品属性":["商品属性","规格","规格型号","属性","sku"],
  "数量":["数量","件数","购买数量"],
  "价格":["价格","单价","金额","成交价","售价"]
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
      el.columns=el.columns.map(col=>matchFieldName(col,fields)||col);
    }
  }
  return changed;
}
