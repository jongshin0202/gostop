import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('Vercel Git integration deploys main only',()=>{
  assert.equal(config.git?.deploymentEnabled?.main,true);
  assert.equal(config.git?.deploymentEnabled?.['**'],false);
});

test('public Vercel build publishes game-only output and explicitly blocks admin routes',()=>{
  assert.equal(config.buildCommand,'node scripts/write-runtime-config.mjs && node scripts/build-game-public.mjs');
  assert.equal(config.outputDirectory,'dist-game');
  assert.ok(config.rewrites?.some(rule=>rule.source==='/api/:path*'&&rule.destination==='https://gostop-authority.jwshin1.workers.dev/api/:path*'));
  assert.ok(!config.rewrites?.some(rule=>rule.source.startsWith('/api/admin')));
  assert.ok(config.routes?.some(rule=>rule.src.includes('/admin')&&rule.status===404));
  assert.ok(config.routes?.some(rule=>rule.src.includes('/api/admin')&&rule.status===404));
});
test('standalone admin Vercel build proxies admin only',()=>{
  const admin=JSON.parse(fs.readFileSync(new URL('../admin-portal/vercel.json',import.meta.url),'utf8'));
  assert.equal(admin.buildCommand,'node build.mjs');
  assert.equal(admin.outputDirectory,'dist');
  assert.ok(admin.rewrites?.some(rule=>rule.source==='/api/admin/:path*'&&rule.destination==='https://gostop-authority.jwshin1.workers.dev/api/admin/:path*'));
  assert.equal(admin.rewrites?.length,1);
});
