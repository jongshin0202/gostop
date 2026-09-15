from pathlib import Path

path=Path('styles.css')
text=path.read_text()
marker='/* Shake decision: keep the floor visible while choosing Shake vs Keep for Bomb. */'
if marker in text:
    raise SystemExit('already applied')
css=r'''

/* Shake decision: keep the floor visible while choosing Shake vs Keep for Bomb. */
#shakeDialog::backdrop{
  background:rgba(4,3,2,.10);
  backdrop-filter:none;
}
#shakeDialog[open]{
  position:fixed;
  left:18px;
  right:auto;
  top:50%;
  bottom:auto;
  transform:translateY(-50%);
  margin:0;
  width:min(480px,calc(100vw - 36px));
  max-width:none;
  max-height:calc(100vh - 24px);
  overflow:visible;
}
#shakeDialog .special-rule-card{
  width:100%;
  max-width:none;
  padding:18px 20px;
  background:linear-gradient(180deg,rgba(42,27,19,.98),rgba(23,16,12,.98));
  box-shadow:0 18px 55px rgba(0,0,0,.48);
}
#shakeDialog .special-rule-card h2{font-size:clamp(22px,2.2vw,32px);margin:14px 0 10px}
#shakeDialog .shake-cards{margin:12px 0 16px;gap:8px;flex-wrap:nowrap}
#shakeDialog .shake-cards .magnified-card{width:76px}
#shakeDialog .decision-actions{justify-content:center;flex-wrap:wrap}

@media(max-width:900px){
  #shakeDialog[open]{
    left:8px;
    right:8px;
    top:auto;
    bottom:8px;
    transform:none;
    margin:0 auto;
    width:auto;
    max-height:min(44vh,390px);
    overflow:auto;
  }
  #shakeDialog .special-rule-card{padding:12px 14px}
  #shakeDialog .special-rule-card h2{font-size:clamp(18px,5vw,25px);margin:8px 0 6px}
  #shakeDialog .special-rule-card p{margin:6px 0}
  #shakeDialog .shake-cards{margin:8px 0 10px}
  #shakeDialog .shake-cards .magnified-card{width:56px}
  #shakeDialog .go-btn,#shakeDialog .stop-btn{padding:9px 12px}
}
'''
path.write_text(text.rstrip()+css+'\n')

test=Path('tests/shake-floor-visibility.test.js')
test.write_text(r'''import test from 'node:test';
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
''')
