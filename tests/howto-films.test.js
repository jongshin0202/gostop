import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const tutorial=readFileSync(new URL('../tutorial-video.js',import.meta.url),'utf8');
test('How-To offers two distinct films without modifying the game runtime',()=>{
  assert.match(tutorial,/\['app','How to Use the App'\]/);
  assert.match(tutorial,/\['rules','How to Play GoStop'\]/);
  assert.match(tutorial,/if\(filmPart==='app'\)\{/);
  assert.match(tutorial,/The How to Use video ends here/);
  assert.match(tutorial,/Now let’s learn the game itself/);
  assert.match(tutorial,/PC \/ Mac/);
  assert.match(tutorial,/mobile/i);
});
test('How-To film selection only controls the tutorial, not card rules or game state',()=>{
  assert.match(tutorial,/button\.dataset\.tutorialFilm=id/);
  assert.match(tutorial,/filmButtons\.forEach/);
  assert.match(tutorial,/startFilm\(\)/);
  assert.doesNotMatch(tutorial,/GoStopGameBridge\s*=/);
});
