export type TeamStatsSortDirection = "asc" | "desc";

export type TeamStatsSortableRow = {
  team:string;
  gamesPlayed:number;
  offYpp:number;
  offYpa:number;
  offYpc:number;
  offPatt:number;
  offRatt:number;
  defYppIndex:number;
  defYpaIndex:number;
  defYpcIndex:number;
};

export const TEAM_STATS_SORT_COLUMNS = [
  { key:"team", label:"TEAM", defaultDirection:"asc" },
  { key:"gamesPlayed", label:"GP", defaultDirection:"desc" },
  { key:"offYpp", label:"OFF YPP", defaultDirection:"desc" },
  { key:"offYpa", label:"OFF YPA", defaultDirection:"desc" },
  { key:"offYpc", label:"OFF YPC", defaultDirection:"desc" },
  { key:"offPatt", label:"PASS / GM", defaultDirection:"desc" },
  { key:"offRatt", label:"RUSH / GM", defaultDirection:"desc" },
  { key:"defYppIndex", label:"OPP YPP", defaultDirection:"asc" },
  { key:"defYpaIndex", label:"OPP YPA", defaultDirection:"asc" },
  { key:"defYpcIndex", label:"OPP YPC", defaultDirection:"asc" },
] as const satisfies ReadonlyArray<{
  key:keyof TeamStatsSortableRow;
  label:string;
  defaultDirection:TeamStatsSortDirection;
}>;

export type TeamStatsSortKey = (typeof TEAM_STATS_SORT_COLUMNS)[number]["key"];

export function defaultTeamStatsSortDirection(key:TeamStatsSortKey):TeamStatsSortDirection {
  return TEAM_STATS_SORT_COLUMNS.find((column) => column.key === key)?.defaultDirection ?? "desc";
}

export function sortTeamStatsRows<T extends TeamStatsSortableRow>(
  rows:readonly T[],
  key:TeamStatsSortKey,
  direction:TeamStatsSortDirection,
):T[] {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((first, second) => {
    const comparison = key === "team"
      ? first.team.localeCompare(second.team, undefined, { sensitivity:"base" })
      : Number(first[key]) - Number(second[key]);

    if (comparison !== 0) return comparison * multiplier;
    return first.team.localeCompare(second.team, undefined, { sensitivity:"base" });
  });
}
