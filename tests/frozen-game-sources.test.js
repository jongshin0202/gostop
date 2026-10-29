// Frozen GoStop launch-candidate gameplay sources.
// Intentionally fails CI if game code changes during training/how-to development.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const frozen=Object.freeze({
  "app.js": "46904be461207302afe37b7466e5caf202eba7a1",
  "index.html": "c66fb2498b655e4f01a02510ec9a1a03d4ff437b",
  "game-engine.js": "36aa58f8815a2e9ced62361986200ecd9741e2af",
  "session-authority.js": "44ab368976a2f9fac2cae337bf5b9c3d0baba222",
  "ranked-client.js": "e073a47f2ea2cb6f07610ff0c6fdddfa2c5802e8",
  "online-client.js": "f1a035fb20ec352bb177c08990b8d5130a825ef1",
  "presentation-plan.js": "d74bed22deb974bda0e49467c6756fff7173dada",
  "i18n.js": "008689427a957e9f92c668ea1bc548ac6b65446c",
  "styles.css": "ccc4ec5fc373c8be467dde00d5b1e4139489a610",
  "mobile-fullscreen.js": "256763686a8a396ac9362e81a6eb673d878a46f2",
  "mobile-fullscreen.css": "c9561c3dfa96746b12d02f0ff7ca565d71a1e0f2",
  "runtime-config.js": "7112da4aee479223fada0cb9443a595b0e639769",
  "server/worker.mjs": "f93eb52f5d7ab2016fb2575a2ec6e51a613cd784",
  "server/account-store.mjs": "d0dbb24b5d41a814ac3ba5fed64b79593511b270",
  "server/game-room.mjs": "f3e64e9b1f342a87ebe2cb5b7380f3bdeb16f591",
  "server/lobby.mjs": "c912aec50351971b299e470db836869af1db3cd8"
});
for(const [file,expected] of Object.entries(frozen)){
  test('preserve frozen game source: '+file,()=>{
    const bytes=readFileSync(new URL('../'+file,import.meta.url));
    const digest=createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');
    assert.equal(digest,expected,file+' is frozen; do not modify the working main game for Training or How-To tasks');
  });
}
