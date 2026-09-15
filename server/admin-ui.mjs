const ADMIN_HTML=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>GoStop Live! Server Admin</title>
<style>
:root{color-scheme:dark;--bg:#0d0805;--panel:#1c120c;--panel2:#26170e;--gold:#d8ae68;--gold2:#f1ce8b;--text:#f6ead4;--muted:#bca789;--red:#c44f3b;--green:#5f9d63;--line:rgba(216,174,104,.24)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#342014 0,#120b07 42%,#080503 100%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}button,input,textarea,select{font:inherit}button{cursor:pointer}
.shell{max-width:1500px;margin:auto;padding:20px}.top{display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}.brand{font-family:Georgia,serif;font-size:clamp(28px,4vw,48px);font-weight:800}.brand em{color:var(--gold2)}.top-actions{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:1px solid #805c33;background:#3b2417;color:#fff;border-radius:9px;padding:9px 12px;font-weight:700}.btn:hover{border-color:var(--gold)}.btn.primary{background:linear-gradient(#a87831,#744619);border-color:var(--gold2)}.btn.danger{background:#602219;border-color:#c7634f}.btn.good{background:#254529;border-color:#5f9d63}.btn.small{padding:5px 8px;font-size:12px}.btn:disabled{opacity:.45;cursor:not-allowed}
.card{background:linear-gradient(180deg,rgba(39,24,15,.97),rgba(19,12,8,.97));border:1px solid var(--line);border-radius:15px;box-shadow:0 16px 44px rgba(0,0,0,.3);padding:16px}.login{max-width:520px;margin:10vh auto}.login h1{font-family:Georgia,serif;margin-top:0}.field{display:grid;gap:5px;margin:10px 0}.field label,.label{color:var(--muted);font-size:12px;font-weight:800}.field input,.field textarea,.field select,input.control,select.control,textarea.control{width:100%;border:1px solid #614528;border-radius:8px;background:#0f0906;color:#fff;padding:9px}.field textarea,textarea.control{min-height:90px;resize:vertical}.help{color:var(--muted);font-size:12px;line-height:1.45}.error{color:#ff9b89;min-height:20px}.status{color:#d7c5a8;font-size:12px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.tab.active{background:#7b5120;border-color:var(--gold2)}
.grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px;margin-bottom:14px}.metric strong{font-size:25px;display:block;color:var(--gold2)}.metric span{color:var(--muted);font-size:12px}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}.panel-head h2{margin:0;font-family:Georgia,serif}.toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px}.table{width:100%;border-collapse:collapse;min-width:900px}.table th,.table td{padding:9px 10px;border-bottom:1px solid rgba(216,174,104,.12);white-space:nowrap;text-align:right}.table th{position:sticky;top:0;background:#2a190f;color:var(--gold2);z-index:1}.table th.left,.table td.left{text-align:left}.table tr.dragging{opacity:.35}.table tr.deleted{opacity:.58}.rank-controls{display:flex;gap:4px;justify-content:center}.rank-controls button{width:27px;height:27px;padding:0}.pill{display:inline-block;border:1px solid #5f472e;border-radius:999px;padding:2px 7px;font-size:11px;color:#dbc6a5}.pill.bad{border-color:#9d4d3f;color:#ffb3a5}.pill.good{border-color:#4f8052;color:#b9e3ba}.row-actions{display:flex;gap:5px;justify-content:flex-end}
.search{min-width:220px}.hidden{display:none!important}.empty{text-align:center!important;color:var(--muted);padding:28px!important}
dialog{border:1px solid #7b5a35;border-radius:15px;background:#17100b;color:var(--text);width:min(820px,94vw);max-height:92vh;padding:0;box-shadow:0 28px 80px #000}dialog::backdrop{background:rgba(0,0,0,.75)}.modal{padding:18px}.modal h2{margin:0 0 10px;font-family:Georgia,serif}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.span2{grid-column:1/-1}.checks{display:flex;gap:20px;flex-wrap:wrap;margin:9px 0}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;position:sticky;bottom:0;background:#17100b;padding-top:10px}.json{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.notice{border:1px solid #7b5a35;background:#2a190f;border-radius:10px;padding:10px 12px;color:#e3cfaf;margin-bottom:12px}.notice strong{color:var(--gold2)}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.form-grid{grid-template-columns:1fr}.span2{grid-column:auto}.shell{padding:12px}.top-actions{width:100%}.top-actions .btn{flex:1}}
</style>
</head>
<body>
<div id="loginView" class="shell">
  <section class="card login">
    <h1>GoStop Live! Server Admin</h1>
    <p class="help">Administrative access to player accounts, Wallet Coins, Global and Monthly leaderboards, manual ranking order, and audit history.</p>
    <form id="loginForm">
      <div class="field"><label for="adminKey">Admin Access Key</label><input id="adminKey" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="adminActor">Actor label</label><input id="adminActor" value="Admin" maxlength="80" required><span class="help">Recorded in the audit log for every change.</span></div>
      <p id="loginError" class="error" role="alert"></p>
      <button class="btn primary" type="submit">Sign In</button>
    </form>
  </section>
</div>
<div id="appView" class="shell hidden">
  <header class="top"><div><div class="brand">GoStop <em>Live!</em></div><div class="status">Server Admin · <span id="sessionActor"></span> · <span id="generatedAt"></span></div></div><div class="top-actions"><button id="refreshBtn" class="btn">Refresh</button><button id="rotateKeyBtn" class="btn">Rotate Access Key</button><button id="logoutBtn" class="btn">Log Out</button></div></header>
  <div class="notice"><strong>Safety:</strong> Account Delete is reversible and immediately signs that account out. Clearing a leaderboard resets only leaderboard statistics/manual order; it does not change Wallet Coins or delete accounts.</div>
  <nav class="tabs"><button class="btn tab active" data-tab="dashboard">Dashboard</button><button class="btn tab" data-tab="global">Global Leaderboard</button><button class="btn tab" data-tab="monthly">Monthly Leaderboard</button><button class="btn tab" data-tab="accounts">Accounts</button><button class="btn tab" data-tab="audit">Audit</button></nav>
  <main>
    <section id="tab-dashboard" class="tab-panel">
      <div class="grid">
        <div class="card metric"><strong id="mAccounts">0</strong><span>Total Accounts</span></div>
        <div class="card metric"><strong id="mActive">0</strong><span>Active Accounts</span></div>
        <div class="card metric"><strong id="mDeleted">0</strong><span>Disabled / Deleted</span></div>
        <div class="card metric"><strong id="mWallet">0</strong><span>Total Wallet Coins</span></div>
        <div class="card metric"><strong id="mGames">0</strong><span>Lifetime Ranked Games</span></div>
      </div>
      <section class="card"><div class="panel-head"><h2>Administration</h2></div><p class="help">Use the leaderboard tabs to manually reorder or clear ranking data. Use Accounts to create, edit, disable/delete, restore, or change player statistics. Every mutation is written to Audit and reversible actions can be undone when no newer change conflicts.</p></section>
    </section>
    <section id="tab-global" class="tab-panel hidden card">
      <div class="panel-head"><h2>Global Leaderboard</h2><div class="toolbar"><button id="globalExport" class="btn">Export CSV</button><button id="globalResetOrder" class="btn">Reset Local Order</button><button id="globalSaveOrder" class="btn primary">Save Displayed Order</button><button id="globalClear" class="btn danger">Clear Global</button></div></div>
      <div id="globalTable"></div>
    </section>
    <section id="tab-monthly" class="tab-panel hidden card">
      <div class="panel-head"><h2>Monthly Leaderboard</h2><div class="toolbar"><label class="label">Month <input id="monthPicker" class="control" type="month"></label><button id="monthlyExport" class="btn">Export CSV</button><button id="monthlyResetOrder" class="btn">Reset Local Order</button><button id="monthlySaveOrder" class="btn primary">Save Displayed Order</button><button id="monthlyClear" class="btn danger">Clear Month</button></div></div>
      <div id="monthlyTable"></div>
    </section>
    <section id="tab-accounts" class="tab-panel hidden card">
      <div class="panel-head"><h2>Accounts</h2><div class="toolbar"><input id="accountSearch" class="control search" placeholder="Search nickname, email, ID"><button id="accountsExport" class="btn">Export CSV</button><button id="addAccountBtn" class="btn primary">Add Account</button></div></div>
      <div id="accountsTable"></div>
    </section>
    <section id="tab-audit" class="tab-panel hidden card">
      <div class="panel-head"><h2>Audit History</h2><div class="toolbar"><span class="help">Newest first · up to 150 entries</span></div></div>
      <div id="auditTable"></div>
    </section>
  </main>
</div>

<dialog id="accountDialog">
<form id="accountForm" class="modal">
  <h2 id="accountDialogTitle">Edit Account</h2>
  <input id="accountId" type="hidden">
  <div class="form-grid">
    <div class="field"><label>Email</label><input id="aEmail" type="email" required></div>
    <div class="field"><label>Nickname</label><input id="aNickname" maxlength="16" required></div>
    <div class="field"><label>Password <span id="passwordHint" class="help"></span></label><input id="aPassword" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Wallet Coins</label><input id="aWallet" type="number" step="1"></div>
    <div class="field"><label>Force Quits</label><input id="aForceQuits" type="number" min="0" step="1"></div>
    <div class="field"><label>Computer Bankruptcies</label><input id="aBankruptcies" type="number" min="0" step="1"></div>
    <div class="field"><label>Status</label><input id="aStatus" maxlength="40"></div>
    <div class="field"><label>Country / Region</label><div style="display:flex;gap:6px"><input id="aCountry" maxlength="2" placeholder="US"><input id="aRegion" maxlength="8" placeholder="IL"></div></div>
    <div class="field"><label>Global Games Played</label><input id="aGlobalGames" type="number" min="0" step="1"></div>
    <div class="field"><label>Global Wins</label><input id="aGlobalWins" type="number" min="0" step="1"></div>
    <div class="field"><label>Global Total Coins</label><input id="aGlobalCoins" type="number" step="1"></div>
    <div class="field"><label>Global Milestones JSON</label><textarea id="aGlobalMilestones" class="json">{}</textarea></div>
    <div class="field span2"><label>Monthly Statistics JSON</label><textarea id="aMonthlyStats" class="json">{}</textarea><span class="help">Object keyed by YYYY-MM. Each value can contain gamesPlayed, wins, totalCoinsWon, and milestones.</span></div>
    <div class="field span2"><label>Admin Notes</label><textarea id="aNotes"></textarea></div>
  </div>
  <div class="checks"><label><input id="aVerified" type="checkbox"> Email verified</label><label><input id="aDisabled" type="checkbox"> Disabled</label></div>
  <p id="accountError" class="error" role="alert"></p>
  <div class="dialog-actions"><button id="accountCancel" class="btn" type="button">Cancel</button><button class="btn primary" type="submit">Save</button></div>
</form>
</dialog>

<script>
(function(){
'use strict';
var TOKEN_KEY='gostop-admin-session';
var state={token:sessionStorage.getItem(TOKEN_KEY)||'',data:null,tab:'dashboard',orders:{global:[],monthly:[]},drag:null};
var q=function(id){return document.getElementById(id);};
var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var fmt=function(value){return Number(value||0).toLocaleString();};
function showLogin(message){q('appView').classList.add('hidden');q('loginView').classList.remove('hidden');if(message)q('loginError').textContent=message;}
function showApp(){q('loginView').classList.add('hidden');q('appView').classList.remove('hidden');}
async function api(path,options){
  options=options||{};var headers=new Headers(options.headers||{});if(state.token)headers.set('Authorization','Bearer '+state.token);if(options.body!==undefined){headers.set('content-type','application/json');options.body=JSON.stringify(options.body);}
  var response=await fetch('/api/admin'+path,Object.assign({},options,{headers:headers}));
  if(response.status===401){state.token='';sessionStorage.removeItem(TOKEN_KEY);showLogin('Admin session expired or is not authorized.');throw new Error('Admin authentication required.');}
  var type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  var data=await response.json();if(!response.ok)throw new Error(data.error&&data.error.message||'Request failed.');return data;
}
async function load(month){
  var suffix=month?'?month='+encodeURIComponent(month):'';var result=await api('/state'+suffix);state.data=result;state.orders.global=result.leaderboards.global.map(function(row){return row.accountId;});state.orders.monthly=result.leaderboards.monthly.map(function(row){return row.accountId;});render();showApp();
}
function render(){
  var d=state.data;if(!d)return;q('sessionActor').textContent=sessionStorage.getItem('gostop-admin-actor')||'Admin';q('generatedAt').textContent='Updated '+new Date(d.generatedAt).toLocaleString();q('mAccounts').textContent=fmt(d.dashboard.accounts);q('mActive').textContent=fmt(d.dashboard.activeAccounts);q('mDeleted').textContent=fmt(d.dashboard.deletedAccounts);q('mWallet').textContent=fmt(d.dashboard.totalWalletCoins);q('mGames').textContent=fmt(d.dashboard.totalGlobalGames);q('monthPicker').value=d.month;renderLeaderboard('global');renderLeaderboard('monthly');renderAccounts();renderAudit();
}
function rowById(scope,id){return state.data.leaderboards[scope].find(function(row){return row.accountId===id;});}
function orderedRows(scope){return state.orders[scope].map(function(id){return rowById(scope,id);}).filter(Boolean);}
function renderLeaderboard(scope){
  var rows=orderedRows(scope),target=q(scope+'Table');if(!rows.length){target.innerHTML='<div class="empty">No active accounts.</div>';return;}
  var html='<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Rank</th><th class="left">Nickname</th><th>Score</th><th>Total Coins</th><th>Games</th><th>Wallet</th><th>Manual Rank</th></tr></thead><tbody>';
  rows.forEach(function(row,index){html+='<tr draggable="true" data-scope="'+scope+'" data-id="'+esc(row.accountId)+'"><td><div class="rank-controls"><button type="button" class="btn small move" data-scope="'+scope+'" data-index="'+index+'" data-delta="-1">▲</button><button type="button" class="btn small move" data-scope="'+scope+'" data-index="'+index+'" data-delta="1">▼</button></div></td><td>'+(index+1)+'</td><td class="left">'+esc(row.nickname)+'</td><td>'+esc(Number(row.score||0).toFixed(2))+'</td><td>'+fmt(row.totalCoins)+'</td><td>'+fmt(row.gamesPlayed)+'</td><td>'+fmt(row.walletCoins)+'</td><td>'+(row.manualRank==null?'—':fmt(row.manualRank))+'</td></tr>';});
  html+='</tbody></table></div>';target.innerHTML=html;
  target.querySelectorAll('.move').forEach(function(button){button.addEventListener('click',function(){moveRow(button.dataset.scope,Number(button.dataset.index),Number(button.dataset.delta));});});
  target.querySelectorAll('tbody tr').forEach(function(row){row.addEventListener('dragstart',function(){state.drag={scope:scope,id:row.dataset.id};row.classList.add('dragging');});row.addEventListener('dragend',function(){row.classList.remove('dragging');state.drag=null;});row.addEventListener('dragover',function(event){event.preventDefault();});row.addEventListener('drop',function(event){event.preventDefault();if(!state.drag||state.drag.scope!==scope)return;var from=state.orders[scope].indexOf(state.drag.id),to=state.orders[scope].indexOf(row.dataset.id);if(from<0||to<0||from===to)return;var item=state.orders[scope].splice(from,1)[0];state.orders[scope].splice(to,0,item);renderLeaderboard(scope);});});
}
function moveRow(scope,index,delta){var next=index+delta;if(next<0||next>=state.orders[scope].length)return;var item=state.orders[scope][index];state.orders[scope][index]=state.orders[scope][next];state.orders[scope][next]=item;renderLeaderboard(scope);}
async function saveOrder(scope){try{await api('/leaderboards/order',{method:'POST',body:{scope:scope,month:q('monthPicker').value,orderedAccountIds:state.orders[scope]}});await load(scope==='monthly'?q('monthPicker').value:'');}catch(error){alert(error.message);}}
async function clearBoard(scope){var label=scope==='global'?'Global leaderboard':'Monthly leaderboard for '+q('monthPicker').value;if(!confirm('Clear '+label+'? Wallet Coins and accounts will NOT be changed.'))return;var expected=scope==='global'?'CLEAR GLOBAL':'CLEAR MONTH';var typed=prompt('Type '+expected+' to confirm.');if(typed!==expected)return;try{await api('/leaderboards/clear',{method:'POST',body:{scope:scope,month:q('monthPicker').value,confirmation:expected}});await load(scope==='monthly'?q('monthPicker').value:'');}catch(error){alert(error.message);}}
function renderAccounts(){
  var term=q('accountSearch').value.trim().toLowerCase(),rows=state.data.accounts.filter(function(account){return !term||[account.nickname,account.email,account.id,account.admin.status].join(' ').toLowerCase().includes(term);});
  var html='<div class="table-wrap"><table class="table"><thead><tr><th class="left">Nickname</th><th class="left">Email</th><th>Wallet</th><th>Games</th><th>Force Quits</th><th>Bankruptcies</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  if(!rows.length)html+='<tr><td class="empty" colspan="8">No accounts match.</td></tr>';
  rows.forEach(function(a){var deleted=a.admin.disabled||a.admin.deletedAt;html+='<tr class="'+(deleted?'deleted':'')+'"><td class="left">'+esc(a.nickname)+'</td><td class="left">'+esc(a.email)+'</td><td>'+fmt(a.walletCoins)+'</td><td>'+fmt(a.stats.global.gamesPlayed)+'</td><td>'+fmt(a.forceQuits)+'</td><td>'+fmt(a.computerBankruptcies)+'</td><td><span class="pill '+(deleted?'bad':'good')+'">'+esc(deleted?'Deleted / Disabled':a.admin.status||'active')+'</span></td><td><div class="row-actions"><button class="btn small edit-account" data-id="'+esc(a.id)+'">Edit</button>'+(deleted?'<button class="btn small good restore-account" data-id="'+esc(a.id)+'">Restore</button>':'<button class="btn small danger delete-account" data-id="'+esc(a.id)+'">Delete</button>')+'</div></td></tr>';});
  html+='</tbody></table></div>';q('accountsTable').innerHTML=html;
  q('accountsTable').querySelectorAll('.edit-account').forEach(function(button){button.addEventListener('click',function(){openAccount(button.dataset.id);});});
  q('accountsTable').querySelectorAll('.delete-account').forEach(function(button){button.addEventListener('click',function(){deleteAccount(button.dataset.id);});});
  q('accountsTable').querySelectorAll('.restore-account').forEach(function(button){button.addEventListener('click',function(){restoreAccount(button.dataset.id);});});
}
function renderAudit(){
  var rows=state.data.audit||[],html='<div class="table-wrap"><table class="table"><thead><tr><th class="left">Time</th><th class="left">Actor</th><th class="left">Action</th><th class="left">Subject</th><th class="left">Summary</th><th>Undo</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td class="empty" colspan="6">No admin changes yet.</td></tr>';
  rows.forEach(function(a){html+='<tr><td class="left">'+esc(new Date(a.createdAt).toLocaleString())+'</td><td class="left">'+esc(a.actor)+'</td><td class="left">'+esc(a.action)+'</td><td class="left">'+esc(a.subject)+'</td><td class="left">'+esc(a.summary)+'</td><td>'+(a.undoable&&!a.undoneAt?'<button class="btn small undo" data-id="'+esc(a.id)+'">Undo</button>':(a.undoneAt?'Undone':'—'))+'</td></tr>';});html+='</tbody></table></div>';q('auditTable').innerHTML=html;
  q('auditTable').querySelectorAll('.undo').forEach(function(button){button.addEventListener('click',async function(){if(!confirm('Undo this admin action? Newer conflicting changes will be protected.'))return;try{await api('/undo',{method:'POST',body:{auditId:button.dataset.id}});await load(q('monthPicker').value);}catch(error){alert(error.message);}});});
}
function parseJsonField(id,label){try{return JSON.parse(q(id).value||'{}');}catch(_){throw new Error(label+' must be valid JSON.');}}
function openAccount(id){
  var a=id?state.data.accounts.find(function(item){return item.id===id;}):null;q('accountId').value=a?a.id:'';q('accountDialogTitle').textContent=a?'Edit Account':'Add Account';q('passwordHint').textContent=a?'(leave blank to keep current password)':'(required, 8+ characters)';q('aEmail').value=a?a.email:'';q('aNickname').value=a?a.nickname:'';q('aPassword').value='';q('aPassword').required=!a;q('aWallet').value=a?a.walletCoins:200;q('aForceQuits').value=a?a.forceQuits:0;q('aBankruptcies').value=a?a.computerBankruptcies:0;q('aStatus').value=a?a.admin.status:'active';q('aCountry').value=a&&a.location?a.location.countryCode||'':'';q('aRegion').value=a&&a.location?a.location.regionCode||'':'';q('aGlobalGames').value=a?a.stats.global.gamesPlayed:0;q('aGlobalWins').value=a?a.stats.global.wins:0;q('aGlobalCoins').value=a?a.stats.global.totalCoinsWon:0;q('aGlobalMilestones').value=JSON.stringify(a?a.stats.global.milestones:{},null,2);q('aMonthlyStats').value=JSON.stringify(a?a.stats.monthly:{},null,2);q('aNotes').value=a?a.admin.notes:'';q('aVerified').checked=a?a.emailVerified:true;q('aDisabled').checked=a?a.admin.disabled:false;q('accountError').textContent='';q('accountDialog').showModal();
}
async function saveAccount(event){
  event.preventDefault();q('accountError').textContent='';try{var id=q('accountId').value,globalMilestones=parseJsonField('aGlobalMilestones','Global milestones'),monthly=parseJsonField('aMonthlyStats','Monthly statistics'),body={email:q('aEmail').value.trim(),nickname:q('aNickname').value.trim(),walletCoins:Number(q('aWallet').value||0),forceQuits:Number(q('aForceQuits').value||0),computerBankruptcies:Number(q('aBankruptcies').value||0),emailVerified:q('aVerified').checked,disabled:q('aDisabled').checked,status:q('aStatus').value.trim(),countryCode:q('aCountry').value.trim(),regionCode:q('aRegion').value.trim(),notes:q('aNotes').value,globalStats:{gamesPlayed:Number(q('aGlobalGames').value||0),wins:Number(q('aGlobalWins').value||0),totalCoinsWon:Number(q('aGlobalCoins').value||0),milestones:globalMilestones},monthlyStats:monthly};if(q('aPassword').value)body.password=q('aPassword').value;if(!id&&!body.password)throw new Error('Password is required for a new account.');await api(id?'/accounts/'+encodeURIComponent(id):'/accounts',{method:id?'PATCH':'POST',body:body});q('accountDialog').close();await load(q('monthPicker').value);}catch(error){q('accountError').textContent=error.message;}}
async function deleteAccount(id){var a=state.data.accounts.find(function(item){return item.id===id;});if(!a||!confirm('Delete '+a.nickname+'? This is reversible and will sign the account out.'))return;try{await api('/accounts/'+encodeURIComponent(id)+'/delete',{method:'POST',body:{}});await load(q('monthPicker').value);}catch(error){alert(error.message);}}
async function restoreAccount(id){try{await api('/accounts/'+encodeURIComponent(id)+'/restore',{method:'POST',body:{}});await load(q('monthPicker').value);}catch(error){alert(error.message);}}
async function exportCsv(scope){try{var path='/export?scope='+encodeURIComponent(scope);if(scope==='monthly')path+='&month='+encodeURIComponent(q('monthPicker').value);var response=await api(path);var blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gostop-'+scope+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(error){alert(error.message);}}
function selectTab(tab){state.tab=tab;document.querySelectorAll('.tab').forEach(function(button){button.classList.toggle('active',button.dataset.tab===tab);});document.querySelectorAll('.tab-panel').forEach(function(panel){panel.classList.add('hidden');});q('tab-'+tab).classList.remove('hidden');}
q('loginForm').addEventListener('submit',async function(event){event.preventDefault();q('loginError').textContent='';try{var actor=q('adminActor').value.trim(),result=await api('/login',{method:'POST',body:{key:q('adminKey').value,actor:actor}});state.token=result.session.token;sessionStorage.setItem(TOKEN_KEY,state.token);sessionStorage.setItem('gostop-admin-actor',actor);q('adminKey').value='';await load();}catch(error){q('loginError').textContent=error.message;}});
document.querySelectorAll('.tab').forEach(function(button){button.addEventListener('click',function(){selectTab(button.dataset.tab);});});
q('refreshBtn').addEventListener('click',function(){load(q('monthPicker').value).catch(function(error){alert(error.message);});});
q('logoutBtn').addEventListener('click',async function(){try{await api('/logout',{method:'POST',body:{}});}catch(_){}state.token='';sessionStorage.removeItem(TOKEN_KEY);showLogin();});
q('rotateKeyBtn').addEventListener('click',async function(){var first=prompt('Enter a NEW Admin Access Key (16+ characters). Keep it somewhere secure.');if(!first)return;var second=prompt('Enter the new key again.');if(first!==second){alert('Keys do not match.');return;}try{var result=await api('/key/rotate',{method:'POST',body:{newKey:first}});state.token=result.session.token;sessionStorage.setItem(TOKEN_KEY,state.token);alert('Admin Access Key rotated. Existing admin sessions were signed out. This browser is signed in with a fresh session.');}catch(error){alert(error.message);}});
q('globalSaveOrder').addEventListener('click',function(){saveOrder('global');});q('monthlySaveOrder').addEventListener('click',function(){saveOrder('monthly');});
q('globalClear').addEventListener('click',function(){clearBoard('global');});q('monthlyClear').addEventListener('click',function(){clearBoard('monthly');});
q('globalResetOrder').addEventListener('click',function(){state.orders.global=state.data.leaderboards.global.map(function(row){return row.accountId;});renderLeaderboard('global');});q('monthlyResetOrder').addEventListener('click',function(){state.orders.monthly=state.data.leaderboards.monthly.map(function(row){return row.accountId;});renderLeaderboard('monthly');});
q('monthPicker').addEventListener('change',function(){load(q('monthPicker').value).catch(function(error){alert(error.message);});});
q('accountSearch').addEventListener('input',renderAccounts);q('addAccountBtn').addEventListener('click',function(){openAccount(null);});q('accountForm').addEventListener('submit',saveAccount);q('accountCancel').addEventListener('click',function(){q('accountDialog').close();});
q('globalExport').addEventListener('click',function(){exportCsv('global');});q('monthlyExport').addEventListener('click',function(){exportCsv('monthly');});q('accountsExport').addEventListener('click',function(){exportCsv('accounts');});
if(state.token){load().catch(function(error){showLogin(error.message);});}else showLogin();
})();
</script>
</body></html>`;

export function adminHtml(){
  return new Response(ADMIN_HTML,{status:200,headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
    'x-content-type-options':'nosniff'
  }});
}
