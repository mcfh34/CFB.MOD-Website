import type { AdvancedMetricKey, AdvancedProfile } from "./advancedMetrics";
import { getPublishedDepthChart, type PublishedDepthChart } from "./publishedDepthCharts";
import { playerRatingCompositeScore } from "./playerRatingFormula";

export const PLAYER_MODEL_VERSION = 6;
export const FIRST_PLAYER_SEASON = 2014;
const playerModelNow = new Date();
export const INITIAL_PLAYER_SEASON = playerModelNow.getUTCMonth() >= 6 ? playerModelNow.getUTCFullYear() : playerModelNow.getUTCFullYear() - 1;
export const PLAYER_TRANSFER_START_YEAR = 2021;
export const playerRecruitingStartYear = (season: number) => Math.max(2000, season - 7);

type JsonRecord = Record<string, unknown>;

export type PlayerStatLine = {
  category: string;
  label: string;
  value: string;
  numericValue: number | null;
};

export type PlayerAdvancedProfile = {
  overallUsage: number | null;
  passUsage: number | null;
  rushUsage: number | null;
  averagePpa: number | null;
  passPpa: number | null;
  rushPpa: number | null;
  totalPpa: number | null;
  passingSuccessRate: number | null;
  rushingSuccessRate: number | null;
  passingPlays: number;
  rushingPlays: number;
};

export type PlayerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  team: string;
  jersey: number | null;
  listedPosition: string;
  position: string;
  positionGroup: string;
  positionSource: "PUBLISHED" | "ROSTER" | "TRANSFER" | "RECRUITING" | "PHYSICAL PROFILE";
  positionConfidence: "HIGH" | "MEDIUM" | "LOW";
  side: "offense" | "defense" | "specialists" | "other";
  height: number | null;
  weight: number | null;
  year: number | null;
  recruitIds: string[];
  highSchoolStars: number | null;
  highSchoolRating: number | null;
  recruitingStars: number | null;
  recruitingRating: number | null;
  recruitingClassYear: number | null;
  recruitingRank: number | null;
  recruitingPosition: string | null;
  recruitingMatch: "ID" | "NAME" | null;
  transferStars: number | null;
  transferRating: number | null;
  transferSeason: number | null;
  transferOrigin: string | null;
  transferDestination: string | null;
  transferPosition: string | null;
  transferEligibility: string | null;
  transferMatch: "NAME+DESTINATION" | null;
  ratingSource: "TRANSFER" | "HIGH SCHOOL" | "UNRATED";
  stats: PlayerStatLine[];
  advanced: PlayerAdvancedProfile;
  impactScore: number;
  /**
   * A production-only composite of efficiency, success, effectiveness,
   * workload and competition. It is converted to a 50–99 position grade
   * against archived FBS player-seasons in the API layer.
   */
  productionScore?: number | null;
  /** Capped counting-production input retained for auditable v2 rebuilds. */
  productionVolumeScore?: number | null;
  productionRating?: number | null;
  productionRatingSource?: "OBSERVED" | "PROJECTED" | "UNIT" | "UNAVAILABLE";
  productionRatingEvidence?: string;
  projectedStarter: boolean;
  depthRole: string | null;
  publishedDepth: number | null;
  starterConfidence: "PUBLISHED" | "HIGH" | "MEDIUM" | "ROSTER";
  starterEvidence: string;
};

export type PlayerDepthGroup = {
  key: string;
  label: string;
  side: PlayerProfile["side"];
  starterCount: number;
  players: PlayerProfile[];
};

export type TeamPlayerModel = {
  season: number;
  team: string;
  source: "CollegeFootballData";
  starterMethod: "PUBLISHED" | "SOURCE-AWARE-PROJECTION" | "MODEL-PROJECTED";
  depthSource?: {
    kind: "OFFICIAL_TEAM_NOTES" | "MODEL_PROJECTION";
    label: string;
    publishedAt: string | null;
    sourceUrl: string | null;
    matchedPlayers: number;
    listedPlayers: number;
  };
  sourceNote: string;
  offensiveLineUnitRating?: number | null;
  offensiveLineUnitEvidence?: string;
  players: PlayerProfile[];
  depthChart: PlayerDepthGroup[];
  impactPlayers: {
    offense: string[];
    defense: string[];
    specialists: string[];
  };
};

export type OffensiveLineUnitMetric = {
  key: AdvancedMetricKey;
  label: string;
  raw: number | null;
  index: number | null;
  format: "yards" | "rate";
  note: string;
};

export type OffensiveLineUnitProfile = {
  productionScore: number | null;
  grade: number | null;
  sampleGames: number;
  metrics: OffensiveLineUnitMetric[];
};

export type FormationPlayer = {
  id: string;
  role: string;
  jersey: number | null;
  lastName: string;
  position: string;
  confidence: PlayerProfile["starterConfidence"];
  profile: PlayerProfile;
};

const records = (input: unknown): JsonRecord[] =>
  Array.isArray(input) ? input.filter((row): row is JsonRecord => Boolean(row && typeof row === "object")) : [];

const field = (row: JsonRecord, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
};

const text = (row: JsonRecord, ...keys: string[]) => {
  const value = field(row, ...keys);
  return value === undefined ? "" : String(value).trim();
};

const number = (row: JsonRecord, ...keys: string[]) => {
  const value = field(row, ...keys);
  if (value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const nameKey = (team: string, name: string) => `${normalized(team)}\u0000${normalized(name.replace(/,/g, " "))}`;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function canonicalPlayerPosition(input: string | null | undefined) {
  const position = normalized(input ?? "").toUpperCase();
  if (!position) return "ATH";
  if (position === "HB") return "RB";
  if (position === "T") return "OT";
  if (position === "G" || position === "IOL") return "OG";
  if (position === "OC") return "C";
  if (position === "NG") return "NT";
  if (position === "NICKEL") return "NB";
  if (position === "PK") return "K";
  return position;
}

function playerSide(position: string): PlayerProfile["side"] {
  if (["QB", "RB", "FB", "WR", "TE", "OL", "OT", "OG", "C", "LT", "LG", "RG", "RT"].includes(position)) return "offense";
  if (["DE", "EDGE", "DL", "DT", "NT", "LB", "ILB", "MLB", "OLB", "WLB", "SLB", "CB", "S", "FS", "SS", "DB", "NB", "STAR"].includes(position)) return "defense";
  if (["K", "P", "LS"].includes(position)) return "specialists";
  return "other";
}

function positionGroup(position: string) {
  if (position === "QB") return "QB";
  if (position === "RB" || position === "FB") return "BACKS";
  if (position === "WR" || position === "TE") return "RECEIVERS";
  if (["OL", "OT", "OG", "C", "LT", "LG", "RG", "RT"].includes(position)) return "OFFENSIVE LINE";
  if (["DE", "EDGE", "DL", "DT", "NT"].includes(position)) return "DEFENSIVE FRONT";
  if (["LB", "ILB", "MLB", "OLB", "WLB", "SLB"].includes(position)) return "LINEBACKERS";
  if (["CB", "S", "FS", "SS", "DB", "NB", "STAR"].includes(position)) return "SECONDARY";
  if (["K", "P", "LS"].includes(position)) return "SPECIALISTS";
  return "ATHLETES";
}

function emptyAdvanced(): PlayerAdvancedProfile {
  return {
    overallUsage: null,
    passUsage: null,
    rushUsage: null,
    averagePpa: null,
    passPpa: null,
    rushPpa: null,
    totalPpa: null,
    passingSuccessRate: null,
    rushingSuccessRate: null,
    passingPlays: 0,
    rushingPlays: 0,
  };
}

function statValue(stats: PlayerStatLine[], category: string[], labels: string[]) {
  const categorySet = new Set(category.map(normalized));
  const labelSet = new Set(labels.map(normalized));
  const exact = stats.find((row) => categorySet.has(normalized(row.category)) && labelSet.has(normalized(row.label)) && row.numericValue !== null);
  if (exact?.numericValue !== null && exact?.numericValue !== undefined) return exact.numericValue;
  const broad = stats.find((row) => categorySet.has(normalized(row.category)) && labels.some((label) => normalized(row.label).includes(normalized(label))) && row.numericValue !== null);
  return broad?.numericValue ?? 0;
}

export type PlayerBasicMetricKey =
  | "passCompletions" | "passAttempts" | "passYards" | "passTd" | "interceptions"
  | "rushAttempts" | "rushYards" | "rushTd"
  | "receptions" | "receivingYards" | "receivingTd"
  | "kickReturns" | "kickReturnYards" | "kickReturnTd"
  | "puntReturns" | "puntReturnYards" | "puntReturnTd"
  | "tackles" | "tfl" | "sacks" | "qbHurries" | "passesDefended" | "defensiveInterceptions" | "fumbleRecoveries"
  | "fieldGoalsMade" | "fieldGoalsAttempted" | "extraPointsMade"
  | "punts" | "puntYards";

export function playerBasicMetric(player: PlayerProfile, metric: PlayerBasicMetricKey) {
  const aliases = {
    passCompletions: [["passing"], ["cmp", "completions", "passingcompletions"]],
    passAttempts: [["passing"], ["att", "attempts", "passingattempts"]],
    passYards: [["passing"], ["yds", "yards", "passingyards"]],
    passTd: [["passing"], ["td", "touchdowns", "passingtouchdowns"]],
    interceptions: [["passing"], ["int", "interceptions"]],
    rushAttempts: [["rushing"], ["car", "att", "attempts", "carries"]],
    rushYards: [["rushing"], ["yds", "yards", "rushingyards"]],
    rushTd: [["rushing"], ["td", "touchdowns", "rushingtouchdowns"]],
    receptions: [["receiving"], ["rec", "receptions"]],
    receivingYards: [["receiving"], ["yds", "yards", "receivingyards"]],
    receivingTd: [["receiving"], ["td", "touchdowns", "receivingtouchdowns"]],
    kickReturns: [["kickReturns", "kick returns"], ["no", "returns", "kickreturns"]],
    kickReturnYards: [["kickReturns", "kick returns"], ["yds", "yards", "kickreturnyards"]],
    kickReturnTd: [["kickReturns", "kick returns"], ["td", "touchdowns", "kickreturntouchdowns"]],
    puntReturns: [["puntReturns", "punt returns"], ["no", "returns", "puntreturns"]],
    puntReturnYards: [["puntReturns", "punt returns"], ["yds", "yards", "puntreturnyards"]],
    puntReturnTd: [["puntReturns", "punt returns"], ["td", "touchdowns", "puntreturntouchdowns"]],
    tackles: [["defensive", "defense"], ["tot", "total", "tackles", "totaltackles"]],
    tfl: [["defensive", "defense"], ["tfl", "tacklesforloss"]],
    sacks: [["defensive", "defense"], ["sack", "sacks"]],
    qbHurries: [["defensive", "defense"], ["qbhur", "qbhurries", "hurries"]],
    passesDefended: [["defensive", "defense"], ["pd", "passesdefended", "passbreakups"]],
    defensiveInterceptions: [["defensive", "defense", "interceptions"], ["int", "interceptions"]],
    fumbleRecoveries: [["fumbles", "defensive", "defense"], ["rec", "recoveries", "fumblerecoveries"]],
    fieldGoalsMade: [["kicking"], ["fgm", "fieldgoalsmade"]],
    fieldGoalsAttempted: [["kicking"], ["fga", "fieldgoalsattempted"]],
    extraPointsMade: [["kicking"], ["xpm", "extrapointsmade", "patmade"]],
    punts: [["punting"], ["no", "punts", "puntattempts"]],
    puntYards: [["punting"], ["yds", "yards", "puntyards"]],
  } as const;
  const [categories, labels] = aliases[metric];
  return statValue(player.stats, [...categories], [...labels]);
}

export function productionPosition(player: Pick<PlayerProfile, "position" | "positionGroup">) {
  if (player.position === "QB") return "QB";
  if (player.position === "RB" || player.position === "FB") return "RB";
  if (player.position === "WR") return "WR";
  if (player.position === "TE") return "TE";
  if (isOffensiveLine(player.position)) return "OL";
  if (["DE", "EDGE", "OLB"].includes(player.position)) return "EDGE";
  if (["DL", "DT", "NT"].includes(player.position)) return "DL";
  if (["LB", "ILB", "MLB", "WLB", "SLB"].includes(player.position)) return "LB";
  if (player.position === "CB") return "CB";
  if (["S", "FS", "SS", "DB", "NB", "STAR"].includes(player.position)) return "S";
  if (player.position === "K") return "K";
  if (player.position === "P") return "P";
  return player.positionGroup === "OFFENSIVE LINE" ? "OL" : player.position;
}

/**
 * Production only: no recruiting grade, class year, size or team rating enters
 * this score. Those fields are used only to project a player with no observed
 * sample after the historical position scale has been built.
 */
export function accumulatedPlayerProductionScore(player: PlayerProfile) {
  const position = productionPosition(player);
  if (position === "OL") return null;
  const advanced = player.advanced;
  const hasBoxProduction = player.stats.some((row) => (row.numericValue ?? 0) > 0);
  const advancedPlays = advanced.passingPlays + advanced.rushingPlays;
  const hasAdvancedProduction = advancedPlays > 0
    || advanced.overallUsage !== null
    || advanced.totalPpa !== null;
  if (!hasBoxProduction && !hasAdvancedProduction) return null;

  const metric = (key: PlayerBasicMetricKey) => playerBasicMetric(player, key);
  const usage = Math.max(0, advanced.overallUsage ?? 0) * 100;
  const ppa = Math.max(-20, Math.min(100, advanced.totalPpa ?? 0));
  let score = 0;
  if (position === "QB") {
    score = usage + ppa * .45 + metric("passAttempts") * .18 + metric("passYards") / 50
      + metric("passTd") * 3.4 - metric("interceptions") * 3.5
      + metric("rushYards") / 35 + metric("rushTd") * 2.3;
  } else if (position === "RB") {
    score = usage + ppa * .45 + metric("rushAttempts") * .33
      + metric("rushYards") / 19 + metric("receptions") * 1.0
      + metric("receivingYards") / 23
      + (metric("rushTd") + metric("receivingTd")) * 2.8
      + (metric("kickReturnYards") + metric("puntReturnYards")) / 60
      + (metric("kickReturnTd") + metric("puntReturnTd")) * 2;
  } else if (position === "WR" || position === "TE") {
    score = usage + ppa * .45 + metric("receptions") * 1.5
      + metric("receivingYards") / 15 + metric("receivingTd") * 3.2
      + (metric("kickReturnYards") + metric("puntReturnYards")) / 70
      + (metric("kickReturnTd") + metric("puntReturnTd")) * 2;
  } else if (position === "EDGE") {
    score = metric("tackles")*.35+metric("tfl")*3.2+metric("sacks")*5
      +metric("qbHurries")+metric("passesDefended")*1.2
      +metric("defensiveInterceptions")*4+metric("fumbleRecoveries")*3.5;
  } else if (position === "DL") {
    score = metric("tackles")*.48+metric("tfl")*3.4+metric("sacks")*4.6
      +metric("qbHurries")*.9+metric("passesDefended")
      +metric("defensiveInterceptions")*4+metric("fumbleRecoveries")*3.5;
  } else if (position === "LB") {
    score = metric("tackles")*.72+metric("tfl")*2.6+metric("sacks")*3.4
      +metric("qbHurries")*.5+metric("passesDefended")*1.8
      +metric("defensiveInterceptions")*5+metric("fumbleRecoveries")*3.5;
  } else if (position === "CB") {
    score = metric("tackles")*.3+metric("tfl")*1.2+metric("sacks")*1.5
      +metric("passesDefended")*4+metric("defensiveInterceptions")*7
      +metric("fumbleRecoveries")*3;
  } else if (position === "S") {
    score = metric("tackles")*.55+metric("tfl")*1.8+metric("sacks")*2
      +metric("passesDefended")*3+metric("defensiveInterceptions")*6
      +metric("fumbleRecoveries")*3.2;
  } else if (position === "K") {
    const made = metric("fieldGoalsMade");
    const attempts = metric("fieldGoalsAttempted");
    score = made * 4 + metric("extraPointsMade") * .35
      + (attempts > 0 ? (made / attempts) * 18 : 0);
  } else if (position === "P") {
    const punts = metric("punts");
    score = metric("puntYards") / 25 + punts * .35
      + (punts > 0 ? (metric("puntYards") / punts) * .8 : 0);
  } else {
    score = usage + ppa * .2;
  }
  return Number(clamp(score, 0, 999).toFixed(3));
}

function normalizedRange(value: number, minimum: number, maximum: number) {
  return clamp((value - minimum) / Math.max(0.0001, maximum - minimum), 0, 1);
}

export function playerBoxEfficiency(player: PlayerProfile) {
  const position = productionPosition(player);
  const metric = (key: PlayerBasicMetricKey) => playerBasicMetric(player, key);
  if (position === "QB") {
    const attempts = metric("passAttempts");
    if (attempts <= 0) return null;
    const yardsPerAttempt = metric("passYards") / attempts;
    const touchdownRate = metric("passTd") / attempts;
    const interceptionRate = metric("interceptions") / attempts;
    const completions = metric("passCompletions");
    const completionRate = completions > 0 ? completions / attempts : null;
    const weighted = [
      { value:normalizedRange(yardsPerAttempt,4,11.5),weight:.40 },
      { value:normalizedRange(touchdownRate,0,.105),weight:.22 },
      { value:1-normalizedRange(interceptionRate,0,.075),weight:.23 },
      ...(completionRate === null ? [] : [{ value:normalizedRange(completionRate,.45,.78),weight:.15 }]),
    ];
    const totalWeight=weighted.reduce((sum,row)=>sum+row.weight,0);
    return weighted.reduce((sum,row)=>sum+row.value*row.weight,0)/totalWeight;
  }
  if (position === "RB") {
    const rushAttempts=metric("rushAttempts");
    const receptions=metric("receptions");
    const touches = rushAttempts + receptions;
    if (touches <= 0) return null;
    const scrimmageYards = metric("rushYards") + metric("receivingYards");
    const scrimmageTd = metric("rushTd") + metric("receivingTd");
    const ypc=rushAttempts>0?metric("rushYards")/rushAttempts:0;
    return .55*normalizedRange(ypc,2.5,8)
      +.20*normalizedRange(scrimmageYards/touches,2.5,8.5)
      +.15*normalizedRange(scrimmageTd/touches,0,.085)
      +.10*normalizedRange(receptions/Math.max(1,touches),0,.35);
  }
  if (position === "WR" || position === "TE") {
    const receptions = metric("receptions");
    if (receptions <= 0) return null;
    return 0.75 * normalizedRange(metric("receivingYards") / receptions, 6, 20)
      + 0.25 * normalizedRange(metric("receivingTd") / receptions, 0, 0.15);
  }
  if (["EDGE", "DL", "LB", "CB", "S"].includes(position)) {
    const tackles = metric("tackles");
    const passesDefended = metric("passesDefended");
    const interceptions = metric("defensiveInterceptions");
    const disruption = metric("tfl") * 1.25 + metric("sacks") * 2.25
      + passesDefended * 1.1 + interceptions * 3.5
      + metric("qbHurries") * .5 + metric("fumbleRecoveries") * 2;
    if (tackles + disruption <= 0) return null;
    const tackleDenominator = position === "LB" || position === "S" ? 45 : 32;
    const tackleProduction = tackles / (tackles + tackleDenominator);
    const disruptionRate = normalizedRange(disruption / Math.max(1, tackles), 0, .55);
    const coverageProduction = normalizedRange(passesDefended + 3 * interceptions, 0, position === "CB" ? 12 : 16);
    if (position === "LB") return .55 * tackleProduction + .45 * disruptionRate;
    if (position === "EDGE" || position === "DL") return .30 * tackleProduction + .70 * disruptionRate;
    if (position === "CB") return .20 * tackleProduction + .80 * coverageProduction;
    return .45 * tackleProduction + .55 * coverageProduction;
  }
  if (position === "K") {
    const attempts = metric("fieldGoalsAttempted");
    return attempts > 0 ? clamp(metric("fieldGoalsMade") / attempts, 0, 1) : null;
  }
  if (position === "P") {
    const punts = metric("punts");
    return punts > 0 ? normalizedRange(metric("puntYards") / punts, 30, 50) : null;
  }
  return null;
}

function playerOpportunities(player: PlayerProfile) {
  const position = productionPosition(player);
  const metric = (key: PlayerBasicMetricKey) => playerBasicMetric(player, key);
  if (position === "QB") return metric("passAttempts");
  if (position === "RB") return metric("rushAttempts") + metric("receptions");
  if (position === "WR" || position === "TE") return metric("receptions");
  if (["EDGE", "DL", "LB", "CB", "S"].includes(position)) {
    return metric("tackles")
      + 2 * metric("passesDefended")
      + 4 * metric("defensiveInterceptions")
      + 2 * metric("tfl")
      + 2 * metric("sacks")
      + metric("qbHurries")
      + 3 * metric("fumbleRecoveries");
  }
  if (position === "K") return metric("fieldGoalsAttempted");
  if (position === "P") return metric("punts");
  return player.advanced.passingPlays + player.advanced.rushingPlays;
}

function playerSuccessRate(player: PlayerProfile) {
  const position = productionPosition(player);
  const advanced = player.advanced;
  if (position === "QB" || position === "WR" || position === "TE") {
    return advanced.passingSuccessRate;
  }
  if (position === "RB") return advanced.rushingSuccessRate;
  if (["EDGE", "DL", "LB", "CB", "S"].includes(position)) return null;
  const totalPlays = advanced.passingPlays + advanced.rushingPlays;
  if (!totalPlays) return advanced.passingSuccessRate ?? advanced.rushingSuccessRate;
  const successes =
    (advanced.passingSuccessRate ?? 0) * advanced.passingPlays
    + (advanced.rushingSuccessRate ?? 0) * advanced.rushingPlays;
  return successes / totalPlays;
}

function playerAveragePpa(player: PlayerProfile) {
  const position = productionPosition(player);
  if (position === "QB" || position === "WR" || position === "TE") {
    return player.advanced.passPpa ?? player.advanced.averagePpa;
  }
  if (position === "RB") return player.advanced.rushPpa ?? player.advanced.averagePpa;
  if (["EDGE", "DL", "LB", "CB", "S"].includes(position)) return null;
  return player.advanced.averagePpa;
}

export type ObservedPlayerRatingContext = {
  competitionQuality?: number;
  opponentRelativeProduction?: number;
  opponentUnitQuality?: number;
  supportQuality?: number;
  /** Opponent-adjusted team rushing output after clearing the line. */
  secondLevelQuality?: number;
  /** Opponent-adjusted team breakaway output in the open field. */
  openFieldQuality?: number;
};

function runningBackSpaceEfficiency(
  player: PlayerProfile,
  context: ObservedPlayerRatingContext,
) {
  const attempts=playerBasicMetric(player,"rushAttempts");
  if(attempts<=0)return null;
  const ypcQuality=normalizedRange(playerBasicMetric(player,"rushYards")/attempts,2.5,8);
  const parts=[
    {value:ypcQuality,weight:.60},
    ...(context.secondLevelQuality===undefined?[]:[{value:clamp(context.secondLevelQuality,0,1),weight:.24}]),
    ...(context.openFieldQuality===undefined?[]:[{value:clamp(context.openFieldQuality,0,1),weight:.16}]),
  ];
  const total=parts.reduce((sum,row)=>sum+row.weight,0);
  return parts.reduce((sum,row)=>sum+row.value*row.weight,0)/total;
}

export function observedPlayerProductionScore(
  player: PlayerProfile,
  context: number | ObservedPlayerRatingContext = 0.5,
) {
  // Recompute from the archived raw profile so rating-formula updates never
  // require another CFBD download or trust a stale stored component.
  const volumeScore = accumulatedPlayerProductionScore(player) ?? player.productionVolumeScore;
  if (volumeScore === null) return null;
  const ratingContext = typeof context === "number"
    ? { competitionQuality:context }
    : context;
  return playerRatingCompositeScore({
    position:productionPosition(player),
    volumeScore,
    averagePpa:playerAveragePpa(player),
    successRate:playerSuccessRate(player),
    boxEfficiency:playerBoxEfficiency(player),
    secondaryEfficiency:productionPosition(player)==="RB"
      ?runningBackSpaceEfficiency(player,ratingContext)
      :null,
    opportunities:playerOpportunities(player),
    passAttempts:playerBasicMetric(player, "passAttempts"),
    competitionQuality:ratingContext.competitionQuality ?? .5,
    opponentRelativeProduction:ratingContext.opponentRelativeProduction ?? .5,
    opponentUnitQuality:ratingContext.opponentUnitQuality ?? .5,
    usageRate:player.advanced.overallUsage,
    supportQuality:ratingContext.supportQuality ?? .5,
  });
}

function impactScore(player: Omit<PlayerProfile, "impactScore" | "starterConfidence" | "starterEvidence">) {
  const advanced = player.advanced;
  const usage = 100 * Math.max(0, advanced.overallUsage ?? 0);
  const ppa = Math.max(-20, Math.min(100, advanced.totalPpa ?? 0));
  const position = player.position;
  if (position === "QB") return usage + ppa * 0.35 + playerBasicMetric(player as PlayerProfile, "passAttempts") * 0.22 + playerBasicMetric(player as PlayerProfile, "passYards") / 55 + playerBasicMetric(player as PlayerProfile, "passTd") * 3 - playerBasicMetric(player as PlayerProfile, "interceptions") * 2;
  if (position === "RB" || position === "FB") return usage + ppa * 0.35 + playerBasicMetric(player as PlayerProfile, "rushAttempts") * 0.42 + playerBasicMetric(player as PlayerProfile, "rushYards") / 22 + playerBasicMetric(player as PlayerProfile, "receptions") * 0.8 + playerBasicMetric(player as PlayerProfile, "rushTd") * 2;
  if (position === "WR" || position === "TE") return usage + ppa * 0.35 + playerBasicMetric(player as PlayerProfile, "receptions") * 1.6 + playerBasicMetric(player as PlayerProfile, "receivingYards") / 17 + playerBasicMetric(player as PlayerProfile, "receivingTd") * 3;
  if (player.side === "defense") return playerBasicMetric(player as PlayerProfile, "tackles") * 0.7 + playerBasicMetric(player as PlayerProfile, "tfl") * 3 + playerBasicMetric(player as PlayerProfile, "sacks") * 4 + playerBasicMetric(player as PlayerProfile, "passesDefended") * 2 + playerBasicMetric(player as PlayerProfile, "defensiveInterceptions") * 6;
  if (isOffensiveLine(position)) return (player.weight ?? 270) / 18 + (player.year ?? 1) * 2 + (player.recruitingStars ?? 0);
  return usage + ppa * 0.2 + (player.year ?? 1);
}

function starterEvidence(profile: Omit<PlayerProfile, "impactScore" | "starterConfidence" | "starterEvidence">, score: number) {
  const plays = profile.advanced.passingPlays + profile.advanced.rushingPlays;
  const production = profile.stats.some((row) => row.numericValue !== null && row.numericValue > 0);
  if (plays >= 75 || score >= 90) return { confidence: "HIGH" as const, evidence: "Season volume + advanced efficiency" };
  if (plays >= 20 || production || profile.advanced.overallUsage !== null) return { confidence: "MEDIUM" as const, evidence: "Participation + production" };
  return { confidence: "ROSTER" as const, evidence: "Roster-position projection" };
}

function playerIdentity(row: JsonRecord) {
  const firstName = text(row, "firstName", "first_name");
  const lastName = text(row, "lastName", "last_name");
  const supplied = text(row, "player", "name", "athleteName", "athlete_name");
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || supplied || "Unknown player";
  return { firstName: firstName || displayName.split(/\s+/)[0] || "", lastName: lastName || displayName.split(/\s+/).slice(-1)[0] || displayName, displayName };
}

function stringArray(row: JsonRecord, ...keys: string[]) {
  const value = field(row, ...keys);
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value).split(/[,\s|]+/).map((entry) => entry.trim()).filter(Boolean);
}

function validStars(row: JsonRecord | undefined) {
  const rawStars = row ? number(row, "stars") : null;
  return rawStars !== null && rawStars >= 1 && rawStars <= 5 ? Math.round(rawStars) : null;
}

function recruitingProfile(
  row: JsonRecord | undefined,
  match: PlayerProfile["recruitingMatch"],
  transfer: JsonRecord | undefined,
  transferMatch: PlayerProfile["transferMatch"],
) {
  const highSchoolStars = validStars(row);
  const highSchoolRating = row ? number(row, "rating") : null;
  const transferStars = validStars(transfer);
  const transferRating = transfer ? number(transfer, "rating") : null;
  const hasTransferGrade = transferStars !== null || transferRating !== null;
  return {
    highSchoolStars,
    highSchoolRating,
    recruitingStars: hasTransferGrade ? transferStars : highSchoolStars,
    recruitingRating: hasTransferGrade ? transferRating : highSchoolRating,
    recruitingClassYear: row ? number(row, "year") : null,
    recruitingRank: row ? number(row, "ranking", "rank") : null,
    recruitingPosition: row ? canonicalPlayerPosition(text(row, "position")) : null,
    recruitingMatch: row ? match : null,
    transferStars,
    transferRating,
    transferSeason: transfer ? number(transfer, "season", "year") : null,
    transferOrigin: transfer ? text(transfer, "origin") || null : null,
    transferDestination: transfer ? text(transfer, "destination") || null : null,
    transferPosition: transfer ? canonicalPlayerPosition(text(transfer, "position")) : null,
    transferEligibility: transfer ? text(transfer, "eligibility") || null : null,
    transferMatch: transfer ? transferMatch : null,
    ratingSource: hasTransferGrade ? "TRANSFER" as const : highSchoolStars !== null || highSchoolRating !== null ? "HIGH SCHOOL" as const : "UNRATED" as const,
  };
}

const offensiveLinePositions = new Set(["OL", "OT", "OG", "C", "LT", "LG", "RG", "RT"]);
const offensiveLineRoles = ["LT", "LG", "C", "RG", "RT"] as const;
type OffensiveLineRole = typeof offensiveLineRoles[number];
const defaultOffenseStarterRoles = ["X", "SLOT", "LT", "LG", "C", "RG", "RT", "Y", "Z", "QB", "RB"] as const;
const defaultDefenseStarterRoles = ["CB", "S", "FS", "CB", "NB", "W", "M", "DE", "DT", "NT", "DE"] as const;

function isOffensiveLine(position: string) {
  return offensiveLinePositions.has(position);
}

const positionFamilies = {
  offensiveLine: new Set(["OL", "OT", "OG", "C", "LT", "LG", "RG", "RT"]),
  defensiveLine: new Set(["DL", "DE", "EDGE", "DT", "NT"]),
  linebacker: new Set(["LB", "ILB", "MLB", "OLB", "WLB", "SLB"]),
  secondary: new Set(["DB", "CB", "S", "FS", "SS", "NB", "STAR"]),
};

function sourcePositionFamily(position: string) {
  for (const [family, positions] of Object.entries(positionFamilies)) if (positions.has(position)) return family;
  return position;
}

function genericPosition(position: string) {
  return ["ATH", "OL", "DL", "LB", "DB", "S"].includes(position);
}

function resolveSourcePosition(player: PlayerProfile): PlayerProfile {
  const listed = canonicalPlayerPosition(player.listedPosition);
  const alternatives = [
    { position: canonicalPlayerPosition(player.transferPosition), source: "TRANSFER" as const },
    { position: canonicalPlayerPosition(player.recruitingPosition), source: "RECRUITING" as const },
  ].filter((row) =>
    row.position !== "ATH"
    && sourcePositionFamily(row.position) === sourcePositionFamily(listed),
  );
  const evidence = genericPosition(listed)
    ? alternatives.find((row) => !genericPosition(row.position))
    : undefined;
  const position = evidence?.position ?? listed;
  const positionSource: PlayerProfile["positionSource"] = evidence?.source ?? "ROSTER";
  const positionConfidence: PlayerProfile["positionConfidence"] = evidence
    ? "MEDIUM"
    : genericPosition(position) ? "LOW" : "HIGH";
  return {
    ...player,
    position,
    positionGroup: positionGroup(position),
    positionSource,
    positionConfidence,
    side: playerSide(position),
    projectedStarter: false,
    depthRole: null,
    publishedDepth: null,
  };
}

function lineRoleFamily(position: string | null | undefined) {
  if (position === "LT" || position === "RT" || position === "OT") return "T";
  if (position === "LG" || position === "RG" || position === "OG") return "G";
  if (position === "C") return "C";
  return "OL";
}

function lineRoleFit(player: PlayerProfile, role: OffensiveLineRole) {
  const listed = player.position;
  const roleFamily = lineRoleFamily(role);
  let fit = 0;

  if (listed === role) fit += 150;
  else if (lineRoleFamily(listed) === roleFamily && listed !== "OL") fit += 92;
  else if (listed === "OL") fit += 30;
  else fit -= 38;

  const evaluationFit = [player.transferPosition, player.recruitingPosition].reduce((best, evaluated) => {
    if (evaluated === role) return Math.max(best, 50);
    if (lineRoleFamily(evaluated) === roleFamily && evaluated !== "OL") return Math.max(best, 32);
    return best;
  }, 0);
  fit += evaluationFit;

  const height = player.height ?? 75;
  const weight = player.weight ?? 300;
  if (roleFamily === "T") {
    fit += clamp((height - 74) * 4, -8, 18);
    fit += clamp((weight - 285) / 10, -5, 6);
  } else if (roleFamily === "G") {
    fit += clamp(14 - Math.abs(height - 75) * 3, -5, 14);
    fit += clamp((weight - 292) / 8, -5, 8);
  } else {
    fit += clamp(15 - Math.abs(height - 74) * 4, -8, 15);
    fit += clamp((weight - 292) / 9, -5, 8);
  }
  return fit;
}

function lineStarterMerit(player: PlayerProfile) {
  const classYear = player.year ?? 1;
  const experience = [0, 0, 12, 22, 28, 32, 34][Math.min(6, Math.max(0, classYear))] ?? 0;
  const freshmanDevelopmentPenalty = classYear <= 1 ? 25 : 0;
  const rating = player.recruitingRating === null ? 0 : clamp((player.recruitingRating - 0.78) / 0.22, 0, 1) * 30;
  const recruiting = (player.recruitingStars ?? 0) * 2.4 + rating;
  const exactRole = offensiveLineRoles.includes(player.listedPosition as OffensiveLineRole) ? 14 : player.listedPosition !== "OL" ? 7 : 0;
  return experience + recruiting + exactRole + player.impactScore * 0.12 - freshmanDevelopmentPenalty;
}

function resolveOffensiveLine(players: PlayerProfile[]) {
  const line = players.filter((player) => isOffensiveLine(player.listedPosition));
  if (!line.length) return players;

  // CFBD rosters often collapse every lineman to "OL". Choose the five most
  // plausible first-team players before resolving slots so an older, lower-
  // graded reserve cannot take a role merely because the greedy slot pass saw
  // him first. Exact roster roles and transfer/recruiting evaluations remain
  // stronger evidence than body type.
  const projectedFive = [...line]
    .sort((left, right) => lineStarterMerit(right) - lineStarterMerit(left) || right.impactScore - left.impactScore)
    .slice(0, Math.min(5, line.length));

  // Five players create only 120 possible assignments. Exhaustively scoring
  // those combinations avoids the false role choices produced by a greedy
  // center-first pass while preserving one unique player at every line spot.
  const permutations = <T,>(items: T[]): T[][] => {
    if (items.length <= 1) return [items];
    return items.flatMap((item, index) =>
      permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [item, ...tail]),
    );
  };
  const starterByRole = new Map<OffensiveLineRole, PlayerProfile>();
  const used = new Set<string>();
  if (projectedFive.length === offensiveLineRoles.length) {
    const best = permutations(projectedFive).sort((left, right) => {
      const score = (assignment: PlayerProfile[]) => assignment.reduce((sum, player, index) => sum + lineRoleFit(player, offensiveLineRoles[index]), 0);
      return score(right) - score(left);
    })[0];
    offensiveLineRoles.forEach((role, index) => {
      starterByRole.set(role, best[index]);
      used.add(best[index].id);
    });
  } else {
    projectedFive.forEach((player, index) => {
      const role = offensiveLineRoles[index];
      starterByRole.set(role, player);
      used.add(player.id);
    });
  }

  const roleByPlayer = new Map<string, OffensiveLineRole>();
  for (const [role, player] of starterByRole) roleByPlayer.set(player.id, role);
  const depthCounts = new Map<OffensiveLineRole, number>(offensiveLineRoles.map((role) => [role, starterByRole.has(role) ? 1 : 0]));

  for (const player of line.filter((candidate) => !used.has(candidate.id)).sort((left, right) => right.impactScore - left.impactScore)) {
    const role = [...offensiveLineRoles].sort((left, right) => {
      const rightScore = lineRoleFit(player, right) - (depthCounts.get(right) ?? 0) * 22;
      const leftScore = lineRoleFit(player, left) - (depthCounts.get(left) ?? 0) * 22;
      return rightScore - leftScore;
    })[0];
    roleByPlayer.set(player.id, role);
    depthCounts.set(role, (depthCounts.get(role) ?? 0) + 1);
  }

  return players.map((player) => {
    const role = roleByPlayer.get(player.id);
    if (!role) return player;
    const listedExact = player.listedPosition === role;
    const resolvedExact = player.position === role;
    const listedFamily = lineRoleFamily(player.position) === lineRoleFamily(role) && player.position !== "OL";
    const transferredFamily = lineRoleFamily(player.transferPosition) === lineRoleFamily(role) && player.transferPosition !== "OL";
    const recruitedFamily = lineRoleFamily(player.recruitingPosition) === lineRoleFamily(role) && player.recruitingPosition !== "OL";
    const positionSource: PlayerProfile["positionSource"] = listedExact || (listedFamily && player.positionSource === "ROSTER")
      ? "ROSTER"
      : player.positionSource === "TRANSFER" || transferredFamily ? "TRANSFER"
        : player.positionSource === "RECRUITING" || recruitedFamily ? "RECRUITING"
          : "PHYSICAL PROFILE";
    const positionConfidence: PlayerProfile["positionConfidence"] = listedExact
      ? "HIGH"
      : resolvedExact ? "MEDIUM" : "LOW";
    const projectedStarter = starterByRole.get(role)?.id === player.id;
    const evidence = projectedStarter
      ? positionSource === "ROSTER"
        ? `${role} projection uses the published roster position, experience and line-specific fit`
        : positionSource === "TRANSFER"
          ? `${role} projection uses the transfer evaluation position, experience and line-specific fit`
        : positionSource === "RECRUITING"
          ? `${role} projection uses the linked recruiting position, experience and line-specific fit`
          : `${role} is an unverified model fit from a generic OL listing; it is not a published depth-chart position`
      : `${role} depth is ordered by position fit, experience and roster competition`;
    return {
      ...player,
      positionGroup: "OFFENSIVE LINE",
      positionSource,
      positionConfidence,
      projectedStarter,
      depthRole: role,
      publishedDepth: player.publishedDepth ?? null,
      starterConfidence: positionConfidence === "HIGH" ? "MEDIUM" : "ROSTER",
      starterEvidence: evidence,
    };
  });
}

const offensiveLineMetricDefinitions: Array<Pick<OffensiveLineUnitMetric, "key" | "label" | "format" | "note"> & { weight: number }> = [
  { key:"lineYards", label:"LINE YARDS", format:"yards", weight:.24, note:"Blocking-created rushing yards before the runner reaches the second level." },
  { key:"stuffRate", label:"STUFF ALLOWED", format:"rate", weight:.20, note:"Share of carries stopped at or behind the line. Lower raw output is better." },
  { key:"powerSuccess", label:"POWER SUCCESS", format:"rate", weight:.14, note:"Short-yardage conversion rate when the line must create one or two yards." },
  { key:"rushingSuccessRate", label:"RUSH SUCCESS", format:"rate", weight:.14, note:"Share of carries that keep the offense on schedule." },
  { key:"havocRate", label:"HAVOC ALLOWED", format:"rate", weight:.14, note:"Disruption allowed by the offense, including negative plays and pressure-related outcomes. Lower is better." },
  { key:"passingDownSuccessRate", label:"PASS-DOWN SURVIVAL", format:"rate", weight:.14, note:"Offensive success when the defense expects a pass; a protection-and-quarterback outcome proxy." },
];

export function buildOffensiveLineUnitProfile(advanced: AdvancedProfile | null | undefined): OffensiveLineUnitProfile {
  const metricIdentity = (definition: (typeof offensiveLineMetricDefinitions)[number]) => ({
    key:definition.key,
    label:definition.label,
    format:definition.format,
    note:definition.note,
  });
  if (!advanced) return { productionScore:null, grade:null, sampleGames:0, metrics:offensiveLineMetricDefinitions.map((definition) => ({ ...metricIdentity(definition), raw:null, index:null })) };
  const metrics = offensiveLineMetricDefinitions.map((definition) => {
    const metric=metricIdentity(definition);
    return {
      ...metric,
      raw:advanced.offense.raw[metric.key],
      index:advanced.offense.index[metric.key],
    };
  });
  const available = offensiveLineMetricDefinitions
    .map((definition, index) => ({ index:metrics[index].index, weight:definition.weight }))
    .filter((row): row is { index:number; weight:number } => row.index !== null && Number.isFinite(row.index));
  const totalWeight = available.reduce((sum, row) => sum + row.weight, 0);
  const composite = totalWeight
    ? available.reduce((sum, row) => sum + row.index * row.weight, 0) / totalWeight
    : null;
  return {
    productionScore:composite,
    // 1.00 is FBS average. The 0–100 translation keeps the card readable while
    // retaining the opponent-adjusted index beneath every component.
    grade:composite === null ? null : Math.round(clamp(50 + (composite - 1) * 100, 0, 100)),
    sampleGames:advanced.coverage.advancedGames,
    metrics,
  };
}

function resolveProjectedStarters(players: PlayerProfile[]) {
  const assignments = [
    ...selectFormationPlayers(players, "offense", defaultOffenseStarterRoles, false),
    ...selectFormationPlayers(players, "defense", defaultDefenseStarterRoles, false),
  ];
  const starterRoleById = new Map<string, string>();
  for (const assignment of assignments) {
    if (assignment) starterRoleById.set(assignment.id, assignment.role);
  }
  for (const specialist of players
    .filter((player) => player.side === "specialists")
    .sort((left, right) => right.impactScore - left.impactScore)
    .slice(0, 3)) {
    starterRoleById.set(specialist.id, specialist.position);
  }
  const athlete = players
    .filter((player) => player.side === "other")
    .sort((left, right) => right.impactScore - left.impactScore)[0];
  if (athlete) starterRoleById.set(athlete.id, athlete.position);

  return players.map((player) => {
    const starterRole = starterRoleById.get(player.id);
    return {
      ...player,
      projectedStarter: Boolean(starterRole),
      depthRole: player.depthRole ?? starterRole ?? null,
      publishedDepth: player.publishedDepth ?? null,
    };
  });
}

const depthGroupOrder = [
  { key: "QB", label: "QUARTERBACK", starterCount: 1 },
  { key: "BACKS", label: "RUNNING BACKS", starterCount: 1 },
  { key: "RECEIVERS", label: "RECEIVERS / TIGHT ENDS", starterCount: 4 },
  { key: "LT", label: "LEFT TACKLE (LT)", starterCount: 1 },
  { key: "LG", label: "LEFT GUARD (LG)", starterCount: 1 },
  { key: "C", label: "CENTER (C)", starterCount: 1 },
  { key: "RG", label: "RIGHT GUARD (RG)", starterCount: 1 },
  { key: "RT", label: "RIGHT TACKLE (RT)", starterCount: 1 },
  { key: "DEFENSIVE FRONT", label: "DEFENSIVE FRONT", starterCount: 4 },
  { key: "LINEBACKERS", label: "LINEBACKERS", starterCount: 2 },
  { key: "SECONDARY", label: "SECONDARY", starterCount: 5 },
  { key: "SPECIALISTS", label: "SPECIALISTS", starterCount: 3 },
  { key: "ATHLETES", label: "ATHLETES", starterCount: 0 },
] as const;

function buildPlayerDepthGroups(players: PlayerProfile[]) {
  return depthGroupOrder.map(({ key, label, starterCount }): PlayerDepthGroup | null => {
    const groupPlayers = players
      .filter((player) => offensiveLineRoles.includes(key as OffensiveLineRole)
        ? player.depthRole === key
        : player.positionGroup === key)
      .sort((left, right) =>
        Number(right.projectedStarter) - Number(left.projectedStarter)
        || (left.publishedDepth ?? 99) - (right.publishedDepth ?? 99)
        || right.impactScore - left.impactScore
        || (left.jersey ?? 999) - (right.jersey ?? 999),
      );
    if (!groupPlayers.length) return null;
    const publishedStarters = groupPlayers.filter((player) => player.projectedStarter).length;
    return {
      key,
      label,
      side: groupPlayers[0].side,
      starterCount: publishedStarters || Math.min(starterCount, groupPlayers.length),
      players: groupPlayers,
    };
  }).filter((group): group is PlayerDepthGroup => Boolean(group));
}

function applyPublishedDepthChart(players: PlayerProfile[], chart: PublishedDepthChart) {
  const available = players.map(resolveSourcePosition);
  const assignments = new Map<string, (typeof chart.entries)[number]>();
  for (const published of chart.entries) {
    const exactName = normalized(published.player);
    const sameSide = available.filter((player) => player.side === published.side);
    const byName = sameSide.find((player) =>
      !assignments.has(player.id)
      && normalized(player.displayName) === exactName,
    );
    const byJerseyAndLastName = sameSide.find((player) =>
      !assignments.has(player.id)
      && published.jersey !== null
      && player.jersey === published.jersey
      && (
        normalized(player.lastName) === normalized(published.player.split(/\s+/).slice(-1)[0])
        || normalized(player.displayName).endsWith(normalized(published.player.split(/\s+/).slice(-1)[0]))
      ),
    );
    const match = byName ?? byJerseyAndLastName;
    if (match) assignments.set(match.id, published);
  }

  const resolved = available.map((player) => {
    const published = assignments.get(player.id);
    if (!published) return player;
    const position = canonicalPlayerPosition(published.position);
    return {
      ...player,
      position,
      positionGroup: positionGroup(position),
      positionSource: "PUBLISHED" as const,
      positionConfidence: "HIGH" as const,
      side: published.side,
      projectedStarter: published.depth === 1,
      depthRole: published.role,
      publishedDepth: published.depth,
      starterConfidence: "PUBLISHED" as const,
      starterEvidence: `${chart.label} · ${published.role} · depth ${published.depth}`,
    };
  });
  return { players: resolved, matchedPlayers: assignments.size };
}

function impactPlayerIds(players: PlayerProfile[], side: PlayerProfile["side"], count: number) {
  return players
    .filter((player) => player.side === side)
    .sort((left, right) => right.impactScore - left.impactScore)
    .slice(0, count)
    .map((player) => player.id);
}

export function repairTeamPlayerModelDepth(model: TeamPlayerModel, archivedChart?: PublishedDepthChart | null): TeamPlayerModel {
  const chart = archivedChart === undefined
    ? getPublishedDepthChart(model.season, model.team)
    : archivedChart;
  const sourceAware = model.players.map(resolveSourcePosition);
  const lineResolved = resolveOffensiveLine(sourceAware);
  const published = chart ? applyPublishedDepthChart(lineResolved, chart) : null;
  const players = (published?.players ?? resolveProjectedStarters(lineResolved))
    .sort((left, right) =>
      left.side.localeCompare(right.side)
      || left.positionGroup.localeCompare(right.positionGroup)
      || Number(right.projectedStarter) - Number(left.projectedStarter)
      || (left.publishedDepth ?? 99) - (right.publishedDepth ?? 99)
      || right.impactScore - left.impactScore
      || (left.jersey ?? 999) - (right.jersey ?? 999),
    );
  const depthSource: NonNullable<TeamPlayerModel["depthSource"]> = chart
    ? {
      kind: "OFFICIAL_TEAM_NOTES",
      label: chart.label,
      publishedAt: chart.publishedAt,
      sourceUrl: chart.sourceUrl,
      matchedPlayers: published?.matchedPlayers ?? 0,
      listedPlayers: chart.entries.length,
    }
    : {
      kind: "MODEL_PROJECTION",
      label: "Source-aware roster projection",
      publishedAt: null,
      sourceUrl: null,
      matchedPlayers: 0,
      listedPlayers: 0,
    };
  const ratingNote = `Player grades are scarcity-calibrated 50–99 same-position overalls on one 2014–${INITIAL_PLAYER_SEASON} scale: 46% proven production load, 27% output versus opponent allowance and opposing-unit quality, and 27% proven efficiency. An additional nonlinear workhorse test recognizes truly exceptional full-season loads. Small samples are suppressed before efficiency can separate comparable workloads. Only the top 4% reach 90, the top 1% reach 95, and the top 0.1% reach 99. Quarterbacks must prove passing volume because rushing attempts cannot substitute for pass attempts, and the depth source does not alter the grade.`;
  return {
    ...model,
    starterMethod: chart ? "PUBLISHED" : "SOURCE-AWARE-PROJECTION",
    depthSource,
    sourceNote: chart
      ? `Positions and depth come from ${chart.label}, published ${chart.publishedAt}. ${ratingNote}`
      : `No published team depth chart is stored for this team-season. The fallback uses roster, transfer and recruiting position families and will not cross a running back into fullback, a safety into corner, an edge into inside linebacker, or a defensive end into nose tackle. Exact left/right line slots remain projections. ${ratingNote}`,
    players,
    depthChart: buildPlayerDepthGroups(players),
    impactPlayers: {
      offense: impactPlayerIds(players, "offense", 8),
      defense: impactPlayerIds(players, "defense", 8),
      specialists: impactPlayerIds(players, "specialists", 3),
    },
  };
}

export function buildTeamPlayerModel(
  season: number,
  team: string,
  rosterPayload: unknown,
  statPayload: unknown,
  successPayload: unknown,
  usagePayload: unknown,
  ppaPayload: unknown,
  recruitingPayload: unknown = [],
  transferPayload: unknown = [],
): TeamPlayerModel {
  const roster = records(rosterPayload);
  const stats = records(statPayload);
  const success = records(successPayload);
  const usage = records(usagePayload);
  const ppa = records(ppaPayload);
  const recruits = records(recruitingPayload);
  const transfers = records(transferPayload);
  const byId = new Map<string, PlayerProfile>();
  const byName = new Map<string, PlayerProfile>();
  const recruitById = new Map(recruits.map((row) => [text(row, "id"), row]).filter(([id]) => Boolean(id)));
  const recruitByRosterId = new Map(recruits.map((row) => [text(row, "_rosterPlayerId"), row]).filter(([id]) => Boolean(id)));
  const recruitByName = new Map<string, JsonRecord>();
  for (const row of recruits) {
    const key = normalized(text(row, "name", "player"));
    if (key && !recruitByName.has(key)) recruitByName.set(key, row);
  }
  const sortedTransfers = [...transfers].sort((left, right) => (number(left, "season", "year") ?? 0) - (number(right, "season", "year") ?? 0));
  const transferByRosterId = new Map(sortedTransfers.map((row) => [text(row, "_rosterPlayerId"), row]).filter(([id]) => Boolean(id)));
  const transferByName = new Map<string, JsonRecord>();
  for (const row of [...sortedTransfers].reverse()) {
    const key = normalized([text(row, "firstName", "first_name"), text(row, "lastName", "last_name")].filter(Boolean).join(" ") || text(row, "name", "player"));
    if (key && !transferByName.has(key)) transferByName.set(key, row);
  }

  for (const row of roster) {
    const identity = playerIdentity(row);
    const id = text(row, "id", "playerId", "player_id") || `${normalized(team)}-${normalized(identity.displayName)}`;
    const listedPosition = canonicalPlayerPosition(text(row, "position"));
    const recruitIds = stringArray(row, "recruitIds", "recruit_ids");
    const recruit = recruitByRosterId.get(id)
      ?? recruitIds.map((recruitId) => recruitById.get(recruitId)).find(Boolean)
      ?? recruitByName.get(normalized(identity.displayName));
    const recruitMatch = recruit
      ? text(recruit, "_matchConfidence").toUpperCase() === "NAME" ? "NAME" : "ID"
      : null;
    const transfer = transferByRosterId.get(id) ?? transferByName.get(normalized(identity.displayName));
    const recruiting = recruitingProfile(recruit, recruitMatch, transfer, transfer ? "NAME+DESTINATION" : null);
    const partial = {
      id,
      ...identity,
      team,
      jersey: number(row, "jersey", "number"),
      listedPosition,
      position: listedPosition,
      positionGroup: positionGroup(listedPosition),
      positionSource: "ROSTER" as const,
      positionConfidence: listedPosition === "OL" ? "LOW" as const : "HIGH" as const,
      side: playerSide(listedPosition),
      height: number(row, "height"),
      weight: number(row, "weight"),
      year: number(row, "year"),
      recruitIds,
      ...recruiting,
      stats: [] as PlayerStatLine[],
      advanced: emptyAdvanced(),
      projectedStarter: false,
      depthRole: null,
      publishedDepth: null,
    };
    const score = impactScore(partial);
    const evidence = starterEvidence(partial, score);
    const profile: PlayerProfile = { ...partial, impactScore: score, starterConfidence: evidence.confidence, starterEvidence: evidence.evidence };
    byId.set(id, profile);
    byName.set(nameKey(team, identity.displayName), profile);
  }

  const resolve = (row: JsonRecord) => {
    const identity = playerIdentity(row);
    const id = text(row, "playerId", "player_id", "id", "athleteId", "athlete_id");
    const existing = (id ? byId.get(id) : undefined) ?? byName.get(nameKey(team, identity.displayName));
    if (existing) return existing;
    const position = canonicalPlayerPosition(text(row, "position"));
    const generatedId = id || `${normalized(team)}-${normalized(identity.displayName)}`;
    const partial = {
      id: generatedId,
      ...identity,
      team,
      jersey: null,
      listedPosition: position,
      position,
      positionGroup: positionGroup(position),
      positionSource: "ROSTER" as const,
      positionConfidence: position === "ATH" || position === "OL" ? "LOW" as const : "MEDIUM" as const,
      side: playerSide(position),
      height: null,
      weight: null,
      year: null,
      recruitIds: [] as string[],
      ...recruitingProfile(
        recruitByName.get(normalized(identity.displayName)),
        recruitByName.has(normalized(identity.displayName)) ? "NAME" : null,
        transferByName.get(normalized(identity.displayName)),
        transferByName.has(normalized(identity.displayName)) ? "NAME+DESTINATION" : null,
      ),
      stats: [] as PlayerStatLine[],
      advanced: emptyAdvanced(),
      projectedStarter: false,
      depthRole: null,
      publishedDepth: null,
    };
    const score = impactScore(partial);
    const evidence = starterEvidence(partial, score);
    const profile: PlayerProfile = { ...partial, impactScore: score, starterConfidence: evidence.confidence, starterEvidence: evidence.evidence };
    byId.set(generatedId, profile);
    byName.set(nameKey(team, identity.displayName), profile);
    return profile;
  };

  for (const row of stats) {
    const player = resolve(row);
    const rawValue = text(row, "stat", "value");
    const numericValue = rawValue === "" ? null : Number(rawValue.replace(/,/g, ""));
    player.stats.push({
      category: text(row, "category") || "Other",
      label: text(row, "statType", "stat_type", "name") || "Stat",
      value: rawValue || "—",
      numericValue: Number.isFinite(numericValue) ? numericValue : null,
    });
  }

  for (const row of success) {
    const player = resolve(row);
    const passing = field(row, "passing") as JsonRecord | undefined;
    const rushing = field(row, "rushing") as JsonRecord | undefined;
    if (passing) {
      player.advanced.passingSuccessRate = number(passing, "successRate", "success_rate");
      player.advanced.passingPlays = number(passing, "plays") ?? 0;
    }
    if (rushing) {
      player.advanced.rushingSuccessRate = number(rushing, "successRate", "success_rate");
      player.advanced.rushingPlays = number(rushing, "plays") ?? 0;
    }
  }

  for (const row of usage) {
    const player = resolve(row);
    const values = field(row, "usage") as JsonRecord | undefined;
    if (!values) continue;
    player.advanced.overallUsage = number(values, "overall");
    player.advanced.passUsage = number(values, "pass");
    player.advanced.rushUsage = number(values, "rush");
  }

  for (const row of ppa) {
    const player = resolve(row);
    const average = field(row, "averagePPA", "average_ppa") as JsonRecord | undefined;
    const total = field(row, "totalPPA", "total_ppa") as JsonRecord | undefined;
    if (average) {
      player.advanced.averagePpa = number(average, "all");
      player.advanced.passPpa = number(average, "pass");
      player.advanced.rushPpa = number(average, "rush");
    }
    if (total) player.advanced.totalPpa = number(total, "all");
  }

  const scoredPlayers = [...byId.values()].map((player) => {
    const score = impactScore(player);
    const evidence = starterEvidence(player, score);
    const productionVolumeScore = accumulatedPlayerProductionScore(player);
    const productionScore = observedPlayerProductionScore({
      ...player,
      productionVolumeScore,
    });
    return {
      ...player,
      stats: [...player.stats].sort((left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label)),
      impactScore: Number(clamp(score, 0, 999).toFixed(2)),
      productionVolumeScore,
      productionScore,
      productionRating: null,
      productionRatingSource: productionScore === null ? "UNAVAILABLE" as const : "OBSERVED" as const,
      productionRatingEvidence: productionScore === null
        ? "No published season production sample"
        : "Observed season production; historical percentile pending",
      starterConfidence: evidence.confidence,
      starterEvidence: evidence.evidence,
    };
  });
  return repairTeamPlayerModelDepth({
    season,
    team,
    source: "CollegeFootballData",
    starterMethod: "MODEL-PROJECTED",
    sourceNote: `Player grades are scarcity-calibrated 50–99 same-position overalls on one 2014–${INITIAL_PLAYER_SEASON} scale: 46% proven production load, 27% output versus opponent allowance and opposing-unit quality, and 27% proven efficiency. An additional nonlinear workhorse test recognizes truly exceptional full-season loads. Small samples are suppressed before efficiency can separate comparable workloads. Only the top 4% reach 90, the top 1% reach 95, and the top 0.1% reach 99. Quarterbacks must prove passing volume; rush attempts cannot substitute for pass attempts. A player without published production receives a clearly labeled projection from historical players at the same position with a comparable high-school or transfer evaluation. Offensive linemen share one team-unit grade built from blocking and protection output versus the fronts faced because CFBD does not publish individual blocking production.`,
    players: scoredPlayers,
    depthChart: [],
    impactPlayers: {
      offense: [],
      defense: [],
      specialists: [],
    },
  });
}

function rolePositions(role: string, side: "offense" | "defense") {
  if (side === "offense") {
    if (role === "QB") return ["QB"];
    if (["RB", "TB", "B", "LA", "RA"].includes(role)) return ["RB"];
    if (["FB", "F"].includes(role)) return ["FB"];
    if (["X", "SLOT", "V", "W", "Z"].includes(role)) return ["WR"];
    if (["H", "Y", "TE"].includes(role)) return ["TE"];
    if (role === "C") return ["C", "OG", "OL"];
    if (role === "LT" || role === "RT") return [role, "OT", "OL"];
    if (role === "LG" || role === "RG") return [role, "OG", "OL"];
    return ["ATH"];
  }
  if (role === "CB") return ["CB"];
  if (role === "NB") return ["NB", "STAR", "CB"];
  if (role === "FS") return ["FS", "S", "DB"];
  if (role === "S" || role === "SS") return ["SS", "S", "DB"];
  if (["W", "M"].includes(role)) return ["WLB", "MLB", "ILB", "LB"];
  if (role === "DE") return ["DE", "EDGE", "OLB", "DL"];
  if (role === "DT") return ["DT", "DL"];
  if (role === "NT") return ["NT", "DL"];
  return ["ATH"];
}

function roleDepthAliases(role: string, side: "offense" | "defense") {
  const offenseAliases: Record<string, string[]> = {
    X: ["X"],
    SLOT: ["SLOT", "WR-H"],
    V: ["V", "SLOT", "WR-H"],
    W: ["W", "SLOT", "WR-H"],
    Z: ["Z"],
    H: ["H", "TE-H"],
    Y: ["Y", "TE", "TE-Y"],
    QB: ["QB"],
    RB: ["RB", "TB"],
    FB: ["FB"],
    LT: ["LT"],
    LG: ["LG"],
    C: ["C"],
    RG: ["RG"],
    RT: ["RT"],
  };
  const defenseAliases: Record<string, string[]> = {
    CB: ["CB"],
    S: ["SS", "S"],
    SS: ["SS", "S"],
    FS: ["FS"],
    NB: ["HUSKY", "STAR", "NB", "NICKEL"],
    W: ["WILL", "STINGER", "WLB"],
    M: ["MIKE", "MLB"],
    DE: ["DE", "BANDIT", "WOLF", "JACK", "EDGE"],
    DT: ["DT"],
    NT: ["NT", "NG"],
  };
  return (side === "offense" ? offenseAliases : defenseAliases)[role] ?? [role];
}

function selectFormationPlayers(players: readonly PlayerProfile[], side: "offense" | "defense", roles: readonly string[], allowArbitraryFallback = true) {
  const used = new Set<string>();
  const sidePlayers = players
    .filter((player) => player.side === side)
    .sort((left, right) => Number(right.projectedStarter) - Number(left.projectedStarter) || right.impactScore - left.impactScore);
  return roles.map((role): FormationPlayer | null => {
    const preferences = rolePositions(role, side);
    const aliases = roleDepthAliases(role, side);
    let selected = sidePlayers.find((player) =>
      !used.has(player.id)
      && player.projectedStarter
      && player.depthRole !== null
      && aliases.includes(player.depthRole),
    );
    selected ??= sidePlayers.find((player) =>
      !used.has(player.id)
      && player.depthRole !== null
      && aliases.includes(player.depthRole),
    );
    for (const position of preferences) {
      if (selected) break;
      selected = sidePlayers.find((player) =>
        !used.has(player.id)
        && player.position === position
        && (!offensiveLineRoles.includes(role as OffensiveLineRole) || player.depthRole === role || player.position === role),
      );
      selected ??= sidePlayers.find((player) => !used.has(player.id) && player.position === position);
      if (selected) break;
    }
    const requestedGroup = offensiveLineRoles.includes(role as OffensiveLineRole) ? "OFFENSIVE LINE" : null;
    selected ??= requestedGroup ? sidePlayers.find((player) =>
      !used.has(player.id)
      && player.positionGroup === requestedGroup
      && player.depthRole === role,
    ) : undefined;
    if (allowArbitraryFallback) selected ??= sidePlayers.find((player) => !used.has(player.id));
    if (!selected) return null;
    used.add(selected.id);
    return {
      id: selected.id,
      role,
      jersey: selected.jersey,
      lastName: selected.lastName,
      position: selected.position,
      confidence: selected.starterConfidence,
      profile: selected,
    };
  });
}

export function assignFormationPlayers(model: TeamPlayerModel | null | undefined, side: "offense" | "defense", roles: readonly string[]) {
  return model ? selectFormationPlayers(model.players, side, roles, false) : roles.map(() => null);
}

export function matchupPersonnel(model: TeamPlayerModel | null | undefined, zone: "deep" | "quick" | "interior" | "edge", side: "offense" | "defense", count = 2) {
  if (!model) return [];
  const priorities = side === "offense"
    ? zone === "deep" || zone === "quick" ? ["QB", "WR", "TE"] : ["RB", "FB", "OT", "OG", "C", "QB"]
    : zone === "deep" || zone === "quick" ? ["CB", "S", "DB", "EDGE", "DE", "LB"] : ["DT", "NT", "DE", "EDGE", "LB", "S"];
  const pool = model.players.filter((player) => player.side === side);
  return [...pool].sort((left, right) => {
    const leftPriority = priorities.indexOf(left.position);
    const rightPriority = priorities.indexOf(right.position);
    const leftOrder = leftPriority === -1 ? priorities.length : leftPriority;
    const rightOrder = rightPriority === -1 ? priorities.length : rightPriority;
    return leftOrder - rightOrder || right.impactScore - left.impactScore;
  }).slice(0, count);
}

export function playerDisplayLabel(player: Pick<PlayerProfile, "jersey" | "lastName" | "position">) {
  return `${player.jersey === null ? "" : `#${player.jersey} `}${player.lastName}${player.position ? ` (${player.position})` : ""}`.trim();
}

export function playerRecruitingLabel(player: { recruitingStars: number | null; ratingSource?: PlayerProfile["ratingSource"] } | null | undefined) {
  const stars = player?.recruitingStars;
  return typeof stars === "number" && stars >= 1 && stars <= 5 ? `${player?.ratingSource === "TRANSFER" ? "T" : ""}${Math.round(stars)}★` : "NR";
}

export function playerRatingSourceLabel(player: { ratingSource?: PlayerProfile["ratingSource"]; transferSeason?: number | null; transferOrigin?: string | null; recruitingStars?: number | null }) {
  if (player.ratingSource === "TRANSFER") return `TRANSFER GRADE${player.transferSeason ? ` · ${player.transferSeason}` : ""}${player.transferOrigin ? ` · FROM ${player.transferOrigin}` : ""}`;
  if (player.ratingSource === "HIGH SCHOOL" || player.recruitingStars) return "HIGH-SCHOOL RECRUITING GRADE";
  return "NO PUBLISHED RECRUITING GRADE";
}

export function playerHeadlineStats(player: PlayerProfile) {
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: number, suffix = "") => {
    if (value > 0) rows.push({ label, value: `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}${suffix}` });
  };
  if (player.position === "QB") {
    add("PASS YDS", playerBasicMetric(player, "passYards"));
    add("PASS TD", playerBasicMetric(player, "passTd"));
  } else if (player.position === "RB" || player.position === "FB") {
    add("RUSH YDS", playerBasicMetric(player, "rushYards"));
    add("RUSH TD", playerBasicMetric(player, "rushTd"));
  } else if (player.position === "WR" || player.position === "TE") {
    add("REC", playerBasicMetric(player, "receptions"));
    add("REC YDS", playerBasicMetric(player, "receivingYards"));
  } else if (["EDGE","DE","DL","DT","NT"].includes(player.position)) {
    add("TFL", playerBasicMetric(player, "tfl"));
    add("SACKS", playerBasicMetric(player, "sacks"));
  } else if (["LB","ILB","MLB","WLB","SLB","OLB"].includes(player.position)) {
    add("TACKLES", playerBasicMetric(player, "tackles"));
    add("TFL", playerBasicMetric(player, "tfl"));
  } else if (["CB","S","FS","SS","DB","NB","STAR"].includes(player.position)) {
    add("PD", playerBasicMetric(player, "passesDefended"));
    add("INT", playerBasicMetric(player, "defensiveInterceptions"));
  } else if (player.position === "K") {
    const made = playerBasicMetric(player,"fieldGoalsMade");
    const attempts = playerBasicMetric(player,"fieldGoalsAttempted");
    add("FG",made);
    if (attempts > 0) rows.push({ label:"FG %",value:`${(100 * made / attempts).toFixed(0)}%` });
  } else if (player.position === "P") {
    const punts = playerBasicMetric(player,"punts");
    const yards = playerBasicMetric(player,"puntYards");
    add("PUNTS",punts);
    if (punts > 0) rows.push({ label:"PUNT AVG",value:(yards / punts).toFixed(1) });
  } else if (player.side === "defense") {
    add("TACKLES", playerBasicMetric(player, "tackles"));
  }
  if (player.advanced.averagePpa !== null) rows.push({ label: "PPA / PLAY", value: player.advanced.averagePpa.toFixed(2) });
  if (player.advanced.overallUsage !== null) rows.push({ label: "USAGE", value: `${(player.advanced.overallUsage * 100).toFixed(0)}%` });
  return rows.slice(0, 4);
}
