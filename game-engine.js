(() => {
  'use strict';

  const monthNames = Object.freeze(['January','February','March','April','May','June','July','August','September','October','November','December']);
  const monthShort = Object.freeze(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);

  const cardDefinitions = [
    [1,'Hikari','bright',null,''], [1,'Tanzaku','ribbon','red',''], [1,'Kasu 1','pi',null,''], [1,'Kasu 2','pi',null,''],
    [2,'Tane','animal',null,'godori'], [2,'Tanzaku','ribbon','red',''], [2,'Kasu 1','pi',null,''], [2,'Kasu 2','pi',null,''],
    [3,'Hikari','bright',null,''], [3,'Tanzaku','ribbon','red',''], [3,'Kasu 1','pi',null,''], [3,'Kasu 2','pi',null,''],
    [4,'Tane','animal',null,'godori'], [4,'Tanzaku','ribbon','grass',''], [4,'Kasu 1','pi',null,''], [4,'Kasu 2','pi',null,''],
    [5,'Tane','animal',null,''], [5,'Tanzaku','ribbon','grass',''], [5,'Kasu 1','pi',null,''], [5,'Kasu 2','pi',null,''],
    [6,'Tane','animal',null,''], [6,'Tanzaku','ribbon','blue',''], [6,'Kasu 1','pi',null,''], [6,'Kasu 2','pi',null,''],
    [7,'Tane','animal',null,''], [7,'Tanzaku','ribbon','grass',''], [7,'Kasu 1','pi',null,''], [7,'Kasu 2','pi',null,''],
    [8,'Hikari','bright',null,''], [8,'Tane','animal',null,'godori'], [8,'Kasu 1','pi',null,''], [8,'Kasu 2','pi',null,''],
    [9,'Tane','animal',null,'switchPi'], [9,'Tanzaku','ribbon','blue',''], [9,'Kasu 1','pi',null,''], [9,'Kasu 2','pi',null,''],
    [10,'Tane','animal',null,''], [10,'Tanzaku','ribbon','blue',''], [10,'Kasu 1','pi',null,''], [10,'Kasu 2','pi',null,''],
    [11,'Hikari','bright',null,''], [11,'Kasu 1','pi',null,'doublePi'], [11,'Kasu 2','pi',null,''], [11,'Kasu 3','pi',null,''],
    [12,'Hikari','bright',null,'rain'], [12,'Tane','animal',null,''], [12,'Tanzaku','ribbon',null,''], [12,'Kasu','pi',null,'doublePi']
  ];

  function cardFilename(month,suffix){ return `Hwatu ${monthNames[month-1]} ${suffix}.svg`; }

  const masterDeck = Object.freeze(cardDefinitions.map((definition,index)=>Object.freeze({
    id:`m${definition[0]}-${index%4+1}`,
    month:definition[0],
    type:definition[2],
    ribbonSet:definition[3],
    flags:Object.freeze(definition[4]?definition[4].split(','):[]),
    file:cardFilename(definition[0],definition[1])
  })));

  function assertDeckIntegrity(deck){
    if(deck.length!==48)throw new Error(`Deck integrity failure: expected 48 cards, got ${deck.length}.`);
    const ids=new Set(deck.map(card=>card.id));
    if(ids.size!==48)throw new Error(`Deck integrity failure: duplicate card IDs detected (${ids.size}/48 unique).`);
    for(let month=1;month<=12;month++){
      const count=deck.filter(card=>card.month===month).length;
      if(count!==4)throw new Error(`Deck integrity failure: month ${month} has ${count} cards instead of 4.`);
    }
  }

  function countsByMonth(cards){
    const counts={};
    cards.forEach(card=>counts[card.month]=(counts[card.month]||0)+1);
    return counts;
  }

  function monthsWithCount(cards,count){
    const counts=countsByMonth(cards);
    return Object.keys(counts).map(Number).filter(month=>counts[month]===count);
  }

  function tripleMonths(cards){ return monthsWithCount(cards,3); }
  function fourMonths(cards){ return monthsWithCount(cards,4); }
  function hasFourOfMonth(cards){ return fourMonths(cards).length>0; }
  function matchingCards(cards,cardOrMonth){
    const month=typeof cardOrMonth==='number'?cardOrMonth:cardOrMonth.month;
    return cards.filter(card=>card.month===month);
  }

  function score(cards){
    const normal=scoreWithGukjinMode(cards,false);
    const asPi=scoreWithGukjinMode(cards,true);
    return asPi.total>normal.total?asPi:normal;
  }

  function scoreWithGukjinMode(cards,gukjinAsPi){
    const isGukjin=card=>card.month===9&&card.type==='animal'&&card.flags.includes('switchPi');
    const bright=cards.filter(card=>card.type==='bright');
    const animals=cards.filter(card=>card.type==='animal'&&!(gukjinAsPi&&isGukjin(card)));
    const ribbons=cards.filter(card=>card.type==='ribbon');
    const piCards=cards.filter(card=>card.type==='pi');
    let brightPts=0;
    if(bright.length===3)brightPts=bright.some(card=>card.flags.includes('rain'))?2:3;
    else if(bright.length===4)brightPts=4;
    else if(bright.length>=5)brightPts=15;
    let animalPts=animals.length>=5?animals.length-4:0;
    const godori=[2,4,8].every(month=>animals.some(card=>card.month===month&&card.flags.includes('godori')));
    if(godori)animalPts+=5;
    let ribbonPts=ribbons.length>=5?ribbons.length-4:0;
    const setBonus=(name,months)=>months.every(month=>ribbons.some(card=>card.month===month&&card.ribbonSet===name))?3:0;
    ribbonPts+=setBonus('red',[1,2,3])+setBonus('blue',[6,9,10])+setBonus('grass',[4,5,7]);
    let piCount=piCards.reduce((sum,card)=>sum+(card.flags.includes('doublePi')?2:1),0);
    if(gukjinAsPi&&cards.some(isGukjin))piCount+=2;
    const piPts=piCount>=10?piCount-9:0;
    return {
      total:brightPts+animalPts+ribbonPts+piPts,
      brightPts,animalPts,ribbonPts,piPts,bright:bright.length,animals:animals.length,
      ribbons:ribbons.length,piCount,godori,gukjinAsPi
    };
  }

  function calculateSettlement({winner,loser,nagariCarryPower=0}){
    const winnerScore=score(winner.captured),loserScore=score(loser.captured);
    const baseTotal=winnerScore.total;
    const goBonus=Math.min(winner.go,2);
    let total=baseTotal+goBonus;
    const reasons=[];
    const formulaSteps=[`Base ${baseTotal}`];

    if(goBonus>0)formulaSteps.push(`Go bonus +${goBonus}`);
    if(winner.go>=3){
      const goMultiplier=2**(winner.go-2);
      total*=goMultiplier;
      reasons.push(`${winner.go} Go ×${goMultiplier}`);
      formulaSteps.push(`${winner.go} Go ×${goMultiplier}`);
    }

    let doublePower=winner.shakes+winner.bombs;
    if(winner.shakes){
      const multiplier=2**winner.shakes;
      reasons.push(`Shake ×${multiplier}`);
      formulaSteps.push(`Shake ×${multiplier}`);
    }
    if(winner.bombs){
      const multiplier=2**winner.bombs;
      reasons.push(`Bomb ×${multiplier}`);
      formulaSteps.push(`Bomb ×${multiplier}`);
    }
    if(winnerScore.animals>=7){doublePower++;reasons.push('Meong-bak ×2');formulaSteps.push('Meong-bak ×2');}
    if(winnerScore.piCount>=10&&loserScore.piCount<=7){doublePower++;reasons.push('Pi-bak ×2');formulaSteps.push('Pi-bak ×2');}
    if(winnerScore.bright>=3&&loserScore.bright===0){doublePower++;reasons.push('Gwang-bak ×2');formulaSteps.push('Gwang-bak ×2');}
    if(loser.go>0&&loserScore.total<=loser.lastGoScore){doublePower++;reasons.push('Go-bak ×2');formulaSteps.push('Go-bak ×2');}
    if(nagariCarryPower>0){
      const multiplier=2**nagariCarryPower;
      doublePower+=nagariCarryPower;
      reasons.push(`Nagari carry ×${multiplier}`);
      formulaSteps.push(`Nagari carry ×${multiplier}`);
    }
    total*=2**doublePower;
    return {base:winnerScore,total,reasons,baseTotal,goBonus,formulaSteps};
  }

  const api=Object.freeze({
    monthNames,monthShort,masterDeck,
    assertDeckIntegrity,countsByMonth,tripleMonths,fourMonths,hasFourOfMonth,
    matchingCards,score,scoreWithGukjinMode,calculateSettlement
  });

  globalThis.GoStopEngine=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
