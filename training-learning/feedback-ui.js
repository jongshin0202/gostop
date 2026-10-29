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
 return !!approvedEmail;
}
const RECORD_KEY='gostop-training-feedback-v1';
const MODEL_KEY='gostop-training-ml-shadow-v1';
const ENABLE_KEY='gostop-training-feedback-enabled';
const TEXT={
en:['Review this Training move','The recommended move and your chosen move were different. Which was strategically better?','Recommendation','Your move','My move was better','Recommendation was better','Not sure / experiment','Turn off feedback','Saved. Only confirmed feedback will train the separate model.'],
ko:['훈련 수 검토','추천 수와 실제 선택이 다릅니다. 전략적으로 어떤 수가 더 좋습니까?','추천 수','실제 수','내 선택이 더 좋음','추천 수가 더 좋음','모르겠음 / 실험','피드백 끄기','확인된 피드백만 별도 학습 모델에 사용합니다.'],
es:['Revisar jugada','Elegiste una jugada distinta. ¿Cuál era mejor?','Recomendación','Tu jugada','Mi jugada era mejor','La recomendación era mejor','No estoy seguro / prueba','Desactivar feedback','Solo el feedback confirmado entrena el modelo separado.'],
fr:['Évaluer ce coup','Votre choix diffère du conseil. Quel coup était le meilleur ?','Conseil','Votre coup','Mon coup était meilleur','Le conseil était meilleur','Je ne sais pas / essai','Désactiver le retour','Seuls les avis confirmés entraînent le modèle séparé.'],
de:['Zug bewerten','Dein Zug weicht vom Vorschlag ab. Welcher war strategisch besser?','Vorschlag','Dein Zug','Mein Zug war besser','Der Vorschlag war besser','Unsicher / Test','Feedback ausschalten','Nur bestätigte Rückmeldungen trainieren das separate Modell.'],
ja:['手の比較','おすすめと別の手を選びました。戦略的にどちらが良いですか？','おすすめ','あなたの手','自分の手が良い','おすすめが良い','不明 / 試しただけ','確認をオフ','確認済みの評価のみ別の学習モデルに使用します。'],
zh:['复盘出牌','你的出牌与推荐不同。哪一种策略更好？','推荐出牌','你的出牌','我的出牌更好','推荐出牌更好','不确定 / 只是尝试','关闭反馈','只有确认的反馈才用于独立模型训练。']
};
const $=id=>document.getElementById(id);
const locale=()=>TEXT[document.documentElement.lang]||TEXT.en;
const enabled=()=>localStorage.getItem(ENABLE_KEY)!=='false';
const verifiedAccount=()=>!!approvedEmail&&String(globalThis.GoStopRanked?.getAccount?.()?.email||'').trim().toLowerCase()===approvedEmail;
const deck=new Map((globalThis.GoStopEngine?.masterDeck?.()||[]).map(c=>[c.id,c]));
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
const persist=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val));return true;}catch(_){return false;}};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(_){return fallback;}};
let active=false,gameId=null,confirmed=[],pending=null,lastHand=null,showing=false,alreadyCompleted=false;
let model;
try{model=new globalThis.GoStopExpertLearning.ExpertRanker(read(MODEL_KEY,null));}catch(_){model=null;}
const modal=document.createElement('dialog');
modal.id='trainingFeedbackDialog';
modal.setAttribute('aria-label','Training move feedback');
modal.style.cssText='max-width:min(510px,calc(100vw - 28px));width:100%;background:#1b120e;color:#f6ddb1;border:2px solid #a87a36;border-radius:14px;box-shadow:0 18px 55px #000b;padding:20px;font:600 15px/1.55 system-ui,sans-serif;';
const shade=document.createElement('style');
shade.textContent='#trainingFeedbackDialog::backdrop{background:rgba(0,0,0,.62)}#trainingFeedbackDialog button{font:inherit;cursor:pointer;border-radius:9px;padding:10px;border:1px solid #aa7b37;background:#503226;color:#f7dcad}#trainingFeedbackDialog button:focus-visible{outline:3px solid #fbd686;outline-offset:2px}#trainingFeedbackDialog .feedback-actions{display:grid;grid-template-columns:1fr;gap:9px}';
document.head.appendChild(shade);document.body.appendChild(modal);
function ensureGame(){if(!gameId){gameId='dev-training-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);alreadyCompleted=false;}}
function completion(){
 if(!active||!gameId||alreadyCompleted||!$('resultDialog')?.open)return;
 alreadyCompleted=true;
 if(confirmed.length&&model){
  const decisions=confirmed.filter(d=>d.label&&d.legalMoves?.length>1).map(d=>({
   legalMoves:d.legalMoves,chosenId:d.label
  }));
  if(decisions.length){
   try{
    const count=model.trainGame({id:gameId,complete:true,decisions});
    if(count)persist(MODEL_KEY,model.export());
   }catch(_){}
  }
 }
 confirmed=[];gameId=null;
}
const watchResult=new MutationObserver(completion);
if($('resultDialog'))watchResult.observe($('resultDialog'),{attributes:true,attributeFilter:['open']});
function safeRecord(data,label,choice){
 const rows=read(RECORD_KEY,[]);
 const entry={
   timestamp:new Date().toISOString(),environment:'development',mode:'training',
   recommended:data.recommended,played:data.played,choice,
   visible:data.visible,legalMoves:data.legalMoves.map(m=>m.moveId)
 };
 rows.push(entry);
 persist(RECORD_KEY,rows.slice(-500));
 if(label&&data.legalMoves.some(m=>m.moveId===label)){
  ensureGame();confirmed.push({label,legalMoves:data.legalMoves});
  completion();
 }
}
function feedbackDialog(data){
 if(!active||!verifiedAccount()||!enabled()||showing)return;
 showing=true;
 const [title,desc,recLabel,myLabel,chooseMine,chooseRec,unsure,off,done]=locale();
 modal.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=title;heading.style.cssText='font-size:20px;margin:0 0 7px';
 const intro=document.createElement('p');intro.textContent=desc;intro.style.cssText='margin:0 0 14px;color:#d8bb8c';
 const comparison=document.createElement('div');comparison.style.cssText='display:grid;gap:5px;margin-bottom:16px';
 for(const [label,move] of [[recLabel,data.recommended],[myLabel,data.played]]){
  const line=document.createElement('div');
  line.textContent=label+': '+picture(move.hand)+(move.target?' → '+picture(move.target):'');
  comparison.appendChild(line);
 }
 const actions=document.createElement('div');actions.className='feedback-actions';
 const answer=(text,choice)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{
  if(choice==='off')localStorage.setItem(ENABLE_KEY,'false');
  if(choice!=='off')safeRecord(data,choice==='mine'?moveId(data.played.hand,data.played.target):choice==='recommended'?moveId(data.recommended.hand,data.recommended.target):null,choice);
  modal.close();
 };actions.appendChild(b);};
 answer(chooseMine,'mine');answer(chooseRec,'recommended');answer(unsure,'unsure');answer(off,'off');
 modal.append(heading,intro,comparison,actions);
 modal.addEventListener('close',()=>{showing=false;if(queue.length)window.setTimeout(showNext,0);},{once:true});
 try{modal.showModal();}catch(_){showing=false;}
}
let queue=[];
function showNext(){if(showing||!queue.length)return;const x=queue.shift();feedbackDialog(x);}
function enqueue(p){if(!p)return;queue.push(p);showNext();}
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
 enqueue({recommended,played,visible:observed.visible,legalMoves:legal});
}
function onHand(event){
 if(!active||!enabled()||!verifiedAccount()||modal.open)return;
 const el=event.target?.closest?.('#playerHand .hand-card[data-card-id]');
 if(!el||el.disabled)return;
 const current=el.dataset.cardId,rec=$('playerHand')?.querySelector('.hand-card.matchable[data-card-id]')?.dataset.cardId;
 if(!rec)return;
 const observe=snapshot(),recFloor=$('floor')?.querySelector('.floor-card.training-recommended[data-card-id]')?.dataset.cardId||null;
 lastHand={current,rec,recFloor,observe};
 const targets=observe.floorIds.filter(id=>card(id)?.month===card(current)?.month);
 if(targets.length>1)return; // Wait for authoritative floor choice; never block it.
 const actualTarget=targets[0]||null;
 const recTargets=observe.floorIds.filter(id=>card(id)?.month===card(rec)?.month);
 const originalTarget=recFloor||recTargets[0]||null;
 if(current===rec)return;
 window.setTimeout(()=>{if(!active)return;beginDisagreement({hand:rec,target:originalTarget},{hand:current,target:actualTarget},observe);},200);
}
function onTarget(event){
 if(!active||!enabled()||!verifiedAccount()||modal.open)return;
 const el=event.target?.closest?.('#floor .target-option[data-card-id]');
 if(!el)return;
 const target=el.dataset.cardId;
 const recFloor=$('floor')?.querySelector('.floor-card.training-recommended[data-card-id]')?.dataset.cardId||null;
 const prior=lastHand;
 if(!prior)return;
 const chosen={hand:prior.current,target};
 const advised={hand:prior.rec,target:prior.recFloor||recFloor};
 lastHand=null;
 window.setTimeout(()=>{if(active)beginDisagreement(advised,chosen,prior.observe);},200);
}
document.addEventListener('click',event=>{
 const t=event.target;
 if(t?.closest?.('#trainingModeBtn')){active=true;gameId=null;confirmed=[];lastHand=null;void checkAccount();}
 else if(t?.closest?.('#playSoloBtn, #quitYesBtn')){active=false;approvedEmail=null;confirmed=[];lastHand=null;gameId=null;}
 if(t?.closest?.('#playerHand'))onHand(event);
 if(t?.closest?.('#floor'))onTarget(event);
},{capture:true});
Object.defineProperty(globalThis,'GoStopTrainingFeedbackDev',{value:Object.freeze({
 getStatus:()=>({enabled:enabled(),active,authorized:verifiedAccount(),confirmed:confirmed.length,examples:read(RECORD_KEY,[]).length,modelExamples:model?.examples||0}),
 exportFeedback:()=>JSON.stringify(read(RECORD_KEY,[])),
 disable:()=>localStorage.setItem(ENABLE_KEY,'false'),
 enable:()=>localStorage.setItem(ENABLE_KEY,'true')
}),writable:false,configurable:true});
})();