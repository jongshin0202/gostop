/* Pure, removable Training-only presentation decisions.
 * Inputs are only cards already visible to the player.
 * Does not access game state, hidden deck/order or network.
 */
((root)=>{
'use strict';
const monthOf=id=>Number(/^m(\d{1,2})-/.exec(String(id||''))?.[1]);
const unique=ids=>[...new Set((ids||[]).filter(Boolean))];
const options=Object.freeze(['bright','godori','red','blue','grass','singles','pictures']);
const STRIPE_MONTHS={red:[1,2,3],blue:[6,9,10],grass:[4,5,7]};
function cardsFor(ids,deck){return unique(ids).map(id=>deck.find(c=>c.id===id)).filter(Boolean);}
function securedDiscard({cardId,hand=[],floor=[],humanCaptured=[],computerCaptured=[]}={}){
 const month=monthOf(cardId),same=ids=>unique(ids).filter(id=>monthOf(id)===month);
 if(!(month>=1&&month<=12)||!hand.includes(cardId))return false;
 const otherInHand=same(hand).filter(id=>id!==cardId);
 if(otherInHand.length!==1||same(floor).length)return false;
 const captured=unique([...humanCaptured,...computerCaptured]);
 if(same(captured).length!==2)return false;
 return new Set([...otherInHand,cardId,...same(captured)]).size===4;
}
function stripePotential(set,{hand=[],floor=[],humanCaptured=[],computerCaptured=[]},deck){
 const stripeCards=deck.filter(c=>c.type==='ribbon'&&c.ribbonSet===set&&STRIPE_MONTHS[set]?.includes(c.month));
 if(stripeCards.length!==3)return {possible:false,owned:0,reachable:0};
 const lost=stripeCards.filter(c=>computerCaptured.includes(c.id));
 if(lost.length)return {possible:false,owned:0,reachable:0};
 const owned=stripeCards.filter(c=>humanCaptured.includes(c.id)||hand.includes(c.id)).length;
 const reachable=stripeCards.filter(c=>floor.includes(c.id)&&hand.some(id=>monthOf(id)===c.month)).length;
 return {possible:true,owned,reachable};
}
function drawTargetScore(card,visible,deck){
 if(!card)return -1;
 if(card.type==='bright')return 1000;
 if(card.flags?.includes('godori')){
  const lost=deck.filter(c=>c.flags?.includes('godori')&&visible.computerCaptured?.includes(c.id)).length;
  return lost?360:890;
 }
 if(card.type==='ribbon'){
  const progress=stripePotential(card.ribbonSet,visible,deck);
  return 625+(progress.possible?progress.owned*80+progress.reachable*35:0);
 }
 if(card.flags?.includes('doublePi')||card.flags?.includes('switchPi'))return 575;
 if(card.type==='pi')return 450;
 return card.type==='animal'?330:0;
}
function recommendDrawTarget(targetIds,visible,deck){
 if(!Array.isArray(targetIds)||targetIds.length<2||!Array.isArray(deck))return null;
 const candidates=unique(targetIds).map(id=>deck.find(c=>c.id===id)).filter(Boolean);
 if(candidates.length<2)return null;
 candidates.sort((a,b)=>drawTargetScore(b,visible,deck)-drawTargetScore(a,visible,deck)||a.id.localeCompare(b.id));
 return {cardId:candidates[0].id,legalIds:candidates.map(c=>c.id),reason:'capture-value'};
}
const T={
 en:{draw:n=>'Choose '+n+'.',safe:n=>'Discard '+n+'. You hold the only matching card, so you can take it back.',paired:n=>'Discard '+n+'. Keep your stronger matching card.',noMatch:n=>'Discard '+n+'. No capture is available.'},
 ko:{draw:n=>n+'을 선택하세요.',safe:n=>n+'을 내세요. 남은 같은 무늬 패가 손에 있어 다시 가져올 수 있습니다.',paired:n=>n+'을 내고 가치가 높은 같은 무늬 패를 남기세요.',noMatch:n=>n+'을 내세요. 지금 먹을 패가 없습니다.'},
 es:{draw:n=>'Elige '+n+'.',safe:n=>'Descarta '+n+'. Conservas la única pareja, así que podrás recuperarla.',paired:n=>'Descarta '+n+'. Guarda la carta más valiosa del mismo grupo.',noMatch:n=>'Descarta '+n+'. No hay captura disponible.'},
 fr:{draw:n=>'Choisissez '+n+'.',safe:n=>'Défaussez '+n+'. Vous gardez la seule carte correspondante pour la récupérer.',paired:n=>'Défaussez '+n+'. Gardez la carte de même famille la plus précieuse.',noMatch:n=>'Défaussez '+n+'. Aucune prise possible.'},
 de:{draw:n=>'Wähle '+n+'.',safe:n=>'Wirf '+n+' ab. Du hältst die einzige passende Karte zum späteren Aufnehmen.',paired:n=>'Wirf '+n+' ab. Behalte die wertvollere Karte derselben Familie.',noMatch:n=>'Wirf '+n+' ab. Kein Treffer möglich.'},
 ja:{draw:n=>n+'を選びましょう。',safe:n=>n+'を捨てます。対になる札は手元にあり、あとで回収できます。',paired:n=>n+'を捨てて、価値の高い同じ組の札を残しましょう。',noMatch:n=>n+'を捨てます。取れる札はありません。'},
 zh:{draw:n=>'选择'+n+'。',safe:n=>'打出'+n+'。唯一匹配的牌还在手中，可再收回。',paired:n=>'打出'+n+'，保留同组价值更高的牌。',noMatch:n=>'打出'+n+'。目前无牌可收。'}
};
function discardText(cardId,visible,deck,locale='en',name=''){
 const fn=T[locale]||T.en;
 const card=deck?.find(c=>c.id===cardId);
 if(!card)return null;
 const label=name||card.id;
 const sameHand=unique(visible.hand).filter(id=>monthOf(id)===card.month);
 const matches=unique(visible.floor).some(id=>monthOf(id)===card.month);
 if(matches)return null;
 if(securedDiscard({...visible,cardId}))return fn.safe(label);
 if(sameHand.length>=2)return fn.paired(label);
 return fn.noMatch(label);
}
const api=Object.freeze({monthOf,securedDiscard,drawTargetScore,recommendDrawTarget,stripePotential,discardText,T,options,cardsFor});
root.GoStopDevTrainingAdviceLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
