export type MarketLineCandidate = {
  provider: string | null;
  spread: number | null;
  spreadOpen: number | null;
  formattedSpread: string | null;
  overUnder: number | null;
  overUnderOpen: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

export type MarketLineQuality = "verified" | "provisional" | "quarantined";

export type MarketLineSelection = MarketLineCandidate & {
  quality: MarketLineQuality;
  qualityReason: string;
};

export type ConfidenceInterval = {
  low: number | null;
  high: number | null;
  level: 0.95;
};

const LEGACY_START = 2014;
const LEGACY_END = 2016;

const providerName = (provider: string | null | undefined) => (provider ?? "").trim().toLowerCase();
const isNumber = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const sign = (value: number) => value > 0 ? 1 : value < 0 ? -1 : 0;

const providerOrder = (season: number) => season <= LEGACY_END
  ? ["teamrankings", "numberfire", "draftkings", "espn bet", "fanduel", "betmgm", "bovada", "consensus"]
  : season >= 2023
    ? ["draftkings", "espn bet", "fanduel", "betmgm", "caesars", "bovada", "consensus", "teamrankings", "numberfire"]
    : ["consensus", "draftkings", "espn bet", "fanduel", "betmgm", "bovada", "teamrankings", "numberfire"];

function providerRank(season: number, provider: string | null) {
  const normalized = providerName(provider);
  const order = providerOrder(season);
  const exact = order.indexOf(normalized);
  if (exact >= 0) return exact;
  const partial = order.findIndex((name) => normalized.includes(name));
  return partial >= 0 ? partial : order.length + 10;
}

function favoriteConsensus(candidates: MarketLineCandidate[]) {
  const providerVotes = new Map<string, -1 | 1>();
  candidates.forEach((candidate, index) => {
    if (!isNumber(candidate.spread) || candidate.spread === 0) return;
    const provider = providerName(candidate.provider) || `unknown-${index}`;
    providerVotes.set(provider, sign(candidate.spread) as -1 | 1);
  });
  const positive = [...providerVotes.values()].filter((vote) => vote === 1).length;
  const negative = [...providerVotes.values()].filter((vote) => vote === -1).length;
  if (positive >= 2 && positive > negative) return 1;
  if (negative >= 2 && negative > positive) return -1;
  return 0;
}

function candidateScore(season: number, candidate: MarketLineCandidate) {
  const missingSpread = isNumber(candidate.spread) ? 0 : 100;
  const missingTotal = isNumber(candidate.overUnder) ? 0 : 12;
  return missingSpread + missingTotal + providerRank(season, candidate.provider);
}

/**
 * Selects one internally consistent market source. Early ESPN "consensus"
 * rows are never accepted without independent provider support because the
 * 2014-16 archive contains documented favorite reversals. When two or more
 * providers agree on the favorite, a conflicting preferred source is replaced
 * by the best aligned source instead of silently manufacturing a huge edge.
 */
export function selectMarketLineCandidate(season: number, candidates: MarketLineCandidate[]): MarketLineSelection | null {
  const usable = candidates.filter((candidate) => isNumber(candidate.spread) || isNumber(candidate.overUnder));
  if (!usable.length) return null;

  const majorityFavorite = favoriteConsensus(usable);
  const sorted = [...usable].sort((left, right) => candidateScore(season, left) - candidateScore(season, right));
  const aligned = majorityFavorite === 0
    ? sorted
    : sorted.filter((candidate) => !isNumber(candidate.spread) || candidate.spread === 0 || sign(candidate.spread) === majorityFavorite);
  const selected = aligned[0] ?? sorted[0];
  const earlyLegacy = season >= LEGACY_START && season <= LEGACY_END;
  const consensusOnly = earlyLegacy
    && providerName(selected.provider) === "consensus"
    && !usable.some((candidate) => providerName(candidate.provider) !== "consensus" && isNumber(candidate.spread));

  if (consensusOnly) {
    return {
      ...selected,
      spread: null,
      spreadOpen: null,
      formattedSpread: null,
      overUnder: null,
      overUnderOpen: null,
      homeMoneyline: null,
      awayMoneyline: null,
      quality: "quarantined",
      qualityReason: "2014-16 consensus line lacks independent provider confirmation",
    };
  }

  const providerDisagreement = majorityFavorite !== 0
    && isNumber(selected.spread)
    && selected.spread !== 0
    && sign(selected.spread) !== majorityFavorite;
  if (providerDisagreement) {
    return {
      ...selected,
      spread: null,
      spreadOpen: null,
      formattedSpread: null,
      quality: "quarantined",
      qualityReason: "Favorite direction conflicts with the multi-provider market consensus",
    };
  }

  return {
    ...selected,
    quality: earlyLegacy ? "provisional" : "verified",
    qualityReason: earlyLegacy
      ? "Legacy line retained from an independently supported provider"
      : majorityFavorite ? "Favorite direction confirmed across providers" : "Preferred market provider",
  };
}

export function isStoredMarketLineQuarantined(season: number, provider: string | null | undefined) {
  return season >= LEGACY_START && season <= LEGACY_END && providerName(provider) === "consensus";
}

export function marketLineSeasonStatus(season: number): "live" | "provisional" {
  return season >= LEGACY_START && season <= LEGACY_END ? "provisional" : "live";
}

/** Wilson score interval for a binomial hit rate. */
export function wilsonConfidenceInterval(wins: number, losses: number): ConfidenceInterval {
  const sample = Math.max(0, wins) + Math.max(0, losses);
  if (!sample) return { low: null, high: null, level: 0.95 };
  const z = 1.959963984540054;
  const rate = Math.max(0, wins) / sample;
  const denominator = 1 + z * z / sample;
  const center = (rate + z * z / (2 * sample)) / denominator;
  const half = z * Math.sqrt(rate * (1 - rate) / sample + z * z / (4 * sample * sample)) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), level: 0.95 };
}
