(() => {
  'use strict';

  const TAP_SLOP_PX=8;
  const FLICK_DISTANCE_PX=24;
  const FLICK_VELOCITY_PX_MS=0.20;
  const FLICK_WINDOW_MS=170;
  const FLICK_LOCK_PX=14;
  const MAX_FOLLOW_PX=82;
  const NATIVE_CLICK_GUARD_MS=650;
  const TOUCH_CLICK_WINDOW_MS=1200;

  let selectedCard=null;
  let previewCard=null;
  let gesture=null;
  let bypassCard=null;
  let suppressNativeClickUntil=0;
  let lastTouchPointerAt=0;
  let handLayoutFrame=0;

  function isMobileHandEligible(env=globalThis){
    const touchPoints=Number(env.navigator?.maxTouchPoints||0);
    const coarsePointer=!!env.matchMedia?.('(pointer: coarse)')?.matches;
    const touchLike=touchPoints>0||coarsePointer;
    const width=Number(env.innerWidth||0),height=Number(env.innerHeight||0);
    const phoneViewport=(width<=700&&height<=1000)||(width<=1000&&height<=600);
    return touchLike&&phoneViewport;
  }

  function eventTime(event){
    const stamp=Number(event?.timeStamp);
    return Number.isFinite(stamp)&&stamp>=0?stamp:performance.now();
  }

  function recentFlickMetrics(samples,finalY,finalTime){
    const endTime=Number(finalTime),endY=Number(finalY);
    if(!Number.isFinite(endTime)||!Number.isFinite(endY))return {distance:0,velocity:0,elapsed:0};
    const cutoff=endTime-FLICK_WINDOW_MS;
    const recent=(samples||[]).filter(sample=>Number.isFinite(sample?.time)&&Number.isFinite(sample?.y)&&sample.time>=cutoff&&sample.time<=endTime);
    recent.push({y:endY,time:endTime});
    let anchor={y:endY,time:endTime};
    for(const sample of recent){
      if(sample.time>=endTime)continue;
      if(sample.y>anchor.y||(sample.y===anchor.y&&sample.time>anchor.time))anchor=sample;
    }
    const distance=Math.max(0,anchor.y-endY);
    const elapsed=Math.max(1,endTime-anchor.time);
    return {distance,velocity:distance/elapsed,elapsed};
  }

  function isDeliberateUpwardFlick(samples,finalY,finalTime){
    const metrics=recentFlickMetrics(samples,finalY,finalTime);
    return metrics.distance>=FLICK_DISTANCE_PX&&metrics.velocity>=FLICK_VELOCITY_PX_MS;
  }

  function playerHand(){return document.getElementById?.('playerHand')||null;}
  function handCardFromTarget(target){
    const card=target?.closest?.('.hand-card');
    if(!card||card.disabled||!card.closest?.('#playerHand'))return null;
    return card;
  }
  function slotForCard(card){return card?.closest?.('.hand-card-slot')||null;}
  function targetIsInsideHand(target){return !!target?.closest?.('#playerHand');}

  function setSelectedCard(card){
    if(selectedCard===card)return;
    const oldSlot=slotForCard(selectedCard);
    if(oldSlot)oldSlot.classList.remove('is-mobile-selected');
    selectedCard=card||null;
    const newSlot=slotForCard(selectedCard);
    if(newSlot&&selectedCard!==previewCard)newSlot.classList.add('is-mobile-selected');
  }

  function setPreviewCard(card,dragY=0){
    if(previewCard!==card){
      const oldSlot=slotForCard(previewCard);
      if(oldSlot){
        oldSlot.classList.remove('is-mobile-preview');
        oldSlot.style.removeProperty('--mobile-hand-drag-y');
        if(previewCard===selectedCard)oldSlot.classList.add('is-mobile-selected');
      }
      previewCard=card||null;
      const newSlot=slotForCard(previewCard);
      if(newSlot){
        newSlot.classList.remove('is-mobile-selected');
        newSlot.classList.add('is-mobile-preview');
      }
    }
    const slot=slotForCard(previewCard);
    if(slot)slot.style.setProperty('--mobile-hand-drag-y',`${Math.max(-MAX_FOLLOW_PX,Math.min(0,Number(dragY)||0))}px`);
  }

  function clearPreview(){setPreviewCard(null,0);}

  function computeAdaptiveStep(availableWidth,cardWidth,count){
    const available=Math.max(0,Number(availableWidth)||0);
    const width=Math.max(0,Number(cardWidth)||0);
    const cards=Math.max(0,Math.floor(Number(count)||0));
    if(cards<=1)return 0;
    return Math.max(0,(available-width)/(cards-1));
  }

  function layoutMobileHand(){
    const hand=playerHand();
    if(!hand)return;
    const slots=[...hand.querySelectorAll('.hand-card-slot')];
    if(!isMobileHandEligible(globalThis)){
      hand.style.removeProperty('justify-content');
      slots.forEach(slot=>slot.style.removeProperty('margin-left'));
      return;
    }
    if(!slots.length)return;
    let handWidth=Number(hand.clientWidth||0);
    if(!handWidth)handWidth=Number(hand.getBoundingClientRect?.().width||0);
    let padLeft=0,padRight=0;
    if(typeof getComputedStyle==='function'){
      const style=getComputedStyle(hand);
      padLeft=parseFloat(style.paddingLeft)||0;padRight=parseFloat(style.paddingRight)||0;
    }
    const available=Math.max(0,handWidth-padLeft-padRight);
    let cardWidth=Number(slots[0].offsetWidth||0);
    if(!cardWidth)cardWidth=Number(slots[0].getBoundingClientRect?.().width||0);
    if(!cardWidth)return;
    if(slots.length===1){
      hand.style.justifyContent='center';
      slots[0].style.marginLeft='0px';
      return;
    }
    hand.style.justifyContent='flex-start';
    const step=computeAdaptiveStep(available,cardWidth,slots.length);
    const margin=step-cardWidth;
    slots.forEach((slot,index)=>{slot.style.marginLeft=index===0?'0px':`${margin}px`;});
  }

  function scheduleHandLayout(){
    if(handLayoutFrame)return;
    const run=()=>{handLayoutFrame=0;layoutMobileHand();};
    if(typeof requestAnimationFrame==='function')handLayoutFrame=requestAnimationFrame(run);else run();
  }

  function buildGeometry(){
    layoutMobileHand();
    const hand=playerHand();
    if(!hand)return [];
    const geometry=[];
    hand.querySelectorAll('.hand-card-slot').forEach(slot=>{
      const card=slot.querySelector?.('.hand-card');
      if(!card||card.disabled)return;
      const rect=slot.getBoundingClientRect?.();
      if(!rect)return;
      geometry.push({card,slot,center:rect.left+rect.width/2});
    });
    geometry.sort((a,b)=>a.center-b.center);
    return geometry;
  }

  function nearestPlayableCard(clientX,geometry=null){
    const entries=geometry||buildGeometry();
    if(!entries.length)return null;
    let best=entries[0],bestDistance=Math.abs(clientX-best.center);
    for(let i=1;i<entries.length;i++){
      const distance=Math.abs(clientX-entries[i].center);
      if(distance<bestDistance){best=entries[i];bestDistance=distance;}
    }
    return best.card;
  }

  function suppressEvent(event){event.preventDefault?.();event.stopPropagation?.();}
  function recordGestureSample(event){
    if(!gesture)return;
    const time=eventTime(event);
    gesture.samples.push({y:event.clientY,time});
    const cutoff=time-(FLICK_WINDOW_MS+80);
    if(gesture.samples.length>3)gesture.samples=gesture.samples.filter((sample,index)=>index===0||sample.time>=cutoff);
  }

  function switchPreviewCard(card,event){
    const time=eventTime(event);
    gesture.previewCard=card;
    gesture.previewStartY=event.clientY;
    gesture.samples=[{y:event.clientY,time}];
    gesture.flickLocked=false;
    setPreviewCard(card,0);
  }

  function handlePointerDown(event){
    if(!isMobileHandEligible(globalThis)||event.pointerType!=='touch')return;
    lastTouchPointerAt=Date.now();
    const hand=playerHand();
    const directCard=handCardFromTarget(event.target);
    const insideHand=targetIsInsideHand(event.target);
    if(!directCard&&!insideHand){setSelectedCard(null);clearPreview();return;}
    if(!directCard&&event.target?.closest?.('button'))return;
    const geometry=buildGeometry();
    const card=directCard||nearestPlayableCard(event.clientX,geometry);
    if(!card){setSelectedCard(null);clearPreview();return;}
    if(selectedCard&&selectedCard!==card)setSelectedCard(null);
    const time=eventTime(event);
    gesture={
      pointerId:event.pointerId,
      startX:event.clientX,startY:event.clientY,startTime:time,
      lastX:event.clientX,lastY:event.clientY,
      previewCard:card,previewStartY:event.clientY,
      moved:false,scrubbing:false,flickLocked:false,
      geometry,samples:[{y:event.clientY,time}]
    };
    hand?.setPointerCapture?.(event.pointerId);
    setPreviewCard(card,0);
  }

  function handlePointerMove(event){
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    const distance=Math.hypot(dx,dy);
    if(distance>TAP_SLOP_PX){
      gesture.moved=true;
      setSelectedCard(null);
      event.preventDefault?.();
    }
    if(!gesture.flickLocked&&(gesture.scrubbing||Math.abs(dx)>TAP_SLOP_PX)){
      gesture.scrubbing=true;
      const candidate=nearestPlayableCard(event.clientX,gesture.geometry)||gesture.previewCard;
      if(candidate&&candidate!==gesture.previewCard)switchPreviewCard(candidate,event);
    }
    const localUp=gesture.previewStartY-event.clientY;
    const stepDx=event.clientX-gesture.lastX,stepDy=event.clientY-gesture.lastY;
    if(!gesture.flickLocked&&localUp>=FLICK_LOCK_PX&&(-stepDy>=Math.abs(stepDx)*0.5||localUp>=FLICK_DISTANCE_PX)){
      gesture.flickLocked=true;
    }
    recordGestureSample(event);
    gesture.lastX=event.clientX;gesture.lastY=event.clientY;
    setPreviewCard(gesture.previewCard,event.clientY-gesture.previewStartY);
  }

  function clearGestureVisuals(){
    clearPreview();
    const hand=playerHand();
    if(hand?.hasPointerCapture?.(gesture?.pointerId))hand.releasePointerCapture?.(gesture.pointerId);
  }

  function playCard(card){
    if(!card)return false;
    setSelectedCard(null);
    bypassCard=card;
    suppressNativeClickUntil=performance.now()+NATIVE_CLICK_GUARD_MS;
    card.click?.();
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(clearPreview);else clearPreview();
    return true;
  }

  function handlePointerUp(event){
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    lastTouchPointerAt=Date.now();
    const current=gesture;
    const time=eventTime(event);
    const flick=isDeliberateUpwardFlick(current.samples,event.clientY,time);
    const card=current.previewCard;
    gesture=null;
    if(flick){
      suppressEvent(event);
      playCard(card);
      return;
    }
    suppressNativeClickUntil=performance.now()+NATIVE_CLICK_GUARD_MS;
    if(current.moved||current.scrubbing){
      setSelectedCard(null);
      suppressEvent(event);
      clearPreview();
      return;
    }
    suppressEvent(event);
    if(selectedCard===card){
      clearPreview();
      playCard(card);
      return;
    }
    setSelectedCard(card);
    clearPreview();
  }

  function handlePointerCancel(event){
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    gesture=null;setSelectedCard(null);clearPreview();
  }

  function handleClick(event){
    const card=handCardFromTarget(event.target);
    if(card&&bypassCard===card){bypassCard=null;return;}
    if(!isMobileHandEligible(globalThis))return;
    if(Date.now()-lastTouchPointerAt>TOUCH_CLICK_WINDOW_MS)return;
    if(performance.now()<suppressNativeClickUntil)suppressEvent(event);
  }

  if(!document.querySelector('link[data-gostop-mobile-hand-style]')){
    const style=document.createElement('link');
    style.rel='stylesheet';style.href='mobile-hand.css';style.dataset.gostopMobileHandStyle='true';
    document.head.appendChild(style);
  }

  const hand=playerHand();
  if(hand&&typeof MutationObserver==='function')new MutationObserver(scheduleHandLayout).observe(hand,{childList:true});
  if(typeof ResizeObserver==='function'&&hand)new ResizeObserver(scheduleHandLayout).observe(hand);
  globalThis.addEventListener?.('resize',scheduleHandLayout);
  globalThis.addEventListener?.('orientationchange',scheduleHandLayout);
  scheduleHandLayout();

  document.addEventListener('pointerdown',handlePointerDown,{capture:true});
  document.addEventListener('pointermove',handlePointerMove,{capture:true,passive:false});
  document.addEventListener('pointerup',handlePointerUp,{capture:true});
  document.addEventListener('pointercancel',handlePointerCancel,{capture:true});
  document.addEventListener('click',handleClick,{capture:true});

  if(globalThis.GOSTOP_TEST_MODE===true){
    globalThis.GOSTOP_MOBILE_HAND_TEST_API=Object.freeze({
      isMobileHandEligible,recentFlickMetrics,isDeliberateUpwardFlick,computeAdaptiveStep,
      handCardFromTarget,nearestPlayableCard,layoutMobileHand,
      handlePointerDown,handlePointerMove,handlePointerUp,handlePointerCancel,handleClick,
      getSelectedCard:()=>selectedCard,getPreviewCard:()=>previewCard,getGesture:()=>gesture,
      constants:Object.freeze({TAP_SLOP_PX,FLICK_DISTANCE_PX,FLICK_VELOCITY_PX_MS,FLICK_WINDOW_MS,FLICK_LOCK_PX})
    });
  }
})();
