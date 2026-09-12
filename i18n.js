(() => {
  'use strict';
  const en={
    brand:'GoStop Online',howTo:'How to Play',newGame:'New Game',player:'Player',computer:'Computer',you:'You',
    captured:'Captured Cards',computerCaptured:'Computer Captured Cards',yourCaptured:'Your Captured Cards',
    brights:'Brights',pictures:'Pictures',stripes:'Stripes',singles:'Singles',points:'Points',scoreBreakdown:'Score Breakdown',
    shake:'Shake',keepBomb:'Keep for Bomb',bomb:'Bomb!',computerShakes:'Computer Shakes!',ok:'OK',
    goStop:'Go or Stop?',go:'GO',stop:'STOP',currentGo:'Current: {count} Go',stopValue:'Stop : {points} Points',
    usePicture:'Use as Picture',useSingle:'Use as Single',sakeCupChoice:'Choose how to use this card',doubleSingleHelp:'Single counts as 2 Singles.',
    pooped:'POOPED!',firstPoop:'FIRST POOP!',triplePoop:'TRIPLE POOP!',kiss:'KISS!',tapTap:'TAP-TAP!',cleanSweep:'CLEAN SWEEP!',birdies:'3-BIRDIES!',threeStripes:'3-STRIPES!',fiveBrights:'5-BRIGHTS!',conquer:'CONQUER!',noWinner:'NO WINNER!',
    playerFirst:'Player goes first!',computerFirst:'Computer goes first!',nextDoubled:'Next Hand ×{multiplier}',
    noWinnerHelp:'No one won before the hand ended. The next completed hand is doubled.',playAgain:'Play Again?',
    brightPenalty:'Bright Penalty',picturePenalty:'Picture Penalty',singlePenalty:'Single Penalty',goPenalty:'Go Penalty',noWinnerCarry:'No Winner Carry',firstPoopBonus:'First Poop Bonus',
    overview:'Overview',cardTypes:'Card Types',turnBasics:'Turn Basics',matchExamples:'Match Examples',specialEvents:'Special Events',scoring:'Scoring',exampleHands:'Example Hands',
    tutorialOverview:'Capture matching months, build scoring groups, reach 7 points, then choose GO or STOP.',
    tutorialTurn:'1. Play one GoStop Card → 2. Capture matching floor cards → 3. Flip the deck → 4. Resolve that card.',
    tutorialSingles:'Singles use effective value. A Double-Single is worth two even though it is one physical card.',
    tutorialSpecials:'Shake reveals a triple; Bomb arms three matching cards; Pooped piles, KISS, TAP-TAP, and CLEAN SWEEP steal Singles. CONQUER wins immediately at opening.',
    tutorialGoStop:'STOP banks the displayed settlement. GO continues for a larger payout with added reversal risk.',
    months:'January,February,March,April,May,June,July,August,September,October,November,December'
  };
  const overrides={
    es:{howTo:'Cómo jugar',newGame:'Nueva partida',player:'Jugador',computer:'Computadora',you:'Tú',goStop:'¿Go o Stop?',scoreBreakdown:'Desglose de puntuación',playAgain:'¿Jugar otra vez?'},
    fr:{howTo:'Comment jouer',newGame:'Nouvelle partie',player:'Joueur',computer:'Ordinateur',you:'Vous',goStop:'Go ou Stop ?',scoreBreakdown:'Détail du score',playAgain:'Rejouer ?'},
    de:{howTo:'Spielanleitung',newGame:'Neues Spiel',player:'Spieler',computer:'Computer',you:'Du',goStop:'Go oder Stop?',scoreBreakdown:'Punkteübersicht',playAgain:'Noch einmal?'},
    ko:{howTo:'게임 방법',newGame:'새 게임',player:'플레이어',computer:'컴퓨터',you:'나',pooped:'뻑!',firstPoop:'첫뻑!',triplePoop:'삼뻑!',kiss:'쪽!',tapTap:'따닥!',cleanSweep:'싹쓸이!',birdies:'고도리!',conquer:'총통!',noWinner:'나가리!',goStop:'고 또는 스톱?',playAgain:'다시 하기'},
    ja:{howTo:'遊び方',newGame:'新しいゲーム',player:'プレイヤー',computer:'コンピューター',you:'あなた',goStop:'ゴーかストップ？',scoreBreakdown:'スコア内訳',playAgain:'もう一度'},
    zh:{howTo:'游戏方法',newGame:'新游戏',player:'玩家',computer:'电脑',you:'你',goStop:'继续还是停止？',scoreBreakdown:'得分明细',playAgain:'再玩一次'}
  };
  const dictionaries=Object.fromEntries(['en','es','fr','de','ko','ja','zh'].map(locale=>[locale,Object.freeze({...en,...(overrides[locale]||{})})]));
  const names={en:'English',es:'Español',fr:'Français',de:'Deutsch',ko:'한국어',ja:'日本語',zh:'中文'};
  function translate(locale,key,vars={}){const template=dictionaries[locale]?.[key]??dictionaries.en[key]??key;return String(template).replace(/\{(\w+)\}/g,(_,name)=>vars[name]??`{${name}}`);}
  const api=Object.freeze({brand:'GoStop Online',dictionaries:Object.freeze(dictionaries),names:Object.freeze(names),translate});
  globalThis.GoStopI18n=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
