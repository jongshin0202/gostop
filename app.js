(() => {
  'use strict';

  // Characterization tests opt in before this script loads. Production never
  // sets this flag, so the browser startup and gameplay path remain unchanged.
  const TEST_MODE = globalThis.GOSTOP_TEST_MODE === true;

  const COMMONS = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';
  const engine = globalThis.GoStopEngine;
  if(!engine)throw new Error('GoStopEngine must load before app.js.');
  const {
    monthNames,monthShort,assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,
    hasFourOfMonth,matchingCards,score,scoreWithGukjinMode,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,
    applyNormalTurnAction,applySpecialTurnAction,applySweepAction,classifyTurnOutcome
  }=engine;
  const MASTER_DECK = engine.masterDeck;
  const finishThreshold = 7;
  const PLAYER_A = 'playerA';
  const PLAYER_B = 'playerB';
  const SOLO_VIEWER_ID = PLAYER_A;

  function artUrl(filename) { return COMMONS + encodeURIComponent(filename).replace(/%2F/g,'/'); }

  const ids = [
    'playerHand','aiHand','floor','playerCaptured','aiCaptured','deckCount','deckCountTop','deckCorner','roundCorner',
    'playerScore','aiScore','goCount','turnLabel','aiThinking','eventBanner','coachText','promptText','howToBtn','newGameBtn',
    'howToDialog','decisionDialog','decisionText','goBtn','stopBtn','resultDialog','resultTitle','resultScore','resultBreakdown',
    'playAgainBtn','resultCall','goCallout','hintBtn','deckStack','table','roundNo','captureDialog','captureOwner','captureTitle','captureMagnified',
    'captureSummary','actionCue','railHowTo','railNewGame','soundToggle','shakeDialog','shakeText','shakeCards','shakeBtn','keepSecretBtn',
    'bombDialog','bombText','bombBtn','playOneBtn','playerMultiplier','aiMultiplier'
  ];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

  let state = null;
  const presentation = {
    roundNo:1,
    locked:false,
    hintCardId:null,
    soundEnabled:true,
    targetChoiceCleanup:null,
    pendingHumanCardId:null,
    queuedHumanCardSwitch:null,
    shakeResolver:null,
    bombResolver:null,
    aiTurnInProgress:false,
    stagedCards:new Map(),
    floorSlotReservations:new Map()
  };

  const sleep = ms => TEST_MODE ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clampVolume = v => Math.max(0, Math.min(1, v));

  function otherPlayerId(playerId){
    if(playerId===PLAYER_A)return PLAYER_B;
    if(playerId===PLAYER_B)return PLAYER_A;
    throw new Error(`Unknown player ID: ${playerId}`);
  }
  function legacySideForPlayerId(playerId){
    if(playerId===PLAYER_A)return 'human';
    if(playerId===PLAYER_B)return 'ai';
    throw new Error(`Unknown player ID: ${playerId}`);
  }
  function playerIdForLegacySide(side){
    if(side==='human')return PLAYER_A;
    if(side==='ai')return PLAYER_B;
    throw new Error(`Unknown legacy side: ${side}`);
  }
  function viewerSeatMap(viewerId){
    return {bottom:viewerId,top:otherPlayerId(viewerId),me:viewerId,opponent:otherPlayerId(viewerId)};
  }
  function playerStateById(gameState,playerId){ return gameState[legacySideForPlayerId(playerId)]; }
  function viewerRelativePlayers(gameState,viewerId){
    const seats=viewerSeatMap(viewerId);
    return {
      bottom:{id:seats.bottom,player:playerStateById(gameState,seats.bottom)},
      top:{id:seats.top,player:playerStateById(gameState,seats.top)}
    };
  }
  function seatForLegacySide(side,viewerId=SOLO_VIEWER_ID){
    return playerIdForLegacySide(side)===viewerId?'bottom':'top';
  }
  function monthListHas(player,field,month){ return player[field].includes(month); }
  function monthListAdd(player,field,month){ if(!monthListHas(player,field,month))player[field].push(month); }
  function monthListDelete(player,field,month){ player[field]=player[field].filter(value=>value!==month); }
  function applyNormalAction(action){
    const result=applyNormalTurnAction(state,action);
    state=result.state;
    return result;
  }
  function applySpecialAction(action){
    const result=applySpecialTurnAction(state,action);
    state=result.state;
    return result;
  }
  function normalAction(side,action){ return {...action,actorId:playerIdForLegacySide(side)}; }
  function classifyNormalTurn(side,details={}){
    return classifyTurnOutcome(state,{actorId:playerIdForLegacySide(side),...details});
  }


  function freshState(nagariCarryPower=0) {
    let deck, human, ai, floor, auditId='';
    for (let attempt=0; attempt<200; attempt++) {
      deck = shuffle(MASTER_DECK.map(c => ({...c})));
      assertDeckIntegrity(deck);
      auditId = makeShuffleAuditId();

      // Matgo-style two-pass deal: 5 to player, 5 to computer, 4 to floor; repeat.
      // Because the deck is uniformly shuffled, this is statistically equivalent to
      // partitioning 10/10/8, but it mirrors the physical dealing sequence.
      human = []; ai = []; floor = [];
      for (let pass=0; pass<2; pass++) {
        human.push(...deck.splice(0,5));
        ai.push(...deck.splice(0,5));
        floor.push(...deck.splice(0,4));
      }
      if (!hasFourOfMonth(floor)) break;
    }
    const makePlayer = hand => ({
      hand, captured:[], go:0, shakes:0, bombs:0, bombFreeTurns:0,
      ppeoks:0, hiddenTripleMonths:[], shakenMonths:[],
      lastGoScore:0
    });
    let next = {
      deck, floor,
      human:makePlayer(human),
      ai:makePlayer(ai),
      floorStacks:{},
      turn:PLAYER_A, winner:null, specialWinner:null,
      matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower}
    };
    markInitialFloorStacks(next);
    initFloorSlots(next);
    next=initializeShakeEligibility(next);
    logShuffleAudit(auditId,next);
    return next;
  }

  function requireCrypto(){
    if(!(globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function')){
      throw new Error('Secure shuffle unavailable: this browser does not provide crypto.getRandomValues().');
    }
    return globalThis.crypto;
  }

  function secureRandomInt(maxExclusive){
    if(!Number.isInteger(maxExclusive) || maxExclusive<=0) return 0;
    const cryptoApi=requireCrypto();
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    const buf = new Uint32Array(1);
    let value;
    do {
      cryptoApi.getRandomValues(buf);
      value = buf[0];
    } while(value >= limit);
    return value % maxExclusive;
  }

  function makeShuffleAuditId(){
    const a=new Uint32Array(2); requireCrypto().getRandomValues(a);
    return Array.from(a,v=>v.toString(16).padStart(8,'0')).join('-');
  }

  function logShuffleAudit(id,st){
    const summarize=cards=>{
      const counts=countsByMonth(cards);
      return {
        months: cards.map(c=>c.month),
        counts,
        triples:Object.entries(counts).filter(([,n])=>n>=3).map(([m,n])=>({month:Number(m),count:n}))
      };
    };
    console.info('[Go-Stop secure shuffle]',{
      auditId:id,
      rng:'crypto.getRandomValues + unbiased Fisher-Yates',
      human:summarize(st.human.hand),
      computer:summarize(st.ai.hand),
      floor:summarize(st.floor),
      remainingDeck:st.deck.length
    });
  }

  function shuffle(a){
    // Unbiased Fisher-Yates shuffle. Each new game starts from a fresh clone of
    // MASTER_DECK, then every swap index is drawn independently from Web Crypto.
    for(let i=a.length-1;i>0;i--){
      const j=secureRandomInt(i+1);
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }
  function markInitialFloorStacks(st){
    const n=countsByMonth(st.floor);
    Object.keys(n).map(Number).filter(m=>n[m]===3).forEach(month=>{
      const cards=st.floor.filter(c=>c.month===month);
      st.floorStacks[month]=makeStackInfo(cards,'initial',null);
    });
  }
  function initFloorSlots(st){
    // Fixed table positions: cards never compact or shift after a capture.
    presentation.floorSlotReservations.clear();
    st.floorSlotCount=12;
    st.floorSlotByCard={};
    st.floor.forEach((card,i)=>{ st.floorSlotByCard[card.id]=i; });
    // A three-card same-month floor stack occupies one physical slot.
    Object.values(st.floorStacks).forEach(stack=>{
      const slots=stack.cardIds.map(id=>st.floorSlotByCard[id]).filter(Number.isFinite);
      const slot=slots.length?Math.min(...slots):firstFreeFloorSlot(st);
      stack.cardIds.forEach(id=>{ st.floorSlotByCard[id]=slot; });
    });
  }
  function occupiedFloorSlots(st=state){
    const used=new Set();
    if(!st || !st.floorSlotByCard)return used;
    Object.values(st.floorSlotByCard).forEach(slot=>{ if(Number.isFinite(slot))used.add(slot); });
    // In-flight landing reservations are local presentation state. They block
    // duplicate visual occupancy without becoming authoritative floor cards.
    presentation.floorSlotReservations.forEach(slot=>{if(Number.isFinite(slot))used.add(slot);});
    return used;
  }
  function firstFreeFloorSlot(st=state,commitCapacity=true){
    if(!st.floorSlotByCard)st.floorSlotByCard={};
    if(!Number.isFinite(st.floorSlotCount))st.floorSlotCount=12;
    const used=occupiedFloorSlots(st);
    for(let i=0;i<st.floorSlotCount;i++) if(!used.has(i)) return i;
    let slot=st.floorSlotCount;
    while(used.has(slot))slot++;
    if(commitCapacity)st.floorSlotCount=slot+4;
    return slot;
  }
  function reserveFloorSlot(card,preferredSlot=null){
    if(!state.floorSlotByCard)state.floorSlotByCard={};
    if(Number.isFinite(state.floorSlotByCard[card.id]))return state.floorSlotByCard[card.id];
    if(Number.isFinite(presentation.floorSlotReservations.get(card.id)))return presentation.floorSlotReservations.get(card.id);
    const slot=Number.isFinite(preferredSlot)?preferredSlot:firstFreeFloorSlot(state,false);
    presentation.floorSlotReservations.set(card.id,slot);
    return slot;
  }
  function commitFloorSlot(card,preferredSlot=null){
    const reserved=presentation.floorSlotReservations.get(card.id);
    const slot=Number.isFinite(preferredSlot)?preferredSlot:Number.isFinite(reserved)?reserved:firstFreeFloorSlot(state);
    if(slot>=state.floorSlotCount)state.floorSlotCount=slot+4;
    state.floorSlotByCard[card.id]=slot;
    presentation.floorSlotReservations.delete(card.id);
    return slot;
  }
  function visualHash(value){
    let hash=0; for(const char of value)hash=(hash*31+char.charCodeAt(0))>>>0; return hash;
  }
  function stableFloorTilt(card){
    return ((visualHash(card.id)%61)-30)/10; // stable -3.0..+3.0 degrees
  }
  function stableStackAngle(stack,card,index){
    const base=[-10,2,12][index]||0;
    return base+((visualHash(`${stack.source}:${stack.month}:${card.id}`)%41)-20)/10;
  }
  function makeStackInfo(cards,source,owner){
    return {
      month:cards[0]?.month,
      cardIds:cards.map(c=>c.id),
      source, owner
    };
  }
  function floorStackForMonth(month){ return state.floorStacks[month] || null; }
  function cardsInStack(stack){
    if(!stack)return[];
    return stack.cardIds.map(id=>state.floor.find(c=>c.id===id)).filter(Boolean);
  }
  function removeFloorCards(cards){
    const idsSet=new Set(cards.map(c=>c.id));
    const affectedMonths=new Set(cards.map(c=>c.month));
    state.floor=state.floor.filter(c=>!idsSet.has(c.id));
    idsSet.forEach(id=>{
      if(state.floorSlotByCard)delete state.floorSlotByCard[id];
      presentation.floorSlotReservations.delete(id);
    });
    affectedMonths.forEach(month=>{
      const st=state.floorStacks[month];
      if(st && st.cardIds.some(id=>idsSet.has(id))) delete state.floorStacks[month];
    });
  }
  function addFloorCard(card,preferredSlot=null){
    commitFloorSlot(card,preferredSlot);
    if(!state.floor.some(c=>c.id===card.id)) state.floor.push(card);
  }
  function makePpeokStack(side,cards){
    const existing=cards.find(c=>state.floor.some(f=>f.id===c.id));
    const stackSlot=existing && Number.isFinite(state.floorSlotByCard?.[existing.id])
      ? state.floorSlotByCard[existing.id]
      : firstFreeFloorSlot(state);
    cards.forEach(c=>addFloorCard(c,stackSlot));
    cards.forEach(c=>{ state.floorSlotByCard[c.id]=stackSlot; presentation.floorSlotReservations.delete(c.id); });
    state.floorStacks[cards[0].month]=makeStackInfo(cards,'ppeok',playerIdForLegacySide(side));
    state[side].ppeoks++;
  }
  function effectiveFloorMatchCards(card){
    const st=floorStackForMonth(card.month);
    if(st){
      const cs=cardsInStack(st);
      return cs.length ? [cs[cs.length-1]] : [];
    }
    return matchingCards(state.floor,card);
  }
  function expandedTargetCards(targetCard){
    if(!targetCard)return[];
    const st=floorStackForMonth(targetCard.month);
    if(st && st.cardIds.includes(targetCard.id)) return cardsInStack(st);
    return [targetCard];
  }
  function stackStealCount(side,targetCard){
    if(!targetCard)return 0;
    const st=floorStackForMonth(targetCard.month);
    if(!st || !st.cardIds.includes(targetCard.id)) return 0;
    if(st.source==='initial') return 1;
    if(st.source==='ppeok') return st.owner===playerIdForLegacySide(side) ? 2 : 1;
    return 0;
  }

  function createCardEl(card, className='card') {
    const btn = document.createElement(className.includes('hand-card')?'button':'div');
    if(btn.tagName==='BUTTON') btn.type='button';
    btn.className=className;
    btn.dataset.cardId=card.id;
    btn.dataset.month=card.month;
    btn.title=`${monthShort[card.month-1]} · ${card.type}`;
    const img=document.createElement('img');
    img.src=artUrl(card.file); img.alt=`Hwatu ${monthShort[card.month-1]} card`; img.draggable=false;
    img.addEventListener('error',()=>{ img.alt='Card art unavailable'; btn.classList.add('art-error'); });
    btn.appendChild(img);
    return btn;
  }

  function render() {
    if(TEST_MODE)return;
    const view=viewerRelativePlayers(state,SOLO_VIEWER_ID);
    const bottomPlayer=view.bottom.player,topPlayer=view.top.player;
    const bottomScore=score(bottomPlayer.captured),topScore=score(topPlayer.captured);
    els.playerScore.textContent=bottomScore.total; els.aiScore.textContent=topScore.total;
    if(els.goCount) els.goCount.textContent=bottomPlayer.go;
    [els.deckCount,els.deckCountTop,els.deckCorner].filter(Boolean).forEach(el=>el.textContent=state.deck.length);
    if(els.roundCorner) els.roundCorner.textContent=presentation.roundNo;
    // Keep the table visually clean: animation itself communicates whose turn it is.
    els.turnLabel.textContent = '';
    els.aiThinking.textContent = '';
    if(els.promptText) els.promptText.textContent='';

    els.playerHand.innerHTML='';
    bottomPlayer.hand.sort(sortCards).forEach(card=>{
      const el=createCardEl(card,'card hand-card');
      el.disabled = presentation.locked || state.turn!==PLAYER_A;
      if(card.id===presentation.hintCardId) el.classList.add('matchable');
      el.addEventListener('click',()=>humanPlay(card.id, el));
      els.playerHand.appendChild(el);
    });
    for(let i=0;i<bottomPlayer.bombFreeTurns;i++){
      const blank=document.createElement('button');
      blank.type='button'; blank.className='card hand-card blank-turn-card';
      blank.setAttribute('aria-label','Use empty Bomb turn and flip from the deck');
      blank.title='Bomb empty turn: click to skip playing a hand card and flip the deck';
      blank.disabled=presentation.locked || state.turn!==PLAYER_A;
      blank.innerHTML='<span aria-hidden="true">—</span>';
      blank.addEventListener('click',humanUseBombBlank);
      els.playerHand.appendChild(blank);
    }

    els.aiHand.innerHTML='';
    topPlayer.hand.forEach(()=>{ const d=document.createElement('div'); d.className='mini-back'; els.aiHand.appendChild(d); });

    renderFloor();

    if(els.playerMultiplier) els.playerMultiplier.textContent=playerDoubleLabel(bottomPlayer);
    if(els.aiMultiplier) els.aiMultiplier.textContent=playerDoubleLabel(topPlayer);

    renderCaptured(els.playerCaptured,bottomPlayer.captured,view.bottom.id);
    renderCaptured(els.aiCaptured,topPlayer.captured,view.top.id);
  }


  function playerDoubleLabel(player){
    const power=player.shakes+player.bombs;
    return power ? `×${2**power}` : '';
  }

  function renderFloor(){
    els.floor.innerHTML='';
    if(!state.floorSlotByCard)initFloorSlots(state);
    const stackBySlot=new Map();
    Object.values(state.floorStacks).forEach(st=>{
      const cards=cardsInStack(st);
      const slot=cards.length?state.floorSlotByCard[cards[0].id]:null;
      if(Number.isFinite(slot))stackBySlot.set(slot,st);
    });

    const reservedSlots=[...presentation.floorSlotReservations.values()];
    const visibleSlotCount=Math.max(state.floorSlotCount,reservedSlots.length?Math.max(...reservedSlots)+1:0);
    for(let slot=0; slot<visibleSlotCount; slot++){
      const slotEl=document.createElement('div');
      slotEl.className='floor-slot';
      slotEl.dataset.floorSlot=String(slot);
      const stack=stackBySlot.get(slot);
      if(stack){
        const wrap=document.createElement('div');
        wrap.className='floor-stack-three';
        wrap.dataset.stackMonth=String(stack.month);
        cardsInStack(stack).forEach((c,i)=>{
          const el=createCardEl(c,'card floor-card stacked-floor-card');
          el.style.setProperty('--stack-angle',`${stableStackAngle(stack,c,i)}deg`);
          el.style.setProperty('--stack-x',`${i*5}px`);
          el.style.setProperty('--stack-y',`${i*3}px`);
          el.style.zIndex=String(i+1);
          wrap.appendChild(el);
        });
        slotEl.appendChild(wrap);
      }else{
        const cards=state.floor.filter(c=>state.floorSlotByCard[c.id]===slot);
        if(cards.length){
          const card=cards[0];
          const el=createCardEl(card,'card floor-card');
          el.style.setProperty('--tilt',`${stableFloorTilt(card)}deg`);
          slotEl.appendChild(el);
        }
      }
      els.floor.appendChild(slotEl);
    }
  }

  function sortCards(a,b){ return a.month-b.month || typeRank(b.type)-typeRank(a.type); }
  function typeRank(t){ return {bright:4,animal:3,ribbon:2,pi:1}[t]||0; }

  const captureGroups = [
    {type:'bright',en:'Brights'},
    {type:'animal',en:'Pictures'},
    {type:'ribbon',en:'Stripes'},
    {type:'pi',en:'Singles'}
  ];

  function renderCaptured(root,cards,ownerId){
    root.innerHTML=''; root.dataset.owner=ownerId;
    const isViewer=ownerId===SOLO_VIEWER_ID;
    captureGroups.forEach(group=>{
      const groupCards=cards.filter(c=>c.type===group.type).sort((a,b)=>a.month-b.month);
      const btn=document.createElement('button'); btn.type='button'; btn.className='capture-group'; btn.dataset.captureType=group.type;
      btn.setAttribute('aria-label',`${isViewer?'Your':'Computer'} ${group.en} captured cards: ${groupCards.length}`);
      const head=document.createElement('span'); head.className='capture-group-head';
      head.innerHTML=`<b>${group.en}</b><em>${groupCards.length}</em>`;
      const stack=document.createElement('span'); stack.className='capture-stack';
      groupCards.forEach((c,i)=>{
        const img=document.createElement('img'); img.className='captured-mini'; img.src=artUrl(c.file); img.alt='';
        img.title=`${monthShort[c.month-1]} ${c.type}`; img.style.zIndex=String(i+1); stack.appendChild(img);
      });
      if(!groupCards.length){ const empty=document.createElement('span'); empty.className='capture-empty'; empty.textContent='—'; stack.appendChild(empty); }
      btn.append(head,stack); btn.addEventListener('click',()=>openCapturedGroup(ownerId,group,groupCards)); root.appendChild(btn);
    });
  }

  function openCapturedGroup(ownerId,group,cards){
    const isViewer=ownerId===SOLO_VIEWER_ID;
    els.captureOwner.textContent=isViewer?'YOUR CAPTURED CARDS':'COMPUTER CAPTURED CARDS';
    els.captureTitle.textContent=group.en; els.captureMagnified.innerHTML='';
    cards.forEach(c=>els.captureMagnified.appendChild(createCardEl(c,'card magnified-card')));
    if(!cards.length){ const empty=document.createElement('div'); empty.className='magnified-empty'; empty.textContent='No cards captured in this group yet.'; els.captureMagnified.appendChild(empty); }
    const s=score(playerStateById(state,ownerId).captured);
    const detail=group.type==='bright'?`${cards.length} Bright${cards.length===1?'':'s'}`:group.type==='animal'?`${cards.length} picture / animal cards${s.godori?' · Godori complete':''}`:group.type==='ribbon'?`${cards.length} stripe cards`:`${s.piCount} Singles value${s.piCount===1?'':'s'} (${cards.length} cards)`;
    els.captureSummary.textContent=detail; els.captureDialog.showModal();
  }

  function showActionCue(){ /* No turn/action text overlays; the animation is the cue. */ }
  function hideActionCue(){
    if(els.actionCue){ els.actionCue.textContent=''; els.actionCue.className='action-cue'; }
  }
  function showBanner(){ /* No no-hit/capture/turn banners. */ }

  function matchesFor(card){ return effectiveFloorMatchCards(card); }
  function chooseBestMatch(matches){ return matches.slice().sort((a,b)=>captureValue(b)-captureValue(a))[0]; }
  function captureValue(c){
    let v={bright:12,animal:5,ribbon:4,pi:2}[c.type]||1;
    if(c.flags.includes('doublePi'))v+=4; if(c.flags.includes('godori'))v+=4; if(c.ribbonSet)v+=2; return v;
  }

  async function chooseFloorTarget(matches, message='Choose which card to hit'){
    if(matches.length<=1) return matches[0]||null;
    cleanupTargetChoice();
    presentation.locked=true;
    showActionCue('human','choose a floor card');

    return new Promise(resolve=>{
      const handlers=[];
      const finish=card=>{
        handlers.forEach(({el,click,key})=>{el.removeEventListener('click',click);el.removeEventListener('keydown',key);el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');});
        presentation.targetChoiceCleanup=null;
        resolve(card);
      };
      matches.forEach(card=>{
        const el=els.floor.querySelector(`[data-card-id="${card.id}"]`); if(!el)return;
        el.classList.add('target-option'); el.setAttribute('role','button'); el.setAttribute('tabindex','0');
        const click=()=>finish(card);
        const key=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();finish(card);}};
        el.addEventListener('click',click); el.addEventListener('keydown',key); handlers.push({el,click,key});
      });
      presentation.targetChoiceCleanup=()=>finish(null);
    });
  }
  function cleanupTargetChoice(){ if(presentation.targetChoiceCleanup){ const fn=presentation.targetChoiceCleanup; presentation.targetChoiceCleanup=null; fn(); } }

  async function previewAiTarget(target){
    if(!target)return;
    const el=els.floor.querySelector(`[data-card-id="${target.id}"]`); if(!el)return;
    el.classList.add('ai-target-preview'); showActionCue('ai','targets this card');
    await sleep(420); el.classList.remove('ai-target-preview');
  }


  function virtualHandCount(player){ return player.hand.length + player.bombFreeTurns; }
  // Characterization compatibility helper; production blank consumption is engine-owned.
  function consumeBombBlank(player){ player.bombFreeTurns=Math.max(0,player.bombFreeTurns-1); }
  function canDeclareShake(player,month){
    // Characterization compatibility helper; production eligibility is engine-owned.
    return player.hand.filter(c=>c.month===month).length===3 && monthListHas(player,'hiddenTripleMonths',month);
  }
  function reachedNewFinishScore(total,previous){ return total>=finishThreshold && total>previous; }

  async function humanUseBombBlank(){
    if(presentation.locked || state.turn!==PLAYER_A || state.winner || state.human.bombFreeTurns<=0)return;
    presentation.locked=true; presentation.hintCardId=null; render();
    await executeDeckOnlyTurn('human');
  }

  async function humanPlay(cardId, clickedEl){
    if(state.turn!==PLAYER_A || state.winner)return;

    // While choosing between two floor targets, clicking a different hand card
    // cancels the current choice immediately and starts selection for the new card.
    if(presentation.locked){
      if(presentation.targetChoiceCleanup && presentation.pendingHumanCardId && cardId!==presentation.pendingHumanCardId){
        presentation.queuedHumanCardSwitch={cardId,clickedEl};
        presentation.targetChoiceCleanup();
      }
      return;
    }

    const card=state.human.hand.find(c=>c.id===cardId); if(!card)return;
    presentation.locked=true; presentation.hintCardId=null;

    const attempted=applyNormalAction(normalAction('human',{type:'attemptPlayCard',cardId:card.id}));
    if(attempted.pendingDecision?.type==='shakeDecision'){
      const shake=await chooseShake(card.month);
      if(shake){
        const declared=applyNormalAction(normalAction('human',{type:'declareShake'}));
        if(declared.events.some(event=>event.type==='shakeDeclared'))playShakeSound();
        render();
        await sleep(180);
      }else{
        const kept=applyNormalAction(normalAction('human',{type:'keepShakeSecret'}));
        if(kept.pendingDecision?.type==='bombDecision'){
          const useBomb=await chooseBomb(card.month);
          if(useBomb){
            presentation.pendingHumanCardId=null;
            presentation.queuedHumanCardSwitch=null;
            await executeBombTurn('human',card.month);
            return;
          }
          applyNormalAction(normalAction('human',{type:'declineBomb'}));
        }
      }
    }

    const matches=matchesFor(card);
    clickedEl.classList.add('pending-card');
    presentation.pendingHumanCardId=card.id;
    let target=null;
    if(matches.length===1) target=matches[0];
    else if(matches.length===2) target=await chooseFloorTarget(matches,'Choose which floor card to hit');
    else if(matches.length>2) target=chooseBestMatch(matches);

    // A different hand card was clicked while the two floor targets were glowing.
    // Remove the old highlights and restart from the newly selected card without
    // moving or consuming the original card.
    if(matches.length===2 && !target){
      clickedEl.classList.remove('pending-card');
      presentation.pendingHumanCardId=null;
      presentation.locked=false;
      const next=presentation.queuedHumanCardSwitch;
      presentation.queuedHumanCardSwitch=null;
      if(next){
        await nextFrame();
        return humanPlay(next.cardId,next.clickedEl);
      }
      return;
    }

    presentation.queuedHumanCardSwitch=null;
    presentation.pendingHumanCardId=null;
    clickedEl.classList.remove('pending-card');
    const sourceRect=clickedEl.getBoundingClientRect();
    clickedEl.style.visibility='hidden';
    const playResult=applyNormalAction(normalAction('human',{type:'playCard',cardId:card.id,targetId:target?.id||null}));
    const playedEvent=playResult.events.find(event=>event.type==='cardPlayed');
    await playFullTurn('human',playedEvent.card,sourceRect,target,matches.length,true);
  }

  async function aiTurn(){
    if(state.turn!==PLAYER_B||state.winner||presentation.aiTurnInProgress)return;
    presentation.aiTurnInProgress=true;
    presentation.locked=true;
    try {
      render(); await sleep(520);

      const bombMonth=bestAiBombMonth();
      if(bombMonth!=null){
        const card=state.ai.hand.find(item=>item.month===bombMonth);
        applyNormalAction(normalAction('ai',{type:'requestBombDecision',cardId:card.id}));
        await executeBombTurn('ai',bombMonth);
        return;
      }

      const card=bestAiCard();
      if(!card){
        await finishNagari();
        return;
      }
      // The computer also decides whether to Shake only when it is about to use
      // one of the three matching-month cards, never at the opening deal.
      const attempted=applyNormalAction(normalAction('ai',{type:'attemptPlayCard',cardId:card.id}));
      if(attempted.pendingDecision?.type==='shakeDecision'){
        const fourthOnFloor=state.floor.some(c=>c.month===card.month);
        if(!fourthOnFloor && Math.random()<.72){
          const declared=applyNormalAction(normalAction('ai',{type:'declareShake'}));
          if(declared.events.some(event=>event.type==='shakeDeclared'))playShakeSound();
          await revealAiShake(card.month);
          render();
          await sleep(220);
        }else applyNormalAction(normalAction('ai',{type:'keepShakeSecret'}));
      }
      const backs=[...els.aiHand.querySelectorAll('.mini-back')];
      const sourceEl=backs[Math.floor(backs.length*.45)]||backs[0];
      const sourceRect=sourceEl?sourceEl.getBoundingClientRect():approximateAiSource();
      if(sourceEl)sourceEl.style.visibility='hidden';
      const matches=matchesFor(card);
      let target=null;
      if(matches.length===1)target=matches[0];
      else if(matches.length===2)target=chooseBestMatch(matches);
      else if(matches.length>2)target=chooseBestMatch(matches);
      if(target && matches.length>1) await previewAiTarget(target);
      const playResult=applyNormalAction(normalAction('ai',{type:'playCard',cardId:card.id,targetId:target?.id||null}));
      const playedEvent=playResult.events.find(event=>event.type==='cardPlayed');
      await playFullTurn('ai',playedEvent.card,sourceRect,target,matches.length,true);
    } finally {
      presentation.aiTurnInProgress=false;
    }
  }

  async function presentNormalResolution(side,result){
    const event=result.events[0];
    if(event.type==='cardLanded'){
      presentation.floorSlotReservations.delete(event.card.id);
      removeStage(event.card.id);
      render();
      await sleep(180);
      return;
    }
    if(event.type==='cardsCaptured'){
      await animateCaptureBatch(event.cards,side);
      render();
      await sleep(190);
    }
  }

  async function resolveNormalEngineTurn(side,play,draw){
    let result=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'played'}));
    await presentNormalResolution(side,result);
    if(draw){
      result=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'drawn'}));
      await presentNormalResolution(side,result);
    }
    const completion=applyNormalAction(normalAction(side,{type:'completeTurn'}));
    await presentPiTransferEvents(side,completion.events);
  }

  async function presentPiTransferEvents(side,events){
    for(const event of events.filter(item=>item.type==='piTransferred')){
      const card=MASTER_DECK.find(item=>item.id===event.cardId);
      await animatePiTransfer(card,legacySideForPlayerId(event.fromPlayerId),side);
    }
    if(events.some(event=>event.type==='piTransferred'))render();
  }

  async function resolveExtractedSpecialTurn(side,classification,play,draw){
    const result=applySpecialAction(normalAction(side,{type:'resolveSpecialTurn'}));
    if(classification.kind==='ppeokSsaDaCandidate'){
      removeStage(play.card.id); if(draw)removeStage(draw.card.id);
      playPpeokSound(); render();
      if(state[side].ppeoks>=3){ await sleep(450); finishSpecial(side,7,'Three ppeoks in one hand'); }
    }else{
      let laughed=false;
      for(const event of result.events){
        if(event.type==='cardsCaptured'){
          const captured=event.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id));
          await animateCaptureBatch(captured,side);
          if(classification.kind==='selfPpeokCandidate'&&!laughed){playLaughSound();laughed=true;}
        }else if(event.type==='cardLanded'){
          presentation.floorSlotReservations.delete(event.cardId); removeStage(event.cardId); await sleep(180);
        }else if(event.type==='piTransferred'){
          const card=MASTER_DECK.find(item=>item.id===event.cardId);
          await animatePiTransfer(card,legacySideForPlayerId(event.fromPlayerId),side);
        }
      }
      render(); await sleep(190);
    }
    if(state.pendingTurn?.phase==='awaitingTurnCompletion')applyNormalAction(normalAction(side,{type:'completeTurn'}));
  }

  async function playFullTurn(side, playedCard, sourceRect, target, playMatchCount,engineTurn=false){
    const playedStage=await animateHandCardSlap(side,playedCard,sourceRect,target);
    await sleep(330);

    if(!state.deck.length){
      const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
      if(engineTurn)applyNormalAction(normalAction(side,{type:'drawNextCard'}));
      const classification=engineTurn?classifyNormalTurn(side):null;
      if(engineTurn&&classification.kind==='normal')await resolveNormalEngineTurn(side,play,null);
      else if(engineTurn&&['selfPpeokCandidate'].includes(classification.kind))await resolveExtractedSpecialTurn(side,classification,play,null);
      else{
        if(engineTurn)applyNormalAction(normalAction(side,{type:'deferSpecialTurn'}));
        await resolveCombinedTurn(side,play,null);
      }
      await concludeTurn(side);
      return;
    }

    const drawResult=engineTurn?applyNormalAction(normalAction(side,{type:'drawNextCard'})):null;
    const draw=engineTurn?drawResult.events.find(event=>event.type==='deckCardRevealed').card:state.deck.shift();
    let turnClassification=engineTurn?classifyNormalTurn(side):null;
    render();
    const deckStage=await animateDeckLiftFlip(side,draw);

    let drawTarget=null;
    let drawMatches=matchesFor(draw);
    let drawMatchCount=drawMatches.length;

    const sameMonthSpecial=turnClassification&&['jjokCandidate','ppeokSsaDaCandidate','ttadakCandidate'].includes(turnClassification.kind);
    if(sameMonthSpecial && playMatchCount<=2){
      drawTarget=playedCard;
    }else if(drawMatches.length===1){
      drawTarget=drawMatches[0];
    }else if(drawMatches.length===2){
      if(side==='human') drawTarget=await chooseFloorTarget(drawMatches,'Deck card: choose which floor card to hit');
      else { drawTarget=chooseBestMatch(drawMatches); await previewAiTarget(drawTarget); }
    }else if(drawMatches.length>2){
      drawTarget=chooseBestMatch(drawMatches);
      if(side==='ai')await previewAiTarget(drawTarget);
    }

    if(engineTurn&&drawTarget&&state.pendingTurn?.drawn?.matchIds.includes(drawTarget.id)&&state.pendingTurn.drawn.targetId!==drawTarget.id){
      applyNormalAction(normalAction(side,{type:'chooseFloorTarget',source:'drawn',targetId:drawTarget.id}));
      turnClassification=classifyNormalTurn(side);
    }

    await animateStagedSlap(deckStage,draw,drawTarget,'flip');
    const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
    const drawn={card:draw,stage:deckStage,target:drawTarget,matchCount:drawMatchCount};
    const extractedSpecial=['ppeokSsaDaCandidate','selfPpeokCandidate','jjokCandidate','ttadakCandidate'];
    if(engineTurn&&turnClassification.kind==='normal')await resolveNormalEngineTurn(side,play,drawn);
    else if(engineTurn&&extractedSpecial.includes(turnClassification.kind))await resolveExtractedSpecialTurn(side,turnClassification,play,drawn);
    else{
      if(engineTurn)applyNormalAction(normalAction(side,{type:'deferSpecialTurn'}));
      await resolveCombinedTurn(side,play,drawn);
    }
    await concludeTurn(side);
  }

  async function executeDeckOnlyTurn(side){
    if(state.winner)return;
    presentation.locked=true;
    applyNormalAction(normalAction(side,{type:'useBombBlank'}));
    await executePendingDrawTurn(side);
  }

  async function executePendingDrawTurn(side){
    if(!state.deck.length){
      applyNormalAction(normalAction(side,{type:'drawNextCard'}));
      const completed=applyNormalAction(normalAction(side,{type:'completeTurn'}));
      await presentPiTransferEvents(side,completed.events);
      await finishNagari(); return;
    }
    const drawResult=applyNormalAction(normalAction(side,{type:'drawNextCard'}));
    const draw=drawResult.events.find(event=>event.type==='deckCardRevealed').card;
    render();
    const stage=await animateDeckLiftFlip(side,draw);
    const matches=matchesFor(draw);
    let target=null;
    if(matches.length===1)target=matches[0];
    else if(matches.length===2){
      if(side==='human')target=await chooseFloorTarget(matches,'Choose which floor card to hit');
      else{target=chooseBestMatch(matches);await previewAiTarget(target);}
    }else if(matches.length>2)target=chooseBestMatch(matches);
    if(target&&state.pendingTurn?.drawn?.matchIds.includes(target.id)&&state.pendingTurn.drawn.targetId!==target.id){
      applyNormalAction(normalAction(side,{type:'chooseFloorTarget',source:'drawn',targetId:target.id}));
    }
    await animateStagedSlap(stage,draw,target,'flip');
    const classification=classifyNormalTurn(side);
    if(classification.kind==='normal'){
      const resolved=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'drawn'}));
      await presentNormalResolution(side,resolved);
      const completed=applyNormalAction(normalAction(side,{type:'completeTurn'}));
      await presentPiTransferEvents(side,completed.events);
    }else{
      applyNormalAction(normalAction(side,{type:'deferSpecialTurn'}));
      await resolveSingleCard(side,{card:draw,stage,target,matchCount:matches.length},true);
      await applySweepIfNeeded(side);
    }
    await concludeTurn(side);
  }

  async function executeBombTurn(side,month){
    // Presentation wrapper: declareBomb performs every authoritative Bomb mutation.
    const decision=state.pendingDecision;
    const bombCards=decision?.cardIds.map(id=>state[side].hand.find(card=>card.id===id)).filter(Boolean)||[];
    const floorTarget=state.floor.find(c=>c.id===decision?.floorCardId);
    if(bombCards.length!==3 || !floorTarget){ presentation.locked=false; render(); return; }

    const bombSourceRects=bombCards.map((c,i)=>{
      if(seatForLegacySide(side)==='bottom'){
        const el=els.playerHand.querySelector(`[data-card-id="${c.id}"]`);
        if(el) return el.getBoundingClientRect();
      }
      return seatForLegacySide(side)==='bottom'?approximateHumanSource(i,bombCards.length):approximateAiSource();
    });
    if(seatForLegacySide(side)==='bottom'){
      bombCards.forEach(card=>{const el=els.playerHand.querySelector(`[data-card-id="${card.id}"]`);if(el)el.style.visibility='hidden';});
    }else [...els.aiHand.querySelectorAll('.mini-back')].slice(0,3).forEach(el=>el.style.visibility='hidden');
    const result=applyNormalAction(normalAction(side,{type:'declareBomb'}));
    if(!result.events.some(event=>event.type==='bombDeclared'))return;

    await animateBombSlap(side,bombCards,floorTarget,bombSourceRects);
    await sleep(180);

    await animateCaptureBatch([...bombCards,floorTarget],side);
    await presentPiTransferEvents(side,result.events);
    render();
    await sleep(260);
    await executePendingDrawTurn(side);
  }

  async function resolveCombinedTurn(side,play,draw){
    // Legacy fallback and characterization oracle. Production routes Ppeok/Ssa-da,
    // Jjok, Ttadak, and Self-Ppeok through applySpecialTurnAction before reaching here.
    const sameMonth=draw && draw.card.month===play.card.month && !floorStackForMonth(play.card.month);

    if(draw && sameMonth && play.matchCount===0){
      await animateCaptureBatch([play.card,draw.card],side);
      state[side].captured.push(play.card,draw.card);
      await stealPiAnimated(side,1);
      await applySweepIfNeeded(side);
      return;
    }

    if(draw && sameMonth && play.matchCount===1){
      const target=play.target || effectiveFloorMatchCards(play.card)[0];
      if(target && !floorStackForMonth(play.card.month)){
        const three=[target,play.card,draw.card];
        removeStage(play.card.id); removeStage(draw.card.id);
        makePpeokStack(side,three);
        playPpeokSound();
        render();
        if(state[side].ppeoks>=3){
          await sleep(450);
          finishSpecial(side,7,'Three ppeoks in one hand');
        }
        return;
      }
    }

    if(draw && sameMonth && play.matchCount===2){
      const original=state.floor.filter(c=>c.month===play.card.month).slice(0,2);
      await animateCaptureBatch([play.card,draw.card,...original],side);
      removeFloorCards(original);
      state[side].captured.push(play.card,draw.card,...original);
      await stealPiAnimated(side,1);
      await applySweepIfNeeded(side);
      return;
    }

    await resolveSingleCard(side,play,false);
    if(draw) await resolveSingleCard(side,draw,true);
    await applySweepIfNeeded(side);
  }

  async function resolveSingleCard(side,action,isDeck){
    if(!action)return;
    const {card,stage,target,matchCount}=action;
    if(!matchCount){
      addFloorCard(card);
      removeStage(card.id);
      render();
      await sleep(180);
      return;
    }

    let floorCaptured=[];
    let steal=0;
    let capturedPpeok=false;
    if(matchCount===1){
      const chosen=target || matchesFor(card)[0];
      const chosenStack=chosen ? floorStackForMonth(chosen.month) : null;
      capturedPpeok=!!(chosenStack && chosenStack.cardIds.includes(chosen.id) && chosenStack.source==='ppeok');
      floorCaptured=expandedTargetCards(chosen);
      steal=stackStealCount(side,chosen);
    }else if(matchCount===2){
      floorCaptured=[target||chooseBestMatch(matchesFor(card))];
    }else{
      floorCaptured=state.floor.filter(c=>c.month===card.month);
    }

    await animateCaptureBatch([card,...floorCaptured],side);
    removeFloorCards(floorCaptured);
    state[side].captured.push(card,...floorCaptured);
    if(capturedPpeok) playLaughSound();
    if(steal) await stealPiAnimated(side,steal);
    render();
    await sleep(190);
  }

  async function applySweepIfNeeded(side){
    // Legacy resolver bridge only: authoritative Sweep detection/mutation is engine-owned.
    const result=applySweepAction(state,normalAction(side,{type:'resolveSweep',rule:'legacyContinuation'}));
    state=result.state;
    await presentPiTransferEvents(side,result.events);
    if(result.events.some(event=>event.type==='sweepTriggered'))await sleep(160);
  }

  async function stealPiAnimated(side,count){
    const other=side==='human'?'ai':'human';
    for(let n=0;n<count;n++){
      const ordinary=state[other].captured.find(c=>c.type==='pi'&&!c.flags.includes('doublePi'));
      const anyPi=ordinary || state[other].captured.find(c=>c.type==='pi');
      if(!anyPi)break;
      state[other].captured=state[other].captured.filter(c=>c.id!==anyPi.id);
      state[side].captured.push(anyPi);
      await animatePiTransfer(anyPi,other,side);
    }
  }

  async function animatePiTransfer(card,fromSide,toSide){
    if(TEST_MODE)return;
    const fromRect=captureTargetRect(fromSide,'pi');
    const toRect=captureTargetRect(toSide,'pi');
    if(!fromRect.width||!toRect.width||prefersReducedMotion())return;
    const {w,h}=cardSize();
    const start={left:fromRect.left+fromRect.width/2-w*.23,top:fromRect.top+fromRect.height/2-h*.23,width:w*.46,height:h*.46};
    const el=makePhysicalFace(card,start,'physical-card sliding-capture');
    const dc=rectCenter(toRect), dx=dc.x-(start.left+start.width/2), dy=dc.y-(start.top+start.height/2);
    const a=el.animate([
      {transform:'translate(0,0) rotate(-3deg)',opacity:.96},
      {transform:`translate(${dx*.5}px,${dy*.5-16}px) rotate(4deg)`,opacity:1},
      {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(.8)`,opacity:.95}
    ],{duration:460,easing:'cubic-bezier(.25,.7,.2,1)',fill:'forwards'});
    await a.finished.catch(()=>{}); el.remove();
  }

  async function concludeTurn(side){
    if(state.winner)return;
    render();
    const actor=state[side];
    const sc=score(actor.captured);
    const actorId=playerIdForLegacySide(side);
    const previous=state.matchContext.lastScoreBySide[actorId];
    state.matchContext.lastScoreBySide[actorId]=sc.total;

    if(reachedNewFinishScore(sc.total,previous)){
      if(side==='human'){ presentation.locked=true; await humanGoStop(sc); return; }
      if(aiShouldGo(sc)){
        actor.go++; actor.lastGoScore=sc.total; showGoCallout('ai'); await sleep(980);
      }else{
        finishGame('ai',sc,'Computer chose STOP.');
        return;
      }
    }

    if(virtualHandCount(actor)===0 || state.deck.length===0){
      await finishNagari(); return;
    }

    await sleep(760);
    state.turn=otherPlayerId(playerIdForLegacySide(side));
    render();
    scheduleTurnStart();
  }

  function scheduleTurnStart(){
    if(TEST_MODE)return;
    if(state.winner)return;
    const side=legacySideForPlayerId(state.turn), actor=state[side];
    if(side==='ai' && actor.bombFreeTurns>0){
      presentation.locked=true;
      setTimeout(()=>executeDeckOnlyTurn(side),760);
      return;
    }
    if(side==='ai'){
      presentation.locked=true;
      setTimeout(aiTurn,820);
    }else{
      // Human Bomb credits are visible blank cards; the player explicitly clicks one.
      presentation.locked=false;
      render();
    }
  }

  function bestAiBombMonth(){
    const counts=countsByMonth(state.ai.hand);
    const months=Object.keys(counts).map(Number).filter(m=>counts[m]===3 && classifyNormalTurn('ai',{cardId:state.ai.hand.find(card=>card.month===m).id}).kind==='bombEligible');
    if(!months.length)return null;
    return months.sort((a,b)=>{
      const av=state.floor.filter(c=>c.month===a).reduce((x,c)=>x+captureValue(c),0);
      const bv=state.floor.filter(c=>c.month===b).reduce((x,c)=>x+captureValue(c),0);
      return bv-av;
    })[0];
  }

  function approximateHumanSource(i=0,total=1){
    const r=els.playerHand.getBoundingClientRect(), {w,h}=cardSize();
    const x=r.left+r.width*(.42+(i-(total-1)/2)*.055);
    return {left:x-w/2,top:r.top+r.height*.35-h/2,width:w,height:h};
  }

  async function chooseBomb(month){
    if(!els.bombDialog)return true;
    els.bombText.textContent=`You hold three ${monthNames[month-1]} cards and the fourth is on the floor. Use BOMB to play all three, take the set, steal 1 Pi, and earn a ×2 win multiplier.`;
    els.bombDialog.showModal();
    return new Promise(resolve=>{ presentation.bombResolver=resolve; });
  }

  async function chooseShake(month){
    if(!els.shakeDialog)return false;
    const cards=state.human.hand.filter(c=>c.month===month);
    const bombReady=state.floor.some(c=>c.month===month) && !floorStackForMonth(month);
    els.shakeText.textContent=bombReady
      ? `You have three ${monthNames[month-1]} cards. Reveal them now to SHAKE for a ×2 win multiplier, or keep them secret so you can use them as a BOMB.`
      : `You have three ${monthNames[month-1]} cards. Reveal them now to SHAKE for a ×2 win multiplier, or keep them secret.`;
    if(els.keepSecretBtn) els.keepSecretBtn.textContent=bombReady?'KEEP SECRET FOR BOMB':'KEEP SECRET';
    els.shakeCards.innerHTML='';
    cards.forEach(c=>els.shakeCards.appendChild(createCardEl(c,'card magnified-card')));
    els.shakeDialog.showModal();
    return new Promise(resolve=>{ presentation.shakeResolver=resolve; });
  }

  async function processOpeningSpecials(){
    if(state.winner)return;
    const opening=resolveOpeningState(state); state=opening.state;
    const chongtong=opening.events.find(event=>event.type==='chongtongDeclared');
    if(chongtong){ presentChongtong(chongtong); return; }

    // Do not interrupt the opening deal with a Shake prompt. A three-of-a-month
    // stays hidden until that player actually tries to use one of those cards.
    // This is both less intrusive and closer to table play: the declaration is
    // made at the moment the triple becomes relevant, not as a startup modal.
    presentation.locked=false; render(); scheduleTurnStart();
  }

  function presentChongtong(event){
    // Preserve the established Solo presentation: only the local-player branch
    // played the Chongtong fanfare before authority extraction.
    if(event.actorId===PLAYER_A)playChongtongFanfare(); presentation.locked=true;
    const playerWon=event.actorId===PLAYER_A;
    const reason=playerWon
      ? `총통! You won because you were dealt all 4 cards from the same month (${monthNames[event.month-1]}).`
      : `총통! Computer won by holding all 4 cards from the same month (${monthNames[event.month-1]}).`;
    const final=event.points*(2**state.matchContext.nagariCarryPower);
    setGrandResult('CHONGTONG!',playerWon?'Player Wins!':'Computer Wins!',`${final} Points`,`${reason}${state.matchContext.nagariCarryPower?` · Nagari ×${2**state.matchContext.nagariCarryPower}`:''}`,'special');
    state.matchContext.nagariCarryPower=0;
    els.resultDialog.showModal(); render();
  }

  async function revealAiShake(month){
    const cards=state.ai.hand.filter(c=>c.month===month);
    if(!cards.length)return;
    const rack=els.aiHand;
    const overlay=document.createElement('div'); overlay.className='ai-shake-reveal';
    cards.forEach(c=>overlay.appendChild(createCardEl(c,'card shake-mini-card')));
    rack.appendChild(overlay);
    await sleep(1050); overlay.remove();
  }


  function rectCenter(r){ return {x:r.left+(r.width||0)/2,y:r.top+(r.height||0)/2}; }
  function cardSize(){
    const cs=getComputedStyle(document.documentElement);
    return {w:parseFloat(cs.getPropertyValue('--card-w'))||78,h:parseFloat(cs.getPropertyValue('--card-h'))||127};
  }
  function approximateAiSource(){ const r=els.aiHand.getBoundingClientRect(); return {left:r.left+r.width*.5-27,top:r.top+r.height*.42-44,width:54,height:88}; }

  async function freeFloorLanding(card){
    const {w,h}=cardSize();
    const slot=reserveFloorSlot(card);
    let slotEl=els.floor.querySelector(`[data-floor-slot="${slot}"]`);
    if(!slotEl){
      renderFloor();
      await nextFrame();
      slotEl=els.floor.querySelector(`[data-floor-slot="${slot}"]`);
    }
    const r=slotEl?.getBoundingClientRect();
    if(!r)return {left:0,top:0,width:w,height:h,rotation:stableFloorTilt(card)};
    return {
      left:r.left+(r.width-w)/2,
      top:r.top+(r.height-h)/2,
      width:w,height:h,rotation:stableFloorTilt(card)
    };
  }

  function overlapLanding(targetCard){
    const targetEl=els.floor.querySelector(`[data-card-id="${targetCard.id}"]`) || presentation.stagedCards.get(targetCard.id);
    if(!targetEl)return null;
    const r=targetEl.getBoundingClientRect(); const sign=Math.random()<.5?-1:1;
    const x=r.width*(0.22+Math.random()*.24)*sign;
    const y=r.height*(-.08+Math.random()*.18);
    return {left:r.left+x,top:r.top+y,width:r.width,height:r.height,rotation:sign*(7+Math.random()*10)};
  }

  function makePhysicalFace(card,rect,className='physical-card'){
    const el=document.createElement('div'); el.className=className; el.dataset.cardId=card.id;
    const img=document.createElement('img'); img.src=artUrl(card.file); img.alt=''; el.appendChild(img); document.body.appendChild(el);
    normalizeFixed(el,rect); return el;
  }
  function normalizeFixed(el,rect){
    el.getAnimations().forEach(a=>a.cancel());
    el.style.position='fixed'; el.style.left=`${rect.left}px`; el.style.top=`${rect.top}px`; el.style.width=`${rect.width}px`; el.style.height=`${rect.height}px`;
    el.style.margin='0'; el.style.transform='none'; el.style.opacity='1'; el.style.zIndex='1160';
  }
  function removeStage(id){ const el=presentation.stagedCards.get(id); if(el){ presentation.stagedCards.delete(id); el.remove(); } }

  function fullSizeSourceRect(sourceRect){
    const {w,h}=cardSize();
    const cx=sourceRect.left+sourceRect.width/2, cy=sourceRect.top+sourceRect.height/2;
    return {left:cx-w/2,top:cy-h/2,width:w,height:h};
  }

  async function animateHandCardSlap(side,card,sourceRect,target){
    // CPU backs are intentionally smaller in the rack, but the card entering play is always full Hwatu size.
    sourceRect=fullSizeSourceRect(sourceRect);
    const el=makePhysicalFace(card,sourceRect,'physical-card moving-card'); presentation.stagedCards.set(card.id,el);
    const landing=target ? overlapLanding(target) : await freeFloorLanding(card);
    if(!landing)return el;
    if(prefersReducedMotion()){ normalizeFixed(el,landing); el.style.transform=`rotate(${landing.rotation}deg)`; return el; }

    const dx=landing.left-sourceRect.left, dy=landing.top-sourceRect.top;
    const sideBias=seatForLegacySide(side)==='bottom'?-1:1;
    const duration=650;
    if(target) setTimeout(()=>playHitSound(1),Math.max(0,duration-58));
    const a=el.animate([
      {transform:'translate(0,0) rotate(0deg) scale(1)',filter:'drop-shadow(0 8px 8px rgba(0,0,0,.32))',offset:0},
      {transform:`translate(0,-30px) rotate(${sideBias*-2}deg) scale(1)`,filter:'drop-shadow(0 22px 16px rgba(0,0,0,.46))',offset:.24},
      {transform:`translate(${dx*.62}px,${dy*.62-54}px) rotate(${landing.rotation*.48}deg) scale(1)`,offset:.70},
      {transform:`translate(${dx}px,${dy-12}px) rotate(${landing.rotation}deg) scale(1)`,offset:.92},
      {transform:`translate(${dx}px,${dy}px) rotate(${landing.rotation}deg) scale(1)`,filter:'drop-shadow(0 10px 9px rgba(0,0,0,.35))',offset:1}
    ],{duration,easing:'cubic-bezier(.22,.72,.17,1)',fill:'forwards'});
    await a.finished.catch(()=>{}); el.getAnimations().forEach(x=>x.cancel()); normalizeFixed(el,landing); el.style.transform=`rotate(${landing.rotation}deg)`;
    impactAt(landing); return el;
  }

  async function animateBombSlap(side,cards,target,sourceRects=[]){
    if(TEST_MODE)return;
    const landingBase=overlapLanding(target);
    if(!landingBase)return;
    const {w,h}=cardSize();
    const targetEl=els.floor.querySelector(`[data-card-id="${target.id}"]`);
    const tr=targetEl?targetEl.getBoundingClientRect():landingBase;
    const starts=cards.map((card,i)=>{
      const src=sourceRects[i] || (seatForLegacySide(side)==='bottom'?approximateHumanSource(i,cards.length):approximateAiSource());
      const full=fullSizeSourceRect(src);
      const el=makePhysicalFace(card,full,'physical-card moving-card bomb-moving-card');
      presentation.stagedCards.set(card.id,el);
      return {card,el,start:full,i};
    });
    if(prefersReducedMotion()){
      starts.forEach(({el,i})=>{
        const land={left:tr.left+(i-1)*9,top:tr.top+(i-1)*5,width:w,height:h};
        normalizeFixed(el,land); el.style.transform=`rotate(${[-12,1,11][i]}deg)`;
      });
      impactAt(tr); return;
    }
    const duration=720;
    const jobs=starts.map(({el,start,i})=>{
      const land={left:tr.left+(i-1)*10,top:tr.top+(i-1)*6,width:w,height:h,rotation:[-13,1,12][i]};
      const dx=land.left-start.left,dy=land.top-start.top;
      return el.animate([
        {transform:'translate(0,0) rotate(0deg) scale(1)',offset:0},
        {transform:`translate(${dx*.55}px,${dy*.55-58}px) rotate(${land.rotation*.45}deg) scale(1.03)`,offset:.68},
        {transform:`translate(${dx}px,${dy-14}px) rotate(${land.rotation}deg) scale(1.03)`,offset:.92},
        {transform:`translate(${dx}px,${dy}px) rotate(${land.rotation}deg) scale(1)`,offset:1}
      ],{duration,easing:'cubic-bezier(.2,.72,.14,1)',fill:'forwards'}).finished.then(()=>{
        el.getAnimations().forEach(a=>a.cancel()); normalizeFixed(el,land); el.style.transform=`rotate(${land.rotation}deg)`;
      }).catch(()=>{});
    });
    setTimeout(()=>playBombSound(),Math.max(0,duration-55));
    await Promise.all(jobs);
    impactAt(tr);
  }

  async function animateDeckLiftFlip(side,card){
    if(TEST_MODE){
      const el={remove(){},getBoundingClientRect(){return {left:0,top:0,width:76,height:123};}};
      presentation.stagedCards.set(card.id,el);
      return el;
    }
    const deck=els.deckStack.getBoundingClientRect(); const {w,h}=cardSize();
    const start={left:deck.left+deck.width/2-w/2,top:deck.top+deck.height/2-h/2,width:w,height:h};
    const el=document.createElement('div'); el.className='physical-card deck-draw-card'; el.dataset.cardId=card.id;
    const inner=document.createElement('div'); inner.className='deck-draw-inner';
    const back=document.createElement('div'); back.className='deck-draw-face deck-draw-back';
    const front=document.createElement('div'); front.className='deck-draw-face deck-draw-front';
    const img=document.createElement('img'); img.src=artUrl(card.file); img.alt=''; front.appendChild(img); inner.append(back,front); el.appendChild(inner); document.body.appendChild(el); normalizeFixed(el,start);
    presentation.stagedCards.set(card.id,el);
    if(prefersReducedMotion()){ inner.style.transform='rotateY(180deg)'; return el; }

    const tableR=els.table.getBoundingClientRect();
    const hover={left:Math.min(tableR.right-w-26,start.left+96),top:Math.max(tableR.top+100,start.top-54),width:w,height:h};
    const dx=hover.left-start.left,dy=hover.top-start.top;
    const lift=el.animate([
      {transform:'translate(0,0) scale(1)',offset:0},
      {transform:'translate(0,-18px) scale(1)',offset:.35},
      {transform:`translate(${dx}px,${dy}px) scale(1)`,offset:1}
    ],{duration:360,easing:'cubic-bezier(.22,.72,.2,1)',fill:'forwards'});
    await lift.finished.catch(()=>{});
    const now=el.getBoundingClientRect(); el.getAnimations().forEach(a=>a.cancel()); normalizeFixed(el,now);
    const flip=inner.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:380,easing:'cubic-bezier(.35,.05,.2,1)',fill:'forwards'});
    await flip.finished.catch(()=>{}); inner.style.transform='rotateY(180deg)'; inner.getAnimations().forEach(a=>a.cancel());
    await sleep(180); return el;
  }

  async function animateStagedSlap(el,card,target,kind='flip'){
    if(TEST_MODE)return;
    const start=el.getBoundingClientRect(); normalizeFixed(el,start);
    const inner=el.querySelector('.deck-draw-inner'); if(inner){inner.style.transform='rotateY(180deg)';}
    const landing=target ? overlapLanding(target) : await freeFloorLanding(card);
    const dx=landing.left-start.left,dy=landing.top-start.top; const duration=500;
    if(prefersReducedMotion()){normalizeFixed(el,landing);el.style.transform=`rotate(${landing.rotation}deg)`;return;}
    if(target) setTimeout(()=>playHitSound(1),Math.max(0,duration-52));
    const a=el.animate([
      {transform:'translate(0,0) rotate(0deg) scale(1)',offset:0},
      {transform:`translate(${dx*.56}px,${dy*.56-42}px) rotate(${landing.rotation*.42}deg) scale(1)`,offset:.58},
      {transform:`translate(${dx}px,${dy-10}px) rotate(${landing.rotation}deg) scale(1)`,offset:.90},
      {transform:`translate(${dx}px,${dy}px) rotate(${landing.rotation}deg) scale(1)`,offset:1}
    ],{duration,easing:'cubic-bezier(.2,.7,.14,1)',fill:'forwards'});
    await a.finished.catch(()=>{}); el.getAnimations().forEach(x=>x.cancel()); normalizeFixed(el,landing); el.style.transform=`rotate(${landing.rotation}deg)`; impactAt(landing);
  }

  function captureTargetRect(side,type){
    const root=seatForLegacySide(side)==='bottom'?els.playerCaptured:els.aiCaptured;
    const group=root.querySelector(`[data-capture-type="${type}"] .capture-stack`) || root.querySelector(`[data-capture-type="${type}"]`) || root;
    return group.getBoundingClientRect();
  }

  function detachFloorCard(card){
    const el=els.floor.querySelector(`[data-card-id="${card.id}"]`); if(!el)return null;
    const r=el.getBoundingClientRect(); const ph=document.createElement('div'); ph.className='floor-slot-proxy'; ph.style.width=`${r.width}px`; ph.style.height=`${r.height}px`;
    el.parentNode.insertBefore(ph,el); document.body.appendChild(el); el.classList.add('physical-card','sliding-capture'); normalizeFixed(el,r); return {el,card,placeholder:ph};
  }


  async function animateCaptureBatch(cards,side){
    const unique=[];
    const seen=new Set();
    cards.filter(Boolean).forEach(c=>{if(!seen.has(c.id)){seen.add(c.id);unique.push(c);}});
    if(TEST_MODE){unique.forEach(card=>presentation.floorSlotReservations.delete(card.id));return;}
    const entries=[];
    unique.forEach(card=>{
      const staged=presentation.stagedCards.get(card.id);
      if(staged) entries.push({el:staged,card,placeholder:null,staged:true});
      else {
        const e=detachFloorCard(card);
        if(e)entries.push({...e,staged:false});
      }
    });
    if(!entries.length)return;
    if(prefersReducedMotion()){
      entries.forEach(e=>{ presentation.stagedCards.delete(e.card.id); e.el.remove(); if(e.placeholder)e.placeholder.remove(); });
      unique.forEach(card=>presentation.floorSlotReservations.delete(card.id));
      return;
    }
    const jobs=entries.map((entry,i)=>new Promise(resolve=>{
      setTimeout(async()=>{
        const start=entry.el.getBoundingClientRect(); normalizeFixed(entry.el,start);
        const dest=captureTargetRect(side,entry.card.type); const dc=rectCenter(dest);
        const target={left:dc.x-start.width*.24,top:dc.y-start.height*.24,width:start.width,height:start.height};
        const dx=target.left-start.left,dy=target.top-start.top;
        const curve=seatForLegacySide(side)==='bottom'?24:-24;
        const a=entry.el.animate([
          {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1,offset:0},
          {transform:`translate(${dx*.48}px,${dy*.48+curve}px) rotate(${i%2?4:-4}deg) scale(.84)`,opacity:1,offset:.48},
          {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(.46)`,opacity:.96,offset:1}
        ],{duration:520,easing:'cubic-bezier(.28,.68,.22,1)',fill:'forwards'});
        await a.finished.catch(()=>{});
        presentation.stagedCards.delete(entry.card.id);
        entry.el.remove(); if(entry.placeholder)entry.placeholder.remove(); resolve();
      },i*70);
    }));
    await Promise.all(jobs);
    // These in-flight cards have left the table. Canonical occupied slots are
    // released by removeFloorCards when the authoritative capture is applied.
    unique.forEach(card=>presentation.floorSlotReservations.delete(card.id));
  }

  async function animateCaptureSlides(playedCard,captured,side,stage){
    await animateCaptureBatch([playedCard,...captured],side);
  }


  function impactAt(rect){
    const ring=document.createElement('div'); ring.className='impact-ring strong'; ring.style.left=`${rect.left+(rect.width||78)/2}px`; ring.style.top=`${rect.top+(rect.height||127)/2}px`; document.body.appendChild(ring); setTimeout(()=>ring.remove(),420);
    els.table.classList.remove('table-thump'); void els.table.offsetWidth; els.table.classList.add('table-thump'); setTimeout(()=>els.table.classList.remove('table-thump'),180);
  }

  const soundSources={
    // Floor hit: CC0 recorded card-on-card contact (BMacZero, Freesound 96127).
    slam:'https://raw.githubusercontent.com/itsent-lab/hwatu/main/apps/web/public/audio/card-contact.mp3',
    // Event cues generated locally for this prototype.
    ppeok:window.GOSTOP_AUDIO_PPEOK,
    laugh:'https://raw.githubusercontent.com/gynura/to_you/main/assets/sound/fx/Evil_Laugh.wav',
    shakeBell:window.GOSTOP_AUDIO_SHAKE,
    chongtongFanfare:window.GOSTOP_AUDIO_FANFARE,
    bomb:'https://raw.githubusercontent.com/gynura/to_you/main/assets/sound/fx/Explosion.wav'
  };
  const audioBases={};
  function unlockAudio(){
    Object.entries(soundSources).forEach(([name,src])=>{
      if(audioBases[name])return;
      const a=new Audio(src);
      a.preload='auto';
      if(src.startsWith('http'))a.crossOrigin='anonymous';
      audioBases[name]=a;
    });
  }
  function playSample(name,volume=1,playbackRate=1,maxMs=0){
    if(!presentation.soundEnabled)return;
    try{
      unlockAudio();
      const base=audioBases[name];
      if(!base)return;
      const a=base.cloneNode(true);
      a.volume=clampVolume(volume);
      a.playbackRate=playbackRate;
      a.play().catch(()=>{});
      if(maxMs>0)setTimeout(()=>{try{a.pause();a.currentTime=0;}catch(_){ }},maxMs);
    }catch(_){ }
  }
  function playHitSound(){
    if(!presentation.soundEnabled)return;
    // Floor impact only: loud, dry card-on-card crack. No pile/deck sounds.
    playSample('slam',1,1);
    playSample('slam',.72,1);
  }
  function playPpeokSound(){ playSample('ppeok',1,1); }
  function playLaughSound(){ playSample('laugh',1,1.65,900); }
  function playShakeSound(){
    [0,260,520].forEach(delay=>setTimeout(()=>playSample('shakeBell',.82,1),delay));
  }
  function playChongtongFanfare(){ playSample('chongtongFanfare',.95,1); }
  function playBombSound(){ playSample('bomb',1,1,1400); }


  function bestAiCard(){
    let best=state.ai.hand[0],bestV=-Infinity;
    for(const c of state.ai.hand){
      const matches=matchesFor(c);
      const immediate=matches.length?captureValue(c)+Math.max(...matches.map(captureValue)):0;
      const deny=matches.reduce((s,x)=>s+humanNeedValue(x),0);
      const flexibility=state.ai.hand.filter(x=>x.month===c.month).length>1?-1.3:.5;
      const v=immediate*1.5+deny*.8+flexibility+Math.random()*.35;
      if(v>bestV){bestV=v;best=c;}
    }
    return best;
  }
  function humanNeedValue(card){
    const hc=state.human.captured;let v=0;
    if(card.type==='bright'&&hc.filter(c=>c.type==='bright').length>=2)v+=8;
    if(card.type==='animal'&&hc.filter(c=>c.type==='animal').length>=4)v+=5;
    if(card.type==='ribbon'&&hc.filter(c=>c.type==='ribbon').length>=4)v+=4;
    if(card.type==='pi'&&score(hc).piCount>=8)v+=4;
    if(card.flags.includes('godori')&&hc.filter(c=>c.flags.includes('godori')).length>=2)v+=9;
    return v;
  }
  function aiShouldGo(sc){
    const human=score(state.human.captured).total,remaining=state.ai.hand.length,lead=sc.total-human,risk=human>=5?2.2:human>=3?1.2:.5;
    return remaining>2&&(lead+sc.total/4-risk+Math.random()*1.2)>3.6;
  }


  function showGoCallout(side){
    if(!els.goCallout)return;
    const seat=seatForLegacySide(side);
    const anchor=seat==='top'?document.querySelector('.opponent-zone'):document.querySelector('.player-zone');
    const r=anchor?anchor.getBoundingClientRect():null;
    els.goCallout.className=`go-callout ${seat==='top'?'go-callout-ai':'go-callout-human'}`;
    if(r){
      els.goCallout.style.left=`${r.left+r.width/2}px`;
      els.goCallout.style.top=seat==='top'?`${r.bottom-20}px`:`${r.top+24}px`;
    }
    els.goCallout.textContent='GO!';
    void els.goCallout.offsetWidth;
    els.goCallout.classList.add('show');
    setTimeout(()=>els.goCallout.classList.remove('show'),900);
  }

  function setGrandResult(call,winnerLabel,scoreText,breakdown,kind='stop'){
    if(els.resultCall){
      els.resultCall.textContent=call;
      els.resultCall.className=`result-call ${kind==='go'?'go-call':kind==='special'?'special-call':'stop-call'}`;
    }
    els.resultTitle.textContent=winnerLabel;
    els.resultScore.textContent=scoreText;
    els.resultBreakdown.textContent=breakdown||'';
  }

  function calculateFinalScore(winnerSide){
    const actor=state[winnerSide];
    const loser=state[winnerSide==='human'?'ai':'human'];
    return engine.calculateSettlement({winner:actor,loser,nagariCarryPower:state.matchContext.nagariCarryPower});
  }

  function formatScoreFormula(settled,{includeFinal=true}={}){
    const parts=[...(settled.formulaSteps||[`Base ${settled.base.total}`])];
    if(includeFinal)parts.push(`Final ${settled.total}`);
    return parts.join('  →  ');
  }

  async function humanGoStop(sc){
    const preview=calculateFinalScore('human');
    els.decisionText.textContent=`${formatScoreFormula(preview)}. STOP takes ${preview.total} points now. GO continues the hand but risks Go-bak.`;
    els.decisionDialog.show();
  }

  async function finishNagari(){
    if(state.winner)return;
    state.winner='nagari'; presentation.locked=true;
    state.matchContext.nagariCarryPower=Math.min(3,state.matchContext.nagariCarryPower+1);
    setGrandResult('NAGARI!','No Winner',`Next Hand ×${2**state.matchContext.nagariCarryPower}`,'No one completed the hand with STOP. The next completed hand carries the Nagari multiplier.','special');
    els.resultDialog.showModal(); render();
  }

  function finishSpecial(winner,points,reason){
    if(state.winner)return;
    state.winner=playerIdForLegacySide(winner); presentation.locked=true;
    const final=points*(2**state.matchContext.nagariCarryPower);
    const specialCall=reason.startsWith('총통!')?'CHONGTONG!':'WIN!';
    setGrandResult(specialCall,winner==='human'?'Player Wins!':'Computer Wins!',`${final} Points`,`${reason}${state.matchContext.nagariCarryPower?` · Nagari ×${2**state.matchContext.nagariCarryPower}`:''}`,'special');
    state.matchContext.nagariCarryPower=0;
    els.resultDialog.showModal(); render();
  }

  function finishByScore(){ finishNagari(); }

  function finishGame(winner,sc,reason){
    if(winner==='draw'){ finishNagari(); return; }
    state.winner=playerIdForLegacySide(winner);presentation.locked=true;hideActionCue();
    const settled=calculateFinalScore(winner);
    const breakdown=formatScoreFormula(settled);
    setGrandResult('STOP!',winner==='human'?'Player Wins!':'Computer Wins!',`${settled.total} Points`,breakdown,'stop');
    state.matchContext.nagariCarryPower=0;
    els.resultDialog.showModal();render();
  }


  function recommendHumanCard(){
    if(!state||state.turn!==PLAYER_A||presentation.locked)return;
    let best=state.human.hand[0],val=-Infinity;
    state.human.hand.forEach(c=>{
      const matches=matchesFor(c),cv=matches.length?captureValue(c)+Math.max(...matches.map(captureValue)):0;
      const combo=(c.flags.includes('godori')?2:0)+(c.ribbonSet?1:0)+(c.type==='bright'?2:0),v=cv*1.4+combo+Math.random()*.1;
      if(v>val){val=v;best=c;}
    });
    presentation.hintCardId=best.id;render();
  }


  function startGame(){
    presentation.queuedHumanCardSwitch=null; presentation.pendingHumanCardId=null; cleanupTargetChoice(); presentation.stagedCards.forEach(el=>el.remove()); presentation.stagedCards.clear(); presentation.floorSlotReservations.clear(); hideActionCue();
    if(presentation.shakeResolver){presentation.shakeResolver(false);presentation.shakeResolver=null;}
    if(presentation.bombResolver){presentation.bombResolver(false);presentation.bombResolver=null;}
    [els.resultDialog,els.decisionDialog,els.shakeDialog,els.bombDialog].filter(Boolean).forEach(d=>{if(d.open)d.close();});
    const nagariCarryPower=state?.matchContext?.nagariCarryPower||0;
    state=freshState(nagariCarryPower);presentation.locked=true;presentation.aiTurnInProgress=false;presentation.hintCardId=null;
    els.roundNo.textContent=presentation.roundNo;render();
    setTimeout(processOpeningSpecials,420);
  }


  document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});
  els.howToBtn.addEventListener('click',()=>els.howToDialog.showModal());
  if(els.railHowTo)els.railHowTo.addEventListener('click',()=>els.howToDialog.showModal());
  if(els.railNewGame)els.railNewGame.addEventListener('click',()=>{presentation.roundNo++;startGame();});
  if(els.soundToggle)els.soundToggle.addEventListener('click',()=>{presentation.soundEnabled=!presentation.soundEnabled;els.soundToggle.querySelector('span').textContent=presentation.soundEnabled?'Sound On':'Sound Off';if(presentation.soundEnabled)unlockAudio();});
  els.newGameBtn.addEventListener('click',()=>{presentation.roundNo++;startGame();});
  els.playAgainBtn.addEventListener('click',()=>{presentation.roundNo++;startGame();});
  els.hintBtn.addEventListener('click',recommendHumanCard);
  els.goBtn.addEventListener('click',()=>{if(!state||state.turn!==PLAYER_A)return;state.human.go++;state.human.lastGoScore=score(state.human.captured).total;els.decisionDialog.close();showGoCallout('human');presentation.locked=true;state.turn=PLAYER_B;render();setTimeout(aiTurn,1150);});
  els.stopBtn.addEventListener('click',()=>{if(!state)return;els.decisionDialog.close();finishGame('human',score(state.human.captured),'You chose STOP.');});


  if(els.shakeBtn)els.shakeBtn.addEventListener('click',()=>{
    if(!presentation.shakeResolver)return;
    const r=presentation.shakeResolver; presentation.shakeResolver=null; els.shakeDialog.close(); r(true);
  });
  if(els.keepSecretBtn)els.keepSecretBtn.addEventListener('click',()=>{
    if(!presentation.shakeResolver)return; const r=presentation.shakeResolver; presentation.shakeResolver=null; els.shakeDialog.close(); r(false);
  });
  if(els.bombBtn)els.bombBtn.addEventListener('click',()=>{
    if(!presentation.bombResolver)return; const r=presentation.bombResolver; presentation.bombResolver=null; els.bombDialog.close(); r(true);
  });
  if(els.playOneBtn)els.playOneBtn.addEventListener('click',()=>{
    if(!presentation.bombResolver)return; const r=presentation.bombResolver; presentation.bombResolver=null; els.bombDialog.close(); r(false);
  });


  if(els.captureDialog)els.captureDialog.addEventListener('click',e=>{
    if(e.target===els.captureDialog)els.captureDialog.close();
  });

  if(els.shakeDialog)els.shakeDialog.addEventListener('cancel',e=>{
    if(presentation.shakeResolver){e.preventDefault();const r=presentation.shakeResolver;presentation.shakeResolver=null;els.shakeDialog.close();r(false);}
  });
  if(els.bombDialog)els.bombDialog.addEventListener('cancel',e=>{
    if(presentation.bombResolver){e.preventDefault();const r=presentation.bombResolver;presentation.bombResolver=null;els.bombDialog.close();r(false);}
  });

  if(TEST_MODE){
    const cloneCard=card=>({...card,flags:[...card.flags]});
    const makeTestPlayer=(overrides={})=>({
      hand:[],captured:[],go:0,shakes:0,bombs:0,bombFreeTurns:0,ppeoks:0,
      hiddenTripleMonths:[],shakenMonths:[],lastGoScore:0,
      ...overrides
    });
    const makeTestState=(overrides={})=>{
      const next={
        deck:[],floor:[],human:makeTestPlayer(),ai:makeTestPlayer(),
        floorStacks:{},turn:PLAYER_A,winner:null,specialWinner:null,
        matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0},
        ...overrides
      };
      if(!next.floorSlotByCard)initFloorSlots(next);
      return next;
    };
    globalThis.GOSTOP_TEST_API=Object.freeze({
      playerIds:Object.freeze({playerA:PLAYER_A,playerB:PLAYER_B}),
      soloViewerId:SOLO_VIEWER_ID,
      otherPlayerId,legacySideForPlayerId,playerIdForLegacySide,
      viewerSeatMap,viewerRelativePlayers,seatForLegacySide,
      monthListHas,monthListAdd,monthListDelete,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,
      masterDeck:()=>MASTER_DECK.map(cloneCard),
      card:id=>cloneCard(MASTER_DECK.find(c=>c.id===id)),
      makePlayer:makeTestPlayer,
      makeState:makeTestState,
      setState(next){state=next;},
      getState(){return state;},
      setNagariCarryPower(value){state.matchContext.nagariCarryPower=value;},
      getNagariCarryPower(){return state.matchContext.nagariCarryPower;},
      setPreviousScores(human,ai){state.matchContext.lastScoreBySide.playerA=human;state.matchContext.lastScoreBySide.playerB=ai;},
      assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,hasFourOfMonth,
      markInitialFloorStacks,initFloorSlots,firstFreeFloorSlot,reserveFloorSlot,
      commitFloorSlot,addFloorCard,removeFloorCards,effectiveFloorMatchCards,expandedTargetCards,
      stackStealCount,makePpeokStack,score,scoreWithGukjinMode,
      calculateFinalScore,resolveSingleCard,resolveCombinedTurn,applySweepIfNeeded,
      stealPiAnimated,consumeBombBlank,canDeclareShake,reachedNewFinishScore,
      executeBombTurn,processOpeningSpecials,finishNagari,concludeTurn,
      stableFloorTilt,stableStackAngle,
      getLocked(){return presentation.locked;},
      getPresentationSnapshot(){
        return {
          floorSlotReservations:Object.fromEntries(presentation.floorSlotReservations),
          stagedCardCount:presentation.stagedCards.size,
          locked:presentation.locked,
          hintCardId:presentation.hintCardId
        };
      }
    });
  }else{
    startGame();
  }
})();
