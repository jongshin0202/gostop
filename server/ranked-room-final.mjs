import {RankedRoomCore} from './ranked-room-core.mjs';
import {RoomError} from './room-core.mjs';
import {envelope,parseClientMessage} from './protocol.mjs';

const randomHex=(cryptoApi,words=2)=>{const data=new Uint32Array(words);cryptoApi.getRandomValues(data);return Array.from(data,v=>v.toString(16).padStart(8,'0')).join('');};
const randomMatchId=cryptoApi=>`match_${randomHex(cryptoApi,4)}`;
const sideForSeat=seat=>seat==='playerA'?'human':'ai';

export class FinalRankedRoomCore extends RankedRoomCore{
  resetPauseBudgetForCurrentGame(){
    const flow=this.room.rankFlow;if(!flow)return;
    const sequence=this.room.gameSequence||0;if(flow.pauseGameSequence===sequence)return;
    flow.pauseGameSequence=sequence;flow.pause=null;flow.pauseRemaining={};
    for(const participant of this.room.participants)flow.pauseRemaining[participant.playerId]=participant.bot?0:2;
  }
  async load(){const room=await super.load();if(room)this.resetPauseBudgetForCurrentGame();return room;}
  flowFor(participant){const flow=super.flowFor(participant),rank=this.room.rankFlow||{},opponent=this.room.participants.find(item=>item.playerId!==participant.playerId);return {...flow,pausesRemaining:{you:rank.pauseRemaining?.[participant.playerId]??(participant.bot?0:2),opponent:rank.pauseRemaining?.[opponent?.playerId]??(opponent?.bot?0:2)},opponentReconnectUntil:rank.disconnectDeadlines?.[opponent?.playerId]||null,disconnectCancelled:!!rank.disconnectCancelled};}
  milestonesForCurrentGame(){
    const result=super.milestonesForCurrentGame(),state=this.engineState();if(!state)return result;
    for(const participant of this.room.participants){const player=state[sideForSeat(participant.seatId)],bucket=result[participant.playerId]||(result[participant.playerId]={}),captured=player?.captured||[];
      const godori=[2,4,8].every(month=>captured.some(card=>card.month===month&&card.flags?.includes('godori')));if(godori)bucket['5_BIRDIES']=(bucket['5_BIRDIES']||0)+1;
      let stripeSets=0;for(const [set,months] of Object.entries({red:[1,2,3],blue:[6,9,10],grass:[4,5,7]}))if(months.every(month=>captured.some(card=>card.month===month&&card.ribbonSet===set)))stripeSets++;if(stripeSets)bucket['3_STRIPES']=(bucket['3_STRIPES']||0)+stripeSets;
      if(captured.filter(card=>card.type==='bright').length>=5)bucket['5_BRIGHTS']=(bucket['5_BRIGHTS']||0)+1;
    }
    return result;
  }
  rankedScores(finalPoints,winnerId){
    const state=this.engineState(),scores={};for(const participant of this.room.participants){const raw=state?globalThis.GoStopEngine.scorePlayer(state[sideForSeat(participant.seatId)]).total:0;scores[participant.playerId]={rawScore:raw,points:participant.playerId===winnerId?finalPoints:raw};}return scores;
  }
  addSessionMilestones(accountId,milestones={}){if(!accountId)return;const target=this.room.sessionStats.milestonesByAccount[accountId]||(this.room.sessionStats.milestonesByAccount[accountId]={});for(const [name,count] of Object.entries(milestones))target[name]=(target[name]||0)+count;}
  async settleTerminal(snapshot){
    if(!snapshot?.terminalResult)return null;
    const gameId=this.currentGameId();if(this.room.settledGameIds.includes(gameId))return null;
    const terminal=snapshot.terminalResult,winnerId=terminal.winnerId||null,finalPoints=Math.max(0,Math.trunc(Number(terminal.result?.score??terminal.result?.finalPoints??terminal.finalPoints??0))),milestones=this.milestonesForCurrentGame(),scores=this.rankedScores(finalPoints,winnerId);this.room.settledGameIds.push(gameId);
    if(!this.isRanked())return null;
    if(this.isSolo()){
      const user=this.room.participants.find(item=>!item.bot),bot=this.room.participants.find(item=>item.bot);let walletDelta=0,coinsWon=0,won=false,bankruptcies=0;
      if(winnerId===user.playerId){walletDelta=finalPoints;coinsWon=finalPoints;won=true;bot.walletCoins-=finalPoints;}else if(winnerId===bot.playerId){walletDelta=-finalPoints;bot.walletCoins+=finalPoints;}
      const completedComputer={level:bot.computerLevel,walletAfter:bot.walletCoins,points:scores[bot.playerId]?.points||0,rawScore:scores[bot.playerId]?.rawScore||0};
      if(bot.walletCoins<=0&&winnerId===user.playerId){bankruptcies=1;this.room.solo.computerBankruptcies=(this.room.solo.computerBankruptcies||0)+1;this.room.solo.computerLevel=(this.room.solo.computerLevel||1)+1;this.room.solo.computerBankroll=this.room.solo.computerLevel*100;bot.computerLevel=this.room.solo.computerLevel;bot.nickname=`Computer #${bot.computerLevel}`;bot.walletCoins=this.room.solo.computerBankroll;}
      const participant={accountId:user.accountId,playerId:user.playerId,nickname:user.nickname,won,walletDelta,coinsWon,points:scores[user.playerId]?.points||0,rawScore:scores[user.playerId]?.rawScore||0,milestones:milestones[user.playerId]||{},computerBankruptcies:bankruptcies};
      const response=await this.accountRequest('/internal/game/settle',{gameId,sessionId:this.room.sessionId,mode:'solo',winnerPlayerId:winnerId,finalPoints,scores,computer:completedComputer,participants:[participant],recordedAt:this.now()});
      const settled=response?.game?.participants?.[0];if(settled&&Number.isFinite(settled.walletAfter))user.walletCoins=settled.walletAfter;
      this.room.sessionStats.gamesPlayed++;if(walletDelta>0)this.room.sessionStats.coinsWonByAccount[user.accountId]=(this.room.sessionStats.coinsWonByAccount[user.accountId]||0)+walletDelta;if(walletDelta<0)this.room.sessionStats.coinsLostByAccount[user.accountId]=(this.room.sessionStats.coinsLostByAccount[user.accountId]||0)+Math.abs(walletDelta);this.room.sessionStats.computerBankruptcies=(this.room.sessionStats.computerBankruptcies||0)+bankruptcies;this.addSessionMilestones(user.accountId,participant.milestones);return response;
    }
    const participants=this.room.participants.map(item=>({accountId:item.accountId,playerId:item.playerId,nickname:item.nickname,won:!!winnerId&&item.playerId===winnerId,walletDelta:!winnerId?0:(item.playerId===winnerId?finalPoints:-finalPoints),coinsWon:item.playerId===winnerId?finalPoints:0,points:scores[item.playerId]?.points||0,rawScore:scores[item.playerId]?.rawScore||0,milestones:milestones[item.playerId]||{}}));
    const response=await this.accountRequest('/internal/game/settle',{gameId,sessionId:this.room.sessionId,mode:'online',winnerPlayerId:winnerId,finalPoints,scores,participants,recordedAt:this.now()});
    for(const settled of response?.game?.participants||[]){const participant=this.room.participants.find(item=>item.accountId===settled.accountId);if(participant&&Number.isFinite(settled.walletAfter))participant.walletCoins=settled.walletAfter;}
    this.room.sessionStats.gamesPlayed++;for(const item of participants){const accountId=item.accountId;if(!accountId)continue;if(item.walletDelta>0)this.room.sessionStats.coinsWonByAccount[accountId]=(this.room.sessionStats.coinsWonByAccount[accountId]||0)+item.walletDelta;if(item.walletDelta<0)this.room.sessionStats.coinsLostByAccount[accountId]=(this.room.sessionStats.coinsLostByAccount[accountId]||0)+Math.abs(item.walletDelta);this.addSessionMilestones(accountId,item.milestones);}
    if(this.room.rankFlow?.scheduledQuitBy&&!this.room.sessionFlow.ended){await this.endRankedSession('scheduled-quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=this.room.rankFlow.scheduledQuitBy;this.room.status='ended';}return response;
  }
  async abandon(playerId,reason='abandonment'){
    if(!this.room||this.room.sessionFlow.ended||this.room.terminalResult)return null;
    const quitter=this.room.participants.find(item=>item.playerId===playerId);if(!quitter||quitter.bot||!quitter.accountId)return null;
    const opponent=this.room.participants.find(item=>item.playerId!==playerId),settlement=this.calculateDisconnectSettlement(playerId),gameId=this.currentGameId();if(this.room.settledGameIds.includes(gameId))return null;this.room.settledGameIds.push(gameId);
    const milestones=this.milestonesForCurrentGame(),scores=this.rankedScores(0,null),response=await this.accountRequest('/internal/force-quit',{gameId,sessionId:this.room.sessionId,mode:this.isSolo()?'solo':'online',accountId:quitter.accountId,opponentAccountId:opponent?.accountId||null,penaltyCoins:settlement.fairPoints,opponentRewardCoins:settlement.fairPoints,fairPoints:settlement.fairPoints,settlementType:settlement.settlementType,quitterScore:settlement.quitterScore,opponentScore:settlement.opponentScore,settlementReasons:settlement.reasons||[],formulaSteps:settlement.formulaSteps||[],reason,scores,quitterMilestones:milestones[quitter.playerId]||{},opponentMilestones:opponent?milestones[opponent.playerId]||{}:{},recordedAt:this.now()});
    const penaltyCoins=Math.max(0,Math.trunc(Number(response?.penaltyCoins)||0)),rewardCoins=Math.max(0,Math.trunc(Number(response?.opponentRewardCoins)||0));
    if(response?.account&&Number.isFinite(response.account.walletCoins))quitter.walletCoins=response.account.walletCoins;if(response?.opponent&&opponent&&Number.isFinite(response.opponent.walletCoins))opponent.walletCoins=response.opponent.walletCoins;if(opponent?.bot)opponent.walletCoins=(Number(opponent.walletCoins)||0)+rewardCoins;
    this.room.sessionStats.gamesPlayed=(this.room.sessionStats.gamesPlayed||0)+1;this.room.sessionStats.forceQuits=(this.room.sessionStats.forceQuits||0)+1;if(penaltyCoins>0)this.room.sessionStats.coinsLostByAccount[quitter.accountId]=(this.room.sessionStats.coinsLostByAccount[quitter.accountId]||0)+penaltyCoins;this.addSessionMilestones(quitter.accountId,milestones[quitter.playerId]||{});
    if(opponent?.accountId){if(rewardCoins>0)this.room.sessionStats.coinsWonByAccount[opponent.accountId]=(this.room.sessionStats.coinsWonByAccount[opponent.accountId]||0)+rewardCoins;this.addSessionMilestones(opponent.accountId,milestones[opponent.playerId]||{});}
    this.room.rankFlow.abandonment={playerId,penaltyCoins,rewardCoins,fairPoints:settlement.fairPoints,settlementType:settlement.settlementType,quitterScore:settlement.quitterScore,opponentScore:settlement.opponentScore,firstOfMonth:!!response?.firstOfMonth,rewardNoticeId:response?.opponentNotice?.id||null,reason,at:this.now()};this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};await this.endRankedSession(reason);this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=playerId;this.room.status='ended';await this.persist();this.broadcastSnapshots();return response;
  }
  async startRankedSession(){
    if(!this.isRanked())return null;if(!this.isSolo())return super.startRankedSession();
    const user=this.room.participants.find(item=>!item.bot&&item.accountId);this.room.soloSessionSequence=(this.room.soloSessionSequence||0)+1;this.room.sessionId=`solo-${this.room.roomCode}-${this.room.soloSessionSequence}-${randomHex(this.crypto)}`;this.room.sessionStats={gamesPlayed:0,coinsWonByAccount:{},coinsLostByAccount:{},milestonesByAccount:{},computerBankruptcies:0,forceQuits:0};
    await this.accountRequest('/internal/session/start',{sessionId:this.room.sessionId,mode:'solo',accountIds:[user.accountId],opponent:{type:'computer',level:this.room.solo?.computerLevel||1},startedAt:this.now()});return this.room.sessionId;
  }
  async refreshInactivity(){this.resetPauseBudgetForCurrentGame();return super.refreshInactivity();}
  async startFreshSoloSession(participant,reason='new-game'){
    await this.endRankedSession(reason);
    const matchId=randomMatchId(this.crypto);this.authority.createMatch({matchId,playerIds:this.room.participants.map(item=>item.playerId),gameMode:'online-2player'});this.room.matchId=matchId;this.room.gameSequence=(this.room.gameSequence||0)+1;this.room.currentGameStartRevision=0;this.room.status='ready';this.room.terminalResult=null;this.room.sessionFlow.replayReady={playerA:false,playerB:false};this.room.sessionFlow.newGameRequest=null;this.room.sessionFlow.ended=false;this.room.sessionFlow.endedBy=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.scheduledQuitBy=null;this.room.rankFlow.abandonment=null;this.room.rankFlow.inactivity=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};this.room.rankFlow.botPendingCardId=null;this.room.rankFlow.pauseGameSequence=null;this.resetPauseBudgetForCurrentGame();await this.startRankedSession();this.room.updatedAt=this.now();await this.persist();this.broadcastSnapshots();await this.advanceBot();
    return this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;
  }
  async endSoloImmediately(socket,message,participant){
    await this.endRankedSession('quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=participant.playerId;this.room.status='ended';this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};this.room.rankFlow.disconnectSettlements={};const revision=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;await this.persist();this.broadcastSnapshots();this.send(socket,envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false}));await this.scheduleAlarm();return envelope('actionAccepted',{actionId:message.actionId,revision});
  }
  async handle(socket,input){
    await this.load();let message;try{message=parseClientMessage(input);}catch(_){return super.handle(socket,input);}
    const participant=this.room?.participants.find(item=>item.playerId===socket.__playerId);
    if(message.type==='action'&&this.isSolo()&&participant){
      if(message.action.type==='quitGame')return this.endSoloImmediately(socket,message,participant);
      if(message.action.type==='requestNewGame'){
        try{const revision=await this.startFreshSoloSession(participant,'new-game');this.send(socket,envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false}));return envelope('actionAccepted',{actionId:message.actionId,revision});}
        catch(error){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:error.code||'NEW_GAME_FAILED',message:error.message}});this.send(socket,response);return response;}
      }
    }
    if(message.type==='action'&&message.action.type==='respondQuit'&&typeof message.action.accept!=='boolean'){
      const response=envelope('actionRejected',{actionId:message.actionId,error:{code:'MALFORMED_ACTION',message:'Quit response must be Accept or Decline.'}});this.send(socket,response);return response;
    }
    const beforeSequence=this.room?.gameSequence||0,response=await super.handle(socket,input);
    if(response?.type==='actionAccepted'&&this.room&&!this.room.sessionFlow.ended){this.resetPauseBudgetForCurrentGame();await this.persist();this.broadcastSnapshots();await this.scheduleAlarm();}
    if(this.room&&(this.room.gameSequence||0)!==beforeSequence){this.resetPauseBudgetForCurrentGame();await this.persist();this.broadcastSnapshots();await this.scheduleAlarm();}
    return response;
  }
  async disconnect(socket){const playerId=socket.__playerId;await super.disconnect(socket);if(this.room&&playerId){await this.persist();this.broadcastSnapshots();await this.scheduleAlarm();}}
}
