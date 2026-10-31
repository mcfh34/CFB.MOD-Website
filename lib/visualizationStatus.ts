/** Result freshness from stored games, independent of upstream API availability. */
export async function visualizationStatus(db:D1Database,season:number){
 const row=await db.prepare(`SELECT MAX(CASE WHEN completed=1 THEN week END) AS latestCompletedWeek,
   SUM(CASE WHEN completed=0 AND start_date IS NOT NULL AND datetime(start_date)<datetime('now','-8 hours') THEN 1 ELSE 0 END) AS pendingFinals
   FROM cfb_games WHERE season=? AND COALESCE(season_type,'regular')='regular'`).bind(season).first<{latestCompletedWeek:number|null;pendingFinals:number}>();
 return {latestCompletedWeek:row?.latestCompletedWeek??null,pendingFinals:row?.pendingFinals??0};
}
