/* Optional Training opening review, development only.
 * Appends its feedback panel AFTER the entire game board so neither the hand
 * nor any floor cards are covered. The native opening gate remains authoritative.
 * Only authorized expert confirmations are sent to the isolated learning Worker.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const helper=globalThis.GoStopDevOpeningEvidence,cloud=globalThis.GoStopTrainingCloud,
 deck=globalThis.GoStopEngine?.masterDeck;
if(!helper||!Array.isArray(deck))return;
const $=id=>document.getElementById(id);
const STRATEGIES=helper.STRATEGIES;
const LABELS={
 en:{brights:'Brights',godori:'5-BIRDIES','red-stripes':'Red Stripes','blue-stripes':'Blue Stripes','plain-stripes':'Plain Stripes',singles:'Singles',pictures:'Pictures','shake-bomb':'Shake / Bomb'},
 ko:{brights:'광',godori:'고도리','red-stripes':'홍단','blue-stripes':'청단','plain-stripes':'초단',singles:'피',pictures:'열끗','shake-bomb':'흔들기 / 폭탄'},
 es:{brights:'Brillantes',godori:'5 pájaros','red-stripes':'Cintas rojas','blue-stripes':'Cintas azules','plain-stripes':'Cintas simples',singles:'Simples',pictures:'Figuras','shake-bomb':'Sacudir / Bomba'},
 fr:{brights:'Lumineuses',godori:'5 oiseaux','red-stripes':'Rubans rouges','blue-stripes':'Rubans bleus','plain-stripes':'Rubans simples',singles:'Simples',pictures:'Images','shake-bomb':'Secouer / Bombe'},
 de:{brights:'Helle Karten',godori:'5 Vögel','red-stripes':'Rote Bänder','blue-stripes':'Blaue Bänder','plain-stripes':'Einfache Bänder',singles:'Einzelkarten',pictures:'Bilder','shake-bomb':'Schütteln / Bombe'},
 ja:{brights:'光',godori:'五鳥','red-stripes':'赤短','blue-stripes':'青短','plain-stripes':'草短',singles:'カス',pictures:'タネ','shake-bomb':'振り / 爆弾'},
 zh:{brights:'光牌',godori:'五鸟','red-stripes':'红短','blue-stripes':'青短','plain-stripes':'草短',singles:'散牌',pictures:'图牌','shake-bomb':'摇牌 / 炸弹'}
};
const COPY={
 en:{title:'OPENING STRATEGY REVIEW',intro:'Compare your hand and table. Select every viable goal, then submit.',
  suggested:'Suggested',submit:'Submit expert feedback',unsure:'Not sure',skip:'Continue without saving',
  save:'Saving...',saved:'Expert feedback saved. It will train after this game finishes.',
  error:'Unable to save feedback. Try again or continue without saving.',
  auth:'Sign in with the authorized development expert account to save training feedback.',
  short:n=>'Possible goals: '+n+'. Review and select below the cards.'},
 ko:{title:'시작 전략 검토',intro:'손패와 바닥패를 비교하고 가능한 전략을 모두 선택해 주세요.',suggested:'추천',submit:'전문가 피드백 제출',unsure:'확실하지 않음',skip:'저장하지 않고 계속',save:'저장 중...',saved:'피드백을 저장했습니다. 게임이 끝난 후 학습합니다.',error:'저장할 수 없습니다. 다시 시도하거나 건너뛰세요.',auth:'저장하려면 승인된 개발 전문가 계정으로 로그인해 주세요.',short:n=>'가능한 전략: '+n+'. 아래에서 선택해 주세요.'},
 es:{title:'REVISIÓN DE ESTRATEGIA INICIAL',intro:'Compara la mano y la mesa. Selecciona todas las metas viables.',suggested:'Sugerida',submit:'Enviar opinión experta',unsure:'No estoy seguro',skip:'Continuar sin guardar',save:'Guardando...',saved:'Opinión guardada; se entrenará al terminar la partida.',error:'No se pudo guardar.',auth:'Inicia sesión con la cuenta experta autorizada.',short:n=>'Metas posibles: '+n+'. Revísalas abajo.'},
 fr:{title:'STRATÉGIE DE DÉPART',intro:'Comparez votre main et la table, puis cochez les objectifs possibles.',suggested:'Suggérée',submit:'Envoyer l’avis expert',unsure:'Incertain',skip:'Continuer sans enregistrer',save:'Enregistrement...',saved:'Avis enregistré pour l’entraînement après la partie.',error:'Enregistrement impossible.',auth:'Connectez-vous au compte expert autorisé.',short:n=>'Objectifs possibles : '+n+'. Cochez-les ci-dessous.'},
 de:{title:'STARTSTRATEGIE PRÜFEN',intro:'Vergleiche deine Hand mit dem Tisch und wähle alle sinnvollen Ziele.',suggested:'Empfohlen',submit:'Expertenfeedback senden',unsure:'Unsicher',skip:'Ohne Speichern fortfahren',save:'Speichern...',saved:'Feedback gespeichert; Training nach Spielende.',error:'Speichern nicht möglich.',auth:'Mit autorisiertem Entwicklungsexpertenkonto anmelden.',short:n=>'Mögliche Ziele: '+n+'. Unten auswählen.'},
 ja:{title:'開始戦略の確認',intro:'手札と場札を見比べ、可能な目標をすべて選択してください。',suggested:'候補',submit:'専門家の判断を送信',unsure:'判断できない',skip:'保存せず続ける',save:'保存中...',saved:'保存しました。対局終了後に学習します。',error:'保存できません。',auth:'承認済み開発用エキスパートアカウントでログインしてください。',short:n=>'狙える役: '+n+'。下で選択してください。'},
 zh:{title:'起手策略审核',intro:'对照手牌和桌面牌，选择所有可行目标。',suggested:'建议',submit:'提交专家反馈',unsure:'不确定',skip:'不保存继续',save:'正在保存…',saved:'已保存，游戏结束后训练模型。',error:'无法保存。',auth:'请使用授权开发专家账户登录。',short:n=>'可能目标：'+n+'。请在下方选择。'}
};
const reasons={
 en:['Held/captured','Available on table','Captured by computer','In hand','Three matching cards in hand'],
 ko:['손패/획득','바닥에서 획득 가능','상대 획득','손패','같은 종류 세 장 보유'],
 es:['En mano/capturadas','Disponible en mesa','Capturadas por rival','En mano','Tres cartas iguales en mano'],
 fr:['En main/capturées','Disponibles sur table','Capturées par adversaire','En main','Trois cartes assorties en main'],
 de:['Hand/gesammelt','Auf dem Tisch erreichbar','Vom Gegner gesammelt','Auf der Hand','Drei gleiche Karten auf der Hand'],
 ja:['手札/獲得','場から獲得可能','相手が獲得','手札','同じ月の札三枚あり'],
 zh:['手牌/已收','桌面可收','对手已收','手牌','手握三张同月牌']
};
const languages=new Set(Object.keys(COPY)),language=()=>languages.has(document.documentElement.lang)?document.documentElement.lang:'en';
let downloadedOpeningModel=null;
function refreshModel(){
 if(!cloud?.state)return;
 void cloud.state().then(result=>{
  if(result?.activeOpeningModel&&Number.isInteger(result.activeOpeningModel.examples))
   downloadedOpeningModel=result.activeOpeningModel;
 }).catch(()=>{});
}
refreshModel();
function evidenceReason(strategy,info,lang){
 const label=reasons[lang]||reasons.en,r=info[strategy]||{};
 if(strategy==='shake-bomb')return label[4]+': '+(r.known>=3?'✓':'–');
 if(strategy==='singles'||strategy==='pictures')return label[3]+': '+(r.known||0);
 return label[0]+': '+(r.known||0)+' · '+label[1]+': '+(r.reachable||0)+' · '+label[2]+': '+(r.lost||0);
}
const ids=selector=>[...document.querySelectorAll(selector)].map(x=>x.dataset.cardId).filter(Boolean);
function visible(){return {hand:ids('#playerHand .hand-card[data-card-id]'),
 floor:ids('#floor .floor-card[data-card-id]'),
 humanCaptured:ids('#playerCaptured .captured-mini[data-card-id]'),
 computerCaptured:ids('#aiCaptured .captured-mini[data-card-id]')};}
let active=false,panel=null,reviewedGameId=null,openingLayer=null,busy=false,staged=null,queued=false;
function clear(){
 if(openingLayer&&openingLayer.isConnected)openingLayer.style.pointerEvents='';
 openingLayer=null;if(panel){panel.remove();panel=null;}staged=null;busy=false;
}
function continueGame(){
 const layer=openingLayer;
 clear();
 if(layer?.isConnected)layer.click(); // Invoke the frozen opening gate.
}
function createPanel(layer){
 const gameId=globalThis.GoStopTrainingFeedbackDev?.getStatus?.()?.gameId;
 const stage=document.querySelector('main.game-stage');
 if(!stage||!gameId||gameId===reviewedGameId)return;
 const vis=visible(),review=helper.withLearnedWeights(helper.evaluate(vis,deck),downloadedOpeningModel),lang=language(),c=COPY[lang],names=LABELS[lang];
 if(!review.strategies.length)return;
 reviewedGameId=gameId;staged={gameId,vis,review};
 openingLayer=layer;openingLayer.style.pointerEvents='none';
 panel=document.createElement('section');panel.id='devOpeningReview';
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
 panel.setAttribute('aria-label',c.title);panel.className='dev-opening-review';
 const h=document.createElement('h2');h.textContent=c.title;
 const p=document.createElement('p');p.textContent=c.intro;
 const note=document.createElement('p');note.className='dev-opening-review-auth';note.textContent=c.auth;
 const form=document.createElement('form');form.className='dev-opening-review-options';
 review.strategies.forEach((strategy,index)=>{
  const item=document.createElement('label');item.className='dev-opening-review-option';
  const check=document.createElement('input');check.type='checkbox';check.value=strategy;
  check.checked=review.suggested.includes(strategy);check.name='strategy-'+index;
  const span=document.createElement('span');span.textContent=names[strategy];
  const tag=document.createElement('small');tag.textContent=check.checked?c.suggested:'';
  const detail=document.createElement('small');detail.className='dev-opening-review-evidence';
  detail.textContent=evidenceReason(strategy,review.info,lang);
  item.append(check,span,tag,detail);form.append(item);
 });
 const actionRow=document.createElement('div');actionRow.className='dev-opening-review-actions';
 const submit=document.createElement('button');submit.type='button';submit.textContent=c.submit;submit.className='primary-wide';
 const unsure=document.createElement('button');unsure.type='button';unsure.textContent=c.unsure;
 const skip=document.createElement('button');skip.type='button';skip.textContent=c.skip;
 const status=document.createElement('p');status.className='dev-opening-review-status';status.setAttribute('role','status');
 async function record(choice){
  if(busy||!staged)return;
  const selected=[...form.querySelectorAll('input:checked')].map(el=>el.value);
  if(choice==='confirmed'&&!selected.length){status.textContent=c.intro;return;}
  const auth=globalThis.GoStopTrainingFeedbackDev?.getStatus?.()?.authorized===true;
  if(!auth||!cloud?.openingFeedback){status.textContent=c.auth;return;}
  busy=true;submit.disabled=true;unsure.disabled=true;skip.disabled=true;status.textContent=c.save;
  try{
   const data=staged;
   const result=await cloud.openingFeedback({
    gameId:data.gameId,feedbackId:crypto.randomUUID(),choice,
    suggested:data.review.suggested,selected:choice==='confirmed'?selected:[],
    evidence:data.review.evidence,visible:data.vis
   });
   if(result?.ok){status.textContent=c.saved;continueGame();return;}
   throw new Error('No acknowledgement');
  }catch(_){status.textContent=c.error;}
  finally{busy=false;if(panel){submit.disabled=false;unsure.disabled=false;skip.disabled=false;}}
 }
 submit.addEventListener('click',()=>void record('confirmed'));
 unsure.addEventListener('click',()=>void record('unsure'));
 skip.addEventListener('click',continueGame);
 actionRow.append(submit,unsure,skip);panel.append(h,p,note,form,actionRow,status);
 stage.after(panel);form.addEventListener('submit',event=>event.preventDefault());
 // Keep ALL actual hand/table cards visible above this normal-flow section.
 const suggested=review.suggested.map(x=>names[x]).join(', ')||names.singles;
 const coach=$('trainingCoachText'),title=$('trainingCoachTitle');
 if(coach&&title){
  const short=c.short(suggested);
  const original=coach.textContent;
  title.textContent=c.title;
  coach.textContent=short;
  // Keep the observer from restoring the verbose frozen opening copy.
  panel.dataset.originalAdviceLength=String(original?.length||0);
 }
}
function scan(){
 queued=false;
 if(!active)return;
 const layer=document.querySelector('.training-opening-dismiss-layer');
 if(layer&&!panel&&!busy)createPanel(layer);
 if(panel&&!layer){clear();}
}
function schedule(){if(queued)return;queued=true;queueMicrotask(scan);}
const observer=new MutationObserver(schedule);
observer.observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',event=>{
 if(event.target?.closest?.('#trainingModeBtn')){active=true;reviewedGameId=null;refreshModel();schedule();}
 else if(event.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){active=false;clear();}
},{capture:true});
Object.defineProperty(globalThis,'GoStopDevOpeningReview',{configurable:true,value:Object.freeze({
 getStatus:()=>({active,visible:!!panel,gameId:staged?.gameId||null,
  suggested:staged?.review?.suggested||[],modelExamples:staged?.review?.modelExamples||0})
})});
})();
