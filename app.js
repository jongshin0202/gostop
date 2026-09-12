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
    hasFourOfMonth,matchingCards,score,scorePlayer,scoreWithGukjinMode,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,resolveNagari,resolveThreePpeok,
    evaluateGoStop,applyGoStopAction,applyNormalTurnAction,applySpecialTurnAction,applySweepAction,classifyTurnOutcome,isHandExhausted
  }=engine;
  const MASTER_DECK = engine.masterDeck;
  const faceImagePromises=new Map();
  const finishThreshold = 7;
  const PLAYER_A = 'playerA';
  const PLAYER_B = 'playerB';
  const SOLO_VIEWER_ID = PLAYER_A;

  function artUrl(filename) { return COMMONS + encodeURIComponent(filename).replace(/%2F/g,'/'); }
  function preloadCardFace(card){
    if(TEST_MODE)return Promise.resolve();
    if(!faceImagePromises.has(card.id)){
      const image=new Image(); image.src=artUrl(card.file);
      const ready=image.decode?image.decode():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;});
      faceImagePromises.set(card.id,ready.catch(()=>{}));
    }
    return faceImagePromises.get(card.id);
  }
  function preloadCardFaces(){MASTER_DECK.forEach(preloadCardFace);}

  const ids = [
    'playerHand','aiHand','floor','playerCaptured','aiCaptured','deckCount','deckCountTop','deckCorner','roundCorner',
    'playerScore','aiScore','goCount','turnLabel','aiThinking','eventBanner','coachText','promptText','howToBtn','newGameBtn',
    'howToDialog','decisionDialog','decisionText','goBtn','stopBtn','resultDialog','resultTitle','resultScore','resultBreakdown',
    'playAgainBtn','resultCall','goCallout','hintBtn','deckStack','table','roundNo','captureDialog','captureOwner','captureTitle','captureMagnified',
    'captureSummary','actionCue','railHowTo','railNewGame','soundToggle','shakeDialog','shakeText','shakeCards','shakeBtn','keepSecretBtn',
    'bombDialog','bombText','bombBtn','playOneBtn','playerMultiplier','aiMultiplier','firstPpeokDialog','playerSessionStats','aiSessionStats',
    'gukjinDialog','gukjinChoiceCard','gukjinPictureBtn','gukjinSingleBtn','shakeReviewDialog','shakeReviewCards',
    'shakeRevealDialog','shakeRevealTitle','shakeRevealText','shakeRevealCards','firstPoopTitle','firstPoopText',
    'milestoneOverlay','milestoneBirds','milestoneTitle','milestoneCards','languageBtn','languageMenu','openingOverlay','openingDie','openingMessage','stopPreviewValue','scoreDialog','scoreBreakdownContent','resultCards','newGameDialog','newGameYesBtn','newGameNoBtn'
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
    sessionStats:{playerA:{wins:0,points:0},playerB:{wins:0,points:0}},
    milestoneHistory:{playerA:new Set(),playerB:new Set()},
    recordedTerminal:null,
    stagedCards:new Map(),
    floorSlotReservations:new Map(),
    locale:'en', firstHand:true, nextStarterId:null, deckDisplayCount:null,scoreBreakdownPlayerId:null
  };

  const sleep = ms => TEST_MODE ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clampVolume = v => Math.max(0, Math.min(1, v));
  const i18n=globalThis.GoStopI18n;
  function t(key,vars){return i18n?i18n.translate(presentation.locale,key,vars):key;}
  function localizedMonths(){return t('monthNames').split(',');}
  function localizedMonth(month){return localizedMonths()[month-1]||monthNames[month-1];}
  function deckVisualBackCount(count){return count<=0?0:count<=5?count:Math.max(3,Math.ceil(count/4));}
  function computeStageScale(width,height){return Math.min(1,width/1530,Math.max(0.5,(height-76)/900));}
  function updateStageScale(){
    const stage=document.querySelector('.game-stage');if(!stage)return;
    if(innerWidth<=700){stage.style.removeProperty('--stage-scale');stage.style.removeProperty('--scaled-height');stage.style.marginBottom='';return;}
    stage.style.setProperty('--stage-scale','1');
    const header=document.querySelector('.topbar'),availableHeight=Math.max(420,innerHeight-(header?.getBoundingClientRect().height||70)-12);
    const scale=Math.min(1,(innerWidth-20)/Math.max(1,stage.scrollWidth),availableHeight/Math.max(1,stage.scrollHeight));
    stage.style.setProperty('--stage-scale',String(scale));stage.style.marginBottom=`${stage.scrollHeight*(scale-1)}px`;
  }

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
  function monthListAdd(player,field,month){ if(!TEST_MODE)throw new Error('Month-list mutation is characterization-only.');if(!monthListHas(player,field,month))player[field].push(month); }
  function monthListDelete(player,field,month){ if(!TEST_MODE)throw new Error('Month-list mutation is characterization-only.');player[field]=player[field].filter(value=>value!==month); }
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

  function applyGoStopDecision(action){
    const result=applyGoStopAction(state,action); state=result.state; return result;
  }
  function normalAction(side,action){ return {...action,actorId:playerIdForLegacySide(side)}; }
  function classifyNormalTurn(side,details={}){
    return classifyTurnOutcome(state,{actorId:playerIdForLegacySide(side),...details});
  }


  function freshState(nagariCarryPower=0,startingPlayerId=PLAYER_A) {
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
      hand, captured:[], go:0, shakes:0, shakeMultiplier:1, bombs:0, bombFreeTurns:0,
      ppeoks:0, hiddenTripleMonths:[], shakenMonths:[],
      resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0
    });
    let next = {
      deck, floor,
      human:makePlayer(human),
      ai:makePlayer(ai),
      floorStacks:{},
      startingPlayerId,turn:startingPlayerId, winner:null, specialWinner:null,
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
    if(!st.floorSlotByCard||!Number.isFinite(st.floorSlotCount))throw new Error('Canonical floor slots must be initialized with the hand.');
    const used=occupiedFloorSlots(st);
    for(let i=0;i<st.floorSlotCount;i++) if(!used.has(i)) return i;
    let slot=st.floorSlotCount;
    while(used.has(slot))slot++;
    if(commitCapacity){if(!TEST_MODE)throw new Error('Canonical floor capacity is engine-owned after hand creation.');st.floorSlotCount=slot+4;}
    return slot;
  }
  function reserveFloorSlot(card,preferredSlot=null){
    if(!state.floorSlotByCard)throw new Error('Canonical floor slots must be initialized with the hand.');
    if(Number.isFinite(state.floorSlotByCard[card.id]))return state.floorSlotByCard[card.id];
    if(Number.isFinite(presentation.floorSlotReservations.get(card.id)))return presentation.floorSlotReservations.get(card.id);
    const slot=Number.isFinite(preferredSlot)?preferredSlot:firstFreeFloorSlot(state,false);
    presentation.floorSlotReservations.set(card.id,slot);
    return slot;
  }
  function commitFloorSlot(card,preferredSlot=null){
    if(!TEST_MODE)throw new Error('Canonical floor-slot commits are engine-owned after hand creation.');
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
    if(!TEST_MODE)throw new Error('Legacy floor mutation is characterization-only.');
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
    if(!TEST_MODE)throw new Error('Legacy floor mutation is characterization-only.');
    commitFloorSlot(card,preferredSlot);
    if(!state.floor.some(c=>c.id===card.id)) state.floor.push(card);
  }
  function makePpeokStack(side,cards){
    if(!TEST_MODE)throw new Error('Legacy Ppeok mutation is characterization-only.');
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
    btn.classList.add('canonical-card-face');
    const img=createCardFaceImage(card,`GoStop Card, ${monthShort[card.month-1]}`);
    img.addEventListener('error',()=>{ img.alt='Card art unavailable'; btn.classList.add('art-error'); });
    btn.appendChild(img);
    return btn;
  }
  function createCardFaceImage(card,alt=''){
    const img=document.createElement('img'); img.src=artUrl(card.file); img.alt=alt; img.draggable=false; return img;
  }

  function render() {
    if(TEST_MODE)return;
    const view=viewerRelativePlayers(state,SOLO_VIEWER_ID);
    const bottomPlayer=view.bottom.player,topPlayer=view.top.player;
    const bottomScore=scorePlayer(bottomPlayer),topScore=scorePlayer(topPlayer);
    els.playerScore.textContent=bottomScore.total; els.aiScore.textContent=topScore.total;
    if(els.goCount) els.goCount.textContent=bottomPlayer.go;
    const shownDeck=presentation.deckDisplayCount??state.deck.length;
    [els.deckCount,els.deckCountTop,els.deckCorner].filter(Boolean).forEach(el=>el.textContent=shownDeck);
    if(els.deckStack){els.deckStack.replaceChildren();for(let i=0;i<deckVisualBackCount(shownDeck);i++){const back=document.createElement('div');back.className='back-card';back.style.setProperty('--deck-layer',String(i));els.deckStack.appendChild(back);}}
    if(els.roundCorner) els.roundCorner.textContent=presentation.roundNo;
    // Keep the table visually clean: animation itself communicates whose turn it is.
    els.turnLabel.textContent = '';
    els.aiThinking.textContent = '';
    if(els.promptText) els.promptText.textContent='';
    const decisionOwner=state.pendingDecision?.playerId||state.turn;
    document.querySelector('.human-chip')?.classList.toggle('active-turn',decisionOwner===PLAYER_A&&!state.winner);
    document.querySelector('.cpu-chip')?.classList.toggle('active-turn',decisionOwner===PLAYER_B&&!state.winner);
    const stats=id=>`${presentation.sessionStats[id].wins} ${t('wins')} · ${presentation.sessionStats[id].points} ${t('points')}`;
    if(els.playerSessionStats)els.playerSessionStats.textContent=stats(PLAYER_A);
    if(els.aiSessionStats)els.aiSessionStats.textContent=stats(PLAYER_B);

    const existing=new Map([...els.playerHand.querySelectorAll('.hand-card-slot[data-hand-key]')].map(node=>[node.dataset.handKey,node]));
    const desired=[];
    [...bottomPlayer.hand].sort(sortCards).forEach(card=>{
      let slot=existing.get(card.id);let el=slot?.querySelector('.hand-card');
      if(!slot){slot=document.createElement('div');slot.className='hand-card-slot';slot.dataset.handKey=card.id;el=createCardEl(card,'card hand-card');el.addEventListener('click',()=>humanPlay(card.id,el));slot.appendChild(el);}
      el.disabled = presentation.locked || state.turn!==PLAYER_A;
      el.classList.toggle('matchable',card.id===presentation.hintCardId);
      el.classList.toggle('armed-bomb-card',bottomPlayer.armedBombMonths?.includes(card.month));
      desired.push(slot);existing.delete(card.id);
    });
    for(let i=0;i<bottomPlayer.bombFreeTurns;i++){
      const blank=document.createElement('button');
      blank.type='button'; blank.className='card hand-card blank-turn-card';
      blank.setAttribute('aria-label','Use empty Bomb turn and flip from the deck');
      blank.title='Bomb empty turn: click to skip playing a hand card and flip the deck';
      blank.disabled=presentation.locked || state.turn!==PLAYER_A;
      blank.innerHTML='<span aria-hidden="true">—</span>';
      blank.addEventListener('click',humanUseBombBlank);
      const slot=document.createElement('div'); slot.className='hand-card-slot';slot.dataset.handKey=`blank-${i}`; slot.appendChild(blank); desired.push(slot);
    }
    existing.forEach(node=>node.remove());desired.forEach(node=>els.playerHand.appendChild(node));

    els.aiHand.innerHTML='';
    topPlayer.hand.forEach(()=>{ const d=document.createElement('div'); d.className='mini-back'; els.aiHand.appendChild(d); });

    renderFloor();

    renderShakeIndicator(els.playerMultiplier,bottomPlayer,view.bottom.id);
    renderShakeIndicator(els.aiMultiplier,topPlayer,view.top.id);
    renderGoIndicator(document.querySelector('.human-chip'),bottomPlayer);
    renderGoIndicator(document.querySelector('.cpu-chip'),topPlayer);

    renderCaptured(els.playerCaptured,bottomPlayer.captured,view.bottom.id);
    renderCaptured(els.aiCaptured,topPlayer.captured,view.top.id);
  }


  function playerDoubleLabel(player){
    const multiplier=player.shakeMultiplier>1?player.shakeMultiplier:2**player.shakes;
    return multiplier>1 ? `${t('shake')} ×${multiplier}` : '';
  }
  function renderShakeIndicator(element,player,playerId){
    if(!element)return;
    element.textContent=playerDoubleLabel(player);
    const reviewable=player.revealedShakeSets?.length>0;
    element.classList.toggle('reviewable',reviewable);
    element.tabIndex=reviewable?0:-1;
    element.setAttribute('role',reviewable?'button':'status');
    element.setAttribute('aria-label',reviewable?`${element.textContent}; review revealed cards`:'');
    element.onclick=reviewable?()=>openShakeReview(playerId):null;
    element.onkeydown=reviewable?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openShakeReview(playerId);}}:null;
  }
  function goCountLabel(player){return player.go>0?t('currentGo',{count:player.go}).replace(/^[^:：]*[:：]\s*/,''):'';}
  function renderGoIndicator(chip,player){
    if(!chip)return;
    let badge=chip.querySelector('.go-count-badge');
    if(!badge){
      const holder=document.createElement('span'); holder.className='status-badges';
      const shake=chip.querySelector('.multiplier-chip'); if(shake)holder.appendChild(shake);
      badge=document.createElement('span');badge.className='go-count-badge';holder.appendChild(badge);chip.appendChild(holder);
    }
    badge.textContent=goCountLabel(player);
  }

  function renderFloor(){
    els.floor.innerHTML='';
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
    {type:'bright',key:'brights',en:'Brights'},
    {type:'animal',key:'pictures',en:'Pictures'},
    {type:'ribbon',key:'stripes',en:'Stripes'},
    {type:'pi',key:'singles',en:'Singles'}
  ];

  function renderCaptured(root,cards,ownerId){
    root.innerHTML=''; root.dataset.owner=ownerId;
    const isViewer=ownerId===SOLO_VIEWER_ID;
    captureGroups.forEach(group=>{
      const owner=playerStateById(state,ownerId);
      const groupCards=cards.filter(c=>(c.month===9&&c.flags.includes('switchPi'))?(owner.gukjinMode==='pi'?'pi':'animal')===group.type:c.type===group.type).sort((a,b)=>a.month-b.month);
      const btn=document.createElement('button'); btn.type='button'; btn.className='capture-group'; btn.dataset.captureType=group.type;
      btn.setAttribute('aria-label',`${isViewer?t('yourCaptured'):t('computerCaptured')}: ${t(group.key)} ${groupCards.length}`);
      const head=document.createElement('span'); head.className='capture-group-head';
      const displayedCount=group.type==='pi'?scorePlayer(owner).piCount:groupCards.length;
      head.innerHTML=`<b>${t(group.key)}</b><em>${displayedCount}</em>`;
      const stack=document.createElement('span'); stack.className='capture-stack';
      groupCards.forEach((c,i)=>{
        const img=document.createElement('img'); img.className='captured-mini'; img.src=artUrl(c.file); img.alt='';
        img.title=`${monthShort[c.month-1]} ${c.type}`; img.style.zIndex=String(i+1); stack.appendChild(img);
        if((c.flags.includes('doublePi')||(c.id==='m9-1'&&owner.gukjinMode==='pi'))){const badge=document.createElement('span');badge.className='double-single-badge';badge.textContent='×2';stack.appendChild(badge);}
        if(isViewer&&c.id==='m9-1'){
          img.classList.add('gukjin-review-card'); img.tabIndex=0; img.setAttribute('role','button');
          img.setAttribute('aria-label','Change how to use the Sake Cup');
          const review=event=>{event.stopPropagation();openGukjinChoice(false);};
          img.addEventListener('click',review); img.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();review(event);}});
        }
      });
      if(!groupCards.length){ const empty=document.createElement('span'); empty.className='capture-empty'; empty.textContent='—'; stack.appendChild(empty); }
      btn.append(head,stack); btn.addEventListener('click',()=>openCapturedGroup(ownerId,group,groupCards)); root.appendChild(btn);
    });
  }

  function openCapturedGroup(ownerId,group,cards){
    const isViewer=ownerId===SOLO_VIEWER_ID;
    els.captureOwner.textContent=isViewer?t('yourCaptured'):t('computerCaptured');
    els.captureTitle.textContent=t(group.key); els.captureMagnified.innerHTML='';
    cards.forEach(c=>els.captureMagnified.appendChild(createCardEl(c,'card magnified-card')));
    if(!cards.length){ const empty=document.createElement('div'); empty.className='magnified-empty'; empty.textContent=t('noCards'); els.captureMagnified.appendChild(empty); }
    const s=scorePlayer(playerStateById(state,ownerId));
    const detail=group.type==='pi'?`${s.piCount} ${t('singlesValue')} (${cards.length} ${t('physicalCards')})`:`${cards.length} ${t(group.key)}${s.godori&&group.type==='animal'?` · ${t('birdies')}`:''}`;
    els.captureSummary.textContent=detail;
    if(!els.captureDialog.open)els.captureDialog.showModal();
  }
  function effectiveCapturedGroup(player,group){
    return player.captured.filter(card=>(card.month===9&&card.flags.includes('switchPi'))?(player.gukjinMode==='pi'?'pi':'animal')===group.type:card.type===group.type);
  }
  function scoreBreakdownData(playerId){
    const player=playerStateById(state,playerId),scored=scorePlayer(player);
    const groups=captureGroups.map(group=>({label:t(group.key),type:group.type,points:group.type==='bright'?scored.brightPts:group.type==='animal'?scored.animalPts:group.type==='ribbon'?scored.ribbonPts:scored.piPts,cards:effectiveCapturedGroup(player,group).map(card=>({id:card.id,double:card.flags.includes('doublePi')||(card.id==='m9-1'&&player.gukjinMode==='pi')}))}));
    return {playerId,total:scored.total,singlesValue:scored.piCount,physicalSingles:groups.find(group=>group.type==='pi').cards.length,firstPoopBonus:player.firstPpeokPoints||0,groups};
  }
  function openScoreBreakdown(playerId){
    presentation.scoreBreakdownPlayerId=playerId;
    const data=scoreBreakdownData(playerId);els.scoreBreakdownContent.replaceChildren();
    const total=document.createElement('strong');total.className='breakdown-total';total.textContent=`${data.total} ${t('points')}`;els.scoreBreakdownContent.appendChild(total);
    data.groups.forEach(group=>{const section=document.createElement('section'),heading=document.createElement('h3'),note=document.createElement('p'),cards=document.createElement('div');heading.textContent=group.label;note.textContent=`${group.points} ${t('points')}${group.type==='pi'?` · ${data.singlesValue} ${t('singlesValue')} · ${data.physicalSingles} ${t('physicalCards')}`:''}`;cards.className='breakdown-cards';group.cards.forEach(item=>{const holder=document.createElement('span');holder.appendChild(createCardEl(MASTER_DECK.find(card=>card.id===item.id),'card'));if(item.double){const badge=document.createElement('b');badge.textContent='×2';holder.appendChild(badge);}cards.appendChild(holder);});section.append(heading,note,cards);els.scoreBreakdownContent.appendChild(section);});
    if(data.firstPoopBonus){const bonus=document.createElement('p');bonus.textContent=`${t('firstPoopBonus')} +${data.firstPoopBonus} ${t('points')}`;els.scoreBreakdownContent.appendChild(bonus);}
    if(!els.scoreDialog.open)els.scoreDialog.showModal();
  }
  async function promptGukjinChoice(side,events){
    const revealed=events.some(event=>(event.cards||event.cardIds||[]).some(card=>(typeof card==='string'?card:card.id)==='m9-1'));
    if(side!=='human'||!revealed||!state.human.captured.some(card=>card.id==='m9-1'))return;
    await openGukjinChoice(true);
  }
  function openGukjinChoice(waitForChoice=false){
    const gukjin=state.human.captured.find(card=>card.id==='m9-1');
    if(!gukjin)return Promise.resolve();
    els.gukjinChoiceCard.innerHTML=''; els.gukjinChoiceCard.appendChild(createCardEl(gukjin,'card magnified-card'));
    if(!els.gukjinDialog.open)els.gukjinDialog.showModal();
    return waitForChoice?new Promise(resolve=>els.gukjinDialog.addEventListener('close',resolve,{once:true})):Promise.resolve();
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
    if(attempted.pendingDecision?.type==='bombDecision'){
      await executeBombTurn('human',card.month); return;
    }
    if(attempted.pendingDecision?.type==='shakeDecision'){
      const shake=await chooseShake(card.month);
      if(shake){
        const declared=applyNormalAction(normalAction('human',{type:'declareShake'}));
        await presentShakeDeclaration(declared.events);
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
          await presentShakeDeclaration(declared.events);
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
    await promptGukjinChoice(side,result.events);
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
    await presentSemanticEvents(completion.events);
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
      playPpeokSound(); render(); await showSpecialTransient('POOPED!',result.events.find(event=>event.type==='ppeokFormed')?.cardIds||[]);
      if(result.events.some(event=>event.type==='firstPpeokAwarded'))await showFirstPoopNotice(side);
      if(result.events.some(event=>event.type==='threePpeokDeclared')){
        await sleep(450); presentThreePpeok(result);
      }
    }else{
      for(const event of result.events){
        if(event.type==='cardsCaptured'){
          const captured=event.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id));
          await animateCaptureBatch(captured,side);
          if(classification.kind==='jjokCandidate'){playKissSound();await showSpecialTransient('KISS!',event.cardIds,'kiss');}
          if(classification.kind==='ttadakCandidate'){playTapTapSound();await showSpecialTransient('FLUSH!',event.cardIds,'flush');}
        }else if(event.type==='cardLanded'){
          presentation.floorSlotReservations.delete(event.cardId); removeStage(event.cardId); await sleep(180);
        }else if(event.type==='piTransferred'){
          const card=MASTER_DECK.find(item=>item.id===event.cardId);
          await animatePiTransfer(card,legacySideForPlayerId(event.fromPlayerId),side);
        }
      }
      render(); await sleep(190);
      await promptGukjinChoice(side,result.events);
      await presentSemanticEvents(result.events);
    }
    if(state.pendingTurn?.phase==='awaitingTurnCompletion')applyNormalAction(normalAction(side,{type:'completeTurn'}));
  }

  async function playFullTurn(side, playedCard, sourceRect, target, playMatchCount){
    const playedStage=await animateHandCardSlap(side,playedCard,sourceRect,target);
    await sleep(330);

    if(!state.deck.length){
      const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
      applyNormalAction(normalAction(side,{type:'drawNextCard'}));
      const classification=classifyNormalTurn(side);
      if(classification.kind==='normal')await resolveNormalEngineTurn(side,play,null);
      else if(['selfPpeokCandidate','floorStackInteraction'].includes(classification.kind))await resolveExtractedSpecialTurn(side,classification,play,null);
      else throw new Error(`Unhandled authoritative turn classification: ${classification.kind}`);
      await concludeTurn(side);
      return;
    }

    const drawResult=applyNormalAction(normalAction(side,{type:'drawNextCard'}));
    const draw=drawResult.events.find(event=>event.type==='deckCardRevealed').card;
    let turnClassification=classifyNormalTurn(side);
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

    if(drawTarget&&state.pendingTurn?.drawn?.matchIds.includes(drawTarget.id)&&state.pendingTurn.drawn.targetId!==drawTarget.id){
      applyNormalAction(normalAction(side,{type:'chooseFloorTarget',source:'drawn',targetId:drawTarget.id}));
      turnClassification=classifyNormalTurn(side);
    }

    await animateStagedSlap(deckStage,draw,drawTarget,'flip');
    const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
    const drawn={card:draw,stage:deckStage,target:drawTarget,matchCount:drawMatchCount};
    const extractedSpecial=['ppeokSsaDaCandidate','selfPpeokCandidate','jjokCandidate','ttadakCandidate','floorStackInteraction'];
    if(turnClassification.kind==='normal')await resolveNormalEngineTurn(side,play,drawn);
    else if(extractedSpecial.includes(turnClassification.kind))await resolveExtractedSpecialTurn(side,turnClassification,play,drawn);
    else throw new Error(`Unhandled authoritative turn classification: ${turnClassification.kind}`);
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
      if(classification.kind==='floorStackInteraction')await resolveExtractedSpecialTurn(side,classification,null,{card:draw,stage,target,matchCount:matches.length});
      else throw new Error(`Unhandled authoritative deck-only classification: ${classification.kind}`);
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
    if(!TEST_MODE)throw new Error('Legacy combined-turn mutation is characterization-only.');
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
        const terminal=resolveThreePpeok(state,{actorId:playerIdForLegacySide(side)}); state=terminal.state;
        if(terminal.events.some(event=>event.type==='threePpeokDeclared')){
          await sleep(450); presentThreePpeok(terminal);
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
    if(!TEST_MODE)throw new Error('Legacy single-card mutation is characterization-only.');
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
    await presentSemanticEvents(result.events);
  }

  async function stealPiAnimated(side,count){
    if(!TEST_MODE)throw new Error('Legacy Pi mutation is characterization-only.');
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
    await presentNewMilestones(playerIdForLegacySide(side));
    render();
    if(state.pendingDecision?.type==='openingTripleDecision'){await processOpeningSpecials();return;}
    const actorId=playerIdForLegacySide(side);
    const actor=state[side];
    if(side==='ai'&&actor.captured.some(card=>card.id==='m9-1')){
      const mode=score(actor.captured,'pi').total>score(actor.captured,'animal').total?'pi':'animal';
      if(actor.gukjinMode!==mode)applyNormalAction({type:'setGukjinMode',actorId,mode});
    }
    let result=evaluateGoStop(state,{actorId}); state=result.state;
    if(result.autoStop){ presentStopResult(result); return; }
    if(result.pendingDecision){
      const sc=scorePlayer(state[side]);
      if(side==='human'){ presentation.locked=true; await humanGoStop(sc); return; }
      const action={type:aiShouldGo(sc)?'declareGo':'declareStop',actorId};
      result=applyGoStopDecision(action);
      if(action.type==='declareGo'){
        if(result.events.some(event=>event.type==='goDeclared'))showGoCallout('ai');
        await sleep(980);
      }else{
        presentStopResult(result); return;
      }
    }

    if(result.requiresNagari){
      await finishNagari(); return;
    }

    await sleep(760);
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
    els.bombText.textContent=`${localizedMonth(month)} — ${t('bomb')}`;
    els.bombDialog.showModal();
    return new Promise(resolve=>{ presentation.bombResolver=resolve; });
  }

  async function chooseShake(month){
    if(!els.shakeDialog)return false;
    const cards=state.human.hand.filter(c=>c.month===month);
    const bombReady=state.floor.some(c=>c.month===month) && !floorStackForMonth(month);
    els.shakeText.textContent=`${localizedMonth(month)} — ${t('shake')} / ${bombReady?t('bomb'):t('keepBomb')}`;
    if(els.keepSecretBtn) els.keepSecretBtn.textContent=t('keepBomb');
    els.shakeCards.innerHTML='';
    cards.forEach(c=>els.shakeCards.appendChild(createCardEl(c,'card magnified-card')));
    els.shakeDialog.showModal();
    return new Promise(resolve=>{ presentation.shakeResolver=resolve; });
  }

  async function chooseOpeningTriple(decision){
    const cards=decision.cardIds.map(id=>state.human.hand.find(card=>card.id===id)).filter(Boolean);
    els.shakeText.textContent=decision.floorCardId
      ? `${localizedMonth(decision.month)}: ${t('shake')} / ${t('bomb')}`
      : `${localizedMonth(decision.month)}: ${t('shake')} / ${t('keepBomb')}`;
    els.keepSecretBtn.textContent=decision.floorCardId?t('bomb'):t('keepBomb');
    els.shakeCards.innerHTML=''; cards.forEach(card=>els.shakeCards.appendChild(createCardEl(card,'card magnified-card')));
    els.shakeDialog.showModal();
    return new Promise(resolve=>{presentation.shakeResolver=resolve;});
  }

  async function processOpeningSpecials(){
    if(state.winner)return;
    if(state.pendingDecision?.type!=='openingTripleDecision'){
      const opening=resolveOpeningState(state); state=opening.state;
      const chongtong=opening.events.find(event=>event.type==='chongtongDeclared');
      if(chongtong){ presentChongtong(chongtong); return; }
    }
    while(state.pendingDecision?.type==='openingTripleDecision'){
      const decision=state.pendingDecision;
      if(decision.playerId===PLAYER_A){
        const shake=await chooseOpeningTriple(decision);
        if(shake){
          const result=applyNormalAction({type:'declareShake',actorId:PLAYER_A});
          await presentShakeDeclaration(result.events);
        }else if(decision.floorCardId){
          applyNormalAction({type:'declareBomb',actorId:PLAYER_A});
        }else applyNormalAction({type:'keepShakeSecret',actorId:PLAYER_A});
      }else{
        const shake=!decision.floorCardId&&Math.random()<.72;
        if(shake){
          const result=applyNormalAction({type:'declareShake',actorId:PLAYER_B});
          await presentShakeDeclaration(result.events);
        }else if(decision.floorCardId){applyNormalAction({type:'declareBomb',actorId:PLAYER_B});}
        else applyNormalAction({type:'keepShakeSecret',actorId:PLAYER_B});
      }
    }
    presentation.locked=false; render(); scheduleTurnStart();
  }

  function presentChongtong(event){
    // Preserve the established Solo presentation: only the local-player branch
    // played the Chongtong fanfare before authority extraction.
    if(event.actorId===PLAYER_A)playChongtongFanfare(); presentation.locked=true;
    const playerWon=event.actorId===PLAYER_A;
    const reason=`${playerWon?t('player'):t('computer')}: ${t('conquer')} — ${localizedMonth(event.month)}`;
    const terminal=state.terminalResult;
    recordTerminalResult(terminal);
    if(els.resultCards&&typeof els.resultCards.replaceChildren==='function'){els.resultCards.replaceChildren();event.cardIds?.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.resultCards.appendChild(createCardEl(card,'card')));}
    setGrandResult(t('conquer'),playerWon?t('playerWins'):t('computerWins'),`${terminal.finalPoints} ${t('points')}`,`${reason}${terminal.nagariCarryPower?` · ${t('noWinnerCarry')} ×${terminal.multiplier}`:''}`,'special');
    els.resultDialog.showModal(); render();
  }

  async function presentShakeDeclaration(events){
    const event=events.find(item=>item.type==='shakeDeclared');
    if(!event)return;
    playShakeSound(); render();
    const cards=event.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean);
    if(event.actorId===PLAYER_B){
      els.shakeRevealTitle.textContent=t('computerShakes');
      els.shakeRevealText.textContent=t('shakeAck');
      els.shakeRevealCards.innerHTML=''; cards.forEach(card=>els.shakeRevealCards.appendChild(createCardEl(card,'card magnified-card')));
      els.shakeRevealDialog.showModal();
      await new Promise(resolve=>els.shakeRevealDialog.addEventListener('close',resolve,{once:true}));
      return;
    }
    await showSpecialTransient(t('shake'),event.cardIds);
  }

  function openShakeReview(playerId){
    const player=playerStateById(state,playerId);
    els.shakeReviewCards.innerHTML='';
    player.revealedShakeSets.forEach((set,index)=>{
      const group=document.createElement('section'),label=document.createElement('strong'),cards=document.createElement('div');label.textContent=`${playerId===PLAYER_A?t('player'):t('computer')} — ${t('shake')} ${index+1}`;cards.className='shake-cards';set.cardIds.forEach(id=>{const card=MASTER_DECK.find(item=>item.id===id);if(card)cards.appendChild(createCardEl(card,'card magnified-card'));});group.append(label,cards);els.shakeReviewCards.appendChild(group);
    });
    els.shakeReviewDialog.showModal();
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
    const r=targetEl.getBoundingClientRect(),size=cardSize(),sign=Math.random()<.5?-1:1;
    const center=rectCenter(r),x=size.w*(0.22+Math.random()*.24)*sign,y=size.h*(-.08+Math.random()*.18);
    return {left:center.x-size.w/2+x,top:center.y-size.h/2+y,width:size.w,height:size.h,rotation:sign*(7+Math.random()*10)};
  }

  function makePhysicalFace(card,rect,className='physical-card'){
    const el=document.createElement('div'); el.className=`${className} canonical-card-face`; el.dataset.cardId=card.id;
    el.appendChild(createCardFaceImage(card)); document.body.appendChild(el);
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
    // CPU backs are intentionally smaller in the rack, but the card entering play is always full GoStop Card size.
    sourceRect=fullSizeSourceRect(sourceRect);
    document.querySelectorAll(`[data-card-id="${card.id}"]`).forEach(node=>{node.style.visibility='hidden';});
    await preloadCardFace(card);
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
    await Promise.all(cards.map(preloadCardFace));
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
    await preloadCardFace(card);
    const deck=els.deckStack.getBoundingClientRect(); const {w,h}=cardSize();
    const start={left:deck.left+deck.width/2-w/2,top:deck.top+deck.height/2-h/2,width:w,height:h};
    const el=document.createElement('div'); el.className='physical-card deck-draw-card'; el.dataset.cardId=card.id;
    const inner=document.createElement('div'); inner.className='deck-draw-inner';
    const back=document.createElement('div'); back.className='deck-draw-face deck-draw-back';
    const front=document.createElement('div'); front.className='deck-draw-face deck-draw-front canonical-card-face';
    front.appendChild(createCardFaceImage(card)); inner.append(back,front); el.appendChild(inner); document.body.appendChild(el); normalizeFixed(el,start);
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
    const r=el.getBoundingClientRect(),size=cardSize(),center=rectCenter(r);
    const ph=document.createElement('div'); ph.className='floor-slot-proxy'; ph.style.width=`${r.width}px`; ph.style.height=`${r.height}px`;
    el.parentNode.insertBefore(ph,el); el.style.visibility='hidden';
    const flight=makePhysicalFace(card,{left:center.x-size.w/2,top:center.y-size.h/2,width:size.w,height:size.h},'physical-card capture-flight-card sliding-capture');
    return {el:flight,card,placeholder:ph,sourceEl:el};
  }


  async function animateCaptureBatch(cards,side){
    const unique=[];
    const seen=new Set();
    cards.filter(Boolean).forEach(c=>{if(!seen.has(c.id)){seen.add(c.id);unique.push(c);}});
    if(TEST_MODE){unique.forEach(card=>presentation.floorSlotReservations.delete(card.id));return;}
    const entries=[];
    unique.forEach(card=>{
      const staged=presentation.stagedCards.get(card.id);
      if(staged){staged.classList.add('capture-flight-card');entries.push({el:staged,card,placeholder:null,staged:true});}
      else {
        const e=detachFloorCard(card);
        if(e)entries.push({...e,staged:false});
      }
    });
    if(!entries.length)return;
    if(prefersReducedMotion()){
      entries.forEach(e=>{ presentation.stagedCards.delete(e.card.id); e.el.remove(); if(e.sourceEl)e.sourceEl.remove(); if(e.placeholder)e.placeholder.remove(); });
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
        entry.el.remove(); if(entry.sourceEl)entry.sourceEl.remove(); if(entry.placeholder)entry.placeholder.remove(); resolve();
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
  function playPpeokSound(){
    playProceduralNoise('poop');
  }
  function synthNotes(notes){
    if(!presentation.soundEnabled)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),now=c.currentTime;notes.forEach(([delay,freq,duration])=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;o.type='triangle';g.gain.setValueAtTime(.18,now+delay);g.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);o.connect(g).connect(c.destination);o.start(now+delay);o.stop(now+delay+duration);});setTimeout(()=>c.close(),1200);}catch(_){ }
  }
  function playProceduralNoise(kind){
    if(!presentation.soundEnabled)return;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),length=Math.floor(c.sampleRate*(kind==='flush'?1.5:.55)),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);let seed=0x51f15e;for(let i=0;i<length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const fade=1-i/length;data[i]=(((seed>>>0)/0xffffffff)*2-1)*fade;}const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();filter.type=kind==='kiss'?'bandpass':'lowpass';filter.frequency.setValueAtTime(kind==='poop'?180:kind==='flush'?1400:900,c.currentTime);if(kind==='flush')filter.frequency.exponentialRampToValueAtTime(110,c.currentTime+1.45);gain.gain.value=kind==='poop'?.42:.22;source.buffer=buffer;source.connect(filter).connect(gain).connect(c.destination);source.start();source.onended=()=>c.close();}catch(_){ }
  }
  function playTapTapSound(){playProceduralNoise('flush');}
  function playKissSound(){playProceduralNoise('kiss');}
  function playSweepSound(){playProceduralNoise('sweep');}
  function playBirdSound(){synthNotes([[0,1600,.12],[.25,1900,.1],[.5,1450,.14],[.8,2100,.1],[1.15,1750,.14]]);}
  function playSadResultSound(){synthNotes([[0,330,.22],[.23,294,.22],[.46,262,.22],[.69,196,.5]]);}
  function playLaughSound(){/* Pooped-pile capture is intentionally silent. */}
  function playShakeSound(){
    [0,260,520].forEach(delay=>setTimeout(()=>playSample('shakeBell',.82,1),delay));
  }
  function playChongtongFanfare(){ playSample('chongtongFanfare',.95,1); }
  function playBombSound(){ playSample('bomb',1,1,1400); }

  async function showSpecialTransient(title,cardIds=[],effect=''){
    if(!els.milestoneOverlay)return;
    const titleKeys={'POOPED!':'pooped','KISS!':'kiss','FLUSH!':'tapTap','CLEAN SWEEP!':'cleanSweep','5-BIRDIES!':'birdies','3-STRIPES!':'threeStripes','5-BRIGHTS!':'fiveBrights'};
    title=t(titleKeys[title]||title);
    els.milestoneTitle.textContent=title;els.milestoneCards.innerHTML='';els.milestoneBirds.innerHTML='';els.milestoneOverlay.dataset.effect=effect;
    cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.milestoneCards.appendChild(createCardEl(card,'card')));
    els.milestoneOverlay.classList.add('show');els.milestoneOverlay.setAttribute('aria-hidden','false');await sleep(2000);els.milestoneOverlay.classList.remove('show');els.milestoneOverlay.setAttribute('aria-hidden','true');
  }
  async function presentSemanticEvents(events){
    for(const event of events){
      if(event.type==='sweepTriggered'){playSweepSound();await showSpecialTransient('CLEAN SWEEP!',event.cardIds||[],'sweep');}
    }
  }

  function detectNewMilestones(playerId){
    const player=playerStateById(state,playerId),history=presentation.milestoneHistory[playerId],found=[];
    const add=(key,titleKey,cards,birds=false)=>{if(cards.length&&!history.has(key)){history.add(key);found.push({key,titleKey,cardIds:cards.map(card=>card.id),birds});}};
    const godori=[2,4,8].map(month=>player.captured.find(card=>card.month===month&&card.flags.includes('godori'))).filter(Boolean);
    if(godori.length===3)add('godori','birdies',godori,true);
    for(const [set,months] of Object.entries({red:[1,2,3],blue:[6,9,10],grass:[4,5,7]})){
      const cards=months.map(month=>player.captured.find(card=>card.month===month&&card.ribbonSet===set)).filter(Boolean);
      if(cards.length===3)add(`stripes-${set}`,'threeStripes',cards);
    }
    const brights=player.captured.filter(card=>card.type==='bright');
    if(brights.length>=5)add('five-brights','fiveBrights',brights.slice(0,5));
    return found;
  }
  async function presentNewMilestones(playerId){
    for(const milestone of detectNewMilestones(playerId)){
      els.milestoneTitle.textContent=t(milestone.titleKey); els.milestoneCards.innerHTML=''; els.milestoneBirds.innerHTML='';
      milestone.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.milestoneCards.appendChild(createCardEl(card,'card')));
      if(milestone.birds)for(let index=0;index<5;index++){const bird=document.createElement('span');bird.textContent='🐦';els.milestoneBirds.appendChild(bird);}
      if(milestone.birds)playBirdSound();
      els.milestoneOverlay.classList.add('show'); els.milestoneOverlay.setAttribute('aria-hidden','false');
      await sleep(2000);
      els.milestoneOverlay.classList.remove('show'); els.milestoneOverlay.setAttribute('aria-hidden','true');
      await sleep(120);
    }
  }


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
  function aiGoStopDecision(view,sc){
    const me=view.ai,opponent=view.human;
    const opponentScore=scorePlayer({captured:opponent.captured,gukjinMode:opponent.gukjinMode||'animal',firstPpeokPoints:opponent.firstPpeokPoints||0}).total;
    const remaining=me.hand.length+(me.bombFreeTurns||0),lead=sc.total-opponentScore;
    const publicThreat=opponentScore>=5||opponent.captured.filter(card=>card.type==='bright').length>=2;
    return remaining>=2&&!publicThreat&&(lead>=4||sc.total>=12);
  }
  function aiShouldGo(sc){
    return aiGoStopDecision(engine.projectStateForViewer(state,PLAYER_B),sc);
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
    if(call!==t('conquer')&&els.resultCards&&typeof els.resultCards.replaceChildren==='function')els.resultCards.replaceChildren();
  }

  function calculateFinalScore(winnerSide){
    const actor=state[winnerSide];
    const loser=state[winnerSide==='human'?'ai':'human'];
    return engine.calculateSettlement({winner:actor,loser,nagariCarryPower:state.matchContext.nagariCarryPower});
  }

  function formatScoreFormula(settled,{includeFinal=true}={}){
    const englishLabel=step=>step
      .replace('First Ppeok','First Poop')
      .replace('Meong-bak',t('picturePenalty'))
      .replace('Pi-bak',t('singlePenalty'))
      .replace('Gwang-bak',t('brightPenalty'))
      .replace('Go-bak',t('goPenalty'))
      .replace('Nagari carry',t('noWinnerCarry'));
    const parts=(settled.formulaSteps||[`Base ${settled.base.total}`]).map(englishLabel);
    if(includeFinal)parts.push(`Final ${settled.total}`);
    return parts.join('  →  ');
  }

  async function humanGoStop(sc){
    const preview=calculateFinalScore('human');
    els.decisionText.textContent=`${t('currentGo',{count:state.human.go})}. ${formatScoreFormula(preview)}.`;
    if(els.stopPreviewValue)els.stopPreviewValue.textContent=t('stopValue',{points:preview.total});
    els.goBtn.textContent=state.human.go===0?t('go'):`${state.human.go+1} ${t('go')}`;
    els.decisionDialog.show();
  }

  function presentStopResult(result){
    const ended=result.events.find(event=>event.type==='handEnded');
    if(!ended)return;
    const side=legacySideForPlayerId(ended.winnerId);
    recordTerminalResult(state.terminalResult);
    presentation.locked=true; hideActionCue();
    setGrandResult(`${t('stop')}!`,side==='human'?t('playerWins'):t('computerWins'),`${ended.settlement.total} ${t('points')}`,formatScoreFormula(ended.settlement),'stop');
    if(side==='human')playChongtongFanfare();else playSadResultSound();
    els.resultDialog.showModal(); render();
  }

  async function finishNagari(){
    if(state.winner)return;
    const result=resolveNagari(state,{actorId:state.turn}); state=result.state;
    const event=result.events.find(item=>item.type==='nagariDeclared');
    recordTerminalResult(state.terminalResult);
    presentation.locked=true;
    setGrandResult(t('noWinner'),'',`${t('points')} ×${event.nextHandMultiplier}`,t('noWinnerHelp'),'special');
    els.resultDialog.showModal(); render();
  }

  function presentThreePpeok(result){
    const event=result.events.find(item=>item.type==='threePpeokDeclared');
    if(!event)return;
    const terminal=state.terminalResult;
    const side=legacySideForPlayerId(event.actorId);
    recordTerminalResult(terminal);
    presentation.locked=true;
    setGrandResult(t('triplePoop'),side==='human'?t('playerWins'):t('computerWins'),`${terminal.finalPoints} ${t('points')}`,`${t('triplePoop')}${terminal.nagariCarryPower?` · ${t('noWinnerCarry')} ×${terminal.multiplier}`:''}`,'special');
    els.resultDialog.showModal(); render();
  }

  function finishByScore(){ finishNagari(); }

  function recordTerminalResult(terminal){
    if(!terminal)return;
    const key=`${presentation.roundNo}:${terminal.type}:${terminal.winnerId||'none'}`;
    if(presentation.recordedTerminal===key)return;
    presentation.recordedTerminal=key;
    presentation.nextStarterId=terminal.winnerId||state.startingPlayerId;
    if(terminal.winnerId){
      presentation.sessionStats[terminal.winnerId].wins++;
      presentation.sessionStats[terminal.winnerId].points+=terminal.finalPoints??terminal.score??terminal.settlement?.total??0;
    }
  }
  function resetSession(){
    presentation.sessionStats={playerA:{wins:0,points:0},playerB:{wins:0,points:0}};
    presentation.roundNo=1; presentation.recordedTerminal=null;presentation.firstHand=true;presentation.nextStarterId=null;
  }
  function confirmNewGame(accepted){
    if(!accepted){if(els.newGameDialog?.open)els.newGameDialog.close();return false;}
    if(els.newGameDialog?.open)els.newGameDialog.close();resetSession();startGame();return true;
  }
  function showFirstPoopNotice(side){
    if(!els.firstPpeokDialog)return Promise.resolve();
    els.firstPoopTitle.textContent=t('firstPoop');
    els.firstPoopText.textContent=`${side==='human'?t('you'):t('computer')}: ${t('firstPoopBonus')} +7 ${t('points')}`;
    els.firstPpeokDialog.showModal();
    return new Promise(resolve=>els.firstPpeokDialog.addEventListener('close',resolve,{once:true}));
  }
  function setLocale(locale){
    presentation.locale=i18n?.dictionaries?.[locale]?locale:'en';
    try{localStorage.setItem('gostop-language',presentation.locale);}catch(_){ }
    document.documentElement.lang=presentation.locale;
    if(els.languageBtn)els.languageBtn.textContent=`${i18n.names[presentation.locale]} ▾`;
    document.querySelectorAll('[data-i18n]').forEach(node=>{let vars={};try{vars=JSON.parse(node.dataset.i18nVars||'{}');}catch(_){ }node.textContent=t(node.dataset.i18n,vars);});
    document.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.i18nAria)));
    renderTutorialCards();
    if(els.scoreDialog?.open&&presentation.scoreBreakdownPlayerId)openScoreBreakdown(presentation.scoreBreakdownPlayerId);
    if(els.decisionDialog?.open&&state)humanGoStop(scorePlayer(state.human));
    if(state)render();
  }
  function setupLanguageMenu(){
    if(!els.languageBtn||!els.languageMenu||!i18n)return;
    Object.entries(i18n.names).forEach(([locale,name])=>{const button=document.createElement('button');button.type='button';button.textContent=name;button.addEventListener('click',()=>{setLocale(locale);els.languageMenu.hidden=true;});els.languageMenu.appendChild(button);});
    els.languageBtn.addEventListener('click',()=>{els.languageMenu.hidden=!els.languageMenu.hidden;});
    document.addEventListener('pointerdown',event=>{if(!els.languageMenu.hidden&&!els.languageMenu.contains(event.target)&&event.target!==els.languageBtn)els.languageMenu.hidden=true;});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')els.languageMenu.hidden=true;});
    try{presentation.locale=localStorage.getItem('gostop-language')||'en';}catch(_){presentation.locale='en';}
    setLocale(presentation.locale);
  }
  function renderTutorialCards(){
    if(TEST_MODE)return;
    document.querySelectorAll('.tutorial-cards[data-card-ids]').forEach(root=>{if(root.childElementCount)return;root.dataset.cardIds.split(',').map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>root.appendChild(createCardEl(card,'card tutorial-game-card')));});
    const monthGuide=document.getElementById('monthGuide');
    if(monthGuide){monthGuide.replaceChildren();for(let month=1;month<=12;month++){const article=document.createElement('article'),heading=document.createElement('h4'),description=document.createElement('p'),cards=document.createElement('div');heading.textContent=localizedMonth(month);description.textContent=t(`month${month}`);cards.className='tutorial-cards';MASTER_DECK.filter(card=>card.month===month).forEach(card=>cards.appendChild(createCardEl(card,'card tutorial-game-card')));article.append(heading,cards,description);monthGuide.appendChild(article);}}
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


  async function presentOpeningSequence(starter,roll){
    if(TEST_MODE)return;
    els.openingOverlay.classList.add('show');els.openingOverlay.setAttribute('aria-hidden','false');
    els.openingMessage.textContent='';els.openingDie.hidden=!roll;
    if(roll){els.openingDie.classList.add('rolling');playDiceSound();let face=0;const timer=setInterval(()=>{els.openingDie.textContent=face++%2?'P':'C';},90);await sleep(900);clearInterval(timer);els.openingDie.classList.remove('rolling');els.openingDie.textContent=starter===PLAYER_A?'P':'C';}
    els.openingMessage.textContent=t('goesFirst',{player:starter===PLAYER_A?t('player'):t('computer')});await sleep(650);els.openingDie.hidden=true;await sleep(250);
    presentation.deckDisplayCount=48;render();playShuffleSound();await sleep(480);
    for(let count=47;count>=20;count--){presentation.deckDisplayCount=count;render();playDealSound(count);await sleep(34);}
    presentation.deckDisplayCount=null;els.openingOverlay.classList.remove('show');els.openingOverlay.setAttribute('aria-hidden','true');
  }
  function playShuffleSound(){synthNotes(Array.from({length:12},(_,i)=>[i*.025,180+i*17,.045]));}
  function playDiceSound(){synthNotes(Array.from({length:9},(_,i)=>[i*.1,110+i*13,.08]));}
  function playDealSound(index){if(index%2===0)synthNotes([[0,230+(index%5)*18,.035]]);}
  async function startGame(){
    presentation.queuedHumanCardSwitch=null; presentation.pendingHumanCardId=null; cleanupTargetChoice(); presentation.stagedCards.forEach(el=>el.remove()); presentation.stagedCards.clear(); presentation.floorSlotReservations.clear(); hideActionCue();
    if(presentation.shakeResolver){presentation.shakeResolver(false);presentation.shakeResolver=null;}
    if(presentation.bombResolver){presentation.bombResolver(false);presentation.bombResolver=null;}
    [els.resultDialog,els.decisionDialog,els.shakeDialog,els.bombDialog].filter(Boolean).forEach(d=>{if(d.open)d.close();});
    const nagariCarryPower=state?.matchContext?.nagariCarryPower||0;
    const roll=presentation.firstHand;
    const starter=presentation.nextStarterId||(roll?(secureRandomInt(2)===0?PLAYER_A:PLAYER_B):(state?.startingPlayerId||PLAYER_A));
    state=freshState(nagariCarryPower,starter);presentation.locked=true;presentation.aiTurnInProgress=false;presentation.hintCardId=null;presentation.recordedTerminal=null;
    presentation.milestoneHistory={playerA:new Set(),playerB:new Set()};
    els.roundNo.textContent=presentation.roundNo;render();
    await presentOpeningSequence(starter,roll);presentation.firstHand=false;
    await processOpeningSpecials();
  }


  document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});
  if(!TEST_MODE){addEventListener('resize',updateStageScale);updateStageScale();}
  setupLanguageMenu();
  document.querySelector('.human-chip .score-pill')?.addEventListener('click',()=>openScoreBreakdown(PLAYER_A));
  document.querySelector('.cpu-chip .score-pill')?.addEventListener('click',()=>openScoreBreakdown(PLAYER_B));
  if(els.scoreDialog)els.scoreDialog.addEventListener('click',event=>{if(event.target===els.scoreDialog)els.scoreDialog.close();});
  els.howToBtn.addEventListener('click',()=>els.howToDialog.showModal());
  els.howToDialog.addEventListener('click',event=>{if(event.target===els.howToDialog)els.howToDialog.close();});
  if(els.shakeReviewDialog)els.shakeReviewDialog.addEventListener('click',()=>els.shakeReviewDialog.close());
  if(els.railHowTo)els.railHowTo.addEventListener('click',()=>els.howToDialog.showModal());
  if(els.railNewGame)els.railNewGame.addEventListener('click',()=>els.newGameDialog.showModal());
  if(els.soundToggle)els.soundToggle.addEventListener('click',()=>{presentation.soundEnabled=!presentation.soundEnabled;els.soundToggle.querySelector('span').textContent=presentation.soundEnabled?'Sound On':'Sound Off';if(presentation.soundEnabled)unlockAudio();});
  els.newGameBtn.addEventListener('click',()=>els.newGameDialog.showModal());
  els.newGameYesBtn.addEventListener('click',()=>confirmNewGame(true));
  els.newGameNoBtn.addEventListener('click',()=>confirmNewGame(false));
  els.playAgainBtn.addEventListener('click',()=>{presentation.roundNo++;startGame();});
  const chooseGukjinMode=mode=>{
    applyNormalAction({type:'setGukjinMode',actorId:PLAYER_A,mode});
    els.gukjinDialog.close(); render();
  };
  els.gukjinPictureBtn.addEventListener('click',()=>chooseGukjinMode('animal'));
  els.gukjinSingleBtn.addEventListener('click',()=>chooseGukjinMode('pi'));
  els.hintBtn.addEventListener('click',recommendHumanCard);
  els.goBtn.addEventListener('click',()=>{
    if(!state||state.turn!==PLAYER_A)return;
    const result=applyGoStopDecision({type:'declareGo',actorId:PLAYER_A});
    els.decisionDialog.close();
    if(result.events.some(event=>event.type==='goDeclared'))showGoCallout('human');
    presentation.locked=true; render();
    if(result.requiresNagari)setTimeout(finishNagari,0); else setTimeout(scheduleTurnStart,1150);
  });
  els.stopBtn.addEventListener('click',()=>{
    if(!state||state.turn!==PLAYER_A)return;
    const result=applyGoStopDecision({type:'declareStop',actorId:PLAYER_A});
    els.decisionDialog.close(); presentStopResult(result);
  });


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
      hand:[],captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,
      hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0,
      ...overrides
    });
    const makeTestState=(overrides={})=>{
      const next={
        deck:[],floor:[],human:makeTestPlayer(),ai:makeTestPlayer(),
        floorStacks:{},startingPlayerId:PLAYER_A,turn:PLAYER_A,winner:null,specialWinner:null,
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
      monthListHas,monthListAdd,monthListDelete,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,resolveNagari,resolveThreePpeok,
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
      stackStealCount,makePpeokStack,score,scoreWithGukjinMode,formatScoreFormula,goCountLabel,detectNewMilestones,deckVisualBackCount,computeStageScale,aiGoStopDecision,
      calculateFinalScore,resolveSingleCard,resolveCombinedTurn,applySweepIfNeeded,
      stealPiAnimated,consumeBombBlank,canDeclareShake,reachedNewFinishScore,
      executeBombTurn,processOpeningSpecials,finishNagari,concludeTurn,confirmNewGame,
      stableFloorTilt,stableStackAngle,shuffle,
      getLocked(){return presentation.locked;},
      getPresentationSnapshot(){
        return {
          floorSlotReservations:Object.fromEntries(presentation.floorSlotReservations),
          stagedCardCount:presentation.stagedCards.size,
          locked:presentation.locked,
          hintCardId:presentation.hintCardId,
          firstHand:presentation.firstHand,
          sessionStats:JSON.parse(JSON.stringify(presentation.sessionStats))
        };
      }
    });
  }else{
    preloadCardFaces();
    startGame();
  }
})();
