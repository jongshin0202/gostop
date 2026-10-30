/* Development-only UI compatibility guard.
 * This adapter does not modify gameplay or authentication logic.
 * Remove the dev-site build inclusion to disable it completely.
 */
(()=>{
'use strict';
const hostname=globalThis.location?.hostname||'';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(hostname))return;

// The login and registration forms are mutually exclusive. The built-in
// [hidden] display:none is overridden by the legacy .account-form{display:grid}
// author rule; restore the browser's intended hidden semantics, specifically
// for the original account dialog. Do not recreate forms or intercept login.
const style=document.createElement('style');
style.id='gostop-dev-ui-integrity';
style.textContent='#accountDialog #loginForm[hidden],#accountDialog #registerForm[hidden]{display:none!important}';
document.head.append(style);

// The frozen local-game Quit handler handles game cleanup and then unhides the
// overlay. Restore only its menu presentation state AFTER that handler runs.
// This never intercepts/cancels quit, touches game data, or changes online play.
document.addEventListener('click',event=>{
 if(!event.target?.closest?.('#quitYesBtn'))return;
 const quitDialog=document.getElementById('quitConfirmDialog');
 if(quitDialog?.open)return; // Let the existing confirmation handler finish.
 queueMicrotask(()=>{
  const overlay=document.getElementById('soloStartOverlay');
  const menu=overlay?.querySelector('.gostop-main-menu');
  if(!overlay||!menu||overlay.hidden)return; // Online Quit or not yet completed.
  // A completed local Quit should land on the full, already initialized menu,
  // never on the initial full-screen Tap to Start gate or launch cover.
  delete overlay.dataset.launching;
  delete overlay.dataset.launchingText;
  overlay.dataset.currentMenuReady='true';
  const message=overlay.querySelector('.solo-launch-message');
  if(message)message.textContent='';
  document.documentElement.classList.remove('gostop-boot-pending');
  const splash=document.getElementById('gostopBootSplash');
  if(splash){splash.setAttribute('aria-hidden','true');splash.classList.remove('gostop-boot-ready');delete splash.dataset.startLabel;}
 });
});
})();
