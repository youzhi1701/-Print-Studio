import {STORAGE_KEYS,uid,safeJson,storageGet,storageSet,storageScopedKey} from "./state.js?v=20261006-21";
import {ensureTableModel} from "./table-model.js?v=20261006-21";

const BUILTIN_CREATED_AT=1760000000000;
const page=(width,height,margin=4)=>({width,height,orientation:width>=height?"landscape":"portrait",margin,safeArea:Math.min(4,margin)});
const text=(id,x,y,w,h,value,fontSize=10,fontWeight=400,align="left")=>({id,type:"text",x,y,w,h,text:value,fontSize,fontWeight,align});
const field=(id,x,y,w,h,label,name,fontSize=10,fontWeight=400,align="left")=>({id,type:"field",x,y,w,h,label:"",field:name,text:String(label||"")+"{{"+name+"}}",fontSize,fontWeight,align,wrap:true,maxLines:0,overflowMode:"clip",emptyBehavior:"hide"});
const line=(id,x,y,w,borderWidth=.35)=>({id,type:"line",x,y,w,h:.5,borderWidth,borderStyle:"solid"});
const barcode=(id,x,y,w,h,name,fontSize=7)=>({id,type:"barcode",x,y,w,h,field:name,showText:true,barcodeFormat:"CODE128",barcodeFontSize:fontSize});
const qrcode=(id,x,y,w,h,name)=>({id,type:"qrcode",x,y,w,h,field:name,qrLevel:"M",qrMargin:0});
const image=(id,x,y,w,h,name,fit="contain")=>({id,type:"image",x,y,w,h,field:name,imageFit:fit,radius:0,aspectLock:true,alignX:"center",alignY:"center",padding:0,emptyBehavior:"hide"});
const table=(id,x,y,w,h,columns,rowHeight=8,maxRows=5)=>({id,type:"table",x,y,w,h,columns,fontSize:8,showHeader:true,zebra:false,rowHeight,maxRows,designRowCount:1,borderWidth:.5,dataField:"",tableImageFit:"contain",wrap:true,hideEmptyColumns:true,emptyBehavior:"hide",merges:[],rowHeights:{},cells:{},tableEditorVersion:2});
function builtin(id,name,category,description,p,elements,tags=[]){
  return{id,schemaVersion:7,name,category,description,tags,builtIn:true,status:"published",page:p,elements,createdAt:BUILTIN_CREATED_AT,updatedAt:BUILTIN_CREATED_AT};
}

export const BUILTIN_TEMPLATES=[
  builtin("tpl_shipping_215x140","发货单 215×140","单据","适合订单发货、仓库拣货后随货打印。",page(215,140,6),[
    text("t1",82,7,52,10,"发货单",20,800,"center"),
    field("f1",12,24,78,8,"收件人：","收件人",11),
    field("f2",108,24,78,8,"手机号：","手机号",11),
    field("f3",12,34,174,12,"收货地址：","收货地址",10),
    field("f4",12,47,90,8,"订单编号：","订单编号",10),
    table("tbl",12,59,191,42,[
      {title:"产品图",field:"产品图片",width:20,align:"center"},
      {title:"商品名称",field:"商品名称",width:32,align:"left"},
      {title:"商品属性",field:"商品属性",width:30,align:"center"},
      {title:"数量",field:"数量",width:18,align:"center"}
    ],8,5),
    barcode("bc1",120,111,70,18,"订单编号",8)
  ],["订单","发货","215×140"]),

  builtin("tpl_packing_a5","配货清单 A5","单据","A5 随货清单，适合多商品订单和仓库复核。",page(148,210,7),[
    text("t1",49,8,50,10,"配货清单",18,800,"center"),
    field("f1",9,23,63,8,"订单：","订单编号",9),
    field("f2",78,23,61,8,"客户：","收件人",9),
    line("l1",9,34,130),
    table("tbl",9,39,130,112,[
      {title:"商品",field:"商品名称",width:36,align:"left"},
      {title:"规格",field:"商品属性",width:30,align:"left"},
      {title:"数量",field:"数量",width:14,align:"center"},
      {title:"单价",field:"价格",width:20,align:"right"}
    ],9,10),
    field("f3",9,157,130,20,"地址：","收货地址",9),
    barcode("bc1",39,181,70,18,"订单编号",7)
  ],["A5","配货","拣货"]),

  builtin("tpl_shipping_100x150","物流面单 100×150","物流","常见 4×6 英寸热敏纸规格，适合物流/快递类信息。",page(100,150,4),[
    text("t1",6,5,88,8,"物流标签",16,800,"center"),
    field("f1",6,18,55,8,"收件：","收件人",11,700),
    field("f2",63,18,31,8,"","手机号",9,600,"right"),
    field("f3",6,29,88,25,"","收货地址",12,700),
    line("l1",6,58,88,.6),
    field("f4",6,63,88,8,"订单：","订单编号",9),
    barcode("bc1",10,77,80,26,"订单编号",8),
    qrcode("qr1",31,109,38,38,"订单编号")
  ],["100×150","4×6","热敏","物流"]),

  builtin("tpl_address_100x60","地址标签 100×60","物流","简洁地址贴，适合纸箱、文件袋和内部转运。",page(100,60,4),[
    field("f1",6,6,52,9,"","收件人",13,800),
    field("f2",60,7,34,8,"","手机号",9,600,"right"),
    field("f3",6,19,88,22,"","收货地址",11,700),
    barcode("bc1",7,44,86,12,"订单编号",6)
  ],["地址","100×60","包裹"]),

  builtin("tpl_product_70x50","商品标签 70×50","商品","通用商品标签，支持商品名、规格、价格和条码。",page(70,50,3),[
    image("img1",3,4,18,18,"产品图片","contain"),
    field("f1",24,4,43,10,"","商品名称",10,700),
    field("f2",24,15,43,7,"","商品属性",8),
    field("f3",3,25,25,10,"¥ ","价格",14,800),
    barcode("bc1",30,25,37,20,"SKU编码",6)
  ],["商品","70×50","条码"]),

  builtin("tpl_price_60x40","价格标签 60×40","零售","门店价格牌/货架价签，突出商品名与售价。",page(60,40,3),[
    field("f1",3,4,54,8,"","商品名称",9,700,"center"),
    field("f2",3,14,54,14,"¥ ","价格",20,800,"center"),
    field("f3",3,30,54,6,"","商品属性",7,400,"center")
  ],["价格","60×40","货架"]),

  builtin("tpl_barcode_50x30","条码标签 50×30","标签","紧凑条码贴，适合 SKU、资产或内部编码。",page(50,30,2),[
    field("f1",2,2,46,6,"","商品名称",7,600,"center"),
    barcode("bc1",3,9,44,18,"条码值",6)
  ],["条码","50×30","SKU"]),

  builtin("tpl_qr_50x50","二维码标签 50×50","标签","方形二维码贴，适合订单、资产或跳转信息。",page(50,50,3),[
    qrcode("qr1",7,5,36,36,"订单编号"),
    field("f1",3,43,44,5,"","订单编号",6,500,"center")
  ],["二维码","50×50"]),

  builtin("tpl_jewelry_70x30","珠宝饰品标签 70×30","商品","适合贵金属、珠宝、饰品等小型商品信息标签。",page(70,30,2),[
    field("f1",2,3,42,7,"","商品名称",8,700),
    field("f2",2,11,42,6,"","商品属性",7),
    field("f3",2,19,22,8,"¥ ","价格",10,800),
    barcode("bc1",45,4,23,22,"SKU编码",5)
  ],["珠宝","贵金属","70×30"]),

  builtin("tpl_receipt_80x120","订单小票 80×120","单据","适合热敏小票机打印订单摘要、商品明细和订单码。",page(80,120,4),[
    text("t1",15,4,50,8,"订单小票",15,800,"center"),
    field("f1",4,15,72,6,"订单：","订单编号",7),
    field("f2",4,23,72,6,"客户：","收件人",7),
    line("l1",4,31,72,.4),
    table("tbl",4,35,72,48,[
      {title:"商品",field:"商品名称",width:44,align:"left"},
      {title:"数量",field:"数量",width:20,align:"center"},
      {title:"金额",field:"价格",width:36,align:"right"}
    ],8,5),
    line("l2",4,87,72,.4),
    barcode("bc1",10,92,60,20,"订单编号",6)
  ],["小票","80mm","订单"]),

  builtin("tpl_carton_100x100","箱唛标签 100×100","物流","仓库箱唛/外箱标签，突出商品、数量和订单识别码。",page(100,100,4),[
    text("t1",7,5,86,10,"外箱标签",16,800,"center"),
    field("f1",6,19,88,12,"","商品名称",12,800,"center"),
    field("f2",6,33,88,9,"规格：","商品属性",9,600),
    field("f3",6,44,40,10,"数量：","数量",11,800),
    qrcode("qr1",57,43,36,36,"订单编号"),
    barcode("bc1",7,81,86,14,"订单编号",6)
  ],["箱唛","100×100","仓库"])
];

const BUILTIN_IDS=new Set(BUILTIN_TEMPLATES.map(t=>t.id));
export function isBuiltinTemplate(tplOrId){
  const id=typeof tplOrId==="string"?tplOrId:tplOrId?.id;
  return !!(tplOrId?.builtIn||BUILTIN_IDS.has(id)||String(id||"").startsWith("tpl_builtin_"));
}
export function templateCategory(tpl){return String(tpl?.category||"其他")}

function normalizeTemplateTables(template){
  if(!template)return template;
  for(const el of template.elements||[])if(el.type==="table")ensureTableModel(el,{});
  template.schemaVersion=7;
  return template
}
function finite(v,fallback,min=-Infinity,max=Infinity){
  const n=Number(v);const x=Number.isFinite(n)?n:fallback;return Math.max(min,Math.min(max,x))
}
function normalizeGeometry(el,p){
  if(!el||typeof el!=="object")return el;
  const minH=el.type==="line"?.1:.5;
  el.w=finite(el.w,20,.5,p.width);
  el.h=finite(el.h,8,minH,p.height);
  el.x=finite(el.x,0,0,Math.max(0,p.width-el.w));
  el.y=finite(el.y,0,0,Math.max(0,p.height-el.h));
  if("fontSize" in el)el.fontSize=finite(el.fontSize,10,5,96);
  if("borderWidth" in el)el.borderWidth=finite(el.borderWidth,.5,.1,10);
  if("barcodeFontSize" in el)el.barcodeFontSize=finite(el.barcodeFontSize,8,5,48);
  return el
}
export function normalizeTemplateObject(t){
  const legacy=Number(t?.schemaVersion||1)<7;
  const rawPage=t?.page||{};
  const normalizedPage={
    width:finite(rawPage.width,215,20,1000),
    height:finite(rawPage.height,140,20,1000),
    margin:finite(rawPage.margin,5,0,50),
    safeArea:finite(rawPage.safeArea,4,0,50)
  };
  normalizedPage.orientation=normalizedPage.width>=normalizedPage.height?"landscape":"portrait";
  normalizedPage.safeArea=Math.min(normalizedPage.safeArea,normalizedPage.width/2,normalizedPage.height/2);
  const tpl={
    ...t,
    schemaVersion:7,
    category:t?.category||"其他",
    description:t?.description||"",
    tags:Array.isArray(t?.tags)?t.tags:[],
    status:t?.status||"draft",
    page:normalizedPage,
    printSettings:{
      scale:finite(t?.printSettings?.scale,100,90,110),
      offsetX:finite(t?.printSettings?.offsetX,0,-20,20),
      offsetY:finite(t?.printSettings?.offsetY,0,-20,20)
    },
    elements:Array.isArray(t?.elements)?t.elements.map(el=>{
      if(el.type==="table"){
        const cols=Array.isArray(el.columns)?el.columns.map((col,i)=>typeof col==="string"?{id:uid("col"),title:col,field:col,width:null,align:i===0?"left":"center"}:{id:col.id||uid("col"),...col}):[];
        return{
          showHeader:true,zebra:false,rowHeight:8,headerHeight:8,autoRowHeight:true,maxRows:5,designRowCount:1,borderWidth:.5,dataField:"",
          tableImageFit:"contain",wrap:true,hideEmptyColumns:true,emptyBehavior:"hide",smartLayout:false,smartColumns:false,merges:[],rowHeights:{},cells:{},tableEditorVersion:3,
          ...el,columns:cols,
          ...(legacy?{tableImageFit:"cover",hideEmptyColumns:true,emptyBehavior:"hide"}:{})
        }
      }
      if(el.type==="image")return{imageFit:"contain",radius:0,aspectLock:true,alignX:"center",alignY:"center",padding:0,emptyBehavior:"hide",...el,...(legacy?{imageFit:"cover"}:{})}
      if(el.type==="barcode")return{barcodeFormat:"CODE128",showText:true,barcodeFontSize:8,...el}
      if(el.type==="qrcode")return{qrLevel:"M",qrMargin:0,...el}
      if(el.type==="line"||el.type==="container")return{borderWidth:.5,borderStyle:"solid",radius:0,...el}
      if(el.type==="field")return{wrap:true,maxLines:0,overflowMode:"clip",emptyBehavior:"hide",...el}
      if(el.type==="text")return{wrap:true,maxLines:0,overflowMode:"clip",emptyBehavior:"blank",...el}
      return el
    }):[]
  };
  tpl.elements=tpl.elements.map(el=>normalizeGeometry(el,tpl.page));
  normalizeTemplateTables(tpl);
  return tpl;
}

export function loadTemplates(){
  const raw=storageGet(storageScopedKey(STORAGE_KEYS.templates));
  const data=safeJson(raw,null);
  let list=Array.isArray(data)?data.filter(Boolean).map(normalizeTemplateObject):[];
  const byId=new Map(list.map(t=>[t.id,t]));
  for(const built of BUILTIN_TEMPLATES){
    if(!byId.has(built.id))list.push(normalizeTemplateObject(structuredClone(built)));
    else{
      const existing=byId.get(built.id);
      if(existing?.builtIn||built.id==="tpl_shipping_215x140"){
        const i=list.findIndex(t=>t.id===built.id);
        list[i]=normalizeTemplateObject(structuredClone(built));
      }
    }
  }
  list.sort((a,b)=>{
    const ab=isBuiltinTemplate(a),bb=isBuiltinTemplate(b);
    if(ab!==bb)return ab?-1:1;
    return Number(b.updatedAt||0)-Number(a.updatedAt||0);
  });
  storageSet(storageScopedKey(STORAGE_KEYS.templates),JSON.stringify(list));
  return list;
}
export function saveTemplates(list){
  for(let i=0;i<(list||[]).length;i++){
    const tpl=list[i];if(!tpl)continue;
    const normalized=normalizeTemplateObject(tpl);
    Object.keys(tpl).forEach(k=>delete tpl[k]);
    Object.assign(tpl,normalized);
  }
  return storageSet(storageScopedKey(STORAGE_KEYS.templates),JSON.stringify(list||[]))
}
export function createTemplate(name="未命名模板",p={width:215,height:140}){
  return{id:uid("tpl"),schemaVersion:7,name,category:"自定义",description:"",tags:[],status:"draft",page:{...p,orientation:p.width>=p.height?"landscape":"portrait",margin:5,safeArea:4},printSettings:{scale:100,offsetX:0,offsetY:0},elements:[],createdAt:Date.now(),updatedAt:Date.now()}
}
export function importTemplateObject(input,existing=[]){
  const raw=input?.template&&typeof input.template==="object"?input.template:input;
  if(!isValidTemplateObject(raw))throw new Error("模板文件格式无效");
  const tpl=structuredClone(raw);
  const ids=new Set((existing||[]).map(t=>t.id));
  if(!tpl.id||ids.has(tpl.id)||isBuiltinTemplate(tpl.id))tpl.id=uid("tpl");
  tpl.builtIn=false;
  tpl.name=String(tpl.name||"导入模板").trim()||"导入模板";
  tpl.category=tpl.category||"自定义";
  tpl.status=tpl.status||"draft";
  tpl.page={width:215,height:140,orientation:"landscape",margin:5,safeArea:4,...(tpl.page||{})};
  tpl.printSettings={scale:100,offsetX:0,offsetY:0,...(tpl.printSettings||{})};
  tpl.createdAt=Number(tpl.createdAt)||Date.now();
  tpl.updatedAt=Date.now();
  return normalizeTemplateObject(tpl);
}
export function isValidTemplateObject(input){
  return !!(input&&typeof input==="object"&&Array.isArray(input.elements)&&input.page&&Number(input.page.width)>0&&Number(input.page.height)>0)
}
export function exportTemplate(tpl){
  normalizeTemplateTables(tpl);
  const blob=new Blob([JSON.stringify(tpl,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(tpl.name||"template")+".superprint.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

const FIELD_ALIASES={
  "订单编号":["订单编号","订单号","订单id","单号","序号","运单号","物流单号"],
  "收件人":["收件人","收货人","收件姓名","姓名","客户姓名","联系人"],
  "手机号":["手机号","手机","电话","联系电话","收件电话","收货电话"],
  "收货地址":["收货地址","地址","详细地址","买家地址"],
  "商品名称":["商品名称","商品","商品标题","产品标题","标题","sku名称","产品名称","品名"],
  "商品属性":["商品属性","规格","规格型号","属性","sku","型号"],
  "数量":["数量","件数","购买数量","商品数量"],
  "价格":["价格","单价","金额","成交价","售价","商品价格"],
  "产品图片":["产品图片","商品图片","图片","主图","SKU图片","sku图片"],
  "SKU编码":["SKU编码","sku编码","SKU","sku","商品编码","货号","商家编码","产品编码"],
  "条码值":["条码值","商品条码","条形码","barcode","ean13","EAN13","UPC"],
  "运单号":["运单号","物流单号","快递单号","面单号","tracking","trackingno"],
  "发件人":["发件人","寄件人","发货人","商家名称","店铺名称"],
  "发件电话":["发件电话","寄件电话","发货电话","商家电话"],
  "发货地址":["发货地址","寄件地址","发件地址","仓库地址"],
  "备注":["备注","订单备注","买家留言","卖家备注","说明"],
  "总金额":["总金额","订单金额","实付金额","应付金额","合计","订单合计"],
  "日期":["日期","下单日期","创建时间","订单时间","打印日期"],
  "重量":["重量","毛重","净重","包裹重量","商品重量"],
  "批次号":["批次号","批次","lot","LOT","批号"],
  "品牌":["品牌","品牌名称","brand"],
  "单位":["单位","计量单位","unit"]
};

function norm(s){return String(s||"").trim().toLowerCase().replace(/[\s_\-]/g,"")}
export function matchFieldName(target,fields=[]){
  const names=fields.map(f=>f.name).filter(Boolean);
  if(!names.length)return"";
  const aliases=FIELD_ALIASES[target]||[target];
  for(const a of aliases){
    const exact=names.find(n=>norm(n)===norm(a));
    if(exact)return exact;
  }
  for(const a of aliases){
    const hit=names.find(n=>norm(n).includes(norm(a))||norm(a).includes(norm(n)));
    if(hit)return hit;
  }
  return"";
}
export function autoBindTemplateFields(template,fields=[]){
  if(!template||!Array.isArray(template.elements)||!fields.length)return false;
  let changed=false;
  for(const el of template.elements){
    if(el.type==="field"||el.type==="barcode"||el.type==="qrcode"||el.type==="image"){
      const current=el.field;
      if(current&&fields.some(f=>f.name===current))continue;
      const matched=matchFieldName(current||el.label?.replace(/[：:]/g,"")||"",fields);
      if(matched){
        if(el.type==="field"){
          const combined=(String(el.label||"")+String(el.text||"")).trim();
          const compact=s=>String(s||"").replace(/\s+/g,"").replace(/：/g,":");
          const defaults=[
            "",
            "{{字段}}",
            "字段：{{字段}}",
            current?"{{"+current+"}}":"",
            current?(current+"：{{"+current+"}}"):"",
            current?(current+":{{"+current+"}}"):"",
            current?(current+"： {{"+current+"}}"):"",
            current?(current+": {{"+current+"}}"):""
          ].filter(Boolean);
          el.label="";
          if(defaults.some(v=>compact(v)===compact(combined))||el.text===undefined||el.text===null||el.text===""){
            el.text=matched+"：{{"+matched+"}}"
          }
          if(!el.align)el.align="center";
        }
        el.field=matched;changed=true
      }
    }
    if(el.type==="table"&&Array.isArray(el.columns)){
      el.columns=el.columns.map(col=>{
        if(typeof col==="string"){
          const m=matchFieldName(col,fields)||col;
          return{title:col,field:m,template:"{{"+m+"}}",width:null,align:"center"}
        }
        const currentField=col.field||"";
        if(currentField&&fields.some(f=>f.name===currentField)){
          if(col.template===undefined)return{...col,template:"{{"+currentField+"}}"};
          return col
        }
        const matched=matchFieldName(currentField||col.title,fields);
        if(matched&&matched!==currentField){
          const titleWasDefault=!col.title||col.title===currentField;
          const templateWasDefault=col.template===undefined||col.template===""||col.template==="{{"+currentField+"}}";
          changed=true;
          return{
            ...col,
            field:matched,
            title:titleWasDefault?matched:col.title,
            template:templateWasDefault?"{{"+matched+"}}":col.template
          }
        }
        if(col.template===undefined&&currentField)return{...col,template:"{{"+currentField+"}}"};
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
