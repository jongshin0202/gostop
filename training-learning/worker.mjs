/* Separate DEVELOPMENT-ONLY GoStop Training Learning Cloudflare Worker.
 * It has no imports from the game/server code and cannot change any game state.
 * All requests require a verified session on the isolated development authority.
 */
import learner from './learner.js';
import {recordCompletedTrainingGame,recordSuccessfulDevelopmentModelUpdate} from './update-cadence.mjs';
import {SpecialDecisionRanker,legalSpecialActions} from './special-learner.mjs';
import {OpeningStrategyRanker,STRATEGIES,validEvidence,validChoices} from './opening-learner.mjs';
const {ExpertRanker}=learner;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...headers}});
const allowed=origin=>origin==='https://gostop-dev.vercel.app'||origin==='https://gostop-dev-jwshin1-5345s-projects.vercel.app';
const cors=origin=>({'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'600','vary':'Origin'});
const DEV_AUTH='https://gostop-authority-dev.jwshin1.workers.dev/api/me';
const EXPERT_HASH='b0af0e03e53f7d69ecd33dcf425a83d237bd3aba9dfe34ed49a315980462b6a5';
const MAX_BYTES=45000;
const validId=id=>typeof id==='string'&&id.length>=5&&id.length<=100&&/^[a-z0-9._:-]+$/i.test(id);
const validCardId=id=>typeof id==='string'&&/^[a-z0-9._:-]{3,64}$/i.test(id);
const moveId=move=>move?.moveId||(move?.card?.id?move.card.id+'|'+(move.target?.id||'-'):'');
const safeMove=move=>{
  if(!move||typeof move!=='object'||!validCardId(move.card?.id)||!Number.isInteger(move.card?.month)||move.card.month<1||move.card.month>12)return null;
  if(move.target&&(!validCardId(move.target.id)||!Number.isInteger(move.target.month)||move.target.month!==move.card.month))return null;
  const cleanCard=c=>c?({
    id:c.id,month:c.month,type:['pi','animal','bright','ribbon'].includes(c.type)?c.type:'pi',
    flags:Array.isArray(c.flags)?c.flags.filter(flag=>['doublePi','switchPi','godori'].includes(flag)):[],
    ...(c.ribbonSet&&['red','blue','grass'].includes(c.ribbonSet)?{ribbonSet:c.ribbonSet}:{})
  }):null;
  const card=cleanCard(move.card),target=cleanCard(move.target);
  return {card,target,moveId:card.id+'|'+(target?.id||'-'),...(move.completesSet===true?{completesSet:true}:{}),
    ...(move.blocksSet===true?{blocksSet:true}:{}),...(move.reserved===true?{reserved:true}:{})};
};
const fail=(message,status)=>json({ok:false,error:message},status);
async function readJson(req){
  if(Number(req.headers.get('content-length'))>MAX_BYTES)return null;
  const body=await req.text();if(body.length>MAX_BYTES)return null;
  try{return JSON.parse(body);}catch{return null;}
}
async function verifyIdentity(req,env,origin){
  const token=req.headers.get('authorization')||'';
  if(!/^Bearer\s+[\w.-]{12,4096}$/i.test(token))return null;
  // The primary development Worker is authoritative for the account identity.
  let response;
  try{
    if(!env.DEV_AUTH?.fetch)return null;
    response=await env.DEV_AUTH.fetch(new Request(env.DEV_AUTH_URL||DEV_AUTH,{headers:{authorization:token,Origin:origin}}));
  }catch{return null;}
  if(!response.ok)return null;
  let payload;
  try{payload=await response.json();}catch{return null;}
  const account=payload.account;
  if(!validId(account?.id)||!account?.email)return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(account.email).trim().toLowerCase()));
  const digest=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==EXPERT_HASH)return null;
  return {accountId:account.id};
}
export class TrainingLearningStore{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&path==='/state'){
      const state=await this.ctx.storage.get('summary')||{feedbackCount:0,confirmedCount:0,trainingGames:0};
      const model=await this.ctx.storage.get('model')||new ExpertRanker().export();
      const specialModel=await this.ctx.storage.get('specialModel')||new SpecialDecisionRanker().export();
      const openingModel=await this.ctx.storage.get('openingModel')||new OpeningStrategyRanker().export();
      const activeOpeningModel=await this.ctx.storage.get('activeOpeningModel')||null;
      return json({ok:true,...state,model,specialModel,openingModel,activeOpeningModel});
    }
    if(request.method==='GET'&&path==='/history')return json({ok:true,feedback:await this.ctx.storage.get('history')||[]});
    if(request.method==='POST'&&path==='/opening-feedback'){
      const body=await readJson(request);
      if(!validId(body?.gameId)||!validId(body?.feedbackId)||
        !['confirmed','unsure'].includes(body?.choice)||
        !validChoices(body?.suggested)||!validChoices(body?.selected)||
        !validEvidence(body?.evidence)||
        (body.choice==='confirmed'&&body.selected.length<1))
        return fail('INVALID_OPENING_FEEDBACK',400);
      const visible={};
      for(const field of ['hand','floor','humanCaptured','computerCaptured']){
        const cards=body.visible?.[field];
        if(!Array.isArray(cards)||cards.length>48||new Set(cards).size!==cards.length||
          cards.some(id=>!validCardId(id)))return fail('INVALID_VISIBLE_STATE',400);
        visible[field]=cards;
      }
      // Only the logged-in, verified development expert can reach this store.
      const gameKey='game:'+body.gameId;
      const game=await this.ctx.storage.get(gameKey)||{complete:false,decisions:[],specialDecisions:[]};
      if(game.complete)return fail('GAME_ALREADY_COMPLETED',409);
      if(game.openingFeedback)return json({ok:true,duplicate:true});
      game.openingFeedback={choice:body.choice,suggested:body.suggested,
        selected:body.choice==='confirmed'?body.selected:[],evidence:body.evidence,visible};
      const key='opening-feedback:'+body.gameId;
      await this.ctx.storage.put(key,{feedbackId:body.feedbackId,choice:body.choice,
        at:new Date().toISOString()});
      await this.ctx.storage.put(gameKey,game);
      const summary=await this.ctx.storage.get('summary')||{feedbackCount:0,confirmedCount:0,trainingGames:0};
      summary.feedbackCount++;if(body.choice==='confirmed')summary.confirmedCount++;
      await this.ctx.storage.put('summary',summary);
      const history=await this.ctx.storage.get('history')||[];
      history.push({gameId:body.gameId,kind:'opening',choice:body.choice,
        suggested:body.suggested,selected:game.openingFeedback.selected,at:new Date().toISOString()});
      await this.ctx.storage.put('history',history.slice(-500));
      return json({ok:true,confirmed:body.choice==='confirmed',feedbackCount:summary.feedbackCount});
    }
    if(request.method==='POST'&&path==='/special-feedback'){
      const body=await readJson(request);
      if(!validId(body?.gameId)||!validId(body?.feedbackId)||!['mine','recommended','unsure'].includes(body?.choice))
        return fail('INVALID_FEEDBACK',400);
      const kind=body?.context?.kind,bombReady=body?.context?.bombReady,month=body?.context?.month;
      if(!['shake','bomb'].includes(kind)||typeof bombReady!=='boolean'||!Number.isInteger(month)||month<1||month>12)
        return fail('INVALID_SPECIAL_CONTEXT',400);
      if(kind==='bomb'&&!bombReady)return fail('INVALID_SPECIAL_CONTEXT',400);
      const legalActions=legalSpecialActions({kind,bombReady});
      if(!legalActions.includes(body.recommendedAction)||!legalActions.includes(body.playedAction)
        ||body.recommendedAction===body.playedAction)return fail('INVALID_SPECIAL_ACTION',400);
      if(!Array.isArray(body.legalActions)||body.legalActions.length!==2||
        new Set(body.legalActions).size!==2||!legalActions.every(a=>body.legalActions.includes(a)))
        return fail('INVALID_SPECIAL_ACTION',400);
      const visible={};
      for(const field of ['hand','floor','humanCaptured','computerCaptured']){
        const cards=body.visible?.[field];
        if(!Array.isArray(cards)||cards.length>48||cards.some(id=>!validCardId(id)))
          return fail('INVALID_VISIBLE_STATE',400);
        visible[field]=cards;
      }
      const cardIds=body.context.cardIds;
      if(!Array.isArray(cardIds)||cardIds.length<3||cardIds.length>4||
        new Set(cardIds).size!==cardIds.length||
        cardIds.some(id=>!validCardId(id)||!visible.hand.includes(id)||
          Number(/^m(\d{1,2})-/.exec(id)?.[1])!==month))
        return fail('INVALID_SPECIAL_CARDS',400);
      const key='special-feedback:'+body.gameId+':'+body.feedbackId;
      if(await this.ctx.storage.get(key))return json({ok:true,duplicate:true});
      const gameKey='game:'+body.gameId;
      const game=await this.ctx.storage.get(gameKey)||{complete:false,decisions:[],specialDecisions:[]};
      if(game.complete)return fail('GAME_ALREADY_COMPLETED',409);
      game.specialDecisions||=[];
      if(game.specialDecisions.length>=60)return fail('GAME_LIMIT',429);
      const chosenAction=body.choice==='mine'?body.playedAction:
        body.choice==='recommended'?body.recommendedAction:null;
      const context={kind,bombReady,month};
      game.specialDecisions.push({context,chosenAction});
      const summary=await this.ctx.storage.get('summary')||{feedbackCount:0,confirmedCount:0,trainingGames:0};
      summary.feedbackCount++;if(chosenAction)summary.confirmedCount++;
      await this.ctx.storage.put(key,{choice:body.choice,recommendedAction:body.recommendedAction,
        playedAction:body.playedAction,context,at:new Date().toISOString()});
      await this.ctx.storage.put(gameKey,game);
      await this.ctx.storage.put('summary',summary);
      const history=await this.ctx.storage.get('history')||[];
      history.push({gameId:body.gameId,feedbackId:body.feedbackId,kind:'special',
        context,recommendedAction:body.recommendedAction,playedAction:body.playedAction,
        choice:body.choice,at:new Date().toISOString()});
      await this.ctx.storage.put('history',history.slice(-500));
      return json({ok:true,confirmed:!!chosenAction,feedbackCount:summary.feedbackCount});
    }
    if(request.method==='POST'&&path==='/feedback'){
      const body=await readJson(request);
      if(!validId(body?.gameId)||!validId(body?.feedbackId)||!['mine','recommended','unsure'].includes(body?.choice))
        return fail('INVALID_FEEDBACK',400);
      if(!Array.isArray(body.legalMoves)||body.legalMoves.length<2||body.legalMoves.length>48)return fail('INVALID_LEGAL_MOVES',400);
      const legalMoves=body.legalMoves.map(safeMove);
      if(legalMoves.some(m=>!m)||new Set(legalMoves.map(m=>m.moveId)).size!==legalMoves.length)return fail('INVALID_CANDIDATES',400);
      const recommended=body.recommended,played=body.played;
      const recommendedId=String(recommended?.hand||'')+'|'+(recommended?.target||'-');
      const playedId=String(played?.hand||'')+'|'+(played?.target||'-');
      const ids=new Set(legalMoves.map(m=>m.moveId));
      if(recommendedId===playedId||!ids.has(recommendedId)||!ids.has(playedId))return fail('MOVE_MISMATCH',400);
      const chosenId=body.choice==='mine'?playedId:body.choice==='recommended'?recommendedId:null;
      // Store only card IDs visible to the player. No hidden hands or account credentials.
      const visible={};
      for(const field of ['hand','floor','humanCaptured','computerCaptured']){
        const cards=body.visible?.[field];
        if(cards!==undefined&&(!Array.isArray(cards)||cards.length>48||cards.some(id=>!validCardId(id))))
          return fail('INVALID_VISIBLE_STATE',400);
        visible[field]=cards||[];
      }
      const key='feedback:'+body.gameId+':'+body.feedbackId;
      if(await this.ctx.storage.get(key))return json({ok:true,duplicate:true});
      const gameKey='game:'+body.gameId;
      const game=await this.ctx.storage.get(gameKey)||{complete:false,decisions:[]};
      if(game.complete)return fail('GAME_ALREADY_COMPLETED',409);
      if(game.decisions.length>=150)return fail('GAME_LIMIT',429);
      game.decisions.push({chosenId,legalMoves,visible});
      const summary=await this.ctx.storage.get('summary')||{feedbackCount:0,confirmedCount:0,trainingGames:0};
      summary.feedbackCount++;if(chosenId)summary.confirmedCount++;
      await this.ctx.storage.put(key,{choice:body.choice,recommendedId,playedId,at:new Date().toISOString()});
      await this.ctx.storage.put(gameKey,game);
      await this.ctx.storage.put('summary',summary);
      const history=await this.ctx.storage.get('history')||[];
      history.push({gameId:body.gameId,feedbackId:body.feedbackId,choice:body.choice,playedId,recommendedId,at:new Date().toISOString()});
      await this.ctx.storage.put('history',history.slice(-500));
      return json({ok:true,confirmed:!!chosenId,feedbackCount:summary.feedbackCount});
    }
    if(request.method==='POST'&&path==='/complete'){
      const body=await readJson(request);
      if(!validId(body?.gameId))return fail('INVALID_GAME_ID',400);
      const gameKey='game:'+body.gameId;
      const game=await this.ctx.storage.get(gameKey);
      if(game?.complete)return json({ok:true,trained:0,duplicate:true,publishedToLive:false});
      const completedGame=game||{complete:false,decisions:[]};
      completedGame.complete=true;
      const model=new ExpertRanker(await this.ctx.storage.get('model')||null);
      const cardTrained=model.trainGame({id:body.gameId,complete:true,
        decisions:completedGame.decisions.filter(d=>d.chosenId)});
      const specialModel=new SpecialDecisionRanker(await this.ctx.storage.get('specialModel')||null);
      const specialTrained=specialModel.trainGame({id:body.gameId,complete:true,
        decisions:(completedGame.specialDecisions||[]).filter(d=>d.chosenAction)});
      const openingModel=new OpeningStrategyRanker(await this.ctx.storage.get('openingModel')||null);
      const openingTrained=openingModel.trainGame({id:body.gameId,complete:true,
        openings:completedGame.openingFeedback?[completedGame.openingFeedback]:[]});
      const trained=cardTrained+specialTrained+openingTrained;
      const prior=await this.ctx.storage.get('summary')||{feedbackCount:0,confirmedCount:0,trainingGames:0};
      // A disagreement is an actual differing played/recommended move. An "unsure"
      // judgment still counts as a disagreement, but never trains weights.
      const opening=completedGame.openingFeedback;
      const openingDisagreement=opening?.choice==='confirmed'&&
        (opening.selected.length!==opening.suggested.length||
         opening.selected.some(x=>!opening.suggested.includes(x)));
      const hadDisagreement=completedGame.decisions.length>0||
        (completedGame.specialDecisions||[]).length>0||openingDisagreement||body.hadDisagreement===true;
      let summary=recordCompletedTrainingGame(prior,hadDisagreement);
      if(trained){summary.trainingGames=(prior.trainingGames||0)+1;summary.lastTrainedAt=new Date().toISOString();}
      // Prepare an isolated, versionable candidate; NEVER imply that the
      // production server was updated. A validated production-model publisher
      // must acknowledge activation before the completion UI can report success.
      const newWeights=model.examples>Number(prior.lastDevelopmentModelExamples||0)||
        specialModel.examples>Number(prior.lastDevelopmentSpecialModelExamples||0)||
        openingModel.examples>Number(prior.lastDevelopmentOpeningModelExamples||0);
      let promotionPending=false,developmentModelUpdated=false;
      const updateTrigger=summary.eligibilityReason;
      if(updateTrigger&&newWeights){
        const existing=await this.ctx.storage.get('promotionCandidate');
        if(existing?.model?.examples!==model.examples||existing?.specialModel?.examples!==specialModel.examples||
          existing?.openingModel?.examples!==openingModel.examples||existing?.reason!==summary.eligibilityReason){
          await this.ctx.storage.put('promotionCandidate',{
            reason:summary.eligibilityReason,createdAt:new Date().toISOString(),
            completedGames:summary.completedGames,model:{weights:[...model.weights],examples:model.examples},
            specialModel:{weights:[...specialModel.weights],examples:specialModel.examples},
            openingModel:{weights:openingModel.weights.map(row=>[...row]),examples:openingModel.examples}
          });
        }
        // Activate ONLY in the isolated DEVELOPMENT Worker, never the public
        // game or production authority. The new weights are available for the
        // next Training game, and the update dialog is shown only after ack.
        await this.ctx.storage.put('activeCardModel',model.export());
        await this.ctx.storage.put('activeSpecialModel',specialModel.export());
        await this.ctx.storage.put('activeOpeningModel',openingModel.export());
        const nextVersion=Number(prior.developmentModelVersion||0)+1;
        const acknowledged=recordSuccessfulDevelopmentModelUpdate(summary,nextVersion);
        summary=Object.assign(acknowledged,{
          lastDevelopmentModelExamples:model.examples,
          lastDevelopmentSpecialModelExamples:specialModel.examples,
          lastDevelopmentOpeningModelExamples:openingModel.examples,
          pendingLiveUpdate:{reason:updateTrigger,modelExamples:model.examples,
            specialModelExamples:specialModel.examples,openingModelExamples:openingModel.examples}
        });
        promotionPending=true;developmentModelUpdated=true;
      }
      await this.ctx.storage.put('model',model.export());
      await this.ctx.storage.put('specialModel',specialModel.export());
      await this.ctx.storage.put('openingModel',openingModel.export());
      await this.ctx.storage.put(gameKey,completedGame);
      await this.ctx.storage.put('summary',summary);
      return json({ok:true,trained,trainingGames:summary.trainingGames,
        completedGames:summary.completedGames,consecutiveAgreementGames:summary.consecutiveAgreementGames,
        modelExamples:model.examples,specialModelExamples:specialModel.examples,
        openingModelExamples:openingModel.examples,promotionPending,publishedToLive:false,
        developmentModelUpdated,developmentModelVersion:developmentModelUpdated?summary.developmentModelVersion:null,
        updateTrigger:promotionPending?updateTrigger:null});
    }
    return fail('NOT_FOUND',404);
  }
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('origin')||'';
    if(!allowed(origin))return fail('ORIGIN_NOT_ALLOWED',403);
    const url=new URL(request.url);
    const responseHeaders=cors(origin);
    if(request.method==='OPTIONS'){
      const method=request.headers.get('access-control-request-method');
      const headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
      if(!['GET','POST'].includes(method)||headers.some(h=>!['authorization','content-type'].includes(h)))return json({ok:false},403,responseHeaders);
      return new Response(null,{status:204,headers:responseHeaders});
    }
    const supported=new Set(['/api/training/state','/api/training/history','/api/training/feedback','/api/training/special-feedback','/api/training/opening-feedback','/api/training/complete']);
    if(!supported.has(url.pathname)||!['GET','POST'].includes(request.method))return json({ok:false,error:'NOT_FOUND'},404,responseHeaders);
    const account=await verifyIdentity(request,env,origin);
    if(!account)return json({ok:false,error:'AUTH_REQUIRED'},401,responseHeaders);
    const id=env.TRAINING_DATA.idFromName(account.accountId);
    const suffix=url.pathname.replace('/api/training','');
    const internal=new Request('https://training.internal'+suffix,{method:request.method,
      ...(request.method==='POST'?{headers:{'content-type':'application/json'},body:await request.text()}:{})});
    const response=await env.TRAINING_DATA.get(id).fetch(internal);
    const headers=new Headers(response.headers);Object.entries(responseHeaders).forEach(([k,v])=>headers.set(k,v));
    return new Response(response.body,{status:response.status,headers});
  }
};
