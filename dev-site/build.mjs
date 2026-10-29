'use strict';
import {copyFile,mkdir,rm,writeFile} from 'node:fs/promises';
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
// A separate frontend is NOT an isolated backend. Fail closed unless an
// explicitly configured nonproduction Cloudflare Worker has been provisioned.
const value=String(process.env.GOSTOP_DEV_SERVER_URL||'https://dev-api.gostop.invalid').trim().replace(/\/$/,'');
const url=new URL(value);
if(url.protocol!=='https:'||url.origin!==value||url.hostname==='gostoplive.com'||
  url.hostname==='www.gostoplive.com'||url.hostname==='gostop-authority.jwshin1.workers.dev'||
  (!url.hostname.endsWith('.invalid')&&!/^(?:gostop-dev|gostop-staging|gostop-authority-dev)[-.]/.test(url.hostname)))
  throw new Error('GOSTOP_DEV_SERVER_URL must use a separate, validated development-only HTTPS Worker origin.');
await writeFile(join(output,'runtime-config.js'),
  '// Development-only API. Production game data must remain isolated.\n'+
  'globalThis.GOSTOP_CONFIG=Object.freeze('+JSON.stringify({serverUrl:value})+');\n');
// The development preview never includes administration or backend source.
