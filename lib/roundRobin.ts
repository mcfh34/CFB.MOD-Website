import type { AdvancedProfile } from "./advancedMetrics";
import { baselines, modelCalibration } from "../app/modelData";
import { projectCalibratedMatchup, validateMatchupProfile, type MatchupEvidence } from "./matchupModel";
import { buildPossessionScoreReceipt, calibrateGameMargin, estimatePoints, expectedPossessions } from "./scoringModel";
import { assessOffensiveViability } from "./offensiveViability";

export type RoundRobinProfile = {
  id: string;
  team: string;
  season: number;
  week: number;
  conference?: string | null;
  logo?: string | null;
  offense: readonly number[];
  defense: readonly number[];
  rating?: number;
  resumeScore?: number;
  seasonRecord?: string;
  nationalChampion?: boolean;
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
};

export type RoundRobinStanding = {
  rank: number;
  profile: RoundRobinProfile;
  wins: number;
  losses: number;
  games: number;
  expectedWins: number;
  winPct: number;
  averageMargin: number;
  bestUnit: string;
  unitWins: number;
};

type MutableStanding = Omit<RoundRobinStanding, "rank" | "winPct" | "bestUnit" | "unitWins"> & { unitEdges: Map<string, number> };

const average = (values: readonly number[]) => values.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, values.length);
const crossEraResumeMarginWeight = 8;

const calibratedWinProbability = (margin:number) => 1/(1+Math.exp(-margin/11.8));

function proofScore(evidence: MatchupEvidence) {
  return 0.4 * evidence.scheduleStrength
    + 0.2 * evidence.bestOpponentStrength
    + 0.25 * evidence.qualityWinStrength
    + 0.15 * evidence.reliability;
}

function simpleSide(offense: readonly number[], defense: readonly number[]) {
  const ypa = baselines.ypa * Number(offense[1] ?? 1) * Number(defense[1] ?? 1);
  const ypc = baselines.ypc * Number(offense[2] ?? 1) * Number(defense[2] ?? 1);
  const patt = baselines.patt * Number(offense[3] ?? 1) * Number(defense[3] ?? 1);
  const ratt = baselines.ratt * Number(offense[4] ?? 1) * Number(defense[4] ?? 1);
  const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
  return { ypa, ypc, patt, ratt, score: estimatePoints({ ypp, ypa, ypc, passAttempts:patt, rushAttempts:ratt }) };
}

function geometric(values:Array<number|null|undefined>) {
  const valid=values.filter((value):value is number=>value!==null&&value!==undefined&&Number.isFinite(value)&&value>0);
  return valid.length?Math.exp(valid.reduce((sum,value)=>sum+Math.log(value),0)/valid.length):1;
}

function compactAdvancedTuple(profile:RoundRobinProfile,side:"offense"|"defense") {
  const tuple=[...profile[side]] as number[];
  const advanced=profile.advanced?.[side].index;
  if(!advanced) return tuple;
  const control=geometric([advanced.successRate,advanced.ppa,advanced.standardDownSuccessRate,advanced.passingDownSuccessRate]);
  const disruption=advanced.havocRate??1;
  const run=geometric([advanced.lineYards,advanced.stuffRate,advanced.rushingSuccessRate,advanced.rushingPpa]);
  const pass=geometric([advanced.completionRate,advanced.yardsPerCompletion,advanced.passingSuccessRate,advanced.passingPpa,advanced.passingExplosiveness]);
  const field=advanced.fieldPosition??1;
  // This batched kernel carries every major v2 family into million-matchup
  // cross-era fields without allocating the full analyst receipt per pairing.
  tuple[0]*=Math.exp(.16*Math.log(control)+.08*Math.log(disruption)+.035*Math.log(field));
  tuple[1]*=Math.exp(.2*Math.log(pass)+.08*Math.log(control)+.07*Math.log(disruption));
  tuple[2]*=Math.exp(.2*Math.log(run)+.08*Math.log(control)+.07*Math.log(disruption));
  return tuple;
}

function creditUnit(first: MutableStanding, second: MutableStanding, label: string, difference: number, minimumEdge: number) {
  if (Math.abs(difference) < minimumEdge) return;
  const winner = difference > 0 ? first : second;
  winner.unitEdges.set(label, (winner.unitEdges.get(label) ?? 0) + 1);
}

/**
 * Simulates each neutral-field pairing once and credits both sides of the
 * result. Team profiles are already normalized to their own season, allowing
 * a 2014 team and a 2025 team to share the same comparison scale.
 */
export function buildRoundRobinStandings(profiles: readonly RoundRobinProfile[]): RoundRobinStanding[] {
  const standings = profiles.map<MutableStanding>((profile) => ({
    profile, wins: 0, losses: 0, games: 0, expectedWins: 0, averageMargin: 0, unitEdges: new Map(),
  }));
  const useBaseProfilePath = profiles.length>220 || profiles.every((profile) => !profile.advanced);
  // Cross-era fields can contain well over 1,000 team-seasons. Validate every
  // base profile once instead of rebuilding both profiles for every one of the
  // millions of pairings. Advanced callers retain the complete path below.
  const calibrated = useBaseProfilePath ? profiles.map((profile) => validateMatchupProfile({
    offense:compactAdvancedTuple(profile,"offense"),
    defense:compactAdvancedTuple(profile,"defense"),
    evidence:profile.evidence,
  })) : [];
  const fallbackViability=assessOffensiveViability(null);

  for (let firstIndex = 0; firstIndex < standings.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < standings.length; secondIndex += 1) {
      const first = standings[firstIndex];
      const second = standings[secondIndex];
      const projection = useBaseProfilePath ? (() => {
        const firstProfile = calibrated[firstIndex];
        const secondProfile = calibrated[secondIndex];
        const firstStats = simpleSide(firstProfile.offense, secondProfile.defense);
        const secondStats = simpleSide(secondProfile.offense, firstProfile.defense);
        const possessions=expectedPossessions(
          {passAttempts:firstStats.patt,rushAttempts:firstStats.ratt,advanced:null},
          {passAttempts:secondStats.patt,rushAttempts:secondStats.ratt,advanced:null},
        );
        const firstReceipt=buildPossessionScoreReceipt(null,null,possessions,fallbackViability,firstStats.score);
        const secondReceipt=buildPossessionScoreReceipt(null,null,possessions,fallbackViability,secondStats.score);
        const statisticalMargin = firstReceipt.rawExpectedPoints - secondReceipt.rawExpectedPoints;
        const hasRatings = Number.isFinite(first.profile.rating) && Number.isFinite(second.profile.rating);
        const outcomeMargin = hasRatings ? (Number(first.profile.rating) - Number(second.profile.rating)) / modelCalibration.eloPointsPerPoint : statisticalMargin;
        const margin = calibrateGameMargin(statisticalMargin,outcomeMargin,proofScore(firstProfile.evidence)-proofScore(secondProfile.evidence),true)
          + crossEraResumeMarginWeight * ((first.profile.resumeScore ?? 0.5) - (second.profile.resumeScore ?? 0.5));
        return {
          margin,
          homeWinProbability:calibratedWinProbability(margin),
          homeStats:firstStats,
          awayStats:secondStats,
          calibratedHome:firstProfile,
          calibratedAway:secondProfile,
        };
      })() : (() => {
        const base = projectCalibratedMatchup(
          { offense:first.profile.offense, defense:first.profile.defense, evidence:first.profile.evidence, advanced:first.profile.advanced },
          { offense:second.profile.offense, defense:second.profile.defense, evidence:second.profile.evidence, advanced:second.profile.advanced },
          true,
          first.profile.rating,
          second.profile.rating,
        );
        const margin = base.margin + crossEraResumeMarginWeight * ((first.profile.resumeScore ?? 0.5) - (second.profile.resumeScore ?? 0.5));
        return { ...base, margin, homeWinProbability:calibratedWinProbability(margin) };
      })();

      first.games += 1;
      second.games += 1;
      first.expectedWins += projection.homeWinProbability;
      second.expectedWins += 1 - projection.homeWinProbability;
      first.averageMargin += projection.margin;
      second.averageMargin -= projection.margin;
      if (projection.margin > 0 || (Math.abs(projection.margin) < 1e-9 && first.profile.id.localeCompare(second.profile.id) < 0)) {
        first.wins += 1;
        second.losses += 1;
      } else {
        second.wins += 1;
        first.losses += 1;
      }

      creditUnit(first, second, "Passing game", projection.homeStats.ypa - projection.awayStats.ypa, 0.08);
      creditUnit(first, second, "Run game", projection.homeStats.ypc - projection.awayStats.ypc, 0.05);
      const firstDefense = average(projection.calibratedHome.defense.slice(0, 3));
      const secondDefense = average(projection.calibratedAway.defense.slice(0, 3));
      creditUnit(first, second, "Defense", secondDefense - firstDefense, 0.008);
    }
  }

  return standings.map((standing) => {
    const bestUnit = [...standing.unitEdges].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return {
      profile: standing.profile,
      wins: standing.wins,
      losses: standing.losses,
      games: standing.games,
      expectedWins: standing.expectedWins,
      winPct: standing.games ? standing.wins / standing.games : 0,
      averageMargin: standing.games ? standing.averageMargin / standing.games : 0,
      bestUnit: bestUnit?.[0] ?? "Balanced",
      unitWins: bestUnit?.[1] ?? 0,
    };
  }).sort((a, b) => b.wins - a.wins || b.expectedWins - a.expectedWins || b.averageMargin - a.averageMargin || a.profile.id.localeCompare(b.profile.id))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}
