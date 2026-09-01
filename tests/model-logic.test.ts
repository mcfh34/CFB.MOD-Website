import test from "node:test";
import assert from "node:assert/strict";

import { buildBcsRankings, finalMatchupRating, type RankingGame, type RankingProfile } from "../lib/rankings";
import { applyPreseasonRosterAdjustments, ARCHIVE_BATCH_MAX_SLICES, ARCHIVE_BATCH_PAUSE_MS, ARCHIVE_REPAIR_COOLDOWN_SECONDS, buildPregameElo, claimArchiveRepair, FIRST_HISTORICAL_SEASON, jsonRowBatches, normalizeAdvancedStats, normalizePreseasonInputs, normalizeStats, project, scheduleCalibrationWeights, upsertJsonRows, weeklySourceCoverageComplete, type NormalizedGame, type PipelineEnv, type PreseasonInput, type Profile } from "../lib/dataPipeline";
import { advancedMetricIndex, advancedMetricKeys, derivePassingEfficiency, emptyAdvancedMetricValues, projectAdvancedSide, type AdvancedMetricValues, type AdvancedProfile } from "../lib/advancedMetrics";
import { buildWeeklyAdvancedProfiles, type AdvancedBaseStatRow, type AdvancedGameComponentRow } from "../lib/advancedProfileBuilder";
import { analyzeMatchupEdges } from "../lib/matchupAnalysis";
import { matchupScoreCard, projectMatchupEngine } from "../lib/matchupEngine";
import { buildMatchupEvidence, projectCalibratedMatchup, validateMatchupProfile } from "../lib/matchupModel";
import { applySimulationGameOverride, buildSeasonSimulation, compactSeasonSimulationForClient, projectSeasonMatchup, projectedFinalRankingScore, realisticScenarioScore, resolveConferenceStandings, type SimulationScheduleGame } from "../lib/simulation";
import { buildPossessionScoreReceipt, estimatePoints, scoringModelFeatures } from "../lib/scoringModel";
import { TEAM_STATS_ADVANCED_METRICS, TEAM_STATS_SORT_COLUMNS, defaultTeamStatsSortDirection, formatTeamStatsValue, sortTeamStatsRows, teamStatsColumns, type TeamStatsSortableRow } from "../lib/teamStatsSort";
import { evaluateMarketProjection } from "../lib/marketModel";
import { modelSpreadRead, modelTotalRead, officialAtsSetRead } from "../lib/gameMarketSummary";
import { isStoredMarketLineQuarantined, selectMarketLineCandidate, wilsonConfidenceInterval, type MarketLineCandidate } from "../lib/marketLineQuality";
import { buildRoundRobinStandings, type RoundRobinProfile } from "../lib/roundRobin";
import { buildConferenceStandings, conferenceDivision, conferenceRuleProfile, type ConferenceStandingGame, type ConferenceStandingTeam } from "../lib/conferenceStandings";
import { POWER_4_FILTER, conferenceFilterSqlValues, matchesConferenceFilter } from "../lib/conferenceFilters";
import { enteringWeekSnapshotWeek, rankingAppliesToWeek, scoreRankingSnapshotWeek } from "../lib/weeklyRankingSnapshot";
import { latestTeamProfilesAtOrBeforeWeek } from "../lib/profileSnapshots";
import { buildTacticalPlan } from "../lib/tacticalPlan";
import { buildPlayDiagram, defenseFormations, offenseFormations } from "../lib/playDiagram";
import { buildSideGamePlan } from "../lib/matchupIntelligence";
import { assessOffensiveViability, deriveViabilityCalibration, discoverViabilityThreshold, historicalViabilityCalibration } from "../lib/offensiveViability";
import { compareScheduleRows, matchesSchedulePickFilter, type ScheduleFilterRow } from "../lib/scheduleFilters";
import { scheduleGameLabel } from "../lib/scheduleLabels";
import { driveLogoCoverage, resolveTeamLogoAsset, teamLogoAssets } from "../lib/teamLogoAssets";
import { calculateScheduleFilterMetrics } from "../lib/scheduleMetrics";
import { scatterDomain, scatterMean, scatterPosition, scatterRegression, scatterTicks } from "../lib/scatterplot";
import { buildScheduleRecordTimeline, type ScheduleRecordGame } from "../lib/scheduleRecords";
import { assignFormationPlayers, buildOffensiveLineUnitProfile, buildTeamPlayerModel, playerBasicMetric, playerBoxEfficiency, playerRatingSourceLabel, playerRecruitingLabel, repairTeamPlayerModelDepth } from "../lib/playerModel";
import { applyPlayerProductionRatings, comparePlayerRatingEvidence, empiricalProductionPercentiles, opponentAdjustedOffensiveLineScore, playerOverallTier, productionOverallFromPercentile, productionPercentileFromScale, productionRatingFromScale, projectedProductionRating, provisionalProductionOverallFromPercentile } from "../lib/playerProductionRatings";
import { playerRatingCompositeScore } from "../lib/playerRatingFormula";
import { PLAYER_STATS_POSITIONS, defensiveTackleUnitJerseyNumber, offensiveLineJerseyNumber, defaultPlayerStatsSortDirection, formatPlayerStatsValue, historicalProductionRank, playerMeetsScatterParticipationThreshold, playerQualifiesForStat, playerStatsColumns, playerStatsDefaultSortKey, playerStatsMetricColumns, playerStatsOrdinalRanks, playerStatsQualification, sortPlayerStatsRows, type PlayerStatsSortableRow } from "../lib/playerStats";
import { aggregatePlayerGameLines, comparePlayerWeeklyGames, playerGameBoxLines, playerWeeklyBoxGames, playerWeeklyPpaGames, playerWeeklySuccessGames } from "../lib/playerWeekly";
import { deriveMatchupIntelligence, deriveRosterStability, deriveTeamIdentity, deriveTeamMovement, deriveTeamStability, findHistoricalComparisons, type FootballProfile } from "../lib/footballIntelligence";
import { depthChartSourceId, validateDepthChart } from "../lib/depthChartArchive";
import { listPublishedDepthCharts } from "../lib/publishedDepthCharts";
import { PFF_TABLES, pffFallbackJersey, pffMetricSampleQualified, pffMetrics, pffPositionMatches, pffRowQualified, resolvePffTeam, type PffCell, type PffTablePayload } from "../lib/pffVisualizer";
import { buildMatchupContext, matchupProfileSimilarity, type MatchupContextGameRow, type MatchupContextProfile } from "../lib/matchupContext";
import { buildMatchupFieldMap, buildPffFieldTendency } from "../lib/matchupFieldMap";
import { conferenceChampionshipGameIds } from "../lib/gamePhases";
import { buildWinConditionAnalysis, evaluateWinConditionScenario, type WinConditionHistoricalSample } from "../lib/winConditions";
import {
  buildLegacyPreseasonProfiles,
  buildPreseasonStateTransition,
  calculateFinalEloRatings,
  PRESEASON_TRANSITION_V2,
  type PreseasonHistoryRow,
  type PreseasonTransitionInput,
  type PreseasonTransitionProfile,
} from "../lib/preseasonTransition";

function profile(team: string, conference: string, power = 1): RankingProfile {
  return {
    team,
    conference,
    offYppIndex: power,
    offYpaIndex: power,
    offYpcIndex: power,
    defYppIndex: 2 - power,
    defYpaIndex: 2 - power,
    defYpcIndex: 2 - power,
  };
}

test("sparse opening-week updates retain the complete preseason team field",()=>{
  const preseason=Array.from({length:138},(_,index)=>({
    team:`Team ${String(index+1).padStart(3,"0")}`,
    week:0,
    value:`pre-${index}`,
  }));
  const openingWeek=preseason.slice(0,16).map((row,index)=>({...row,week:1,value:`post-${index}`}));
  const snapshot=latestTeamProfilesAtOrBeforeWeek([...preseason,...openingWeek],1);

  assert.equal(snapshot.length,138);
  assert.equal(snapshot.filter((row)=>row.week===1).length,16);
  assert.equal(snapshot.filter((row)=>row.week===0).length,122);
  assert.equal(snapshot.find((row)=>row.team==="Team 001")?.value,"post-0");
  assert.equal(snapshot.find((row)=>row.team==="Team 138")?.value,"pre-137");
});

function rankingGame(id: string, week: number, homeTeam: string, homePoints: number, awayTeam: string, awayPoints: number): RankingGame {
  return { gameId: id, week, startDate: `2026-10-${String(Math.min(28, week)).padStart(2, "0")}T00:00:00Z`, neutralSite: true, homeTeam, homePoints, awayTeam, awayPoints };
}

function opponentWins(team: string, count: number, prefix: string): RankingGame[] {
  return Array.from({ length: count }, (_, index) => rankingGame(`${prefix}-${index}`, index + 1, team, 31, `${prefix} Filler ${index}`, 14));
}

function advancedProfile(offense: Partial<AdvancedMetricValues>, defense: Partial<AdvancedMetricValues>): AdvancedProfile {
  const baseline: AdvancedMetricValues = {
    ...emptyAdvancedMetricValues(),
    pointsPerGame: 27,
    lineYards: 2.8,
    secondLevelYards: 1.1,
    openFieldYards: 0.65,
    completionRate: 0.62,
    yardsPerCompletion: 11.8,
    passingSuccessRate: 0.42,
    passingExplosiveness: 1.25,
  };
  const side = (indices: Partial<AdvancedMetricValues>) => {
    const index = { ...emptyAdvancedMetricValues(), ...indices };
    const raw = Object.fromEntries(advancedMetricKeys.map((key) => [key, index[key] === null ? null : baseline[key]! * index[key]!])) as AdvancedMetricValues;
    return { raw, index };
  };
  return {
    source:"cfbd-advanced",
    rushingDefinition:"line-and-open-field-proxy",
    passingDefinition:"box-score-and-cfbd-proxy",
    baseline,
    offense:side(offense),
    defense:side(defense),
    coverage:{advancedGames:8,completionGames:8},
  };
}

function intelligenceProfile(team:string,season=2025,overrides:Partial<FootballProfile>={}):FootballProfile {
  return {
    season,week:10,team,gamesPlayed:8,
    offYppIndex:1,offYpaIndex:1,offYpcIndex:1,offPattIndex:1,offRattIndex:1,
    defYppIndex:1,defYpaIndex:1,defYpcIndex:1,defPattIndex:1,defRattIndex:1,
    matchupReliability:.9,
    advancedProfile:advancedProfile({
      passingSuccessRate:1,passingExplosiveness:1,rushingSuccessRate:1,rushingExplosiveness:1,
      lineYards:1,secondLevelYards:1,openFieldYards:1,completionRate:1,yardsPerCompletion:1,
    },{
      passingSuccessRate:1,passingExplosiveness:1,rushingSuccessRate:1,rushingExplosiveness:1,
      lineYards:1,secondLevelYards:1,openFieldYards:1,completionRate:1,yardsPerCompletion:1,
    }),
    ...overrides,
  };
}

test("scatterplot domains, ticks, averages and coordinates remain stable",()=>{
  const domain=scatterDomain([.4,.5,.6]);
  assert.ok(domain.min<.4);
  assert.ok(domain.max>.6);
  assert.equal(scatterTicks(domain,5).length,5);
  assert.equal(scatterMean([1,2,3]),2);
  assert.equal(scatterPosition(domain.min,domain),0);
  assert.equal(scatterPosition(domain.max,domain),1);
  assert.deepEqual(scatterDomain([]),{min:0,max:1});
});

test("matchup context measures opponent-relative effects and finds the closest prior unit",()=>{
  const profiles:MatchupContextProfile[]=[
    {team:"Alpha",offYpaIndex:1.08,offYpcIndex:1.12,defYpaIndex:.88,defYpcIndex:.82},
    {team:"Beta",offYpaIndex:1.18,offYpcIndex:1.2,defYpaIndex:.8,defYpcIndex:.82},
    {team:"Gamma",offYpaIndex:1.16,offYpcIndex:1.18,defYpaIndex:.82,defYpcIndex:.84},
    {team:"Delta",offYpaIndex:.78,offYpcIndex:.75,defYpaIndex:1.22,defYpcIndex:1.2},
  ];
  const game=(row:Partial<MatchupContextGameRow>&Pick<MatchupContextGameRow,"gameId"|"week"|"homeTeam"|"awayTeam"|"team"|"opponent">):MatchupContextGameRow=>({
    points:null,yardsPerPlay:null,yardsPerPass:null,yardsPerRush:null,passAttempts:null,rushAttempts:null,
    predictedHomeScore:null,predictedAwayScore:null,...row,
  });
  const games:MatchupContextGameRow[]=[
    game({gameId:"g1",week:5,homeTeam:"Alpha",awayTeam:"Gamma",team:"Alpha",opponent:"Gamma",points:31,yardsPerPlay:6.9,yardsPerPass:8,yardsPerRush:6,passAttempts:25,rushAttempts:30,rushingSuccessRate:.5,rushingPpa:.25,passingSuccessRate:.52,passingPpa:.35,predictedHomeScore:24,predictedAwayScore:21}),
    game({gameId:"g1",week:5,homeTeam:"Alpha",awayTeam:"Gamma",team:"Gamma",opponent:"Alpha",points:17,yardsPerPlay:4.1,yardsPerPass:5,yardsPerRush:3,passAttempts:30,rushAttempts:25,rushingSuccessRate:.3,rushingPpa:-.05,passingSuccessRate:.34,passingPpa:-.08,predictedHomeScore:24,predictedAwayScore:21}),
    game({gameId:"g2",week:7,homeTeam:"Delta",awayTeam:"Gamma",team:"Delta",opponent:"Gamma",points:21,yardsPerPlay:5.3,yardsPerPass:7,yardsPerRush:4,passAttempts:27,rushAttempts:32,rushingSuccessRate:.4,rushingPpa:.1,passingSuccessRate:.45,passingPpa:.2}),
    game({gameId:"g2",week:7,homeTeam:"Delta",awayTeam:"Gamma",team:"Gamma",opponent:"Delta",points:24,yardsPerPlay:5.7,yardsPerPass:6.5,yardsPerRush:5,passAttempts:28,rushAttempts:29,rushingSuccessRate:.45,rushingPpa:.15,passingSuccessRate:.43,passingPpa:.1}),
    game({gameId:"bowl",week:1,seasonType:"postseason",startDate:"2025-12-20T00:00:00Z",homeTeam:"Alpha",awayTeam:"Delta",team:"Alpha",opponent:"Delta",points:70,yardsPerPlay:12,yardsPerPass:15,yardsPerRush:10,passAttempts:20,rushAttempts:40,predictedHomeScore:28,predictedAwayScore:20}),
    game({gameId:"bowl",week:1,seasonType:"postseason",startDate:"2025-12-20T00:00:00Z",homeTeam:"Alpha",awayTeam:"Delta",team:"Delta",opponent:"Alpha",points:0,yardsPerPlay:1,yardsPerPass:1,yardsPerRush:1,passAttempts:30,rushAttempts:20,predictedHomeScore:28,predictedAwayScore:20}),
  ];
  const context=buildMatchupContext({season:2025,requestedWeek:10,effectiveWeek:10,homeTeam:"Alpha",awayTeam:"Beta",profiles,games});
  assert.equal(context.home.impacts.rushOffense.value,.5);
  assert.equal(context.home.impacts.rushDefense.value,.4);
  assert.equal(context.home.impacts.rushOffense.signals.find((row)=>row.label==="SUCCESS RATE")?.delta,.1);
  assert.equal(context.home.expectation.averageMarginDelta,11);
  assert.equal(context.home.expectation.aboveExpected,1);
  assert.equal(context.home.record,"1–0");
  assert.equal(context.home.expectation.sample,1);
  assert.equal(context.home.analogs.find((lane)=>lane.id==="rushOffense")?.candidates[0]?.opponent,"Gamma");
  assert.ok(matchupProfileSimilarity(profiles[1],profiles[2],"rushOffense")>matchupProfileSimilarity(profiles[1],profiles[3],"rushOffense"));
  const finalContext=buildMatchupContext({season:2025,requestedWeek:16,effectiveWeek:16,homeTeam:"Alpha",awayTeam:"Beta",profiles,games});
  assert.equal(finalContext.home.record,"2–0");
});

test("field play art uses PFF location and OL evidence only when supplied",()=>{
  const passing:PffTablePayload={sheet:"passing-depth",values:[
    ["player","player_id","position","team_name","player_game_count","base_dropbacks","left_deep_attempts","left_deep_grades_pass","left_deep_positive_epa_percent","left_deep_ypa"],
    ["Starter QB",1,"QB","TEST U",12,310,18,84,62,14.5],
  ]};
  const blocking:PffTablePayload={sheet:"run-blockng",values:[
    ["player","player_id","position","team_name","player_game_count","snap_counts_run_block","grades_run_block"],
    ["Center",2,"C","TEST U",12,280,74],
    ["Guard",3,"G","TEST U",12,260,78],
    ["Tackle",4,"T","TEST U",12,290,82],
  ]};
  const tendency=buildPffFieldTendency("Test U",[{team:"Test U"}],passing,blocking);
  assert.ok(tendency);
  assert.equal(tendency.quarterback,"Starter QB");
  assert.ok((tendency.pass["deep-left"]??0)>50);
  assert.equal(tendency.run.tackle,82);
  const offense=advancedProfile({passingSuccessRate:1.12,passingExplosiveness:1.14,rushingSuccessRate:1.08,lineYards:1.1},{passingSuccessRate:1,passingExplosiveness:1,rushingSuccessRate:1,lineYards:1});
  const defense=advancedProfile({passingSuccessRate:1,rushingSuccessRate:1},{passingSuccessRate:.96,passingExplosiveness:1.02,rushingSuccessRate:1.03,lineYards:1.01});
  const projection=projectAdvancedSide(offense,defense,4.8,8.2,4.4,7.3)!;
  const map=buildMatchupFieldMap(projection,tendency);
  assert.equal(map.source,"PFF 2025 + CFBD");
  assert.equal(map.zones.length,9);
  assert.equal(map.gaps.length,6);
  assert.ok((map.zones.find((zone)=>zone.id==="deep-left")?.score??0)>50);
  assert.equal(buildMatchupFieldMap(projection,null).source,"CFBD PSEUDO-MAP");
});

test("PFF visualizer exposes every metric while removing low-volume rows and splits",()=>{
  const headers:PffCell[]=["player","player_id","position","team_name","player_game_count","attempts","grades_pass","deep_attempts","deep_ypa"];
  const qualified:PffCell[]=["Test QB",1,"QB","ARK STATE",12,240,88.4,18,10.2];
  const backup:PffCell[]=["Backup",2,"QB","ARK STATE",2,12,72.1,2,14.5];
  const payload:PffTablePayload={sheet:"Passing_summary",values:[headers,qualified,backup]};
  const metrics=pffMetrics(payload);
  const passing=PFF_TABLES.find((table)=>table.slug==="passing-summary")!;

  assert.deepEqual(metrics.map((metric)=>metric.key),["player_game_count","attempts","grades_pass","deep_attempts","deep_ypa"]);
  assert.equal(metrics.find((metric)=>metric.key==="grades_pass")?.format,"number1");
  assert.equal(pffRowQualified(qualified,headers,passing,"QB"),true);
  assert.equal(pffRowQualified(backup,headers,passing,"QB"),false);
  assert.equal(pffMetricSampleQualified(qualified,headers,8),true);
  assert.equal(pffMetricSampleQualified(backup,headers,8),false);
  assert.equal(pffPositionMatches("HB","RB"),true);
  assert.equal(resolvePffTeam("ARK STATE",[{team:"Arkansas State",abbreviation:"ARST"}])?.team,"Arkansas State");
  assert.equal(pffFallbackJersey("OL","Alabama OLine"),pffFallbackJersey("OL","Alabama OLine"));
});

test("scatterplot best-fit line uses the plotted values",()=>{
  const regression=scatterRegression([{x:1,y:3},{x:2,y:5},{x:3,y:7}]);
  assert.ok(regression);
  assert.equal(regression.slope,2);
  assert.equal(regression.intercept,1);
  assert.equal(scatterRegression([{x:2,y:1},{x:2,y:4}]),null);
});

test("Harper BCS rewards a direct head-to-head winner", () => {
  const profiles = [profile("Alpha", "Test", 1), profile("Beta", "Test", 1)];
  const rankings = buildBcsRankings([
    {
      gameId: "h2h",
      week: 5,
      startDate: "2026-10-01T00:00:00Z",
      neutralSite: true,
      homeTeam: "Alpha",
      homePoints: 24,
      awayTeam: "Beta",
      awayPoints: 21,
    },
  ], profiles);

  const alpha = rankings.find((row) => row.team === "Alpha");
  const beta = rankings.find((row) => row.team === "Beta");
  assert.ok(alpha && beta);
  assert.ok(alpha.rank < beta.rank);
  assert.ok(alpha.headToHeadRank < beta.headToHeadRank);
});

test("Harper BCS exposes regular-season conference records without counting the title game", () => {
  const profiles = [profile("Alpha", "Test", 1.08), profile("Beta", "Test", 1.02), profile("Gamma", "Other", 1)];
  const rankings = buildBcsRankings([
    {...rankingGame("conference-win", 5, "Alpha", 28, "Beta", 17), conferenceGame:true, homeConference:"Test", awayConference:"Test"},
    {...rankingGame("nonconference-win", 7, "Alpha", 31, "Gamma", 20), conferenceGame:false, homeConference:"Test", awayConference:"Other"},
    {...rankingGame("conference-title", 15, "Alpha", 24, "Beta", 21), conferenceGame:true, conferenceChampionship:true, homeConference:"Test", awayConference:"Test"},
  ], profiles);
  const alpha = rankings.find((row) => row.team === "Alpha");
  assert.ok(alpha);
  assert.equal(alpha.record, "3–0");
  assert.equal(alpha.conferenceRecord, "1–0");
});

test("Harper BCS protects a mature undefeated résumé from a merely talented multi-loss team", () => {
  const profiles = [profile("Small State", "Sun Belt", 0.96), profile("Power U", "Big Ten", 1.12)];
  const games = [
    ...Array.from({ length: 8 }, (_, index) => ({
      gameId: `small-${index}`, week: index + 1, startDate: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`, neutralSite: true,
      homeTeam: "Small State", homePoints: 28, awayTeam: `Small Opp ${index}`, awayPoints: 17,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      gameId: `power-${index}`, week: index + 1, startDate: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`, neutralSite: true,
      homeTeam: "Power U", homePoints: index < 6 ? 31 : 20, awayTeam: `Power Opp ${index}`, awayPoints: index < 6 ? 17 : 24,
    })),
  ];
  const rankings = buildBcsRankings(games, profiles);
  assert.ok((rankings.find((row) => row.team === "Small State")?.rank ?? 99) < (rankings.find((row) => row.team === "Power U")?.rank ?? 99));
});

test("conference labels alone never change a Harper BCS score", () => {
  const games = [{ gameId:"a",week:1,startDate:"2026-09-01T00:00:00Z",neutralSite:true,homeTeam:"Alpha",homePoints:24,awayTeam:"Opponent A",awayPoints:14 }, { gameId:"b",week:1,startDate:"2026-09-01T01:00:00Z",neutralSite:true,homeTeam:"Beta",homePoints:24,awayTeam:"Opponent B",awayPoints:14 }];
  const first = buildBcsRankings(games, [profile("Alpha", "SEC", 1), profile("Beta", "Conference USA", 1)]);
  const swapped = buildBcsRankings(games, [profile("Alpha", "Conference USA", 1), profile("Beta", "SEC", 1)]);
  assert.equal(first.find((row) => row.team === "Alpha")?.bcsScore, swapped.find((row) => row.team === "Alpha")?.bcsScore);
  assert.equal(first.find((row) => row.team === "Beta")?.bcsScore, swapped.find((row) => row.team === "Beta")?.bcsScore);
});

test("closed-schedule SOS uses leave-one-out results and opponent-adjusted team power", () => {
  const strongOpponents = Array.from({ length: 10 }, (_, index) => `Strong Opp ${index}`);
  const lightOpponents = Array.from({ length: 10 }, (_, index) => `Light Opp ${index}`);
  const profiles = [
    profile("Closed League Champion", "Test A", 1.24),
    profile("Light Schedule Champion", "Test B", 1.18),
    ...strongOpponents.map((team, index) => profile(team, "Test A", 1.08 - index * 0.012)),
    ...lightOpponents.map((team, index) => profile(team, "Test B", 0.9 - index * 0.008)),
  ];
  const games = [
    ...strongOpponents.map((team, index) => rankingGame(`closed-${index}`, index + 1, "Closed League Champion", 35, team, 17)),
    ...lightOpponents.map((team, index) => rankingGame(`light-${index}`, index + 1, "Light Schedule Champion", 42, team, 10)),
  ];
  const rankings = buildBcsRankings(games, profiles);
  const closed = rankings.find((row) => row.team === "Closed League Champion");
  const light = rankings.find((row) => row.team === "Light Schedule Champion");
  assert.ok(closed && light);
  assert.ok(closed.sosRank < light.sosRank, `expected stronger closed schedule; got ${closed.sosRank} vs ${light.sosRank}`);
  assert.match(closed.bestWins[0] ?? "", /Strong Opp/);
  assert.deepEqual(closed.lossesTo, []);
});

test("Harper BCS ranks a 2023 Michigan-style 13-0 résumé with quality wins first", () => {
  const profiles = [profile("Michigan Profile", "Big Ten", 1.18), profile("Close Win U", "Test", 1.18)];
  const games: RankingGame[] = [
    ...opponentWins("Elite A", 6, "elite-a"),
    ...opponentWins("Elite B", 5, "elite-b"),
    ...opponentWins("Elite C", 5, "elite-c"),
    rankingGame("m-elite-a", 11, "Michigan Profile", 31, "Elite A", 17),
    rankingGame("m-elite-b", 12, "Michigan Profile", 27, "Elite B", 13),
    rankingGame("m-average", 13, "Michigan Profile", 38, "Average A", 10),
    rankingGame("c-elite", 11, "Close Win U", 24, "Elite C", 23),
    ...Array.from({ length: 10 }, (_, index) => rankingGame(`m-weak-${index}`, index + 1, "Michigan Profile", 38, `Michigan Weak ${index}`, 10)),
    ...Array.from({ length: 12 }, (_, index) => rankingGame(`c-weak-${index}`, index + 1, "Close Win U", 24, `Close Weak ${index}`, 20)),
  ];

  const rankings = buildBcsRankings(games, profiles);
  assert.equal(rankings[0]?.team, "Michigan Profile");
  assert.equal(rankings[0]?.record, "13–0");
});

test("untested efficiency cannot outrank a proven one-loss résumé", () => {
  const games: RankingGame[] = [
    ...opponentWins("Elite A", 6, "proof-a"),
    ...opponentWins("Elite B", 6, "proof-b"),
    ...opponentWins("Elite C", 7, "proof-c"),
    rankingGame("proof-win-a", 8, "Proven U", 28, "Elite A", 20),
    rankingGame("proof-win-b", 9, "Proven U", 27, "Elite B", 23),
    rankingGame("proof-loss", 10, "Proven U", 24, "Elite C", 27),
    ...Array.from({ length: 7 }, (_, index) => rankingGame(`proof-other-${index}`, index + 1, "Proven U", 34, `Proven Opp ${index}`, 14)),
    ...Array.from({ length: 10 }, (_, index) => rankingGame(`untested-${index}`, index + 1, "Untested State", 38, `Untested Opp ${index}`, 10)),
    ...Array.from({ length: 10 }, (_, opponentIndex) => Array.from({ length: 4 }, (_, gameIndex) => rankingGame(
      `untested-opp-loss-${opponentIndex}-${gameIndex}`,
      gameIndex + 1,
      `Ordinary ${opponentIndex}-${gameIndex}`,
      28,
      `Untested Opp ${opponentIndex}`,
      14,
    ))).flat(),
  ];
  const supportTeams = [...new Set(games.flatMap((game) => [game.homeTeam, game.awayTeam]))].filter((team) => team !== "Untested State" && team !== "Proven U");
  const profiles = [
    profile("Untested State", "Sun Belt", 1.28),
    profile("Proven U", "Test", 1.12),
    ...supportTeams.map((team) => profile(team, "Test", team.startsWith("Elite") ? 1.08 : team.startsWith("Proven Opp") ? 0.98 : 0.88)),
  ];

  const rankings = buildBcsRankings(games, profiles);
  const untested = rankings.find((row) => row.team === "Untested State");
  const proven = rankings.find((row) => row.team === "Proven U");
  assert.ok(untested && proven);
  assert.ok(proven.rank < untested.rank, `expected proven résumé ahead; got ${proven.rank} vs ${untested.rank}`);
  assert.ok(proven.scheduleScore > untested.scheduleScore);
});

test("opponent-relative dominance separates blowouts from bad wins on the same schedule", () => {
  const profiles = [profile("Dominant U", "Test", 1.08), profile("Escape U", "Test", 1.08)];
  const games = Array.from({ length: 8 }, (_, index) => [
    rankingGame(`dominant-${index}`, index + 1, "Dominant U", 42, `Shared Opp ${index}`, 10),
    rankingGame(`escape-${index}`, index + 1, "Escape U", 24, `Shared Opp ${index}`, 21),
  ]).flat();

  const rankings = buildBcsRankings(games, profiles);
  assert.equal(rankings[0]?.team, "Dominant U");
  assert.ok((rankings.find((row) => row.team === "Dominant U")?.scheduleScore ?? 0) > (rankings.find((row) => row.team === "Escape U")?.scheduleScore ?? 0));
});

test("a bad loss is more damaging than a close loss to an elite opponent", () => {
  const games: RankingGame[] = [
    ...opponentWins("Elite Loss Opp", 7, "elite-loss"),
    ...Array.from({ length: 5 }, (_, index) => rankingGame(`bad-opp-loss-${index}`, index + 1, `Ordinary Loss ${index}`, 28, "Bad Loss Opp", 10)),
    ...Array.from({ length: 9 }, (_, index) => [
      rankingGame(`good-loss-team-win-${index}`, index + 1, "Good Loss U", 31, `Shared Loss Opp ${index}`, 14),
      rankingGame(`bad-loss-team-win-${index}`, index + 1, "Bad Loss U", 31, `Shared Loss Opp ${index}`, 14),
    ]).flat(),
    rankingGame("good-loss", 10, "Good Loss U", 24, "Elite Loss Opp", 27),
    rankingGame("bad-loss", 10, "Bad Loss U", 10, "Bad Loss Opp", 24),
  ];
  const supportTeams = [...new Set(games.flatMap((game) => [game.homeTeam, game.awayTeam]))].filter((team) => team !== "Good Loss U" && team !== "Bad Loss U");
  const profiles = [profile("Good Loss U", "Test", 1.08), profile("Bad Loss U", "Test", 1.08), ...supportTeams.map((team) => profile(team, "Test", 0.98))];

  const rankings = buildBcsRankings(games, profiles);
  const goodLoss = rankings.find((row) => row.team === "Good Loss U");
  const badLoss = rankings.find((row) => row.team === "Bad Loss U");
  assert.ok(goodLoss && badLoss);
  assert.ok(goodLoss.rank < badLoss.rank);
  assert.ok(goodLoss.scheduleScore > badLoss.scheduleScore);
});

test("preseason roster inputs emphasize continuity and cap the recruiting nudge", () => {
  const base = (team:string): Profile => ({ season:2026,week:0,team,gamesPlayed:0,off:[5.6,7.3,4.4,30.9,35.8],def:[5.6,7.3,4.4,30.9,35.8],oi:[1,1,1,1,1],di:[1,1,1,1,1] });
  const input = (team:string, returning:number, rank:number, points:number): PreseasonInput => ({
    season:2026,team,conference:null,returningPpa:returning,returningPassingPpa:returning,returningReceivingPpa:returning,returningRushingPpa:returning,
    returningUsage:returning,returningPassingUsage:returning,returningReceivingUsage:returning,returningRushingUsage:returning,recruitingRank:rank,recruitingPoints:points,
  });
  const adjusted = applyPreseasonRosterAdjustments([base("Continuity U"),base("Rebuild U")],[input("Continuity U",0.82,1,310),input("Rebuild U",0.28,100,120)]);
  const continuity = adjusted.find((row) => row.team === "Continuity U")!;
  const rebuild = adjusted.find((row) => row.team === "Rebuild U")!;
  assert.ok(continuity.oi[1] > rebuild.oi[1]);
  assert.ok(continuity.di[0] < rebuild.di[0]);
  assert.ok(continuity.oi[1] < 1.1 && rebuild.oi[1] > 0.9);
});

test("a low-continuity roster cannot inherit every extreme from prior seasons", () => {
  const base = (team:string): Profile => ({ season:2026,week:0,team,gamesPlayed:0,off:[6.35,9.05,5.05,30.9,35.8],def:[4.85,5.9,3.75,30.9,35.8],oi:[1.14,1.24,1.15,1,1],di:[0.87,0.81,0.85,1,1] });
  const input = (team:string, returning:number, rank:number, points:number): PreseasonInput => ({
    season:2026,team,conference:null,returningPpa:returning,returningPassingPpa:returning,returningReceivingPpa:returning,returningRushingPpa:returning,
    returningUsage:returning,returningPassingUsage:returning,returningReceivingUsage:returning,returningRushingUsage:returning,recruitingRank:rank,recruitingPoints:points,
  });
  const adjusted = applyPreseasonRosterAdjustments([base("Veteran U"),base("Rebuild U")],[input("Veteran U",0.9,5,290),input("Rebuild U",0.15,115,95)]);
  const veteran = adjusted.find((row)=>row.team==="Veteran U")!;
  const rebuild = adjusted.find((row)=>row.team==="Rebuild U")!;
  assert.ok(Math.abs(Math.log(rebuild.oi[1]))<Math.abs(Math.log(veteran.oi[1])));
  assert.ok(Math.abs(Math.log(rebuild.di[1]))<Math.abs(Math.log(veteran.di[1])));
});

test("preseason projections apply an explicit FCS baseline without reclassifying missing FBS profiles",()=>{
  const fbs=(team:string,power:number):Profile=>({
    season:2026,week:0,team,gamesPlayed:0,
    off:[5.6,7.3,4.4,30.9,35.8],def:[5.6,7.3,4.4,30.9,35.8],
    oi:[power,power,power,1,1],di:[2-power,2-power,2-power,1,1],advanced:null,
  });
  const averageVsFcs=project(fbs("Average State",1),null,false,1500,1325,null,null,{awayIsFcs:true});
  const eliteVsFcs=project(fbs("Elite State",1.15),null,false,1740,1325,null,null,{awayIsFcs:true});
  const missingFbs=project(fbs("Average State",1),null,false,1500,1500);

  assert.ok(averageVsFcs.homeScore-averageVsFcs.awayScore>=20,`expected an average FBS team to clear 20 points; got ${averageVsFcs.homeScore-averageVsFcs.awayScore}`);
  assert.ok(eliteVsFcs.homeScore-eliteVsFcs.awayScore>=30,`expected an elite FBS blowout; got ${eliteVsFcs.homeScore-eliteVsFcs.awayScore}`);
  assert.ok(eliteVsFcs.homeScore-eliteVsFcs.awayScore>averageVsFcs.homeScore-averageVsFcs.awayScore);
  assert.ok(missingFbs.homeScore-missingFbs.awayScore<10,"a missing eligible FBS profile should retain the neutral fallback");
});

test("unpublished preseason metrics preserve team coverage without inventing values", () => {
  const rows = normalizePreseasonInputs([], [{ team:"Alpha",rank:12,points:214.5 }], 2026, new Set(["Alpha","Beta"]));
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.team === "Alpha")?.recruitingRank, 12);
  assert.equal(rows.find((row) => row.team === "Beta")?.recruitingRank, null);
  assert.equal(rows.find((row) => row.team === "Beta")?.returningPpa, null);
});

function offseasonProfile(team:string,season:number,power:number):PreseasonTransitionProfile{
  const offense=power;
  const defense=2-power;
  return{
    season,week:16,team,gamesPlayed:12,
    off:[5.6*offense,7.3*offense,4.4*offense,30.9,35.8],
    def:[5.6*defense,7.3*defense,4.4*defense,30.9,35.8],
    oi:[offense,offense,offense,1,1],di:[defense,defense,defense,1,1],advanced:null,
  };
}

function offseasonInput(team:string,returning:number,rank:number,points:number):PreseasonTransitionInput{
  return{
    season:2026,team,conference:null,returningPpa:returning,returningPassingPpa:returning,returningReceivingPpa:returning,returningRushingPpa:returning,
    returningUsage:returning,returningPassingUsage:returning,returningReceivingUsage:returning,returningRushingUsage:returning,recruitingRank:rank,recruitingPoints:points,
  };
}

test("state-transition preseason keeps the prior final team as the primary anchor",()=>{
  const histories=new Map<string,PreseasonHistoryRow[]>([
    ["Established Elite",[
      {season:2025,profile:offseasonProfile("Established Elite",2025,1.15),finalElo:1710},
      {season:2024,profile:offseasonProfile("Established Elite",2024,1.14),finalElo:1690},
      {season:2023,profile:offseasonProfile("Established Elite",2023,1.13),finalElo:1680},
      {season:2022,profile:offseasonProfile("Established Elite",2022,1.12),finalElo:1670},
    ]],
    ["Average U",[
      {season:2025,profile:offseasonProfile("Average U",2025,1),finalElo:1500},
      {season:2024,profile:offseasonProfile("Average U",2024,1),finalElo:1500},
      {season:2023,profile:offseasonProfile("Average U",2023,1),finalElo:1500},
      {season:2022,profile:offseasonProfile("Average U",2022,1),finalElo:1500},
    ]],
  ]);
  const inputs=[offseasonInput("Established Elite",.68,4,285),offseasonInput("Average U",.62,55,190)];
  const next=buildPreseasonStateTransition({season:2026,teams:histories.keys(),historyByTeam:histories,inputs,baselines:[5.6,7.3,4.4,30.9,35.8]});
  const legacy=buildLegacyPreseasonProfiles({season:2026,teams:histories.keys(),historyByTeam:histories,inputs,baselines:[5.6,7.3,4.4,30.9,35.8]});
  const priorPower=Math.log(1.15)-Math.log(.85);
  const nextPower=Math.log(next[0].oi[0])-Math.log(next[0].di[0]);
  const legacyPower=Math.log(legacy[0].oi[0])-Math.log(legacy[0].di[0]);
  assert.ok(Math.abs(priorPower-nextPower)<Math.abs(priorPower-legacyPower));
  assert.ok((next[0].preseasonElo??0)>1650,"stable elite final Elo should persist without being rebuilt from the regressed profile");
});

test("program stability distinguishes an established elite from a one-year breakout",()=>{
  const history=(team:string,older:number):PreseasonHistoryRow[]=>[
    {season:2025,profile:offseasonProfile(team,2025,1.15),finalElo:1700},
    {season:2024,profile:offseasonProfile(team,2024,older),finalElo:older>1.1?1680:1500},
    {season:2023,profile:offseasonProfile(team,2023,older),finalElo:older>1.1?1670:1500},
    {season:2022,profile:offseasonProfile(team,2022,older),finalElo:older>1.1?1660:1500},
  ];
  const histories=new Map<string,PreseasonHistoryRow[]>([["Stable Elite",history("Stable Elite",1.13)],["Breakout U",history("Breakout U",1)]]);
  const inputs=[offseasonInput("Stable Elite",.65,10,270),offseasonInput("Breakout U",.65,11,268)];
  const rows=buildPreseasonStateTransition({season:2026,teams:histories.keys(),historyByTeam:histories,inputs,baselines:[5.6,7.3,4.4,30.9,35.8]});
  const stable=rows.find((row)=>row.team==="Stable Elite")!;
  const breakout=rows.find((row)=>row.team==="Breakout U")!;
  assert.ok((stable.transitionDiagnostic?.programStability??0)>(breakout.transitionDiagnostic?.programStability??1));
  assert.ok(stable.oi[0]>breakout.oi[0]);
});

test("replacement talent buffers low continuity without overpowering prior performance",()=>{
  const history=(team:string):PreseasonHistoryRow[]=>[2025,2024,2023,2022].map((season)=>({season,profile:offseasonProfile(team,season,1.08),finalElo:1580}));
  const histories=new Map<string,PreseasonHistoryRow[]>([["Talent Rebuild",history("Talent Rebuild")],["Thin Rebuild",history("Thin Rebuild")]]);
  const inputs=[offseasonInput("Talent Rebuild",.2,2,300),offseasonInput("Thin Rebuild",.2,110,100)];
  const rows=buildPreseasonStateTransition({season:2026,teams:histories.keys(),historyByTeam:histories,inputs,baselines:[5.6,7.3,4.4,30.9,35.8],coefficients:PRESEASON_TRANSITION_V2});
  const talent=rows.find((row)=>row.team==="Talent Rebuild")!;
  const thin=rows.find((row)=>row.team==="Thin Rebuild")!;
  assert.ok(talent.oi[0]>thin.oi[0]);
  assert.ok((talent.transitionDiagnostic?.overallRosterAdjustment??1)<=PRESEASON_TRANSITION_V2.rosterAdjustmentCap);
  assert.ok(talent.oi[0]<1.16,"recruiting cannot manufacture a larger edge than the proven prior profile");
});

test("replacement talent does not become an unsupported recruiting-only bonus",()=>{
  const history=(team:string):PreseasonHistoryRow[]=>[2025,2024,2023,2022].map((season)=>({season,profile:offseasonProfile(team,season,1.08),finalElo:1580}));
  const histories=new Map<string,PreseasonHistoryRow[]>([["High Talent",history("High Talent")],["Low Talent",history("Low Talent")]]);
  const input=(team:string,rank:number,points:number):PreseasonTransitionInput=>({
    season:2026,team,conference:null,returningPpa:null,returningPassingPpa:null,returningReceivingPpa:null,returningRushingPpa:null,
    returningUsage:null,returningPassingUsage:null,returningReceivingUsage:null,returningRushingUsage:null,recruitingRank:rank,recruitingPoints:points,
  });
  const rows=buildPreseasonStateTransition({
    season:2026,teams:histories.keys(),historyByTeam:histories,
    inputs:[input("High Talent",1,320),input("Low Talent",120,90)],
    baselines:[5.6,7.3,4.4,30.9,35.8],coefficients:PRESEASON_TRANSITION_V2,
  });
  const high=rows.find((row)=>row.team==="High Talent")!;
  const low=rows.find((row)=>row.team==="Low Talent")!;
  assert.equal(high.transitionDiagnostic?.overallRosterAdjustment,0);
  assert.equal(low.transitionDiagnostic?.overallRosterAdjustment,0);
  assert.deepEqual(high.oi,low.oi);
  assert.deepEqual(high.di,low.di);
});

test("result-only final Elo is independent of the regressed statistical profile",()=>{
  const games=[
    {gameId:"g1",week:1,startDate:"2025-09-01",seasonType:"regular",neutralSite:true,homeTeam:"Alpha",homePoints:42,awayTeam:"Beta",awayPoints:10},
    {gameId:"g2",week:2,startDate:"2025-09-08",seasonType:"regular",neutralSite:true,homeTeam:"Alpha",homePoints:35,awayTeam:"Gamma",awayPoints:14},
  ];
  const elo=calculateFinalEloRatings(games,["Alpha","Beta","Gamma"]);
  assert.ok((elo.get("Alpha")??0)>1500);
  assert.ok((elo.get("Beta")??1600)<1500);
});

test("player layer selects productive 2025 starters and preserves basic plus advanced evidence", () => {
  const roster = [
    { id:"qb-1",firstName:"Alex",lastName:"Starter",team:"Test U",jersey:12,position:"QB",height:74,weight:215,year:3 },
    { id:"qb-2",firstName:"Ben",lastName:"Backup",team:"Test U",jersey:8,position:"QB",height:73,weight:205,year:1 },
    { id:"rb-1",firstName:"Chris",lastName:"Runner",team:"Test U",jersey:2,position:"RB",height:70,weight:210,year:4 },
  ];
  const stats = [
    { season:2025,playerId:"qb-1",player:"Alex Starter",position:"QB",team:"Test U",category:"passing",statType:"ATT",stat:"320" },
    { season:2025,playerId:"qb-1",player:"Alex Starter",position:"QB",team:"Test U",category:"passing",statType:"YDS",stat:"2810" },
    { season:2025,playerId:"qb-2",player:"Ben Backup",position:"QB",team:"Test U",category:"passing",statType:"ATT",stat:"18" },
    { season:2025,playerId:"rb-1",player:"Chris Runner",position:"RB",team:"Test U",category:"rushing",statType:"CAR",stat:"184" },
  ];
  const usage = [
    { season:2025,id:"qb-1",name:"Alex Starter",position:"QB",team:"Test U",usage:{overall:.42,pass:.78,rush:.08} },
    { season:2025,id:"qb-2",name:"Ben Backup",position:"QB",team:"Test U",usage:{overall:.03,pass:.05,rush:0} },
  ];
  const success = [{ season:2025,id:"qb-1",name:"Alex Starter",position:"QB",team:"Test U",passing:{plays:320,successes:154,successRate:.481},rushing:{plays:25,successes:11,successRate:.44} }];
  const ppa = [{ season:2025,id:"qb-1",name:"Alex Starter",position:"QB",team:"Test U",averagePPA:{all:.27,pass:.3,rush:.04},totalPPA:{all:86.4,pass:82,rush:4.4} }];
  const model = buildTeamPlayerModel(2025,"Test U",roster,stats,success,usage,ppa);
  const quarterback = model.players.find((player)=>player.id==="qb-1")!;
  assert.equal(playerBasicMetric(quarterback,"passAttempts"),320);
  assert.equal(quarterback.advanced.passingSuccessRate,.481);
  assert.ok((quarterback.productionVolumeScore??0)>0);
  assert.ok((quarterback.productionScore??0)>0);
  assert.equal(quarterback.productionRatingSource,"OBSERVED");
  assert.equal(quarterback.starterConfidence,"HIGH");
  const lineup = assignFormationPlayers(model,"offense",["QB","RB"]);
  assert.equal(lineup[0]?.id,"qb-1");
  assert.equal(lineup[1]?.id,"rb-1");
  assert.equal(model.starterMethod,"SOURCE-AWARE-PROJECTION");
});

test("defensive ratings credit real production and ignore offensive trick-play noise", () => {
  const roster = [
    { id:"lb-1",firstName:"Impact",lastName:"Linebacker",team:"Test U",jersey:10,position:"LB",year:4 },
  ];
  const stats = [
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"defensive",statType:"TOT",stat:"122" },
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"defensive",statType:"TFL",stat:"10" },
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"defensive",statType:"SACKS",stat:"1" },
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"defensive",statType:"PD",stat:"6" },
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"interceptions",statType:"INT",stat:"4" },
    { season:2025,playerId:"lb-1",player:"Impact Linebacker",position:"LB",team:"Test U",category:"passing",statType:"ATT",stat:"1" },
  ];
  const success = [{ season:2025,id:"lb-1",name:"Impact Linebacker",position:"LB",team:"Test U",passing:{plays:1,successes:0,successRate:0},rushing:{plays:0,successes:0,successRate:0} }];
  const model = buildTeamPlayerModel(2025,"Test U",roster,stats,success,[],[]);
  const linebacker = model.players[0];
  assert.equal(playerBasicMetric(linebacker,"defensiveInterceptions"),4);
  assert.ok((playerBoxEfficiency(linebacker)??0)>.60);
  assert.ok((linebacker.productionScore??0)>45);
});

test("offensive line resolver preserves exact slots, uses recruit IDs for generic OL, and selects one starter per role", () => {
  const roster = [
    { id:"lt-1",firstName:"Luke",lastName:"Tackle",team:"Test U",jersey:71,position:"LT",height:78,weight:315,year:4,recruitIds:["r-lt"] },
    { id:"g-1",firstName:"Gabe",lastName:"Guard",team:"Test U",jersey:62,position:"OL",height:75,weight:320,year:4,recruitIds:["r-g"] },
    { id:"c-1",firstName:"Cal",lastName:"Center",team:"Test U",jersey:55,position:"C",height:74,weight:305,year:3,recruitIds:["r-c"] },
    { id:"g-2",firstName:"Rex",lastName:"Guard",team:"Test U",jersey:66,position:"OG",height:75,weight:318,year:3,recruitIds:["r-g2"] },
    { id:"t-2",firstName:"Ryan",lastName:"Tackle",team:"Test U",jersey:78,position:"OT",height:79,weight:322,year:3,recruitIds:["r-t2"] },
    { id:"ol-6",firstName:"Nate",lastName:"Reserve",team:"Test U",jersey:69,position:"OL",height:76,weight:305,year:1,recruitIds:["r-6"] },
  ];
  const recruits = [
    { id:"r-lt",year:2022,name:"Luke Tackle",position:"OT",stars:4,rating:.94,_rosterPlayerId:"lt-1",_matchConfidence:"ID" },
    { id:"r-g",year:2022,name:"Gabe Guard",position:"IOL",stars:3,rating:.87,_rosterPlayerId:"g-1",_matchConfidence:"ID" },
    { id:"r-c",year:2023,name:"Cal Center",position:"C",stars:4,rating:.91,_rosterPlayerId:"c-1",_matchConfidence:"ID" },
    { id:"r-g2",year:2023,name:"Rex Guard",position:"OG",stars:3,rating:.86,_rosterPlayerId:"g-2",_matchConfidence:"ID" },
    { id:"r-t2",year:2023,name:"Ryan Tackle",position:"OT",stars:5,rating:.98,_rosterPlayerId:"t-2",_matchConfidence:"ID" },
  ];
  const transfers = [
    { season:2025,firstName:"Ryan",lastName:"Tackle",position:"OT",origin:"Power State",destination:"Test U",stars:4,rating:.93,_rosterPlayerId:"t-2",_matchConfidence:"NAME+DESTINATION" },
  ];
  const model = buildTeamPlayerModel(2025,"Test U",roster,[],[],[],[],recruits,transfers);
  const lineGroups = model.depthChart.filter((group)=>["LT","LG","C","RG","RT"].includes(group.key));
  assert.deepEqual(lineGroups.map((group)=>group.key),["LT","LG","C","RG","RT"]);
  assert.equal(lineGroups.every((group)=>group.starterCount===1&&group.players[0]?.projectedStarter),true);
  assert.equal(model.players.find((player)=>player.id==="lt-1")?.position,"LT");
  assert.equal(model.players.find((player)=>player.id==="g-1")?.positionSource,"RECRUITING");
  assert.equal(model.players.find((player)=>player.id==="t-2")?.highSchoolStars,5);
  assert.equal(model.players.find((player)=>player.id==="t-2")?.transferStars,4);
  assert.equal(model.players.find((player)=>player.id==="t-2")?.recruitingStars,4);
  assert.equal(model.players.find((player)=>player.id==="t-2")?.ratingSource,"TRANSFER");
  assert.equal(playerRecruitingLabel(model.players.find((player)=>player.id==="t-2")), "T4★");
  assert.match(playerRatingSourceLabel(model.players.find((player)=>player.id==="t-2")!),/TRANSFER GRADE.*POWER STATE/i);
  assert.equal(playerRecruitingLabel(model.players.find((player)=>player.id==="ol-6")), "NR");
  const lineup = assignFormationPlayers(model,"offense",["LT","LG","C","RG","RT"]);
  assert.deepEqual(lineup.map((player)=>player?.role),["LT","LG","C","RG","RT"]);
  assert.equal(new Set(lineup.map((player)=>player?.id)).size,5);
  assert.equal(lineup.find((player)=>player?.role==="LT")?.position,"LT");
  assert.equal(lineup.find((player)=>player?.role==="C")?.position,"C");
  assert.equal(lineup.every((player)=>player?.profile.positionGroup==="OFFENSIVE LINE"),true);
  assert.deepEqual(
    lineGroups.map((group)=>group.players.find((player)=>player.projectedStarter)?.id),
    lineup.map((player)=>player?.id),
  );
  assert.equal(lineup.find((player)=>player?.id==="t-2")?.profile.recruitingStars,4);
  const inferredSlot=model.players.find((player)=>player.positionGroup==="OFFENSIVE LINE"&&player.positionSource==="PHYSICAL PROFILE");
  assert.ok(inferredSlot);
  assert.equal(inferredSlot.positionConfidence,"LOW");
  assert.match(inferredSlot.starterEvidence,/unverified model fit|depth is ordered/i);
});

test("published Alabama charts override inferred positions and preserve real starters", () => {
  const roster = [
    { id:"henry",firstName:"Derrick",lastName:"Henry",team:"Alabama",jersey:2,position:"RB" },
    { id:"coker",firstName:"Jake",lastName:"Coker",team:"Alabama",jersey:14,position:"QB" },
    { id:"robinson",firstName:"Cam",lastName:"Robinson",team:"Alabama",jersey:74,position:"OL" },
    { id:"piersch",firstName:"Ross",lastName:"Pierschbacher",team:"Alabama",jersey:71,position:"OL" },
    { id:"kelly",firstName:"Ryan",lastName:"Kelly",team:"Alabama",jersey:70,position:"OL" },
    { id:"taylor",firstName:"Alphonse",lastName:"Taylor",team:"Alabama",jersey:50,position:"OL" },
    { id:"jackson",firstName:"Dominick",lastName:"Jackson",team:"Alabama",jersey:76,position:"OL" },
    { id:"ragland",firstName:"Reggie",lastName:"Ragland",team:"Alabama",jersey:19,position:"LB" },
    { id:"foster",firstName:"Reuben",lastName:"Foster",team:"Alabama",jersey:10,position:"LB" },
  ];
  const model = repairTeamPlayerModelDepth(buildTeamPlayerModel(2015,"Alabama",roster,[],[],[],[]));
  const offense = assignFormationPlayers(model,"offense",["LT","LG","C","RG","RT","QB","RB"]);
  const defense = assignFormationPlayers(model,"defense",["W","M"]);
  assert.equal(model.starterMethod,"PUBLISHED");
  assert.equal(model.depthSource?.kind,"OFFICIAL_TEAM_NOTES");
  assert.deepEqual(offense.map((player)=>player?.profile.displayName),[
    "Cam Robinson","Ross Pierschbacher","Ryan Kelly","Alphonse Taylor","Dominick Jackson","Jake Coker","Derrick Henry",
  ]);
  assert.deepEqual(defense.map((player)=>player?.profile.displayName),["Reuben Foster","Reggie Ragland"]);
  assert.equal(model.players.find((player)=>player.id==="henry")?.depthRole,"RB");
});

test("verified depth-chart pilot is source-backed, complete, and deterministically keyed", () => {
  const charts = listPublishedDepthCharts();
  assert.equal(charts.length, 5);
  assert.deepEqual(
    charts.map((chart) => `${chart.season}:${chart.team}`).sort(),
    ["2014:Arkansas State","2014:UL Monroe","2015:Alabama","2015:Michigan","2025:Alabama"],
  );
  const sourceIds = new Set<string>();
  for (const chart of charts) {
    const validation = validateDepthChart(chart, true);
    assert.equal(validation.valid, true, validation.errors.join("; "));
    assert.equal(validation.chart?.entries.length, chart.entries.length);
    assert.match(chart.sourceUrl, /^https:\/\//);
    assert.equal(chart.sourceKind, "official_game_notes");
    sourceIds.add(depthChartSourceId(chart));
  }
  assert.equal(sourceIds.size, charts.length);
  const michigan = charts.find((chart) => chart.season===2015 && chart.team==="Michigan");
  assert.equal(michigan?.entries.find((entry)=>entry.player==="Joe Kerridge")?.position,"FB");
  const arkansasState = charts.find((chart) => chart.season===2014 && chart.team==="Arkansas State");
  assert.equal(arkansasState?.entries.find((entry)=>entry.player==="Qushaun Lee")?.role,"MIKE");
});

test("depth-chart validator rejects unsourced and position-conflicting records", () => {
  const chart = listPublishedDepthCharts()[0];
  const missingSource = validateDepthChart({ ...chart, sourceUrl:"" }, true);
  assert.equal(missingSource.valid, false);
  assert.match(missingSource.errors.join(" "),/source URL/i);
  const invalidPosition = validateDepthChart({
    ...chart,
    entries:chart.entries.map((entry,index)=>index===0?{...entry,position:"MADE_UP"}:entry),
  },true);
  assert.equal(invalidPosition.valid,false);
  assert.match(invalidPosition.errors.join(" "),/unsupported normalized position/i);
});

test("formation fallback never crosses football position families", () => {
  const roster = [
    { id:"rb",firstName:"True",lastName:"Runner",team:"Test U",jersey:2,position:"RB" },
    { id:"s",firstName:"True",lastName:"Safety",team:"Test U",jersey:4,position:"S" },
    { id:"edge",firstName:"True",lastName:"Edge",team:"Test U",jersey:9,position:"EDGE" },
    { id:"de",firstName:"True",lastName:"End",team:"Test U",jersey:90,position:"DE" },
  ];
  const model = buildTeamPlayerModel(2025,"Test U",roster,[],[],[],[]);
  assert.equal(assignFormationPlayers(model,"offense",["FB"])[0],null);
  assert.equal(assignFormationPlayers(model,"defense",["CB"])[0],null);
  assert.equal(assignFormationPlayers(model,"defense",["M"])[0],null);
  assert.equal(assignFormationPlayers(model,"defense",["NT"])[0],null);
});

test("offensive line unit profile converts real team outcomes into an opponent-adjusted grade", () => {
  const profile=advancedProfile({
    lineYards:1.12,
    stuffRate:1.08,
    powerSuccess:1.05,
    rushingSuccessRate:1.09,
    havocRate:1.04,
    passingDownSuccessRate:1.06,
  },{});
  profile.coverage.advancedGames=11;
  const unit=buildOffensiveLineUnitProfile(profile);
  assert.equal(unit.sampleGames,11);
  assert.equal(unit.metrics.length,6);
  assert.ok((unit.grade??0)>50);
  assert.ok((unit.productionScore??0)>1);
  assert.equal(unit.metrics.find((metric)=>metric.key==="stuffRate")?.format,"rate");
});

test("player production ratings use a scarce 50–99 historical position scale and recruiting only for missing samples", () => {
  const scale=[
    {position:"QB",rating:50,minScore:0,maxScore:5,sampleSize:25},
    {position:"QB",rating:75,minScore:5.1,maxScore:50,sampleSize:250},
    {position:"QB",rating:99,minScore:50.1,maxScore:120,sampleSize:25},
  ];
  assert.equal(productionRatingFromScale("QB",120,scale),99);
  assert.equal(productionRatingFromScale("QB",2,scale),61);
  assert.equal(productionRatingFromScale("RB",30,scale),null);
  assert.equal(productionOverallFromPercentile(.50),76);
  assert.equal(productionOverallFromPercentile(.90),86);
  assert.equal(productionOverallFromPercentile(.96),90);
  assert.equal(productionOverallFromPercentile(.99),95);
  assert.equal(productionOverallFromPercentile(.998),98);
  assert.equal(productionOverallFromPercentile(.999),99);
  const legacyScale=[
    {position:"QB",rating:1,minScore:0,maxScore:1,sampleSize:100},
    {position:"QB",rating:99,minScore:1.1,maxScore:100,sampleSize:100},
  ];
  assert.equal(productionRatingFromScale("QB",100,legacyScale),98);
  const tiedGradeScale=[
    {position:"QB",rating:80,minScore:10,maxScore:20,sampleSize:100},
    {position:"QB",rating:80,minScore:20.1,maxScore:30,sampleSize:100},
  ];
  assert.ok((productionPercentileFromScale("QB",28,tiedGradeScale)??0)>(productionPercentileFromScale("QB",12,tiedGradeScale)??0));
  const alphabeticalFirst={overall:90,ratingPercentile:.80,source:"OBSERVED" as const,recruitingRating:null,recruitingStars:null,team:"Alpha",name:"Aaron"};
  const productiveFirst={overall:90,ratingPercentile:.90,source:"OBSERVED" as const,recruitingRating:null,recruitingStars:null,team:"Zulu",name:"Zach"};
  assert.ok(comparePlayerRatingEvidence(productiveFirst,alphabeticalFirst)<0);
  const navyProjection={overall:85,ratingPercentile:null,source:"PROJECTED" as const,recruitingRating:90,recruitingStars:4,team:"Navy",name:"Alpha"};
  const oregonObserved={overall:85,ratingPercentile:.72,source:"OBSERVED" as const,recruitingRating:80,recruitingStars:3,team:"Oregon",name:"Zulu"};
  assert.ok(comparePlayerRatingEvidence(oregonObserved,navyProjection)<0);
  assert.equal(provisionalProductionOverallFromPercentile(1),98);
  assert.equal(playerOverallTier(99).label,"ELITE OF THE ELITE");
  assert.equal(playerOverallTier(97).label,"ELITE");
  assert.equal(playerOverallTier(94).label,"GREAT");
  assert.equal(playerOverallTier(89).label,"VERY GOOD");
  assert.equal(playerOverallTier(84).label,"DECENT");
  assert.equal(playerOverallTier(79).label,"STARTER");
  assert.equal(playerOverallTier(69).label,"BELOW AVG");
  assert.equal(playerOverallTier(59).label,"LIABILITY");
  const uniformPercentiles=Array.from({length:100_000},(_,index)=>(index+.5)/100_000);
  assert.equal(uniformPercentiles.filter((value)=>productionOverallFromPercentile(value)>=98).length,250);
  assert.equal(uniformPercentiles.filter((value)=>productionOverallFromPercentile(value)>=95).length,1_000);
  assert.equal(uniformPercentiles.filter((value)=>productionOverallFromPercentile(value)>=90).length,4_000);
  assert.equal(uniformPercentiles.filter((value)=>productionOverallFromPercentile(value)>=85).length,12_000);
  assert.equal(uniformPercentiles.filter((value)=>productionOverallFromPercentile(value)>=80).length,30_000);
  const empirical=empiricalProductionPercentiles([
    {key:"low",score:10},
    {key:"middle-a",score:20},
    {key:"middle-b",score:20},
    {key:"high",score:40},
  ]);
  assert.equal(empirical.get("low"),.25);
  assert.equal(empirical.get("middle-a"),.625);
  assert.equal(empirical.get("middle-b"),.625);
  assert.equal(empirical.get("high"),1);
  const projection=projectedProductionRating({
    position:"QB",
    positionGroup:"QB",
    recruitingStars:4,
    recruitingRating:.92,
    ratingSource:"TRANSFER",
  },[
    {position:"QB",stars:4,ratingBand:92,expectedRating:67,sampleSize:40},
    {position:"QB",stars:3,ratingBand:88,expectedRating:51,sampleSize:50},
  ]);
  assert.equal(projection,73);
  const calibratedProjection=projectedProductionRating({
    position:"QB",
    positionGroup:"QB",
    recruitingStars:4,
    recruitingRating:.92,
    ratingSource:"TRANSFER",
  },[
    {position:"QB",stars:4,ratingBand:92,expectedRating:67,sampleSize:40},
  ],false,2);
  assert.equal(calibratedProjection,67);
});

test("player cards use a same-season percentile while the all-era rating generation rebuilds",()=>{
  const model=buildTeamPlayerModel(2025,"Test U",[
    {id:"qb-current",firstName:"Current",lastName:"Quarterback",team:"Test U",jersey:7,position:"QB",year:3},
  ],[
    {season:2025,playerId:"qb-current",player:"Current Quarterback",position:"QB",team:"Test U",category:"passing",statType:"ATT",stat:"320"},
    {season:2025,playerId:"qb-current",player:"Current Quarterback",position:"QB",team:"Test U",category:"passing",statType:"YDS",stat:"2600"},
  ],[],[],[]);
  const baseline={
    firstSeason:2014,lastSeason:2025,playerSeasonCount:80_000,currentGenerationReady:false,
    scale:[{position:"QB",rating:99,minScore:0,maxScore:1,sampleSize:100}],cohorts:[],
  };
  const rated=applyPlayerProductionRatings(model,baseline,null,new Map(),new Map([["qb-current",.80]]));
  const quarterback=rated.players.find((player)=>player.id==="qb-current")!;
  assert.equal(quarterback.productionRating,82);
  assert.notEqual(quarterback.productionRating,99);
  assert.match(quarterback.productionRatingEvidence??"",/same-position|all-era scale is rebuilding/i);
});

test("offensive-line overall separates similar raw production by output versus opponent fronts", () => {
  const baseScore=1.06;
  const navySchedule=opponentAdjustedOffensiveLineScore(baseScore,.32,.38,.32);
  const oregonSchedule=opponentAdjustedOffensiveLineScore(baseScore,.78,.70,.78);
  assert.ok(oregonSchedule>navySchedule);
  assert.ok(oregonSchedule-navySchedule>.1);
});

test("player rating lets efficiency separate comparable workloads but not erase elite volume", () => {
  const accumulator=playerRatingCompositeScore({
    position:"RB",
    volumeScore:330,
    averagePpa:-.04,
    successRate:.35,
    boxEfficiency:.28,
    opportunities:300,
    competitionQuality:.5,
    opponentRelativeProduction:.5,
    opponentUnitQuality:.5,
    usageRate:.40,
  });
  const comparableEfficiency=playerRatingCompositeScore({
    position:"RB",
    volumeScore:350,
    averagePpa:.42,
    successRate:.56,
    boxEfficiency:.78,
    opportunities:300,
    competitionQuality:.5,
    opponentRelativeProduction:.5,
    opponentUnitQuality:.5,
    usageRate:.40,
  });
  const efficientReserve=playerRatingCompositeScore({
    position:"RB",
    volumeScore:145,
    averagePpa:.55,
    successRate:.62,
    boxEfficiency:.92,
    opportunities:110,
    competitionQuality:.5,
    opponentRelativeProduction:.5,
    opponentUnitQuality:.5,
    usageRate:.18,
  });
  assert.ok(comparableEfficiency>accumulator);
  assert.ok(accumulator>efficientReserve);
  assert.ok(comparableEfficiency-efficientReserve>25);
});

test("historic workhorse backs clear explosive reserves on the same all-era scale", () => {
  const henryProfile=playerRatingCompositeScore({
    position:"RB",volumeScore:339,averagePpa:.217,successRate:.471,boxEfficiency:.694,
    opportunities:406,competitionQuality:.82,opponentRelativeProduction:.75,
    opponentUnitQuality:.78,usageRate:.402,
  });
  const mccaffreyProfile=playerRatingCompositeScore({
    position:"RB",volumeScore:348,averagePpa:.26,successRate:.513,boxEfficiency:.777,
    opportunities:382,competitionQuality:.72,opponentRelativeProduction:.72,
    opponentUnitQuality:.70,usageRate:.437,
  });
  const explosiveReserve=playerRatingCompositeScore({
    position:"RB",volumeScore:145,averagePpa:.55,successRate:.62,boxEfficiency:.92,
    opportunities:110,competitionQuality:.80,opponentRelativeProduction:.78,
    opponentUnitQuality:.78,usageRate:.18,
  });
  assert.ok(henryProfile>75);
  assert.ok(mccaffreyProfile>75);
  assert.ok(henryProfile-explosiveReserve>35);
  assert.ok(mccaffreyProfile-explosiveReserve>35);
  assert.ok(Math.abs(henryProfile-mccaffreyProfile)<5);
});

test("2015 all-purpose and workhorse production ranks McCaffrey and Henry above lower-load peers", () => {
  const score = (input: Parameters<typeof playerRatingCompositeScore>[0]) =>
    playerRatingCompositeScore({ competitionQuality:.5,supportQuality:.6,...input });
  const mccaffrey=score({
    position:"RB",volumeScore:426.888,averagePpa:.260,successRate:.513,boxEfficiency:.7774,
    opportunities:382,opponentRelativeProduction:.8103,opponentUnitQuality:.5440,usageRate:.437,
  });
  const henry=score({
    position:"RB",volumeScore:409.579,averagePpa:.217,successRate:.471,boxEfficiency:.6940,
    opportunities:406,opponentRelativeProduction:.8751,opponentUnitQuality:.7231,usageRate:.402,
  });
  const fournette=score({
    position:"RB",volumeScore:365.675,averagePpa:.274,successRate:.500,boxEfficiency:.8876,
    opportunities:319,opponentRelativeProduction:.9624,opponentUnitQuality:.5479,usageRate:.423,
  });
  const elliott=score({
    position:"RB",volumeScore:358.927,averagePpa:.355,successRate:.550,boxEfficiency:.8146,
    opportunities:316,opponentRelativeProduction:.9545,opponentUnitQuality:.6211,usageRate:.374,
  });
  const freeman=score({
    position:"RB",volumeScore:346.860,averagePpa:.403,successRate:.538,boxEfficiency:.8773,
    opportunities:309,opponentRelativeProduction:.9420,opponentUnitQuality:.5845,usageRate:.315,
  });
  assert.ok(mccaffrey>henry);
  assert.ok(henry>Math.max(fournette,elliott,freeman));
});

test("every position requires proven volume before elite rate stats can win", () => {
  const profiles = [
    ["QB",440,360,360], ["RB",450,300,0], ["WR",380,95,0], ["TE",220,70,0],
    ["EDGE",200,155,0], ["DL",185,155,0], ["LB",220,175,0], ["CB",150,125,0],
    ["S",190,150,0], ["K",150,32,0], ["P",190,60,0],
  ] as const;
  for (const [position,target,opportunities,passAttempts] of profiles) {
    const fullSeason=playerRatingCompositeScore({
      position,volumeScore:target*.92,averagePpa:["EDGE","DL","LB","CB","S","K","P"].includes(position)?null:.25,
      successRate:["EDGE","DL","LB","CB","S","K","P"].includes(position)?null:.50,
      boxEfficiency:.70,opportunities,passAttempts,competitionQuality:.62,
      opponentRelativeProduction:.62,opponentUnitQuality:.62,usageRate:["QB","RB","WR","TE"].includes(position)?.62:null,
    });
    const rateStatSpike=playerRatingCompositeScore({
      position,volumeScore:target*.30,averagePpa:["EDGE","DL","LB","CB","S","K","P"].includes(position)?null:.65,
      successRate:["EDGE","DL","LB","CB","S","K","P"].includes(position)?null:.68,
      boxEfficiency:.98,opportunities:Math.max(4,Math.round(opportunities*.25)),passAttempts:Math.round(passAttempts*.25),
      competitionQuality:.62,opponentRelativeProduction:.62,opponentUnitQuality:.62,
      usageRate:["QB","RB","WR","TE"].includes(position)?.20:null,
    });
    assert.ok(fullSeason>rateStatSpike,`${position} should require a proven workload`);
  }
});

test("player rating rewards opponent-adjusted proof and regresses tiny samples", () => {
  const weakSchedule=playerRatingCompositeScore({
    position:"RB",
    volumeScore:150,
    averagePpa:.3,
    successRate:.52,
    boxEfficiency:.7,
    opportunities:140,
    competitionQuality:.2,
    opponentRelativeProduction:.2,
    opponentUnitQuality:.2,
  });
  const strongSchedule=playerRatingCompositeScore({
    position:"RB",
    volumeScore:150,
    averagePpa:.3,
    successRate:.52,
    boxEfficiency:.7,
    opportunities:140,
    competitionQuality:.85,
    opponentRelativeProduction:.85,
    opponentUnitQuality:.85,
  });
  const tinySample=playerRatingCompositeScore({
    position:"RB",
    volumeScore:18,
    averagePpa:.7,
    successRate:.7,
    boxEfficiency:1,
    opportunities:5,
    competitionQuality:.85,
    opponentRelativeProduction:.85,
    opponentUnitQuality:.85,
  });
  assert.ok(strongSchedule!==null&&weakSchedule!==null&&strongSchedule>weakSchedule);
  assert.ok(strongSchedule!==null&&weakSchedule!==null&&strongSchedule-weakSchedule>=7);
  assert.ok(strongSchedule!==null&&weakSchedule!==null&&strongSchedule-weakSchedule<15);
  assert.ok(tinySample!==null&&strongSchedule!==null&&tinySample<strongSchedule);
});

test("quarterback grade separates historic full-season production from backups and low-pass option profiles", () => {
  const historicStarter=playerRatingCompositeScore({
    position:"QB",
    volumeScore:720,
    averagePpa:.58,
    successRate:.61,
    boxEfficiency:.94,
    opportunities:527,
    passAttempts:527,
    competitionQuality:.88,
  });
  const efficientBackup=playerRatingCompositeScore({
    position:"QB",
    volumeScore:120,
    averagePpa:.62,
    successRate:.64,
    boxEfficiency:.96,
    opportunities:58,
    passAttempts:58,
    competitionQuality:.82,
  });
  const lowPassOptionStarter=playerRatingCompositeScore({
    position:"QB",
    volumeScore:260,
    averagePpa:.56,
    successRate:.59,
    boxEfficiency:.92,
    opportunities:105,
    passAttempts:105,
    competitionQuality:.30,
  });
  assert.ok(historicStarter-efficientBackup>=30);
  assert.ok(historicStarter-lowPassOptionStarter>=25);
  assert.ok(efficientBackup<55);
  assert.ok(lowPassOptionStarter<60);
});

test("quarterback efficiency uses completions, YPA, touchdowns and interception avoidance", () => {
  const quarterback=(id:string,stats:Array<[string,string]>)=>buildTeamPlayerModel(
    2025,"Test",[{id,firstName:"Test",lastName:id,position:"QB"}],
    stats.map(([statType,stat])=>({playerId:id,player:`Test ${id}`,team:"Test",category:"passing",statType,stat})),
    [],[],[],[],[],
  ).players.find((player)=>player.id===id)!;
  const efficient=quarterback("Efficient",[["COMPLETIONS","280"],["ATT","400"],["YDS","4000"],["TD","38"],["INT","4"]]);
  const careless=quarterback("Careless",[["COMPLETIONS","230"],["ATT","400"],["YDS","2800"],["TD","21"],["INT","16"]]);
  assert.ok((playerBoxEfficiency(efficient)??0)>.80);
  assert.ok((playerBoxEfficiency(efficient)??0)-(playerBoxEfficiency(careless)??0)>.35);
});

test("position engine rewards a proven small-school star but regresses an efficient reserve", () => {
  const smallSchoolStar=playerRatingCompositeScore({
    position:"WR",volumeScore:445,averagePpa:.48,successRate:.58,boxEfficiency:.88,
    opportunities:104,competitionQuality:.38,opponentRelativeProduction:.91,
    opponentUnitQuality:.44,usageRate:.38,supportQuality:.48,
  });
  const majorConferenceReserve=playerRatingCompositeScore({
    position:"WR",volumeScore:120,averagePpa:.62,successRate:.66,boxEfficiency:.95,
    opportunities:18,competitionQuality:.88,opponentRelativeProduction:.84,
    opponentUnitQuality:.88,usageRate:.10,supportQuality:.72,
  });
  const inefficientReserve=playerRatingCompositeScore({
    position:"WR",volumeScore:120,averagePpa:-.08,successRate:.32,boxEfficiency:.35,
    opportunities:18,competitionQuality:.88,opponentRelativeProduction:.42,
    opponentUnitQuality:.88,usageRate:.10,supportQuality:.72,
  });
  assert.ok(smallSchoolStar>majorConferenceReserve+25);
  assert.ok(majorConferenceReserve>inefficientReserve,"reserve efficiency should still carry useful information");
});

test("running-back grade uses rush PPA, success and the run-space proxy without replacing workload", () => {
  const common={
    position:"RB",volumeScore:340,averagePpa:.32,successRate:.52,boxEfficiency:.74,
    opportunities:285,competitionQuality:.62,opponentRelativeProduction:.72,
    opponentUnitQuality:.65,usageRate:.36,supportQuality:.55,
  };
  const spaceCreator=playerRatingCompositeScore({...common,secondaryEfficiency:.88});
  const contained=playerRatingCompositeScore({...common,secondaryEfficiency:.30});
  const tinyBurst=playerRatingCompositeScore({...common,volumeScore:80,opportunities:28,usageRate:.08,secondaryEfficiency:.98,averagePpa:.70,successRate:.68,boxEfficiency:.98});
  assert.ok(spaceCreator>contained+2);
  assert.ok(spaceCreator>tinyBurst+25);
});

test("broad schedule quality is a secondary separator after opponent-relative output", () => {
  const weakSchedule=playerRatingCompositeScore({
    position:"QB",volumeScore:600,averagePpa:.48,successRate:.57,boxEfficiency:.86,
    opportunities:380,passAttempts:380,competitionQuality:.25,
    opponentRelativeProduction:.62,opponentUnitQuality:.5,usageRate:.78,
  });
  const eliteSchedule=playerRatingCompositeScore({
    position:"QB",volumeScore:600,averagePpa:.48,successRate:.57,boxEfficiency:.86,
    opportunities:380,passAttempts:380,competitionQuality:.85,
    opponentRelativeProduction:.62,opponentUnitQuality:.5,usageRate:.78,
  });
  assert.ok(eliteSchedule>weakSchedule);
  assert.ok(eliteSchedule-weakSchedule<3);
});

test("the all-position engine rewards output above opponent allowance", () => {
  const positions=["QB","RB","WR","TE","EDGE","DL","LB","CB","S"];
  for(const position of positions) {
    const common={
      position,volumeScore:260,averagePpa:["EDGE","DL","LB","CB","S"].includes(position)?null:.32,
      successRate:["EDGE","DL","LB","CB","S"].includes(position)?null:.53,
      boxEfficiency:.72,opportunities:position==="QB"?360:160,passAttempts:position==="QB"?360:0,
      competitionQuality:.62,usageRate:["QB","RB","WR","TE"].includes(position) ? .72 : null,
      opponentUnitQuality:.72,supportQuality:.5,
    };
    const below=playerRatingCompositeScore({...common,opponentRelativeProduction:.30});
    const above=playerRatingCompositeScore({...common,opponentRelativeProduction:.80});
    assert.ok(above>below,`${position} should credit opponent-relative output`);
  }
});

test("historic workload earns carry credit only when efficiency holds", () => {
  const dominantReceiver=playerRatingCompositeScore({
    position:"WR",volumeScore:520,averagePpa:.52,successRate:.60,boxEfficiency:.90,
    opportunities:117,competitionQuality:.86,opponentRelativeProduction:.90,
    opponentUnitQuality:.84,usageRate:.39,supportQuality:.62,
  });
  const inefficientTargetHog=playerRatingCompositeScore({
    position:"WR",volumeScore:520,averagePpa:-.03,successRate:.37,boxEfficiency:.42,
    opportunities:117,competitionQuality:.86,opponentRelativeProduction:.48,
    opponentUnitQuality:.84,usageRate:.39,supportQuality:.62,
  });
  assert.ok(dominantReceiver-inefficientTargetHog>20);
});

test("productive quarterbacks receive only a modest constrained-offense credit", () => {
  const common={
    position:"QB",volumeScore:610,averagePpa:.48,successRate:.58,boxEfficiency:.88,
    opportunities:410,passAttempts:410,competitionQuality:.78,opponentRelativeProduction:.82,
    opponentUnitQuality:.80,usageRate:.80,
  };
  const balanced=playerRatingCompositeScore({...common,supportQuality:.65});
  const carrying=playerRatingCompositeScore({...common,supportQuality:.25});
  const inefficient=playerRatingCompositeScore({...common,averagePpa:-.05,successRate:.36,boxEfficiency:.38,supportQuality:.25});
  assert.ok(carrying>balanced);
  assert.ok(carrying-balanced<4);
  assert.ok(inefficient<balanced-12);
});

test("archive lease acquisition follows the D1 affected-row signal", async () => {
  let boundCooldown = 0;
  const runtime = (changes:number) => ({ DB:{ prepare:() => ({ bind:(cooldown:number) => { boundCooldown = cooldown; return { run:async () => ({ meta:{ changes } }) }; } }) } }) as unknown as PipelineEnv;
  assert.equal(ARCHIVE_REPAIR_COOLDOWN_SECONDS, 75);
  assert.equal(await claimArchiveRepair(runtime(1)), true);
  assert.equal(boundCooldown, 75);
  assert.equal(await claimArchiveRepair(runtime(0), 30), false);
  assert.equal(boundCooldown, 60);
});

test("archive repair batches are bounded and paced above the prior safe interval", () => {
  assert.equal(ARCHIVE_BATCH_MAX_SLICES, 8);
  assert.ok(ARCHIVE_BATCH_PAUSE_MS >= 1600);
});

test("one documented CFBD source gap cannot block a full historical week", () => {
  assert.equal(weeklySourceCoverageComplete(84, 84), true);
  assert.equal(weeklySourceCoverageComplete(84, 83), false, "an unexplained missing game must still be retried");
  assert.equal(weeklySourceCoverageComplete(84, 83, 1), true, "one directly retried and documented source gap is accepted");
  assert.equal(weeklySourceCoverageComplete(84, 82, 1), false, "multiple missing games still fail closed");
  assert.equal(weeklySourceCoverageComplete(9, 8, 1), false, "small incomplete samples are not silently accepted");
});

test("team box-score normalization preserves completions and attempts", () => {
  const games: NormalizedGame[] = [{
    id:"box-1",season:2025,week:5,seasonType:"regular",startDate:"2025-10-01T00:00:00Z",completed:true,neutralSite:false,conferenceGame:true,venue:null,
    homeTeam:"Alpha",homeConference:"Test",homePoints:31,awayTeam:"Beta",awayConference:"Test",awayPoints:20,
  }];
  const rows = normalizeStats([{ id:"box-1",teams:[
    { school:"Alpha",homeAway:"home",points:31,stats:[{category:"completionAttempts",stat:"18-27"},{category:"netPassingYards",stat:"243"},{category:"rushingAttempts",stat:"35"},{category:"rushingYards",stat:"175"}] },
    { school:"Beta",homeAway:"away",points:20,stats:[{category:"completionAttempts",stat:"15/29"},{category:"netPassingYards",stat:"190"},{category:"rushingAttempts",stat:"28"},{category:"rushingYards",stat:"112"}] },
  ] }], games, 2025);
  assert.equal(rows.find((row) => row.team === "Alpha")?.passCompletions, 18);
  assert.equal(rows.find((row) => row.team === "Alpha")?.passAttempts, 27);
  assert.equal(rows.find((row) => row.team === "Beta")?.passCompletions, 15);
  assert.equal(rows.find((row) => row.team === "Beta")?.passAttempts, 29);
});

test("postseason team box scores use the same complete stat profile", () => {
  const games: NormalizedGame[] = [{
    id:"playoff-1",season:2018,week:1,seasonType:"postseason",startDate:"2018-12-29T00:00:00Z",completed:true,neutralSite:true,conferenceGame:false,venue:"Orange Bowl",
    homeTeam:"Alabama",homeConference:"SEC",homePoints:45,awayTeam:"Oklahoma",awayConference:"Big 12",awayPoints:34,
  }];
  const rows = normalizeStats([{ id:"playoff-1",teams:[
    { school:"Alabama",homeAway:"home",points:45,stats:[{category:"completionAttempts",stat:"24-27"},{category:"netPassingYards",stat:"318"},{category:"rushingAttempts",stat:"42"},{category:"rushingYards",stat:"210"},{category:"turnovers",stat:"0"}] },
    { school:"Oklahoma",homeAway:"away",points:34,stats:[{category:"completionAttempts",stat:"19-37"},{category:"netPassingYards",stat:"308"},{category:"rushingAttempts",stat:"33"},{category:"rushingYards",stat:"163"},{category:"turnovers",stat:"1"}] },
  ] }], games, 2018);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.team === "Alabama")?.totalYards, 528);
  assert.equal(rows.find((row) => row.team === "Oklahoma")?.passCompletions, 19);
  assert.equal(rows.find((row) => row.team === "Oklahoma")?.turnovers, 1);
});

test("completion rate and yards per completion use exact box-score identities", () => {
  const passing = derivePassingEfficiency({ passAttempts:27, passCompletions:18, passYards:243 });
  assert.equal(passing.completionRate,18/27);
  assert.equal(passing.yardsPerAttempt,9);
  assert.equal(passing.yardsPerCompletion,13.5);
  assert.equal(passing.yardsPerCompletion,passing.yardsPerAttempt!/passing.completionRate!);
});

test("advanced CFBD game stats normalize trench, space, and passing proxies", () => {
  const games: NormalizedGame[] = [{
    id:"advanced-1",season:2025,week:6,seasonType:"regular",startDate:"2025-10-08T00:00:00Z",completed:true,neutralSite:true,conferenceGame:false,venue:null,
    homeTeam:"Alpha",homeConference:"Test",homePoints:28,awayTeam:"Beta",awayConference:"Test",awayPoints:17,
  }];
  const rows = normalizeAdvancedStats([{ gameId:"advanced-1",team:"Alpha",opponent:"Beta",offense:{lineYards:3.2,secondLevelYards:1.3,openFieldYards:0.8,passingPlays:{successRate:0.49,explosiveness:1.42}},defense:{lineYards:2.1,secondLevelYards:0.7,openFieldYards:0.3,passingPlays:{successRate:0.34,explosiveness:0.91}} }],games,2025);
  assert.equal(rows.length,1);
  assert.equal(rows[0].offLineYards,3.2);
  assert.equal(rows[0].offPassingSuccessRate,0.49);
  assert.equal(rows[0].defOpenFieldYards,0.3);
  assert.equal(rows[0].defPassingExplosiveness,0.91);
});

test("advanced CFBD normalization preserves PPA, rushing, and down-leverage components", () => {
  const games:NormalizedGame[] = [{id:"advanced-v11",season:2025,week:6,seasonType:"regular",startDate:null,completed:true,neutralSite:false,conferenceGame:true,venue:null,homeTeam:"Alpha",homeConference:"Test",homePoints:31,awayTeam:"Beta",awayConference:"Test",awayPoints:20}];
  const rows = normalizeAdvancedStats([{gameId:"advanced-v11",team:"Alpha",opponent:"Beta",offense:{stuffRate:.14,powerSuccess:.71,rushingPlays:{successRate:.48,explosiveness:1.2,ppa:.16},passingPlays:{successRate:.51,explosiveness:1.4,ppa:.28},standardDowns:{successRate:.52,explosiveness:1.35,ppa:.22},passingDowns:{successRate:.39,explosiveness:1.18,ppa:.11}},defense:{stuffRate:.22,powerSuccess:.49,rushingPlays:{successRate:.35,explosiveness:.86,ppa:-.05},passingPlays:{successRate:.36,explosiveness:.91,ppa:-.02},standardDowns:{successRate:.38,explosiveness:.94,ppa:.01},passingDowns:{successRate:.29,explosiveness:.77,ppa:-.12}}}],games,2025);
  assert.equal(rows[0].offStuffRate,.14);
  assert.equal(rows[0].offRushingPpa,.16);
  assert.equal(rows[0].offPassingDownSuccessRate,.39);
  assert.equal(rows[0].defPassingDownPpa,-.12);
});

test("stuff rate and PPA indices preserve offense/defense direction", () => {
  assert.ok(advancedMetricIndex("stuffRate",.12,.18)! > 1);
  assert.ok(advancedMetricIndex("stuffRate",.24,.18)! < 1);
  assert.ok(advancedMetricIndex("passingPpa",.25,.1)! > 1);
  assert.ok(advancedMetricIndex("passingPpa",-.05,.1)! < 1);
});

test("weekly advanced profiles produce paired offensive and defensive percentages", () => {
  const base:AdvancedBaseStatRow[] = [
    {gameId:"profile-1",week:1,team:"Alpha",opponent:"Beta",passYards:240,passAttempts:30,passCompletions:20,rushAttempts:36,points:31},
    {gameId:"profile-1",week:1,team:"Beta",opponent:"Alpha",passYards:180,passAttempts:28,passCompletions:15,rushAttempts:30,points:17},
  ];
  const components:AdvancedGameComponentRow[] = [
    {gameId:"profile-1",season:2025,week:1,team:"Alpha",opponent:"Beta",offLineYards:3.2,offSecondLevelYards:1.3,offOpenFieldYards:.8,offPassingSuccessRate:.5,offPassingExplosiveness:1.4,defLineYards:2.2,defSecondLevelYards:.8,defOpenFieldYards:.3,defPassingSuccessRate:.34,defPassingExplosiveness:.9},
    {gameId:"profile-1",season:2025,week:1,team:"Beta",opponent:"Alpha",offLineYards:2.2,offSecondLevelYards:.8,offOpenFieldYards:.3,offPassingSuccessRate:.34,offPassingExplosiveness:.9,defLineYards:3.2,defSecondLevelYards:1.3,defOpenFieldYards:.8,defPassingSuccessRate:.5,defPassingExplosiveness:1.4},
  ];
  const profiles = buildWeeklyAdvancedProfiles(2025,new Set(["profile-1"]),base,components,new Set(["Alpha","Beta"]));
  const alpha = profiles.find((row)=>row.team==="Alpha")?.advanced;
  assert.ok(alpha);
  assert.equal(alpha.offense.raw.completionRate,20/30);
  assert.equal(alpha.defense.raw.completionRate,15/28);
  assert.equal(alpha.offense.raw.pointsPerGame,31);
  assert.equal(alpha.defense.raw.pointsPerGame,17);
  assert.ok(alpha.offense.index.lineYards!>1);
  assert.ok(alpha.defense.index.lineYards!<1);
});

test("partial completion backfill never mixes uncovered passing yards into yards per completion", () => {
  const base:AdvancedBaseStatRow[] = [
    {gameId:"covered",week:1,team:"Alpha",opponent:"Beta",passYards:200,passAttempts:20,passCompletions:10,rushAttempts:30,points:24},
    {gameId:"covered",week:1,team:"Beta",opponent:"Alpha",passYards:180,passAttempts:24,passCompletions:12,rushAttempts:28,points:17},
    {gameId:"pending",week:2,team:"Alpha",opponent:"Beta",passYards:400,passAttempts:40,passCompletions:null,rushAttempts:25,points:31},
    {gameId:"pending",week:2,team:"Beta",opponent:"Alpha",passYards:240,passAttempts:30,passCompletions:null,rushAttempts:27,points:20},
  ];
  const components:AdvancedGameComponentRow[] = base.map((row)=>({
    gameId:row.gameId,season:2025,week:row.week,team:row.team,opponent:row.opponent,
    offLineYards:2.8,offSecondLevelYards:1.1,offOpenFieldYards:.6,offPassingSuccessRate:.42,offPassingExplosiveness:1.2,
    defLineYards:2.8,defSecondLevelYards:1.1,defOpenFieldYards:.6,defPassingSuccessRate:.42,defPassingExplosiveness:1.2,
  }));
  const alpha = buildWeeklyAdvancedProfiles(2025,new Set(["covered","pending"]),base,components,new Set(["Alpha","Beta"]))
    .find((row)=>row.team==="Alpha"&&row.week===2)?.advanced;
  assert.ok(alpha);
  assert.equal(alpha.offense.raw.completionRate,.5);
  assert.equal(alpha.offense.raw.yardsPerCompletion,20);
  assert.equal(alpha.coverage.completionGames,1);
});

test("advanced components identify a line-push rushing advantage and adjust final YPC conservatively", () => {
  const offense = advancedProfile({ lineYards:1.28,secondLevelYards:1.12,openFieldYards:1.02 }, { lineYards:1,secondLevelYards:1,openFieldYards:1 });
  const defense = advancedProfile({ lineYards:1,secondLevelYards:1,openFieldYards:1 }, { lineYards:1.08,secondLevelYards:1.03,openFieldYards:1 });
  const projection = projectAdvancedSide(offense,defense,4.4,7.3,4.4,7.3);
  assert.ok(projection);
  assert.ok(projection.run.lineYards! > 3.5);
  assert.ok(projection.run.adjustedYpc > projection.run.directYpc);
  assert.ok(projection.run.adjustment <= 1.12);
});

test("completion rate and yards per completion refine YPA without replacing the direct model", () => {
  const offense = advancedProfile({ completionRate:1.08,yardsPerCompletion:1.12,passingSuccessRate:1.06,passingExplosiveness:1.04 }, {});
  const defense = advancedProfile({}, { completionRate:1.04,yardsPerCompletion:1.06,passingSuccessRate:1.03,passingExplosiveness:1.02 });
  const projection = projectAdvancedSide(offense,defense,4.4,7.3,4.4,7.3);
  assert.ok(projection);
  assert.ok(projection.pass.componentYpa! > 7.3);
  assert.ok(projection.pass.adjustedYpa > projection.pass.directYpa);
  assert.ok(projection.pass.adjustment <= 1.1);
});

test("missing advanced data leaves the established matchup projection unchanged", () => {
  const base = projectCalibratedMatchup({offense:[1.05,1.06,1.04,1,1],defense:[0.96,0.95,0.97,1,1]},{offense:[1,1,1,1,1],defense:[1,1,1,1,1]},true);
  const explicitMissing = projectCalibratedMatchup({offense:[1.05,1.06,1.04,1,1],defense:[0.96,0.95,0.97,1,1],advanced:null},{offense:[1,1,1,1,1],defense:[1,1,1,1,1],advanced:null},true);
  assert.equal(base.homeStats.advanced,null);
  assert.equal(base.homeStats.ypc,explicitMissing.homeStats.ypc);
  assert.equal(base.homeStats.ypa,explicitMissing.homeStats.ypa);
});

test("unavailable air-yards and YAC tracking fields are never fabricated", () => {
  assert.equal(advancedMetricKeys.includes("airYardsPerTarget" as never),false);
  assert.equal(advancedMetricKeys.includes("yacPerReception" as never),false);
});

test("matchup analyzer identifies separate pass, run, and defensive edges", () => {
  const analysis = analyzeMatchupEdges("Air Raid", "Ground U", [1.1,1.22,0.9,1,1], [0.86,0.82,0.94,1,1], [1.02,0.92,1.18,1,1], [1.04,1.08,1.12,1,1], true, 6.5);
  assert.equal(analysis.favorite, "Air Raid");
  assert.equal(analysis.pass.edgeTeam, "Air Raid");
  assert.equal(analysis.run.edgeTeam, "Ground U");
  assert.equal(analysis.defense.edgeTeam, "Air Raid");
  assert.match(analysis.summary, /Air Raid/);
});

test("position X-ray separates five position and play-calling lanes", () => {
  const strong = advancedProfile({lineYards:1.2,stuffRate:1.2,powerSuccess:1.15,secondLevelYards:1.15,rushingSuccessRate:1.12,completionRate:1.1,yardsPerCompletion:1.12,passingSuccessRate:1.1,passingPpa:1.1,standardDownSuccessRate:1.1,passingDownSuccessRate:1.12,passingDownPpa:1.08},{});
  const averageIndices = Object.fromEntries(advancedMetricKeys.map((key)=>[key,1])) as AdvancedMetricValues;
  const averageProfile = advancedProfile(averageIndices,averageIndices);
  const homeProjection = projectAdvancedSide(strong,averageProfile,4.6,7.5,4.4,7.3);
  const awayProjection = projectAdvancedSide(averageProfile,strong,4.4,7.3,4.4,7.3);
  assert.ok(homeProjection && awayProjection);
  const analysis = analyzeMatchupEdges("Alpha","Beta",[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],true,4,homeProjection,awayProjection,strong,averageProfile);
  assert.deepEqual(analysis.positionGroups.map((row)=>row.id),["trenches","run-space","quarterback","receivers","down-leverage"]);
  assert.ok(analysis.positionGroups.some((row)=>row.edgeTeam==="Alpha"));
});

test("market model qualifies calibrated ATS positions and pauses unvalidated total recommendations", () => {
  const qualified = evaluateMarketProjection({week:8,homeTeam:"Alpha",awayTeam:"Beta",modelHomeSpread:-7,modelTotal:58,homeYpa:8.2,awayYpa:6.6,homeYpc:5.1,awayYpc:4.1,homeDefenseIndex:.88,awayDefenseIndex:1.08,vegasSpread:-3,vegasTotal:54,actualMargin:10,actualTotal:61});
  assert.equal(qualified.spreadQualified,true);
  assert.equal(qualified.totalQualified,false);
  assert.equal(qualified.spreadResult,"W");
  assert.equal(qualified.totalResult,"PASS");
  assert.equal(qualified.totalDiagnosticQualified,true);
  assert.equal(qualified.totalDiagnosticRecommendation,"OVER");
  assert.equal(qualified.totalDiagnosticResult,"W");
  const weak = evaluateMarketProjection({week:8,modelHomeSpread:-3.5,modelTotal:52,homeYpa:7.1,awayYpa:7,homeYpc:4.4,awayYpc:4.3,homeDefenseIndex:1,awayDefenseIndex:1,vegasSpread:-3,vegasTotal:51,actualMargin:7,actualTotal:48});
  assert.equal(weak.spreadResult,"PASS");
  assert.equal(weak.totalResult,"PASS");
  assert.equal(weak.totalDiagnosticQualified,false);
  assert.equal(weak.totalDiagnosticResult,"PASS");
});

test("game market summary separates model accuracy from official ATS-set inclusion", () => {
  const graded = {
    completed:true,
    homePoints:34,
    awayPoints:27,
    modelHomeSpread:-7,
    modelTotal:58,
    vegasSpread:-3,
    vegasTotal:54,
    spreadQualified:true,
    spreadResult:"W",
    spreadRecommendation:"Alpha ATS",
  };
  assert.deepEqual(modelSpreadRead(graded),{label:"ACCURATE",tone:"positive"});
  assert.deepEqual(modelTotalRead(graded),{label:"ACCURATE",tone:"positive"});
  assert.deepEqual(officialAtsSetRead(graded),{label:"INCLUDED · WIN",tone:"positive"});

  const excluded={...graded,spreadQualified:false,spreadResult:"PASS"};
  assert.deepEqual(officialAtsSetRead(excluded),{label:"NOT INCLUDED",tone:"neutral"});

  const future={...graded,completed:false,homePoints:null,awayPoints:null,spreadResult:null};
  assert.deepEqual(modelSpreadRead(future),{label:"PENDING",tone:"neutral"});
  assert.deepEqual(modelTotalRead(future),{label:"PENDING",tone:"neutral"});
  assert.deepEqual(officialAtsSetRead(future),{label:"INCLUDED",tone:"positive"});

  const missed={...graded,homePoints:24,awayPoints:23};
  assert.deepEqual(modelSpreadRead(missed),{label:"MISSED",tone:"negative"});
  assert.deepEqual(modelTotalRead(missed),{label:"MISSED",tone:"negative"});
});

test("legacy consensus favorite reversals are replaced by independently supported providers", () => {
  const lines:MarketLineCandidate[]=[
    {provider:"consensus",spread:20.5,spreadOpen:null,formattedSpread:"Troy -20.5",overUnder:null,overUnderOpen:null,homeMoneyline:null,awayMoneyline:null},
    {provider:"teamrankings",spread:-24,spreadOpen:null,formattedSpread:"GASO -24",overUnder:60,overUnderOpen:null,homeMoneyline:null,awayMoneyline:null},
    {provider:"numberfire",spread:-24.5,spreadOpen:null,formattedSpread:"GASO -24.5",overUnder:61.5,overUnderOpen:null,homeMoneyline:null,awayMoneyline:null},
  ];
  const selected=selectMarketLineCandidate(2014,lines)!;
  assert.equal(selected.provider,"teamrankings");
  assert.equal(selected.spread,-24);
  assert.equal(selected.quality,"provisional");
});

test("unsupported 2014-16 consensus lines are quarantined", () => {
  const selected=selectMarketLineCandidate(2015,[{provider:"consensus",spread:7.5,spreadOpen:null,formattedSpread:"Army -7.5",overUnder:null,overUnderOpen:null,homeMoneyline:null,awayMoneyline:null}])!;
  assert.equal(selected.quality,"quarantined");
  assert.equal(selected.spread,null);
  assert.equal(isStoredMarketLineQuarantined(2015,"consensus"),true);
  assert.equal(isStoredMarketLineQuarantined(2015,"teamrankings"),false);
  assert.equal(isStoredMarketLineQuarantined(2025,"consensus"),false);
});

test("validation records expose Wilson sample uncertainty", () => {
  const interval=wilsonConfidenceInterval(48,30);
  assert.ok(interval.low!==null&&Math.abs(interval.low-.504)<.002);
  assert.ok(interval.high!==null&&Math.abs(interval.high-.716)<.002);
  assert.deepEqual(wilsonConfidenceInterval(0,0),{low:null,high:null,level:.95});
});

test("X-ray flags an inefficient chunk-pass offense against deep suppression", () => {
  const vertical = advancedProfile({ completionRate:.92,yardsPerCompletion:1.14,passingSuccessRate:.94,passingExplosiveness:1.12 }, {});
  const coverage = advancedProfile({}, { completionRate:.95,yardsPerCompletion:.88,passingSuccessRate:.94,passingExplosiveness:.9 });
  const homeProjection = projectAdvancedSide(vertical,coverage,4.4,7.3,4.4,7.3);
  const awayProjection = projectAdvancedSide(coverage,vertical,4.4,7.3,4.4,7.3);
  assert.ok(homeProjection && awayProjection);
  const analysis = analyzeMatchupEdges(
    "Vertical U","Coverage U",[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],true,-1,
    homeProjection,awayProjection,vertical,coverage,
  );
  const read = analysis.schematicReads.find((row)=>row.offenseTeam==="Vertical U");
  assert.ok(read);
  assert.equal(read.offenseStyle,"BOOM-OR-BUST DEEP BALL");
  assert.equal(read.defenseStyle,"LIMITS DEEP BALL");
  assert.equal(read.edgeTeam,"Coverage U");
  assert.match(read.detail,/Expected passing line/i);
});

test("cross-era round robin gives every team-season one game against every other entry", () => {
  const entry = (id:string,team:string,season:number,power:number):RoundRobinProfile => ({
    id,team,season,week:15,conference:"Test",
    offense:[power,power,power,1,1],defense:[2-power,2-power,2-power,1,1],
  });
  const standings = buildRoundRobinStandings([
    entry("2020:Alpha","Alpha",2020,1.2),
    entry("2023:Beta","Beta",2023,1.05),
    entry("2025:Gamma","Gamma",2025,0.9),
  ]);
  assert.equal(standings.length,3);
  assert.ok(standings.every((row)=>row.games===2));
  assert.equal(standings[0]?.profile.id,"2020:Alpha");
  assert.equal(standings[0]?.wins,2);
});

test("cross-era base-profile path matches the canonical neutral-field projection", () => {
  const alpha:RoundRobinProfile = { id:"2020:Alpha",team:"Alpha",season:2020,week:15,conference:"Test",offense:[1.16,1.14,1.1,1.02,.98],defense:[.86,.88,.9,1.01,.99] };
  const beta:RoundRobinProfile = { id:"2023:Beta",team:"Beta",season:2023,week:15,conference:"Test",offense:[1.02,1.04,1.01,.99,1.02],defense:[.98,.96,1.02,1,.98] };
  const canonical = projectCalibratedMatchup({offense:alpha.offense,defense:alpha.defense},{offense:beta.offense,defense:beta.defense},true);
  const standings = buildRoundRobinStandings([alpha,beta]);
  const alphaStanding = standings.find((row)=>row.profile.id===alpha.id);
  assert.ok(alphaStanding);
  assert.ok(Math.abs(alphaStanding.averageMargin-canonical.margin)<1e-9);
  assert.ok(Math.abs(alphaStanding.expectedWins-canonical.homeWinProbability)<1e-9);
});

test("cross-era postseason résumé breaks an otherwise close statistical matchup", () => {
  const champion:RoundRobinProfile = { id:"2019:Champion",team:"Champion",season:2019,week:15,offense:[1.1,1.1,1.1,1,1],defense:[.9,.9,.9,1,1],rating:1760,resumeScore:1 };
  const contender:RoundRobinProfile = { id:"2019:Contender",team:"Contender",season:2019,week:15,offense:[1.1,1.1,1.1,1,1],defense:[.9,.9,.9,1,1],rating:1730,resumeScore:.82 };
  const standings = buildRoundRobinStandings([champion,contender]);
  assert.equal(standings[0]?.profile.id,champion.id);
  assert.ok(standings[0]?.averageMargin>1);
});

test("selective low-volume passing is less repeatable than full-volume YPA", () => {
  const lowVolume = validateMatchupProfile({offense:[1.05,1.4,1.02,.52,1.3],defense:[1,1,1,1,1]});
  const fullVolume = validateMatchupProfile({offense:[1.05,1.4,1.02,1,1],defense:[1,1,1,1,1]});
  assert.ok(lowVolume.offense[1]<fullVolume.offense[1]);
  assert.ok(lowVolume.offense[1]>1&&lowVolume.offense[1]<1.12);
});

test("coordinator view draws a spread call for a high-volume passing offense", () => {
  const analysis = analyzeMatchupEdges("Air Raid U","Defense U",[1.12,1.24,0.93,1.35,0.72],[1,1,1,1,1],[0.95,0.92,1.03,0.85,1.12],[1,1,1,1,1],true,6);
  const plan = buildTacticalPlan({offenseTeam:"Air Raid U",defenseTeam:"Defense U",offense:[1.12,1.24,0.93,1.35,0.72],offenseIsHome:true,analysis});
  assert.equal(plan.formation,"air-raid");
  assert.ok(["vertical","mesh"].includes(plan.play));
  assert.ok(plan.passRate>0.58);
  const deepZone=plan.zones.find((zone)=>zone.id==="deep")!;
  assert.ok(deepZone.grade>50);
  assert.equal(deepZone.grade,Math.round(50+deepZone.score*50));
  assert.ok(plan.zones.every((zone)=>zone.grade>=0&&zone.grade<=100));
});

test("coordinator view draws option football and flags a defense-owned lane", () => {
  const analysis = analyzeMatchupEdges("Option U","Front U",[0.94,0.91,1.22,0.63,1.42],[1,1,1,1,1],[1.04,1.02,1.03,1,1],[0.82,0.84,0.8,1,1],true,-5);
  const plan = buildTacticalPlan({offenseTeam:"Option U",defenseTeam:"Front U",offense:[0.94,0.91,1.22,0.63,1.42],offenseIsHome:true,analysis});
  assert.equal(plan.formation,"flexbone");
  assert.equal(plan.play,"triple-option");
  assert.ok(plan.zones.some((zone)=>zone.tone==="caution"||zone.tone==="defense"));
});

test("coordinator scouting converts front-seven disruption into a protection plan", () => {
  const offense=advancedProfile({
    passingSuccessRate:1.05,completionRate:1.04,passingExplosiveness:1.12,yardsPerCompletion:1.08,
    standardDownSuccessRate:1.04,standardDownExplosiveness:1.1,passingDownSuccessRate:.82,passingDownPpa:.84,
    havocRate:.82,frontSevenHavoc:.78,dbHavoc:1,successRate:1.02,rushingSuccessRate:.94,lineYards:.96,
  },{});
  const defense=advancedProfile({},{
    passingSuccessRate:.9,completionRate:.94,passingExplosiveness:.96,yardsPerCompletion:.95,
    standardDownSuccessRate:.93,standardDownExplosiveness:.94,passingDownSuccessRate:.82,passingDownPpa:.8,
    havocRate:.78,frontSevenHavoc:.72,dbHavoc:.88,successRate:.9,rushingSuccessRate:.98,lineYards:.97,
  });
  for(const profile of [offense,defense]) {
    profile.baseline.successRate=.44;
    profile.baseline.explosiveness=1.18;
    profile.baseline.rushingSuccessRate=.42;
    profile.baseline.standardDownSuccessRate=.47;
    profile.baseline.standardDownExplosiveness=1.2;
    profile.baseline.passingDownSuccessRate=.33;
    profile.baseline.passingDownPpa=.08;
    profile.baseline.havocRate=.19;
    profile.baseline.frontSevenHavoc=.13;
    profile.baseline.dbHavoc=.06;
    profile.baseline.thirdDownSuccessRate=.4;
    profile.baseline.redZoneEfficiency=.82;
    profile.baseline.stuffRate=.18;
    profile.baseline.powerSuccess=.68;
  }
  const projection=projectAdvancedSide(offense,defense,4.1,8.1,4.4,7.3)!;
  const viability=assessOffensiveViability(projection);
  const receipt=buildPossessionScoreReceipt(projection,offense,11.5,viability,27);
  const plan=buildSideGamePlan("Vertical U","Pressure U",projection,offense,defense,receipt,viability,[1.08,1.16,.95,1.3,.74]);
  assert.equal(plan.coordinator.identity.label,"VERTICAL AIR RAID");
  assert.ok(plan.coordinator.pressure.grade>=61);
  assert.match(plan.coordinator.pressure.protectionCall,/SLIDE|PROTECT|CHIP/i);
  assert.ok(plan.coordinator.pressure.evidence.some((row)=>/front-seven havoc/i.test(row)));
  assert.ok(plan.coordinator.pressure.broadcastStats.some((row)=>/vs FBS/i.test(row.comparison)));
  assert.ok(plan.coordinator.coverage.broadcastStats.some((row)=>row.value.length>0));
  assert.ok(plan.recommendations.every((row)=>row.statistics.every((stat)=>/vs FBS/i.test(stat))));
  assert.ok(plan.recommendations.every((row)=>row.why.includes("Vertical U")||row.why.includes("Pressure U")));
  assert.match(plan.coordinator.coverage.shell,/COVER|QUARTERS|MATCH|BRACKET/i);
  assert.ok(plan.coordinator.situations.passingDown.length>20);
});

test("every coordinator formation fields eleven correctly separated players per side", () => {
  for (const formation of Object.keys(offenseFormations) as Array<keyof typeof offenseFormations>) {
    const offense = offenseFormations[formation];
    const defense = defenseFormations[formation];
    assert.equal(offense.length,11,`${formation} offense must show 11 players`);
    assert.equal(defense.length,11,`${formation} defense must show 11 players`);
    assert.deepEqual(offense.filter((player)=>["LT","LG","C","RG","RT"].includes(player.role)).map((player)=>player.role),["LT","LG","C","RG","RT"]);
    assert.ok(offense.filter((player)=>["LT","LG","C","RG","RT"].includes(player.role)).every((player)=>player.y>61.5));
    assert.ok(defense.filter((player)=>["DE","DT","NT"].includes(player.role)).every((player)=>player.y<61.5));
    for (const unit of [offense,defense]) {
      for (let first=0;first<unit.length;first++) {
        for (let second=first+1;second<unit.length;second++) {
          const phoneDistance=Math.hypot((unit[first].x-unit[second].x)*3.5,(unit[first].y-unit[second].y)*4);
          assert.ok(phoneDistance>=32,`${formation} ${unit[first].role}/${unit[second].role} overlap at phone width`);
        }
      }
    }
  }
});

test("play art begins at the actual ball carrier and separates routes from blocks", () => {
  const spreadRun = buildPlayDiagram("spread","edge-run");
  const iFormRun = buildPlayDiagram("i-form","inside-run");
  const airRaidPass = buildPlayDiagram("air-raid","vertical");
  const option = buildPlayDiagram("flexbone","triple-option");
  assert.match(spreadRun.paths.find((path)=>path.kind==="primary")!.d,/^M63 89\b/);
  assert.match(iFormRun.paths.find((path)=>path.kind==="primary")!.d,/^M50 93\b/);
  assert.match(airRaidPass.paths.find((path)=>path.kind==="primary")!.d,/^M7 67\b/);
  assert.equal(airRaidPass.paths.filter((path)=>path.kind==="block").length,5);
  assert.deepEqual(option.read,{x:68,y:56,label:"READ"});
});

test("new scoring model does not reward empty attempt volume", () => {
  const efficient = { ypp:6,ypa:7.5,ypc:4.8,passAttempts:30,rushAttempts:30,scoringProjection:27 };
  const junkVolume = { ypp:4,ypa:5,ypc:3.2,passAttempts:45,rushAttempts:45,scoringProjection:27 };
  assert.equal(scoringModelFeatures(efficient).expectedYards,scoringModelFeatures(junkVolume).expectedYards);
  assert.ok(estimatePoints(efficient)>estimatePoints(junkVolume));
});

test("matchup evidence stays conservative for a mature but weak schedule", () => {
  const weak = buildMatchupEvidence([0.08,0.12,0.16,0.2,0.22,0.25,0.28,0.3], [0.08,0.12,0.16,0.2,0.22,0.25,0.28,0.3], 8);
  const proven = buildMatchupEvidence([0.45,0.52,0.58,0.63,0.7,0.76,0.82,0.9], [0.52,0.7,0.82], 8);

  assert.ok(weak.reliability < 0.65, `weak schedule reliability should stay below 65%, got ${weak.reliability}`);
  assert.ok(proven.reliability > 0.85, `proven schedule reliability should exceed 85%, got ${proven.reliability}`);
  assert.ok(proven.scheduleStrength > weak.scheduleStrength);
});

test("weak-schedule proof also regresses favorable advanced component percentages", () => {
  const weak = buildMatchupEvidence([0.08,0.12,0.16,0.2,0.22,0.25,0.28,0.3], [0.08,0.12,0.16], 8);
  const components = advancedProfile({ lineYards:1.42,secondLevelYards:1.32,openFieldYards:1.25,completionRate:1.16,yardsPerCompletion:1.18 }, { lineYards:0.7 });
  const projection = projectCalibratedMatchup(
    { offense:[1.2,1.2,1.2,1,1],defense:[0.8,0.8,0.8,1,1],evidence:weak,advanced:components },
    { offense:[1,1,1,1,1],defense:[1,1,1,1,1],advanced:advancedProfile({}, {}) },
    true,
  );
  assert.ok(projection.calibratedHome.advanced);
  assert.ok(projection.calibratedHome.advanced.offense.index.lineYards! < 1.42);
  assert.ok(projection.calibratedHome.advanced.defense.index.lineYards! > 0.7);
});

test("quality wins validate efficiency without using conference labels", () => {
  const opponents = [0.35,0.4,0.48,0.55,0.62,0.7,0.78,0.84];
  const noQualityWin = buildMatchupEvidence(opponents, [0.35,0.4,0.48], 8);
  const qualityWins = buildMatchupEvidence(opponents, [0.55,0.7,0.84], 8);

  assert.ok(qualityWins.reliability > noQualityWin.reliability);
  assert.ok(qualityWins.qualityWinStrength > noQualityWin.qualityWinStrength);
});

test("proven efficiency beats a stronger-looking profile built only on bad opponents", () => {
  const untestedEvidence = buildMatchupEvidence([0.08,0.12,0.16,0.2,0.22,0.25,0.28,0.3], [0.08,0.12,0.16,0.2,0.22,0.25,0.28,0.3], 8);
  const provenEvidence = buildMatchupEvidence([0.5,0.58,0.64,0.7,0.76,0.82,0.88,0.94], [0.64,0.82,0.94], 8);
  const projection = projectCalibratedMatchup(
    { offense:[1.22,1.22,1.22,1,1],defense:[0.78,0.78,0.78,1,1],evidence:untestedEvidence },
    { offense:[1.16,1.16,1.16,1,1],defense:[0.84,0.84,0.84,1,1],evidence:provenEvidence },
    true,
    1540,
    1640,
  );

  assert.ok(projection.margin < 0, `proven team should be favored; untested-team margin was ${projection.margin}`);
  assert.ok(projection.calibratedHome.offense[0] < 1.1);
  assert.ok(projection.calibratedAway.offense[0] > projection.calibratedHome.offense[0]);
});

test("James Madison-style weak-network efficiency is discounted against a proven playoff profile", () => {
  const weakNetwork = buildMatchupEvidence([0.08,0.18,0.2,0.23,0.27,0.3,0.34,0.38,0.42,0.46,0.5,0.56,0.62], [0.08,0.18,0.2,0.23,0.27,0.3,0.34,0.38,0.42,0.46,0.5,0.56], 13);
  const playoffSchedule = buildMatchupEvidence([0.38,0.45,0.52,0.58,0.62,0.68,0.72,0.78,0.82,0.88,0.92,0.96], [0.52,0.62,0.72,0.82,0.92], 12);
  const projection = projectCalibratedMatchup(
    { offense:[1.111,1.059,1.252,0.854,1.192],defense:[0.73,0.803,0.6,0.992,0.854],evidence:weakNetwork },
    { offense:[1.235,1.208,1.314,0.925,1.038],defense:[0.744,0.74,0.755,0.894,0.916],evidence:playoffSchedule },
    true,
    1600,
    1710,
  );

  assert.ok(projection.margin < -5, `playoff profile should be favored by more than five; margin was ${projection.margin}`);
  assert.ok(projection.calibratedHome.defense[2] > 0.65, "unsupported elite run-defense index should regress away from the clamp");
});

test("schedule calibration penalizes an FCS-heavy sample more aggressively", () => {
  const allFbs = scheduleCalibrationWeights(6, 6);
  const fcsHeavy = scheduleCalibrationWeights(6, 2);

  assert.equal(allFbs.opponentAdjustment, 0.25);
  assert.ok(fcsHeavy.opponentAdjustment > allFbs.opponentAdjustment);
  assert.ok(fcsHeavy.priorGames > allFbs.priorGames);
});

test("schedule calibration shrinks a tiny sample more than a mature one", () => {
  const early = scheduleCalibrationWeights(1, 1);
  const mature = scheduleCalibrationWeights(8, 8);

  assert.ok(early.opponentAdjustment > mature.opponentAdjustment);
  assert.ok(early.priorGames > mature.priorGames);
});

test("schedule calibration keeps untested FBS efficiency closer to its preseason prior", () => {
  const proven = scheduleCalibrationWeights(8, 8, 1);
  const untested = scheduleCalibrationWeights(8, 8, 0.15);

  assert.ok(untested.opponentAdjustment > proven.opponentAdjustment);
  assert.ok(untested.priorGames > proven.priorGames);
});

test("postseason Elo starts after the regular season even when week numbers reset", () => {
  const games: NormalizedGame[] = [
    {
      id: "regular-1", season: 2025, week: 1, seasonType: "regular", startDate: "2025-08-30T16:00:00Z",
      completed: true, neutralSite: true, conferenceGame: false, venue: null,
      homeTeam: "Alpha", homeConference: "Test", homePoints: 35,
      awayTeam: "Beta", awayConference: "Test", awayPoints: 7,
    },
    {
      id: "postseason-1", season: 2025, week: 1, seasonType: "postseason", startDate: "2025-12-20T16:00:00Z",
      completed: false, neutralSite: true, conferenceGame: false, venue: null,
      homeTeam: "Alpha", homeConference: "Test", homePoints: null,
      awayTeam: "Beta", awayConference: "Test", awayPoints: null,
    },
  ];

  const snapshots = buildPregameElo(games, [], new Set(["Alpha", "Beta"]));
  const regular = snapshots.get("regular-1");
  const postseason = snapshots.get("postseason-1");
  assert.ok(regular && postseason);
  assert.equal(regular.get("Alpha"), regular.get("Beta"));
  assert.ok((postseason.get("Alpha") ?? 0) > (postseason.get("Beta") ?? 0));
});

test("pregame Elo consumes the calibrated transition state when it is available",()=>{
  const games:NormalizedGame[]=[{
    id:"week-1",season:2026,week:1,seasonType:"regular",startDate:"2026-09-01T00:00:00Z",
    completed:false,neutralSite:true,conferenceGame:false,venue:null,
    homeTeam:"Alpha",homeConference:"Test",homePoints:null,awayTeam:"Beta",awayConference:"Test",awayPoints:null,
  }];
  const alpha={...offseasonProfile("Alpha",2026,1.08),week:0,preseasonElo:1664} as Profile;
  const beta={...offseasonProfile("Beta",2026,1),week:0,preseasonElo:1478} as Profile;
  const snapshot=buildPregameElo(games,[alpha,beta],new Set(["Alpha","Beta"])).get("week-1");
  assert.equal(snapshot?.get("Alpha"),1664);
  assert.equal(snapshot?.get("Beta"),1478);
});

test("results Rankings stay unseeded while Season Sim can opt into preseason Elo",()=>{
  const profiles:RankingProfile[]=[
    {...profile("Alpha","Test",1),preseasonElo:1680},
    {...profile("Beta","Test",1),preseasonElo:1430},
  ];
  const resultsOnly=new Map(buildBcsRankings([],profiles).map((row)=>[row.team,row]));
  const forecast=new Map(buildBcsRankings([],profiles,{usePreseasonElo:true}).map((row)=>[row.team,row]));
  assert.equal(resultsOnly.get("Alpha")?.eloRating,1500);
  assert.equal(resultsOnly.get("Beta")?.eloRating,1500);
  assert.equal(forecast.get("Alpha")?.eloRating,1680);
  assert.equal(forecast.get("Beta")?.eloRating,1430);
});

test("final ranking Elo processes reset postseason weeks after the regular season", () => {
  const profiles = [profile("Alabama", "SEC", 1.2)];
  const regularSeason: RankingGame[] = Array.from({ length: 12 }, (_, index) => ({
    gameId: `regular-${index + 1}`,
    week: index + 1,
    startDate: `2018-${index < 4 ? "09" : index < 8 ? "10" : "11"}-${String((index % 4) * 7 + 1).padStart(2, "0")}T00:00:00Z`,
    neutralSite: true,
    homeTeam: "Alabama",
    homePoints: 40,
    awayTeam: `Opponent ${index + 1}`,
    awayPoints: 14,
  }));
  const resetPostseason: RankingGame[] = [
    {
      gameId: "semifinal",
      week: 1,
      startDate: "2018-12-29T00:00:00Z",
      seasonType: "postseason",
      neutralSite: true,
      homeTeam: "Alabama",
      homePoints: 45,
      awayTeam: "Oklahoma",
      awayPoints: 34,
    },
    {
      gameId: "championship",
      week: 2,
      startDate: "2019-01-07T00:00:00Z",
      seasonType: "postseason",
      neutralSite: true,
      homeTeam: "Alabama",
      homePoints: 16,
      awayTeam: "Clemson",
      awayPoints: 44,
    },
  ];
  const sequentialPostseason = resetPostseason.map((game, index) => ({ ...game, week: 13 + index }));
  const resetRating = buildBcsRankings([...regularSeason, ...resetPostseason], profiles)[0]?.eloRating;
  const sequentialRating = buildBcsRankings([...regularSeason, ...sequentialPostseason], profiles)[0]?.eloRating;

  assert.ok(resetRating && sequentialRating);
  assert.ok(Math.abs(resetRating - sequentialRating) < 1e-9);
});

test("final matchup rating stays on the weekly Elo scale after postseason losses", () => {
  const prePostseasonRating = 1744.77;
  const postseason: RankingGame[] = [
    {
      gameId: "semifinal",
      week: 1,
      startDate: "2018-12-29T00:00:00Z",
      seasonType: "postseason",
      neutralSite: true,
      homeTeam: "Alabama",
      homePoints: 45,
      awayTeam: "Oklahoma",
      awayPoints: 34,
    },
    {
      gameId: "championship",
      week: 2,
      startDate: "2019-01-07T00:00:00Z",
      seasonType: "postseason",
      neutralSite: true,
      homeTeam: "Alabama",
      homePoints: 16,
      awayTeam: "Clemson",
      awayPoints: 44,
    },
  ];
  const finalRating = finalMatchupRating({ eloRating: 1733.52, wins: 14, losses: 1, ties: 0 }, postseason, "Alabama");
  const undefeatedChampionRating = finalMatchupRating({ eloRating: 1726.9, wins: 13, losses: 0, ties: 0 }, [
    { ...postseason[0], homePoints: 31, awayPoints: 14 },
    { ...postseason[1], homePoints: 52, awayPoints: 24 },
  ], "Alabama");

  assert.equal(finalRating, 1708.02);
  assert.ok(finalRating < prePostseasonRating);
  assert.equal(undefeatedChampionRating, 1819.4);
});

test("2026 projection seeds the top 12 directly from the Season Sim ranking", () => {
  const profiles = Array.from({ length: 14 }, (_, index) => ({
    ...profile(
      `Team ${index + 1}`,
      index<8?`Conference ${Math.floor(index/2)+1}`:index<12?"Independent":"Conference 5",
      1.18 - index * 0.025,
    ),
    offPattIndex:0.72 + index * 0.055,
    offRattIndex:1.34 - index * 0.045,
    defPattIndex:0.84 + index * 0.03,
    defRattIndex:1.18 - index * 0.025,
  }));
  const conferencePairs=[[1,2],[3,4],[5,6],[7,8],[13,14]];
  const schedule: SimulationScheduleGame[] = conferencePairs.map(([home,away],index) => ({
    gameId: `game-${index + 1}`,
    week: 1,
    startDate: "2026-09-01T00:00:00Z",
    seasonType: "regular",
    completed: false,
    neutralSite: false,
    conferenceGame: true,
    homeTeam: `Team ${home}`,
    homeConference: `Conference ${index + 1}`,
    homePoints: null,
    awayTeam: `Team ${away}`,
    awayConference: `Conference ${index + 1}`,
    awayPoints: null,
  }));

  const simulation = buildSeasonSimulation(2026, 0, 0, schedule, profiles);
  assert.equal(simulation.fieldMode, "projected-field");
  assert.equal(simulation.format, 12);
  assert.equal(simulation.rankings.filter((row) => row.playoffSeed !== null).length, 12);
  assert.ok(simulation.rankings.slice(0,12).every((row)=>row.playoffSeed===row.rank));
  assert.ok(simulation.rankings.slice(12).every((row)=>row.playoffSeed===null));
  const lowChampion=simulation.conferenceChampionships.find((row)=>row.conference==="Conference 5")!.winner;
  const lowChampionRow=simulation.rankings.find((row)=>row.team===lowChampion)!;
  assert.equal(lowChampionRow.conferenceChampion,true);
  assert.equal(lowChampionRow.playoffSeed,lowChampionRow.rank<=12?lowChampionRow.rank:null,"a conference title does not alter rank-based seeding");
  assert.equal(simulation.bracket.length, 11);
  assert.ok(simulation.champion);
  assert.ok(simulation.bracket.every((game)=>game.homePredictedStats&&game.awayPredictedStats&&game.edgeAnalysis));
  assert.ok(simulation.conferenceChampionships.every((game)=>game.homePredictedStats&&game.awayPredictedStats&&game.edgeAnalysis));

  const compact = compactSeasonSimulationForClient({
    ...simulation,
    rankings:[...simulation.rankings,{...simulation.rankings[0],rank:26,team:"Hidden Team"}],
  });
  const visibleSchedule=compact.rankings.find((row)=>row.rank===1)?.schedule??[];
  assert.ok(visibleSchedule.length>0);
  assert.equal("edgeAnalysis" in visibleSchedule[0],false);
  assert.equal(visibleSchedule[0].homePredictedStats,null);
  assert.equal(compact.rankings.find((row)=>row.team==="Hidden Team")?.schedule.length,0);
  assert.ok(JSON.stringify(compact).length<JSON.stringify({...simulation,rankings:[...simulation.rankings,{...simulation.rankings[0],rank:26,team:"Hidden Team"}]}).length);

  const profileMap = new Map(profiles.map((row) => [row.team, row]));
  const snapshotRankings = new Map(buildBcsRankings([], profiles).map((row) => [row.team, row]));
  for (const game of simulation.bracket) {
    const labProjection = projectSeasonMatchup(
      profileMap.get(game.firstTeam),
      profileMap.get(game.secondTeam),
      snapshotRankings.get(game.firstTeam),
      snapshotRankings.get(game.secondTeam),
      game.campusGame,
    );
    assert.equal(game.firstScore, labProjection.firstScore, `${game.id} first-team score diverged from Matchup Lab`);
    assert.equal(game.secondScore, labProjection.secondScore, `${game.id} second-team score diverged from Matchup Lab`);
    assert.equal(game.winner, labProjection.margin >= 0 ? game.firstTeam : game.secondTeam, `${game.id} winner diverged from Matchup Lab`);
    assert.equal(game.homeWinProbability,labProjection.firstWinProbability,`${game.id} preview probability diverged from Matchup Lab`);
    assert.deepEqual(game.homePredictedStats,labProjection.homePredictedStats,`${game.id} preview stats diverged from Matchup Lab`);
  }
});

test("projected final H+ rankings move when a weekly result changes the remaining season path",()=>{
  const projectionProfiles=[
    profile("Alpha","A",1.2),profile("Beta","B",.94),profile("Gamma","A",1.12),
    profile("Delta","B",1.04),profile("Epsilon","C",1.02),profile("Zeta","C",.98),
  ];
  const preseasonSchedule:SimulationScheduleGame[]=[
    {gameId:"upset",week:1,startDate:"2026-09-01",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:false,homeTeam:"Alpha",homeConference:"A",homePoints:null,awayTeam:"Beta",awayConference:"B",awayPoints:null},
    {gameId:"a-title-path",week:5,startDate:"2026-10-01",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:true,homeTeam:"Alpha",homeConference:"A",homePoints:null,awayTeam:"Gamma",awayConference:"A",awayPoints:null},
    {gameId:"b-title-path",week:5,startDate:"2026-10-01",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:true,homeTeam:"Beta",homeConference:"B",homePoints:null,awayTeam:"Delta",awayConference:"B",awayPoints:null},
    {gameId:"c-title-path",week:5,startDate:"2026-10-01",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:true,homeTeam:"Epsilon",homeConference:"C",homePoints:null,awayTeam:"Zeta",awayConference:"C",awayPoints:null},
  ];
  const before=buildSeasonSimulation(2026,0,0,preseasonSchedule,projectionProfiles);
  const afterSchedule=preseasonSchedule.map((game)=>game.gameId==="upset"?{...game,completed:true,homePoints:10,awayPoints:35}:game);
  const after=buildSeasonSimulation(2026,1,1,afterSchedule,projectionProfiles);
  const rank=(simulation:ReturnType<typeof buildSeasonSimulation>,team:string)=>simulation.rankings.find((row)=>row.team===team)!.rank;
  assert.ok(rank(after,"Beta")<rank(before,"Beta"));
  assert.ok(rank(after,"Alpha")>rank(before,"Alpha"));
});

test("manual game flips create close realistic scores without changing the model receipt",()=>{
  const rawScore=realisticScenarioScore(35,17,.82,false);
  assert.ok(rawScore.secondScore>rawScore.firstScore);
  assert.equal(Math.abs(rawScore.margin),3);
  assert.ok(Math.abs(rawScore.firstScore+rawScore.secondScore-52)<=1);

  const alpha=profile("Alpha","Independent",1.2);
  const beta=profile("Beta","Independent",.9);
  const rankings=new Map(buildBcsRankings([], [alpha,beta]).map((row)=>[row.team,row]));
  const projection=projectSeasonMatchup(alpha,beta,rankings.get("Alpha"),rankings.get("Beta"),true);
  const flipped=applySimulationGameOverride(projection,false);
  assert.ok(flipped.secondScore>flipped.firstScore);
  assert.ok(Math.abs(flipped.margin)>=3&&Math.abs(flipped.margin)<=7);
  assert.equal(flipped.firstWinProbability,projection.firstWinProbability);
  assert.equal(flipped.homePredictedStats,projection.homePredictedStats);
  assert.match(flipped.schematicEdge,/Manual scenario/);
});

test("an isolated manual result rebuilds both teams' records and projected ranks",()=>{
  const profiles=[
    profile("Alpha","Independent",1.2),profile("Beta","Independent",.9),profile("Gamma","Independent",1.1),
    profile("Delta","Independent",.97),profile("Epsilon","Independent",1.02),profile("Zeta","Independent",.99),
  ];
  const game=(gameId:string,week:number,homeTeam:string,awayTeam:string):SimulationScheduleGame=>({
    gameId,week,startDate:`2026-09-${String(week).padStart(2,"0")}T00:00:00Z`,seasonType:"regular",completed:false,
    neutralSite:false,conferenceGame:false,homeTeam,homeConference:"Independent",homePoints:null,
    awayTeam,awayConference:"Independent",awayPoints:null,
  });
  const schedule=[
    game("flip",1,"Alpha","Beta"),game("alpha-gamma",2,"Alpha","Gamma"),game("beta-delta",2,"Beta","Delta"),
    game("gamma-delta",1,"Gamma","Delta"),game("epsilon-zeta",1,"Epsilon","Zeta"),
  ];
  const baseline=buildSeasonSimulation(2026,0,0,schedule,profiles);
  const baselineAlpha=baseline.rankings.find((row)=>row.team==="Alpha")!;
  const baselineBeta=baseline.rankings.find((row)=>row.team==="Beta")!;
  const baselineGame=baselineAlpha.schedule.find((row)=>row.gameId==="flip")!;
  assert.ok(baselineGame.teamScore>baselineGame.opponentScore);

  const scenario=buildSeasonSimulation(2026,0,0,schedule,profiles,{
    gameOverrides:[{gameId:"flip",winnerTeam:"Beta"}],
  });
  const scenarioAlpha=scenario.rankings.find((row)=>row.team==="Alpha")!;
  const scenarioBeta=scenario.rankings.find((row)=>row.team==="Beta")!;
  const scenarioGame=scenarioAlpha.schedule.find((row)=>row.gameId==="flip")!;

  assert.ok(scenarioGame.teamScore<scenarioGame.opponentScore);
  assert.equal(scenarioAlpha.projectedWins,baselineAlpha.projectedWins-1);
  assert.equal(scenarioAlpha.projectedLosses,baselineAlpha.projectedLosses+1);
  assert.equal(scenarioBeta.projectedWins,baselineBeta.projectedWins+1);
  assert.equal(scenarioBeta.projectedLosses,baselineBeta.projectedLosses-1);
  assert.ok(scenarioAlpha.rank>baselineAlpha.rank);
  assert.ok(scenarioBeta.rank<baselineBeta.rank);
  assert.equal(scenarioGame.homeWinProbability,baselineGame.homeWinProbability,"the original model probability remains visible");
  assert.match(scenario.methodology,/Manual scenario results are fixed/);
});

test("Week 16 scenarios can reverse completed games and rebuild the playoff field",()=>{
  const profiles=Array.from({length:13},(_,index)=>profile(`Team ${index+1}`,"Independent",1.18-index*.02));
  const schedule:SimulationScheduleGame[]=[{
    gameId:"retroactive",week:1,startDate:"2026-09-01T00:00:00Z",seasonType:"regular",completed:true,
    neutralSite:false,conferenceGame:false,homeTeam:"Team 1",homeConference:"Independent",homePoints:31,
    awayTeam:"Team 13",awayConference:"Independent",awayPoints:10,pregameHomeWinProbability:.8,
    pregameModelHomeSpread:-12,pregameModelTotal:41,
  }];
  const baseline=buildSeasonSimulation(2026,15,15,schedule,profiles);
  const scenario=buildSeasonSimulation(2026,15,15,schedule,profiles,{
    gameOverrides:[{gameId:"retroactive",winnerTeam:"Team 13"}],
  });
  const baselineGame=baseline.rankings.find((row)=>row.team==="Team 1")!.schedule[0];
  const scenarioGame=scenario.rankings.find((row)=>row.team==="Team 1")!.schedule[0];

  assert.equal(baselineGame.status,"final");
  assert.equal(baselineGame.homeWinProbability,.8);
  assert.ok(scenarioGame.teamScore<scenarioGame.opponentScore);
  assert.equal(Math.abs(scenarioGame.teamScore-scenarioGame.opponentScore),3);
  assert.ok(Math.abs(scenarioGame.teamScore+scenarioGame.opponentScore-41)<=1);
  assert.equal(baseline.rankings.find((row)=>row.team==="Team 13")?.playoffSeed,null);
  assert.equal(scenario.rankings.find((row)=>row.team==="Team 13")?.playoffSeed,1);
  assert.equal(scenario.rankings.find((row)=>row.team==="Team 1")?.playoffSeed,null);
  assert.notDeepEqual(
    baseline.bracket.map((game)=>[game.round,game.firstTeam,game.secondTeam]),
    scenario.bracket.map((game)=>[game.round,game.firstTeam,game.secondTeam]),
  );
});

test("a selected team's simulated conference championship appears at Week 15 and can be flipped",()=>{
  const profiles=[profile("Alpha","Test",1.15),profile("Beta","Test",1.02),profile("Gamma","Other",1.08),profile("Delta","Other",.98)];
  const schedule:SimulationScheduleGame[]=[
    {gameId:"test-regular",week:8,startDate:"2026-10-20T00:00:00Z",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:true,homeTeam:"Alpha",homeConference:"Test",homePoints:null,awayTeam:"Beta",awayConference:"Test",awayPoints:null},
    {gameId:"other-regular",week:8,startDate:"2026-10-20T00:00:00Z",seasonType:"regular",completed:false,neutralSite:false,conferenceGame:true,homeTeam:"Gamma",homeConference:"Other",homePoints:null,awayTeam:"Delta",awayConference:"Other",awayPoints:null},
  ];
  const baseline=buildSeasonSimulation(2026,0,0,schedule,profiles);
  const title=baseline.conferenceChampionships.find((game)=>game.conference==="Test")!;
  const forcedWinner=title.winner===title.firstTeam?title.secondTeam:title.firstTeam;
  const scenario=buildSeasonSimulation(2026,0,0,schedule,profiles,{
    gameOverrides:[{gameId:"sim-2026-Test",winnerTeam:forcedWinner}],
  });
  const scenarioTitle=scenario.conferenceChampionships.find((game)=>game.conference==="Test")!;
  const titleSchedule=scenario.rankings.find((row)=>row.team===forcedWinner)!.schedule.find((game)=>game.gameId==="sim-2026-Test");

  assert.equal(scenarioTitle.winner,forcedWinner);
  assert.equal(titleSchedule?.week,15);
  assert.equal(titleSchedule?.seasonType,"conference-championship");
  assert.equal(scenario.rankings.find((row)=>row.team===forcedWinner)?.conferenceChampion,true);
});

test("a stored Week 14 conference championship replaces the generated title game",()=>{
  const profiles=[
    profile("Alabama","SEC",1.18),profile("Georgia","SEC",1.2),
    profile("LSU","SEC",1.05),profile("Ole Miss","SEC",1.04),
  ];
  const schedule:SimulationScheduleGame[]=[
    {gameId:"alabama-lsu",week:10,startDate:"2023-11-04T23:45:00Z",seasonType:"regular",completed:true,neutralSite:false,conferenceGame:true,homeTeam:"Alabama",homeConference:"SEC",homePoints:31,awayTeam:"LSU",awayConference:"SEC",awayPoints:21},
    {gameId:"georgia-ole-miss",week:11,startDate:"2023-11-11T23:00:00Z",seasonType:"regular",completed:true,neutralSite:false,conferenceGame:true,homeTeam:"Georgia",homeConference:"SEC",homePoints:35,awayTeam:"Ole Miss",awayConference:"SEC",awayPoints:17},
    {gameId:"2023-sec-title",week:14,startDate:"2023-12-02T21:00:00Z",seasonType:"regular",completed:true,neutralSite:true,conferenceGame:true,homeTeam:"Georgia",homeConference:"SEC",homePoints:27,awayTeam:"Alabama",awayConference:"SEC",awayPoints:24,pregameHomeWinProbability:.62},
  ];
  assert.deepEqual([...conferenceChampionshipGameIds(schedule)],["2023-sec-title"]);

  const simulation=buildSeasonSimulation(2023,16,16,schedule,profiles);
  const alabama=simulation.rankings.find((row)=>row.team==="Alabama")!;
  const titleRows=alabama.schedule.filter((game)=>game.seasonType==="conference-championship");

  assert.equal(titleRows.length,1);
  assert.equal(titleRows[0].gameId,"2023-sec-title");
  assert.equal(titleRows[0].week,14);
  assert.equal(titleRows[0].status,"final");
  assert.equal(alabama.projectedRecord,"1–1");
  assert.equal(simulation.conferenceChampionships.filter((game)=>game.conference==="SEC").length,1);
});

test("weekly H+ rankings freeze before kickoff and rerank for the following week",()=>{
  assert.equal(scoreRankingSnapshotWeek(1),0);
  assert.equal(scoreRankingSnapshotWeek(5),4);
  assert.equal(scoreRankingSnapshotWeek(12),11);
  assert.equal(scoreRankingSnapshotWeek(0),16);
  assert.equal(scoreRankingSnapshotWeek(0,9),9);
  assert.equal(enteringWeekSnapshotWeek(0),0);
  assert.equal(enteringWeekSnapshotWeek(4),3);
  assert.equal(enteringWeekSnapshotWeek(5),4);
  assert.equal(rankingAppliesToWeek(0),1);
  assert.equal(rankingAppliesToWeek(4),5);
});

test("a current week's result cannot alter its own entering-week Season Sim rank",()=>{
  const profiles=[profile("Duke","ACC",1.2),profile("Notre Dame","Independent",1.16),profile("Clemson","ACC",1.08),profile("Florida State","ACC",1.06)];
  const baseSchedule:SimulationScheduleGame[]=[
    {gameId:"duke-start",week:1,startDate:"2023-09-04T00:00:00Z",seasonType:"regular",completed:true,neutralSite:false,conferenceGame:false,homeTeam:"Duke",homeConference:"ACC",homePoints:38,awayTeam:"FCS One",awayConference:null,awayPoints:7},
    {gameId:"duke-notre-dame",week:5,startDate:"2023-09-30T23:30:00Z",seasonType:"regular",completed:true,neutralSite:false,conferenceGame:false,homeTeam:"Duke",homeConference:"ACC",homePoints:14,awayTeam:"Notre Dame",awayConference:"Independent",awayPoints:21},
    {gameId:"acc-seed",week:4,startDate:"2023-09-23T16:00:00Z",seasonType:"regular",completed:true,neutralSite:false,conferenceGame:true,homeTeam:"Clemson",homeConference:"ACC",homePoints:24,awayTeam:"Florida State",awayConference:"ACC",awayPoints:21},
  ];
  const flippedSchedule=baseSchedule.map((game)=>game.gameId==="duke-notre-dame"?{...game,homePoints:28,awayPoints:14}:game);
  const enteringWeekFiveLoss=buildSeasonSimulation(2023,4,4,baseSchedule,profiles);
  const enteringWeekFiveWin=buildSeasonSimulation(2023,4,4,flippedSchedule,profiles);
  assert.deepEqual(
    enteringWeekFiveLoss.rankings.map((row)=>[row.team,row.rank,row.projectedRecord]),
    enteringWeekFiveWin.rankings.map((row)=>[row.team,row.rank,row.projectedRecord]),
  );

  const afterWeekFiveLoss=buildSeasonSimulation(2023,5,5,baseSchedule,profiles);
  const afterWeekFiveWin=buildSeasonSimulation(2023,5,5,flippedSchedule,profiles);
  assert.notDeepEqual(
    afterWeekFiveLoss.rankings.map((row)=>[row.team,row.rank,row.projectedRecord]),
    afterWeekFiveWin.rankings.map((row)=>[row.team,row.rank,row.projectedRecord]),
  );
});

test("projected losses outweigh schedule difficulty in the final H+ order",()=>{
  const row=(overrides:Partial<ReturnType<typeof buildBcsRankings>[number]>)=>({
    wins:0,losses:0,ties:0,resultsScore:.5,computerScore:.5,scheduleScore:.5,...overrides,
  }) as ReturnType<typeof buildBcsRankings>[number];
  const hardScheduleFiveLosses=projectedFinalRankingScore(
    row({resultsScore:.65,computerScore:.9,scheduleScore:1}),
    {expectedWins:6.5,wins:7,losses:5,games:Array(12)},
  );
  const tenWinTeam=projectedFinalRankingScore(
    row({resultsScore:.75,computerScore:.78,scheduleScore:.35}),
    {expectedWins:10.2,wins:10,losses:2,games:Array(12)},
  );
  assert.ok(tenWinTeam>hardScheduleFiveLosses);
});

test("an unbeaten weak-schedule résumé does not outrank a proven one-loss contender",()=>{
  const row=(overrides:Partial<ReturnType<typeof buildBcsRankings>[number]>)=>({
    wins:0,losses:0,ties:0,resultsScore:.5,computerScore:.5,scheduleScore:.5,
    scheduleStrength:.5,bestOpponentStrength:.5,qualityWinStrength:.5,...overrides,
  }) as ReturnType<typeof buildBcsRankings>[number];
  const libertyStyle=projectedFinalRankingScore(
    row({resultsScore:.94,computerScore:.55,scheduleScore:.15,scheduleStrength:.25,bestOpponentStrength:.3,qualityWinStrength:.25}),
    {expectedWins:11.2,wins:13,losses:0,games:Array(13)},
  );
  const alabamaStyle=projectedFinalRankingScore(
    row({resultsScore:.88,computerScore:.93,scheduleScore:.9,scheduleStrength:.82,bestOpponentStrength:.95,qualityWinStrength:.9}),
    {expectedWins:11,wins:12,losses:1,games:Array(13)},
  );
  assert.ok(alabamaStyle>libertyStyle);
});

test("Power 4 conference filtering covers only the ACC, Big 12, Big Ten and SEC",()=>{
  assert.deepEqual(conferenceFilterSqlValues(POWER_4_FILTER),["ACC","Big 12","Big Ten","SEC"]);
  for(const conference of ["ACC","Big 12","Big Ten","SEC"])assert.equal(matchesConferenceFilter(conference,POWER_4_FILTER),true);
  for(const conference of ["Pac-12","American Athletic","Mountain West",null])assert.equal(matchesConferenceFilter(conference,POWER_4_FILTER),false);
});

test("Season Sim and Matchup Lab share the complete five-index engine input", () => {
  const alpha = {
    ...profile("Alpha", "Test", 1.12),
    offPattIndex:1.68,
    offRattIndex:.58,
    defPattIndex:.74,
    defRattIndex:1.32,
    advanced:advancedProfile(
      {passingSuccessRate:1.14,passingPpa:1.18,rushingSuccessRate:.94},
      {passingSuccessRate:.88,passingPpa:.9,rushingSuccessRate:1.05},
    ),
  };
  const beta = {
    ...profile("Beta", "Test", .98),
    offPattIndex:.64,
    offRattIndex:1.52,
    defPattIndex:1.28,
    defRattIndex:.77,
    advanced:advancedProfile(
      {passingSuccessRate:.92,passingPpa:.9,rushingSuccessRate:1.12},
      {passingSuccessRate:1.08,passingPpa:1.1,rushingSuccessRate:.9},
    ),
  };
  const rankings = new Map(buildBcsRankings([], [alpha, beta]).map((row) => [row.team, row]));
  const alphaRank = rankings.get(alpha.team)!;
  const betaRank = rankings.get(beta.team)!;
  const evidence = (row:typeof alphaRank) => ({
    gamesPlayed:row.wins+row.losses+row.ties,
    scheduleStrength:row.scheduleStrength,
    bestOpponentStrength:row.bestOpponentStrength,
    qualityWinStrength:row.qualityWinStrength,
    reliability:row.matchupReliability,
  });
  const labProjection = projectMatchupEngine(
    {
      team:alpha.team,
      offense:[alpha.offYppIndex,alpha.offYpaIndex,alpha.offYpcIndex,alpha.offPattIndex,alpha.offRattIndex],
      defense:[alpha.defYppIndex,alpha.defYpaIndex,alpha.defYpcIndex,alpha.defPattIndex,alpha.defRattIndex],
      evidence:evidence(alphaRank),
      advanced:alpha.advanced,
      outcomeRating:alphaRank.eloRating,
    },
    {
      team:beta.team,
      offense:[beta.offYppIndex,beta.offYpaIndex,beta.offYpcIndex,beta.offPattIndex,beta.offRattIndex],
      defense:[beta.defYppIndex,beta.defYpaIndex,beta.defYpcIndex,beta.defPattIndex,beta.defRattIndex],
      evidence:evidence(betaRank),
      advanced:beta.advanced,
      outcomeRating:betaRank.eloRating,
    },
    false,
  );
  const scoreCard = matchupScoreCard(labProjection);
  const seasonProjection = projectSeasonMatchup(alpha, beta, alphaRank, betaRank, true);
  const bulkSeasonProjection = projectSeasonMatchup(alpha, beta, alphaRank, betaRank, true, false);

  assert.equal(seasonProjection.margin, labProjection.margin);
  assert.equal(seasonProjection.firstWinProbability, labProjection.homeWinProbability);
  assert.equal(seasonProjection.firstScore, scoreCard.homeScore);
  assert.equal(seasonProjection.secondScore, scoreCard.awayScore);
  assert.equal(bulkSeasonProjection.margin,seasonProjection.margin);
  assert.equal(bulkSeasonProjection.firstWinProbability,seasonProjection.firstWinProbability);
  assert.equal(bulkSeasonProjection.firstScore,seasonProjection.firstScore);
  assert.equal(bulkSeasonProjection.secondScore,seasonProjection.secondScore);
  assert.equal(bulkSeasonProjection.edgeAnalysis,undefined);
});

test("season simulation preserves every Matchup Lab winner in the displayed record", () => {
  const opponents = Array.from({length:10},(_,index)=>`Opponent ${index}`);
  const profiles = [profile("Close Favorite","Independent",1.04),...opponents.map((team)=>profile(team,"Independent",1))];
  const schedule:SimulationScheduleGame[] = opponents.map((team,index)=>({
    gameId:`close-${index}`,week:index+1,startDate:`2026-09-${String(index+1).padStart(2,"0")}T00:00:00Z`,seasonType:"regular",completed:false,
    neutralSite:false,conferenceGame:false,homeTeam:"Close Favorite",homeConference:"Independent",homePoints:null,
    awayTeam:team,awayConference:"Independent",awayPoints:null,
  }));
  const simulation = buildSeasonSimulation(2026,0,0,schedule,profiles);
  const favorite = simulation.rankings.find((row)=>row.team==="Close Favorite");
  assert.ok(favorite);
  const profileMap = new Map(profiles.map((row)=>[row.team,row]));
  const snapshotRankings = new Map(buildBcsRankings([],profiles).map((row)=>[row.team,row]));
  const expectedWinners = schedule.map((game) => {
    const projection = projectSeasonMatchup(
      profileMap.get(game.homeTeam),
      profileMap.get(game.awayTeam),
      snapshotRankings.get(game.homeTeam),
      snapshotRankings.get(game.awayTeam),
      true,
    );
    return projection.margin >= 0 ? game.homeTeam : game.awayTeam;
  });
  const expectedWins = expectedWinners.filter((winner)=>winner==="Close Favorite").length;
  assert.equal(favorite.projectedWins,expectedWins);
  assert.equal(favorite.projectedLosses,schedule.length-expectedWins);
  assert.equal(favorite.projectedRecord,`${expectedWins}–${schedule.length-expectedWins}`);
  assert.ok(favorite.expectedWins<favorite.projectedWins,"expected wins should retain uncertainty without rewriting game outcomes");
  assert.deepEqual(favorite.projectedLossesTo,[]);
});

test("season simulation exposes a chronological final-versus-projected schedule and running record", () => {
  const profiles = [profile("Alpha","Independent",1.08),profile("Beta","Independent",.97)];
  const schedule:SimulationScheduleGame[] = [
    {
      gameId:"played",week:1,startDate:"2026-09-01T00:00:00Z",seasonType:"regular",completed:true,
      neutralSite:false,conferenceGame:false,homeTeam:"Alpha",homeConference:"Independent",homePoints:31,
      awayTeam:"Beta",awayConference:"Independent",awayPoints:17,
    },
    {
      gameId:"future",week:2,startDate:"2026-09-08T00:00:00Z",seasonType:"regular",completed:false,
      neutralSite:false,conferenceGame:false,homeTeam:"Beta",homeConference:"Independent",homePoints:null,
      awayTeam:"Alpha",awayConference:"Independent",awayPoints:null,
    },
  ];
  const simulation=buildSeasonSimulation(2026,1,1,schedule,profiles);
  const alpha=simulation.rankings.find((row)=>row.team==="Alpha");
  assert.ok(alpha);
  assert.equal(alpha.schedule.length,2);
  assert.deepEqual(alpha.schedule[0],{
    gameId:"played",
    opponent:"Beta",
    location:"HOME",
    status:"final",
    teamScore:31,
    opponentScore:17,
    recordAfter:"1–0",
    homeTeam:"Alpha",
    awayTeam:"Beta",
    homeScore:31,
    awayScore:17,
    homeRecordAfter:"1–0",
    awayRecordAfter:"0–1",
    neutralSite:false,
    week:1,
    seasonType:"regular",
    homeWinProbability:1,
    modelHomeSpread:null,
    modelTotal:null,
    homePredictedStats:null,
    awayPredictedStats:null,
    homePredictedAdvanced:null,
    awayPredictedAdvanced:null,
    edgeAnalysis:undefined,
  });
  assert.equal(alpha.schedule[1].gameId,"future");
  assert.equal(alpha.schedule[1].opponent,"Beta");
  assert.equal(alpha.schedule[1].location,"AWAY");
  assert.equal(alpha.schedule[1].status,"projected");
  assert.equal(alpha.schedule[1].recordAfter,alpha.projectedRecord);
  assert.equal(alpha.schedule[1].awayTeam,"Alpha");
  assert.equal(alpha.schedule[1].awayRecordAfter,alpha.projectedRecord);
  assert.equal(alpha.schedule[1].homeTeam,"Beta");
  assert.match(alpha.schedule[1].homeRecordAfter,/^\d+–\d+$/);
  assert.equal(typeof alpha.schedule[1].teamScore,"number");
  assert.equal(typeof alpha.schedule[1].opponentScore,"number");
  assert.equal(alpha.schedule[1].edgeAnalysis,undefined);
});

test("offensive viability thresholds are learned and enter one possession model instead of a fixed deduction", () => {
  const threshold=discoverViabilityThreshold(historicalViabilityCalibration["overall-success"]).threshold;
  assert.ok(threshold>.4&&threshold<.48);
  const base=advancedProfile({successRate:1,passingSuccessRate:1,rushingSuccessRate:1,standardDownSuccessRate:1,passingDownSuccessRate:1,havocRate:1},{successRate:1,passingSuccessRate:1,rushingSuccessRate:1,standardDownSuccessRate:1,passingDownSuccessRate:1,havocRate:1});
  base.baseline.successRate=.44;base.baseline.rushingSuccessRate=.42;base.baseline.passingSuccessRate=.44;base.baseline.standardDownSuccessRate=.47;base.baseline.passingDownSuccessRate=.33;base.baseline.havocRate=.19;
  const healthy=projectAdvancedSide(base,base,4.4,7.3,4.4,7.3)!;
  const collapsed={...healthy,overall:{...healthy.overall,successRate:.34,havocRate:.26},run:{...healthy.run,rushingSuccessRate:.32},pass:{...healthy.pass,passingSuccessRate:.34,standardDownSuccessRate:.36,passingDownSuccessRate:.24}};
  const healthyViability=assessOffensiveViability(healthy);
  const collapsedViability=assessOffensiveViability(collapsed);
  const healthyScore=buildPossessionScoreReceipt(healthy,base,12,healthyViability,28);
  const collapsedScore=buildPossessionScoreReceipt(collapsed,base,12,collapsedViability,28);
  assert.ok(["At Risk","Critical"].includes(collapsedViability.status));
  assert.ok(collapsedViability.risk>healthyViability.risk);
  assert.ok(collapsedScore.expectedPointsPerPossession<healthyScore.expectedPointsPerPossession);
  assert.equal(collapsedScore.contributions.filter((row)=>row.id==="viability").length,1);
});

test("viability calibration is rebuilt from archived scoring observations instead of a stored cutoff",()=>{
  const observations=Array.from({length:800},(_,index)=>{
    const value=.28+(index%200)/1000;
    const pointsPerDrive=value<.415?1.25+value:2.45+value;
    return {pointsPerDrive,values:{
      "overall-success":value,"rush-success":value,"pass-success":value,"standard-down":value,
      "passing-down":value-.08,havoc:.55-value,
    }};
  });
  const learned=deriveViabilityCalibration(observations);
  const threshold=discoverViabilityThreshold(learned["overall-success"]).threshold;
  assert.ok(threshold>.39&&threshold<.44,`unexpected learned threshold ${threshold}`);
  assert.equal(learned["overall-success"].bins.reduce((sum,bin)=>sum+bin.sample,0),768);
});

test("conference standings use record, head-to-head and common opponents before model rating", () => {
  const ordered=resolveConferenceStandings([
    {team:"Alpha",conferenceWins:7,conferenceLosses:1,conferenceExpectedWins:6.5,conferenceGames:8,rating:10,results:{Beta:true,Common:true}},
    {team:"Beta",conferenceWins:7,conferenceLosses:1,conferenceExpectedWins:7,conferenceGames:8,rating:100,results:{Alpha:false,Common:true}},
    {team:"Gamma",conferenceWins:6,conferenceLosses:2,conferenceExpectedWins:7.5,conferenceGames:8,rating:200,results:{Common:true}},
  ]);
  assert.deepEqual(ordered.map((row)=>row.team),["Alpha","Beta","Gamma"]);
});

test("conference procedures use opponent conference record before the model release valve",()=>{
  const ordered=resolveConferenceStandings([
    {team:"Alpha",conferenceWins:7,conferenceLosses:1,conferenceExpectedWins:6.8,conferenceGames:8,opponentConferenceWinPct:.66,rating:10,results:{}},
    {team:"Beta",conferenceWins:7,conferenceLosses:1,conferenceExpectedWins:7.2,conferenceGames:8,opponentConferenceWinPct:.51,rating:100,results:{}},
  ],"SEC");
  assert.equal(ordered[0].team,"Alpha");
});

test("conference standings apply head-to-head before the Harper Plus fallback",()=>{
  const teams:ConferenceStandingTeam[]=[
    {team:"Alpha",conference:"Big 12",hPlusRank:80,hPlusScore:.2},
    {team:"Beta",conference:"Big 12",hPlusRank:4,hPlusScore:.9},
    {team:"Gamma",conference:"Big 12",hPlusRank:40,hPlusScore:.4},
    {team:"Delta",conference:"Big 12",hPlusRank:50,hPlusScore:.3},
    {team:"Epsilon",conference:"Big 12",hPlusRank:60,hPlusScore:.25},
  ];
  const games:ConferenceStandingGame[]=[
    {gameId:"ab",week:4,conferenceGame:true,homeTeam:"Alpha",homePoints:24,awayTeam:"Beta",awayPoints:17},
    {gameId:"ag",week:5,conferenceGame:true,homeTeam:"Gamma",homePoints:21,awayTeam:"Alpha",awayPoints:20},
    {gameId:"bd",week:5,conferenceGame:true,homeTeam:"Beta",homePoints:31,awayTeam:"Delta",awayPoints:10},
    {gameId:"ae",week:6,conferenceGame:true,homeTeam:"Alpha",homePoints:28,awayTeam:"Epsilon",awayPoints:14},
    {gameId:"be",week:6,conferenceGame:true,homeTeam:"Beta",homePoints:24,awayTeam:"Epsilon",awayPoints:10},
    {gameId:"dg",week:6,conferenceGame:true,homeTeam:"Delta",homePoints:20,awayTeam:"Gamma",awayPoints:17},
    {gameId:"eg",week:7,conferenceGame:true,homeTeam:"Epsilon",homePoints:23,awayTeam:"Gamma",awayPoints:20},
  ];
  const result=buildConferenceStandings({conference:"Big 12",season:2026,teams,games});
  const alpha=result.rows.find((row)=>row.team==="Alpha")!;
  const beta=result.rows.find((row)=>row.team==="Beta")!;
  assert.ok(alpha.rank<beta.rank);
  assert.equal(alpha.tiebreak,"Head-to-head result");
  assert.deepEqual(result.rows.filter((row)=>row.titleGamePosition).map((row)=>row.team),["Alpha","Beta"]);
});

test("2026 Pac-12 standings exclude Week 13 flex games",()=>{
  const teams:ConferenceStandingTeam[]=[
    {team:"Alpha State",conference:"Pac-12",hPlusRank:20,hPlusScore:.6},
    {team:"Beta State",conference:"Pac-12",hPlusRank:10,hPlusScore:.7},
  ];
  const games:ConferenceStandingGame[]=[
    {gameId:"round-robin",week:8,conferenceGame:true,homeTeam:"Alpha State",homePoints:28,awayTeam:"Beta State",awayPoints:21},
    {gameId:"flex",week:13,conferenceGame:true,homeTeam:"Beta State",homePoints:35,awayTeam:"Alpha State",awayPoints:14},
  ];
  const result=buildConferenceStandings({conference:"Pac-12",season:2026,teams,games});
  assert.equal(result.rules.standingsCutoffWeek,12);
  assert.equal(result.rows[0].team,"Alpha State");
  assert.equal(result.rows[0].conferenceRecord,"1–0");
  assert.equal(result.rows[0].overallRecord,"1–1");
});

test("Sun Belt standings rank East and West independently",()=>{
  const teams:ConferenceStandingTeam[]=[
    {team:"App State",conference:"Sun Belt",hPlusRank:20},
    {team:"James Madison",conference:"Sun Belt",hPlusRank:8},
    {team:"Arkansas State",conference:"Sun Belt",hPlusRank:40},
    {team:"Troy",conference:"Sun Belt",hPlusRank:25},
  ];
  const games:ConferenceStandingGame[]=[
    {gameId:"east",week:6,conferenceGame:true,homeTeam:"James Madison",homePoints:27,awayTeam:"App State",awayPoints:17},
    {gameId:"west",week:6,conferenceGame:true,homeTeam:"Troy",homePoints:24,awayTeam:"Arkansas State",awayPoints:20},
  ];
  const result=buildConferenceStandings({conference:"Sun Belt",season:2026,teams,games});
  assert.equal(conferenceDivision("Sun Belt","Louisiana Tech",2026),"West");
  assert.equal(conferenceRuleProfile("Sun Belt",2026).usesDivisions,true);
  assert.deepEqual(result.rows.filter((row)=>row.titleGamePosition).map((row)=>row.team),["James Madison","Troy"]);
  assert.equal(result.rows.find((row)=>row.team==="James Madison")?.divisionRank,1);
  assert.equal(result.rows.find((row)=>row.team==="Troy")?.divisionRank,1);
});

test("an elite conference-title loser remains above a comparable regular-season loser",()=>{
  const profiles=[profile("Title Loser","Test",1.08),profile("Title Winner","Test",1.08),profile("Regular Loser","Other",1.08)];
  const games=[
    ...opponentWins("Title Loser",10,"title-loser"),
    ...opponentWins("Title Winner",9,"title-winner"),
    ...opponentWins("Regular Loser",10,"regular-loser"),
    rankingGame("regular-loss",12,"Weak Filler",17,"Regular Loser",14),
    {...rankingGame("conference-title",15,"Title Winner",24,"Title Loser",21),conferenceChampionship:true},
  ];
  const rankings=buildBcsRankings(games,profiles);
  assert.ok(rankings.find((row)=>row.team==="Title Loser")!.rank<rankings.find((row)=>row.team==="Regular Loser")!.rank);
});

test("historical 12-team seasons ignore the actual bracket and seed by Season Sim rank", () => {
  const teams = ["Oregon", "Georgia", "Boise State", "Arizona State", "Texas", "Penn State", "Notre Dame", "Ohio State", "Tennessee", "Indiana", "SMU", "Clemson"];
  const profiles = [profile("Model No. 1","Independent",1.5),...teams.map((team, index) => profile(team,"Independent",1.2-index*.025))];
  const simulation = buildSeasonSimulation(2024, 8, 8, [], profiles);
  const outsider=simulation.rankings.find((row)=>row.team==="Model No. 1")!;

  assert.equal(simulation.fieldMode,"projected-field");
  assert.equal(outsider.playoffSeed,outsider.rank,"a team outside the real bracket enters at its Season Sim rank");
  assert.ok(simulation.rankings.slice(0,12).every((row)=>row.playoffSeed===row.rank));
  assert.ok(simulation.rankings.slice(12).every((row)=>row.playoffSeed===null));
  assert.equal(simulation.bracket.length, 11);
  assert.match(simulation.methodology,/no real-life bracket placement/);
});

test("four-team seasons also seed directly from the Season Sim ranking", () => {
  for(const season of [2014,2020]){
    const historicalTeams=season===2014?["Alabama","Oregon","Florida State","Ohio State"]:["Alabama","Clemson","Ohio State","Notre Dame"];
    const profiles=[profile("Model No. 1","Independent",1.5),...historicalTeams.map((team,index)=>profile(team,"Independent",1.15-index*.03))];
    const simulation=buildSeasonSimulation(season,12,12,[],profiles);
    const outsider=simulation.rankings.find((row)=>row.team==="Model No. 1")!;
    assert.equal(simulation.fieldMode,"projected-field");
    assert.equal(simulation.format,4);
    assert.equal(outsider.playoffSeed,outsider.rank,"a team outside the real bracket enters at its Season Sim rank");
    assert.ok(simulation.rankings.slice(0,4).every((row)=>row.playoffSeed===row.rank));
    assert.ok(simulation.rankings.slice(4).every((row)=>row.playoffSeed===null));
    assert.equal(simulation.bracket.length,3);
  }
});

test("every displayed Team Stats column sorts in both directions without mutating source rows", () => {
  const rows:TeamStatsSortableRow[] = [
    { team:"Alpha", gamesPlayed:1, offYpp:4, offYpa:5, offYpc:3, offPatt:20, offRatt:25, defYppIndex:.7, defYpaIndex:.8, defYpcIndex:.9 },
    { team:"Beta", gamesPlayed:2, offYpp:5, offYpa:6, offYpc:4, offPatt:30, offRatt:35, defYppIndex:1, defYpaIndex:1.1, defYpcIndex:1.2 },
    { team:"Gamma", gamesPlayed:3, offYpp:6, offYpa:7, offYpc:5, offPatt:40, offRatt:45, defYppIndex:1.3, defYpaIndex:1.4, defYpcIndex:1.5 },
  ];
  const sourceOrder = rows.map((row) => row.team);

  for (const column of TEAM_STATS_SORT_COLUMNS) {
    assert.deepEqual(sortTeamStatsRows(rows, column.key, "asc").map((row) => row.team), ["Alpha", "Beta", "Gamma"], `${column.label} ascending`);
    assert.deepEqual(sortTeamStatsRows(rows, column.key, "desc").map((row) => row.team), ["Gamma", "Beta", "Alpha"], `${column.label} descending`);
  }

  assert.deepEqual(rows.map((row) => row.team), sourceOrder);
});

test("Team Stats defaults to best-first sorting for production and opponent allowances", () => {
  assert.equal(defaultTeamStatsSortDirection("team"), "asc");
  assert.equal(defaultTeamStatsSortDirection("offYpp"), "desc");
  assert.equal(defaultTeamStatsSortDirection("offPatt"), "desc");
  assert.equal(defaultTeamStatsSortDirection("defYppIndex"), "asc");
  assert.equal(defaultTeamStatsSortDirection("defYpcIndex"), "asc");
});

test("Team Stats exposes every advanced metric in raw and adjusted offense and defense views", () => {
  assert.deepEqual(
    [...new Set(TEAM_STATS_ADVANCED_METRICS.map((metric) => metric.key))].sort(),
    [...advancedMetricKeys].sort(),
  );
  const base = { gamesPlayed:8, offYpp:6, offYpa:8, offYpc:5, offPatt:30, offRatt:36, defYppIndex:.9, defYpaIndex:.92, defYpcIndex:.88 };
  const rows:TeamStatsSortableRow[] = [
    { team:"Alpha", ...base, advancedProfile:advancedProfile({ pointsPerGame:.9 }, { pointsPerGame:1.2 }) },
    { team:"Beta", ...base, advancedProfile:advancedProfile({ pointsPerGame:1.1 }, { pointsPerGame:.8 }) },
  ];
  const offenseColumns = teamStatsColumns("overall", "offense-index");
  const defenseColumns = teamStatsColumns("overall", "defense-index");
  const offensePoints = offenseColumns.find((column) => column.key === "advanced:offense-index:pointsPerGame");
  const defensePoints = defenseColumns.find((column) => column.key === "advanced:defense-index:pointsPerGame");
  assert.ok(offensePoints);
  assert.ok(defensePoints);
  assert.equal(formatTeamStatsValue(rows[1], offensePoints), "110%");
  assert.deepEqual(sortTeamStatsRows(rows, offensePoints.key, "desc").map((row) => row.team), ["Beta", "Alpha"]);
  assert.deepEqual(sortTeamStatsRows(rows, defensePoints.key, "asc").map((row) => row.team), ["Beta", "Alpha"]);
  assert.equal(defaultTeamStatsSortDirection(offensePoints.key), "desc");
  assert.equal(defaultTeamStatsSortDirection(defensePoints.key), "asc");
});

test("Player Stats changes columns by position and sorts every metric plus conference", () => {
  const quarterbackColumns=playerStatsColumns("QB");
  const edgeColumns=playerStatsColumns("EDGE");
  const kickerColumns=playerStatsColumns("K");
  assert.ok(quarterbackColumns.some((column)=>column.key==="passPpa"));
  assert.ok(quarterbackColumns.some((column)=>column.key==="passingSuccessRate"));
  assert.ok(edgeColumns.some((column)=>column.key==="sacks"));
  assert.ok(edgeColumns.some((column)=>column.key==="pressures"));
  assert.ok(kickerColumns.some((column)=>column.key==="fieldGoalRate"));
  assert.ok(!edgeColumns.some((column)=>column.key==="passYards"));
  assert.equal(playerStatsDefaultSortKey("QB"),"passYards");
  assert.equal(playerStatsDefaultSortKey("EDGE"),"sacks");
  assert.equal(defaultPlayerStatsSortDirection("conference","QB"),"asc");

  const rows:PlayerStatsSortableRow[]=[
    {name:"Charlie QB",team:"Gamma",conference:"SEC",metrics:{passYards:2400,passPpa:.18}},
    {name:"Alpha QB",team:"Alpha",conference:"ACC",metrics:{passYards:3200,passPpa:.31}},
    {name:"Beta QB",team:"Beta",conference:"Big Ten",metrics:{passYards:2800,passPpa:null}},
  ];
  assert.deepEqual(sortPlayerStatsRows(rows,"conference","asc").map((row)=>row.team),["Alpha","Beta","Gamma"]);
  assert.deepEqual(sortPlayerStatsRows(rows,"passYards","desc").map((row)=>row.team),["Alpha","Beta","Gamma"]);
  assert.deepEqual(sortPlayerStatsRows(rows,"passPpa","desc").map((row)=>row.team),["Alpha","Gamma","Beta"]);
  assert.deepEqual([...playerStatsOrdinalRanks(rows,"passYards","desc",(row)=>row.team).entries()],[
    ["Alpha",1],["Beta",2],["Gamma",3],
  ]);
  assert.equal(historicalProductionRank(.8,[{score:.9,count:2},{score:.8,count:3},{score:.7,count:4}]),3);
  assert.equal(historicalProductionRank(null,[{score:.9,count:2}]),null);
  assert.equal(historicalProductionRank(.8,[]),null);
  const passPpa=quarterbackColumns.find((column)=>column.key==="passPpa");
  assert.ok(passPpa);
  assert.equal(formatPlayerStatsValue(rows[0],passPpa),"0.180");
});

test("game-card unit jerseys stay deterministic and position-appropriate", () => {
  const offensiveLineNumber=offensiveLineJerseyNumber("Alabama");
  const defensiveTackleNumber=defensiveTackleUnitJerseyNumber("Alabama");
  assert.equal(offensiveLineJerseyNumber("Alabama"),offensiveLineNumber);
  assert.equal(defensiveTackleUnitJerseyNumber("Alabama"),defensiveTackleNumber);
  assert.ok(offensiveLineNumber>=50&&offensiveLineNumber<=79);
  assert.ok(defensiveTackleNumber>=90&&defensiveTackleNumber<=99);
});

test("Player Stats applies a documented workload qualifier to every selectable statistic", () => {
  for(const position of PLAYER_STATS_POSITIONS){
    for(const column of playerStatsMetricColumns(position)){
      const rule=playerStatsQualification(position,column.key);
      assert.ok(rule.minimum>0,`${position} ${column.key} needs a positive minimum`);
      assert.ok(rule.sampleKeys.length>0,`${position} ${column.key} needs a sample source`);
      assert.notEqual(rule.label,"At least one recorded result",`${position} ${column.key} needs an explicit rule`);
    }
  }

  const oneThrow:PlayerStatsSortableRow={name:"One Throw",team:"Reserve",conference:"SEC",metrics:{passAttempts:1,passPpa:2.4}};
  const fullSeasonPasser:PlayerStatsSortableRow={name:"Full Season",team:"Starter",conference:"SEC",metrics:{passAttempts:320,passPpa:.41}};
  assert.equal(playerQualifiesForStat(oneThrow,"QB","passPpa"),false);
  assert.equal(playerQualifiesForStat(fullSeasonPasser,"QB","passPpa"),true);
  assert.equal(playerStatsQualification("QB","passPpa").label,"100+ pass attempts");

  const oneCarry:PlayerStatsSortableRow={name:"One Carry",team:"Reserve",conference:"ACC",metrics:{rushAttempts:1,yardsPerCarry:80}};
  const featureBack:PlayerStatsSortableRow={name:"Feature Back",team:"Starter",conference:"ACC",metrics:{rushAttempts:160,yardsPerCarry:5.8}};
  assert.equal(playerQualifiesForStat(oneCarry,"RB","yardsPerCarry"),false);
  assert.equal(playerQualifiesForStat(featureBack,"RB","yardsPerCarry"),true);

  const perfectSmallKicker:PlayerStatsSortableRow={name:"Small Kicker",team:"Reserve",conference:"Big 12",metrics:{fieldGoalsAttempted:1,fieldGoalRate:1}};
  const qualifiedKicker:PlayerStatsSortableRow={name:"Qualified Kicker",team:"Starter",conference:"Big 12",metrics:{fieldGoalsAttempted:12,fieldGoalRate:.917}};
  assert.equal(playerQualifiesForStat(perfectSmallKicker,"K","fieldGoalRate"),false);
  assert.equal(playerQualifiesForStat(qualifiedKicker,"K","fieldGoalRate"),true);

  const onePlayDefender:PlayerStatsSortableRow={name:"One Play",team:"Reserve",conference:"Big Ten",metrics:{tackles:1,tfl:1,sacks:1,qbHurries:0,passesDefended:0,defensiveInterceptions:0,fumbleRecoveries:0}};
  const rotationDefender:PlayerStatsSortableRow={name:"Rotation",team:"Starter",conference:"Big Ten",metrics:{tackles:18,tfl:4,sacks:3,qbHurries:5,passesDefended:0,defensiveInterceptions:0,fumbleRecoveries:0}};
  assert.equal(playerQualifiesForStat(onePlayDefender,"EDGE","sacks"),false);
  assert.equal(playerQualifiesForStat(rotationDefender,"EDGE","sacks"),true);
});

test("player scatterplots exclude low-participation backups before transfer and rendering",()=>{
  const backupQuarterback:PlayerStatsSortableRow={name:"Backup",team:"Reserve",conference:"SEC",metrics:{passAttempts:42,passYards:510,passPpa:.7}};
  const startingQuarterback:PlayerStatsSortableRow={name:"Starter",team:"Starter",conference:"SEC",metrics:{passAttempts:260,passYards:2400,passPpa:.24}};
  const reserveReceiver:PlayerStatsSortableRow={name:"Reserve WR",team:"Reserve",conference:"ACC",metrics:{receptions:8,receivingYards:220}};
  const rotationReceiver:PlayerStatsSortableRow={name:"Rotation WR",team:"Starter",conference:"ACC",metrics:{receptions:28,receivingYards:510}};
  assert.equal(playerMeetsScatterParticipationThreshold(backupQuarterback,"QB"),false);
  assert.equal(playerMeetsScatterParticipationThreshold(startingQuarterback,"QB"),true);
  assert.equal(playerMeetsScatterParticipationThreshold(reserveReceiver,"WR"),false);
  assert.equal(playerMeetsScatterParticipationThreshold(rotationReceiver,"WR"),true);
});

test("weekly player progression preserves box-score identities and advanced game values",()=>{
  const payload=[{id:401,teams:[
    {team:"Alabama",categories:[
      {name:"passing",types:[
        {name:"C/ATT",athletes:[{id:"7",name:"Jalen Milroe",stat:"18/24"}]},
        {name:"YDS",athletes:[{id:"7",name:"Jalen Milroe",stat:"245"}]},
        {name:"TD",athletes:[{id:"7",name:"Jalen Milroe",stat:"2"}]},
      ]},
      {name:"rushing",types:[
        {name:"CAR",athletes:[{id:"7",name:"Jalen Milroe",stat:"12"}]},
        {name:"YDS",athletes:[{id:"7",name:"Jalen Milroe",stat:"68"}]},
      ]},
    ]},
    {team:"Georgia",categories:[]},
  ]}];
  const [box]=playerWeeklyBoxGames(payload,"Alabama","7","Jalen Milroe");
  const [ppa]=playerWeeklyPpaGames([{week:4,id:"7",name:"Jalen Milroe",opponent:"Georgia",averagePPA:{pass:.34,rush:.21}}],"7","Jalen Milroe");
  const [success]=playerWeeklySuccessGames([{week:4,id:"7",name:"Jalen Milroe",opponent:"Georgia",passing:{successRate:.52},rushing:{successRate:.46}}],"7","Jalen Milroe");

  assert.equal(box.gameId,"401");
  assert.equal(box.opponent,"Georgia");
  assert.equal(box.metrics.passCompletions,18);
  assert.equal(box.metrics.passAttempts,24);
  assert.equal(box.metrics.completionRate,.75);
  assert.equal(box.metrics.yardsPerAttempt,245/24);
  assert.equal(box.metrics.rushYards,68);
  assert.equal(ppa.metrics.passPpa,.34);
  assert.equal(success.metrics.passingSuccessRate,.52);
});

test("game player boxes expose every contributor and recompute season-to-date rates",()=>{
  const game=(id:number,completions:number,attempts:number,yards:number)=>({id,teams:[
    {team:"Test U",categories:[{name:"passing",types:[
      {name:"C/ATT",athletes:[{id:"12",name:"Alex Quarterback",stat:`${completions}/${attempts}`}]},
      {name:"YDS",athletes:[{id:"12",name:"Alex Quarterback",stat:String(yards)}]},
      {name:"TD",athletes:[{id:"12",name:"Alex Quarterback",stat:"2"}]},
    ]}]},
    {team:"Opponent",categories:[]},
  ]});
  const lines=playerGameBoxLines([game(1,18,30,240),game(2,22,25,310)],"Test U");
  const [season]=aggregatePlayerGameLines(lines);
  assert.equal(lines.length,2);
  assert.equal(season.playerName,"Alex Quarterback");
  assert.equal(season.metrics.passCompletions,40);
  assert.equal(season.metrics.passAttempts,55);
  assert.equal(season.metrics.passYards,550);
  assert.equal(season.metrics.passTd,4);
  assert.equal(season.metrics.completionRate,40/55);
  assert.equal(season.metrics.yardsPerAttempt,10);
});

test("weekly player progression remains chronological when postseason week numbers reset",()=>{
  const games=[
    {gameId:"playoff-2",week:2,seasonType:"postseason",date:"2026-01-01T17:00:00Z"},
    {gameId:"regular-13",week:13,seasonType:"regular",date:"2025-11-29T20:00:00Z"},
    {gameId:"playoff-1",week:1,seasonType:"postseason",date:"2025-12-20T17:00:00Z"},
  ];
  assert.deepEqual([...games].sort(comparePlayerWeeklyGames).map((game)=>game.gameId),[
    "regular-13","playoff-1","playoff-2",
  ]);
});

test("historical archive begins with the inaugural CFP season", () => {
  assert.equal(FIRST_HISTORICAL_SEASON, 2014);
});

test("Schedule pick filters show only qualified ATS or O/U test decisions and exclude quarantined lines", () => {
  const rows:ScheduleFilterRow[] = [
    { gameId:"ats",week:5,spreadQualified:true,totalDiagnosticQualified:false },
    { gameId:"total",week:6,spreadQualified:false,totalDiagnosticQualified:true },
    { gameId:"both",week:7,spreadQualified:true,totalDiagnosticQualified:true },
    { gameId:"pass",week:8,spreadQualified:false,totalDiagnosticQualified:false },
    { gameId:"quarantined",week:9,lineQuality:"quarantined",spreadQualified:true,totalDiagnosticQualified:true },
  ];

  assert.deepEqual(rows.filter((row)=>matchesSchedulePickFilter(row,"ats")).map((row)=>row.gameId),["ats","both"]);
  assert.deepEqual(rows.filter((row)=>matchesSchedulePickFilter(row,"total")).map((row)=>row.gameId),["total","both"]);
  assert.deepEqual(rows.filter((row)=>matchesSchedulePickFilter(row,"any")).map((row)=>row.gameId),["ats","total","both"]);
  assert.equal(rows.filter((row)=>matchesSchedulePickFilter(row,"all")).length,rows.length);
});

test("Schedule week sorting keeps bowl week numbers after the regular season and dates within each week", () => {
  const rows:ScheduleFilterRow[] = [
    { gameId:"bowl-week-1",week:1,seasonType:"postseason",startDate:"2026-12-20T00:00:00Z" },
    { gameId:"week-10",week:10,seasonType:"regular",startDate:"2026-11-01T00:00:00Z" },
    { gameId:"week-2-late",week:2,seasonType:"regular",startDate:"2026-09-12T00:00:00Z" },
    { gameId:"week-2-early",week:2,seasonType:"regular",startDate:"2026-09-10T00:00:00Z" },
  ];

  assert.deepEqual([...rows].sort((a,b)=>compareScheduleRows(a,b,"week")).map((row)=>row.gameId),[
    "week-2-early","week-2-late","week-10","bowl-week-1",
  ]);
  assert.deepEqual([...rows].sort((a,b)=>compareScheduleRows(a,b,"date")).map((row)=>row.gameId),[
    "week-2-early","week-2-late","week-10","bowl-week-1",
  ]);
});

test("schedule cards distinguish title week, bowls, and every CFP round",()=>{
  assert.equal(scheduleGameLabel({season:2025,week:15,seasonType:"regular",homeTeam:"Indiana",awayTeam:"Ohio State"}),"CC");
  assert.equal(scheduleGameLabel({season:2025,week:15,seasonType:"regular",homeTeam:"Army",awayTeam:"Navy"}),"W15");
  assert.equal(scheduleGameLabel({season:2025,week:1,seasonType:"postseason",startDate:"2025-12-19T20:00:00Z",homeTeam:"Oregon",awayTeam:"Tulane"}),"CFP R1");
  assert.equal(scheduleGameLabel({season:2025,week:2,seasonType:"postseason",startDate:"2026-01-01T20:00:00Z",homeTeam:"Indiana",awayTeam:"Oklahoma"}),"CFP QF");
  assert.equal(scheduleGameLabel({season:2025,week:3,seasonType:"postseason",startDate:"2026-01-09T20:00:00Z",homeTeam:"Indiana",awayTeam:"Oregon"}),"CFP SF");
  assert.equal(scheduleGameLabel({season:2025,week:4,seasonType:"postseason",startDate:"2026-01-19T20:00:00Z",homeTeam:"Indiana",awayTeam:"Ohio State"}),"CFP NC");
  assert.equal(scheduleGameLabel({season:2023,week:1,seasonType:"postseason",startDate:"2024-01-01T20:00:00Z",homeTeam:"Michigan",awayTeam:"Alabama"}),"CFP SF");
  assert.equal(scheduleGameLabel({season:2023,week:2,seasonType:"postseason",startDate:"2024-01-08T20:00:00Z",homeTeam:"Michigan",awayTeam:"Washington"}),"CFP NC");
  assert.equal(scheduleGameLabel({season:2025,week:1,seasonType:"postseason",startDate:"2025-12-27T20:00:00Z",homeTeam:"Iowa",awayTeam:"Texas"}),"BOWL");
});

test("user-supplied logos cover every modeled team and supplied FCS identities",()=>{
  assert.equal(Object.keys(teamLogoAssets).length,138);
  assert.equal(resolveTeamLogoAsset("Alabama"),"/team-logos/alabama.webp");
  assert.equal(resolveTeamLogoAsset("Alabama","helmet"),"/team-logos/alabama-helmet.webp");
  assert.equal(resolveTeamLogoAsset("San Jose State"),"/team-logos/san-jose-state.webp");
  assert.equal(resolveTeamLogoAsset("2025 Pitt"),"/team-logos/pittsburgh.webp");
  assert.equal(resolveTeamLogoAsset("Southern Miss","helmet"),"/team-logos/southern-miss.webp");
  assert.equal(resolveTeamLogoAsset("Missouri State"),"/team-logos/missouri-state.webp");
  assert.equal(resolveTeamLogoAsset("North Dakota St."),"/team-logos/north-dakota-state.webp");
  assert.equal(resolveTeamLogoAsset("Sacramento St","helmet"),"/team-logos/sacramento-state.webp");
  assert.equal(resolveTeamLogoAsset("2019 Iowa"),"/team-logos/michigan.webp");
  assert.equal(resolveTeamLogoAsset("2023 Michigan"),"/team-logos/iowa.webp");
  assert.equal(resolveTeamLogoAsset("Cincinnati"),"/team-logos/tcu.webp");
  assert.equal(resolveTeamLogoAsset("Colorado"),"/team-logos/cincinnati.webp");
  assert.equal(resolveTeamLogoAsset("Arizona State"),"/team-logos/iowa-state.webp");
  assert.equal(resolveTeamLogoAsset("Houston"),"/team-logos/colorado.webp");
  assert.equal(resolveTeamLogoAsset("Iowa State"),"/team-logos/houston.webp");
  assert.equal(resolveTeamLogoAsset("Kansas State"),"/team-logos/texas-tech.webp");
  assert.equal(resolveTeamLogoAsset("TCU"),"/team-logos/kansas-state.webp");
  assert.equal(resolveTeamLogoAsset("Texas Tech"),"/team-logos/utah.webp");
  assert.equal(resolveTeamLogoAsset("Utah"),"/team-logos/arizona-state.webp");
  assert.equal(resolveTeamLogoAsset("Arizona","helmet"),"/team-logos/oklahoma-state-helmet.webp");
  assert.equal(resolveTeamLogoAsset("UCF","helmet"),"/team-logos/arizona-helmet.webp");
  assert.equal(resolveTeamLogoAsset("Oklahoma State","helmet"),"/team-logos/ucf-helmet.webp");
  assert.deepEqual(driveLogoCoverage.missingPrimary,[]);
  assert.deepEqual(driveLogoCoverage.missingHelmet,["Missouri State","North Dakota State","Sacramento State","San José State","Southern Miss","UTSA"]);
});

test("Schedule accuracy cards recalculate from only the supplied filtered games", () => {
  const rows = [
    { scope:"Alabama",week:5,seasonType:"regular",lineQuality:"verified",vegasSpread:-3,vegasTotal:52,spreadResult:"W",totalDiagnosticResult:"W",spreadError:4,totalError:6 },
    { scope:"Other",week:5,seasonType:"regular",lineQuality:"verified",vegasSpread:-7,vegasTotal:48,spreadResult:"L",totalDiagnosticResult:"L",spreadError:10,totalError:8 },
    { scope:"Alabama",week:4,seasonType:"regular",lineQuality:"verified",vegasSpread:-2,vegasTotal:55,spreadResult:"L",totalDiagnosticResult:"L",spreadError:20,totalError:20 },
    { scope:"Alabama",week:6,seasonType:"regular",lineQuality:"quarantined",vegasSpread:-4,vegasTotal:49,spreadResult:"L",totalDiagnosticResult:"L",spreadError:12,totalError:11 },
  ];
  const full = calculateScheduleFilterMetrics(rows);
  const alabama = calculateScheduleFilterMetrics(rows.filter((row)=>row.scope==="Alabama"));

  assert.equal(full.spread.accuracy,.5);
  assert.equal(full.total.accuracy,.5);
  assert.equal(alabama.spread.accuracy,1);
  assert.equal(alabama.total.accuracy,1);
  assert.equal(alabama.spread.sampleSize,1);
  assert.equal(alabama.total.sampleSize,1);
  assert.equal(alabama.spread.meanAbsoluteError,4);
  assert.equal(alabama.total.meanAbsoluteError,6);
  assert.equal(alabama.spread.quarantined,1);
});

test("Schedule records use actual finals and the chronological Matchup Engine path for future games", () => {
  const games:ScheduleRecordGame[] = [
    { gameId:"week-1",week:1,startDate:"2026-09-01T00:00:00Z",seasonType:"regular",completed:true,homeTeam:"Alabama",homePoints:31,awayTeam:"Florida State",awayPoints:20 },
    { gameId:"week-2",week:2,startDate:"2026-09-08T00:00:00Z",seasonType:"regular",completed:false,homeTeam:"Vanderbilt",homePoints:null,awayTeam:"Alabama",awayPoints:null,predictedHomeScore:20,predictedAwayScore:27,homeWinProbability:.31 },
    { gameId:"week-3",week:3,startDate:"2026-09-15T00:00:00Z",seasonType:"regular",completed:false,homeTeam:"Alabama",homePoints:null,awayTeam:"Georgia",awayPoints:null,predictedHomeScore:24,predictedAwayScore:28,homeWinProbability:.39 },
  ];
  const timeline = buildScheduleRecordTimeline(games,new Set(["Alabama","Florida State","Vanderbilt","Georgia"]));

  assert.deepEqual(timeline.get("week-1"),{homeRecordAfter:"1–0",awayRecordAfter:"0–1",recordStatus:"actual"});
  assert.deepEqual(timeline.get("week-2"),{homeRecordAfter:"0–1",awayRecordAfter:"2–0",recordStatus:"projected"});
  assert.deepEqual(timeline.get("week-3"),{homeRecordAfter:"2–1",awayRecordAfter:"1–0",recordStatus:"projected"});
});

test("team identity converts volume and efficiency into football language", () => {
  const option=deriveTeamIdentity(intelligenceProfile("Option U",2025,{offPattIndex:.65,offRattIndex:1.28,offYpcIndex:1.12}));
  const vertical=deriveTeamIdentity(intelligenceProfile("Air U",2025,{
    offPattIndex:1.36,offRattIndex:.75,offYpaIndex:1.19,
    advancedProfile:advancedProfile({passingSuccessRate:1.05,passingExplosiveness:1.24},{passingSuccessRate:1,passingExplosiveness:1}),
  }));

  assert.equal(option.offense.label,"OPTION");
  assert.equal(vertical.offense.label,"VERTICAL PASSING");
  assert.match(option.offense.detail,/assignment discipline/i);
});

test("derived matchup cards expose the football reason behind an advantage", () => {
  const offense=intelligenceProfile("Run U",2025,{
    offYpcIndex:1.18,offRattIndex:1.15,
    advancedProfile:advancedProfile({rushingSuccessRate:1.2,lineYards:1.18,secondLevelYards:1.12,openFieldYards:1.1},{rushingSuccessRate:1,lineYards:1}),
  });
  const defense=intelligenceProfile("Defense U");
  const homeProjection=projectAdvancedSide(offense.advancedProfile,defense.advancedProfile,5.1,7.3,4.4,7.3)!;
  const awayProjection=projectAdvancedSide(defense.advancedProfile,offense.advancedProfile,4.4,7.3,4.4,7.3)!;
  const board=deriveMatchupIntelligence({
    homeTeam:offense.team,awayTeam:defense.team,homeProjection,awayProjection,homeProfile:offense,awayProfile:defense,
  });
  const run=board.homeCards.find((card)=>card.id==="run");

  assert.ok(run);
  assert.ok(run.score>50);
  assert.equal(run.edgeSide,"OFFENSE");
  assert.equal(run.edgeTeam,"Run U");
  assert.match(run.drivers.join(" "),/rush success|line yards/i);
});

test("historical DNA favors the statistically closest team-season", () => {
  const current=intelligenceProfile("Current",2026,{offYppIndex:1.18,offYpaIndex:1.22,defYppIndex:.82});
  const close=intelligenceProfile("Close",2019,{offYppIndex:1.17,offYpaIndex:1.21,defYppIndex:.83});
  const distant=intelligenceProfile("Distant",2018,{offYppIndex:.78,offYpaIndex:.75,offYpcIndex:.82,defYppIndex:1.22});
  const comparisons=findHistoricalComparisons(current,[distant,close]);

  assert.equal(comparisons[0]?.team,"Close");
  assert.ok((comparisons[0]?.similarity??0)>(comparisons[1]?.similarity??0));
});

test("volatility, movement and roster continuity remain bounded and explainable", () => {
  const previous=intelligenceProfile("Test U",2025,{week:8,offYpaIndex:.96,offYpcIndex:1.01,defYppIndex:1.04});
  const current=intelligenceProfile("Test U",2025,{
    week:9,offYpaIndex:1.08,offYpcIndex:1.04,defYppIndex:.96,returningPpa:.72,returningUsage:.68,recruitingRank:8,
  });
  const movement=deriveTeamMovement(current,previous);
  const stability=deriveTeamStability(current,[previous,current]);
  const roster=deriveRosterStability(current);

  assert.ok((movement.change??0)>0);
  assert.ok(movement.components.some((component)=>component.label==="PASSING"&&component.change>0));
  assert.ok(stability.volatility>=0&&stability.volatility<=100);
  assert.ok(stability.consistency>=0&&stability.consistency<=100);
  assert.ok(roster.score>=0&&roster.score<=100);
  assert.match(movement.explanations.join(" "),/Passing|Defense/i);
});

test("D1 archive batches stay below the encoded JSON target without losing row order", () => {
  const rows = Array.from({ length: 27 }, (_, index) => ({ index, payload:"x".repeat(40_000) }));
  const batches = jsonRowBatches(rows, 600, 200_000);
  const encoder = new TextEncoder();

  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().map((row) => row.index), rows.map((row) => row.index));
  for (const batch of batches) assert.ok(encoder.encode(JSON.stringify(batch)).byteLength <= 200_000);
});

test("D1 archive writes recover from SQLITE_TOOBIG by recursively splitting an atomic batch", async () => {
  const stored:number[] = [];
  const encoder = new TextEncoder();
  const db = {
    prepare: () => ({
      bind: (payload:string) => ({
        run: async () => {
          if (encoder.encode(payload).byteLength > 1_500) throw new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG");
          stored.push(...(JSON.parse(payload) as Array<{ index:number }>).map((row) => row.index));
        },
      }),
    }),
  };
  const rows = Array.from({ length: 12 }, (_, index) => ({ index, payload:"x".repeat(350) }));

  await upsertJsonRows(db as unknown as D1Database, "INSERT TEST", rows);
  assert.deepEqual(stored, rows.map((row) => row.index));
});

test("H+ Win Conditions share one calibrated baseline while keeping paths, fragility and scenarios distinct",()=>{
  const matchupAdvanced=(power:number)=>{
    const value=advancedProfile({},{});
    const baselines:Partial<Record<keyof AdvancedMetricValues,number>>={
      successRate:.42,passingExplosiveness:1.22,rushingExplosiveness:1.05,havocRate:.15,pointsPerDrive:2.35,turnoverMargin:0,
    };
    for(const [key,baseline] of Object.entries(baselines) as Array<[keyof AdvancedMetricValues,number]>) {
      value.baseline[key]=baseline;
      value.offense.index[key]=key==="havocRate"?2-power:power;
      value.defense.index[key]=key==="havocRate"?power:2-power;
      value.offense.raw[key]=baseline*Number(value.offense.index[key]);
      value.defense.raw[key]=baseline*Number(value.defense.index[key]);
    }
    return value;
  };
  const projection=projectMatchupEngine(
    {team:"Home Tech",offense:[1.1,1.12,1.05,1.02,.98],defense:[.92,.9,.96,1,1],advanced:matchupAdvanced(1.08),outcomeRating:1615,evidence:{gamesPlayed:8,scheduleStrength:.67,bestOpponentStrength:.72,qualityWinStrength:.66,reliability:.9}},
    {team:"Away State",offense:[1.01,1.06,.96,1.04,.97],defense:[1.02,1,.99,1,1],advanced:matchupAdvanced(1.01),outcomeRating:1535,evidence:{gamesPlayed:8,scheduleStrength:.61,bestOpponentStrength:.66,qualityWinStrength:.58,reliability:.88}},
    false,
  );
  const samples=(side:"home"|"away"):WinConditionHistoricalSample[]=>Array.from({length:24},(_,index)=>{
    const wave=[-1.35,-1.05,-.8,-.55,-.3,-.1,.1,.3,.55,.8,1.05,1.35][index%12];
    const direction=side==="home"?1:.92;
    const turnover=[-2,-1,0,0,1,1,2,0,-1,1,0,2][index%12];
    const points=Math.round(27+direction*5.5*wave+2.1*turnover);
    const opponentPoints=Math.round(25-direction*2.2*wave-1.3*turnover);
    return {gameId:`${side}-${index}`,season:index<12?2024:2025,week:index%12+1,
      successRate:.42+direction*.035*wave,yardsPerPass:7.25+direction*.85*wave,yardsPerRush:4.55+direction*.5*wave,
      passingExplosiveness:1.2+direction*.18*wave,rushingExplosiveness:1.02+direction*.14*wave,havocAllowed:.15-direction*.018*wave,
      havocCreated:.15+direction*.02*wave,pointsPerDrive:2.35+direction*.34*wave+.08*turnover,possessions:11.8+.65*wave,
      turnoverMargin:side==="home"?turnover:-turnover,points,opponentPoints};
  });
  const analysis=buildWinConditionAnalysis({homeTeam:"Home Tech",awayTeam:"Away State",homeWeek:8,awayWeek:8,neutralSite:false,projection,
    homeSamples:samples("home"),awaySamples:samples("away"),simulationCount:1200,seed:"win-condition-test"});

  assert.equal(analysis.dataQuality,"full");
  assert.ok(analysis.home.conditions.length>=4&&analysis.home.conditions.length<=6);
  assert.ok(analysis.away.conditions.length>=4&&analysis.away.conditions.length<=6);
  assert.ok(analysis.clusters.length>=3);
  assert.ok(analysis.clusters.reduce((sum,row)=>sum+row.occurrenceProbability,0)>.95);
  assert.ok(analysis.home.pathWidth!==null&&analysis.home.pathWidth>=0&&analysis.home.pathWidth<=100);
  assert.ok(analysis.home.fragility!==null&&analysis.home.fragility>=0&&analysis.home.fragility<=100);
  assert.notEqual(analysis.home.pathWidth,Math.round(analysis.home.winProbability*100));
  assert.notEqual(analysis.home.fragility,100-analysis.home.pathWidth!);
  assert.ok(analysis.easiestUpsetPath&&analysis.easiestUpsetPath.scenarioWinProbability>.5);

  const reset=evaluateWinConditionScenario(analysis,{});
  assert.ok(Math.abs(reset.homeScore-analysis.baseline.homeScore)<1e-9);
  assert.ok(Math.abs(reset.awayScore-analysis.baseline.awayScore)<1e-9);
  assert.ok(Math.abs(reset.homeWinProbability-analysis.baseline.homeWinProbability)<1e-9);
  const scoring=analysis.variables.find((variable)=>variable.key==="home:pointsPerDrive")!;
  const favorable=evaluateWinConditionScenario(analysis,{[scoring.key]:Math.min(scoring.maximum,scoring.baseline+scoring.standardDeviation)});
  assert.ok(favorable.homeScore>reset.homeScore);
  assert.ok(favorable.homeWinProbability>reset.homeWinProbability);
});
