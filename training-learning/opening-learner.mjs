// Independent development-only multi-label Opening Strategy learner.
// No game-engine imports, no gameplay changes and no browser storage.
export const STRATEGIES=Object.freeze([
 'brights','godori','red-stripes','blue-stripes','plain-stripes',
 'singles','pictures','shake-bomb'
]);
export const EVIDENCE_LENGTH=12;
export const validEvidence=features=>Array.isArray(features)&&features.length===EVIDENCE_LENGTH&&
 features.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1);
export const validChoices=choices=>Array.isArray(choices)&&new Set(choices).size===choices.length&&
 choices.every(x=>STRATEGIES.includes(x));
const dot=(a,b)=>a.reduce((s,w,i)=>s+w*b[i],0);
const logistic=z=>1/(1+Math.exp(-Math.max(-20,Math.min(20,z))));
export class OpeningStrategyRanker{
 constructor(state){
  const weights=state?.weights;
  this.weights=weights===undefined?STRATEGIES.map(()=>Array(EVIDENCE_LENGTH).fill(0)):
   weights.map(row=>[...row]);
  if(!Array.isArray(this.weights)||this.weights.length!==STRATEGIES.length||
   this.weights.some(row=>!Array.isArray(row)||row.length!==EVIDENCE_LENGTH||
     row.some(w=>!Number.isFinite(w))))throw Error('Invalid opening strategy model');
  this.examples=Number.isSafeInteger(state?.examples)&&state.examples>=0?state.examples:0;
  this.games=new Set(Array.isArray(state?.games)?state.games:[]);
 }
 predict(features){
  if(!validEvidence(features))throw new Error('Invalid opening evidence');
  return STRATEGIES.map((strategy,i)=>({strategy,probability:logistic(dot(this.weights[i],features))}))
   .sort((a,b)=>b.probability-a.probability||a.strategy.localeCompare(b.strategy));
 }
 trainGame(game){
  if(!game?.complete||typeof game.id!=='string'||!Array.isArray(game.openings))
   throw new Error('Only completed Training games can train opening strategies');
  if(this.games.has(game.id))return 0;
  let count=0;
  for(const entry of game.openings){
   if(entry?.choice!=='confirmed'||!validEvidence(entry.evidence)||
    !validChoices(entry.selected)||!entry.selected.length)continue;
   const selection=new Set(entry.selected),features=entry.evidence;
   this.weights=this.weights.map((row,i)=>{
    const label=selection.has(STRATEGIES[i])?1:0;
    const gain=.20*(label-logistic(dot(row,features)));
    return row.map((w,j)=>Math.max(-6,Math.min(6,w+gain*features[j])));
   });
   count++;
  }
  if(count){this.examples+=count;this.games.add(game.id);}
  return count;
 }
 export(){return {weights:this.weights.map(row=>[...row]),examples:this.examples,games:[...this.games]};}
}
