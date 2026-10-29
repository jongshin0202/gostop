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
  for(const filename of ['index.html','app.js','training-locales.js','ranked-client.js','runtime-config.js','training-learning-model.js','training-learning-feedback.js'])assert.ok(files.includes(filename),filename);
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
  assert.ok(html.indexOf('app.js?v=20261028-7')<html.indexOf('training-learning-model.js'));
  assert.ok(html.indexOf('training-learning-model.js')<html.indexOf('training-learning-feedback.js'));
  const feedback=readFileSync(join(output,'training-learning-feedback.js'),'utf8');
  assert.match(feedback,/GoStopRanked\?\.getAccount/);
  assert.match(feedback,/trainingModeBtn/);
  assert.doesNotMatch(feedback,/\.preventDefault\(\)|\.stopPropagation\(\)/);

});
test('development Vercel config is independent and blocks same-origin APIs',()=>{
  const dev=JSON.parse(readFileSync(join(root,'dev-site/vercel.json'),'utf8'));
  assert.equal(dev.outputDirectory,'dist');
  assert.ok(dev.routes.some(route=>route.status===503&&new RegExp(route.src).test('/api/auth/login')));
  assert.ok(dev.git.deploymentEnabled.develop);
  assert.equal(dev.git.deploymentEnabled.main,undefined);
});

test('expert feedback and model are NEVER included by the public production entrypoint',()=>{
  // Production uses the unchanged root index.html, never the dev-site build output.
  const publicHtml=readFileSync(join(root,'index.html'),'utf8');
  assert.doesNotMatch(publicHtml,/training-learning-(?:model|feedback)\.js/);
  assert.doesNotMatch(publicHtml,/trainingFeedbackDialog|GoStopTrainingFeedbackDev/);
  const publicBuild=readFileSync(join(root,'scripts/build-game-public.mjs'),'utf8');
  assert.doesNotMatch(publicBuild,/training-learning[\\/]/);
});
