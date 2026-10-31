/** Game-week policy: snapshots through Week 3 forecast Week 4. */
export function usesPreseasonPriors(season: number, gameWeek: number) {
  return season !== 2026 || gameWeek < 4;
}
