(() => {
  'use strict';

  const monthNames = Object.freeze(['January','February','March','April','May','June','July','August','September','October','November','December']);
  const monthShort = Object.freeze(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);

  const cardDefinitions = [
    [1,'Hikari','bright',null,''], [1,'Tanzaku','ribbon','red',''], [1,'Kasu 1','pi',null,''], [1,'Kasu 2','pi',null,''],
    [2,'Tane','animal',null,'godori'], [2,'Tanzaku','ribbon','red',''], [2,'Kasu 1','pi',null,''], [2,'Kasu 2','pi',null,''],
    [3,'Hikari','bright',null,''], [3,'Tanzaku','ribbon','red',''], [3,'Kasu 1','pi',null,''], [3,'Kasu 2','pi',null,''],
    [4,'Tane','animal',null,'godori'], [4,'Tanzaku','ribbon','grass',''], [4,'Kasu 1','pi',null,''], [4,'Kasu 2','pi',null,''],
    [5,'Tane','animal',null,''], [5,'Tanzaku','ribbon','grass',''], [5,'Kasu 1','pi',null,''], [5,'Kasu 2','pi',null,''],
    [6,'Tane','animal',null,''], [6,'Tanzaku','ribbon','blue',''], [6,'Kasu 1','pi',null,''], [6,'Kasu 2','pi',null,''],
    [7,'Tane','animal',null,''], [7,'Tanzaku','ribbon','grass',''], [7,'Kasu 1','pi',null,''], [7,'Kasu 2','pi',null,''],
    [8,'Hikari','bright',null,''], [8,'Tane','animal',null,'godori'], [8,'Kasu 1','pi',null,''], [8,'Kasu 2','pi',null,''],
    [9,'Tane','animal',null,'switchPi'], [9,'Tanzaku','ribbon','blue',''], [9,'Kasu 1','pi',null,''], [9,'Kasu 2','pi',null,''],
    [10,'Tane','animal',null,''], [10,'Tanzaku','ribbon','blue',''], [10,'Kasu 1','pi',null,''], [10,'Kasu 2','pi',null,''],
    [11,'Hikari','bright',null,''], [11,'Kasu 1','pi',null,'doublePi'], [11,'Kasu 2','pi',null,''], [11,'Kasu 3','pi',null,''],
    [12,'Hikari','bright',null,'rain'], [12,'Tane','animal',null,''], [12,'Tanzaku','ribbon',null,''], [12,'Kasu','pi',null,'doublePi']
  ];

  function cardFilename(month,suffix){ return `Hwatu ${monthNames[month-1]} ${suffix}.svg`; }

  const masterDeck = Object.freeze(cardDefinitions.map((definition,index)=>Object.freeze({
    id:`m${definition[0]}-${index%4+1}`,
    month:definition[0],
    type:definition[2],
    ribbonSet:definition[3],
    flags:Object.freeze(definition[4]?definition[4].split(','):[]),
    file:cardFilename(definition[0],definition[1])
  })));

  function assertDeckIntegrity(deck){
    if(deck.length!==48)throw new Error(`Deck integrity failure: expected 48 cards, got ${deck.length}.`);
    const ids=new Set(deck.map(card=>card.id));
    if(ids.size!==48)throw new Error(`Deck integrity failure: duplicate card IDs detected (${ids.size}/48 unique).`);
    for(let month=1;month<=12;month++){
      const count=deck.filter(card=>card.month===month).length;
      if(count!==4)throw new Error(`Deck integrity failure: month ${month} has ${count} cards instead of 4.`);
    }
  }

  function countsByMonth(cards){
    const counts={};
    cards.forEach(card=>counts[card.month]=(counts[card.month]||0)+1);
    return counts;
  }

  function monthsWithCount(cards,count){
    const counts=countsByMonth(cards);
    return Object.keys(counts).map(Number).filter(month=>counts[month]===count);
  }

  function tripleMonths(cards){ return monthsWithCount(cards,3); }
  function fourMonths(cards){ return monthsWithCount(cards,4); }
  function hasFourOfMonth(cards){ return fourMonths(cards).length>0; }
  function matchingCards(cards,cardOrMonth){
    const month=typeof cardOrMonth==='number'?cardOrMonth:cardOrMonth.month;
    return cards.filter(card=>card.month===month);
  }

  function score(cards,mode=null){
    if(mode==='animal')return scoreWithGukjinMode(cards,false);
    if(mode==='pi')return scoreWithGukjinMode(cards,true);
    const normal=scoreWithGukjinMode(cards,false);
    const asPi=scoreWithGukjinMode(cards,true);
    return asPi.total>normal.total?asPi:normal;
  }

  function scorePlayer(player){
    const scored=score(player.captured,player.gukjinMode||'animal');
    const bonusPoints=player.firstPpeokPoints||0;
    return {...scored,capturedTotal:scored.total,bonusPoints,total:scored.total+bonusPoints};
  }

  function scoreWithGukjinMode(cards,gukjinAsPi){
    const isGukjin=card=>card.month===9&&card.type==='animal'&&card.flags.includes('switchPi');
    const bright=cards.filter(card=>card.type==='bright');
    const animals=cards.filter(card=>card.type==='animal'&&!(gukjinAsPi&&isGukjin(card)));
    const ribbons=cards.filter(card=>card.type==='ribbon');
    const piCards=cards.filter(card=>card.type==='pi');
    let brightPts=0;
    if(bright.length===3)brightPts=bright.some(card=>card.flags.includes('rain'))?2:3;
    else if(bright.length===4)brightPts=4;
    else if(bright.length>=5)brightPts=15;
    let animalPts=animals.length>=5?animals.length-4:0;
    const godori=[2,4,8].every(month=>animals.some(card=>card.month===month&&card.flags.includes('godori')));
    if(godori)animalPts+=5;
    let ribbonPts=ribbons.length>=5?ribbons.length-4:0;
    const setBonus=(name,months)=>months.every(month=>ribbons.some(card=>card.month===month&&card.ribbonSet===name))?3:0;
    ribbonPts+=setBonus('red',[1,2,3])+setBonus('blue',[6,9,10])+setBonus('grass',[4,5,7]);
    let piCount=piCards.reduce((sum,card)=>sum+(card.flags.includes('doublePi')?2:1),0);
    if(gukjinAsPi&&cards.some(isGukjin))piCount+=2;
    const piPts=piCount>=10?piCount-9:0;
    return {
      total:brightPts+animalPts+ribbonPts+piPts,
      brightPts,animalPts,ribbonPts,piPts,bright:bright.length,animals:animals.length,
      ribbons:ribbons.length,piCount,godori,gukjinAsPi
    };
  }

  function calculateSettlement({winner,loser,nagariCarryPower=0}){
    const winnerScore=scorePlayer(winner),loserScore=scorePlayer(loser);
    const baseTotal=winnerScore.total;
    const goBonus=winner.go>0&&winner.go<3?winner.go:0;
    let total=baseTotal+goBonus;
    const reasons=[];
    const formulaSteps=[`Base ${winnerScore.capturedTotal}`];

    if(winnerScore.bonusPoints)formulaSteps.push(`First Ppeok +${winnerScore.bonusPoints}`);

    if(goBonus>0)formulaSteps.push(`Go bonus +${goBonus}`);
    if(winner.go>=3){
      const goMultiplier=2**(winner.go-2);
      total*=goMultiplier;
      reasons.push(`${winner.go} Go ×${goMultiplier}`);
      formulaSteps.push(`${winner.go} Go ×${goMultiplier}`);
    }

    let doublePower=winner.shakes;
    if(winner.shakes){
      const multiplier=2**winner.shakes;
      reasons.push(`Shake ×${multiplier}`);
      formulaSteps.push(`Shake ×${multiplier}`);
    }
    if(winnerScore.animals>=7){doublePower++;reasons.push('Meong-bak ×2');formulaSteps.push('Meong-bak ×2');}
    if(winnerScore.piCount>=10&&loserScore.piCount>=1&&loserScore.piCount<=7){doublePower++;reasons.push('Pi-bak ×2');formulaSteps.push('Pi-bak ×2');}
    if(winnerScore.bright>=3&&loserScore.bright===0){doublePower++;reasons.push('Gwang-bak ×2');formulaSteps.push('Gwang-bak ×2');}
    if(loser.go>0&&loserScore.total<=loser.lastGoScore){doublePower++;reasons.push('Go-bak ×2');formulaSteps.push('Go-bak ×2');}
    if(nagariCarryPower>0){
      const multiplier=2**nagariCarryPower;
      doublePower+=nagariCarryPower;
      reasons.push(`Nagari carry ×${multiplier}`);
      formulaSteps.push(`Nagari carry ×${multiplier}`);
    }
    total*=2**doublePower;
    return {base:winnerScore,total,reasons,baseTotal,goBonus,formulaSteps};
  }

  function assertJsonSafe(value,path='state',seen=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){
      if(!Number.isFinite(value))throw new Error(`${path} contains a non-finite number.`);
      return;
    }
    if(typeof value!=='object')throw new Error(`${path} contains a non-JSON-safe ${typeof value} value.`);
    if(seen.has(value))throw new Error(`${path} contains a circular reference.`);
    if(Array.isArray(value)){
      seen.add(value); value.forEach((item,index)=>assertJsonSafe(item,`${path}[${index}]`,seen)); seen.delete(value); return;
    }
    if(Object.prototype.toString.call(value)!=='[object Object]'){
      throw new Error(`${path} contains a non-JSON-safe ${Object.prototype.toString.call(value).slice(8,-1)} value.`);
    }
    seen.add(value);
    Object.entries(value).forEach(([key,item])=>assertJsonSafe(item,`${path}.${key}`,seen));
    seen.delete(value);
  }

  function serializeGameState(state){
    assertJsonSafe(state);
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeMonthList(value,field){
    if(!Array.isArray(value))throw new Error(`${field} must be an array.`);
    const months=[];
    value.forEach(month=>{
      if(!Number.isInteger(month)||month<1||month>12)throw new Error(`${field} contains an invalid month.`);
      if(!months.includes(month))months.push(month);
    });
    return months;
  }

  function deserializeGameState(data){
    const state=serializeGameState(data);
    ['human','ai'].forEach(side=>{
      if(!state[side]||typeof state[side]!=='object')throw new Error(`state.${side} is required.`);
      state[side].hiddenTripleMonths=normalizeMonthList(state[side].hiddenTripleMonths,`state.${side}.hiddenTripleMonths`);
      state[side].shakenMonths=normalizeMonthList(state[side].shakenMonths,`state.${side}.shakenMonths`);
      state[side].resolvedOpeningTripleMonths=normalizeMonthList(state[side].resolvedOpeningTripleMonths||[],`state.${side}.resolvedOpeningTripleMonths`);
      state[side].revealedShakeSets=(state[side].revealedShakeSets||[]).map((set,index)=>{
        const cardIds=Array.isArray(set?.cardIds)?[...new Set(set.cardIds)]:[];
        if(!set||!Number.isInteger(set.month)||set.month<1||set.month>12||cardIds.length!==3||cardIds.some(id=>typeof id!=='string'))throw new Error(`state.${side}.revealedShakeSets[${index}] is invalid.`);
        return {month:set.month,cardIds};
      });
      state[side].turnsTaken=state[side].turnsTaken||0;
      state[side].firstPpeokPoints=state[side].firstPpeokPoints||0;
      state[side].gukjinMode=state[side].gukjinMode||'animal';
      if(!['animal','pi'].includes(state[side].gukjinMode))throw new Error(`state.${side}.gukjinMode is invalid.`);
    });
    if(!state.matchContext||typeof state.matchContext!=='object')throw new Error('state.matchContext is required.');
    if(!state.matchContext.lastScoreBySide||typeof state.matchContext.lastScoreBySide!=='object'){
      throw new Error('state.matchContext.lastScoreBySide is required.');
    }
    if(state.turn!=='playerA'&&state.turn!=='playerB')throw new Error('state.turn must be playerA or playerB.');
    if(Object.hasOwn(state.matchContext.lastScoreBySide,'human')||Object.hasOwn(state.matchContext.lastScoreBySide,'ai')){
      throw new Error('state.matchContext.lastScoreBySide must use neutral player IDs.');
    }
    ['playerA','playerB'].forEach(playerId=>{
      if(!Number.isFinite(state.matchContext.lastScoreBySide[playerId]))throw new Error(`Missing score history for ${playerId}.`);
    });
    Object.values(state.floorStacks||{}).forEach(stack=>{
      if(stack.owner!==null&&stack.owner!=='playerA'&&stack.owner!=='playerB')throw new Error('Floor stack owner must be a neutral player ID or null.');
    });
    if(state.winner==='human'||state.winner==='ai'||state.specialWinner==='human'||state.specialWinner==='ai'){
      throw new Error('Winner identity must use a neutral player ID.');
    }
    if(state.pendingDecision){
      const decision=state.pendingDecision;
      if(!['shakeDecision','bombDecision','goStopDecision','openingTripleDecision'].includes(decision.type)||decision.audience!=='player-private')throw new Error('Unknown private pending decision.');
      if(decision.playerId!=='playerA'&&decision.playerId!=='playerB')throw new Error('Shake decision must name a neutral player.');
      if(!['goStopDecision'].includes(decision.type)&&(!Number.isInteger(decision.month)||decision.month<1||decision.month>12))throw new Error('Private decision has invalid month data.');
      const expected=decision.type==='shakeDecision'?['shake','keepSecret']:decision.type==='bombDecision'?['bomb','playNormally']:decision.type==='openingTripleDecision'?decision.floorCardId?['shake','bomb']:['shake','keepSecret']:['go','stop'];
      if(JSON.stringify(decision.choices)!==JSON.stringify(expected))throw new Error('Private decision has invalid choices.');
      if(decision.type==='shakeDecision'&&typeof decision.cardId!=='string')throw new Error('Shake decision has invalid card data.');
      if(decision.type==='bombDecision'&&(!Array.isArray(decision.cardIds)||decision.cardIds.length!==3||typeof decision.floorCardId!=='string'))throw new Error('Bomb decision has invalid card data.');
      if(decision.type==='openingTripleDecision'&&(!Array.isArray(decision.cardIds)||decision.cardIds.length!==3))throw new Error('Opening triple decision has invalid card data.');
      if(decision.type==='goStopDecision'&&(!Number.isFinite(decision.score)||!Number.isFinite(decision.previousGoScore)))throw new Error('Go/Stop decision has invalid score data.');
    }
    return state;
  }

  function projectStateForViewer(currentState,viewerId){
    const state=deserializeGameState(currentState);
    const viewerSide=legacySideForPlayerId(viewerId);
    const opponentSide=viewerSide==='human'?'ai':'human';
    const projected=serializeGameState(state);
    projected.deckCount=projected.deck.length;
    delete projected.deck;
    projected[opponentSide].handCount=projected[opponentSide].hand.length;
    delete projected[opponentSide].hand;
    projected[opponentSide].hiddenTripleMonths=[];
    if(projected.pendingDecision?.playerId!==viewerId)delete projected.pendingDecision;
    projected.legalActions=[];
    if(projected.pendingDecision?.type==='shakeDecision')projected.legalActions.push('declareShake','keepShakeSecret');
    else if(projected.pendingDecision?.type==='bombDecision')projected.legalActions.push('declareBomb','declineBomb');
    else if(projected.pendingDecision?.type==='openingTripleDecision'){
      projected.legalActions.push('declareShake',projected.pendingDecision.floorCardId?'declareBomb':'keepShakeSecret');
    }
    else if(projected.pendingDecision?.type==='goStopDecision')projected.legalActions.push('declareGo','declareStop');
    else if(!state.winner&&state.turn===viewerId&&!state.pendingTurn&&!state.pendingDecision){
      if(state[viewerSide].hand.length)projected.legalActions.push('attemptPlayCard');
      if(state[viewerSide].bombFreeTurns>0)projected.legalActions.push('useBombBlank');
    }
    return projected;
  }

  function initializeShakeEligibility(currentState){
    const state=deserializeGameState(currentState);
    ['human','ai'].forEach(side=>{
      state[side].hiddenTripleMonths=tripleMonths(state[side].hand).filter(month=>!state[side].shakenMonths.includes(month));
    });
    delete state.pendingDecision;
    return state;
  }

  function advanceOpeningTripleDecision(state){
    delete state.pendingDecision;
    for(const [playerId,side] of [[PLAYER_A,'human'],[PLAYER_B,'ai']]){
      const player=state[side];
      const month=player.hiddenTripleMonths.find(value=>!player.resolvedOpeningTripleMonths.includes(value));
      if(!month)continue;
      const cardIds=player.hand.filter(card=>card.month===month).map(card=>card.id);
      const floorCard=state.floor.find(card=>card.month===month);
      state.pendingDecision={
        type:'openingTripleDecision',audience:'player-private',playerId,month,cardIds,
        floorCardId:floorCard?.id||null,choices:floorCard?['shake','bomb']:['shake','keepSecret']
      };
      return state.pendingDecision;
    }
    state.openingSpecialsComplete=true;
    return null;
  }

  function bombDecisionFor(state,side,actorId,cardId){
    const card=state[side].hand.find(item=>item.id===cardId);
    if(!card)return null;
    const cards=state[side].hand.filter(item=>item.month===card.month).slice(0,3);
    const floorCard=matchingCards(state.floor,card)[0];
    if(cards.length!==3||!state[side].hiddenTripleMonths.includes(card.month)||!floorCard||state.floorStacks[card.month])return null;
    return {type:'bombDecision',audience:'player-private',playerId:actorId,month:card.month,cardIds:cards.map(item=>item.id),floorCardId:floorCard.id,choices:['bomb','playNormally']};
  }

  function firstOpenFloorSlot(state,reserved=[]){
    const used=new Set([...Object.values(state.floorSlotByCard||{}),...reserved]);
    const count=Number.isFinite(state.floorSlotCount)?state.floorSlotCount:12;
    for(let slot=0;slot<count;slot++)if(!used.has(slot))return slot;
    let slot=count; while(used.has(slot))slot++; return slot;
  }

  const PLAYER_A='playerA';
  const PLAYER_B='playerB';
  function legacySideForPlayerId(playerId){
    if(playerId===PLAYER_A)return 'human';
    if(playerId===PLAYER_B)return 'ai';
    throw new Error(`Unknown actorId: ${playerId}`);
  }

  function validateActor(state,action){
    if(Object.prototype.hasOwnProperty.call(action,'actor'))throw new Error('Use neutral actorId, not actor.');
    const side=legacySideForPlayerId(action.actorId);
    if(state.winner)throw new Error('The hand is already complete.');
    if(state.turn!==action.actorId)throw new Error(`It is not ${action.actorId}'s turn.`);
    return side;
  }

  function resolveOpeningState(currentState){
    let state=initializeShakeEligibility(currentState);
    if(state.openingResolved)return {state,events:[]};
    state.openingResolved=true;
    const candidates=[
      {actorId:PLAYER_A,side:'human',months:fourMonths(state.human.hand)},
      {actorId:PLAYER_B,side:'ai',months:fourMonths(state.ai.hand)}
    ];
    const winner=candidates.find(candidate=>candidate.months.length);
    if(!winner){ state.openingOutcome=null; return {state,events:[],pendingDecision:advanceOpeningTripleDecision(state)}; }
    const month=winner.months[0],points=10;
    const nagariCarryPower=state.matchContext.nagariCarryPower;
    const multiplier=2**nagariCarryPower;
    state.winner=winner.actorId;
    state.specialWinner=winner.actorId;
    state.openingOutcome={type:'chongtong',actorId:winner.actorId,month,points};
    state.terminalResult={type:'chongtong',winnerId:winner.actorId,basePoints:points,nagariCarryPower,multiplier,finalPoints:points*multiplier};
    state.matchContext.nagariCarryPower=0;
    return {state,events:[{type:'chongtongDeclared',audience:'public',actorId:winner.actorId,month,points}]};
  }

  function cannotContinueTurn(state,side){
    return state[side].hand.length+state[side].bombFreeTurns===0||state.deck.length===0;
  }

  function resolveNagari(currentState,{actorId}={}){
    const state=deserializeGameState(currentState);
    const side=validateActor(state,{actorId});
    if(state.pendingDecision)throw new Error('A private decision must be resolved before Nagari.');
    if(state.pendingTurn)throw new Error('The current turn must be completed before Nagari.');
    if(!cannotContinueTurn(state,side))throw new Error('Nagari is not available while play can continue.');
    const carryPower=Math.min(3,state.matchContext.nagariCarryPower+1);
    const terminalResult={type:'nagari',winnerId:null,carryPower,nextHandMultiplier:2**carryPower};
    state.winner='nagari';
    state.matchContext.nagariCarryPower=carryPower;
    state.terminalResult=terminalResult;
    const events=[
      {type:'nagariDeclared',audience:'public',actorId,carryPower,nextHandMultiplier:terminalResult.nextHandMultiplier},
      {type:'handEnded',audience:'public',winnerId:null,reason:'nagari',terminalResult:serializeGameState(terminalResult)}
    ];
    return {state,events,terminalResult:serializeGameState(terminalResult)};
  }

  function applyThreePpeokTerminal(state,actorId,side,events){
    if(state[side].ppeoks<3)return null;
    const basePoints=7;
    const nagariCarryPower=state.matchContext.nagariCarryPower;
    const multiplier=2**nagariCarryPower;
    const terminalResult={
      type:'threePpeok',winnerId:actorId,basePoints,nagariCarryPower,multiplier,
      finalPoints:basePoints*multiplier,reason:'Three ppeoks in one hand'
    };
    state.winner=actorId;
    state.terminalResult=terminalResult;
    state.matchContext.nagariCarryPower=0;
    delete state.pendingTurn;
    delete state.pendingDecision;
    events.push({type:'threePpeokDeclared',audience:'public',actorId,ppeokCount:state[side].ppeoks,basePoints,finalPoints:terminalResult.finalPoints});
    events.push({type:'handEnded',audience:'public',winnerId:actorId,reason:'threePpeok',terminalResult:serializeGameState(terminalResult)});
    return terminalResult;
  }

  function resolveThreePpeok(currentState,{actorId}={}){
    const state=deserializeGameState(currentState);
    const side=validateActor(state,{actorId});
    if(state.pendingDecision)throw new Error('A private decision must be resolved before Three-Ppeok.');
    const events=[];
    const terminalResult=applyThreePpeokTerminal(state,actorId,side,events);
    return {state,events,terminalResult:terminalResult?serializeGameState(terminalResult):null};
  }

  function evaluateGoStop(currentState,{actorId}={}){
    const state=deserializeGameState(currentState);
    const side=validateActor(state,{actorId});
    if(state.pendingTurn||state.pendingDecision)throw new Error('A turn or decision is already in progress.');
    const currentScore=scorePlayer(state[side]).total;
    const previousGoScore=state.matchContext.lastScoreBySide[actorId];
    if(currentScore>=7&&currentScore>previousGoScore){
      state.pendingDecision={type:'goStopDecision',audience:'player-private',playerId:actorId,score:currentScore,previousGoScore,choices:['go','stop']};
      if(state[side].hand.length===0){
        const stopped=applyGoStopAction(state,{type:'declareStop',actorId});
        return {...stopped,autoStop:true};
      }
      return {state,events:[],pendingDecision:serializeGameState(state.pendingDecision),requiresNagari:false};
    }
    const requiresNagari=cannotContinueTurn(state,side);
    const events=[];
    if(!requiresNagari){
      state.turn=otherPlayerId(actorId);
      events.push({type:'turnHandedOff',audience:'public',actorId,toPlayerId:state.turn});
    }
    return {state,events,pendingDecision:null,requiresNagari};
  }

  function applyGoStopAction(currentState,action){
    if(!action||!['declareGo','declareStop'].includes(action.type))throw new Error(`Unsupported Go/Stop action: ${action?.type}`);
    const state=deserializeGameState(currentState);
    const side=validateActor(state,action);
    const decision=state.pendingDecision;
    if(!decision||decision.type!=='goStopDecision')throw new Error('No Go/Stop decision is pending.');
    if(decision.playerId!==action.actorId)throw new Error('The Go/Stop decision belongs to another player.');
    const currentScore=scorePlayer(state[side]).total;
    if(currentScore!==decision.score||state.matchContext.lastScoreBySide[action.actorId]!==decision.previousGoScore)throw new Error('Go/Stop decision is stale.');
    delete state.pendingDecision;
    const events=[];
    if(action.type==='declareGo'){
      state[side].go++;
      state[side].lastGoScore=currentScore;
      state.matchContext.lastScoreBySide[action.actorId]=currentScore;
      events.push({type:'goDeclared',audience:'public',actorId:action.actorId,goCount:state[side].go,score:currentScore});
      const requiresNagari=cannotContinueTurn(state,side);
      if(!requiresNagari){
        state.turn=otherPlayerId(action.actorId);
        events.push({type:'turnHandedOff',audience:'public',actorId:action.actorId,toPlayerId:state.turn});
      }
      return {state,events,pendingDecision:null,requiresNagari};
    }
    const otherSide=side==='human'?'ai':'human';
    const settlement=calculateSettlement({winner:state[side],loser:state[otherSide],nagariCarryPower:state.matchContext.nagariCarryPower});
    state.winner=action.actorId;
    state.terminalResult={type:'stop',winnerId:action.actorId,score:settlement.total,settlement};
    state.matchContext.nagariCarryPower=0;
    events.push({type:'stopDeclared',audience:'public',actorId:action.actorId});
    events.push({type:'handEnded',audience:'public',winnerId:action.actorId,reason:'stop',settlement:serializeGameState(settlement)});
    return {state,events,pendingDecision:null,requiresNagari:false};
  }

  function selectTarget(matchIds,targetId){
    if(matchIds.length===0){
      if(targetId!=null)throw new Error('An unmatched card cannot target a floor card.');
      return null;
    }
    if(matchIds.length===1){
      if(targetId!=null&&targetId!==matchIds[0])throw new Error('Illegal floor target.');
      return matchIds[0];
    }
    if(targetId==null)return null;
    if(!matchIds.includes(targetId))throw new Error('Illegal floor target.');
    return targetId;
  }

  function classifyTurnOutcome(currentState,{actorId,cardId}={}){
    const state=deserializeGameState(currentState);
    const side=validateActor(state,{actorId});
    const pending=state.pendingTurn;
    if(!pending){
      const card=state[side].hand.find(item=>item.id===cardId);
      if(!card)throw new Error('A pending turn or owned cardId is required for classification.');
      const sameMonth=state[side].hand.filter(item=>item.month===card.month);
      const floorMatches=matchingCards(state.floor,card);
      const bombEligible=sameMonth.length===3&&state[side].hiddenTripleMonths.includes(card.month)&&floorMatches.length===1&&!state.floorStacks[card.month];
      return classification(bombEligible?'bombEligible':'playReady',actorId,{playedCardId:card.id,drawnCardId:null,targetIds:floorMatches.map(item=>item.id),requiresDecision:false});
    }
    if(pending.actorId!==actorId)throw new Error('No normal turn is in progress for the actor.');
    if(!pending.played){
      const base={playedCardId:null,drawnCardId:pending.drawn?.card.id||null,targetIds:[],requiresDecision:false};
      if(pending.phase==='awaitingDraw')return classification('awaitingDraw',actorId,base);
      if(pending.phase==='awaitingFloorTarget')return classification('floorTargetDecision',actorId,{...base,source:'drawn',targetIds:[...pending.drawn.matchIds],requiresDecision:true});
      if(pending.phase==='awaitingTurnCompletion')return classification('awaitingTurnCompletion',actorId,base);
      if(pending.phase!=='awaitingNormalResolution')return classification('legacySpecial',actorId,base);
      if(state.floorStacks[pending.drawn.card.month])return classification('floorStackInteraction',actorId,{...base,source:'drawn',targetIds:[...pending.drawn.matchIds],stackMonth:pending.drawn.card.month});
      if(pending.drawn.matchIds.length>2)return classification('legacySpecial',actorId,{...base,targetIds:[...pending.drawn.matchIds]});
      return classification('normal',actorId,{...base,targetIds:[...pending.drawn.matchIds],cardOutcomes:[{source:'drawn',cardId:pending.drawn.card.id,kind:pending.drawn.matchIds.length===0?'unmatchedLanding':pending.drawn.matchIds.length===1?'singleMatchCapture':'chosenMatchCapture',targetId:pending.drawn.targetId}],sweep:'postResolution'});
    }
    const base={
      playedCardId:pending.played.card.id,
      drawnCardId:pending.drawn?.card.id||null,
      targetIds:[],requiresDecision:false
    };
    if(pending.drawn&&pending.drawn.card.month===pending.played.card.month&&!state.floorStacks[pending.played.card.month]){
      const sameMonthKinds=['jjokCandidate','ppeokSsaDaCandidate','ttadakCandidate'];
      const kind=sameMonthKinds[pending.played.matchIds.length]||'legacySpecial';
      return classification(kind,actorId,{...base,targetIds:[...pending.played.matchIds]});
    }
    if(pending.phase==='awaitingFloorTarget'){
      const source=pending.played.targetId? 'drawn':'played';
      const entry=source==='played'?pending.played:pending.drawn;
      return classification('floorTargetDecision',actorId,{...base,source,targetIds:[...entry.matchIds],requiresDecision:true});
    }
    if(pending.phase==='awaitingDraw')return classification('awaitingDraw',actorId,base);
    if(pending.phase==='awaitingTurnCompletion')return classification('awaitingTurnCompletion',actorId,base);
    if(pending.phase!=='awaitingNormalResolution')return classification('legacySpecial',actorId,base);

    const played=pending.played,drawn=pending.drawn;
    const stack=state.floorStacks[played.card.month]||(drawn&&state.floorStacks[drawn.card.month]);
    if(stack){
      const entry=state.floorStacks[played.card.month]?played:drawn;
      const source=entry===played?'played':'drawn';
      const selfPpeok=stack.source==='ppeok'&&stack.owner===actorId;
      return classification(selfPpeok?'selfPpeokCandidate':'floorStackInteraction',actorId,{...base,source,targetIds:[...entry.matchIds],stackMonth:stack.month});
    }
    const entries=[played,drawn].filter(Boolean);
    if(entries.some(entry=>entry.matchIds.length>2))return classification('legacySpecial',actorId,{...base,targetIds:entries.flatMap(entry=>entry.matchIds)});
    const cardOutcomes=entries.map(entry=>({
      source:entry===played?'played':'drawn',cardId:entry.card.id,
      kind:entry.matchIds.length===0?'unmatchedLanding':entry.matchIds.length===1?'singleMatchCapture':'chosenMatchCapture',
      targetId:entry.targetId
    }));
    return classification('normal',actorId,{...base,targetIds:entries.flatMap(entry=>entry.matchIds),cardOutcomes,sweep:'postResolution'});
  }

  function classification(kind,actorId,details){
    return {kind,actorId,...details};
  }

  function transferPi(state,fromSide,toSide,count){
    const transferred=[];
    for(let index=0;index<count;index++){
      const ordinary=state[fromSide].captured.find(card=>card.type==='pi'&&!card.flags.includes('doublePi'));
      const card=ordinary||state[fromSide].captured.find(item=>item.type==='pi');
      if(!card)break;
      state[fromSide].captured=state[fromSide].captured.filter(item=>item.id!==card.id);
      state[toSide].captured.push(card);
      transferred.push(card.id);
    }
    return transferred;
  }

  function removeFloorCardIds(state,cardIds){
    const ids=new Set(cardIds);
    state.floor=state.floor.filter(card=>!ids.has(card.id));
    cardIds.forEach(id=>delete state.floorSlotByCard[id]);
    Object.keys(state.floorStacks).forEach(month=>{
      if(state.floorStacks[month].cardIds.some(id=>ids.has(id)))delete state.floorStacks[month];
    });
  }

  function applySweepMutation(state,actorId,side,events,rule){
    if(state.floor.length!==0||!(state.deck.length||state.human.hand.length||state.ai.hand.length))return;
    events.push({type:'sweepTriggered',audience:'public',actorId,rule});
    const otherSide=side==='human'?'ai':'human';
    transferPi(state,otherSide,side,1).forEach(cardId=>events.push({type:'piTransferred',audience:'public',actorId,reason:'sweep',cardId,fromPlayerId:otherPlayerId(actorId),toPlayerId:actorId}));
  }

  function applySweepAction(currentState,action){
    if(action.type!=='resolveSweep')throw new Error(`Unsupported Sweep action: ${action.type}`);
    const state=deserializeGameState(currentState);
    const side=validateActor(state,action);
    const events=[];
    applySweepMutation(state,action.actorId,side,events,action.rule||'legacyContinuation');
    return {state,events};
  }

  function applySpecialTurnAction(currentState,action){
    if(action.type!=='resolveSpecialTurn')throw new Error(`Unsupported special-turn action: ${action.type}`);
    const state=deserializeGameState(currentState);
    const side=validateActor(state,action);
    const actorId=action.actorId;
    const pending=state.pendingTurn;
    if(!pending||pending.actorId!==actorId)throw new Error('No turn is in progress for the actor.');
    const outcome=classifyTurnOutcome(state,{actorId});
    const events=[];
    const actor=state[side],otherSide=side==='human'?'ai':'human';
    const emitTransfers=(count,reason)=>{
      transferPi(state,otherSide,side,count).forEach(cardId=>events.push({type:'piTransferred',audience:'public',actorId,reason,cardId,fromPlayerId:otherPlayerId(actorId),toPlayerId:actorId}));
    };
    const finish=(rule,checkSweep=false)=>{
      if(pending.played)pending.played.resolved=true;
      if(pending.drawn)pending.drawn.resolved=true;
      pending.phase='awaitingTurnCompletion'; pending.nextResolution=null; pending.sweepResolved=checkSweep;
      if(checkSweep)applySweepMutation(state,actorId,side,events,rule);
      events.push({type:'specialResolved',audience:'public',actorId,rule});
      return {state,events,outcome};
    };

    if(outcome.kind==='ppeokSsaDaCandidate'){
      const target=state.floor.find(card=>card.id===pending.played.targetId)||matchingCards(state.floor,pending.played.card)[0];
      if(!target)throw new Error('Ppeok/Ssa-da target is unavailable.');
      const cards=[target,pending.played.card,pending.drawn.card];
      const slot=state.floorSlotByCard[target.id];
      cards.forEach(card=>{
        if(!state.floor.some(item=>item.id===card.id))state.floor.push(card);
        state.floorSlotByCard[card.id]=slot;
      });
      state.floorStacks[target.month]={month:target.month,cardIds:cards.map(card=>card.id),source:'ppeok',owner:actorId};
      actor.ppeoks++;
      events.push({type:'ppeokFormed',audience:'public',actorId,rule:'ppeokSsaDa',cardIds:cards.map(card=>card.id),month:target.month,slot,ppeokCount:actor.ppeoks});
      if(actor.turnsTaken===0&&actor.firstPpeokPoints===0){
        actor.firstPpeokPoints=7;
        events.push({type:'firstPpeokAwarded',audience:'public',actorId,points:7,totalBonusPoints:actor.firstPpeokPoints});
      }
      const result=finish('ppeokSsaDa');
      result.terminalResult=applyThreePpeokTerminal(state,actorId,side,events);
      return result;
    }

    if(outcome.kind==='jjokCandidate'){
      const cardIds=[pending.played.card.id,pending.drawn.card.id];
      actor.captured.push(pending.played.card,pending.drawn.card);
      events.push({type:'cardsCaptured',audience:'public',actorId,rule:'jjok',cardIds});
      emitTransfers(1,'jjok');
      return finish('jjok',true);
    }

    if(outcome.kind==='ttadakCandidate'){
      const floorCards=pending.played.matchIds.slice(0,2).map(id=>state.floor.find(card=>card.id===id)).filter(Boolean);
      if(floorCards.length!==2)throw new Error('Ttadak floor cards are unavailable.');
      removeFloorCardIds(state,floorCards.map(card=>card.id));
      const captured=[pending.played.card,pending.drawn.card,...floorCards];
      actor.captured.push(...captured);
      events.push({type:'cardsCaptured',audience:'public',actorId,rule:'ttadak',cardIds:captured.map(card=>card.id)});
      emitTransfers(1,'ttadak');
      return finish('ttadak',true);
    }

    if(outcome.kind==='selfPpeokCandidate'){
      const entry=outcome.source==='played'?pending.played:pending.drawn;
      const stack=state.floorStacks[outcome.stackMonth];
      const stackCards=stack.cardIds.map(id=>state.floor.find(card=>card.id===id)).filter(Boolean);
      removeFloorCardIds(state,stack.cardIds);
      actor.captured.push(entry.card,...stackCards);
      events.push({type:'floorStackRemoved',audience:'public',actorId,rule:'selfPpeok',month:stack.month,cardIds:[...stack.cardIds]});
      events.push({type:'cardsCaptured',audience:'public',actorId,rule:'selfPpeok',cardIds:[entry.card.id,...stack.cardIds]});
      emitTransfers(2,'selfPpeok');
      entry.resolved=true;
      const other=entry===pending.played?pending.drawn:pending.played;
      if(other&&!other.resolved){
        if(other.matchIds.length===0){
          const slot=other.landingSlot;
          if(slot>=state.floorSlotCount)state.floorSlotCount=slot+4;
          state.floor.push(other.card); state.floorSlotByCard[other.card.id]=slot;
          events.push({type:'cardLanded',audience:'public',actorId,source:entry===pending.played?'drawn':'played',cardId:other.card.id,slot});
        }else{
          const targetId=other.targetId||other.matchIds[0];
          const target=state.floor.find(card=>card.id===targetId)||masterDeck.find(card=>card.id===targetId);
          if(!target)throw new Error('Self-Ppeok continuation target is unavailable.');
          removeFloorCardIds(state,[targetId]);
          actor.captured.push(other.card,target);
          events.push({type:'cardsCaptured',audience:'public',actorId,rule:'normalContinuation',cardIds:[other.card.id,target.id]});
        }
        other.resolved=true;
      }
      pending.phase='awaitingTurnCompletion'; pending.nextResolution=null; pending.sweepResolved=true;
      applySweepMutation(state,actorId,side,events,'selfPpeok');
      events.push({type:'specialResolved',audience:'public',actorId,rule:'selfPpeok'});
      return {state,events,outcome};
    }

    if(outcome.kind==='floorStackInteraction'){
      const entry=outcome.source==='played'?pending.played:pending.drawn;
      const stack=state.floorStacks[outcome.stackMonth];
      if(!entry||!stack)throw new Error('Floor-stack interaction is stale.');
      const stackCards=stack.cardIds.map(id=>state.floor.find(card=>card.id===id)).filter(Boolean);
      if(stackCards.length!==stack.cardIds.length)throw new Error('Floor-stack cards are unavailable.');
      removeFloorCardIds(state,stack.cardIds);
      actor.captured.push(entry.card,...stackCards);
      events.push({type:'floorStackRemoved',audience:'public',actorId,rule:'floorStackCapture',stackSource:stack.source,month:stack.month,cardIds:[...stack.cardIds]});
      events.push({type:'cardsCaptured',audience:'public',actorId,rule:'floorStackCapture',cardIds:[entry.card.id,...stack.cardIds]});
      emitTransfers(1,stack.source==='initial'?'initialStack':'opponentPpeok');
      entry.resolved=true;
      const other=entry===pending.played?pending.drawn:pending.played;
      if(other&&!other.resolved){
        if(other.matchIds.length===0){
          const slot=other.landingSlot;
          if(slot>=state.floorSlotCount)state.floorSlotCount=slot+4;
          state.floor.push(other.card); state.floorSlotByCard[other.card.id]=slot;
          events.push({type:'cardLanded',audience:'public',actorId,source:entry===pending.played?'drawn':'played',cardId:other.card.id,slot});
        }else{
          const targetId=other.targetId||other.matchIds[0];
          const target=state.floor.find(card=>card.id===targetId);
          if(!target)throw new Error('Floor-stack continuation target is unavailable.');
          removeFloorCardIds(state,[targetId]);
          actor.captured.push(other.card,target);
          events.push({type:'cardsCaptured',audience:'public',actorId,rule:'normalContinuation',cardIds:[other.card.id,target.id]});
        }
        other.resolved=true;
      }
      pending.phase='awaitingTurnCompletion'; pending.nextResolution=null; pending.sweepResolved=true;
      applySweepMutation(state,actorId,side,events,'floorStackCapture');
      events.push({type:'specialResolved',audience:'public',actorId,rule:'floorStackCapture'});
      return {state,events,outcome};
    }

    throw new Error(`Classified outcome ${outcome.kind} is not extracted for special resolution.`);
  }

  function otherPlayerId(playerId){ return playerId===PLAYER_A?PLAYER_B:PLAYER_A; }

  function applyNormalTurnAction(currentState,action){
    const state=deserializeGameState(currentState);
    const openingResponse=state.pendingDecision?.type==='openingTripleDecision'&&['declareShake','keepShakeSecret','declareBomb'].includes(action.type);
    const independentPlayerChoice=action.type==='setGukjinMode';
    const side=openingResponse||independentPlayerChoice?legacySideForPlayerId(action.actorId):validateActor(state,action);
    if(openingResponse&&state.pendingDecision.playerId!==action.actorId)throw new Error('The opening triple decision belongs to another player.');
    const actorId=action.actorId;
    const events=[];
    const player=state[side];

    if(action.type==='setGukjinMode'){
      if(!['animal','pi'].includes(action.mode))throw new Error('Gukjin mode must be animal or pi.');
      if(!player.captured.some(card=>card.month===9&&card.flags.includes('switchPi')))throw new Error('The actor has not captured Gukjin.');
      player.gukjinMode=action.mode;
      events.push({type:'gukjinModeChanged',audience:'public',actorId,mode:action.mode});
      return {state,events,pendingDecision:null};
    }

    if(action.type==='attemptPlayCard'){
      if(state.pendingTurn||state.pendingDecision)throw new Error('A turn or decision is already in progress.');
      const card=player.hand.find(item=>item.id===action.cardId);
      if(!card)throw new Error('Attempted card is not owned by the actor.');
      const eligible=player.hand.filter(item=>item.month===card.month).length===3&&player.hiddenTripleMonths.includes(card.month)&&!player.shakenMonths.includes(card.month)&&!player.resolvedOpeningTripleMonths.includes(card.month);
      if(eligible)state.pendingDecision={type:'shakeDecision',audience:'player-private',playerId:actorId,month:card.month,cardId:card.id,choices:['shake','keepSecret']};
      return {state,events,pendingDecision:state.pendingDecision?serializeGameState(state.pendingDecision):null};
    }

    if(action.type==='requestBombDecision'){
      if(state.pendingTurn||state.pendingDecision)throw new Error('A turn or decision is already in progress.');
      const decision=bombDecisionFor(state,side,actorId,action.cardId);
      if(!decision)throw new Error('The attempted card is not Bomb eligible.');
      state.pendingDecision=decision;
      return {state,events,pendingDecision:serializeGameState(decision)};
    }

    if(action.type==='declareShake'||action.type==='keepShakeSecret'){
      const decision=state.pendingDecision;
      if(!decision||!['shakeDecision','openingTripleDecision'].includes(decision.type))throw new Error('No Shake decision is pending.');
      if(decision.playerId!==actorId)throw new Error('The Shake decision belongs to another player.');
      if(action.type==='keepShakeSecret'&&decision.type==='openingTripleDecision'&&decision.floorCardId)throw new Error('KEEP SECRET is unavailable when Bomb is immediately available.');
      delete state.pendingDecision;
      if(action.type==='declareShake'){
        const cardIds=decision.cardIds||player.hand.filter(card=>card.month===decision.month).map(card=>card.id);
        if(cardIds.length!==3)throw new Error('Shake declaration requires exactly three revealed cards.');
        player.shakes++;
        if(!player.shakenMonths.includes(decision.month))player.shakenMonths.push(decision.month);
        player.revealedShakeSets.push({month:decision.month,cardIds:[...cardIds]});
        player.hiddenTripleMonths=player.hiddenTripleMonths.filter(month=>month!==decision.month);
        events.push({type:'shakeDeclared',audience:'public',actorId,month:decision.month,cardIds:[...cardIds],shakeCount:player.shakes,multiplier:2**player.shakes});
      }
      if(decision.type==='openingTripleDecision'){
        if(!player.resolvedOpeningTripleMonths.includes(decision.month))player.resolvedOpeningTripleMonths.push(decision.month);
        advanceOpeningTripleDecision(state);
        return {state,events,pendingDecision:state.pendingDecision?serializeGameState(state.pendingDecision):null};
      }else if(action.type==='keepShakeSecret'){
        const bombDecision=bombDecisionFor(state,side,actorId,decision.cardId);
        if(bombDecision)state.pendingDecision=bombDecision;
      }
      return {state,events,pendingDecision:state.pendingDecision?serializeGameState(state.pendingDecision):null,resumePlay:{actorId,cardId:decision.cardId}};
    }


    if(action.type==='declineBomb'||action.type==='declareBomb'){
      let decision=state.pendingDecision;
      if(action.type==='declareBomb'&&decision?.type==='openingTripleDecision'){
        if(!decision.floorCardId)throw new Error('Bomb is unavailable for this opening triple.');
        if(!player.resolvedOpeningTripleMonths.includes(decision.month))player.resolvedOpeningTripleMonths.push(decision.month);
        decision={type:'bombDecision',audience:'player-private',playerId:actorId,month:decision.month,cardIds:[...decision.cardIds],floorCardId:decision.floorCardId,choices:['bomb','playNormally']};
        state.pendingDecision=decision;
        state.turn=actorId;
        state.resumeOpeningAfterTurn=true;
      }
      if(!decision||decision.type!=='bombDecision')throw new Error('No Bomb decision is pending.');
      if(decision.playerId!==actorId)throw new Error('The Bomb decision belongs to another player.');
      delete state.pendingDecision;
      if(action.type==='declineBomb')return {state,events,pendingDecision:null,resumePlay:{actorId,cardId:decision.cardIds[0]}};
      const bombCards=decision.cardIds.map(id=>player.hand.find(card=>card.id===id));
      const floorCard=state.floor.find(card=>card.id===decision.floorCardId);
      if(bombCards.some(card=>!card)||!floorCard)throw new Error('Bomb decision is stale.');
      player.hand=player.hand.filter(card=>!decision.cardIds.includes(card.id));
      player.hiddenTripleMonths=player.hiddenTripleMonths.filter(month=>month!==decision.month);
      removeFloorCardIds(state,[floorCard.id]);
      player.captured.push(...bombCards,floorCard);
      player.bombs++; player.bombFreeTurns+=2;
      events.push({type:'bombDeclared',audience:'public',actorId,month:decision.month,bombCount:player.bombs});
      events.push({type:'bombCardsPlayed',audience:'public',actorId,cardIds:[...decision.cardIds]});
      events.push({type:'cardsCaptured',audience:'public',actorId,rule:'bomb',cardIds:[...decision.cardIds,floorCard.id]});
      const otherSide=side==='human'?'ai':'human';
      transferPi(state,otherSide,side,1).forEach(cardId=>events.push({type:'piTransferred',audience:'public',actorId,reason:'bomb',cardId,fromPlayerId:otherPlayerId(actorId),toPlayerId:actorId}));
      events.push({type:'bombBlankTurnsGranted',audience:'public',actorId,count:2,remaining:player.bombFreeTurns});
      events.push({type:'specialResolved',audience:'public',actorId,rule:'bomb'});
      state.pendingTurn={phase:'awaitingDraw',mode:'bomb',actorId,nextResolution:null,played:null,drawn:null,sweepResolved:false};
      return {state,events,pendingDecision:null};
    }

    if(action.type==='useBombBlank'){
      if(state.pendingTurn||state.pendingDecision)throw new Error('A turn or decision is already in progress.');
      if(player.bombFreeTurns<=0)throw new Error('No Bomb blank turns remain.');
      player.bombFreeTurns--;
      state.pendingTurn={phase:'awaitingDraw',mode:'bombBlank',actorId,nextResolution:null,played:null,drawn:null,sweepResolved:false};
      events.push({type:'bombBlankUsed',audience:'public',actorId,remaining:player.bombFreeTurns});
      return {state,events,pendingDecision:null};
    }

    if(action.type==='playCard'){
      if(state.pendingTurn||state.pendingDecision)throw new Error('A turn or decision is already in progress.');
      const index=player.hand.findIndex(card=>card.id===action.cardId);
      if(index<0)throw new Error('Played card is not owned by the actor.');
      const card=player.hand[index];
      player.hiddenTripleMonths=player.hiddenTripleMonths.filter(month=>month!==card.month);
      const matchIds=matchingCards(state.floor,card).map(match=>match.id);
      const targetId=selectTarget(matchIds,action.targetId);
      player.hand.splice(index,1);
      const landingSlot=matchIds.length===0?firstOpenFloorSlot(state):null;
      const needsTarget=matchIds.length>1&&!targetId;
      state.pendingTurn={phase:needsTarget?'awaitingFloorTarget':'awaitingDraw',actorId,nextResolution:null,played:{card,matchIds,targetId,landingSlot,resolved:false},drawn:null};
      events.push({type:'cardPlayed',audience:'public',actorId,card,targetId,matchCount:matchIds.length});
      return {state,events,pendingDecision:needsTarget?targetDecision(state.pendingTurn,'played'):null};
    }

    const pending=state.pendingTurn;
    if(!pending||pending.actorId!==actorId)throw new Error('No normal turn is in progress for the actor.');

    if(action.type==='chooseFloorTarget'){
      if(pending.phase!=='awaitingFloorTarget')throw new Error('The turn is not awaiting a floor target.');
      const entry=action.source==='played'?pending.played:action.source==='drawn'?pending.drawn:null;
      if(!entry)throw new Error('Unknown target-choice source.');
      entry.targetId=selectTarget(entry.matchIds,action.targetId);
      if(!entry.targetId)throw new Error('A legal floor target is required.');
      pending.phase=action.source==='played'?'awaitingDraw':'awaitingNormalResolution';
      if(action.source==='drawn')pending.nextResolution=pending.played?'played':'drawn';
      events.push({type:'floorTargetChosen',audience:'public',actorId,source:action.source,targetId:entry.targetId});
      return {state,events,pendingDecision:null};
    }

    if(action.type==='drawNextCard'){
      if(pending.phase!=='awaitingDraw')throw new Error('The turn is not awaiting a deck draw.');
      if(pending.drawn)throw new Error('The deck card has already been drawn.');
      if(!state.deck.length){
        pending.phase=pending.played?'awaitingNormalResolution':'awaitingTurnCompletion';
        pending.nextResolution=pending.played?'played':null;
        return {state,events,pendingDecision:null};
      }
      const card=state.deck.shift();
      const matchIds=matchingCards(state.floor,card).map(match=>match.id);
      const reserved=pending.played?.landingSlot==null?[]:[pending.played.landingSlot];
      const landingSlot=matchIds.length===0?firstOpenFloorSlot(state,reserved):null;
      pending.drawn={card,matchIds,targetId:selectTarget(matchIds,action.targetId),landingSlot,resolved:false};
      const needsTarget=matchIds.length>1&&!pending.drawn.targetId;
      pending.phase=needsTarget?'awaitingFloorTarget':'awaitingNormalResolution';
      if(!needsTarget)pending.nextResolution=pending.played?'played':'drawn';
      events.push({type:'deckCardRevealed',audience:'public',actorId,card,targetId:pending.drawn.targetId,matchCount:matchIds.length});
      return {state,events,pendingDecision:needsTarget?targetDecision(pending,'drawn'):null};
    }

    if(action.type==='deferSpecialTurn'){
      delete state.pendingTurn;
      return {state,events,pendingDecision:null};
    }

    if(action.type==='resolveNormalCard'){
      if(pending.phase!=='awaitingNormalResolution')throw new Error('The turn is not awaiting normal resolution.');
      if(action.source!==pending.nextResolution)throw new Error(`The next normal resolution must be ${pending.nextResolution}.`);
      const entry=action.source==='played'?pending.played:action.source==='drawn'?pending.drawn:null;
      if(!entry||entry.resolved)throw new Error('Card is unavailable for normal resolution.');
      if(entry.matchIds.length>2||!entry.targetId&&entry.matchIds.length>0)throw new Error('Card requires non-normal resolution or a target.');
      if(state.floorStacks[entry.card.month])throw new Error('Stack capture requires special-rule resolution.');
      if(pending.played&&pending.drawn&&pending.drawn.card.month===pending.played.card.month)throw new Error('Same-month turn requires special-rule resolution.');
      if(entry.matchIds.length===0){
        const slot=entry.landingSlot;
        if(slot>=state.floorSlotCount)state.floorSlotCount=slot+4;
        state.floor.push(entry.card); state.floorSlotByCard[entry.card.id]=slot;
        events.push({type:'cardLanded',audience:'public',actorId,source:action.source,card:entry.card,slot});
      }else{
        const target=state.floor.find(card=>card.id===entry.targetId);
        if(!target)throw new Error('Selected floor target is no longer available.');
        state.floor=state.floor.filter(card=>card.id!==target.id);
        delete state.floorSlotByCard[target.id];
        player.captured.push(entry.card,target);
        events.push({type:'cardsCaptured',audience:'public',actorId,source:action.source,cards:[entry.card,target]});
      }
      entry.resolved=true;
      if(pending.played?.resolved&&pending.drawn&&!pending.drawn.resolved)pending.nextResolution='drawn';
      else if((!pending.played||pending.played.resolved)&&(!pending.drawn||pending.drawn.resolved)){
        pending.phase='awaitingTurnCompletion';
        pending.nextResolution=null;
      }
      return {state,events,pendingDecision:null};
    }

    if(action.type==='completeTurn'){
      if(pending.phase!=='awaitingTurnCompletion')throw new Error('The turn is not awaiting completion.');
      if(pending.played&&!pending.played.resolved||pending.drawn&&!pending.drawn.resolved)throw new Error('Normal turn cards are not fully resolved.');
      if(!pending.sweepResolved)applySweepMutation(state,actorId,side,events,'normal');
      delete state.pendingTurn;
      player.turnsTaken++;
      if(state.resumeOpeningAfterTurn){delete state.resumeOpeningAfterTurn;advanceOpeningTripleDecision(state);}
      events.push({type:'turnCompleted',audience:'public',actorId});
      return {state,events,pendingDecision:null};
    }

    throw new Error(`Unsupported normal-turn action: ${action.type}`);
  }

  function targetDecision(pending,source){
    const entry=source==='played'?pending.played:pending.drawn;
    return {type:'chooseFloorTarget',audience:'player-private',playerId:pending.actorId,actorId:pending.actorId,source,cardId:entry.card.id,legalTargetIds:[...entry.matchIds],phase:pending.phase};
  }

  const api=Object.freeze({
    monthNames,monthShort,masterDeck,
    assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,hasFourOfMonth,
    matchingCards,score,scorePlayer,scoreWithGukjinMode,calculateSettlement,
    serializeGameState,deserializeGameState,projectStateForViewer,initializeShakeEligibility,resolveOpeningState,resolveNagari,resolveThreePpeok,evaluateGoStop,applyGoStopAction,applyNormalTurnAction,applySpecialTurnAction,applySweepAction,classifyTurnOutcome
  });

  globalThis.GoStopEngine=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
