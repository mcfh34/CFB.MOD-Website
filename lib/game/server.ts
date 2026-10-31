import {
  beginTwoPointAttempt,
  getAvailableDefensePlayIds,
  getAvailableOffensePlayIds,
  normalizeDefenseConcept,
  normalizeOffenseConcept,
  otherSide,
  resolveSnap,
  upgradeGameState,
} from "./engine";
import { defensePlayIds, offensePlayIds } from "./playbook";
import {
  clampExecutionScore,
  DEFAULT_EXECUTION_SCORE,
  playUsesExecutionMeter,
} from "./execution";
import { TEAM_BY_ID, TEAM_BY_NAME, teamInputFromDefinition } from "./teams";
import { resolveTeamLogoAsset } from "../teamLogoAssets";
import type {
  DefensePlayId,
  GameState,
  GameView,
  OffensePlayId,
  TeamInput,
  TeamSide,
} from "./types";
import type { StoredGame } from "@/db/game-store";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

export function createSeatToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateTeamInput(value: unknown, fallback: TeamInput): TeamInput {
  if (!value || typeof value !== "object") {
    throw new Error("Both teams are required.");
  }
  const candidate = value as Partial<TeamInput>;
  const definition =
    (candidate.teamId ? TEAM_BY_ID.get(candidate.teamId) : undefined) ??
    (candidate.name ? TEAM_BY_NAME.get(candidate.name.trim()) : undefined);
  const rating = Number(candidate.rating ?? fallback.rating ?? 82);
  if (!Number.isFinite(rating) || rating < 60 || rating > 99) {
    throw new Error("Team strength must be between 60 and 99.");
  }
  const validated: TeamInput = definition
    ? teamInputFromDefinition(definition,Math.round(rating))
    : typeof candidate.name === "string" && candidate.name.trim()
      ? {
          teamId:String(candidate.teamId??candidate.name),name:candidate.name.trim(),mascot:String(candidate.mascot??""),
          abbreviation:String(candidate.abbreviation??candidate.name.slice(0,3)).slice(0,6).toUpperCase(),
          conference:String(candidate.conference??"Independent").slice(0,80),primaryColor:"#1F5132",secondaryColor:"#FFFFFF",logo:"",rating:Math.round(rating),
        }
      : teamInputFromDefinition(TEAM_BY_ID.get(fallback.teamId)!,Math.round(rating));
  const safeText = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
  const suppliedName = safeText(candidate.name, 80);
  if (suppliedName) validated.name = suppliedName;
  const suppliedMascot = safeText(candidate.mascot, 80);
  if (suppliedMascot || candidate.mascot === "") validated.mascot = suppliedMascot;
  const suppliedAbbreviation = safeText(candidate.abbreviation, 6).toUpperCase();
  if (suppliedAbbreviation) validated.abbreviation = suppliedAbbreviation;
  const suppliedConference = safeText(candidate.conference, 80);
  if (suppliedConference) validated.conference = suppliedConference;
  const suppliedTeamId = safeText(candidate.teamId, 100);
  if (suppliedTeamId) validated.teamId = suppliedTeamId;
  const suppliedRanking = Number(candidate.ranking);
  if (Number.isInteger(suppliedRanking) && suppliedRanking >= 1 && suppliedRanking <= 25) {
    validated.ranking = suppliedRanking;
  }
  const suppliedRecord = safeText(candidate.record, 20);
  if (suppliedRecord) validated.record = suppliedRecord;
  if (candidate.roster && typeof candidate.roster === "object") {
    const roster = candidate.roster as TeamInput["roster"];
    const validPlayer = (player: unknown) => {
      if (!player || typeof player !== "object") return false;
      const item = player as { id?:unknown;name?:unknown;number?:unknown;position?:unknown;rating?:unknown };
      return typeof item.id === "string" && typeof item.name === "string" &&
        Number.isFinite(Number(item.number)) && typeof item.position === "string" &&
        Number.isFinite(Number(item.rating));
    };
    if (roster?.offense?.length === 11 && roster.defense?.length === 11 &&
      roster.offense.every(validPlayer) && roster.defense.every(validPlayer) &&
      (roster.specialTeams?.every(validPlayer) ?? true)) {
      validated.roster = roster;
    }
  }
  const scoresLogo = resolveTeamLogoAsset(validated.name);
  if (scoresLogo) validated.logo = scoresLogo;
  else if (typeof candidate.logo === "string" && candidate.logo.length <= 500) validated.logo = candidate.logo;
  if (typeof candidate.primaryColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.primaryColor)) validated.primaryColor = candidate.primaryColor;
  if (typeof candidate.secondaryColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.secondaryColor)) validated.secondaryColor = candidate.secondaryColor;
  return validated;
}

export function parseSeat(value: string | null): TeamSide | null {
  return value === "home" || value === "away" ? value : null;
}

export function tokenMatches(stored: StoredGame, seat: TeamSide, token: string) {
  return seat === "home" ? stored.homeToken === token : stored.awayToken === token;
}

export function roleForSeat(state: GameState, seat: TeamSide) {
  upgradeGameState(state);
  return state.possession === seat ? "offense" : "defense";
}

type CoordinatorRole = "offense" | "defense";
type AnyPlayId = OffensePlayId | DefensePlayId;
type CpuWeights = Partial<Record<AnyPlayId, number>>;

function cpuRandom(state: GameState) {
  const source = `${state.seed}:cpu:${state.playNumber}:${state.period}:${state.clock}:${state.down}:${state.toGo}:${state.ballOn}`;
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function addWeight(weights: CpuWeights, playId: AnyPlayId, value: number) {
  weights[playId] = Math.max(0, (weights[playId] ?? 0) + value);
}

export function cpuShouldGoForTwo(state: GameState) {
  if (state.phase !== "conversion") return false;
  if (state.period >= 5) return (state.overtime?.round ?? 1) >= 2;
  if (state.period < 4 || state.clock > 360) return false;
  const differential = state.score[state.possession] - state.score[otherSide(state.possession)];
  return [-8, -5, -2, 1, 5].includes(differential);
}

export function getCpuFourthDownDecision(state: GameState): OffensePlayId | null {
  if (state.phase !== "scrimmage" || state.down !== 4) return null;
  const available = new Set(getAvailableOffensePlayIds(state));
  const differential = state.score[state.possession] - state.score[otherSide(state.possession)];
  const lateAndTrailing = state.period === 4 && state.clock <= 360 && differential < 0;
  const fieldGoalDistance = 117 - state.ballOn;
  if (
    available.has("field-goal") &&
    fieldGoalDistance <= 55 &&
    (!lateAndTrailing || (differential >= -3 && state.clock > 45)) &&
    (state.ballOn >= 62 || state.toGo >= 4)
  ) {
    return "field-goal";
  }
  if (
    available.has("punt") &&
    !lateAndTrailing &&
    (state.ballOn < 50 || (state.ballOn < 60 && state.toGo >= 3))
  ) {
    return "punt";
  }
  return null;
}

export function getCpuPlayWeights(state: GameState, role: CoordinatorRole): CpuWeights {
  upgradeGameState(state);
  const weights: CpuWeights = {};
  if (role === "offense") {
    const available = new Set(getAvailableOffensePlayIds(state));
    if (state.phase === "conversion" && !state.twoPointAttempt) {
      const goForTwo = cpuShouldGoForTwo(state);
      addWeight(weights, "extra-point", goForTwo ? 1 : 18);
      addWeight(weights, "two-point", goForTwo ? 18 : 2);
      return weights;
    }
    if (state.phase === "kickoff") {
      const kickingSide = otherSide(state.possession);
      const expectOnside = state.period === 4 && state.clock <= 180 &&
        state.score[kickingSide] < state.score[state.possession];
      addWeight(weights, "kick-return-left", 3);
      addWeight(weights, "kick-return-middle", 4);
      addWeight(weights, "kick-return-right", 3);
      addWeight(weights, "touchback", 4);
      addWeight(weights, "hands-team", expectOnside ? 16 : 0.5);
      return weights;
    }
    const short = state.toGo <= 3;
    const long = state.toGo >= 8;
    const normal: Partial<Record<OffensePlayId, number>> = short
      ? { run: 9, stick: 4, mesh: 2, "four-verts": 1 }
      : long
        ? { run: 1, stick: 5, mesh: 7, "four-verts": 5 }
        : { run: 4, stick: 5, mesh: 4, "four-verts": 3 };
    const lateAndTrailing = state.period === 4 && state.clock <= 120 &&
      state.score[state.possession] < state.score[otherSide(state.possession)];
    for (const [playId, base] of Object.entries(normal) as Array<[OffensePlayId, number]>) {
      if (!available.has(playId)) continue;
      const isPass = ["stick", "mesh", "four-verts"].includes(playId);
      addWeight(weights, playId, lateAndTrailing && isPass ? base * 1.7 : base);
    }
    if (available.has("kneel")) addWeight(weights, "kneel", 30);
    if (available.has("spike")) addWeight(weights, "spike", state.clock <= 25 ? 18 : 7);
    if (state.down === 4) {
      if (available.has("punt")) {
        addWeight(weights, "punt", state.ballOn < 55 || state.toGo >= 5 ? 18 : 3);
      }
      if (available.has("field-goal")) {
        const scoreDiff = state.score[state.possession] - state.score[otherSide(state.possession)];
        const lateCloseGame = state.period >= 4 && state.clock <= 180 && Math.abs(scoreDiff) <= 3;
        addWeight(weights, "field-goal", state.ballOn >= 62 || lateCloseGame ? 16 : 4);
      }
    }
    return weights;
  }

  const available = new Set(getAvailableDefensePlayIds(state));
  if (state.phase === "conversion" && !state.twoPointAttempt) {
    const expectTwo = cpuShouldGoForTwo(state);
    addWeight(weights, "kick-block", expectTwo ? 2 : 8);
    addWeight(weights, "goal-line-defense", expectTwo ? 10 : 4);
    return weights;
  }
  if (state.phase === "kickoff") {
    const kickingSide = otherSide(state.possession);
    const scoreDeficit = state.score[state.possession] - state.score[kickingSide];
    const shouldOnside = state.period === 4 && state.clock <= 180 && scoreDeficit > 0 && scoreDeficit <= 16;
    addWeight(weights, "kick-deep-left", 3);
    addWeight(weights, "kick-deep-middle", 4);
    addWeight(weights, "kick-deep-right", 3);
    addWeight(weights, "squib-kick", state.period === 4 && state.clock <= 30 ? 5 : 1);
    addWeight(weights, "onside-kick", shouldOnside ? 20 : 0.08);
    return weights;
  }
  const short = state.toGo <= 3;
  const long = state.toGo >= 8;
  const normal: Partial<Record<DefensePlayId, number>> = short
    ? { "bear-front": 8, "cover-2": 3, "cover-4": 1, "cover-0": 5 }
    : long
      ? { "bear-front": 1, "cover-2": 5, "cover-4": 8, "cover-0": 3 }
      : { "bear-front": 4, "cover-2": 5, "cover-4": 4, "cover-0": 4 };
  const humanSide = otherSide(state.cpuSide ?? "away");
  const userCalls = state.playLog
    .filter((entry) => entry.offense === humanSide)
    .slice(-16)
    .map((entry) => normalizeOffenseConcept(entry.offensePlayId));
  if (userCalls.length >= 4) {
    const callsOf = (playId: OffensePlayId) => userCalls.filter((call) => call === playId).length / userCalls.length;
    addWeight(normal, "bear-front", callsOf("run") * 5);
    addWeight(normal, "cover-2", callsOf("stick") * 5);
    addWeight(normal, "cover-4", callsOf("four-verts") * 5);
    addWeight(normal, "cover-0", callsOf("mesh") * 2);
  }
  for (const [playId, base] of Object.entries(normal) as Array<[DefensePlayId, number]>) {
    if (available.has(playId)) addWeight(weights, playId, base);
  }
  if (available.has("field-goal-safe")) {
    const likelyFieldGoal = state.down === 4 && state.ballOn >= 55;
    addWeight(weights, "field-goal-safe", likelyFieldGoal ? 16 : 0.25);
    addWeight(weights, "field-goal-block", likelyFieldGoal ? 10 : 0.2);
  } else if (state.down === 4 && available.has("punt-return-middle")) {
    const likelyPunt = state.ballOn < 58 || state.toGo >= 4;
    addWeight(weights, "punt-return-middle", likelyPunt ? 7 : 1);
    addWeight(weights, "punt-block", likelyPunt ? 3 : 1);
  }
  return weights;
}

export function selectCpuPlay(state: GameState, role: CoordinatorRole): AnyPlayId {
  if (role === "offense") {
    const fourthDownDecision = getCpuFourthDownDecision(state);
    if (fourthDownDecision) return fourthDownDecision;
  }
  const available = role === "offense"
    ? getAvailableOffensePlayIds(state)
    : getAvailableDefensePlayIds(state);
  const weights = getCpuPlayWeights(state, role);
  const random = cpuRandom(state);
  const total = available.reduce((sum, playId) => sum + (weights[playId] ?? 0), 0);
  if (total <= 0) return available[0];
  let target = random() * total;
  for (const playId of available) {
    target -= weights[playId] ?? 0;
    if (target <= 0) return playId;
  }
  return available.at(-1) ?? available[0];
}

export function selectCpuExecutionScore(
  state: GameState,
  role: CoordinatorRole = roleForSeat(state, state.cpuSide ?? "away"),
  playId?: AnyPlayId,
) {
  const random = cpuRandom({ ...state, seed: `${state.seed}:execution` });
  const side = role === "offense" ? state.possession : otherSide(state.possession);
  const team = side === "home" ? state.homeTeam : state.awayTeam;
  const opponent = side === "home" ? state.awayTeam : state.homeTeam;
  const kicker = team.roster.specialTeams?.find((player) => player.position === "K");
  const kickDistance = playId === "extra-point" ? 20 : 117 - state.ballOn;
  const ratingAdjustment = playId === "field-goal" || playId === "extra-point"
    ? ((kicker?.rating ?? team.rating) - 82) * 0.9 - Math.max(0, kickDistance - 40) * 0.45
    : (team.rating - opponent.rating) * 0.7;
  const difficultyAdjustment = state.difficulty === "impossible" ? 14 : state.difficulty === "hard" ? 7 : 0;
  return clampExecutionScore(
    Math.max(6, Math.min(98, 18 + ((random() + random()) / 2) * 68 + ratingAdjustment + difficultyAdjustment)),
  );
}

export function snapshotTargetsCurrentSnap(
  state: GameState,
  expectedPlayNumber: unknown,
  expectedVersion: unknown,
  storedVersion: number,
) {
  if (typeof expectedPlayNumber === "number") {
    return expectedPlayNumber === state.playNumber;
  }
  return typeof expectedVersion !== "number" || expectedVersion === storedVersion;
}

export function buildGameView(state: GameState, seat: TeamSide): GameView {
  upgradeGameState(state);
  const role = roleForSeat(state, seat);
  const ownCall = state.pending[seat];
  const offenseCall = state.pending[state.possession];
  const defenseCall = state.pending[otherSide(state.possession)];
  return {
    state: {
      ...state,
      pending: {
        yourPlayId: ownCall?.playId,
        offenseSubmitted: Boolean(offenseCall),
        defenseSubmitted: Boolean(defenseCall),
      },
    },
    you: {
      seat,
      role,
      submitted: Boolean(ownCall),
    },
  };
}

export function applyPlayCall(
  state: GameState,
  seat: TeamSide,
  requestedPlayId: unknown,
  submittedAt: string,
  requestedExecutionScore?: unknown,
) {
  upgradeGameState(state);
  const cpuSide = state.cpuSide ?? "away";
  if (state.opponentType === "cpu" && seat === cpuSide) {
    throw new Error("The computer controls that team seat.");
  }
  const role = roleForSeat(state, seat);
  const playId = validatePlayCall(state, role, requestedPlayId);
  if (state.phase === "conversion" && !state.twoPointAttempt && role === "offense" && playId === "two-point") {
    return { state: beginTwoPointAttempt(state), duplicate: false, resolved: false };
  }
  if (
    state.opponentType === "cpu" &&
    state.phase === "conversion" &&
    !state.twoPointAttempt &&
    role === "defense" &&
    cpuSide === state.possession &&
    !state.pending[cpuSide]
  ) {
    const cpuConversionChoice = selectCpuPlay(state, "offense");
    if (cpuConversionChoice === "two-point") {
      const next = beginTwoPointAttempt(state);
      const cpuConcept = selectCpuPlay(next, "offense") as OffensePlayId;
      next.pending[cpuSide] = {
        seat: cpuSide,
        role: "offense",
        playId: cpuConcept,
        playNumber: next.playNumber,
        submittedAt,
        executionScore: selectCpuExecutionScore(next, "offense", cpuConcept),
      };
      return { state: next, duplicate: false, resolved: false };
    }
  }
  if (state.opponentType === "human" && role === "defense" && !state.pending[state.possession]) {
    throw new Error("Waiting for the offense to finish its hidden call and meter.");
  }
  let preparedCpuCall: { role: CoordinatorRole; playId: AnyPlayId; executionScore?: number } | undefined;
  if (state.opponentType === "cpu" && !state.pending[cpuSide]) {
    const cpuRole = roleForSeat(state, cpuSide);
    const cpuPlay = selectCpuPlay(state, cpuRole);
    preparedCpuCall = {
      role: cpuRole,
      playId: cpuPlay,
      executionScore: playUsesExecutionMeter(cpuPlay)
        ? selectCpuExecutionScore(state, cpuRole, cpuPlay)
        : undefined,
    };
    if (cpuRole === "offense") {
      state.pending[cpuSide] = {
        seat: cpuSide,
        role: cpuRole,
        playId: cpuPlay,
        playNumber: state.playNumber,
        submittedAt,
        executionScore: preparedCpuCall.executionScore,
      };
    }
  }
  const executionScore = playUsesExecutionMeter(playId)
    ? clampExecutionScore(requestedExecutionScore)
    : undefined;
  const existing = state.pending[seat];
  if (existing) {
    if (existing.playId === playId) {
      return { state, duplicate: true, resolved: false };
    }
    throw new Error("Your play has already been submitted.");
  }
  state.pending[seat] = {
    seat,
    role,
    playId,
    playNumber: state.playNumber,
    submittedAt,
    executionScore,
  };
  if (state.opponentType === "cpu" && !state.pending[cpuSide] && preparedCpuCall) {
    state.pending[cpuSide] = {
      seat: cpuSide,
      role: preparedCpuCall.role,
      playId: preparedCpuCall.playId,
      playNumber: state.playNumber,
      submittedAt,
      executionScore: preparedCpuCall.executionScore,
    };
  }
  const offenseCall = state.pending[state.possession];
  const defenseCall = state.pending[otherSide(state.possession)];
  if (offenseCall && defenseCall) {
    const resolution = resolveSnap(
      state,
      offenseCall.playId as OffensePlayId,
      defenseCall.playId as DefensePlayId,
      offenseCall.executionScore ?? DEFAULT_EXECUTION_SCORE,
      defenseCall.executionScore ?? DEFAULT_EXECUTION_SCORE,
    );
    return { state: resolution.state, duplicate: false, resolved: true };
  }
  return { state, duplicate: false, resolved: false };
}

export function validatePlayCall(
  state: GameState,
  role: "offense" | "defense",
  playId: unknown,
): OffensePlayId | DefensePlayId {
  if (typeof playId !== "string") {
    throw new Error("Select a play to submit.");
  }
  if (role === "offense") {
    const offensePlayId = state.phase === "scrimmage" || state.twoPointAttempt
      ? normalizeOffenseConcept(playId as OffensePlayId)
      : playId as OffensePlayId;
    if (
      !offensePlayIds.has(offensePlayId) ||
      !getAvailableOffensePlayIds(state).includes(offensePlayId)
    ) {
      throw new Error("That offensive call is unavailable in this situation.");
    }
    return offensePlayId;
  }
  const defensePlayId = state.phase === "scrimmage" || state.twoPointAttempt
    ? normalizeDefenseConcept(playId as DefensePlayId)
    : playId as DefensePlayId;
  if (
    !defensePlayIds.has(defensePlayId) ||
    !getAvailableDefensePlayIds(state).includes(defensePlayId)
  ) {
    throw new Error("That defensive call is unavailable in this situation.");
  }
  return defensePlayId;
}

export function possessionOpponent(state: GameState) {
  return otherSide(state.possession);
}
