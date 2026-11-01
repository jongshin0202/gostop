// Development-only fast nickname search. Does not mutate accounts, rankings,
// histories, or the frozen production AccountStore.
import {AccountStore as FrozenAccountStore} from './ranked-account-store.mjs';
const month=()=>new Date().toISOString().slice(0,7);
const statValue=(s,key)=>Number(s?.[key])||0;
const score=s=>statValue(s,'totalCoinsWon')-statValue(s,'totalCoinsLost');
function canonicalStats(account){
 const stored=account?.stats?.global||{};
 const combined={gamesPlayed:0,wins:0,losses:0,totalCoinsWon:0,totalCoinsLost:0};
 for(const item of Object.values(account?.stats?.monthly||{}))
  for(const key of Object.keys(combined))combined[key]+=statValue(item,key);
 const storedGames=statValue(stored,'gamesPlayed');
 if(combined.gamesPlayed>storedGames)return combined;
 if(combined.gamesPlayed===storedGames&&combined.gamesPlayed>0&&
   (combined.totalCoinsWon+combined.totalCoinsLost>statValue(stored,'totalCoinsWon')+statValue(stored,'totalCoinsLost')))
   return combined;
 return stored;
}
function rankAccounts(accounts,getStats){
 const ordered=accounts.map(a=>({account:a,stats:getStats(a)}))
  .sort((a,b)=>score(b.stats)-score(a.stats)||
    statValue(b.stats,'gamesPlayed')-statValue(a.stats,'gamesPlayed')||
    statValue(b.stats,'totalCoinsWon')-statValue(a.stats,'totalCoinsWon')||
    a.account.nickname.localeCompare(b.account.nickname));
 const ranks=new Map(),ranked=ordered.filter(x=>statValue(x.stats,'gamesPlayed')>=10);
 ranked.forEach((x,i)=>ranks.set(x.account.id,i+1));
 return ranks;
}
export class AccountStore extends FrozenAccountStore{
 async playerSearch(request){
  const body=await request.json().catch(()=>({}));
  const needle=String(body?.query||'').trim().toLowerCase().slice(0,80);
  if(!needle)return new Response(JSON.stringify({ok:true,players:[]}),
    {headers:{'content-type':'application/json','cache-control':'no-store'}});
  // Only read account records, not the entire game history. Full player
  // history remains available through the existing player-info endpoint.
  const accounts=[...(await this.storage.list({prefix:'account:'})).values()]
   .filter(a=>a?.id&&a.nickname&&a.emailVerified!==false&&!a.suspended);
  const ranks=rankAccounts(accounts,canonicalStats),monthlyRanks=rankAccounts(accounts,a=>a.stats?.monthly?.[month()]||{});
  const candidates=accounts.filter(a=>a.nickname.toLowerCase().includes(needle))
   .sort((a,b)=>{
    const an=a.nickname.toLowerCase(),bn=b.nickname.toLowerCase();
    const ax=an===needle?0:an.startsWith(needle)?1:2,bx=bn===needle?0:bn.startsWith(needle)?1:2;
    return ax-bx||(ranks.get(a.id)||Number.MAX_SAFE_INTEGER)-(ranks.get(b.id)||Number.MAX_SAFE_INTEGER)||an.localeCompare(bn);
   }).slice(0,20);
  const players=candidates.map(a=>{
   const stats=canonicalStats(a),gamesPlayed=statValue(stats,'gamesPlayed');
   const wins=statValue(stats,'wins'),losses=statValue(stats,'losses')||Math.max(0,gamesPlayed-wins);
   const totalCoins=statValue(stats,'totalCoinsWon');
   return {accountId:a.id,nickname:a.nickname,walletCoins:Number(a.walletCoins)||0,
    gamesPlayed,wins,losses,totalCoins,totalCoinsLost:statValue(stats,'totalCoinsLost'),
    score:score(stats),coinsPerGame:gamesPlayed?totalCoins/gamesPlayed:0,
    rank:ranks.get(a.id)||0,globalRank:ranks.get(a.id)||0,
    monthlyRank:monthlyRanks.get(a.id)||0,provisional:gamesPlayed<10,
    countryCode:a.location?.countryCode||null,regionCode:a.location?.regionCode||null,
    historyUnavailable:true};
  });
  return new Response(JSON.stringify({ok:true,players}),
   {headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
}
