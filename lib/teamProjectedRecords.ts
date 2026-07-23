export type TeamProjectionScheduleRow = {
  gameId:string;
  homeTeam:string;
  awayTeam:string;
  homeWinProbability:number|null;
  predictedHomeScore:number|null;
  predictedAwayScore:number|null;
};

export type TeamProjectedGame = {
  gameId:string;
  projectedResult:"W"|"L"|"T"|"—";
  projectedWins:number;
  projectedLosses:number;
  projectedTies:number;
  projectedRecord:string;
  expectedWins:number;
  expectedLosses:number;
};

export type TeamProjectedSeason = {
  games:TeamProjectedGame[];
  byGame:Map<string, TeamProjectedGame>;
  finalProjectedRecord:string;
  expectedWins:number;
  expectedLosses:number;
};

function clampProbability(value:number) {
  return Math.max(0, Math.min(1, value));
}

function formatRecord(wins:number, losses:number, ties:number) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function resolveHomeWinProbability(row:TeamProjectionScheduleRow) {
  if (row.homeWinProbability !== null && Number.isFinite(row.homeWinProbability)) {
    return clampProbability(row.homeWinProbability);
  }
  if (row.predictedHomeScore === null || row.predictedAwayScore === null) return null;
  if (row.predictedHomeScore > row.predictedAwayScore) return 1;
  if (row.predictedHomeScore < row.predictedAwayScore) return 0;
  return .5;
}

export function buildTeamProjectedSeason(
  rows:readonly TeamProjectionScheduleRow[],
  team:string,
):TeamProjectedSeason {
  let projectedWins = 0;
  let projectedLosses = 0;
  let projectedTies = 0;
  let expectedWins = 0;
  let expectedLosses = 0;
  const games:TeamProjectedGame[] = [];

  if (!team) {
    return { games, byGame:new Map(), finalProjectedRecord:"0-0", expectedWins, expectedLosses };
  }

  for (const row of rows) {
    const isHome = row.homeTeam === team;
    const isAway = row.awayTeam === team;
    if (!isHome && !isAway) continue;

    const homeWinProbability = resolveHomeWinProbability(row);
    let projectedResult:TeamProjectedGame["projectedResult"] = "—";

    if (homeWinProbability !== null) {
      const teamWinProbability = isHome ? homeWinProbability : 1 - homeWinProbability;
      expectedWins += teamWinProbability;
      expectedLosses += 1 - teamWinProbability;

      if (teamWinProbability > .5) {
        projectedWins += 1;
        projectedResult = "W";
      } else if (teamWinProbability < .5) {
        projectedLosses += 1;
        projectedResult = "L";
      } else {
        projectedTies += 1;
        projectedResult = "T";
      }
    }

    games.push({
      gameId:row.gameId,
      projectedResult,
      projectedWins,
      projectedLosses,
      projectedTies,
      projectedRecord:formatRecord(projectedWins, projectedLosses, projectedTies),
      expectedWins,
      expectedLosses,
    });
  }

  return {
    games,
    byGame:new Map(games.map((game) => [game.gameId, game])),
    finalProjectedRecord:formatRecord(projectedWins, projectedLosses, projectedTies),
    expectedWins,
    expectedLosses,
  };
}
