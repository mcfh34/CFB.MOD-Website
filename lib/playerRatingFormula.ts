export type PlayerRatingCompositeInputs = {
  /** Position family; QB enables passing-volume proof rules. */
  position?: string;
  /** Legacy counting-production score, compressed before it enters the grade. */
  volumeScore: number;
  /** Player average predicted points added per play. */
  averagePpa: number | null;
  /** Successful-play rate expressed from 0–1. */
  successRate: number | null;
  /** Position-specific per-opportunity efficiency expressed from 0–1. */
  boxEfficiency: number | null;
  /**
   * A second, position-specific efficiency signal. For running backs this is
   * the run-space proxy (player YPC plus opponent-adjusted second-level and
   * open-field team output). It is optional because CFBD does not publish the
   * same advanced fields for every position and season.
   */
  secondaryEfficiency?: number | null;
  /** Relevant attempts, touches, receptions, tackles or kicks. */
  opportunities: number;
  /** QB pass attempts. Rushing attempts cannot substitute for passing proof. */
  passAttempts?: number;
  /** Opponent quality expressed from 0–1. */
  competitionQuality: number;
  /** Output versus what the exact opponent units normally allow, 0.5 = expected. */
  opponentRelativeProduction?: number;
  /** Strength of the position-specific units faced, 0.5 = FBS average. */
  opponentUnitQuality?: number;
  /** Share of the team offense directly involving the player. */
  usageRate?: number | null;
  /** Quality of the complementary phase; low values identify constrained offenses. */
  supportQuality?: number;
};

export type PlayerRatingCompositeBreakdown = {
  score: number;
  quality: number;
  opponentProof: number;
  workload: number;
  sampleProof: number;
  reliability: number;
};

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

/**
 * Harper+ player grade v8.
 *
 * Ratings measure proven output, not counting totals in isolation. Per-play
 * value, success and position efficiency are regressed by a position-specific
 * sample. Actual output versus opponent-unit averages and the strength of the
 * units faced enter before the all-era percentile is assigned. Productive,
 * high-usage players earn a carry bonus; efficient quarterbacks can also earn
 * a small context credit when the run game cannot keep the offense balanced.
 * Each position receives its own quality blend. Exact output versus the units
 * on the schedule carries substantially more weight than a conference label,
 * while unit strength remains a smaller separator. Rate statistics are
 * regressed by position-specific sample size: a productive reserve can grade
 * well, but a short hot streak cannot rank with an elite full-season sample.
 */
export function playerRatingCompositeBreakdown(
  input: PlayerRatingCompositeInputs,
): PlayerRatingCompositeBreakdown {
  const position = input.position?.toUpperCase() ?? "";
  const isQuarterback = position === "QB";
  const passAttempts = Math.max(0, input.passAttempts ?? 0);
  const volumeTargets: Record<string, number> = {
    QB: 440,
    RB: 400,
    WR: 380,
    TE: 220,
    EDGE: 200,
    DL: 185,
    LB: 220,
    CB: 150,
    S: 190,
    K: 150,
    P: 190,
  };
  const volume = clamp(Math.max(0, input.volumeScore) / (volumeTargets[position] ?? 200));
  const proofTargets: Record<string, number> = {
    QB: 300,
    RB: 260,
    WR: 80,
    TE: 55,
    EDGE: 135,
    DL: 135,
    LB: 150,
    CB: 110,
    S: 135,
    K: 28,
    P: 55,
  };
  const reliabilityDenominators: Record<string, number> = {
    QB: 160,
    RB: 110,
    WR: 42,
    TE: 32,
    EDGE: 65,
    DL: 65,
    LB: 70,
    CB: 55,
    S: 65,
    K: 12,
    P: 25,
  };
  const reliabilityOpportunities = isQuarterback ? passAttempts : Math.max(0, input.opportunities);
  const reliabilityDenominator = reliabilityDenominators[position] ?? 50;
  const reliability = clamp(
    reliabilityOpportunities / (reliabilityOpportunities + reliabilityDenominator),
  );
  const sampleProof = clamp(reliabilityOpportunities / (proofTargets[position] ?? 100));
  const regress = (value: number) => 0.5 + reliability * (clamp(value) - 0.5);
  const ppa = input.averagePpa === null
    ? null
    : regress((input.averagePpa + 0.15) / 0.9);
  const success = input.successRate === null
    ? null
    : regress((input.successRate - 0.25) / 0.4);
  const box = input.boxEfficiency === null ? null : regress(input.boxEfficiency);
  const secondary = input.secondaryEfficiency === null || input.secondaryEfficiency === undefined
    ? null
    : regress(input.secondaryEfficiency);
  const competition = clamp(input.competitionQuality);
  const opponentRelative = clamp(input.opponentRelativeProduction ?? competition);
  const opponentUnitQuality = clamp(input.opponentUnitQuality ?? competition);
  const supportQuality = clamp(input.supportQuality ?? .5);
  const usageTargets: Record<string, number> = { QB:.78,RB:.45,WR:.30,TE:.24 };
  const suppliedUsage = input.usageRate;
  const usage = suppliedUsage === null || suppliedUsage === undefined
    ? volume
    : clamp(suppliedUsage / (usageTargets[position] ?? .35));

  const qualityWeights: Record<string, readonly [number, number, number, number]> = {
    QB:[.34,.22,.44,0],
    RB:[.28,.25,.32,.15],
    WR:[.30,.22,.48,0],
    TE:[.27,.22,.51,0],
    EDGE:[0,0,1,0],
    DL:[0,0,1,0],
    LB:[0,0,1,0],
    CB:[0,0,1,0],
    S:[0,0,1,0],
    K:[0,0,1,0],
    P:[0,0,1,0],
  };
  const [ppaWeight,successWeight,boxWeight,secondaryWeight] = qualityWeights[position] ?? [.25,.20,.55,0];
  const suppliedQualityWeight = (ppa === null ? 0 : ppaWeight)
    +(success === null ? 0 : successWeight)
    +(box === null ? 0 : boxWeight)
    +(secondary === null ? 0 : secondaryWeight);
  const provenQuality = suppliedQualityWeight > 0
    ? (
      (ppa ?? 0)*ppaWeight
      +(success ?? 0)*successWeight
      +(box ?? 0)*boxWeight
      +(secondary ?? 0)*secondaryWeight
    )/suppliedQualityWeight
    : .5;
  const opponentProof = clamp(
    .5 + reliability * (
      .78 * (opponentRelative - .5)
      + .20 * (opponentUnitQuality - .5)
      + .02 * (competition - .5)
    ),
  );
  const usageWeights: Record<string, number> = { QB:.22,RB:.28,WR:.34,TE:.30 };
  const usageWeight = usageWeights[position] ?? 0;
  const workload = (1-usageWeight)*volume+usageWeight*usage;
  const provenVolume = .62*workload+.38*sampleProof;
  const qualityAboveGood = clamp((provenQuality - .55) / .45);
  const qualityAboveAverage = clamp((provenQuality - .5) / .5);
  const workhorseBonusMax: Record<string,number> = {
    QB:.06,RB:.20,WR:.08,TE:.08,EDGE:.06,DL:.06,LB:.06,CB:.06,S:.06,K:.04,P:.04,
  };
  const workhorseBonus = (workhorseBonusMax[position] ?? .06)
    * sampleProof
    * clamp((volume - .72) / .28)
    * (.5 + .5 * qualityAboveAverage);
  const constraintBonus = ["QB", "WR", "TE"].includes(position)
    ? .025 * sampleProof * usage * clamp((.5 - supportQuality) / .5) * qualityAboveGood
    : 0;
  const weights = position === "K" || position === "P"
    ? { quality:.44,opponent:.14,volume:.42 }
    : ["EDGE","DL","LB","CB","S"].includes(position)
      ? { quality:.35,opponent:.34,volume:.31 }
      : { quality:.34,opponent:.32,volume:.34 };
  const dominance = weights.quality*provenQuality
    +weights.opponent*opponentProof
    +weights.volume*provenVolume;
  // Short samples remain visible, but they cannot occupy the same score range
  // as a complete season solely because of a handful of efficient plays.
  const proofMultiplier = .38+.62*sampleProof;
  const breakoutBonus = .035*sampleProof
    *clamp((provenQuality-.68)/.32)
    *clamp((opponentProof-.60)/.40);
  const score = Number((100*clamp(
    (dominance+workhorseBonus+constraintBonus+breakoutBonus)*proofMultiplier,
  )).toFixed(3));
  return { score,quality:provenQuality,opponentProof,workload,sampleProof,reliability };
}

export function playerRatingCompositeScore(input: PlayerRatingCompositeInputs) {
  return playerRatingCompositeBreakdown(input).score;
}
