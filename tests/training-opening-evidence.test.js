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

test('only acknowledged server-trained weights adjust future visible opening advice',()=>{
 const v={hand:['m1-1','m4-4','m5-4','m6-4','m7-4','m8-4'],floor:[],humanCaptured:[],computerCaptured:[]};
 const base=helper.evaluate(v,deck);
 const weights=Array.from({length:8},()=>Array(12).fill(0));
 // Expert has rejected Brights in similar positions and favored Singles.
 weights[0][0]=-3;weights[5][0]=3;
 const model={examples:2,weights};
 const selected=helper.withLearnedWeights(base,model);
 assert.ok(!selected.suggested.includes('brights'));
 assert.ok(selected.suggested.includes('singles'));
 assert.equal(selected.modelExamples,2);
 assert.deepEqual(helper.withLearnedWeights(base,null),base);
 assert.deepEqual(helper.withLearnedWeights(base,{examples:0,weights}),base);
});
test('model cannot recommend already broken stripe sets or hidden, unseen sets',()=>{
 const v={hand:['m1-1','m2-2'],floor:['m3-2'],humanCaptured:[],computerCaptured:['m1-2']};
 const base=helper.evaluate(v,deck);
 const weights=Array.from({length:8},()=>Array(12).fill(0));
 weights[2][0]=6;weights[3][0]=6;weights[5][0]=1;
 const result=helper.withLearnedWeights(base,{examples:5,weights});
 assert.ok(!result.suggested.includes('red-stripes'),'opponent already captured required red ribbon');
 assert.ok(!result.suggested.includes('blue-stripes'),'no blue ribbon is visible in hand or available now');
 assert.ok(result.suggested.includes('singles'));
});

test('native opening fallback matches frozen Singles advice even with one Bright and scattered ribbons',()=>{
 const visible={
  hand:['m1-1','m1-2','m6-2','m4-2','m5-4','m6-4','m7-4'],
  floor:['m8-1','m8-3'],humanCaptured:[],computerCaptured:[]
 };
 const broad=helper.evaluate(visible,deck);
 assert.ok(broad.suggested.includes('brights'),'broad learner can see a speculative Bright');
 assert.ok(broad.suggested.includes('red-stripes'),'broad learner can see speculative red ribbons');
 assert.deepEqual(helper.nativeOpeningStrategies(visible,deck),['singles'],
  'only one Bright and a single ribbon of each set are not strategic openings');
 assert.deepEqual(helper.strategiesFromEnglishCoach(
  'Best strategy: Singles. No Bright, 5-BIRDIES, or 3-Stripe set has at least 2 cards within reach yet, so build Singles.'),['singles']);
});
test('native opening recognizes two strong cards from a viable set, not merely any one',()=>{
 const v={hand:['m1-1','m3-1','m2-2','m3-2'],floor:[],humanCaptured:[],computerCaptured:[]};
 const picks=helper.nativeOpeningStrategies(v,deck);
 assert.ok(picks.includes('brights'),'two Brights are strategically viable');
 assert.ok(picks.includes('red-stripes'),'two red ribbons are strategically viable');
 assert.ok(!picks.includes('singles'),'Singles fallback only when major routes are not strong');
});
test('native opening does not recommend GODORI without an immediately playable or claimable bird',()=>{
 const noMatch={hand:['m2-3','m4-3'],floor:[],humanCaptured:[],computerCaptured:[]};
 assert.deepEqual(helper.nativeOpeningStrategies(noMatch,deck),['singles']);
 const playable={...noMatch,floor:['m2-2']};
 assert.ok(helper.nativeOpeningStrategies(playable,deck).includes('godori'));
});
test('the displayed English heading is authoritative for expert confirmation',()=>{
 assert.deepEqual(helper.strategiesFromEnglishCoach('Best strategies: Blue Stripes, Brights, and 5-BIRDIES.'),['blue-stripes','brights','godori']);
 assert.equal(helper.strategiesFromEnglishCoach('Suggested paths are Singles'),null);
 assert.equal(helper.strategiesFromEnglishCoach('Best strategy: Unknown.'),null);
});

test('opening Bright counts separate one held Bright from another reachable on table',()=>{
 const visible={hand:['m1-1','m8-4'],floor:['m8-1'],humanCaptured:[],computerCaptured:[]};
 const counts=helper.openingRouteLocations(visible,deck,'brights');
 assert.deepEqual(counts,{hand:1,captured:0,reachable:1,opponent:0,potential:2});
 assert.equal(helper.openingLocationLines(visible,deck,['brights'],'en')[0],
  'Brights: 1 in hand, 0 captured, 1 reachable on the table.');
});
test('opening Bright counts never treat unmatchable floor Brights as reachable',()=>{
 const visible={hand:['m1-1','m4-4'],floor:['m8-1'],humanCaptured:[],computerCaptured:[]};
 assert.deepEqual(helper.openingRouteLocations(visible,deck,'brights'),{
  hand:1,captured:0,reachable:0,opponent:0,potential:1
 });
});
test('opening counts distinguish held, already captured and claimable cards without duplication',()=>{
 const v={hand:['m1-1','m8-4','m4-2'],floor:['m8-1','m5-2'],
  humanCaptured:['m3-1'],computerCaptured:['m11-1']};
 const counts=helper.openingRouteLocations(v,deck,'brights');
 assert.deepEqual(counts,{hand:1,captured:1,reachable:1,opponent:1,potential:3});
 assert.equal(helper.openingRouteLocations(v,deck,'plain-stripes').hand,1);
 for(const locale of ['en','ko','es','fr','de','ja','zh']){
  const lines=helper.openingLocationLines(v,deck,['brights','plain-stripes'],locale);
  assert.equal(lines.length,2);
  assert.ok(lines.every(x=>x.includes('1')));
  assert.ok(lines.some(x=>x.includes('0')));
 }
});
test('opening count details omit categories that do not use a set card count',()=>{
 const v={hand:['m4-4'],floor:[],humanCaptured:[],computerCaptured:[]};
 assert.equal(helper.openingRouteLocations(v,deck,'singles'),null);
 assert.deepEqual(helper.openingLocationLines(v,deck,['singles','pictures'],'en'),[]);
});
