'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const dir=join(__dirname,'..','admin-dev-portal');
const read=name=>readFileSync(join(dir,name),'utf8');
test('development admin is a distinct standalone Vercel project',()=>{
 const cfg=JSON.parse(read('vercel.json'));
 assert.equal(cfg.outputDirectory,'dist');
 assert.equal(cfg.buildCommand,'node build.mjs');
 assert.deepEqual(cfg.rewrites,[{source:'/api/admin/:path*',destination:'https://gostop-authority-dev.jwshin1.workers.dev/api/admin/:path*'}]);
 assert.doesNotMatch(JSON.stringify(cfg),/https:\/\/gostop-authority\.jwshin1\.workers\.dev/);
});
test('admin dev UI cannot accidentally reuse production browser credentials',()=>{
 const js=read('admin.js'),html=read('index.html');
 assert.match(js,/gostop-admin-dev-token/);
 assert.doesNotMatch(js,/const TOKEN_KEY='gostop-admin-token'/);
 assert.match(js,/const baseUrl='';/);
 assert.match(html,/<title>GoStop Live! — Development Admin<\/title>/);
 assert.match(html,/DEVELOPMENT ONLY/);
});
test('deploy bundle excludes main game source and production URLs',()=>{
 const build=read('build.mjs');
 for(const s of ['index.html','admin.js','admin.css'])assert.match(build,new RegExp(s.replace('.','\\.')));
 for(const s of ['app.js','game-engine.js','server/worker.mjs','runtime-config.js'])assert.doesNotMatch(build,new RegExp(s.replace('.','\\.')));
 for(const f of ['index.html','admin.js','admin.css'])assert.doesNotMatch(read(f),/gostop-authority\.jwshin1\.workers\.dev/);
});
