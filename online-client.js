(() => {
  'use strict';
  const PROTOCOL_VERSION=1;
  class OnlineSessionAdapter extends EventTarget{
    constructor({baseUrl=globalThis.GOSTOP_CONFIG?.serverUrl||'',WebSocketImpl=WebSocket}={}){super();this.baseUrl=baseUrl.replace(/\/$/,'');this.WebSocketImpl=WebSocketImpl;this.room=null;this.revision=0;this.pendingActionId=null;this.socket=null;}
    async request(path,body){const response=await fetch(`${this.baseUrl}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error?.message||'Room request failed.'),data.error);return data.room;}
    assertConfigured(){if(!this.baseUrl)throw Object.assign(new Error('Online play is unavailable because the server URL is not configured.'),{code:'ONLINE_NOT_CONFIGURED'});}
    async create(){this.assertConfigured();this.room=await this.request('/api/rooms');return this.room;}
    async join(roomCode,credential){this.assertConfigured();this.room=await this.request(`/api/rooms/${roomCode.toUpperCase()}/join`,credential?{credential}:{});return this.room;}
    connect(room=this.room){this.assertConfigured();if(!room)throw new Error('Create or join a room first.');const url=new URL(`${this.baseUrl}/api/rooms/${room.roomCode}/ws`);url.protocol=url.protocol==='https:'?'wss:':'ws:';this.socket=new this.WebSocketImpl(url,`gostop-token.${room.credential}`);this.socket.onmessage=event=>this.receive(JSON.parse(event.data));this.socket.onclose=()=>this.emit('disconnected',{});return this.socket;}
    receive(message){if(message.protocolVersion!==PROTOCOL_VERSION){this.emit('error',{code:'UNSUPPORTED_PROTOCOL'});return;}if(message.snapshot){this.revision=message.snapshot.revision;this.emit('snapshot',{snapshot:message.snapshot,events:message.events||[]});}if(message.type==='actionAccepted'||message.type==='actionRejected')this.pendingActionId=null;this.emit(message.type,message);}
    submit(action){if(this.pendingActionId)throw new Error('An action is already awaiting the server.');const actionId=crypto.randomUUID();this.pendingActionId=actionId;this.socket.send(JSON.stringify({type:'action',protocolVersion:PROTOCOL_VERSION,actionId,expectedRevision:this.revision,action}));return actionId;}
    sync(){this.socket.send(JSON.stringify({type:'syncRequest',protocolVersion:PROTOCOL_VERSION,sinceRevision:this.revision}));}
    emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  }
  globalThis.GoStopOnline=Object.freeze({OnlineSessionAdapter,PROTOCOL_VERSION});
})();
