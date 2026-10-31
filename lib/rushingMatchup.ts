export type RunLane = "left" | "middle" | "right";
export const runLanes: RunLane[] = ["left", "middle", "right"];
export type LaneProduction = { carries: number; yards: number };
export type DirectionalProfile = {
  offense: Record<RunLane, { index: number; share: number; carries: number; ypc?:number|null; relativePercent?:number|null; comparisonCarries?:number; comparedOwnCarries?:number }>;
  defense: Record<RunLane, { index: number; share: number; carries: number; ypc?:number|null; relativePercent?:number|null; comparisonCarries?:number; comparedOwnCarries?:number }>;
  coverage: number;
  schema?:2;
  eligible?:{offense:number|null;defense:number|null};
  knownFraction?:{offense:number;defense:number};
};
export type DirectionalGame = {
  gameId: string; week: number; team: string; opponent: string;
  offense: Record<RunLane, LaneProduction>;
  defense: Record<RunLane, LaneProduction>;
  eligible?:{offense:number|null;defense:number|null};
};

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const empty = () => Object.fromEntries(runLanes.map(lane => [lane, { carries: 0, yards: 0 }])) as Record<RunLane, LaneProduction>;

export function parseDirectionalGames(payload: unknown): DirectionalGame[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry): DirectionalGame[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const gameId = String(row.gameId ?? "");
    const team = String(row.team ?? "");
    const opponent = String(row.opponent ?? "");
    const week = Number(row.week);
    if (!gameId || !team || !opponent || !Number.isFinite(week)) return [];
    const side = (value: unknown) => {
      const directions = value && typeof value === "object" ? (value as Record<string, unknown>).directions : null;
      const result = empty();
      for (const lane of runLanes) {
        const data = directions && typeof directions === "object" ? (directions as Record<string, unknown>)[lane] : null;
        const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
        const carries = Number(record.carries), yards = Number(record.yards);
        if (Number.isFinite(carries) && carries > 0 && Number.isFinite(yards)) result[lane] = { carries, yards };
      }
      return result;
    };
    const offense=side(row.offense),defense=side(row.defense);
    const count=(value:unknown,lanes:Record<RunLane,LaneProduction>)=>{
      const r=value&&typeof value==="object"?value as Record<string,unknown>:{};
      const known=runLanes.reduce((sum,l)=>sum+lanes[l].carries,0);
      const n=r.directionEligibleAttempts;
      if(typeof n==="number"&&Number.isFinite(n)&&n>=known)return n;
      const directions=r.directions&&typeof r.directions==="object"?r.directions as Record<string,unknown>:{};
      const unknown=directions.unknown&&typeof directions.unknown==="object"?directions.unknown as Record<string,unknown>:{};
      return typeof unknown.carries==="number"&&Number.isFinite(unknown.carries)&&unknown.carries>=0?known+unknown.carries:null;
    };
    return [{gameId,week,team,opponent,offense,defense,eligible:{offense:count(row.offense,offense),defense:count(row.defense,defense)}}];
  });
}

/** Direction is a small, opponent-relative addition to the common YPC model. */
export function buildWeeklyDirectionalProfiles(rows: DirectionalGame[], week: number, eligible: Set<string>) {
  const games = rows.filter(row => row.week <= week && eligible.has(row.team) && eligible.has(row.opponent));
  const national = empty();
  for (const row of games) for (const lane of runLanes) {
    national[lane].carries += row.offense[lane].carries;
    national[lane].yards += row.offense[lane].yards;
  }
  const baseline = Object.fromEntries(runLanes.map(lane => [lane, national[lane].yards / Math.max(1, national[lane].carries)])) as Record<RunLane, number>;
  const teams = new Set(games.map(row => row.team));
  const byTeam=new Map<string,DirectionalGame[]>();
  for(const row of games)byTeam.set(row.team,[...(byTeam.get(row.team)??[]),row]);
  const output = new Map<string, DirectionalProfile>();
  for (const team of teams) {
    const teamGames = byTeam.get(team)!;
    const aggregate = (side: "offense" | "defense") => {
      const result = empty();
      for (const row of teamGames) for (const lane of runLanes) {
        result[lane].carries += row[side][lane].carries;
        result[lane].yards += row[side][lane].yards;
      }
      return result;
    };
    const offense = aggregate("offense"), defense = aggregate("defense");
    const totalKnown = runLanes.reduce((sum, lane) => sum + offense[lane].carries, 0);
    const totalAllowed = runLanes.reduce((sum, lane) => sum + defense[lane].carries, 0);
    const opposed = (side: "offense" | "defense", lane: RunLane) => {
      const observed = side === "offense" ? offense[lane] : defense[lane];
      if (observed.carries < 1 || baseline[lane] <= 0) return 1;
      const raw = observed.yards / observed.carries / baseline[lane];
      // Each opponent's usual performance is estimated from its other games.
      // When none exist, the lane stays at the league baseline.
      let expected = 0, weight = 0;
      for (const game of teamGames) {
        const own = game[side][lane];
        if (!own.carries) continue;
        const opponentGames = games.filter(other => other.team === game.opponent && other.gameId !== game.gameId);
        const otherSide = side === "offense" ? "defense" : "offense";
        const opponentCarries = opponentGames.reduce((sum, other) => sum + other[otherSide][lane].carries, 0);
        const opponentYards = opponentGames.reduce((sum, other) => sum + other[otherSide][lane].yards, 0);
        const opponentIndex = opponentCarries >= 12 ? clamp(opponentYards / opponentCarries / baseline[lane], .6, 1.6) : 1;
        expected += own.carries * opponentIndex;
        weight += own.carries;
      }
      const adjusted = raw / (weight ? expected / weight : 1);
      const reliability = observed.carries / (observed.carries + 35);
      return clamp(Math.exp((Math.log(clamp(raw,.5,2))*.5+Math.log(clamp(adjusted,.5,2))*.5)*reliability),.65,1.5);
    };
    // Display-only comparison. A negative defensive value means fewer yards
    // allowed than those opponents normally gained in this direction.
    const relative=(side:"offense"|"defense",lane:RunLane)=>{
      let actualYards=0,expectedYards=0,ownCarries=0,comparisonCarries=0;
      for(const game of teamGames){
        const own=game[side][lane];if(!own.carries)continue;
        const otherSide=side==="offense"?"defense":"offense";
        const others=(byTeam.get(game.opponent)??[]).filter(other=>other.gameId!==game.gameId);
        const n=others.reduce((sum,other)=>sum+other[otherSide][lane].carries,0);
        const yards=others.reduce((sum,other)=>sum+other[otherSide][lane].yards,0);
        if(!n||yards<=0)continue;
        actualYards+=own.yards;ownCarries+=own.carries;
        expectedYards+=own.carries*yards/n;comparisonCarries+=n;
      }
      if(!ownCarries||expectedYards<=0)return {percent:null,comparisonCarries,comparedOwnCarries:ownCarries};
      const reliability=Math.min(ownCarries/(ownCarries+25),comparisonCarries/(comparisonCarries+25));
      return {percent:100*clamp(actualYards/expectedYards-1,-1,1)*reliability,comparisonCarries,comparedOwnCarries:ownCarries};
    };
    const eligibleCount=(side:"offense"|"defense")=>teamGames.some(g=>g.eligible?.[side]==null)?null:teamGames.reduce((sum,g)=>sum+g.eligible![side]!,0);
    const offEligible=eligibleCount("offense"),defEligible=eligibleCount("defense");
    output.set(team, {
      schema:2,eligible:{offense:offEligible,defense:defEligible},
      knownFraction:{offense:offEligible?totalKnown/offEligible:0,defense:defEligible?totalAllowed/defEligible:0},
      offense: Object.fromEntries(runLanes.map(lane => {const r=relative("offense",lane);return [lane, { index: opposed("offense", lane),share:totalKnown?offense[lane].carries/totalKnown:0,carries:offense[lane].carries,ypc:offense[lane].carries?offense[lane].yards/offense[lane].carries:null,relativePercent:r.percent,comparisonCarries:r.comparisonCarries,comparedOwnCarries:r.comparedOwnCarries }];})) as DirectionalProfile["offense"],
      defense: Object.fromEntries(runLanes.map(lane => {const r=relative("defense",lane);return [lane, { index: opposed("defense", lane),share:totalAllowed?defense[lane].carries/totalAllowed:0,carries:defense[lane].carries,ypc:defense[lane].carries?defense[lane].yards/defense[lane].carries:null,relativePercent:r.percent,comparisonCarries:r.comparisonCarries,comparedOwnCarries:r.comparedOwnCarries }];})) as DirectionalProfile["defense"],
      coverage: totalKnown,
    });
  }
  return output;
}

/** Unknown ordinary rushes remain in aggregate YPC; their lane-specific increment is zero. */
export function directionalMatchup(offense?:DirectionalProfile|null,defense?:DirectionalProfile|null){
  if(!offense||!defense||offense.schema!==2||defense.schema!==2||offense.coverage<15||!offense.eligible?.offense||!defense.eligible?.defense)return {multiplier:1,lanes:[],offCoverage:0,defCoverage:0,available:false};
  const offCoverage=clamp(offense.knownFraction?.offense??0,0,1),defCoverage=clamp(defense.knownFraction?.defense??0,0,1);
  const ownOverall=runLanes.reduce((sum,l)=>sum+(offense.offense[l]?.share??0)*Math.log(offense.offense[l]?.index??1),0);
  const defenseOverall=runLanes.reduce((sum,l)=>sum+(defense.defense[l]?.share??0)*Math.log(defense.defense[l]?.index??1),0);
  const lanes=runLanes.map(lane=>{
    const off=offense.offense[lane],def=defense.defense[lane];
    const tested=off.carries>=12&&def.carries>=12;
    const reliability=Math.min(off.carries/(off.carries+35),def.carries/(def.carries+35));
    const pairing=clamp(off.index*def.index,.5,2);
    const edge=Math.log(pairing)-ownOverall-defenseOverall;
    const share=off.carries/offense.eligible!.offense!;
    // The unobserved part of both sides adds no directional edge. No renormalization.
    const contribution=tested?share*edge*.4*reliability*defCoverage:0;
    return {lane,offCarries:off.carries,defCarries:def.carries,share,pairing,edgePercent:(Math.exp(edge)-1)*100,tested,contribution};
  });
  const logChange=clamp(lanes.reduce((sum,l)=>sum+l.contribution,0),Math.log(.95),Math.log(1.05));
  return {multiplier:Math.exp(logChange),lanes,offCoverage,defCoverage,available:true};
}
export function directionalRunMultiplier(offense?:DirectionalProfile|null,defense?:DirectionalProfile|null){return directionalMatchup(offense,defense).multiplier;}

/** Signed OFF + DEF percentages for the chart. This never enters scoring. */
export function rushingRelativeMatchup(offense?:DirectionalProfile|null,defense?:DirectionalProfile|null){
  const lanes=runLanes.map(lane=>{
    const off=offense?.offense[lane],def=defense?.defense[lane];
    const offRelative=off?.relativePercent??null,defRelative=def?.relativePercent??null;
    return {lane,offRelative,defRelative,edgePercent:offRelative===null||defRelative===null?null:offRelative+defRelative,
      share:off?.carries&&offense?.eligible?.offense?off.carries/offense.eligible.offense:0};
  });
  return {lanes,available:lanes.some(l=>l.edgePercent!==null)};
}
