/* Removable development-only Training UI adapter.
 * No game input interception, no code/weight changes, no local feedback storage.
 * Displays a drawn-card floor target and replaces verbose/unsupported advice
 * using ONLY the cards already visible to the player.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const logic=globalThis.GoStopDevTrainingAdviceLogic;
const deck=globalThis.GoStopEngine?.masterDeck;
if(!logic||!Array.isArray(deck))return;
const $=id=>document.getElementById(id),hand=$('playerHand'),floor=$('floor'),
 coach=$('trainingCoachPanel'),title=$('trainingCoachTitle'),text=$('trainingCoachText');
if(!hand||!floor||!coach||!title||!text)return;
let active=false,lastDrawKey='',lockedDrawId=null;
const allowedLanguages=new Set(['en','ko','es','fr','de','ja','zh']);
const locale=()=>allowedLanguages.has(document.documentElement.lang)?document.documentElement.lang:'en';
const ids=selector=>[...document.querySelectorAll(selector)].map(el=>el.dataset.cardId).filter(Boolean);
function visible(){return {
 hand:ids('#playerHand .hand-card[data-card-id]'),
 floor:ids('#floor .floor-card[data-card-id]'),
 humanCaptured:ids('#playerCaptured .captured-mini[data-card-id]'),
 computerCaptured:ids('#aiCaptured .captured-mini[data-card-id]')
};}
function cardName(id){
 const card=deck.find(c=>c.id===id),lang=locale();
 if(lang!=='en'){
  const name=globalThis.GoStopTrainingLocales?.cardName(lang,card);
  if(name)return name;
 }
 const el=floor.querySelector('[data-card-id="'+id+'"]')||hand.querySelector('[data-card-id="'+id+'"]');
 return el?.title||el?.querySelector('img')?.alt||
  (card?(['Pine','Plum','Cherry','Vine','Iris','Rose','Bush','Hill','Daisy','Star','Berry','Willow'][card.month-1]||'Card')+' '+(card.type==='ribbon'?'Stripe':card.type==='bright'?'Bright':card.type==='pi'?'Single':'Picture'):id);
}
const removedReasons=[
 /\s*This uses the higher-value hand card\./g,
 /\s*가치가 높은 손패를 먼저 사용합니다\./g,
 /\s*Juega la carta de mayor valor de tu mano\./g,
 /\s*Jouez la carte de main de plus grande valeur\./g,
 /\s*Spiele die höherwertige Handkarte\./g,
 /\s*価値の高い手札を先に使います。/g,
 /\s*优先打出价值更高的手牌。/g
];
let drawPanel=null;
function ensureDrawPanel(){
 if(drawPanel)return drawPanel;
 drawPanel=document.createElement('aside');drawPanel.id='devDrawTargetCoach';
 drawPanel.setAttribute('role','status');drawPanel.setAttribute('aria-live','polite');
 drawPanel.hidden=true;drawPanel.className='dev-draw-target-coach';
 document.body.appendChild(drawPanel);
 return drawPanel;
}
function clearDraw(){
 if(!drawPanel?.hidden)drawPanel.hidden=true;
 if(lockedDrawId){
  floor.querySelectorAll('.dev-drawn-target-recommended').forEach(el=>el.classList.remove('dev-drawn-target-recommended'));
 }
 lockedDrawId=null;lastDrawKey='';
}
function updateDraw(){
 if(!active){clearDraw();return;}
 const targets=[...floor.querySelectorAll('.floor-card.target-option[data-card-id]')];
 const eligible=targets.length===2&&
  !hand.querySelector('.pending-card')&&
  !!document.querySelector('.physical-card[data-card-id]')&&
  [...hand.querySelectorAll('.hand-card')].every(el=>el.disabled);
 if(!eligible){clearDraw();return;}
 const v=visible(),candidate=logic.recommendDrawTarget(targets.map(el=>el.dataset.cardId),v,deck);
 if(!candidate){clearDraw();return;}
 const key=candidate.legalIds.slice().sort().join('|')+':'+candidate.cardId;
 if(lastDrawKey!==key){
  lastDrawKey=key;
  const n=cardName(candidate.cardId);
  const fn=logic.T[locale()]||logic.T.en;
  ensureDrawPanel().textContent=fn.draw(n);
  drawPanel.hidden=false;
 }
 if(lockedDrawId!==candidate.cardId){
  floor.querySelectorAll('.dev-drawn-target-recommended').forEach(el=>el.classList.remove('dev-drawn-target-recommended'));
  lockedDrawId=candidate.cardId;
 }
 const recommended=floor.querySelector('[data-card-id="'+candidate.cardId+'"]');
 if(recommended&&!recommended.classList.contains('dev-drawn-target-recommended'))
  recommended.classList.add('dev-drawn-target-recommended');
}
function updateCopy(){
 if(!active||coach.hidden||!text.textContent)return;
 const source=text.textContent;
 let next=source;
 for(const re of removedReasons)next=next.replace(re,'');
 next=next.replace(/ {2,}/g,' ').trim();
 // A no-capture discard is not the same as choosing a floor target.
 const rec=globalThis.GoStopTrainingRecommendationDev?.getStatus?.()||{};
 const handId=rec.hand||hand.querySelector('.hand-card.matchable[data-card-id]')?.dataset.cardId;
 const current=deck.find(c=>c.id===handId);
 const v=visible(),floorMatch=!!current&&v.floor.some(id=>logic.monthOf(id)===current.month);
 if(handId&&!floorMatch&&rec.floor==null&&
   /^(Recommended Move|추천 수|Jugada recomendada|Coup conseillé|Empfohlener Zug|おすすめの一手|推荐出牌)$/i.test(title.textContent.trim())){
  const action=logic.discardText(handId,v,deck,locale(),cardName(handId));
  if(action)next=action;
 }
 if(next!==source)text.textContent=next;
}
let queued=false;
function update(){queued=false;updateDraw();updateCopy();}
function schedule(){if(queued)return;queued=true;queueMicrotask(update);}
const obs=new MutationObserver(schedule);
for(const element of [floor,hand,coach,$('playerCaptured'),$('aiCaptured')].filter(Boolean)){
 obs.observe(element,{subtree:true,childList:true,characterData:true,attributes:true,
  attributeFilter:['class','hidden','disabled','data-card-id']});
}
document.addEventListener('click',event=>{
 if(event.target?.closest?.('#trainingModeBtn')){active=true;clearDraw();schedule();}
 if(event.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){active=false;clearDraw();}
},{capture:true});
document.addEventListener('gostop-hand-reset',clearDraw);
Object.defineProperty(globalThis,'GoStopDevTrainingContextCoach',{configurable:true,value:Object.freeze({
 getStatus:()=>({active,drawTarget:lockedDrawId,drawText:drawPanel?.textContent||null})
})});
})();
