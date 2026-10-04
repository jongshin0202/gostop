(() => {
  'use strict';

  const dialog=document.getElementById('howToDialog');
  const view=document.getElementById('tutorialVideoView');
  if(!dialog||!view)return;

  const stage=view.querySelector('#tutorialVideoStage');
  const caption=view.querySelector('#tutorialVideoCaption');
  const chapterLabel=view.querySelector('#tutorialVideoChapterLabel');
  const currentLabel=view.querySelector('#tutorialVideoCurrent');
  const durationLabel=view.querySelector('#tutorialVideoDuration');
  const progress=view.querySelector('#tutorialVideoProgress');
  const playBtn=view.querySelector('#tutorialVideoPlay');
  const prevBtn=view.querySelector('#tutorialVideoPrev');
  const nextBtn=view.querySelector('#tutorialVideoNext');
  const replayBtn=view.querySelector('#tutorialVideoReplay');
  const captionsBtn=view.querySelector('#tutorialVideoCaptions');
  const narrationBtn=view.querySelector('#tutorialVideoNarration');
  const volume=view.querySelector('#tutorialVideoVolume');
  const rulesBtn=view.querySelector('#tutorialFullRulesBtn');
  const chaptersRoot=view.querySelector('#tutorialVideoChapters');
  const nav=dialog.querySelector('.tutorial-nav');
  const sections=dialog.querySelector('.tutorial-sections');
  const engine=globalThis.GoStopEngine;
  const deck=engine?.masterDeck||[];
  const commons='https://commons.wikimedia.org/wiki/Special:Redirect/file/';
  const mobile=()=>Number(globalThis.navigator?.maxTouchPoints||0)>0||!!globalThis.matchMedia?.('(pointer: coarse)')?.matches;

  const cardById=id=>deck.find(card=>card.id===id)||null;
  const artUrl=card=>card?commons+encodeURIComponent(card.file).replace(/%2F/g,'/'):'';
  const familyNames={1:'Pine',2:'Plum',3:'Cherry',4:'Vine',5:'Iris',6:'Rose',7:'Bush',8:'Hill',9:'Daisy',10:'Star',11:'Berry',12:'Willow'};
  const typeName=card=>{
    if(!card)return 'Card';
    if(card.id==='m9-1')return 'Sake Cup';
    if(card.type==='bright')return 'Bright';
    if(card.type==='animal')return card.flags?.includes('godori')?'Bird Picture':'Picture';
    if(card.type==='ribbon')return (card.ribbonSet==='red'?'Red ':card.ribbonSet==='blue'?'Blue ':card.ribbonSet==='grass'?'Plain ':'')+'Stripe';
    return card.flags?.includes('doublePi')?'2x Single':'Single';
  };
  const cardHtml=(id,small='')=>{
    const card=cardById(id);
    if(!card)return '';
    const label=familyNames[card.month]+' '+typeName(card);
    return '<figure class="tutorial-video-card-wrap" data-card-id="'+id+'"><img class="tutorial-video-card" src="'+artUrl(card)+'" alt="'+label+'"><figcaption>'+(small||label)+'</figcaption></figure>';
  };
  const cardBack=()=>'<div class="tutorial-video-card-wrap"><div class="tutorial-video-card tutorial-video-card-back" aria-label="Draw pile card"></div><figcaption>Draw</figcaption></div>';
  const fmt=seconds=>{
    const value=Math.max(0,Math.round(seconds));
    return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
  };

  const scenes=[
    {
      id:'goal',title:'1 · The Goal',duration:18,
      caption:'Match cards from the same family, capture scoring cards, reach 7 points, then choose GO or STOP.',
      narration:'Welcome to GoStop Live. Match cards from the same family, capture scoring cards, reach seven points, then choose Go or Stop.',
      render:()=>`
        <div class="tutorial-video-scene scene-goal">
          <div class="tutorial-video-logo">GoStop <em>Live!</em></div>
          <div class="tutorial-video-goal-row">
            <div class="tutorial-video-goal-step"><span>1</span><strong>Match families</strong></div>
            <div class="tutorial-video-arrow">→</div>
            <div class="tutorial-video-goal-step"><span>2</span><strong>Capture cards</strong></div>
            <div class="tutorial-video-arrow">→</div>
            <div class="tutorial-video-goal-step"><span>3</span><strong>Reach 7 points</strong></div>
            <div class="tutorial-video-arrow">→</div>
            <div class="tutorial-video-goal-step"><span>4</span><strong>GO or STOP</strong></div>
          </div>
          <p class="tutorial-video-subtitle">You do not match by card type. You match by the picture family.</p>
        </div>`
    },
    {
      id:'cards',title:'2 · Cards & Families',duration:27,
      caption:'Every family has four cards. Scoring cards fall into four groups: Brights, Pictures, Stripes, and Singles.',
      narration:'Every family has exactly four cards. The scoring groups are Brights, Pictures, Stripes, and Singles. The family is what determines a match.',
      render:()=>`
        <div class="tutorial-video-scene scene-cards">
          <h3>Every family has 4 cards</h3>
          <div class="tutorial-video-family-demo">
            ${cardHtml('m5-1','Iris Picture')}
            ${cardHtml('m5-2','Iris Plain Stripe')}
            ${cardHtml('m5-3','Iris Single')}
            ${cardHtml('m5-4','Iris Single')}
          </div>
          <div class="tutorial-video-type-grid">
            <div><b>Bright</b>${cardHtml('m3-1','Cherry Bright')}</div>
            <div><b>Picture</b>${cardHtml('m2-1','Plum Bird')}</div>
            <div><b>Stripe</b>${cardHtml('m6-2','Rose Blue Stripe')}</div>
            <div><b>Single</b>${cardHtml('m11-3','Berry 2x Single')}</div>
          </div>
        </div>`
    },
    {
      id:'turn',title:'3 · One Turn',duration:32,
      caption:'Play one card from your hand, resolve its family match, flip the deck, then resolve the drawn card the same way.',
      narration:'A turn has two parts. First, play one card from your hand and resolve its family match on the table. Then flip the top card of the deck and resolve that card the same way.',
      render:()=>`
        <div class="tutorial-video-scene scene-turn">
          <div class="tutorial-video-table">
            <div class="tutorial-video-table-title">TABLE</div>
            <div class="tutorial-video-table-cards">
              ${cardHtml('m4-4','Vine Single')}
              ${cardHtml('m8-1','Hill Bright')}
              ${cardHtml('m10-3','Star Single')}
            </div>
            <div class="tutorial-video-deck">${cardBack()}</div>
            <div class="tutorial-video-capture-bin"><strong>Captured</strong><div class="tutorial-video-capture-cards"></div></div>
          </div>
          <div class="tutorial-video-hand-row">
            <span>Your hand</span>
            ${cardHtml('m4-3','Vine Single')}
            ${cardHtml('m6-3','Rose Single')}
            ${cardHtml('m10-4','Star Single')}
          </div>
          <div class="tutorial-video-turn-label" data-phase-label>Choose a card from your hand</div>
        </div>`
    },
    {
      id:'matches',title:'4 · Matching',duration:27,
      caption:'One match captures automatically. No match leaves your card on the table. Two matches let you choose the target.',
      narration:'There are three basic matching situations. One matching family captures automatically. With no match, your card stays on the table. With two matching cards, you choose which one to capture.',
      render:()=>`
        <div class="tutorial-video-scene scene-matches">
          <div class="tutorial-video-match-grid">
            <article>
              <h3>1 match</h3>
              <div class="tutorial-video-mini-row">${cardHtml('m5-3','Iris') }<span>+</span>${cardHtml('m5-4','Iris')}</div>
              <strong>Capture both</strong>
            </article>
            <article>
              <h3>No match</h3>
              <div class="tutorial-video-mini-row">${cardHtml('m6-3','Rose')}<span>≠</span>${cardHtml('m7-3','Bush')}</div>
              <strong>Played card stays</strong>
            </article>
            <article>
              <h3>2 matches</h3>
              <div class="tutorial-video-mini-row">${cardHtml('m8-3','Hill')}<span>→</span><div class="tutorial-video-two-targets">${cardHtml('m8-1','Hill')}${cardHtml('m8-2','Hill')}</div></div>
              <strong>You choose one</strong>
            </article>
          </div>
        </div>`
    },
    {
      id:'scoring',title:'5 · Scoring',duration:36,
      caption:'Start scoring with 3 Brights, 5 Pictures, 5 Stripes, or 10 Singles. Three-card Stripe sets and Godori add bonus points.',
      narration:'Your captured cards are grouped by type. Three Brights, five Pictures, five Stripes, or ten Singles start scoring. Red, Blue, and Plain three Stripe sets score bonuses, and the three bird Pictures make Godori.',
      render:()=>`
        <div class="tutorial-video-scene scene-scoring">
          <div class="tutorial-video-score-grid">
            <article><b>Brights</b><strong>3 → score</strong><div>${cardHtml('m1-1','')}${cardHtml('m3-1','')}${cardHtml('m8-1','')}</div></article>
            <article><b>Pictures</b><strong>5 → score</strong><div>${cardHtml('m2-1','')}${cardHtml('m4-1','')}${cardHtml('m6-1','')}</div></article>
            <article><b>Stripes</b><strong>5 → score</strong><div>${cardHtml('m1-2','')}${cardHtml('m6-2','')}${cardHtml('m7-2','')}</div></article>
            <article><b>Singles</b><strong>10 → score</strong><div>${cardHtml('m11-3','2x')}${cardHtml('m12-4','2x')}${cardHtml('m5-3','')}</div></article>
          </div>
          <div class="tutorial-video-bonus-row">
            <div><strong>Red Stripe</strong><span>Pine · Plum · Cherry</span></div>
            <div><strong>Blue Stripe</strong><span>Rose · Daisy · Star</span></div>
            <div><strong>Plain Stripe</strong><span>Vine · Iris · Bush</span></div>
            <div><strong>Godori</strong><span>3 bird Pictures</span></div>
          </div>
        </div>`
    },
    {
      id:'gostop',title:'6 · GO or STOP',duration:21,
      caption:'At 7 points, STOP ends the hand and locks in the win. GO keeps playing for more reward, but gives your opponent another chance.',
      narration:'In a two player game, reaching seven points opens the Go or Stop decision. Stop ends the hand and locks in the win. Go keeps playing for more reward, but gives the opponent another chance.',
      render:()=>`
        <div class="tutorial-video-scene scene-gostop">
          <div class="tutorial-video-scoreburst">7 <small>POINTS</small></div>
          <div class="tutorial-video-decision">
            <button type="button" tabindex="-1" class="tutorial-video-go">GO</button>
            <button type="button" tabindex="-1" class="tutorial-video-stop">STOP</button>
          </div>
          <div class="tutorial-video-choice-copy">
            <p><b>GO</b> Keep playing. More upside, more risk.</p>
            <p><b>STOP</b> End the hand and take the win.</p>
          </div>
        </div>`
    },
    {
      id:'specials',title:'7 · Special Plays',duration:25,
      caption:'Shake, Bomb, Ppeok, Sweep, Ttadak and other special plays happen automatically or with a simple choice. Training Mode explains them when they appear.',
      narration:'GoStop has special plays like Shake, Bomb, Ppeok, Sweep, and Ttadak. GoStop Live handles the rules for you and Training Mode explains each special play when it appears.',
      render:()=>`
        <div class="tutorial-video-scene scene-specials">
          <div class="tutorial-video-special-grid">
            <article><strong>SHAKE</strong><span>Reveal 3 matching-family cards</span><div>${cardHtml('m1-1','')}${cardHtml('m1-2','')}${cardHtml('m1-3','')}</div></article>
            <article><strong>BOMB</strong><span>3 in hand + the 4th on table</span><div>${cardHtml('m2-1','')}${cardHtml('m2-2','')}${cardHtml('m2-3','')}${cardHtml('m2-4','')}</div></article>
            <article><strong>PPEOK</strong><span>Played + table + drawn same family</span><div>${cardHtml('m3-2','')}${cardHtml('m3-3','')}${cardHtml('m3-4','')}</div></article>
            <article><strong>MORE</strong><span>Sweep · Ttadak · steals · multipliers</span><div class="tutorial-video-special-icons">✨ 🧹 ×2</div></article>
          </div>
          <p class="tutorial-video-subtitle">You do not need to memorize these before your first game.</p>
        </div>`
    },
    {
      id:'controls',title:'8 · Controls & Training',duration:18,
      caption:()=>mobile()
        ?'Tap once to select a card, tap again to play it, and tap a highlighted table target when a choice is required. You can also flick upward for a quick play.'
        :'Click a card to play it. When two targets are available, click the highlighted table card you want. You can also flick upward for a quick play.',
      narration:()=>mobile()
        ?'On a phone or tablet, tap once to select a card and tap again to play it. If two table targets are available, tap the one you want. You can also flick upward for a quick play.'
        :'On a computer, click a card to play it. If two table targets are available, click the highlighted target you want. You can also flick upward for a quick play.',
      render:()=>`
        <div class="tutorial-video-scene scene-controls">
          <div class="tutorial-video-device-icon">${mobile()?'☝️':'🖱️'}</div>
          <h3>${mobile()?'Tap, choose, or flick':'Click, choose, or flick'}</h3>
          <p>${mobile()
            ?'Tap once to select. Tap again to play. If two table cards are highlighted, tap the one you want.'
            :'Click a hand card. If two table cards are highlighted, click the one you want.'}</p>
          <div class="tutorial-video-training-cta">
            <strong>Best first game: Training Mode</strong>
            <span>Friendly Gaming → Training Mode</span>
          </div>
        </div>`
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
  let narration=false;
  let captions=true;
  let returnFromRules=false;

  durationLabel.textContent=fmt(total);
  progress.max=total;
  progress.value=0;

  const getText=value=>typeof value==='function'?value():value;
  const sceneAt=value=>{
    const clamped=Math.max(0,Math.min(total-.001,value));
    let index=scenes.length-1;
    for(let i=0;i<scenes.length;i++){
      if(clamped<starts[i]+scenes[i].duration){index=i;break;}
    }
    return {index,scene:scenes[index],local:clamped-starts[index]};
  };

  const speakScene=scene=>{
    if(!narration||!globalThis.speechSynthesis)return;
    globalThis.speechSynthesis.cancel();
    if(typeof globalThis.SpeechSynthesisUtterance!=='function')return;
    const utterance=new SpeechSynthesisUtterance(getText(scene.narration));
    utterance.rate=.96;utterance.pitch=1;utterance.volume=Number(volume?.value||.9);
    globalThis.speechSynthesis.speak(utterance);
  };

  const renderScene=(index,local=0,force=false)=>{
    const scene=scenes[index];
    if(!scene)return;
    if(force||index!==sceneIndex){
      sceneIndex=index;
      stage.innerHTML=scene.render();
      chapterLabel.textContent=scene.title;
      speakScene(scene);
    }
    const p=Math.max(0,Math.min(1,local/scene.duration));
    stage.dataset.phase=String(Math.min(4,Math.floor(p*5)));
    stage.style.setProperty('--tutorial-progress',String(p));
    if(scene.id==='turn'){
      const label=stage.querySelector('[data-phase-label]');
      if(label)label.textContent=p<.22?'Choose a card from your hand':p<.45?'Match the same family on the table':p<.7?'Capture the matching cards':p<.86?'Flip the draw pile':'Resolve the drawn card too';
    }
    caption.textContent=getText(scene.caption);
    caption.hidden=!captions;
    chaptersRoot.querySelectorAll('button').forEach((button,i)=>button.classList.toggle('active',i===index));
  };

  const sync=force=>{
    const point=sceneAt(time);
    renderScene(point.index,point.local,force);
    currentLabel.textContent=fmt(time);
    progress.value=time;
    playBtn.textContent=playing?'Pause':'Play';
    playBtn.setAttribute('aria-label',playing?'Pause tutorial':'Play tutorial');
  };

  const stopNarration=()=>globalThis.speechSynthesis?.cancel?.();

  const tick=stamp=>{
    if(!playing)return;
    if(!lastFrame)lastFrame=stamp;
    const delta=Math.min(.25,(stamp-lastFrame)/1000);
    lastFrame=stamp;
    time+=delta;
    if(time>=total){time=total;playing=false;lastFrame=0;stopNarration();sync(true);return;}
    sync(false);
    frame=requestAnimationFrame(tick);
  };

  const play=()=>{
    if(time>=total)time=0;
    if(playing)return;
    playing=true;lastFrame=0;
    const point=sceneAt(time);
    speakScene(point.scene);
    sync(false);
    frame=requestAnimationFrame(tick);
  };
  const pause=()=>{
    playing=false;lastFrame=0;
    if(frame)cancelAnimationFrame(frame);
    stopNarration();
    sync(false);
  };
  const seek=value=>{
    time=Math.max(0,Math.min(total,Number(value)||0));
    const point=sceneAt(time);
    renderScene(point.index,point.local,true);
    currentLabel.textContent=fmt(time);progress.value=time;
    if(playing)speakScene(point.scene);
  };
  const jumpScene=delta=>{
    const point=sceneAt(time);
    const next=Math.max(0,Math.min(scenes.length-1,point.index+delta));
    seek(starts[next]);
  };

  scenes.forEach((scene,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=scene.title.replace(/^\d+\s*·\s*/,'');
    button.addEventListener('click',()=>seek(starts[index]));
    chaptersRoot.appendChild(button);
  });

  playBtn.addEventListener('click',()=>playing?pause():play());
  replayBtn?.addEventListener('click',()=>{seek(0);play();});
  prevBtn.addEventListener('click',()=>jumpScene(-1));
  nextBtn.addEventListener('click',()=>jumpScene(1));
  progress.addEventListener('input',()=>seek(progress.value));
  captionsBtn?.addEventListener('click',()=>{
    captions=!captions;
    captionsBtn.textContent=captions?'Captions On':'Captions Off';
    captionsBtn.classList.toggle('active',captions);
    captionsBtn.setAttribute('aria-pressed',String(captions));
    caption.hidden=!captions;
  });
  narrationBtn.addEventListener('click',()=>{
    narration=!narration;
    narrationBtn.textContent=narration?'Narration On':'Narration Off';
    narrationBtn.classList.toggle('active',narration);
    narrationBtn.setAttribute('aria-pressed',String(narration));
    if(narration){
      const point=sceneAt(time);speakScene(point.scene);
    }else stopNarration();
  });
  volume?.addEventListener('input',()=>{
    if(narration){
      const point=sceneAt(time);speakScene(point.scene);
    }
  });

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
    if(restart){time=0;sceneIndex=-1;sync(true);}
    else sync(true);
    if(returnFromRules)returnFromRules=false;
  };

  const back=document.createElement('button');
  back.type='button';
  back.className='tutorial-video-back-rules';
  back.textContent='← Tutorial Video';
  back.addEventListener('click',()=>showVideo(false));
  nav?.prepend(back);
  rulesBtn.addEventListener('click',showRules);

  const openTutorial=()=>{
    showVideo(true);
    setTimeout(play,180);
  };
  document.getElementById('howToBtn')?.addEventListener('click',openTutorial);
  document.getElementById('railHowTo')?.addEventListener('click',openTutorial);

  dialog.addEventListener('close',()=>{
    pause();
    showVideo(false);
  });
  dialog.addEventListener('cancel',pause);

  showVideo(true);
})();