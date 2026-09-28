import {FinalRankedRoomCore} from './ranked-room-final.mjs';
import {RoomError} from './room-core.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const errorResponse=error=>json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message}},error.status||500);

export class GameRoom{
  constructor(state,env){
    this.state=state;this.env=env;
    const accountStore=env.ACCOUNT_STORE?.get(env.ACCOUNT_STORE.idFromName('global'))||null,toMs=value=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?seconds*1000:undefined;};
    this.core=new FinalRankedRoomCore({storage:state.storage,accountStore,durableState:state,inactivityNudgeMs:toMs(env.INACTIVITY_NUDGE_SECONDS),nudgePhaseMs:toMs(env.INACTIVITY_NUDGE_PHASE_SECONDS),abandonmentCountdownMs:toMs(env.ABANDONMENT_COUNTDOWN_SECONDS),pauseDurationMs:toMs(env.PAUSE_DURATION_SECONDS)});
    this.restoreHibernatingSockets();
  }
  socketAttachment(socket){try{return socket?.deserializeAttachment?.()||null;}catch(_){return null;}}
  registerRuntimeSocket(socket,attachment=this.socketAttachment(socket)){
    const playerId=attachment?.playerId;if(!socket||!playerId)return false;
    socket.__playerId=playerId;
    if(attachment.multiSocket){
      const existing=this.core.sockets.get(playerId),sockets=existing instanceof Set?existing:new Set(existing?[existing]:[]);
      sockets.add(socket);this.core.sockets.set(playerId,sockets);
    }else{
      const existing=this.core.sockets.get(playerId);
      if(existing instanceof Set){existing.add(socket);this.core.sockets.set(playerId,existing);}
      else this.core.sockets.set(playerId,socket);
    }
    return true;
  }
  restoreHibernatingSockets(extraSocket=null){
    if(typeof this.state.getWebSockets!=='function')return;
    this.core.sockets.clear();
    const sockets=[...this.state.getWebSockets()];
    if(extraSocket&&!sockets.includes(extraSocket))sockets.push(extraSocket);
    for(const socket of sockets)this.registerRuntimeSocket(socket);
  }
  async prepareHibernatingEvent(socket=null){
    this.restoreHibernatingSockets(socket);await this.core.load();
    if(this.core.room)for(const participant of this.core.room.participants)participant.connected=this.core.sockets.has(participant.playerId);
  }
  closeRuntimeSockets(code=4002,reason='System reset'){
    const closed=new Set();
    for(const value of this.core.sockets?.values?.()||[]){
      const sockets=value instanceof Set?value:[value];
      for(const socket of sockets){if(!socket||closed.has(socket))continue;closed.add(socket);try{socket.close(code,reason);}catch(_){}}
    }
  }
  async clearStorage(){if(typeof this.state.storage.deleteAll==='function')await this.state.storage.deleteAll();else{const all=await this.state.storage.list();for(const key of all.keys())await this.state.storage.delete(key);}}
  resetRuntime(){
    this.closeRuntimeSockets();
    this.core.sockets?.clear?.();this.core.room=null;
    this.core.authority=this.core.authorityFactory({crypto:this.core.crypto,now:this.core.now,trustedRuntime:true});
  }
  async systemSnapshot(){return {ok:true,room:await this.state.storage.get('room')||null};}
  async systemReset(){await this.clearStorage();this.resetRuntime();return {ok:true};}
  async systemRestore(room){await this.clearStorage();if(room)await this.state.storage.put('room',room);this.resetRuntime();return {ok:true,restored:!!room};}
  async fetch(request){
    const url=new URL(request.url);
    try{
      if(['/system-snapshot','/system-reset','/system-restore'].includes(url.pathname)){
        if(request.headers.get('x-gostop-system-admin')!=='1')throw new RoomError('SYSTEM_ADMIN_REQUIRED','System admin authorization required.',401);
        if(request.method==='GET'&&url.pathname==='/system-snapshot')return json(await this.systemSnapshot());
        if(request.method==='POST'&&url.pathname==='/system-reset')return json(await this.systemReset());
        if(request.method==='POST'&&url.pathname==='/system-restore'){const body=await request.json().catch(()=>({}));return json(await this.systemRestore(body.room||null));}
      }
      if(request.method==='POST'&&url.pathname==='/initialize'){const {roomCode,account=null}=await request.json();return json({ok:true,room:await this.core.create(roomCode,account)},201);}
      if(request.method==='POST'&&url.pathname==='/initialize-solo'){const {roomCode}=await request.json();return json({ok:true,room:await this.core.createSolo(roomCode)},201);}
      if(request.method==='POST'&&url.pathname==='/join'){const body=await request.json().catch(()=>({}));return json({ok:true,room:await this.core.join(body.credential,body.account||null)},201);}
      if(request.method==='POST'&&url.pathname==='/leave-solo-for-challenge'){const body=await request.json().catch(()=>({}));return json(await this.core.leaveSoloForChallenge(body.accountId));}
      if(request.method==='POST'&&url.pathname==='/reconcile-active'){const body=await request.json().catch(()=>({}));return json({ok:true,...await this.core.reconcileActiveRanked(body.accountId,body.sessionId)});}
      if(request.method==='POST'&&url.pathname==='/decline-reconnect'){const body=await request.json().catch(()=>({}));return json(await this.core.declineReconnect(body.accountId,body.sessionId));}
      if(request.method==='GET'&&url.pathname==='/connect'){
        if(request.headers.get('Upgrade')!=='websocket')throw new RoomError('UPGRADE_REQUIRED','WebSocket upgrade required.',426);
        const credential=request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(v=>v.trim()).find(v=>v.startsWith('gostop-token.'))?.slice(13);
        const authenticated=await this.core.authenticate(credential);if(!authenticated)throw new RoomError('INVALID_CREDENTIAL','Room credential is invalid.',401);
        const pair=new WebSocketPair(),client=pair[0],server=pair[1];
        if(typeof this.state.acceptWebSocket!=='function')throw new RoomError('HIBERNATION_UNAVAILABLE','Durable Object WebSocket hibernation is unavailable.',503);
        this.state.acceptWebSocket(server);
        try{
          const participant=await this.core.connect(credential,server);
          server.serializeAttachment({playerId:participant.playerId,multiSocket:!!participant.accountId});
        }catch(error){try{server.close(1011,'Connection setup failed');}catch(_){}throw error;}
        return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':`gostop-token.${credential}`}});
      }
      throw new RoomError('NOT_FOUND','Endpoint not found.',404);
    }catch(error){return errorResponse(error);}
  }
  async webSocketMessage(socket,message){await this.prepareHibernatingEvent(socket);return this.core.handle(socket,message);}
  async webSocketClose(socket){await this.prepareHibernatingEvent(socket);return this.core.disconnect(socket);}
  async webSocketError(socket){await this.prepareHibernatingEvent(socket);return this.core.disconnect(socket);}
  async alarm(){this.restoreHibernatingSockets();return this.core.alarm();}
}
