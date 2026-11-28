import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {label,sanitize}=require('../dev-site/training-card-labels.js');
const engine=require('../game-engine.js');
require('../training-locales.js');
const deck=engine.masterDeck;
test('all 48 real Training cards have readable names and no opaque IDs',()=>{
 assert.equal(deck.length,48);
 for(const card of deck){
  const name=label(card.id,deck,'en');
  assert.ok(name?.length>3,card.id);
  assert.doesNotMatch(name,/\bm\d{1,2}-\d+\b/i,card.id);
  assert.doesNotMatch(sanitize('Play '+card.id+' first.',deck,'en'),/\bm\d{1,2}-\d+\b/i);
 }
 assert.equal(label('m4-2',deck,'en'),'Vine Plain Stripe');
 assert.equal(label('m12-1',deck,'en'),'Willow Bright');
});
test('all supported locales avoid internal IDs in recommendation copy',()=>{
 for(const locale of ['en','ko','es','fr','de','ja','zh']){
  for(const card of deck){
   const message=sanitize('Play '+card.id+' onto m12-1.',deck,locale);
   assert.doesNotMatch(message,/\bm\d{1,2}-\d+\b/i,locale+' '+card.id);
   assert.ok(message.includes(label(card.id,deck,locale)),card.id+' '+locale);
  }
 }
});
test('unknown legacy card IDs degrade to truthful month card, never a fake type or raw ID',()=>{
 const msg=sanitize('Play M2-10 beside m4-2; not m12-9.',deck,'en');
 assert.equal(msg,'Play Plum card beside Vine Plain Stripe; not Willow card.');
 assert.equal(label('m99-1',deck,'en'),'Card');
 assert.equal(label('unrelated-dev-token',deck,'en'),null);
 assert.equal(sanitize('There are 7 points and a 10-game path.',deck,'en'),
  'There are 7 points and a 10-game path.');
});
test('sanitizing does not mutate card metadata or training weights',()=>{
 const before=JSON.stringify(deck);
 const text=sanitize('m4-2 then m12-1',deck,'en');
 assert.equal(text,'Vine Plain Stripe then Willow Bright');
 assert.equal(JSON.stringify(deck),before);
});
