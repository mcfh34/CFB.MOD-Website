import type {
  DefensePlayId,
  GameDifficulty,
  OffensePlayId,
  Player,
  TeamConfig,
} from "./types";

export const DEFAULT_EXECUTION_SCORE = 55;
export const PERFECT_EXECUTION_MULTIPLIER = 1.24;
export const MISTIMED_EXECUTION_MULTIPLIER = 0.76;

const TIMED_PLAYS = new Set<OffensePlayId | DefensePlayId>([
  "run",
  "stick",
  "mesh",
  "four-verts",
  "bear-front",
  "cover-2",
  "cover-4",
  "cover-0",
  "field-goal",
  "extra-point",
]);

const LEGACY_TIMED_OFFENSE_PLAYS = new Set<OffensePlayId>([
  "inside-zone", "power", "outside-zone", "counter", "rpo",
  "quick-pass", "dropback", "play-action", "screen",
]);

const BASE_DURATION: Record<GameDifficulty, number> = {
  easy: 1.4,
  hard: 0.84,
  impossible: 0.46,
};

// Neutral matchups produce approximately 40 ms, 15 ms, and 5 ms Perfect
// windows. Easy therefore matches stopping a stopwatch from 0.98–1.02.
const BASE_SCORE_EXPONENT: Record<GameDifficulty, number> = {
  easy: 5.4,
  hard: 8.7,
  impossible: 14.3,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function average(players: Player[], fallback: number) {
  if (!players.length) return fallback;
  return players.reduce((sum, player) => sum + player.rating, 0) / players.length;
}

function ratingFor(team: TeamConfig, positions: ReadonlySet<string>, unit: "offense" | "defense") {
  return average(team.roster[unit].filter((player) => positions.has(player.position)), team.rating);
}

const LINE = new Set(["LT", "LG", "C", "RG", "RT", "OL"]);
const FRONT = new Set(["DE", "DT", "DL", "LB"]);
const COVERAGE = new Set(["LB", "CB", "FS", "SS", "DB"]);
const RECEIVERS = new Set(["WR", "TE", "RB"]);

function weighted(values: Array<[number, number]>) {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0);
  return values.reduce((sum, [value, weight]) => sum + value * weight, 0) / total;
}

export function conceptUnitRatings(
  offense: TeamConfig,
  defense: TeamConfig,
  conceptId: OffensePlayId | DefensePlayId,
) {
  const quarterback = ratingFor(offense, new Set(["QB"]), "offense");
  const back = ratingFor(offense, new Set(["RB"]), "offense");
  const line = ratingFor(offense, LINE, "offense");
  const receivers = ratingFor(offense, RECEIVERS, "offense");
  const front = ratingFor(defense, FRONT, "defense");
  const coverage = ratingFor(defense, COVERAGE, "defense");

  if (conceptId === "run" || conceptId === "bear-front") {
    return { offense: weighted([[line, 0.58], [back, 0.42]]), defense: front };
  }
  if (conceptId === "stick" || conceptId === "cover-2") {
    return {
      offense: weighted([[quarterback, 0.48], [receivers, 0.52]]),
      defense: weighted([[coverage, 0.76], [front, 0.24]]),
    };
  }
  if (conceptId === "mesh") {
    return {
      offense: weighted([[quarterback, 0.45], [receivers, 0.55]]),
      defense: weighted([[coverage, 0.68], [front, 0.32]]),
    };
  }
  if (conceptId === "cover-4") {
    return {
      offense: weighted([[quarterback, 0.42], [receivers, 0.58]]),
      defense: weighted([[coverage, 0.84], [front, 0.16]]),
    };
  }
  return {
    offense: weighted([[quarterback, 0.38], [receivers, 0.37], [line, 0.25]]),
    defense: weighted([[coverage, 0.58], [front, 0.42]]),
  };
}

export function playUsesExecutionMeter(playId: OffensePlayId | DefensePlayId) {
  return TIMED_PLAYS.has(playId) || LEGACY_TIMED_OFFENSE_PLAYS.has(playId as OffensePlayId);
}

/** Execution is stored on a continuous 0–100 scale. */
export function clampExecutionScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return DEFAULT_EXECUTION_SCORE;
  return clamp(numeric, 0, 100);
}

function scoreExponent(difficulty: GameDifficulty, precision: number) {
  return BASE_SCORE_EXPONENT[difficulty] * clamp(precision, 0.85, 1.25);
}

/** Maps a one-way marker position to a continuous 0–100 center-accuracy score. */
export function timingScoreForPosition(
  position: number,
  precision = 1,
  difficulty: GameDifficulty = "easy",
) {
  const linear = clamp(1 - Math.abs(clamp(position, 0, 1) - 0.5) * 2, 0, 1);
  return clamp(Math.pow(linear, scoreExponent(difficulty, precision)) * 100, 0, 100);
}

export function executionModifier(value: unknown) {
  const score = clampExecutionScore(value);
  return score >= DEFAULT_EXECUTION_SCORE
    ? (score - DEFAULT_EXECUTION_SCORE) / (100 - DEFAULT_EXECUTION_SCORE)
    : (score - DEFAULT_EXECUTION_SCORE) / DEFAULT_EXECUTION_SCORE;
}

export function executionMultiplier(value: unknown) {
  const modifier = executionModifier(value);
  const range = modifier >= 0
    ? PERFECT_EXECUTION_MULTIPLIER - 1
    : 1 - MISTIMED_EXECUTION_MULTIPLIER;
  return 1 + modifier * range;
}

export function executionGrade(value: unknown) {
  const score = Math.round(clampExecutionScore(value));
  if (score >= 86) return { label: "PERFECT", tier: "perfect" } as const;
  if (score >= 66) return { label: "GREAT", tier: "great" } as const;
  if (score >= 41) return { label: "GOOD", tier: "good" } as const;
  if (score >= 21) return { label: "FAIR", tier: "fair" } as const;
  return { label: "POOR", tier: "poor" } as const;
}

export function meterSettings(
  difficulty: GameDifficulty,
  role: "offense" | "defense",
  offense: TeamConfig,
  defense: TeamConfig,
  conceptId: OffensePlayId | DefensePlayId,
  kickDistanceYards?: number,
) {
  if (conceptId === "field-goal" || conceptId === "extra-point") {
    const kicker = offense.roster.specialTeams?.find((player) => player.position === "K");
    const kickerRating = kicker?.rating ?? offense.rating;
    const distance = conceptId === "extra-point" ? 20 : clamp(kickDistanceYards ?? 45, 17, 70);
    const distancePressure = Math.max(0, distance - 30);
    const matchupModifier = clamp(
      1 + (kickerRating - 82) * 0.008 - distancePressure * 0.0045,
      0.7,
      1.22,
    );
    const precision = clamp(
      1 + (82 - kickerRating) * 0.007 + distancePressure * 0.004,
      0.86,
      1.28,
    );
    return {
      durationSeconds: BASE_DURATION[difficulty] * matchupModifier,
      precision,
      matchupModifier,
    };
  }
  const ratings = conceptUnitRatings(offense, defense, conceptId);
  const opponentEdge = role === "offense"
    ? ratings.defense - ratings.offense
    : ratings.offense - ratings.defense;
  const matchupModifier = clamp(1 - opponentEdge * 0.011, 0.8, 1.2);
  const precision = clamp(1 + opponentEdge * 0.008, 0.88, 1.16);
  return {
    durationSeconds: BASE_DURATION[difficulty] * matchupModifier,
    precision,
    matchupModifier,
  };
}

export function meterZoneStops(precision: number, difficulty: GameDifficulty = "easy") {
  const exponent = scoreExponent(difficulty, precision);
  const leftForScore = (score: number) => 50 * Math.pow(score / 100, 1 / exponent);
  return {
    poor: leftForScore(20.5),
    fair: leftForScore(40.5),
    good: leftForScore(65.5),
    perfect: leftForScore(85.5),
  };
}
