import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');

test('ranked wallet labels are locale-aware instead of hard-coded English Coins',()=>{
  assert.match(source,/ko:\{coins:'코인'/);
  assert.match(source,/const coinText=value=>/);
  assert.doesNotMatch(source,/walletCoins\)\|\|0\} Coins/);
  assert.doesNotMatch(source,/opponent\.walletCoins\)\|\|0\} Coins/);
});

test('expired pause Resume and win confirmation use ranked locale fallback keys',()=>{
  assert.match(source,/resumeGame:'Resume Game'/);
  assert.match(source,/expiredPauseQuitConfirmTitle:'End Session With Win\\?'/);
  assert.match(source,/function renderPauseQuitConfirmationLocale\\(\\)/);
  assert.match(source,/rt\\(expired\\?'expiredPauseQuitConfirmTitle':'quitPauseConfirmTitle'\\)/);
});

test('ranked UI listens to the base document language',()=>{
  assert.match(source,/document\.documentElement\.lang/);
  assert.match(source,/MutationObserver/);
  assert.match(source,/applyRankedLocale/);
});
