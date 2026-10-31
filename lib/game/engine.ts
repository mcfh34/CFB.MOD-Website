import {
  defensePlayById,
  CONVERSION_DEFENSE_PLAYS,
  CONVERSION_OFFENSE_PLAYS,
  FIELD_GOAL_DEFENSE_PLAYS,
  KICK_COVERAGE_PLAYS,
  KICK_RETURN_PLAYS,
  offensePlayById,
  OFFENSE_PLAYS,
  PUNT_RETURN_PLAYS,
  SPECIAL_OFFENSE_PLAYS,
  DEFENSE_PLAYS,
} from "./playbook";
import {
  clampExecutionScore,
  conceptUnitRatings,
  DEFAULT_EXECUTION_SCORE,
  executionModifier,
  playUsesExecutionMeter,
} from "./execution";
import type {
  DefensePlayId,
  GameDifficulty,
  GameState,
  IndividualPlayerStats,
  OffensePlayId,
  PendingCall,
  PlayLogEntry,
  PlayOutcome,
  PlayParticipants,
  Player,
  Resolution,
  SpecialTeamsReplay,
  TeamConfig,
  TeamInput,
  OpponentType,
  GameTheme,
  TeamRoster,
  TeamSide,
  TeamStats,
} from "./types";

export const REGULATION_SECONDS = 15 * 60;
export const CLOCK_ACCELERATION = 1.45;
export const TWO_MINUTE_CLOCK_ACCELERATION = 0.52;

export function normalizeQuarterLengthMinutes(value: unknown) {
  const minutes = Number(value);
  if (minutes === 0) return 0;
  if (!Number.isFinite(minutes)) return 15;
  return clamp(Math.round(minutes), 1, 15);
}

function regulationSeconds(state: Pick<GameState, "quarterLengthMinutes">) {
  return normalizeQuarterLengthMinutes(state.quarterLengthMinutes) * 60;
}

export type ScrimmageOffenseId = "run" | "stick" | "mesh" | "four-verts";
export type ScrimmageDefenseId = "bear-front" | "cover-2" | "cover-4" | "cover-0";

const LEGACY_OFFENSE_CONCEPT: Partial<Record<OffensePlayId, ScrimmageOffenseId>> = {
  "inside-zone": "run",
  power: "run",
  "outside-zone": "run",
  counter: "run",
  rpo: "mesh",
  "quick-pass": "stick",
  dropback: "mesh",
  "play-action": "four-verts",
  screen: "stick",
};

const LEGACY_DEFENSE_CONCEPT: Partial<Record<DefensePlayId, ScrimmageDefenseId>> = {
  "cover-1": "cover-2",
  "cover-3": "cover-2",
  quarters: "cover-4",
  "man-blitz": "cover-0",
  "zone-blitz": "cover-0",
  "run-commit": "bear-front",
  contain: "cover-2",
  "drop-8": "cover-4",
};

export function normalizeOffenseConcept(playId: OffensePlayId): OffensePlayId {
  return LEGACY_OFFENSE_CONCEPT[playId] ?? playId;
}

export function normalizeDefenseConcept(playId: DefensePlayId): DefensePlayId {
  return LEGACY_DEFENSE_CONCEPT[playId] ?? playId;
}

export const PLAY_MATCHUP: Record<
  ScrimmageOffenseId,
  Record<ScrimmageDefenseId, number>
> = {
  run: { "bear-front": -18, "cover-2": 8, "cover-4": 16, "cover-0": 4 },
  stick: { "bear-front": 8, "cover-2": -16, "cover-4": 15, "cover-0": 16 },
  mesh: { "bear-front": 8, "cover-2": -5, "cover-4": 5, "cover-0": 0 },
  "four-verts": { "bear-front": 16, "cover-2": 8, "cover-4": -18, "cover-0": 0 },
};

const FAKE_PUNT_MATCHUP: Partial<Record<DefensePlayId, number>> = {
  "punt-safe": 0,
  "punt-return-left": 5,
  "punt-return-middle": 5,
  "punt-return-right": 5,
  "punt-block": 7,
  "field-goal-safe": -1,
  "field-goal-block": 7,
};

export function matchupAdvantage(
  offensePlayId: OffensePlayId,
  defensePlayId: DefensePlayId,
) {
  const offenseConcept = normalizeOffenseConcept(offensePlayId) as ScrimmageOffenseId;
  const defenseConcept = normalizeDefenseConcept(defensePlayId) as ScrimmageDefenseId;
  return PLAY_MATCHUP[offenseConcept]?.[defenseConcept] ??
    FAKE_PUNT_MATCHUP[defensePlayId] ?? 0;
}

const PASS_PROFILE: Record<
  "stick" | "mesh" | "four-verts",
  {
    completion: number;
    sack: number;
    interception: number;
  }
> = {
  stick: {
    completion: 0.78,
    sack: 0.018,
    interception: 0.009,
  },
  mesh: {
    completion: 0.65,
    sack: 0.052,
    interception: 0.021,
  },
  "four-verts": {
    completion: 0.48,
    sack: 0.095,
    interception: 0.04,
  },
};

type YardageBand = { ceiling: number; minimum: number; maximum: number };

export const ARCADE_YARDAGE_TABLES: Record<ScrimmageOffenseId, YardageBand[]> = {
  run: [
    { ceiling: -62, minimum: -7, maximum: -2 },
    { ceiling: -34, minimum: -2, maximum: 1 },
    { ceiling: -8, minimum: 1, maximum: 3 },
    { ceiling: 22, minimum: 4, maximum: 6 },
    { ceiling: 48, minimum: 7, maximum: 10 },
    { ceiling: 72, minimum: 10, maximum: 20 },
    { ceiling: Number.POSITIVE_INFINITY, minimum: 18, maximum: 42 },
  ],
  stick: [
    { ceiling: -35, minimum: 2, maximum: 4 },
    { ceiling: 5, minimum: 5, maximum: 7 },
    { ceiling: 38, minimum: 8, maximum: 10 },
    { ceiling: Number.POSITIVE_INFINITY, minimum: 10, maximum: 15 },
  ],
  mesh: [
    { ceiling: -35, minimum: 4, maximum: 7 },
    { ceiling: 5, minimum: 8, maximum: 12 },
    { ceiling: 38, minimum: 13, maximum: 18 },
    { ceiling: 68, minimum: 20, maximum: 30 },
    { ceiling: Number.POSITIVE_INFINITY, minimum: 26, maximum: 44 },
  ],
  "four-verts": [
    { ceiling: -20, minimum: 10, maximum: 20 },
    { ceiling: 20, minimum: 20, maximum: 30 },
    { ceiling: 55, minimum: 30, maximum: 50 },
    { ceiling: Number.POSITIVE_INFINITY, minimum: 45, maximum: 82 },
  ],
};

export function arcadeExecutionEdge(
  offenseExecutionScore: number,
  defenseExecutionScore: number,
  offensePlayId: ScrimmageOffenseId,
  defensePlayId: DefensePlayId,
  ratingDiff: number,
  randomNoise = 0,
) {
  return (offenseExecutionScore - defenseExecutionScore) +
    matchupAdvantage(offensePlayId, defensePlayId) * 2 +
    ratingDiff * 0.65 +
    clamp(randomNoise, -8, 8);
}

function yardageFromTable(
  playId: ScrimmageOffenseId,
  edge: number,
  random: () => number,
) {
  const band = ARCADE_YARDAGE_TABLES[playId].find((candidate) => edge <= candidate.ceiling) ??
    ARCADE_YARDAGE_TABLES[playId].at(-1)!;
  return Math.round(band.minimum + random() * (band.maximum - band.minimum));
}

const DEFENSE_PRESSURE: Partial<Record<DefensePlayId, number>> = {
  "cover-0": 0.105,
  "bear-front": 0.025,
  "cover-4": -0.012,
  "man-blitz": 0.085,
  "zone-blitz": 0.055,
  "run-commit": 0.025,
  contain: -0.018,
  "field-goal-block": 0.08,
};

const DEFENSE_COVERAGE: Partial<Record<DefensePlayId, number>> = {
  "bear-front": 0.07,
  "cover-0": 0.052,
  "cover-1": -0.025,
  "cover-2": -0.015,
  "cover-4": -0.04,
  "cover-3": 0,
  quarters: -0.035,
  "man-blitz": 0.045,
  "zone-blitz": 0.012,
  "run-commit": 0.09,
  contain: 0.005,
  "drop-8": -0.06,
  "field-goal-block": 0.065,
};

export function otherSide(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let value = hashString(seed) || 1;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const first = Math.max(random(), Number.EPSILON);
  const second = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function emptyStats(): TeamStats {
  return {
    plays: 0,
    firstDowns: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTouchdowns: 0,
    passAttempts: 0,
    completions: 0,
    passYards: 0,
    passTouchdowns: 0,
    sacksAllowed: 0,
    interceptionsThrown: 0,
    fumblesLost: 0,
    punts: 0,
    puntReturns: 0,
    puntReturnYards: 0,
    kickReturns: 0,
    kickReturnYards: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    timeOfPossessionSeconds: 0,
  };
}

function emptyPlayerStats(playerId: string): IndividualPlayerStats {
  return {
    playerId,
    passAttempts: 0,
    completions: 0,
    passYards: 0,
    passTouchdowns: 0,
    interceptionsThrown: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTouchdowns: 0,
    targets: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    tackles: 0,
    soloTackles: 0,
    assistedTackles: 0,
    tacklesForLoss: 0,
    sacks: 0,
    interceptions: 0,
    passBreakups: 0,
    forcedFumbles: 0,
  };
}

function makePlayer(
  team: string,
  id: string,
  name: string,
  number: number,
  position: Player["position"],
  rating: number,
): Player {
  return {
    id: `${team.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}`,
    name,
    number,
    position,
    rating: clamp(rating, 55, 99),
  };
}

const FIRST_INITIALS = ["A", "B", "C", "D", "E", "J", "K", "L", "M", "N", "R", "S", "T", "W"];
const LAST_NAMES = [
  "Adams", "Allen", "Baker", "Banks", "Brooks", "Brown", "Carter", "Clark",
  "Coleman", "Collins", "Davis", "Edwards", "Evans", "Foster", "Garcia", "Grant",
  "Green", "Hall", "Harris", "Hayes", "Hill", "Howard", "Jackson", "James",
  "Johnson", "Jones", "King", "Lee", "Lewis", "Martin", "Miller", "Mitchell",
  "Moore", "Morgan", "Nelson", "Parker", "Reed", "Robinson", "Scott", "Smith",
  "Taylor", "Thomas", "Walker", "White", "Williams", "Wilson", "Wright", "Young",
];

function rosterName(abbreviation: string, index: number, side: TeamSide) {
  const seed = hashString(`${abbreviation}:${side}`);
  const initial = FIRST_INITIALS[(seed + index * 5) % FIRST_INITIALS.length];
  const last = LAST_NAMES[(seed + index * 11) % LAST_NAMES.length];
  return `${initial}. ${last}`;
}

function createSpecialists(abbreviation: string, rating: number, side: TeamSide): Player[] {
  const name = (index: number) => rosterName(abbreviation, index, side);
  return [
    makePlayer(abbreviation, "k1", name(22), 19, "K", rating),
    makePlayer(abbreviation, "p1", name(23), 98, "P", rating - 1),
    makePlayer(abbreviation, "ls1", name(24), 46, "LS", rating),
    makePlayer(abbreviation, "h1", name(25), 14, "H", rating - 1),
  ];
}

export function createRoster(abbreviation: string, rating: number, side: TeamSide): TeamRoster {
  const name = (index: number) => rosterName(abbreviation, index, side);
  return {
    offense: [
      makePlayer(abbreviation, "qb1", name(0), 12, "QB", rating + 1),
      makePlayer(abbreviation, "rb1", name(1), 4, "RB", rating),
      makePlayer(abbreviation, "wr1", name(2), 1, "WR", rating + 2),
      makePlayer(abbreviation, "wr2", name(3), 8, "WR", rating - 1),
      makePlayer(abbreviation, "wr3", name(4), 6, "WR", rating),
      makePlayer(abbreviation, "te1", name(5), 87, "TE", rating),
      makePlayer(abbreviation, "lt1", name(6), 72, "LT", rating + 1),
      makePlayer(abbreviation, "lg1", name(7), 65, "LG", rating),
      makePlayer(abbreviation, "c1", name(8), 55, "C", rating + 1),
      makePlayer(abbreviation, "rg1", name(9), 70, "RG", rating - 1),
      makePlayer(abbreviation, "rt1", name(10), 75, "RT", rating),
    ],
    defense: [
      makePlayer(abbreviation, "de1", name(11), 9, "DE", rating + 1),
      makePlayer(abbreviation, "dt1", name(12), 90, "DT", rating),
      makePlayer(abbreviation, "dt2", name(13), 95, "DT", rating - 1),
      makePlayer(abbreviation, "de2", name(14), 6, "DE", rating + 1),
      makePlayer(abbreviation, "lb1", name(15), 32, "LB", rating),
      makePlayer(abbreviation, "lb2", name(16), 40, "LB", rating + 1),
      makePlayer(abbreviation, "lb3", name(17), 7, "LB", rating - 1),
      makePlayer(abbreviation, "cb1", name(18), 2, "CB", rating + 1),
      makePlayer(abbreviation, "cb2", name(19), 1, "CB", rating),
      makePlayer(abbreviation, "fs1", name(20), 3, "FS", rating + 1),
      makePlayer(abbreviation, "ss1", name(21), 5, "SS", rating),
    ],
    specialTeams: createSpecialists(abbreviation, rating, side),
  };
}

function initialPlayerStats(team: TeamConfig) {
  return Object.fromEntries(
    [...team.roster.offense, ...team.roster.defense, ...(team.roster.specialTeams ?? [])].map((player) => [
      player.id,
      emptyPlayerStats(player.id),
    ]),
  );
}

function ensurePlayerStats(state: GameState) {
  state.playerStats ??= { home: {}, away: {} };
  for (const side of ["home", "away"] as const) {
    state.playerStats[side] ??= {};
    const team = getTeam(state, side);
    team.roster.specialTeams ??= createSpecialists(team.abbreviation, team.rating, side);
    for (const player of [...team.roster.offense, ...team.roster.defense, ...team.roster.specialTeams]) {
      state.playerStats[side][player.id] ??= emptyPlayerStats(player.id);
    }
  }
}

function playerStat(state: GameState, side: TeamSide, player: Player) {
  ensurePlayerStats(state);
  return state.playerStats[side][player.id];
}

function createTeam(input: TeamInput, side: TeamSide): TeamConfig {
  const rating = clamp(Math.round(input.rating ?? 82), 60, 99);
  const abbreviation = input.abbreviation.trim().toUpperCase();
  return {
    side,
    teamId: input.teamId,
    name: input.name.trim(),
    mascot: input.mascot,
    abbreviation,
    conference: input.conference,
    primaryColor: input.primaryColor.toUpperCase(),
    secondaryColor: input.secondaryColor.toUpperCase(),
    logo: input.logo,
    rating,
    ranking: input.ranking ?? null,
    record: input.record,
    roster: input.roster ?? createRoster(abbreviation, rating, side),
  };
}

export function createInitialGameState(
  roomCode: string,
  homeInput: TeamInput,
  awayInput: TeamInput,
  seed: string,
  opponentType: OpponentType = "human",
  theme: GameTheme = "dark",
  cpuSide: TeamSide = "away",
  difficulty: GameDifficulty = "easy",
  requestedQuarterLengthMinutes: number = 15,
): GameState {
  const random = seededRandom(`${seed}:coin-toss`);
  const openingReceiver: TeamSide = random() < 0.5 ? "home" : "away";
  const homeTeam = createTeam(homeInput, "home");
  const awayTeam = createTeam(awayInput, "away");
  const quarterLengthMinutes = normalizeQuarterLengthMinutes(requestedQuarterLengthMinutes);
  const state: GameState = {
    schemaVersion: 9,
    roomCode,
    status: "active",
    version: 1,
    seed,
    createdAt: new Date().toISOString(),
    opponentType,
    cpuSide,
    theme,
    difficulty,
    quarterLengthMinutes,
    homeTeam,
    awayTeam,
    score: { home: 0, away: 0 },
    stats: { home: emptyStats(), away: emptyStats() },
    playerStats: {
      home: initialPlayerStats(homeTeam),
      away: initialPlayerStats(awayTeam),
    },
    period: 1,
    clock: quarterLengthMinutes * 60,
    phase: "kickoff",
    possession: openingReceiver,
    openingReceiver,
    secondHalfReceiver: otherSide(openingReceiver),
    ballOn: 25,
    driveStartBallOn: 25,
    down: 1,
    toGo: 10,
    driveNumber: 0,
    playNumber: 0,
    pending: {},
    playLog: [],
  };
  if (quarterLengthMinutes === 0) startOvertime(state);
  return state;
}

export function getTeam(state: GameState, side: TeamSide) {
  return side === "home" ? state.homeTeam : state.awayTeam;
}

export function upgradeGameState(state: GameState) {
  const previousSchemaVersion = state.schemaVersion ?? 1;
  const migratedExecution = (value: unknown) => {
    const numeric = typeof value === "number" ? value : Number.NaN;
    return previousSchemaVersion < 8 && Number.isFinite(numeric) && numeric > 0 && numeric <= 1
      ? clampExecutionScore(numeric * 100)
      : clampExecutionScore(value);
  };
  const needsPossessionMigration = ["home", "away"].some(
    (side) => state.stats[side as TeamSide].timeOfPossessionSeconds == null,
  );
  state.schemaVersion = 9;
  state.opponentType ??= "human";
  state.theme ??= "dark";
  state.difficulty ??= "easy";
  state.quarterLengthMinutes = normalizeQuarterLengthMinutes(state.quarterLengthMinutes ?? 15);
  state.twoPointAttempt ??= false;
  state.phase ??= "scrimmage";
  state.driveStartBallOn ??= state.ballOn;
  for (const side of ["home", "away"] as const) {
    state.stats[side].puntReturns ??= 0;
    state.stats[side].puntReturnYards ??= 0;
    state.stats[side].kickReturns ??= 0;
    state.stats[side].kickReturnYards ??= 0;
    state.stats[side].timeOfPossessionSeconds ??= 0;
  }
  let inferredDrive = 0;
  let inferredOffense: TeamSide | undefined;
  for (const [index, entry] of state.playLog.entries()) {
    if (entry.offenseExecutionScore == null && entry.executionScore != null) {
      entry.offenseExecutionScore = migratedExecution(entry.executionScore);
    } else if (previousSchemaVersion < 8 && entry.offenseExecutionScore != null) {
      entry.offenseExecutionScore = migratedExecution(entry.offenseExecutionScore);
    }
    if (previousSchemaVersion < 8 && entry.defenseExecutionScore != null) {
      entry.defenseExecutionScore = migratedExecution(entry.defenseExecutionScore);
    }
    if (entry.offenseExecutionScore != null) entry.executionScore = entry.offenseExecutionScore;
    entry.ballOnBefore ??= clamp(entry.ballOnAfter - entry.yards, 1, 99);
    if (entry.driveNumber == null) {
      if (entry.outcome === "kickoff" || inferredOffense !== entry.offense) {
        inferredDrive += 1;
        inferredOffense = entry.offense;
      }
      entry.driveNumber = Math.max(1, inferredDrive);
    } else {
      inferredDrive = Math.max(inferredDrive, entry.driveNumber);
      inferredOffense = entry.offense;
    }
    if (entry.elapsedSeconds == null) {
      const next = state.playLog[index + 1];
      if (next?.period === entry.period) {
        entry.elapsedSeconds = Math.max(0, entry.clockBefore - next.clockBefore);
      } else if (state.period === entry.period) {
        entry.elapsedSeconds = Math.max(0, entry.clockBefore - state.clock);
      } else {
        entry.elapsedSeconds = Math.max(0, entry.clockBefore);
      }
    }
  }
  if (needsPossessionMigration) {
    state.stats.home.timeOfPossessionSeconds = 0;
    state.stats.away.timeOfPossessionSeconds = 0;
    for (const entry of state.playLog) {
      if (!["kickoff", "extra-point", "two-point"].includes(entry.outcome)) {
        state.stats[entry.offense].timeOfPossessionSeconds += entry.elapsedSeconds;
      }
    }
  }
  for (const side of ["home", "away"] as const) {
    const team = getTeam(state, side);
    team.teamId ||= team.abbreviation;
    team.mascot ||= "";
    team.conference ||= "FBS";
    team.logo ||= "";
    if (team.roster.offense.length < 11 || team.roster.defense.length < 11) {
      team.roster = createRoster(team.abbreviation, team.rating, side);
    }
  }
  const legacyPending = state.pending as unknown as Partial<Record<TeamSide, PendingCall>> & {
    offense?: Partial<PendingCall>;
    defense?: Partial<PendingCall>;
  };
  const currentPending: Partial<Record<TeamSide, PendingCall>> = {};
  const candidates = [
    legacyPending.home,
    legacyPending.away,
    legacyPending.offense ? { ...legacyPending.offense, role: "offense" as const } : undefined,
    legacyPending.defense ? { ...legacyPending.defense, role: "defense" as const } : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate || (candidate.seat !== "home" && candidate.seat !== "away")) continue;
    const expectedRole = state.possession === candidate.seat ? "offense" : "defense";
    const role = candidate.role ?? expectedRole;
    const playNumber = candidate.playNumber ?? state.playNumber;
    if (role !== expectedRole || playNumber !== state.playNumber || !candidate.playId) continue;
    let playId = candidate.playId;
    if (state.phase === "scrimmage" || state.twoPointAttempt) {
      playId = role === "offense"
        ? normalizeOffenseConcept(playId as OffensePlayId)
        : normalizeDefenseConcept(playId as DefensePlayId);
    }
    if (
      playId === "punt-safe" ||
      playId === "punt-return-left" ||
      playId === "punt-return-right"
    ) {
      playId = 117 - state.ballOn <= 65 ? "field-goal-safe" : "punt-return-middle";
    } else if (playId === "punt-return-middle" && 117 - state.ballOn <= 65) {
      playId = "field-goal-safe";
    } else if (playId === "punt-block" && 117 - state.ballOn <= 65) {
      playId = "field-goal-block";
    }
    currentPending[candidate.seat] = {
      seat: candidate.seat,
      role,
      playId,
      playNumber,
      submittedAt: candidate.submittedAt ?? new Date(0).toISOString(),
      executionScore: playUsesExecutionMeter(playId)
        ? migratedExecution(candidate.executionScore)
        : undefined,
    };
  }
  state.pending = currentPending;
  ensurePlayerStats(state);
  return state;
}

export function getAvailableOffensePlayIds(state: GameState) {
  if (state.phase === "conversion") {
    if (state.twoPointAttempt) return OFFENSE_PLAYS.map((play) => play.id);
    return CONVERSION_OFFENSE_PLAYS.map((play) => play.id);
  }
  if (state.phase === "kickoff") {
    return KICK_RETURN_PLAYS.map((play) => play.id);
  }
  const ids = OFFENSE_PLAYS.map((play) => play.id);
  const fieldGoalDistance = 117 - state.ballOn;
  if (state.period < 5 && state.down === 4) {
    ids.push("punt");
  }
  if (fieldGoalDistance <= 65) {
    ids.push("field-goal");
  }
  const lateHalf = (state.period === 2 || state.period === 4) && state.clock <= 120;
  if (lateHalf && state.score[state.possession] > state.score[otherSide(state.possession)]) {
    ids.push("kneel");
  }
  if (
    lateHalf &&
    state.clock <= 60 &&
    state.down < 4 &&
    state.score[state.possession] <= state.score[otherSide(state.possession)]
  ) {
    ids.push("spike");
  }
  return ids;
}

export function getAvailableOffensePlays(state: GameState) {
  const ids = new Set(getAvailableOffensePlayIds(state));
  return [...OFFENSE_PLAYS, ...SPECIAL_OFFENSE_PLAYS, ...KICK_RETURN_PLAYS, ...CONVERSION_OFFENSE_PLAYS].filter((play) =>
    ids.has(play.id),
  );
}

export function getAvailableDefensePlayIds(state: GameState) {
  if (state.phase === "conversion") {
    if (state.twoPointAttempt) return DEFENSE_PLAYS.map((play) => play.id);
    return CONVERSION_DEFENSE_PLAYS.map((play) => play.id);
  }
  if (state.phase === "kickoff") {
    return KICK_COVERAGE_PLAYS.map((play) => play.id);
  }
  const ids = DEFENSE_PLAYS.map((play) => play.id);
  const fieldGoalDistance = 117 - state.ballOn;
  if (fieldGoalDistance <= 65) {
    ids.push(...FIELD_GOAL_DEFENSE_PLAYS.map((play) => play.id));
  } else if (state.down === 4 && state.period < 5) {
    ids.push(...PUNT_RETURN_PLAYS.map((play) => play.id));
  }
  return ids;
}

export function getAvailableDefensePlays(state: GameState) {
  const ids = new Set(getAvailableDefensePlayIds(state));
  return [...DEFENSE_PLAYS, ...PUNT_RETURN_PLAYS, ...FIELD_GOAL_DEFENSE_PLAYS, ...KICK_COVERAGE_PLAYS, ...CONVERSION_DEFENSE_PLAYS].filter((play) =>
    ids.has(play.id),
  );
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function startDrive(state: GameState, side: TeamSide, ballOn = 25) {
  state.phase = "scrimmage";
  state.possession = side;
  state.ballOn = ballOn;
  state.driveStartBallOn = ballOn;
  state.down = 1;
  state.toGo = Math.min(10, 100 - ballOn);
  state.driveNumber += 1;
}

function startKickoff(state: GameState, receivingSide: TeamSide) {
  state.phase = "kickoff";
  state.possession = receivingSide;
  state.ballOn = 25;
  state.driveStartBallOn = 25;
  state.down = 1;
  state.toGo = 10;
}

function startConversion(state: GameState, scoringSide: TeamSide) {
  state.phase = "conversion";
  state.possession = scoringSide;
  state.ballOn = 97;
  state.driveStartBallOn = 97;
  state.down = 1;
  state.toGo = 3;
  state.twoPointAttempt = false;
}

export function beginTwoPointAttempt(current: GameState) {
  upgradeGameState(current);
  if (current.phase !== "conversion" || current.twoPointAttempt) {
    throw new Error("A two-point play is not available right now.");
  }
  const state = cloneState(current);
  state.twoPointAttempt = true;
  state.ballOn = 97;
  state.driveStartBallOn = 97;
  state.down = 1;
  state.toGo = 3;
  state.pending = {};
  return state;
}

function startOvertime(state: GameState) {
  const random = seededRandom(`${state.seed}:overtime:${state.playNumber}`);
  const firstPossession: TeamSide = random() < 0.5 ? "home" : "away";
  state.period = 5;
  state.clock = 0;
  state.overtime = {
    round: 1,
    firstPossession,
    possessions: [],
    roundStartScore: { ...state.score },
  };
  startDrive(state, firstPossession, 75);
}

function endOvertimePossession(state: GameState) {
  if (!state.overtime) {
    return;
  }
  state.overtime.possessions.push(state.possession);
  if (state.overtime.possessions.length === 1) {
    startDrive(state, otherSide(state.possession), 75);
    return;
  }
  if (state.score.home !== state.score.away) {
    state.status = "final";
    return;
  }
  state.overtime.round += 1;
  state.overtime.firstPossession = otherSide(state.overtime.firstPossession);
  state.overtime.possessions = [];
  state.overtime.roundStartScore = { ...state.score };
  startDrive(state, state.overtime.firstPossession, 75);
}

function advanceClock(state: GameState, elapsed: number) {
  if (state.period >= 5 || state.status === "final") {
    return;
  }
  state.clock = Math.max(0, state.clock - elapsed);
  if (state.clock > 0) {
    return;
  }
  // A touchdown can create an untimed conversion even when the period clock expires.
  if (state.phase === "conversion") {
    return;
  }
  if (state.period === 1) {
    state.period = 2;
    state.clock = regulationSeconds(state);
    return;
  }
  if (state.period === 2) {
    state.period = 3;
    state.clock = regulationSeconds(state);
    startKickoff(state, state.secondHalfReceiver);
    return;
  }
  if (state.period === 3) {
    state.period = 4;
    state.clock = regulationSeconds(state);
    return;
  }
  if (state.score.home === state.score.away) {
    startOvertime(state);
  } else {
    state.status = "final";
  }
}

function getSkillPlayer(team: TeamConfig, position: "QB" | "RB" | "WR") {
  return (
    team.roster.offense.find((player) => player.position === position) ??
    team.roster.offense[0]
  );
}

function getSpecialist(team: TeamConfig, position: "K" | "P" | "LS" | "H") {
  return (
    team.roster.specialTeams?.find((player) => player.position === position) ??
    team.roster.offense[0]
  );
}

function absoluteFieldX(side: TeamSide, ballOn: number) {
  return clamp(side === "home" ? ballOn : 100 - ballOn, 0, 100);
}

interface SnapResult {
  outcome: PlayOutcome;
  yards: number;
  elapsed: number;
  summary: string;
  driveEnded?: boolean;
  isPass?: boolean;
  completed?: boolean;
  quarterback?: Player;
  receiver?: Player;
  runner?: Player;
  kicker?: Player;
  punter?: Player;
  returner?: Player;
  specialTeamsTackler?: Player;
  specialTeamsReplay?: SpecialTeamsReplay;
}

export function puntBlockChance(defensePlayId: DefensePlayId) {
  return defensePlayId === "punt-block" ? 0.03 : 0.0015;
}

export function fieldGoalBlockChance(defensePlayId: DefensePlayId) {
  if (defensePlayId === "field-goal-block") return 0.025;
  if (defensePlayId === "field-goal-safe") return 0.001;
  if (defensePlayId === "man-blitz") return 0.004;
  return 0.002;
}

const PUNT_RETURN_LANES = ["left", "middle", "right"] as const;

export function puntReturnSetupBonus(defensePlayId: DefensePlayId, puntLane: string) {
  if (defensePlayId === "punt-safe") return -2;
  if (defensePlayId === "punt-block") return -6;
  if (defensePlayId === "punt-return-middle") return 9;
  if (defensePlayId.startsWith("punt-return-")) {
    return defensePlayId.endsWith(puntLane) ? 8 : 2;
  }
  return -4;
}

function resolvePunt(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  defensePlayId: DefensePlayId,
): SnapResult {
  const team = getTeam(state, offense);
  const returnSide = otherSide(offense);
  const returnTeam = getTeam(state, returnSide);
  const punter = getSpecialist(team, "P");
  const returner = getSkillPlayer(returnTeam, "WR");
  const startingBall = state.ballOn;
  const startX = absoluteFieldX(offense, startingBall);
  state.stats[offense].punts += 1;
  if (random() < puntBlockChance(defensePlayId)) {
    const ballOn = clamp(startingBall + Math.round(normal(random) * 3), 1, 99);
    const blocker = pickDefender(returnTeam, random, "front");
    startDrive(state, returnSide, 100 - ballOn);
    return {
      outcome: "punt" as PlayOutcome,
      yards: ballOn - startingBall,
      elapsed: 10,
      summary: `${punter.name}'s punt is blocked by ${blocker.name} — ${returnTeam.abbreviation} takes over.`,
      driveEnded: true,
      punter,
      specialTeamsTackler: blocker,
      specialTeamsReplay: {
        kind: "punt",
        kickingSide: offense,
        receivingSide: returnSide,
        startX,
        flightX: absoluteFieldX(offense, ballOn),
        endX: absoluteFieldX(offense, ballOn),
        blocked: true,
      },
    };
  }
  const gross = clamp(Math.round(43 + normal(random) * 5), 25, 62);
  const landingSpot = state.ballOn + gross;
  if (landingSpot >= 100) {
    startDrive(state, returnSide, 20);
    return {
      outcome: "punt" as PlayOutcome,
      yards: 100 - startingBall,
      elapsed: 12,
      summary: `${punter.name} punts into the end zone. Touchback.`,
      driveEnded: true,
      punter,
      returner,
      specialTeamsReplay: {
        kind: "punt",
        kickingSide: offense,
        receivingSide: returnSide,
        startX,
        flightX: absoluteFieldX(offense, 100),
        endX: absoluteFieldX(returnSide, 20),
      },
    };
  }
  const puntLane = PUNT_RETURN_LANES[Math.floor(random() * PUNT_RETURN_LANES.length)];
  const returnYards = clamp(
    Math.round(7 + normal(random) * 4 + puntReturnSetupBonus(defensePlayId, puntLane)),
    0,
    38,
  );
  state.stats[returnSide].puntReturns += 1;
  state.stats[returnSide].puntReturnYards += returnYards;
  const newOffenseBall = clamp(100 - landingSpot + returnYards, 1, 80);
  const tackler = recordSpecialTeamsTackle(state, random, offense);
  startDrive(state, returnSide, newOffenseBall);
  return {
    outcome: "punt" as PlayOutcome,
    yards: gross - returnYards,
    elapsed: 13,
    summary: `${punter.name} punts ${gross} yards; ${returner.name} returns ${returnYards}. Tackle by ${tackler.name}.`,
    driveEnded: true,
    punter,
    returner,
    specialTeamsTackler: tackler,
    specialTeamsReplay: {
      kind: "punt",
      kickingSide: offense,
      receivingSide: returnSide,
      startX,
      flightX: absoluteFieldX(offense, landingSpot),
      endX: absoluteFieldX(returnSide, newOffenseBall),
    },
  };
}

const KICK_RETURN_MATCHUP: Record<
  "kick-return-left" | "kick-return-middle" | "kick-return-right",
  Record<"kick-deep-left" | "kick-deep-middle" | "kick-deep-right" | "squib-kick", number>
> = {
  "kick-return-left": { "kick-deep-left": -6, "kick-deep-middle": 2, "kick-deep-right": 8, "squib-kick": -3 },
  "kick-return-middle": { "kick-deep-left": 3, "kick-deep-middle": -6, "kick-deep-right": 3, "squib-kick": -4 },
  "kick-return-right": { "kick-deep-left": 8, "kick-deep-middle": 2, "kick-deep-right": -6, "squib-kick": -3 },
};

export function onsideRecoveryChance(returnPlayId: OffensePlayId) {
  return returnPlayId === "hands-team" ? 0.045 : 0.11;
}

function resolveKickoff(
  state: GameState,
  random: () => number,
  returnSide: TeamSide,
  returnPlayId: OffensePlayId,
  coveragePlayId: DefensePlayId,
): SnapResult {
  const kickingSide = otherSide(returnSide);
  const returnTeam = getTeam(state, returnSide);
  const kickingTeam = getTeam(state, kickingSide);
  const kicker = getSpecialist(kickingTeam, "K");
  const returner = getSkillPlayer(returnTeam, "RB");
  const startX = absoluteFieldX(kickingSide, 35);
  if (coveragePlayId === "onside-kick") {
    const kickingTeamRecovered = random() < onsideRecoveryChance(returnPlayId);
    const recoveryX = absoluteFieldX(kickingSide, 45);
    if (kickingTeamRecovered) {
      startDrive(state, kickingSide, 45);
    } else {
      startDrive(state, returnSide, 55);
    }
    return {
      outcome: "kickoff",
      yards: kickingTeamRecovered ? 0 : 55,
      elapsed: 6,
      summary: kickingTeamRecovered
        ? `${kicker.name}'s onside kick is recovered by ${kickingTeam.abbreviation}.`
        : `${kicker.name}'s onside kick is secured by ${returnTeam.abbreviation}.`,
      driveEnded: true,
      kicker,
      returner,
      specialTeamsReplay: {
        kind: "kickoff",
        kickingSide,
        receivingSide: returnSide,
        startX,
        flightX: recoveryX,
        endX: recoveryX,
        onside: true,
        kickingTeamRecovered,
      },
    };
  }
  if (returnPlayId === "touchback" && coveragePlayId !== "squib-kick") {
    startDrive(state, returnSide, 25);
    return {
      outcome: "kickoff",
      yards: 25,
      elapsed: 7,
      summary: `${kicker.name} kicks deep. ${returnTeam.abbreviation} takes the touchback at the 25.`,
      driveEnded: true,
      kicker,
      returner,
      specialTeamsReplay: {
        kind: "kickoff",
        kickingSide,
        receivingSide: returnSide,
        startX,
        flightX: absoluteFieldX(returnSide, 0),
        endX: absoluteFieldX(returnSide, 25),
      },
    };
  }
  const calledReturn = returnPlayId === "touchback" || returnPlayId === "hands-team"
    ? "kick-return-middle"
    : returnPlayId;
  const matchup = KICK_RETURN_MATCHUP[
    calledReturn as keyof typeof KICK_RETURN_MATCHUP
  ][coveragePlayId as keyof (typeof KICK_RETURN_MATCHUP)[keyof typeof KICK_RETURN_MATCHUP]] ?? 0;
  const base = coveragePlayId === "squib-kick" || returnPlayId === "hands-team" ? 22 : 25;
  const returnYards = clamp(Math.round(base + matchup + normal(random) * 5), 9, 100);
  state.stats[returnSide].kickReturns += 1;
  state.stats[returnSide].kickReturnYards += returnYards;
  if (returnYards >= 100) {
    state.score[returnSide] += 6;
    startConversion(state, returnSide);
    return {
      outcome: "touchdown",
      yards: 100,
      elapsed: 13,
      summary: `${returner.name} returns the kickoff for a ${returnTeam.abbreviation} touchdown.`,
      driveEnded: true,
      kicker,
      returner,
      specialTeamsReplay: {
        kind: "kickoff",
        kickingSide,
        receivingSide: returnSide,
        startX,
        flightX: absoluteFieldX(returnSide, coveragePlayId === "squib-kick" ? 18 : 1),
        endX: absoluteFieldX(returnSide, 100),
      },
    };
  }
  const tackler = recordSpecialTeamsTackle(state, random, kickingSide);
  startDrive(state, returnSide, returnYards);
  return {
    outcome: "kickoff",
    yards: returnYards,
    elapsed: 11,
    summary: `${returner.name} returns the kickoff to the ${returnYards}. Tackle by ${tackler.name}.`,
    driveEnded: true,
    kicker,
    returner,
    specialTeamsTackler: tackler,
    specialTeamsReplay: {
      kind: "kickoff",
      kickingSide,
      receivingSide: returnSide,
      startX,
      flightX: absoluteFieldX(returnSide, coveragePlayId === "squib-kick" ? 18 : 1),
      endX: absoluteFieldX(returnSide, returnYards),
    },
  };
}

function resolveConversion(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  offensePlayId: OffensePlayId,
  defensePlayId: DefensePlayId,
  offenseExecutionScore: number,
): SnapResult {
  const offenseTeam = getTeam(state, offense);
  const defenseTeam = getTeam(state, otherSide(offense));
  const ratingDiff = offenseTeam.rating - defenseTeam.rating;
  let outcome: PlayOutcome;
  let summary: string;
  let yards = 3;
  let kicker: Player | undefined;
  let specialTeamsReplay: SpecialTeamsReplay | undefined;
  if (offensePlayId === "extra-point") {
    kicker = getSpecialist(offenseTeam, "K");
    const blocked = random() < (defensePlayId === "kick-block" ? 0.015 : 0.001);
    const executionEffect = executionModifier(offenseExecutionScore) * 0.075;
    const made = !blocked && random() < clamp(0.955 + ratingDiff * 0.0015 + executionEffect, 0.76, 0.998);
    if (made) state.score[offense] += 1;
    outcome = "extra-point";
    summary = blocked
      ? `${kicker.name}'s extra point is blocked.`
      : `${kicker.name}'s extra point is ${made ? "good" : "no good"}.`;
    const direction = offense === "home" ? 1 : -1;
    const startX = absoluteFieldX(offense, state.ballOn);
    specialTeamsReplay = {
      kind: "extra-point",
      kickingSide: offense,
      receivingSide: otherSide(offense),
      startX,
      flightX: blocked ? clamp(startX + direction * 4, 0, 100) : absoluteFieldX(offense, 100),
      endX: blocked ? clamp(startX + direction * 4, 0, 100) : absoluteFieldX(offense, 100),
      made,
      blocked,
      missSide: !made && !blocked ? (random() < 0.5 ? "left" : "right") : undefined,
    };
  } else {
    const defensiveEffect = defensePlayId === "goal-line-defense" ? -0.12 : 0.12;
    const made = random() < clamp(0.48 + ratingDiff * 0.004 + defensiveEffect, 0.18, 0.78);
    if (made) state.score[offense] += 2;
    yards = made ? 3 : Math.floor(random() * 3);
    outcome = "two-point";
    summary = `${offenseTeam.abbreviation} two-point try ${made ? "is successful" : "fails"}.`;
  }
  if (state.period >= 5) {
    endOvertimePossession(state);
  } else {
    startKickoff(state, otherSide(offense));
  }
  return { outcome, yards, elapsed: 0, summary, driveEnded: true, kicker, specialTeamsReplay };
}

function fieldGoalProbability(distance: number, rating: number) {
  let base = 0.97;
  if (distance > 30) base = 0.92;
  if (distance > 40) base = 0.8;
  if (distance > 50) base = 0.61;
  if (distance > 55) base = 0.39;
  if (distance > 60) base = 0.16;
  return clamp(base + (rating - 82) * 0.006, 0.04, 0.99);
}

function resolveFieldGoal(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  defensePlayId: DefensePlayId,
  offenseExecutionScore: number,
): SnapResult {
  const team = getTeam(state, offense);
  const defense = otherSide(offense);
  const defenseTeam = getTeam(state, defense);
  const kicker = getSpecialist(team, "K");
  const distance = 117 - state.ballOn;
  const startX = absoluteFieldX(offense, state.ballOn);
  const direction = offense === "home" ? 1 : -1;
  state.stats[offense].fieldGoalsAttempted += 1;
  if (random() < fieldGoalBlockChance(defensePlayId)) {
    const blocker = pickDefender(defenseTeam, random, "front");
    const summary = `${kicker.name}'s field goal is blocked by ${blocker.name} from ${distance} yards.`;
    if (state.period >= 5) {
      endOvertimePossession(state);
    } else {
      startDrive(state, defense, clamp(100 - state.ballOn, 1, 99));
    }
    return {
      outcome: "field-goal" as PlayOutcome,
      yards: 0,
      elapsed: 5,
      summary,
      driveEnded: true,
      kicker,
      specialTeamsTackler: blocker,
      specialTeamsReplay: {
        kind: "field-goal",
        kickingSide: offense,
        receivingSide: defense,
        startX,
        flightX: clamp(startX + direction * 4, 0, 100),
        endX: clamp(startX + direction * 4, 0, 100),
        made: false,
        blocked: true,
      },
    };
  }
  const blockPenalty = defensePlayId === "field-goal-block" ? 0.01 : 0;
  const executionEffect = executionModifier(offenseExecutionScore) * 0.24;
  const made = random() < clamp(
    fieldGoalProbability(distance, kicker.rating) + executionEffect - blockPenalty,
    0.01,
    0.997,
  );
  if (made) {
    state.stats[offense].fieldGoalsMade += 1;
    state.score[offense] += 3;
    const summary = `${kicker.name}'s field goal is good from ${distance} yards.`;
    if (state.period >= 5) {
      endOvertimePossession(state);
    } else {
      startKickoff(state, otherSide(offense));
    }
    return {
      outcome: "field-goal" as PlayOutcome,
      yards: 0,
      elapsed: 6,
      summary,
      driveEnded: true,
      kicker,
      specialTeamsReplay: {
        kind: "field-goal",
        kickingSide: offense,
        receivingSide: defense,
        startX,
        flightX: absoluteFieldX(offense, 100),
        endX: absoluteFieldX(offense, 100),
        made: true,
        blocked: false,
      },
    };
  }
  const missSide = random() < 0.5 ? "left" : "right";
  const summary = `${kicker.name}'s field goal is no good from ${distance} yards.`;
  if (state.period >= 5) {
    endOvertimePossession(state);
  } else {
    startDrive(state, otherSide(offense), clamp(100 - state.ballOn, 1, 99));
  }
  return {
    outcome: "field-goal" as PlayOutcome,
    yards: 0,
    elapsed: 6,
    summary,
    driveEnded: true,
    kicker,
    specialTeamsReplay: {
      kind: "field-goal",
      kickingSide: offense,
      receivingSide: defense,
      startX,
      flightX: absoluteFieldX(offense, 100),
      endX: absoluteFieldX(offense, 100),
      made: false,
      blocked: false,
      missSide,
    },
  };
}

function resolveKneel(state: GameState, offense: TeamSide): SnapResult {
  const quarterback = getSkillPlayer(getTeam(state, offense), "QB");
  state.stats[offense].plays += 1;
  state.stats[offense].rushAttempts += 1;
  state.stats[offense].rushYards -= 1;
  const stats = playerStat(state, offense, quarterback);
  stats.rushAttempts += 1;
  stats.rushYards -= 1;
  return {
    outcome: "kneel",
    yards: -1,
    elapsed: 36,
    summary: `${quarterback.name} takes a knee.`,
    runner: quarterback,
  };
}

function resolveSpike(state: GameState, offense: TeamSide): SnapResult {
  const quarterback = getSkillPlayer(getTeam(state, offense), "QB");
  state.stats[offense].plays += 1;
  state.stats[offense].passAttempts += 1;
  playerStat(state, offense, quarterback).passAttempts += 1;
  return {
    outcome: "spike",
    yards: 0,
    elapsed: 2,
    summary: `${quarterback.name} spikes the ball to stop the clock.`,
    isPass: true,
    quarterback,
  };
}

function passResult(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  playId: "stick" | "mesh" | "four-verts",
  defensePlayId: DefensePlayId,
  ratingDiff: number,
  offenseExecutionScore: number,
  defenseExecutionScore: number,
): SnapResult {
  const profile = PASS_PROFILE[playId];
  const team = getTeam(state, offense);
  const quarterback = getSkillPlayer(team, "QB");
  const eligibleReceivers = team.roster.offense.filter((player) =>
    player.position === "WR" || player.position === "TE" || player.position === "RB"
  );
  const receiver = eligibleReceivers[Math.floor(random() * eligibleReceivers.length)] ??
    getSkillPlayer(team, "WR");
  const quarterbackStats = playerStat(state, offense, quarterback);
  const receiverStats = playerStat(state, offense, receiver);
  const edge = arcadeExecutionEdge(
    offenseExecutionScore,
    defenseExecutionScore,
    playId,
    defensePlayId,
    ratingDiff,
    normal(random) * 4.5,
  );
  const executionDifferential = edge / 100;
  const coverZero = defensePlayId === "cover-0";
  state.stats[offense].plays += 1;
  const pressure = clamp(
    profile.sack + (DEFENSE_PRESSURE[defensePlayId] ?? 0) -
      executionDifferential * (coverZero ? 0.19 : 0.11),
    0.006,
    coverZero ? 0.38 : 0.25,
  );
  if (random() < pressure) {
    const yards = -clamp(Math.round(6 + normal(random) * 2.5), 2, 13);
    state.stats[offense].sacksAllowed += 1;
    return {
      outcome: "sack" as PlayOutcome,
      yards,
      elapsed: 29,
      summary: `${quarterback.name} sacked for ${Math.abs(yards)} yards.`,
      isPass: true,
      completed: false,
      quarterback,
    };
  }
  state.stats[offense].passAttempts += 1;
  quarterbackStats.passAttempts += 1;
  receiverStats.targets += 1;
  const interception = clamp(
    profile.interception - executionDifferential *
      (playId === "four-verts" ? 0.055 : playId === "mesh" ? 0.035 : 0.018) +
      (coverZero && executionDifferential < 0 ? Math.abs(executionDifferential) * 0.08 : 0),
    0.004,
    playId === "stick" ? 0.045 : playId === "mesh" ? 0.085 : 0.14,
  );
  if (random() < interception) {
    state.stats[offense].interceptionsThrown += 1;
    quarterbackStats.interceptionsThrown += 1;
    return {
      outcome: "interception" as PlayOutcome,
      yards: clamp(yardageFromTable(playId, edge, random), 0, 30),
      elapsed: 15,
      summary: `${quarterback.name} pass intercepted.`,
      isPass: true,
      completed: false,
      quarterback,
      receiver,
    };
  }
  const completion = clamp(
    profile.completion + (DEFENSE_COVERAGE[defensePlayId] ?? 0) + executionDifferential * 0.25,
    playId === "stick" ? 0.42 : 0.2,
    playId === "stick" ? 0.96 : 0.92,
  );
  if (random() >= completion) {
    return {
      outcome: "incompletion" as PlayOutcome,
      yards: 0,
      elapsed: 7,
      summary: `${quarterback.name} incomplete for ${receiver.name}.`,
      isPass: true,
      completed: false,
      quarterback,
      receiver,
    };
  }
  state.stats[offense].completions += 1;
  quarterbackStats.completions += 1;
  const baseYards = yardageFromTable(playId, edge, random);
  const yards = clamp(
    baseYards,
    playId === "stick" ? -2 : -5,
    playId === "stick" ? 18 : playId === "mesh" ? 42 : 78,
  );
  state.stats[offense].passYards += yards;
  quarterbackStats.passYards += yards;
  receiverStats.receptions += 1;
  receiverStats.receivingYards += yards;
  return {
    outcome: "completion" as PlayOutcome,
    yards,
    elapsed: 28 + Math.round(random() * 8),
    summary: `${quarterback.name} complete to ${receiver.name} for ${yards} ${Math.abs(yards) === 1 ? "yard" : "yards"}.`,
    isPass: true,
    completed: true,
    quarterback,
    receiver,
  };
}

function runResult(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  playId: "run",
  defensePlayId: DefensePlayId,
  ratingDiff: number,
  offenseExecutionScore: number,
  defenseExecutionScore: number,
): SnapResult {
  const team = getTeam(state, offense);
  const runner = getSkillPlayer(team, "RB");
  state.stats[offense].plays += 1;
  state.stats[offense].rushAttempts += 1;
  const edge = arcadeExecutionEdge(
    offenseExecutionScore,
    defenseExecutionScore,
    playId,
    defensePlayId,
    ratingDiff,
    normal(random) * 4.5,
  );
  const executionDifferential = edge / 100;
  const volatile = defensePlayId === "cover-0";
  const baseYards = yardageFromTable("run", edge, random) +
    (volatile ? Math.round(normal(random) * 1.2) : 0);
  const yards = clamp(
    baseYards,
    -8,
    62,
  );
  state.stats[offense].rushYards += yards;
  const runnerStats = playerStat(state, offense, runner);
  runnerStats.rushAttempts += 1;
  runnerStats.rushYards += yards;
  const fumbleChance = clamp(
    0.006 - ratingDiff * 0.00012 - executionDifferential * 0.009 +
      (defensePlayId === "bear-front" ? 0.004 : 0),
    0.002,
    0.035,
  );
  const schemes = ["Inside Zone", "Outside Zone", "Power", "Counter", "Duo", "Split Zone"];
  const scheme = schemes[Math.floor(random() * schemes.length)];
  return {
    outcome: random() < fumbleChance ? ("fumble" as PlayOutcome) : ("run" as PlayOutcome),
    yards,
    elapsed: 31 + Math.round(random() * 8),
    summary: `${runner.name} on ${scheme} ${yards >= 0 ? "runs for" : "is stopped for"} ${Math.abs(yards)} ${Math.abs(yards) === 1 ? "yard" : "yards"}.`,
    isPass: false,
    completed: false,
    runner,
  };
}

function setScrimmageYards(
  state: GameState,
  offense: TeamSide,
  result: SnapResult,
  yards: number,
) {
  const nextYards = Math.round(yards);
  const delta = nextYards - result.yards;
  if (delta === 0) return;
  if (result.isPass && result.completed) {
    state.stats[offense].passYards += delta;
    if (result.quarterback) playerStat(state, offense, result.quarterback).passYards += delta;
    if (result.receiver) playerStat(state, offense, result.receiver).receivingYards += delta;
    result.summary = `${result.quarterback?.name ?? "Quarterback"} complete to ${result.receiver?.name ?? "receiver"} for ${nextYards} ${nextYards === 1 ? "yard" : "yards"}.`;
  } else if (!result.isPass && result.runner) {
    state.stats[offense].rushYards += delta;
    playerStat(state, offense, result.runner).rushYards += delta;
    result.summary = `${result.runner.name} runs for ${nextYards} ${nextYards === 1 ? "yard" : "yards"}.`;
  }
  result.yards = nextYards;
}

function applyBreakawayAndGoalLineCap(
  state: GameState,
  random: () => number,
  offense: TeamSide,
  result: SnapResult,
  startingBall: number,
  offenseExecutionScore: number,
  defenseExecutionScore: number,
  offensePlayId: OffensePlayId,
  defensePlayId: DefensePlayId,
) {
  if (!(["run", "completion"] as PlayOutcome[]).includes(result.outcome) || result.yards <= 0) return;
  const distanceToGoal = Math.max(1, 100 - startingBall);
  const executionDifferential = (offenseExecutionScore - defenseExecutionScore) / 100;
  const conceptChance = offensePlayId === "four-verts" ? 0.045
    : offensePlayId === "mesh" ? 0.018
      : offensePlayId === "stick" ? 0.003
        : 0.012;
  const coverZeroBreak = defensePlayId === "cover-0" && executionDifferential > 0.22
    ? (offensePlayId === "four-verts" ? 0.16 : offensePlayId === "mesh" ? 0.09 : 0.03)
    : 0;
  const maximumChance = offensePlayId === "four-verts" ? 0.4
    : offensePlayId === "mesh" ? 0.22
      : offensePlayId === "stick" ? 0.055
        : 0.18;
  const explosiveChance = clamp(
    conceptChance + coverZeroBreak +
      (result.yards >= 20 ? 0.06 : result.yards >= 10 ? 0.025 : result.yards >= 6 ? 0.01 : 0) +
      Math.max(-0.02, executionDifferential * 0.1) +
      Math.max(-0.015, matchupAdvantage(offensePlayId, defensePlayId) * 0.0015),
    0.002,
    maximumChance,
  );
  if (result.yards < distanceToGoal && random() < explosiveChance) {
    setScrimmageYards(state, offense, result, distanceToGoal);
    return;
  }
  if (result.yards > distanceToGoal) setScrimmageYards(state, offense, result, distanceToGoal);
}

export function clockAccelerationFor(period: number, clock: number) {
  if ((period === 2 || period === 4) && clock <= 120) return TWO_MINUTE_CLOCK_ACCELERATION;
  if ((period === 2 || period === 4) && clock <= 300) return 0.94;
  return CLOCK_ACCELERATION;
}

function defenderPool(team: TeamConfig, kind: "front" | "coverage" | "tackle", yards = 0) {
  const front = new Set(["DE", "DT", "DL", "LB"]);
  const coverage = new Set(["CB", "FS", "SS", "DB", "LB"]);
  const preferred = team.roster.defense.filter((player) => {
    if (kind === "front") return front.has(player.position);
    if (kind === "coverage") return coverage.has(player.position);
    return (yards <= 5 ? front : coverage).has(player.position);
  });
  return preferred.length ? preferred : team.roster.defense;
}

function pickDefender(
  team: TeamConfig,
  random: () => number,
  kind: "front" | "coverage" | "tackle",
  yards = 0,
) {
  const pool = defenderPool(team, kind, yards);
  return pool[Math.floor(random() * pool.length)] ?? team.roster.defense[0];
}

function recordTackle(
  state: GameState,
  random: () => number,
  defense: TeamSide,
  yards: number,
) {
  const team = getTeam(state, defense);
  const primary = pickDefender(team, random, "tackle", yards);
  const secondaryPool = team.roster.defense.filter((player) => player.id !== primary.id);
  const secondary = random() < 0.28
    ? secondaryPool[Math.floor(random() * secondaryPool.length)]
    : undefined;
  const primaryStats = playerStat(state, defense, primary);
  primaryStats.tackles += 1;
  if (secondary) {
    primaryStats.assistedTackles += 1;
    const secondaryStats = playerStat(state, defense, secondary);
    secondaryStats.tackles += 1;
    secondaryStats.assistedTackles += 1;
  } else {
    primaryStats.soloTackles += 1;
  }
  if (yards < 0) primaryStats.tacklesForLoss += 1;
  return {
    primary,
    ids: secondary ? [primary.id, secondary.id] : [primary.id],
    detail: secondary
      ? `Tackle by ${primary.name}; ${secondary.name} assists.`
      : `Tackle by ${primary.name}.`,
  };
}

function recordSpecialTeamsTackle(
  state: GameState,
  random: () => number,
  tacklingSide: TeamSide,
) {
  const team = getTeam(state, tacklingSide);
  const pool = team.roster.defense.filter((player) => ["LB", "CB", "FS", "SS", "DE"].includes(player.position));
  const tackler = pool[Math.floor(random() * pool.length)] ?? team.roster.defense[0];
  const stats = playerStat(state, tacklingSide, tackler);
  stats.tackles += 1;
  stats.soloTackles += 1;
  return tackler;
}

function recordDefensiveStats(
  state: GameState,
  random: () => number,
  defense: TeamSide,
  result: SnapResult,
  outcome: PlayOutcome,
): { participants: PlayParticipants; detail: string } {
  const team = getTeam(state, defense);
  if (result.outcome === "interception") {
    const defender = pickDefender(team, random, "coverage");
    playerStat(state, defense, defender).interceptions += 1;
    return {
      participants: { interceptionById: defender.id, coverageDefenderId: defender.id },
      detail: `Intercepted by ${defender.name}.`,
    };
  }
  if (result.outcome === "sack") {
    const defender = pickDefender(team, random, "front");
    const stats = playerStat(state, defense, defender);
    stats.tackles += 1;
    stats.soloTackles += 1;
    stats.tacklesForLoss += 1;
    stats.sacks += 1;
    return {
      participants: { tacklerIds: [defender.id], sackById: defender.id },
      detail: `Sack by ${defender.name}.`,
    };
  }
  if (result.outcome === "incompletion") {
    const defender = pickDefender(team, random, "coverage");
    if (random() >= 0.62) {
      return { participants: { coverageDefenderId: defender.id }, detail: "" };
    }
    playerStat(state, defense, defender).passBreakups += 1;
    return {
      participants: { passBreakupById: defender.id, coverageDefenderId: defender.id },
      detail: `Broken up by ${defender.name}.`,
    };
  }
  if (result.outcome === "fumble") {
    const tackle = recordTackle(state, random, defense, result.yards);
    playerStat(state, defense, tackle.primary).forcedFumbles += 1;
    return {
      participants: {
        tacklerIds: tackle.ids,
        forcedFumbleById: tackle.primary.id,
      },
      detail: `${tackle.detail.replace(/\.$/, "")} Forced by ${tackle.primary.name}.`,
    };
  }
  if ((result.outcome === "run" || result.outcome === "completion") && outcome !== "touchdown") {
    const tackle = recordTackle(state, random, defense, result.yards);
    return { participants: { tacklerIds: tackle.ids }, detail: tackle.detail };
  }
  return { participants: {}, detail: "" };
}

export function resolveSnap(
  current: GameState,
  requestedOffensePlayId: OffensePlayId,
  requestedDefensePlayId: DefensePlayId,
  requestedOffenseExecutionScore: number = DEFAULT_EXECUTION_SCORE,
  requestedDefenseExecutionScore: number = DEFAULT_EXECUTION_SCORE,
): Resolution {
  upgradeGameState(current);
  if (current.status !== "active") {
    throw new Error("This game is already final.");
  }
  const conceptPhase = current.phase === "scrimmage" ||
    (current.phase === "conversion" && Boolean(current.twoPointAttempt));
  const offensePlayId = conceptPhase
    ? normalizeOffenseConcept(requestedOffensePlayId)
    : requestedOffensePlayId;
  const defensePlayId = conceptPhase
    ? normalizeDefenseConcept(requestedDefensePlayId)
    : requestedDefensePlayId;
  if (!getAvailableOffensePlayIds(current).includes(offensePlayId)) {
    throw new Error("That offensive call is unavailable in this situation.");
  }
  if (!getAvailableDefensePlayIds(current).includes(defensePlayId)) {
    throw new Error("That defensive call is unavailable in this situation.");
  }
  const state = cloneState(current);
  const offense = state.possession;
  const defense = otherSide(offense);
  const offenseTeam = getTeam(state, offense);
  const defenseTeam = getTeam(state, defense);
  const clockBefore = state.clock;
  const phaseBefore = state.phase;
  const twoPointSnap = phaseBefore === "conversion" && Boolean(state.twoPointAttempt);
  const usesOffenseExecution = playUsesExecutionMeter(offensePlayId);
  const usesDefenseExecution = conceptPhase && playUsesExecutionMeter(defensePlayId);
  const offenseExecutionScore = usesOffenseExecution
    ? clampExecutionScore(requestedOffenseExecutionScore)
    : DEFAULT_EXECUTION_SCORE;
  const defenseExecutionScore = usesDefenseExecution
    ? clampExecutionScore(requestedDefenseExecutionScore)
    : DEFAULT_EXECUTION_SCORE;
  const startingDriveNumber = state.driveNumber;
  const startingBall = phaseBefore === "kickoff" ? 0 : state.ballOn;
  const startingDown = state.down;
  const startingToGo = state.toGo;
  const random = seededRandom(
    `${state.seed}:${state.playNumber + 1}:${offensePlayId}:${defensePlayId}`,
  );
  const conceptRatings = conceptPhase
    ? conceptUnitRatings(offenseTeam, defenseTeam, offensePlayId)
    : { offense: offenseTeam.rating, defense: defenseTeam.rating };
  const ratingDiff = conceptRatings.offense - conceptRatings.defense;
  const statsBeforeTwoPoint = twoPointSnap ? cloneState(state).stats : null;
  const playerStatsBeforeTwoPoint = twoPointSnap ? cloneState(state).playerStats : null;
  state.playNumber += 1;

  let result: SnapResult;

  if (phaseBefore === "kickoff") {
    result = resolveKickoff(state, random, offense, offensePlayId, defensePlayId);
  } else if (phaseBefore === "conversion" && !twoPointSnap) {
    result = resolveConversion(state, random, offense, offensePlayId, defensePlayId, offenseExecutionScore);
  } else if (offensePlayId === "punt") {
    result = resolvePunt(state, random, offense, defensePlayId);
  } else if (offensePlayId === "field-goal") {
    result = resolveFieldGoal(state, random, offense, defensePlayId, offenseExecutionScore);
  } else if (offensePlayId === "kneel") {
    result = resolveKneel(state, offense);
  } else if (offensePlayId === "spike") {
    result = resolveSpike(state, offense);
  } else if (offensePlayId === "stick" || offensePlayId === "mesh" || offensePlayId === "four-verts") {
    result = passResult(
      state,
      random,
      offense,
      offensePlayId,
      defensePlayId,
      ratingDiff,
      offenseExecutionScore,
      defenseExecutionScore,
    );
  } else {
    result = runResult(
      state,
      random,
      offense,
      "run",
      defensePlayId,
      ratingDiff,
      offenseExecutionScore,
      defenseExecutionScore,
    );
  }

  if (conceptPhase && !result.driveEnded) {
    applyBreakawayAndGoalLineCap(
      state,
      random,
      offense,
      result,
      startingBall,
      offenseExecutionScore,
      defenseExecutionScore,
      offensePlayId,
      defensePlayId,
    );
  }

  if (twoPointSnap) {
    if (statsBeforeTwoPoint) state.stats = statsBeforeTwoPoint;
    if (playerStatsBeforeTwoPoint) state.playerStats = playerStatsBeforeTwoPoint;
    const made = (result.outcome === "run" || result.outcome === "completion") && result.yards >= 3;
    if (made) state.score[offense] += 2;
    result.outcome = "two-point";
    result.yards = made ? 3 : Math.min(2, result.yards);
    result.elapsed = 0;
    result.summary = `${result.summary.replace(/\.$/, "")} Two-point try ${made ? "is good" : "fails"}.`;
    result.driveEnded = true;
    state.twoPointAttempt = false;
    if (state.period >= 5) endOvertimePossession(state);
    else startKickoff(state, otherSide(offense));
  }

  let outcome = result.outcome;
  let summary = result.summary;
  const participants: PlayParticipants = {
    passerId: result.quarterback?.id,
    runnerId: result.runner?.id,
    receiverId: result.receiver?.id,
    kickerId: result.kicker?.id,
    punterId: result.punter?.id,
    returnerId: result.returner?.id,
    specialTeamsTacklerId: result.specialTeamsTackler?.id,
  };

  if (!result.driveEnded) {
    const rawNewBall = startingBall + result.yards;
    if (result.outcome === "interception" || result.outcome === "fumble") {
      if (result.outcome === "fumble") {
        state.stats[offense].fumblesLost += 1;
        summary = `${summary.replace(/\.$/, "")} Fumble recovered by ${defenseTeam.abbreviation}.`;
      }
      const returnYards = clamp(Math.round(7 + normal(random) * 7), 0, 35);
      const turnoverSpot = clamp(rawNewBall, 1, 99);
      if (state.period >= 5) {
        endOvertimePossession(state);
      } else {
        startDrive(state, defense, clamp(100 - turnoverSpot + returnYards, 1, 99));
      }
    } else if (rawNewBall >= 100) {
      state.score[offense] += 6;
      outcome = "touchdown";
      summary = `${summary.replace(/\.$/, "")} Touchdown ${offenseTeam.abbreviation}.`;
      if (result.isPass) {
        state.stats[offense].passTouchdowns += 1;
        if (result.quarterback) playerStat(state, offense, result.quarterback).passTouchdowns += 1;
        if (result.receiver) playerStat(state, offense, result.receiver).receivingTouchdowns += 1;
      } else {
        state.stats[offense].rushTouchdowns += 1;
        if (result.runner) playerStat(state, offense, result.runner).rushTouchdowns += 1;
      }
      startConversion(state, offense);
    } else if (rawNewBall <= 0) {
      state.score[defense] += 2;
      outcome = "safety";
      summary = `${summary.replace(/\.$/, "")} Safety for ${defenseTeam.abbreviation}.`;
      if (state.period >= 5) {
        endOvertimePossession(state);
      } else {
        startKickoff(state, defense);
      }
    } else {
      state.ballOn = clamp(rawNewBall, 1, 99);
      if (result.yards >= startingToGo) {
        state.down = 1;
        state.toGo = Math.min(10, 100 - state.ballOn);
        state.stats[offense].firstDowns += 1;
      } else if (startingDown === 4) {
        outcome = "turnover-on-downs";
        summary = `${summary.replace(/\.$/, "")} Turnover on downs.`;
        if (state.period >= 5) {
          endOvertimePossession(state);
        } else {
          startDrive(state, defense, 100 - state.ballOn);
        }
      } else {
        state.down = startingDown + 1;
        state.toGo = Math.min(100 - state.ballOn, Math.max(1, startingToGo - result.yards));
      }
    }
  }

  if (!twoPointSnap) {
    const defensiveRecord = recordDefensiveStats(
      state,
      random,
      defense,
      result,
      outcome,
    );
    Object.assign(participants, defensiveRecord.participants);
    if (defensiveRecord.detail) {
      summary = `${summary.replace(/\.$/, "")} ${defensiveRecord.detail}`;
    }
  }

  const elapsedSeconds = state.period >= 5
    ? 0
    : Math.min(clockBefore, Math.round(result.elapsed * clockAccelerationFor(state.period, clockBefore)));
  if (phaseBefore !== "kickoff" && phaseBefore !== "conversion") {
    state.stats[offense].timeOfPossessionSeconds += elapsedSeconds;
  }
  advanceClock(state, elapsedSeconds);
  state.pending = {};

  const entry: PlayLogEntry = {
    number: state.playNumber,
    driveNumber: phaseBefore === "kickoff"
      ? state.driveNumber
      : Math.max(1, startingDriveNumber),
    period: current.period,
    clockBefore,
    elapsedSeconds,
    offense,
    offensePlayId,
    defensePlayId,
    offensePlayName: offensePlayById[offensePlayId].name,
    defensePlayName: defensePlayById[defensePlayId].name,
    outcome,
    yards: result.yards,
    ballOnBefore: startingBall,
    summary,
    scoreAfter: { ...state.score },
    downAfter: state.down,
    toGoAfter: state.toGo,
    ballOnAfter: state.ballOn,
    possessionAfter: state.possession,
    participants,
    specialTeamsReplay: result.specialTeamsReplay,
    offenseExecutionScore: usesOffenseExecution ? offenseExecutionScore : undefined,
    defenseExecutionScore: usesDefenseExecution ? defenseExecutionScore : undefined,
    executionScore: usesOffenseExecution ? offenseExecutionScore : undefined,
  };
  state.playLog.push(entry);
  return { state, entry };
}

export function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export function formatPeriod(state: Pick<GameState, "period" | "overtime">) {
  if (state.period <= 4) {
    return `Q${state.period}`;
  }
  return `OT${state.overtime?.round ?? state.period - 4}`;
}

export function formatFieldPosition(state: GameState) {
  const offense = getTeam(state, state.possession);
  const defense = getTeam(state, otherSide(state.possession));
  if (state.ballOn === 50) return "50";
  if (state.ballOn < 50) return `${offense.abbreviation} ${state.ballOn}`;
  return `${defense.abbreviation} ${100 - state.ballOn}`;
}
