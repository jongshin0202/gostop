import {test,expect} from '@playwright/test';

async function setupMobileGame(page){
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  let active=null,visibility='visible';
  window.__fullscreenCalls=0;
  window.__denyFullscreen=false;
  Object.defineProperty(Document.prototype,'fullscreenElement',{configurable:true,get(){return active;}});
  Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get(){return visibility;}});
  Object.defineProperty(Document.prototype,'fullscreenEnabled',{configurable:true,get(){return true;}});
  Element.prototype.requestFullscreen=function(){
   window.__fullscreenCalls++;
   if(window.__denyFullscreen)return Promise.reject(new Error('Android requires user activation'));
   active=this;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();
  };
  window.__setFullscreen=value=>{active=value;document.dispatchEvent(new Event('fullscreenchange'));};
  window.__backgroundReturn=()=>{
   window.__denyFullscreen=true;
   visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));
   active=null;document.dispatchEvent(new Event('fullscreenchange'));
   visibility='visible';document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new Event('focus'));
  };
  let seed=0x6d2b79f5;
  crypto.getRandomValues=array=>{for(let i=0;i<array.length;i++){
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;array[i]=seed>>>0;
  }return array;};
 });
 await page.route('https://commons.wikimedia.org/**',route=>route.abort());
 await page.route('**/api/**',route=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS',
   'access-control-allow-headers':'content-type,authorization'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  return route.fulfill({status:200,headers,contentType:'application/json',
   body:JSON.stringify({ok:true,global:[],monthly:[]})});
 });
 await page.goto('/dev-site/dist/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#gostopBootSplash.gostop-boot-ready')).toBeVisible({timeout:10000});
 await page.locator('#gostopBootSplash').tap();
 await expect(page.locator('#friendlyGamingBtn')).toBeVisible({timeout:10000});
 return errors;
}

test.describe('development-only fullscreen recovery',()=>{
 test.use({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 test('Telegram return offers Full Screen Mode without restarting a Friendly game',async({page})=>{
  const errors=await setupMobileGame(page);
  await expect(page.locator('#devFullscreenReturnPrompt')).toHaveCount(0);
  await page.locator('#friendlyGamingBtn').tap();
  await page.locator('#playSoloBtn').tap();
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:12000});
  await expect(page.locator('#openingOverlay')).toBeHidden({timeout:12000});
  await expect(page.locator('#playerHand .hand-card').first()).toBeVisible({timeout:15000});
  const before=await page.locator('#playerHand [data-card-id]').evaluateAll(cards=>cards.map(c=>c.dataset.cardId));
  expect(before.length).toBeGreaterThan(0);
  await page.evaluate(()=>window.__backgroundReturn());
  const recovery=page.locator('#devFullscreenReturnPrompt');
  await expect(recovery).toBeVisible({timeout:6000});
  await expect(recovery).toContainText('Tap the button to enter full screen mode.');
  const buttons=recovery.locator('button');
  await expect(buttons).toHaveCount(2);
  await page.evaluate(()=>window.__denyFullscreen=false);
  await recovery.getByRole('button',{name:'Full Screen Mode'}).tap();
  await expect(recovery).toHaveCount(0);
  expect(await page.evaluate(()=>document.fullscreenElement===document.documentElement)).toBe(true);
  expect(await page.locator('#playerHand [data-card-id]').evaluateAll(cards=>cards.map(c=>c.dataset.cardId))).toEqual(before);
  await expect(page.locator('#soloStartOverlay')).toBeHidden();

  // A manual exit prompts once; Continue Game does not reopen on every focus.
  await page.evaluate(()=>window.__setFullscreen(null));
  await expect(recovery).toBeVisible({timeout:6000});
  await recovery.getByRole('button',{name:'Continue Game'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(850);
  await expect(recovery).toHaveCount(0);
  await page.evaluate(()=>window.__backgroundReturn());
  await expect(recovery).toBeVisible({timeout:6000});
  expect(errors).toEqual([]);
 });

 test('foreground recovery never covers the main menu, including after missing fullscreen',async({page})=>{
  const errors=await setupMobileGame(page);
  await page.evaluate(()=>window.__backgroundReturn());
  await page.waitForTimeout(850);
  await expect(page.locator('#devFullscreenReturnPrompt')).toHaveCount(0);
  await expect(page.locator('#soloStartOverlay')).toBeVisible();
  expect(errors).toEqual([]);
 });

 test('browser fullscreen rejection shows guidance but leaves the game intact',async({page})=>{
  const errors=await setupMobileGame(page);
  await page.locator('#friendlyGamingBtn').tap();
  await page.locator('#playSoloBtn').tap();
  await expect(page.locator('#openingOverlay')).toBeHidden({timeout:12000});
  await page.evaluate(()=>window.__backgroundReturn());
  const recovery=page.locator('#devFullscreenReturnPrompt');
  await expect(recovery).toBeVisible({timeout:6000});
  await recovery.getByRole('button',{name:'Full Screen Mode'}).tap();
  await expect(recovery).toContainText('open the game in Chrome');
  await recovery.getByRole('button',{name:'Continue Game'}).tap();
  await expect(page.locator('#soloStartOverlay')).toBeHidden();
  expect(errors).toEqual([]);
 });
});

test('desktop never gets the mobile fullscreen recovery prompt',async({page})=>{
 await page.goto('/dev-site/dist/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  document.getElementById('soloStartOverlay').hidden=true;
  document.documentElement.classList.remove('gostop-boot-pending');
  document.dispatchEvent(new Event('fullscreenchange'));
  window.dispatchEvent(new Event('focus'));
 });
 await page.waitForTimeout(850);
 await expect(page.locator('#devFullscreenReturnPrompt')).toHaveCount(0);
});
