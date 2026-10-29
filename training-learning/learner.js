// Standalone offline imitation-learning prototype. Never alters the game.
'use strict';
const kinds=['bright','ribbon','pi','animal'];
function feature(card,target,move={}){
 const bit=(c,t)=>Number(c?.type===t);
 const special=(c,s)=>Number(!!c?.flags?.includes(s));
 return [
  bit(card,'bright'),bit(card,'ribbon'),bit(card,'pi'),bit(card,'animal'),
  special(card,'doublePi'),special(card,'godori'),
  bit(target,'bright'),bit(target,'ribbon'),bit(target,'pi'),bit(target,'animal'),
  special(target,'doublePi'),special(target,'godori'),
  Number(!!move.completesSet),Number(!!move.blocksSet),Number(!!move.reserved),
  Math.min(10,Math.max(0,Number(move.immediateScoreGain)||0))/10
 ];
}
const id=m=>m?.moveId||`${m?.card?.id||''}|${m?.target?.id||'-'}`;
const dot=(w,x)=>w.reduce((s,v,i)=>s+v*x[i],0);
const sigmoid=v=>1/(1+Math.exp(-Math.min(30,Math.max(-30,v))));
class ExpertRanker{
 constructor(model=null){this.weights=model?.weights?[...model.weights]:Array(16).fill(0);this.games=new Set(model?.games||[]);this.examples=model?.examples||0;if(this.weights.length!==16)throw Error('Invalid model');}
 rank(moves){return [...moves].map(m=>({id:id(m),score:dot(this.weights,feature(m.card,m.target,m))})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0]||null;}
 trainGame(game){
  if(!game?.complete||!game.id||!Array.isArray(game.decisions))throw Error('Only completed games are trainable');
  if(this.games.has(game.id))return 0;
  let learned=0;
  for(const d of game.decisions){
   const moves=d?.legalMoves;if(!Array.isArray(moves)||moves.length<2)continue;
   const chosen=moves.find(m=>id(m)===d.chosenId);
   if(!chosen||!chosen.card?.id||moves.some(m=>!m.card?.id))continue;
   const x=feature(chosen.card,chosen.target,chosen);
   for(const alt of moves.filter(m=>id(m)!==d.chosenId)){
    const y=feature(alt.card,alt.target,alt);
    const delta=x.map((v,i)=>v-y[i]);
    const adjustment=.12*(1-sigmoid(dot(this.weights,delta)))/(moves.length-1);
    this.weights=this.weights.map((w,i)=>Math.max(-8,Math.min(8,w+adjustment*delta[i]-.00001*w)));
   }
   learned++;
  }
  if(learned){this.games.add(game.id);this.examples+=learned;}
  return learned;
 }
 evaluate(decisions){let n=0,correct=0;for(const d of decisions||[]){if(!d?.legalMoves?.length||!d.chosenId)continue;const r=this.rank(d.legalMoves);if(!r)continue;n++;if(r.id===d.chosenId)correct++;}return {n,correct,accuracy:n?correct/n:null};}
 export(){return {weights:[...this.weights],games:[...this.games],examples:this.examples};}
}
if(typeof module!=='undefined'&&module.exports)module.exports={ExpertRanker,feature,id};
if(typeof globalThis!=='undefined')globalThis.GoStopExpertLearning=Object.freeze({ExpertRanker,feature,id});