export type PffPosition = "QB" | "RB" | "WR" | "TE" | "OL";

export type PffTableDefinition = {
  slug: string;
  label: string;
  positions: readonly PffPosition[];
  unit?: boolean;
};

export type PffCell = string | number | boolean | null;
export type PffTablePayload = { sheet: string; values: PffCell[][] };

export type PffMetricDefinition = {
  key: string;
  index: number;
  label: string;
  format: "integer" | "number1" | "number2" | "percent100";
};

export type PffTeamDirectoryRow = {
  team: string;
  abbreviation?: string;
  conference?: string;
  color?: string;
  altColor?: string;
  logo?: string;
};

export const PFF_TABLES = [
  { slug: "passing-summary", label: "PASSING · SUMMARY", positions: ["QB"] },
  { slug: "passing-allowed-pressure", label: "PASSING · ALLOWED PRESSURE", positions: ["QB"] },
  { slug: "passing-concept", label: "PASSING · CONCEPT", positions: ["QB"] },
  { slug: "passing-depth", label: "PASSING · DEPTH + LOCATION", positions: ["QB"] },
  { slug: "passing-pressure", label: "PASSING · PRESSURE", positions: ["QB"] },
  { slug: "time-in-pocket", label: "PASSING · TIME IN POCKET", positions: ["QB"] },
  { slug: "rushing-summary", label: "RUSHING · SUMMARY", positions: ["QB", "RB", "WR", "TE"] },
  { slug: "receiving-summary", label: "RECEIVING · SUMMARY", positions: ["RB", "WR", "TE"] },
  { slug: "receiving-concept", label: "RECEIVING · CONCEPT + ALIGNMENT", positions: ["RB", "WR", "TE"] },
  { slug: "receiving-depth", label: "RECEIVING · DEPTH + LOCATION", positions: ["RB", "WR", "TE"] },
  { slug: "receiving-scheme", label: "RECEIVING · MAN VS ZONE", positions: ["RB", "WR", "TE"] },
  { slug: "blocking", label: "BLOCKING · SUMMARY", positions: ["RB", "WR", "TE", "OL"] },
  { slug: "pass-blocking", label: "BLOCKING · PASS PROTECTION", positions: ["RB", "WR", "TE", "OL"] },
  { slug: "run-blockng", label: "BLOCKING · RUN CONCEPT", positions: ["RB", "WR", "TE", "OL"] },
  { slug: "line-pass-blocking-efficiency", label: "OL UNIT · PASS BLOCKING", positions: ["OL"], unit: true },
] as const satisfies readonly PffTableDefinition[];

const PFF_ID_COLUMNS = new Set(["player", "player_id", "position", "team_name", "franchise_id"]);

const PFF_TOKEN_LABELS: Record<string, string> = {
  adot: "aDOT",
  btt: "BTT",
  ce: "C",
  epa: "EPA",
  lg: "LG",
  los: "LOS",
  lt: "LT",
  npa: "NON-PLAY ACTION",
  off: "OFF",
  ol: "OL",
  pa: "PLAY ACTION",
  pbe: "PBE",
  pct: "%",
  qb: "QB",
  rg: "RG",
  rt: "RT",
  te: "TE",
  ttt: "TTT",
  twp: "TWP",
  yco: "YCO",
  ypa: "YPA",
  yprr: "YPRR",
};

const COUNT_WORDS = [
  "attempts", "bats", "completions", "declined_penalties", "dropbacks", "drops", "first_downs",
  "fumbles", "hits", "hurries", "interceptions", "penalties", "pressures", "receptions", "routes",
  "sacks", "scrambles", "snaps", "spikes", "targets", "thrown_aways", "touchdowns", "turnover_worthy_plays",
  "yards", "plays", "blocks", "tackles",
];

const PFF_TEAM_ALIASES: Record<string, string> = {
  "ARIZONA ST": "Arizona State",
  "ARK STATE": "Arkansas State",
  "BALL ST": "Ball State",
  "BOISE ST": "Boise State",
  "BOSTON COL": "Boston College",
  "BOWL GREEN": "Bowling Green",
  "C MICHIGAN": "Central Michigan",
  "COAST CAR": "Coastal Carolina",
  "COLO STATE": "Colorado State",
  "E CAROLINA": "East Carolina",
  "E MICHIGAN": "Eastern Michigan",
  "FLORIDA ST": "Florida State",
  "FRESNO ST": "Fresno State",
  "GA SOUTHRN": "Georgia Southern",
  "GA STATE": "Georgia State",
  "GA TECH": "Georgia Tech",
  "JAMES MAD": "James Madison",
  "JVILLE ST": "Jacksonville State",
  "KANSAS ST": "Kansas State",
  "KENNESAW": "Kennesaw State",
  "LA LAFAYET": "Louisiana",
  "LA MONROE": "UL Monroe",
  "LA TECH": "Louisiana Tech",
  "MIAMI FL": "Miami",
  "MICH STATE": "Michigan State",
  "MIDDLE TN": "Middle Tennessee",
  "MISS STATE": "Mississippi State",
  "MO STATE": "Missouri State",
  "N CAROLINA": "North Carolina",
  "N ILLINOIS": "Northern Illinois",
  "N TEXAS": "North Texas",
  "NEW MEX ST": "New Mexico State",
  "NWESTERN": "Northwestern",
  "OKLA STATE": "Oklahoma State",
  "DOMINION": "Old Dominion",
  "OREGON ST": "Oregon State",
  "S ALABAMA": "South Alabama",
  "S CAROLINA": "South Carolina",
  "S DIEGO ST": "San Diego State",
  "S JOSE ST": "San José State",
  "SM HOUSTON": "Sam Houston",
  "SO MISS": "Southern Miss",
  "TEXAS ST": "Texas State",
  "UMASS": "Massachusetts",
  "UTAH ST": "Utah State",
  "VA TECH": "Virginia Tech",
  "W KENTUCKY": "Western Kentucky",
  "W MICHIGAN": "Western Michigan",
  "W VIRGINIA": "West Virginia",
  "WASH STATE": "Washington State",
};

function normalizedTeam(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function humanizeMetric(key: string) {
  return key.split("_").map((token) => PFF_TOKEN_LABELS[token] ?? token.toUpperCase()).join(" ");
}

function metricFormat(key: string): PffMetricDefinition["format"] {
  if (/(^|_)(percent|percentage|rate|pct)$/.test(key) || /_(percent|percentage|rate|pct)_/.test(key)) return "percent100";
  if (key.includes("grades_") || key.startsWith("grades_") || key.endsWith("_grade") || key.includes("qb_rating")) return "number1";
  if (COUNT_WORDS.some((word) => key === word || key.endsWith(`_${word}`))) return "integer";
  return "number2";
}

export function pffMetrics(payload: PffTablePayload | null): PffMetricDefinition[] {
  const headers = payload?.values?.[0] ?? [];
  return headers.flatMap((value, index) => {
    const key = String(value ?? "");
    if (!key || PFF_ID_COLUMNS.has(key)) return [];
    return [{ key, index, label: humanizeMetric(key), format: metricFormat(key) }];
  });
}

export function pffCellNumber(row: PffCell[], index: number) {
  const value = row[index];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function pffTableForPosition(position: PffPosition) {
  return PFF_TABLES.filter((table) => table.positions.includes(position));
}

export function pffPositionMatches(rawPosition: string, position: PffPosition, unit = false) {
  if (unit) return position === "OL";
  if (position === "RB") return rawPosition === "HB" || rawPosition === "FB";
  if (position === "OL") return rawPosition === "C" || rawPosition === "G" || rawPosition === "T";
  return rawPosition === position;
}

export function resolvePffTeam(rawTeam: string, directory: readonly PffTeamDirectoryRow[]) {
  const aliased = PFF_TEAM_ALIASES[rawTeam.trim().toUpperCase()] ?? rawTeam;
  const key = normalizedTeam(aliased);
  return directory.find((row) => normalizedTeam(row.team) === key || normalizedTeam(row.abbreviation ?? "") === key) ?? null;
}

function maximumValue(row: PffCell[], indices: Map<string, number>, keys: readonly string[]) {
  return Math.max(0, ...keys.map((key) => {
    const index = indices.get(key);
    return index === undefined ? 0 : pffCellNumber(row, index) ?? 0;
  }));
}

export function pffRowQualified(
  row: PffCell[],
  headers: readonly PffCell[],
  table: PffTableDefinition,
  position: PffPosition,
) {
  const indices = new Map(headers.map((value, index) => [String(value), index]));
  const games = maximumValue(row, indices, ["player_game_count"]);
  if (games < 4) return false;
  if (table.unit) return maximumValue(row, indices, ["pass_snaps", "attempts"]) >= 150;
  if (table.slug === "blocking") return maximumValue(row, indices, ["snap_counts_block", "snap_counts_pass_block", "snap_counts_run_block"]) >= (position === "OL" ? 150 : 60);
  if (table.slug === "pass-blocking") return maximumValue(row, indices, ["snap_counts_pass_block", "true_pass_set_snap_counts_pass_block"]) >= (position === "OL" ? 125 : 50);
  if (table.slug === "run-blockng") return maximumValue(row, indices, ["snap_counts_run_block", "snap_counts_run_play"]) >= (position === "OL" ? 125 : 50);
  if (table.slug.startsWith("receiving-")) return maximumValue(row, indices, ["base_targets", "targets", "routes"]) >= 20;
  if (table.slug === "rushing-summary") {
    const minimum = position === "RB" ? 40 : position === "QB" ? 25 : 10;
    return maximumValue(row, indices, ["attempts", "total_touches"]) >= minimum;
  }
  if (table.slug === "passing-allowed-pressure") return maximumValue(row, indices, ["allowed_pressure_dropbacks"]) >= 75;
  return maximumValue(row, indices, ["base_dropbacks", "dropbacks", "base_attempts", "attempts", "avg_ttt_attempts"]) >= 75;
}

const SAMPLE_SUFFIXES = [
  "snap_counts_pass_block", "snap_counts_run_block", "pass_snaps", "pass_plays", "run_plays",
  "aimed_passes", "dropbacks", "attempts", "targets", "routes",
] as const;

export function pffMetricSampleQualified(row: PffCell[], headers: readonly PffCell[], metricIndex: number) {
  const metric = String(headers[metricIndex] ?? "");
  let best: { index: number; prefixLength: number; suffix: string } | null = null;
  headers.forEach((value, index) => {
    const key = String(value ?? "");
    for (const suffix of SAMPLE_SUFFIXES) {
      if (key !== suffix && !key.endsWith(`_${suffix}`)) continue;
      const prefix = key.slice(0, key.length - suffix.length);
      if (!metric.startsWith(prefix)) continue;
      if (!best || prefix.length > best.prefixLength) best = { index, prefixLength: prefix.length, suffix };
    }
  });
  if (!best || best.prefixLength === 0) return true;
  const sample = pffCellNumber(row, best.index);
  const minimum = best.suffix.includes("snap") || best.suffix.includes("plays") || best.suffix.includes("routes") ? 25 : 8;
  return sample !== null && sample >= minimum;
}

export function pffFallbackJersey(position: PffPosition, seed: string) {
  const pools: Record<PffPosition, number[]> = {
    QB: [1, 2, 3, 5, 7, 9, 10, 12, 15, 16, 18],
    RB: [0, 1, 2, 3, 4, 5, 6, 20, 21, 22, 23, 24, 25, 26, 28, 29, 32, 33, 34],
    WR: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 17, 80, 81, 82, 83, 84, 85, 86, 87, 88],
    TE: [0, 7, 8, 9, 11, 18, 19, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
    OL: Array.from({ length: 30 }, (_, index) => 50 + index),
  };
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const pool = pools[position];
  return pool[hash % pool.length];
}

export function normalizedPffPlayer(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
