import { baselines, modelCalibration } from "../app/modelData";

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
  factors: string[];
};

type IndexTuple = readonly number[];

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
    unit,
    homeValue,
    awayValue,
    edgeTeam,
    edgeValue: Math.abs(difference),
    strength: unitStrength,
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
    unit: "defense",
    homeValue,
    awayValue,
    edgeTeam,
    edgeValue: Math.abs(difference),
    strength: unitStrength,
    detail: edgeTeam
      ? `${edgeTeam} owns the ${unitStrength} overall defensive edge, holding opponents to ${rounded(edgeTeam === homeTeam ? homeValue : awayValue, 0)}% of schedule-adjusted average output.`
      : `The defenses are nearly even after opponent adjustment (${rounded(homeValue, 0)}% vs ${rounded(awayValue, 0)}% of average allowed).`,
  };
}

export function analyzeMatchupEdges(
  homeTeam: string,
  awayTeam: string,
  homeOffense: IndexTuple,
  homeDefense: IndexTuple,
  awayOffense: IndexTuple,
  awayDefense: IndexTuple,
  neutralSite: boolean,
  projectedMargin: number,
): MatchupEdgeAnalysis {
  const homePass = baselines.ypa * Number(homeOffense[1] ?? 1) * Number(awayDefense[1] ?? 1);
  const awayPass = baselines.ypa * Number(awayOffense[1] ?? 1) * Number(homeDefense[1] ?? 1);
  const homeRun = baselines.ypc * Number(homeOffense[2] ?? 1) * Number(awayDefense[2] ?? 1);
  const awayRun = baselines.ypc * Number(awayOffense[2] ?? 1) * Number(homeDefense[2] ?? 1);
  const pass = unitEdge("pass", homeTeam, awayTeam, homePass, awayPass);
  const run = unitEdge("run", homeTeam, awayTeam, homeRun, awayRun);
  const defense = defenseEdge(homeTeam, awayTeam, homeDefense, awayDefense);
  const favorite = projectedMargin >= 0 ? homeTeam : awayTeam;
  const underdog = favorite === homeTeam ? awayTeam : homeTeam;
  const margin = Math.abs(projectedMargin);
  const confidence: MatchupEdgeAnalysis["confidence"] = margin < 3 ? "slight" : margin < 7.5 ? "clear" : "strong";
  const favoriteEdges = [pass, run, defense].filter((edge) => edge.edgeTeam === favorite);
  const underdogEdges = [pass, run, defense].filter((edge) => edge.edgeTeam === underdog);
  const primary = [...favoriteEdges].sort((a, b) => {
    const order = { even: 0, slight: 1, clear: 2, strong: 3 } as const;
    return order[b.strength] - order[a.strength] || b.edgeValue - a.edgeValue;
  })[0];

  let summary: string;
  if (margin < 1) {
    summary = `This is effectively a toss-up. ${pass.detail} ${run.detail}`;
  } else if (favoriteEdges.length >= 2) {
    summary = `${favorite} is favored by ${rounded(margin)} because it holds the advantage in ${favoriteEdges.map((edge) => edge.unit === "defense" ? "overall defense" : `the ${edge.unit} game`).join(" and ")}.`;
  } else if (primary && underdogEdges.length) {
    summary = `${favorite}'s ${primary.unit === "defense" ? "defensive" : `${primary.unit}-game`} advantage is large enough to outweigh ${underdog}'s counter-edge in ${underdogEdges.map((edge) => edge.unit === "defense" ? "defense" : `the ${edge.unit} game`).join(" and ")}.`;
  } else if (!neutralSite && favorite === homeTeam && margin <= modelCalibration.homeFieldAdvantage + 1.5) {
    summary = `${homeTeam} is only a slight favorite; home field breaks an otherwise balanced statistical matchup.`;
  } else {
    summary = `${favorite} is favored by ${rounded(margin)} on the strength of the better combined opponent-adjusted efficiency profile.`;
  }

  const factors = [pass.detail, run.detail, defense.detail];
  if (!neutralSite) factors.push(`Home field contributes ${modelCalibration.homeFieldAdvantage.toFixed(1)} points to ${homeTeam}.`);
  return {
    favorite,
    underdog,
    projectedMargin: margin,
    confidence,
    headline: `${favorite} · ${confidence.toUpperCase()} EDGE`,
    summary,
    pass,
    run,
    defense,
    factors,
  };
}
