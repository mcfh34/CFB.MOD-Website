import { baselines, modelCalibration, scoreCoefficients } from "../app/modelData";
import { buildBcsRankings, type BcsRankingRow, type RankingGame, type RankingProfile } from "./rankings";

export type SimulationScheduleGame = {
  gameId: string;
  week: number;
  startDate: string | null;
  seasonType: string;
  completed: boolean | number;
  neutralSite: boolean | number;
  conferenceGame: boolean | number;
  homeTeam: string;
  homeConference: string | null;
  homePoints: number | null;
  awayTeam: string;
  awayConference: string | null;
  awayPoints: number | null;
};

export type SimulatedRankingRow = BcsRankingRow & {
  expectedWins: number;
  projectedWins: number;
  projectedLosses: number;
  projectedRecord: string;
  projectedWinsOver: string[];
  projectedLossesTo: string[];
  conferenceChampion: boolean;
  playoffSeed: number | null;
};

export type ConferenceProjection = {
  conference: string;
  firstTeam: string;
  secondTeam: string;
  winner: string;
  firstScore: number;
  secondScore: number;
  winnerProbability: number;
};

export type BracketProjection = {
  id: string;
  round: "First Round" | "Quarterfinal" | "Semifinal" | "Championship";
  slot: number;
  firstTeam: string;
  secondTeam: string;
  firstSeed: number;
  secondSeed: number;
  firstScore: number;
  secondScore: number;
  winner: string;
  winnerSeed: number;
  winnerProbability: number;
  campusGame: boolean;
};

export type SeasonSimulation = {
  season: number;
  requestedWeek: number;
  effectiveWeek: number;
  fieldMode: "actual-field" | "projected-field";
  format: 4 | 12;
  methodology: string;
  champion: string | null;
  championshipProbability: number | null;
  rankings: SimulatedRankingRow[];
  conferenceChampionships: ConferenceProjection[];
  bracket: BracketProjection[];
};

const historicalFields: Record<number, Array<{ seed: number; team: string }>> = {
  2021: [{ seed: 1, team: "Alabama" }, { seed: 2, team: "Michigan" }, { seed: 3, team: "Georgia" }, { seed: 4, team: "Cincinnati" }],
  2022: [{ seed: 1, team: "Georgia" }, { seed: 2, team: "Michigan" }, { seed: 3, team: "TCU" }, { seed: 4, team: "Ohio State" }],
  2023: [{ seed: 1, team: "Michigan" }, { seed: 2, team: "Washington" }, { seed: 3, team: "Texas" }, { seed: 4, team: "Alabama" }],
  2024: [{ seed: 1, team: "Oregon" }, { seed: 2, team: "Georgia" }, { seed: 3, team: "Boise State" }, { seed: 4, team: "Arizona State" }, { seed: 5, team: "Texas" }, { seed: 6, team: "Penn State" }, { seed: 7, team: "Notre Dame" }, { seed: 8, team: "Ohio State" }, { seed: 9, team: "Tennessee" }, { seed: 10, team: "Indiana" }, { seed: 11, team: "SMU" }, { seed: 12, team: "Clemson" }],
  2025: [{ seed: 1, team: "Indiana" }, { seed: 2, team: "Ohio State" }, { seed: 3, team: "Georgia" }, { seed: 4, team: "Texas Tech" }, { seed: 5, team: "Oregon" }, { seed: 6, team: "Ole Miss" }, { seed: 7, team: "Texas A&M" }, { seed: 8, team: "Oklahoma" }, { seed: 9, team: "Alabama" }, { seed: 10, team: "Miami" }, { seed: 11, team: "Tulane" }, { seed: 12, team: "James Madison" }],
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

function profileScore(ypc: number, ypp: number, ypa: number, ratt: number, patt: number) {
  return Math.max(0, scoreCoefficients.intercept + scoreCoefficients.ypc * ypc + scoreCoefficients.ypp * ypp + scoreCoefficients.ypa * ypa + scoreCoefficients.ratt * ratt + scoreCoefficients.patt * patt);
}

function matchup(first: RankingProfile | undefined, second: RankingProfile | undefined, firstRank: BcsRankingRow | undefined, secondRank: BcsRankingRow | undefined, firstAtHome: boolean) {
  const neutral = !firstAtHome;
  const fallback = { offYppIndex: 1, offYpaIndex: 1, offYpcIndex: 1, defYppIndex: 1, defYpaIndex: 1, defYpcIndex: 1 };
  const a = first ?? fallback;
  const b = second ?? fallback;
  const side = (offense: RankingProfile | typeof fallback, defense: RankingProfile | typeof fallback) => {
    const ypa = baselines.ypa * Number(offense.offYpaIndex) * Number(defense.defYpaIndex);
    const ypc = baselines.ypc * Number(offense.offYpcIndex) * Number(defense.defYpcIndex);
    const patt = baselines.patt;
    const ratt = baselines.ratt;
    const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
    return profileScore(ypc, ypp, ypa, ratt, patt);
  };
  const homeEdge = neutral ? 0 : modelCalibration.homeFieldAdvantage;
  const statisticalFirst = side(a, b) + homeEdge / 2;
  const statisticalSecond = side(b, a) - homeEdge / 2;
  const statisticalMargin = statisticalFirst - statisticalSecond;
  const resumeMargin = clamp(((firstRank?.bcsScore ?? 0.5) - (secondRank?.bcsScore ?? 0.5)) * 30 + homeEdge, -24, 24);
  const margin = 0.65 * statisticalMargin + 0.35 * resumeMargin;
  const total = statisticalFirst + statisticalSecond;
  let firstScore = Math.max(3, Math.round(total / 2 + margin / 2));
  let secondScore = Math.max(3, Math.round(total / 2 - margin / 2));
  if (firstScore === secondScore) {
    if (margin >= 0) firstScore += 1;
    else secondScore += 1;
  }
  const firstWinProbability = normalCdf(margin / 13.8);
  return { firstScore, secondScore, margin, firstWinProbability };
}

function rankingGame(game: SimulationScheduleGame, firstScore: number, secondScore: number): RankingGame {
  return {
    gameId: game.gameId,
    week: game.week,
    startDate: game.startDate,
    neutralSite: game.neutralSite,
    homeTeam: game.homeTeam,
    homePoints: firstScore,
    awayTeam: game.awayTeam,
    awayPoints: secondScore,
  };
}

function simulateBracket(field: Array<{ seed: number; team: string }>, profiles: Map<string, RankingProfile>, rankings: Map<string, BcsRankingRow>, format: 4 | 12) {
  const games: BracketProjection[] = [];
  const bySeed = new Map(field.map((entry) => [entry.seed, entry]));
  const play = (round: BracketProjection["round"], slot: number, first: { seed: number; team: string }, second: { seed: number; team: string }, campusGame = false) => {
    const projection = matchup(profiles.get(first.team), profiles.get(second.team), rankings.get(first.team), rankings.get(second.team), campusGame);
    const firstWins = projection.margin >= 0;
    const winner = firstWins ? first : second;
    const game: BracketProjection = {
      id: `${round}-${slot}`,
      round,
      slot,
      firstTeam: first.team,
      secondTeam: second.team,
      firstSeed: first.seed,
      secondSeed: second.seed,
      firstScore: projection.firstScore,
      secondScore: projection.secondScore,
      winner: winner.team,
      winnerSeed: winner.seed,
      winnerProbability: firstWins ? projection.firstWinProbability : 1 - projection.firstWinProbability,
      campusGame,
    };
    games.push(game);
    return winner;
  };

  if (format === 4) {
    const semifinalOne = play("Semifinal", 1, bySeed.get(1)!, bySeed.get(4)!);
    const semifinalTwo = play("Semifinal", 2, bySeed.get(2)!, bySeed.get(3)!);
    const champion = play("Championship", 1, semifinalOne, semifinalTwo);
    return { games, champion };
  }

  const roundOne = new Map<number, { seed: number; team: string }>();
  roundOne.set(1, play("First Round", 1, bySeed.get(5)!, bySeed.get(12)!, true));
  roundOne.set(2, play("First Round", 2, bySeed.get(6)!, bySeed.get(11)!, true));
  roundOne.set(3, play("First Round", 3, bySeed.get(7)!, bySeed.get(10)!, true));
  roundOne.set(4, play("First Round", 4, bySeed.get(8)!, bySeed.get(9)!, true));
  const quarterfinalOne = play("Quarterfinal", 1, bySeed.get(1)!, roundOne.get(4)!);
  const quarterfinalTwo = play("Quarterfinal", 2, bySeed.get(4)!, roundOne.get(1)!);
  const quarterfinalThree = play("Quarterfinal", 3, bySeed.get(2)!, roundOne.get(3)!);
  const quarterfinalFour = play("Quarterfinal", 4, bySeed.get(3)!, roundOne.get(2)!);
  const semifinalOne = play("Semifinal", 1, quarterfinalOne, quarterfinalTwo);
  const semifinalTwo = play("Semifinal", 2, quarterfinalThree, quarterfinalFour);
  const champion = play("Championship", 1, semifinalOne, semifinalTwo);
  return { games, champion };
}

export function buildSeasonSimulation(season: number, requestedWeek: number, effectiveWeek: number, schedule: SimulationScheduleGame[], profiles: RankingProfile[]): SeasonSimulation {
  const profileMap = new Map(profiles.map((profile) => [profile.team, profile]));
  const completedThroughWeek = schedule.filter((game) => game.seasonType !== "postseason" && game.week <= requestedWeek && Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null)
    .map((game) => rankingGame(game, Number(game.homePoints), Number(game.awayPoints)));
  const currentRankings = buildBcsRankings(completedThroughWeek, profiles);
  const currentRankingMap = new Map(currentRankings.map((row) => [row.team, row]));
  const projectedGames: RankingGame[] = [];
  const teamRecords = new Map(profiles.map((profile) => [profile.team, { wins: 0, losses: 0, expectedWins: 0, conferenceWins: 0, conferenceLosses: 0, winsOver: [] as string[], lossesTo: [] as string[] }]));
  const directWinners = new Map<string, string>();

  for (const game of schedule.filter((row) => row.seasonType !== "postseason" && row.week <= 14)) {
    const known = game.week <= requestedWeek && Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null;
    const projection = known
      ? { firstScore: Number(game.homePoints), secondScore: Number(game.awayPoints), margin: Number(game.homePoints) - Number(game.awayPoints), firstWinProbability: Number(game.homePoints) === Number(game.awayPoints) ? 0.5 : Number(game.homePoints) > Number(game.awayPoints) ? 1 : 0 }
      : matchup(profileMap.get(game.homeTeam), profileMap.get(game.awayTeam), currentRankingMap.get(game.homeTeam), currentRankingMap.get(game.awayTeam), !Boolean(game.neutralSite));
    projectedGames.push(rankingGame(game, projection.firstScore, projection.secondScore));
    const homeWins = projection.firstScore > projection.secondScore;
    const winner = homeWins ? game.homeTeam : game.awayTeam;
    directWinners.set(`${game.homeTeam}\u0000${game.awayTeam}`, winner);
    const homeRecord = teamRecords.get(game.homeTeam);
    const awayRecord = teamRecords.get(game.awayTeam);
    if (homeRecord) {
      homeRecord.expectedWins += projection.firstWinProbability;
      if (homeWins) { homeRecord.wins += 1; homeRecord.winsOver.push(game.awayTeam); }
      else { homeRecord.losses += 1; homeRecord.lossesTo.push(game.awayTeam); }
      if (game.conferenceGame && game.homeConference && game.homeConference === game.awayConference) {
        if (homeWins) homeRecord.conferenceWins += 1;
        else homeRecord.conferenceLosses += 1;
      }
    }
    if (awayRecord) {
      awayRecord.expectedWins += 1 - projection.firstWinProbability;
      if (homeWins) { awayRecord.losses += 1; awayRecord.lossesTo.push(game.homeTeam); }
      else { awayRecord.wins += 1; awayRecord.winsOver.push(game.homeTeam); }
      if (game.conferenceGame && game.homeConference && game.homeConference === game.awayConference) {
        if (homeWins) awayRecord.conferenceLosses += 1;
        else awayRecord.conferenceWins += 1;
      }
    }
  }

  const preliminaryRankings = buildBcsRankings(projectedGames, profiles);
  const preliminaryMap = new Map(preliminaryRankings.map((row) => [row.team, row]));
  const conferences = new Map<string, RankingProfile[]>();
  for (const profile of profiles) {
    const conference = profile.conference?.trim();
    if (!conference || /independent/i.test(conference)) continue;
    const rows = conferences.get(conference) ?? [];
    rows.push(profile);
    conferences.set(conference, rows);
  }

  const conferenceChampionships: ConferenceProjection[] = [];
  const championshipGames: RankingGame[] = [];
  for (const [conference, conferenceTeams] of [...conferences].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (conferenceTeams.length < 2) continue;
    const ordered = [...conferenceTeams].sort((a, b) => {
      const ar = teamRecords.get(a.team) ?? { wins: 0, losses: 0, expectedWins: 0, conferenceWins: 0, conferenceLosses: 0, winsOver: [], lossesTo: [] };
      const br = teamRecords.get(b.team) ?? { wins: 0, losses: 0, expectedWins: 0, conferenceWins: 0, conferenceLosses: 0, winsOver: [], lossesTo: [] };
      const aPct = ar.conferenceWins / Math.max(1, ar.conferenceWins + ar.conferenceLosses);
      const bPct = br.conferenceWins / Math.max(1, br.conferenceWins + br.conferenceLosses);
      if (Math.abs(aPct - bPct) > 1e-9) return bPct - aPct;
      const direct = directWinners.get(`${a.team}\u0000${b.team}`) ?? directWinners.get(`${b.team}\u0000${a.team}`);
      if (direct === a.team) return -1;
      if (direct === b.team) return 1;
      return br.expectedWins - ar.expectedWins || (preliminaryMap.get(a.team)?.rank ?? 999) - (preliminaryMap.get(b.team)?.rank ?? 999);
    });
    const first = ordered[0];
    const second = ordered[1];
    const projection = matchup(first, second, preliminaryMap.get(first.team), preliminaryMap.get(second.team), false);
    const firstWins = projection.margin >= 0;
    const winner = firstWins ? first.team : second.team;
    const firstRecord = teamRecords.get(first.team);
    const secondRecord = teamRecords.get(second.team);
    if (firstRecord) {
      firstRecord.expectedWins += projection.firstWinProbability;
      if (firstWins) { firstRecord.wins += 1; firstRecord.winsOver.push(second.team); }
      else { firstRecord.losses += 1; firstRecord.lossesTo.push(second.team); }
    }
    if (secondRecord) {
      secondRecord.expectedWins += 1 - projection.firstWinProbability;
      if (firstWins) { secondRecord.losses += 1; secondRecord.lossesTo.push(first.team); }
      else { secondRecord.wins += 1; secondRecord.winsOver.push(first.team); }
    }
    conferenceChampionships.push({ conference, firstTeam: first.team, secondTeam: second.team, winner, firstScore: projection.firstScore, secondScore: projection.secondScore, winnerProbability: firstWins ? projection.firstWinProbability : 1 - projection.firstWinProbability });
    championshipGames.push({ gameId: `sim-${season}-${conference}`, week: 15, startDate: null, neutralSite: true, homeTeam: first.team, homePoints: projection.firstScore, awayTeam: second.team, awayPoints: projection.secondScore });
  }

  const finalRankings = buildBcsRankings([...projectedGames, ...championshipGames], profiles);
  const finalRankingMap = new Map(finalRankings.map((row) => [row.team, row]));
  const championSet = new Set(conferenceChampionships.map((row) => row.winner));
  const historicalField = historicalFields[season];
  const format: 4 | 12 = season <= 2023 ? 4 : 12;
  let field: Array<{ seed: number; team: string }>;
  let fieldMode: SeasonSimulation["fieldMode"];
  if (historicalField) {
    field = historicalField;
    fieldMode = "actual-field";
  } else {
    const rankedChampions = finalRankings.filter((row) => championSet.has(row.team)).slice(0, 5);
    const selected = new Set(rankedChampions.map((row) => row.team));
    const atLarge = finalRankings.filter((row) => !selected.has(row.team)).slice(0, 12 - rankedChampions.length);
    field = [...rankedChampions, ...atLarge].sort((a, b) => a.rank - b.rank).map((row, index) => ({ seed: index + 1, team: row.team }));
    fieldMode = "projected-field";
  }

  const validField = field.filter((entry) => profileMap.has(entry.team));
  const bracket = validField.length === format ? simulateBracket(validField, profileMap, finalRankingMap, format) : { games: [] as BracketProjection[], champion: null };
  const seedMap = new Map(field.map((entry) => [entry.team, entry.seed]));
  const rankings: SimulatedRankingRow[] = finalRankings.map((row) => {
    const record = teamRecords.get(row.team) ?? { wins: row.wins, losses: row.losses, expectedWins: row.wins, conferenceWins: 0, conferenceLosses: 0, winsOver: [], lossesTo: [] };
    const opponentRank = (team: string) => finalRankingMap.get(team)?.rank ?? 999;
    const biggestWins = [...new Set(record.winsOver)].sort((a, b) => opponentRank(a) - opponentRank(b) || a.localeCompare(b)).slice(0, 3);
    const worstLosses = [...new Set(record.lossesTo)].sort((a, b) => opponentRank(b) - opponentRank(a) || a.localeCompare(b)).slice(0, 3);
    return { ...row, expectedWins: record.expectedWins, projectedWins: record.wins, projectedLosses: record.losses, projectedRecord: `${record.wins}–${record.losses}`, projectedWinsOver: biggestWins, projectedLossesTo: worstLosses, conferenceChampion: championSet.has(row.team), playoffSeed: seedMap.get(row.team) ?? null };
  });
  const championshipGame = bracket.games.at(-1);
  return {
    season,
    requestedWeek,
    effectiveWeek,
    fieldMode,
    format,
    methodology: "Deterministic schedule simulation from the selected weekly profile; historical fields preserve actual teams and seeds while every displayed bracket result is re-simulated.",
    champion: bracket.champion?.team ?? null,
    championshipProbability: championshipGame?.winnerProbability ?? null,
    rankings,
    conferenceChampionships,
    bracket: bracket.games,
  };
}
