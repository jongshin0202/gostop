'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const localize=require('../training-locales.js');

const expected=['es','fr','de','ja','zh'];
const card=(month,type,id,extras={})=>({month,type,id,flags:[],...extras});
const rose=card(6,'ribbon','m6-2',{ribbonSet:'blue'});
const selected=card(6,'pi','m6-3');
const recommendation={
  card:selected,target:rose,profile:{ribbonRoutes:{blue:{alive:true,potentialCount:3}}},
  opportunity:'',threat:'',onlyAvailableCapture:false
};

test('all seven game languages have a Training Mode presentation path',()=>{
  const i18n=require('../i18n.js');
  assert.deepEqual(Object.keys(i18n.dictionaries).sort(),['de','en','es','fr','ja','ko','zh']);
  assert.deepEqual([...localize.locales].sort(),expected.sort());
  const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.match(html,/training-locales\.js\?v=20261028-1/);
  assert.ok(html.indexOf('training-locales.js')<html.indexOf('app.js?v=20261028-7'));
  assert.match(app,/GoStopTrainingLocales\?\.render\(presentation\.locale,title,text/);
  assert.match(app,/GoStopTrainingLocales\?\.gukjin\(presentation\.locale,advice\)/);
});

test('each non-English locale renders every Training advice category',()=>{
  const cases=[
    ['Recommended Move',{recommendation}],
    ['Target Choice',{recommendation}],
    ['Target Feedback',{recommendation}],
    ['Strategy Note',{recommendation}],
    ['Opening Strategy',{opening:{strategyOptions:[{type:'stripe',family:'blue'}]}}],
    ['GO / STOP ADVICE',{goStop:{points:12,opponent:6}}],
    ['BOMB ADVICE',{}],
    ['SHAKE ADVICE',{}]
  ];
  for(const locale of expected){
    for(const [kind,context] of cases){
      const result=localize.render(locale,kind,kind==='GO / STOP ADVICE'?'STOP. The computer already has 6 points.':'Shake. ×4 final-score multiplier.',context);
      assert.ok(result?.title&&result.text,locale+' '+kind);
      assert.doesNotMatch(result.text,/Choose .* on the table|Play .* onto .*|Only one scoring turn remains|Tap or click anywhere/);
      assert.doesNotMatch(result.title,/Recommended Move|Target Choice|Opening Strategy/);
    }
    assert.ok(localize.cardName(locale,rose));
    assert.ok(localize.gukjin(locale,{mode:'pi'}));
    assert.ok(localize.gukjin(locale,{mode:'animal'}));
  }
  assert.match(localize.gukjin('ko',{mode:'pi'}),/쌍피/);
  assert.match(localize.gukjin('ko',{mode:'animal'}),/열끗/);
});

test('Training translation is pure presentation and does not alter recommendation fields',()=>{
  const snapshot=JSON.stringify(recommendation);
  for(const locale of expected){
    const result=localize.render(locale,'Recommended Move','', {recommendation});
    assert.match(result.text,new RegExp(localize.cardName(locale,rose)));
    assert.equal(JSON.stringify(recommendation),snapshot);
  }
});

test('Training feedback is concise and targeted rather than adding irrelevant denials',()=>{
  for(const locale of expected){
    const text=localize.render(locale,'Recommended Move','',{recommendation}).text;
    assert.ok(text.length<220,locale);
    const target=localize.render(locale,'Target Choice','',{recommendation}).text;
    assert.ok(target.length<220,locale);
  }
});
