(() => {
  'use strict';

  const params=new URLSearchParams(location.search);
  if(params.get('tutorialFootage')==='1'){
    document.documentElement.classList.add('tutorial-footage-page');
    return;
  }

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

  let filmRun=0;
  let voiceEnabled=true;
  let menuFrame=null;
  let gameFrame=null;
  let lastSpeech='';
  let returnFromRules=false;

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const active=token=>token===filmRun&&dialog.open;
  const card=id=>deck.find(c=>c.id===id);
  const art=c=>c?commons+encodeURIComponent(c.file).replace(/%2F/g,'/'):'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cardImg=(id,label='')=>{
    const c=card(id);if(!c)return '';
    return '<figure class="film-card"><img src="'+art(c)+'" alt="'+esc(label||familyNames[c.month]+' card')+'">'+(label?'<figcaption>'+esc(label)+'</figcaption>':'')+'</figure>';
  };
  const cardsFor=fn=>deck.filter(fn).map(c=>cardImg(c.id)).join('');
  const familyCards=month=>deck.filter(c=>c.month===month).map(c=>cardImg(c.id)).join('');

  const speak=text=>{
    if(!voiceEnabled||!text||!globalThis.speechSynthesis||typeof SpeechSynthesisUtterance!=='function'||text===lastSpeech)return;
    lastSpeech=text;
    try{
      speechSynthesis.cancel();
      const utter=new SpeechSynthesisUtterance(text);
      const voices=speechSynthesis.getVoices?.()||[];
      utter.voice=voices.find(v=>/^en-US/i.test(v.lang)&&/Samantha|Ava|Jenny|Google US English|Microsoft/i.test(v.name))
        ||voices.find(v=>/^en-US/i.test(v.lang))
        ||voices.find(v=>/^en/i.test(v.lang))
        ||null;
      utter.rate=.97;utter.pitch=1;utter.volume=.92;
      speechSynthesis.speak(utter);
    }catch(_){}
  };

  const filmUrl=()=>{
    const url=new URL(location.pathname,location.origin);
    url.searchParams.set('tutorialFootage','1');
    return url.href;
  };

  const createFrame=name=>{
    const wrap=document.createElement('div');
    wrap.className='film-live-wrap film-parked '+name;
    const iframe=document.createElement('iframe');
    iframe.className='film-live-frame';
    iframe.src=filmUrl();
    iframe.title=name==='menu'?'GoStop Live main menu footage':'GoStop Live gameplay footage';
    iframe.tabIndex=-1;
    wrap.appendChild(iframe);
    const ready=new Promise(resolve=>{
      const done=()=>setTimeout(()=>resolve(iframe),350);
      if(iframe.contentDocument?.readyState==='complete')done();
      else iframe.addEventListener('load',done,{once:true});
    });
    return {name,wrap,iframe,ready,prepared:false};
  };

  const parking=()=>{
    let root=document.querySelector('.film-frame-parking');
    if(!root){root=document.createElement('div');root.className='film-frame-parking';document.body.appendChild(root);}
    return root;
  };

  const ensureFrames=()=>{
    if(menuFrame&&gameFrame)return;
    menuFrame=createFrame('menu');
    gameFrame=createFrame('game');
    parking().append(menuFrame.wrap,gameFrame.wrap);
  };

  const docOf=item=>{
    try{return item?.iframe?.contentDocument||null;}catch(_){return null;}
  };

  const waitFor=async(item,selector,timeout=18000)=>{
    await item.ready.catch(()=>{});
    const started=Date.now();
    while(Date.now()-started<timeout){
      const d=docOf(item),el=d?.querySelector(selector);
      if(el)return el;
      await wait(120);
    }
    return null;
  };

  const closeFootageDialogs=item=>{
    const d=docOf(item);if(!d)return;
    d.querySelector('#returnGameNo')?.click();
    d.querySelectorAll('dialog[open]').forEach(node=>{try{node.close();}catch(_){ }});
    const info=d.querySelector('#playerInfoOverlay:not([hidden])');
    if(info)info.hidden=true;
  };

  const prepareMenu=async()=>{
    if(menuFrame.prepared)return true;
    await menuFrame.ready;
    const d=docOf(menuFrame);if(!d)return false;
    d.documentElement.classList.add('tutorial-footage-document');
    d.body?.classList.add('tutorial-footage-body');
    const friendly=await waitFor(menuFrame,'#friendlyGamingBtn',22000);
    if(!friendly)return false;
    closeFootageDialogs(menuFrame);
    menuFrame.prepared=true;
    return true;
  };

  const prepareGame=async()=>{
    if(gameFrame.prepared)return true;
    await gameFrame.ready;
    const d=docOf(gameFrame);if(!d)return false;
    d.documentElement.classList.add('tutorial-footage-document');
    d.body?.classList.add('tutorial-footage-body');
    const friendly=await waitFor(gameFrame,'#friendlyGamingBtn',22000);
    if(!friendly)return false;
    closeFootageDialogs(gameFrame);

    if(friendly.getAttribute('aria-expanded')!=='true')friendly.click();
    const training=await waitFor(gameFrame,'#trainingModeBtn',8000);
    if(!training)return false;
    training.click();

    const hand=await waitFor(gameFrame,'#playerHand .hand-card',22000);
    if(!hand)return false;
    await waitFor(gameFrame,'#table',6000);
    gameFrame.prepared=true;
    return true;
  };

  const prepareAll=async token=>{
    ensureFrames();
    const ready=await Promise.all([prepareMenu(),prepareGame()]);
    if(!active(token))return false;
    return ready.every(Boolean);
  };

  const clearStage=()=>{
    for(const item of [menuFrame,gameFrame]){
      if(item?.wrap.parentNode===stage){
        item.wrap.classList.remove('show','mobile-view','desktop-view');
        item.wrap.classList.add('film-parked');
        parking().appendChild(item.wrap);
      }
    }
    stage.replaceChildren();
    stage.className='tutorial-video-stage film-stage';
  };

  const mountFrame=(item,mode='desktop')=>{
    clearStage();
    stage.className='tutorial-video-stage film-stage live';
    item.wrap.className='film-live-wrap '+item.name+' '+(mode==='mobile'?'mobile-view':'desktop-view');
    stage.appendChild(item.wrap);
    fitFrame(item,mode);
    requestAnimationFrame(()=>item.wrap.classList.add('show'));
    return item;
  };

  const fitFrame=(item,mode)=>{
    const r=stage.getBoundingClientRect();
    if(mode==='mobile'){
      const scale=Math.min((r.width*.78)/390,(r.height*.94)/844);
      item.wrap.style.setProperty('--film-scale',String(Math.max(.2,scale)));
    }else{
      const scale=Math.min(r.width/1365,r.height/768);
      item.wrap.style.setProperty('--film-scale',String(Math.max(.2,scale)));
    }
  };

  const showGraphic=html=>{
    clearStage();
    stage.className='tutorial-video-stage film-stage graphic';
    stage.innerHTML='<div class="film-graphic">'+html+'</div>';
  };

  const layer=()=>{
    let el=stage.querySelector('.film-overlay-layer');
    if(!el){el=document.createElement('div');el.className='film-overlay-layer';stage.appendChild(el);}
    return el;
  };

  const addTitleOverlay=(title,sub='')=>{
    const root=layer();
    const box=document.createElement('div');
    box.className='film-title-overlay';
    box.innerHTML='<strong>'+esc(title)+'</strong>'+(sub?'<span>'+esc(sub)+'</span>':'');
    root.appendChild(box);
    requestAnimationFrame(()=>box.classList.add('show'));
    return box;
  };

  const clearOverlay=()=>{
    stage.querySelector('.film-overlay-layer')?.remove();
  };

  const gesture=(kind='mouse')=>{
    const root=layer();
    let node=root.querySelector('.film-gesture');
    if(!node){node=document.createElement('div');root.appendChild(node);}
    node.className='film-gesture '+kind;
    node.textContent=kind==='finger'?'☝':'';
    return node;
  };

  const locate=(item,selector)=>{
    const d=docOf(item),el=d?.querySelector(selector);if(!el)return null;
    const fr=item.iframe.getBoundingClientRect(),sr=stage.getBoundingClientRect(),er=el.getBoundingClientRect();
    const sx=fr.width/Math.max(1,item.iframe.clientWidth),sy=fr.height/Math.max(1,item.iframe.clientHeight);
    return {el,x:(fr.left-sr.left)+(er.left+er.width/2)*sx,y:(fr.top-sr.top)+(er.top+er.height/2)*sy,w:er.width*sx,h:er.height*sy};
  };

  const pointAt=(item,selector,kind='mouse')=>{
    const p=locate(item,selector);if(!p)return null;
    const node=gesture(kind);
    node.style.setProperty('--gx',p.x+'px');
    node.style.setProperty('--gy',p.y+'px');
    return {...p,node};
  };

  const pulseClick=async(item,selector,kind='mouse',doClick=true)=>{
    const p=pointAt(item,selector,kind);if(!p)return null;
    p.node.classList.add('press');
    await wait(180);
    if(doClick)p.el.click();
    await wait(150);
    p.node.classList.remove('press');
    return p.el;
  };

  const highlight=(item,selector,label='')=>{
    const p=locate(item,selector);if(!p)return null;
    const root=layer(),box=document.createElement('div');
    box.className='film-focus-box';
    box.style.left=(p.x-p.w/2-6)+'px';box.style.top=(p.y-p.h/2-6)+'px';
    box.style.width=(p.w+12)+'px';box.style.height=(p.h+12)+'px';
    if(label){const tag=document.createElement('span');tag.textContent=label;box.appendChild(tag);}
    root.appendChild(box);
    requestAnimationFrame(()=>box.classList.add('show'));
    return box;
  };

  const selectedCard=(item,selector,on=true)=>{
    const p=locate(item,selector);if(!p)return null;
    p.el.classList.toggle('film-demo-selected',on);
    return p.el;
  };

  const shot=async(token,{caption:cap,voice=cap,hold=2400,action})=>{
    if(!active(token))return false;
    lastSpeech='';
    caption.textContent=cap||'';
    if(action)await action();
    if(!active(token))return false;
    speak(voice||cap||'');
    const started=Date.now();
    while(Date.now()-started<hold){
      if(!active(token))return false;
      await wait(100);
    }
    return true;
  };

  const showLoading=message=>{
    showGraphic('<div class="film-loader"><div></div><h2>'+esc(message)+'</h2><p>Preparing the real GoStop Live! interface…</p></div>');
    caption.textContent=message;
  };

  const familiesHtml=()=>'<div class="film-card-grid families">'+Array.from({length:12},(_,i)=>{
    const m=i+1;return '<section><h3>'+familyNames[m]+'</h3><div>'+familyCards(m)+'</div></section>';
  }).join('')+'</div>';

  const typesHtml=()=>{
    const bright=cardsFor(c=>c.type==='bright');
    const picture=cardsFor(c=>c.type==='animal');
    const red=cardsFor(c=>c.type==='ribbon'&&c.ribbonSet==='red');
    const blue=cardsFor(c=>c.type==='ribbon'&&c.ribbonSet==='blue');
    const plain=cardsFor(c=>c.type==='ribbon'&&c.ribbonSet==='grass');
    const willow=cardsFor(c=>c.type==='ribbon'&&!c.ribbonSet);
    const singles=cardsFor(c=>c.type==='pi');
    return '<div class="film-type-grid">'
      +'<section><h3>Brights</h3><div>'+bright+'</div></section>'
      +'<section><h3>Pictures</h3><div>'+picture+'</div></section>'
      +'<section class="stripes"><h3>Stripes</h3><div class="stripe-set"><b>Red</b>'+red+'</div><div class="stripe-set"><b>Blue</b>'+blue+'</div><div class="stripe-set"><b>Plain</b>'+plain+'</div><div class="stripe-set"><b>Willow</b>'+willow+'</div></section>'
      +'<section><h3>Singles</h3><div>'+singles+'</div></section>'
      +'</div>';
  };

  const scoreGraphic=(type)=>({
    bright:'<section class="film-score-card"><h2>Brights</h2><div class="film-score-row">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m12-1')+'<strong>3 with Rain Bright = 2</strong></div><div class="film-score-row">'+cardImg('m1-1')+cardImg('m3-1')+cardImg('m8-1')+'<strong>3 non-Rain = 3</strong></div><p>4 Brights = 4 · All 5 Brights = 15</p></section>',
    picture:'<section class="film-score-card"><h2>Pictures</h2><div class="film-score-row">'+cardImg('m2-1')+cardImg('m4-1')+cardImg('m8-2')+'<strong>5-BIRDIES! = 5</strong></div><p>Any 5 Pictures = 1 · Each additional Picture +1</p></section>',
    stripe:'<section class="film-score-card"><h2>Stripes</h2><div class="film-score-row">'+cardImg('m1-2')+cardImg('m2-2')+cardImg('m3-2')+'<strong>3 Red / Blue / Plain = 3</strong></div><p>Any 5 Stripes = 1 · Each additional Stripe +1</p></section>',
    single:'<section class="film-score-card"><h2>Singles</h2><div class="film-score-row">'+cardImg('m11-3','2x')+cardImg('m12-4','2x')+cardImg('m9-1','Sake Cup')+'</div><p>10 Singles = 1 · Each additional Single +1</p></section>'
  }[type]);

  const specialGraphic=(name)=>({
    shake:'<div class="film-special-focus"><h2>SHAKE</h2><div>'+cardImg('m1-1')+cardImg('m1-2')+cardImg('m1-3')+'</div><p>Reveal 3 cards from one family. A normal Shake doubles your final settlement if you win.</p></div>',
    bomb:'<div class="film-special-focus"><h2>BOMB</h2><div>'+cardImg('m2-1')+cardImg('m2-2')+cardImg('m2-3')+cardImg('m2-4')+'</div><p>Keep 3 hidden. When the 4th is on the table, capture all four and steal 1 Single.</p></div>',
    ppeok:'<div class="film-special-focus"><h2>POOPED! <small>(뻑)</small></h2><div>'+cardImg('m3-2')+cardImg('m3-3')+cardImg('m3-4')+'</div><p>Play + table + draw are the same family. Capture the stack later and steal 1 Single.</p></div>',
    kiss:'<div class="film-special-focus"><h2>KISS! <small>(쪽)</small></h2><div>'+cardImg('m6-3')+cardImg('m6-4')+'</div><p>Your played card has no match, then the draw matches it. Capture the pair and steal 1 Single.</p></div>',
    flush:'<div class="film-special-focus"><h2>FLUSH! <small>(따닥)</small></h2><div>'+cardImg('m8-1')+cardImg('m8-2')+cardImg('m8-3')+cardImg('m8-4')+'</div><p>Two are on the table, you play the third, and draw the fourth. Capture all four and steal 1 Single.</p></div>',
    sweep:'<div class="film-special-focus"><h2>CLEAN SWEEP! <small>(싹쓸이)</small></h2><div class="film-sweep">🧹</div><p>Clear the live table with a capture and steal 1 Single when available.</p></div>'
  }[name]);

  const runFilm=async token=>{
    showLoading('Starting tutorial…');
    const framesReady=await prepareAll(token);
    if(!active(token))return;
    if(!framesReady){
      showGraphic('<div class="film-loader failed"><h2>Real game footage could not start.</h2><p>Close How to Play and open it again.</p></div>');
      caption.textContent='Real game footage could not start. Please close How to Play and open it again.';
      return;
    }

    await shot(token,{
      caption:'Welcome to GoStop Live!',
      voice:'Welcome to GoStop Live!',
      hold:3300,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        addTitleOverlay('Welcome to GoStop Live!','Korea’s classic card game, built for everyone.');
      }
    });

    await shot(token,{
      caption:'GoStop Live! lets anyone around the world play GoStop together.',
      voice:'GoStop Live lets anyone around the world play GoStop together, whether they are in the same room or on opposite sides of the world.',
      hold:5000,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        addTitleOverlay('Play anyone. Anywhere.','Friends, AI, or players around the world.');
        const root=layer(),net=document.createElement('div');net.className='film-world-network';
        net.innerHTML='<span>YOU</span><i></i><span>FRIEND</span><i></i><span>WORLD</span>';
        root.appendChild(net);
      }
    });

    await shot(token,{
      caption:'The same GoStop Live! experience works on a computer and on mobile.',
      voice:'The same GoStop Live experience works on a computer and on mobile.',
      hold:4700,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        const root=layer(),split=document.createElement('div');split.className='film-device-overlay';
        split.innerHTML='<div><b>PC / Mac</b><span>Large table view</span></div><strong>↔</strong><div><b>Mobile</b><span>Touch-friendly play</span></div>';
        root.appendChild(split);
      }
    });

    await shot(token,{
      caption:'Friendly Gaming is for casual play with no Coins or leaderboard impact.',
      hold:3600,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        const d=docOf(menuFrame),btn=d?.querySelector('#friendlyGamingBtn');
        if(btn?.getAttribute('aria-expanded')!=='true')await pulseClick(menuFrame,'#friendlyGamingBtn','mouse',true);
        highlight(menuFrame,'#friendlyGamingBtn','Friendly Gaming');
      }
    });

    await shot(token,{
      caption:'Training Mode lets you practice against AI while GoStop Live! teaches you what to play and why.',
      hold:3900,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        highlight(menuFrame,'#trainingModeBtn','Training Mode');
        pointAt(menuFrame,'#trainingModeBtn','mouse');
      }
    });

    await shot(token,{
      caption:'Play With Friend creates a room link you can send to someone you know.',
      hold:3600,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        highlight(menuFrame,'#freeFriendBtn','Play With Friend');
        pointAt(menuFrame,'#freeFriendBtn','mouse');
      }
    });

    await shot(token,{
      caption:'Competitive Gaming uses virtual Coins and ranks players by the Coins they win and lose.',
      voice:'Competitive Gaming uses virtual Coins and ranks players globally by the Coins they win and lose.',
      hold:4200,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        const d=docOf(menuFrame);
        if(d?.querySelector('#friendlyGamingBtn')?.getAttribute('aria-expanded')==='true')d.querySelector('#friendlyGamingBtn')?.click();
        await pulseClick(menuFrame,'#competitiveGamingBtn','mouse',true);
        highlight(menuFrame,'#competitiveGamingBtn','Competitive Gaming');
      }
    });

    await shot(token,{
      caption:'Choose Solo Play to compete against the computer, or Online Play to compete with another player.',
      hold:4300,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        highlight(menuFrame,'#rankedSoloBtn','vs. AI');
        highlight(menuFrame,'#onlinePlayMenuBtn','vs. Player');
      }
    });

    await shot(token,{
      caption:'Friends lets you connect again. Matchmaking can also recommend who to play.',
      hold:4000,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        highlight(menuFrame,'#friendsMenuBtn','Friends');
        pointAt(menuFrame,'#friendsMenuBtn','mouse');
      }
    });

    await shot(token,{
      caption:'Leaderboards show the All-Time Global ranking and This Month. The Main Menu also enters Attract Mode when left untouched.',
      hold:5100,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        highlight(menuFrame,'#leaderboardMenuBtn','Leaderboards');
        pointAt(menuFrame,'#leaderboardMenuBtn','mouse');
      }
    });

    await shot(token,{
      caption:'Now let’s use the real game screen.',
      voice:'Now let’s use the real game screen.',
      hold:2600,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        addTitleOverlay('Playing on PC / Mac','This is the actual GoStop Live! game.');
      }
    });

    await shot(token,{
      caption:'On PC, click a card once to select it and lift it from your hand.',
      voice:'On a computer, click a card once to select it and lift it from your hand.',
      hold:3900,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        const sel='#playerHand .hand-card:not(:disabled)';
        pointAt(gameFrame,sel,'mouse');
        await wait(500);
        await pulseClick(gameFrame,sel,'mouse',false);
        selectedCard(gameFrame,sel,true);
      }
    });

    await shot(token,{
      caption:'Click the selected card again to play it onto the table.',
      voice:'Click that selected card again to play it onto the table.',
      hold:4200,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        const sel='#playerHand .hand-card:not(:disabled)';
        selectedCard(gameFrame,sel,false);
        await pulseClick(gameFrame,sel,'mouse',true);
      }
    });

    await shot(token,{
      caption:'Click a player area to see player information.',
      hold:3400,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        await pulseClick(gameFrame,'.human-chip[data-player-info],.human-chip','mouse',true);
        highlight(gameFrame,'#playerInfoPopover','Player Info');
      }
    });

    await shot(token,{
      caption:'Click the score to see exactly how the points are calculated.',
      hold:3400,
      action:async()=>{
        closeFootageDialogs(gameFrame);mountFrame(gameFrame,'desktop');clearOverlay();
        await pulseClick(gameFrame,'.human-chip .score-pill','mouse',true);
        highlight(gameFrame,'#scoreBreakdownContent','Score Breakdown');
      }
    });

    await shot(token,{
      caption:'Click the captured-card area to inspect every captured card and scoring group.',
      hold:3600,
      action:async()=>{
        closeFootageDialogs(gameFrame);mountFrame(gameFrame,'desktop');clearOverlay();
        await pulseClick(gameFrame,'.game-capture-panel','mouse',true);
        highlight(gameFrame,'#scoreBreakdownContent,#captureDialog .dialog-card','Captured Cards');
      }
    });

    await shot(token,{
      caption:'On mobile, tap a card once to select it.',
      hold:3600,
      action:async()=>{
        closeFootageDialogs(gameFrame);mountFrame(gameFrame,'mobile');clearOverlay();
        const sel='#playerHand .hand-card:not(:disabled)';
        pointAt(gameFrame,sel,'finger');
        await wait(500);await pulseClick(gameFrame,sel,'finger',false);selectedCard(gameFrame,sel,true);
      }
    });

    await shot(token,{
      caption:'Tap the selected card again to play it.',
      hold:3700,
      action:async()=>{
        mountFrame(gameFrame,'mobile');clearOverlay();
        const sel='#playerHand .hand-card:not(:disabled)';
        selectedCard(gameFrame,sel,false);await pulseClick(gameFrame,sel,'finger',true);
      }
    });

    await shot(token,{
      caption:'Or press the card and flick upward. Watch the finger and card move upward together.',
      voice:'Or press the card and flick upward. Watch the finger and the card move upward together.',
      hold:4600,
      action:async()=>{
        mountFrame(gameFrame,'mobile');clearOverlay();
        const sel='#playerHand .hand-card:not(:disabled)';
        const p=pointAt(gameFrame,sel,'finger');
        if(p){
          p.node.classList.add('press');
          p.el.classList.add('film-demo-flick');
          await wait(480);
          p.node.classList.remove('press');p.node.classList.add('swipe-up');
          p.el.classList.add('film-demo-flick-up');
          await wait(850);
          p.el.classList.remove('film-demo-flick','film-demo-flick-up');
          p.node.classList.remove('swipe-up');
        }
      }
    });

    await shot(token,{
      caption:'Now let’s learn the game itself: match families, capture scoring cards, reach 7 points, then choose GO or STOP.',
      hold:5200,
      action:async()=>showGraphic('<div class="film-rules-intro"><h2>How to Play GoStop</h2><div><span>Match Families</span><b>→</b><span>Capture Cards</span><b>→</b><span>Reach 7 Points</span><b>→</b><span>GO or STOP</span></div></div>')
    });

    await shot(token,{
      caption:'Every family has exactly 4 cards. Cards match by family, not by scoring type.',
      hold:5000,
      action:async()=>showGraphic('<h2>Every Family Has 4 Cards</h2><div class="film-one-family"><h3>Iris</h3><div>'+familyCards(5)+'</div></div>')
    });

    await shot(token,{
      caption:'These are all 12 families. Each group contains the 4 cards that match each other.',
      hold:8200,
      action:async()=>showGraphic('<h2>The 12 Card Families</h2>'+familiesHtml())
    });

    await shot(token,{
      caption:'The same 48 cards also belong to scoring types: Brights, Pictures, Stripes, and Singles.',
      hold:9000,
      action:async()=>showGraphic('<h2>Card Types</h2>'+typesHtml())
    });

    await shot(token,{caption:'Brights: 3 with the Rain Bright = 2 points. 3 non-Rain Brights = 3. 4 = 4. All 5 = 15.',hold:6900,action:async()=>showGraphic(scoreGraphic('bright'))});
    await shot(token,{caption:'Pictures: 5-BIRDIES! is 5 points. Any 5 Pictures = 1 point, then each additional Picture adds 1.',hold:6500,action:async()=>showGraphic(scoreGraphic('picture'))});
    await shot(token,{caption:'Stripes: 3 Red, 3 Blue, or 3 Plain = 3 points. Any 5 Stripes = 1 point, then each additional Stripe adds 1.',hold:7200,action:async()=>showGraphic(scoreGraphic('stripe'))});
    await shot(token,{caption:'Singles: 10 Singles = 1 point, then each additional Single adds 1. The 2x Single cards count as two.',hold:6900,action:async()=>showGraphic(scoreGraphic('single'))});

    await shot(token,{
      caption:'A turn starts by playing one card from your hand onto a matching family on the table.',
      hold:4700,
      action:async()=>{
        closeFootageDialogs(gameFrame);mountFrame(gameFrame,'desktop');clearOverlay();
        highlight(gameFrame,'#playerHand','Your Hand');highlight(gameFrame,'#floor','Table');
      }
    });

    await shot(token,{
      caption:'Then the top card is drawn from the draw pile and matched the same way. If there is no match, it stays on the table.',
      hold:5200,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        highlight(gameFrame,'#deckStack','Draw Pile');highlight(gameFrame,'#floor','Table');
      }
    });

    await shot(token,{
      caption:'At 7 points in a 2-player game, choose GO to continue or STOP to end the hand.',
      hold:5200,
      action:async()=>showGraphic('<div class="film-gostop"><div class="film-seven">7<small>POINTS</small></div><div class="film-choice"><b>GO</b><b>STOP</b></div><p>STOP = take your current points · GO = keep playing</p></div>')
    });

    await shot(token,{
      caption:'1 GO adds +1 point. 2 GO means +2 total. From the 3rd GO onward, your score doubles: 3 GO ×2, 4 GO ×4, and so on.',
      hold:7300,
      action:async()=>showGraphic('<div class="film-gostop"><h2>GO Bonus</h2><div class="film-go-line"><span>1 GO<small>+1</small></span><span>2 GO<small>+2 total</small></span><span>3 GO<small>×2</small></span><span>4 GO<small>×4</small></span><span>5 GO<small>×8</small></span></div></div>')
    });

    await shot(token,{
      caption:'If you lose after declaring GO, you lose the game and your opponent receives the GO penalty multiplier.',
      hold:5600,
      action:async()=>showGraphic('<div class="film-gostop danger"><h2>GO Has Risk</h2><p>Lose after GO → opponent’s winning settlement is doubled by GO-bak.</p></div>')
    });

    await shot(token,{caption:'SHAKE: reveal 3 cards from the same family. A normal Shake doubles your final settlement if you win.',hold:6200,action:async()=>showGraphic(specialGraphic('shake'))});
    await shot(token,{caption:'BOMB: keep the 3 cards hidden. When the 4th is on the table, capture all four and steal 1 Single.',hold:6200,action:async()=>showGraphic(specialGraphic('bomb'))});
    await shot(token,{caption:'POOPED! (뻑): played card + table card + drawn card are the same family. Capture the stack later and steal 1 Single.',hold:6500,action:async()=>showGraphic(specialGraphic('ppeok'))});
    await shot(token,{caption:'KISS! (쪽): your played card has no match, then the draw matches it. Capture the pair and steal 1 Single.',hold:6100,action:async()=>showGraphic(specialGraphic('kiss'))});
    await shot(token,{caption:'FLUSH! (따닥): two are on the table, you play the third, and draw the fourth. Capture all four and steal 1 Single.',hold:6500,action:async()=>showGraphic(specialGraphic('flush'))});
    await shot(token,{caption:'CLEAN SWEEP! (싹쓸이): clear the live table with a capture and steal 1 Single when available.',hold:6000,action:async()=>showGraphic(specialGraphic('sweep'))});

    await shot(token,{
      caption:'Need a rule later? Use Full Rules below the video for the complete written reference.',
      hold:4500,
      action:async()=>showGraphic('<div class="film-ending-callout"><div class="film-rulebook">FULL<br>RULES</div><h2>Complete written rules are always available below.</h2></div>')
    });

    await shot(token,{
      caption:'Best first game: Training Mode. Practice against AI while GoStop Live! teaches you during the game.',
      hold:5900,
      action:async()=>{
        mountFrame(gameFrame,'desktop');clearOverlay();
        addTitleOverlay('Best First Game: Training Mode','Practice with AI guidance while you play.');
      }
    });

    await shot(token,{
      caption:'Have fun playing GoStop Live!',
      voice:'Have fun playing GoStop Live!',
      hold:5000,
      action:async()=>{
        mountFrame(menuFrame,'desktop');clearOverlay();
        addTitleOverlay('Have Fun!','GoStop Live!');
      }
    });
  };

  const startFilm=()=>{
    const token=++filmRun;
    lastSpeech='';
    clearOverlay();
    void runFilm(token);
  };

  const stopFilm=()=>{
    filmRun++;
    try{speechSynthesis.cancel();}catch(_){}
    clearOverlay();
  };

  const showRules=()=>{
    stopFilm();returnFromRules=true;view.hidden=true;
    if(nav)nav.hidden=false;if(sections)sections.hidden=false;
    sections?.scrollTo?.({top:0,behavior:'instant'});
  };

  const showVideo=()=>{
    if(nav)nav.hidden=true;if(sections)sections.hidden=true;
    view.hidden=false;
  };

  const back=document.createElement('button');
  back.type='button';back.className='tutorial-video-back-rules';back.textContent='← Tutorial Video';
  back.addEventListener('click',()=>{showVideo();startFilm();});
  nav?.prepend(back);

  rulesBtn?.addEventListener('click',showRules);
  trainingBtn?.addEventListener('click',()=>{
    stopFilm();try{dialog.close();}catch(_){}
    setTimeout(()=>{
      const friendly=document.getElementById('friendlyGamingBtn');
      if(friendly&&friendly.getAttribute('aria-expanded')!=='true')friendly.click();
      setTimeout(()=>document.getElementById('trainingModeBtn')?.click(),80);
    },0);
  });

  const openTutorial=()=>{
    showVideo();
    if(returnFromRules)returnFromRules=false;
    startFilm();
  };

  document.getElementById('howToBtn')?.addEventListener('click',openTutorial);
  document.getElementById('railHowTo')?.addEventListener('click',openTutorial);
  dialog.addEventListener('close',stopFilm);
  dialog.addEventListener('cancel',stopFilm);
  addEventListener('resize',()=>{if(gameFrame?.wrap.parentNode===stage)fitFrame(gameFrame,gameFrame.wrap.classList.contains('mobile-view')?'mobile':'desktop');if(menuFrame?.wrap.parentNode===stage)fitFrame(menuFrame,'desktop');});

  showVideo();
})();