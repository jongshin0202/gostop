import '../game-engine.js';
import {RoomCore,RoomError} from './room-core.mjs';
import {PROTOCOL_VERSION,envelope,parseClientMessage} from './protocol.mjs';

const DEFAULT_INACTIVITY_NUDGE_MS=180000;
const DEFAULT_NUDGE_PHASE_MS=60000;
const DEFAULT_ABANDONMENT_COUNTDOWN_MS=30000;
const DEFAULT_PAUSE_DURATION_MS=180000;
const RECONNECT_GRACE_MS=60000;
const RUNTIME_ORPHAN_GRACE_MS=15000;
const clone=value=>JSON.parse(JSON.stringify(value));
const sideForSeat=seat=>seat==='playerA'?'human':'ai';
const otherSeat=seat=>seat==='playerA'?'playerB':'playerA';

function freshRankFlow(){return {pauseRemaining:{},pause:null,pauseResolution:null,quitRequest:null,quitGeneration:0,scheduledQuitBy:null,inactivity:null,disconnectDeadlines:{},disconnectSettlements:{},runtimeOrphanDeadlines:{},disconnectCancelled:false,abandonment:null,botPendingCardId:null};}
function randomUnit(cryptoApi){const b=new Uint32Array(1);cryptoApi.getRandomValues(b);return b[0]/0x100000000;}
function captureValue(card){let value={bright:12,animal:5,ribbon:4,pi:2}[card?.type]||1;if(card?.flags?.includes('doublePi'))value+=4;if(card?.flags?.includes('godori'))value+=4;if(card?.ribbonSet)value+=2;return value;}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function seed32(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function seededRandom(seed){let x=seed||0x9e3779b9;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function unsettledCards(state){
  const cards=new Map(),add=list=>{for(const card of list||[])if(card?.id)cards.set(card.id,card);};
  add(state?.deck);add(state?.floor);add(state?.human?.hand);add(state?.ai?.hand);add([state?.pendingTurn?.played?.card,state?.pendingTurn?.drawn?.card]);
  return [...cards.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
export function estimateFairDisconnectSettlement(state,{quitterSeatId,opponentSeatId}={}){
  if(!state||!quitterSeatId||!opponentSeatId)return {settlementType:'nagari',fairPoints:0,quitterScore:0,opponentScore:0,reasons:[],formulaSteps:[]};
  const quitter=state[sideForSeat(quitterSeatId)],opponent=state[sideForSeat(opponentSeatId)];
  const quitterScore=globalThis.GoStopEngine.scorePlayer(quitter).total,opponentScore=globalThis.GoStopEngine.scorePlayer(opponent).total;
  if(opponentScore<=quitterScore)return {settlementType:'nagari',fairPoints:0,quitterScore,opponentScore,reasons:[],formulaSteps:[]};
  const settlement=globalThis.GoStopEngine.calculateSettlement({winner:opponent,loser:quitter,nagariCarryPower:state.matchContext?.nagariCarryPower||0});
  return {settlementType:'current-settlement',fairPoints:Math.max(0,Math.trunc(Number(settlement.total)||0)),quitterScore,opponentScore,reasons:[...(settlement.reasons||[])],formulaSteps:[...(settlement.formulaSteps||[])],baseTotal:settlement.baseTotal||opponentScore};
}


export class RankedRoomCore extends RoomCore{
  constructor(options={}){super(options);this.durableState=options.durableState||null;const positive=(value,fallback)=>{const number=Number(value);return Number.isFinite(number)&&number>0?number:fallback;};this.inactivityNudgeMs=positive(options.inactivityNudgeMs,DEFAULT_INACTIVITY_NUDGE_MS);this.nudgePhaseMs=positive(options.nudgePhaseMs,DEFAULT_NUDGE_PHASE_MS);this.abandonmentCountdownMs=positive(options.abandonmentCountdownMs,DEFAULT_ABANDONMENT_COUNTDOWN_MS);this.pauseDurationMs=positive(options.pauseDurationMs,DEFAULT_PAUSE_DURATION_MS);}
  nowMs(){return Date.parse(this.now());}
  async load(){
    const room=await super.load();if(!room)return null;
    room.rankFlow={...freshRankFlow(),...(room.rankFlow||{}),pauseRemaining:{...(room.rankFlow?.pauseRemaining||{})},disconnectDeadlines:{...(room.rankFlow?.disconnectDeadlines||{})},disconnectSettlements:{...(room.rankFlow?.disconnectSettlements||{})},runtimeOrphanDeadlines:{...(room.rankFlow?.runtimeOrphanDeadlines||{})}};
    for(const participant of room.participants)if(room.rankFlow.pauseRemaining[participant.playerId]==null)room.rankFlow.pauseRemaining[participant.playerId]=2;
    return room;
  }
  isSolo(){return this.room?.rankedMode==='solo';}
  isRanked(){
    if(this.isSolo())return !!this.accountStore&&this.room.participants.some(item=>item.bot)&&this.room.participants.some(item=>!item.bot&&!!item.accountId);
    return super.isRanked();
  }
  participantProfile(participant){return {...super.participantProfile(participant),bot:!!participant.bot,computerLevel:participant.computerLevel||null};}
  publicRoom(){return {...super.publicRoom(),rankedMode:this.room.rankedMode||'online'};}
  flowFor(participant){
    const base=super.flowFor(participant),flow=this.room.rankFlow||freshRankFlow(),pause=flow.pause,resolution=flow.pauseResolution,quit=flow.quitRequest,inactivity=flow.inactivity,abandonment=flow.abandonment;
    return {...base,rankedMode:this.room.rankedMode||'online',disconnectCancelled:!!flow.disconnectCancelled,pause:pause?{active:true,expired:pause.phase==='expired',requestedByYou:pause.playerId===participant.playerId,until:pause.until,expiredAt:pause.expiredAt||null,remainingForYou:flow.pauseRemaining[participant.playerId]??2,remainingForOpponent:flow.pauseRemaining[this.room.participants.find(item=>item.playerId!==participant.playerId)?.playerId]??2}:null,pauseResolution:resolution?{type:resolution.type,winnerPlayerId:resolution.winnerPlayerId||null,wonByYou:resolution.winnerPlayerId?resolution.winnerPlayerId===participant.playerId:null,points:resolution.points||0,reason:resolution.reason||null}:null,quitRequest:quit?{requestId:quit.requestId,requestedByYou:quit.requesterPlayerId===participant.playerId}:null,scheduledQuitByYou:flow.scheduledQuitBy===participant.playerId,inactivity:inactivity?{phase:inactivity.phase,byYou:inactivity.playerId===participant.playerId,playerId:inactivity.playerId,nudgeAt:inactivity.nudgeAt,warningAt:inactivity.warningAt,abandonAt:inactivity.abandonAt,penaltyCoins:inactivity.penaltyCoins||null}:null,abandonment:abandonment?{byYou:abandonment.playerId===participant.playerId,penaltyCoins:abandonment.penaltyCoins,rewardCoins:abandonment.rewardCoins||0,fairPoints:abandonment.fairPoints||0,settlementType:abandonment.settlementType||'legacy',quitterScore:abandonment.quitterScore||0,opponentScore:abandonment.opponentScore||0,firstEver:!!abandonment.firstEver,firstOfMonth:!!abandonment.firstOfMonth,refundable:!!abandonment.refundable,rewardNoticeId:abandonment.rewardNoticeId||null,reason:abandonment.reason}:null};
  }
  async createSolo(roomCode){
    const created=await super.create(roomCode,null);await this.load();
    const bot=this.room.participants[0];bot.bot=true;bot.nickname='Computer #1';bot.walletCoins=100;bot.computerLevel=1;
    this.room.rankedMode='solo';this.room.rankFlow=freshRankFlow();this.room.rankFlow.pauseRemaining[bot.playerId]=0;this.room.solo={computerLevel:1,computerBankroll:100,computerBankruptcies:0};await this.persist();
    return {...created,...this.publicRoom()};
  }
  async startRankedSession(){
    if(!this.isRanked())return null;
    if(!this.isSolo())return super.startRankedSession();
    const user=this.room.participants.find(item=>!item.bot&&item.accountId);this.room.sessionId=`solo-${this.room.roomCode}-${this.nowMs()}`;this.room.sessionStats={gamesPlayed:0,coinsWonByAccount:{},coinsLostByAccount:{},milestonesByAccount:{},computerBankruptcies:0,forceQuits:0};
    await this.accountRequest('/internal/session/start',{sessionId:this.room.sessionId,mode:'solo',accountIds:[user.accountId],opponent:{type:'computer',level:this.room.solo?.computerLevel||1},startedAt:this.now()});return this.room.sessionId;
  }
  async settleTerminal(snapshot){
    if(!this.isSolo()){
      const response=await super.settleTerminal(snapshot);
      if(snapshot?.terminalResult&&this.room.rankFlow?.scheduledQuitBy&&!this.room.sessionFlow.ended){await this.endRankedSession('scheduled-quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=this.room.rankFlow.scheduledQuitBy;this.room.status='ended';}
      return response;
    }
    if(!snapshot?.terminalResult)return null;
    const gameId=this.currentGameId();if(this.room.settledGameIds.includes(gameId))return null;
    const terminal=snapshot.terminalResult,winnerId=terminal.winnerId||null,points=Math.max(0,Math.trunc(Number(terminal.result?.score??terminal.result?.finalPoints??0))),milestones=this.milestonesForCurrentGame(),user=this.room.participants.find(item=>!item.bot),bot=this.room.participants.find(item=>item.bot);
    this.room.settledGameIds.push(gameId);
    let walletDelta=0,coinsWon=0,won=false,bankruptcies=0;
    if(winnerId===user.playerId){walletDelta=points;coinsWon=points;won=true;bot.walletCoins-=points;}
    else if(winnerId===bot.playerId){walletDelta=-points;bot.walletCoins+=points;}
    if(bot.walletCoins<=0&&winnerId===user.playerId){bankruptcies=1;this.room.solo.computerBankruptcies=(this.room.solo.computerBankruptcies||0)+1;this.room.solo.computerLevel=(this.room.solo.computerLevel||1)+1;this.room.solo.computerBankroll=this.room.solo.computerLevel*100;bot.computerLevel=this.room.solo.computerLevel;bot.nickname=`Computer #${bot.computerLevel}`;bot.walletCoins=this.room.solo.computerBankroll;}
    const participant={accountId:user.accountId,playerId:user.playerId,nickname:user.nickname,won,walletDelta,coinsWon,points:won?points:0,milestones:milestones[user.playerId]||{},computerBankruptcies:bankruptcies};
    const response=await this.accountRequest('/internal/game/settle',{gameId,sessionId:this.room.sessionId,mode:'solo',winnerPlayerId:winnerId,finalPoints:points,computer:{level:bot.computerLevel,walletAfter:bot.walletCoins},participants:[participant],recordedAt:this.now()});
    const settled=response?.game?.participants?.[0];if(settled&&Number.isFinite(settled.walletAfter))user.walletCoins=settled.walletAfter;
    this.room.sessionStats.gamesPlayed++;if(walletDelta>0)this.room.sessionStats.coinsWonByAccount[user.accountId]=(this.room.sessionStats.coinsWonByAccount[user.accountId]||0)+walletDelta;if(walletDelta<0)this.room.sessionStats.coinsLostByAccount[user.accountId]=(this.room.sessionStats.coinsLostByAccount[user.accountId]||0)+Math.abs(walletDelta);this.room.sessionStats.computerBankruptcies=(this.room.sessionStats.computerBankruptcies||0)+bankruptcies;
    const target=this.room.sessionStats.milestonesByAccount[user.accountId]||(this.room.sessionStats.milestonesByAccount[user.accountId]={});for(const [name,count] of Object.entries(participant.milestones||{}))target[name]=(target[name]||0)+count;
    if(this.room.rankFlow?.scheduledQuitBy&&!this.room.sessionFlow.ended){await this.endRankedSession('scheduled-quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=this.room.rankFlow.scheduledQuitBy;this.room.status='ended';}
    return response;
  }
  async leaveSoloForChallenge(accountId){
    await this.load();
    if(!this.room||!this.isSolo())throw new RoomError('NOT_SOLO_SESSION','Only Competitive Solo can be left for a multiplayer challenge.',409);
    const participant=this.room.participants.find(item=>!item.bot&&item.accountId===accountId);
    if(!participant)throw new RoomError('NOT_AUTHENTICATED','This account is not part of the Solo session.',401);
    if(this.room.sessionFlow?.ended)return {ok:true,alreadyEnded:true,roomCode:this.room.roomCode};
    this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};
    await this.endRankedSession('accepted-multiplayer-challenge');
    this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=participant.playerId;this.room.status='ended';
    await this.persist();if(this.room.matchId)this.broadcastSnapshots();await this.scheduleAlarm();
    return {ok:true,roomCode:this.room.roomCode};
  }
  async connect(credential,socket){
    const participant=await super.connect(credential,socket);await this.load();
    if(this.room.rankFlow.disconnectDeadlines[participant.playerId])delete this.room.rankFlow.disconnectDeadlines[participant.playerId];
    if(this.room.rankFlow.disconnectSettlements?.[participant.playerId])delete this.room.rankFlow.disconnectSettlements[participant.playerId];
    if(this.room.rankFlow.runtimeOrphanDeadlines?.[participant.playerId])delete this.room.rankFlow.runtimeOrphanDeadlines[participant.playerId];
    this.room.rankFlow.disconnectCancelled=false;
    if(!this.room.matchId){await this.persist();return participant;}
    if(this.isSolo())await this.advanceBot();else await this.refreshInactivity();
    await this.scheduleAlarm();await this.persist();this.broadcastSnapshots();return participant;
  }
  async disconnect(socket){
    const playerId=socket.__playerId,disconnected=await super.disconnect(socket);if(!disconnected||!playerId||!this.room||this.room.sessionFlow.ended||this.room.terminalResult)return false;
    const participant=this.room.participants.find(item=>item.playerId===playerId);if(!participant||participant.bot||!this.isRanked())return disconnected;
    if(this.room.rankFlow.runtimeOrphanDeadlines?.[playerId])delete this.room.rankFlow.runtimeOrphanDeadlines[playerId];
    this.room.rankFlow.disconnectSettlements[playerId]=this.calculateDisconnectSettlement(playerId);this.room.rankFlow.disconnectDeadlines[playerId]=this.nowMs()+RECONNECT_GRACE_MS;if(this.room.rankFlow.inactivity?.playerId===playerId)this.room.rankFlow.inactivity=null;await this.persist();await this.scheduleAlarm();return true;
  }
  async endRuntimeOrphan(playerId){
    if(!this.room||this.room.sessionFlow.ended)return {active:false,reason:'ended'};
    const participant=this.room.participants.find(item=>item.playerId===playerId);if(!participant||participant.bot)return {active:false,reason:'participant-missing'};
    this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};this.room.rankFlow.runtimeOrphanDeadlines={};this.room.rankFlow.abandonment=null;
    await this.endRankedSession('runtime-orphan-timeout');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=null;this.room.status='ended';await this.persist();this.broadcastSnapshots();await this.scheduleAlarm();
    return {active:false,reason:'runtime-orphan-timeout'};
  }
  async reconcileActiveRanked(accountId,sessionId){
    await this.load();if(!this.room)return {active:false,reason:'room-missing'};
    if(this.room.sessionFlow?.ended||this.room.status==='ended'||!this.room.sessionId)return {active:false,reason:'room-ended'};
    if(sessionId&&this.room.sessionId!==sessionId)return {active:false,reason:'session-mismatch'};
    const participant=this.room.participants.find(item=>item.accountId===accountId&&!item.bot);if(!participant)return {active:false,reason:'participant-missing'};
    if(this.sockets.has(participant.playerId)){if(this.room.rankFlow.runtimeOrphanDeadlines?.[participant.playerId]){delete this.room.rankFlow.runtimeOrphanDeadlines[participant.playerId];await this.persist();await this.scheduleAlarm();}return {active:true,connected:true};}
    const reconnectUntil=this.room.rankFlow.disconnectDeadlines?.[participant.playerId]||0;if(reconnectUntil)return {active:true,connected:false,reconnectUntil};
    let orphanUntil=this.room.rankFlow.runtimeOrphanDeadlines?.[participant.playerId]||0;
    if(!orphanUntil){orphanUntil=this.nowMs()+RUNTIME_ORPHAN_GRACE_MS;this.room.rankFlow.runtimeOrphanDeadlines[participant.playerId]=orphanUntil;await this.persist();await this.scheduleAlarm();}
    if(this.nowMs()>=orphanUntil)return this.endRuntimeOrphan(participant.playerId);
    return {active:true,connected:false,runtimeOrphanUntil:orphanUntil};
  }
  engineState(){return this.room?.matchId?this.authority.readTrustedState(this.room.matchId):null;}
  calculateDisconnectSettlement(playerId){
    const frozen=this.room?.rankFlow?.disconnectSettlements?.[playerId];if(frozen)return clone(frozen);
    const state=this.engineState(),participant=this.room.participants.find(item=>item.playerId===playerId),opponent=this.room.participants.find(item=>item.playerId!==playerId);
    if(!state||!participant||!opponent)return {settlementType:'nagari',fairPoints:0,quitterScore:0,opponentScore:0,reasons:[],formulaSteps:[]};
    return estimateFairDisconnectSettlement(state,{quitterSeatId:participant.seatId,opponentSeatId:opponent.seatId,gameId:this.currentGameId()});
  }
  calculatePenalty(playerId){return this.calculateDisconnectSettlement(playerId).fairPoints;}
  isBeforeFirstTurn(playerId){
    const state=this.engineState(),participant=this.room?.participants.find(item=>item.playerId===playerId);if(!state||!participant)return false;
    const playerState=state[sideForSeat(participant.seatId)],activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
    return (Number(playerState?.turnsTaken)||0)===0&&activeSeat!==participant.seatId;
  }
  async endPreFirstTurnDisconnect(playerId){
    if(!this.room||this.room.sessionFlow.ended||this.room.terminalResult)return null;
    this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};this.room.rankFlow.abandonment=null;
    await this.endRankedSession('pre-first-turn-disconnect');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=playerId;this.room.status='ended';await this.persist();this.broadcastSnapshots();return {normalQuit:true,reason:'pre-first-turn-disconnect'};
  }
  async abandon(playerId,reason='abandonment'){
    if(!this.room||this.room.sessionFlow.ended||this.room.terminalResult)return null;
    const quitter=this.room.participants.find(item=>item.playerId===playerId);if(!quitter||quitter.bot||!quitter.accountId)return null;
    const opponent=this.room.participants.find(item=>item.playerId!==playerId),settlement=this.calculateDisconnectSettlement(playerId),gameId=this.currentGameId();if(this.room.settledGameIds.includes(gameId))return null;this.room.settledGameIds.push(gameId);
    const milestones=this.milestonesForCurrentGame(),response=await this.accountRequest('/internal/force-quit',{gameId,sessionId:this.room.sessionId,mode:this.isSolo()?'solo':'online',accountId:quitter.accountId,opponentAccountId:opponent?.accountId||null,penaltyCoins:settlement.fairPoints,opponentRewardCoins:settlement.fairPoints,fairPoints:settlement.fairPoints,settlementType:settlement.settlementType,quitterScore:settlement.quitterScore,opponentScore:settlement.opponentScore,settlementReasons:settlement.reasons||[],formulaSteps:settlement.formulaSteps||[],reason,quitterMilestones:milestones[quitter.playerId]||{},opponentMilestones:opponent?milestones[opponent.playerId]||{}:{},recordedAt:this.now()});
    const penaltyCoins=Math.max(0,Math.trunc(Number(response?.penaltyCoins)||0)),rewardCoins=Math.max(0,Math.trunc(Number(response?.opponentRewardCoins)||0));
    if(response?.account&&Number.isFinite(response.account.walletCoins))quitter.walletCoins=response.account.walletCoins;if(response?.opponent&&opponent&&Number.isFinite(response.opponent.walletCoins))opponent.walletCoins=response.opponent.walletCoins;if(opponent?.bot)opponent.walletCoins=(Number(opponent.walletCoins)||0)+rewardCoins;
    this.room.sessionStats.forceQuits=(this.room.sessionStats.forceQuits||0)+1;this.room.rankFlow.abandonment={playerId,penaltyCoins,rewardCoins,fairPoints:settlement.fairPoints,settlementType:settlement.settlementType,quitterScore:settlement.quitterScore,opponentScore:settlement.opponentScore,firstOfMonth:!!response?.firstOfMonth,rewardNoticeId:response?.opponentNotice?.id||null,reason,at:this.now()};
    this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};await this.endRankedSession(reason);this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=playerId;this.room.status='ended';await this.persist();this.broadcastSnapshots();return response;
  }
  pauseSettlementForWinner(winnerParticipant,pausedParticipant){
    const state=this.engineState();if(!state||!winnerParticipant||!pausedParticipant)return {total:7,reasons:[],formulaSteps:['Base 7'],baseTotal:7};
    const winner=state[sideForSeat(winnerParticipant.seatId)],loser=state[sideForSeat(pausedParticipant.seatId)],winnerHasGo=(Number(winner?.go)||0)>0;
    return globalThis.GoStopEngine.calculateSettlement({winner,loser,nagariCarryPower:state.matchContext?.nagariCarryPower||0,baseOverride:winnerHasGo?null:7,forceGoBak:(Number(loser?.go)||0)>0});
  }
  async settlePauseOutcome({type,winnerParticipant=null,endedBy=null,reason,settlement=null}){
    const gameId=this.currentGameId(),winnerId=winnerParticipant?.playerId||null,points=winnerId?Math.max(0,Math.trunc(Number(settlement?.total)||0)):0,milestones=this.milestonesForCurrentGame(),state=this.engineState(),scores={};
    for(const item of this.room.participants){const raw=state?globalThis.GoStopEngine.scorePlayer(state[sideForSeat(item.seatId)]).total:0;scores[item.playerId]={rawScore:raw,points:item.playerId===winnerId?points:0};}
    if(!this.room.settledGameIds.includes(gameId)){
      this.room.settledGameIds.push(gameId);
      const participants=this.room.participants.map(item=>({accountId:item.accountId,playerId:item.playerId,nickname:item.nickname,won:!!winnerId&&item.playerId===winnerId,walletDelta:!winnerId?0:(item.playerId===winnerId?points:-points),coinsWon:item.playerId===winnerId?points:0,points:item.playerId===winnerId?points:0,rawScore:scores[item.playerId]?.rawScore||0,milestones:milestones[item.playerId]||{}})),formulaSteps=[...(settlement?.formulaSteps||[])],settlementReasons=[...(settlement?.reasons||[])];
      if(points&&formulaSteps.at(-1)!==`Final ${points}`)formulaSteps.push(`Final ${points}`);
      const response=await this.accountRequest('/internal/game/settle',{gameId,sessionId:this.room.sessionId,mode:'online',winnerPlayerId:winnerId,finalPoints:points,scores,settlementType:type==='draw'?'pause-draw':'pause-expired-win',settlementReasons,formulaSteps,participants,history:this.adminGameHistory?.()||null,recordedAt:this.now()});
      for(const settled of response?.game?.participants||[]){const participant=this.room.participants.find(item=>item.accountId===settled.accountId);if(participant&&Number.isFinite(settled.walletAfter))participant.walletCoins=settled.walletAfter;}
      this.room.sessionStats.gamesPlayed=(this.room.sessionStats.gamesPlayed||0)+1;
      for(const item of participants){const accountId=item.accountId;if(!accountId)continue;if(item.walletDelta>0)this.room.sessionStats.coinsWonByAccount[accountId]=(this.room.sessionStats.coinsWonByAccount[accountId]||0)+item.walletDelta;if(item.walletDelta<0)this.room.sessionStats.coinsLostByAccount[accountId]=(this.room.sessionStats.coinsLostByAccount[accountId]||0)+Math.abs(item.walletDelta);const target=this.room.sessionStats.milestonesByAccount[accountId]||(this.room.sessionStats.milestonesByAccount[accountId]={});for(const [name,count] of Object.entries(item.milestones||{}))target[name]=(target[name]||0)+(Number(count)||0);}
    }
    this.room.rankFlow.pauseResolution={type,winnerPlayerId:winnerId,points,reason,at:this.now()};this.room.rankFlow.pause=null;this.room.rankFlow.inactivity=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};await this.endRankedSession(reason);this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=endedBy||winnerId;this.room.status='ended';return {type,winnerPlayerId:winnerId,points};
  }
  async startAbandonmentWarningForCurrentTurn(){
    if(!this.room||this.isSolo()||!this.isRanked()||this.room.sessionFlow.ended||this.room.terminalResult){this.room.rankFlow.inactivity=null;return;}
    const state=this.engineState();if(!state){this.room.rankFlow.inactivity=null;return;}
    const seat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn,participant=this.room.participants.find(item=>item.seatId===seat);if(!participant||participant.bot||!participant.connected){this.room.rankFlow.inactivity=null;return;}
    const now=this.nowMs();this.room.rankFlow.inactivity={playerId:participant.playerId,phase:'warning',nudgeAt:now,warningAt:now,abandonAt:now+this.abandonmentCountdownMs,penaltyCoins:this.calculatePenalty(participant.playerId)};this.broadcastSnapshots();
  }
  async refreshInactivity(){
    if(!this.room||this.isSolo()||!this.isRanked()||this.room.sessionFlow.ended||this.room.terminalResult||this.room.rankFlow.pause){this.room.rankFlow.inactivity=null;return;}
    const state=this.engineState();if(!state){this.room.rankFlow.inactivity=null;return;}
    const seat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn,participant=this.room.participants.find(item=>item.seatId===seat);if(!participant||participant.bot||!participant.connected){this.room.rankFlow.inactivity=null;return;}
    const now=this.nowMs(),nudgeAt=now+this.inactivityNudgeMs,warningAt=nudgeAt+this.nudgePhaseMs;this.room.rankFlow.inactivity={playerId:participant.playerId,phase:'waiting',nudgeAt,warningAt,abandonAt:warningAt+this.abandonmentCountdownMs,penaltyCoins:null};
  }
  async scheduleAlarm(){
    if(!this.storage?.setAlarm||!this.room)return;const flow=this.room.rankFlow||freshRankFlow(),times=[];if(flow.pause?.until&&flow.pause.phase!=='expired')times.push(flow.pause.until);for(const value of Object.values(flow.disconnectDeadlines||{}))if(value)times.push(value);for(const value of Object.values(flow.runtimeOrphanDeadlines||{}))if(value)times.push(value);if(flow.inactivity){if(flow.inactivity.phase==='waiting')times.push(flow.inactivity.nudgeAt);else if(flow.inactivity.phase==='nudge')times.push(flow.inactivity.warningAt);else if(flow.inactivity.phase==='warning')times.push(flow.inactivity.abandonAt);}if(times.length)await this.storage.setAlarm(Math.min(...times));else if(this.storage.deleteAlarm)await this.storage.deleteAlarm();
  }
  async resolveExpiredDisconnects(now=this.nowMs()){
    const flow=this.room?.rankFlow;if(!flow||this.room.sessionFlow?.ended)return false;
    for(const [playerId,deadline] of Object.entries({...flow.disconnectDeadlines})){
      if(now<deadline)continue;const participant=this.room.participants.find(item=>item.playerId===playerId);delete flow.disconnectDeadlines[playerId];
      if(participant&&!this.sockets.has(playerId)&&!this.room.terminalResult){if(this.isBeforeFirstTurn(playerId))await this.endPreFirstTurnDisconnect(playerId);else await this.abandon(playerId,'disconnect-timeout');return true;}
    }
    return false;
  }
  async alarm(){
    await this.load();if(!this.room||this.room.sessionFlow.ended)return;const now=this.nowMs(),flow=this.room.rankFlow;
    if(flow.pause&&flow.pause.phase!=='expired'&&now>=flow.pause.until){flow.pause.phase='expired';flow.pause.expiredAt=now;flow.inactivity=null;this.broadcastSnapshots();}
    if(await this.resolveExpiredDisconnects(now))return;
    for(const [playerId,deadline] of Object.entries({...flow.runtimeOrphanDeadlines})){if(now>=deadline){delete flow.runtimeOrphanDeadlines[playerId];if(!this.sockets.has(playerId)){await this.endRuntimeOrphan(playerId);return;}}}
    const inactivity=flow.inactivity;if(inactivity){if(now>=inactivity.abandonAt){await this.abandon(inactivity.playerId,'inactivity-timeout');return;}if(inactivity.phase!=='warning'&&now>=inactivity.warningAt){inactivity.phase='warning';inactivity.penaltyCoins=this.calculatePenalty(inactivity.playerId);this.broadcastSnapshots();}else if(inactivity.phase==='waiting'&&now>=inactivity.nudgeAt){inactivity.phase='nudge';this.broadcastSnapshots();}}
    await this.persist();await this.scheduleAlarm();
  }
  async acceptFlowAction(socket,message,mutate){
    const participant=this.room.participants.find(item=>item.playerId===socket.__playerId);if(!participant)throw new RoomError('NOT_AUTHENTICATED','Socket is not authenticated.',401);await mutate(participant);const revision=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;await this.persist();this.broadcastSnapshots();this.send(socket,envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false}));await this.scheduleAlarm();
  }
  async handleRankedFlow(socket,message){
    const flow=this.room.rankFlow,participant=this.room.participants.find(item=>item.playerId===socket.__playerId);if(!participant)return false;
    if(message.action.type==='requestPause'){
      if(this.isSolo())throw new RoomError('PAUSE_NOT_AVAILABLE','Pause requests are for Online Play.',409);if(this.room.terminalResult)throw new RoomError('HAND_COMPLETE','The current game is already complete.',409);if(flow.pause)throw new RoomError('PAUSE_ACTIVE','A pause is already active.',409);if((flow.pauseRemaining[participant.playerId]??2)<=0)throw new RoomError('NO_PAUSES_LEFT','No pauses remain for this game.',409);
      await this.acceptFlowAction(socket,message,async()=>{flow.pauseRemaining[participant.playerId]=(flow.pauseRemaining[participant.playerId]??2)-1;flow.pause={playerId:participant.playerId,until:this.nowMs()+this.pauseDurationMs,phase:'active'};flow.pauseResolution=null;flow.inactivity=null;});return true;
    }
    if(message.action.type==='cancelPause'){
      if(!flow.pause||flow.pause.playerId!==participant.playerId)throw new RoomError('PAUSE_NOT_OWNED','Only the player who requested this pause can cancel it.',409);
      await this.acceptFlowAction(socket,message,async()=>{flow.pause=null;await this.refreshInactivity();});return true;
    }
    if(message.action.type==='quitPausedGame'){
      if(!flow.pause||flow.pause.phase==='expired'||flow.pause.playerId===participant.playerId)throw new RoomError('PAUSE_QUIT_NOT_AVAILABLE','Only the opponent may quit during an active pause.',409);
      await this.acceptFlowAction(socket,message,async()=>{await this.settlePauseOutcome({type:'draw',endedBy:participant.playerId,reason:'pause-opponent-quit-draw'});});return true;
    }
    if(message.action.type==='claimExpiredPauseWin'){
      if(!flow.pause||flow.pause.phase!=='expired'||flow.pause.playerId===participant.playerId)throw new RoomError('PAUSE_WIN_NOT_AVAILABLE','Only the opponent may claim the win after the pause expires.',409);
      const paused=this.room.participants.find(item=>item.playerId===flow.pause.playerId),settlement=this.pauseSettlementForWinner(participant,paused);
      await this.acceptFlowAction(socket,message,async()=>{await this.settlePauseOutcome({type:'win',winnerParticipant:participant,endedBy:participant.playerId,reason:'pause-expired-opponent-win',settlement});});return true;
    }
    if(message.action.type==='quitGame'){
      await this.acceptFlowAction(socket,message,async()=>{if(this.room.terminalResult){await this.endRankedSession('quit-after-game');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=participant.playerId;this.room.status='ended';return;}if(this.isSolo()){flow.scheduledQuitBy=participant.playerId;return;}if(!flow.quitRequest)flow.quitRequest={requestId:`quit-${++flow.quitGeneration}`,requesterPlayerId:participant.playerId,createdAt:this.now()};});return true;
    }
    if(message.action.type==='cancelDisconnectedGame'){
      if(this.isSolo())throw new RoomError('DISCONNECT_CANCEL_NOT_AVAILABLE','There is no online opponent to wait for.',409);const opponent=this.room.participants.find(item=>item.playerId!==participant.playerId),deadline=opponent&&flow.disconnectDeadlines?.[opponent.playerId];if(!opponent||opponent.connected||!deadline)throw new RoomError('NO_DISCONNECTED_OPPONENT','The opponent is no longer disconnected.',409);
      await this.acceptFlowAction(socket,message,async()=>{flow.disconnectDeadlines={};flow.disconnectSettlements={};flow.disconnectCancelled=true;flow.inactivity=null;flow.pause=null;flow.quitRequest=null;await this.endRankedSession('disconnect-cancelled');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=null;this.room.status='ended';});return true;
    }
    if(message.action.type==='respondQuit'){
      const request=flow.quitRequest;if(!request||request.requestId!==message.action.requestId||request.requesterPlayerId===participant.playerId)throw new RoomError('QUIT_REQUEST_NOT_FOUND','Quit request is no longer active.',409);
      await this.acceptFlowAction(socket,message,async()=>{flow.quitRequest=null;if(message.action.accept){await this.endRankedSession('mutual-quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=request.requesterPlayerId;this.room.status='ended';flow.inactivity=null;}else{flow.scheduledQuitBy=request.requesterPlayerId;await this.refreshInactivity();}});return true;
    }
    return false;
  }
  async handle(socket,input){
    await this.load();let message;try{message=parseClientMessage(input);}catch(_){return super.handle(socket,input);}const expiredResolved=await this.resolveExpiredDisconnects();if(expiredResolved&&message.type==='action'){const participant=this.room.participants.find(item=>item.playerId===socket.__playerId),revision=participant&&this.room.matchId?this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision:0,response=envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false});this.send(socket,response);return response;}if(message.type==='action'&&['requestPause','cancelPause','quitPausedGame','claimExpiredPauseWin','quitGame','respondQuit','cancelDisconnectedGame'].includes(message.action.type)){
      try{await this.handleRankedFlow(socket,message);}catch(error){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:error.code||'ILLEGAL_ACTION',message:error.message}});this.send(socket,response);return response;}return envelope('actionAccepted',{actionId:message.actionId});
    }
    if(message.type==='action'&&this.room.rankFlow?.pause){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:'PAUSED',message:'The game is paused.'}});this.send(socket,response);return response;}
    if(message.type==='action'&&Object.keys(this.room.rankFlow?.disconnectDeadlines||{}).length){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:'OPPONENT_RECONNECTING',message:'The game is paused while a disconnected player has time to return.'}});this.send(socket,response);return response;}
    const response=await super.handle(socket,input);
    if(message.type==='action'&&response?.type==='actionAccepted'){
      if(this.room.rankFlow)this.room.rankFlow.inactivity=null;
      if(this.isSolo()&&!this.room.sessionFlow.ended)await this.advanceBot();
      else if(!this.room.sessionFlow.ended)await this.refreshInactivity();
      await this.persist();await this.scheduleAlarm();
    }
    return response;
  }
  bestTarget(state,ids){return ids.map(id=>state.floor.find(card=>card.id===id)).filter(Boolean).sort((a,b)=>captureValue(b)-captureValue(a))[0]||null;}
  bestBotCard(state,bot){
    const player=state[sideForSeat(bot.seatId)];let best=player.hand[0],bestValue=-Infinity;for(const card of player.hand){const matches=state.floor.filter(item=>item.month===card.month),target=matches.slice().sort((a,b)=>captureValue(b)-captureValue(a))[0],value=(target?captureValue(target)+captureValue(card):0)+(card.type==='bright'?3:0)+(card.flags?.includes('godori')?2:0)+(card.ribbonSet?1:0);if(value>bestValue){bestValue=value;best=card;}}return best;
  }
  botShouldGo(state,bot){const side=sideForSeat(bot.seatId),opponentSide=side==='human'?'ai':'human',score=globalThis.GoStopEngine.scorePlayer(state[side]).total,opponentScore=globalThis.GoStopEngine.scorePlayer(state[opponentSide]).total,remaining=state[side].hand.length+state[side].bombFreeTurns;if(remaining<=2||score>=12)return false;if(score<=8&&remaining>=3)return true;return score<=opponentScore+2&&remaining>=3;}
  async submitBot(bot,action){
    const before=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:bot.playerId}).revision,result=this.authority.submitAction({matchId:this.room.matchId,playerId:bot.playerId,actionId:`bot-${++this.room.botActionSequence}-${this.nowMs()}`,expectedRevision:before,action});if(result.snapshot.terminalResult){this.room.status='completed';this.room.terminalResult=clone(result.snapshot.terminalResult);await this.settleTerminal(result.snapshot);}this.room.updatedAt=this.now();await this.persist();for(const viewer of this.room.participants){const events=this.authority.getEventsSince({matchId:this.room.matchId,viewerId:viewer.playerId,revision:before}).events;this.sendTo(viewer.playerId,envelope('snapshot',{snapshot:this.snapshotFor(viewer),events}));}return result;
  }
  async advanceBot(){
    await this.load();const bot=this.room.participants.find(item=>item.bot);if(!bot||!this.room.matchId||this.room.sessionFlow.ended||this.room.rankFlow.pause||Object.keys(this.room.rankFlow.disconnectDeadlines||{}).length)return;this.room.botActionSequence=this.room.botActionSequence||0;
    for(let guard=0;guard<100;guard++){
      if(this.room.sessionFlow.ended||this.room.rankFlow.pause||Object.keys(this.room.rankFlow.disconnectDeadlines||{}).length)return;const state=this.engineState();if(!state||state.terminalResult)return;const side=sideForSeat(bot.seatId),player=state[side],decision=state.pendingDecision;
      if(player.captured.some(card=>card.id==='m9-1')){const mode=globalThis.GoStopEngine.score(player.captured,'pi').total>globalThis.GoStopEngine.score(player.captured,'animal').total?'pi':'animal';if(player.gukjinMode!==mode){await this.submitBot(bot,{type:'setGukjinMode',mode});continue;}}
      if(decision){if(decision.playerId!==bot.seatId)return;if(decision.type==='openingTripleDecision'){const shake=!decision.floorCardId&&randomUnit(this.crypto)<.72;await this.submitBot(bot,{type:shake?'declareShake':decision.floorCardId?'declareBomb':'armOpeningBomb'});continue;}if(decision.type==='shakeDecision'){await this.submitBot(bot,{type:'declareShake'});continue;}if(decision.type==='bombDecision'){this.room.rankFlow.botPendingCardId=null;await this.submitBot(bot,{type:'declareBomb'});continue;}if(decision.type==='goStopDecision'){await this.submitBot(bot,{type:this.botShouldGo(state,bot)?'declareGo':'declareStop'});continue;}return;}
      if(!state.openingSpecialsComplete){if(state.turn!==bot.seatId)return;await this.submitBot(bot,{type:'resolveOpening'});continue;}
      if(state.turn!==bot.seatId)return;
      const pending=state.pendingTurn;
      if(pending){if(pending.phase==='awaitingDraw'){await this.submitBot(bot,{type:'drawNextCard'});continue;}if(pending.phase==='awaitingFloorTarget'){const drawnNeeds=pending.drawn&&!pending.drawn.resolved&&pending.drawn.matchIds.length>1&&!pending.drawn.targetId,source=drawnNeeds?'drawn':'played',entry=source==='drawn'?pending.drawn:pending.played,target=this.bestTarget(state,entry.matchIds);if(!target)return;await this.submitBot(bot,{type:'chooseFloorTarget',source,targetId:target.id});continue;}if(pending.phase==='awaitingNormalResolution'){const classified=globalThis.GoStopEngine.classifyTurnOutcome(state,{actorId:bot.seatId});await this.submitBot(bot,classified.kind==='normal'?{type:'resolveNormalCard',source:pending.nextResolution}:{type:'resolveSpecialTurn'});continue;}if(pending.phase==='awaitingTurnCompletion'){await this.submitBot(bot,{type:'completeTurn'});continue;}return;}
      if(player.bombFreeTurns>0){await this.submitBot(bot,{type:'useBombBlank'});continue;}
      let cardId=this.room.rankFlow.botPendingCardId;if(cardId&&!player.hand.some(card=>card.id===cardId))cardId=null;if(!cardId){const card=this.bestBotCard(state,bot);if(!card)return;cardId=card.id;this.room.rankFlow.botPendingCardId=cardId;await this.submitBot(bot,{type:'attemptPlayCard',cardId});continue;}
      const card=player.hand.find(item=>item.id===cardId);if(!card){this.room.rankFlow.botPendingCardId=null;continue;}const matches=state.floor.filter(item=>item.month===card.month),target=matches.length>1?matches.slice().sort((a,b)=>captureValue(b)-captureValue(a))[0]:matches[0]||null;this.room.rankFlow.botPendingCardId=null;await this.submitBot(bot,{type:'playCard',cardId,targetId:target?.id||null});
    }
    throw new RoomError('BOT_LOOP_LIMIT','Computer turn exceeded the safety limit.',500);
  }
}

export {DEFAULT_INACTIVITY_NUDGE_MS,DEFAULT_NUDGE_PHASE_MS,DEFAULT_ABANDONMENT_COUNTDOWN_MS,DEFAULT_PAUSE_DURATION_MS,RECONNECT_GRACE_MS,RUNTIME_ORPHAN_GRACE_MS};
