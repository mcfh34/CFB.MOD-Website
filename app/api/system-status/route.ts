export async function GET(){
 const {env}=await import("cloudflare:workers");const db=env.DB as D1Database;
 const [basic,advanced,players,run]=await Promise.all([
 db.prepare("SELECT season,MAX(week) AS week,MAX(created_at) AS updatedAt FROM weekly_profiles GROUP BY season ORDER BY season DESC LIMIT 1").first(),
 db.prepare("SELECT season,MAX(week) AS week FROM weekly_advanced_profiles GROUP BY season ORDER BY season DESC LIMIT 1").first(),
 db.prepare("SELECT season,stage,updated_at AS updatedAt FROM player_sync_state ORDER BY season DESC LIMIT 1").first(),
 db.prepare("SELECT slot,status FROM weekly_stats_runs ORDER BY slot DESC LIMIT 1").first()]);
 return Response.json({basic,advanced,players,run,schedule:"Sunday 12:00 PM America/Chicago"},{headers:{"cache-control":"public, max-age=300"}});
}
