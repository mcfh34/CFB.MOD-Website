export type TeamWeekProfile = {
  team: string;
  week: number;
};

/**
 * Builds a complete point-in-time field from sparse weekly profile updates.
 *
 * Early-season refreshes only write a new row for teams that have played. A
 * team without a row in the newest week must therefore carry its most recent
 * profile forward (normally its Week 0 preseason transition), not disappear
 * from Rankings, Season Sim, or a pregame ranking snapshot.
 */
export function latestTeamProfilesAtOrBeforeWeek<T extends TeamWeekProfile>(
  rows: readonly T[],
  requestedWeek: number,
): T[] {
  const cutoff = Number.isFinite(requestedWeek) ? requestedWeek : 0;
  const latest = new Map<string, T>();

  for (const row of rows) {
    const week = Number(row.week);
    const team = String(row.team ?? "").trim();
    if (!team || !Number.isFinite(week) || week > cutoff) continue;
    const current = latest.get(team);
    if (!current || week > Number(current.week)) latest.set(team, row);
  }

  return [...latest.values()].sort((left, right) => left.team.localeCompare(right.team));
}
