// DEVELOPMENT Cloudflare authority only: create a disposable Friendly room and
// verify the exact anonymous invite and saved-seat resume API without touching
// production rooms, accounts or leaderboards.
const base='https://gostop-authority-dev.jwshin1.workers.dev';
const origin='https://gostop-dev.vercel.app';
const post=async(path,body={})=>{
 const response=await fetch(base+path,{method:'POST',headers:{
  Origin:origin,'content-type':'application/json'
 },body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(path+' returned '+response.status+
  ' '+JSON.stringify(data?.error||data||'non-JSON response').slice(0,180));
 return data.room;
};
const host=await post('/api/rooms');
if(!/^[A-Z2-9]{14}$/.test(host?.roomCode)||!host.credential||host.seatId!=='playerA')
 throw new Error('Friendly host did not receive a valid room/seat');
const joinPath='/api/rooms/'+host.roomCode+'/join';
const guest=await post(joinPath);
if(guest.seatId!=='playerB'||guest.roomCode!==host.roomCode||
  !guest.credential||!guest.matchId)throw new Error('Friend invitation could not join the existing match');
const resumedGuest=await post(joinPath,{credential:guest.credential});
if(resumedGuest.playerId!==guest.playerId||resumedGuest.matchId!==guest.matchId)
 throw new Error('Returning Samsung guest did not reclaim the same player seat');
const resumedHost=await post(joinPath,{credential:host.credential});
if(resumedHost.playerId!==host.playerId)throw new Error('Returning PC host did not reclaim the same player seat');
console.log('PASS development Friendly room create, guest join and both-seat resume for '+host.roomCode);
