from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f"expected source not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Presentation: an eventless sync must not remove the physically staged cards
# that authority still owns as pending played/drawn cards.
replace_once(
    "presentation-plan.js",
    "  function planOnlinePresentation(events,initialStages={},context={}){",
    "  function pendingOnlineStageIds(state={}){\n"
    "    return [state?.pendingTurn?.played?.card?.id,state?.pendingTurn?.drawn?.card?.id].filter(Boolean);\n"
    "  }\n\n"
    "  function planOnlinePresentation(events,initialStages={},context={}){",
)
replace_once(
    "presentation-plan.js",
    "  const api=Object.freeze({planOnlinePresentation,isUpwardFlick,installHandFlickGestures,FLICK_DEFAULTS});",
    "  const api=Object.freeze({planOnlinePresentation,pendingOnlineStageIds,isUpwardFlick,installHandFlickGestures,FLICK_DEFAULTS});",
)

replace_once(
    "app.js",
    """      if(!presentationEvents.length){
        // Authority can advance before the physical play event arrives. Do not render the
        // selected card on the floor until a presentation step claims its exact source.
        if(hasUnpresentedLocalHandMovement(incomingMapped.state,presentationEvents))return;
        presentation.stagedCards.forEach((_,cardId)=>cleanupStagedCard(cardId));onlineStageState={};state=incomingMapped.state;onlineLastEvents=[];render();await driveOnline(snapshot,[]);return;
      }""",
    """      if(!presentationEvents.length){
        // Sync/flow snapshots carry no new physical action. Preserve any staged cards that
        // authority still owns in pendingTurn so the played card cannot disappear between
        // the hand slap and the deck reveal in ranked Solo/Online play.
        if(hasUnpresentedLocalHandMovement(incomingMapped.state,presentationEvents))return;
        const pendingStageIds=new Set(globalThis.GoStopPresentationPlan.pendingOnlineStageIds(incomingMapped.state));
        for(const cardId of [...presentation.stagedCards.keys()])if(!pendingStageIds.has(cardId))cleanupStagedCard(cardId);
        onlineStageState=Object.fromEntries(Object.entries(onlineStageState).filter(([cardId])=>pendingStageIds.has(cardId)));
        state=incomingMapped.state;onlineLastEvents=[];render();await driveOnline(snapshot,[]);return;
      }""",
)

# Regression coverage for the presentation invariant.
replace_once(
    "tests/presentation-plan.test.js",
    "const {planOnlinePresentation,isUpwardFlick}=require('../presentation-plan.js');",
    "const {planOnlinePresentation,pendingOnlineStageIds,isUpwardFlick}=require('../presentation-plan.js');",
)
Path("tests/presentation-plan.test.js").write_text(
    Path("tests/presentation-plan.test.js").read_text()
    + """

test('eventless authority sync preserves cards still owned by pending turn staging',()=>{
  const state={pendingTurn:{played:{card:card('m2-1')},drawn:{card:card('m3-1')}}};
  assert.deepEqual(pendingOnlineStageIds(state),['m2-1','m3-1']);
  assert.deepEqual(pendingOnlineStageIds({pendingTurn:{played:{card:card('m2-1')},drawn:null}}),['m2-1']);
  assert.deepEqual(pendingOnlineStageIds({}),[]);
});
"""
)

# Ranked/account UI strings use the same html lang selected by the base game.
ranked_helpers = r'''  const RANKED_TEXT=Object.freeze({
    en:{coins:'Coins',practice:'Practice Game',coinGames:'COIN GAMES',solo:'Solo Play',online:'Online Play',global:'Global Leaderboard',monthly:'Monthly Leaderboard',pitch:'Create an ID to play games with your friends and compete in the leaderboard.',createId:'Create ID',login:'Log In',logout:'Log Out',rank:'Rank #{rank}',provisional:'Provisional #{rank}',unranked:'Unranked',score:'Score',games:'Games',totalCoins:'Total Coins',gamesPlayed:'Games Played',return:'Return',computer:'Computer #{level}',starting:'Starting Solo Play…',pause:'Pause',pauseCount:'Pause ({count})'},
    ko:{coins:'코인',practice:'연습 게임',coinGames:'코인 게임',solo:'혼자 하기',online:'온라인 플레이',global:'글로벌 리더보드',monthly:'월간 리더보드',pitch:'ID를 만들면 친구와 게임하고 리더보드에서 경쟁할 수 있습니다.',createId:'ID 만들기',login:'로그인',logout:'로그아웃',rank:'순위 #{rank}',provisional:'임시 순위 #{rank}',unranked:'미순위',score:'점수',games:'게임',totalCoins:'총 획득 코인',gamesPlayed:'게임 수',return:'돌아가기',computer:'컴퓨터 #{level}',starting:'혼자 하기 시작 중…',pause:'일시정지',pauseCount:'일시정지 ({count})'},
    es:{coins:'Monedas',practice:'Partida de práctica',coinGames:'PARTIDAS CON MONEDAS',solo:'Juego en solitario',online:'Juego en línea',global:'Clasificación global',monthly:'Clasificación mensual',pitch:'Crea un ID para jugar con amigos y competir en la clasificación.',createId:'Crear ID',login:'Iniciar sesión',logout:'Cerrar sesión',rank:'Puesto #{rank}',provisional:'Provisional #{rank}',unranked:'Sin clasificación',score:'Puntuación',games:'Partidas',totalCoins:'Monedas ganadas',gamesPlayed:'Partidas jugadas',return:'Volver',computer:'Computadora #{level}',starting:'Iniciando juego en solitario…',pause:'Pausa',pauseCount:'Pausa ({count})'},
    fr:{coins:'Pièces',practice:'Partie d’entraînement',coinGames:'PARTIES À PIÈCES',solo:'Jeu solo',online:'Jeu en ligne',global:'Classement mondial',monthly:'Classement mensuel',pitch:'Créez un identifiant pour jouer avec vos amis et concourir au classement.',createId:'Créer un ID',login:'Connexion',logout:'Déconnexion',rank:'Rang #{rank}',provisional:'Provisoire #{rank}',unranked:'Non classé',score:'Score',games:'Parties',totalCoins:'Pièces gagnées',gamesPlayed:'Parties jouées',return:'Retour',computer:'Ordinateur #{level}',starting:'Démarrage du jeu solo…',pause:'Pause',pauseCount:'Pause ({count})'},
    de:{coins:'Münzen',practice:'Übungsspiel',coinGames:'MÜNZSPIELE',solo:'Solo-Spiel',online:'Online-Spiel',global:'Globale Rangliste',monthly:'Monatsrangliste',pitch:'Erstelle eine ID, um mit Freunden zu spielen und in der Rangliste anzutreten.',createId:'ID erstellen',login:'Anmelden',logout:'Abmelden',rank:'Rang #{rank}',provisional:'Vorläufig #{rank}',unranked:'Nicht gewertet',score:'Punkte',games:'Spiele',totalCoins:'Gewonnene Münzen',gamesPlayed:'Gespielte Spiele',return:'Zurück',computer:'Computer #{level}',starting:'Solo-Spiel wird gestartet…',pause:'Pause',pauseCount:'Pause ({count})'},
    ja:{coins:'コイン',practice:'練習ゲーム',coinGames:'コインゲーム',solo:'ソロプレイ',online:'オンラインプレイ',global:'グローバルランキング',monthly:'月間ランキング',pitch:'IDを作成すると友達と対戦し、ランキングに参加できます。',createId:'ID作成',login:'ログイン',logout:'ログアウト',rank:'順位 #{rank}',provisional:'暫定 #{rank}',unranked:'未順位',score:'スコア',games:'ゲーム',totalCoins:'獲得コイン',gamesPlayed:'プレイ数',return:'戻る',computer:'コンピューター #{level}',starting:'ソロプレイ開始中…',pause:'一時停止',pauseCount:'一時停止 ({count})'},
    zh:{coins:'金币',practice:'练习游戏',coinGames:'金币游戏',solo:'单人游戏',online:'在线游戏',global:'全球排行榜',monthly:'月度排行榜',pitch:'创建ID即可与朋友对战并参加排行榜。',createId:'创建ID',login:'登录',logout:'退出登录',rank:'排名 #{rank}',provisional:'暂定 #{rank}',unranked:'未排名',score:'得分',games:'游戏',totalCoins:'赢得金币',gamesPlayed:'游戏局数',return:'返回',computer:'电脑 #{level}',starting:'正在开始单人游戏…',pause:'暂停',pauseCount:'暂停 ({count})'}
  });
  const rankedLocale=()=>Object.hasOwn(RANKED_TEXT,document.documentElement.lang)?document.documentElement.lang:'en';
  const rt=(key,vars={})=>{const locale=rankedLocale(),base=globalThis.GoStopI18n?.dictionaries?.[locale]?.[key],template=RANKED_TEXT[locale]?.[key]??base??RANKED_TEXT.en[key]??key;return String(template).replace(/\{(\w+)\}/g,(_,name)=>vars[name]??'');};
  const coinText=value=>`${Number(value)||0} ${rt('coins')}`;
'''
replace_once(
    "ranked-client.js",
    "  const $=id=>document.getElementById(id);\n",
    "  const $=id=>document.getElementById(id);\n" + ranked_helpers,
)
replace_once("ranked-client.js", ".ranked-menu-group:before{content:'COIN GAMES';", ".ranked-menu-group:before{content:attr(data-label);")
replace_once(
    "ranked-client.js",
    "  function rankLabel(nickname){const row=rowFor(nickname);if(!row)return 'Unranked';return row.provisional?`Provisional #${row.rank}`:`Rank #${row.rank}`;}",
    "  function rankLabel(nickname){const row=rowFor(nickname);if(!row)return rt('unranked');return row.provisional?rt('provisional',{rank:row.rank}):rt('rank',{rank:row.rank});}",
)
replace_once(
    "ranked-client.js",
    """  function renderAccountBox(){
    if(!account){accountBox.innerHTML=`<p>Create an ID to play games with your friends and compete in the leaderboard.</p><div class="account-menu-actions"><button id="accountCreateBtn" type="button">Create ID</button><button id="accountLoginBtn" type="button">Log In</button></div>`;$('accountCreateBtn')?.addEventListener('click',()=>openAuth('register'));$('accountLoginBtn')?.addEventListener('click',()=>openAuth('login'));return;}
    accountBox.innerHTML=`<strong>${flagEmoji(account.countryCode)} ${escapeHtml(account.nickname)}</strong><span class="wallet">🪙 ${Number(account.walletCoins)||0} Coins</span><span class="rank">${escapeHtml(rankLabel(account.nickname))}</span><div class="account-menu-actions"><button id="accountLogoutBtn" type="button">Log Out</button></div>`;$('accountLogoutBtn')?.addEventListener('click',logout);
  }""",
    """  function renderAccountBox(){
    if(!account){accountBox.innerHTML=`<p>${escapeHtml(rt('pitch'))}</p><div class="account-menu-actions"><button id="accountCreateBtn" type="button">${escapeHtml(rt('createId'))}</button><button id="accountLoginBtn" type="button">${escapeHtml(rt('login'))}</button></div>`;$('accountCreateBtn')?.addEventListener('click',()=>openAuth('register'));$('accountLoginBtn')?.addEventListener('click',()=>openAuth('login'));return;}
    accountBox.innerHTML=`<strong>${flagEmoji(account.countryCode)} ${escapeHtml(account.nickname)}</strong><span class="wallet">🪙 ${escapeHtml(coinText(account.walletCoins))}</span><span class="rank">${escapeHtml(rankLabel(account.nickname))}</span><div class="account-menu-actions"><button id="accountLogoutBtn" type="button">${escapeHtml(rt('logout'))}</button></div>`;$('accountLogoutBtn')?.addEventListener('click',logout);
  }""",
)
replace_once(
    "ranked-client.js",
    "rankedSolo.disabled=true;rankedSolo.textContent='Starting Solo Play…';",
    "rankedSolo.disabled=true;rankedSolo.textContent=rt('starting');",
)
replace_once(
    "ranked-client.js",
    "rankedSolo.disabled=false;rankedSolo.textContent='Solo Play';",
    "rankedSolo.disabled=false;rankedSolo.textContent=rt('solo');",
)
replace_once(
    "ranked-client.js",
    "humanName.textContent=`You (${account.nickname}) · ${rank}`;const line=ensureWalletLine(humanIdentity,'ranked-human-wallet');if(line)line.textContent=`🪙 ${Number(account.walletCoins)||0} Coins`;",
    "humanName.textContent=`${rt('you')} (${account.nickname}) · ${rank}`;const line=ensureWalletLine(humanIdentity,'ranked-human-wallet');if(line)line.textContent=`🪙 ${coinText(account.walletCoins)}`;",
)
replace_once(
    "ranked-client.js",
    "if(rankedMode==='solo'||opponent.bot){opponentName.textContent=opponent.nickname||`Computer #${opponent.computerLevel||1}`;}",
    "if(rankedMode==='solo'||opponent.bot){opponentName.textContent=rt('computer',{level:opponent.computerLevel||1});}",
)
replace_once(
    "ranked-client.js",
    "if(line)line.textContent=`🪙 ${Number(opponent.walletCoins)||0} Coins`;",
    "if(line)line.textContent=`🪙 ${coinText(opponent.walletCoins)}`;",
)
replace_once(
    "ranked-client.js",
    "<small>Score ${fmtScore(player.score)}</small><small>${Number(player.gamesPlayed)||0} Games</small><small>🪙 ${Number(player.walletCoins)||0}</small>",
    "<small>${escapeHtml(rt('score'))} ${fmtScore(player.score)}</small><small>${Number(player.gamesPlayed)||0} ${escapeHtml(rt('games'))}</small><small>🪙 ${escapeHtml(coinText(player.walletCoins))}</small>",
)
replace_once(
    "ranked-client.js",
    "pauseBtn.textContent=`Pause (${remaining})`;",
    "pauseBtn.textContent=rt('pauseCount',{count:remaining});",
)

# Apply selected locale to static ranked/account controls and reapply live when html lang changes.
apply_locale = r'''  function applyRankedLocale(){
    playPractice.textContent=rt('practice');rankedGroup.dataset.label=rt('coinGames');rankedSolo.textContent=rankedSolo.disabled?rt('starting'):rt('solo');onlinePlay.textContent=rt('online');leaderboardBtn.textContent=rt('global');if(howTo)howTo.textContent=rt('howTo');
    const lobbyCard=onlinePanel.querySelector('.online-lobby-card'),methods=onlinePanel.querySelectorAll('.online-method');if(lobbyCard?.querySelector('h2'))lobbyCard.querySelector('h2').textContent=rt('online');if(methods[2]?.querySelector('strong'))methods[2].querySelector('strong').textContent=rt('roomCode')+' / '+rt('shareRoomCode',{roomCode:''}).replace(/[:：]\s*$/,'');if(createRoom)createRoom.textContent=rt('createOnlineGame');$('onlineLobbyClose').textContent=rt('return');
    $('loginTab').textContent=rt('login');$('registerTab').textContent=rt('createId');authDialog.querySelector('h2').textContent=$('registerForm').hidden?rt('login'):rt('createId');successDialog.querySelector('h2').textContent=rankedLocale()==='ko'?'계정 등록 완료':successDialog.querySelector('h2').textContent;$('registrationOk').textContent=rt('ok');
    const heads=leaderboardScreen.querySelectorAll('th');if(heads[0])heads[0].textContent=rt('rank',{rank:''}).replace(/\s*#?\s*$/,'');if(heads[1])heads[1].textContent=rt('nickname');if(heads[2])heads[2].textContent=rt('score');if(heads[3])heads[3].textContent=rt('totalCoins');if(heads[4])heads[4].textContent=rt('gamesPlayed');leaderboardScreen.querySelector('.leaderboard-return').textContent=rt('return');pauseDialog.querySelector('h2').textContent=rt('pause');
    renderAccountBox();if(leaderboardData)renderLeaderboard();patchGameIdentity();
  }
'''
replace_once(
    "ranked-client.js",
    "  function showToast(text,ms=4000){toast.textContent=text;toast.hidden=false;if(statusTimer)clearTimeout(statusTimer);statusTimer=setTimeout(()=>toast.hidden=true,ms);}\n",
    "  function showToast(text,ms=4000){toast.textContent=text;toast.hidden=false;if(statusTimer)clearTimeout(statusTimer);statusTimer=setTimeout(()=>toast.hidden=true,ms);}\n" + apply_locale,
)
replace_once(
    "ranked-client.js",
    "  globalThis.GoStopRanked=Object.freeze({getAuthToken,getAccount,refreshAccount,refreshLeaderboardData,updateFromSnapshot,openLeaderboard,patchGameIdentity});\n  refreshAccount().finally(()=>{renderAccountBox();resetAttractTimer();});",
    "  globalThis.GoStopRanked=Object.freeze({getAuthToken,getAccount,refreshAccount,refreshLeaderboardData,updateFromSnapshot,openLeaderboard,patchGameIdentity});\n  new MutationObserver(records=>{if(records.some(record=>record.attributeName==='lang'))applyRankedLocale();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});\n  applyRankedLocale();refreshAccount().finally(()=>{applyRankedLocale();resetAttractTimer();});",
)

print('patch applied')
