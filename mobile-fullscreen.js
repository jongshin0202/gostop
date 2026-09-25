(() => {
  'use strict';

  const START_OVERLAY_ID='soloStartOverlay';
  const ORIENTATION_RECOVERY_WINDOW_MS=1800;
  let orientationChangeAt=0;
  let fullscreenExitAt=0;
  let orientationRecoveryArmed=false;
  let mainMenuFullscreenArmed=false;
  let mainMenuAutoAttempted=false;

  function isMobileFullscreenEligible(env=globalThis){
    const touchPoints=Number(env.navigator?.maxTouchPoints||0);
    const coarsePointer=!!env.matchMedia?.('(pointer: coarse)')?.matches;
    const touchLike=touchPoints>0||coarsePointer;
    const width=Number(env.innerWidth||0),height=Number(env.innerHeight||0);
    const phoneViewport=(width<=700&&height<=1000)||(width<=1000&&height<=600);
    return touchLike&&phoneViewport;
  }

  function requestGameFullscreen(doc=document){
    const root=doc?.documentElement;
    if(!root||doc.fullscreenElement||typeof root.requestFullscreen!=='function')return false;
    try{
      const request=root.requestFullscreen();
      if(request&&typeof request.catch==='function')request.catch(()=>{});
      return true;
    }catch(_){
      return false;
    }
  }

  function isStartScreenButton(target,doc=document){
    const overlay=doc?.getElementById?.(START_OVERLAY_ID);
    if(!overlay||overlay.hidden)return false;
    const button=target?.closest?.('button');
    if(!button)return false;
    return !!button.closest?.(`#${START_OVERLAY_ID}, .topbar`);
  }

  function isMainMenuInteraction(target,doc=document){
    const overlay=doc?.getElementById?.(START_OVERLAY_ID);
    if(!overlay||overlay.hidden)return false;
    return !!target?.closest?.(`#${START_OVERLAY_ID}, .topbar`);
  }

  function requestMainMenuFullscreen(doc=document,{userGesture=false}={}){
    if(!isMobileFullscreenEligible(globalThis))return false;
    const root=doc?.documentElement;
    if(doc?.fullscreenElement){mainMenuFullscreenArmed=false;return false;}
    mainMenuFullscreenArmed=true;
    const lite=globalThis.GOSTOP_PERFORMANCE_LITE===true||doc?.documentElement?.classList?.contains('gostop-performance-lite');
    if(!userGesture&&(lite||mainMenuAutoAttempted))return false;
    if(!root||typeof root.requestFullscreen!=='function')return false;
    if(!userGesture)mainMenuAutoAttempted=true;
    try{
      const request=root.requestFullscreen();
      if(request&&typeof request.then==='function'){
        request.then(()=>{mainMenuFullscreenArmed=false;}).catch(()=>{mainMenuFullscreenArmed=true;});
      }else{
        mainMenuFullscreenArmed=false;
      }
      return true;
    }catch(_){
      mainMenuFullscreenArmed=true;
      return false;
    }
  }

  function isGameplayInteraction(target){
    return !!target?.closest?.('.app-shell');
  }

  function handleFullscreenClick(event){
    if(!isMobileFullscreenEligible(globalThis))return;
    if((mainMenuFullscreenArmed||isStartScreenButton(event.target,document))&&isMainMenuInteraction(event.target,document)){
      requestMainMenuFullscreen(document,{userGesture:true});
      return;
    }
    if(orientationRecoveryArmed&&isGameplayInteraction(event.target)){
      orientationRecoveryArmed=false;
      orientationChangeAt=0;
      fullscreenExitAt=0;
      requestGameFullscreen(document);
    }
  }

  function refreshLayout(){
    const refresh=()=>globalThis.dispatchEvent?.(new Event('resize'));
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(refresh);else refresh();
  }

  function handleFullscreenChange(){
    const now=Date.now();
    if(document.fullscreenElement){
      orientationRecoveryArmed=false;
      mainMenuFullscreenArmed=false;
      fullscreenExitAt=0;
    }else{
      fullscreenExitAt=now;
      if(orientationChangeAt&&now-orientationChangeAt<=ORIENTATION_RECOVERY_WINDOW_MS)orientationRecoveryArmed=true;
    }
    refreshLayout();
  }

  function handleOrientationChange(){
    const now=Date.now();
    orientationChangeAt=now;
    if(!document.fullscreenElement&&fullscreenExitAt&&now-fullscreenExitAt<=ORIENTATION_RECOVERY_WINDOW_MS){
      orientationRecoveryArmed=true;
    }
    refreshLayout();
  }

  if(!document.querySelector('link[data-gostop-fullscreen-style]')){
    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href='mobile-fullscreen.css';
    style.dataset.gostopFullscreenStyle='true';
    document.head.appendChild(style);
  }

  globalThis.GoStopMobileFullscreen=Object.freeze({requestMainMenuFullscreen,requestGameFullscreen,isMobileFullscreenEligible});
  document.addEventListener('click',handleFullscreenClick,{capture:true});
  document.addEventListener('fullscreenchange',handleFullscreenChange);
  globalThis.addEventListener?.('orientationchange',handleOrientationChange);

  if(globalThis.GOSTOP_TEST_MODE===true){
    globalThis.GOSTOP_FULLSCREEN_TEST_API=Object.freeze({
      isMobileFullscreenEligible,requestGameFullscreen,requestMainMenuFullscreen,isStartScreenButton,isMainMenuInteraction,isGameplayInteraction,
      handleFullscreenClick,handleFullscreenChange,handleOrientationChange,
      isOrientationRecoveryArmed:()=>orientationRecoveryArmed,
      isMainMenuFullscreenArmed:()=>mainMenuFullscreenArmed,
      isMainMenuAutoAttempted:()=>mainMenuAutoAttempted
    });
  }
})();