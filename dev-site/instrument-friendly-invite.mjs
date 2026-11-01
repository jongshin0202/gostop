/* Only the generated DEVELOPMENT ranked-client copy is patched.
 * The tracked ranked-client.js, game engine, and production bundle are unchanged.
 */
export function instrumentDevFriendlyInvite(source){
 if(typeof source!=='string'||source.length<50000)throw new TypeError('Expected frozen ranked client.');
 const anchor="async function launchInviteRoom(){\n    if(!validRoomParam)return;";
 const occurrences=source.split(anchor).length-1;
 if(occurrences!==1)throw new Error('Refusing unsafe dev invite instrumentation: expected one launch anchor.');
 return source.replace(anchor,
  "async function launchInviteRoom(){\n    if(!validRoomParam)return;\n    // Mobile invite links bypass the normal main-menu fullscreen gate.\n    // Do not join until an actual tap requests fullscreen on the device.\n    if(inviteMode==='free')await globalThis.GoStopDevFriendlyInvite?.gateFriendInvite?.();");
}
