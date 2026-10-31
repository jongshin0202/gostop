'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const logic=require('../dev-site/training-advice-logic.js');
const deck=[
 {id:'m2-1',month:2,type:'bright',flags:[]},
 {id:'m2-2',month:2,type:'ribbon',ribbonSet:'red',flags:[]},
 {id:'m2-3',month:2,type:'animal',flags:[]},
 {id:'m2-4',month:2,type:'pi',flags:[]},
 {id:'m1-1',month:1,type:'bright',flags:[]},
 {id:'m1-2',month:1,type:'ribbon',ribbonSet:'red',flags:[]},
 {id:'m3-2',month:3,type:'ribbon',ribbonSet:'red',flags:[]},
 {id:'m4-4',month:4,type:'pi',flags:['doublePi']},
 {id:'m4-2',month:4,type:'animal',flags:[]},
 {id:'m4-1',month:4,type:'ribbon',ribbonSet:'grass',flags:[]},
];
test('secured family discard requires exactly four visible distinct cards and one matching hand card remaining',()=>{
 const visible={hand:['m2-1','m2-2'],floor:[],humanCaptured:[],computerCaptured:['m2-3','m2-4']};
 assert.equal(logic.securedDiscard({...visible,cardId:'m2-2'}),true);
 assert.equal(logic.discardText('m2-2',visible,deck,'en','Plum Red Stripe'),
 'Discard Plum Red Stripe. You hold the only matching card, so you can take it back.');
 assert.equal(logic.securedDiscard({...visible,cardId:'m2-3'}),false);
 assert.equal(logic.securedDiscard({...visible,floor:['m2-4'],cardId:'m2-2'}),false);
 assert.equal(logic.securedDiscard({...visible,computerCaptured:['m2-3'],cardId:'m2-2'}),false);
});
test('unsecured discard does not claim a guaranteed recapture',()=>{
 const state={hand:['m2-1','m2-2'],floor:['m4-2'],humanCaptured:[],computerCaptured:[]};
 assert.equal(logic.securedDiscard({...state,cardId:'m2-2'}),false);
 const reason=logic.discardText('m2-2',state,deck,'en','Plum Red Stripe');
 assert.match(reason,/Keep your stronger matching card/);
 assert.doesNotMatch(reason,/only matching|guarantee|take it back/);
});
test('draw target preference selects valuable visible target; no hidden knowledge used',()=>{
 const state={hand:['m1-2'],floor:['m1-1','m4-2','m4-4'],humanCaptured:[],computerCaptured:[]};
 assert.equal(logic.recommendDrawTarget(['m4-2','m4-4'],state,deck).cardId,'m4-4');
 assert.equal(logic.recommendDrawTarget(['m1-1','m4-4'],state,deck).cardId,'m1-1');
 assert.equal(logic.recommendDrawTarget(['m4-4'],state,deck),null);
});
test('draw priority adapts to live three-stripe route without guessing future cards',()=>{
 const state={hand:['m2-2'],floor:['m3-2','m4-4'],humanCaptured:['m1-2'],computerCaptured:[]};
 assert.equal(logic.recommendDrawTarget(['m3-2','m4-4'],state,deck).cardId,'m3-2');
 const blocked={...state,computerCaptured:['m1-2'],humanCaptured:[]};
 assert.equal(logic.stripePotential('red',blocked,deck).possible,false);
});
test('all seven language labels are concise, and exact card totals are never invented',()=>{
 const v={hand:['m2-1','m2-2'],floor:[],humanCaptured:['m2-3'],computerCaptured:['m2-4']};
 for(const lang of ['en','ko','es','fr','de','ja','zh']){
  const txt=logic.discardText('m2-2',v,deck,lang,'Plum Stripe');
  assert.ok(txt&&txt.length<180,lang);
  assert.ok(logic.T[lang].draw('X').length<80,lang);
  assert.doesNotMatch(txt,/[3-9] Single value|3-BIRDIES/);
 }
});
