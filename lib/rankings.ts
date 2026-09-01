import { buildMatchupEvidence, type MatchupEvidence } from "./matchupModel";
import type { AdvancedMetricKey, AdvancedProfile } from "./advancedMetrics";

export type RankingGame = {
  gameId: string;
  week: number;
  startDate: string | null;
  neutralSite: boolean | number;
  conferenceGame?: boolean | number;
  homeConference?: string | null;
  awayConference?: string | null;
  homeTeam: string;
  homePoints: number;
  awayTeam: string;
  awayPoints: number;
  seasonType?: string;
  conferenceChampionship?: boolean;
};

export type RankingProfile = {
  team: string;
  teamId?: string | null;
  abbreviation?: string | null;
  mascot?: string | null;
  conference?: string | null;
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
  preseasonElo?: number | null;
  offYppIndex: number;
  offYpaIndex: number;
  offYpcIndex: number;
  offPattIndex?: number;
  offRattIndex?: number;
  defYppIndex: number;
  defYpaIndex: number;
  defYpcIndex: number;
  defPattIndex?: number;
  defRattIndex?: number;
  advanced?: AdvancedProfile | null;
};

export type BcsRankingRow = {
  rank: number;
  team: string;
  teamId?: string | null;
  abbreviation?: string | null;
  mascot?: string | null;
  conference?: string | null;
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
  wins: number;
  losses: number;
  ties: number;
  record: string;
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  conferenceRecord: string;
  bcsScore: number;
  resultsScore: number;
  scheduleScore: number;
  computerScore: number;
  sorRank: number;
  sosRank: number;
  powerRank: number;
  eloRank: number;
  colleyRank: number;
  headToHeadRank: number;
  eloRating: number;
  scheduleStrength: number;
  bestOpponentStrength: number;
  qualityWinStrength: number;
  matchupReliability: number;
  bestWins: string[];
  lossesTo: string[];
};

type TeamRecord = { wins: number; losses: number; ties: number; games: number };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const positionMetricKeys: AdvancedMetricKey[] = ["lineYards","stuffRate","powerSuccess","secondLevelYards","rushingSuccessRate","completionRate","yardsPerCompletion","passingSuccessRate","passingPpa","passingDownSuccessRate"];
const isConferenceChampionship = (game:RankingGame) => Boolean(game.conferenceChampionship)
  || game.seasonType==="conference-championship"
  || (game.week>=15&&game.seasonType!=="postseason"&&Boolean(game.conferenceGame)&&Boolean(game.homeConference&&game.homeConference===game.awayConference));

function advancedPositionPower(profile: AdvancedProfile | null | undefined) {
  if (!profile) return null;
  const values = (side: "offense" | "defense") => positionMetricKeys.map((key) => profile[side].index[key]).filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const offense = values("offense");
  const defense = values("defense");
  if (offense.length < 4 || defense.length < 4) return null;
  const geometric = (rows: number[]) => Math.exp(rows.reduce((sum, value) => sum + Math.log(value), 0) / rows.length);
  return Math.log(geometric(offense)) - Math.log(geometric(defense));
}

function rankingProfilePower(profile: RankingProfile) {
  const offense = average([Number(profile.offYppIndex), Number(profile.offYpaIndex), Number(profile.offYpcIndex)]);
  const defense = average([Number(profile.defYppIndex), Number(profile.defYpaIndex), Number(profile.defYpcIndex)]);
  const basePower = Math.log(Math.max(0.05, offense)) - Math.log(Math.max(0.05, defense));
  const positionPower = advancedPositionPower(profile.advanced);
  return positionPower === null ? basePower : 0.78 * basePower + 0.22 * positionPower;
}

function weightedTop(values: number[], weights: number[]) {
  const ordered = [...values].sort((a, b) => b - a).slice(0, weights.length);
  if (!ordered.length) return 0;
  const usedWeights = weights.slice(0, ordered.length);
  return ordered.reduce((sum, value, index) => sum + value * usedWeights[index], 0) / usedWeights.reduce((sum, value) => sum + value, 0);
}

function opponentRelativeControl(opponentStrength: number, adjustedMargin: number) {
  // A contender should beat a weak opponent comfortably, while a close result
  // against an elite opponent can still be strong evidence. The cap keeps
  // running up the score from becoming more valuable than winning the game.
  const expectedMargin = (0.5 - opponentStrength) * 28;
  return clamp(0.5 + (adjustedMargin - expectedMargin) / 42, 0, 1);
}

function percentiles(values: Map<string, number>) {
  const ordered = [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const denominator = Math.max(1, ordered.length - 1);
  const output = new Map<string, number>();
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && Math.abs(ordered[end + 1][1] - ordered[start][1]) < 1e-10) end += 1;
    const averagePosition = (start + end) / 2;
    const percentile = ordered.length === 1 ? 1 : 1 - averagePosition / denominator;
    for (let index = start; index <= end; index += 1) output.set(ordered[index][0], percentile);
    start = end + 1;
  }
  return output;
}

function ranks(values: Map<string, number>) {
  return new Map([...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([team], index) => [team, index + 1]));
}

function solveColley(games: RankingGame[], teams: string[]) {
  const index = new Map(teams.map((team, position) => [team, position]));
  const matrix: number[][] = Array.from({ length: teams.length }, (_, row) => Array.from({ length: teams.length }, (_, column) => row === column ? 2 : 0));
  const vector: number[] = Array.from({ length: teams.length }, () => 1);
  for (const game of games) {
    const home = index.get(game.homeTeam);
    const away = index.get(game.awayTeam);
    if (home === undefined || away === undefined) continue;
    const weight = isConferenceChampionship(game) ? 0.45 : 1;
    matrix[home][home] += weight;
    matrix[away][away] += weight;
    matrix[home][away] -= weight;
    matrix[away][home] -= weight;
    if (game.homePoints > game.awayPoints) { vector[home] += 0.5*weight; vector[away] -= 0.5*weight; }
    else if (game.awayPoints > game.homePoints) { vector[away] += 0.5*weight; vector[home] -= 0.5*weight; }
  }

  // Partial-pivot Gaussian elimination is deterministic and small enough for
  // the roughly 180 FBS/FCS teams present in a season schedule.
  for (let pivot = 0; pivot < teams.length; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < teams.length; row += 1) if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    [vector[pivot], vector[best]] = [vector[best], vector[pivot]];
    const divisor = Math.abs(matrix[pivot][pivot]) < 1e-10 ? 1e-10 : matrix[pivot][pivot];
    for (let column = pivot; column < teams.length; column += 1) matrix[pivot][column] /= divisor;
    vector[pivot] /= divisor;
    for (let row = pivot + 1; row < teams.length; row += 1) {
      const factor = matrix[row][pivot];
      if (Math.abs(factor) < 1e-12) continue;
      for (let column = pivot; column < teams.length; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
      vector[row] -= factor * vector[pivot];
    }
  }
  const solution = Array.from({ length: teams.length }, () => 0);
  for (let row = teams.length - 1; row >= 0; row -= 1) {
    solution[row] = vector[row] - matrix[row].slice(row + 1).reduce((sum, coefficient, offset) => sum + coefficient * solution[row + offset + 1], 0);
  }
  return new Map(teams.map((team, position) => [team, solution[position]]));
}

function buildElo(games: RankingGame[], teams: string[], initialRatings: Map<string, number> | null = null) {
  const ratings = new Map(teams.map((team) => [team, initialRatings?.get(team) ?? 1500]));
  const appearances = new Map(teams.map((team) => [team, 0]));
  const phase = (game: RankingGame) => game.seasonType === "postseason" ? 1 : 0;
  for (const game of [...games].sort((a, b) => phase(a) - phase(b) || a.week - b.week || String(a.startDate).localeCompare(String(b.startDate)) || a.gameId.localeCompare(b.gameId))) {
    const homeRating = ratings.get(game.homeTeam) ?? 1500;
    const awayRating = ratings.get(game.awayTeam) ?? 1500;
    const homeField = game.neutralSite ? 0 : 45;
    const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating - homeField) / 400));
    const actualHome = game.homePoints === game.awayPoints ? 0.5 : game.homePoints > game.awayPoints ? 1 : 0;
    const homeGames = appearances.get(game.homeTeam) ?? 0;
    const awayGames = appearances.get(game.awayTeam) ?? 0;
    const k = (Math.max(homeGames, awayGames) < 4 ? 28 : 20) * (isConferenceChampionship(game) ? 0.45 : 1);
    const margin = Math.abs(game.homePoints - game.awayPoints);
    const ratingGap = Math.abs(homeRating + homeField - awayRating);
    const marginMultiplier = clamp(Math.log(margin + 1) * (2.2 / (ratingGap * 0.001 + 2.2)), 1, 2.25);
    ratings.set(game.homeTeam, homeRating + k * marginMultiplier * (actualHome - expectedHome));
    ratings.set(game.awayTeam, awayRating + k * marginMultiplier * ((1 - actualHome) - (1 - expectedHome)));
    appearances.set(game.homeTeam, homeGames + 1);
    appearances.set(game.awayTeam, awayGames + 1);
  }
  return ratings;
}

/**
 * Keeps final snapshots on the same Elo scale used by weekly snapshots.
 *
 * The former cross-era transform multiplied every point above 1500 by 1.5.
 * Merely selecting "Final" could therefore make a team stronger even after
 * postseason losses. The small unbeaten-season credit is retained because it
 * distinguishes completed, unblemished title résumés without changing scales.
 */
const POSTSEASON_FORM_ELO_PER_POINT = 1.5;
const POSTSEASON_GAME_MARGIN_CAP = 28;

export function finalMatchupRating(
  ranking: Pick<BcsRankingRow, "eloRating" | "wins" | "losses" | "ties">,
  games: readonly RankingGame[] = [],
  team?: string,
) {
  const gamesPlayed = ranking.wins + ranking.losses + ranking.ties;
  const unbeatenCredit = ranking.losses === 0 && gamesPlayed >= 10 ? 25 : 0;
  // Weekly efficiency snapshots stop at championship week because CFBD bowl
  // week numbers restart. Carry the missing bowl/playoff form through a
  // conservative capped score-margin bridge so a damaging postseason cannot
  // make the final matchup version stronger merely by improving its SOS.
  const postseasonForm = team ? games
    .filter((game) => game.seasonType === "postseason" && (game.homeTeam === team || game.awayTeam === team))
    .reduce((sum, game) => {
      const margin = game.homeTeam === team
        ? game.homePoints - game.awayPoints
        : game.awayPoints - game.homePoints;
      return sum + clamp(margin, -POSTSEASON_GAME_MARGIN_CAP, POSTSEASON_GAME_MARGIN_CAP);
    }, 0) * POSTSEASON_FORM_ELO_PER_POINT : 0;
  return ranking.eloRating + unbeatenCredit + postseasonForm;
}

export function buildBcsRankings(
  games: RankingGame[],
  profiles: RankingProfile[],
  options: { usePreseasonElo?: boolean } = {},
): BcsRankingRow[] {
  const eligible = new Set(profiles.map((profile) => profile.team));
  const conferenceByTeam = new Map(profiles.map((profile) => [profile.team, profile.conference ?? null]));
  const allTeams = [...new Set([...eligible, ...games.flatMap((game) => [game.homeTeam, game.awayTeam])])].sort();
  if (!eligible.size) return [];

  const colley = solveColley(games, allTeams);
  // Results Rankings intentionally keep the 1500 default. Season Sim opts into
  // the calibrated preseason state, then updates that state with completed or
  // projected results so its rankings match Scores without changing the
  // separate results-only Rankings page.
  const initialElo = options.usePreseasonElo
    ? new Map(profiles.flatMap((profile) => Number.isFinite(profile.preseasonElo)
      ? [[profile.team, Number(profile.preseasonElo)] as const]
      : []))
    : null;
  const elo = buildElo(games, allTeams, initialElo);
  const allColleyPercentiles = percentiles(colley);
  const allEloPercentiles = percentiles(elo);
  const profilePower = new Map(profiles.map((profile) => [profile.team, rankingProfilePower(profile)]));
  const profilePowerPercentiles = percentiles(profilePower);
  const baseOpponentStrength = new Map(allTeams.map((team) => {
    const resultNetworkStrength = 0.6 * (allColleyPercentiles.get(team) ?? 0.5) + 0.4 * (allEloPercentiles.get(team) ?? 0.5);
    const onFieldPower = profilePowerPercentiles.get(team);
    // Closed schedules can make every team look average because the league
    // hands itself every win and loss. Opponent-adjusted on-field power gives
    // SOS the missing cross-network signal without using conference labels,
    // recruiting rankings, or brand reputation.
    return [team, onFieldPower === undefined ? resultNetworkStrength : 0.25 * resultNetworkStrength + 0.75 * onFieldPower] as const;
  }));
  const connectedOpponents = new Map(allTeams.map((team) => [team, [] as string[]]));
  for (const game of games) {
    connectedOpponents.get(game.homeTeam)?.push(game.awayTeam);
    connectedOpponents.get(game.awayTeam)?.push(game.homeTeam);
  }
  let opponentStrength = new Map(baseOpponentStrength);
  for (let iteration = 0; iteration < 7; iteration += 1) {
    opponentStrength = new Map(allTeams.map((team) => {
      const connectedStrengths = (connectedOpponents.get(team) ?? []).map((opponent) => opponentStrength.get(opponent) ?? 0.35);
      if (!connectedStrengths.length) return [team, baseOpponentStrength.get(team) ?? 0.35] as const;
      const networkStrength = 0.55 * average(connectedStrengths) + 0.45 * weightedTop(connectedStrengths, [0.55, 0.3, 0.15]);
      return [team, 0.52 * (baseOpponentStrength.get(team) ?? 0.35) + 0.48 * networkStrength] as const;
    }));
  }
  const records = new Map<string, TeamRecord>([...eligible].map((team) => [team, { wins: 0, losses: 0, ties: 0, games: 0 }]));
  const conferenceRecords = new Map<string, TeamRecord>([...eligible].map((team) => [team, { wins: 0, losses: 0, ties: 0, games: 0 }]));
  const teamGames = new Map<string, Array<{ game: RankingGame; opponent: string; home: boolean }>>([...eligible].map((team) => [team, []]));
  const directResults = new Map<string, number>();
  const titleParticipants = new Set<string>();
  const titleLosers = new Set<string>();
  const titleLossCounts = new Map<string,number>();

  for (const game of games) {
    const homeConference = game.homeConference ?? conferenceByTeam.get(game.homeTeam);
    const awayConference = game.awayConference ?? conferenceByTeam.get(game.awayTeam);
    const countsAsConferenceGame = !isConferenceChampionship(game) && (
      Boolean(game.conferenceGame)
      || Boolean(homeConference && awayConference && homeConference === awayConference)
    );
    if (isConferenceChampionship(game)) {
      titleParticipants.add(game.homeTeam); titleParticipants.add(game.awayTeam);
      if (game.homePoints!==game.awayPoints) {
        const loser=game.homePoints>game.awayPoints?game.awayTeam:game.homeTeam;
        titleLosers.add(loser);
        titleLossCounts.set(loser,(titleLossCounts.get(loser)??0)+1);
      }
    }
    for (const [team, opponent, home] of [[game.homeTeam, game.awayTeam, true], [game.awayTeam, game.homeTeam, false]] as const) {
      const record = records.get(team);
      if (!record) continue;
      record.games += 1;
      const points = home ? game.homePoints : game.awayPoints;
      const opponentPoints = home ? game.awayPoints : game.homePoints;
      if (points > opponentPoints) record.wins += 1;
      else if (points < opponentPoints) record.losses += 1;
      else record.ties += 1;
      if (countsAsConferenceGame) {
        const conferenceRecord = conferenceRecords.get(team);
        if (conferenceRecord) {
          conferenceRecord.games += 1;
          if (points > opponentPoints) conferenceRecord.wins += 1;
          else if (points < opponentPoints) conferenceRecord.losses += 1;
          else conferenceRecord.ties += 1;
        }
      }
      teamGames.get(team)?.push({ game, opponent, home });
    }
    if (game.homePoints !== game.awayPoints) {
      const winner = game.homePoints > game.awayPoints ? game.homeTeam : game.awayTeam;
      const loser = winner === game.homeTeam ? game.awayTeam : game.homeTeam;
      const resultWeight=isConferenceChampionship(game) ? .35 : 1;
      directResults.set(`${winner}\u0000${loser}`, (directResults.get(`${winner}\u0000${loser}`) ?? 0) + resultWeight);
    }
  }

  const resume = new Map<string, number>();
  const recordValue = new Map<string, number>();
  const sor = new Map<string, number>();
  const sos = new Map<string, number>();
  const quality = new Map<string, number>();
  const gameControl = new Map<string, number>();
  const testedCeiling = new Map<string, number>();
  const verifiedWins = new Map<string, number>();
  const badResults = new Map<string, number>();
  const headToHead = new Map<string, number>();
  const power = new Map(profilePower);
  const eligibleColley = new Map<string, number>();
  const eligibleElo = new Map<string, number>();
  const matchupEvidence = new Map<string, MatchupEvidence>();
  const bestWins = new Map<string, string[]>();
  const lossesTo = new Map<string, string[]>();

  for (const profile of profiles) {
    const record = records.get(profile.team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const details = teamGames.get(profile.team) ?? [];
    let expectedWins = 0;
    let headToHeadValue = 0;
    const winMerits: number[] = [];
    const winStrengths: number[] = [];
    const opponentEvidence: number[] = [];
    const controlValues: number[] = [];
    const badWinPenalties: number[] = [];
    const badLossPenalties: number[] = [];
    for (const detail of details) {
      const opponentRating = elo.get(detail.opponent) ?? 1500;
      const siteEdge = detail.game.neutralSite ? 0 : detail.home ? 45 : -45;
      // Strength of record asks how a fixed high-quality team would fare
      // against this schedule. Using the subject team's own rating made strong
      // teams paradoxically "expected" to win away their résumé credit.
      expectedWins += 1 / (1 + 10 ** ((opponentRating - 1600 - siteEdge) / 400));
      const points = detail.home ? detail.game.homePoints : detail.game.awayPoints;
      const opponentPoints = detail.home ? detail.game.awayPoints : detail.game.homePoints;
      // Remove most of the subject game's effect from the opponent rating.
      // Otherwise an undefeated team weakens every opponent by beating it and
      // paradoxically lowers its own SOS—the exact distortion seen in 2020.
      const directResultAdjustment = points > opponentPoints ? 0.04 : points < opponentPoints ? -0.04 : 0;
      const strength = clamp((opponentStrength.get(detail.opponent) ?? 0.35) + directResultAdjustment, 0, 1);
      const margin = points - opponentPoints;
      const adjustedMargin = margin + (detail.game.neutralSite ? 0 : detail.home ? -2.5 : 2.5);
      const control = opponentRelativeControl(strength, adjustedMargin);
      opponentEvidence.push(strength);
      const titleLossWeight = isConferenceChampionship(detail.game) && points < opponentPoints ? .28 : 1;
      controlValues.push(.5+(control-.5)*titleLossWeight);
      if (points > opponentPoints) {
        const siteBonus = detail.game.neutralSite ? 0.015 : detail.home ? 0 : 0.03;
        winMerits.push(clamp(0.85 * strength + 0.15 * control + siteBonus, 0, 1));
        winStrengths.push(strength);
        const expectedComfort = 7 + 16 * (1 - strength);
        badWinPenalties.push((1 - strength) * clamp((expectedComfort - adjustedMargin) / expectedComfort, 0, 1));
        headToHeadValue += 0.6 + 0.4 * strength;
      } else if (points < opponentPoints) {
        const severity = clamp((-adjustedMargin - 3) / 24, 0, 1);
        badLossPenalties.push((0.8 * (1 - strength) + 0.2 * severity) * titleLossWeight);
        headToHeadValue -= (1 - 0.4 * strength) * titleLossWeight;
      }
    }
    const gamesPlayed = Math.max(1, record.games);
    const maturity = clamp(record.games / 8, 0, 1);
    const winValue = record.wins + 0.5 * record.ties;
    // The extra title-week opportunity is treated as 28% of a normal loss in
    // résumé math. The public record remains untouched.
    const rankingWinValue=winValue+.72*(titleLossCounts.get(profile.team)??0);
    const winPercentage = rankingWinValue / gamesPlayed;
    const averageSchedule = average(opponentEvidence);
    const strongestOpponents = weightedTop(opponentEvidence, [0.55, 0.3, 0.15]);
    const scheduleDepth = weightedTop(opponentEvidence, [0.24, 0.2, 0.16, 0.13, 0.1, 0.07, 0.06, 0.04]);
    const scheduleVolume = clamp(record.games / 10, 0, 1);
    const schedule = (0.25 * averageSchedule + 0.45 * scheduleDepth + 0.3 * strongestOpponents) * (0.86 + 0.14 * scheduleVolume);
    const bestWinEvidence = weightedTop(winStrengths, [0.55, 0.3, 0.15]);
    matchupEvidence.set(profile.team, buildMatchupEvidence(opponentEvidence, winStrengths, record.games));
    const topWins = 0.5 + (weightedTop(winMerits, [0.55, 0.3, 0.15]) - 0.5) * maturity;
    const orderedControl = [...controlValues].sort((a, b) => a - b);
    const lowerControl = average(orderedControl.slice(0, Math.max(1, Math.ceil(orderedControl.length / 4))));
    const rawControl = controlValues.length ? 0.75 * average(controlValues) + 0.25 * lowerControl : 0.5;
    const controlScore = 0.5 + (rawControl - 0.5) * maturity;
    const badWinScore = weightedTop(badWinPenalties, [0.6, 0.25, 0.15]) * clamp(record.games / 4, 0, 1);
    const badLossScore = weightedTop(badLossPenalties, [0.65, 0.35]);
    const qualityScore = 0.82 * topWins + 0.1 * controlScore + 0.08 * strongestOpponents - 0.65 * badLossScore - 0.35 * badWinScore;
    const lossRate = record.losses / gamesPlayed;
    const recordScore = winPercentage - 0.1 * lossRate + 0.012 * maturity;
    sos.set(profile.team, record.games ? schedule : 0.5);
    quality.set(profile.team, qualityScore);
    gameControl.set(profile.team, controlScore);
    testedCeiling.set(profile.team, record.games ? strongestOpponents : 0.5);
    verifiedWins.set(profile.team, record.games ? bestWinEvidence : 0.5);
    badResults.set(profile.team, -(0.65 * badLossScore + 0.35 * badWinScore));
    headToHead.set(profile.team, record.games ? headToHeadValue / gamesPlayed : 0);
    sor.set(profile.team, record.games ? (rankingWinValue - expectedWins) / Math.sqrt(gamesPlayed) : 0);
    recordValue.set(profile.team, record.games ? recordScore : 0.5);
    // The résumé is intentionally not an average-SOS contest. The best wins,
    // opponent-relative dominance, and damaging results answer different
    // questions, while record remains the anchor.
    resume.set(profile.team, 0.57 * winPercentage + 0.25 * topWins + 0.15 * controlScore + 0.03 * strongestOpponents - 0.12 * badLossScore - 0.065 * badWinScore);
    const resultLabel = (detail: { game: RankingGame; opponent: string; home: boolean }) => {
      const points = detail.home ? detail.game.homePoints : detail.game.awayPoints;
      const opponentPoints = detail.home ? detail.game.awayPoints : detail.game.homePoints;
      const site = detail.game.neutralSite ? "vs" : detail.home ? "vs" : "@";
      return `${site} ${detail.opponent} ${points}–${opponentPoints}`;
    };
    bestWins.set(profile.team, details
      .filter((detail) => (detail.home ? detail.game.homePoints : detail.game.awayPoints) > (detail.home ? detail.game.awayPoints : detail.game.homePoints))
      .sort((a, b) => (opponentStrength.get(b.opponent) ?? 0) - (opponentStrength.get(a.opponent) ?? 0)
        || Math.abs((b.home ? b.game.homePoints : b.game.awayPoints) - (b.home ? b.game.awayPoints : b.game.homePoints)) - Math.abs((a.home ? a.game.homePoints : a.game.awayPoints) - (a.home ? a.game.awayPoints : a.game.homePoints)))
      .slice(0, 3).map(resultLabel));
    lossesTo.set(profile.team, details
      .filter((detail) => (detail.home ? detail.game.homePoints : detail.game.awayPoints) < (detail.home ? detail.game.awayPoints : detail.game.homePoints))
      .sort((a, b) => (opponentStrength.get(a.opponent) ?? 0) - (opponentStrength.get(b.opponent) ?? 0)
        || ((a.home ? a.game.homePoints : a.game.awayPoints) - (a.home ? a.game.awayPoints : a.game.homePoints)) - ((b.home ? b.game.homePoints : b.game.awayPoints) - (b.home ? b.game.awayPoints : b.game.homePoints)))
      .slice(0, 3).map(resultLabel));
    eligibleColley.set(profile.team, colley.get(profile.team) ?? 0.5);
    eligibleElo.set(profile.team, elo.get(profile.team) ?? 1500);
  }

  const resumePercentiles = percentiles(resume);
  const recordPercentiles = percentiles(recordValue);
  const sorPercentiles = percentiles(sor);
  const sosPercentiles = percentiles(sos);
  const qualityPercentiles = percentiles(quality);
  const verifiedWinPercentiles = percentiles(verifiedWins);
  const gameControlPercentiles = percentiles(gameControl);
  const badResultPercentiles = percentiles(badResults);
  const headToHeadPercentiles = percentiles(headToHead);
  const colleyPercentiles = percentiles(eligibleColley);
  const eloPercentiles = percentiles(eligibleElo);
  const powerPercentiles = percentiles(power);
  const testedPower = new Map<string, number>();
  const resultsScore = new Map<string, number>();
  const scheduleScore = new Map<string, number>();
  const computerScore = new Map<string, number>();
  const bcsScore = new Map<string, number>();

  for (const team of eligible) {
    const record = records.get(team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const maturity = clamp(record.games / 8, 0, 1);
    // Raw efficiency is only as trustworthy as the schedule network that has
    // tested it. Strong results remain fully available through the résumé; an
    // untested statistical profile is conservatively pulled toward average.
    const evidenceReliability = clamp(0.15 + 0.3 * maturity + 0.55 * (testedCeiling.get(team) ?? 0.5), 0.35, 1);
    testedPower.set(team, 0.5 + ((powerPercentiles.get(team) ?? 0.5) - 0.5) * evidenceReliability);
    const computerSignals = [resumePercentiles, sorPercentiles, headToHeadPercentiles, colleyPercentiles, eloPercentiles, testedPower, gameControlPercentiles]
      .map((component) => component.get(team) ?? 0.5).sort((a, b) => a - b);
    const computer = average(computerSignals.slice(1, -1));
    const results = 0.44 * (recordPercentiles.get(team) ?? 0) + 0.33 * (resumePercentiles.get(team) ?? 0) + 0.15 * (sorPercentiles.get(team) ?? 0) + 0.08 * (headToHeadPercentiles.get(team) ?? 0);
    const schedule = 0.3 * (sosPercentiles.get(team) ?? 0)
      + 0.35 * (qualityPercentiles.get(team) ?? 0)
      + 0.25 * (verifiedWinPercentiles.get(team) ?? 0)
      + 0.1 * (badResultPercentiles.get(team) ?? 0);
    const proofReliability = clamp(((testedCeiling.get(team) ?? 0.5) - 0.25) / 0.45, 0, 1);
    const recordProtection = clamp((record.games - 4) / 6, 0, 1) * (record.losses === 0 ? 0.04 * (0.15 + 0.85 * proofReliability) : record.losses === 1 ? 0.012 : 0);
    // An unbeaten record against a schedule with no proven win cannot receive
    // the same résumé credit as a team that has beaten top opponents. Cap the
    // deduction so a clean record still matters, while making quality wins the
    // separator between dominant teams from disconnected schedule networks.
    const unverifiedWinPenalty = clamp((record.games - 4) / 6, 0, 1)
      * clamp(0.7 - (verifiedWins.get(team) ?? 0.5), 0, 0.22)
      * 0.65;
    resultsScore.set(team, results);
    scheduleScore.set(team, schedule);
    computerScore.set(team, computer);
    const championshipQualificationCredit = titleParticipants.has(team) ? 0.012 : 0;
    const championshipLossProtection = titleLosers.has(team) ? 0.018 : 0;
    bcsScore.set(team, clamp(0.54 * results + 0.18 * schedule + 0.28 * computer + recordProtection + championshipQualificationCredit + championshipLossProtection - unverifiedWinPenalty, 0, 1));
  }

  const sorRanks = ranks(sor);
  const sosRanks = ranks(sos);
  const powerRanks = ranks(power);
  const eloRanks = ranks(eligibleElo);
  const colleyRanks = ranks(eligibleColley);
  const headToHeadRanks = ranks(headToHead);
  const profileByTeam = new Map(profiles.map((profile) => [profile.team, profile]));
  return [...eligible].sort((a, b) => {
    const scoreDifference = (bcsScore.get(b) ?? 0) - (bcsScore.get(a) ?? 0);
    const directEdge = (directResults.get(`${a}\u0000${b}`) ?? 0) - (directResults.get(`${b}\u0000${a}`) ?? 0);
    if (directEdge && Math.abs(scoreDifference) <= 0.04) return directEdge > 0 ? -1 : 1;
    const aRecord = records.get(a) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const bRecord = records.get(b) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const aEffectiveLosses=aRecord.losses-.72*(titleLossCounts.get(a)??0);
    const bEffectiveLosses=bRecord.losses-.72*(titleLossCounts.get(b)??0);
    if (Math.min(aRecord.games, bRecord.games) >= 6 && Math.abs(aEffectiveLosses - bEffectiveLosses) >= 2 && Math.abs(scoreDifference) < 0.075) {
      return aEffectiveLosses - bEffectiveLosses;
    }
    if (Math.abs(scoreDifference) > 0.004) return scoreDifference;
    return (resultsScore.get(b) ?? 0) - (resultsScore.get(a) ?? 0) || (computerScore.get(b) ?? 0) - (computerScore.get(a) ?? 0) || a.localeCompare(b);
  }).map((team, index) => {
    const profile = profileByTeam.get(team)!;
    const record = records.get(team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const conferenceRecord = conferenceRecords.get(team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    return {
      rank: index + 1, team, teamId: profile.teamId, abbreviation: profile.abbreviation, mascot: profile.mascot, conference: profile.conference,
      color: profile.color, altColor: profile.altColor, logo: profile.logo, wins: record.wins, losses: record.losses, ties: record.ties,
      record: `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}`,
      conferenceWins: conferenceRecord.wins, conferenceLosses: conferenceRecord.losses, conferenceTies: conferenceRecord.ties,
      conferenceRecord: `${conferenceRecord.wins}–${conferenceRecord.losses}${conferenceRecord.ties ? `–${conferenceRecord.ties}` : ""}`,
      bcsScore: bcsScore.get(team) ?? 0, resultsScore: resultsScore.get(team) ?? 0, scheduleScore: scheduleScore.get(team) ?? 0,
      computerScore: computerScore.get(team) ?? 0, sorRank: sorRanks.get(team) ?? eligible.size, sosRank: sosRanks.get(team) ?? eligible.size,
      powerRank: powerRanks.get(team) ?? eligible.size, eloRank: eloRanks.get(team) ?? eligible.size, colleyRank: colleyRanks.get(team) ?? eligible.size,
      headToHeadRank: headToHeadRanks.get(team) ?? eligible.size,
      eloRating: eligibleElo.get(team) ?? 1500,
      scheduleStrength: matchupEvidence.get(team)?.scheduleStrength ?? 0.5,
      bestOpponentStrength: matchupEvidence.get(team)?.bestOpponentStrength ?? 0.5,
      qualityWinStrength: matchupEvidence.get(team)?.qualityWinStrength ?? 0.35,
      matchupReliability: matchupEvidence.get(team)?.reliability ?? 0.72,
      bestWins: bestWins.get(team) ?? [],
      lossesTo: lossesTo.get(team) ?? [],
    };
  });
}
