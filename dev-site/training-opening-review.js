/* Development-only Training opening expert confirmation.
 * Present the recommended goals in a real modal before the frozen opening gate.
 * Accept agreement, corrections or uncertainty, and resume the original game gate
 * without touching core gameplay, cards, or production sources.
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
  auth:'Sign in with the authorized development expert account to save training feedback.'},
 ko:{title:'시작 전략 검토',intro:'손패와 바닥패를 비교하고 가능한 전략을 모두 선택해 주세요.',suggested:'추천',submit:'전문가 피드백 제출',unsure:'확실하지 않음',skip:'저장하지 않고 계속',save:'저장 중...',saved:'피드백을 저장했습니다. 게임이 끝난 후 학습합니다.',error:'저장할 수 없습니다. 다시 시도하거나 건너뛰세요.',auth:'저장하려면 승인된 개발 전문가 계정으로 로그인해 주세요.'},
 es:{title:'REVISIÓN DE ESTRATEGIA INICIAL',intro:'Compara la mano y la mesa. Selecciona todas las metas viables.',suggested:'Sugerida',submit:'Enviar opinión experta',unsure:'No estoy seguro',skip:'Continuar sin guardar',save:'Guardando...',saved:'Opinión guardada; se entrenará al terminar la partida.',error:'No se pudo guardar.',auth:'Inicia sesión con la cuenta experta autorizada.'},
 fr:{title:'STRATÉGIE DE DÉPART',intro:'Comparez votre main et la table, puis cochez les objectifs possibles.',suggested:'Suggérée',submit:'Envoyer l’avis expert',unsure:'Incertain',skip:'Continuer sans enregistrer',save:'Enregistrement...',saved:'Avis enregistré pour l’entraînement après la partie.',error:'Enregistrement impossible.',auth:'Connectez-vous au compte expert autorisé.'},
 de:{title:'STARTSTRATEGIE PRÜFEN',intro:'Vergleiche deine Hand mit dem Tisch und wähle alle sinnvollen Ziele.',suggested:'Empfohlen',submit:'Expertenfeedback senden',unsure:'Unsicher',skip:'Ohne Speichern fortfahren',save:'Speichern...',saved:'Feedback gespeichert; Training nach Spielende.',error:'Speichern nicht möglich.',auth:'Mit autorisiertem Entwicklungsexpertenkonto anmelden.'},
 ja:{title:'開始戦略の確認',intro:'手札と場札を見比べ、可能な目標をすべて選択してください。',suggested:'候補',submit:'専門家の判断を送信',unsure:'判断できない',skip:'保存せず続ける',save:'保存中...',saved:'保存しました。対局終了後に学習します。',error:'保存できません。',auth:'承認済み開発用エキスパートアカウントでログインしてください。'},
 zh:{title:'起手策略审核',intro:'对照手牌和桌面牌，选择所有可行目标。',suggested:'建议',submit:'提交专家反馈',unsure:'不确定',skip:'不保存继续',save:'正在保存…',saved:'已保存，游戏结束后训练模型。',error:'无法保存。',auth:'请使用授权开发专家账户登录。'}
};

const DECISION={
 en:{question:'Do you agree with these opening strategies?',recommend:'Recommended opening strategies',agree:'Yes, I agree',change:'No, change strategies',edit:'Select every strategy you believe is viable for this hand.',save:'Submit my strategies',back:'Back',none:'Select at least one strategy.'},
 ko:{question:'추천된 시작 전략에 동의하십니까?',recommend:'추천 시작 전략',agree:'네, 동의합니다',change:'아니요, 전략 수정',edit:'현재 손패에서 가능한 전략을 모두 선택해 주세요.',save:'내 전략 제출',back:'뒤로',none:'전략을 하나 이상 선택해 주세요.'},
 es:{question:'¿Estás de acuerdo con estas estrategias iniciales?',recommend:'Estrategias recomendadas',agree:'Sí, estoy de acuerdo',change:'No, cambiar estrategias',edit:'Selecciona todas las estrategias viables para esta mano.',save:'Enviar mis estrategias',back:'Volver',none:'Elige al menos una estrategia.'},
 fr:{question:'Êtes-vous d’accord avec ces stratégies de départ ?',recommend:'Stratégies recommandées',agree:'Oui, je suis d’accord',change:'Non, changer les stratégies',edit:'Sélectionnez toutes les stratégies possibles pour cette main.',save:'Envoyer mes stratégies',back:'Retour',none:'Sélectionnez au moins une stratégie.'},
 de:{question:'Stimmst du diesen Startstrategien zu?',recommend:'Empfohlene Startstrategien',agree:'Ja, ich stimme zu',change:'Nein, Strategien ändern',edit:'Wähle alle für diese Hand möglichen Strategien.',save:'Meine Strategien senden',back:'Zurück',none:'Wähle mindestens eine Strategie.'},
 ja:{question:'この開始戦略に同意しますか？',recommend:'おすすめの開始戦略',agree:'はい、同意します',change:'いいえ、戦略を変更',edit:'この手札で可能な戦略をすべて選んでください。',save:'選択した戦略を送信',back:'戻る',none:'戦略を1つ以上選択してください。'},
 zh:{question:'你同意这些起手策略吗？',recommend:'推荐起手策略',agree:'是的，我同意',change:'不，我要修改',edit:'请选择这手牌所有可行的策略。',save:'提交我的策略',back:'返回',none:'请至少选择一个策略。'}
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
 openingLayer=null;if(panel){if(panel.open&&typeof panel.close==='function')panel.close();panel.remove();panel=null;}staged=null;busy=false;
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
 const vis=visible(),lang=language(),c=COPY[lang],d=DECISION[lang],names=LABELS[lang],
  baseReview=helper.evaluate(vis,deck),nativeSuggestions=helper.nativeOpeningStrategies(vis,deck),
  // For English, use the FROZEN coach's actual displayed heading as the
  // definitive source of what the expert is confirming. The pure native-rule
  // mirror supplies the structural selection for all other languages.
  coachText=$('trainingCoachText')?.textContent||'',
  displayedSuggestions=lang==='en'?helper.strategiesFromEnglishCoach(coachText):null,
  expertBirdies=helper.godoriExpertCase(vis,deck),
  needsBirdieAddition=expertBirdies.viable&&!expertBirdies.frozenViable,
  review={...baseReview,suggested:needsBirdieAddition?nativeSuggestions:
    (displayedSuggestions||nativeSuggestions)};
 // Never apply shadow learner weights to an answer that the frozen game coach
 // has not actually made; confirmed labels must match the player's screen.
 if(!review.strategies.length)return;
 const locationLines=helper.openingLocationLines(vis,deck,review.suggested,lang);
 // The original English coach aggregates Brights / Stripes from hand, captures
 // and reachable table cards. Replace that ambiguous sentence ONCE during
 // opening review, preserving the frozen game's authoritative heading and
 // recommendation order. No gameplay or model logic is changed.
 const coach=$('trainingCoachText');
 const continueCopy={
  en:'Tap or click anywhere when you are ready to continue.',
  ko:'준비되면 아무 곳이나 누르세요.',
  es:'Toca o haz clic para continuar.',
  fr:'Touchez ou cliquez pour continuer.',
  de:'Tippen oder klicken zum Fortfahren.',
  ja:'準備ができたら画面をタップしてください。',
  zh:'准备好后点击屏幕继续。'
 };
 if(coach&&needsBirdieAddition){
  // Keep the recommendation in the real Training coach and the expert
  // confirmation dialog identical. This adjusts only development text.
  const selected=review.suggested.map(strategy=>names[strategy]);
  const heading=lang==='en'?
   (selected.length===1?'Best strategy: ':'Best strategies: ')+
     selected.join(', ').replace(/, ([^,]+)$/,', and $1')+'.':
   d.recommend+': '+selected.join(', ')+'.';
  coach.textContent=heading+' '+locationLines.join(' ')+' '+continueCopy[lang];
 }else if(lang==='en'&&locationLines.length){
  const heading=coachText.match(/^\s*(Best strateg(?:y|ies):\s*[^.]*\.)/i)?.[1];
  if(heading&&coach)coach.textContent=heading+' '+locationLines.join(' ')+
   ' '+continueCopy.en;
 }
 reviewedGameId=gameId;staged={gameId,vis,review};
 openingLayer=layer;openingLayer.style.pointerEvents='none';
 panel=document.createElement('dialog');panel.id='devOpeningReview';
 panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-labelledby','devOpeningReviewTitle');
 panel.className='dev-opening-review';
 // The opening gate must advance only after an explicit answer. Esc cannot
 // silently dismiss the review and leave the game blocked.
 panel.addEventListener('cancel',event=>event.preventDefault());
 const h=document.createElement('h2');h.id='devOpeningReviewTitle';h.textContent=c.title;
 const question=document.createElement('p');question.className='dev-opening-review-question';question.textContent=d.question;
 const recommended=document.createElement('p');recommended.className='dev-opening-review-recommendation';
 const recommendedList=review.suggested.map(x=>names[x]).join(', ')||names.singles;
 recommended.textContent=d.recommend+': '+recommendedList;
 const precise=document.createElement('p');precise.className='dev-opening-review-location-counts';
 precise.textContent=locationLines.join(' ');
 precise.hidden=!locationLines.length;
 const prompt=document.createElement('p');prompt.textContent=d.edit;prompt.hidden=true;
 const note=document.createElement('p');note.className='dev-opening-review-auth';
 note.textContent=c.auth;note.hidden=true;
 const form=document.createElement('form');form.className='dev-opening-review-options';form.hidden=true;
 review.strategies.forEach((strategy,index)=>{
  const item=document.createElement('label');item.className='dev-opening-review-option';
  const check=document.createElement('input');check.type='checkbox';check.value=strategy;
  check.checked=review.suggested.includes(strategy);check.name='strategy-'+index;
  const span=document.createElement('span');span.textContent=names[strategy];
  const tag=document.createElement('small');tag.textContent=check.checked?c.suggested:'';
  check.addEventListener('change',()=>{tag.textContent=check.checked&&review.suggested.includes(strategy)?c.suggested:'';});
  const detail=document.createElement('small');detail.className='dev-opening-review-evidence';
  detail.textContent=helper.openingLocationLines(vis,deck,[strategy],lang)[0]||
   evidenceReason(strategy,review.info,lang);
  item.append(check,span,tag,detail);form.append(item);
 });
 form.addEventListener('submit',event=>event.preventDefault());
 const actionRow=document.createElement('div');actionRow.className='dev-opening-review-actions';
 const agree=document.createElement('button');agree.type='button';agree.textContent=d.agree;agree.className='primary-wide';
 const change=document.createElement('button');change.type='button';change.textContent=d.change;
 const back=document.createElement('button');back.type='button';back.textContent=d.back;back.hidden=true;
 const submit=document.createElement('button');submit.type='button';submit.textContent=d.save;submit.className='primary-wide';submit.hidden=true;
 const unsure=document.createElement('button');unsure.type='button';unsure.textContent=c.unsure;
 const skip=document.createElement('button');skip.type='button';skip.textContent=c.skip;
 const status=document.createElement('p');status.className='dev-opening-review-status';
 status.setAttribute('role','status');
 function setEditing(editing){
  question.hidden=editing;recommended.hidden=editing;
  agree.hidden=editing;change.hidden=editing;
  prompt.hidden=!editing;form.hidden=!editing;
  submit.hidden=!editing;back.hidden=!editing;
  status.textContent='';if(editing)form.querySelector('input')?.focus();else agree.focus();
 }
 const controls=[agree,change,back,submit,unsure,skip];
 async function record(choice,selected){
  if(busy||!staged)return;
  if(choice==='confirmed'&&!selected.length){status.textContent=d.none;return;}
  const auth=globalThis.GoStopTrainingFeedbackDev?.getStatus?.()?.authorized===true;
  if(!auth||!cloud?.openingFeedback){note.hidden=false;status.textContent=c.auth;return;}
  busy=true;controls.forEach(button=>button.disabled=true);status.textContent=c.save;
  try{
   const data=staged;
   const result=await cloud.openingFeedback({
    gameId:data.gameId,feedbackId:crypto.randomUUID(),choice,reviewRequired:true,
    suggested:data.review.suggested,selected:choice==='confirmed'?selected:[],
    evidence:data.review.evidence,visible:data.vis
   });
   if(result?.ok){continueGame();return;}
   throw new Error('No acknowledgement');
  }catch(_){status.textContent=c.error;}
  finally{busy=false;if(panel)controls.forEach(button=>button.disabled=false);}
 }
 agree.addEventListener('click',()=>void record('confirmed',review.suggested.slice()));
 change.addEventListener('click',()=>setEditing(true));
 back.addEventListener('click',()=>setEditing(false));
 submit.addEventListener('click',()=>void record('confirmed',
  [...form.querySelectorAll('input:checked')].map(el=>el.value)));
 unsure.addEventListener('click',()=>void record('unsure',[]));
 skip.addEventListener('click',continueGame);
 actionRow.append(agree,change,back,submit,unsure,skip);
 panel.append(h,question,recommended,precise,prompt,form,note,actionRow,status);
 document.body.append(panel);
 try{panel.showModal();}catch(_){panel.setAttribute('open','');}
 agree.focus();
}
function scan(){
 queued=false;
 if(!active)return;
 const layer=document.querySelector('.training-opening-dismiss-layer');
 if(layer&&!panel&&!busy)createPanel(layer);
 if(panel&&!layer){clear();}
}
function schedule(){
 if(!active||queued)return;
 queued=true;
 // The opening layer and its modal are direct body children. Watching every
 // descendant card/score mutation throughout a full Training game created
 // unnecessary high-frequency microtasks long after the opening was reviewed.
 setTimeout(scan,32);
}
const observer=new MutationObserver(schedule);
observer.observe(document.body,{childList:true,subtree:false});
document.addEventListener('click',event=>{
 if(event.target?.closest?.('#trainingModeBtn')){active=true;reviewedGameId=null;refreshModel();schedule();}
 else if(event.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){active=false;clear();}
},{capture:true});
Object.defineProperty(globalThis,'GoStopDevOpeningReview',{configurable:true,value:Object.freeze({
 getStatus:()=>({active,visible:!!panel,gameId:staged?.gameId||null,
  suggested:staged?.review?.suggested||[],modelExamples:staged?.review?.modelExamples||0})
})});
})();
