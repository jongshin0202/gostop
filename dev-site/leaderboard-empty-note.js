// Development-only empty leaderboard explanation. Not included in production builds.
// Never supplies invented scores or reads production accounts.
(()=>{
  'use strict';
  const messages=Object.freeze({
    en:'Development leaderboard: no ranked players yet. Complete 10 Competitive games here to appear.',
    ko:'개발 서버 리더보드에 아직 순위가 있는 플레이어가 없습니다. 이 서버에서 경쟁 게임 10회를 완료하면 순위에 표시됩니다.',
    es:'Clasificación de desarrollo: aún no hay jugadores clasificados. Completa 10 partidas competitivas aquí.',
    fr:'Classement de développement : aucun joueur classé. Terminez 10 parties compétitives ici pour apparaître.',
    de:'Entwicklungs-Rangliste: Noch keine platzierten Spieler. Spiele hier 10 Wettkampfpartien, um gelistet zu werden.',
    ja:'開発サーバーのランキングには、まだ順位のあるプレイヤーがいません。ここで対戦ゲームを10回完了すると表示されます。',
    zh:'开发服务器排行榜目前没有已排名玩家。在这里完成10场竞技游戏后即可上榜。'
  });
  const body=document.getElementById('leaderboardBody');
  const container=body?.closest('.leaderboard-table-wrap');
  if(!body||!container)return;
  container.style.position='relative';
  const note=document.createElement('div');
  note.id='developmentLeaderboardEmptyNote';
  note.setAttribute('role','status');
  note.hidden=true;
  note.style.cssText='position:absolute;z-index:2;top:50%;left:50%;transform:translate(-50%,-50%);max-width:min(90%,520px);width:max-content;box-sizing:border-box;text-align:center;padding:15px 18px;border-radius:11px;border:1px solid rgba(235,195,108,.55);background:rgba(20,15,11,.94);color:#f5daa1;font:600 clamp(12px,1.3vw,15px)/1.45 system-ui,sans-serif;pointer-events:none;';
  container.appendChild(note);
  function update(){
    const rows=[...body.children];
    const empty=rows.length===10&&rows.every(row=>row.classList.contains('leaderboard-empty-row'));
    const locale=document.documentElement.lang||'en';
    note.textContent=messages[locale]||messages.en;
    note.hidden=!empty;
  }
  new MutationObserver(update).observe(body,{childList:true});
  new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  update();
})();
