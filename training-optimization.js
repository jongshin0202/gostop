/* Pure Training recommendation experiment; never executes card moves or alters game state.
   This module is deliberately NOT wired into frozen app.js until an approved integration exists. */
((root)=>{
  'use strict';
  const includes=(card,flag)=>!!card?.flags?.includes(flag);
  const handValue=(card,godoriViable=false)=>{
    if(!card)return 0;
    if(includes(card,'godori')&&godoriViable)return 80;
    if(card.type==='bright')return 70;
    if(card.type==='ribbon')return 60;
    if(includes(card,'doublePi')||includes(card,'switchPi'))return 50;
    if(card.type==='pi')return 40;
    if(card.type==='animal')return 30;
    return 0;
  };
  const cardIsCup=(card)=>card?.id==='m9-1'&&includes(card,'switchPi');
  function floorValue(target,profile={}){
    if(!target)return 0;
    if(includes(target,'godori')&&profile.godoriRoute?.alive)return 880;
    if(target.type==='bright')return 780;
    if(target.type==='ribbon'){
      const route=profile.ribbonRoutes?.[target.ribbonSet];
      return route?.alive===false?310:route?.veryStrong?740:route?.strong?680:600;
    }
    if(includes(target,'doublePi')||cardIsCup(target))return 560;
    if(target.type==='pi')return 450;
    if(target.type==='animal')return 330;
    return 0;
  }
  const setBonus=c=>/completes/i.test(String(c.opportunity||''))?280:
    (Number(c.urgency?.immediateScoreGain)||0)>0?190:0;
  function rank(candidates=[]){
    const all=candidates.filter(c=>c?.card);
    if(!all.length)return null;
    const captures=all.filter(c=>!!c.target);
    const eligible=captures.some(c=>!c.reserved)?captures.filter(c=>!c.reserved):captures;
    if(!eligible.length){
      const discard=[...all].sort((a,b)=>Number(a.discardRisk??a.score??0)-Number(b.discardRisk??b.score??0)||String(a.card.id).localeCompare(String(b.card.id)))[0];
      return {cardId:discard.card.id,targetId:null,reasonKey:'safest-discard',hasAlternative:all.length>1};
    }
    const sorted=[...eligible].sort((a,b)=>{
      const pa=a.profile||{},pb=b.profile||{};
      // When both hand cards capture the same table card, use the more valuable hand card.
      if(a.target.id===b.target.id&&a.card.month===b.card.month){
        const delta=handValue(b.card,!!pb.godoriRoute?.alive)-handValue(a.card,!!pa.godoriRoute?.alive);
        if(delta)return delta;
      }
      const emergencyA=Number(a.urgency?.immediateScoreGain||0)>0?1000:0;
      const emergencyB=Number(b.urgency?.immediateScoreGain||0)>0?1000:0;
      const valA=floorValue(a.target,pa)+setBonus(a)+emergencyA+(a.urgency?.severeBlock?280:0);
      const valB=floorValue(b.target,pb)+setBonus(b)+emergencyB+(b.urgency?.severeBlock?280:0);
      return valB-valA||handValue(b.card,!!pb.godoriRoute?.alive)-handValue(a.card,!!pa.godoriRoute?.alive)
        ||String(a.card.id).localeCompare(String(b.card.id))||String(a.target.id).localeCompare(String(b.target.id));
    });
    const best=sorted[0];
    const alternative=sorted.length>1;
    const sameTarget=alternative&&sorted[1].target.id===best.target.id;
    const reasonKey=best.opportunity&&/completes/i.test(best.opportunity)?'complete-set':
      best.urgency?.immediateScoreGain>0?'score-now':
      best.urgency?.severeBlock?'urgent-block':
      sameTarget&&handValue(best.card,!!best.profile?.godoriRoute?.alive)>handValue(sorted[1].card,!!best.profile?.godoriRoute?.alive)?'use-higher-value-hand':
      best.target.type==='bright'?'capture-bright':
      includes(best.target,'godori')&&best.profile?.godoriRoute?.alive?'capture-godori':
      best.target.type==='ribbon'?'capture-useful-stripe':
      includes(best.target,'doublePi')||cardIsCup(best.target)?'capture-two-singles':'capture-table-card';
    return {cardId:best.card.id,targetId:best.target.id,reasonKey,hasAlternative:alternative};
  }
  const api=Object.freeze({rank,handValue,floorValue});
  root.GoStopTrainingOptimization=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
