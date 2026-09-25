const test=require('node:test');
const assert=require('node:assert/strict');
const plan=require('../presentation-plan.js');

function classList(){
  const set=new Set();
  return {add:name=>set.add(name),remove:name=>set.delete(name),contains:name=>set.has(name),has:name=>set.has(name)};
}

function mobileHarness(){
  const listeners=new Map(),activations=[];
  const slot={dataset:{handKey:'m1-1'},classList:classList(),isConnected:true};
  const card={
    dataset:{cardId:'m1-1'},disabled:false,style:{},classList:classList(),isConnected:true,
    getAttribute(){return null;},
    closest(selector){if(selector==='#playerHand .hand-card')return this;if(selector==='.hand-card-slot')return slot;return null;},
    getBoundingClientRect(){return {left:100,top:500,width:58,height:94};},
    cloneNode(){return {style:{},classList:classList(),tabIndex:0,removeAttribute(){},setAttribute(){},remove(){}};},
    click(){activations.push({cardId:'m1-1',blank:false});}
  };
  const hand={
    classList:classList(),scrollLeft:0,
    getBoundingClientRect(){return {left:0,right:390,top:480,bottom:610,width:390,height:130};}
  };
  const doc={
    documentElement:{dataset:{}},
    head:{appendChild(){}},body:{appendChild(){}},
    createElement(tag){return tag==='style'?{dataset:{},textContent:''}:{dataset:{},style:{},classList:classList()};},
    getElementById(id){return id==='playerHand'?hand:null;},
    querySelectorAll(selector){
      if(selector==='#playerHand .hand-card')return [card];
      if(selector==='#playerHand .hand-card-slot.is-hovered')return slot.classList.contains('is-hovered')?[slot]:[];
      return [];
    },
    addEventListener(type,fn,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({fn,options});},
    dispatchEvent(){return true;}
  };
  const fire=(type,event)=>{for(const item of listeners.get(type)||[])item.fn(event);};
  const touch=(identifier,x,y)=>({identifier,clientX:x,clientY:y});
  const eventBase=()=>({preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}});
  return {doc,card,slot,hand,listeners,activations,fire,touch,eventBase};
}

test('Android Chrome prefers native Touch Events, second tap commits, upward flick commits, and horizontal browse never commits',()=>{
  const pointerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'PointerEvent');
  const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const touchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'ontouchstart');
  try{
    Object.defineProperty(globalThis,'PointerEvent',{value:function PointerEvent(){},configurable:true});
    Object.defineProperty(globalThis,'navigator',{value:{maxTouchPoints:5},configurable:true});
    Object.defineProperty(globalThis,'ontouchstart',{value:null,configurable:true});

    const h=mobileHarness();
    assert.equal(plan.installHandFlickGestures(h.doc),true);
    assert.equal(h.listeners.has('touchstart'),true);
    assert.equal(h.listeners.has('touchmove'),true);
    assert.equal(h.listeners.has('touchend'),true);
    assert.equal(h.listeners.has('pointerdown'),false,'native Touch Events own Android hand gestures on touch-capable devices');

    const touchEvent=(id,x,y,{end=false}={})=>{
      const point=h.touch(id,x,y),base={...h.eventBase(),target:h.card};
      return end?{...base,touches:[],changedTouches:[point]}:{...base,touches:[point],changedTouches:[]};
    };

    h.fire('touchstart',touchEvent(1,125,550));
    h.fire('touchend',touchEvent(1,125,550,{end:true}));
    assert.equal(h.activations.length,0,'first tap only selects the card');
    assert.equal(h.slot.classList.contains('is-hovered'),true);

    h.fire('touchstart',touchEvent(2,125,550));
    h.fire('touchend',touchEvent(2,125,550,{end:true}));
    assert.deepEqual(h.activations,[{cardId:'m1-1',blank:false}],'second tap commits the same selected card');

    h.fire('touchstart',touchEvent(3,125,550));
    h.fire('touchmove',touchEvent(3,128,525));
    h.fire('touchend',touchEvent(3,128,505,{end:true}));
    assert.deepEqual(h.activations,[{cardId:'m1-1',blank:false},{cardId:'m1-1',blank:false}],'upward flick commits immediately');

    h.fire('touchstart',touchEvent(4,125,550));
    h.fire('touchmove',touchEvent(4,180,548));
    h.fire('touchend',touchEvent(4,190,548,{end:true}));
    assert.equal(h.activations.length,2,'horizontal browse must never submit a card');
  }finally{
    if(pointerDescriptor)Object.defineProperty(globalThis,'PointerEvent',pointerDescriptor);else delete globalThis.PointerEvent;
    if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
    if(touchDescriptor)Object.defineProperty(globalThis,'ontouchstart',touchDescriptor);else delete globalThis.ontouchstart;
  }
});
