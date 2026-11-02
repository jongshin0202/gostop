/* Dev-only localization patch: explicit opponent Quit is not a generic Session Ended. */
export function instrumentDevOpponentEndedCopy(source){
 if(typeof source!=='string'||source.length<20000)throw new TypeError('Frozen i18n source required');
 const patches=[
  ["opponentEnded:'Session Ended'","opponentEnded:'Your opponent ended the game.'"],
  ["opponentEnded:'Sesión finalizada'","opponentEnded:'Tu oponente terminó la partida.'"],
  ["opponentEnded:'Session terminée'","opponentEnded:'Votre adversaire a terminé la partie.'"],
  ["opponentEnded:'Sitzung beendet'","opponentEnded:'Dein Gegner hat das Spiel beendet.'"],
  ["opponentEnded:'세션 종료'","opponentEnded:'상대방이 게임을 종료했습니다.'"],
  ["opponentEnded:'セッション終了'","opponentEnded:'対戦相手がゲームを終了しました。'"],
  ["opponentEnded:'会话已结束'","opponentEnded:'对手已结束游戏。'"]
 ];
 let output=source;
 for(const [oldText,newText] of patches){
  if(output.split(oldText).length!==2)throw new Error('Unsafe i18n frozen anchor '+oldText);
  output=output.replace(oldText,newText);
 }
 return output;
}
