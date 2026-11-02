/* Modify ONLY the generated development ranked client. A room's HTTP create/join
 * response is not proof that its authenticated game WebSocket connected.
 */
export function instrumentDevCompetitiveJoinProof(source){
 if(typeof source!=='string'||source.length<50000)throw new TypeError('Expected protected ranked client source.');
 const host="const room=await bridge.createCompetitiveRoom();if(!room?.roomCode)throw new Error(rt('requestFailed'));\n      sendLobbyMessage({type:'challengeRoomReady',requestId:message.requestId,roomCode:room.roomCode});";
 const target="const room=await bridge.joinCompetitiveRoom(message.roomCode);sendLobbyMessage({type:'challengeJoined',requestId:message.requestId,roomCode:room.roomCode});";
 if(source.split(host).length!==2||source.split(target).length!==2)
  throw new Error('Unsafe development Competitive WebSocket proof anchors');
 return source.replace(host,
  "const room=await bridge.createCompetitiveRoom();if(!room?.roomCode)throw new Error(rt('requestFailed'));\n      if(!globalThis.GoStopDevConnectionProof?.waitForConnection)throw new Error('Development connection verification unavailable.');\n      await globalThis.GoStopDevConnectionProof.waitForConnection(room.roomCode,'playerA');\n      sendLobbyMessage({type:'challengeRoomReady',requestId:message.requestId,roomCode:room.roomCode});"
 ).replace(target,
  "const room=await bridge.joinCompetitiveRoom(message.roomCode);\n      if(!globalThis.GoStopDevConnectionProof?.waitForConnection)throw new Error('Development connection verification unavailable.');\n      await globalThis.GoStopDevConnectionProof.waitForConnection(room.roomCode,'playerB');\n      sendLobbyMessage({type:'challengeJoined',requestId:message.requestId,roomCode:room.roomCode});");
}
