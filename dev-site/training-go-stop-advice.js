/* Isolated development-only GO / STOP strategy correction.
 * Reads public visible hand/table/score and the existing recommended buttons.
 * Never changes the protected game state, action handlers, or production code.
 */
(function(root){
'use strict';
const month=id=>Number(/^m(\d+)-/.exec(String(id))?.[1])||0;
const matches=(hand,floor)=>hand.some(h=>floor.some(f=>month(h)>0&&month(h)===month(f)));
const urgent=/The computer is at|상대가 다음 차례에 점수를 내어 승부를 끝낼 수/i;
function evaluate({hand=[],floor=[],opponentScore,playerScore,goCount=0,
 nativeDecision='stop',nativeReason=''}={}){
 const hasMatch=matches(hand,floor),oneCard=hand.length===1;
 const urgentThreat=urgent.test(String(nativeReason));
 // A last-card match is an opportunity, not an unconditional guaranteed point:
 // the opponent acts after GO and might claim the table card first.
 const lowRisk=oneCard&&hasMatch&&opponentScore===0&&playerScore>=7&&goCount<=1&&!urgentThreat;
 return {hasMatch,oneCard,lowRisk,urgentThreat,
  recommended:lowRisk?'go':nativeDecision,
  changed:lowRisk&&nativeDecision==='stop'};
}
const copy={
 en:'GO. The computer has 0 points and your last hand card matches a card on the table. You have a clear capture opportunity, although the computer still plays before your next turn.',
 ko:'고를 추천합니다. 상대는 0점이고 남은 손패 한 장이 바닥패와 같은 월입니다. 먹을 기회가 있지만 다음 내 차례 전에 상대가 먼저 둔다는 위험도 고려합니다.',
 es:'GO. El rival tiene 0 puntos y tu última carta coincide con una de la mesa. Hay una buena oportunidad de captura, aunque el rival juega antes de tu siguiente turno.',
 fr:'GO. L’adversaire a 0 point et votre dernière carte correspond à une carte sur la table. Vous avez une occasion de capture, mais l’adversaire joue avant votre prochain tour.',
 de:'GO. Der Gegner hat 0 Punkte und deine letzte Handkarte passt zu einer Tischkarte. Es gibt eine Fangchance, aber der Gegner ist vor deinem nächsten Zug dran.',
 ja:'ゴーを勧めます。相手は0点で、最後の手札が場札と同じ月です。獲得の好機ですが、次の自分の番より先に相手が打ちます。',
 zh:'建议继续。对手为0分，你最后一张手牌与桌面的一张牌同月。有收牌机会，但下次轮到你前，对手会先出牌。'
};
const feature=(c,action)=>{
 const index=action==='go'?0:1,w=Array(16).fill(0);
 [1,Number(c.opponentScore===0),Number(c.opponentScore>=5),
  Number(c.remainingCards===1),Number(c.hasMatch),
  Number(c.opponentScore===0&&c.remainingCards===1&&c.hasMatch),
  Number(c.goCount>=2),Number(c.playerScore>=10)]
  .forEach((v,i)=>w[i*2+index]=v);
 return w;
};

// Conservative public-card upper bound. Enumerate every exposed table bundle,
// as many as two captures during the opponent's next play/draw, and a plausible
// unseen matching card for each capture. Never inspect opponent hidden cards.
// An optimistic upper bound below seven proves no visible next-turn finish.
function opponentNextTurnCeiling({deck=[],floorIds=[],ownHandIds=[],ownCapturedIds=[],
 opponentCapturedIds=[],opponentScore=0,scorePlayer=null}={}){
 if(!Array.isArray(deck)||!deck.length||typeof scorePlayer!=='function')return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const floor=floorIds.map(id=>byId.get(id)).filter(Boolean);
 const captured=opponentCapturedIds.map(id=>byId.get(id)).filter(Boolean);
 const unseenIds=new Set([...floorIds,...ownHandIds,...ownCapturedIds,...opponentCapturedIds]);
 const unseen=deck.filter(c=>!unseenIds.has(c.id));
 const groups=[],seen=new Set();
 for(const c of floor){
  if(seen.has(c.month))continue;
  seen.add(c.month);
  const cards=floor.filter(x=>x.month===c.month);
  if(cards.length>2&&cards.length!==3)continue;
  // Two ordinary matches of the same month are a target choice, not a stack.
  if(cards.length===2){for(const single of cards)groups.push({cards:[single],month:c.month});}
  else groups.push({cards,month:c.month});
 }
 const before=scorePlayer({captured,gukjinMode:'animal'}).total;
 if(!Number.isFinite(before))return null;
 let max=opponentScore;
 const update=(added)=>{
  const next=scorePlayer({captured:[...captured,...added],gukjinMode:'animal'}).total;
  if(Number.isFinite(next))max=Math.max(max,opponentScore+Math.max(0,next-before));
 };
 for(let i=0;i<groups.length;i++){
  const one=groups[i];
  for(const source of unseen.filter(c=>c.month===one.month)){
   update([...one.cards,source]);
   for(let j=i+1;j<groups.length;j++){
    const two=groups[j];
    if(one.cards.some(c=>two.cards.some(d=>c.id===d.id)))continue;
    for(const other of unseen.filter(c=>c.month===two.month&&c.id!==source.id))
      update([...one.cards,...two.cards,source,other]);
   }
  }
 }
 return max;
}

const modelChoice=(model,context)=>{
 if(!model||!Array.isArray(model.weights)||model.weights.length!==16||
    model.examples<3||model.weights.some(v=>!Number.isFinite(v)))return null;
 const score=action=>feature(context,action).reduce((sum,x,i)=>sum+x*model.weights[i],0);
 const delta=score('go')-score('stop');
 return Math.abs(delta)>=.45?(delta>0?'go':'stop'):null;
};
const api=Object.freeze({evaluate,modelChoice,matches,opponentNextTurnCeiling});
root.GoStopDevGoStopLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(root.location?.hostname||''))return;
const $=id=>document.getElementById(id);
const dialog=$('decisionDialog');
if(!dialog)return;
let activeModel=null;
const score=id=>{
 const match=String($(id)?.textContent||'').match(/\d+/);
 return match?Number(match[0]):null;
};
const ids=query=>[...document.querySelectorAll(query)].map(x=>x.dataset.cardId).filter(Boolean);

const previousPublicCards=()=>({
 ownHandIds:ids('#playerHand .hand-card[data-card-id]'),
 floorIds:ids('#floor .floor-card[data-card-id]'),
 ownCapturedIds:ids('#playerCaptured .captured-mini[data-card-id]'),
 opponentCapturedIds:ids('#aiCaptured .captured-mini[data-card-id]')
});
const safeCopy={
 en:maximum=>'GO. The computer has no table-based path to 7 points on its next turn (optimistic maximum '+maximum+'). You still have a matching capture opportunity. Its next move may change the table.',
 ko:maximum=>'고를 추천합니다. 상대가 바닥패로 다음 차례에 얻을 수 있는 최대 점수는 '+maximum+'점으로 7점에 못 미칩니다. 내 손패에 먹을 수 있는 패가 남아 있습니다.',
 es:maximum=>'GO. El rival no puede llegar a 7 puntos en su próximo turno con las cartas visibles (máximo '+maximum+'). Aún puedes capturar una carta.',
 fr:maximum=>'GO. L’adversaire ne peut pas atteindre 7 points au prochain tour avec les cartes visibles (maximum '+maximum+'). Vous avez encore une capture possible.',
 de:maximum=>'GO. Mit den sichtbaren Tischkarten erreicht der Gegner in seinem nächsten Zug höchstens '+maximum+' und nicht 7 Punkte. Du hast eine Fangchance.',
 ja:maximum=>'ゴーを勧めます。相手は次の手番で場札から最大'+maximum+'点しか取れず、7点に届きません。こちらには取れる札があります。',
 zh:maximum=>'建议继续。对手下一轮通过桌面牌最多达到'+maximum+'分，不足7分。你仍有可收取的匹配牌。'
};

function adjust(){
 const training=root.GoStopTrainingFeedbackDev?.getStatus?.()?.active;
 const go=$('goBtn'),stop=$('stopBtn');
 if(!training||!dialog.open||!go||!stop)return;
 const original=stop.classList.contains('training-choice-recommended')?'stop':
   go.classList.contains('training-choice-recommended')?'go':null;
 if(!original)return;
 const context={hand:ids('#playerHand .hand-card[data-card-id]'),
  floor:ids('#floor .floor-card[data-card-id]'),opponentScore:score('aiScore'),
  playerScore:score('playerScore'),goCount:score('goCount')??0,
  nativeDecision:original,nativeReason:$('trainingCoachText')?.textContent||''};
 if(!Number.isInteger(context.opponentScore)||!Number.isInteger(context.playerScore))return;
 const checked=evaluate(context);
 const learned=modelChoice(activeModel,{
  opponentScore:context.opponentScore,playerScore:context.playerScore,
  remainingCards:context.hand.length,goCount:context.goCount,hasMatch:checked.hasMatch
 });
 const snapshot=previousPublicCards();
 const engine=root.GoStopEngine;
 const maximum=engine?.scorePlayer?opponentNextTurnCeiling({
  deck:engine.masterDeck,...snapshot,opponentScore:context.opponentScore,
  scorePlayer:engine.scorePlayer
 }):null;
 const verifiedSafe=checked.hasMatch&&context.hand.length>0&&
  Number.isInteger(maximum)&&maximum<7&&context.goCount<=1&&!checked.urgentThreat;
 const result=verifiedSafe?'go':checked.lowRisk?'go':
   !checked.urgentThreat&&context.opponentScore<=2&&context.goCount<=1&&learned?learned:original;
 if(result===original)return;
 go.classList.toggle('training-choice-recommended',result==='go');
 stop.classList.toggle('training-choice-recommended',result==='stop');
 if(verifiedSafe||checked.lowRisk){
  const locale=document.documentElement.lang;
  const text=$('trainingCoachText');
  if(text)text.textContent=verifiedSafe?
   (safeCopy[locale]||safeCopy.en)(maximum):copy[locale]||copy.en;
 }
}
const observer=new MutationObserver(()=>{if(dialog.open)adjust();});
observer.observe(dialog,{attributes:true,attributeFilter:['open']});
document.addEventListener('click',event=>{
 if(!event.target?.closest?.('#trainingModeBtn'))return;
 activeModel=null;
 Promise.resolve(root.GoStopTrainingCloud?.state?.()).then(state=>{
  activeModel=state?.activeGoStopModel||null;
 }).catch(()=>{activeModel=null;});
},{capture:true});
root.GoStopDevGoStopAdvice=Object.freeze({getStatus:()=>({activeModelExamples:activeModel?.examples||0})});
})(typeof globalThis!=='undefined'?globalThis:this);
