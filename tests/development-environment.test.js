import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=join(root,'dev-site/dist');
test('development Vercel bundle includes Training Mode but excludes admin and production Worker access',()=>{
  const r=spawnSync(process.execPath,['dev-site/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,GOSTOP_DEV_SERVER_URL:''}});
  assert.equal(r.status,0,r.stderr);
  const files=readdirSync(output);
  for(const filename of ['index.html','app.js','training-locales.js','ranked-client.js','runtime-config.js','dev-leaderboard-empty-note.js'])assert.ok(files.includes(filename),filename);
  for(const filename of ['admin.html','admin.css','admin.js','server','wrangler.toml','vercel.json'])assert.ok(!files.includes(filename),filename);
  const config=readFileSync(join(output,'runtime-config.js'),'utf8');
  assert.match(config,/https:\/\/gostop-authority-dev\.jwshin1\.workers\.dev/);
  assert.doesNotMatch(config,/\.invalid/);
  assert.doesNotMatch(config,/gostop-authority\.jwshin1\.workers\.dev/);
});
test('development build refuses to connect to the live authoritative Worker',()=>{
  const r=spawnSync(process.execPath,['dev-site/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,GOSTOP_DEV_SERVER_URL:'https://gostop-authority.jwshin1.workers.dev'}});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/verified isolated Cloudflare development Worker/);
});
test('explicit Cloudflare dev Worker produces a working runtime config before game scripts',()=>{
  const r=spawnSync(process.execPath,['dev-site/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,GOSTOP_DEV_SERVER_URL:'https://gostop-authority-dev.jwshin1.workers.dev'}});
  assert.equal(r.status,0,r.stderr);
  const runtime=readFileSync(join(output,'runtime-config.js'),'utf8');
  const context={};runInNewContext(runtime,context);
  assert.equal(context.GOSTOP_CONFIG?.serverUrl,'https://gostop-authority-dev.jwshin1.workers.dev');
  const html=readFileSync(join(output,'index.html'),'utf8');
  assert.ok(html.indexOf('runtime-config.js')<html.indexOf('ranked-client.js'));
  assert.match(html,/runtime-config\.js\?v=20261029-dev-cloudflare-1/);
  assert.match(html,/dev-leaderboard-empty-note\.js\?v=20261029-1/);
  assert.ok(html.indexOf('app.js?v=')<html.indexOf('dev-leaderboard-empty-note.js'));
  const note=readFileSync(join(output,'dev-leaderboard-empty-note.js'),'utf8');
  assert.match(note,/rows\.length===10/);
  assert.match(note,/row\.classList\.contains\('leaderboard-empty-row'\)/);
  for(const locale of ['en','ko','es','fr','de','ja','zh'])assert.match(note,new RegExp('\\\\b'+locale+':'));
  assert.doesNotMatch(note,/gostop-authority\.jwshin1\.workers\.dev/);
});
test('development Vercel config is independent and blocks same-origin APIs',()=>{
  const dev=JSON.parse(readFileSync(join(root,'dev-site/vercel.json'),'utf8'));
  assert.equal(dev.outputDirectory,'dist');
  assert.ok(dev.routes.some(route=>route.status===503&&new RegExp(route.src).test('/api/auth/login')));
  assert.ok(dev.git.deploymentEnabled.develop);
  assert.equal(dev.git.deploymentEnabled.main,undefined);
});
