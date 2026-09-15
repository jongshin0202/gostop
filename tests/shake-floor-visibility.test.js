import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Shake decision keeps the floor visually available on desktop',()=>{
  assert.match(css,/#shakeDialog::backdrop\{\s*background:rgba\(4,3,2,\.10\);\s*backdrop-filter:none;/s);
  assert.match(css,/#shakeDialog\[open\]\{[\s\S]*left:18px;[\s\S]*top:50%;[\s\S]*transform:translateY\(-50%\);/);
});

test('Shake decision becomes a compact bottom panel on smaller screens',()=>{
  assert.match(css,/@media\(max-width:900px\)\{[\s\S]*#shakeDialog\[open\]\{[\s\S]*bottom:8px;[\s\S]*max-height:min\(44vh,390px\);/);
});
