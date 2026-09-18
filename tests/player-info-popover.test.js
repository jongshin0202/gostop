import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('player and opponent status cards are keyboard/touch accessible info triggers',()=>{
  assert.match(html,/class="player-chip cpu-chip" data-player-info="opponent" role="button" tabindex="0"/);
  assert.match(html,/class="player-chip human-chip" data-player-info="player" role="button" tabindex="0"/);
  assert.match(html,/id="playerInfoOverlay"/);
  assert.match(html,/id="playerInfoPopover"/);
  assert.match(html,/Tap or click anywhere to close/);
});

test('large player info popover mirrors visible identity session wallet score and status',()=>{
  const block=app.slice(app.indexOf('function openPlayerInfo'),app.indexOf('function setupPlayerInfoPopovers'));
  assert.match(block,/\.player-identity/);
  assert.match(block,/\.session-stats/);
  assert.match(block,/\.ranked-wallet-line/);
  assert.match(block,/\.score-pill b/);
  assert.match(block,/\.multiplier-chip/);
  assert.match(block,/\.go-count-badge/);
  assert.match(block,/playerInfoWallet\.hidden=!wallet/);
  assert.match(block,/playerInfoStatus\.hidden=!statuses\.length/);
});

test('player info popover anchors to the selected card and dismisses from any tap or click',()=>{
  assert.match(app,/function positionPlayerInfo\(chip,seat\)/);
  assert.match(app,/seat==='player'\?rect\.top-pop\.height-12:rect\.bottom\+12/);
  assert.match(app,/playerInfoOverlay\?\.addEventListener\('pointerdown'[^]*closePlayerInfo\(\)/);
  assert.match(app,/event\.key!=='Enter'&&event\.key!==' '/);
  assert.match(app,/event\.key==='Escape'/);
  assert.match(css,/\.player-info-overlay\{position:fixed;inset:0;z-index:2400/);
  assert.match(css,/\.player-info-popover\{position:fixed;width:min\(430px/);
  assert.match(css,/\.player-chip\[data-player-info\]\{cursor:pointer/);
});
