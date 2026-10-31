// Isolated server-side expert preference model for Training special choices.
// It never changes card rules or instructs the game client to execute actions.
const ACTIONS=Object.freeze(['shake','keepForBomb','bomb','playOne']);
const index=a=>ACTIONS.indexOf(a);
export const legalSpecialActions=({kind,bombReady}={})=>{
 if(kind==='shake')return bombReady===true?['shake','bomb']:bombReady===false?['shake','keepForBomb']:[];
 return kind==='bomb'?['bomb','playOne']:[];
};
export const specialFeatures=(context,action)=>{
 const i=index(action);
 if(i<0)throw new TypeError('Unknown special action');
 const features=Array(16).fill(0);
 features[i]=1;
 if(context.bombReady===true)features[4+i]=1;
 if(context.month>=11)features[8+i]=1;
 if(context.kind==='bomb')features[12+i]=1;
 return features;
};
const dot=(w,f)=>w.reduce((sum,v,i)=>sum+v*f[i],0);
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
export class SpecialDecisionRanker{
 constructor(model=null){
  this.weights=Array.isArray(model?.weights)?[...model.weights]:Array(16).fill(0);
  if(this.weights.length!==16||this.weights.some(v=>!Number.isFinite(v)))throw Error('Invalid special model weights');
  this.games=new Set(Array.isArray(model?.games)?model.games:[]);
  this.examples=Number.isSafeInteger(model?.examples)&&model.examples>=0?model.examples:0;
 }
 rank(context){
  return legalSpecialActions(context).map(action=>({action,score:dot(this.weights,specialFeatures(context,action))}))
    .sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action))[0]||null;
 }
 trainGame(game){
  if(!game?.complete||typeof game.id!=='string'||!Array.isArray(game.decisions))throw Error('Only completed games are trainable');
  if(this.games.has(game.id))return 0;
  let learned=0;
  for(const d of game.decisions){
   const context=d?.context,legal=legalSpecialActions(context);
   if(legal.length!==2||!legal.includes(d?.chosenAction))continue;
   const other=legal.find(a=>a!==d.chosenAction);
   const winner=specialFeatures(context,d.chosenAction);
   const loser=specialFeatures(context,other);
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
