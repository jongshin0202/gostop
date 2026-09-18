import {AccountStore as BaseAccountStore,blankStats} from './account-store.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const publicAccount=account=>({id:account.id,email:account.email,nickname:account.nickname,walletCoins:account.walletCoins,forceQuits:account.forceQuits||0,computerBankruptcies:account.computerBankruptcies||0,createdAt:account.createdAt,emailVerified:account.emailVerified!==false,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null});
function ensureStats(account,month){account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();return [account.stats.global,account.stats.monthly[month]];}
function addMilestones(statsList,milestones={}){for(const stats of statsList)for(const [name,count] of Object.entries(milestones||{}))stats.milestones[name]=(stats.milestones[name]||0)+(Number(count)||0);}
const noticeId=(kind,gameId)=>`${kind}:${gameId}`;

export class AccountStore extends BaseAccountStore{
  async prepareNotices(account){
    if(account.disconnectPolicyVersion===2)return account;
    account.pendingNotices=(Array.isArray(account.pendingNotices)?account.pendingNotices:[]).filter(item=>item.type!=='abandonment'&&item.type!=='disconnect-forgiven');
    account.disconnectsByMonth={};account.disconnectPolicyVersion=2;account.abandonmentPolicyVersion=2;await this.storage.put(`account:${account.id}`,account);return account;
  }
  async forceQuit(request){
    const body=await request.json().catch(()=>({})),gameId=body.gameId||`abandon-${Date.now()}`;
    const prior=await this.storage.get(`forceQuit:${gameId}`);if(prior)return json({ok:true,duplicate:true,penaltyCoins:prior.penaltyCoins,opponentRewardCoins:prior.opponentRewardCoins||0,firstOfMonth:!!prior.firstOfMonth,account:prior.account,opponent:prior.opponent||null,accountNotice:prior.accountNotice||null,opponentNotice:prior.opponentNotice||null});
    if(await this.storage.get(`game:${gameId}`))return json({ok:true,duplicate:true});
    const account=await this.accountById(body.accountId);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);await this.prepareNotices(account);
    const opponent=body.opponentAccountId?await this.accountById(body.opponentAccountId):null,settlementType=body.settlementType==='nagari'?'nagari':'current-settlement',fairPoints=settlementType==='nagari'?0:Math.max(0,Math.trunc(Number(body.fairPoints??body.opponentRewardCoins??body.penaltyCoins)||0)),rewardCoins=fairPoints,recordedAt=body.recordedAt||this.now(),month=String(recordedAt).slice(0,7),isDisconnect=body.reason==='disconnect-timeout',priorMonth=Number(account.disconnectsByMonth?.[month]||0),firstOfMonth=isDisconnect&&priorMonth===0,penalty=settlementType==='nagari'?0:(firstOfMonth?0:fairPoints);
    account.walletCoins-=penalty;account.forceQuits=(account.forceQuits||0)+1;if(isDisconnect)account.disconnectsByMonth={...(account.disconnectsByMonth||{}),[month]:priorMonth+1};
    const accountNotice=settlementType!=='nagari'&&isDisconnect?(firstOfMonth?{id:noticeId('disconnect-forgiven',gameId),type:'disconnect-forgiven',gameId,fairPoints,settlementType,recordedAt,month,firstOfMonth:true,reason:body.reason}:{id:noticeId('disconnect-loss',gameId),type:'disconnect-loss',gameId,fairPoints,coinsLost:penalty,settlementType,recordedAt,month,firstOfMonth:false,reason:body.reason}):null;if(accountNotice)account.pendingNotices=[...(account.pendingNotices||[]).filter(item=>item.id!==accountNotice.id),accountNotice];
    if(settlementType!=='nagari'&&!firstOfMonth){const quitterStats=ensureStats(account,month);for(const stats of quitterStats)stats.gamesPlayed+=1;addMilestones(quitterStats,body.quitterMilestones);}
    account.updatedAt=recordedAt;await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'force-quit',amount:-penalty,fairPoints,settlementType,firstOfMonth,reason:body.reason||'abandonment',gameId,createdAt:recordedAt});
    let publicOpponent=null,opponentNotice=null;if(opponent){await this.prepareNotices(opponent);if(settlementType!=='nagari'){const opponentStats=ensureStats(opponent,month);for(const stats of opponentStats){stats.gamesPlayed+=1;stats.wins+=1;stats.totalCoinsWon+=rewardCoins;}addMilestones(opponentStats,body.opponentMilestones);opponentNotice={id:noticeId('opponent-abandonment-reward',gameId),type:'opponent-abandonment-reward',gameId,rewardCoins,fairPoints,settlementType,recordedAt,opponentNickname:account.nickname};opponent.pendingNotices=[...(opponent.pendingNotices||[]).filter(item=>item.id!==opponentNotice.id),opponentNotice];}opponent.updatedAt=recordedAt;await this.storage.put(`account:${opponent.id}`,opponent);publicOpponent=publicAccount(opponent);}
    const record={...body,gameId,type:'abandonment',settlementType,fairPoints,penaltyCoins:penalty,opponentRewardCoins:rewardCoins,firstOfMonth,recordedAt,account:publicAccount(account),opponent:publicOpponent,accountNotice,opponentNotice};await this.storage.put(`forceQuit:${gameId}`,record);await this.storage.put(`game:${gameId}`,record);
    return json({ok:true,penaltyCoins:penalty,opponentRewardCoins:rewardCoins,firstOfMonth,account:record.account,opponent:record.opponent,accountNotice,opponentNotice});
  }}
