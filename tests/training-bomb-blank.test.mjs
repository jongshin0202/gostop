import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const logic=require('../dev-site/training-advice-logic.js');

test('Bomb blank wins over discarding Vine Single when Hill and Cherry cannot be captured',()=>{
 assert.equal(logic.recommendBombBlank({
  hand:['m4-4','m10-2'],floor:['m8-4','m3-3'],availableBlankTurns:2
 }),true);
 assert.match(logic.bombBlankText('en'),/blank Bomb turn/);
 assert.match(logic.bombBlankText('en'),/keep your real cards/);
});
test('capture available: do not use blank in place of an immediate capture',()=>{
 assert.equal(logic.recommendBombBlank({
  hand:['m4-4','m10-2'],floor:['m8-4','m4-2'],availableBlankTurns:2
 }),false);
});
test('no available blank or disabled blanks: retain ordinary advice',()=>{
 assert.equal(logic.recommendBombBlank({
  hand:['m4-4'],floor:['m8-4'],availableBlankTurns:0
 }),false);
 assert.equal(logic.recommendBombBlank({
  hand:['m4-4'],floor:['m8-4']
 }),false);
});
test('blank advice uses recognized visible cards and is localized',()=>{
 assert.equal(logic.recommendBombBlank({
  hand:['unknown'],floor:['m8-4'],availableBlankTurns:1
 }),false);
 assert.match(logic.bombBlankText('ko'),/실제 손패/);
 assert.match(logic.bombBlankText('ja'),/手札/);
 assert.equal(logic.bombBlankText('unsupported'),logic.bombBlankText('en'));
});
