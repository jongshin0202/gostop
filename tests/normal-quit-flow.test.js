import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('finished-game dialog always offers Play Again and Quit Game',()=>{
  assert.match(html,/id="playAgainBtn"[^>]*data-i18n="playAgain"/);
  assert.match(html,/id="resultQuitBtn"[^>]*data-i18n="resultQuit"(?![^>]*hidden)/);
  assert.match(app,/if\(els\.resultQuitBtn\)els\.resultQuitBtn\.hidden=false/);
});

test('finished-game Quit Game requires confirmation and No returns to Play Again result dialog',()=>{
  const start=app.indexOf("els.resultQuitBtn.addEventListener");
  const end=app.indexOf("els.cancelNewGameBtn.addEventListener",start);
  const flow=app.slice(start,end);
  assert.match(flow,/onlineQuitFromResult=true/);
  assert.match(flow,/quitConfirmTitle\.textContent=t\('resultQuitConfirm'\)/);
  assert.match(flow,/quitConfirmDialog\.showModal\(\)/);
  assert.match(flow,/quitNoBtn\.addEventListener[^]*if\(onlineQuitFromResult&&!els\.resultDialog\.open\)els\.resultDialog\.showModal\(\)/);
  assert.match(flow,/quitYesBtn\.addEventListener[^]*onlineSubmit\(\{type:'quitGame'\}\)/);
  assert.match(flow,/else\{els\.quitConfirmDialog\.close\(\);onlineQuitFromResult=false;els\.soloStartOverlay\.hidden=false;\}/);
});

test('normal in-game Quit Game continues to use quitGame session flow rather than abandonment',()=>{
  assert.match(app,/optionsQuitBtn\.addEventListener/);
  assert.match(app,/quitYesBtn\.addEventListener[^]*onlineSubmit\(\{type:'quitGame'\}\)/);
});
