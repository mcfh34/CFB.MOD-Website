"use client";
/* eslint-disable @next/next/no-img-element -- team logos are dynamic remote assets supplied by the season feed */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppShell, navigation, type Section } from "./components/AppShell";
import {
  baselines,
  modelCalibration,
  modelSnapshot,
  teams,
  top25,
  workbookTabs,
  type TeamModel,
  type WeekProfile,
} from "./modelData";
import type { MatchupEdgeAnalysis } from "../lib/matchupAnalysis";
import { matchupScoreCard, projectMatchupEngine } from "../lib/matchupEngine";
import { projectCalibratedMatchup } from "../lib/matchupModel";
import { holdoutBaselineComparison, holdoutMarketCalibration, holdoutProjectionDistribution, possessionModel, scoringModelValidation, validationBySeason } from "../lib/scoringModel";
import { buildRoundRobinStandings, type RoundRobinProfile } from "../lib/roundRobin";
import type { ConferenceRuleProfile, ConferenceStandingRow } from "../lib/conferenceStandings";
import { buildTacticalPlan, type FormationId, type PlayArtId, type TacticalZone } from "../lib/tacticalPlan";
import { buildPlayDiagram, defenseFormations, offenseFormations, type DiagramPathKind } from "../lib/playDiagram";
import {
  assignFormationPlayers,
  buildOffensiveLineUnitProfile,
  matchupPersonnel,
  playerBasicMetric,
  playerDisplayLabel,
  playerHeadlineStats,
  playerRatingSourceLabel,
  playerRecruitingLabel,
  type FormationPlayer,
  type OffensiveLineUnitMetric,
  type PlayerProfile,
  type TeamPlayerModel,
} from "../lib/playerModel";
import type { AdvancedMetricKey, AdvancedProfile, AdvancedSideProjection } from "../lib/advancedMetrics";
import { scatterDomain, scatterMean, scatterPosition, scatterRegression, scatterTicks } from "../lib/scatterplot";
import { type BroadcastMetric } from "../lib/matchupIntelligence";
import { wilsonConfidenceInterval } from "../lib/marketLineQuality";
import { configureViabilityCalibration, type OffensiveViability, type ViabilityCalibrationMap } from "../lib/offensiveViability";
import { compareScheduleRows, matchesSchedulePickFilter, type SchedulePickFilter, type ScheduleSortMode } from "../lib/scheduleFilters";
import { scheduleGameLabel } from "../lib/scheduleLabels";
import { resolveTeamLogoAsset, type TeamLogoVariant } from "../lib/teamLogoAssets";
import {
  deriveMatchupIntelligence,
  deriveRosterStability,
  deriveTeamIdentity,
  deriveTeamMovement,
  deriveTeamStability,
  type MatchupAdvantageCard,
  type MatchupIntelligenceBoard,
} from "../lib/footballIntelligence";
import {
  TEAM_STATS_ADVANCED_VIEWS,
  TEAM_STATS_ADVANCED_METRICS,
  TEAM_STATS_GROUPS,
  defaultTeamStatsSortDirection,
  formatTeamStatsValue,
  sortTeamStatsRows,
  teamStatsColumns,
  teamStatsValueTone,
  type TeamStatsAdvancedView,
  type TeamStatsGroup,
  type TeamStatsSortDirection,
  type TeamStatsSortKey,
} from "../lib/teamStatsSort";
import { playerOverallTier } from "../lib/playerProductionRatings";
import {
  PLAYER_STATS_POSITIONS,
  defensiveTackleUnitJerseyNumber,
  offensiveLineJerseyNumber,
  defaultPlayerStatsSortDirection,
  formatPlayerStatsValue,
  playerStatsColumns,
  playerStatsDefaultSortKey,
  playerStatsMetricColumns,
  playerStatsNumericValue,
  playerStatsQualification,
  playerMeetsScatterParticipationThreshold,
  playerQualifiesForStat,
  playerStatsValueTone,
  type PlayerStatsDirection,
  type PlayerStatsMetricKey,
  type PlayerStatsPosition,
  type PlayerStatsRow,
  type PlayerStatsSortKey,
} from "../lib/playerStats";
import { comparePlayerWeeklyGames, playerWeeklyMetricValue, playerWeeklySupportedMetric, type PlayerWeeklyMetricMap } from "../lib/playerWeekly";
import {
  PFF_TABLES,
  normalizedPffPlayer,
  pffCellNumber,
  pffFallbackJersey,
  pffMetricSampleQualified,
  pffMetrics,
  pffPositionMatches,
  pffRowQualified,
  pffTableForPosition,
  resolvePffTeam,
  type PffPosition,
  type PffTablePayload,
} from "../lib/pffVisualizer";
import type { MatchupAnalogLane, MatchupContextLaneId, MatchupContextPayload, MatchupTeamContext } from "../lib/matchupContext";
import { buildMatchupFieldMap, buildPffFieldTendency, type MatchupFieldMap } from "../lib/matchupFieldMap";
import { modelSpreadRead, modelTotalRead, officialAtsSetRead } from "../lib/gameMarketSummary";
import { POWER_4_FILTER, POWER_4_LABEL, conferenceFilterDisplay, matchesConferenceFilter } from "../lib/conferenceFilters";
import { enteringWeekSnapshotWeek, rankingAppliesToWeek, scoreRankingSnapshotWeek } from "../lib/weeklyRankingSnapshot";
import {
  evaluateWinConditionScenario,
  formatWinConditionValue,
  type GameScriptCluster,
  type WinCondition,
  type WinConditionAnalysis,
  type WinConditionTeamAnalysis,
} from "../lib/winConditions";

const teamMap = new Map(teams.map((team) => [team.name, team]));
const rankedMap = new Map<string, (typeof top25)[number]>(top25.map((team) => [team.team, team]));

type DynamicProfileRow = {
  season:number;week:number;team:string;gamesPlayed:number;teamId?:string;abbreviation?:string;mascot?:string;conference?:string;color?:string;altColor?:string;logo?:string;
  offYpp:number;offYpa:number;offYpc:number;offPatt:number;offRatt:number;defYpp:number;defYpa:number;defYpc:number;defPatt:number;defRatt:number;
  offYppIndex:number;offYpaIndex:number;offYpcIndex:number;offPattIndex:number;offRattIndex:number;defYppIndex:number;defYpaIndex:number;defYpcIndex:number;defPattIndex:number;defRattIndex:number;
  eloRating?:number;crossEraRating?:number;scheduleStrength?:number;bestOpponentStrength?:number;qualityWinStrength?:number;matchupReliability?:number;
  resumeScore?:number;nationalChampion?:boolean;seasonRecord?:string;finalContextApplied?:boolean;
  advancedProfile?:AdvancedProfile|null;
  returningPpa?:number|null;returningPassingPpa?:number|null;returningReceivingPpa?:number|null;returningRushingPpa?:number|null;
  returningUsage?:number|null;returningPassingUsage?:number|null;returningReceivingUsage?:number|null;returningRushingUsage?:number|null;
  recruitingRank?:number|null;recruitingPoints?:number|null;
};
type HistoricalComparisonRow = {season:number;team:string;similarity:number;sharedTrait:string;logo?:string;conference?:string};

type GameStatProfile = {
  totalYards:number|null;yardsPerPlay:number|null;passYards:number|null;passAttempts:number|null;passCompletions:number|null;yardsPerPass:number|null;
  rushYards:number|null;rushAttempts:number|null;yardsPerRush:number|null;turnovers:number|null;
};

type GameAdvancedProfile = {
  successRate:number|null;explosiveness:number|null;ppa:number|null;pointsPerDrive:number|null;playsPerDrive:number|null;
  thirdDownSuccessRate:number|null;redZoneEfficiency:number|null;havocRate:number|null;lineYards:number|null;secondLevelYards:number|null;openFieldYards:number|null;
  stuffRate:number|null;powerSuccess:number|null;rushingSuccessRate:number|null;rushingExplosiveness:number|null;rushingPpa:number|null;
  completionRate:number|null;yardsPerCompletion:number|null;passingSuccessRate:number|null;passingExplosiveness:number|null;passingPpa:number|null;
  standardDownSuccessRate:number|null;passingDownSuccessRate:number|null;
};

type GameStatBenchmarks = {
  firstSeason:number;lastSeason:number;sampleSize:number;
  basic:GameStatProfile;advanced:GameAdvancedProfile;
};

type ScheduleRow = {
  gameId:string;season:number;week:number;seasonType:string;startDate?:string;completed:boolean|number;neutralSite:boolean|number;venue?:string;
  homeTeam:string;homeConference?:string;homePoints:number|null;awayTeam:string;awayConference?:string;awayPoints:number|null;
  generatedFromWeek?:number;predictedHomeScore:number|null;predictedAwayScore:number|null;homeWinProbability:number|null;modelHomeSpread:number|null;modelTotal:number|null;
  vegasSpread:number|null;vegasTotal:number|null;spreadEdge:number|null;totalEdge:number|null;spreadError:number|null;totalError:number|null;spreadResult?:string;totalResult?:string;
  spreadQualified?:boolean;totalQualified?:boolean;spreadRecommendation?:string;totalRecommendation?:string;positionScore?:number;
  totalDiagnosticQualified?:boolean;totalDiagnosticRecommendation?:string;totalDiagnosticResult?:string|null;
  provider?:string;formattedSpread?:string;spreadOpen?:number|null;overUnderOpen?:number|null;
  lineQuality?:"verified"|"live"|"provisional"|"quarantined";lineQualityReason?:string|null;
  homeLogo?:string;awayLogo?:string;
  homePregameRank?:number|null;awayPregameRank?:number|null;rankingWeek?:number|null;
  homeRecordAfter?:string|null;awayRecordAfter?:string|null;recordStatus?:"actual"|"projected"|"unavailable";
  storedModelVersion?:string;predictionSource?:"materialized"|"live-profile"|"pending";
  homeActualStats?:GameStatProfile|null;awayActualStats?:GameStatProfile|null;homePredictedStats?:GameStatProfile|null;awayPredictedStats?:GameStatProfile|null;
  homeActualAdvanced?:GameAdvancedProfile|null;awayActualAdvanced?:GameAdvancedProfile|null;homePredictedAdvanced?:GameAdvancedProfile|null;awayPredictedAdvanced?:GameAdvancedProfile|null;
  statBenchmarks?:GameStatBenchmarks|null;
  edgeAnalysis?:MatchupEdgeAnalysis;
};

type WinConditionTeamIdentity = {
  team:string;season?:number;requestedWeek?:number;effectiveWeek?:number;abbreviation?:string|null;conference?:string|null;logo?:string|null;
  record?:string|null;resultsRank?:number|null;
};
type WinConditionsPayload = {
  source?:string;modelVersion?:string;gameId?:string;message?:string;
  teams?:{home:WinConditionTeamIdentity;away:WinConditionTeamIdentity};
  analysis:WinConditionAnalysis|null;
};
type MatchupLaunch = {
  key:string;gameId:string;homeTeam:string;awayTeam:string;homeSeason:number;awaySeason:number;homeWeek:number;awayWeek:number;neutralSite:boolean;
};

type AccuracyMetric = {
  wins:number;losses:number;pushes:number;passed:number;quarantined?:number;eligible:number;graded:number;sampleSize?:number;
  accuracy:number|null;confidenceLow?:number|null;confidenceHigh?:number|null;confidenceLevel?:number;meanAbsoluteError:number|null;
};
type SeasonPerformance = {
  season:number;modelVersion:string;minMarketWeek:number;gameCount:number;profileCount:number;
  snapshotStatus?:"frozen"|"live";lineQualityStatus?:"live"|"provisional";
  straightUp:{wins:number;graded:number;accuracy:number|null};spread:AccuracyMetric;total:AccuracyMetric;
};
type CalibrationSeason = { season:number;snapshotStatus:"live";lineQualityStatus:"live"|"provisional";straightUp:{wins:number;losses:number;graded:number;accuracy:number|null};spread:AccuracyMetric;total:AccuracyMetric };
type CalibrationScope = "qualified"|"all";
type CalibrationReport = {
  modelVersion:string;snapshotStatus:"live";minMarketWeek:number;scope?:CalibrationScope;validation:string;rows:CalibrationSeason[];
  filters?:{team:string;conference:string};teamOptions?:string[];conferenceOptions?:string[];
};
type ConferenceStandingsReport = {
  season:number;requestedWeek:number;effectiveWeek:number;conference:string;conferences:string[];
  rules:ConferenceRuleProfile|null;rows:ConferenceStandingRow[];message?:string;
};
type ValidationSlice = {
  label:string;count:number|null;scoreMae?:number|null;spreadMae?:number|null;totalMae?:number|null;
  straightUp?:number|null;brier?:number|null;atsAccuracy?:number|null;totalAccuracy?:number|null;predicted?:number|null;actual?:number|null;
};
type ValidationSlicesReport = {
  modelVersion:string;week:ValidationSlice[];confidence:ValidationSlice[];dataQuality:ValidationSlice[];
  atsEdges:ValidationSlice[];totalEdges:ValidationSlice[];winCalibration:ValidationSlice[];
};

type SeasonRankingRow = {
  rank:number;team:string;teamId?:string;abbreviation?:string;mascot?:string;conference?:string;color?:string;altColor?:string;logo?:string;
  wins:number;losses:number;ties:number;record:string;conferenceRecord:string;bcsScore:number;resultsScore:number;scheduleScore:number;computerScore:number;
  sorRank:number;sosRank:number;powerRank:number;eloRank:number;colleyRank:number;headToHeadRank:number;
  bestWins?:string[];lossesTo?:string[];
};
type SeasonRankingReport = {
  season:number;requestedWeek:number;effectiveWeek:number;methodology:string;rows:SeasonRankingRow[];message?:string;
};
type SimulatedScheduleRow = {
  gameId:string;opponent:string;location:"HOME"|"AWAY"|"NEUTRAL";status:"final"|"projected";
  teamScore:number;opponentScore:number;recordAfter:string;
  homeTeam:string;awayTeam:string;homeScore:number;awayScore:number;homeRecordAfter:string;awayRecordAfter:string;neutralSite:boolean;
  week:number;seasonType:"regular"|"conference-championship";
  homeWinProbability:number|null;modelHomeSpread:number|null;modelTotal:number|null;
  homePredictedStats:GameStatProfile|null;awayPredictedStats:GameStatProfile|null;
  homePredictedAdvanced:GameAdvancedProfile|null;awayPredictedAdvanced:GameAdvancedProfile|null;
  edgeAnalysis?:MatchupEdgeAnalysis;
};
type SimulatedRankingRow = SeasonRankingRow & { expectedWins:number;projectedWins:number;projectedLosses:number;projectedRecord:string;projectedWinsOver:string[];projectedLossesTo:string[];conferenceChampion:boolean;playoffSeed:number|null;schedule:SimulatedScheduleRow[] };
type ProjectedFinalRankingRow = Omit<SimulatedRankingRow,"schedule">;
type SimulationProjectionReceipt = {
  homeWinProbability:number|null;modelHomeSpread:number|null;modelTotal:number|null;
  homePredictedStats:GameStatProfile|null;awayPredictedStats:GameStatProfile|null;
  homePredictedAdvanced:GameAdvancedProfile|null;awayPredictedAdvanced:GameAdvancedProfile|null;
  edgeAnalysis?:MatchupEdgeAnalysis;
};
type ConferenceProjection = SimulationProjectionReceipt & { conference:string;firstTeam:string;secondTeam:string;winner:string;firstScore:number;secondScore:number;winnerProbability:number;schematicEdge:string };
type BracketProjection = SimulationProjectionReceipt & { id:string;round:"First Round"|"Quarterfinal"|"Semifinal"|"Championship";slot:number;firstTeam:string;secondTeam:string;firstSeed:number;secondSeed:number;firstScore:number;secondScore:number;winner:string;winnerSeed:number;winnerProbability:number;campusGame:boolean;schematicEdge:string };
type SeasonSimulation = {
  season:number;requestedWeek:number;effectiveWeek:number;fieldMode:"projected-field";format:4|12;methodology:string;champion:string|null;championshipProbability:number|null;
  rankings:SimulatedRankingRow[];conferenceChampionships:ConferenceProjection[];bracket:BracketProjection[];
};
type SimulationScenarioOverride={gameId:string;winnerTeam:string};
type SimulationScenarioRanking={
  rank:number;team:string;conference?:string;logo?:string;projectedRecord:string;expectedWins:number;
  conferenceChampion:boolean;playoffSeed:number|null;
};
type SimulationScenarioBracketGame={
  id:string;round:"First Round"|"Quarterfinal"|"Semifinal"|"Championship";slot:number;
  firstTeam:string;secondTeam:string;firstSeed:number;secondSeed:number;firstScore:number;secondScore:number;
  winner:string;winnerSeed:number;
};
type SimulationScenarioPayload={
  season:number;requestedWeek:number;effectiveWeek:number;team:string;methodology:string;message?:string;
  appliedOverrides:SimulationScenarioOverride[];games:SimulatedScheduleRow[];scenarioGames:SimulatedScheduleRow[];
  baseline:{champion:string|null;format:4|12;rankings:SimulationScenarioRanking[];bracket:SimulationScenarioBracketGame[]};
  scenario:{champion:string|null;format:4|12;rankings:SimulationScenarioRanking[];bracket:SimulationScenarioBracketGame[]};
};
type ProjectedFinalRankReport = {
  season:number;requestedWeek:number;effectiveWeek:number;methodology:string;
  rankings:ProjectedFinalRankingRow[];
};
type BackfillResult = { season:number;stage:"teams"|"priors"|"schedule"|"stats"|"advanced"|"passing"|"formulas"|"complete";week?:number;teams?:number;games?:number;stats?:number;advancedStats?:number;profiles?:number;predictions?:number };
type BackfillPayload = {
  configured?:boolean;currentSeason?:number;missing?:number[];status?:string;
  seasons?:Array<{season:number;ready:boolean;teamCount:number;logoCount:number;gameCount:number;postseasonGameCount:number;statRowCount:number;advancedRowCount:number;advancedProfileCount:number;advancedCompletedGameCount:number;profileTeamCount:number;profileCount:number;predictionCount:number;lineCount:number;completedWeekCount:number;statWeekCount:number;completionWeekCount:number;stage:string;progressPercent:number}>;
  playerArchive?:{firstSeason:number;currentSeason:number;missing:number[];seasons:Array<{season:number;stage:string;progressPercent:number;ready:boolean;detail:string}>};
  playerSync?:{season:number;stage:string;progressPercent:number;ready:boolean;detail:string};
  playerProductionBaseline?:{status:"ready"|"building"|"waiting";detail:string;nextSeason?:number;dirty?:boolean};
  depthChartArchive?:{firstSeason:number;lastSeason:number;targetTeamSeasons:number;sourcedTeamSeasons:number;fullyMatchedTeamSeasons:number;verifiedSnapshots:number;verifiedEntries:number;unresolvedEntries:number};
  message?:string;importedSeason?:number;retryAfterSeconds?:number;result?:BackfillResult;
};
type DynamicProfilePayload={source?:string;rows?:DynamicProfileRow[];viabilityCalibration?:ViabilityCalibrationMap};
type PlayerTeamIndexRow={team:string;teamId?:string;abbreviation?:string;mascot?:string;conference?:string;color?:string;altColor?:string;logo?:string};
type PlayerApiPayload={
  configured?:boolean;season:number;status:"ready"|"upgrading"|"building"|"waiting"|"error"|"unsupported"|"unavailable";
  supportedRange?:number[];message?:string;retryAfterSeconds?:number;
  sync?:{stage:string;progressPercent:number;ready:boolean;detail:string;updatedAt?:string|null};
  productionBaseline?:{firstSeason:number;lastSeason:number;playerSeasonCount:number};
  teams?:PlayerTeamIndexRow[];
  profiles?:Array<{team:string;sourceQuality:string;model:TeamPlayerModel}>;
};
type GamePlayerLine={playerId:string;playerName:string;metrics:PlayerWeeklyMetricMap};
type GamePlayerTeamStats={team:string;game:GamePlayerLine[];seasonToDate:GamePlayerLine[]};
type GamePlayerStatsPayload={
  status:"ready"|"unavailable"|"invalid"|"error";season?:number;gameId?:string;completed?:boolean;throughWeek?:number;
  teams?:GamePlayerTeamStats[];message?:string;
};
type PlayerRatingRow={
  id:string;rank:number;season:number;team:string;teamId?:string;abbreviation?:string;conference?:string;color?:string;altColor?:string;logo?:string;
  name:string;lastName?:string;jersey:number|null;position:string;year:number|null;overall:number;
  source:"OBSERVED"|"PROJECTED"|"UNIT";productionScore:number|null;opponentRelative?:number|null;opponentUnitQuality?:number|null;supportQuality?:number|null;usageRate?:number|null;recruitingStars:number|null;
  ratingSource:"TRANSFER"|"HIGH SCHOOL"|"UNRATED";projectedStarter:boolean;evidence:string;
  statProfile?:Array<{label:string;value:string;tone:"positive"|"neutral"|"warning"}>;
};
type PlayerRatingsPayload={
  configured?:boolean;season:number;status:"ready"|"building"|"waiting"|"error"|"unsupported"|"unavailable";
  message?:string|null;retryAfterSeconds?:number;
  baseline?:{firstSeason:number;lastSeason:number;playerSeasonCount:number;currentGenerationReady?:boolean};
  availableSeasons?:number[];positions?:string[];teams?:PlayerTeamIndexRow[];conferences?:string[];
  filters?:{team:string;conference:string;position:string;sort:string;direction:"asc"|"desc"};
  pagination?:{page:number;pageCount:number;limit:number;total:number};
  rows?:PlayerRatingRow[];
};
type PlayerStatsPayload={
  configured?:boolean;season:number;status:"ready"|"building"|"waiting"|"error"|"unsupported"|"unavailable";
  message?:string|null;retryAfterSeconds?:number;
  availableSeasons?:number[];positions?:string[];teams?:PlayerTeamIndexRow[];conferences?:string[];
  filters?:{conference:string;position:PlayerStatsPosition;query:string;metric:PlayerStatsMetricKey;sort:PlayerStatsSortKey;direction:PlayerStatsDirection};
  qualification?:{label:string;excluded:number;considered:number};
  coverage?:{advanced:number;total:number};
  rankingContext?:{nationalCount:number;allEraCount:number;firstSeason:number;lastSeason:number};
  pagination?:{page:number;pageCount:number;limit:number;total:number};
  rows?:PlayerStatsRow[];
};
type ScatterPlayerPayload={
  season:number;status:"ready"|"building"|"waiting"|"error"|"unsupported"|"unavailable";
  message?:string|null;availableSeasons?:number[];teams?:PlayerTeamIndexRow[];conferences?:string[];
  rows?:PlayerStatsRow[];
};
type PlayerWeeklyGame={
  gameId:string;week:number;seasonType:string;date:string;opponent:string;opponentAbbreviation:string;opponentLogo:string;metrics:PlayerWeeklyMetricMap;
};
type PlayerWeeklyPayload={
  status:"ready"|"invalid"|"error"|"unavailable";season?:number;team?:string;message?:string;
  player?:{id:string;name:string};games?:PlayerWeeklyGame[];
};

const dynamicProfileCache=new Map<string,{loadedAt:number;payload:DynamicProfilePayload}>();
const dynamicProfileRequests=new Map<string,Promise<DynamicProfilePayload>>();
const winConditionCache=new Map<string,{loadedAt:number;payload:WinConditionsPayload}>();
const winConditionRequests=new Map<string,Promise<WinConditionsPayload>>();

type WinConditionRequest =
  |{kind:"game";season:number;gameId:string}
  |{kind:"matchup";homeTeam:string;awayTeam:string;homeSeason:number;awaySeason:number;homeWeek:number;awayWeek:number;neutralSite:boolean};

function winConditionRequestKey(request:WinConditionRequest){
  return request.kind==="game"
    ?`game:${request.season}:${request.gameId}`
    :`matchup:${request.homeSeason}:${request.homeWeek}:${request.homeTeam}:${request.awaySeason}:${request.awayWeek}:${request.awayTeam}:${request.neutralSite}`;
}

function loadWinConditions(request:WinConditionRequest){
  const key=winConditionRequestKey(request),cached=winConditionCache.get(key);
  if(cached&&Date.now()-cached.loadedAt<15*60*1000)return Promise.resolve(cached.payload);
  const pending=winConditionRequests.get(key);
  if(pending)return pending;
  const params=request.kind==="game"
    ?new URLSearchParams({view:"win-conditions",season:String(request.season),gameId:request.gameId})
    :new URLSearchParams({view:"win-conditions",season:String(request.homeSeason),week:String(request.homeWeek),homeTeam:request.homeTeam,
        awaySeason:String(request.awaySeason),awayWeek:String(request.awayWeek),awayTeam:request.awayTeam,neutralSite:request.neutralSite?"1":"0"});
  const promise=fetch(`/api/data?${params}`).then(async(response)=>{
    const payload=await readJsonBody<WinConditionsPayload>(response);
    if(!response.ok||!payload.analysis)throw new Error(payload.message||"Win Conditions are unavailable for this matchup.");
    winConditionCache.set(key,{loadedAt:Date.now(),payload});
    return payload;
  }).finally(()=>winConditionRequests.delete(key));
  winConditionRequests.set(key,promise);
  return promise;
}

function useWinConditions(request:WinConditionRequest|null,enabled:boolean){
  const requestKey=request?winConditionRequestKey(request):"";
  const [result,setResult]=useState<{key:string;payload:WinConditionsPayload|null;error:string}>({key:"",payload:null,error:""});
  useEffect(()=>{
    if(!enabled||!request)return;
    let cancelled=false;
    loadWinConditions(request)
      .then((payload)=>{if(!cancelled)setResult({key:requestKey,payload,error:""});})
      .catch((error)=>{if(!cancelled)setResult({key:requestKey,payload:null,error:error instanceof Error?error.message:"Win Conditions are unavailable."});});
    return()=>{cancelled=true;};
  },[enabled,request,requestKey]);
  const cached=requestKey?winConditionCache.get(requestKey)?.payload:null;
  return {
    data:enabled?(result.key===requestKey?result.payload:cached??null):null,
    loading:Boolean(enabled&&requestKey&&result.key!==requestKey&&!cached),
    error:enabled&&result.key===requestKey?result.error:"",
  };
}

function loadDynamicProfilePayload(season:number,week:number) {
  const key=`${season}:${week}`,cached=dynamicProfileCache.get(key);
  if(cached&&Date.now()-cached.loadedAt<5*60*1000) return Promise.resolve(cached.payload);
  const pending=dynamicProfileRequests.get(key);
  if(pending) return pending;
  const request=fetch(`/api/data?view=profiles&season=${season}&week=${week}`)
    .then((response)=>readJsonBody<DynamicProfilePayload>(response))
    .then((payload)=>{dynamicProfileCache.set(key,{loadedAt:Date.now(),payload});return payload;})
    .finally(()=>dynamicProfileRequests.delete(key));
  dynamicProfileRequests.set(key,request);
  return request;
}

async function readJsonBody<T>(response: Response): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const html = /^\s*<!doctype|^\s*<html/i.test(body);
    throw new Error(html
      ? `The data service was interrupted before it could answer (HTTP ${response.status}).`
      : `The data service returned an invalid response (HTTP ${response.status}).`);
  }
}

function archiveSummary(payload: BackfillPayload) {
  const seasons = payload.seasons ?? [];
  const games = seasons.reduce((sum, row) => sum + row.gameCount, 0);
  const profiles = seasons.reduce((sum, row) => sum + row.profileCount, 0);
  return `CFBD archive ready · ${games.toLocaleString()} games · ${profiles.toLocaleString()} team-week profiles · 2014–${payload.currentSeason}`;
}

const FIRST_MODEL_SEASON = 2014;
const seasonOptions = Array.from({ length: new Date().getUTCFullYear() - FIRST_MODEL_SEASON + 1 }, (_, index) => FIRST_MODEL_SEASON + index);
const now = new Date();
const activeModelSeason = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const activeSeasonKickoff = Date.UTC(activeModelSeason, 7, 23);
const activeModelWeek = now.getTime() < activeSeasonKickoff ? 0 : Math.min(16, Math.floor((now.getTime() - activeSeasonKickoff) / (7 * 24 * 60 * 60 * 1000)) + 1);

const STAT_DEFINITIONS:Record<string,string> = {
  "Yards / Play":"How many yards the offense gains on an average snap. For example, 600 yards on 100 plays equals 6.0 yards per play.",
  "Yards / Pass":"How many yards the offense gains each time it attempts a pass. A team with 240 passing yards on 30 attempts averages 8.0.",
  "Yards / Rush":"How many yards the offense gains on an average running play. A team with 180 yards on 40 carries averages 4.5.",
  "Pass Attempts":"How often the team throws in a typical game. More attempts usually indicate a faster pace, a pass-first offense, or a team playing from behind.",
  "Rush Attempts":"How often the team runs in a typical game. More carries usually indicate a run-first offense or a team protecting a lead.",
  "Completion rate":"The percentage of passes caught. Completing 18 of 30 passes produces a 60% completion rate.",
  "Yards / completion":"The average gain when a pass is caught. A higher number usually means the offense creates more downfield or catch-and-run plays.",
  "Pass success rate":"The share of passes that gain enough yards for the down and distance. A five-yard completion can be successful on 1st-and-10 but unsuccessful on 3rd-and-8.",
  "Pass explosiveness":"How often completed passes create major field-position swings and scoring opportunities. Higher means more dangerous chunk plays.",
  "Pass PPA":"Estimated points added by each pass. Positive numbers mean the passing game usually moves the team closer to scoring.",
  "Line yards / rush":"How much of each rushing gain is created by the blocking up front. Higher numbers indicate the offensive line is consistently opening usable lanes.",
  "Stuff rate":"The percentage of runs stopped at or behind the line of scrimmage. A 20% stuff rate means one out of every five carries goes nowhere or backward.",
  "Power success":"How often the offense converts short-yardage runs when only a yard or two is needed. It measures who wins the most crowded running situations.",
  "Second-level / rush":"Yards gained after the runner clears the defensive line and reaches the linebackers. Higher values show backs are regularly getting beyond the first wave.",
  "Open-field / rush":"Yards created after the runner reaches the secondary. Higher values point to breakaway speed and big-play running ability.",
  "Rush success rate":"The share of carries that gain enough yards for the down and distance, keeping the offense out of difficult situations.",
  "Rush explosiveness":"How often the running game produces chunk gains that quickly change field position or create scoring chances.",
  "Rush PPA":"Estimated points added by each carry. Positive numbers mean the running game usually improves the offense's chance to score.",
  "Standard-down success":"How often the offense gains enough yardage before the defense can be confident a pass is coming, such as on 1st-and-10 or 2nd-and-short.",
  "Standard-down explosiveness":"How often the offense creates big pass plays on early downs, when the threat of the run can hold defenders closer to the line.",
  "Passing-down success":"How often the offense converts when the defense expects a pass, such as 3rd-and-long. This tests protection, quarterback decisions, and receivers separating.",
  "Passing-down PPA":"Estimated points added on obvious passing downs. Positive numbers show the offense can recover even when the defense knows a throw is coming.",
  "EPA/play (PPA)":"Estimated points added by an average snap after accounting for down, distance and field position. Positive values move the offense closer to scoring.",
  "Overall success rate":"The share of all snaps that gain enough yards for the down and distance. It measures whether the offense consistently stays on schedule.",
  "Overall explosiveness":"The scoring value of successful plays. Higher values mean the offense creates more field-flipping gains when it wins a snap.",
  "Points / drive":"How many points the offense produces on an average possession. It rewards finishing possessions rather than piling up yards between the 20s.",
  "Havoc rate":"The share of plays disrupted by tackles for loss, forced fumbles, interceptions, pass breakups or sacks. Lower is better for the offense; higher creation is better for the defense.",
  "Front-seven havoc":"Disruption created or allowed around the line of scrimmage by defensive linemen and linebackers.",
  "Late-down success":"The historical advanced-feed proxy for surviving obvious passing situations. It is used when an exact third-down split is unavailable.",
  "Starting field position":"Average starting yard line. Better field position shortens drives and serves as the model's special-teams and hidden-yards proxy.",
  "RAW":"The team's actual per-play or per-game number before adjusting for the strength of the opponents it faced.",
  "ADJ % AVG":"A comparison with the FBS average after accounting for opponents. On offense, 110% is 10% better than average; on defense, 90% allowed is 10% better.",
  "NATL RK":"Where the team places among all model-ready FBS teams for that statistic. Number 1 is best after accounting for whether higher or lower is desirable.",
};

function StatHelp({ label, explanation }: { label:string; explanation?:string }) {
  const text = explanation ?? STAT_DEFINITIONS[label] ?? Object.entries(STAT_DEFINITIONS).find(([key]) => key.toLowerCase() === label.toLowerCase())?.[1];
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltip, setTooltip] = useState<{left:number;top:number;width:number;maxHeight:number;above:boolean}|null>(null);
  useEffect(() => {
    const close = () => setTooltip(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, []);
  if (!text) return null;
  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(300, Math.max(160, window.innerWidth - 24));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const belowSpace = window.innerHeight - rect.bottom;
    const above = rect.top > 170 || belowSpace < 130;
    const maxHeight = Math.max(48, above ? rect.top - 22 : belowSpace - 22);
    setTooltip({ left, top: above ? rect.top - 10 : rect.bottom + 10, width, maxHeight, above });
  };
  return <>
    <button ref={buttonRef} type="button" className="stat-help" aria-label={`${label}: ${text}`} onMouseEnter={show} onMouseLeave={() => setTooltip(null)} onFocus={show} onBlur={() => setTooltip(null)} onPointerDown={(event) => { event.stopPropagation(); show(); }} onClick={(event) => event.stopPropagation()}>?</button>
    {tooltip ? createPortal(<span className={`stat-help-popover ${tooltip.above ? "above" : "below"}`} role="tooltip" style={{ left:tooltip.left,top:tooltip.top,width:tooltip.width,maxHeight:tooltip.maxHeight }}>{text}</span>, document.body) : null}
  </>;
}

function StatLabel({ label, explanation }: { label:string; explanation?:string }) {
  return <span className="stat-label">{label}<StatHelp label={label} explanation={explanation} /></span>;
}

function useDynamicProfiles(season:number, week:number) {
  const [rows,setRows] = useState<DynamicProfileRow[]>([]);
  const [source,setSource] = useState<"database"|"embedded"|"loading">("loading");
  const [loadedKey,setLoadedKey] = useState("");
  const requestKey = `${season}:${week}`;
  useEffect(() => {
    let cancelled=false;
    loadDynamicProfilePayload(season,week)
      .then((payload) => {
        if(cancelled)return;
        configureViabilityCalibration(payload.viabilityCalibration);
        if (payload.rows?.length) { setRows(payload.rows); setSource("database"); }
        else { setRows([]); setSource("embedded"); }
        setLoadedKey(requestKey);
      }).catch(() => { if(!cancelled){setRows([]);setSource("embedded");setLoadedKey(requestKey);} });
    return () => {cancelled=true;};
  },[season,week,requestKey]);

  const activeRows = useMemo(() => loadedKey === requestKey ? rows : [], [loadedKey, requestKey, rows]);
  const activeSource = loadedKey === requestKey ? source : "loading";
  const dynamicTeams = useMemo<TeamModel[]>(() => activeRows.map((row) => ({
    id:String(row.teamId || row.team),name:row.team,mascot:row.mascot || "",abbr:row.abbreviation || row.team.slice(0,4).toUpperCase(),conference:row.conference || "FBS",
    color:row.color ? `#${row.color.replace(/^#/,"")}` : teamMap.get(row.team)?.color || "#333333",altColor:row.altColor ? `#${row.altColor.replace(/^#/,"")}` : teamMap.get(row.team)?.altColor || "#ffffff",
    logo:row.logo || teamMap.get(row.team)?.logo,rating:row.crossEraRating??row.eloRating,baseRating:row.eloRating,
    resumeScore:row.resumeScore,seasonRecord:row.seasonRecord,nationalChampion:row.nationalChampion,finalContext:row.finalContextApplied,
    weeks:{[String(row.week)]:{o:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex],d:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex],rank:null,evidence:{
      gamesPlayed:row.gamesPlayed,scheduleStrength:row.scheduleStrength ?? 0.5,bestOpponentStrength:row.bestOpponentStrength ?? 0.5,
      qualityWinStrength:row.qualityWinStrength ?? 0.5,reliability:row.matchupReliability ?? 1,
    },advanced:row.advancedProfile}},
  })),[activeRows]);
  const fallback = season === modelSnapshot.season ? teams : [];
  return { rows:activeRows, teams:dynamicTeams.length ? dynamicTeams : fallback, source:activeSource, loading:activeSource === "loading" };
}

function usePlayerLayer(season:number, requestedTeams:string[] = []) {
  const teamKey=[...new Set(requestedTeams.filter(Boolean))].sort().join("|");
  const requestKey=`${season}:${teamKey}`;
  const [result,setResult]=useState<{key:string;payload:PlayerApiPayload|null}>({key:"",payload:null});
  useEffect(()=>{
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      try {
        const params=new URLSearchParams({season:String(season)});
        if(teamKey) params.set("teams",teamKey);
        const response=await fetch(`/api/players?${params}`);
        const payload=await readJsonBody<PlayerApiPayload>(response);
        if(cancelled)return;
        setResult({key:requestKey,payload});
        if(payload.status==="upgrading"||payload.status==="building"||payload.status==="waiting") timer=setTimeout(load,Math.max(60_000,(payload.retryAfterSeconds??0)*1000));
      } catch {
        if(!cancelled)setResult({key:requestKey,payload:{season,status:"error",teams:[],profiles:[],message:"Player data is temporarily unavailable."}});
      }
    };
    load();
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[requestKey,season,teamKey]);
  const payload=result.key===requestKey?result.payload:null;
  const profiles=useMemo(()=>new Map((payload?.profiles??[]).map((row)=>[row.team,row.model])),[payload]);
  return {payload,profiles,loading:!payload||((payload.status==="upgrading"||payload.status==="building"||payload.status==="waiting")&&profiles.size===0)};
}

function useGamePlayerStats(row:ScheduleRow){
  const requestKey=`${row.season}:${row.gameId}`;
  const simulated=row.gameId.startsWith("sim-");
  const [result,setResult]=useState<{key:string;payload:GamePlayerStatsPayload|null}>({key:"",payload:null});
  useEffect(()=>{
    if(simulated)return;
    const controller=new AbortController();
    const params=new URLSearchParams({season:String(row.season),gameId:row.gameId});
    fetch(`/api/game-players?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<GamePlayerStatsPayload>(response))
      .then((payload)=>setResult({key:requestKey,payload}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:{status:"error",teams:[],message:"Game player statistics are temporarily unavailable."}});});
    return()=>controller.abort();
  },[requestKey,row.gameId,row.season,simulated]);
  if(simulated)return{payload:{status:"unavailable",teams:[],message:"Point-in-time player stats are not available for simulated games."} as GamePlayerStatsPayload,loading:false};
  return{payload:result.key===requestKey?result.payload:null,loading:result.key!==requestKey||!result.payload};
}

function useSeasonPerformance(season:number) {
  const [data,setData] = useState<SeasonPerformance|null>(null);
  const [loadedSeason,setLoadedSeason] = useState<number|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=performance&season=${season}&marketMetric=v21`, { signal:controller.signal })
      .then((response) => readJsonBody<SeasonPerformance>(response))
      .then((payload) => { setData(payload?.spread && payload?.total ? payload : null); setLoadedSeason(season); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setData(null); setLoadedSeason(season); } });
    return () => controller.abort();
  }, [season]);
  return { data:loadedSeason === season ? data : null, loading:loadedSeason !== season };
}

function useCalibrationReport(scope:CalibrationScope="qualified",team="",conference="") {
  const [result,setResult] = useState<{key:string;payload:CalibrationReport|null}>({key:"",payload:null});
  const requestKey=`${scope}:${team}:${conference}`;
  useEffect(() => {
    const controller = new AbortController();
    const params=new URLSearchParams({view:"calibration",marketMetric:"v21",scope});
    if(team)params.set("team",team);
    else if(conference)params.set("conference",conference);
    fetch(`/api/data?${params}`, { signal:controller.signal })
      .then((response) => readJsonBody<CalibrationReport>(response))
      .then((payload) => setResult({key:requestKey,payload:payload?.rows ? payload : null}))
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setResult({key:requestKey,payload:null}); });
    return () => controller.abort();
  }, [conference,requestKey,scope,team]);
  return {
    data:result.key===requestKey?result.payload:null,
    options:{teams:result.payload?.teamOptions??[],conferences:result.payload?.conferenceOptions??[]},
    loading:result.key!==requestKey,
  };
}

function useValidationSlices() {
  const [data,setData]=useState<ValidationSlicesReport|null>(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/data?view=validation-slices",{signal:controller.signal})
      .then((response)=>readJsonBody<ValidationSlicesReport>(response))
      .then((payload)=>{setData(payload?.week?payload:null);setLoaded(true);})
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError"){setData(null);setLoaded(true);}});
    return ()=>controller.abort();
  },[]);
  return {data,loading:!loaded};
}

function useConferenceStandings(season:number,week:number,conference:string) {
  const [result,setResult]=useState<{key:string;payload:ConferenceStandingsReport|null}>({key:"",payload:null});
  const requestKey=`${season}:${week}:${conference}`;
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({view:"standings",season:String(season),week:String(week)});
    if(conference)params.set("conference",conference);
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<ConferenceStandingsReport>(response))
      .then((payload)=>setResult({key:requestKey,payload:payload?.conferences?payload:null}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:null});});
    return()=>controller.abort();
  },[conference,requestKey,season,week]);
  return {
    data:result.key===requestKey?result.payload:null,
    conferences:result.payload?.conferences??[],
    loading:result.key!==requestKey,
  };
}

function useEverySeasonProfiles(enabled:boolean) {
  const [rows, setRows] = useState<DynamicProfileRow[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/data?view=all-time-profiles", { signal:controller.signal })
      .then((response) => readJsonBody<{rows?:DynamicProfileRow[];seasons?:number[];viabilityCalibration?:ViabilityCalibrationMap}>(response))
      .then((payload) => { configureViabilityCalibration(payload.viabilityCalibration); setRows(payload.rows ?? []); setSeasons(payload.seasons ?? []); setLoaded(true); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setRows([]); setSeasons([]); setLoaded(true); } });
    return () => controller.abort();
  }, [enabled]);
  return { rows, seasons, loading:enabled && !loaded };
}

function useTeamHistory(season:number, week:number, team:string|undefined) {
  const [result,setResult]=useState<{key:string;rows:DynamicProfileRow[]}>({key:"",rows:[]});
  const requestKey=team?`${season}:${week}:${team}`:"";
  useEffect(()=>{
    if(!team||!requestKey)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"team-history",season:String(season),week:String(week),team});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:DynamicProfileRow[]}>(response))
      .then((payload)=>setResult({key:requestKey,rows:payload.rows??[]}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,rows:[]});});
    return()=>controller.abort();
  },[requestKey,season,team,week]);
  return {rows:result.key===requestKey?result.rows:[],loading:Boolean(requestKey)&&result.key!==requestKey};
}

function useHistoricalComparisons(season:number,week:number,team:string|undefined) {
  const [result,setResult]=useState<{key:string;rows:HistoricalComparisonRow[]}>({key:"",rows:[]});
  const requestKey=team?`${season}:${week}:${team}`:"";
  useEffect(()=>{
    if(!team||!requestKey)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"similar-teams",season:String(season),week:String(week),team});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:HistoricalComparisonRow[]}>(response))
      .then((payload)=>setResult({key:requestKey,rows:payload.rows??[]}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,rows:[]});});
    return()=>controller.abort();
  },[requestKey,season,team,week]);
  return {rows:result.key===requestKey?result.rows:[],loading:Boolean(requestKey)&&result.key!==requestKey};
}

function useSeasonSimulation(season:number, week:number) {
  const [data,setData] = useState<SeasonSimulation|null>(null);
  const [loadedKey,setLoadedKey] = useState("");
  const [error,setError] = useState("");
  const requestKey = `${season}:${week}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=simulation&season=${season}&week=${week}&engine=shared-game-path-v4`, { signal:controller.signal })
      .then((response) => readJsonBody<SeasonSimulation & {message?:string}>(response))
      .then((payload) => {
        setData(payload.rankings?.length ? payload : null);
        if (!payload.rankings?.length) setError(payload.message || "This season is still waiting for a complete schedule and weekly profile.");
        setLoadedKey(requestKey);
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== "AbortError") {
          setData(null);
          setError(caught.message);
          setLoadedKey(requestKey);
        }
      });
    return () => controller.abort();
  }, [season, week, requestKey]);
  return { data:loadedKey === requestKey ? data : null, loading:loadedKey !== requestKey, error:loadedKey === requestKey ? error : "" };
}

function useSimulationScenario(season:number,week:number,team:string,overrides:SimulationScenarioOverride[]){
  const overrideKey=JSON.stringify(overrides);
  const requestKey=`${season}:${week}:${team}:${overrideKey}`;
  const [result,setResult]=useState<{key:string;payload:SimulationScenarioPayload|null;error:string}>({key:"",payload:null,error:""});
  useEffect(()=>{
    if(!team)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"simulation-scenario",season:String(season),week:String(week),team});
    if(overrides.length)params.set("overrides",overrideKey);
    fetch(`/api/data?${params}`,{signal:controller.signal,cache:"no-store"})
      .then(async(response)=>{
        const payload=await readJsonBody<SimulationScenarioPayload>(response);
        if(!response.ok||!payload.baseline)throw new Error(payload.message||"The scenario could not be simulated.");
        return payload;
      })
      .then((payload)=>setResult({key:requestKey,payload,error:""}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:null,error:error.message});});
    return()=>controller.abort();
  },[overrideKey,overrides.length,requestKey,season,team,week]);
  const contextMatches=result.payload?.season===season&&result.payload.requestedWeek===week&&result.payload.team===team;
  return {data:contextMatches?result.payload:null,loading:Boolean(team)&&result.key!==requestKey,error:result.key===requestKey?result.error:""};
}

function useSeasonRankings(season:number,week:number){
  const requestKey=`${season}:${week}`;
  const [result,setResult]=useState<{key:string;payload:SeasonRankingReport|null}>({key:"",payload:null});
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/data?view=rankings&season=${season}&week=${week}`,{signal:controller.signal})
      .then((response)=>readJsonBody<SeasonRankingReport>(response))
      .then((payload)=>setResult({key:requestKey,payload:Array.isArray(payload.rows)?payload:null}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:null});});
    return()=>controller.abort();
  },[requestKey,season,week]);
  return {data:result.key===requestKey?result.payload:null,loading:result.key!==requestKey};
}

function useProjectedFinalRanks(season:number,week:number,team="") {
  const requestKey=`${season}:${week}:${team}`;
  const [result,setResult]=useState<{key:string;payload:ProjectedFinalRankReport|null}>({key:"",payload:null});
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({view:"projected-ranks",season:String(season),week:String(week),engine:"shared-game-path-v4"});
    if(team)params.set("team",team);
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<ProjectedFinalRankReport>(response))
      .then((payload)=>setResult({key:requestKey,payload:payload.rankings?.length?payload:null}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:null});});
    return()=>controller.abort();
  },[requestKey,season,team,week]);
  const payload=result.key===requestKey?result.payload:null;
  return{data:payload,loading:result.key!==requestKey};
}

function VintageControl({season,week,setSeason,setWeek,allWeeks=false,finalWeek=false,idPrefix="profile",weekLabel="MODEL WEEK"}:{season:number;week:number;setSeason:(value:number)=>void;setWeek:(value:number)=>void;allWeeks?:boolean;finalWeek?:boolean;idPrefix?:string;weekLabel?:string}) {
  return <div className="vintage-control">
    <div><label htmlFor={`season-${idPrefix}`}>SEASON</label><select id={`season-${idPrefix}`} value={season} onChange={(event)=>setSeason(Number(event.target.value))}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></div>
    <div><label htmlFor={`week-${idPrefix}`}>{weekLabel}</label><select id={`week-${idPrefix}`} value={week} onChange={(event)=>setWeek(Number(event.target.value))}>{allWeeks?<option value={0}>Full season</option>:null}{Array.from({length:17},(_,index)=><option key={index} value={index}>{finalWeek&&index===16?"Final · bowls + playoff":`Week ${index}`}</option>)}</select></div>
  </div>;
}

function latestProfile(team: TeamModel, requestedWeek: number): WeekProfile | null {
  for (let week = requestedWeek; week >= 0; week -= 1) {
    const profile = team.weeks[String(week)];
    if (profile) return profile;
  }
  return null;
}

function modelTeamProfileRow(team:TeamModel, season:number, week:number):DynamicProfileRow|null {
  const profile = latestProfile(team, week);
  if (!profile) return null;
  return {
    season,week,team:team.name,gamesPlayed:week,teamId:team.id,abbreviation:team.abbr,mascot:team.mascot,conference:team.conference,color:team.color,altColor:team.altColor,logo:team.logo,
    offYpp:baselines.ypp*profile.o[0],offYpa:baselines.ypa*profile.o[1],offYpc:baselines.ypc*profile.o[2],offPatt:baselines.patt*profile.o[3],offRatt:baselines.ratt*profile.o[4],
    defYpp:baselines.ypp*profile.d[0],defYpa:baselines.ypa*profile.d[1],defYpc:baselines.ypc*profile.d[2],defPatt:baselines.patt*profile.d[3],defRatt:baselines.ratt*profile.d[4],
    offYppIndex:profile.o[0],offYpaIndex:profile.o[1],offYpcIndex:profile.o[2],offPattIndex:profile.o[3],offRattIndex:profile.o[4],
    defYppIndex:profile.d[0],defYpaIndex:profile.d[1],defYpcIndex:profile.d[2],defPattIndex:profile.d[3],defRattIndex:profile.d[4],
    advancedProfile:profile.advanced,
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function oppositionProofLabel(reliability:number) {
  return reliability >= 0.82 ? "PROVEN" : reliability >= 0.66 ? "SOLID" : "STILL UNTESTED";
}

function projectMatchup(home: TeamModel, away: TeamModel, homeWeek: number, neutral: boolean, awayWeek = homeWeek, labels?:{home:string;away:string}) {
  const hp = latestProfile(home, homeWeek);
  const ap = latestProfile(away, awayWeek);
  if (!hp || !ap) return null;

  const all137Aligned = neutral && Boolean(home.finalContext) && Boolean(away.finalContext);
  const detailedProjection = projectMatchupEngine(
    { team:labels?.home ?? home.name,offense:hp.o,defense:hp.d,evidence:hp.evidence,advanced:hp.advanced,outcomeRating:home.rating },
    { team:labels?.away ?? away.name,offense:ap.o,defense:ap.d,evidence:ap.evidence,advanced:ap.advanced,outcomeRating:away.rating },
    neutral,
  );
  const coreInput = (profile:WeekProfile, includeAdvanced:boolean) => ({ offense:profile.o,defense:profile.d,evidence:profile.evidence,advanced:includeAdvanced?profile.advanced:null });
  const projection = detailedProjection;
  const neutralProjection = projectCalibratedMatchup(coreInput(hp,true),coreInput(ap,true),true,home.rating,away.rating);
  // Resume and opponent proof already enter the calibrated margin layer. A
  // second standalone resume adjustment would count the same signal twice.
  const resumeAdjustment = 0;
  const margin = projection.margin;
  const total = projection.modelTotal;
  const scoreCard = matchupScoreCard(projection);
  const homeScore = scoreCard.homeScore;
  const awayScore = scoreCard.awayScore;
  const venueAdjustment = projection.margin-neutralProjection.margin;
  const resultsAdjustment = neutralProjection.outcomeBlend*(neutralProjection.outcomeMargin-neutralProjection.statisticalMargin);
  const edgeAnalysis = detailedProjection.edgeAnalysis;
  return {
    homeScore,
    awayScore,
    margin,
    total,
    homeWin:projection.homeWinProbability,
    homeStats:detailedProjection.homeStats,
    awayStats:detailedProjection.awayStats,
    volatility:projection.volatility,
    homeEvidence:detailedProjection.calibratedHome.evidence,
    awayEvidence:detailedProjection.calibratedAway.evidence,
    homeAdvancedProfile:detailedProjection.calibratedHome.advanced,
    awayAdvancedProfile:detailedProjection.calibratedAway.advanced,
    components:{ efficiency:neutralProjection.statisticalMargin,results:resultsAdjustment,schedule:neutralProjection.proofAdjustment,resume:resumeAdjustment,venue:venueAdjustment },
    warnings:detailedProjection.warnings,
    all137Aligned,
    edgeAnalysis,
  };
}

function useMatchupMarket(enabled:boolean,season:number,profileWeek:number,homeTeam:string|undefined,awayTeam:string|undefined) {
  const [result,setResult]=useState<{key:string;row:ScheduleRow|null}>({key:"",row:null});
  const requestKey=enabled&&homeTeam&&awayTeam?`${season}:${profileWeek}:${homeTeam}:${awayTeam}`:"";
  useEffect(()=>{
    if(!requestKey||!homeTeam||!awayTeam) return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"schedule",season:String(season),week:"0",team:homeTeam});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response))
      .then((payload)=>{
        const candidates=(payload.rows??[]).filter((game)=>(game.homeTeam===homeTeam&&game.awayTeam===awayTeam)||(game.homeTeam===awayTeam&&game.awayTeam===homeTeam));
        const exact=candidates.find((game)=>game.generatedFromWeek===profileWeek);
        setResult({key:requestKey,row:exact??candidates.at(-1)??null});
      }).catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,row:null});});
    return ()=>controller.abort();
  },[awayTeam,homeTeam,profileWeek,requestKey,season]);
  return requestKey&&result.key===requestKey?result.row:null;
}

function isFcsTeam(name:string,conference?:string){
  const division=(conference??"").toLowerCase();
  if(/\bfcs\b|big sky|big south|colonial|\bcaa\b|ivy|meac|missouri valley|\bmvfc\b|northeast|\bnec\b|ohio valley|\bovc\b|patriot|pioneer|socon|southern|southland|swac|united athletic|\buac\b/.test(division))return true;
  if(conference)return false;
  return !teamMap.has(name);
}

function TeamMark({ name, size = "md", logo, genericLabel, variant = "primary" }: { name: string; size?: "sm" | "md" | "lg"; logo?: string; genericLabel?:string;variant?:TeamLogoVariant }) {
  const team = teamMap.get(name);
  const ranked = rankedMap.get(name);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const initials = genericLabel || team?.abbr || name.slice(0, 3).toUpperCase();
  const espnFallback = team?.id && /^\d+$/.test(team.id) ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png` : undefined;
  const suppliedLogo = resolveTeamLogoAsset(name,variant);
  const logoCandidates = [...new Set((genericLabel
    ? ["/fcs-logo.png"]
    : [suppliedLogo,logo,ranked?.logo,espnFallback,"/fcs-logo.png"]
  ).filter((source):source is string=>Boolean(source)))];
  const logoSource = logoCandidates.find((source)=>!failedSources.includes(source));
  const hasLogo = Boolean(logoSource);
  const usingFcsFallback = logoSource==="/fcs-logo.png";
  return (
    <span
      className={`team-mark team-mark-${size} ${hasLogo ? "has-logo" : "fallback-mark"} ${genericLabel||usingFcsFallback?"generic-fcs-mark":""}`}
      data-logo-variant={variant}
      style={hasLogo ? undefined : {
        background: genericLabel ? "#172019" : team?.color || "#334155",
        borderColor: genericLabel ? "#dce3d9" : team?.altColor || "#ffffff",
      }}
      aria-hidden="true"
    >
      {hasLogo ? <>{/* Remote school marks come from the season identity feed. */}<img src={logoSource} alt="" onError={() => setFailedSources((sources)=>sources.includes(logoSource!)?sources:[...sources,logoSource!])} /></> : <span>{initials}</span>}
    </span>
  );
}

function DisclosureControl() {
  return <span className="disclosure-control" aria-hidden="true"><i className="disclosure-show">EXPAND</i><i className="disclosure-hide">MINIMIZE</i><b>+</b></span>;
}

function ValidationSliceTable({title,rows,mode}:{title:string;rows:ValidationSlice[];mode:"errors"|"confidence"|"calibration"|"edges"}) {
  const headers=mode==="errors"?["GROUP","N","SPREAD MAE","TOTAL MAE","WIN RATE"]
    :mode==="confidence"?["CONFIDENCE","N","SPREAD MAE","WIN RATE","BRIER"]
      :mode==="calibration"?["WIN BUCKET","N","PREDICTED","ACTUAL","GAP"]
        :["EDGE","N","ATS HIT","O/U HIT","GATE"];
  const percent=(value:number|null|undefined)=>value===null||value===undefined?"—":`${(value*100).toFixed(1)}%`;
  const decimal=(value:number|null|undefined)=>value===null||value===undefined?"—":value.toFixed(2);
  return <article className="validation-slice-card"><span className="card-label">{title}</span><div className="validation-slice-table"><header>{headers.map((label)=><span key={label}>{label}</span>)}</header>{rows.map((row)=><p key={row.label}>
    <strong>{row.label}</strong><span>{row.count??0}</span>
    {mode==="errors"?<><span>{decimal(row.spreadMae)}</span><span>{decimal(row.totalMae)}</span><span>{percent(row.straightUp)}</span></>:null}
    {mode==="confidence"?<><span>{decimal(row.spreadMae)}</span><span>{percent(row.straightUp)}</span><span>{decimal(row.brier)}</span></>:null}
    {mode==="calibration"?<><span>{percent(row.predicted)}</span><span>{percent(row.actual)}</span><span>{row.predicted===null||row.predicted===undefined||row.actual===null||row.actual===undefined?"—":`${Math.abs(row.predicted-row.actual)*100<5?"CAL":"WATCH"} · ${(Math.abs(row.predicted-row.actual)*100).toFixed(1)}`}</span></>:null}
    {mode==="edges"?<><span>{percent(row.atsAccuracy)}</span><span>{percent(row.totalAccuracy)}</span><span>{row.label==="3–5"||row.label==="5+"?"REVIEW":"INFO"}</span></>:null}
  </p>)}</div></article>;
}

type PositionBattleId = "trenches" | "receivers" | "quarterback" | "backs";
type PositionBattleMetric = { label:string; value:string };
type PositionCoreStats = { ypp:number;ypa:number;ypc:number;patt:number;ratt:number };
type PositionBattle = {
  id:PositionBattleId;
  offenseLabel:string;
  defenseLabel:string;
  offenseGroup:string;
  defenseGroup:string;
  offenseCount:number;
  defenseCount:number;
  grade:number|null;
  verdict:string;
  source:"ADVANCED"|"CORE PROXY";
  metrics:PositionBattleMetric[];
};

function battleGrade(index:number|null|undefined) {
  if(index===null||index===undefined||!Number.isFinite(index)||index<=0) return null;
  return Math.round(Math.max(0,Math.min(100,50+90*Math.log(index))));
}

function battleNumber(value:number|null|undefined,digits=1,suffix="") {
  return value===null||value===undefined||!Number.isFinite(value)?"—":`${value.toFixed(digits)}${suffix}`;
}

function battlePercent(value:number|null|undefined) {
  return value===null||value===undefined||!Number.isFinite(value)?"—":`${(value*100).toFixed(0)}%`;
}

function battleTone(grade:number|null) {
  if(grade===null) return "unavailable";
  return grade>=58?"offense":grade<=42?"defense":"even";
}

function battleVerdict(id:PositionBattleId,grade:number|null) {
  if(grade===null) return "DATA BUILDING";
  const offense=grade>=58;
  const defense=grade<=42;
  if(id==="trenches") return offense?"RUN LANES FAVOR THE OFFENSE":defense?"THE DEFENSIVE FRONT CONTROLS THE LINE":"EVEN AT THE LINE";
  if(id==="receivers") return offense?"SEPARATION FAVORS THE TARGETS":defense?"THE SECONDARY SQUEEZES WINDOWS":"EVEN IN SPACE";
  if(id==="quarterback") return offense?"THE QB SHOULD STAY ON SCHEDULE":defense?"COVERAGE CAN FORCE LONG DOWNS":"QB AND COVERAGE ARE EVEN";
  return offense?"THE BACKS CAN REACH THE SECOND LEVEL":defense?"LINEBACKERS SHOULD CLOSE SPACE":"EVEN BEYOND THE LINE";
}

function buildPositionBattles(projection:AdvancedSideProjection|null|undefined,core:PositionCoreStats):PositionBattle[] {
  if(!projection) {
    const runIndex=core.ypc/Math.max(.01,baselines.ypc);
    const passIndex=core.ypa/Math.max(.01,baselines.ypa);
    const fallback:Array<Omit<PositionBattle,"grade"|"verdict"> & {index:number}>=[
      {
        id:"trenches",offenseLabel:"OL",defenseLabel:"DL",offenseGroup:"OFFENSIVE LINE",defenseGroup:"DEFENSIVE FRONT",offenseCount:5,defenseCount:4,index:runIndex,source:"CORE PROXY",
        metrics:[{label:"YPC",value:battleNumber(core.ypc,2)},{label:"RUSH ATT",value:battleNumber(core.ratt,1)},{label:"YPP",value:battleNumber(core.ypp,2)}],
      },
      {
        id:"receivers",offenseLabel:"WR / TE",defenseLabel:"CB / S",offenseGroup:"RECEIVERS",defenseGroup:"SECONDARY",offenseCount:4,defenseCount:5,index:passIndex,source:"CORE PROXY",
        metrics:[{label:"YPA",value:battleNumber(core.ypa,2)},{label:"PASS ATT",value:battleNumber(core.patt,1)},{label:"YPP",value:battleNumber(core.ypp,2)}],
      },
      {
        id:"quarterback",offenseLabel:"QB",defenseLabel:"SECONDARY",offenseGroup:"QB",defenseGroup:"SECONDARY",offenseCount:1,defenseCount:5,index:passIndex,source:"CORE PROXY",
        metrics:[{label:"YPA",value:battleNumber(core.ypa,2)},{label:"PASS ATT",value:battleNumber(core.patt,1)},{label:"YPP",value:battleNumber(core.ypp,2)}],
      },
      {
        id:"backs",offenseLabel:"RB",defenseLabel:"LB",offenseGroup:"BACKS",defenseGroup:"LINEBACKERS",offenseCount:2,defenseCount:3,index:runIndex,source:"CORE PROXY",
        metrics:[{label:"YPC",value:battleNumber(core.ypc,2)},{label:"RUSH ATT",value:battleNumber(core.ratt,1)},{label:"YPP",value:battleNumber(core.ypp,2)}],
      },
    ];
    return fallback.map((row)=>{
      const grade=battleGrade(row.index);
      return {...row,grade,verdict:battleVerdict(row.id,grade)};
    });
  }
  const rows:Array<Omit<PositionBattle,"grade"|"verdict"> & {index:number|null}>=[
    {
      id:"trenches",offenseLabel:"OL",defenseLabel:"DL",offenseGroup:"OFFENSIVE LINE",defenseGroup:"DEFENSIVE FRONT",offenseCount:5,defenseCount:4,index:projection.run.trenchIndex,source:"ADVANCED",
      metrics:[
        {label:"LINE YDS",value:battleNumber(projection.run.lineYards,2)},
        {label:"STUFFED",value:battlePercent(projection.run.stuffRate)},
        {label:"POWER",value:battlePercent(projection.run.powerSuccess)},
      ],
    },
    {
      id:"receivers",offenseLabel:"WR / TE",defenseLabel:"CB / S",offenseGroup:"RECEIVERS",defenseGroup:"SECONDARY",offenseCount:4,defenseCount:5,index:projection.pass.receiverSpaceIndex,source:"ADVANCED",
      metrics:[
        {label:"YDS / COMP",value:battleNumber(projection.pass.yardsPerCompletion,1)},
        {label:"PASS EXP",value:battleNumber(projection.pass.passingExplosiveness,2)},
        {label:"DB HAVOC",value:battlePercent(projection.overall.dbHavoc)},
      ],
    },
    {
      id:"quarterback",offenseLabel:"QB",defenseLabel:"SECONDARY",offenseGroup:"QB",defenseGroup:"SECONDARY",offenseCount:1,defenseCount:5,index:projection.pass.qbEfficiencyIndex,source:"ADVANCED",
      metrics:[
        {label:"COMP",value:battlePercent(projection.pass.completionRate)},
        {label:"YPA",value:battleNumber(projection.pass.adjustedYpa,2)},
        {label:"PASS SUCCESS",value:battlePercent(projection.pass.passingSuccessRate)},
      ],
    },
    {
      id:"backs",offenseLabel:"RB",defenseLabel:"LB",offenseGroup:"BACKS",defenseGroup:"LINEBACKERS",offenseCount:2,defenseCount:3,index:projection.run.secondLevelIndex,source:"ADVANCED",
      metrics:[
        {label:"YPC",value:battleNumber(projection.run.adjustedYpc,2)},
        {label:"BEYOND LINE",value:battleNumber(projection.run.yardsBeyondLine,2)},
        {label:"RUSH SUCCESS",value:battlePercent(projection.run.rushingSuccessRate)},
      ],
    },
  ];
  return rows.map((row)=>{
    const grade=battleGrade(row.index);
    return {...row,grade,verdict:battleVerdict(row.id,grade)};
  });
}

function positionUnitPlayers(model:TeamPlayerModel|undefined,group:string) {
  if(!model) return [];
  return [...model.players]
    .filter((player)=>player.positionGroup===group)
    .sort((left,right)=>
      Number(right.projectedStarter)-Number(left.projectedStarter)
      || ({HIGH:3,MEDIUM:2,ROSTER:1}[right.starterConfidence]-({HIGH:3,MEDIUM:2,ROSTER:1}[left.starterConfidence]))
      || right.impactScore-left.impactScore
    );
}

function averageUnitStars(players:PlayerProfile[]) {
  const rated=players
    .map((player)=>player.recruitingStars)
    .filter((stars):stars is number=>typeof stars==="number"&&stars>=1&&stars<=5);
  return {
    average:rated.length?rated.reduce((sum,stars)=>sum+stars,0)/rated.length:null,
    rated:rated.length,
    total:players.length,
  };
}

function positionUnitRatingSummary(model:TeamPlayerModel|undefined,group:string,starterCount:number) {
  const unit=positionUnitPlayers(model,group);
  const starters=unit.slice(0,starterCount);
  const starterIds=new Set(starters.map((player)=>player.id));
  const depth=unit.filter((player)=>!starterIds.has(player.id));
  return {
    starters:averageUnitStars(starters),
    depth:averageUnitStars(depth),
  };
}

function formatUnitStars(value:number|null) {
  return value===null?"NR":`${value.toFixed(2)}★`;
}

function PositionUnitRatings({team,model,group,count,label}:{team:TeamModel;model?:TeamPlayerModel;group:string;count:number;label:string}) {
  const summary=positionUnitRatingSummary(model,group,count);
  const palette=teamPuckPalette(team,"#545650");
  const teamName=team.name.replace(/^\d{4} /,"");
  return <section
    className="position-unit-ratings"
    aria-label={`${teamName} ${label} recruiting profile`}
    style={{"--unit-primary":palette.primary,"--unit-secondary":palette.secondary,"--unit-ink":palette.ink} as CSSProperties}
  >
    <header><span>{label}</span><small>{teamName}</small></header>
    <div>
      <article><small>STARTER AVG</small><strong>{formatUnitStars(summary.starters.average)}</strong><span>{summary.starters.rated}/{summary.starters.total} rated</span></article>
      <article><small>DEPTH AVG</small><strong>{formatUnitStars(summary.depth.average)}</strong><span>{summary.depth.rated}/{summary.depth.total} rated</span></article>
    </div>
  </section>;
}

function PositionBattleCard({
  offense,defense,battle,offensePlayers,defensePlayers,
}:{
  offense:TeamModel;defense:TeamModel;battle:PositionBattle;offensePlayers?:TeamPlayerModel;defensePlayers?:TeamPlayerModel;
}) {
  const tone=battleTone(battle.grade);
  const meterValue=battle.grade??50;
  const offenseName=offense.name.replace(/^\d{4} /,"");
  const defenseName=defense.name.replace(/^\d{4} /,"");
  return <article className={`position-battle-card ${tone}`} style={{"--battle-grade":`${meterValue}%`} as CSSProperties}>
    <header>
      <div><TeamMark name={offenseName} size="sm" logo={offense.logo}/><span><small>{offenseName}</small><b>{battle.offenseLabel}</b></span></div>
      <em>VS</em>
      <div><span><small>{defenseName}</small><b>{battle.defenseLabel}</b></span><TeamMark name={defenseName} size="sm" logo={defense.logo}/></div>
    </header>
    <div className="position-battle-score">
      <div className="position-battle-grade"><strong>{battle.grade??"—"}</strong><span>{tone==="offense"?`${offenseName} edge`:tone==="defense"?`${defenseName} edge`:"Even matchup"}</span></div>
      <div className="position-battle-meter"><span>DEF</span><i><b/></i><span>OFF</span></div>
      <p>{battle.verdict}</p>
    </div>
    <details className="position-battle-evidence">
      <summary><span>Ratings and evidence</span><b>{battle.source}</b></summary>
      <div className="position-personnel-compare">
        <PositionUnitRatings team={offense} model={offensePlayers} group={battle.offenseGroup} count={battle.offenseCount} label={battle.offenseLabel}/>
        <PositionUnitRatings team={defense} model={defensePlayers} group={battle.defenseGroup} count={battle.defenseCount} label={battle.defenseLabel}/>
      </div>
      <div className="position-battle-metrics">{battle.metrics.map((metric)=><span key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></span>)}</div>
    </details>
  </article>;
}

function PositionMatchupComparison({
  home,away,homeProjection,awayProjection,homeCore,awayCore,homePlayers,awayPlayers,
}:{
  home:TeamModel;away:TeamModel;homeProjection?:AdvancedSideProjection|null;awayProjection?:AdvancedSideProjection|null;
  homeCore:PositionCoreStats;awayCore:PositionCoreStats;
  homePlayers?:TeamPlayerModel;awayPlayers?:TeamPlayerModel;
}) {
  const homeBattles=buildPositionBattles(homeProjection,homeCore);
  const awayBattles=buildPositionBattles(awayProjection,awayCore);
  const labels:Record<PositionBattleId,{title:string;subtitle:string}> = {
    trenches:{title:"OL vs DL",subtitle:"LINE CONTROL"},
    receivers:{title:"WR / TE vs CB / S",subtitle:"SPACE + EXPLOSIVES"},
    quarterback:{title:"QB vs SECONDARY",subtitle:"DECISION + COVERAGE"},
    backs:{title:"RB vs LB",subtitle:"SECOND-LEVEL SPACE"},
  };
  return <section className="position-matchup-dashboard" aria-label="Position group matchup comparison">
    <header>
      <div><span>UNIT MATCHUPS</span><h2>Who controls each position group?</h2><p>Grades above 50 favor the offense. Grades below 50 favor the defense.</p></div>
      <div className="position-matchup-legend"><span>0</span><i/><b>50 · EVEN</b><i/><span>100</span></div>
    </header>
    <div className="position-battle-team-head">
      <div><TeamMark name={home.name.replace(/^\d{4} /,"")} size="sm" logo={home.logo}/><span><small>{home.name}</small><b>OFFENSE vs {away.name.replace(/^\d{4} /,"")} DEFENSE</b></span></div>
      <div><span><small>{away.name}</small><b>OFFENSE vs {home.name.replace(/^\d{4} /,"")} DEFENSE</b></span><TeamMark name={away.name.replace(/^\d{4} /,"")} size="sm" logo={away.logo}/></div>
    </div>
    <div className="position-battle-list">{homeBattles.map((homeBattle,index)=>{
      const awayBattle=awayBattles[index];
      const label=labels[homeBattle.id];
      return <section className="position-battle-row" key={homeBattle.id}>
        <div className="position-battle-label"><strong>{label.title}</strong><small>{label.subtitle}</small></div>
        <div className="position-battle-directions">
          <PositionBattleCard offense={home} defense={away} battle={homeBattle} offensePlayers={homePlayers} defensePlayers={awayPlayers}/>
          <PositionBattleCard offense={away} defense={home} battle={awayBattle} offensePlayers={awayPlayers} defensePlayers={homePlayers}/>
        </div>
      </section>;
    })}</div>
    <footer><b>EDGE SCALE</b><span>0 defense · 50 even · 100 offense</span><small>Matched transfer grades replace high-school grades; unrated players are excluded.</small></footer>
  </section>;
}

function MatchupAdvantageTile({card,offense,defense}:{card:MatchupAdvantageCard;offense:TeamModel;defense:TeamModel}) {
  const edgeLogo=card.edgeSide==="OFFENSE"?offense.logo:card.edgeSide==="DEFENSE"?defense.logo:undefined;
  const edgeName=card.edgeSide==="OFFENSE"?offense.name.replace(/^\d{4} /,""):card.edgeSide==="DEFENSE"?defense.name.replace(/^\d{4} /,""):"EVEN";
  return <article className={`intelligence-edge-card ${card.edgeSide.toLowerCase()}`} style={{"--edge-score":`${card.score}%`} as CSSProperties}>
    <header><span>{card.label}</span><b>{card.score}</b></header>
    <div className="intelligence-edge-meter" aria-label={`${card.label}: ${card.score} out of 100; zero favors the defense and 100 favors the offense`}><i/><em/></div>
    <div className="intelligence-edge-owner">{edgeLogo?<TeamMark name={edgeName} size="sm" logo={edgeLogo}/>:<span className="edge-even-mark">50</span>}<p><small>{card.edgeSide==="NEUTRAL"?"NO CLEAR CONTROL":`${card.edgeSide} EDGE`}</small><strong>{edgeName}</strong><em>{card.magnitude} · {card.confidence}</em></p></div>
    <p>{card.impact}</p>
    <footer>{card.drivers.slice(0,2).map((driver)=><span key={driver}>{driver}</span>)}</footer>
  </article>;
}

function MatchupIntelligencePanel({board,home,away,mode="summary"}:{board:MatchupIntelligenceBoard;home:TeamModel;away:TeamModel;mode?:"summary"|"advantages"}) {
  const visibleCards=[board.homeBiggestEdge,board.awayBiggestEdge];
  if(mode==="advantages") return <section className="football-intelligence-board intelligence-advantage-view">
    <header className="matchup-tab-panel-heading">
      <div><span>DERIVED MATCHUP EDGES</span><h2>Advantages</h2><p>Every grade combines the offense with the specific defense it faces. Zero favors the defense, 50 is even, and 100 favors the offense.</p></div>
      <aside><small>CONTROL</small><strong>{board.controlTeam??"BALANCED"}</strong><span>{board.gameShape} game</span></aside>
    </header>
    <div className="intelligence-advantage-matrix">
      <section><header><TeamMark name={home.name} size="sm" logo={home.logo}/><span><small>{home.name}</small><strong>OFFENSE vs {away.name} DEFENSE</strong></span></header>{board.homeCards.map((card)=><MatchupAdvantageTile key={card.id} card={card} offense={home} defense={away}/>)}</section>
      <section><header><TeamMark name={away.name} size="sm" logo={away.logo}/><span><small>{away.name}</small><strong>OFFENSE vs {home.name} DEFENSE</strong></span></header>{board.awayCards.map((card)=><MatchupAdvantageTile key={card.id} card={card} offense={away} defense={home}/>)}</section>
      {board.uncertainties.length?<aside><b>WHAT COULD MOVE THE READ</b>{board.uncertainties.map((uncertainty)=><span key={uncertainty}>{uncertainty}</span>)}</aside>:null}
    </div>
  </section>;
  return <section className="football-intelligence-board">
    <header className="football-intelligence-head">
      <div><span>FOOTBALL INTELLIGENCE</span><h2>Why the game projects this way</h2><p>{board.summary}</p></div>
      <aside><small>GAME SHAPE</small><strong>{board.gameShape}</strong><span>{board.gameShapeBenefit?`${board.gameShapeBenefit} benefits`:"No clear style beneficiary"}</span></aside>
    </header>
    <div className="style-clash-grid">
      <article>
        <div><TeamMark name={home.name} size="sm" logo={home.logo}/><span><small>{home.name} OFFENSE</small><strong>{board.homeIdentity.offense.label}</strong></span></div>
        <b>VS</b>
        <div><span><small>{away.name} DEFENSE</small><strong>{board.awayIdentity.defense.label}</strong></span><TeamMark name={away.name} size="sm" logo={away.logo}/></div>
      </article>
      <article>
        <div><TeamMark name={away.name} size="sm" logo={away.logo}/><span><small>{away.name} OFFENSE</small><strong>{board.awayIdentity.offense.label}</strong></span></div>
        <b>VS</b>
        <div><span><small>{home.name} DEFENSE</small><strong>{board.homeIdentity.defense.label}</strong></span><TeamMark name={home.name} size="sm" logo={home.logo}/></div>
      </article>
    </div>
    <div className="intelligence-control-strip">
      <span>SIDE THAT CONTROLS THE GAME</span>
      <strong>{board.controlTeam??"BALANCED"}</strong>
      <p>{board.controlReason}</p>
    </div>
    <div className="intelligence-primary-edges">{visibleCards.map((card)=><MatchupAdvantageTile
      key={`${card.offenseTeam}-${card.id}`}
      card={card}
      offense={card.offenseTeam===home.name?home:away}
      defense={card.defenseTeam===home.name?home:away}
    />)}</div>
  </section>;
}

type ComponentMetric = {
  key: AdvancedMetricKey;
  label: string;
  note: string;
  format: "yards" | "rate" | "index";
  projected: (side: AdvancedSideProjection) => number | null;
};

const rushingComponents: ComponentMetric[] = [
  { key:"lineYards",label:"Line yards / rush",note:"Initial push created by the offensive line",format:"yards",projected:(side)=>side.run.lineYards },
  { key:"stuffRate",label:"Stuff rate",note:"Runs stopped at or behind the line",format:"rate",projected:(side)=>side.run.stuffRate },
  { key:"powerSuccess",label:"Power success",note:"Short-yardage wins at the line",format:"rate",projected:(side)=>side.run.powerSuccess },
  { key:"secondLevelYards",label:"Second-level / rush",note:"Runs reaching and beating linebackers",format:"yards",projected:(side)=>side.run.secondLevelYards },
  { key:"openFieldYards",label:"Open-field / rush",note:"Big-play yards after clearing the box",format:"yards",projected:(side)=>side.run.openFieldYards },
  { key:"rushingSuccessRate",label:"Rush success rate",note:"Carries that keep the offense on schedule",format:"rate",projected:(side)=>side.run.rushingSuccessRate },
  { key:"rushingExplosiveness",label:"Rush explosiveness",note:"Ability to create chunk runs",format:"index",projected:(side)=>side.run.rushingExplosiveness },
  { key:"rushingPpa",label:"Rush PPA",note:"Scoring value created by each run",format:"index",projected:(side)=>side.run.rushingPpa },
];

const passingComponents: ComponentMetric[] = [
  { key:"completionRate",label:"Completion rate",note:"Accuracy against this coverage",format:"rate",projected:(side)=>side.pass.completionRate },
  { key:"yardsPerCompletion",label:"Yards / completion",note:"Big-play value when a pass is caught",format:"yards",projected:(side)=>side.pass.yardsPerCompletion },
  { key:"passingSuccessRate",label:"Pass success rate",note:"Throws that keep the offense on schedule",format:"rate",projected:(side)=>side.pass.passingSuccessRate },
  { key:"passingExplosiveness",label:"Pass explosiveness",note:"Ability to create chunk passes",format:"index",projected:(side)=>side.pass.passingExplosiveness },
  { key:"passingPpa",label:"Pass PPA",note:"Scoring value created by each pass",format:"index",projected:(side)=>side.pass.passingPpa },
  { key:"standardDownSuccessRate",label:"Standard-down success",note:"Efficiency before the defense expects a pass",format:"rate",projected:(side)=>side.pass.standardDownSuccessRate },
  { key:"standardDownExplosiveness",label:"Standard-down explosiveness",note:"Early-down shot-play ability",format:"index",projected:(side)=>side.pass.standardDownExplosiveness },
  { key:"passingDownSuccessRate",label:"Passing-down success",note:"Execution when the defense expects a throw",format:"rate",projected:(side)=>side.pass.passingDownSuccessRate },
  { key:"passingDownPpa",label:"Passing-down PPA",note:"Scoring value when a pass is expected",format:"index",projected:(side)=>side.pass.passingDownPpa },
];

const overallComponents: ComponentMetric[] = [
  {key:"yardsPerPlay",label:"Yards / play",note:"Total snap efficiency after opponent adjustment",format:"yards",projected:(side)=>side.overall.yardsPerPlay},
  {key:"successRate",label:"Overall success rate",note:"Ability to stay ahead of the chains",format:"rate",projected:(side)=>side.overall.successRate},
  {key:"ppa",label:"EPA/play (PPA)",note:"Expected scoring value created per snap",format:"index",projected:(side)=>side.overall.ppa},
  {key:"explosiveness",label:"Overall explosiveness",note:"Field-flipping value on successful plays",format:"index",projected:(side)=>side.overall.explosiveness},
  {key:"pointsPerDrive",label:"Points / drive",note:"Finishing-drives scoring proxy",format:"index",projected:(side)=>side.overall.pointsPerDrive},
  {key:"havocRate",label:"Havoc rate",note:"Negative-play and takeaway pressure",format:"rate",projected:(side)=>side.overall.havocRate},
  {key:"frontSevenHavoc",label:"Front-seven havoc",note:"Pressure and disruption near the line",format:"rate",projected:(side)=>side.overall.frontSevenHavoc},
  {key:"thirdDownSuccessRate",label:"Late-down success",note:"Passing-down proxy for third-down survival",format:"rate",projected:(side)=>side.overall.thirdDownSuccessRate},
  {key:"fieldPosition",label:"Starting field position",note:"Special-teams and hidden-yards proxy",format:"yards",projected:(side)=>side.specialTeams.fieldPosition},
];

function formatComponentValue(value:number|null, format:ComponentMetric["format"]) {
  return value === null || !Number.isFinite(value) ? "—" : format === "rate" ? `${(value*100).toFixed(1)}%` : value.toFixed(2);
}

function formatComponentIndex(value:number|null) {
  return value === null || !Number.isFinite(value) ? "—" : `${(value*100).toFixed(0)}%`;
}

function ComponentMatchupPanel({ offense, defense, projection, offenseProfile, defenseProfile }: { offense:TeamModel;defense:TeamModel;projection:AdvancedSideProjection;offenseProfile:AdvancedProfile;defenseProfile:AdvancedProfile }) {
  return <article className="component-matchup-panel">
    <header><div><TeamMark name={offense.name} size="sm" logo={offense.logo} /><span><strong>{offense.name} offense</strong><small>vs {defense.name} defense</small></span></div><b>{projection.run.adjustedYpc.toFixed(2)} YPC · {projection.pass.adjustedYpa.toFixed(2)} YPA</b></header>
    <div className="component-table-head"><span>COMPONENT</span><span>PROJ</span><span>OFF %</span><span>DEF ALLOW %</span></div>
    <h4>GAME CONTROL · DRIVE EFFICIENCY</h4>
    {overallComponents.map((metric)=><div className="component-row" key={metric.key}><span><strong><StatLabel label={metric.label} /></strong><small>{metric.note}</small></span><b>{formatComponentValue(metric.projected(projection),metric.format)}</b><em className={(offenseProfile.offense.index[metric.key] ?? 1)>=1?"positive":"negative"}>{formatComponentIndex(offenseProfile.offense.index[metric.key])}</em><em className={(defenseProfile.defense.index[metric.key] ?? 1)<=1?"positive":"negative"}>{formatComponentIndex(defenseProfile.defense.index[metric.key])}</em></div>)}
    <h4>RUSHING · LINE TO OPEN FIELD</h4>
    {rushingComponents.map((metric)=><div className="component-row" key={metric.key}><span><strong><StatLabel label={metric.label} /></strong><small>{metric.note}</small></span><b>{formatComponentValue(metric.projected(projection),metric.format)}</b><em className={(offenseProfile.offense.index[metric.key] ?? 1)>=1?"positive":"negative"}>{formatComponentIndex(offenseProfile.offense.index[metric.key])}</em><em className={(defenseProfile.defense.index[metric.key] ?? 1)<=1?"positive":"negative"}>{formatComponentIndex(defenseProfile.defense.index[metric.key])}</em></div>)}
    <div className="component-final"><span>Expected rushing result</span><strong>{projection.run.adjustedYpc.toFixed(2)} YPC</strong><small>{projection.run.adjustment===1?"Season form carries into this matchup":`${projection.run.adjustment>1?"Better":"Tougher"} than the season average by ${Math.abs((projection.run.adjustment-1)*100).toFixed(1)}%`}</small></div>
    <h4>PASSING · ACCURACY TO EXPLOSIVES</h4>
    {passingComponents.map((metric)=><div className="component-row" key={metric.key}><span><strong><StatLabel label={metric.label} /></strong><small>{metric.note}</small></span><b>{formatComponentValue(metric.projected(projection),metric.format)}</b><em className={(offenseProfile.offense.index[metric.key] ?? 1)>=1?"positive":"negative"}>{formatComponentIndex(offenseProfile.offense.index[metric.key])}</em><em className={(defenseProfile.defense.index[metric.key] ?? 1)<=1?"positive":"negative"}>{formatComponentIndex(defenseProfile.defense.index[metric.key])}</em></div>)}
    <div className="component-final"><span>Expected passing result</span><strong>{projection.pass.adjustedYpa.toFixed(2)} YPA</strong><small>{projection.pass.adjustment===1?"Season form carries into this matchup":`${projection.pass.adjustment>1?"Better":"Tougher"} than the season average by ${Math.abs((projection.pass.adjustment-1)*100).toFixed(1)}%`}</small></div>
  </article>;
}

function AdvancedMatchupCard({
  home, away, homeProjection, awayProjection, homeProfile, awayProfile, schematicReads,
}: {
  home: TeamModel; away: TeamModel; homeProjection: AdvancedSideProjection; awayProjection: AdvancedSideProjection;
  homeProfile: AdvancedProfile; awayProfile: AdvancedProfile;
  schematicReads: MatchupEdgeAnalysis["schematicReads"];
}) {
  return <section className="advanced-matchup-card matchup-tab-surface" aria-label="Advanced Matchup Metrics" data-description="Opponent-adjusted advanced matchup evidence">
    <header className="matchup-tab-panel-heading"><div><span>ADVANCED METRICS</span><h2>Full matchup evidence</h2><p>{home.name}: {homeProjection.run.adjustedYpc.toFixed(1)} YPC · {homeProjection.pass.adjustedYpa.toFixed(1)} YPA · {away.name}: {awayProjection.run.adjustedYpc.toFixed(1)} YPC · {awayProjection.pass.adjustedYpa.toFixed(1)} YPA</p></div></header>
    <div className="analysis-disclosure-body matchup-tab-body">
      <div className="advanced-matchup-grid"><ComponentMatchupPanel offense={home} defense={away} projection={homeProjection} offenseProfile={homeProfile} defenseProfile={awayProfile} /><ComponentMatchupPanel offense={away} defense={home} projection={awayProjection} offenseProfile={awayProfile} defenseProfile={homeProfile} /></div>
      {schematicReads.length ? <div className="schematic-xray">
        <div className="schematic-xray-heading"><span>PASSING GAME PLAN</span><strong>How each offense matches the coverage it will face</strong></div>
        <div className="schematic-xray-grid">{schematicReads.map((read) => <article className={`schematic-read ${read.edgeTeam ? "has-edge" : "balanced"}`} key={`${read.offenseTeam}-${read.defenseTeam}`}>
          <div><span>{read.offenseTeam} OFFENSE</span><b>{read.offenseStyle}</b></div>
          <div><span>{read.defenseTeam} DEFENSE</span><b>{read.defenseStyle}</b></div>
          <h4>{read.headline}</h4>
          <p>{read.detail}</p>
          <footer><strong>{read.projectedYpa.toFixed(2)} YPA</strong><span>{read.projectedCompletionRate === null ? "COMP —" : `${(read.projectedCompletionRate * 100).toFixed(1)}% COMP`}</span><span>{read.projectedYardsPerCompletion === null ? "Y/C —" : `${read.projectedYardsPerCompletion.toFixed(1)} Y/C`}</span></footer>
        </article>)}</div>
      </div> : null}
    </div>
  </section>;
}

function teamProfile(team:TeamModel) {
  return Object.entries(team.weeks).sort((a,b)=>Number(b[0])-Number(a[0]))[0]?.[1];
}

function PlayArt({formation,play,id}:{formation:FormationId;play:PlayArtId;id:string}) {
  const diagram = buildPlayDiagram(formation,play);
  const markerFor = (kind:DiagramPathKind) => kind === "block" ? `url(#block-${id})` : `url(#${kind}-${id})`;
  return <svg className={`play-art play-${play}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      {(["primary","route","ball","action"] as const).map((kind)=><marker key={kind} id={`${kind}-${id}`} markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" /></marker>)}
      <marker id={`block-${id}`} markerWidth="5" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M1,0 L1,8" /></marker>
    </defs>
    {diagram.paths.map((path,index)=><g key={`${path.kind}-${index}`}>
      <path d={path.d} className={`chalk-ghost ${path.kind}`} transform="translate(.16 .12)" />
      <path d={path.d} className={`diagram-path ${path.kind}`} markerEnd={markerFor(path.kind)} />
    </g>)}
    {diagram.read?<g className="diagram-read"><circle cx={diagram.read.x} cy={diagram.read.y} r="3.2"/><text x={diagram.read.x} y={diagram.read.y+.8}>{diagram.read.label}</text></g>:null}
  </svg>;
}

function HeatZone({zone,placement}:{zone:TacticalZone;placement:string}) {
  return <div className={`field-heat-zone ${placement} ${zone.tone}`} aria-hidden="true" />;
}

function BroadcastStats({rows,limit=2}:{rows:BroadcastMetric[];limit?:number}) {
  return <div className="broadcast-stat-row">{rows.slice(0,limit).map((row)=><span className={row.tone} key={`${row.label}-${row.value}`}>
    <small>{row.label}</small><b className="broadcast-owner">{row.tone==="advantage"?"OFFENSE EDGE":row.tone==="warning"?"DEFENSE EDGE":"EVEN"}</b><strong>{row.value}</strong><em>{row.comparison}</em>
  </span>)}</div>;
}

function CoordinatorScoutingSheet({plan,offenseTeam,defenseTeam}:{plan:ReturnType<typeof buildTacticalPlan>;offenseTeam:string;defenseTeam:string}) {
  const report=plan.coordinator;
  if(!report) return null;
  return <section className="coordinator-scout-sheet" aria-label="Coordinator scouting report">
    <div className="coordinator-role-strip">
      <span className="offense-role"><b>OFFENSE</b><strong>{offenseTeam}</strong></span>
      <i>ATTACKS</i>
      <span className="defense-role"><b>DEFENSE</b><strong>{defenseTeam}</strong></span>
    </div>
    <header>
      <div><span>PLAY-STYLE FINGERPRINT</span><strong>{report.identity.label}</strong><small>{report.identity.personnel} · {report.identity.coreConcepts.join(" / ")}</small></div>
      <BroadcastStats rows={report.identity.broadcastStats} limit={3}/>
    </header>
    <div className="coordinator-scout-grid">
      <article className={`pressure-threat threat-${report.pressure.threat.toLowerCase()}`}>
        <div><span>DEFENSE PLAN · PASS RUSH</span><b>{report.pressure.grade}</b></div>
        <h4>{report.pressure.threat} · {report.pressure.defensivePlan}</h4>
        <p><strong>OFFENSE COUNTER</strong>{report.pressure.protectionCall}</p>
        <BroadcastStats rows={report.pressure.broadcastStats}/>
      </article>
      <article>
        <div><span>DEFENSE PLAN · COVERAGE</span><b>DB</b></div>
        <h4>{report.coverage.shell}</h4>
        <p><strong>OFFENSE COUNTER</strong>{report.coverage.attack}</p>
        <BroadcastStats rows={report.coverage.broadcastStats}/>
      </article>
      <article>
        <div><span>DEFENSE PLAN · RUN FIT</span><b>BOX</b></div>
        <h4>{report.front.structure}</h4>
        <p><strong>OFFENSE COUNTER</strong>{report.front.runAnswer}</p>
        <BroadcastStats rows={report.front.broadcastStats}/>
      </article>
    </div>
    <details className="coordinator-call-detail">
      <summary><span>OFFENSE COUNTERS</span><strong>Answers to the defensive plan by situation</strong><b>+</b></summary>
      <div className="coordinator-hidden-answers">
        <article><span>OFFENSE · HOT ANSWER</span><strong>{report.pressure.hotAnswer}</strong></article>
        <article><span>DEFENSE · LEVERAGE</span><strong>{report.coverage.leverage} · Key: {report.coverage.conflictDefender}</strong></article>
        <article><span>OFFENSE · RUN COUNTER</span><strong>{report.front.fit}</strong></article>
      </div>
      <div className="situation-call-sheet">
        <article><span>OFFENSE · EARLY DOWN</span><strong>{report.situations.earlyDown}</strong></article>
        <article><span>OFFENSE · PASSING DOWN</span><strong>{report.situations.passingDown}</strong></article>
        <article><span>OFFENSE · THIRD DOWN</span><strong>{report.situations.thirdDown}</strong></article>
        <article><span>OFFENSE · RED ZONE</span><strong>{report.situations.redZone}</strong></article>
      </div>
      <small className="coordinator-data-note">{report.dataNote}</small>
    </details>
  </section>;
}

function chalkColorDistance(first:string|undefined,second:string|undefined) {
  const rgb=(value:string|undefined)=>{const clean=(value||"").replace("#","");if(!/^[0-9a-f]{6}$/i.test(clean))return [80,80,80];return [0,2,4].map((index)=>parseInt(clean.slice(index,index+2),16));};
  const left=rgb(first),right=rgb(second);
  return Math.sqrt(left.reduce((sum,value,index)=>sum+(value-right[index])**2,0));
}

function chalkContrastFallback(color:string) {
  return ["#e6c66f","#76bfd2","#eee8d3","#283a34"].sort((left,right)=>chalkColorDistance(color,right)-chalkColorDistance(color,left))[0];
}

function chalkInk(color:string) {
  const clean=color.replace("#","");
  if(!/^[0-9a-f]{6}$/i.test(clean)) return "#f4f0df";
  const [red,green,blue]=[0,2,4].map((index)=>parseInt(clean.slice(index,index+2),16));
  return .299*red+.587*green+.114*blue>155?"#102018":"#f4f0df";
}

function normalizeTeamColor(color:string|undefined,fallback:string) {
  const clean=(color||"").replace("#","");
  return /^[0-9a-f]{6}$/i.test(clean)?`#${clean}`:fallback;
}

function teamPuckPalette(team:TeamModel,fallback:string) {
  const primary=normalizeTeamColor(team.color,fallback);
  const alternate=normalizeTeamColor(team.altColor,"#f4f0df");
  const secondary=chalkColorDistance(primary,alternate)>=58?alternate:chalkContrastFallback(primary);
  return {primary,secondary,ink:chalkInk(primary)};
}

function TacticalPuck({team,side,starter,x,y,tokenClass}:{
  team:TeamModel;
  side:"offense"|"defense";
  starter?:FormationPlayer|null;
  x:number;
  y:number;
  tokenClass:"home-token"|"away-token";
}) {
  const jersey=starter?.jersey===null||starter?.jersey===undefined?"—":String(starter.jersey);
  const recruiting=playerRecruitingLabel(starter?.profile);
  const ratingSource=starter?.profile ? playerRatingSourceLabel(starter.profile).toLowerCase() : "no published recruiting grade";
  const teamName=team.name.replace(/^\d{4} /,"");
  return <span
    className={`chalk-player team-puck ${side}-marker ${tokenClass} ${starter?"starter-player":""}`}
    style={{left:`${x}%`,top:`${y}%`}}
    aria-label={`${team.name} ${side} player · number ${jersey} · ${recruiting} · ${ratingSource} · model-projected starter`}
  >
    <span className="puck-school-mark" aria-hidden="true"><TeamMark name={teamName} size="sm" logo={team.logo} /></span>
    <span className="puck-jersey" aria-hidden="true">{jersey}</span>
    <span className="puck-stars" aria-hidden="true">{recruiting}</span>
  </span>;
}

function TacticalField({ offense,defense,offenseIsHome,analysis,offensePlayers,defensePlayers }:{
  offense:TeamModel;defense:TeamModel;offenseIsHome:boolean;analysis:MatchupEdgeAnalysis;
  offensePlayers?:TeamPlayerModel;defensePlayers?:TeamPlayerModel;
}) {
  const offenseLabel = offense.name;
  const defenseLabel = defense.name;
  const profile = teamProfile(offense);
  if (!profile) return null;
  const plan = buildTacticalPlan({offenseTeam:offenseLabel,defenseTeam:defenseLabel,offense:profile.o,offenseIsHome,analysis});
  const zone = (id:TacticalZone["id"]) => plan.zones.find((row)=>row.id===id)!;
  const fieldId = `${offenseIsHome?"home":"away"}-${plan.play}-${offense.name.replace(/[^a-z0-9]/gi,"")}`;
  const offensePalette=teamPuckPalette(offense,"#4f4f4f");
  const defensePalette=teamPuckPalette(defense,"#8a8a8a");
  const offenseDiagram=offenseFormations[plan.formation];
  const defenseDiagram=defenseFormations[plan.formation];
  const projectedOffense=assignFormationPlayers(offensePlayers,"offense",offenseDiagram.map((player)=>player.role));
  const projectedDefense=assignFormationPlayers(defensePlayers,"defense",defenseDiagram.map((player)=>player.role));
  const attackingPersonnel=matchupPersonnel(offensePlayers,plan.primary.id,"offense",2);
  const defendingPersonnel=matchupPersonnel(defensePlayers,plan.primary.id,"defense",2);
  const playerCall=attackingPersonnel.length||defendingPersonnel.length
    ? plan.primary.score>=0
      ? `${attackingPersonnel.map(playerDisplayLabel).join(" + ")} drive the ${plan.primary.label.toLowerCase()} edge${defendingPersonnel[0]?`; ${playerDisplayLabel(defendingPersonnel[0])} is the defense's best answer`:""}.`
      : `${defendingPersonnel.map(playerDisplayLabel).join(" + ")} close the ${plan.primary.label.toLowerCase()} window${attackingPersonnel[0]?`; ${playerDisplayLabel(attackingPersonnel[0])} must create the counter`:""}.`
    : "";
  return <article className="tactical-field-card" aria-label={`${offenseLabel} offense against ${defenseLabel} defense`} style={{
    "--offense-color":offensePalette.primary,
    "--offense-primary":offensePalette.primary,
    "--offense-secondary":offensePalette.secondary,
    "--offense-ink":offensePalette.ink,
    "--defense-color":defensePalette.primary,
    "--defense-primary":defensePalette.primary,
    "--defense-secondary":defensePalette.secondary,
    "--defense-ink":defensePalette.ink,
  } as CSSProperties}>
    <header><div><TeamMark name={offense.name.replace(/^\d{4} /,"")} size="sm" logo={offense.logo} /><span><i>{offenseIsHome?"HOME":"AWAY"}</i><b>{offenseLabel} OFFENSE</b><small>{plan.formationLabel} · {(plan.passRate*100).toFixed(0)}% projected pass</small></span></div><em>VS</em><div><span><i>{offenseIsHome?"AWAY":"HOME"}</i><b>{defenseLabel} DEFENSE</b><small>{plan.defensiveLook}</small></span><TeamMark name={defense.name.replace(/^\d{4} /,"")} size="sm" logo={defense.logo} /></div></header>
    <div className="tactical-play-call"><div><span>OFFENSE CALL {plan.importance?`· ${plan.importance.toUpperCase()}`:""}</span><strong>{plan.playName}</strong>{plan.analystCall?<small>{plan.analystCall} · {plan.confidence} confidence</small>:null}</div><div className="diagram-legend"><span className="attacking-direction">↑ OFFENSE</span><span><i className="primary"/>First read</span><span><i className="route"/>Route</span><span><i className="block"/>Block</span><span><i className="action"/>Fake / read</span></div></div>
    <div className="chalk-field">
      <HeatZone zone={zone("deep")} placement="heat-deep" />
      <HeatZone zone={zone("quick")} placement="heat-quick" />
      <HeatZone zone={zone("edge")} placement="heat-edge-left" />
      <HeatZone zone={zone("edge")} placement="heat-edge-right" />
      <HeatZone zone={zone("interior")} placement="heat-interior" />
      <div className="line-of-scrimmage"><span>LINE OF SCRIMMAGE</span></div>
      <PlayArt formation={plan.formation} play={plan.play} id={fieldId} />
      {defenseDiagram.map((player,index)=>{
        const starter=projectedDefense[index];
        return <TacticalPuck key={`d-${index}`} team={defense} side="defense" starter={starter} x={player.x} y={player.y} tokenClass={offenseIsHome?"away-token":"home-token"} />;
      })}
      {offenseDiagram.map((player,index)=>{
        const starter=projectedOffense[index];
        return <TacticalPuck key={`o-${index}`} team={offense} side="offense" starter={starter} x={player.x} y={player.y} tokenClass={offenseIsHome?"home-token":"away-token"} />;
      })}
    </div>
    <div className="tactical-zone-strip" aria-label={`${offenseLabel} matchup grades`}>{plan.zones.map((matchupZone)=><article className={matchupZone.tone} key={matchupZone.id}><span>{matchupZone.label}</span><b>{matchupZone.grade}</b><small>{matchupZone.verdict}</small></article>)}</div>
    {playerCall?<div className="player-matchup-call"><span>KEY PERSONNEL</span><strong>{playerCall}</strong></div>:null}
    <CoordinatorScoutingSheet plan={plan} offenseTeam={offenseLabel} defenseTeam={defenseLabel}/>
    <footer className="tactical-call-sheet"><article className="primary-call"><span>ATTACK FIRST</span><strong>{plan.primary.label} · {plan.primary.verdict}</strong><small>{plan.coachingPoint}</small></article><article><span>OFFENSIVE IDENTITY</span><strong>{plan.formationLabel}</strong><small>{plan.personnel} · {plan.identity}</small></article><article className={plan.danger.tone}><span>DEFENSE&apos;S BEST ANSWER</span><strong>{plan.danger.label} · {plan.danger.verdict}</strong><small>{plan.danger.note}</small></article>{plan.riskIfIgnored?<article className="failure-call"><span>IF IGNORED</span><strong>THE FAILURE MODE</strong><small>{plan.riskIfIgnored}</small></article>:null}</footer>
  </article>;
}

function MatchupTacticalBoard({ home,away,analysis,homePlayers,awayPlayers }:{home:TeamModel;away:TeamModel;analysis:MatchupEdgeAnalysis;homePlayers?:TeamPlayerModel;awayPlayers?:TeamPlayerModel}) {
  const homeProfile = teamProfile(home);
  const awayProfile = teamProfile(away);
  const homePlan = homeProfile ? buildTacticalPlan({offenseTeam:home.name,defenseTeam:away.name,offense:homeProfile.o,offenseIsHome:true,analysis}) : null;
  const awayPlan = awayProfile ? buildTacticalPlan({offenseTeam:away.name,defenseTeam:home.name,offense:awayProfile.o,offenseIsHome:false,analysis}) : null;
  return <section className="matchup-tactical-board matchup-tab-surface playbook-detail" aria-label="H+ Coordinator View" data-description="Formation, play call and the grass each offense should attack">
    <header className="matchup-tab-panel-heading">
      <div><span>COORDINATOR BOARD</span><h2>Playbook</h2><p>{home.name.replace(/^\d{4} /,"")}: {homePlan ? `${homePlan.primary.label} ${homePlan.primary.grade}` : "profile unavailable"} · {away.name.replace(/^\d{4} /,"")}: {awayPlan ? `${awayPlan.primary.label} ${awayPlan.primary.grade}` : "profile unavailable"}</p></div>
    </header>
    <div className="analysis-disclosure-body matchup-tab-body">
      <div className="playboard-expanded-key"><div className="playboard-key"><b>HOME · {home.name} &nbsp; / &nbsp; AWAY · {away.name}</b><div className="matchup-color-scale"><span>DEFENSE</span><i /><span>EVEN</span><i /><span>OFFENSE</span></div></div></div>
      <div className="tactical-field-grid">
        <TacticalField offense={home} defense={away} offenseIsHome analysis={analysis} offensePlayers={homePlayers} defensePlayers={awayPlayers} />
        <TacticalField offense={away} defense={home} offenseIsHome={false} analysis={analysis} offensePlayers={awayPlayers} defensePlayers={homePlayers} />
      </div>
      <p>Each grade is this offense against this defense. Green favors the offense, yellow is close, and red favors the defense. Open the situational call sheet only when deeper detail is needed.</p>
    </div>
  </section>;
}

type ProjectedMatchup = NonNullable<ReturnType<typeof projectMatchup>>;
function CrossEraLogicCard({home,away,projection,neutral}:{home:TeamModel;away:TeamModel;projection:ProjectedMatchup;neutral:boolean}) {
  const edgeLabel = (value:number) => Math.abs(value)<0.05?"EVEN":`${value>0?home.name:away.name} +${Math.abs(value).toFixed(1)}`;
  const components = [
    ["ON-FIELD PROFILE",projection.components.efficiency,"Per-play offense and defense after opponent adjustment"],
    ["FINAL RESULTS / ELO",projection.components.results,"What the completed results network adds beyond raw efficiency"],
    ["SCHEDULE PROOF",projection.components.schedule,"Quality opponents and verified wins"],
    ["TITLE RÉSUMÉ",projection.components.resume,"Final record, postseason résumé and championship context"],
    ["GAME SITE",projection.components.venue,neutral?"Neutral field — the All137 standard":"Home-field adjustment"],
  ] as const;
  const bothFinal = Boolean(home.finalContext&&away.finalContext);
  const receiptStatus = projection.all137Aligned
    ? "Final snapshots + neutral site · All137 aligned"
    : bothFinal&&!neutral
      ? "Final profiles loaded · home field active"
      : "Weekly/final profile comparison";
  return <section className={`cross-era-logic matchup-tab-surface ${projection.all137Aligned?"aligned":"not-aligned"}`} data-surface="Cross-era score receipt" data-model-path="All137 scoring path">
    <header className="matchup-tab-panel-heading"><div><span>CROSS-ERA</span><h2>Score receipt</h2><p>{receiptStatus}</p></div><aside><small>MODEL EDGE</small><strong>{edgeLabel(projection.margin)}</strong></aside></header>
    <div className="analysis-disclosure-body matchup-tab-body">
      <div className="cross-era-team-strip"><div><TeamMark name={home.name.replace(/^\d{4} /,"")} size="sm" logo={home.logo}/><span><b>{home.name}</b><small>{home.seasonRecord??"Weekly snapshot"}{home.nationalChampion?" · NATIONAL CHAMPION":""}</small></span></div><em>VS</em><div><span><b>{away.name}</b><small>{away.seasonRecord??"Weekly snapshot"}{away.nationalChampion?" · NATIONAL CHAMPION":""}</small></span><TeamMark name={away.name.replace(/^\d{4} /,"")} size="sm" logo={away.logo}/></div></div>
      <div className="score-receipt-grid">{components.map(([label,value,note])=><article key={label}><span>{label}</span><b>{edgeLabel(value)}</b><small>{note}</small></article>)}</div>
      <p>{projection.all137Aligned
        ? "FINAL snapshots + neutral site are active. Matchup Engine v2.1 uses the same final efficiency, offensive-viability, schedule-proof and résumé inputs that feed the Every Season field."
        : bothFinal&&!neutral
          ? "Both final résumés are loaded, but home field is active. Turn on Neutral site to reproduce the Every Season matchup exactly."
          : "Choose Final · bowls + playoff for both teams and use a neutral site to reproduce their Every Season result exactly. Weekly snapshots intentionally use only information available at that point in the season."}</p>
    </div>
  </section>;
}

function MatchupStatProfilePanel({
  home,away,projection,season,awaySeason,week,awayWeek,
}:{
  home:TeamModel;away:TeamModel;projection:ProjectedMatchup;season:number;awaySeason:number;week:number;awayWeek:number;
}) {
  return <section className="matchup-data-disclosure matchup-tab-surface" data-surface="Projected stat profile" data-engine="Cross-era profile engine">
    <header className="matchup-tab-panel-heading"><div><span>TEAM DATA</span><h2>Stat profile</h2><p>{home.name}: {projection.homeStats.ypp.toFixed(1)} YPP · {away.name}: {projection.awayStats.ypp.toFixed(1)} YPP</p></div></header>
    <div className="analysis-disclosure-body matchup-tab-body">
      <div className="matchup-data-grid">
        <div className="stat-comparison">
          <div className="comparison-head"><span>{home.abbr}</span><b>PROJECTED PROFILE</b><span>{away.abbr}</span></div>
          {[["Yards / Play", projection.homeStats.ypp, projection.awayStats.ypp], ["Yards / Pass", projection.homeStats.ypa, projection.awayStats.ypa], ["Yards / Rush", projection.homeStats.ypc, projection.awayStats.ypc], ["Pass Attempts", projection.homeStats.patt, projection.awayStats.patt], ["Rush Attempts", projection.homeStats.ratt, projection.awayStats.ratt]].map(([label, homeValue, awayValue]) => <div className="comparison-row" key={String(label)}><strong>{Number(homeValue).toFixed(1)}</strong><span><StatLabel label={String(label)} /></span><strong>{Number(awayValue).toFixed(1)}</strong></div>)}
        </div>
        <div className="allowance-card">
          <div className="comparison-head"><span>{home.abbr}</span><b>OPPONENT OUTPUT ALLOWED</b><span>{away.abbr}</span></div>
          {[["Yards / Play", latestProfile(home, week)?.d[0], latestProfile(away, awayWeek)?.d[0]], ["Yards / Pass", latestProfile(home, week)?.d[1], latestProfile(away, awayWeek)?.d[1]], ["Yards / Rush", latestProfile(home, week)?.d[2], latestProfile(away, awayWeek)?.d[2]], ["Pass Attempts", latestProfile(home, week)?.d[3], latestProfile(away, awayWeek)?.d[3]], ["Rush Attempts", latestProfile(home, week)?.d[4], latestProfile(away, awayWeek)?.d[4]]].map(([label, homeValue, awayValue]) => <div className="comparison-row allowance-row" key={String(label)}><strong>{homeValue === undefined ? "—" : `${(Number(homeValue) * 100).toFixed(0)}%`}</strong><span><StatLabel label={String(label)} explanation={`How much ${String(label).toLowerCase()} this defense allows compared with an average FBS defense after accounting for its opponents. A value of 85% means it allows 15% less than average, so lower is better.`} /></span><strong>{awayValue === undefined ? "—" : `${(Number(awayValue) * 100).toFixed(0)}%`}</strong></div>)}
          <p className="allowance-note">100% is an average FBS defense. Lower is better: 82% means the defense gives up 18% less production than average after accounting for the offenses it faced.</p>
        </div>
        <p className="model-note"><strong>QUALITY OF OPPOSITION · {season} {home.abbr} {oppositionProofLabel(projection.homeEvidence.reliability)} · {awaySeason} {away.abbr} {oppositionProofLabel(projection.awayEvidence.reliability)}</strong><br />Production proven against strong opponents carries more weight. Big numbers built against lighter schedules are treated more cautiously when the team steps up in competition.</p>
      </div>
    </div>
  </section>;
}

type ProfileNumberKey = keyof Pick<DynamicProfileRow,
  "offYpp"|"offYpa"|"offYpc"|"offPatt"|"offRatt"|"defYpp"|"defYpa"|"defYpc"|"defPatt"|"defRatt"|
  "offYppIndex"|"offYpaIndex"|"offYpcIndex"|"offPattIndex"|"offRattIndex"|"defYppIndex"|"defYpaIndex"|"defYpcIndex"|"defPattIndex"|"defRattIndex">;

const teamMetricDefinitions:Array<{label:string;description:string;digits:number;offRaw:ProfileNumberKey;offIndex:ProfileNumberKey;defRaw:ProfileNumberKey;defIndex:ProfileNumberKey}> = [
  {label:"Yards / play",description:"Average yards gained or allowed on every snap. Six yards per play equals 600 yards over 100 plays.",digits:2,offRaw:"offYpp",offIndex:"offYppIndex",defRaw:"defYpp",defIndex:"defYppIndex"},
  {label:"Yards / pass",description:"Average passing yards gained or allowed per attempt. Eight yards per attempt equals 240 yards on 30 passes.",digits:2,offRaw:"offYpa",offIndex:"offYpaIndex",defRaw:"defYpa",defIndex:"defYpaIndex"},
  {label:"Yards / rush",description:"Average rushing yards gained or allowed per carry. Five yards per carry equals 200 yards on 40 runs.",digits:2,offRaw:"offYpc",offIndex:"offYpcIndex",defRaw:"defYpc",defIndex:"defYpcIndex"},
  {label:"Pass attempts / game",description:"How many passes the offense throws, or the defense faces, in a typical game. It helps describe pace and play-calling style.",digits:1,offRaw:"offPatt",offIndex:"offPattIndex",defRaw:"defPatt",defIndex:"defPattIndex"},
  {label:"Rush attempts / game",description:"How many runs the offense calls, or the defense faces, in a typical game. It helps describe pace and play-calling style.",digits:1,offRaw:"offRatt",offIndex:"offRattIndex",defRaw:"defRatt",defIndex:"defRattIndex"},
];

function nationalRank(rows:DynamicProfileRow[], selected:DynamicProfileRow, key:ProfileNumberKey, lowerIsBetter:boolean) {
  const selectedValue = Number(selected[key]);
  return 1 + rows.filter((row) => lowerIsBetter ? Number(row[key]) < selectedValue : Number(row[key]) > selectedValue).length;
}

function TeamMetricPanel({title,subtitle,row,rows,side}:{title:string;subtitle:string;row:DynamicProfileRow;rows:DynamicProfileRow[];side:"offense"|"defense"}) {
  const defense = side === "defense";
  return <section className={`team-metric-panel ${side}`}>
    <div className="team-metric-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{defense ? "LOWER IS BETTER" : "RANK 1 = HIGHEST"}</span></div>
    <div className="team-metric-labels"><span>METRIC</span><span><StatLabel label="RAW" /></span><span><StatLabel label="ADJ % AVG" /></span><span><StatLabel label="NATL RK" /></span></div>
    {teamMetricDefinitions.map((metric) => {
      const rawKey = defense ? metric.defRaw : metric.offRaw;
      const indexKey = defense ? metric.defIndex : metric.offIndex;
      const index = Number(row[indexKey]);
      const rank = nationalRank(rows, row, rawKey, defense);
      return <div className="team-metric-row" key={`${side}-${metric.label}`}>
        <div><strong><StatLabel label={metric.label} explanation={defense ? `${metric.description} Defensive values show output allowed; lower is better.` : metric.description} /></strong><i><span style={{width:`${Math.max(4,Math.min(100,index*50))}%`}} /></i></div>
        <b>{Number(row[rawKey]).toFixed(metric.digits)}</b>
        <span className={defense ? (index<1?"positive":"negative") : (index>=1?"positive":"negative")}>{(index*100).toFixed(0)}%</span>
        <em>#{rank}</em>
      </div>;
    })}
  </section>;
}

function useRankingTeamSchedule(team:string,season:number,enabled:boolean){
  const requestKey=`${season}:${team}`;
  const [result,setResult]=useState<{key:string;rows:ScheduleRow[]}>({key:"",rows:[]});
  useEffect(()=>{
    if(!enabled||result.key===requestKey)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"schedule",season:String(season),team,compactSchedule:"1",includeGameTimeRanks:"1"});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response))
      .then((payload)=>setResult({key:requestKey,rows:(payload.rows??[]).sort((left,right)=>compareScheduleRows(left,right,"date"))}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,rows:[]});});
    return()=>controller.abort();
  },[enabled,requestKey,result.key,season,team]);
  return {rows:result.key===requestKey?result.rows:[],loading:enabled&&result.key!==requestKey};
}

type UnifiedRankingHighlight={label:string;value:string;className?:string};
type RankingGameSelectHandler=(game:ScheduleRow)=>void;
type UnifiedRankingEntryProps={
  rank:number;team:string;logo?:string;subtitle:string;highlights:UnifiedRankingHighlight[];metrics:ReactNode;
  season:number;simulatedSchedule?:SimulatedScheduleRow[];logoByTeam?:Map<string,string|undefined>;
  onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler;className?:string;showSchedule?:boolean;
};

function scheduleColumnGridStyle(itemCount:number){
  return {"--schedule-column-rows":Math.max(1,Math.ceil(itemCount/2))} as CSSProperties;
}

function simulatedScheduleDetailRow(game:SimulatedScheduleRow,season:number,logoByTeam?:Map<string,string|undefined>):ScheduleRow{
  const completed=game.status==="final";
  return {
    gameId:game.gameId,season,week:game.week,seasonType:game.seasonType,completed,neutralSite:game.neutralSite,
    homeTeam:game.homeTeam,homePoints:completed?game.homeScore:null,awayTeam:game.awayTeam,awayPoints:completed?game.awayScore:null,
    predictedHomeScore:game.homeScore,predictedAwayScore:game.awayScore,homeWinProbability:game.homeWinProbability,
    modelHomeSpread:game.modelHomeSpread,modelTotal:game.modelTotal,vegasSpread:null,vegasTotal:null,spreadEdge:null,totalEdge:null,spreadError:null,totalError:null,
    homeLogo:logoByTeam?.get(game.homeTeam),awayLogo:logoByTeam?.get(game.awayTeam),homeRecordAfter:game.homeRecordAfter,awayRecordAfter:game.awayRecordAfter,
    homePredictedStats:game.homePredictedStats,awayPredictedStats:game.awayPredictedStats,homePredictedAdvanced:game.homePredictedAdvanced,awayPredictedAdvanced:game.awayPredictedAdvanced,
    edgeAnalysis:game.edgeAnalysis,predictionSource:"live-profile",
  };
}

function simulationMatchupDetailRow(game:ConferenceProjection|BracketProjection,season:number,effectiveWeek:number,logoByTeam?:Map<string,string|undefined>):ScheduleRow{
  const bracket="round" in game;
  const bracketWeek:Record<BracketProjection["round"],number>={"First Round":16,"Quarterfinal":17,"Semifinal":18,"Championship":19};
  const eventKey=(bracket?`${game.round}-${game.slot}`:`cc-${game.conference}`).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  return {
    gameId:`sim-${season}-${eventKey}`,season,week:bracket?bracketWeek[game.round]:15,seasonType:bracket?"postseason":"conference-championship",
    completed:false,neutralSite:bracket?!game.campusGame:true,generatedFromWeek:effectiveWeek,
    homeTeam:game.firstTeam,homePoints:null,awayTeam:game.secondTeam,awayPoints:null,
    predictedHomeScore:game.firstScore,predictedAwayScore:game.secondScore,homeWinProbability:game.homeWinProbability,
    modelHomeSpread:game.modelHomeSpread,modelTotal:game.modelTotal,vegasSpread:null,vegasTotal:null,spreadEdge:null,totalEdge:null,spreadError:null,totalError:null,
    homeLogo:logoByTeam?.get(game.firstTeam),awayLogo:logoByTeam?.get(game.secondTeam),homeRecordAfter:null,awayRecordAfter:null,recordStatus:"projected",
    homePredictedStats:game.homePredictedStats,awayPredictedStats:game.awayPredictedStats,homePredictedAdvanced:game.homePredictedAdvanced,awayPredictedAdvanced:game.awayPredictedAdvanced,
    edgeAnalysis:game.edgeAnalysis,predictionSource:"live-profile",
  };
}

function RankingSchedulePanel({team,season,rows,simulatedRows,logoByTeam,loading,onSelectGame}:{team:string;season:number;rows:ScheduleRow[];simulatedRows?:SimulatedScheduleRow[];logoByTeam?:Map<string,string|undefined>;loading:boolean;onSelectGame?:RankingGameSelectHandler}){
  const games=(simulatedRows??rows).map((game)=>{
    const simulated="recordAfter" in game;
    const home=game.homeTeam===team;
    const opponent=home?game.awayTeam:game.homeTeam;
    const neutral=Boolean(game.neutralSite);
    const location=neutral?"N":home?"VS":"@";
    const teamScore=simulated?(home?game.homeScore:game.awayScore):gameDisplayScore(game,home?"home":"away");
    const opponentScore=simulated?(home?game.awayScore:game.homeScore):gameDisplayScore(game,home?"away":"home");
    const completed=simulated?game.status==="final":Boolean(game.completed);
    const result=teamScore===null||opponentScore===null?"":teamScore>opponentScore?"W":teamScore<opponentScore?"L":"T";
    const record=home?game.homeRecordAfter:game.awayRecordAfter;
    const opponentLogo=logoByTeam?.get(opponent)??(!simulated?(home?game.awayLogo:game.homeLogo):undefined);
    const opponentConference=!simulated?(home?game.awayConference:game.homeConference):undefined;
    const teamRank=!simulated?(home?game.homePregameRank:game.awayPregameRank):null;
    const opponentRank=!simulated?(home?game.awayPregameRank:game.homePregameRank):null;
    const opponentIsFcs=isFcsTeam(opponent,opponentConference);
    const detailRow=simulated?simulatedScheduleDetailRow(game,season,logoByTeam):game;
    return {id:game.gameId,week:game.week,label:scheduleGameLabel(detailRow),opponent,opponentLogo,opponentIsFcs,location,teamScore,opponentScore,result,record,status:completed?"FINAL":"H+ PROJ",teamRank,opponentRank,detailRow};
  });
  return <div className="ranking-schedule-panel">
    <header><strong>{team} SCHEDULE</strong><span>{season} · {games.length} GAMES</span></header>
    {loading?<p>Loading schedule…</p>:games.length?<div className="ranking-schedule-list schedule-column-grid" style={scheduleColumnGridStyle(games.length)}>{games.map((game)=><button type="button" className={`ranking-schedule-game schedule-field-card ${game.result==="L"?"loss":""}`} key={game.id} onClick={()=>onSelectGame?.(game.detailRow)} aria-label={`Open ${team} ${game.opponent} game details`}>
      <span className="ranking-schedule-week">{game.label}</span>
      <TeamMark name={game.opponent} size="sm" logo={game.opponentLogo} genericLabel={game.opponentIsFcs?"FCS":undefined} variant="helmet"/>
      <span className="ranking-schedule-opponent"><small>{game.location}</small><strong>{game.opponent}{game.opponentRank&&game.opponentRank<=25?<em className="schedule-game-rank">#{game.opponentRank}</em>:null}</strong><em>{game.status}{game.teamRank&&game.teamRank<=25?` · ${team} #${game.teamRank}`:""}</em></span>
      <b className={game.result==="W"?"positive":game.result==="L"?"negative":""}>{game.result||"—"} {game.teamScore??"—"}–{game.opponentScore??"—"}</b>
      <small className="ranking-schedule-record">{game.record??"—"}</small>
    </button>)}</div>:<p>No schedule is available for this team-season.</p>}
  </div>;
}

function UnifiedRankingEntry({rank,team,logo,subtitle,highlights,metrics,season,simulatedSchedule,logoByTeam,onSelectTeam,onSelectGame,className="",showSchedule=true}:UnifiedRankingEntryProps){
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const schedule=useRankingTeamSchedule(team,season,showSchedule&&scheduleOpen&&!simulatedSchedule);
  const panelId=`ranking-schedule-${season}-${team.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
  const teamIdentity=<><TeamMark name={team} size="sm" logo={logo}/><span><strong>{team}</strong><small>{subtitle}</small>{highlights.map((item)=><small className={item.className} key={`${item.label}:${item.value}`}><b>{item.label}</b>{item.value}</small>)}</span><i aria-hidden="true">›</i></>;
  return <article className={`unified-ranking-entry ${className} ${showSchedule&&scheduleOpen?"schedule-open":""} ${showSchedule?"":"no-schedule"}`}>
    <div className="ranking-row unified-ranking-row">
      <strong className="ranking-number">{rank}</strong>
      {onSelectTeam?<button type="button" className="ranking-team ranking-team-link" onClick={()=>onSelectTeam(team)} aria-label={`Open ${team} team page`}>{teamIdentity}</button>:<div className="ranking-team">{teamIdentity}</div>}
      <div className="ranking-metrics">{metrics}</div>
      {showSchedule?<button className="ranking-schedule-toggle" type="button" aria-expanded={scheduleOpen} aria-controls={panelId} onClick={()=>setScheduleOpen((open)=>!open)}><span>SCHEDULE</span><i aria-hidden="true">⌄</i></button>:null}
    </div>
    {showSchedule&&scheduleOpen?<div id={panelId}><RankingSchedulePanel team={team} season={season} rows={schedule.rows} simulatedRows={simulatedSchedule} logoByTeam={logoByTeam} loading={schedule.loading} onSelectGame={onSelectGame}/></div>:null}
  </article>;
}

function WeeklyProjectedRankingsTable({rows,season,loading=false,onSelectTeam}:{rows:ProjectedFinalRankingRow[];season:number;loading?:boolean;onSelectTeam?:(team:string)=>void}){
  return <div className="rankings-shell unified-rankings-shell weekly-projected-rankings-shell">
    <div className="rankings-head weekly-projected-ranking-head"><span>RK</span><span>TEAM / PROJECTED RESULTS</span><span>FINAL RECORD</span><span>EXP W</span><span>SOS</span><span>TEAM STRENGTH</span><span>CFP</span></div>
    {loading&&!rows.length?<div className="rankings-loading">Projecting the remaining schedule and final H+ order…</div>:rows.map((row)=><UnifiedRankingEntry
      key={row.team}
      className="simulation-ranking-entry weekly-projected-ranking-entry"
      rank={row.rank}
      team={row.team}
      logo={row.logo}
      subtitle={row.conference||"FBS"}
      highlights={[
        {label:"BEST PROJECTED WINS",value:row.projectedWinsOver.length?row.projectedWinsOver.join(", "):"No wins projected",className:"ranking-best-wins"},
        {label:"PROJECTED LOSSES",value:row.projectedLossesTo.length?row.projectedLossesTo.join(", "):"None",className:"ranking-losses"},
      ]}
      metrics={<>
        <span className="ranking-record-pair" data-label="FINAL RECORD"><b>{row.projectedRecord}</b><small>{row.conferenceRecord||"—"} CONF</small></span>
        <strong data-label="EXP W">{row.expectedWins.toFixed(1)}</strong>
        <span data-label="SOS">#{row.sosRank}</span>
        <strong data-label="TEAM STRENGTH">#{row.powerRank}</strong>
        <span data-label="CFP">{row.playoffSeed?<b className="seed-pill">#{row.playoffSeed}</b>:row.conferenceChampion?<b className="champ-pill">CHAMP</b>:"—"}</span>
      </>}
      season={season}
      onSelectTeam={onSelectTeam}
      showSchedule={false}
    />)}
  </div>;
}

function ResultsOnlyRankingsTable({rows,season,loading=false,onSelectTeam,onSelectGame}:{rows:SeasonRankingRow[];season:number;loading?:boolean;onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler}){
  return <div className="rankings-shell unified-rankings-shell top25-unified-shell results-only-rankings-shell">
    <div className="rankings-head results-only-ranking-head"><span>RK</span><span>TEAM / COMPLETED RESULTS</span><span>OVERALL / CONF</span><span>H+ SCORE</span><span>RESULTS</span><span>H2H</span><span>SOS</span><span>GAME STRENGTH</span><span>SCHEDULE</span></div>
    {loading&&!rows.length?<div className="rankings-loading">Ranking completed games from the prior-week snapshot…</div>:rows.slice(0,25).map((entry)=><UnifiedRankingEntry
      key={entry.team}
      className="results-only-ranking-entry"
      rank={entry.rank}
      team={entry.team}
      logo={entry.logo}
      subtitle={entry.conference||teamMap.get(entry.team)?.conference||"FBS"}
      highlights={[
        {label:"BEST COMPLETED WIN",value:entry.bestWins?.[0]??"No win yet",className:"ranking-best-wins"},
        {label:"WORST COMPLETED LOSS",value:entry.lossesTo?.[0]??"None",className:"ranking-losses"},
      ]}
      metrics={<>
        <span className="ranking-record-pair" data-label="OVERALL / CONF"><b>{entry.record}</b><small>{entry.conferenceRecord||"—"} CONF</small></span>
        <strong data-label="H+ SCORE">{(entry.bcsScore*100).toFixed(1)}</strong>
        <span data-label="RESULTS">{(entry.resultsScore*100).toFixed(0)}</span>
        <strong data-label="H2H">#{entry.headToHeadRank}</strong>
        <strong data-label="SOS">#{entry.sosRank}</strong>
        <strong data-label="GAME STRENGTH">#{entry.powerRank}</strong>
      </>}
      season={season}
      onSelectTeam={onSelectTeam}
      onSelectGame={onSelectGame}
    />)}
  </div>;
}

function ResultsRankingsPage({season,week,setSeason,setWeek,onSelectTeam,onSelectGame}:ModelVintageProps&{onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler}){
  const snapshotWeek=enteringWeekSnapshotWeek(week);
  const rankings=useSeasonRankings(season,snapshotWeek);
  const data=rankings.data;
  const effectiveWeek=data?.effectiveWeek??snapshotWeek;
  const enteringLabel=week===0?"PRESEASON":`ENTERING WEEK ${week}`;
  const evidenceLabel=effectiveWeek===0?"WEEK 0 / PRESEASON STATE":`COMPLETED THROUGH WEEK ${effectiveWeek}`;
  return <section className="page-section rankings-page results-rankings-page">
    <div className="section-kicker">RESULTS-ONLY TOP 25 · NO FUTURE PROJECTIONS</div>
    <div className="section-title-row">
      <div><h1>H+ Rankings</h1><p>Ranks teams only from evidence available before the selected week. The selected week&apos;s games first enter the following week&apos;s ranking.</p></div>
      <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} idPrefix="results-rankings" weekLabel="ENTERING WEEK" />
    </div>
    <div className="weekly-ranking-snapshot results-ranking-snapshot" role="note">
      <span>{enteringLabel}</span>
      <strong>{evidenceLabel}</strong>
      <p>Completed records, opponent quality, game control, schedule strength and direct head-to-head are included. Predicted future games, projected final records, conference-title projections and playoff simulations are excluded.</p>
    </div>
    {!rankings.loading&&data&&!data.rows.length?<div className="data-empty"><strong>No results-only Top 25 is available for this snapshot.</strong><span>{data.message??"Select a later entering week after games have been completed."}</span></div>:<ResultsOnlyRankingsTable rows={data?.rows??[]} season={season} loading={rankings.loading} onSelectTeam={onSelectTeam} onSelectGame={onSelectGame}/>}
    {data?<p className="weekly-ranking-method">{data.methodology}</p>:null}
  </section>;
}

function ConferenceStandingsPage({season,week,setSeason,setWeek,onSelectTeam}:{season:number;week:number;setSeason:(value:number)=>void;setWeek:(value:number)=>void;onSelectTeam:(team:string)=>void}) {
  const [conference,setConference]=useState("");
  const standings=useConferenceStandings(season,week,conference);
  const data=standings.data;
  const rows=data?.rows??[];
  const rules=data?.rules??null;
  const hasConferenceGames=rows.some((row)=>row.conferenceWins+row.conferenceLosses+row.conferenceTies>0);
  const groups=rules?.usesDivisions
    ?["East","West","Conference"].map((division)=>({division,rows:rows.filter((row)=>(row.division??"Conference")===division)})).filter((group)=>group.rows.length)
    :[{division:"Conference",rows}];
  const pctLabel=(row:ConferenceStandingRow)=>row.conferenceWins+row.conferenceLosses+row.conferenceTies?row.conferencePct.toFixed(3).replace(/^0/,""):".000";
  return <section className="page-section standings-page">
    <div className="section-kicker">CONFERENCE ORDER · OFFICIAL TIEBREAK SPINE</div>
    <div className="section-title-row">
      <div><h1>Conference Standings</h1><p>Select a conference to rank its teams by league record and that conference&apos;s published tiebreak order.</p></div>
      <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} idPrefix="standings" />
    </div>
    <div className="standings-conference-control">
      <label htmlFor="standings-conference"><span>CONFERENCE</span><select id="standings-conference" aria-label="Select conference standings" value={conference} onChange={(event)=>setConference(event.target.value)}><option value="">Choose a conference</option>{standings.conferences.map((option)=><option key={option}>{option}</option>)}</select></label>
      <span>{conference?`${season} · THROUGH WEEK ${week}`:"A conference selection is required"}</span>
    </div>
    {!conference?<div className="standings-empty"><strong>Choose a conference.</strong><span>The table will load league records, title-game positions, and the conference-specific tiebreak path.</span></div>:standings.loading?<div className="standings-empty"><strong>Building {conference} standings…</strong><span>Applying completed conference results through Week {week}.</span></div>:!rules?<div className="standings-empty"><strong>Standings are unavailable.</strong><span>{data?.message??`No ${conference} membership was found for ${season}.`}</span></div>:<>
      <aside className="standings-rules" aria-label={`${conference} standings rules`}>
        <header><span>{rules.format}</span><h2>{conference} tiebreak order</h2><p>{rules.qualification}</p></header>
        <ol>{rules.steps.map((step,index)=><li key={step}><b>{String(index+1).padStart(2,"0")}</b><span>{step}</span></li>)}</ol>
        <footer><p>{rules.note} When an official proprietary ranking or random draw cannot be reproduced, Harper+ rank is shown as the deterministic final proxy.</p>{rules.sourceUrl?<a href={rules.sourceUrl} target="_blank" rel="noopener noreferrer">OFFICIAL POLICY <span aria-hidden="true">↗</span></a>:null}</footer>
      </aside>
      {!hasConferenceGames?<p className="standings-provisional">No completed conference games are included through Week {week}. The temporary order uses Harper+ rank and is not an official tiebreak result.</p>:null}
      <div className="standings-tables">
        {groups.map((group)=><section className="standings-table" key={group.division} aria-label={rules.usesDivisions?`${conference} ${group.division} standings`:`${conference} standings`}>
          {rules.usesDivisions?<header className="standings-division-head"><span>{group.division.toUpperCase()} DIVISION</span><strong>{group.rows.length} TEAMS</strong></header>:null}
          <div className="standings-head"><span>RK</span><span>TEAM</span><span>CONF</span><span>OVERALL</span><span>PCT</span><span>H+ RK</span><span>TIEBREAK</span><span>POSITION</span></div>
          {group.rows.map((row)=><article className={`standings-row ${row.titleGamePosition?"title-position":""}`} key={row.team}>
            <strong className="standings-rank">{row.divisionRank??row.rank}</strong>
            <button type="button" className="standings-team" onClick={()=>onSelectTeam(row.team)} aria-label={`Open ${row.team} team page`}><TeamMark name={row.team} size="sm" logo={row.logo??undefined}/><span><strong>{row.team}</strong><small>{row.division?`${row.division} · `:""}{row.mascot||conference}</small></span><i aria-hidden="true">›</i></button>
            <span className="standings-record" data-label="CONF"><b>{row.conferenceRecord}</b><small>H {row.homeConferenceRecord} · A {row.awayConferenceRecord}</small></span>
            <strong data-label="OVERALL">{row.overallRecord}</strong>
            <b data-label="PCT">{pctLabel(row)}</b>
            <strong data-label="H+ RK">{row.hPlusRank?`#${row.hPlusRank}`:"—"}</strong>
            <span className="standings-tiebreak" data-label="TIEBREAK"><b>{row.tied?row.tiebreak:"Conference record"}</b><small>OPP {Math.round(row.opponentConferenceWinPct*100)}% · MRG {row.averageConferenceMargin>=0?"+":""}{row.averageConferenceMargin.toFixed(1)}</small></span>
            <span className="standings-position" data-label="POSITION">{row.titleGamePosition?<b>{rules.usesDivisions?"DIVISION LEADER":"TITLE GAME"}</b>:"—"}</span>
          </article>)}
        </section>)}
      </div>
    </>}
  </section>;
}

function BackfillBanner() {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{status:"checking"|"running"|"done"|"error"|"unconfigured";message:string}>({ status:"checking",message:"Checking historical season archive…" });
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    let finished = false;
    const load = async () => {
      if (pending || finished) return;
      pending = true;
      try {
        const response = await fetch("/api/bootstrap");
        const payload = await readJsonBody<BackfillPayload>(response);
        if (!response.ok && payload.status==="waiting") {
          if (!cancelled) setState({status:"running",message:payload.message || "The archive database is briefly queued. Retrying automatically."});
          return;
        }
        if (!response.ok) throw new Error(payload.message || "Could not inspect the historical archive");
        if (!payload.configured) { if (!cancelled) setState({ status:"unconfigured",message:"Historical archive is waiting for its private data connection." }); return; }
        const missing = payload.missing || [];
        const playerMissing = payload.playerArchive?.missing ?? [];
        if (!missing.length && playerMissing.length) {
          const importing = playerMissing[0];
          const playerStatus = payload.playerArchive?.seasons.find((row)=>row.season===importing) ?? payload.playerSync;
          const playerStage = playerStatus?.stage === "roster" ? "rosters" : playerStatus?.stage === "stats" ? "basic player stats" : playerStatus?.stage === "success" ? "player success rates" : playerStatus?.stage === "usage" ? "player usage" : playerStatus?.stage === "ppa" ? "player PPA" : playerStatus?.stage === "transfers" ? "transfer grades" : playerStatus?.stage === "recruiting" ? "high-school recruiting grades" : "depth charts";
          if (!cancelled) setState({ status:"running",message:`Automatic player archive: ${importing} ${playerStage} · ${playerStatus?.progressPercent ?? 0}%` });
          return;
        }
        if (!missing.length && payload.playerProductionBaseline?.status !== "ready") {
          if (!cancelled) setState({ status:"running",message:`Building historical player production scale · ${payload.playerProductionBaseline?.detail ?? "queued"}` });
          return;
        }
        if (!missing.length) {
          finished = true;
          const depthSummary = payload.depthChartArchive?.targetTeamSeasons
            ? ` · official depth sources ${payload.depthChartArchive.sourcedTeamSeasons}/${payload.depthChartArchive.targetTeamSeasons} team-seasons`
            : "";
          if (!cancelled) setState({ status:"done",message:`${archiveSummary(payload)} · player archive ${payload.playerArchive?.firstSeason ?? 2014}–${payload.playerArchive?.currentSeason ?? activeModelSeason}${depthSummary}` });
          return;
        }
        const importing = missing[0];
        const seasonStatus = payload.seasons?.find((row) => row.season === importing);
        const stageLabel = seasonStatus?.stage === "teams" ? "team identities and logos" : seasonStatus?.stage === "priors" ? "returning production and recruiting priors" : seasonStatus?.stage === "schedule" ? "schedule and final scores" : seasonStatus?.stage === "stats" ? `weekly box scores (${seasonStatus.statWeekCount}/${seasonStatus.completedWeekCount})` : seasonStatus?.stage === "advanced" ? "position-group, play-style and down-leverage components" : seasonStatus?.stage === "passing" ? `completion detail (${seasonStatus.completionWeekCount}/${seasonStatus.completedWeekCount} weeks)` : "Harper+ v15 possession-model snapshots";
        if (!cancelled) setState({ status:"running",message:`Automatic archive work: ${importing} ${stageLabel} · ${seasonStatus?.progressPercent ?? 0}%` });
      } catch (error) {
        if (!cancelled) setState({ status:"error",message:error instanceof Error ? error.message : "Historical backfill failed" });
      } finally {
        pending = false;
      }
    };
    void load();
    const refreshVisibleArchive = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshVisibleArchive, 60_000);
    document.addEventListener("visibilitychange", refreshVisibleArchive);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleArchive);
    };
  }, [retry]);
  return <div className={`backfill-banner ${state.status}`}><div><span className="backfill-pulse" /><strong>{state.status === "running" ? "BUILDING ARCHIVE" : state.status === "done" ? "ARCHIVE READY" : state.status === "error" ? "ARCHIVE NEEDS ATTENTION" : "HISTORICAL ARCHIVE"}</strong><small>{state.message}</small></div>{state.status === "error" ? <button onClick={() => setRetry((value) => value + 1)}>RETRY</button> : null}</div>;
}

type ModelVintageProps = {
  season: number;
  week: number;
  setSeason: (value: number) => void;
  setWeek: (value: number) => void;
};

type MatchupPageTab = "read" | "positions" | "playbook" | "data";

function sourceLabel(source: "database" | "embedded" | "loading", season: number) {
  if (source === "loading") return "LOADING SNAPSHOT";
  if (source === "database") return "LIVE WEEKLY SNAPSHOT";
  return season === modelSnapshot.season ? "WORKBOOK FALLBACK" : "AWAITING HISTORICAL SYNC";
}

function MatchupLab({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [homeName, setHomeName] = useState("Indiana");
  const [awayName, setAwayName] = useState("Ohio State");
  const [awaySeason, setAwaySeason] = useState(season);
  const [awayWeek, setAwayWeek] = useState(week);
  const [neutral, setNeutral] = useState(true);
  const [activeMatchupTab, setActiveMatchupTab] = useState<MatchupPageTab>("read");
  const homeDynamic = useDynamicProfiles(season, week);
  const awayDynamic = useDynamicProfiles(awaySeason, awayWeek);
  const homeTeams = homeDynamic.teams;
  const awayTeams = awayDynamic.teams;
  const homeLookup = useMemo(() => new Map(homeTeams.map((team) => [team.name, team])), [homeTeams]);
  const awayLookup = useMemo(() => new Map(awayTeams.map((team) => [team.name, team])), [awayTeams]);

  const resolvedHomeName = homeLookup.has(homeName) ? homeName : (homeLookup.has("Indiana") ? "Indiana" : homeTeams[0]?.name);
  const resolvedAwayName = awayLookup.has(awayName) ? awayName : (awayLookup.has("Ohio State") ? "Ohio State" : (awayTeams[1] || awayTeams[0])?.name);
  const home = resolvedHomeName ? homeLookup.get(resolvedHomeName) : undefined;
  const away = resolvedAwayName ? awayLookup.get(resolvedAwayName) : undefined;
  const homePlayerLayer=usePlayerLayer(season,home?[home.name]:[]);
  const awayPlayerLayer=usePlayerLayer(awaySeason,away?[away.name]:[]);
  const homePlayerModel=home?homePlayerLayer.profiles.get(home.name):undefined;
  const awayPlayerModel=away?awayPlayerLayer.profiles.get(away.name):undefined;
  const projection = useMemo(() => home && away ? projectMatchup(home, away, week, neutral, awayWeek, {
    home:`${season} ${home.name}`,
    away:`${awaySeason} ${away.name}`,
  }) : null, [away, awaySeason, awayWeek, home, neutral, season, week]);
  const homeIntelligenceRow=useMemo(()=>home?(homeDynamic.rows.find((row)=>row.team===home.name)??modelTeamProfileRow(home,season,week)):null,[home,homeDynamic.rows,season,week]);
  const awayIntelligenceRow=useMemo(()=>away?(awayDynamic.rows.find((row)=>row.team===away.name)??modelTeamProfileRow(away,awaySeason,awayWeek)):null,[away,awayDynamic.rows,awaySeason,awayWeek]);
  const footballIntelligence=useMemo(()=>projection?.homeStats.advanced&&projection.awayStats.advanced&&homeIntelligenceRow&&awayIntelligenceRow
    ? deriveMatchupIntelligence({
      homeTeam:homeIntelligenceRow.team,
      awayTeam:awayIntelligenceRow.team,
      homeProjection:projection.homeStats.advanced,
      awayProjection:projection.awayStats.advanced,
      homeProfile:homeIntelligenceRow,
      awayProfile:awayIntelligenceRow,
    })
    : null,[awayIntelligenceRow,homeIntelligenceRow,projection]);
  const marketRow=useMatchupMarket(season===awaySeason,season,week,home?.name,away?.name);
  const projectionWarnings=useMemo(()=>{
    const warnings=[...(projection?.warnings??[])];
    if(projection&&marketRow?.vegasTotal!==null&&marketRow?.vegasTotal!==undefined&&Math.abs(projection.total-marketRow.vegasTotal)>=14) warnings.push("Large market-total disagreement: inspect pace, viability and data coverage before relying on the edge.");
    return warnings;
  },[marketRow,projection]);
  const displayHome = home ? { ...home, name:`${season} ${home.name}` } : undefined;
  const displayAway = away ? { ...away, name:`${awaySeason} ${away.name}` } : undefined;
  const matchupTabs:Array<{id:MatchupPageTab;label:string;note:string;enabled:boolean}> = [
    {id:"read",label:"Overview",note:"Projection and reasons",enabled:Boolean(footballIntelligence&&home&&away)},
    {id:"positions",label:"Unit Matchups",note:"Position-group control",enabled:Boolean(projection&&displayHome&&displayAway)},
    {id:"playbook",label:"Playbook",note:"Coordinator view",enabled:Boolean(projection&&displayHome&&displayAway)},
    {id:"data",label:"Data",note:"Metrics and profiles",enabled:Boolean(projection&&home&&away)},
  ].filter((tab)=>tab.enabled);
  const resolvedMatchupTab=matchupTabs.some((tab)=>tab.id===activeMatchupTab)?activeMatchupTab:(matchupTabs[0]?.id??"read");
  const spreadTeam = projection ? (projection.margin >= 0 ? home : away) : undefined;
  const winTeam = projection ? (projection.homeWin >= .5 ? home : away) : undefined;
  const marketTeam = marketRow
    ? homeLookup.get(marketRow.homeTeam) ?? awayLookup.get(marketRow.homeTeam)
    : undefined;
  const swap = () => {
    if (!resolvedAwayName || !resolvedHomeName) return;
    const previousSeason = season;
    const previousWeek = week;
    setHomeName(resolvedAwayName);
    setSeason(awaySeason);
    setWeek(awayWeek);
    setAwayName(resolvedHomeName);
    setAwaySeason(previousSeason);
    setAwayWeek(previousWeek);
  };

  return (
    <section className="page-section matchup-page">
      <div className="section-kicker">MATCHUP SNAPSHOTS · <span className={`data-source ${homeDynamic.source}`}>HOME: {sourceLabel(homeDynamic.source, season)}</span> · <span className={`data-source ${awayDynamic.source}`}>AWAY: {sourceLabel(awayDynamic.source, awaySeason)}</span> · <span className={`data-source ${homePlayerLayer.payload?.status==="ready"&&awayPlayerLayer.payload?.status==="ready"?"database":"loading"}`}>PLAYERS: {season} {homePlayerLayer.payload?.status==="ready"?"READY":`${homePlayerLayer.payload?.sync?.progressPercent??0}%`} · {awaySeason} {awayPlayerLayer.payload?.status==="ready"?"READY":`${awayPlayerLayer.payload?.sync?.progressPercent??0}%`}</span></div>
      <div className="section-title-row">
        <div><h1>Matchup Lab</h1><p>See which position groups control the game, then open the coordinator board for the play-call answer.</p></div>
      </div>

      {!home || !away ? <div className="data-empty"><strong>A selected model snapshot is not loaded yet.</strong><span>Home: {season} week {week}. Away: {awaySeason} week {awayWeek}. The automatic historical loader will add each vintage as its archive stage completes.</span></div> : <>
        <div className="matchup-board">
          <div className="matchup-side">
            <span className="side-label">HOME PROFILE</span>
            <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} finalWeek idPrefix="matchup-home" />
            <span className="matchup-vintage-tag">{season} · {week===16?"FINAL RÉSUMÉ":`WEEK ${week}`}</span>
            <TeamMark name={home.name} size="lg" logo={home.logo} />
            <select aria-label="Home team" value={home.name} onChange={(event) => setHomeName(event.target.value)}>{homeTeams.map((team) => <option key={`${season}-${team.name}`}>{team.name}</option>)}</select>
            <small>{home.conference} · {home.mascot}</small>
            {projection ? <strong className="projected-score">{projection.homeScore.toFixed(0)}</strong> : null}
            {projection ? <b>{(projection.homeWin * 100).toFixed(0)}% WIN</b> : null}
          </div>

          <div className="matchup-center">
            <span>HARPER+ PROJECTION</span>
            <strong>{projection ? `${projection.margin >= 0 ? home.abbr : away.abbr} ${Math.abs(projection.margin).toFixed(1)}` : "—"}</strong>
            <small>{projection ? `TOTAL ${projection.total.toFixed(1)}` : "PROFILE UNAVAILABLE"}</small>
            <button className="swap-button" type="button" onClick={swap}>SWAP TEAMS + VINTAGES</button>
            <label className="toggle-row"><input type="checkbox" checked={neutral} onChange={(event) => setNeutral(event.target.checked)} /><span>Neutral site · All137 standard</span></label>
          </div>

          <div className="matchup-side">
            <span className="side-label">AWAY PROFILE</span>
            <VintageControl season={awaySeason} week={awayWeek} setSeason={setAwaySeason} setWeek={setAwayWeek} finalWeek idPrefix="matchup-away" />
            <span className="matchup-vintage-tag">{awaySeason} · {awayWeek===16?"FINAL RÉSUMÉ":`WEEK ${awayWeek}`}</span>
            <TeamMark name={away.name} size="lg" logo={away.logo} />
            <select aria-label="Away team" value={away.name} onChange={(event) => setAwayName(event.target.value)}>{awayTeams.map((team) => <option key={`${awaySeason}-${team.name}`}>{team.name}</option>)}</select>
            <small>{away.conference} · {away.mascot}</small>
            {projection ? <strong className="projected-score">{projection.awayScore.toFixed(0)}</strong> : null}
            {projection ? <b>{((1 - projection.homeWin) * 100).toFixed(0)}% WIN</b> : null}
          </div>
        </div>

        {projection?<section className="matchup-summary-card"><span>GAME LINE</span><div>
          <article><small>SPREAD</small>{spreadTeam?<div className="summary-team-pick" role="group" aria-label={`${spreadTeam.name} favored by ${Math.abs(projection.margin).toFixed(1)}`}><TeamMark name={spreadTeam.name} size="sm" logo={spreadTeam.logo}/><strong>-{Math.abs(projection.margin).toFixed(1)}</strong></div>:<strong>—</strong>}</article>
          <article><small>TOTAL</small><strong>{projection.total.toFixed(1)}</strong></article>
          <article><small>WIN %</small>{winTeam?<div className="summary-team-pick" role="group" aria-label={`${winTeam.name} win probability ${(Math.max(projection.homeWin,1-projection.homeWin)*100).toFixed(0)} percent`}><TeamMark name={winTeam.name} size="sm" logo={winTeam.logo}/><strong>{(Math.max(projection.homeWin,1-projection.homeWin)*100).toFixed(0)}%</strong></div>:<strong>—</strong>}</article>
          <article><small>MARKET</small>{marketRow&&marketRow.vegasSpread!==null?<div className="summary-team-pick market-team-pick" role="group" aria-label={`${marketRow.homeTeam} market spread ${signed(marketRow.vegasSpread)}`}><TeamMark name={marketRow.homeTeam} size="sm" logo={marketTeam?.logo}/><strong>{signed(marketRow.vegasSpread)}</strong></div>:<strong>—</strong>}<em>{marketRow?.vegasTotal===null||marketRow?.vegasTotal===undefined?"No total":"O/U "+marketRow.vegasTotal.toFixed(1)}</em></article>
          <article><small>ATS EDGE</small><strong>{marketRow&&marketRow.vegasSpread!==null?signed((marketRow.homeTeam===home.name?marketRow.vegasSpread:-marketRow.vegasSpread)-(-projection.margin)):"—"}</strong></article>
          <article><small>CONFIDENCE</small><strong>{projection.edgeAnalysis.intelligence?.confidence??projection.edgeAnalysis.confidence}</strong></article>
        </div>{projectionWarnings.length?<aside>{projectionWarnings.map((warning)=><span key={warning}>{warning}</span>)}</aside>:null}</section>:null}

        {matchupTabs.length?<nav className="matchup-page-tabs" role="tablist" aria-label="Matchup analysis sections">
          {matchupTabs.map((tab)=><button
            key={tab.id}
            id={`matchup-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={resolvedMatchupTab===tab.id}
            aria-controls="matchup-analysis-panel"
            tabIndex={resolvedMatchupTab===tab.id?0:-1}
            data-tab={tab.id}
            onClick={()=>setActiveMatchupTab(tab.id)}
            onKeyDown={(event)=>{
              if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key)) return;
              event.preventDefault();
              const buttons=Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')??[]);
              const currentIndex=buttons.indexOf(event.currentTarget);
              const nextIndex=event.key==="Home"?0:event.key==="End"?buttons.length-1:event.key==="ArrowRight"?(currentIndex+1)%buttons.length:(currentIndex-1+buttons.length)%buttons.length;
              const next=buttons[nextIndex];
              if(!next) return;
              setActiveMatchupTab(next.dataset.tab as MatchupPageTab);
              next.focus();
            }}
          ><strong>{tab.label}</strong><span>{tab.note}</span></button>)}
        </nav>:null}

        <div
          id="matchup-analysis-panel"
          className={`matchup-tab-panel view-${resolvedMatchupTab}`}
          role="tabpanel"
          aria-labelledby={`matchup-tab-${resolvedMatchupTab}`}
          tabIndex={0}
        >
          {resolvedMatchupTab==="read"&&footballIntelligence&&home&&away?<MatchupIntelligencePanel board={footballIntelligence} home={home} away={away}/>:null}

          {resolvedMatchupTab==="positions"&&projection&&displayHome&&displayAway?<PositionMatchupComparison
            home={displayHome}
            away={displayAway}
            homeProjection={projection.homeStats.advanced}
            awayProjection={projection.awayStats.advanced}
            homeCore={projection.homeStats}
            awayCore={projection.awayStats}
            homePlayers={homePlayerModel}
            awayPlayers={awayPlayerModel}
          />:null}

          {resolvedMatchupTab==="playbook"&&projection&&displayHome&&displayAway?<MatchupTacticalBoard home={displayHome} away={displayAway} analysis={projection.edgeAnalysis} homePlayers={homePlayerModel} awayPlayers={awayPlayerModel}/>:null}

          {resolvedMatchupTab==="data"&&projection&&home&&away?<section className="matchup-data-workspace matchup-tab-surface" aria-label="Matchup data">
            <header className="matchup-tab-panel-heading">
              <div><span>SUPPORTING DATA</span><h2>Metrics behind the projection</h2><p>Derived advantages first, followed by the full advanced and team-stat profiles.</p></div>
            </header>
            {footballIntelligence?<MatchupIntelligencePanel board={footballIntelligence} home={home} away={away} mode="advantages"/>:null}
            {projection.homeStats.advanced&&projection.awayStats.advanced&&projection.homeAdvancedProfile&&projection.awayAdvancedProfile&&displayHome&&displayAway?<AdvancedMatchupCard
              home={displayHome}
              away={displayAway}
              homeProjection={projection.homeStats.advanced}
              awayProjection={projection.awayStats.advanced}
              homeProfile={projection.homeAdvancedProfile}
              awayProfile={projection.awayAdvancedProfile}
              schematicReads={projection.edgeAnalysis.schematicReads}
            />:null}
            <MatchupStatProfilePanel home={home} away={away} projection={projection} season={season} awaySeason={awaySeason} week={week} awayWeek={awayWeek}/>
            {displayHome&&displayAway&&(season!==awaySeason||week!==awayWeek)?<CrossEraLogicCard home={displayHome} away={displayAway} projection={projection} neutral={neutral}/>:null}
          </section>:null}
        </div>
      </>}
    </section>
  );
}

function useMatchupLabContext(season:number,week:number,homeTeam:string|undefined,awayTeam:string|undefined){
  const requestKey=homeTeam&&awayTeam&&homeTeam!==awayTeam?`${season}:${week}:${homeTeam}:${awayTeam}`:"";
  const [result,setResult]=useState<{key:string;payload:MatchupContextPayload|null;error:string}>({key:"",payload:null,error:""});
  useEffect(()=>{
    if(!requestKey||!homeTeam||!awayTeam)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"matchup-context",season:String(season),week:String(week),homeTeam,awayTeam});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<MatchupContextPayload&{message?:string}>(response).then((payload)=>({response,payload})))
      .then(({response,payload})=>setResult({key:requestKey,payload:response.ok?payload:null,error:response.ok?"":payload.message??"Matchup history is unavailable."}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setResult({key:requestKey,payload:null,error:"Matchup history is temporarily unavailable."});});
    return()=>controller.abort();
  },[awayTeam,homeTeam,requestKey,season,week]);
  return {payload:result.key===requestKey?result.payload:null,error:result.key===requestKey?result.error:"",loading:Boolean(requestKey)&&result.key!==requestKey};
}

function impactTone(value:number|null){return value===null?"neutral":value>=.025?"positive":value<=-.025?"negative":"neutral";}
function signedNumber(value:number,digits=1){return`${value>0?"+":""}${value.toFixed(digits)}`;}

function OpponentImpactPanel({team,context,logo}:{team:TeamModel;context:MatchupTeamContext|null;logo?:string}){
  const lanes:MatchupContextLaneId[]=["rushOffense","passOffense","rushDefense","passDefense"];
  const laneLabels:Record<MatchupContextLaneId,string>={rushOffense:"RUSH OFFENSE",passOffense:"PASS OFFENSE",rushDefense:"RUSH DEFENSE",passDefense:"PASS DEFENSE"};
  return <article className="mlab-impact-team">
    <header><TeamMark name={team.name} size="sm" logo={logo??team.logo}/><span><strong>{team.name}</strong><small>SEASON-TO-DATE OPPONENT EFFECT</small></span></header>
    <div>{lanes.map((lane)=>{
      const impact=context?.impacts[lane];
      const tone=impactTone(impact?.value??null);
      return <section className={tone} key={lane}>
        <span>{impact?.label??laneLabels[lane]}</span>
        <strong>{impact?.value===null||impact?.value===undefined?"—":`${impact.value>0?"+":""}${(impact.value*100).toFixed(1)}%`}</strong>
        <p>{impact?.detail??"Waiting for completed opponent samples."}</p>
        <small>{impact?.actual===null||impact?.expected===null||impact?.actual===undefined||impact?.expected===undefined?"No stable baseline":`${impact.actual.toFixed(1)} actual · ${impact.expected.toFixed(1)} expected ${impact.unit}`}</small>
        {impact?.signals.some((signal)=>signal.delta!==null)?<div className="mlab-impact-signals">{impact.signals.map((signal)=><span key={signal.label}><em>{signal.label}</em><b className={impactTone(signal.delta)}>{signal.delta===null?"—":signal.unit==="POINTS"?`${signedNumber(signal.delta*100,1)} pts`:signedNumber(signal.delta,2)}</b></span>)}</div>:null}
      </section>;
    })}</div>
  </article>;
}

function AnalogLaneCard({lane}:{lane:MatchupAnalogLane}){
  const primary=lane.candidates[0],secondary=lane.candidates[1];
  return <article className="mlab-analog-card">
    <header><span>{lane.label}</span><small>Closest to {lane.targetTeam}</small></header>
    {primary?<>
      <div className="mlab-analog-primary"><TeamMark name={primary.opponent} size="sm" logo={primary.logo}/><span><strong>{primary.opponent}</strong><small>Week {primary.week} · {primary.result} {primary.score}</small></span><b>{primary.similarity}%</b></div>
      <p className={impactTone(primary.delta)}>{primary.performance}</p>
      <div className="mlab-analog-comparison"><span><small>ACTUAL</small><strong>{primary.actual===null?"—":primary.actual.toFixed(1)}</strong></span><i>VS</i><span><small>EXPECTED {primary.unit}</small><strong>{primary.expected===null?"—":primary.expected.toFixed(1)}</strong></span></div>
      {secondary?<div className="mlab-analog-secondary"><TeamMark name={secondary.opponent} size="sm" logo={secondary.logo}/><span>{secondary.opponent}</span><b>{secondary.similarity}%</b></div>:null}
    </>:<div className="mlab-no-sample">No completed comparable opponent is available.</div>}
  </article>;
}

function MatchupFieldPanel({offense,defense,map}:{offense:TeamModel;defense:TeamModel;map:MatchupFieldMap|null}){
  if(!map)return <article className="mlab-field-card"><div className="mlab-no-sample">Advanced field-zone evidence is unavailable for this direction.</div></article>;
  const front=["LT","LG","C","RG","RT","TE"] as const;
  return <article className="mlab-field-card">
    <header><div><TeamMark name={offense.name} size="sm" logo={offense.logo}/><span><strong>{offense.name} OFFENSE</strong><small>VS {defense.name.toUpperCase()} DEFENSE</small></span></div><b>{map.source}</b></header>
    <div className="mlab-field-art" aria-label={`${offense.name} expected field success map against ${defense.name}`}>
      <div className="mlab-field-endzone"><span>PROJECTED PASS WINDOWS</span></div>
      <div className="mlab-pass-field">
        <div className="mlab-field-markings" aria-hidden="true"><span data-yard="30"/><span data-yard="20"/><span data-yard="10"/></div>
        <div className="mlab-field-zones">{map.zones.map((zone)=><div className={`mlab-field-zone ${zone.depth} ${zone.tone}`} key={zone.id} title={zone.detail}><small>{zone.label}</small><strong>{zone.score}</strong><span>{zone.tone==="strong"?"ATTACK":zone.tone==="weak"?"AVOID":"MIXED"}</span></div>)}</div>
      </div>
      <div className="mlab-field-los"><span>LINE OF SCRIMMAGE</span></div>
      <div className="mlab-offensive-front" aria-label="Five offensive linemen and one tight end with projected run gaps">
        {map.gaps.map((gap,index)=><div className="mlab-front-pair" key={gap.id}>
          <div className={`mlab-run-gap ${gap.tone}`} title={gap.detail}><small>{gap.side}</small><strong>{gap.label}</strong><b>{gap.score}</b></div>
          <div className={`mlab-front-player ${front[index]==="TE"?"tight-end":""}`}><i aria-hidden="true"/><strong>{front[index]}</strong></div>
        </div>)}
      </div>
      <div className="mlab-field-backfield"><span>RUN-GAP OUTLOOK · OFFENSE MOVING UPFIELD</span></div>
    </div>
    <div className="mlab-field-legend"><div><span className="strong">58+ ATTACK</span><span className="mixed">44–57 MIXED</span><span className="weak">BELOW 44 AVOID</span></div><p>{map.note}</p></div>
  </article>;
}

function AnalogTeamPanel({team,target,context}:{team:TeamModel;target:TeamModel;context:MatchupTeamContext|null}){
  return <article className="mlab-analogs-team">
    <header><div><TeamMark name={team.name} size="sm" logo={team.logo}/><span><strong>{team.name}</strong><small>HOW PRIOR MATCHUPS TRANSLATE TO {target.name.toUpperCase()}</small></span></div></header>
    <div>{context?.analogs.map((lane)=><AnalogLaneCard key={lane.id} lane={lane}/>)??<div className="mlab-no-sample">Comparable-game data is loading.</div>}</div>
  </article>;
}

function ExpectationPanel({team,context}:{team:TeamModel;context:MatchupTeamContext|null}){
  const expectation=context?.expectation;
  return <article className="mlab-expectation-team">
    <header><TeamMark name={team.name} size="sm" logo={team.logo}/><span><strong>{team.name}</strong><small>ACTUAL PERFORMANCE VS PREGAME MODEL</small></span></header>
    <div className="mlab-expectation-summary">
      <span><small>AVG MARGIN VS EXPECTED</small><strong className={impactTone((expectation?.averageMarginDelta??0)/10)}>{expectation?.averageMarginDelta===null||expectation?.averageMarginDelta===undefined?"—":signedNumber(expectation.averageMarginDelta)}</strong></span>
      <span><small>OFFENSE VS EXPECTED</small><strong className={impactTone((expectation?.averageOffenseDelta??0)/10)}>{expectation?.averageOffenseDelta===null||expectation?.averageOffenseDelta===undefined?"—":signedNumber(expectation.averageOffenseDelta)}</strong></span>
      <span><small>DEFENSE VS EXPECTED</small><strong className={impactTone((expectation?.averageDefenseDelta??0)/10)}>{expectation?.averageDefenseDelta===null||expectation?.averageDefenseDelta===undefined?"—":signedNumber(expectation.averageDefenseDelta)}</strong></span>
      <span><small>BEAT EXPECTATION</small><strong>{expectation?.sample?`${expectation.aboveExpected}/${expectation.sample}`:"—"}</strong></span>
    </div>
    <div className="mlab-expectation-games">{expectation?.games.length?expectation.games.map((game)=><div key={game.gameId}>
      <TeamMark name={game.opponent} size="sm" logo={game.logo}/><span><small>W{game.week}</small><strong>{game.opponent}</strong></span><b className={game.result==="W"?"positive":game.result==="L"?"negative":"neutral"}>{game.result} {game.actual}</b><em>EXP {game.expected}</em><strong className={impactTone(game.marginDelta/10)}>{signedNumber(game.marginDelta)}</strong>
    </div>):<p>No completed games with a pregame model receipt are available.</p>}</div>
  </article>;
}

function ViabilityPanel({team,viability}:{team:TeamModel;viability:OffensiveViability}){
  const primary=viability.primary;
  const scaleMaximum=primary?.id==="havoc"?.38:.65;
  const projected=primary?Math.max(0,Math.min(100,primary.projected/scaleMaximum*100)):0;
  const threshold=primary?Math.max(0,Math.min(100,primary.threshold/scaleMaximum*100)):50;
  const cushion=primary?(primary.higherIsBetter?primary.projected-primary.threshold:primary.threshold-primary.projected):null;
  return <article className={`mlab-viability ${viability.status.toLowerCase().replaceAll(" ","-")}`}>
    <header><TeamMark name={team.name} size="sm" logo={team.logo}/><span><strong>{team.name}</strong><small>OFFENSIVE STALL POINT</small></span><b>{viability.status}</b></header>
    {primary?<>
      <div className="mlab-threshold-head"><span><small>PRIMARY REQUIREMENT</small><strong>{primary.label}</strong></span><b className={cushion!==null&&cushion>=0?"positive":"negative"}>{cushion===null?"—":`${cushion>=0?"+":""}${(cushion*100).toFixed(1)} pts`}</b></div>
      <div className="mlab-threshold-meter" style={{"--projected":`${projected}%`,"--threshold":`${threshold}%`} as CSSProperties}><i/><b/></div>
      <div className="mlab-threshold-labels"><span>PROJECTED {(primary.projected*100).toFixed(1)}%</span><span>STALL LINE {(primary.threshold*100).toFixed(1)}%</span></div>
      <p>{primary.explanation}</p><small>{viability.alternativePath}</small>
      <div className="mlab-requirement-list">{viability.requirements.slice(0,4).map((row)=><span key={row.id}><em>{row.label}</em><b className={row.status==="Secure"?"positive":row.status==="Critical"||row.status==="At Risk"?"negative":"neutral"}>{(row.projected*100).toFixed(1)}%</b></span>)}</div>
    </>:<p>Advanced drive data is not complete enough to establish a stable stall point.</p>}
  </article>;
}

type MatchupAdvancedMetric={group:string;key:AdvancedMetricKey;label:string;format:"rate"|"number1"|"number2";description:string;projected:(row:AdvancedSideProjection)=>number|null};
const matchupAdvancedMetrics:MatchupAdvancedMetric[]=[
  {group:"OVERALL",key:"successRate",label:"Success rate",format:"rate",description:"Share of plays that meet down-and-distance success standards.",projected:(row)=>row.overall.successRate},
  {group:"OVERALL",key:"ppa",label:"PPA",format:"number2",description:"Expected scoring value added per play.",projected:(row)=>row.overall.ppa},
  {group:"OVERALL",key:"explosiveness",label:"Explosiveness",format:"number2",description:"Scoring value created by successful plays.",projected:(row)=>row.overall.explosiveness},
  {group:"OVERALL",key:"pointsPerDrive",label:"Points / drive",format:"number2",description:"Points scored per offensive possession.",projected:(row)=>row.overall.pointsPerDrive},
  {group:"OVERALL",key:"playsPerDrive",label:"Plays / drive",format:"number1",description:"Average number of offensive plays per possession.",projected:(row)=>row.overall.playsPerDrive},
  {group:"RUSHING",key:"lineYards",label:"Line yards",format:"number2",description:"CFBD line-yard proxy for blocking and front control.",projected:(row)=>row.run.lineYards},
  {group:"RUSHING",key:"secondLevelYards",label:"Second-level yards",format:"number2",description:"Rush production after clearing the defensive front.",projected:(row)=>row.run.secondLevelYards},
  {group:"RUSHING",key:"openFieldYards",label:"Open-field yards",format:"number2",description:"Rush production created in the open field.",projected:(row)=>row.run.openFieldYards},
  {group:"RUSHING",key:"stuffRate",label:"Stuff rate",format:"rate",description:"Share of carries stopped at or behind the line.",projected:(row)=>row.run.stuffRate},
  {group:"RUSHING",key:"powerSuccess",label:"Power success",format:"rate",description:"Short-yardage rushing conversion rate.",projected:(row)=>row.run.powerSuccess},
  {group:"RUSHING",key:"rushingSuccessRate",label:"Rush success",format:"rate",description:"Share of carries that meet down-and-distance success standards.",projected:(row)=>row.run.rushingSuccessRate},
  {group:"RUSHING",key:"rushingPpa",label:"Rush PPA",format:"number2",description:"Expected scoring value added per rushing play.",projected:(row)=>row.run.rushingPpa},
  {group:"PASSING",key:"completionRate",label:"Completion rate",format:"rate",description:"Completed passes divided by attempts.",projected:(row)=>row.pass.completionRate},
  {group:"PASSING",key:"yardsPerCompletion",label:"Yards / completion",format:"number1",description:"Passing yards divided by completed passes.",projected:(row)=>row.pass.yardsPerCompletion},
  {group:"PASSING",key:"passingSuccessRate",label:"Pass success",format:"rate",description:"Share of passes that meet down-and-distance success standards.",projected:(row)=>row.pass.passingSuccessRate},
  {group:"PASSING",key:"passingExplosiveness",label:"Pass explosiveness",format:"number2",description:"Scoring value created by successful passing plays.",projected:(row)=>row.pass.passingExplosiveness},
  {group:"PASSING",key:"passingPpa",label:"Pass PPA",format:"number2",description:"Expected scoring value added per passing play.",projected:(row)=>row.pass.passingPpa},
  {group:"DOWNS",key:"standardDownSuccessRate",label:"Standard-down success",format:"rate",description:"Efficiency before the offense enters an obvious passing situation.",projected:(row)=>row.pass.standardDownSuccessRate},
  {group:"DOWNS",key:"passingDownSuccessRate",label:"Passing-down success",format:"rate",description:"Efficiency when down and distance make a pass likely.",projected:(row)=>row.pass.passingDownSuccessRate},
  {group:"DISRUPTION",key:"havocRate",label:"Havoc exposure",format:"rate",description:"Rate of negative plays and disruptive defensive events faced by the offense.",projected:(row)=>row.overall.havocRate},
  {group:"DISRUPTION",key:"frontSevenHavoc",label:"Front-7 havoc",format:"rate",description:"Disruption created by the defensive front and linebackers.",projected:(row)=>row.overall.frontSevenHavoc},
  {group:"DISRUPTION",key:"dbHavoc",label:"DB havoc",format:"rate",description:"Disruption created by the secondary.",projected:(row)=>row.overall.dbHavoc},
];

function formatAdvanced(value:number|null|undefined,format:MatchupAdvancedMetric["format"]){
  if(value===null||value===undefined||!Number.isFinite(value))return"—";
  return format==="rate"?`${(value*100).toFixed(1)}%`:value.toFixed(format==="number1"?1:2);
}
function advancedIndexTone(value:number|null|undefined,defense=false){return value===null||value===undefined?"neutral":defense?(value<=.97?"positive":value>=1.03?"negative":"neutral"):(value>=1.03?"positive":value<=.97?"negative":"neutral");}

function AdvancedDirectionPanel({offense,defense,offenseProfile,defenseProfile,projection}:{offense:TeamModel;defense:TeamModel;offenseProfile:AdvancedProfile|null|undefined;defenseProfile:AdvancedProfile|null|undefined;projection:AdvancedSideProjection|null|undefined}){
  const available=matchupAdvancedMetrics.filter((metric)=>(offenseProfile?.offense.raw[metric.key]??null)!==null||(defenseProfile?.defense.raw[metric.key]??null)!==null||(projection?metric.projected(projection)!==null:false));
  return <article className="mlab-advanced-direction">
    <header><div><TeamMark name={offense.name} size="sm" logo={offense.logo}/><span><strong>{offense.name} OFFENSE</strong><small>VS {defense.name.toUpperCase()} DEFENSE</small></span></div><TeamMark name={defense.name} size="sm" logo={defense.logo}/></header>
    <div className="mlab-advanced-labels"><span>CFBD METRIC</span><span>{offense.abbr} OFF</span><span>{defense.abbr} DEF</span><span>PROJECTED</span></div>
    <div>{available.map((metric,index)=>{
      const groupChanged=index===0||metric.group!==available[index-1]?.group;
      const offenseRaw=offenseProfile?.offense.raw[metric.key]??null,defenseRaw=defenseProfile?.defense.raw[metric.key]??null;
      const offenseIndex=offenseProfile?.offense.index[metric.key]??null,defenseIndex=defenseProfile?.defense.index[metric.key]??null;
      const projected=projection?metric.projected(projection):null;
      return <div className="mlab-advanced-row-wrap" key={metric.key}>{groupChanged?<b className="mlab-advanced-group">{metric.group}</b>:null}<div className="mlab-advanced-row">
        <strong><StatLabel label={metric.label} explanation={metric.description}/></strong>
        <span className={advancedIndexTone(offenseIndex)}><b>{formatAdvanced(offenseRaw,metric.format)}</b><small>{offenseIndex===null?"—":`${(offenseIndex*100).toFixed(0)}% AVG`}</small></span>
        <span className={advancedIndexTone(defenseIndex,true)}><b>{formatAdvanced(defenseRaw,metric.format)}</b><small>{defenseIndex===null?"—":`${(defenseIndex*100).toFixed(0)}% ALLOWED`}</small></span>
        <em>{formatAdvanced(projected,metric.format)}</em>
      </div></div>;
    })}</div>
  </article>;
}

function conditionTarget(condition:WinCondition){
  return `${condition.higherIsBetter?"≥":"≤"} ${formatWinConditionValue(condition.threshold,condition.unit)}`;
}

function conditionBaseline(condition:WinCondition){
  return formatWinConditionValue(condition.baseline,condition.unit);
}

function WinConditionTeamPanel({team,logo,analysis,values}:{team:TeamModel;logo?:string;analysis:WinConditionTeamAnalysis;values?:Record<string,number>}){
  return <article className="wc-team-panel">
    <header><TeamMark name={team.name} size="sm" logo={logo??team.logo}/><span><small>{team.abbr} WIN CONDITIONS</small><strong>{team.name}</strong></span></header>
    <div className="wc-condition-list">{analysis.conditions.map((condition)=>{
      const current=values?.[condition.variableKey];
      const achieved=current===undefined?null:condition.higherIsBetter?current>=condition.threshold:current<=condition.threshold;
      return <article key={condition.id} data-achieved={achieved===null?undefined:achieved}>
        <div><span>{condition.category}</span><strong>{condition.label}</strong><p>{condition.explanation}</p></div>
        <dl><div><dt>TARGET</dt><dd>{conditionTarget(condition)}</dd></div><div><dt>H+ BASELINE</dt><dd>{conditionBaseline(condition)}</dd></div><div><dt>CHANCE</dt><dd>{Math.round(condition.achievementProbability*100)}%</dd></div><div><dt>WIN IF HIT</dt><dd>{Math.round(condition.winProbabilityIfAchieved*100)}%</dd></div><div><dt>IMPROVEMENT</dt><dd>{condition.requiredStandardDeviations.toFixed(1)}σ</dd></div></dl>
        {achieved!==null?<em>{achieved?"SCENARIO HITS TARGET":"SCENARIO BELOW TARGET"}</em>:null}
      </article>;
    })}</div>
  </article>;
}

function WinConditionPaths({team,logo,analysis,homeTeam,awayTeam}:{team:TeamModel;logo?:string;analysis:WinConditionTeamAnalysis;homeTeam:string;awayTeam:string}){
  return <article className="wc-path-team">
    <header><TeamMark name={team.name} size="sm" logo={logo??team.logo}/><span><small>REALISTIC WINNING SCRIPTS</small><strong>{team.name}</strong></span></header>
    <div>{analysis.paths.length?analysis.paths.map((path)=><article key={path.id}>
      <header><span>{path.label}</span><strong>{Math.round(path.occurrenceProbability*100)}% OF ALL SIMS</strong></header>
      <p>{path.explanation}</p>
      <div><b>{Math.round(path.winProbabilityWithinPath*100)}% win inside path</b><span>Typical: {gameTeamCode(homeTeam)} {Math.round(path.typicalHomeScore)} · {gameTeamCode(awayTeam)} {Math.round(path.typicalAwayScore)}</span></div>
      <ul>{path.definingConditions.slice(0,3).map((condition)=><li key={condition}>{condition}</li>)}</ul>
    </article>):<p className="wc-empty-copy">No single cluster clears the realism threshold; this team needs a more blended path.</p>}</div>
  </article>;
}

function GameScriptMap({analysis}:{analysis:WinConditionAnalysis}){
  const regular=analysis.clusters.filter((cluster)=>!cluster.chaos);
  const chaos=analysis.clusters.filter((cluster)=>cluster.chaos);
  const [selectedId,setSelectedId]=useState(analysis.clusters[0]?.id??"");
  const activeId=analysis.clusters.some((cluster)=>cluster.id===selectedId)?selectedId:analysis.clusters[0]?.id??"";
  const selected=analysis.clusters.find((cluster)=>cluster.id===activeId)??analysis.clusters[0];
  const totals=regular.map((cluster)=>cluster.total);
  const minimumTotal=Math.min(analysis.baseline.modelTotal-16,...totals),maximumTotal=Math.max(analysis.baseline.modelTotal+16,...totals);
  const position=(cluster:GameScriptCluster)=>({
    left:`${7+86*(Math.max(-30,Math.min(30,cluster.homeMargin))+30)/60}%`,
    bottom:`${8+82*(cluster.total-minimumTotal)/Math.max(1,maximumTotal-minimumTotal)}%`,
    "--script-size":`${Math.max(42,Math.min(92,35+cluster.occurrenceProbability*210))}px`,
  } as CSSProperties);
  if(!analysis.clusters.length)return <div className="wc-empty-copy">Game-script clusters need more point-in-time team data.</div>;
  return <section className="wc-script-section">
    <header><div><span>07 · GAME SCRIPT MAP</span><h2>The full simulation distribution</h2><p>Horizontal position shows which team benefits. Vertical position shows the scoring environment. Bubble size represents frequency.</p></div></header>
    <div className="wc-script-layout">
      <div className="wc-script-map" aria-label="Game script simulation map">
        <span className="wc-map-y-high">HIGHER SCORING</span><span className="wc-map-y-low">LOWER SCORING</span>
        <span className="wc-map-x-home">{analysis.baseline.homeTeam.toUpperCase()} EDGE</span><span className="wc-map-x-away">{analysis.baseline.awayTeam.toUpperCase()} EDGE</span><i className="wc-map-axis-x"/><i className="wc-map-axis-y"/>
        {regular.map((cluster)=><button key={cluster.id} type="button" className={cluster.id===activeId?"active":""} style={position(cluster)} onClick={()=>setSelectedId(cluster.id)} onMouseEnter={()=>setSelectedId(cluster.id)} aria-label={`${cluster.label}, ${Math.round(cluster.occurrenceProbability*100)} percent of simulations`}><strong>{Math.round(cluster.occurrenceProbability*100)}%</strong><small>{cluster.label}</small></button>)}
      </div>
      {selected?<article className="wc-script-detail"><span>{selected.label}</span><strong>{Math.round(selected.typicalHomeScore)}–{Math.round(selected.typicalAwayScore)}</strong><small>{Math.round(selected.occurrenceProbability*100)}% OF SIMULATIONS · {selected.beneficiary.toUpperCase()} BENEFITS</small><p>{selected.explanation}</p><ul>{selected.definingCharacteristics.map((characteristic)=><li key={characteristic}>{characteristic}</li>)}</ul></article>:null}
    </div>
    {chaos.length?<div className="wc-chaos-row"><strong>TURNOVER / CHAOS SCRIPTS</strong>{chaos.map((cluster)=><button type="button" key={cluster.id} onClick={()=>setSelectedId(cluster.id)}><span>{cluster.label}</span><b>{Math.round(cluster.occurrenceProbability*100)}%</b><small>{Math.round(cluster.typicalHomeScore)}–{Math.round(cluster.typicalAwayScore)}</small></button>)}</div>:null}
  </section>;
}

function WinConditionScenarioLab({analysis}:{analysis:WinConditionAnalysis}){
  const variables=useMemo(()=>analysis.variables.filter((variable)=>variable.importance>.01).sort((left,right)=>right.importance-left.importance).slice(0,6),[analysis]);
  const analysisKey=`${analysis.baseline.homeTeam}:${analysis.baseline.awayTeam}:${analysis.generatedFromWeek.home}:${analysis.generatedFromWeek.away}`;
  const [overrideState,setOverrideState]=useState<{key:string;values:Record<string,number>}>({key:analysisKey,values:{}});
  const overrides=useMemo(()=>overrideState.key===analysisKey?overrideState.values:{},[analysisKey,overrideState]);
  const setOverrides=(next:Record<string,number>|((current:Record<string,number>)=>Record<string,number>))=>setOverrideState((current)=>{
    const values=current.key===analysisKey?current.values:{};
    return{key:analysisKey,values:typeof next==="function"?next(values):next};
  });
  const scenario=useMemo(()=>evaluateWinConditionScenario(analysis,overrides),[analysis,overrides]);
  const values=useMemo(()=>Object.fromEntries(analysis.variables.map((variable)=>[variable.key,overrides[variable.key]??variable.baseline])),[analysis,overrides]);
  const changed=Object.keys(overrides).length>0;
  return <section className="wc-scenario-section">
    <header><div><span>06 · INTERACTIVE SCENARIO LAB</span><h2>What has to change for the prediction to move?</h2><p>Only the matchup&apos;s most influential variables are exposed. Every range comes from historical team distributions and physical football limits.</p></div><button type="button" disabled={!changed} onClick={()=>setOverrides({})}>RESET TO H+ PROJECTION</button></header>
    <div className="wc-live-score"><article><small>{analysis.baseline.homeTeam}</small><strong>{scenario.homeScore.toFixed(1)}</strong><span>{Math.round(scenario.homeWinProbability*100)}% WIN</span><em>WIDTH {scenario.homePathWidth??"—"} · FRAGILITY {scenario.homeFragility??"—"}</em></article><i>SCENARIO</i><article><small>{analysis.baseline.awayTeam}</small><strong>{scenario.awayScore.toFixed(1)}</strong><span>{Math.round((1-scenario.homeWinProbability)*100)}% WIN</span><em>WIDTH {scenario.awayPathWidth??"—"} · FRAGILITY {scenario.awayFragility??"—"}</em></article></div>
    <div className="wc-slider-grid">{variables.map((variable)=>{
      const value=values[variable.key];
      return <label key={variable.key}><span><strong>{variable.team?`${variable.team} · `:""}{variable.shortLabel}</strong><b>{formatWinConditionValue(value,variable.unit)}</b></span><input type="range" min={variable.minimum} max={variable.maximum} step={variable.step} value={value} onChange={(event)=>{
        const next=Number(event.target.value);
        setOverrides((current)=>Math.abs(next-variable.baseline)<variable.step/2?Object.fromEntries(Object.entries(current).filter(([key])=>key!==variable.key)):{...current,[variable.key]:next});
      }}/><small><span>{formatWinConditionValue(variable.minimum,variable.unit)}</span><em>H+ {formatWinConditionValue(variable.baseline,variable.unit)}</em><span>{formatWinConditionValue(variable.maximum,variable.unit)}</span></small><p>{variable.explanation}</p></label>;
    })}</div>
    {changed?<details className="wc-scenario-conditions"><summary>Updated condition check</summary><div><WinConditionTeamPanel team={{...teamMap.get(analysis.home.team),name:analysis.home.team,abbr:gameTeamCode(analysis.home.team)} as TeamModel} analysis={analysis.home} values={values}/><WinConditionTeamPanel team={{...teamMap.get(analysis.away.team),name:analysis.away.team,abbr:gameTeamCode(analysis.away.team)} as TeamModel} analysis={analysis.away} values={values}/></div></details>:null}
  </section>;
}

function WinConditionsWorkspace({request,first,second,homeSeason,awaySeason,homeWeek,awayWeek,market}:{request:WinConditionRequest;first:TeamModel;second:TeamModel;homeSeason:number;awaySeason:number;homeWeek:number;awayWeek:number;market:ScheduleRow|null}){
  const winConditions=useWinConditions(request,true);
  const homeRanks=useProjectedFinalRanks(homeSeason,homeWeek);
  const awayRanks=useProjectedFinalRanks(awaySeason,awayWeek);
  const homeRankRow=homeRanks.data?.rankings.find((row)=>row.team===first.name),awayRankRow=awayRanks.data?.rankings.find((row)=>row.team===second.name);
  const homeRank=homeRankRow?.rank,awayRank=awayRankRow?.rank;
  const payload=winConditions.data,analysis=payload?.analysis;
  if(winConditions.loading)return <div className="wc-loading"><span>H+ WIN CONDITIONS</span><strong>Running correlated matchup simulations…</strong><p>The canonical projection is fixed first; historical game scripts are being clustered around it.</p></div>;
  if(!analysis)return <div className="data-empty"><strong>{winConditions.error||"Win Conditions are unavailable for this matchup."}</strong><span>The standard Matchup Analysis remains available.</span></div>;
  const baseline=analysis.baseline;
  const homeIdentity=payload?.teams?.home,awayIdentity=payload?.teams?.away;
  const modelFavorite=baseline.modelHomeSpread<=0?first:second;
  const marketRead=market?`${compactMarketSpreadLabel(market)} · ${marketTotalLabel(market)}`:"—";
  const metric=(teamAnalysis:WinConditionTeamAnalysis,label:"pathWidth"|"fragility")=>teamAnalysis[label]===null?"—":teamAnalysis[label];
  return <div className="win-conditions-workspace">
    <section className="wc-summary">
      <article><TeamMark name={first.name} size="lg" logo={first.logo}/><span>{homeRank&&homeRank<=25?<em>H+ #{homeRank}</em>:null}<strong data-compact-name={first.abbr} title={first.name}>{first.name}</strong><small title={`${homeSeason} · ${homeIdentity?.record??homeRankRow?.projectedRecord??"—"} · ${first.conference}`}>{homeSeason} · {homeIdentity?.record??homeRankRow?.projectedRecord??"—"} · {first.conference}</small></span><b>{baseline.homeScore.toFixed(1)}</b></article>
      <div><span>H+ MATCHUP PROJECTION</span><strong>{modelFavorite.abbr} -{Math.abs(baseline.modelHomeSpread).toFixed(1)}</strong><small>Total {baseline.modelTotal.toFixed(1)} · {baseline.neutralSite?"Neutral site":`${first.name} home`}</small><p>{baseline.interpretation}</p><em>MARKET {marketRead}</em></div>
      <article><b>{baseline.awayScore.toFixed(1)}</b><span>{awayRank&&awayRank<=25?<em>H+ #{awayRank}</em>:null}<strong data-compact-name={second.abbr} title={second.name}>{second.name}</strong><small title={`${awaySeason} · ${awayIdentity?.record??awayRankRow?.projectedRecord??"—"} · ${second.conference}`}>{awaySeason} · {awayIdentity?.record??awayRankRow?.projectedRecord??"—"} · {second.conference}</small></span><TeamMark name={second.name} size="lg" logo={second.logo}/></article>
    </section>
    <section className="wc-core-metrics">
      {[analysis.home,analysis.away].map((teamAnalysis,index)=><article key={teamAnalysis.side}><header><TeamMark name={teamAnalysis.team} size="sm" logo={index===0?first.logo:second.logo}/><strong>{teamAnalysis.team}</strong></header><div><span><small>WIN PROBABILITY<StatHelp label="Win probability" explanation="How often this team wins across the H+ correlated matchup distribution."/></small><b>{Math.round(teamAnalysis.winProbability*100)}%</b></span><span><small>H+ PATH WIDTH<StatHelp label="H+ Path Width" explanation="A 0–100 score for the breadth and diversity of materially different, realistic winning scripts. It is conditional on how the team wins, so it does not mirror win probability."/></small><b>{metric(teamAnalysis,"pathWidth")}</b></span><span><small>H+ FRAGILITY<StatHelp label="H+ Fragility" explanation="A 0–100 local stress score measuring how quickly the projected edge deteriorates when important variables move 0.75 historical standard deviations against the team."/></small><b>{metric(teamAnalysis,"fragility")}</b></span></div></article>)}
    </section>
    {analysis.dataQuality!=="full"?<p className="wc-quality-note"><strong>{analysis.dataQuality==="baseline-only"?"BASELINE PROJECTION ONLY":"LIMITED WIN-CONDITION SAMPLE"}</strong> {analysis.dataQuality==="baseline-only"?"The selected snapshot does not contain enough reliable team-game vectors to force thresholds or clusters.":"Thresholds are available, but the selected point-in-time sample is thinner than the full H+ standard."}</p>:null}
    {analysis.easiestUpsetPath?<section className="wc-upset-path"><header><span>03 · EASIEST REALISTIC UPSET PATH</span><h2>{analysis.easiestUpsetPath.underdog}: the most attainable flip</h2></header><div><strong>{Math.round(analysis.easiestUpsetPath.scenarioWinProbability*100)}% WIN</strong><span>TYPICAL {Math.round(analysis.easiestUpsetPath.typicalHomeScore)}–{Math.round(analysis.easiestUpsetPath.typicalAwayScore)}</span><span>{Math.max(1,Math.round(analysis.easiestUpsetPath.estimatedOccurrenceProbability*100))}% EST. OCCURRENCE</span></div><ul>{analysis.easiestUpsetPath.conditions.map((condition)=><li key={condition.label}><span>{condition.label}</span><b>{formatWinConditionValue(condition.value,condition.unit)}</b><small>from {formatWinConditionValue(condition.baseline,condition.unit)} · {condition.standardDeviations.toFixed(1)}σ</small></li>)}</ul><p>{analysis.easiestUpsetPath.explanation}</p></section>:null}
    {analysis.dataQuality!=="baseline-only"?<>
      <section className="wc-section-heading"><span>04 · INDIVIDUAL WIN CONDITIONS</span><h2>The matchup variables with the largest winning impact</h2><p>Targets are opponent-adjusted and evaluated inside the correlated simulation, not copied from generic national averages.</p></section>
      <div className="wc-team-grid"><WinConditionTeamPanel team={first} analysis={analysis.home}/><WinConditionTeamPanel team={second} analysis={analysis.away}/></div>
      <section className="wc-section-heading"><span>05 · PATHS TO VICTORY</span><h2>Distinct combinations that survive the realism test</h2><p>Paths are clustered from complete simulations and ranked by how often they occur, not by the most extreme conditional win rate.</p></section>
      <div className="wc-path-grid"><WinConditionPaths team={first} analysis={analysis.home} homeTeam={analysis.baseline.homeTeam} awayTeam={analysis.baseline.awayTeam}/><WinConditionPaths team={second} analysis={analysis.away} homeTeam={analysis.baseline.homeTeam} awayTeam={analysis.baseline.awayTeam}/></div>
      <WinConditionScenarioLab analysis={analysis}/><GameScriptMap analysis={analysis}/>
    </>:null}
    <details className="wc-methodology"><summary>FORMULAS + ASSUMPTIONS</summary><p>{analysis.methodology}</p><code>Path Width = 55% winning-script entropy + 25% effective number of winning clusters + 20% attainable condition-family breadth.</code><code>Fragility = 60% largest local win-probability loss + 40% mean of the three largest losses under adverse 0.75σ stresses.</code></details>
    <p className="wc-sample-note">{analysis.simulationCount.toLocaleString()} deterministic Monte Carlo draws · historical samples {analysis.historicalSampleSize.home}/{analysis.historicalSampleSize.away} · generated from Week {analysis.generatedFromWeek.home}/Week {analysis.generatedFromWeek.away}</p>
  </div>;
}

function MatchupLabV2({season,week,setSeason,setWeek,launch}:{season:number;week:number;setSeason:(value:number)=>void;setWeek:(value:number)=>void;launch?:MatchupLaunch|null}){
  const [firstName,setFirstName]=useState(launch?.homeTeam??"Indiana");
  const [secondName,setSecondName]=useState(launch?.awayTeam??"Ohio State");
  const [secondSeason,setSecondSeason]=useState(season);
  const [secondWeek,setSecondWeek]=useState(week);
  const [neutral,setNeutral]=useState(launch?.neutralSite??true);
  const [activeWorkspaceTab,setActiveWorkspaceTab]=useState<"analysis"|"win-conditions">(launch?"win-conditions":"analysis");
  const [launchedGameId,setLaunchedGameId]=useState<string|null>(launch?.gameId??null);
  const firstDynamic=useDynamicProfiles(season,week);
  const secondDynamic=useDynamicProfiles(secondSeason,secondWeek);
  const firstLookup=useMemo(()=>new Map(firstDynamic.teams.map((team)=>[team.name,team])),[firstDynamic.teams]);
  const secondLookup=useMemo(()=>new Map(secondDynamic.teams.map((team)=>[team.name,team])),[secondDynamic.teams]);
  const sameVintage=season===secondSeason&&week===secondWeek;
  const firstResolved=firstLookup.has(firstName)?firstName:(firstLookup.has("Indiana")?"Indiana":firstDynamic.teams[0]?.name);
  const secondCandidate=secondLookup.has(secondName)?secondName:undefined;
  const secondResolved=secondCandidate&&(!sameVintage||secondCandidate!==firstResolved)
    ? secondCandidate
    : secondLookup.has("Ohio State")&&(!sameVintage||firstResolved!=="Ohio State")
      ? "Ohio State"
      : secondDynamic.teams.find((team)=>!sameVintage||team.name!==firstResolved)?.name;
  const first=firstResolved?firstLookup.get(firstResolved):undefined,second=secondResolved?secondLookup.get(secondResolved):undefined;
  const projection=useMemo(()=>first&&second?projectMatchup(first,second,week,neutral,secondWeek,{home:first.name,away:second.name}):null,[first,neutral,second,secondWeek,week]);
  const firstRow=first?(firstDynamic.rows.find((row)=>row.team===first.name)??modelTeamProfileRow(first,season,week)):null;
  const secondRow=second?(secondDynamic.rows.find((row)=>row.team===second.name)??modelTeamProfileRow(second,secondSeason,secondWeek)):null;
  const intelligence=useMemo(()=>projection?.homeStats.advanced&&projection.awayStats.advanced&&firstRow&&secondRow?deriveMatchupIntelligence({homeTeam:firstRow.team,awayTeam:secondRow.team,homeProjection:projection.homeStats.advanced,awayProjection:projection.awayStats.advanced,homeProfile:firstRow,awayProfile:secondRow}):null,[firstRow,projection,secondRow]);
  const context=useMatchupLabContext(season,week,sameVintage?first?.name:undefined,sameVintage?second?.name:undefined);
  const firstPffEligible=season===2025&&week>=16;
  const secondPffEligible=secondSeason===2025&&secondWeek>=16;
  const pffFieldEligible=firstPffEligible||secondPffEligible;
  const pffPassingDepth=usePffTable("passing-depth",pffFieldEligible);
  const pffRunBlocking=usePffTable("run-blockng",pffFieldEligible);
  const market=useMatchupMarket(Boolean(first&&second&&sameVintage),season,week,first?.name,second?.name);
  const winConditionRequest=useMemo<WinConditionRequest|null>(()=>first&&second?(launchedGameId?{kind:"game",season,gameId:launchedGameId}:{kind:"matchup",homeTeam:first.name,awayTeam:second.name,homeSeason:season,awaySeason:secondSeason,homeWeek:week,awayWeek:secondWeek,neutralSite:neutral}):null,[first,launchedGameId,neutral,season,second,secondSeason,secondWeek,week]);
  const swap=()=>{if(!firstResolved||!secondResolved)return;setLaunchedGameId(null);const priorSeason=season,priorWeek=week;setFirstName(secondResolved);setSecondName(firstResolved);setSeason(secondSeason);setWeek(secondWeek);setSecondSeason(priorSeason);setSecondWeek(priorWeek);};
  const favored=projection&&first&&second?(projection.margin>=0?first:second):undefined;
  const underdog=projection&&first&&second?(projection.margin>=0?second:first):undefined;
  const favoredLabel=favored===first?`${season} ${first?.name??""}`:`${secondSeason} ${second?.name??""}`;
  const favoredWin=projection?Math.max(projection.homeWin,1-projection.homeWin):0;
  const favoredCards=intelligence&&favored?[...intelligence.homeCards,...intelligence.awayCards].filter((card)=>card.edgeTeam===favored.name).sort((left,right)=>Math.abs(right.score-50)-Math.abs(left.score-50)):[];
  const winningEdge=favoredCards[0];
  const underdogViability=projection&&underdog?(underdog===first?projection.homeStats.viability:projection.awayStats.viability):null;
  const favoredStats=projection&&favored?(favored===first?projection.homeStats:projection.awayStats):null;
  const underdogStats=projection&&underdog?(underdog===first?projection.homeStats:projection.awayStats):null;
  const fallbackWhy=favored&&underdog&&favoredStats&&underdogStats
    ? favoredStats.ypa-underdogStats.ypa>=favoredStats.ypc-underdogStats.ypc
      ? `${favored.name} is favored because its passing game projects to stay on schedule against ${underdog.name}'s coverage structure, creating the cleaner path to sustained scoring drives.`
      : `${favored.name} is favored because its run game projects to keep the offense ahead of the chains against ${underdog.name}'s front, protecting the preferred game script.`
    : projection?.edgeAnalysis.summary??"Select two teams with a loaded weekly profile.";
  const why=favored&&projection
    ? winningEdge
      ? `${favored.name} is favored because ${winningEdge.label.toLowerCase()} gives it the clearest football advantage. ${winningEdge.impact} ${winningEdge.drivers.slice(0,2).join(" · ")}.`
      : fallbackWhy
    : "Select two teams with a loaded weekly profile.";
  const edgeIds=["run","pass","comfort","explosive","third"];
  const edgeLanes=intelligence?edgeIds.flatMap((id)=>{
    const firstCard=intelligence.homeCards.find((card)=>card.id===id),secondCard=intelligence.awayCards.find((card)=>card.id===id);
    return firstCard&&secondCard?[{id,label:firstCard.label,firstCard,secondCard,edge:firstCard.score-secondCard.score}]:[];
  }):[];
  const biggest=intelligence?[...intelligence.homeCards,...intelligence.awayCards].sort((left,right)=>Math.abs(right.score-50)-Math.abs(left.score-50))[0]:null;
  const projectedRows=projection?[{label:"TOTAL YARDS",first:projection.homeStats.ypp*(projection.homeStats.patt+projection.homeStats.ratt),second:projection.awayStats.ypp*(projection.awayStats.patt+projection.awayStats.ratt),digits:0},{label:"YARDS / PLAY",first:projection.homeStats.ypp,second:projection.awayStats.ypp,digits:1},{label:"PASS YPA",first:projection.homeStats.ypa,second:projection.awayStats.ypa,digits:1},{label:"RUSH YPC",first:projection.homeStats.ypc,second:projection.awayStats.ypc,digits:1},{label:"PASS ATT",first:projection.homeStats.patt,second:projection.awayStats.patt,digits:0},{label:"RUSH ATT",first:projection.homeStats.ratt,second:projection.awayStats.ratt,digits:0}]:[];
  const firstPffDirectory=useMemo(()=>firstDynamic.rows.map((row)=>({team:row.team,abbreviation:row.abbreviation,conference:row.conference,color:row.color,altColor:row.altColor,logo:row.logo})),[firstDynamic.rows]);
  const secondPffDirectory=useMemo(()=>secondDynamic.rows.map((row)=>({team:row.team,abbreviation:row.abbreviation,conference:row.conference,color:row.color,altColor:row.altColor,logo:row.logo})),[secondDynamic.rows]);
  const firstPffField=useMemo(()=>first&&firstPffEligible?buildPffFieldTendency(first.name,firstPffDirectory,pffPassingDepth.payload,pffRunBlocking.payload):null,[first,firstPffDirectory,firstPffEligible,pffPassingDepth.payload,pffRunBlocking.payload]);
  const secondPffField=useMemo(()=>second&&secondPffEligible?buildPffFieldTendency(second.name,secondPffDirectory,pffPassingDepth.payload,pffRunBlocking.payload):null,[secondPffDirectory,pffPassingDepth.payload,pffRunBlocking.payload,second,secondPffEligible]);
  const firstFieldMap=useMemo(()=>projection?.homeStats.advanced?buildMatchupFieldMap(projection.homeStats.advanced,firstPffField):null,[firstPffField,projection]);
  const secondFieldMap=useMemo(()=>projection?.awayStats.advanced?buildMatchupFieldMap(projection.awayStats.advanced,secondPffField):null,[projection,secondPffField]);
  const selectFirstTeam=(name:string)=>{setLaunchedGameId(null);setFirstName(name);};
  const selectSecondTeam=(name:string)=>{setLaunchedGameId(null);setSecondName(name);};

  return <section className="page-section matchup-page matchup-lab-v2">
    <header className="mlab-title"><div><span>CFBD ADVANCED · HARPER+ MATCHUP ENGINE</span><h1>Matchup Lab</h1><p>See the projected result, the decisive football matchup, and the prior-game evidence that supports it.</p></div></header>
    <div className="mlab-controls">
      <label className="mlab-vintage-select"><span>YEAR 1</span><select aria-label="Team 1 season" value={season} onChange={(event)=>{setLaunchedGameId(null);setSeason(Number(event.target.value));}}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label className="mlab-vintage-select"><span>WEEK 1</span><select aria-label="Team 1 week" value={week} onChange={(event)=>{setLaunchedGameId(null);setWeek(Number(event.target.value));}}>{Array.from({length:17},(_,index)=><option value={index} key={index}>{index===16?"Final":`Week ${index}`}</option>)}</select></label>
      <label className="mlab-team-select mlab-first-team"><span>TEAM 1</span><select className="mlab-team-name-full" aria-label="Team 1" value={first?.name??""} onChange={(event)=>selectFirstTeam(event.target.value)}>{firstDynamic.teams.map((team)=><option key={team.name} value={team.name} disabled={sameVintage&&team.name===second?.name}>{team.name}</option>)}</select><select className="mlab-team-name-short" aria-label="Team 1 abbreviation" title={first?.name} value={first?.name??""} onChange={(event)=>selectFirstTeam(event.target.value)}>{firstDynamic.teams.map((team)=><option key={team.name} value={team.name} disabled={sameVintage&&team.name===second?.name}>{team.abbr||gameTeamCode(team.name)}</option>)}</select></label>
      <button type="button" onClick={swap} aria-label="Swap teams">⇄</button>
      <label className="mlab-vintage-select"><span>YEAR 2</span><select aria-label="Team 2 season" value={secondSeason} onChange={(event)=>{setLaunchedGameId(null);setSecondSeason(Number(event.target.value));}}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label className="mlab-vintage-select"><span>WEEK 2</span><select aria-label="Team 2 week" value={secondWeek} onChange={(event)=>{setLaunchedGameId(null);setSecondWeek(Number(event.target.value));}}>{Array.from({length:17},(_,index)=><option value={index} key={index}>{index===16?"Final":`Week ${index}`}</option>)}</select></label>
      <label className="mlab-team-select mlab-second-team"><span>TEAM 2</span><select className="mlab-team-name-full" aria-label="Team 2" value={second?.name??""} onChange={(event)=>selectSecondTeam(event.target.value)}>{secondDynamic.teams.map((team)=><option key={team.name} value={team.name} disabled={sameVintage&&team.name===first?.name}>{team.name}</option>)}</select><select className="mlab-team-name-short" aria-label="Team 2 abbreviation" title={second?.name} value={second?.name??""} onChange={(event)=>selectSecondTeam(event.target.value)}>{secondDynamic.teams.map((team)=><option key={team.name} value={team.name} disabled={sameVintage&&team.name===first?.name}>{team.abbr||gameTeamCode(team.name)}</option>)}</select></label>
      <label className="mlab-site-toggle"><input type="checkbox" aria-label="Neutral site" checked={neutral} onChange={(event)=>{setLaunchedGameId(null);setNeutral(event.target.checked);}}/><span>NEUTRAL SITE</span></label>
    </div>
    <nav className="mlab-workspace-tabs" role="tablist" aria-label="Matchup Lab views"><button type="button" role="tab" aria-selected={activeWorkspaceTab==="analysis"} onClick={()=>setActiveWorkspaceTab("analysis")}><span>MATCHUP ANALYSIS</span><small>Edges, evidence, advanced profile</small></button><button type="button" role="tab" aria-selected={activeWorkspaceTab==="win-conditions"} onClick={()=>setActiveWorkspaceTab("win-conditions")}><span>WIN CONDITIONS</span><small>Paths, scenarios, script map</small></button></nav>
    {firstDynamic.loading||secondDynamic.loading||!first||!second?<div className="data-empty"><strong>The selected weekly snapshots are loading.</strong><span>Matchup analysis appears when both team profiles are ready.</span></div>:projection?activeWorkspaceTab==="win-conditions"&&winConditionRequest?<WinConditionsWorkspace request={winConditionRequest} first={first} second={second} homeSeason={season} awaySeason={secondSeason} homeWeek={week} awayWeek={secondWeek} market={market}/>:<>
      <section className="mlab-scoreboard">
        <article><div className="mlab-team-lockup"><TeamMark name={first.name} size="lg" logo={first.logo}/><strong>{first.name}</strong><small>{season} · {context.payload?.home.record??`W${week} SNAPSHOT`} · {first.conference}</small></div><span className="mlab-score"><b>{projection.homeScore.toFixed(0)}</b><em>{(projection.homeWin*100).toFixed(0)}%</em></span></article>
        <div><span>PROJECTED</span><strong>{favoredLabel} by {Math.abs(projection.margin).toFixed(1)}</strong><small>{neutral?"Neutral site":`${season} ${first.name} home`} · Total {projection.total.toFixed(1)}</small><i>{projection.edgeAnalysis.intelligence?.confidence??projection.edgeAnalysis.confidence} confidence</i></div>
        <article><div className="mlab-team-lockup"><TeamMark name={second.name} size="lg" logo={second.logo}/><strong>{second.name}</strong><small>{secondSeason} · {context.payload?.away.record??`W${secondWeek} SNAPSHOT`} · {second.conference}</small></div><span className="mlab-score"><b>{projection.awayScore.toFixed(0)}</b><em>{((1-projection.homeWin)*100).toFixed(0)}%</em></span></article>
        <p><strong>WHY {favored?.name.toUpperCase()}</strong> {why}{underdogViability&&(underdogViability.status==="At Risk"||underdogViability.status==="Critical")?` ${underdog?.name}'s offense also projects near a functional stall point.`:""}</p>
        <footer><span><small>MODEL SPREAD</small><b>{favored?.abbr} -{Math.abs(projection.margin).toFixed(1)}</b></span><span><small>WIN PROBABILITY</small><b>{(favoredWin*100).toFixed(0)}%</b></span><span><small>MARKET</small><b>{market?compactMarketSpreadLabel(market):"—"}</b></span><span><small>GAME SHAPE</small><b>{intelligence?.gameShape??"BALANCED"}</b></span></footer>
      </section>

      <section className="mlab-section mlab-edge-section">
        <header><div><span>01 · MATCHUP CONTROL</span><h2>Which offense controls each part of the game?</h2><p>Every row includes both offensive matchups. Left is {first.name} offense against {second.name} defense; right is {second.name} offense against {first.name} defense. The two control shares always total 100.</p></div>{biggest?<aside><small>BIGGEST SINGLE ADVANTAGE</small><strong>{biggest.edgeTeam??"EVEN"}</strong><span>{biggest.label} · {biggest.magnitude}</span></aside>:null}</header>
        <div className="mlab-edge-key"><span><TeamMark name={first.name} size="sm" logo={first.logo}/><b>{first.abbr} OFF</b><small>vs {second.abbr} DEF</small></span><strong>100% CONTROL SHARE</strong><span><small>vs {first.abbr} DEF</small><b>{second.abbr} OFF</b><TeamMark name={second.name} size="sm" logo={second.logo}/></span></div>
        <div className="mlab-edge-lanes">{edgeLanes.map((lane)=>{
          const total=Math.max(1,lane.firstCard.score+lane.secondCard.score);
          const firstShare=Math.round(100*lane.firstCard.score/total),secondShare=100-firstShare;
          const edgeTeam=Math.abs(firstShare-secondShare)<4?null:firstShare>secondShare?first:second;
          const winningCard=firstShare>=secondShare?lane.firstCard:lane.secondCard;
          return <article key={lane.id} style={{"--edge-position":`${Math.max(6,Math.min(94,secondShare))}%`} as CSSProperties}>
            <div><TeamMark name={first.name} size="sm" logo={first.logo}/><strong>{firstShare}%</strong></div><span><small>{lane.label}</small><i><b/></i><em>{edgeTeam?`${edgeTeam.name} edge`:"Even"}</em><p>{winningCard.impact}</p></span><div><strong>{secondShare}%</strong><TeamMark name={second.name} size="sm" logo={second.logo}/></div>
          </article>;
        })}</div>
      </section>

      <section className="mlab-section">
        <header><div><span>02 · OPPONENT EFFECT</span><h2>What each team makes opponents become</h2><p>Actual production is measured against what each opponent normally gains or allows. Positive values mean the team changed the game in its favor.</p></div></header>
        <div className="mlab-two-column"><OpponentImpactPanel team={first} context={context.payload?.home??null}/><OpponentImpactPanel team={second} context={context.payload?.away??null}/></div>
      </section>

      <section className="mlab-section">
        <header><div><span>03 · COMPARABLE OPPONENTS</span><h2>Has either team already seen this matchup?</h2><p>The closest prior opponent is found separately for pass offense, rush offense, pass defense, and rush defense. The result shows whether the team beat expectation against that style.</p></div></header>
        <div className="mlab-two-column"><AnalogTeamPanel team={first} target={second} context={context.payload?.home??null}/><AnalogTeamPanel team={second} target={first} context={context.payload?.away??null}/></div>
      </section>

      <section className="mlab-section">
        <header><div><span>04 · PROJECTED GAME PROFILE</span><h2>The box score shape behind the score</h2><p>Volume and efficiency are projected together so selective passing teams and high-tempo teams are not evaluated as if they play the same game.</p></div></header>
        <div className="mlab-projected-profile"><header><span><TeamMark name={first.name} size="sm" logo={first.logo}/>{first.abbr}</span><b>PROJECTED STAT</b><span>{second.abbr}<TeamMark name={second.name} size="sm" logo={second.logo}/></span></header>{projectedRows.map((row)=><div key={row.label}><strong className={row.first>row.second?"positive":""}>{row.first.toFixed(row.digits)}</strong><span>{row.label}</span><strong className={row.second>row.first?"positive":""}>{row.second.toFixed(row.digits)}</strong></div>)}</div>
      </section>

      <section className="mlab-section">
        <header><div><span>05 · STALL POINTS</span><h2>Can both offenses remain functional?</h2><p>These thresholds are learned from archived CFBD team-games at the largest points-per-drive drop, not manually assigned.</p></div></header>
        <div className="mlab-two-column"><ViabilityPanel team={first} viability={projection.homeStats.viability}/><ViabilityPanel team={second} viability={projection.awayStats.viability}/></div>
      </section>

      <section className="mlab-section">
        <header><div><span>06 · PERFORMANCE AUDIT</span><h2>Actual results compared with pregame expectation</h2><p>Positive margin means the team outperformed the score the model expected before that game.</p></div></header>
        <div className="mlab-two-column"><ExpectationPanel team={first} context={context.payload?.home??null}/><ExpectationPanel team={second} context={context.payload?.away??null}/></div>
      </section>

      <section className="mlab-section mlab-advanced-section">
        <header><div><span>07 · CFBD ADVANCED METRICS</span><h2>Full evidence behind each offensive projection</h2><p>Season offense, opposing defense allowed, and the matchup-specific projection are shown together. CFBD line yards are a front-control proxy, not literal yards before contact.</p></div></header>
        <div className="mlab-two-column"><AdvancedDirectionPanel offense={first} defense={second} offenseProfile={firstRow?.advancedProfile} defenseProfile={secondRow?.advancedProfile} projection={projection.homeStats.advanced}/><AdvancedDirectionPanel offense={second} defense={first} offenseProfile={secondRow?.advancedProfile} defenseProfile={firstRow?.advancedProfile} projection={projection.awayStats.advanced}/></div>
      </section>

      <section className="mlab-section mlab-field-section">
        <header><div><span>08 · PLAY ART</span><h2>Where each offense should attack the field</h2><p>Nine passing windows and six run gaps show the projected attack, mixed, and avoid areas. Final 2025 uses the supplied PFF offensive location and blocking splits; every other point-in-time snapshot uses a clearly labeled CFBD pseudo-map.</p></div></header>
        <div className="mlab-two-column"><MatchupFieldPanel offense={first} defense={second} map={firstFieldMap}/><MatchupFieldPanel offense={second} defense={first} map={secondFieldMap}/></div>
        <p className="mlab-pff-disclaimer"><strong>PFF DATA NOTICE</strong> PFF metrics are reproduced from a user-supplied 2025 export. Harper+ is not affiliated with Pro Football Focus. PFF is not applied to earlier weekly snapshots because the available export is a full-season file.</p>
      </section>
      {context.error?<p className="mlab-context-error">Historical opponent comparisons are temporarily unavailable; the projection and CFBD matchup profile remain active.</p>:null}
    </>:<div className="data-empty"><strong>No model projection is available.</strong><span>Select another season, week, or team.</span></div>}
  </section>;
}

type WhatIfGame = {
  gameId:string;week:number;seasonType:string;opponent:string;opponentLogo?:string;location:"HOME"|"AWAY"|"NEUTRAL";
  teamScore:number;opponentScore:number;winProbability:number;margin:number;result:"W"|"L";recordAfter:string;
};

function whatIfFcsOpponent(name:string,season:number):TeamModel {
  const offense=modelCalibration.fcsOffenseIndex,defense=modelCalibration.fcsDefenseIndex;
  return {id:`fcs:${season}:${name}`,name,mascot:"FCS",abbr:name.slice(0,4).toUpperCase(),conference:"FCS",color:"#3f4441",altColor:"#eef0eb",rating:modelCalibration.fcsProjectionElo,baseRating:modelCalibration.fcsProjectionElo,weeks:{"16":{o:[offense,offense,offense,offense,offense],d:[defense,defense,defense,defense,defense],rank:null,evidence:{gamesPlayed:12,scheduleStrength:.25,bestOpponentStrength:.35,qualityWinStrength:.2,reliability:.72}}}};
}

function BorrowedScheduleWhatIf(){
  const [playerSeason,setPlayerSeason]=useState(activeModelSeason);
  const [scheduleSeason,setScheduleSeason]=useState(activeModelSeason);
  const [playerName,setPlayerName]=useState("Indiana");
  const [scheduleName,setScheduleName]=useState("Ohio State");
  const playerDynamic=useDynamicProfiles(playerSeason,16);
  const scheduleDynamic=useDynamicProfiles(scheduleSeason,16);
  const playerLookup=useMemo(()=>new Map(playerDynamic.teams.map((team)=>[team.name,team])),[playerDynamic.teams]);
  const scheduleLookup=useMemo(()=>new Map(scheduleDynamic.teams.map((team)=>[team.name,team])),[scheduleDynamic.teams]);
  const playerResolved=playerLookup.has(playerName)?playerName:(playerLookup.has("Indiana")?"Indiana":playerDynamic.teams[0]?.name);
  const scheduleResolved=scheduleLookup.has(scheduleName)?scheduleName:(scheduleLookup.has("Ohio State")?"Ohio State":scheduleDynamic.teams[0]?.name);
  const player=playerResolved?playerLookup.get(playerResolved):undefined;
  const scheduleTeam=scheduleResolved?scheduleLookup.get(scheduleResolved):undefined;
  const borrowedSchedule=useRankingTeamSchedule(scheduleResolved??"",scheduleSeason,Boolean(scheduleResolved));
  const scenario=useMemo(()=>{
    if(!player||!scheduleTeam)return {games:[] as WhatIfGame[],wins:0,losses:0,expectedWins:0,omittedSelf:0};
    let wins=0,losses=0,expectedWins=0,omittedSelf=0;
    const games:WhatIfGame[]=[];
    for(const row of borrowedSchedule.rows){
      const donorHome=row.homeTeam===scheduleTeam.name;
      const donorAway=row.awayTeam===scheduleTeam.name;
      if(!donorHome&&!donorAway)continue;
      const opponentName=donorHome?row.awayTeam:row.homeTeam;
      if(opponentName===player.name){omittedSelf+=1;continue;}
      const opponent=scheduleLookup.get(opponentName)??whatIfFcsOpponent(opponentName,scheduleSeason);
      const neutral=Boolean(row.neutralSite);
      const projection=donorHome
        ? projectMatchup(player,opponent,16,neutral,16,{home:player.name,away:opponent.name})
        : projectMatchup(opponent,player,16,neutral,16,{home:opponent.name,away:player.name});
      if(!projection)continue;
      const teamScore=donorHome?projection.homeScore:projection.awayScore;
      const opponentScore=donorHome?projection.awayScore:projection.homeScore;
      const winProbability=donorHome?projection.homeWin:1-projection.homeWin;
      const margin=donorHome?projection.margin:-projection.margin;
      const result:WhatIfGame["result"]=margin>=0?"W":"L";
      if(result==="W")wins+=1;else losses+=1;
      expectedWins+=winProbability;
      games.push({gameId:row.gameId,week:row.week,seasonType:row.seasonType,opponent:opponent.name,opponentLogo:opponent.logo,location:neutral?"NEUTRAL":donorHome?"HOME":"AWAY",teamScore,opponentScore,winProbability,margin,result,recordAfter:`${wins}–${losses}`});
    }
    return {games,wins,losses,expectedWins,omittedSelf};
  },[borrowedSchedule.rows,player,scheduleLookup,scheduleSeason,scheduleTeam]);
  const hardest=[...scenario.games].sort((left,right)=>left.winProbability-right.winProbability)[0];
  const loading=playerDynamic.loading||scheduleDynamic.loading||borrowedSchedule.loading;
  return <div className="what-if-tab-panel borrowed-schedule-panel">
    <section className="what-if-controls" aria-label="What If scenario controls">
      <article><header><span>TEAM PLAYING</span><strong>Whose team profile?</strong></header><div><label><span>YEAR</span><select aria-label="Team playing season" value={playerSeason} onChange={(event)=>setPlayerSeason(Number(event.target.value))}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label><label><span>TEAM</span><select aria-label="Team playing" value={player?.name??""} onChange={(event)=>setPlayerName(event.target.value)}>{playerDynamic.teams.map((team)=><option key={team.name}>{team.name}</option>)}</select></label></div></article>
      <b aria-hidden="true">ON</b>
      <article><header><span>SCHEDULE BORROWED</span><strong>Whose opponents and sites?</strong></header><div><label><span>YEAR</span><select aria-label="Borrowed schedule season" value={scheduleSeason} onChange={(event)=>setScheduleSeason(Number(event.target.value))}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label><label><span>TEAM</span><select aria-label="Borrowed schedule team" value={scheduleTeam?.name??""} onChange={(event)=>setScheduleName(event.target.value)}>{scheduleDynamic.teams.map((team)=><option key={team.name}>{team.name}</option>)}</select></label></div></article>
    </section>
    {loading||!player||!scheduleTeam?<div className="data-empty"><strong>Building the borrowed schedule…</strong><span>The full-season team profiles and donor schedule are loading.</span></div>:scenario.games.length?<>
      <section className="what-if-summary">
        <article className="what-if-summary-matchup"><div><TeamMark name={player.name} size="md" logo={player.logo}/><span><small>{playerSeason} TEAM</small><strong>{player.name}</strong></span></div><i>PLAYS</i><div><TeamMark name={scheduleTeam.name} size="md" logo={scheduleTeam.logo}/><span><small>{scheduleSeason} SCHEDULE</small><strong>{scheduleTeam.name}</strong></span></div></article>
        <article><span>PROJECTED RECORD</span><strong>{scenario.wins}–{scenario.losses}</strong><small>{scenario.games.length} modeled games</small></article>
        <article><span>EXPECTED WINS</span><strong>{scenario.expectedWins.toFixed(1)}</strong><small>sum of game win probabilities</small></article>
        <article><span>TOUGHEST GAME</span><strong>{hardest?.opponent??"—"}</strong><small>{hardest?`${(hardest.winProbability*100).toFixed(0)}% win chance · ${hardest.location}`:"—"}</small></article>
      </section>
      <section className="what-if-schedule" aria-label="Projected borrowed schedule">
        <header><span>WK</span><span>OPPONENT</span><span>SITE</span><span>RESULT</span><span>SCORE</span><span>MARGIN</span><span>WIN CHANCE</span><span>RECORD</span></header>
        {scenario.games.map((game)=><article key={game.gameId}>
          <b className="what-if-week">{game.seasonType==="postseason"?"POST":game.week}</b>
          <div className="what-if-opponent"><TeamMark name={game.opponent} size="sm" logo={game.opponentLogo}/><strong>{game.opponent}</strong></div>
          <small className="what-if-site">{game.location}</small>
          <i className={`what-if-result ${game.result==="W"?"win":"loss"}`}>{game.result}</i>
          <strong className="what-if-score">{game.teamScore.toFixed(0)}–{game.opponentScore.toFixed(0)}</strong>
          <small className="what-if-margin">{game.margin>=0?"+":""}{game.margin.toFixed(1)}</small>
          <strong className="what-if-chance">{(game.winProbability*100).toFixed(0)}%</strong>
          <b className="what-if-record">{game.recordAfter}</b>
        </article>)}
      </section>
      <p className="what-if-note">Each matchup uses both teams&apos; final profile for its selected season. Home, away, and neutral sites come from the borrowed schedule. FCS opponents use the model&apos;s FCS baseline. {scenario.omittedSelf?`${scenario.omittedSelf} self-matchup ${scenario.omittedSelf===1?"was":"were"} omitted.`:""}</p>
    </>:<div className="data-empty"><strong>No model-ready schedule is available.</strong><span>Choose another schedule team or season.</span></div>}
  </div>;
}

function scenarioTeamWinProbability(game:SimulatedScheduleRow,team:string){
  const homeProbability=game.homeWinProbability??.5;
  return game.homeTeam===team?homeProbability:1-homeProbability;
}

function scenarioRankMovement(baselineRank:number,scenarioRank:number){
  const movement=baselineRank-scenarioRank;
  if(movement>0)return {label:`↑ ${movement}`,tone:"up"};
  if(movement<0)return {label:`↓ ${Math.abs(movement)}`,tone:"down"};
  return {label:"—",tone:"flat"};
}

function scenarioPostseasonLabel(row:SimulationScenarioRanking|undefined){
  if(!row)return "—";
  if(row.playoffSeed)return `CFP #${row.playoffSeed}`;
  if(row.conferenceChampion)return "CONF CHAMPION";
  return "OUTSIDE CFP";
}

function ScenarioMiniBracket({label,format,champion,games,logoByTeam,changedTeams}:{
  label:string;format:4|12;champion:string|null;games:SimulationScenarioBracketGame[];
  logoByTeam:Map<string,string|undefined>;changedTeams:Set<string>;
}){
  const rounds:SimulationScenarioBracketGame["round"][]=format===4
    ?["Semifinal","Championship"]
    :["First Round","Quarterfinal","Semifinal","Championship"];
  return <article className="scenario-mini-bracket">
    <header><span>{label}</span><strong>{champion??"Field pending"}</strong><small>PROJECTED CHAMPION</small></header>
    {games.length?<div className={`scenario-mini-rounds format-${format}`}>{rounds.map((round)=><section key={round}>
      <h4>{round.replace("First Round","ROUND 1").replace("Quarterfinal","QUARTERS").replace("Semifinal","SEMIS").toUpperCase()}</h4>
      <div>{games.filter((game)=>game.round===round).map((game)=><article key={game.id}>
        {([[game.firstTeam,game.firstSeed,game.firstScore],[game.secondTeam,game.secondSeed,game.secondScore]] as Array<[string,number,number]>).map(([team,seed,score])=><div key={team} className={`${game.winner===team?"winner":""}${changedTeams.has(team)?" changed":""}`}>
          <b>{seed}</b><TeamMark name={team} size="sm" logo={logoByTeam.get(team)}/><strong>{team}</strong><em>{score}</em>
        </div>)}
      </article>)}</div>
    </section>)}</div>:<div className="scenario-mini-empty">The projected playoff field is not complete for this snapshot.</div>}
  </article>;
}

function GameFlipWhatIf(){
  const [season,setSeason]=useState(activeModelSeason);
  const [enteringWeek,setEnteringWeek]=useState(activeModelWeek);
  const [teamName,setTeamName]=useState("Indiana");
  const [overrides,setOverrides]=useState<Record<string,string>>({});
  const snapshotWeek=enteringWeekSnapshotWeek(enteringWeek);
  const dynamic=useDynamicProfiles(season,snapshotWeek);
  const teamLookup=useMemo(()=>new Map(dynamic.teams.map((team)=>[team.name,team])),[dynamic.teams]);
  const resolvedTeam=teamLookup.has(teamName)?teamName:(teamLookup.has("Indiana")?"Indiana":dynamic.teams[0]?.name??"");
  const overrideRows=useMemo(()=>Object.entries(overrides).map(([gameId,winnerTeam])=>({gameId,winnerTeam})).sort((left,right)=>left.gameId.localeCompare(right.gameId)),[overrides]);
  const simulation=useSimulationScenario(season,snapshotWeek,resolvedTeam,overrideRows);
  const data=simulation.data;
  const baselineByTeam=useMemo(()=>new Map((data?.baseline.rankings??[]).map((row)=>[row.team,row])),[data]);
  const scenarioByTeam=useMemo(()=>new Map((data?.scenario.rankings??[]).map((row)=>[row.team,row])),[data]);
  const scenarioLogoByTeam=useMemo(()=>new Map([...(data?.baseline.rankings??[]),...(data?.scenario.rankings??[])].map((row)=>[row.team,row.logo])),[data]);
  const scenarioGameById=useMemo(()=>new Map((data?.scenarioGames??[]).map((game)=>[game.gameId,game])),[data]);
  const selectedBaseline=baselineByTeam.get(resolvedTeam);
  const selectedScenario=scenarioByTeam.get(resolvedTeam);
  const selectedMovement=selectedBaseline&&selectedScenario?scenarioRankMovement(selectedBaseline.rank,selectedScenario.rank):null;
  const appliedOverrideIds=useMemo(()=>new Set((data?.appliedOverrides??[]).map((override)=>override.gameId)),[data]);
  const changedOpponentNames=useMemo(()=>new Set((data?.games??[]).filter((game)=>appliedOverrideIds.has(game.gameId)).map((game)=>game.opponent)),[appliedOverrideIds,data]);
  const opponentImpacts=useMemo(()=>[...changedOpponentNames].flatMap((name)=>{
    const baseline=baselineByTeam.get(name),scenario=scenarioByTeam.get(name);
    return baseline&&scenario?[{name,baseline,scenario,movement:scenarioRankMovement(baseline.rank,scenario.rank)}]:[];
  }).sort((left,right)=>left.scenario.rank-right.scenario.rank),[baselineByTeam,changedOpponentNames,scenarioByTeam]);
  const directTeams=useMemo(()=>new Set([resolvedTeam,...changedOpponentNames]),[changedOpponentNames,resolvedTeam]);
  const nationalRipple=useMemo(()=>data?.baseline.rankings.flatMap((baseline)=>{
    const scenario=scenarioByTeam.get(baseline.team);
    if(!scenario||directTeams.has(baseline.team)||(scenario.rank===baseline.rank&&scenario.projectedRecord===baseline.projectedRecord&&scenario.playoffSeed===baseline.playoffSeed&&scenario.conferenceChampion===baseline.conferenceChampion))return [];
    return [{baseline,scenario,movement:scenarioRankMovement(baseline.rank,scenario.rank)}];
  }).sort((left,right)=>Math.abs(right.baseline.rank-right.scenario.rank)-Math.abs(left.baseline.rank-left.scenario.rank)||left.scenario.rank-right.scenario.rank).slice(0,8)??[],[data,directTeams,scenarioByTeam]);
  const playoffChangedTeams=useMemo(()=>{
    const changed=new Set<string>();
    if(!data)return changed;
    const teams=new Set([...data.baseline.rankings.map((row)=>row.team),...data.scenario.rankings.map((row)=>row.team)]);
    for(const team of teams){
      if(baselineByTeam.get(team)?.playoffSeed!==scenarioByTeam.get(team)?.playoffSeed)changed.add(team);
    }
    if(data.baseline.champion!==data.scenario.champion){
      if(data.baseline.champion)changed.add(data.baseline.champion);
      if(data.scenario.champion)changed.add(data.scenario.champion);
    }
    return changed;
  },[baselineByTeam,data,scenarioByTeam]);

  const chooseOutcome=(game:SimulatedScheduleRow,outcome:"model"|"win"|"loss")=>{
    setOverrides((current)=>{
      const next={...current};
      if(game.seasonType==="regular")for(const gameId of Object.keys(next))if(gameId.startsWith("sim-"))delete next[gameId];
      if(outcome==="model")delete next[game.gameId];
      else{
        const selectedWinner=outcome==="win"?resolvedTeam:game.opponent;
        const modelWinner=game.teamScore>game.opponentScore?resolvedTeam:game.opponent;
        if(selectedWinner===modelWinner)delete next[game.gameId];
        else next[game.gameId]=selectedWinner;
      }
      return next;
    });
  };

  return <div className="what-if-tab-panel scenario-flip-panel">
    <section className="scenario-flip-controls" aria-label="Game flip scenario controls">
      <label><span>SEASON</span><select value={season} onChange={(event)=>{setSeason(Number(event.target.value));setOverrides({});}}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label><span>ENTERING WEEK</span><select value={enteringWeek} onChange={(event)=>{setEnteringWeek(Number(event.target.value));setOverrides({});}}>{Array.from({length:17},(_,week)=><option key={week} value={week}>{week===0?"Preseason":`Week ${week}`}</option>)}</select></label>
      <label><span>TEAM</span><select value={resolvedTeam} onChange={(event)=>{setTeamName(event.target.value);setOverrides({});}}>{dynamic.teams.map((team)=><option key={team.name}>{team.name}</option>)}</select></label>
      <button type="button" onClick={()=>setOverrides({})} disabled={!overrideRows.length}>RESET SCENARIO</button>
    </section>
    <div className="scenario-freeze-note" role="note"><span>{enteringWeek===0?"PRESEASON FORECAST":`ENTERING WEEK ${enteringWeek}`}</span><strong>{snapshotWeek?`DATA THROUGH WEEK ${snapshotWeek}`:"WEEK 0 STATE"}</strong><p>Completed and projected regular-season results can be changed. If the selected team reaches its conference championship, Week 15 appears too. This branch never rewrites Scores or the normal Season Sim.</p></div>

    {dynamic.loading&&!data?<div className="data-empty"><strong>Loading the selected team snapshot…</strong><span>The scenario will appear when the weekly team profiles are ready.</span></div>:null}
    {!dynamic.loading&&simulation.loading&&!data?<div className="data-empty"><strong>Running the baseline season…</strong><span>Every remaining game, conference race and playoff path is being simulated.</span></div>:null}
    {!simulation.loading&&simulation.error&&!data?<div className="data-empty"><strong>The scenario could not be built.</strong><span>{simulation.error}</span></div>:null}

    {data&&selectedBaseline&&selectedScenario?<>
      <section className="scenario-flip-summary">
        <article className="scenario-team-card"><TeamMark name={resolvedTeam} size="md" logo={selectedScenario.logo}/><div><span>SELECTED TEAM</span><strong>{resolvedTeam}</strong><small>{data.appliedOverrides.length?`${data.appliedOverrides.length} result ${data.appliedOverrides.length===1?"change":"changes"}`:"SEASON BASELINE"}</small></div></article>
        <article><span>SEASON SIM RANK</span><div><s>#{selectedBaseline.rank}</s><b>→ #{selectedScenario.rank}</b><em className={selectedMovement?.tone}>{selectedMovement?.label}</em></div><small>projected final H+ rank</small></article>
        <article><span>PROJECTED RECORD</span><div><s>{selectedBaseline.projectedRecord}</s><b>→ {selectedScenario.projectedRecord}</b></div><small>{selectedScenario.expectedWins.toFixed(1)} scenario expected wins</small></article>
        <article><span>POSTSEASON</span><div><s>{scenarioPostseasonLabel(selectedBaseline)}</s><b>→ {scenarioPostseasonLabel(selectedScenario)}</b></div><small>{data.baseline.champion??"No champion"} → {data.scenario.champion??"No champion"}</small></article>
      </section>

      <section className="scenario-game-shell" aria-label={`${resolvedTeam} game outcome controls`}>
        <header><div><span>RETROACTIVE RESULT OVERRIDES</span><strong>Change any completed or projected outcome</strong></div><small>{simulation.loading?"RECALCULATING FULL SEASON…":`${data.games.length} SELECTABLE GAMES`}</small></header>
        {data.games.length?data.games.map((game)=>{
          const scenarioGame=scenarioGameById.get(game.gameId)??game;
          const modelResult=game.teamScore>game.opponentScore?"W":"L";
          const scenarioResult=scenarioGame.teamScore>scenarioGame.opponentScore?"W":"L";
          const selectedWinner=overrides[game.gameId];
          const winProbability=scenarioTeamWinProbability(game,resolvedTeam);
          const wasFlipped=appliedOverrideIds.has(game.gameId);
          const baselineLabel=game.status==="final"?"FINAL":game.seasonType==="conference-championship"?"TITLE MODEL":"MODEL";
          const probabilityLabel=game.status==="final"
            ?game.modelHomeSpread!==null||game.modelTotal!==null?`${(winProbability*100).toFixed(0)}% pregame win chance`:"completed result"
            :`${(winProbability*100).toFixed(0)}% win chance`;
          return <article className={wasFlipped?"flipped":""} key={game.gameId}>
            <div className="scenario-game-week"><span>{game.seasonType==="conference-championship"?"TITLE":"WK"}</span><b>{game.week}</b></div>
            <div className="scenario-game-opponent"><TeamMark name={game.opponent} size="sm" logo={baselineByTeam.get(game.opponent)?.logo??scenarioByTeam.get(game.opponent)?.logo}/><span><small>{game.seasonType==="conference-championship"?"CONFERENCE CHAMPIONSHIP":game.location}</small><strong>{game.opponent}</strong></span></div>
            <div className="scenario-game-model"><span>{baselineLabel}</span><b className={modelResult==="W"?"win":"loss"}>{modelResult} {game.teamScore}–{game.opponentScore}</b><small>{probabilityLabel}</small></div>
            <div className="scenario-outcome-toggle" role="group" aria-label={`Choose ${resolvedTeam} outcome against ${game.opponent}`}>
              <button type="button" className={!selectedWinner?"active":""} onClick={()=>chooseOutcome(game,"model")}>KEEP</button>
              <button type="button" className={selectedWinner===resolvedTeam?"active win":""} disabled={modelResult==="W"} onClick={()=>chooseOutcome(game,"win")}>FORCE W</button>
              <button type="button" className={selectedWinner===game.opponent?"active loss":""} disabled={modelResult==="L"} onClick={()=>chooseOutcome(game,"loss")}>FORCE L</button>
            </div>
            <div className="scenario-game-result"><span>SCENARIO</span><b className={scenarioResult==="W"?"win":"loss"}>{scenarioResult} {scenarioGame.teamScore}–{scenarioGame.opponentScore}</b><small>{wasFlipped?`${Math.abs(scenarioGame.teamScore-scenarioGame.opponentScore)}-point manual result`:game.status==="final"?"final result retained":"model result retained"}</small></div>
          </article>;
        }):<div className="data-empty"><strong>No selectable games are available.</strong><span>Choose another team, season, or entering week.</span></div>}
      </section>

      <section className="scenario-playoff-ripple">
        <header><div><span>PLAYOFF RIPPLE</span><strong>Seeds follow each branch&apos;s final Season Sim ranking</strong></div><small>{playoffChangedTeams.size?`${playoffChangedTeams.size} TEAMS OR CHAMPION CHANGED`:"FIELD UNCHANGED"}</small></header>
        <div><ScenarioMiniBracket label="BASELINE PLAYOFF" format={data.baseline.format} champion={data.baseline.champion} games={data.baseline.bracket} logoByTeam={scenarioLogoByTeam} changedTeams={playoffChangedTeams}/><ScenarioMiniBracket label="WHAT IF PLAYOFF" format={data.scenario.format} champion={data.scenario.champion} games={data.scenario.bracket} logoByTeam={scenarioLogoByTeam} changedTeams={playoffChangedTeams}/></div>
      </section>

      {overrideRows.length?<section className="scenario-impact-grid">
        <article><header><span>DIRECT OPPONENT EFFECT</span><strong>Every flipped opponent</strong></header><div>{opponentImpacts.map(({name,baseline,scenario,movement})=><div key={name}><TeamMark name={name} size="sm" logo={scenario.logo}/><span><strong>{name}</strong><small>{baseline.projectedRecord} → {scenario.projectedRecord} · {scenarioPostseasonLabel(scenario)}</small></span><b>#{baseline.rank} → #{scenario.rank}</b><em className={movement.tone}>{movement.label}</em></div>)}</div></article>
        <article><header><span>NATIONAL RIPPLE</span><strong>Largest changes elsewhere</strong></header><div>{nationalRipple.length?nationalRipple.map(({baseline,scenario,movement})=><div key={scenario.team}><TeamMark name={scenario.team} size="sm" logo={scenario.logo}/><span><strong>{scenario.team}</strong><small>{baseline.projectedRecord} → {scenario.projectedRecord} · {scenarioPostseasonLabel(scenario)}</small></span><b>#{baseline.rank} → #{scenario.rank}</b><em className={movement.tone}>{movement.label}</em></div>):<p>No other team changes rank, record, conference-title status or playoff seed in this scenario.</p>}</div></article>
      </section>:<div className="scenario-impact-empty"><strong>Choose a result to reveal the ripple.</strong><span>The full season will be rebuilt for the selected team, its opponent, conference races, projected Top 25 and playoff field.</span></div>}
      <p className="scenario-method-note">Forced upsets and forced losses preserve the game&apos;s scoring environment, then use a realistic 3–7 point margin based on the original pregame probability when available. {data.methodology}</p>
    </>:null}
  </div>;
}

function WhatIfPage({season,week,setSeason,setWeek,onSelectTeam,onSelectGame}:ModelVintageProps&{onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler}){
  const [tab,setTab]=useState<"simulation"|"schedule"|"results">("simulation");
  return <section className="page-section what-if-page">
    <div className="section-kicker">SEASON SCENARIO LAB · BASELINE + ALTERNATE PATHS</div>
    <div className="section-title-row"><div><h1>What If?</h1><p>Run the baseline Season Sim, borrow another team&apos;s schedule, or branch a frozen forecast by changing completed or projected results.</p></div></div>
    <nav className="what-if-tabs" role="tablist" aria-label="What If tools">
      <button type="button" role="tab" aria-selected={tab==="simulation"} className={tab==="simulation"?"active":""} onClick={()=>setTab("simulation")}><span>01</span><strong>SEASON SIM</strong><small>Project the baseline season and CFP</small></button>
      <button type="button" role="tab" aria-selected={tab==="schedule"} className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}><span>02</span><strong>BORROW A SCHEDULE</strong><small>Put one team on another team&apos;s slate</small></button>
      <button type="button" role="tab" aria-selected={tab==="results"} className={tab==="results"?"active":""} onClick={()=>setTab("results")}><span>03</span><strong>FLIP GAME OUTCOMES</strong><small>Rebuild rank, opponents and playoff path</small></button>
    </nav>
    {tab==="simulation"?<SeasonSimulationPage season={season} week={week} setSeason={setSeason} setWeek={setWeek} onSelectTeam={onSelectTeam} onSelectGame={onSelectGame} embedded/>:tab==="schedule"?<BorrowedScheduleWhatIf/>:<GameFlipWhatIf/>}
  </section>;
}

function All137({ season, week, setSeason, setWeek, onSelectTeam, onSelectGame }: ModelVintageProps & {onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler}) {
  const [query, setQuery] = useState("");
  const [fieldMode, setFieldMode] = useState<"season"|"every-season">("season");
  const [visibleCount, setVisibleCount] = useState(100);
  const dynamic = useDynamicProfiles(season, week);
  const everySeason = useEverySeasonProfiles(fieldMode === "every-season");
  const availableTeams = dynamic.teams;
  const seasonProfiles = useMemo<RoundRobinProfile[]>(() => availableTeams.flatMap((team) => {
    const profile=latestProfile(team,week);
    if(!profile) return [];
    return [{id:team.name,team:team.name,season,week,conference:team.conference,logo:team.logo,rating:team.rating,resumeScore:team.resumeScore,seasonRecord:team.seasonRecord,nationalChampion:team.nationalChampion,evidence:profile.evidence,offense:profile.o,defense:profile.d,advanced:profile.advanced}];
  }),[availableTeams,season,week]);
  // Each neutral matchup is calculated once and credited to both teams. The
  // previous UI loop built the full X-ray twice for every pairing.
  const seasonRows = useMemo(() => buildRoundRobinStandings(seasonProfiles).map((row)=>({
    id:row.profile.id,name:row.profile.team,season:null as number|null,conference:row.profile.conference||"FBS",secondary:row.profile.conference||"FBS",logo:row.profile.logo||undefined,
    wins:row.wins,losses:row.losses,games:row.games,expectedWins:row.expectedWins,winPct:row.winPct,averageMargin:row.averageMargin,bestUnit:row.bestUnit,unitWins:row.unitWins,rank:row.rank,
  })),[seasonProfiles]);
  const everySeasonProfiles = useMemo<RoundRobinProfile[]>(() => everySeason.rows.map((row) => ({
    id:`${row.season}:${row.team}`,
    team:row.team,
    season:row.season,
    week:row.week,
    conference:row.conference,
    logo:row.logo,
    rating:row.crossEraRating??row.eloRating,
    resumeScore:row.resumeScore,
    seasonRecord:row.seasonRecord,
    nationalChampion:row.nationalChampion,
    evidence:{
      gamesPlayed:row.gamesPlayed,scheduleStrength:row.scheduleStrength??0.5,bestOpponentStrength:row.bestOpponentStrength??0.5,
      qualityWinStrength:row.qualityWinStrength??0.35,reliability:row.matchupReliability??0.72,
    },
    offense:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex],
    defense:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex],
    advanced:row.advancedProfile,
  })), [everySeason.rows]);
  const everySeasonRows = useMemo(() => buildRoundRobinStandings(everySeasonProfiles).map((row) => ({
    id:row.profile.id,name:row.profile.team,season:row.profile.season,conference:row.profile.conference||"FBS",
    secondary:`${row.profile.seasonRecord??`final W${row.profile.week}`} · ${row.profile.conference||"FBS"}${row.profile.nationalChampion?" · NATIONAL CHAMPION":""}`,logo:row.profile.logo||undefined,
    wins:row.wins,losses:row.losses,games:row.games,expectedWins:row.expectedWins,winPct:row.winPct,averageMargin:row.averageMargin,bestUnit:row.bestUnit,unitWins:row.unitWins,rank:row.rank,
  })), [everySeasonProfiles]);
  const rows = fieldMode === "every-season" ? everySeasonRows : seasonRows;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = rows.filter((row) => `${row.name} ${row.conference} ${row.season ?? ""}`.toLowerCase().includes(normalizedQuery));
  const shownRows = filtered.slice(0, visibleCount);
  const leader = rows[0];
  const fieldSize = fieldMode === "every-season" ? everySeasonProfiles.length : availableTeams.length;
  const uniqueMatchups = (fieldSize * (fieldSize - 1)) / 2;
  return <section className="page-section all137-page">
    <div className="section-kicker">NEUTRAL-FIELD ROUND ROBIN · <span className={`data-source ${fieldMode === "every-season" ? everySeason.loading ? "loading" : "database" : dynamic.source}`}>{fieldMode === "every-season" ? everySeason.loading ? "LOADING CROSS-ERA FIELD" : "FINAL SEASON SNAPSHOTS" : sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>All137</h1><p>{fieldMode === "every-season" ? "Every model-ready team-season plays every other team-season once, creating one cross-era ranking from 2014 forward." : "Every model-ready FBS team plays every other team once. Teams rank by projected wins, then expected wins and average margin."}</p></div><div className="all137-controls"><div className="all137-field-control"><label htmlFor="all137-field">FIELD</label><select id="all137-field" value={fieldMode} onChange={(event)=>{ setFieldMode(event.target.value as "season"|"every-season"); setVisibleCount(100); }}><option value="season">Single Season</option><option value="every-season">Every Season</option></select></div>{fieldMode === "season" ? <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} idPrefix="all137" /> : null}</div></div>
    {!leader ? <div className="data-empty"><strong>{everySeason.loading ? "Building the cross-era field…" : "No All137 field exists for this selection yet."}</strong><span>{fieldMode === "every-season" ? "Completed historical team profiles will appear here as the archive finishes." : "Select a populated season and week, or activate the historical sync."}</span></div> : <>
      <div className="all137-summary">
        <article><span>ROUND-ROBIN LEADER</span><div><TeamMark name={leader.name} size="md" logo={leader.logo} /><strong>{leader.season ? `${leader.season} ${leader.name}` : leader.name}</strong></div><b>{leader.wins}–{leader.losses}</b></article>
        <article><span>{fieldMode === "every-season" ? "TEAM-SEASONS" : "TEAMS LOADED"}</span><strong>{fieldSize}</strong><small>{fieldMode === "every-season" ? `${everySeason.seasons.length} seasons currently ready` : `${season} model-ready profiles`}</small></article>
        <article><span>UNIQUE MATCHUPS</span><strong>{uniqueMatchups.toLocaleString()}</strong><small>neutral-field simulations</small></article>
        <article><span>MODEL VINTAGE</span><strong>{fieldMode === "every-season" ? "ALL" : `W${week}`}</strong><small>{fieldMode === "every-season" ? `${everySeason.seasons[0] ?? 2014}–${everySeason.seasons.at(-1) ?? season}` : `${season} snapshot`}</small></article>
      </div>
      <div className="all137-toolbar"><div><strong>{fieldMode === "every-season" ? "Cross-era standings" : "Round-robin standings"}</strong><span>Each record contains {fieldSize - 1} neutral-field games.</span></div><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(100); }} placeholder={fieldMode === "every-season" ? "Search team, conference or year" : "Search team or conference"} aria-label="Search All137 rankings" /></div>
      <div className="rankings-shell unified-rankings-shell all137-unified-shell">
        <div className="rankings-head all137-ranking-head"><span>RK</span><span>TEAM / ROUND ROBIN</span><span>PROJECTED RECORD</span><span>WIN %</span><span>EXP WINS</span><span>AVG MARGIN</span><span>BEST UNIT</span><span>SCHEDULE</span></div>
        {shownRows.map((row) => <UnifiedRankingEntry
          key={row.id}
          className="all137-ranking-entry"
          rank={row.rank}
          team={row.name}
          logo={row.logo}
          subtitle={row.season ? `${row.season} · ${row.conference}` : row.conference}
          highlights={[
            {label:"BEST UNIT",value:`${row.bestUnit} · ${row.unitWins}`,className:"ranking-best-wins"},
            {label:"AVG MARGIN",value:`${row.averageMargin>=0?"+":""}${row.averageMargin.toFixed(1)}`,className:row.averageMargin>=0?"ranking-best-wins":"ranking-losses"},
          ]}
          metrics={<>
            <span className="ranking-record-pair" data-label="PROJECTED RECORD"><b>{row.wins}–{row.losses}</b><small>{row.games} GAMES</small></span>
            <strong data-label="WIN %">{(row.winPct*100).toFixed(1)}%</strong>
            <span data-label="EXP WINS">{row.expectedWins.toFixed(1)}</span>
            <strong data-label="AVG MARGIN" className={row.averageMargin>=0?"positive":"negative"}>{row.averageMargin>=0?"+":""}{row.averageMargin.toFixed(1)}</strong>
            <span data-label="BEST UNIT">{row.bestUnit}</span>
          </>}
          season={row.season??season}
          onSelectTeam={onSelectTeam}
          onSelectGame={onSelectGame}
        />)}
      </div>
      {shownRows.length < filtered.length ? <button type="button" className="all137-more" onClick={()=>setVisibleCount((count)=>count+100)}>SHOW 100 MORE · {filtered.length-shownRows.length} REMAIN</button> : null}
      <p className="all137-disclaimer">{fieldMode === "every-season" ? "Every Season uses the final available efficiency profile plus the completed regular season, bowls and playoff résumé. Statistics are normalized to that year's FBS environment before the neutral-field matchup is played." : `The field automatically follows the official FBS membership returned for ${season}. Each team is evaluated against ${availableTeams.length - 1} opponents.`}</p>
    </>}
  </section>;
}

function TeamStatsPage({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("ALL");
  const [statGroup, setStatGroup] = useState<TeamStatsGroup>("core");
  const [advancedView, setAdvancedView] = useState<TeamStatsAdvancedView>("offense-index");
  const [sortKey, setSortKey] = useState<TeamStatsSortKey>("offYpp");
  const [sortDirection, setSortDirection] = useState<TeamStatsSortDirection>("desc");
  const dynamic = useDynamicProfiles(season, week);
  const fallbackRows = useMemo<DynamicProfileRow[]>(() => dynamic.rows.length ? [] : dynamic.teams.flatMap((team) => {
    const profile = latestProfile(team, week);
    if (!profile) return [];
    return [{ season, week, team: team.name, gamesPlayed: 0, teamId: team.id, abbreviation: team.abbr, mascot: team.mascot, conference: team.conference, color: team.color, altColor: team.altColor, logo: team.logo,
      offYpp: baselines.ypp * profile.o[0], offYpa: baselines.ypa * profile.o[1], offYpc: baselines.ypc * profile.o[2], offPatt: baselines.patt * profile.o[3], offRatt: baselines.ratt * profile.o[4],
      defYpp: baselines.ypp * profile.d[0], defYpa: baselines.ypa * profile.d[1], defYpc: baselines.ypc * profile.d[2], defPatt: baselines.patt * profile.d[3], defRatt: baselines.ratt * profile.d[4],
      offYppIndex: profile.o[0], offYpaIndex: profile.o[1], offYpcIndex: profile.o[2], offPattIndex: profile.o[3], offRattIndex: profile.o[4], defYppIndex: profile.d[0], defYpaIndex: profile.d[1], defYpcIndex: profile.d[2], defPattIndex: profile.d[3], defRattIndex: profile.d[4] }];
  }), [dynamic.rows.length, dynamic.teams, season, week]);
  const rows = dynamic.rows.length ? dynamic.rows : fallbackRows;
  const conferences = useMemo(() => [...new Set(rows.map((row) => row.conference || "FBS"))].sort(), [rows]);
  const visibleColumns = useMemo(() => teamStatsColumns(statGroup, advancedView), [advancedView, statGroup]);
  const filtered = useMemo(() => sortTeamStatsRows(rows.filter((row) =>
    matchesConferenceFilter(row.conference,conference)
    && `${row.team} ${row.conference}`.toLowerCase().includes(query.toLowerCase())
  ), sortKey, sortDirection), [conference, query, rows, sortDirection, sortKey]);
  const topOffense = [...rows].sort((a, b) => average([b.offYppIndex, b.offYpaIndex, b.offYpcIndex]) - average([a.offYppIndex, a.offYpaIndex, a.offYpcIndex]))[0];
  const topDefense = [...rows].sort((a, b) => average([a.defYppIndex, a.defYpaIndex, a.defYpcIndex]) - average([b.defYppIndex, b.defYpaIndex, b.defYpcIndex]))[0];
  const advancedCoverage = rows.filter((row) => row.advancedProfile).length;
  const activeSort = visibleColumns.find((column) => column.key === sortKey) ?? visibleColumns[2] ?? visibleColumns[0];
  const groupLabel = TEAM_STATS_GROUPS.find((group) => group.key === statGroup)?.label ?? "Core Efficiency";
  const statsGridStyle = {
    "--stats-grid": `minmax(230px,1.35fr) 58px repeat(${Math.max(0, visibleColumns.length - 2)},minmax(108px,.72fr))`,
    "--stats-min-width": `${Math.max(920, 288 + Math.max(0, visibleColumns.length - 2) * 114)}px`,
  } as CSSProperties;
  const changeSort = (nextKey:TeamStatsSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(defaultTeamStatsSortDirection(nextKey));
  };
  const changeStatGroup = (nextGroup:TeamStatsGroup) => {
    const nextColumns = teamStatsColumns(nextGroup, advancedView);
    const nextSort = nextColumns[2]?.key ?? nextColumns[0].key;
    setStatGroup(nextGroup);
    setSortKey(nextSort);
    setSortDirection(defaultTeamStatsSortDirection(nextSort));
  };
  const changeAdvancedView = (nextView:TeamStatsAdvancedView) => {
    const nextColumns = teamStatsColumns(statGroup, nextView);
    const nextSort = nextColumns[2]?.key ?? nextColumns[0].key;
    setAdvancedView(nextView);
    setSortKey(nextSort);
    setSortDirection(defaultTeamStatsSortDirection(nextSort));
  };

  return <section className="page-section stats-page">
    <div className="section-kicker">TEAM STAT DATABASE · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>Team Stats</h1><p>Weekly cumulative team production, raw defensive allowances and opponent-adjusted efficiency indices frozen after each week.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} /></div>
    {!rows.length ? <div className="data-empty"><strong>No team-stat snapshot is available for {season}, week {week}.</strong><span>Historical seasons populate automatically when the data pipeline is activated.</span></div> : <>
      <div className="stats-summary stats-leader-summary">
        {topOffense?<article><TeamMark name={topOffense.team} size="sm" logo={topOffense.logo}/><div><span>TOP OFFENSE</span><strong>{topOffense.team}</strong><small>{(average([topOffense.offYppIndex,topOffense.offYpaIndex,topOffense.offYpcIndex])*100).toFixed(0)} INDEX</small></div></article>:null}
        {topDefense?<article><TeamMark name={topDefense.team} size="sm" logo={topDefense.logo}/><div><span>TOP DEFENSE</span><strong>{topDefense.team}</strong><small>{(average([topDefense.defYppIndex,topDefense.defYpaIndex,topDefense.defYpcIndex])*100).toFixed(0)}% ALLOWED</small></div></article>:null}
      </div>
      <details className="stats-filter-drawer team-stats-filter-drawer">
        <summary><span><strong>Filters</strong><small>{groupLabel} · {conferenceFilterDisplay(conference)} · {activeSort.label} {sortDirection==="asc"?"↑":"↓"}{statGroup==="core"?"":` · ${advancedCoverage}/${rows.length} advanced`}</small></span><b aria-hidden="true">+</b></summary>
        <div className="stats-toolbar-controls" data-advanced={statGroup !== "core"}>
          <label className="stats-filter-group"><span>STAT GROUP</span><select value={statGroup} onChange={(event) => changeStatGroup(event.target.value as TeamStatsGroup)} aria-label="Choose team stat group">{TEAM_STATS_GROUPS.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
          {statGroup !== "core" ? <label className="stats-filter-view"><span>DATA VIEW</span><select value={advancedView} onChange={(event) => changeAdvancedView(event.target.value as TeamStatsAdvancedView)} aria-label="Choose advanced stat data view">{TEAM_STATS_ADVANCED_VIEWS.map((view) => <option key={view.key} value={view.key}>{view.label}</option>)}</select></label> : null}
          <label className="stats-filter-conference"><span>CONFERENCE</span><select value={conference} onChange={(event) => setConference(event.target.value)} aria-label="Filter conference"><option value="ALL">All conferences</option><option value={POWER_4_FILTER}>{POWER_4_LABEL}</option>{conferences.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="stats-filter-team"><span>TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team" aria-label="Search team stats" /></label>
          <div className="stats-mobile-sort"><label htmlFor="team-stats-sort">SORT TEAM STATS</label><select id="team-stats-sort" value={sortKey} onChange={(event) => changeSort(event.target.value as TeamStatsSortKey)} aria-label="Sort team stats by column">{visibleColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select><button type="button" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={`Change sort direction to ${sortDirection === "asc" ? "descending" : "ascending"}`}>{sortDirection === "asc" ? "↑ ASC" : "↓ DESC"}</button></div>
        </div>
      </details>
      <details className="stat-glossary"><summary>STAT DEFINITIONS · {groupLabel.toUpperCase()}</summary><div>{visibleColumns.map((column) => <article key={column.key}><strong>{column.label}</strong><span>{column.description}</span></article>)}</div></details>
      <div className="stats-table-shell">
        <div className="stats-head" role="row" style={statsGridStyle}>{visibleColumns.map((column) => {
          const active = column.key === sortKey;
          return <div className="stats-head-cell" role="columnheader" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} key={column.key}><button type="button" className={active ? "active" : ""} onClick={() => changeSort(column.key)} aria-label={`Sort by ${column.label}${active ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}><span>{column.label}</span><i aria-hidden="true">{active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</i></button><StatHelp label={column.label} explanation={column.description} /></div>;
        })}</div>
        {filtered.map((row) => <div className="stats-row" style={statsGridStyle} key={row.team}><div><TeamMark name={row.team} size="sm" logo={row.logo} /><span><strong>{row.team}</strong><small>{row.conference || "FBS"} · {row.advancedProfile ? `${row.advancedProfile.coverage.advancedGames} ADV GAMES` : "CORE PROFILE"}</small></span></div><div className="stats-metrics">{visibleColumns.slice(1).map((column) => <span className={`stats-value ${column.key === sortKey ? "active-value" : ""} ${teamStatsValueTone(row, column.key)}`} data-label={column.dataLabel} key={column.key}>{formatTeamStatsValue(row, column)}</span>)}</div></div>)}
      </div>
      <p className="all137-disclaimer">Raw values remain cumulative through the selected week. Adjusted percentages use the iterative opponent network: 100% is the FBS average, above 100% is stronger offense, and below 100% allowed is stronger defense. A dash means the historical source did not supply enough data for that metric.</p>
    </>}
  </section>;
}

function signed(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function metricConfidence(metric:AccuracyMetric|undefined) {
  if (!metric || metric.confidenceLow === null || metric.confidenceLow === undefined || metric.confidenceHigh === null || metric.confidenceHigh === undefined) return "95% CI —";
  return `95% CI ${(metric.confidenceLow*100).toFixed(1)}–${(metric.confidenceHigh*100).toFixed(1)}%`;
}

function fullGameDate(value?:string){
  if(!value)return"Date TBD";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-US",{weekday:"long",month:"short",day:"numeric",timeZone:"America/Chicago"}).format(date);
}

function gameTime(value?:string){
  if(!value)return"TIME TBD";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"TIME TBD":new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Chicago",timeZoneName:"short"}).format(date);
}

function gameDisplayScore(row:ScheduleRow,side:"home"|"away"){
  const actual=side==="home"?row.homePoints:row.awayPoints;
  const predicted=side==="home"?row.predictedHomeScore:row.predictedAwayScore;
  return Boolean(row.completed)&&actual!==null?actual:predicted===null?null:Math.round(predicted);
}

function gameTeamWon(row:ScheduleRow,side:"home"|"away"){
  const home=gameDisplayScore(row,"home"),away=gameDisplayScore(row,"away");
  if(home===null||away===null||home===away)return false;
  return side==="home"?home>away:away>home;
}

function gameTeamLost(row:ScheduleRow,side:"home"|"away"){
  const home=gameDisplayScore(row,"home"),away=gameDisplayScore(row,"away");
  if(home===null||away===null||home===away)return false;
  return side==="home"?home<away:away<home;
}

function gameTeamResultClass(row:ScheduleRow,side:"home"|"away"){
  return gameTeamWon(row,side)?"winner":gameTeamLost(row,side)?"loser":"";
}

function gameTeamCode(name:string){
  const known=teamMap.get(name)?.abbr;
  if(known)return known;
  const words=name.replace(/&/g," ").split(/\s+/).filter(Boolean);
  return (words.length>1?words.map((word)=>word[0]).join(""):name.slice(0,4)).slice(0,5).toUpperCase();
}

function marketSpreadLabel(row:ScheduleRow){
  if(row.formattedSpread?.trim())return row.formattedSpread.trim();
  const spread=row.vegasSpread??row.spreadOpen;
  if(spread===null||spread===undefined||!Number.isFinite(spread))return"—";
  if(Math.abs(spread)<.05)return"PK";
  const favorite=spread<0?row.homeTeam:row.awayTeam;
  return`${gameTeamCode(favorite)} -${Math.abs(spread).toFixed(Number.isInteger(spread)?0:1)}`;
}

function marketTotalLabel(row:ScheduleRow){
  const total=row.vegasTotal??row.overUnderOpen;
  return total===null||total===undefined||!Number.isFinite(total)?"—":`O/U ${total.toFixed(Number.isInteger(total)?0:1)}`;
}

function compactMarketSpreadLabel(row:ScheduleRow){
  const spread=row.vegasSpread??row.spreadOpen;
  if(spread===null||spread===undefined||!Number.isFinite(spread)){
    const formatted=row.formattedSpread?.trim();
    if(!formatted)return"—";
    const favorite=[row.homeTeam,row.awayTeam].sort((left,right)=>right.length-left.length).find((team)=>formatted.toLowerCase().startsWith(team.toLowerCase()));
    return favorite?`${gameTeamCode(favorite)}${formatted.slice(favorite.length)}`:formatted;
  }
  if(Math.abs(spread)<.05)return"PK";
  const favorite=spread<0?row.homeTeam:row.awayTeam;
  return`${gameTeamCode(favorite)} -${Math.abs(spread).toFixed(Number.isInteger(spread)?0:1)}`;
}

function compactMarketTotalLabel(row:ScheduleRow){
  const total=row.vegasTotal??row.overUnderOpen;
  return total===null||total===undefined||!Number.isFinite(total)?"—":total.toFixed(Number.isInteger(total)?0:1);
}

function modelSpreadLabel(row:ScheduleRow){
  const spread=row.modelHomeSpread;
  if(spread===null||spread===undefined||!Number.isFinite(spread))return"—";
  if(Math.abs(spread)<.05)return"PK";
  const favorite=spread<0?row.homeTeam:row.awayTeam;
  return`${gameTeamCode(favorite)} -${Math.abs(spread).toFixed(1)}`;
}

function modelTotalLabel(row:ScheduleRow){
  return row.modelTotal===null||row.modelTotal===undefined||!Number.isFinite(row.modelTotal)?"—":row.modelTotal.toFixed(1);
}

function GameModelAudit({row}:{row:ScheduleRow}){
  const spread=modelSpreadRead(row),total=modelTotalRead(row),ats=officialAtsSetRead(row);
  return <section className="game-model-audit" aria-label="Model result summary">
    <span data-tone={spread.tone}><b>SPREAD READ</b><strong>{spread.label}</strong></span>
    <span data-tone={ats.tone}><b>OFFICIAL ATS SET</b><strong>{ats.label}</strong></span>
    <span data-tone={total.tone}><b>TOTAL READ</b><strong>{total.label}</strong></span>
  </section>;
}

function CompactGameWinConditions({row,onExplore}:{row:ScheduleRow;onExplore:(row:ScheduleRow)=>void}){
  const [expanded,setExpanded]=useState(false);
  const request=useMemo<WinConditionRequest>(()=>({kind:"game",season:row.season,gameId:row.gameId}),[row.gameId,row.season]);
  const result=useWinConditions(request,expanded);
  const analysis=result.data?.analysis;
  const metric=(value:number|null)=>value===null?"—":value;
  return <section className={`score-win-conditions ${expanded?"open":""}`}>
    <button type="button" className="score-wc-toggle" aria-expanded={expanded} onClick={()=>setExpanded((current)=>!current)}><span><b>HOW THIS GAME IS WON</b><small>{expanded?"Hide H+ paths":"Win conditions · Path Width · Fragility"}</small></span><i aria-hidden="true">{expanded?"−":"+"}</i></button>
    {expanded?<div className="score-wc-body">
      {result.loading?<p className="score-wc-loading">Building the correlated game scripts…</p>:analysis?<>
        <div className="score-wc-team-grid">{[analysis.away,analysis.home].map((teamAnalysis)=><article key={teamAnalysis.side}>
          <header><TeamMark name={teamAnalysis.team} size="sm" logo={teamAnalysis.side==="home"?row.homeLogo:row.awayLogo}/><strong>{teamAnalysis.team}</strong></header>
          <div className="score-wc-metrics"><span><small>WIN</small><b>{Math.round(teamAnalysis.winProbability*100)}%</b></span><span><small>WIDTH</small><b>{metric(teamAnalysis.pathWidth)}</b></span><span><small>FRAGILITY</small><b>{metric(teamAnalysis.fragility)}</b></span></div>
          {analysis.dataQuality==="baseline-only"?<p>Baseline projection only — not enough point-in-time data for reliable thresholds.</p>:<ul>{teamAnalysis.conditions.slice(0,3).map((condition)=><li key={condition.id}><span>{condition.label}</span><b>{conditionTarget(condition)}</b></li>)}</ul>}
        </article>)}</div>
        <footer><span>{analysis.simulationCount.toLocaleString()} correlated simulations</span><button type="button" onClick={()=>onExplore(row)}>EXPLORE WIN CONDITIONS <i aria-hidden="true">→</i></button></footer>
      </>:<p className="score-wc-loading">{result.error||"Win Conditions are unavailable for this matchup."}</p>}
    </div>:null}
  </section>;
}

function MobileGameCard({row,onOpen,onExplore,projectedFinalRanks,rankingWeek}:{row:ScheduleRow;onOpen:(row:ScheduleRow)=>void;onExplore:(row:ScheduleRow)=>void;projectedFinalRanks:Map<string,number>;rankingWeek:number}){
  const completed=Boolean(row.completed);
  const homeScore=gameDisplayScore(row,"home"),awayScore=gameDisplayScore(row,"away");
  const rankingEvidence=rankingWeek?`results through week ${rankingWeek}`:"the preseason snapshot";
  const projectedRank=(team:string,side:"home"|"away")=>{
    const gameTimeRank=side==="home"?row.homePregameRank:row.awayPregameRank;
    const rank=gameTimeRank??projectedFinalRanks.get(team);
    return rank&&rank<=25?<em className="mobile-game-team-rank" aria-label={`Harper Plus entering-week rank ${rank}, projected final order based on ${rankingEvidence}`}>H+ #{rank}</em>:null;
  };
  return <article className="mobile-game-card-shell">
    <button type="button" className="mobile-game-card schedule-field-card" onClick={()=>onOpen(row)} aria-label={`Open ${row.awayTeam} at ${row.homeTeam}`}>
      <span className="mobile-game-matchup">
        <span className={`mobile-game-team away-side ${gameTeamResultClass(row,"away")}`}><TeamMark name={row.awayTeam} size="sm" logo={row.awayLogo} genericLabel={isFcsTeam(row.awayTeam,row.awayConference)?"FCS":undefined}/><span><span className="mobile-game-team-title"><strong data-compact-name={gameTeamCode(row.awayTeam)} title={row.awayTeam}>{row.awayTeam}</strong>{projectedRank(row.awayTeam,"away")}</span><small>AWAY · {row.awayRecordAfter??row.awayConference??"FBS"}</small></span><b>{awayScore??"—"}</b></span>
        <span className="mobile-game-status"><strong>{completed?"FINAL":"H+ PROJ"}</strong><small>{completed?scheduleGameLabel(row):gameTime(row.startDate)}</small><i aria-hidden="true">›</i></span>
        <span className={`mobile-game-team home-side ${gameTeamResultClass(row,"home")}`}><TeamMark name={row.homeTeam} size="sm" logo={row.homeLogo} genericLabel={isFcsTeam(row.homeTeam,row.homeConference)?"FCS":undefined}/><span><span className="mobile-game-team-title"><strong data-compact-name={gameTeamCode(row.homeTeam)} title={row.homeTeam}>{row.homeTeam}</strong>{projectedRank(row.homeTeam,"home")}</span><small>{row.neutralSite?"DESIGNATED HOME":"HOME"} · {row.homeRecordAfter??row.homeConference??"FBS"}</small></span><b>{homeScore??"—"}</b></span>
      </span>
      <span className="mobile-game-market-strip" aria-label="Market and H+ lines"><span><i>MKT SPREAD</i><b>{compactMarketSpreadLabel(row)}</b></span><span><i>H+ SPREAD</i><b>{modelSpreadLabel(row)}</b></span><span><i>MKT TOTAL</i><b>{compactMarketTotalLabel(row)}</b></span><span><i>H+ TOTAL</i><b>{modelTotalLabel(row)}</b></span></span>
    </button>
    <CompactGameWinConditions row={row} onExplore={onExplore}/>
  </article>;
}

function MobileScoreboard({rows,onOpen,onExplore,projectedFinalRanks,rankingWeek}:{rows:ScheduleRow[];onOpen:(row:ScheduleRow)=>void;onExplore:(row:ScheduleRow)=>void;projectedFinalRanks:Map<string,number>;rankingWeek:number}){
  const groups=rows.reduce<Array<{label:string;rows:ScheduleRow[]}>>((result,row)=>{
    const label=fullGameDate(row.startDate);
    const previous=result.at(-1);
    if(previous?.label===label)previous.rows.push(row);
    else result.push({label,rows:[row]});
    return result;
  },[]);
  return <div className="mobile-scoreboard">
    {groups.map((group)=><section className="mobile-score-day" key={group.label}><h2>{group.label}</h2><div className="schedule-column-grid" style={scheduleColumnGridStyle(group.rows.length)}>{group.rows.map((row)=><MobileGameCard key={row.gameId} row={row} onOpen={onOpen} onExplore={onExplore} projectedFinalRanks={projectedFinalRanks} rankingWeek={rankingWeek}/>)}</div></section>)}
  </div>;
}

function compactGameDate(value?:string){
  if(!value)return"TBD";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"America/Chicago"}).format(date).toUpperCase();
}

function TeamScheduleGame({row,team,onOpen}:{row:ScheduleRow;team:string;onOpen:(row:ScheduleRow)=>void}){
  const completed=Boolean(row.completed);
  const homeScore=gameDisplayScore(row,"home"),awayScore=gameDisplayScore(row,"away");
  const selectedSide=row.homeTeam===team?"home":row.awayTeam===team?"away":null;
  const selectedTeamLost=selectedSide?gameTeamLost(row,selectedSide):false;
  const teamLine=(side:"home"|"away")=>{
    const home=side==="home";
    const name=home?row.homeTeam:row.awayTeam;
    const logo=home?row.homeLogo:row.awayLogo;
    const score=home?homeScore:awayScore;
    const rank=home?row.homePregameRank:row.awayPregameRank;
    const conference=home?row.homeConference:row.awayConference;
    return <span className={`team-schedule-team ${gameTeamResultClass(row,side)}`}>
      <TeamMark name={name} size="sm" logo={logo} genericLabel={isFcsTeam(name,conference)?"FCS":undefined} variant="helmet"/>
      <span><strong>{name}</strong>{rank&&rank<=25?<em className="schedule-game-rank" aria-label={`Harper+ entering-week rank ${rank}`}>H+ #{rank}</em>:null}</span>
      <b>{score??"—"}</b>
    </span>;
  };
  return <button type="button" className={`team-schedule-game schedule-field-card ${selectedTeamLost?"loss":""}`} onClick={()=>onOpen(row)} aria-label={`Open ${row.awayTeam} at ${row.homeTeam}`}>
    <span className="team-schedule-teams">{teamLine("away")}{teamLine("home")}</span>
    <span className="team-schedule-status"><strong>{completed?"FINAL":"H+ PROJ"}</strong><small>{scheduleGameLabel(row)} · {compactGameDate(row.startDate)}</small><i aria-hidden="true">›</i></span>
  </button>;
}

function TeamScheduleList({rows,team,onOpen}:{rows:ScheduleRow[];team:string;onOpen:(row:ScheduleRow)=>void}){
  return <div className="team-schedule-list schedule-column-grid" style={scheduleColumnGridStyle(rows.length)}>{rows.map((row)=><TeamScheduleGame key={row.gameId} row={row} team={team} onOpen={onOpen}/>)}</div>;
}

function gameStatValue(value:number|null|undefined,digits=0){
  return value===null||value===undefined||!Number.isFinite(value)?"—":digits?value.toFixed(digits):Math.round(value).toString();
}

const fallbackGameStatBenchmarks:GameStatBenchmarks={
  firstSeason:2021,lastSeason:2025,sampleSize:0,
  basic:{totalYards:385,yardsPerPlay:5.7,passYards:230,passAttempts:34,passCompletions:21,yardsPerPass:7.2,rushYards:155,rushAttempts:35,yardsPerRush:4.4,turnovers:1.3},
  advanced:{successRate:.42,explosiveness:1.34,ppa:.15,pointsPerDrive:2.2,playsPerDrive:6.2,thirdDownSuccessRate:.40,redZoneEfficiency:.82,havocRate:.18,lineYards:2.9,secondLevelYards:1.0,openFieldYards:.8,stuffRate:.20,powerSuccess:.68,rushingSuccessRate:.41,rushingExplosiveness:1.15,rushingPpa:.12,completionRate:.63,yardsPerCompletion:12.5,passingSuccessRate:.42,passingExplosiveness:1.45,passingPpa:.17,standardDownSuccessRate:.45,passingDownSuccessRate:.32},
};

function gameStatBenchmark(row:ScheduleRow){
  const live=row.statBenchmarks;
  const fill=<T extends object>(fallback:T,candidate:T|undefined)=>Object.fromEntries(
    Object.entries(fallback).map(([key,value])=>[key,(candidate as Record<string,unknown>|undefined)?.[key]??value]),
  ) as T;
  return {
    ...fallbackGameStatBenchmarks,
    ...(live??{}),
    basic:fill(fallbackGameStatBenchmarks.basic,live?.basic),
    advanced:fill(fallbackGameStatBenchmarks.advanced,live?.advanced),
  };
}

function gameStatTone(value:number|null|undefined,average:number|null|undefined,lowerIsBetter=false){
  if(value===null||value===undefined||average===null||average===undefined||!Number.isFinite(value)||!Number.isFinite(average))return"unavailable";
  const favorable=(value-average)*(lowerIsBetter?-1:1);
  const threshold=Math.max(Math.abs(average)*.08,Math.abs(average)<1?.025:.5);
  if(favorable>threshold)return"good";
  if(favorable<-threshold)return"poor";
  return"average";
}

type GameStatLeader={name:string;logo?:string;conference?:string};

function gameStatLeaderSide(away:number|null|undefined,home:number|null|undefined,lowerIsBetter=false):"away"|"home"|null{
  if(away===null||away===undefined||home===null||home===undefined||!Number.isFinite(away)||!Number.isFinite(home)||Math.abs(away-home)<1e-9)return null;
  const awayBetter=lowerIsBetter?away<home:away>home;
  return awayBetter?"away":"home";
}

function GameStatReadout({display,value,average,lowerIsBetter=false,leader}:{display:string;value:number|null|undefined;average:number|null|undefined;lowerIsBetter?:boolean;leader?:GameStatLeader}){
  const tone=gameStatTone(value,average,lowerIsBetter);
  const quality=tone==="good"?"above average":tone==="poor"?"below average":tone==="average"?"near average":"unavailable";
  return <strong className={`game-stat-readout ${tone}`} aria-label={`${display}, ${quality}${leader?`, ${leader.name} led this category`:""}`}>{leader?<TeamMark name={leader.name} size="sm" logo={leader.logo} genericLabel={isFcsTeam(leader.name,leader.conference)?"FCS":undefined} variant="helmet"/>:null}<b>{display}</b></strong>;
}

function GameStatLegend({benchmarks}:{benchmarks:GameStatBenchmarks}){
  const range=benchmarks.sampleSize?`${benchmarks.firstSeason}–${benchmarks.lastSeason}`:"RECENT FBS";
  return <div className="game-stat-legend"><small>FBS AVG · {range}</small><span className="good"><i/>ABOVE</span><span className="average"><i/>AVERAGE</span><span className="poor"><i/>BELOW</span></div>;
}

function gameRate(numerator:number|null|undefined,denominator:number|null|undefined){
  return numerator===null||numerator===undefined||denominator===null||denominator===undefined||denominator<=0?null:numerator/denominator;
}

function GameStatComparison({row}:{row:ScheduleRow}){
  const completed=Boolean(row.completed);
  const away=completed?row.awayActualStats:row.awayPredictedStats;
  const home=completed?row.homeActualStats:row.homePredictedStats;
  const benchmarks=gameStatBenchmark(row);
  const completionAverage=gameRate(benchmarks.basic.passCompletions,benchmarks.basic.passAttempts)??benchmarks.advanced.completionRate;
  const statRows:Array<{label:string;away:string;home:string;awayRaw:number|null|undefined;homeRaw:number|null|undefined;average:number|null;averageDisplay:string;lowerIsBetter?:boolean;major?:boolean;sub?:boolean;group?:"passing"|"rushing"}>=[
    {label:"Total Yards",away:gameStatValue(away?.totalYards),home:gameStatValue(home?.totalYards),awayRaw:away?.totalYards,homeRaw:home?.totalYards,average:benchmarks.basic.totalYards,averageDisplay:gameStatValue(benchmarks.basic.totalYards),major:true},
    {label:"Yards per play",away:gameStatValue(away?.yardsPerPlay,1),home:gameStatValue(home?.yardsPerPlay,1),awayRaw:away?.yardsPerPlay,homeRaw:home?.yardsPerPlay,average:benchmarks.basic.yardsPerPlay,averageDisplay:gameStatValue(benchmarks.basic.yardsPerPlay,1),sub:true},
    {label:"Passing yards",away:gameStatValue(away?.passYards),home:gameStatValue(home?.passYards),awayRaw:away?.passYards,homeRaw:home?.passYards,average:benchmarks.basic.passYards,averageDisplay:gameStatValue(benchmarks.basic.passYards),major:true,group:"passing"},
    {label:"Comp / Att",away:away?.passCompletions===null||away?.passCompletions===undefined?`— / ${gameStatValue(away?.passAttempts)}`:`${gameStatValue(away.passCompletions)} / ${gameStatValue(away.passAttempts)}`,home:home?.passCompletions===null||home?.passCompletions===undefined?`— / ${gameStatValue(home?.passAttempts)}`:`${gameStatValue(home.passCompletions)} / ${gameStatValue(home.passAttempts)}`,awayRaw:gameRate(away?.passCompletions,away?.passAttempts),homeRaw:gameRate(home?.passCompletions,home?.passAttempts),average:completionAverage,averageDisplay:`${gameStatValue(benchmarks.basic.passCompletions)} / ${gameStatValue(benchmarks.basic.passAttempts)}`,sub:true},
    {label:"Yards per pass",away:gameStatValue(away?.yardsPerPass,1),home:gameStatValue(home?.yardsPerPass,1),awayRaw:away?.yardsPerPass,homeRaw:home?.yardsPerPass,average:benchmarks.basic.yardsPerPass,averageDisplay:gameStatValue(benchmarks.basic.yardsPerPass,1),sub:true},
    {label:"Rushing yards",away:gameStatValue(away?.rushYards),home:gameStatValue(home?.rushYards),awayRaw:away?.rushYards,homeRaw:home?.rushYards,average:benchmarks.basic.rushYards,averageDisplay:gameStatValue(benchmarks.basic.rushYards),major:true,group:"rushing"},
    {label:"Rush attempts",away:gameStatValue(away?.rushAttempts),home:gameStatValue(home?.rushAttempts),awayRaw:away?.rushAttempts,homeRaw:home?.rushAttempts,average:benchmarks.basic.rushAttempts,averageDisplay:gameStatValue(benchmarks.basic.rushAttempts),sub:true},
    {label:"Yards per rush",away:gameStatValue(away?.yardsPerRush,1),home:gameStatValue(home?.yardsPerRush,1),awayRaw:away?.yardsPerRush,homeRaw:home?.yardsPerRush,average:benchmarks.basic.yardsPerRush,averageDisplay:gameStatValue(benchmarks.basic.yardsPerRush,1),sub:true},
    ...(completed?[{label:"Turnovers",away:gameStatValue(away?.turnovers),home:gameStatValue(home?.turnovers),awayRaw:away?.turnovers,homeRaw:home?.turnovers,average:benchmarks.basic.turnovers,averageDisplay:gameStatValue(benchmarks.basic.turnovers,1),lowerIsBetter:true,major:true}]:[]),
  ];
  return <section className="game-detail-stats">
    <header><div><span>{completed?"ACTUAL":"MODEL-PROJECTED"}</span><h2>Team Stats</h2></div><p>{completed?"Official game totals":"Expected game profile from the prior-week model"}</p></header>
    <GameStatLegend benchmarks={benchmarks}/>
    <div className="game-stat-head"><b>STAT</b><span>{gameTeamCode(row.awayTeam)}</span><span>{gameTeamCode(row.homeTeam)}</span></div>
    {statRows.map((stat)=>{
      const leader=gameStatLeaderSide(stat.awayRaw,stat.homeRaw,stat.lowerIsBetter);
      return <div className={`game-stat-row ${stat.major?"major":""} ${stat.group?`category-start ${stat.group}`:""}`} key={stat.label}><span className={stat.sub?"sub":""}>{stat.group?<small>{stat.group}</small>:null}{stat.label}<em>AVG {stat.averageDisplay}</em></span><GameStatReadout display={stat.away} value={stat.awayRaw} average={stat.average} lowerIsBetter={stat.lowerIsBetter} leader={leader==="away"?{name:row.awayTeam,logo:row.awayLogo,conference:row.awayConference}:undefined}/><GameStatReadout display={stat.home} value={stat.homeRaw} average={stat.average} lowerIsBetter={stat.lowerIsBetter} leader={leader==="home"?{name:row.homeTeam,logo:row.homeLogo,conference:row.homeConference}:undefined}/></div>;
    })}
  </section>;
}

function gameAdvancedValue(value:number|null|undefined,format:"rate"|"number"|"yards"="number"){
  if(value===null||value===undefined||!Number.isFinite(value))return"—";
  if(format==="rate")return`${Math.round(value*100)}%`;
  return value.toFixed(format==="yards"?1:2);
}

function GameAdvancedComparison({row}:{row:ScheduleRow}){
  const completed=Boolean(row.completed);
  const away=completed?row.awayActualAdvanced:row.awayPredictedAdvanced;
  const home=completed?row.homeActualAdvanced:row.homePredictedAdvanced;
  const benchmarks=gameStatBenchmark(row);
  const definitions:Array<{group:string;label:string;key:keyof GameAdvancedProfile;format:"rate"|"number"|"yards";lowerIsBetter?:boolean}>=[
    {group:"Efficiency",label:"Success rate",key:"successRate",format:"rate"},
    {group:"Efficiency",label:"PPA / play",key:"ppa",format:"number"},
    {group:"Efficiency",label:"Explosiveness",key:"explosiveness",format:"number"},
    {group:"Efficiency",label:"Points / drive",key:"pointsPerDrive",format:"number"},
    {group:"Situational",label:"3rd down success",key:"thirdDownSuccessRate",format:"rate"},
    {group:"Situational",label:"Standard-down success",key:"standardDownSuccessRate",format:"rate"},
    {group:"Situational",label:"Passing-down success",key:"passingDownSuccessRate",format:"rate"},
    {group:"Rushing",label:"Line yards / rush",key:"lineYards",format:"yards"},
    {group:"Rushing",label:"Rush success rate",key:"rushingSuccessRate",format:"rate"},
    {group:"Rushing",label:"Stuff rate",key:"stuffRate",format:"rate",lowerIsBetter:true},
    {group:"Rushing",label:"Power success",key:"powerSuccess",format:"rate"},
    {group:"Passing",label:"Completion rate",key:"completionRate",format:"rate"},
    {group:"Passing",label:"Pass success rate",key:"passingSuccessRate",format:"rate"},
    {group:"Passing",label:"Yards / completion",key:"yardsPerCompletion",format:"yards"},
    {group:"Disruption",label:"Havoc allowed",key:"havocRate",format:"rate",lowerIsBetter:true},
  ];
  const rows=definitions.filter((definition)=>away?.[definition.key]!=null||home?.[definition.key]!=null);
  let previousGroup="";
  return <section className="game-detail-stats game-advanced-stats">
    <header><div><span>{completed?"ACTUAL":"MODEL-PROJECTED"}</span><h2>Advanced Stats</h2></div><p>Efficiency, situational play and matchup quality</p></header>
    <GameStatLegend benchmarks={benchmarks}/>
    <div className="game-stat-head"><b>STAT</b><span>{gameTeamCode(row.awayTeam)}</span><span>{gameTeamCode(row.homeTeam)}</span></div>
    {rows.length?rows.map((definition)=>{
      const showGroup=definition.group!==previousGroup;
      previousGroup=definition.group;
      const average=benchmarks.advanced[definition.key];
      const leader=gameStatLeaderSide(away?.[definition.key],home?.[definition.key],definition.lowerIsBetter);
      return <div className={`game-stat-row ${showGroup?"advanced-group":""}`} key={definition.key}><span>{showGroup?<small>{definition.group}</small>:null}{definition.label}<em>AVG {gameAdvancedValue(average,definition.format)}</em></span><GameStatReadout display={gameAdvancedValue(away?.[definition.key],definition.format)} value={away?.[definition.key]} average={average} lowerIsBetter={definition.lowerIsBetter} leader={leader==="away"?{name:row.awayTeam,logo:row.awayLogo,conference:row.awayConference}:undefined}/><GameStatReadout display={gameAdvancedValue(home?.[definition.key],definition.format)} value={home?.[definition.key]} average={average} lowerIsBetter={definition.lowerIsBetter} leader={leader==="home"?{name:row.homeTeam,logo:row.homeLogo,conference:row.homeConference}:undefined}/></div>;
    }):<div className="game-stats-empty">Advanced game data is unavailable for this matchup.</div>}
  </section>;
}

function gameFavoriteName(row:ScheduleRow){
  if(row.edgeAnalysis?.favorite)return row.edgeAnalysis.favorite;
  const homeProbability=row.homeWinProbability??((row.predictedHomeScore??0)>=(row.predictedAwayScore??0) ? 0.51 : 0.49);
  return homeProbability>=.5?row.homeTeam:row.awayTeam;
}

function gamePreviewSentence(row:ScheduleRow){
  const favorite=gameFavoriteName(row);
  const underdog=favorite===row.homeTeam?row.awayTeam:row.homeTeam;
  const analysis=row.edgeAnalysis;
  const strengthOrder={even:0,slight:1,clear:2,strong:3};
  const positionEdge=analysis?.positionGroups
    .filter((edge)=>edge.edgeTeam===favorite)
    .sort((first,second)=>strengthOrder[second.strength]-strengthOrder[first.strength])[0];
  if(positionEdge?.id==="trenches")return`${favorite} is favored because its offensive line should control the defensive front, keeping the offense out of obvious passing downs and preserving the full playbook.`;
  if(positionEdge?.id==="run-space")return`${favorite} is favored because its backs should clear the first level and force ${underdog}’s linebackers and safeties to make repeated tackles in space.`;
  if(positionEdge?.id==="quarterback")return`${favorite} is favored because its quarterback has the cleaner matchup against coverage, giving the offense a more dependable way to stay on schedule.`;
  if(positionEdge?.id==="receivers")return`${favorite} is favored because its receivers should create leverage against ${underdog}’s secondary, opening cleaner throwing windows and more explosive-play chances.`;
  if(positionEdge?.id==="down-leverage")return`${favorite} is favored because it should stay ahead of the chains, protecting the quarterback and preventing ${underdog} from dictating obvious passing situations.`;
  if(analysis?.defense.edgeTeam===favorite)return`${favorite} is favored because its defense should create more negative plays and force ${underdog} to sustain drives from unfavorable down-and-distance situations.`;
  if(analysis?.run.edgeTeam===favorite)return`${favorite} is favored because its run game should win early downs, control personnel and keep ${underdog} from attacking a predictable passing offense.`;
  if(analysis?.pass.edgeTeam===favorite)return`${favorite} is favored because its quarterback and receivers have the cleaner coverage matchup, giving the offense answers when the defense forces passing downs.`;
  const favoriteAdvanced=favorite===row.homeTeam?row.homePredictedAdvanced:row.awayPredictedAdvanced;
  const otherAdvanced=favorite===row.homeTeam?row.awayPredictedAdvanced:row.homePredictedAdvanced;
  if((favoriteAdvanced?.lineYards??0)>(otherAdvanced?.lineYards??0))return`${favorite} is favored because its offensive line should create a steadier early-down run game, keeping the offense balanced and limiting ${underdog}’s pressure opportunities.`;
  if((favoriteAdvanced?.passingSuccessRate??0)>(otherAdvanced?.passingSuccessRate??0))return`${favorite} is favored because its passing structure should produce more manageable completions and keep the quarterback from relying on low-percentage throws.`;
  return`${favorite} is favored because the matchup gives it the more reliable path to stay ahead of the chains and avoid drive-killing negative plays.`;
}

type GamePlayerRoleKey="qb"|"rb"|"receiver"|"pass-rusher"|"linebacker"|"secondary";
type GamePlayerSelection={role:GamePlayerRoleKey;label:string;player:PlayerProfile};
type GamePlayerStat={label:string;value:string};
type GamePlayerDisplayRow={
  key:string;kind:"player"|"unit";label:string;name:string;jersey:number|null;meta:string;
  stats:GamePlayerStat[];grade:number|null;
};

const gamePlayerRoles:Array<{role:GamePlayerRoleKey;label:string;positions:string[]}>= [
  {role:"qb",label:"QUARTERBACK",positions:["QB"]},
  {role:"rb",label:"RUNNING BACK",positions:["RB","FB"]},
  {role:"receiver",label:"TOP RECEIVER",positions:["WR","TE"]},
  {role:"pass-rusher",label:"PASS RUSHER",positions:["EDGE","DE","OLB"]},
  {role:"linebacker",label:"LINEBACKER",positions:["LB","ILB","MLB","WLB","SLB","OLB"]},
  {role:"secondary",label:"SECONDARY",positions:["CB","S","FS","SS","DB","NB","STAR"]},
];

function gamePlayerRoleScore(player:PlayerProfile,role:GamePlayerRoleKey){
  const base=(player.productionRating??player.impactScore)*3+(player.projectedStarter?40:0);
  if(role==="qb")return base+playerBasicMetric(player,"passYards")+50*playerBasicMetric(player,"passTd")-20*playerBasicMetric(player,"interceptions")+.2*playerBasicMetric(player,"rushYards");
  if(role==="rb")return base+playerBasicMetric(player,"rushYards")+65*playerBasicMetric(player,"rushTd")+4*playerBasicMetric(player,"receptions")+.4*playerBasicMetric(player,"receivingYards");
  if(role==="receiver")return base+playerBasicMetric(player,"receivingYards")+8*playerBasicMetric(player,"receptions")+70*playerBasicMetric(player,"receivingTd");
  if(role==="pass-rusher")return base+120*playerBasicMetric(player,"sacks")+35*playerBasicMetric(player,"tfl")+15*playerBasicMetric(player,"qbHurries")+2*playerBasicMetric(player,"tackles");
  if(role==="linebacker")return base+6*playerBasicMetric(player,"tackles")+25*playerBasicMetric(player,"tfl")+45*playerBasicMetric(player,"sacks")+10*playerBasicMetric(player,"passesDefended");
  return base+120*playerBasicMetric(player,"defensiveInterceptions")+35*playerBasicMetric(player,"passesDefended")+3*playerBasicMetric(player,"tackles");
}

function gameImpactPlayers(model:TeamPlayerModel|undefined):GamePlayerSelection[]{
  if(!model)return[];
  const used=new Set<string>();
  return gamePlayerRoles.flatMap((role)=>{
    const player=model.players
      .filter((candidate)=>!used.has(candidate.id)&&role.positions.includes(candidate.position))
      .sort((first,second)=>gamePlayerRoleScore(second,role.role)-gamePlayerRoleScore(first,role.role))[0];
    if(!player)return[];
    used.add(player.id);
    return [{role:role.role,label:role.label,player}];
  });
}

function gamePlayerRoleStats(selection:GamePlayerSelection){
  const {player,role}=selection;
  const value=(label:string,metric:number)=>({label,value:metric>0?(Number.isInteger(metric)?metric.toFixed(0):metric.toFixed(1)):"—"});
  if(role==="pass-rusher")return[value("TFL",playerBasicMetric(player,"tfl")),value("SACKS",playerBasicMetric(player,"sacks"))];
  if(role==="linebacker")return[value("TACKLES",playerBasicMetric(player,"tackles")),value("TFL",playerBasicMetric(player,"tfl"))];
  if(role==="secondary")return[value("PD",playerBasicMetric(player,"passesDefended")),value("INT",playerBasicMetric(player,"defensiveInterceptions"))];
  return playerHeadlineStats(player).slice(0,2);
}

function gameUnitPlayers(model:TeamPlayerModel,positions:string[],limit:number) {
  const candidates=model.players
    .filter((player)=>positions.includes(player.position))
    .sort((first,second)=>Number(second.projectedStarter)-Number(first.projectedStarter)||(second.productionRating??second.impactScore)-(first.productionRating??first.impactScore));
  const starters=candidates.filter((player)=>player.projectedStarter);
  return (starters.length?starters:candidates).slice(0,limit);
}

function roundedPlayerUnitGrade(players:PlayerProfile[]) {
  const ratings=players.map((player)=>player.productionRating).filter((rating):rating is number=>typeof rating==="number"&&Number.isFinite(rating));
  return ratings.length?Math.round(ratings.reduce((sum,rating)=>sum+rating,0)/ratings.length):null;
}

function summedUnitStat(players:PlayerProfile[],metric:Parameters<typeof playerBasicMetric>[1]) {
  const total=players.reduce((sum,player)=>sum+playerBasicMetric(player,metric),0);
  return total>0?(Number.isInteger(total)?total.toFixed(0):total.toFixed(1)):"—";
}

function gameUnitRows(model:TeamPlayerModel,team:string):GamePlayerDisplayRow[] {
  const offensiveLine=gameUnitPlayers(model,["OL","OT","T","LT","RT","OG","G","LG","RG","C","IOL"],5);
  const defensiveTackles=gameUnitPlayers(model,["DL","DT","NT"],2);
  const listedWeights=offensiveLine.map((player)=>player.weight).filter((weight):weight is number=>typeof weight==="number"&&Number.isFinite(weight));
  const averageWeight=listedWeights.length?`${Math.round(listedWeights.reduce((sum,weight)=>sum+weight,0)/listedWeights.length)}`:"—";
  return [
    {
      key:"offensive-line-unit",kind:"unit",label:"OFFENSIVE LINE UNIT",name:`${team} OLine`,jersey:offensiveLineJerseyNumber(team),meta:"5-MAN UNIT",
      stats:[{label:"AVG WT",value:averageWeight},{label:"LINEMEN",value:offensiveLine.length?String(offensiveLine.length):"—"}],
      grade:typeof model.offensiveLineUnitRating==="number"?Math.round(model.offensiveLineUnitRating):null,
    },
    {
      key:"defensive-tackle-unit",kind:"unit",label:"DEFENSIVE TACKLE UNIT",name:`${team} DT Unit`,jersey:defensiveTackleUnitJerseyNumber(team),meta:"INTERIOR UNIT",
      stats:[{label:"TFL",value:summedUnitStat(defensiveTackles,"tfl")},{label:"SACKS",value:summedUnitStat(defensiveTackles,"sacks")}],
      grade:roundedPlayerUnitGrade(defensiveTackles),
    },
  ];
}

function gamePlayerDisplayRows(model:TeamPlayerModel,team:string):GamePlayerDisplayRow[] {
  const individualRows=new Map(gameImpactPlayers(model).map((selection)=>[selection.role,{
    key:`${selection.role}:${selection.player.id}`,
    kind:"player" as const,
    label:selection.label,
    name:selection.player.displayName,
    jersey:selection.player.jersey,
    meta:selection.player.projectedStarter?"STARTER":"FEATURED",
    stats:gamePlayerRoleStats(selection),
    grade:typeof selection.player.productionRating==="number"?Math.round(selection.player.productionRating):null,
  }]));
  const units=new Map(gameUnitRows(model,team).map((row)=>[row.key,row]));
  return [
    individualRows.get("qb"),individualRows.get("rb"),individualRows.get("receiver"),units.get("offensive-line-unit"),
    individualRows.get("pass-rusher"),units.get("defensive-tackle-unit"),individualRows.get("linebacker"),individualRows.get("secondary"),
  ].filter((entry):entry is GamePlayerDisplayRow=>Boolean(entry));
}

function gamePlayerMetric(metrics:PlayerWeeklyMetricMap,key:keyof PlayerWeeklyMetricMap){
  const value=metrics[key];
  return typeof value==="number"&&Number.isFinite(value)?value:null;
}

function gamePlayerNumber(value:number|null,digits=0){
  return value===null?"—":value.toFixed(digits);
}

function normalizedPlayerName(value:string){
  return value.toLowerCase().replace(/[^a-z0-9]/g,"");
}

function gamePlayerImpact(line:GamePlayerLine){
  const metric=(key:keyof PlayerWeeklyMetricMap)=>gamePlayerMetric(line.metrics,key)??0;
  return metric("passYards")+.9*metric("rushYards")+.9*metric("receivingYards")+45*(metric("passTd")+metric("rushTd")+metric("receivingTd"))
    +6*metric("tackles")+24*metric("tfl")+50*metric("sacks")+70*metric("defensiveInterceptions")+25*metric("passesDefended")
    +18*metric("fieldGoalsMade")+2*metric("puntYards");
}

function inferredGamePlayerPosition(metrics:PlayerWeeklyMetricMap){
  const metric=(key:keyof PlayerWeeklyMetricMap)=>gamePlayerMetric(metrics,key)??0;
  if(metric("passAttempts")>0)return"QB";
  if(metric("fieldGoalsAttempted")>0||metric("extraPointsMade")>0)return"K";
  if(metric("punts")>0)return"P";
  if(metric("tackles")+metric("tfl")+metric("sacks")+metric("passesDefended")>0)return"DEF";
  if(metric("receptions")>0)return"WR/TE";
  if(metric("rushAttempts")>0)return"RB";
  return"PLAYER";
}

function gamePlayerBoxStats(position:string,metrics:PlayerWeeklyMetricMap):GamePlayerStat[]{
  const metric=(key:keyof PlayerWeeklyMetricMap)=>gamePlayerMetric(metrics,key);
  const sum=(...keys:Array<keyof PlayerWeeklyMetricMap>)=>keys.reduce((total,key)=>total+(metric(key)??0),0);
  if(position==="QB"||(metric("passAttempts")??0)>0)return[
    {label:"C / ATT",value:`${gamePlayerNumber(metric("passCompletions"))} / ${gamePlayerNumber(metric("passAttempts"))}`},
    {label:"PASS YDS",value:gamePlayerNumber(metric("passYards"))},
    {label:"TD / INT",value:`${gamePlayerNumber(metric("passTd"))} / ${gamePlayerNumber(metric("passInterceptions"))}`},
  ];
  if(position==="K"||(metric("fieldGoalsAttempted")??0)>0)return[
    {label:"FG",value:`${gamePlayerNumber(metric("fieldGoalsMade"))} / ${gamePlayerNumber(metric("fieldGoalsAttempted"))}`},
    {label:"XP",value:gamePlayerNumber(metric("extraPointsMade"))},
  ];
  if(position==="P"||(metric("punts")??0)>0)return[
    {label:"PUNTS",value:gamePlayerNumber(metric("punts"))},
    {label:"AVG",value:gamePlayerNumber(metric("puntAverage"),1)},
  ];
  if((metric("tackles")??0)+(metric("tfl")??0)+(metric("sacks")??0)+(metric("passesDefended")??0)>0)return[
    {label:"TACKLES",value:gamePlayerNumber(metric("tackles"))},
    {label:"TFL / SACK",value:`${gamePlayerNumber(metric("tfl"),1)} / ${gamePlayerNumber(metric("sacks"),1)}`},
    {label:"INT / PD",value:`${gamePlayerNumber(metric("defensiveInterceptions"))} / ${gamePlayerNumber(metric("passesDefended"))}`},
  ];
  if((metric("receptions")??0)>0||["WR","TE","WR/TE"].includes(position))return[
    {label:"REC",value:gamePlayerNumber(metric("receptions"))},
    {label:"REC YDS",value:gamePlayerNumber(metric("receivingYards"))},
    {label:"TD",value:gamePlayerNumber(metric("receivingTd"))},
  ];
  return[
    {label:"CAR",value:gamePlayerNumber(metric("rushAttempts"))},
    {label:"RUSH YDS",value:gamePlayerNumber(metric("rushYards"))},
    {label:"TOTAL TD",value:gamePlayerNumber(sum("rushTd","receivingTd"))},
  ];
}

function gamePlayerBoxRows(lines:GamePlayerLine[],model:TeamPlayerModel|undefined,scope:"game"|"season"):GamePlayerDisplayRow[]{
  const byId=new Map((model?.players??[]).map((player)=>[player.id,player]));
  const byName=new Map((model?.players??[]).map((player)=>[normalizedPlayerName(player.displayName),player]));
  return[...lines].sort((first,second)=>gamePlayerImpact(second)-gamePlayerImpact(first)||first.playerName.localeCompare(second.playerName)).slice(0,12).map((line)=>{
    const profile=byId.get(line.playerId)||byName.get(normalizedPlayerName(line.playerName));
    const position=profile?.position||inferredGamePlayerPosition(line.metrics);
    return{
      key:`${scope}:${line.playerId||normalizedPlayerName(line.playerName)}`,kind:"player",label:position,name:profile?.displayName||line.playerName,
      jersey:profile?.jersey??null,meta:scope==="game"?"GAME BOX":"SEASON TO DATE",stats:gamePlayerBoxStats(position,line.metrics),grade:null,
    };
  });
}

function GamePlayerStats({row,playerLayer}:{row:ScheduleRow;playerLayer:ReturnType<typeof usePlayerLayer>}){
  const completed=Boolean(row.completed);
  const [scope,setScope]=useState<"game"|"season">(completed?"game":"season");
  const gameStats=useGamePlayerStats(row);
  const identities=new Map((playerLayer.payload?.teams??[]).map((team)=>[team.team,team]));
  const teamsForGame=[{name:row.awayTeam,logo:row.awayLogo,...identities.get(row.awayTeam)},{name:row.homeTeam,logo:row.homeLogo,...identities.get(row.homeTeam)}];
  const payloadTeams=new Map((gameStats.payload?.teams??[]).map((team)=>[team.team,team]));
  const sourceReady=gameStats.payload?.status==="ready";
  return <section className="game-player-stats">
    <header><div><span>{scope==="game"?"OFFICIAL GAME BOX":`${row.season} THROUGH WEEK ${gameStats.payload?.throughWeek??row.week}`}</span><h2>Player Stats</h2></div><div className="game-player-scope" role="group" aria-label="Player statistics timeframe"><button type="button" className={scope==="game"?"active":""} disabled={!completed} onClick={()=>setScope("game")}>This game</button><button type="button" className={scope==="season"?"active":""} onClick={()=>setScope("season")}>Season to date</button></div></header>
    {gameStats.loading?<div className="game-stats-empty">Loading point-in-time player statistics…</div>:!sourceReady?<div className="game-stats-empty">{gameStats.payload?.message??"Point-in-time player statistics are unavailable for this game."}</div>:<div className="game-player-columns">{teamsForGame.map((team)=>{
      const model=playerLayer.profiles.get(team.name);
      const teamStats=payloadTeams.get(team.name);
      const lines=scope==="game"?(teamStats?.game??[]):(teamStats?.seasonToDate??[]);
      const players=gamePlayerBoxRows(lines,model,scope);
      const rosterCoverage=model?gamePlayerDisplayRows(model,team.name).length:0;
      return <section key={team.name}><header><TeamMark name={team.name} size="sm" logo={team.logo}/><div><strong>{team.name}</strong><small>{scope==="game"?"GAME CONTRIBUTORS":"SEASON-TO-DATE CONTRIBUTORS"} · {players.length}</small></div></header>{players.length?<div>{players.map((entry)=><article className="game-player-row" key={entry.key}><span><PlayerStatsJersey team={team.name} color={team.color} altColor={team.altColor} jersey={entry.jersey}/><span><strong>{entry.name}</strong><small><span className="game-player-role">{entry.label}</span> · {entry.meta}</small></span></span><span className="game-player-line">{entry.stats.map((stat)=><span key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></span>)}</span></article>)}</div>:<div className="game-player-empty">{scope==="game"&&!completed?"Game stats will appear after kickoff.":`No player box-score stats are available in this timeframe.${rosterCoverage?" The roster profile is loaded, but it is not substituted for point-in-time stats.":""}`}</div>}</section>;
    })}</div>}
  </section>;
}

function GameDetailView({row,loading,onBack}:{row:ScheduleRow;loading:boolean;onBack:()=>void}){
  const completed=Boolean(row.completed);
  const awayScore=gameDisplayScore(row,"away"),homeScore=gameDisplayScore(row,"home");
  const [activeView,setActiveView]=useState<"basic"|"advanced"|"players">("basic");
  const playerLayer=usePlayerLayer(row.season,[row.awayTeam,row.homeTeam]);
  const gameRank=(rank:number|null|undefined)=>rank&&rank<=25?<em className="game-detail-pregame-rank">H+ #{rank}</em>:null;
  return <section className="page-section game-detail-page">
    <header className="game-detail-header"><button type="button" onClick={onBack} aria-label="Back to schedule">‹</button><div><small>{row.season} · {scheduleGameLabel(row)}</small><h1>{row.awayTeam} at {row.homeTeam}</h1></div></header>
    <section className="game-detail-scoreboard">
      <div><b className="game-team-site-label">AWAY</b><TeamMark name={row.awayTeam} size="lg" logo={row.awayLogo} genericLabel={isFcsTeam(row.awayTeam,row.awayConference)?"FCS":undefined}/><strong>{row.awayTeam}</strong>{gameRank(row.awayPregameRank)}<small>{row.awayRecordAfter??row.awayConference??"FBS"}</small></div>
      <span><b>{awayScore??"—"}</b><em>{completed?"FINAL":"H+ PROJECTION"}</em><b>{homeScore??"—"}</b></span>
      <div><b className="game-team-site-label">{row.neutralSite?"DESIGNATED HOME":"HOME"}</b><TeamMark name={row.homeTeam} size="lg" logo={row.homeLogo} genericLabel={isFcsTeam(row.homeTeam,row.homeConference)?"FCS":undefined}/><strong>{row.homeTeam}</strong>{gameRank(row.homePregameRank)}<small>{row.homeRecordAfter??row.homeConference??"FBS"}</small></div>
    </section>
    <div className="game-detail-meta"><span><b>DATE</b>{fullGameDate(row.startDate)}</span><span><b>TIME</b>{gameTime(row.startDate)}</span><span><b>SITE</b>{row.neutralSite?"Neutral site":row.venue||row.homeTeam}</span><span><b>HOME TEAM</b>{row.homeTeam}{row.neutralSite?" · designation":""}</span></div>
    <section className="game-detail-market" aria-label="Market and model lines"><span><b>{completed?"CLOSING SPREAD":"MARKET SPREAD"}</b><strong>{marketSpreadLabel(row)}</strong></span><span><b>H+ MODEL SPREAD</b><strong>{modelSpreadLabel(row)}</strong></span><span><b>{completed?"CLOSING TOTAL":"MARKET TOTAL"}</b><strong>{marketTotalLabel(row)}</strong></span><span><b>H+ MODEL TOTAL</b><strong>{modelTotalLabel(row)}</strong></span><small>LINE SOURCE · {row.provider?.toUpperCase()||"NOT POSTED"}</small></section>
    <GameModelAudit row={row}/>
    {loading?<div className="game-detail-loading">Loading the complete game profile…</div>:<>
      {!completed?<section className="game-preview-line"><small>WHY {gameFavoriteName(row).toUpperCase()} IS FAVORED</small><p>{gamePreviewSentence(row)}</p><div><span><b>PROJECTED SCORE</b>{row.predictedAwayScore===null||row.predictedHomeScore===null?"—":`${gameTeamCode(row.awayTeam)} ${Math.round(row.predictedAwayScore)} · ${gameTeamCode(row.homeTeam)} ${Math.round(row.predictedHomeScore)}`}</span><span><b>WIN PROBABILITY</b>{row.homeWinProbability===null?"—":`${row.homeWinProbability>=.5?row.homeTeam:row.awayTeam} ${Math.round(Math.max(row.homeWinProbability,1-row.homeWinProbability)*100)}%`}</span><span><b>MODEL SPREAD</b>{signed(row.modelHomeSpread)}</span></div></section>:null}
      <nav className="game-detail-tabs" role="tablist" aria-label="Game statistics"><button type="button" role="tab" aria-selected={activeView==="basic"} onClick={()=>setActiveView("basic")}>Basic</button><button type="button" role="tab" aria-selected={activeView==="advanced"} onClick={()=>setActiveView("advanced")}>Advanced</button><button type="button" role="tab" aria-selected={activeView==="players"} onClick={()=>setActiveView("players")}>Players</button></nav>
      {activeView==="basic"?<GameStatComparison row={row}/>:activeView==="advanced"?<GameAdvancedComparison row={row}/>:<GamePlayerStats row={row} playerLayer={playerLayer}/>}
    </>}
  </section>;
}

type LinkedScheduleGame={season:number;row:ScheduleRow};
type ScoresRankingsView="scores"|"forecast";

function LinkedScheduleGameDetail({selection,onBack}:{selection:LinkedScheduleGame;onBack:()=>void}){
  const requestKey=`${selection.season}:${selection.row.gameId}`;
  const [detail,setDetail]=useState<{key:string;row:ScheduleRow|null}>({key:"",row:null});
  const generated=selection.row.gameId.startsWith("sim-");
  useEffect(()=>{
    if(generated)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"schedule",season:String(selection.season),week:"0",gameId:selection.row.gameId,includeAnalysis:"1",includeGameTimeRanks:"1"});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response))
      .then((payload)=>setDetail({key:requestKey,row:payload.rows?.[0]??selection.row}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setDetail({key:requestKey,row:selection.row});});
    return()=>controller.abort();
  },[generated,requestKey,selection]);
  const resolved=detail.key===requestKey?(detail.row??selection.row):selection.row;
  return <GameDetailView row={resolved} loading={!generated&&detail.key!==requestKey} onBack={onBack}/>;
}

function SchedulePage({season,setSeason,onSelectTeam,onExploreWinConditions}:{
  season:number;setSeason:(value:number)=>void;onSelectTeam?:(team:string)=>void;onExploreWinConditions:(row:ScheduleRow)=>void;
}) {
  const [activeView,setActiveView]=useState<ScoresRankingsView>("scores");
  const [week, setWeek] = useState(0);
  const [teamFilter, setTeamFilter] = useState("");
  const [conferenceFilter, setConferenceFilter] = useState("ALL");
  const [pickFilter, setPickFilter] = useState<SchedulePickFilter>("all");
  const [sortMode, setSortMode] = useState<ScheduleSortMode>("date");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [selectedGameId,setSelectedGameId]=useState<string|null>(null);
  const [detailByGame,setDetailByGame]=useState<Record<string,ScheduleRow>>({});
  const [detailLoading,setDetailLoading]=useState<string|null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const projectedRankingSnapshotWeek=scoreRankingSnapshotWeek(week,16);
  const projectedRanks=useProjectedFinalRanks(season,projectedRankingSnapshotWeek);
  const effectiveRankingSnapshotWeek=projectedRanks.data?.effectiveWeek??projectedRankingSnapshotWeek;
  const rankingDisplayWeek=week||rankingAppliesToWeek(effectiveRankingSnapshotWeek);
  const projectedFinalRankMap=useMemo(()=>new Map((projectedRanks.data?.rankings??[]).map((row)=>[row.team,row.rank])),[projectedRanks.data?.rankings]);
  const includeMarketDecisions = pickFilter === "ats" || pickFilter === "any";
  const requestKey = `${season}:${week}:${teamFilter}:${includeMarketDecisions ? "market-decisions" : "compact"}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "schedule", season: String(season), week: String(week), ledger: "filtered-records-v1", includeGameTimeRanks:"1" });
    if (teamFilter) params.set("team", teamFilter);
    if (includeMarketDecisions) params.set("includeMarketDecisions", "1");
    fetch(`/api/data?${params}`, { signal: controller.signal }).then((response) => readJsonBody<{ rows?: ScheduleRow[]; configured?: boolean }>(response)).then((payload) => { setRows(payload.rows || []); setConfigured(Boolean(payload.configured)); setLoadedKey(requestKey); }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setRows([]); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [season, week, teamFilter, includeMarketDecisions, requestKey]);
  const loading = loadedKey !== requestKey;
  const teamOptions = useMemo(() => [...new Set([...teams.map((team) => team.name), ...rows.flatMap((row) => [row.homeTeam, row.awayTeam])])].sort(), [rows]);
  const conferenceOptions = useMemo(() => [...new Set(rows.flatMap((row) => [row.homeConference,row.awayConference]).filter((value):value is string=>Boolean(value)))].sort(), [rows]);
  const summaryRows = useMemo(() => (loading ? [] : rows)
    .filter((row) => matchesConferenceFilter(row.homeConference,conferenceFilter) || matchesConferenceFilter(row.awayConference,conferenceFilter)), [conferenceFilter, loading, rows]);
  const activeRows = useMemo(() => summaryRows
    .filter((row) => matchesSchedulePickFilter(row, pickFilter))
    .sort((a,b) => compareScheduleRows(a,b,sortMode)), [pickFilter, sortMode, summaryRows]);
  const activeFilterCount=Number(Boolean(week))+Number(Boolean(teamFilter))+Number(conferenceFilter!=="ALL")+Number(pickFilter!=="all")+Number(sortMode!=="date");

  const openGameDetails=async(row:ScheduleRow)=>{
    setSelectedGameId(row.gameId);
    window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));
    if(detailByGame[row.gameId])return;
    setDetailLoading(row.gameId);
    const params=new URLSearchParams({view:"schedule",season:String(season),week:"0",gameId:row.gameId,includeAnalysis:"1",includeGameTimeRanks:"1"});
    try{
      const payload=await fetch(`/api/data?${params}`).then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response));
      const detail=payload.rows?.[0];
      if(detail)setDetailByGame((current)=>({...current,[row.gameId]:detail}));
    }finally{
      setDetailLoading((current)=>current===row.gameId?null:current);
    }
  };
  const selectedGame=selectedGameId?(detailByGame[selectedGameId]??rows.find((row)=>row.gameId===selectedGameId)):undefined;

  if(selectedGame)return <GameDetailView row={selectedGame} loading={detailLoading===selectedGameId} onBack={()=>{setSelectedGameId(null);window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));}}/>;

  const weeklyRankingRule=week
    ?`Week ${week} uses the Season Sim forecast built from data through ${effectiveRankingSnapshotWeek?`Week ${effectiveRankingSnapshotWeek}`:"the preseason"}. Week ${week} results first affect the Week ${week+1} forecast.`
    :`The all-games view uses the latest Season Sim ranking. Select a week to see the frozen projected-final ranking every team carried into that week.`;

  return <section className={`page-section schedule-page scores-rankings-page ${activeView}`}>
    <div className="section-kicker">SCORES + SEASON SIM FORECAST · PROJECTED FINAL ORDER</div>
    <div className="section-title-row">
      <div><h1>Score H+ Top 25</h1><p>{weeklyRankingRule}</p></div>
      <nav className="scores-rankings-tabs" role="tablist" aria-label="Scores and rankings">
        <button type="button" role="tab" aria-selected={activeView==="scores"} onClick={()=>setActiveView("scores")}>SCORES</button>
        <button type="button" role="tab" aria-selected={activeView==="forecast"} onClick={()=>setActiveView("forecast")}>H+ FORECAST TOP 25</button>
      </nav>
    </div>
    <div className="weekly-ranking-snapshot" role="note">
      <span>{week?`ENTERING WEEK ${rankingDisplayWeek}`:effectiveRankingSnapshotWeek?`LATEST SNAPSHOT · AFTER WEEK ${effectiveRankingSnapshotWeek}`:"PRESEASON SNAPSHOT"}</span>
      <strong>Actual results to the snapshot + projected remaining schedule</strong>
      <p>This is the same projected-final order produced by Season Sim. It weighs expected wins, the game-by-game projected record, schedule strength, current team strength, head-to-head evidence, and projected conference title games.</p>
    </div>
    {activeView==="forecast"?<>
      <div className="weekly-ranking-toolbar"><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} allWeeks idPrefix="weekly-rankings" /><span>{season} · {week?`RANKING ENTERING WEEK ${week}`:"LATEST / FINAL SNAPSHOT"}</span></div>
      <WeeklyProjectedRankingsTable rows={projectedRanks.data?.rankings??[]} season={season} loading={projectedRanks.loading} onSelectTeam={onSelectTeam}/>
      {projectedRanks.data?<p className="weekly-ranking-method">{projectedRanks.data.methodology}</p>:null}
    </>:<>
      <div className="schedule-mobile-filter-bar"><button className="schedule-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="schedule-filter-panel" onClick={()=>setFiltersOpen((open)=>!open)}><span><b>FILTERS</b><small>{season} · {week?`WEEK ${week}`:"FULL SEASON"}</small></span><strong>{activeFilterCount?`${activeFilterCount} ACTIVE`:"ALL GAMES"}</strong><i aria-hidden="true">{filtersOpen?"×":"+"}</i></button><span role="status" aria-live="polite">{loading?"Loading…":`${activeRows.length} games`}</span></div>
      <div id="schedule-filter-panel" className={`schedule-filter-panel ${filtersOpen?"open":""}`}>
        <div className="schedule-mobile-vintage"><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} allWeeks idPrefix="schedule-mobile" /></div>
        <div className="schedule-filter" aria-label="Schedule filters">
        <div className="schedule-filter-control schedule-filter-team">
          <label htmlFor="schedule-team">TEAM</label>
          <select id="schedule-team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="">All FBS games</option>{teamOptions.map((team) => <option key={team}>{team}</option>)}</select>
        </div>
        <div className="schedule-filter-control">
          <label htmlFor="schedule-conference">CONFERENCE</label>
          <select id="schedule-conference" value={conferenceFilter} onChange={(event)=>setConferenceFilter(event.target.value)}><option value="ALL">All conferences</option><option value={POWER_4_FILTER}>{POWER_4_LABEL}</option>{conferenceOptions.map((conference)=><option key={conference}>{conference}</option>)}</select>
        </div>
        <div className="schedule-filter-control">
          <label htmlFor="schedule-picks">PICKS</label>
          <select id="schedule-picks" value={pickFilter} onChange={(event)=>setPickFilter(event.target.value as SchedulePickFilter)}><option value="all">All games</option><option value="ats">ATS picks only</option><option value="total">O/U test picks only</option><option value="any">Any qualified pick</option></select>
        </div>
        <div className="schedule-filter-control">
          <label htmlFor="schedule-sort">SORT</label>
          <select id="schedule-sort" value={sortMode} onChange={(event)=>setSortMode(event.target.value as ScheduleSortMode)}><option value="date">Date played</option><option value="week">Week, then date</option><option value="conference">Conference, then date</option></select>
        </div>
        <span className="schedule-filter-status" role="status" aria-live="polite">{loading ? "Loading games…" : <><strong>{activeRows.length}</strong> games shown</>}</span>
        <button className="schedule-filter-done" type="button" onClick={()=>setFiltersOpen(false)}>SHOW {activeRows.length} GAMES</button>
        </div>
      </div>
      {!activeRows.length
        ? <div className="data-empty"><strong>{loading ? "Loading the schedule…" : rows.length ? "No games match these Schedule filters." : `No schedule data is loaded for ${season}${week ? ` week ${week}` : ""}.`}</strong><span>{rows.length ? "Try All games, another week, team, or conference." : configured ? "Try another season or week." : "The schedule will backfill from 2014 forward when the private data connection is activated."}</span></div>
        : <MobileScoreboard rows={activeRows} onOpen={(row)=>void openGameDetails(row)} onExplore={onExploreWinConditions} projectedFinalRanks={projectedFinalRankMap} rankingWeek={effectiveRankingSnapshotWeek}/>}
    </>}
  </section>;
}

function TeamIntelligencePanel({
  row,history,comparisons,comparisonsLoading,players,
}:{
  row:DynamicProfileRow;history:DynamicProfileRow[];comparisons:HistoricalComparisonRow[];comparisonsLoading:boolean;players?:TeamPlayerModel;
}) {
  const identity=useMemo(()=>deriveTeamIdentity(row),[row]);
  const stability=useMemo(()=>deriveTeamStability(row,history),[history,row]);
  const roster=useMemo(()=>deriveRosterStability(row,players),[players,row]);
  const previous=useMemo(()=>[...history].filter((candidate)=>candidate.week<row.week).sort((a,b)=>b.week-a.week)[0],[history,row.week]);
  const movement=useMemo(()=>deriveTeamMovement({...row,eloRating:undefined},previous?{...previous,eloRating:undefined}:null),[previous,row]);
  const movementScale=Math.max(1,...movement.components.map((component)=>Math.abs(component.change)));
  return <section className="team-intelligence-panel">
    <header><div><span>TEAM IDENTITY ENGINE</span><h3>What kind of team is this?</h3></div><small>Updates with every model week</small></header>
    <div className="team-identity-grid">
      {(["offense","defense","specialTeams"] as const).map((side)=>{
        const read=identity[side];
        return <article key={side}><span>{side==="specialTeams"?"SPECIAL TEAMS":side.toUpperCase()}</span><strong>{read.label}</strong><p>{read.detail}</p><small>{read.confidence} EVIDENCE</small></article>;
      })}
    </div>
    <div className="team-intelligence-score-grid">
      <article className="team-intelligence-score" style={{"--intelligence-score":`${stability.volatility}%`} as CSSProperties}><span>VOLATILITY</span><strong>{stability.volatility}</strong><b>{stability.volatilityLabel}</b><i/><small>{stability.drivers[0]}</small></article>
      <article className="team-intelligence-score" style={{"--intelligence-score":`${stability.consistency}%`} as CSSProperties}><span>CONSISTENCY</span><strong>{stability.consistency}</strong><b>{stability.consistencyLabel}</b><i/><small>{stability.drivers[1]}</small></article>
      <article className="team-intelligence-score" style={{"--intelligence-score":`${roster.score}%`} as CSSProperties}><span>ROSTER STABILITY</span><strong>{roster.score}</strong><b>{roster.label}</b><i/><small>{roster.drivers[0]}</small></article>
    </div>
    <div className="team-intelligence-lower">
      <article className="rating-movement-card">
        <header><span>MODEL CHANGE LOG</span><strong>{movement.change===null?"BASELINE":signed(movement.change)}</strong></header>
        <div className="rating-movement-readout"><p><small>PREVIOUS</small><b>{movement.previousRating===null?"—":movement.previousRating.toFixed(0)}</b></p><i>→</i><p><small>CURRENT</small><b>{movement.currentRating.toFixed(0)}</b></p></div>
        {movement.components.length?<div className="rating-component-list">{movement.components.map((component)=><p key={component.label}><span>{component.label}</span><i><b style={{width:`${Math.max(4,Math.abs(component.change)/movementScale*100)}%`}}/></i><strong>{signed(component.change)}</strong></p>)}</div>:null}
        <footer>{movement.explanations.slice(0,2).map((explanation)=><span key={explanation}>{explanation}</span>)}</footer>
      </article>
      <article className="historical-comparison-card">
        <header><span>HISTORICAL DNA</span><strong>Closest profiles · 2014–present</strong></header>
        {comparisons.length?<div>{comparisons.map((comparison)=><p key={`${comparison.season}-${comparison.team}`}><TeamMark name={comparison.team} size="sm" logo={comparison.logo}/><span><small>{comparison.season}</small><b>{comparison.team}</b><em>{comparison.sharedTrait}</em></span><strong>{comparison.similarity}%</strong></p>)}</div>:<div className="comparison-loading">{comparisonsLoading?"Historical comparison profiles are loading…":"No comparable archived profile is ready."}</div>}
      </article>
    </div>
  </section>;
}

function TeamLab({ season, week, setSeason, setWeek, requestedTeam, onSelectedTeamChange }: ModelVintageProps & {requestedTeam?:string;onSelectedTeamChange?:(team:string)=>void}) {
  const [selectedName, setSelectedName] = useState(requestedTeam??"Indiana");
  const [activeTab,setActiveTab]=useState<"schedule"|"stats"|"depth">("schedule");
  const [teamScheduleResult,setTeamScheduleResult]=useState<{key:string;rows:ScheduleRow[]}>({key:"",rows:[]});
  const [selectedTeamGameId,setSelectedTeamGameId]=useState<string|null>(null);
  const [teamGameDetail,setTeamGameDetail]=useState<Record<string,ScheduleRow>>({});
  const [teamGameLoading,setTeamGameLoading]=useState<string|null>(null);
  const dynamic = useDynamicProfiles(season, week);
  const availableTeams = dynamic.teams;
  const lookup = useMemo(() => new Map(availableTeams.map((team) => [team.name, team])), [availableTeams]);
  const activeSelectedName=requestedTeam??selectedName;
  const resolvedSelectedName = lookup.has(activeSelectedName) ? activeSelectedName : (lookup.has("Indiana") ? "Indiana" : availableTeams[0]?.name);
  const selected = resolvedSelectedName ? lookup.get(resolvedSelectedName) : undefined;
  const profile = selected ? latestProfile(selected, week) : null;
  const profileRows = useMemo(() => dynamic.rows.length ? dynamic.rows : availableTeams.map((team) => modelTeamProfileRow(team, season, week)).filter((row):row is DynamicProfileRow => Boolean(row)), [availableTeams, dynamic.rows, season, week]);
  const selectedRow = selected ? profileRows.find((row) => row.team === selected.name) : undefined;
  const history=useTeamHistory(season,week,resolvedSelectedName);
  const historicalComparisons=useHistoricalComparisons(season,week,resolvedSelectedName);
  const playerLayer=usePlayerLayer(season,resolvedSelectedName?[resolvedSelectedName]:[]);
  const selectedPlayers=resolvedSelectedName?playerLayer.profiles.get(resolvedSelectedName):undefined;
  const profileSnapshotRankings=useProjectedFinalRanks(season,week,resolvedSelectedName??"");
  const ranked=selected?profileSnapshotRankings.data?.rankings.find((entry)=>entry.team===selected.name):undefined;
  const projectedRecord=ranked?.projectedRecord??(profileSnapshotRankings.loading?"…":"—");
  const projectedRank=ranked&&ranked.rank<=25?`#${ranked.rank}`:"NR";
  const teamOptions = useMemo(() => [...availableTeams].sort((left,right)=>left.name.localeCompare(right.name)), [availableTeams]);
  const teamScheduleKey=`${season}:${resolvedSelectedName??""}`;
  const teamSchedule=teamScheduleResult.key===teamScheduleKey?teamScheduleResult.rows:[];
  const teamScheduleLoading=Boolean(resolvedSelectedName)&&teamScheduleResult.key!==teamScheduleKey;
  useEffect(()=>{
    if(!resolvedSelectedName)return;
    const controller=new AbortController();
    const params=new URLSearchParams({view:"schedule",season:String(season),week:"0",team:resolvedSelectedName,includeGameTimeRanks:"1"});
    fetch(`/api/data?${params}`,{signal:controller.signal})
      .then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response))
      .then((payload)=>setTeamScheduleResult({key:teamScheduleKey,rows:(payload.rows??[]).sort((left,right)=>compareScheduleRows(left,right,"date"))}))
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setTeamScheduleResult({key:teamScheduleKey,rows:[]});});
    return()=>controller.abort();
  },[resolvedSelectedName,season,teamScheduleKey]);
  const selectTeam = (teamName:string) => {
    setSelectedName(teamName);
    onSelectedTeamChange?.(teamName);
    setSelectedTeamGameId(null);
    if (window.innerWidth <= 760) window.requestAnimationFrame(() => document.getElementById("team-profile-card")?.scrollIntoView({ behavior:"smooth", block:"start" }));
  };

  const openTeamGame=async(row:ScheduleRow)=>{
    setSelectedTeamGameId(row.gameId);
    window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));
    if(teamGameDetail[row.gameId])return;
    setTeamGameLoading(row.gameId);
    const params=new URLSearchParams({view:"schedule",season:String(season),week:"0",gameId:row.gameId,includeAnalysis:"1",includeGameTimeRanks:"1"});
    try{
      const payload=await fetch(`/api/data?${params}`).then((response)=>readJsonBody<{rows?:ScheduleRow[]}>(response));
      const detail=payload.rows?.[0];
      if(detail)setTeamGameDetail((current)=>({...current,[row.gameId]:detail}));
    }finally{
      setTeamGameLoading((current)=>current===row.gameId?null:current);
    }
  };
  const selectedTeamGame=selectedTeamGameId?(teamGameDetail[selectedTeamGameId]??teamSchedule.find((row)=>row.gameId===selectedTeamGameId)):undefined;
  if(selectedTeamGame)return <GameDetailView row={selectedTeamGame} loading={teamGameLoading===selectedTeamGameId} onBack={()=>setSelectedTeamGameId(null)}/>;

  return <section className="page-section team-page">
    <div className="section-kicker">{availableTeams.length} TEAMS · {season} {week===0?"PRESEASON BASELINE":`WEEK ${week}`} · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>Team Pages</h1><p>One place for every team’s results, future projections, statistical profile, and depth chart.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} /></div>
    {!selected ? <div className="data-empty"><strong>No team profile is available for this model vintage.</strong><span>Choose a populated snapshot or activate historical sync.</span></div> : <div className="team-lab-grid">
      <div className="team-selector-bar"><label><span>TEAM</span><select value={selected.name} onChange={(event)=>selectTeam(event.target.value)} aria-label="Select team page">{teamOptions.map((team)=><option key={team.name} value={team.name}>{team.name} · {team.conference}</option>)}</select></label><small>{availableTeams.length} FBS TEAMS</small></div>
      <article id="team-profile-card" className="team-profile-card" style={{ "--team": selected.color } as CSSProperties}>
        <div className="team-profile-hero">
          <TeamMark name={selected.name} size="lg" logo={selected.logo} />
          <div className="team-profile-identity"><span>{selected.conference}</span><h2>{selected.name}</h2><p>{selected.mascot}</p></div>
          <div className="team-profile-summary">
            <div className="team-rank-callout"><small>H+ PROJECTED FINAL RK</small><strong>{profileSnapshotRankings.loading?"…":projectedRank}</strong></div>
            <div className="team-record-callout" aria-label={`${selected.name} projected season record ${projectedRecord}`}><small>PROJECTED RECORD</small><strong>{projectedRecord}</strong><span>FINALS + FUTURE PICKS</span></div>
          </div>
        </div>
        <nav className="team-page-tabs" aria-label={`${selected.name} page sections`}>
          <button type="button" className={activeTab==="schedule"?"active":""} onClick={()=>setActiveTab("schedule")}>Schedule</button>
          <button type="button" className={activeTab==="stats"?"active":""} onClick={()=>setActiveTab("stats")}>Team Stats</button>
          <button type="button" className={activeTab==="depth"?"active":""} onClick={()=>setActiveTab("depth")}>Depth Chart</button>
        </nav>
        <div className="team-page-panel" data-team-tab={activeTab}>
          {activeTab==="schedule"?<section className="team-page-schedule">
            <header><div><span>{season} SCHEDULE</span><strong>Results & projections</strong></div><small>{teamScheduleLoading?"LOADING…":`${teamSchedule.length} GAMES`}</small></header>
            {teamSchedule.length?<TeamScheduleList rows={teamSchedule} team={selected.name} onOpen={(row)=>void openTeamGame(row)}/>:<div className="empty-state">{teamScheduleLoading?"Loading this team’s schedule…":"No games are available for this season."}</div>}
          </section>:null}
          {activeTab==="stats"?(profile&&selectedRow?<><TeamIntelligencePanel row={selectedRow} history={history.rows} comparisons={historicalComparisons.rows} comparisonsLoading={historicalComparisons.loading} players={selectedPlayers}/><div className="profile-columns"><TeamMetricPanel title="OFFENSIVE PRODUCTION" subtitle="Raw output with opponent-adjusted percentage indices" row={selectedRow} rows={profileRows} side="offense" /><TeamMetricPanel title="DEFENSIVE OUTPUT ALLOWED" subtitle="Raw allowances with opponent-adjusted percentage indices" row={selectedRow} rows={profileRows} side="defense" /></div><div className="trend-panel"><div><strong>MODEL VINTAGE</strong><span>{week===0?`${season} preseason · four-season history + returning production + recruiting`:`${season} cumulative profile through week ${week}`}</span></div><div className="index-readout"><span>ADJ OFFENSE VS FBS AVG</span><strong>{(average(profile.o.slice(0, 3))*100).toFixed(0)}%</strong><span>ADJ OPP OUTPUT ALLOWED</span><strong>{(average(profile.d.slice(0, 3))*100).toFixed(0)}%</strong></div></div></>:<div className="empty-state">No completed profile exists at or before this week.</div>):null}
          {activeTab==="depth"?(selectedPlayers?<div className="team-page-depth"><StarterFormationBoard model={selectedPlayers} team={selected.name} logo={selected.logo} primaryColor={selected.color} secondaryColor={selected.altColor} profile={selectedRow}/><OffensiveLineUnitCard row={selectedRow} rows={profileRows} loading={dynamic.loading} productionRating={selectedPlayers.offensiveLineUnitRating}/><DepthRosterTable model={selectedPlayers}/></div>:<div className="empty-state">{playerLayer.loading?"Loading the sourced roster and depth chart…":"No depth chart is available for this team and season."}</div>):null}
        </div>
      </article>
    </div>}
  </section>;
}

function formatOffensiveLineMetric(metric:OffensiveLineUnitMetric) {
  if(metric.raw===null)return"—";
  return metric.format==="rate"?`${(metric.raw*100).toFixed(1)}%`:metric.raw.toFixed(2);
}

function OffensiveLineUnitCard({row,rows,loading,productionRating}:{row:DynamicProfileRow|undefined;rows:DynamicProfileRow[];loading:boolean;productionRating?:number|null}) {
  const profile=buildOffensiveLineUnitProfile(row?.advancedProfile);
  const peerProfiles=rows.map((peer)=>({team:peer.team,profile:buildOffensiveLineUnitProfile(peer.advancedProfile)}));
  const metricRank=(metric:OffensiveLineUnitMetric)=>metric.index===null?null:1+peerProfiles.filter((peer)=>{
    const value=peer.profile.metrics.find((candidate)=>candidate.key===metric.key)?.index;
    return value!==null&&value!==undefined&&value>metric.index!;
  }).length;
  if(loading)return <section className="ol-unit-card loading"><div><span>OL UNIT PROFILE</span><strong>Loading trench outcomes…</strong></div></section>;
  if(!row||!row.advancedProfile)return <section className="ol-unit-card empty"><div><span>OL UNIT PROFILE</span><strong>No advanced line sample is available for this season.</strong><small>The depth chart remains source-labeled; no individual blocking grade is inferred.</small></div></section>;
  return <section className="ol-unit-card">
    <header>
      <div><span>OL UNIT PROFILE</span><strong>Opponent-adjusted trench outcomes</strong><small>{profile.sampleGames||row.gamesPlayed} GAMES · TEAM UNIT DATA · NOT INDIVIDUAL GRADES</small></div>
      <div className="ol-unit-grade"><small>OL PROD RATING</small><b>{productionRating??"—"}</b><span>{productionRating===null||productionRating===undefined?"BASELINE PENDING":"2014–PRESENT"}</span></div>
    </header>
    <div className="ol-unit-metrics">{profile.metrics.map((metric)=>{
      const rank=metricRank(metric);
      const tone=metric.index===null?"unavailable":metric.index>=1.07?"positive":metric.index<=.93?"negative":"neutral";
      return <article className={tone} key={metric.key}>
        <span><StatLabel label={metric.label} explanation={metric.note}/></span>
        <strong>{formatOffensiveLineMetric(metric)}</strong>
        <small>{metric.index===null?"NO ADJUSTED SAMPLE":`${Math.round(metric.index*100)}% FBS · ${rank===null?"—":`#${rank}`}`}</small>
      </article>;
    })}</div>
    <p>Run blocking is measured directly through line yards, stuffs and short-yardage wins. Pass protection uses offensive havoc allowed and passing-down survival because CFBD does not publish player-level pressures or sacks allowed.</p>
  </section>;
}

type DepthStarterUnit = "offense" | "defense" | "specialists";

const depthStarterRoles: Record<"defense",readonly string[]> = {
  defense:["CB","S","FS","CB","NB","W","M","DE","DT","NT","DE"],
};

type DepthFormationSlot = {
  desktopColumn:string;
  desktopRow:number;
  mobileColumn:string;
  mobileRow:number;
};

const depthFormationSlots:Record<Exclude<DepthStarterUnit,"offense">,DepthFormationSlot[]> = {
  defense:[
    {desktopColumn:"1 / 3",desktopRow:1,mobileColumn:"1 / 3",mobileRow:1},
    {desktopColumn:"4 / 6",desktopRow:1,mobileColumn:"4 / 6",mobileRow:1},
    {desktopColumn:"9 / 11",desktopRow:1,mobileColumn:"9 / 11",mobileRow:1},
    {desktopColumn:"13 / 15",desktopRow:1,mobileColumn:"13 / 15",mobileRow:1},
    {desktopColumn:"11 / 13",desktopRow:2,mobileColumn:"11 / 13",mobileRow:2},
    {desktopColumn:"4 / 6",desktopRow:2,mobileColumn:"4 / 6",mobileRow:2},
    {desktopColumn:"7 / 9",desktopRow:2,mobileColumn:"7 / 9",mobileRow:2},
    {desktopColumn:"4 / 6",desktopRow:3,mobileColumn:"4 / 6",mobileRow:3},
    {desktopColumn:"6 / 8",desktopRow:3,mobileColumn:"6 / 8",mobileRow:3},
    {desktopColumn:"8 / 10",desktopRow:3,mobileColumn:"8 / 10",mobileRow:3},
    {desktopColumn:"10 / 12",desktopRow:3,mobileColumn:"10 / 12",mobileRow:3},
  ],
  specialists:[
    {desktopColumn:"3 / 5",desktopRow:2,mobileColumn:"3 / 5",mobileRow:2},
    {desktopColumn:"7 / 9",desktopRow:2,mobileColumn:"7 / 9",mobileRow:2},
    {desktopColumn:"11 / 13",desktopRow:2,mobileColumn:"11 / 13",mobileRow:2},
  ],
};

type DepthOffenseFormation = {
  id:"AIR RAID 10"|"SPREAD 11"|"MULTIPLE 11"|"POWER 21"|"HEAVY 12";
  detail:string;
  roles:readonly string[];
};

const depthOffenseRoleSlots:Record<string,DepthFormationSlot> = {
  X:{desktopColumn:"1 / 4",desktopRow:2,mobileColumn:"1 / 3",mobileRow:2},
  SLOT:{desktopColumn:"4 / 7",desktopRow:3,mobileColumn:"3 / 5",mobileRow:3},
  H:{desktopColumn:"4 / 7",desktopRow:3,mobileColumn:"3 / 5",mobileRow:3},
  W:{desktopColumn:"22 / 25",desktopRow:3,mobileColumn:"11 / 13",mobileRow:3},
  LT:{desktopColumn:"8 / 10",desktopRow:2,mobileColumn:"3 / 5",mobileRow:2},
  LG:{desktopColumn:"11 / 13",desktopRow:2,mobileColumn:"5 / 7",mobileRow:2},
  C:{desktopColumn:"14 / 16",desktopRow:2,mobileColumn:"7 / 9",mobileRow:2},
  RG:{desktopColumn:"17 / 19",desktopRow:2,mobileColumn:"9 / 11",mobileRow:2},
  RT:{desktopColumn:"20 / 22",desktopRow:2,mobileColumn:"11 / 13",mobileRow:2},
  Y:{desktopColumn:"23 / 26",desktopRow:2,mobileColumn:"13 / 15",mobileRow:2},
  V:{desktopColumn:"23 / 26",desktopRow:2,mobileColumn:"13 / 15",mobileRow:2},
  Z:{desktopColumn:"26 / 29",desktopRow:3,mobileColumn:"12 / 14",mobileRow:3},
  FB:{desktopColumn:"11 / 14",desktopRow:4,mobileColumn:"5 / 7",mobileRow:4},
  QB:{desktopColumn:"14 / 17",desktopRow:4,mobileColumn:"7 / 9",mobileRow:4},
  RB:{desktopColumn:"14 / 17",desktopRow:5,mobileColumn:"7 / 9",mobileRow:5},
};

function depthOffenseFormation(profile:DynamicProfileRow|undefined,model:TeamPlayerModel):DepthOffenseFormation {
  const attempts=(profile?.offPatt??0)+(profile?.offRatt??0);
  const passRate=attempts>0?(profile?.offPatt??0)/attempts:.5;
  if(passRate>=.59)return {
    id:"AIR RAID 10",
    detail:`${Math.round(passRate*100)}% pass tendency · four-wide spacing`,
    roles:["X","SLOT","LT","LG","C","RG","RT","V","W","QB","RB"],
  };
  if(passRate>=.51)return {
    id:"SPREAD 11",
    detail:`${Math.round(passRate*100)}% pass tendency · 11 personnel`,
    roles:["X","SLOT","LT","LG","C","RG","RT","Y","Z","QB","RB"],
  };
  if(passRate<=.43) {
    const hasPublishedFullback=model.players.some((player)=>player.position==="FB"&&player.projectedStarter);
    return hasPublishedFullback?{
      id:"POWER 21",
      detail:`${Math.round((1-passRate)*100)}% run tendency · sourced two-back structure`,
      roles:["X","LT","LG","C","RG","RT","Y","Z","FB","QB","RB"],
    }:{
      id:"HEAVY 12",
      detail:`${Math.round((1-passRate)*100)}% run tendency · two-tight-end structure`,
      roles:["X","LT","LG","C","RG","RT","Y","H","Z","QB","RB"],
    };
  }
  return {
    id:"MULTIPLE 11",
    detail:`${Math.round(passRate*100)}% pass tendency · balanced structure`,
    roles:["X","SLOT","LT","LG","C","RG","RT","Y","Z","QB","RB"],
  };
}

function playerDepthRating(player:PlayerProfile) {
  const rating=player.productionRating;
  return typeof rating==="number"&&Number.isFinite(rating)?Math.max(50,Math.min(99,Math.round(rating))):null;
}

function productionRatingTone(rating:number|null) {
  if(rating===null)return"unrated";
  if(rating>=95)return"elite";
  if(rating>=90)return"strong";
  if(rating>=80)return"solid";
  if(rating>=70)return"developing";
  return"liability";
}

function playerDepthRatingTone(player:PlayerProfile) {
  return productionRatingTone(playerDepthRating(player));
}

function playerProductionSourceLabel(player:PlayerProfile) {
  if(player.productionRatingSource==="OBSERVED")return"PROD";
  if(player.productionRatingSource==="PROJECTED")return"PROJ";
  if(player.productionRatingSource==="UNIT")return"OL UNIT";
  return"NO GRADE";
}

function playerProductionCardLabel(player:PlayerProfile,rating:number|null) {
  if(rating===null)return"—";
  if(player.productionRatingSource==="PROJECTED")return`${rating}P`;
  if(player.productionRatingSource==="UNIT")return`${rating}U`;
  return String(rating);
}

function recruitingStarTone(player:PlayerProfile) {
  const stars=Math.round(player.recruitingStars??0);
  if(stars===5)return"stars-five";
  if(stars===4)return"stars-four";
  if(stars===3)return"stars-three";
  return"stars-low";
}

function readableJerseyInk(color:string|undefined) {
  const normalized=(color??"").trim().replace("#","");
  const hex=normalized.length===3?normalized.split("").map((part)=>`${part}${part}`).join(""):normalized;
  if(!/^[0-9a-f]{6}$/i.test(hex))return"#ffffff";
  const red=parseInt(hex.slice(0,2),16);
  const green=parseInt(hex.slice(2,4),16);
  const blue=parseInt(hex.slice(4,6),16);
  return red*.299+green*.587+blue*.114>165?"#0b0d0c":"#ffffff";
}

function specialistFormationPlayers(model:TeamPlayerModel) {
  const roles=["K","P","LS"] as const;
  const pool=model.players
    .filter((player)=>player.side==="specialists")
    .sort((left,right)=>Number(right.projectedStarter)-Number(left.projectedStarter)||right.impactScore-left.impactScore);
  const used=new Set<string>();
  return roles.map((role):FormationPlayer|null=>{
    const player=pool.find((candidate)=>!used.has(candidate.id)&&candidate.position===role);
    if(!player)return null;
    used.add(player.id);
    return {
      id:player.id,
      role,
      jersey:player.jersey,
      lastName:player.lastName,
      position:player.position,
      confidence:player.starterConfidence,
      profile:player,
    };
  });
}

function StarterFormationBoard({
  model,
  team,
  logo,
  primaryColor,
  secondaryColor,
  profile,
}:{
  model:TeamPlayerModel;
  team:string;
  logo?:string;
  primaryColor?:string;
  secondaryColor?:string;
  profile?:DynamicProfileRow;
}) {
  const [unit,setUnit]=useState<DepthStarterUnit>("offense");
  const offenseFormation=depthOffenseFormation(profile,model);
  const players=unit==="specialists"
    ?specialistFormationPlayers(model)
    :unit==="offense"
      ?assignFormationPlayers(model,"offense",offenseFormation.roles)
      :assignFormationPlayers(model,"defense",depthStarterRoles.defense);
  const slots=unit==="offense"
    ?offenseFormation.roles.map((role)=>depthOffenseRoleSlots[role])
    :depthFormationSlots[unit];
  return <section
    className="depth-starter-board"
    style={{
      "--depth-team":primaryColor??"#f1efe5",
      "--depth-team-alt":secondaryColor??"#111411",
      "--depth-team-ink":readableJerseyInk(primaryColor),
    } as CSSProperties}
  >
    <header>
      <div><span>{model.starterMethod==="PUBLISHED"?"PUBLISHED DEPTH CHART":"SOURCE-AWARE PROJECTION"}</span><strong>{unit==="offense"?offenseFormation.id:unit==="defense"?"Starting defense":"Special teams"}</strong>{unit==="offense"?<small>{offenseFormation.detail}</small>:null}</div>
      <nav aria-label="Depth chart unit">
        {(["offense","defense","specialists"] as const).map((option)=><button key={option} className={unit===option?"active":""} onClick={()=>setUnit(option)}>{option==="specialists"?"SPECIAL TEAMS":option.toUpperCase()}</button>)}
      </nav>
    </header>
    <div className={`depth-formation-field ${unit}`}>
      {logo?<img className="depth-field-watermark" src={logo} alt="" aria-hidden="true"/>:<span className="depth-field-watermark fallback" aria-hidden="true">{team.slice(0,2).toUpperCase()}</span>}
      <div className="depth-field-hash depth-field-hash-one" aria-hidden="true"/>
      <div className="depth-field-hash depth-field-hash-two" aria-hidden="true"/>
      {unit!=="specialists"?<div className="depth-line-of-scrimmage" aria-hidden="true"><span>LINE OF SCRIMMAGE</span></div>:null}
      {players.map((assignment,index)=>{
        const slot=slots[index];
        const player=assignment?.profile;
        const rating=player?playerDepthRating(player):null;
        const positionLabel=player?.positionGroup==="OFFENSIVE LINE"&&player.positionSource!=="PUBLISHED"&&player.positionConfidence!=="HIGH"
          ?"OL"
          :assignment?.role??"—";
        return <article
          key={`${unit}-${assignment?.id??index}`}
          className={`depth-starter-card ${player?playerDepthRatingTone(player):"empty"}`}
          style={{
            "--depth-col":slot.desktopColumn,
            "--depth-row":slot.desktopRow,
            "--depth-mobile-col":slot.mobileColumn,
            "--depth-mobile-row":slot.mobileRow,
          } as CSSProperties}
          aria-label={player?`${assignment.role}, number ${player.jersey??"unlisted"}, ${player.displayName}, ${playerRecruitingLabel(player)}, ${rating===null?"no production grade":`${rating} production grade`}`:`Open ${unit} role`}
        >
          <b className="depth-position-tag">{positionLabel}</b>
          <div className="depth-starter-jersey" aria-hidden="true"><span>{player?.jersey??"—"}</span></div>
          <div className="depth-starter-identity">
            <strong>{player?.lastName??"OPEN"}</strong>
            {player?<span className={recruitingStarTone(player)} title={playerRatingSourceLabel(player)}>{playerRecruitingLabel(player)}</span>:<span className="stars-low">NR</span>}
            <small title={player?.productionRatingEvidence}>{player?playerProductionCardLabel(player,rating):"—"}</small>
          </div>
        </article>;
      })}
    </div>
    <footer><span>{team.toUpperCase()} · {model.starterMethod.replaceAll("-"," ")}</span><small>{model.depthSource?.kind==="OFFICIAL_TEAM_NOTES"?"Player order follows the published team depth chart.":unit==="offense"?`${offenseFormation.id} follows the team’s season run/pass tendency.`:"Tap a unit to change the formation."}</small></footer>
    <details className="depth-rating-method">
      <summary><span>HOW PRODUCTION RATINGS WORK</span><b>+</b></summary>
      <div>
        <p><strong>50–99 OVERALL</strong><span>One 2014–{activeModelSeason} same-position scale: 46% proven production load, 27% output versus opponent allowance and opposing-unit quality, and 27% proven efficiency, plus a nonlinear workhorse test for exceptional full-season loads. Ratings are scarcity-calibrated: 90+ is the top 4%, 95+ the top 1%, and 99 the top 0.1% of same-position seasons. QB grades require passing-volume proof.</span></p>
        <p><strong>P = PROJECTION</strong><span>No published production sample: the grade is the historical outcome of same-position players with a similar high-school or transfer evaluation.</span></p>
        <p><strong>U = OL UNIT</strong><span>All five linemen share one blocking and protection grade based on unit output versus the fronts faced. Individual blocking statistics are not published.</span></p>
        <p className="depth-star-key"><strong>RECRUITING STARS</strong><span><i className="stars-five">5★ GOLD</i><i className="stars-four">4★ SILVER</i><i className="stars-three">3★ BRONZE</i><i className="stars-low">OTHER RED</i></span></p>
      </div>
    </details>
  </section>;
}

type DepthRosterRow = {
  player:PlayerProfile;
  unit:"OFFENSE"|"DEFENSE"|"SPECIAL TEAMS"|"OTHER";
  group:string;
  position:string;
  depthNumber:number;
};

function depthRosterPosition(player:PlayerProfile) {
  if(player.position==="QB")return"QB";
  if(["RB","FB"].includes(player.position))return"RB / FB";
  if(player.position==="WR")return"WR";
  if(player.position==="TE")return"TE";
  if(player.positionGroup==="OFFENSIVE LINE")return"OL";
  if(["DE","EDGE","OLB"].includes(player.position))return"EDGE";
  if(["DL","DT","NT"].includes(player.position))return"DL";
  if(["LB","ILB","MLB","WLB","SLB"].includes(player.position))return"LB";
  if(player.position==="CB")return"CB";
  if(["S","FS","SS","DB","NB","STAR"].includes(player.position))return"S / NB";
  if(["K","P","LS"].includes(player.position))return player.position;
  return player.position||"ATH";
}

function buildDepthRosterRows(model:TeamPlayerModel) {
  const rows:DepthRosterRow[]=[];
  const seen=new Set<string>();
  const depthByRole=new Map<string,number>();
  for(const group of model.depthChart) {
    group.players.forEach((player)=>{
      const roleKey=`${group.key}:${player.depthRole??player.position}`;
      if(player.projectedStarter)depthByRole.set(roleKey,1);
      if(player.projectedStarter||seen.has(player.id))return;
      seen.add(player.id);
      const inferredDepth=(depthByRole.get(roleKey)??1)+1;
      depthByRole.set(roleKey,inferredDepth);
      rows.push({
        player,
        unit:group.side==="offense"?"OFFENSE":group.side==="defense"?"DEFENSE":group.side==="specialists"?"SPECIAL TEAMS":"OTHER",
        group:group.label,
        position:depthRosterPosition(player),
        depthNumber:player.publishedDepth??inferredDepth,
      });
    });
  }
  const unitOrder=new Map([["OFFENSE",0],["DEFENSE",1],["SPECIAL TEAMS",2],["OTHER",3]]);
  return rows.sort((left,right)=>
    (unitOrder.get(left.unit)??9)-(unitOrder.get(right.unit)??9)
    ||left.group.localeCompare(right.group)
    ||left.depthNumber-right.depthNumber
    ||right.player.impactScore-left.player.impactScore
  );
}

function depthRosterKeyStat(player:PlayerProfile) {
  if(player.positionGroup==="OFFENSIVE LINE")return `${player.positionConfidence} SLOT FIT`;
  const stat=playerHeadlineStats(player)[0];
  return stat?`${stat.label} ${stat.value}`:"NO PLAYER SAMPLE";
}

function DepthRosterTable({model}:{model:TeamPlayerModel}) {
  const [unit,setUnit]=useState<"ALL"|DepthRosterRow["unit"]>("ALL");
  const [position,setPosition]=useState("ALL");
  const rows=useMemo(()=>buildDepthRosterRows(model),[model]);
  const unitRows=unit==="ALL"?rows:rows.filter((row)=>row.unit===unit);
  const positions=useMemo(()=>["ALL",...new Set(unitRows.map((row)=>row.position))],[unitRows]);
  const activePosition=positions.includes(position)?position:"ALL";
  const visible=activePosition==="ALL"?unitRows:unitRows.filter((row)=>row.position===activePosition);
  return <section className="depth-roster-section">
    <header>
      <div><span>DEPTH ROSTER</span><strong>Second unit and reserves</strong><small>{visible.length} PLAYERS SHOWN</small></div>
      <nav className="depth-roster-unit-tabs" aria-label="Depth roster unit filter">
        {(["ALL","OFFENSE","DEFENSE","SPECIAL TEAMS"] as const).map((option)=><button key={option} className={unit===option?"active":""} onClick={()=>{setUnit(option);setPosition("ALL");}}>{option}</button>)}
      </nav>
    </header>
    <nav className="depth-roster-position-tabs" aria-label="Depth roster position filter">
      {positions.map((option)=><button key={option} className={activePosition===option?"active":""} onClick={()=>setPosition(option)}>{option}</button>)}
    </nav>
    {visible.length?<div className="depth-roster-table-shell"><table>
      <thead><tr><th>UNIT / POS</th><th>PLAYER</th><th>NO.</th><th>CLASS</th><th>PROD / STARS</th><th>DEPTH</th><th>PLAYER EVIDENCE</th></tr></thead>
      <tbody>{visible.map(({player,unit:rowUnit,group,depthNumber})=>{
        const rating=playerDepthRating(player);
        return <tr key={player.id}>
          <td data-label="UNIT / POS"><small>{rowUnit}</small><strong>{player.position}</strong></td>
          <td data-label="PLAYER"><strong>{player.displayName}</strong><small>{group}</small></td>
          <td data-label="NO."><b>{player.jersey??"—"}</b></td>
          <td data-label="CLASS"><span>{player.year===null?"—":`YR ${player.year}`}</span></td>
          <td data-label="PROD / STARS"><span className={`depth-table-grade ${playerDepthRatingTone(player)}`} title={player.productionRatingEvidence}>{rating===null?"—":rating} <em>{playerProductionSourceLabel(player)}</em> <small className={recruitingStarTone(player)} title={playerRatingSourceLabel(player)}>{playerRecruitingLabel(player)}</small></span></td>
          <td data-label="DEPTH"><span>#{depthNumber}</span></td>
          <td data-label="PLAYER EVIDENCE"><span>{depthRosterKeyStat(player)}</span></td>
        </tr>;
      })}</tbody>
    </table></div>:<div className="depth-roster-empty">No reserve players are available for this unit.</div>}
  </section>;
}

function playerRatingSourceCopy(source:PlayerRatingRow["source"]) {
  if(source==="OBSERVED")return"OBSERVED";
  if(source==="PROJECTED")return"PROJECTED";
  return"OL UNIT";
}

const PLAYER_RATING_COLUMN={label:"Overall Rating",description:"The 50–99 scarcity-calibrated same-position production grade."} as const;

function playerStatsJerseyStyle(row:{team:string;color?:string|null;altColor?:string|null}) {
  const fallbackTeam=teamMap.get(row.team);
  const primary=normalizeTeamColor(row.color,normalizeTeamColor(fallbackTeam?.color,"#343630"));
  const alternate=normalizeTeamColor(row.altColor,normalizeTeamColor(fallbackTeam?.altColor,chalkContrastFallback(primary)));
  const trim=chalkColorDistance(primary,alternate)>=42?alternate:chalkContrastFallback(primary);
  return {
    "--player-jersey":primary,
    "--player-jersey-trim":trim,
    "--player-jersey-ink":chalkInk(primary),
  } as CSSProperties;
}

function PlayerStatsJersey({team,color,altColor,jersey}:{team:string;color?:string|null;altColor?:string|null;jersey:number|null}) {
  return <div className="player-stats-jersey-card"><div className="player-stats-jersey" style={playerStatsJerseyStyle({team,color,altColor})} role="img" aria-label={jersey===null?`${team} jersey, number unavailable`:`${team} jersey number ${jersey}`}><span aria-hidden="true">{jersey??"—"}</span></div></div>;
}

function PlayerStatsPage() {
  const [season,setSeason]=useState(activeModelSeason);
  const [position,setPosition]=useState<PlayerStatsPosition>("QB");
  const [conference,setConference]=useState("");
  const [query,setQuery]=useState("");
  const [metricKey,setMetricKey]=useState<PlayerStatsMetricKey>(playerStatsDefaultSortKey("QB"));
  const [sortKey,setSortKey]=useState<PlayerStatsSortKey>(playerStatsDefaultSortKey("QB"));
  const [direction,setDirection]=useState<PlayerStatsDirection>(defaultPlayerStatsSortDirection(playerStatsDefaultSortKey("QB"),"QB"));
  const [page,setPage]=useState(1);
  const requestKey=`${season}:${position}:${metricKey}:${conference}:${query}:${sortKey}:${direction}:${page}`;
  const [result,setResult]=useState<{key:string;payload:PlayerStatsPayload|null;loading:boolean}>({key:"",payload:null,loading:true});

  useEffect(()=>{
    const controller=new AbortController();
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      setResult((current)=>({key:requestKey,payload:current.key===requestKey?current.payload:null,loading:true}));
      try{
        const params=new URLSearchParams({
          season:String(season),position,metric:metricKey,conference,query,sort:sortKey,direction,page:String(page),limit:"50",
        });
        const response=await fetch(`/api/player-stats?${params}`,{signal:controller.signal});
        const payload=await readJsonBody<PlayerStatsPayload>(response);
        if(controller.signal.aborted)return;
        setResult({key:requestKey,payload,loading:false});
        if(payload.status==="waiting"||payload.status==="building")retryTimer=setTimeout(load,Math.max(30_000,(payload.retryAfterSeconds??0)*1000));
      }catch(error){
        if(controller.signal.aborted)return;
        setResult({key:requestKey,loading:false,payload:{season,status:"error",rows:[],message:error instanceof Error?error.message:"Player stats are temporarily unavailable."}});
      }
    };
    load();
    return()=>{controller.abort();if(retryTimer)clearTimeout(retryTimer);};
  },[conference,direction,metricKey,page,position,query,requestKey,season,sortKey]);

  const payload=result.key===requestKey?result.payload:null;
  const rows=payload?.rows??[];
  const pagination=payload?.pagination;
  const columns=useMemo(()=>playerStatsColumns(position),[position]);
  const metricColumns=useMemo(()=>playerStatsMetricColumns(position),[position]);
  const selectedMetric=metricColumns.find((column)=>column.key===metricKey)??metricColumns[0];
  const visibleColumns=useMemo(()=>[columns[0],selectedMetric],[columns,selectedMetric]);
  const activeSort=visibleColumns.find((column)=>column.key===sortKey)??selectedMetric;
  const qualificationLabel=payload?.qualification?.label??playerStatsQualification(position,metricKey).label;
  const conferences=payload?.conferences??[];
  const availableSeasons=(payload?.availableSeasons?.length
    ?payload.availableSeasons
    :seasonOptions.filter((value)=>value<=activeModelSeason)).sort((left,right)=>right-left);
  const gridStyle={
    "--stats-grid":"minmax(314px,1fr) minmax(118px,.32fr)",
    "--stats-min-width":"474px",
  } as CSSProperties;
  const changePosition=(nextPosition:PlayerStatsPosition)=>{
    const nextMetric=playerStatsDefaultSortKey(nextPosition);
    setPosition(nextPosition);
    setMetricKey(nextMetric);
    setSortKey(nextMetric);
    setDirection(defaultPlayerStatsSortDirection(nextMetric,nextPosition));
    setPage(1);
  };
  const changeMetric=(nextMetric:PlayerStatsMetricKey)=>{
    setMetricKey(nextMetric);
    setSortKey(nextMetric);
    setDirection(defaultPlayerStatsSortDirection(nextMetric,position));
    setPage(1);
  };
  const changeSort=(nextSort:PlayerStatsSortKey)=>{
    if(nextSort===sortKey){setDirection((current)=>current==="asc"?"desc":"asc");setPage(1);return;}
    setSortKey(nextSort);
    setDirection(defaultPlayerStatsSortDirection(nextSort,position));
    setPage(1);
  };

  return <section className="page-section stats-page player-stats-page">
    <div className="section-kicker">PLAYER STAT DATABASE · POSITION-SPECIFIC PRODUCTION · 2014–{activeModelSeason}</div>
    <div className="section-title-row"><div><h1>Player Stats</h1><p>A compact leader table showing one selected position metric at a time, with workload qualifiers applied before ranking.</p></div></div>

    <div className="stats-summary player-stats-summary">
      <article><span>POSITION</span><strong>{position}</strong><small>{metricColumns.length} available statistics</small></article>
      <article><span>SELECTED STAT</span><strong>{selectedMetric.label}</strong><small>{activeSort.key===metricKey?`${direction==="desc"?"High":"Low"} to ${direction==="desc"?"low":"high"}`:`Table ordered by ${activeSort.label}`}</small></article>
      <article><span>QUALIFIED PLAYERS</span><strong>{payload?.status==="ready"?(pagination?.total??0).toLocaleString():result.loading?"…":"—"}</strong><small>{conferenceFilterDisplay(conference,"All FBS conferences")}</small></article>
      <article><span>MINIMUM SAMPLE</span><strong>{qualificationLabel}</strong><small>{payload?.qualification?`${payload.qualification.excluded.toLocaleString()} low-sample rows excluded`:"Applied before ranking"}</small></article>
    </div>

    <div className="data-toolbar stats-toolbar player-stats-toolbar">
      <div><strong>{position} · {selectedMetric.label}</strong><span>Only the selected statistic is shown. Qualified players are ordered by {activeSort.label} {direction==="asc"?"ascending":"descending"}; every visible header remains sortable.</span></div>
      <div className="stats-toolbar-controls">
        <label><span>YEAR</span><select value={season} onChange={(event)=>{setSeason(Number(event.target.value));setConference("");setPage(1);}} aria-label="Choose player stats season">{availableSeasons.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>POSITION</span><select value={position} onChange={(event)=>changePosition(event.target.value as PlayerStatsPosition)} aria-label="Choose player stats position">{PLAYER_STATS_POSITIONS.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <label className="player-stats-stat-control"><span>STAT</span><select value={metricKey} onChange={(event)=>changeMetric(event.target.value as PlayerStatsMetricKey)} aria-label="Choose player statistic">{metricColumns.map((column)=><option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
        <label><span>CONFERENCE</span><select value={conference} onChange={(event)=>{setConference(event.target.value);setPage(1);}} aria-label="Filter player stats by conference"><option value="">ALL CONFERENCES</option><option value={POWER_4_FILTER}>{POWER_4_LABEL.toUpperCase()}</option>{conferences.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>PLAYER / TEAM</span><input value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1);}} placeholder="Search player or team" aria-label="Search player stats" /></label>
      </div>
    </div>

    <details className="stat-glossary player-stats-definition"><summary>{selectedMetric.label} DEFINITION · QUALIFIER · RANKS</summary><div><article><strong>{selectedMetric.label}</strong><span>{selectedMetric.description}</span></article><article><strong>MINIMUM SAMPLE</strong><span>{qualificationLabel}. The qualification is applied before sorting and pagination; totals reflect qualified rows after the current filters.</span></article><article><strong>RANK BADGES</strong><span>The large number is the active table rank{conference?` within ${conferenceFilterDisplay(conference)}`:""}. NAT is the {season} national rank for {selectedMetric.label}. ERA is the overall production rank among all {position} player-seasons from 2014–{activeModelSeason}.</span></article></div></details>

    {payload?.status==="building"||payload?.status==="waiting"?<div className="player-stats-state"><span>PLAYER STAT ARCHIVE</span><strong>Building this season’s player profiles</strong><p>{payload.message??"This page will refresh automatically when the player archive is ready."}</p></div>:null}
    {payload?.status==="error"||payload?.status==="unavailable"?<div className="player-stats-state error"><span>PLAYER STATS</span><strong>Temporarily unavailable</strong><p>{payload.message}</p></div>:null}

    {payload?.status==="ready"?<div className="stats-table-shell player-stats-table-shell">
      <div className="stats-head player-stats-head" role="row" style={gridStyle}>{visibleColumns.map((column)=>{
        const active=column.key===sortKey;
        return <div className="stats-head-cell" role="columnheader" aria-sort={active?(direction==="asc"?"ascending":"descending"):"none"} key={column.key}><button type="button" className={active?"active":""} onClick={()=>changeSort(column.key)} aria-label={`Sort by ${column.label}${active?`, currently ${direction==="asc"?"ascending":"descending"}`:""}`}><span>{column.label}</span><i aria-hidden="true">{active?(direction==="asc"?"↑":"↓"):"↕"}</i></button><StatHelp label={column.label} explanation={column.description}/></div>;
      })}</div>
      {result.loading&&!rows.length?<div className="player-stats-loading">Loading {position} statistics…</div>:null}
      {rows.map((row)=><div className="stats-row player-stats-row" style={gridStyle} key={`${row.season}-${row.team}-${row.id}`}>
        <div className="player-stats-player"><div className="player-stats-ranks" role="group" aria-label={`${conference?conferenceFilterDisplay(conference):"National"} table rank ${row.rank}; ${season} national ${selectedMetric.label} rank ${row.nationalRank}; 2014 to ${activeModelSeason} all-era ${position} production rank ${row.allEraRank??"unavailable"}`}><b>{row.rank}</b><span aria-hidden="true"><small>NAT <b>{row.nationalRank}</b></small><small>ERA <b>{row.allEraRank??"—"}</b></small></span></div><PlayerStatsJersey team={row.team} color={row.color} altColor={row.altColor} jersey={row.jersey}/><span><strong>{row.name}</strong><small>{row.team} · {row.conference||"FBS"}</small></span></div>
        <span className={`stats-value player-stats-value ${metricKey===sortKey?"active-value":""} ${playerStatsValueTone(row,metricKey)}`}>{formatPlayerStatsValue(row,selectedMetric)}</span>
      </div>)}
      {!rows.length&&!result.loading?<div className="player-stats-loading">No qualified {position} players match these filters for {selectedMetric.label}.</div>:null}
    </div>:null}

    {pagination&&pagination.pageCount>1?<footer className="player-ratings-pagination player-stats-pagination"><button type="button" disabled={pagination.page<=1} onClick={()=>setPage((value)=>Math.max(1,value-1))}>← PREVIOUS</button><span>PAGE <strong>{pagination.page}</strong> OF {pagination.pageCount}</span><button type="button" disabled={pagination.page>=pagination.pageCount} onClick={()=>setPage((value)=>Math.min(pagination.pageCount,value+1))}>NEXT →</button></footer>:null}
    <p className="all137-disclaimer">Each position exposes its own stat menu, but the table displays only the selected metric. Minimum samples remove one-play and low-volume outliers before rankings are calculated. Box-score totals remain source values; advanced columns appear only when the historical feed supplies that evidence. Offensive line is represented by one five-man team unit because individual blocking statistics are not available in the source archive.</p>
  </section>;
}

type ScatterMetricFormat="integer"|"number1"|"number2"|"number3"|"rate"|"percent100"|"signed1"|"index"|"relative"|"quality";
type ScatterMetricOption={key:string;label:string;description:string;format:ScatterMetricFormat;advancedKey?:AdvancedMetricKey;pffIndex?:number};
type ScatterPlotPoint={
  id:string;label:string;secondary:string;team:string;conference:string;season?:number;logo?:string;color?:string;altColor?:string;jersey:number|null;x:number;y:number;
};
type TeamScatterSide="offense"|"defense";
type TeamScatterScale="raw"|"index";
type TeamScatterFamily="basic"|"advanced";

const TEAM_SCATTER_BASIC_METRICS=[
  {key:"ypp",label:"YARDS / PLAY",description:"Average yards gained or allowed per offensive snap.",format:"number2"},
  {key:"ypa",label:"YARDS / PASS",description:"Average passing yards gained or allowed per attempt.",format:"number2"},
  {key:"ypc",label:"YARDS / RUSH",description:"Average rushing yards gained or allowed per carry.",format:"number2"},
  {key:"patt",label:"PASS ATT / GAME",description:"Average passing attempts per game.",format:"number1"},
  {key:"ratt",label:"RUSH ATT / GAME",description:"Average rushing attempts per game.",format:"number1"},
] as const;

const OL_SCATTER_ADVANCED_METRICS:ScatterMetricOption[]=[
  {key:"ol:lineYards",label:"LINE YARDS / RUSH",description:"Team line yards credited to blocking at the point of attack.",format:"number2",advancedKey:"lineYards"},
  {key:"ol:secondLevelYards",label:"SECOND-LEVEL YARDS",description:"Rushing yards reaching the linebacker level after the line is cleared.",format:"number2",advancedKey:"secondLevelYards"},
  {key:"ol:openFieldYards",label:"OPEN-FIELD YARDS",description:"Rushing yards created after the run reaches the secondary.",format:"number2",advancedKey:"openFieldYards"},
  {key:"ol:stuffRate",label:"STUFF RATE",description:"Share of team runs stopped at or behind the line; lower is better.",format:"rate",advancedKey:"stuffRate"},
  {key:"ol:powerSuccess",label:"POWER SUCCESS",description:"Team short-yardage rushing conversion rate behind the unit.",format:"rate",advancedKey:"powerSuccess"},
  {key:"ol:rushingSuccessRate",label:"RUN SUCCESS",description:"Share of team runs that stayed on schedule for down and distance.",format:"rate",advancedKey:"rushingSuccessRate"},
  {key:"ol:passingSuccessRate",label:"PASS SUCCESS",description:"Team passing success behind the unit; a protection-environment measure, not an individual blocker stat.",format:"rate",advancedKey:"passingSuccessRate"},
  {key:"ol:passingDownSuccessRate",label:"PASSING-DOWN SUCCESS",description:"Team success on known passing downs; a pass-protection environment proxy.",format:"rate",advancedKey:"passingDownSuccessRate"},
];

function teamScatterBasicValue(row:DynamicProfileRow,metric:string,side:TeamScatterSide,scale:TeamScatterScale) {
  const suffix=metric==="ypp"?"Ypp":metric==="ypa"?"Ypa":metric==="ypc"?"Ypc":metric==="patt"?"Patt":"Ratt";
  const key=`${side==="offense"?"off":"def"}${suffix}${scale==="index"?"Index":""}` as keyof DynamicProfileRow;
  const value=row[key];
  return typeof value==="number"&&Number.isFinite(value)?value:null;
}

function teamScatterAdvancedValue(row:DynamicProfileRow,metric:AdvancedMetricKey,side:TeamScatterSide,scale:TeamScatterScale) {
  const value=row.advancedProfile?.[side]?.[scale]?.[metric];
  return value!==null&&value!==undefined&&Number.isFinite(value)?value:null;
}

function formatScatterValue(value:number,format:ScatterMetricFormat,tick=false) {
  if(format==="rate")return`${(value*100).toFixed(tick?0:1)}%`;
  if(format==="percent100")return`${value.toFixed(tick?0:1)}%`;
  if(format==="index")return`${(value*100).toFixed(tick?0:1)}%`;
  if(format==="relative"){
    const relative=(value-.5)*50;
    return`${relative>0?"+":""}${relative.toFixed(tick?0:1)}%`;
  }
  if(format==="quality")return`${Math.round(value*100)}`;
  if(format==="integer")return Math.round(value).toLocaleString("en-US");
  if(format==="number3")return value.toFixed(tick?2:3);
  if(format==="number2")return value.toFixed(tick?1:2);
  if(format==="signed1")return`${value>0?"+":""}${value.toFixed(1)}`;
  return value.toFixed(1);
}

function playerScatterMetrics(position:PlayerStatsPosition):ScatterMetricOption[] {
  const seasonMetrics=playerStatsMetricColumns(position).map((column)=>({
    key:column.key,label:column.label,description:column.description,format:column.format as ScatterMetricFormat,
  }));
  return position==="OL"?[...seasonMetrics,...OL_SCATTER_ADVANCED_METRICS]:seasonMetrics;
}

function playerWeeklyMetrics(position:PlayerStatsPosition){
  return playerScatterMetrics(position).filter((metric)=>!metric.key.startsWith("ol:")&&playerWeeklySupportedMetric(metric.key as PlayerStatsMetricKey));
}

function compactSelectedYears(years:number[]){
  const labels=[...years].sort((left,right)=>left-right).map((value)=>String(value).slice(-2));
  return labels.length<=6?labels.join(", "):`${labels.slice(0,6).join(", ")}…`;
}

const PLAYER_SCATTER_ARCHIVE_SEASONS=seasonOptions.filter((value)=>value<=activeModelSeason);

const scatterPlayerPayloadCache=new Map<string,{loadedAt:number;payload:ScatterPlayerPayload}>();
const scatterPlayerPayloadRequests=new Map<string,Promise<ScatterPlayerPayload>>();
const playerWeeklyPayloadCache=new Map<string,{loadedAt:number;payload:PlayerWeeklyPayload}>();
const playerWeeklyPayloadRequests=new Map<string,Promise<PlayerWeeklyPayload>>();
const pffPayloadCache=new Map<string,PffTablePayload>();
const pffPayloadRequests=new Map<string,Promise<PffTablePayload>>();

function loadPffTable(slug:string) {
  const cached=pffPayloadCache.get(slug);
  if(cached)return Promise.resolve(cached);
  const pending=pffPayloadRequests.get(slug);
  if(pending)return pending;
  const request=fetch(`/pff/raw/${slug}.json`)
    .then((response)=>readJsonBody<PffTablePayload>(response))
    .then((payload)=>{pffPayloadCache.set(slug,payload);return payload;})
    .finally(()=>pffPayloadRequests.delete(slug));
  pffPayloadRequests.set(slug,request);
  return request;
}

function usePffTable(slug:string,enabled:boolean) {
  const requestKey=enabled?slug:"disabled";
  const [result,setResult]=useState<{key:string;payload:PffTablePayload|null;loading:boolean;error:string}>({key:"",payload:null,loading:false,error:""});
  useEffect(()=>{
    if(!enabled)return;
    let cancelled=false;
    loadPffTable(slug)
      .then((payload)=>{if(!cancelled)setResult({key:requestKey,payload,loading:false,error:""});})
      .catch(()=>{if(!cancelled)setResult({key:requestKey,payload:null,loading:false,error:"The selected PFF table could not be loaded."});});
    return()=>{cancelled=true;};
  },[enabled,requestKey,slug]);
  return result.key===requestKey?result:{key:requestKey,payload:null,loading:enabled,error:""};
}

function loadScatterPlayerSeason(season:number,position:PlayerStatsPosition) {
  const key=`${season}:${position}`;
  const cached=scatterPlayerPayloadCache.get(key);
  if(cached&&Date.now()-cached.loadedAt<30*60*1000)return Promise.resolve(cached.payload);
  const pending=scatterPlayerPayloadRequests.get(key);
  if(pending)return pending;
  const params=new URLSearchParams({season:String(season),position,scatter:"1",profile:"qualified-v3"});
  const request=fetch(`/api/player-stats?${params}`)
    .then((response)=>readJsonBody<ScatterPlayerPayload>(response))
    .then((payload)=>{scatterPlayerPayloadCache.set(key,{loadedAt:Date.now(),payload});return payload;})
    .finally(()=>scatterPlayerPayloadRequests.delete(key));
  scatterPlayerPayloadRequests.set(key,request);
  return request;
}

function mergeScatterPlayerPayloads(seasons:number[],payloads:ScatterPlayerPayload[]):ScatterPlayerPayload {
  const rows=[...new Map(payloads.flatMap((payload)=>payload.rows??[]).map((row)=>[`${row.season}:${row.team}:${row.id}`,row])).values()];
  const teams=[...new Map(payloads.flatMap((payload)=>payload.teams??[]).map((row)=>[`${row.team}:${row.conference||"FBS"}`,row])).values()];
  const conferences=[...new Set(payloads.flatMap((payload)=>payload.conferences??[]))].sort();
  const availableSeasons=[...new Set(payloads.flatMap((payload)=>payload.availableSeasons??[]))].sort((left,right)=>left-right);
  const status=payloads.some((payload)=>payload.status==="ready")
    ?"ready"
    :payloads.find((payload)=>payload.status==="building"||payload.status==="waiting")?.status??payloads[0]?.status??"error";
  return{season:seasons.at(-1)??2025,status,message:payloads.find((payload)=>payload.message)?.message,availableSeasons,teams,conferences,rows};
}

function useScatterPlayerStats(seasons:number[],position:PlayerStatsPosition,enabled:boolean) {
  const seasonKey=[...seasons].sort((left,right)=>left-right).join(",");
  const requestedSeasons=useMemo(()=>seasonKey.split(",").map(Number).filter(Number.isFinite),[seasonKey]);
  const requestKey=enabled?`${seasonKey}:${position}`:"disabled";
  const [result,setResult]=useState<{key:string;payload:ScatterPlayerPayload|null;loading:boolean}>({key:"",payload:null,loading:false});
  useEffect(()=>{
    if(!enabled||!requestedSeasons.length)return;
    let cancelled=false;
    const completed:ScatterPlayerPayload[]=[];
    let cursor=0;
    const publish=(loading:boolean)=>{
      if(cancelled)return;
      setResult({key:requestKey,payload:mergeScatterPlayerPayloads(requestedSeasons,completed),loading});
    };
    const worker=async()=>{
      while(!cancelled){
        const requestedSeason=requestedSeasons[cursor++];
        if(requestedSeason===undefined)return;
        const payload=await loadScatterPlayerSeason(requestedSeason,position)
          .catch(()=>({season:requestedSeason,status:"error",rows:[],message:`${requestedSeason} player statistics are unavailable.`} as ScatterPlayerPayload));
        if(cancelled)return;
        completed.push(payload);
        publish(completed.length<requestedSeasons.length);
      }
    };
    Promise.all(Array.from({length:Math.min(2,requestedSeasons.length)},()=>worker()))
      .then(()=>publish(false));
    return()=>{cancelled=true;};
  },[enabled,position,requestKey,requestedSeasons]);
  return result.key===requestKey?{payload:result.payload,loading:result.loading}:{payload:null,loading:enabled};
}

function loadPlayerWeeklyTimeline(season:number,team:string,playerId:string,playerName:string){
  const key=`${season}:${team}:${playerId||playerName}`;
  const cached=playerWeeklyPayloadCache.get(key);
  if(cached&&Date.now()-cached.loadedAt<30*60*1000)return Promise.resolve(cached.payload);
  const pending=playerWeeklyPayloadRequests.get(key);
  if(pending)return pending;
  const params=new URLSearchParams({season:String(season),team,playerId,playerName,profile:"chronological-opponent-logos-v2"});
  const request=fetch(`/api/player-weekly?${params}`)
    .then((response)=>readJsonBody<PlayerWeeklyPayload>(response))
    .then((payload)=>{if(payload.status==="ready")playerWeeklyPayloadCache.set(key,{loadedAt:Date.now(),payload});return payload;})
    .finally(()=>playerWeeklyPayloadRequests.delete(key));
  playerWeeklyPayloadRequests.set(key,request);
  return request;
}

function usePlayerWeeklyTimeline(season:number,team:string,playerId:string,playerName:string,enabled:boolean){
  const requestKey=enabled?`${season}:${team}:${playerId||playerName}`:"disabled";
  const [result,setResult]=useState<{key:string;payload:PlayerWeeklyPayload|null;loading:boolean}>({key:"",payload:null,loading:false});
  useEffect(()=>{
    if(!enabled)return;
    let cancelled=false;
    loadPlayerWeeklyTimeline(season,team,playerId,playerName)
      .then((payload)=>{if(!cancelled)setResult({key:requestKey,payload,loading:false});})
      .catch((error)=>{if(!cancelled)setResult({key:requestKey,payload:{status:"error",games:[],message:error instanceof Error?error.message:"Weekly player data is unavailable."},loading:false});});
    return()=>{cancelled=true;};
  },[enabled,playerId,playerName,requestKey,season,team]);
  return result.key===requestKey?{payload:result.payload,loading:result.loading}:{payload:null,loading:enabled};
}

function ScatterMultiSelect({label,summary,options,selected,onToggle,onAll,ariaLabel}:{
  label:string;summary:string;options:Array<{value:string;label:string}>;selected:string[];onToggle:(value:string)=>void;onAll:()=>void;ariaLabel:string;
}) {
  const [open,setOpen]=useState(false);
  const selectedSet=new Set(selected);
  return <details className="scatter-multi-select" open={open} onToggle={(event)=>setOpen(event.currentTarget.open)}>
    <summary aria-label={ariaLabel}><span>{label}</span><strong>{summary}</strong><i aria-hidden="true">⌄</i></summary>
    <div className="scatter-multi-menu">
      <button type="button" onClick={onAll}>{label==="YEAR"?"SELECT ALL YEARS":"SHOW ALL TEAMS"}</button>
      <div>{options.map((option)=><label key={option.value}><input type="checkbox" checked={selectedSet.has(option.value)} onChange={()=>onToggle(option.value)}/><span>{option.label}</span></label>)}</div>
    </div>
  </details>;
}

const scatterPhoneQuery="(max-width:700px)";
function subscribeScatterPhone(change:()=>void) {
  if(typeof window==="undefined")return()=>undefined;
  const media=window.matchMedia(scatterPhoneQuery);
  media.addEventListener("change",change);
  return()=>media.removeEventListener("change",change);
}
function scatterPhoneSnapshot() {
  return typeof window!=="undefined"&&window.matchMedia(scatterPhoneQuery).matches;
}
function useScatterPhoneLayout() {
  return useSyncExternalStore(subscribeScatterPhone,scatterPhoneSnapshot,()=>false);
}

function ScatterPlot({points,xMetric,yMetric,title,subtitle,mode,loading}:{
  points:ScatterPlotPoint[];xMetric:ScatterMetricOption;yMetric:ScatterMetricOption;title:string;subtitle:string;mode:"team"|"player";loading:boolean;
}) {
  const phone=useScatterPhoneLayout();
  const {width,height,left,right,top,bottom}=phone
    ?{width:390,height:570,left:48,right:12,top:74,bottom:66}
    :{width:1100,height:720,left:105,right:42,top:96,bottom:88};
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const xDomain=scatterDomain(points.map((point)=>point.x));
  const yDomain=scatterDomain(points.map((point)=>point.y));
  const xTicks=scatterTicks(xDomain,phone?5:6),yTicks=scatterTicks(yDomain,phone?5:6);
  const averageX=scatterMean(points.map((point)=>point.x)),averageY=scatterMean(points.map((point)=>point.y));
  const regression=scatterRegression(points);
  const xAt=(value:number)=>left+scatterPosition(value,xDomain)*plotWidth;
  const yAt=(value:number)=>top+(1-scatterPosition(value,yDomain))*plotHeight;
  const trendStart=regression?regression.intercept+regression.slope*xDomain.min:null;
  const trendEnd=regression?regression.intercept+regression.slope*xDomain.max:null;
  const displayTitle=phone?`${yMetric.label} vs ${xMetric.label}`:title;
  return <section className="scatter-chart" aria-label={`${title} scatterplot`}>
    <div className="scatter-chart-scroll">
      <div className={`scatter-stage ${phone?"phone-layout":"desktop-layout"}`} style={{aspectRatio:`${width} / ${height}`}}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="scatter-title scatter-subtitle">
          <title id="scatter-title">{title}</title><desc id="scatter-subtitle">{subtitle}. {points.length} data points.</desc>
          <text className={`scatter-title ${phone?"mobile":""}`} x={width/2} y={phone?27:34} textAnchor="middle">{displayTitle}</text>
          <text className="scatter-subtitle" x={width/2} y={phone?48:57} textAnchor="middle">{subtitle}</text>
          {xTicks.map((tick,index)=><g key={`x-${index}`}><line className="scatter-grid-line" x1={xAt(tick)} x2={xAt(tick)} y1={top} y2={top+plotHeight}/><text className="scatter-tick" x={xAt(tick)} y={top+plotHeight+27} textAnchor="middle">{formatScatterValue(tick,xMetric.format,true)}</text></g>)}
          {yTicks.map((tick,index)=><g key={`y-${index}`}><line className="scatter-grid-line" x1={left} x2={left+plotWidth} y1={yAt(tick)} y2={yAt(tick)}/><text className="scatter-tick" x={left-17} y={yAt(tick)+5} textAnchor="end">{formatScatterValue(tick,yMetric.format,true)}</text></g>)}
          <line className="scatter-axis" x1={left} x2={left+plotWidth} y1={top+plotHeight} y2={top+plotHeight}/>
          <line className="scatter-axis" x1={left} x2={left} y1={top} y2={top+plotHeight}/>
          {averageX!==null?<><line className="scatter-average-line" x1={xAt(averageX)} x2={xAt(averageX)} y1={top} y2={top+plotHeight}/><text className="scatter-average-label" x={xAt(averageX)+7} y={top+16}>AVG {formatScatterValue(averageX,xMetric.format)}</text></>:null}
          {averageY!==null?<><line className="scatter-average-line" x1={left} x2={left+plotWidth} y1={yAt(averageY)} y2={yAt(averageY)}/><text className="scatter-average-label" x={left+plotWidth-7} y={yAt(averageY)-8} textAnchor="end">AVG {formatScatterValue(averageY,yMetric.format)}</text></>:null}
          {trendStart!==null&&trendEnd!==null?<line className="scatter-trend-line" x1={left} y1={yAt(trendStart)} x2={left+plotWidth} y2={yAt(trendEnd)}/>:null}
          <text className="scatter-axis-label" x={left+plotWidth/2} y={height-(phone?16:22)} textAnchor="middle">{xMetric.label}</text>
          <text className="scatter-axis-label" x={phone?14:25} y={top+plotHeight/2} textAnchor="middle" transform={`rotate(-90 ${phone?14:25} ${top+plotHeight/2})`}>{yMetric.label}</text>
        </svg>
        <span className="scatter-chart-brand" aria-hidden="true"><img src="/harper-football.svg" alt=""/><span><strong>HARPER+</strong><small>CFB MODEL</small></span></span>
        <div className="scatter-markers" aria-label={`${points.length} plotted ${mode==="team"?"teams":"players"}`}>
          {points.map((point)=>{
            const x=(xAt(point.x)/width)*100,y=(yAt(point.y)/height)*100;
            const detail=`${point.label}; ${xMetric.label} ${formatScatterValue(point.x,xMetric.format)}; ${yMetric.label} ${formatScatterValue(point.y,yMetric.format)}`;
            const plottedTeamLogo=resolveTeamLogoAsset(point.team)??point.logo;
            return <button type="button" className={`scatter-marker ${mode}-marker`} style={{left:`${x}%`,top:`${y}%`}} aria-label={detail} key={point.id}>
              {mode==="team"?(plottedTeamLogo?<img src={plottedTeamLogo} alt=""/>:<span className="scatter-team-fallback" aria-hidden="true">{point.team.slice(0,2).toUpperCase()}</span>):<PlayerStatsJersey team={point.team} color={point.color} altColor={point.altColor} jersey={point.jersey}/>}
              {point.season&&points.length<=30?<small className="scatter-season-tag" aria-hidden="true">{point.season}</small>:null}
              <span className="scatter-marker-tooltip" aria-hidden="true"><strong>{point.label}</strong><small>{point.secondary}</small><span><b>{xMetric.label}</b>{formatScatterValue(point.x,xMetric.format)}</span><span><b>{yMetric.label}</b>{formatScatterValue(point.y,yMetric.format)}</span></span>
            </button>;
          })}
        </div>
        {!points.length?<div className="scatter-empty" style={{inset:`${(top/height)*100}% ${(right/width)*100}% ${(bottom/height)*100}% ${(left/width)*100}%`}}><strong>{loading?"Loading plot…":"No qualified data"}</strong><span>{loading?"The chart will populate automatically.":"Try a broader team or conference filter, or choose another statistic."}</span></div>:null}
      </div>
    </div>
  </section>;
}

function PlayerWeeklyTrend({games,metric,playerName,team,season,loading,message}:{
  games:PlayerWeeklyGame[];metric:ScatterMetricOption;playerName:string;team:string;season:number;loading:boolean;message?:string;
}){
  const phone=useScatterPhoneLayout();
  const {width,height,left,right,top,bottom}=phone
    ?{width:390,height:570,left:48,right:12,top:88,bottom:116}
    :{width:1100,height:650,left:82,right:40,top:96,bottom:108};
  const chronologicalGames=[...games].sort(comparePlayerWeeklyGames);
  const values=chronologicalGames.flatMap((game)=>{
    const value=playerWeeklyMetricValue(game.metrics,metric.key as PlayerStatsMetricKey);
    return value===null?[]:[{game,value}];
  });
  const points=values.map((entry,index)=>{
    const average=values.slice(0,index+1).reduce((total,value)=>total+value.value,0)/(index+1);
    return{...entry,average};
  });
  const domain=scatterDomain(points.flatMap((point)=>[point.value,point.average]),.12);
  const yTicks=scatterTicks(domain,phone?5:6);
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const xAt=(index:number)=>points.length<=1?left+plotWidth/2:left+(index/(points.length-1))*plotWidth;
  const yAt=(value:number)=>top+(1-scatterPosition(value,domain))*plotHeight;
  const actualPolyline=points.map((point,index)=>`${xAt(index)},${yAt(point.value)}`).join(" ");
  const averagePolyline=points.map((point,index)=>`${xAt(index)},${yAt(point.average)}`).join(" ");
  const title=`${playerName||"Player"} · ${metric.label}`;
  const subtitle=`${season} ${team} · weekly output and cumulative average`;
  return <section className="scatter-chart player-weekly-chart" aria-label={`${title} weekly progression chart`}>
    <div className="scatter-chart-scroll"><div className={`scatter-stage player-weekly-stage ${phone?"phone-layout":"desktop-layout"}`} style={{aspectRatio:`${width} / ${height}`}}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="player-weekly-title player-weekly-subtitle">
        <title id="player-weekly-title">{title}</title><desc id="player-weekly-subtitle">{subtitle}. The solid line is each game and the dashed line is the running season average.</desc>
        <text className={`scatter-title ${phone?"mobile":""}`} x={width/2} y={phone?29:34} textAnchor="middle">{title}</text>
        <text className="scatter-subtitle" x={width/2} y={phone?51:57} textAnchor="middle">{subtitle}</text>
        {yTicks.map((tick,index)=><g key={`weekly-y-${index}`}><line className="scatter-grid-line" x1={left} x2={left+plotWidth} y1={yAt(tick)} y2={yAt(tick)}/><text className="scatter-tick" x={left-12} y={yAt(tick)+4} textAnchor="end">{formatScatterValue(tick,metric.format,true)}</text></g>)}
        <line className="scatter-axis" x1={left} x2={left+plotWidth} y1={top+plotHeight} y2={top+plotHeight}/>
        <line className="scatter-axis" x1={left} x2={left} y1={top} y2={top+plotHeight}/>
        {points.map((point,index)=><text className="player-weekly-x-label" x={xAt(index)} y={top+plotHeight+24} textAnchor="middle" key={`weekly-label-${point.game.gameId}`}>W{point.game.week}</text>)}
        {points.length>1?<><polyline className="player-weekly-average" points={averagePolyline}/><polyline className="player-weekly-actual" points={actualPolyline}/></>:null}
        {points.map((point,index)=>{const markerSize=phone?19:25,x=xAt(index),y=yAt(point.value),opponentLogo=resolveTeamLogoAsset(point.game.opponent)??point.game.opponentLogo;return <g className="player-weekly-opponent-marker" key={`weekly-point-${point.game.gameId}`}><title>{point.game.opponent} · Week {point.game.week} · {formatScatterValue(point.value,metric.format)}</title><circle className="player-weekly-average-point" cx={x} cy={yAt(point.average)} r={phone?2.4:3}/>{opponentLogo?<image className="player-weekly-opponent-logo" href={opponentLogo} x={x-markerSize/2} y={y-markerSize/2} width={markerSize} height={markerSize} preserveAspectRatio="xMidYMid meet"/>:<><circle className="player-weekly-actual-point" cx={x} cy={y} r={phone?8:10}/><text className="player-weekly-opponent-fallback" x={x} y={y+2.5} textAnchor="middle">{point.game.opponentAbbreviation.slice(0,3)}</text></>}<text className="player-weekly-value" x={x} y={y-markerSize/2-5} textAnchor="middle">{formatScatterValue(point.value,metric.format)}</text></g>;})}
        <text className="scatter-axis-label" x={left+plotWidth/2} y={height-(phone?18:20)} textAnchor="middle">GAME WEEK</text>
        <text className="scatter-axis-label" x={phone?14:22} y={top+plotHeight/2} textAnchor="middle" transform={`rotate(-90 ${phone?14:22} ${top+plotHeight/2})`}>{metric.label}</text>
        <g className="player-weekly-legend" transform={`translate(${width-(phone?140:185)} ${phone?68:72})`}><line className="player-weekly-actual" x1="0" x2="24" y1="0" y2="0"/><text x="31" y="3">GAME</text><line className="player-weekly-average" x1={phone?72:88} x2={phone?96:112} y1="0" y2="0"/><text x={phone?103:119} y="3">RUNNING AVG</text></g>
      </svg>
      <span className="scatter-chart-brand" aria-hidden="true"><img src="/harper-football.svg" alt=""/><span><strong>HARPER+</strong><small>CFB MODEL</small></span></span>
      {!points.length?<div className="scatter-empty" style={{inset:`${(top/height)*100}% ${(right/width)*100}% ${(bottom/height)*100}% ${(left/width)*100}%`}}><strong>{loading?"Loading progression…":"No game-level values"}</strong><span>{loading?"The weekly chart will populate automatically.":message??`No ${metric.label.toLowerCase()} values were recorded for this player.`}</span></div>:null}
    </div></div>
  </section>;
}

function DataVisualizerPage({season,week,setSeason,setWeek}:ModelVintageProps) {
  const [mode,setMode]=useState<"team"|"player">("team");
  const [playerSource,setPlayerSource]=useState<"cfbd"|"pff">("cfbd");
  const [playerView,setPlayerView]=useState<"season"|"weekly">("season");
  const [family,setFamily]=useState<TeamScatterFamily>("basic");
  const [side,setSide]=useState<TeamScatterSide>("offense");
  const [scale,setScale]=useState<TeamScatterScale>("raw");
  const [position,setPosition]=useState<PlayerStatsPosition>("QB");
  const [conference,setConference]=useState("");
  const [selectedTeams,setSelectedTeams]=useState<string[]>([]);
  const [selectedYears,setSelectedYears]=useState<number[]>(()=>[
    PLAYER_SCATTER_ARCHIVE_SEASONS.includes(season)?season:PLAYER_SCATTER_ARCHIVE_SEASONS.at(-1)??activeModelSeason,
  ]);
  const [xKey,setXKey]=useState("ypp");
  const [yKey,setYKey]=useState("ypa");
  const [weeklyMetricKey,setWeeklyMetricKey]=useState<PlayerStatsMetricKey>("passYards");
  const [selectedPlayerId,setSelectedPlayerId]=useState("");
  const [pffTableSlug,setPffTableSlug]=useState("passing-summary");

  const pffEnabled=mode==="player"&&playerSource==="pff";
  const pffPosition=(position==="QB"||position==="RB"||position==="WR"||position==="TE"||position==="OL"?position:"QB") as PffPosition;
  const availablePffTables=pffTableForPosition(pffPosition);
  const activePffTable=PFF_TABLES.find((table)=>table.slug===pffTableSlug)??PFF_TABLES[0];
  const activePffTableSlug=pffTableSlug;
  const activePffTableLabel=activePffTable.label;
  const activePffTableUnit=Boolean(activePffTable.unit);
  const pffData=usePffTable(activePffTableSlug,pffEnabled);

  const teamMetricOptions=useMemo<ScatterMetricOption[]>(()=>{
    if(family==="basic")return TEAM_SCATTER_BASIC_METRICS.map((metric)=>({...metric,format:scale==="index"?"index":metric.format}));
    return TEAM_STATS_ADVANCED_METRICS.map((metric)=>({key:metric.key,label:metric.label,description:metric.description,format:scale==="index"?"index":metric.format as ScatterMetricFormat,advancedKey:metric.key}));
  },[family,scale]);
  const playerMetricOptions=useMemo(()=>playerScatterMetrics(position),[position]);
  const pffValues=pffData.payload?.values;
  const pffMetricOptions=useMemo<ScatterMetricOption[]>(()=>{
    const tableLabel=(PFF_TABLES.find((table)=>table.slug===pffTableSlug)??PFF_TABLES[0]).label;
    const payload=pffValues?{sheet:pffTableSlug,values:pffValues}:null;
    return pffMetrics(payload).map((metric)=>({
      key:metric.key,label:metric.label,description:`PFF 2025 ${tableLabel.toLowerCase()} metric.`,format:metric.format,pffIndex:metric.index,
    }));
  },[pffTableSlug,pffValues]);
  const weeklyMetricOptions=useMemo(()=>playerWeeklyMetrics(position),[position]);
  const metricOptions=mode==="team"?teamMetricOptions:playerSource==="pff"?pffMetricOptions:playerMetricOptions;
  const activeX=metricOptions.find((metric)=>metric.key===xKey)??metricOptions[0];
  const activeY=metricOptions.find((metric)=>metric.key===yKey)??metricOptions[Math.min(1,metricOptions.length-1)]??metricOptions[0];
  const activeWeeklyMetric=weeklyMetricOptions.find((metric)=>metric.key===weeklyMetricKey)??weeklyMetricOptions[0];
  const weeklyMode=mode==="player"&&playerSource==="cfbd"&&playerView==="weekly";
  const multiYear=!pffEnabled&&selectedYears.length>1;
  const activeSeason=pffEnabled?2025:selectedYears.at(-1)??season;
  const profileWeek=mode==="player"?16:week;
  const dynamic=useDynamicProfiles(activeSeason,profileWeek);
  const needsEverySeasonProfiles=multiYear&&(mode==="team"||(position==="OL"&&Boolean(activeX?.key.startsWith("ol:")||activeY?.key.startsWith("ol:"))));
  const everySeason=useEverySeasonProfiles(needsEverySeasonProfiles);
  const selectedYearSet=useMemo(()=>new Set(selectedYears),[selectedYears]);
  const teamRows=useMemo(()=>multiYear
    ?everySeason.rows.filter((row)=>selectedYearSet.has(row.season))
    :dynamic.rows,[dynamic.rows,everySeason.rows,multiYear,selectedYearSet]);
  const playerData=useScatterPlayerStats(selectedYears,position,mode==="player");

  const filterDirectory=useMemo(()=>{
    const rows=[
      ...dynamic.rows.map((row)=>({team:row.team,abbreviation:row.abbreviation,conference:row.conference||"FBS",color:row.color,altColor:row.altColor,logo:row.logo})),
      ...everySeason.rows.map((row)=>({team:row.team,abbreviation:row.abbreviation,conference:row.conference||"FBS",color:row.color,altColor:row.altColor,logo:row.logo})),
      ...(playerData.payload?.teams??[]).map((row)=>({team:row.team,abbreviation:row.abbreviation,conference:row.conference||"FBS",color:row.color,altColor:row.altColor,logo:row.logo})),
    ];
    return[...new Map(rows.map((row)=>[row.team,row])).values()];
  },[dynamic.rows,everySeason.rows,playerData.payload?.teams]);

  const conferences=useMemo(()=>{
    const values=[...filterDirectory.map((row)=>row.conference),...(playerData.payload?.conferences??[])];
    return[...new Set(values.filter(Boolean))].sort();
  },[filterDirectory,playerData.payload?.conferences]);
  const selectedTeamSet=useMemo(()=>new Set(selectedTeams),[selectedTeams]);
  const teamsForFilter=useMemo(()=>{
    const filtered=filterDirectory.filter((row)=>matchesConferenceFilter(row.conference,conference)||selectedTeamSet.has(row.team));
    return filtered.sort((left,right)=>left.team.localeCompare(right.team));
  },[conference,filterDirectory,selectedTeamSet]);
  const weeklyTeam=selectedTeams.length===1?selectedTeams[0]:"";
  const weeklyPlayers=useMemo(()=>{
    if(!weeklyMode||!weeklyTeam)return[];
    return(playerData.payload?.rows??[])
      .filter((row)=>row.season===activeSeason&&row.team===weeklyTeam&&row.position===position&&playerMeetsScatterParticipationThreshold(row,position))
      .sort((left,right)=>left.name.localeCompare(right.name));
  },[activeSeason,playerData.payload?.rows,position,weeklyMode,weeklyTeam]);
  const activeWeeklyPlayer=weeklyPlayers.find((row)=>row.id===selectedPlayerId)??weeklyPlayers[0]??null;
  const weeklyData=usePlayerWeeklyTimeline(
    activeSeason,weeklyTeam,activeWeeklyPlayer?.id??"",activeWeeklyPlayer?.name??"",
    weeklyMode&&Boolean(weeklyTeam&&activeWeeklyPlayer),
  );
  const pffHeaders=useMemo(()=>pffValues?.[0]??[],[pffValues]);
  const pffRows=useMemo(()=>pffValues?.slice(1)??[],[pffValues]);
  const pffTeamResolution=useMemo(()=>{
    const headers=pffData.payload?.values?.[0]??[];
    const teamIndex=headers.findIndex((value)=>String(value)==="team_name");
    const resolved=new Map<string,(typeof filterDirectory)[number]>();
    if(teamIndex<0)return resolved;
    for(const row of pffData.payload?.values?.slice(1)??[]){
      const rawTeam=String(row[teamIndex]??"");
      if(!rawTeam||resolved.has(rawTeam))continue;
      const identity=resolvePffTeam(rawTeam,filterDirectory);
      if(identity)resolved.set(rawTeam,identity);
    }
    return resolved;
  },[filterDirectory,pffData.payload]);
  const pffPlayerIdentity=useMemo(()=>new Map((playerData.payload?.rows??[]).map((row)=>[
    `${normalizedPffPlayer(row.team)}:${normalizedPffPlayer(row.name)}`,row,
  ])),[playerData.payload?.rows]);

  const points=useMemo<ScatterPlotPoint[]>(()=>{
    if(!activeX||!activeY)return[];
    if(weeklyMode)return[];
    if(mode==="team")return teamRows.flatMap((row)=>{
      if(!matchesConferenceFilter(row.conference,conference))return[];
      if(selectedTeamSet.size&&!selectedTeamSet.has(row.team))return[];
      const x=family==="basic"
        ?teamScatterBasicValue(row,activeX.key,side,scale)
        :teamScatterAdvancedValue(row,activeX.advancedKey!,side,scale);
      const y=family==="basic"
        ?teamScatterBasicValue(row,activeY.key,side,scale)
        :teamScatterAdvancedValue(row,activeY.advancedKey!,side,scale);
      if(x===null||y===null)return[];
      return[{id:`team-${row.season}-${row.team}`,label:multiYear?`${row.season} ${row.team}`:row.team,secondary:`${row.season} · ${row.conference||"FBS"} · ${row.gamesPlayed} games`,team:row.team,conference:row.conference||"FBS",season:multiYear?row.season:undefined,logo:row.logo,color:row.color,altColor:row.altColor,jersey:null,x,y}];
    });
    if(playerSource==="pff"){
      const pffTable=PFF_TABLES.find((table)=>table.slug===pffTableSlug)??PFF_TABLES[0];
      const headers=pffHeaders;
      const playerIndex=headers.findIndex((value)=>String(value)==="player");
      const playerIdIndex=headers.findIndex((value)=>String(value)==="player_id");
      const positionIndex=headers.findIndex((value)=>String(value)==="position");
      const teamIndex=headers.findIndex((value)=>String(value)==="team_name");
      const franchiseIndex=headers.findIndex((value)=>String(value)==="franchise_id");
      if(teamIndex<0||activeX.pffIndex===undefined||activeY.pffIndex===undefined)return[];
      return pffRows.flatMap((row,rowIndex)=>{
        const rawTeam=String(row[teamIndex]??"");
        const identity=pffTeamResolution.get(rawTeam);
        if(!identity)return[];
        if(!matchesConferenceFilter(identity.conference,conference))return[];
        if(selectedTeamSet.size&&!selectedTeamSet.has(identity.team))return[];
        const rawPosition=positionIndex<0?"":String(row[positionIndex]??"");
        if(!pffPositionMatches(rawPosition,pffPosition,Boolean(pffTable.unit)))return[];
        if(!pffRowQualified(row,headers,pffTable,pffPosition))return[];
        if(!pffMetricSampleQualified(row,headers,activeX.pffIndex)||!pffMetricSampleQualified(row,headers,activeY.pffIndex))return[];
        const x=pffCellNumber(row,activeX.pffIndex),y=pffCellNumber(row,activeY.pffIndex);
        if(x===null||y===null)return[];
        const playerName=pffTable.unit?`${identity.team} OLine`:String(row[playerIndex]??`${pffPosition} player`);
        const known=pffPlayerIdentity.get(`${normalizedPffPlayer(identity.team)}:${normalizedPffPlayer(playerName)}`);
        const jersey=known?.jersey??pffFallbackJersey(pffPosition,`${identity.team}:${playerName}`);
        const sourceId=String(row[playerIdIndex>=0?playerIdIndex:franchiseIndex]??rowIndex);
        return[{id:`pff-2025-${pffTable.slug}-${sourceId}-${identity.team}`,label:playerName,secondary:`2025 · ${identity.team} · ${identity.conference||"FBS"} · PFF ${pffTable.unit?"OL UNIT":rawPosition}`,team:identity.team,conference:identity.conference||"FBS",season:undefined,logo:identity.logo,color:identity.color,altColor:identity.altColor,jersey,x,y}];
      });
    }
    const profileByTeam=new Map((multiYear?everySeason.rows:dynamic.rows).map((row)=>[`${row.season}:${row.team}`,row]));
    return(playerData.payload?.rows??[]).flatMap((row)=>{
      if(!matchesConferenceFilter(row.conference,conference))return[];
      if(selectedTeamSet.size&&!selectedTeamSet.has(row.team))return[];
      if(!playerMeetsScatterParticipationThreshold(row,position))return[];
      const qualifies=(metric:ScatterMetricOption)=>metric.key.startsWith("ol:")||playerQualifiesForStat(row,position,metric.key as PlayerStatsMetricKey);
      if(!qualifies(activeX)||!qualifies(activeY))return[];
      const value=(metric:ScatterMetricOption)=>{
        if(metric.key.startsWith("ol:")){
          const profile=profileByTeam.get(`${row.season}:${row.team}`);
          return profile&&metric.advancedKey?teamScatterAdvancedValue(profile,metric.advancedKey,"offense","raw"):null;
        }
        return playerStatsNumericValue(row,metric.key as PlayerStatsMetricKey);
      };
      const x=value(activeX),y=value(activeY);
      if(x===null||y===null)return[];
      return[{id:`player-${row.season}-${row.team}-${row.id}`,label:multiYear?`${row.season} ${row.name}`:row.name,secondary:`${row.season} · ${row.team} · ${row.conference||"FBS"} · ${position}`,team:row.team,conference:row.conference||"FBS",season:multiYear?row.season:undefined,logo:row.logo,color:row.color,altColor:row.altColor,jersey:row.jersey,x,y}];
    });
  },[activeX,activeY,conference,dynamic.rows,everySeason.rows,family,mode,multiYear,pffHeaders,pffPlayerIdentity,pffPosition,pffRows,pffTableSlug,pffTeamResolution,playerData.payload?.rows,playerSource,position,scale,selectedTeamSet,side,teamRows,weeklyMode]);

  const resetAxes=(nextMetrics:ScatterMetricOption[])=>{
    setXKey(nextMetrics[0]?.key??"");
    setYKey(nextMetrics[Math.min(1,nextMetrics.length-1)]?.key??nextMetrics[0]?.key??"");
  };
  const changeMode=(nextMode:"team"|"player")=>{
    setMode(nextMode);
    resetAxes(nextMode==="team"?teamMetricOptions:playerSource==="pff"?pffMetricOptions:playerMetricOptions);
  };
  const changePlayerSource=(nextSource:"cfbd"|"pff")=>{
    setPlayerSource(nextSource);setSelectedPlayerId("");setPlayerView("season");
    if(nextSource==="pff"){
      const nextPosition=(position==="QB"||position==="RB"||position==="WR"||position==="TE"||position==="OL"?position:"QB") as PffPosition;
      setPosition(nextPosition);setSelectedYears([2025]);setSeason(2025);
      setPffTableSlug(pffTableForPosition(nextPosition)[0]?.slug??"passing-summary");
      setXKey("");setYKey("");
    }else resetAxes(playerScatterMetrics(position));
  };
  const changePlayerView=(nextView:"season"|"weekly")=>{
    setPlayerView(nextView);
    setSelectedPlayerId("");
    if(nextView==="weekly"){
      const latest=selectedYears.at(-1)??season;
      setSelectedYears([latest]);
      setSeason(latest);
      if(selectedTeams.length>1)setSelectedTeams([selectedTeams[0]]);
      setWeeklyMetricKey((playerWeeklyMetrics(position)[0]?.key??"passYards") as PlayerStatsMetricKey);
    }
  };
  const changeFamily=(nextFamily:TeamScatterFamily)=>{
    setFamily(nextFamily);
    const metrics=nextFamily==="basic"
      ?TEAM_SCATTER_BASIC_METRICS.map((metric)=>({...metric,format:scale==="index"?"index" as const:metric.format}))
      :TEAM_STATS_ADVANCED_METRICS.map((metric)=>({key:metric.key,label:metric.label,description:metric.description,format:scale==="index"?"index" as const:metric.format as ScatterMetricFormat,advancedKey:metric.key}));
    resetAxes(metrics);
  };
  const changePosition=(nextPosition:PlayerStatsPosition)=>{
    setPosition(nextPosition);setSelectedPlayerId("");
    if(playerSource==="pff"){
      const nextPffPosition=nextPosition as PffPosition;
      setPffTableSlug(pffTableForPosition(nextPffPosition)[0]?.slug??"passing-summary");setXKey("");setYKey("");
    }else resetAxes(playerScatterMetrics(nextPosition));
    setWeeklyMetricKey((playerWeeklyMetrics(nextPosition)[0]?.key??"passYards") as PlayerStatsMetricKey);
    if(nextPosition==="OL")setPlayerView("season");
  };
  const changeConference=(nextConference:string)=>setConference(nextConference);
  const toggleYear=(value:string)=>{
    if(pffEnabled)return;
    const year=Number(value);
    if(weeklyMode){setSelectedYears([year]);setSeason(year);setSelectedPlayerId("");return;}
    const next=selectedYears.includes(year)
      ?selectedYears.length===1?selectedYears:selectedYears.filter((candidate)=>candidate!==year)
      :[...selectedYears,year].sort((left,right)=>left-right);
    setSelectedYears(next);
    if(next.length===1)setSeason(next[0]);
  };
  const toggleTeam=(team:string)=>{
    setSelectedPlayerId("");
    setSelectedTeams((current)=>weeklyMode?(current[0]===team?[]:[team]):current.includes(team)?current.filter((candidate)=>candidate!==team):[...current,team].sort());
  };
  const allYearsSelected=selectedYears.length===PLAYER_SCATTER_ARCHIVE_SEASONS.length;
  const yearSummary=allYearsSelected?`ALL YEARS · 14–${String(activeModelSeason).slice(-2)}`:selectedYears.length===1?String(selectedYears[0]):compactSelectedYears(selectedYears);
  const yearLabel=pffEnabled?"2025":allYearsSelected?`2014–${activeModelSeason}`:selectedYears.length<=3?selectedYears.join(", "):`${selectedYears.length} selected seasons`;
  const teamSummary=!selectedTeams.length?"ALL TEAMS":selectedTeams.length===1?selectedTeams[0]:`${selectedTeams.length} TEAMS SELECTED`;
  const teamContext=!selectedTeams.length?conferenceFilterDisplay(conference,"All FBS"):selectedTeams.length<=2?selectedTeams.join(" + "):`${selectedTeams.length} selected teams`;
  const context=conference&&selectedTeams.length?`${teamContext} · ${conferenceFilterDisplay(conference)}`:teamContext;
  const title=mode==="team"
    ?`${yearLabel} ${side==="offense"?"Offense":"Defense"}: ${activeY?.label??"Y"} vs ${activeX?.label??"X"}`
    :`${pffEnabled?"PFF ":""}${yearLabel} ${position}: ${activeY?.label??"Y"} vs ${activeX?.label??"X"}`;
  const subtitle=mode==="team"
    ?`${context} · ${multiYear?"Final season snapshots":`Week ${profileWeek}`} · ${family==="basic"?"Basic":"Advanced"} ${scale==="raw"?"values":"opponent-adjusted indices"}`
    :pffEnabled?`${context} · ${activePffTableLabel} · ${points.length} qualified ${position}${activePffTableUnit?" units":" players"}`
    :`${context} · ${multiYear?"Selected player-seasons":"Season totals"} · ${points.length} qualified ${position}${position==="OL"?" units":" players"}`;
  const loading=mode==="team"
    ?(multiYear?everySeason.loading:dynamic.loading)
    :pffEnabled?pffData.loading||dynamic.loading:weeklyMode?playerData.loading||weeklyData.loading:playerData.loading||(needsEverySeasonProfiles&&everySeason.loading);

  return <section className="scatter-visualizer-page">
    <div className="scatter-controls" aria-label="Scatterplot filters">
      <label><span>DATA</span><select value={mode} onChange={(event)=>changeMode(event.target.value as "team"|"player")} aria-label="Choose team or player plot"><option value="team">TEAM STATS</option><option value="player">PLAYER STATS</option></select></label>
      {mode==="player"?<label><span>SOURCE</span><select value={playerSource} onChange={(event)=>changePlayerSource(event.target.value as "cfbd"|"pff")} aria-label="Choose player statistics source"><option value="cfbd">CFBD + HARPER+</option><option value="pff">PFF 2025 OFFENSE</option></select></label>:null}
      {mode==="player"&&playerSource==="cfbd"?<label><span>VIEW</span><select value={playerView} onChange={(event)=>changePlayerView(event.target.value as "season"|"weekly")} aria-label="Choose player visualization"><option value="season">PLAYER COMPARISON</option><option value="weekly" disabled={position==="OL"}>WEEKLY PROGRESSION</option></select></label>:null}
      {pffEnabled?<label><span>YEAR</span><select value="2025" disabled aria-label="PFF data season"><option value="2025">2025</option></select></label>:weeklyMode?<label><span>YEAR</span><select value={activeSeason} onChange={(event)=>toggleYear(event.target.value)} aria-label="Choose progression season">{PLAYER_SCATTER_ARCHIVE_SEASONS.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>:<ScatterMultiSelect label="YEAR" summary={yearSummary} ariaLabel={`Choose scatterplot years; ${yearSummary}`} selected={selectedYears.map(String)} options={PLAYER_SCATTER_ARCHIVE_SEASONS.map((value)=>({value:String(value),label:String(value)}))} onToggle={toggleYear} onAll={()=>setSelectedYears([...PLAYER_SCATTER_ARCHIVE_SEASONS])}/>}
      {mode==="team"&&!multiYear?<label><span>WEEK</span><select value={week} onChange={(event)=>setWeek(Number(event.target.value))} aria-label="Choose team snapshot week">{Array.from({length:17},(_,value)=><option key={value} value={value}>{value===0?"PRESEASON":`WEEK ${value}`}</option>)}</select></label>:null}
      {mode==="team"?<label><span>STAT TYPE</span><select value={family} onChange={(event)=>changeFamily(event.target.value as TeamScatterFamily)} aria-label="Choose basic or advanced team stats"><option value="basic">BASIC</option><option value="advanced">ADVANCED</option></select></label>:<label><span>POSITION</span><select value={position} onChange={(event)=>changePosition(event.target.value as PlayerStatsPosition)} aria-label="Choose player position">{(pffEnabled?["QB","RB","WR","TE","OL"] as PlayerStatsPosition[]:PLAYER_STATS_POSITIONS).map((value)=><option value={value} key={value}>{value}</option>)}</select></label>}
      {pffEnabled?<label><span>STAT GROUP</span><select value={activePffTableSlug} onChange={(event)=>{setPffTableSlug(event.target.value);setXKey("");setYKey("");}} aria-label="Choose PFF statistic group">{availablePffTables.map((table)=><option value={table.slug} key={table.slug}>{table.label}</option>)}</select></label>:null}
      {mode==="team"?<label><span>SIDE</span><select value={side} onChange={(event)=>setSide(event.target.value as TeamScatterSide)} aria-label="Choose offense or defense"><option value="offense">OFFENSE</option><option value="defense">DEFENSE</option></select></label>:null}
      {mode==="team"?<label><span>VALUES</span><select value={scale} onChange={(event)=>{const next=event.target.value as TeamScatterScale;setScale(next);}} aria-label="Choose raw or adjusted team values"><option value="raw">RAW</option><option value="index">ADJUSTED INDEX</option></select></label>:null}
      <label><span>CONFERENCE</span><select value={conference} onChange={(event)=>changeConference(event.target.value)} aria-label="Filter scatterplot by conference"><option value="">ALL CONFERENCES</option><option value={POWER_4_FILTER}>{POWER_4_LABEL.toUpperCase()}</option>{conferences.map((value)=><option value={value} key={value}>{value}</option>)}</select></label>
      {weeklyMode?<label><span>TEAM</span><select value={weeklyTeam} onChange={(event)=>{setSelectedTeams(event.target.value?[event.target.value]:[]);setSelectedPlayerId("");}} aria-label="Choose one team for player progression"><option value="">SELECT TEAM</option>{teamsForFilter.map((row)=><option value={row.team} key={row.team}>{row.team}</option>)}</select></label>:<ScatterMultiSelect label="TEAM" summary={teamSummary} ariaLabel={`Filter scatterplot by teams; ${teamSummary}`} selected={selectedTeams} options={teamsForFilter.map((row)=>({value:row.team,label:row.team}))} onToggle={toggleTeam} onAll={()=>setSelectedTeams([])}/>}
      {weeklyMode?<label><span>PLAYER</span><select value={activeWeeklyPlayer?.id??""} onChange={(event)=>setSelectedPlayerId(event.target.value)} aria-label="Choose one player for weekly progression" disabled={!weeklyPlayers.length}><option value="">{playerData.loading?"LOADING PLAYERS":"SELECT PLAYER"}</option>{weeklyPlayers.map((row)=><option value={row.id} key={row.id}>{row.name}{row.jersey!==null?` · #${row.jersey}`:""}</option>)}</select></label>:null}
      {weeklyMode?<label className="scatter-axis-control"><span>STAT</span><select value={activeWeeklyMetric?.key??""} onChange={(event)=>setWeeklyMetricKey(event.target.value as PlayerStatsMetricKey)} aria-label="Choose weekly player statistic">{weeklyMetricOptions.map((metric)=><option value={metric.key} key={metric.key}>{metric.label}</option>)}</select></label>:<><label className="scatter-axis-control"><span>X AXIS</span><select value={activeX?.key??""} onChange={(event)=>setXKey(event.target.value)} aria-label="Choose X axis statistic">{metricOptions.map((metric)=><option value={metric.key} key={metric.key}>{metric.label}</option>)}</select></label><label className="scatter-axis-control"><span>Y AXIS</span><select value={activeY?.key??""} onChange={(event)=>setYKey(event.target.value)} aria-label="Choose Y axis statistic">{metricOptions.map((metric)=><option value={metric.key} key={metric.key}>{metric.label}</option>)}</select></label></>}
    </div>
    {weeklyMode&&activeWeeklyMetric?<PlayerWeeklyTrend games={weeklyData.payload?.games??[]} metric={activeWeeklyMetric} playerName={activeWeeklyPlayer?.name??"Player progression"} team={weeklyTeam||"Select a team"} season={activeSeason} loading={loading} message={!weeklyTeam?"Select one team, then choose a qualified player.":!activeWeeklyPlayer&&!playerData.loading?`No qualified ${position} player is available for this team and season.`:weeklyData.payload?.message}/>:activeX&&activeY?<ScatterPlot points={points} xMetric={activeX} yMetric={activeY} title={title} subtitle={subtitle} mode={mode} loading={loading}/>:null}
    {pffEnabled?<p className="pff-data-note"><strong>PFF DATA</strong> PFF metrics are reproduced from a user-supplied 2025 data export. Harper+ is not affiliated with Pro Football Focus. Low-volume players and small split samples are excluded from the plot.</p>:null}
  </section>;
}

function StatsHubPage({season,week,setSeason,setWeek,initialView="team"}:{season:number;week:number;setSeason:(season:number)=>void;setWeek:(week:number)=>void;initialView?:"team"|"player"}) {
  const [view,setView]=useState<"team"|"player">(initialView);
  return <section className="stats-hub-page">
    <nav className="stats-hub-switch" aria-label="Choose team or player statistics">
      <button type="button" className={view==="team"?"active":""} aria-pressed={view==="team"} onClick={()=>setView("team")}><span>TEAM</span><strong>Team Stats</strong></button>
      <button type="button" className={view==="player"?"active":""} aria-pressed={view==="player"} onClick={()=>setView("player")}><span>PLAYER</span><strong>Player Stats</strong></button>
    </nav>
    <div className="stats-hub-content" data-stats-view={view}>
      {view==="team"?<TeamStatsPage season={season} week={week} setSeason={setSeason} setWeek={setWeek}/>:<PlayerStatsPage/>}
    </div>
  </section>;
}

function PlayerRatingsPage() {
  const [season,setSeason]=useState(activeModelSeason);
  const [conference,setConference]=useState("");
  const [team,setTeam]=useState("");
  const [position,setPosition]=useState("");
  const [direction,setDirection]=useState<"asc"|"desc">("desc");
  const [page,setPage]=useState(1);
  const requestKey=`${season}:${conference}:${team}:${position}:${direction}:${page}`;
  const [result,setResult]=useState<{key:string;payload:PlayerRatingsPayload|null;loading:boolean}>({key:"",payload:null,loading:true});

  useEffect(()=>{
    const controller=new AbortController();
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      setResult((current)=>({key:requestKey,payload:current.key===requestKey?current.payload:null,loading:true}));
      try {
        const params=new URLSearchParams({
          season:String(season),
          sort:"overall",
          direction,
          page:String(page),
          limit:"50",
        });
        if(conference)params.set("conference",conference);
        if(team)params.set("team",team);
        if(position)params.set("position",position);
        const response=await fetch(`/api/player-ratings?${params}`,{signal:controller.signal});
        const payload=await readJsonBody<PlayerRatingsPayload>(response);
        if(controller.signal.aborted)return;
        setResult({key:requestKey,payload,loading:false});
        if(payload.status==="waiting"||payload.status==="building") {
          retryTimer=setTimeout(load,Math.max(30_000,(payload.retryAfterSeconds??0)*1000));
        }
      } catch(error) {
        if(controller.signal.aborted)return;
        setResult({
          key:requestKey,
          loading:false,
          payload:{season,status:"error",rows:[],teams:[],positions:[],message:error instanceof Error?error.message:"Player ratings are temporarily unavailable."},
        });
      }
    };
    load();
    return()=>{controller.abort();if(retryTimer)clearTimeout(retryTimer);};
  },[requestKey,season,conference,team,position,direction,page]);

  const payload=result.key===requestKey?result.payload:null;
  const rows=payload?.rows??[];
  const pagination=payload?.pagination;
  const availableSeasons=(payload?.availableSeasons?.length
    ?payload.availableSeasons
    :seasonOptions.filter((value)=>value<=activeModelSeason)).sort((left,right)=>right-left);
  const teams=payload?.teams??[];
  const conferences=payload?.conferences??[...new Set(teams.map((row)=>row.conference).filter((value):value is string=>Boolean(value)))].sort();
  const filteredTeams=conference?teams.filter((row)=>matchesConferenceFilter(row.conference,conference)):teams;
  const positions=payload?.positions??["QB","RB","WR","TE","OL","EDGE","DL","LB","CB","S","K","P"];
  const gridStyle={"--stats-grid":"minmax(314px,1fr) minmax(118px,.32fr)","--stats-min-width":"474px"} as CSSProperties;
  const updateFilter=(setter:(value:string)=>void,value:string)=>{setter(value);setPage(1);};

  return <section className="page-section player-ratings-page">
    <div className="section-kicker">POSITION ENGINE · OUTPUT VS OPPONENT · 2014–{activeModelSeason}</div>
    <div className="section-title-row">
      <div>
        <h1>Player Ratings</h1>
        <p>A 50–99 same-position grade built from role-specific production, advanced efficiency, workload and the exact units faced.</p>
      </div>
    </div>

    <details className="stats-filter-drawer player-ratings-filter-drawer">
      <summary><span><strong>Filters</strong><small>{season} · {conferenceFilterDisplay(conference)} · {position||"All positions"} · {PLAYER_RATING_COLUMN.label}</small></span><b aria-hidden="true">+</b></summary>
      <section className="player-ratings-controls" aria-label="Player rating filters">
        <label><span>YEAR</span><select value={season} onChange={(event)=>{setSeason(Number(event.target.value));setConference("");setTeam("");setPage(1);}}>{availableSeasons.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>CONFERENCE</span><select value={conference} onChange={(event)=>{setConference(event.target.value);setTeam("");setPage(1);}}><option value="">ALL CONFERENCES</option><option value={POWER_4_FILTER}>{POWER_4_LABEL.toUpperCase()}</option>{conferences.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>TEAM</span><select value={team} onChange={(event)=>updateFilter(setTeam,event.target.value)}><option value="">ALL TEAMS</option>{filteredTeams.map((row)=><option key={row.team} value={row.team}>{row.team}</option>)}</select></label>
        <label><span>POSITION</span><select value={position} onChange={(event)=>updateFilter(setPosition,event.target.value)}><option value="">ALL POSITIONS</option>{positions.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" className="player-ratings-direction" onClick={()=>{setDirection((value)=>value==="desc"?"asc":"desc");setPage(1);}} aria-label={`Sort ${direction==="desc"?"ascending":"descending"}`}>
          <span>DIRECTION</span><strong>{direction==="desc"?"HIGH → LOW":"LOW → HIGH"}</strong>
        </button>
      </section>
    </details>

    {payload?.status==="building"||payload?.status==="waiting"?<div className="player-ratings-state">
      <span>RATING ENGINE</span><strong>Rebuilding the historical scale</strong><p>{payload.message??"Completed player seasons are being normalized. This page will refresh automatically."}</p>
    </div>:null}
    {payload?.status==="error"||payload?.status==="unavailable"?<div className="player-ratings-state error">
      <span>PLAYER RATINGS</span><strong>Temporarily unavailable</strong><p>{payload.message}</p>
    </div>:null}

    {payload?.status==="ready"?<section className="player-ratings-board">
      <header>
        <p><strong>{pagination?.total.toLocaleString()??0}</strong> rated players · {PLAYER_RATING_COLUMN.label} · {direction==="desc"?"high to low":"low to high"}</p>
      </header>
      {result.loading&&!rows.length?<div className="player-ratings-loading">Loading player ratings…</div>:null}
      <div className="stats-table-shell player-stats-table-shell player-ratings-table-shell">
        <div className="stats-head player-stats-head player-ratings-table-head" role="row" style={gridStyle}>
          <div className="stats-head-cell player-ratings-player-head" role="columnheader"><span>PLAYER</span></div>
          <div className="stats-head-cell" role="columnheader" aria-sort={direction==="asc"?"ascending":"descending"}><button type="button" className="active" onClick={()=>{setDirection((value)=>value==="desc"?"asc":"desc");setPage(1);}} aria-label={`Sort ${PLAYER_RATING_COLUMN.label} ${direction==="desc"?"ascending":"descending"}`}><span>{PLAYER_RATING_COLUMN.label}</span><i aria-hidden="true">{direction==="asc"?"↑":"↓"}</i></button><StatHelp label={PLAYER_RATING_COLUMN.label} explanation={PLAYER_RATING_COLUMN.description}/></div>
        </div>
        {rows.map((row)=><div className="stats-row player-stats-row player-rating-table-row" style={gridStyle} key={`${row.season}-${row.team}-${row.id}`}>
          <div className="player-stats-player">
            <div className="player-stats-ranks player-rating-table-rank" aria-label={`${PLAYER_RATING_COLUMN.label} rank ${row.rank}`}><b>{row.rank}</b></div>
            <PlayerStatsJersey team={row.team} color={row.color} altColor={row.altColor} jersey={row.jersey}/>
            <span><strong>{row.name}</strong><small>{row.team} · {row.position} · {row.conference||"FBS"}</small></span>
          </div>
          <span className={`stats-value player-stats-value player-rating-table-value ${productionRatingTone(row.overall)}`} title={`${playerRatingSourceCopy(row.source)} · ${row.evidence}`}><strong>{row.overall}</strong><small>{playerOverallTier(row.overall).label}</small></span>
        </div>)}
      </div>
      {!rows.length&&!result.loading?<div className="player-ratings-loading">No rated players match these filters.</div>:null}
      {pagination&&pagination.pageCount>1?<footer className="player-ratings-pagination">
        <button type="button" disabled={pagination.page<=1} onClick={()=>setPage((value)=>Math.max(1,value-1))}>← PREVIOUS</button>
        <span>PAGE <strong>{pagination.page}</strong> OF {pagination.pageCount}</span>
        <button type="button" disabled={pagination.page>=pagination.pageCount} onClick={()=>setPage((value)=>Math.min(pagination.pageCount,value+1))}>NEXT →</button>
      </footer>:null}
    </section>:null}

    <div className="player-rating-tier-key" aria-label="Player overall tiers">
      {[98,95,90,85,80,70,60,50].map((rating)=>{const tier=playerOverallTier(rating);return <span className={tier.key} key={tier.range}><b>{tier.range}</b>{tier.label}</span>;})}
    </div>
    <p className="player-ratings-method"><b>OBSERVED</b> uses a different evidence blend by position: advanced PPA and success, role-specific efficiency, negative plays, workload, usage, and output versus the exact units on the schedule. Small-school production is not automatically discounted; it earns full credit when it travels against stronger opponents. Short samples are regressed, so an efficient reserve can surface without being graded like a proven workhorse. The scale remains scarce: <b>90+</b> is the top 4%, <b>95+</b> the top 1%, and <b>99</b> the top 0.1% of 2014–{activeModelSeason} same-position seasons. <b>OL UNIT</b> remains one opponent-relative blocking and protection grade.</p>
  </section>;
}

function DepthChartPage() {
  const [playerSeason,setPlayerSeason]=useState(activeModelWeek===0?activeModelSeason-1:activeModelSeason);
  const [selectedTeam,setSelectedTeam]=useState("Indiana");
  const playerLayer=usePlayerLayer(playerSeason,[selectedTeam]);
  const seasonProfile=useDynamicProfiles(playerSeason,16);
  const teams=playerLayer.payload?.teams??[];
  const profileTeams=seasonProfile.rows.map((row):PlayerTeamIndexRow=>({team:row.team,teamId:row.teamId,abbreviation:row.abbreviation,mascot:row.mascot,conference:row.conference,color:row.color,altColor:row.altColor,logo:row.logo}));
  const teamOptions=teams.length?teams:profileTeams;
  const resolvedTeam=teamOptions.some((team)=>team.team===selectedTeam)?selectedTeam:teamOptions.find((team)=>team.team==="Indiana")?.team??teamOptions[0]?.team??selectedTeam;
  const selectedMeta=teamOptions.find((team)=>team.team===resolvedTeam)??teamOptions[0];
  const model=playerLayer.profiles.get(resolvedTeam);
  const selectedSeasonRow=seasonProfile.rows.find((row)=>row.team===resolvedTeam);
  const embeddedTeam=teamMap.get(resolvedTeam);
  const primaryColor=selectedMeta?.color??embeddedTeam?.color;
  const secondaryColor=selectedMeta?.altColor??embeddedTeam?.altColor;
  return <section className="page-section depth-chart-page">
    <div className="section-kicker">{playerSeason} PLAYER ROOM · VERIFIED WHEN PUBLISHED</div>
    <div className="section-title-row"><div><h1>Depth Chart</h1><p>Published team depth when verified; position-safe projection everywhere else.</p></div><div className="depth-chart-controls"><label><span>TEAM</span><select aria-label="Depth chart team" value={resolvedTeam} onChange={(event)=>setSelectedTeam(event.target.value)}>{teamOptions.length?teamOptions.map((team)=><option key={team.team} value={team.team}>{team.team}</option>):<option value={selectedTeam}>Loading teams…</option>}</select></label><label><span>SEASON</span><select aria-label="Depth chart season" value={playerSeason} onChange={(event)=>{setPlayerSeason(Number(event.target.value));setSelectedTeam("Indiana");}}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></label></div></div>
    {playerLayer.payload?.status!=="ready"?<div className="player-sync-card"><span>PLAYER DATA IMPORT</span><strong>{playerLayer.payload?.status==="error"?"NEEDS ATTENTION":`${playerLayer.payload?.sync?.progressPercent??0}%`}</strong><div><i style={{width:`${playerLayer.payload?.sync?.progressPercent??0}%`}}/></div><p>{playerLayer.payload?.message??playerLayer.payload?.sync?.detail??`Loading the ${playerSeason} player archive…`}</p></div>:null}
    <div className="depth-chart-layout">
      <article id="depth-chart-profile" className="depth-chart-profile">
        {selectedMeta?<header><TeamMark name={selectedMeta.team} size="lg" logo={selectedMeta.logo}/><div><span>{selectedMeta.conference??"FBS"} · {playerSeason}</span><h2>{selectedMeta.team}</h2><p>Production is graded by position against the full 2014–present FBS archive.</p></div></header>:null}
        {!model&&playerLayer.payload?.status==="ready"?<div className="data-empty"><strong>No player profile was returned for {resolvedTeam}.</strong><span>The team roster may use a different source name or contain no published player statistics.</span></div>:null}
        {model?<StarterFormationBoard model={model} team={resolvedTeam} logo={selectedMeta?.logo} primaryColor={primaryColor} secondaryColor={secondaryColor} profile={selectedSeasonRow}/>:null}
        <OffensiveLineUnitCard row={selectedSeasonRow} rows={seasonProfile.rows} loading={seasonProfile.loading} productionRating={model?.offensiveLineUnitRating}/>
        {model?<DepthRosterTable model={model}/>:null}
        {model?<p className="depth-source-note">
          <strong>{model.depthSource?.kind==="OFFICIAL_TEAM_NOTES"?"PUBLISHED SOURCE":"PROJECTION STATUS"}</strong>
          <span>{model.sourceNote}</span>
          {model.depthSource?.sourceUrl?<a href={model.depthSource.sourceUrl} target="_blank" rel="noreferrer">VIEW OFFICIAL DEPTH CHART</a>:null}
        </p>:null}
      </article>
    </div>
  </section>;
}

function SeasonSimulationPage({ season, week, setSeason, setWeek, onSelectTeam, onSelectGame, embedded=false }: ModelVintageProps & {onSelectTeam?:(team:string)=>void;onSelectGame?:RankingGameSelectHandler;embedded?:boolean}) {
  const snapshotWeek=enteringWeekSnapshotWeek(week);
  const simulation = useSeasonSimulation(season, snapshotWeek);
  const data = simulation.data;
  const simulationEvidenceWeek=data?.effectiveWeek??snapshotWeek;
  const logoByTeam = useMemo(() => new Map((data?.rankings ?? []).map((row) => [row.team, row.logo])), [data]);
  const rounds: BracketProjection["round"][] = data?.format === 4
    ? ["Semifinal", "Championship"]
    : ["First Round", "Quarterfinal", "Semifinal", "Championship"];
  return <section className={`${embedded?"what-if-simulation-section":"page-section"} simulation-page`}>
    <div className="section-kicker">ENTERING-WEEK FORECAST · SCHEDULE → TITLE GAMES → CFP</div>
    <div className="section-title-row">
      <div><h1>Season Simulation</h1><p>Forecast the rest of the season using only information available before the selected week, then determine conference title games and simulate the playoff.</p></div>
      <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} idPrefix="season-simulation" weekLabel="ENTERING WEEK" />
    </div>

    <div className="weekly-ranking-snapshot simulation-ranking-snapshot" role="note">
      <span>{week===0?"PRESEASON FORECAST":`ENTERING WEEK ${week}`}</span>
      <strong>{simulationEvidenceWeek?`DATA THROUGH WEEK ${simulationEvidenceWeek}`:"PRESEASON / WEEK 0 STATE"}</strong>
      <p>{week?`Week ${week} results are excluded here. They first change the forecast entering Week ${week+1}.`:"The full schedule is projected from the initial season state."} The projected Top 25 is identical to the H+ Forecast Top 25 on Scores for this same snapshot.</p>
    </div>

    {simulation.loading ? <div className="simulation-state">Running the full-season projection…</div> : null}
    {!simulation.loading && !data ? <div className="simulation-state error"><strong>Simulation waiting for season data</strong><span>{simulation.error || "The automatic archive will populate this view when the season schedule and profiles are ready."}</span></div> : null}
    {data ? <>
      <div className="simulation-hero">
        <div>
          <span>SEASON SIM RANKINGS → CFP SEEDS</span>
          <h2>{data.champion || "Field pending"}</h2>
          <p>{`${season} seeds the top ${data.format} teams directly from the projected final H+ ranking. Rank 1 is seed 1 through the playoff cutoff; real-life bracket placement and automatic qualifiers do not replace a higher-ranked team.`}</p>
        </div>
        {data.champion ? <TeamMark name={data.champion} size="lg" logo={logoByTeam.get(data.champion)} /> : null}
        <div className="simulation-hero-metrics"><div><small>FORMAT</small><strong>{data.format} TEAM</strong></div><div><small>TITLE GAME EDGE</small><strong>{data.championshipProbability === null ? "—" : `${(data.championshipProbability*100).toFixed(0)}%`}</strong></div><div><small>ENTERING WEEK</small><strong>WK {week}</strong></div></div>
      </div>

      <article className="playoff-card">
        <div className="block-head"><div><span className="section-kicker">COLLEGE FOOTBALL PLAYOFF</span><h2>{season} Season Sim-ranked field and bracket</h2></div><small>SEEDS = FINAL H+ RANKS</small></div>
        <div className={`playoff-bracket format-${data.format}`}>{rounds.map((round) => <section key={round} className="bracket-round" data-round={round.toLowerCase().replaceAll(" ","-")}><header>{round}</header><div>{data.bracket.filter((game) => game.round === round).map((game) => <article className="bracket-game" key={game.id}>
          <div className={game.winner === game.firstTeam ? "winner" : ""}><span className="bracket-seed">{game.firstSeed}</span><TeamMark name={game.firstTeam} size="sm" logo={logoByTeam.get(game.firstTeam)} variant="helmet" /><strong>{game.firstTeam}</strong><b>{game.firstScore}</b></div>
          <div className={game.winner === game.secondTeam ? "winner" : ""}><span className="bracket-seed">{game.secondSeed}</span><TeamMark name={game.secondTeam} size="sm" logo={logoByTeam.get(game.secondTeam)} variant="helmet" /><strong>{game.secondTeam}</strong><b>{game.secondScore}</b></div>
          <footer><span>{game.campusGame ? "CAMPUS" : "NEUTRAL"}</span><b>{game.winner} {(game.winnerProbability*100).toFixed(0)}%</b><small>{game.schematicEdge}</small>{onSelectGame?<button type="button" className="simulation-matchup-preview" onClick={()=>onSelectGame(simulationMatchupDetailRow(game,season,data.effectiveWeek,logoByTeam))} aria-label={`Open ${game.firstTeam} versus ${game.secondTeam} matchup preview`}>PREVIEW <span aria-hidden="true">›</span></button>:null}</footer>
        </article>)}</div></section>)}</div>
      </article>

      <div className="simulation-stack">
        <article className="simulation-rankings-card">
          <div className="block-head"><div><span className="section-kicker">PROJECTED FINAL TABLE</span><h2>Top 25 after championship week</h2></div><small>H2H APPLIED</small></div>
          <div className="rankings-shell unified-rankings-shell simulation-unified-shell">
            <div className="rankings-head simulation-ranking-head"><span>RK</span><span>TEAM / KEY RESULTS</span><span>RECORD</span><span>EXP W</span><span>SOS</span><span>H2H</span><span>CFP</span><span>SCHEDULE</span></div>
            {data.rankings.slice(0,25).map((row) => <UnifiedRankingEntry
              key={row.team}
              className="simulation-ranking-entry"
              rank={row.rank}
              team={row.team}
              logo={row.logo}
              subtitle={row.conference||"FBS"}
              highlights={[
                {label:"BEST WINS",value:row.projectedWinsOver.length?row.projectedWinsOver.join(", "):"No wins projected",className:"ranking-best-wins"},
                {label:"WORST LOSSES",value:row.projectedLossesTo.length?row.projectedLossesTo.join(", "):"None",className:"ranking-losses"},
              ]}
              metrics={<>
                <span className="ranking-record-pair" data-label="RECORD"><b>{row.projectedRecord}</b><small>{row.conferenceRecord||"—"} CONF</small></span>
                <strong data-label="EXP W">{row.expectedWins.toFixed(1)}</strong>
                <span data-label="SOS">#{row.sosRank}</span>
                <strong data-label="H2H">#{row.headToHeadRank}</strong>
                <span data-label="CFP">{row.playoffSeed?<b className="seed-pill">#{row.playoffSeed}</b>:row.conferenceChampion?<b className="champ-pill">CHAMP</b>:"—"}</span>
              </>}
              season={season}
              simulatedSchedule={row.schedule}
              logoByTeam={logoByTeam}
              onSelectTeam={onSelectTeam}
              onSelectGame={onSelectGame}
            />)}
          </div>
        </article>

        <aside className="conference-projections">
          <div className="block-head"><div><span className="section-kicker">TITLE WEEK</span><h2>Conference projections</h2></div></div>
          <div>{data.conferenceChampionships.map((game) => <article key={game.conference}>
            <header><span>{game.conference}</span><b>{game.winner} · {(game.winnerProbability*100).toFixed(0)}%</b></header>
            <div className="conference-matchup">
              <div className={game.winner === game.firstTeam ? "winner" : ""}><TeamMark name={game.firstTeam} size="sm" logo={logoByTeam.get(game.firstTeam)} variant="helmet" /><span>{game.firstTeam}</span><strong>{game.firstScore}</strong></div>
              <i>VS</i>
              <div className={game.winner === game.secondTeam ? "winner" : ""}><TeamMark name={game.secondTeam} size="sm" logo={logoByTeam.get(game.secondTeam)} variant="helmet" /><span>{game.secondTeam}</span><strong>{game.secondScore}</strong></div>
            </div>
            <p className="sim-schematic-edge">TOP MATCHUP EDGE · {game.schematicEdge}</p>
            {onSelectGame?<button type="button" className="simulation-matchup-preview conference-preview" onClick={()=>onSelectGame(simulationMatchupDetailRow(game,season,data.effectiveWeek,logoByTeam))} aria-label={`Open ${game.firstTeam} versus ${game.secondTeam} matchup preview`}>MATCHUP PREVIEW <span aria-hidden="true">›</span></button>:null}
          </article>)}</div>
        </aside>
      </div>

      <p className="simulation-method">{data.methodology}</p>
    </> : null}
  </section>;
}

function accuracyHistoryPercent(value:number|null) {
  return value===null?"—":`${(value*100).toFixed(1)}%`;
}

function accuracyHistoryRecord(wins:number,losses:number,pushes=0) {
  return pushes?`${wins}–${losses}–${pushes}P`:`${wins}–${losses}`;
}

function CompactAccuracyTable({home=false}:{home?:boolean}) {
  const [scope,setScope]=useState<CalibrationScope>("qualified");
  const [teamFilter,setTeamFilter]=useState("");
  const [conferenceFilter,setConferenceFilter]=useState("");
  const calibration=useCalibrationReport(scope,home?"":teamFilter,home?"":conferenceFilter);
  const rows=useMemo(()=>calibration.data?.rows??[],[calibration.data?.rows]);
  const filterLabel=teamFilter||(conferenceFilter?conferenceFilterDisplay(conferenceFilter):"All FBS games");
  const summary=useMemo(()=>{
    const straightUp=rows.reduce((result,row)=>({wins:result.wins+row.straightUp.wins,losses:result.losses+row.straightUp.losses,graded:result.graded+row.straightUp.graded}),{wins:0,losses:0,graded:0});
    const spread=rows.reduce((result,row)=>({wins:result.wins+row.spread.wins,losses:result.losses+row.spread.losses,pushes:result.pushes+row.spread.pushes,graded:result.graded+row.spread.graded}),{wins:0,losses:0,pushes:0,graded:0});
    const total=rows.reduce((result,row)=>({wins:result.wins+row.total.wins,losses:result.losses+row.total.losses,pushes:result.pushes+row.total.pushes,graded:result.graded+row.total.graded}),{wins:0,losses:0,pushes:0,graded:0});
    return {
      straightUp:{...straightUp,accuracy:straightUp.graded?straightUp.wins/straightUp.graded:null},
      spread:{...spread,accuracy:spread.graded?spread.wins/spread.graded:null},
      total:{...total,accuracy:total.graded?total.wins/total.graded:null},
    };
  },[rows]);
  const metricCell=(label:string,accuracy:number|null,wins:number,losses:number,pushes:number,sample:number)=><span className="compact-accuracy-metric" data-label={label}><strong>{accuracyHistoryPercent(accuracy)}</strong><small>{accuracyHistoryRecord(wins,losses,pushes)} · N={sample}</small></span>;
  return <section className={`compact-accuracy ${home?"compact-accuracy-home":""}`} aria-label="Model accuracy by season">
    <header>
      <div><span>MODEL ACCURACY · WEEK 5+ · FBS ONLY</span><h2>{home?"How the model has performed":filterLabel}</h2></div>
      <div className="compact-accuracy-scope" role="group" aria-label="Choose prediction sample">
        <button type="button" className={scope==="qualified"?"active":""} aria-pressed={scope==="qualified"} onClick={()=>setScope("qualified")}>GOOD FITS</button>
        <button type="button" className={scope==="all"?"active":""} aria-pressed={scope==="all"} onClick={()=>setScope("all")}>ALL GAMES</button>
      </div>
    </header>
    {!home?<div className="accuracy-entity-filters" aria-label="Filter accuracy by team or conference">
      <label><span>TEAM</span><select aria-label="Filter accuracy by team" value={teamFilter} onChange={(event)=>{setTeamFilter(event.target.value);if(event.target.value)setConferenceFilter("");}}><option value="">All teams</option>{calibration.options.teams.map((team)=><option key={team}>{team}</option>)}</select></label>
      <b>OR</b>
      <label><span>CONFERENCE</span><select aria-label="Filter accuracy by conference" value={conferenceFilter} onChange={(event)=>{setConferenceFilter(event.target.value);if(event.target.value)setTeamFilter("");}}><option value="">All conferences</option><option value={POWER_4_FILTER}>{POWER_4_LABEL}</option>{calibration.options.conferences.map((conference)=><option key={conference}>{conference}</option>)}</select></label>
      <button type="button" disabled={!teamFilter&&!conferenceFilter} onClick={()=>{setTeamFilter("");setConferenceFilter("");}}>RESET</button>
    </div>:null}
    <div className="compact-accuracy-table">
      <div className="compact-accuracy-head"><span>SEASON</span><span>WINNER</span><span>SPREAD</span><span>TOTAL</span></div>
      {!calibration.loading&&rows.length?<>
        <article className="compact-accuracy-row aggregate"><strong>ALL</strong>{metricCell("WINNER",summary.straightUp.accuracy,summary.straightUp.wins,summary.straightUp.losses,0,summary.straightUp.graded)}{metricCell("SPREAD",summary.spread.accuracy,summary.spread.wins,summary.spread.losses,summary.spread.pushes,summary.spread.graded)}{metricCell("TOTAL",summary.total.accuracy,summary.total.wins,summary.total.losses,summary.total.pushes,summary.total.graded)}</article>
        {rows.map((row)=><article className={`compact-accuracy-row ${row.lineQualityStatus}`} key={row.season}><strong>{row.season}<small>{row.lineQualityStatus==="provisional"?"QA":""}</small></strong>{metricCell("WINNER",row.straightUp.accuracy,row.straightUp.wins,row.straightUp.losses,0,row.straightUp.graded)}{metricCell("SPREAD",row.spread.accuracy,row.spread.wins,row.spread.losses,row.spread.pushes,row.spread.graded)}{metricCell("TOTAL",row.total.accuracy,row.total.wins,row.total.losses,row.total.pushes,row.total.graded)}</article>)}
      </>:<div className="compact-accuracy-state">{calibration.loading?"Loading results…":`No graded predictions are available for ${filterLabel}.`}</div>}
    </div>
    <p>{scope==="qualified"?"Good Fits grades only model-qualified spread and total opportunities.":"All Games grades every game with a prediction and a usable market line."}{!home?" Team and conference views include games involving the selected program or league.":""} Every view excludes Weeks 0–4 and FCS matchups. Pushes do not count toward hit rate.</p>
  </section>;
}

function AccuracyHistoryPage() {
  return <section className="page-section accuracy-history-page">
    <div className="section-kicker">PRIOR-WEEK PREDICTION AUDIT · 2014–PRESENT</div>
    <div className="section-title-row"><div><h1>Accuracy History</h1><p>Audit every eligible prediction or isolate the model&apos;s history with one team or conference.</p></div></div>
    <CompactAccuracyTable />
  </section>;
}

function Methodology() {
  const calibration = useCalibrationReport();
  const slices=useValidationSlices();
  const validationSlices=useMemo(()=>{
    const data=slices.data;
    const edgeOrder=["0–1","1–2","2–3","3–5","5+"];
    const edgeRows=edgeOrder.map((label)=>({
      label,
      count:data?.atsEdges.find((row)=>row.label===label)?.count??data?.totalEdges.find((row)=>row.label===label)?.count??0,
      atsAccuracy:data?.atsEdges.find((row)=>row.label===label)?.atsAccuracy??null,
      totalAccuracy:data?.totalEdges.find((row)=>row.label===label)?.totalAccuracy??null,
    }));
    const week=[...(data?.week??[])].sort((left,right)=>{
      if(left.label==="Postseason")return 1;if(right.label==="Postseason")return -1;
      return Number(left.label.replace(/\D/g,""))-Number(right.label.replace(/\D/g,""));
    });
    const qualityOrder=["Missing profile","Limited","Developing","Mature"];
    const dataQuality=[...(data?.dataQuality??[])].sort((left,right)=>qualityOrder.indexOf(left.label)-qualityOrder.indexOf(right.label));
    return {week,dataQuality,confidence:data?.confidence??[],winCalibration:data?.winCalibration??[],edgeRows};
  },[slices.data]);
  const frozenAtsConfidence=wilsonConfidenceInterval(holdoutMarketCalibration.ats.holdout.wins,holdoutMarketCalibration.ats.holdout.losses);
  const frozenTotalConfidence=wilsonConfidenceInterval(holdoutMarketCalibration.totals.holdout.wins,holdoutMarketCalibration.totals.holdout.losses);
  return (
    <section className="page-section methodology-page">
      <div className="section-kicker">AUDITABLE MODEL ARCHITECTURE</div>
      <div className="section-title-row"><div><h1>How Harper+ Works</h1><p>The website ports the workbook’s calculation layers instead of treating the spreadsheet as a black box.</p></div></div>

      <div className="pipeline">
        {[
          ["01", "INGEST", "Schedules, box scores, lines, identity, advanced components"],
          ["02", "ADJUST", "Efficiency corrected for opponent quality and schedule connectivity"],
          ["03", "MATCH", "Team efficiency against opponent allowances"],
          ["04", "SCORE", "Shared possessions × calibrated points per possession"],
          ["05", "RANK", "Results, schedule and a trimmed computer composite"],
        ].map(([number, label, text]) => <div key={number}><span>{number}</span><strong>{label}</strong><p>{text}</p></div>)}
      </div>

      <div className="method-grid">
        <article className="formula-card wide">
          <span className="card-label">POSSESSION-BASED SCORING MODEL</span>
          <h2>Drive opportunity × drive quality</h2>
          <code>EXPECTED POINTS = EXPECTED POSSESSIONS × EXPECTED POINTS PER POSSESSION<br />GAME TOTAL = DIRECT TOTAL CALIBRATION(PACE, RAW TOTAL, EXPLOSIVENESS, VIABILITY)</code>
          <p>Regularized on {possessionModel.trainingSeasons} with season-held-out testing, then frozen before {possessionModel.holdoutSeason}. One shared possession estimate prevents pace from being counted twice. Efficiency, explosiveness, finishing, protection, field position and viability enter one points-per-possession model, so correlated symptoms are not stacked as separate point deductions. Holdout team-score MAE improved from {scoringModelValidation.legacyHoldoutScoreMae.toFixed(2)} to {scoringModelValidation.holdoutScoreMae.toFixed(2)}; total MAE improved from {scoringModelValidation.legacyHoldoutTotalMae.toFixed(2)} to {scoringModelValidation.holdoutTotalMae.toFixed(2)}.</p>
        </article>

        <article className="formula-card wide">
          <span className="card-label">OFFENSIVE VIABILITY THRESHOLD</span>
          <h2>One learned structural requirement</h2>
          <code>VIABILITY = f(DISTANCE FROM LEARNED THRESHOLD, ALTERNATIVE PATH, HAVOC EXPOSURE)</code>
          <p>Harper+ rebuilds success-rate, rushing, passing, standard-down, passing-down and havoc scoring curves from archived team-games. The largest sample-weighted points-per-drive change identifies the requirement; it is not a hand-picked cutoff. The result enters the score model as a nonlinear interaction with the offense’s alternative path. It never becomes a separate fixed eight- or ten-point penalty.</p>
        </article>

        <article className="formula-card">
          <span className="card-label">CALIBRATED MATCHUP LAYER</span>
          <h2>Efficiency plus opponent-aware results</h2>
          <code>STAT INDEX = 25–52% ITERATIVE OPPONENT CORRECTION<br />FINAL MARGIN = STAT PROFILE + RESULT ELO + SCHEDULE-PROOF GAP<br />PROOF GAP WEIGHT = {modelCalibration.matchupProofMarginWeight.toFixed(0)} POINTS · HOME FIELD = {modelCalibration.homeFieldAdvantage.toFixed(1)}</code>
          <p>Five offense/defense iterations discount production against weak units. The 25% base correction rises automatically when a profile is early, FCS-heavy or poorly connected; those same profiles receive extra Bayesian regression toward the four-season prior. A cross-validated proof adjustment then compares schedule strength, best opponent, quality wins and reliability without using conference labels. Result-only Elo still updates from opponent expectation and capped margin of victory.</p>
        </article>

        <article className="formula-card wide">
          <span className="card-label">ADVANCED COMPONENT X-RAY</span>
          <h2>YPC and YPA are decomposed before the score model</h2>
          <code>RUN = TRENCH 50% + SECOND-LEVEL 32% + SUCCESS/PPA 18%<br />PASS = COMPLETION×YDS/COMP 42% + QB 24% + RECEIVER SPACE 17% + DOWN LEVERAGE 17%<br />COMPONENT CORRECTION = BOUNDED TO ±14% YPC / ±12% YPA</code>
          <p>Each component receives offense, defensive-output-allowed and iterative opponent adjustments. The five matchup lanes are OL–front, backs–linebacker space, quarterback–coverage efficiency, receivers–secondary space and standard/passing-down leverage. CFBD line yards remain an OL/front proxy—not literal yards before contact. Completion rate and yards per completion are exact box-score calculations; unavailable tracking fields such as air yards and YAC are never manufactured.</p>
        </article>

        <article className="formula-card wide">
          <span className="card-label">DERIVED FOOTBALL INTELLIGENCE</span>
          <h2>Raw inputs become one matchup answer</h2>
          <code>ADVANTAGE = GEOMETRIC BLEND(OFFENSE × OPPONENT OUTPUT ALLOWED)<br />EDGE SCORE = 50 + 42 × LN(MATCHUP INDEX) · CLAMPED 0–100</code>
          <p>Correlated inputs are blended before they are shown, so success rate, EPA, line yards and havoc describe one football concept instead of four independent claims. A score below 50 favors the defense; above 50 favors the offense. Confidence comes from games played, advanced-stat coverage, opponent proof and missing-data quality. Team identities and historical comparisons use the same opponent-adjusted profile, while volatility and weekly consistency reduce certainty rather than changing the projected score by an arbitrary fixed amount.</p>
        </article>

        <article className="formula-card">
          <span className="card-label">HARPER BCS</span>
          <h2>Résumé-led, schedule-aware</h2>
          <div className="weight-list">
            <div><span>Results + strength of record</span><strong>54%</strong></div>
            <div><span>Quality wins + result quality</span><strong>18%</strong></div>
            <div><span>Trimmed seven-signal computer</span><strong>28%</strong></div>
          </div>
          <p>The best and worst of seven normalized computer signals are removed before the remaining five are averaged. The résumé concentrates value in the three best wins, evaluates margin relative to opponent quality, and explicitly penalizes bad losses and narrow escapes against weak teams. Undefeated protection strengthens only after a credible win, while direct head-to-head still controls close comparisons.</p>
        </article>
      </div>

      <div className="model-governance">
        <article><span className="card-label">PRESEASON PRIOR</span><h2>History plus roster continuity</h2><strong>40 · 30 · 20 · 10 + RP + RECRUIT</strong><p>The four-season performance blend remains the anchor. CFBD returning-production splits make the meaningful offensive adjustment, while recruiting class strength receives only a capped nudge so brand and conference talent cannot overwhelm demonstrated performance.</p></article>
        <article><span className="card-label">DURABLE DATA LAYERS</span><h2>Raw history stays fixed; formulas can evolve</h2><strong>STATS + OUTCOMES CACHED ONCE</strong><p>Completed schedules, scores, lines and team-game stats are retained. A model-version change rebuilds profiles and projections from that archive without downloading unchanged historical results again.</p></article>
        <article><span className="card-label">LEAKAGE GATE</span><h2>Only information available before kickoff counts</h2><strong>PRIOR-WEEK PROFILES ONLY</strong><p>The workbook’s postgame “real stats” reconstruction is intentionally excluded from forecast accuracy because it uses the completed game’s box score. Harper+ grades only predictions generated from the prior weekly snapshot.</p></article>
        <article><span className="card-label">TITLE-WEEK GOVERNANCE</span><h2>Qualification is rewarded; the extra loss is contained</h2><strong>RECORD → H2H → MINI-LEAGUE → COMMON OPPONENTS</strong><p>Conference finalists are selected from projected conference standings. Conference-specific procedure order then uses head-to-head, tied-team mini-league, common opponents, conference-opponent winning percentage and overall record before expected record and model rating serve as deterministic release valves. Reaching the title game earns résumé credit, and a championship loss receives only a reduced ranking penalty.</p></article>
      </div>

      <details className="validation-dashboard">
        <summary><div><span className="card-label">INTERNAL MODEL VALIDATION · 2025 UNTOUCHED HOLDOUT <i className="snapshot-badge frozen">FROZEN</i></span><h2>Accuracy, calibration and replacement gate</h2><p>Open the audit before treating a more complex model as an improvement.</p></div><div className="validation-summary-metrics"><b>{scoringModelValidation.holdoutScoreMae.toFixed(2)}<small>SCORE MAE</small></b><b>{scoringModelValidation.holdoutTotalMae.toFixed(2)}<small>TOTAL MAE</small></b><b>{scoringModelValidation.holdoutMarginMae.toFixed(2)}<small>SPREAD MAE</small></b></div><DisclosureControl /></summary>
        <div className="validation-dashboard-body">
          <section className="validation-audit-table"><header><span>BASELINE</span><span>TEAM SCORE MAE</span><span>SPREAD MAE</span><span>TOTAL MAE</span><span>WIN RATE</span><span>BRIER</span></header>{holdoutBaselineComparison.map((row)=><div className={row.model==="Possession v15"?"selected":""} key={row.model}><strong>{row.model}</strong><span>{row.scoreMae?.toFixed(2)??"—"}</span><span>{row.spreadMae.toFixed(2)}</span><span>{row.totalMae.toFixed(2)}</span><span>{row.straightUp===null?"—":`${(row.straightUp*100).toFixed(1)}%`}</span><span>{row.brier?.toFixed(3)??"—"}</span></div>)}</section>
          <div className="validation-panels">
            <article><span className="card-label">SEASON-HOLDOUT TREND</span><h3>Improvement was not limited to one year</h3><div className="validation-season-list">{validationBySeason.map((row)=><p key={row.season}><strong>{row.season}</strong><span>Score {row.previousScoreMae.toFixed(2)} → <b>{row.currentScoreMae.toFixed(2)}</b></span><span>Total {row.previousTotalMae.toFixed(2)} → <b>{row.currentTotalMae.toFixed(2)}</b></span><span>Spread {row.previousSpreadMae.toFixed(2)} → <b>{row.currentSpreadMae.toFixed(2)}</b></span></p>)}</div></article>
            <article><span className="card-label">PROJECTION DISTRIBUTION</span><h3>Broken low totals were removed</h3><div className="distribution-grid"><p><span>Average total</span><b>{holdoutProjectionDistribution.projected.averageTotal.toFixed(1)}</b><small>actual {holdoutProjectionDistribution.actual.averageTotal.toFixed(1)}</small></p><p><span>Below 20</span><b>{(holdoutProjectionDistribution.projected.below20*100).toFixed(1)}%</b><small>actual {(holdoutProjectionDistribution.actual.below20*100).toFixed(1)}%</small></p><p><span>One-score forecast</span><b>{(holdoutProjectionDistribution.projected.oneScore*100).toFixed(1)}%</b><small>actual {(holdoutProjectionDistribution.actual.oneScore*100).toFixed(1)}%</small></p><p><span>Blowout forecast</span><b>{(holdoutProjectionDistribution.projected.blowouts*100).toFixed(1)}%</b><small>actual {(holdoutProjectionDistribution.actual.blowouts*100).toFixed(1)}%</small></p></div><small>Point forecasts intentionally sit near the conditional mean; season simulation adds calibrated weekly variance so tail outcomes are not confused with the median score.</small></article>
            <article><span className="card-label">BETTING REPLACEMENT GATE <i className="snapshot-badge frozen">FROZEN</i></span><h3>Spread qualified; totals did not</h3><div className="betting-gate"><p className="passed"><span>ATS · TRAIN / HOLDOUT</span><b>{(holdoutMarketCalibration.ats.training.accuracy*100).toFixed(1)}% / {(holdoutMarketCalibration.ats.holdout.accuracy*100).toFixed(1)}%</b><small>N={holdoutMarketCalibration.ats.holdout.wins+holdoutMarketCalibration.ats.holdout.losses} · 95% CI {frozenAtsConfidence.low===null?"—":`${(frozenAtsConfidence.low*100).toFixed(1)}–${(frozenAtsConfidence.high!*100).toFixed(1)}%`} · {holdoutMarketCalibration.ats.holdout.wins}–{holdoutMarketCalibration.ats.holdout.losses}</small></p><p className="failed"><span>TOTALS · TRAIN / HOLDOUT</span><b>{(holdoutMarketCalibration.totals.training.accuracy*100).toFixed(1)}% / {(holdoutMarketCalibration.totals.holdout.accuracy*100).toFixed(1)}%</b><small>N={holdoutMarketCalibration.totals.holdout.wins+holdoutMarketCalibration.totals.holdout.losses} · 95% CI {frozenTotalConfidence.low===null?"—":`${(frozenTotalConfidence.low*100).toFixed(1)}–${(frozenTotalConfidence.high!*100).toFixed(1)}%`} · recommendations paused</small></p></div></article>
          </div>
          <details className="validation-slices-disclosure">
            <summary><div><span className="card-label">LIVE DIAGNOSTIC SLICES</span><h3>Find where the model is stable—and where it is not</h3><small>Week, confidence, profile completeness, win calibration and market-edge bands.</small></div><DisclosureControl /></summary>
            <div className="validation-slices-grid">{slices.loading?<p className="validation-slices-empty">Loading versioned validation rows…</p>:validationSlices.week.length?<>
              <ValidationSliceTable title="PERFORMANCE BY WEEK" rows={validationSlices.week} mode="errors" />
              <ValidationSliceTable title="PERFORMANCE BY CONFIDENCE" rows={validationSlices.confidence} mode="confidence" />
              <ValidationSliceTable title="PERFORMANCE BY DATA QUALITY" rows={validationSlices.dataQuality} mode="errors" />
              <ValidationSliceTable title="WIN-PROBABILITY CALIBRATION" rows={validationSlices.winCalibration} mode="calibration" />
              <ValidationSliceTable title="RAW MARKET EDGE BANDS" rows={validationSlices.edgeRows} mode="edges" />
            </>:<p className="validation-slices-empty">Slices populate as versioned v15 game predictions finish materializing. The frozen holdout above remains the replacement gate.</p>}</div>
          </details>
          <p className="validation-protocol">Protocol: FBS vs FBS, Week 5+ plus postseason, prior-week profiles only. 2021–2024 trains the frozen coefficients; 2025 is never used to select them. Missing-data quality enters as a reliability signal, not fabricated statistics. The reproducible audit compares previous, current, simple-rating and closing-market baselines separately for scores, spreads, totals and win-probability calibration.</p>
        </div>
      </details>

      <div className="calibration-ledger">
        <div className="workbook-map-head"><div><span className="card-label">MARKET VALIDATION · WEEK 5+</span><h2>Live archive ledger</h2></div><div className="validation-ledger-version"><i className="snapshot-badge live">LIVE</i><b>{calibration.data?.modelVersion || "V15"}</b></div></div>
        <div className="calibration-head"><span>SEASON</span><span>ATS</span><span>ATS RECORD</span><span>SPREAD MAE</span><span>O/U TEST</span><span>O/U RECORD</span></div>
        {calibration.loading ? <div className="calibration-empty">Loading prior-week-only audits…</div> : calibration.data?.rows.length ? calibration.data.rows.map((row) => <div className={`calibration-row ${row.lineQualityStatus}`} key={row.season}>
          <strong data-label="SEASON"><span>{row.season}</span><span className="snapshot-badge-stack"><i className="snapshot-badge live">LIVE</i>{row.lineQualityStatus==="provisional" ? <i className="snapshot-badge provisional">QA REVIEW</i> : null}</span></strong>
          <b data-label="ATS"><span>{row.spread.accuracy === null ? "—" : `${(row.spread.accuracy*100).toFixed(1)}%`}</span><small>N={row.spread.sampleSize ?? row.spread.graded} · {metricConfidence(row.spread)}</small></b>
          <span data-label="ATS RECORD">{row.spread.wins}–{row.spread.losses}{row.spread.pushes ? `–${row.spread.pushes}P` : ""} · {row.spread.passed} pass{row.spread.quarantined ? ` · ${row.spread.quarantined} excluded` : ""}</span>
          <span data-label="SPREAD MAE">{row.spread.meanAbsoluteError === null ? "—" : row.spread.meanAbsoluteError.toFixed(1)}</span>
          <b data-label="O/U TEST"><span>{row.total.accuracy === null ? "—" : `${(row.total.accuracy*100).toFixed(1)}%`}</span><small>N={row.total.sampleSize ?? row.total.graded} · {metricConfidence(row.total)}</small></b>
          <span data-label="O/U RECORD">{row.total.wins}–{row.total.losses}{row.total.pushes ? `–${row.total.pushes}P` : ""} · {row.total.passed} pass{row.total.quarantined ? ` · ${row.total.quarantined} excluded` : ""}</span>
        </div>) : <div className="calibration-empty">V15 audits will appear as cached seasons finish recalculating. No postgame box-score columns are used.</div>}
        <p><b>LIVE</b> rows recalculate from the current archived predictions. <b>FROZEN</b> holdout records above never change after model selection. Legacy 2014–2016 consensus lines are excluded when their favorite direction lacks an independently supported source; remaining early records are labeled provisional. ATS decisions are qualified recommendations. O/U remains a four-point-edge diagnostic, not a betting recommendation.</p>
      </div>

      <div className="workbook-map">
        <div className="workbook-map-head"><div><span className="card-label">WORKBOOK AUDIT</span><h2>All 25 tabs mapped</h2></div><b>{workbookTabs.length} / 25</b></div>
        <div>{workbookTabs.map((tab) => <article key={tab.name}><strong>{tab.name}</strong><span>{tab.role}</span></article>)}</div>
      </div>
    </section>
  );
}

function SimpleHomePage({onNavigate}:{onNavigate:(section:Section)=>void}){
  const links=navigation.filter((item)=>item.id!=="overview");
  return <section className="overview simple-home">
    <div className="simple-home-shell">
      <header className="simple-home-header">
        <img src="/harper-football.svg" alt="" />
        <div><span>HARPER+</span><h1>College Football Model</h1></div>
      </header>
      <nav className="simple-home-links" aria-label="Harper Plus pages">
        {links.map((item)=><a href={`#${item.id}`} key={item.id} onClick={(event)=>{event.preventDefault();onNavigate(item.id);}}><span>{item.mark}</span><strong>{item.label}</strong><b aria-hidden="true">›</b></a>)}
      </nav>
      <CompactAccuracyTable home />
      <section className="simple-home-contact" aria-labelledby="home-contact-title">
        <header><span>CONTACT</span><h2 id="home-contact-title">Leave a note</h2></header>
        <div className="simple-home-contact-action">
          <p>Enter your email and note through the secure contact form.</p>
          <a href="https://formsubmit.co/el/sifele" target="_blank" rel="noopener noreferrer">OPEN CONTACT FORM</a>
        </div>
        <p className="simple-home-contact-status">Messages are delivered directly to Harper+.</p>
      </section>
    </div>
  </section>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [selectedTeamName,setSelectedTeamName]=useState("Indiana");
  const [linkedScheduleGame,setLinkedScheduleGame]=useState<LinkedScheduleGame|null>(null);
  const [matchupLaunch,setMatchupLaunch]=useState<MatchupLaunch|null>(null);
  const [modelSeason, setModelSeason] = useState(activeModelSeason);
  const [modelWeek, setModelWeek] = useState(activeModelWeek);
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState("Historical model snapshot ready");
  const seasonPerformance = useSeasonPerformance(modelSeason);

  useEffect(() => {
    const syncSectionFromUrl = () => {
      const rawSection = window.location.hash.replace(/^#\/?/, "");
      const requested = (rawSection==="simulation"?"whatif":rawSection) as Section;
      if (navigation.some((item) => item.id === requested)) {
        setSection(requested);
        if(rawSection==="simulation")window.history.replaceState(null,"","#whatif");
      }
    };
    syncSectionFromUrl();
    window.addEventListener("popstate", syncSectionFromUrl);
    return () => window.removeEventListener("popstate", syncSectionFromUrl);
  }, []);

  const navigateTo = (nextSection: Section) => {
    setLinkedScheduleGame(null);
    setMatchupLaunch(null);
    if (window.location.hash !== `#${nextSection}`) window.history.pushState(null, "", `#${nextSection}`);
    if (nextSection === "whatif" && modelSeason === modelSnapshot.season && activeModelSeason > modelSnapshot.season) {
      setModelSeason(activeModelSeason);
      setModelWeek(activeModelWeek);
    }
    setSection(nextSection);
    window.requestAnimationFrame(() => window.scrollTo({ top:0, behavior:"auto" }));
  };

  const openTeamPage=(teamName:string)=>{
    setSelectedTeamName(teamName);
    navigateTo("teams");
  };

  const openScheduleGame=(row:ScheduleRow)=>{
    setLinkedScheduleGame({season:row.season,row});
    window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));
  };

  const openWinConditions=(row:ScheduleRow)=>{
    const snapshotWeek=Math.max(0,Math.min(16,row.generatedFromWeek??row.rankingWeek??row.week-1));
    setModelSeason(row.season);setModelWeek(snapshotWeek);
    navigateTo("matchup");
    setMatchupLaunch({key:`${row.gameId}:${Date.now()}`,gameId:row.gameId,homeTeam:row.homeTeam,awayTeam:row.awayTeam,
      homeSeason:row.season,awaySeason:row.season,homeWeek:snapshotWeek,awayWeek:snapshotWeek,neutralSite:Boolean(row.neutralSite)});
  };

  const refresh = async () => {
    setRefreshState("running");
    setRefreshMessage("Checking the latest automatic model run…");
    try {
      const response = await fetch("/api/refresh", { cache:"no-store" });
      const payload = await readJsonBody<{ configured?:boolean;run?:{season:number;week:number;status:string;createdAt:string} }>(response);
      if (!response.ok) throw new Error("Could not check the latest run");
      setRefreshState("done");
      setRefreshMessage(payload.run ? `Latest automatic run · ${payload.run.season} week ${payload.run.week} · ${payload.run.status}` : "Automatic updater is ready for the season");
    } catch (error) {
      setRefreshState("error");
      setRefreshMessage(error instanceof Error ? error.message : "Refresh failed");
    }
  };

  return (
    <main className="site-shell">
      <AppShell
        section={section}
        season={modelSeason}
        week={modelWeek}
        gamesTracked={seasonPerformance.loading ? null : (seasonPerformance.data?.gameCount ?? 0)}
        refreshState={refreshState}
        refreshMessage={refreshMessage}
        onNavigate={navigateTo}
        onRefresh={refresh}
        archiveStatus={<BackfillBanner />}
      >
        {linkedScheduleGame?<LinkedScheduleGameDetail selection={linkedScheduleGame} onBack={()=>{setLinkedScheduleGame(null);window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));}}/>:<>
        {section === "overview" ? <SimpleHomePage onNavigate={navigateTo} /> : null}

        {section === "schedule" ? <SchedulePage season={modelSeason} setSeason={setModelSeason} onSelectTeam={openTeamPage} onExploreWinConditions={openWinConditions} /> : null}
        {section === "rankings" ? <ResultsRankingsPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} onSelectTeam={openTeamPage} onSelectGame={openScheduleGame} /> : null}
        {section === "standings" ? <ConferenceStandingsPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} onSelectTeam={openTeamPage} /> : null}
        {section === "matchup" ? <MatchupLabV2 key={matchupLaunch?.key??"manual-matchup"} season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} launch={matchupLaunch} /> : null}
        {section === "whatif" ? <WhatIfPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} onSelectTeam={openTeamPage} onSelectGame={openScheduleGame} /> : null}
        {section === "all137" ? <All137 season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} onSelectTeam={openTeamPage} onSelectGame={openScheduleGame} /> : null}
        {section === "stats" ? <StatsHubPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
        {section === "visualize" ? <DataVisualizerPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
        {section === "playerstats" ? <StatsHubPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} initialView="player" /> : null}
        {section === "teams" ? <TeamLab season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} requestedTeam={selectedTeamName} onSelectedTeamChange={setSelectedTeamName} /> : null}
        {section === "players" ? <PlayerRatingsPage /> : null}
        {section === "depth" ? <DepthChartPage /> : null}
        {section === "methodology" ? <AccuracyHistoryPage /> : null}
        </>}

        <footer className="site-footer"><div className="brand compact"><span className="brand-mark harper-football-mark" aria-hidden="true"><img src="/harper-football.svg" alt="" /></span><div><strong>HARPER+</strong><small>COLLEGE FOOTBALL MODEL</small></div></div><p>Independent model. Team marks identify their respective institutions. Model logic derived from CFB MOD 25 and applied to timestamped weekly data.</p><span>AUTO · MONDAY AM</span></footer>
      </AppShell>
    </main>
  );
}
