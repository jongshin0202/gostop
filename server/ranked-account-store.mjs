import {AccountStore as BaseAccountStore,blankStats} from './account-store.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const publicAccount=account=>({id:account.id,email:account.email,nickname:account.nickname,walletCoins:account.walletCoins,forceQuits:account.forceQuits||0,computerBankruptcies:account.computerBankruptcies||0,createdAt:account.createdAt,emailVerified:account.emailVerified!==false,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null});
function ensureStats(account,month){account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();return [account.stats.global,account.stats.monthly[month]];}
function addMilestones(statsList,milestones={}){for(const stats of statsList)for(const [name,count] of Object.entries(milestones||{}))stats.milestones[name]=(stats.milestones[name]||0)+(Number(count)||0);}

export class AccountStore extends BaseAccountStore{
  async forceQuit(request){
    const body=await request.json().catch(()=>({})),gameId=body.gameId||`abandon-${Date.now()}`;
    const prior=await this.storage.get(`forceQuit:${gameId}`);if(prior)return json({ok:true,duplicate:true,penaltyCoins:prior.penaltyCoins,account:prior.account,opponent:prior.opponent||null});
    if(await this.storage.get(`game:${gameId}`))return json({ok:true,duplicate:true});
    const account=await this.accountById(body.accountId);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
    const opponent=body.opponentAccountId?await this.accountById(body.opponentAccountId):null,penalty=Math.max(0,Math.trunc(Number(body.penaltyCoins)||0)),recordedAt=body.recordedAt||this.now(),month=String(recordedAt).slice(0,7);
    account.walletCoins-=penalty;account.forceQuits=(account.forceQuits||0)+1;const quitterStats=ensureStats(account,month);for(const stats of quitterStats)stats.gamesPlayed+=1;addMilestones(quitterStats,body.quitterMilestones);account.updatedAt=recordedAt;
    await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'force-quit',amount:-penalty,gameId,createdAt:recordedAt});
    let publicOpponent=null;
    if(opponent){opponent.walletCoins+=penalty;const opponentStats=ensureStats(opponent,month);for(const stats of opponentStats){stats.gamesPlayed+=1;stats.wins+=1;stats.totalCoinsWon+=penalty;}addMilestones(opponentStats,body.opponentMilestones);opponent.updatedAt=recordedAt;await this.storage.put(`account:${opponent.id}`,opponent);await this.appendLedger(opponent.id,{type:'abandonment-win',amount:penalty,gameId,createdAt:recordedAt});publicOpponent=publicAccount(opponent);}
    const record={...body,gameId,type:'abandonment',penaltyCoins:penalty,recordedAt,account:publicAccount(account),opponent:publicOpponent};await this.storage.put(`forceQuit:${gameId}`,record);await this.storage.put(`game:${gameId}`,record);
    return json({ok:true,penaltyCoins:penalty,account:record.account,opponent:record.opponent});
  }
}
