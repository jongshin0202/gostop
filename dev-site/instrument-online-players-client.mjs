/* Generated DEVELOPMENT ranked-client only: fourth Online Players action with
 * server-authoritative presence, skill ranking, ten-player pages and boundaries.
 * Does not alter protected ranked-client.js.
 */
export function instrumentDevOnlinePlayersClient(source){
 const replace=(a,b)=>{
  if(source.split(a).length!==2)throw new Error('Missing or repeated Online Players UI anchor: '+a.slice(0,60));
  source=source.replace(a,b);
 };
 replace('<button id="searchPlayersBtn" type="button">Search Player</button>',
 '<button id="searchPlayersBtn" type="button">Search Player</button><button id="onlinePlayersBtn" type="button">Online Players</button>');
 replace('<p id="lobbyStatus" class="lobby-status" role="status" aria-live="polite"></p>',
  '<section id="onlineRosterSection" class="online-method" hidden><strong id="onlineRosterHeading">Online Players</strong><p class="account-help" id="onlineRosterExplanation">Players online, ranked by skill match. Select Play to send a request.</p><div id="onlinePlayersResults" class="online-player-list"></div><div class="online-match-actions" id="onlineRosterPaging"><button type="button" id="onlineRosterPrev">Previous</button><span id="onlineRosterCount" role="status"></span><button type="button" id="onlineRosterNext">Next</button></div></section><p id="lobbyStatus" class="lobby-status" role="status" aria-live="polite"></p>');
 replace("for(const listId of ['browsePlayerResults','searchPlayerResults'])",
  "for(const listId of ['browsePlayerResults','searchPlayerResults','onlinePlayersResults'])");
 const eventAnchor="  $('browsePlayersBtn').addEventListener('click',()=>{";
 const events=`  let onlineRosterActive=false,onlineRosterOffset=0;
  const onlineRosterLabels={
    en:['Online Players','Online players ranked by skill match. Select Play to send a request.','Previous','Next'],
    ko:['온라인 플레이어','실력 유사도 순으로 정렬한 온라인 플레이어입니다. 플레이 버튼을 눌러 요청하세요.','이전','다음'],
    es:['Jugadores en línea','Jugadores en línea ordenados por similitud. Pulsa Jugar para invitarlos.','Anterior','Siguiente'],
    fr:['Joueurs en ligne','Joueurs classés selon la proximité de niveau. Choisissez Jouer pour les inviter.','Précédent','Suivant'],
    de:['Online-Spieler','Online-Spieler nach Spielstärke sortiert. Mit Spielen anfragen.','Zurück','Weiter'],
    ja:['オンラインプレイヤー','実力の近い順に表示します。対戦は「プレイ」で申し込めます。','前へ','次へ'],
    zh:['在线玩家','按实力相似程度排序，点击“开始”发送对战请求。','上一页','下一页']
  };
  function applyOnlineRosterLanguage(){
    const lang=(document.documentElement.lang||'en').toLowerCase().split('-')[0];
    const strings=onlineRosterLabels[lang]||onlineRosterLabels.en;
    $('onlinePlayersBtn').textContent=$('onlineRosterHeading').textContent=strings[0];
    $('onlineRosterExplanation').textContent=strings[1];
    $('onlineRosterPrev').textContent=strings[2];
    $('onlineRosterNext').textContent=strings[3];
  }
  applyOnlineRosterLanguage();
  new MutationObserver(applyOnlineRosterLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  function closeOnlineRoster(){
    onlineRosterActive=false;$('onlineRosterSection').hidden=true;
    $('onlinePlayersBtn').setAttribute('aria-pressed','false');
  }
  for(const id of ['browsePlayersBtn','searchPlayersBtn','autoMatchBtn','onlineLobbyClose'])
    $(id).addEventListener('click',closeOnlineRoster,{capture:true});
  function requestOnlineRoster(offset){
    onlineRosterOffset=Math.max(0,Math.floor((Number(offset)||0)/10)*10);
    $('lobbyStatus').textContent='Loading online players…';
    sendLobbyMessage({type:'onlinePlayers',offset:onlineRosterOffset});
  }
  $('onlinePlayersBtn').addEventListener('click',()=>{
    browsePlayersActive=false;lobbySearchActive=false;
    const searchSection=onlinePanel.querySelector('[data-online-section="search"]');
    if(searchSection)searchSection.hidden=true;
    $('searchPlayerResults').hidden=true;$('browsePlayerResults').hidden=true;
    onlineRosterActive=true;$('onlineRosterSection').hidden=false;
    $('onlinePlayersBtn').setAttribute('aria-pressed','true');
    requestOnlineRoster(0);
  });
  $('onlineRosterPrev').addEventListener('click',()=>{if(onlineRosterActive)requestOnlineRoster(onlineRosterOffset-10);});
  $('onlineRosterNext').addEventListener('click',()=>{if(onlineRosterActive)requestOnlineRoster(onlineRosterOffset+10);});
`;
 replace(eventAnchor,events+eventAnchor);
 const messageAnchor="    if(message.type==='connected'){";
 const message=`    if(message.type==='onlinePlayers'){
      if(!onlineRosterActive)return;
      const offset=Math.max(0,Number(message.offset)||0),total=Math.max(0,Number(message.total)||0);
      onlineRosterOffset=offset;
      renderPlayers(Array.isArray(message.players)?message.players:[],'onlinePlayersResults');
      $('onlineRosterPrev').disabled=message.hasPrevious!==true;
      $('onlineRosterNext').disabled=message.hasNext!==true;
      $('onlineRosterCount').textContent=total?((offset+1)+'–'+Math.min(total,offset+10)+' / '+total):'0 / 0';
      $('lobbyStatus').textContent='';
      return;
    }
`;
 replace(messageAnchor,message+messageAnchor);
 return source;
}
