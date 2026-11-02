/* Development-only Friendly room connectivity policy.
 * A browser backgrounding is not a user action to Quit Game.
 * Keep the existing session and seat credentials intact across WebSocket closes.
 * Ranked and Solo modes retain their original disconnection rules.
 */
import {FinalRankedRoomCore} from './ranked-room-final.mjs';
import {RoomCore} from './room-core.mjs';

export class DevelopmentFriendlyRoomCore extends FinalRankedRoomCore{
  // A room API join can create the authoritative match before the phone has
  // connected its game WebSocket. Never treat that as proof of attendance.
  flowFor(participant){
    const flow=super.flowFor(participant);
    return {...flow,waitingForOpponentConnection:!!(this.isRanked()&&!this.isSolo()&&
      this.room?.matchId&&!this.room.devBothConnectedEver)};
  }
  async connect(credential,socket){
    const participant=await super.connect(credential,socket);
    if(this.room?.matchId&&this.isRanked()&&!this.isSolo()&&!this.room.devBothConnectedEver&&
      this.room.participants.length===2&&
      this.room.participants.every(p=>p.connected&&this.sockets.has(p.playerId))){
      this.room.devBothConnectedEver=true;
      await this.persist();
      this.broadcastSnapshots();
    }
    return participant;
  }
  async handle(socket,input){
    await this.load();
    let message=null;
    try{message=typeof input==='string'?JSON.parse(input):null;}catch(_){}
    const isCompetitive=!!this.room?.matchId&&this.isRanked()&&!this.isSolo();
    if(isCompetitive&&message?.type==='action'&&!this.room.devBothConnectedEver&&
      !['quitGame','cancelDisconnectedGame'].includes(message.action?.type)){
      const reply={protocolVersion:1,type:'actionRejected',actionId:message.actionId,
        error:{code:'OPPONENT_NOT_CONNECTED',message:'Waiting for the other player to connect. No cards have been played.'}};
      this.send(socket,reply);return reply;
    }
    const response=await super.handle(socket,input);
    // Retain a short server-side development-only action trail. This records the
    // authenticated seat, not credentials, so a future "ghost turn" can be traced.
    if(isCompetitive&&message?.type==='action'&&response?.type==='actionAccepted'&&
       !response.duplicate){
      const participant=this.room.participants.find(p=>p.playerId===socket?.__playerId);
      if(participant){
        const trail=Array.isArray(this.room.devActionAudit)?this.room.devActionAudit:[];
        trail.push({time:this.now(),seatId:participant.seatId,playerId:participant.playerId,
          type:String(message.action?.type||''),actionId:String(message.actionId||''),
          revision:Number(response.revision)||0});
        this.room.devActionAudit=trail.slice(-80);
        await this.persist();
      }
    }
    return response;
  }
  async disconnect(socket){
    const playerId=socket?.__playerId||null;
    await this.load();
    if(!playerId||!this.room||this.isRanked()||this.isSolo())
      return super.disconnect(socket);
    // RoomCore marks the seat offline, persists it, and informs the opponent.
    // Bypass RankedRoomCore.disconnect(), which otherwise sets forceEnded=true
    // immediately for *any* Friendly WebSocket close (including mobile background).
    const disconnected=await RoomCore.prototype.disconnect.call(this,socket);
    if(!disconnected)return false;
    this.room.updatedAt=this.now();
    await this.persist();
    // Do NOT end the room, reset the cards, release its credential, or modify scores.
    // The socket client's normal automatic reconnect resumes the exact same match.
    this.broadcastSnapshots();
    await this.scheduleAlarm();
    return true;
  }
}
