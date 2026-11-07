import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instrumentTrainingComputerGoStop} from '../dev-site/instrument-training-computer-go-stop.mjs';

test('isolated development instrument hooks ONLY Training computer GO STOP; no protected source edits',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const result=instrumentTrainingComputerGoStop(source);
 assert.notEqual(result,source);
 assert.equal(source.includes('GoStopDevTrainingComputerChoice'),false,
  'checked-in protected game source stays unchanged');
 assert.match(result,/if\(presentation.trainingMode&&!onlineMode\)/);
 assert.match(result,/GoStopDevTrainingComputerChoice/);
 assert.match(result,/humanCaptured:state\?\.human\?\.captured/);
 assert.match(result,/humanHandCount:state\?\.human\?\.hand\?\.length/);
 assert.doesNotMatch(result,/humanHand:state\?\.human\?\.hand[,}]/);
 assert.ok(result.includes("return aiGoStopDecision(engine.projectStateForViewer(state,PLAYER_B),sc).decision==='go';"),
  'non-Training and competitive play retain original AI policy');
 assert.equal(result.length>source.length,true);
 assert.throws(()=>instrumentTrainingComputerGoStop(source.replace('function aiShouldGo(sc)','function changedGoStop(sc)')),
  /anchor changed/);
});
