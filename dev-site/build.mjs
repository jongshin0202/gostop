'use strict';
import {copyFile,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {instrumentDevCompetitiveSoloPeerSync} from './instrument-competitive-solo-peer-sync.mjs';
import {instrumentDevFriendlyInvite} from './instrument-friendly-invite.mjs';
import {instrumentDevFriendlyResume} from './instrument-friendly-resume.mjs';
import {instrumentDevCompetitiveLobby} from './instrument-competitive-lobby.mjs';
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
// Preserve protected source. Only the generated DEVELOPMENT copy receives a
// narrow reconciliation bridge for peer-controlled ranked Solo decisions.
const devAppPath=join(output,'app.js');
await writeFile(devAppPath,instrumentDevFriendlyResume(instrumentDevCompetitiveSoloPeerSync(await readFile(devAppPath,'utf8'))));
await copyFile(join(root,'dev-site/competitive-solo-peer-sync.js'),join(output,'dev-competitive-solo-peer-sync.js'));
// Development guest-link entry requires a user-gesture fullscreen gate.
const devRankedPath=join(output,'ranked-client.js');
await writeFile(devRankedPath,instrumentDevCompetitiveLobby(instrumentDevFriendlyInvite(await readFile(devRankedPath,'utf8'))));
await copyFile(join(root,'dev-site/friendly-invite-ux.js'),join(output,'dev-friendly-invite-ux.js'));
// Removable, development-only Training feedback; not included in public game builds.
await copyFile(join(root,'training-learning/cloud-client.js'),join(output,'training-learning-cloud.js'));
await copyFile(join(root,'training-learning/feedback-ui.js'),join(output,'training-learning-feedback.js'));
await copyFile(join(root,'dev-site/training-model-progress.js'),join(output,'dev-training-model-progress.js'));
// Isolated dev-only guard for existing login form hiding and local Quit return.
await copyFile(join(root,'dev-site/main-ui-integrity.js'),join(output,'dev-main-ui-integrity.js'));
// Isolated CSS overrides only Training advice embedded in special-rule dialogs.
await copyFile(join(root,'dev-site/training-special-advice-layout.css'),join(output,'dev-training-special-advice.css'));
await copyFile(join(root,'dev-site/training-reserved-ppeok-priority.js'),join(output,'dev-training-reserved-ppeok-priority.js'));
await copyFile(join(root,'dev-site/training-shaken-priority.js'),join(output,'dev-training-shaken-priority.js'));
await copyFile(join(root,'dev-site/training-recommendation-preserver.js'),join(output,'dev-training-recommendation-preserver.js'));
await copyFile(join(root,'dev-site/training-immediate-turn-advice.js'),join(output,'dev-training-immediate-turn-advice.js'));
await copyFile(join(root,'dev-site/training-recommendation-preserver.css'),join(output,'dev-training-recommendation-preserver.css'));
await copyFile(join(root,'dev-site/training-sake-cup-copy.js'),join(output,'dev-training-sake-cup-copy.js'));
await copyFile(join(root,'dev-site/training-advice-logic.js'),join(output,'dev-training-advice-logic.js'));
await copyFile(join(root,'dev-site/training-context-coach.js'),join(output,'dev-training-context-coach.js'));
await copyFile(join(root,'dev-site/training-context-coach.css'),join(output,'dev-training-context-coach.css'));
await copyFile(join(root,'dev-site/training-opening-evidence.js'),join(output,'dev-training-opening-evidence.js'));
await copyFile(join(root,'dev-site/training-opening-review.js'),join(output,'dev-training-opening-review.js'));
await copyFile(join(root,'dev-site/training-opening-review.css'),join(output,'dev-training-opening-review.css'));
await copyFile(join(root,'dev-site/training-go-stop-advice.js'),join(output,'dev-training-go-stop-advice.js'));




// Offline friend invite feature uses separate files and its own service worker scope.
await mkdir(join(output,'dev-invites'),{recursive:true});
await copyFile(join(root,'offline-invites/sw.js'),join(output,'dev-invites/sw.js'));
await copyFile(join(root,'offline-invites/client.js'),join(output,'dev-offline-invites.js'));

const htmlPath=join(output,'index.html');
let html=await readFile(htmlPath,'utf8');
if(!html.includes('</head>'))throw new Error('Missing HTML head for isolated Training dialog layout');
html=html.replace('</head>','  <link rel="stylesheet" href="dev-training-special-advice.css?v=20261030-1">\n  <link rel="stylesheet" href="dev-training-recommendation-preserver.css?v=20261031-1">\n  <link rel="stylesheet" href="dev-training-context-coach.css?v=20261031-1">\n  <link rel="stylesheet" href="dev-training-opening-review.css?v=20261101-hand-visible-1">\n</head>');
const oldRuntimeConfig='runtime-config.js?v=20260925-6';
if(!html.includes(oldRuntimeConfig))throw new Error('Unexpected dev runtime-config script reference');
html=html.replace(oldRuntimeConfig,'runtime-config.js?v=20261029-dev-cloudflare-1');
// Only the development build advances the tutorial asset while production stays frozen.
html=html.replace('tutorial-video.js?v=20261005-3','tutorial-video.js?v=20261029-howto-1');
const rankedDevScript='<script src="ranked-client.js?v=20261008-8"></script>';
if(!html.includes(rankedDevScript))throw new Error('Missing ranked-client script for isolated Friendly invite patch');
html=html.replace(rankedDevScript,
 '<script src="dev-friendly-invite-ux.js?v=20261101-invite-1"></script>\n  <script src="ranked-client.js?v=20261101-lobby-fix-1"></script>');
const feedbackScripts='<script src="training-learning-cloud.js?v=20261101-go-stop-1"></script>\n  <script src="dev-training-model-progress.js?v=20261101-countdown-1"></script>\n  <script src="training-learning-feedback.js?v=20261101-countdown-1"></script>';
if(!html.includes('<script src="app.js?v=20261028-7"></script>'))throw new Error('Missing frozen game script anchor');
html=html.replace('<script src="app.js?v=20261028-7"></script>',
  '<script src="dev-competitive-solo-peer-sync.js?v=20261101-peer-1"></script>\n  <script src="app.js?v=20261101-friend-resume-1"></script>\n  '+feedbackScripts);
html=html.replace('  '+feedbackScripts,'  '+feedbackScripts+'\n  <script src="dev-training-advice-logic.js?v=20261031-1"></script>\n  <script src="dev-training-context-coach.js?v=20261101-safe-1"></script>\n  <script src="dev-training-opening-evidence.js?v=20261101-birdies-1"></script>\n  <script src="dev-training-opening-review.js?v=20261101-hand-visible-1"></script>\n  <script src="dev-training-reserved-ppeok-priority.js?v=20261101-ppeok-1"></script>\n  <script src="dev-training-shaken-priority.js?v=20261101-shake-1"></script>\n  <script src="dev-training-recommendation-preserver.js?v=20261101-shake-1"></script>\n  <script src="dev-training-immediate-turn-advice.js?v=20261101-safe-1"></script>\n  <script src="dev-training-sake-cup-copy.js?v=20261031-1"></script>\n  <script src="dev-training-go-stop-advice.js?v=20261101-risk-1"></script>\n  <script src="dev-main-ui-integrity.js?v=20261030-1"></script>\n  <script src="dev-offline-invites.js?v=20261030-1"></script>');
// Preserve the production leaderboard UI exactly. Dev data stays isolated.
await writeFile(htmlPath,html);
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
