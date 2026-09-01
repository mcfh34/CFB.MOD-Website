export type SchedulePickFilter = "all" | "ats" | "total" | "any";
export type ScheduleSortMode = "date" | "week" | "conference";

export type ScheduleFilterRow = {
  gameId: string;
  week: number;
  seasonType?: string;
  startDate?: string;
  homeConference?: string;
  awayConference?: string;
  lineQuality?: string;
  spreadQualified?: boolean;
  totalDiagnosticQualified?: boolean;
};

function rowConference(row: ScheduleFilterRow) {
  if (row.homeConference && row.homeConference === row.awayConference) return row.homeConference;
  return "Nonconference";
}

export function matchesSchedulePickFilter(row: ScheduleFilterRow, filter: SchedulePickFilter) {
  if (filter === "all") return true;
  if (row.lineQuality === "quarantined") return false;
  const atsPick = row.spreadQualified === true;
  const totalPick = row.totalDiagnosticQualified === true;
  if (filter === "ats") return atsPick;
  if (filter === "total") return totalPick;
  return atsPick || totalPick;
}

function compareDates(left: ScheduleFilterRow, right: ScheduleFilterRow) {
  return String(left.startDate ?? "9999").localeCompare(String(right.startDate ?? "9999"))
    || left.gameId.localeCompare(right.gameId);
}

export function compareScheduleRows(left: ScheduleFilterRow, right: ScheduleFilterRow, mode: ScheduleSortMode) {
  if (mode === "conference") {
    const conferenceOrder = rowConference(left).localeCompare(rowConference(right));
    if (conferenceOrder) return conferenceOrder;
  }
  if (mode === "week") {
    const leftPostseason = left.seasonType === "postseason" ? 1 : 0;
    const rightPostseason = right.seasonType === "postseason" ? 1 : 0;
    const phaseOrder = leftPostseason - rightPostseason;
    if (phaseOrder) return phaseOrder;
    const weekOrder = left.week - right.week;
    if (weekOrder) return weekOrder;
  }
  return compareDates(left, right);
}
