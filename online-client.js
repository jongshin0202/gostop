(() => {
  'use strict';
  const PROTOCOL_VERSION=1;
  const DEFAULT_SERVER_URL='https://gostop-authority.jwshin1.workers.dev';
  function viewerCanStartTurn(snapshot){
    const state=snapshot?.state,seatId=snapshot?.seatId;
    if(!state||!['playerA','playerB'].includes(seatId)||state.turn!==seatId||state.winner||state.pendingTurn||state.pendingDecision)return false;
    if(Array.isArray(state.legalActions)&&state.legalActions.includes('attemptPlayCard'))return true;
    // Replay fallback: a fresh authoritative hand can briefly expose an empty/stale
    // convenience legalActions list after the computer auto-finishes its opening turn.
    // Derive the same permission from projected authoritative state so the UI cannot
    // remain locked even though it is already the viewer's playable turn.
    if(state.openingSpecialsComplete!==true)return false;
    const viewer=seatId==='playerA'?state.human:state.ai;
    return Array.isArray(viewer?.hand)&&viewer.hand.length>0;
  }
  function viewerCanInteract(snapshot,{connected,pendingActionId=null,blocked=false}={}){return !!connected&&!pendingActionId&&!blocked&&viewerCanStartTurn(snapshot);}
  class OnlineSessionAdapter extends EventTarget{
    constructor({baseUrl=globalThis.GOSTOP_CONFIG?.serverUrl||DEFAULT_SERVER_URL,WebSocketImpl=WebSocket,authToken=null,anonymous=false}={}){super();this.baseUrl=String(baseUrl||DEFAULT_SERVER_URL).replace(/\/$/,'');this.WebSocketImpl=WebSocketImpl;this.authToken=authToken;this.anonymous=!!anonymous;this.room=null;this.revision=0;this.pendingActionId=null;this.pendingActionRevision=null;this.socket=null;this.explicitlyClosed=false;this.reconnectTimer=null;this.reconnectAttempts=0;}
    currentAuthToken(){return this.anonymous?null:(this.authToken||globalThis.GoStopRanked?.getAuthToken?.()||null);}
    setAuthToken(token){this.authToken=token||null;return this;}
    requestUrl(path){const sameOrigin=typeof location!=='undefined'&&/^(?:www\.)?gostoplive\.com$/i.test(location.hostname)&&String(path||'').startsWith('/api/');return sameOrigin?`${location.origin}${path}`:`${this.baseUrl}${path}`;}
    async request(path,body){const headers={'content-type':'application/json'},token=this.currentAuthToken();if(token)headers.authorization=`Bearer ${token}`;const response=await fetch(this.requestUrl(path),{method:'POST',headers,body:JSON.stringify(body||{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error?.message||'Room request failed.'),data.error);return data.room;}
    assertConfigured(){if(!this.baseUrl)throw Object.assign(new Error('Online play is unavailable because the server URL is not configured.'),{code:'ONLINE_NOT_CONFIGURED'});}
    async create(){this.assertConfigured();this.room=await this.request('/api/rooms');globalThis.dispatchEvent?.(new CustomEvent('gostop-online-room-created',{detail:{room:this.room,adapter:this}}));return this.room;}
    async join(roomCode,credential){this.assertConfigured();this.room=await this.request(`/api/rooms/${roomCode.toUpperCase()}/join`,credential?{credential}:{});globalThis.dispatchEvent?.(new CustomEvent('gostop-online-room-joined',{detail:{room:this.room,adapter:this}}));return this.room;}
    connect(room=this.room){
      this.assertConfigured();if(!room)throw new Error('Create or join a room first.');this.room=room;this.explicitlyClosed=false;if(this.reconnectTimer){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;}
      const url=new URL(`${this.baseUrl}/api/rooms/${room.roomCode}/ws`);url.protocol=url.protocol==='https:'?'wss:':'ws:';const socket=new this.WebSocketImpl(url,`gostop-token.${room.credential}`);this.socket=socket;
      socket.onopen=()=>{this.reconnectAttempts=0;};
      socket.onmessage=event=>this.receive(JSON.parse(event.data));
      socket.onclose=event=>{const takenOver=Number(event?.code)===4001;if(takenOver)this.explicitlyClosed=true;if(this.socket===socket)this.socket=null;this.pendingActionId=null;this.pendingActionRevision=null;this.emit('disconnected',{takenOver,code:event?.code||0});globalThis.dispatchEvent?.(new CustomEvent('gostop-online-message',{detail:{type:takenOver?'sessionTakenOver':'selfDisconnected',code:event?.code||0}}));if(!takenOver&&!this.explicitlyClosed&&this.room){const delay=Math.min(5000,750+this.reconnectAttempts*750);this.reconnectAttempts++;this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;if(!this.explicitlyClosed&&this.room)this.connect(this.room);},delay);}};
      socket.onerror=()=>{};return socket;
    }
    receive(message){
      globalThis.dispatchEvent?.(new CustomEvent('gostop-online-message',{detail:message}));
      if(message.protocolVersion!==PROTOCOL_VERSION){this.emit('error',{code:'UNSUPPORTED_PROTOCOL'});return;}
      if(message.type==='snapshot'){
        this.revision=message.snapshot.revision;
        // The room broadcasts the authoritative post-action snapshot before its
        // actionAccepted envelope. Treat revision progress as an implicit ack so a
        // delayed/lost acknowledgement can never freeze the next physical input.
        if(this.pendingActionId&&Number.isInteger(this.pendingActionRevision)&&this.revision>this.pendingActionRevision){
          this.pendingActionId=null;this.pendingActionRevision=null;
        }
        this.emit('snapshot',{snapshot:message.snapshot,events:message.events||[]});return;
      }
      if(message.type==='actionAccepted'||message.type==='actionRejected'){this.pendingActionId=null;this.pendingActionRevision=null;}
      this.emit(message.type,message);
    }
    submit(action){if(this.pendingActionId)throw new Error('An action is already awaiting the server.');if(!this.socket||this.socket.readyState!==this.WebSocketImpl.OPEN)throw new Error('The game is reconnecting.');const actionId=crypto.randomUUID();this.pendingActionId=actionId;this.pendingActionRevision=this.revision;this.socket.send(JSON.stringify({type:'action',protocolVersion:PROTOCOL_VERSION,actionId,expectedRevision:this.revision,action}));return actionId;}
    sync(){if(this.socket?.readyState===this.WebSocketImpl.OPEN)this.socket.send(JSON.stringify({type:'syncRequest',protocolVersion:PROTOCOL_VERSION,sinceRevision:this.revision}));}
    sendFriendlyReferral(status,stage){if(!this.anonymous||!this.socket||this.socket.readyState!==this.WebSocketImpl.OPEN)return false;this.socket.send(JSON.stringify({type:'friendlyReferral',protocolVersion:PROTOCOL_VERSION,status,stage}));return true;}
    close(){this.explicitlyClosed=true;if(this.reconnectTimer){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;}if(this.socket){this.socket.close();this.socket=null;}this.pendingActionId=null;this.pendingActionRevision=null;this.room=null;}
    emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  }
  const api=Object.freeze({OnlineSessionAdapter,PROTOCOL_VERSION,viewerCanStartTurn,viewerCanInteract});
  globalThis.GoStopOnline=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
