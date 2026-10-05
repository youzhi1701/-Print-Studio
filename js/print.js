import {renderTemplateToHtml,hydrateCodes} from "./renderer.js?v=20261005-2";

let activeJob=null;

function recordData(record){
  if(!record)return{};
  return record.data&&typeof record.data==="object"?record.data:record;
}

function waitForImages(root,timeout=5000){
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

function createPrintStyle(page){
  const style=document.createElement("style");
  style.id="superPrintRuntimeStyle";
  style.textContent=`
    @media print{
      @page{size:${page.width}mm ${page.height}mm;margin:0}
      html,body{margin:0!important;padding:0!important;background:#fff!important;width:auto!important;height:auto!important;overflow:visible!important}
      body.super-print-printing>*:not(.print-host){display:none!important}
      body.super-print-printing .print-host{
        display:block!important;position:static!important;inset:auto!important;
        margin:0!important;padding:0!important;width:auto!important;height:auto!important;
        overflow:visible!important;background:#fff!important
      }
      body.super-print-printing .print-host .print-sheet{
        display:block!important;position:relative!important;
        width:${page.width}mm!important;height:${page.height}mm!important;
        margin:0!important;padding:0!important;box-shadow:none!important;
        break-after:page;page-break-after:always
      }
      body.super-print-printing .print-host .print-sheet:last-child{
        break-after:auto;page-break-after:auto
      }
    }`;
  return style;
}

export async function printTemplateRecords(template,records,{beforePrint=null,afterPrint=null}={}){
  if(!template)throw new Error("缺少打印模板");
  const list=(Array.isArray(records)?records:[records]).filter(Boolean);
  if(!list.length)throw new Error("没有可打印的数据");

  if(activeJob){
    try{activeJob.cleanup()}catch{}
    activeJob=null;
  }

  const page={width:Number(template.page?.width)||215,height:Number(template.page?.height)||140};
  const host=document.createElement("div");
  host.className="print-host";
  host.setAttribute("aria-hidden","true");
  host.style.cssText="position:fixed;left:-100000px;top:0;z-index:2147483647;background:#fff;";
  host.innerHTML=list.map(record=>renderTemplateToHtml(template,recordData(record))).join("");

  const style=createPrintStyle(page);
  document.head.appendChild(style);
  document.body.appendChild(host);

  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;
    cleaned=true;
    document.body.classList.remove("super-print-printing");
    host.remove();
    style.remove();
    window.removeEventListener("afterprint",onAfterPrint);
    activeJob=null;
    try{afterPrint?.()}catch{}
  };
  const onAfterPrint=()=>cleanup();
  activeJob={cleanup};

  try{
    await hydrateCodes(host);
    await waitForImages(host);
    document.body.classList.add("super-print-printing");
    try{beforePrint?.()}catch{}
    window.addEventListener("afterprint",onAfterPrint,{once:true});

    // Give layout one frame after images/barcodes finish decoding.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();

    // Fallback for browsers/environments that do not emit afterprint reliably.
    setTimeout(()=>{if(activeJob?.cleanup===cleanup)cleanup()},60000);
  }catch(err){
    cleanup();
    throw err;
  }
}
