/* Development-only, opt-in demonstration feedback.
   Observes Training Mode DOM events; NEVER prevents, stops or replays game input.
   Removable by deleting this file and its dev-site build inclusion.
*/
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
// Public development assets contain only an account fingerprint, not the email address.
const ACCOUNT_HASH='b0af0e03e53f7d69ecd33dcf425a83d237bd3aba9dfe34ed49a315980462b6a5';
const expectedHash=(location.hostname==='localhost'||location.hostname==='127.0.0.1')&&globalThis.__GoStopFeedbackTestHash||ACCOUNT_HASH;
let approvedEmail=null;
async function checkAccount(){
 const email=String(globalThis.GoStopRanked?.getAccount?.()?.email||'').trim().toLowerCase();
 approvedEmail=null;
 if(!email||!globalThis.crypto?.subtle)return false;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));
 const digest=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest===expectedHash)approvedEmail=email;
 if(approvedEmail)await syncStatus();
 return !!approvedEmail;
}
// The only local setting is the UI preference; training data and weights live on Cloudflare.
const ENABLE_KEY='gostop-training-feedback-enabled';
const cloud=globalThis.GoStopTrainingCloud;
const weightProgress=globalThis.GoStopDevTrainingWeightProgress;
let serverFeedbackCount=0,serverModelExamples=0,serverSpecialExamples=0,serverGoStopExamples=0,lastError=null,serverReady=false;
let serverWeightState=null;
async function syncStatus(){
 if(!cloud)return;
 try{
  const state=await cloud.state();
  serverWeightState=state;
  serverFeedbackCount=state.feedbackCount||0;
  serverModelExamples=state.model?.examples||0;
  serverSpecialExamples=state.specialModel?.examples||0;
  serverGoStopExamples=state.goStopModel?.examples||0;
  serverReady=true;lastError=null;
 }catch(error){serverReady=false;lastError=String(error.message||error);}
}

const TEXT={
en:['Review this Training move','The recommended move and your chosen move were different. Which was strategically better?','Recommendation','Your move','My move was better','Recommendation was better','Not sure / experiment','Turn off feedback','Saved. Only confirmed feedback will train the separate model.'],
ko:['훈련 수 검토','추천 수와 실제 선택이 다릅니다. 전략적으로 어떤 수가 더 좋습니까?','추천 수','실제 수','내 선택이 더 좋음','추천 수가 더 좋음','모르겠음 / 실험','피드백 끄기','확인된 피드백만 별도 학습 모델에 사용합니다.'],
es:['Revisar jugada','Elegiste una jugada distinta. ¿Cuál era mejor?','Recomendación','Tu jugada','Mi jugada era mejor','La recomendación era mejor','No estoy seguro / prueba','Desactivar feedback','Solo el feedback confirmado entrena el modelo separado.'],
fr:['Évaluer ce coup','Votre choix diffère du conseil. Quel coup était le meilleur ?','Conseil','Votre coup','Mon coup était meilleur','Le conseil était meilleur','Je ne sais pas / essai','Désactiver le retour','Seuls les avis confirmés entraînent le modèle séparé.'],
de:['Zug bewerten','Dein Zug weicht vom Vorschlag ab. Welcher war strategisch besser?','Vorschlag','Dein Zug','Mein Zug war besser','Der Vorschlag war besser','Unsicher / Test','Feedback ausschalten','Nur bestätigte Rückmeldungen trainieren das separate Modell.'],
ja:['手の比較','おすすめと別の手を選びました。戦略的にどちらが良いですか？','おすすめ','あなたの手','自分の手が良い','おすすめが良い','不明 / 試しただけ','確認をオフ','確認済みの評価のみ別の学習モデルに使用します。'],
zh:['复盘出牌','你的出牌与推荐不同。哪一种策略更好？','推荐出牌','你的出牌','我的出牌更好','推荐出牌更好','不确定 / 只是尝试','关闭反馈','只有确认的反馈才用于独立模型训练。']
};
// Labels are separate from strategy recommendations and never affect gameplay.
const SPECIAL_ACTION_LABELS={
 en:{shake:'Shake',keepForBomb:'Keep for Bomb',bomb:'Bomb',playOne:'Play One',go:'GO',stop:'STOP'},
 ko:{shake:'흔들기',keepForBomb:'폭탄 기회 유지',bomb:'폭탄',playOne:'한 장 내기',go:'고',stop:'스톱'},
 es:{shake:'Sacudir',keepForBomb:'Guardar para bomba',bomb:'Bomba',playOne:'Jugar una carta',go:'Ir',stop:'Parar'},
 fr:{shake:'Secouer',keepForBomb:'Garder pour une bombe',bomb:'Bombe',playOne:'Jouer une carte',go:'GO',stop:'STOP'},
 de:{shake:'Schütteln',keepForBomb:'Für Bombe behalten',bomb:'Bombe',playOne:'Eine Karte spielen',go:'GO',stop:'STOP'},
 ja:{shake:'振り',keepForBomb:'爆弾用に残す',bomb:'爆弾',playOne:'1枚出す',go:'ゴー',stop:'ストップ'},
 zh:{shake:'摇牌',keepForBomb:'保留炸弹机会',bomb:'炸弹',playOne:'出一张',go:'继续',stop:'停止'}
};
const specialActionLabel=(action,context)=>{
 const label=(SPECIAL_ACTION_LABELS[document.documentElement.lang]||SPECIAL_ACTION_LABELS.en)[action]||action;
 return action==='shake'?label+' (×'+(context.month>=11?4:2)+')':label;
};
const GUEST_COPY={
 en:['Sign in to the authorized development expert account to save feedback and train the server model. No feedback will be saved from this session.','Not saved. Sign in to the authorized development expert account before playing to submit feedback.'],
 ko:['피드백을 저장하고 서버 모델을 학습시키려면 승인된 개발 전문가 계정으로 로그인하세요. 현재 피드백은 저장되지 않습니다.','저장되지 않았습니다. 피드백을 보내려면 게임 시작 전에 승인된 개발 전문가 계정으로 로그인하세요.'],
 es:['Inicia sesión con la cuenta experta autorizada de desarrollo para guardar comentarios y entrenar el modelo. No se guardarán datos de esta sesión.','No guardado. Inicia sesión con la cuenta experta autorizada antes de jugar.'],
 fr:['Connectez-vous au compte expert de développement autorisé pour enregistrer vos avis et entraîner le modèle. Aucun avis ne sera enregistré.','Non enregistré. Connectez-vous au compte expert autorisé avant de jouer.'],
 de:['Melde dich mit dem autorisierten Entwicklungsexpertenkonto an, um Feedback zu speichern und das Modell zu trainieren. Hier wird nichts gespeichert.','Nicht gespeichert. Melde dich vor dem Spiel mit dem autorisierten Expertenkonto an.'],
 ja:['フィードバックの保存とサーバーモデルの学習には、承認された開発用エキスパートアカウントでログインしてください。このセッションの内容は保存されません。','保存されませんでした。プレイ前に承認済みの開発用エキスパートアカウントでログインしてください。'],
 zh:['如需保存反馈并训练服务器模型，请登录获授权的开发专家账号。本次会话的反馈不会保存。','未保存。请在开始游戏前登录获授权的开发专家账号。']
};
const $=id=>document.getElementById(id);
const locale=()=>TEXT[document.documentElement.lang]||TEXT.en;
const enabled=()=>localStorage.getItem(ENABLE_KEY)!=='false';
const verifiedAccount=()=>!!approvedEmail&&String(globalThis.GoStopRanked?.getAccount?.()?.email||'').trim().toLowerCase()===approvedEmail;
// The real GoStopEngine exports masterDeck as an ARRAY. Test-only adapters can
// expose a function. Support both without changing or monkey-patching game code.
const sourceDeck=globalThis.GoStopEngine?.masterDeck;
const deckItems=typeof sourceDeck==='function'?sourceDeck():sourceDeck;
const deck=new Map((Array.isArray(deckItems)?deckItems:[]).map(c=>[c.id,c]));
const card=id=>deck.get(id)||null;
const onTable=()=>[...document.querySelectorAll('#floor [data-card-id]')].map(el=>el.dataset.cardId).filter(Boolean);
const inHand=()=>[...document.querySelectorAll('#playerHand .hand-card[data-card-id]')].filter(el=>!el.disabled).map(el=>el.dataset.cardId).filter(Boolean);
const captured=selector=>[...document.querySelectorAll(selector+' [data-card-id]')].map(el=>el.dataset.cardId).filter(Boolean);
const picture=id=>{
 const c=card(id);
 const name=globalThis.GoStopTrainingLocales?.cardName?.(document.documentElement.lang,c);
 const el=id&&document.querySelector('[data-card-id="'+id+'"] img');
 return name||el?.alt||id||'—';
};
const moveId=(h,t)=>h+'|'+(t||'-');
// The native engine treats a three-card floor stack as ONE automatic target.
// Do not mistake its three visible cards for a two-target choice dialog.
const effectiveFloorTargets=floorIds=>{
 const stackTargets=new Map();
 document.querySelectorAll('#floor .floor-stack-three[data-stack-month]').forEach(el=>{
  const ids=[...el.querySelectorAll('.floor-card[data-card-id]')].map(x=>x.dataset.cardId).filter(Boolean);
  if(ids.length===3)stackTargets.set(Number(el.dataset.stackMonth),ids.at(-1));
 });
 return floorIds.filter(id=>!stackTargets.has(card(id)?.month)||stackTargets.get(card(id)?.month)===id);
};
const legalMoves=(handIds,floorIds)=>{
 const targets=effectiveFloorTargets(floorIds).map(card).filter(Boolean);
 return handIds.flatMap(handId=>{
  const h=card(handId);if(!h)return[];
  const matched=targets.filter(t=>t.month===h.month);
  return (matched.length?matched:[null]).map(t=>({card:h,target:t,moveId:moveId(handId,t?.id)}));
 });
};
let active=false,gameId=null,confirmedCount=0,lastHand=null,showing=false,alreadyCompleted=false,hadDisagreement=false,reviewing=false;
const pendingUploads=new Set();
const modal=document.createElement('dialog');
modal.id='trainingFeedbackDialog';
modal.setAttribute('aria-label','Training move feedback');
modal.style.cssText='max-width:min(510px,calc(100vw - 28px));width:100%;background:#1b120e;color:#f6ddb1;border:2px solid #a87a36;border-radius:14px;box-shadow:0 18px 55px #000b;padding:20px;font:600 15px/1.55 system-ui,sans-serif;';
const shade=document.createElement('style');
shade.textContent='#trainingFeedbackDialog::backdrop{background:rgba(0,0,0,.62)}#trainingFeedbackDialog button{font:inherit;cursor:pointer;border-radius:9px;padding:10px;border:1px solid #aa7b37;background:#503226;color:#f7dcad}#trainingFeedbackDialog button:focus-visible{outline:3px solid #fbd686;outline-offset:2px}#trainingFeedbackDialog .feedback-actions{display:grid;grid-template-columns:1fr;gap:9px}';
document.head.appendChild(shade);document.body.appendChild(modal);
function ensureGame(){if(!gameId){gameId='dev-training-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);alreadyCompleted=false;}}
// Only an acknowledged isolated DEVELOPMENT model activation warrants the update dialog.
const UPDATE_TEXT={
 en:'Update was made. New Training weights are now active on the DEVELOPMENT learning server for your next Training game. No production deployment occurred.',
 ko:'업데이트가 완료되었습니다. 새로운 학습 가중치가 개발 서버에 적용되어 다음 훈련 게임부터 사용됩니다. 운영 서버에는 배포되지 않았습니다.',
 es:'Actualización realizada. Los nuevos pesos están activos en el servidor de desarrollo para la siguiente partida. Producción no cambió.',
 fr:'Mise à jour effectuée. Les nouveaux poids sont actifs sur le serveur de développement dès la prochaine partie. La production reste inchangée.',
 de:'Update abgeschlossen. Die neuen Gewichte sind ab dem nächsten Trainingsspiel auf dem Entwicklungsserver aktiv. Produktion ist unverändert.',
 ja:'更新が完了しました。新しい学習重みは開発サーバーに反映され、次の練習ゲームから有効です。本番環境は変更されません。',
 zh:'更新完成。新权重已在开发学习服务器启用，将用于下一局训练。生产环境未更改。'
};
function showUpdateMade(result={}){
 if(!active)return;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label','Training model update');
 dialog.style.cssText=modal.style.cssText;
 const message=document.createElement('p');
 const version=Number.isInteger(result.developmentModelVersion)?result.developmentModelVersion:null;
 message.textContent=(UPDATE_TEXT[document.documentElement.lang]||UPDATE_TEXT.en)+
  (version?' (v'+version+')':'');
 const ok=document.createElement('button');
 ok.type='button';ok.textContent='OK';
 ok.style.cssText='font:inherit;cursor:pointer;border-radius:9px;padding:10px 22px;border:1px solid #aa7b37;background:#503226;color:#f7dcad';
 ok.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.append(message,ok);document.body.append(dialog);
 try{dialog.showModal();}catch(_){dialog.remove();}
}

const REVIEW_COPY={
 en:{heading:'Review your Training decisions',intro:'Review every disagreement before training. Remove incorrect judgments, then press Finish to keep only the remaining feedback.',recommend:'Recommendation',played:'Your move',judgment:'Your judgment',remove:'Remove',confirm:'Are you sure?',yes:'Yes',no:'No',finish:'Finish',empty:'No disagreements to review.',loading:'Loading saved game feedback…',saving:'Finalizing confirmed judgments…',failed:'Unable to retrieve or finalize feedback. Nothing has been trained.',retry:'Retry',refresh:'Reload review',done:'Feedback finalized.',removed:'removed',kept:'remaining'},
 ko:{heading:'훈련 판단 최종 검토',intro:'추천과 다른 선택을 모두 검토하세요. 잘못 판단한 항목을 삭제하고 완료를 누르면 남은 피드백만 학습에 사용됩니다.',recommend:'추천',played:'내 선택',judgment:'내 판단',remove:'삭제',confirm:'정말 삭제하시겠습니까?',yes:'예',no:'아니요',finish:'완료',empty:'검토할 차이가 없습니다.',loading:'피드백 불러오는 중…',saving:'최종 피드백 저장 중…',failed:'피드백 저장에 실패했습니다. 학습하지 않았습니다.',retry:'재시도',refresh:'다시 불러오기',done:'최종 피드백 저장 완료.',removed:'삭제됨',kept:'유지됨'},
 es:{heading:'Revisión final de entrenamiento',intro:'Revise cada desacuerdo, elimine los juicios incorrectos y pulse Finalizar para entrenar solo con los restantes.',recommend:'Recomendación',played:'Tu jugada',judgment:'Tu valoración',remove:'Eliminar',confirm:'¿Estás seguro?',yes:'Sí',no:'No',finish:'Finalizar',empty:'No hay desacuerdos.',loading:'Cargando…',saving:'Guardando revisión…',failed:'Error de guardado. No se ha entrenado.',retry:'Reintentar',refresh:'Volver a cargar',done:'Revisión finalizada.',removed:'eliminados',kept:'restantes'},
 fr:{heading:'Révision finale',intro:'Examinez les désaccords, retirez les jugements incorrects, puis terminez pour entraîner uniquement avec ceux conservés.',recommend:'Conseil',played:'Votre coup',judgment:'Votre jugement',remove:'Retirer',confirm:'Êtes-vous sûr ?',yes:'Oui',no:'Non',finish:'Terminer',empty:'Aucun désaccord.',loading:'Chargement…',saving:'Enregistrement…',failed:'Échec de l’enregistrement. Aucun entraînement.',retry:'Réessayer',refresh:'Actualiser',done:'Révision terminée.',removed:'retirés',kept:'conservés'},
 de:{heading:'Abschließende Trainingsprüfung',intro:'Prüfen Sie alle Abweichungen, entfernen Sie falsche Bewertungen und bestätigen Sie nur die verbleibenden mit Fertig.',recommend:'Empfehlung',played:'Dein Zug',judgment:'Dein Urteil',remove:'Entfernen',confirm:'Bist du sicher?',yes:'Ja',no:'Nein',finish:'Fertig',empty:'Keine Abweichungen.',loading:'Lädt…',saving:'Speichert…',failed:'Speichern fehlgeschlagen. Kein Training.',retry:'Erneut versuchen',refresh:'Neu laden',done:'Prüfung abgeschlossen.',removed:'entfernt',kept:'behalten'},
 ja:{heading:'学習内容の最終確認',intro:'推奨と異なる判断を確認し、誤ったものを削除してから完了を押してください。残りだけ学習します。',recommend:'推奨',played:'自分の手',judgment:'自分の判断',remove:'削除',confirm:'本当に削除しますか？',yes:'はい',no:'いいえ',finish:'完了',empty:'相違はありません。',loading:'読み込み中…',saving:'確定中…',failed:'保存に失敗しました。学習されていません。',retry:'再試行',refresh:'再読み込み',done:'確定しました。',removed:'削除',kept:'残り'},
 zh:{heading:'训练反馈最终审核',intro:'检查所有与推荐不同的选择，删除错误判断后点击完成，仅用剩余反馈训练。',recommend:'推荐',played:'你的出牌',judgment:'你的判断',remove:'移除',confirm:'确定要移除吗？',yes:'是',no:'否',finish:'完成',empty:'没有不同的选择。',loading:'正在加载…',saving:'正在保存…',failed:'保存失败，尚未训练。',retry:'重试',refresh:'重新加载',done:'审核完成。',removed:'已移除',kept:'保留'}
};
const WEIGHT_COPY={
 en:{
  heading:'Training and weight activation',training:'When training happens',
  trainNow:n=>n+' confirmed judgment'+(n===1?'':'s')+' will train server-side weights when you press Finish.',
  trainNone:'No confirmed judgments are retained. This game still counts, but no weights will be trained from it.',
  activation:'When updated weights become active',
  activationRule:'On the DEVELOPMENT learning server after 20 completed games, or 10 consecutive disagreement-free games after a previous disagreement. New confirmed weights must exist. No production deployment occurs.',
  countdown:'Games remaining after you press Finish',
  twenty:n=>'20-game path: '+n+' more game'+(n===1?'':'s'),
  clean:n=>'Clean-game path: '+n+' more consecutive disagreement-free game'+(n===1?'':'s'),
  unavailableClean:'Clean-game path starts after a disagreement has occurred since the previous activation.',
  due:'Activation threshold reached with this Finish, if new trained weights are available.',
  waiting:'The threshold alone cannot activate weights without new confirmed training data.',
  conditional:'Counts assume future games qualify. Any new disagreement resets the clean-game streak.',
  unavailable:'Current learning-server countdown is unavailable; do not assume an activation date.',
  saving:'Training confirmed judgments and checking development weight activation…',
  applying:'Checking the activation threshold and applying eligible development weights…',
  doneTraining:n=>n+' confirmed judgment'+(n===1?'':'s')+' trained on the development server.',
  noTraining:'No judgments trained this game.',
  activated:v=>'Update was made: development weight version '+v+' is now active for your next Training game.',
  noActivation:'Updated weights were not activated this game.',
  developmentOnly:'Development-only weights. Main game code and production remain unchanged.'
 },
 ko:{
  heading:'학습 및 가중치 적용',training:'학습 시점',
  trainNow:n=>'완료를 누르면 확정된 판단 '+n+'건이 개발 서버에서 학습됩니다.',
  trainNone:'남겨 둔 확정 판단이 없습니다. 게임 횟수에는 포함되지만 이번 게임의 가중치 학습은 없습니다.',
  activation:'새 가중치가 활성화되는 시점',
  activationRule:'개발 학습 서버에서 20게임 완료 또는 이전 의견 차이 발생 후 연속 10게임 의견 차이 없음 조건을 충족하고 새 학습 가중치가 있을 때 적용합니다. 운영 서버는 변경되지 않습니다.',
  countdown:'이번 게임 완료 후 남은 게임 수',
  twenty:n=>'20게임 조건: '+n+'게임 남음',
  clean:n=>'연속 일치 조건: '+n+'게임 더 연속 일치 필요',
  unavailableClean:'이전 가중치 적용 이후 의견 차이가 발생해야 연속 일치 조건이 시작됩니다.',
  due:'이번 완료로 적용 조건에 도달합니다. 새 가중치가 있어야 활성화됩니다.',
  waiting:'새로 확정되어 학습된 가중치가 없으면 횟수 조건만으로 활성화되지 않습니다.',
  conditional:'앞으로 의견 차이가 없다는 가정의 예상치입니다. 의견 차이가 생기면 연속 일치 횟수는 초기화됩니다.',
  unavailable:'개발 학습 서버의 현재 횟수를 확인할 수 없습니다.',
  saving:'확정된 판단을 학습하고 개발 가중치 적용 조건을 확인하는 중…',
  applying:'개발 가중치 적용 조건을 확인하고 적용 중…',
  doneTraining:n=>'확정 판단 '+n+'건을 개발 서버에서 학습했습니다.',
  noTraining:'이번 게임에서 학습한 판단이 없습니다.',
  activated:v=>'업데이트 완료: 개발 가중치 버전 '+v+'이 다음 훈련 게임부터 적용됩니다.',
  noActivation:'이번 게임에서는 새 가중치가 활성화되지 않았습니다.',
  developmentOnly:'개발 전용입니다. 메인 게임 코드 및 운영 서버는 변경되지 않았습니다.'
 }
};
const weightCopy=()=>WEIGHT_COPY[document.documentElement.lang]||WEIGHT_COPY.en;
const reviewCopy=()=>REVIEW_COPY[document.documentElement.lang]||REVIEW_COPY.en;
const reviewModal=document.createElement('dialog');reviewModal.id='trainingFinalReviewDialog';
reviewModal.setAttribute('aria-label','Final Training decision review');
reviewModal.style.cssText=modal.style.cssText+
 'max-width:min(780px,calc(100vw - 24px));max-height:85vh;overflow:auto;z-index:100001;';
const reviewConfirmation=document.createElement('dialog');reviewConfirmation.id='trainingReviewRemoveConfirm';
reviewConfirmation.setAttribute('aria-label','Confirm removal of Training feedback');
reviewConfirmation.style.cssText=modal.style.cssText+
 'max-width:min(400px,calc(100vw - 24px));z-index:100002;';
const reviewCss=document.createElement('style');
reviewCss.textContent=`#trainingFinalReviewDialog::backdrop,#trainingReviewRemoveConfirm::backdrop{background:rgba(0,0,0,.68)}
#trainingFinalReviewDialog button,#trainingReviewRemoveConfirm button{font:inherit;border:1px solid #ad823d;background:#503226;color:#ffe6b6;border-radius:8px;padding:9px 15px;cursor:pointer}
#trainingFinalReviewDialog button:focus-visible,#trainingReviewRemoveConfirm button:focus-visible{outline:3px solid #fbd686}
#trainingFinalReviewDialog button:disabled{opacity:.55;cursor:default}
#trainingFinalReviewDialog .training-final-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #775333;border-radius:10px;padding:12px;margin:9px 0}
#trainingFinalReviewDialog .training-final-row>div{flex:1;min-width:0;overflow-wrap:anywhere}
#trainingFinalReviewDialog .training-final-footer{position:sticky;bottom:-20px;background:#1b120e;padding:12px 0 0;display:flex;justify-content:flex-end;gap:12px}
#trainingFinalReviewDialog .training-final-footer button:last-child{background:#8c3527}
#trainingFinalReviewDialog .training-final-row small{display:block;color:#c8ad85;font-size:12px}
#trainingFinalReviewDialog .training-model-progress{border:1px solid #765c41;border-radius:10px;padding:12px 14px;margin:12px 0;background:#2b211a}
#trainingFinalReviewDialog .training-model-progress h3{font-size:15px;color:#f9d392;margin:0 0 8px}
#trainingFinalReviewDialog .training-model-progress p{font-size:12px;color:#e6d5b9;line-height:1.5;margin:5px 0}
#trainingFinalReviewDialog .training-model-progress strong{color:#f7d69d}
#trainingModelCompletionNotice{border:1px solid #a77a43;background:#302218;color:#f7deb4;border-radius:9px;padding:10px 12px;margin:12px 0;font-size:13px;line-height:1.45}
#trainingModelCompletionNotice p{margin:4px 0}
@media(max-width:510px){#trainingFinalReviewDialog .training-final-row{align-items:flex-start}#trainingFinalReviewDialog .training-final-row button{flex:none}}`;
document.head.appendChild(reviewCss);document.body.append(reviewModal,reviewConfirmation);
// Don't intercept any browser or gameplay input. If Escape closes the
// mandatory review, reopen it on the next task: only Finish can commit the
// reviewed labels. Escape on the per-row confirmation behaves like No.
reviewModal.addEventListener('close',()=>{
 if(reviewing&&!alreadyCompleted&&active){
  setTimeout(()=>{
   if(reviewing&&!alreadyCompleted&&active&&!reviewModal.open)
    try{reviewModal.showModal();}catch(_){}
  },0);
 }
});
let reviewState=null,removedReviews=new Set(),reviewBusy=false,reviewServerState=null;
function reviewDetail(entry){
 const text=reviewCopy();
 const cards=id=>String(id||'').split('|').filter(Boolean);
 const move=id=>{const [handId,targetId]=cards(id);
  return picture(handId)+(targetId&&targetId!=='-'?' → '+picture(targetId):'');};
 if(entry.kind==='opening')return [
  text.recommend+': '+(entry.suggested||[]).join(', '),
  text.played+': '+(entry.selected||[]).join(', ')
 ];
 if(entry.kind==='go-stop'||entry.kind==='special')return [
  text.recommend+': '+specialActionLabel(entry.recommendedAction,entry.context),
  text.played+': '+specialActionLabel(entry.playedAction,entry.context)
 ];
 return [text.recommend+': '+move(entry.recommendedId),
  text.played+': '+move(entry.playedId)];
}
function reviewJudgment(choice){
 const copy=locale();
 return choice==='mine'?copy[4]:choice==='recommended'?copy[5]:
  choice==='unsure'?copy[6]:choice==='confirmed'?reviewCopy().played:choice;
}
function confirmedKeptItems(items){
 return items.filter(item=>item.choice==='mine'||item.choice==='recommended'||item.choice==='confirmed').length;
}
function currentProgress({includeCurrentGame=true}={}){
 if(!reviewServerState||!weightProgress?.progress)return null;
 return weightProgress.progress(reviewServerState,{
  includeCurrentGame,
  hadDisagreement:!!(reviewState?.items?.length||hadDisagreement)
 });
}
function trainingProgressPanel(items){
 const t=weightCopy(),section=document.createElement('section');
 section.id='trainingModelProgressPanel';section.className='training-model-progress';
 const heading=document.createElement('h3');heading.textContent=t.heading;section.append(heading);
 const line=(label,value)=>{
  const p=document.createElement('p');
  const strong=document.createElement('strong');strong.textContent=label+': ';
  p.append(strong,document.createTextNode(value));section.append(p);
 };
 const confirmed=confirmedKeptItems(items);
 line(t.training,confirmed?t.trainNow(confirmed):t.trainNone);
 line(t.activation,t.activationRule);
 const preview=currentProgress();
 if(preview){
  line(t.countdown,t.twenty(preview.remaining20));
  const clean=document.createElement('p');clean.id='trainingCleanCountdown';
  clean.textContent=preview.remainingClean===null?
   t.unavailableClean:t.clean(preview.remainingClean);
  section.append(clean);
  if(preview.eligible){
   const due=document.createElement('p');due.id='trainingActivationDue';
   due.textContent=t.due;section.append(due);
  }
  if(!preview.hasUnactivatedWeights&&!confirmed){
   const warning=document.createElement('p');warning.textContent=t.waiting;section.append(warning);
  }
  const note=document.createElement('p');note.textContent=t.conditional;section.append(note);
 }else{
  const warn=document.createElement('p');warn.id='trainingCountdownUnavailable';
  warn.textContent=t.unavailable;section.append(warn);
 }
 return section;
}
function showTrainingCompletion(result){
 const t=weightCopy();
 const dialog=$('resultDialog');
 const card=dialog?.querySelector('.dialog-card');
 if(!card)return;
 let notice=$('trainingModelCompletionNotice');
 if(!notice){notice=document.createElement('aside');notice.id='trainingModelCompletionNotice';notice.setAttribute('role','status');card.append(notice);}
 notice.replaceChildren();
 const line=value=>{const p=document.createElement('p');p.textContent=value;notice.append(p);};
 const trained=Number.isSafeInteger(result.trained)?result.trained:0;
 line(trained>0?t.doneTraining(trained):t.noTraining);
 if(result.developmentModelUpdated===true){
  line(t.activated(result.developmentModelVersion||'new'));
 }else{
  line(t.noActivation);
  if(serverWeightState&&weightProgress?.progress){
   const next=weightProgress.progress(serverWeightState);
   line(t.twenty(next.remaining20));
   line(next.remainingClean===null?t.unavailableClean:t.clean(next.remainingClean));
  }else line(t.unavailable);
 }
 line(t.developmentOnly);
}
function renderReview(){
 const t=reviewCopy();
 reviewModal.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=t.heading;
 heading.style.cssText='margin:0 0 8px;font-size:20px';
 const description=document.createElement('p');description.textContent=t.intro;
 description.style.cssText='font-size:13px;color:#d8bb8c;line-height:1.5';
 const list=document.createElement('section');list.setAttribute('aria-label','Disagreements');
 const items=(reviewState?.items||[]).filter(item=>!removedReviews.has(item.id));
 for(const [index,item] of items.entries()){
  const row=document.createElement('div');row.className='training-final-row';
  row.dataset.reviewId=item.id;
  const summary=document.createElement('div');
  const headingText=document.createElement('strong');
  headingText.textContent='#'+(index+1)+' · '+(item.kind==='opening'?'Opening':item.kind==='go-stop'?'GO / STOP':item.kind==='special'?'Shake / Bomb':'Move');
  summary.append(headingText);
  for(const line of reviewDetail(item)){
   const x=document.createElement('small');x.textContent=line;summary.append(x);
  }
  const judgement=document.createElement('small');
  judgement.textContent=t.judgment+': '+reviewJudgment(item.choice);summary.append(judgement);
  const remove=document.createElement('button');remove.type='button';
  remove.textContent=t.remove;
  remove.addEventListener('click',()=>{
   reviewConfirmation.replaceChildren();
   const prompt=document.createElement('p');prompt.textContent=t.confirm;
   const actions=document.createElement('div');
   actions.style.cssText='display:flex;justify-content:flex-end;gap:10px';
   const yes=document.createElement('button');yes.type='button';yes.textContent=t.yes;
   const no=document.createElement('button');no.type='button';no.textContent=t.no;
   yes.addEventListener('click',()=>{
    removedReviews.add(item.id);reviewConfirmation.close();renderReview();
   });
   no.addEventListener('click',()=>reviewConfirmation.close());
   actions.append(no,yes);reviewConfirmation.append(prompt,actions);
   reviewConfirmation.showModal();
  });
  row.append(summary,remove);list.append(row);
 }
 if(!items.length){
  const empty=document.createElement('p');empty.textContent=t.empty;list.append(empty);
 }
 const status=document.createElement('p');status.id='trainingFinalReviewStatus';
 status.setAttribute('role','status');status.style.cssText='color:#f4cd8c;min-height:22px';
 status.textContent=items.length+' '+t.kept+' · '+removedReviews.size+' '+t.removed;
 const footer=document.createElement('div');footer.className='training-final-footer';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent=t.refresh;
 refresh.addEventListener('click',()=>void loadReview());
 const finish=document.createElement('button');finish.type='button';finish.id='trainingReviewFinish';
 finish.textContent=t.finish;
 finish.addEventListener('click',async()=>{
  if(reviewBusy||!reviewState||!cloud?.finalize)return;
  reviewBusy=true;finish.disabled=true;refresh.disabled=true;
  const preview=currentProgress();
  status.textContent=preview?.eligible?weightCopy().applying:weightCopy().saving;
  try{
   const keptFeedbackIds=reviewState.items.filter(item=>!removedReviews.has(item.id))
    .map(item=>item.id);
   const result=await cloud.finalize(gameId,{
    reviewVersion:reviewState.reviewVersion,keptFeedbackIds,hadDisagreement
   });
   if(!result?.ok)throw new Error('Finalization not acknowledged.');
   alreadyCompleted=true;reviewing=false;gameId=null;confirmedCount=0;hadDisagreement=false;
   reviewModal.close();reviewState=null;removedReviews.clear();reviewServerState=null;
   await syncStatus();
   showTrainingCompletion(result);
   if(result.developmentModelUpdated===true)showUpdateMade(result);
  }catch(error){
   lastError=String(error.message||error);serverReady=false;
   status.textContent=t.failed+' '+lastError;
   finish.disabled=false;refresh.disabled=false;
  }finally{reviewBusy=false;}
 });
 footer.append(refresh,finish);
 reviewModal.append(heading,description,list,trainingProgressPanel(items),status,footer);
}
async function loadReview(){
 if(!cloud?.review||!gameId)throw new Error('Review API is unavailable.');
 const t=reviewCopy();
 reviewBusy=true;
 try{
  const [current,serverState]=await Promise.all([
   cloud.review(gameId),cloud.state().catch(()=>null)
  ]);
  if(!current?.ok||current.complete)throw new Error('Game review is unavailable.');
  reviewState=current;reviewServerState=serverState?.ok?serverState:null;
  removedReviews=new Set();renderReview();
 }catch(error){
  lastError=String(error.message||error);serverReady=false;
  reviewModal.replaceChildren();
  const status=document.createElement('p');status.setAttribute('role','alert');
  status.textContent=t.failed+' '+lastError;
  const retry=document.createElement('button');retry.type='button';retry.textContent=t.retry;
  retry.addEventListener('click',()=>void loadReview());
  reviewModal.append(status,retry);
 }finally{reviewBusy=false;}
}
function completion(){
 if(!active||!gameId||alreadyCompleted||reviewing||!$('resultDialog')?.open)return;
 if(!verifiedAccount()){alreadyCompleted=true;return;}
 reviewing=true;
 // Wait for all currently pending server draft writes before requesting the
 // authoritative list; only Finish can submit a complete game for training.
 void (async()=>{
  await Promise.allSettled([...pendingUploads]);
  if(showing||queue.length){
   reviewing=false;setTimeout(completion,100);return;
  }
  if(!active||alreadyCompleted)return;
  reviewModal.showModal();await loadReview();
 })().catch(error=>{
  reviewing=false;lastError=String(error.message||error);serverReady=false;
 });
}

const watchResult=new MutationObserver(completion);
if($('resultDialog'))watchResult.observe($('resultDialog'),{attributes:true,attributeFilter:['open']});
async function safeRecord(data,label,choice){
 if(!cloud)throw new Error('Cloud learning is not configured. No feedback was saved.');
 if(!verifiedAccount())throw new Error('Please sign in to the authorized development account.');
 ensureGame();
 const upload=data.kind==='go-stop'?
  cloud.goStopFeedback({
   gameId,feedbackId:crypto.randomUUID(),choice,reviewRequired:true,
   recommendedAction:data.recommended.action,playedAction:data.played.action,
   legalActions:data.legalActions,context:data.context,visible:data.visible
  }):data.kind==='special'?
  cloud.specialFeedback({
   gameId,feedbackId:crypto.randomUUID(),choice,reviewRequired:true,
   recommendedAction:data.recommended.action,playedAction:data.played.action,
   legalActions:data.legalActions,context:data.context,visible:data.visible
  }):
  cloud.feedback({
   gameId,feedbackId:crypto.randomUUID(),choice,reviewRequired:true,
   recommended:data.recommended,played:data.played,legalMoves:data.legalMoves,visible:data.visible
  });
 pendingUploads.add(upload);
 try{
  await upload;
  serverFeedbackCount++;
  if(label&&((data.kind==='special'||data.kind==='go-stop')?
      data.legalActions.includes(label):data.legalMoves.some(m=>m.moveId===label)))confirmedCount++;
  serverReady=true;lastError=null;
  completion();
 }catch(error){
  lastError=String(error.message||error);serverReady=false;
  throw error;
 }finally{pendingUploads.delete(upload);}
}
function feedbackDialog(data){
 if(!active||!enabled()||showing)return;
 showing=true;
 const [title,desc,recLabel,myLabel,chooseMine,chooseRec,unsure,off,done]=locale();
 modal.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=title;heading.style.cssText='font-size:20px;margin:0 0 7px';
 const intro=document.createElement('p');intro.textContent=desc;intro.style.cssText='margin:0 0 14px;color:#d8bb8c';
 const comparison=document.createElement('div');comparison.style.cssText='display:grid;gap:5px;margin-bottom:16px';
 for(const [label,move] of [[recLabel,data.recommended],[myLabel,data.played]]){
  const line=document.createElement('div');
  line.textContent=label+': '+((data.kind==='special'||data.kind==='go-stop')?
   specialActionLabel(move.action,data.context):picture(move.hand)+(move.target?' → '+picture(move.target):''));
  comparison.appendChild(line);
 }
 const actions=document.createElement('div');actions.className='feedback-actions';
 const canSubmit=verifiedAccount();
 if(!canSubmit){
  const notice=document.createElement('p');
  notice.setAttribute('role','status');
  notice.style.cssText='color:#f0cf91;margin:0 0 12px';
  notice.textContent=(GUEST_COPY[document.documentElement.lang]||GUEST_COPY.en)[0];
  comparison.appendChild(notice);
 }
 const errorLine=document.createElement('p');
 errorLine.setAttribute('role','alert');errorLine.style.cssText='color:#ffbfbd;margin:8px 0 0';
 const answer=(text,choice)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{
  if(choice==='off'){localStorage.setItem(ENABLE_KEY,'false');modal.close();return;}
  // Reviewing a disagreement is allowed before login. Server-side learning
  // remains restricted to the verified expert; never claim an unsaved choice
  // was recorded, and never store training data on the device.
  if(!canSubmit){errorLine.textContent=(GUEST_COPY[document.documentElement.lang]||GUEST_COPY.en)[1];return;}
  const chosen=(data.kind==='special'||data.kind==='go-stop')?
    (choice==='mine'?data.played.action:choice==='recommended'?data.recommended.action:null):
    (choice==='mine'?moveId(data.played.hand,data.played.target):
      choice==='recommended'?moveId(data.recommended.hand,data.recommended.target):null);
  for(const button of actions.querySelectorAll('button'))button.disabled=true;
  errorLine.textContent='';
  try{await safeRecord(data,chosen,choice);modal.close();}
  catch(error){
   errorLine.textContent=String(error.message||error);
   for(const button of actions.querySelectorAll('button'))button.disabled=false;
  }
 };actions.appendChild(b);};
 answer(chooseMine,'mine');answer(chooseRec,'recommended');answer(unsure,'unsure');answer(off,'off');
 if(!canSubmit){
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='OK';
  dismiss.addEventListener('click',()=>modal.close());actions.appendChild(dismiss);
 }
 modal.append(heading,intro,comparison,actions,errorLine);
 modal.addEventListener('close',()=>{showing=false;if(queue.length)window.setTimeout(showNext,0);},{once:true});
 try{modal.showModal();}catch(_){showing=false;}
}
let queue=[];
function showNext(){if(showing||!queue.length)return;const x=queue.shift();feedbackDialog(x);}
function enqueue(p){if(!p)return;queue.push(p);showNext();}
// Preserve the original, visible recommendation for the CURRENT hand. The
// frozen game removes .matchable when a move begins and may temporarily
// highlight a different target during a two-target selection. We must compare
// against the first recommendation, not the interim target-choice advice.
let observedRecommendation=null,previousActivation=null;
const handSignature=()=>[...document.querySelectorAll('#playerHand .hand-card[data-card-id]')]
 .map(el=>el.dataset.cardId).filter(Boolean).sort().join('|');
function captureRecommendation(){
 if(!active)return null;
 const hand=handSignature();
 const locked=globalThis.GoStopTrainingRecommendationDev?.getStatus?.();
 const approved=locked?.locked&&locked?.hand&&locked?.floor&&hand.split('|').includes(locked.hand);
 const rec=(approved?locked.hand:null)||$('playerHand')?.querySelector('.hand-card.matchable[data-card-id]')?.dataset.cardId;
 if(rec){
  const original=(approved?locked.floor:null)||$('floor')?.querySelector('.floor-card.training-recommended[data-card-id]')?.dataset.cardId||null;
  if(!observedRecommendation||observedRecommendation.handSignature!==hand||
     observedRecommendation.hand!==rec||observedRecommendation.target!==original){
   observedRecommendation={handSignature:hand,hand:rec,target:original};
  }else if(!observedRecommendation.target&&original){
   observedRecommendation.target=original;
  }
 }
 return observedRecommendation?.handSignature===hand?observedRecommendation:null;
}
const observeCoach=new MutationObserver(()=>captureRecommendation());
if($('playerHand'))observeCoach.observe($('playerHand'),
 {subtree:true,childList:true,attributes:true,attributeFilter:['class','data-card-id','disabled']});
if($('floor'))observeCoach.observe($('floor'),
 {subtree:true,childList:true,attributes:true,attributeFilter:['class','data-card-id']});
function snapshot(){
 const handIds=inHand(),floorIds=onTable();
 return {handIds,floorIds,visible:{
  hand:handIds,floor:floorIds,humanCaptured:captured('#playerCaptured'),computerCaptured:captured('#aiCaptured')
 },legalMoves:legalMoves(handIds,floorIds)};
}
function beginDisagreement(recommended,played,observed){
 if(!recommended?.hand||!played?.hand||moveId(recommended.hand,recommended.target)===moveId(played.hand,played.target))return;
 const legal=observed.legalMoves;
 if(!legal.some(x=>x.moveId===moveId(recommended.hand,recommended.target))||
    !legal.some(x=>x.moveId===moveId(played.hand,played.target)))return;
 hadDisagreement=true;
 enqueue({recommended,played,visible:observed.visible,legalMoves:legal});
}
function onHandActivation(cardId,source='click'){
 if(!active||!enabled()||modal.open||!cardId)return;
 const el=[...document.querySelectorAll('#playerHand .hand-card[data-card-id]')]
  .find(node=>node.dataset.cardId===cardId);
 if(!el||el.disabled)return;
 // Some mobile input handlers emit gostop-hand-activate and synthesize a click.
 // Both represent ONE play, never two feedback prompts.
 const now=Date.now();
 if(previousActivation?.cardId===cardId&&now-previousActivation.at<250)return;
 previousActivation={cardId,at:now,source};
 const observed=snapshot();
 const recommendation=captureRecommendation();
 if(!recommendation||!observed.handIds.includes(recommendation.hand))return;
 const rec=recommendation.hand,recFloor=recommendation.target;
 const current=cardId;
 lastHand={current,rec,recFloor,observe:observed};
 const targets=effectiveFloorTargets(observed.floorIds).filter(id=>card(id)?.month===card(current)?.month);
 if(targets.length>1)return; // Wait until one actual table target is selected.
 const actualTarget=targets[0]||null;
 const recTargets=effectiveFloorTargets(observed.floorIds).filter(id=>card(id)?.month===card(rec)?.month);
 const originalTarget=recTargets.includes(recFloor)?recFloor:recTargets[0]||null;
 if(moveId(current,actualTarget)===moveId(rec,originalTarget))return;
 window.setTimeout(()=>{if(active)beginDisagreement({hand:rec,target:originalTarget},
  {hand:current,target:actualTarget},observed);},200);
}
function onHand(event){
 const el=event.target?.closest?.('#playerHand .hand-card[data-card-id]');
 if(el)onHandActivation(el.dataset.cardId);
}
function onTarget(event){
 if(!active||!enabled()||modal.open)return;
 const el=event.target?.closest?.('#floor .target-option[data-card-id]');
 if(!el)return;
 const target=el.dataset.cardId;
 const prior=lastHand;
 if(!prior)return;
 const chosen={hand:prior.current,target};
 const recTargets=effectiveFloorTargets(prior.observe.floorIds).filter(id=>card(id)?.month===card(prior.rec)?.month);
 const advised={hand:prior.rec,target:recTargets.includes(prior.recFloor)?prior.recFloor:recTargets[0]||null};
 lastHand=null;
 window.setTimeout(()=>{if(active)beginDisagreement(advised,chosen,prior.observe);},200);
}
// Read the frozen game's existing recommendation button classes. Never
// intercept a Shake/Bomb click or invent a strategic recommendation ourselves.
function onSpecialDecision(event){
 if(!active||!enabled()||modal.open)return;
 const selected=event.target?.closest?.('#shakeBtn,#keepSecretBtn,#bombBtn,#playOneBtn');
 const dialog=selected?.closest?.('#shakeDialog,#bombDialog');
 if(!selected||!dialog?.open)return;
 const shake=dialog.id==='shakeDialog';
 const shakeBtn=dialog.querySelector('#shakeBtn');
 const keepBtn=dialog.querySelector('#keepSecretBtn');
 const bombBtn=dialog.querySelector('#bombBtn');
 const recommendedButton=shake?
  (shakeBtn?.classList.contains('training-choice-recommended')?shakeBtn:
   keepBtn?.classList.contains('training-choice-recommended')?keepBtn:null):
  (bombBtn?.classList.contains('training-choice-recommended')?bombBtn:null);
 if(!recommendedButton||selected===recommendedButton)return;
 const bombReady=shake?recommendedButton===keepBtn:true;
 const action=button=>button?.id==='shakeBtn'?'shake':button?.id==='keepSecretBtn'?
  (bombReady?'bomb':'keepForBomb'):button?.id==='bombBtn'?'bomb':'playOne';
 const recommendedAction=action(recommendedButton),playedAction=action(selected);
 const legalActions=shake?['shake',bombReady?'bomb':'keepForBomb']:['bomb','playOne'];
 if(!legalActions.includes(recommendedAction)||!legalActions.includes(playedAction)
   ||recommendedAction===playedAction)return;
 const cardIds=[...dialog.querySelectorAll('.shake-cards [data-card-id]')].map(el=>el.dataset.cardId);
 const month=card(cardIds[0])?.month;
 if(!Number.isInteger(month)||cardIds.length<3||cardIds.length>4||
   cardIds.some(id=>card(id)?.month!==month))return;
 const visible={hand:[...document.querySelectorAll('#playerHand .hand-card[data-card-id]')].map(el=>el.dataset.cardId),
  floor:onTable(),humanCaptured:captured('#playerCaptured'),computerCaptured:captured('#aiCaptured')};
 if(cardIds.some(id=>!visible.hand.includes(id)))return;
 const observed={kind:'special',context:{kind:shake?'shake':'bomb',month,bombReady,cardIds},
  legalActions,recommended:{action:recommendedAction},played:{action:playedAction},visible};
 // Record this mismatch even if the player later answers "Not sure".
 hadDisagreement=true;
 window.setTimeout(()=>{if(active)enqueue(observed);},150);
}
// Capture the player's GO / STOP choice BEFORE the frozen game closes its
// decision dialog. No click is canceled or replayed. This is a separate
// development-only Training observation, not a gameplay rule change.
function onGoStopDecision(event){
 if(!active||!enabled()||modal.open)return;
 const selected=event.target?.closest?.('#goBtn,#stopBtn');
 const dialog=selected?.closest?.('#decisionDialog');
 if(!selected||!dialog?.open)return;
 const go=dialog.querySelector('#goBtn'),stop=dialog.querySelector('#stopBtn');
 const recommended=go?.classList.contains('training-choice-recommended')?go:
  stop?.classList.contains('training-choice-recommended')?stop:null;
 if(!recommended||recommended===selected)return;
 const action=b=>b===go?'go':'stop';
 const visible={
  hand:[...document.querySelectorAll('#playerHand .hand-card[data-card-id]')].map(el=>el.dataset.cardId),
  floor:onTable(),humanCaptured:captured('#playerCaptured'),computerCaptured:captured('#aiCaptured')
 };
 const scoreOf=id=>{
  const value=String($(id)?.textContent||'').match(/\d+/)?.[0];
  return value===undefined?null:Number(value);
 };
 const playerScore=scoreOf('playerScore'),opponentScore=scoreOf('aiScore');
 if(!Number.isInteger(playerScore)||playerScore<7||!Number.isInteger(opponentScore)||
    visible.hand.length>10)return;
 const month=id=>Number(/^m(\d+)-/.exec(id)?.[1]);
 const hasMatch=visible.hand.some(h=>visible.floor.some(f=>month(h)===month(f)));
 const goCount=scoreOf('goCount')??0;
 const observed={kind:'go-stop',legalActions:['go','stop'],
  context:{kind:'go-stop',playerScore,opponentScore,remainingCards:visible.hand.length,goCount,hasMatch},
  recommended:{action:action(recommended)},played:{action:action(selected)},visible};
 hadDisagreement=true;
 // Reserve the feedback synchronously so the end-game observer sees a pending
 // disagreement. Display on the next task, AFTER a STOP result dialog opens,
 // ensuring expert review is the topmost modal instead of hiding underneath.
 queue.push(observed);
 window.setTimeout(showNext,0);
}
document.addEventListener('click',event=>{
 const t=event.target;
 if(t?.closest?.('#trainingModeBtn')){$('trainingModelCompletionNotice')?.remove();active=true;gameId=null;confirmedCount=0;alreadyCompleted=false;reviewing=false;reviewState=null;removedReviews.clear();lastHand=null;observedRecommendation=null;previousActivation=null;hadDisagreement=false;ensureGame();void checkAccount();}
 else if(t?.closest?.('#playAgainBtn,#newGameYesBtn')&&active){
  $('trainingModelCompletionNotice')?.remove();
  // A Training replay is a NEW completed-game sample with its own opening
  // strategy review. Never reuse the prior game's feedback/identity.
  gameId=null;confirmedCount=0;alreadyCompleted=false;reviewing=false;reviewState=null;removedReviews.clear();lastHand=null;
  observedRecommendation=null;previousActivation=null;hadDisagreement=false;
  ensureGame();void checkAccount();
 }
 else if(t?.closest?.('#playSoloBtn, #quitYesBtn')){active=false;approvedEmail=null;confirmedCount=0;lastHand=null;observedRecommendation=null;previousActivation=null;gameId=null;hadDisagreement=false;reviewing=false;reviewState=null;removedReviews.clear();}
 if(t?.closest?.('#playerHand'))onHand(event);
 if(t?.closest?.('#floor'))onTarget(event);
 if(t?.closest?.('#shakeDialog,#bombDialog'))onSpecialDecision(event);
 if(t?.closest?.('#decisionDialog'))onGoStopDecision(event);
},{capture:true});
// The game's mobile flick/tap adapter dispatches this custom action instead of
// always clicking the card. Capture it without preventing the actual game move.
document.addEventListener('gostop-hand-activate',event=>{
 const id=String(event.detail?.cardId||'');
 if(id&&!event.detail?.blank)onHandActivation(id,'gesture');
},{capture:true});
Object.defineProperty(globalThis,'GoStopTrainingFeedbackDev',{value:Object.freeze({
 getStatus:()=>({enabled:enabled(),active,authorized:verifiedAccount(),gameId,confirmed:confirmedCount,
  examples:serverFeedbackCount,modelExamples:serverModelExamples,specialModelExamples:serverSpecialExamples,
  goStopModelExamples:serverGoStopExamples,serverReady,lastError,
  storage:'development-cloudflare',pendingUploads:pendingUploads.size,reviewing,reviewItems:reviewState?.items?.length||0,removedReviews:removedReviews.size}),
 exportFeedback:async()=>JSON.stringify((await cloud.history()).feedback),
 refresh:syncStatus,
 disable:()=>localStorage.setItem(ENABLE_KEY,'false'),
 enable:()=>localStorage.setItem(ENABLE_KEY,'true')
}),writable:false,configurable:true});
})();