/* Development-only cross-device Competitive Solo decision synchronization.
 * No game rules, card ownership, scoring, or server decisions are changed.
 * A single account can have multiple connected screens; the server's latest
 * snapshot resolves any older local table-target or Gukjin (Sake Cup) modal.
 */
(function(root){
'use strict';
const isDevHost=host=>/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(host||'');
const revision=s=>Number.isSafeInteger(s?.revision)&&s.revision>=0?s.revision:-1;
const sameMatch=(a,b)=>!!(a?.matchId&&b?.matchId&&a.matchId===b.matchId);
const stale=(current,latest)=>sameMatch(current,latest)&&revision(latest)>revision(current);
const targetDecision=s=>{
 const pending=s?.state?.pendingDecision;
 return pending?.type==='chooseFloorTarget'?pending:
  s?.nextAction?.type==='chooseFloorTarget'?s.nextAction:null;
};
const currentTargets=decision=>Array.isArray(decision?.legalTargetIds)?
 decision.legalTargetIds.filter(x=>typeof x==='string'):[];
const targetMatches=(localIds,decision)=>{
 if(!Array.isArray(localIds)||!localIds.length||!decision)return false;
 const targetIds=currentTargets(decision);
 return targetIds.length===localIds.length&&
  targetIds.every(id=>localIds.includes(id));
};
const gukjinModeEvent=(events,seatId)=>Array.isArray(events)&&events.some(event=>
 event?.type==='gukjinModeChanged'&&(!seatId||event.actorId===seatId));
function isRankedSolo(snapshot,room){
 return !!(snapshot?.ranked===true&&room?.rankedMode==='solo');
}
const api=Object.freeze({stale,targetDecision,targetMatches,gukjinModeEvent,isRankedSolo});
root.GoStopDevPeerSyncLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!isDevHost(root.location?.hostname))return;

let lastSnapshot=null;
function reconcile({snapshot,events=[],room=null,localTargetIds=null,cancelTargetChoice,closeGukjinDialog}={}){
 if(!isRankedSolo(snapshot,room))return {active:false};
 if(lastSnapshot&&!sameMatch(lastSnapshot,snapshot))lastSnapshot=null;
 if(lastSnapshot&&stale(snapshot,lastSnapshot))return {active:true,ignoredStale:true};
 const previous=lastSnapshot;
 lastSnapshot=snapshot;
 const pending=targetDecision(snapshot);
 let cancelled=false,closedGukjin=false;
 if(Array.isArray(localTargetIds)&&localTargetIds.length&&
    !targetMatches(localTargetIds,pending)&&typeof cancelTargetChoice==='function'){
  cancelTargetChoice();cancelled=true;
 }
 const side=snapshot.seatId==='playerB'?'ai':'human';
 const previousMode=previous?.state?.[side]?.gukjinMode;
 const nextMode=snapshot?.state?.[side]?.gukjinMode;
 const changedMode=!!(previousMode&&nextMode&&previousMode!==nextMode);
 if((gukjinModeEvent(events,snapshot.seatId)||changedMode)&&
    typeof closeGukjinDialog==='function'){
  closeGukjinDialog();closedGukjin=true;
 }
 return {active:true,cancelled,closedGukjin,revision:revision(snapshot)};
}
function staleDecision(current,latest,room){
 return isRankedSolo(latest,room)&&stale(current,latest);
}
root.GoStopDevPeerSync=Object.freeze({reconcile,staleDecision,
 skipGukjinPrompt:staleDecision,
 getStatus:()=>({matchId:lastSnapshot?.matchId||null,revision:revision(lastSnapshot)})});

// Never regress an in-memory authoritative revision for this one dev-only mode.
// Network sync replies can arrive after a more recent broadcast snapshot.
const Adapter=root.GoStopOnline?.OnlineSessionAdapter;
if(Adapter?.prototype?.receive){
 const prior=Adapter.prototype.receive;
 Adapter.prototype.receive=function(message){
  if(message?.type==='snapshot'&&this.room?.rankedMode==='solo'){
   const incoming=message.snapshot;
   const old=this.__devPeerLastSnapshot;
   if(old&&sameMatch(old,incoming)&&stale(incoming,old))return;
   this.__devPeerLastSnapshot=incoming;
  }
  return prior.call(this,message);
 };
}
})(typeof globalThis!=='undefined'?globalThis:this);
