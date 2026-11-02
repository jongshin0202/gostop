/* Development-only, removable Friendly invitation UX. The browser can only
 * enter fullscreen after an eligible user gesture; unsupported in-app browsers
 * get explicit guidance instead of silently launching outside fullscreen.
 * Does not change game state, networking, URL tokens, or protected game files.
 */
(function(root){
'use strict';
const translations={
 en:{enter:'Enter Fullscreen & Join Game',intro:'Tap to open your friend’s game in fullscreen.',
  retry:'This browser did not allow fullscreen. Use its menu to open the link in Chrome, or continue with the browser controls visible.',
  continue:'Continue without fullscreen',share:'Share Game Invitation',
  shareHelp:'Send this invitation link to your friend.',copy:'Copy Link',copied:'Link copied',
  manual:'Select the link and copy it using your keyboard.',email:'Email Link',
  native:'Share with Apps',cancel:'Close',cancelShare:'Sharing was canceled.',
  noRoom:'Create a Friendly room before sharing its link.'},
 ko:{enter:'전체 화면으로 게임 참가',intro:'화면을 눌러 전체 화면으로 친구의 게임에 참가하세요.',
  retry:'이 브라우저에서는 전체 화면을 허용하지 않습니다. 브라우저 메뉴에서 Chrome으로 열거나 일반 화면으로 계속하세요.',
  continue:'일반 화면으로 계속',share:'게임 초대 링크 공유',shareHelp:'친구에게 이 초대 링크를 보내세요.',
  copy:'링크 복사',copied:'링크가 복사되었습니다',manual:'링크를 선택한 후 복사해 주세요.',
  email:'이메일로 보내기',native:'앱으로 공유',cancel:'닫기',cancelShare:'공유가 취소되었습니다.',
  noRoom:'먼저 친구 게임방을 만들어 주세요.'},
 es:{enter:'Pantalla completa y unirse',intro:'Toca para entrar en la partida a pantalla completa.',
  retry:'Este navegador no permite pantalla completa. Abre el enlace en Chrome desde el menú o continúa con las barras visibles.',
  continue:'Continuar sin pantalla completa',share:'Compartir invitación',shareHelp:'Envía este enlace a tu amigo.',
  copy:'Copiar enlace',copied:'Enlace copiado',manual:'Selecciona el enlace y cópialo con el teclado.',
  email:'Enviar por correo',native:'Compartir con apps',cancel:'Cerrar',cancelShare:'Compartir cancelado.',
  noRoom:'Primero crea una sala amistosa.'},
 fr:{enter:'Rejoindre en plein écran',intro:'Touchez pour rejoindre la partie en plein écran.',
  retry:'Ce navigateur refuse le plein écran. Ouvrez le lien dans Chrome depuis son menu, ou continuez avec les barres visibles.',
  continue:'Continuer sans plein écran',share:'Partager l’invitation',shareHelp:'Envoyez ce lien à votre ami.',
  copy:'Copier le lien',copied:'Lien copié',manual:'Sélectionnez le lien et copiez-le au clavier.',
  email:'Envoyer par e-mail',native:'Partager avec des apps',cancel:'Fermer',cancelShare:'Partage annulé.',
  noRoom:'Créez d’abord une salle amicale.'},
 de:{enter:'Im Vollbild beitreten',intro:'Tippen, um dem Spiel im Vollbild beizutreten.',
  retry:'Dieser Browser erlaubt kein Vollbild. Öffnen Sie den Link über das Menü in Chrome oder fahren Sie mit Browserleisten fort.',
  continue:'Ohne Vollbild fortfahren',share:'Spieleinladung teilen',shareHelp:'Senden Sie diesen Link an einen Freund.',
  copy:'Link kopieren',copied:'Link kopiert',manual:'Link markieren und mit der Tastatur kopieren.',
  email:'Per E-Mail senden',native:'Mit Apps teilen',cancel:'Schließen',cancelShare:'Teilen abgebrochen.',
  noRoom:'Erstellen Sie zuerst einen Freundschaftsraum.'},
 ja:{enter:'全画面でゲームに参加',intro:'タップして全画面で友達のゲームに参加してください。',
  retry:'このブラウザーでは全画面を許可しません。メニューからChromeで開くか、通常画面で続けてください。',
  continue:'通常画面で続ける',share:'ゲーム招待を共有',shareHelp:'この招待リンクを友達に送ってください。',
  copy:'リンクをコピー',copied:'コピーしました',manual:'リンクを選択してコピーしてください。',
  email:'メールで送信',native:'アプリで共有',cancel:'閉じる',cancelShare:'共有をキャンセルしました。',
  noRoom:'最初に友達用ルームを作成してください。'},
 zh:{enter:'全屏加入游戏',intro:'点击以全屏加入朋友的游戏。',
  retry:'此浏览器不允许全屏。请通过菜单在 Chrome 中打开，或继续显示浏览器控件。',
  continue:'非全屏继续',share:'分享游戏邀请',shareHelp:'将此链接发送给朋友。',
  copy:'复制链接',copied:'链接已复制',manual:'选中链接并使用键盘复制。',
  email:'通过邮件发送',native:'分享到应用',cancel:'关闭',cancelShare:'分享已取消。',
  noRoom:'请先创建好友游戏房间。'}
};
const t=()=>translations[(document.documentElement.lang||'en').toLowerCase().split('-')[0]]||translations.en;
const mobile=()=>!!root.GoStopMobileFullscreen?.isMobileFullscreenEligible?.();
const button=(label,kind='secondary')=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.dataset.kind=kind;return node;};
const style=()=>{if(document.getElementById('devInviteStyle'))return;
 const el=document.createElement('style');el.id='devInviteStyle';
 el.textContent=`
 #devInviteFullscreenGate{position:fixed;inset:0;z-index:2147483600;background:#16110df7;display:flex;align-items:center;justify-content:center;padding:20px;color:#ffebcc;font-family:system-ui,sans-serif;text-align:center}
 #devInviteFullscreenGate[hidden]{display:none!important}
 #devInviteFullscreenGate .dev-invite-card{border:2px solid #ba914c;border-radius:18px;background:#281c16;padding:26px 18px;max-width:460px;width:100%;box-sizing:border-box;box-shadow:0 8px 48px #0009}
 #devInviteFullscreenGate h2{font-size:24px;margin:0 0 15px}
 #devInviteFullscreenGate p{font-size:15px;line-height:1.55;margin:12px 0 19px}
 #devInviteFullscreenGate button,.dev-share-dialog button,.dev-share-dialog a.dev-share-email{min-height:44px;border-radius:9px;border:1px solid #c99b5d;background:#8d3824;color:white;font-weight:700;padding:10px 15px;cursor:pointer;font-size:15px}
 #devInviteFullscreenGate button[data-kind="secondary"],.dev-share-dialog button[data-kind="secondary"],.dev-share-dialog a.dev-share-email{background:#37281e}
 .dev-share-dialog{max-width:min(92vw,560px);width:100%;box-sizing:border-box;border:2px solid #bd9656;border-radius:16px;background:#201711;color:#ffe4ba;padding:20px;font-family:system-ui,sans-serif}
 .dev-share-dialog::backdrop{background:#000b}
 .dev-share-dialog h2{font-size:21px;margin:0 0 12px}
 .dev-share-dialog p{font-size:14px;line-height:1.5}
 .dev-share-dialog input{box-sizing:border-box;width:100%;padding:12px;margin:8px 0 16px;border-radius:8px;border:1px solid #c6a272;background:#f8efe0;color:#332014;font-size:14px}
 .dev-share-actions{display:flex;gap:8px;flex-wrap:wrap}
 .dev-share-dialog a.dev-share-email{text-decoration:none;display:inline-flex;align-items:center}
 .dev-share-dialog [role="status"]{min-height:24px;margin:12px 0 0;color:#ffdb93}
 `;
 document.head.appendChild(el);
};
let entryPending=null,entryCompleted=false;
function gateFriendInvite(){
 if(entryCompleted||!mobile()||document.fullscreenElement)return Promise.resolve({fullscreen:!!document.fullscreenElement});
 if(entryPending)return entryPending;
 style();const strings=t(),overlay=document.createElement('section');
 overlay.id='devInviteFullscreenGate';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
 const card=document.createElement('div');card.className='dev-invite-card';
 const h=document.createElement('h2');h.textContent='GoStop Live!';
 const description=document.createElement('p');description.textContent=strings.intro;
 const enter=button(strings.enter),fallback=button(strings.continue,'secondary');fallback.hidden=true;
 card.append(h,description,enter,fallback);overlay.append(card);document.body.append(overlay);
 const priorFocus=document.activeElement;
 entryPending=new Promise(resolve=>{
  const finish=()=>{entryCompleted=true;overlay.remove();entryPending=null;priorFocus?.focus?.();resolve({fullscreen:!!document.fullscreenElement});};
  enter.addEventListener('click',async()=>{
   enter.disabled=true;
   const rootNode=document.documentElement;
   if(typeof rootNode.requestFullscreen!=='function'||document.fullscreenEnabled===false){
    description.textContent=strings.retry;enter.hidden=true;fallback.hidden=false;return;
   }
   try{
    // Call during the actual button activation, before any await or network join.
    await rootNode.requestFullscreen({navigationUI:'hide'});
    if(document.fullscreenElement){finish();return;}
   }catch(_){}
   description.textContent=strings.retry;enter.hidden=true;fallback.hidden=false;
  });
  fallback.addEventListener('click',finish);
 });
 return entryPending;
}
let shareDialog=null;
function openShareDialog(url){
 style();const strings=t();
 if(shareDialog?.open)shareDialog.close();
 const dialog=document.createElement('dialog');dialog.className='dev-share-dialog';dialog.id='devFriendShareDialog';
 const heading=document.createElement('h2');heading.textContent=strings.share;
 const help=document.createElement('p');help.textContent=strings.shareHelp;
 const field=document.createElement('input');field.type='text';field.value=url;field.readOnly=true;
 field.setAttribute('aria-label',strings.share);
 const actions=document.createElement('div');actions.className='dev-share-actions';
 const copy=button(strings.copy),close=button(strings.cancel,'secondary');
 const email=document.createElement('a');email.className='dev-share-email';
 email.href='mailto:?subject='+encodeURIComponent('GoStop Live!')+
  '&body='+encodeURIComponent(strings.shareHelp+'\n'+url);
 email.textContent=strings.email;
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.addEventListener('click',async()=>{
  let success=false;
  try{if(root.navigator?.clipboard?.writeText){await root.navigator.clipboard.writeText(url);success=true;}}catch(_){}
  if(!success){
   field.focus();field.select();
   try{success=!!document.execCommand?.('copy');}catch(_){}
  }
  status.textContent=success?strings.copied:strings.manual;
 });
 if(typeof root.navigator?.share==='function'){
  const apps=button(strings.native);
  apps.addEventListener('click',async()=>{
   try{await root.navigator.share({title:'GoStop Live!',text:strings.shareHelp,url});}
   catch(error){status.textContent=error?.name==='AbortError'?strings.cancelShare:strings.manual;}
  });
  actions.append(apps);
 }
 close.addEventListener('click',()=>dialog.close());
 actions.append(copy,email,close);dialog.append(heading,help,field,actions,status);
 dialog.addEventListener('close',()=>{dialog.remove();if(shareDialog===dialog)shareDialog=null;},{once:true});
 document.body.append(dialog);shareDialog=dialog;
 if(typeof dialog.showModal==='function')dialog.showModal();
 else dialog.setAttribute('open','');
}
let joinFailureDialog=null;
function showJoinFailure(error,retry){
 style();
 if(joinFailureDialog?.open)joinFailureDialog.close();
 const dialog=document.createElement('dialog');dialog.id='devFriendJoinFailureDialog';dialog.className='dev-share-dialog';
 const heading=document.createElement('h2');heading.textContent='Could not join the Friendly game';
 const detail=document.createElement('p');
 const reason=String(error?.message||'The game connection failed.').slice(0,260);
 detail.textContent=reason+' Your invitation link is still available. Retry joining the same room.';
 const actions=document.createElement('div');actions.className='dev-share-actions';
 const again=button('Retry Join'),leave=button('Return to Menu','secondary');
 again.addEventListener('click',()=>{
  dialog.close();
  if(typeof retry==='function')void Promise.resolve().then(retry);
 });
 leave.addEventListener('click',()=>{
  dialog.close();
  const clean=new URL(location.href);
  clean.searchParams.delete('room');clean.searchParams.delete('mode');clean.searchParams.delete('ref');
  location.replace(clean.pathname+clean.search+clean.hash);
 });
 actions.append(again,leave);dialog.append(heading,detail,actions);
 dialog.addEventListener('close',()=>{dialog.remove();if(joinFailureDialog===dialog)joinFailureDialog=null;},{once:true});
 document.body.append(dialog);joinFailureDialog=dialog;
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
function validFriendlyLink(value){
 try{const url=new URL(value,location.href);
  const code=url.searchParams.get('room')||'';
  return url.origin===location.origin&&/^[A-Z2-9]{14}$/.test(code)&&url.searchParams.get('mode')==='free'?url.href:null;
 }catch(_){return null;}
}
document.addEventListener('click',event=>{
 const share=event.target?.closest?.('#freeShareBtn');
 if(!share)return;
 event.preventDefault();event.stopImmediatePropagation();
 const url=validFriendlyLink(document.getElementById('freeShareLink')?.href);
 if(url)openShareDialog(url);
 else{
  const status=document.getElementById('freeOnlineStatus');
  if(status)status.textContent=t().noRoom;
 }
},{capture:true});
const api=Object.freeze({gateFriendInvite,validFriendlyLink,showJoinFailure});
root.GoStopDevFriendlyInvite=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
