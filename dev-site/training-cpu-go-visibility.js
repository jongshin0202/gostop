/* Development-only, self-contained computer GO! presentation monitor.
 * Watches the existing public GO animation and public computer GO-count badge.
 * Cannot trigger, veto, or replay any game action. Does not read hidden cards.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const badge=document.querySelector('.cpu-status-component .go-count-badge');
const native=document.getElementById('goCallout');
const opponent=document.querySelector('.opponent-zone');
if(!badge||!native||!opponent)return;
const CSS_CLASS='dev-training-cpu-go-monitor';
let training=false,prior=null,shown=0,lastAt=0,overlay=null,hideTimer=null;
const count=()=>{const n=Number(/\d+/.exec(badge.textContent||'')?.[0]||0);return Number.isFinite(n)?n:0;};
function resetVisual(){
 if(hideTimer!==null)clearTimeout(hideTimer);
 hideTimer=null;if(overlay)overlay.hidden=true;
}
function announce(source){
 if(!training)return;
 const now=Date.now();
 // Native animation and the later public badge change are the SAME GO.
 if(now-lastAt<2500)return;
 lastAt=now;
 if(!overlay){
  overlay=document.createElement('div');overlay.id='devTrainingCpuGo';
  overlay.className='dev-training-cpu-go-announce';
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','assertive');
  document.body.appendChild(overlay);
 }
 overlay.textContent='GO!';
 const rect=opponent.getBoundingClientRect();
 overlay.style.left=Math.max(70,Math.min(innerWidth-70,rect.left+rect.width/2))+'px';
 overlay.style.top=Math.max(75,Math.min(innerHeight-70,rect.top+Math.min(115,rect.height*.4)))+'px';
 overlay.hidden=false;overlay.classList.remove('animate');
 void overlay.offsetWidth;overlay.classList.add('animate');
 shown++;
 if(hideTimer!==null)clearTimeout(hideTimer);
 hideTimer=setTimeout(()=>{overlay.hidden=true;hideTimer=null;},1600);
}
function onBadge(){
 if(!training)return;
 const next=count();
 if(prior!==null&&next>prior)announce('badge');
 prior=next;
}
const badgeObserver=new MutationObserver(onBadge);
badgeObserver.observe(badge,{childList:true,characterData:true,subtree:true});
const nativeObserver=new MutationObserver(()=>{
 if(training&&native.classList.contains('go-callout-ai')&&native.classList.contains('show'))
  announce('native');
});
nativeObserver.observe(native,{attributes:true,attributeFilter:['class']});
document.addEventListener('click',event=>{
 const t=event.target;
 if(t?.closest?.('#trainingModeBtn')){
  training=true;prior=count();lastAt=0;resetVisual();document.documentElement.classList.add(CSS_CLASS);
 }else if(t?.closest?.('#playAgainBtn,#newGameYesBtn')&&training){
  prior=count();lastAt=0;resetVisual();
 }else if(t?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
  training=false;prior=null;lastAt=0;resetVisual();document.documentElement.classList.remove(CSS_CLASS);
 }
},{capture:true});
globalThis.GoStopDevCpuGoVisibility=Object.freeze({
 getStatus:()=>({active:training,announcements:shown,previousGoCount:prior,
  visible:!!overlay&&!overlay.hidden})
});
})();
