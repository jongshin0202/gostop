import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AccountStore} from '../server/account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)));}
}

const post=(path,body)=>new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('registration stores a Cloudflare-compatible PBKDF2 iteration count',async()=>{
  const store=new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:globalThis.crypto,now:()=> '2026-09-15T18:00:00.000Z'});
  const response=await store.fetch(post('/register',{email:'cloudflare@example.com',nickname:'CloudflareOK',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  assert.equal(response.status,201);
  const body=await response.json();
  const account=await store.accountById(body.account.id);
  assert.equal(account.passwordIterations,100000);
});

test('inactive account form is forcibly hidden despite account-form display grid',async()=>{
  const css=await readFile(new URL('../mobile-fullscreen.css',import.meta.url),'utf8');
  assert.match(css,/\.account-form\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/);
});
