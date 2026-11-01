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
 nativeDecision='stop',nativeReason='',risk=null,hasFutureTurn=true}={}){
 const hasMatch=matches(hand,floor),oneCard=hand.length===1;
 const urgentThreat=urgent.test(String(nativeReason));
 // Under the CURRENT visible table, enumerate every unknown matching hand
 // and draw-card pair. If even that ceiling stays below 7 and we have a
 // match next turn, GO is more useful than a generic last-turn STOP.
 // Hidden draws and special bonuses remain uncertain, not "guaranteed" wins.
 const safeTableGo=hasFutureTurn&&hasMatch&&playerScore>=7&&!urgentThreat&&
  risk?.maxOpponentScore<7&&!risk.canReachSeven;
 const oneCardFallback=oneCard&&hasFutureTurn&&hasMatch&&opponentScore===0&&
  playerScore>=7&&goCount<=1&&!urgentThreat&&(!risk||!risk.canReachSeven);
 const lowRisk=safeTableGo||oneCardFallback;
 return {hasMatch,oneCard,lowRisk,safeTableGo,urgentThreat,
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
const riskCopy={
 en:(risk,birdie)=>'GO. Even the strongest next-turn captures available to the computer from the visible table reach at most '+risk.maxOpponentScore+' points, below 7. You have a matching capture next turn'+(birdie?', including a 5-BIRDIES opportunity':'')+'. The computer moves first, so the capture is not guaranteed.',
 ko:(risk,birdie)=>'고를 추천합니다. 공개된 바닥패 기준으로 상대가 다음 턴에 최대 '+risk.maxOpponentScore+'점까지 올릴 수 있어도 7점에 못 미칩니다. 내 손에 맞는 바닥패가'+(birdie?' 있고 고도리 기회도':'')+' 있습니다. 단, 상대가 먼저 두므로 먹을 패가 확정된 것은 아닙니다.',
 es:(risk,birdie)=>'GO. Las mejores capturas posibles en la mesa visible dejan al rival como máximo en '+risk.maxOpponentScore+' puntos, por debajo de 7. Hay una captura para tu próximo turno'+(birdie?' y una opción de cinco aves':'')+', aunque el rival juega antes.',
 fr:(risk,birdie)=>'GO. Même la meilleure capture possible de la table visible laisserait l’adversaire à '+risk.maxOpponentScore+' points, sous 7. Vous avez une prise possible'+(birdie?' et une chance de cinq oiseaux':'')+'. L’adversaire joue d’abord.',
 de:(risk,birdie)=>'GO. Selbst die beste mögliche Aufnahme vom sichtbaren Tisch bringt den Gegner höchstens auf '+risk.maxOpponentScore+' Punkte, unter 7. Du hast eine Fangchance'+(birdie?' und eine Fünf-Vögel-Chance':'')+'. Der Gegner spielt zuerst.',
 ja:(risk,birdie)=>'ゴーを勧めます。見えている場札から相手が次に最大限取っても'+risk.maxOpponentScore+'点で7点未満です。次の手に取れる札'+(birdie?'と五鳥の機会':'')+'があります。ただし相手が先手です。',
 zh:(risk,birdie)=>'建议继续。从明面桌牌看，即使对手下回合最佳收牌也最多到'+risk.maxOpponentScore+'分，未达到7分。你下一回合有可收的牌'+(birdie?'，还有五鸟机会':'')+'，但对手先行动。'
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
const modelChoice=(model,context)=>{
 if(!model||!Array.isArray(model.weights)||model.weights.length!==16||
    model.examples<3||model.weights.some(v=>!Number.isFinite(v)))return null;
 const score=action=>feature(context,action).reduce((sum,x,i)=>sum+x*model.weights[i],0);
 const delta=score('go')-score('stop');
 return Math.abs(delta)>=.45?(delta>0?'go':'stop'):null;
};
const api=Object.freeze({evaluate,modelChoice,matches});
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
function checkOpponentRisk(floor,hand,opponentScore){
 const analyzer=root.GoStopDevOpponentRisk?.analyze,engine=root.GoStopEngine;
 if(!analyzer||!Array.isArray(engine?.masterDeck)||typeof engine.score!=='function')return null;
 const stacks=[...document.querySelectorAll('#floor .floor-stack-three[data-stack-month]')]
  .map(el=>({cardIds:[...el.querySelectorAll('.floor-card[data-card-id]')].map(c=>c.dataset.cardId)}));
 return analyzer({
  deck:engine.masterDeck,floorIds:floor,stacks,playerHandIds:hand,
  playerCapturedIds:ids('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:ids('#aiCaptured .captured-mini[data-card-id]'),
  opponentScore,score:engine.score
 });
}
function birdieCaptureAvailable(hand,floor){
 const deck=root.GoStopEngine?.masterDeck||[];
 const byId=new Map(deck.map(c=>[c.id,c]));
 return floor.some(id=>{
  const card=byId.get(id);
  return card?.flags?.includes('godori')&&hand.some(h=>byId.get(h)?.month===card.month);
 });
}
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
 const deckCount=score('deckCount');
 const risk=checkOpponentRisk(context.floor,context.hand,context.opponentScore);
 const hasFutureTurn=context.hand.length>0&&(deckCount===null||deckCount>=2);
 const checked=evaluate({...context,risk,hasFutureTurn});
 const birdie=birdieCaptureAvailable(context.hand,context.floor);
 const learned=modelChoice(activeModel,{
  opponentScore:context.opponentScore,playerScore:context.playerScore,
  remainingCards:context.hand.length,goCount:context.goCount,hasMatch:checked.hasMatch
 });
 const result=checked.lowRisk?'go':
   !checked.urgentThreat&&(!risk||!risk.canReachSeven)&&
   context.opponentScore<=2&&context.goCount<=1&&learned?learned:original;
 if(result===original)return;
 go.classList.toggle('training-choice-recommended',result==='go');
 stop.classList.toggle('training-choice-recommended',result==='stop');
 if(checked.lowRisk){
  const locale=document.documentElement.lang;
  const text=$('trainingCoachText');
  if(text)text.textContent=checked.safeTableGo&&risk?
    (riskCopy[locale]||riskCopy.en)(risk,birdie):copy[locale]||copy.en;
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
