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
// Only claim a forced capture if there is exactly ONE legal hand-card/table
// target pair. A single matching hand card with two table targets is a choice,
// not a forced capture. No unseen cards or future draw assumptions.
function captureOptions({hand=[],floor=[]}={}){
 const captures=[];
 for(const h of unique(hand)){
  const hm=monthOf(h);
  if(!Number.isInteger(hm)||hm<1||hm>12)continue;
  for(const f of unique(floor))if(monthOf(f)===hm)captures.push({handId:h,floorId:f});
 }
 return captures;
}
function onlyCaptureOption(visible={}){
 const captures=captureOptions(visible);
 return captures.length===1?captures[0]:null;
}
const onlyCaptureCopy={
 en:(h,f)=>'Play '+h+' onto '+f+'. This is the only available capture.',
 ko:(h,f)=>h+'을 '+f+'에 내세요. 지금 먹을 수 있는 유일한 선택입니다.',
 es:(h,f)=>'Juega '+h+' sobre '+f+'. Es la única captura disponible.',
 fr:(h,f)=>'Jouez '+h+' sur '+f+'. C’est la seule prise possible.',
 de:(h,f)=>'Spiele '+h+' auf '+f+'. Das ist der einzige mögliche Fangzug.',
 ja:(h,f)=>h+'を'+f+'に出しましょう。今取れる唯一の組み合わせです。',
 zh:(h,f)=>'打出'+h+'匹配'+f+'。这是目前唯一能收牌的组合。'
};
function onlyCaptureText(handId,floorId,locale='en',handLabel=handId,floorLabel=floorId){
 if(!handId||!floorId)return null;
 return (onlyCaptureCopy[locale]||onlyCaptureCopy.en)(handLabel,floorLabel);
}
// Bomb blank turns flip a deck card without spending a real hand card.
// Never invent available turns or infer hidden cards: callers supply only
// visible hand/floor IDs and the number of enabled blank-turn buttons.
function recommendBombBlank({hand=[],floor=[],availableBlankTurns=0}={}){
 if(!Number.isInteger(availableBlankTurns)||availableBlankTurns<1)return false;
 const real=unique(hand),table=unique(floor);
 return real.every(id=>{
  const month=monthOf(id);
  return Number.isInteger(month)&&month>=1&&month<=12 &&
   !table.some(f=>monthOf(f)===month);
 });
}
const BOMB_BLANK_COPY=Object.freeze({
 en:'Use a blank Bomb turn to flip the deck. No hand card can capture now, so keep your real cards.',
 ko:'폭탄으로 얻은 빈 턴을 사용해 덱에서 패를 뒤집으세요. 지금 먹을 수 있는 손패가 없으므로 실제 손패를 보존하세요.',
 es:'Usa un turno vacío de Bomba para voltear el mazo. No puedes capturar ahora; conserva tus cartas reales.',
 fr:'Utilisez un tour vide de Bombe pour retourner le paquet. Aucune prise possible; gardez vos vraies cartes.',
 de:'Nutze einen leeren Bomben-Zug, um eine Karte vom Stapel aufzudecken. Du kannst jetzt nichts fangen; behalte deine Handkarten.',
 ja:'爆弾で得た空白ターンを使って山札をめくりましょう。今は取れる手札がないので、手札を残してください。',
 zh:'先使用炸弹获得的空白回合翻开牌堆。当前手牌无法收牌，应保留真正的手牌。'
});
function bombBlankText(locale='en'){return BOMB_BLANK_COPY[locale]||BOMB_BLANK_COPY.en;}
// Evaluate the score the OPPONENT could get by capturing our discard with
// one hidden same-month card. This is a conditional public-information risk,
// never a claim about what is in the opponent's concealed hand.
function discardDanger(cardId,visible={},deck=[],scorePlayer=null){
 const candidate=deck.find(c=>c.id===cardId);
 if(!candidate||typeof scorePlayer!=='function')return {cardId,maximumGain:0,reachable:false};
 const publicIds=new Set([
  ...(visible.hand||[]),...(visible.floor||[]),
  ...(visible.humanCaptured||[]),...(visible.computerCaptured||[])
 ]);
 const possible=deck.filter(c=>c.month===candidate.month&&!publicIds.has(c.id));
 const caught=cardsFor(visible.computerCaptured||[],deck);
 if(!possible.length)return {cardId,maximumGain:0,reachable:false};
 const maxScore=cards=>Math.max(...['animal','pi'].map(gukjinMode=>{
  const value=scorePlayer({captured:cards,gukjinMode});
  return Number.isFinite(value?.total)?value.total:0;
 }));
 const before=maxScore(caught);
 let maximumGain=0;
 for(const matching of possible){
  const after=maxScore([...caught,candidate,matching]);
  maximumGain=Math.max(maximumGain,after-before);
 }
 const blue=candidate.ribbonSet==='blue'&&caught.filter(c=>c.ribbonSet==='blue').length>=2;
 const red=candidate.ribbonSet==='red'&&caught.filter(c=>c.ribbonSet==='red').length>=2;
 const grass=candidate.ribbonSet==='grass'&&caught.filter(c=>c.ribbonSet==='grass').length>=2;
 const birds=!!candidate.flags?.includes('godori')&&
  caught.filter(c=>c.flags?.includes('godori')).length>=2;
 const bright=candidate.type==='bright'&&caught.filter(c=>c.type==='bright').length>=2;
 return {cardId,maximumGain,reachable:true,
  critical:blue||red||grass||birds||bright||maximumGain>=3,
  bonus:blue?'blue':red?'red':grass?'grass':birds?'godori':bright?'bright':null};
}
function safestDiscard(visible={},deck=[],scorePlayer=null){
 const hand=unique(visible.hand);
 if(!hand.length||!Array.isArray(deck)||typeof scorePlayer!=='function')return null;
 if(hand.some(id=>unique(visible.floor).some(f=>monthOf(id)===monthOf(f))))return null;
 const scored=hand.map(cardId=>{
  const danger=discardDanger(cardId,visible,deck,scorePlayer);
  const card=deck.find(c=>c.id===cardId);
  const value=card?.type==='bright'?100:card?.flags?.includes('godori')?75:
   card?.type==='ribbon'?45:card?.flags?.includes('doublePi')?60:
   card?.type==='pi'?10:30;
  return {...danger,preserveValue:value};
 });
 scored.sort((a,b)=>a.maximumGain-b.maximumGain||
  Number(a.critical)-Number(b.critical)||
  a.preserveValue-b.preserveValue||a.cardId.localeCompare(b.cardId));
 return {choice:scored[0],alternatives:scored.slice(1)};
}
const DANGER_COPY={
 en:{blue:'three Blue Stripes for 3 points',red:'three Red Stripes for 3 points',
  grass:'three Plain Stripes for 3 points',godori:'5-BIRDIES for 5 points',
  bright:'three Brights',other:n=>n+' immediate points',
  explanation:(recommended,rejected,bonus)=>'Discard '+recommended+' instead. '+rejected+
   ' could let the computer complete '+bonus+'.'},
 ko:{blue:'청단 세 장으로 3점',red:'홍단 세 장으로 3점',grass:'초단 세 장으로 3점',
  godori:'고도리 5점',bright:'광 세 장',other:n=>n+'점',explanation:(a,b,c)=>b+'을 버리면 상대가 '+c+'을 얻을 수 있습니다. 대신 '+a+'을 버리세요.'},
 es:{blue:'tres cintas azules y 3 puntos',red:'tres cintas rojas y 3 puntos',grass:'tres cintas lisas y 3 puntos',
  godori:'5-BIRDIES y 5 puntos',bright:'tres brillantes',other:n=>n+' puntos',
  explanation:(a,b,c)=>'Descarta '+a+' en su lugar. '+b+' podría dar al rival '+c+'.'},
 fr:{blue:'trois rubans bleus pour 3 points',red:'trois rubans rouges pour 3 points',
  grass:'trois rubans simples pour 3 points',godori:'5 oiseaux pour 5 points',
  bright:'trois brillantes',other:n=>n+' points',
  explanation:(a,b,c)=>'Défaussez plutôt '+a+'. '+b+' pourrait offrir à l’adversaire '+c+'.'},
 de:{blue:'drei blaue Bänder für 3 Punkte',red:'drei rote Bänder für 3 Punkte',
  grass:'drei einfache Bänder für 3 Punkte',godori:'5 Vögel für 5 Punkte',
  bright:'drei Lichtkarten',other:n=>n+' Punkte',
  explanation:(a,b,c)=>'Wirf stattdessen '+a+' ab. '+b+' könnte dem Gegner '+c+' bringen.'},
 ja:{blue:'青短3枚の3点',red:'赤短3枚の3点',grass:'草短3枚の3点',
  godori:'五鳥の5点',bright:'光札3枚',other:n=>n+'点',
  explanation:(a,b,c)=>b+'を捨てると相手に'+c+'を与える恐れがあります。代わりに'+a+'を捨てましょう。'},
 zh:{blue:'三张蓝带的3分',red:'三张红带的3分',grass:'三张普通带的3分',
  godori:'五鸟的5分',bright:'三张光牌',other:n=>n+'分',
  explanation:(a,b,c)=>'建议改弃'+a+'。弃'+b+'可能让对手获得'+c+'。'}
};
function riskyDiscardCopy(chosenName,rejectedName,risk={},locale='en'){
 const t=DANGER_COPY[locale]||DANGER_COPY.en;
 return t.explanation(chosenName,rejectedName,t[risk.bonus]||t.other(risk.maximumGain));
}
// A second legal capture deserves a comparison, not a generic label.
function captureComparison({hand=[],floor=[],humanCaptured=[],computerCaptured=[]},
 handId,floorId,deck=[],scorePlayer=null){
 if(!handId||!floorId||typeof scorePlayer!=='function')return null;
 const actions=[];
 for(const h of unique(hand))for(const f of unique(floor))
  if(monthOf(h)===monthOf(f))actions.push({h,f});
 const others=actions.filter(a=>a.h!==handId||a.f!==floorId);
 if(!others.length)return null;
 const rec=actions.find(a=>a.h===handId&&a.f===floorId);
 if(!rec)return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const captured=cardsFor(humanCaptured,deck);
 const score=cards=>Math.max(...['animal','pi'].map(gukjinMode=>
  scorePlayer({captured:cards,gukjinMode})?.total||0));
 const before=score(captured);
 const details=a=>{
  const pair=[byId.get(a.h),byId.get(a.f)].filter(Boolean);
  const bonus=score([...captured,...pair])-before;
  const pi=pair.reduce((n,c)=>n+(c.type==='pi'?(c.flags?.includes('doublePi')?2:1):0),0);
  const visible=new Set([...hand,...floor,...humanCaptured,...computerCaptured]
   .filter(id=>monthOf(id)===monthOf(a.h)));
  return {...a,bonus,pi,secured:visible.size===4};
 };
 const selected=details(rec);
 const alternative=others.map(details)
  .sort((a,b)=>b.bonus-a.bonus||b.pi-a.pi||a.h.localeCompare(b.h))[0];
 return {selected,alternative,preferNow:selected.bonus>alternative.bonus||
  (selected.bonus===alternative.bonus&&selected.pi>alternative.pi)};
}
const COMPARE_COPY={
 en:(first,other,result)=>{
  if(result.selected.secured&&result.alternative.secured){
   if(result.preferNow)return 'Both '+first+' and '+other+' are secured. Take '+first+
    ' first to build '+(result.selected.pi>result.alternative.pi?'Singles':'points')+
    ' sooner; '+other+' remains available.';
   return 'Both '+first+' and '+other+' are secured. '+other+
    ' remains available; their immediate scoring value is similar.';
  }
  if(result.preferNow)return 'Take '+first+' now; it advances your score more than '+other+'.';
  return other+' is also possible, with no demonstrated immediate scoring advantage for '+first+'.';
 },
 ko:(a,b,r)=>r.selected.secured&&r.alternative.secured?
  '두 패 모두 확보 가능한 수입니다. '+a+'을 먼저 먹고 '+b+'은 다음에 먹을 수 있습니다.':
  a+'과 '+b+'을 비교하면 '+(r.preferNow?a+'의 즉시 점수 기여가 더 큽니다.':'지금 정보만으로 우위를 단정할 수 없습니다.'),
 es:(a,b,r)=>'También puedes capturar '+b+'. '+(r.preferNow?a+' ofrece más progreso inmediato.':'No hay ventaja de puntuación inmediata demostrada.'),
 fr:(a,b,r)=>b+' est aussi disponible. '+(r.preferNow?a+' fait progresser davantage vos points immédiats.':'Aucun avantage de points immédiats certain.'),
 de:(a,b,r)=>b+' ist ebenfalls möglich. '+(r.preferNow?a+' bringt sofort mehr Punktefortschritt.':'Ein klarer sofortiger Punktevorteil ist nicht belegt.'),
 ja:(a,b,r)=>b+'も取れます。'+(r.preferNow?a+'の方が今すぐ得点につながります。':'今の情報では即時得点の優劣は確定できません。'),
 zh:(a,b,r)=>b+'也能收。'+(r.preferNow?a+'能更快增加分数。':'目前无法确定哪一手立即得分更高。')
};
function captureComparisonCopy(firstName,otherName,result,locale='en'){
 if(!result)return null;
 return (COMPARE_COPY[locale]||COMPARE_COPY.en)(firstName,otherName,result);
}
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
const api=Object.freeze({monthOf,securedDiscard,drawTargetScore,recommendDrawTarget,stripePotential,captureOptions,onlyCaptureOption,onlyCaptureText,discardDanger,safestDiscard,riskyDiscardCopy,captureComparison,captureComparisonCopy,discardText,recommendBombBlank,bombBlankText,T,options,cardsFor});
root.GoStopDevTrainingAdviceLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
