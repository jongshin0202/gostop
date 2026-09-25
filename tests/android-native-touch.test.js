const test=require('node:test');
const assert=require('node:assert/strict');
const plan=require('../presentation-plan.js');

function classList(){
  const set=new Set();
  return {add:name=>set.add(name),remove:name=>set.delete(name),contains:name=>set.has(name),has:name=>set.has(name)};
}

function mobileHarness(){
  const listeners=new Map(),activations=[];
  const hand={classList:classList(),scrollLeft:0,getBoundingClientRect(){return {left:0,right:390,top:480,bottom:610,width:390,height:130};}};
  const slot={
    dataset:{handKey:'m1-1'},classList:classList(),isConnected:true,
    querySelector(selector){return selector==='.hand-card'?card:null;}
  };
  const card={
    dataset:{cardId:'m1-1'},disabled:false,style:{},classList:classList(),isConnected:true,title:'',
    getAttribute(){return null;},
    closest(selector){if(selector==='#playerHand .hand-card')return this;if(selector==='.hand-card-slot')return slot;return null;},
    getBoundingClientRect(){return {left:100,top:500,width:58,height:94};},
    cloneNode(){return {style:{},classList:classList(),tabIndex:0,removeAttribute(){},setAttribute(){},remove(){}};},
    click(){activations.push('m1-1');}
  };
  const doc={
    documentElement:{dataset:{}},
    head:{appendChild(){}},body:{appendChild(){}},
    createElement(tag){return tag==='style'?{dataset:{},textContent:''}:{dataset:{},style:{},classList:classList()};},
    getElementById(id){return id==='playerHand'?hand:null;},
    querySelector(selector){if(selector==='#playerHand .hand-card-slot.is-hovered'&&slot.classList.contains('is-hovered'))return slot;return null;},
    querySelectorAll(selector){
      if(selector==='#playerHand .hand-card')return [card];
      if(selector==='#playerHand .hand-card-slot.is-hovered')return slot.classList.contains('is-hovered')?[slot]:[];
      return [];
    },
    addEventListener(type,fn,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({fn,options});}
  };
  const fire=(type,event)=>{for(const item of listeners.get(type)||[])item.fn(event);};
  const touch=(identifier,x,y)=>({identifier,clientX:x,clientY:y});
  const eventBase=()=>({preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediateStopped=true;}});
  const touchEvent=(type,id,x,y)=>({
    ...eventBase(),target:card,
    touches:type==='touchend'?[]:[touch(id,x,y)],
    changedTouches:type==='touchend'?[touch(id,x,y)]:[]
  });
  return {doc,card,slot,hand,listeners,activations,fire,touchEvent};
}

test('Android uses native Touch Events even when PointerEvent exists',()=>{
  const pointerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'PointerEvent');
  try{
    Object.defineProperty(globalThis,'PointerEvent',{value:function PointerEvent(){},configurable:true});
    const h=mobileHarness();
    assert.equal(plan.installHandFlickGestures(h.doc),true);
    assert.equal(h.listeners.has('touchstart'),true);
    assert.equal(h.listeners.has('touchmove'),true);
    assert.equal(h.listeners.has('touchend'),true);
    assert.equal(h.listeners.has('pointerdown'),true,'mouse pointer flick support remains installed');

    const pointerBlock=require('fs').readFileSync(require.resolve('../presentation-plan.js'),'utf8');
    assert.match(pointerBlock,/if\(event\.pointerType==='touch'\|\|event\.button!==0\)return/);
  }finally{
    if(pointerDescriptor)Object.defineProperty(globalThis,'PointerEvent',pointerDescriptor);else delete globalThis.PointerEvent;
  }
});

test('native Android first tap selects, second tap plays, upward flick plays, and horizontal browse does not play',()=>{
  const h=mobileHarness();
  assert.equal(plan.installHandFlickGestures(h.doc),true);

  h.fire('touchstart',h.touchEvent('touchstart',1,125,550));
  h.fire('touchend',h.touchEvent('touchend',1,125,550));
  assert.deepEqual(h.activations,[]);
  assert.equal(h.slot.classList.contains('is-hovered'),true);

  h.fire('touchstart',h.touchEvent('touchstart',2,125,550));
  h.fire('touchend',h.touchEvent('touchend',2,125,550));
  assert.deepEqual(h.activations,['m1-1']);

  h.fire('touchstart',h.touchEvent('touchstart',3,125,550));
  h.fire('touchmove',h.touchEvent('touchmove',3,128,515));
  h.fire('touchend',h.touchEvent('touchend',3,128,490));
  assert.deepEqual(h.activations,['m1-1','m1-1']);

  h.fire('touchstart',h.touchEvent('touchstart',4,125,550));
  h.fire('touchmove',h.touchEvent('touchmove',4,190,548));
  h.fire('touchend',h.touchEvent('touchend',4,200,548));
  assert.equal(h.activations.length,2);
});

test('new-hand reset clears native touch selection so an old first tap cannot commit in the next hand',()=>{
  const h=mobileHarness();
  assert.equal(plan.installHandFlickGestures(h.doc),true);
  h.fire('touchstart',h.touchEvent('touchstart',1,125,550));
  h.fire('touchend',h.touchEvent('touchend',1,125,550));
  assert.equal(h.slot.classList.contains('is-hovered'),true);

  h.fire('gostop-hand-reset',{});
  assert.equal(h.slot.classList.contains('is-hovered'),false);

  h.fire('touchstart',h.touchEvent('touchstart',2,125,550));
  h.fire('touchend',h.touchEvent('touchend',2,125,550));
  assert.deepEqual(h.activations,[],'first tap after reset selects instead of playing stale selection');
});
