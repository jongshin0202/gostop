/* Development-only mobile fullscreen recovery. No changes to rooms, game,
 * session credentials, scoring, or the protected mobile fullscreen runtime.
 */
(()=>{
'use strict';
const hostname=globalThis.location?.hostname||'';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(hostname))return;
const ID='devFullscreenReturnPrompt';
const copy={
 en:{message:'Tap the button to enter full screen mode.',enter:'Full Screen Mode',keep:'Continue Game',
  failed:'This browser did not allow full screen. Tap again, or open the game in Chrome to use full screen.'},
 ko:{message:'전체 화면 모드로 돌아가려면 버튼을 누르세요.',enter:'전체 화면 모드',keep:'게임 계속하기',
  failed:'이 브라우저에서 전체 화면을 허용하지 않았습니다. 다시 누르거나 Chrome에서 게임을 열어 주세요.'},
 es:{message:'Toca el botón para volver a pantalla completa.',enter:'Pantalla completa',keep:'Continuar partida',
  failed:'El navegador no permitió pantalla completa. Inténtalo otra vez o abre el juego en Chrome.'},
 fr:{message:'Touchez le bouton pour revenir en plein écran.',enter:'Mode plein écran',keep:'Continuer la partie',
  failed:'Le navigateur a refusé le plein écran. Réessayez ou ouvrez le jeu dans Chrome.'},
 de:{message:'Tippen Sie auf die Schaltfläche für den Vollbildmodus.',enter:'Vollbildmodus',keep:'Spiel fortsetzen',
  failed:'Der Browser hat den Vollbildmodus abgelehnt. Versuchen Sie es erneut oder öffnen Sie das Spiel in Chrome.'},
 ja:{message:'ボタンをタップして全画面モードに戻ってください。',enter:'全画面モード',keep:'ゲームを続ける',
  failed:'このブラウザーでは全画面表示が許可されませんでした。再試行するか Chrome で開いてください。'},
 zh:{message:'点击按钮返回全屏模式。',enter:'全屏模式',keep:'继续游戏',
  failed:'浏览器未允许全屏。请重试，或在 Chrome 中打开游戏。'}
};
const locale=()=>copy[(document.documentElement.lang||'en').toLowerCase().split('-')[0]]||copy.en;
const eligible=()=>globalThis.GoStopMobileFullscreen?.isMobileFullscreenEligible?.()===true;
const inGame=()=>{
 const menu=document.getElementById('soloStartOverlay');
 return menu?.hidden===true&&!!document.getElementById('appShell')&&
  !document.documentElement.classList.contains('gostop-boot-pending');
};
// Training Mode and the rest of the game use native modal dialogs. Their
// existence must never suppress foreground fullscreen recovery: the recovery
// dialog itself enters the browser top layer above them.
const inviteGateOpen=()=>!!document.querySelector('#devInviteFullscreenGate:not([hidden])');
let textEntryUntil=0;
// A checked opening-strategy checkbox is not a keyboard/text-entry action.
// Suppressing the prompt for every input element prevented second recovery.
const isTextEntry=element=>!!element?.matches?.(
 'textarea,select,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"])');
const editing=()=>isTextEntry(document.activeElement)||Date.now()<textEntryUntil;
let timer=null,prompt=null,dismissed=false;
function hide(){
 if(!prompt)return;
 const current=prompt;prompt=null;
 if(current.open&&typeof current.close==='function')current.close();
 current.remove();
}
function style(){
 if(document.getElementById('devFullscreenReturnStyle'))return;
 const element=document.createElement('style');element.id='devFullscreenReturnStyle';
 element.textContent=
  '#devFullscreenReturnPrompt:not([open]){display:none!important}'+
  '#devFullscreenReturnPrompt{position:fixed;inset:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;z-index:2147483500;background:#16110de8;color:#ffebcc;padding:20px;text-align:center;font-family:system-ui,sans-serif}'+
  '#devFullscreenReturnPrompt::backdrop{background:#16110de8}'+
  '#devFullscreenReturnPrompt .dev-fullscreen-card{box-sizing:border-box;width:100%;max-width:430px;padding:24px 18px;background:#281c16;border:2px solid #ba914c;border-radius:18px;box-shadow:0 8px 48px #000a}'+
  '#devFullscreenReturnPrompt h2{font-size:clamp(21px,5vw,25px);margin:0 0 12px}'+
  '#devFullscreenReturnPrompt p{font-size:15px;line-height:1.55;margin:0 0 20px}'+
  '#devFullscreenReturnPrompt .dev-fullscreen-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}'+
  '#devFullscreenReturnPrompt button{min-height:48px;padding:10px 16px;border-radius:9px;border:1px solid #c99b5d;background:#8d3824;color:white;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation}'+
  '#devFullscreenReturnPrompt button[data-kind="secondary"]{background:#37281e}';
 document.head.append(element);
}
function show(){
 if(prompt||!eligible()||!inGame()||document.fullscreenElement||inviteGateOpen()||editing()||
    document.visibilityState==='hidden'||dismissed)return;
 style();
 const strings=locale(),layer=document.createElement('dialog');layer.id=ID;
 // showModal() is required: z-index alone cannot overlay an existing
 // <dialog> top layer such as the Opening Strategy Review.
 layer.addEventListener('cancel',event=>event.preventDefault());
 layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
 layer.setAttribute('aria-labelledby',ID+'Title');layer.setAttribute('aria-describedby',ID+'Description');
 const card=document.createElement('div');card.className='dev-fullscreen-card';
 const title=document.createElement('h2');title.id=ID+'Title';title.textContent='GoStop Live!';
 const message=document.createElement('p');message.id=ID+'Description';message.textContent=strings.message;
 const actions=document.createElement('div');actions.className='dev-fullscreen-actions';
 const enter=document.createElement('button');enter.type='button';enter.textContent=strings.enter;
 const keep=document.createElement('button');keep.type='button';keep.dataset.kind='secondary';
 keep.textContent=strings.keep;
 enter.addEventListener('click',async()=>{
  // Request synchronously within the tap, not after a timer or network request.
  const element=document.documentElement;
  if(typeof element.requestFullscreen!=='function'||document.fullscreenEnabled===false){
   message.textContent=strings.failed;return;
  }
  enter.disabled=true;
  try{
   await element.requestFullscreen({navigationUI:'hide'});
   if(document.fullscreenElement){hide();dismissed=false;return;}
  }catch(_){}
  message.textContent=strings.failed;enter.disabled=false;
 });
 keep.addEventListener('click',()=>{dismissed=true;hide();});
 actions.append(enter,keep);card.append(title,message,actions);layer.append(card);
 document.body.append(layer);prompt=layer;
 try{
  layer.showModal();
  enter.focus({preventScroll:true});
 }catch(_){
  // Never leave an inaccessible recovery control behind a native modal.
  hide();schedule(900);
 }
}
function check(){
 timer=null;
 if(document.fullscreenElement){hide();dismissed=false;return;}
 if(document.visibilityState==='hidden'||!eligible()||!inGame()){hide();return;}
 if(inviteGateOpen())return;
 if(editing()){
  if(Date.now()<textEntryUntil)schedule(1500);
  return;
 }
 show();
}
function schedule(delay=650){
 if(timer!==null)clearTimeout(timer);
 timer=setTimeout(check,delay);
}
function onHidden(){
 if(timer!==null){clearTimeout(timer);timer=null;}
 hide();dismissed=false; // A future foreground return is a new recovery opportunity.
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='hidden')onHidden();else schedule(650);
});
document.addEventListener('fullscreenchange',()=>{
 if(document.fullscreenElement){hide();dismissed=false;
  if(timer!==null){clearTimeout(timer);timer=null;}
 }else if(document.visibilityState!=='hidden')schedule(650);
});
document.addEventListener('focusin',event=>{
 if(isTextEntry(event.target))
  textEntryUntil=Date.now()+1400;
},{capture:true,passive:true});
document.addEventListener('focusout',event=>{
 if(isTextEntry(event.target)){
  textEntryUntil=Date.now()+1400;schedule(1600);
 }
},{capture:true,passive:true});
globalThis.addEventListener?.('focus',()=>schedule(650));
globalThis.addEventListener?.('pageshow',()=>schedule(650));
globalThis.addEventListener?.('pagehide',onHidden);
globalThis.addEventListener?.('orientationchange',()=>schedule(750));
})();
