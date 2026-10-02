(() => {
  'use strict';

  // Characterization tests opt in before this script loads. Production never
  // sets this flag, so the browser startup and gameplay path remain unchanged.
  const TEST_MODE = globalThis.GOSTOP_TEST_MODE === true;

  const COMMONS = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';
  const engine = globalThis.GoStopEngine;
  if(!engine)throw new Error('GoStopEngine must load before app.js.');
  const authorityApi=globalThis.GoStopSessionAuthority;
  if(!TEST_MODE&&!authorityApi)throw new Error('GoStopSessionAuthority must load before app.js.');
  const {
    assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,
    hasFourOfMonth,matchingCards,score,scorePlayer,scoreWithGukjinMode,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,resolveNagari,resolveThreePpeok,
    evaluateGoStop,applyGoStopAction,applyNormalTurnAction,applySpecialTurnAction,applySweepAction,classifyTurnOutcome,isHandExhausted
  }=engine;
  const MASTER_DECK = engine.masterDeck;
  const faceImagePromises=new Map();
  const finishThreshold = 7;
  const PLAYER_A = 'playerA';
  const PLAYER_B = 'playerB';
  const SOLO_VIEWER_ID = PLAYER_A;
  const CARD_FAMILY_NAMES=Object.freeze({
    1:'Pine',2:'Plum',3:'Cherry',4:'Vine',5:'Iris',6:'Rose',
    7:'Bush',8:'Hill',9:'Daisy',10:'Star',11:'Berry',12:'Willow'
  });
  function cardFamilyName(month){return CARD_FAMILY_NAMES[month]||('Family '+month);}
  function cardRibbonName(value){return value==='red'?'Red':value==='blue'?'Blue':value==='grass'?'Plain':'';}
  function cardDisplayName(card){
    if(!card)return 'card';
    const family=cardFamilyName(card.month);
    if(card.id==='m9-1'&&card.flags?.includes('switchPi'))return family+' Sake Cup';
    if(card.type==='bright')return family+' Bright';
    if(card.type==='ribbon')return [family,cardRibbonName(card.ribbonSet),'Stripe'].filter(Boolean).join(' ');
    if(card.flags?.includes('doublePi'))return family+' 2x Single';
    if(card.flags?.includes('godori'))return family+' Bird Picture';
    if(card.type==='animal')return family+' Picture';
    return family+' Single';
  }

  function onlineValueForViewer(value,viewerId){
    const swapId=item=>item===PLAYER_A?PLAYER_B:item===PLAYER_B?PLAYER_A:item;
    const remap=item=>Array.isArray(item)?item.map(remap):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,remap(entry)])):viewerId===PLAYER_B?swapId(item):item;
    return remap(value);
  }

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
    'cardMotionLayer','playerHand','aiHand','floor','playerCaptured','aiCaptured','deckCount','deckCountTop','deckCorner','roundCorner',
    'playerScore','aiScore','goCount','turnLabel','aiThinking','eventBanner','coachText','promptText','howToBtn','newGameBtn',
    'howToDialog','decisionDialog','decisionText','goBtn','stopBtn','resultDialog','resultTitle','resultScore','resultBreakdown',
    'playAgainBtn','resultQuitBtn','resultCall','goCallout','hintBtn','deckStack','table','roundNo','captureDialog','captureOwner','captureTitle','captureMagnified',
    'captureSummary','actionCue','railHowTo','railNewGame','soundToggle','shakeDialog','shakeText','shakeTrainingReason','shakeCards','shakeBtn','keepSecretBtn',
    'bombDialog','bombText','bombTrainingReason','bombCards','bombBtn','playOneBtn','playerMultiplier','aiMultiplier','firstPpeokDialog','playerSessionStats','aiSessionStats',
    'gukjinDialog','gukjinChoiceCard','gukjinTrainingReason','gukjinPictureBtn','gukjinSingleBtn','shakeReviewDialog','shakeReviewCards',
    'shakeRevealDialog','shakeRevealTitle','shakeRevealText','shakeRevealCards','firstPoopTitle','firstPoopText',
    'milestoneOverlay','milestoneBirds','milestoneTitle','milestoneCards','languageBtn','languageMenu','openingOverlay','openingDie','openingMessage','soloStartOverlay','playSoloBtn','trainingModeBtn','trainingCoachPanel','trainingCoachTitle','trainingCoachText','trainingCoachDismiss','stopPreviewValue','scoreDialog','scoreBreakdownContent','resultCards','newGameDialog','newGameYesBtn','newGameNoBtn','optionsMenu','optionsNewGameBtn','optionsQuitBtn','replayWaitingDialog','newGameWaitingDialog','cancelNewGameBtn','incomingNewGameDialog','acceptNewGameBtn','rejectNewGameBtn','quitConfirmDialog','quitConfirmTitle','quitConfirmMessage','quitYesBtn','quitNoBtn','opponentEndedDialog','opponentEndedTitle','opponentEndedOkBtn','playerInfoOverlay','playerInfoPopover','playerInfoAvatar','playerInfoName','playerInfoSession','playerInfoWallet','playerInfoPoints','playerInfoStatus'
  ];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

  let state = null;
  const ONLINE_SESSION_FLOW_ACTIONS=new Set(['playAgainReady','requestNewGame','respondNewGame','cancelNewGame','quitGame']);
  const onlineHandSourceRects=new Map();
  function canSubmitPlayAgain(snapshot){return !!snapshot?.terminalResult;}
  function isOnlineSessionFlowAction(action){return ONLINE_SESSION_FLOW_ACTIONS.has(action?.type);}
  function rememberOnlineHandSource(cardId,source){
    const rect=source?.getBoundingClientRect?.()||source;
    if(!rect||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite))return null;
    const saved={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
    onlineHandSourceRects.clear();onlineHandSourceRects.set(cardId,saved);return {...saved};
  }
  function takeOnlineHandSource(cardId){const rect=onlineHandSourceRects.get(cardId)||null;onlineHandSourceRects.delete(cardId);return rect&&{...rect};}
  function hasUnpresentedLocalHandMovement(incomingState,presentationEvents=[]){
    if(presentationEvents.length||!onlineHandSourceRects.size)return false;
    const incomingIds=new Set((incomingState?.human?.hand||[]).map(card=>card.id));
    return [...onlineHandSourceRects.keys()].some(cardId=>!incomingIds.has(cardId));
  }
  const onlineActions=new Map();
  const onlineActionSubmittedAt=new Map();
  let onlineMode=false,onlinePendingCardId=null,onlineLastEvents=[],onlineSubmit=()=>null,onlinePlayAgain=()=>false,onlineQuitFromResult=false,latestOnlineSnapshot=null;
  const soloAuthority=!TEST_MODE?authorityApi.createSessionAuthority({trustedRuntime:true}):null;
  let soloMatchId=null,soloRevision=0,soloActionSequence=0;
  let localGameGeneration=0,localGameActive=false;
  let gameplayPresentationEpoch=0,gameplayPresentationActive=false;
  function isLocalGamePresentationCurrent(generation=localGameGeneration){return TEST_MODE||onlineMode||(localGameActive&&generation===localGameGeneration);}
  function isGameplayPresentationCurrent(epoch=gameplayPresentationEpoch){return TEST_MODE||(gameplayPresentationActive&&epoch===gameplayPresentationEpoch);}
  const presentation = {
    roundNo:1,
    locked:false,
    hintCardId:null,
    soundEnabled:true,
    targetChoiceCleanup:null,
    targetChoice:null,
    pendingHumanCardId:null,
    queuedHumanCardSwitch:null,
    blankTurnInFlight:false,
    shakeResolver:null,
    bombResolver:null,
    aiTurnInProgress:false,
    sessionStats:{playerA:{wins:0,points:0},playerB:{wins:0,points:0}},
    milestoneHistory:{playerA:new Set(),playerB:new Set()},
    recordedTerminal:null,
    stagedCards:new Map(),
    floorSlotReservations:new Map(),
    locale:'en', sessionStarted:false, nextStarterId:null, deckDisplayCount:null,scoreBreakdownPlayerId:null,
    trainingMode:false,trainingHintTimer:null,trainingWarningFloorCardId:null,trainingRecommendedFloorCardId:null,trainingTurnRecommendation:null,trainingOpeningPinned:false,
    dicePresentationCount:0,diceSoundCount:0,kissSoundCount:0,piTransferAnimationCount:0,audioTrace:[],activeHoveredHandCardId:null,activePhysicalMotions:0,rendersDuringPhysicalMotion:0,goCalloutTimer:null
  };

  function beginGameplayPresentation(){gameplayPresentationActive=true;return ++gameplayPresentationEpoch;}
  function closeAllGameplayPresentationUi(){
    if(TEST_MODE)return;
    document.querySelectorAll('dialog[open]:not(.ranked-flow-dialog):not(.gostop-account-dialog):not(.gostop-request-dialog)').forEach(dialog=>{try{dialog.close();}catch(_){ }});
    document.querySelectorAll('.milestone-overlay.show,.opening-overlay.show,.go-callout.show').forEach(node=>{node.classList.remove('show');if(node.hasAttribute('aria-hidden'))node.setAttribute('aria-hidden','true');});
    hideActionCue();
  }
  function invalidateGameplayPresentation(){
    gameplayPresentationActive=false;gameplayPresentationEpoch++;
    if(presentation.shakeResolver){const resolve=presentation.shakeResolver;presentation.shakeResolver=null;resolve(false);}
    if(presentation.bombResolver){const resolve=presentation.bombResolver;presentation.bombResolver=null;resolve(false);}
    resetHandPresentationState();
    closeAllGameplayPresentationUi();
  }
  function showGameplayModal(dialog,epoch=gameplayPresentationEpoch){
    if(!dialog||!isGameplayPresentationCurrent(epoch))return false;
    if(!dialog.open)dialog.showModal();
    return true;
  }
  function showGameplayDialog(dialog,epoch=gameplayPresentationEpoch){
    if(!dialog||!isGameplayPresentationCurrent(epoch))return false;
    if(!dialog.open)dialog.show();
    return true;
  }
  function publishPlayerActivity(active,mode='',twoPlayer=false){
    if(TEST_MODE)return;
    globalThis.dispatchEvent(new CustomEvent('gostop-player-activity',{detail:{active:!!active,mode:String(mode||''),twoPlayer:!!twoPlayer}}));
  }

  const sleep = ms => TEST_MODE ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  const PRESENTATION_PACING=Object.freeze({handToDeck:330,deckReveal:180,cardLandCleanup:180,postCapture:190});
  const performanceLite=()=>globalThis.GOSTOP_PERFORMANCE_LITE===true||document.documentElement.classList.contains('gostop-performance-lite');
  const motionDuration=ms=>performanceLite()?Math.max(110,Math.round(ms*.58)):ms;
  const presentationPause=key=>sleep(performanceLite()?Math.max(65,Math.round(PRESENTATION_PACING[key]*.55)):PRESENTATION_PACING[key]);
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clampVolume = v => Math.max(0, Math.min(1, v));
  const i18n=globalThis.GoStopI18n;
  function t(key,vars){return i18n?i18n.translate(presentation.locale,key,vars):key;}
  function localizedMonth(month){return cardFamilyName(month);}
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

  function closePlayerInfo(){
    if(els.playerInfoOverlay)els.playerInfoOverlay.hidden=true;
  }
  function positionPlayerInfo(chip,seat){
    if(!chip||!els.playerInfoPopover||!els.playerInfoOverlay||els.playerInfoOverlay.hidden)return;
    const rect=chip.getBoundingClientRect(),pop=els.playerInfoPopover.getBoundingClientRect(),pad=12;
    let left=rect.left+rect.width/2-pop.width/2;left=Math.max(pad,Math.min(innerWidth-pop.width-pad,left));
    let top=seat==='player'?rect.top-pop.height-12:rect.bottom+12;
    if(top<pad)top=rect.bottom+12;
    if(top+pop.height>innerHeight-pad)top=Math.max(pad,rect.top-pop.height-12);
    els.playerInfoPopover.style.left=`${Math.round(left)}px`;els.playerInfoPopover.style.top=`${Math.round(top)}px`;
  }
  function openPlayerInfo(chip){
    if(!chip||!els.playerInfoOverlay)return;
    const seat=chip.dataset.playerInfo||'player',identity=chip.querySelector('.player-identity'),component=chip.closest('.player-status-component');
    const name=identity?.querySelector('strong')?.textContent?.trim()|| (seat==='player'?t('you'):t('computer'));
    const session=identity?.querySelector('.session-stats')?.textContent?.trim()||'';
    const wallet=identity?.querySelector('.ranked-wallet-line')?.textContent?.trim()||'';
    const score=chip.querySelector('.score-pill b')?.textContent?.trim()||'0';
    const avatar=chip.querySelector('.avatar')?.textContent?.trim()|| (seat==='player'?'YOU':'OPP');
    const statuses=[component?.querySelector('.multiplier-chip')?.textContent?.trim(),component?.querySelector('.go-count-badge')?.textContent?.trim(),identity?.querySelector('#turnLabel,#aiThinking')?.textContent?.trim()].filter(Boolean);
    els.playerInfoAvatar.textContent=avatar;els.playerInfoName.textContent=name;els.playerInfoSession.textContent=session;
    els.playerInfoWallet.textContent=wallet;els.playerInfoWallet.hidden=!wallet;
    els.playerInfoPoints.textContent=`${score} ${t('points')}`;
    els.playerInfoStatus.textContent=statuses.join(' · ');els.playerInfoStatus.hidden=!statuses.length;
    els.playerInfoPopover.dataset.seat=seat;els.playerInfoOverlay.hidden=false;
    requestAnimationFrame(()=>positionPlayerInfo(chip,seat));
  }
  function setupPlayerInfoPopovers(){
    for(const chip of document.querySelectorAll('.player-chip[data-player-info]')){
      chip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openPlayerInfo(chip);});
      chip.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();event.stopPropagation();openPlayerInfo(chip);});
    }
    els.playerInfoOverlay?.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();closePlayerInfo();});
    globalThis.addEventListener?.('resize',closePlayerInfo,{passive:true});globalThis.addEventListener?.('scroll',closePlayerInfo,{passive:true,capture:true});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!els.playerInfoOverlay?.hidden)closePlayerInfo();});
  }
  setupPlayerInfoPopovers();

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
    if(onlineMode)throw new Error('Online authoritative actions must use the WebSocket authority.');
    if(!TEST_MODE)return submitSoloAction(action);
    const result=applyNormalTurnAction(state,action);
    state=result.state;
    return result;
  }
  function applySpecialAction(action){
    if(onlineMode)throw new Error('Online authoritative actions must use the WebSocket authority.');
    if(!TEST_MODE)return submitSoloAction(action);
    const result=applySpecialTurnAction(state,action);
    state=result.state;
    return result;
  }

  function applyGoStopDecision(action){
    if(onlineMode)throw new Error('Online authoritative actions must use the WebSocket authority.');
    if(!TEST_MODE)return submitSoloAction(action);
    const result=applyGoStopAction(state,action); state=result.state; return result;
  }
  function submitSoloAction(action){
    const playerId=action.actorId;
    const response=soloAuthority.submitAction({matchId:soloMatchId,playerId,actionId:`solo-${++soloActionSequence}`,expectedRevision:soloRevision,action:Object.fromEntries(Object.entries(action).filter(([key])=>key!=='actorId'))});
    soloRevision=response.revision;
    state=soloAuthority.readTrustedState(soloMatchId);
    return {...response,events:response.events,pendingDecision:state.pendingDecision||null,state};
  }
  function normalAction(side,action){ return {...action,actorId:playerIdForLegacySide(side)}; }
  function classifyNormalTurn(side,details={}){
    return classifyTurnOutcome(state,{actorId:playerIdForLegacySide(side),...details});
  }


  function freshState(nagariCarryPower=0,startingPlayerId=PLAYER_A) {
    if(!TEST_MODE){
      if(soloMatchId&&state?.terminalResult){
        const created=soloAuthority.createNewHand({matchId:soloMatchId,startingPlayerId});
        soloRevision=created.revision;
        return soloAuthority.readTrustedState(soloMatchId);
      }
      soloMatchId=`solo-${Date.now().toString(36)}-${(++soloActionSequence).toString(36)}`;
      const created=soloAuthority.createMatch({matchId:soloMatchId,playerIds:[PLAYER_A,PLAYER_B],gameMode:'solo',startingPlayerId,nagariCarryPower});
      soloRevision=created.revision;
      const next=soloAuthority.readTrustedState(soloMatchId);
      logShuffleAudit(soloMatchId,next);
      return next;
    }
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
    if(st.source==='ppeok') return 1;
    return 0;
  }

  function createCardEl(card, className='card') {
    const btn = document.createElement(className.includes('hand-card')?'button':'div');
    if(btn.tagName==='BUTTON') btn.type='button';
    btn.className=className;
    btn.dataset.cardId=card.id;
    btn.dataset.month=card.month;
    btn.title=cardDisplayName(card);
    btn.classList.add('canonical-card-face');
    const img=createCardFaceImage(card,cardDisplayName(card));
    img.addEventListener('error',()=>{ img.alt='Card art unavailable'; btn.classList.add('art-error'); });
    btn.appendChild(img);
    return btn;
  }
  function createCardFaceImage(card,alt=''){
    const img=document.createElement('img'); img.src=artUrl(card.file); img.alt=alt; img.draggable=false; return img;
  }

  const RANKED_ACTION_LOCK_TIMEOUT_MS=3500;
  function clearRankedActionLock(actionId=null){
    const session=globalThis.goStopOnlineSession,id=String(actionId||session?.pendingActionId||'');
    if(id){onlineActions.delete(id);onlineActionSubmittedAt.delete(id);}
    if(session&&(!id||session.pendingActionId===id))session.pendingActionId=null;
    if(!id||!onlineActions.size){
      onlinePendingCardId=null;
      els.playerHand?.querySelectorAll?.('.pending-card')?.forEach?.(node=>node.classList.remove('pending-card'));
    }
  }
  function repairOrphanedRankedPendingAction(){
    const session=globalThis.goStopOnlineSession,pendingActionId=session?.pendingActionId;
    if(!pendingActionId)return false;
    if(!onlineActions.has(pendingActionId)){clearRankedActionLock(pendingActionId);return true;}
    const submittedAt=onlineActionSubmittedAt.get(pendingActionId);
    if(Number.isFinite(submittedAt)&&Date.now()-submittedAt>=RANKED_ACTION_LOCK_TIMEOUT_MS){
      clearRankedActionLock(pendingActionId);
      try{session.sync?.();}catch(_){}
      return true;
    }
    return false;
  }
  function rankedHandTurnAvailable(){
    if(!onlineMode)return false;
    repairOrphanedRankedPendingAction();
    const session=globalThis.goStopOnlineSession,snapshot=latestOnlineSnapshot,flow=snapshot?.sessionFlow;
    const blocked=!!(flow?.ended||flow?.replayReady?.you||flow?.newGameRequest||flow?.opponentReconnectUntil||els.quitConfirmDialog?.open);
    const connected=session?.socket?.readyState===(globalThis.WebSocket?.OPEN??1);
    if(!connected||blocked)return false;
    if(globalThis.GoStopOnline?.viewerCanInteract?.(snapshot,{connected:true,pendingActionId:null,blocked:false}))return true;
    const localPlayable=!!state&&state.openingSpecialsComplete===true&&state.turn===PLAYER_A&&!state.winner&&!state.pendingTurn&&!state.pendingDecision&&Array.isArray(state.human?.hand)&&state.human.hand.length>0;
    if(localPlayable)return true;
    if(snapshot?.nextAction)return false;
    return false;
  }
  function rankedHandInputEnabled(){
    if(!rankedHandTurnAvailable())return false;
    const session=globalThis.goStopOnlineSession;
    return !session?.pendingActionId;
  }

  function render() {
    notePresentationRender();
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
    const handInputDisabled=onlineMode?!rankedHandTurnAvailable():(presentation.locked||state.turn!==PLAYER_A);
    const blankInputDisabled=onlineMode?!rankedHandTurnAvailable():(state.turn!==PLAYER_A||!!state.winner||presentation.blankTurnInFlight||presentation.activePhysicalMotions>0||!!state.pendingDecision||!!presentation.targetChoice||!!presentation.shakeResolver||!!presentation.bombResolver);
    const desired=[];
    [...bottomPlayer.hand].sort(sortCards).forEach(card=>{
      let slot=existing.get(card.id);let el=slot?.querySelector('.hand-card');
      if(!slot){slot=document.createElement('div');slot.className='hand-card-slot';slot.dataset.handKey=card.id;slot.addEventListener('pointerenter',()=>setActiveHoveredHandCard(card.id));el=createCardEl(card,'card hand-card');el.dataset.hoverTitle=el.title;el.title='';el.addEventListener('click',()=>{void humanPlay(card.id,el);});slot.appendChild(el);}
      el.disabled=handInputDisabled;
      el.classList.toggle('matchable',card.id===presentation.hintCardId);
      el.classList.toggle('armed-bomb-card',bottomPlayer.armedBombMonths?.includes(card.month));
      desired.push(slot);existing.delete(card.id);
    });
    for(let i=0;i<bottomPlayer.bombFreeTurns;i++){
      const blank=document.createElement('button');
      blank.type='button'; blank.className='card hand-card blank-turn-card';
      blank.setAttribute('aria-label','Use empty Bomb turn and flip from the deck');
      blank.title='Bomb empty turn: click to skip playing a hand card and flip the deck';
      blank.disabled=blankInputDisabled;
      blank.innerHTML='<span aria-hidden="true">—</span>';
      blank.addEventListener('click',()=>{void humanUseBombBlank();});
      const slot=document.createElement('div'); slot.className='hand-card-slot';slot.dataset.handKey=`blank-${i}`; slot.appendChild(blank); desired.push(slot);
    }
    existing.forEach(node=>node.remove());desired.forEach(node=>els.playerHand.appendChild(node));
    setActiveHoveredHandCard(desired.some(node=>node.dataset.handKey===presentation.activeHoveredHandCardId)?presentation.activeHoveredHandCardId:null);

    els.aiHand.innerHTML='';
    topPlayer.hand.forEach(()=>{ const d=document.createElement('div'); d.className='mini-back'; els.aiHand.appendChild(d); });

    renderFloor();

    renderShakeIndicator(els.playerMultiplier,bottomPlayer,view.bottom.id);
    renderShakeIndicator(els.aiMultiplier,topPlayer,view.top.id);
    renderGoIndicator(document.querySelector('.human-chip'),bottomPlayer);
    renderGoIndicator(document.querySelector('.cpu-chip'),topPlayer);

    renderCaptured(els.playerCaptured,bottomPlayer.captured,view.bottom.id);
    renderCaptured(els.aiCaptured,topPlayer.captured,view.top.id);
    syncStageOwnedCards();
  }
  function notePresentationRender(){if(presentation.activePhysicalMotions>0)presentation.rendersDuringPhysicalMotion++;}
  async function runPhysicalMotion(job){presentation.activePhysicalMotions++;try{return await job();}finally{presentation.activePhysicalMotions--;}}

  function setActiveHoveredHandCard(cardId){
    // Touch selection outlives pointerleave and authority/resize renders.
    const selected=els.playerHand.dataset?.selectedCardId;
    if(selected&&[...els.playerHand.querySelectorAll('.hand-card-slot')].some(slot=>slot.dataset.handKey===selected))cardId=selected;
    presentation.activeHoveredHandCardId=cardId;
    els.playerHand.querySelectorAll('.hand-card-slot').forEach(slot=>{
      const active=!!cardId&&slot.dataset.handKey===cardId;slot.classList.toggle('is-hovered',active);
      const card=slot.querySelector('.hand-card');if(card)card.title=active?(card.dataset.hoverTitle||''):'';
    });
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
    let badge=chip.closest('.player-status-component')?.querySelector('.go-count-badge');
    if(!badge)return;
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
          el.classList.toggle('training-warning',c.id===presentation.trainingWarningFloorCardId);
          el.classList.toggle('training-recommended',c.id===presentation.trainingRecommendedFloorCardId);
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
          el.classList.toggle('training-warning',card.id===presentation.trainingWarningFloorCardId);
          el.classList.toggle('training-recommended',card.id===presentation.trainingRecommendedFloorCardId);
          el.style.setProperty('--tilt',`${stableFloorTilt(card)}deg`);
          slotEl.appendChild(el);
        }
      }
      els.floor.appendChild(slotEl);
    }
    syncTargetChoiceUi();
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
      btn.setAttribute('aria-label',`${isViewer?t('yourCaptured'):t(onlineMode?'opponentCaptured':'computerCaptured')}: ${t(group.key)} ${groupCards.length}`);
      const head=document.createElement('span'); head.className='capture-group-head';
      const displayedCount=group.type==='pi'?scorePlayer(owner).piCount:groupCards.length;
      head.innerHTML=`<b>${t(group.key)}</b><em>${displayedCount}</em>`;
      const stack=document.createElement('span'); stack.className='capture-stack';
      groupCards.forEach((c,i)=>{
        const img=document.createElement('img'); img.className='captured-mini'; img.dataset.cardId=c.id; img.src=artUrl(c.file); img.alt='';
        img.title=cardDisplayName(c); img.style.zIndex=String(i+1); stack.appendChild(img);
        if((c.flags.includes('doublePi')||(c.id==='m9-1'&&owner.gukjinMode==='pi'))){const badge=document.createElement('span');badge.className='double-single-badge';badge.textContent='×2';stack.appendChild(badge);}
      });
      if(!groupCards.length){ const empty=document.createElement('span'); empty.className='capture-empty'; empty.textContent='—'; stack.appendChild(empty); }
      btn.append(head,stack); root.appendChild(btn);
    });
  }

  function openCapturedGroup(ownerId,group,cards){
    const isViewer=ownerId===SOLO_VIEWER_ID;
    els.captureOwner.textContent=isViewer?t('yourCaptured'):t(onlineMode?'opponentCaptured':'computerCaptured');
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
  async function promptGukjinChoice(side,events,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const revealed=events.some(event=>(event.cards||event.cardIds||[]).some(card=>(typeof card==='string'?card:card.id)==='m9-1'));
    if(side!=='human'||!revealed||!state?.human?.captured.some(card=>card.id==='m9-1'))return;
    await openGukjinChoice(true,epoch);
  }
  function openGukjinChoice(waitForChoice=false,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return Promise.resolve();
    const gukjin=state?.human?.captured.find(card=>card.id==='m9-1');
    if(!gukjin)return Promise.resolve();
    els.gukjinChoiceCard.innerHTML=''; els.gukjinChoiceCard.appendChild(createCardEl(gukjin,'card magnified-card'));
    const advice=presentation.trainingMode&&!onlineMode?trainingGukjinRecommendation(state.human):null;
    if(els.gukjinTrainingReason){els.gukjinTrainingReason.hidden=!advice;els.gukjinTrainingReason.textContent=advice?.reason||'';}
    if(advice?.mode==='animal'){els.gukjinPictureBtn?.classList.add('training-choice-recommended');els.gukjinSingleBtn?.classList.remove('training-choice-recommended');}
    else if(advice?.mode==='pi'){els.gukjinSingleBtn?.classList.add('training-choice-recommended');els.gukjinPictureBtn?.classList.remove('training-choice-recommended');}
    else {els.gukjinPictureBtn?.classList.remove('training-choice-recommended');els.gukjinSingleBtn?.classList.remove('training-choice-recommended');}
    if(!showGameplayModal(els.gukjinDialog,epoch))return Promise.resolve();
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

  function syncTargetChoiceUi(){
    const choice=presentation.targetChoice;
    els.floor.querySelectorAll('[data-target-choice="1"]').forEach(el=>{
      if(choice?.ids.has(el.dataset.cardId))return;
      el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');delete el.dataset.targetChoice;
    });
    if(!choice)return;
    choice.ids.forEach(cardId=>{
      const el=els.floor.querySelector(`[data-card-id="${cardId}"]`);if(!el)return;
      el.classList.add('target-option');el.setAttribute('role','button');el.setAttribute('tabindex','0');el.dataset.targetChoice='1';
    });
  }
  function finishTargetChoice(cardId=null){
    const choice=presentation.targetChoice;if(!choice)return false;
    const card=cardId?choice.matches.find(item=>item.id===cardId)||null:null;
    const trainingRecommendationAtChoice=presentation.trainingTurnRecommendation;
    if(presentation.trainingMode&&card&&trainingRecommendationAtChoice?.target&&choice.matches.some(item=>item.id===trainingRecommendationAtChoice.target.id)&&card.id!==trainingRecommendationAtChoice.target.id){
      showTrainingCoach('Strategy Note',`The highlighted table card is the stronger target for this play. ${trainingRecommendationAtChoice.reason}`);
    }
    presentation.targetChoice=null;presentation.targetChoiceCleanup=null;
    els.floor.querySelectorAll('[data-target-choice="1"]').forEach(el=>{el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');delete el.dataset.targetChoice;});
    choice.resolve(card);return !!card;
  }
  async function chooseFloorTarget(matches, message='Choose which card to hit',{cancelable=false}={}){
    if(matches.length<=1)return matches[0]||null;
    const key=`${matches.map(card=>card.id).sort().join('|')}:${cancelable?'precommit':'authoritative'}`;
    // An authoritative refresh may ask us to present the same pending choice again.
    // Keep the original waiter alive; renderFloor() will reapply its visual affordances.
    if(presentation.targetChoice?.key===key){syncTargetChoiceUi();return null;}
    cleanupTargetChoice();
    presentation.locked=true;
    showActionCue('human','choose a table card');
    return new Promise(resolve=>{
      presentation.targetChoice={key,ids:new Set(matches.map(card=>card.id)),matches:[...matches],resolve,cancelable};
      presentation.targetChoiceCleanup=()=>finishTargetChoice(null);
      syncTargetChoiceUi();
    });
  }
  function cleanupTargetChoice(){if(presentation.targetChoiceCleanup){const fn=presentation.targetChoiceCleanup;presentation.targetChoiceCleanup=null;fn();}else if(presentation.targetChoice)finishTargetChoice(null);}
  function targetChoiceCardId(event){
    const el=event.target?.closest?.('[data-card-id]');
    return el&&els.floor.contains(el)&&presentation.targetChoice?.ids.has(el.dataset.cardId)?el.dataset.cardId:null;
  }
  els.floor.addEventListener('click',event=>{const cardId=targetChoiceCardId(event);if(!cardId)return;event.preventDefault();event.stopPropagation();finishTargetChoice(cardId);});
  els.floor.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const cardId=targetChoiceCardId(event);if(!cardId)return;event.preventDefault();event.stopPropagation();finishTargetChoice(cardId);});
  const cancelPrecommitTargetChoiceFromOutside=event=>{
    if(!presentation.targetChoice?.cancelable||!presentation.targetChoiceCleanup||!presentation.pendingHumanCardId)return;
    if(targetChoiceCardId(event)||els.playerHand.contains(event.target))return;
    presentation.targetChoiceCleanup();
  };
  document.addEventListener('pointerdown',cancelPrecommitTargetChoiceFromOutside,true);
  document.addEventListener('click',cancelPrecommitTargetChoiceFromOutside);

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
    if(presentation.targetChoice?.cancelable&&presentation.targetChoiceCleanup&&presentation.pendingHumanCardId){presentation.targetChoiceCleanup();return;}
    if(onlineMode){onlineSubmit({type:'useBombBlank'});return;}
    if(presentation.targetChoiceCleanup&&presentation.pendingHumanCardId){presentation.targetChoiceCleanup();return;}
    if(state.turn!==PLAYER_A||state.winner||state.human.bombFreeTurns<=0||presentation.blankTurnInFlight||presentation.activePhysicalMotions>0||state.pendingDecision||presentation.targetChoice||presentation.shakeResolver||presentation.bombResolver)return;
    clearTrainingCoach();presentation.blankTurnInFlight=true;presentation.locked=true;render();
    try{await executeDeckOnlyTurn('human');}
    finally{presentation.blankTurnInFlight=false;}
  }

  async function humanPlay(cardId, clickedEl){
    if(onlineMode){
      repairOrphanedRankedPendingAction();
      if(!rankedHandTurnAvailable())return;
      // Exactly one ranked action may be in flight. Rapid/repeated taps must not create
      // competing revisions or duplicate card plays before the authority responds.
      if(onlineActions.size>0){
        const pendingActionId=globalThis.goStopOnlineSession?.pendingActionId;
        if(pendingActionId)return;
        onlineActions.clear();onlineActionSubmittedAt.clear();
      }
      if(presentation.targetChoice){
        if(presentation.targetChoice.cancelable&&presentation.pendingHumanCardId){
          if(cardId===presentation.pendingHumanCardId)presentation.targetChoiceCleanup?.();
          else{presentation.queuedHumanCardSwitch={cardId,clickedEl};presentation.targetChoiceCleanup?.();}
          return;
        }
        const authoritativeTargetChoice=state?.pendingDecision?.type==='chooseFloorTarget'||latestOnlineSnapshot?.nextAction?.type==='chooseFloorTarget';
        if(onlinePendingCardId===cardId||authoritativeTargetChoice){syncTargetChoiceUi();return;}
        cleanupTargetChoice();onlineHandSourceRects.clear();
      }
      // The server can acknowledge the play before its physical presentation
      // finishes. Keep this card's turn claimed until turnCompleted is shown;
      // do not use a possibly stale snapshot to disable the recovery gate.
      if(onlinePendingCardId)return;
      const card=state.human.hand.find(item=>item.id===cardId);if(!card)return;
      onlinePendingCardId=cardId;rememberOnlineHandSource(cardId,clickedEl);clickedEl?.classList.add('pending-card');
      const needsPrePlayDecision=state.human.armedBombMonths?.includes(card.month)||state.human.hiddenTripleMonths?.includes(card.month);
      if(needsPrePlayDecision){
        if(!onlineSubmit({type:'attemptPlayCard',cardId})){onlineHandSourceRects.delete(cardId);onlinePendingCardId=null;clickedEl?.classList.remove('pending-card');}
        return;
      }
      await submitOnlineCardPlay();
      return;
    }
    const epoch=gameplayPresentationEpoch;
    if(!isGameplayPresentationCurrent(epoch)||state.turn!==PLAYER_A||state.winner)return;

    // While choosing between two floor targets, clicking a different hand card
    // cancels the current choice immediately and starts selection for the new card.
    if(presentation.locked){
      if(presentation.targetChoiceCleanup&&presentation.pendingHumanCardId){
        if(cardId===presentation.pendingHumanCardId)presentation.targetChoiceCleanup();
        else{presentation.queuedHumanCardSwitch={cardId,clickedEl};presentation.targetChoiceCleanup();}
      }
      return;
    }

    const card=state.human.hand.find(c=>c.id===cardId); if(!card)return;
    const trainingRecommendationAtPlay=presentation.trainingMode?trainingRecommendation():null;
    const trainingCorrection=presentation.trainingMode?trainingAlternativeReason(card,trainingRecommendationAtPlay):'';
    clearTrainingCoach();presentation.trainingTurnRecommendation=trainingRecommendationAtPlay;
    if(trainingCorrection)showTrainingCoach('Strategy Note',trainingCorrection);
    presentation.locked=true;

    const committedBombCards=state.human.armedBombMonths.includes(card.month)?state.human.hand.filter(item=>item.month===card.month).slice(0,3):[];
    const committedBombTarget=committedBombCards.length===3?state.floor.find(item=>item.month===card.month):null;
    const committedBombSources=committedBombCards.map(item=>els.playerHand.querySelector(`[data-card-id="${item.id}"]`)?.getBoundingClientRect()||approximateHumanSource());
    const attempted=applyNormalAction(normalAction('human',{type:'attemptPlayCard',cardId:card.id}));
    if(attempted.events.some(event=>event.type==='bombDeclared')){
      committedBombCards.forEach(item=>{const el=els.playerHand.querySelector(`[data-card-id="${item.id}"]`);if(el)el.style.visibility='hidden';});
      await presentExecutedBomb('human',attempted,committedBombCards,committedBombTarget,committedBombSources,epoch);
      return;
    }
    if(attempted.pendingDecision?.type==='bombDecision'){
      if(await executeBombTurn('human',card.month,epoch))return;
      if(!isGameplayPresentationCurrent(epoch))return;
    }
    if(attempted.pendingDecision?.type==='shakeDecision'){
      const shake=await chooseShake(card.month,epoch);
      if(!isGameplayPresentationCurrent(epoch))return;
      if(shake){
        const declared=applyNormalAction(normalAction('human',{type:'declareShake'}));
        await presentShakeDeclaration(declared.events,epoch);
        if(!isGameplayPresentationCurrent(epoch))return;
        render();
        await sleep(180);
        if(!isGameplayPresentationCurrent(epoch))return;
      }else{
        const kept=applyNormalAction(normalAction('human',{type:'keepShakeSecret'}));
        if(kept.pendingDecision?.type==='bombDecision'){
          const useBomb=await chooseBomb(card.month,epoch);
          if(!isGameplayPresentationCurrent(epoch))return;
          if(useBomb){
            presentation.pendingHumanCardId=null;
            presentation.queuedHumanCardSwitch=null;
            if(await executeBombTurn('human',card.month,epoch))return;
            if(!isGameplayPresentationCurrent(epoch))return;
          }else applyNormalAction(normalAction('human',{type:'declineBomb'}));
        }
      }
    }

    const matches=matchesFor(card);
    clickedEl.classList.add('pending-card');
    presentation.pendingHumanCardId=card.id;
    let target=null;
    if(matches.length===1) target=matches[0];
    else if(matches.length===2) target=await chooseFloorTarget(matches,'Choose which table card to hit');
    else if(matches.length>2) target=chooseBestMatch(matches);
    if(!isGameplayPresentationCurrent(epoch))return;

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
        if(!isGameplayPresentationCurrent(epoch))return;
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
    await playFullTurn('human',playedEvent.card,sourceRect,target,matches.length,true,epoch);
  }

  document.addEventListener('gostop-hand-activate',event=>{
    const detail=event.detail||{},cardId=String(detail.cardId||'');
    if(!cardId)return;
    if(detail.blank===true||cardId.startsWith('blank-')){
      if((onlineMode?state?.human?.bombFreeTurns:state?.human?.bombFreeTurns)<=0)return;
      if(onlineMode&&!rankedHandInputEnabled())return;
      event.preventDefault();void humanUseBombBlank();return;
    }
    if(!state?.human?.hand?.some(card=>card.id===cardId))return;
    const live=[...els.playerHand.querySelectorAll('.hand-card')].find(card=>card.dataset.cardId===cardId||card.closest('.hand-card-slot')?.dataset.handKey===cardId)||null;
    if(onlineMode){
      if(!rankedHandTurnAvailable())return;
      event.preventDefault();void humanPlay(cardId,live);return;
    }
    if(!live||live.disabled)return;
    event.preventDefault();void humanPlay(cardId,live);
  });

  // Shared by direct hand activation and the production authority callbacks.
  // Keep this in the same lexical scope as humanPlay (strict-mode block functions
  // inside the startup branch are not visible to the hand handler).
  async function submitOnlineCardPlay(){
    const cardId=onlinePendingCardId;
    if(!cardId)return false;
    const card=state?.human?.hand?.find(item=>item.id===cardId);
    let targetId=null;
    if(card&&!state?.pendingDecision&&latestOnlineSnapshot?.nextAction?.type!=='chooseFloorTarget'){
      const matches=matchesFor(card);
      if(matches.length===2){
        presentation.pendingHumanCardId=cardId;
        const target=await chooseFloorTarget(matches,'Choose which table card to hit',{cancelable:true});
        if(!target){
          const next=presentation.queuedHumanCardSwitch;
          presentation.queuedHumanCardSwitch=null;
          presentation.pendingHumanCardId=null;
          presentation.locked=false;
          onlineHandSourceRects.delete(cardId);
          onlinePendingCardId=null;
          els.playerHand.querySelector(`[data-card-id="${cardId}"]`)?.classList.remove('pending-card');
          render();
          if(next){await nextFrame();return humanPlay(next.cardId,next.clickedEl);}
          return false;
        }
        targetId=target.id;
        presentation.pendingHumanCardId=null;
        presentation.queuedHumanCardSwitch=null;
        presentation.locked=false;
      }
    }
    if(onlineSubmit({type:'playCard',cardId,targetId}))return true;
    onlineHandSourceRects.delete(cardId);
    onlinePendingCardId=null;
    els.playerHand.querySelector(`[data-card-id="${cardId}"]`)?.classList.remove('pending-card');
    return false;
  }

  async function aiTurn(){
    if(onlineMode)return;
    const epoch=gameplayPresentationEpoch;
    if(!isGameplayPresentationCurrent(epoch)||state.turn!==PLAYER_B||state.winner||presentation.aiTurnInProgress)return;
    presentation.aiTurnInProgress=true;
    presentation.locked=true;
    try {
      render(); await sleep(520);
      if(!isGameplayPresentationCurrent(epoch))return;

      const bombMonth=bestAiBombMonth();
      if(bombMonth!=null){
        const card=state.ai.hand.find(item=>item.month===bombMonth);
        applyNormalAction(normalAction('ai',{type:'requestBombDecision',cardId:card.id}));
        await executeBombTurn('ai',bombMonth,epoch);
        return;
      }

      const competitiveMove=bestCompetitiveMove('ai'),card=competitiveMove?.card||null;
      if(!card){
        await finishNagari(epoch);
        return;
      }
      // The computer also decides whether to Shake only when it is about to use
      // one of the three matching-month cards, never at the opening deal.
      const attempted=applyNormalAction(normalAction('ai',{type:'attemptPlayCard',cardId:card.id}));
      if(attempted.pendingDecision?.type==='shakeDecision'){
        const fourthOnFloor=state.floor.some(c=>c.month===card.month);
        if(!fourthOnFloor && Math.random()<.72){
          const declared=applyNormalAction(normalAction('ai',{type:'declareShake'}));
          await presentShakeDeclaration(declared.events,epoch);
          if(!isGameplayPresentationCurrent(epoch))return;
          render();
          await sleep(220);
          if(!isGameplayPresentationCurrent(epoch))return;
        }else applyNormalAction(normalAction('ai',{type:'keepShakeSecret'}));
      }
      const backs=[...els.aiHand.querySelectorAll('.mini-back')];
      const sourceEl=backs[Math.floor(backs.length*.45)]||backs[0];
      const sourceRect=sourceEl?sourceEl.getBoundingClientRect():approximateAiSource();
      if(sourceEl)sourceEl.style.visibility='hidden';
      const matches=matchesFor(card);
      let target=competitiveMove?.target&&matches.some(item=>item.id===competitiveMove.target.id)?matches.find(item=>item.id===competitiveMove.target.id):null;
      if(!target&&matches.length===1)target=matches[0];
      else if(!target&&matches.length>1)target=matches.slice().sort((a,b)=>competitiveMoveScore('ai',card,b)-competitiveMoveScore('ai',card,a)||a.id.localeCompare(b.id))[0];
      if(target && matches.length>1){await previewAiTarget(target);if(!isGameplayPresentationCurrent(epoch))return;}
      const playResult=applyNormalAction(normalAction('ai',{type:'playCard',cardId:card.id,targetId:target?.id||null}));
      const playedEvent=playResult.events.find(event=>event.type==='cardPlayed');
      await playFullTurn('ai',playedEvent.card,sourceRect,target,matches.length,true,epoch);
    } finally {
      presentation.aiTurnInProgress=false;
    }
  }

  async function presentNormalResolution(side,result,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const event=result.events[0];
    if(event.type==='cardLanded'){
      presentation.floorSlotReservations.delete(event.card.id);
      render();
      removeStage(event.card.id);
      await presentationPause('cardLandCleanup');
      if(!isGameplayPresentationCurrent(epoch))return;
      return;
    }
    if(event.type==='cardsCaptured'){
      await animateCaptureBatch(event.cards,side);
      if(!isGameplayPresentationCurrent(epoch))return;
      render();
      await presentationPause('postCapture');
      if(!isGameplayPresentationCurrent(epoch))return;
    }
    await promptGukjinChoice(side,result.events,epoch);
  }

  async function resolveNormalEngineTurn(side,play,draw,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    let result=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'played'}));
    await presentNormalResolution(side,result,epoch);
    if(!isGameplayPresentationCurrent(epoch))return;
    if(draw){
      result=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'drawn'}));
      await presentNormalResolution(side,result,epoch);
      if(!isGameplayPresentationCurrent(epoch))return;
    }
    const completion=applyNormalAction(normalAction(side,{type:'completeTurn'}));
    await presentPiTransferEvents(side,completion.events);
    if(!isGameplayPresentationCurrent(epoch))return;
    await presentSemanticEvents(completion.events,epoch);
  }

  async function presentPiTransferEvents(side,events){
    for(const event of events.filter(item=>item.type==='piTransferred')){
      const card=MASTER_DECK.find(item=>item.id===event.cardId);
      await animatePiTransfer(card,legacySideForPlayerId(event.fromPlayerId),side);
    }
    if(events.some(event=>event.type==='piTransferred'))render();
  }

  async function resolveExtractedSpecialTurn(side,classification,play,draw,epoch=gameplayPresentationEpoch){
    const localGeneration=localGameGeneration;
    if(!isGameplayPresentationCurrent(epoch))return;
    const result=applySpecialAction(normalAction(side,{type:'resolveSpecialTurn'}));
    if(classification.kind==='ppeokSsaDaCandidate'){
      removeStage(play.card.id); if(draw)removeStage(draw.card.id);
      playPpeokSound(); render(); await showSpecialTransient('POOPED!',result.events.find(event=>event.type==='ppeokFormed')?.cardIds||[],'',epoch);
      if(!isLocalGamePresentationCurrent(localGeneration)||!isGameplayPresentationCurrent(epoch))return;
      if(result.events.some(event=>event.type==='firstPpeokAwarded'))await showFirstPoopNotice(side,localGeneration,epoch);
      if(!isLocalGamePresentationCurrent(localGeneration)||!isGameplayPresentationCurrent(epoch))return;
      if(result.events.some(event=>event.type==='threePpeokDeclared')){
        await sleep(450);if(!isLocalGamePresentationCurrent(localGeneration)||!isGameplayPresentationCurrent(epoch))return;presentThreePpeok(result,epoch);
      }
    }else{
      for(const event of result.events){
        if(event.type==='cardsCaptured'){
          const captured=event.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id));
          await animateCaptureBatch(captured,side);
          if(!isGameplayPresentationCurrent(epoch))return;
          // `await showSpecialTransient('KISS!'` remains centralized in presentKiss.
          if(classification.kind==='jjokCandidate')await presentKiss(event.cardIds,epoch);
          if(!isGameplayPresentationCurrent(epoch))return;
          if(classification.kind==='ttadakCandidate'){playTapTapSound();await showSpecialTransient('FLUSH!',event.cardIds,'flush',epoch);}
        }else if(event.type==='cardLanded'){
          presentation.floorSlotReservations.delete(event.cardId); removeStage(event.cardId); await presentationPause('cardLandCleanup');
        }else if(event.type==='piTransferred'){
          const card=MASTER_DECK.find(item=>item.id===event.cardId);
          await animatePiTransfer(card,legacySideForPlayerId(event.fromPlayerId),side);
        }
      }
      render(); await presentationPause('postCapture');
      if(!isGameplayPresentationCurrent(epoch))return;
      await promptGukjinChoice(side,result.events,epoch);
      if(!isGameplayPresentationCurrent(epoch))return;
      await presentSemanticEvents(result.events,epoch);
    }
    if(!isLocalGamePresentationCurrent(localGeneration)||!isGameplayPresentationCurrent(epoch))return;
    if(state.pendingTurn?.phase==='awaitingTurnCompletion')applyNormalAction(normalAction(side,{type:'completeTurn'}));
  }

  async function playFullTurn(side, playedCard, sourceRect, target, playMatchCount,legacy=true,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const playedStage=await animateHandCardSlap(side,playedCard,sourceRect,target);
    if(!isGameplayPresentationCurrent(epoch))return;
    await presentationPause('handToDeck');
    if(!isGameplayPresentationCurrent(epoch))return;

    if(!state.deck.length){
      const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
      applyNormalAction(normalAction(side,{type:'drawNextCard'}));
      const classification=classifyNormalTurn(side);
      if(classification.kind==='normal')await resolveNormalEngineTurn(side,play,null,epoch);
      else if(['selfPpeokCandidate','floorStackInteraction'].includes(classification.kind))await resolveExtractedSpecialTurn(side,classification,play,null,epoch);
      else throw new Error(`Unhandled authoritative turn classification: ${classification.kind}`);
      if(!isGameplayPresentationCurrent(epoch))return;
      await concludeTurn(side,epoch);
      return;
    }

    const drawResult=applyNormalAction(normalAction(side,{type:'drawNextCard'}));
    const draw=drawResult.events.find(event=>event.type==='deckCardRevealed').card;
    let turnClassification=classifyNormalTurn(side);
    render();
    const deckStage=await animateDeckLiftFlip(side,draw);
    if(!isGameplayPresentationCurrent(epoch))return;

    let drawTarget=null;
    let drawMatches=matchesFor(draw);
    let drawMatchCount=drawMatches.length;

    const sameMonthSpecial=turnClassification&&['jjokCandidate','ppeokSsaDaCandidate','ttadakCandidate'].includes(turnClassification.kind);
    if(sameMonthSpecial && playMatchCount<=2){
      drawTarget=playedCard;
    }else if(drawMatches.length===1){
      drawTarget=drawMatches[0];
    }else if(drawMatches.length===2){
      if(side==='human') drawTarget=await chooseFloorTarget(drawMatches,'Deck card: choose which table card to hit');
      else { drawTarget=chooseBestMatch(drawMatches); await previewAiTarget(drawTarget); }
      if(!isGameplayPresentationCurrent(epoch))return;
    }else if(drawMatches.length>2){
      drawTarget=chooseBestMatch(drawMatches);
      if(side==='ai'){await previewAiTarget(drawTarget);if(!isGameplayPresentationCurrent(epoch))return;}
    }

    if(drawTarget&&state.pendingTurn?.drawn?.matchIds.includes(drawTarget.id)&&state.pendingTurn.drawn.targetId!==drawTarget.id){
      applyNormalAction(normalAction(side,{type:'chooseFloorTarget',source:'drawn',targetId:drawTarget.id}));
      turnClassification=classifyNormalTurn(side);
    }

    await animateStagedSlap(deckStage,draw,drawTarget,'flip');
    if(!isGameplayPresentationCurrent(epoch))return;
    const play={card:playedCard,stage:playedStage,target,matchCount:playMatchCount};
    const drawn={card:draw,stage:deckStage,target:drawTarget,matchCount:drawMatchCount};
    const extractedSpecial=['ppeokSsaDaCandidate','selfPpeokCandidate','jjokCandidate','ttadakCandidate','floorStackInteraction'];
    if(turnClassification.kind==='normal')await resolveNormalEngineTurn(side,play,drawn,epoch);
    else if(extractedSpecial.includes(turnClassification.kind))await resolveExtractedSpecialTurn(side,turnClassification,play,drawn,epoch);
    else throw new Error(`Unhandled authoritative turn classification: ${turnClassification.kind}`);
    if(!isGameplayPresentationCurrent(epoch))return;
    await concludeTurn(side,epoch);
  }

  async function executeDeckOnlyTurn(side,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch)||state.winner)return;
    presentation.locked=true;
    applyNormalAction(normalAction(side,{type:'useBombBlank'}));
    await executePendingDrawTurn(side,epoch);
  }

  async function executePendingDrawTurn(side,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    if(!state.deck.length){
      applyNormalAction(normalAction(side,{type:'drawNextCard'}));
      const completed=applyNormalAction(normalAction(side,{type:'completeTurn'}));
      await presentPiTransferEvents(side,completed.events);
      if(!isGameplayPresentationCurrent(epoch))return;
      await presentSemanticEvents(completed.events,epoch);
      if(!isGameplayPresentationCurrent(epoch))return;
      await finishNagari(epoch); return;
    }
    const drawResult=applyNormalAction(normalAction(side,{type:'drawNextCard'}));
    const draw=drawResult.events.find(event=>event.type==='deckCardRevealed').card;
    render();
    const stage=await animateDeckLiftFlip(side,draw);
    if(!isGameplayPresentationCurrent(epoch))return;
    const matches=matchesFor(draw);
    let target=null;
    if(matches.length===1)target=matches[0];
    else if(matches.length===2){
      if(side==='human')target=await chooseFloorTarget(matches,'Choose which table card to hit');
      else{target=chooseBestMatch(matches);await previewAiTarget(target);}
      if(!isGameplayPresentationCurrent(epoch))return;
    }else if(matches.length>2)target=chooseBestMatch(matches);
    if(target&&state.pendingTurn?.drawn?.matchIds.includes(target.id)&&state.pendingTurn.drawn.targetId!==target.id){
      applyNormalAction(normalAction(side,{type:'chooseFloorTarget',source:'drawn',targetId:target.id}));
    }
    await animateStagedSlap(stage,draw,target,'flip');
    if(!isGameplayPresentationCurrent(epoch))return;
    const classification=classifyNormalTurn(side);
    if(classification.kind==='normal'){
      const resolved=applyNormalAction(normalAction(side,{type:'resolveNormalCard',source:'drawn'}));
      await presentNormalResolution(side,resolved,epoch);
      if(!isGameplayPresentationCurrent(epoch))return;
      const completed=applyNormalAction(normalAction(side,{type:'completeTurn'}));
      await presentPiTransferEvents(side,completed.events);
      if(!isGameplayPresentationCurrent(epoch))return;
      await presentSemanticEvents(completed.events,epoch);
    }else{
      if(classification.kind==='floorStackInteraction')await resolveExtractedSpecialTurn(side,classification,null,{card:draw,stage,target,matchCount:matches.length},epoch);
      else throw new Error(`Unhandled authoritative deck-only classification: ${classification.kind}`);
    }
    if(!isGameplayPresentationCurrent(epoch))return;
    await concludeTurn(side,epoch);
  }

  async function executeBombTurn(side,month,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return false;
    // Presentation wrapper: declareBomb performs every authoritative Bomb mutation.
    const decision=state.pendingDecision;
    const bombCards=decision?.cardIds.map(id=>state[side].hand.find(card=>card.id===id)).filter(Boolean)||[];
    const floorTarget=state.floor.find(c=>c.id===decision?.floorCardId);
    if(bombCards.length!==3 || !floorTarget){
      if(decision?.type==='bombDecision')applyNormalAction(normalAction(side,{type:'declineBomb'}));
      presentation.locked=false; render(); return false;
    }

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
    if(!result.events.some(event=>event.type==='bombDeclared'))return false;

    await presentExecutedBomb(side,result,bombCards,floorTarget,bombSourceRects,epoch);
    return isGameplayPresentationCurrent(epoch);
  }

  async function presentExecutedBomb(side,result,bombCards,floorTarget,bombSourceRects,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    await animateBombSlap(side,bombCards,floorTarget,bombSourceRects);
    if(!isGameplayPresentationCurrent(epoch))return;
    await sleep(180);
    if(!isGameplayPresentationCurrent(epoch))return;

    await animateCaptureBatch([...bombCards,floorTarget],side);
    if(!isGameplayPresentationCurrent(epoch))return;
    await presentPiTransferEvents(side,result.events);
    if(!isGameplayPresentationCurrent(epoch))return;
    render();
    await sleep(260);
    if(!isGameplayPresentationCurrent(epoch))return;
    await executePendingDrawTurn(side,epoch);
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
      await presentationPause('cardLandCleanup');
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
    await presentationPause('postCapture');
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
    presentation.piTransferAnimationCount++;
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
      {transform:`translate(${dx}px,${dy}px) rotate(0deg)`,opacity:.95}
    ],{duration:motionDuration(460),easing:'cubic-bezier(.25,.7,.2,1)',fill:'forwards'});
    await a.finished.catch(()=>{}); el.remove();
  }

  async function concludeTurn(side,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch)||state.winner)return;
    await presentNewMilestones(playerIdForLegacySide(side),epoch);
    if(!isGameplayPresentationCurrent(epoch))return;
    render();
    if(state.pendingDecision?.type==='openingTripleDecision'){await processOpeningSpecials();return;}
    if(!isGameplayPresentationCurrent(epoch))return;
    const actorId=playerIdForLegacySide(side);
    const actor=state[side];
    if(side==='ai'&&actor.captured.some(card=>card.id==='m9-1')){
      const mode=score(actor.captured,'pi').total>score(actor.captured,'animal').total?'pi':'animal';
      if(actor.gukjinMode!==mode)applyNormalAction({type:'setGukjinMode',actorId,mode});
    }
    let result=TEST_MODE?evaluateGoStop(state,{actorId}):submitSoloAction({type:'evaluateGoStop',actorId}); state=result.state;
    if(result.autoStop){ presentStopResult(result,epoch); return; }
    if(result.pendingDecision){
      const sc=scorePlayer(state[side]);
      if(side==='human'){ presentation.locked=true; await humanGoStop(sc,epoch); return; }
      const action={type:aiShouldGo(sc)?'declareGo':'declareStop',actorId};
      result=applyGoStopDecision(action);
      if(action.type==='declareGo'){
        if(result.events.some(event=>event.type==='goDeclared'))showGoCallout('ai');
        await sleep(980);
        if(!isGameplayPresentationCurrent(epoch))return;
      }else{
        presentStopResult(result,epoch); return;
      }
    }

    if(result.requiresNagari){
      await finishNagari(epoch); return;
    }

    await sleep(760);
    if(!isGameplayPresentationCurrent(epoch))return;
    render();
    scheduleTurnStart();
  }

  function scheduleTurnStart(){
    if(TEST_MODE)return;
    if(onlineMode||!localGameActive)return;
    const generation=localGameGeneration;
    clearTrainingCoach();
    if(!state||state.winner)return;
    const side=legacySideForPlayerId(state.turn), actor=state[side];
    if(side==='ai' && actor.bombFreeTurns>0){
      presentation.locked=true;
      setTimeout(()=>{if(isLocalGamePresentationCurrent(generation))executeDeckOnlyTurn(side);},760);
      return;
    }
    if(side==='ai'){
      presentation.locked=true;
      setTimeout(()=>{if(isLocalGamePresentationCurrent(generation))aiTurn();},820);
    }else{
      // Human Bomb credits are visible blank cards; the player explicitly clicks one.
      presentation.locked=false;
      render();
      armTrainingCoach();
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

  function showBombChoice(month,cardIds=[]){
    const training=!!presentation.trainingMode&&!onlineMode,label=training?trainingFlowerName(month):localizedMonth(month);
    const ids=cardIds.length?cardIds:state.human.hand.filter(card=>card.month===month).map(card=>card.id);
    els.bombText.textContent=`${label} — ${t('bomb')}`;
    els.bombCards.replaceChildren(...ids.map(id=>state.human.hand.find(card=>card.id===id)).filter(Boolean).map(card=>createCardEl(card,'card magnified-card')));
    if(els.bombTrainingReason)els.bombTrainingReason.hidden=true;
    if(training){
      showTrainingSpecialCoach(
        els.bombDialog,
        'BOMB ADVICE',
        `Bomb. Capture all four ${label} cards now, steal one Single when available, and gain two optional blank turns. Play One gives up this Bomb opportunity.`
      );
    }
    els.bombBtn?.classList.toggle('training-choice-recommended',training);
    els.playOneBtn?.classList.toggle('training-choice-recommended',false);
  }
  async function chooseBomb(month,epoch=gameplayPresentationEpoch){
    if(!els.bombDialog||!isGameplayPresentationCurrent(epoch))return false;
    showBombChoice(month);
    if(!showGameplayModal(els.bombDialog,epoch))return false;
    return new Promise(resolve=>{ presentation.bombResolver=resolve; });
  }

  async function chooseShake(month,epoch=gameplayPresentationEpoch){
    if(!els.shakeDialog||!isGameplayPresentationCurrent(epoch))return false;
    showShakeChoice({type:'shakeDecision',month,cardIds:state.human.hand.filter(c=>c.month===month).map(card=>card.id)});
    if(!showGameplayModal(els.shakeDialog,epoch))return false;
    return new Promise(resolve=>{ presentation.shakeResolver=resolve; });
  }

  function showShakeChoice(decision){
    const cardIds=decision.cardIds||state.human.hand.filter(card=>card.month===decision.month).map(card=>card.id),cards=cardIds.map(id=>state.human.hand.find(card=>card.id===id)).filter(Boolean),bombReady=!!decision.floorCardId||(state.floor.some(c=>c.month===decision.month)&&!floorStackForMonth(decision.month));
    const training=!!presentation.trainingMode&&!onlineMode,monthName=training?trainingFlowerName(decision.month):localizedMonth(decision.month),shakeMultiplier=decision.month>=11?4:2;
    els.shakeText.textContent=`${monthName} — ${t('shake')} / ${bombReady?t('bomb'):t('keepBomb')}`;
    if(els.shakeTrainingReason)els.shakeTrainingReason.hidden=true;
    if(training){
      const advice=bombReady
        ?`Bomb. The fourth ${monthName} card is already on the table, so Bomb is guaranteed. Capture all four ${monthName} cards now, steal one Single when available, and gain two optional blank turns.`
        :`Shake. Reveal these three ${monthName} cards now for a ×${shakeMultiplier} final-score multiplier if you win. Keep for Bomb only preserves a future Bomb chance if the fourth ${monthName} card appears on the table.`;
      showTrainingSpecialCoach(els.shakeDialog,bombReady?'BOMB ADVICE':'SHAKE ADVICE',advice);
    }
    if(els.keepSecretBtn){
      els.keepSecretBtn.textContent=bombReady?t('bomb'):t('keepBomb');
      els.keepSecretBtn.classList.toggle('training-choice-recommended',training&&bombReady);
    }
    els.shakeBtn?.classList.toggle('training-choice-recommended',training&&!bombReady);
    els.shakeCards.replaceChildren(...cards.map(card=>createCardEl(card,'card magnified-card')));
  }

  async function chooseOpeningTriple(decision,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return false;
    showShakeChoice(decision);
    if(!showGameplayModal(els.shakeDialog,epoch))return false;
    return new Promise(resolve=>{presentation.shakeResolver=resolve;});
  }

  async function processOpeningSpecials(epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch)||state.winner)return;
    if(state.pendingDecision?.type!=='openingTripleDecision'){
      const opening=TEST_MODE?resolveOpeningState(state):submitSoloAction({type:'resolveOpening',actorId:state.turn}); state=opening.state;
      const chongtong=opening.events.find(event=>event.type==='chongtongDeclared');
      if(chongtong){ presentChongtong(chongtong,epoch); return; }
    }
    while(state.pendingDecision?.type==='openingTripleDecision'){
      if(!isGameplayPresentationCurrent(epoch))return;
      const decision=state.pendingDecision;
      if(decision.playerId===PLAYER_A){
        const shake=await chooseOpeningTriple(decision,epoch);
        if(!isGameplayPresentationCurrent(epoch))return;
        if(shake){
          const result=applyNormalAction({type:'declareShake',actorId:PLAYER_A});
          await presentShakeDeclaration(result.events,epoch);
          if(!isGameplayPresentationCurrent(epoch))return;
        }else if(decision.floorCardId){
          applyNormalAction({type:'declareBomb',actorId:PLAYER_A});
        }else applyNormalAction({type:'armOpeningBomb',actorId:PLAYER_A});
      }else{
        const shake=!decision.floorCardId&&Math.random()<.72;
        if(shake){
          const result=applyNormalAction({type:'declareShake',actorId:PLAYER_B});
          await presentShakeDeclaration(result.events,epoch);
          if(!isGameplayPresentationCurrent(epoch))return;
        }else if(decision.floorCardId){applyNormalAction({type:'declareBomb',actorId:PLAYER_B});}
        else applyNormalAction({type:'armOpeningBomb',actorId:PLAYER_B});
      }
    }
    if(!isGameplayPresentationCurrent(epoch))return;
    presentation.locked=false;render();
    scheduleTurnStart();
  }

  function presentChongtong(event,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    // Preserve the established Solo presentation: only the local-player branch
    // played the Chongtong fanfare before authority extraction.
    if(event.actorId===PLAYER_A)playChongtongFanfare(); presentation.locked=true;
    const playerWon=event.actorId===PLAYER_A;
    const reason=`${playerWon?t('player'):(onlineMode?t('opponent'):t('computer'))}: ${t('conquer')} — ${localizedMonth(event.month)}`;
    const terminal=state.terminalResult;
    recordTerminalResult(terminal);
    if(els.resultCards&&typeof els.resultCards.replaceChildren==='function'){els.resultCards.replaceChildren();event.cardIds?.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.resultCards.appendChild(createCardEl(card,'card')));}
    setGrandResult(t('conquer'),playerWon?t('playerWins'):(onlineMode?t('opponentWins'):t('computerWins')),`${terminal.finalPoints} ${t('points')}`,`${reason}${terminal.nagariCarryPower?` · ${t('noWinnerCarry')} ×${terminal.multiplier}`:''}`,'special');
    showGameplayModal(els.resultDialog,epoch); render();
  }

  async function presentShakeDeclaration(events,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const event=events.find(item=>item.type==='shakeDeclared');
    if(!event)return;
    playShakeSound(); render();
    const cards=event.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean);
    if(event.actorId===PLAYER_B){
      els.shakeRevealTitle.textContent=onlineMode?t('opponentShakes'):t('computerShakes');
      els.shakeRevealText.textContent=t(onlineMode?'opponentShakeAck':'shakeAck');
      els.shakeRevealCards.innerHTML=''; cards.forEach(card=>els.shakeRevealCards.appendChild(createCardEl(card,'card magnified-card')));
      if(!showGameplayModal(els.shakeRevealDialog,epoch))return;
      await new Promise(resolve=>els.shakeRevealDialog.addEventListener('close',resolve,{once:true}));
      return;
    }
    await showSpecialTransient(t('shake'),event.cardIds,'',epoch);
  }

  function openShakeReview(playerId){
    const player=playerStateById(state,playerId);
    els.shakeReviewCards.innerHTML='';
    player.revealedShakeSets.forEach((set,index)=>{
      const group=document.createElement('section'),label=document.createElement('strong'),cards=document.createElement('div');label.textContent=`${playerId===PLAYER_A?t('player'):t(onlineMode?'opponent':'computer')} — ${t('shake')} #${index+1} · ×${set.declarationMultiplier||(set.month>=11?4:2)}`;cards.className='shake-cards';set.cardIds.forEach(id=>{const card=MASTER_DECK.find(item=>item.id===id);if(card)cards.appendChild(createCardEl(card,'card magnified-card'));});group.append(label,cards);els.shakeReviewCards.appendChild(group);
    });
    showGameplayModal(els.shakeReviewDialog);
  }


  function rectCenter(r){ return {x:r.left+(r.width||0)/2,y:r.top+(r.height||0)/2}; }
  function cardSize(){
    const stage=document.querySelector('.game-stage');
    // Resolve clamp()/calc() through layout rather than parsing the raw custom
    // property. Keeping the probe inside the stage also includes its desktop
    // transform without inheriting a hand lift or floor-card rotation.
    if(stage){
      const probe=document.createElement('div');
      probe.className='card normal-gameplay-card card-size-probe';
      stage.appendChild(probe);
      const probeRect=probe.getBoundingClientRect();
      probe.remove();
      if(probeRect.width>0&&probeRect.height>0)return {w:probeRect.width,h:probeRect.height};
    }

    // The base stylesheet dimensions are the last-resort non-layout fallback.
    return {w:76,h:123};
  }
  function approximateAiSource(){ const r=els.aiHand.getBoundingClientRect(); return {left:r.left+r.width*.5-27,top:r.top+r.height*.42-44,width:54,height:88}; }

  async function freeFloorLanding(card){
    const pendingEntries=[state.pendingTurn?.played,state.pendingTurn?.drawn].filter(Boolean);
    const authoritativeSlot=pendingEntries.find(entry=>entry.card.id===card.id)?.landingSlot;
    const slot=reserveFloorSlot(card,authoritativeSlot);
    let slotEl=els.floor.querySelector(`[data-floor-slot="${slot}"]`);
    if(!slotEl){
      renderFloor();
      await nextFrame();
      slotEl=els.floor.querySelector(`[data-floor-slot="${slot}"]`);
    }
    if(!slotEl){const {w,h}=cardSize();return {left:0,top:0,width:w,height:h,rotation:stableFloorTilt(card)};}
    const proxy=document.createElement('div');proxy.className='card floor-card floor-slot-proxy canonical-card-face';slotEl.appendChild(proxy);await nextFrame();
    const r=proxy.getBoundingClientRect(),{w,h}=cardSize(),center=rectCenter(r);proxy.remove();
    return {left:center.x-w/2,top:center.y-h/2,width:w,height:h,rotation:stableFloorTilt(card)};
  }

  function overlapLanding(targetCard){
    const targetEl=els.floor.querySelector(`[data-card-id="${targetCard.id}"]`) || presentation.stagedCards.get(targetCard.id);
    if(!targetEl)return null;
    const r=targetEl.getBoundingClientRect(),size=cardSize(),sign=Math.random()<.5?-1:1;
    const center=rectCenter(r),x=size.w*(0.22+Math.random()*.24)*sign,y=size.h*(-.08+Math.random()*.18);
    return {left:center.x-size.w/2+x,top:center.y-size.h/2+y,width:size.w,height:size.h,rotation:sign*(7+Math.random()*10)};
  }

  function makePhysicalFace(card,rect,className='physical-card'){
    const el=document.createElement('div'); el.className=`${className} card canonical-card-face normal-gameplay-card`; el.dataset.cardId=card.id;
    el.appendChild(createCardFaceImage(card)); (els.cardMotionLayer||document.body).appendChild(el);
    normalizeFixed(el,rect); return el;
  }
  function normalizeFixed(el,rect){
    el.getAnimations().forEach(a=>a.cancel());
    el.style.position='fixed'; el.style.left=`${rect.left}px`; el.style.top=`${rect.top}px`; el.style.width=`${rect.width}px`; el.style.height=`${rect.height}px`;
    el.style.margin='0'; el.style.transform='none'; el.style.opacity='1'; el.style.zIndex='2';
  }
  function syncStageOwnedCard(id){const owner=presentation.stagedCards.get(id);if(TEST_MODE||!owner)return;document.querySelectorAll(`[data-card-id="${id}"]`).forEach(node=>{if(node!==owner)node.style.visibility='hidden';});}
  function syncStageOwnedCards(){presentation.stagedCards.forEach((_,id)=>syncStageOwnedCard(id));}
  function stagePhysicalCard(id,el){presentation.stagedCards.set(id,el);syncStageOwnedCard(id);return el;}
  function removeStage(id){ const el=presentation.stagedCards.get(id); if(el){ presentation.stagedCards.delete(id); el.remove(); } if(!TEST_MODE)document.querySelectorAll(`[data-card-id="${id}"]`).forEach(node=>node.style.visibility=''); }

  function resetHandPresentationState(){
    clearTrainingCoach();
    cleanupTargetChoice();
    if(presentation.goCalloutTimer){clearTimeout(presentation.goCalloutTimer);presentation.goCalloutTimer=null;}
    presentation.stagedCards.forEach(el=>{el?.getAnimations?.().forEach(animation=>animation.cancel());el?.remove?.();});
    presentation.stagedCards.clear();presentation.floorSlotReservations.clear();onlineHandSourceRects.clear();presentation.activeHoveredHandCardId=null;
    presentation.pendingHumanCardId=null;presentation.queuedHumanCardSwitch=null;presentation.blankTurnInFlight=false;
    if(!TEST_MODE){document.dispatchEvent(new Event('gostop-hand-reset'));document.querySelectorAll('.physical-card,.capture-ghost,.floor-slot-proxy,.impact-ring').forEach(node=>{node.getAnimations?.().forEach(animation=>animation.cancel());node.remove();});document.querySelectorAll('.canonical-card-face[style*="visibility"]').forEach(node=>node.style.visibility='');if(els.impactLayer)els.impactLayer.innerHTML='';}
  }

  function fullSizeSourceRect(sourceRect){
    const {w,h}=cardSize();
    const cx=sourceRect.left+sourceRect.width/2, cy=sourceRect.top+sourceRect.height/2;
    return {left:cx-w/2,top:cy-h/2,width:w,height:h};
  }

  async function animateHandCardSlap(side,card,sourceRect,target){
    // CPU backs are intentionally smaller in the rack, but the card entering play is always full GoStop Card size.
    sourceRect=fullSizeSourceRect(sourceRect);
    await preloadCardFace(card);
    const el=makePhysicalFace(card,sourceRect,'physical-card moving-card'); stagePhysicalCard(card.id,el);
    document.querySelectorAll(`[data-card-id="${card.id}"]`).forEach(node=>{if(node!==el)node.style.visibility='hidden';});
    const landing=target ? overlapLanding(target) : await freeFloorLanding(card);
    if(!landing)return el;
    if(prefersReducedMotion()){ normalizeFixed(el,landing); el.style.transform=`rotate(${landing.rotation}deg)`; return el; }

    const dx=landing.left-sourceRect.left, dy=landing.top-sourceRect.top;
    const sideBias=seatForLegacySide(side)==='bottom'?-1:1;
    const duration=motionDuration(650);
    if(target) setTimeout(()=>playHitSound(1),Math.max(0,duration-40));
    const frames=performanceLite()?[
      {transform:'translate(0,0) rotate(0deg)',offset:0},
      {transform:`translate(${dx*.62}px,${dy*.62-28}px) rotate(${landing.rotation*.48}deg)`,offset:.64},
      {transform:`translate(${dx}px,${dy}px) rotate(${landing.rotation}deg)`,offset:1}
    ]:[
      {transform:'translate(0,0) rotate(0deg)',filter:'drop-shadow(0 8px 8px rgba(0,0,0,.32))',offset:0},
      {transform:`translate(0,-30px) rotate(${sideBias*-2}deg)`,filter:'drop-shadow(0 22px 16px rgba(0,0,0,.46))',offset:.24},
      {transform:`translate(${dx*.62}px,${dy*.62-54}px) rotate(${landing.rotation*.48}deg)`,offset:.70},
      {transform:`translate(${dx}px,${dy-12}px) rotate(${landing.rotation}deg)`,offset:.92},
      {transform:`translate(${dx}px,${dy}px) rotate(${landing.rotation}deg)`,filter:'drop-shadow(0 10px 9px rgba(0,0,0,.35))',offset:1}
    ];
    const a=el.animate(frames,{duration,easing:'cubic-bezier(.22,.72,.17,1)',fill:'forwards'});
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
      stagePhysicalCard(card.id,el);
      return {card,el,start:full,i};
    });
    if(prefersReducedMotion()){
      starts.forEach(({el,i})=>{
        const land={left:tr.left+(i-1)*9,top:tr.top+(i-1)*5,width:w,height:h};
        normalizeFixed(el,land); el.style.transform=`rotate(${[-12,1,11][i]}deg)`;
      });
      impactAt(tr); return;
    }
    const duration=motionDuration(720);
    const jobs=starts.map(({el,start,i})=>{
      const land={left:tr.left+(i-1)*10,top:tr.top+(i-1)*6,width:w,height:h,rotation:[-13,1,12][i]};
      const dx=land.left-start.left,dy=land.top-start.top;
      const frames=performanceLite()?[
        {transform:'translate(0,0) rotate(0deg)',offset:0},
        {transform:`translate(${dx*.62}px,${dy*.62-30}px) rotate(${land.rotation*.45}deg)`,offset:.64},
        {transform:`translate(${dx}px,${dy}px) rotate(${land.rotation}deg)`,offset:1}
      ]:[
        {transform:'translate(0,0) rotate(0deg)',offset:0},
        {transform:`translate(${dx*.55}px,${dy*.55-58}px) rotate(${land.rotation*.45}deg)`,offset:.68},
        {transform:`translate(${dx}px,${dy-14}px) rotate(${land.rotation}deg)`,offset:.92},
        {transform:`translate(${dx}px,${dy}px) rotate(${land.rotation}deg)`,offset:1}
      ];
      return el.animate(frames,{duration,easing:'cubic-bezier(.2,.72,.14,1)',fill:'forwards'}).finished.then(()=>{
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
    const el=document.createElement('div'); el.className='physical-card deck-draw-card normal-gameplay-card'; el.dataset.cardId=card.id;
    const inner=document.createElement('div'); inner.className='deck-draw-inner';
    const back=document.createElement('div'); back.className='deck-draw-face deck-draw-back';
    const front=document.createElement('div'); front.className='deck-draw-face deck-draw-front card canonical-card-face';
    front.appendChild(createCardFaceImage(card)); inner.append(back,front); el.appendChild(inner); (els.cardMotionLayer||document.body).appendChild(el); normalizeFixed(el,start);
    stagePhysicalCard(card.id,el);
    if(prefersReducedMotion()){ inner.style.transform='rotateY(180deg)'; return el; }

    const tableR=els.table.getBoundingClientRect();
    const hover={left:Math.min(tableR.right-w-26,start.left+96),top:Math.max(tableR.top+100,start.top-54),width:w,height:h};
    const dx=hover.left-start.left,dy=hover.top-start.top;
    const lift=el.animate([
      {transform:'translate(0,0)',offset:0},
      {transform:'translate(0,-18px)',offset:.35},
      {transform:`translate(${dx}px,${dy}px)`,offset:1}
    ],{duration:motionDuration(360),easing:'cubic-bezier(.22,.72,.2,1)',fill:'forwards'});
    await lift.finished.catch(()=>{});
    const now=el.getBoundingClientRect(); el.getAnimations().forEach(a=>a.cancel()); normalizeFixed(el,now);
    const flip=inner.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:motionDuration(380),easing:'cubic-bezier(.35,.05,.2,1)',fill:'forwards'});
    await flip.finished.catch(()=>{}); inner.style.transform='rotateY(180deg)'; inner.getAnimations().forEach(a=>a.cancel());
    await presentationPause('deckReveal'); return el;
  }

  async function animateStagedSlap(el,card,target,kind='flip'){
    if(TEST_MODE)return;
    const start=el.getBoundingClientRect(); normalizeFixed(el,start);
    const inner=el.querySelector('.deck-draw-inner'); if(inner){inner.style.transform='rotateY(180deg)';}
    const landing=target ? overlapLanding(target) : await freeFloorLanding(card);
    const dx=landing.left-start.left,dy=landing.top-start.top; const duration=motionDuration(500);
    if(prefersReducedMotion()){normalizeFixed(el,landing);el.style.transform=`rotate(${landing.rotation}deg)`;return;}
    if(target) setTimeout(()=>playHitSound(1),Math.max(0,duration-52));
    const a=el.animate([
      {transform:'translate(0,0) rotate(0deg)',offset:0},
      {transform:`translate(${dx*.56}px,${dy*.56-42}px) rotate(${landing.rotation*.42}deg)`,offset:.58},
      {transform:`translate(${dx}px,${dy-10}px) rotate(${landing.rotation}deg)`,offset:.90},
      {transform:`translate(${dx}px,${dy}px) rotate(${landing.rotation}deg)`,offset:1}
    ],{duration,easing:'cubic-bezier(.2,.7,.14,1)',fill:'forwards'});
    await a.finished.catch(()=>{}); el.getAnimations().forEach(x=>x.cancel()); normalizeFixed(el,landing); el.style.transform=`rotate(${landing.rotation}deg)`; impactAt(landing);
  }

  async function stageHandCardForChoice(side,card,sourceRect){
    await preloadCardFace(card);const full=fullSizeSourceRect(sourceRect),el=makePhysicalFace(card,full,'physical-card moving-card');stagePhysicalCard(card.id,el);
    document.querySelectorAll(`[data-card-id="${card.id}"]`).forEach(node=>{if(node!==el)node.style.visibility='hidden';});
    if(!prefersReducedMotion()){const lift=el.animate([{transform:'translate(0,0)'},{transform:`translate(0,${seatForLegacySide(side)==='bottom'?-30:30}px)`}],{duration:motionDuration(240),easing:'ease-out',fill:'forwards'});await lift.finished.catch(()=>{});const held=el.getBoundingClientRect();el.getAnimations().forEach(animation=>animation.cancel());normalizeFixed(el,held);}
    return el;
  }

  function cleanupStagedCard(cardId){const staged=presentation.stagedCards.get(cardId);if(staged){presentation.stagedCards.delete(cardId);staged.remove();}presentation.floorSlotReservations.delete(cardId);}

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
          {transform:'translate(0,0) rotate(0deg)',opacity:1,offset:0},
          {transform:`translate(${dx*.48}px,${dy*.48+curve}px) rotate(${i%2?4:-4}deg)`,opacity:1,offset:.48},
          {transform:`translate(${dx}px,${dy}px) rotate(0deg)`,opacity:.96,offset:1}
        ],{duration:motionDuration(520),easing:'cubic-bezier(.28,.68,.22,1)',fill:'forwards'});
        await a.finished.catch(()=>{});
        presentation.stagedCards.delete(entry.card.id);
        entry.el.remove(); if(entry.sourceEl)entry.sourceEl.remove(); if(entry.placeholder)entry.placeholder.remove(); resolve();
      },i*(performanceLite()?35:70));
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
  async function unlockAudio(){
    const context=presentation.soundEnabled?audioContext():null;
    Object.entries(soundSources).forEach(([name,src])=>{
      if(audioBases[name])return;
      const a=new Audio(src);
      a.preload='auto';
      if(src.startsWith('http'))a.crossOrigin='anonymous';
      audioBases[name]=a;
    });
    if(context?.state==='suspended')await context.resume().catch(()=>{});
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
  let sharedAudioContext=null;
  function audioContext(){
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
    if(!sharedAudioContext)sharedAudioContext=new C();
    return sharedAudioContext;
  }
  function synthNotes(notes){
    if(!presentation.soundEnabled)return;
    try{const c=audioContext();if(!c)return;const now=c.currentTime;notes.forEach(([delay,freq,duration])=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;o.type='triangle';g.gain.setValueAtTime(.18,now+delay);g.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);o.connect(g).connect(c.destination);o.start(now+delay);o.stop(now+delay+duration);});}catch(_){ }
  }
  function traceAudio(name){presentation.audioTrace.push(name);}
  function playProceduralNoise(kind){
    if(!presentation.soundEnabled)return;
    try{const c=audioContext();if(!c)return;const duration=kind==='flush'?1.5:.55,length=Math.floor(c.sampleRate*duration),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);let seed=0x51f15e;for(let i=0;i<length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=(((seed>>>0)/0xffffffff)*2-1)*(1-i/length);}const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();filter.type=kind==='kiss'?'bandpass':'lowpass';filter.frequency.setValueAtTime(kind==='poop'?180:kind==='flush'?1400:900,c.currentTime);if(kind==='flush')filter.frequency.exponentialRampToValueAtTime(110,c.currentTime+1.45);gain.gain.value=kind==='poop'?.42:.22;source.buffer=buffer;source.connect(filter).connect(gain).connect(c.destination);source.start();}catch(_){ }
  }
  let activeDiceSources=[];
  function stopDiceSound(){activeDiceSources.forEach(source=>{try{source.stop();}catch(_){ }});activeDiceSources=[];}
  function playDiceClatter(){
    if(!presentation.soundEnabled)return;
    try{
      const c=audioContext();if(!c||c.state!=='running')return;stopDiceSound();const now=c.currentTime,master=c.createGain();master.gain.value=.9;master.connect(c.destination);
      const impacts=[[0,.026,1850,.13],[.07,.021,2200,.1],[.14,.028,1550,.14],[.23,.02,2450,.09],[.32,.03,1750,.13],[.43,.024,2100,.1],[.55,.032,1450,.14],[.68,.026,1900,.12],[.77,.035,1250,.18],[.84,.055,980,.28]];
      impacts.forEach(([delay,duration,frequency,volume],index)=>{
        const length=Math.max(1,Math.floor(c.sampleRate*duration)),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);let seed=0xd1ce0000+index;
        for(let i=0;i<length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const decay=(1-i/length)**3;data[i]=(((seed>>>0)/0xffffffff)*2-1)*decay;}
        const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.linearRampToValueAtTime(Math.min(.72,volume*2.8),now+delay+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);source.buffer=buffer;source.connect(filter).connect(gain).connect(master);source.start(now+delay);source.stop(now+delay+duration);activeDiceSources.push(source);
      });
      setTimeout(()=>{activeDiceSources=[];},920);
    }catch(_){stopDiceSound();}
  }
  function playSweepSound(){
    if(!presentation.soundEnabled)return;
    traceAudio('sweep');if(TEST_MODE)return;
    try{const c=audioContext();if(!c)return;const now=c.currentTime;[[0,-.75,.55],[.48,.55,-.65]].forEach(([delay,panFrom,panTo],stroke)=>{const duration=.38,length=Math.floor(c.sampleRate*duration),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);let seed=0x5eed1234+stroke;for(let i=0;i<length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const t=i/length,envelope=Math.sin(Math.PI*t)**.7,bristles=.45+.55*Math.abs(Math.sin(i*.043));data[i]=(((seed>>>0)/0xffffffff)*2-1)*envelope*bristles;}const source=c.createBufferSource(),high=c.createBiquadFilter(),band=c.createBiquadFilter(),gain=c.createGain(),pan=typeof c.createStereoPanner==='function'?c.createStereoPanner():null;high.type='highpass';high.frequency.value=1400;band.type='bandpass';band.frequency.setValueAtTime(5200,now+delay);band.frequency.exponentialRampToValueAtTime(2600,now+delay+duration);band.Q.value=.6;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.linearRampToValueAtTime(.2,now+delay+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);source.buffer=buffer;source.connect(high).connect(band).connect(gain);if(pan){gain.connect(pan).connect(c.destination);pan.pan.setValueAtTime(panFrom,now+delay);pan.pan.linearRampToValueAtTime(panTo,now+delay+duration);}else gain.connect(c.destination);source.start(now+delay);source.stop(now+delay+duration);});}catch(_){ }
  }
  function playTapTapSound(){playProceduralNoise('flush');}
  function playKissSound(){
    if(!presentation.soundEnabled)return;
    presentation.kissSoundCount++;traceAudio('kiss');
    if(TEST_MODE)return;
    try{
      const c=audioContext();if(!c)return;const now=c.currentTime;
      const tone=c.createOscillator(),gain=c.createGain();tone.type='sine';tone.frequency.setValueAtTime(260,now);tone.frequency.exponentialRampToValueAtTime(720,now+.18);tone.frequency.exponentialRampToValueAtTime(380,now+.34);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.3,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+.38);tone.connect(gain).connect(c.destination);tone.start(now);tone.stop(now+.4);
      playProceduralNoise('kiss');
    }catch(_){ }
  }
  function playBirdSound(){synthNotes([[0,1600,.12],[.25,1900,.1],[.5,1450,.14],[.8,2100,.1],[1.15,1750,.14]]);}
  function playSadResultSound(){synthNotes([[0,330,.22],[.23,294,.22],[.46,262,.22],[.69,196,.5]]);}
  function playLaughSound(){/* Pooped-pile capture is intentionally silent. */}
  function playShakeSound(){
    [0,260,520].forEach(delay=>setTimeout(()=>playSample('shakeBell',.82,1),delay));
  }
  function playChongtongFanfare(){ playSample('chongtongFanfare',.95,1); }
  function playBombSound(){if(!presentation.soundEnabled)return;traceAudio('bomb');playSample('bomb',1,1,1400);}

  async function animateSweepBroom(){
    if(TEST_MODE||!els.floor)return;
    document.querySelectorAll('.sweep-broom').forEach(node=>node.remove());
    const bounds=els.floor.getBoundingClientRect(),broom=document.createElement('div');
    broom.className='sweep-broom';broom.textContent='🧹';broom.setAttribute('aria-hidden','true');
    broom.style.top=`${bounds.top+bounds.height*.48}px`;document.body.appendChild(broom);
    const animation=broom.animate([{transform:`translate(${bounds.left-120}px,-50%) rotate(-22deg)`},{transform:`translate(${bounds.right+120}px,-50%) rotate(18deg)`}],{duration:motionDuration(1200),easing:'ease-in-out'});
    try{await animation.finished;}catch(_){ }finally{broom.remove();}
  }

  async function showSpecialTransient(title,cardIds=[],effect='',epoch=gameplayPresentationEpoch){
    if(!els.milestoneOverlay||!isGameplayPresentationCurrent(epoch))return;
    const titleKeys={'POOPED!':'pooped','KISS!':'kiss','FLUSH!':'tapTap','CLEAN SWEEP!':'cleanSweep','5-BIRDIES!':'birdies','3-STRIPES!':'threeStripes','5-BRIGHTS!':'fiveBrights'};
    title=t(titleKeys[title]||title);
    els.milestoneTitle.textContent=title;els.milestoneCards.innerHTML='';els.milestoneBirds.innerHTML='';els.milestoneOverlay.dataset.effect=effect;
    cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.milestoneCards.appendChild(createCardEl(card,'card')));
    els.milestoneOverlay.classList.add('show');els.milestoneOverlay.setAttribute('aria-hidden','false');const effectDone=effect==='sweep'?animateSweepBroom():Promise.resolve();await Promise.all([sleep(2000),effectDone]);els.milestoneOverlay.classList.remove('show');els.milestoneOverlay.setAttribute('aria-hidden','true');
    if(!isGameplayPresentationCurrent(epoch))return;
  }
  async function presentSemanticEvents(events,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    for(const event of events){
      if(event.type==='sweepTriggered'){playSweepSound();await showSpecialTransient('CLEAN SWEEP!',event.cardIds||[],'sweep',epoch);if(!isGameplayPresentationCurrent(epoch))return;}
    }
  }
  async function presentKiss(cardIds,epoch=gameplayPresentationEpoch){if(!isGameplayPresentationCurrent(epoch))return;playKissSound();await showSpecialTransient('KISS!',cardIds,'kiss',epoch);}

  function detectNewMilestones(playerId){
    const player=playerStateById(state,playerId),history=presentation.milestoneHistory[playerId],found=[];
    const add=(key,titleKey,cards,birds=false)=>{if(cards.length&&!history.has(key)){history.add(key);found.push({key,titleKey,cardIds:cards.map(card=>card.id),birds});}};
    const godori=[2,4,8].map(month=>player.captured.find(card=>card.month===month&&card.flags.includes('godori'))).filter(Boolean);
    if(godori.length===3)add('godori','birdies',godori,true);
    const stripeTitleKeys={red:'threeStripesRed',blue:'threeStripesBlue',grass:'threeStripesGrass'};
    for(const [set,months] of Object.entries({red:[1,2,3],blue:[6,9,10],grass:[4,5,7]})){
      const cards=months.map(month=>player.captured.find(card=>card.month===month&&card.ribbonSet===set)).filter(Boolean);
      if(cards.length===3)add(`stripes-${set}`,stripeTitleKeys[set],cards);
    }
    const brights=player.captured.filter(card=>card.type==='bright');
    if(brights.length>=5)add('five-brights','fiveBrights',brights.slice(0,5));
    return found;
  }
  async function presentNewMilestones(playerId,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    for(const milestone of detectNewMilestones(playerId)){
      els.milestoneTitle.textContent=t(milestone.titleKey); els.milestoneCards.innerHTML=''; els.milestoneBirds.innerHTML=''; els.milestoneOverlay.dataset.effect='';
      milestone.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean).forEach(card=>els.milestoneCards.appendChild(createCardEl(card,'card')));
      if(milestone.birds)for(let index=0;index<5;index++){const bird=document.createElement('span');bird.textContent='🐦';els.milestoneBirds.appendChild(bird);}
      if(milestone.birds)playBirdSound();
      els.milestoneOverlay.classList.add('show'); els.milestoneOverlay.setAttribute('aria-hidden','false');
      await sleep(2000);
      els.milestoneOverlay.classList.remove('show'); els.milestoneOverlay.setAttribute('aria-hidden','true');
      await sleep(120);
      if(!isGameplayPresentationCurrent(epoch))return;
    }
  }

  async function presentOnlineGoStopDecision(decision,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    presentation.locked=true;render();
    await presentNewMilestones(decision.playerId,epoch);
    if(!isGameplayPresentationCurrent(epoch))return;
    const side=legacySideForPlayerId(decision.playerId),player=state[side],preview=calculateFinalScore(side);
    els.decisionText.textContent=`You have ${decision.score} points.`;
    if(els.stopPreviewValue)els.stopPreviewValue.textContent=t('stopValue',{points:preview.total});
    els.goBtn.textContent=player.go===0?t('go'):`${player.go+1} ${t('go')}`;
    showGameplayModal(els.decisionDialog,epoch);
  }


  function competitiveCardValue(card){
    if(!card)return 0;
    if(card.id==='m9-1'&&card.flags?.includes('switchPi'))return 180;
    if(card.flags?.includes('doublePi'))return 165;
    if(card.type==='bright')return 150;
    if(card.flags?.includes('godori'))return 125;
    if(card.type==='ribbon')return 85;
    if(card.type==='animal')return 55;
    if(card.type==='pi')return 35;
    return 20;
  }
  function competitiveRibbonSetAlive(side,family){
    if(!state||!family)return true;
    const opponent=state[side==='human'?'ai':'human'];
    return !(opponent?.captured||[]).some(card=>card.type==='ribbon'&&card.ribbonSet===family);
  }
  function competitiveCardValueForSide(side,card){
    if(!card)return 0;
    if(card.type==='ribbon'&&card.ribbonSet&&!competitiveRibbonSetAlive(side,card.ribbonSet))return 25;
    return competitiveCardValue(card);
  }
  function competitiveProgressValue(player,gained,side='human'){
    const beforeCards=player?.captured||[],afterCards=[...beforeCards,...(gained||[])],before=score(beforeCards,player?.gukjinMode||'animal'),after=score(afterCards,player?.gukjinMode||'animal');
    let value=Math.max(0,after.total-before.total)*180;
    const brightBefore=beforeCards.filter(card=>card.type==='bright').length,brightAfter=afterCards.filter(card=>card.type==='bright').length;
    if(brightAfter>brightBefore){value+=(brightAfter-brightBefore)*35;if(brightBefore<2&&brightAfter>=2)value+=55;if(brightBefore<3&&brightAfter>=3)value+=220;}
    const godoriBefore=beforeCards.filter(card=>card.flags?.includes('godori')).length,godoriAfter=afterCards.filter(card=>card.flags?.includes('godori')).length;
    if(godoriAfter>godoriBefore){value+=(godoriAfter-godoriBefore)*55;if(godoriBefore<2&&godoriAfter>=2)value+=90;if(godoriBefore<3&&godoriAfter>=3)value+=350;}
    for(const family of ['red','blue','grass']){
      const ribbonBefore=beforeCards.filter(card=>card.type==='ribbon'&&card.ribbonSet===family).length,ribbonAfter=afterCards.filter(card=>card.type==='ribbon'&&card.ribbonSet===family).length;
      if(competitiveRibbonSetAlive(side,family)&&ribbonAfter>ribbonBefore){value+=(ribbonAfter-ribbonBefore)*35;if(ribbonBefore<2&&ribbonAfter>=2)value+=70;if(ribbonBefore<3&&ribbonAfter>=3)value+=280;}
    }
    if(after.piCount>before.piCount){value+=(after.piCount-before.piCount)*18;if(before.piCount<10&&after.piCount>=10)value+=120;}
    if(after.animals>before.animals){value+=(after.animals-before.animals)*16;if(before.animals<5&&after.animals>=5)value+=100;}
    if(after.ribbons>before.ribbons){value+=(after.ribbons-before.ribbons)*18;if(before.ribbons<5&&after.ribbons>=5)value+=100;}
    return value;
  }
  function competitiveMoveUrgency(side,card,target=null){
    if(!state||!card||!target)return {tier:0,matchCount:0,unique:false,familyLock:false,liveStripeTarget:false,immediateScoreGain:0,severeBlock:false};
    const player=state[side],opponent=state[side==='human'?'ai':'human'],matches=matchesFor(card),gained=[card,...expandedTargetCards(target)];
    const before=score(player?.captured||[],player?.gukjinMode||'animal').total,after=score([...(player?.captured||[]),...gained],player?.gukjinMode||'animal').total;
    const immediateScoreGain=Math.max(0,after-before),severeBlock=trainingThreatValue(target,opponent)>=105,unique=matches.length===1;
    const sameFamilyInHand=(player?.hand||[]).filter(item=>item.month===card.month).length;
    const familyLock=sameFamilyInHand>=2&&matches.length===1;
    const liveStripeTarget=target.type==='ribbon'&&!!target.ribbonSet&&competitiveRibbonSetAlive(side,target.ribbonSet);
    const tier=(immediateScoreGain>0||severeBlock)?4:(familyLock||liveStripeTarget)?3:unique?2:1;
    return {tier,matchCount:matches.length,unique,familyLock,liveStripeTarget,immediateScoreGain,severeBlock};
  }
  function competitiveMoveIsBetter(candidate,best){
    if(!best)return true;
    const candidateTier=candidate.urgency?.tier||0,bestTier=best.urgency?.tier||0;
    if(candidateTier!==bestTier)return candidateTier>bestTier;
    if(candidate.score!==best.score)return candidate.score>best.score;
    const candidateKey=candidate.target?(candidate.card.id+'|'+candidate.target.id):candidate.card.id;
    const bestKey=best.target?(best.card.id+'|'+best.target.id):best.card.id;
    return candidateKey<bestKey;
  }
  function competitiveDiscardContext(side,card){
    if(!state||!card)return {retainedFamily:[],unseenFamily:[],bestUnseen:null,bestUnseenValue:0};
    const player=state[side];
    if(!player)return {retainedFamily:[],unseenFamily:[],bestUnseen:null,bestUnseenValue:0};
    const retainedFamily=(player.hand||[]).filter(item=>item.month===card.month&&item.id!==card.id);
    const knownIds=new Set([
      ...(state.human?.hand||[]),...(state.floor||[]),...(state.human?.captured||[]),...(state.ai?.captured||[])
    ].map(item=>item.id));
    const unseenFamily=MASTER_DECK.filter(item=>item.month===card.month&&!knownIds.has(item.id));
    const bestUnseen=unseenFamily.slice().sort((a,b)=>competitiveCardValue(b)-competitiveCardValue(a)||a.id.localeCompare(b.id))[0]||null;
    return {retainedFamily,unseenFamily,bestUnseen,bestUnseenValue:bestUnseen?competitiveCardValue(bestUnseen):0};
  }
  function competitiveMoveScore(side,card,target=null){
    if(!state||!card)return -Infinity;
    const player=state[side],opponent=state[side==='human'?'ai':'human'];
    if(!player)return -Infinity;
    const matches=matchesFor(card);
    if(!target){
      const discard=competitiveDiscardContext(side,card),pairSetup=discard.retainedFamily.length?140:0;
      const futurePremium=discard.retainedFamily.length?0:discard.bestUnseenValue*.7;
      return -competitiveCardValue(card)*1.15+pairSetup-futurePremium;
    }
    const targetBundle=expandedTargetCards(target),gained=[card,...targetBundle],base=gained.reduce((sum,item)=>sum+competitiveCardValueForSide(side,item),0);
    const floorPremium=competitiveCardValueForSide(side,target)*.75;
    const uniqueOpportunity=matches.length===1?120:matches.length===2?-20:-35;
    const sameFamilyInHand=(player.hand||[]).filter(item=>item.month===card.month).length;
    const familyLockBonus=sameFamilyInHand>=2&&matches.length===1?190:0;
    const liveStripeBonus=target.type==='ribbon'&&target.ribbonSet&&competitiveRibbonSetAlive(side,target.ribbonSet)?150:0;
    const scarcePremium=(target.id==='m9-1'&&target.flags?.includes('switchPi'))?120:target.flags?.includes('doublePi')?105:target.type==='bright'?70:target.flags?.includes('godori')?55:0;
    const progress=competitiveProgressValue(player,gained,side);
    const denial=trainingThreatValue(target,opponent)*1.05;
    return base+floorPremium+uniqueOpportunity+familyLockBonus+liveStripeBonus+scarcePremium+progress+denial;
  }
  function bestCompetitiveMove(side){
    const player=state?.[side];
    if(!player?.hand?.length)return null;
    let best=null;
    for(const card of player.hand){
      const matches=matchesFor(card);
      if(matches.length){
        for(const target of matches){
          const move={card,target,score:competitiveMoveScore(side,card,target),matchCount:matches.length,urgency:competitiveMoveUrgency(side,card,target)};
          if(competitiveMoveIsBetter(move,best))best=move;
        }
      }else{
        const move={card,target:null,score:competitiveMoveScore(side,card,null),matchCount:0,urgency:competitiveMoveUrgency(side,card,null)};
        if(competitiveMoveIsBetter(move,best))best=move;
      }
    }
    return best;
  }
  function bestAiCard(){return bestCompetitiveMove('ai')?.card||null;}
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
    const remainingTurns=Math.min(me.hand.length+(me.bombFreeTurns||0),Math.ceil((view.deckCount||0)/2));
    const opponentTurns=Math.min(opponent.handCount??me.hand.length,Math.floor((view.deckCount||0)/2));
    const lead=sc.total-opponentScore,goCount=me.go||0,shakeMultiplier=me.shakeMultiplier||1,carry=view.matchContext?.nagariCarryPower||0;
    const stopValue=sc.total*(goCount>=3?2:1)*shakeMultiplier*(2**carry);
    const counts=cards=>({bright:cards.filter(c=>c.type==='bright').length,animal:cards.filter(c=>c.type==='animal').length,ribbon:cards.filter(c=>c.type==='ribbon').length,pi:score(cards).piCount,godori:cards.filter(c=>c.flags.includes('godori')).length});
    const mine=counts(me.captured),theirs=counts(opponent.captured);
    const categoryUpside=(mine.bright>=2?1.2:0)+(mine.animal>=4?1:0)+(mine.ribbon>=4?1:0)+(mine.pi>=8?1:0)+(mine.godori>=2?1.2:0);
    const proximity=(theirs.bright>=2?.12:0)+(theirs.animal>=4?.1:0)+(theirs.ribbon>=4?.1:0)+(theirs.pi>=8?.12:0)+(theirs.godori>=2?.14:0);
    const lateExposure=remainingTurns<=1?.42:remainingTurns===2?.2:0;
    const lateRisk=lateExposure*(opponentScore<=1&&proximity===0?.18:opponentScore<=3?.55:1);
    const thresholdRisk=Math.min(.42,opponentScore/14)+proximity+(opponentTurns<=1&&opponentScore>=5?.18:0);
    const goBakRisk=goCount>0&&opponentScore>=5?.16:0;
    const riskScore=Math.min(.95,lateRisk+thresholdRisk+goBakRisk);
    const improvement=(remainingTurns*(1.35+categoryUpside*.35))+Math.max(0,lead)*.18;
    const nextGoFactor=goCount>=2?2:(goCount+1)*.1+1;
    const expectedGoValue=(sc.total+improvement)*nextGoFactor*shakeMultiplier*(2**carry)*(1-riskScore);
    const decision=remainingTurns>0&&expectedGoValue>stopValue*(1.06+(opponentScore>=6?.08:0))?'go':'stop';
    const reasons=[];if(lead>=4)reasons.push('large lead');if(remainingTurns>=3)reasons.push('multiple turns remaining');if(riskScore<.35)reasons.push('low opponent scoring threat');if(lateRisk)reasons.push('late hand');if(goBakRisk)reasons.push('Go-bak exposure');
    return {decision,stopValue,expectedGoValue:Number(expectedGoValue.toFixed(2)),riskScore:Number(riskScore.toFixed(3)),remainingTurns,opponentTurns,lead,reasons};
  }
  function aiShouldGo(sc){
    return aiGoStopDecision(engine.projectStateForViewer(state,PLAYER_B),sc).decision==='go';
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
    if(presentation.goCalloutTimer)clearTimeout(presentation.goCalloutTimer);
    presentation.goCalloutTimer=setTimeout(()=>{els.goCallout.classList.remove('show');presentation.goCalloutTimer=null;},900);
  }

  function setGrandResult(call,winnerLabel,scoreText,breakdown,kind='stop'){
    if(els.resultCall){
      els.resultCall.textContent=call;
      els.resultCall.className=`result-call ${kind==='go'?'go-call':kind==='special'?'special-call':'stop-call'}`;
    }
    els.resultTitle.textContent=winnerLabel;
    els.resultScore.textContent=scoreText;
    els.resultBreakdown.textContent=breakdown||'';
    if(els.resultQuitBtn)els.resultQuitBtn.hidden=false;
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

  async function humanGoStop(sc,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const preview=calculateFinalScore('human'),trainingAdvice=presentation.trainingMode&&!onlineMode?trainingGoStopRecommendation(sc):null;
    els.decisionText.textContent=`${t('currentGo',{count:state.human.go})}. ${formatScoreFormula(preview)}.`;
    if(els.stopPreviewValue)els.stopPreviewValue.textContent=t('stopValue',{points:preview.total});
    els.goBtn.textContent=state.human.go===0?t('go'):`${state.human.go+1} ${t('go')}`;
    els.goBtn.classList.toggle('training-choice-recommended',trainingAdvice?.decision==='go');
    els.stopBtn.classList.toggle('training-choice-recommended',trainingAdvice?.decision==='stop');
    if(trainingAdvice){clearTrainingCoach();showTrainingCoach('GO / STOP ADVICE',trainingAdvice.reason);}
    showGameplayDialog(els.decisionDialog,epoch);
  }

  function presentStopResult(result,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const ended=result.events.find(event=>event.type==='handEnded');
    if(!ended)return;
    const side=legacySideForPlayerId(ended.winnerId);
    recordTerminalResult(state.terminalResult);
    presentation.locked=true; hideActionCue();
    setGrandResult(`${t('stop')}!`,side==='human'?t('playerWins'):(onlineMode?t('opponentWins'):t('computerWins')),`${ended.settlement.total} ${t('points')}`,formatScoreFormula(ended.settlement),'stop');
    if(side==='human')playChongtongFanfare();else playSadResultSound();
    showGameplayModal(els.resultDialog,epoch); render();
  }

  async function finishNagari(epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    if(state.winner)return;
    const result=TEST_MODE?resolveNagari(state,{actorId:state.turn}):submitSoloAction({type:'resolveNagari',actorId:state.turn}); state=result.state;
    const event=result.events.find(item=>item.type==='nagariDeclared');
    recordTerminalResult(state.terminalResult);
    presentation.locked=true;
    setGrandResult(t('noWinner'),'',`${t('points')} ×${event.nextHandMultiplier}`,t('noWinnerHelp'),'special');
    showGameplayModal(els.resultDialog,epoch); render();
  }

  function presentThreePpeok(result,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    const event=result.events.find(item=>item.type==='threePpeokDeclared');
    if(!event)return;
    const terminal=state.terminalResult;
    const side=legacySideForPlayerId(event.actorId);
    recordTerminalResult(terminal);
    presentation.locked=true;
    setGrandResult(t('triplePoop'),side==='human'?t('playerWins'):(onlineMode?t('opponentWins'):t('computerWins')),`${terminal.finalPoints} ${t('points')}`,`${t('triplePoop')}${terminal.nagariCarryPower?` · ${t('noWinnerCarry')} ×${terminal.multiplier}`:''}`,'special');
    showGameplayModal(els.resultDialog,epoch); render();
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
    presentation.roundNo=1; presentation.recordedTerminal=null;presentation.sessionStarted=false;presentation.nextStarterId=null;
    if(!TEST_MODE){soloMatchId=null;soloRevision=0;soloActionSequence=0;}
  }
  function consumeSessionStart(){
    if(presentation.sessionStarted)return false;
    presentation.sessionStarted=true;
    return true;
  }
  function confirmNewGame(accepted){
    if(!accepted){if(els.newGameDialog?.open)els.newGameDialog.close();return false;}
    if(els.newGameDialog?.open)els.newGameDialog.close();
    if(onlineMode){return !!onlineSubmit({type:'requestNewGame'});}
    invalidateGameplayPresentation();beginGameplayPresentation();
    if(els.soloStartOverlay)els.soloStartOverlay.hidden=true;unlockAudio();resetSession();startGame(gameplayPresentationEpoch);return true;
  }
  function showFirstPoopNotice(side,generation=localGameGeneration,epoch=gameplayPresentationEpoch){
    if(!els.firstPpeokDialog||!isLocalGamePresentationCurrent(generation)||!isGameplayPresentationCurrent(epoch))return Promise.resolve();
    els.firstPoopTitle.textContent=t('firstPoop');
    els.firstPoopText.textContent=`${side==='human'?t('you'):t(onlineMode?'opponent':'computer')}: ${t('firstPoopBonus')} +7 ${t('points')}`;
    if(!showGameplayModal(els.firstPpeokDialog,epoch))return Promise.resolve();
    return new Promise(resolve=>els.firstPpeokDialog.addEventListener('close',resolve,{once:true}));
  }
  function setLocale(locale){
    presentation.locale=i18n?.dictionaries?.[locale]?locale:'en';
    try{localStorage.setItem('gostop-language',presentation.locale);}catch(_){ }
    document.documentElement.lang=presentation.locale;
    if(els.languageBtn)els.languageBtn.textContent=`${i18n.names[presentation.locale]} ▾`;
    document.querySelectorAll('[data-i18n]').forEach(node=>{let vars={};try{vars=JSON.parse(node.dataset.i18nVars||'{}');}catch(_){ }node.textContent=t(node.dataset.i18n,vars);});
    document.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.i18nAria)));
    refreshModeLocalizedLabels();
    renderTutorialCards();
    if(els.scoreDialog?.open&&presentation.scoreBreakdownPlayerId)openScoreBreakdown(presentation.scoreBreakdownPlayerId);
    if(els.decisionDialog?.open&&state)humanGoStop(scorePlayer(state.human));
    if(state)render();
  }
  function refreshModeLocalizedLabels(){
    const opponentName=document.querySelector('.cpu-chip .player-identity strong'),opponentAvatar=document.querySelector('.cpu-avatar'),opponentZone=document.querySelector('.opponent-zone'),opponentCaptureTitle=document.querySelector('.cpu-capture-panel .capture-panel-title');
    const opponentKey=onlineMode?'opponent':'computer',capturedKey=onlineMode?'opponentCaptured':'computerCaptured',cardsKey=onlineMode?'opponentCards':'computerCards';
    if(opponentName)opponentName.textContent=t(opponentKey);
    if(opponentAvatar)opponentAvatar.textContent=t(opponentKey).slice(0,3).toUpperCase();
    if(opponentZone)opponentZone.setAttribute('aria-label',t(opponentKey));
    if(opponentCaptureTitle)opponentCaptureTitle.textContent=t(capturedKey);
    if(els.aiHand)els.aiHand.setAttribute('aria-label',t(cardsKey));
    if(els.aiCaptured)els.aiCaptured.setAttribute('aria-label',t(capturedKey));
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
    const tutorialQueries={bright:card=>card.type==='bright',animal:card=>card.type==='animal',ribbon:card=>card.type==='ribbon',single:card=>card.type==='pi'&&!card.flags.includes('doublePi'),'doublePi-11':card=>card.month===11&&card.flags.includes('doublePi'),'doublePi-12':card=>card.month===12&&card.flags.includes('doublePi'),switchPi:card=>card.flags.includes('switchPi')};
    const tutorialQueryLimits={bright:5,animal:5,ribbon:5,single:5,'doublePi-11':1,'doublePi-12':1,switchPi:1};
    document.querySelectorAll('.tutorial-cards[data-tutorial-query]').forEach(root=>{root.replaceChildren();MASTER_DECK.filter(tutorialQueries[root.dataset.tutorialQuery]||(()=>false)).slice(0,tutorialQueryLimits[root.dataset.tutorialQuery]||1).forEach(card=>root.appendChild(createCardEl(card,'card tutorial-game-card')));});
    const monthGuide=document.getElementById('monthGuide');
    if(monthGuide){monthGuide.replaceChildren();for(let month=1;month<=12;month++){const article=document.createElement('article'),heading=document.createElement('h4'),description=document.createElement('p'),cards=document.createElement('div');heading.textContent=localizedMonth(month);description.textContent=t(`month${month}`);cards.className='tutorial-cards';MASTER_DECK.filter(card=>card.month===month).forEach(card=>{const item=document.createElement('span');item.className='tutorial-month-card';item.appendChild(createCardEl(card,'card tutorial-game-card'));const label=document.createElement('small');label.textContent=t(card.id==='m9-1'?'sakeCup':card.flags.includes('doublePi')?'doubleSingle':card.type==='bright'?'brights':card.type==='animal'?'pictures':card.type==='ribbon'?'stripes':'singles');item.appendChild(label);cards.appendChild(item);});article.append(heading,cards,description);monthGuide.appendChild(article);}}
  }

  function trainingThreatValue(card,opponent=state?.ai){
    if(!card||!opponent)return 0;
    const captured=opponent.captured||[];
    let threat=0;
    if(card.type==='ribbon'){
      const family=card.ribbonSet||'plain';
      const sameFamily=captured.filter(item=>item.type==='ribbon'&&(item.ribbonSet||'plain')===family).length;
      if(card.ribbonSet&&sameFamily>=2)threat=Math.max(threat,120+sameFamily);
      const ribbonCount=captured.filter(item=>item.type==='ribbon').length;
      if(ribbonCount>=4)threat=Math.max(threat,78+ribbonCount);
    }
    if(card.flags.includes('godori')){
      const godoriCount=captured.filter(item=>item.flags.includes('godori')).length;
      if(godoriCount>=2)threat=Math.max(threat,118+godoriCount);
    }
    if(card.type==='bright'&&captured.filter(item=>item.type==='bright').length>=2)threat=Math.max(threat,105);
    if(card.type==='animal'&&captured.filter(item=>item.type==='animal').length>=4)threat=Math.max(threat,82);
    const before=score(captured,opponent.gukjinMode||'animal').total;
    const after=score([...captured,card],opponent.gukjinMode||'animal').total;
    if(after>before)threat=Math.max(threat,92+(after-before)*4);
    return threat;
  }
  function trainingWarningCard(){
    if(!state)return null;
    return state.floor.map(card=>({card,value:trainingThreatValue(card,state.ai)})).filter(item=>item.value>0).sort((a,b)=>b.value-a.value||captureValue(b.card)-captureValue(a.card)||a.card.month-b.card.month)[0]?.card||null;
  }

  const TRAINING_RIBBON_MONTHS=Object.freeze({red:Object.freeze([1,2,3]),blue:Object.freeze([6,9,10]),grass:Object.freeze([4,5,7])});
  function trainingFlowerName(month){return cardFamilyName(month);}
  function trainingRibbonName(value){return cardRibbonName(value)||'Stripe';}
  function trainingCardName(card){return cardDisplayName(card);}
  function trainingCategoryName(card){
    if(!card)return 'card';
    if(card.flags?.includes('godori'))return 'bird Picture';
    return card.type==='bright'?'Bright':card.type==='animal'?'Picture':card.type==='ribbon'?'Stripe':card.flags?.includes('doublePi')?'2x Single':'Single';
  }
  function trainingPiUnits(card){
    if(!card)return 0;
    if(card.id==='m9-1'&&card.flags?.includes('switchPi'))return 2;
    if(card.type!=='pi')return 0;
    return card.flags?.includes('doublePi')?2:1;
  }
  function trainingReachableFloorCards(human=state?.human){
    if(!human||!state)return [];
    const months=new Set((human.hand||[]).map(card=>card.month));
    return (state.floor||[]).filter(card=>months.has(card.month));
  }
  function trainingRibbonRoute(family,human=state?.human){
    if(!human||!state)return {family,name:trainingRibbonName(family),alive:false,strong:false,veryStrong:false,controlledCount:0,potentialCount:0,immediateCount:0,captured:[],inHand:[],playable:[],claimable:[],lost:[]};
    const routeMonths=TRAINING_RIBBON_MONTHS[family]||[],hand=human.hand||[],captured=human.captured||[],opponent=state.ai?.captured||[];
    const capturedRoute=captured.filter(card=>card.type==='ribbon'&&card.ribbonSet===family);
    const inHand=hand.filter(card=>card.type==='ribbon'&&card.ribbonSet===family);
    const playable=inHand.filter(card=>(state.floor||[]).some(target=>target.month===card.month));
    const claimable=(state.floor||[]).filter(card=>card.type==='ribbon'&&card.ribbonSet===family&&hand.some(held=>held.month===card.month));
    const lost=opponent.filter(card=>card.type==='ribbon'&&card.ribbonSet===family);
    const capturedMonths=new Set(capturedRoute.map(card=>card.month).filter(month=>routeMonths.includes(month)));
    const playableHandMonths=new Set(playable.map(card=>card.month).filter(month=>routeMonths.includes(month)));
    const tableClaimableMonths=new Set(claimable.map(card=>card.month).filter(month=>routeMonths.includes(month)));
    const immediatelySecurable=new Set([...capturedMonths,...playableHandMonths,...tableClaimableMonths]);
    const potential=new Set([...capturedRoute,...inHand,...claimable].map(card=>card.month).filter(month=>routeMonths.includes(month)));
    const controlledCount=immediatelySecurable.size,potentialCount=potential.size,alive=lost.length===0;
    return {
      family,name:trainingRibbonName(family),alive,strong:alive&&controlledCount>=2,veryStrong:alive&&controlledCount>=3,
      controlledCount,potentialCount,immediateCount:new Set([...playableHandMonths,...tableClaimableMonths]).size,
      capturedCount:capturedMonths.size,inHandCount:new Set(inHand.map(card=>card.month)).size,playableHandCount:playableHandMonths.size,tableClaimableCount:tableClaimableMonths.size,
      captured:capturedRoute,inHand,playable,claimable,lost
    };
  }
  function trainingGodoriRoute(human=state?.human){
    if(!human||!state)return {alive:false,strong:false,veryStrong:false,controlledCount:0,potentialCount:0,immediateCount:0};
    const months=[2,4,8],hand=human.hand||[],captured=human.captured||[],opponent=state.ai?.captured||[];
    const isBird=card=>card.flags?.includes('godori')&&months.includes(card.month);
    const mineCaptured=captured.filter(isBird),inHand=hand.filter(isBird),playable=inHand.filter(card=>(state.floor||[]).some(target=>target.month===card.month)),claimable=(state.floor||[]).filter(card=>isBird(card)&&hand.some(held=>held.month===card.month)),lost=opponent.filter(isBird);
    const controlledCount=new Set([...mineCaptured,...playable,...claimable].map(card=>card.month)).size,potentialCount=new Set([...mineCaptured,...inHand,...claimable].map(card=>card.month)).size,alive=lost.length===0;
    return {alive,strong:alive&&controlledCount>=2,veryStrong:alive&&controlledCount>=3,controlledCount,potentialCount,immediateCount:new Set([...playable,...claimable].map(card=>card.month)).size,captured:mineCaptured,inHand,playable,claimable,lost};
  }
  function trainingBrightRoute(human=state?.human){
    if(!human||!state)return {alive:false,strong:false,veryStrong:false,fiveBrightNear:false,controlledCount:0,potentialCount:0,immediateCount:0,lostCount:0};
    const hand=human.hand||[],captured=human.captured||[],opponent=state.ai?.captured||[];
    const mineCaptured=captured.filter(card=>card.type==='bright'),inHand=hand.filter(card=>card.type==='bright'),playable=inHand.filter(card=>(state.floor||[]).some(target=>target.month===card.month)),claimable=(state.floor||[]).filter(card=>card.type==='bright'&&hand.some(held=>held.month===card.month)),lost=opponent.filter(card=>card.type==='bright');
    const controlledCount=new Set([...mineCaptured,...playable,...claimable].map(card=>card.id)).size,potentialCount=new Set([...mineCaptured,...inHand,...claimable].map(card=>card.id)).size,alive=(5-lost.length)>=3;
    return {alive,strong:alive&&controlledCount>=2,veryStrong:alive&&controlledCount>=3,fiveBrightNear:lost.length===0&&controlledCount>=4,controlledCount,potentialCount,immediateCount:new Set([...playable,...claimable].map(card=>card.id)).size,lostCount:lost.length,captured:mineCaptured,inHand,playable,claimable,lost};
  }
  function trainingStrategyProfile(human=state?.human){
    if(!human||!state)return {primary:'single',label:'Singles',summary:'No major set is close yet, so build Singles and take 2x Singles when available.',priorityText:'2x Singles > Singles > Brights > Stripes > ordinary Pictures.',godoriViable:false,fiveBrightViable:false,brightViable:false,stripeViable:false,activeRibbonFamilies:[],ribbonRoutes:{},weights:{}};
    const hand=human.hand||[],captured=human.captured||[],reachable=trainingReachableFloorCards(human);
    const ribbonRoutes=Object.fromEntries(['red','blue','grass'].map(family=>[family,trainingRibbonRoute(family,human)]));
    const strongestRibbon=Object.values(ribbonRoutes).sort((a,b)=>Number(b.veryStrong)-Number(a.veryStrong)||b.controlledCount-a.controlledCount||b.immediateCount-a.immediateCount||a.family.localeCompare(b.family))[0]||null;
    const brightRoute=trainingBrightRoute(human),godoriRoute=trainingGodoriRoute(human);
    const activeRibbonFamilies=Object.values(ribbonRoutes).filter(route=>route.strong).map(route=>route.family);
    let primary='single';
    if(brightRoute.fiveBrightNear)primary='bright';
    else if(godoriRoute.veryStrong&&godoriRoute.immediateCount>0)primary='godori';
    else if(strongestRibbon?.veryStrong&&strongestRibbon.immediateCount>0)primary='stripe';
    else if(brightRoute.strong)primary='bright';
    else if(godoriRoute.strong)primary='godori';
    else if(strongestRibbon?.strong)primary='stripe';
    const label=primary==='stripe'?(strongestRibbon.name+' Stripes'):primary==='bright'?'Brights':primary==='godori'?'Godori bird set':'Singles';
    const priorityText=primary==='stripe'
      ?strongestRibbon.name+' Stripe set > Brights > 2x Singles > Singles > ordinary Pictures.'
      :primary==='bright'
        ?'Brights > strong Stripe sets > 2x Singles > Singles > ordinary Pictures.'
        :primary==='godori'
          ?'Godori > Brights > strong Stripe sets > 2x Singles > Singles > ordinary Pictures.'
          :'2x Singles > Singles > Brights > Stripes > ordinary Pictures.';
    let summary='';
    if(primary==='stripe')summary=strongestRibbon.name+' Stripes are the clearest immediate route: '+strongestRibbon.controlledCount+' of the 3 set cards are captured, in hand with a current match, or directly claimable from the table'+(strongestRibbon.potentialCount>strongestRibbon.controlledCount?(' ('+strongestRibbon.potentialCount+' are still possible including cards only held in hand)'):'')+'.';
    else if(primary==='bright')summary='Brights are the clearest route: you already have or can immediately reach '+brightRoute.controlledCount+' Brights.';
    else if(primary==='godori')summary='Godori is live: you already have or can immediately reach '+godoriRoute.controlledCount+' of the 3 bird cards.';
    else summary='No major set is close yet, so build Singles and take 2x Singles when available.';
    const currentPi=score(captured,human.gukjinMode||'animal').piCount;
    const piPotential=currentPi+hand.reduce((sum,card)=>sum+trainingPiUnits(card),0)+reachable.reduce((sum,card)=>sum+trainingPiUnits(card),0);
    const backup=primary==='stripe'&&brightRoute.strong?'Brights are a strong backup.':primary==='bright'&&strongestRibbon?.strong?(strongestRibbon.name+' Stripes are a strong backup.'):primary!=='godori'&&godoriRoute.strong?'Godori is a strong backup.':'';
    return {
      primary,label,summary,priorityText,backup,brightRoute,godoriRoute,ribbonRoutes,strongestRibbon,
      fiveBrightViable:brightRoute.fiveBrightNear,brightViable:brightRoute.strong,godoriViable:godoriRoute.strong,
      stripeViable:Object.values(ribbonRoutes).some(route=>route.strong),activeRibbonFamilies,
      piPotential,currentPi,ownedBright:brightRoute.controlledCount,ownedGodori:godoriRoute.controlledCount,
      ownedRibbon:(captured.filter(card=>card.type==='ribbon').length+hand.filter(card=>card.type==='ribbon').length),
      reachableBright:brightRoute.immediateCount,reachableGodori:godoriRoute.immediateCount,
      reachableRibbon:Object.values(ribbonRoutes).reduce((sum,route)=>sum+route.immediateCount,0),
      opponentBright:brightRoute.lostCount,opponentGodori:godoriRoute.lost?.length||0,
      opponentRibbon:(state.ai?.captured||[]).filter(card=>card.type==='ribbon').length
    };
  }
  function trainingStrategicCardValue(card,profile=trainingStrategyProfile()){
    if(!card)return 0;
    if(card.flags?.includes('godori')){
      if(profile.godoriRoute?.veryStrong)return 520;
      if(profile.godoriRoute?.strong)return 430;
      return 60;
    }
    if(card.id==='m9-1'&&card.flags?.includes('switchPi'))return profile.primary==='single'?380:300;
    if(card.type==='bright')return 300+(profile.brightRoute?.strong?80:0)+(profile.primary==='bright'?90:0);
    if(card.type==='ribbon'){
      const route=profile.ribbonRoutes?.[card.ribbonSet];
      if(route&&!route.alive)return 60;
      return 180+(route?.strong?100:0)+(route?.veryStrong?170:0)+(profile.primary==='stripe'&&profile.strongestRibbon?.family===card.ribbonSet?90:0);
    }
    if(card.type==='pi'){
      if(card.flags?.includes('doublePi'))return profile.primary==='single'?400:285;
      return profile.primary==='single'?245:125;
    }
    return 50;
  }
  function trainingPublicMonthCards(month){
    if(!state)return [];
    return [...(state.human?.hand||[]),...(state.floor||[]),...(state.human?.captured||[]),...(state.ai?.captured||[])].filter(card=>card.month===month);
  }
  function trainingIsReservedPlay(card,target){
    if(!card||!target||card.month!==target.month||!state)return false;
    const visible=new Set(trainingPublicMonthCards(card.month).map(item=>item.id));
    return visible.size===4;
  }
  function trainingCaptureDescription(cards){
    const counts=new Map();
    (cards||[]).forEach(card=>{const label=trainingCategoryName(card);counts.set(label,(counts.get(label)||0)+1);});
    const parts=[...counts].map(([label,count])=>count===1?('a '+label):(count+' '+label+'s'));
    return parts.length<=1?(parts[0]||'cards'):parts.length===2?(parts[0]+' + '+parts[1]):(parts.slice(0,-1).join(', ')+' + '+parts.at(-1));
  }
  function trainingThreatValue(card,opponent=state?.ai){
    if(!card||!opponent)return 0;
    const captured=opponent.captured||[];
    let threat=0;
    if(card.type==='ribbon'){
      const family=card.ribbonSet||'plain';
      const sameFamily=captured.filter(item=>item.type==='ribbon'&&(item.ribbonSet||'plain')===family).length;
      if(card.ribbonSet&&sameFamily>=2)threat=Math.max(threat,120+sameFamily);
      const ribbonCount=captured.filter(item=>item.type==='ribbon').length;
      if(ribbonCount>=4)threat=Math.max(threat,78+ribbonCount);
    }
    if(card.flags.includes('godori')){
      const godoriCount=captured.filter(item=>item.flags.includes('godori')).length;
      if(godoriCount>=2)threat=Math.max(threat,118+godoriCount);
    }
    if(card.type==='bright'&&captured.filter(item=>item.type==='bright').length>=2)threat=Math.max(threat,105);
    if(card.type==='animal'&&captured.filter(item=>item.type==='animal').length>=4)threat=Math.max(threat,82);
    const before=score(captured,opponent.gukjinMode||'animal').total;
    const after=score([...captured,card],opponent.gukjinMode||'animal').total;
    if(after>before)threat=Math.max(threat,92+(after-before)*4);
    return threat;
  }
  function trainingWarningCard(){
    if(!state)return null;
    return state.floor.map(card=>({card,value:trainingThreatValue(card,state.ai)})).filter(item=>item.value>0).sort((a,b)=>b.value-a.value||captureValue(b.card)-captureValue(a.card)||a.card.month-b.card.month)[0]?.card||null;
  }
  function trainingThreatReason(card,opponent=state?.ai){
    if(!card||!opponent)return '';
    const captured=opponent.captured||[];
    if(card.ribbonSet){
      const count=captured.filter(item=>item.type==='ribbon'&&item.ribbonSet===card.ribbonSet).length;
      if(count>=2)return 'It also blocks the computer from completing its '+trainingRibbonName(card.ribbonSet)+' Stripe set.';
    }
    if(card.flags.includes('godori')){
      const count=captured.filter(item=>item.flags.includes('godori')).length;
      if(count>=2)return 'It also blocks the computer from completing Godori.';
    }
    if(card.type==='bright'){
      const count=captured.filter(item=>item.type==='bright').length;
      if(count>=2)return 'It also keeps the computer from reaching 3 Brights as easily.';
    }
    if(card.type==='animal'){
      const count=captured.filter(item=>item.type==='animal').length;
      if(count>=4)return 'It also slows the computer before it reaches Picture scoring.';
    }
    if(card.type==='ribbon'){
      const count=captured.filter(item=>item.type==='ribbon').length;
      if(count>=4)return 'It also slows the computer before it reaches Stripe scoring.';
    }
    const before=score(captured,opponent.gukjinMode||'animal').total,after=score([...captured,card],opponent.gukjinMode||'animal').total;
    return after>before?'It also denies the computer an immediate scoring card.':'';
  }
  function trainingOpportunityReason(gained,human=state?.human){
    if(!human||!gained?.length)return '';
    const captured=human.captured||[],after=[...captured,...gained];
    const beforeScore=score(captured,human.gukjinMode||'animal'),afterScore=score(after,human.gukjinMode||'animal');
    const godoriBefore=captured.filter(item=>item.flags.includes('godori')).length,godoriAfter=after.filter(item=>item.flags.includes('godori')).length;
    if(godoriBefore<3&&godoriAfter>=3)return 'This completes the 3-bird Godori set.';
    for(const family of ['red','blue','grass']){
      const before=captured.filter(item=>item.type==='ribbon'&&item.ribbonSet===family).length,afterCount=after.filter(item=>item.type==='ribbon'&&item.ribbonSet===family).length;
      if(before<3&&afterCount>=3)return 'This completes the '+trainingRibbonName(family)+' Stripe set.';
    }
    const brightBefore=captured.filter(item=>item.type==='bright').length,brightAfter=after.filter(item=>item.type==='bright').length;
    if(brightBefore<3&&brightAfter>=3)return 'This reaches 3 Brights and starts Bright scoring.';
    const animalBefore=captured.filter(item=>item.type==='animal').length,animalAfter=after.filter(item=>item.type==='animal').length;
    if(animalBefore<5&&animalAfter>=5)return 'This reaches 5 Pictures and starts Picture scoring.';
    const ribbonBefore=captured.filter(item=>item.type==='ribbon').length,ribbonAfter=after.filter(item=>item.type==='ribbon').length;
    if(ribbonBefore<5&&ribbonAfter>=5)return 'This reaches 5 Stripes and starts Stripe scoring.';
    if(beforeScore.piCount<10&&afterScore.piCount>=10)return 'This reaches 10 Singles and starts Single scoring.';
    if(afterScore.total>beforeScore.total)return 'This raises your visible score from '+beforeScore.total+' to '+afterScore.total+'.';
    return '';
  }
  function trainingCandidate(card,profile=trainingStrategyProfile()){
    if(!card||!state)return null;
    const matches=matchesFor(card);
    if(!matches.length){
      const strategic=trainingStrategicCardValue(card,profile),competitive=competitiveMoveScore('human',card,null),discardContext=competitiveDiscardContext('human',card);
      return {card,target:null,reserved:false,score:competitive-strategic*.15,competitive,discardContext,matchCount:0,uniqueFloorOpportunity:false,profile,captureDescription:'',gained:[],opportunity:'',threat:'',reason:'',shortWhy:'No card for capture is available on the table.'};
    }
    let best=null;const targetChoices=[];
    for(const target of matches){
      const gained=[card,...expandedTargetCards(target)],blockValue=trainingThreatValue(target,state.ai),opportunity=trainingOpportunityReason(gained,state.human),threat=trainingThreatReason(target,state.ai);
      const strategic=gained.reduce((sum,item)=>sum+trainingStrategicCardValue(item,profile),0);
      const before=score(state.human.captured||[],state.human.gukjinMode||'animal').total,after=score([...(state.human.captured||[]),...gained],state.human.gukjinMode||'animal').total;
      const scoreGain=Math.max(0,after-before),reserved=trainingIsReservedPlay(card,target),captureDescription=trainingCaptureDescription(gained);
      const route=target.type==='ribbon'?profile.ribbonRoutes?.[target.ribbonSet]:null;
      const routeBonus=route?.veryStrong?150:route?.strong?70:0;
      const premiumSingle=target.flags?.includes('doublePi')?70:target.id==='m9-1'&&target.flags?.includes('switchPi')?90:0;
      const brightBonus=target.type==='bright'&&profile.brightRoute?.strong?70:0;
      const godoriBonus=target.flags?.includes('godori')&&profile.godoriRoute?.strong?90:0;
      const competitive=competitiveMoveScore('human',card,target),urgency=competitiveMoveUrgency('human',card,target),uniqueFloorOpportunity=urgency.unique;
      const value=competitive+strategic*.25+blockValue*.35+scoreGain*35+(opportunity?55:0)+routeBonus+premiumSingle+brightBonus+godoriBonus;
      const candidate={card,target,reserved,score:value,competitive,urgency,matchCount:matches.length,uniqueFloorOpportunity,profile,captureDescription,gained,opportunity,threat,reason:'',shortWhy:''};
      targetChoices.push(candidate);
      if(!best||value>best.score||(value===best.score&&target.id<best.target.id))best=candidate;
    }
    if(best)best.targetAlternatives=targetChoices.filter(candidate=>candidate.target.id!==best.target.id).sort((a,b)=>b.score-a.score||a.target.id.localeCompare(b.target.id));
    return best;
  }
  function trainingNoCaptureReason(best){
    const base='No card for capture is available on the table.';
    const context=best?.discardContext||competitiveDiscardContext('human',best?.card);
    if(context?.retainedFamily?.length){
      const family=trainingFlowerName(best.card.month);
      return base+' You have another '+family+' card in hand, so if this card stays on the table, you can capture it on your next turn.';
    }
    return base+' This gives up a lower-value card while preserving stronger future options.';
  }
  function trainingMoveWhy(candidate,profile=candidate?.profile||trainingStrategyProfile()){
    if(!candidate?.target)return candidate?.shortWhy||'No card for capture is available on the table.';
    if(candidate.opportunity)return candidate.opportunity;
    const gained=candidate.gained||[],urgency=candidate.urgency||competitiveMoveUrgency('human',candidate.card,candidate.target);
    if(urgency.familyLock){
      const family=trainingFlowerName(candidate.card.month),targetName=trainingCardName(candidate.target);
      return 'You have 2 '+family+' cards in hand and 1 '+family+' card on the table. Use one '+family+' card now to capture '+targetName+' while keeping the other '+family+' card in hand.';
    }
    const stripe=gained.find(card=>card.type==='ribbon');
    if(stripe){
      const route=profile.ribbonRoutes?.[stripe.ribbonSet];
      if(route&&!route.alive)return 'This adds to your total Stripe count, but the '+route.name+' 3-Stripe set is already broken.';
      if(route?.potentialCount>=3)return 'This captures a Stripe and gives you a strong chance to complete the '+route.name+' 3-Stripe set.';
      if(route?.potentialCount>=2)return 'This captures a Stripe and keeps the '+route.name+' 3-Stripe set within reach.';
      if(route?.alive)return 'This captures a '+route.name+' Stripe while its 3-Stripe path is still open.';
      return 'This captures a Stripe and builds toward Stripe scoring.';
    }
    if(gained.some(card=>card.type==='bright')){
      return profile.brightRoute?.strong?'Brights are a strong route in this hand, and this capture moves you closer to a 3-Bright score.':'A Bright is the strongest available scoring card here.';
    }
    if(gained.some(card=>card.flags?.includes('doublePi')))return 'A 2x Single counts as two Singles, so it is worth more than an ordinary Single or Picture when no stronger set is close.';
    if(gained.some(card=>card.id==='m9-1'&&card.flags?.includes('switchPi')))return 'The Sake Cup can count as 2 Singles, making it much more valuable than an ordinary Single.';
    if(gained.some(card=>card.flags?.includes('godori'))&&profile.godoriRoute?.strong)return 'This keeps the 3-bird Godori set within reach.';
    if(gained.some(card=>card.type==='pi')){
      const familyStripe=MASTER_DECK.find(card=>card.month===candidate.card.month&&card.type==='ribbon'&&card.ribbonSet);
      const brokenStripe=familyStripe?profile.ribbonRoutes?.[familyStripe.ribbonSet]:null;
      if(brokenStripe&&!brokenStripe.alive)return 'The '+brokenStripe.name+' 3-Stripe set is already broken, so building Singles is more valuable now.';
      return 'No stronger scoring capture is available, so building Singles is the best scoring route.';
    }
    return 'This is the strongest available scoring capture.';
  }
  function trainingAlternativeSummary(best,sorted){
    const routeFamily=best?.target?.type==='ribbon'?best.target.ribbonSet:null;
    const alternative=sorted.find(candidate=>candidate.target&&(candidate.card.id!==best.card.id||candidate.target.id!==best.target.id)&&(!routeFamily||candidate.target.ribbonSet!==routeFamily))
      ||sorted.find(candidate=>candidate.target&&(candidate.card.id!==best.card.id||candidate.target.id!==best.target.id));
    if(!alternative?.target)return '';
    const bestRoute=routeFamily?best.profile.ribbonRoutes?.[routeFamily]:null;
    if(bestRoute?.veryStrong&&alternative.target.flags?.includes('doublePi'))return 'The '+trainingCardName(alternative.target)+' is a valuable 2x Single, but take the '+bestRoute.name+' Stripe first because that set is close to completion.';
    if(bestRoute?.veryStrong&&alternative.gained?.some(card=>card.type==='bright'))return 'The Bright is also strong, but the '+bestRoute.name+' Stripe set is much closer to completion right now.';
    return 'Next best: '+trainingCardName(alternative.card)+' onto '+trainingCardName(alternative.target)+'.';
  }
  function trainingRecommendation(){
    if(!state||state.turn!==PLAYER_A||!state.human?.hand?.length)return null;
    const profile=trainingStrategyProfile(),candidates=state.human.hand.map(card=>trainingCandidate(card,profile)).filter(Boolean),hits=candidates.filter(candidate=>candidate.target),liveHits=hits.filter(candidate=>!candidate.reserved);
    const pool=liveHits.length?liveHits:(hits.length?hits:candidates);
    if(!pool.length)return null;
    const sorted=[...pool].sort((a,b)=>{
      const aTier=a.urgency?.tier||0,bTier=b.urgency?.tier||0;
      return bTier-aTier||b.score-a.score||a.card.month-b.card.month||a.card.id.localeCompare(b.card.id);
    });
    const best={...sorted[0]},why=best.target?trainingMoveWhy(best,profile):trainingNoCaptureReason(best);
    const action=best.target?'Play '+trainingCardName(best.card)+' onto '+trainingCardName(best.target)+'.':'Play '+trainingCardName(best.card)+'.';
    const reservedNote=best.reserved&&!liveHits.length?' This is the only guaranteed table capture left, so now is the right time to take it.':'';
    const threat=best.threat?(' '+best.threat):'';
    best.shortWhy=why;
    best.reason=[action,why+reservedNote,threat].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    return best;
  }
  function recommendedHumanCard(){return trainingRecommendation()?.card||null;}
  function trainingAlternativeReason(chosen,recommended=trainingRecommendation()){
    if(!chosen||!recommended||chosen.id===recommended.card.id)return '';
    return 'Play '+trainingCardName(recommended.card)+(recommended.target?(' onto '+trainingCardName(recommended.target)):'')+' instead. '+(recommended.shortWhy||trainingMoveWhy(recommended));
  }
  function trainingOpeningStrategy(){
    if(!state?.human)return '';
    const profile=trainingStrategyProfile(state.human);
    if(profile.primary==='stripe'){
      const route=profile.strongestRibbon,locations=[];
      const setFamilies=(TRAINING_RIBBON_MONTHS[route.family]||[]).map(trainingFlowerName);
      const totalHandStripes=(state.human.hand||[]).filter(card=>card.type==='ribbon').length;
      if(route.capturedCount)locations.push('You already captured '+route.capturedCount+' of these set Stripe'+(route.capturedCount===1?'':'s'));
      if(route.inHandCount)locations.push('you have '+route.inHandCount+' of these set Stripe'+(route.inHandCount===1?'':'s')+' in hand');
      if(route.tableClaimableCount)locations.push(route.tableClaimableCount+' more set Stripe'+(route.tableClaimableCount===1?' is':'s are')+' on the table you can take now');
      const locationText=locations.length===1?locations[0]:locations.length===2?(locations[0]+' and '+locations[1]):(locations.slice(0,-1).join(', ')+', and '+locations.at(-1));
      const totalHandText=totalHandStripes>route.inHandCount
        ?(' You have '+totalHandStripes+' Stripe cards total in hand, but only '+route.inHandCount+' '+(route.inHandCount===1?'belongs':'belong')+' to this 3-card scoring set.')
        :'';
      const playableText=route.playableHandCount
        ?(' '+route.playableHandCount+' of your in-hand set Stripe'+(route.playableHandCount===1?' can':'s can')+' be played onto a matching family on the table now.')
        :'';
      return ('Best plan: '+route.name+' Stripe set ('+setFamilies.join(', ')+'). '+locationText+'.'+totalHandText+playableText+' That puts '+route.controlledCount+' of the 3 scoring-set Stripes within immediate reach. '+profile.backup).trim();
    }
    if(profile.primary==='bright')return ('Best plan: Brights. You already have or can immediately reach '+profile.brightRoute.controlledCount+' Brights, so protect that route and take Bright captures when they are available. '+profile.backup).trim();
    if(profile.primary==='godori')return ('Best plan: Godori. You already have or can immediately reach '+profile.godoriRoute.controlledCount+' of the 3 bird cards, so protect that set while it is still live. '+profile.backup).trim();
    return 'Best plan: Singles. No major set is close yet, so take 2x Singles first and build Singles steadily; use Brights or Stripes when a clear set opportunity appears.';
  }
  function trainingGukjinRecommendation(human=state?.human){
    if(!human)return null;
    const captured=human.captured||[],gukjin=captured.find(card=>card.id==='m9-1');
    if(!gukjin)return null;
    const asPicture=scoreWithGukjinMode(captured,false),asSingle=scoreWithGukjinMode(captured,true),profile=trainingStrategyProfile(human);
    let mode='pi';
    if(asPicture.total>asSingle.total)mode='animal';
    else if(asSingle.total>asPicture.total)mode='pi';
    else if(asPicture.animalPts>asSingle.animalPts)mode='animal';
    else if(asSingle.piPts>asPicture.piPts)mode='pi';
    else if(profile.primary==='single')mode='pi';
    else if(asPicture.animals>=4&&asSingle.piCount<8)mode='animal';
    const choice=mode==='pi'?'Use as Single':'Use as Picture';
    let reason='';
    if(mode==='pi'){
      if(asSingle.piPts>asPicture.piPts)reason='Use as 2 Singles. That gives you '+asSingle.piCount+' Single value and '+asSingle.piPts+' Single point'+(asSingle.piPts===1?'':'s')+' now; as a Picture it would give '+asPicture.animals+' Pictures and '+asPicture.animalPts+' Picture points.';
      else if(profile.primary==='single')reason='Use as 2 Singles. Singles are your best current scoring route, and this card advances that route twice as fast as an ordinary Single.';
      else reason='Use as 2 Singles. You would have '+asSingle.piCount+' Single value, which is more useful right now than one ordinary Picture.';
    }else{
      if(asPicture.animalPts>asSingle.animalPts)reason='Use as Picture. It gives you '+asPicture.animals+' Pictures and '+asPicture.animalPts+' Picture point'+(asPicture.animalPts===1?'':'s')+' now; using it as 2 Singles would leave you at '+asSingle.piCount+' Single value.';
      else reason='Use as Picture. You are closer to Picture scoring than to 10 Singles, so the Picture side is more useful right now.';
    }
    return {mode,choice,profile,asPicture,asSingle,reason:'Recommended: '+choice+'. '+reason};
  }
  function trainingScoreGainParts(before,after){
    const parts=[];
    const brightGain=(after.brightPts||0)-(before.brightPts||0);
    if(brightGain>0)parts.push((after.bright===3?'3 Brights':'Brights')+' add '+brightGain+' point'+(brightGain===1?'':'s'));
    let animalGain=(after.animalPts||0)-(before.animalPts||0);
    if(!before.godori&&after.godori){parts.push('Godori adds 5 points');animalGain-=5;}
    if(animalGain>0)parts.push(after.animals+' Pictures add '+animalGain+' point'+(animalGain===1?'':'s'));
    const ribbonGain=(after.ribbonPts||0)-(before.ribbonPts||0);
    if(ribbonGain>0)parts.push('Stripes add '+ribbonGain+' point'+(ribbonGain===1?'':'s'));
    const piGain=(after.piPts||0)-(before.piPts||0);
    if(piGain>0)parts.push('Singles add '+piGain+' point'+(piGain===1?'':'s'));
    return parts;
  }
  function trainingOpponentVisibleThreat(maxTurns=1,opponent=state?.ai){
    if(!state||!opponent)return {canWin:false,beforeScore:0,afterScore:0,gain:0,targets:[],sources:[],scoreParts:[]};
    const before=scorePlayer(opponent),knownIds=new Set([
      ...(state.human?.hand||[]),...(state.human?.captured||[]),...(opponent.captured||[]),...(state.floor||[])
    ].map(card=>card.id));
    const unseen=MASTER_DECK.filter(card=>!knownIds.has(card.id)),groups=[],seenBundles=new Set();
    for(const target of state.floor||[]){
      const cards=expandedTargetCards(target),key=cards.map(card=>card.id).sort().join('|');
      if(!key||seenBundles.has(key))continue;
      seenBundles.add(key);groups.push({target,cards,month:target.month});
    }
    const maxCaptures=Math.min(groups.length,Math.max(0,Math.trunc(maxTurns))*2);
    let best={canWin:false,beforeScore:before.total,afterScore:before.total,gain:0,targets:[],sources:[],scoreParts:[]};
    const consider=(selected,sources)=>{
      const added=new Map();
      selected.flatMap(group=>group.cards).forEach(card=>added.set(card.id,card));
      sources.forEach(card=>added.set(card.id,card));
      const after=scorePlayer({...opponent,captured:[...(opponent.captured||[]),...added.values()]}),gain=after.total-before.total,canWin=after.total>=finishThreshold;
      const candidate={canWin,beforeScore:before.total,afterScore:after.total,gain,targets:selected.map(group=>group.target),sources:[...sources],scoreParts:trainingScoreGainParts(before,after)};
      const betterWin=canWin&&!best.canWin;
      const sameClass=canWin===best.canWin;
      const simplerWin=canWin&&sameClass&&(candidate.targets.length<best.targets.length||(candidate.targets.length===best.targets.length&&candidate.gain<best.gain));
      const strongerNonWin=!canWin&&sameClass&&candidate.afterScore>best.afterScore;
      if(betterWin||simplerWin||strongerNonWin)best=candidate;
    };
    const chooseSources=(selected,index=0,sources=[],used=new Set())=>{
      if(index>=selected.length){consider(selected,sources);return;}
      for(const source of unseen){
        if(source.month!==selected[index].month||used.has(source.id))continue;
        used.add(source.id);sources.push(source);chooseSources(selected,index+1,sources,used);sources.pop();used.delete(source.id);
      }
    };
    const chooseGroups=(size,startIndex=0,selected=[])=>{
      if(selected.length===size){chooseSources(selected);return;}
      for(let index=startIndex;index<groups.length;index++){selected.push(groups[index]);chooseGroups(size,index+1,selected);selected.pop();}
    };
    for(let size=1;size<=maxCaptures;size++)chooseGroups(size);
    return best;
  }
  function trainingOpponentThreatExplanation(threat){
    if(!threat?.canWin)return '';
    const names=threat.targets.map(trainingCardName),capture=names.length===1
      ?'match and capture '+names[0]+' from the table'
      :'match and capture '+names.join(' and ')+' during its play and draw';
    const scoring=threat.scoreParts.length?threat.scoreParts.join(' and '):('the captures add '+threat.gain+' points');
    return 'The computer is at '+threat.beforeScore+'. If it can '+capture+', '+scoring+', taking it from '+threat.beforeScore+' to '+threat.afterScore+' — enough to reach the '+finishThreshold+'-point finish threshold.';
  }
  function trainingGoStopRecommendation(sc=scorePlayer(state?.human||{captured:[]})){
    if(!state?.human||!state?.ai)return null;
    const opponentScore=scorePlayer(state.ai).total,preview=calculateFinalScore('human');
    const view={ai:state.human,human:{...state.ai,handCount:state.ai.hand?.length||0},deckCount:state.deck?.length||0,matchContext:state.matchContext||{}};
    const analysis=aiGoStopDecision(view,sc),profile=trainingStrategyProfile(state.human),turns=analysis.remainingTurns;
    const immediateThreat=trainingOpponentVisibleThreat(1),horizonTurns=Math.max(1,Math.min(2,analysis.opponentTurns||1)),horizonThreat=trainingOpponentVisibleThreat(horizonTurns);
    const safePressure=turns>=2&&opponentScore<=1&&!horizonThreat.canWin;
    const decision=immediateThreat.canWin?'stop':safePressure?'go':analysis.decision;
    let reason='';
    if(decision==='stop'){
      if(immediateThreat.canWin)reason='STOP. Lock in '+preview.total+' points now. '+trainingOpponentThreatExplanation(immediateThreat);
      else if(opponentScore>=5)reason='STOP. Lock in '+preview.total+' points now. The computer already has '+opponentScore+' points, so one strong turn could swing the hand.';
      else if(turns<=1)reason='STOP. Lock in '+preview.total+' points now. Only one scoring turn remains, so another Go risks giving up guaranteed points without enough time to improve.';
      else reason='STOP. Lock in '+preview.total+' points now. The extra upside from another Go is smaller than the comeback risk.';
    }else{
      const upside=profile.primary==='stripe'?('your '+profile.strongestRibbon.name+' Stripe set is still close'):profile.primary==='bright'?'your Bright route is still strong':profile.primary==='godori'?'Godori is still within reach':'you still have useful scoring cards left';
      if(safePressure)reason='GO. You lead '+sc.total+'–'+opponentScore+' with '+turns+' turns left. The computer has no visible route to '+finishThreshold+' from the current table over its next '+horizonTurns+' turn'+(horizonTurns===1?'':'s')+', so there is time to press your lead.';
      else reason='GO. You lead '+sc.total+'–'+opponentScore+' with '+turns+' turn'+(turns===1?'':'s')+' left, and '+upside+'. There is enough upside to keep playing.';
    }
    return {...analysis,decision,reason,stopPoints:preview.total,opponentScore,immediateThreat,horizonThreat};
  }

  let trainingOpeningDismissLayer=null,trainingOpeningDismissResolve=null;
  function closeTrainingOpeningCoach({unlock=false}={}){
    trainingOpeningDismissLayer?.remove?.();trainingOpeningDismissLayer=null;
    const resolve=trainingOpeningDismissResolve;trainingOpeningDismissResolve=null;
    presentation.trainingOpeningPinned=false;hideTrainingCoach();
    if(unlock){presentation.locked=false;render();}
    if(resolve)setTimeout(resolve,250);
  }
  function showTrainingCoach(title,text){
    if(!presentation.trainingMode||!text||TEST_MODE)return;
    if(els.trainingCoachTitle)els.trainingCoachTitle.textContent=title||'Training Coach';
    if(els.trainingCoachText)els.trainingCoachText.textContent=text;
    if(els.trainingCoachPanel)els.trainingCoachPanel.hidden=false;
  }
  function restoreTrainingCoachHome(){
    if(TEST_MODE||!els.trainingCoachPanel)return;
    const stage=document.querySelector('main.game-stage');
    if(stage?.parentNode)stage.parentNode.insertBefore(els.trainingCoachPanel,stage);
    else if(document.body&&!document.body.contains(els.trainingCoachPanel))document.body.appendChild(els.trainingCoachPanel);
  }
  function showTrainingSpecialCoach(dialog,title,text){
    if(!presentation.trainingMode||onlineMode||!dialog||!text||TEST_MODE)return;
    hideTrainingCoach();
    if(els.trainingCoachPanel&&!dialog.contains(els.trainingCoachPanel))dialog.appendChild(els.trainingCoachPanel);
    showTrainingCoach(title,text);
  }
  function closeTrainingSpecialCoach(){
    if(TEST_MODE)return;
    hideTrainingCoach();
    restoreTrainingCoachHome();
  }
  function showTrainingOpeningStrategy(text){
    if(!presentation.trainingMode||!text||TEST_MODE)return Promise.resolve();
    if(presentation.trainingHintTimer){clearTimeout(presentation.trainingHintTimer);presentation.trainingHintTimer=null;}
    closeTrainingOpeningCoach({unlock:false});
    presentation.trainingOpeningPinned=true;presentation.locked=true;
    showTrainingCoach('Opening Strategy',`${text} Tap or click anywhere when you are ready to continue.`);
    render();
    trainingOpeningDismissLayer=document.createElement('div');
    trainingOpeningDismissLayer.className='training-opening-dismiss-layer';
    trainingOpeningDismissLayer.setAttribute('role','button');
    trainingOpeningDismissLayer.setAttribute('aria-label','Dismiss opening strategy and continue');
    trainingOpeningDismissLayer.tabIndex=0;
    document.body.appendChild(trainingOpeningDismissLayer);
    return new Promise(resolve=>{
      trainingOpeningDismissResolve=resolve;
      const finish=event=>{event?.preventDefault?.();event?.stopPropagation?.();closeTrainingOpeningCoach({unlock:true});};
      trainingOpeningDismissLayer.addEventListener('click',finish,{once:true});
      trainingOpeningDismissLayer.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();finish(event);}});
    });
  }
  function hideTrainingCoach(){if(!TEST_MODE&&els.trainingCoachPanel)els.trainingCoachPanel.hidden=true;}
  function applyTrainingRecommendation(recommendation,{showMessage=true}={}){
    if(!recommendation)return;
    presentation.hintCardId=recommendation.card?.id||null;
    presentation.trainingRecommendedFloorCardId=recommendation.target?.id||null;
    presentation.trainingWarningFloorCardId=recommendation.target&&trainingThreatValue(recommendation.target,state.ai)>0?recommendation.target.id:null;
    presentation.trainingTurnRecommendation=recommendation;
    render();
    if(showMessage)showTrainingCoach('Recommended Move',recommendation.reason);
  }
  function recommendHumanCard(){
    if(!state||state.turn!==PLAYER_A||presentation.locked)return;
    applyTrainingRecommendation(trainingRecommendation());
  }
  function clearTrainingCoach(clearVisuals=true){
    if(presentation.trainingHintTimer){clearTimeout(presentation.trainingHintTimer);presentation.trainingHintTimer=null;}
    if(presentation.trainingOpeningPinned)closeTrainingOpeningCoach({unlock:false});
    if(clearVisuals){presentation.hintCardId=null;presentation.trainingWarningFloorCardId=null;presentation.trainingRecommendedFloorCardId=null;presentation.trainingTurnRecommendation=null;hideTrainingCoach();}
  }
  function setTrainingMode(enabled){clearTrainingCoach();presentation.trainingMode=!!enabled;if(!enabled)hideTrainingCoach();}
  function armTrainingCoach(){
    clearTrainingCoach();
    if(!presentation.trainingMode||onlineMode||!state||state.winner||state.turn!==PLAYER_A||presentation.locked)return;
    presentation.trainingHintTimer=setTimeout(()=>{
      presentation.trainingHintTimer=null;
      if(!presentation.trainingMode||onlineMode||!state||state.winner||state.turn!==PLAYER_A||presentation.locked)return;
      applyTrainingRecommendation(trainingRecommendation());
    },5000);
  }

  function openingStarterMessage(starter,isOnline=onlineMode){
    return isOnline?t(starter===PLAYER_A?'youGoFirst':'opponentGoesFirst'):t('goesFirst',{player:starter===PLAYER_A?t('player'):t('computer')});
  }

  async function presentOpeningSequence(starter,roll,epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    if(!roll)throw new Error('Dice presentation is restricted to the first hand of a session.');
    presentation.dicePresentationCount++;
    if(TEST_MODE){presentation.diceSoundCount++;traceAudio('dice');return;}
    els.openingOverlay.classList.add('show');els.openingOverlay.setAttribute('aria-hidden','false');
    if(els.soloStartOverlay?.dataset.launching==='true'){delete els.soloStartOverlay.dataset.launching;delete els.soloStartOverlay.dataset.launchingText;els.soloStartOverlay.hidden=true;}
    els.openingMessage.textContent='';els.openingDie.hidden=!roll;
    const dieFaces=onlineMode?['Y','O']:['P','C'];
    if(roll){
      els.openingDie.classList.add('rolling');playDiceSound();let face=0;
      const timer=setInterval(()=>{els.openingDie.textContent=dieFaces[face++%2];},performanceLite()?130:90);
      await sleep(performanceLite()?620:900);clearInterval(timer);
      if(!isGameplayPresentationCurrent(epoch))return;
      els.openingDie.classList.remove('rolling');els.openingDie.textContent=starter===PLAYER_A?dieFaces[0]:dieFaces[1];
    }
    els.openingMessage.textContent=openingStarterMessage(starter);await sleep(650);
    if(!isGameplayPresentationCurrent(epoch))return;
    els.openingDie.hidden=true;await sleep(250);
    if(!isGameplayPresentationCurrent(epoch))return;
    els.openingOverlay.classList.remove('show');els.openingOverlay.setAttribute('aria-hidden','true');
    await presentDealSequence(epoch);
  }
  async function presentDealSequence(epoch=gameplayPresentationEpoch){
    if(TEST_MODE||!isGameplayPresentationCurrent(epoch))return;
    presentation.deckDisplayCount=48;render();
    const dealStep=performanceLite()?2:1,dealDelay=performanceLite()?44:72;
    for(let count=47;count>=20;count-=dealStep){
      if(!isGameplayPresentationCurrent(epoch))return;
      presentation.deckDisplayCount=count;render();await sleep(dealDelay);
    }
    if(!isGameplayPresentationCurrent(epoch))return;
    presentation.deckDisplayCount=null;render();
  }
  function playDiceSound(){if(!presentation.soundEnabled)return;presentation.diceSoundCount++;traceAudio('dice');if(!TEST_MODE)playDiceClatter();}
  async function startGame(epoch=gameplayPresentationEpoch){
    if(!isGameplayPresentationCurrent(epoch))return;
    resetHandPresentationState();hideActionCue();
    if(presentation.shakeResolver){presentation.shakeResolver(false);presentation.shakeResolver=null;}
    if(presentation.bombResolver){presentation.bombResolver(false);presentation.bombResolver=null;}
    if(!TEST_MODE)document.querySelectorAll('dialog[open]').forEach(dialog=>{try{dialog.close();}catch(_){ }});
    const nagariCarryPower=state?.matchContext?.nagariCarryPower||0;
    const firstSessionHand=consumeSessionStart();
    if(firstSessionHand&&!TEST_MODE){await unlockAudio();if(!isGameplayPresentationCurrent(epoch))return;}
    const starter=presentation.nextStarterId||(firstSessionHand?(secureRandomInt(2)===0?PLAYER_A:PLAYER_B):(state?.startingPlayerId||PLAYER_A));
    state=freshState(nagariCarryPower,starter);presentation.locked=true;presentation.aiTurnInProgress=false;presentation.hintCardId=null;presentation.recordedTerminal=null;
    presentation.milestoneHistory={playerA:new Set(),playerB:new Set()};
    els.roundNo.textContent=presentation.roundNo;render();
    if(firstSessionHand)await presentOpeningSequence(starter,true,epoch);
    else await presentDealSequence(epoch);
    if(!isGameplayPresentationCurrent(epoch))return;
    const openingAdvice=presentation.trainingMode?trainingOpeningStrategy():'';
    if(openingAdvice)await showTrainingOpeningStrategy(openingAdvice);
    if(!isGameplayPresentationCurrent(epoch))return;
    presentation.locked=true;render();
    await processOpeningSpecials(epoch);
  }
  function cancelLocalGamePresentation(){
    localGameActive=false;localGameGeneration++;presentation.locked=true;invalidateGameplayPresentation();publishPlayerActivity(false,'menu');
  }
  async function launchLocalGame(training=false){
    publishPlayerActivity(true,training?'training':'free-solo',false);
    if(globalThis.goStopOnlineSession){try{globalThis.goStopOnlineSession.close();}catch(_){}globalThis.goStopOnlineSession=null;}
    const freePanel=document.getElementById('freeFriendPanel'),competitivePanel=document.getElementById('onlineLobbyPanel');
    if(freePanel)freePanel.hidden=true;if(competitivePanel)competitivePanel.hidden=true;
    onlineMode=false;latestOnlineSnapshot=null;state=null;resetSession();setTrainingMode(training);localGameActive=true;localGameGeneration++;beginGameplayPresentation();
    document.documentElement.classList.remove('gostop-boot-pending');await unlockAudio();els.soloStartOverlay.hidden=true;await startGame();
  }


  document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});
  if(!TEST_MODE){addEventListener('resize',updateStageScale);updateStageScale();}
  setupLanguageMenu();
  document.querySelector('.human-chip .score-pill')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closePlayerInfo();openScoreBreakdown(PLAYER_A);});
  document.querySelector('.cpu-chip .score-pill')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closePlayerInfo();openScoreBreakdown(PLAYER_B);});
  document.querySelectorAll('.game-capture-panel').forEach(panel=>{
    const playerId=panel.contains(els.playerCaptured)?PLAYER_A:PLAYER_B;
    panel.addEventListener('click',event=>{if(event.defaultPrevented)return;event.preventDefault();event.stopPropagation();closePlayerInfo();openScoreBreakdown(playerId);});
  });
  document.querySelectorAll('.capture-summary-trigger[data-score-owner]').forEach(trigger=>{
    const playerId=trigger.dataset.scoreOwner==='player'?PLAYER_A:PLAYER_B;
    const open=event=>{event.preventDefault();event.stopPropagation();closePlayerInfo();openScoreBreakdown(playerId);};
    trigger.addEventListener('click',open);
    trigger.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;open(event);});
  });
  if(els.scoreDialog)els.scoreDialog.addEventListener('click',event=>{if(event.target===els.scoreDialog)els.scoreDialog.close();});
  function syncTutorialPlatformGuide(){
    if(TEST_MODE||!els.howToDialog)return;
    const mobile=(Number(globalThis.navigator?.maxTouchPoints||0)>0)||!!globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    els.howToDialog.querySelectorAll('[data-tutorial-platform]').forEach(node=>{node.hidden=node.dataset.tutorialPlatform!==(mobile?'mobile':'desktop');});
  }
  els.howToBtn.addEventListener('click',()=>{syncTutorialPlatformGuide();const sections=els.howToDialog.querySelector('.tutorial-sections');if(sections)sections.scrollTop=0;els.howToDialog.showModal();});
  els.howToDialog.querySelector('.tutorial-nav')?.addEventListener('click',event=>{const link=event.target.closest('a[href^="#guide-"]');if(!link)return;const target=els.howToDialog.querySelector(link.getAttribute('href'));if(!target)return;event.preventDefault();target.scrollIntoView({block:'start',behavior:'smooth'});});
  els.howToDialog.addEventListener('click',event=>{if(event.target===els.howToDialog)els.howToDialog.close();});
  if(els.shakeReviewDialog)els.shakeReviewDialog.addEventListener('click',()=>els.shakeReviewDialog.close());
  if(els.railHowTo)els.railHowTo.addEventListener('click',()=>{syncTutorialPlatformGuide();els.howToDialog.showModal();});
  if(els.railNewGame)els.railNewGame.addEventListener('click',()=>els.newGameDialog.showModal());
  els.playerHand.addEventListener('pointerleave',()=>setActiveHoveredHandCard(null));
  if(els.soundToggle)els.soundToggle.addEventListener('click',()=>{presentation.soundEnabled=!presentation.soundEnabled;els.soundToggle.querySelector('span').textContent=presentation.soundEnabled?'Sound On':'Sound Off';if(presentation.soundEnabled)unlockAudio();});
  els.newGameBtn.addEventListener('click',()=>{onlineQuitFromResult=false;els.quitConfirmTitle.textContent=t('quitConfirmTitle');els.quitConfirmMessage.textContent=t('quitConfirmMessage');els.quitConfirmDialog.showModal();});
  els.newGameYesBtn.addEventListener('click',()=>confirmNewGame(true));
  els.newGameNoBtn.addEventListener('click',()=>confirmNewGame(false));
  els.playAgainBtn.addEventListener('click',()=>{if(onlineMode){onlinePlayAgain();}else{presentation.roundNo++;invalidateGameplayPresentation();beginGameplayPresentation();startGame(gameplayPresentationEpoch);}});
  els.resultQuitBtn.addEventListener('click',()=>{onlineQuitFromResult=true;if(els.resultDialog.open)els.resultDialog.close();els.quitConfirmTitle.textContent=t('resultQuitConfirm');els.quitConfirmMessage.textContent=t('resultQuit');els.quitConfirmDialog.showModal();});
  els.quitNoBtn.addEventListener('click',()=>{els.quitConfirmDialog.close();if(onlineQuitFromResult&&!els.resultDialog.open)els.resultDialog.showModal();onlineQuitFromResult=false;});
  els.quitYesBtn.addEventListener('click',()=>{if(onlineMode){if(onlineSubmit({type:'quitGame'}))els.quitConfirmDialog.close();}else{els.quitConfirmDialog.close();onlineQuitFromResult=false;cancelLocalGamePresentation();setTrainingMode(false);els.soloStartOverlay.hidden=false;}});
  els.cancelNewGameBtn.addEventListener('click',()=>{const requestId=latestOnlineSnapshot?.sessionFlow?.newGameRequest?.requestId;if(requestId)onlineSubmit({type:'cancelNewGame',requestId});});
  els.acceptNewGameBtn.addEventListener('click',()=>{const requestId=latestOnlineSnapshot?.sessionFlow?.newGameRequest?.requestId;if(requestId)onlineSubmit({type:'respondNewGame',requestId,accept:true});});
  els.rejectNewGameBtn.addEventListener('click',()=>{const requestId=latestOnlineSnapshot?.sessionFlow?.newGameRequest?.requestId;if(requestId)onlineSubmit({type:'respondNewGame',requestId,accept:false});});
  const chooseGukjinMode=mode=>{
    if(onlineMode){onlineSubmit({type:'setGukjinMode',mode});els.gukjinDialog.close();return;}
    applyNormalAction({type:'setGukjinMode',actorId:PLAYER_A,mode});
    els.gukjinDialog.close(); render();
  };
  els.gukjinPictureBtn.addEventListener('click',()=>chooseGukjinMode('animal'));
  els.gukjinSingleBtn.addEventListener('click',()=>chooseGukjinMode('pi'));
  els.hintBtn.addEventListener('click',recommendHumanCard);
  els.trainingCoachDismiss?.addEventListener('click',hideTrainingCoach);
  els.goBtn.addEventListener('click',()=>{
    if(onlineMode){if(onlineSubmit({type:'declareGo'}))els.decisionDialog.close();return;}
    if(!state||state.turn!==PLAYER_A)return;
    const result=applyGoStopDecision({type:'declareGo',actorId:PLAYER_A});
    els.decisionDialog.close();
    if(result.events.some(event=>event.type==='goDeclared'))showGoCallout('human');
    presentation.locked=true; render();
    if(result.requiresNagari)setTimeout(finishNagari,0); else setTimeout(scheduleTurnStart,1150);
  });
  els.stopBtn.addEventListener('click',()=>{
    if(onlineMode){if(onlineSubmit({type:'declareStop'}))els.decisionDialog.close();return;}
    if(!state||state.turn!==PLAYER_A)return;
    const result=applyGoStopDecision({type:'declareStop',actorId:PLAYER_A});
    els.decisionDialog.close(); presentStopResult(result);
  });


  if(els.shakeBtn)els.shakeBtn.addEventListener('click',()=>{
    if(onlineMode){els.shakeDialog.close();onlineSubmit({type:'declareShake'});return;}
    if(!presentation.shakeResolver)return;
    const r=presentation.shakeResolver; presentation.shakeResolver=null; els.shakeDialog.close(); r(true);
  });
  if(els.keepSecretBtn)els.keepSecretBtn.addEventListener('click',()=>{
    if(onlineMode){const action=state.pendingDecision?.type==='openingTripleDecision'&&state.pendingDecision.floorCardId?'declareBomb':'keepShakeSecret';els.shakeDialog.close();onlineSubmit({type:action});return;}
    if(!presentation.shakeResolver)return; const r=presentation.shakeResolver; presentation.shakeResolver=null; els.shakeDialog.close(); r(false);
  });
  if(els.bombBtn)els.bombBtn.addEventListener('click',()=>{
    if(onlineMode){els.bombDialog.close();onlineSubmit({type:'declareBomb'});return;}
    if(!presentation.bombResolver)return; const r=presentation.bombResolver; presentation.bombResolver=null; els.bombDialog.close(); r(true);
  });
  if(els.playOneBtn)els.playOneBtn.addEventListener('click',()=>{
    if(onlineMode){els.bombDialog.close();onlineSubmit({type:'declineBomb'});return;}
    if(!presentation.bombResolver)return; const r=presentation.bombResolver; presentation.bombResolver=null; els.bombDialog.close(); r(false);
  });


  if(els.captureDialog)els.captureDialog.addEventListener('click',e=>{
    if(e.target===els.captureDialog)els.captureDialog.close();
  });

  if(els.shakeDialog){
    els.shakeDialog.addEventListener('cancel',e=>{
      if(presentation.shakeResolver){e.preventDefault();const r=presentation.shakeResolver;presentation.shakeResolver=null;els.shakeDialog.close();r(false);}
    });
    els.shakeDialog.addEventListener('close',closeTrainingSpecialCoach);
  }
  if(els.bombDialog){
    els.bombDialog.addEventListener('cancel',e=>{
      if(presentation.bombResolver){e.preventDefault();const r=presentation.bombResolver;presentation.bombResolver=null;els.bombDialog.close();r(false);}
    });
    els.bombDialog.addEventListener('close',closeTrainingSpecialCoach);
  }

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
      onlineValueForViewer,openingStarterMessage,
      canSubmitPlayAgain,isOnlineSessionFlowAction,rememberOnlineHandSource,takeOnlineHandSource,hasUnpresentedLocalHandMovement,
      viewerSeatMap,viewerRelativePlayers,seatForLegacySide,
      monthListHas,monthListAdd,monthListDelete,serializeGameState,deserializeGameState,initializeShakeEligibility,resolveOpeningState,resolveNagari,resolveThreePpeok,
      masterDeck:()=>MASTER_DECK.map(cloneCard),
      card:id=>cloneCard(MASTER_DECK.find(c=>c.id===id)),
      makePlayer:makeTestPlayer,
      makeState:makeTestState,
      setState(next){state=next;},
      setOnlineMode(value){onlineMode=!!value;},
      setOnlineSubmit(fn){onlineSubmit=fn;},
      setLocale,refreshModeLocalizedLabels,
      getState(){return state;},
      setNagariCarryPower(value){state.matchContext.nagariCarryPower=value;},
      getNagariCarryPower(){return state.matchContext.nagariCarryPower;},
      setPreviousScores(human,ai){state.matchContext.lastScoreBySide.playerA=human;state.matchContext.lastScoreBySide.playerB=ai;},
      assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,hasFourOfMonth,cardFamilyName,cardDisplayName,
      markInitialFloorStacks,initFloorSlots,firstFreeFloorSlot,reserveFloorSlot,
      commitFloorSlot,addFloorCard,removeFloorCards,effectiveFloorMatchCards,expandedTargetCards,
      stackStealCount,makePpeokStack,score,scoreWithGukjinMode,formatScoreFormula,goCountLabel,detectNewMilestones,deckVisualBackCount,computeStageScale,competitiveCardValue,competitiveRibbonSetAlive,competitiveCardValueForSide,competitiveProgressValue,competitiveMoveUrgency,competitiveMoveIsBetter,competitiveDiscardContext,competitiveMoveScore,bestCompetitiveMove,bestAiCard,aiGoStopDecision,
      calculateFinalScore,resolveSingleCard,resolveCombinedTurn,applySweepIfNeeded,
      stealPiAnimated,consumeBombBlank,canDeclareShake,reachedNewFinishScore,
      trainingThreatValue,trainingWarningCard,trainingThreatReason,trainingOpportunityReason,trainingFlowerName,trainingCardName,trainingRibbonRoute,trainingGodoriRoute,trainingBrightRoute,trainingStrategyProfile,trainingStrategicCardValue,trainingIsReservedPlay,trainingCandidate,trainingNoCaptureReason,trainingRecommendation,trainingAlternativeReason,trainingOpeningStrategy,trainingGukjinRecommendation,trainingScoreGainParts,trainingOpponentVisibleThreat,trainingOpponentThreatExplanation,trainingGoStopRecommendation,recommendedHumanCard,setTrainingMode,clearTrainingCoach,armTrainingCoach,
      executeBombTurn,processOpeningSpecials,finishNagari,concludeTurn,confirmNewGame,resetSession,consumeSessionStart,presentOpeningSequence,presentDealSequence,presentPiTransferEvents,presentNewMilestones,presentOnlineGoStopDecision,setActiveHoveredHandCard,playDiceSound,playKissSound,playSweepSound,playBombSound,resetHandPresentationState,
      stableFloorTilt,stableStackAngle,shuffle,cardSize,fullSizeSourceRect,presentationPacing:PRESENTATION_PACING,
      getLocked(){return presentation.locked;},
      getPresentationSnapshot(){
        return {
          floorSlotReservations:Object.fromEntries(presentation.floorSlotReservations),
          stagedCardCount:presentation.stagedCards.size,
          locked:presentation.locked,
          hintCardId:presentation.hintCardId,
          trainingMode:presentation.trainingMode,
          trainingWarningFloorCardId:presentation.trainingWarningFloorCardId,
          trainingRecommendedFloorCardId:presentation.trainingRecommendedFloorCardId,
          trainingOpeningPinned:presentation.trainingOpeningPinned,
          sessionStarted:presentation.sessionStarted,
          dicePresentationCount:presentation.dicePresentationCount,
          diceSoundCount:presentation.diceSoundCount,
          kissSoundCount:presentation.kissSoundCount,
          piTransferAnimationCount:presentation.piTransferAnimationCount,
          activePhysicalMotions:presentation.activePhysicalMotions,
          rendersDuringPhysicalMotion:presentation.rendersDuringPhysicalMotion,
          audioTrace:[...presentation.audioTrace],
          activeHoveredHandCardId:presentation.activeHoveredHandCardId,
          sessionStats:JSON.parse(JSON.stringify(presentation.sessionStats))
        };
      },
      resetAudioTrace(){presentation.audioTrace.length=0;},
      resetPiTransferAnimationCount(){presentation.piTransferAnimationCount=0;},
      beginPhysicalMotion(){presentation.activePhysicalMotions++;},
      endPhysicalMotion(){presentation.activePhysicalMotions=Math.max(0,presentation.activePhysicalMotions-1);},
      notePresentationRender,
      resetPhysicalMotionTrace(){presentation.activePhysicalMotions=0;presentation.rendersDuringPhysicalMotion=0;},
      setSoundEnabled(value){presentation.soundEnabled=!!value;}
    });
  }else{
    preloadCardFaces();
    els.playSoloBtn.addEventListener('click',()=>launchLocalGame(false));
    els.trainingModeBtn?.addEventListener('click',()=>launchLocalGame(true));
    const onlineStatus=document.getElementById('onlineStatus'),freeOnlineStatus=document.getElementById('freeOnlineStatus'),freeFriendPanel=document.getElementById('freeFriendPanel'),createOnlineBtn=document.getElementById('createOnlineBtn'),joinOnlineForm=document.getElementById('joinOnlineForm');
    let activeOnlineStatus=onlineStatus,onlineAnonymousMode=false;
    let onlinePresentationQueue=Promise.resolve(),onlineDealPresented=false,onlineSkipInitialOpening=false,onlinePresentedMatchId=null,onlineStageState={},onlinePresentedEvents=new Set(),onlineSessionGeneration=0,onlinePresentationEpoch=0,onlineJoinInFlight=false;
    const isOnlinePresentationCurrent=epoch=>onlineMode&&epoch===onlinePresentationEpoch;
    onlineSubmit=function(action){
      if(!onlineMode||!globalThis.goStopOnlineSession?.socket||globalThis.goStopOnlineSession.socket.readyState!==WebSocket.OPEN){activeOnlineStatus.textContent=t('onlineAuthorityDisconnected');presentation.locked=true;render();return null;}
      try{const id=globalThis.goStopOnlineSession.submit(action);onlineActions.set(id,action);onlineActionSubmittedAt.set(id,Date.now());presentation.locked=true;return id;}catch(error){activeOnlineStatus.textContent=error.message;return null;}
    };
    onlinePlayAgain=async function(){
      if(canSubmitPlayAgain(latestOnlineSnapshot)){
        const submitted=!!onlineSubmit({type:'playAgainReady'});
        if(submitted&&els.resultDialog?.open)els.resultDialog.close();
        return submitted;
      }
      if(els.resultDialog?.open)els.resultDialog.close();
      await onlinePresentationQueue;
      if(latestOnlineSnapshot)await driveOnline(latestOnlineSnapshot,onlineLastEvents);
      return false;
    };
    const setDialog=(dialog,open)=>{if(!dialog)return;if(open&&!dialog.open)dialog.showModal();else if(!open&&dialog.open)dialog.close();};
    function clearOnlineGameplayPresentation(){invalidateGameplayPresentation();}
    function onlineFlowBlocks(snapshot){const flow=snapshot?.sessionFlow;return !!(flow?.ended||flow?.replayReady?.you||flow?.newGameRequest||flow?.opponentReconnectUntil||els.quitConfirmDialog?.open);}
    function reconcileOnlineFlow(snapshot){
      const flow=snapshot?.sessionFlow;if(!flow)return;
      if(flow.ended){presentation.locked=true;if(flow.pauseResolution||flow.abandonment){setDialog(els.opponentEndedDialog,false);return;}if(flow.disconnectCancelled||flow.endedByYou){if(onlineAnonymousMode&&globalThis.GoStopRanked?.handleFriendlySessionEnd?.(snapshot))return;returnOnlineToMenu();return;}if(onlineAnonymousMode&&els.opponentEndedDialog?.dataset.acknowledged==='1'){if(globalThis.GoStopRanked?.handleFriendlySessionEnd?.(snapshot))return;returnOnlineToMenu();return;}if(els.opponentEndedTitle)els.opponentEndedTitle.textContent=onlineAnonymousMode?(flow.forceEnded?t('friendForceEnded'):t('friendEnded')):t('opponentEnded');setDialog(els.opponentEndedDialog,true);return;}
      const request=flow.newGameRequest;
      setDialog(els.newGameWaitingDialog,!!request?.requestedByYou);
      setDialog(els.incomingNewGameDialog,!!request&&!request.requestedByYou);
      const replayWaiting=flow.replayReady.you&&!request;
      setDialog(els.replayWaitingDialog,replayWaiting);
      if(replayWaiting)setDialog(els.resultDialog,false);
      if(!flow.replayReady.you&&!snapshot.terminalResult)setDialog(els.resultDialog,false);
      if(!snapshot.terminalResult&&els.quitConfirmDialog.open&&onlineQuitFromResult)setDialog(els.quitConfirmDialog,false);
    }
    function returnOnlineToMenu(){
      onlineSessionGeneration++;onlinePresentationEpoch++;onlineMode=false;onlineSkipInitialOpening=false;presentation.locked=true;clearOnlineGameplayPresentation();setTrainingMode(false);publishPlayerActivity(false,'menu');
      const room=globalThis.goStopOnlineSession?.room;if(room)sessionStorage.removeItem(`gostop-room-${room.roomCode}`);if(!onlineAnonymousMode){try{localStorage.removeItem('gostop-active-ranked-room');}catch(_){}}
      document.getElementById('onlineRoomCode').value='';activeOnlineStatus.textContent='';if(freeFriendPanel)freeFriendPanel.hidden=true;if(els.opponentEndedDialog)delete els.opponentEndedDialog.dataset.acknowledged;if(els.opponentEndedTitle)els.opponentEndedTitle.textContent=t('opponentEnded');
      globalThis.goStopOnlineSession?.close();globalThis.goStopOnlineSession=null;latestOnlineSnapshot=null;onlineAnonymousMode=false;activeOnlineStatus=onlineStatus;els.soloStartOverlay.hidden=false;refreshModeLocalizedLabels();
    }
    globalThis.GoStopGameBridge=Object.freeze({
      returnEndedOnlineSessionToMenu(){returnOnlineToMenu();},
      prepareForMultiplayerChallenge(){
        const room=globalThis.goStopOnlineSession?.room;
        const isTwoPlayerOnline=onlineMode&&(onlineAnonymousMode||room?.rankedMode!=='solo');
        if(isTwoPlayerOnline)return false;
        if(onlineMode)returnOnlineToMenu();
        else if(localGameActive){cancelLocalGamePresentation();setTrainingMode(false);els.soloStartOverlay.hidden=false;publishPlayerActivity(false,'menu');}
        return true;
      },
      async createCompetitiveRoom(){
        const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter(),room=await adapter.create();
        await beginOnline(room,{adapter});return room;
      },
      async joinCompetitiveRoom(roomCode,{resumeExisting=false}={}){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter();let existing=JSON.parse(sessionStorage.getItem(`gostop-room-${code}`)||'null');
        if(!existing){try{const saved=JSON.parse(localStorage.getItem('gostop-active-ranked-room')||'null');if(saved?.roomCode===code)existing=saved;}catch(_){}}
        const room=await adapter.join(code,existing?.credential);await beginOnline(room,{adapter,resumeExisting});return room;
      },
      async joinGuestCompetitiveRoom(roomCode){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true});sessionStorage.removeItem(`gostop-room-${code}`);
        const room=await adapter.join(code);await beginOnline(room,{anonymous:true,statusElement:onlineStatus,adapter});return room;
      },
      async createFreeRoom(){
        const status=document.getElementById('freeOnlineStatus')||onlineStatus,adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true}),room=await adapter.create();
        await beginOnline(room,{anonymous:true,statusElement:status,adapter});return room;
      },
      async joinFreeRoom(roomCode){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const status=document.getElementById('freeOnlineStatus')||onlineStatus,adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true});sessionStorage.removeItem(`gostop-room-${code}`);
        const room=await adapter.join(code);await beginOnline(room,{anonymous:true,statusElement:status,adapter});return room;
      },
      async resumeFriendlyRoom(roomCode){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const saved=JSON.parse(sessionStorage.getItem(`gostop-room-${code}`)||'null');if(!saved?.credential)throw new Error('This Friendly game can no longer be resumed from this tab.');
        const status=document.getElementById('freeOnlineStatus')||onlineStatus,adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true}),room=await adapter.join(code,saved.credential);
        await beginOnline(room,{anonymous:true,statusElement:status,adapter,resumeExisting:true});return room;
      }
    });
    els.opponentEndedOkBtn.addEventListener('click',()=>{const snapshot=latestOnlineSnapshot;if(els.opponentEndedDialog.open)els.opponentEndedDialog.close();if(els.opponentEndedDialog)els.opponentEndedDialog.dataset.acknowledged='1';if(onlineAnonymousMode&&snapshot?.sessionFlow?.ended&&globalThis.GoStopRanked?.handleFriendlySessionEnd?.(snapshot))return;returnOnlineToMenu();});
    [els.replayWaitingDialog,els.newGameWaitingDialog,els.incomingNewGameDialog,els.opponentEndedDialog].forEach(dialog=>dialog.addEventListener('cancel',event=>event.preventDefault()));
    async function driveOnline(snapshot,events=[]){
      if(!onlineMode)return;
      reconcileOnlineFlow(snapshot);
      if(globalThis.goStopOnlineSession.pendingActionId||onlineFlowBlocks(snapshot)){presentation.locked=true;render();return;}
      const decision=state.pendingDecision;
      if(decision?.type==='shakeDecision'||decision?.type==='openingTripleDecision'){showShakeChoice(decision);showGameplayModal(els.shakeDialog);return;}
      if(decision?.type==='bombDecision'){showBombChoice(decision.month,decision.cardIds);showGameplayModal(els.bombDialog);return;}
      if(decision?.type==='goStopDecision'){await presentOnlineGoStopDecision(decision);return;}
      if(decision?.type==='chooseFloorTarget'){
        const targets=decision.legalTargetIds.map(id=>state.floor.find(card=>card.id===id)).filter(Boolean),target=await chooseFloorTarget(targets,'Choose which table card to hit');
        if(target)onlineSubmit({type:'chooseFloorTarget',source:decision.source,targetId:target.id});return;
      }
      if(snapshot.nextAction?.type==='chooseFloorTarget'){const targets=snapshot.nextAction.legalTargetIds.map(id=>state.floor.find(card=>card.id===id)).filter(Boolean),target=await chooseFloorTarget(targets,'Choose which table card to hit');if(target)onlineSubmit({type:'chooseFloorTarget',source:snapshot.nextAction.source,targetId:target.id});return;}
      if(snapshot.nextAction){onlineSubmit(snapshot.nextAction);return;}
      const connected=globalThis.goStopOnlineSession?.socket?.readyState===WebSocket.OPEN;
      presentation.locked=!globalThis.GoStopOnline.viewerCanInteract(snapshot,{connected,pendingActionId:globalThis.goStopOnlineSession.pendingActionId,blocked:onlineFlowBlocks(snapshot)});render();
    }
    function onlineStateFromSnapshot(snapshot,rawEvents=[]){
      const viewerIsB=snapshot.seatId===PLAYER_B,projected=onlineValueForViewer(snapshot.state,snapshot.seatId),bottom=viewerIsB?projected.ai:projected.human,top=viewerIsB?projected.human:projected.ai;
      return {state:{...projected,human:bottom,ai:{...top,hand:Array.from({length:top.handCount||0},()=>({}))},deck:Array.from({length:projected.deckCount||0},()=>null)},events:onlineValueForViewer(rawEvents,snapshot.seatId)};
    }
    function resetOnlinePresentationForMatch(matchId){
      resetHandPresentationState();presentation.hintCardId=null;
      presentation.roundNo=1;presentation.sessionStats={playerA:{wins:0,points:0},playerB:{wins:0,points:0}};presentation.milestoneHistory={playerA:new Set(),playerB:new Set()};presentation.recordedTerminal=null;presentation.nextStarterId=null;presentation.sessionStarted=false;presentation.deckDisplayCount=null;
      onlinePendingCardId=null;onlineStageState={};onlinePresentedEvents.clear();onlineDealPresented=false;state=null;
      [els.resultDialog,els.decisionDialog,els.shakeDialog,els.bombDialog,els.firstPpeokDialog,els.gukjinDialog,els.captureDialog,els.shakeReviewDialog,els.shakeRevealDialog].filter(Boolean).forEach(dialog=>{if(dialog.open)dialog.close();});
      onlinePresentedMatchId=matchId;
    }
    async function presentOnlineTransition(snapshot,events,epoch=onlinePresentationEpoch){
      if(!isOnlinePresentationCurrent(epoch))return;
      presentation.locked=true;
      if(snapshot.matchId!==onlinePresentedMatchId)resetOnlinePresentationForMatch(snapshot.matchId);
      const incomingMapped=onlineStateFromSnapshot(snapshot,events),presentationEvents=incomingMapped.events;
      reconcileOnlineFlow(snapshot);
      if(snapshot.sessionFlow?.ended)return;
      if(!state){state=incomingMapped.state;onlineLastEvents=presentationEvents;render();if(!onlineDealPresented){onlineDealPresented=true;if(!onlineSkipInitialOpening){await presentOpeningSequence(state.startingPlayerId,true);if(!isOnlinePresentationCurrent(epoch))return;}onlineSkipInitialOpening=false;}await driveOnline(snapshot,onlineLastEvents);return;}
      if(!presentationEvents.length){
        // Sync/flow snapshots carry no new physical action. Preserve any staged cards that
        // authority still owns in pendingTurn so the played card cannot disappear between
        // the hand slap and the deck reveal in ranked Solo/Online play.
        if(hasUnpresentedLocalHandMovement(incomingMapped.state,presentationEvents))return;
        const pendingStageIds=new Set(globalThis.GoStopPresentationPlan.pendingOnlineStageIds(incomingMapped.state));
        const staleStageIds=[...presentation.stagedCards.keys()].filter(cardId=>!pendingStageIds.has(cardId));
        onlineStageState=Object.fromEntries(Object.entries(onlineStageState).filter(([cardId])=>pendingStageIds.has(cardId)));
        state=incomingMapped.state;onlineLastEvents=[];render();
        staleStageIds.forEach(cleanupStagedCard);
        if(!isOnlinePresentationCurrent(epoch))return;await driveOnline(snapshot,[]);return;
      }
      let bombEvent=null;
      const incoming=incomingMapped.state;
      const onlinePlayed=state.pendingTurn?.played?.card,onlineDrawn=state.pendingTurn?.drawn?.card;
      const sameMonthSpecial=snapshot.nextAction?.type==='resolveSpecialTurn'&&onlinePlayed&&onlineDrawn&&onlinePlayed.month===onlineDrawn.month;
      const plan=globalThis.GoStopPresentationPlan.planOnlinePresentation(presentationEvents,onlineStageState,{pendingPlayedCard:onlinePlayed,sameMonthSpecial});onlineStageState=plan.stages;
      for(const step of plan.steps){
        const event=step.event,side=legacySideForPlayerId(event.actorId||PLAYER_A);
        if(step.kind==='handSlap'||step.kind==='handStage'){
          const source=side==='human'?takeOnlineHandSource(event.card.id)||els.playerHand.querySelector(`[data-card-id="${event.card.id}"]`)?.getBoundingClientRect()||approximateHumanSource():approximateAiSource(),target=state.floor.find(card=>card.id===step.targetCardId),landingSlot=[incoming.pendingTurn?.played,incoming.pendingTurn?.drawn].find(entry=>entry?.card.id===step.cardId)?.landingSlot;
          if(step.kind==='handSlap'){if(!target&&Number.isFinite(landingSlot))presentation.floorSlotReservations.set(step.cardId,landingSlot);await runPhysicalMotion(()=>animateHandCardSlap(side,event.card,source,target));await presentationPause('handToDeck');}else await runPhysicalMotion(()=>stageHandCardForChoice(side,event.card,source));
        }else if(step.kind==='deckFlip')await runPhysicalMotion(()=>animateDeckLiftFlip(side,event.card));
        else if(step.kind==='stageSlap'){
          const entry=event.card||state.pendingTurn?.drawn?.card||state.pendingTurn?.played?.card,card=entry?.id===step.cardId?entry:MASTER_DECK.find(item=>item.id===step.cardId),stage=presentation.stagedCards.get(step.cardId),target=state.floor.find(item=>item.id===step.targetCardId)||state.pendingTurn?.played?.card.id===step.targetCardId&&state.pendingTurn.played.card;if(stage&&card)await runPhysicalMotion(()=>animateStagedSlap(stage,card,target,event.source==='drawn'||event.type==='deckCardRevealed'?'flip':'play'));
        }else if(step.kind==='rememberBomb')bombEvent=event;
        else if(step.kind==='bombSlap'){
          onlineHandSourceRects.clear();
          const cards=step.cardIds.map(id=>state[side].hand.find(card=>card.id===id)||MASTER_DECK.find(card=>card.id===id)).filter(Boolean),target=state.floor.find(card=>card.month===bombEvent?.month),sources=cards.map((card,index)=>side==='human'?els.playerHand.querySelector(`[data-card-id="${card.id}"]`)?.getBoundingClientRect()||approximateHumanSource(index,cards.length):approximateAiSource());if(target)await runPhysicalMotion(()=>animateBombSlap(side,cards,target,sources));
        }else if(step.kind==='capture'){await runPhysicalMotion(()=>animateCaptureBatch(step.cardIds.map(id=>MASTER_DECK.find(card=>card.id===id)).filter(Boolean),side));step.cardIds.forEach(cleanupStagedCard);}
        else if(step.kind==='landedCleanup'){ /* DOM cleanup is deferred until after the authoritative floor render below. */ }
        else if(event.type==='piTransferred')await presentPiTransferEvents(side,[event]);
        if(!isOnlinePresentationCurrent(epoch))return;
      }
      state=incomingMapped.state;onlineLastEvents=presentationEvents;render();
      for(const cardId of [...presentation.stagedCards.keys()])if(!Object.hasOwn(onlineStageState,cardId))cleanupStagedCard(cardId);
      if(presentationEvents.some(event=>event.type==='newHandCreated')){
        presentation.roundNo++;
        resetHandPresentationState();
        presentation.milestoneHistory={playerA:new Set(),playerB:new Set()};
        onlinePendingCardId=null;
        onlineStageState={};
        presentation.recordedTerminal=null;
        await presentDealSequence();
        if(!isOnlinePresentationCurrent(epoch))return;
      }
      for(const event of presentationEvents){
        const side=legacySideForPlayerId(event.actorId||PLAYER_A),cardIds=event.cardIds||[];
        if(event.type==='cardLanded'){removeStage(event.card?.id||event.cardId);await presentationPause('cardLandCleanup');}
        else if(event.type==='shakeDeclared')await presentShakeDeclaration([event]);
        else if(event.type==='ppeokFormed'){cardIds.forEach(removeStage);playPpeokSound();await showSpecialTransient('POOPED!',cardIds);}
        else if(event.type==='firstPpeokAwarded')await showFirstPoopNotice(side);
        else if(event.type==='cardsCaptured'){
          await presentationPause('postCapture');
          if(event.rule==='jjok')await presentKiss(cardIds);
          else if(event.rule==='ttadak'){playTapTapSound();await showSpecialTransient('FLUSH!',cardIds,'flush');}
        }
        else if(event.type==='sweepTriggered')await presentSemanticEvents([event]);
        else if(event.type==='goDeclared')showGoCallout(side);
        else if(['chongtongDeclared','threePpeokDeclared','nagariDeclared'].includes(event.type)){ /* Terminal UI is presented after every turn animation. */ }
        if(!isOnlinePresentationCurrent(epoch))return;
      }
      const actor=presentationEvents.find(event=>event.actorId)?.actorId;if(actor){await promptGukjinChoice(legacySideForPlayerId(actor),presentationEvents);if(!isOnlinePresentationCurrent(epoch))return;}
      const completedTurn=presentationEvents.find(event=>event.type==='turnCompleted');if(completedTurn){await presentNewMilestones(completedTurn.actorId);if(!isOnlinePresentationCurrent(epoch))return;if(completedTurn.actorId===snapshot.seatId)onlinePendingCardId=null;}
      const chongtong=presentationEvents.find(event=>event.type==='chongtongDeclared'),threePpeok=presentationEvents.find(event=>event.type==='threePpeokDeclared'),nagari=presentationEvents.find(event=>event.type==='nagariDeclared');
      if(chongtong)presentChongtong(chongtong);
      else if(threePpeok)presentThreePpeok({events:[threePpeok]});
      else if(nagari){recordTerminalResult(state.terminalResult);setGrandResult(t('noWinner'),'',`${t('points')} ×${nagari.nextHandMultiplier}`,t('noWinnerHelp'),'special');showGameplayModal(els.resultDialog,epoch);}
      else if(presentationEvents.some(event=>event.type==='handEnded'))presentStopResult({events:presentationEvents});
      if(onlineAnonymousMode&&snapshot.terminalResult)globalThis.GoStopRanked?.handleFriendlyTerminal?.(snapshot);
      await driveOnline(snapshot,presentationEvents);
    }
    function enterOnlineMatchView(anonymous){
      if(anonymous){if(freeFriendPanel)freeFriendPanel.hidden=true;}
      else {const panel=document.getElementById('onlineLobbyPanel');if(panel)panel.hidden=true;}
      document.documentElement.classList.remove('gostop-boot-pending');els.soloStartOverlay.hidden=true;
    }
    const beginOnline=async (room,{anonymous=false,statusElement=onlineStatus,adapter:roomAdapter=null,resumeExisting=false}={})=>{
      const twoPlayer=!!anonymous||room?.rankedMode!=='solo';
      publishPlayerActivity(true,anonymous?'free-friend':room?.rankedMode==='solo'?'competitive-solo':'competitive-online',twoPlayer);
      localGameActive=false;localGameGeneration++;onlinePresentationEpoch++;beginGameplayPresentation();setTrainingMode(false);onlineAnonymousMode=!!anonymous;activeOnlineStatus=statusElement||onlineStatus;
      if(!anonymous&&freeFriendPanel)freeFriendPanel.hidden=true;
      const adapter=roomAdapter||new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous});
      adapter.room=room;
      const generation=++onlineSessionGeneration,previous=globalThis.goStopOnlineSession;
      if(previous&&previous!==adapter){try{previous.close();}catch(_){}}
      onlinePresentationQueue=Promise.resolve();onlineDealPresented=false;onlineSkipInitialOpening=!!resumeExisting;onlinePresentedMatchId=null;onlineStageState={};onlinePresentedEvents.clear();latestOnlineSnapshot=null;onlineLastEvents=[];
      globalThis.goStopOnlineSession=adapter;
      const isCurrent=()=>generation===onlineSessionGeneration&&globalThis.goStopOnlineSession===adapter,isFriendlyHost=!!anonymous&&room?.seatId==='playerA';let friendlyJoinAnnounced=false;
      const announceFriendlyJoin=()=>{if(!isFriendlyHost||friendlyJoinAnnounced)return;friendlyJoinAnnounced=true;globalThis.dispatchEvent(new CustomEvent('gostop-friendly-friend-joined',{detail:{roomCode:room.roomCode}}));};
      onlineMode=true;
      refreshModeLocalizedLabels();
      sessionStorage.setItem(`gostop-room-${room.roomCode}`,JSON.stringify(room));if(!anonymous){try{localStorage.setItem('gostop-active-ranked-room',JSON.stringify(room));}catch(_){}}activeOnlineStatus.textContent=anonymous?t('waitingForOpponent'):t('roomWaitingConnection',{roomCode:room.roomCode});
      adapter.addEventListener('connected',event=>{if(!isCurrent())return;const ready=event.detail?.status==='ready'||!!event.detail?.matchId;if(ready){enterOnlineMatchView(anonymous);announceFriendlyJoin();}activeOnlineStatus.textContent=ready?t('matchReady'):(anonymous?t('waitingForOpponent'):t('roomWaitingOpponent',{roomCode:room.roomCode}));});
      adapter.addEventListener('roomReady',()=>{if(!isCurrent())return;activeOnlineStatus.textContent=t('matchReady');enterOnlineMatchView(anonymous);announceFriendlyJoin();});
      adapter.addEventListener('opponentConnected',()=>{if(!isCurrent())return;activeOnlineStatus.textContent=t('opponentConnectedMatchReady');enterOnlineMatchView(anonymous);announceFriendlyJoin();});
      adapter.addEventListener('disconnected',()=>{if(!isCurrent())return;onlineHandSourceRects.clear();onlineActions.clear();onlineActionSubmittedAt.clear();adapter.pendingActionId=null;onlinePendingCardId=null;els.playerHand.querySelectorAll('.pending-card').forEach(node=>node.classList.remove('pending-card'));if(!onlineMode)return;activeOnlineStatus.textContent=t('authorityDisconnected');presentation.locked=true;render();});
      adapter.addEventListener('snapshot',event=>{if(!isCurrent())return;latestOnlineSnapshot=event.detail.snapshot;onlineLastEvents=event.detail.events;if(event.detail.snapshot?.sessionFlow?.ended){onlinePresentationEpoch++;onlinePresentationQueue=Promise.resolve();onlineActions.clear();onlineActionSubmittedAt.clear();adapter.pendingActionId=null;clearOnlineGameplayPresentation();reconcileOnlineFlow(event.detail.snapshot);globalThis.dispatchEvent(new CustomEvent('gostop-online-snapshot',{detail:{...event.detail,sessionGeneration:generation,presentationEpoch:onlinePresentationEpoch}}));return;}if(event.detail.snapshot?.matchId){activeOnlineStatus.textContent=t('matchReady');enterOnlineMatchView(anonymous);announceFriendlyJoin();}else if(event.detail.snapshot?.ranked&&els.soloStartOverlay?.dataset.launching!=='true')enterOnlineMatchView(anonymous);globalThis.dispatchEvent(new CustomEvent('gostop-online-snapshot',{detail:{...event.detail,sessionGeneration:generation,presentationEpoch:onlinePresentationEpoch}}));});
      adapter.addEventListener('actionAccepted',async event=>{
        if(!isCurrent())return;
        const action=onlineActions.get(event.detail.actionId);onlineActions.delete(event.detail.actionId);onlineActionSubmittedAt.delete(event.detail.actionId);
        await onlinePresentationQueue;
        if(!isCurrent())return;
        const authoritativeTargetChoice=state.pendingDecision?.type==='chooseFloorTarget'||latestOnlineSnapshot?.nextAction?.type==='chooseFloorTarget';
        const automatic=latestOnlineSnapshot?.nextAction?.type!=='chooseFloorTarget'?latestOnlineSnapshot?.nextAction:null;
        if(action?.type==='attemptPlayCard'&&authoritativeTargetChoice){await driveOnline(latestOnlineSnapshot,onlineLastEvents);return;}
        if(action?.type==='attemptPlayCard'&&!state.pendingDecision){if(automatic)onlineSubmit(automatic);else await submitOnlineCardPlay();return;}
        if(['declareShake','keepShakeSecret','declineBomb'].includes(action?.type)&&!state.pendingDecision&&onlinePendingCardId){await submitOnlineCardPlay();return;}
        if(automatic){onlineSubmit(automatic);return;}
        await driveOnline(latestOnlineSnapshot,onlineLastEvents);
      });
      adapter.addEventListener('actionRejected',event=>{
        if(!isCurrent())return;
        const action=onlineActions.get(event.detail.actionId);onlineActions.delete(event.detail.actionId);onlineActionSubmittedAt.delete(event.detail.actionId);
        if(action?.cardId){
          onlineHandSourceRects.delete(action.cardId);
          if(onlinePendingCardId===action.cardId)onlinePendingCardId=null;
          els.playerHand.querySelector(`[data-card-id="${action.cardId}"]`)?.classList.remove('pending-card');
        }
        activeOnlineStatus.textContent=event.detail.error?.message||'The server rejected that action.';presentation.locked=true;render();
        adapter.sync();
      });
      adapter.addEventListener('error',event=>{if(!isCurrent())return;activeOnlineStatus.textContent=event.detail.message||event.detail.code||'Online connection error.';});adapter.connect();
    };
    addEventListener('gostop-online-snapshot',event=>{const generation=event.detail.sessionGeneration,epoch=event.detail.presentationEpoch??onlinePresentationEpoch;if(generation!==onlineSessionGeneration||epoch!==onlinePresentationEpoch)return;const {snapshot}=event.detail,events=(event.detail.events||[]).filter(item=>{const key=Number.isInteger(item.revision)&&Number.isInteger(item.eventIndex)?`${snapshot.matchId}:${item.revision}:${item.eventIndex}`:null;if(!key)return true;if(onlinePresentedEvents.has(key))return false;onlinePresentedEvents.add(key);if(onlinePresentedEvents.size>256)onlinePresentedEvents.delete(onlinePresentedEvents.values().next().value);return true;});onlinePresentationQueue=onlinePresentationQueue.then(()=>{if(generation!==onlineSessionGeneration||epoch!==onlinePresentationEpoch)return;return presentOnlineTransition(snapshot,events,epoch);}).catch(error=>{if(generation!==onlineSessionGeneration||epoch!==onlinePresentationEpoch)return;activeOnlineStatus.textContent=error.message;presentation.locked=true;});});
    createOnlineBtn?.addEventListener('click',async()=>{try{activeOnlineStatus=onlineStatus;activeOnlineStatus.textContent=t('creatingRoom');const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter(),room=await adapter.create();activeOnlineStatus.textContent=t('shareRoomCode',{roomCode:room.roomCode});await beginOnline(room,{adapter});}catch(error){activeOnlineStatus.textContent=error.message;}});
    joinOnlineForm?.addEventListener('submit',async event=>{event.preventDefault();if(onlineJoinInFlight)return;onlineJoinInFlight=true;try{activeOnlineStatus=onlineStatus;activeOnlineStatus.textContent=t('joiningRoom');const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter(),code=document.getElementById('onlineRoomCode').value.toUpperCase();let existing=JSON.parse(sessionStorage.getItem(`gostop-room-${code}`)||'null');if(!existing){try{const saved=JSON.parse(localStorage.getItem('gostop-active-ranked-room')||'null');if(saved?.roomCode===code)existing=saved;}catch(_){}}const room=await adapter.join(code,existing?.credential);await beginOnline(room,{adapter});els.soloStartOverlay.hidden=true;globalThis.dispatchEvent(new CustomEvent('gostop-online-launch-settled',{detail:{ok:true,roomCode:room.roomCode}}));}catch(error){activeOnlineStatus.textContent=error.message;globalThis.dispatchEvent(new CustomEvent('gostop-online-launch-settled',{detail:{ok:false}}));}finally{onlineJoinInFlight=false;}});
    addEventListener('gostop-free-online-create',async()=>{
      if(!freeOnlineStatus)return;
      try{activeOnlineStatus=freeOnlineStatus;activeOnlineStatus.textContent=t('creatingRoom');const adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true}),room=await adapter.create();activeOnlineStatus.textContent=t('waitingForOpponent');await beginOnline(room,{anonymous:true,statusElement:freeOnlineStatus,adapter});}
      catch(error){activeOnlineStatus.textContent=error.message;}
    });
  }
  if(typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent?.(new CustomEvent('gostop-app-ready'));
})();
