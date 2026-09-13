(() => {
  'use strict';

  const engine=globalThis.GoStopEngine||(typeof require==='function'?require('./game-engine.js'):null);
  if(!engine)throw new Error('GoStopEngine must load before session-authority.js.');

  const PLAYER_IDS=Object.freeze(['playerA','playerB']);
  const NORMAL_ACTIONS=new Set(['setGukjinMode','attemptPlayCard','requestBombDecision','declareShake','keepShakeSecret','armOpeningBomb','declineBomb','declareBomb','useBombBlank','playCard','chooseFloorTarget','drawNextCard','deferSpecialTurn','resolveNormalCard','completeTurn']);
  const GO_STOP_ACTIONS=new Set(['declareGo','declareStop']);
  const SPECIAL_ACTIONS=new Set(['resolveSpecialTurn']);
  const SWEEP_ACTIONS=new Set(['resolveSweep']);

  class AuthorityError extends Error{
    constructor(code,message){super(message);this.name='AuthorityError';this.code=code;}
  }

  function clone(value){return engine.serializeGameState(value);}
  function plainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
  function requireCrypto(cryptoApi){
    if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')throw new AuthorityError('SECURE_RNG_UNAVAILABLE','Secure shuffle requires crypto.getRandomValues().');
    return cryptoApi;
  }
  function secureRandomInt(cryptoApi,maxExclusive){
    const range=0x100000000,limit=range-(range%maxExclusive),buffer=new Uint32Array(1);
    do{cryptoApi.getRandomValues(buffer);}while(buffer[0]>=limit);
    return buffer[0]%maxExclusive;
  }
  function secureId(cryptoApi,prefix){
    const words=new Uint32Array(4);cryptoApi.getRandomValues(words);
    return `${prefix}_${Array.from(words,value=>value.toString(16).padStart(8,'0')).join('')}`;
  }
  function shuffledDeck(cryptoApi){
    const deck=engine.masterDeck.map(card=>clone(card));
    for(let index=deck.length-1;index>0;index--){
      const swap=secureRandomInt(cryptoApi,index+1);
      [deck[index],deck[swap]]=[deck[swap],deck[index]];
    }
    engine.assertDeckIntegrity(deck);
    return deck;
  }
  function makePlayer(hand){return {hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0};}
  function makeHand(cryptoApi,startingPlayerId,nagariCarryPower=0){
    let deck,human,ai,floor;
    for(let attempt=0;attempt<200;attempt++){
      deck=shuffledDeck(cryptoApi);human=[];ai=[];floor=[];
      for(let pass=0;pass<2;pass++){human.push(...deck.splice(0,5));ai.push(...deck.splice(0,5));floor.push(...deck.splice(0,4));}
      if(!engine.hasFourOfMonth(floor))break;
      if(attempt===199)throw new Error('Unable to produce a valid initial floor after 200 secure deals.');
    }
    const floorSlotByCard={};floor.forEach((card,index)=>{floorSlotByCard[card.id]=index;});
    const floorStacks={};
    Object.entries(engine.countsByMonth(floor)).filter(([,count])=>count===3).forEach(([month])=>{
      const cards=floor.filter(card=>card.month===Number(month));
      const slot=Math.min(...cards.map(card=>floorSlotByCard[card.id]));
      cards.forEach(card=>{floorSlotByCard[card.id]=slot;});
      floorStacks[month]={month:Number(month),cardIds:cards.map(card=>card.id),source:'initial',owner:null};
    });
    return engine.initializeShakeEligibility({deck,floor,human:makePlayer(human),ai:makePlayer(ai),floorStacks,floorSlotByCard,floorSlotCount:12,startingPlayerId,turn:startingPlayerId,winner:null,specialWinner:null,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower}});
  }
  function publicTerminal(match,terminal){
    if(!terminal)return null;
    const result=clone(terminal),winnerId=terminal.winnerId?match.playerBySeat.get(terminal.winnerId)||terminal.winnerId:null;
    if(result.winnerId)result.winnerId=winnerId;
    return {matchId:match.id,gameMode:match.gameMode,playerIds:[...match.playerIds],winnerId,result,status:'completed',completedAt:match.completedAt};
  }
  function projectEvent(event,viewerId){
    if(event.audience==='player-private'&&event.playerId!==viewerId)return null;
    const projected=clone(event);delete projected.audience;
    return projected;
  }
  function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(plainObject(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
  }
  function fingerprint(action){return JSON.stringify(canonical(action));}

  function serializeMatch(match){
    return clone({id:match.id,gameMode:match.gameMode,playerIds:match.playerIds,seatByPlayer:Object.fromEntries(match.seatByPlayer),state:match.state,revision:match.revision,events:match.events,actions:Object.fromEntries(match.actions),createdAt:match.createdAt,completedAt:match.completedAt});
  }

  function createSessionAuthority(options={}){
    const cryptoApi=requireCrypto(options.crypto||globalThis.crypto);
    const now=typeof options.now==='function'?options.now:()=>new Date().toISOString();
    const matches=new Map();

    function requireMatch(matchId){const match=matches.get(matchId);if(!match)throw new AuthorityError('MATCH_NOT_FOUND','Match not found.');return match;}
    function appendEvents(match,events,revision){
      events.forEach((event,index)=>match.events.push(Object.freeze({...clone(event),revision,eventIndex:index}))); 
    }
    function dispatch(state,action){
      if(NORMAL_ACTIONS.has(action.type))return engine.applyNormalTurnAction(state,action);
      if(GO_STOP_ACTIONS.has(action.type))return engine.applyGoStopAction(state,action);
      if(SPECIAL_ACTIONS.has(action.type))return engine.applySpecialTurnAction(state,action);
      if(SWEEP_ACTIONS.has(action.type))return engine.applySweepAction(state,action);
      if(action.type==='evaluateGoStop')return engine.evaluateGoStop(state,action);
      if(action.type==='resolveOpening')return engine.resolveOpeningState(state);
      if(action.type==='resolveNagari')return engine.resolveNagari(state,action);
      if(action.type==='resolveThreePpeok')return engine.resolveThreePpeok(state,action);
      throw new AuthorityError('MALFORMED_ACTION',`Unknown action type: ${action.type}`);
    }
    function snapshot(match,viewerId){
      if(!match.playerIds.includes(viewerId))throw new AuthorityError('WRONG_PLAYER','Viewer is not a participant in this match.');
      const seatId=match.seatByPlayer.get(viewerId),projected=engine.projectStateForViewer(match.state,seatId);let nextAction=null;if(!match.state.openingSpecialsComplete)projected.legalActions=[];
      if(!match.state.terminalResult&&match.state.pendingTurn?.actorId===seatId){
        const pending=match.state.pendingTurn;
        if(pending.phase==='awaitingDraw')nextAction={type:'drawNextCard'};
        else if(pending.phase==='awaitingFloorTarget'){
          const source=pending.played?.targetId?'drawn':'played',entry=source==='played'?pending.played:pending.drawn;
          nextAction={type:'chooseFloorTarget',source,legalTargetIds:[...entry.matchIds]};
        }
        else if(pending.phase==='awaitingNormalResolution'){
          const classification=engine.classifyTurnOutcome(match.state,{actorId:seatId});
          nextAction=classification.kind==='normal'?{type:'resolveNormalCard',source:pending.nextResolution}:{type:'resolveSpecialTurn'};
        }else if(pending.phase==='awaitingTurnCompletion')nextAction={type:'completeTurn'};
      }else if(!match.state.terminalResult&&!match.state.openingSpecialsComplete&&!match.state.pendingDecision&&match.state.turn===seatId)nextAction={type:'resolveOpening'};
      return {matchId:match.id,gameMode:match.gameMode,playerIds:[...match.playerIds],viewerId,seatId,revision:match.revision,state:projected,nextAction,terminalResult:publicTerminal(match,match.state.terminalResult)};
    }

    return Object.freeze({
      createMatch({matchId,playerIds=PLAYER_IDS,gameMode='online-2player',startingPlayerId,nagariCarryPower=0}={}){
        if(!Array.isArray(playerIds)||playerIds.length!==2||new Set(playerIds).size!==2||playerIds.some(id=>typeof id!=='string'||!id))throw new AuthorityError('INVALID_PLAYERS','Milestone 1 matches require two unique player IDs.');
        const id=matchId||secureId(cryptoApi,'match');if(matches.has(id))throw new AuthorityError('MATCH_EXISTS','A match with this ID already exists.');
        // The engine currently uses neutral playerA/playerB seats. External IDs are
        // mapped to those seats without putting account identity into game rules.
        const seatIds=PLAYER_IDS;
        const starter=startingPlayerId||playerIds[secureRandomInt(cryptoApi,playerIds.length)];
        if(!playerIds.includes(starter))throw new AuthorityError('WRONG_PLAYER','Starting player is not a participant.');
        const seatStarter=seatIds[playerIds.indexOf(starter)];
        const state=makeHand(cryptoApi,seatStarter,nagariCarryPower);
        engine.assertCardConservation(state);const match={id,gameMode,playerIds:[...playerIds],seatByPlayer:new Map(playerIds.map((id,index)=>[id,seatIds[index]])),playerBySeat:new Map(seatIds.map((seat,index)=>[seat,playerIds[index]])),state,revision:0,events:[],actions:new Map(),createdAt:now(),completedAt:state.terminalResult?now():null};
        matches.set(id,match);
        return snapshot(match,playerIds[0]);
      },
      submitAction(request={}){
        if(!plainObject(request)||typeof request.matchId!=='string'||typeof request.playerId!=='string'||typeof request.actionId!=='string'||!request.actionId||!Number.isInteger(request.expectedRevision)||!plainObject(request.action)||typeof request.action.type!=='string')throw new AuthorityError('MALFORMED_ACTION','Action submission is malformed.');
        const match=requireMatch(request.matchId);
        if(!match.playerIds.includes(request.playerId))throw new AuthorityError('WRONG_PLAYER','Player is not a participant in this match.');
        const key=`${request.playerId}\u0000${request.actionId}`,actionFingerprint=fingerprint(request.action),prior=match.actions.get(key);
        if(prior){if(prior.fingerprint!==actionFingerprint)throw new AuthorityError('ACTION_ID_CONFLICT','actionId was already used with different action data.');return clone(prior.response);}
        if(request.expectedRevision!==match.revision)throw new AuthorityError('STALE_REVISION',`Expected revision ${request.expectedRevision}, current revision is ${match.revision}.`);
        const seat=match.seatByPlayer.get(request.playerId);
        const pendingOwner=match.state.pendingDecision?.playerId;
        const mayActOutOfTurn=match.state.pendingDecision?.type==='openingTripleDecision'&&pendingOwner===seat||request.action.type==='setGukjinMode';
        if(match.state.turn!==seat&&!mayActOutOfTurn)throw new AuthorityError('OUT_OF_TURN','Player cannot act out of turn.');
        let result;
        try{result=dispatch(match.state,{...clone(request.action),actorId:seat});}
        catch(error){if(error instanceof AuthorityError)throw error;throw new AuthorityError('ILLEGAL_ACTION',error.message);}
        engine.assertCardConservation(result.state);match.state=result.state;match.revision++;
        if(match.state.terminalResult&&!match.completedAt)match.completedAt=now();
        appendEvents(match,result.events||[],match.revision);
        const response={accepted:true,duplicate:false,matchId:match.id,actionId:request.actionId,revision:match.revision,events:(result.events||[]).map((event,eventIndex)=>projectEvent({...event,revision:match.revision,eventIndex},seat)).filter(Boolean),snapshot:snapshot(match,request.playerId)};
        ['autoStop','requiresNagari','resumePlay','outcome','terminalResult'].forEach(key=>{if(Object.hasOwn(result,key))response[key]=clone(result[key]);});
        match.actions.set(key,{fingerprint:actionFingerprint,response:clone(response)});
        return response;
      },
      getSnapshot({matchId,viewerId}={}){return snapshot(requireMatch(matchId),viewerId);},
      getEventsSince({matchId,viewerId,revision}={}){
        const match=requireMatch(matchId);if(!match.playerIds.includes(viewerId))throw new AuthorityError('WRONG_PLAYER','Viewer is not a participant in this match.');
        if(!Number.isInteger(revision)||revision<0||revision>match.revision)throw new AuthorityError('INVALID_REVISION','Event revision is invalid.');
        const seat=match.seatByPlayer.get(viewerId);
        return {matchId,fromRevision:revision,revision:match.revision,events:match.events.filter(event=>event.revision>revision).map(event=>projectEvent(event,seat)).filter(Boolean)};
      },
      createNewHand({matchId,startingPlayerId}={}){
        const match=requireMatch(matchId);if(!match.state.terminalResult)throw new AuthorityError('HAND_IN_PROGRESS','The current hand is not complete.');
        const starter=startingPlayerId||match.state.terminalResult.winnerId&&match.playerBySeat.get(match.state.terminalResult.winnerId)||match.playerIds[0];
        if(!match.playerIds.includes(starter))throw new AuthorityError('WRONG_PLAYER','Starting player is not a participant.');
        const carry=match.state.matchContext.nagariCarryPower||0;match.state=makeHand(cryptoApi,match.seatByPlayer.get(starter),carry);engine.assertCardConservation(match.state);match.revision++;
        appendEvents(match,[{type:'newHandCreated',audience:'public',startingPlayerId:match.seatByPlayer.get(starter)}],match.revision);match.completedAt=null;match.actions.clear();
        return snapshot(match,starter);
      },
      // A capability for the process hosting the authority (the Solo browser in
      // milestone 1; the server in milestone 2). Never expose this through a
      // transport. Player-facing reads must use getSnapshot/getEventsSince.
      readTrustedState(matchId){
        if(options.trustedRuntime!==true)throw new AuthorityError('FORBIDDEN','Trusted state access is disabled.');
        return clone(requireMatch(matchId).state);
      },
      // Persistence capabilities are restricted to explicitly trusted hosts. They
      // are intentionally absent from every browser/network protocol adapter.
      exportMatch(matchId){
        if(options.trustedRuntime!==true)throw new AuthorityError('FORBIDDEN','Trusted persistence access is disabled.');
        return serializeMatch(requireMatch(matchId));
      },
      restoreMatch(record){
        if(options.trustedRuntime!==true)throw new AuthorityError('FORBIDDEN','Trusted persistence access is disabled.');
        const data=clone(record);
        if(!plainObject(data)||typeof data.id!=='string'||!Array.isArray(data.playerIds)||data.playerIds.length!==2||!Number.isInteger(data.revision)||data.revision<0)throw new AuthorityError('INVALID_PERSISTED_MATCH','Persisted match is malformed.');
        if(matches.has(data.id))throw new AuthorityError('MATCH_EXISTS','A match with this ID already exists.');
        const seatByPlayer=new Map(Object.entries(data.seatByPlayer||{}));
        if(data.playerIds.some(id=>!PLAYER_IDS.includes(seatByPlayer.get(id)))||new Set(seatByPlayer.values()).size!==2)throw new AuthorityError('INVALID_PERSISTED_MATCH','Persisted seat assignments are invalid.');
        const restoredState=engine.deserializeGameState(data.state);engine.assertCardConservation(restoredState);const match={id:data.id,gameMode:data.gameMode||'online-2player',playerIds:[...data.playerIds],seatByPlayer,playerBySeat:new Map([...seatByPlayer].map(([player,seat])=>[seat,player])),state:restoredState,revision:data.revision,events:Array.isArray(data.events)?data.events.map(clone):[],actions:new Map(Object.entries(data.actions||{})),createdAt:data.createdAt||now(),completedAt:data.completedAt||null};
        matches.set(match.id,match);
        return snapshot(match,match.playerIds[0]);
      },
      get matchCount(){return matches.size;}
    });
  }

  const api=Object.freeze({createSessionAuthority,AuthorityError});
  globalThis.GoStopSessionAuthority=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
