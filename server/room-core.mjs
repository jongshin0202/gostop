import '../game-engine.js';
import '../session-authority.js';
import {PROTOCOL_VERSION,envelope,parseClientMessage,protocolError} from './protocol.mjs';

const MAX_PLAYERS=2,EVENT_WINDOW=256;
const encoder=new TextEncoder();
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>JSON.stringify(canonical(value));
const randomId=(cryptoApi,prefix,bytes=18)=>{const data=new Uint8Array(bytes);cryptoApi.getRandomValues(data);return `${prefix}_${Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}`;};
const token=cryptoApi=>randomId(cryptoApi,'room',32);
const freshFlow=()=>({replayReady:{playerA:false,playerB:false},newGameRequest:null,requestGeneration:0,ended:false,endedBy:null});
const freshSessionStats=()=>({gamesPlayed:0,coinsWonByAccount:{},coinsLostByAccount:{},milestonesByAccount:{}});
async function tokenHash(cryptoApi,value){const digest=await cryptoApi.subtle.digest('SHA-256',encoder.encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export class RoomError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}

export class RoomCore{
  constructor({storage,cryptoApi=globalThis.crypto,now=()=>new Date().toISOString(),authorityFactory,accountStore=null}={}){
    this.storage=storage;this.crypto=cryptoApi;this.now=now;this.accountStore=accountStore;this.authorityFactory=authorityFactory||globalThis.GoStopSessionAuthority.createSessionAuthority;this.authority=this.authorityFactory({crypto:cryptoApi,now,trustedRuntime:true});this.room=null;this.sockets=new Map();
  }
  async load(){
    if(this.room)return this.room;
    const stored=await this.storage.get('room');if(!stored)return null;
    this.room=clone(stored);this.room.sessionFlow={...freshFlow(),...(this.room.sessionFlow||{}),replayReady:{...freshFlow().replayReady,...(this.room.sessionFlow?.replayReady||{})}};this.room.gameSequence=this.room.gameSequence||0;this.room.currentGameStartRevision=this.room.currentGameStartRevision||0;this.room.settledGameIds=this.room.settledGameIds||[];this.room.sessionStats={...freshSessionStats(),...(this.room.sessionStats||{})};if(this.room.authority)this.authority.restoreMatch(this.room.authority);
    return this.room;
  }
  async persist(){
    const record=clone(this.room);if(record.matchId)record.authority=this.authority.exportMatch(record.matchId);
    record.participants.forEach(participant=>{participant.connected=false;});
    await this.storage.put('room',record);
  }
  isRanked(){return !!this.accountStore&&this.room.participants.length===2&&this.room.participants.every(item=>!!item.accountId);}
  participantProfile(participant){return {nickname:participant.nickname||null,walletCoins:Number.isFinite(participant.walletCoins)?participant.walletCoins:null};}
  publicRoom(){return {roomCode:this.room.roomCode,matchId:this.room.matchId,status:this.room.status,maxPlayers:this.room.maxPlayers,createdAt:this.room.createdAt,ranked:this.isRanked()};}
  flowFor(participant){const flow=this.room.sessionFlow;return {replayReady:{you:!!flow.replayReady[participant.seatId],opponent:!!flow.replayReady[participant.seatId==='playerA'?'playerB':'playerA']},newGameRequest:flow.newGameRequest?{requestId:flow.newGameRequest.requestId,requestedByYou:flow.newGameRequest.requesterPlayerId===participant.playerId}:null,ended:flow.ended,endedByYou:flow.endedBy===participant.playerId};}
  snapshotFor(participant){const opponent=this.room.participants.find(item=>item.playerId!==participant.playerId);return {...this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}),sessionFlow:this.flowFor(participant),ranked:this.isRanked(),youProfile:this.participantProfile(participant),opponentProfile:opponent?this.participantProfile(opponent):null};}
  broadcastSnapshots(events=[]){for(const viewer of this.room.participants)this.sendTo(viewer.playerId,envelope('snapshot',{snapshot:this.snapshotFor(viewer),events}));}
  async accountRequest(path,body){if(!this.accountStore)return null;const response=await this.accountStore.fetch(new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}));if(!response.ok)throw new RoomError('ACCOUNT_SERVICE_ERROR','Account service could not complete ranked settlement.',503);return response.json();}
  async startRankedSession(){
    if(!this.isRanked())return null;
    this.room.sessionId=randomId(this.crypto,'session');this.room.sessionStats=freshSessionStats();
    await this.accountRequest('/internal/session/start',{sessionId:this.room.sessionId,mode:'online',accountIds:this.room.participants.map(item=>item.accountId),opponent:this.room.participants.map(item=>item.nickname),startedAt:this.now()});return this.room.sessionId;
  }
  async endRankedSession(reason='ended'){
    if(!this.room.sessionId||!this.accountStore)return;
    await this.accountRequest('/internal/session/end',{sessionId:this.room.sessionId,endedAt:this.now(),summary:{...clone(this.room.sessionStats),reason}});this.room.sessionId=null;
  }
  currentGameId(){return `${this.room.roomCode}-${this.room.gameSequence||1}`;}
  milestoneName(event){
    if(event.type==='shakeDeclared')return 'SHAKE';if(event.type==='bombDeclared')return 'BOMB';if(event.type==='ppeokFormed')return 'POOPED';if(event.type==='firstPpeokAwarded')return 'FIRST_POOP';if(event.type==='sweepTriggered')return 'CLEAN_SWEEP';if(event.type==='chongtongDeclared')return 'CONQUER';if(event.type==='threePpeokDeclared')return 'THREE_PPEOK';if(event.type==='cardsCaptured'&&event.rule==='jjok')return 'KISS';if(event.type==='cardsCaptured'&&event.rule==='ttadak')return 'FLUSH';return null;
  }
  milestonesForCurrentGame(){
    if(!this.room.matchId)return {};
    const exported=this.authority.exportMatch(this.room.matchId),result={};
    for(const participant of this.room.participants)result[participant.playerId]={};
    for(const event of exported.events||[]){if((event.revision||0)<=this.room.currentGameStartRevision)continue;const name=this.milestoneName(event);if(!name)continue;const participant=this.room.participants.find(item=>item.seatId===event.actorId||item.playerId===event.actorId);if(!participant)continue;const bucket=result[participant.playerId];bucket[name]=(bucket[name]||0)+1;}
    return result;
  }
  async settleTerminal(snapshot){
    if(!snapshot?.terminalResult)return null;
    const gameId=this.currentGameId();if(this.room.settledGameIds.includes(gameId))return null;
    const terminal=snapshot.terminalResult,winnerId=terminal.winnerId||null,points=Math.max(0,Math.trunc(Number(terminal.result?.score??terminal.result?.finalPoints??0))),milestones=this.milestonesForCurrentGame();
    this.room.settledGameIds.push(gameId);
    if(!this.isRanked())return null;
    const participants=this.room.participants.map(item=>({accountId:item.accountId,playerId:item.playerId,nickname:item.nickname,won:!!winnerId&&item.playerId===winnerId,walletDelta:!winnerId?0:(item.playerId===winnerId?points:-points),coinsWon:item.playerId===winnerId?points:0,points:item.playerId===winnerId?points:0,milestones:milestones[item.playerId]||{}}));
    const response=await this.accountRequest('/internal/game/settle',{gameId,sessionId:this.room.sessionId,mode:'online',winnerPlayerId:winnerId,finalPoints:points,participants,recordedAt:this.now()});
    for(const settled of response?.game?.participants||[]){const participant=this.room.participants.find(item=>item.accountId===settled.accountId);if(participant&&Number.isFinite(settled.walletAfter))participant.walletCoins=settled.walletAfter;}
    this.room.sessionStats.gamesPlayed++;
    for(const item of participants){const accountId=item.accountId;if(!accountId)continue;if(item.walletDelta>0)this.room.sessionStats.coinsWonByAccount[accountId]=(this.room.sessionStats.coinsWonByAccount[accountId]||0)+item.walletDelta;if(item.walletDelta<0)this.room.sessionStats.coinsLostByAccount[accountId]=(this.room.sessionStats.coinsLostByAccount[accountId]||0)+Math.abs(item.walletDelta);const target=this.room.sessionStats.milestonesByAccount[accountId]||(this.room.sessionStats.milestonesByAccount[accountId]={});for(const [name,count] of Object.entries(item.milestones||{}))target[name]=(target[name]||0)+count;}
    return response;
  }
  async create(roomCode,account=null){
    if(await this.load())throw new RoomError('ROOM_EXISTS','Room already exists.',409);
    const credential=token(this.crypto),participant={playerId:randomId(this.crypto,'player'),seatId:'playerA',credentialHash:await tokenHash(this.crypto,credential),accountId:account?.id||null,nickname:account?.nickname||null,walletCoins:Number.isFinite(account?.walletCoins)?account.walletCoins:null,connected:false};
    this.room={roomCode,matchId:null,status:'waiting',maxPlayers:MAX_PLAYERS,participants:[participant],eventHistory:[],terminalResult:null,sessionFlow:freshFlow(),sessionId:null,sessionStats:freshSessionStats(),gameSequence:0,currentGameStartRevision:0,settledGameIds:[],createdAt:this.now(),updatedAt:this.now()};await this.persist();
    return {...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId,credential,profile:this.participantProfile(participant)};
  }
  async join(presentedCredential,account=null){
    if(!await this.load())throw new RoomError('ROOM_NOT_FOUND','Room does not exist or has expired.',404);
    if(this.room.sessionFlow?.ended||this.room.status==='ended')throw new RoomError('ROOM_NOT_FOUND','Room does not exist or has expired.',404);
    if(presentedCredential&&await this.authenticate(presentedCredential))throw new RoomError('ALREADY_JOINED','This participant already owns a seat.',409);
    if(this.room.participants.length>=this.room.maxPlayers)throw new RoomError('ROOM_FULL','Room is full.',409);
    if(account?.id&&this.room.participants.some(item=>item.accountId===account.id))throw new RoomError('SAME_ACCOUNT','The same account cannot occupy both seats.',409);
    const credential=token(this.crypto),participant={playerId:randomId(this.crypto,'player'),seatId:'playerB',credentialHash:await tokenHash(this.crypto,credential),accountId:account?.id||null,nickname:account?.nickname||null,walletCoins:Number.isFinite(account?.walletCoins)?account.walletCoins:null,connected:false};this.room.participants.push(participant);
    this.room.matchId=randomId(this.crypto,'match');this.room.gameSequence=1;this.room.currentGameStartRevision=0;this.authority.createMatch({matchId:this.room.matchId,playerIds:this.room.participants.map(item=>item.playerId),gameMode:'online-2player'});this.room.status='ready';this.room.updatedAt=this.now();if(this.isRanked())await this.startRankedSession();await this.persist();
    for(const viewer of this.room.participants)this.sendTo(viewer.playerId,envelope('roomReady',{...this.publicRoom()}));this.broadcastSnapshots();
    return {...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId,credential,profile:this.participantProfile(participant)};
  }
  async authenticate(credential){
    if(typeof credential!=='string'||credential.length<40)return null;await this.load();if(!this.room)return null;
    const hash=await tokenHash(this.crypto,credential);return this.room.participants.find(participant=>safeEqual(participant.credentialHash,hash))||null;
  }
  async connect(credential,socket){
    const participant=await this.authenticate(credential);if(!participant)throw new RoomError('INVALID_CREDENTIAL','Room credential is invalid.',401);
    const old=this.sockets.get(participant.playerId);if(old&&old!==socket){try{old.close(4001,'Reconnected elsewhere');}catch(_){}}
    this.sockets.set(participant.playerId,socket);participant.connected=true;socket.__playerId=participant.playerId;await this.persist();
    this.send(socket,envelope('connected',{...this.publicRoom(),playerId:participant.playerId,seatId:participant.seatId,profile:this.participantProfile(participant)}));
    if(this.room.matchId)this.send(socket,envelope('snapshot',{snapshot:this.snapshotFor(participant),events:[]}));
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
      const snapshot=this.snapshotFor(participant);
      const events=this.authority.getEventsSince({matchId:this.room.matchId,viewerId:participant.playerId,revision:Math.min(message.sinceRevision,snapshot.revision)});
      const response=envelope('snapshot',{snapshot,events:events.events});this.send(socket,response);return response;
    }
    try{
      const actionFingerprint=fingerprint(message.action),prior=this.room.eventHistory.find(entry=>entry.actionId===message.actionId&&entry.playerId===participant.playerId),wasSeen=!!prior;
      if(prior&&prior.fingerprint!==actionFingerprint)throw Object.assign(new Error('actionId was already used with different action data.'),{code:'ACTION_ID_CONFLICT'});
      if(message.action.type==='evaluateGoStop'||message.action.type==='resolveNagari')throw Object.assign(new Error('Turn evaluation is owned by the authoritative room.'),{code:'SERVER_OWNED_ACTION'});
      const flow=this.room.sessionFlow,flowActions=new Set(['playAgainReady','requestNewGame','respondNewGame','cancelNewGame','quitGame']);
      if(flowActions.has(message.action.type)){
        if(wasSeen){const response=envelope('actionAccepted',{actionId:message.actionId,revision:prior.revision,duplicate:true});this.send(socket,response);return response;}
        if(flow.ended){if(message.action.type==='quitGame'){const response=envelope('actionAccepted',{actionId:message.actionId,revision:this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision,duplicate:true});this.send(socket,response);return response;}throw Object.assign(new Error('This multiplayer session has ended.'),{code:'SESSION_ENDED'});}
        if(flow.newGameRequest&&message.action.type==='playAgainReady')throw Object.assign(new Error('A New Game request is pending.'),{code:'SESSION_FLOW_PENDING'});
        let flowEvents=[];
        if(message.action.type==='playAgainReady'){
          const current=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId});
          if(!current.terminalResult)throw Object.assign(new Error('The current hand is not complete.'),{code:'HAND_IN_PROGRESS'});
          flow.replayReady[participant.seatId]=true;
          if(flow.replayReady.playerA&&flow.replayReady.playerB){const next=this.authority.createNewHand({matchId:this.room.matchId});this.room.gameSequence++;this.room.currentGameStartRevision=next.revision;flowEvents=this.authority.getEventsSince({matchId:this.room.matchId,viewerId:participant.playerId,revision:current.revision}).events;flow.replayReady={playerA:false,playerB:false};this.room.status='ready';this.room.terminalResult=null;}
        }else if(message.action.type==='requestNewGame'){
          if(!flow.newGameRequest)flow.newGameRequest={requestId:`request-${++flow.requestGeneration}`,requesterPlayerId:participant.playerId,createdAt:this.now()};
        }else if(message.action.type==='respondNewGame'){
          const request=flow.newGameRequest;
          if(request&&request.requestId===message.action.requestId&&request.requesterPlayerId!==participant.playerId){
            flow.newGameRequest=null;
            if(message.action.accept){await this.endRankedSession('new-game');const matchId=randomId(this.crypto,'match');this.authority.createMatch({matchId,playerIds:this.room.participants.map(item=>item.playerId),gameMode:'online-2player'});this.room.matchId=matchId;this.room.gameSequence++;this.room.currentGameStartRevision=0;this.room.status='ready';this.room.terminalResult=null;flow.replayReady={playerA:false,playerB:false};if(this.isRanked())await this.startRankedSession();}
          }
        }else if(message.action.type==='cancelNewGame'){
          const request=flow.newGameRequest;if(request&&request.requestId===message.action.requestId&&request.requesterPlayerId===participant.playerId)flow.newGameRequest=null;
        }else if(message.action.type==='quitGame'){
          await this.endRankedSession('quit');flow.ended=true;flow.endedBy=participant.playerId;flow.replayReady={playerA:false,playerB:false};flow.newGameRequest=null;this.room.status='ended';
        }
        const revision=this.authority.getSnapshot({matchId:this.room.matchId,viewerId:participant.playerId}).revision;
        this.room.eventHistory.push({revision,actionId:message.actionId,playerId:participant.playerId,fingerprint:actionFingerprint,matchId:this.room.matchId});this.room.eventHistory=this.room.eventHistory.slice(-EVENT_WINDOW);this.room.updatedAt=this.now();await this.persist();this.broadcastSnapshots(flowEvents);
        const response=envelope('actionAccepted',{actionId:message.actionId,matchId:this.room.matchId,revision,duplicate:false});this.send(socket,response);return response;
      }
      if(flow.ended)throw Object.assign(new Error('This multiplayer session has ended.'),{code:'SESSION_ENDED'});
      if(flow.newGameRequest)throw Object.assign(new Error('A New Game request is pending.'),{code:'SESSION_FLOW_PENDING'});
      if(message.action.type==='newGame'||message.action.type==='newHand')throw Object.assign(new Error('Direct match replacement is disabled; use multiplayer session flow.'),{code:'SESSION_FLOW_REQUIRED'});
      const result=this.authority.submitAction({matchId:this.room.matchId,playerId:participant.playerId,actionId:message.actionId,expectedRevision:message.expectedRevision,action:message.action});
      if(!wasSeen){this.room.eventHistory.push({revision:result.revision,actionId:message.actionId,playerId:participant.playerId,fingerprint:actionFingerprint});this.room.eventHistory=this.room.eventHistory.slice(-EVENT_WINDOW);}
      if(result.snapshot.terminalResult){this.room.status='completed';this.room.terminalResult=clone(result.snapshot.terminalResult);await this.settleTerminal(result.snapshot);}
      for(const viewer of this.room.participants){const snapshot=this.snapshotFor(viewer),events=wasSeen?[]:this.authority.getEventsSince({matchId:this.room.matchId,viewerId:viewer.playerId,revision:Math.max(0,result.revision-1)}).events;this.sendTo(viewer.playerId,envelope('snapshot',{snapshot,events}));}
      this.room.updatedAt=this.now();await this.persist();const response=envelope('actionAccepted',{actionId:message.actionId,revision:result.revision,duplicate:wasSeen,requiresNagari:!!result.requiresNagari,autoStop:!!result.autoStop});this.send(socket,response);return response;
    }catch(error){const response=envelope('actionRejected',{actionId:message.actionId,error:{code:error.code||'ILLEGAL_ACTION',message:error.message}});this.send(socket,response);return response;}
  }
}
export {PROTOCOL_VERSION};
