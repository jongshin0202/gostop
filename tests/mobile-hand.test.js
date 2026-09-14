const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'mobile-hand.js'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile-hand.css'),'utf8');
const generator=fs.readFileSync(path.join(root,'scripts','write-runtime-config.mjs'),'utf8');

function makeClassList(){
  const set=new Set();
  return {add:n=>set.add(n),remove:n=>set.delete(n),toggle(name,on){if(on)set.add(name);else set.delete(name);},contains:name=>set.has(name)};
}
function makeStyle(){const map=new Map();return {setProperty:(k,v)=>map.set(k,v),removeProperty:k=>map.delete(k),get:k=>map.get(k)};}
function makeCard(id,left=0){
  let hand=null;
  const slot={dataset:{handKey:id},classList:makeClassList(),style:makeStyle(),offsetWidth:54,getBoundingClientRect(){return {left,width:54}},querySelector(){return card;}};
  const card={id,disabled:false,clickCount:0,click(){this.clickCount++;},closest(selector){if(selector==='.hand-card')return this;if(selector==='.hand-card-slot')return slot;if(selector==='#playerHand')return hand;return null;}};
  return {card,slot,setHand:value=>{hand=value;}};
}
function loadMobileHand(){
  const listeners={};
  const windowListeners={};
  const one=makeCard('one',0),two=makeCard('two',63);
  const slots=[one.slot,two.slot];
  const hand={
    clientWidth:390,style:makeStyle(),classList:makeClassList(),
    querySelectorAll(){return slots;},getBoundingClientRect(){return {width:390}},
    setPointerCapture(){},hasPointerCapture(){return false;},releasePointerCapture(){}
  };
  one.setHand(hand);two.setHand(hand);
  const document={
    head:{appendChild(){}},createElement(){return {dataset:{}};},querySelector(){return null;},
    getElementById(id){return id==='playerHand'?hand:null;},addEventListener(type,fn,opts){listeners[type]={fn,opts};}
  };
  const context={
    GOSTOP_TEST_MODE:true,document,navigator:{maxTouchPoints:1},innerWidth:390,innerHeight:844,
    matchMedia:()=>({matches:true}),performance:{now:()=>1000},Date,Math,
    requestAnimationFrame(fn){fn();return 1;},getComputedStyle(){return {paddingLeft:'6',paddingRight:'6'};},
    addEventListener(type,fn){windowListeners[type]=fn;}
  };
  context.globalThis=context;
  vm.runInNewContext(source,context);
  return {api:context.GOSTOP_MOBILE_HAND_TEST_API,listeners,one,two,hand};
}
function evt(target,extra={}){return {target,pointerType:'touch',pointerId:1,clientX:20,clientY:200,timeStamp:100,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};}

test('mobile hand controls cover phone portrait and landscape but not desktop',()=>{
  const {api}=loadMobileHand();
  assert.equal(api.isMobileHandEligible({navigator:{maxTouchPoints:1},innerWidth:390,innerHeight:844,matchMedia:()=>({matches:true})}),true);
  assert.equal(api.isMobileHandEligible({navigator:{maxTouchPoints:1},innerWidth:932,innerHeight:430,matchMedia:()=>({matches:true})}),true);
  assert.equal(api.isMobileHandEligible({navigator:{maxTouchPoints:1},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:true})}),false);
});

test('flick threshold is lenient but still requires upward distance and velocity',()=>{
  const {api}=loadMobileHand();
  assert.equal(api.isDeliberateUpwardFlick([{y:200,time:100},{y:180,time:130}],165,160),true);
  assert.equal(api.isDeliberateUpwardFlick([{y:200,time:100}],182,160),false);
  assert.equal(api.isDeliberateUpwardFlick([{y:200,time:100}],170,300),false);
});

test('first tap selects and second tap commits exactly once',()=>{
  const {api,listeners,one}=loadMobileHand();
  listeners.pointerdown.fn(evt(one.card));
  listeners.pointerup.fn(evt(one.card,{timeStamp:120}));
  assert.equal(api.getSelectedCard(),one.card);
  assert.equal(one.card.clickCount,0);
  listeners.pointerdown.fn(evt(one.card,{timeStamp:200}));
  listeners.pointerup.fn(evt(one.card,{timeStamp:220}));
  assert.equal(one.card.clickCount,1);
  assert.equal(api.getSelectedCard(),null);
});

test('horizontal scrub switches the active card and normal release never plays',()=>{
  const {api,listeners,one,two}=loadMobileHand();
  listeners.pointerdown.fn(evt(one.card,{clientX:20,clientY:200,timeStamp:100}));
  listeners.pointermove.fn(evt(one.card,{clientX:95,clientY:198,timeStamp:130}));
  assert.equal(api.getGesture().previewCard,two.card);
  listeners.pointerup.fn(evt(two.card,{clientX:95,clientY:198,timeStamp:150}));
  assert.equal(one.card.clickCount,0);assert.equal(two.card.clickCount,0);
  assert.equal(api.getSelectedCard(),null);
});

test('quick upward flick after a hold still commits the current card',()=>{
  const {listeners,one}=loadMobileHand();
  listeners.pointerdown.fn(evt(one.card,{clientY:200,timeStamp:100}));
  listeners.pointermove.fn(evt(one.card,{clientY:197,timeStamp:300}));
  listeners.pointermove.fn(evt(one.card,{clientY:170,timeStamp:340}));
  listeners.pointerup.fn(evt(one.card,{clientY:160,timeStamp:360}));
  assert.equal(one.card.clickCount,1);
});

test('adaptive spacing exposes more card surface as the hand gets smaller',()=>{
  const {api}=loadMobileHand();
  const ten=api.computeAdaptiveStep(378,54,10);
  const seven=api.computeAdaptiveStep(378,54,7);
  const four=api.computeAdaptiveStep(378,54,4);
  assert.ok(seven>ten);assert.ok(four>seven);
});

test('integration uses compositor transforms, fast retracts, and both mobile orientations',()=>{
  assert.match(source,/FLICK_DISTANCE_PX=24/);
  assert.match(source,/FLICK_VELOCITY_PX_MS=0\.20/);
  assert.match(source,/FLICK_LOCK_PX=14/);
  assert.match(source,/computeAdaptiveStep/);
  assert.match(css,/@media \(hover:none\) and \(pointer:coarse\) and \(max-width:1000px\)/);
  assert.match(css,/overflow-x:hidden!important/);
  assert.match(css,/transition:transform \.07s ease-out/);
  assert.match(css,/translate3d/);
  assert.match(generator,/mobile-fullscreen\.js/);
  assert.match(generator,/mobile-hand\.js/);
});
