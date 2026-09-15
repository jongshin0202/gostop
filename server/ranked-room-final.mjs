import {RankedRoomCore} from './ranked-room-core.mjs';
import {RoomError} from './room-core.mjs';
import {envelope,parseClientMessage} from './protocol.mjs';

const randomHex=(cryptoApi,words=2)=>{const data=new Uint32Array(words);cryptoApi.getRandomValues(data);return Array.from(data,v=>v.toString(16).padStart(8,'0')).join('');};
const randomMatchId=cryptoApi=>`match_${randomHex(cryptoApi,4)}`;

export class FinalRankedRoomCore extends RankedRoomCore{
  resetPauseBudgetForCurrentGame(){
    const flow=this.room.rankFlow;if(!flow)return;
    const sequence=this.room.gameSequence||0;if(flow.pauseGameSequence===sequence)return;
    flow.pauseGameSequence=sequence;flow.pause=null;flow.pauseRemaining={};
    for(const participant of this.room.participants)flow.pauseRemaining[participant.playerId]=participant.bot?0:2;
  }
  async load(){const room=await super.load();if(room)this.resetPauseBudgetForCurrentGame();return room;}
  flowFor(participant){const flow=super.flowFor(participant),rank=this.room.rankFlow||{},opponent=this.room.participants.find(item=>item.playerId!==participant.playerId);return {...flow,pausesRemaining:{you:rank.pauseRemaining?.[participant.playerId]??(participant.bot?0:2),opponent:rank.pauseRemaining?.[opponent?.playerId]??(opponent?.bot?0:2)},opponentReconnectUntil:rank.disconnectDeadlines?.[opponent?.playerId]||null};}
  milestonesForCurrentGame(){
    const result=super.milestonesForCurrentGame(),state=this.engineState();if(!state)return result;
    for(const participant of this.room.participants){const player=state[participant.seatId==='playerA'?'human':'ai'],bucket=result[participant.playerId]||(result[participant.playerId]={}),captured=player?.captured||[];
      const godori=[2,4,8].every(month=>captured.some(card=>card.month===month&&card.flags?.includes('godori')));if(godori)bucket['5_BIRDIES']=(bucket['5_BIRDIES']||0)+1;
      let stripeSets=0;for(const [set,months] of Object.entries({red:[1,2,3],blue:[6,9,10],grass:[4,5,7]}))if(months.every(month=>captured.some(card=>card.month===month&&card.ribbonSet===set)))stripeSets++;if(stripeSets)bucket['3_STRIPES']=(bucket['3_STRIPES']||0)+stripeSets;
      if(captured.filter(card=>card.type==='bright').length>=5)bucket['5_BRIGHTS']=(bucket['5_BRIGHTS']||0)+1;
    }
    return result;
  }
  async startRankedSession(){
    if(!this.isRanked())return null;if(!this.isSolo())return super.startRankedSession();
    const user=this.room.participants.find(item=>!item.bot&&item.accountId);this.room.soloSessionSequence=(this.room.soloSessionSequence||0)+1;this.room.sessionId=`solo-${this.room.roomCode}-${this.room.soloSessionSequence}-${randomHex(this.crypto)}`;this.room.sessionStats={gamesPlayed:0,coinsWonByAccount:{},coinsLostByAccount:{},milestonesByAccount:{},computerBankruptcies:0,forceQuits:0};
    await this.accountRequest('/internal/session/start',{sessionId:this.room.sessionId,mode:'solo',accountIds:[user.accountId],opponent:{type:'computer',level:this.room.solo?.computerLevel||1},startedAt:this.now()});return this.room.sessionId;
  }
  async refreshInactivity(){this.resetPauseBudgetForCurrentGame();return super.refreshInactivity();}
  async startFreshSoloSession(participant,reason='new-game'){
    await this.endRankedSession(reason);
    const matchId=randomMatchId(this.crypto);this.authority.createMatch({matchId,playerIds:this.room.participants.map(item=>item.playerId),gameMode:'online-2player'});this.room.matchId=matchId;this.room.gameSequence=(this.room.gameSequence||0)+1;this.room.currentGameStartRevision=0;this.room.status='ready';this.room.terminalResult=null;this.room.sessionFlow.replayReady={playerA:false,playerB:false};this.room.sessionFlow.newGameRequest=null;this.room.sessionFlow.ended=false;this.room.sessionFlow.endedBy=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.scheduledQuitBy=null;this.room.rankFlow.abandonment=null;this.room.rankFlow.inactivity=null;this.room.rankFlow.botPendingCardId=null;this.room.rankFlow.pauseGameSequence=null;this.resetPauseBudgetForCurrentGame();await this.startRankedSession();this.room.updatedAt=this.now();await this.persist();this.broadcastSnapshots();await this.advanceBot();
    return this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;
  }
  async endSoloImmediately(socket,message,participant){
    await this.endRankedSession('quit');this.room.sessionFlow.ended=true;this.room.sessionFlow.endedBy=participant.playerId;this.room.status='ended';this.room.rankFlow.inactivity=null;this.room.rankFlow.pause=null;this.room.rankFlow.quitRequest=null;this.room.rankFlow.disconnectDeadlines={};const revision=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;await this.persist();this.broadcastSnapshots();this.send(socket,envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false}));await this.scheduleAlarm();return envelope('actionAccepted',{actionId:message.actionId,revision});
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
