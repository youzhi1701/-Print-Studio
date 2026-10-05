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
    badge.className="build-version-badge";
    badge.setAttribute("aria-label","当前版本");
    document.body.appendChild(badge);
  }
  badge.textContent="v"+version;
  badge.title="超级打印 · build "+version;
}
