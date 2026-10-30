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
  for(const filename of ['index.html','app.js','training-locales.js','ranked-client.js','runtime-config.js','training-learning-cloud.js','training-learning-feedback.js'])assert.ok(files.includes(filename),filename);
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
  assert.ok(html.indexOf('app.js?v=20261028-7')<html.indexOf('training-learning-cloud.js'));
  assert.ok(html.indexOf('training-learning-cloud.js')<html.indexOf('training-learning-feedback.js'));
  assert.doesNotMatch(html,/training-learning-model\.js/);
  const cloud=readFileSync(join(output,'training-learning-cloud.js'),'utf8');
  assert.match(cloud,/gostop-training-learning-dev\.jwshin1\.workers\.dev/);
  assert.doesNotMatch(cloud,/localStorage\.setItem\(/);
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

test('offline Competitive request module exists in development bundle only, without replacing the game service worker',()=>{
  const r=spawnSync(process.execPath,['dev-site/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,GOSTOP_DEV_SERVER_URL:''}});
  assert.equal(r.status,0,r.stderr);
  const html=readFileSync(join(output,'index.html'),'utf8');
  assert.match(html,/dev-offline-invites\.js\?v=/);
  assert.ok(readdirSync(output).includes('dev-offline-invites.js'));
  assert.ok(readdirSync(join(output,'dev-invites')).includes('sw.js'));
  assert.ok(readdirSync(output).includes('gostop-notifications-sw.js'),'existing game notification worker must remain');
  const devClient=readFileSync(join(output,'dev-offline-invites.js'),'utf8');
  assert.match(devClient,/gostop-offline-invites-dev\.jwshin1\.workers\.dev/);
  assert.match(devClient,/Request in Progress/);
  assert.match(devClient,/dev-invites\/sw\.js/);
  const pushWorker=readFileSync(join(output,'dev-invites','sw.js'),'utf8');
  assert.match(pushWorker,/notificationclick/);
  assert.match(pushWorker,/getNotifications/);
  assert.match(pushWorker,/devInviteSettings/);
  assert.doesNotMatch(readFileSync(join(root,'index.html'),'utf8'),/dev-offline-invites|dev-invites\/sw\.js/);
  assert.doesNotMatch(readFileSync(join(root,'vercel.json'),'utf8'),/dev-offline-invites/);
});

test('expert feedback and model are NEVER included by the public production entrypoint',()=>{
  // Production uses the unchanged root index.html, never the dev-site build output.
  const publicHtml=readFileSync(join(root,'index.html'),'utf8');
  assert.doesNotMatch(publicHtml,/training-learning-(?:model|feedback)\.js/);
  assert.doesNotMatch(publicHtml,/trainingFeedbackDialog|GoStopTrainingFeedbackDev/);
  const publicConfig=readFileSync(join(root,'vercel.json'),'utf8');
  assert.doesNotMatch(publicConfig,/training-learning-(?:model|feedback)/);
});
