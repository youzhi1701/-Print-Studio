import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261006-07";

let activeJob=null;

function recordData(record){
  if(!record)return{};
  return record.data&&typeof record.data==="object"?record.data:record;
}

function waitForImages(root,timeout=8000){
  const imgs=[...root.querySelectorAll("img")];
  if(!imgs.length)return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map(async img=>{
      if(img.complete&&img.naturalWidth>0)return;
      try{
        if(img.decode)await img.decode();
        else await new Promise(resolve=>{
          const done=()=>resolve();
          img.addEventListener("load",done,{once:true});
          img.addEventListener("error",done,{once:true});
        });
      }catch{}
    })),
    new Promise(resolve=>setTimeout(resolve,timeout))
  ]);
}

async function blobToDataUrl(blob){
  return await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=reject;
    r.readAsDataURL(blob);
  });
}

async function inlineRemoteImages(root){
  const imgs=[...root.querySelectorAll("img")];
  await Promise.all(imgs.map(async img=>{
    const src=img.currentSrc||img.src;
    if(!src||src.startsWith("data:"))return;
    if(src.startsWith("blob:")){
      try{
        const res=await fetch(src);
        if(res.ok)img.src=await blobToDataUrl(await res.blob());
      }catch{}
      return;
    }
    try{
      const res=await fetch(src,{mode:"cors",credentials:"omit",cache:"no-store"});
      if(!res.ok)return;
      img.src=await blobToDataUrl(await res.blob());
      try{await img.decode?.()}catch{}
    }catch(err){
      console.warn("打印图片内联失败，将保留原地址",src,err);
    }
  }));
}

function makeRenderHost(template,records){
  const page={width:Number(template.page?.width)||215,height:Number(template.page?.height)||140};
  const host=document.createElement("div");
  host.className="print-render-host";
  host.setAttribute("aria-hidden","true");
  host.style.cssText=[
    "position:fixed","left:-100000px","top:0","z-index:-1",
    "background:#fff","margin:0","padding:0","width:"+page.width+"mm"
  ].join(";");
  host.innerHTML=records.map(record=>renderTemplateToHtml(template,recordData(record))).join("");
  document.body.appendChild(host);
  return{host,page};
}

function rasterizeOnlyQrCanvases(root){
  for(const canvas of [...root.querySelectorAll("canvas.qrcode")]){
    try{
      const img=document.createElement("img");
      img.src=canvas.toDataURL("image/png",1);
      img.alt="";
      img.style.cssText=canvas.style.cssText+";display:block;max-width:100%;max-height:100%;image-rendering:auto";
      img.width=canvas.width;
      img.height=canvas.height;
      canvas.replaceWith(img);
    }catch(err){console.warn("二维码转换为打印图像失败",err)}
  }
}

async function preparePrintMarkup(template,records,onProgress=()=>{}){
  const {host,page}=makeRenderHost(template,records);
  try{
    onProgress("正在生成条码和二维码","共 "+records.length+" 条记录");
    await hydrateCodes(host);
    onProgress("正在检查图片","读取并固定打印图片");
    await waitForImages(host);
    await inlineRemoteImages(host);
    await waitForImages(host);
    rasterizeOnlyQrCanvases(host);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

    const failed=[...host.querySelectorAll("img")].filter(img=>img.src&&img.complete&&img.naturalWidth===0);
    if(failed.length)throw new Error("有 "+failed.length+" 张图片加载失败，请重新同步数据后再打印");

    const failedBarcodes=[...host.querySelectorAll("svg.barcode[data-value]")].filter(node=>node.dataset.value&&!node.dataset.hydrated);
    if(failedBarcodes.length){
      const first=failedBarcodes[0];
      const field=first.dataset.field?("字段「"+first.dataset.field+"」"):"条码";
      const reason=first.dataset.error||"数据或条码格式不合法";
      throw new Error(field+"生成失败："+reason+(failedBarcodes.length>1?("；另有 "+(failedBarcodes.length-1)+" 个条码异常"):""));
    }

    const sheets=[...host.querySelectorAll(".print-sheet")];
    if(!sheets.length)throw new Error("打印内容为空");
    onProgress("内容检查完成","正在打开系统打印");
    return{page,markup:sheets.map(sheet=>sheet.outerHTML).join("")};
  }finally{
    host.remove();
  }
}

function printDocumentHtml(page,markup,printSettings={}){
  const w=Number(page.width)||215,h=Number(page.height)||140;
  const scale=Math.max(.9,Math.min(1.1,(Number(printSettings.scale)||100)/100));
  const offsetX=Math.max(-20,Math.min(20,Number(printSettings.offsetX)||0));
  const offsetY=Math.max(-20,Math.min(20,Number(printSettings.offsetY)||0));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>超级打印</title>
<style>
@page{size:${w}mm ${h}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0!important;padding:0!important;background:#fff!important}
html{width:${w}mm}
body{
  width:${w}mm;
  font-family:"Microsoft YaHei","Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",Arial,sans-serif;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
  text-rendering:geometricPrecision;
}
.print-sheet{
  position:relative!important;
  width:${w}mm!important;
  height:${h}mm!important;
  margin:0!important;
  padding:0!important;
  overflow:hidden!important;
  background:#fff!important;
  transform:translate(${offsetX}mm,${offsetY}mm) scale(${scale});
  transform-origin:top left;
  break-after:page;
  page-break-after:always;
}
.print-sheet:last-child{break-after:auto;page-break-after:auto}
img{image-rendering:auto}
svg{shape-rendering:crispEdges;text-rendering:geometricPrecision}
table{border-spacing:0}
@media screen{
  body{background:#d7dbe2!important;padding:10mm!important;width:auto}
  .print-sheet{box-shadow:0 3mm 10mm rgba(0,0,0,.18);margin:0 auto 8mm!important}
}
@media print{
  body{width:${w}mm!important}
  .print-sheet{box-shadow:none!important}
}
</style>
</head>
<body>${markup}<script>
async function waitImages(timeout=8000){
  const imgs=[...document.images];
  if(!imgs.length)return true;
  let timer;
  const done=Promise.all(imgs.map(img=>new Promise(resolve=>{
    if(img.complete)return resolve(img.naturalWidth>0);
    const ok=()=>resolve(true),bad=()=>resolve(false);
    img.addEventListener("load",ok,{once:true});
    img.addEventListener("error",bad,{once:true});
  })));
  const timed=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeout)});
  const result=await Promise.race([done,timed]);
  clearTimeout(timer);
  if(result===null)return false;
  return result.every(Boolean);
}
window.addEventListener("load",async()=>{
  try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch{}
  const imagesOk=await waitImages();
  if(!imagesOk){
    document.body.insertAdjacentHTML("afterbegin",'<div style="position:fixed;z-index:99999;left:12px;right:12px;top:12px;padding:10px 12px;border:1px solid #ef4444;background:#fff5f5;color:#b91c1c;font:14px Microsoft YaHei,Arial,sans-serif">部分图片未加载完成，已暂停打印。请关闭窗口并重新同步数据后重试。</div>');
    return;
  }
  setTimeout(()=>{window.focus();window.print()},120);
});
</script></body></html>`;
}

function updatePreparingPopup(popup,title,detail=""){
  try{
    if(!popup||popup.closed)return;
    const t=popup.document.getElementById("prepTitle"),d=popup.document.getElementById("prepDetail");
    if(t)t.textContent=title||"正在准备高清打印";
    if(d)d.textContent=detail||"";
  }catch{}
}

function openPreparingPopup(){
  const popup=window.open("about:blank","super-print-direct","popup=yes,resizable=yes,scrollbars=yes,width=1100,height=820");
  if(!popup)return null;
  try{
    popup.document.open();
    popup.document.write('<!doctype html><meta charset="utf-8"><title>正在准备打印</title><style>body{font-family:Microsoft YaHei,Arial,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f7fb;color:#17223c}div{text-align:center;max-width:560px;padding:24px}b{display:block;font-size:20px;margin-bottom:8px}small{display:block;color:#6b7a9a;line-height:1.6}</style><div><b id="prepTitle">正在准备高清打印</b><small id="prepDetail">文字、表格和条码将使用浏览器原生矢量打印，不再整页截图。</small></div>');
    popup.document.close();
  }catch{}
  return popup;
}

export async function printTemplateRecords(template,records,{beforePrint=null,afterPrint=null}={}){
  if(!template)throw new Error("缺少打印模板");
  const list=(Array.isArray(records)?records:[records]).filter(Boolean);
  if(!list.length)throw new Error("没有可打印的数据");
  if(activeJob)throw new Error("正在准备打印，请稍候");

  activeJob={};
  const popup=openPreparingPopup();
  if(!popup){
    activeJob=null;
    throw new Error("浏览器拦截了打印窗口，请允许弹出窗口后重试");
  }

  try{
    beforePrint?.();
    updatePreparingPopup(popup,"正在准备打印","共 "+list.length+" 条记录");
    const {page,markup}=await preparePrintMarkup(template,list,(title,detail)=>updatePreparingPopup(popup,title,detail));
    if(popup.closed)throw new Error("打印窗口已关闭");
    popup.document.open();
    popup.document.write(printDocumentHtml(page,markup,template.printSettings||{}));
    popup.document.close();
  }catch(err){
    try{popup.close()}catch{}
    throw err;
  }finally{
    activeJob=null;
    try{afterPrint?.()}catch{}
  }
}
