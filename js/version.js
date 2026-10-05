export async function mountBuildVersion(){
  let version="unknown";
  try{
    const res=await fetch("./BUILD_VERSION?ts="+Date.now(),{cache:"no-store"});
    if(res.ok)version=(await res.text()).trim()||"unknown";
  }catch{}
  let badge=document.getElementById("buildVersionBadge");
  if(!badge){
    badge=document.createElement("span");
    badge.id="buildVersionBadge";
    badge.setAttribute("aria-label","当前版本");
  }

  // 版本号必须直接挂在可见的品牌容器下，不能放在会被响应式 CSS 隐藏的 p/small/b 内。
  const host=document.querySelector(".designer-brand,.quick-brand,.preview-title");
  if(host){
    host.appendChild(badge);
    badge.className="build-version-badge build-version-anchor";
  }else{
    document.body.appendChild(badge);
    badge.className="build-version-badge build-version-fallback";
  }

  badge.textContent="v"+version;
  badge.title="超级打印 · build "+version;
}