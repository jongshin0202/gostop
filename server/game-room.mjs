import {RankedRoomCore} from './ranked-room-core.mjs';
import {RoomError} from './room-core.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const errorResponse=error=>json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message}},error.status||500);

export class GameRoom{
  constructor(state,env){
    this.state=state;this.env=env;
    const accountStore=env.ACCOUNT_STORE?.get(env.ACCOUNT_STORE.idFromName('global'))||null;
    this.core=new RankedRoomCore({storage:state.storage,accountStore,durableState:state});
  }
  async fetch(request){
    const url=new URL(request.url);
    try{
      if(request.method==='POST'&&url.pathname==='/initialize'){const {roomCode,account=null}=await request.json();return json({ok:true,room:await this.core.create(roomCode,account)},201);}
      if(request.method==='POST'&&url.pathname==='/initialize-solo'){const {roomCode}=await request.json();return json({ok:true,room:await this.core.createSolo(roomCode)},201);}
      if(request.method==='POST'&&url.pathname==='/join'){const body=await request.json().catch(()=>({}));return json({ok:true,room:await this.core.join(body.credential,body.account||null)},201);}
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
