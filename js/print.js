import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-3";

let activeJob=null;
let lastPdfUrl=null;

function recordData(record){
  if(!record)return{};
  return record.data&&typeof record.data==="object"?record.data:record;
}

function waitForImages(root,timeout=7000){
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
    if(!src||src.startsWith("data:")||src.startsWith("blob:"))return;
    try{
      const res=await fetch(src,{mode:"cors",credentials:"omit",cache:"force-cache"});
      if(!res.ok)return;
      const blob=await res.blob();
      img.src=await blobToDataUrl(blob);
      try{await img.decode?.()}catch{}
    }catch{}
  }));
}

function makeRenderHost(template,records){
  const page={width:Number(template.page?.width)||215,height:Number(template.page?.height)||140};
  const host=document.createElement("div");
  host.className="print-host print-render-host";
  host.setAttribute("aria-hidden","true");
  host.style.cssText=[
    "position:fixed","left:-100000px","top:0","z-index:-1",
    "background:#fff","margin:0","padding:0",
    "width:"+page.width+"mm"
  ].join(";");
  host.innerHTML=records.map(record=>renderTemplateToHtml(template,recordData(record))).join("");
  document.body.appendChild(host);
  return{host,page};
}

async function prepareRenderedSheets(template,records){
  const {host,page}=makeRenderHost(template,records);
  await hydrateCodes(host);
  await waitForImages(host);
  await inlineRemoteImages(host);
  await waitForImages(host);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return{host,page,sheets:[...host.querySelectorAll(".print-sheet")]};
}

async function loadPdfDeps(){
  const [hc,jp]=await Promise.all([
    import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm"),
    import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm")
  ]);
  return{html2canvas:hc.default||hc,jsPDF:jp.jsPDF||jp.default?.jsPDF||jp.default};
}

async function renderExactPdf(template,records){
  const {host,page,sheets}=await prepareRenderedSheets(template,records);
  try{
    if(!sheets.length)throw new Error("打印内容为空");
    const {html2canvas,jsPDF}=await loadPdfDeps();
    const orientation=page.width>=page.height?"landscape":"portrait";
    const pdf=new jsPDF({orientation,unit:"mm",format:[page.width,page.height],compress:true});
    for(let i=0;i<sheets.length;i++){
      const sheet=sheets[i];
      // Exact physical page: the same renderer and same mm box used by editor/preview.
      const canvas=await html2canvas(sheet,{
        backgroundColor:"#ffffff",
        scale:3,
        useCORS:true,
        allowTaint:false,
        logging:false,
        imageTimeout:7000,
        width:sheet.offsetWidth,
        height:sheet.offsetHeight,
        scrollX:0,
        scrollY:0,
        windowWidth:sheet.offsetWidth,
        windowHeight:sheet.offsetHeight
      });
      if(i>0)pdf.addPage([page.width,page.height],orientation);
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,page.width,page.height,undefined,"FAST");
    }
    return{blob:pdf.output("blob"),page};
  }finally{
    host.remove();
  }
}

function openPdfForPrint(blob,popup){
  if(lastPdfUrl)URL.revokeObjectURL(lastPdfUrl);
  lastPdfUrl=URL.createObjectURL(blob);
  const target=popup&&!popup.closed?popup:window.open("about:blank","_blank");
  if(!target){
    const a=document.createElement("a");
    a.href=lastPdfUrl;a.target="_blank";a.rel="noopener";a.click();
    return;
  }
  target.location.replace(lastPdfUrl);
  target.focus?.();
  // Chrome's PDF viewer owns its own print UI. A programmatic print attempt is safe;
  // if blocked, the user already lands on the exact-size PDF and can press Print.
  setTimeout(()=>{try{target.print()}catch{}},1200);
}

export async function printTemplateRecords(template,records,{beforePrint=null,afterPrint=null}={}){
  if(!template)throw new Error("缺少打印模板");
  const list=(Array.isArray(records)?records:[records]).filter(Boolean);
  if(!list.length)throw new Error("没有可打印的数据");

  if(activeJob)throw new Error("正在生成打印成品，请稍候");
  activeJob={};

  // Open synchronously from the user's click so popup blockers do not intercept the PDF.
  const popup=window.open("about:blank","super-print-pdf","popup=yes,resizable=yes,scrollbars=yes,width=1100,height=820");
  if(popup){
    try{
      popup.document.open();
      popup.document.write('<!doctype html><meta charset="utf-8"><title>正在生成打印成品</title><style>body{font-family:Microsoft YaHei,Arial,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f7fb;color:#17223c}div{text-align:center}b{display:block;font-size:20px;margin-bottom:8px}small{color:#6b7a9a}</style><div><b>正在生成打印成品</b><small>正在按模板实际尺寸生成所见即所得页面…</small></div>');
      popup.document.close();
    }catch{}
  }

  try{
    beforePrint?.();
    const {blob}=await renderExactPdf(template,list);
    openPdfForPrint(blob,popup);
  }catch(err){
    try{popup?.close()}catch{}
    throw err;
  }finally{
    activeJob=null;
    try{afterPrint?.()}catch{}
  }
}
