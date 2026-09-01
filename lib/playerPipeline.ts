import { cfbd, CollegeFootballDataError, currentCollegeFootballSeason, type PipelineEnv } from "./dataPipeline";
import {
  buildOffensiveLineUnitProfile,
  buildTeamPlayerModel,
  FIRST_PLAYER_SEASON,
  INITIAL_PLAYER_SEASON,
  PLAYER_MODEL_VERSION,
  PLAYER_TRANSFER_START_YEAR,
  observedPlayerProductionScore,
  playerRecruitingStartYear,
  productionPosition,
  repairTeamPlayerModelDepth,
  type PlayerProfile,
  type TeamPlayerModel,
} from "./playerModel";
import { parseAdvancedProfile } from "./advancedMetrics";
import {
  opponentAdjustedOffensiveLineScore,
  recruitingRatingBand,
  type PlayerProductionBaseline,
  type ProductionProjectionCohort,
  type ProductionScaleBin,
} from "./playerProductionRatings";
import type { PublishedDepthChart } from "./publishedDepthCharts";

type JsonRecord = Record<string, unknown>;
type PlayerStage = "roster" | "stats" | "success" | "usage" | "ppa" | "transfers" | "recruiting" | "finalize" | "ready";
type PlayerStageColumn = "roster_json" | "stats_json" | "success_json" | "usage_json" | "ppa_json" | "transfer_json";

export type PlayerSyncStatus = {
  season: number;
  stage: PlayerStage;
  progressPercent: number;
  ready: boolean;
  rosterCount: number;
  statCount: number;
  successCount: number;
  usageCount: number;
  ppaCount: number;
  transferCount: number;
  transferYear: number;
  recruitingCount: number;
  recruitingYear: number;
  teamCount: number;
  modelVersion: number;
  detail: string;
  updatedAt: string | null;
};

const stageProgress: Record<PlayerStage, number> = {
  roster: 0,
  stats: 20,
  success: 40,
  usage: 60,
  ppa: 68,
  transfers: 76,
  recruiting: 84,
  finalize: 96,
  ready: 100,
};

const asRecords = (input: unknown): JsonRecord[] =>
  Array.isArray(input) ? input.filter((row): row is JsonRecord => Boolean(row && typeof row === "object")) : [];

const rowTeam = (row: JsonRecord) => String(row.team ?? row.school ?? "").trim();

function parseJson<T>(input: unknown, fallback: T): T {
  if (typeof input !== "string" || !input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function groupByTeam(payload: unknown, eligibleTeams: Set<string>) {
  const groups = new Map<string, JsonRecord[]>();
  for (const row of asRecords(payload)) {
    const team = rowTeam(row);
    if (!team || !eligibleTeams.has(team)) continue;
    const teamRows = groups.get(team) ?? [];
    teamRows.push(row);
    groups.set(team, teamRows);
  }
  return groups;
}

const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function stringArray(row: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
    if (value !== undefined && value !== null && value !== "") return String(value).split(/[,\s|]+/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function playerName(row: JsonRecord) {
  const first = String(row.firstName ?? row.first_name ?? "").trim();
  const last = String(row.lastName ?? row.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || String(row.name ?? row.player ?? "").trim();
}

async function batchStatements(db: D1Database, statements: D1PreparedStatement[], size = 35) {
  for (let index = 0; index < statements.length; index += size) await db.batch(statements.slice(index, index + size));
}

async function appendRecruitingStage(db: D1Database, season: number, payload: unknown) {
  const sourceRows = asRecords(payload);
  const cache = await db.prepare(`SELECT team,roster_json AS rosterJson,recruiting_json AS recruitingJson
      FROM player_team_profiles WHERE season=? ORDER BY team`).bind(season).all<Record<string, unknown>>();
  const rosterByRecruitId = new Map<string, { team: string; playerId: string }>();
  const rosterByName = new Map<string, Array<{ team: string; playerId: string }>>();

  for (const teamRow of cache.results) {
    const team = String(teamRow.team);
    for (const rosterPlayer of parseJson<JsonRecord[]>(teamRow.rosterJson, [])) {
      const playerId = String(rosterPlayer.id ?? rosterPlayer.playerId ?? rosterPlayer.player_id ?? "");
      if (!playerId) continue;
      for (const recruitId of stringArray(rosterPlayer, "recruitIds", "recruit_ids")) rosterByRecruitId.set(recruitId, { team, playerId });
      const key = normalized(playerName(rosterPlayer));
      if (!key) continue;
      const matches = rosterByName.get(key) ?? [];
      matches.push({ team, playerId });
      rosterByName.set(key, matches);
    }
  }

  const additions = new Map<string, JsonRecord[]>();
  for (const recruit of sourceRows) {
    const recruitId = String(recruit.id ?? "");
    let match = recruitId ? rosterByRecruitId.get(recruitId) : undefined;
    let confidence: "ID" | "NAME" = "ID";
    if (!match) {
      const nameMatches = rosterByName.get(normalized(recruit.name ?? recruit.player)) ?? [];
      const committedTo = String(recruit.committedTo ?? recruit.committed_to ?? "");
      const committedMatch = committedTo ? nameMatches.find((candidate) => normalized(candidate.team) === normalized(committedTo)) : undefined;
      if (committedMatch) {
        match = committedMatch;
        confidence = "NAME";
      } else if (nameMatches.length === 1) {
        match = nameMatches[0];
        confidence = "NAME";
      }
    }
    if (!match) continue;
    const teamRows = additions.get(match.team) ?? [];
    teamRows.push({ ...recruit, _rosterPlayerId: match.playerId, _matchConfidence: confidence });
    additions.set(match.team, teamRows);
  }

  const statements: D1PreparedStatement[] = [];
  let matchedPlayers = 0;
  for (const teamRow of cache.results) {
    const team = String(teamRow.team);
    const incoming = additions.get(team);
    if (!incoming?.length) continue;
    const existing = parseJson<JsonRecord[]>(teamRow.recruitingJson, []);
    const merged = new Map<string, JsonRecord>();
    for (const row of [...existing, ...incoming]) {
      const key = `${String(row._rosterPlayerId ?? "")}\u0000${String(row.id ?? "")}\u0000${String(row.year ?? "")}`;
      merged.set(key, row);
    }
    matchedPlayers += incoming.length;
    statements.push(db.prepare(`UPDATE player_team_profiles
        SET recruiting_json=?,updated_at=CURRENT_TIMESTAMP WHERE season=? AND team=?`)
      .bind(JSON.stringify([...merged.values()]), season, team));
  }
  await batchStatements(db, statements, 30);
  return { sourceRows: sourceRows.length, matchedPlayers, teams: additions.size };
}

async function appendTransferStage(db: D1Database, season: number, payload: unknown) {
  const sourceRows = asRecords(payload);
  const cache = await db.prepare(`SELECT team,roster_json AS rosterJson,transfer_json AS transferJson
      FROM player_team_profiles WHERE season=? ORDER BY team`).bind(season).all<Record<string, unknown>>();
  const rosterByName = new Map<string, Array<{ team: string; playerId: string }>>();

  for (const teamRow of cache.results) {
    const team = String(teamRow.team);
    for (const rosterPlayer of parseJson<JsonRecord[]>(teamRow.rosterJson, [])) {
      const playerId = String(rosterPlayer.id ?? rosterPlayer.playerId ?? rosterPlayer.player_id ?? "");
      const key = normalized(playerName(rosterPlayer));
      if (!playerId || !key) continue;
      const matches = rosterByName.get(key) ?? [];
      matches.push({ team, playerId });
      rosterByName.set(key, matches);
    }
  }

  const additions = new Map<string, JsonRecord[]>();
  for (const transfer of sourceRows) {
    const key = normalized(playerName(transfer));
    const destination = normalized(transfer.destination);
    if (!key || !destination) continue;
    const candidates = (rosterByName.get(key) ?? []).filter((candidate) => normalized(candidate.team) === destination);
    if (candidates.length !== 1) continue;
    const match = candidates[0];
    const teamRows = additions.get(match.team) ?? [];
    teamRows.push({ ...transfer, _rosterPlayerId: match.playerId, _matchConfidence: "NAME+DESTINATION" });
    additions.set(match.team, teamRows);
  }

  const statements: D1PreparedStatement[] = [];
  let matchedPlayers = 0;
  for (const teamRow of cache.results) {
    const team = String(teamRow.team);
    const incoming = additions.get(team);
    if (!incoming?.length) continue;
    const existing = parseJson<JsonRecord[]>(teamRow.transferJson, []);
    const merged = new Map<string, JsonRecord>();
    for (const row of [...existing, ...incoming]) {
      const key = `${String(row._rosterPlayerId ?? "")}\u0000${String(row.season ?? row.year ?? "")}\u0000${String(row.origin ?? "")}\u0000${String(row.destination ?? "")}`;
      merged.set(key, row);
    }
    matchedPlayers += incoming.length;
    statements.push(db.prepare(`UPDATE player_team_profiles
        SET transfer_json=?,updated_at=CURRENT_TIMESTAMP WHERE season=? AND team=?`)
      .bind(JSON.stringify([...merged.values()]), season, team));
  }
  await batchStatements(db, statements, 30);
  return { sourceRows: sourceRows.length, matchedPlayers, teams: additions.size };
}

async function writeGroupedStage(db: D1Database, season: number, column: PlayerStageColumn, groups: Map<string, JsonRecord[]>, eligibleTeams: Set<string>) {
  const statements = [...eligibleTeams].sort().map((team) => db.prepare(`INSERT INTO player_team_profiles
      (season,team,${column},updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(season,team) DO UPDATE SET ${column}=excluded.${column},updated_at=CURRENT_TIMESTAMP`)
    .bind(season, team, JSON.stringify(groups.get(team) ?? [])));
  await batchStatements(db, statements);
}

async function writeState(db: D1Database, season: number, stage: PlayerStage, counts: Partial<Omit<PlayerSyncStatus, "season" | "stage" | "progressPercent" | "ready" | "modelVersion" | "detail" | "updatedAt">>, detail: string) {
  await db.prepare(`INSERT INTO player_sync_state
      (season,stage,roster_count,stat_count,success_count,usage_count,ppa_count,transfer_count,transfer_year,recruiting_count,recruiting_year,team_count,model_version,detail,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(season) DO UPDATE SET
        stage=excluded.stage,
        roster_count=CASE WHEN excluded.roster_count>0 THEN excluded.roster_count ELSE player_sync_state.roster_count END,
        stat_count=CASE WHEN excluded.stat_count>0 THEN excluded.stat_count ELSE player_sync_state.stat_count END,
        success_count=CASE WHEN excluded.success_count>0 THEN excluded.success_count ELSE player_sync_state.success_count END,
        usage_count=CASE WHEN excluded.usage_count>0 THEN excluded.usage_count ELSE player_sync_state.usage_count END,
        ppa_count=CASE WHEN excluded.ppa_count>0 THEN excluded.ppa_count ELSE player_sync_state.ppa_count END,
        transfer_count=CASE WHEN excluded.transfer_count>0 THEN excluded.transfer_count ELSE player_sync_state.transfer_count END,
        transfer_year=excluded.transfer_year,
        recruiting_count=CASE WHEN excluded.recruiting_count>0 THEN excluded.recruiting_count ELSE player_sync_state.recruiting_count END,
        recruiting_year=excluded.recruiting_year,
        team_count=CASE WHEN excluded.team_count>0 THEN excluded.team_count ELSE player_sync_state.team_count END,
        model_version=excluded.model_version,
        detail=excluded.detail,
        updated_at=CURRENT_TIMESTAMP`)
    .bind(
      season,
      stage,
      counts.rosterCount ?? 0,
      counts.statCount ?? 0,
      counts.successCount ?? 0,
      counts.usageCount ?? 0,
      counts.ppaCount ?? 0,
      counts.transferCount ?? 0,
      counts.transferYear ?? PLAYER_TRANSFER_START_YEAR,
      counts.recruitingCount ?? 0,
      counts.recruitingYear ?? playerRecruitingStartYear(season),
      counts.teamCount ?? 0,
      PLAYER_MODEL_VERSION,
      detail,
    ).run();
}

function playerStatusFromRow(season: number, row: Record<string, unknown> | null | undefined): PlayerSyncStatus {
  if (!row) return {
    season,
    stage: "roster",
    progressPercent: 0,
    ready: false,
    rosterCount: 0,
    statCount: 0,
    successCount: 0,
    usageCount: 0,
    ppaCount: 0,
    transferCount: 0,
    transferYear: PLAYER_TRANSFER_START_YEAR,
    recruitingCount: 0,
    recruitingYear: playerRecruitingStartYear(season),
    teamCount: 0,
    modelVersion: PLAYER_MODEL_VERSION,
    detail: `Waiting for ${season} roster import`,
    updatedAt: null,
  };
  const storedStage = String(row.stage ?? "roster") as PlayerStage;
  const modelVersion = Number(row.modelVersion ?? 0);
  const stage = storedStage === "ready" && modelVersion < PLAYER_MODEL_VERSION
    ? modelVersion < 2 ? "recruiting" : modelVersion < 4 ? "transfers" : "finalize"
    : storedStage;
  const transferYear = Math.max(PLAYER_TRANSFER_START_YEAR, Number(row.transferYear ?? PLAYER_TRANSFER_START_YEAR));
  const recruitingStartYear = playerRecruitingStartYear(season);
  const recruitingYear = Math.max(recruitingStartYear, Number(row.recruitingYear ?? recruitingStartYear));
  const transferSpan = Math.max(1, season - PLAYER_TRANSFER_START_YEAR + 1);
  const recruitingSpan = Math.max(1, season - recruitingStartYear + 1);
  const progressPercent = stage === "recruiting"
    ? Math.min(95, 84 + Math.floor(11 * (recruitingYear - recruitingStartYear) / recruitingSpan))
    : stage === "transfers"
      ? season < PLAYER_TRANSFER_START_YEAR ? 83 : Math.min(83, 76 + Math.floor(7 * (transferYear - PLAYER_TRANSFER_START_YEAR) / transferSpan))
    : stageProgress[stage] ?? 0;
  return {
    season,
    stage,
    progressPercent,
    ready: stage === "ready" && modelVersion >= PLAYER_MODEL_VERSION,
    rosterCount: Number(row.rosterCount ?? 0),
    statCount: Number(row.statCount ?? 0),
    successCount: Number(row.successCount ?? 0),
    usageCount: Number(row.usageCount ?? 0),
    ppaCount: Number(row.ppaCount ?? 0),
    transferCount: Number(row.transferCount ?? 0),
    transferYear,
    recruitingCount: Number(row.recruitingCount ?? 0),
    recruitingYear,
    teamCount: Number(row.teamCount ?? 0),
    modelVersion,
    detail: String(row.detail ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
  };
}

export async function getPlayerSyncStatus(env: Pick<PipelineEnv, "DB">, season = INITIAL_PLAYER_SEASON): Promise<PlayerSyncStatus> {
  const row = await env.DB.prepare(`SELECT season,stage,roster_count AS rosterCount,stat_count AS statCount,
      success_count AS successCount,usage_count AS usageCount,ppa_count AS ppaCount,
      transfer_count AS transferCount,transfer_year AS transferYear,
      recruiting_count AS recruitingCount,recruiting_year AS recruitingYear,team_count AS teamCount,
      model_version AS modelVersion,detail,updated_at AS updatedAt
      FROM player_sync_state WHERE season=?`).bind(season).first<Record<string, unknown>>();
  return playerStatusFromRow(season, row);
}

export async function claimPlayerSync(env: Pick<PipelineEnv, "DB">, cooldownSeconds = 75) {
  const lease = await env.DB.prepare(`INSERT INTO sync_leases (scope,next_allowed_at,updated_at)
      VALUES ('players-archive-v4',unixepoch()+?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET next_allowed_at=excluded.next_allowed_at,updated_at=CURRENT_TIMESTAMP
      WHERE sync_leases.next_allowed_at<=unixepoch()`)
    .bind(Math.max(60, Math.trunc(cooldownSeconds)))
    .run();
  return Number(lease.meta.changes ?? 0) > 0;
}

async function eligibleTeams(db: D1Database, season: number) {
  const result = await db.prepare("SELECT team FROM cfb_teams WHERE season=? ORDER BY team").bind(season).all<{ team: string }>();
  return new Set(result.results.map((row) => row.team));
}

async function optionalPlayerFeed(path: string, key: string, params: Record<string, string | number | undefined>) {
  try {
    return await cfbd(path, key, params);
  } catch (error) {
    if (error instanceof CollegeFootballDataError && (error.status === 403 || error.status === 404)) return [];
    throw error;
  }
}

export async function syncPlayerSeasonStep(env: PipelineEnv, season = INITIAL_PLAYER_SEASON) {
  const currentSeason = currentCollegeFootballSeason();
  if (season < FIRST_PLAYER_SEASON || season > currentSeason) throw new Error(`Player archive supports ${FIRST_PLAYER_SEASON}–${currentSeason}`);
  if (!env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not configured");
  const status = await getPlayerSyncStatus(env, season);
  const teams = await eligibleTeams(env.DB, season);
  if (teams.size < 100) throw new Error(`${season} team identities must be archived before player data`);

  if (status.stage === "roster") {
    const payload = await cfbd("/roster", env.CFBD_API_KEY, { year: season, classification: "fbs" });
    const rows = asRecords(payload);
    const groups = groupByTeam(rows, teams);
    if (rows.length < 4000 || groups.size < 100) throw new Error(`CollegeFootballData returned an incomplete ${season} roster (${rows.length} players, ${groups.size} FBS teams)`);
    await writeGroupedStage(env.DB, season, "roster_json", groups, teams);
    await writeState(env.DB, season, "stats", { rosterCount: rows.length, teamCount: groups.size }, `Stored ${rows.length} roster players across ${groups.size} FBS teams`);
    return { season, stage: "roster" as const, rows: rows.length, teams: groups.size };
  }

  if (status.stage === "stats") {
    const payload = await cfbd("/stats/player/season", env.CFBD_API_KEY, { year: season });
    const rows = asRecords(payload);
    const groups = groupByTeam(rows, teams);
    if (!rows.length && season < currentSeason) throw new Error(`CollegeFootballData returned no ${season} player season statistics`);
    await writeGroupedStage(env.DB, season, "stats_json", groups, teams);
    await writeState(env.DB, season, "success", { statCount: rows.length }, `Stored ${rows.length} basic player-stat lines`);
    return { season, stage: "stats" as const, rows: rows.length, teams: groups.size };
  }

  if (status.stage === "success") {
    const payload = await optionalPlayerFeed("/stats/player/success", env.CFBD_API_KEY, { year: season, excludeGarbageTime: "true" });
    const rows = asRecords(payload);
    const groups = groupByTeam(rows, teams);
    await writeGroupedStage(env.DB, season, "success_json", groups, teams);
    await writeState(env.DB, season, "usage", { successCount: rows.length }, rows.length ? `Stored ${rows.length} player success-rate profiles` : "Player success-rate feed unavailable; basic production remains active");
    return { season, stage: "success" as const, rows: rows.length, teams: groups.size };
  }

  if (status.stage === "usage") {
    const payload = await optionalPlayerFeed("/player/usage", env.CFBD_API_KEY, { year: season, excludeGarbageTime: "true" });
    const rows = asRecords(payload);
    const groups = groupByTeam(rows, teams);
    await writeGroupedStage(env.DB, season, "usage_json", groups, teams);
    await writeState(env.DB, season, "ppa", { usageCount: rows.length }, rows.length ? `Stored ${rows.length} player usage profiles` : "Player usage feed unavailable; basic production remains active");
    return { season, stage: "usage" as const, rows: rows.length, teams: groups.size };
  }

  if (status.stage === "ppa") {
    const payload = await optionalPlayerFeed("/ppa/players/season", env.CFBD_API_KEY, { year: season, excludeGarbageTime: "true", threshold: 1 });
    const rows = asRecords(payload);
    const groups = groupByTeam(rows, teams);
    await writeGroupedStage(env.DB, season, "ppa_json", groups, teams);
    await writeState(env.DB, season, "transfers", {
      ppaCount: rows.length,
      transferYear: PLAYER_TRANSFER_START_YEAR,
      recruitingYear: playerRecruitingStartYear(season),
    }, rows.length ? `Stored ${rows.length} player PPA profiles; linking transfer evaluations next` : "Player PPA feed unavailable; linking transfer evaluations next");
    return { season, stage: "ppa" as const, rows: rows.length, teams: groups.size };
  }

  if (status.stage === "transfers") {
    const recruitingYear = Math.max(playerRecruitingStartYear(season), status.recruitingYear);
    if (season < PLAYER_TRANSFER_START_YEAR) {
      const nextStage: PlayerStage = recruitingYear > season ? "finalize" : "recruiting";
      await writeState(env.DB, season, nextStage, {
        transferYear: PLAYER_TRANSFER_START_YEAR,
        recruitingYear,
      }, `CFBD transfer evaluations begin in ${PLAYER_TRANSFER_START_YEAR}; ${nextStage === "finalize" ? "rebuilding the completed player profile" : `linking ${season} roster players to high-school recruiting profiles`}`);
      return { season, stage: "transfers" as const, year: null, rows: 0, matchedPlayers: 0, teams: 0 };
    }
    const transferYear = Math.min(season, Math.max(PLAYER_TRANSFER_START_YEAR, status.transferYear));
    const payload = await optionalPlayerFeed("/player/portal", env.CFBD_API_KEY, { year: transferYear });
    const linked = await appendTransferStage(env.DB, season, payload);
    const nextYear = transferYear + 1;
    const nextStage: PlayerStage = nextYear > season ? recruitingYear > season ? "finalize" : "recruiting" : "transfers";
    const transferCount = status.transferCount + linked.matchedPlayers;
    await writeState(
      env.DB,
      season,
      nextStage,
      {
        transferCount,
        transferYear: nextYear,
        recruitingYear,
      },
      `Linked ${linked.matchedPlayers} ${transferYear} transfer evaluations by player name and destination${nextStage === "recruiting" ? "; linking high-school recruiting profiles next" : nextStage === "finalize" ? "; rebuilding historical depth charts next" : ""}`,
    );
    return { season, stage: "transfers" as const, year: transferYear, rows: linked.sourceRows, matchedPlayers: linked.matchedPlayers, teams: linked.teams };
  }

  if (status.stage === "recruiting") {
    const recruitYear = Math.min(season, Math.max(playerRecruitingStartYear(season), status.recruitingYear));
    const payload = await optionalPlayerFeed("/recruiting/players", env.CFBD_API_KEY, { year: recruitYear });
    const linked = await appendRecruitingStage(env.DB, season, payload);
    const nextYear = recruitYear + 1;
    const nextStage: PlayerStage = nextYear > season ? "finalize" : "recruiting";
    const recruitingCount = status.recruitingCount + linked.matchedPlayers;
    await writeState(
      env.DB,
      season,
      nextStage,
      { recruitingCount, recruitingYear: nextYear },
      `Linked ${linked.matchedPlayers} roster players to ${recruitYear} recruiting profiles by CFBD recruit ID${nextStage === "finalize" ? "; rebuilding line roles and depth charts" : ""}`,
    );
    return { season, stage: "recruiting" as const, year: recruitYear, rows: linked.sourceRows, matchedPlayers: linked.matchedPlayers, teams: linked.teams };
  }

  if (status.stage === "finalize") {
    const result = await env.DB.prepare(`SELECT team,roster_json AS rosterJson,stats_json AS statsJson,
        success_json AS successJson,usage_json AS usageJson,ppa_json AS ppaJson,
        recruiting_json AS recruitingJson,transfer_json AS transferJson
        FROM player_team_profiles WHERE season=? ORDER BY team`).bind(season).all<Record<string, unknown>>();
    if (result.results.length < 100) throw new Error(`Only ${result.results.length} ${season} team player caches are available`);
    const statements = result.results.map((row) => {
      const team = String(row.team);
      const model = buildTeamPlayerModel(
        season,
        team,
        parseJson(row.rosterJson, []),
        parseJson(row.statsJson, []),
        parseJson(row.successJson, []),
        parseJson(row.usageJson, []),
        parseJson(row.ppaJson, []),
        parseJson(row.recruitingJson, []),
        parseJson(row.transferJson, []),
      );
      const quality = model.players.some((player) => player.advanced.overallUsage !== null || player.advanced.averagePpa !== null || player.advanced.passingSuccessRate !== null || player.advanced.rushingSuccessRate !== null)
        ? "advanced-ready"
        : "basic-ready";
      return env.DB.prepare(`UPDATE player_team_profiles SET profile_json=?,source_quality=?,model_version=?,updated_at=CURRENT_TIMESTAMP
          WHERE season=? AND team=?`)
        .bind(JSON.stringify(model), quality, PLAYER_MODEL_VERSION, season, team);
    });
    await batchStatements(env.DB, statements, 25);
    await markPlayerProductionBaselineDirty(env.DB, season);
    await writeState(env.DB, season, "ready", {
      teamCount: result.results.length,
      transferCount: status.transferCount,
      transferYear: Math.max(status.transferYear, season + 1),
      recruitingCount: status.recruitingCount,
      recruitingYear: season + 1,
    }, `${season} player layer ready for ${result.results.length} teams; depth charts use season production and role fit, with transfer grades preferred over high-school grades when published`);
    return { season, stage: "finalize" as const, teams: result.results.length };
  }

  return { season, stage: "ready" as const, teams: status.teamCount };
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function syncPlayerSeasonBatch(env: PipelineEnv, season = INITIAL_PLAYER_SEASON, maxSteps = 4) {
  const results: Array<Awaited<ReturnType<typeof syncPlayerSeasonStep>>> = [];
  for (let index = 0; index < Math.max(1, Math.min(4, maxSteps)); index += 1) {
    const status = await getPlayerSyncStatus(env, season);
    if (status.ready) break;
    if (index > 0 && ["stats", "success", "usage", "ppa", "transfers", "recruiting"].includes(status.stage)) await pause(2200);
    results.push(await syncPlayerSeasonStep(env, season));
  }
  return { results, status: await getPlayerSyncStatus(env, season) };
}

export async function getPlayerArchiveStatus(env: Pick<PipelineEnv, "DB">) {
  const currentSeason = currentCollegeFootballSeason();
  const seasons = Array.from({ length: currentSeason - FIRST_PLAYER_SEASON + 1 }, (_, index) => FIRST_PLAYER_SEASON + index);
  const result = await env.DB.prepare(`SELECT season,stage,roster_count AS rosterCount,stat_count AS statCount,
      success_count AS successCount,usage_count AS usageCount,ppa_count AS ppaCount,
      transfer_count AS transferCount,transfer_year AS transferYear,
      recruiting_count AS recruitingCount,recruiting_year AS recruitingYear,team_count AS teamCount,
      model_version AS modelVersion,detail,updated_at AS updatedAt
      FROM player_sync_state WHERE season BETWEEN ? AND ? ORDER BY season`)
    .bind(FIRST_PLAYER_SEASON, currentSeason)
    .all<Record<string, unknown>>();
  const bySeason = new Map(result.results.map((row) => [Number(row.season), row]));
  const statuses = seasons.map((season) => playerStatusFromRow(season, bySeason.get(season)));
  return {
    firstSeason: FIRST_PLAYER_SEASON,
    currentSeason,
    missing: statuses.filter((status) => !status.ready).map((status) => status.season),
    seasons: statuses,
  };
}

export async function queueActivePlayerSeasonRefresh(env: Pick<PipelineEnv, "DB">, season = currentCollegeFootballSeason()) {
  if (season !== currentCollegeFootballSeason()) return false;
  const result = await env.DB.prepare(`UPDATE player_sync_state SET
      stage='roster',roster_count=0,stat_count=0,success_count=0,usage_count=0,ppa_count=0,
      transfer_count=0,transfer_year=?,recruiting_count=0,recruiting_year=?,model_version=0,
      detail=?,updated_at=CURRENT_TIMESTAMP WHERE season=?`)
    .bind(PLAYER_TRANSFER_START_YEAR, playerRecruitingStartYear(season), `${season} active roster refresh queued`, season)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function loadPlayerModels(db: D1Database, season: number, requestedTeams: string[] = []) {
  const uniqueTeams = [...new Set(requestedTeams.map((team) => team.trim()).filter(Boolean))].slice(0, 4);
  const profileStatement = uniqueTeams.length
    ? db.prepare(`SELECT team,profile_json AS profileJson,source_quality AS sourceQuality
        FROM player_team_profiles WHERE season=? AND team IN (${uniqueTeams.map(() => "?").join(",")})
        ORDER BY team`).bind(season, ...uniqueTeams)
    : db.prepare(`SELECT team,profile_json AS profileJson,source_quality AS sourceQuality
        FROM player_team_profiles WHERE season=? AND profile_json<>'{}' ORDER BY team`).bind(season);
  const chartStatement = uniqueTeams.length
    ? db.prepare(`SELECT team,chart_json AS chartJson
        FROM depth_chart_snapshots
        WHERE season=? AND verification_status='verified'
          AND team IN (${uniqueTeams.map(() => "?").join(",")})
        ORDER BY team,published_at DESC,updated_at DESC`).bind(season, ...uniqueTeams)
    : null;
  const [profileQuery, chartQuery] = chartStatement
    ? await db.batch<Record<string, unknown>>([profileStatement, chartStatement])
    : [await profileStatement.all<Record<string, unknown>>(), null];
  const archivedCharts = new Map<string, PublishedDepthChart>();
  if (chartQuery) {
    for (const row of chartQuery.results) {
      const team = String(row.team ?? "");
      if (!team || archivedCharts.has(team)) continue;
      const chart = parseJson<PublishedDepthChart | null>(row.chartJson, null);
      if (
        chart
        && chart.season === season
        && chart.team === team
        && Array.isArray(chart.entries)
        && chart.entries.length > 0
      ) archivedCharts.set(team, chart);
    }
  }
  return profileQuery.results.map((row) => ({
    team: String(row.team),
    sourceQuality: String(row.sourceQuality ?? "building"),
    model: (() => {
      const parsed = parseJson<TeamPlayerModel | null>(row.profileJson, null);
      return parsed ? repairTeamPlayerModelDepth(parsed, archivedCharts.get(String(row.team))) : null;
    })(),
  })).filter((row): row is { team: string; sourceQuality: string; model: TeamPlayerModel } => Boolean(row.model));
}

let productionBaselineCache: { expiresAt: number; value: PlayerProductionBaseline } | null = null;
const PRODUCTION_BASELINE_ID = "fbs-2014-present";
const PRODUCTION_BASELINE_MODEL_VERSION = 17;
const PRODUCTION_NORMALIZATION_TEAM_BATCH_SIZE = 8;
const RATED_PLAYER_POSITIONS = new Set(["QB","RB","WR","TE","EDGE","DL","LB","CB","S","K","P"]);

function contextNumber(row: Record<string, unknown> | undefined, key: string, fallback = .5) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function productionContextForPlayer(position: string, row: Record<string, unknown> | undefined) {
  const competitionQuality = contextNumber(row,"competition_quality");
  const passOffense = contextNumber(row,"pass_offense_relative");
  const rushOffense = contextNumber(row,"rush_offense_relative");
  const rushSecondLevel = contextNumber(row,"rush_second_level_relative");
  const rushOpenField = contextNumber(row,"rush_open_field_relative");
  const passDefense = contextNumber(row,"pass_defense_relative");
  const rushDefense = contextNumber(row,"rush_defense_relative");
  const passOffenseSchedule = contextNumber(row,"pass_offense_schedule_quality");
  const rushOffenseSchedule = contextNumber(row,"rush_offense_schedule_quality");
  const passDefenseSchedule = contextNumber(row,"pass_defense_schedule_quality");
  const rushDefenseSchedule = contextNumber(row,"rush_defense_schedule_quality");
  if (["QB","WR","TE"].includes(position)) return {
    competitionQuality,
    opponentRelativeProduction:passOffense,
    opponentUnitQuality:passOffenseSchedule,
    supportQuality:rushOffense,
  };
  if (position === "RB") return {
    competitionQuality,
    opponentRelativeProduction:rushOffense,
    opponentUnitQuality:rushOffenseSchedule,
    supportQuality:passOffense,
    secondLevelQuality:rushSecondLevel,
    openFieldQuality:rushOpenField,
  };
  if (["EDGE","DL"].includes(position)) return {
    competitionQuality,
    opponentRelativeProduction:.35*passDefense+.65*rushDefense,
    opponentUnitQuality:.35*passDefenseSchedule+.65*rushDefenseSchedule,
    supportQuality:.5,
  };
  if (position === "LB") return {
    competitionQuality,
    opponentRelativeProduction:.45*passDefense+.55*rushDefense,
    opponentUnitQuality:.45*passDefenseSchedule+.55*rushDefenseSchedule,
    supportQuality:.5,
  };
  if (["CB","S"].includes(position)) return {
      competitionQuality,
      opponentRelativeProduction:.80*passDefense+.20*rushDefense,
      opponentUnitQuality:.80*passDefenseSchedule+.20*rushDefenseSchedule,
      supportQuality:.5,
    };
  return { competitionQuality,opponentRelativeProduction:.5,opponentUnitQuality:.5,supportQuality:.5 };
}

function hasObservedPlayerProduction(player: PlayerProfile) {
  return (player.productionVolumeScore ?? 0) > 0
    || player.advanced.passingPlays + player.advanced.rushingPlays > 0
    || player.advanced.overallUsage !== null
    || player.stats.some((stat) => (stat.numericValue ?? 0) > 0);
}

function playerProductionRows(
  season: number,
  team: string,
  model: TeamPlayerModel,
  contextRow: Record<string, unknown> | undefined,
  offensiveLineBaseScore: number | undefined,
) {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < model.players.length; index += 1) {
    const player = model.players[index];
    const position = productionPosition(player);
    if (!RATED_PLAYER_POSITIONS.has(position) || !hasObservedPlayerProduction(player)) continue;
    const context = productionContextForPlayer(position,contextRow);
    const score = observedPlayerProductionScore(player,context);
    if (score === null || !Number.isFinite(score) || score <= 0) continue;
    rows.push({
      season,
      team,
      player_key:player.id || `${team}-${index}`,
      position,
      score,
      stars:player.recruitingStars,
      rating_band:recruitingRatingBand(player),
      opponent_relative:context.opponentRelativeProduction,
      opponent_unit_quality:context.opponentUnitQuality,
      support_quality:context.supportQuality,
      usage_rate:player.advanced.overallUsage,
    });
  }
  if (offensiveLineBaseScore !== undefined && Number.isFinite(offensiveLineBaseScore)) {
    const rushRelative = contextNumber(contextRow,"rush_offense_relative");
    const passRelative = contextNumber(contextRow,"pass_offense_relative");
    const frontQuality = contextNumber(contextRow,"rush_offense_schedule_quality");
    rows.push({
      season,
      team,
      player_key:`${team}-offensive-line-unit`,
      position:"OL",
      score:opponentAdjustedOffensiveLineScore(offensiveLineBaseScore,rushRelative,passRelative,frontQuality),
      stars:null,
      rating_band:null,
      opponent_relative:rushRelative,
      opponent_unit_quality:frontQuality,
      support_quality:passRelative,
      usage_rate:null,
    });
  }
  return rows;
}

async function upsertPlayerProductionRows(db: D1Database, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  await db.prepare(`INSERT INTO player_production_scores
      (season,team,player_key,position,score,stars,rating_band,opponent_relative,opponent_unit_quality,support_quality,usage_rate)
    SELECT
      CAST(json_extract(value,'$.season') AS INTEGER),
      CAST(json_extract(value,'$.team') AS TEXT),
      CAST(json_extract(value,'$.player_key') AS TEXT),
      CAST(json_extract(value,'$.position') AS TEXT),
      CAST(json_extract(value,'$.score') AS REAL),
      CAST(json_extract(value,'$.stars') AS INTEGER),
      CAST(json_extract(value,'$.rating_band') AS INTEGER),
      CAST(json_extract(value,'$.opponent_relative') AS REAL),
      CAST(json_extract(value,'$.opponent_unit_quality') AS REAL),
      CAST(json_extract(value,'$.support_quality') AS REAL),
      CAST(json_extract(value,'$.usage_rate') AS REAL)
    FROM json_each(?)
    WHERE 1
    ON CONFLICT(season,team,player_key) DO UPDATE SET
      position=excluded.position,score=excluded.score,stars=excluded.stars,rating_band=excluded.rating_band,
      opponent_relative=excluded.opponent_relative,opponent_unit_quality=excluded.opponent_unit_quality,
      support_quality=excluded.support_quality,usage_rate=excluded.usage_rate`)
    .bind(JSON.stringify(rows))
    .run();
}

export type PlayerTeamRatingContext = {
  competitionQuality: number;
  passOffenseRelative: number;
  rushOffenseRelative: number;
  rushSecondLevelRelative: number;
  rushOpenFieldRelative: number;
  passDefenseRelative: number;
  rushDefenseRelative: number;
  passOffenseScheduleQuality: number;
  rushOffenseScheduleQuality: number;
  passDefenseScheduleQuality: number;
  rushDefenseScheduleQuality: number;
};

export const PLAYER_COMPETITION_CTES = `
selected_player_season AS (
  SELECT ? AS season
),
selected_player_teams AS (
  SELECT CAST(value AS TEXT) AS team
  FROM json_each(?)
),
latest_team_profiles AS (
  SELECT profile.season,profile.team,MAX(profile.week) AS week
  FROM weekly_profiles profile
  JOIN selected_player_season selected ON selected.season=profile.season
  WHERE profile.games_played>=4
  GROUP BY profile.season,profile.team
),
team_power AS (
  SELECT
    profile.season,
    profile.team,
    MAX(0.0,MIN(1.0,(
      (
        profile.off_ypp_index+profile.off_ypa_index+profile.off_ypc_index
        +1.0/NULLIF(profile.def_ypp_index,0)
        +1.0/NULLIF(profile.def_ypa_index,0)
        +1.0/NULLIF(profile.def_ypc_index,0)
      )/6.0-.75
    )/.5)) AS power_quality
  FROM weekly_profiles profile
  JOIN latest_team_profiles latest
    ON latest.season=profile.season AND latest.team=profile.team AND latest.week=profile.week
),
team_games AS (
  SELECT game.season,game.home_team AS team,game.away_team AS opponent,
    CASE WHEN game.home_points>game.away_points THEN 1.0 WHEN game.home_points=game.away_points THEN .5 ELSE 0.0 END AS won
  FROM cfb_games game
  JOIN selected_player_season selected ON selected.season=game.season
  WHERE game.completed=1 AND game.home_points IS NOT NULL AND game.away_points IS NOT NULL
  UNION ALL
  SELECT game.season,game.away_team AS team,game.home_team AS opponent,
    CASE WHEN game.away_points>game.home_points THEN 1.0 WHEN game.home_points=game.away_points THEN .5 ELSE 0.0 END AS won
  FROM cfb_games game
  JOIN selected_player_season selected ON selected.season=game.season
  WHERE game.completed=1 AND game.home_points IS NOT NULL AND game.away_points IS NOT NULL
),
team_records AS (
  SELECT season,team,AVG(won) AS win_pct
  FROM team_games
  GROUP BY season,team
),
team_competition AS (
  SELECT
    game.season,
    game.team,
    AVG(CASE
      WHEN opponent_power.team IS NULL THEN .08
      ELSE .65*COALESCE(opponent_power.power_quality,.25)+.35*COALESCE(opponent_record.win_pct,.5)
    END) AS competition_quality
  FROM team_games game
  LEFT JOIN team_power opponent_power
    ON opponent_power.season=game.season AND opponent_power.team=game.opponent
  LEFT JOIN team_records opponent_record
    ON opponent_record.season=game.season AND opponent_record.team=game.opponent
  GROUP BY game.season,game.team
)`;

/**
 * Position-unit context from actual team-game output versus the exact
 * opponent's leave-one-out season allowance. The residual answers whether a
 * unit produced more or less than that opponent normally conceded; the
 * schedule-quality fields separately retain how strong those units were.
 */
export const PLAYER_OPPONENT_CONTEXT_CTES = `
player_unit_power AS (
  SELECT
    profile.season,
    profile.team,
    MAX(0.0,MIN(1.0,(profile.off_ypa_index-.75)/.5)) AS pass_off_quality,
    MAX(0.0,MIN(1.0,(profile.off_ypc_index-.75)/.5)) AS rush_off_quality,
    MAX(0.0,MIN(1.0,((1.0/NULLIF(profile.def_ypa_index,0))-.75)/.5)) AS pass_def_quality,
    MAX(0.0,MIN(1.0,((1.0/NULLIF(profile.def_ypc_index,0))-.75)/.5)) AS rush_def_quality
  FROM weekly_profiles profile
  JOIN latest_team_profiles latest
    ON latest.season=profile.season AND latest.team=profile.team AND latest.week=profile.week
),
player_game_samples AS (
  SELECT
    stats.season,
    stats.game_id,
    stats.team,
    stats.opponent,
    MAX(0.0,stats.pass_yards) AS pass_yards,
    MAX(0.0,stats.pass_attempts) AS pass_attempts,
    MAX(0.0,stats.rush_yards) AS rush_yards,
    MAX(0.0,stats.rush_attempts) AS rush_attempts,
    advanced.off_passing_success_rate AS pass_success,
    advanced.off_line_yards AS line_yards,
    advanced.off_second_level_yards AS second_level_yards,
    advanced.off_open_field_yards AS open_field_yards
  FROM team_game_stats stats
  JOIN selected_player_season selected ON selected.season=stats.season
  LEFT JOIN team_game_advanced_stats advanced
    ON advanced.game_id=stats.game_id AND advanced.team=stats.team
  WHERE stats.pass_attempts+stats.rush_attempts>0
),
player_defense_allowance AS (
  SELECT
    season,
    opponent AS team,
    SUM(pass_yards) AS pass_yards,
    SUM(pass_attempts) AS pass_attempts,
    SUM(rush_yards) AS rush_yards,
    SUM(rush_attempts) AS rush_attempts,
    SUM(CASE WHEN pass_success IS NULL THEN 0 ELSE pass_success END) AS pass_success_sum,
    SUM(CASE WHEN pass_success IS NULL THEN 0 ELSE 1 END) AS pass_success_count,
    SUM(CASE WHEN line_yards IS NULL THEN 0 ELSE line_yards END) AS line_yards_sum,
    SUM(CASE WHEN line_yards IS NULL THEN 0 ELSE 1 END) AS line_yards_count,
    SUM(CASE WHEN second_level_yards IS NULL THEN 0 ELSE second_level_yards END) AS second_level_yards_sum,
    SUM(CASE WHEN second_level_yards IS NULL THEN 0 ELSE 1 END) AS second_level_yards_count,
    SUM(CASE WHEN open_field_yards IS NULL THEN 0 ELSE open_field_yards END) AS open_field_yards_sum,
    SUM(CASE WHEN open_field_yards IS NULL THEN 0 ELSE 1 END) AS open_field_yards_count
  FROM player_game_samples
  GROUP BY season,opponent
),
player_offense_output AS (
  SELECT
    season,
    team,
    SUM(pass_yards) AS pass_yards,
    SUM(pass_attempts) AS pass_attempts,
    SUM(rush_yards) AS rush_yards,
    SUM(rush_attempts) AS rush_attempts,
    SUM(CASE WHEN pass_success IS NULL THEN 0 ELSE pass_success END) AS pass_success_sum,
    SUM(CASE WHEN pass_success IS NULL THEN 0 ELSE 1 END) AS pass_success_count,
    SUM(CASE WHEN line_yards IS NULL THEN 0 ELSE line_yards END) AS line_yards_sum,
    SUM(CASE WHEN line_yards IS NULL THEN 0 ELSE 1 END) AS line_yards_count,
    SUM(CASE WHEN second_level_yards IS NULL THEN 0 ELSE second_level_yards END) AS second_level_yards_sum,
    SUM(CASE WHEN second_level_yards IS NULL THEN 0 ELSE 1 END) AS second_level_yards_count,
    SUM(CASE WHEN open_field_yards IS NULL THEN 0 ELSE open_field_yards END) AS open_field_yards_sum,
    SUM(CASE WHEN open_field_yards IS NULL THEN 0 ELSE 1 END) AS open_field_yards_count
  FROM player_game_samples
  GROUP BY season,team
),
player_offense_game_residual AS (
  SELECT
    sample.season,
    sample.team,
    sample.pass_attempts,
    sample.rush_attempts,
    CASE WHEN sample.pass_attempts>0 AND allowance.pass_attempts-sample.pass_attempts>=40 THEN
      MAX(.5,MIN(1.5,
        (sample.pass_yards/NULLIF(sample.pass_attempts,0))
        /NULLIF((allowance.pass_yards-sample.pass_yards)/NULLIF(allowance.pass_attempts-sample.pass_attempts,0),0)
      )) END AS pass_yards_ratio,
    CASE WHEN sample.pass_success IS NOT NULL AND allowance.pass_success_count>1 THEN
      MAX(.5,MIN(1.5,
        sample.pass_success
        /NULLIF((allowance.pass_success_sum-sample.pass_success)/NULLIF(allowance.pass_success_count-1,0),0)
      )) END AS pass_success_ratio,
    CASE WHEN sample.rush_attempts>0 AND allowance.rush_attempts-sample.rush_attempts>=40 THEN
      MAX(.5,MIN(1.5,
        (sample.rush_yards/NULLIF(sample.rush_attempts,0))
        /NULLIF((allowance.rush_yards-sample.rush_yards)/NULLIF(allowance.rush_attempts-sample.rush_attempts,0),0)
      )) END AS rush_yards_ratio,
    CASE WHEN sample.line_yards IS NOT NULL AND allowance.line_yards_count>1 THEN
      MAX(.5,MIN(1.5,
        sample.line_yards
        /NULLIF((allowance.line_yards_sum-sample.line_yards)/NULLIF(allowance.line_yards_count-1,0),0)
      )) END AS line_yards_ratio,
    CASE WHEN sample.second_level_yards IS NOT NULL AND allowance.second_level_yards_count>1 THEN
      MAX(.5,MIN(1.5,
        sample.second_level_yards
        /NULLIF((allowance.second_level_yards_sum-sample.second_level_yards)/NULLIF(allowance.second_level_yards_count-1,0),0)
      )) END AS second_level_yards_ratio,
    CASE WHEN sample.open_field_yards IS NOT NULL AND allowance.open_field_yards_count>1 THEN
      MAX(.5,MIN(1.5,
        sample.open_field_yards
        /NULLIF((allowance.open_field_yards_sum-sample.open_field_yards)/NULLIF(allowance.open_field_yards_count-1,0),0)
      )) END AS open_field_yards_ratio,
    opponent_power.pass_def_quality,
    opponent_power.rush_def_quality
  FROM player_game_samples sample
  LEFT JOIN player_defense_allowance allowance
    ON allowance.season=sample.season AND allowance.team=sample.opponent
  LEFT JOIN player_unit_power opponent_power
    ON opponent_power.season=sample.season AND opponent_power.team=sample.opponent
),
player_offense_context AS (
  SELECT
    season,
    team,
    SUM(pass_attempts*COALESCE(
      .65*pass_yards_ratio+.35*pass_success_ratio,
      pass_yards_ratio,
      pass_success_ratio,
      1.0
    ))/NULLIF(SUM(pass_attempts),0) AS pass_relative_ratio,
    SUM(rush_attempts*COALESCE(
      .70*rush_yards_ratio+.30*line_yards_ratio,
      rush_yards_ratio,
      line_yards_ratio,
      1.0
    ))/NULLIF(SUM(rush_attempts),0) AS rush_relative_ratio,
    SUM(rush_attempts*COALESCE(second_level_yards_ratio,1.0))
      /NULLIF(SUM(rush_attempts),0) AS second_level_relative_ratio,
    SUM(rush_attempts*COALESCE(open_field_yards_ratio,1.0))
      /NULLIF(SUM(rush_attempts),0) AS open_field_relative_ratio,
    SUM(pass_attempts*COALESCE(pass_def_quality,.5))/NULLIF(SUM(pass_attempts),0) AS pass_schedule_quality,
    SUM(rush_attempts*COALESCE(rush_def_quality,.5))/NULLIF(SUM(rush_attempts),0) AS rush_schedule_quality
  FROM player_offense_game_residual
  GROUP BY season,team
),
player_defense_game_residual AS (
  SELECT
    sample.season,
    sample.opponent AS team,
    sample.pass_attempts,
    sample.rush_attempts,
    CASE WHEN sample.pass_attempts>0 AND output.pass_attempts-sample.pass_attempts>=40 THEN
      MAX(.5,MIN(1.5,
        ((output.pass_yards-sample.pass_yards)/NULLIF(output.pass_attempts-sample.pass_attempts,0))
        /NULLIF(sample.pass_yards/NULLIF(sample.pass_attempts,0),0)
      )) END AS pass_yards_ratio,
    CASE WHEN sample.pass_success IS NOT NULL AND output.pass_success_count>1 THEN
      MAX(.5,MIN(1.5,
        ((output.pass_success_sum-sample.pass_success)/NULLIF(output.pass_success_count-1,0))
        /NULLIF(sample.pass_success,0)
      )) END AS pass_success_ratio,
    CASE WHEN sample.rush_attempts>0 AND output.rush_attempts-sample.rush_attempts>=40 THEN
      MAX(.5,MIN(1.5,
        ((output.rush_yards-sample.rush_yards)/NULLIF(output.rush_attempts-sample.rush_attempts,0))
        /NULLIF(sample.rush_yards/NULLIF(sample.rush_attempts,0),0)
      )) END AS rush_yards_ratio,
    CASE WHEN sample.line_yards IS NOT NULL AND output.line_yards_count>1 THEN
      MAX(.5,MIN(1.5,
        ((output.line_yards_sum-sample.line_yards)/NULLIF(output.line_yards_count-1,0))
        /NULLIF(sample.line_yards,0)
      )) END AS line_yards_ratio,
    offense_power.pass_off_quality,
    offense_power.rush_off_quality
  FROM player_game_samples sample
  LEFT JOIN player_offense_output output
    ON output.season=sample.season AND output.team=sample.team
  LEFT JOIN player_unit_power offense_power
    ON offense_power.season=sample.season AND offense_power.team=sample.team
),
player_defense_context AS (
  SELECT
    season,
    team,
    SUM(pass_attempts*COALESCE(
      .65*pass_yards_ratio+.35*pass_success_ratio,
      pass_yards_ratio,
      pass_success_ratio,
      1.0
    ))/NULLIF(SUM(pass_attempts),0) AS pass_relative_ratio,
    SUM(rush_attempts*COALESCE(
      .70*rush_yards_ratio+.30*line_yards_ratio,
      rush_yards_ratio,
      line_yards_ratio,
      1.0
    ))/NULLIF(SUM(rush_attempts),0) AS rush_relative_ratio,
    SUM(pass_attempts*COALESCE(pass_off_quality,.5))/NULLIF(SUM(pass_attempts),0) AS pass_schedule_quality,
    SUM(rush_attempts*COALESCE(rush_off_quality,.5))/NULLIF(SUM(rush_attempts),0) AS rush_schedule_quality
  FROM player_defense_game_residual
  GROUP BY season,team
),
team_player_context AS (
  SELECT
    team.season,
    team.team,
    COALESCE(competition.competition_quality,.5) AS competition_quality,
    MAX(0.0,MIN(1.0,(COALESCE(offense.pass_relative_ratio,1.0)-.75)/.5)) AS pass_offense_relative,
    MAX(0.0,MIN(1.0,(COALESCE(offense.rush_relative_ratio,1.0)-.75)/.5)) AS rush_offense_relative,
    MAX(0.0,MIN(1.0,(COALESCE(offense.second_level_relative_ratio,1.0)-.75)/.5)) AS rush_second_level_relative,
    MAX(0.0,MIN(1.0,(COALESCE(offense.open_field_relative_ratio,1.0)-.75)/.5)) AS rush_open_field_relative,
    MAX(0.0,MIN(1.0,(COALESCE(defense.pass_relative_ratio,1.0)-.75)/.5)) AS pass_defense_relative,
    MAX(0.0,MIN(1.0,(COALESCE(defense.rush_relative_ratio,1.0)-.75)/.5)) AS rush_defense_relative,
    COALESCE(offense.pass_schedule_quality,.5) AS pass_offense_schedule_quality,
    COALESCE(offense.rush_schedule_quality,.5) AS rush_offense_schedule_quality,
    COALESCE(defense.pass_schedule_quality,.5) AS pass_defense_schedule_quality,
    COALESCE(defense.rush_schedule_quality,.5) AS rush_defense_schedule_quality
  FROM cfb_teams team
  JOIN selected_player_season selected ON selected.season=team.season
  LEFT JOIN team_competition competition
    ON competition.season=team.season AND competition.team=team.team
  LEFT JOIN player_offense_context offense
    ON offense.season=team.season AND offense.team=team.team
  LEFT JOIN player_defense_context defense
    ON defense.season=team.season AND defense.team=team.team
)`;

export const PLAYER_TEAM_RATING_CONTEXT_SQL = `
WITH ${PLAYER_COMPETITION_CTES},
${PLAYER_OPPONENT_CONTEXT_CTES}
SELECT context.*
FROM team_player_context context
JOIN selected_player_teams selected_team ON selected_team.team=context.team
ORDER BY context.team
`;

export const PLAYER_PRODUCTION_NORMALIZE_SQL = `
WITH selected_player_season AS (
  SELECT ? AS season
),
selected_player_teams AS (
  SELECT CAST(value AS TEXT) AS team
  FROM json_each(?)
),
team_player_context AS (
  SELECT
    CAST(json_extract(value,'$.season') AS INTEGER) AS season,
    CAST(json_extract(value,'$.team') AS TEXT) AS team,
    CAST(json_extract(value,'$.competition_quality') AS REAL) AS competition_quality,
    CAST(json_extract(value,'$.pass_offense_relative') AS REAL) AS pass_offense_relative,
    CAST(json_extract(value,'$.rush_offense_relative') AS REAL) AS rush_offense_relative,
    CAST(json_extract(value,'$.pass_defense_relative') AS REAL) AS pass_defense_relative,
    CAST(json_extract(value,'$.rush_defense_relative') AS REAL) AS rush_defense_relative,
    CAST(json_extract(value,'$.pass_offense_schedule_quality') AS REAL) AS pass_offense_schedule_quality,
    CAST(json_extract(value,'$.rush_offense_schedule_quality') AS REAL) AS rush_offense_schedule_quality,
    CAST(json_extract(value,'$.pass_defense_schedule_quality') AS REAL) AS pass_defense_schedule_quality,
    CAST(json_extract(value,'$.rush_defense_schedule_quality') AS REAL) AS rush_defense_schedule_quality
  FROM json_each(?)
),
player_rows AS (
  SELECT
    ptp.season,
    ptp.team,
    COALESCE(
      NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
      NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
      printf('%s-%s',ptp.team,player.key)
    ) AS player_key,
    CASE
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH'))='HB' THEN 'RB'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH'))='FB' THEN 'RB'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('DE','EDGE','OLB') THEN 'EDGE'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('DT','NT','DL') THEN 'DL'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('ILB','MLB','WLB','SLB') THEN 'LB'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('S','SS','FS','DB','NB','STAR') THEN 'S'
      WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('OL','OT','OG','C','LT','LG','RG','RT') THEN 'OL'
      ELSE UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH'))
    END AS position,
    CAST(COALESCE(
      json_extract(player.value,'$.productionVolumeScore'),
      json_extract(player.value,'$.productionScore'),
      json_extract(player.value,'$.impactScore')
    ) AS REAL) AS volume_score,
    COALESCE(json_extract(player.value,'$.productionVolumeScore'),json_extract(player.value,'$.productionScore')) AS direct_score,
    CAST(json_extract(player.value,'$.recruitingStars') AS INTEGER) AS stars,
    CASE
      WHEN CAST(json_extract(player.value,'$.recruitingRating') AS REAL)<=1.5
        THEN ROUND(CAST(json_extract(player.value,'$.recruitingRating') AS REAL)*50)*2
      ELSE ROUND(CAST(json_extract(player.value,'$.recruitingRating') AS REAL)/2)*2
    END AS rating_band,
    COALESCE(json_array_length(json_extract(player.value,'$.stats')),0) AS stat_count,
    COALESCE(CAST(json_extract(player.value,'$.advanced.passingPlays') AS INTEGER),0)
      + COALESCE(CAST(json_extract(player.value,'$.advanced.rushingPlays') AS INTEGER),0) AS advanced_plays,
    CAST(json_extract(player.value,'$.advanced.overallUsage') AS REAL) AS usage,
    CAST(json_extract(player.value,'$.advanced.averagePpa') AS REAL) AS average_ppa,
    CAST(json_extract(player.value,'$.advanced.passPpa') AS REAL) AS pass_ppa,
    CAST(json_extract(player.value,'$.advanced.rushPpa') AS REAL) AS rush_ppa,
    CAST(json_extract(player.value,'$.advanced.passingSuccessRate') AS REAL) AS passing_success,
    CAST(json_extract(player.value,'$.advanced.rushingSuccessRate') AS REAL) AS rushing_success,
    COALESCE(CAST(json_extract(player.value,'$.advanced.passingPlays') AS INTEGER),0) AS passing_plays,
    COALESCE(CAST(json_extract(player.value,'$.advanced.rushingPlays') AS INTEGER),0) AS rushing_plays,
    player.value AS player_json
  FROM player_team_profiles ptp
  JOIN selected_player_season selected ON selected.season=ptp.season
  JOIN selected_player_teams selected_team ON selected_team.team=ptp.team
  JOIN json_each(ptp.profile_json,'$.players') AS player ON TRUE
  WHERE ptp.profile_json<>'{}'
),
stat_rows AS (
  SELECT
    player.*,
    LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) AS category_key,
    LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) AS stat_key,
    CAST(json_extract(stat.value,'$.numericValue') AS REAL) AS stat_value
  FROM player_rows player
  LEFT JOIN json_each(player.player_json,'$.stats') AS stat ON TRUE
),
box_scores AS (
  SELECT
    season,team,player_key,position,volume_score,direct_score,stars,rating_band,stat_count,
    advanced_plays,usage,average_ppa,pass_ppa,rush_ppa,passing_success,rushing_success,passing_plays,rushing_plays,
    MAX(CASE WHEN category_key='passing' AND stat_key IN ('att','attempts','passingattempts') THEN stat_value ELSE 0 END) AS pass_attempts,
    MAX(CASE WHEN category_key='passing' AND stat_key IN ('yds','yards','passingyards') THEN stat_value ELSE 0 END) AS pass_yards,
    MAX(CASE WHEN category_key='passing' AND stat_key IN ('td','touchdowns','passingtouchdowns') THEN stat_value ELSE 0 END) AS pass_td,
    MAX(CASE WHEN category_key='passing' AND stat_key IN ('int','interceptions') THEN stat_value ELSE 0 END) AS pass_interceptions,
    MAX(CASE WHEN category_key='rushing' AND stat_key IN ('car','att','attempts','carries') THEN stat_value ELSE 0 END) AS rush_attempts,
    MAX(CASE WHEN category_key='rushing' AND stat_key IN ('yds','yards','rushingyards') THEN stat_value ELSE 0 END) AS rush_yards,
    MAX(CASE WHEN category_key='rushing' AND stat_key IN ('td','touchdowns','rushingtouchdowns') THEN stat_value ELSE 0 END) AS rush_td,
    MAX(CASE WHEN category_key='receiving' AND stat_key IN ('rec','receptions') THEN stat_value ELSE 0 END) AS receptions,
    MAX(CASE WHEN category_key='receiving' AND stat_key IN ('yds','yards','receivingyards') THEN stat_value ELSE 0 END) AS receiving_yards,
    MAX(CASE WHEN category_key='receiving' AND stat_key IN ('td','touchdowns','receivingtouchdowns') THEN stat_value ELSE 0 END) AS receiving_td,
    MAX(CASE WHEN category_key='kickreturns' AND stat_key IN ('no','returns','kickreturns') THEN stat_value ELSE 0 END) AS kick_returns,
    MAX(CASE WHEN category_key='kickreturns' AND stat_key IN ('yds','yards','kickreturnyards') THEN stat_value ELSE 0 END) AS kick_return_yards,
    MAX(CASE WHEN category_key='kickreturns' AND stat_key IN ('td','touchdowns','kickreturntouchdowns') THEN stat_value ELSE 0 END) AS kick_return_td,
    MAX(CASE WHEN category_key='puntreturns' AND stat_key IN ('no','returns','puntreturns') THEN stat_value ELSE 0 END) AS punt_returns,
    MAX(CASE WHEN category_key='puntreturns' AND stat_key IN ('yds','yards','puntreturnyards') THEN stat_value ELSE 0 END) AS punt_return_yards,
    MAX(CASE WHEN category_key='puntreturns' AND stat_key IN ('td','touchdowns','puntreturntouchdowns') THEN stat_value ELSE 0 END) AS punt_return_td,
    MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('tot','total','tackles','totaltackles') THEN stat_value ELSE 0 END) AS tackles,
    MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('tfl','tacklesforloss') THEN stat_value ELSE 0 END) AS tfl,
    MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('sack','sacks') THEN stat_value ELSE 0 END) AS sacks,
    MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('qbhur','qbhurries','hurries') THEN stat_value ELSE 0 END) AS qb_hurries,
    MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('pd','passesdefended','passbreakups') THEN stat_value ELSE 0 END) AS passes_defended,
    MAX(CASE WHEN category_key IN ('defensive','defense','interceptions') AND stat_key IN ('int','interceptions') THEN stat_value ELSE 0 END) AS defensive_interceptions,
    MAX(CASE WHEN category_key IN ('fumbles','defensive','defense') AND stat_key IN ('rec','recoveries','fumblerecoveries') THEN stat_value ELSE 0 END) AS fumble_recoveries,
    MAX(CASE WHEN category_key='kicking' AND stat_key IN ('fgm','fieldgoalsmade') THEN stat_value ELSE 0 END) AS field_goals_made,
    MAX(CASE WHEN category_key='kicking' AND stat_key IN ('fga','fieldgoalsattempted') THEN stat_value ELSE 0 END) AS field_goals_attempted,
    MAX(CASE WHEN category_key='punting' AND stat_key IN ('no','punts','puntattempts') THEN stat_value ELSE 0 END) AS punts,
    MAX(CASE WHEN category_key='punting' AND stat_key IN ('yds','yards','puntyards') THEN stat_value ELSE 0 END) AS punt_yards
  FROM stat_rows
  GROUP BY season,team,player_key
),
features AS (
  SELECT
    box.*,
    COALESCE(context.competition_quality,.5) AS competition_quality,
    CASE
      WHEN position IN ('QB','WR','TE') THEN COALESCE(pass_ppa,average_ppa)
      WHEN position='RB' THEN COALESCE(average_ppa,rush_ppa)
      WHEN position IN ('EDGE','DL','LB','CB','S') THEN NULL
      ELSE average_ppa
    END AS selected_ppa,
    CASE
      WHEN position IN ('QB','WR','TE') THEN passing_success
      WHEN position='RB' THEN rushing_success
      WHEN position IN ('EDGE','DL','LB','CB','S') THEN NULL
      WHEN passing_plays+rushing_plays>0 THEN
        (COALESCE(passing_success,0)*passing_plays+COALESCE(rushing_success,0)*rushing_plays)
        /NULLIF(passing_plays+rushing_plays,0)
      ELSE COALESCE(passing_success,rushing_success)
    END AS selected_success,
    CASE
      WHEN position='QB' THEN pass_attempts
      WHEN position='RB' THEN rush_attempts+receptions
      WHEN position IN ('WR','TE') THEN receptions
      WHEN position IN ('EDGE','DL','LB','CB','S') THEN
        tackles+2*passes_defended+4*defensive_interceptions+2*tfl+2*sacks+qb_hurries+3*fumble_recoveries
      WHEN position='K' THEN field_goals_attempted
      WHEN position='P' THEN punts
      ELSE advanced_plays
    END AS opportunities,
    CASE
      WHEN position='QB' THEN
        pass_attempts*.25+pass_yards/45.0+pass_td*2.5
      WHEN position='RB' THEN
        rush_attempts*.38+rush_yards/20.0+receptions*.9+receiving_yards/25.0
        +(rush_td+receiving_td)*2.3
        +(kick_return_yards+punt_return_yards)/60.0
        +(kick_return_td+punt_return_td)*2.0
      WHEN position IN ('WR','TE') THEN
        receptions*1.6+receiving_yards/17.0+receiving_td*3.0
        +(kick_return_yards+punt_return_yards)/70.0
        +(kick_return_td+punt_return_td)*2.0
      WHEN position IN ('EDGE','DL','LB','CB','S') THEN
        tackles*.7+tfl*3.0+sacks*4.0+qb_hurries*.7
        +passes_defended*2.0+defensive_interceptions*6.0+fumble_recoveries*4.0
      WHEN position='K' THEN COALESCE(volume_score,field_goals_made*4.0)
      WHEN position='P' THEN punt_yards/25.0+punts*.35
      ELSE COALESCE(volume_score,0)
    END AS production_load,
    CASE
      WHEN position='QB' AND pass_attempts>0 THEN
        .5*MAX(0.0,MIN(1.0,((pass_yards/pass_attempts)-4.0)/7.0))
        +.3*MAX(0.0,MIN(1.0,(pass_td/pass_attempts)/.1))
        +.2*(1.0-MAX(0.0,MIN(1.0,(pass_interceptions/pass_attempts)/.08)))
      WHEN position='RB' AND rush_attempts+receptions>0 THEN
        .75*MAX(0.0,MIN(1.0,
          (((rush_yards+receiving_yards)/NULLIF(rush_attempts+receptions,0))-2.5)/5.0
        ))
        +.25*MAX(0.0,MIN(1.0,
          ((rush_td+receiving_td)/NULLIF(rush_attempts+receptions,0))/.08
        ))
      WHEN position IN ('WR','TE') AND receptions>0 THEN
        .75*MAX(0.0,MIN(1.0,((receiving_yards/receptions)-6.0)/14.0))
        +.25*MAX(0.0,MIN(1.0,(receiving_td/receptions)/.15))
      WHEN position='LB' AND tackles+tfl+sacks+passes_defended+defensive_interceptions+qb_hurries+fumble_recoveries>0 THEN
        .55*(tackles/(tackles+45.0))
        +.45*MAX(0.0,MIN(1.0,
          ((tfl*1.25+sacks*2.25+passes_defended*1.1+defensive_interceptions*3.5+qb_hurries*.5+fumble_recoveries*2.0)
          /MAX(1.0,tackles))/.55))
      WHEN position IN ('EDGE','DL') AND tackles+tfl+sacks+passes_defended+defensive_interceptions+qb_hurries+fumble_recoveries>0 THEN
        .30*(tackles/(tackles+32.0))
        +.70*MAX(0.0,MIN(1.0,
          ((tfl*1.25+sacks*2.25+passes_defended*1.1+defensive_interceptions*3.5+qb_hurries*.5+fumble_recoveries*2.0)
          /MAX(1.0,tackles))/.55))
      WHEN position='CB' AND tackles+passes_defended+defensive_interceptions>0 THEN
        .20*(tackles/(tackles+32.0))
        +.80*MAX(0.0,MIN(1.0,(passes_defended+3.0*defensive_interceptions)/12.0))
      WHEN position='S' AND tackles+passes_defended+defensive_interceptions>0 THEN
        .45*(tackles/(tackles+45.0))
        +.55*MAX(0.0,MIN(1.0,(passes_defended+3.0*defensive_interceptions)/16.0))
      WHEN position='K' AND field_goals_attempted>0 THEN
        MAX(0.0,MIN(1.0,field_goals_made/field_goals_attempted))
      WHEN position='P' AND punts>0 THEN
        MAX(0.0,MIN(1.0,((punt_yards/punts)-30.0)/20.0))
      ELSE NULL
    END AS box_efficiency,
    CASE
      WHEN position IN ('QB','WR','TE') THEN COALESCE(context.pass_offense_relative,.5)
      WHEN position='RB' THEN COALESCE(context.rush_offense_relative,.5)
      WHEN position IN ('EDGE','DL') THEN .35*COALESCE(context.pass_defense_relative,.5)+.65*COALESCE(context.rush_defense_relative,.5)
      WHEN position='LB' THEN .45*COALESCE(context.pass_defense_relative,.5)+.55*COALESCE(context.rush_defense_relative,.5)
      WHEN position IN ('CB','S') THEN .80*COALESCE(context.pass_defense_relative,.5)+.20*COALESCE(context.rush_defense_relative,.5)
      ELSE .5
    END AS opponent_relative,
    CASE
      WHEN position IN ('QB','WR','TE') THEN COALESCE(context.pass_offense_schedule_quality,.5)
      WHEN position='RB' THEN COALESCE(context.rush_offense_schedule_quality,.5)
      WHEN position IN ('EDGE','DL') THEN .35*COALESCE(context.pass_defense_schedule_quality,.5)+.65*COALESCE(context.rush_defense_schedule_quality,.5)
      WHEN position='LB' THEN .45*COALESCE(context.pass_defense_schedule_quality,.5)+.55*COALESCE(context.rush_defense_schedule_quality,.5)
      WHEN position IN ('CB','S') THEN .80*COALESCE(context.pass_defense_schedule_quality,.5)+.20*COALESCE(context.rush_defense_schedule_quality,.5)
      ELSE .5
    END AS opponent_unit_quality,
    CASE
      WHEN position IN ('QB','WR','TE') THEN COALESCE(context.rush_offense_relative,.5)
      WHEN position='RB' THEN COALESCE(context.pass_offense_relative,.5)
      ELSE .5
    END AS support_quality
  FROM box_scores box
  LEFT JOIN team_player_context context
    ON context.season=box.season AND context.team=box.team
),
components AS (
  SELECT
    features.*,
    MAX(0.0,MIN(1.0,production_load/CASE position
      WHEN 'QB' THEN 440.0
      WHEN 'RB' THEN 450.0
      WHEN 'WR' THEN 380.0
      WHEN 'TE' THEN 220.0
      WHEN 'EDGE' THEN 200.0
      WHEN 'DL' THEN 185.0
      WHEN 'LB' THEN 220.0
      WHEN 'CB' THEN 150.0
      WHEN 'S' THEN 190.0
      WHEN 'K' THEN 150.0
      WHEN 'P' THEN 190.0
      ELSE 200.0 END)) AS volume_component,
    MAX(0.0,MIN(1.0,CASE position
      WHEN 'QB' THEN pass_attempts/(MAX(0.0,pass_attempts)+160.0)
      WHEN 'RB' THEN opportunities/(MAX(0.0,opportunities)+110.0)
      WHEN 'WR' THEN opportunities/(MAX(0.0,opportunities)+42.0)
      WHEN 'TE' THEN opportunities/(MAX(0.0,opportunities)+32.0)
      WHEN 'EDGE' THEN opportunities/(MAX(0.0,opportunities)+65.0)
      WHEN 'DL' THEN opportunities/(MAX(0.0,opportunities)+65.0)
      WHEN 'LB' THEN opportunities/(MAX(0.0,opportunities)+70.0)
      WHEN 'CB' THEN opportunities/(MAX(0.0,opportunities)+55.0)
      WHEN 'S' THEN opportunities/(MAX(0.0,opportunities)+65.0)
      WHEN 'K' THEN opportunities/(MAX(0.0,opportunities)+12.0)
      WHEN 'P' THEN opportunities/(MAX(0.0,opportunities)+25.0)
      ELSE opportunities/(MAX(0.0,opportunities)+50.0)
    END)) AS reliability,
    MAX(0.0,MIN(1.0,CASE position
      WHEN 'QB' THEN pass_attempts/300.0
      WHEN 'RB' THEN opportunities/260.0
      WHEN 'WR' THEN opportunities/80.0
      WHEN 'TE' THEN opportunities/55.0
      WHEN 'EDGE' THEN opportunities/135.0
      WHEN 'DL' THEN opportunities/135.0
      WHEN 'LB' THEN opportunities/150.0
      WHEN 'CB' THEN opportunities/110.0
      WHEN 'S' THEN opportunities/135.0
      WHEN 'K' THEN opportunities/28.0
      WHEN 'P' THEN opportunities/55.0
      ELSE opportunities/100.0
    END)) AS sample_proof,
    CASE WHEN selected_ppa IS NULL THEN NULL
      ELSE MAX(0.0,MIN(1.0,(selected_ppa+.15)/.9)) END AS ppa_component,
    CASE WHEN selected_success IS NULL THEN NULL
      ELSE MAX(0.0,MIN(1.0,(selected_success-.25)/.4)) END AS success_component,
    MAX(0.0,MIN(1.0,CASE
      WHEN usage IS NULL THEN COALESCE(volume_score,0)/(MAX(0.0,COALESCE(volume_score,0))+100.0)
      WHEN position='QB' THEN usage/.78
      WHEN position='RB' THEN usage/.45
      WHEN position='WR' THEN usage/.30
      WHEN position='TE' THEN usage/.24
      ELSE usage/.35
    END)) AS usage_component
  FROM features
),
regressed AS (
  SELECT
    components.*,
    COALESCE(.5+reliability*(ppa_component-.5),.5) AS regressed_ppa,
    COALESCE(.5+reliability*(success_component-.5),.5) AS regressed_success,
    COALESCE(.5+reliability*(box_efficiency-.5),.5) AS regressed_box
  FROM components
),
rating_parts AS (
  SELECT
    regressed.*,
    .32*regressed_ppa+.24*regressed_success+.44*regressed_box AS proven_quality,
    MAX(0.0,MIN(1.0,
      .5+reliability*(
        .82*(MAX(0.0,MIN(1.0,opponent_relative))-.5)
        +.14*(MAX(0.0,MIN(1.0,opponent_unit_quality))-.5)
        +.04*(MAX(0.0,MIN(1.0,competition_quality))-.5)
      )
    )) AS opponent_proof,
    .65*volume_component+.35*usage_component AS workload
  FROM regressed
),
scored_players AS (
  SELECT
    rating_parts.*,
    100.0*MAX(0.0,MIN(1.0,
      (
        .27*proven_quality+.27*opponent_proof
        +.46*(.60*workload+.40*sample_proof)
        +.10*sample_proof*MAX(0.0,MIN(1.0,(volume_component-.72)/.28))
          *(.5+.5*MAX(0.0,MIN(1.0,(proven_quality-.5)/.5)))
        +CASE WHEN position IN ('QB','WR','TE') THEN
          .04*sample_proof*usage_component
          *MAX(0.0,MIN(1.0,(.5-MAX(0.0,MIN(1.0,support_quality)))/.5))
          *MAX(0.0,MIN(1.0,(proven_quality-.55)/.45))
        ELSE 0.0 END
      )
      *(.45+.55*sample_proof)
    )) AS score
  FROM rating_parts
),
latest_ol_profiles AS (
  SELECT profile.season,profile.team,MAX(profile.week) AS week
  FROM weekly_advanced_profiles profile
  JOIN selected_player_season selected ON selected.season=profile.season
  JOIN selected_player_teams selected_team ON selected_team.team=profile.team
  GROUP BY profile.season,profile.team
),
ol_components AS (
  SELECT
    profile.season,
    profile.team,
    (
      COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.lineYards') AS REAL)*.24,0)
      +COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.stuffRate') AS REAL)*.20,0)
      +COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.powerSuccess') AS REAL)*.14,0)
      +COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.rushingSuccessRate') AS REAL)*.14,0)
      +COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.havocRate') AS REAL)*.14,0)
      +COALESCE(CAST(json_extract(profile.profile_json,'$.offense.index.passingDownSuccessRate') AS REAL)*.14,0)
    )/NULLIF(
      CASE WHEN json_extract(profile.profile_json,'$.offense.index.lineYards') IS NULL THEN 0 ELSE .24 END
      +CASE WHEN json_extract(profile.profile_json,'$.offense.index.stuffRate') IS NULL THEN 0 ELSE .20 END
      +CASE WHEN json_extract(profile.profile_json,'$.offense.index.powerSuccess') IS NULL THEN 0 ELSE .14 END
      +CASE WHEN json_extract(profile.profile_json,'$.offense.index.rushingSuccessRate') IS NULL THEN 0 ELSE .14 END
      +CASE WHEN json_extract(profile.profile_json,'$.offense.index.havocRate') IS NULL THEN 0 ELSE .14 END
      +CASE WHEN json_extract(profile.profile_json,'$.offense.index.passingDownSuccessRate') IS NULL THEN 0 ELSE .14 END
    ,0) AS base_unit_index,
    COALESCE(context.competition_quality,.5) AS competition_quality,
    COALESCE(context.rush_offense_relative,.5) AS opponent_relative,
    COALESCE(context.rush_offense_schedule_quality,.5) AS opponent_unit_quality,
    COALESCE(context.pass_offense_relative,.5) AS support_quality
  FROM weekly_advanced_profiles profile
  JOIN latest_ol_profiles latest
    ON latest.season=profile.season AND latest.team=profile.team AND latest.week=profile.week
  LEFT JOIN team_player_context context
    ON context.season=profile.season AND context.team=profile.team
),
scored_ol AS (
  SELECT
    season,
    team,
    printf('%s-offensive-line-unit',team) AS player_key,
    'OL' AS position,
    .35*base_unit_index
      +.45*(.75+.5*MAX(0.0,MIN(1.0,opponent_relative)))
      +.10*(.75+.5*MAX(0.0,MIN(1.0,support_quality)))
      +.10*(.75+.5*MAX(0.0,MIN(1.0,opponent_unit_quality))) AS score,
    NULL AS stars,
    NULL AS rating_band,
    opponent_relative,
    opponent_unit_quality,
    support_quality,
    NULL AS usage_rate
  FROM ol_components
  WHERE base_unit_index IS NOT NULL
),
combined_scores AS (
  SELECT
    season,team,player_key,position,score,stars,rating_band,
    opponent_relative,opponent_unit_quality,support_quality,usage AS usage_rate
  FROM scored_players
  WHERE score IS NOT NULL
    AND position IN ('QB','RB','WR','TE','EDGE','DL','LB','CB','S','K','P')
    AND CASE
      WHEN position='QB' THEN pass_attempts>0
      WHEN position='RB' THEN rush_attempts+receptions>0
      WHEN position IN ('WR','TE') THEN receptions>0
      WHEN position IN ('EDGE','DL','LB','CB','S') THEN
        tackles+tfl+sacks+qb_hurries+passes_defended+defensive_interceptions+fumble_recoveries>0
      WHEN position='K' THEN field_goals_attempted>0
      WHEN position='P' THEN punts>0
      ELSE advanced_plays>0 OR usage IS NOT NULL
    END
  UNION ALL
  SELECT season,team,player_key,position,score,stars,rating_band,
    opponent_relative,opponent_unit_quality,support_quality,usage_rate
  FROM scored_ol
)
INSERT INTO player_production_scores
  (season,team,player_key,position,score,stars,rating_band,opponent_relative,opponent_unit_quality,support_quality,usage_rate)
SELECT season,team,player_key,position,score,stars,rating_band,
  opponent_relative,opponent_unit_quality,support_quality,usage_rate
FROM combined_scores
WHERE 1
ON CONFLICT(season,team,player_key) DO UPDATE SET
  position=excluded.position,
  score=excluded.score,
  stars=excluded.stars,
  rating_band=excluded.rating_band,
  opponent_relative=excluded.opponent_relative,
  opponent_unit_quality=excluded.opponent_unit_quality,
  support_quality=excluded.support_quality,
  usage_rate=excluded.usage_rate
`;

export async function loadPlayerProductionScores(db: D1Database, season: number, requestedTeams: string[]) {
  const uniqueTeams = [...new Set(requestedTeams.map((team) => team.trim()).filter(Boolean))].slice(0, 4);
  if (!uniqueTeams.length) return new Map<string, Map<string, number>>();
  const result = await db.prepare(`SELECT team,player_key AS playerKey,score
      FROM player_production_scores
      WHERE season=? AND team IN (${uniqueTeams.map(() => "?").join(",")})`)
    .bind(season, ...uniqueTeams)
    .all<{ team: string; playerKey: string; score: number }>();
  const byTeam = new Map<string, Map<string, number>>();
  for (const row of result.results) {
    const scores = byTeam.get(row.team) ?? new Map<string, number>();
    scores.set(row.playerKey, Number(row.score));
    byTeam.set(row.team, scores);
  }
  return byTeam;
}

export async function loadSeasonPlayerProductionPercentiles(db:D1Database,season:number,requestedTeams:string[]) {
  const teams=[...new Set(requestedTeams.map((team)=>team.trim()).filter(Boolean))].slice(0,4);
  if(!teams.length)return new Map<string,Map<string,number>>();
  const result=await db.prepare(`WITH requested_teams AS (
      SELECT CAST(value AS TEXT) AS team FROM json_each(?)
    ),player_rows AS (
      SELECT profile.team,
        COALESCE(
          NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
          NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
          printf('%s-%s',profile.team,player.key)
        ) AS player_key,
        CASE
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('RB','HB','FB') THEN 'RB'
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('DE','EDGE','OLB') THEN 'EDGE'
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('DT','NT','DL') THEN 'DL'
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('LB','ILB','MLB','WLB','SLB') THEN 'LB'
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('S','SS','FS','DB','NB','STAR') THEN 'S'
          WHEN UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH')) IN ('OL','OT','OG','C','LT','LG','RG','RT') THEN 'OL'
          ELSE UPPER(COALESCE(json_extract(player.value,'$.position'),'ATH'))
        END AS position,
        CAST(COALESCE(
          json_extract(player.value,'$.productionScore'),
          json_extract(player.value,'$.impactScore')
        ) AS REAL) AS score
      FROM player_team_profiles profile
      JOIN json_each(profile.profile_json,'$.players') AS player ON TRUE
      WHERE profile.season=? AND profile.profile_json<>'{}'
    ),eligible AS (
      SELECT * FROM player_rows
      WHERE score IS NOT NULL AND position IN ('QB','RB','WR','TE','EDGE','DL','LB','CB','S','K','P')
    ),ranked AS (
      SELECT *,RANK() OVER (PARTITION BY position ORDER BY score) AS rank_start,
        COUNT(*) OVER (PARTITION BY position,score) AS tie_count,
        COUNT(*) OVER (PARTITION BY position) AS position_count
      FROM eligible
    ),percentiles AS (
      SELECT team,player_key,
        (rank_start+(tie_count-1)/2.0)/NULLIF(position_count,0) AS percentile
      FROM ranked
    )
    SELECT percentile.team,percentile.player_key AS playerKey,percentile.percentile
    FROM percentiles percentile
    JOIN requested_teams requested ON requested.team=percentile.team`)
    .bind(JSON.stringify(teams),season)
    .all<{team:string;playerKey:string;percentile:number}>();
  const byTeam=new Map<string,Map<string,number>>();
  for(const row of result.results){
    const values=byTeam.get(row.team)??new Map<string,number>();
    values.set(row.playerKey,Number(row.percentile));
    byTeam.set(row.team,values);
  }
  return byTeam;
}

const productionBaselineSql = `
WITH eligible AS (
  SELECT season,team,player_key,position,score,stars,rating_band
  FROM player_production_scores
  WHERE position<>'_SYNC'
),
ranked AS (
  SELECT *,
    RANK() OVER (PARTITION BY position ORDER BY score) AS rank_start,
    COUNT(*) OVER (PARTITION BY position,score) AS tie_count,
    COUNT(*) OVER (PARTITION BY position) AS position_count
  FROM eligible
),
percentiles AS (
  SELECT *,
    (rank_start+(tie_count-1)/2.0)/NULLIF(position_count,0) AS percentile
  FROM ranked
),
rated AS (
  SELECT *,CASE
    WHEN percentile>=.999 THEN 99
    WHEN percentile>=.9975 THEN 98
    WHEN percentile>=.995 THEN 97
    WHEN percentile>=.9925 THEN 96
    WHEN percentile>=.990 THEN 95
    WHEN percentile>=.985 THEN 94
    WHEN percentile>=.980 THEN 93
    WHEN percentile>=.975 THEN 92
    WHEN percentile>=.970 THEN 91
    WHEN percentile>=.960 THEN 90
    WHEN percentile>=.945 THEN 89
    WHEN percentile>=.930 THEN 88
    WHEN percentile>=.915 THEN 87
    WHEN percentile>=.900 THEN 86
    WHEN percentile>=.880 THEN 85
    WHEN percentile>=.850 THEN 84
    WHEN percentile>=.820 THEN 83
    WHEN percentile>=.790 THEN 82
    WHEN percentile>=.750 THEN 81
    WHEN percentile>=.700 THEN 80
    WHEN percentile>=.650 THEN 79
    WHEN percentile>=.600 THEN 78
    WHEN percentile>=.550 THEN 77
    WHEN percentile>=.500 THEN 76
    WHEN percentile>=.450 THEN 75
    WHEN percentile>=.400 THEN 74
    WHEN percentile>=.350 THEN 73
    WHEN percentile>=.300 THEN 72
    WHEN percentile>=.250 THEN 71
    WHEN percentile>=.200 THEN 70
    WHEN percentile>=.180 THEN 69
    WHEN percentile>=.160 THEN 68
    WHEN percentile>=.140 THEN 67
    WHEN percentile>=.120 THEN 66
    WHEN percentile>=.100 THEN 65
    WHEN percentile>=.080 THEN 64
    WHEN percentile>=.060 THEN 63
    WHEN percentile>=.045 THEN 62
    WHEN percentile>=.030 THEN 61
    WHEN percentile>=.020 THEN 60
    WHEN percentile>=.015 THEN 59
    WHEN percentile>=.012 THEN 58
    WHEN percentile>=.009 THEN 57
    WHEN percentile>=.006 THEN 56
    WHEN percentile>=.004 THEN 55
    WHEN percentile>=.003 THEN 54
    WHEN percentile>=.002 THEN 53
    WHEN percentile>=.001 THEN 52
    WHEN percentile>=.0005 THEN 51
    ELSE 50
  END AS overall
  FROM percentiles
)
SELECT
  'scale' AS kind,
  position,
  overall AS rating,
  MIN(score) AS min_score,
  MAX(score) AS max_score,
  COUNT(*) AS sample_size,
  NULL AS stars,
  NULL AS rating_band,
  NULL AS expected_rating,
  MIN(season) AS first_season,
  MAX(season) AS last_season
FROM rated
GROUP BY position,overall
UNION ALL
SELECT
  'cohort' AS kind,
  position,
  NULL AS rating,
  NULL AS min_score,
  NULL AS max_score,
  COUNT(*) AS sample_size,
  stars,
  rating_band,
  AVG(overall) AS expected_rating,
  MIN(season) AS first_season,
  MAX(season) AS last_season
FROM rated
WHERE stars BETWEEN 1 AND 5
GROUP BY position,stars,rating_band
`;


function emptyPlayerProductionBaseline(lastSeason = currentCollegeFootballSeason()): PlayerProductionBaseline {
  return {
    firstSeason:FIRST_PLAYER_SEASON,
    lastSeason,
    playerSeasonCount:0,
    scale:[],
    cohorts:[],
  };
}

function validPlayerProductionBaseline(input: unknown): input is PlayerProductionBaseline {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<PlayerProductionBaseline>;
  return Number.isFinite(value.firstSeason)
    && Number.isFinite(value.lastSeason)
    && Number.isFinite(value.playerSeasonCount)
    && Array.isArray(value.scale)
    && Array.isArray(value.cohorts);
}

function buildPlayerProductionBaseline(
  playerRows: Record<string, unknown>[],
): PlayerProductionBaseline {
  const scale: ProductionScaleBin[] = [];
  const cohorts: ProductionProjectionCohort[] = [];
  let firstSeason = FIRST_PLAYER_SEASON;
  let lastSeason = FIRST_PLAYER_SEASON;
  let playerSeasonCount = 0;
  for (const row of playerRows) {
    firstSeason = Math.min(firstSeason, Number(row.first_season ?? FIRST_PLAYER_SEASON));
    lastSeason = Math.max(lastSeason, Number(row.last_season ?? FIRST_PLAYER_SEASON));
    if (row.kind === "scale") {
      const sampleSize = Number(row.sample_size ?? 0);
      playerSeasonCount += sampleSize;
      scale.push({
        position:String(row.position),
        rating:Number(row.rating),
        minScore:Number(row.min_score),
        maxScore:Number(row.max_score),
        sampleSize,
      });
    } else {
      cohorts.push({
        position:String(row.position),
        stars:row.stars === null || row.stars === undefined ? null : Number(row.stars),
        ratingBand:row.rating_band === null || row.rating_band === undefined ? null : Number(row.rating_band),
        expectedRating:Number(row.expected_rating),
        sampleSize:Number(row.sample_size ?? 0),
      });
    }
  }
  // Scale rows partition the same population; count each player-season once.
  playerSeasonCount = scale.reduce((sum, row) => sum + row.sampleSize, 0);
  return { firstSeason, lastSeason, playerSeasonCount, scale, cohorts, scaleCalibrationVersion:2 };
}

export type PlayerProductionBaselineStatus = {
  status: "ready" | "building" | "waiting";
  dirty: boolean;
  nextSeason: number;
  detail: string;
  baseline: PlayerProductionBaseline;
};

export async function loadPlayerProductionBaseline(db: D1Database): Promise<PlayerProductionBaseline> {
  if (productionBaselineCache && productionBaselineCache.expiresAt > Date.now()) return productionBaselineCache.value;
  const row = await db.prepare(`SELECT baseline_json AS baselineJson,dirty,status,model_version AS modelVersion
      FROM player_production_baselines WHERE id=?`)
    .bind(PRODUCTION_BASELINE_ID)
    .first<Record<string, unknown>>();
  const parsed = parseJson<unknown>(row?.baselineJson, null);
  const stored = validPlayerProductionBaseline(parsed) ? parsed : emptyPlayerProductionBaseline();
  const modelVersion = Number(row?.modelVersion ?? 0);
  const value: PlayerProductionBaseline = {
    ...stored,
    modelVersion,
    currentGenerationReady:
      modelVersion === PRODUCTION_BASELINE_MODEL_VERSION
      && Number(row?.dirty ?? 1) === 0
      && String(row?.status ?? "") === "ready",
  };
  productionBaselineCache = { expiresAt:Date.now()+5*60*1000, value };
  return value;
}

export async function markPlayerProductionBaselineDirty(db: D1Database, season = FIRST_PLAYER_SEASON) {
  productionBaselineCache = null;
  const targetSeason = Math.max(FIRST_PLAYER_SEASON, season);
  await db.batch([
    db.prepare("DELETE FROM player_production_scores WHERE season=?").bind(targetSeason),
    db.prepare(`INSERT INTO player_production_baselines
        (id,baseline_json,dirty,status,next_season,detail,model_version,updated_at)
        VALUES (?,'{}',1,'building',?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          dirty=1,
          status='building',
          next_season=MIN(player_production_baselines.next_season,excluded.next_season),
          detail=excluded.detail,
          model_version=excluded.model_version,
          updated_at=CURRENT_TIMESTAMP`)
      .bind(
        PRODUCTION_BASELINE_ID,
        targetSeason,
        `Normalizing ${targetSeason} player production in bounded team batches`,
        PRODUCTION_BASELINE_MODEL_VERSION,
      ),
  ]);
}

async function claimPlayerProductionBaselineWork(db: D1Database, cooldownSeconds = 6) {
  const lease = await db.prepare(`INSERT INTO sync_leases (scope,next_allowed_at,updated_at)
      VALUES ('player-production-baseline-v1',unixepoch()+?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET next_allowed_at=excluded.next_allowed_at,updated_at=CURRENT_TIMESTAMP
      WHERE sync_leases.next_allowed_at<=unixepoch()`)
    .bind(Math.max(5, Math.trunc(cooldownSeconds)))
    .run();
  return Number(lease.meta.changes ?? 0) > 0;
}

export async function refreshPlayerProductionBaselineIfNeeded(
  db: D1Database,
): Promise<PlayerProductionBaselineStatus> {
  const currentSeason = currentCollegeFootballSeason();
  const readySeasonRow = await db.prepare(`SELECT MAX(season) AS lastReadySeason
      FROM player_sync_state
      WHERE stage='ready' AND team_count>=100 AND model_version>=?`)
    .bind(PLAYER_MODEL_VERSION)
    .first<Record<string, unknown>>();
  const lastReadySeason = Math.min(
    currentSeason,
    Number(readySeasonRow?.lastReadySeason ?? FIRST_PLAYER_SEASON - 1),
  );
  let row = await db.prepare(`SELECT baseline_json AS baselineJson,dirty,status,next_season AS nextSeason,
      detail,model_version AS modelVersion
      FROM player_production_baselines WHERE id=?`)
    .bind(PRODUCTION_BASELINE_ID)
    .first<Record<string, unknown>>();
  if (!row) {
    await markPlayerProductionBaselineDirty(db, FIRST_PLAYER_SEASON);
    row = {
      baselineJson:"{}",
      dirty:1,
      status:"building",
      nextSeason:FIRST_PLAYER_SEASON,
      detail:`Normalizing ${FIRST_PLAYER_SEASON} player production`,
      modelVersion:PRODUCTION_BASELINE_MODEL_VERSION,
    };
  }

  const parsed = parseJson<unknown>(row.baselineJson, null);
  const baseline = validPlayerProductionBaseline(parsed)
    ? parsed
    : emptyPlayerProductionBaseline(Math.max(FIRST_PLAYER_SEASON, lastReadySeason));
  const versionMismatch = Number(row.modelVersion ?? 0) !== PRODUCTION_BASELINE_MODEL_VERSION;
  const dirty = Boolean(Number(row.dirty ?? 1)) || versionMismatch;
  const nextSeason = Math.max(FIRST_PLAYER_SEASON, Number(row.nextSeason ?? FIRST_PLAYER_SEASON));
  if (!dirty && baseline.scale.length) {
    return { status:"ready", dirty:false, nextSeason, detail:String(row.detail ?? "Production scale ready"), baseline };
  }
  if (lastReadySeason < FIRST_PLAYER_SEASON) {
    return {
      status:baseline.scale.length ? "ready" : "waiting",
      dirty:true,
      nextSeason,
      detail:"Historical player seasons are still being prepared",
      baseline,
    };
  }
  if (!await claimPlayerProductionBaselineWork(db)) {
    return { status:baseline.scale.length ? "ready" : "waiting", dirty:true, nextSeason, detail:String(row.detail ?? "Production scale rebuild queued"), baseline };
  }
  if (versionMismatch) {
    // A model generation must never mix old and new component scores. Enter a
    // bounded cleanup phase first: deleting all 80k+ historical score rows in
    // one D1 transaction can itself exceed the worker memory limit.
    const detail = `Rating generation v${PRODUCTION_BASELINE_MODEL_VERSION} initialized; clearing ${FIRST_PLAYER_SEASON} next`;
    await db.prepare(`UPDATE player_production_baselines SET
        dirty=1,status='clearing',next_season=?,detail=?,model_version=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`)
      .bind(
        FIRST_PLAYER_SEASON,
        detail,
        PRODUCTION_BASELINE_MODEL_VERSION,
        PRODUCTION_BASELINE_ID,
      )
      .run();
    productionBaselineCache = null;
    return { status:baseline.scale.length ? "ready" : "building", dirty:true, nextSeason:FIRST_PLAYER_SEASON, detail, baseline };
  }

  if (String(row.status ?? "") === "clearing") {
    const clearingSeason = Math.min(nextSeason, lastReadySeason);
    const followingSeason = clearingSeason + 1;
    const cleanupComplete = followingSeason > lastReadySeason;
    const detail = cleanupComplete
      ? `Old generation cleared through ${lastReadySeason}; normalizing ${FIRST_PLAYER_SEASON} next`
      : `Cleared old ${clearingSeason} ratings; ${followingSeason} is next`;
    await db.batch([
      db.prepare("DELETE FROM player_production_scores WHERE season=?").bind(clearingSeason),
      db.prepare(`UPDATE player_production_baselines SET
          dirty=1,status=?,next_season=?,detail=?,model_version=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?`)
        .bind(
          cleanupComplete ? "building" : "clearing",
          cleanupComplete ? FIRST_PLAYER_SEASON : followingSeason,
          detail,
          PRODUCTION_BASELINE_MODEL_VERSION,
          PRODUCTION_BASELINE_ID,
        ),
    ]);
    productionBaselineCache = null;
    return {
      status:baseline.scale.length ? "ready" : "building",
      dirty:true,
      nextSeason:cleanupComplete ? FIRST_PLAYER_SEASON : followingSeason,
      detail,
      baseline,
    };
  }

  if (nextSeason <= lastReadySeason) {
    const pendingTeams = await db.prepare(`SELECT profile.team,profile.profile_json AS profileJson
        FROM player_team_profiles profile
        WHERE profile.season=?
          AND NOT EXISTS (
            SELECT 1 FROM player_production_scores score
            WHERE score.season=profile.season
              AND score.team=profile.team
              AND score.position='_SYNC'
          )
        ORDER BY profile.team
        LIMIT ?`)
      .bind(nextSeason, PRODUCTION_NORMALIZATION_TEAM_BATCH_SIZE)
      .all<{ team:string; profileJson:string }>();
    const teams = pendingTeams.results.map((entry) => entry.team).filter(Boolean);
    if (teams.length) {
      const teamJson = JSON.stringify(teams);
      let contextResult: D1Result<Record<string, unknown>>;
      try {
        contextResult = await db.prepare(PLAYER_TEAM_RATING_CONTEXT_SQL)
          .bind(nextSeason, teamJson)
          .all<Record<string, unknown>>();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Player rating context batch failed for ${nextSeason}: ${message}`);
      }
      const contexts = new Map(contextResult.results.map((entry) => [String(entry.team ?? ""),entry]));
      const offensiveLineScores = await loadOffensiveLineScores(db,nextSeason,teams,PRODUCTION_NORMALIZATION_TEAM_BATCH_SIZE);
      for (const team of teams) {
        const profileRow = pendingTeams.results.find((entry) => entry.team === team);
        const model = parseJson<TeamPlayerModel | null>(profileRow?.profileJson,null);
        try {
          if (model) {
            const rows = playerProductionRows(
              nextSeason,
              team,
              model,
              contexts.get(team),
              offensiveLineScores.get(team),
            );
            await upsertPlayerProductionRows(db,rows);
          }
          await db.prepare(`INSERT INTO player_production_scores
                (season,team,player_key,position,score)
                VALUES (?,?,?,'_SYNC',0)
                ON CONFLICT(season,team,player_key) DO UPDATE SET position='_SYNC',score=0`)
            .bind(nextSeason, team, `__sync__-${team}`)
            .run();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Player rating score batch failed for ${nextSeason} ${team}: ${message}`);
        }
      }
      const progress = await db.prepare(`SELECT
          (SELECT COUNT(*) FROM player_team_profiles WHERE season=?) AS totalTeams,
          (SELECT COUNT(DISTINCT team) FROM player_production_scores
            WHERE season=? AND position='_SYNC') AS completedTeams`)
        .bind(nextSeason, nextSeason)
        .first<Record<string, unknown>>();
      const completedTeams = Number(progress?.completedTeams ?? teams.length);
      const totalTeams = Number(progress?.totalTeams ?? completedTeams);
      const detail = `Normalized ${completedTeams}/${totalTeams} teams for ${nextSeason}`;
      await db.prepare(`UPDATE player_production_baselines SET
          dirty=1,status='building',detail=?,model_version=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?`)
        .bind(detail, PRODUCTION_BASELINE_MODEL_VERSION, PRODUCTION_BASELINE_ID)
        .run();
      productionBaselineCache = null;
      return { status:baseline.scale.length ? "ready" : "building", dirty:true, nextSeason, detail, baseline };
    }

    const followingSeason = nextSeason + 1;
    const detail = followingSeason <= lastReadySeason
      ? `Normalized ${nextSeason}; ${followingSeason} is next`
      : `Normalized ${nextSeason}; compiling the historical percentile scale next`;
    await db.prepare(`UPDATE player_production_baselines SET
        dirty=1,status='building',next_season=?,detail=?,model_version=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`)
      .bind(followingSeason, detail, PRODUCTION_BASELINE_MODEL_VERSION, PRODUCTION_BASELINE_ID)
      .run();
    return { status:baseline.scale.length ? "ready" : "building", dirty:true, nextSeason:followingSeason, detail, baseline };
  }

  const playerResult = await db.prepare(productionBaselineSql).all<Record<string, unknown>>();
  const value = buildPlayerProductionBaseline(playerResult.results);
  if (!value.scale.length || value.playerSeasonCount < 1000) {
    throw new Error(`Player production baseline is incomplete (${value.playerSeasonCount} player-seasons)`);
  }
  await db.prepare(`UPDATE player_production_baselines SET
      baseline_json=?,dirty=0,status='ready',next_season=?,detail=?,model_version=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
    .bind(
      JSON.stringify(value),
      lastReadySeason + 1,
      `${value.firstSeason}–${value.lastSeason} production scale ready for ${value.playerSeasonCount} player-seasons`,
      PRODUCTION_BASELINE_MODEL_VERSION,
      PRODUCTION_BASELINE_ID,
    )
    .run();
  const currentValue: PlayerProductionBaseline = {
    ...value,
    modelVersion:PRODUCTION_BASELINE_MODEL_VERSION,
    currentGenerationReady:true,
  };
  productionBaselineCache = { expiresAt:Date.now()+6*60*60*1000, value:currentValue };
  return {
    status:"ready",
    dirty:false,
    nextSeason:lastReadySeason + 1,
    detail:`${value.firstSeason}–${value.lastSeason} production scale ready for ${value.playerSeasonCount} player-seasons`,
    baseline:currentValue,
  };
}

async function loadOffensiveLineScores(
  db: D1Database,
  season: number,
  requestedTeams: string[],
  teamLimit: number,
) {
  const uniqueTeams = [...new Set(requestedTeams.map((team) => team.trim()).filter(Boolean))].slice(0, teamLimit);
  if (!uniqueTeams.length) return new Map<string, number>();
  // D1 enforces a much lower bind-variable ceiling than desktop SQLite in
  // some production paths. The ratings index requests the whole FBS, so use
  // one season bind instead of generating 130+ team placeholders.
  const loadEntireSeason = uniqueTeams.length > 80;
  const storedTeamFilter = loadEntireSeason
    ? ""
    : `AND team IN (${uniqueTeams.map(() => "?").join(",")})`;
  const stored = await db.prepare(`SELECT team,score
      FROM player_production_scores
      WHERE season=? AND position='OL' ${storedTeamFilter}`)
    .bind(...(loadEntireSeason ? [season] : [season, ...uniqueTeams]))
    .all<{ team:string; score:number }>();
  const storedScores = new Map(stored.results.map((row) => [row.team,Number(row.score)]));
  const missingTeams = uniqueTeams.filter((team) => !storedScores.has(team));
  if (!missingTeams.length) return storedScores;
  const teamFilter = loadEntireSeason
    ? ""
    : `AND team IN (${missingTeams.map(() => "?").join(",")})`;
  const bindings: Array<string | number> = loadEntireSeason ? [season, season] : [season, ...missingTeams, season];
  const result = await db.prepare(`
    SELECT profile.team,profile.profile_json AS profileJson
    FROM weekly_advanced_profiles profile
    JOIN (
      SELECT team,MAX(week) AS week
      FROM weekly_advanced_profiles
      WHERE season=? ${teamFilter}
      GROUP BY team
    ) latest ON latest.team=profile.team AND latest.week=profile.week
    WHERE profile.season=?
  `).bind(...bindings).all<Record<string, unknown>>();
  for (const [team,score] of result.results.flatMap((row) => {
    const advanced = parseAdvancedProfile(row.profileJson);
    const score = buildOffensiveLineUnitProfile(advanced).productionScore;
    return score === null ? [] : [[String(row.team), score] as const];
  })) storedScores.set(team,score);
  return storedScores;
}

export async function loadOffensiveLineUnitScores(db: D1Database, season: number, requestedTeams: string[]) {
  return loadOffensiveLineScores(db, season, requestedTeams, 4);
}

/**
 * The player-ratings index needs one compact team-unit score for every FBS
 * line in the selected season. It never loads player profile documents and
 * remains bounded to the number of FBS teams.
 */
export async function loadSeasonOffensiveLineUnitScores(db: D1Database, season: number, requestedTeams: string[]) {
  return loadOffensiveLineScores(db, season, requestedTeams, 160);
}
