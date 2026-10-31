import type {MatchupPolicy} from "./matchupPolicy";
import type { RosterProjection } from "./rosterModel";
import type { AdvancedProfile } from "./advancedMetrics";
import { analyzeMatchupEdges } from "./matchupAnalysis";
import {
  projectCalibratedMatchup,
  type MatchupEvidence,
  type MatchupTeamInput,
} from "./matchupModel";

export type MatchupEngineTeam = {
  conferenceAdjustment?:number;
  isFcs?: boolean;
  isPower4?: boolean;
  roster?: RosterProjection;
  team: string;
  offense: readonly number[];
  defense: readonly number[];
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
  outcomeRating?: number | null;
};

function matchupInput(team:MatchupEngineTeam):MatchupTeamInput {
  return {
    conferenceAdjustment:team.isFcs?0:team.conferenceAdjustment,
    offense:team.offense,
    defense:team.defense,
    evidence:team.evidence,
    advanced:team.advanced,
    roster:team.roster,
  };
}

function finiteRating(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : undefined;
}

/**
 * Canonical Harper+ single-game path. Matchup Lab, the regular-season
 * simulator, conference title games and the playoff bracket all enter here
 * with the same five-part profiles, opponent proof, advanced metrics and
 * snapshot rating.
 */
export function projectMatchupCore(
  home: MatchupEngineTeam,
  away: MatchupEngineTeam,
  neutral: boolean,
  policy?:MatchupPolicy,
) {
  return projectCalibratedMatchup(
    matchupInput(home),
    matchupInput(away),
    neutral,
    finiteRating(home.outcomeRating),
    finiteRating(away.outcomeRating),
    true,
    {homeIsFcs:home.isFcs,awayIsFcs:away.isFcs,homeIsPower4:home.isPower4,awayIsPower4:away.isPower4},
    policy,
  );
}

export function projectMatchupEngine(
  home: MatchupEngineTeam,
  away: MatchupEngineTeam,
  neutral: boolean,
) {
  return analyzeProjection(home,away,neutral,projectMatchupCore(home,away,neutral));
}

export type MatchupSite = "home" | "neutral" | "away";

/** Keep results in selected-team order while evaluating the actual home side. */
export function projectMatchupAtSite(first:MatchupEngineTeam,second:MatchupEngineTeam,site:MatchupSite) {
  if(site!=="away")return projectMatchupEngine(first,second,site==="neutral");
  const p=projectMatchupCore(second,first,false);
  const reconciliation={...p.reconciliation,rawHome:p.reconciliation.rawAway,rawAway:p.reconciliation.rawHome,margin:-p.margin,
    components:p.reconciliation.components.map(c=>({...c,points:-c.points}))};
  const projection={...p,homeScore:p.awayScore,awayScore:p.homeScore,margin:-p.margin,modelHomeSpread:p.margin,
    homeWinProbability:1-p.homeWinProbability,statisticalMargin:-p.statisticalMargin,outcomeMargin:-p.outcomeMargin,
    earlyFormMargin:-p.earlyFormMargin,conferenceMargin:-p.conferenceMargin,subdivisionFloor:-p.subdivisionFloor,proofAdjustment:-p.proofAdjustment,proofGap:-p.proofGap,
    calibratedHome:p.calibratedAway,calibratedAway:p.calibratedHome,reconciliation,
    homeStats:{...p.awayStats,scoreReceipt:{...p.awayStats.scoreReceipt,reconciliation}},
    awayStats:{...p.homeStats,scoreReceipt:{...p.homeStats.scoreReceipt,reconciliation}},
    roster:{home:p.roster.away,away:p.roster.home},
    quarterbackScenarios:p.quarterbackScenarios.map(s=>({...s,homeQuarterback:s.awayQuarterback,awayQuarterback:s.homeQuarterback,
      homeScore:s.awayScore,awayScore:s.homeScore,homeWinProbability:1-s.homeWinProbability})),
    turnoverScenario:{...p.turnoverScenario,homeExpected:p.turnoverScenario.awayExpected,awayExpected:p.turnoverScenario.homeExpected,
      homeCleanMargin:-p.turnoverScenario.awayCleanMargin,awayCleanMargin:-p.turnoverScenario.homeCleanMargin}};
  const result=analyzeProjection(first,second,true,projection);
  result.edgeAnalysis.factors.push(`Home field applies to ${second.team}.`);
  return result;
}

function analyzeProjection(home:MatchupEngineTeam,away:MatchupEngineTeam,neutral:boolean,projection:ReturnType<typeof projectMatchupCore>) {
  const edgeAnalysis = analyzeMatchupEdges(
    home.team,
    away.team,
    projection.calibratedHome.offense,
    projection.calibratedHome.defense,
    projection.calibratedAway.offense,
    projection.calibratedAway.defense,
    neutral,
    projection.margin,
    projection.homeStats.advanced,
    projection.awayStats.advanced,
    projection.calibratedHome.advanced,
    projection.calibratedAway.advanced,
    projection.homeStats.scoreReceipt,
    projection.awayStats.scoreReceipt,
    projection.homeStats.viability,
    projection.awayStats.viability,
  );
  return { ...projection, edgeAnalysis };
}

/**
 * Both public surfaces use one score-card rounding rule. The underlying spread,
 * total and win probability remain unrounded; a displayed tie is released in
 * favor of the side with the positive model margin.
 */
export function matchupScoreCard(projection: {
  homeScore: number;
  awayScore: number;
  margin: number;
}) {
  let homeScore = Math.max(0, Math.round(projection.homeScore));
  let awayScore = Math.max(0, Math.round(projection.awayScore));
  if (homeScore === awayScore) {
    if (projection.margin >= 0) homeScore += 1;
    else awayScore += 1;
  }
  return { homeScore, awayScore };
}
