(() => {
  'use strict';

  const START_OVERLAY_ID='soloStartOverlay';
  const ORIENTATION_RECOVERY_WINDOW_MS=1800;
  let orientationChangeAt=0;
  let fullscreenExitAt=0;
  let orientationRecoveryArmed=false;
  let mainMenuFullscreenArmed=false;
  let mainMenuAutoAttempted=false;
  let initialMenuGateComplete=false;
  let initialMenuGatePromise=null;

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

  function gateInitialMainMenuFullscreen(doc=document){
    if(initialMenuGateComplete||!isMobileFullscreenEligible(globalThis))return null;
    const root=doc?.documentElement,splash=doc?.getElementById?.('gostopBootSplash');
    if(doc?.fullscreenElement){initialMenuGateComplete=true;return null;}
    if(!root||typeof root.requestFullscreen!=='function'||!splash){initialMenuGateComplete=true;return null;}
    if(initialMenuGatePromise)return initialMenuGatePromise;
    splash.classList.add('gostop-boot-ready');
    splash.dataset.startLabel='Tap to Start';
    splash.setAttribute('aria-hidden','false');
    initialMenuGatePromise=new Promise(resolve=>{
      let attempts=0;
      const finish=()=>{
        initialMenuGateComplete=true;
        initialMenuGatePromise=null;
        splash.classList.remove('gostop-boot-ready');
        delete splash.dataset.startLabel;
        resolve(true);
      };
      const arm=()=>splash.addEventListener('click',enter,{once:true});
      const verify=()=>{
        if(doc.fullscreenElement){finish();return;}
        if(attempts<3){splash.dataset.startLabel='Tap Again for Full Screen';arm();return;}
        finish();
      };
      const enter=()=>{
        attempts++;
        let request;
        try{request=root.requestFullscreen({navigationUI:'hide'});}
        catch(_){verify();return;}
        if(request&&typeof request.then==='function')request.then(verify).catch(verify);
        else verify();
      };
      arm();
    });
    return initialMenuGatePromise;
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
    const lite=globalThis.GOSTOP_PERFORMANCE_LITE===true||doc?.documentElement?.classList?.contains('gostop-performance-lite');
    if(lite){mainMenuFullscreenArmed=false;return false;}
    mainMenuFullscreenArmed=true;
    if(!userGesture&&mainMenuAutoAttempted)return false;
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
    const lite=globalThis.GOSTOP_PERFORMANCE_LITE===true||document.documentElement?.classList?.contains('gostop-performance-lite');
    if(lite)return;
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
    style.href='mobile-fullscreen.css?v=20260924-2';
    style.dataset.gostopFullscreenStyle='true';
    document.head.appendChild(style);
  }

  globalThis.GoStopMobileFullscreen=Object.freeze({requestMainMenuFullscreen,requestGameFullscreen,isMobileFullscreenEligible,gateInitialMainMenuFullscreen});
  document.addEventListener('click',handleFullscreenClick,{capture:true});
  document.addEventListener('fullscreenchange',handleFullscreenChange);
  globalThis.addEventListener?.('orientationchange',handleOrientationChange);

  if(globalThis.GOSTOP_TEST_MODE===true){
    globalThis.GOSTOP_FULLSCREEN_TEST_API=Object.freeze({
      isMobileFullscreenEligible,requestGameFullscreen,requestMainMenuFullscreen,gateInitialMainMenuFullscreen,isStartScreenButton,isMainMenuInteraction,isGameplayInteraction,
      handleFullscreenClick,handleFullscreenChange,handleOrientationChange,
      isOrientationRecoveryArmed:()=>orientationRecoveryArmed,
      isMainMenuFullscreenArmed:()=>mainMenuFullscreenArmed,
      isMainMenuAutoAttempted:()=>mainMenuAutoAttempted,
      isInitialMenuGateComplete:()=>initialMenuGateComplete
    });
  }
})();