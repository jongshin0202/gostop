/* Development-only proof that a Competitive game's authenticated room WebSocket
 * actually completed the server "connected" handshake before lobby handoff.
 * Never promote an HTTP room join alone into a successful two-player start.
 */
(()=>{
'use strict';
const hostname=globalThis.location?.hostname||'';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(hostname))return;
const proven=new WeakMap();
const validProof=(adapter,code,seat)=>{
 const item=proven.get(adapter);
 return adapter?.room?.roomCode===code&&adapter?.room?.seatId===seat&&
  adapter?.socket?.readyState===WebSocket.OPEN&&
  item?.roomCode===code&&item?.seatId===seat&&item?.playerId===adapter.room.playerId;
};
globalThis.addEventListener('gostop-online-message',event=>{
 const payload=event.detail,adapter=globalThis.goStopOnlineSession;
 if(payload?.type==='connected'&&adapter?.room?.roomCode===payload.roomCode&&
    adapter.room?.seatId===payload.seatId&&adapter.room?.playerId===payload.playerId){
  proven.set(adapter,{roomCode:payload.roomCode,seatId:payload.seatId,playerId:payload.playerId});
 }
});
async function waitForConnection(roomCode,seat,{timeoutMs=12000}={}){
 const code=String(roomCode||''),adapter=globalThis.goStopOnlineSession;
 if(!adapter||adapter.room?.roomCode!==code||adapter.room?.seatId!==seat)
  throw new Error('The intended Competitive game room is no longer active.');
 if(validProof(adapter,code,seat))return true;
 return new Promise((resolve,reject)=>{
  let settled=false;
  const clear=()=>{clearTimeout(timer);adapter.removeEventListener('connected',onConnected);
   adapter.removeEventListener('disconnected',onDisconnected);adapter.removeEventListener('error',onError);};
  const fail=()=>{if(settled)return;settled=true;clear();
   reject(new Error('The Competitive game connection was not verified. No invitation handoff was completed.'));};
  const onConnected=()=>{if(!validProof(adapter,code,seat))return;
   if(settled)return;settled=true;clear();resolve(true);};
  const onDisconnected=()=>{proven.delete(adapter);fail();};
  const onError=()=>fail();
  const timer=setTimeout(fail,timeoutMs);
  adapter.addEventListener('connected',onConnected);
  adapter.addEventListener('disconnected',onDisconnected);
  adapter.addEventListener('error',onError);
  if(validProof(adapter,code,seat))onConnected();
 });
}
globalThis.GoStopDevConnectionProof=Object.freeze({waitForConnection});
})();
