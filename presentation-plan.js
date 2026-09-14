(() => {
  'use strict';

  const FLICK_DEFAULTS=Object.freeze({
    minUpwardDistance:18,
    minTravelDistance:42,
    maxDuration:320,
    minSpeed:.20,
    maxHorizontalRatio:4
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
      .gostop-flick-ghost{position:fixed!important;margin:0!important;pointer-events:none!important;z-index:2147483000!important;transition:none!important;filter:none!important;contain:paint;isolation:isolate;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform}
      .physical-card,.physical-card.moving-card,.physical-card.deck-draw-card,.capture-flight-card,.sliding-capture{z-index:2147482000!important;isolation:isolate;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:flat}
      .physical-card.moving-card,.capture-flight-card,.sliding-capture{contain:paint}
      @media (hover:none),(pointer:coarse){
        #playerHand .hand-card:hover{transform:none!important}
        #playerHand .hand-card-slot.is-hovered{z-index:40!important}
        #playerHand .hand-card-slot.is-hovered .hand-card{transform:translate3d(0,-18px,0) rotate(-1deg)!important;box-shadow:0 12px 18px rgba(0,0,0,.38)!important}
        #playerHand.gostop-touch-selection-cleared .hand-card-slot.is-hovered{z-index:auto!important}
        #playerHand.gostop-touch-selection-cleared .hand-card-slot.is-hovered .hand-card{transform:none!important;box-shadow:0 7px 10px rgba(0,0,0,.34)!important}
      }
    `;
    (doc.head||doc.documentElement).appendChild(style);

    let touchState=null;
    let bypassClickCard=null;
    let suppressTouchClicksUntil=0;

    const now=()=>globalThis.performance?.now?.()??Date.now();
    const playerHand=()=>doc.getElementById('playerHand');
    const cardFromTarget=target=>target?.closest?.('#playerHand .hand-card');
    const canUseCard=card=>!!card&&!card.disabled&&card.getAttribute('aria-disabled')!=='true';
    const allHandCards=()=>[...doc.querySelectorAll('#playerHand .hand-card')].filter(canUseCard);
    const handRect=()=>playerHand()?.getBoundingClientRect?.()||null;

    const clearSelection=()=>{
      playerHand()?.classList.add('gostop-touch-selection-cleared');
      doc.querySelectorAll('#playerHand .hand-card-slot').forEach(slot=>{
        slot.classList.remove('is-hovered');
        const card=slot.querySelector('.hand-card');
        if(card)card.title='';
      });
    };

    const selectCard=card=>{
      if(!canUseCard(card))return false;
      const slot=card.closest('.hand-card-slot');
      if(!slot)return false;
      playerHand()?.classList.remove('gostop-touch-selection-cleared');
      try{slot.dispatchEvent(new Event('pointerenter'));}catch(_){ }
      doc.querySelectorAll('#playerHand .hand-card-slot').forEach(node=>node.classList.toggle('is-hovered',node===slot));
      return true;
    };

    const nearestHandCard=(x,y)=>{
      const hand=handRect();
      if(!hand||y<hand.top-28||y>hand.bottom+24)return null;
      const cards=allHandCards();
      let best=null,bestDistance=Infinity;
      for(const card of cards){
        const rect=card.getBoundingClientRect();
        const centerX=rect.left+rect.width/2;
        const distance=Math.abs(x-centerX);
        if(distance<bestDistance){best=card;bestDistance=distance;}
      }
      return best;
    };

    const removeGhost=state=>{
      state?.ghost?.remove?.();
      if(state)state.ghost=null;
    };

    const restoreDraggedCard=state=>{
      if(!state)return;
      removeGhost(state);
      if(state.card){
        state.card.style.visibility=state.previousVisibility;
        state.card.style.transform=state.previousTransform;
        state.card.style.zIndex=state.previousZIndex;
      }
    };

    const pushSample=(state,x,y,time=now())=>{
      if(!state)return;
      if(!state.samples)state.samples=[];
      state.samples.push({x,y,t:time});
      const cutoff=time-240;
      while(state.samples.length>2&&state.samples[0].t<cutoff)state.samples.shift();
    };

    const recentFlickSample=(state,endX,endY,endTime=now())=>{
      const points=[...(state.samples||[]),{x:endX,y:endY,t:endTime}].filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.t));
      if(!points.length)return null;
      const cutoff=endTime-180;
      const recent=points.filter(point=>point.t>=cutoff);
      const start=(recent.length>=2?recent[0]:points[0])||points[0];
      return {startX:start.x,startY:start.y,endX,endY,duration:Math.max(1,endTime-start.t)};
    };

    const setActiveCard=(state,card,x,y)=>{
      if(!state||!canUseCard(card)||card===state.card)return;
      restoreDraggedCard(state);
      selectCard(card);
      const rect=card.getBoundingClientRect();
      state.card=card;
      state.wasSelected=false;
      state.anchorX=x;
      state.anchorY=y;
      state.anchorTime=now();
      state.startRect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
      state.previousVisibility=card.style.visibility;
      state.previousTransform=card.style.transform;
      state.previousZIndex=card.style.zIndex;
      state.dragging=false;
      state.switched=true;
      state.browsing=true;
      state.samples=[];
      pushSample(state,x,y,state.anchorTime);
    };

    const ensureGhost=state=>{
      if(!state||state.ghost)return state?.ghost||null;
      const ghost=state.card.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.removeAttribute('disabled');
      ghost.setAttribute('aria-hidden','true');
      ghost.tabIndex=-1;
      ghost.classList.add('gostop-flick-ghost');
      ghost.style.left=`${state.startRect.left}px`;
      ghost.style.top=`${state.startRect.top}px`;
      ghost.style.width=`${state.startRect.width}px`;
      ghost.style.height=`${state.startRect.height}px`;
      ghost.style.transform='translate3d(0,0,0)';
      doc.body.appendChild(ghost);
      state.ghost=ghost;
      state.card.style.visibility='hidden';
      return ghost;
    };

    const beginTouch=(event,touch,card)=>{
      if(!canUseCard(card))return false;
      const slot=card.closest('.hand-card-slot');
      const wasSelected=!!slot?.classList.contains('is-hovered')&&!playerHand()?.classList.contains('gostop-touch-selection-cleared');
      selectCard(card);
      const rect=card.getBoundingClientRect();
      const startTime=now();
      touchState={
        id:touch.identifier,
        card,
        wasSelected,
        switched:false,
        browsing:false,
        dragging:false,
        anchorX:touch.clientX,
        anchorY:touch.clientY,
        anchorTime:startTime,
        lastX:touch.clientX,
        lastY:touch.clientY,
        startRect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
        previousVisibility:card.style.visibility,
        previousTransform:card.style.transform,
        previousZIndex:card.style.zIndex,
        ghost:null,
        samples:[]
      };
      pushSample(touchState,touch.clientX,touch.clientY,startTime);
      suppressTouchClicksUntil=Date.now()+900;
      event.preventDefault();
      return true;
    };

    const moveTouch=(event,touch)=>{
      const state=touchState;
      if(!state)return;
      const time=now();
      state.lastX=touch.clientX;
      state.lastY=touch.clientY;
      pushSample(state,touch.clientX,touch.clientY,time);

      const up=state.anchorY-touch.clientY;
      const sideways=Math.abs(touch.clientX-state.anchorX);
      const radialIntent=up>=14&&(up>=sideways*.28||touch.clientY<state.startRect.top-8);

      if(!state.dragging&&!radialIntent){
        if(sideways>=10)state.browsing=true;
        const hovered=nearestHandCard(touch.clientX,touch.clientY);
        if(hovered&&hovered!==state.card){
          setActiveCard(state,hovered,touch.clientX,touch.clientY);
          event.preventDefault();
          return;
        }
      }

      if(!state.dragging&&radialIntent){
        state.dragging=true;
        state.wasSelected=false;
      }

      if(state.dragging){
        const ghost=ensureGhost(state);
        if(ghost){
          const dx=touch.clientX-state.anchorX;
          const dy=touch.clientY-state.anchorY;
          ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
        }
      }
      event.preventDefault();
    };

    const triggerPlay=card=>{
      if(!canUseCard(card))return false;
      bypassClickCard=card;
      try{card.click();}finally{bypassClickCard=null;}
      return true;
    };

    const finishTouch=(event,touch)=>{
      const state=touchState;
      if(!state)return;
      const endX=touch?.clientX??state.lastX;
      const endY=touch?.clientY??state.lastY;
      const endTime=now();
      pushSample(state,endX,endY,endTime);
      const flickSample=recentFlickSample(state,endX,endY,endTime);
      const flick=state.dragging&&isUpwardFlick(flickSample);
      const card=state.card;
      const secondTap=!state.dragging&&!state.browsing&&!state.switched&&state.wasSelected&&Math.abs(endX-state.anchorX)<8&&Math.abs(endY-state.anchorY)<8;
      const browsed=state.browsing||state.switched;

      restoreDraggedCard(state);
      touchState=null;
      event.preventDefault();
      event.stopPropagation();

      if(flick){
        triggerPlay(card);
      }else if(browsed){
        clearSelection();
      }else if(secondTap){
        triggerPlay(card);
      }else{
        selectCard(card);
      }
    };

    const cancelTouch=event=>{
      if(!touchState)return;
      const state=touchState;
      const card=state.card;
      const browsed=state.browsing||state.switched;
      restoreDraggedCard(state);
      touchState=null;
      event?.preventDefault?.();
      if(browsed)clearSelection();else selectCard(card);
    };

    const touchById=(list,id)=>Array.from(list||[]).find(touch=>touch.identifier===id)||null;

    doc.addEventListener('touchstart',event=>{
      if(event.touches.length!==1)return;
      const touch=event.touches[0];
      const card=cardFromTarget(event.target);
      beginTouch(event,touch,card);
    },{capture:true,passive:false});

    doc.addEventListener('touchmove',event=>{
      if(!touchState)return;
      const touch=touchById(event.touches,touchState.id);
      if(!touch){cancelTouch(event);return;}
      moveTouch(event,touch);
    },{capture:true,passive:false});

    doc.addEventListener('touchend',event=>{
      if(!touchState)return;
      const touch=touchById(event.changedTouches,touchState.id);
      finishTouch(event,touch);
    },{capture:true,passive:false});

    doc.addEventListener('touchcancel',event=>cancelTouch(event),{capture:true,passive:false});

    doc.addEventListener('click',event=>{
      const card=cardFromTarget(event.target);
      if(!card)return;
      if(card===bypassClickCard)return;
      if(Date.now()<suppressTouchClicksUntil){
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },true);

    return true;
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

  const api=Object.freeze({planOnlinePresentation,isUpwardFlick,installHandFlickGestures,FLICK_DEFAULTS});
  globalThis.GoStopPresentationPlan=api;
  if(typeof document!=='undefined')installHandFlickGestures(document);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
