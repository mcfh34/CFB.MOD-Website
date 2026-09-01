import {
  observedPlayerProductionScore,
  productionPosition,
  type PlayerProfile,
  type TeamPlayerModel,
} from "./playerModel";

export type ProductionScaleBin = {
  position: string;
  rating: number;
  minScore: number;
  maxScore: number;
  sampleSize: number;
};

export type ProductionProjectionCohort = {
  position: string;
  stars: number | null;
  ratingBand: number | null;
  expectedRating: number;
  sampleSize: number;
};

export type PlayerProductionBaseline = {
  firstSeason: number;
  lastSeason: number;
  playerSeasonCount: number;
  scale: ProductionScaleBin[];
  cohorts: ProductionProjectionCohort[];
  scaleCalibrationVersion?: number;
  modelVersion?: number;
  currentGenerationReady?: boolean;
};

export type PlayerRatingOrderEvidence = {
  overall: number;
  ratingPercentile: number | null;
  source?: "OBSERVED" | "PROJECTED" | "UNIT" | "UNAVAILABLE";
  recruitingRating: number | null;
  recruitingStars: number | null;
  team: string;
  name: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export type PlayerOverallTier = {
  key: "all-era" | "elite" | "great" | "very-good" | "decent" | "starter" | "below-average" | "liability";
  label: string;
  range: string;
  description: string;
};

/** The public 50–99 vocabulary. The overlapping user shorthand is resolved as 80–84 and 85–89. */
export function playerOverallTier(overall: number): PlayerOverallTier {
  const rating = clamp(Math.round(overall), 50, 99);
  if (rating >= 98) return { key:"all-era", label:"ELITE OF THE ELITE", range:"98–99", description:"A defining all-era season." };
  if (rating >= 95) return { key:"elite", label:"ELITE", range:"95–97", description:"One of the best players in the country." };
  if (rating >= 90) return { key:"great", label:"GREAT", range:"90–94", description:"A great player, below the true elite tier." };
  if (rating >= 85) return { key:"very-good", label:"VERY GOOD", range:"85–89", description:"A major positive starter." };
  if (rating >= 80) return { key:"decent", label:"DECENT", range:"80–84", description:"A dependable FBS contributor." };
  if (rating >= 70) return { key:"starter", label:"STARTER", range:"70–79", description:"Starter-level production without a major advantage." };
  if (rating >= 60) return { key:"below-average", label:"BELOW AVG", range:"60–69", description:"Below-average production from a player who may still start." };
  return { key:"liability", label:"LIABILITY", range:"50–59", description:"Production that makes the unit less effective." };
}

/**
 * Scarcity-calibrated 50–99 translation for a same-position historical
 * percentile. A 99 is limited to the top 0.1%, 95+ to the top 1%, 90+ to the
 * top 4%, 85+ to the top 12%, and 80+ to the top 30%. A median observed season
 * is a 76 instead of being inflated into the 90s.
 */
export function productionOverallFromPercentile(percentile: number) {
  const value = clamp(percentile, 0, 1);
  if (value >= .999) return 99;
  if (value >= .9975) return 98;
  if (value >= .995) return 97;
  if (value >= .9925) return 96;
  if (value >= .990) return 95;
  if (value >= .985) return 94;
  if (value >= .980) return 93;
  if (value >= .975) return 92;
  if (value >= .970) return 91;
  if (value >= .960) return 90;
  if (value >= .945) return 89;
  if (value >= .930) return 88;
  if (value >= .915) return 87;
  if (value >= .900) return 86;
  if (value >= .880) return 85;
  if (value >= .850) return 84;
  if (value >= .820) return 83;
  if (value >= .790) return 82;
  if (value >= .750) return 81;
  if (value >= .700) return 80;
  if (value >= .650) return 79;
  if (value >= .600) return 78;
  if (value >= .550) return 77;
  if (value >= .500) return 76;
  if (value >= .450) return 75;
  if (value >= .400) return 74;
  if (value >= .350) return 73;
  if (value >= .300) return 72;
  if (value >= .250) return 71;
  if (value >= .200) return 70;
  if (value >= .180) return 69;
  if (value >= .160) return 68;
  if (value >= .140) return 67;
  if (value >= .120) return 66;
  if (value >= .100) return 65;
  if (value >= .080) return 64;
  if (value >= .060) return 63;
  if (value >= .045) return 62;
  if (value >= .030) return 61;
  if (value >= .020) return 60;
  if (value >= .015) return 59;
  if (value >= .012) return 58;
  if (value >= .009) return 57;
  if (value >= .006) return 56;
  if (value >= .004) return 55;
  if (value >= .003) return 54;
  if (value >= .002) return 53;
  if (value >= .001) return 52;
  if (value >= .0005) return 51;
  return 50;
}

/**
 * A single-season fallback can order real production while the historical
 * baseline is rebuilding, but it cannot prove an all-era 99. Keep its ceiling
 * at 98 until the complete 2014-present comparison set is available.
 */
export function provisionalProductionOverallFromPercentile(percentile: number) {
  return Math.min(98, productionOverallFromPercentile(percentile));
}

/** Tie-aware empirical percentiles for compact unit populations such as OL. */
export function empiricalProductionPercentiles(
  entries: readonly { key: string; score: number }[],
) {
  const valid = entries
    .filter((entry) => entry.key && Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.key.localeCompare(right.key));
  const percentiles = new Map<string, number>();
  for (let index = 0; index < valid.length;) {
    let end = index + 1;
    while (end < valid.length && valid[end].score === valid[index].score) end += 1;
    const percentile = (index + 1 + (end - index - 1) / 2) / valid.length;
    for (let cursor = index; cursor < end; cursor += 1) {
      percentiles.set(valid[cursor].key, percentile);
    }
    index = end;
  }
  return percentiles;
}

/**
 * Returns a continuous same-position percentile for ordering players who share
 * the same displayed 50–99 grade. Baseline rows retain their sample counts and
 * score ranges, so ties can be resolved by production evidence instead of a
 * player's name.
 */
export function productionPercentileFromScale(
  position: string,
  score: number,
  scale: readonly ProductionScaleBin[],
) {
  const bins = scale
    .filter((row) => row.position === position && row.sampleSize > 0)
    .sort((left, right) => left.minScore - right.minScore || left.maxScore - right.maxScore || left.rating - right.rating);
  if (!bins.length || !Number.isFinite(score)) return null;
  const total = bins.reduce((sum, row) => sum + row.sampleSize, 0);
  if (total <= 0) return null;
  let below = 0;
  for (const bin of bins) {
    if (score <= bin.maxScore) {
      const span = bin.maxScore - bin.minScore;
      const within = span > 0 ? clamp((score - bin.minScore) / span, 0, 1) : .5;
      return clamp((below + within * bin.sampleSize) / total, 0, 1);
    }
    below += bin.sampleSize;
  }
  return 1;
}

/** Best-to-worst ordering inside a displayed grade; names are last only. */
export function comparePlayerRatingEvidence(
  left: PlayerRatingOrderEvidence,
  right: PlayerRatingOrderEvidence,
) {
  const sourceWeight = (source: PlayerRatingOrderEvidence["source"]) =>
    source === "OBSERVED" || source === "UNIT" ? 2 : source === "PROJECTED" ? 1 : 0;
  return right.overall - left.overall
    || sourceWeight(right.source) - sourceWeight(left.source)
    || (right.ratingPercentile ?? -1) - (left.ratingPercentile ?? -1)
    || (right.recruitingRating ?? -1) - (left.recruitingRating ?? -1)
    || (right.recruitingStars ?? -1) - (left.recruitingStars ?? -1)
    || left.name.localeCompare(right.name)
    || left.team.localeCompare(right.team);
}

/**
 * Convert a cohort average stored under the former generous calibration back
 * to its approximate historical percentile before applying the scarce scale.
 */
function formerOverallToPercentile(rating: number) {
  if (rating >= 99) return .9995;
  if (rating >= 98) return .997;
  if (rating >= 97) return .990;
  if (rating >= 96) return .9775;
  if (rating >= 95) return .960;
  return clamp((rating - 50) * .95 / 44, 0, .9499);
}

function legacyRatingToOverall(rating: number) {
  const approximatePercentile = clamp((rating - .5) / 98, 0, .9989);
  return productionOverallFromPercentile(approximatePercentile);
}

/**
 * Offensive line remains one team-unit grade. The raw line/protection index is
 * combined with actual output versus each opponent's normal allowance, the
 * complementary passing output and the quality of the fronts faced. Equal raw
 * production therefore earns more against a difficult slate than a weak one.
 */
export function opponentAdjustedOffensiveLineScore(
  score: number,
  rushOutputVsOpponent: number,
  passOutputVsOpponent: number,
  opponentUnitQuality: number,
) {
  const ratioIndex = (value: number) => .75 + .5 * clamp(value, 0, 1);
  return .35 * score
    + .45 * ratioIndex(rushOutputVsOpponent)
    + .10 * ratioIndex(passOutputVsOpponent)
    + .10 * ratioIndex(opponentUnitQuality);
}

function normalizedRecruitingRating(player: Pick<PlayerProfile, "recruitingRating">) {
  const raw = player.recruitingRating;
  if (raw === null || !Number.isFinite(raw)) return null;
  return raw <= 1.5 ? raw * 100 : raw;
}

export function recruitingRatingBand(player: Pick<PlayerProfile, "recruitingRating">) {
  const rating = normalizedRecruitingRating(player);
  return rating === null ? null : Math.round(rating / 2) * 2;
}

/**
 * Maps an observed production score into its empirical position distribution.
 * The final grade is always calculated from the population counts and score
 * ranges, so a calibration-only update does not require rebuilding 86k stable
 * player-season component scores.
 */
export function productionRatingFromScale(
  position: string,
  score: number,
  scale: readonly ProductionScaleBin[],
) {
  const positionBins = scale.filter((row) => row.position === position);
  if (positionBins.some((row) => row.rating < 50)) {
    const matched = [...positionBins]
      .sort((left, right) => left.maxScore - right.maxScore || left.rating - right.rating)
      .find((row) => score <= row.maxScore);
    return matched ? legacyRatingToOverall(Math.round(matched.rating)) : null;
  }
  const percentile = productionPercentileFromScale(position, score, scale);
  return percentile === null ? null : productionOverallFromPercentile(percentile);
}

export function projectedProductionRating(
  player: Pick<PlayerProfile, "position" | "positionGroup" | "recruitingStars" | "recruitingRating" | "ratingSource">,
  cohorts: readonly ProductionProjectionCohort[],
  legacyScale = false,
  scaleCalibrationVersion = 1,
) {
  const position = productionPosition(player as PlayerProfile);
  const stars = player.recruitingStars;
  const ratingBand = recruitingRatingBand(player);
  if (stars === null && ratingBand === null) return null;
  const positionRows = cohorts.filter((row) => row.position === position && row.sampleSize >= 3);
  if (!positionRows.length) return null;
  const exactRows = positionRows.filter((row) =>
    (stars === null || row.stars === stars)
    && (ratingBand === null || row.ratingBand === ratingBand),
  );
  if (exactRows.length) {
    const sample = exactRows.reduce((sum, row) => sum + row.sampleSize, 0);
    const expected = exactRows.reduce((sum, row) => sum + row.expectedRating * row.sampleSize, 0) / sample;
    if (legacyScale) return legacyRatingToOverall(expected);
    return scaleCalibrationVersion >= 2
      ? clamp(Math.round(expected), 50, 99)
      : productionOverallFromPercentile(formerOverallToPercentile(expected));
  }

  const distance = (row: ProductionProjectionCohort) => {
    const starDistance = stars === null || row.stars === null ? 2 : Math.abs(row.stars - stars);
    const ratingDistance = ratingBand === null || row.ratingBand === null ? 8 : Math.abs(row.ratingBand - ratingBand);
    return starDistance * 12 + ratingDistance;
  };
  const nearby = [...positionRows].sort((left, right) => distance(left) - distance(right) || right.sampleSize - left.sampleSize).slice(0, 5);
  const weighted = nearby.map((row) => ({
    value: row.expectedRating,
    weight: Math.min(50, row.sampleSize) / (1 + distance(row)),
  }));
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return null;
  const expected = weighted.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;
  if (legacyScale) return legacyRatingToOverall(expected);
  return scaleCalibrationVersion >= 2
    ? clamp(Math.round(expected), 50, 99)
    : productionOverallFromPercentile(formerOverallToPercentile(expected));
}

export function applyPlayerProductionRatings(
  model: TeamPlayerModel,
  baseline: PlayerProductionBaseline,
  offensiveLineUnitRating: number | null,
  observedScores: ReadonlyMap<string, number> = new Map(),
  provisionalPercentiles: ReadonlyMap<string,number> = new Map(),
) {
  const historicalScaleReady=baseline.currentGenerationReady!==false;
  const ratedPlayers = model.players.map((player): PlayerProfile => {
    const position = productionPosition(player);
    if (position === "OL") {
      return {
        ...player,
        productionScore: null,
        productionRating: offensiveLineUnitRating,
        productionRatingSource: offensiveLineUnitRating === null ? "UNAVAILABLE" : "UNIT",
        productionRatingEvidence: offensiveLineUnitRating === null
          ? "No opponent-adjusted offensive-line sample"
          : `Team-unit output versus opponent allowance on the ${baseline.firstSeason}–${baseline.lastSeason} FBS offensive-line scale`,
      };
    }

    const productionScore = observedScores.get(player.id)
      ?? player.productionScore
      ?? observedPlayerProductionScore(player);
    if (productionScore !== null) {
      const provisionalPercentile=provisionalPercentiles.get(player.id);
      const productionRating = historicalScaleReady
        ? productionRatingFromScale(position, productionScore, baseline.scale)
        : provisionalPercentile===undefined
          ? null
          : provisionalProductionOverallFromPercentile(provisionalPercentile);
      return {
        ...player,
        productionScore,
        productionRating,
        productionRatingSource: productionRating === null ? "UNAVAILABLE" : "OBSERVED",
        productionRatingEvidence: productionRating === null
          ? "A comparable same-position production population is not ready"
          : historicalScaleReady
            ? `${baseline.firstSeason}–${baseline.lastSeason} ${position} efficiency, success and opponent-adjusted production percentile · ${baseline.playerSeasonCount.toLocaleString()} player-seasons`
            : `${model.season} ${position} production percentile while the all-era scale is rebuilding`,
      };
    }

    const productionRating = projectedProductionRating(
      player,
      baseline.cohorts,
      baseline.scale.some((row) => row.rating < 50),
      baseline.scaleCalibrationVersion ?? 1,
    );
    return {
      ...player,
      productionScore: null,
      productionRating,
      productionRatingSource: productionRating === null ? "UNAVAILABLE" : "PROJECTED",
      productionRatingEvidence: productionRating === null
        ? "No production sample or comparable recruiting cohort"
        : `${position} projection from historical players with a comparable ${player.ratingSource === "TRANSFER" ? "transfer" : "recruiting"} evaluation`,
    };
  });
  const byId = new Map(ratedPlayers.map((player) => [player.id, player]));
  return {
    ...model,
    offensiveLineUnitRating,
    offensiveLineUnitEvidence: offensiveLineUnitRating === null
      ? "No opponent-adjusted unit sample"
      : `${baseline.firstSeason}–${baseline.lastSeason} FBS offensive-line output-versus-opponent percentile`,
    players: ratedPlayers,
    depthChart: model.depthChart.map((group) => ({
      ...group,
      players: group.players.map((player) => byId.get(player.id) ?? player),
    })),
  };
}
