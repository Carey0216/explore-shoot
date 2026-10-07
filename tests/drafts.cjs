const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('dist/shared/drafts.js','utf8');
 const {createDraftStore,DRAFT_TTL}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const records=new Map();let time=1000,fail=false;
 const storage={async get(key){if(fail)throw Error('blocked');return structuredClone(records.get(key));},async put(record){if(fail)throw Error('quota');records.set(record.key,structuredClone(record));},async remove(key){if(fail)throw Error('blocked');records.delete(key);}};
 let store=createDraftStore(storage,()=>time),draft=store('alice','publish');const phases=[];
 draft.subscribe(s=>phases.push(s.phase));
 await draft.update({fields:{name:'校园角落',description:'明亮的走廊'},coordinate:{lng:106,lat:38}});
 await draft.update({photo:'data:image/jpeg;base64,abc',uploaded:{id:'owned-photo'}});
 // A fresh store represents a browser refresh, not the original in-memory cache.
 store=createDraftStore(storage,()=>time);
 assert.equal((await store('alice','publish').read()).fields.name,'校园角落');
 assert.equal((await store('alice','publish').read()).uploaded.id,'owned-photo');
 assert.deepEqual(await store('bob','publish').read(),{});
 assert.deepEqual(await store('alice','note:another-record').read(),{});
 assert.equal((await store('alice','publish').read()).photo,'data:image/jpeg;base64,abc');
 assert.ok(phases.includes('saving')&&phases.includes('saved'));
 // Writes queued before discard cannot resurrect discarded data.
 draft=store('alice','publish');const saves=[draft.update({fields:{name:'first'}}),draft.update({fields:{name:'second'}}),draft.clear()];
 await Promise.all(saves);assert.deepEqual(await draft.read(),{});
 // After acknowledgement, delayed input saves are suppressed until an explicit new edit.
 await draft.update({fields:{feedback:'保存前'}});await draft.clear({submitted:true});
 assert.equal(await draft.update({fields:{feedback:'迟到事件'}}),false);
 assert.deepEqual(await createDraftStore(storage,()=>time)('alice','publish').read(),{});
 draft.reopen();await draft.update({fields:{feedback:'新一轮编辑'}});
 assert.equal((await draft.read()).fields.feedback,'新一轮编辑');
 // Storage rejection is observable and must not report success or erase older data.
 fail=true;await assert.rejects(draft.update({fields:{feedback:'配额不足'}}),/quota/);
 await assert.rejects(draft.clear(),/blocked/);fail=false;
 assert.equal((await createDraftStore(storage,()=>time)('alice','publish').read()).fields.feedback,'新一轮编辑');
 time+=DRAFT_TTL+1;
 assert.deepEqual(await createDraftStore(storage,()=>time)('alice','publish').read(),{});
 assert.equal(records.size,0);
 // Delimiters inside account/context IDs do not collide.
 store=createDraftStore(storage,()=>time);await store('a:b','c').update({fields:{name:'private'}});
 assert.deepEqual(await store('a','b:c').read(),{});
 console.log('Draft checks passed: refresh recovery, photos/text/coordinates, account isolation, expiry, quota errors, discard/write ordering and post-submit cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
