/* Only the generated DEVELOPMENT ranked-client copy is patched.
 * The tracked ranked-client.js, game engine, and production bundle are unchanged.
 */
export function instrumentDevFriendlyInvite(source){
 if(typeof source!=='string'||source.length<50000)throw new TypeError('Expected frozen ranked client.');
 const anchor="async function launchInviteRoom(){\n    if(!validRoomParam)return;";
 const occurrences=source.split(anchor).length-1;
 if(occurrences!==1)throw new Error('Refusing unsafe dev invite instrumentation: expected one launch anchor.');
 const originalFreeJoin="showMatchHandoff('Joining Friendly Game…');try{await withGameBridge(bridge=>bridge.joinFreeRoom(code));}catch(error){closeRequestDialog(matchHandoffDialog);showToast(localizedError(error),6000);revealCurrentMainMenu();}return;";
 if(source.split(originalFreeJoin).length!==2)throw new Error('Refusing unsafe Friendly invite join instrumentation');
 let patched=source.replace(anchor,
  "async function launchInviteRoom(){\n    if(!validRoomParam)return;\n    // Request fullscreen on an actual tap before any room network request.\n    if(inviteMode==='free')await globalThis.GoStopDevFriendlyInvite?.gateFriendInvite?.();");
 patched=patched.replace(originalFreeJoin,
  "showMatchHandoff('Joining Friendly Game…');try{await withGameBridge(bridge=>bridge.joinFreeRoom(code));}catch(error){closeRequestDialog(matchHandoffDialog);const ux=globalThis.GoStopDevFriendlyInvite;if(ux?.showJoinFailure)ux.showJoinFailure(error,()=>launchInviteRoom());else{showToast(localizedError(error),6000);revealCurrentMainMenu();}}return;");
 return patched;
}
