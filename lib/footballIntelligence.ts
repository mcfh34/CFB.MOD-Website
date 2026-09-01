import type { AdvancedMetricKey, AdvancedProfile, AdvancedSideProjection } from "./advancedMetrics";
import type { TeamPlayerModel } from "./playerModel";

export type FootballProfile = {
  season: number;
  week: number;
  team: string;
  gamesPlayed: number;
  offYppIndex: number;
  offYpaIndex: number;
  offYpcIndex: number;
  offPattIndex: number;
  offRattIndex: number;
  defYppIndex: number;
  defYpaIndex: number;
  defYpcIndex: number;
  defPattIndex: number;
  defRattIndex: number;
  offPatt?: number;
  offRatt?: number;
  eloRating?: number;
  matchupReliability?: number;
  advancedProfile?: AdvancedProfile | null;
  returningPpa?: number | null;
  returningPassingPpa?: number | null;
  returningReceivingPpa?: number | null;
  returningRushingPpa?: number | null;
  returningUsage?: number | null;
  returningPassingUsage?: number | null;
  returningReceivingUsage?: number | null;
  returningRushingUsage?: number | null;
  recruitingRank?: number | null;
  recruitingPoints?: number | null;
};

export type IdentityRead = {
  label: string;
  detail: string;
  confidence: "DEVELOPING" | "SOLID" | "HIGH";
};

export type TeamIdentity = {
  offense: IdentityRead;
  defense: IdentityRead;
  specialTeams: IdentityRead;
};

export type StabilityRead = {
  volatility: number;
  volatilityLabel: "VERY STABLE" | "MODERATELY VOLATILE" | "HIGH VARIANCE" | "BOOM-OR-BUST";
  consistency: number;
  consistencyLabel: "VERY CONSISTENT" | "RELIABLE" | "VARIABLE" | "UNSTABLE";
  confidence: "DEVELOPING" | "SOLID" | "HIGH";
  drivers: string[];
};

export type RosterStability = {
  score: number;
  label: "CONTINUITY STRENGTH" | "STABLE CORE" | "TRANSITIONING" | "REBUILD RISK";
  confidence: "DEVELOPING" | "SOLID" | "HIGH";
  drivers: string[];
};

export type MovementComponent = {
  label: "PASSING" | "RUSHING" | "DEFENSE" | "SPECIAL TEAMS";
  change: number;
};

export type TeamMovement = {
  previousRating: number | null;
  currentRating: number;
  change: number | null;
  components: MovementComponent[];
  explanations: string[];
};

export type HistoricalComparison = {
  season: number;
  team: string;
  similarity: number;
  sharedTrait: string;
};

export type AdvantageMagnitude = "NEUTRAL" | "MINOR EDGE" | "MODERATE EDGE" | "MAJOR EDGE" | "GAME DEFINING";

export type MatchupAdvantageCard = {
  id: string;
  label: string;
  offenseTeam: string;
  defenseTeam: string;
  score: number;
  edgeTeam: string | null;
  edgeSide: "OFFENSE" | "DEFENSE" | "NEUTRAL";
  magnitude: AdvantageMagnitude;
  confidence: "DEVELOPING" | "SOLID" | "HIGH";
  impact: string;
  drivers: string[];
};

export type MatchupIntelligenceBoard = {
  homeIdentity: TeamIdentity;
  awayIdentity: TeamIdentity;
  homeCards: MatchupAdvantageCard[];
  awayCards: MatchupAdvantageCard[];
  homeBiggestEdge: MatchupAdvantageCard;
  awayBiggestEdge: MatchupAdvantageCard;
  controlTeam: string | null;
  controlReason: string;
  gameShape: "EXPLOSIVE" | "METHODICAL" | "BALANCED";
  gameShapeBenefit: string | null;
  uncertainties: string[];
  summary: string;
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));
const finite = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);
const average = (values: Array<number | null | undefined>, fallback = 1) => {
  const available = values.filter(finite);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : fallback;
};
const geometric = (values: Array<{ value: number | null | undefined; weight?: number }>, fallback = 1) => {
  const available = values.filter((entry): entry is { value: number; weight?: number } => finite(entry.value) && entry.value > 0);
  const weight = available.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  return weight ? Math.exp(available.reduce((sum, entry) => sum + Math.log(entry.value) * (entry.weight ?? 1), 0) / weight) : fallback;
};
const ratio = (value: number | null | undefined, baseline: number | null | undefined, inverse = false) => {
  if (!finite(value) || !finite(baseline) || value <= 0 || baseline <= 0) return null;
  return inverse ? baseline / value : value / baseline;
};
const pct = (value: number | null | undefined) => finite(value) ? `${(value * 100).toFixed(0)}%` : "—";
const num = (value: number | null | undefined, digits = 2) => finite(value) ? value.toFixed(digits) : "—";
const signed = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const indexScore = (index: number) => clamp(50 + 42 * Math.log(Math.max(.25, index)));
const confidenceFor = (games: number, available: number, reliability = 1): "DEVELOPING" | "SOLID" | "HIGH" => {
  const proof = Math.min(1, games / 8) * Math.min(1, available / 4) * clamp(reliability, .35, 1);
  return proof >= .72 ? "HIGH" : proof >= .42 ? "SOLID" : "DEVELOPING";
};
const magnitudeFor = (score: number): AdvantageMagnitude => {
  const edge = Math.abs(score - 50);
  return edge < 4 ? "NEUTRAL" : edge < 9 ? "MINOR EDGE" : edge < 15 ? "MODERATE EDGE" : edge < 22 ? "MAJOR EDGE" : "GAME DEFINING";
};
const advancedIndex = (profile: FootballProfile, side: "offense" | "defense", key: AdvancedMetricKey) =>
  profile.advancedProfile?.[side].index[key] ?? null;
const advancedRaw = (profile: FootballProfile, side: "offense" | "defense", key: AdvancedMetricKey) =>
  profile.advancedProfile?.[side].raw[key] ?? null;
const baseline = (profile: FootballProfile, key: AdvancedMetricKey) => profile.advancedProfile?.baseline[key] ?? null;

function identityConfidence(profile: FootballProfile) {
  return confidenceFor(profile.gamesPlayed, profile.advancedProfile ? profile.advancedProfile.coverage.advancedGames : 0, profile.matchupReliability);
}

export function deriveTeamIdentity(profile: FootballProfile): TeamIdentity {
  const passShare = profile.offPattIndex / Math.max(.01, profile.offPattIndex + profile.offRattIndex);
  const optionVolume = profile.offPattIndex <= .78 && profile.offRattIndex >= 1.14;
  const passSuccess = advancedIndex(profile, "offense", "passingSuccessRate") ?? profile.offYpaIndex;
  const rushSuccess = advancedIndex(profile, "offense", "rushingSuccessRate") ?? profile.offYpcIndex;
  const passExplosive = advancedIndex(profile, "offense", "passingExplosiveness") ?? profile.offYpaIndex;
  const rushExplosive = advancedIndex(profile, "offense", "rushingExplosiveness") ?? profile.offYpcIndex;
  const pace = geometric([{ value: profile.offPattIndex }, { value: profile.offRattIndex }]);
  const offense = optionVolume
    ? { label: "OPTION", detail: "Run volume and constraint football force assignment discipline." }
    : passShare >= .56 && passExplosive >= 1.08
      ? { label: "VERTICAL PASSING", detail: "The offense trades steady volume for field-flipping throws." }
      : passShare >= .56
        ? { label: "AIR RAID", detail: "Pass volume and spacing make the quick game the offensive engine." }
        : pace >= 1.08 && passShare >= .48
          ? { label: "SPREAD TEMPO", detail: "Snap volume and balanced spacing stress defensive communication." }
          : rushSuccess >= 1.08 && profile.offRattIndex >= 1.04
            ? { label: "POWER RUN", detail: "Run efficiency and volume let the offense dictate personnel." }
            : Math.max(passExplosive, rushExplosive) >= 1.12
              ? { label: "EXPLOSIVE", detail: "Chunk gains matter more than long, methodical drives." }
              : average([passSuccess, rushSuccess]) >= 1.06 && Math.max(passExplosive, rushExplosive) < 1.05
                ? { label: "METHODICAL", detail: "Down-to-down efficiency keeps the full call sheet available." }
                : profile.offRattIndex >= 1.08
                  ? { label: "BALL CONTROL", detail: "Run volume, pace control and field position shape the game." }
                  : { label: "BALANCED", detail: "Neither run nor pass volume defines the offense by itself." };

  const havoc = advancedIndex(profile, "defense", "havocRate");
  const frontHavoc = advancedIndex(profile, "defense", "frontSevenHavoc");
  const coverage = geometric([
    { value: profile.defYpaIndex > 0 ? 1 / profile.defYpaIndex : null },
    { value: advancedIndex(profile, "defense", "passingSuccessRate") ? 1 / Number(advancedIndex(profile, "defense", "passingSuccessRate")) : null },
  ]);
  const runStop = geometric([
    { value: profile.defYpcIndex > 0 ? 1 / profile.defYpcIndex : null },
    { value: advancedIndex(profile, "defense", "rushingSuccessRate") ? 1 / Number(advancedIndex(profile, "defense", "rushingSuccessRate")) : null },
  ]);
  const explosivePrevention = geometric([
    { value: advancedIndex(profile, "defense", "passingExplosiveness") ? 1 / Number(advancedIndex(profile, "defense", "passingExplosiveness")) : null },
    { value: advancedIndex(profile, "defense", "rushingExplosiveness") ? 1 / Number(advancedIndex(profile, "defense", "rushingExplosiveness")) : null },
  ]);
  const defense = finite(havoc) && havoc <= .89
    ? { label: "HAVOC CREATOR", detail: "Negative plays and takeaways change the offense's down structure." }
    : finite(frontHavoc) && frontHavoc <= .91
      ? { label: "PRESSURE HEAVY", detail: "Front-seven disruption is the defense's fastest path to control." }
      : coverage >= 1.09
        ? { label: "ELITE COVERAGE", detail: "Tight windows force quarterbacks to earn every completion." }
        : runStop >= 1.09
          ? { label: "RUN STOPPING", detail: "The front closes early-down lanes and creates pass-first downs." }
          : explosivePrevention >= 1.08
            ? { label: "EXPLOSIVE PREVENTION", detail: "The defense concedes patience before it concedes the field." }
            : profile.defYppIndex <= .98 && profile.defYpaIndex >= 1.02
              ? { label: "BEND, DON'T BREAK", detail: "Yards are available, but scoring space becomes tighter." }
              : { label: "BALANCED", detail: "No single defensive trait carries the entire unit." };

  const field = advancedIndex(profile, "offense", "fieldPosition");
  const returns = average([
    advancedIndex(profile, "offense", "puntReturn"),
    advancedIndex(profile, "offense", "kickReturn"),
  ]);
  const punting = advancedIndex(profile, "offense", "netPunting");
  const specialTeams = geometric([{ value: field, weight: 2 }, { value: returns }, { value: punting }]) >= 1.07
    ? { label: "FIELD POSITION WINNER", detail: "Hidden yards consistently shorten the offense's field." }
    : returns >= 1.08
      ? { label: "AGGRESSIVE RETURN TEAM", detail: "Return production creates extra possession value." }
      : finite(punting) && punting >= 1.06
        ? { label: "HIDDEN YARDAGE", detail: "Punting and coverage force opponents to drive farther." }
        : { label: "NEUTRAL", detail: "Special teams projects close to the FBS baseline." };
  const confidence = identityConfidence(profile);
  return {
    offense: { ...offense, confidence },
    defense: { ...defense, confidence },
    specialTeams: { ...specialTeams, confidence },
  };
}

function profilePower(profile: FootballProfile) {
  const offense = geometric([
    { value: profile.offYppIndex, weight: 2 },
    { value: profile.offYpaIndex },
    { value: profile.offYpcIndex },
  ]);
  const defense = geometric([
    { value: profile.defYppIndex > 0 ? 1 / profile.defYppIndex : null, weight: 2 },
    { value: profile.defYpaIndex > 0 ? 1 / profile.defYpaIndex : null },
    { value: profile.defYpcIndex > 0 ? 1 / profile.defYpcIndex : null },
  ]);
  return 50 + 34 * Math.log(geometric([{ value: offense }, { value: defense }]));
}

export function deriveTeamStability(profile: FootballProfile, history: FootballProfile[] = []): StabilityRead {
  const explosive = average([
    advancedIndex(profile, "offense", "explosiveness"),
    advancedIndex(profile, "offense", "passingExplosiveness"),
    advancedIndex(profile, "offense", "rushingExplosiveness"),
  ]);
  const turnover = advancedRaw(profile, "offense", "turnoverMargin");
  const penalties = ratio(advancedRaw(profile, "offense", "penaltyYards"), baseline(profile, "penaltyYards"));
  const havoc = advancedIndex(profile, "offense", "havocRate");
  const pace = geometric([{ value: profile.offPattIndex }, { value: profile.offRattIndex }]);
  const profileVolatility = clamp(
    42
    + 22 * Math.log(Math.max(.4, explosive))
    + 10 * Math.abs(Math.log(Math.max(.5, pace)))
    + 9 * Math.abs(turnover ?? 0)
    + 9 * Math.max(0, (penalties ?? 1) - 1)
    + 8 * Math.max(0, 1 - (havoc ?? 1)),
  );
  const ordered = [...history].filter((row) => row.gamesPlayed > 0).sort((a, b) => a.week - b.week);
  const changes = ordered.slice(1).map((row, index) => profilePower(row) - profilePower(ordered[index]));
  const mean = average(changes, 0);
  const deviation = changes.length > 1
    ? Math.sqrt(changes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / changes.length)
    : 2.8;
  const sampleAdjustment = changes.length >= 4 ? 0 : 6;
  const volatility = Math.round(clamp(.62 * profileVolatility + .38 * clamp(24 + deviation * 9) + sampleAdjustment));
  const consistency = Math.round(clamp(100 - deviation * 10 - Math.max(0, volatility - 55) * .3));
  const volatilityLabel = volatility < 35 ? "VERY STABLE" : volatility < 55 ? "MODERATELY VOLATILE" : volatility < 72 ? "HIGH VARIANCE" : "BOOM-OR-BUST";
  const consistencyLabel = consistency >= 78 ? "VERY CONSISTENT" : consistency >= 62 ? "RELIABLE" : consistency >= 43 ? "VARIABLE" : "UNSTABLE";
  return {
    volatility,
    volatilityLabel,
    consistency,
    consistencyLabel,
    confidence: confidenceFor(profile.gamesPlayed, changes.length, profile.matchupReliability),
    drivers: [
      `${explosive >= 1.08 ? "Chunk-play dependent" : "Drive-to-drive profile"} · ${Math.round(explosive * 100)} explosive index`,
      `${changes.length} weekly changes measured · ${deviation.toFixed(1)} rating-point swing`,
    ],
  };
}

function normalizedPercent(value: number | null | undefined) {
  if (!finite(value)) return null;
  return clamp(value > 1.5 ? value : value * 100);
}

export function deriveRosterStability(profile: FootballProfile, players?: TeamPlayerModel): RosterStability {
  const returning = average([
    normalizedPercent(profile.returningPpa),
    normalizedPercent(profile.returningUsage),
    normalizedPercent(profile.returningPassingPpa),
    normalizedPercent(profile.returningRushingPpa),
  ], 50);
  const starters = players?.depthChart.flatMap((group) => group.players.filter((player) => player.projectedStarter)) ?? [];
  const rated = starters.filter((player) => finite(player.recruitingStars));
  const starterStars = average(rated.map((player) => player.recruitingStars), 3);
  const experience = average(starters.map((player) => player.year), 2.5);
  const transferShare = starters.length ? starters.filter((player) => player.ratingSource === "TRANSFER").length / starters.length : .15;
  const recruiting = finite(profile.recruitingRank)
    ? clamp(100 - (profile.recruitingRank - 1) * 1.45)
    : finite(profile.recruitingPoints) ? clamp((profile.recruitingPoints / 260) * 100) : 50;
  const score = Math.round(clamp(.46 * returning + .2 * recruiting + .17 * clamp((starterStars - 2) * 34) + .17 * clamp((experience - 1) * 32) - transferShare * 8));
  const label = score >= 76 ? "CONTINUITY STRENGTH" : score >= 60 ? "STABLE CORE" : score >= 43 ? "TRANSITIONING" : "REBUILD RISK";
  const available = [profile.returningPpa, profile.returningUsage, profile.recruitingRank, starters.length ? 1 : null].filter(finite).length;
  return {
    score,
    label,
    confidence: confidenceFor(Math.max(profile.gamesPlayed, 4), available, profile.matchupReliability),
    drivers: [
      `${Math.round(returning)}% returning production profile`,
      starters.length ? `${starterStars.toFixed(1)}★ starter average · ${experience.toFixed(1)} class-year average` : "Depth-chart evidence is still building",
    ],
  };
}

function componentRaw(current: FootballProfile, previous: FootballProfile) {
  const logChange = (next: number, before: number, inverse = false) => {
    if (next <= 0 || before <= 0) return 0;
    return Math.log(next / before) * (inverse ? -1 : 1);
  };
  const advancedChange = (key: AdvancedMetricKey, side: "offense" | "defense", inverse = false) => {
    const next = advancedIndex(current, side, key);
    const before = advancedIndex(previous, side, key);
    return finite(next) && finite(before) ? logChange(next, before, inverse) : 0;
  };
  return [
    { label: "PASSING" as const, raw: .65 * logChange(current.offYpaIndex, previous.offYpaIndex) + .35 * advancedChange("passingSuccessRate", "offense") },
    { label: "RUSHING" as const, raw: .65 * logChange(current.offYpcIndex, previous.offYpcIndex) + .35 * advancedChange("rushingSuccessRate", "offense") },
    { label: "DEFENSE" as const, raw: .45 * logChange(current.defYppIndex, previous.defYppIndex, true) + .28 * logChange(current.defYpaIndex, previous.defYpaIndex, true) + .27 * logChange(current.defYpcIndex, previous.defYpcIndex, true) },
    { label: "SPECIAL TEAMS" as const, raw: .6 * advancedChange("fieldPosition", "offense") + .4 * advancedChange("netPunting", "offense") },
  ];
}

export function deriveTeamMovement(current: FootballProfile, previous?: FootballProfile | null): TeamMovement {
  const currentRating = current.eloRating ?? profilePower(current) * 20 + 500;
  if (!previous) return { previousRating: null, currentRating, change: null, components: [], explanations: ["The first available snapshot establishes the baseline."] };
  const previousRating = previous.eloRating ?? profilePower(previous) * 20 + 500;
  const change = currentRating - previousRating;
  const raw = componentRaw(current, previous);
  const rawMagnitude = raw.reduce((sum, component) => sum + Math.abs(component.raw), 0);
  const scale = rawMagnitude > .0001 ? Math.max(4, Math.abs(change)) / rawMagnitude : 0;
  const components = raw.map((component) => ({ label: component.label, change: component.raw * scale }));
  const sorted = [...components].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const explanations = sorted.slice(0, 2).map((component) => {
    const direction = component.change >= 0 ? "improved" : "declined";
    if (component.label === "PASSING") return `Passing ${direction}: ${pct(advancedRaw(current, "offense", "passingSuccessRate"))} success and ${current.offYpaIndex.toFixed(2)} adjusted YPA index.`;
    if (component.label === "RUSHING") return `Rushing ${direction}: ${pct(advancedRaw(current, "offense", "rushingSuccessRate"))} success and ${current.offYpcIndex.toFixed(2)} adjusted YPC index.`;
    if (component.label === "DEFENSE") return `Defense ${direction}: opponents now produce ${Math.round(current.defYppIndex * 100)}% of average per-play output.`;
    return `Field position ${direction}: ${num(advancedRaw(current, "offense", "fieldPosition"), 1)} average starting position.`;
  });
  return { previousRating, currentRating, change, components, explanations };
}

const similarityKeys: Array<{ value: (profile: FootballProfile) => number | null | undefined; weight: number }> = [
  { value: (row) => row.offYppIndex, weight: 2 },
  { value: (row) => row.offYpaIndex, weight: 1.25 },
  { value: (row) => row.offYpcIndex, weight: 1.25 },
  { value: (row) => row.offPattIndex, weight: .65 },
  { value: (row) => row.offRattIndex, weight: .65 },
  { value: (row) => row.defYppIndex, weight: 2 },
  { value: (row) => row.defYpaIndex, weight: 1.25 },
  { value: (row) => row.defYpcIndex, weight: 1.25 },
  { value: (row) => advancedIndex(row, "offense", "successRate"), weight: 1.1 },
  { value: (row) => advancedIndex(row, "offense", "explosiveness"), weight: .9 },
  { value: (row) => advancedIndex(row, "offense", "havocRate"), weight: .75 },
  { value: (row) => advancedIndex(row, "defense", "successRate"), weight: 1.1 },
  { value: (row) => advancedIndex(row, "defense", "explosiveness"), weight: .9 },
];

export function findHistoricalComparisons(current: FootballProfile, candidates: FootballProfile[], limit = 3): HistoricalComparison[] {
  return candidates
    .filter((candidate) => candidate.gamesPlayed >= 4 && candidate.season !== current.season)
    .map((candidate) => {
      let weightedDistance = 0;
      let totalWeight = 0;
      for (const key of similarityKeys) {
        const first = key.value(current);
        const second = key.value(candidate);
        if (!finite(first) || !finite(second) || first <= 0 || second <= 0) continue;
        weightedDistance += (Math.log(first / second) ** 2) * key.weight;
        totalWeight += key.weight;
      }
      const distance = totalWeight ? Math.sqrt(weightedDistance / totalWeight) : 1;
      const similarity = Math.round(clamp(100 * Math.exp(-distance * 3.35)));
      const identity = deriveTeamIdentity(candidate);
      return { season: candidate.season, team: candidate.team, similarity, sharedTrait: identity.offense.label };
    })
    .sort((a, b) => b.similarity - a.similarity || b.season - a.season)
    .slice(0, limit);
}

function mergedBaseline(first: AdvancedProfile | null | undefined, second: AdvancedProfile | null | undefined, key: AdvancedMetricKey) {
  return average([first?.baseline[key], second?.baseline[key]], 0);
}

function advantageCard(
  id: string,
  label: string,
  offenseTeam: string,
  defenseTeam: string,
  index: number,
  games: number,
  available: number,
  reliability: number,
  impact: string,
  drivers: string[],
): MatchupAdvantageCard {
  const score = Math.round(indexScore(index));
  const magnitude = magnitudeFor(score);
  const edgeSide = magnitude === "NEUTRAL" ? "NEUTRAL" : score > 50 ? "OFFENSE" : "DEFENSE";
  return {
    id,
    label,
    offenseTeam,
    defenseTeam,
    score,
    edgeTeam: edgeSide === "OFFENSE" ? offenseTeam : edgeSide === "DEFENSE" ? defenseTeam : null,
    edgeSide,
    magnitude,
    confidence: confidenceFor(games, available, reliability),
    impact,
    drivers,
  };
}

function sideCards(
  offenseTeam: string,
  defenseTeam: string,
  projection: AdvancedSideProjection,
  offenseProfile: FootballProfile,
  defenseProfile: FootballProfile,
) {
  const offenseAdvanced = offenseProfile.advancedProfile;
  const defenseAdvanced = defenseProfile.advancedProfile;
  const base = (key: AdvancedMetricKey) => mergedBaseline(offenseAdvanced, defenseAdvanced, key);
  const volatility = Math.max(deriveTeamStability(offenseProfile).volatility,deriveTeamStability(defenseProfile).volatility);
  const volatilityPenalty = 1 - Math.max(0,volatility-55)*.007;
  const reliability = Math.min(offenseProfile.matchupReliability ?? 1, defenseProfile.matchupReliability ?? 1)*clamp(volatilityPenalty,.65,1);
  const games = Math.min(offenseProfile.gamesPlayed, defenseProfile.gamesPlayed);
  const card = (id: string, label: string, index: number, impact: string, drivers: string[], available = drivers.filter((driver) => !driver.includes("—")).length) =>
    advantageCard(id, label, offenseTeam, defenseTeam, index, games, available, reliability, impact, drivers);
  const runIndex = geometric([
    { value: projection.run.componentIndex, weight: 2 },
    { value: ratio(projection.run.rushingSuccessRate, base("rushingSuccessRate")), weight: 1.5 },
    { value: ratio(projection.run.lineYards, base("lineYards")), weight: 1.2 },
    { value: ratio(projection.run.stuffRate, base("stuffRate"), true), weight: 1 },
  ]);
  const passIndex = geometric([
    { value: projection.pass.componentIndex, weight: 2 },
    { value: ratio(projection.pass.passingSuccessRate, base("passingSuccessRate")), weight: 1.5 },
    { value: ratio(projection.pass.passingPpa, base("passingPpa")), weight: 1 },
    { value: ratio(projection.pass.completionRate, base("completionRate")), weight: .8 },
  ]);
  const protectionIndex = geometric([
    { value: projection.pass.qbEfficiencyIndex, weight: 1.4 },
    { value: ratio(projection.overall.havocRate, base("havocRate"), true), weight: 1.25 },
    { value: ratio(projection.overall.frontSevenHavoc, base("frontSevenHavoc"), true), weight: 1.1 },
    { value: ratio(projection.pass.passingDownSuccessRate, base("passingDownSuccessRate")), weight: 1 },
  ]);
  const explosiveIndex = geometric([
    { value: ratio(projection.pass.passingExplosiveness, base("passingExplosiveness")), weight: 1.3 },
    { value: ratio(projection.run.rushingExplosiveness, base("rushingExplosiveness")), weight: 1 },
    { value: ratio(projection.pass.yardsPerCompletion, base("yardsPerCompletion")), weight: .8 },
    { value: ratio(projection.run.openFieldYards, base("openFieldYards")), weight: .8 },
  ]);
  const thirdDownIndex = geometric([
    { value: ratio(projection.overall.thirdDownSuccessRate, base("thirdDownSuccessRate")), weight: 1.5 },
    { value: ratio(projection.pass.passingDownSuccessRate, base("passingDownSuccessRate")), weight: 1 },
  ]);
  const redZoneIndex = geometric([
    { value: ratio(projection.overall.redZoneEfficiency, base("redZoneEfficiency")), weight: 1.4 },
    { value: ratio(projection.overall.pointsPerDrive, base("pointsPerDrive")), weight: 1 },
  ]);
  const fieldIndex = geometric([
    { value: ratio(projection.specialTeams.fieldPosition, base("fieldPosition")), weight: 1.6 },
    { value: ratio(projection.specialTeams.netPunting, base("netPunting")), weight: 1 },
    { value: ratio(projection.specialTeams.puntReturn, base("puntReturn")), weight: .7 },
    { value: ratio(projection.specialTeams.kickReturn, base("kickReturn")), weight: .7 },
  ]);
  const disciplineIndex = geometric([
    { value: ratio(projection.specialTeams.penaltyYards, base("penaltyYards"), true), weight: 1.3 },
    { value: ratio(projection.overall.havocRate, base("havocRate"), true), weight: .8 },
  ]);
  const turnoverIndex = finite(projection.specialTeams.turnoverMargin)
    ? Math.exp(clamp(projection.specialTeams.turnoverMargin, -2, 2) * .13)
    : 1;
  return [
    card("run", "RUN GAME", runIndex, runIndex >= 1 ? "Creates manageable downs and keeps the full playbook open." : "Can force the offense away from its preferred run menu.", [
      `${pct(projection.run.rushingSuccessRate)} rush success`,
      `${num(projection.run.lineYards)} line yards`,
    ]),
    card("pass", "PASSING", passIndex, passIndex >= 1 ? "Creates efficient throws without relying only on volume." : "Coverage can squeeze completions and create longer downs.", [
      `${pct(projection.pass.passingSuccessRate)} pass success`,
      `${num(projection.pass.adjustedYpa)} adjusted YPA`,
    ]),
    card("comfort", "QB COMFORT", protectionIndex, protectionIndex >= 1 ? "The quarterback should have answers before pressure arrives." : "Pressure can speed up reads and shrink the route tree.", [
      `${pct(projection.overall.havocRate)} projected havoc`,
      `${pct(projection.pass.passingDownSuccessRate)} passing-down success`,
    ]),
    card("explosive", "BIG-PLAY POTENTIAL", explosiveIndex, explosiveIndex >= 1 ? "One successful snap can flip field position or the scoreboard." : "The defense can make the offense string together long drives.", [
      `${num(projection.pass.yardsPerCompletion, 1)} yards / completion`,
      `${num(projection.run.openFieldYards)} open-field yards`,
    ]),
    card("third", "THIRD DOWNS", thirdDownIndex, thirdDownIndex >= 1 ? "Drive extensions should protect possession volume." : "Failed late downs can hand the opponent extra possessions.", [
      `${pct(projection.overall.thirdDownSuccessRate)} late-down success`,
      `${pct(projection.pass.passingDownSuccessRate)} pass-down success`,
    ]),
    card("redzone", "RED ZONE", redZoneIndex, redZoneIndex >= 1 ? "Scoring chances are more likely to finish with touchdowns." : "Drives may produce field goals instead of touchdowns.", [
      `${pct(projection.overall.redZoneEfficiency)} red-zone rate`,
      `${num(projection.overall.pointsPerDrive)} points / drive`,
    ]),
    card("field", "HIDDEN YARDS", fieldIndex, fieldIndex >= 1 ? "Shorter fields reduce the number of successful snaps needed to score." : "Longer fields increase the cost of every stalled drive.", [
      `${num(projection.specialTeams.fieldPosition, 1)} starting field position`,
      `${num(projection.specialTeams.netPunting, 1)} net punt`,
    ]),
    card("turnovers", "TURNOVERS", turnoverIndex, "Possession swings can overwhelm smaller efficiency edges.", [
      `${finite(projection.specialTeams.turnoverMargin) ? signed(projection.specialTeams.turnoverMargin, 1) : "—"} turnover margin`,
      `${pct(projection.overall.havocRate)} havoc exposure`,
    ]),
    card("discipline", "DISCIPLINE", disciplineIndex, disciplineIndex >= 1 ? "Fewer self-inflicted yards preserve favorable down-and-distance." : "Penalties and negative plays can erase efficient snaps.", [
      `${num(projection.specialTeams.penaltyYards, 1)} penalty yards`,
      `${pct(projection.overall.havocRate)} havoc exposure`,
    ]),
  ];
}

function mostImportant(cards: MatchupAdvantageCard[]) {
  return [...cards].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))[0];
}

export function deriveMatchupIntelligence(input: {
  homeTeam: string;
  awayTeam: string;
  homeProjection: AdvancedSideProjection;
  awayProjection: AdvancedSideProjection;
  homeProfile: FootballProfile;
  awayProfile: FootballProfile;
}): MatchupIntelligenceBoard {
  const { homeTeam, awayTeam, homeProjection, awayProjection, homeProfile, awayProfile } = input;
  const homeCards = sideCards(homeTeam, awayTeam, homeProjection, homeProfile, awayProfile);
  const awayCards = sideCards(awayTeam, homeTeam, awayProjection, awayProfile, homeProfile);
  const homeBiggestEdge = mostImportant(homeCards);
  const awayBiggestEdge = mostImportant(awayCards);
  const homeControl = average(homeCards.slice(0, 6).map((card) => card.score));
  const awayControl = average(awayCards.slice(0, 6).map((card) => card.score));
  const controlGap = homeControl - awayControl;
  const controlTeam = Math.abs(controlGap) < 3 ? null : controlGap > 0 ? homeTeam : awayTeam;
  const controlCard = controlGap >= 0 ? homeBiggestEdge : awayBiggestEdge;
  const explosiveAverage = average([
    homeCards.find((card) => card.id === "explosive")?.score,
    awayCards.find((card) => card.id === "explosive")?.score,
  ], 50);
  const driveAverage = average([
    homeCards.find((card) => card.id === "third")?.score,
    awayCards.find((card) => card.id === "third")?.score,
    homeCards.find((card) => card.id === "run")?.score,
    awayCards.find((card) => card.id === "run")?.score,
  ], 50);
  const gameShape = explosiveAverage >= 57 ? "EXPLOSIVE" : driveAverage <= 45 ? "METHODICAL" : "BALANCED";
  const shapeCardHome = gameShape === "EXPLOSIVE"
    ? homeCards.find((card) => card.id === "explosive")
    : homeCards.find((card) => card.id === "run");
  const shapeCardAway = gameShape === "EXPLOSIVE"
    ? awayCards.find((card) => card.id === "explosive")
    : awayCards.find((card) => card.id === "run");
  const gameShapeBenefit = !shapeCardHome || !shapeCardAway || Math.abs(shapeCardHome.score - shapeCardAway.score) < 4
    ? null
    : shapeCardHome.score > shapeCardAway.score ? homeTeam : awayTeam;
  const homeIdentity = deriveTeamIdentity(homeProfile);
  const awayIdentity = deriveTeamIdentity(awayProfile);
  const uncertainties: string[] = [];
  if (Math.min(homeProfile.gamesPlayed, awayProfile.gamesPlayed) < 4) uncertainties.push("Small sample: early-season identities can move quickly.");
  if (Math.min(homeProfile.matchupReliability ?? 1, awayProfile.matchupReliability ?? 1) < .68) uncertainties.push("Opponent proof is limited for at least one team.");
  if (homeProfile.advancedProfile?.coverage.advancedGames === 0 || awayProfile.advancedProfile?.coverage.advancedGames === 0) uncertainties.push("Some advanced splits are using core-stat proxies.");
  const volatileTeam=[
    {team:homeTeam,read:deriveTeamStability(homeProfile)},
    {team:awayTeam,read:deriveTeamStability(awayProfile)},
  ].sort((first,second)=>second.read.volatility-first.read.volatility)[0];
  if(volatileTeam.read.volatility>=60)uncertainties.push(`${volatileTeam.team} carries a ${volatileTeam.read.volatilityLabel.toLowerCase()} profile, which lowers edge confidence.`);
  const summary = controlTeam
    ? `${controlTeam} has the cleaner path because ${controlCard.label.toLowerCase()} is the strongest matchup-specific signal.`
    : `Neither team controls enough phases to separate cleanly; the matchup projects to turn on possessions and finishing drives.`;
  return {
    homeIdentity,
    awayIdentity,
    homeCards,
    awayCards,
    homeBiggestEdge,
    awayBiggestEdge,
    controlTeam,
    controlReason: controlCard.impact,
    gameShape,
    gameShapeBenefit,
    uncertainties,
    summary,
  };
}
