'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const baseUrl='';
  const authorityLabel=`${location.origin}/api/admin → Cloudflare authority`;
  const TOKEN_KEY='gostop-admin-token';
  let token=sessionStorage.getItem(TOKEN_KEY)||'',currentView='overview',currentExport=[],currentExportName='admin-export';

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const fmt=value=>Number(value||0).toLocaleString();
  const pct=value=>`${(Number(value||0)*100).toFixed(1)}%`;
  const date=value=>value?new Date(value).toLocaleString():'—';
  const mono=value=>`<span class="mono">${esc(value||'—')}</span>`;
  const pill=(text,kind='')=>`<span class="pill ${kind}">${esc(text)}</span>`;

  async function api(path,{method='GET',body}={}){
    const response=await fetch(`${baseUrl}/api/admin${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    let data={};try{data=await response.json();}catch(_){}
    if(!response.ok||data.ok===false){const error=new Error(data?.error?.message||`Request failed (${response.status})`);error.code=data?.error?.code;error.status=response.status;throw error;}
    return data;
  }
  function queryRange(){
    const params=new URLSearchParams(),from=$('filterFrom').value,to=$('filterTo').value;
    if(from)params.set('from',new Date(from).toISOString());if(to)params.set('to',new Date(to).toISOString());
    return params;
  }
  const appendRange=params=>{const range=queryRange();for(const [k,v] of range)params.set(k,v);return params;};
  function table(headers,rows){
    if(!rows.length)return '<div class="empty">No records found.</div>';
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function setExport(name,rows){currentExportName=name;currentExport=rows||[];}
  function exportCsv(){
    if(!currentExport.length){alert('There is no table data to export.');return;}
    const keys=[...new Set(currentExport.flatMap(row=>Object.keys(row)))],quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const csv=[keys.map(quote).join(','),...currentExport.map(row=>keys.map(key=>quote(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(','))].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${currentExportName}.csv`;a.click();URL.revokeObjectURL(url);
  }
  function setBusy(busy){$('refreshBtn').disabled=busy;$('serverStatus').textContent=busy?'● Loading…':'● Connected';}
  function fail(error){$('serverStatus').textContent='● Error';$('serverStatus').style.color='#ff8f8f';console.error(error);alert(error.message||String(error));}
  function resetStatus(){$('serverStatus').style.color='';}
  function showFailureDialog(error,message){
    const finalMessage=message||error?.message||'Admin connection failed.',code=error?.code||'NETWORK_OR_UNKNOWN',status=error?.status||'—',server=authorityLabel;
    $('failureMessage').textContent=finalMessage;
    $('failureCode').textContent=code;
    $('failureStatus').textContent=status;
    $('failureServer').textContent=authorityLabel;
    $('loginError').textContent=`${finalMessage} [${code} / HTTP ${status}] Server: ${server}`;
    $('failureOverlay').hidden=false;
  }

  async function authenticate(){
    if(!token){$('loginError').textContent='Enter the admin token.';return false;}
    const button=$('openDashboardBtn');button.disabled=true;button.textContent='Connecting…';$('loginError').textContent='Connecting securely to the GoStop authority…';
    try{await api('/health');$('adminLogin').hidden=true;$('adminApp').hidden=false;$('loginError').textContent='';resetStatus();await selectView(currentView);return true;}
    catch(error){
      sessionStorage.removeItem(TOKEN_KEY);token='';$('adminLogin').hidden=false;$('adminApp').hidden=true;
      const message=error?.code==='ADMIN_AUTH_REQUIRED'||error?.status===401
        ?'Admin token rejected. Enter the exact value currently stored in Cloudflare as ADMIN_TOKEN.'
        :error?.code==='ADMIN_NOT_CONFIGURED'||error?.status===503
          ?'ADMIN_TOKEN is not active on the Cloudflare Worker yet. Save/deploy the secret in Cloudflare and try again.'
          :error?.code==='ADMIN_ORIGIN_NOT_ALLOWED'||error?.status===403
            ?'This admin page origin is not allowed by the Cloudflare Worker.'
            :error?.name==='TypeError'
              ?'The browser could not reach the GoStop authority. This usually means a network, CORS, or Worker routing problem.'
              :(error?.message||'Could not connect to the admin server.');
      $('loginError').textContent=message;showFailureDialog(error,message);return false;
    }
    finally{button.disabled=false;button.textContent='Open Dashboard';}
  }

  const metricCard=(label,value,sub='')=>`<div class="metric"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div>`;

  async function loadOverview(){
    setBusy(true);try{
      const params=appendRange(new URLSearchParams()),[data,top,abandons]=await Promise.all([api(`/overview?${params}`),api(`/rankings?${appendRange(new URLSearchParams({metric:'wins',limit:'10'}))}`),api(`/rankings?${appendRange(new URLSearchParams({metric:'abandons',limit:'10'}))}`)]);
      $('overviewCards').innerHTML=[
        metricCard('Players',fmt(data.players.total),`${fmt(data.players.new)} new in range`),
        metricCard('Games',fmt(data.games.total),`${fmt(data.games.solo)} Solo · ${fmt(data.games.online)} Online`),
        metricCard('Forced abandons',fmt(data.games.abandoned),`${fmt(data.games.completed)} completed`),
        metricCard('Active sessions',fmt(data.games.activeSessions),'Server-side ranked sessions'),
        metricCard('Coins in circulation',fmt(data.coins.inCirculation),'All player Wallets'),
        metricCard('Daily Coins awarded',fmt(data.coins.dailyAwarded),`${fmt(data.coins.dailyAwards)} awards in range`),
        metricCard('Suspended players',fmt(data.players.suspended),'Admin controlled'),
        metricCard('Completion rate',data.games.total?pct(data.games.completed/data.games.total):'—','Completed / all recorded games')
      ].join('');
      const rankRows=top.rankings.map(r=>`<tr><td class="number">${r.rank}</td><td><button class="clickable" data-player="${esc(r.accountId)}">${esc(r.nickname)}</button></td><td class="number">${fmt(r.wins)}</td><td class="number">${fmt(r.games)}</td><td class="number">${pct(r.winRate)}</td></tr>`);
      $('overviewTopPlayers').innerHTML=table(['#','Player','Wins','Games','Win Rate'],rankRows);
      const abandonRows=abandons.rankings.map(r=>`<tr><td class="number">${r.rank}</td><td><button class="clickable" data-player="${esc(r.accountId)}">${esc(r.nickname)}</button></td><td class="number">${fmt(r.abandons)}</td><td class="number">${pct(r.abandonRate)}</td><td class="number">${fmt(r.coinsLost)}</td></tr>`);
      $('overviewTopAbandons').innerHTML=table(['#','Player','Abandons','Rate','Coins Lost'],abandonRows);
      setExport('overview-top-players',top.rankings);
    }finally{setBusy(false);}
  }

  function playerRows(players){return players.map(p=>{
    const location=[p.location?.city,p.location?.region||p.location?.regionCode,p.location?.countryCode].filter(Boolean).join(', ')||'—';
    return `<tr><td><button class="clickable" data-player="${esc(p.id)}">${esc(p.nickname)}</button><br><span class="muted">${esc(p.email)}</span></td><td class="number">${fmt(p.walletCoins)}</td><td class="number">${fmt(p.stats?.global?.gamesPlayed)}</td><td class="number">${fmt(p.stats?.global?.wins)}</td><td class="number">${fmt(p.forceQuits)}</td><td>${esc(location)}</td><td>${p.lastConnection?.ip?mono(p.lastConnection.ip):'—'}</td><td>${p.suspended?pill('Suspended','bad'):pill('Active','good')}</td><td class="nowrap">${date(p.createdAt)}</td></tr>`;
  });}
  async function loadPlayers(){
    const params=new URLSearchParams({limit:'500',sort:$('playerSort').value,dir:'desc'});appendRange(params);if($('playerSearch').value.trim())params.set('q',$('playerSearch').value.trim());
    setBusy(true);try{const data=await api(`/players?${params}`);$('playersTable').innerHTML=table(['Player','Wallet','Games','Wins','Abandons','Location','Latest IP','Status','Created'],playerRows(data.players));setExport('players',data.players);}finally{setBusy(false);}
  }

  function gameRows(games){return games.map(g=>{
    const names=g.participants?.length?g.participants.map(p=>p.nickname||p.accountId).join(' vs '):[g.account?.nickname,g.opponent?.nickname|| (g.mode==='solo'?'Computer':null)].filter(Boolean).join(' vs ');
    const status=g.type==='abandoned'?pill('Abandoned','bad'):pill('Completed','good');
    return `<tr><td><button class="clickable" data-game="${esc(g.gameId)}">${esc(g.gameId)}</button></td><td>${status}</td><td>${pill(g.mode||'unknown')}</td><td>${esc(names||'—')}</td><td class="number">${fmt(g.finalPoints)}</td><td class="number">${fmt(g.penaltyCoins)}</td><td>${esc(g.reason||g.settlementType||'—')}</td><td>${g.hasHistory?pill('Full','good'):pill('Legacy','warn')}</td><td class="nowrap">${date(g.recordedAt)}</td></tr>`;
  });}
  async function loadGames(kind=''){
    const params=new URLSearchParams({limit:'500'});appendRange(params);if(kind)params.set('kind',kind);
    const search=kind==='abandoned'?$('abandonSearch').value:$('gameSearch').value,mode=kind==='abandoned'?$('abandonMode').value:$('gameMode').value;if(search.trim())params.set('player',search.trim());if(mode)params.set('mode',mode);
    setBusy(true);try{const data=await api(`/games?${params}`),target=kind==='abandoned'?'abandonedTable':'gamesTable';$(target).innerHTML=table(['Game ID','Status','Mode','Players','Points','Coins Lost','Reason','History','Recorded'],gameRows(data.games));setExport(kind==='abandoned'?'abandoned-games':'games',data.games);}finally{setBusy(false);}
  }

  async function loadRankings(){
    const params=new URLSearchParams({metric:$('rankingMetric').value,limit:'250'});appendRange(params);if($('rankingMode').value)params.set('mode',$('rankingMode').value);if($('rankingCountry').value.trim())params.set('country',$('rankingCountry').value.trim());if($('rankingRegion').value.trim())params.set('region',$('rankingRegion').value.trim());if($('rankingCity').value.trim())params.set('city',$('rankingCity').value.trim());
    setBusy(true);try{const data=await api(`/rankings?${params}`);const rows=data.rankings.map(r=>`<tr><td class="number">${r.rank}</td><td><button class="clickable" data-player="${esc(r.accountId)}">${esc(r.nickname)}</button></td><td class="number">${fmt(r.games)}</td><td class="number">${fmt(r.wins)}</td><td class="number">${pct(r.winRate)}</td><td class="number">${fmt(r.points)}</td><td class="number">${fmt(r.coinsWon)}</td><td class="number">${fmt(r.coinsLost)}</td><td class="number">${fmt(r.netCoins)}</td><td class="number">${fmt(r.abandons)}</td><td class="number">${pct(r.abandonRate)}</td></tr>`);$('rankingsTable').innerHTML=table(['#','Player','Games','Wins','Win Rate','Points','Coins Won','Coins Lost','Net Coins','Abandons','Abandon Rate'],rows);setExport(`rankings-${data.metric}`,data.rankings);}finally{setBusy(false);}
  }

  const leaderboardRows=rows=>rows.slice(0,250).map(r=>`<tr><td class="number">${r.rank}</td><td><button class="clickable" data-player="${esc(r.accountId)}">${esc(r.nickname)}</button></td><td class="number">${Number(r.score||0).toFixed(2)}</td><td class="number">${fmt(r.gamesPlayed)}</td><td class="number">${fmt(r.wins)}</td><td class="number">${fmt(r.totalCoinsWon)}</td></tr>`);
  async function loadLeaderboards(){
    const month=$('leaderboardMonth').value||new Date().toISOString().slice(0,7);$('leaderboardMonth').value=month;
    setBusy(true);try{const data=await api(`/leaderboards?month=${encodeURIComponent(month)}`);$('globalLeaderboard').innerHTML=table(['#','Player','Score','Games','Wins','Coins Won'],leaderboardRows(data.global));$('monthlyTitle').textContent=`Monthly — ${data.month}`;$('monthlyLeaderboard').innerHTML=table(['#','Player','Score','Games','Wins','Coins Won'],leaderboardRows(data.monthly));setExport(`leaderboard-${data.month}`,data.monthly);}finally{setBusy(false);}
  }

  async function loadSessions(){
    const params=new URLSearchParams({limit:'500'});appendRange(params);if($('sessionStatus').value)params.set('status',$('sessionStatus').value);
    setBusy(true);try{const data=await api(`/sessions?${params}`);const rows=data.sessions.map(s=>`<tr><td>${mono(s.id)}</td><td>${pill(s.mode||'unknown')}</td><td>${(s.accountIds||[]).map(mono).join('<br>')}</td><td>${s.endedAt?pill('Ended'):pill('Active','good')}</td><td>${date(s.startedAt)}</td><td>${date(s.endedAt)}</td><td><pre class="json">${esc(JSON.stringify(s.summary||{},null,2))}</pre></td></tr>`);$('sessionsTable').innerHTML=table(['Session','Mode','Accounts','Status','Started','Ended','Summary'],rows);setExport('sessions',data.sessions);}finally{setBusy(false);}
  }
  async function loadGeography(){
    const params=appendRange(new URLSearchParams());setBusy(true);try{const data=await api(`/geography?${params}`);
      const aggRows=rows=>rows.map(r=>`<tr><td>${esc(r.key)}</td><td class="number">${fmt(r.accounts)}</td><td class="number">${fmt(r.connections)}</td><td>${date(r.lastSeen)}</td></tr>`);
      $('geoCountries').innerHTML=table(['Country','Accounts','Connections','Last Seen'],aggRows(data.countries));
      $('geoRegions').innerHTML=table(['State / Region','Accounts','Connections','Last Seen'],aggRows(data.regions));
      $('geoCities').innerHTML=table(['City','Accounts','Connections','Last Seen'],aggRows(data.cities));
      const ipRows=data.ips.map(r=>`<tr><td>${mono(r.ip)}</td><td class="number">${fmt(r.accounts)}</td><td class="number">${fmt(r.connections)}</td><td>${esc(r.cities.join(', ')||'—')}</td><td>${esc(r.regions.join(', ')||'—')}</td><td>${esc(r.countries.join(', ')||'—')}</td><td>${r.accountIds.map(id=>`<button class="clickable" data-player="${esc(id)}">${esc(id)}</button>`).join('<br>')}</td><td>${date(r.lastSeen)}</td></tr>`);
      $('geoIps').innerHTML=table(['IP','Accounts','Connections','Cities','States','Countries','Player IDs','Last Seen'],ipRows);setExport('geography-ip',data.ips);
    }finally{setBusy(false);}
  }
  async function loadAbuse(){
    const params=appendRange(new URLSearchParams());setBusy(true);try{const data=await api(`/abuse?${params}`);
      const abandonRows=data.highAbandonPlayers.map(r=>`<tr><td><button class="clickable" data-player="${esc(r.accountId)}">${esc(r.nickname)}</button></td><td class="number">${fmt(r.abandons)}</td><td class="number">${pct(r.abandonRate)}</td><td class="number">${fmt(r.games)}</td><td class="number">${fmt(r.coinsLost)}</td><td>${esc([r.location?.city,r.location?.region||r.location?.regionCode,r.location?.countryCode].filter(Boolean).join(', ')||'—')}</td></tr>`);
      $('abuseAbandons').innerHTML=table(['Player','Abandons','Rate','Games','Coins Lost','Location'],abandonRows);
      const ipRows=data.sharedIps.map(r=>`<tr><td>${mono(r.ip)}</td><td class="number">${fmt(r.accounts)}</td><td class="number">${fmt(r.connections)}</td><td>${r.accountIds.map(id=>`<button class="clickable" data-player="${esc(id)}">${esc(id)}</button>`).join('<br>')}</td><td>${esc(r.cities.join(', ')||'—')}</td><td>${date(r.lastSeen)}</td></tr>`);
      $('abuseIps').innerHTML=table(['IP','Accounts','Connections','Player IDs','Cities','Last Seen'],ipRows);setExport('abuse-signals',[...data.highAbandonPlayers,...data.sharedIps]);
    }finally{setBusy(false);}
  }
  async function loadSystem(){
    setBusy(true);try{const [health,data]=await Promise.all([api('/health'),api('/system')]),s=data.storage;
      $('systemCards').innerHTML=[metricCard('Players',fmt(s.players)),metricCard('Games',fmt(s.games)),metricCard('Active sessions',fmt(s.activeSessions)),metricCard('Stored connections',fmt(s.connections)),metricCard('Audit records',fmt(s.auditRecords)),metricCard('Leaderboard archives',fmt(s.leaderboardArchives))].join('');
      $('systemJson').textContent=JSON.stringify({worker:health,accountStore:data},null,2);setExport('system-health',[{...s,generatedAt:data.generatedAt}]);
    }finally{setBusy(false);}
  }

  async function loadAudit(){
    setBusy(true);try{const data=await api('/audit?limit=1000');const rows=data.audit.map(a=>`<tr><td>${date(a.createdAt)}</td><td>${pill(a.action)}</td><td>${mono(a.target)}</td><td>${esc(a.reason)}</td><td>${a.actor?.ip?mono(a.actor.ip):'—'}</td><td>${esc([a.actor?.city,a.actor?.region,a.actor?.countryCode].filter(Boolean).join(', ')||'—')}</td><td><button class="clickable" data-audit="${esc(a.id)}" data-audit-json="${encodeURIComponent(JSON.stringify(a))}">View</button></td></tr>`);$('auditTable').innerHTML=table(['Time','Action','Target','Reason','Admin IP','Location','Detail'],rows);setExport('admin-audit',data.audit);}finally{setBusy(false);}
  }

  async function selectView(view){
    currentView=view;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));document.querySelectorAll('#adminNav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));$('viewTitle').textContent=({overview:'Overview',players:'All Players',games:'All Games',abandoned:'Forcefully Abandoned Games',rankings:'Player Rankings',leaderboards:'Leaderboards',sessions:'Game Sessions',geography:'Geography / IP',abuse:'Fraud / Abuse Signals',system:'System Health',audit:'Admin Audit Log'})[view]||view;
    try{resetStatus();if(view==='overview')await loadOverview();else if(view==='players')await loadPlayers();else if(view==='games')await loadGames();else if(view==='abandoned')await loadGames('abandoned');else if(view==='rankings')await loadRankings();else if(view==='leaderboards')await loadLeaderboards();else if(view==='sessions')await loadSessions();else if(view==='geography')await loadGeography();else if(view==='abuse')await loadAbuse();else if(view==='system')await loadSystem();else if(view==='audit')await loadAudit();}catch(error){fail(error);}
  }

  function detailBoxes(items){return `<div class="detail-grid">${items.map(([label,value])=>`<div class="detail-box"><span>${esc(label)}</span><strong>${value}</strong></div>`).join('')}</div>`;}
  async function showPlayer(id){
    try{
      const data=await api(`/players/${encodeURIComponent(id)}`),p=data.player;$('detailTitle').textContent=`${p.nickname} — Player`;
      const loc=[p.location?.city,p.location?.region,p.location?.countryCode].filter(Boolean).join(', ')||'—';
      const controls=`<div class="detail-actions"><button class="secondary" data-admin-action="wallet" data-id="${esc(id)}">Adjust Wallet</button><button class="secondary" data-admin-action="profile" data-id="${esc(id)}">Edit Profile</button><button class="${p.suspended?'secondary':'danger'}" data-admin-action="suspend" data-id="${esc(id)}" data-suspended="${p.suspended?'1':'0'}">${p.suspended?'Unsuspend':'Suspend'}</button><button class="danger" data-admin-action="disconnect" data-id="${esc(id)}">Reset Disconnect Allowance</button><button class="danger" data-admin-action="player-global" data-id="${esc(id)}">Reset Player Global</button><button class="danger" data-admin-action="player-month" data-id="${esc(id)}">Reset Player Month</button></div>`;
      const connections=data.connections.map(x=>`<tr><td>${date(x.recordedAt)}</td><td>${mono(x.ip)}</td><td>${esc(x.city||'—')}</td><td>${esc(x.region||x.regionCode||'—')}</td><td>${esc(x.countryCode||'—')}</td><td>${esc(x.timeZone||'—')}</td><td>${esc(x.kind||'—')}</td></tr>`);
      const ledger=data.ledger.map(x=>`<tr><td>${date(x.createdAt)}</td><td>${pill(x.type||'unknown')}</td><td class="number">${Number(x.amount)>0?'+':''}${fmt(x.amount)}</td><td>${mono(x.gameId||'')}</td><td>${esc(x.reason||'')}</td></tr>`);
      $('detailBody').innerHTML=detailBoxes([['Account',mono(p.id)],['Email',esc(p.email)],['Wallet',`${fmt(p.walletCoins)} Coins`],['Games',fmt(p.stats?.global?.gamesPlayed)],['Wins',fmt(p.stats?.global?.wins)],['Forced abandons',fmt(p.forceQuits)],['Location',esc(loc)],['Latest IP',mono(p.lastConnection?.ip)],['Status',p.suspended?pill('Suspended','bad'):pill('Active','good')]])+controls+`<h3 class="subheading">Connection / IP History</h3>${table(['Time','IP','City','State / Region','Country','Timezone','Event'],connections)}<h3 class="subheading">Coin Ledger</h3>${table(['Time','Type','Amount','Game','Reason'],ledger)}<h3 class="subheading">Games</h3>${table(['Game ID','Status','Mode','Players','Points','Coins Lost','Reason','History','Recorded'],gameRows(data.games))}<h3 class="subheading">Raw Admin Player Record</h3><pre class="json">${esc(JSON.stringify(p,null,2))}</pre>`;
      $('detailDialog').showModal();
    }catch(error){fail(error);}
  }
  async function showGame(id){
    try{
      const data=await api(`/games/${encodeURIComponent(id)}`),g=data.game;$('detailTitle').textContent=`${id} — Game`;
      const type=g.type==='abandonment'?'Abandoned':'Completed',names=g.participants?.length?g.participants.map(x=>x.nickname||x.accountId).join(' vs '):[g.account?.nickname,g.opponent?.nickname|| (g.mode==='solo'?'Computer':null)].filter(Boolean).join(' vs ');
      $('detailBody').innerHTML=detailBoxes([['Type',type==='Abandoned'?pill(type,'bad'):pill(type,'good')],['Mode',pill(g.mode||'unknown')],['Players',esc(names||'—')],['Final / Fair Points',fmt(g.finalPoints??g.fairPoints)],['Penalty Coins',fmt(g.penaltyCoins)],['Reward Coins',fmt(g.opponentRewardCoins)],['Recorded',date(g.recordedAt)],['Session',mono(g.sessionId)],['Settlement',esc(g.settlementType||'normal')]])+`<div class="detail-actions"><button class="danger" data-admin-action="game-correct" data-id="${esc(id)}">Correct Game / Wallets</button></div><h3 class="subheading">Settlement</h3><pre class="json">${esc(JSON.stringify({scores:g.scores,settlementReasons:g.settlementReasons,formulaSteps:g.formulaSteps,participants:g.participants,account:g.account,opponent:g.opponent,adminOverride:g.adminOverride,adminCorrections:g.adminCorrections},null,2))}</pre><h3 class="subheading">Authoritative Game History</h3><pre class="json">${esc(JSON.stringify(g.history||{message:'Legacy game — detailed authoritative history was not retained before Admin Dashboard persistence.'},null,2))}</pre>`;
      $('detailDialog').showModal();
    }catch(error){fail(error);}
  }

  function actionPrompt({title,fields=[],danger=true}){
    return new Promise(resolve=>{
      $('actionTitle').textContent=title;$('actionReason').value='';$('actionError').textContent='';
      $('actionFields').innerHTML=fields.map(f=>`<label>${esc(f.label)}${f.type==='textarea'? `<textarea rows="${f.rows||5}" name="${esc(f.name)}" placeholder="${esc(f.placeholder||'')}">${esc(f.value??'')}</textarea>`:`<input name="${esc(f.name)}" type="${esc(f.type||'text')}" value="${esc(f.value??'')}" placeholder="${esc(f.placeholder||'')}">`}</label>`).join('');
      $('actionConfirm').className=danger?'danger':'primary';$('actionConfirm').textContent='Confirm';
      const dialog=$('actionDialog'),form=$('actionForm');
      const close=()=>{form.removeEventListener('submit',submit);dialog.removeEventListener('close',closed);};
      const closed=()=>{close();resolve(null);};
      const submit=event=>{event.preventDefault();const submitter=event.submitter;if(submitter?.value==='cancel'){dialog.close();return;}const reason=$('actionReason').value.trim();if(reason.length<3){$('actionError').textContent='A reason is required.';return;}const data=Object.fromEntries(new FormData(form));delete data.reason;data.reason=reason;close();dialog.close();resolve(data);};
      form.addEventListener('submit',submit);dialog.addEventListener('close',closed,{once:true});dialog.showModal();
    });
  }
  async function adminAction(kind,id,button){
    try{
      if(kind==='wallet'){const form=await actionPrompt({title:'Adjust Wallet Coins',fields:[{name:'delta',label:'Coin adjustment (+ or -)',type:'number'}]});if(!form)return;await api(`/players/${encodeURIComponent(id)}/wallet`,{method:'POST',body:{delta:Number(form.delta),reason:form.reason}});await showPlayer(id);}
      else if(kind==='profile'){const data=await api(`/players/${encodeURIComponent(id)}`),p=data.player,form=await actionPrompt({title:'Edit Player Profile',fields:[{name:'nickname',label:'Nickname',value:p.nickname},{name:'email',label:'Email',type:'email',value:p.email}]});if(!form)return;await api(`/players/${encodeURIComponent(id)}/profile`,{method:'POST',body:{nickname:form.nickname,email:form.email,reason:form.reason}});await showPlayer(id);}
      else if(kind==='suspend'){const suspended=button.dataset.suspended!=='1',form=await actionPrompt({title:suspended?'Suspend Player':'Unsuspend Player',fields:suspended?[{name:'suspensionReason',label:'Suspension reason'}]:[]});if(!form)return;await api(`/players/${encodeURIComponent(id)}/profile`,{method:'POST',body:{suspended,suspensionReason:form.suspensionReason,reason:form.reason}});await showPlayer(id);}
      else if(kind==='disconnect'){const month=new Date().toISOString().slice(0,7),form=await actionPrompt({title:'Reset Monthly Disconnect Allowance',fields:[{name:'month',label:'Month (YYYY-MM)',value:month}]});if(!form)return;await api(`/players/${encodeURIComponent(id)}/disconnect-reset`,{method:'POST',body:{month:form.month,reason:form.reason}});await showPlayer(id);}
      else if(kind==='player-global'||kind==='player-month'){const month=$('leaderboardMonth').value||new Date().toISOString().slice(0,7),form=await actionPrompt({title:kind==='player-global'?'Reset Player Global Leaderboard':'Reset Player Monthly Leaderboard',fields:kind==='player-month'?[{name:'month',label:'Month',type:'month',value:month}]:[]});if(!form)return;await api('/leaderboards/reset',{method:'POST',body:{scope:kind,accountId:id,month:form.month||month,reason:form.reason}});await showPlayer(id);}
      else if(kind==='game-correct'){const form=await actionPrompt({title:'Correct Game',fields:[{name:'patch',label:'Game field patch JSON',type:'textarea',placeholder:'{"finalPoints":5}'},{name:'wallet',label:'Wallet adjustments JSON array',type:'textarea',placeholder:'[{"accountId":"acct_...","delta":13}]'}]});if(!form)return;let patch={},walletAdjustments=[];try{patch=form.patch.trim()?JSON.parse(form.patch):{};walletAdjustments=form.wallet.trim()?JSON.parse(form.wallet):[];}catch(_){throw new Error('Correction JSON is invalid.');}await api(`/games/${encodeURIComponent(id)}/correct`,{method:'POST',body:{patch,walletAdjustments,reason:form.reason}});await showGame(id);}
      await refreshCurrent();
    }catch(error){fail(error);}
  }

  async function leaderboardAction(action){
    const month=$('leaderboardMonth').value||new Date().toISOString().slice(0,7),isReset=action.startsWith('reset'),isGlobal=action.endsWith('Global'),form=await actionPrompt({title:`${isReset?'Reset':'Rebuild'} ${isGlobal?'Global':'Monthly'} Leaderboard`,fields:[]});if(!form)return;
    try{if(isReset)await api('/leaderboards/reset',{method:'POST',body:{scope:isGlobal?'global':'month',month,reason:form.reason}});else await api('/leaderboards/rebuild',{method:'POST',body:{scope:isGlobal?'global':'month',month,reason:form.reason}});await loadLeaderboards();}catch(error){fail(error);}
  }

  async function refreshCurrent(){await selectView(currentView);}

  async function submitAdminLogin(){token=$('adminToken').value.trim();sessionStorage.setItem(TOKEN_KEY,token);$('loginError').textContent='';await authenticate();}
  $('openDashboardBtn').addEventListener('click',submitAdminLogin);
  $('adminLoginForm').addEventListener('submit',async event=>{event.preventDefault();await submitAdminLogin();});
  $('adminToken').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitAdminLogin();}});
  $('adminLogout').addEventListener('click',()=>{token='';sessionStorage.removeItem(TOKEN_KEY);$('adminApp').hidden=true;$('adminLogin').hidden=false;$('adminToken').value='';});
  $('adminNav').addEventListener('click',event=>{const btn=event.target.closest('[data-view]');if(btn)selectView(btn.dataset.view);});
  document.body.addEventListener('click',event=>{const p=event.target.closest('[data-player]'),g=event.target.closest('[data-game]'),go=event.target.closest('[data-go]'),action=event.target.closest('[data-admin-action]'),auditBtn=event.target.closest('[data-audit-json]');if(p)showPlayer(p.dataset.player);else if(g)showGame(g.dataset.game);else if(go)selectView(go.dataset.go);else if(action)adminAction(action.dataset.adminAction,action.dataset.id,action);else if(auditBtn){$('detailTitle').textContent='Audit Record';$('detailBody').innerHTML=`<pre class="json">${esc(JSON.stringify(JSON.parse(decodeURIComponent(auditBtn.dataset.auditJson)),null,2))}</pre>`;$('detailDialog').showModal();}});
  $('detailClose').addEventListener('click',()=>$('detailDialog').close());
  $('failureOk').addEventListener('click',()=>$('failureOverlay').hidden=true);
  $('refreshBtn').addEventListener('click',refreshCurrent);$('exportBtn').addEventListener('click',exportCsv);
  function localInputValue(dateValue){const d=new Date(dateValue),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function applyPreset(value){const now=new Date();if(value==='all'){$('filterFrom').value='';$('filterTo').value='';}else if(value){let start=new Date(now);if(value==='today')start=new Date(now.getFullYear(),now.getMonth(),now.getDate());if(value==='month')start=new Date(now.getFullYear(),now.getMonth(),1);if(value==='year')start=new Date(now.getFullYear(),0,1);$('filterFrom').value=localInputValue(start);$('filterTo').value=localInputValue(now);}refreshCurrent();}
  $('rangePreset').addEventListener('change',event=>{if(event.target.value)applyPreset(event.target.value);});
  $('applyRange').addEventListener('click',refreshCurrent);$('clearRange').addEventListener('click',()=>{$('rangePreset').value='all';$('filterFrom').value='';$('filterTo').value='';refreshCurrent();});
  $('playerSearchBtn').addEventListener('click',loadPlayers);$('playerSort').addEventListener('change',loadPlayers);$('playerSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadPlayers();});
  $('gameSearchBtn').addEventListener('click',()=>loadGames());$('abandonSearchBtn').addEventListener('click',()=>loadGames('abandoned'));$('rankingRefresh').addEventListener('click',loadRankings);$('rankingMetric').addEventListener('change',loadRankings);$('sessionRefresh').addEventListener('click',loadSessions);
  $('resetGlobal').addEventListener('click',()=>leaderboardAction('resetGlobal'));$('resetMonth').addEventListener('click',()=>leaderboardAction('resetMonth'));$('rebuildGlobal').addEventListener('click',()=>leaderboardAction('rebuildGlobal'));$('rebuildMonth').addEventListener('click',()=>leaderboardAction('rebuildMonth'));$('leaderboardMonth').addEventListener('change',loadLeaderboards);

  if(token)authenticate();else{$('adminLogin').hidden=false;$('adminApp').hidden=true;}
})();