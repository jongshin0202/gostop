import test from 'node:test';
import assert from 'node:assert/strict';
import {distance} from '../server/lobby.mjs';

test('matchmaking distance prefers players with closer score games and wallet',()=>{
  const me={score:8,gamesPlayed:40,walletCoins:320};
  const close={score:8.5,gamesPlayed:42,walletCoins:300};
  const far={score:20,gamesPlayed:4,walletCoins:-500};
  assert.ok(distance(me,close)<distance(me,far));
});

test('matchmaking distance is symmetric and finite for zero or negative values',()=>{
  const a={score:0,gamesPlayed:0,walletCoins:-20};
  const b={score:0,gamesPlayed:0,walletCoins:0};
  assert.equal(distance(a,b),distance(b,a));
  assert.ok(Number.isFinite(distance(a,b)));
});
