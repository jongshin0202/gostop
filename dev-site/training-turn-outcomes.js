/* Pure, isolated DEVELOPMENT Training next-turn score enumerator.
 * Does NOT know opponents' hidden cards or deck order, change game state,
 * or affect production. Enumerates legal candidate play/draw identities
 * consistent with *public* cards, scores entire captured sets using the
 * frozen game's scorer, and estimates likelihood separately from the ceiling.
 * A ceiling is never represented as a statistical prediction.
 */
((root)=>{
'use strict';
const idMonth=id=>Number(/^m(\d{1,2})-/.exec(String(id||''))?.[1])||0;
const unique=ids=>[...new Set((ids||[]).filter(Boolean))];
const clamp=x=>Math.max(0,Math.min(1,x));
function scored(scorePlayer,captured,mode='animal'){
 const raw=scorePlayer({captured,gukjinMode:mode});
 return Number.isFinite(raw?.total)?raw.total:0;
}
function scoreBest(scorePlayer,captured){
 return Math.max(scored(scorePlayer,captured,'animal'),scored(scorePlayer,captured,'pi'));
}
const hasPi=card=>card&&(card.type==='pi'||card.flags?.includes('switchPi'));
function pairsFromFloor(floor,source){
 const matches=floor.filter(card=>card.month===source.month);
 if(!matches.length)return [{capture:[],remaining:floor,transfer:0,kind:'no-match'}];
 if(matches.length===3)return [{capture:[source,...matches],remaining:floor.filter(c=>c.month!==source.month),transfer:1,kind:'stack'}];
 if(matches.length===2)return matches.map(target=>({capture:[source,target],
  remaining:floor.filter(c=>c.id!==target.id),transfer:0,kind:'pair'}));
 return [{capture:[source,matches[0]],remaining:floor.filter(c=>c.id!==matches[0].id),transfer:0,kind:'pair'}];
}
function distinctCards(ids,byId){return unique(ids).map(id=>byId.get(id)).filter(Boolean);}
function bestWithTransfer({captured,added,stealable,transferCount,scorePlayer,bonus=0}){
 const combined=[...captured,...added];
 let best=scoreBest(scorePlayer,combined)+bonus;
 if(!transferCount||!stealable.length)return best;
 // All transfer-eligible Singles contribute only one or two Singles to
 // scoring. Choosing the highest-value first is exact for this scoring rule
 // and avoids combinatorial UI freezes on low-end Android devices.
 const eligible=stealable.filter(hasPi).sort((a,b)=>
  Number(!!b.flags?.includes('doublePi')||!!b.flags?.includes('switchPi'))-
  Number(!!a.flags?.includes('doublePi')||!!a.flags?.includes('switchPi'))||
  a.id.localeCompare(b.id));
 for(let n=1;n<=Math.min(transferCount,eligible.length);n++){
  best=Math.max(best,scoreBest(scorePlayer,[...combined,...eligible.slice(0,n)])+bonus);
 }
 return best;
}
/** Analysis from one actor's own perspective: own hand is known or candidate
 * unseen, opponent hand is unknown. Exact score trajectories for the modeled
 * standard, jjok, ttadak, floor stack, sweep and Bomb captures.
 * Returned probability is an approximate exposure estimate, not certainty.
 */
function enumerateTurn({deck=[],floorIds=[],actingCapturedIds=[],otherCapturedIds=[],
 knownHandIds=[],actingHandIds=null,otherHandSize=0,actingHandSize=0,
 currentScore=0,scorePlayer=null,threshold=7,
 allowBomb=true}={}){
 if(!Array.isArray(deck)||!deck.length||typeof scorePlayer!=='function')return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const knownSet=new Set([...floorIds,...actingCapturedIds,...otherCapturedIds,...knownHandIds,...(actingHandIds||[])]);
 const floor=distinctCards(floorIds,byId);
 const captured=distinctCards(actingCapturedIds,byId);
 const stealable=distinctCards(otherCapturedIds,byId).filter(hasPi);
 const unseen=deck.filter(c=>!knownSet.has(c.id));
 const plays=actingHandIds===null?unseen:distinctCards(actingHandIds,byId);
 const baseline=scoreBest(scorePlayer,captured);
 const reserve=unseen;
 const maxEvaluations=150000;
 let evaluated=0,wins=0,reachable=0,ceiling=currentScore,best=null,possibleScore=0;
 const addResult=(capture,transfer,kind,sourceIds=[],newFloorCount=floor.length)=>{
  if(evaluated++>maxEvaluations)return;
  const bonus=0;
  const newScore=bestWithTransfer({captured,added:capture,stealable,transferCount:transfer,
   scorePlayer,bonus});
  const after=currentScore+Math.max(0,newScore-baseline);
  possibleScore=Math.max(possibleScore,after-currentScore);
  if(after>ceiling){
   ceiling=after;best={kind,captureIds:capture.map(c=>c.id),sourceIds,after,transfer};
  }
  if(after>=threshold)wins++;
  if(after>currentScore)reachable++;
 };
 if(actingHandSize===0&&actingHandIds===null)return Object.freeze({
  ceiling:currentScore,possibleFinish:currentScore>=threshold,estimatedFinishChance:0,
  estimatedGainChance:0,scenarios:0,best:null,confidence:'no-hand'});
 for(const play of plays){
  // A known acting hand card is never also a possible next deck draw.
  const draws=reserve.filter(card=>card.id!==play.id);
  // With no deck draw available, a playable hand card can still capture.
  if(!draws.length){
   for(const p of pairsFromFloor(floor,play))addResult(p.capture,p.transfer,p.kind,[play.id],p.remaining.length);
   continue;
  }
  for(const drawn of draws){
   const playOptions=pairsFromFloor(floor,play);
   for(const p of playOptions){
    // The played unmatched card lies on the table until the draw resolves.
    const intermediate=p.capture.length?p.remaining:[...p.remaining,play];
    for(const d of pairsFromFloor(intermediate,drawn)){
     const isJjok=!p.capture.length&&d.capture.some(card=>card.id===play.id);
     const sameTwoFloor=play.month===drawn.month&&p.capture.length===2&&d.capture.length===2;
     const captures=[...p.capture,...d.capture];
     const left=d.remaining.length;
     const transfer=p.transfer+d.transfer+Number(isJjok)+Number(sameTwoFloor)+
       Number(left===0&&captures.length>0);
     addResult(captures,transfer,
      isJjok?'jjok':sameTwoFloor?'ttadak':p.kind==='stack'||d.kind==='stack'?'stack':'normal',
      [play.id,drawn.id],left);
    }
   }
  }
 }
 // Bomb is a real special route, and needs three same-month cards in a hand.
 // For unknown hands, every still-unseen three-card combination is considered;
 // for known actor hands, use exactly those owned cards.
 if(allowBomb&&(actingHandIds===null?actingHandSize>=3:plays.length>=3)){
  for(const card of floor){
   const handPool=plays.filter(c=>c.month===card.month);
   if(handPool.length<3)continue;
   for(let i=0;i<handPool.length-2;i++)for(let j=i+1;j<handPool.length-1;j++)
    for(let k=j+1;k<handPool.length;k++){
     const tri=[handPool[i],handPool[j],handPool[k]],targetFloor=floor.filter(c=>c.id===card.id);
     addResult([...tri,...targetFloor],1,'bomb',tri.map(x=>x.id),floor.length-1);
    }
  }
 }
 // Approximate chance of a favorable route: future deck draw is one uniformly
 // sampled unseen card; an unknown hand offers multiple possible playable cards.
 // This estimate must never be advertised as a guaranteed event probability.
 const share=evaluated?wins/evaluated:0,progressShare=evaluated?reachable/evaluated:0;
 const choices=actingHandIds===null?Math.max(1,actingHandSize):1;
 return Object.freeze({ceiling,possibleFinish:ceiling>=threshold,
  estimatedFinishChance:clamp(1-(1-share)**choices),
  estimatedGainChance:clamp(1-(1-progressShare)**choices),
  scenarios:evaluated,best,confidence:'visible-conditional',possibleScore});
}
function assessTwoSides({deck=[],floorIds=[],ownHandIds=[],ownCapturedIds=[],
 opponentCapturedIds=[],opponentHandSize=0,opponentScore=0,ownScore=0,
 scorePlayer=null,threshold=7}={}){
 if(!Array.isArray(deck)||!deck.length||typeof scorePlayer!=='function')return null;
 const enemy=enumerateTurn({deck,floorIds,actingCapturedIds:opponentCapturedIds,
  otherCapturedIds:ownCapturedIds,knownHandIds:ownHandIds,actingHandSize:opponentHandSize,
  currentScore:opponentScore,scorePlayer,threshold});
 const self=enumerateTurn({deck,floorIds,actingCapturedIds:ownCapturedIds,
  otherCapturedIds:opponentCapturedIds,actingHandIds:ownHandIds,
  knownHandIds:ownHandIds,currentScore:ownScore,scorePlayer,threshold:ownScore+1});
 if(!enemy||!self)return null;
 return Object.freeze({opponentCeiling:enemy.ceiling,
  opponentCanFinish:enemy.possibleFinish,
  opponentWinChance:enemy.estimatedFinishChance,
  ownCanScore:!!self.possibleScore,ownScoreChance:self.estimatedGainChance,
  ownCeiling:self.ceiling,opponentBest:enemy.best,ownBest:self.best,
  opponentScenarios:enemy.scenarios,ownScenarios:self.scenarios});
}
const api=Object.freeze({enumerateTurn,assessTwoSides,pairsFromFloor,scoreBest,idMonth});
root.GoStopDevTurnOutcomes=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
