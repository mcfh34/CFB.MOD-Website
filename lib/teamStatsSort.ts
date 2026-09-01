import type { AdvancedMetricKey, AdvancedProfile } from "./advancedMetrics";

export type TeamStatsSortDirection = "asc" | "desc";
export type TeamStatsAdvancedGroup = "overall" | "rushing" | "passing" | "downs" | "disruption" | "field-position";
export type TeamStatsGroup = "core" | TeamStatsAdvancedGroup | "all-advanced";
export type TeamStatsAdvancedView = "offense-raw" | "offense-index" | "defense-raw" | "defense-index";
export type TeamStatsCoreSortKey =
  | "team"
  | "gamesPlayed"
  | "offYpp"
  | "offYpa"
  | "offYpc"
  | "offPatt"
  | "offRatt"
  | "defYppIndex"
  | "defYpaIndex"
  | "defYpcIndex";
export type TeamStatsAdvancedSortKey = `advanced:${TeamStatsAdvancedView}:${AdvancedMetricKey}`;
export type TeamStatsSortKey = TeamStatsCoreSortKey | TeamStatsAdvancedSortKey;
export type TeamStatsValueFormat = "integer" | "number1" | "number2" | "number3" | "rate" | "signed1" | "index";

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
  advancedProfile?:AdvancedProfile|null;
};

export type TeamStatsColumn = {
  key:TeamStatsSortKey;
  label:string;
  dataLabel:string;
  description:string;
  defaultDirection:TeamStatsSortDirection;
  format:TeamStatsValueFormat;
  group:TeamStatsGroup;
};

export const TEAM_STATS_SORT_COLUMNS = [
  { key:"team", label:"TEAM", dataLabel:"TEAM", description:"The school represented by this row. The smaller text identifies its conference during the selected season.", defaultDirection:"asc", format:"integer", group:"core" },
  { key:"gamesPlayed", label:"GP", dataLabel:"GP", description:"Games included in the current cumulative sample. One- and two-game samples are less stable than mature season profiles.", defaultDirection:"desc", format:"integer", group:"core" },
  { key:"offYpp", label:"OFF YPP", dataLabel:"OFF YPP", description:"Average yards gained every time the offense snaps the ball. Six yards per play means 600 yards over 100 plays.", defaultDirection:"desc", format:"number2", group:"core" },
  { key:"offYpa", label:"OFF YPA", dataLabel:"OFF YPA", description:"Average passing yards gained per attempt. Eight yards per attempt equals 240 yards on 30 passes.", defaultDirection:"desc", format:"number2", group:"core" },
  { key:"offYpc", label:"OFF YPC", dataLabel:"OFF YPC", description:"Average rushing yards gained per carry. Five yards per carry equals 200 yards on 40 runs.", defaultDirection:"desc", format:"number2", group:"core" },
  { key:"offPatt", label:"PASS / GM", dataLabel:"PASS / GM", description:"Average passes attempted per game. A high number can reflect pace, play calling, or frequent comeback situations.", defaultDirection:"desc", format:"number1", group:"core" },
  { key:"offRatt", label:"RUSH / GM", dataLabel:"RUSH / GM", description:"Average rushing attempts per game. A high number can reflect a run-first offense or more time protecting leads.", defaultDirection:"desc", format:"number1", group:"core" },
  { key:"defYppIndex", label:"OPP YPP", dataLabel:"OPP YPP", description:"Opponent-adjusted yards per play allowed. 100% is FBS average; 85% means the defense allows 15% less production than average.", defaultDirection:"asc", format:"index", group:"core" },
  { key:"defYpaIndex", label:"OPP YPA", dataLabel:"OPP YPA", description:"Opponent-adjusted passing efficiency allowed. Lower is better; 90% means opponents produce 10% less than average through the air.", defaultDirection:"asc", format:"index", group:"core" },
  { key:"defYpcIndex", label:"OPP YPC", dataLabel:"OPP YPC", description:"Opponent-adjusted rushing efficiency allowed. Lower is better; 80% means opponents produce 20% less than average on the ground.", defaultDirection:"asc", format:"index", group:"core" },
] as const satisfies ReadonlyArray<TeamStatsColumn>;

type AdvancedMetricDefinition = {
  key:AdvancedMetricKey;
  label:string;
  group:TeamStatsAdvancedGroup;
  description:string;
  format:Exclude<TeamStatsValueFormat, "integer" | "index">;
  inverse:boolean;
};

export const TEAM_STATS_ADVANCED_METRICS = [
  { key:"pointsPerGame", label:"PTS / GM", group:"overall", format:"number1", inverse:false, description:"Average points scored per game on offense or allowed per game on defense." },
  { key:"yardsPerPlay", label:"YARDS / PLAY", group:"overall", format:"number2", inverse:false, description:"Average yards created or allowed on every offensive snap." },
  { key:"successRate", label:"SUCCESS RATE", group:"overall", format:"rate", inverse:false, description:"Share of plays gaining enough yards for the down and distance to keep the offense on schedule." },
  { key:"explosiveness", label:"EXPLOSIVENESS", group:"overall", format:"number3", inverse:false, description:"Scoring value created by successful plays. Higher offensive values mean more field-flipping gains." },
  { key:"ppa", label:"PPA / PLAY", group:"overall", format:"number3", inverse:false, description:"Estimated points added by an average play after accounting for down, distance, and field position." },
  { key:"pointsPerDrive", label:"PTS / DRIVE", group:"overall", format:"number2", inverse:false, description:"Average points produced or allowed per possession. This separates drive finishing from empty yardage." },
  { key:"playsPerDrive", label:"PLAYS / DRIVE", group:"overall", format:"number1", inverse:false, description:"Average number of offensive snaps in each possession, a measure of drive sustainability." },

  { key:"lineYards", label:"LINE YDS / RUSH", group:"rushing", format:"number2", inverse:false, description:"Rushing yards credited primarily to blocking near the line of scrimmage." },
  { key:"secondLevelYards", label:"2ND LEVEL / RUSH", group:"rushing", format:"number2", inverse:false, description:"Rushing yards gained after clearing the defensive line and reaching the linebacker level." },
  { key:"openFieldYards", label:"OPEN FIELD / RUSH", group:"rushing", format:"number2", inverse:false, description:"Rushing yards created after the runner reaches the secondary and has open-field space." },
  { key:"stuffRate", label:"STUFF RATE", group:"rushing", format:"rate", inverse:true, description:"Share of carries stopped at or behind the line of scrimmage. Lower is better for an offense; higher is better for a defense." },
  { key:"powerSuccess", label:"POWER SUCCESS", group:"rushing", format:"rate", inverse:false, description:"Short-yardage conversion rate when only one or two yards are needed." },
  { key:"rushingSuccessRate", label:"RUSH SUCCESS", group:"rushing", format:"rate", inverse:false, description:"Share of rushing attempts gaining enough yardage for the down and distance." },
  { key:"rushingExplosiveness", label:"RUSH EXPLOSIVE", group:"rushing", format:"number3", inverse:false, description:"Scoring value produced by successful rushing plays and breakaway gains." },
  { key:"rushingPpa", label:"RUSH PPA", group:"rushing", format:"number3", inverse:false, description:"Estimated points added by an average rushing attempt." },

  { key:"completionRate", label:"COMPLETION %", group:"passing", format:"rate", inverse:false, description:"Share of pass attempts completed, calculated from attempts and completions in the box score." },
  { key:"yardsPerCompletion", label:"YDS / COMPLETION", group:"passing", format:"number2", inverse:false, description:"Average yardage gained each time a pass is completed, including yards after the catch." },
  { key:"passingSuccessRate", label:"PASS SUCCESS", group:"passing", format:"rate", inverse:false, description:"Share of pass attempts gaining enough yardage for the down and distance." },
  { key:"passingExplosiveness", label:"PASS EXPLOSIVE", group:"passing", format:"number3", inverse:false, description:"Scoring value produced by successful passes and downfield chunk plays." },
  { key:"passingPpa", label:"PASS PPA", group:"passing", format:"number3", inverse:false, description:"Estimated points added by an average passing attempt." },

  { key:"standardDownSuccessRate", label:"STD DOWN SUCCESS", group:"downs", format:"rate", inverse:false, description:"Success rate before the defense can confidently expect a pass, such as first down and second-and-short." },
  { key:"standardDownExplosiveness", label:"STD DOWN EXPLOSIVE", group:"downs", format:"number3", inverse:false, description:"Explosive-play value on downs when run and pass both remain credible." },
  { key:"standardDownPpa", label:"STD DOWN PPA", group:"downs", format:"number3", inverse:false, description:"Estimated points added on standard downs." },
  { key:"passingDownSuccessRate", label:"PASS DOWN SUCCESS", group:"downs", format:"rate", inverse:false, description:"Success rate in obvious passing situations, testing protection, quarterback decisions, and receiver separation." },
  { key:"passingDownExplosiveness", label:"PASS DOWN EXPLOSIVE", group:"downs", format:"number3", inverse:false, description:"Explosive-play value when the defense expects a pass." },
  { key:"passingDownPpa", label:"PASS DOWN PPA", group:"downs", format:"number3", inverse:false, description:"Estimated points added in obvious passing situations." },
  { key:"thirdDownSuccessRate", label:"3RD DOWN", group:"downs", format:"rate", inverse:false, description:"Late-down conversion proxy used across the historical feed when a direct third-down split is unavailable." },
  { key:"redZoneEfficiency", label:"RED ZONE", group:"downs", format:"rate", inverse:false, description:"Share of red-zone opportunities converted into scoring value when the source feed supplies it." },

  { key:"havocRate", label:"HAVOC", group:"disruption", format:"rate", inverse:true, description:"Share of plays disrupted by tackles for loss, sacks, forced fumbles, interceptions, or pass breakups." },
  { key:"frontSevenHavoc", label:"FRONT 7 HAVOC", group:"disruption", format:"rate", inverse:true, description:"Disruption created or allowed near the line by defensive linemen and linebackers." },
  { key:"dbHavoc", label:"DB HAVOC", group:"disruption", format:"rate", inverse:true, description:"Disruption created or allowed in coverage by defensive backs." },
  { key:"turnoverMargin", label:"TURNOVER MARGIN", group:"disruption", format:"signed1", inverse:false, description:"Per-game turnover contribution available from the archived box-score feed." },
  { key:"penaltyYards", label:"PENALTY YDS", group:"disruption", format:"number1", inverse:true, description:"Average penalty yardage when supplied by the historical source feed." },

  { key:"fieldPosition", label:"START FIELD POS", group:"field-position", format:"number1", inverse:false, description:"Average starting field position. Better starting position shortens the field and captures part of special-teams value." },
  { key:"netPunting", label:"NET PUNT", group:"field-position", format:"number1", inverse:false, description:"Net punt distance after accounting for returns when supplied by the source feed." },
  { key:"puntReturn", label:"PUNT RETURN", group:"field-position", format:"number1", inverse:false, description:"Average punt-return yardage when supplied by the source feed." },
  { key:"kickReturn", label:"KICK RETURN", group:"field-position", format:"number1", inverse:false, description:"Average kickoff-return yardage when supplied by the source feed." },
  { key:"hiddenYards", label:"HIDDEN YDS", group:"field-position", format:"signed1", inverse:false, description:"Field-position value not captured by ordinary offense and defense yardage when supplied by the source feed." },
] as const satisfies ReadonlyArray<AdvancedMetricDefinition>;

export const TEAM_STATS_GROUPS = [
  { key:"core", label:"Core Efficiency" },
  { key:"overall", label:"Advanced Overall" },
  { key:"rushing", label:"Advanced Rushing" },
  { key:"passing", label:"Advanced Passing" },
  { key:"downs", label:"Down & Distance" },
  { key:"disruption", label:"Havoc & Discipline" },
  { key:"field-position", label:"Field Position & Returns" },
  { key:"all-advanced", label:"All Advanced" },
] as const satisfies ReadonlyArray<{ key:TeamStatsGroup; label:string }>;

export const TEAM_STATS_ADVANCED_VIEWS = [
  { key:"offense-raw", label:"Offense · Raw", shortLabel:"OFF RAW" },
  { key:"offense-index", label:"Offense · Adjusted %", shortLabel:"OFF ADJ %" },
  { key:"defense-raw", label:"Defense · Raw Allowed", shortLabel:"DEF RAW" },
  { key:"defense-index", label:"Defense · Adjusted % Allowed", shortLabel:"DEF ADJ %" },
] as const satisfies ReadonlyArray<{ key:TeamStatsAdvancedView; label:string; shortLabel:string }>;

function advancedMetric(key:AdvancedMetricKey) {
  return TEAM_STATS_ADVANCED_METRICS.find((metric) => metric.key === key);
}

function parseAdvancedSortKey(key:TeamStatsSortKey) {
  if (!key.startsWith("advanced:")) return null;
  const [, view, metric] = key.split(":");
  if (!TEAM_STATS_ADVANCED_VIEWS.some((option) => option.key === view)) return null;
  const definition = advancedMetric(metric as AdvancedMetricKey);
  return definition ? { view:view as TeamStatsAdvancedView, metric:definition } : null;
}

function advancedDefaultDirection(view:TeamStatsAdvancedView, metric:AdvancedMetricDefinition):TeamStatsSortDirection {
  if (view === "offense-index") return "desc";
  if (view === "defense-index") return "asc";
  if (view === "offense-raw") return metric.inverse ? "asc" : "desc";
  return metric.inverse ? "desc" : "asc";
}

export function teamStatsColumns(group:TeamStatsGroup, view:TeamStatsAdvancedView):TeamStatsColumn[] {
  if (group === "core") return [...TEAM_STATS_SORT_COLUMNS];
  const side = view.startsWith("offense") ? "Offensive" : "Defensive";
  const indexed = view.endsWith("index");
  const viewLabel = TEAM_STATS_ADVANCED_VIEWS.find((option) => option.key === view)?.shortLabel ?? "";
  const metrics = TEAM_STATS_ADVANCED_METRICS.filter((metric) => group === "all-advanced" || metric.group === group);
  return [
    TEAM_STATS_SORT_COLUMNS[0],
    TEAM_STATS_SORT_COLUMNS[1],
    ...metrics.map((metric):TeamStatsColumn => ({
      key:`advanced:${view}:${metric.key}`,
      label:metric.label,
      dataLabel:`${metric.label} · ${viewLabel}`,
      description:indexed
        ? `${metric.description} This column is opponent-adjusted: 100% is the FBS average. Above 100% is better for offense; below 100% allowed is better for defense.`
        : `${metric.description} This is the ${side.toLowerCase()} raw value before opponent adjustment.`,
      defaultDirection:advancedDefaultDirection(view, metric),
      format:indexed ? "index" : metric.format,
      group,
    })),
  ];
}

export function defaultTeamStatsSortDirection(key:TeamStatsSortKey):TeamStatsSortDirection {
  const core = TEAM_STATS_SORT_COLUMNS.find((column) => column.key === key);
  if (core) return core.defaultDirection;
  const advanced = parseAdvancedSortKey(key);
  return advanced ? advancedDefaultDirection(advanced.view, advanced.metric) : "desc";
}

export function teamStatsNumericValue(row:TeamStatsSortableRow, key:TeamStatsSortKey):number|null {
  if (key === "team") return null;
  if (!key.startsWith("advanced:")) {
    const value = row[key];
    return Number.isFinite(value) ? value : null;
  }
  const parsed = parseAdvancedSortKey(key);
  if (!parsed || !row.advancedProfile) return null;
  const side = parsed.view.startsWith("offense") ? row.advancedProfile.offense : row.advancedProfile.defense;
  const values = parsed.view.endsWith("index") ? side.index : side.raw;
  const value = values[parsed.metric.key];
  return value !== null && Number.isFinite(value) ? value : null;
}

export function formatTeamStatsValue(row:TeamStatsSortableRow, column:TeamStatsColumn):string {
  if (column.key === "team") return row.team;
  const value = teamStatsNumericValue(row, column.key);
  if (value === null) return "—";
  if (column.format === "integer") return Math.round(value).toString();
  if (column.format === "index") return `${(value * 100).toFixed(0)}%`;
  if (column.format === "rate") return `${(value * 100).toFixed(1)}%`;
  if (column.format === "number3") return value.toFixed(3);
  if (column.format === "number2") return value.toFixed(2);
  if (column.format === "signed1") return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  return value.toFixed(1);
}

export function teamStatsValueTone(row:TeamStatsSortableRow, key:TeamStatsSortKey):"positive"|"negative"|"" {
  if (key === "defYppIndex" || key === "defYpaIndex" || key === "defYpcIndex") {
    const value = teamStatsNumericValue(row, key);
    if (value === null || Math.abs(value - 1) < 0.015) return "";
    return value < 1 ? "positive" : "negative";
  }
  const parsed = parseAdvancedSortKey(key);
  if (!parsed || !row.advancedProfile) return "";
  const side = parsed.view.startsWith("offense") ? "offense" : "defense";
  const index = row.advancedProfile[side].index[parsed.metric.key];
  if (index === null || !Number.isFinite(index) || Math.abs(index - 1) < 0.015) return "";
  const favorable = side === "offense" ? index > 1 : index < 1;
  return favorable ? "positive" : "negative";
}

export function sortTeamStatsRows<T extends TeamStatsSortableRow>(
  rows:readonly T[],
  key:TeamStatsSortKey,
  direction:TeamStatsSortDirection,
):T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((first, second) => {
    if (key === "team") {
      const comparison = first.team.localeCompare(second.team, undefined, { sensitivity:"base" });
      return comparison === 0 ? 0 : comparison * multiplier;
    }
    const firstValue = teamStatsNumericValue(first, key);
    const secondValue = teamStatsNumericValue(second, key);
    if (firstValue === null && secondValue === null) return first.team.localeCompare(second.team, undefined, { sensitivity:"base" });
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    const comparison = firstValue - secondValue;
    if (comparison !== 0) return comparison * multiplier;
    return first.team.localeCompare(second.team, undefined, { sensitivity:"base" });
  });
}
