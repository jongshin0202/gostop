(() => {
  'use strict';

  const dialog=document.getElementById('howToDialog');
  const view=document.getElementById('tutorialVideoView');
  const video=document.getElementById('tutorialVideoPlayer');
  const caption=document.getElementById('tutorialVideoCaption');
  const rulesBtn=document.getElementById('tutorialFullRulesBtn');
  const trainingBtn=document.getElementById('tutorialTrainingModeBtn');
  const nav=dialog?.querySelector('.tutorial-nav');
  const sections=dialog?.querySelector('.tutorial-sections');
  if(!dialog||!view||!video||!caption||!rulesBtn||!trainingBtn)return;

  let timeline=[];
  let captionsLoaded=false;
  let lastCaption='';

  const loadCaptions=async()=>{
    if(captionsLoaded)return;
    captionsLoaded=true;
    try{
      const response=await fetch('assets/gostop-live-how-to-play-captions.json',{cache:'no-cache'});
      if(!response.ok)throw new Error('captions unavailable');
      const data=await response.json();
      timeline=Array.isArray(data?.timeline)?data.timeline:[];
    }catch(_){
      timeline=[];
    }
  };

  const captionFor=time=>{
    const cue=timeline.find(item=>time>=Number(item.start||0)&&time<Number(item.end||0));
    return cue?.text||'';
  };

  const syncCaption=()=>{
    const text=captionFor(video.currentTime)||(
      video.ended?'Have fun playing GoStop Live!':
      video.currentTime<1?'Welcome to GoStop Live!':''
    );
    if(text===lastCaption)return;
    lastCaption=text;
    caption.textContent=text;
  };

  const playVideo=()=>{
    const result=video.play();
    if(result?.catch)result.catch(()=>{});
  };

  const showVideo=(restart=false)=>{
    if(nav)nav.hidden=true;
    if(sections)sections.hidden=true;
    view.hidden=false;
    if(restart){
      try{video.currentTime=0;}catch(_){}
      lastCaption='';
      caption.textContent='Welcome to GoStop Live!';
    }
    void loadCaptions().then(syncCaption);
  };

  const showRules=()=>{
    video.pause();
    view.hidden=true;
    if(nav)nav.hidden=false;
    if(sections)sections.hidden=false;
    sections?.scrollTo?.({top:0,behavior:'instant'});
  };

  let back=nav?.querySelector('.tutorial-video-back-rules');
  if(nav&&!back){
    back=document.createElement('button');
    back.type='button';
    back.className='tutorial-video-back-rules';
    back.textContent='← Tutorial Video';
    nav.prepend(back);
  }
  back?.addEventListener('click',()=>{
    showVideo(false);
    playVideo();
  });

  rulesBtn.addEventListener('click',showRules);
  trainingBtn.addEventListener('click',()=>{
    video.pause();
    try{dialog.close();}catch(_){}
    setTimeout(()=>{
      const friendly=document.getElementById('friendlyGamingBtn');
      const training=document.getElementById('trainingModeBtn');
      if(friendly?.getAttribute('aria-expanded')!=='true')friendly?.click();
      setTimeout(()=>training?.click(),80);
    },0);
  });

  const openTutorial=()=>{
    showVideo(true);
    playVideo();
  };

  document.getElementById('howToBtn')?.addEventListener('click',openTutorial);
  document.getElementById('railHowTo')?.addEventListener('click',openTutorial);

  video.addEventListener('timeupdate',syncCaption);
  video.addEventListener('seeking',syncCaption);
  video.addEventListener('loadedmetadata',syncCaption);
  video.addEventListener('ended',syncCaption);
  video.addEventListener('click',()=>video.paused?playVideo():video.pause());
  video.addEventListener('keydown',event=>{
    if(event.key!==' '&&event.key!=='Enter')return;
    event.preventDefault();
    video.paused?playVideo():video.pause();
  });
  video.tabIndex=0;

  dialog.addEventListener('close',()=>video.pause());
  dialog.addEventListener('cancel',()=>video.pause());

  showVideo(true);
  void loadCaptions();
})();