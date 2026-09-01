import { wilsonConfidenceInterval } from "./marketLineQuality";

export type ScheduleMetricRow = {
  week: number;
  seasonType?: string;
  lineQuality?: string;
  vegasSpread?: number | null;
  vegasTotal?: number | null;
  spreadResult?: string | null;
  totalDiagnosticRecommendation?: string | null;
  totalDiagnosticResult?: string | null;
  spreadError?: number | null;
  totalError?: number | null;
};

export type ScheduleAccuracyMetric = {
  wins: number;
  losses: number;
  pushes: number;
  passed: number;
  quarantined: number;
  eligible: number;
  graded: number;
  sampleSize: number;
  accuracy: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  confidenceLevel: number;
  meanAbsoluteError: number | null;
};

function isMarketWeek(row: ScheduleMetricRow) {
  return row.week >= 5 || row.seasonType === "postseason";
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metric(
  rows: ScheduleMetricRow[],
  kind: "spread" | "total",
): ScheduleAccuracyMetric {
  const result = (row: ScheduleMetricRow) => {
    const stored = String(kind === "spread" ? row.spreadResult ?? "" : row.totalDiagnosticResult ?? "").toUpperCase();
    if (stored || kind === "spread") return stored;
    const completedDiagnosticPass = String(row.totalDiagnosticRecommendation ?? "").toUpperCase() === "PASS"
      && typeof row.totalError === "number"
      && Number.isFinite(row.totalError);
    return completedDiagnosticPass ? "PASS" : "";
  };
  const marketValue = (row: ScheduleMetricRow) => kind === "spread" ? row.vegasSpread : row.vegasTotal;
  const errorValue = (row: ScheduleMetricRow) => kind === "spread" ? row.spreadError : row.totalError;
  const marketRows = rows.filter(isMarketWeek);
  const trusted = marketRows.filter((row) => row.lineQuality !== "quarantined");
  const wins = trusted.filter((row) => result(row) === "W").length;
  const losses = trusted.filter((row) => result(row) === "L").length;
  const pushes = trusted.filter((row) => result(row) === "PUSH").length;
  const passed = trusted.filter((row) => result(row) === "PASS").length;
  const quarantined = marketRows.filter((row) => row.lineQuality === "quarantined" && marketValue(row) !== null && marketValue(row) !== undefined).length;
  const graded = wins + losses;
  const confidence = wilsonConfidenceInterval(wins, losses);
  const errors = trusted.map(errorValue).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    wins,
    losses,
    pushes,
    passed,
    quarantined,
    eligible: wins + losses + pushes + passed,
    graded,
    sampleSize: graded,
    accuracy: graded ? wins / graded : null,
    confidenceLow: confidence.low,
    confidenceHigh: confidence.high,
    confidenceLevel: confidence.level,
    meanAbsoluteError: average(errors),
  };
}

/**
 * Schedule cards are view-scoped. Callers pass the rows remaining after the
 * season, week, team, and conference filters so the ledger never displays a
 * season-wide record beside a one-week or one-team schedule.
 */
export function calculateScheduleFilterMetrics(rows: ScheduleMetricRow[]) {
  return {
    spread: metric(rows, "spread"),
    total: metric(rows, "total"),
  };
}
