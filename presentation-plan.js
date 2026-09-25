(() => {
  'use strict';

  const FLICK_DEFAULTS=Object.freeze({
    minUpwardDistance:16,
    minTravelDistance:36,
    maxDuration:500,
    minSpeed:.11,
    maxHorizontalRatio:1.35
  });

  function isUpwardFlick(sample,options={}){
    if(!sample)return false;
    const config={...FLICK_DEFAULTS,...options};
    const startX=Number(sample.startX),startY=Number(sample.startY),endX=Number(sample.endX),endY=Number(sample.endY),duration=Math.max(1,Number(sample.duration)||1);
    if(![startX,startY,endX,endY].every(Number.isFinite))return false;
    const dx=endX-startX,up=startY-endY,travel=Math.hypot(dx,up);
    if(up<config.minUpwardDistance||travel<config.minTravelDistance||duration>config.maxDuration)return false;
    if(travel/duration<config.minSpeed)return false;
    return Math.abs(dx)<=up*config.maxHorizontalRatio;
  }

  function installHandFlickGestures(doc=globalThis.document){
    if(!doc||doc.documentElement?.dataset?.gostopFlickInstalled==='1')return false;
    if(doc.documentElement)doc.documentElement.dataset.gostopFlickInstalled='1';

    const style=doc.createElement('style');
    style.dataset.gostopMotionLayer='true';
    style.textContent=`
      #playerHand .hand-card{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
      #appShell,#appShell img,#scoreDialog,#scoreDialog img,#captureDialog,#captureDialog img,#resultDialog,#resultDialog img{-webkit-touch-callout:none}
      #scoreDialog{overscroll-behavior:contain}
      #scoreDialog .score-breakdown-card{touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
      .milestone-overlay[data-effect="flush"] .milestone-title:after{display:block!important;font-size:clamp(5.5rem,18vw,11rem)!important;line-height:1;margin:.18em auto 0!important;transform-origin:center}
      .gostop-flick-ghost{position:fixed!important;margin:0!important;pointer-events:none!important;z-index:3!important;transition:none!important;filter:none!important;contain:paint;isolation:isolate;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform}
      .physical-card,.physical-card.moving-card,.physical-card.deck-draw-card,.capture-flight-card,.sliding-capture{z-index:2!important;isolation:isolate;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:flat}
      .physical-card.moving-card,.capture-flight-card,.sliding-capture{contain:paint}
      @media (hover:none),(pointer:coarse){
        #playerHand .hand-card:hover{transform:none!important}
        #playerHand .hand-card-slot.is-hovered{z-index:40!important}
        #playerHand .hand-card-slot.is-hovered .hand-card{transform:translate3d(0,-18px,0) rotate(-1deg)!important;box-shadow:0 12px 18px rgba(0,0,0,.38)!important}
        #playerHand.gostop-touch-selection-cleared .hand-card-slot.is-hovered{z-index:auto!important}
        #playerHand.gostop-touch-selection-cleared .hand-card-slot.is-hovered .hand-card{transform:none!important;box-shadow:0 7px 10px rgba(0,0,0,.34)!important}
        #playerHand.gostop-touch-browsing .hand-card{transition:none!important}
        #playerHand.gostop-touch-browsing .hand-card-slot.is-hovered .hand-card{box-shadow:0 7px 10px rgba(0,0,0,.34)!important;will-change:transform}
      }
    `;
    (doc.head||doc.documentElement).appendChild(style);

    let touchState=null;
    let touchSelectedCardId=null;
    let visualSelectedSlot=null;
    let bypassClickCard=null;
    let suppressTouchClicksUntil=0;
    let pointerState=null;
    let suppressPointerClicksUntil=0;
    const pointerTouchSupported=typeof globalThis.PointerEvent==='function';
    const nativeTouchSupported=('ontouchstart' in globalThis)||Number(globalThis.navigator?.maxTouchPoints||0)>0;
    const usePointerTouch=pointerTouchSupported;

    const now=()=>globalThis.performance?.now?.()??Date.now();
    const requestFrame=globalThis.requestAnimationFrame?.bind(globalThis)||(callback=>setTimeout(callback,16));
    const cancelFrame=globalThis.cancelAnimationFrame?.bind(globalThis)||(id=>clearTimeout(id));
    const playerHand=()=>doc.getElementById('playerHand');
    const cardFromTarget=target=>target?.closest?.('#playerHand .hand-card');
    const cardIdentity=card=>String(card?.dataset?.cardId||card?.closest?.('.hand-card-slot')?.dataset?.handKey||'');
    const canUseCard=card=>!!card&&!card.disabled&&card.getAttribute('aria-disabled')!=='true';
    const allHandCards=()=>[...doc.querySelectorAll('#playerHand .hand-card')].filter(canUseCard);

    const snapshotHandGeometry=()=>{
      const hand=playerHand()?.getBoundingClientRect?.()||null;
      const cards=allHandCards().map(card=>{
        const rect=card.getBoundingClientRect();
        return {card,id:cardIdentity(card),centerX:rect.left+rect.width/2,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
      });
      return {top:hand?.top??-Infinity,bottom:hand?.bottom??Infinity,cards};
    };

    const cardByIdentity=id=>id?[...doc.querySelectorAll('#playerHand .hand-card')].find(card=>cardIdentity(card)===id)||null:null;

    const clearSelection=()=>{
      touchSelectedCardId=null;
      const hand=playerHand();
      hand?.classList.add('gostop-touch-selection-cleared');
      hand?.classList.remove('gostop-touch-browsing');
      if(visualSelectedSlot?.isConnected)visualSelectedSlot.classList.remove('is-hovered');
      visualSelectedSlot=null;
      doc.querySelectorAll('#playerHand .hand-card-slot.is-hovered').forEach(slot=>{
        slot.classList.remove('is-hovered');
        const card=slot.querySelector('.hand-card');
        if(card)card.title='';
      });
    };

    const selectCard=card=>{
      if(!canUseCard(card))return false;
      const slot=card.closest('.hand-card-slot');
      if(!slot)return false;
      touchSelectedCardId=cardIdentity(card);
      playerHand()?.classList.remove('gostop-touch-selection-cleared');
      if(visualSelectedSlot?.isConnected&&visualSelectedSlot!==slot)visualSelectedSlot.classList.remove('is-hovered');
      else if(!visualSelectedSlot?.isConnected){
        const stale=doc.querySelector('#playerHand .hand-card-slot.is-hovered');
        if(stale&&stale!==slot)stale.classList.remove('is-hovered');
      }
      slot.classList.add('is-hovered');
      visualSelectedSlot=slot;
      return true;
    };

    const nearestHandCard=(state,x,y)=>{
      const geometry=state?.handGeometry;
      if(!geometry||y<geometry.top-32||y>geometry.bottom+32)return null;
      let best=null,bestDistance=Infinity;
      for(const entry of geometry.cards){
        const live=cardByIdentity(entry.id)||entry.card;
        if(!canUseCard(live))continue;
        const distance=Math.abs(x-entry.centerX);
        if(distance<bestDistance){best=live;bestDistance=distance;}
      }
      return best;
    };

    const geometryRectFor=(state,card,raised=false)=>{
      const id=cardIdentity(card);
      const rect=state?.handGeometry?.cards?.find(entry=>entry.id===id)?.rect;
      if(rect)return {left:rect.left,top:rect.top-(raised?18:0),width:rect.width,height:rect.height};
      const measured=card?.getBoundingClientRect?.();
      return measured?{left:measured.left,top:measured.top,width:measured.width,height:measured.height}:{left:0,top:0,width:0,height:0};
    };

    const removeGhost=state=>{state?.ghost?.remove?.();if(state)state.ghost=null;};
    const restoreDraggedCard=state=>{
      if(!state)return;
      removeGhost(state);
      const card=cardByIdentity(state.cardId)||state.card;
      if(card){
        card.style.visibility=state.previousVisibility||'';
        card.style.transform=state.previousTransform||'';
        card.style.zIndex=state.previousZIndex||'';
      }
    };

    const pushSample=(state,x,y,time=now())=>{
      if(!state)return;
      if(!state.samples)state.samples=[];
      state.samples.push({x,y,t:time});
      const cutoff=time-360;
      while(state.samples.length>2&&state.samples[0].t<cutoff)state.samples.shift();
    };

    const markBrowsing=state=>{
      if(!state||state.browsing)return;
      state.browsing=true;
      playerHand()?.classList.add('gostop-touch-browsing');
    };

    const setActiveCard=(state,card)=>{
      if(!state||!canUseCard(card)||cardIdentity(card)===state.cardId)return;
      restoreDraggedCard(state);
      selectCard(card);
      state.card=card;
      state.cardId=cardIdentity(card);
      state.wasSelected=false;
      state.startRect=geometryRectFor(state,card,true);
      state.previousVisibility=card.style.visibility;
      state.previousTransform=card.style.transform;
      state.previousZIndex=card.style.zIndex;
      state.dragging=false;
      state.switched=true;
      markBrowsing(state);
    };

    const ensureGhost=state=>{
      if(!state||state.ghost)return state?.ghost||null;
      const card=cardByIdentity(state.cardId)||state.card;
      if(!canUseCard(card))return null;
      const ghost=card.cloneNode(true);
      ghost.removeAttribute('id');ghost.removeAttribute('disabled');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;
      ghost.classList.add('gostop-flick-ghost');
      ghost.style.left=`${state.startRect.left}px`;ghost.style.top=`${state.startRect.top}px`;
      ghost.style.width=`${state.startRect.width}px`;ghost.style.height=`${state.startRect.height}px`;
      ghost.style.transform='translate3d(0,0,0)';
      (doc.getElementById('cardMotionLayer')||doc.body).appendChild(ghost);
      state.ghost=ghost;card.style.visibility='hidden';
      return ghost;
    };

    const triggerPlay=cardOrId=>{
      const card=typeof cardOrId==='string'?cardByIdentity(cardOrId):cardOrId;
      if(!canUseCard(card))return false;
      const cardId=cardIdentity(card);
      touchSelectedCardId=null;
      playerHand()?.classList.remove('gostop-touch-browsing');
      const CustomEventCtor=globalThis.CustomEvent;
      if(typeof CustomEventCtor==='function'){
        const activation=new CustomEventCtor('gostop-hand-activate',{cancelable:true,detail:{cardId,blank:card.classList?.contains?.('blank-turn-card')===true}});
        const unhandled=doc.dispatchEvent(activation);
        if(!unhandled)return true;
      }
      bypassClickCard=card;
      try{card.click();}finally{bypassClickCard=null;}
      return true;
    };

    const classifyMove=(state,x,y)=>{
      const dx=x-state.anchorX,dy=y-state.anchorY,up=-dy,sideways=Math.abs(dx);
      if(!state.intent){
        if(sideways>=16&&sideways>Math.max(12,Math.abs(up)*1.20)){state.intent='browse';markBrowsing(state);}
        else if(up>=12&&up>=sideways*.72){state.intent='flick';state.dragging=true;state.wasSelected=false;}
      }
      if(state.intent==='browse'){
        const hovered=nearestHandCard(state,x,y);
        if(hovered)setActiveCard(state,hovered);
        return;
      }
      if(state.intent==='flick'){
        const ghost=ensureGhost(state);
        if(ghost)ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
      }
    };

    const finishGesture=(state,endX,endY,endTime,event)=>{
      if(!state)return;
      const dx=endX-state.anchorX,dy=endY-state.anchorY;
      const browsed=state.intent==='browse'||state.browsing||state.switched;
      const flick=!browsed&&isUpwardFlick({startX:state.anchorX,startY:state.anchorY,endX,endY,duration:Math.max(1,endTime-state.anchorTime)});
      const tap=!browsed&&Math.abs(dx)<=18&&Math.abs(dy)<=18&&endTime-state.anchorTime<=650;
      const cardId=state.cardId;
      restoreDraggedCard(state);
      playerHand()?.classList.remove('gostop-touch-browsing');
      event?.preventDefault?.();event?.stopPropagation?.();

      if(flick){triggerPlay(cardId);return;}
      if(browsed){const live=cardByIdentity(cardId);if(live)selectCard(live);return;}
      if(tap&&state.wasSelected){triggerPlay(cardId);return;}
      if(tap){const live=cardByIdentity(cardId);if(live)selectCard(live);return;}
      clearSelection();
    };

    const beginPointerTouch=event=>{
      if(event.pointerType!=='touch'||!event.isPrimary)return false;
      const card=cardFromTarget(event.target);
      if(!canUseCard(card))return false;
      const t=now(),id=cardIdentity(card),handGeometry=snapshotHandGeometry();
      pointerState={
        id:event.pointerId,kind:'touch',card,cardId:id,wasSelected:!!id&&touchSelectedCardId===id,
        anchorX:event.clientX,anchorY:event.clientY,anchorTime:t,lastX:event.clientX,lastY:event.clientY,
        intent:null,browsing:false,switched:false,dragging:false,handGeometry,
        startRect:geometryRectFor({handGeometry},card,!!id&&touchSelectedCardId!==id),
        previousVisibility:card.style.visibility,previousTransform:card.style.transform,previousZIndex:card.style.zIndex,ghost:null
      };
      selectCard(card);
      suppressPointerClicksUntil=Date.now()+1000;
      try{card.setPointerCapture?.(event.pointerId);}catch(_){}
      event.preventDefault();
      return true;
    };

    doc.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'){
        if(usePointerTouch)beginPointerTouch(event);
        return;
      }
      if(event.button!==0)return;
      const card=cardFromTarget(event.target);if(!canUseCard(card))return;
      const t=now();pointerState={id:event.pointerId,kind:'mouse',card,cardId:cardIdentity(card),anchorX:event.clientX,anchorY:event.clientY,anchorTime:t,lastX:event.clientX,lastY:event.clientY,intent:null,browsing:false,switched:false,handGeometry:snapshotHandGeometry()};
    },{capture:true,passive:false});

    doc.addEventListener('pointermove',event=>{
      const state=pointerState;if(!state||event.pointerId!==state.id)return;
      state.lastX=event.clientX;state.lastY=event.clientY;
      if(state.kind==='touch'){
        classifyMove(state,event.clientX,event.clientY);
        if(state.intent)event.preventDefault();
        return;
      }
      const sample={startX:state.anchorX,startY:state.anchorY,endX:event.clientX,endY:event.clientY,duration:Math.max(1,now()-state.anchorTime)};
      if(!isUpwardFlick(sample))return;
      pointerState=null;suppressPointerClicksUntil=Date.now()+900;event.preventDefault();event.stopPropagation();triggerPlay(state.cardId);
    },{capture:true,passive:false});

    doc.addEventListener('pointerup',event=>{
      const state=pointerState;if(!state||event.pointerId!==state.id)return;
      pointerState=null;
      if(state.kind==='touch'){
        suppressPointerClicksUntil=Date.now()+1000;
        finishGesture(state,event.clientX,event.clientY,now(),event);
      }
    },{capture:true,passive:false});
    doc.addEventListener('pointercancel',event=>{
      const state=pointerState;if(!state||event.pointerId!==state.id)return;
      pointerState=null;restoreDraggedCard(state);playerHand()?.classList.remove('gostop-touch-browsing');
    },{capture:true,passive:false});

    // Pointer Events are the primary touch path when the browser supports them.
    // Running TouchEvents and PointerEvents together can double-own the same gesture
    // and suppress the second tap/flick on lower-end Android devices.
    if(!usePointerTouch&&nativeTouchSupported){
      const touchById=(list,id)=>Array.from(list||[]).find(touch=>touch.identifier===id)||null;
      doc.addEventListener('touchstart',event=>{
        if(event.touches.length!==1)return;
        const card=cardFromTarget(event.target);
        if(!card){if(touchSelectedCardId&&!event.target?.closest?.('#playerHand'))clearSelection();return;}
        if(!canUseCard(card))return;
        const touch=event.touches[0],t=now(),id=cardIdentity(card),handGeometry=snapshotHandGeometry();
        touchState={id:touch.identifier,card,cardId:id,wasSelected:!!id&&touchSelectedCardId===id,anchorX:touch.clientX,anchorY:touch.clientY,anchorTime:t,lastX:touch.clientX,lastY:touch.clientY,intent:null,browsing:false,switched:false,dragging:false,handGeometry,startRect:geometryRectFor({handGeometry},card,!!id&&touchSelectedCardId!==id),previousVisibility:card.style.visibility,previousTransform:card.style.transform,previousZIndex:card.style.zIndex,ghost:null};
        selectCard(card);suppressTouchClicksUntil=Date.now()+1000;event.preventDefault();
      },{capture:true,passive:false});
      doc.addEventListener('touchmove',event=>{
        if(!touchState)return;const touch=touchById(event.touches,touchState.id);if(!touch)return;
        touchState.lastX=touch.clientX;touchState.lastY=touch.clientY;classifyMove(touchState,touch.clientX,touch.clientY);if(touchState.intent)event.preventDefault();
      },{capture:true,passive:false});
      doc.addEventListener('touchend',event=>{
        if(!touchState)return;const state=touchState;touchState=null;const touch=touchById(event.changedTouches,state.id);if(!touch)return;
        suppressTouchClicksUntil=Date.now()+1000;finishGesture(state,touch.clientX,touch.clientY,now(),event);
      },{capture:true,passive:false});
      doc.addEventListener('touchcancel',event=>{if(!touchState)return;const state=touchState;touchState=null;restoreDraggedCard(state);clearSelection();event.preventDefault();},{capture:true,passive:false});
    }

    doc.addEventListener('click',event=>{
      const card=cardFromTarget(event.target);
      if(!card)return;
      if(card===bypassClickCard)return;
      if(Date.now()<suppressTouchClicksUntil||Date.now()<suppressPointerClicksUntil){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);

    const isGameSurface=target=>!!target?.closest?.('#appShell,#scoreDialog,#captureDialog,#resultDialog');
    doc.addEventListener('contextmenu',event=>{
      if(isGameSurface(event.target))event.preventDefault();
    },{capture:true});

    const scoreDialog=doc.getElementById('scoreDialog');
    if(scoreDialog){
      let dismissPointer=null;
      scoreDialog.addEventListener('pointerdown',event=>{
        if(!scoreDialog.open)return;
        dismissPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
      });
      scoreDialog.addEventListener('pointerup',event=>{
        if(!scoreDialog.open||!dismissPointer||dismissPointer.id!==event.pointerId)return;
        const distance=Math.hypot(event.clientX-dismissPointer.x,event.clientY-dismissPointer.y);
        dismissPointer=null;
        if(distance<10)scoreDialog.close();
      });
      scoreDialog.addEventListener('pointercancel',()=>{dismissPointer=null;});
    }

    const captureDialog=doc.getElementById('captureDialog');
    if(captureDialog){
      captureDialog.addEventListener('click',()=>{
        if(captureDialog.open)captureDialog.close();
      });
    }

    return true;
  }

  function pendingOnlineStageIds(state={}){
    return [state?.pendingTurn?.played?.card?.id,state?.pendingTurn?.drawn?.card?.id].filter(Boolean);
  }

  function planOnlinePresentation(events,initialStages={},context={}){
    const stages=new Map(Object.entries(initialStages)),steps=[];
    for(const event of events){
      const ids=event.cardIds||event.cards?.map(card=>card.id)||[];
      if(event.type==='cardPlayed'){
        if(!stages.has(event.card.id)){steps.push({kind:event.targetId||event.matchCount===0?'handSlap':'handStage',cardId:event.card.id,targetCardId:event.targetId,event});stages.set(event.card.id,event.targetId||event.matchCount===0?'landed':'waitingTarget');}
      }else if(event.type==='deckCardRevealed'){
        if(!stages.has(event.card.id)){steps.push({kind:'deckFlip',cardId:event.card.id,event});stages.set(event.card.id,'waitingTarget');}
        const sameMonth=context.pendingPlayedCard?.month===event.card.month?context.pendingPlayedCard.id:null;
        const targetCardId=context.sameMonthSpecial&&sameMonth?sameMonth:(event.targetId||sameMonth);
        if((targetCardId||event.matchCount===0)&&stages.get(event.card.id)==='waitingTarget'){steps.push({kind:'stageSlap',cardId:event.card.id,targetCardId,event});stages.set(event.card.id,'landed');}
      }else if(event.type==='floorTargetChosen'){
        const entry=[...stages].find(([,status])=>status==='waitingTarget');if(entry){steps.push({kind:'stageSlap',cardId:entry[0],targetCardId:event.targetId,event});stages.set(entry[0],'landed');}
      }else if(event.type==='bombDeclared')steps.push({kind:'rememberBomb',event});
      else if(event.type==='bombCardsPlayed')steps.push({kind:'bombSlap',cardIds:ids,event});
      else if(event.type==='cardsCaptured'){steps.push({kind:'capture',cardIds:ids,event});ids.forEach(id=>stages.delete(id));}
      else if(event.type==='cardLanded'){const id=event.card?.id||event.cardId;steps.push({kind:'landedCleanup',cardId:id,event});stages.delete(id);}
      else if(['piTransferred','shakeDeclared','ppeokFormed','firstPpeokAwarded','sweepTriggered','goDeclared','chongtongDeclared','threePpeokDeclared','nagariDeclared','handEnded','turnCompleted','newHandCreated'].includes(event.type))steps.push({kind:'semantic',event});
    }
    return {steps,stages:Object.fromEntries(stages)};
  }

  const api=Object.freeze({planOnlinePresentation,pendingOnlineStageIds,isUpwardFlick,installHandFlickGestures,FLICK_DEFAULTS});
  globalThis.GoStopPresentationPlan=api;
  if(typeof document!=='undefined')installHandFlickGestures(document);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
