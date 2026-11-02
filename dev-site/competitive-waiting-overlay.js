/* Development-only view guard. A match created by /join is NOT evidence
 * that both authenticated people have connected their live game WebSockets.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
let mask=null;
function hide(){if(mask){mask.remove();mask=null;}}
function refresh(snapshot){
 const waiting=!!snapshot?.matchId&&snapshot?.sessionFlow?.rankedMode==='online'&&
  snapshot?.sessionFlow?.waitingForOpponentConnection===true&&!snapshot.sessionFlow.ended;
 if(!waiting){hide();return;}
 if(mask)return;
 const style=document.createElement('style');style.id='devWaitingOpponentStyle';
 if(!document.getElementById(style.id)){
  style.textContent='#devCompetitiveWaiting{position:fixed;inset:76px 0 0;z-index:999900;background:#0c120deb;display:flex;align-items:center;justify-content:center;padding:16px;color:#f8e3bd;font-family:system-ui,sans-serif;text-align:center}'+
   '#devCompetitiveWaiting>div{max-width:420px;padding:24px 20px;border:2px solid #ac8653;border-radius:16px;background:#241811;box-shadow:0 12px 40px #0009}'+
   '#devCompetitiveWaiting h2{font-size:clamp(19px,5vw,26px);margin:0 0 14px}'+
   '#devCompetitiveWaiting p{font-size:15px;line-height:1.55;margin:0}';
  document.head.append(style);
 }
 mask=document.createElement('div');mask.id='devCompetitiveWaiting';
 mask.setAttribute('role','status');mask.setAttribute('aria-live','polite');
 const body=document.createElement('div'),title=document.createElement('h2'),note=document.createElement('p');
 const locale=(document.documentElement.lang||'en').split('-')[0];
 const ko=locale==='ko';
 title.textContent=ko?'상대방 연결 대기 중':'Waiting for opponent to connect';
 note.textContent=ko?'상대방이 실제 게임에 접속할 때까지 카드가 진행되지 않습니다. 필요하면 위의 게임 종료를 누르세요.':
  'Cards will not be played until both players connect to the game. Use Quit Game above to leave the room.';
 body.append(title,note);mask.append(body);document.body.append(mask);
}
globalThis.addEventListener('gostop-online-snapshot',event=>refresh(event.detail?.snapshot));
globalThis.addEventListener('gostop-online-message',event=>{
 if(event.detail?.type==='selfDisconnected')hide();
});
})();
