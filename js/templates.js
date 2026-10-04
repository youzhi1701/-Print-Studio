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
export function loadTemplates(){const raw=localStorage.getItem(STORAGE_KEYS.templates);const data=safeJson(raw,null);if(Array.isArray(data)&&data.length)return data;localStorage.setItem(STORAGE_KEYS.templates,JSON.stringify([seed]));return [structuredClone(seed)]}
export function saveTemplates(list){localStorage.setItem(STORAGE_KEYS.templates,JSON.stringify(list))}
export function createTemplate(name="未命名模板",page={width:215,height:140}){return{id:uid("tpl"),schemaVersion:1,name,category:"其他",status:"draft",page:{...page,orientation:page.width>=page.height?"landscape":"portrait",margin:5,safeArea:4},elements:[],createdAt:Date.now(),updatedAt:Date.now()}}
export function exportTemplate(tpl){const blob=new Blob([JSON.stringify(tpl,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(tpl.name||"template")+".superprint.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
