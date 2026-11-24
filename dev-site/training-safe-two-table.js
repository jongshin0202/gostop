/* Development-only safe two-table family timing.
 * If a player holds one month-card while two distinct cards of that month
 * remain on the table, the sole fourth card can remove at most one of those
 * targets during the opponent's next ordinary turn. The other is capturable
 * next turn IF the game continues. This is not a promise of game survival.
 */
((root)=>{
'use strict';
const unique=a=>[...new Set(Array.isArray(a)?a:[])].filter(Boolean);
const byMonth=(id)=>Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
const monthNames=['Pine','Plum','Cherry','Vine','Iris','Rose','Bush','Hill','Daisy','Star','Berry','Willow'];
function score(cards,scorePlayer){
 if(typeof scorePlayer!=='function')return NaN;
 const vals=['animal','pi'].map(gukjinMode=>
  scorePlayer({captured:cards,gukjinMode})?.total);
 return vals.every(Number.isFinite)?Math.max(...vals):NaN;
}
function eligible({handIds=[],floorIds=[],ownCapturedIds=[],
 opponentCapturedIds=[],deck=[],scorePlayer=null}={}){
 if(!Array.isArray(deck)||typeof scorePlayer!=='function')return [];
 const hand=unique(handIds),floor=unique(floorIds);
 const seen=new Set([...hand,...floor,...ownCapturedIds,...opponentCapturedIds]);
 const byId=new Map(deck.map(c=>[c?.id,c]));
 const opp=unique(opponentCapturedIds).map(id=>byId.get(id)).filter(Boolean);
 const before=score(opp,scorePlayer);
 if(!Number.isFinite(before))return [];
 const answer=[];
 for(let month=1;month<=12;month++){
  const family=deck.filter(c=>c?.month===month),
   held=hand.filter(id=>byMonth(id)===month),
   floorMonth=floor.filter(id=>byMonth(id)===month);
  if(family.length!==4||held.length!==1||floorMonth.length!==2||
   !family.every(c=>byMonth(c.id)===month))continue;
  const remaining=family.filter(c=>!seen.has(c.id));
  if(remaining.length>1)continue;
  // A deferred capture must not expose an immediate point-scoring opponent
  // route, including a third Blue Stripe or a completed birdie set.
  let maxGain=0;
  for(const unknown of remaining)for(const targetId of floorMonth){
   const after=score([...opp,unknown,byId.get(targetId)],scorePlayer);
   if(!Number.isFinite(after)){maxGain=Infinity;break;}
   maxGain=Math.max(maxGain,after-before);
  }
  if(maxGain>0)continue;
  answer.push(Object.freeze({month,handId:held[0],
   floorIds:Object.freeze(floorMonth),unknownMatching:remaining.length}));
 }
 return answer;
}
function select({handIds=[],floorIds=[],ownCapturedIds=[],opponentCapturedIds=[],
 deck=[],scorePlayer=null,recommendedHandId,recommendedFloorId}={}){
 const safe=eligible({handIds,floorIds,ownCapturedIds,opponentCapturedIds,deck,scorePlayer});
 const delayed=safe.find(x=>x.handId===recommendedHandId&&
  x.floorIds.includes(recommendedFloorId));
 if(!delayed)return null;
 const byId=new Map(deck.map(c=>[c?.id,c]));
 const original=byId.get(recommendedFloorId);
 if(!original||original.type==='bright'||original.flags?.includes('godori'))return null;
 const own=unique(ownCapturedIds).map(id=>byId.get(id)).filter(Boolean);
 const before=score(own,scorePlayer);
 const native=score([...own,byId.get(recommendedHandId),original],scorePlayer);
 if(!Number.isFinite(before)||!Number.isFinite(native)||native>before)return null;
 const candidates=[];
 for(const h of unique(handIds))for(const f of unique(floorIds)){
  const hand=byId.get(h),target=byId.get(f);
  if(!hand||!target||hand.month!==target.month||
   target.month===delayed.month)continue;
  const after=score([...own,hand,target],scorePlayer);
  if(!Number.isFinite(after)||after<before)continue;
  const targetValue=target.type==='bright'?6:
   target.flags?.includes('godori')?5:target.type==='ribbon'?4:
   target.flags?.includes('doublePi')?3:target.type==='pi'?2:1;
  candidates.push({handId:h,floorId:f,after,targetValue});
 }
 candidates.sort((a,b)=>b.after-a.after||b.targetValue-a.targetValue||
  a.handId.localeCompare(b.handId)||a.floorId.localeCompare(b.floorId));
 return candidates.length?Object.freeze({
  handId:candidates[0].handId,floorId:candidates[0].floorId,
  deferredMonth:delayed.month,changed:true}):null;
}
const wording={
 en:(m)=>m+' can wait. You hold one '+m+' card while two '+m+
  ' cards are on the table. Even if the computer takes one, the other remains to match on your next turn if the game continues. Capture a different family first.',
 ko:m=>m+' 패는 지금 먹지 않아도 됩니다. 손에 '+m+' 한 장이 있고 바닥에 두 장이 있어 상대가 한 장을 먹더라도 게임이 계속된다면 다음 차례에 나머지 한 장을 먹을 수 있습니다. 다른 월의 패를 먼저 먹으세요.',
 es:m=>'Puedes dejar '+m+' para después: tienes una carta en mano y dos en la mesa. Aunque el rival tome una, quedará otra para tu siguiente turno si la partida continúa. Captura otra familia primero.',
 fr:m=>m+' peut attendre : vous avez une carte de cette famille en main et deux sur la table. Même si le rival en prend une, l’autre restera au prochain tour si la partie continue. Prenez une autre famille d’abord.',
 de:m=>m+' kann warten: Du hältst eine Karte dieser Familie und zwei liegen auf dem Tisch. Selbst wenn der Gegner eine nimmt, bleibt eine für deinen nächsten Zug, falls das Spiel weitergeht. Sichere zuerst eine andere Familie.',
 ja:m=>m+'は後回しにできます。手札に1枚、場に2枚あり、相手が1枚取っても対局が続けば次の自分の番に残りを取れます。別の月の札を先に取りましょう。',
 zh:m=>m+'可以稍后再收。你手里有一张，桌面有两张。即使对手收走其中一张，只要本局继续，下一回合仍有另一张可配对。先收其他月份的牌。'
};
const explain=(month,lang='en')=>(wording[lang]||wording.en)(monthNames[month-1]||'This family');
const api=Object.freeze({eligible,select,explain});
root.GoStopDevTrainingSafeTwoTable=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
