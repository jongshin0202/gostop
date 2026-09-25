import {FinalRankedRoomCore} from './ranked-room-final.mjs';
import {RoomError} from './room-core.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const errorResponse=error=>json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message}},error.status||500);

export class GameRoom{
  constructor(state,env){
    this.state=state;this.env=env;
    const accountStore=env.ACCOUNT_STORE?.get(env.ACCOUNT_STORE.idFromName('global'))||null,toMs=value=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?seconds*1000:undefined;};
    this.core=new FinalRankedRoomCore({storage:state.storage,accountStore,durableState:state,inactivityNudgeMs:toMs(env.INACTIVITY_NUDGE_SECONDS),nudgePhaseMs:toMs(env.INACTIVITY_NUDGE_PHASE_SECONDS),abandonmentCountdownMs:toMs(env.ABANDONMENT_COUNTDOWN_SECONDS),pauseDurationMs:toMs(env.PAUSE_DURATION_SECONDS)});
  }
  async clearStorage(){if(typeof this.state.storage.deleteAll==='function')await this.state.storage.deleteAll();else{const all=await this.state.storage.list();for(const key of all.keys())await this.state.storage.delete(key);}}
  resetRuntime(){
    for(const socket of this.core.sockets?.values?.()||[]){try{socket.close(4002,'System reset');}catch(_){}}
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
        const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();await this.core.connect(credential,server);
        server.addEventListener('message',event=>this.core.handle(server,event.data));server.addEventListener('close',()=>this.core.disconnect(server));server.addEventListener('error',()=>this.core.disconnect(server));
        return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':`gostop-token.${credential}`}});
      }
      throw new RoomError('NOT_FOUND','Endpoint not found.',404);
    }catch(error){return errorResponse(error);}
  }
  async alarm(){return this.core.alarm();}
}
