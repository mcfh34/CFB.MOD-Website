import test from 'node:test';
import assert from 'node:assert/strict';
import {sundayNoonSlot,withApiPolicy,cachedApiRequest,WEEKLY_API_LIMIT} from '../lib/weeklyApiPolicy';
function database(){const rows=new Map<string,string[]>();return {rows,prepare(sql:string){let values:unknown[]=[];const statement={bind(...args:unknown[]){values=args;return statement;},async all(){return {results:(rows.get(String(values[0]))??[]).map(payload=>({payload}))};},async run(){if(sql.startsWith('DELETE'))rows.delete(String(values[0]));if(sql.startsWith('INSERT')){const list=rows.get(String(values[0]))??[];list[Number(values[1])]=String(values[2]);rows.set(String(values[0]),list);}return {meta:{changes:1}};}};return statement;},async batch(statements:{run:()=>Promise<unknown>}[]){return Promise.all(statements.map(s=>s.run()));}} as unknown as D1Database;}
test('Sunday noon Central handles DST and excludes the other cron candidate',()=>{
 assert.equal(sundayNoonSlot(new Date('2026-10-25T17:00:00Z')),'2026-10-25');
 assert.equal(sundayNoonSlot(new Date('2026-10-25T18:00:00Z')),null);
 assert.equal(sundayNoonSlot(new Date('2026-11-01T18:00:00Z')),'2026-11-01');
 assert.equal(sundayNoonSlot(new Date('2026-11-01T17:00:00Z')),null);
 assert.equal(sundayNoonSlot(new Date('2026-10-31T17:00:00Z')),null);
});
test('visitors never fetch, weekly duplicate requests share one call, cache persists',async()=>{
 const db=database();let calls=0;const url=new URL('https://example.com/stats?year=2026');const fetcher=async()=>{calls++;return [{a:1}];};
 assert.deepEqual(await withApiPolicy(db,false,()=>cachedApiRequest(url,fetcher)),[]);assert.equal(calls,0);
 await withApiPolicy(db,true,()=>Promise.all([cachedApiRequest(url,fetcher),cachedApiRequest(url,fetcher)]));assert.equal(calls,1);
 assert.deepEqual(await withApiPolicy(db,false,()=>cachedApiRequest(url,fetcher)),[{a:1}]);assert.equal(calls,1);
});
test('hard weekly cap and first failure stop subsequent external requests',async()=>{
 const db=database();let calls=0;
 await withApiPolicy(db,true,async()=>{for(let i=0;i<WEEKLY_API_LIMIT;i++)await cachedApiRequest(new URL(`https://example.com/${i}`),async()=>++calls);
 await assert.rejects(cachedApiRequest(new URL('https://example.com/over'),async()=>++calls));});assert.equal(calls,WEEKLY_API_LIMIT);
 await withApiPolicy(db,true,async()=>{await assert.rejects(cachedApiRequest(new URL('https://example.com/fail'),async()=>{throw Object.assign(Error('429'),{status:429});}));await assert.rejects(cachedApiRequest(new URL('https://example.com/again'),async()=>++calls));});assert.equal(calls,WEEKLY_API_LIMIT);
});
test('sequential duplicate feeds reuse persisted data within a run',async()=>{const db=database();let calls=0;const url=new URL('https://example.com/stats?year=2026');await withApiPolicy(db,true,async()=>{await cachedApiRequest(url,async()=>{calls++;return [1];});assert.deepEqual(await cachedApiRequest(url,async()=>{calls++;return [2];}),[1]);});assert.equal(calls,1);});
