/* Development-only Friendly room connectivity policy.
 * A browser backgrounding is not a user action to Quit Game.
 * Keep the existing session and seat credentials intact across WebSocket closes.
 * Ranked and Solo modes retain their original disconnection rules.
 */
import {FinalRankedRoomCore} from './ranked-room-final.mjs';
import {RoomCore} from './room-core.mjs';

export class DevelopmentFriendlyRoomCore extends FinalRankedRoomCore{
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
