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

  function score(cards){
    const normal=scoreWithGukjinMode(cards,false);
    const asPi=scoreWithGukjinMode(cards,true);
    return asPi.total>normal.total?asPi:normal;
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
    const winnerScore=score(winner.captured),loserScore=score(loser.captured);
    const baseTotal=winnerScore.total;
    const goBonus=Math.min(winner.go,2);
    let total=baseTotal+goBonus;
    const reasons=[];
    const formulaSteps=[`Base ${baseTotal}`];

    if(goBonus>0)formulaSteps.push(`Go bonus +${goBonus}`);
    if(winner.go>=3){
      const goMultiplier=2**(winner.go-2);
      total*=goMultiplier;
      reasons.push(`${winner.go} Go ×${goMultiplier}`);
      formulaSteps.push(`${winner.go} Go ×${goMultiplier}`);
    }

    let doublePower=winner.shakes+winner.bombs;
    if(winner.shakes){
      const multiplier=2**winner.shakes;
      reasons.push(`Shake ×${multiplier}`);
      formulaSteps.push(`Shake ×${multiplier}`);
    }
    if(winner.bombs){
      const multiplier=2**winner.bombs;
      reasons.push(`Bomb ×${multiplier}`);
      formulaSteps.push(`Bomb ×${multiplier}`);
    }
    if(winnerScore.animals>=7){doublePower++;reasons.push('Meong-bak ×2');formulaSteps.push('Meong-bak ×2');}
    if(winnerScore.piCount>=10&&loserScore.piCount<=7){doublePower++;reasons.push('Pi-bak ×2');formulaSteps.push('Pi-bak ×2');}
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
    return state;
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
    if(state.turn!==action.actorId)throw new Error(`It is not ${action.actorId}'s turn.`);
    return side;
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
      const selfPpeok=stack.source==='ppeok'&&stack.owner===actorId;
      return classification(selfPpeok?'selfPpeokCandidate':'floorStackInteraction',actorId,{...base,targetIds:[...entry.matchIds],stackMonth:stack.month});
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

  function applyNormalTurnAction(currentState,action){
    const state=deserializeGameState(currentState);
    const side=validateActor(state,action);
    const actorId=action.actorId;
    const events=[];
    const player=state[side];

    if(action.type==='playCard'){
      if(state.pendingTurn)throw new Error('A turn is already in progress.');
      const index=player.hand.findIndex(card=>card.id===action.cardId);
      if(index<0)throw new Error('Played card is not owned by the actor.');
      const card=player.hand[index];
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
      if(action.source==='drawn')pending.nextResolution='played';
      events.push({type:'floorTargetChosen',audience:'public',actorId,source:action.source,targetId:entry.targetId});
      return {state,events,pendingDecision:null};
    }

    if(action.type==='drawNextCard'){
      if(pending.phase!=='awaitingDraw')throw new Error('The turn is not awaiting a deck draw.');
      if(pending.drawn)throw new Error('The deck card has already been drawn.');
      if(!state.deck.length){ pending.phase='awaitingNormalResolution'; pending.nextResolution='played'; return {state,events,pendingDecision:null}; }
      const card=state.deck.shift();
      const matchIds=matchingCards(state.floor,card).map(match=>match.id);
      const reserved=pending.played.landingSlot==null?[]:[pending.played.landingSlot];
      const landingSlot=matchIds.length===0?firstOpenFloorSlot(state,reserved):null;
      pending.drawn={card,matchIds,targetId:selectTarget(matchIds,action.targetId),landingSlot,resolved:false};
      const needsTarget=matchIds.length>1&&!pending.drawn.targetId;
      pending.phase=needsTarget?'awaitingFloorTarget':'awaitingNormalResolution';
      if(!needsTarget)pending.nextResolution='played';
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
      if(pending.drawn&&pending.drawn.card.month===pending.played.card.month)throw new Error('Same-month turn requires special-rule resolution.');
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
      if(pending.played.resolved&&pending.drawn&&!pending.drawn.resolved)pending.nextResolution='drawn';
      else if(pending.played.resolved&&(!pending.drawn||pending.drawn.resolved)){
        pending.phase='awaitingTurnCompletion';
        pending.nextResolution=null;
      }
      return {state,events,pendingDecision:null};
    }

    if(action.type==='completeTurn'){
      if(pending.phase!=='awaitingTurnCompletion')throw new Error('The turn is not awaiting completion.');
      if(!pending.played.resolved||pending.drawn&&!pending.drawn.resolved)throw new Error('Normal turn cards are not fully resolved.');
      delete state.pendingTurn;
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
    matchingCards,score,scoreWithGukjinMode,calculateSettlement,
    serializeGameState,deserializeGameState,applyNormalTurnAction,classifyTurnOutcome
  });

  globalThis.GoStopEngine=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
