(() => {
  'use strict';

  const START_OVERLAY_ID='soloStartOverlay';
  const ORIENTATION_RECOVERY_WINDOW_MS=1800;
  let orientationChangeAt=0;
  let fullscreenExitAt=0;
  let orientationRecoveryArmed=false;
  let resumeFullscreenArmed=false;
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

  function requestGameFullscreen(doc=document,{recovery=false}={}){
    const root=doc?.documentElement;
    if(!root||doc.fullscreenElement||typeof root.requestFullscreen!=='function')return false;
    try{
      const request=root.requestFullscreen({navigationUI:'hide'});
      if(request&&typeof request.then==='function'){
        request.then(()=>{if(recovery)resumeFullscreenArmed=false;}).catch(()=>{if(recovery)resumeFullscreenArmed=true;});
      }else if(recovery)resumeFullscreenArmed=false;
      return true;
    }catch(_){
      if(recovery)resumeFullscreenArmed=true;
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
        mainMenuAutoAttempted=true;
        mainMenuFullscreenArmed=false;
        splash.classList.remove('gostop-boot-ready');
        delete splash.dataset.startLabel;
        resolve(true);
      };
      const finishAfterViewportSettles=()=>{
        const done=()=>setTimeout(finish,32);
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(done));else done();
      };
      const nativeTouch=('ontouchstart' in globalThis)||Number(globalThis.navigator?.maxTouchPoints||0)>0;
      const arm=()=>{
        if(nativeTouch)splash.addEventListener('touchend',enter,{once:true,passive:false});
        else splash.addEventListener('pointerup',enter,{once:true});
      };
      const verify=()=>{
        if(doc.fullscreenElement){finishAfterViewportSettles();return;}
        if(attempts<3){splash.dataset.startLabel='Tap Again for Full Screen';arm();return;}
        finish();
      };
      const enter=event=>{
        event?.preventDefault?.();
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
    if(initialMenuGateComplete){mainMenuFullscreenArmed=false;return false;}
    const lite=globalThis.GOSTOP_PERFORMANCE_LITE===true||doc?.documentElement?.classList?.contains('gostop-performance-lite');
    if(lite){mainMenuFullscreenArmed=false;return false;}
    mainMenuFullscreenArmed=true;
    if(!userGesture&&mainMenuAutoAttempted)return false;
    if(!root||typeof root.requestFullscreen!=='function')return false;
    if(!userGesture)mainMenuAutoAttempted=true;
    try{
      const request=root.requestFullscreen({navigationUI:'hide'});
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

  function isTextEntryActive(doc=document){
    const active=doc?.activeElement;
    return !!active?.matches?.('input,textarea,select,[contenteditable="true"]');
  }

  function handleFullscreenClick(event){
    if(!isMobileFullscreenEligible(globalThis))return;
    const lite=globalThis.GOSTOP_PERFORMANCE_LITE===true||document.documentElement?.classList?.contains('gostop-performance-lite');
    if(lite)return;
    if(resumeFullscreenArmed&&isGameplayInteraction(event.target)&&!event.target?.closest?.('input,textarea,select,[contenteditable="true"]')){
      requestGameFullscreen(document,{recovery:true});
      return;
    }
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
      resumeFullscreenArmed=false;
      mainMenuFullscreenArmed=false;
      fullscreenExitAt=0;
    }else{
      fullscreenExitAt=now;
      if(document.visibilityState==='hidden')resumeFullscreenArmed=true;
      if(orientationChangeAt&&now-orientationChangeAt<=ORIENTATION_RECOVERY_WINDOW_MS)orientationRecoveryArmed=true;
    }
    // Browser fullscreen already emits its own viewport/resize updates. Do not
    // synthesize another full-app resize here; on Android that can cause a black flash.
  }

  function handleOrientationChange(){
    const now=Date.now();
    orientationChangeAt=now;
    if(!document.fullscreenElement&&fullscreenExitAt&&now-fullscreenExitAt<=ORIENTATION_RECOVERY_WINDOW_MS){
      orientationRecoveryArmed=true;
    }
    refreshLayout();
  }

  let hiddenWhileUiModal=false;
  function handleVisibilityChange(){
    if(!isMobileFullscreenEligible(globalThis))return;
    if(document.visibilityState==='hidden'){
      resumeFullscreenArmed=true;
      hiddenWhileUiModal=isTextEntryActive(document)||!!document.querySelector?.('dialog[open]');
      return;
    }
    if(document.visibilityState==='visible'&&resumeFullscreenArmed&&!document.fullscreenElement&&!hiddenWhileUiModal&&!isTextEntryActive(document)&&!document.querySelector?.('dialog[open]')){
      requestGameFullscreen(document,{recovery:true});
    }
    hiddenWhileUiModal=false;
  }

  function handleForegroundReturn(){
    if(!isMobileFullscreenEligible(globalThis)||document.visibilityState==='hidden'||document.fullscreenElement)return;
    if(isTextEntryActive(document)||document.querySelector?.('dialog[open]'))return;
    if(resumeFullscreenArmed)requestGameFullscreen(document,{recovery:true});
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
  document.addEventListener('visibilitychange',handleVisibilityChange);
  globalThis.addEventListener?.('orientationchange',handleOrientationChange);
  globalThis.addEventListener?.('pageshow',handleForegroundReturn);
  globalThis.addEventListener?.('focus',handleForegroundReturn);

  if(globalThis.GOSTOP_TEST_MODE===true){
    globalThis.GOSTOP_FULLSCREEN_TEST_API=Object.freeze({
      isMobileFullscreenEligible,requestGameFullscreen,requestMainMenuFullscreen,gateInitialMainMenuFullscreen,isStartScreenButton,isMainMenuInteraction,isGameplayInteraction,isTextEntryActive,
      handleFullscreenClick,handleFullscreenChange,handleOrientationChange,handleVisibilityChange,handleForegroundReturn,
      isOrientationRecoveryArmed:()=>orientationRecoveryArmed,
      isResumeFullscreenArmed:()=>resumeFullscreenArmed,
      isMainMenuFullscreenArmed:()=>mainMenuFullscreenArmed,
      isMainMenuAutoAttempted:()=>mainMenuAutoAttempted,
      isInitialMenuGateComplete:()=>initialMenuGateComplete
    });
  }
})();