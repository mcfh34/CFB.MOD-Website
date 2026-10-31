export const rushingEndpoints = {
  "team-season": "/rushing/teams/season",
  "player-season": "/rushing/players/season",
  "team-games": "/rushing/teams/games",
  "player-games": "/rushing/players/games",
  plays: "/rushing/plays",
} as const;
export type RushingView = keyof typeof rushingEndpoints;
export type RushingRow = Record<string, unknown>;
export const rushingMetrics = [
  ["attempts", "Attempts", false], ["totalRushingYards", "Rush yards", false],
  ["yardsPerCarry", "Yards / carry", false], ["successRate", "Success rate", true],
  ["ppa", "PPA / play", false], ["totalPpa", "Total PPA", false],
  ["lineYards", "Line yards / carry", false], ["secondLevelYards", "Second-level yards / carry", false],
  ["openFieldYards", "Open-field yards / carry", false], ["stuffRate", "Stuff rate", true],
  ["powerSuccess", "Power success", true], ["explosiveness", "Explosiveness", false],
  ["rushingTouchdowns", "Rushing TD", false], ["sacks", "Sacks", false], ["kneels", "Kneels", false],
  ["teamRushes", "Team-only attempts", false], ["unattributedAttempts", "Unattributed attempts", false],
  ["directionEligibleAttempts", "Direction-eligible attempts", false],
  ["directionAvailableAttempts", "Known-direction attempts", false],
] as const;
export function rushingNumber(value: unknown, percent = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return percent ? `${(value * 100).toFixed(1)}%` : Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}
export function rushingObject(value: unknown): RushingRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RushingRow : {};
}
