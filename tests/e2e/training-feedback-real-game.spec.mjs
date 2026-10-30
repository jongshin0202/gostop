import {test,expect} from '@playwright/test';
test('real game engine exports a deck array', async ({page})=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>globalThis.GoStopEngine?.masterDeck?.length)).toBe(48);});
