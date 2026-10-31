import type {MatchupPolicy} from "./matchupPolicy";
import type { AdvancedProfile } from "./advancedMetrics";
import { projectMatchupCore } from "./matchupEngine";
import type { MatchupEvidence } from "./matchupModel";
import type { RosterProjection } from "./rosterModel";

export type RoundRobinProfile = {
  conferenceAdjustment?:number;
  id: string;
  team: string;
  season: number;
  week: number;
  conference?: string | null;
  logo?: string | null;
  color?:string|null;
  abbreviation?:string|null;
  offense: readonly number[];
  defense: readonly number[];
  rating?: number;
  resumeScore?: number;
  seasonRecord?: string;
  nationalChampion?: boolean;
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
  roster?: RosterProjection;
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
function* roundRobinBatches(profiles:readonly RoundRobinProfile[],policy?:MatchupPolicy):Generator<number,RoundRobinStanding[]> {
  let completed=0;
  const standings = profiles.map<MutableStanding>((profile) => ({
    profile, wins: 0, losses: 0, games: 0, expectedWins: 0, averageMargin: 0, unitEdges: new Map(),
  }));
  const inputs=profiles.map(profile=>({team:profile.team,offense:profile.offense,defense:profile.defense,
    evidence:profile.evidence,advanced:profile.advanced,roster:profile.roster,outcomeRating:profile.rating,conferenceAdjustment:profile.conferenceAdjustment}));
  for (let firstIndex = 0; firstIndex < standings.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < standings.length; secondIndex += 1) {
      const first = standings[firstIndex];
      const second = standings[secondIndex];
      const projection = projectMatchupCore(inputs[firstIndex],inputs[secondIndex],true,policy);

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
      if(++completed%512===0)yield completed;
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
  }).sort((a, b) => b.expectedWins - a.expectedWins || b.averageMargin - a.averageMargin || b.wins - a.wins || a.profile.id.localeCompare(b.profile.id))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}


export function buildRoundRobinStandings(profiles:readonly RoundRobinProfile[],policy?:MatchupPolicy):RoundRobinStanding[]{
  const batches=roundRobinBatches(profiles,policy);
  let next=batches.next();while(!next.done)next=batches.next();return next.value;
}

/** Exact same pairings, with browser breathing room for large cross-era fields. */
export async function buildRoundRobinStandingsAsync(profiles:readonly RoundRobinProfile[],signal?:AbortSignal,onProgress?:(completed:number)=>void){
  const batches=roundRobinBatches(profiles);
  let lastProgress=0;
  while(true){
    if(signal?.aborted)throw new DOMException("Cancelled","AbortError");
    const next=batches.next();if(next.done)return next.value;
    const now=Date.now();if(now-lastProgress>150){onProgress?.(next.value);lastProgress=now;}
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
}
