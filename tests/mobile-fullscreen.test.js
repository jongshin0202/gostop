const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'mobile-fullscreen.js'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile-fullscreen.css'),'utf8');
const generator=fs.readFileSync(path.join(root,'scripts','write-runtime-config.mjs'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const runtimeConfig=fs.readFileSync(path.join(root,'runtime-config.js'),'utf8');

function loadFullscreen({width=390,height=844,touchPoints=1,coarse=true,overlayHidden=false,fullscreenElement=null,requestFullscreen=()=>Promise.resolve(),performanceLite=false}={}){
  const listeners={};
  const windowListeners={};
  const overlay={hidden:overlayHidden};
  const splashListeners={};
  const splashClasses=new Set();
  const splash={
    dataset:{},
    classList:{add(name){splashClasses.add(name);},remove(name){splashClasses.delete(name);},contains(name){return splashClasses.has(name);}},
    setAttribute(){},
    addEventListener(type,fn){splashListeners[type]=fn;}
  };
  const documentElement={requestFullscreen,classList:{contains(){return false;}}};
  const document={
    fullscreenElement,documentElement,
    head:{appendChild(){}},
    createElement(){return {dataset:{}};},
    querySelector(){return null;},
    getElementById(id){if(id==='soloStartOverlay')return overlay;if(id==='gostopBootSplash')return splash;return null;},
    addEventListener(type,fn,opts){listeners[type]={fn,opts};}
  };
  const context={
    GOSTOP_TEST_MODE:true,GOSTOP_PERFORMANCE_LITE:performanceLite,document,
    navigator:{maxTouchPoints:touchPoints},
    innerWidth:width,innerHeight:height,
    matchMedia(){return {matches:coarse};},
    requestAnimationFrame(fn){fn();},
    dispatchEvent(){},Event:class Event{},
    addEventListener(type,fn){windowListeners[type]={fn};}
  };
  context.globalThis=context;
  vm.runInNewContext(source,context);
  return {api:context.GOSTOP_FULLSCREEN_TEST_API,listeners,windowListeners,overlay,splash,splashListeners,splashClasses,document,context};
}

test('mobile fullscreen eligibility covers portrait and phone landscape but not desktop',()=>{
  const {api}=loadFullscreen();
  assert.equal(api.isMobileFullscreenEligible({navigator:{maxTouchPoints:1},innerWidth:390,innerHeight:844,matchMedia:()=>({matches:true})}),true);
  assert.equal(api.isMobileFullscreenEligible({navigator:{maxTouchPoints:1},innerWidth:932,innerHeight:430,matchMedia:()=>({matches:true})}),true);
  assert.equal(api.isMobileFullscreenEligible({navigator:{maxTouchPoints:0},innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false})}),false);
  assert.equal(api.isMobileFullscreenEligible({navigator:{maxTouchPoints:1},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:true})}),false);
});

test('fullscreen requests the document element and fails silently',async()=>{
  let calls=0;
  const {api,document}=loadFullscreen({requestFullscreen:()=>{calls++;return Promise.resolve();}});
  assert.equal(api.requestGameFullscreen(document),true);
  assert.equal(calls,1);
  document.fullscreenElement=document.documentElement;
  assert.equal(api.requestGameFullscreen(document),false);
  assert.equal(calls,1);
  document.fullscreenElement=null;
  document.documentElement.requestFullscreen=()=>Promise.reject(new Error('denied'));
  assert.doesNotThrow(()=>api.requestGameFullscreen(document));
  await new Promise(resolve=>setImmediate(resolve));
  document.documentElement.requestFullscreen=()=>{throw new Error('blocked');};
  assert.equal(api.requestGameFullscreen(document),false);
});

test('start-screen capture listener only reacts to main-screen buttons',()=>{
  let calls=0;
  const {listeners,overlay}=loadFullscreen({requestFullscreen:()=>{calls++;return Promise.resolve();}});
  assert.equal(listeners.click.opts.capture,true);
  const mainButton={closest(selector){if(selector==='button')return this;if(selector==='#soloStartOverlay, .topbar')return this;return null;}};
  const input={closest(){return null;}};
  listeners.click.fn({target:mainButton});
  assert.equal(calls,1);
  listeners.click.fn({target:input});
  assert.equal(calls,1);
  overlay.hidden=true;
  listeners.click.fn({target:mainButton});
  assert.equal(calls,1);
});

test('main-menu reveal attempts fullscreen and a denied automatic request stays armed for the next menu gesture',async()=>{
  let calls=0,allow=false;
  const {api,listeners,document}=loadFullscreen({requestFullscreen:()=>{calls++;return allow?Promise.resolve():Promise.reject(new Error('user activation required'));}});
  assert.equal(api.requestMainMenuFullscreen(document),true);
  assert.equal(calls,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.isMainMenuFullscreenArmed(),true);
  allow=true;
  const menuSurface={closest(selector){return selector==='#soloStartOverlay, .topbar'?this:null;}};
  listeners.click.fn({target:menuSurface});
  assert.equal(calls,2);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.isMainMenuFullscreenArmed(),false);
});

test('repeated automatic main-menu reveals do not repeatedly request fullscreen',async()=>{
  let calls=0;
  const {api,document}=loadFullscreen({requestFullscreen:()=>{calls++;return Promise.reject(new Error('user activation required'));}});
  assert.equal(api.requestMainMenuFullscreen(document),true);
  assert.equal(api.requestMainMenuFullscreen(document),false);
  assert.equal(api.requestMainMenuFullscreen(document),false);
  assert.equal(calls,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.isMainMenuAutoAttempted(),true);
  assert.equal(api.isMainMenuFullscreenArmed(),true);
});

test('lite phones never request fullscreen, including on menu gestures',async()=>{
  let calls=0;
  const {api,listeners,document}=loadFullscreen({performanceLite:true,requestFullscreen:()=>{calls++;return Promise.resolve();}});
  assert.equal(api.requestMainMenuFullscreen(document),false);
  assert.equal(calls,0);
  assert.equal(api.isMainMenuFullscreenArmed(),false);
  const menuSurface={closest(selector){return selector==='#soloStartOverlay, .topbar'?this:null;}};
  listeners.click.fn({target:menuSurface});
  assert.equal(calls,0);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.isMainMenuFullscreenArmed(),false);
});

test('mobile boot gate waits for splash tap, verifies fullscreen, then releases main-menu reveal',async()=>{
  let calls=0;
  const {api,splashListeners,splashClasses,splash,document}=loadFullscreen({performanceLite:true,requestFullscreen:()=>{calls++;document.fullscreenElement=document.documentElement;return Promise.resolve();}});
  const gate=api.gateInitialMainMenuFullscreen(document);
  assert.ok(gate&&typeof gate.then==='function');
  assert.equal(calls,0);
  assert.equal(splashClasses.has('gostop-boot-ready'),true);
  assert.equal(splash.dataset.startLabel,'Tap to Start');
  splashListeners.touchend({preventDefault(){}});
  await gate;
  assert.equal(calls,1);
  assert.equal(api.isInitialMenuGateComplete(),true);
  assert.equal(splashClasses.has('gostop-boot-ready'),false);
  assert.equal(api.gateInitialMainMenuFullscreen(document),null);
});

test('completed splash gate suppresses later main-menu fullscreen retries when Chrome did not actually enter fullscreen',async()=>{
  let calls=0;
  const {api,splashListeners,document}=loadFullscreen({requestFullscreen:()=>{calls++;return Promise.resolve();}});
  const gate=api.gateInitialMainMenuFullscreen(document);
  splashListeners.touchend({preventDefault(){}});await Promise.resolve();
  splashListeners.touchend({preventDefault(){}});await Promise.resolve();
  splashListeners.touchend({preventDefault(){}});await gate;
  assert.equal(calls,3);
  assert.equal(api.isInitialMenuGateComplete(),true);
  assert.equal(api.requestMainMenuFullscreen(document,{userGesture:true}),false);
  assert.equal(calls,3);
  assert.equal(api.isMainMenuFullscreenArmed(),false);
});

test('mobile boot gate retries fullscreen instead of revealing the menu after a failed tap',async()=>{
  let calls=0;
  const {api,splashListeners,splash,document}=loadFullscreen({requestFullscreen:()=>{calls++;return Promise.resolve();}});
  const gate=api.gateInitialMainMenuFullscreen(document);
  splashListeners.touchend({preventDefault(){}});
  await Promise.resolve();
  assert.equal(calls,1);
  assert.equal(api.isInitialMenuGateComplete(),false);
  assert.equal(splash.dataset.startLabel,'Tap Again for Full Screen');
  document.fullscreenElement=document.documentElement;
  splashListeners.touchend({preventDefault(){}});
  await gate;
  assert.equal(calls,2);
  assert.equal(api.isInitialMenuGateComplete(),true);
});

test('rotation-related fullscreen exit is re-armed only for the next gameplay gesture',()=>{
  let calls=0;
  const {api,listeners,windowListeners,document}=loadFullscreen({overlayHidden:true,requestFullscreen:()=>{calls++;return Promise.resolve();}});
  const gameTarget={closest(selector){return selector==='.app-shell'?this:null;}};

  document.fullscreenElement=document.documentElement;
  listeners.fullscreenchange.fn();
  windowListeners.orientationchange.fn();
  document.fullscreenElement=null;
  listeners.fullscreenchange.fn();
  assert.equal(api.isOrientationRecoveryArmed(),true);

  listeners.click.fn({target:gameTarget});
  assert.equal(calls,1);
  assert.equal(api.isOrientationRecoveryArmed(),false);

  document.fullscreenElement=document.documentElement;
  listeners.fullscreenchange.fn();
  document.fullscreenElement=null;
  listeners.fullscreenchange.fn();
  assert.equal(api.isOrientationRecoveryArmed(),false);
});

test('fullscreen integration preserves gameplay click propagation while splash touch owns only its start gesture',()=>{
  assert.doesNotMatch(source,/stopPropagation\s*\(/);
  assert.match(source,/const nativeTouch=\('ontouchstart' in globalThis\)\|\|Number\(globalThis\.navigator\?\.maxTouchPoints\|\|0\)>0/);
  assert.match(source,/splash\.addEventListener\('touchend',enter,\{once:true,passive:false\}\)/);
  assert.match(source,/event\?\.preventDefault\?\.\(\)/);
  assert.match(source,/doc\?\.documentElement/);
  assert.match(source,/addEventListener\('click',handleFullscreenClick,\{capture:true\}\)/);
  assert.match(source,/fullscreenchange/);
  assert.match(source,/orientationchange/);
  assert.match(source,/orientationRecoveryArmed/);
  assert.match(source,/requestMainMenuFullscreen/);
  assert.match(source,/mainMenuFullscreenArmed/);
  assert.match(source,/GoStopMobileFullscreen/);
  assert.match(css,/@media \(max-width:700px\) and \(orientation:portrait\)/);
  assert.match(css,/:fullscreen \.app-shell\{height:100vh;height:100dvh\}/);
  assert.match(css,/:fullscreen \.topbar\{[\s\S]*height:40px;[\s\S]*min-height:40px/);
  assert.match(css,/height:calc\(100dvh - 44px\)/);
  assert.match(css,/grid-template-rows:100px minmax\(0,1fr\) 224px/);
  assert.match(css,/:fullscreen \.table\{border-width:16px\}/);
  assert.match(css,/:fullscreen \.table-center\{inset:18px 4px 12px\}/);
  assert.match(css,/:fullscreen \.floor\{padding:0 1px;gap:0\}/);
  assert.match(css,/:fullscreen \.player-zone\{[\s\S]*grid-template-rows:100px 54px 36px!important;[\s\S]*align-content:start/);
  assert.match(css,/:fullscreen \.hand\{grid-row:1!important;align-items:flex-start/);
  assert.match(css,/:fullscreen \.player-capture-panel\{grid-row:2!important\}/);
  assert.match(css,/:fullscreen \.player-row\{grid-row:3!important;align-self:start\}/);
  assert.match(css,/:fullscreen \.table:after\{bottom:-16px;height:24px\}/);
  assert.match(css,/:fullscreen \.capture-stack\{height:28px\}/);
  assert.match(css,/:fullscreen \.captured-mini\{width:17px!important;height:auto!important;aspect-ratio:var\(--card-aspect\)\}/);
  assert.match(css,/@media \(orientation:landscape\) and \(max-height:600px\) and \(max-width:1000px\)/);
  assert.match(css,/grid-template-rows:44px minmax\(0,1fr\) 68px/);
  assert.match(css,/:fullscreen \.table\{border-width:5px\}/);
  assert.match(css,/:fullscreen \.table-center\{inset:2px 6px 2px\}/);
  assert.match(css,/:fullscreen \.floor\{padding:0 3px;gap:0 2px\}/);
  assert.match(css,/:fullscreen \.captured-mini\{width:15px!important;height:auto!important;aspect-ratio:var\(--card-aspect\)\}/);
  assert.match(source,/mobile-fullscreen\.css\?v=20260924-2/);
  assert.match(index,/<script src="runtime-config\.js\?v=20260924-5"><\/script>[\s\S]*<script src="mobile-fullscreen\.js\?v=20260924-7"><\/script>[\s\S]*<script src="ranked-client\.js\?v=20260924-13"><\/script>/);
  assert.match(source,/requestFullscreen\(\{navigationUI:'hide'\}\)/);
  assert.doesNotMatch(runtimeConfig,/mobile-fullscreen\.js/);
  assert.doesNotMatch(generator,/mobile-fullscreen\.js/);
});
