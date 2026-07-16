export type RankingGame = {
  gameId: string;
  week: number;
  startDate: string | null;
  neutralSite: boolean | number;
  homeTeam: string;
  homePoints: number;
  awayTeam: string;
  awayPoints: number;
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
  offYppIndex: number;
  offYpaIndex: number;
  offYpcIndex: number;
  defYppIndex: number;
  defYpaIndex: number;
  defYpcIndex: number;
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
};

type TeamRecord = { wins: number; losses: number; ties: number; games: number };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

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
  const matrix = Array.from({ length: teams.length }, (_, row) => Array.from({ length: teams.length }, (_, column) => row === column ? 2 : 0));
  const vector = Array.from({ length: teams.length }, () => 1);
  for (const game of games) {
    const home = index.get(game.homeTeam);
    const away = index.get(game.awayTeam);
    if (home === undefined || away === undefined) continue;
    matrix[home][home] += 1;
    matrix[away][away] += 1;
    matrix[home][away] -= 1;
    matrix[away][home] -= 1;
    if (game.homePoints > game.awayPoints) { vector[home] += 0.5; vector[away] -= 0.5; }
    else if (game.awayPoints > game.homePoints) { vector[away] += 0.5; vector[home] -= 0.5; }
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

function buildElo(games: RankingGame[], teams: string[]) {
  const ratings = new Map(teams.map((team) => [team, 1500]));
  const appearances = new Map(teams.map((team) => [team, 0]));
  for (const game of [...games].sort((a, b) => a.week - b.week || String(a.startDate).localeCompare(String(b.startDate)) || a.gameId.localeCompare(b.gameId))) {
    const homeRating = ratings.get(game.homeTeam) ?? 1500;
    const awayRating = ratings.get(game.awayTeam) ?? 1500;
    const homeField = game.neutralSite ? 0 : 45;
    const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating - homeField) / 400));
    const actualHome = game.homePoints === game.awayPoints ? 0.5 : game.homePoints > game.awayPoints ? 1 : 0;
    const homeGames = appearances.get(game.homeTeam) ?? 0;
    const awayGames = appearances.get(game.awayTeam) ?? 0;
    const k = Math.max(homeGames, awayGames) < 4 ? 28 : 20;
    ratings.set(game.homeTeam, homeRating + k * (actualHome - expectedHome));
    ratings.set(game.awayTeam, awayRating + k * ((1 - actualHome) - (1 - expectedHome)));
    appearances.set(game.homeTeam, homeGames + 1);
    appearances.set(game.awayTeam, awayGames + 1);
  }
  return ratings;
}

export function buildBcsRankings(games: RankingGame[], profiles: RankingProfile[]): BcsRankingRow[] {
  const eligible = new Set(profiles.map((profile) => profile.team));
  const allTeams = [...new Set([...eligible, ...games.flatMap((game) => [game.homeTeam, game.awayTeam])])].sort();
  if (!eligible.size) return [];

  const colley = solveColley(games, allTeams);
  const elo = buildElo(games, allTeams);
  const allColleyPercentiles = percentiles(colley);
  const allEloPercentiles = percentiles(elo);
  const opponentStrength = new Map(allTeams.map((team) => [team, 0.6 * (allColleyPercentiles.get(team) ?? 0.5) + 0.4 * (allEloPercentiles.get(team) ?? 0.5)]));
  const records = new Map<string, TeamRecord>([...eligible].map((team) => [team, { wins: 0, losses: 0, ties: 0, games: 0 }]));
  const teamGames = new Map<string, Array<{ game: RankingGame; opponent: string; home: boolean }>>([...eligible].map((team) => [team, []]));
  const directResults = new Map<string, number>();

  for (const game of games) {
    for (const [team, opponent, home] of [[game.homeTeam, game.awayTeam, true], [game.awayTeam, game.homeTeam, false]] as const) {
      const record = records.get(team);
      if (!record) continue;
      record.games += 1;
      const points = home ? game.homePoints : game.awayPoints;
      const opponentPoints = home ? game.awayPoints : game.homePoints;
      if (points > opponentPoints) record.wins += 1;
      else if (points < opponentPoints) record.losses += 1;
      else record.ties += 1;
      teamGames.get(team)?.push({ game, opponent, home });
    }
    if (game.homePoints !== game.awayPoints) {
      const winner = game.homePoints > game.awayPoints ? game.homeTeam : game.awayTeam;
      const loser = winner === game.homeTeam ? game.awayTeam : game.homeTeam;
      directResults.set(`${winner}\u0000${loser}`, (directResults.get(`${winner}\u0000${loser}`) ?? 0) + 1);
    }
  }

  const resume = new Map<string, number>();
  const recordValue = new Map<string, number>();
  const sor = new Map<string, number>();
  const sos = new Map<string, number>();
  const quality = new Map<string, number>();
  const headToHead = new Map<string, number>();
  const power = new Map<string, number>();
  const eligibleColley = new Map<string, number>();
  const eligibleElo = new Map<string, number>();

  for (const profile of profiles) {
    const record = records.get(profile.team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const details = teamGames.get(profile.team) ?? [];
    let expectedWins = 0;
    let qualityWins = 0;
    let badLosses = 0;
    let headToHeadValue = 0;
    for (const detail of details) {
      const teamRating = elo.get(profile.team) ?? 1500;
      const opponentRating = elo.get(detail.opponent) ?? 1500;
      const siteEdge = detail.game.neutralSite ? 0 : detail.home ? 45 : -45;
      expectedWins += 1 / (1 + 10 ** ((opponentRating - teamRating - siteEdge) / 400));
      const strength = opponentStrength.get(detail.opponent) ?? 0.35;
      const points = detail.home ? detail.game.homePoints : detail.game.awayPoints;
      const opponentPoints = detail.home ? detail.game.awayPoints : detail.game.homePoints;
      if (points > opponentPoints) {
        qualityWins += strength * (detail.game.neutralSite ? 1.05 : detail.home ? 1 : 1.1);
        headToHeadValue += 0.6 + 0.4 * strength;
      } else if (points < opponentPoints) {
        badLosses += Math.max(0, 0.55 - strength);
        headToHeadValue -= 1 - 0.4 * strength;
      }
    }
    const gamesPlayed = Math.max(1, record.games);
    const winValue = record.wins + 0.5 * record.ties;
    const winPercentage = winValue / gamesPlayed;
    const schedule = average(details.map((detail) => opponentStrength.get(detail.opponent) ?? 0.35));
    const qualityScore = (qualityWins - 0.5 * badLosses) / gamesPlayed;
    const lossRate = record.losses / gamesPlayed;
    const recordScore = winPercentage - 0.08 * lossRate + 0.015 * Math.min(1, record.games / 10);
    sos.set(profile.team, record.games ? schedule : 0.5);
    quality.set(profile.team, qualityScore);
    headToHead.set(profile.team, record.games ? headToHeadValue / gamesPlayed : 0);
    sor.set(profile.team, record.games ? (winValue - expectedWins) / Math.sqrt(gamesPlayed) : 0);
    recordValue.set(profile.team, record.games ? recordScore : 0.5);
    // Record is the anchor. Schedule and quality wins add context without
    // becoming a conference-size proxy that can erase an elite win-loss mark.
    resume.set(profile.team, 0.78 * winPercentage + 0.15 * (record.games ? schedule : 0.5) + 0.07 * qualityScore);
    const offense = average([Number(profile.offYppIndex), Number(profile.offYpaIndex), Number(profile.offYpcIndex)]);
    const defense = average([Number(profile.defYppIndex), Number(profile.defYpaIndex), Number(profile.defYpcIndex)]);
    power.set(profile.team, Math.log(Math.max(0.05, offense)) - Math.log(Math.max(0.05, defense)));
    eligibleColley.set(profile.team, colley.get(profile.team) ?? 0.5);
    eligibleElo.set(profile.team, elo.get(profile.team) ?? 1500);
  }

  const resumePercentiles = percentiles(resume);
  const recordPercentiles = percentiles(recordValue);
  const sorPercentiles = percentiles(sor);
  const sosPercentiles = percentiles(sos);
  const qualityPercentiles = percentiles(quality);
  const headToHeadPercentiles = percentiles(headToHead);
  const colleyPercentiles = percentiles(eligibleColley);
  const eloPercentiles = percentiles(eligibleElo);
  const powerPercentiles = percentiles(power);
  const resultsScore = new Map<string, number>();
  const scheduleScore = new Map<string, number>();
  const computerScore = new Map<string, number>();
  const bcsScore = new Map<string, number>();

  for (const team of eligible) {
    const computerSignals = [resumePercentiles, sorPercentiles, headToHeadPercentiles, colleyPercentiles, eloPercentiles, powerPercentiles]
      .map((component) => component.get(team) ?? 0).sort((a, b) => a - b);
    const computer = average(computerSignals.slice(1, -1));
    const results = 0.48 * (recordPercentiles.get(team) ?? 0) + 0.27 * (resumePercentiles.get(team) ?? 0) + 0.17 * (sorPercentiles.get(team) ?? 0) + 0.08 * (headToHeadPercentiles.get(team) ?? 0);
    const schedule = 0.72 * (sosPercentiles.get(team) ?? 0) + 0.28 * (qualityPercentiles.get(team) ?? 0);
    const record = records.get(team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    const maturity = clamp((record.games - 3) / 5, 0, 1);
    const recordProtection = maturity * (record.losses === 0 ? 0.045 : record.losses === 1 ? 0.018 : 0);
    resultsScore.set(team, results);
    scheduleScore.set(team, schedule);
    computerScore.set(team, computer);
    bcsScore.set(team, clamp(0.5 * results + 0.2 * schedule + 0.3 * computer + recordProtection, 0, 1));
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
    if (Math.min(aRecord.games, bRecord.games) >= 6 && Math.abs(aRecord.losses - bRecord.losses) >= 2 && Math.abs(scoreDifference) < 0.075) {
      return aRecord.losses - bRecord.losses;
    }
    if (Math.abs(scoreDifference) > 0.004) return scoreDifference;
    return (resultsScore.get(b) ?? 0) - (resultsScore.get(a) ?? 0) || (computerScore.get(b) ?? 0) - (computerScore.get(a) ?? 0) || a.localeCompare(b);
  }).map((team, index) => {
    const profile = profileByTeam.get(team)!;
    const record = records.get(team) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
    return {
      rank: index + 1, team, teamId: profile.teamId, abbreviation: profile.abbreviation, mascot: profile.mascot, conference: profile.conference,
      color: profile.color, altColor: profile.altColor, logo: profile.logo, wins: record.wins, losses: record.losses, ties: record.ties,
      record: `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}`,
      bcsScore: bcsScore.get(team) ?? 0, resultsScore: resultsScore.get(team) ?? 0, scheduleScore: scheduleScore.get(team) ?? 0,
      computerScore: computerScore.get(team) ?? 0, sorRank: sorRanks.get(team) ?? eligible.size, sosRank: sosRanks.get(team) ?? eligible.size,
      powerRank: powerRanks.get(team) ?? eligible.size, eloRank: eloRanks.get(team) ?? eligible.size, colleyRank: colleyRanks.get(team) ?? eligible.size,
      headToHeadRank: headToHeadRanks.get(team) ?? eligible.size,
    };
  });
}
