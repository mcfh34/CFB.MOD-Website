import type { AdvancedProfile } from "./advancedMetrics";
import { analyzeMatchupEdges } from "./matchupAnalysis";
import {
  projectCalibratedMatchup,
  type MatchupEvidence,
  type MatchupTeamInput,
} from "./matchupModel";

export type MatchupEngineTeam = {
  team: string;
  offense: readonly number[];
  defense: readonly number[];
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
  outcomeRating?: number | null;
};

function matchupInput(team:MatchupEngineTeam):MatchupTeamInput {
  return {
    offense:team.offense,
    defense:team.defense,
    evidence:team.evidence,
    advanced:team.advanced,
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
) {
  return projectCalibratedMatchup(
    matchupInput(home),
    matchupInput(away),
    neutral,
    finiteRating(home.outcomeRating),
    finiteRating(away.outcomeRating),
  );
}

export function projectMatchupEngine(
  home: MatchupEngineTeam,
  away: MatchupEngineTeam,
  neutral: boolean,
) {
  const projection = projectMatchupCore(home,away,neutral);
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
