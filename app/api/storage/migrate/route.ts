import {migrateLegacyPayloads,type ArchiveBucket} from "../../../../lib/payloadArchive";
export async function POST(request:Request){
 const {env}=await import("cloudflare:workers");const runtime=env as unknown as {DB:D1Database;BUCKET?:ArchiveBucket;SYNC_TOKEN?:string};
 if(!runtime.SYNC_TOKEN||request.headers.get("authorization")!==`Bearer ${runtime.SYNC_TOKEN}`)return Response.json({error:"Unauthorized"},{status:401});
 if(!runtime.BUCKET)return Response.json({error:"Archival storage unavailable"},{status:503});
 return Response.json(await migrateLegacyPayloads(runtime.DB,runtime.BUCKET));
}
