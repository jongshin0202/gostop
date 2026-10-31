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
let serverFeedbackCount=0,serverModelExamples=0,serverSpecialExamples=0,lastError=null,serverReady=false;
async function syncStatus(){
 if(!cloud)return;
 try{
  const state=await cloud.state();
  serverFeedbackCount=state.feedbackCount||0;
  serverModelExamples=state.model?.examples||0;
  serverSpecialExamples=state.specialModel?.examples||0;
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
 en:{shake:'Shake',keepForBomb:'Keep for Bomb',bomb:'Bomb',playOne:'Play One'},
 ko:{shake:'흔들기',keepForBomb:'폭탄 기회 유지',bomb:'폭탄',playOne:'한 장 내기'},
 es:{shake:'Sacudir',keepForBomb:'Guardar para bomba',bomb:'Bomba',playOne:'Jugar una carta'},
 fr:{shake:'Secouer',keepForBomb:'Garder pour une bombe',bomb:'Bombe',playOne:'Jouer une carte'},
 de:{shake:'Schütteln',keepForBomb:'Für Bombe behalten',bomb:'Bombe',playOne:'Eine Karte spielen'},
 ja:{shake:'振り',keepForBomb:'爆弾用に残す',bomb:'爆弾',playOne:'1枚出す'},
 zh:{shake:'摇牌',keepForBomb:'保留炸弹机会',bomb:'炸弹',playOne:'出一张'}
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
const legalMoves=(handIds,floorIds)=>{
 const targets=floorIds.map(card).filter(Boolean);
 return handIds.flatMap(handId=>{
  const h=card(handId);if(!h)return[];
  const matched=targets.filter(t=>t.month===h.month);
  return (matched.length?matched:[null]).map(t=>({card:h,target:t,moveId:moveId(handId,t?.id)}));
 });
};
let active=false,gameId=null,confirmedCount=0,lastHand=null,showing=false,alreadyCompleted=false,hadDisagreement=false;
const pendingUploads=new Set();
const modal=document.createElement('dialog');
modal.id='trainingFeedbackDialog';
modal.setAttribute('aria-label','Training move feedback');
modal.style.cssText='max-width:min(510px,calc(100vw - 28px));width:100%;background:#1b120e;color:#f6ddb1;border:2px solid #a87a36;border-radius:14px;box-shadow:0 18px 55px #000b;padding:20px;font:600 15px/1.55 system-ui,sans-serif;';
const shade=document.createElement('style');
shade.textContent='#trainingFeedbackDialog::backdrop{background:rgba(0,0,0,.62)}#trainingFeedbackDialog button{font:inherit;cursor:pointer;border-radius:9px;padding:10px;border:1px solid #aa7b37;background:#503226;color:#f7dcad}#trainingFeedbackDialog button:focus-visible{outline:3px solid #fbd686;outline-offset:2px}#trainingFeedbackDialog .feedback-actions{display:grid;grid-template-columns:1fr;gap:9px}';
document.head.appendChild(shade);document.body.appendChild(modal);
function ensureGame(){if(!gameId){gameId='dev-training-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);alreadyCompleted=false;}}
// Only an acknowledged LIVE model activation warrants a success message.
const UPDATE_TEXT={
 en:'Update was made',ko:'업데이트가 완료되었습니다',es:'Actualización realizada',
 fr:'Mise à jour effectuée',de:'Aktualisierung abgeschlossen',
 ja:'更新が完了しました',zh:'更新已完成'
};
function showUpdateMade(){
 if(!active)return;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label','Training model update');
 dialog.style.cssText=modal.style.cssText;
 const message=document.createElement('p');
 message.textContent=UPDATE_TEXT[document.documentElement.lang]||UPDATE_TEXT.en;
 const ok=document.createElement('button');
 ok.type='button';ok.textContent='OK';
 ok.style.cssText='font:inherit;cursor:pointer;border-radius:9px;padding:10px 22px;border:1px solid #aa7b37;background:#503226;color:#f7dcad';
 ok.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.append(message,ok);document.body.append(dialog);
 try{dialog.showModal();}catch(_){dialog.remove();}
}
function completion(){
 if(!active||!gameId||alreadyCompleted||!$('resultDialog')?.open)return;
 alreadyCompleted=true;
 const completeId=gameId;
 const completeHadDisagreement=hadDisagreement;
 const canSubmit=verifiedAccount();
 gameId=null;confirmedCount=0;hadDisagreement=false;
 if(!canSubmit)return; // Do not send anonymous or unapproved Training data.
 // A completed game may finish before an asynchronous feedback write resolves.
 void Promise.allSettled([...pendingUploads]).then(async()=>{
  try{
   const result=cloud?await cloud.complete(completeId,{hadDisagreement:completeHadDisagreement}):null;
   await syncStatus();
   if(result?.publishedToLive===true)showUpdateMade();
  }
  catch(error){lastError=String(error.message||error);serverReady=false;}
 });
}
const watchResult=new MutationObserver(completion);
if($('resultDialog'))watchResult.observe($('resultDialog'),{attributes:true,attributeFilter:['open']});
async function safeRecord(data,label,choice){
 if(!cloud)throw new Error('Cloud learning is not configured. No feedback was saved.');
 if(!verifiedAccount())throw new Error('Please sign in to the authorized development account.');
 ensureGame();
 const upload=data.kind==='special'?
  cloud.specialFeedback({
   gameId,feedbackId:crypto.randomUUID(),choice,
   recommendedAction:data.recommended.action,playedAction:data.played.action,
   legalActions:data.legalActions,context:data.context,visible:data.visible
  }):
  cloud.feedback({
   gameId,feedbackId:crypto.randomUUID(),choice,
   recommended:data.recommended,played:data.played,legalMoves:data.legalMoves,visible:data.visible
  });
 pendingUploads.add(upload);
 try{
  await upload;
  serverFeedbackCount++;
  if(label&&(data.kind==='special'?data.legalActions.includes(label):data.legalMoves.some(m=>m.moveId===label)))confirmedCount++;
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
  line.textContent=label+': '+(data.kind==='special'?specialActionLabel(move.action,data.context):picture(move.hand)+(move.target?' → '+picture(move.target):''));
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
  const chosen=data.kind==='special'?
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
 const rec=$('playerHand')?.querySelector('.hand-card.matchable[data-card-id]')?.dataset.cardId;
 if(rec){
  const original=$('floor')?.querySelector('.floor-card.training-recommended[data-card-id]')?.dataset.cardId||null;
  if(!observedRecommendation||observedRecommendation.handSignature!==hand||
     observedRecommendation.hand!==rec){
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
 const targets=observed.floorIds.filter(id=>card(id)?.month===card(current)?.month);
 if(targets.length>1)return; // Wait until one actual table target is selected.
 const actualTarget=targets[0]||null;
 const recTargets=observed.floorIds.filter(id=>card(id)?.month===card(rec)?.month);
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
 const recTargets=prior.observe.floorIds.filter(id=>card(id)?.month===card(prior.rec)?.month);
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
document.addEventListener('click',event=>{
 const t=event.target;
 if(t?.closest?.('#trainingModeBtn')){active=true;gameId=null;confirmedCount=0;alreadyCompleted=false;lastHand=null;observedRecommendation=null;previousActivation=null;hadDisagreement=false;ensureGame();void checkAccount();}
 else if(t?.closest?.('#playSoloBtn, #quitYesBtn')){active=false;approvedEmail=null;confirmedCount=0;lastHand=null;observedRecommendation=null;previousActivation=null;gameId=null;hadDisagreement=false;}
 if(t?.closest?.('#playerHand'))onHand(event);
 if(t?.closest?.('#floor'))onTarget(event);
 if(t?.closest?.('#shakeDialog,#bombDialog'))onSpecialDecision(event);
},{capture:true});
// The game's mobile flick/tap adapter dispatches this custom action instead of
// always clicking the card. Capture it without preventing the actual game move.
document.addEventListener('gostop-hand-activate',event=>{
 const id=String(event.detail?.cardId||'');
 if(id&&!event.detail?.blank)onHandActivation(id,'gesture');
},{capture:true});
Object.defineProperty(globalThis,'GoStopTrainingFeedbackDev',{value:Object.freeze({
 getStatus:()=>({enabled:enabled(),active,authorized:verifiedAccount(),confirmed:confirmedCount,
  examples:serverFeedbackCount,modelExamples:serverModelExamples,specialModelExamples:serverSpecialExamples,serverReady,lastError,
  storage:'development-cloudflare',pendingUploads:pendingUploads.size}),
 exportFeedback:async()=>JSON.stringify((await cloud.history()).feedback),
 refresh:syncStatus,
 disable:()=>localStorage.setItem(ENABLE_KEY,'false'),
 enable:()=>localStorage.setItem(ENABLE_KEY,'true')
}),writable:false,configurable:true});
})();