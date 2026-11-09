/* Development-only activated Training card-model inference.
 * The server is the only source of trained weights. No local persistence.
 * Model inference is a tie-breaker among rule-equivalent legal captures,
 * never a substitute for visible-card strategy or the frozen game engine.
 */
((root)=>{
'use strict';
const validWeights=w=>Array.isArray(w)&&w.length===16&&w.every(v=>
 typeof v==='number'&&Number.isFinite(v)&&v>=-8&&v<=8);
function activeSnapshot(response){
 const m=response?.activeCardModel,v=m?.version;
 if(response?.ok!==true||!Number.isSafeInteger(v)||v<1||
  v!==response.developmentModelVersion||
  !Number.isSafeInteger(m?.examples)||m.examples<1||!validWeights(m.weights))
  return null;
 return Object.freeze({version:v,examples:m.examples,weights:Object.freeze([...m.weights])});
}
const month=id=>{
 const n=Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
 return n>0&&n<=12?n:0;
};
const unique=x=>[...new Set(Array.isArray(x)?x:[])].filter(Boolean);
const count=(cards,pred)=>cards.filter(pred).length;
function features(card,target,move={}){
 const bit=(c,type)=>Number(c?.type===type),special=(c,flag)=>Number(!!c?.flags?.includes(flag));
 return [
  bit(card,'bright'),bit(card,'ribbon'),bit(card,'pi'),bit(card,'animal'),
  special(card,'doublePi'),special(card,'godori'),
  bit(target,'bright'),bit(target,'ribbon'),bit(target,'pi'),bit(target,'animal'),
  special(target,'doublePi'),special(target,'godori'),
  Number(move.completesSet===true),Number(move.blocksSet===true),
  Number(move.reserved===true),0 // Worker omits immediateScoreGain from safeMove.
 ];
}
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
function evaluate({handIds=[],floorIds=[],ownCapturedIds=[],opponentCapturedIds=[],
 deck=[],recommendedHandId,recommendedFloorId,model}={}){
 if(!model||!validWeights(model.weights)||!Number.isSafeInteger(model.version)||model.version<1)return null;
 const hand=unique(handIds),floor=unique(floorIds);
 if(hand.length<2||!floor.length||!hand.includes(recommendedHandId)||
  !floor.includes(recommendedFloorId))return null;
 const byId=new Map(deck.map(c=>[c?.id,c]).filter(([id,c])=>id&&c&&month(id)===c.month));
 const mine=unique(ownCapturedIds).map(id=>byId.get(id)).filter(Boolean);
 const theirs=unique(opponentCapturedIds).map(id=>byId.get(id)).filter(Boolean);
 // Floor stacks and dual-target choices have distinct game-specific rules.
 // This selector does not attempt to reconstruct those hidden rules.
 if(floor.some(id=>floor.filter(x=>month(x)===month(id)).length>1))return null;
 const moves=[];
 const capturedRibbons=(group,set)=>count(group,c=>c.type==='ribbon'&&c.ribbonSet===set);
 const capturedGodori=count(mine,c=>c.flags?.includes('godori'));
 for(const h of hand)for(const f of floor){
  const card=byId.get(h),target=byId.get(f);
  if(!card||!target||card.month!==target.month)continue;
  const ownThirdStripe=target.type==='ribbon'&&target.ribbonSet&&
    capturedRibbons(mine,target.ribbonSet)>=2;
  const opponentThirdStripe=target.type==='ribbon'&&target.ribbonSet&&
    capturedRibbons(theirs,target.ribbonSet)>=2;
  const thirdBirdie=target.flags?.includes('godori')&&capturedGodori>=2;
  const locked=hand.filter(id=>month(id)===card.month).length===2&&
    floor.filter(id=>month(id)===card.month).length===1;
  const targetValue=target.type==='bright'?5:
    ownThirdStripe||thirdBirdie?4:
    opponentThirdStripe?4:
    locked?3:
    target.type==='ribbon'?2:
    target.type==='pi'&&target.flags?.includes('doublePi')?1.9:
    target.type==='pi'?1.5:1;
  // The model must not trade away a more valuable physical hand card
  // within the same family, or a more valuable target category.
  const handValue=card.type==='bright'?5:
    card.type==='ribbon'?4:
    card.type==='pi'&&card.flags?.includes('doublePi')?3:
    card.type==='pi'?2:
    card.flags?.includes('godori')?1.9:1;
  const move={handId:h,floorId:f,card,target,
   tier:targetValue,handValue,completesSet:!!(ownThirdStripe||thirdBirdie),
   blocksSet:!!opponentThirdStripe, reserved:false};
  move.score=dot(model.weights,features(card,target,move));
  moves.push(move);
 }
 if(moves.length<2)return null;
 const native=moves.find(m=>m.handId===recommendedHandId&&m.floorId===recommendedFloorId);
 if(!native)return null;
 // Only let the model choose among the same hard strategic tier and
 // same physical hand-card value. Fail closed when native broke a rule.
 const topTier=Math.max(...moves.map(m=>m.tier));
 if(native.tier!==topTier)return null;
 const peers=moves.filter(m=>m.tier===topTier&&m.handValue===native.handValue);
 if(peers.length<2)return null;
 peers.sort((a,b)=>b.score-a.score||a.handId.localeCompare(b.handId)||a.floorId.localeCompare(b.floorId));
 const best=peers[0];
 if(best.handId===native.handId&&best.floorId===native.floorId||best.score-native.score<=0.02)return null;
 return Object.freeze({handId:best.handId,floorId:best.floorId,
  version:model.version,examples:model.examples,confidenceDelta:best.score-native.score,
  alternativeHandId:native.handId,alternativeFloorId:native.floorId});
}
let enabled=false,sequence=0,snapshot=null;
async function start(){
 enabled=true;snapshot=null;
 const thisSequence=++sequence;
 try{
  const state=await root.GoStopTrainingCloud?.state?.();
  if(enabled&&thisSequence===sequence)snapshot=activeSnapshot(state);
 }catch{if(enabled&&thisSequence===sequence)snapshot=null;}
}
function stop(){enabled=false;sequence++;snapshot=null;}
function choose(args){return enabled?evaluate({...args,model:snapshot}):null;}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 if(e.target?.closest?.('#trainingModeBtn,#playAgainBtn')&&
  (e.target.closest('#trainingModeBtn')||enabled))void start();
 else if(e.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn'))stop();
},{capture:true});
const api=Object.freeze({activeSnapshot,features,evaluate,choose,start,stop,
 getStatus:()=>({enabled,version:snapshot?.version||null,examples:snapshot?.examples||0})});
root.GoStopDevTrainingModelInference=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
