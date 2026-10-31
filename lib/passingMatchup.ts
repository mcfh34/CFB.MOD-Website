import {passLocations, type PassLocation} from "./passing";
type RunLane=PassLocation;
const runLanes=passLocations;
export const MIN_PASS_ZONE_ATTEMPTS = 3;
export type LaneProduction = { attempts: number; yards: number; available:number };
export type PassingDirectionalProfile = {
  offense: Record<RunLane, { index: number; share: number; attempts: number; available:number; ypa?:number|null; relativePercent?:number|null; comparisonAttempts?:number; comparedOwnAttempts?:number }>;
  defense: Record<RunLane, { index: number; share: number; attempts: number; available:number; ypa?:number|null; relativePercent?:number|null; comparisonAttempts?:number; comparedOwnAttempts?:number }>;
  coverage: number;
  schema?:2;
  eligible?:{offense:number|null;defense:number|null};
  knownFraction?:{offense:number;defense:number};
};
export type PassingDirectionalGame = {
  gameId: string; week: number; team: string; opponent: string;
  offense: Record<RunLane, LaneProduction>;
  defense: Record<RunLane, LaneProduction>;
  eligible?:{offense:number|null;defense:number|null};
};

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const empty = () => Object.fromEntries(runLanes.map(lane => [lane, { attempts: 0, yards: 0, available:0 }])) as Record<RunLane, LaneProduction>;

export function parsePassingDirectionalGames(payload: unknown): PassingDirectionalGame[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry): PassingDirectionalGame[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const gameId = String(row.gameId ?? "");
    const team = String(row.team ?? "");
    const opponent = String(row.opponent ?? "");
    const week = Number(row.week);
    if (!gameId || !team || !opponent || !Number.isFinite(week)) return [];
    const side = (value: unknown) => {
      const locations = value && typeof value === "object" ? (value as Record<string, unknown>).locations : null;
      const result = empty();
      for (const lane of runLanes) {
        const data = locations && typeof locations === "object" ? (locations as Record<string, unknown>)[lane] : null;
        const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
        const attempts = record.attempts, yards = record.totalYards, available=record.totalYardsAttemptsAvailable;
        if (typeof attempts=== "number" && attempts>=0) result[lane].attempts=attempts;
        if (typeof available=== "number" && available>0 && available<=result[lane].attempts && typeof yards=== "number" && Number.isFinite(yards)) {result[lane].available=available;result[lane].yards=yards;}
      }
      return result;
    };
    const offense=side(row.offense),defense=side(row.defense);
    const count=(value:unknown,lanes:Record<RunLane,LaneProduction>)=>{
      const r=value&&typeof value==="object"?value as Record<string,unknown>:{};
      const known=runLanes.reduce((sum,l)=>sum+lanes[l].attempts,0);
      const n=r.locationEligibleAttempts;
      if(typeof n==="number"&&Number.isFinite(n)&&n>=known)return n;
      const locations=r.locations&&typeof r.locations==="object"?r.locations as Record<string,unknown>:{};
      const unknown=locations.unknown&&typeof locations.unknown==="object"?locations.unknown as Record<string,unknown>:{};
      return typeof unknown.attempts==="number"&&Number.isFinite(unknown.attempts)&&unknown.attempts>=0?known+unknown.attempts:null;
    };
    return [{gameId,week,team,opponent,offense,defense,eligible:{offense:count(row.offense,offense),defense:count(row.defense,defense)}}];
  });
}

/** Same opponent-relative lane analysis as rushing; diagnostic only, not a scoring change. */
export function buildPassingDirectionalProfiles(rows: PassingDirectionalGame[], week: number, eligible: Set<string>) {
  const games = rows.filter(row => row.week <= week && eligible.has(row.team) && eligible.has(row.opponent));
  const byTeam = new Map<string,PassingDirectionalGame[]>();
  for(const row of games)byTeam.set(row.team,[...(byTeam.get(row.team)??[]),row]);
  const teams = new Set(games.map(row => row.team));
  const output = new Map<string, PassingDirectionalProfile>();
  for (const team of teams) {
    const teamGames = byTeam.get(team)!;
    const aggregate = (side: "offense" | "defense") => {
      const result = empty();
      for (const row of teamGames) for (const lane of runLanes) {
        result[lane].attempts += row[side][lane].attempts;
        result[lane].available += row[side][lane].available;
        result[lane].yards += row[side][lane].yards;
      }
      return result;
    };
    const offense = aggregate("offense"), defense = aggregate("defense");
    const totalKnown = runLanes.reduce((sum, lane) => sum + offense[lane].attempts, 0);
    const totalAllowed = runLanes.reduce((sum, lane) => sum + defense[lane].attempts, 0);
    // Compare each game with that opponent's other FBS games in the same zone.
    // No league fallback is presented as an opponent comparison.
    const relative = (side:"offense"|"defense",lane:RunLane) => {
      let actualYards=0,expectedYards=0,ownAttempts=0,comparisonAttempts=0;
      for(const game of teamGames){
        const own=game[side][lane];if(!own.available)continue;
        const otherSide=side==="offense"?"defense":"offense";
        const opponentGames=(byTeam.get(game.opponent)??[]).filter(other=>other.gameId!==game.gameId);
        const n=opponentGames.reduce((sum,other)=>sum+other[otherSide][lane].available,0);
        const yards=opponentGames.reduce((sum,other)=>sum+other[otherSide][lane].yards,0);
        if(!n||yards<=0)continue;
        actualYards+=own.yards;ownAttempts+=own.available;
        expectedYards+=own.available*yards/n;
        comparisonAttempts+=n;
      }
      if(!ownAttempts||expectedYards<=0)return {percent:null,comparisonAttempts,comparedOwnAttempts:ownAttempts};
      const raw=actualYards/expectedYards-1;
      // Shrink extreme outcomes continuously on both the team's and its opponents' samples.
      const reliability=Math.min(ownAttempts/(ownAttempts+25),comparisonAttempts/(comparisonAttempts+25));
      return {percent:100*clamp(raw,-1,1)*reliability,comparisonAttempts,comparedOwnAttempts:ownAttempts};
    };
    const eligibleCount=(side:"offense"|"defense")=>teamGames.some(g=>g.eligible?.[side]==null)?null:teamGames.reduce((sum,g)=>sum+g.eligible![side]!,0);
    const offEligible=eligibleCount("offense"),defEligible=eligibleCount("defense");
    output.set(team, {
      schema:2,eligible:{offense:offEligible,defense:defEligible},
      knownFraction:{offense:offEligible?totalKnown/offEligible:0,defense:defEligible?totalAllowed/defEligible:0},
      offense: Object.fromEntries(runLanes.map(lane => {const r=relative("offense",lane);return [lane, { index:1+(r.percent??0)/100,relativePercent:r.percent,comparisonAttempts:r.comparisonAttempts,comparedOwnAttempts:r.comparedOwnAttempts,share:totalKnown?offense[lane].attempts/totalKnown:0,attempts:offense[lane].attempts,available:offense[lane].available,ypa:offense[lane].available?offense[lane].yards/offense[lane].available:null }];})) as PassingDirectionalProfile["offense"],
      defense: Object.fromEntries(runLanes.map(lane => {const r=relative("defense",lane);return [lane, { index:1+(r.percent??0)/100,relativePercent:r.percent,comparisonAttempts:r.comparisonAttempts,comparedOwnAttempts:r.comparedOwnAttempts,share:totalAllowed?defense[lane].attempts/totalAllowed:0,attempts:defense[lane].attempts,available:defense[lane].available,ypa:defense[lane].available?defense[lane].yards/defense[lane].available:null }];})) as PassingDirectionalProfile["defense"],
      coverage: totalKnown,
    });
  }
  return output;
}

/** Display-only opponent-relative differences; each side needs three compared attempts. */
export function passingDirectionalMatchup(offense?:PassingDirectionalProfile|null,defense?:PassingDirectionalProfile|null){
  if(!offense||!defense||offense.schema!==2||defense.schema!==2)return {multiplier:1,lanes:[],offCoverage:0,defCoverage:0,available:false};
  const offCoverage=clamp(offense.knownFraction?.offense??0,0,1),defCoverage=clamp(defense.knownFraction?.defense??0,0,1);
  const lanes=runLanes.map(lane=>{
    const off=offense.offense[lane],def=defense.defense[lane];
    const offTested=off.relativePercent!=null&&(off.comparedOwnAttempts??0)>=MIN_PASS_ZONE_ATTEMPTS;
    const defTested=def.relativePercent!=null&&(def.comparedOwnAttempts??0)>=MIN_PASS_ZONE_ATTEMPTS;
    const tested=offTested&&defTested;
    const edgePercent=tested?off.relativePercent!+def.relativePercent!:0;
    const share=off.attempts/Math.max(1,offense.eligible?.offense??0);
    // Unlocated attempts retain their share of usage and add no invented edge.
    const contribution=tested?share*edgePercent/100:0;
    return {lane,offAttempts:off.attempts,defAttempts:def.attempts,share,pairing:1+edgePercent/100,edgePercent,tested,contribution,offRelative:offTested?off.relativePercent!:null,defRelative:defTested?def.relativePercent!:null};
  });
  const weightedEdge=lanes.reduce((sum,l)=>sum+l.contribution,0);
  return {multiplier:1+weightedEdge,lanes,offCoverage,defCoverage,available:lanes.some(l=>l.tested)};
}
