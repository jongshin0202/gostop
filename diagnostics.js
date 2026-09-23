(() => {
  'use strict';

  const params=new URLSearchParams(location.search);
  const enabled=location.hostname.endsWith('.vercel.app')||params.get('diag')==='1';
  if(!enabled)return;

  const VERSION='pr45-diag-2';
  const startedAt=Date.now();
  let latestSnapshot=null;
  let latestSnapshotAt=0;
  let lastOnlineMessage=null;
  let lastOnlineMessageAt=0;
  let lastUserAt=Date.now();
  let lastUserType='load';
  let menuVisibleAt=0;
  let lastHandPointer=null;
  let lastHandClick=null;
  let lastHandPointerUp=null;
  let lastRuntimeError=null;
  let attractFailure=null;

  const $=id=>document.getElementById(id);
  const now=()=>Date.now();
  const age=stamp=>stamp?`${((now()-stamp)/1000).toFixed(1)}s ago`:'never';
  const yes=value=>value?'YES':'no';
  const elementLabel=el=>{
    if(!el)return 'none';
    const id=el.id?`#${el.id}`:'';
    const cls=typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/).slice(0,3).join('.') : '';
    return `${el.tagName||el.nodeName}${id}${cls}`;
  };
  const socketLabel=()=>{
    const socket=globalThis.goStopOnlineSession?.socket;
    if(!socket)return 'none';
    return ({0:'CONNECTING',1:'OPEN',2:'CLOSING',3:'CLOSED'})[socket.readyState]||String(socket.readyState);
  };
  const openDialogs=()=>[...document.querySelectorAll('dialog[open]')].map(dialog=>dialog.id||dialog.className||'dialog');

  function nearestCardAt(x,y){
    const cards=[...document.querySelectorAll('#playerHand .hand-card')];
    const direct=cards.find(card=>{const r=card.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
    if(direct)return direct;
    let best=null,bestDistance=Infinity;
    for(const card of cards){
      const r=card.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.hypot(x-cx,y-cy);
      if(d<bestDistance){best=card;bestDistance=d;}
    }
    return bestDistance<100?best:null;
  }

  function eventRecord(event){
    const target=event.target;
    const card=target?.closest?.('#playerHand .hand-card')||nearestCardAt(event.clientX,event.clientY);
    const hand=$('playerHand');
    const handRect=hand?.getBoundingClientRect?.();
    const inHand=!!handRect&&event.clientX>=handRect.left&&event.clientX<=handRect.right&&event.clientY>=handRect.top&&event.clientY<=handRect.bottom;
    if(!card&&!inHand)return null;
    const top=document.elementFromPoint?.(event.clientX,event.clientY)||null;
    return {
      type:event.type,
      at:now(),
      trusted:event.isTrusted,
      x:Math.round(event.clientX),
      y:Math.round(event.clientY),
      eventTarget:elementLabel(target),
      top:elementLabel(top),
      cardId:card?.dataset?.cardId||null,
      cardDisabled:card?.disabled??null,
      ariaDisabled:card?.getAttribute?.('aria-disabled')||null,
      topIsCard:!!card&&(top===card||card.contains(top)||top?.closest?.('.hand-card')===card)
    };
  }

  addEventListener('gostop-online-snapshot',event=>{
    latestSnapshot=event.detail?.snapshot||null;
    latestSnapshotAt=now();
  });
  addEventListener('gostop-online-message',event=>{
    const message=event.detail||{};
    lastOnlineMessage={type:message.type||'unknown',revision:message.revision??message.snapshot?.revision??null,code:message.code||message.error?.code||null};
    lastOnlineMessageAt=now();
  });

  document.addEventListener('pointerdown',event=>{
    if(event.target?.closest?.('#gostopDiagPanel,#gostopDiagToggle'))return;
    if(event.isTrusted){lastUserAt=now();lastUserType='pointerdown';}
    const record=eventRecord(event);if(record)lastHandPointer=record;
  },true);
  document.addEventListener('pointerup',event=>{const record=eventRecord(event);if(record)lastHandPointerUp=record;},true);
  document.addEventListener('click',event=>{const record=eventRecord(event);if(record)lastHandClick=record;},true);
  document.addEventListener('keydown',event=>{
    if(event.target?.closest?.('#gostopDiagPanel,#gostopDiagToggle'))return;
    if(event.isTrusted){lastUserAt=now();lastUserType=`key:${event.key}`;}
  },true);

  addEventListener('error',event=>{lastRuntimeError={at:now(),message:event.message||String(event.error||'error'),source:event.filename||'',line:event.lineno||0};});
  addEventListener('unhandledrejection',event=>{lastRuntimeError={at:now(),message:`unhandledrejection: ${event.reason?.message||String(event.reason)}`};});

  const style=document.createElement('style');
  style.textContent=`
    #gostopDiagToggle{position:fixed;right:10px;bottom:10px;z-index:2147483600;border:1px solid #ffd36b;border-radius:8px;background:#24150d;color:#ffe2a1;padding:8px 10px;font:700 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 5px 20px #0008}
    #gostopDiagPanel{position:fixed;right:10px;bottom:50px;z-index:2147483599;width:min(430px,calc(100vw - 20px));max-height:72vh;overflow:auto;background:#090909f5;color:#e9e9e9;border:1px solid #ffd36b;border-radius:10px;padding:10px;box-shadow:0 10px 30px #000b;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap}
    #gostopDiagPanel[hidden]{display:none}#gostopDiagPanel .diag-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}#gostopDiagPanel button{font:700 11px system-ui,sans-serif;background:#3c2819;color:#fff;border:1px solid #c6954d;border-radius:6px;padding:5px 8px;cursor:pointer}#gostopDiagText{margin:0;white-space:pre-wrap;word-break:break-word}
  `;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.id='gostopDiagToggle';toggle.type='button';toggle.textContent='DIAG';
  const panel=document.createElement('section');panel.id='gostopDiagPanel';panel.hidden=true;panel.innerHTML='<div class="diag-head"><strong>GoStop Runtime Diagnostics</strong><button id="gostopDiagCopy" type="button">Copy Diagnostics</button></div><pre id="gostopDiagText"></pre>';
  document.body.append(toggle,panel);
  toggle.addEventListener('click',event=>{event.stopPropagation();panel.hidden=!panel.hidden;renderPanel();});

  function externalMenuState(){
    const overlay=$('soloStartOverlay'),leaderboard=document.querySelector('.leaderboard-screen'),onlinePanel=$('onlineLobbyPanel');
    const auth=$('accountDialog');
    const visible=!!overlay&&!overlay.hidden;
    if(visible&&!menuVisibleAt)menuVisibleAt=now();
    if(!visible)menuVisibleAt=0;
    const blockers=[];
    if(!visible)blockers.push('main-menu-hidden');
    if(leaderboard&&!leaderboard.hidden)blockers.push('leaderboard-visible');
    if(onlinePanel&&!onlinePanel.hidden)blockers.push('online-panel-visible');
    if(auth?.open)blockers.push('auth-dialog-open');
    const success=[...document.querySelectorAll('dialog.gostop-account-dialog[open]')].filter(d=>d!==auth);
    if(success.length)blockers.push('account-success-dialog-open');
    if(document.querySelector('dialog.gostop-request-dialog[open]'))blockers.push('request-dialog-open');
    return {visible,leaderboardHidden:!leaderboard||leaderboard.hidden,blockers,eligible:blockers.length===0};
  }

  function cardState(){
    const cards=[...document.querySelectorAll('#playerHand .hand-card')];
    const disabled=cards.filter(card=>card.disabled);
    let centerProbe=null;
    const probe=cards[0];
    if(probe){const r=probe.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint?.(x,y);centerProbe={cardId:probe.dataset.cardId,top:elementLabel(top),topIsCard:top===probe||probe.contains(top)||top?.closest?.('.hand-card')===probe};}
    return {count:cards.length,disabled:disabled.length,enabled:cards.length-disabled.length,centerProbe};
  }

  function diagnoseBlockers(){
    const s=latestSnapshot?.state||{},session=globalThis.goStopOnlineSession,flow=latestSnapshot?.sessionFlow||{};
    const card=cardState(),reasons=[];
    if(card.count&&card.disabled===card.count)reasons.push('ALL_HAND_BUTTONS_DISABLED');
    if(!session)reasons.push('NO_ONLINE_SESSION');
    if(socketLabel()!=='OPEN')reasons.push(`SOCKET_${socketLabel()}`);
    if(session?.pendingActionId)reasons.push('PENDING_ACTION_ID');
    if(latestSnapshot&&s.turn!==latestSnapshot.seatId)reasons.push('NOT_VIEWER_TURN');
    if(s.pendingTurn)reasons.push(`PENDING_TURN:${s.pendingTurn.phase||'yes'}`);
    if(s.pendingDecision)reasons.push(`PENDING_DECISION:${s.pendingDecision.type||'yes'}`);
    if(flow.ended)reasons.push('FLOW_ENDED');
    if(flow.replayReady?.you)reasons.push('REPLAY_READY');
    if(flow.newGameRequest)reasons.push('NEW_GAME_REQUEST');
    if(lastHandPointer&&lastHandPointer.cardId&&!lastHandPointer.topIsCard)reasons.push('CARD_OCCLUDED_AT_LAST_POINTER');
    if(lastHandPointer&&(!lastHandClick||lastHandClick.at<lastHandPointer.at)&&now()-lastHandPointer.at>500)reasons.push('POINTERDOWN_WITHOUT_CLICK');
    return reasons;
  }

  function formatRecord(record){
    if(!record)return 'none';
    return `${record.type} ${age(record.at)} card=${record.cardId||'none'} disabled=${record.cardDisabled} target=${record.eventTarget} top=${record.top} topIsCard=${record.topIsCard}`;
  }

  function buildText(){
    const menu=externalMenuState(),card=cardState(),session=globalThis.goStopOnlineSession,s=latestSnapshot?.state||{},flow=latestSnapshot?.sessionFlow||{};
    const idleFrom=Math.max(lastUserAt,menuVisibleAt||0),idleMs=menu.visible?Math.max(0,now()-idleFrom):0;
    if(menu.eligible&&menu.leaderboardHidden&&idleMs>=10500&&!attractFailure)attractFailure={at:now(),idleMs,blockers:[...menu.blockers]};
    const blockers=diagnoseBlockers();
    return [
      `${VERSION}  host=${location.hostname}`,
      `uptime=${((now()-startedAt)/1000).toFixed(1)}s  runtimeError=${lastRuntimeError?lastRuntimeError.message:'none'}`,
      `rankedBootComplete=${yes(!!globalThis.__gostopRankedBootComplete)} rankedApi=${yes(!!globalThis.GoStopRanked)} savedToken=${yes(!!localStorage.getItem('gostop-auth-token'))} savedAccountCache=${yes(!!localStorage.getItem('gostop-account-cache'))} account=${globalThis.GoStopRanked?.getAccount?.()?.nickname||'none'}`,
      '',
      'CARD INPUT',
      `hand cards=${card.count} enabled=${card.enabled} disabled=${card.disabled}`,
      `session=${yes(!!session)} socket=${socketLabel()} pendingActionId=${session?.pendingActionId||'none'}`,
      `snapshot=${latestSnapshot?`rev ${latestSnapshot.revision}`:'none'} age=${age(latestSnapshotAt)} seat=${latestSnapshot?.seatId||'none'} turn=${s.turn||'none'} winner=${s.winner||'none'}`,
      `legalActions=${JSON.stringify(s.legalActions||[])} openingComplete=${String(s.openingSpecialsComplete)}`,
      `pendingTurn=${s.pendingTurn?.phase||'none'} actor=${s.pendingTurn?.actorId||'none'} pendingDecision=${s.pendingDecision?.type||'none'} owner=${s.pendingDecision?.playerId||'none'}`,
      `flow ended=${!!flow.ended} replayReady=${!!flow.replayReady?.you} newGameRequest=${!!flow.newGameRequest}`,
      `openDialogs=${JSON.stringify(openDialogs())}`,
      `centerProbe=${card.centerProbe?JSON.stringify(card.centerProbe):'none'}`,
      `last pointer: ${formatRecord(lastHandPointer)}`,
      `last pointerup: ${formatRecord(lastHandPointerUp)}`,
      `last click: ${formatRecord(lastHandClick)}`,
      `last online message=${lastOnlineMessage?JSON.stringify(lastOnlineMessage):'none'} (${age(lastOnlineMessageAt)})`,
      `candidate blockers=${blockers.length?blockers.join(', '):'NONE DETECTED'}`,
      '',
      'ATTRACT MODE',
      `mainMenuVisible=${menu.visible} eligible=${menu.eligible} blockers=${menu.blockers.length?menu.blockers.join(', '):'none'}`,
      `leaderboardHidden=${menu.leaderboardHidden} idle=${(idleMs/1000).toFixed(1)}s expected=7.0s`,
      `lastUser=${lastUserType} ${age(lastUserAt)} menuVisibleSince=${menuVisibleAt?age(menuVisibleAt):'not visible'}`,
      `attractFailureSeen=${yes(!!attractFailure)}${attractFailure?` at idle ${(attractFailure.idleMs/1000).toFixed(1)}s`:''}`,
      '',
      `URL=${location.href}`
    ].join('\n');
  }

  function renderPanel(){const text=$('gostopDiagText');if(text)text.textContent=buildText();}
  $('gostopDiagCopy').addEventListener('click',async event=>{
    event.stopPropagation();const text=buildText();
    try{await navigator.clipboard.writeText(text);event.currentTarget.textContent='Copied';setTimeout(()=>event.currentTarget.textContent='Copy Diagnostics',1200);}catch(_){const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
  });

  setInterval(()=>{externalMenuState();if(!panel.hidden)renderPanel();else buildText();},250);
  console.info('[GoStop diagnostics]',VERSION,'enabled');
})();
