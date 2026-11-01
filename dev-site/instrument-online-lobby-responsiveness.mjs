/* Apply only to the generated DEVELOPMENT ranked client.
 * The tracked ranked-client.js is never modified by this build step.
 */
export function instrumentDevResponsiveLobby(source){
 if(typeof source!=='string'||source.length<50000)throw new TypeError('Expected protected ranked client source.');
 const anchor="  function handleLobbyMessage(message){\n    if(message.type==='connected')";
 if(source.split(anchor).length!==2)throw new Error('Online lobby instrumentation anchor missing or duplicated.');
 const replacement=`  function handleLobbyMessage(message){
    if(message.type==='autoMatchStarted'){
      finishAutoMatchStart();autoMatchSearching=true;syncAutoMatchControls();
      if(!onlinePanel.hidden)$('lobbyStatus').textContent='Finding your closest available match…';
      return;
    }
    if(message.type==='searchError'){
      if(!lobbySearchActive||String(message.query||'')!==$('onlineNicknameSearch').value.trim())return;
      $('lobbyStatus').textContent=message.message||rt('requestFailed');
      $('searchPlayerResults').hidden=true;
      return;
    }
    if(message.type==='searchStarted'){
      if(lobbySearchActive&&String(message.query||'')===$('onlineNicknameSearch').value.trim())
        $('lobbyStatus').textContent=rt('searchingOnline');
      return;
    }
    if(message.type==='connected')`;
 return source.replace(anchor,replacement);
}
