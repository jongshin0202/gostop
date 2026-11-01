/* Compile-time ONLY instrumentation for the isolated development Vercel build.
 * The protected repository app.js is copied verbatim before applying these
 * narrow cross-device presentation reconciliation hooks to dev-site/dist/app.js.
 * Production builds and all tracked main-game source remain unchanged.
 */
export function instrumentDevCompetitiveSoloPeerSync(source){
 if(typeof source!=='string'||source.length<10000)throw new TypeError('Expected frozen app.js source.');
 const patches=[
  {
   anchor:"async function driveOnline(snapshot,events=[]){\n      if(!onlineMode)return;",
   replacement:"async function driveOnline(snapshot,events=[]){\n      if(!onlineMode)return;\n      if(globalThis.GoStopDevPeerSync?.staleDecision?.(snapshot,latestOnlineSnapshot,globalThis.goStopOnlineSession?.room))return;"
  },
  {
   anchor:"const actor=presentationEvents.find(event=>event.actorId)?.actorId;if(actor){await promptGukjinChoice(legacySideForPlayerId(actor),presentationEvents);",
   replacement:"const actor=presentationEvents.find(event=>event.actorId)?.actorId;if(actor&&!globalThis.GoStopDevPeerSync?.skipGukjinPrompt?.(snapshot,latestOnlineSnapshot,globalThis.goStopOnlineSession?.room)){await promptGukjinChoice(legacySideForPlayerId(actor),presentationEvents);"
  },
  {
   anchor:"latestOnlineSnapshot=event.detail.snapshot;onlineLastEvents=event.detail.events;reconcileAuthoritativeDecisionDialogs(event.detail.snapshot?.state);",
   replacement:"latestOnlineSnapshot=event.detail.snapshot;onlineLastEvents=event.detail.events;\n        globalThis.GoStopDevPeerSync?.reconcile?.({snapshot:latestOnlineSnapshot,events:onlineLastEvents,room:adapter.room,\n          localTargetIds:presentation.targetChoice?[...presentation.targetChoice.ids]:null,\n          cancelTargetChoice:()=>cleanupTargetChoice(),\n          closeGukjinDialog:()=>{if(els.gukjinDialog?.open)els.gukjinDialog.close();}});\n        reconcileAuthoritativeDecisionDialogs(event.detail.snapshot?.state);"
  }
 ];
 let out=source;
 for(const {anchor,replacement} of patches){
  const first=out.indexOf(anchor);
  if(first<0||out.indexOf(anchor,first+anchor.length)>=0)
   throw new Error('Refusing unsafe development instrumentation: missing or duplicate guarded anchor.');
  out=out.replace(anchor,replacement);
 }
 return out;
}
