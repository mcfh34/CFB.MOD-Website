/** Raw provider responses are objects; D1 holds small searchable metadata only. */
export type ArchiveBucket={get:(key:string)=>Promise<{text:()=>Promise<string>}|null>;put:(key:string,value:string,options?:unknown)=>Promise<unknown>};
export async function archiveKey(cacheKey:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(cacheKey));return `api-cache/${[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,"0")).join("")}.json`;}
export async function readArchivedPayload(bucket:ArchiveBucket,cacheKey:string){const object=await bucket.get(await archiveKey(cacheKey));return object?JSON.parse(await object.text()):undefined;}
export async function storeArchivedPayload(db:D1Database,bucket:ArchiveBucket,cacheKey:string,payload:string){
 const key=await archiveKey(cacheKey),checksum=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload)))].map(n=>n.toString(16).padStart(2,"0")).join("");
 const previous=await db.prepare("SELECT checksum FROM api_payload_index WHERE cache_key=?").bind(cacheKey).first<{checksum:string}>();
 if(previous?.checksum===checksum)return;
 // Immutable content-versioned copy supports later model experiments and recovery.
 await bucket.put(`api-history/${checksum}.json`,payload,{httpMetadata:{contentType:"application/json"}});
 await bucket.put(key,payload,{httpMetadata:{contentType:"application/json"}});
 await db.prepare("INSERT INTO api_payload_index(cache_key,object_key,checksum,size_bytes,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(cache_key) DO UPDATE SET object_key=excluded.object_key,checksum=excluded.checksum,size_bytes=excluded.size_bytes,updated_at=CURRENT_TIMESTAMP").bind(cacheKey,key,checksum,new TextEncoder().encode(payload).length).run();
}
export async function migrateLegacyPayloads(db:D1Database,bucket:ArchiveBucket,limit=3){
 const keys=await db.prepare("SELECT DISTINCT cache_key AS cacheKey FROM weekly_api_cache WHERE cache_key NOT IN (SELECT cache_key FROM api_payload_index) ORDER BY cache_key LIMIT ?").bind(Math.min(5,Math.max(1,limit))).all<{cacheKey:string}>();
 let migrated=0;for(const {cacheKey} of keys.results){const chunks=await db.prepare("SELECT payload FROM weekly_api_cache WHERE cache_key=? ORDER BY part").bind(cacheKey).all<{payload:string}>();const payload=chunks.results.map(c=>c.payload).join("");JSON.parse(payload);await storeArchivedPayload(db,bucket,cacheKey,payload);const verified=await bucket.get(await archiveKey(cacheKey));if(!verified||await verified.text()!==payload)throw Error("Archive verification failed");await db.prepare("DELETE FROM weekly_api_cache WHERE cache_key=?").bind(cacheKey).run();migrated++;}
 const remaining=await db.prepare("SELECT COUNT(DISTINCT cache_key) AS count FROM weekly_api_cache WHERE cache_key NOT IN (SELECT cache_key FROM api_payload_index)").first<{count:number}>();
 return {migrated,remaining:remaining?.count??0};
}
