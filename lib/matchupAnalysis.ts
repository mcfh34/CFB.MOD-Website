import { baselines, modelCalibration } from "../app/modelData";
import type { AdvancedMetricKey, AdvancedProfile, AdvancedSideProjection } from "./advancedMetrics";
import { buildMatchupIntelligence, type MatchupIntelligence } from "./matchupIntelligence";
import type { OffensiveViability } from "./offensiveViability";
import type { PossessionScoreReceipt } from "./scoringModel";

export type EdgeStrength = "even" | "slight" | "clear" | "strong";

export type UnitEdge = {
  unit: "pass" | "run" | "defense";
  homeValue: number;
  awayValue: number;
  edgeTeam: string | null;
  edgeValue: number;
  strength: EdgeStrength;
  detail: string;
};

export type PositionGroupEdge = {
  id: "trenches" | "run-space" | "quarterback" | "receivers" | "down-leverage";
  label: string;
  matchup: string;
  homeScore: number;
  awayScore: number;
  edgeTeam: string | null;
  strength: EdgeStrength;
  homeDetail: string;
  awayDetail: string;
  detail: string;
};

export type MatchupEdgeAnalysis = {
  favorite: string;
  underdog: string;
  projectedMargin: number;
  confidence: Exclude<EdgeStrength, "even">;
  headline: string;
  summary: string;
  pass: UnitEdge;
  run: UnitEdge;
  defense: UnitEdge;
  positionGroups: PositionGroupEdge[];
  schematicReads: PassingSchemeRead[];
  factors: string[];
  intelligence: MatchupIntelligence | null;
};

export type PassingSchemeRead = {
  offenseTeam: string;
  defenseTeam: string;
  offenseStyle: "EARLY-DOWN SHOTS" | "BOOM-OR-BUST DEEP BALL" | "EFFICIENT DOWNFIELD ATTACK" | "QUICK PASSING GAME" | "BALANCED";
  defenseStyle: "LIMITS DEEP BALL" | "TAKES AWAY EASY THROWS" | "WINS PASSING DOWNS" | "GIVES UP DEEP SHOTS" | "BALANCED";
  edgeTeam: string | null;
  strength: EdgeStrength;
  headline: string;
  detail: string;
  projectedCompletionRate: number | null;
  projectedYardsPerCompletion: number | null;
  projectedYpa: number;
};

type IndexTuple = readonly number[];
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, values.length);
const rounded = (value: number, digits = 1) => value.toFixed(digits);

function strength(value: number, slight: number, clear: number, strong: number): EdgeStrength {
  const magnitude = Math.abs(value);
  if (magnitude < slight) return "even";
  if (magnitude < clear) return "slight";
  if (magnitude < strong) return "clear";
  return "strong";
}

function unitEdge(unit: "pass" | "run", homeTeam: string, awayTeam: string, homeValue: number, awayValue: number): UnitEdge {
  const difference = homeValue - awayValue;
  const unitStrength = unit === "pass" ? strength(difference, 0.25, 0.75, 1.4) : strength(difference, 0.15, 0.4, 0.8);
  const edgeTeam = unitStrength === "even" ? null : difference > 0 ? homeTeam : awayTeam;
  const label = unit === "pass" ? "yards per pass" : "yards per rush";
  return {
    unit, homeValue, awayValue, edgeTeam, edgeValue: Math.abs(difference), strength: unitStrength,
    detail: edgeTeam
      ? `${edgeTeam} has a ${unitStrength} ${unit}-game edge (${rounded(edgeTeam === homeTeam ? homeValue : awayValue)} vs ${rounded(edgeTeam === homeTeam ? awayValue : homeValue)} projected ${label}).`
      : `The ${unit} matchup is essentially even (${rounded(homeValue)} vs ${rounded(awayValue)} projected ${label}).`,
  };
}

function defenseEdge(homeTeam: string, awayTeam: string, homeDefense: IndexTuple, awayDefense: IndexTuple): UnitEdge {
  const homeValue = average(homeDefense.slice(0, 3)) * 100;
  const awayValue = average(awayDefense.slice(0, 3)) * 100;
  const difference = awayValue - homeValue;
  const unitStrength = strength(difference, 2.5, 6, 11);
  const edgeTeam = unitStrength === "even" ? null : difference > 0 ? homeTeam : awayTeam;
  return {
    unit: "defense", homeValue, awayValue, edgeTeam, edgeValue: Math.abs(difference), strength: unitStrength,
    detail: edgeTeam
      ? `${edgeTeam} has the ${unitStrength} defensive edge because it gives up less per snap against comparable competition.`
      : `Neither defense has a clear overall advantage in the way it limits opposing offenses.`,
  };
}

function profileIndex(profile: AdvancedProfile | null | undefined, side: "offense" | "defense", key: AdvancedMetricKey) {
  const value = profile?.[side].index[key];
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

function geometric(values: number[]) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / Math.max(1, values.length));
}

function passingSchemeRead(
  offenseTeam: string,
  defenseTeam: string,
  offenseProfile: AdvancedProfile | null | undefined,
  defenseProfile: AdvancedProfile | null | undefined,
  projection: AdvancedSideProjection | null | undefined,
): PassingSchemeRead | null {
  if (!projection || !offenseProfile || !defenseProfile) return null;
  const offenseDepth = geometric([profileIndex(offenseProfile, "offense", "yardsPerCompletion"), profileIndex(offenseProfile, "offense", "passingExplosiveness")]);
  const offenseEfficiency = geometric([profileIndex(offenseProfile, "offense", "completionRate"), profileIndex(offenseProfile, "offense", "passingSuccessRate"), profileIndex(offenseProfile, "offense", "passingPpa")]);
  const offenseStandardShots = geometric([profileIndex(offenseProfile, "offense", "standardDownExplosiveness"), profileIndex(offenseProfile, "offense", "standardDownPpa")]);
  const defenseDepthAllowed = geometric([profileIndex(defenseProfile, "defense", "yardsPerCompletion"), profileIndex(defenseProfile, "defense", "passingExplosiveness")]);
  const defenseEfficiencyAllowed = geometric([profileIndex(defenseProfile, "defense", "completionRate"), profileIndex(defenseProfile, "defense", "passingSuccessRate"), profileIndex(defenseProfile, "defense", "passingPpa")]);
  const defensePassingDownAllowed = geometric([profileIndex(defenseProfile, "defense", "passingDownSuccessRate"), profileIndex(defenseProfile, "defense", "passingDownPpa")]);
  const offenseStyle: PassingSchemeRead["offenseStyle"] = offenseStandardShots >= 1.07 && offenseDepth >= 1.03
    ? "EARLY-DOWN SHOTS"
    : offenseDepth >= 1.05 ? offenseEfficiency < 0.99 ? "BOOM-OR-BUST DEEP BALL" : "EFFICIENT DOWNFIELD ATTACK"
      : offenseEfficiency >= 1.04 && offenseDepth < 0.99 ? "QUICK PASSING GAME" : "BALANCED";
  const defenseStyle: PassingSchemeRead["defenseStyle"] = defensePassingDownAllowed <= 0.94
    ? "WINS PASSING DOWNS"
    : defenseDepthAllowed <= 0.95 ? "LIMITS DEEP BALL"
      : defenseEfficiencyAllowed <= 0.95 ? "TAKES AWAY EASY THROWS"
        : defenseDepthAllowed >= 1.06 ? "GIVES UP DEEP SHOTS" : "BALANCED";
  const completion = projection.pass.completionRate;
  const yardsPerCompletion = projection.pass.yardsPerCompletion;
  const projectedLine = [
    completion === null ? null : `${(completion * 100).toFixed(1)}% completions`,
    yardsPerCompletion === null ? null : `${yardsPerCompletion.toFixed(1)} yards per completion`,
    `${projection.pass.adjustedYpa.toFixed(2)} yards per attempt`,
  ].filter(Boolean).join(" · ");

  let edgeTeam: string | null = null;
  let readStrength: EdgeStrength = "even";
  let headline = "No clear passing-game mismatch";
  let reason = `${offenseTeam} and ${defenseTeam} are closely matched in the areas that shape the passing game.`;
  if ((offenseStyle === "BOOM-OR-BUST DEEP BALL" || offenseStyle === "EARLY-DOWN SHOTS") && (defenseStyle === "LIMITS DEEP BALL" || defenseStyle === "WINS PASSING DOWNS")) {
    edgeTeam = defenseTeam; readStrength = "strong"; headline = `${defenseTeam} can take away the throws ${offenseTeam} wants`;
    reason = offenseStyle === "EARLY-DOWN SHOTS"
      ? `${offenseTeam} creates its best pass plays before the defense expects a throw, but ${defenseTeam} limits deep completions and gets off the field on passing downs.`
      : `${offenseTeam} needs deep completions to overcome uneven accuracy, while ${defenseTeam} has consistently kept those throws from becoming big gains.`;
  } else if ((offenseStyle === "BOOM-OR-BUST DEEP BALL" || offenseStyle === "EFFICIENT DOWNFIELD ATTACK" || offenseStyle === "EARLY-DOWN SHOTS") && defenseStyle === "GIVES UP DEEP SHOTS") {
    edgeTeam = offenseTeam; readStrength = offenseStyle === "EFFICIENT DOWNFIELD ATTACK" ? "strong" : "clear"; headline = `${offenseTeam} should find chances downfield`;
    reason = `${offenseTeam} creates chunk completions, and ${defenseTeam} has allowed opposing receivers to make too many plays beyond the short passing game.`;
  } else if (offenseStyle === "QUICK PASSING GAME" && (defenseStyle === "TAKES AWAY EASY THROWS" || defenseStyle === "WINS PASSING DOWNS")) {
    edgeTeam = defenseTeam; readStrength = "clear"; headline = `${defenseTeam} challenges the quick-game rhythm`;
    reason = `${offenseTeam} depends on easy completions to stay ahead of the chains, but ${defenseTeam} closes throwing windows and performs well when a pass is expected.`;
  } else if (offenseStyle === "EFFICIENT DOWNFIELD ATTACK" && defenseStyle === "LIMITS DEEP BALL") {
    edgeTeam = defenseTeam; readStrength = "slight"; headline = "Strength-on-strength passing matchup";
    reason = `${offenseTeam} combines accuracy with downfield gains, while ${defenseTeam} has consistently kept completed passes in front of the secondary.`;
  }
  return {
    offenseTeam, defenseTeam, offenseStyle, defenseStyle, edgeTeam, strength: readStrength, headline,
    detail: `${reason} Expected passing line: ${projectedLine}.`,
    projectedCompletionRate: completion, projectedYardsPerCompletion: yardsPerCompletion, projectedYpa: projection.pass.adjustedYpa,
  };
}

function positionScore(index: number | null | undefined) {
  return clamp(50 + 36 * Math.log(Math.max(0.2, index ?? 1)), 25, 75);
}

function fmt(value: number | null | undefined, digits = 1, suffix = "") {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function positionLane(
  id: PositionGroupEdge["id"], label: string, matchup: string,
  homeTeam: string, awayTeam: string, homeIndex: number | null | undefined, awayIndex: number | null | undefined,
  homeDetail: string, awayDetail: string,
): PositionGroupEdge {
  const homeScore = positionScore(homeIndex);
  const awayScore = positionScore(awayIndex);
  const difference = homeScore - awayScore;
  const laneStrength = strength(difference, 1.5, 4, 8);
  const edgeTeam = laneStrength === "even" ? null : difference > 0 ? homeTeam : awayTeam;
  return {
    id, label, matchup, homeScore, awayScore, edgeTeam, strength: laneStrength, homeDetail, awayDetail,
    detail: edgeTeam
      ? `${edgeTeam} has the ${laneStrength} ${label.toLowerCase()} matchup advantage.`
      : `Neither team has a clear ${label.toLowerCase()} advantage.`,
  };
}

function buildPositionGroups(homeTeam: string, awayTeam: string, home: AdvancedSideProjection | null | undefined, away: AdvancedSideProjection | null | undefined) {
  if (!home || !away) return [];
  return [
    positionLane("trenches", "Offensive line", "OL vs defensive front", homeTeam, awayTeam, home.run.trenchIndex, away.run.trenchIndex,
      `${fmt(home.run.lineYards, 2)} line yards · ${fmt(home.run.stuffRate === null ? null : home.run.stuffRate * 100, 1, "%")} stopped at line · ${fmt(home.run.powerSuccess === null ? null : home.run.powerSuccess * 100, 1, "%")} short-yardage wins`,
      `${fmt(away.run.lineYards, 2)} line yards · ${fmt(away.run.stuffRate === null ? null : away.run.stuffRate * 100, 1, "%")} stopped at line · ${fmt(away.run.powerSuccess === null ? null : away.run.powerSuccess * 100, 1, "%")} short-yardage wins`),
    positionLane("run-space", "Running backs", "RBs vs linebackers/space", homeTeam, awayTeam, home.run.secondLevelIndex, away.run.secondLevelIndex,
      `${fmt(home.run.yardsBeyondLine, 2)} yards after clearing the line · ${fmt(home.run.rushingSuccessRate === null ? null : home.run.rushingSuccessRate * 100, 1, "%")} productive runs`,
      `${fmt(away.run.yardsBeyondLine, 2)} yards after clearing the line · ${fmt(away.run.rushingSuccessRate === null ? null : away.run.rushingSuccessRate * 100, 1, "%")} productive runs`),
    positionLane("quarterback", "Quarterback", "QB efficiency vs coverage", homeTeam, awayTeam, home.pass.qbEfficiencyIndex, away.pass.qbEfficiencyIndex,
      `${fmt(home.pass.completionRate === null ? null : home.pass.completionRate * 100, 1, "%")} completions · ${fmt(home.pass.passingSuccessRate === null ? null : home.pass.passingSuccessRate * 100, 1, "%")} productive passes`,
      `${fmt(away.pass.completionRate === null ? null : away.pass.completionRate * 100, 1, "%")} completions · ${fmt(away.pass.passingSuccessRate === null ? null : away.pass.passingSuccessRate * 100, 1, "%")} productive passes`),
    positionLane("receivers", "Receivers", "WR/TE space vs secondary", homeTeam, awayTeam, home.pass.receiverSpaceIndex, away.pass.receiverSpaceIndex,
      `${fmt(home.pass.yardsPerCompletion, 1)} yards per catch · ${fmt(home.pass.passingExplosiveness, 2)} big-play rating`,
      `${fmt(away.pass.yardsPerCompletion, 1)} yards per catch · ${fmt(away.pass.passingExplosiveness, 2)} big-play rating`),
    positionLane("down-leverage", "Play calling", "Standard vs passing-down leverage", homeTeam, awayTeam, home.pass.downLeverageIndex, away.pass.downLeverageIndex,
      `${fmt(home.pass.standardDownSuccessRate === null ? null : home.pass.standardDownSuccessRate * 100, 1, "%")} early-down success · ${fmt(home.pass.passingDownSuccessRate === null ? null : home.pass.passingDownSuccessRate * 100, 1, "%")} passing-down success`,
      `${fmt(away.pass.standardDownSuccessRate === null ? null : away.pass.standardDownSuccessRate * 100, 1, "%")} early-down success · ${fmt(away.pass.passingDownSuccessRate === null ? null : away.pass.passingDownSuccessRate * 100, 1, "%")} passing-down success`),
  ];
}

export function analyzeMatchupEdges(
  homeTeam: string, awayTeam: string, homeOffense: IndexTuple, homeDefense: IndexTuple,
  awayOffense: IndexTuple, awayDefense: IndexTuple, neutralSite: boolean, projectedMargin: number,
  homeAdvanced?: AdvancedSideProjection | null, awayAdvanced?: AdvancedSideProjection | null,
  homeAdvancedProfile?: AdvancedProfile | null, awayAdvancedProfile?: AdvancedProfile | null,
  homeScoreReceipt?: PossessionScoreReceipt, awayScoreReceipt?: PossessionScoreReceipt,
  homeViability?: OffensiveViability, awayViability?: OffensiveViability,
): MatchupEdgeAnalysis {
  const homePass = homeAdvanced?.pass.adjustedYpa ?? baselines.ypa * Number(homeOffense[1] ?? 1) * Number(awayDefense[1] ?? 1);
  const awayPass = awayAdvanced?.pass.adjustedYpa ?? baselines.ypa * Number(awayOffense[1] ?? 1) * Number(homeDefense[1] ?? 1);
  const homeRun = homeAdvanced?.run.adjustedYpc ?? baselines.ypc * Number(homeOffense[2] ?? 1) * Number(awayDefense[2] ?? 1);
  const awayRun = awayAdvanced?.run.adjustedYpc ?? baselines.ypc * Number(awayOffense[2] ?? 1) * Number(homeDefense[2] ?? 1);
  const pass = unitEdge("pass", homeTeam, awayTeam, homePass, awayPass);
  const run = unitEdge("run", homeTeam, awayTeam, homeRun, awayRun);
  const defense = defenseEdge(homeTeam, awayTeam, homeDefense, awayDefense);
  const favorite = projectedMargin >= 0 ? homeTeam : awayTeam;
  const underdog = favorite === homeTeam ? awayTeam : homeTeam;
  const margin = Math.abs(projectedMargin);
  const confidence: MatchupEdgeAnalysis["confidence"] = margin < 3 ? "slight" : margin < 7.5 ? "clear" : "strong";
  const positionGroups = buildPositionGroups(homeTeam, awayTeam, homeAdvanced, awayAdvanced);
  const favoritePositionEdges = positionGroups.filter((edge) => edge.edgeTeam === favorite);
  const favoriteEdges = [pass, run, defense].filter((edge) => edge.edgeTeam === favorite);
  const summary = margin < 1
    ? `This is effectively a toss-up. ${pass.detail} ${run.detail}`
    : favoritePositionEdges.length
      ? `${favorite} is favored by ${rounded(margin)} with position-level support from ${favoritePositionEdges.slice(0, 3).map((edge) => edge.label.toLowerCase()).join(", ")}.`
      : favoriteEdges.length >= 2
        ? `${favorite} is favored by ${rounded(margin)} because it owns the better matchup in more of the game's key areas.`
        : !neutralSite && favorite === homeTeam && margin <= modelCalibration.homeFieldAdvantage + 1.5
          ? `${homeTeam} is only a slight favorite; home field breaks an otherwise balanced statistical matchup.`
          : `${favorite} is favored by ${rounded(margin)} because its offense and defense fit this opponent better overall.`;

  const schematicReads = [
    passingSchemeRead(homeTeam, awayTeam, homeAdvancedProfile, awayAdvancedProfile, homeAdvanced),
    passingSchemeRead(awayTeam, homeTeam, awayAdvancedProfile, homeAdvancedProfile, awayAdvanced),
  ].filter((read): read is PassingSchemeRead => Boolean(read));
  const factors = [pass.detail, run.detail, defense.detail, ...positionGroups.map((edge) => `${edge.detail} ${edge.edgeTeam === homeTeam ? edge.homeDetail : edge.edgeTeam === awayTeam ? edge.awayDetail : `${edge.homeDetail} vs ${edge.awayDetail}`}`)];
  factors.push(...schematicReads.filter((read) => read.strength !== "even").map((read) => read.detail));
  if (!neutralSite) factors.push(`Home field contributes ${modelCalibration.homeFieldAdvantage.toFixed(1)} points to ${homeTeam}.`);
  const intelligence = buildMatchupIntelligence(
    homeTeam, awayTeam, homeAdvanced, awayAdvanced, homeAdvancedProfile, awayAdvancedProfile,
    homeScoreReceipt, awayScoreReceipt, homeViability, awayViability,
    homeOffense, awayOffense,
  );
  return {
    favorite, underdog, projectedMargin: margin, confidence, headline: `${favorite} · ${confidence.toUpperCase()} EDGE`, summary,
    pass, run, defense, positionGroups, schematicReads, factors, intelligence,
  };
}
