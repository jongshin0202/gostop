/* Assemble a separate DEVELOPMENT Worker from immutable main-game sources.
 * Do not edit tracked server files or production Wrangler configuration.
 * This output is temporary and used only for dev deployment and regression.
 */
import {copyFile,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {instrumentDevResponsiveLobby} from './instrument-lobby-responsiveness.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'dev-site','worker-dist'),server=join(out,'server');
await rm(out,{recursive:true,force:true});
await mkdir(server,{recursive:true});
for(const file of await readdir(join(root,'server'))){
 if(!file.endsWith('.mjs'))continue;
 await copyFile(join(root,'server',file),join(server,file));
}
for(const name of ['game-engine.js','session-authority.js'])
 await copyFile(join(root,name),join(out,name));
const lobby=await readFile(join(root,'server/lobby.mjs'),'utf8');
const patched=instrumentDevResponsiveLobby(lobby);
if(patched===lobby)throw new Error('Missing dev lobby responsiveness changes');
await writeFile(join(server,'lobby.mjs'),patched);
const config=await readFile(join(root,'wrangler.dev.toml'),'utf8');
const existing='main = "server/worker.mjs"';
if(config.split(existing).length!==2)throw new Error('Unexpected development Worker entrypoint');
await writeFile(join(root,'wrangler.dev.responsive.toml'),config.replace(existing,
 'main = "dev-site/worker-dist/server/worker.mjs"'));
console.log('Development-only Lobby Worker compiled; protected server sources unchanged.');
