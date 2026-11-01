/* Development-only online roster paging. Applied after responsive lobby instrumentation
 * in the generated Cloudflare Worker, never to frozen server/lobby.mjs.
 */
export function instrumentDevOnlinePlayersWorker(source){
 if(typeof source!=='string'||!source.includes('  challengeParticipantsAvailable(challenge){'))
   throw new Error('Unsupported dev lobby source for online player pagination');
 const anchor='  challengeParticipantsAvailable(challenge){';
 if(source.split(anchor).length!==2)throw new Error('Duplicate online list anchor');
 const method=`  listOnlinePlayers(client,requestedOffset=0){
    const rows=this.cachedLeaderboardRows||new Map(),me=this.profile(client,rows);
    const ids=new Set([...this.clients.values()].map(item=>item.account.id));
    ids.delete(client.account.id);
    const players=[...ids].map(id=>{
      const viewer=this.clientByAccountId(id),presence=this.presenceForAccount(id);
      if(!viewer||!presence.online)return null;
      const profile=this.profile(viewer,rows);
      return {...profile,...presence,similarity:similarityPercent(me,profile)};
    }).filter(Boolean).sort((a,b)=>distance(me,a)-distance(me,b)||b.gamesPlayed-a.gamesPlayed||a.nickname.localeCompare(b.nickname));
    const total=players.length,limit=10;
    const requested=Math.max(0,Math.floor((Number(requestedOffset)||0)/limit)*limit);
    const offset=total?Math.min(requested,Math.floor((total-1)/limit)*limit):0;
    return {type:'onlinePlayers',players:players.slice(offset,offset+limit),
      offset,limit,total,onlineCount:total,
      hasPrevious:offset>0,hasNext:offset+limit<total};
  }
`;
 let output=source.replace(anchor,method+anchor);
 const handler="    if(message.type==='socialProfiles'){";
 if(output.split(handler).length!==2)throw new Error('Online list message handler not uniquely located');
 output=output.replace(handler,`    if(message.type==='onlinePlayers'){
      this.send(client.socket,this.listOnlinePlayers(client,message.offset));
      return;
    }
`+handler);
 return output;
}
