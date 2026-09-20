const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const validSlot=value=>value==='primary'||value==='safety';
const randomId=cryptoApi=>{if(cryptoApi?.randomUUID)return cryptoApi.randomUUID();const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};

export class BackupStore{
  constructor(state,env,{cryptoApi=globalThis.crypto,now=()=>new Date().toISOString()}={}){this.state=state;this.storage=state.storage;this.env=env;this.crypto=cryptoApi;this.now=now;}
  async pointer(slot){return validSlot(slot)?await this.storage.get(`pointer:${slot}`):null;}
  async metadataById(id){return id?await this.storage.get(`snapshotMeta:${id}`):null;}
  async metadata(slot){return this.metadataById(await this.pointer(slot));}
  async deleteSnapshot(id){
    if(!id)return;
    const entries=await this.storage.list({prefix:`snapshot:${id}:`});
    for(const key of entries.keys())await this.storage.delete(key);
    await this.storage.delete(`snapshotMeta:${id}`);
  }
  async write(slot,snapshot={},metadata={}){
    if(!validSlot(slot))throw Object.assign(new Error('Backup slot must be primary or safety.'),{status:400,code:'INVALID_BACKUP_SLOT'});
    const accountEntries=Array.isArray(snapshot.accountEntries)?snapshot.accountEntries:[],rooms=Array.isArray(snapshot.rooms)?snapshot.rooms:[],oldId=await this.pointer(slot),id=`backup_${randomId(this.crypto)}`,createdAt=this.now();
    let index=0;
    for(const entry of accountEntries){
      if(!entry||typeof entry.key!=='string')continue;
      await this.storage.put(`snapshot:${id}:account:${String(index++).padStart(8,'0')}`,{key:entry.key,value:clone(entry.value)});
    }
    let roomIndex=0;
    for(const room of rooms){
      if(!room?.roomCode)continue;
      await this.storage.put(`snapshot:${id}:room:${String(roomIndex++).padStart(8,'0')}`,{roomCode:String(room.roomCode),room:clone(room.room??null)});
    }
    const record={id,slot,createdAt,accountEntries:index,rooms:roomIndex,fingerprint:String(metadata.fingerprint||''),resetMode:metadata.resetMode||null,reason:metadata.reason||null,accountCount:Number(metadata.accountCount)||0,gameCount:Number(metadata.gameCount)||0,sessionCount:Number(metadata.sessionCount)||0};
    await this.storage.put(`snapshotMeta:${id}`,record);
    await this.storage.put(`pointer:${slot}`,id);
    if(oldId&&oldId!==id)await this.deleteSnapshot(oldId);
    return clone(record);
  }
  async read(slot){
    if(!validSlot(slot))throw Object.assign(new Error('Backup slot must be primary or safety.'),{status:400,code:'INVALID_BACKUP_SLOT'});
    const id=await this.pointer(slot),metadata=await this.metadataById(id);if(!id||!metadata)return null;
    const accountRows=[...(await this.storage.list({prefix:`snapshot:${id}:account:`})).values()].sort((a,b)=>String(a.key).localeCompare(String(b.key)));
    const roomRows=[...(await this.storage.list({prefix:`snapshot:${id}:room:`})).values()].sort((a,b)=>String(a.roomCode).localeCompare(String(b.roomCode)));
    return {metadata:clone(metadata),accountEntries:accountRows.map(item=>({key:item.key,value:clone(item.value)})),rooms:roomRows.map(item=>({roomCode:item.roomCode,room:clone(item.room)}))};
  }
  async promoteSafety(){
    const safetyId=await this.pointer('safety');if(!safetyId)throw Object.assign(new Error('Safety backup is not available.'),{status:409,code:'SAFETY_BACKUP_MISSING'});
    const primaryId=await this.pointer('primary');if(primaryId&&primaryId!==safetyId)await this.deleteSnapshot(primaryId);
    const meta=await this.metadataById(safetyId);if(!meta)throw Object.assign(new Error('Safety backup metadata is missing.'),{status:409,code:'SAFETY_BACKUP_MISSING'});
    meta.slot='primary';await this.storage.put(`snapshotMeta:${safetyId}`,meta);await this.storage.put('pointer:primary',safetyId);await this.storage.delete('pointer:safety');return clone(meta);
  }
  async status(){return {primary:await this.metadata('primary'),safety:await this.metadata('safety')};}
  async purgeAccount(accountId){
    const id=String(accountId||'').trim();if(!id)throw Object.assign(new Error('Account ID is required.'),{status:400,code:'ACCOUNT_REQUIRED'});
    const pointers=[await this.pointer('primary'),await this.pointer('safety')].filter(Boolean),updated=[];
    for(const snapshotId of [...new Set(pointers)]){
      const rows=await this.storage.list({prefix:`snapshot:${snapshotId}:`});let removed=0;
      for(const [key,item] of rows){const hay=`${item?.key||''}\n${JSON.stringify(item?.value??item?.room??null)}`;if(hay.includes(id)){await this.storage.delete(key);removed++;}}
      const meta=await this.metadataById(snapshotId);if(meta&&removed){const accountRows=await this.storage.list({prefix:`snapshot:${snapshotId}:account:`}),roomRows=await this.storage.list({prefix:`snapshot:${snapshotId}:room:`});meta.accountEntries=accountRows.size;meta.rooms=roomRows.size;meta.fingerprint='';meta.redactedAt=this.now();meta.redactedAccountIds=[...(meta.redactedAccountIds||[]),id];await this.storage.put(`snapshotMeta:${snapshotId}`,meta);updated.push({snapshotId,removed});}
    }
    return {ok:true,updated};
  }
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    try{
      if(request.method==='GET'&&path==='/status')return json({ok:true,...await this.status()});
      if(request.method==='GET'&&(path==='/snapshot/primary'||path==='/snapshot/safety')){const slot=path.endsWith('safety')?'safety':'primary',snapshot=await this.read(slot);return snapshot?json({ok:true,snapshot}):json({ok:false,error:{code:'BACKUP_NOT_FOUND',message:'No backup is available.'}},404);}
      if(request.method==='POST'&&path==='/snapshot/write'){const body=await request.json().catch(()=>({})),metadata=await this.write(body.slot,body.snapshot,body.metadata);return json({ok:true,metadata},201);}
      if(request.method==='POST'&&path==='/promote-safety')return json({ok:true,primary:await this.promoteSafety()});
      if(request.method==='POST'&&path==='/purge-account'){const body=await request.json().catch(()=>({}));return json(await this.purgeAccount(body.accountId));}
      return json({ok:false,error:{code:'NOT_FOUND',message:'Backup endpoint not found.'}},404);
    }catch(error){return json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message||'Backup request failed.'}},error.status||500);}
  }
}
