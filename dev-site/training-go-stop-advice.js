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
 // An extra Single transfer is only possible when a visible three-card
 // family stack is completed. Never grant imaginary steals for an ordinary
 // one- or two-card table match: this previously inflated the STOP risk.
 const singles=ownCapturedIds.map(id=>byId.get(id)).filter(c=>
  c&&(c.type==='pi'||c.flags?.includes('switchPi'))).slice(0,2);
 const update=(added,stackCaptures=0)=>{
  for(let n=0;n<=Math.min(stackCaptures,singles.length);n++){
   const next=scorePlayer({captured:[...captured,...added,...singles.slice(0,n)],gukjinMode:'animal'}).total;
   if(Number.isFinite(next))max=Math.max(max,opponentScore+Math.max(0,next-before));
  }
 };
 for(let i=0;i<groups.length;i++){
  const one=groups[i];
  for(const source of unseen.filter(c=>c.month===one.month)){
   update([...one.cards,source],one.cards.length===3?1:0);
   for(let j=i+1;j<groups.length;j++){
    const two=groups[j];
    if(one.cards.some(c=>two.cards.some(d=>c.id===d.id)))continue;
    for(const other of unseen.filter(c=>c.month===two.month&&c.id!==source.id))
      update([...one.cards,...two.cards,source,other],
       (one.cards.length===3?1:0)+(two.cards.length===3?1:0));
   }
  }
 }
 return max;
}

// Conservative, explainable public-card estimates. Never inspect the
// computer's concealed hand or draw order. The ceiling describes only the
// exposed table routes; it is NOT an omniscient maximum for all special rules.
const clamp01=n=>Math.max(0,Math.min(1,n));
const probabilityNoMatch=(poolSize,matching,draws)=>{
 const n=Math.max(0,Math.trunc(poolSize)),k=Math.max(0,Math.min(n,Math.trunc(matching))),
  d=Math.max(0,Math.min(n,Math.trunc(draws)));
 if(!d||!k)return 1;
 if(n-k<d)return 0;
 let p=1;
 for(let i=0;i<d;i++)p*=(n-k-i)/(n-i);
 return clamp01(p);
};
function publicGoStopRisk({deck=[],floorIds=[],ownHandIds=[],ownCapturedIds=[],
 opponentCapturedIds=[],opponentScore=0,playerScore=7,
 opponentHandSize=null,scorePlayer=null}={}){
 if(!Array.isArray(deck)||!deck.length||typeof scorePlayer!=='function')return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const uniqueIds=a=>[...new Set(a.filter(id=>byId.has(id)))];
 const hand=uniqueIds(ownHandIds),floor=uniqueIds(floorIds),
  ownCaptured=uniqueIds(ownCapturedIds),opponentCaptured=uniqueIds(opponentCapturedIds);
 const allocated=new Set([...hand,...floor,...ownCaptured,...opponentCaptured]);
 const unseen=deck.filter(c=>!allocated.has(c.id));
 const opponentHandCount=Number.isInteger(opponentHandSize)&&opponentHandSize>=1?
  opponentHandSize:hand.length;
 const drawSlots=Math.min(unseen.length,opponentHandCount+1);
 const cards=ids=>ids.map(id=>byId.get(id)).filter(Boolean);
 const scored=ids=>scorePlayer({captured:cards(ids),gukjinMode:'animal'})?.total;
 const ownBase=scored(ownCaptured),oppBase=scored(opponentCaptured);
 if(!Number.isFinite(ownBase)||!Number.isFinite(oppBase))return null;
 const ceiling=opponentNextTurnCeiling({deck,floorIds:floor,ownHandIds:hand,
  ownCapturedIds:ownCaptured,opponentCapturedIds:opponentCaptured,
  opponentScore,scorePlayer});
 if(!Number.isFinite(ceiling))return null;
 let ownGainChance=0,captureChance=0,hasGuaranteedScoringCapture=false,hasMatchingHandCard=false;
 for(const handId of hand){
  for(const floorId of floor){
   if(month(handId)!==month(floorId))continue;
   hasMatchingHandCard=true;
   const matchingUnseen=unseen.filter(c=>c.month===month(floorId)).length;
   // Lower bound: neither the opponent's unknown hand nor their next draw
   // has a card of this month. Then the visible capture stays available.
   const survival=probabilityNoMatch(unseen.length,matchingUnseen,drawSlots);
   captureChance=Math.max(captureChance,survival);
   const after=scored([...ownCaptured,handId,floorId]);
   if(Number.isFinite(after)&&after>ownBase){
    ownGainChance=Math.max(ownGainChance,survival);
    if(matchingUnseen===0)hasGuaranteedScoringCapture=true;
   }
  }
 }
 // One opponent hand play and deck draw can together add at most two
 // ordinary floor captures. Estimate danger from possible scoring sources,
 // with a conservative allowance for two-step/combo routes.
 const dangerous=new Set();
 for(const floorId of floor){
  for(const source of unseen){
   if(source.month!==month(floorId))continue;
   const after=scored([...opponentCaptured,floorId,source.id]);
   if(Number.isFinite(after)&&opponentScore+Math.max(0,after-oppBase)>=7)
    dangerous.add(source.id);
  }
 }
 const singleRouteChance=1-probabilityNoMatch(unseen.length,dangerous.size,drawSlots);
 const possible=ceiling>=7;
 // Multi-capture routes may reach seven even when neither individual pair
 // does. They are rarer, but cannot be treated as impossible.
 const twoStepAllowance=possible&&dangerous.size===0?
  clamp01((floor.length>=2?0.13:0.05)*(drawSlots/Math.max(1,unseen.length))):0;
 const opponentFinishChance=possible?
  clamp01(singleRouteChance+(1-singleRouteChance)*twoStepAllowance):0;
 return Object.freeze({opponentCeiling:ceiling,opponentFinishChance,
  ownGainChance,captureChance,hasMatchingHandCard,hasGuaranteedScoringCapture,
  unseenCount:unseen.length,possibleFinish:possible,
  opponentHandCount});
}
// Complete next-turn play/draw candidate enumeration (rather than only
// captures that are already paired on the floor). Godori, stripe sets,
// jjok, ttadak, stack, sweep and Bomb are scored against the full set.
function decideEnumerated(risk,{goCount=0}={}){
 if(!risk)return null;
 if(risk.opponentCanFinish){
  if(goCount<3&&risk.ownCanScore&&
     (risk.ownProtectedScoring||risk.ownScoreChance>.93)&&
     risk.ownScoreChance>.75&&risk.ownScoreChance>risk.opponentWinChance+.25)return 'go';
  return 'stop';
 }
 // A mathematically non-winning opponent turn alone does not justify GO:
 // the player must still have a realistic path to one additional point.
 return risk.ownCanScore&&risk.ownScoreChance>.035?'go':'stop';
}
function enumeratedReason(risk,decision,opponentCapturedIds,deck){
 const map=new Map(deck.map(card=>[card.id,card]));
 const birds=opponentCapturedIds.filter(id=>map.get(id)?.flags?.includes('godori')).length;
 const winsBirds=birds>=2&&(risk.opponentBest?.captureIds||[])
  .some(id=>map.get(id)?.flags?.includes('godori'));
 const detail=winsBirds?' including a possible 5-BIRDIES completion':'';
 if(decision==='stop'&&risk.opponentCanFinish)
  return 'STOP. The computer could reach '+risk.opponentCeiling+
   ' points on its next turn'+detail+'. A winning play/draw combination exists, so lock in your score.';
 if(decision==='stop')return 'STOP. The computer has no modeled immediate route to 7, but your next-turn card combinations do not currently offer a meaningful chance to add one point.';
 if(risk.opponentCanFinish)
  return 'GO. The computer has a possible winning route to '+risk.opponentCeiling+
   ' points'+detail+', but your next scoring opportunity is more likely. This is a risk.';
 return 'GO. The highest modeled computer score on its next turn is '+risk.opponentCeiling+
  ' (below 7), and your cards give you a possible extra scoring point. Hidden cards can change this estimate.';
}
const riskCopy={
 en:{
  safe:(ceiling)=>'GO. Based on visible table captures, the computer can reach at most '+ceiling+
   ' points on its next turn, below 7. You still have a matching capture opportunity.',
  favorable:(ceiling)=>'GO. The computer could reach '+ceiling+
   ' points from the visible table, but your protected scoring match is more likely to earn another point first.',
  caution:(ceiling)=>'STOP. The computer could reach '+ceiling+
   ' points next turn, and your chance of gaining another point appears lower.'
 },
 ko:{
  safe:c=>'고를 추천합니다. 보이는 바닥패로 상대가 다음 차례에 얻을 수 있는 점수는 최대 '+c+
   '점으로 7점 미만입니다. 내 손에 맞는 패가 남아 있습니다.',
  favorable:c=>'고를 추천합니다. 상대가 바닥패로 최대 '+c+
   '점까지 갈 수 있지만, 내 손의 확실한 맞춤 패로 다음 점수를 얻을 가능성이 더 높습니다.',
  caution:c=>'스톱을 추천합니다. 상대가 다음 차례에 최대 '+c+
   '점까지 갈 수 있고, 내가 추가 점수를 얻을 가능성은 더 낮습니다.'
 },
 es:{safe:c=>'GO. Con las capturas visibles, el rival alcanza como máximo '+c+' puntos en su próximo turno, menos de 7. Aún tienes una captura posible.',
  favorable:c=>'GO. Aunque el rival podría alcanzar '+c+' puntos, tu captura protegida tiene mayor probabilidad de sumar otro punto.',
  caution:c=>'STOP. El rival podría alcanzar '+c+' puntos y tu oportunidad de sumar otro punto es menor.'},
 fr:{safe:c=>'GO. Les prises visibles permettraient au plus '+c+' points à l’adversaire au prochain tour, soit moins de 7. Vous avez encore une prise.',
  favorable:c=>'GO. Même si l’adversaire pourrait atteindre '+c+' points, votre prise protégée offre de meilleures chances de marquer.',
  caution:c=>'STOP. L’adversaire pourrait atteindre '+c+' points et vos chances de marquer sont moindres.'},
 de:{safe:c=>'GO. Durch sichtbare Tischkarten kann der Gegner im nächsten Zug höchstens '+c+' Punkte erreichen, weniger als 7. Du hast eine Fangchance.',
  favorable:c=>'GO. Der Gegner könnte '+c+' Punkte erreichen, doch dein geschützter Fangzug hat die bessere Aussicht auf einen weiteren Punkt.',
  caution:c=>'STOP. Der Gegner könnte '+c+' Punkte erreichen; deine Chance auf einen weiteren Punkt ist geringer.'},
 ja:{safe:c=>'ゴー。見えている場札から相手が次の手番で到達できるのは最大'+c+'点で、7点未満です。こちらには取れる札があります。',
  favorable:c=>'ゴー。相手も最大'+c+'点まで届く可能性がありますが、こちらの守られた組み合わせの方が得点の見込みがあります。',
  caution:c=>'ストップ。相手は次の手番で最大'+c+'点に届く可能性があり、こちらの追加得点はそれほど見込めません。'},
 zh:{safe:c=>'建议继续。根据可见桌牌，对手下一轮最多可到'+c+'分，低于7分。你仍有可收的牌。',
  favorable:c=>'建议继续。虽然对手可能达到'+c+'分，但你的受保护匹配牌更有希望获得下一分。',
  caution:c=>'建议停止。对手可能达到'+c+'分，而你再得一分的机会较小。'}
};
function riskDecision(evidence,{goCount=0,opponentScore=0}={}){
 if(!evidence||goCount>=3||opponentScore>=7)return null;
 if(evidence.opponentCeiling<7&&evidence.hasMatchingHandCard)return 'go';
 if(evidence.opponentCeiling>=7){
  if(evidence.ownGainChance>=.65&&
     evidence.ownGainChance>evidence.opponentFinishChance+.1)return 'go';
  if(evidence.opponentFinishChance>=evidence.ownGainChance)return 'stop';
 }
 return null;
}
const modelChoice=(model,context)=>{
 if(!model||!Array.isArray(model.weights)||model.weights.length!==16||
    model.examples<3||model.weights.some(v=>!Number.isFinite(v)))return null;
 const score=action=>feature(context,action).reduce((sum,x,i)=>sum+x*model.weights[i],0);
 const delta=score('go')-score('stop');
 return Math.abs(delta)>=.45?(delta>0?'go':'stop'):null;
};
const api=Object.freeze({evaluate,modelChoice,matches,opponentNextTurnCeiling,publicGoStopRisk,riskDecision,probabilityNoMatch,decideEnumerated,enumeratedReason});
root.GoStopDevGoStopLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(root.location?.hostname||''))return;
const $=id=>document.getElementById(id);
const dialog=$('decisionDialog');
if(!dialog)return;
let activeModel=null,lastRisk=null;
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
 const evidence=engine?.scorePlayer?publicGoStopRisk({
  deck:engine.masterDeck,...snapshot,opponentScore:context.opponentScore,
  playerScore:context.playerScore,
  // Count visible card backs only. Never inspect opponent card identities.
  opponentHandSize:$('aiHand')?.querySelectorAll('.mini-back').length||context.hand.length+1,
  scorePlayer:engine.scorePlayer
 }):null;
 const enumerated=root.GoStopDevTurnOutcomes?.assessTwoSides?.({
  deck:engine?.masterDeck||[],...snapshot,scorePlayer:engine?.scorePlayer,
  opponentScore:context.opponentScore,ownScore:context.playerScore,
  opponentHandSize:$('aiHand')?.querySelectorAll('.mini-back').length||context.hand.length+1,
  threshold:7,
  floorIds:snapshot.floorIds,ownHandIds:snapshot.ownHandIds,
  ownCapturedIds:snapshot.ownCapturedIds,opponentCapturedIds:snapshot.opponentCapturedIds
 });
 lastRisk=enumerated||evidence;
 const fromEnumerated=decideEnumerated(enumerated,{goCount:context.goCount});
 const fromRisk=fromEnumerated||(!checked.urgentThreat?
  riskDecision(evidence,{goCount:context.goCount,opponentScore:context.opponentScore}):null);
 const verifiedSafe=checked.hasMatch&&context.hand.length>0&&
  Number.isInteger(maximum)&&maximum<7&&context.goCount<=1&&!checked.urgentThreat;
 const result=fromRisk||
  (evidence?original:verifiedSafe?'go':checked.lowRisk?'go':
   !checked.urgentThreat&&context.opponentScore<=2&&context.goCount<=1&&learned?learned:original);
 if(result!==original){
  go.classList.toggle('training-choice-recommended',result==='go');
  stop.classList.toggle('training-choice-recommended',result==='stop');
 }
 const coachText=$('trainingCoachText');
 const locale=document.documentElement.lang;
 const riskText=riskCopy[locale]||riskCopy.en;
 if(coachText&&fromEnumerated&&enumerated){
  const explanation=enumeratedReason(enumerated,fromEnumerated,snapshot.opponentCapturedIds,engine.masterDeck);
  if(coachText.textContent!==explanation)coachText.textContent=explanation;
 }else if(coachText&&fromRisk&&evidence){
  const why=result==='go'?(evidence.opponentCeiling<7?
   riskText.safe(evidence.opponentCeiling):riskText.favorable(evidence.opponentCeiling)):
   riskText.caution(evidence.opponentCeiling);
  if(coachText.textContent!==why)coachText.textContent=why;
 }else if(result!==original&&(verifiedSafe||checked.lowRisk)&&coachText){
  coachText.textContent=verifiedSafe?
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
root.GoStopDevGoStopAdvice=Object.freeze({getStatus:()=>({activeModelExamples:activeModel?.examples||0,lastRisk})});
})(typeof globalThis!=='undefined'?globalThis:this);
