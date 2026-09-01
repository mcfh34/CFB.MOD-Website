import { modelCalibration } from "../app/modelData";
import { project, type Profile } from "./dataPipeline";
import {
  buildLegacyPreseasonProfiles,
  buildPreseasonStateTransition,
  preseasonTransitionCandidateGrid,
  type MetricTuple,
  type PreseasonHistoryRow,
  type PreseasonTransitionCoefficients,
  type PreseasonTransitionInput,
  type PreseasonTransitionProfile,
} from "./preseasonTransition";

export type PreseasonBacktestGame = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  startDate: string | null;
  neutralSite: boolean;
  homeTeam: string;
  homePoints: number;
  awayTeam: string;
  awayPoints: number;
};

export type PreseasonBacktestSeason = {
  season: number;
  teams: string[];
  historyByTeam: Map<string, PreseasonHistoryRow[]>;
  inputs: PreseasonTransitionInput[];
  games: PreseasonBacktestGame[];
  finalProfiles: Map<string, PreseasonTransitionProfile>;
  finalEloByTeam: Map<string, number>;
};

type Aggregate = {
  gameCount: number;
  marginAbsoluteError: number;
  scoreAbsoluteError: number;
  straightUpGraded: number;
  straightUpWins: number;
  brierSum: number;
};

export type BacktestMetrics = {
  seasons: number[];
  earlySeason: {
    games: number;
    marginMae: number | null;
    scoreMae: number | null;
    straightUp: number | null;
    brier: number | null;
  };
  fullSeason: {
    games: number;
    marginMae: number | null;
    scoreMae: number | null;
    straightUp: number | null;
    brier: number | null;
  };
  finalRatingMae: number | null;
  ratingCalibration: {
    elite: { teams: number; mae: number | null; bias: number | null };
    average: { teams: number; mae: number | null; bias: number | null };
    poor: { teams: number; mae: number | null; bias: number | null };
  };
  yearOverYearChange: {
    teams: number;
    mean: number | null;
    standardDeviation: number | null;
    p10: number | null;
    median: number | null;
    p90: number | null;
  };
  objective: number;
};

type RatingObservation = {
  team: string;
  season: number;
  tier: "elite" | "average" | "poor" | "other";
  prior: number;
  predicted: number;
  actual: number;
};

export type PreseasonDiagnosticRow = {
  archetype: string;
  team: string;
  priorSeason: number;
  targetSeason: number;
  priorSeasonFinalHPlus: number;
  legacyPreseasonHPlus: number;
  newPreseasonHPlus: number;
  legacyChange: number;
  newChange: number;
  programStability: number;
  previousFinalPower: number;
  programCenterPower: number;
  returningProduction: number | null;
  returningProductionSignal: number;
  recruitingRank: number | null;
  recruitingPoints: number | null;
  replacementSignal: number;
  finalAdjustment: number;
  legacyNeutralComparison: { priorScore: number; preseasonScore: number; margin: number };
  newNeutralComparison: { priorScore: number; preseasonScore: number; margin: number };
  priorFinalElo: number;
  newPreseasonElo: number;
  dataCoverage: "full" | "partial" | "fallback";
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const round = (value: number | null, digits = 3) => value === null ? null : Number(value.toFixed(digits));

const averageProfile = (season: number): Profile => ({
  season,
  week: 0,
  team: "FBS Average",
  gamesPlayed: 0,
  off: [5.6, 7.3, 4.4, 30.9, 35.8],
  def: [5.6, 7.3, 4.4, 30.9, 35.8],
  oi: [1, 1, 1, 1, 1],
  di: [1, 1, 1, 1, 1],
  advanced: null,
});

function asProjectProfile(profile: PreseasonTransitionProfile): Profile {
  // Advanced metrics are deliberately excluded from coefficient selection.
  // Their archive coverage changes by year; including them would make the old
  // and new transition comparison partly a coverage comparison rather than a
  // state-transition comparison. Production still transitions the advanced
  // profile after coefficients are selected.
  return { ...profile, advanced: null };
}

function hPlusRating(profile: PreseasonTransitionProfile, elo: number) {
  return project(asProjectProfile(profile), averageProfile(profile.season), true, elo, 1500).margin;
}

function emptyAggregate(): Aggregate {
  return { gameCount: 0, marginAbsoluteError: 0, scoreAbsoluteError: 0, straightUpGraded: 0, straightUpWins: 0, brierSum: 0 };
}

function addGame(aggregate: Aggregate, game: PreseasonBacktestGame, home: PreseasonTransitionProfile, away: PreseasonTransitionProfile) {
  const prediction = project(asProjectProfile(home), asProjectProfile(away), game.neutralSite, home.preseasonElo ?? 1500, away.preseasonElo ?? 1500);
  const actualMargin = game.homePoints - game.awayPoints;
  aggregate.gameCount += 1;
  aggregate.marginAbsoluteError += Math.abs(prediction.margin - actualMargin);
  aggregate.scoreAbsoluteError += (Math.abs(prediction.homeScore - game.homePoints) + Math.abs(prediction.awayScore - game.awayPoints)) / 2;
  if (game.homePoints !== game.awayPoints) {
    const actualHome = game.homePoints > game.awayPoints ? 1 : 0;
    aggregate.straightUpGraded += 1;
    aggregate.straightUpWins += (prediction.homeWinProbability >= 0.5) === Boolean(actualHome) ? 1 : 0;
    aggregate.brierSum += (prediction.homeWinProbability - actualHome) ** 2;
  }
}

function summarizeAggregate(aggregate: Aggregate) {
  return {
    games: aggregate.gameCount,
    marginMae: aggregate.gameCount ? aggregate.marginAbsoluteError / aggregate.gameCount : null,
    scoreMae: aggregate.gameCount ? aggregate.scoreAbsoluteError / aggregate.gameCount : null,
    straightUp: aggregate.straightUpGraded ? aggregate.straightUpWins / aggregate.straightUpGraded : null,
    brier: aggregate.straightUpGraded ? aggregate.brierSum / aggregate.straightUpGraded : null,
  };
}

function percentile(values: number[], position: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(position, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarizeRating(rows: RatingObservation[], tier: RatingObservation["tier"] | null) {
  const selected = tier ? rows.filter((row) => row.tier === tier) : rows;
  return {
    teams: selected.length,
    mae: selected.length ? selected.reduce((sum, row) => sum + Math.abs(row.predicted - row.actual), 0) / selected.length : null,
    bias: selected.length ? selected.reduce((sum, row) => sum + row.predicted - row.actual, 0) / selected.length : null,
  };
}

function objective(metrics: Omit<BacktestMetrics, "objective">) {
  // Preseason transition quality is selected primarily on Weeks 1–4 margin
  // accuracy, but a lower MAE cannot buy materially worse winner selection or
  // systematic elite/poor-tier bias. Unitless Brier and error rate are placed
  // on a 14-point scale before joining the point-error terms.
  const earlyMargin = metrics.earlySeason.marginMae ?? 99;
  const earlyScore = metrics.earlySeason.scoreMae ?? 99;
  const fullMargin = metrics.fullSeason.marginMae ?? 99;
  const ratingMae = metrics.finalRatingMae ?? 99;
  const brier = (metrics.earlySeason.brier ?? 1) * 14;
  const winnerError = (1 - (metrics.earlySeason.straightUp ?? 0)) * 14;
  const tierBias = [metrics.ratingCalibration.elite.bias,metrics.ratingCalibration.average.bias,metrics.ratingCalibration.poor.bias]
    .filter((value):value is number=>value!==null)
    .reduce((sum,value,_,rows)=>sum+Math.abs(value)/rows.length,0);
  return 0.3 * earlyMargin + 0.08 * earlyScore + 0.12 * fullMargin + 0.15 * ratingMae
    + 0.08 * brier + 0.1 * winnerError + 0.17 * tierBias;
}

function evaluateProfiles(
  seasons: PreseasonBacktestSeason[],
  profileBuilder: (season: PreseasonBacktestSeason) => PreseasonTransitionProfile[],
): BacktestMetrics {
  const early = emptyAggregate();
  const full = emptyAggregate();
  const ratingRows: RatingObservation[] = [];
  const changes: number[] = [];

  for (const season of seasons) {
    const profiles = profileBuilder(season);
    const byTeam = new Map(profiles.map((profile) => [profile.team, profile]));
    for (const game of season.games) {
      const home = byTeam.get(game.homeTeam);
      const away = byTeam.get(game.awayTeam);
      if (!home || !away) continue;
      addGame(full, game, home, away);
      if (game.week <= 4 && game.seasonType !== "postseason") addGame(early, game, home, away);
    }

    const priorRatings = season.teams.flatMap((team) => {
      const history = season.historyByTeam.get(team) ?? [];
      const prior = history[0]?.profile;
      if (!prior) return [];
      return [{ team, rating: hPlusRating(prior, history[0]?.finalElo ?? 1500) }];
    }).sort((left, right) => right.rating - left.rating || left.team.localeCompare(right.team));
    const denominator = Math.max(1, priorRatings.length - 1);
    const tierByTeam = new Map(priorRatings.map((row, index) => {
      const percentileRank = 1 - index / denominator;
      const tier: RatingObservation["tier"] = percentileRank >= 0.8 ? "elite" : percentileRank <= 0.2 ? "poor" : percentileRank >= 0.35 && percentileRank <= 0.65 ? "average" : "other";
      return [row.team, tier] as const;
    }));
    const priorByTeam = new Map(priorRatings.map((row) => [row.team, row.rating]));
    for (const team of season.teams) {
      const predicted = byTeam.get(team);
      const actual = season.finalProfiles.get(team);
      const prior = priorByTeam.get(team);
      if (!predicted || !actual || prior === undefined) continue;
      const predictedRating = hPlusRating(predicted, predicted.preseasonElo ?? 1500);
      const actualRating = hPlusRating(actual, season.finalEloByTeam.get(team) ?? 1500);
      changes.push(predictedRating - prior);
      ratingRows.push({ team, season: season.season, tier: tierByTeam.get(team) ?? "other", prior, predicted: predictedRating, actual: actualRating });
    }
  }

  const earlySeason = summarizeAggregate(early);
  const fullSeason = summarizeAggregate(full);
  const overallRating = summarizeRating(ratingRows, null);
  const meanChange = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
  const standardDeviation = changes.length && meanChange !== null
    ? Math.sqrt(changes.reduce((sum, value) => sum + (value - meanChange) ** 2, 0) / changes.length)
    : null;
  const partial: Omit<BacktestMetrics, "objective"> = {
    seasons: seasons.map((season) => season.season),
    earlySeason,
    fullSeason,
    finalRatingMae: overallRating.mae,
    ratingCalibration: {
      elite: summarizeRating(ratingRows, "elite"),
      average: summarizeRating(ratingRows, "average"),
      poor: summarizeRating(ratingRows, "poor"),
    },
    yearOverYearChange: {
      teams: changes.length,
      mean: meanChange,
      standardDeviation,
      p10: percentile(changes, 0.1),
      median: percentile(changes, 0.5),
      p90: percentile(changes, 0.9),
    },
  };
  return { ...partial, objective: objective(partial) };
}

function roundMetrics(metrics: BacktestMetrics): BacktestMetrics {
  return {
    ...metrics,
    earlySeason: {
      ...metrics.earlySeason,
      marginMae: round(metrics.earlySeason.marginMae),
      scoreMae: round(metrics.earlySeason.scoreMae),
      straightUp: round(metrics.earlySeason.straightUp, 4),
      brier: round(metrics.earlySeason.brier, 4),
    },
    fullSeason: {
      ...metrics.fullSeason,
      marginMae: round(metrics.fullSeason.marginMae),
      scoreMae: round(metrics.fullSeason.scoreMae),
      straightUp: round(metrics.fullSeason.straightUp, 4),
      brier: round(metrics.fullSeason.brier, 4),
    },
    finalRatingMae: round(metrics.finalRatingMae),
    ratingCalibration: Object.fromEntries(Object.entries(metrics.ratingCalibration).map(([key, value]) => [key, {
      ...value,
      mae: round(value.mae),
      bias: round(value.bias),
    }])) as BacktestMetrics["ratingCalibration"],
    yearOverYearChange: {
      ...metrics.yearOverYearChange,
      mean: round(metrics.yearOverYearChange.mean),
      standardDeviation: round(metrics.yearOverYearChange.standardDeviation),
      p10: round(metrics.yearOverYearChange.p10),
      median: round(metrics.yearOverYearChange.median),
      p90: round(metrics.yearOverYearChange.p90),
    },
    objective: Number(metrics.objective.toFixed(4)),
  };
}

function transitionProfiles(season: PreseasonBacktestSeason, baselines: MetricTuple, coefficients: PreseasonTransitionCoefficients) {
  return buildPreseasonStateTransition({
    season: season.season,
    teams: season.teams,
    historyByTeam: season.historyByTeam,
    inputs: season.inputs,
    baselines,
    coefficients,
  });
}

function legacyProfiles(season: PreseasonBacktestSeason, baselines: MetricTuple) {
  return buildLegacyPreseasonProfiles({
    season: season.season,
    teams: season.teams,
    historyByTeam: season.historyByTeam,
    inputs: season.inputs,
    baselines,
    eloScale: modelCalibration.preseasonEloScale,
  });
}

function closestToAverage(rows: PreseasonDiagnosticRow[]) {
  return [...rows].sort((left, right) => Math.abs(left.priorSeasonFinalHPlus) - Math.abs(right.priorSeasonFinalHPlus) || left.team.localeCompare(right.team))[0];
}

function diagnosticRows(season: PreseasonBacktestSeason, baselines: MetricTuple, coefficients: PreseasonTransitionCoefficients) {
  const nextProfiles = transitionProfiles(season, baselines, coefficients);
  const oldProfiles = legacyProfiles(season, baselines);
  const oldByTeam = new Map(oldProfiles.map((profile) => [profile.team, profile]));
  const rows = nextProfiles.flatMap((next): PreseasonDiagnosticRow[] => {
    const history = season.historyByTeam.get(next.team) ?? [];
    const prior = history[0]?.profile;
    const diagnostic = next.transitionDiagnostic;
    const legacy = oldByTeam.get(next.team);
    if (!prior || !diagnostic || !legacy) return [];
    const priorElo = history[0]?.finalElo ?? 1500;
    const priorRating = hPlusRating(prior, priorElo);
    // The previous cross-season Matchup Lab had no Week 0 result Elo and fell
    // back to 1500, even though the schedule pipeline separately reconstructed
    // preseason Elo from the already-regressed profile.
    const legacyRating = hPlusRating(legacy, 1500);
    const nextRating = hPlusRating(next, next.preseasonElo ?? 1500);
    const legacyComparison = project(prior as Profile, legacy as Profile, true, priorElo, 1500);
    const nextComparison = project(prior as Profile, next as Profile, true, priorElo, next.preseasonElo ?? 1500);
    return [{
      archetype: "",
      team: next.team,
      priorSeason: history[0].season,
      targetSeason: season.season,
      priorSeasonFinalHPlus: priorRating,
      legacyPreseasonHPlus: legacyRating,
      newPreseasonHPlus: nextRating,
      legacyChange: legacyRating - priorRating,
      newChange: nextRating - priorRating,
      programStability: diagnostic.programStability,
      previousFinalPower: diagnostic.previousFinalPower,
      programCenterPower: diagnostic.programCenterPower,
      returningProduction: diagnostic.returningProduction,
      returningProductionSignal: diagnostic.returningProductionSignal,
      recruitingRank: diagnostic.recruitingRank,
      recruitingPoints: diagnostic.recruitingPoints,
      replacementSignal: diagnostic.replacementSignal,
      finalAdjustment: nextRating - priorRating,
      legacyNeutralComparison: { priorScore: legacyComparison.homeScore, preseasonScore: legacyComparison.awayScore, margin: legacyComparison.margin },
      newNeutralComparison: { priorScore: nextComparison.homeScore, preseasonScore: nextComparison.awayScore, margin: nextComparison.margin },
      priorFinalElo: priorElo,
      newPreseasonElo: next.preseasonElo ?? 1500,
      dataCoverage: diagnostic.dataCoverage,
    }];
  });

  const assigned = new Map<string, PreseasonDiagnosticRow>();
  const assign = (label: string, row: PreseasonDiagnosticRow | undefined) => {
    if (!row || assigned.has(row.team)) return;
    assigned.set(row.team, { ...row, archetype: label });
  };
  assign(season.season===2026?"Georgia regression test":"Established elite example", rows.find((row) => row.team === "Georgia"));
  assign("Established elite", [...rows].filter((row) => row.programStability >= 0.55).sort((a, b) => b.priorSeasonFinalHPlus - a.priorSeasonFinalHPlus)[0]);
  assign("One-year breakout", [...rows].sort((a, b) => (b.previousFinalPower-b.programCenterPower)-(a.previousFinalPower-a.programCenterPower))[0]);
  assign("Established average", closestToAverage(rows.filter((row) => row.programStability >= 0.55)));
  assign("Historically weak", [...rows].filter((row) => row.programStability >= 0.55).sort((a, b) => a.programCenterPower - b.programCenterPower)[0]);
  assign("Major roster turnover", [...rows].filter((row) => row.returningProduction !== null).sort((a, b) => Number(a.returningProduction) - Number(b.returningProduction))[0]);
  return [...assigned.values()].map((row) => ({
    ...row,
    priorSeasonFinalHPlus: Number(row.priorSeasonFinalHPlus.toFixed(2)),
    legacyPreseasonHPlus: Number(row.legacyPreseasonHPlus.toFixed(2)),
    newPreseasonHPlus: Number(row.newPreseasonHPlus.toFixed(2)),
    legacyChange: Number(row.legacyChange.toFixed(2)),
    newChange: Number(row.newChange.toFixed(2)),
    programStability: Number(row.programStability.toFixed(3)),
    previousFinalPower: Number(row.previousFinalPower.toFixed(4)),
    programCenterPower: Number(row.programCenterPower.toFixed(4)),
    returningProduction: round(row.returningProduction, 3),
    returningProductionSignal: Number(row.returningProductionSignal.toFixed(3)),
    replacementSignal: Number(row.replacementSignal.toFixed(3)),
    finalAdjustment: Number(row.finalAdjustment.toFixed(2)),
    legacyNeutralComparison: {
      priorScore: Number(row.legacyNeutralComparison.priorScore.toFixed(1)),
      preseasonScore: Number(row.legacyNeutralComparison.preseasonScore.toFixed(1)),
      margin: Number(row.legacyNeutralComparison.margin.toFixed(1)),
    },
    newNeutralComparison: {
      priorScore: Number(row.newNeutralComparison.priorScore.toFixed(1)),
      preseasonScore: Number(row.newNeutralComparison.preseasonScore.toFixed(1)),
      margin: Number(row.newNeutralComparison.margin.toFixed(1)),
    },
    priorFinalElo: Number(row.priorFinalElo.toFixed(1)),
    newPreseasonElo: Number(row.newPreseasonElo.toFixed(1)),
  }));
}

export function runPreseasonTransitionBacktest(args: {
  seasons: PreseasonBacktestSeason[];
  currentSeason: PreseasonBacktestSeason | null;
  baselines: MetricTuple;
}) {
  const completed = args.seasons.filter((season) => season.games.length && season.finalProfiles.size);
  const orderedSeasons=[...new Set(completed.map((season)=>season.season))].sort((a,b)=>a-b);
  const auditSeason = orderedSeasons.at(-1)??0;
  const validationSeason = orderedSeasons.at(-2)??auditSeason;
  const development = completed.filter((season) => season.season < validationSeason);
  const validation = completed.filter((season) => season.season === validationSeason);
  const audit = completed.filter((season) => season.season === auditSeason);
  const candidates = preseasonTransitionCandidateGrid();
  const legacyDevelopment = evaluateProfiles(development, (season) => legacyProfiles(season, args.baselines));
  const legacyValidation = evaluateProfiles(validation, (season) => legacyProfiles(season, args.baselines));
  const legacyAudit = evaluateProfiles(audit, (season) => legacyProfiles(season, args.baselines));
  const candidateSelection = candidates.map((coefficients) => {
    const developmentMetrics=evaluateProfiles(development, (season) => transitionProfiles(season, args.baselines, coefficients));
    const validationMetrics=evaluateProfiles(validation, (season) => transitionProfiles(season, args.baselines, coefficients));
    return{
    coefficients,
    developmentMetrics,
    validationMetrics,
    selectionScore:.7*developmentMetrics.objective+.3*validationMetrics.objective,
  };}).sort((left, right) => left.selectionScore - right.selectionScore);
  const selected = candidateSelection[0];
  const legacyAll = evaluateProfiles(completed, (season) => legacyProfiles(season, args.baselines));
  const newAudit = evaluateProfiles(audit, (season) => transitionProfiles(season, args.baselines, selected.coefficients));
  const newAll = evaluateProfiles(completed, (season) => transitionProfiles(season, args.baselines, selected.coefficients));
  return {
    methodology: {
      leakageControl: "Every target season uses only prior-season final profiles, older completed profiles, that season's published preseason inputs, and the prior season's result-only final Elo. Development seasons fit the grid, the next season selects among candidates, and the latest completed season is audit-only.",
      developmentSeasons: development.map((season) => season.season),
      validationSeason,
      auditSeason,
      candidateCount: candidates.length,
      selectionObjective: "70% multi-season development objective + 30% next-season validation objective. Each objective is 30% Weeks 1–4 margin MAE, 8% early score MAE, 12% static full-season margin MAE, 15% next-final H+ MAE, 8% Brier, 10% winner error and 17% elite/average/poor bias.",
      gameScope: "Completed FBS-vs-FBS regular-season and conference-championship games. Postseason is excluded from game-error scoring but included in the previous season's final result-only Elo.",
      advancedCoverage: "Advanced profiles are excluded from coefficient selection because archive coverage differs by year; the production transition still applies the selected state transition to available advanced indices.",
    },
    oldFormula: "40% previous final profile + 30% two years back + 20% three years back + 10% four years back, followed by 84–93% roster proof shrinkage; preseason Elo rebuilt from that already-regressed profile.",
    newFormula: "m_pre = m_prev + lambda * (programWeight * stability * m_program - m_prev) + rosterAdjustment on the log-index scale; Elo_pre = Elo(profile_pre) + residualPersistence * (Elo_prev_final - Elo(profile_prev)).",
    selectedCoefficients: selected.coefficients,
    development: { legacy: roundMetrics(legacyDevelopment), stateTransition: roundMetrics(selected.developmentMetrics) },
    validation: { legacy: roundMetrics(legacyValidation), stateTransition: roundMetrics(selected.validationMetrics) },
    audit: { legacy: roundMetrics(legacyAudit), stateTransition: roundMetrics(newAudit) },
    allSeasons: { legacy: roundMetrics(legacyAll), stateTransition: roundMetrics(newAll) },
    leadingCandidates:candidateSelection.slice(0,8).map((row)=>({
      coefficients:row.coefficients,
      selectionScore:Number(row.selectionScore.toFixed(4)),
      development:roundMetrics(row.developmentMetrics),
      validation:roundMetrics(row.validationMetrics),
    })),
    diagnostics: args.currentSeason ? diagnosticRows(args.currentSeason, args.baselines, selected.coefficients) : [],
    historicalDiagnostics: audit[0] ? diagnosticRows(audit[0], args.baselines, selected.coefficients) : [],
  };
}
