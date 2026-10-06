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
  const deck=globalThis.GoStopEngine?.masterDeck||[];
  const commons='https://commons.wikimedia.org/wiki/Special:Redirect/file/';
  const familyNames={1:'Pine',2:'Plum',3:'Cherry',4:'Vine',5:'Iris',6:'Rose',7:'Bush',8:'Hill',9:'Daisy',10:'Star',11:'Berry',12:'Willow'};

  let playing=false,frame=0,last=0,time=0,sceneIndex=-1,sceneLocal=0;
  let pcFrame=null,mobileFrame=null,menuFrame=null,keepAliveTimer=0;
  let voiceEnabled=true,lastSpokenKey='',returnFromRules=false;

  const card=id=>deck.find(c=>c.id===id);
  const art=c=>c?commons+encodeURIComponent(c.file).replace(/%2F/g,'/'):'';
  const cardImg=(id,label='')=>{
    const c=card(id); if(!c)return '';
    return '<figure class="film-card"><img src="'+art(c)+'" alt="'+(label||familyNames[c.month]+' card')+'">'+(label?'<figcaption>'+label+'</figcaption>':'')+'</figure>';
  };
  const allFamilyCards=month=>deck.filter(c=>c.month===month).map(c=>cardImg(c.id)).join('');
  const cardsBy=fn=>deck.filter(fn).map(c=>cardImg(c.id)).join('');

  const speak=(key,text)=>{
    if(!voiceEnabled||!text||!globalThis.speechSynthesis||typeof SpeechSynthesisUtterance!=='function'||lastSpokenKey===key)return;
    lastSpokenKey=key;
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      const voices=speechSynthesis.getVoices?.()||[];
      u.voice=voices.find(v=>/^en-US/i.test(v.lang)&&/Samantha|Ava|Jenny|Google US English|Microsoft/i.test(v.name))
        ||voices.find(v=>/^en-US/i.test(v.lang))
        ||voices.find(v=>/^en/i.test(v.lang))
        ||null;
      u.rate=.98;u.pitch=1;u.volume=.92;
      speechSynthesis.speak(u);
    }catch(_){}
  };

  const filmUrl=()=>{
    const url=new URL(location.pathname,location.origin);
    url.searchParams.set('tutorialFootage','1');
    return url.href;
  };

  const makeFrame=(kind)=>{
    const wrap=document.createElement('div');
    wrap.className='film-live-wrap '+kind;
    const iframe=document.createElement('iframe');
    iframe.className='film-live-frame';
    iframe.title=kind==='mobile'?'GoStop Live mobile gameplay footage':'GoStop Live gameplay footage';
    iframe.src=filmUrl();
    iframe.setAttribute('aria-hidden','true');
    wrap.appendChild(iframe);
    return {wrap,iframe,ready:new Promise(resolve=>{
      iframe.addEventListener('load',()=>setTimeout(()=>resolve(iframe),450),{once:true});
    })};
  };

  const ensureFrames=()=>{
    if(pcFrame)return;
    pcFrame=makeFrame('pc');
    mobileFrame=makeFrame('mobile');
    menuFrame=makeFrame('menu');
    const parking=document.createElement('div');
    parking.className='film-frame-parking';
    parking.append(pcFrame.wrap,mobileFrame.wrap,menuFrame.wrap);
    document.body.appendChild(parking);
    keepAliveTimer=setInterval(()=>{
      for(const item of [pcFrame,mobileFrame,menuFrame]){
        try{
          item.iframe.contentWindow?.document?.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:4,clientY:4}));
        }catch(_){}
      }
    },2500);
    void prepareTraining(pcFrame);
    void prepareTraining(mobileFrame);
  };

  const getDoc=item=>{
    try{return item?.iframe?.contentDocument||null;}catch(_){return null;}
  };

  const clickIn=(item,selector)=>{
    const el=getDoc(item)?.querySelector(selector);
    if(el){el.click();return el;}
    return null;
  };

  const waitFor=async(item,selector,timeout=12000)=>{
    await item.ready.catch(()=>{});
    const start=Date.now();
    while(Date.now()-start<timeout){
      const el=getDoc(item)?.querySelector(selector);
      if(el)return el;
      await new Promise(r=>setTimeout(r,180));
    }
    return null;
  };

  const prepareTraining=async item=>{
    await item.ready;
    try{
      const d=getDoc(item);
      if(!d)return;
      d.documentElement.classList.add('tutorial-footage-document');
      d.body?.classList.add('tutorial-footage-body');
      d.querySelectorAll('dialog[open]').forEach(node=>{try{node.close();}catch(_){ }});
      d.querySelector('#returnGameNo')?.click();
      d.querySelector('#trainingModeBtn')?.click();
      await waitFor(item,'#playerHand .hand-card',16000);
    }catch(_){}
  };

  const mountLiveFrame=item=>{
    stage.replaceChildren();
    stage.className='tutorial-video-stage film-stage live';
    item.wrap.classList.remove('film-parked');
    stage.appendChild(item.wrap);
    requestAnimationFrame(()=>item.wrap.classList.add('show'));
    return item;
  };

  const parkLiveFrames=()=>{
    const parking=document.querySelector('.film-frame-parking');
    if(!parking)return;
    for(const item of [pcFrame,mobileFrame,menuFrame]){
      if(item?.wrap.parentNode!==parking){
        item.wrap.classList.remove('show');
        parking.appendChild(item.wrap);
      }
    }
  };

  const showGraphic=html=>{
    parkLiveFrames();
    stage.className='tutorial-video-stage film-stage graphic';
    stage.innerHTML='<div class="film-graphic">'+html+'</div>';
  };

  const overlay=()=>{
    let node=stage.querySelector('.film-overlay-layer');
    if(!node){node=document.createElement('div');node.className='film-overlay-layer';stage.appendChild(node);}
    return node;
  };

  const pointerNode=(kind='mouse')=>{
    const layer=overlay();
    let node=layer.querySelector('.film-gesture');
    if(!node){node=document.createElement('div');node.className='film-gesture';layer.appendChild(node);}
    node.className='film-gesture '+kind;
    node.textContent=kind==='finger'?'☝':'';
    return node;
  };

  const rectInStage=(item,el)=>{
    const fr=item.iframe.getBoundingClientRect(),sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
    const sx=fr.width/Math.max(1,item.iframe.clientWidth), sy=fr.height/Math.max(1,item.iframe.clientHeight);
    return {
      x:(fr.left-sr.left)+(r.left+r.width/2)*sx,
      y:(fr.top-sr.top)+(r.top+r.height/2)*sy,
      w:r.width*sx,h:r.height*sy
    };
  };

  const moveGesture=(item,selector,{kind='mouse',dy=0,click=false}={})=>{
    const d=getDoc(item),el=d?.querySelector(selector); if(!el)return null;
    const p=rectInStage(item,el),node=pointerNode(kind);
    node.style.setProperty('--gx',p.x+'px');
    node.style.setProperty('--gy',(p.y+dy)+'px');
    node.classList.toggle('press',!!click);
    return el;
  };

  const closeDialogs=item=>{
    try{
      const d=getDoc(item);
      d?.querySelectorAll('dialog[open]').forEach(x=>{try{x.close();}catch(_){ }});
      d?.querySelector('#playerInfoOverlay:not([hidden])')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    }catch(_){}
  };

  const pcAction=async phase=>{
    mountLiveFrame(pcFrame);
    await pcFrame.ready;
    const handSel='#playerHand .hand-card:not(:disabled)';
    if(phase===0){moveGesture(pcFrame,handSel,{kind:'mouse'});}
    if(phase===1){
      const el=moveGesture(pcFrame,handSel,{kind:'mouse',click:true});el?.click();
      setTimeout(()=>pointerNode('mouse').classList.remove('press'),240);
    }
    if(phase===2){
      const el=moveGesture(pcFrame,handSel,{kind:'mouse',click:true});el?.click();
      setTimeout(()=>pointerNode('mouse').classList.remove('press'),240);
    }
    if(phase===3){
      moveGesture(pcFrame,'.human-chip[data-player-info],.human-chip',{kind:'mouse',click:true});
      clickIn(pcFrame,'.human-chip[data-player-info],.human-chip');
    }
    if(phase===4){
      closeDialogs(pcFrame);
      moveGesture(pcFrame,'.human-chip .score-pill',{kind:'mouse',click:true});
      clickIn(pcFrame,'.human-chip .score-pill');
    }
    if(phase===5){
      closeDialogs(pcFrame);
      moveGesture(pcFrame,'.game-capture-panel',{kind:'mouse',click:true});
      clickIn(pcFrame,'.game-capture-panel');
    }
  };

  const mobileAction=async phase=>{
    mountLiveFrame(mobileFrame);
    await mobileFrame.ready;
    const handSel='#playerHand .hand-card:not(:disabled)';
    if(phase===0){moveGesture(mobileFrame,handSel,{kind:'finger'});}
    if(phase===1){
      const el=moveGesture(mobileFrame,handSel,{kind:'finger',click:true});el?.click();
      setTimeout(()=>pointerNode('finger').classList.remove('press'),240);
    }
    if(phase===2){
      const el=moveGesture(mobileFrame,handSel,{kind:'finger',click:true});el?.click();
      setTimeout(()=>pointerNode('finger').classList.remove('press'),240);
    }
    if(phase===3){
      const el=moveGesture(mobileFrame,handSel,{kind:'finger'});
      if(el){
        const p=rectInStage(mobileFrame,el),node=pointerNode('finger');
        node.style.setProperty('--gx',p.x+'px');node.style.setProperty('--gy',p.y+'px');
        node.classList.add('swipe-up');
        setTimeout(()=>{el.click();setTimeout(()=>el.click(),260);},520);
      }
    }
  };

  const menuAction=async phase=>{
    mountLiveFrame(menuFrame);
    await menuFrame.ready;
    closeDialogs(menuFrame);
    const d=getDoc(menuFrame); if(!d)return;
    if(phase===0){moveGesture(menuFrame,'#friendlyGamingBtn',{kind:'mouse',click:true});d.querySelector('#friendlyGamingBtn')?.click();}
    if(phase===1){moveGesture(menuFrame,'#trainingModeBtn',{kind:'mouse'});}
    if(phase===2){moveGesture(menuFrame,'#freeFriendBtn',{kind:'mouse'});}
    if(phase===3){moveGesture(menuFrame,'#competitiveGamingBtn',{kind:'mouse',click:true});d.querySelector('#competitiveGamingBtn')?.click();}
    if(phase===4){moveGesture(menuFrame,'#rankedSoloBtn',{kind:'mouse'});}
    if(phase===5){moveGesture(menuFrame,'#onlinePlayMenuBtn',{kind:'mouse'});}
    if(phase===6){moveGesture(menuFrame,'#friendsMenuBtn',{kind:'mouse'});}
    if(phase===7){
      moveGesture(menuFrame,'#leaderboardMenuBtn',{kind:'mouse',click:true});
      d.querySelector('#leaderboardMenuBtn')?.click();
    }
  };

  const familiesHtml=()=>'<div class="film-card-grid families">'+Array.from({length:12},(_,i)=>{
    const month=i+1; return '<section><h3>'+familyNames[month]+'</h3><div>'+allFamilyCards(month)+'</div></section>';
  }).join('')+'</div>';

  const typesHtml=()=>{
    const bright=cardsBy(c=>c.type==='bright');
    const picture=cardsBy(c=>c.type==='animal');
    const red=cardsBy(c=>c.type==='ribbon'&&c.ribbonSet==='red');
    const blue=cardsBy(c=>c.type==='ribbon'&&c.ribbonSet==='blue');
    const plain=cardsBy(c=>c.type==='ribbon'&&c.ribbonSet==='grass');
    const other=cardsBy(c=>c.type==='ribbon'&&!c.ribbonSet);
    const singles=cardsBy(c=>c.type==='pi');
    return '<div class="film-type-grid">'
      +'<section><h3>Brights</h3><div>'+bright+'</div></section>'
      +'<section><h3>Pictures</h3><div>'+picture+'</div></section>'
      +'<section class="stripes"><h3>Stripes</h3><div class="stripe-set"><b>Red</b>'+red+'</div><div class="stripe-set"><b>Blue</b>'+blue+'</div><div class="stripe-set"><b>Plain</b>'+plain+'</div><div class="stripe-set"><b>Willow</b>'+other+'</div></section>'
      +'<section><h3>Singles</h3><div>'+singles+'</div></section>'
      +'</div>';
  };

  const scoringHtml=phase=>{
    const blocks=[
      '<section><h2>Brights</h2><div class="film-score-row">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m12-1')+'<strong>3 with Rain Bright = 2 points</strong></div><div class="film-score-row">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m8-1')+'<strong>3 non-Rain Brights = 3 points</strong></div><p>4 Brights = 4 points · All 5 Brights = 15 points</p></section>',
      '<section><h2>Pictures</h2><div class="film-score-row">'+cardImg('m2-1')+cardImg('m4-1')+cardImg('m8-2')+'<strong>5-BIRDIES! = 5 points</strong></div><p>Any 5 Pictures = 1 point · Each additional Picture +1</p></section>',
      '<section><h2>Stripes</h2><div class="film-score-row">'+cardImg('m1-2')+cardImg('m2-2')+cardImg('m3-2')+'<strong>3 matching-set Stripes = 3 points</strong></div><p>Any 5 Stripes = 1 point · Each additional Stripe +1</p></section>',
      '<section><h2>Singles</h2><div class="film-score-row">'+cardImg('m11-3','2x Single')+cardImg('m12-4','2x Single')+cardImg('m9-1','Sake Cup')+'</div><p>10 Singles = 1 point · Each additional Single +1</p></section>'
    ];
    return '<div class="film-score-focus">'+blocks[Math.min(phase,3)]+'</div>';
  };

  const specialHtml=phase=>{
    const items=[
      ['SHAKE',cardImg('m1-1')+cardImg('m1-2')+cardImg('m1-3'),'Reveal 3 cards from one family. A normal Shake doubles your final settlement if you win.'],
      ['BOMB',cardImg('m2-1')+cardImg('m2-2')+cardImg('m2-3')+cardImg('m2-4'),'Keep 3 hidden. When the 4th is on the table, Bomb captures all four and steals 1 Single.'],
      ['POOPED! (뻑)',cardImg('m3-2')+cardImg('m3-3')+cardImg('m3-4'),'Play + table + draw are the same family. The 3-card stack stays. Capturing it later steals 1 Single.'],
      ['KISS! (쪽)',cardImg('m6-3')+cardImg('m6-4'),'Your played card has no match, then the draw matches it. Capture the pair and steal 1 Single.'],
      ['FLUSH! (따닥)',cardImg('m8-1')+cardImg('m8-2')+cardImg('m8-3')+cardImg('m8-4'),'Two are on the table, you play the third, and draw the fourth. Capture all four and steal 1 Single.'],
      ['CLEAN SWEEP! (싹쓸이)','<div class="film-sweep">🧹</div>','A capture clears the live table. Steal 1 Single from your opponent when available.']
    ];
    const item=items[Math.min(phase,items.length-1)];
    return '<div class="film-special-focus"><h2>'+item[0]+'</h2><div class="film-special-cards">'+item[1]+'</div><p>'+item[2]+'</p></div>';
  };

  const scenes=[
    {id:'welcome',duration:7,caption:'Welcome to GoStop Live!',voice:'Welcome to GoStop Live!',render:()=>showGraphic('<div class="film-logo">GoStop <em>Live!</em></div><div class="film-opening-cards">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m8-1')+cardImg('m12-1')+'</div><h2>Welcome!</h2>')},
    {id:'world',duration:11,caption:'Play GoStop with friends or other players around the world, on PC or mobile.',voice:'GoStop Live lets anyone around the world play GoStop together, with friends or other players, on a computer or on a phone.',render:()=>showGraphic('<div class="film-logo small">GoStop <em>Live!</em></div><div class="film-world"><span>Chicago</span><i></i><span>Seoul</span><i></i><span>Tokyo</span><i></i><span>Anywhere</span></div><div class="film-devices"><b>PC</b><strong>↔</strong><b>Mobile</b></div>')},
    {id:'pc',duration:28,steps:6,captions:[
      'This is the actual GoStop Live! game on PC / Mac.',
      'Move to a card and click once. The card is selected and lifts from your hand.',
      'Click the selected card again to hit it onto the table.',
      'Click a player area to see player information.',
      'Click the score to see exactly how the points are calculated.',
      'Click the captured-card area to inspect all captured cards and scoring groups.'
    ],voices:[
      'This is the actual GoStop Live game on a computer.',
      'Move to a card and click once. The card lifts from your hand to show that it is selected.',
      'Click that selected card again to play it onto the table.',
      'Click a player area to see player information.',
      'Click the score to see exactly how the points are calculated.',
      'Click the captured card area to inspect all captured cards and scoring groups.'
    ],render:phase=>pcAction(phase)},
    {id:'mobile',duration:24,steps:4,captions:[
      'On mobile, tap a card once to select it.',
      'Tap the selected card again to play it.',
      'When a table target is highlighted, tap the target you want.',
      'Or press the card and flick upward. Watch the finger travel upward with the card.'
    ],voices:[
      'On mobile, tap a card once to select it.',
      'Tap that card again to play it.',
      'When there is a choice, tap the highlighted table target you want.',
      'Or press the card and flick upward. The finger and card move upward together, then the card is played.'
    ],render:phase=>mobileAction(phase)},
    {id:'modes',duration:34,steps:8,captions:[
      'Back on the real Main Menu: Friendly Gaming is for casual play with no Coins or ranking.',
      'Training Mode lets you practice against AI while the game teaches you.',
      'Play With Friend creates a room link that you can send to a friend.',
      'Competitive Gaming is where Coins and rankings matter.',
      'Competitive Solo Play lets you play the computer AI for Coins.',
      'Competitive Online Play lets you play other people for Coins and global ranking.',
      'Friends and player discovery help you reconnect, search, or get recommended opponents.',
      'Leaderboards show All-Time Global and This Month. Leaving the Main Menu untouched also starts Attract Mode.'
    ],voices:[
      'Back on the real main menu. Friendly Gaming is casual play with no Coins or ranking.',
      'Training Mode lets you practice against the computer while the game teaches you.',
      'Play With Friend creates a room link that you can send to someone else.',
      'Competitive Gaming is where Coins and rankings matter.',
      'Competitive Solo Play lets you play the computer for Coins.',
      'Competitive Online Play lets you play other people for Coins and global ranking.',
      'Friends and player discovery help you reconnect, search, or get recommended opponents.',
      'Leaderboards show the all time global ranking and this month. If you leave the main menu untouched, Attract Mode cycles through the leaderboards automatically.'
    ],render:phase=>menuAction(phase)},
    {id:'goal',duration:11,caption:'The goal: match families, capture scoring cards, reach 7 points, then choose GO or STOP.',voice:'Now let’s learn how GoStop is played. Match cards from the same family, capture scoring cards, reach seven points, then choose Go or Stop.',render:()=>showGraphic('<h2>How to Play GoStop</h2><div class="film-goal-flow"><span>Match Families</span><b>→</b><span>Capture Cards</span><b>→</b><span>Reach 7 Points</span><b>→</b><span>GO or STOP</span></div>')},
    {id:'family4',duration:10,caption:'Every family has exactly 4 cards. Cards match by family, not by scoring type.',voice:'Every family has exactly four cards. Cards match by family, not by scoring type.',render:()=>showGraphic('<h2>Every family has 4 cards</h2><div class="film-one-family"><h3>Iris</h3>'+allFamilyCards(5)+'</div>')},
    {id:'families',duration:22,caption:'These are the 12 families. Each group contains its 4 matching cards.',voice:'These are the twelve families used in GoStop Live. Each group contains four matching cards.',render:()=>showGraphic('<h2>The 12 Families</h2>'+familiesHtml())},
    {id:'types',duration:28,caption:'The same 48 cards also belong to scoring types: Brights, Pictures, Stripes, and Singles.',voice:'The same forty eight cards also belong to scoring types: Brights, Pictures, Stripes, and Singles. Stripes include Red, Blue, Plain, and the Willow Stripe.',render:()=>showGraphic('<h2>Card Types</h2>'+typesHtml())},
    {id:'scoring',duration:40,steps:4,captions:[
      'Brights: 3 with the Rain Bright = 2 points. 3 non-Rain Brights = 3. 4 = 4. All 5 = 15.',
      'Pictures: 5-BIRDIES! is 5 points. Any 5 Pictures = 1 point, then each additional Picture adds 1.',
      'Stripes: 3 Red, 3 Blue, or 3 Plain = 3 points. Any 5 Stripes = 1 point, then each additional Stripe adds 1.',
      'Singles: 10 Singles = 1 point, then each additional Single adds 1. 2x Singles count as two.'
    ],voices:[
      'For Brights, three Brights with the Rain Bright score two points. Three non Rain Brights score three. Four Brights score four, and all five Brights score fifteen.',
      'For Pictures, five Birdies scores five points. Any five Pictures score one point, and every Picture after that adds one more point.',
      'For Stripes, three Red, three Blue, or three Plain Stripes score three points. Any five Stripes score one point, and every extra Stripe adds one.',
      'For Singles, ten Singles score one point, and every Single after that adds one more point. Two times Single cards count as two Singles.'
    ],render:phase=>showGraphic(scoringHtml(phase))},
    {id:'matching',duration:22,steps:3,captions:[
      'A turn starts by playing one card from your hand onto a matching family on the table.',
      'After the hand card resolves, the top card is drawn from the draw pile and matched the same way.',
      'If the drawn card has no match, it stays on the table. If two matches exist, you choose the highlighted target.'
    ],voices:[
      'A turn starts by playing one card from your hand onto a matching family on the table.',
      'After that card resolves, the top card is drawn from the draw pile and matched the same way.',
      'If the drawn card has no match, it stays on the table. If there are two matches, you choose the highlighted target.'
    ],render:phase=>{mountLiveFrame(pcFrame);pcAction(Math.min(phase+1,2));}},
    {id:'gostop',duration:28,steps:5,captions:[
      'At 7 points in a 2-player game, you choose GO or STOP.',
      'STOP ends the hand and you take the points you have.',
      '1 GO adds +1 point. 2 GO means +2 points total.',
      'From the 3rd GO onward, your score doubles: 3 GO ×2, 4 GO ×4, and so on.',
      'If you lose after declaring GO, your opponent receives the GO penalty multiplier and the winning settlement is doubled.'
    ],voices:[
      'At seven points in a two player game, you choose Go or Stop.',
      'Stop ends the hand and you take the points you have.',
      'One Go adds one point. Two Go means two extra points total.',
      'From the third Go onward, your score doubles. Three Go is times two, four Go is times four, and so on.',
      'Going is risky. If you lose after declaring Go, your opponent receives the Go penalty multiplier and the winning settlement is doubled.'
    ],render:phase=>showGraphic('<div class="film-gostop"><div class="film-seven">7<small>POINTS</small></div><div class="film-choice"><b>GO</b><b>STOP</b></div><div class="film-go-line"><span class="'+(phase===1?'on':'')+'">STOP<br><small>Take your points</small></span><span class="'+(phase===2?'on':'')+'">1 GO<br><small>+1</small></span><span class="'+(phase===2?'on':'')+'">2 GO<br><small>+2 total</small></span><span class="'+(phase===3?'on':'')+'">3 GO<br><small>×2</small></span><span class="'+(phase===3?'on':'')+'">4 GO<br><small>×4</small></span></div><p class="'+(phase===4?'risk on':'risk')+'">Lose after GO → opponent winning settlement ×2</p></div>')},
    {id:'specials',duration:42,steps:6,captions:[
      'SHAKE: reveal 3 cards from the same family. A normal Shake doubles your final settlement if you win.',
      'BOMB: keep the 3 cards hidden. When the 4th is on the table, capture all four and steal 1 Single.',
      'POOPED! (뻑): played card + table card + drawn card are the same family. Capture the stack later and steal 1 Single.',
      'KISS! (쪽): your played card has no match, then the draw matches it. Capture the pair and steal 1 Single.',
      'FLUSH! (따닥): two are on the table, you play the third, and draw the fourth. Capture all four and steal 1 Single.',
      'CLEAN SWEEP! (싹쓸이): clear the live table with a capture and steal 1 Single when available.'
    ],voices:[
      'Shake. Reveal three cards from the same family. A normal Shake doubles your final settlement if you win.',
      'Bomb. Keep the three cards hidden. When the fourth card is on the table, capture all four and steal one Single.',
      'Pooped. Your played card, the table card, and the drawn card are the same family. Capture that stack later and steal one Single.',
      'Kiss. Your played card has no match, then the draw matches it. Capture the pair and steal one Single.',
      'Flush. Two family cards are on the table, you play the third, and draw the fourth. Capture all four and steal one Single.',
      'Clean Sweep. Clear the live table with a capture and steal one Single when available.'
    ],render:phase=>showGraphic(specialHtml(phase))},
    {id:'rules',duration:9,caption:'Need details later? Full Rules below the video keeps the complete written rule reference.',voice:'You do not need to memorize everything now. Full Rules below the video keeps the complete written rule reference available whenever you need it.',render:()=>showGraphic('<div class="film-rulebook">FULL<br>RULES</div><h2>Complete rules are always available below</h2>')},
    {id:'training',duration:14,caption:'Best first game: Training Mode. Practice against AI while GoStop Live! teaches you what to play and why.',voice:'The best first game is Training Mode. Practice against the computer while GoStop Live teaches you what to play, what to target, and why.',render:()=>{mountLiveFrame(pcFrame);overlay().innerHTML='<div class="film-training-banner"><strong>Best First Game: Training Mode</strong><span>Practice with AI guidance while you play.</span></div>';}},
    {id:'fun',duration:7,caption:'Have fun playing GoStop Live!',voice:'Have fun playing GoStop Live!',render:()=>showGraphic('<div class="film-logo">GoStop <em>Live!</em></div><h1>Have Fun!</h1><div class="film-opening-cards end">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m8-1')+cardImg('m11-1')+cardImg('m12-1')+'</div>')}
  ];

  const starts=[];let total=0;
  for(const scene of scenes){starts.push(total);total+=scene.duration;}

  const locate=t=>{
    const clamped=Math.max(0,Math.min(total-.001,t));
    let i=scenes.length-1;
    for(let n=0;n<scenes.length;n++){if(clamped<starts[n]+scenes[n].duration){i=n;break;}}
    const scene=scenes[i],local=clamped-starts[i],p=local/scene.duration;
    const steps=Math.max(1,scene.steps||1),phase=Math.min(steps-1,Math.floor(p*steps));
    return {i,scene,local,p,phase};
  };

  const renderAt=(t,force=false)=>{
    const x=locate(t),changed=force||x.i!==sceneIndex;
    if(changed){sceneIndex=x.i;sceneLocal=x.local;lastSpokenKey='';}
    const cap=x.scene.captions?.[x.phase]||x.scene.caption||'';
    caption.textContent=cap;
    if(changed||stage.dataset.phase!==String(x.phase)){
      stage.dataset.scene=x.scene.id;stage.dataset.phase=String(x.phase);
      x.scene.render?.(x.phase,x.p);
      speak(x.scene.id+':'+x.phase,x.scene.voices?.[x.phase]||x.scene.voice||cap);
    }
  };

  const tick=stamp=>{
    if(!playing)return;
    if(!last)last=stamp;
    time+=Math.min(.25,(stamp-last)/1000);last=stamp;
    if(time>=total){time=total-.001;playing=false;renderAt(time,true);return;}
    renderAt(time,false);frame=requestAnimationFrame(tick);
  };

  const play=()=>{
    ensureFrames();
    if(time>=total-.01)time=0;
    if(playing)return;
    playing=true;last=0;renderAt(time,true);frame=requestAnimationFrame(tick);
  };

  const pause=()=>{
    playing=false;last=0;if(frame)cancelAnimationFrame(frame);
    try{speechSynthesis.cancel();}catch(_){}
  };

  const showRules=()=>{
    pause();returnFromRules=true;view.hidden=true;
    if(nav)nav.hidden=false;if(sections)sections.hidden=false;
    sections?.scrollTo?.({top:0,behavior:'instant'});
  };

  const showVideo=(restart=false)=>{
    if(nav)nav.hidden=true;if(sections)sections.hidden=true;view.hidden=false;
    if(restart){time=0;sceneIndex=-1;}
    renderAt(time,true);
    if(returnFromRules)returnFromRules=false;
  };

  const back=document.createElement('button');
  back.type='button';back.className='tutorial-video-back-rules';back.textContent='← Tutorial Video';
  back.addEventListener('click',()=>{showVideo(false);play();});
  nav?.prepend(back);

  rulesBtn?.addEventListener('click',showRules);
  trainingBtn?.addEventListener('click',()=>{
    pause();try{dialog.close();}catch(_){}
    setTimeout(()=>document.getElementById('trainingModeBtn')?.click(),0);
  });

  const openTutorial=()=>{
    ensureFrames();showVideo(true);setTimeout(play,180);
  };
  document.getElementById('howToBtn')?.addEventListener('click',openTutorial);
  document.getElementById('railHowTo')?.addEventListener('click',openTutorial);

  dialog.addEventListener('close',()=>{pause();parkLiveFrames();showVideo(false);});
  dialog.addEventListener('cancel',pause);
  addEventListener('beforeunload',()=>{if(keepAliveTimer)clearInterval(keepAliveTimer);});

  showVideo(true);
})();