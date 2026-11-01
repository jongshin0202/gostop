// Applies only to the GENERATED development ranked-client.js.
// Fail closed if the upstream game UI changes; protected tracked source untouched.
export function instrumentDevCompetitiveLobby(source){
 if(typeof source!=='string'||source.length<50000)throw new Error('Expected ranked-client source');
 let out=source;
 const replaceAllTwo=(from,to)=>{if(out.split(from).length!==3)throw new Error('Unsafe repeated lobby anchor: '+from.slice(0,60));out=out.split(from).join(to);};
 const replace=(from,to)=>{
  if(out.split(from).length!==2)throw new Error('Unsafe lobby instrumentation anchor: '+from.slice(0,60));
  out=out.replace(from,to);
 };
 replace("lobbySearchActive=false,lastLobbyPlayers=[]","lobbySearchActive=false,allOnlineActive=false,onlinePageOffset=0,onlinePageTotal=0,lastLobbyPlayers=[]");
 replace('<button id="searchPlayersBtn" type="button">Search Player</button><span id="onlinePlayerCount"',
  '<button id="searchPlayersBtn" type="button">Search Player</button><button id="allOnlinePlayersBtn" type="button">Online Players</button><span id="onlinePlayerCount"');
 replace('<div id="browsePlayerResults" class="online-player-list" hidden></div></div>',
  '<div id="browsePlayerResults" class="online-player-list" hidden></div><div id="allOnlineResults" class="online-player-list" hidden></div><nav id="allOnlinePagination" aria-label="Online player pages" hidden><button id="onlinePrevPageBtn" type="button">Previous</button><span id="onlinePageLabel"></span><button id="onlineNextPageBtn" type="button">Next</button></nav></div>');
 replace("$('searchPlayersBtn').textContent=rt('searchPlayer');syncNotificationButton();",
  "$('searchPlayersBtn').textContent=rt('searchPlayer');$('allOnlinePlayersBtn').textContent=rankedLocale()==='ko'?'온라인 플레이어':'Online Players';syncNotificationButton();");
 replace("function renderLobbyPresence(players=lastLobbyPlayers,onlineCount=lastLobbyOnlineCount){",
  "function renderLobbyPresence(players=lastLobbyPlayers,onlineCount=lastLobbyOnlineCount){");
 replace("    if(message.type==='socialProfiles'){socialLiveProfiles=",
  `    if(message.type==='presenceCount'){lastLobbyOnlineCount=Math.max(0,Number(message.onlineCount)||0);$('onlinePlayerCount').textContent=rt('totalOnlineCount',{count:lastLobbyOnlineCount});return;}
    if(message.type==='searchError'){if(lobbySearchActive)$('lobbyStatus').textContent=message.message||rt('requestFailed');return;}
    if(message.type==='onlinePlayersPage'){
      if(!allOnlineActive)return;
      onlinePageOffset=Math.max(0,Number(message.offset)||0);
      onlinePageTotal=Math.max(0,Number(message.total)||0);
      const results=$('allOnlineResults'),pager=$('allOnlinePagination');
      results.hidden=false;pager.hidden=false;
      renderPlayers(Array.isArray(message.players)?message.players:[],'allOnlineResults');
      $('onlinePrevPageBtn').disabled=onlinePageOffset===0;
      $('onlineNextPageBtn').disabled=onlinePageOffset+10>=onlinePageTotal;
      $('onlinePageLabel').textContent=onlinePageTotal?String(onlinePageOffset+1)+'–'+String(Math.min(onlinePageOffset+10,onlinePageTotal))+' / '+onlinePageTotal:'0 / 0';
      $('lobbyStatus').textContent='';
      return;
    }
    if(message.type==='socialProfiles'){socialLiveProfiles=`);
 replace("    if(message.type==='searchResults'){if(!lobbySearchActive||autoMatchSearching)return;",
  "    if(message.type==='searchResults'){if(!lobbySearchActive||autoMatchSearching||message.query!==$('onlineNicknameSearch').value.trim())return;");
 replace("if(!autoMatchSearching)$('lobbyStatus').textContent='';return;}\n    if(message.type==='autoMatchCandidate')",
  "if(!autoMatchSearching)$('lobbyStatus').textContent=message.partial?'Checking all player accounts…':'';return;}\n    if(message.type==='autoMatchCandidate')");
 replaceAllTwo("const optimistic={requestId:null,automatic:false,to:",
  "locallyCancelledChallenge=false;const optimistic={requestId:null,automatic:false,to:");
 replaceAllTwo("showOutgoingRequest(optimistic);$('cancelOutgoingRequest').disabled=true;",
  "showOutgoingRequest(optimistic);$('cancelOutgoingRequest').disabled=false;");
 replace("function showOutgoingRequest(message){","let locallyCancelledChallenge=false;\n  function showOutgoingRequest(message){");
 replace("    if(message.type==='challengeSent'){finishAutoMatchStart();",
  "    if(message.type==='challengeSent'&&locallyCancelledChallenge){locallyCancelledChallenge=false;sendLobbyMessage({type:'challengeCancel',requestId:message.requestId});pendingOutgoingRequest=null;closeRequestDialog(outgoingRequestDialog);return;}\n    if(message.type==='challengeSent'){finishAutoMatchStart();");
 replace("    if(!pendingOutgoingRequest)return;const button=$('cancelOutgoingRequest');button.disabled=true;",
  "    if(!pendingOutgoingRequest)return;const button=$('cancelOutgoingRequest');button.disabled=true;\n    if(!pendingOutgoingRequest.requestId&&!pendingOutgoingRequest.automatic)locallyCancelledChallenge=true;\n    const outgoing=pendingOutgoingRequest;pendingOutgoingRequest=null;closeRequestDialog(outgoingRequestDialog);");
 replace("if(pendingOutgoingRequest.requestId){sendLobbyMessage({type:'challengeCancel',requestId:pendingOutgoingRequest.requestId});return;}\n    if(pendingOutgoingRequest.automatic){sendLobbyMessage({type:'autoMatchCancel'});return;}",
  "if(outgoing.requestId){sendLobbyMessage({type:'challengeCancel',requestId:outgoing.requestId});return;}\n    if(outgoing.automatic){sendLobbyMessage({type:'autoMatchCancel'});return;}");
 replace("  $('browsePlayersBtn').addEventListener('click',()=>{browsePlayersActive=true;",
  "  $('browsePlayersBtn').addEventListener('click',()=>{allOnlineActive=false;$('allOnlineResults').hidden=true;$('allOnlinePagination').hidden=true;browsePlayersActive=true;");
 replace("  $('searchPlayersBtn').addEventListener('click',()=>{browsePlayersActive=false;",
  "  $('searchPlayersBtn').addEventListener('click',()=>{allOnlineActive=false;$('allOnlineResults').hidden=true;$('allOnlinePagination').hidden=true;browsePlayersActive=false;");
 replace("  function showAutoMatchView(){",
  "  function showAutoMatchView(){allOnlineActive=false;$('allOnlineResults').hidden=true;$('allOnlinePagination').hidden=true;");
 const anchor="  $('enablePlayNotificationsBtn').addEventListener('click',()=>{void togglePlayNotifications();});";
 replace(anchor,`  $('allOnlinePlayersBtn').addEventListener('click',()=>{
    allOnlineActive=true;browsePlayersActive=false;lobbySearchActive=false;onlinePageOffset=0;
    $('browsePlayerResults').hidden=true;$('searchPlayerResults').hidden=true;
    const search=onlinePanel.querySelector('[data-online-section="search"]');if(search)search.hidden=true;
    $('allOnlineResults').hidden=false;$('allOnlinePagination').hidden=false;
    $('lobbyStatus').textContent='Loading online players…';
    sendLobbyMessage({type:'onlinePlayersPage',offset:0});
  });
  $('onlinePrevPageBtn').addEventListener('click',()=>{
    if(!allOnlineActive||onlinePageOffset===0)return;
    sendLobbyMessage({type:'onlinePlayersPage',offset:Math.max(0,onlinePageOffset-10)});
  });
  $('onlineNextPageBtn').addEventListener('click',()=>{
    if(!allOnlineActive||onlinePageOffset+10>=onlinePageTotal)return;
    sendLobbyMessage({type:'onlinePlayersPage',offset:onlinePageOffset+10});
  });
  `+anchor);
 return out;
}
