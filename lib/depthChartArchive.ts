import {
  listPublishedDepthCharts,
  type PublishedDepthChart,
  type PublishedDepthEntry,
} from "./publishedDepthCharts";

export const DEPTH_CHART_ARCHIVE_FIRST_SEASON = 2014;
export const DEPTH_CHART_ARCHIVE_LAST_SEASON = 2025;

type JsonRecord = Record<string, unknown>;

export type DepthChartValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  chart: PublishedDepthChart | null;
};

export type DepthChartArchiveSummary = {
  firstSeason: number;
  lastSeason: number;
  targetTeamSeasons: number;
  sourcedTeamSeasons: number;
  fullyMatchedTeamSeasons: number;
  queuedTeamSeasons: number;
  verifiedSnapshots: number;
  verifiedEntries: number;
  unresolvedEntries: number;
  seasons: Array<{
    season: number;
    targetTeamSeasons: number;
    sourcedTeamSeasons: number;
    fullyMatchedTeamSeasons: number;
    verifiedSnapshots: number;
    verifiedEntries: number;
    unresolvedEntries: number;
  }>;
};

const sourceKinds = new Set<PublishedDepthChart["sourceKind"]>([
  "official_game_notes",
  "official_media_guide",
  "official_gamebook",
  "conference_game_notes",
  "licensed_provider",
  "observed_starters",
]);
const sides = new Set(["offense", "defense", "specialists"]);
const normalizedPositions = new Set([
  "QB", "RB", "FB", "WR", "TE",
  "OL", "OT", "OG", "C", "LT", "LG", "RG", "RT",
  "DL", "DE", "DT", "NT", "EDGE",
  "LB", "ILB", "MLB", "OLB",
  "DB", "CB", "NB", "S", "SS", "FS",
  "K", "P", "LS", "KR", "PR",
]);

const cleanText = (value: unknown) => String(value ?? "").trim();

function parseJersey(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const jersey = Number(value);
  return Number.isInteger(jersey) && jersey >= 0 && jersey <= 99 ? jersey : Number.NaN;
}

function personKey(value: unknown, stripSuffix = false) {
  const normalized = cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripSuffix
    ? normalized.replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim()
    : normalized;
}

function lastNameKey(value: unknown) {
  const parts = personKey(value, true).split(" ").filter(Boolean);
  return parts.at(-1) ?? "";
}

function rowPlayerName(row: JsonRecord) {
  const first = cleanText(row.firstName ?? row.first_name);
  const last = cleanText(row.lastName ?? row.last_name);
  return [first, last].filter(Boolean).join(" ") || cleanText(row.name ?? row.player);
}

function rowJersey(row: JsonRecord) {
  const value = row.jersey ?? row.jerseyNumber ?? row.jersey_number ?? row.number;
  const jersey = parseJersey(value);
  return Number.isNaN(jersey) ? null : jersey;
}

function rowPlayerId(row: JsonRecord) {
  return cleanText(row.id ?? row.playerId ?? row.player_id) || null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function depthChartSourceId(chart: Pick<PublishedDepthChart, "season" | "team" | "publishedAt" | "sourceUrl">) {
  const team = chart.team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `depth:${chart.season}:${team}:${chart.publishedAt}:${stableHash(chart.sourceUrl)}`;
}

export function validateDepthChart(input: unknown, requireComplete = true): DepthChartValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Chart must be an object."], warnings, chart: null };
  }
  const value = input as Partial<PublishedDepthChart>;
  const season = Number(value.season);
  const team = cleanText(value.team);
  const label = cleanText(value.label);
  const publishedAt = cleanText(value.publishedAt);
  const sourceUrl = cleanText(value.sourceUrl);
  const sourceKind = cleanText(value.sourceKind) as PublishedDepthChart["sourceKind"];
  if (!Number.isInteger(season) || season < DEPTH_CHART_ARCHIVE_FIRST_SEASON || season > 2100) {
    errors.push(`Season must be between ${DEPTH_CHART_ARCHIVE_FIRST_SEASON} and 2100.`);
  }
  if (!team) errors.push("Team is required.");
  if (!label) errors.push("Source label is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) errors.push("publishedAt must use YYYY-MM-DD.");
  if (!/^https:\/\//i.test(sourceUrl)) errors.push("A canonical HTTPS source URL is required.");
  if (!sourceKinds.has(sourceKind)) errors.push(`Unsupported sourceKind: ${sourceKind || "(blank)"}.`);
  if (!Array.isArray(value.entries) || !value.entries.length) errors.push("At least one depth-chart entry is required.");

  const entries: PublishedDepthEntry[] = [];
  const exactEntries = new Set<string>();
  for (const [index, rawEntry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    if (!rawEntry || typeof rawEntry !== "object") {
      errors.push(`Entry ${index + 1} must be an object.`);
      continue;
    }
    const raw = rawEntry as Partial<PublishedDepthEntry>;
    const side = cleanText(raw.side).toLowerCase() as PublishedDepthEntry["side"];
    const role = cleanText(raw.role).toUpperCase();
    const position = cleanText(raw.position).toUpperCase();
    const depth = Number(raw.depth);
    const player = cleanText(raw.player);
    const jersey = parseJersey(raw.jersey);
    if (!sides.has(side)) errors.push(`Entry ${index + 1} has invalid side "${side}".`);
    if (!role) errors.push(`Entry ${index + 1} is missing its published role.`);
    if (!normalizedPositions.has(position)) errors.push(`Entry ${index + 1} has unsupported normalized position "${position}".`);
    if (!Number.isInteger(depth) || depth < 1 || depth > 10) errors.push(`Entry ${index + 1} has invalid depth "${raw.depth}".`);
    if (!player) errors.push(`Entry ${index + 1} is missing the player name.`);
    if (Number.isNaN(jersey)) errors.push(`Entry ${index + 1} has invalid jersey "${raw.jersey}".`);
    const exactKey = `${side}|${role}|${depth}|${personKey(player)}|${jersey ?? ""}`;
    if (exactEntries.has(exactKey)) errors.push(`Entry ${index + 1} duplicates ${player} at ${role} ${depth}.`);
    exactEntries.add(exactKey);
    entries.push({ side, role, position, depth, player, jersey });
  }

  const offenseCount = entries.filter((entry) => entry.side === "offense").length;
  const defenseCount = entries.filter((entry) => entry.side === "defense").length;
  const specialistCount = entries.filter((entry) => entry.side === "specialists").length;
  if (offenseCount < 8) warnings.push(`Only ${offenseCount} offensive entries were found.`);
  if (defenseCount < 8) warnings.push(`Only ${defenseCount} defensive entries were found.`);
  if (specialistCount < 1) warnings.push("No specialists were found.");
  if (requireComplete && (offenseCount < 8 || defenseCount < 8)) {
    errors.push("A verified full chart must contain at least eight offensive and eight defensive entries.");
  }
  if (sourceKind === "observed_starters") {
    warnings.push("Observed starters are not a published depth order and must remain labeled as observed.");
  }

  const chart = errors.length ? null : {
    season,
    team,
    label,
    publishedAt,
    sourceUrl,
    sourceKind,
    entries,
  };
  return { valid: errors.length === 0, errors, warnings, chart };
}

async function batchStatements(db: D1Database, statements: D1PreparedStatement[], size = 24) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

async function loadRoster(db: D1Database, season: number, team: string) {
  const row = await db.prepare(`SELECT roster_json AS rosterJson
      FROM player_team_profiles WHERE season=? AND team=?`)
    .bind(season, team)
    .first<Record<string, unknown>>();
  return parseJson<JsonRecord[]>(row?.rosterJson, []);
}

function matchEntriesToRoster(entries: PublishedDepthEntry[], roster: JsonRecord[]) {
  const byName = new Map<string, JsonRecord[]>();
  const byLastAndJersey = new Map<string, JsonRecord[]>();
  for (const player of roster) {
    const name = rowPlayerName(player);
    const jersey = rowJersey(player);
    const nameKeys = new Set([personKey(name), personKey(name, true)].filter(Boolean));
    for (const key of nameKeys) {
      const rows = byName.get(key) ?? [];
      rows.push(player);
      byName.set(key, rows);
    }
    if (jersey !== null) {
      const key = `${lastNameKey(name)}|${jersey}`;
      const rows = byLastAndJersey.get(key) ?? [];
      rows.push(player);
      byLastAndJersey.set(key, rows);
    }
  }

  return entries.map((entry, entryIndex) => {
    const directCandidates = [
      ...(byName.get(personKey(entry.player)) ?? []),
      ...(byName.get(personKey(entry.player, true)) ?? []),
    ].filter((candidate, index, list) => list.indexOf(candidate) === index);
    const jerseyMatch = entry.jersey === null
      ? []
      : byLastAndJersey.get(`${lastNameKey(entry.player)}|${entry.jersey}`) ?? [];
    let matched: JsonRecord | null = null;
    let matchMethod = "unmatched";
    let matchConfidence = 0;
    if (directCandidates.length === 1) {
      matched = directCandidates[0];
      matchMethod = "normalized_name";
      matchConfidence = 1;
    } else if (directCandidates.length > 1 && entry.jersey !== null) {
      const sameJersey = directCandidates.filter((candidate) => rowJersey(candidate) === entry.jersey);
      if (sameJersey.length === 1) {
        matched = sameJersey[0];
        matchMethod = "normalized_name_and_jersey";
        matchConfidence = 1;
      }
    } else if (jerseyMatch.length === 1) {
      matched = jerseyMatch[0];
      matchMethod = "last_name_and_jersey";
      matchConfidence = 0.92;
    }
    return {
      ...entry,
      entryIndex,
      rosterPlayerId: matched ? rowPlayerId(matched) : null,
      matchMethod,
      matchConfidence,
      reviewStatus: matched ? "matched" : "source_verified_unmatched",
    };
  });
}

async function refreshCoverageRow(db: D1Database, season: number, team: string) {
  const summary = await db.prepare(`
    SELECT
      COUNT(DISTINCT snapshot.source_id) AS sourceCount,
      COUNT(DISTINCT CASE WHEN snapshot.verification_status='verified' THEN snapshot.source_id END) AS verifiedSnapshotCount,
      COUNT(CASE WHEN snapshot.verification_status='verified' THEN entry.entry_index END) AS verifiedEntryCount,
      COUNT(CASE WHEN snapshot.verification_status='verified' AND entry.match_method='unmatched' THEN entry.entry_index END) AS unresolvedEntryCount,
      MAX(CASE WHEN snapshot.verification_status='verified' THEN snapshot.published_at END) AS latestSnapshotAt
    FROM depth_chart_snapshots snapshot
    LEFT JOIN depth_chart_entries entry ON entry.source_id=snapshot.source_id
    WHERE snapshot.season=? AND snapshot.team=?
  `).bind(season, team).first<Record<string, unknown>>();
  const sourceCount = Number(summary?.sourceCount ?? 0);
  const verifiedSnapshotCount = Number(summary?.verifiedSnapshotCount ?? 0);
  const verifiedEntryCount = Number(summary?.verifiedEntryCount ?? 0);
  const unresolvedEntryCount = Number(summary?.unresolvedEntryCount ?? 0);
  const status = verifiedSnapshotCount === 0
    ? "queued"
    : unresolvedEntryCount > 0
      ? "needs_roster_match"
      : "complete";
  const latest = await db.prepare(`SELECT source_kind AS sourceKind
      FROM depth_chart_snapshots
      WHERE season=? AND team=? AND verification_status='verified'
      ORDER BY published_at DESC,updated_at DESC LIMIT 1`)
    .bind(season, team)
    .first<Record<string, unknown>>();
  const nextAction = status === "complete"
    ? "Add an earlier or later official snapshot when available"
    : status === "needs_roster_match"
      ? "Resolve source names against the archived team roster"
      : "Locate official team game notes or media guide";
  await db.prepare(`INSERT INTO depth_chart_coverage
      (season,team,status,search_query,source_count,verified_snapshot_count,verified_entry_count,
       unresolved_entry_count,latest_snapshot_at,best_source_kind,next_action,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(season,team) DO UPDATE SET
        status=excluded.status,
        source_count=excluded.source_count,
        verified_snapshot_count=excluded.verified_snapshot_count,
        verified_entry_count=excluded.verified_entry_count,
        unresolved_entry_count=excluded.unresolved_entry_count,
        latest_snapshot_at=excluded.latest_snapshot_at,
        best_source_kind=excluded.best_source_kind,
        next_action=excluded.next_action,
        updated_at=CURRENT_TIMESTAMP`)
    .bind(
      season,
      team,
      status,
      `${season} ${team} football depth chart game notes filetype:pdf`,
      sourceCount,
      verifiedSnapshotCount,
      verifiedEntryCount,
      unresolvedEntryCount,
      summary?.latestSnapshotAt ?? null,
      latest?.sourceKind ?? null,
      nextAction,
    )
    .run();
}

export async function upsertVerifiedDepthChart(db: D1Database, input: unknown) {
  const validation = validateDepthChart(input, true);
  if (!validation.valid || !validation.chart) {
    return { imported: false as const, validation, sourceId: null, matchedPlayers: 0, listedPlayers: 0 };
  }
  const chart = validation.chart;
  const sourceId = depthChartSourceId(chart);
  const matchedEntries = matchEntriesToRoster(chart.entries, await loadRoster(db, chart.season, chart.team));
  const matchedPlayers = matchedEntries.filter((entry) => entry.rosterPlayerId).length;
  const snapshotWeek = null;
  await db.batch([
    db.prepare(`INSERT INTO depth_chart_snapshots
      (source_id,season,team,published_at,snapshot_week,source_kind,source_label,source_url,
       chart_json,verification_status,matched_players,listed_players,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'verified',?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(source_id) DO UPDATE SET
        season=excluded.season,
        team=excluded.team,
        published_at=excluded.published_at,
        snapshot_week=excluded.snapshot_week,
        source_kind=excluded.source_kind,
        source_label=excluded.source_label,
        source_url=excluded.source_url,
        chart_json=excluded.chart_json,
        verification_status='verified',
        matched_players=excluded.matched_players,
        listed_players=excluded.listed_players,
        updated_at=CURRENT_TIMESTAMP`)
      .bind(
        sourceId,
        chart.season,
        chart.team,
        chart.publishedAt,
        snapshotWeek,
        chart.sourceKind,
        chart.label,
        chart.sourceUrl,
        JSON.stringify(chart),
        matchedPlayers,
        matchedEntries.length,
      ),
    db.prepare("DELETE FROM depth_chart_entries WHERE source_id=?").bind(sourceId),
  ]);
  await batchStatements(db, matchedEntries.map((entry) =>
    db.prepare(`INSERT INTO depth_chart_entries
      (source_id,entry_index,season,team,side,role,position,depth,player_name,jersey,
       roster_player_id,match_method,match_confidence,review_status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(
        sourceId,
        entry.entryIndex,
        chart.season,
        chart.team,
        entry.side,
        entry.role,
        entry.position,
        entry.depth,
        entry.player,
        entry.jersey,
        entry.rosterPlayerId,
        entry.matchMethod,
        entry.matchConfidence,
        entry.reviewStatus,
      ),
  ));
  await refreshCoverageRow(db, chart.season, chart.team);
  return {
    imported: true as const,
    validation,
    sourceId,
    matchedPlayers,
    listedPlayers: matchedEntries.length,
  };
}

export async function ensureDepthChartCoverageCatalog(db: D1Database) {
  const before = await db.prepare(`SELECT COUNT(*) AS count FROM depth_chart_coverage
      WHERE season BETWEEN ? AND ?`)
    .bind(DEPTH_CHART_ARCHIVE_FIRST_SEASON, DEPTH_CHART_ARCHIVE_LAST_SEASON)
    .first<Record<string, unknown>>();
  await db.prepare(`INSERT OR IGNORE INTO depth_chart_coverage
      (season,team,status,search_query,next_action,updated_at)
      SELECT season,team,'queued',
        CAST(season AS TEXT)||' '||team||' football depth chart game notes filetype:pdf',
        'Locate official team game notes or media guide',
        CURRENT_TIMESTAMP
      FROM cfb_teams
      WHERE season BETWEEN ? AND ?`)
    .bind(DEPTH_CHART_ARCHIVE_FIRST_SEASON, DEPTH_CHART_ARCHIVE_LAST_SEASON)
    .run();
  const after = await db.prepare(`SELECT COUNT(*) AS count FROM depth_chart_coverage
      WHERE season BETWEEN ? AND ?`)
    .bind(DEPTH_CHART_ARCHIVE_FIRST_SEASON, DEPTH_CHART_ARCHIVE_LAST_SEASON)
    .first<Record<string, unknown>>();
  return Math.max(0, Number(after?.count ?? 0) - Number(before?.count ?? 0));
}

export async function importDepthChartBatch(
  db: D1Database,
  inputs: unknown[],
  mode = "curated_official_documents",
) {
  const runId = `depth-run:${Date.now().toString(36)}:${stableHash(`${mode}:${inputs.length}`)}`;
  await db.prepare(`INSERT INTO depth_chart_import_runs
      (id,mode,status,requested_count,detail,started_at)
      VALUES (?,?,'running',?,'Validating source-backed charts',CURRENT_TIMESTAMP)`)
    .bind(runId, mode, inputs.length)
    .run();
  const results: Awaited<ReturnType<typeof upsertVerifiedDepthChart>>[] = [];
  for (const input of inputs.slice(0, 25)) results.push(await upsertVerifiedDepthChart(db, input));
  const importedCount = results.filter((result) => result.imported).length;
  const rejectedCount = results.length - importedCount;
  const status = rejectedCount ? importedCount ? "partial" : "rejected" : "complete";
  const detail = `${importedCount} imported; ${rejectedCount} rejected; ${results.reduce((sum, row) => sum + row.matchedPlayers, 0)} roster matches`;
  await db.prepare(`UPDATE depth_chart_import_runs SET
      status=?,imported_count=?,rejected_count=?,detail=?,finished_at=CURRENT_TIMESTAMP
      WHERE id=?`)
    .bind(status, importedCount, rejectedCount, detail, runId)
    .run();
  return { runId, status, importedCount, rejectedCount, detail, results };
}

export async function seedPublishedDepthCharts(db: D1Database) {
  const charts = listPublishedDepthCharts();
  const sourceIds = charts.map(depthChartSourceId);
  const existing = sourceIds.length
    ? await db.prepare(`SELECT
          snapshot.source_id AS sourceId,
          COUNT(entry.entry_index) AS entryCount,
          snapshot.updated_at AS snapshotUpdatedAt,
          profile.updated_at AS rosterUpdatedAt
        FROM depth_chart_snapshots snapshot
        LEFT JOIN depth_chart_entries entry ON entry.source_id=snapshot.source_id
        LEFT JOIN player_team_profiles profile
          ON profile.season=snapshot.season AND profile.team=snapshot.team
        WHERE snapshot.source_id IN (${sourceIds.map(() => "?").join(",")})
        GROUP BY snapshot.source_id,snapshot.updated_at,profile.updated_at`)
      .bind(...sourceIds)
      .all<Record<string, unknown>>()
    : { results: [] };
  const complete = new Map(existing.results.map((row) => [String(row.sourceId), {
    entryCount:Number(row.entryCount ?? 0),
    snapshotUpdatedAt:String(row.snapshotUpdatedAt ?? ""),
    rosterUpdatedAt:String(row.rosterUpdatedAt ?? ""),
  }]));
  const missing = charts.filter((chart) => {
    const stored = complete.get(depthChartSourceId(chart));
    return !stored
      || stored.entryCount < chart.entries.length
      || (stored.rosterUpdatedAt && stored.rosterUpdatedAt > stored.snapshotUpdatedAt);
  });
  if (!missing.length) return { importedCount: 0, requestedCount: 0, status: "complete" };
  const result = await importDepthChartBatch(db, missing, "built_in_verified_sources");
  return { ...result, requestedCount: missing.length };
}

async function claimArchiveMaintenance(db: D1Database, cooldownSeconds = 600) {
  const result = await db.prepare(`INSERT INTO sync_leases (scope,next_allowed_at,updated_at)
      VALUES ('depth-chart-archive-v1',unixepoch()+?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET
        next_allowed_at=excluded.next_allowed_at,
        updated_at=CURRENT_TIMESTAMP
      WHERE sync_leases.next_allowed_at<=unixepoch()`)
    .bind(cooldownSeconds)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function maintainDepthChartArchive(db: D1Database) {
  if (!await claimArchiveMaintenance(db)) {
    return { ran: false, catalogAdded: 0, importedCount: 0 };
  }
  const catalogAdded = await ensureDepthChartCoverageCatalog(db);
  const seed = await seedPublishedDepthCharts(db);
  return { ran: true, catalogAdded, importedCount: seed.importedCount };
}

export async function getDepthChartArchiveSummary(db: D1Database): Promise<DepthChartArchiveSummary> {
  const rows = await db.prepare(`
    SELECT
      season,
      COUNT(*) AS targetTeamSeasons,
      SUM(CASE WHEN verified_snapshot_count>0 THEN 1 ELSE 0 END) AS sourcedTeamSeasons,
      SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS fullyMatchedTeamSeasons,
      SUM(verified_snapshot_count) AS verifiedSnapshots,
      SUM(verified_entry_count) AS verifiedEntries,
      SUM(unresolved_entry_count) AS unresolvedEntries
    FROM depth_chart_coverage
    WHERE season BETWEEN ? AND ?
    GROUP BY season
    ORDER BY season
  `).bind(DEPTH_CHART_ARCHIVE_FIRST_SEASON, DEPTH_CHART_ARCHIVE_LAST_SEASON)
    .all<Record<string, unknown>>();
  const seasons = rows.results.map((row) => ({
    season: Number(row.season),
    targetTeamSeasons: Number(row.targetTeamSeasons ?? 0),
    sourcedTeamSeasons: Number(row.sourcedTeamSeasons ?? 0),
    fullyMatchedTeamSeasons: Number(row.fullyMatchedTeamSeasons ?? 0),
    verifiedSnapshots: Number(row.verifiedSnapshots ?? 0),
    verifiedEntries: Number(row.verifiedEntries ?? 0),
    unresolvedEntries: Number(row.unresolvedEntries ?? 0),
  }));
  return {
    firstSeason: DEPTH_CHART_ARCHIVE_FIRST_SEASON,
    lastSeason: DEPTH_CHART_ARCHIVE_LAST_SEASON,
    targetTeamSeasons: seasons.reduce((sum, row) => sum + row.targetTeamSeasons, 0),
    sourcedTeamSeasons: seasons.reduce((sum, row) => sum + row.sourcedTeamSeasons, 0),
    fullyMatchedTeamSeasons: seasons.reduce((sum, row) => sum + row.fullyMatchedTeamSeasons, 0),
    queuedTeamSeasons: seasons.reduce((sum, row) => sum + Math.max(0, row.targetTeamSeasons - row.sourcedTeamSeasons), 0),
    verifiedSnapshots: seasons.reduce((sum, row) => sum + row.verifiedSnapshots, 0),
    verifiedEntries: seasons.reduce((sum, row) => sum + row.verifiedEntries, 0),
    unresolvedEntries: seasons.reduce((sum, row) => sum + row.unresolvedEntries, 0),
    seasons,
  };
}

export async function getDepthChartCoverage(
  db: D1Database,
  options: { season?: number; team?: string; status?: string; limit?: number } = {},
) {
  const clauses = ["season BETWEEN ? AND ?"];
  const bindings: Array<string | number> = [
    DEPTH_CHART_ARCHIVE_FIRST_SEASON,
    DEPTH_CHART_ARCHIVE_LAST_SEASON,
  ];
  if (options.season) {
    clauses.push("season=?");
    bindings.push(options.season);
  }
  if (options.team) {
    clauses.push("team=?");
    bindings.push(options.team);
  }
  if (options.status) {
    clauses.push("status=?");
    bindings.push(options.status);
  }
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100)));
  const result = await db.prepare(`SELECT
      season,team,status,search_query AS searchQuery,source_count AS sourceCount,
      verified_snapshot_count AS verifiedSnapshotCount,verified_entry_count AS verifiedEntryCount,
      unresolved_entry_count AS unresolvedEntryCount,latest_snapshot_at AS latestSnapshotAt,
      best_source_kind AS bestSourceKind,next_action AS nextAction,last_attempt_at AS lastAttemptAt,
      updated_at AS updatedAt
    FROM depth_chart_coverage
    WHERE ${clauses.join(" AND ")}
    ORDER BY season,team
    LIMIT ?`)
    .bind(...bindings, limit)
    .all<Record<string, unknown>>();
  return result.results;
}

export async function getTeamDepthChartSources(db: D1Database, season: number, team: string) {
  const result = await db.prepare(`SELECT
      source_id AS sourceId,published_at AS publishedAt,snapshot_week AS snapshotWeek,
      source_kind AS sourceKind,source_label AS sourceLabel,source_url AS sourceUrl,
      verification_status AS verificationStatus,matched_players AS matchedPlayers,
      listed_players AS listedPlayers,updated_at AS updatedAt
    FROM depth_chart_snapshots
    WHERE season=? AND team=?
    ORDER BY published_at DESC,updated_at DESC`)
    .bind(season, team)
    .all<Record<string, unknown>>();
  return result.results;
}
