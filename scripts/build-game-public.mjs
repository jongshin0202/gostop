'use strict';
import {copyFile,mkdir,rm,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Allowlist only game-facing static files in the public Vercel deployment.
// Admin UI and admin source code must never be present in this output.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'dist-game');
const publicFiles=[
  'index.html','app.js','styles.css','audio-ppeok.js','audio-shake.js','audio-fanfare.js',
  'i18n.js','game-engine.js','session-authority.js','runtime-config.js',
  'mobile-fullscreen.css','mobile-fullscreen.js','ranked-client.js',
  'online-client.js','presentation-plan.js','tutorial-video.js',
  'diagnostics.js','gostop-notifications-sw.js'
];
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of publicFiles)await copyFile(join(root,file),join(output,file));
// Present in the seven-language Training feature branch, absent in earlier baselines.
try{await access(join(root,'training-locales.js'));await copyFile(join(root,'training-locales.js'),join(output,'training-locales.js'));}catch(error){if(error.code!=='ENOENT')throw error;}
