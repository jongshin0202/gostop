import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {isAllowedAdminOrigin} from '../server/worker.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const publicConfig=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
const adminConfig=JSON.parse(readFileSync(join(root,'admin-portal/vercel.json'),'utf8'));
function build(script){
  const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
}

test('public website deploy contains game assets only, and no admin files or source',()=>{
  build('scripts/build-game-public.mjs');
  const files=readdirSync(join(root,'dist-game')).sort();
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('ranked-client.js'));
  assert.ok(files.includes('app.js'),'core gameplay app.js must be included');
  assert.ok(files.includes('runtime-config.js'));
  assert.ok(files.includes('gostop-notifications-sw.js'));
  assert.ok(!files.some(name=>name.startsWith('admin')));
  assert.ok(!files.includes('server'));
  assert.ok(!files.includes('tests'));
  assert.ok(!files.includes('vercel.json'));
  for(const path of ['/admin','/admin/','/admin.html','/admin.js','/admin.css','/api/admin','/api/admin/health']){
    assert.ok(publicConfig.routes.some(route=>route.status===404&&new RegExp(route.src).test(path)),path);
  }
});

test('separate admin project deploys only its interface and own same-origin admin proxy',()=>{
  build('admin-portal/build.mjs');
  assert.deepEqual(readdirSync(join(root,'admin-portal/dist')).sort(),['admin.css','admin.js','index.html']);
  const markup=readFileSync(join(root,'admin-portal/dist/index.html'),'utf8');
  assert.match(markup,/admin\.js\?v=/);
  assert.match(markup,/admin\.css/);
  assert.doesNotMatch(markup,/runtime-config\.js/);
  assert.ok(adminConfig.rewrites.some(route=>route.source==='/api/admin/:path*'));
  assert.ok(!adminConfig.rewrites.some(route=>route.source==='/api/:path*'));
});

test('Cloudflare admin origins must be configured separately and never default to the game domain',()=>{
  const env={ADMIN_ORIGINS:'https://console.example.test'};
  assert.equal(isAllowedAdminOrigin('https://console.example.test',env),true);
  for(const origin of ['https://gostoplive.com','https://www.gostoplive.com','https://admin.gostoplive.com','https://random.vercel.app']){
    assert.equal(isAllowedAdminOrigin(origin,env),false,origin);
  }
});

test('Cloudflare Worker admin allowlist only names the separated admin Vercel site',()=>{
  const workerConfig=readFileSync(join(root,'wrangler.toml'),'utf8');
  assert.match(workerConfig,/^ADMIN_ORIGINS = "https:\/\/gostop-admin\.vercel\.app,https:\/\/gostop-admin-jwshin1-5345s-projects\.vercel\.app"$/m);
  assert.doesNotMatch(workerConfig,/^ADMIN_ORIGINS = "[^"]*gostoplive\.com/m);
});
