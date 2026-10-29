'use strict';
import {copyFile,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..'),output=join(here,'dist');
const gameFiles=[
  'index.html','app.js','styles.css','audio-ppeok.js','audio-shake.js','audio-fanfare.js',
  'i18n.js','game-engine.js','session-authority.js','mobile-fullscreen.css',
  'mobile-fullscreen.js','ranked-client.js','online-client.js','presentation-plan.js',
  'tutorial-video.js','diagnostics.js','gostop-notifications-sw.js','training-locales.js'
];
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const file of gameFiles)await copyFile(join(root,file),join(output,file));
const htmlPath=join(output,'index.html');
const html=await readFile(htmlPath,'utf8');
const oldRuntimeConfig='runtime-config.js?v=20260925-6';
if(!html.includes(oldRuntimeConfig))throw new Error('Unexpected dev runtime-config script reference');
await writeFile(htmlPath,html.replace(oldRuntimeConfig,'runtime-config.js?v=20261029-dev-cloudflare-1'));
// A separate frontend is NOT an isolated backend. Fail closed unless an
// explicitly configured nonproduction Cloudflare Worker has been provisioned.
const VERIFIED_DEV_WORKER='https://gostop-authority-dev.jwshin1.workers.dev';
// Never ship an invalid placeholder or silently fall back to the production API.
const value=String(process.env.GOSTOP_DEV_SERVER_URL||VERIFIED_DEV_WORKER).trim().replace(/\/$/,'');
const url=new URL(value);
if(url.protocol!=='https:'||url.origin!==value||value!==VERIFIED_DEV_WORKER)
  throw new Error('GOSTOP_DEV_SERVER_URL must match the verified isolated Cloudflare development Worker.');
await writeFile(join(output,'runtime-config.js'),
  '// Development-only API. Production game data must remain isolated.\n'+
  'globalThis.GOSTOP_CONFIG=Object.freeze('+JSON.stringify({serverUrl:value})+');\n');
// The development preview never includes administration or backend source.
