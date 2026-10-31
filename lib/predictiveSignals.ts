export type GameSignalRow = {
  gameId: string; week: number; team: string; opponent: string;
  points: number | null; turnovers: number; rushYards: number; rushAttempts: number;
  sacksAllowed?: number; sackYardsLost?: number;
};
export type TurnoverGameSignal = { expected: number; residual: number; predictivePoints: number };
export type TurnoverProfile = {
  games: number; lostPerGame: number; forcedPerGame: number; lostVariance: number;
};
export type RushingPersonnel = {
  rbCarries: number; rbYpc: number; qbCarries: number; qbYpc: number | null;
  teamYpc: number; rbShare: number;
};
export type PlayerRush = { gameId: string; week: number; team: string; position: "RB" | "QB"; carries: number; yards: number };

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const average = (values: number[], fallback = 1.2) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
const key = (gameId: string, team: string) => `${gameId}\u0000${team}`;

/** Prior weeks determine expected turnover exposure; same-week results never enter the baseline. */
export function buildTurnoverSignals(rows: GameSignalRow[], completedIds: Set<string>) {
  const result = new Map<string, TurnoverGameSignal>();
  const history = new Map<string, GameSignalRow[]>();
  const weeks = [...new Set(rows.filter(row => completedIds.has(row.gameId)).map(row => row.week))].sort((a, b) => a - b);
  for (const week of weeks) {
    const current = rows.filter(row => row.week === week && completedIds.has(row.gameId));
    const byGame = new Map(current.map(row => [key(row.gameId, row.team), row]));
    for (const row of current) {
      const previous = history.get(row.team) ?? [];
      const opponentPrevious = history.get(row.opponent) ?? [];
      const opponentForces = opponentPrevious.map(game => byHistoricalOpponentTurnovers(game, rows));
      const offensiveRate = (previous.reduce((sum, game) => sum + game.turnovers, 2.4)) / (previous.length + 2);
      const defensiveRate = (opponentForces.reduce((sum, value) => sum + value, 2.4)) / (opponentForces.length + 2);
      const expected = clamp(.6 * offensiveRate + .4 * defensiveRate, .4, 2.5);
      result.set(key(row.gameId, row.team), { expected, residual: clamp(row.turnovers - expected, -2.5, 2.5), predictivePoints: row.points ?? 0 });
    }
    for (const row of current) {
      const own = result.get(key(row.gameId, row.team))!;
      const opponent = byGame.get(key(row.gameId, row.opponent));
      const opponentResidual = opponent ? result.get(key(row.gameId, opponent.team))?.residual ?? 0 : 0;
      // Extra giveaways suppress a team's score and can gift the opponent
      // short fields. Remove only the surprise portion, keeping persistent
      // turnover propensity in the matchup forecast.
      own.predictivePoints = Math.max(0, (row.points ?? 0) + 3.2 * own.residual - 1.6 * opponentResidual);
    }
    for (const row of current) history.set(row.team, [...(history.get(row.team) ?? []), row]);
  }
  return result;
}

function byHistoricalOpponentTurnovers(game: GameSignalRow, all: GameSignalRow[]) {
  return all.find(other => other.gameId === game.gameId && other.team === game.opponent)?.turnovers ?? 1.2;
}

export function turnoverProfile(rows: GameSignalRow[], team: string, week: number): TurnoverProfile | null {
  const games = rows.filter(row => row.team === team && row.week <= week);
  if (!games.length) return null;
  const lost = games.map(row => row.turnovers);
  const forced = games.map(row => rows.find(other => other.gameId === row.gameId && other.team === row.opponent)?.turnovers ?? 1.2);
  const mean = average(lost);
  return { games: games.length, lostPerGame: mean, forcedPerGame: average(forced), lostVariance: average(lost.map(n => (n - mean) ** 2), 0) };
}

export function matchupTurnovers(offense?: TurnoverProfile | null, defense?: TurnoverProfile | null) {
  if (!offense || !defense) return null;
  const off = (offense.games * offense.lostPerGame + 3 * 1.2) / (offense.games + 3);
  const forced = (defense.games * defense.forcedPerGame + 3 * 1.2) / (defense.games + 3);
  return clamp(.6 * off + .4 * forced, .3, 2.6);
}

/** Additional giveaways from projected stalled drives and obvious passing downs.
 * The historical giveaway/force blend remains the anchor. Missing advanced
 * measurements do not imply a bad protection matchup.
 */
export function stalledDriveTurnoverExposure(input:{
  yardsPerPlay:number; baselineYardsPerPlay:number; passAttempts:number; rushAttempts:number;
  standardDownSuccess?:number|null; passingDownSuccess?:number|null;
  passSuccess?:number|null; havocAllowed?:number|null;
}) {
  const plays=Math.max(1,input.passAttempts+input.rushAttempts);
  const passShare=clamp(input.passAttempts/plays,0,1);
  const efficiencyDeficit=clamp((input.baselineYardsPerPlay-input.yardsPerPlay)/Math.max(1,input.baselineYardsPerPlay),0,.4);
  const earlyDownDeficit=input.standardDownSuccess==null?0:clamp((.44-input.standardDownSuccess)/.20,0,1);
  const passDownDeficit=input.passingDownSuccess==null?0:clamp((.34-input.passingDownSuccess)/.20,0,1);
  const poorPassAnswer=input.passSuccess==null?0:clamp((.44-input.passSuccess)/.20,0,1);
  const pressure=input.havocAllowed==null?0:clamp((input.havocAllowed-.18)/.18,0,1);
  const stall=clamp(.35*efficiencyDeficit/.25+.35*earlyDownDeficit+.3*passDownDeficit,0,1);
  // A functional passing game can rescue poor rushing efficiency. Pressure
  // matters most when the offense must throw while behind the chains.
  return clamp(stall*(.15+.35*poorPassAnswer+.35*pressure)*(.7+.6*passShare),0,.65);
}

export function parsePlayerRushes(payload: unknown, roster: Map<string, "RB" | "QB">, teamGames: GameSignalRow[] = []): PlayerRush[] {
  if (!Array.isArray(payload)) return [];
  const qbCounts=new Map<string,number>();
  for(const item of payload){
    if(!item||typeof item!=="object")continue;
    const row=item as Record<string,unknown>;
    if(roster.get(String(row.playerId??""))==="QB"){
      const gameKey=key(String(row.gameId),String(row.team));qbCounts.set(gameKey,(qbCounts.get(gameKey)??0)+1);
    }
  }
  return payload.flatMap((item): PlayerRush[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const position = roster.get(String(row.playerId ?? ""));
    if (!position) return [];
    const game = teamGames.find(game => game.gameId === String(row.gameId) && game.team === String(row.team));
    const singleQb=position==="QB"&&qbCounts.get(key(String(row.gameId),String(row.team)))===1;
    const assignedSacks=Number.isFinite(Number(row.sacks))?Number(row.sacks):singleQb?game?.sacksAllowed??0:0;
    const carries = Math.max(0, Number(row.attempts ?? 0) - assignedSacks - Number(row.kneels ?? 0));
    const sackShare = position === "QB" && game?.sacksAllowed && assignedSacks > 0
      ? Math.min(1, assignedSacks / game.sacksAllowed) : 0;
    const yards = Number(row.totalRushingYards) + sackShare * (game?.sackYardsLost ?? 0);
    if (!Number.isFinite(carries) || carries < 1 || !Number.isFinite(yards)) return [];
    return [{ gameId: String(row.gameId), week: Number(row.week), team: String(row.team), position, carries, yards }];
  });
}

export function rushingPersonnel(rows: GameSignalRow[], players: PlayerRush[], team: string, week: number): RushingPersonnel | null {
  const games = rows.filter(row => row.team === team && row.week <= week);
  const eligible = new Set(games.map(row => row.gameId));
  const playerRows = players.filter(row => row.team === team && row.week <= week && eligible.has(row.gameId));
  const aggregate = (position: PlayerRush["position"]) => playerRows.filter(row => row.position === position).reduce((sum, row) => ({ carries: sum.carries + row.carries, yards: sum.yards + row.yards }), { carries: 0, yards: 0 });
  const rb = aggregate("RB"), qb = aggregate("QB");
  const teamCarries = games.reduce((sum, row) => sum + row.rushAttempts, 0);
  const teamYards = games.reduce((sum, row) => sum + row.rushYards, 0);
  if (rb.carries < 10 || teamCarries < 20) return null;
  return { rbCarries: rb.carries, rbYpc: rb.yards / rb.carries, qbCarries: qb.carries,
    qbYpc: qb.carries ? qb.yards / qb.carries : null,
    teamYpc: teamYards / teamCarries, rbShare: clamp(rb.carries / teamCarries, 0, 1) };
}

export function sustainableRunMultiplier(personnel?: RushingPersonnel | null) {
  if (!personnel || personnel.teamYpc <= 0 || personnel.rbCarries < 15) return 1;
  const rbShare=clamp(personnel.rbShare,0,1);
  const confidence = Math.min(1, personnel.rbCarries / 75) * Math.min(1, rbShare / .45);
  const rbAdjustment=Math.exp(clamp(.25 * confidence * Math.log(clamp(personnel.rbYpc / personnel.teamYpc, .55, 1.6)), -.08, .08));
  // Team YPC already contains actual QB runs. Adjust only the RB share for
  // drive-to-drive sustainability; preserve every non-RB carry in the common
  // rushing projection, including scrambles and designed QB runs.
  return (1-rbShare)+rbShare*rbAdjustment;
}
