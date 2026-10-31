type JsonRecord = Record<string, unknown>;

export type PlayByPlayGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
};

export type PlayByPlayPlay = {
  id: string;
  driveId: string;
  driveNumber: number | null;
  playNumber: number | null;
  offense: string;
  defense: string;
  period: number;
  clock: { minutes: number | null; seconds: number | null };
  down: number;
  distance: number;
  yardsToGoal: number | null;
  yardsGained: number | null;
  scoring: boolean;
  playType: string;
  playText: string;
  ppa: number | null;
  homeScore: number | null;
  awayScore: number | null;
  isSack: boolean;
  sackYards: number;
};

export type PlayByPlayDrive = {
  id: string;
  number: number;
  offense: string;
  period: number;
  clock: PlayByPlayPlay["clock"];
  playCount: number;
  yards: number;
  result: string;
  homeScore: number | null;
  awayScore: number | null;
  plays: PlayByPlayPlay[];
};

export type TeamGameSackStat = {
  team: string;
  passYards: number | null;
  passAttempts: number | null;
  rushYards: number | null;
  rushAttempts: number | null;
  sacksAllowed: number | null;
  sackYardsLost: number | null;
};

export type SackAccounting = {
  team: string;
  sacksAllowed: number;
  sackYards: number;
  officialRushingYards: number | null;
  officialRushingAttempts: number | null;
  officialPassingYards: number | null;
  officialPassAttempts: number | null;
  harperRushingYards: number | null;
  harperRushingAttempts: number | null;
  harperNetPassingYards: number | null;
  harperDropbacks: number | null;
  source: "play-by-play" | "box-score" | "unavailable";
};

export type PlayFeedSackAdjustment = {
  gameId: string;
  team: string;
  sacks: number;
  yards: number;
};

type SackAdjustableStat = {
  gameId: string;
  team: string;
  totalYards: number;
  passYards: number;
  passAttempts: number;
  yardsPerPass: number;
  rushYards: number;
  rushAttempts: number;
  yardsPerRush: number;
  yardsPerPlay: number;
  sacksAllowed: number;
  sackYardsLost: number;
  sackAdjustmentVersion: number;
};

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => Boolean(row && typeof row === "object")) : [];
}

function textValue(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function numberValue(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") continue;
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function booleanValue(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === true || value === 1 || value === "true") return true;
    if (value === false || value === 0 || value === "false") return false;
  }
  return false;
}

function teamKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameTeam(left: string, right: string) {
  return Boolean(left && right && teamKey(left) === teamKey(right));
}

export function isSackPlay(playType: string, playText: string) {
  if (/\bno play\b/i.test(playText)) return false;
  return /sack/i.test(playType) || /\b(?:sack|sacked|sacks)\b/i.test(playText);
}

export function sackYardsFromPlay(yardsGained: number | null, playText: string) {
  if (yardsGained !== null && yardsGained < 0) return Math.abs(yardsGained);
  const patterns = [
    /\bloss\s+of\s+(\d+(?:\.\d+)?)\s+yards?\b/i,
    /\bfor\s+(\d+(?:\.\d+)?)\s+yards?\s+loss\b/i,
    /\bsacked\b.{0,80}?\bfor\s+(-?\d+(?:\.\d+)?)\s+yards?\b/i,
  ];
  for (const pattern of patterns) {
    const match = playText.match(pattern);
    if (match) return Math.abs(Number(match[1])) || 0;
  }
  return 0;
}

export function sackAdjustmentsFromPlayFeed(payload: unknown): PlayFeedSackAdjustment[] {
  const adjustments = new Map<string, PlayFeedSackAdjustment>();
  for (const row of records(payload)) {
    const gameId = textValue(row, "gameId", "game_id");
    const team = textValue(row, "offense", "team");
    const playType = textValue(row, "playType", "play_type", "type");
    const playText = textValue(row, "playText", "play_text", "text");
    if (!gameId || !team || !isSackPlay(playType, playText)) continue;
    const key = `${gameId}\u0000${teamKey(team)}`;
    const current = adjustments.get(key) ?? { gameId, team, sacks: 0, yards: 0 };
    current.sacks += 1;
    current.yards += sackYardsFromPlay(numberValue(row, "yardsGained", "yards_gained"), playText);
    adjustments.set(key, current);
  }
  return [...adjustments.values()];
}

export function applyPlayFeedSackAdjustments<T extends SackAdjustableStat>(stats: T[], payload: unknown, markChecked = false): T[] {
  const adjustments = new Map(sackAdjustmentsFromPlayFeed(payload).map((row) => [`${row.gameId}\u0000${teamKey(row.team)}`, row]));
  return stats.map((stat) => {
    const adjustment = adjustments.get(`${stat.gameId}\u0000${teamKey(stat.team)}`);
    if (!adjustment) return markChecked ? { ...stat, sackAdjustmentVersion: 1 } : stat;
    const storedSacks = Math.max(0, stat.sacksAllowed);
    const storedSackYards = Math.max(0, stat.sackYardsLost);
    const sacksAllowed = Math.max(storedSacks, adjustment.sacks);
    const sackYardsLost = adjustment.yards > 0 ? adjustment.yards : storedSackYards;
    const officialPassYards = stat.passYards + storedSackYards;
    const officialRushYards = stat.rushYards - storedSackYards;
    const officialRushAttempts = stat.rushAttempts + storedSacks;
    const passYards = officialPassYards - sackYardsLost;
    const rushYards = officialRushYards + sackYardsLost;
    const rushAttempts = Math.max(0, officialRushAttempts - sacksAllowed);
    const passDropbacks = stat.passAttempts + sacksAllowed;
    const plays = passDropbacks + rushAttempts;
    return {
      ...stat,
      passYards,
      yardsPerPass: passDropbacks ? passYards / passDropbacks : 0,
      rushYards,
      rushAttempts,
      yardsPerRush: rushAttempts ? rushYards / rushAttempts : 0,
      yardsPerPlay: plays ? stat.totalYards / plays : 0,
      sacksAllowed,
      sackYardsLost,
      sackAdjustmentVersion: markChecked ? 1 : stat.sackAdjustmentVersion,
    };
  });
}

function playSequence(id: string, gameId: string) {
  const suffix = id.startsWith(gameId) ? id.slice(gameId.length) : id;
  const numeric = /^\d+$/.test(suffix) ? Number(suffix) : Number.NaN;
  return Number.isSafeInteger(numeric) ? numeric : null;
}

export function normalizePlayByPlay(payload: unknown, game: PlayByPlayGame): PlayByPlayPlay[] {
  const seen = new Set<string>();
  const normalized = records(payload).flatMap((row, sourceIndex) => {
    const rowGameId = textValue(row, "gameId", "game_id");
    if (rowGameId !== game.gameId) return [];
    const id = textValue(row, "id", "playId", "play_id") || `${game.gameId}-${sourceIndex}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const clockRecord = row.clock && typeof row.clock === "object" ? row.clock as JsonRecord : {};
    const playType = textValue(row, "playType", "play_type", "type");
    const playText = textValue(row, "playText", "play_text", "text");
    const yardsGained = numberValue(row, "yardsGained", "yards_gained");
    const offense = textValue(row, "offense", "team");
    const defense = textValue(row, "defense", "opponent");
    const sourceHome = textValue(row, "home", "homeTeam", "home_team") || game.homeTeam;
    const sourceAway = textValue(row, "away", "awayTeam", "away_team") || game.awayTeam;
    const offenseScore = numberValue(row, "offenseScore", "offense_score");
    const defenseScore = numberValue(row, "defenseScore", "defense_score");
    const homeScore = sameTeam(offense, sourceHome) ? offenseScore : sameTeam(defense, sourceHome) ? defenseScore : null;
    const awayScore = sameTeam(offense, sourceAway) ? offenseScore : sameTeam(defense, sourceAway) ? defenseScore : null;
    const isSack = isSackPlay(playType, playText);
    return [{
      id,
      driveId: textValue(row, "driveId", "drive_id") || `drive-${sourceIndex}`,
      driveNumber: numberValue(row, "driveNumber", "drive_number"),
      playNumber: numberValue(row, "playNumber", "play_number"),
      offense,
      defense,
      period: numberValue(row, "period", "quarter") ?? 0,
      clock: {
        minutes: numberValue(clockRecord, "minutes", "minute"),
        seconds: numberValue(clockRecord, "seconds", "second"),
      },
      down: numberValue(row, "down") ?? 0,
      distance: numberValue(row, "distance", "yardsToGo", "yards_to_go") ?? 0,
      yardsToGoal: numberValue(row, "yardsToGoal", "yards_to_goal"),
      yardsGained,
      scoring: booleanValue(row, "scoring", "isScoringPlay", "is_scoring_play"),
      playType,
      playText: playText || playType || "Play detail unavailable",
      ppa: numberValue(row, "ppa"),
      homeScore,
      awayScore,
      isSack,
      sackYards: isSack ? sackYardsFromPlay(yardsGained, playText) : 0,
      sourceIndex,
      sequence: playSequence(id, game.gameId),
    }];
  });

  normalized.sort((left, right) => {
    if (left.period !== right.period) return left.period - right.period;
    if (left.sequence !== null && right.sequence !== null && left.sequence !== right.sequence) return left.sequence - right.sequence;
    if (left.driveNumber !== null && right.driveNumber !== null && left.driveNumber !== right.driveNumber) return left.driveNumber - right.driveNumber;
    if (left.playNumber !== null && right.playNumber !== null && left.playNumber !== right.playNumber) return left.playNumber - right.playNumber;
    const leftClock = (left.clock.minutes ?? -1) * 60 + (left.clock.seconds ?? -1);
    const rightClock = (right.clock.minutes ?? -1) * 60 + (right.clock.seconds ?? -1);
    if (leftClock !== rightClock) return rightClock - leftClock;
    return left.sourceIndex - right.sourceIndex;
  });

  return normalized.map(({ sourceIndex: _sourceIndex, sequence: _sequence, ...play }) => play);
}

function driveResult(plays: PlayByPlayPlay[]) {
  const joined = plays.map((play) => `${play.playType} ${play.playText}`).join(" ");
  if (/touchdown/i.test(joined)) return "TOUCHDOWN";
  if (/\bsafety\b/i.test(joined)) return "SAFETY";
  if (/field goal/i.test(joined)) return /no good|missed|blocked/i.test(joined) ? "MISSED FG" : "FIELD GOAL";
  const last = plays.at(-1);
  const ending = `${last?.playType ?? ""} ${last?.playText ?? ""}`;
  if (/interception/i.test(ending)) return "INTERCEPTION";
  if (/fumble/i.test(ending) && /recover|turnover/i.test(ending)) return "FUMBLE";
  if (/punt/i.test(ending)) return "PUNT";
  if (/turnover on downs|downs/i.test(ending)) return "DOWNS";
  if (/end of (?:half|game|period)|game end/i.test(ending)) return "END OF PERIOD";
  if (plays.some((play) => play.scoring)) return "SCORE";
  return "DRIVE END";
}

export function buildPlayByPlayDrives(plays: PlayByPlayPlay[]): PlayByPlayDrive[] {
  const groups: Array<{ id: string; plays: PlayByPlayPlay[] }> = [];
  const byId = new Map<string, { id: string; plays: PlayByPlayPlay[] }>();
  for (const play of plays) {
    let group = byId.get(play.driveId);
    if (!group) {
      group = { id: play.driveId, plays: [] };
      byId.set(play.driveId, group);
      groups.push(group);
    }
    group.plays.push(play);
  }
  return groups.map((group, index) => {
    const first = group.plays[0];
    const last = group.plays.at(-1)!;
    return {
      id: group.id,
      number: first.driveNumber ?? index + 1,
      offense: first.offense,
      period: first.period,
      clock: first.clock,
      playCount: group.plays.length,
      yards: group.plays.reduce((sum, play) => sum + (play.yardsGained ?? 0), 0),
      result: driveResult(group.plays),
      homeScore: last.homeScore,
      awayScore: last.awayScore,
      plays: group.plays,
    };
  });
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildSackAccounting(stats: TeamGameSackStat[], plays: PlayByPlayPlay[]): SackAccounting[] {
  return stats.map((stat) => {
    const teamPlays = plays.filter((play) => sameTeam(play.offense, stat.team));
    const sackPlays = teamPlays.filter((play) => play.isSack);
    const storedSacks = Math.max(0, finite(stat.sacksAllowed) ?? 0);
    const storedSackYards = Math.max(0, finite(stat.sackYardsLost) ?? 0);
    const itemizedSackYards = sackPlays.reduce((sum, play) => sum + play.sackYards, 0);
    const sacksAllowed = Math.max(storedSacks, sackPlays.length);
    const sackYards = itemizedSackYards > 0 ? itemizedSackYards : storedSackYards;

    // Stored Harper+ rows already remove the box-score sack values from passing
    // and add them back to rushing. Reconstruct the NCAA line first, then apply
    // the itemized play-feed values so missing box-score sack yardage is repaired.
    const storedRushYards = finite(stat.rushYards);
    const storedRushAttempts = finite(stat.rushAttempts);
    const storedPassYards = finite(stat.passYards);
    const passAttempts = finite(stat.passAttempts);
    const officialRushingYards = storedRushYards === null ? null : storedRushYards - storedSackYards;
    const officialRushingAttempts = storedRushAttempts === null ? null : storedRushAttempts + storedSacks;
    const officialPassingYards = storedPassYards === null ? null : storedPassYards + storedSackYards;

    return {
      team: stat.team,
      sacksAllowed,
      sackYards,
      officialRushingYards,
      officialRushingAttempts,
      officialPassingYards,
      officialPassAttempts: passAttempts,
      harperRushingYards: officialRushingYards === null ? null : officialRushingYards + sackYards,
      harperRushingAttempts: officialRushingAttempts === null ? null : Math.max(0, officialRushingAttempts - sacksAllowed),
      harperNetPassingYards: officialPassingYards === null ? null : officialPassingYards - sackYards,
      harperDropbacks: passAttempts === null ? null : passAttempts + sacksAllowed,
      source: sackPlays.length ? "play-by-play" : storedSacks || storedSackYards ? "box-score" : teamPlays.length ? "play-by-play" : "unavailable",
    };
  });
}
