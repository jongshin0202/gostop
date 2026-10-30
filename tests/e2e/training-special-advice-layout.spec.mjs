import {test,expect} from '@playwright/test';

/* Regression against frozen HTML/CSS with development-only layout stylesheet.
   Simulates the exact DOM reparenting done by showTrainingSpecialCoach(). */
for(const v of [
 {name:'PC screenshot',width:1504,height:1020},
 {name:'narrow desktop',width:970,height:720},
 {name:'phone portrait',width:390,height:844},
 {name:'phone landscape',width:844,height:390}
]){
 for(const dialogId of ['shakeDialog','bombDialog']){
  test('Training advice remains inside viewport for '+dialogId+' on '+v.name,async({page})=>{
   await page.setViewportSize({width:v.width,height:v.height});
   await page.goto('/',{waitUntil:'domcontentloaded'});
   await page.addStyleTag({path:'dev-site/training-special-advice-layout.css'});
   await page.evaluate(id=>{
     const dialog=document.getElementById(id);
     const coach=document.getElementById('trainingCoachPanel');
     dialog.appendChild(coach);
     coach.hidden=false;
     document.getElementById('trainingCoachTitle').textContent='SHAKE ADVICE';
     document.getElementById('trainingCoachText').textContent=
       'Shake. Reveal these three Willow cards now for a ×4 final-score multiplier if you win. Keep for Bomb only preserves a future Bomb chance if the fourth Willow card appears on the table.';
     dialog.showModal();
   },dialogId);
   const panel=page.locator('#'+dialogId+' > #trainingCoachPanel');
   await expect(panel).toBeVisible();
   await panel.scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(id=>{
     const coach=document.querySelector('#'+id+' > #trainingCoachPanel');
     const rect=coach.getBoundingClientRect();
     const dialog=document.getElementById(id);
     return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
       width:rect.width,height:rect.height,position:getComputedStyle(coach).position,
       scrollWidth:coach.scrollWidth,clientWidth:coach.clientWidth,
       dialogScrollHeight:dialog.scrollHeight,dialogClientHeight:dialog.clientHeight};
   },dialogId);
   expect(geometry.position).toBe('static');
   expect(geometry.left).toBeGreaterThanOrEqual(-1);
   expect(geometry.right).toBeLessThanOrEqual(v.width+1);
   expect(geometry.top).toBeGreaterThanOrEqual(-1);
   expect(geometry.bottom).toBeLessThanOrEqual(v.height+1);
   expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+2);
   expect(geometry.height).toBeGreaterThan(35);
  });
 }
}
test('ordinary Training coach remains fixed outside special dialogs',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({path:'dev-site/training-special-advice-layout.css'});
 const style=await page.evaluate(()=>getComputedStyle(document.getElementById('trainingCoachPanel')).position);
 expect(style).toBe('fixed');
});
