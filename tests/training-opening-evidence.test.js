'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const helper=require('../dev-site/training-opening-evidence.js');
const deck=[
 ...[1,3,8,11,12].map(month=>({id:'m'+month+'-1',month,type:'bright',flags:[]})),
 ...[[1,'red'],[2,'red'],[3,'red'],[6,'blue'],[9,'blue'],[10,'blue'],[4,'grass'],[5,'grass'],[7,'grass']].map(([month,ribbonSet])=>
 ({id:'m'+month+'-2',month,type:'ribbon',ribbonSet,flags:[]})),
 ...[2,4,8].map(month=>({id:'m'+month+'-3',month,type:'animal',flags:['godori']})),
 ...[4,5,6,7,8,9].map(month=>({id:'m'+month+'-4',month,type:'pi',flags:[]}))
];
test('single Bright plus visible route keeps Brights possible alongside Singles',()=>{
 const hand=['m1-1','m4-4','m5-4','m6-4','m7-4','m8-4'];
 const r=helper.evaluate({hand,floor:['m8-1'],humanCaptured:[],computerCaptured:[]},deck);
 assert.ok(r.suggested.includes('brights'));
 assert.ok(r.suggested.includes('singles'));
 assert.equal(r.info.brights.known,1);
 assert.equal(r.info.brights.reachable,1);
 assert.equal(r.evidence.length,12);
 assert.ok(r.evidence.every(x=>x>=0&&x<=1));
});
test('blocked red stripe route is not suggested',()=>{
 const r=helper.evaluate({hand:['m2-2'],floor:['m3-2'],humanCaptured:[],computerCaptured:['m1-2']},deck);
 assert.equal(r.info['red-stripes'].lost,1);
 assert.ok(!r.suggested.includes('red-stripes'));
});
test('full stripe routes, godori and Shake are listed as distinct choices',()=>{
 const r=helper.evaluate({hand:['m2-3','m2-2','m6-2','m9-2','m9-4','m9-1'],
 floor:['m4-3'],humanCaptured:[],computerCaptured:[]},[
 ...deck,{id:'m9-1',month:9,type:'animal',flags:['switchPi']}
 ]);
 assert.ok(r.suggested.includes('godori'));
 assert.ok(r.suggested.includes('red-stripes'));
 assert.ok(r.suggested.includes('blue-stripes'));
 assert.ok(r.suggested.includes('shake-bomb'));
});
test('no visible major route falls back to Singles instead of inventing nearby sets',()=>{
 const r=helper.evaluate({hand:['m7-4'],floor:[],humanCaptured:[],computerCaptured:[]},deck);
 assert.deepEqual(r.suggested,['singles']);
});
