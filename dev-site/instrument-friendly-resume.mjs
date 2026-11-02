/* Development bundle only. Do not edit frozen app.js.
 * Keep the Friendly room credential after an Android tab is backgrounded or
 * reloaded, and resume the exact same seat rather than silently starting over.
 */
export function instrumentDevFriendlyResume(source){
  if(typeof source!=='string'||source.length<100000)throw new TypeError('Expected frozen app source');
  const before=`      async joinFreeRoom(roomCode){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const status=document.getElementById('freeOnlineStatus')||onlineStatus,adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true});sessionStorage.removeItem(\`gostop-room-\${code}\`);
        const room=await adapter.join(code);await beginOnline(room,{anonymous:true,statusElement:status,adapter});return room;
      },`;
  if(source.split(before).length!==2)throw new Error('Unsafe development Friendly resume instrumentation anchor');
  const after=`      async joinFreeRoom(roomCode){
        const code=String(roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(code))throw new Error('Invalid room link.');
        const status=document.getElementById('freeOnlineStatus')||onlineStatus,adapter=new globalThis.GoStopOnline.OnlineSessionAdapter({anonymous:true});
        // A mobile app switch must not discard the guest's room identity.
        let saved=null;
        try{saved=JSON.parse(sessionStorage.getItem(\`gostop-room-\${code}\`)||'null');}catch(_){}
        let resumed=!!(saved?.roomCode===code&&saved?.credential),room;
        try{room=await adapter.join(code,resumed?saved.credential:undefined);}
        catch(error){
          // Invalidate only a credential that the authority explicitly rejected.
          // Do not fall back to a fresh seat for transient network problems.
          if(!resumed||error?.code!=='INVALID_CREDENTIAL')throw error;
          sessionStorage.removeItem(\`gostop-room-\${code}\`);
          resumed=false;room=await adapter.join(code);
        }
        await beginOnline(room,{anonymous:true,statusElement:status,adapter,resumeExisting:resumed});
        return room;
      },`;
  return source.replace(before,after);
}
