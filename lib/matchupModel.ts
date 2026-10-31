import {currentMatchupPolicy,evidencePrecision,type MatchupPolicy} from "./matchupPolicy";
import type { RosterProjection } from "./rosterModel";
import { baselines, modelCalibration } from "../app/modelData";
import { advancedMetricKeys, projectAdvancedSide, type AdvancedProfile, type AdvancedProfileSide } from "./advancedMetrics";
import { assessOffensiveViability } from "./offensiveViability";
import { directionalRunMultiplier } from "./rushingMatchup";
import { calibratedHomeWinProbability } from "./winProbability";
import { matchupTurnovers, stalledDriveTurnoverExposure, sustainableRunMultiplier } from "./predictiveSignals";
import {
  buildPossessionScoreReceipt,
  calibrateGameMargin,
  calibrateGameTotal,
  estimatePoints,
  expectedPossessions,
  projectionGuardrails,
  marginContributions,
} from "./scoringModel";

export type MatchupEvidence = {
  gamesPlayed: number;
  scheduleStrength: number;
  bestOpponentStrength: number;
  qualityWinStrength: number;
  reliability: number;
  /** Scoring margin from FBS games only, capped per game before averaging. */
  fbsScoringMargin?: number;
  /**
   * Asymmetric carryover from prior FCS results. A huge win can add only two
   * points, while an unexpectedly close game can remove as many as fourteen.
   */
  fcsResultAdjustment?: number;
  fcsGamesPlayed?: number;
  fbsGamesPlayed?:number;
  fbsPlays?:number;
  /** Fraction of FBS opponents with an observed interconference connection. */
  scheduleConnectivity?:number;
};

export type ScoringEvidence = {
  fbsPlays?:number;
  scheduleConnectivity?:number;
  fbsMargins?: readonly number[];
  fcsResults?: readonly { actualMargin: number; expectedMargin: number }[];
};

export type MatchupTeamInput = {
  conferenceAdjustment?:number;
  roster?: RosterProjection;
  offense: readonly number[];
  defense: readonly number[];
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
};

export type OpponentClassification = {
  homeIsFcs?: boolean;
  awayIsFcs?: boolean;
  homeIsPower4?: boolean;
  awayIsPower4?: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, values.length);

function earlyDominanceSignal(team: MatchupTeamInput, evidence: MatchupEvidence) {
  if (evidence.gamesPlayed <= 0) return 0;
  const scored = team.advanced?.offense.raw.pointsPerGame;
  const allowed = team.advanced?.defense.raw.pointsPerGame;
  const aggregateMargin = Number.isFinite(scored) && Number.isFinite(allowed) ? Number(scored) - Number(allowed) : 0;
  const separatedResultsAvailable = evidence.fbsScoringMargin !== undefined || evidence.fcsGamesPlayed !== undefined;
  // FBS scoring form is allowed to move the early projection. FCS wins hit a
  // very low ceiling, but a close call retains a much larger negative signal.
  const resultMargin = separatedResultsAvailable
    ? Number(evidence.fbsScoringMargin ?? 0) + Number(evidence.fcsResultAdjustment ?? 0)
    : aggregateMargin;
  // The possession model is trained on Week 5+, where the connected schedule
  // is mature. Before then, preserve a bounded portion of observed scoring
  // dominance so decisive early results are not erased by schedule shrinkage.
  const fade = clamp((5 - evidence.gamesPlayed) / 4, 0, 1);
  const scheduleConfidence = 0.55 + 0.45 * evidence.reliability;
  return clamp(resultMargin * fade * scheduleConfidence, -32, 32);
}

export function earlySeasonDominanceMargin(home: MatchupTeamInput, away: MatchupTeamInput) {
  const homeEvidence = home.evidence ?? preseasonMatchupEvidence;
  const awayEvidence = away.evidence ?? preseasonMatchupEvidence;
  return clamp(earlyDominanceSignal(home, homeEvidence) - earlyDominanceSignal(away, awayEvidence), -24, 24);
}

export function powerFourFcsMarginFloor(fbsOutcomeRating: number) {
  return 27 + clamp((Number(fbsOutcomeRating) - 1500) / 12.5, -3, 13);
}

export function fcsResultAdjustment(actualMargin: number, expectedMargin: number) {
  const difference = Number(actualMargin) - Number(expectedMargin);
  // Running an overmatched opponent out of answers tells us very little once
  // the expected margin is covered. Failing to separate is much more useful.
  return difference >= 0
    ? Math.min(2, difference * 0.06)
    : Math.max(-14, difference * 0.55);
}

function recencyWeightedAverage(values: readonly number[]) {
  if (!values.length) return 0;
  const weights = [0.4, 0.65, 1];
  const recent = values.slice(-weights.length);
  const used = weights.slice(weights.length - recent.length);
  return recent.reduce((sum, value, index) => sum + value * used[index], 0) / used.reduce((sum, value) => sum + value, 0);
}

function weightedTop(values: readonly number[], weights: readonly number[]) {
  const ordered = [...values].sort((a, b) => b - a).slice(0, weights.length);
  if (!ordered.length) return 0;
  const used = weights.slice(0, ordered.length);
  return ordered.reduce((sum, value, index) => sum + value * used[index], 0) / used.reduce((sum, value) => sum + value, 0);
}

export const preseasonMatchupEvidence: MatchupEvidence = {
  gamesPlayed: 0,
  scheduleStrength: 0.5,
  bestOpponentStrength: 0.5,
  qualityWinStrength: 0.35,
  reliability: 0.72,
};

/**
 * Converts the opponents a team has actually faced into a confidence level for
 * translating its efficiency to a new opponent. Conference labels and roster
 * brand are intentionally absent: the proof comes only from the connected
 * results network, the strongest opponents, and quality wins.
 */
export function buildMatchupEvidence(
  opponentStrengths: readonly number[],
  winStrengths: readonly number[],
  gamesPlayed = opponentStrengths.length,
  scoring: ScoringEvidence = {},
): MatchupEvidence {
  const games = Math.max(0, gamesPlayed);
  const hasSeparatedScoring = scoring.fbsMargins !== undefined || scoring.fcsResults !== undefined;
  const fbsMargins = (scoring.fbsMargins ?? []).map((margin) => clamp(Number(margin), -35, 35));
  const fcsAdjustments = (scoring.fcsResults ?? []).map((result) => fcsResultAdjustment(result.actualMargin, result.expectedMargin));
  const scoringEvidence = hasSeparatedScoring ? {
    fbsScoringMargin: recencyWeightedAverage(fbsMargins),
    fcsResultAdjustment: recencyWeightedAverage(fcsAdjustments),
    fcsGamesPlayed: fcsAdjustments.length,
    fbsGamesPlayed:fbsMargins.length,
    ...(scoring.fbsPlays!==undefined?{fbsPlays:scoring.fbsPlays}:{}),
    ...(scoring.scheduleConnectivity!==undefined?{scheduleConnectivity:scoring.scheduleConnectivity}:{}),
  } : {};
  if (!games || !opponentStrengths.length) return { ...preseasonMatchupEvidence, ...scoringEvidence, gamesPlayed: games };

  const normalizedOpponents = opponentStrengths.map((value) => clamp(Number(value), 0, 1));
  const normalizedWins = winStrengths.map((value) => clamp(Number(value), 0, 1));
  const bestOpponentStrength = weightedTop(normalizedOpponents, [0.55, 0.3, 0.15]);
  const averageOpponentStrength = average(normalizedOpponents);
  const scheduleStrength = 0.68 * bestOpponentStrength + 0.32 * averageOpponentStrength;
  const qualityWinStrength = normalizedWins.length ? weightedTop(normalizedWins, [0.6, 0.25, 0.15]) : 0;
  const sampleMaturity = clamp(games / 8, 0, 1);
  const scheduleProof = clamp((scheduleStrength - 0.22) / 0.62, 0, 1);

  // A mature team that has only played a closed weak network retains a wide
  // uncertainty band. One or more credible opponents/wins raises confidence
  // quickly, regardless of conference membership.
  const reliability = clamp(
    0.28 + 0.18 * sampleMaturity + 0.44 * scheduleProof + 0.1 * qualityWinStrength,
    modelCalibration.matchupEvidenceFloor,
    0.98,
  );

  return { gamesPlayed: games, scheduleStrength, bestOpponentStrength, qualityWinStrength, reliability, ...scoringEvidence };
}

function validatedIndex(value: number, evidence: MatchupEvidence, favorable: boolean) {
  const safe = clamp(Number(value) || 1, 0.45, 1.8);
  const weakSchedule = clamp((modelCalibration.matchupProofTarget - evidence.scheduleStrength) / modelCalibration.matchupProofTarget, 0, 1);
  const favorablePenalty = favorable ? 0.16 * weakSchedule * (1 - evidence.qualityWinStrength) : 0;
  const validation = clamp(evidence.reliability - favorablePenalty, modelCalibration.matchupEvidenceFloor, 1);
  return Math.exp(Math.log(safe) * validation);
}

function validateAdvancedSide(side: AdvancedProfileSide, evidence: MatchupEvidence, defense: boolean): AdvancedProfileSide {
  return {
    raw: { ...side.raw },
    index: Object.fromEntries(advancedMetricKeys.map((key) => {
      const metric = side.index[key];
      if (metric === null || !Number.isFinite(metric)) return [key, null];
      return [key, validatedIndex(metric, evidence, defense ? metric < 1 : metric > 1)];
    })) as AdvancedProfileSide["index"],
  };
}

function validateAdvancedProfile(profile: AdvancedProfile | null | undefined, evidence: MatchupEvidence): AdvancedProfile | null {
  if (!profile) return null;
  const completionCoverage = clamp(
    profile.coverage.completionGames / Math.max(4, profile.coverage.advancedGames),
    0.35,
    1,
  );
  const completionMetrics = new Set(["completionRate", "yardsPerCompletion"]);
  const stabilizeCompletionMetrics = (side:AdvancedProfileSide) => ({
    ...side,
    index:Object.fromEntries(Object.entries(side.index).map(([key, metric]) => [
      key,
      metric === null || !completionMetrics.has(key) ? metric : Math.exp(Math.log(metric) * completionCoverage),
    ])) as AdvancedProfileSide["index"],
  });
  return {
    ...profile,
    baseline: { ...profile.baseline },
    offense: stabilizeCompletionMetrics(validateAdvancedSide(profile.offense, evidence, false)),
    defense: stabilizeCompletionMetrics(validateAdvancedSide(profile.defense, evidence, true)),
    coverage: { ...profile.coverage },
  };
}

/**
 * Uses a conservative, schedule-aware translation of a team's profile. Good
 * offense (>1) and good defense (<1) need proof; weaknesses are not erased as
 * aggressively. Volume is mostly retained because pace is less opponent-led.
 */
export function validateMatchupProfile(team: MatchupTeamInput,policy:MatchupPolicy=currentMatchupPolicy) {
  const baseEvidence = team.evidence ?? preseasonMatchupEvidence;
  const evidence = {...baseEvidence,reliability:baseEvidence.reliability*(1-policy.extraShrinkage*(1-evidencePrecision(baseEvidence)))};
  const passVolumeReliability = clamp((Number(team.offense[3] ?? 1) - 0.45) / 0.55, 0.55, 1);
  const passDefenseVolumeReliability = clamp((Number(team.defense[3] ?? 1) - 0.45) / 0.55, 0.55, 1);
  const selectivePassReliability = passVolumeReliability * passVolumeReliability;
  const selectivePassDefenseReliability = passDefenseVolumeReliability * passDefenseVolumeReliability;
  const offense = team.offense.map((value, index) => {
    if (index >= 3) return Math.exp(Math.log(clamp(Number(value) || 1, 0.45, 1.8)) * (0.82 + 0.18 * evidence.reliability));
    const validated = validatedIndex(value, evidence, Number(value) > 1);
    // Option and service-academy passing games often post a high YPA on a very
    // small, play-action-heavy sample. Preserve the advantage, but do not
    // treat 10–15 selective throws as equally repeatable as a full passing
    // workload against a new opponent.
    return index === 1 && Number(value) > 1 ? Math.exp(Math.log(validated) * selectivePassReliability) : validated;
  });
  const defense = team.defense.map((value, index) => {
    if (index >= 3) return Math.exp(Math.log(clamp(Number(value) || 1, 0.45, 1.8)) * (0.82 + 0.18 * evidence.reliability));
    const validated = validatedIndex(value, evidence, Number(value) < 1);
    return index === 1 && Number(value) < 1 ? Math.exp(Math.log(validated) * selectivePassDefenseReliability) : validated;
  });
  return { offense, defense, evidence:baseEvidence, advanced: validateAdvancedProfile(team.advanced, evidence) };
}

export function projectCalibratedMatchup(
  home: MatchupTeamInput,
  away: MatchupTeamInput,
  neutral: boolean,
  homeOutcomeRating?: number,
  awayOutcomeRating?: number,
  resolveQuarterbacks = true,
  classification: OpponentClassification = {},
  policy:MatchupPolicy=currentMatchupPolicy,
) {
  const calibratedHome = validateMatchupProfile(home,policy);
  const calibratedAway = validateMatchupProfile(away,policy);
  const side = (
    offense: readonly number[],
    defense: readonly number[],
    offenseAdvanced: AdvancedProfile | null,
    defenseAdvanced: AdvancedProfile | null,
  ) => {
    const directYpa = baselines.ypa * Number(offense[1] ?? 1) * Number(defense[1] ?? 1);
    const directYpc = baselines.ypc * Number(offense[2] ?? 1) * Number(defense[2] ?? 1);
    const advanced = projectAdvancedSide(offenseAdvanced, defenseAdvanced, directYpc, directYpa, baselines.ypc, baselines.ypa);
    const ypa = advanced?.pass.adjustedYpa ?? directYpa;
    const ypc = (advanced?.run.adjustedYpc ?? directYpc) * directionalRunMultiplier(offenseAdvanced?.directional, defenseAdvanced?.directional) * sustainableRunMultiplier(offenseAdvanced?.rushingPersonnel);
    const patt = baselines.patt * Number(offense[3] ?? 1) * Number(defense[3] ?? 1);
    const ratt = baselines.ratt * Number(offense[4] ?? 1) * Number(defense[4] ?? 1);
    const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
    // Keep overall YPP aligned with the displayed matchup projection. The
    // separate adjusted YPA/YPC split is passed to the scoring receipt below;
    // a sack transfer conserves total offense and therefore cannot live in YPP.
    const scoringAdvanced = advanced ? {
      ...advanced,
      run: { ...advanced.run, adjustedYpc: ypc, adjustment: ypc - directYpc },
      overall: { ...advanced.overall, yardsPerPlay: ypp },
    } : null;
    const baseScore = estimatePoints({
      ypp,
      ypa,
      ypc,
      passAttempts: patt,
      rushAttempts: ratt,
      scoringProjection: scoringAdvanced?.scoringPoints,
    });
    return {
      ypa,
      ypc,
      patt,
      ratt,
      ypp,
      baseScore,
      advanced: scoringAdvanced,
    };
  };

  const homeStats = side(calibratedHome.offense, calibratedAway.defense, calibratedHome.advanced, calibratedAway.advanced);
  const awayStats = side(calibratedAway.offense, calibratedHome.defense, calibratedAway.advanced, calibratedHome.advanced);
  const possessions = expectedPossessions(
    { passAttempts: homeStats.patt, rushAttempts: homeStats.ratt, advanced: homeStats.advanced },
    { passAttempts: awayStats.patt, rushAttempts: awayStats.ratt, advanced: awayStats.advanced },
  );
  const homeViability = assessOffensiveViability(homeStats.advanced);
  const awayViability = assessOffensiveViability(awayStats.advanced);
  const homeReceipt = buildPossessionScoreReceipt(homeStats.advanced, calibratedHome.advanced, possessions, homeViability, homeStats.baseScore, {
    ypa: homeStats.ypa, ypc: homeStats.ypc, baselineYpa: baselines.ypa, baselineYpc: baselines.ypc,
  });
  const awayReceipt = buildPossessionScoreReceipt(awayStats.advanced, calibratedAway.advanced, possessions, awayViability, awayStats.baseScore, {
    ypa: awayStats.ypa, ypc: awayStats.ypc, baselineYpa: baselines.ypa, baselineYpc: baselines.ypc,
  });
  const homeField = neutral ? 0 : modelCalibration.homeFieldAdvantage;
  const statisticalMargin = homeReceipt.rawExpectedPoints - awayReceipt.rawExpectedPoints;
  const hasOutcomeRatings = Number.isFinite(homeOutcomeRating) && Number.isFinite(awayOutcomeRating);
  const baseOutcomeMargin = hasOutcomeRatings
    ? (Number(homeOutcomeRating) - Number(awayOutcomeRating)) / modelCalibration.eloPointsPerPoint + homeField
    : statisticalMargin;
  const earlyFormMargin = policy.earlyFormWeight*earlySeasonDominanceMargin(home, away);
  const outcomeMargin = baseOutcomeMargin + earlyFormMargin;
  const weakestEvidence = Math.min(calibratedHome.evidence.reliability, calibratedAway.evidence.reliability);
  const evidenceGap = Math.abs(calibratedHome.evidence.reliability - calibratedAway.evidence.reliability);
  const outcomeBlend = hasOutcomeRatings
    ? clamp(modelCalibration.outcomeBlend + 0.2 * (1 - weakestEvidence) + 0.1 * evidenceGap, modelCalibration.outcomeBlend, modelCalibration.matchupOutcomeBlendCeiling)
    : 0;
  const proofScore = (evidence: MatchupEvidence) =>
    0.4 * evidence.scheduleStrength
    + 0.2 * evidence.bestOpponentStrength
    + 0.25 * evidence.qualityWinStrength
    + 0.15 * evidence.reliability;
  const proofAdjustment = modelCalibration.matchupProofMarginWeight
    * (proofScore(calibratedHome.evidence) - proofScore(calibratedAway.evidence));
  const proofGap = proofScore(calibratedHome.evidence) - proofScore(calibratedAway.evidence);
  const pressureExposure=(stats:typeof homeStats)=>stalledDriveTurnoverExposure({
    yardsPerPlay:stats.ypp,baselineYardsPerPlay:baselines.ypp,passAttempts:stats.patt,rushAttempts:stats.ratt,
    standardDownSuccess:stats.advanced?.pass.standardDownSuccessRate,
    passingDownSuccess:stats.advanced?.pass.passingDownSuccessRate,
    passSuccess:stats.advanced?.pass.passingSuccessRate,
    havocAllowed:stats.advanced?.overall.havocRate,
  });
  const homeTurnovers=(matchupTurnovers(calibratedHome.advanced?.turnoverProfile,calibratedAway.advanced?.turnoverProfile)??1.2)+pressureExposure(homeStats);
  const awayTurnovers=(matchupTurnovers(calibratedAway.advanced?.turnoverProfile,calibratedHome.advanced?.turnoverProfile)??1.2)+pressureExposure(awayStats);
  // Persistent giveaway tendencies shift the center slightly; unusual game
  // turnovers are handled in the scenario range instead of driving the pick.
  const turnoverMargin=clamp(2.2*(awayTurnovers-homeTurnovers),-3,3);
  const total = calibrateGameTotal(homeReceipt, awayReceipt);
  const conferenceMargin=(Number.isFinite(home.conferenceAdjustment)?Number(home.conferenceAdjustment):0)-(Number.isFinite(away.conferenceAdjustment)?Number(away.conferenceAdjustment):0);
  const unboundedMargin = calibrateGameMargin(statisticalMargin, outcomeMargin, proofGap, neutral)+turnoverMargin+conferenceMargin;
  // This is only a mathematical coherence guard: the regression remains the
  // source of the margin and total, but it cannot assign a negative team score.
  let margin = clamp(unboundedMargin, -Math.max(1, total - 1), Math.max(1, total - 1));
  let subdivisionFloor = 0;
  if (classification.homeIsPower4 && classification.awayIsFcs && Number.isFinite(homeOutcomeRating)) {
    subdivisionFloor = powerFourFcsMarginFloor(Number(homeOutcomeRating)) + Number(calibratedHome.evidence.fcsResultAdjustment ?? 0);
    margin = Math.max(margin, subdivisionFloor);
  } else if (classification.awayIsPower4 && classification.homeIsFcs && Number.isFinite(awayOutcomeRating)) {
    subdivisionFloor = -(powerFourFcsMarginFloor(Number(awayOutcomeRating)) + Number(calibratedAway.evidence.fcsResultAdjustment ?? 0));
    margin = Math.min(margin, subdivisionFloor);
  }
  margin = clamp(margin, -Math.max(1, total - 1), Math.max(1, total - 1));
  let homeScore = total / 2 + margin / 2;
  let awayScore = total / 2 - margin / 2;
  homeReceipt.finalExpectedPoints = homeScore;
  awayReceipt.finalExpectedPoints = awayScore;
  const viabilityVolatility = 2.2 * Math.max(homeViability.risk, awayViability.risk);
  const turnoverVolatility=clamp(.65*(homeTurnovers+awayTurnovers)+.4*Math.sqrt((calibratedHome.advanced?.turnoverProfile?.lostVariance??0)+(calibratedAway.advanced?.turnoverProfile?.lostVariance??0)),0,3);
  const volatility = 11.8 + viabilityVolatility + turnoverVolatility + Math.abs(average(calibratedHome.offense.slice(0, 3)) - average(calibratedAway.offense.slice(0, 3))) * 2;
  const rosterUncertainty=Math.max(home.roster?.offense.uncertainty??0,away.roster?.offense.uncertainty??0,home.roster?.defense.uncertainty??0,away.roster?.defense.uncertainty??0);
  let homeWinProbability = calibratedHomeWinProbability(margin,rosterUncertainty);
  const scenarioResults:{homeQuarterback:string|null;awayQuarterback:string|null;probability:number;homeScore:number;awayScore:number;homeWinProbability:number}[]=[];
  if(resolveQuarterbacks && ((home.roster?.quarterbacks.length??0)>1 || (away.roster?.quarterbacks.length??0)>1)) {
    const defaults=[{player:null,probability:1,passingLogDelta:0}];
    const hq=home.roster?.quarterbacks.length?home.roster.quarterbacks:defaults;
    const aq=away.roster?.quarterbacks.length?away.roster.quarterbacks:defaults;
    const change=(input:MatchupTeamInput,delta:number):MatchupTeamInput=>{
      const offense=[...input.offense];offense[1]*=Math.exp(delta);
      const advanced=input.advanced?structuredClone(input.advanced):null;
      if(advanced)for(const key of advancedMetricKeys.filter(k=>/pass|completion/i.test(k))) {
        const n=advanced.offense.index[key];if(n!==null)advanced.offense.index[key]=n*Math.exp(delta);
      }
      return {...input,offense,advanced};
    };
    for(const h of hq)for(const a of aq){
      const p=projectCalibratedMatchup(change(home,h.passingLogDelta),change(away,a.passingLogDelta),neutral,homeOutcomeRating,awayOutcomeRating,false,classification,policy);
      scenarioResults.push({homeQuarterback:h.player,awayQuarterback:a.player,probability:h.probability*a.probability,homeScore:p.homeScore,awayScore:p.awayScore,homeWinProbability:p.homeWinProbability});
    }
    homeScore=scenarioResults.reduce((n,s)=>n+s.probability*s.homeScore,0);
    awayScore=scenarioResults.reduce((n,s)=>n+s.probability*s.awayScore,0);
    margin=homeScore-awayScore;
    homeWinProbability=scenarioResults.reduce((n,s)=>n+s.probability*s.homeWinProbability,0);
  }
  homeReceipt.finalExpectedPoints=homeScore;awayReceipt.finalExpectedPoints=awayScore;
  const marginReceipt=marginContributions(statisticalMargin,baseOutcomeMargin,proofGap,neutral,earlyFormMargin);
  if(turnoverMargin)marginReceipt.push({id:"turnoverExposure",label:"Expected turnover exposure",points:turnoverMargin});
  if(conferenceMargin)marginReceipt.push({id:"conferenceStrength",label:"Weekly conference strength",points:conferenceMargin});
  if(subdivisionFloor)marginReceipt.push({id:"subdivisionFloor",label:"Power 4 vs FCS baseline",points:margin-marginReceipt.reduce((n,c)=>n+c.points,0)});
  marginReceipt.push({id:"coherence",label:"Score constraints and quarterback scenarios",points:margin-marginReceipt.reduce((n,c)=>n+c.points,0)});
  const reconciliation={rawHome:homeReceipt.rawExpectedPoints,rawAway:awayReceipt.rawExpectedPoints,rawTotal:homeReceipt.rawExpectedPoints+awayReceipt.rawExpectedPoints,finalTotal:homeScore+awayScore,margin,components:marginReceipt};
  homeReceipt.reconciliation=reconciliation;awayReceipt.reconciliation=reconciliation;
  const warnings = projectionGuardrails(homeScore, awayScore, possessions);

  return {
    homeScore,
    awayScore,
    reconciliation,
    quarterbackScenarios:scenarioResults,
    roster:{home:home.roster??null,away:away.roster??null},
    margin,
    homeWinProbability,
    modelHomeSpread: -margin,
    modelTotal: homeScore + awayScore,
    homeStats: { ...homeStats, score: homeScore, scoreReceipt: homeReceipt, viability: homeViability, expectedTurnovers:homeTurnovers },
    awayStats: { ...awayStats, score: awayScore, scoreReceipt: awayReceipt, viability: awayViability, expectedTurnovers:awayTurnovers },
    calibratedHome,
    calibratedAway,
    statisticalMargin,
    outcomeMargin,
    conferenceMargin,
    earlyFormMargin,
    subdivisionFloor,
    outcomeBlend,
    proofAdjustment,
    proofGap,
    possessions,
    volatility,
    turnoverScenario:{
      homeExpected:homeTurnovers,awayExpected:awayTurnovers,
      homeCleanMargin:margin+Math.max(0,homeTurnovers-.25)*2.2,
      awayCleanMargin:margin-Math.max(0,awayTurnovers-.25)*2.2,
      swingRange:turnoverVolatility,
    },
    warnings,
  };
}
