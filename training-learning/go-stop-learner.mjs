// Isolated DEVELOPMENT-only expert GO / STOP preference ranker.
// Separate from the protected game and other Training models.
export const GO_STOP_ACTIONS=Object.freeze(['go','stop']);
const valid=(c)=>c&&Number.isInteger(c.playerScore)&&c.playerScore>=0&&c.playerScore<=100&&
 Number.isInteger(c.opponentScore)&&c.opponentScore>=0&&c.opponentScore<=100&&
 Number.isInteger(c.remainingCards)&&c.remainingCards>=0&&c.remainingCards<=10&&
 Number.isInteger(c.goCount)&&c.goCount>=0&&c.goCount<=20&&typeof c.hasMatch==='boolean';
export const legalGoStopActions=()=>[...GO_STOP_ACTIONS];
export function goStopFeatures(context,action){
 if(!valid(context)||!GO_STOP_ACTIONS.includes(action))throw new TypeError('Invalid GO / STOP context/action');
 const i=GO_STOP_ACTIONS.indexOf(action),features=Array(16).fill(0);
 const signals=[1,Number(context.opponentScore===0),Number(context.opponentScore>=5),
  Number(context.remainingCards===1),Number(context.hasMatch),
  Number(context.opponentScore===0&&context.remainingCards===1&&context.hasMatch),
  Number(context.goCount>=2),Number(context.playerScore>=10)];
 signals.forEach((v,k)=>{features[2*k+i]=v;});
 return features;
}
const dot=(w,f)=>w.reduce((s,v,i)=>s+v*f[i],0);
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
export class GoStopDecisionRanker{
 constructor(model=null){
  this.weights=model?.weights?[...model.weights]:Array(16).fill(0);
  if(this.weights.length!==16||this.weights.some(v=>!Number.isFinite(v)))throw Error('Invalid GO / STOP weights');
  this.examples=Number.isSafeInteger(model?.examples)&&model.examples>=0?model.examples:0;
  this.games=new Set(Array.isArray(model?.games)?model.games:[]);
 }
 rank(context){
  return legalGoStopActions().map(action=>({action,score:dot(this.weights,goStopFeatures(context,action))}))
   .sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action))[0];
 }
 trainGame(game){
  if(!game?.complete||typeof game.id!=='string'||!Array.isArray(game.decisions))throw Error('Only completed games are trainable');
  if(this.games.has(game.id))return 0;
  let learned=0;
  for(const row of game.decisions){
   if(!GO_STOP_ACTIONS.includes(row?.chosenAction)||!valid(row.context))continue;
   const winner=goStopFeatures(row.context,row.chosenAction);
   const loser=goStopFeatures(row.context,row.chosenAction==='go'?'stop':'go');
   const delta=winner.map((v,i)=>v-loser[i]);
   const adjustment=.12*(1-sigmoid(dot(this.weights,delta)));
   this.weights=this.weights.map((w,i)=>Math.max(-8,Math.min(8,w+adjustment*delta[i]-.00001*w)));
   learned++;
  }
  if(learned){this.games.add(game.id);this.examples+=learned;}
  return learned;
 }
 export(){return {weights:[...this.weights],games:[...this.games],examples:this.examples};}
}
