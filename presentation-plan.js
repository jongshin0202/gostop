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
      #playerHand,#playerHand .hand-card{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
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
        #playerHand.gostop-touch-browsing .hand-card{transition:none!important}
      }
    `;
    (doc.head||doc.documentElement).appendChild(style);

    let touchState=null;
    let pointerState=null;
    let selectedCardId=null;
    let visualSelectedSlot=null;
    let bypassClickCard=null;
    let suppressGeneratedClickUntil=0;
    let suppressGeneratedClickCardId='';
    const nativeTouchSupported=('ontouchstart' in globalThis)||Number(globalThis.navigator?.maxTouchPoints||0)>0;
    const pointerTouchSupported=!nativeTouchSupported&&typeof globalThis.PointerEvent==='function';
    const now=()=>globalThis.performance?.now?.()??Date.now();
    const playerHand=()=>doc.getElementById('playerHand');
    const cardFromTarget=target=>target?.closest?.('#playerHand .hand-card');
    const cardIdentity=card=>String(card?.dataset?.cardId||card?.closest?.('.hand-card-slot')?.dataset?.handKey||'');
    const canUseCard=card=>!!card&&!card.disabled&&card.getAttribute?.('aria-disabled')!=='true';
    const cardByIdentity=id=>id?[...doc.querySelectorAll('#playerHand .hand-card')].find(card=>cardIdentity(card)===id)||null:null;

    const clearVisual=()=>{
      if(visualSelectedSlot?.isConnected)visualSelectedSlot.classList.remove('is-hovered');
      visualSelectedSlot=null;
      doc.querySelectorAll('#playerHand .hand-card-slot.is-hovered').forEach(slot=>slot.classList.remove('is-hovered'));
    };
    const showVisual=card=>{
      if(!canUseCard(card))return false;
      const slot=card.closest?.('.hand-card-slot');if(!slot)return false;
      if(visualSelectedSlot?.isConnected&&visualSelectedSlot!==slot)visualSelectedSlot.classList.remove('is-hovered');
      slot.classList.add('is-hovered');visualSelectedSlot=slot;return true;
    };
    const clearSelection=()=>{
      selectedCardId=null;
      playerHand()?.classList.remove('gostop-touch-browsing');
      clearVisual();
    };
    const commitSelection=card=>{
      if(!canUseCard(card))return false;
      selectedCardId=cardIdentity(card);showVisual(card);return true;
    };
    const suppressNextClick=(cardId,ms=140)=>{
      suppressGeneratedClickCardId=String(cardId||'');
      suppressGeneratedClickUntil=Date.now()+Math.max(80,Number(ms)||140);
    };
    const clearPreviousClickSuppression=()=>{
      suppressGeneratedClickUntil=0;
      suppressGeneratedClickCardId='';
    };
    const triggerPlay=cardOrId=>{
      const card=typeof cardOrId==='string'?cardByIdentity(cardOrId):cardOrId;
      if(!canUseCard(card))return false;
      const cardId=cardIdentity(card);
      selectedCardId=null;clearVisual();
      const EventCtor=globalThis.CustomEvent;
      if(typeof EventCtor==='function'){
        doc.dispatchEvent(new EventCtor('gostop-hand-activate',{detail:{cardId,blank:card.classList?.contains?.('blank-turn-card')===true}}));
      }else{
        bypassClickCard=card;
        try{card.click();}finally{bypassClickCard=null;}
      }
      return true;
    };

    const snapshotHandGeometry=()=>{
      const hand=playerHand()?.getBoundingClientRect?.()||null;
      const cards=[...doc.querySelectorAll('#playerHand .hand-card')].filter(canUseCard).map(card=>{
        const rect=card.getBoundingClientRect();
        return {id:cardIdentity(card),centerX:rect.left+rect.width/2,card};
      });
      return {top:hand?.top??-Infinity,bottom:hand?.bottom??Infinity,cards};
    };
    const nearestHandCard=(state,x,y)=>{
      const geometry=state?.geometry;
      if(!geometry||y<geometry.top-36||y>geometry.bottom+36)return null;
      let best=null,bestDistance=Infinity;
      for(const entry of geometry.cards){
        const live=cardByIdentity(entry.id)||entry.card;
        if(!canUseCard(live))continue;
        const distance=Math.abs(x-entry.centerX);
        if(distance<bestDistance){best=live;bestDistance=distance;}
      }
      return best;
    };
    const makeGhost=(state)=>{
      if(state.ghost)return state.ghost;
      const card=cardByIdentity(state.cardId)||state.card;
      if(!canUseCard(card))return null;
      const rect=card.getBoundingClientRect();
      const ghost=card.cloneNode(true);ghost.removeAttribute('disabled');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('gostop-flick-ghost');
      ghost.style.left=`${rect.left}px`;ghost.style.top=`${rect.top}px`;ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;
      (doc.getElementById('cardMotionLayer')||doc.body).appendChild(ghost);
      state.ghost=ghost;state.hiddenCard=card;state.previousVisibility=card.style.visibility;card.style.visibility='hidden';
      return ghost;
    };
    const restoreGhost=(state)=>{
      state?.ghost?.remove?.();
      if(state?.hiddenCard?.isConnected)state.hiddenCard.style.visibility=state.previousVisibility||'';
      if(state){state.ghost=null;state.hiddenCard=null;}
    };
    const resetGestureState=()=>{
      if(touchState)restoreGhost(touchState);
      if(pointerState)restoreGhost(pointerState);
      touchState=null;pointerState=null;playerHand()?.classList.remove('gostop-touch-browsing');clearSelection();
    };
    doc.addEventListener('gostop-hand-reset',resetGestureState);

    if(pointerTouchSupported){
      const touchPointer=event=>event.pointerType==='touch'||event.pointerType==='pen';
      doc.addEventListener('pointerdown',event=>{
        if(!touchPointer(event)||pointerState)return;
        const card=cardFromTarget(event.target);
        if(!card){
          if(selectedCardId&&!event.target?.closest?.('#playerHand'))clearSelection();
          return;
        }
        if(!canUseCard(card))return;
        clearPreviousClickSuppression();
        const id=cardIdentity(card);
        pointerState={
          id:event.pointerId,card,cardId:id,wasSelected:selectedCardId===id,
          startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,startTime:now(),
          intent:null,geometry:snapshotHandGeometry(),ghost:null,hiddenCard:null,previousVisibility:''
        };
        showVisual(card);
        try{card.setPointerCapture?.(event.pointerId);}catch(_){}
        event.preventDefault();
      },{capture:true,passive:false});

      doc.addEventListener('pointermove',event=>{
        const state=pointerState;if(!state||event.pointerId!==state.id||!touchPointer(event))return;
        state.lastX=event.clientX;state.lastY=event.clientY;
        const dx=event.clientX-state.startX,dy=event.clientY-state.startY,up=-dy,sideways=Math.abs(dx);
        if(!state.intent){
          if(sideways>=10&&sideways>Math.max(8,Math.abs(up)*1.10))state.intent='browse';
          else if(up>=8&&up>sideways*.9)state.intent='flick';
        }
        if(state.intent==='browse'){
          playerHand()?.classList.add('gostop-touch-browsing');
          const hovered=nearestHandCard(state,event.clientX,event.clientY);
          if(hovered){state.card=hovered;state.cardId=cardIdentity(hovered);showVisual(hovered);}
          event.preventDefault();return;
        }
        if(state.intent==='flick'){
          const ghost=makeGhost(state);
          if(ghost)ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
          event.preventDefault();
        }
      },{capture:true,passive:false});

      doc.addEventListener('pointerup',event=>{
        const state=pointerState;if(!state||event.pointerId!==state.id||!touchPointer(event))return;
        pointerState=null;
        const endTime=now(),dx=event.clientX-state.startX,dy=event.clientY-state.startY;
        const flick=state.intent!=='browse'&&isUpwardFlick(
          {startX:state.startX,startY:state.startY,endX:event.clientX,endY:event.clientY,duration:Math.max(1,endTime-state.startTime)},
          {minUpwardDistance:8,minTravelDistance:18,maxDuration:900,minSpeed:.025,maxHorizontalRatio:1.15}
        );
        const browsed=state.intent==='browse';
        restoreGhost(state);playerHand()?.classList.remove('gostop-touch-browsing');
        event.preventDefault();event.stopPropagation();suppressNextClick(state.cardId,420);
        if(flick){clearSelection();triggerPlay(state.cardId);return;}
        if(browsed){clearSelection();return;}
        const tap=Math.abs(dx)<=28&&Math.abs(dy)<=28&&endTime-state.startTime<=1000;
        if(!tap){clearSelection();return;}
        const live=cardByIdentity(state.cardId)||state.card;
        if(state.wasSelected){clearSelection();triggerPlay(state.cardId);}
        else commitSelection(live);
      },{capture:true,passive:false});

      doc.addEventListener('pointercancel',event=>{
        if(!pointerState||event.pointerId!==pointerState.id)return;
        const state=pointerState;pointerState=null;restoreGhost(state);clearSelection();event.preventDefault();
      },{capture:true,passive:false});
    }

    if(nativeTouchSupported){
      const touchById=(list,id)=>Array.from(list||[]).find(touch=>touch.identifier===id)||null;
      doc.addEventListener('touchstart',event=>{
        if(event.touches.length!==1)return;
        const card=cardFromTarget(event.target);
        if(!card){
          if(selectedCardId&&!event.target?.closest?.('#playerHand'))clearSelection();
          return;
        }
        if(!canUseCard(card))return;
        clearPreviousClickSuppression();
        const touch=event.touches[0],id=cardIdentity(card);
        touchState={
          id:touch.identifier,card,cardId:id,wasSelected:selectedCardId===id,
          startX:touch.clientX,startY:touch.clientY,lastX:touch.clientX,lastY:touch.clientY,startTime:now(),
          intent:null,geometry:snapshotHandGeometry(),ghost:null,hiddenCard:null,previousVisibility:''
        };
        showVisual(card);
      },{capture:true,passive:true});

      doc.addEventListener('touchmove',event=>{
        const state=touchState;if(!state)return;
        const touch=touchById(event.touches,state.id);if(!touch)return;
        state.lastX=touch.clientX;state.lastY=touch.clientY;
        const dx=touch.clientX-state.startX,dy=touch.clientY-state.startY,up=-dy,sideways=Math.abs(dx);
        if(!state.intent){
          if(sideways>=10&&sideways>Math.max(8,Math.abs(up)*1.10))state.intent='browse';
          else if(up>=10&&up>sideways*1.05)state.intent='flick';
        }
        if(state.intent==='browse'){
          playerHand()?.classList.add('gostop-touch-browsing');
          const hovered=nearestHandCard(state,touch.clientX,touch.clientY);
          if(hovered){state.card=hovered;state.cardId=cardIdentity(hovered);showVisual(hovered);}
          event.preventDefault();
          return;
        }
        if(state.intent==='flick'){
          const ghost=makeGhost(state);
          if(ghost)ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
          event.preventDefault();
        }
      },{capture:true,passive:false});

      doc.addEventListener('touchend',event=>{
        const state=touchState;if(!state)return;
        const touch=touchById(event.changedTouches,state.id);touchState=null;
        if(!touch){restoreGhost(state);clearSelection();return;}
        const endTime=now(),dx=touch.clientX-state.startX,dy=touch.clientY-state.startY;
        const flick=state.intent!=='browse'&&isUpwardFlick(
          {startX:state.startX,startY:state.startY,endX:touch.clientX,endY:touch.clientY,duration:Math.max(1,endTime-state.startTime)},
          {minUpwardDistance:8,minTravelDistance:16,maxDuration:900,minSpeed:.02,maxHorizontalRatio:1.15}
        );
        const browsed=state.intent==='browse';
        restoreGhost(state);playerHand()?.classList.remove('gostop-touch-browsing');
        if(flick){
          event.preventDefault();event.stopPropagation();suppressNextClick(state.cardId);clearSelection();triggerPlay(state.cardId);return;
        }
        if(browsed){
          event.preventDefault();event.stopPropagation();suppressNextClick(state.cardId);clearSelection();return;
        }
        const tap=Math.abs(dx)<=28&&Math.abs(dy)<=28&&endTime-state.startTime<=1000;
        if(!tap){clearSelection();return;}
        event.preventDefault();event.stopPropagation();suppressNextClick(state.cardId);
        const live=cardByIdentity(state.cardId)||state.card;
        if(state.wasSelected){clearSelection();triggerPlay(state.cardId);}
        else commitSelection(live);
      },{capture:true,passive:false});

      doc.addEventListener('touchcancel',event=>{
        if(!touchState)return;const state=touchState;touchState=null;restoreGhost(state);clearSelection();event.preventDefault();
      },{capture:true,passive:false});
    }

    doc.addEventListener('click',event=>{
      const card=cardFromTarget(event.target);if(!card)return;
      if(card===bypassClickCard)return;
      const id=cardIdentity(card);
      if(Date.now()<suppressGeneratedClickUntil&&(!suppressGeneratedClickCardId||suppressGeneratedClickCardId===id)){
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      if(!nativeTouchSupported)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(selectedCardId===id){clearSelection();triggerPlay(card);}
      else commitSelection(card);
    },true);

    doc.addEventListener('pointermove',event=>{
      if(event.pointerType!=='mouse'||event.buttons!==1)return;
      const card=cardFromTarget(event.target);if(!canUseCard(card))return;
      const state={startX:event.clientX,startY:event.clientY,endX:event.clientX,endY:event.clientY,duration:1};
      if(isUpwardFlick(state)){triggerPlay(card);}
    },{capture:true,passive:true});

    const isGameSurface=target=>!!target?.closest?.('#appShell,#scoreDialog,#captureDialog,#resultDialog');
    doc.addEventListener('contextmenu',event=>{if(isGameSurface(event.target))event.preventDefault();},{capture:true});

    const scoreDialog=doc.getElementById('scoreDialog');
    if(scoreDialog){
      let dismissPointer=null;
      scoreDialog.addEventListener('pointerdown',event=>{if(scoreDialog.open)dismissPointer={id:event.pointerId,x:event.clientX,y:event.clientY};});
      scoreDialog.addEventListener('pointerup',event=>{
        if(!scoreDialog.open||!dismissPointer||dismissPointer.id!==event.pointerId)return;
        const distance=Math.hypot(event.clientX-dismissPointer.x,event.clientY-dismissPointer.y);dismissPointer=null;if(distance<10)scoreDialog.close();
      });
      scoreDialog.addEventListener('pointercancel',()=>{dismissPointer=null;});
    }
    const captureDialog=doc.getElementById('captureDialog');
    if(captureDialog)captureDialog.addEventListener('click',()=>{if(captureDialog.open)captureDialog.close();});
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
