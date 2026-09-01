import { buildBcsRankings, type BcsRankingRow, type RankingGame, type RankingProfile } from "./rankings";
import { matchupScoreCard, projectMatchupCore, projectMatchupEngine } from "./matchupEngine";
import type { MatchupEdgeAnalysis } from "./matchupAnalysis";
import type { MatchupEvidence } from "./matchupModel";
import { conferenceChampionshipGameIds, gameConference } from "./gamePhases";

export type SimulationScheduleGame = {
  gameId: string;
  week: number;
  startDate: string | null;
  seasonType: string;
  completed: boolean | number;
  neutralSite: boolean | number;
  conferenceGame: boolean | number;
  homeTeam: string;
  homeConference: string | null;
  homePoints: number | null;
  awayTeam: string;
  awayConference: string | null;
  awayPoints: number | null;
  pregameHomeWinProbability?: number | null;
  pregameModelHomeSpread?: number | null;
  pregameModelTotal?: number | null;
};

export type SimulationGameOverride = {
  gameId:string;
  winnerTeam:string;
};

export type SeasonSimulationOptions = {
  gameOverrides?:SimulationGameOverride[];
};

export type SimulationProjectionReceipt = {
  homeWinProbability:number|null;
  modelHomeSpread:number|null;
  modelTotal:number|null;
  homePredictedStats:SimulatedBasicProfile|null;
  awayPredictedStats:SimulatedBasicProfile|null;
  homePredictedAdvanced:SimulatedAdvancedProfile|null;
  awayPredictedAdvanced:SimulatedAdvancedProfile|null;
  edgeAnalysis?:MatchupEdgeAnalysis;
};

export type SimulatedScheduleRow = SimulationProjectionReceipt & {
  gameId: string;
  opponent: string;
  location: "HOME" | "AWAY" | "NEUTRAL";
  status: "final" | "projected";
  teamScore: number;
  opponentScore: number;
  recordAfter: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeRecordAfter: string;
  awayRecordAfter: string;
  neutralSite: boolean;
  week: number;
  seasonType: "regular" | "conference-championship";
};

type SimulatedBasicProfile={
  totalYards:number;yardsPerPlay:number;passYards:number;passAttempts:number;passCompletions:null;yardsPerPass:number;
  rushYards:number;rushAttempts:number;yardsPerRush:number;turnovers:null;
};

type SimulatedAdvancedProfile={
  successRate:number|null;explosiveness:number|null;ppa:number|null;pointsPerDrive:number|null;playsPerDrive:number|null;
  thirdDownSuccessRate:number|null;redZoneEfficiency:number|null;havocRate:number|null;lineYards:number|null;secondLevelYards:number|null;openFieldYards:number|null;
  stuffRate:number|null;powerSuccess:number|null;rushingSuccessRate:number|null;rushingExplosiveness:number|null;rushingPpa:number|null;
  completionRate:number|null;yardsPerCompletion:number|null;passingSuccessRate:number|null;passingExplosiveness:number|null;passingPpa:number|null;
  standardDownSuccessRate:number|null;passingDownSuccessRate:number|null;
};

export type SimulatedRankingRow = BcsRankingRow & {
  expectedWins: number;
  projectedWins: number;
  projectedLosses: number;
  projectedRecord: string;
  projectedWinsOver: string[];
  projectedLossesTo: string[];
  conferenceChampion: boolean;
  playoffSeed: number | null;
  schedule: SimulatedScheduleRow[];
};

export type ConferenceProjection = SimulationProjectionReceipt & {
  conference: string;
  firstTeam: string;
  secondTeam: string;
  winner: string;
  firstScore: number;
  secondScore: number;
  winnerProbability: number;
  schematicEdge: string;
};

export type BracketProjection = SimulationProjectionReceipt & {
  id: string;
  round: "First Round" | "Quarterfinal" | "Semifinal" | "Championship";
  slot: number;
  firstTeam: string;
  secondTeam: string;
  firstSeed: number;
  secondSeed: number;
  firstScore: number;
  secondScore: number;
  winner: string;
  winnerSeed: number;
  winnerProbability: number;
  campusGame: boolean;
  schematicEdge: string;
};

export type SeasonSimulation = {
  season: number;
  requestedWeek: number;
  effectiveWeek: number;
  fieldMode: "projected-field";
  format: 4 | 12;
  methodology: string;
  champion: string | null;
  championshipProbability: number | null;
  rankings: SimulatedRankingRow[];
  conferenceChampionships: ConferenceProjection[];
  bracket: BracketProjection[];
};

type OverrideableSeasonProjection={
  firstScore:number;secondScore:number;margin:number;firstWinProbability:number;schematicEdge:string;
  modelHomeSpread:number|null;modelTotal:number|null;
  homePredictedStats:SimulatedBasicProfile|null;awayPredictedStats:SimulatedBasicProfile|null;
  homePredictedAdvanced:SimulatedAdvancedProfile|null;awayPredictedAdvanced:SimulatedAdvancedProfile|null;
  edgeAnalysis?:MatchupEdgeAnalysis;
};

/**
 * A manual upset should change the winner without inventing an implausible
 * blowout. Preserve the model's scoring environment and assign a familiar
 * one-possession margin: larger surprises finish closer than near coin flips.
 */
export function realisticScenarioScore(
  firstScore:number,
  secondScore:number,
  firstWinProbability:number,
  firstTeamWins:boolean,
){
  const selectedWinProbability=firstTeamWins?firstWinProbability:1-firstWinProbability;
  const margin=selectedWinProbability<.25?3:selectedWinProbability<.35?4:selectedWinProbability<.45?6:7;
  const projectedTotal=Math.max(13,Math.round(firstScore+secondScore));
  const loserScore=Math.max(3,Math.round((projectedTotal-margin)/2));
  const winnerScore=loserScore+margin;
  return firstTeamWins
    ?{firstScore:winnerScore,secondScore:loserScore,margin}
    :{firstScore:loserScore,secondScore:winnerScore,margin:-margin};
}

export function applySimulationGameOverride(
  projection:OverrideableSeasonProjection,
  firstTeamWins:boolean,
):OverrideableSeasonProjection{
  const score=realisticScenarioScore(
    projection.firstScore,
    projection.secondScore,
    projection.firstWinProbability,
    firstTeamWins,
  );
  return {
    ...projection,
    ...score,
    schematicEdge:`Manual scenario · ${Math.abs(score.margin)}-point result`,
  };
}

function completedGameProjection(game:SimulationScheduleGame):OverrideableSeasonProjection{
  const firstScore=Number(game.homePoints);
  const secondScore=Number(game.awayPoints);
  const resultProbability=firstScore===secondScore ? .5 : firstScore>secondScore ? 1 : 0;
  const storedProbability=Number(game.pregameHomeWinProbability);
  const firstWinProbability=game.pregameHomeWinProbability!==null&&game.pregameHomeWinProbability!==undefined&&Number.isFinite(storedProbability)
    ?Math.max(0,Math.min(1,storedProbability))
    :resultProbability;
  const optionalNumber=(value:number|null|undefined)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
  return {
    firstScore,secondScore,margin:firstScore-secondScore,firstWinProbability,schematicEdge:"Final result",
    modelHomeSpread:optionalNumber(game.pregameModelHomeSpread),modelTotal:optionalNumber(game.pregameModelTotal),
    homePredictedStats:null,awayPredictedStats:null,homePredictedAdvanced:null,awayPredictedAdvanced:null,edgeAnalysis:undefined,
  };
}

/**
 * Keep the browser payload focused on what Season Sim actually renders.
 * Full matchup analysis is reproducible from a game's detail endpoint and was
 * previously duplicated for both teams across every schedule in the league.
 */
export function compactSeasonSimulationForClient(simulation:SeasonSimulation,visibleRankingCount=25):SeasonSimulation {
  return {
    ...simulation,
    rankings:simulation.rankings.map((ranking)=>({
      ...ranking,
      schedule:ranking.rank>visibleRankingCount?[]:ranking.schedule.map((game)=>{
        const {edgeAnalysis:unusedEdgeAnalysis,...compactGame}=game;
        void unusedEdgeAnalysis;
        const generated=game.gameId.startsWith("sim-");
        return {
          ...compactGame,
          homePredictedStats:generated?game.homePredictedStats:null,
          awayPredictedStats:generated?game.awayPredictedStats:null,
          homePredictedAdvanced:generated?game.homePredictedAdvanced:null,
          awayPredictedAdvanced:generated?game.awayPredictedAdvanced:null,
        };
      }),
    })),
  };
}

type RepresentativeGame = SimulatedScheduleRow & {
  winProbability:number;
  known:boolean;
  won:boolean;
};
type ProjectedRecord = {
  wins:number;losses:number;expectedWins:number;conferenceWins:number;conferenceLosses:number;
  conferenceExpectedWins:number;conferenceGames:number;winsOver:string[];lossesTo:string[];games:RepresentativeGame[];
};

export type ConferenceStandingCandidate = {
  team:string;
  conferenceWins:number;
  conferenceLosses:number;
  conferenceExpectedWins:number;
  conferenceGames:number;
  overallWins?:number;
  overallLosses?:number;
  opponentConferenceWinPct?:number;
  rating:number;
  results:Record<string,boolean>;
};

export function projectedFinalRankingScore(row:BcsRankingRow,record:{expectedWins:number;wins:number;losses:number;games:unknown[]}){
  const games=Math.max(1,record.games.length||row.wins+row.losses+row.ties);
  const expectedPct=record.expectedWins/games;
  const projectedPct=(record.wins+0.5*Math.max(0,games-record.wins-record.losses))/games;
  const scheduleProof=.45*(row.scheduleStrength??.5)+.3*(row.bestOpponentStrength??.5)+.25*(row.qualityWinStrength??.5);
  // Record remains the anchor, but an unbeaten path with no comparable test
  // cannot automatically clear a one-loss contender that has already proved
  // it can perform against an elite schedule. This is a schedule-transfer
  // adjustment, not a conference or brand bonus.
  const weakSchedulePenalty=record.losses===0
    ?Math.max(0,.58-scheduleProof)*.22
    :0;
  return 0.34*expectedPct+0.18*projectedPct+0.24*row.resultsScore+0.14*row.computerScore+0.10*row.scheduleScore-weakSchedulePenalty;
}

function recordPct(wins:number,losses:number) {
  return wins/Math.max(1,wins+losses);
}

/**
 * Shared conference-title tiebreak spine: conference record, head-to-head
 * mini-league, common conference opponents, projected conference win quality,
 * then the model ranking only as the final deterministic release valve.
 */
type ConferenceTiebreakStep="head-to-head"|"mini-league"|"common-opponents"|"opponent-record"|"overall-record"|"expected-record"|"rating";

const conferenceTiebreakProcedures:Record<string,ConferenceTiebreakStep[]>={
  ACC:["head-to-head","mini-league","common-opponents","opponent-record","overall-record","expected-record","rating"],
  "American Athletic":["head-to-head","mini-league","common-opponents","opponent-record","expected-record","rating"],
  "Big 12":["head-to-head","mini-league","common-opponents","opponent-record","overall-record","expected-record","rating"],
  "Big Ten":["head-to-head","mini-league","common-opponents","opponent-record","overall-record","expected-record","rating"],
  "Conference USA":["head-to-head","mini-league","common-opponents","opponent-record","expected-record","rating"],
  "Mid-American":["head-to-head","mini-league","common-opponents","opponent-record","expected-record","rating"],
  "Mountain West":["head-to-head","mini-league","common-opponents","opponent-record","expected-record","rating"],
  SEC:["head-to-head","mini-league","common-opponents","opponent-record","overall-record","expected-record","rating"],
  "Sun Belt":["head-to-head","mini-league","common-opponents","opponent-record","expected-record","rating"],
};

export function resolveConferenceStandings(candidates:ConferenceStandingCandidate[],conference="") {
  const conferenceTeams=new Set(candidates.map((row)=>row.team));
  const procedure=conferenceTiebreakProcedures[conference]??["head-to-head","mini-league","common-opponents","opponent-record","overall-record","expected-record","rating"];
  return [...candidates].sort((a,b)=>{
    const recordDifference=recordPct(b.conferenceWins,b.conferenceLosses)-recordPct(a.conferenceWins,a.conferenceLosses);
    if(Math.abs(recordDifference)>1e-9) return recordDifference;
    const tied=candidates.filter((row)=>Math.abs(recordPct(row.conferenceWins,row.conferenceLosses)-recordPct(a.conferenceWins,a.conferenceLosses))<1e-9);
    const tiedTeams=new Set(tied.map((row)=>row.team));
    const miniPct=(row:ConferenceStandingCandidate)=>{
      const games=Object.entries(row.results).filter(([opponent])=>tiedTeams.has(opponent));
      return games.length?games.filter(([,won])=>won).length/games.length:.5;
    };
    const commonOpponents=[...conferenceTeams].filter((opponent)=>opponent!==a.team&&opponent!==b.team&&tied.every((row)=>row.results[opponent]!==undefined));
    const commonPct=(row:ConferenceStandingCandidate)=>commonOpponents.length
      ? commonOpponents.filter((opponent)=>row.results[opponent]).length/commonOpponents.length:.5;
    for(const step of procedure) {
      if(step==="head-to-head"&&tied.length===2&&a.results[b.team]!==undefined&&b.results[a.team]!==undefined) return a.results[b.team]?-1:1;
      if(step==="mini-league") { const difference=miniPct(b)-miniPct(a); if(Math.abs(difference)>1e-9) return difference; }
      if(step==="common-opponents") { const difference=commonPct(b)-commonPct(a); if(Math.abs(difference)>1e-9) return difference; }
      if(step==="opponent-record") { const difference=(b.opponentConferenceWinPct??.5)-(a.opponentConferenceWinPct??.5); if(Math.abs(difference)>1e-9) return difference; }
      if(step==="overall-record") { const difference=recordPct(b.overallWins??0,b.overallLosses??0)-recordPct(a.overallWins??0,a.overallLosses??0); if(Math.abs(difference)>1e-9) return difference; }
      if(step==="expected-record") {
        const expectedA=a.conferenceExpectedWins/Math.max(1,a.conferenceGames),expectedB=b.conferenceExpectedWins/Math.max(1,b.conferenceGames);
        if(Math.abs(expectedB-expectedA)>1e-9) return expectedB-expectedA;
      }
      if(step==="rating"&&Math.abs(b.rating-a.rating)>1e-9) return b.rating-a.rating;
    }
    return a.team.localeCompare(b.team);
  });
}

function emptyProjectedRecord():ProjectedRecord {
  return { wins:0,losses:0,expectedWins:0,conferenceWins:0,conferenceLosses:0,conferenceExpectedWins:0,conferenceGames:0,winsOver:[],lossesTo:[],games:[] };
}

function simulatedBasicProfile(stats:{ypp:number;ypa:number;ypc:number;patt:number;ratt:number}):SimulatedBasicProfile{
  const plays=Math.max(0,stats.patt)+Math.max(0,stats.ratt);
  return {totalYards:stats.ypp*plays,yardsPerPlay:stats.ypp,passYards:stats.ypa*stats.patt,passAttempts:stats.patt,passCompletions:null,yardsPerPass:stats.ypa,rushYards:stats.ypc*stats.ratt,rushAttempts:stats.ratt,yardsPerRush:stats.ypc,turnovers:null};
}

function simulatedAdvancedProfile(advanced:ReturnType<typeof projectMatchupEngine>["homeStats"]["advanced"]):SimulatedAdvancedProfile|null{
  if(!advanced)return null;
  return {
    successRate:advanced.overall.successRate,explosiveness:advanced.overall.explosiveness,ppa:advanced.overall.ppa,
    pointsPerDrive:advanced.overall.pointsPerDrive,playsPerDrive:advanced.overall.playsPerDrive,thirdDownSuccessRate:advanced.overall.thirdDownSuccessRate,
    redZoneEfficiency:advanced.overall.redZoneEfficiency,havocRate:advanced.overall.havocRate,lineYards:advanced.run.lineYards,
    secondLevelYards:advanced.run.secondLevelYards,openFieldYards:advanced.run.openFieldYards,stuffRate:advanced.run.stuffRate,
    powerSuccess:advanced.run.powerSuccess,rushingSuccessRate:advanced.run.rushingSuccessRate,rushingExplosiveness:advanced.run.rushingExplosiveness,
    rushingPpa:advanced.run.rushingPpa,completionRate:advanced.pass.completionRate,yardsPerCompletion:advanced.pass.yardsPerCompletion,
    passingSuccessRate:advanced.pass.passingSuccessRate,passingExplosiveness:advanced.pass.passingExplosiveness,passingPpa:advanced.pass.passingPpa,
    standardDownSuccessRate:advanced.pass.standardDownSuccessRate,passingDownSuccessRate:advanced.pass.passingDownSuccessRate,
  };
}

export function projectSeasonMatchup(first: RankingProfile | undefined, second: RankingProfile | undefined, firstRank: BcsRankingRow | undefined, secondRank: BcsRankingRow | undefined, firstAtHome: boolean, includeAnalysis=true) {
  const neutral = !firstAtHome;
  const fallback = {
    offYppIndex: 1, offYpaIndex: 1, offYpcIndex: 1, offPattIndex: 1, offRattIndex: 1,
    defYppIndex: 1, defYpaIndex: 1, defYpcIndex: 1, defPattIndex: 1, defRattIndex: 1,
  };
  const a = first ?? fallback;
  const b = second ?? fallback;
  const evidence = (ranking: BcsRankingRow | undefined): MatchupEvidence => {
    return {
      gamesPlayed: (ranking?.wins ?? 0) + (ranking?.losses ?? 0) + (ranking?.ties ?? 0),
      scheduleStrength: ranking?.scheduleStrength ?? 0.5,
      bestOpponentStrength: ranking?.bestOpponentStrength ?? 0.5,
      qualityWinStrength: ranking?.qualityWinStrength ?? 0.5,
      reliability: ranking?.matchupReliability ?? 1,
    };
  };
  const firstTeam = first?.team ?? firstRank?.team ?? "First team";
  const secondTeam = second?.team ?? secondRank?.team ?? "Second team";
  const homeInput={
      team:firstTeam,
      offense:[Number(a.offYppIndex),Number(a.offYpaIndex),Number(a.offYpcIndex),Number(a.offPattIndex ?? 1),Number(a.offRattIndex ?? 1)],
      defense:[Number(a.defYppIndex),Number(a.defYpaIndex),Number(a.defYpcIndex),Number(a.defPattIndex ?? 1),Number(a.defRattIndex ?? 1)],
      evidence:evidence(firstRank),
      advanced:first?.advanced,
      outcomeRating:firstRank?.eloRating,
    };
  const awayInput={
      team:secondTeam,
      offense:[Number(b.offYppIndex),Number(b.offYpaIndex),Number(b.offYpcIndex),Number(b.offPattIndex ?? 1),Number(b.offRattIndex ?? 1)],
      defense:[Number(b.defYppIndex),Number(b.defYpaIndex),Number(b.defYpcIndex),Number(b.defPattIndex ?? 1),Number(b.defRattIndex ?? 1)],
      evidence:evidence(secondRank),
      advanced:second?.advanced,
      outcomeRating:secondRank?.eloRating,
    };
  const projection = includeAnalysis
    ?projectMatchupEngine(homeInput,awayInput,neutral)
    :{...projectMatchupCore(homeInput,awayInput,neutral),edgeAnalysis:undefined};
  const scoreCard = matchupScoreCard(projection);
  const firstScore = scoreCard.homeScore;
  const secondScore = scoreCard.awayScore;
  const analysis = projection.edgeAnalysis;
  const order = { even: 0, slight: 1, clear: 2, strong: 3 } as const;
  const topPosition = analysis?[...analysis.positionGroups].sort((left, right) => order[right.strength] - order[left.strength])[0]:undefined;
  const schematicEdge = analysis?.intelligence?.controlTeam
    ? `${analysis.intelligence.controlTeam} · ${analysis.intelligence.controlUnit}`
    : topPosition?.edgeTeam ? `${topPosition.edgeTeam} · ${topPosition.label}` : "Position groups balanced";
  return {
    firstScore,secondScore,margin:projection.margin,firstWinProbability:projection.homeWinProbability,schematicEdge,
    modelHomeSpread:projection.modelHomeSpread,modelTotal:projection.modelTotal,
    homePredictedStats:simulatedBasicProfile(projection.homeStats),awayPredictedStats:simulatedBasicProfile(projection.awayStats),
    homePredictedAdvanced:simulatedAdvancedProfile(projection.homeStats.advanced),awayPredictedAdvanced:simulatedAdvancedProfile(projection.awayStats.advanced),
    edgeAnalysis:analysis,
  };
}

function simulatedProjectionReceipt(projection:ReturnType<typeof projectSeasonMatchup>|{firstWinProbability:number}):SimulationProjectionReceipt{
  if("homePredictedStats" in projection)return {
    homeWinProbability:projection.firstWinProbability,modelHomeSpread:projection.modelHomeSpread,modelTotal:projection.modelTotal,
    homePredictedStats:projection.homePredictedStats,awayPredictedStats:projection.awayPredictedStats,
    homePredictedAdvanced:projection.homePredictedAdvanced,awayPredictedAdvanced:projection.awayPredictedAdvanced,edgeAnalysis:projection.edgeAnalysis,
  };
  return {homeWinProbability:projection.firstWinProbability,modelHomeSpread:null,modelTotal:null,homePredictedStats:null,awayPredictedStats:null,homePredictedAdvanced:null,awayPredictedAdvanced:null,edgeAnalysis:undefined};
}

function rankingGame(game: SimulationScheduleGame, firstScore: number, secondScore: number, conferenceChampionship=false): RankingGame {
  return {
    gameId: game.gameId,
    week: game.week,
    startDate: game.startDate,
    neutralSite: game.neutralSite,
    conferenceGame:game.conferenceGame,
    homeConference:game.homeConference,
    awayConference:game.awayConference,
    homeTeam: game.homeTeam,
    homePoints: firstScore,
    awayTeam: game.awayTeam,
    awayPoints: secondScore,
    seasonType:game.seasonType,
    conferenceChampionship,
  };
}

function simulateBracket(field: Array<{ seed: number; team: string }>, profiles: Map<string, RankingProfile>, rankings: Map<string, BcsRankingRow>, format: 4 | 12) {
  const games: BracketProjection[] = [];
  const bySeed = new Map(field.map((entry) => [entry.seed, entry]));
  const play = (round: BracketProjection["round"], slot: number, first: { seed: number; team: string }, second: { seed: number; team: string }, campusGame = false) => {
    const projection = projectSeasonMatchup(profiles.get(first.team), profiles.get(second.team), rankings.get(first.team), rankings.get(second.team), campusGame);
    const firstWins = projection.margin >= 0;
    const winner = firstWins ? first : second;
    const game: BracketProjection = {
      ...simulatedProjectionReceipt(projection),
      id: `${round}-${slot}`,
      round,
      slot,
      firstTeam: first.team,
      secondTeam: second.team,
      firstSeed: first.seed,
      secondSeed: second.seed,
      firstScore: projection.firstScore,
      secondScore: projection.secondScore,
      winner: winner.team,
      winnerSeed: winner.seed,
      winnerProbability: firstWins ? projection.firstWinProbability : 1 - projection.firstWinProbability,
      campusGame,
      schematicEdge: projection.schematicEdge,
    };
    games.push(game);
    return winner;
  };

  if (format === 4) {
    const semifinalOne = play("Semifinal", 1, bySeed.get(1)!, bySeed.get(4)!);
    const semifinalTwo = play("Semifinal", 2, bySeed.get(2)!, bySeed.get(3)!);
    const champion = play("Championship", 1, semifinalOne, semifinalTwo);
    return { games, champion };
  }

  const roundOne = new Map<number, { seed: number; team: string }>();
  roundOne.set(1, play("First Round", 1, bySeed.get(5)!, bySeed.get(12)!, true));
  roundOne.set(2, play("First Round", 2, bySeed.get(6)!, bySeed.get(11)!, true));
  roundOne.set(3, play("First Round", 3, bySeed.get(7)!, bySeed.get(10)!, true));
  roundOne.set(4, play("First Round", 4, bySeed.get(8)!, bySeed.get(9)!, true));
  const quarterfinalOne = play("Quarterfinal", 1, bySeed.get(1)!, roundOne.get(4)!);
  const quarterfinalTwo = play("Quarterfinal", 2, bySeed.get(4)!, roundOne.get(1)!);
  const quarterfinalThree = play("Quarterfinal", 3, bySeed.get(2)!, roundOne.get(3)!);
  const quarterfinalFour = play("Quarterfinal", 4, bySeed.get(3)!, roundOne.get(2)!);
  const semifinalOne = play("Semifinal", 1, quarterfinalOne, quarterfinalTwo);
  const semifinalTwo = play("Semifinal", 2, quarterfinalThree, quarterfinalFour);
  const champion = play("Championship", 1, semifinalOne, semifinalTwo);
  return { games, champion };
}

export function buildSeasonSimulation(season: number, requestedWeek: number, effectiveWeek: number, schedule: SimulationScheduleGame[], profiles: RankingProfile[], options:SeasonSimulationOptions={}): SeasonSimulation {
  const profileMap = new Map(profiles.map((profile) => [profile.team, profile]));
  const conferenceChampionshipIds=conferenceChampionshipGameIds(schedule);
  const regularSchedule=schedule.filter((game)=>game.seasonType!=="postseason"&&!conferenceChampionshipIds.has(game.gameId));
  const storedChampionshipByConference=new Map<string,SimulationScheduleGame>();
  for(const game of schedule.filter((row)=>conferenceChampionshipIds.has(row.gameId))){
    const conference=gameConference(game)??profileMap.get(game.homeTeam)?.conference??profileMap.get(game.awayTeam)?.conference;
    if(conference)storedChampionshipByConference.set(conference,game);
  }
  const overrideByGame=new Map((options.gameOverrides??[]).map((override)=>[override.gameId,override.winnerTeam]));
  const resolvedCompletedProjection=(game:SimulationScheduleGame)=>{
    const baseline=completedGameProjection(game);
    const overrideWinner=overrideByGame.get(game.gameId);
    const validOverride=overrideWinner===game.homeTeam||overrideWinner===game.awayTeam;
    return validOverride?applySimulationGameOverride(baseline,overrideWinner===game.homeTeam):baseline;
  };
  const completedThroughWeek = schedule.filter((game) => game.seasonType !== "postseason" && game.week <= effectiveWeek && Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null)
    .map((game) => {
      const projection=resolvedCompletedProjection(game);
      return rankingGame(game,projection.firstScore,projection.secondScore,conferenceChampionshipIds.has(game.gameId));
    });
  const currentRankings = buildBcsRankings(completedThroughWeek, profiles, { usePreseasonElo: true });
  const currentRankingMap = new Map(currentRankings.map((row) => [row.team, row]));
  const projectedGames: RankingGame[] = [];
  const teamRecords = new Map(profiles.map((profile) => [profile.team, emptyProjectedRecord()]));
  const conferenceResults = new Map<string,Record<string,boolean>>();

  for (const game of regularSchedule) {
    const known = game.week <= effectiveWeek && Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null;
    const rawProjection = known
      ? completedGameProjection(game)
      : projectSeasonMatchup(profileMap.get(game.homeTeam), profileMap.get(game.awayTeam), currentRankingMap.get(game.homeTeam), currentRankingMap.get(game.awayTeam), !Boolean(game.neutralSite), false);
    const overrideWinner=overrideByGame.get(game.gameId);
    const validOverride=overrideWinner===game.homeTeam||overrideWinner===game.awayTeam;
    const projection=validOverride?applySimulationGameOverride(rawProjection,overrideWinner===game.homeTeam):rawProjection;
    // Keep the pregame receipt visible. Completed and manually fixed results
    // contribute one or zero expected wins because their scenario outcome is
    // no longer uncertain; untouched future games retain model probability.
    const projectionReceipt=simulatedProjectionReceipt(projection);
    projectedGames.push(rankingGame(game, projection.firstScore, projection.secondScore));
    const homeWins = projection.firstScore > projection.secondScore;
    const scenarioHomeWin=known||validOverride?(homeWins?1:0):projection.firstWinProbability;
    const homeRecord = teamRecords.get(game.homeTeam);
    const awayRecord = teamRecords.get(game.awayTeam);
    const homeRecordAfter = homeRecord
      ? `${homeRecord.wins+(homeWins?1:0)}–${homeRecord.losses+(homeWins?0:1)}`
      : "—";
    const awayRecordAfter = awayRecord
      ? `${awayRecord.wins+(homeWins?0:1)}–${awayRecord.losses+(homeWins?1:0)}`
      : "—";
    if (homeRecord) {
      homeRecord.expectedWins += scenarioHomeWin;
      if (homeWins) { homeRecord.wins += 1; homeRecord.winsOver.push(game.awayTeam); }
      else { homeRecord.losses += 1; homeRecord.lossesTo.push(game.awayTeam); }
      homeRecord.games.push({
        ...projectionReceipt,
        gameId:game.gameId,
        opponent:game.awayTeam,
        location:Boolean(game.neutralSite)?"NEUTRAL":"HOME",
        status:known?"final":"projected",
        teamScore:projection.firstScore,
        opponentScore:projection.secondScore,
        recordAfter:`${homeRecord.wins}–${homeRecord.losses}`,
        homeTeam:game.homeTeam,
        awayTeam:game.awayTeam,
        homeScore:projection.firstScore,
        awayScore:projection.secondScore,
        homeRecordAfter,
        awayRecordAfter,
        neutralSite:Boolean(game.neutralSite),
        week:game.week,
        seasonType:"regular",
        winProbability:projection.firstWinProbability,
        known,
        won:homeWins,
      });
      if (game.conferenceGame && game.homeConference && game.homeConference === game.awayConference) {
        homeRecord.conferenceGames += 1;
        homeRecord.conferenceExpectedWins += scenarioHomeWin;
        if (homeWins) homeRecord.conferenceWins += 1;
        else homeRecord.conferenceLosses += 1;
        conferenceResults.set(game.homeTeam,{...(conferenceResults.get(game.homeTeam)??{}),[game.awayTeam]:homeWins});
      }
    }
    if (awayRecord) {
      awayRecord.expectedWins += 1-scenarioHomeWin;
      if (homeWins) { awayRecord.losses += 1; awayRecord.lossesTo.push(game.homeTeam); }
      else { awayRecord.wins += 1; awayRecord.winsOver.push(game.homeTeam); }
      awayRecord.games.push({
        ...projectionReceipt,
        gameId:game.gameId,
        opponent:game.homeTeam,
        location:Boolean(game.neutralSite)?"NEUTRAL":"AWAY",
        status:known?"final":"projected",
        teamScore:projection.secondScore,
        opponentScore:projection.firstScore,
        recordAfter:`${awayRecord.wins}–${awayRecord.losses}`,
        homeTeam:game.homeTeam,
        awayTeam:game.awayTeam,
        homeScore:projection.firstScore,
        awayScore:projection.secondScore,
        homeRecordAfter,
        awayRecordAfter,
        neutralSite:Boolean(game.neutralSite),
        week:game.week,
        seasonType:"regular",
        winProbability:1-projection.firstWinProbability,
        known,
        won:!homeWins,
      });
      if (game.conferenceGame && game.homeConference && game.homeConference === game.awayConference) {
        awayRecord.conferenceGames += 1;
        awayRecord.conferenceExpectedWins += 1-scenarioHomeWin;
        if (homeWins) awayRecord.conferenceLosses += 1;
        else awayRecord.conferenceWins += 1;
        conferenceResults.set(game.awayTeam,{...(conferenceResults.get(game.awayTeam)??{}),[game.homeTeam]:!homeWins});
      }
    }
  }

  const preliminaryRankings = buildBcsRankings(projectedGames, profiles, { usePreseasonElo: true });
  const preliminaryMap = new Map(preliminaryRankings.map((row) => [row.team, row]));
  const conferences = new Map<string, RankingProfile[]>();
  for (const profile of profiles) {
    const conference = profile.conference?.trim();
    if (!conference || /independent/i.test(conference)) continue;
    const rows = conferences.get(conference) ?? [];
    rows.push(profile);
    conferences.set(conference, rows);
  }

  const conferenceChampionships: ConferenceProjection[] = [];
  const championshipGames: RankingGame[] = [];
  for (const [conference, conferenceTeams] of [...conferences].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (conferenceTeams.length < 2) continue;
    const orderedNames=resolveConferenceStandings(conferenceTeams.map((team)=>{
      const record=teamRecords.get(team.team)??emptyProjectedRecord();
      const opponents=Object.keys(conferenceResults.get(team.team)??{});
      const opponentConferenceWinPct=opponents.length?opponents.reduce((sum,opponent)=>{
        const opponentRecord=teamRecords.get(opponent)??emptyProjectedRecord();
        return sum+recordPct(opponentRecord.conferenceWins,opponentRecord.conferenceLosses);
      },0)/opponents.length:.5;
      return {
        team:team.team,conferenceWins:record.conferenceWins,conferenceLosses:record.conferenceLosses,
        conferenceExpectedWins:record.conferenceExpectedWins,conferenceGames:record.conferenceGames,
        overallWins:record.wins,overallLosses:record.losses,opponentConferenceWinPct,
        rating:1000-(preliminaryMap.get(team.team)?.rank??999),results:conferenceResults.get(team.team)??{},
      };
    }),conference);
    const profileByName=new Map(conferenceTeams.map((team)=>[team.team,team]));
    const ordered=orderedNames.map((row)=>profileByName.get(row.team)!).filter(Boolean);
    const storedGame=storedChampionshipByConference.get(conference);
    const storedGameKnown=Boolean(storedGame&&storedGame.week<=effectiveWeek&&storedGame.completed&&storedGame.homePoints!==null&&storedGame.awayPoints!==null);
    const first = storedGameKnown?profileByName.get(storedGame!.homeTeam):ordered[0];
    const second = storedGameKnown?profileByName.get(storedGame!.awayTeam):ordered[1];
    if(!first||!second)continue;
    const titleGame=storedGameKnown?storedGame!:null;
    const gameId=titleGame?.gameId??`sim-${season}-${conference}`;
    const titleWeek=titleGame?.week??15;
    const titleNeutral=titleGame?Boolean(titleGame.neutralSite):true;
    const baselineProjection = titleGame
      ?completedGameProjection(titleGame)
      :projectSeasonMatchup(first, second, currentRankingMap.get(first.team), currentRankingMap.get(second.team), false);
    const overrideWinner=overrideByGame.get(gameId);
    const validOverride=overrideWinner===first.team||overrideWinner===second.team;
    const projection=validOverride?applySimulationGameOverride(baselineProjection,overrideWinner===first.team):baselineProjection;
    const projectionReceipt=simulatedProjectionReceipt(projection);
    const firstWins = projection.margin >= 0;
    const scenarioFirstWin=titleGame||validOverride?(firstWins?1:0):projection.firstWinProbability;
    const winner = firstWins ? first.team : second.team;
    const firstRecord = teamRecords.get(first.team);
    const secondRecord = teamRecords.get(second.team);
    const firstRecordAfter = firstRecord
      ? `${firstRecord.wins+(firstWins?1:0)}–${firstRecord.losses+(firstWins?0:1)}`
      : "—";
    const secondRecordAfter = secondRecord
      ? `${secondRecord.wins+(firstWins?0:1)}–${secondRecord.losses+(firstWins?1:0)}`
      : "—";
    if (firstRecord) {
      firstRecord.expectedWins += scenarioFirstWin;
      if (firstWins) { firstRecord.wins += 1; firstRecord.winsOver.push(second.team); }
      else { firstRecord.losses += 1; firstRecord.lossesTo.push(second.team); }
      firstRecord.games.push({
        ...projectionReceipt,
        gameId,
        opponent:second.team,
        location:titleNeutral?"NEUTRAL":"HOME",
        status:titleGame?"final":"projected",
        teamScore:projection.firstScore,
        opponentScore:projection.secondScore,
        recordAfter:`${firstRecord.wins}–${firstRecord.losses}`,
        homeTeam:first.team,
        awayTeam:second.team,
        homeScore:projection.firstScore,
        awayScore:projection.secondScore,
        homeRecordAfter:firstRecordAfter,
        awayRecordAfter:secondRecordAfter,
        neutralSite:titleNeutral,
        week:titleWeek,
        seasonType:"conference-championship",
        winProbability:projection.firstWinProbability,
        known:Boolean(titleGame),
        won:firstWins,
      });
    }
    if (secondRecord) {
      secondRecord.expectedWins += 1-scenarioFirstWin;
      if (firstWins) { secondRecord.losses += 1; secondRecord.lossesTo.push(first.team); }
      else { secondRecord.wins += 1; secondRecord.winsOver.push(first.team); }
      secondRecord.games.push({
        ...projectionReceipt,
        gameId,
        opponent:first.team,
        location:titleNeutral?"NEUTRAL":"AWAY",
        status:titleGame?"final":"projected",
        teamScore:projection.secondScore,
        opponentScore:projection.firstScore,
        recordAfter:`${secondRecord.wins}–${secondRecord.losses}`,
        homeTeam:first.team,
        awayTeam:second.team,
        homeScore:projection.firstScore,
        awayScore:projection.secondScore,
        homeRecordAfter:firstRecordAfter,
        awayRecordAfter:secondRecordAfter,
        neutralSite:titleNeutral,
        week:titleWeek,
        seasonType:"conference-championship",
        winProbability:1-projection.firstWinProbability,
        known:Boolean(titleGame),
        won:!firstWins,
      });
    }
    conferenceChampionships.push({ ...projectionReceipt, conference, firstTeam: first.team, secondTeam: second.team, winner, firstScore: projection.firstScore, secondScore: projection.secondScore, winnerProbability: firstWins ? projection.firstWinProbability : 1 - projection.firstWinProbability, schematicEdge: projection.schematicEdge });
    championshipGames.push(titleGame
      ?rankingGame(titleGame,projection.firstScore,projection.secondScore,true)
      :{ gameId, week: titleWeek, startDate: null, neutralSite: true, conferenceGame:true, homeConference:conference, awayConference:conference, homeTeam: first.team, homePoints: projection.firstScore, awayTeam: second.team, awayPoints: projection.secondScore, seasonType:"conference-championship", conferenceChampionship:true });
  }

  const rawFinalRankings = buildBcsRankings([...projectedGames, ...championshipGames], profiles, { usePreseasonElo: true });
  // A point estimate can make a team go 12–0 simply because it is favored by
  // one point twelve times. Expected wins and the representative projected
  // record therefore lead the order. Results and team strength preserve a
  // strong two-loss team that is projected to win out; SOS cannot elevate a
  // team merely because the model expects it to keep losing to good teams.
  const finalRankings = [...rawFinalRankings].sort((a,b) => {
    const aRecord=teamRecords.get(a.team)??emptyProjectedRecord();
    const bRecord=teamRecords.get(b.team)??emptyProjectedRecord();
    return projectedFinalRankingScore(b,bRecord)-projectedFinalRankingScore(a,aRecord)||b.bcsScore-a.bcsScore||a.rank-b.rank||a.team.localeCompare(b.team);
  }).map((row,index)=>({...row,rank:index+1}));
  const finalRankingMap = new Map(finalRankings.map((row) => [row.team, row]));
  const championSet = new Set(conferenceChampionships.map((row) => row.winner));
  const format: 4 | 12 = season <= 2023 ? 4 : 12;
  // The playoff is an output of Season Sim, not a reproduction of the real
  // selection committee. Rank 1 receives seed 1 and the cutoff is exactly the
  // simulated field size; conference titles influence the ranking résumé but
  // never replace a higher-ranked team with an automatic qualifier.
  const field = finalRankings.slice(0,format).map((row)=>({seed:row.rank,team:row.team}));
  const fieldMode:SeasonSimulation["fieldMode"]="projected-field";

  const validField = field.filter((entry) => profileMap.has(entry.team));
  const bracket = validField.length === format ? simulateBracket(validField, profileMap, currentRankingMap, format) : { games: [] as BracketProjection[], champion: null };
  const seedMap = new Map(field.map((entry) => [entry.team, entry.seed]));
  const rankings: SimulatedRankingRow[] = finalRankings.map((row) => {
    const record = teamRecords.get(row.team) ?? emptyProjectedRecord();
    const opponentRank = (team: string) => finalRankingMap.get(team)?.rank ?? 999;
    // The visible path must be auditable game by game. Do not redistribute
    // expected wins across the schedule: doing so can mark a team as losing a
    // matchup that the Matchup Lab actually projects it to win.
    const representativeWins = record.games.filter((game)=>game.won);
    const representativeLosses = record.games.filter((game)=>!game.won);
    const projectedWins = representativeWins.length;
    const projectedLosses = representativeLosses.length;
    const biggestWins = [...new Set(representativeWins.map((game)=>game.opponent))].sort((a, b) => opponentRank(a) - opponentRank(b) || a.localeCompare(b)).slice(0, 3);
    const worstLosses = [...new Set(representativeLosses.map((game)=>game.opponent))].sort((a, b) => opponentRank(b) - opponentRank(a) || a.localeCompare(b)).slice(0, 3);
    const teamSchedule:SimulatedScheduleRow[]=record.games.map((game)=>({
      gameId:game.gameId,
      opponent:game.opponent,
      location:game.location,
      status:game.status,
      teamScore:game.teamScore,
      opponentScore:game.opponentScore,
      recordAfter:game.recordAfter,
      homeTeam:game.homeTeam,
      awayTeam:game.awayTeam,
      homeScore:game.homeScore,
      awayScore:game.awayScore,
      homeRecordAfter:game.homeRecordAfter,
      awayRecordAfter:game.awayRecordAfter,
      neutralSite:game.neutralSite,
      week:game.week,
      seasonType:game.seasonType,
      homeWinProbability:game.homeWinProbability,
      modelHomeSpread:game.modelHomeSpread,
      modelTotal:game.modelTotal,
      homePredictedStats:game.homePredictedStats,
      awayPredictedStats:game.awayPredictedStats,
      homePredictedAdvanced:game.homePredictedAdvanced,
      awayPredictedAdvanced:game.awayPredictedAdvanced,
      edgeAnalysis:game.edgeAnalysis,
    }));
    return { ...row, expectedWins: record.expectedWins, projectedWins, projectedLosses, projectedRecord: `${projectedWins}–${projectedLosses}`, projectedWinsOver: biggestWins, projectedLossesTo: worstLosses, conferenceChampion: championSet.has(row.team), playoffSeed: seedMap.get(row.team) ?? null, schedule:teamSchedule };
  });
  const championshipGame = bracket.games.at(-1);
  return {
    season,
    requestedWeek,
    effectiveWeek,
    fieldMode,
    format,
    methodology: `Every future game is run through the exact Matchup Lab engine using the selected weekly snapshot: all five production and volume indices, advanced position-group metrics, opponent proof, offensive viability, shared possessions, points per possession and the same snapshot Elo. The displayed record, best wins and losses are the game-by-game Matchup Lab path; expected wins remains the uncertainty-weighted season average. The final order also tests how much schedule proof supports that record, so an unbeaten weak-schedule path does not automatically clear a one-loss team proven against elite opponents. The engine inputs remain fixed as the season advances, so a schedule, conference-title or playoff matchup reproduces the Matchup Lab result when the teams and site match. Regular-season games, conference championships and postseason games are separate phases: once a stored title result is available it replaces, rather than duplicates, the generated conference championship. Conference participants are selected by conference record, head-to-head mini-league and common-opponent procedures before model rating is used. The playoff field and seeds follow the final Season Sim ranking exactly: rank 1 is seed 1 through the ${format}-team cutoff, with no real-life bracket placement or automatic qualifier replacing a higher-ranked team.${options.gameOverrides?.length?" Manual scenario results are fixed before conference standings, final rankings and the projected playoff field are rebuilt.":""}`,
    champion: bracket.champion?.team ?? null,
    championshipProbability: championshipGame?.winnerProbability ?? null,
    rankings,
    conferenceChampionships,
    bracket: bracket.games,
  };
}
