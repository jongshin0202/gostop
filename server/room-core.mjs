import '../game-engine.js';
import '../session-authority.js';
import {PROTOCOL_VERSION,envelope,parseClientMessage,protocolError} from './protocol.mjs';

const MAX_PLAYERS=2,EVENT_WINDOW=256;
const encoder=new TextEncoder();
const clone=value=>JSON.parse(JSON.stringify(value));
const randomId=(cryptoApi,prefix,bytes=18)=>{const data=new Uint8Array(bytes);cryptoApi.getRandomValues(data);return `${prefix}_${Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}`;};
const token=cryptoApi=>randomId(cryptoApi,'room',32);
async function tokenHash(cryptoApi,value){const digest=await cryptoApi.subtle.digest('SHA-256',encoder.encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export class RoomError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}

export class RoomCore{
  constructor({storage,cryptoApi=globalThis.crypto,now=()=>new Date().toISOString(),authorityFactory}={}){
    this.storage=storage;this.crypto=cryptoApi;this.now=now;this.authorityFactory=authorityFactory||globalThis.GoStopSessionAuthority.createSessionAuthority;this.authority=this.authorityFactory({crypto:cryptoApi,now,trustedRuntime:true});this.room=null;this.sockets=new Map();
  }
  async load(){
    if(this.room)return this.room;
    const stored=await this.storage.get('room');if(!stored)return null;
    this.room=clone(stored);if(this.room.authority)this.authority.restoreMatch(this.room.authority);
    return this.room;
  }
  async persist(){
    const record=clone(this.room);if(record.matchId)record.authority=this.authority.exportMatch(record.matchId);
    record.participants.forEach(participant=>{participant.connected=false;});
    await this.storage.put('room',record);
  }
  publicRoom(){return {roomCode:this.room.roomCode,matchId:this.room.matchId,status:this.room.status,maxPlayers:this.room.maxPlayers,createdAt:this.room.createdAt};}
  async create(roomCode){
    if(await this.load())throw new RoomError('ROOM_EXISTS','Room already exists.',409);
    const credential=token(this.crypto),participant={playerId:randomId(this.crypto,'player'),seatId:'playerA',credentialHash:await tokenHash(this.crypto,credential),accountId:null,connected:false};
    this.room={roomCode,matchId:null,status:'waiting',maxPlayers:MAX_PLAYERS,participants:[participant],eventHistory:[],terminalResult:null,createdAt:this.now(),updatedAt:this.now()};await this.persist();
    return {...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId,credential};
  }
  async join(presentedCredential){
    if(!await this.load())throw new RoomError('ROOM_NOT_FOUND','Room does not exist or has expired.',404);
    if(presentedCredential&&await this.authenticate(presentedCredential))throw new RoomError('ALREADY_JOINED','This participant already owns a seat.',409);
    if(this.room.participants.length>=this.room.maxPlayers)throw new RoomError('ROOM_FULL','Room is full.',409);
    const credential=token(this.crypto),participant={playerId:randomId(this.crypto,'player'),seatId:'playerB',credentialHash:await tokenHash(this.crypto,credential),accountId:null,connected:false};this.room.participants.push(participant);
    this.room.matchId=randomId(this.crypto,'match');this.authority.createMatch({matchId:this.room.matchId,playerIds:this.room.participants.map(item=>item.playerId),gameMode:'online-2player'});this.room.status='ready';this.room.updatedAt=this.now();await this.persist();
    for(const viewer of this.room.participants){this.sendTo(viewer.playerId,envelope('roomReady',{...this.publicRoom()}));this.sendTo(viewer.playerId,envelope('snapshot',{snapshot:this.authority.getSnapshot({matchId:this.room.matchId,viewerId:viewer.playerId}),events:[]}));}
    return {...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId,credential};
  }
  async authenticate(credential){
    if(typeof credential!=='string'||credential.length<40)return null;await this.load();if(!this.room)return null;
    const hash=await tokenHash(this.crypto,credential);return this.room.participants.find(participant=>safeEqual(participant.credentialHash,hash))||null;
  }
  async connect(credential,socket){
    const participant=await this.authenticate(credential);if(!participant)throw new RoomError('INVALID_CREDENTIAL','Room credential is invalid.',401);
    const old=this.sockets.get(participant.playerId);if(old&&old!==socket){try{old.close(4001,'Reconnected elsewhere');}catch(_){}}
    this.sockets.set(participant.playerId,socket);participant.connected=true;socket.__playerId=participant.playerId;await this.persist();
    this.send(socket,envelope('connected',{...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId}));
    if(this.room.matchId)this.send(socket,envelope('snapshot',{snapshot:this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId})}));
    this.broadcastPresence(participant.playerId,true);return participant;
  }
  send(socket,message){socket.send(JSON.stringify(message));}
  sendTo(playerId,message){const socket=this.sockets.get(playerId);if(socket)this.send(socket,message);}
  broadcastPresence(playerId,connected){for(const participant of this.room.participants)if(participant.playerId!==playerId)this.sendTo(participant.playerId,envelope(connected?'opponentConnected':'opponentDisconnected',{}));}
  async disconnect(socket){const playerId=socket.__playerId;if(!playerId||this.sockets.get(playerId)!==socket)return;this.sockets.delete(playerId);const participant=this.room.participants.find(item=>item.playerId===playerId);if(participant)participant.connected=false;await this.persist();this.broadcastPresence(playerId,false);}
  async handle(socket,input){
    let message;try{message=parseClientMessage(input);}catch(error){const response=protocolError(error.code||'MALFORMED_MESSAGE',error.message);this.send(socket,response);return response;}
    const participant=this.room?.participants.find(item=>item.playerId===socket.__playerId);if(!participant){const response=protocolError('NOT_AUTHENTICATED','Socket is not authenticated.');this.send(socket,response);return response;}
    if(message.type==='ping'){const response=envelope('pong',{nonce:message.nonce});this.send(socket,response);return response;}
    if(!this.room.matchId){const response=protocolError('ROOM_NOT_READY','Waiting for a second player.');this.send(socket,response);return response;}
    if(message.type==='syncRequest'){
      const snapshot=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId});
      const events=this.authority.getEventsSince({matchId:this.room.matchId,viewerId:participant.playerId,revision:Math.min(message.sinceRevision,snapshot.revision)});
      const response=envelope('snapshot',{snapshot,events:events.events});this.send(socket,response);return response;
    }
    try{
      const wasSeen=this.room.eventHistory.some(entry=>entry.actionId===message.actionId&&entry.playerId===participant.playerId);
      if(message.action.type==='newHand'){
        const current=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId});
        if(message.expectedRevision!==current.revision)throw Object.assign(new Error(`Expected revision ${message.expectedRevision}, current revision is ${current.revision}.`),{code:'STALE_REVISION'});
        if(!current.terminalResult)throw Object.assign(new Error('The current hand is not complete.'),{code:'HAND_IN_PROGRESS'});
        if(!wasSeen){this.authority.createNewHand({matchId:this.room.matchId});this.room.eventHistory.push({revision:current.revision+1,actionId:message.actionId,playerId:participant.playerId});}
        const revision=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;this.room.status='ready';this.room.terminalResult=null;
        for(const viewer of this.room.participants)this.sendTo(viewer.playerId,envelope('snapshot',{snapshot:this.authority.getSnapshot({matchId:this.room.matchId,viewerId:viewer.playerId}),events:[]}));
        await this.persist();const response=envelope('actionAccepted',{actionId:message.actionId,revision,duplicate:wasSeen});this.send(socket,response);return response;
      }
      const result=this.authority.submitAction({matchId:this.room.matchId,playerId:participant.playerId,actionId:message.actionId,expectedRevision:message.expectedRevision,action:message.action});
      if(!wasSeen){this.room.eventHistory.push({revision:result.revision,actionId:message.actionId,playerId:participant.playerId});this.room.eventHistory=this.room.eventHistory.slice(-EVENT_WINDOW);}
      for(const viewer of this.room.participants){const snapshot=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:viewer.playerId}),events=wasSeen?[]:this.authority.getEventsSince({matchId:this.room.matchId,viewerId:viewer.playerId,revision:Math.max(0,result.revision-1)}).events;this.sendTo(viewer.playerId,envelope('snapshot',{snapshot,events}));}
      if(result.snapshot.terminalResult){this.room.status='completed';this.room.terminalResult=clone(result.snapshot.terminalResult);}
      this.room.updatedAt=this.now();await this.persist();const response=envelope('actionAccepted',{actionId:message.actionId,revision:result.revision,duplicate:wasSeen,requiresNagari:!!result.requiresNagari,autoStop:!!result.autoStop});this.send(socket,response);return response;
    }catch(error){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:error.code||'ILLEGAL_ACTION',message:error.message}});this.send(socket,response);return response;}
  }
}
export {PROTOCOL_VERSION};
