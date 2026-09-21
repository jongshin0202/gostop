import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('Vercel Git integration deploys main only',()=>{
  assert.equal(config.git?.deploymentEnabled?.main,true);
  assert.equal(config.git?.deploymentEnabled?.['**'],false);
});

test('manual Vercel configuration keeps the production build and admin proxy intact',()=>{
  assert.equal(config.buildCommand,'node scripts/write-runtime-config.mjs');
  assert.equal(config.outputDirectory,'.');
  assert.ok(config.rewrites?.some(rule=>rule.source==='/api/admin/:path*'&&rule.destination==='https://gostop-authority.jwshin1.workers.dev/api/admin/:path*'));
});
