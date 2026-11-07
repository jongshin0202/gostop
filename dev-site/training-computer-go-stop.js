/* Development-only Training computer GO / STOP decision policy.
 * The computer knows its OWN hand, the floor and captured cards, but never
 * reads the human player's hidden hand or deck order. No production effect.
 */
((root)=>{
'use strict';
const analysis=root.GoStopDevTurnOutcomes;
const ids=cards=>(cards||[]).map(c=>c.id).filter(Boolean);
function choose({deck=[],floor=[],ai=null,humanCaptured=[],humanHandCount=0,
 aiScore=0,humanScore=0,engine=null}={}){
 if(!analysis||!ai||!Array.isArray(ai.hand)||!ai.hand.length||!engine?.scorePlayer)return null;
 const risk=analysis.assessTwoSides({
  deck,floorIds:ids(floor),ownHandIds:ids(ai.hand),
  ownCapturedIds:ids(ai.captured),opponentCapturedIds:ids(humanCaptured),
  opponentHandSize:humanHandCount,ownScore:aiScore,opponentScore:humanScore,
  scorePlayer:engine.scorePlayer
 });
 if(!risk)return null;
 let decision=null,reason='uncertain';
 // No counter-finish route: don't cash out early while the computer still
 // has a way to grow its score. Conversely, no scoring upside means STOP.
 if(!risk.opponentCanFinish){
  decision=risk.ownCanScore?'go':'stop';
  reason=risk.ownCanScore?'no opponent finish route; computer can gain':'no additional computer scoring route';
 }else if(risk.ownCanScore&&(risk.ownProtectedScoring||risk.ownScoreChance>.93)&&
          risk.ownScoreChance>.72&&risk.ownScoreChance>risk.opponentWinChance+.2){
  decision='go';reason='computer scoring upside outweighs opponent risk';
 }else if(risk.opponentWinChance>=.08||risk.ownScoreChance<.15){
  decision='stop';reason='opponent possible finish and insufficient computer scoring advantage';
 }
 return Object.freeze({decision,reason,risk});
}
const api=Object.freeze({choose});
root.GoStopDevTrainingComputerChoice=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
