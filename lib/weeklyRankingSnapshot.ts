/**
 * A Week N poll is the ranking available before Week N begins. Week N results
 * first affect the Week N+1 poll. A zero score-week means the all-games view,
 * which uses the latest available season snapshot requested by the caller.
 */
export function scoreRankingSnapshotWeek(scoreWeek:number,latestSnapshotWeek=16){
  const normalizedWeek=Math.max(0,Math.trunc(Number.isFinite(scoreWeek)?scoreWeek:0));
  return normalizedWeek>0?normalizedWeek-1:Math.max(0,Math.trunc(latestSnapshotWeek));
}

/**
 * Rankings and Season Sim treat the selected value as the week about to be
 * played. Their evidence cutoff is therefore the end of the prior week. Week
 * zero is the preseason state and has no earlier in-season snapshot.
 */
export function enteringWeekSnapshotWeek(enteringWeek:number){
  const normalizedWeek=Math.max(0,Math.trunc(Number.isFinite(enteringWeek)?enteringWeek:0));
  return Math.max(0,normalizedWeek-1);
}

export function rankingAppliesToWeek(snapshotWeek:number){
  return Math.max(1,Math.trunc(snapshotWeek)+1);
}
