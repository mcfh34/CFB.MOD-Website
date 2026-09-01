import {
  buildPregameElo,
  buildPregameMatchupEvidence,
  calculateCachedPerformance,
  currentCollegeFootballSeason,
  FIRST_HISTORICAL_SEASON,
  hydratePostseasonGameStats,
  latestProfile,
  loadPreseasonProfiles,
  MODEL_VERSION,
  project,
  type NormalizedGame,
  type Profile,
} from "../../../lib/dataPipeline";
import { modelCalibration } from "../../modelData";
import { buildBcsRankings, finalMatchupRating, type BcsRankingRow, type RankingGame, type RankingProfile } from "../../../lib/rankings";
import { buildSeasonSimulation, compactSeasonSimulationForClient, type SimulationGameOverride, type SimulationScheduleGame } from "../../../lib/simulation";
import { analyzeMatchupEdges } from "../../../lib/matchupAnalysis";
import { parseAdvancedProfile, type AdvancedSideProjection } from "../../../lib/advancedMetrics";
import { evaluateMarketProjection, evaluateTotalDiagnostic, marketModelCalibration } from "../../../lib/marketModel";
import { isStoredMarketLineQuarantined, marketLineSeasonStatus, wilsonConfidenceInterval } from "../../../lib/marketLineQuality";
import { currentViabilityCalibration } from "../../../lib/offensiveViability";
import { buildScheduleRecordTimeline, type ScheduleRecordGame } from "../../../lib/scheduleRecords";
import { findHistoricalComparisons, type FootballProfile } from "../../../lib/footballIntelligence";
import { buildMatchupContext, type MatchupContextGameRow, type MatchupContextProfile } from "../../../lib/matchupContext";
import { buildConferenceStandings, type ConferenceStandingGame, type ConferenceStandingTeam } from "../../../lib/conferenceStandings";
import { conferenceFilterSqlValues } from "../../../lib/conferenceFilters";
import { conferenceChampionshipGameIds } from "../../../lib/gamePhases";
import { scoreRankingSnapshotWeek } from "../../../lib/weeklyRankingSnapshot";
import { latestTeamProfilesAtOrBeforeWeek } from "../../../lib/profileSnapshots";
import { projectMatchupEngine } from "../../../lib/matchupEngine";
import {
  buildWinConditionAnalysis,
  type WinConditionHistoricalSample,
  type WinConditionProjection,
} from "../../../lib/winConditions";
import { runPreseasonTransitionBacktest, type PreseasonBacktestGame, type PreseasonBacktestSeason } from "../../../lib/preseasonBacktest";
import {
  calculateFinalEloRatings,
  type MetricTuple as PreseasonMetricTuple,
  type PreseasonHistoryRow,
  type PreseasonTransitionInput,
  type PreseasonTransitionProfile,
} from "../../../lib/preseasonTransition";

type CloudflareEnv = { DB?: D1Database; CFBD_API_KEY?: string };

const titleConferences = ["ACC", "American Athletic", "Big 12", "Big Ten", "Conference USA", "Mid-American", "Mountain West", "SEC", "Sun Belt"];
const known2025Champions = [
  { conference: "ACC", team: "Duke", status: "actual" },
  { conference: "American Athletic", team: "Tulane", status: "actual" },
  { conference: "Big 12", team: "Texas Tech", status: "actual" },
  { conference: "Big Ten", team: "Indiana", status: "actual" },
  { conference: "Conference USA", team: "Kennesaw State", status: "actual" },
  { conference: "Mid-American", team: "Western Michigan", status: "actual" },
  { conference: "Mountain West", team: "Boise State", status: "actual" },
  { conference: "SEC", team: "Georgia", status: "actual" },
  { conference: "Sun Belt", team: "James Madison", status: "actual" },
] as const;

// Weekly refreshes are intentionally sparse: only teams with completed games
// receive a new profile row. Every point-in-time consumer must select the most
// recent row for each team, rather than selecting one global week and silently
// removing teams that have not played yet.
const latestTeamProfileAtOrBeforeWeekSql = `wp.week=(
  SELECT MAX(profile_snapshot.week)
  FROM weekly_profiles profile_snapshot
  WHERE profile_snapshot.season=wp.season
    AND profile_snapshot.team=wp.team
    AND profile_snapshot.week<=?
)`;

const legacyConsensusQuarantineSql = `(p.season BETWEEN 2014 AND 2016 AND LOWER(COALESCE(l.provider,''))='consensus')`;
const trustedMarketLineSql = `NOT ${legacyConsensusQuarantineSql}`;
const totalDiagnosticBaseSql = `(p.week>=${marketModelCalibration.minimumWeek} OR g.season_type='postseason')
  AND g.home_points IS NOT NULL AND g.away_points IS NOT NULL AND p.vegas_total IS NOT NULL`;
const totalDiagnosticEligibleSql = `${totalDiagnosticBaseSql} AND ${trustedMarketLineSql}`;
const totalDiagnosticQualifiedSql = `${totalDiagnosticEligibleSql}
  AND p.total_edge IS NOT NULL AND ABS(p.total_edge)>=${marketModelCalibration.totalEdgeThreshold}`;
const totalDiagnosticWinSql = `${totalDiagnosticQualifiedSql}
  AND ((p.total_edge>0 AND g.home_points+g.away_points>p.vegas_total)
    OR (p.total_edge<0 AND g.home_points+g.away_points<p.vegas_total))`;
const totalDiagnosticLossSql = `${totalDiagnosticQualifiedSql}
  AND ((p.total_edge>0 AND g.home_points+g.away_points<p.vegas_total)
    OR (p.total_edge<0 AND g.home_points+g.away_points>p.vegas_total))`;
const totalDiagnosticPushSql = `${totalDiagnosticQualifiedSql}
  AND g.home_points+g.away_points=p.vegas_total`;
const totalDiagnosticPassSql = `${totalDiagnosticEligibleSql}
  AND (p.total_edge IS NULL OR ABS(p.total_edge)<${marketModelCalibration.totalEdgeThreshold})`;

function numberParam(url: URL, name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(url.searchParams.get(name));
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function simulationGameOverrides(url:URL):SimulationGameOverride[]{
  const raw=url.searchParams.get("overrides");
  if(!raw)return [];
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!Array.isArray(parsed))return [];
    const unique=new Map<string,SimulationGameOverride>();
    for(const value of parsed.slice(0,20)){
      if(!value||typeof value!=="object")continue;
      const row=value as Record<string,unknown>;
      const gameId=String(row.gameId??"").trim().slice(0,100);
      const winnerTeam=String(row.winnerTeam??"").trim().slice(0,100);
      if(gameId&&winnerTeam)unique.set(gameId,{gameId,winnerTeam});
    }
    return [...unique.values()];
  }catch{return [];}
}

function simulationScenarioRankings(simulation:ReturnType<typeof buildSeasonSimulation>){
  return simulation.rankings.map((row)=>({
    rank:row.rank,team:row.team,conference:row.conference,logo:row.logo,
    projectedRecord:row.projectedRecord,expectedWins:row.expectedWins,
    conferenceChampion:row.conferenceChampion,playoffSeed:row.playoffSeed,
  }));
}

function simulationScenarioBracket(simulation:ReturnType<typeof buildSeasonSimulation>){
  return simulation.bracket.map((game)=>({
    id:game.id,round:game.round,slot:game.slot,firstTeam:game.firstTeam,secondTeam:game.secondTeam,
    firstSeed:game.firstSeed,secondSeed:game.secondSeed,firstScore:game.firstScore,secondScore:game.secondScore,
    winner:game.winner,winnerSeed:game.winnerSeed,
  }));
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function accuracyMetric(row: Record<string, unknown>, prefix: "spread" | "total") {
  const wins = Number(row[`${prefix}Wins`] ?? 0);
  const losses = Number(row[`${prefix}Losses`] ?? 0);
  const pushes = Number(row[`${prefix}Pushes`] ?? 0);
  const passed = Number(row[`${prefix}Passes`] ?? 0);
  const quarantined = Number(row[`${prefix}Quarantined`] ?? 0);
  const graded = wins + losses;
  const confidence = wilsonConfidenceInterval(wins, losses);
  return {
    wins,
    losses,
    pushes,
    passed,
    quarantined,
    eligible: wins + losses + pushes + passed,
    graded,
    sampleSize: graded,
    accuracy: graded ? wins / graded : null,
    confidenceLow: confidence.low,
    confidenceHigh: confidence.high,
    confidenceLevel: confidence.level,
    meanAbsoluteError: nullableNumber(row[`${prefix}Mae`]),
  };
}

function tuple(row: Record<string, unknown>, prefix: "off" | "def", suffix = "") {
  return ["Ypp", "Ypa", "Ypc", "Patt", "Ratt"].map((metric) => nullableNumber(row[`${prefix}${metric}${suffix}`]) ?? (suffix ? 1 : 0)) as Profile["off"];
}

function actualGameStatProfile(row:Record<string,unknown>,side:"home"|"away"){
  const prefix=side;
  const totalYards=nullableNumber(row[`${prefix}ActualTotalYards`]);
  const passYards=nullableNumber(row[`${prefix}ActualPassYards`]);
  const rushYards=nullableNumber(row[`${prefix}ActualRushYards`]);
  const yardsPerPlay=nullableNumber(row[`${prefix}ActualYardsPerPlay`]);
  if([totalYards,passYards,rushYards,yardsPerPlay].every((value)=>value===null))return null;
  return {
    totalYards,
    yardsPerPlay,
    passYards,
    passAttempts:nullableNumber(row[`${prefix}ActualPassAttempts`]),
    passCompletions:nullableNumber(row[`${prefix}ActualPassCompletions`]),
    yardsPerPass:nullableNumber(row[`${prefix}ActualYardsPerPass`]),
    rushYards,
    rushAttempts:nullableNumber(row[`${prefix}ActualRushAttempts`]),
    yardsPerRush:nullableNumber(row[`${prefix}ActualYardsPerRush`]),
    turnovers:nullableNumber(row[`${prefix}ActualTurnovers`]),
  };
}

function parsedRecord(value:unknown){
  if(value&&typeof value==="object")return value as Record<string,unknown>;
  if(typeof value!=="string"||!value.trim())return {};
  try{
    const parsed=JSON.parse(value) as unknown;
    return parsed&&typeof parsed==="object"?parsed as Record<string,unknown>:{};
  }catch{return {};}
}

function actualGameAdvancedProfile(row:Record<string,unknown>,side:"home"|"away"){
  const component=parsedRecord(row[`${side}ActualAdvancedJson`]);
  const value=(key:string,fallback?:string)=>nullableNumber(component[key])??(fallback?nullableNumber(row[`${side}${fallback}`]):null);
  const drives=value("offDrives");
  const plays=value("offPlays");
  const points=nullableNumber(row[`${side}Points`]);
  const passAttempts=nullableNumber(row[`${side}ActualPassAttempts`]);
  const passCompletions=nullableNumber(row[`${side}ActualPassCompletions`]);
  const passYards=nullableNumber(row[`${side}ActualPassYards`]);
  const profile={
    successRate:value("offSuccessRate"),
    explosiveness:value("offExplosiveness"),
    ppa:value("offPpa"),
    pointsPerDrive:points!==null&&drives!==null&&drives>0?points/drives:null,
    playsPerDrive:plays!==null&&drives!==null&&drives>0?plays/drives:null,
    thirdDownSuccessRate:null,
    redZoneEfficiency:null,
    havocRate:value("offHavocRate"),
    lineYards:value("offLineYards","ActualLineYards"),
    secondLevelYards:value("offSecondLevelYards","ActualSecondLevelYards"),
    openFieldYards:value("offOpenFieldYards","ActualOpenFieldYards"),
    stuffRate:value("offStuffRate"),
    powerSuccess:value("offPowerSuccess"),
    rushingSuccessRate:value("offRushingSuccessRate"),
    rushingExplosiveness:value("offRushingExplosiveness"),
    rushingPpa:value("offRushingPpa"),
    completionRate:passAttempts!==null&&passCompletions!==null&&passAttempts>0?passCompletions/passAttempts:null,
    yardsPerCompletion:passYards!==null&&passCompletions!==null&&passCompletions>0?passYards/passCompletions:null,
    passingSuccessRate:value("offPassingSuccessRate","ActualPassingSuccessRate"),
    passingExplosiveness:value("offPassingExplosiveness","ActualPassingExplosiveness"),
    passingPpa:value("offPassingPpa"),
    standardDownSuccessRate:value("offStandardDownSuccessRate"),
    passingDownSuccessRate:value("offPassingDownSuccessRate"),
  };
  return Object.values(profile).every((entry)=>entry===null)?null:profile;
}

function withActualGameStats(row:Record<string,unknown>){
  const result={
    ...row,
    homeActualStats:actualGameStatProfile(row,"home"),
    awayActualStats:actualGameStatProfile(row,"away"),
    homeActualAdvanced:actualGameAdvancedProfile(row,"home"),
    awayActualAdvanced:actualGameAdvancedProfile(row,"away"),
  };
  delete result.homeActualAdvancedJson;
  delete result.awayActualAdvancedJson;
  return result;
}

function gameStatBenchmarkProfile(row:Record<string,unknown>|null){
  const sampleSize=Number(row?.benchmarkSampleSize??0);
  if(!row||sampleSize<=0)return null;
  const values=(prefix:string)=>({
    successRate:nullableNumber(row[`${prefix}SuccessRate`]),
    explosiveness:nullableNumber(row[`${prefix}Explosiveness`]),
    ppa:nullableNumber(row[`${prefix}Ppa`]),
    pointsPerDrive:nullableNumber(row[`${prefix}PointsPerDrive`]),
    playsPerDrive:nullableNumber(row[`${prefix}PlaysPerDrive`]),
    thirdDownSuccessRate:null,
    redZoneEfficiency:null,
    havocRate:nullableNumber(row[`${prefix}HavocRate`]),
    lineYards:nullableNumber(row[`${prefix}LineYards`]),
    secondLevelYards:nullableNumber(row[`${prefix}SecondLevelYards`]),
    openFieldYards:nullableNumber(row[`${prefix}OpenFieldYards`]),
    stuffRate:nullableNumber(row[`${prefix}StuffRate`]),
    powerSuccess:nullableNumber(row[`${prefix}PowerSuccess`]),
    rushingSuccessRate:nullableNumber(row[`${prefix}RushingSuccessRate`]),
    rushingExplosiveness:nullableNumber(row[`${prefix}RushingExplosiveness`]),
    rushingPpa:nullableNumber(row[`${prefix}RushingPpa`]),
    completionRate:nullableNumber(row[`${prefix}CompletionRate`]),
    yardsPerCompletion:nullableNumber(row[`${prefix}YardsPerCompletion`]),
    passingSuccessRate:nullableNumber(row[`${prefix}PassingSuccessRate`]),
    passingExplosiveness:nullableNumber(row[`${prefix}PassingExplosiveness`]),
    passingPpa:nullableNumber(row[`${prefix}PassingPpa`]),
    standardDownSuccessRate:nullableNumber(row[`${prefix}StandardDownSuccessRate`]),
    passingDownSuccessRate:nullableNumber(row[`${prefix}PassingDownSuccessRate`]),
  });
  return {
    firstSeason:Number(row.benchmarkFirstSeason),
    lastSeason:Number(row.benchmarkLastSeason),
    sampleSize,
    basic:{
      totalYards:nullableNumber(row.benchmarkTotalYards),
      yardsPerPlay:nullableNumber(row.benchmarkYardsPerPlay),
      passYards:nullableNumber(row.benchmarkPassYards),
      passAttempts:nullableNumber(row.benchmarkPassAttempts),
      passCompletions:nullableNumber(row.benchmarkPassCompletions),
      yardsPerPass:nullableNumber(row.benchmarkYardsPerPass),
      rushYards:nullableNumber(row.benchmarkRushYards),
      rushAttempts:nullableNumber(row.benchmarkRushAttempts),
      yardsPerRush:nullableNumber(row.benchmarkYardsPerRush),
      turnovers:nullableNumber(row.benchmarkTurnovers),
    },
    advanced:values("benchmark"),
  };
}

function projectedGameStatProfile(stats:{ypp:number;ypa:number;ypc:number;patt:number;ratt:number}){
  const plays=Math.max(0,stats.patt)+Math.max(0,stats.ratt);
  return {
    totalYards:stats.ypp*plays,
    yardsPerPlay:stats.ypp,
    passYards:stats.ypa*stats.patt,
    passAttempts:stats.patt,
    passCompletions:null,
    yardsPerPass:stats.ypa,
    rushYards:stats.ypc*stats.ratt,
    rushAttempts:stats.ratt,
    yardsPerRush:stats.ypc,
    turnovers:null,
  };
}

function projectedGameAdvancedProfile(advanced:AdvancedSideProjection|null|undefined){
  if(!advanced)return null;
  return {
    successRate:advanced.overall.successRate,
    explosiveness:advanced.overall.explosiveness,
    ppa:advanced.overall.ppa,
    pointsPerDrive:advanced.overall.pointsPerDrive,
    playsPerDrive:advanced.overall.playsPerDrive,
    thirdDownSuccessRate:advanced.overall.thirdDownSuccessRate,
    redZoneEfficiency:advanced.overall.redZoneEfficiency,
    havocRate:advanced.overall.havocRate,
    lineYards:advanced.run.lineYards,
    secondLevelYards:advanced.run.secondLevelYards,
    openFieldYards:advanced.run.openFieldYards,
    stuffRate:advanced.run.stuffRate,
    powerSuccess:advanced.run.powerSuccess,
    rushingSuccessRate:advanced.run.rushingSuccessRate,
    rushingExplosiveness:advanced.run.rushingExplosiveness,
    rushingPpa:advanced.run.rushingPpa,
    completionRate:advanced.pass.completionRate,
    yardsPerCompletion:advanced.pass.yardsPerCompletion,
    passingSuccessRate:advanced.pass.passingSuccessRate,
    passingExplosiveness:advanced.pass.passingExplosiveness,
    passingPpa:advanced.pass.passingPpa,
    standardDownSuccessRate:advanced.pass.standardDownSuccessRate,
    passingDownSuccessRate:advanced.pass.passingDownSuccessRate,
  };
}

function rankingProfiles(rows: Record<string, unknown>[]): RankingProfile[] {
  return rows.map((row) => ({
    ...(row as unknown as RankingProfile),
    advanced: parseAdvancedProfile(row.advancedProfile),
  }));
}

async function freshPreseasonRows(db:D1Database, season:number, preloadedProfiles?:Profile[]) {
  const [teams,inputs] = await Promise.all([
    db.prepare(`SELECT team,team_id AS teamId,abbreviation,mascot,conference,color,alt_color AS altColor,logo
      FROM cfb_teams WHERE season=? ORDER BY team`).bind(season).all<Record<string, unknown>>(),
    db.prepare(`SELECT team,returning_ppa AS returningPpa,returning_passing_ppa AS returningPassingPpa,
      returning_receiving_ppa AS returningReceivingPpa,returning_rushing_ppa AS returningRushingPpa,
      returning_usage AS returningUsage,returning_passing_usage AS returningPassingUsage,
      returning_receiving_usage AS returningReceivingUsage,returning_rushing_usage AS returningRushingUsage,
      recruiting_rank AS recruitingRank,recruiting_points AS recruitingPoints
      FROM preseason_inputs WHERE season=?`).bind(season).all<Record<string, unknown>>(),
  ]);
  const eligibleTeams = new Set(teams.results.map((row)=>String(row.team)));
  const metadata = new Map(teams.results.map((row)=>[String(row.team),row]));
  const priors = new Map(inputs.results.map((row)=>[String(row.team),row]));
  const profiles = preloadedProfiles??await loadPreseasonProfiles(db,season,eligibleTeams);
  return profiles.map((profile) => ({
    season,week:0,team:profile.team,gamesPlayed:0,...metadata.get(profile.team),...priors.get(profile.team),
    offYpp:profile.off[0],offYpa:profile.off[1],offYpc:profile.off[2],offPatt:profile.off[3],offRatt:profile.off[4],
    defYpp:profile.def[0],defYpa:profile.def[1],defYpc:profile.def[2],defPatt:profile.def[3],defRatt:profile.def[4],
    offYppIndex:profile.oi[0],offYpaIndex:profile.oi[1],offYpcIndex:profile.oi[2],offPattIndex:profile.oi[3],offRattIndex:profile.oi[4],
    defYppIndex:profile.di[0],defYpaIndex:profile.di[1],defYpcIndex:profile.di[2],defPattIndex:profile.di[3],defRattIndex:profile.di[4],
    advancedProfile:profile.advanced ?? null,
    preseasonElo:profile.preseasonElo ?? 1500,
    transitionDiagnostic:profile.transitionDiagnostic ?? null,
  }));
}

/**
 * Returns one profile per current FBS team at the requested point in time.
 * Weekly refreshes only contain teams that played, so sparse in-season rows
 * must be layered over the complete Week 0 preseason field.
 */
async function loadPointInTimeProfileRows(db:D1Database,season:number,effectiveWeek:number):Promise<Record<string,unknown>[]> {
  if(effectiveWeek<=0)return freshPreseasonRows(db,season);

  const [weeklyResult,teamCountRow]=await Promise.all([
    db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
        wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
        wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
        wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
        wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
        ap.profile_json AS advancedProfile,
        pi.returning_ppa AS returningPpa,pi.returning_passing_ppa AS returningPassingPpa,
        pi.returning_receiving_ppa AS returningReceivingPpa,pi.returning_rushing_ppa AS returningRushingPpa,
        pi.returning_usage AS returningUsage,pi.returning_passing_usage AS returningPassingUsage,
        pi.returning_receiving_usage AS returningReceivingUsage,pi.returning_rushing_usage AS returningRushingUsage,
        pi.recruiting_rank AS recruitingRank,pi.recruiting_points AS recruitingPoints,
        t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo
      FROM weekly_profiles wp
      LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
      LEFT JOIN preseason_inputs pi ON pi.season=wp.season AND pi.team=wp.team
      LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
      WHERE wp.season=? AND ${latestTeamProfileAtOrBeforeWeekSql}
      ORDER BY wp.team`).bind(season,effectiveWeek).all<Record<string,unknown>>(),
    db.prepare("SELECT COUNT(*) AS count FROM cfb_teams WHERE season=?").bind(season).first<{count:number}>(),
  ]);
  const weeklyRows=weeklyResult.results;
  const eligibleTeamCount=Number(teamCountRow?.count??0);
  if(eligibleTeamCount>0&&weeklyRows.length>=eligibleTeamCount)return weeklyRows;

  const preseasonRows=await freshPreseasonRows(db,season);
  const candidates=[...preseasonRows,...weeklyRows].map((row)=>({
    ...row,
    team:String(row.team??""),
    week:Number(row.week??0),
  }));
  return latestTeamProfilesAtOrBeforeWeek(candidates,effectiveWeek);
}

async function attachPreseasonTransitionElo(db:D1Database,season:number,rows:Record<string,unknown>[]){
  if(!rows.length)return rows;
  if(rows.every((row)=>row.preseasonElo!==null&&row.preseasonElo!==undefined&&Number.isFinite(Number(row.preseasonElo))))return rows;
  const eligibleTeams=new Set(rows.map((row)=>String(row.team)).filter(Boolean));
  const preseason=await loadPreseasonProfiles(db,season,eligibleTeams);
  const byTeam=new Map(preseason.map((profile)=>[profile.team,profile]));
  return rows.map((row)=>{
    const profile=byTeam.get(String(row.team));
    return{
      ...row,
      preseasonElo:profile?.preseasonElo??row.preseasonElo??1500,
      transitionDiagnostic:profile?.transitionDiagnostic??row.transitionDiagnostic??null,
    };
  });
}

async function preseasonBacktestDataset(db:D1Database,currentSeason:number){
  const firstSeason=Math.max(FIRST_HISTORICAL_SEASON,currentSeason-12);
  const [profileResult,inputResult,teamResult,gameResult]=await Promise.all([
    db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
        wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
        wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
        wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
        wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
        ap.profile_json AS advancedProfile
      FROM weekly_profiles wp JOIN (
        SELECT season,team,MAX(week) AS week FROM weekly_profiles
        WHERE season>=? AND season<? AND week>0 GROUP BY season,team
      ) latest ON latest.season=wp.season AND latest.team=wp.team AND latest.week=wp.week
      LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.team=wp.team AND ap.week=wp.week
      WHERE wp.season>=? AND wp.season<? ORDER BY wp.season,wp.team`)
      .bind(firstSeason,currentSeason,firstSeason,currentSeason).all<Record<string,unknown>>(),
    db.prepare(`SELECT season,team,conference,returning_ppa AS returningPpa,returning_passing_ppa AS returningPassingPpa,
        returning_receiving_ppa AS returningReceivingPpa,returning_rushing_ppa AS returningRushingPpa,returning_usage AS returningUsage,
        returning_passing_usage AS returningPassingUsage,returning_receiving_usage AS returningReceivingUsage,returning_rushing_usage AS returningRushingUsage,
        recruiting_rank AS recruitingRank,recruiting_points AS recruitingPoints
      FROM preseason_inputs WHERE season>=? AND season<=? ORDER BY season,team`)
      .bind(firstSeason,currentSeason).all<Record<string,unknown>>(),
    db.prepare("SELECT season,team FROM cfb_teams WHERE season>=? AND season<=? ORDER BY season,team")
      .bind(firstSeason,currentSeason).all<{season:number;team:string}>(),
    db.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,start_date AS startDate,neutral_site AS neutralSite,
        home_team AS homeTeam,home_points AS homePoints,away_team AS awayTeam,away_points AS awayPoints
      FROM cfb_games WHERE season>=? AND season<? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL
      ORDER BY season,CASE WHEN season_type='postseason' THEN 1 ELSE 0 END,week,start_date,game_id`)
      .bind(firstSeason,currentSeason).all<Record<string,unknown>>(),
  ]);
  const profiles=(profileResult.results as Record<string,unknown>[]).map((row):PreseasonTransitionProfile=>({
    season:Number(row.season),week:Number(row.week),team:String(row.team),gamesPlayed:Number(row.gamesPlayed??0),
    off:tuple(row,"off") as PreseasonMetricTuple,def:tuple(row,"def") as PreseasonMetricTuple,
    oi:tuple(row,"off","Index") as PreseasonMetricTuple,di:tuple(row,"def","Index") as PreseasonMetricTuple,advanced:parseAdvancedProfile(row.advancedProfile),
  }));
  const profilesBySeason=new Map<number,Map<string,PreseasonTransitionProfile>>();
  for(const profile of profiles){
    const rows=profilesBySeason.get(profile.season)??new Map<string,PreseasonTransitionProfile>();
    rows.set(profile.team,profile);profilesBySeason.set(profile.season,rows);
  }
  const inputs=(inputResult.results as Record<string,unknown>[]).map((row):PreseasonTransitionInput=>({
    season:Number(row.season),team:String(row.team),conference:row.conference?String(row.conference):null,
    returningPpa:nullableNumber(row.returningPpa),returningPassingPpa:nullableNumber(row.returningPassingPpa),
    returningReceivingPpa:nullableNumber(row.returningReceivingPpa),returningRushingPpa:nullableNumber(row.returningRushingPpa),
    returningUsage:nullableNumber(row.returningUsage),returningPassingUsage:nullableNumber(row.returningPassingUsage),
    returningReceivingUsage:nullableNumber(row.returningReceivingUsage),returningRushingUsage:nullableNumber(row.returningRushingUsage),
    recruitingRank:nullableNumber(row.recruitingRank),recruitingPoints:nullableNumber(row.recruitingPoints),
  }));
  const inputsBySeason=new Map<number,PreseasonTransitionInput[]>();
  for(const input of inputs){const rows=inputsBySeason.get(input.season)??[];rows.push(input);inputsBySeason.set(input.season,rows);}
  const teamsBySeason=new Map<number,string[]>();
  for(const row of teamResult.results){const rows=teamsBySeason.get(Number(row.season))??[];rows.push(String(row.team));teamsBySeason.set(Number(row.season),rows);}
  const games=(gameResult.results as Record<string,unknown>[]).map((row):PreseasonBacktestGame=>({
    gameId:String(row.gameId),season:Number(row.season),week:Number(row.week),seasonType:String(row.seasonType??"regular"),
    startDate:row.startDate?String(row.startDate):null,neutralSite:Boolean(row.neutralSite),homeTeam:String(row.homeTeam),homePoints:Number(row.homePoints),
    awayTeam:String(row.awayTeam),awayPoints:Number(row.awayPoints),
  }));
  const gamesBySeason=new Map<number,PreseasonBacktestGame[]>();
  for(const game of games){const rows=gamesBySeason.get(game.season)??[];rows.push(game);gamesBySeason.set(game.season,rows);}
  const finalEloBySeason=new Map<number,Map<string,number>>();
  for(let season=firstSeason;season<currentSeason;season+=1){
    finalEloBySeason.set(season,calculateFinalEloRatings(gamesBySeason.get(season)??[],teamsBySeason.get(season)??[],modelCalibration.eloK));
  }
  const buildSeason=(season:number):PreseasonBacktestSeason=>{
    const teams=teamsBySeason.get(season)??[];
    const eligible=new Set(teams);
    const historyByTeam=new Map<string,PreseasonHistoryRow[]>();
    for(const team of teams){
      const history:PreseasonHistoryRow[]=[];
      for(let prior=season-1;prior>=Math.max(firstSeason,season-4);prior-=1){
        const profile=profilesBySeason.get(prior)?.get(team);
        if(profile)history.push({season:prior,profile,finalElo:finalEloBySeason.get(prior)?.get(team)??1500});
      }
      historyByTeam.set(team,history);
    }
    return{
      season,teams,historyByTeam,inputs:inputsBySeason.get(season)??[],
      games:(gamesBySeason.get(season)??[]).filter((game)=>game.seasonType!=="postseason"&&eligible.has(game.homeTeam)&&eligible.has(game.awayTeam)),
      finalProfiles:profilesBySeason.get(season)??new Map<string,PreseasonTransitionProfile>(),
      finalEloByTeam:finalEloBySeason.get(season)??new Map<string,number>(),
    };
  };
  const completedSeasons=[] as PreseasonBacktestSeason[];
  for(let season=Math.max(firstSeason+4,2018);season<currentSeason;season+=1){
    const row=buildSeason(season);
    if(row.games.length&&row.finalProfiles.size)completedSeasons.push(row);
  }
  return{seasons:completedSeasons,currentSeason:teamsBySeason.has(currentSeason)?buildSeason(currentSeason):null};
}

function schedulePregameRanks(season:number,scheduleRows:Record<string,unknown>[],profileRows:Record<string,unknown>[],seasonGames:Record<string,unknown>[]){
  const result=new Map<string,{homePregameRank:number|null;awayPregameRank:number|null;rankingWeek:number|null}>();
  if(!profileRows.length)return result;
  const profileWeeks=[...new Set(profileRows.map((row)=>Number(row.week)).filter(Number.isFinite))].sort((left,right)=>left-right);
  const maxProfileWeek=profileWeeks.at(-1)??0;
  const rankingsByWeek=new Map<number,Map<string,number>>();
  const simulationSchedule=seasonGames.map((game):SimulationScheduleGame=>({
    gameId:String(game.gameId),week:Number(game.week),startDate:game.startDate?String(game.startDate):null,
    seasonType:String(game.seasonType??"regular"),completed:Boolean(game.completed),neutralSite:Boolean(game.neutralSite),conferenceGame:Boolean(game.conferenceGame),
    homeTeam:String(game.homeTeam),homeConference:game.homeConference?String(game.homeConference):null,homePoints:game.homePoints===null||game.homePoints===undefined?null:Number(game.homePoints),
    awayTeam:String(game.awayTeam),awayConference:game.awayConference?String(game.awayConference):null,awayPoints:game.awayPoints===null||game.awayPoints===undefined?null:Number(game.awayPoints),
  }));
  for(const row of scheduleRows){
    const requestedRankingWeek=String(row.seasonType??"regular")==="postseason"
      ?maxProfileWeek
      :scoreRankingSnapshotWeek(Number(row.week??0),maxProfileWeek);
    const rankingWeek=[...profileWeeks].reverse().find((candidate)=>candidate<=requestedRankingWeek);
    if(rankingWeek===undefined){
      result.set(String(row.gameId),{homePregameRank:null,awayPregameRank:null,rankingWeek:null});
      continue;
    }
    let teamRanks=rankingsByWeek.get(rankingWeek);
    if(!teamRanks){
      const profiles=rankingProfiles(latestTeamProfilesAtOrBeforeWeek(
        profileRows.map((profile)=>({...profile,team:String(profile.team),week:Number(profile.week)})),
        rankingWeek,
      ));
      const projection=buildSeasonSimulation(season,rankingWeek,rankingWeek,simulationSchedule,profiles);
      teamRanks=new Map(projection.rankings.map((entry)=>[entry.team,entry.rank]));
      rankingsByWeek.set(rankingWeek,teamRanks);
    }
    result.set(String(row.gameId),{
      homePregameRank:teamRanks.get(String(row.homeTeam))??null,
      awayPregameRank:teamRanks.get(String(row.awayTeam))??null,
      rankingWeek,
    });
  }
  return result;
}

type WinConditionSnapshot = {
  season:number;
  requestedWeek:number;
  effectiveWeek:number;
  rows:Record<string,unknown>[];
  byTeam:Map<string,Record<string,unknown>>;
};

/**
 * Loads the same point-in-time profile, opponent proof and outcome rating used
 * by Matchup Lab. Completed games after the selected snapshot are deliberately
 * excluded so historical Win Conditions cannot see the future.
 */
async function winConditionSnapshot(db:D1Database,season:number,requestedWeek:number):Promise<WinConditionSnapshot>{
  const effective=await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?")
    .bind(season,requestedWeek).first<{week:number|null}>();
  const effectiveWeek=effective?.week??0;
  const profileRows=await loadPointInTimeProfileRows(db,season,effectiveWeek);
  const finalContext=requestedWeek===16&&effectiveWeek>0;
  const games=(await db.prepare(finalContext
    ?`SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,conference_game AS conferenceGame,
        home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
      FROM cfb_games WHERE season=? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY start_date,game_id`
    :`SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,conference_game AS conferenceGame,
        home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
      FROM cfb_games WHERE season=? AND completed=1 AND season_type<>'postseason' AND week<=? AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY week,start_date,game_id`)
    .bind(...(finalContext?[season]:[season,effectiveWeek])).all<RankingGame & {seasonType:string}>()).results;
  const championshipIds=conferenceChampionshipGameIds(games);
  const rankingGames=games.map((game)=>({...game,conferenceChampionship:championshipIds.has(game.gameId)}));
  const rankings=buildBcsRankings(rankingGames,rankingProfiles(profileRows));
  const evidence=new Map(rankings.map((row)=>[row.team,row]));
  const rows=profileRows.map((row)=>{
    const ranking=evidence.get(String(row.team));
    return {
      ...row,
      advancedProfile:parseAdvancedProfile(row.advancedProfile),
      eloRating:effectiveWeek===0?Number(row.preseasonElo??1500):ranking?.eloRating??1500,
      outcomeRating:effectiveWeek===0?Number(row.preseasonElo??1500):finalContext&&ranking?finalMatchupRating(ranking,rankingGames,String(row.team)):ranking?.eloRating??1500,
      scheduleStrength:ranking?.scheduleStrength??0.5,
      bestOpponentStrength:ranking?.bestOpponentStrength??0.5,
      qualityWinStrength:ranking?.qualityWinStrength??0.5,
      matchupReliability:ranking?.matchupReliability??1,
      record:ranking?.record??(effectiveWeek===0?"0-0":"—"),
      resultsRank:ranking?.rank??null,
    };
  });
  return{season,requestedWeek,effectiveWeek,rows,byTeam:new Map(rows.map((row)=>[String(row.team),row]))};
}

function snapshotEngineTeam(row:Record<string,unknown>){
  return {
    team:String(row.team),
    offense:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex].map(Number),
    defense:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex].map(Number),
    evidence:{
      gamesPlayed:Number(row.gamesPlayed??0),
      scheduleStrength:Number(row.scheduleStrength??0.5),
      bestOpponentStrength:Number(row.bestOpponentStrength??0.5),
      qualityWinStrength:Number(row.qualityWinStrength??0.5),
      reliability:Number(row.matchupReliability??1),
    },
    advanced:parseAdvancedProfile(row.advancedProfile),
    outcomeRating:Number(row.outcomeRating??row.eloRating??1500),
  };
}

function winConditionProjectionWithEdges(
  projection:ReturnType<typeof project>,
  homeTeam:string,
  awayTeam:string,
  neutralSite:boolean,
):WinConditionProjection{
  const edgeAnalysis=analyzeMatchupEdges(
    homeTeam,awayTeam,projection.calibratedHome.offense,projection.calibratedHome.defense,
    projection.calibratedAway.offense,projection.calibratedAway.defense,neutralSite,projection.margin,
    projection.homeStats.advanced,projection.awayStats.advanced,
    projection.calibratedHome.advanced,projection.calibratedAway.advanced,
    projection.homeStats.scoreReceipt,projection.awayStats.scoreReceipt,
    projection.homeStats.viability,projection.awayStats.viability,
  );
  return{...projection,edgeAnalysis};
}

/**
 * Complete game rows are the sampling unit. Pulling the full vector from one
 * real team-game preserves the observed covariance among efficiency,
 * explosiveness, disruption, turnovers, pace and scoring.
 */
async function winConditionHistoricalSamples(db:D1Database,team:string,season:number,week:number):Promise<WinConditionHistoricalSample[]>{
  const firstSeason=Math.max(FIRST_HISTORICAL_SEASON,season-3);
  const result=await db.prepare(`SELECT stats.game_id AS gameId,stats.season,stats.week,stats.points,opponent_stats.points AS opponentPoints,
      stats.yards_per_pass AS yardsPerPass,stats.yards_per_rush AS yardsPerRush,
      opponent_stats.turnovers-stats.turnovers AS turnoverMargin,
      CAST(json_extract(advanced.component_json,'$.offSuccessRate') AS REAL) AS successRate,
      COALESCE(CAST(json_extract(advanced.component_json,'$.offPassingExplosiveness') AS REAL),advanced.off_passing_explosiveness) AS passingExplosiveness,
      CAST(json_extract(advanced.component_json,'$.offRushingExplosiveness') AS REAL) AS rushingExplosiveness,
      CAST(json_extract(advanced.component_json,'$.offHavocRate') AS REAL) AS havocAllowed,
      CAST(json_extract(advanced.component_json,'$.defHavocRate') AS REAL) AS havocCreated,
      CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL) AS possessions,
      CASE WHEN CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL)>0
        THEN stats.points*1.0/CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL) END AS pointsPerDrive
    FROM team_game_stats stats
    JOIN cfb_games game ON game.game_id=stats.game_id AND game.completed=1
    JOIN team_game_stats opponent_stats ON opponent_stats.game_id=stats.game_id AND opponent_stats.team=stats.opponent
    JOIN cfb_teams opponent_team ON opponent_team.season=stats.season AND opponent_team.team=stats.opponent
    LEFT JOIN team_game_advanced_stats advanced ON advanced.game_id=stats.game_id AND advanced.team=stats.team
    WHERE stats.team=? AND stats.season BETWEEN ? AND ?
      AND (stats.season<? OR (stats.season=? AND (?=16 OR (LOWER(COALESCE(game.season_type,'regular'))<>'postseason' AND stats.week<=?))))
    ORDER BY stats.season DESC,CASE WHEN game.start_date IS NULL THEN 1 ELSE 0 END,game.start_date DESC,stats.week DESC
    LIMIT 64`).bind(team,firstSeason,season,season,season,week,week).all<Record<string,unknown>>();
  return result.results.map((row)=>({
    gameId:String(row.gameId),season:Number(row.season),week:Number(row.week),
    successRate:nullableNumber(row.successRate),yardsPerPass:nullableNumber(row.yardsPerPass),yardsPerRush:nullableNumber(row.yardsPerRush),
    passingExplosiveness:nullableNumber(row.passingExplosiveness),rushingExplosiveness:nullableNumber(row.rushingExplosiveness),
    havocAllowed:nullableNumber(row.havocAllowed),havocCreated:nullableNumber(row.havocCreated),pointsPerDrive:nullableNumber(row.pointsPerDrive),
    possessions:nullableNumber(row.possessions),turnoverMargin:nullableNumber(row.turnoverMargin),points:nullableNumber(row.points),opponentPoints:nullableNumber(row.opponentPoints),
  }));
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as CloudflareEnv;
  if (!runtime.DB) return Response.json({ source: "embedded", configured: false, rows: [] });

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "profiles";
  const currentSeason = currentCollegeFootballSeason();
  const season = numberParam(url, "season", currentSeason, FIRST_HISTORICAL_SEASON, currentSeason);
  const requestedWeek = numberParam(url, "week", 16, 0, 16);
  const team = (url.searchParams.get("team")?.trim() ?? "").slice(0, 100);
  const conference = (url.searchParams.get("conference")?.trim() ?? "").slice(0, 100);
  const homeTeam = (url.searchParams.get("homeTeam")?.trim() ?? "").slice(0, 100);
  const awayTeam = (url.searchParams.get("awayTeam")?.trim() ?? "").slice(0, 100);
  const awaySeason = numberParam(url, "awaySeason", season, FIRST_HISTORICAL_SEASON, currentSeason);
  const awayWeek = numberParam(url, "awayWeek", requestedWeek, 0, 16);
  const gameId = (url.searchParams.get("gameId")?.trim() ?? "").slice(0, 100);
  const neutralSite = url.searchParams.get("neutralSite") === "1";
  const winConditionSimulationCount = numberParam(url,"simulations",1600,400,5000);
  const includeAnalysis = url.searchParams.get("includeAnalysis") === "1";
  const includeGameProfiles = includeAnalysis || url.searchParams.get("includeGameProfiles") === "1";
  const includeGameTimeRanks = url.searchParams.get("includeGameTimeRanks") === "1";
  const includeMarketDecisions = url.searchParams.get("includeMarketDecisions") === "1";
  const compactSchedule = url.searchParams.get("compactSchedule") === "1";
  const accuracyScope = url.searchParams.get("scope") === "all" ? "all" : "qualified";
  const scenarioOverrides=simulationGameOverrides(url);
  const db = runtime.DB;

  try {
    if (view === "status") {
      const snapshots = await db.prepare("SELECT season,week,team_count AS teamCount,game_count AS gameCount,completed_game_count AS completedGameCount,source,model_version AS modelVersion,created_at AS createdAt FROM model_snapshots ORDER BY season DESC,week DESC").all();
      const latestRun = await db.prepare("SELECT season,week,source,status,game_count AS gameCount,detail,created_at AS createdAt FROM refresh_runs ORDER BY id DESC LIMIT 1").first();
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), snapshots: snapshots.results, latestRun });
    }

    if(view==="preseason-transition-backtest"){
      const dataset=await preseasonBacktestDataset(db,currentSeason);
      const report=runPreseasonTransitionBacktest({
        seasons:dataset.seasons,
        currentSeason:dataset.currentSeason,
        baselines:[5.6,7.3,4.4,30.9,35.8],
      });
      const response=Response.json({source:"database",generatedAt:new Date().toISOString(),...report});
      response.headers.set("cache-control","public, max-age=3600, stale-while-revalidate=21600");
      return response;
    }

    if(view==="win-conditions"){
      if(gameId){
        const gameRow=await db.prepare(`SELECT g.game_id AS gameId,g.season,g.week,g.season_type AS seasonType,g.start_date AS startDate,g.completed,g.neutral_site AS neutralSite,
            g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
            ht.logo AS homeLogo,at.logo AS awayLogo,p.generated_from_week AS generatedFromWeek,p.home_score AS predictedHomeScore,p.away_score AS predictedAwayScore,
            p.home_win_probability AS storedHomeWinProbability,p.model_home_spread AS storedModelHomeSpread,p.model_total AS storedModelTotal,p.model_version AS storedModelVersion
          FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id
          LEFT JOIN cfb_teams ht ON ht.season=g.season AND ht.team=g.home_team LEFT JOIN cfb_teams at ON at.season=g.season AND at.team=g.away_team
          WHERE g.season=? AND g.game_id=? LIMIT 1`).bind(season,gameId).first<Record<string,unknown>>();
        if(!gameRow)return Response.json({source:"database",analysis:null,message:"That game is not available."},{status:404});
        const [profileResult,gameResult,teamResult]=await Promise.all([
          db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
              wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
              wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
              wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
              wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
              ap.profile_json AS advancedProfile
            FROM weekly_profiles wp LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
            WHERE wp.season=? ORDER BY wp.week,wp.team`).bind(season).all<Record<string,unknown>>(),
          db.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,start_date AS startDate,completed,neutral_site AS neutralSite,conference_game AS conferenceGame,venue,
              home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
            FROM cfb_games WHERE season=? ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date,season_type,week,game_id`).bind(season).all<Record<string,unknown>>(),
          db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{team:string}>(),
        ]);
        const storedProfiles=profileResult.results.map((row):Profile=>({
          season:Number(row.season),week:Number(row.week),team:String(row.team),gamesPlayed:Number(row.gamesPlayed??0),
          off:tuple(row,"off"),def:tuple(row,"def"),oi:tuple(row,"off","Index"),di:tuple(row,"def","Index"),advanced:parseAdvancedProfile(row.advancedProfile),
        }));
        const games=gameResult.results.map((row):NormalizedGame=>({
          id:String(row.gameId),season:Number(row.season),week:Number(row.week),seasonType:String(row.seasonType??"regular"),startDate:row.startDate?String(row.startDate):null,
          completed:Boolean(row.completed),neutralSite:Boolean(row.neutralSite),conferenceGame:Boolean(row.conferenceGame),venue:row.venue?String(row.venue):null,
          homeTeam:String(row.homeTeam),homeConference:row.homeConference?String(row.homeConference):null,homePoints:nullableNumber(row.homePoints),
          awayTeam:String(row.awayTeam),awayConference:row.awayConference?String(row.awayConference):null,awayPoints:nullableNumber(row.awayPoints),
        }));
        const game=games.find((candidate)=>candidate.id===gameId);
        if(!game)return Response.json({source:"database",analysis:null,message:"That game could not be reconstructed."},{status:404});
        const eligibleTeams=new Set(teamResult.results.map((row)=>row.team));
        const freshPreseasonProfiles=await loadPreseasonProfiles(db,season,eligibleTeams);
        const profiles=[...freshPreseasonProfiles,...storedProfiles.filter((profile)=>profile.week>0)];
        const eloSnapshots=buildPregameElo(games,profiles.filter((profile)=>profile.week===0),eligibleTeams);
        const pregameElo=eloSnapshots.get(game.id);
        const pregameEvidence=buildPregameMatchupEvidence(games,eloSnapshots,eligibleTeams).get(game.id);
        const maxProfileWeek=Math.max(0,...profiles.map((profile)=>profile.week));
        const generatedFromWeek=nullableNumber(gameRow.generatedFromWeek)??(game.seasonType==="postseason"?maxProfileWeek:Math.max(0,game.week-1));
        const calibrated=project(
          latestProfile(profiles,game.homeTeam,generatedFromWeek),latestProfile(profiles,game.awayTeam,generatedFromWeek),game.neutralSite,
          pregameElo?.get(game.homeTeam)??(eligibleTeams.has(game.homeTeam)?1500:modelCalibration.fcsElo),
          pregameElo?.get(game.awayTeam)??(eligibleTeams.has(game.awayTeam)?1500:modelCalibration.fcsElo),
          pregameEvidence?.get(game.homeTeam),pregameEvidence?.get(game.awayTeam),
          {homeIsFcs:!eligibleTeams.has(game.homeTeam),awayIsFcs:!eligibleTeams.has(game.awayTeam)},
        );
        let projection=winConditionProjectionWithEdges(calibrated,game.homeTeam,game.awayTeam,game.neutralSite);
        const storedCurrent=String(gameRow.storedModelVersion??"")===MODEL_VERSION;
        const storedHomeScore=nullableNumber(gameRow.predictedHomeScore),storedAwayScore=nullableNumber(gameRow.predictedAwayScore);
        const storedSpread=nullableNumber(gameRow.storedModelHomeSpread),storedTotal=nullableNumber(gameRow.storedModelTotal),storedWin=nullableNumber(gameRow.storedHomeWinProbability);
        if(storedCurrent&&storedHomeScore!==null&&storedAwayScore!==null){
          projection={...projection,homeScore:storedHomeScore,awayScore:storedAwayScore,margin:storedSpread===null?storedHomeScore-storedAwayScore:-storedSpread,
            homeWinProbability:storedWin??projection.homeWinProbability,modelHomeSpread:storedSpread??projection.modelHomeSpread,modelTotal:storedTotal??projection.modelTotal};
        }
        const [homeSamples,awaySamples]=await Promise.all([
          winConditionHistoricalSamples(db,game.homeTeam,season,generatedFromWeek),
          winConditionHistoricalSamples(db,game.awayTeam,season,generatedFromWeek),
        ]);
        const analysis=buildWinConditionAnalysis({homeTeam:game.homeTeam,awayTeam:game.awayTeam,homeWeek:generatedFromWeek,awayWeek:generatedFromWeek,
          neutralSite:game.neutralSite,projection,homeSamples,awaySamples,simulationCount:winConditionSimulationCount,seed:`game:${game.id}:${MODEL_VERSION}`});
        const response=Response.json({source:"database",modelVersion:MODEL_VERSION,gameId:game.id,season,requestedWeek:game.week,effectiveWeek:generatedFromWeek,
          teams:{home:{team:game.homeTeam,conference:gameRow.homeConference??null,logo:gameRow.homeLogo??null},away:{team:game.awayTeam,conference:gameRow.awayConference??null,logo:gameRow.awayLogo??null}},analysis});
        response.headers.set("cache-control","public, max-age=900, stale-while-revalidate=3600");
        return response;
      }

      if(!homeTeam||!awayTeam||(homeTeam===awayTeam&&season===awaySeason&&requestedWeek===awayWeek)){
        return Response.json({source:"database",analysis:null,message:"Choose two distinct team-season snapshots."},{status:400});
      }
      const homeSnapshotPromise=winConditionSnapshot(db,season,requestedWeek);
      const awaySnapshotPromise=season===awaySeason&&requestedWeek===awayWeek?homeSnapshotPromise:winConditionSnapshot(db,awaySeason,awayWeek);
      const [homeSnapshot,awaySnapshot]=await Promise.all([homeSnapshotPromise,awaySnapshotPromise]);
      const homeRow=homeSnapshot.byTeam.get(homeTeam),awayRow=awaySnapshot.byTeam.get(awayTeam);
      if(!homeRow||!awayRow)return Response.json({source:"database",analysis:null,message:"A selected team does not have a model profile at that snapshot."},{status:404});
      const projection=projectMatchupEngine(snapshotEngineTeam(homeRow),snapshotEngineTeam(awayRow),neutralSite);
      const [homeSamples,awaySamples]=await Promise.all([
        winConditionHistoricalSamples(db,homeTeam,season,homeSnapshot.effectiveWeek),
        winConditionHistoricalSamples(db,awayTeam,awaySeason,awaySnapshot.effectiveWeek),
      ]);
      const analysis=buildWinConditionAnalysis({homeTeam,awayTeam,homeWeek:homeSnapshot.effectiveWeek,awayWeek:awaySnapshot.effectiveWeek,neutralSite,
        projection,homeSamples,awaySamples,simulationCount:winConditionSimulationCount,seed:`lab:${season}:${homeSnapshot.effectiveWeek}:${homeTeam}:${awaySeason}:${awaySnapshot.effectiveWeek}:${awayTeam}:${neutralSite}:${MODEL_VERSION}`});
      const teamIdentity=(row:Record<string,unknown>,snapshot:WinConditionSnapshot)=>({
        team:String(row.team),season:snapshot.season,requestedWeek:snapshot.requestedWeek,effectiveWeek:snapshot.effectiveWeek,
        abbreviation:row.abbreviation??null,conference:row.conference??null,logo:row.logo??null,record:row.record??"—",resultsRank:row.resultsRank??null,
      });
      const response=Response.json({source:"database",modelVersion:MODEL_VERSION,teams:{home:teamIdentity(homeRow,homeSnapshot),away:teamIdentity(awayRow,awaySnapshot)},analysis});
      response.headers.set("cache-control","public, max-age=900, stale-while-revalidate=3600");
      return response;
    }

    if (view === "matchup-context") {
      if (!homeTeam || !awayTeam || homeTeam === awayTeam) {
        return Response.json({ source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,rows:[],message:"Two different teams are required." },{status:400});
      }
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season,requestedWeek).first<{week:number|null}>();
      const effectiveWeek=effective?.week??0;
      const profilePromise=loadPointInTimeProfileRows(db,season,effectiveWeek);
      const [profileRows,gameRows,teamRows]=await Promise.all([
        profilePromise,
        db.prepare(`SELECT s.game_id AS gameId,s.week,g.season_type AS seasonType,g.start_date AS startDate,g.neutral_site AS neutralSite,
            g.home_team AS homeTeam,g.away_team AS awayTeam,s.team,s.opponent,s.points,
            s.yards_per_play AS yardsPerPlay,s.yards_per_pass AS yardsPerPass,s.yards_per_rush AS yardsPerRush,
            s.pass_attempts AS passAttempts,s.rush_attempts AS rushAttempts,
            CAST(json_extract(a.component_json,'$.offRushingSuccessRate') AS REAL) AS rushingSuccessRate,
            CAST(json_extract(a.component_json,'$.offRushingPpa') AS REAL) AS rushingPpa,
            COALESCE(CAST(json_extract(a.component_json,'$.offPassingSuccessRate') AS REAL),a.off_passing_success_rate) AS passingSuccessRate,
            CAST(json_extract(a.component_json,'$.offPassingPpa') AS REAL) AS passingPpa,
            p.home_score AS predictedHomeScore,p.away_score AS predictedAwayScore
          FROM team_game_stats s
          JOIN cfb_games g ON g.game_id=s.game_id AND g.completed=1
          LEFT JOIN team_game_advanced_stats a ON a.game_id=s.game_id AND a.team=s.team
          LEFT JOIN model_predictions p ON p.game_id=s.game_id
          WHERE s.season=? AND g.home_points IS NOT NULL AND g.away_points IS NOT NULL
            AND (? >= 16 OR (LOWER(COALESCE(g.season_type,'regular'))='regular' AND s.week<=?))
          ORDER BY g.start_date,s.game_id,s.team`).bind(season,requestedWeek,requestedWeek).all<Record<string,unknown>>(),
        db.prepare("SELECT team,logo FROM cfb_teams WHERE season=?").bind(season).all<{team:string;logo:string|null}>(),
      ]);
      const profiles:MatchupContextProfile[]=profileRows.map((row)=>({
        team:String(row.team),offYpaIndex:Number(row.offYpaIndex??1),offYpcIndex:Number(row.offYpcIndex??1),
        defYpaIndex:Number(row.defYpaIndex??1),defYpcIndex:Number(row.defYpcIndex??1),advancedProfile:parseAdvancedProfile(row.advancedProfile),
      }));
      const games:MatchupContextGameRow[]=gameRows.results.map((row)=>({
        gameId:String(row.gameId),week:Number(row.week),seasonType:row.seasonType?String(row.seasonType):null,startDate:row.startDate?String(row.startDate):null,neutralSite:Boolean(row.neutralSite),
        homeTeam:String(row.homeTeam),awayTeam:String(row.awayTeam),team:String(row.team),opponent:String(row.opponent),
        points:nullableNumber(row.points),yardsPerPlay:nullableNumber(row.yardsPerPlay),yardsPerPass:nullableNumber(row.yardsPerPass),yardsPerRush:nullableNumber(row.yardsPerRush),
        passAttempts:nullableNumber(row.passAttempts),rushAttempts:nullableNumber(row.rushAttempts),
        rushingSuccessRate:nullableNumber(row.rushingSuccessRate),rushingPpa:nullableNumber(row.rushingPpa),
        passingSuccessRate:nullableNumber(row.passingSuccessRate),passingPpa:nullableNumber(row.passingPpa),
        predictedHomeScore:nullableNumber(row.predictedHomeScore),predictedAwayScore:nullableNumber(row.predictedAwayScore),
      }));
      const logos=Object.fromEntries(teamRows.results.flatMap((row)=>row.logo?[[row.team,row.logo]]:[]));
      const payload=buildMatchupContext({season,requestedWeek,effectiveWeek,homeTeam,awayTeam,profiles,games,logos});
      const response=Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),...payload});
      response.headers.set("cache-control","public, max-age=180, stale-while-revalidate=900");
      return response;
    }

    if (view === "similar-teams") {
      if (!team) return Response.json({ source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,team:null,rows:[] });
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season,requestedWeek).first<{week:number|null}>();
      const effectiveWeek=effective?.week??0;
      const currentRows=await loadPointInTimeProfileRows(db,season,effectiveWeek);
      const currentRaw=currentRows.find((row)=>String(row.team)===team);
      if(!currentRaw)return Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,team,rows:[]});
      const candidateResult=await db.prepare(`WITH latest AS (
          SELECT season,MAX(week) AS week FROM weekly_profiles
          WHERE season>=? AND games_played>=4 GROUP BY season
        )
        SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
          ap.profile_json AS advancedProfile,t.logo,t.conference
        FROM weekly_profiles wp
        JOIN latest ON latest.season=wp.season AND latest.week=wp.week
        LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
        LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
        WHERE wp.games_played>=4`).bind(FIRST_HISTORICAL_SEASON).all<Record<string,unknown>>();
      const current={...currentRaw,advancedProfile:parseAdvancedProfile(currentRaw.advancedProfile)} as unknown as FootballProfile;
      const candidates=candidateResult.results.map((row)=>({...row,advancedProfile:parseAdvancedProfile(row.advancedProfile)})) as unknown as FootballProfile[];
      const metadata=new Map(candidateResult.results.map((row)=>[`${row.season}\u0000${row.team}`,row]));
      const rows=findHistoricalComparisons(current,candidates,3).map((comparison)=>({
        ...comparison,
        logo:metadata.get(`${comparison.season}\u0000${comparison.team}`)?.logo,
        conference:metadata.get(`${comparison.season}\u0000${comparison.team}`)?.conference,
      }));
      const response=Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,week:effectiveWeek,team,rows});
      response.headers.set("cache-control","public, max-age=600, stale-while-revalidate=3600");
      return response;
    }

    if (view === "all-time-profiles") {
      const [result,gameResult] = await Promise.all([
        db.prepare(`WITH latest AS (
          SELECT season,MAX(week) AS week
          FROM weekly_profiles
          WHERE season>=? AND games_played>=4
          GROUP BY season
        )
        SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
          wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
          wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
          t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo,ap.profile_json AS advancedProfile,
          pi.returning_ppa AS returningPpa,pi.returning_passing_ppa AS returningPassingPpa,
          pi.returning_receiving_ppa AS returningReceivingPpa,pi.returning_rushing_ppa AS returningRushingPpa,
          pi.returning_usage AS returningUsage,pi.returning_passing_usage AS returningPassingUsage,
          pi.returning_receiving_usage AS returningReceivingUsage,pi.returning_rushing_usage AS returningRushingUsage,
          pi.recruiting_rank AS recruitingRank,pi.recruiting_points AS recruitingPoints
        FROM weekly_profiles wp
        JOIN latest ON latest.season=wp.season AND latest.week=wp.week
        LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
        LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
        LEFT JOIN preseason_inputs pi ON pi.season=wp.season AND pi.team=wp.team
        WHERE wp.games_played>=4
        ORDER BY wp.season,wp.team`).bind(FIRST_HISTORICAL_SEASON).all<Record<string, unknown>>(),
        db.prepare(`SELECT season,season_type AS seasonType,game_id AS gameId,week,start_date AS startDate,neutral_site AS neutralSite,
          home_team AS homeTeam,home_points AS homePoints,away_team AS awayTeam,away_points AS awayPoints
          FROM cfb_games WHERE season>=? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL
          ORDER BY season,start_date,game_id`).bind(FIRST_HISTORICAL_SEASON).all<RankingGame & { season:number;seasonType:string }>(),
      ]);
      const seasons = [...new Set(result.results.map((row) => Number(row.season)))];
      const resume = new Map<string,BcsRankingRow>();
      const champions = new Map<number,string>();
      for (const archivedSeason of seasons) {
        const profiles = result.results.filter((row)=>Number(row.season)===archivedSeason);
        const games = gameResult.results.filter((game)=>Number(game.season)===archivedSeason);
        for (const row of buildBcsRankings(games,rankingProfiles(profiles))) resume.set(`${archivedSeason}\u0000${row.team}`,row);
        const titleGame = games.filter((game)=>game.seasonType==="postseason")
          .sort((a,b)=>String(b.startDate??"").localeCompare(String(a.startDate??""))||String(b.gameId).localeCompare(String(a.gameId)))[0];
        if (titleGame) champions.set(archivedSeason,Number(titleGame.homePoints)>Number(titleGame.awayPoints)?titleGame.homeTeam:titleGame.awayTeam);
      }
      const enriched = result.results.map((row) => {
        const archivedSeason = Number(row.season);
        const archivedGames = gameResult.results.filter((game)=>Number(game.season)===archivedSeason);
        const ranking = resume.get(`${archivedSeason}\u0000${String(row.team)}`);
        const gamesPlayed = (ranking?.wins??0)+(ranking?.losses??0)+(ranking?.ties??0);
        const winPct = gamesPlayed ? ((ranking?.wins??0)+0.5*(ranking?.ties??0))/gamesPlayed : 0.5;
        const nationalChampion = champions.get(archivedSeason)===String(row.team);
        const resumeScore = ranking ? Math.max(0,Math.min(1,0.55*ranking.bcsScore+0.3*winPct+0.15*(nationalChampion?1:0))) : 0.5;
        return {
          ...row,
          advancedProfile:parseAdvancedProfile(row.advancedProfile),
          eloRating:ranking?.eloRating??1500,
          crossEraRating:ranking?finalMatchupRating(ranking,archivedGames,String(row.team)):1500,
          scheduleStrength:ranking?.scheduleStrength??0.5,
          bestOpponentStrength:ranking?.bestOpponentStrength??0.5,
          qualityWinStrength:ranking?.qualityWinStrength??0.35,
          matchupReliability:ranking?.matchupReliability??0.72,
          resumeScore,
          nationalChampion,
          seasonRecord:ranking?.record??"—",
        };
      });
      const response = Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), seasons, rows: enriched, viabilityCalibration:currentViabilityCalibration() });
      response.headers.set("cache-control", "public, max-age=300, stale-while-revalidate=1800");
      return response;
    }

    if (view === "team-history") {
      if (!team) return Response.json({ source:"database", configured:Boolean(runtime.CFBD_API_KEY), season, team:null, rows:[] });
      const result = await db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
        wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
        wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
        wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
        wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
        ap.profile_json AS advancedProfile,
        pi.returning_ppa AS returningPpa,pi.returning_passing_ppa AS returningPassingPpa,
        pi.returning_receiving_ppa AS returningReceivingPpa,pi.returning_rushing_ppa AS returningRushingPpa,
        pi.returning_usage AS returningUsage,pi.returning_passing_usage AS returningPassingUsage,
        pi.returning_receiving_usage AS returningReceivingUsage,pi.returning_rushing_usage AS returningRushingUsage,
        pi.recruiting_rank AS recruitingRank,pi.recruiting_points AS recruitingPoints
        FROM weekly_profiles wp
        LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
        LEFT JOIN preseason_inputs pi ON pi.season=wp.season AND pi.team=wp.team
        WHERE wp.season=? AND wp.team=? AND wp.week<=?
        ORDER BY wp.week`).bind(season,team,requestedWeek).all<Record<string,unknown>>();
      const rows = result.results.map((row)=>({...row,advancedProfile:parseAdvancedProfile(row.advancedProfile)}));
      const response=Response.json({ source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,team,rows });
      response.headers.set("cache-control","public, max-age=180, stale-while-revalidate=900");
      return response;
    }

    if (view === "rankings") {
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      const effectiveWeek = effective?.week ?? requestedWeek;
      const profilePromise = loadPointInTimeProfileRows(db,season,effectiveWeek);
      const [profileRows, gameResult] = await Promise.all([
        profilePromise,
        db.prepare(`SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,
          conference_game AS conferenceGame,home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,
          away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
          FROM cfb_games WHERE season=? AND completed=1 AND season_type<>'postseason' AND week<=?
          AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY week,start_date,game_id`).bind(season, requestedWeek).all<RankingGame>(),
      ]);
      const rows = gameResult.results.length ? buildBcsRankings(gameResult.results as RankingGame[], rankingProfiles(profileRows)) : [];
      const response=Response.json({
        source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,
        methodology:"Results-only Harper BCS v5 · completed games through the prior-week snapshot · closed-schedule SOS · verified-win evidence · opponent-relative game control · bad-result penalties · direct head-to-head · no future projections",
        completedGames:gameResult.results.length,
        rows,
        message:rows.length?undefined:"No completed games are available before this entering-week snapshot.",
      });
      response.headers.set("cache-control","public, max-age=300, stale-while-revalidate=900");
      return response;
    }

    if (view === "standings") {
      const conferenceResult=await db.prepare(`SELECT DISTINCT conference FROM cfb_teams
        WHERE season=? AND conference IS NOT NULL AND TRIM(conference)<>'' AND LOWER(conference) NOT LIKE '%independent%'
        ORDER BY conference`).bind(season).all<{conference:string}>();
      const conferences=conferenceResult.results.map((row)=>row.conference);
      if(!conference){
        return Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek:requestedWeek,conference:"",conferences,rows:[],rules:null});
      }
      if(!conferences.includes(conference)){
        return Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek:requestedWeek,conference,conferences,rows:[],rules:null,message:`${conference} is not an FBS conference in ${season}.`});
      }
      const effective=await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season,requestedWeek).first<{week:number|null}>();
      const effectiveWeek=effective?.week??requestedWeek;
      const profilePromise=loadPointInTimeProfileRows(db,season,effectiveWeek);
      const [profileRows,teamResult,gameResult]=await Promise.all([
        profilePromise,
        db.prepare(`SELECT team,team_id AS teamId,abbreviation,mascot,conference,color,alt_color AS altColor,logo
          FROM cfb_teams WHERE season=? AND conference=? ORDER BY team`).bind(season,conference).all<Record<string,unknown>>(),
        db.prepare(`SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,conference_game AS conferenceGame,
          home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,
          away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
          FROM cfb_games WHERE season=? AND completed=1 AND season_type<>'postseason' AND week<=?
          AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY week,start_date,game_id`).bind(season,requestedWeek).all<RankingGame>(),
      ]);
      const conferenceChampionshipIds=conferenceChampionshipGameIds(gameResult.results);
      const rankingGameRows=gameResult.results.map((game)=>({...game,conferenceChampionship:conferenceChampionshipIds.has(game.gameId)}));
      const rankingRows=buildBcsRankings(rankingGameRows,rankingProfiles(profileRows));
      const rankingByTeam=new Map(rankingRows.map((row)=>[row.team,row]));
      const standingTeams=teamResult.results.map((row):ConferenceStandingTeam=>{
        const name=String(row.team);
        const ranking=rankingByTeam.get(name);
        return {
          team:name,teamId:row.teamId?String(row.teamId):null,abbreviation:row.abbreviation?String(row.abbreviation):null,
          mascot:row.mascot?String(row.mascot):null,conference:String(row.conference),color:row.color?String(row.color):null,
          altColor:row.altColor?String(row.altColor):null,logo:row.logo?String(row.logo):null,
          hPlusRank:ranking?.rank??null,hPlusScore:ranking?.bcsScore??null,
        };
      });
      const standingGames=rankingGameRows.map((row):ConferenceStandingGame=>({
        gameId:String(row.gameId),week:Number(row.week),seasonType:row.seasonType?String(row.seasonType):null,
        conferenceGame:Boolean(row.conferenceGame),conferenceChampionship:Boolean(row.conferenceChampionship),homeTeam:String(row.homeTeam),homePoints:Number(row.homePoints),
        awayTeam:String(row.awayTeam),awayPoints:Number(row.awayPoints),
      }));
      const standings=buildConferenceStandings({conference,season,teams:standingTeams,games:standingGames});
      const response=Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,conference,conferences,...standings});
      response.headers.set("cache-control","public, max-age=180, stale-while-revalidate=900");
      return response;
    }

    if (view === "simulation" || view === "projected-ranks" || view === "simulation-scenario") {
      if (requestedWeek===0 && season===FIRST_HISTORICAL_SEASON) {
        return Response.json({
          source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek:0,rankings:[],
          message:"A trustworthy 2014 preseason simulation requires 2010–2013 team profiles, which are outside the archive. Select Week 1 or later; the model will not present a false preseason ranking from an unseeded field.",
        });
      }
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      const effectiveWeek = effective?.week ?? requestedWeek;
      const profilePromise = loadPointInTimeProfileRows(db,season,effectiveWeek);
      const [profileRows, scheduleResult] = await Promise.all([
        profilePromise,
        db.prepare(`SELECT g.game_id AS gameId,g.week,g.start_date AS startDate,g.season_type AS seasonType,g.completed,g.neutral_site AS neutralSite,
          g.conference_game AS conferenceGame,g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,
          g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
          p.home_win_probability AS pregameHomeWinProbability,p.model_home_spread AS pregameModelHomeSpread,p.model_total AS pregameModelTotal
          FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id
          WHERE g.season=? ORDER BY g.week,g.start_date,g.game_id`).bind(season).all<SimulationScheduleGame>(),
      ]);
      const schedule=scheduleResult.results as SimulationScheduleGame[];
      const profiles=rankingProfiles(await attachPreseasonTransitionElo(db,season,profileRows));
      if(view==="simulation-scenario"){
        if(!team)return Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,message:"Select one team for the scenario."},{status:400});
        const baseline=buildSeasonSimulation(season,requestedWeek,effectiveWeek,schedule,profiles);
        const baselineTeam=baseline.rankings.find((row)=>row.team===team);
        if(!baselineTeam)return Response.json({source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,team,message:`No simulation profile is available for ${team}.`},{status:404});
        const regularGames=baselineTeam.schedule.filter((game)=>game.seasonType==="regular");
        const regularById=new Map(regularGames.map((game)=>[game.gameId,game]));
        const regularOverrides=scenarioOverrides.filter((override)=>{
          const game=regularById.get(override.gameId);
          return Boolean(game&&(override.winnerTeam===team||override.winnerTeam===game.opponent));
        });
        const provisionalScenario=regularOverrides.length
          ?buildSeasonSimulation(season,requestedWeek,effectiveWeek,schedule,profiles,{gameOverrides:regularOverrides})
          :baseline;
        const provisionalTeam=provisionalScenario.rankings.find((row)=>row.team===team);
        const conferenceGames=(provisionalTeam?.schedule??[]).filter((game)=>game.seasonType==="conference-championship");
        const conferenceById=new Map(conferenceGames.map((game)=>[game.gameId,game]));
        const conferenceOverrides=scenarioOverrides.filter((override)=>{
          const game=conferenceById.get(override.gameId);
          return Boolean(game&&(override.winnerTeam===team||override.winnerTeam===game.opponent));
        });
        const appliedOverrides=[...new Map([...regularOverrides,...conferenceOverrides].map((override)=>[override.gameId,override])).values()];
        const scenario=conferenceOverrides.length
          ?buildSeasonSimulation(season,requestedWeek,effectiveWeek,schedule,profiles,{gameOverrides:appliedOverrides})
          :provisionalScenario;
        const scenarioTeam=scenario.rankings.find((row)=>row.team===team);
        const scenarioGames=new Map((scenarioTeam?.schedule??[]).map((game)=>[game.gameId,game]));
        const selectableGames=[...regularGames,...conferenceGames];
        const response=Response.json({
          source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,team,
          methodology:"An isolated Season Sim branch can replace completed or projected regular-season results and the selected team's simulated conference championship. It then rebuilds records, conference standings, projected final ranks, and every bracket round. The playoff field is the top-ranked teams in that branch and each seed equals its final Season Sim rank; real-life bracket placement and automatic qualifiers are not used. Scores, Rankings and the normal Season Sim remain unchanged.",
          appliedOverrides,
          games:selectableGames,
          scenarioGames:selectableGames.map((game)=>scenarioGames.get(game.gameId)??game),
          baseline:{champion:baseline.champion,format:baseline.format,rankings:simulationScenarioRankings(baseline),bracket:simulationScenarioBracket(baseline)},
          scenario:{champion:scenario.champion,format:scenario.format,rankings:simulationScenarioRankings(scenario),bracket:simulationScenarioBracket(scenario)},
        });
        response.headers.set("cache-control","private, no-store");
        return response;
      }
      const fullSimulation = buildSeasonSimulation(season, requestedWeek, effectiveWeek, schedule, profiles);
      if(view === "projected-ranks"){
        const topRankings=fullSimulation.rankings.slice(0,25);
        const requestedTeamRanking=team?fullSimulation.rankings.find((row)=>row.team===team):undefined;
        const responseRankings=requestedTeamRanking&&!topRankings.some((row)=>row.team===requestedTeamRanking.team)
          ?[...topRankings,requestedTeamRanking]
          :topRankings;
        const response=Response.json({
          source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,requestedWeek,effectiveWeek,
          methodology:"Season Sim projected-final ranking: completed results and team strength through this frozen snapshot, then the Matchup Lab path, expected wins, schedule-transfer proof and one conference title game for the rest of the season. A stored title result replaces the generated title; it is never counted twice. This is the same ranking used on Scores for the matching entering week.",
          rankings:responseRankings.map(({schedule:unusedSchedule,...row})=>{
            void unusedSchedule;
            return row;
          }),
        });
        response.headers.set("cache-control","public, max-age=300, stale-while-revalidate=900");
        return response;
      }
      const simulation = compactSeasonSimulationForClient(fullSimulation);
      const response = Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), ...simulation });
      response.headers.set("cache-control", "public, max-age=300, stale-while-revalidate=900");
      return response;
    }

    if (view === "champions") {
      if (season === 2025 && requestedWeek >= 15) return Response.json({ source: "verified-results", configured: Boolean(runtime.CFBD_API_KEY), season, rows: known2025Champions });

      const titleGames = await db.prepare(`SELECT g.game_id AS gameId,g.week,g.start_date AS startDate,g.season_type AS seasonType,g.completed,g.neutral_site AS neutralSite,g.conference_game AS conferenceGame,
        g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
        p.home_win_probability AS homeWinProbability
        FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id
        WHERE g.season=? AND g.week>=14 AND g.week<=? AND g.season_type<>'postseason' AND g.conference_game=1 AND g.home_conference=g.away_conference
        ORDER BY g.week DESC,g.start_date DESC`).bind(season, requestedWeek).all<{
          gameId:string;week:number;startDate:string|null;seasonType:string;completed:number;neutralSite:number;conferenceGame:number;
          homeTeam:string;homeConference:string;homePoints:number|null;awayTeam:string;awayConference:string;awayPoints:number|null;homeWinProbability:number|null;
        }>();
      const conferenceChampionshipIds=conferenceChampionshipGameIds(titleGames.results);
      const rows = new Map<string, { conference: string; team: string; status: "actual" | "predicted"; gameId?: string }>();
      for (const game of titleGames.results) {
        const conference=game.homeConference;
        if (!conferenceChampionshipIds.has(game.gameId)||!titleConferences.includes(conference) || rows.has(conference)) continue;
        const final = Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null;
        const team = final
          ? (Number(game.homePoints) > Number(game.awayPoints) ? game.homeTeam : game.awayTeam)
          : (Number(game.homeWinProbability ?? 0.5) >= 0.5 ? game.homeTeam : game.awayTeam);
        rows.set(conference, { conference, team, status: final ? "actual" : "predicted", gameId: game.gameId });
      }

      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      if (effective?.week) {
        const contenders=(await loadPointInTimeProfileRows(db,season,effective.week)).map((row)=>({
          team:String(row.team),
          conference:String(row.conference??""),
          strength:([row.offYppIndex,row.offYpaIndex,row.offYpcIndex].map(Number).reduce((sum,value)=>sum+value,0)
            -[row.defYppIndex,row.defYpaIndex,row.defYpcIndex].map(Number).reduce((sum,value)=>sum+value,0))/3,
        })).sort((left,right)=>right.strength-left.strength);
        for (const contender of contenders) {
          if (titleConferences.includes(contender.conference) && !rows.has(contender.conference)) rows.set(contender.conference, { conference: contender.conference, team: contender.team, status: "predicted" });
        }
      }
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, rows: [...rows.values()] });
    }

    if (view === "performance") {
      const readMetrics = (version: string) => db.prepare(`SELECT
          COUNT(*) AS gameCount,
          SUM(CASE WHEN g.home_points IS NOT NULL AND g.away_points IS NOT NULL AND g.home_points<>g.away_points THEN 1 ELSE 0 END) AS straightUpGraded,
          SUM(CASE WHEN g.home_points IS NOT NULL AND g.away_points IS NOT NULL AND g.home_points<>g.away_points AND ((p.home_win_probability>=0.5 AND g.home_points>g.away_points) OR (p.home_win_probability<0.5 AND g.home_points<g.away_points)) THEN 1 ELSE 0 END) AS straightUpWins,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.spread_result='W' THEN 1 ELSE 0 END) AS spreadWins,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.spread_result='L' THEN 1 ELSE 0 END) AS spreadLosses,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.spread_result='PUSH' THEN 1 ELSE 0 END) AS spreadPushes,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.spread_result='PASS' THEN 1 ELSE 0 END) AS spreadPasses,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${legacyConsensusQuarantineSql} AND p.vegas_spread IS NOT NULL THEN 1 ELSE 0 END) AS spreadQuarantined,
          AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.vegas_spread IS NOT NULL THEN p.spread_error END) AS spreadMae,
          SUM(CASE WHEN ${totalDiagnosticWinSql} THEN 1 ELSE 0 END) AS totalWins,
          SUM(CASE WHEN ${totalDiagnosticLossSql} THEN 1 ELSE 0 END) AS totalLosses,
          SUM(CASE WHEN ${totalDiagnosticPushSql} THEN 1 ELSE 0 END) AS totalPushes,
          SUM(CASE WHEN ${totalDiagnosticPassSql} THEN 1 ELSE 0 END) AS totalPasses,
          SUM(CASE WHEN ${totalDiagnosticBaseSql} AND ${legacyConsensusQuarantineSql} THEN 1 ELSE 0 END) AS totalQuarantined,
          AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND ${trustedMarketLineSql} AND p.vegas_total IS NOT NULL THEN p.total_error END) AS totalMae
          FROM model_predictions p JOIN cfb_games g ON g.game_id=p.game_id LEFT JOIN betting_lines l ON l.game_id=p.game_id
          WHERE p.season=? AND p.model_version=?`).bind(season, version).first<Record<string, number | null>>();
      const [seasonGames, profileCount] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM cfb_games WHERE season=?").bind(season).first<{ count:number }>(),
        db.prepare("SELECT COUNT(*) AS count FROM weekly_profiles WHERE season=?").bind(season).first<{ count:number }>(),
      ]);
      let activeVersion = MODEL_VERSION;
      let metrics = await readMetrics(activeVersion);
      if (Number(metrics?.gameCount ?? 0) < Number(seasonGames?.count ?? 0)) {
        const live = await calculateCachedPerformance(db, season).catch(() => null);
        if (live && (live.spread.graded > 0 || live.total.graded > 0 || Number(seasonGames?.count ?? 0) === 0)) {
          return Response.json({ source: "cached-recalculation", configured: Boolean(runtime.CFBD_API_KEY), calibrationState: "live-cached", snapshotStatus:"live", lineQualityStatus:marketLineSeasonStatus(season), ...live });
        }
      }
      if (Number(metrics?.gameCount ?? 0) === 0) {
        const fallback = await db.prepare(`SELECT model_version AS modelVersion,COUNT(*) AS count
          FROM model_predictions WHERE season=? GROUP BY model_version ORDER BY count DESC LIMIT 1`)
          .bind(season).first<{ modelVersion:string;count:number }>();
        if (fallback?.modelVersion) {
          activeVersion = fallback.modelVersion;
          metrics = await readMetrics(activeVersion);
        }
      }
      const count = (key: string) => Number(metrics?.[key] ?? 0);
      const straightUpGraded = count("straightUpGraded");
      const straightUpWins = count("straightUpWins");
      return Response.json({
        source: "database",
        configured: Boolean(runtime.CFBD_API_KEY),
        season,
        modelVersion: activeVersion,
        calibrationState: activeVersion === MODEL_VERSION ? "current" : "cached-previous",
        snapshotStatus: "live",
        lineQualityStatus: marketLineSeasonStatus(season),
        minMarketWeek: 5,
        gameCount: count("gameCount"),
        profileCount: Number(profileCount?.count ?? 0),
        straightUp: { wins: straightUpWins, graded: straightUpGraded, accuracy: straightUpGraded ? straightUpWins / straightUpGraded : null },
        spread: accuracyMetric(metrics ?? {}, "spread"),
        total: accuracyMetric(metrics ?? {}, "total"),
      });
    }

    if (view === "calibration") {
      const completedWeekFiveSql = `(p.week>=5 OR g.season_type='postseason')
        AND g.completed=1 AND g.home_points IS NOT NULL AND g.away_points IS NOT NULL`;
      const spreadEligibleSql = `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.vegas_spread IS NOT NULL`;
      const spreadAllWinSql = `${spreadEligibleSql} AND p.spread_edge IS NOT NULL AND ABS(p.spread_edge)>=0.001
        AND ((p.spread_edge>0 AND g.home_points-g.away_points+p.vegas_spread>0)
          OR (p.spread_edge<0 AND g.home_points-g.away_points+p.vegas_spread<0))`;
      const spreadAllLossSql = `${spreadEligibleSql} AND p.spread_edge IS NOT NULL AND ABS(p.spread_edge)>=0.001
        AND ((p.spread_edge>0 AND g.home_points-g.away_points+p.vegas_spread<0)
          OR (p.spread_edge<0 AND g.home_points-g.away_points+p.vegas_spread>0))`;
      const spreadAllPushSql = `${spreadEligibleSql} AND p.spread_edge IS NOT NULL AND ABS(p.spread_edge)>=0.001
        AND g.home_points-g.away_points+p.vegas_spread=0`;
      const spreadAllPassSql = `${spreadEligibleSql} AND (p.spread_edge IS NULL OR ABS(p.spread_edge)<0.001)`;
      const totalEligibleSql = `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.vegas_total IS NOT NULL`;
      const totalAllWinSql = `${totalEligibleSql} AND p.total_edge IS NOT NULL AND ABS(p.total_edge)>=0.001
        AND ((p.total_edge>0 AND g.home_points+g.away_points-p.vegas_total>0)
          OR (p.total_edge<0 AND g.home_points+g.away_points-p.vegas_total<0))`;
      const totalAllLossSql = `${totalEligibleSql} AND p.total_edge IS NOT NULL AND ABS(p.total_edge)>=0.001
        AND ((p.total_edge>0 AND g.home_points+g.away_points-p.vegas_total<0)
          OR (p.total_edge<0 AND g.home_points+g.away_points-p.vegas_total>0))`;
      const totalAllPushSql = `${totalEligibleSql} AND p.total_edge IS NOT NULL AND ABS(p.total_edge)>=0.001
        AND g.home_points+g.away_points-p.vegas_total=0`;
      const totalAllPassSql = `${totalEligibleSql} AND (p.total_edge IS NULL OR ABS(p.total_edge)<0.001)`;
      const spreadWinSql = accuracyScope === "all" ? spreadAllWinSql : `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.spread_result='W'`;
      const spreadLossSql = accuracyScope === "all" ? spreadAllLossSql : `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.spread_result='L'`;
      const spreadPushSql = accuracyScope === "all" ? spreadAllPushSql : `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.spread_result='PUSH'`;
      const spreadPassSql = accuracyScope === "all" ? spreadAllPassSql : `${completedWeekFiveSql} AND ${trustedMarketLineSql} AND p.spread_result='PASS'`;
      const totalWinSql = accuracyScope === "all" ? totalAllWinSql : totalDiagnosticWinSql;
      const totalLossSql = accuracyScope === "all" ? totalAllLossSql : totalDiagnosticLossSql;
      const totalPushSql = accuracyScope === "all" ? totalAllPushSql : totalDiagnosticPushSql;
      const totalPassSql = accuracyScope === "all" ? totalAllPassSql : totalDiagnosticPassSql;
      const accuracyConditions=["p.model_version=?"];
      const accuracyBinds:Array<string|number>=[MODEL_VERSION];
      if(team){accuracyConditions.push("(g.home_team=? OR g.away_team=?)");accuracyBinds.push(team,team);}
      else if(conference){
        const conferenceValues=conferenceFilterSqlValues(conference);
        const conferencePlaceholders=conferenceValues.map(()=>"?").join(",");
        accuracyConditions.push(`(ht.conference IN (${conferencePlaceholders}) OR at.conference IN (${conferencePlaceholders}))`);
        accuracyBinds.push(...conferenceValues,...conferenceValues);
      }
      const [result,teamOptionsResult,conferenceOptionsResult] = await Promise.all([
        db.prepare(`SELECT p.season,
        SUM(CASE WHEN ${completedWeekFiveSql} AND p.home_win_probability IS NOT NULL AND g.home_points<>g.away_points THEN 1 ELSE 0 END) AS straightUpGraded,
        SUM(CASE WHEN ${completedWeekFiveSql} AND p.home_win_probability IS NOT NULL AND g.home_points<>g.away_points AND ((p.home_win_probability>=0.5 AND g.home_points>g.away_points) OR (p.home_win_probability<0.5 AND g.home_points<g.away_points)) THEN 1 ELSE 0 END) AS straightUpWins,
        SUM(CASE WHEN ${spreadWinSql} THEN 1 ELSE 0 END) AS spreadWins,
        SUM(CASE WHEN ${spreadLossSql} THEN 1 ELSE 0 END) AS spreadLosses,
        SUM(CASE WHEN ${spreadPushSql} THEN 1 ELSE 0 END) AS spreadPushes,
        SUM(CASE WHEN ${spreadPassSql} THEN 1 ELSE 0 END) AS spreadPasses,
        SUM(CASE WHEN ${completedWeekFiveSql} AND ${legacyConsensusQuarantineSql} AND p.vegas_spread IS NOT NULL THEN 1 ELSE 0 END) AS spreadQuarantined,
        AVG(CASE WHEN ${spreadEligibleSql} THEN p.spread_error END) AS spreadMae,
        SUM(CASE WHEN ${totalWinSql} THEN 1 ELSE 0 END) AS totalWins,
        SUM(CASE WHEN ${totalLossSql} THEN 1 ELSE 0 END) AS totalLosses,
        SUM(CASE WHEN ${totalPushSql} THEN 1 ELSE 0 END) AS totalPushes,
        SUM(CASE WHEN ${totalPassSql} THEN 1 ELSE 0 END) AS totalPasses,
        SUM(CASE WHEN ${completedWeekFiveSql} AND ${legacyConsensusQuarantineSql} AND p.vegas_total IS NOT NULL THEN 1 ELSE 0 END) AS totalQuarantined,
        AVG(CASE WHEN ${totalEligibleSql} THEN p.total_error END) AS totalMae
        FROM model_predictions p
        JOIN cfb_games g ON g.game_id=p.game_id
        JOIN cfb_teams ht ON ht.season=g.season AND ht.team=g.home_team
        JOIN cfb_teams at ON at.season=g.season AND at.team=g.away_team
        LEFT JOIN betting_lines l ON l.game_id=p.game_id
        WHERE ${accuracyConditions.join(" AND ")} GROUP BY p.season ORDER BY p.season DESC`).bind(...accuracyBinds).all<Record<string, number | null>>(),
        db.prepare("SELECT DISTINCT team FROM cfb_teams ORDER BY team").all<{team:string}>(),
        db.prepare(`SELECT DISTINCT conference FROM cfb_teams WHERE conference IS NOT NULL AND TRIM(conference)<>''
          AND LOWER(conference) NOT LIKE '%independent%' ORDER BY conference`).all<{conference:string}>(),
      ]);
      const rows = result.results.map((row) => {
        const rowSeason = Number(row.season);
        const straightUpGraded=Number(row.straightUpGraded??0);
        const straightUpWins=Number(row.straightUpWins??0);
        return { season: rowSeason, snapshotStatus:"live", lineQualityStatus:marketLineSeasonStatus(rowSeason), straightUp:{wins:straightUpWins,losses:Math.max(0,straightUpGraded-straightUpWins),graded:straightUpGraded,accuracy:straightUpGraded?straightUpWins/straightUpGraded:null}, spread: accuracyMetric(row, "spread"), total: accuracyMetric(row, "total") };
      });
      return Response.json({
        source:"database",configured:Boolean(runtime.CFBD_API_KEY),modelVersion:MODEL_VERSION,snapshotStatus:"live",minMarketWeek:5,scope:accuracyScope,
        filters:{team,conference:team?"":conference},teamOptions:teamOptionsResult.results.map((row)=>row.team),conferenceOptions:conferenceOptionsResult.results.map((row)=>row.conference),
        validation:`prior-week-only · ${accuracyScope === "all" ? "all predicted games" : "qualified model fits"} · Week 5+ · FBS vs FBS · legacy consensus quarantined`,marketCalibration:marketModelCalibration,rows,
      });
    }

    if (view === "validation-slices") {
      const base = `WITH base AS (
        SELECT p.week,p.generated_from_week,p.home_score,p.away_score,p.home_win_probability,p.model_total,
          p.vegas_spread,p.vegas_total,p.spread_edge,p.total_edge,
          g.season_type AS seasonType,g.neutral_site AS neutralSite,g.home_points AS homePoints,g.away_points AS awayPoints,
          CASE
            WHEN hp.team IS NULL OR ap.team IS NULL THEN 'Missing profile'
            WHEN MIN(COALESCE(hp.games_played,0),COALESCE(ap.games_played,0))<3 THEN 'Limited'
            WHEN MIN(COALESCE(hp.games_played,0),COALESCE(ap.games_played,0))<6 THEN 'Developing'
            ELSE 'Mature'
          END AS dataQuality
        FROM model_predictions p
        JOIN cfb_games g ON g.game_id=p.game_id
        LEFT JOIN weekly_profiles hp ON hp.season=p.season AND hp.week=p.generated_from_week AND hp.team=p.home_team
        LEFT JOIN weekly_profiles ap ON ap.season=p.season AND ap.week=p.generated_from_week AND ap.team=p.away_team
        WHERE p.model_version=? AND g.completed=1 AND g.home_points IS NOT NULL AND g.away_points IS NOT NULL
          AND (p.week>=5 OR g.season_type='postseason')
      )`;
      const grouped = (expression:string) => db.prepare(`${base}
        SELECT ${expression} AS label,COUNT(*) AS count,
          AVG((ABS(home_score-homePoints)+ABS(away_score-awayPoints))/2.0) AS scoreMae,
          AVG(ABS((home_score-away_score)-(homePoints-awayPoints))) AS spreadMae,
          AVG(ABS(model_total-(homePoints+awayPoints))) AS totalMae,
          AVG(CASE WHEN homePoints=awayPoints THEN NULL WHEN (home_win_probability>=.5 AND homePoints>awayPoints) OR (home_win_probability<.5 AND homePoints<awayPoints) THEN 1.0 ELSE 0.0 END) AS straightUp,
          AVG(CASE WHEN homePoints=awayPoints THEN NULL ELSE (home_win_probability-(CASE WHEN homePoints>awayPoints THEN 1.0 ELSE 0.0 END))*(home_win_probability-(CASE WHEN homePoints>awayPoints THEN 1.0 ELSE 0.0 END)) END) AS brier,
          AVG(CASE WHEN vegas_spread IS NULL OR spread_edge IS NULL OR ABS(spread_edge)<.001 OR homePoints-awayPoints+vegas_spread=0 THEN NULL
            WHEN (spread_edge>0 AND homePoints-awayPoints+vegas_spread>0) OR (spread_edge<0 AND homePoints-awayPoints+vegas_spread<0) THEN 1.0 ELSE 0.0 END) AS atsAccuracy,
          AVG(CASE WHEN vegas_total IS NULL OR total_edge IS NULL OR ABS(total_edge)<.001 OR homePoints+awayPoints-vegas_total=0 THEN NULL
            WHEN (total_edge>0 AND homePoints+awayPoints-vegas_total>0) OR (total_edge<0 AND homePoints+awayPoints-vegas_total<0) THEN 1.0 ELSE 0.0 END) AS totalAccuracy
        FROM base GROUP BY label`).bind(MODEL_VERSION).all<Record<string,unknown>>();
      const edgeGrouped = (field:"spread_edge"|"total_edge",accuracyField:"atsAccuracy"|"totalAccuracy") => db.prepare(`${base}
        SELECT CASE WHEN ABS(${field})<1 THEN '0–1' WHEN ABS(${field})<2 THEN '1–2' WHEN ABS(${field})<3 THEN '2–3' WHEN ABS(${field})<5 THEN '3–5' ELSE '5+' END AS label,
          COUNT(*) AS count,
          AVG(CASE WHEN ${field} IS NULL OR ABS(${field})<.001 THEN NULL
            ${field==="spread_edge"
              ? "WHEN homePoints-awayPoints+vegas_spread=0 THEN NULL WHEN (spread_edge>0 AND homePoints-awayPoints+vegas_spread>0) OR (spread_edge<0 AND homePoints-awayPoints+vegas_spread<0) THEN 1.0 ELSE 0.0"
              : "WHEN homePoints+awayPoints-vegas_total=0 THEN NULL WHEN (total_edge>0 AND homePoints+awayPoints-vegas_total>0) OR (total_edge<0 AND homePoints+awayPoints-vegas_total<0) THEN 1.0 ELSE 0.0"}
          END) AS ${accuracyField}
        FROM base WHERE ${field} IS NOT NULL GROUP BY label`).bind(MODEL_VERSION).all<Record<string,unknown>>();
      const [week,confidence,dataQuality,atsEdges,totalEdges,winCalibration] = await Promise.all([
        grouped("CASE WHEN seasonType='postseason' THEN 'Postseason' ELSE 'Week '||week END"),
        grouped("CASE WHEN ABS(home_win_probability-.5)<.05 THEN 'Toss-up' WHEN ABS(home_win_probability-.5)<.12 THEN 'Slight edge' WHEN ABS(home_win_probability-.5)<.22 THEN 'Solid edge' ELSE 'Strong edge' END"),
        grouped("dataQuality"),
        edgeGrouped("spread_edge","atsAccuracy"),
        edgeGrouped("total_edge","totalAccuracy"),
        db.prepare(`${base} SELECT
          CASE WHEN home_win_probability<.2 THEN '0–20%' WHEN home_win_probability<.4 THEN '20–40%' WHEN home_win_probability<.6 THEN '40–60%' WHEN home_win_probability<.8 THEN '60–80%' ELSE '80–100%' END AS label,
          COUNT(*) AS count,AVG(home_win_probability) AS predicted,AVG(CASE WHEN homePoints>awayPoints THEN 1.0 WHEN homePoints<awayPoints THEN 0.0 ELSE NULL END) AS actual
          FROM base GROUP BY label`).bind(MODEL_VERSION).all<Record<string,unknown>>(),
      ]);
      const normalize = (rows:Record<string,unknown>[]) => rows.map((row)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==="label"?String(value):nullableNumber(value)])));
      const response=Response.json({
        source:"database",modelVersion:MODEL_VERSION,
        week:normalize(week.results),confidence:normalize(confidence.results),dataQuality:normalize(dataQuality.results),
        atsEdges:normalize(atsEdges.results),totalEdges:normalize(totalEdges.results),winCalibration:normalize(winCalibration.results),
      });
      response.headers.set("cache-control","public, max-age=300, stale-while-revalidate=1800");
      return response;
    }

    if (view === "schedule") {
      if (gameId && runtime.CFBD_API_KEY) {
        await hydratePostseasonGameStats({ DB: db, CFBD_API_KEY: runtime.CFBD_API_KEY }, season, gameId).catch(() => null);
      }
      const conditions = ["g.season = ?"];
      const binds: Array<string | number> = [season];
      if (requestedWeek > 0) { conditions.push("g.week = ?"); binds.push(requestedWeek); }
      if (team) { conditions.push("(g.home_team = ? OR g.away_team = ?)"); binds.push(team, team); }
      if (gameId) { conditions.push("g.game_id = ?"); binds.push(gameId); }
      const advancedColumns=gameId?`hga.component_json AS homeActualAdvancedJson,hga.off_line_yards AS homeActualLineYards,hga.off_second_level_yards AS homeActualSecondLevelYards,hga.off_open_field_yards AS homeActualOpenFieldYards,hga.off_passing_success_rate AS homeActualPassingSuccessRate,hga.off_passing_explosiveness AS homeActualPassingExplosiveness,
        aga.component_json AS awayActualAdvancedJson,aga.off_line_yards AS awayActualLineYards,aga.off_second_level_yards AS awayActualSecondLevelYards,aga.off_open_field_yards AS awayActualOpenFieldYards,aga.off_passing_success_rate AS awayActualPassingSuccessRate,aga.off_passing_explosiveness AS awayActualPassingExplosiveness,`:"";
      const advancedJoins=gameId?`LEFT JOIN team_game_advanced_stats hga ON hga.game_id=g.game_id AND hga.team=g.home_team
        LEFT JOIN team_game_advanced_stats aga ON aga.game_id=g.game_id AND aga.team=g.away_team`:"";
      const query = `SELECT g.game_id AS gameId,g.season,g.week,g.season_type AS seasonType,g.start_date AS startDate,g.completed,g.neutral_site AS neutralSite,g.venue,
        g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
        ht.logo AS homeLogo,at.logo AS awayLogo,
        hgs.total_yards AS homeActualTotalYards,hgs.yards_per_play AS homeActualYardsPerPlay,hgs.pass_yards AS homeActualPassYards,hgs.pass_attempts AS homeActualPassAttempts,hgs.pass_completions AS homeActualPassCompletions,hgs.yards_per_pass AS homeActualYardsPerPass,hgs.rush_yards AS homeActualRushYards,hgs.rush_attempts AS homeActualRushAttempts,hgs.yards_per_rush AS homeActualYardsPerRush,hgs.turnovers AS homeActualTurnovers,
        ags.total_yards AS awayActualTotalYards,ags.yards_per_play AS awayActualYardsPerPlay,ags.pass_yards AS awayActualPassYards,ags.pass_attempts AS awayActualPassAttempts,ags.pass_completions AS awayActualPassCompletions,ags.yards_per_pass AS awayActualYardsPerPass,ags.rush_yards AS awayActualRushYards,ags.rush_attempts AS awayActualRushAttempts,ags.yards_per_rush AS awayActualYardsPerRush,ags.turnovers AS awayActualTurnovers,
        ${advancedColumns}
        p.generated_from_week AS generatedFromWeek,p.home_score AS predictedHomeScore,p.away_score AS predictedAwayScore,p.home_win_probability AS homeWinProbability,p.model_home_spread AS modelHomeSpread,p.model_total AS modelTotal,p.model_version AS storedModelVersion,
        COALESCE(p.vegas_spread,l.spread) AS vegasSpread,COALESCE(p.vegas_total,l.over_under) AS vegasTotal,p.spread_edge AS spreadEdge,p.total_edge AS totalEdge,p.spread_error AS spreadError,p.total_error AS totalError,p.spread_result AS spreadResult,p.total_result AS totalResult,
        l.provider,l.formatted_spread AS formattedSpread,l.spread_open AS spreadOpen,l.over_under_open AS overUnderOpen
        FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id LEFT JOIN betting_lines l ON l.game_id=g.game_id
        LEFT JOIN cfb_teams ht ON ht.season=g.season AND ht.team=g.home_team LEFT JOIN cfb_teams at ON at.season=g.season AND at.team=g.away_team
        LEFT JOIN team_game_stats hgs ON hgs.game_id=g.game_id AND hgs.team=g.home_team
        LEFT JOIN team_game_stats ags ON ags.game_id=g.game_id AND ags.team=g.away_team
        ${advancedJoins}
        WHERE ${conditions.join(" AND ")} ORDER BY CASE WHEN g.start_date IS NULL THEN 1 ELSE 0 END,g.start_date,g.season_type,g.week,g.home_team`;
      const benchmarkFirstSeason=Math.max(FIRST_HISTORICAL_SEASON,season-4);
      const [rows, recordGameResult, recordTeamResult,benchmarkResult,rankingProfileResult] = await Promise.all([
        db.prepare(query).bind(...binds).all<Record<string, unknown>>(),
        db.prepare(`SELECT g.game_id AS gameId,g.week,g.start_date AS startDate,g.season_type AS seasonType,g.completed,g.neutral_site AS neutralSite,g.conference_game AS conferenceGame,
          g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
          p.home_score AS predictedHomeScore,p.away_score AS predictedAwayScore,p.home_win_probability AS homeWinProbability
          FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id AND p.model_version=?
          WHERE g.season=? ORDER BY CASE WHEN g.start_date IS NULL THEN 1 ELSE 0 END,g.start_date,g.season_type,g.week,g.game_id`)
          .bind(MODEL_VERSION, season).all<Record<string, unknown>>(),
        db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{team:string}>(),
        gameId?db.prepare(`SELECT
          MIN(stats.season) AS benchmarkFirstSeason,MAX(stats.season) AS benchmarkLastSeason,COUNT(*) AS benchmarkSampleSize,
          AVG(stats.total_yards) AS benchmarkTotalYards,AVG(stats.yards_per_play) AS benchmarkYardsPerPlay,
          AVG(stats.pass_yards) AS benchmarkPassYards,AVG(stats.pass_attempts) AS benchmarkPassAttempts,
          AVG(stats.pass_completions) AS benchmarkPassCompletions,AVG(stats.yards_per_pass) AS benchmarkYardsPerPass,
          AVG(stats.rush_yards) AS benchmarkRushYards,AVG(stats.rush_attempts) AS benchmarkRushAttempts,
          AVG(stats.yards_per_rush) AS benchmarkYardsPerRush,AVG(stats.turnovers) AS benchmarkTurnovers,
          AVG(CAST(json_extract(advanced.component_json,'$.offSuccessRate') AS REAL)) AS benchmarkSuccessRate,
          AVG(CAST(json_extract(advanced.component_json,'$.offExplosiveness') AS REAL)) AS benchmarkExplosiveness,
          AVG(CAST(json_extract(advanced.component_json,'$.offPpa') AS REAL)) AS benchmarkPpa,
          AVG(CASE WHEN CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL)>0
            THEN stats.points*1.0/CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL) END) AS benchmarkPointsPerDrive,
          AVG(CASE WHEN CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL)>0
            THEN CAST(json_extract(advanced.component_json,'$.offPlays') AS REAL)/CAST(json_extract(advanced.component_json,'$.offDrives') AS REAL) END) AS benchmarkPlaysPerDrive,
          AVG(CAST(json_extract(advanced.component_json,'$.offHavocRate') AS REAL)) AS benchmarkHavocRate,
          AVG(COALESCE(CAST(json_extract(advanced.component_json,'$.offLineYards') AS REAL),advanced.off_line_yards)) AS benchmarkLineYards,
          AVG(COALESCE(CAST(json_extract(advanced.component_json,'$.offSecondLevelYards') AS REAL),advanced.off_second_level_yards)) AS benchmarkSecondLevelYards,
          AVG(COALESCE(CAST(json_extract(advanced.component_json,'$.offOpenFieldYards') AS REAL),advanced.off_open_field_yards)) AS benchmarkOpenFieldYards,
          AVG(CAST(json_extract(advanced.component_json,'$.offStuffRate') AS REAL)) AS benchmarkStuffRate,
          AVG(CAST(json_extract(advanced.component_json,'$.offPowerSuccess') AS REAL)) AS benchmarkPowerSuccess,
          AVG(CAST(json_extract(advanced.component_json,'$.offRushingSuccessRate') AS REAL)) AS benchmarkRushingSuccessRate,
          AVG(CAST(json_extract(advanced.component_json,'$.offRushingExplosiveness') AS REAL)) AS benchmarkRushingExplosiveness,
          AVG(CAST(json_extract(advanced.component_json,'$.offRushingPpa') AS REAL)) AS benchmarkRushingPpa,
          AVG(CASE WHEN stats.pass_attempts>0 AND stats.pass_completions IS NOT NULL THEN stats.pass_completions*1.0/stats.pass_attempts END) AS benchmarkCompletionRate,
          AVG(CASE WHEN stats.pass_completions>0 THEN stats.pass_yards*1.0/stats.pass_completions END) AS benchmarkYardsPerCompletion,
          AVG(COALESCE(CAST(json_extract(advanced.component_json,'$.offPassingSuccessRate') AS REAL),advanced.off_passing_success_rate)) AS benchmarkPassingSuccessRate,
          AVG(COALESCE(CAST(json_extract(advanced.component_json,'$.offPassingExplosiveness') AS REAL),advanced.off_passing_explosiveness)) AS benchmarkPassingExplosiveness,
          AVG(CAST(json_extract(advanced.component_json,'$.offPassingPpa') AS REAL)) AS benchmarkPassingPpa,
          AVG(CAST(json_extract(advanced.component_json,'$.offStandardDownSuccessRate') AS REAL)) AS benchmarkStandardDownSuccessRate,
          AVG(CAST(json_extract(advanced.component_json,'$.offPassingDownSuccessRate') AS REAL)) AS benchmarkPassingDownSuccessRate
        FROM team_game_stats stats
        JOIN cfb_games game ON game.game_id=stats.game_id AND game.completed=1
        JOIN cfb_teams team ON team.season=stats.season AND team.team=stats.team
          LEFT JOIN team_game_advanced_stats advanced ON advanced.game_id=stats.game_id AND advanced.team=stats.team
          WHERE stats.season BETWEEN ? AND ?`).bind(benchmarkFirstSeason,season).first<Record<string,unknown>>():Promise.resolve(null),
        includeGameTimeRanks?db.prepare(`SELECT wp.week,wp.team,t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo,ap.profile_json AS advancedProfile,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex
          FROM weekly_profiles wp LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
          LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
          WHERE wp.season=? ORDER BY wp.week,wp.team`).bind(season).all<Record<string,unknown>>().then((queryResult)=>queryResult.results):Promise.resolve([] as Record<string,unknown>[]),
      ]);
      const conferenceChampionshipIds=conferenceChampionshipGameIds(recordGameResult.results);
      for(const row of rows.results){
        if(conferenceChampionshipIds.has(String(row.gameId)))row.seasonType="conference-championship";
      }
      let rankingProfileRows=rankingProfileResult;
      let transitionPreseasonProfiles:Profile[]|null=null;
      if(includeGameTimeRanks){
        transitionPreseasonProfiles=await loadPreseasonProfiles(db,season,new Set(recordTeamResult.results.map((row)=>row.team)));
        const freshPreseason=await freshPreseasonRows(db,season,transitionPreseasonProfiles);
        const preseasonEloByTeam=new Map(freshPreseason.map((row)=>[String(row.team),row.preseasonElo]));
        rankingProfileRows=[
          ...freshPreseason,
          ...rankingProfileRows.filter((row)=>Number(row.week)!==0).map((row)=>({
            ...row,
            preseasonElo:preseasonEloByTeam.get(String(row.team))??1500,
          })),
        ];
      }
      const pregameRanks=schedulePregameRanks(season,rows.results,rankingProfileRows,recordGameResult.results);
      const ranksFor=(row:Record<string,unknown>)=>pregameRanks.get(String(row.gameId))??{homePregameRank:null,awayPregameRank:null,rankingWeek:null};
      const statBenchmarks=gameStatBenchmarkProfile(benchmarkResult);
      if(statBenchmarks)for(const row of rows.results)row.statBenchmarks=statBenchmarks;
      const recordTimeline = buildScheduleRecordTimeline(
        recordGameResult.results.map((row):ScheduleRecordGame => ({
          gameId:String(row.gameId),
          week:Number(row.week),
          startDate:row.startDate ? String(row.startDate) : null,
          seasonType:String(row.seasonType ?? "regular"),
          completed:Boolean(row.completed),
          homeTeam:String(row.homeTeam),
          homePoints:nullableNumber(row.homePoints),
          awayTeam:String(row.awayTeam),
          awayPoints:nullableNumber(row.awayPoints),
          predictedHomeScore:nullableNumber(row.predictedHomeScore),
          predictedAwayScore:nullableNumber(row.predictedAwayScore),
          homeWinProbability:nullableNumber(row.homeWinProbability),
        })),
        new Set(recordTeamResult.results.map((row)=>row.team)),
      );
      const recordsFor = (row:Record<string,unknown>) => recordTimeline.get(String(row.gameId)) ?? {
        homeRecordAfter:null,
        awayRecordAfter:null,
        recordStatus:"unavailable" as const,
      };
      const needsLiveProjection = rows.results.some((row) => nullableNumber(row.predictedHomeScore) === null || row.storedModelVersion !== MODEL_VERSION)
        || includeMarketDecisions && rows.results.some((row) => !Boolean(row.completed) && (nullableNumber(row.vegasSpread) !== null || nullableNumber(row.vegasTotal) !== null));

      // The schedule is primarily a compact ledger. Once the versioned
      // predictions exist, opening the page should not load every profile,
      // rebuild Elo/evidence, and generate hundreds of full X-rays.
      if ((compactSchedule || !needsLiveProjection) && !includeGameProfiles) {
        const compact = rows.results.map((row) => {
          const lineQuarantined = isStoredMarketLineQuarantined(Number(row.season), row.provider ? String(row.provider) : null);
          const spreadEdge = nullableNumber(row.spreadEdge);
          const spreadResult = String(row.spreadResult ?? "");
          const spreadQualified = !lineQuarantined && (spreadResult === "W" || spreadResult === "L" || spreadResult === "PUSH");
          const homePoints = nullableNumber(row.homePoints);
          const awayPoints = nullableNumber(row.awayPoints);
          const modelTotal = nullableNumber(row.modelTotal);
          const totalDiagnostic = modelTotal === null ? { qualified:false,recommendation:"PASS",result:null } : evaluateTotalDiagnostic({
            week:Number(row.week),
            postseason:String(row.seasonType ?? "") === "postseason",
            modelTotal,
            vegasTotal:lineQuarantined ? null : nullableNumber(row.vegasTotal),
            actualTotal:homePoints === null || awayPoints === null ? null : homePoints + awayPoints,
          });
          return {
            ...withActualGameStats(row),
            ...recordsFor(row),
            ...ranksFor(row),
            spreadEdge:lineQuarantined?null:row.spreadEdge,
            totalEdge:lineQuarantined?null:row.totalEdge,
            spreadResult:lineQuarantined?null:row.spreadResult,
            totalResult:lineQuarantined?null:row.totalResult,
            spreadQualified,
            totalQualified:false,
            spreadRecommendation:lineQuarantined?"LINE QUARANTINED":spreadQualified&&spreadEdge!==null?(spreadEdge>0?`${row.homeTeam} ATS`:`${row.awayTeam} ATS`):"PASS",
            totalRecommendation:"PASS",
            totalDiagnosticQualified:!lineQuarantined&&totalDiagnostic.qualified,
            totalDiagnosticRecommendation:lineQuarantined?"PASS":totalDiagnostic.recommendation,
            totalDiagnosticResult:lineQuarantined?null:totalDiagnostic.result,
            lineQuality:lineQuarantined?"quarantined":marketLineSeasonStatus(Number(row.season)),
            lineQualityReason:lineQuarantined?"Legacy consensus favorite direction is not independently verified":null,
            predictionSource:nullableNumber(row.predictedHomeScore)!==null&&row.storedModelVersion===MODEL_VERSION?"materialized":"pending",
          };
        });
        const response=Response.json({ source:"database",configured:Boolean(runtime.CFBD_API_KEY),season,week:requestedWeek,team:team||null,modelVersion:MODEL_VERSION,marketCalibration:marketModelCalibration,rows:compact });
        response.headers.set("cache-control","public, max-age=300, stale-while-revalidate=900");
        return response;
      }

      const [profileResult, gameResult, teamResult] = await Promise.all([
        db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
          wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
          wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
          ap.profile_json AS advancedProfile
          FROM weekly_profiles wp LEFT JOIN weekly_advanced_profiles ap ON ap.season=wp.season AND ap.week=wp.week AND ap.team=wp.team
          WHERE wp.season=? ORDER BY wp.week,wp.team`).bind(season).all<Record<string, unknown>>(),
        db.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,start_date AS startDate,completed,neutral_site AS neutralSite,conference_game AS conferenceGame,venue,
          home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
          FROM cfb_games WHERE season=? ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date,season_type,week,game_id`).bind(season).all<Record<string, unknown>>(),
        db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
      ]);
      const storedProfiles = profileResult.results.map((row): Profile => ({
        season: Number(row.season), week: Number(row.week), team: String(row.team), gamesPlayed: Number(row.gamesPlayed ?? 0),
        off: tuple(row, "off"), def: tuple(row, "def"), oi: tuple(row, "off", "Index"), di: tuple(row, "def", "Index"),
        advanced: parseAdvancedProfile(row.advancedProfile),
      }));
      if (!storedProfiles.length) {
        return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, week: requestedWeek, team: team || null, modelVersion: MODEL_VERSION, rows: rows.results.map((row) => ({ ...withActualGameStats(row), ...recordsFor(row), ...ranksFor(row), predictionSource: "pending" })) });
      }
      const games = gameResult.results.map((row): NormalizedGame => ({
        id: String(row.gameId), season: Number(row.season), week: Number(row.week), seasonType: String(row.seasonType ?? "regular"), startDate: row.startDate ? String(row.startDate) : null,
        completed: Boolean(row.completed), neutralSite: Boolean(row.neutralSite), conferenceGame: Boolean(row.conferenceGame), venue: row.venue ? String(row.venue) : null,
        homeTeam: String(row.homeTeam), homeConference: row.homeConference ? String(row.homeConference) : null, homePoints: nullableNumber(row.homePoints),
        awayTeam: String(row.awayTeam), awayConference: row.awayConference ? String(row.awayConference) : null, awayPoints: nullableNumber(row.awayPoints),
      }));
      const eligibleTeams = new Set(teamResult.results.map((row) => row.team));
      const preseasonProfiles = transitionPreseasonProfiles??await loadPreseasonProfiles(db,season,eligibleTeams);
      const profiles = [...preseasonProfiles,...storedProfiles.filter((profile)=>profile.week>0)];
      const pregameElo = buildPregameElo(games, preseasonProfiles, eligibleTeams);
      const pregameEvidence = buildPregameMatchupEvidence(games, pregameElo, eligibleTeams);
      const maxProfileWeek = Math.max(0, ...profiles.map((profile) => profile.week));
      const byGame = new Map(games.map((game) => [game.id, game]));
      const enriched = rows.results.map((row) => {
        const game = byGame.get(String(row.gameId));
        if (!game) return { ...withActualGameStats(row), predictionSource: "pending" };
        const generatedFromWeek = nullableNumber(row.generatedFromWeek) ?? (game.seasonType === "postseason" ? maxProfileWeek : Math.max(0, game.week - 1));
        const homeProfile = latestProfile(profiles, game.homeTeam, generatedFromWeek);
        const awayProfile = latestProfile(profiles, game.awayTeam, generatedFromWeek);
        const ratings = pregameElo.get(game.id);
        const evidence = pregameEvidence.get(game.id);
        const calibrated = project(
          homeProfile,
          awayProfile,
          game.neutralSite,
          ratings?.get(game.homeTeam) ?? (eligibleTeams.has(game.homeTeam) ? 1500 : modelCalibration.fcsElo),
          ratings?.get(game.awayTeam) ?? (eligibleTeams.has(game.awayTeam) ? 1500 : modelCalibration.fcsElo),
          evidence?.get(game.homeTeam),
          evidence?.get(game.awayTeam),
          { homeIsFcs: !eligibleTeams.has(game.homeTeam), awayIsFcs: !eligibleTeams.has(game.awayTeam) },
        );
        const vegasSpread = nullableNumber(row.vegasSpread);
        const vegasTotal = nullableNumber(row.vegasTotal);
        const lineQuarantined = isStoredMarketLineQuarantined(game.season, row.provider ? String(row.provider) : null);
        const actualMargin = game.homePoints === null || game.awayPoints === null ? null : game.homePoints - game.awayPoints;
        const actualTotal = game.homePoints === null || game.awayPoints === null ? null : game.homePoints + game.awayPoints;
        const market = evaluateMarketProjection({
          week: game.week, postseason: game.seasonType === "postseason", homeTeam: game.homeTeam, awayTeam: game.awayTeam,
          modelHomeSpread: calibrated.modelHomeSpread, modelTotal: calibrated.modelTotal,
          homeYpa: calibrated.homeStats.ypa, awayYpa: calibrated.awayStats.ypa,
          homeYpc: calibrated.homeStats.ypc, awayYpc: calibrated.awayStats.ypc,
          homeDefenseIndex: calibrated.calibratedHome.defense.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3,
          awayDefenseIndex: calibrated.calibratedAway.defense.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3,
          vegasSpread, vegasTotal, actualMargin, actualTotal,
        });
        const displayMarket = lineQuarantined ? {
          ...market,
          spreadEdge:null,
          totalEdge:null,
          spreadQualified:false,
          totalQualified:false,
          spreadRecommendation:"LINE QUARANTINED",
          totalRecommendation:"PASS",
          spreadResult:null,
          totalResult:null,
          totalDiagnosticQualified:false,
          totalDiagnosticRecommendation:"PASS",
          totalDiagnosticResult:null,
        } : market;
        const lineQuality = lineQuarantined ? "quarantined" : marketLineSeasonStatus(game.season);
        const lineQualityReason = lineQuarantined ? "Legacy consensus favorite direction is not independently verified" : null;
        if (!needsLiveProjection && nullableNumber(row.modelHomeSpread) !== null) {
          const edgeAnalysis = includeAnalysis ? analyzeMatchupEdges(
            game.homeTeam, game.awayTeam, calibrated.calibratedHome.offense, calibrated.calibratedHome.defense,
            calibrated.calibratedAway.offense, calibrated.calibratedAway.defense, game.neutralSite, -Number(row.modelHomeSpread),
            calibrated.homeStats.advanced, calibrated.awayStats.advanced,
            calibrated.calibratedHome.advanced, calibrated.calibratedAway.advanced,
            calibrated.homeStats.scoreReceipt, calibrated.awayStats.scoreReceipt,
            calibrated.homeStats.viability, calibrated.awayStats.viability,
          ) : undefined;
          return { ...withActualGameStats(row), generatedFromWeek, ...displayMarket, lineQuality, lineQualityReason, edgeAnalysis, homePredictedStats:projectedGameStatProfile(calibrated.homeStats),awayPredictedStats:projectedGameStatProfile(calibrated.awayStats),homePredictedAdvanced:projectedGameAdvancedProfile(calibrated.homeStats.advanced),awayPredictedAdvanced:projectedGameAdvancedProfile(calibrated.awayStats.advanced),predictionSource: "materialized" };
        }
        if (nullableNumber(row.predictedHomeScore) !== null && row.storedModelVersion === MODEL_VERSION) {
          const edgeAnalysis = includeAnalysis ? analyzeMatchupEdges(
            game.homeTeam, game.awayTeam, calibrated.calibratedHome.offense, calibrated.calibratedHome.defense,
            calibrated.calibratedAway.offense, calibrated.calibratedAway.defense, game.neutralSite, -Number(row.modelHomeSpread ?? 0),
            calibrated.homeStats.advanced, calibrated.awayStats.advanced,
            calibrated.calibratedHome.advanced, calibrated.calibratedAway.advanced,
            calibrated.homeStats.scoreReceipt, calibrated.awayStats.scoreReceipt,
            calibrated.homeStats.viability, calibrated.awayStats.viability,
          ) : undefined;
          return { ...withActualGameStats(row), generatedFromWeek, ...displayMarket, lineQuality, lineQualityReason, edgeAnalysis, homePredictedStats:projectedGameStatProfile(calibrated.homeStats),awayPredictedStats:projectedGameStatProfile(calibrated.awayStats),homePredictedAdvanced:projectedGameAdvancedProfile(calibrated.homeStats.advanced),awayPredictedAdvanced:projectedGameAdvancedProfile(calibrated.awayStats.advanced),predictionSource: "materialized" };
        }
        const prediction = calibrated;
        const edgeAnalysis = includeAnalysis ? analyzeMatchupEdges(
          game.homeTeam, game.awayTeam, prediction.calibratedHome.offense, prediction.calibratedHome.defense,
          prediction.calibratedAway.offense, prediction.calibratedAway.defense, game.neutralSite, prediction.margin,
          prediction.homeStats.advanced, prediction.awayStats.advanced,
          prediction.calibratedHome.advanced, prediction.calibratedAway.advanced,
          prediction.homeStats.scoreReceipt, prediction.awayStats.scoreReceipt,
          prediction.homeStats.viability, prediction.awayStats.viability,
        ) : undefined;
        return {
          ...withActualGameStats(row),
          generatedFromWeek,
          predictedHomeScore: prediction.homeScore,
          predictedAwayScore: prediction.awayScore,
          homeWinProbability: prediction.homeWinProbability,
          modelHomeSpread: prediction.modelHomeSpread,
          modelTotal: prediction.modelTotal,
          spreadEdge: displayMarket.spreadEdge,
          totalEdge: displayMarket.totalEdge,
          spreadError: actualMargin === null ? null : Math.abs(prediction.margin - actualMargin),
          totalError: actualTotal === null ? null : Math.abs(prediction.modelTotal - actualTotal),
          spreadResult: displayMarket.spreadResult,
          totalResult: displayMarket.totalResult,
          spreadQualified: displayMarket.spreadQualified,
          totalQualified: displayMarket.totalQualified,
          spreadRecommendation: displayMarket.spreadRecommendation,
          totalRecommendation: displayMarket.totalRecommendation,
          totalDiagnosticQualified: displayMarket.totalDiagnosticQualified,
          totalDiagnosticRecommendation: displayMarket.totalDiagnosticRecommendation,
          totalDiagnosticResult: displayMarket.totalDiagnosticResult,
          positionScore: displayMarket.positionScore,
          lineQuality,
          lineQualityReason,
          edgeAnalysis,
          homePredictedStats:projectedGameStatProfile(prediction.homeStats),
          awayPredictedStats:projectedGameStatProfile(prediction.awayStats),
          homePredictedAdvanced:projectedGameAdvancedProfile(prediction.homeStats.advanced),
          awayPredictedAdvanced:projectedGameAdvancedProfile(prediction.awayStats.advanced),
          storedModelVersion: MODEL_VERSION,
          predictionSource: "live-profile",
        };
      });
      const response=Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, week: requestedWeek, team: team || null, modelVersion: MODEL_VERSION, marketCalibration: marketModelCalibration, rows: enriched.map((row)=>({...row,...recordsFor(row),...ranksFor(row)})), viabilityCalibration:currentViabilityCalibration() });
      response.headers.set("cache-control","public, max-age=120, stale-while-revalidate=600");
      return response;
    }

    const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
    const effectiveWeek = effective?.week ?? requestedWeek;
    const finalContextApplied = requestedWeek === 16 && effectiveWeek > 0;
    const profilePromise = loadPointInTimeProfileRows(db,season,effectiveWeek);
    const finalGameQuery = `SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,conference_game AS conferenceGame,
        home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
        FROM cfb_games WHERE season=? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY start_date,game_id`;
    const weeklyGameQuery = `SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,neutral_site AS neutralSite,conference_game AS conferenceGame,
        home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
        FROM cfb_games WHERE season=? AND completed=1 AND season_type<>'postseason' AND week<=?
        AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY week,start_date,game_id`;
    const [profileRows, gameResult] = await Promise.all([
      profilePromise,
      finalContextApplied
        ? db.prepare(finalGameQuery).bind(season).all<RankingGame & { seasonType:string }>()
        : db.prepare(weeklyGameQuery).bind(season,effectiveWeek).all<RankingGame & { seasonType:string }>(),
    ]);
    const conferenceChampionshipIds=conferenceChampionshipGameIds(gameResult.results);
    const rankingGameRows=gameResult.results.map((game)=>({...game,conferenceChampionship:conferenceChampionshipIds.has(game.gameId)}));
    const rankings = buildBcsRankings(rankingGameRows, rankingProfiles(profileRows));
    const evidence = new Map(rankings.map((row) => [row.team, row]));
    const titleGame = finalContextApplied ? gameResult.results.filter((game)=>game.seasonType==="postseason")
      .sort((a,b)=>String(b.startDate??"").localeCompare(String(a.startDate??""))||String(b.gameId).localeCompare(String(a.gameId)))[0] : undefined;
    const champion = titleGame ? (Number(titleGame.homePoints)>Number(titleGame.awayPoints)?titleGame.homeTeam:titleGame.awayTeam) : null;
    const enriched = profileRows.map((row) => {
      const ranking = evidence.get(String(row.team));
      const gamesPlayed = (ranking?.wins??0)+(ranking?.losses??0)+(ranking?.ties??0);
      const winPct = gamesPlayed ? ((ranking?.wins??0)+0.5*(ranking?.ties??0))/gamesPlayed : 0.5;
      const nationalChampion = finalContextApplied && champion===String(row.team);
      const resumeScore = finalContextApplied && ranking ? Math.max(0,Math.min(1,0.55*ranking.bcsScore+0.3*winPct+0.15*(nationalChampion?1:0))) : undefined;
      return {
        ...row,
        advancedProfile: parseAdvancedProfile(row.advancedProfile),
        eloRating: effectiveWeek===0?Number(row.preseasonElo??1500):ranking?.eloRating??1500,
        crossEraRating: finalContextApplied && ranking ? finalMatchupRating(ranking,rankingGameRows,String(row.team)) : undefined,
        scheduleStrength: ranking?.scheduleStrength ?? 0.5,
        bestOpponentStrength: ranking?.bestOpponentStrength ?? 0.5,
        qualityWinStrength: ranking?.qualityWinStrength ?? 0.5,
        matchupReliability: ranking?.matchupReliability ?? 1,
        resumeScore,
        nationalChampion,
        seasonRecord: finalContextApplied ? ranking?.record??"—" : undefined,
        finalContextApplied,
      };
    });
    return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, requestedWeek, effectiveWeek, modelVersion: MODEL_VERSION, rows: enriched, viabilityCalibration:currentViabilityCalibration() });
  } catch (error) {
    return Response.json({ source: "embedded", configured: Boolean(runtime.CFBD_API_KEY), rows: [], message: error instanceof Error ? error.message : "Data query failed" });
  }
}
