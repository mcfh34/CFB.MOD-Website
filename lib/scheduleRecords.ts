export type ScheduleRecordGame = {
  gameId: string;
  week: number;
  startDate?: string | null;
  seasonType?: string;
  completed: boolean | number;
  homeTeam: string;
  homePoints: number | null;
  awayTeam: string;
  awayPoints: number | null;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
  homeWinProbability?: number | null;
};

export type ScheduleRecordSnapshot = {
  homeRecordAfter: string | null;
  awayRecordAfter: string | null;
  recordStatus: "actual" | "projected" | "unavailable";
};

type MutableRecord = { wins: number; losses: number; ties: number };

function recordFor(records: Map<string, MutableRecord>, team: string) {
  const existing = records.get(team);
  if (existing) return existing;
  const created = { wins: 0, losses: 0, ties: 0 };
  records.set(team, created);
  return created;
}

function applyResult(
  records: Map<string, MutableRecord>,
  homeTeam: string,
  awayTeam: string,
  homeWon: boolean | null,
) {
  const home = recordFor(records, homeTeam);
  const away = recordFor(records, awayTeam);
  if (homeWon === null) {
    home.ties += 1;
    away.ties += 1;
  } else if (homeWon) {
    home.wins += 1;
    away.losses += 1;
  } else {
    home.losses += 1;
    away.wins += 1;
  }
}

function outcome(homeScore: number, awayScore: number, homeWinProbability?: number | null) {
  if (homeScore > awayScore) return true;
  if (homeScore < awayScore) return false;
  if (typeof homeWinProbability === "number" && Number.isFinite(homeWinProbability)) return homeWinProbability >= 0.5;
  return null;
}

function formatRecord(record: MutableRecord | undefined) {
  if (!record) return "0–0";
  return record.ties ? `${record.wins}–${record.losses}–${record.ties}` : `${record.wins}–${record.losses}`;
}

function gameOrder(left: ScheduleRecordGame, right: ScheduleRecordGame) {
  const leftDate = String(left.startDate ?? "9999");
  const rightDate = String(right.startDate ?? "9999");
  return leftDate.localeCompare(rightDate)
    || Number(left.seasonType === "postseason") - Number(right.seasonType === "postseason")
    || left.week - right.week
    || left.gameId.localeCompare(right.gameId);
}

/**
 * Completed games receive the actual record immediately after the final.
 * Upcoming games receive the projected record after applying every earlier
 * actual result and every earlier Matchup Engine projection in date order.
 */
export function buildScheduleRecordTimeline(
  games: ScheduleRecordGame[],
  eligibleTeams?: ReadonlySet<string>,
) {
  const actualRecords = new Map<string, MutableRecord>();
  const projectedRecords = new Map<string, MutableRecord>();
  const projectedComplete = new Map<string, boolean>();
  const snapshots = new Map<string, ScheduleRecordSnapshot>();
  const eligible = (team: string) => !eligibleTeams || eligibleTeams.has(team);
  const complete = (team: string) => projectedComplete.get(team) !== false;

  for (const game of [...games].sort(gameOrder)) {
    const completed = Boolean(game.completed)
      && game.homePoints !== null
      && game.awayPoints !== null;
    if (completed) {
      const homeWon = outcome(Number(game.homePoints), Number(game.awayPoints));
      applyResult(actualRecords, game.homeTeam, game.awayTeam, homeWon);
      applyResult(projectedRecords, game.homeTeam, game.awayTeam, homeWon);
      snapshots.set(game.gameId, {
        homeRecordAfter: eligible(game.homeTeam) ? formatRecord(actualRecords.get(game.homeTeam)) : null,
        awayRecordAfter: eligible(game.awayTeam) ? formatRecord(actualRecords.get(game.awayTeam)) : null,
        recordStatus: "actual",
      });
      continue;
    }

    const hasProjection = typeof game.predictedHomeScore === "number"
      && Number.isFinite(game.predictedHomeScore)
      && typeof game.predictedAwayScore === "number"
      && Number.isFinite(game.predictedAwayScore);
    if (!hasProjection) {
      projectedComplete.set(game.homeTeam, false);
      projectedComplete.set(game.awayTeam, false);
      snapshots.set(game.gameId, {
        homeRecordAfter: null,
        awayRecordAfter: null,
        recordStatus: "unavailable",
      });
      continue;
    }

    const homeWon = outcome(
      Number(game.predictedHomeScore),
      Number(game.predictedAwayScore),
      game.homeWinProbability,
    );
    applyResult(projectedRecords, game.homeTeam, game.awayTeam, homeWon);
    snapshots.set(game.gameId, {
      homeRecordAfter: eligible(game.homeTeam) && complete(game.homeTeam) ? formatRecord(projectedRecords.get(game.homeTeam)) : null,
      awayRecordAfter: eligible(game.awayTeam) && complete(game.awayTeam) ? formatRecord(projectedRecords.get(game.awayTeam)) : null,
      recordStatus: complete(game.homeTeam) && complete(game.awayTeam) ? "projected" : "unavailable",
    });
  }

  return snapshots;
}
