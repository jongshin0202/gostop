'use strict';
import {copyFile,mkdir,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Publish only the three admin frontend assets for this separate Vercel project.
const root=dirname(fileURLToPath(import.meta.url));
const output=join(root,'dist');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of ['index.html','admin.js','admin.css'])await copyFile(join(root,file),join(output,file));
