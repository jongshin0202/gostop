/* Generated development ranked-client.js only: no production UI/game changes.
 * Prevent stale/missed online requests interrupting an active Competitive match.
 * Guard outgoing requests against a lost expiry event while reconnecting.
 */
export function instrumentDevCompetitiveInviteLifecycle(source){
 if(typeof source!=='string'||source.length<50000)throw new TypeError('Expected frozen ranked client source.');
 let result=source;
 const once=(oldText,newText)=>{
  if(result.split(oldText).length!==2)throw new Error('Unsafe development invitation lifecycle anchor: '+oldText.slice(0,70));
  result=result.replace(oldText,newText);
 };
 once("  function maybeShowMissedRequests(){const items=readMissedRequests();",
 [
 "  function devCompetitivePlaying(){",
 "    const session=globalThis.goStopOnlineSession,room=session?.room;",
 "    return !!(room?.roomCode&&room?.rankedMode==='online'&&!session.explicitlyClosed);",
 "  }",
 "  globalThis.addEventListener('gostop-online-snapshot',()=>{",
 "    if(!devCompetitivePlaying())return;",
 "    if(pendingRequest){",
 "      lobbySend({type:'challengeResponse',requestId:pendingRequest.requestId,accept:false});",
 "      pendingRequest=null;",
 "    }",
 "    closeRequestDialog(requestDialog);",
 "    closeRequestDialog(missedRequestDialog);",
 "  });",
 "  function maybeShowMissedRequests(){if(devCompetitivePlaying()){closeRequestDialog(missedRequestDialog);return;}const items=readMissedRequests();"
 ].join('\n'));
 once("  function enqueueMissedRequest(message){\n    const items=readMissedRequests(),",
  "  function enqueueMissedRequest(message){\n    if(devCompetitivePlaying())return;\n    const items=readMissedRequests(),");
 once("    if(message.type==='playRequest'){\n      if(!leaderboardScreen.hidden)",
 [
 "    if(message.type==='playRequest'){",
 "      if(devCompetitivePlaying()){",
 "        lobbySend({type:'challengeResponse',requestId:message.requestId,accept:false});",
 "        return;",
 "      }",
 "      if(!leaderboardScreen.hidden)"
 ].join('\n'));
 once("    if(message.type==='challengeMissed'){\n      if(pendingRequest?.requestId===message.requestId)",
 [
 "    if(message.type==='challengeMissed'){",
 "      if(devCompetitivePlaying()){",
 "        if(pendingRequest?.requestId===message.requestId){pendingRequest=null;closeRequestDialog(requestDialog);}",
 "        return;",
 "      }",
 "      if(pendingRequest?.requestId===message.requestId)"
 ].join('\n'));
 once("    if(!outgoingRequestDialog.open)outgoingRequestDialog.showModal();\n  }\n  function showAutoMatchWaiting()",
 [
 "    if(!outgoingRequestDialog.open)outgoingRequestDialog.showModal();",
 "    if(message.requestId){",
 "      const trackedId=message.requestId,deadline=Math.max(1000,Math.min(32000,(Number(message.expiresInSeconds)||30)*1000+1200));",
 "      setTimeout(()=>{",
 "        if(pendingOutgoingRequest?.requestId!==trackedId)return;",
 "        pendingOutgoingRequest=null;",
 "        closeRequestDialog(outgoingRequestDialog);",
 "        autoMatchSearching=false;syncAutoMatchControls();",
 "        lobbySend({type:'challengeCancel',requestId:trackedId});",
 "        showToast(rt('noResponseTitle'),5000);",
 "      },deadline);",
 "    }",
 "  }",
 "  function showAutoMatchWaiting()"
 ].join('\n'));
 return result;
}
