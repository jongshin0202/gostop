(() => {
  'use strict';

  const FLICK_DEFAULTS=Object.freeze({minDistance:38,maxDuration:420,minSpeed:.16,maxHorizontalRatio:1.2});

  function isUpwardFlick(sample,options={}){
    if(!sample)return false;
    const config={...FLICK_DEFAULTS,...options};
    const startX=Number(sample.startX),startY=Number(sample.startY),endX=Number(sample.endX),endY=Number(sample.endY),duration=Math.max(1,Number(sample.duration)||1);
    if(![startX,startY,endX,endY].every(Number.isFinite))return false;
    const dx=endX-startX,up=startY-endY;
    if(up<config.minDistance||duration>config.maxDuration)return false;
    if(up/duration<config.minSpeed)return false;
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
      @media (hover:none),(pointer:coarse){#playerHand .hand-card:hover{transform:none!important}}
    `;
    (doc.head||doc.documentElement).appendChild(style);

    let gesture=null;
    let suppressCard=null;
    let suppressUntil=0;

    const cardFromTarget=target=>target?.closest?.('#playerHand .hand-card');
    const canStart=card=>!!card&&!card.disabled&&card.getAttribute('aria-disabled')!=='true';
    const begin=(card,x,y,time,source,id)=>{
      if(!canStart(card))return false;
      restore();
      const rect=card.getBoundingClientRect();
      gesture={source,id,card,startX:x,startY:y,lastX:x,lastY:y,startTime:time||performance.now(),startRect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},ghost:null,previousVisibility:card.style.visibility,previousTransform:card.style.transform,previousZIndex:card.style.zIndex,moved:false};
      return true;
    };
    const restore=()=>{
      if(!gesture)return;
      gesture.ghost?.remove();
      if(gesture.card){
        gesture.card.style.visibility=gesture.previousVisibility;
        gesture.card.style.transform=gesture.previousTransform;
        gesture.card.style.zIndex=gesture.previousZIndex;
      }
      gesture=null;
    };
    const ensureGhost=()=>{
      if(!gesture||gesture.ghost)return gesture?.ghost||null;
      const {card,startRect}=gesture;
      const ghost=card.cloneNode(true);
      ghost.removeAttribute('id');ghost.removeAttribute('disabled');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;
      ghost.classList.add('gostop-flick-ghost');
      ghost.style.left=`${startRect.left}px`;ghost.style.top=`${startRect.top}px`;ghost.style.width=`${startRect.width}px`;ghost.style.height=`${startRect.height}px`;
      ghost.style.transform='translate3d(0,0,0)';
      doc.body.appendChild(ghost);
      gesture.ghost=ghost;
      card.style.visibility='hidden';
      return ghost;
    };
    const move=(x,y,event)=>{
      if(!gesture)return;
      gesture.lastX=x;gesture.lastY=y;
      const up=gesture.startY-y,side=Math.abs(x-gesture.startX);
      if(up>3&&up>=side*.35){
        gesture.moved=true;
        const ghost=ensureGhost();
        if(ghost){const dx=x-gesture.startX,dy=Math.min(12,y-gesture.startY);ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;}
        event?.preventDefault?.();
      }
    };
    const finish=(x,y,time,event)=>{
      if(!gesture)return false;
      const current=gesture;
      current.lastX=x;current.lastY=y;
      const duration=Math.max(1,(time||performance.now())-current.startTime);
      const flick=isUpwardFlick({startX:current.startX,startY:current.startY,endX:x,endY:y,duration});
      if(!flick){
        if(current.moved){event?.preventDefault?.();suppressCard=current.card;suppressUntil=Date.now()+700;}
        restore();return false;
      }
      event?.preventDefault?.();event?.stopImmediatePropagation?.();
      suppressCard=current.card;suppressUntil=Date.now()+700;
      const dx=x-current.startX,dy=y-current.startY;
      current.card.style.visibility='hidden';current.card.style.transform=`translate3d(${dx}px,${dy}px,0)`;current.card.style.zIndex='2147482000';
      if(current.ghost)current.ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
      const card=current.card,ghost=current.ghost,previousVisibility=current.previousVisibility,previousTransform=current.previousTransform,previousZIndex=current.previousZIndex;
      gesture=null;
      card.click();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ghost?.remove();
        card.style.transform=previousTransform;
        card.style.zIndex=previousZIndex;
        if(card.isConnected&&card.style.visibility==='hidden')card.style.visibility=previousVisibility;
      }));
      return true;
    };
    const touchById=(list,id)=>Array.from(list||[]).find(touch=>touch.identifier===id)||null;

    doc.addEventListener('touchstart',event=>{
      if(event.touches.length!==1)return;
      const touch=event.touches[0],card=cardFromTarget(event.target);
      begin(card,touch.clientX,touch.clientY,event.timeStamp,'touch',touch.identifier);
    },{capture:true,passive:true});
    doc.addEventListener('touchmove',event=>{
      if(!gesture||gesture.source!=='touch')return;
      const touch=touchById(event.touches,gesture.id);if(!touch)return;
      move(touch.clientX,touch.clientY,event);
    },{capture:true,passive:false});
    doc.addEventListener('touchend',event=>{
      if(!gesture||gesture.source!=='touch')return;
      const touch=touchById(event.changedTouches,gesture.id);if(!touch){restore();return;}
      finish(touch.clientX,touch.clientY,event.timeStamp,event);
    },{capture:true,passive:false});
    doc.addEventListener('touchcancel',()=>{if(gesture?.source==='touch')restore();},{capture:true,passive:true});

    doc.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch')return;
      if(event.button!=null&&event.button!==0)return;
      const card=cardFromTarget(event.target);
      if(!begin(card,event.clientX,event.clientY,event.timeStamp,'pointer',event.pointerId))return;
      try{card.setPointerCapture?.(event.pointerId);}catch(_){ }
    },true);
    doc.addEventListener('pointermove',event=>{
      if(!gesture||gesture.source!=='pointer'||event.pointerId!==gesture.id)return;
      move(event.clientX,event.clientY,event);
    },{capture:true,passive:false});
    doc.addEventListener('pointerup',event=>{
      if(!gesture||gesture.source!=='pointer'||event.pointerId!==gesture.id)return;
      finish(event.clientX,event.clientY,event.timeStamp,event);
    },{capture:true,passive:false});
    doc.addEventListener('pointercancel',event=>{if(gesture?.source==='pointer'&&event.pointerId===gesture.id)restore();},true);

    doc.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      const card=cardFromTarget(event.target);
      if(card&&card===suppressCard&&Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();suppressCard=null;suppressUntil=0;}
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
