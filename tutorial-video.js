(() => {
  'use strict';

  const dialog=document.getElementById('howToDialog');
  const view=document.getElementById('tutorialVideoView');
  if(!dialog||!view)return;

  const stage=view.querySelector('#tutorialVideoStage');
  const caption=view.querySelector('#tutorialVideoCaption');
  const rulesBtn=view.querySelector('#tutorialFullRulesBtn');
  const trainingBtn=view.querySelector('#tutorialTrainingModeBtn');
  const nav=dialog.querySelector('.tutorial-nav');
  const sections=dialog.querySelector('.tutorial-sections');
  const engine=globalThis.GoStopEngine;
  const deck=engine?.masterDeck||[];
  const commons='https://commons.wikimedia.org/wiki/Special:Redirect/file/';
  const familyNames={1:'Pine',2:'Plum',3:'Cherry',4:'Vine',5:'Iris',6:'Rose',7:'Bush',8:'Hill',9:'Daisy',10:'Star',11:'Berry',12:'Willow'};

  const cardById=id=>deck.find(card=>card.id===id)||null;
  const artUrl=card=>card?commons+encodeURIComponent(card.file).replace(/%2F/g,'/'):'';
  const typeName=card=>{
    if(!card)return 'Card';
    if(card.id==='m9-1')return 'Sake Cup';
    if(card.type==='bright')return 'Bright';
    if(card.type==='animal')return card.flags?.includes('godori')?'Bird Picture':'Picture';
    if(card.type==='ribbon'){
      if(card.ribbonSet==='red')return 'Red Stripe';
      if(card.ribbonSet==='blue')return 'Blue Stripe';
      if(card.ribbonSet==='grass')return 'Plain Stripe';
      return 'Stripe';
    }
    return card.flags?.includes('doublePi')?'2x Single':'Single';
  };
  const cardHtml=(id,label='',classes='')=>{
    const card=cardById(id);
    if(!card)return '';
    const accessible=familyNames[card.month]+' '+typeName(card);
    return '<figure class="tutorial-video-card-wrap '+classes+'" data-card-id="'+id+'"><img class="tutorial-video-card" src="'+artUrl(card)+'" alt="'+accessible+'">'+(label?'<figcaption>'+label+'</figcaption>':'')+'</figure>';
  };
  const miniCards=(cards,classes='')=>cards.map(card=>cardHtml(card.id,'',classes)).join('');
  const ids=(predicate)=>deck.filter(predicate).map(card=>card.id);
  const cardBack=()=>'<div class="tutorial-video-card-wrap"><div class="tutorial-video-card tutorial-video-card-back" aria-label="Draw pile card"></div></div>';

  const familyGrid=()=>{
    let html='<div class="tutorial-all-families">';
    for(let month=1;month<=12;month++){
      html+='<article><strong>'+familyNames[month]+'</strong><div>'+miniCards(deck.filter(card=>card.month===month),'tutorial-micro-card')+'</div></article>';
    }
    return html+'</div>';
  };

  const allTypeGrid=()=>{
    const brights=deck.filter(card=>card.type==='bright');
    const pictures=deck.filter(card=>card.type==='animal');
    const red=deck.filter(card=>card.type==='ribbon'&&card.ribbonSet==='red');
    const blue=deck.filter(card=>card.type==='ribbon'&&card.ribbonSet==='blue');
    const plain=deck.filter(card=>card.type==='ribbon'&&card.ribbonSet==='grass');
    const otherStripe=deck.filter(card=>card.type==='ribbon'&&!card.ribbonSet);
    const singles=deck.filter(card=>card.type==='pi');
    return '<div class="tutorial-type-catalog">'
      +'<article data-type="bright"><h3>Brights</h3><div>'+miniCards(brights,'tutorial-catalog-card')+'</div></article>'
      +'<article data-type="picture"><h3>Pictures</h3><div>'+miniCards(pictures,'tutorial-catalog-card')+'</div></article>'
      +'<article data-type="stripe"><h3>Stripes</h3>'
        +'<div class="tutorial-stripe-row"><b>Red</b>'+miniCards(red,'tutorial-catalog-card')+'</div>'
        +'<div class="tutorial-stripe-row"><b>Blue</b>'+miniCards(blue,'tutorial-catalog-card')+'</div>'
        +'<div class="tutorial-stripe-row"><b>Plain</b>'+miniCards(plain,'tutorial-catalog-card')+'</div>'
        +'<div class="tutorial-stripe-row"><b>Willow</b>'+miniCards(otherStripe,'tutorial-catalog-card')+'</div>'
      +'</article>'
      +'<article data-type="single"><h3>Singles</h3><div>'+miniCards(singles,'tutorial-catalog-card')+'</div></article>'
      +'</div>';
  };

  const compactGameMock=(kind='desktop')=>{
    return '<div class="tutorial-device-frame '+kind+'">'
      +'<div class="tutorial-device-top"><span>GoStop <em>Live!</em></span><b>7 Points</b></div>'
      +'<div class="tutorial-mock-opponent"><span class="tutorial-avatar">AI</span><strong>Computer</strong><small>Captured Cards</small></div>'
      +'<div class="tutorial-mock-table">'
        +'<div class="tutorial-mock-deck">'+cardBack()+'</div>'
        +'<div class="tutorial-mock-floor">'+cardHtml('m5-4')+cardHtml('m8-1')+cardHtml('m10-3')+cardHtml('m7-1')+'</div>'
      +'</div>'
      +'<div class="tutorial-mock-bottom">'
        +'<div class="tutorial-mock-player"><span class="tutorial-avatar">YOU</span><strong>You</strong><small>0 Points</small></div>'
        +'<div class="tutorial-mock-hand">'+cardHtml('m5-3')+cardHtml('m6-3')+cardHtml('m10-4')+'</div>'
        +'<div class="tutorial-mock-captured"><strong>Your Captured Cards</strong><span>Brights · Pictures · Stripes · Singles</span></div>'
      +'</div>'
      +'</div>';
  };

  const sceneCaption=(scene,p)=>{
    const captions=scene.captions||[];
    if(!captions.length)return scene.caption||'';
    for(const item of captions)if(p<item.until)return item.text;
    return captions[captions.length-1].text;
  };

  const scenes=[
    {
      id:'welcome',duration:6,phases:1,
      caption:'Welcome to GoStop Live!',
      render:()=>'<div class="tutorial-video-scene scene-welcome"><div class="tutorial-video-logo">GoStop <em>Live!</em></div><div class="tutorial-card-fan">'+miniCards(['m1-1','m2-1','m3-1','m8-1','m9-1','m12-1'].map(cardById).filter(Boolean),'tutorial-fan-card')+'</div><strong class="tutorial-welcome-copy">Welcome!</strong></div>'
    },
    {
      id:'world',duration:12,phases:3,
      captions:[
        {until:.34,text:'GoStop Live! makes GoStop easy to play together, wherever you are.'},
        {until:.68,text:'Play with friends or meet other GoStop Live! players around the world.'},
        {until:1,text:'Use the same GoStop Live! experience on a computer or on your phone.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-world"><h2>GoStop, together around the world</h2><div class="tutorial-globe"><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><i class="n5"></i><span class="arc a1"></span><span class="arc a2"></span><span class="arc a3"></span></div><div class="tutorial-world-devices"><span>PC</span><span>↔</span><span>Mobile</span></div></div>'
    },
    {
      id:'pc-controls',duration:18,phases:4,
      captions:[
        {until:.25,text:'On PC or Mac, move to a card and click once. The selected card lifts out of your hand.'},
        {until:.5,text:'Click the selected card again to hit it onto the table.'},
        {until:.75,text:'If two table cards can be hit, the possible targets are highlighted.'},
        {until:1,text:'Click the highlighted table card you want to capture.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-pc-controls"><h2>Playing on PC / Mac</h2>'+compactGameMock('desktop')+'<div class="tutorial-pointer">↖</div><div class="tutorial-control-callout">Click once → select<br>Click again → hit</div></div>'
    },
    {
      id:'mobile-controls',duration:20,phases:5,
      captions:[
        {until:.2,text:'On mobile, tap a card once to select it.'},
        {until:.4,text:'Tap the selected card again to hit it onto the table.'},
        {until:.6,text:'If two table targets are available, tap the highlighted target you want.'},
        {until:.8,text:'For a faster play, press and flick the card upward.'},
        {until:1,text:'The flick throws the card directly toward the table.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-mobile-controls"><h2>Playing on Mobile</h2><div class="tutorial-phone-wrap">'+compactGameMock('mobile')+'<div class="tutorial-finger">☝</div><div class="tutorial-flick-trail"></div></div><div class="tutorial-control-callout">Tap · Tap again · or Flick up</div></div>'
    },
    {
      id:'game-info',duration:18,phases:5,
      captions:[
        {until:.2,text:'Tap or click a player area to see player information.'},
        {until:.4,text:'Tap the score to see the point breakdown.'},
        {until:.6,text:'Tap the captured-card area to inspect all captured cards and scoring groups.'},
        {until:.8,text:'Status badges show things such as GO count and settlement multipliers.'},
        {until:1,text:'How to Play and Quit Game stay available from the game screen.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-game-info"><h2>Everything important is one click away</h2>'+compactGameMock('desktop')+'<div class="tutorial-info-popover"><strong data-info-title>Player Info</strong><span data-info-copy>Nickname · session · Coins · status</span></div><div class="tutorial-info-marker m1">Player</div><div class="tutorial-info-marker m2">Score</div><div class="tutorial-info-marker m3">Captured</div><div class="tutorial-info-marker m4">Status</div><div class="tutorial-info-marker m5">How to Play / Quit</div></div>'
    },
    {
      id:'modes',duration:22,phases:5,
      captions:[
        {until:.2,text:'Training Mode lets you practice against AI while GoStop Live! explains recommended moves and rules.'},
        {until:.4,text:'Friendly Solo Play is a casual game against the computer AI with no Coins or leaderboard impact.'},
        {until:.6,text:'Play With Friend creates a room link. Send the link and your friend can join your game.'},
        {until:.8,text:'Competitive Solo Play lets you play against the computer for Coins and ranking.'},
        {until:1,text:'Competitive Online Play matches you against other players for Coins and global ranking.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-modes"><h2>Choose how you want to play</h2><div class="tutorial-menu-mock"><section class="competitive"><h3>COMPETITIVE GAMING</h3><small>Coins and leaderboards involved</small><button>Solo Play</button><button>Online Play</button></section><section class="friendly"><h3>FRIENDLY GAMING</h3><small>No coins or leaderboards involved</small><button>Solo Play</button><button>Play With Friend</button><button>Training Mode</button></section></div><div class="tutorial-mode-note" data-mode-note></div></div>'
    },
    {
      id:'social',duration:18,phases:4,
      captions:[
        {until:.25,text:'Auto Match recommends the best available opponent and lets you accept or see someone else.'},
        {until:.5,text:'You can also browse players or search for a specific player.'},
        {until:.75,text:'Send a Friend Request to connect with someone you want to play again.'},
        {until:1,text:'Friends, recent opponents, and recommendations make it easy to find your next game.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-social"><h2>Find people to play</h2><div class="tutorial-social-card"><div class="tutorial-social-avatar">J</div><div><strong>Jjineeland</strong><span>Rank #12 · 1,565 Coins</span><span>82% Match</span></div><div class="tutorial-social-actions"><button>Accept</button><button>Someone Else</button></div></div><div class="tutorial-social-tabs"><span>Auto Match</span><span>Browse Top 10</span><span>Search Player</span><span>Friends</span></div><div class="tutorial-friend-request">Friend Request ✓</div></div>'
    },
    {
      id:'leaderboards',duration:18,phases:4,
      captions:[
        {until:.25,text:'Leaderboards show the All-Time Global ranking.'},
        {until:.5,text:'Swipe or advance to see This Month’s Global ranking.'},
        {until:.75,text:'Competitive wins and losses change your Coins and your position in the rankings.'},
        {until:1,text:'Leave the Main Menu untouched and Attract Mode automatically cycles through the leaderboards and back.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-leaderboards"><h2>Global Leaderboards</h2><div class="tutorial-leaderboard-screen"><header data-board-title>Global Leaderboard</header><ol><li><b>1</b><span>Jjineeland</span><strong>1,565 Coins</strong></li><li><b>2</b><span>Player Two</span><strong>1,410 Coins</strong></li><li><b>3</b><span>Player Three</span><strong>1,325 Coins</strong></li></ol></div><div class="tutorial-attract-strip"><span>Main Menu</span><b>→</b><span>Global</span><b>→</b><span>Monthly</span><b>→</b><span>Main Menu</span></div></div>'
    },
    {
      id:'goal',duration:12,phases:1,
      caption:'The goal: match cards from the same family, capture scoring cards, reach 7 points, then choose GO or STOP.',
      render:()=>'<div class="tutorial-video-scene scene-goal"><div class="tutorial-video-logo small">The Goal</div><div class="tutorial-video-goal-row"><div class="tutorial-video-goal-step"><span>1</span><strong>Match families</strong></div><div class="tutorial-video-arrow">→</div><div class="tutorial-video-goal-step"><span>2</span><strong>Capture cards</strong></div><div class="tutorial-video-arrow">→</div><div class="tutorial-video-goal-step"><span>3</span><strong>Reach 7 points</strong></div><div class="tutorial-video-arrow">→</div><div class="tutorial-video-goal-step"><span>4</span><strong>GO or STOP</strong></div></div><p class="tutorial-video-subtitle">Cards match by family, not by scoring type.</p></div>'
    },
    {
      id:'family-rule',duration:10,phases:2,
      captions:[
        {until:.5,text:'Every card family has exactly four cards.'},
        {until:1,text:'These four Iris cards look different, but they all match each other because they are the same family.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-family-rule"><h2>Every family has 4 cards</h2><div class="tutorial-big-family"><strong>Iris</strong><div>'+miniCards(deck.filter(card=>card.month===5),'tutorial-family-card')+'</div></div></div>'
    },
    {
      id:'families',duration:20,phases:3,
      captions:[
        {until:.34,text:'GoStop Live! uses 12 easy family names instead of month numbers.'},
        {until:.67,text:'Each family contains four cards. Learn the picture family, and matching becomes much easier.'},
        {until:1,text:'Pine, Plum, Cherry, Vine, Iris, Rose, Bush, Hill, Daisy, Star, Berry, and Willow.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-families"><h2>The 12 card families</h2>'+familyGrid()+'</div>'
    },
    {
      id:'types',duration:26,phases:4,
      captions:[
        {until:.25,text:'Brights are the rarest high-value cards.'},
        {until:.5,text:'Pictures include animals, birds, and the Daisy Sake Cup.'},
        {until:.75,text:'Stripes include Red, Blue, Plain, and the Willow Stripe. Red, Blue, and Plain each have a 3-card scoring set.'},
        {until:1,text:'Singles are the most common cards. Berry and Willow include 2x Singles, and the Daisy Sake Cup can also count as 2 Singles when chosen that way.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-types"><h2>Four scoring card types</h2>'+allTypeGrid()+'</div>'
    },
    {
      id:'scoring',duration:44,phases:4,
      captions:[
        {until:.25,text:'Brights: 3 Brights with the Rain Bright = 2 points. 3 non-Rain Brights = 3 points. 4 Brights = 4 points. All 5 Brights = 15 points.'},
        {until:.5,text:'Pictures: collect all 3 bird Pictures for 5-BIRDIES! and a 5-point bonus. Any 5 Pictures = 1 point, then each additional Picture adds 1 more point.'},
        {until:.75,text:'Stripes: all 3 Red, all 3 Blue, or all 3 Plain Stripes = 3 points. Any 5 Stripes = 1 point, then each additional Stripe adds 1 more point.'},
        {until:1,text:'Singles: 10 Singles = 1 point, then each additional Single adds 1 more point. 2x Singles count as two Singles.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-scoring-detailed"><h2>How scoring combinations work</h2><div class="tutorial-scoring-catalog">'
        +'<article data-score-kind="bright"><h3>Brights</h3><div class="score-lines"><span>'+cardHtml('m1-1')+cardHtml('m3-1')+cardHtml('m12-1')+'<b>3 with Rain = 2 pts</b></span><span>'+cardHtml('m1-1')+cardHtml('m3-1')+cardHtml('m8-1')+'<b>3 no Rain = 3 pts</b></span><span><b>4 = 4 pts · 5 = 15 pts</b></span></div></article>'
        +'<article data-score-kind="picture"><h3>Pictures</h3><div class="score-lines"><span>'+cardHtml('m2-1')+cardHtml('m4-1')+cardHtml('m8-2')+'<b>5-BIRDIES! = +5 pts</b></span><span><b>5 Pictures = 1 pt · each extra +1</b></span></div></article>'
        +'<article data-score-kind="stripe"><h3>Stripes</h3><div class="score-lines"><span>'+cardHtml('m1-2')+cardHtml('m2-2')+cardHtml('m3-2')+'<b>3 same set = 3 pts</b></span><span><b>5 any Stripes = 1 pt · each extra +1</b></span></div></article>'
        +'<article data-score-kind="single"><h3>Singles</h3><div class="score-lines"><span>'+cardHtml('m11-3','2x')+cardHtml('m12-4','2x')+cardHtml('m9-1','Sake Cup')+'<b>Special 2x Singles</b></span><span><b>10 Singles = 1 pt · each extra +1</b></span></div></article>'
      +'</div></div>'
    },
    {
      id:'matching',duration:34,phases:6,
      captions:[
        {until:.17,text:'Start your turn by selecting a card from your hand.'},
        {until:.34,text:'Hit it onto a matching family card on the table. With one match, you capture both cards.'},
        {until:.51,text:'After your hand card resolves, GoStop Live! draws the top card from the draw pile.'},
        {until:.68,text:'If the drawn card matches a family on the table, it captures that matching card.'},
        {until:.84,text:'If the drawn card has no table match, the drawn card stays on the table.'},
        {until:1,text:'If two table cards match your played or drawn card, choose which highlighted target to capture.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-matching-full"><h2>Matching: play, then draw</h2><div class="tutorial-match-table"><div class="tutorial-match-deck">'+cardBack()+'</div><div class="tutorial-match-floor">'+cardHtml('m5-4')+cardHtml('m10-3')+cardHtml('m8-1')+cardHtml('m8-2')+'</div><div class="tutorial-match-captured"><strong>Captured</strong></div></div><div class="tutorial-match-hand">'+cardHtml('m5-3')+cardHtml('m6-3')+cardHtml('m8-3')+'</div><div class="tutorial-match-moving hand-play">'+cardHtml('m5-3')+'</div><div class="tutorial-match-moving deck-play">'+cardHtml('m10-4')+'</div><div class="tutorial-match-moving no-match-play">'+cardHtml('m7-3')+'</div></div>'
    },
    {
      id:'gostop',duration:30,phases:5,
      captions:[
        {until:.2,text:'In a 2-player game, reaching 7 points gives you a choice: GO or STOP.'},
        {until:.4,text:'STOP ends the hand now and you take the points you have earned.'},
        {until:.6,text:'GO continues the game. 1 GO adds +1 point. 2 GO means +2 points total.'},
        {until:.8,text:'From 3 GO onward, your score doubles. Each additional GO doubles it again.'},
        {until:1,text:'Going is risky: if you lose after declaring GO, the opponent gets a GO penalty multiplier and their winning settlement is doubled.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-gostop-detailed"><h2>GO or STOP</h2><div class="tutorial-video-scoreburst">7 <small>POINTS</small></div><div class="tutorial-video-decision"><button tabindex="-1" class="tutorial-video-go">GO</button><button tabindex="-1" class="tutorial-video-stop">STOP</button></div><div class="tutorial-go-track"><span>STOP<br><b>Take your points</b></span><span>1 GO<br><b>+1</b></span><span>2 GO<br><b>+2 total</b></span><span>3 GO<br><b>×2</b></span><span>4 GO<br><b>×4</b></span></div><div class="tutorial-go-risk">Lose after GO → opponent settlement ×2</div></div>'
    },
    {
      id:'specials',duration:42,phases:6,
      captions:[
        {until:.17,text:'SHAKE: if you hold 3 cards from the same family, you can reveal them to your opponent. A normal Shake doubles your final settlement if you win.'},
        {until:.34,text:'BOMB: keep those 3 family cards hidden. When the 4th card is on the table, play all 3 together, capture the family, and steal 1 Single from your opponent.'},
        {until:.51,text:'POOPED! (뻑): your played card matches one table card and the draw is the same family. The 3-card stack stays on the table. Capturing it later steals 1 Single.'},
        {until:.68,text:'KISS! (쪽): your played card has no match, then the draw pile gives the matching family. Capture the pair and steal 1 Single.'},
        {until:.84,text:'FLUSH! (따닥): two family cards are on the table, you play the third, and the deck draws the fourth. Capture all four and steal 1 Single.'},
        {until:1,text:'CLEAN SWEEP! (싹쓸이): a capture clears the live table. You also steal 1 Single from your opponent when available.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-specials-detailed"><h2>Special Plays</h2><div class="tutorial-special-stage">'
        +'<article data-special="shake"><h3>SHAKE</h3><div>'+cardHtml('m1-1')+cardHtml('m1-2')+cardHtml('m1-3')+'</div><strong>Reveal 3 · normal win ×2</strong></article>'
        +'<article data-special="bomb"><h3>BOMB</h3><div>'+cardHtml('m2-1')+cardHtml('m2-2')+cardHtml('m2-3')+cardHtml('m2-4')+'</div><strong>Capture all 4 · steal 1 Single</strong></article>'
        +'<article data-special="pooped"><h3>POOPED!</h3><div>'+cardHtml('m3-2')+cardHtml('m3-3')+cardHtml('m3-4')+'</div><strong>Stack 3 · later steal 1 Single</strong></article>'
        +'<article data-special="kiss"><h3>KISS!</h3><div>'+cardHtml('m6-3')+cardHtml('m6-4')+'</div><strong>Play + draw match · steal 1 Single</strong></article>'
        +'<article data-special="flush"><h3>FLUSH!</h3><div>'+cardHtml('m8-1')+cardHtml('m8-2')+cardHtml('m8-3')+cardHtml('m8-4')+'</div><strong>Capture all 4 · steal 1 Single</strong></article>'
        +'<article data-special="sweep"><h3>CLEAN SWEEP!</h3><div class="tutorial-broom">🧹</div><strong>Clear the table · steal 1 Single</strong></article>'
      +'</div></div>'
    },
    {
      id:'full-rules',duration:10,phases:2,
      captions:[
        {until:.5,text:'You do not need to memorize every rule before you start playing.'},
        {until:1,text:'Tap Full Rules below the video any time you want the complete rules in text format.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-full-rules"><div class="tutorial-rulebook">FULL<br>RULES</div><h2>Need a rule later?</h2><p>Full Rules keeps the complete written reference one tap away.</p></div>'
    },
    {
      id:'training',duration:16,phases:3,
      captions:[
        {until:.34,text:'Best first game: Training Mode.'},
        {until:.67,text:'Play against AI while GoStop Live! highlights a recommended card and table target.'},
        {until:1,text:'Training Mode explains why the move is recommended and teaches special rules as they happen.'}
      ],
      render:()=>'<div class="tutorial-video-scene scene-training"><h2>Best First Game: Training Mode</h2>'+compactGameMock('desktop')+'<div class="tutorial-training-coach"><strong>RECOMMENDED MOVE</strong><span>Play Iris Single onto Iris Single.</span><small>Highlighted cards show exactly what to play.</small></div></div>'
    },
    {
      id:'fun',duration:7,phases:1,
      caption:'Have fun playing GoStop Live!',
      render:()=>'<div class="tutorial-video-scene scene-fun"><div class="tutorial-video-logo">GoStop <em>Live!</em></div><strong>Have Fun!</strong><div class="tutorial-card-fan end">'+miniCards(['m1-1','m3-1','m8-1','m11-1','m12-1'].map(cardById).filter(Boolean),'tutorial-fan-card')+'</div></div>'
    }
  ];

  const total=scenes.reduce((sum,scene)=>sum+scene.duration,0);
  const starts=[];let running=0;
  for(const scene of scenes){starts.push(running);running+=scene.duration;}

  let time=0;
  let playing=false;
  let lastFrame=0;
  let frame=0;
  let sceneIndex=-1;
  let returnFromRules=false;

  const sceneAt=value=>{
    const clamped=Math.max(0,Math.min(Math.max(0,total-.001),value));
    let index=scenes.length-1;
    for(let i=0;i<scenes.length;i++){
      if(clamped<starts[i]+scenes[i].duration){index=i;break;}
    }
    return {index,scene:scenes[index],local:clamped-starts[index]};
  };

  const updateSceneDetails=(scene,phase)=>{
    if(scene.id==='game-info'){
      const titles=['Player Info','Score Breakdown','Captured Cards','Status','Game Controls'];
      const copies=['Nickname · session · Coins · status','Brights · Pictures · Stripes · Singles','Tap to inspect every captured card','GO count · multipliers · active status','How to Play · Quit Game'];
      const title=stage.querySelector('[data-info-title]'),copy=stage.querySelector('[data-info-copy]');
      if(title)title.textContent=titles[Math.min(phase,titles.length-1)];
      if(copy)copy.textContent=copies[Math.min(phase,copies.length-1)];
    }
    if(scene.id==='modes'){
      const notes=['TRAINING MODE','FRIENDLY SOLO','PLAY WITH FRIEND','COMPETITIVE SOLO','COMPETITIVE ONLINE'];
      const node=stage.querySelector('[data-mode-note]');
      if(node)node.textContent=notes[Math.min(phase,notes.length-1)];
    }
    if(scene.id==='leaderboards'){
      const title=stage.querySelector('[data-board-title]');
      if(title)title.textContent=phase===1?'Monthly Leaderboard':'Global Leaderboard';
    }
  };

  const renderScene=(index,local=0,force=false)=>{
    const scene=scenes[index];
    if(!scene)return;
    if(force||index!==sceneIndex){
      sceneIndex=index;
      stage.innerHTML=scene.render();
      stage.dataset.scene=scene.id;
    }
    const p=Math.max(0,Math.min(1,local/scene.duration));
    const phases=Math.max(1,scene.phases||1);
    const phase=Math.min(phases-1,Math.floor(p*phases));
    stage.dataset.phase=String(phase);
    stage.style.setProperty('--tutorial-progress',String(p));
    caption.textContent=sceneCaption(scene,p);
    updateSceneDetails(scene,phase);
  };

  const sync=force=>{
    const point=sceneAt(time);
    renderScene(point.index,point.local,force);
  };

  const tick=stamp=>{
    if(!playing)return;
    if(!lastFrame)lastFrame=stamp;
    const delta=Math.min(.25,(stamp-lastFrame)/1000);
    lastFrame=stamp;
    time+=delta;
    if(time>=total){
      time=Math.max(0,total-.001);
      playing=false;
      lastFrame=0;
      sync(true);
      return;
    }
    sync(false);
    frame=requestAnimationFrame(tick);
  };

  const play=()=>{
    if(playing)return;
    if(time>=total-.01)time=0;
    playing=true;
    lastFrame=0;
    sync(false);
    frame=requestAnimationFrame(tick);
  };

  const pause=()=>{
    playing=false;
    lastFrame=0;
    if(frame)cancelAnimationFrame(frame);
  };

  const showRules=()=>{
    pause();
    returnFromRules=true;
    view.hidden=true;
    if(nav)nav.hidden=false;
    if(sections)sections.hidden=false;
    sections?.scrollTo?.({top:0,behavior:'instant'});
  };

  const showVideo=(restart=false)=>{
    if(nav)nav.hidden=true;
    if(sections)sections.hidden=true;
    view.hidden=false;
    if(restart){time=0;sceneIndex=-1;}
    sync(true);
    if(returnFromRules)returnFromRules=false;
  };

  const back=document.createElement('button');
  back.type='button';
  back.className='tutorial-video-back-rules';
  back.textContent='← Tutorial Video';
  back.addEventListener('click',()=>{showVideo(false);play();});
  nav?.prepend(back);

  rulesBtn?.addEventListener('click',showRules);
  trainingBtn?.addEventListener('click',()=>{
    pause();
    try{dialog.close();}catch(_){}
    setTimeout(()=>document.getElementById('trainingModeBtn')?.click(),0);
  });

  const openTutorial=()=>{
    showVideo(true);
    setTimeout(play,120);
  };

  document.getElementById('howToBtn')?.addEventListener('click',openTutorial);
  document.getElementById('railHowTo')?.addEventListener('click',openTutorial);

  dialog.addEventListener('close',()=>{pause();showVideo(false);});
  dialog.addEventListener('cancel',pause);

  showVideo(true);
})();