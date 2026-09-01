import { currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import {
  loadPlayerProductionBaseline,
  loadSeasonOffensiveLineUnitScores,
} from "../../../lib/playerPipeline";
import {
  FIRST_PLAYER_SEASON,
  INITIAL_PLAYER_SEASON,
  PLAYER_MODEL_VERSION,
  observedPlayerProductionScore,
  playerBasicMetric,
  productionPosition,
  type PlayerProfile,
} from "../../../lib/playerModel";
import {
  comparePlayerRatingEvidence,
  empiricalProductionPercentiles,
  provisionalProductionOverallFromPercentile,
  productionPercentileFromScale,
  productionRatingFromScale,
  projectedProductionRating,
} from "../../../lib/playerProductionRatings";
import {
  PLAYER_STATS_POSITIONS,
  offensiveLineJerseyNumber,
  defaultPlayerStatsSortDirection,
  playerStatsColumns,
  playerStatsDefaultSortKey,
  playerStatsMetricColumns,
  playerMeetsScatterParticipationThreshold,
  playerStatsOrdinalRanks,
  playerStatsQualification,
  playerQualifiesForStat,
  historicalProductionRank,
  sortPlayerStatsRows,
  type PlayerStatsMetricKey,
  type PlayerStatsMetrics,
  type PlayerStatsPosition,
  type PlayerStatsRow,
  type PlayerStatsSortKey,
} from "../../../lib/playerStats";
import { conferenceFilterSqlValues, matchesConferenceFilter } from "../../../lib/conferenceFilters";

type RuntimeEnv = PipelineEnv & { DB?: D1Database };
type SortKey = "overall" | "name" | "team" | "conference" | "position";
type Direction = "asc" | "desc";

type RawPlayerRow = {
  team?: unknown;
  teamId?: unknown;
  abbreviation?: unknown;
  conference?: unknown;
  color?: unknown;
  altColor?: unknown;
  logo?: unknown;
  playerJson?: unknown;
  id?: unknown;
  displayName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  jersey?: unknown;
  position?: unknown;
  positionGroup?: unknown;
  playerYear?: unknown;
  playerStatsJson?: unknown;
  playerAdvancedJson?: unknown;
  productionVolumeScore?: unknown;
  productionScore?: unknown;
  normalizedScore?: unknown;
  normalizedPercentile?: unknown;
  projectedStarter?: unknown;
  recruitingStars?: unknown;
  recruitingRating?: unknown;
  ratingSource?: unknown;
  opponentRelative?: unknown;
  opponentUnitQuality?: unknown;
  supportQuality?: unknown;
  usageRate?: unknown;
  profileUsageRate?: unknown;
  passPpa?: unknown;
  rushPpa?: unknown;
  passingSuccessRate?: unknown;
  rushingSuccessRate?: unknown;
  passCompletions?: unknown;
  passAttempts?: unknown;
  passYards?: unknown;
  passTd?: unknown;
  passInterceptions?: unknown;
  rushYards?: unknown;
  rushAttempts?: unknown;
  rushTd?: unknown;
  receptions?: unknown;
  receivingYards?: unknown;
  receivingTd?: unknown;
  kickReturnYards?: unknown;
  puntReturnYards?: unknown;
  tackles?: unknown;
  tfl?: unknown;
  sacks?: unknown;
  qbHurries?: unknown;
  passesDefended?: unknown;
  defensiveInterceptions?: unknown;
  fumbleRecoveries?: unknown;
  fieldGoalsMade?: unknown;
  fieldGoalsAttempted?: unknown;
  extraPointsMade?: unknown;
  punts?: unknown;
  puntYards?: unknown;
  statRows?: unknown;
};

type StatProfileItem = {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "warning";
};

const supportedPositions:readonly string[] = PLAYER_STATS_POSITIONS;
const validSortKeys = new Set<SortKey>(["overall", "name", "team", "conference", "position"]);

function response(body: unknown, status = 200, cacheControl = "no-store") {
  const output = Response.json(body, { status });
  output.headers.set("cache-control", cacheControl);
  return output;
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fallbackAllEraScore(row:RawPlayerRow){
  try{
    const stats=JSON.parse(text(row.playerStatsJson));
    const advanced=JSON.parse(text(row.playerAdvancedJson));
    if(!Array.isArray(stats)||!advanced||typeof advanced!=="object")return null;
    const player={
      position:text(row.position)||"ATH",
      positionGroup:text(row.positionGroup)||"ATHLETES",
      productionVolumeScore:finiteNumber(row.productionVolumeScore),
      stats,
      advanced,
    } as PlayerProfile;
    return finiteNumber(observedPlayerProductionScore(player));
  }catch{
    return null;
  }
}

function opponentEdgePercent(relative: number | null) {
  return relative === null ? null : Math.round((relative - .5) * 50);
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function playerStatProfile(
  row: RawPlayerRow,
  position: string,
  opponentRelative: number | null,
  usageRate: number | null,
  opponentUnitQuality: number | null,
): StatProfileItem[] {
  const numeric = (value: unknown) => finiteNumber(value) ?? 0;
  const result: StatProfileItem[]=[];
  const push=(label:string,value:string,tone:StatProfileItem["tone"]="neutral")=>{
    if(value&&value!=="—")result.push({label,value,tone});
  };
  const passAttempts=numeric(row.passAttempts),passCompletions=numeric(row.passCompletions);
  const passYards=numeric(row.passYards),passTd=numeric(row.passTd),passInt=numeric(row.passInterceptions);
  const rushAttempts=numeric(row.rushAttempts),rushYards=numeric(row.rushYards);
  const receptions=numeric(row.receptions),receivingYards=numeric(row.receivingYards);
  const passingSuccess=finiteNumber(row.passingSuccessRate),rushingSuccess=finiteNumber(row.rushingSuccessRate);
  const passPpa=finiteNumber(row.passPpa),rushPpa=finiteNumber(row.rushPpa);
  const allPurposeYards = numeric(row.rushYards)+numeric(row.receivingYards)
    +numeric(row.kickReturnYards)+numeric(row.puntReturnYards);
  if(position==="QB"){
    if(passAttempts>0)push(
      passCompletions>0?"COMP / YPA":"YPA",
      passCompletions>0
        ?`${Math.round(100*passCompletions/passAttempts)}% · ${(passYards/passAttempts).toFixed(1)}`
        :(passYards/passAttempts).toFixed(1),
    );
    if(passPpa!==null||passingSuccess!==null)push("PPA / SUCCESS",`${passPpa===null?"—":passPpa.toFixed(2)} · ${passingSuccess===null?"—":`${Math.round(100*passingSuccess)}%`}`);
    push("TD – INT",`${passTd} – ${passInt}`,passAttempts>0&&passInt/passAttempts>.035?"warning":"neutral");
  }else if(position==="RB"){
    if(rushAttempts>0)push("YPC",(rushYards/rushAttempts).toFixed(2));
    if(rushPpa!==null||rushingSuccess!==null)push("PPA / SUCCESS",`${rushPpa===null?"—":rushPpa.toFixed(2)} · ${rushingSuccess===null?"—":`${Math.round(100*rushingSuccess)}%`}`);
    if(usageRate!==null)push("USAGE",`${Math.round(100*usageRate)}%`,usageRate>=.35?"positive":"neutral");
    else if(allPurposeYards>0)push("ALL-PURPOSE",allPurposeYards.toFixed(0));
  }else if(position==="WR"||position==="TE"){
    if(receptions>0)push("YDS / REC",(receivingYards/receptions).toFixed(1));
    if(passPpa!==null||passingSuccess!==null)push("PPA / SUCCESS",`${passPpa===null?"—":passPpa.toFixed(2)} · ${passingSuccess===null?"—":`${Math.round(100*passingSuccess)}%`}`);
    if(usageRate!==null)push("USAGE",`${Math.round(100*usageRate)}%`,usageRate>=.25?"positive":"neutral");
  }else if(position==="EDGE"||position==="DL"){
    push("TFL / SACK",`${numeric(row.tfl).toFixed(1)} · ${numeric(row.sacks).toFixed(1)}`);
    push("SACK + HURRY",`${(numeric(row.sacks)+numeric(row.qbHurries)).toFixed(1)}`);
    push("TACKLES",numeric(row.tackles).toFixed(0));
  }else if(position==="LB"){
    push("TACKLES",numeric(row.tackles).toFixed(0));
    push("TFL / SACK",`${numeric(row.tfl).toFixed(1)} · ${numeric(row.sacks).toFixed(1)}`);
    push("BALL PLAYS",`${numeric(row.passesDefended)+numeric(row.defensiveInterceptions)+numeric(row.fumbleRecoveries)}`);
  }else if(position==="CB"||position==="S"){
    push("PD / INT",`${numeric(row.passesDefended)} · ${numeric(row.defensiveInterceptions)}`);
    push("TACKLES",numeric(row.tackles).toFixed(0));
    push("TFL",numeric(row.tfl).toFixed(1));
  }
  const fieldGoalAttempts=numeric(row.fieldGoalsAttempted),fieldGoalsMade=numeric(row.fieldGoalsMade);
  const punts=numeric(row.punts),puntYards=numeric(row.puntYards);
  if(position==="K"&&fieldGoalAttempts>0){push("FG",`${fieldGoalsMade}/${fieldGoalAttempts}`);push("FG %",`${Math.round(100*fieldGoalsMade/fieldGoalAttempts)}%`);}
  if(position==="P"&&punts>0){push("PUNT AVG",(puntYards/punts).toFixed(1));push("PUNTS",punts.toFixed(0));}
  const edge = opponentEdgePercent(opponentRelative);
  if (edge !== null) result.push({
    label:"VS OPP",
    value:signedPercent(edge),
    tone:edge >= 5 ? "positive" : edge <= -5 ? "warning" : "neutral",
  });
  if(result.length<4&&opponentUnitQuality!==null)push("OPP UNIT",`${Math.round(opponentUnitQuality*100)}/100`,opponentUnitQuality>=.67?"positive":"neutral");
  return result.slice(0,4);
}

function playerStatsMetrics(
  row:RawPlayerRow,
  opponentRelative:number|null,
  usageRate:number|null,
  opponentUnitQuality:number|null,
  supportQuality:number|null,
):PlayerStatsMetrics {
  const numeric=(value:unknown)=>finiteNumber(value)??0;
  const passAttempts=numeric(row.passAttempts),passCompletions=numeric(row.passCompletions),passYards=numeric(row.passYards);
  const rushAttempts=numeric(row.rushAttempts),rushYards=numeric(row.rushYards);
  const receptions=numeric(row.receptions),receivingYards=numeric(row.receivingYards);
  const fieldGoalsMade=numeric(row.fieldGoalsMade),fieldGoalsAttempted=numeric(row.fieldGoalsAttempted);
  const punts=numeric(row.punts),puntYards=numeric(row.puntYards);
  const sacks=numeric(row.sacks),qbHurries=numeric(row.qbHurries);
  const passesDefended=numeric(row.passesDefended),defensiveInterceptions=numeric(row.defensiveInterceptions),fumbleRecoveries=numeric(row.fumbleRecoveries);
  return {
    passAttempts,
    passCompletions,
    completionRate:passAttempts>0?passCompletions/passAttempts:null,
    passYards,
    yardsPerAttempt:passAttempts>0?passYards/passAttempts:null,
    passTd:numeric(row.passTd),
    passInterceptions:numeric(row.passInterceptions),
    rushAttempts,
    rushYards,
    yardsPerCarry:rushAttempts>0?rushYards/rushAttempts:null,
    rushTd:numeric(row.rushTd),
    receptions,
    receivingYards,
    yardsPerReception:receptions>0?receivingYards/receptions:null,
    receivingTd:numeric(row.receivingTd),
    allPurposeYards:rushYards+receivingYards+numeric(row.kickReturnYards)+numeric(row.puntReturnYards),
    usageRate:usageRate??finiteNumber(row.profileUsageRate),
    passPpa:finiteNumber(row.passPpa),
    rushPpa:finiteNumber(row.rushPpa),
    passingSuccessRate:finiteNumber(row.passingSuccessRate),
    rushingSuccessRate:finiteNumber(row.rushingSuccessRate),
    opponentRelative,
    opponentUnitQuality,
    supportQuality,
    tackles:numeric(row.tackles),
    tfl:numeric(row.tfl),
    sacks,
    qbHurries,
    pressures:sacks+qbHurries,
    passesDefended,
    defensiveInterceptions,
    fumbleRecoveries,
    ballPlays:passesDefended+defensiveInterceptions+fumbleRecoveries,
    fieldGoalsMade,
    fieldGoalsAttempted,
    fieldGoalRate:fieldGoalsAttempted>0?fieldGoalsMade/fieldGoalsAttempted:null,
    extraPointsMade:numeric(row.extraPointsMade),
    punts,
    puntYards,
    puntAverage:punts>0?puntYards/punts:null,
    unitScore:null,
  };
}

function playerPosition(row: RawPlayerRow) {
  return productionPosition({
    position:text(row.position) || "ATH",
    positionGroup:text(row.positionGroup) || "ATHLETES",
  });
}

function scatterPlayerProfile(value:unknown) {
  let parsed=value;
  if(typeof value==="string"){
    try{parsed=JSON.parse(value);}catch{return null;}
  }
  if(!parsed||typeof parsed!=="object")return null;
  const player=parsed as PlayerProfile;
  return Array.isArray(player.stats)?player:null;
}

function provisionalPlayerKey(row: RawPlayerRow) {
  return `${text(row.team)}\u0000${text(row.id) || text(row.displayName) || `${text(row.firstName)}-${text(row.lastName)}`}`;
}

function playerStatsRankKey(row:{season:number;team:string;id:string}) {
  return `${row.season}\u0000${row.team}\u0000${row.id}`;
}

function comparison(left: string | number, right: string | number) {
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right));
}

const scatterPositionAliases:Record<Exclude<PlayerStatsPosition,"OL">,readonly string[]>={
  QB:["QB"],RB:["RB","FB"],WR:["WR"],TE:["TE"],EDGE:["DE","EDGE","OLB"],DL:["DL","DT","NT"],
  LB:["LB","ILB","MLB","WLB","SLB"],CB:["CB"],S:["S","FS","SS","DB","NB","STAR"],K:["K"],P:["P"],
};

const scatterParticipationSql:Record<Exclude<PlayerStatsPosition,"OL">,string>={
  QB:"COALESCE(stats.pass_attempts,0)>=100",
  RB:"(COALESCE(stats.rush_attempts,0)>=75 OR COALESCE(stats.receptions,0)>=20)",
  WR:"COALESCE(stats.receptions,0)>=20",
  TE:"COALESCE(stats.receptions,0)>=15",
  EDGE:"(COALESCE(stats.tackles,0)+COALESCE(stats.tfl,0)+COALESCE(stats.sacks,0)+COALESCE(stats.qb_hurries,0)+COALESCE(stats.passes_defended,0)+COALESCE(stats.defensive_interceptions,0)+COALESCE(stats.fumble_recoveries,0))>=20",
  DL:"(COALESCE(stats.tackles,0)+COALESCE(stats.tfl,0)+COALESCE(stats.sacks,0)+COALESCE(stats.qb_hurries,0)+COALESCE(stats.passes_defended,0)+COALESCE(stats.defensive_interceptions,0)+COALESCE(stats.fumble_recoveries,0))>=20",
  LB:"(COALESCE(stats.tackles,0)+COALESCE(stats.tfl,0)+COALESCE(stats.sacks,0)+COALESCE(stats.qb_hurries,0)+COALESCE(stats.passes_defended,0)+COALESCE(stats.defensive_interceptions,0)+COALESCE(stats.fumble_recoveries,0))>=20",
  CB:"(COALESCE(stats.tackles,0)+COALESCE(stats.tfl,0)+COALESCE(stats.sacks,0)+COALESCE(stats.qb_hurries,0)+COALESCE(stats.passes_defended,0)+COALESCE(stats.defensive_interceptions,0)+COALESCE(stats.fumble_recoveries,0))>=20",
  S:"(COALESCE(stats.tackles,0)+COALESCE(stats.tfl,0)+COALESCE(stats.sacks,0)+COALESCE(stats.qb_hurries,0)+COALESCE(stats.passes_defended,0)+COALESCE(stats.defensive_interceptions,0)+COALESCE(stats.fumble_recoveries,0))>=20",
  K:"(COALESCE(stats.field_goals_attempted,0)>=8 OR COALESCE(stats.extra_points_made,0)>=20)",
  P:"COALESCE(stats.punts,0)>=20",
};

async function optimizedPlayerScatterResponse(
  runtime:RuntimeEnv,
  season:number,
  statsPosition:PlayerStatsPosition,
  selectedConference:string,
  selectedTeams:string[],
) {
  const db=runtime.DB!;
  const playerConditions=["profile.season=?","profile.profile_json<>'{}'"];
  const playerBindings:Array<string|number>=[season];
  if(selectedTeams.length){
    playerConditions.push(`profile.team IN (${selectedTeams.map(()=>"?").join(",")})`);
    playerBindings.push(...selectedTeams);
  }
  if(selectedConference){
    const conferenceValues=conferenceFilterSqlValues(selectedConference);
    playerConditions.push(`team.conference IN (${conferenceValues.map(()=>"?").join(",")})`);
    playerBindings.push(...conferenceValues);
  }
  if(statsPosition!=="OL"){
    const aliases=scatterPositionAliases[statsPosition];
    playerConditions.push(`UPPER(COALESCE(CAST(json_extract(player.value,'$.position') AS TEXT),'')) IN (${aliases.map(()=>"?").join(",")})`);
    playerBindings.push(...aliases);
  }

  const playerStatement=statsPosition==="OL"
    ?db.prepare(`SELECT team,score,opponent_relative AS opponentRelative,
        opponent_unit_quality AS opponentUnitQuality,support_quality AS supportQuality
      FROM player_production_scores WHERE season=? AND position='OL'`).bind(season)
    :db.prepare(`WITH filtered_players AS (
        SELECT profile.season,profile.team,player.value AS player_json,
          COALESCE(
            NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
            NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
            printf('%s-%s',profile.team,player.key)
          ) AS player_key
        FROM player_team_profiles profile
        JOIN json_each(profile.profile_json,'$.players') AS player ON TRUE
        LEFT JOIN cfb_teams team ON team.season=profile.season AND team.team=profile.team
        WHERE ${playerConditions.join(" AND ")}
      ), player_stats AS (
        SELECT fp.season,fp.team,fp.player_key,
          COUNT(CASE WHEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) IS NOT NULL THEN 1 END) AS stat_rows,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='passing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('cmp','completions','passingcompletions') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS pass_completions,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='passing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('att','attempts','passingattempts') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS pass_attempts,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='passing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','passingyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS pass_yards,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='passing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('td','touchdowns','passingtouchdowns') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS pass_td,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='passing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('int','interceptions') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS pass_interceptions,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='rushing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','rushingyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS rush_yards,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='rushing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('car','att','attempts','carries') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS rush_attempts,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='rushing' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('td','touchdowns','rushingtouchdowns') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS rush_td,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='receiving' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('rec','receptions') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS receptions,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='receiving' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','receivingyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS receiving_yards,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='receiving' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('td','touchdowns','receivingtouchdowns') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS receiving_td,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='kickreturns' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','kickreturnyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS kick_return_yards,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='puntreturns' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','puntreturnyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS punt_return_yards,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('tot','total','tackles','totaltackles') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS tackles,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('tfl','tacklesforloss') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS tfl,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('sack','sacks') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS sacks,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('qbhur','qbhurries','hurries') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS qb_hurries,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('pd','passesdefended','passbreakups') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS passes_defended,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('defensive','defense','interceptions') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('int','interceptions') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS defensive_interceptions,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) IN ('fumbles','defensive','defense') AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('rec','recoveries','fumblerecoveries') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS fumble_recoveries,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='kicking' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('fgm','fieldgoalsmade') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS field_goals_made,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='kicking' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('fga','fieldgoalsattempted') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS field_goals_attempted,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='kicking' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('xpm','extrapointsmade','patmade') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS extra_points_made,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='punting' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('no','punts','puntattempts') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS punts,
          MAX(CASE WHEN LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_',''))='punting' AND LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) IN ('yds','yards','puntyards') THEN CAST(json_extract(stat.value,'$.numericValue') AS REAL) ELSE 0 END) AS punt_yards
        FROM filtered_players fp
        LEFT JOIN json_each(fp.player_json,'$.stats') AS stat ON TRUE
        GROUP BY fp.season,fp.team,fp.player_key
      )
      SELECT fp.team,team.team_id AS teamId,team.abbreviation,team.conference,team.color,team.alt_color AS altColor,team.logo,
        json_extract(fp.player_json,'$.id') AS id,json_extract(fp.player_json,'$.displayName') AS displayName,
        json_extract(fp.player_json,'$.firstName') AS firstName,json_extract(fp.player_json,'$.lastName') AS lastName,
        json_extract(fp.player_json,'$.jersey') AS jersey,json_extract(fp.player_json,'$.position') AS position,
        json_extract(fp.player_json,'$.positionGroup') AS positionGroup,json_extract(fp.player_json,'$.year') AS playerYear,
        json_extract(fp.player_json,'$.advanced.overallUsage') AS profileUsageRate,
        json_extract(fp.player_json,'$.advanced.passPpa') AS passPpa,json_extract(fp.player_json,'$.advanced.rushPpa') AS rushPpa,
        json_extract(fp.player_json,'$.advanced.passingSuccessRate') AS passingSuccessRate,
        json_extract(fp.player_json,'$.advanced.rushingSuccessRate') AS rushingSuccessRate,
        score.opponent_relative AS opponentRelative,score.opponent_unit_quality AS opponentUnitQuality,
        score.support_quality AS supportQuality,score.usage_rate AS usageRate,
        stats.pass_completions AS passCompletions,stats.pass_attempts AS passAttempts,stats.pass_yards AS passYards,
        stats.pass_td AS passTd,stats.pass_interceptions AS passInterceptions,stats.rush_yards AS rushYards,
        stats.rush_attempts AS rushAttempts,stats.rush_td AS rushTd,stats.receptions,stats.receiving_yards AS receivingYards,
        stats.receiving_td AS receivingTd,stats.kick_return_yards AS kickReturnYards,stats.punt_return_yards AS puntReturnYards,
        stats.tackles,stats.tfl,stats.sacks,stats.qb_hurries AS qbHurries,stats.passes_defended AS passesDefended,
        stats.defensive_interceptions AS defensiveInterceptions,stats.fumble_recoveries AS fumbleRecoveries,
        stats.field_goals_made AS fieldGoalsMade,stats.field_goals_attempted AS fieldGoalsAttempted,
        stats.extra_points_made AS extraPointsMade,stats.punts,stats.punt_yards AS puntYards,stats.stat_rows AS statRows
      FROM filtered_players fp
      LEFT JOIN cfb_teams team ON team.season=fp.season AND team.team=fp.team
      LEFT JOIN player_production_scores score ON score.season=fp.season AND score.team=fp.team AND score.player_key=fp.player_key
      LEFT JOIN player_stats stats ON stats.season=fp.season AND stats.team=fp.team AND stats.player_key=fp.player_key
      WHERE ${scatterParticipationSql[statsPosition]}`)
      .bind(...playerBindings);

  // D1 is substantially faster returning the already-built player profile than
  // expanding every stat and evaluating the same normalized labels in SQL.
  // The Worker derives the compact chart metrics below and drops unqualified
  // players before anything is sent to the browser.
  const scatterPlayerStatement=statsPosition==="OL"
    ?playerStatement
    :db.prepare(`WITH filtered_players AS (
        SELECT profile.season,profile.team,player.value AS player_json,
          COALESCE(
            NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
            NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
            printf('%s-%s',profile.team,player.key)
          ) AS player_key
        FROM player_team_profiles profile
        JOIN json_each(profile.profile_json,'$.players') AS player ON TRUE
        LEFT JOIN cfb_teams team ON team.season=profile.season AND team.team=profile.team
        WHERE ${playerConditions.join(" AND ")}
      )
      SELECT fp.team,team.team_id AS teamId,team.abbreviation,team.conference,team.color,
        team.alt_color AS altColor,team.logo,fp.player_json AS playerJson,
        score.opponent_relative AS opponentRelative,score.opponent_unit_quality AS opponentUnitQuality,
        score.support_quality AS supportQuality,score.usage_rate AS usageRate
      FROM filtered_players fp
      LEFT JOIN cfb_teams team ON team.season=fp.season AND team.team=fp.team
      LEFT JOIN player_production_scores score
        ON score.season=fp.season AND score.team=fp.team AND score.player_key=fp.player_key`)
      .bind(...playerBindings);

  const [teamResult,seasonResult,generationResult,playerResult]=await db.batch<Record<string,unknown>>([
    db.prepare(`SELECT team,team_id AS teamId,abbreviation,conference,color,alt_color AS altColor,logo FROM cfb_teams WHERE season=? ORDER BY team`).bind(season),
    db.prepare(`SELECT season FROM player_sync_state WHERE stage='ready' AND team_count>=100 AND model_version>=? ORDER BY season DESC`).bind(PLAYER_MODEL_VERSION),
    db.prepare(`SELECT COUNT(*) AS profileTeams FROM player_team_profiles WHERE season=? AND profile_json<>'{}'`).bind(season),
    scatterPlayerStatement,
  ]);
  const teams=teamResult.results;
  const availableSeasons=seasonResult.results.map((row)=>Number(row.season)).filter(Number.isFinite);
  const conferences=[...new Set(teams.map((row)=>text(row.conference)).filter(Boolean))].sort();
  const profileTeams=Number(generationResult.results[0]?.profileTeams??0);
  let rows:PlayerStatsRow[]=[];

  if(statsPosition==="OL"){
    const teamNames=teams.map((row)=>text(row.team)).filter(Boolean);
    const [baseline,lineScores]=await Promise.all([
      loadPlayerProductionBaseline(db),
      loadSeasonOffensiveLineUnitScores(db,season,teamNames),
    ]);
    const contexts=new Map(playerResult.results.map((row)=>[text(row.team),{
      opponentRelative:finiteNumber(row.opponentRelative),opponentUnitQuality:finiteNumber(row.opponentUnitQuality),supportQuality:finiteNumber(row.supportQuality),
    }]));
    const seasonPercentiles=empiricalProductionPercentiles([...lineScores].map(([key,score])=>({key,score})));
    rows=teams.flatMap((teamRow)=>{
      const teamName=text(teamRow.team);
      if(selectedTeams.length&&!selectedTeams.includes(teamName))return[];
      if(!matchesConferenceFilter(text(teamRow.conference),selectedConference))return[];
      const productionScore=finiteNumber(lineScores.get(teamName));
      const context=contexts.get(teamName);
      const percentile=finiteNumber(seasonPercentiles.get(teamName));
      const overall=productionScore===null?null:baseline.currentGenerationReady
        ?productionRatingFromScale("OL",productionScore,baseline.scale)
        :percentile===null?null:provisionalProductionOverallFromPercentile(percentile);
      if(overall===null)return[];
      return[{
        id:`${teamName}-offensive-line-unit`,rank:0,nationalRank:0,allEraRank:null,season,team:teamName,
        teamId:text(teamRow.teamId),abbreviation:text(teamRow.abbreviation),conference:text(teamRow.conference),color:text(teamRow.color),altColor:text(teamRow.altColor),logo:text(teamRow.logo),
        name:`${teamName} OLine`,jersey:offensiveLineJerseyNumber(teamName),position:"OL" as const,year:null,advancedEvidence:true,
        metrics:{unitScore:overall,opponentRelative:context?.opponentRelative??null,opponentUnitQuality:context?.opponentUnitQuality??null,supportQuality:context?.supportQuality??null},
      }];
    });
  }else{
    const metricKeys=[...new Set(playerStatsMetricColumns(statsPosition).flatMap((column)=>[
      column.key,...playerStatsQualification(statsPosition,column.key).sampleKeys,
    ]))];
    rows=(playerResult.results as RawPlayerRow[]).flatMap((rawRow)=>{
      const player=scatterPlayerProfile(rawRow.playerJson);
      if(!player)return[];
      const basic=(key:Parameters<typeof playerBasicMetric>[1])=>playerBasicMetric(player,key);
      const row:RawPlayerRow={
        ...rawRow,
        id:player.id,
        displayName:player.displayName,
        firstName:player.firstName,
        lastName:player.lastName,
        jersey:player.jersey,
        position:player.position,
        positionGroup:player.positionGroup,
        playerYear:player.year,
        profileUsageRate:player.advanced?.overallUsage,
        passPpa:player.advanced?.passPpa,
        rushPpa:player.advanced?.rushPpa,
        passingSuccessRate:player.advanced?.passingSuccessRate,
        rushingSuccessRate:player.advanced?.rushingSuccessRate,
        passCompletions:basic("passCompletions"),
        passAttempts:basic("passAttempts"),
        passYards:basic("passYards"),
        passTd:basic("passTd"),
        passInterceptions:basic("interceptions"),
        rushAttempts:basic("rushAttempts"),
        rushYards:basic("rushYards"),
        rushTd:basic("rushTd"),
        receptions:basic("receptions"),
        receivingYards:basic("receivingYards"),
        receivingTd:basic("receivingTd"),
        kickReturnYards:basic("kickReturnYards"),
        puntReturnYards:basic("puntReturnYards"),
        tackles:basic("tackles"),
        tfl:basic("tfl"),
        sacks:basic("sacks"),
        qbHurries:basic("qbHurries"),
        passesDefended:basic("passesDefended"),
        defensiveInterceptions:basic("defensiveInterceptions"),
        fumbleRecoveries:basic("fumbleRecoveries"),
        fieldGoalsMade:basic("fieldGoalsMade"),
        fieldGoalsAttempted:basic("fieldGoalsAttempted"),
        extraPointsMade:basic("extraPointsMade"),
        punts:basic("punts"),
        puntYards:basic("puntYards"),
        statRows:player.stats.filter((stat)=>stat.numericValue!==null).length,
      };
      if(playerPosition(row)!==statsPosition)return[];
      const name=text(row.displayName)||[text(row.firstName),text(row.lastName)].filter(Boolean).join(" ")||"Unknown player";
      const opponentRelative=finiteNumber(row.opponentRelative),opponentUnitQuality=finiteNumber(row.opponentUnitQuality),supportQuality=finiteNumber(row.supportQuality);
      const usageRate=finiteNumber(row.usageRate)??finiteNumber(row.profileUsageRate);
      const advancedEvidence=[row.passPpa,row.rushPpa,row.passingSuccessRate,row.rushingSuccessRate].some((value)=>finiteNumber(value)!==null)||opponentRelative!==null||usageRate!==null;
      if(Number(row.statRows??0)<=0&&!advancedEvidence)return[];
      const allMetrics=playerStatsMetrics(row,opponentRelative,usageRate,opponentUnitQuality,supportQuality);
      const compactMetrics=Object.fromEntries(metricKeys.map((key)=>[key,allMetrics[key]])) as PlayerStatsMetrics;
      const publicRow:PlayerStatsRow={
        id:text(row.id)||`${text(row.team)}-${name}`,rank:0,nationalRank:0,allEraRank:null,season,team:text(row.team),teamId:text(row.teamId),
        abbreviation:text(row.abbreviation),conference:text(row.conference),color:text(row.color),altColor:text(row.altColor),logo:text(row.logo),
        name,jersey:finiteNumber(row.jersey),position:statsPosition,year:finiteNumber(row.playerYear),advancedEvidence,
        metrics:compactMetrics,
      };
      return playerMeetsScatterParticipationThreshold(publicRow,statsPosition)?[publicRow]:[];
    });
  }
  const output=response({
    configured:Boolean(runtime.CFBD_API_KEY),season,status:profileTeams>0?"ready":"building",
    message:profileTeams>0?null:"Player profiles are still building for this season.",availableSeasons,positions:supportedPositions,
    teams,conferences,filters:{conference:selectedConference,position:statsPosition,teams:selectedTeams},rows,
  },200,"public, max-age=900, stale-while-revalidate=86400");
  output.headers.set("x-harper-scatter-path","qualified-player-json-v3");
  return output;
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB) return response({ configured:false, status:"unavailable", rows:[], teams:[], positions:supportedPositions }, 503);

  const url = new URL(request.url);
  const statsView = url.searchParams.get("view") === "stats";
  const scatterView = statsView && url.searchParams.get("scatter") === "1";
  const currentSeason = currentCollegeFootballSeason();
  const season = Number(url.searchParams.get("season")) || INITIAL_PLAYER_SEASON;
  const selectedTeams = [...new Set(url.searchParams.getAll("team").map(text).filter(Boolean))].slice(0,150);
  const selectedTeam = selectedTeams[0] ?? "";
  const selectedConference = text(url.searchParams.get("conference"));
  const searchQuery = text(url.searchParams.get("query")).toLowerCase();
  const requestedPosition = text(url.searchParams.get("position")).toUpperCase();
  const selectedPosition = supportedPositions.includes(requestedPosition) ? requestedPosition : statsView ? "QB" : "";
  const statsPosition = (selectedPosition || "QB") as PlayerStatsPosition;
  const requestedSortValue = text(url.searchParams.get("sort"));
  const requestedSort = requestedSortValue as SortKey;
  const sort = validSortKeys.has(requestedSort) ? requestedSort : "overall";
  const requestedStatsSort = requestedSortValue as PlayerStatsSortKey;
  const statsSort = playerStatsColumns(statsPosition).some((column) => column.key === requestedStatsSort)
    ? requestedStatsSort
    : playerStatsDefaultSortKey(statsPosition);
  const requestedStatsMetric = text(url.searchParams.get("metric")) as PlayerStatsMetricKey;
  const statsMetricColumns = playerStatsMetricColumns(statsPosition);
  const statsMetric = statsMetricColumns.some((column) => column.key === requestedStatsMetric)
    ? requestedStatsMetric
    : statsMetricColumns.some((column) => column.key === statsSort)
      ? statsSort as PlayerStatsMetricKey
      : playerStatsDefaultSortKey(statsPosition);
  const requestedScatterX = text(url.searchParams.get("x")) as PlayerStatsMetricKey;
  const requestedScatterY = text(url.searchParams.get("y")) as PlayerStatsMetricKey;
  const scatterX = statsMetricColumns.some((column) => column.key === requestedScatterX) ? requestedScatterX : statsMetric;
  const scatterY = statsMetricColumns.some((column) => column.key === requestedScatterY) ? requestedScatterY : statsMetric;
  const requestedDirection = url.searchParams.get("direction");
  const direction: Direction = requestedDirection === "asc" || requestedDirection === "desc"
    ? requestedDirection
    : statsView
      ? defaultPlayerStatsSortDirection(statsSort,statsPosition)
      : "desc";
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page")) || 1));
  const limit = Math.max(20, Math.min(100, Math.trunc(Number(url.searchParams.get("limit")) || 50)));

  if (season < FIRST_PLAYER_SEASON || season > currentSeason) {
    return response({
      configured:Boolean(runtime.CFBD_API_KEY),
      season,
      supportedRange:[FIRST_PLAYER_SEASON, currentSeason],
      status:"unsupported",
      rows:[],
      teams:[],
      positions:supportedPositions,
    }, 400);
  }

  try {
    if(scatterView)return await optimizedPlayerScatterResponse(runtime,season,statsPosition,selectedConference,selectedTeams);
    const baseline = await loadPlayerProductionBaseline(runtime.DB);
    const conditions = ["profile.season=?", "profile.profile_json<>'{}'"];
    const bindings: Array<string | number> = [season];
    if (selectedTeam) {
      conditions.push("profile.team=?");
      bindings.push(selectedTeam);
    }
    if (selectedConference && !statsView) {
      const conferenceValues=conferenceFilterSqlValues(selectedConference);
      conditions.push(`team.conference IN (${conferenceValues.map(()=>"?").join(",")})`);
      bindings.push(...conferenceValues);
    }
    const [teamResult, seasonResult, playerResult, lineContextResult, generationResult] = await runtime.DB.batch<Record<string, unknown>>([
      runtime.DB.prepare(`SELECT team,team_id AS teamId,abbreviation,conference,color,alt_color AS altColor,logo
          FROM cfb_teams WHERE season=? ORDER BY team`).bind(season),
      runtime.DB.prepare(`SELECT season FROM player_sync_state
          WHERE stage='ready' AND team_count>=100 AND model_version>=?
          ORDER BY season DESC`).bind(PLAYER_MODEL_VERSION),
      runtime.DB.prepare(`WITH ranked_production AS (
          SELECT season,team,player_key,position,score,
            opponent_relative,opponent_unit_quality,support_quality,usage_rate,
            RANK() OVER (PARTITION BY position ORDER BY score) AS rank_start,
            COUNT(*) OVER (PARTITION BY position,score) AS tie_count,
            COUNT(*) OVER (PARTITION BY position) AS position_count
          FROM player_production_scores
          WHERE season=?
        ), normalized AS (
          SELECT season,team,player_key,position,score,
            opponent_relative,opponent_unit_quality,support_quality,usage_rate,
            (rank_start+(tie_count-1)/2.0)/NULLIF(position_count,0) AS percentile
          FROM ranked_production
        ), player_stat_rows AS (
          SELECT
            profile.season,
            profile.team,
            COALESCE(
              NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
              NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
              printf('%s-%s',profile.team,player.key)
            ) AS player_key,
            LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.category') AS TEXT),''),' ',''),'_','')) AS category_key,
            LOWER(REPLACE(REPLACE(COALESCE(CAST(json_extract(stat.value,'$.label') AS TEXT),''),' ',''),'_','')) AS stat_key,
            CAST(json_extract(stat.value,'$.numericValue') AS REAL) AS stat_value
          FROM player_team_profiles profile
          JOIN json_each(profile.profile_json,'$.players') AS player ON TRUE
          LEFT JOIN json_each(player.value,'$.stats') AS stat ON TRUE
          WHERE profile.season=? AND profile.profile_json<>'{}'
        ), player_stats AS (
          SELECT season,team,player_key,
            COUNT(CASE WHEN stat_value IS NOT NULL THEN 1 END) AS stat_rows,
            MAX(CASE WHEN category_key='passing' AND stat_key IN ('cmp','completions','passingcompletions') THEN stat_value ELSE 0 END) AS pass_completions,
            MAX(CASE WHEN category_key='passing' AND stat_key IN ('att','attempts','passingattempts') THEN stat_value ELSE 0 END) AS pass_attempts,
            MAX(CASE WHEN category_key='passing' AND stat_key IN ('yds','yards','passingyards') THEN stat_value ELSE 0 END) AS pass_yards,
            MAX(CASE WHEN category_key='passing' AND stat_key IN ('td','touchdowns','passingtouchdowns') THEN stat_value ELSE 0 END) AS pass_td,
            MAX(CASE WHEN category_key='passing' AND stat_key IN ('int','interceptions') THEN stat_value ELSE 0 END) AS pass_interceptions,
            MAX(CASE WHEN category_key='rushing' AND stat_key IN ('yds','yards','rushingyards') THEN stat_value ELSE 0 END) AS rush_yards,
            MAX(CASE WHEN category_key='rushing' AND stat_key IN ('car','att','attempts','carries') THEN stat_value ELSE 0 END) AS rush_attempts,
            MAX(CASE WHEN category_key='rushing' AND stat_key IN ('td','touchdowns','rushingtouchdowns') THEN stat_value ELSE 0 END) AS rush_td,
            MAX(CASE WHEN category_key='receiving' AND stat_key IN ('rec','receptions') THEN stat_value ELSE 0 END) AS receptions,
            MAX(CASE WHEN category_key='receiving' AND stat_key IN ('yds','yards','receivingyards') THEN stat_value ELSE 0 END) AS receiving_yards,
            MAX(CASE WHEN category_key='receiving' AND stat_key IN ('td','touchdowns','receivingtouchdowns') THEN stat_value ELSE 0 END) AS receiving_td,
            MAX(CASE WHEN category_key='kickreturns' AND stat_key IN ('yds','yards','kickreturnyards') THEN stat_value ELSE 0 END) AS kick_return_yards,
            MAX(CASE WHEN category_key='puntreturns' AND stat_key IN ('yds','yards','puntreturnyards') THEN stat_value ELSE 0 END) AS punt_return_yards,
            MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('tot','total','tackles','totaltackles') THEN stat_value ELSE 0 END) AS tackles,
            MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('tfl','tacklesforloss') THEN stat_value ELSE 0 END) AS tfl,
            MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('sack','sacks') THEN stat_value ELSE 0 END) AS sacks,
            MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('qbhur','qbhurries','hurries') THEN stat_value ELSE 0 END) AS qb_hurries,
            MAX(CASE WHEN category_key IN ('defensive','defense') AND stat_key IN ('pd','passesdefended','passbreakups') THEN stat_value ELSE 0 END) AS passes_defended,
            MAX(CASE WHEN category_key IN ('defensive','defense','interceptions') AND stat_key IN ('int','interceptions') THEN stat_value ELSE 0 END) AS defensive_interceptions,
            MAX(CASE WHEN category_key IN ('fumbles','defensive','defense') AND stat_key IN ('rec','recoveries','fumblerecoveries') THEN stat_value ELSE 0 END) AS fumble_recoveries,
            MAX(CASE WHEN category_key='kicking' AND stat_key IN ('fgm','fieldgoalsmade') THEN stat_value ELSE 0 END) AS field_goals_made,
            MAX(CASE WHEN category_key='kicking' AND stat_key IN ('fga','fieldgoalsattempted') THEN stat_value ELSE 0 END) AS field_goals_attempted,
            MAX(CASE WHEN category_key='kicking' AND stat_key IN ('xpm','extrapointsmade','patmade') THEN stat_value ELSE 0 END) AS extra_points_made,
            MAX(CASE WHEN category_key='punting' AND stat_key IN ('no','punts','puntattempts') THEN stat_value ELSE 0 END) AS punts,
            MAX(CASE WHEN category_key='punting' AND stat_key IN ('yds','yards','puntyards') THEN stat_value ELSE 0 END) AS punt_yards
          FROM player_stat_rows
          GROUP BY season,team,player_key
        )
        SELECT
          profile.team,
          team.team_id AS teamId,
          team.abbreviation,
          team.conference,
          team.color,
          team.alt_color AS altColor,
          team.logo,
          json_extract(player.value,'$.id') AS id,
          json_extract(player.value,'$.displayName') AS displayName,
          json_extract(player.value,'$.firstName') AS firstName,
          json_extract(player.value,'$.lastName') AS lastName,
          json_extract(player.value,'$.jersey') AS jersey,
          json_extract(player.value,'$.position') AS position,
          json_extract(player.value,'$.positionGroup') AS positionGroup,
          json_extract(player.value,'$.year') AS playerYear,
          json_extract(player.value,'$.stats') AS playerStatsJson,
          json_extract(player.value,'$.advanced') AS playerAdvancedJson,
          json_extract(player.value,'$.productionVolumeScore') AS productionVolumeScore,
          json_extract(player.value,'$.productionScore') AS productionScore,
          normalized.score AS normalizedScore,
          normalized.percentile AS normalizedPercentile,
          normalized.opponent_relative AS opponentRelative,
          normalized.opponent_unit_quality AS opponentUnitQuality,
          normalized.support_quality AS supportQuality,
          normalized.usage_rate AS usageRate,
          json_extract(player.value,'$.advanced.overallUsage') AS profileUsageRate,
          json_extract(player.value,'$.advanced.passPpa') AS passPpa,
          json_extract(player.value,'$.advanced.rushPpa') AS rushPpa,
          json_extract(player.value,'$.advanced.passingSuccessRate') AS passingSuccessRate,
          json_extract(player.value,'$.advanced.rushingSuccessRate') AS rushingSuccessRate,
          stats.pass_completions AS passCompletions,
          stats.pass_attempts AS passAttempts,
          stats.pass_yards AS passYards,
          stats.pass_td AS passTd,
          stats.pass_interceptions AS passInterceptions,
          stats.rush_yards AS rushYards,
          stats.rush_attempts AS rushAttempts,
          stats.rush_td AS rushTd,
          stats.receptions,
          stats.receiving_yards AS receivingYards,
          stats.receiving_td AS receivingTd,
          stats.kick_return_yards AS kickReturnYards,
          stats.punt_return_yards AS puntReturnYards,
          stats.tackles,
          stats.tfl,
          stats.sacks,
          stats.qb_hurries AS qbHurries,
          stats.passes_defended AS passesDefended,
          stats.defensive_interceptions AS defensiveInterceptions,
          stats.fumble_recoveries AS fumbleRecoveries,
          stats.field_goals_made AS fieldGoalsMade,
          stats.field_goals_attempted AS fieldGoalsAttempted,
          stats.extra_points_made AS extraPointsMade,
          stats.punts,
          stats.punt_yards AS puntYards,
          stats.stat_rows AS statRows,
          json_extract(player.value,'$.projectedStarter') AS projectedStarter,
          json_extract(player.value,'$.recruitingStars') AS recruitingStars,
          json_extract(player.value,'$.recruitingRating') AS recruitingRating,
          json_extract(player.value,'$.ratingSource') AS ratingSource
        FROM player_team_profiles profile
        JOIN json_each(profile.profile_json,'$.players') AS player ON TRUE
        LEFT JOIN cfb_teams team ON team.season=profile.season AND team.team=profile.team
        LEFT JOIN normalized
          ON normalized.season=profile.season
          AND normalized.team=profile.team
          AND normalized.player_key=COALESCE(
            NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
            NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
            printf('%s-%s',profile.team,player.key)
          )
        LEFT JOIN player_stats stats
          ON stats.season=profile.season
          AND stats.team=profile.team
          AND stats.player_key=COALESCE(
            NULLIF(CAST(json_extract(player.value,'$.id') AS TEXT),''),
            NULLIF(CAST(json_extract(player.value,'$.playerId') AS TEXT),''),
            printf('%s-%s',profile.team,player.key)
          )
        WHERE ${conditions.join(" AND ")}`)
        .bind(season, season, ...bindings),
      runtime.DB.prepare(`SELECT team,score,opponent_relative AS opponentRelative,
          opponent_unit_quality AS opponentUnitQuality,support_quality AS supportQuality
        FROM player_production_scores
        WHERE season=? AND position='OL'`).bind(season),
      runtime.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM player_team_profiles WHERE season=? AND profile_json<>'{}') AS profileTeams,
          (SELECT COUNT(DISTINCT team) FROM player_production_scores
            WHERE season=? AND position='_SYNC') AS normalizedTeams`)
        .bind(season,season),
    ]);

    const generation = generationResult.results[0] ?? {};
    const profileTeams = Number(generation.profileTeams ?? 0);
    const normalizedTeams = Number(generation.normalizedTeams ?? 0);
    const seasonGenerationReady = profileTeams > 0 && normalizedTeams >= profileTeams;

    const rawRows = playerResult.results as RawPlayerRow[];
    const positionRows = selectedPosition
      ? rawRows.filter((row) => playerPosition(row) === selectedPosition)
      : rawRows;
    const lineTeams = [...new Set(positionRows
      .filter((row) => playerPosition(row) === "OL")
      .map((row) => text(row.team))
      .filter(Boolean))];
    const allTeamNames = teamResult.results
      .map((row:Record<string, unknown>) => text(row.team))
      .filter(Boolean);
    const lineScores = allTeamNames.length
      ? await loadSeasonOffensiveLineUnitScores(runtime.DB, season, allTeamNames)
      : new Map<string, number>();
    const adjustedLineScores = new Map(lineScores);
    const lineContexts = new Map(lineContextResult.results.map((row:Record<string, unknown>) => [text(row.team),{
      opponentRelative:finiteNumber(row.opponentRelative),
      opponentUnitQuality:finiteNumber(row.opponentUnitQuality),
      supportQuality:finiteNumber(row.supportQuality),
    }]));
    const lineSeasonPercentiles = empiricalProductionPercentiles(
      [...adjustedLineScores].map(([key, score]) => ({ key, score })),
    );
    const provisionalPlayerPercentiles = new Map<string,number>();
    for (const position of supportedPositions.filter((candidate) => candidate !== "OL")) {
      const positionPercentiles = empiricalProductionPercentiles(positionRows
        .filter((row) => playerPosition(row) === position)
        .map((row) => ({
          key:provisionalPlayerKey(row),
          score:finiteNumber(row.productionScore) ?? Number.NaN,
        })));
      for (const [key, percentile] of positionPercentiles) {
        provisionalPlayerPercentiles.set(key, percentile);
      }
    }

    const individualRatings = positionRows
      .filter((row) => playerPosition(row) !== "OL")
      .map((row) => {
      const position = playerPosition(row);
      const normalizedScore = finiteNumber(row.normalizedScore);
      const normalizedPercentile = finiteNumber(row.normalizedPercentile);
      const historicalScore = finiteNumber(row.productionScore);
      // Scores are rewritten one historical season at a time. Never rank a
      // player from a stale generation while the all-era baseline is rebuilding.
      // The stored profile's accumulated production is the honest fallback.
      const productionScore = baseline.currentGenerationReady || seasonGenerationReady
        ? normalizedScore ?? historicalScore
        : historicalScore;
      const recruitingStars = finiteNumber(row.recruitingStars);
      const recruitingRating = finiteNumber(row.recruitingRating);
      const ratingSource = text(row.ratingSource) === "TRANSFER"
        ? "TRANSFER" as const
        : text(row.ratingSource) === "HIGH SCHOOL"
          ? "HIGH SCHOOL" as const
          : "UNRATED" as const;
      let overall: number | null;
      let ratingPercentile: number | null = null;
      let source: "OBSERVED" | "PROJECTED" | "UNAVAILABLE";
      if ((baseline.currentGenerationReady || seasonGenerationReady) && normalizedScore !== null && normalizedPercentile !== null) {
        overall = baseline.currentGenerationReady
          ? productionRatingFromScale(position, normalizedScore, baseline.scale)
          : provisionalProductionOverallFromPercentile(normalizedPercentile);
        ratingPercentile = baseline.currentGenerationReady
          ? productionPercentileFromScale(position, normalizedScore, baseline.scale) ?? normalizedPercentile
          : normalizedPercentile;
        source = overall === null ? "UNAVAILABLE" : "OBSERVED";
      } else if (productionScore !== null) {
        if (baseline.currentGenerationReady) {
          overall = productionRatingFromScale(position, productionScore, baseline.scale);
          ratingPercentile = productionPercentileFromScale(position, productionScore, baseline.scale);
        } else {
          ratingPercentile = provisionalPlayerPercentiles.get(provisionalPlayerKey(row)) ?? null;
          overall = ratingPercentile === null
            ? productionRatingFromScale(position, productionScore, baseline.scale)
            : provisionalProductionOverallFromPercentile(ratingPercentile);
        }
        source = overall === null ? "UNAVAILABLE" : "OBSERVED";
      } else {
        overall = projectedProductionRating({
          position:text(row.position) || "ATH",
          positionGroup:text(row.positionGroup) || "ATHLETES",
          recruitingStars,
          recruitingRating,
          ratingSource,
        } as Pick<PlayerProfile, "position" | "positionGroup" | "recruitingStars" | "recruitingRating" | "ratingSource">,
        baseline.cohorts,
        baseline.scale.some((scaleRow) => scaleRow.rating < 50),
        baseline.scaleCalibrationVersion ?? 1);
        source = overall === null ? "UNAVAILABLE" : "PROJECTED";
      }
      const displayName = text(row.displayName)
        || [text(row.firstName), text(row.lastName)].filter(Boolean).join(" ")
        || "Unknown player";
      const opponentRelative = baseline.currentGenerationReady || seasonGenerationReady ? finiteNumber(row.opponentRelative) : null;
      const opponentUnitQuality = baseline.currentGenerationReady || seasonGenerationReady ? finiteNumber(row.opponentUnitQuality) : null;
      const supportQuality = baseline.currentGenerationReady || seasonGenerationReady ? finiteNumber(row.supportQuality) : null;
      const usageRate = baseline.currentGenerationReady || seasonGenerationReady ? finiteNumber(row.usageRate) : null;
      const statsUsageRate = usageRate ?? finiteNumber(row.profileUsageRate);
      const advancedEvidence = [row.passPpa,row.rushPpa,row.passingSuccessRate,row.rushingSuccessRate]
        .some((value)=>finiteNumber(value)!==null)
        || opponentRelative!==null
        || statsUsageRate!==null;
      const opponentEdge = opponentEdgePercent(opponentRelative);
      const constrained = ["QB","WR","TE"].includes(position)
        && supportQuality !== null
        && supportQuality < .42;
      const evidence = source === "OBSERVED"
        ? baseline.currentGenerationReady || seasonGenerationReady
          ? `${opponentEdge === null ? "Opponent-relative sample" : `${signedPercent(opponentEdge)} vs opponent allowance`}${usageRate !== null ? ` · ${Math.round(usageRate * 100)}% usage` : ""}${constrained ? " · limited complementary support" : ""}`
          : `${position} ${season} accumulated production · all-era opponent scale rebuilding`
        : source === "PROJECTED"
          ? `${position} historical recruiting cohort`
          : "No comparable production sample";
      return {
        id:text(row.id) || `${text(row.team)}-${displayName}`,
        season,
        team:text(row.team),
        teamId:text(row.teamId),
        abbreviation:text(row.abbreviation),
        conference:text(row.conference),
        color:text(row.color),
        altColor:text(row.altColor),
        logo:text(row.logo),
        name:displayName,
        lastName:text(row.lastName),
        jersey:finiteNumber(row.jersey),
        position,
        year:finiteNumber(row.playerYear),
        overall,
        ratingPercentile,
        source,
        productionScore,
        // ERA rank must never use the legacy profile score directly. During a
        // rebuild, recompute the archived profile with the current 0–100
        // production formula so it remains comparable to the all-era pool.
        allEraScore:normalizedScore??fallbackAllEraScore(row),
        opponentRelative,
        opponentUnitQuality,
        supportQuality,
        usageRate,
        recruitingStars,
        ratingSource,
        projectedStarter:Boolean(Number(row.projectedStarter)),
        evidence,
        statProfile:playerStatProfile(row,position,opponentRelative,usageRate,opponentUnitQuality),
        metrics:playerStatsMetrics(row,opponentRelative,statsUsageRate,opponentUnitQuality,supportQuality),
        hasStatEvidence:Number(row.statRows??0)>0||advancedEvidence,
        advancedEvidence,
      };
    });
    const lineUnitRatings = lineTeams.map((teamName) => {
      const row = positionRows.find((candidate) => text(candidate.team) === teamName);
      const productionScore = finiteNumber(adjustedLineScores.get(teamName));
      const context = lineContexts.get(teamName);
      const opponentRelative = context?.opponentRelative ?? null;
      const opponentUnitQuality = context?.opponentUnitQuality ?? null;
      const supportQuality = context?.supportQuality ?? null;
      const seasonPercentile = finiteNumber(lineSeasonPercentiles.get(teamName));
      const overall = productionScore === null
        ? null
        : baseline.currentGenerationReady
          ? productionRatingFromScale("OL", productionScore, baseline.scale)
          : seasonPercentile === null
            ? null
            : provisionalProductionOverallFromPercentile(seasonPercentile);
      const ratingPercentile = productionScore === null
        ? null
        : baseline.currentGenerationReady
          ? productionPercentileFromScale("OL", productionScore, baseline.scale)
          : seasonPercentile;
      return {
        id:`${teamName}-offensive-line-unit`,
        season,
        team:teamName,
        teamId:text(row?.teamId),
        abbreviation:text(row?.abbreviation),
        conference:text(row?.conference),
        color:text(row?.color),
        altColor:text(row?.altColor),
        logo:text(row?.logo),
        name:`${teamName} OLine`,
        lastName:"OLine",
        jersey:offensiveLineJerseyNumber(teamName),
        position:"OL",
        year:null,
        overall,
        ratingPercentile,
        source:"UNIT" as const,
        productionScore,
        allEraScore:productionScore,
        opponentRelative,
        opponentUnitQuality,
        supportQuality,
        usageRate:null,
        recruitingStars:null,
        ratingSource:"UNRATED" as const,
        projectedStarter:true,
        evidence:`${opponentEdgePercent(opponentRelative) === null ? "Opponent-relative unit sample" : `${signedPercent(opponentEdgePercent(opponentRelative) ?? 0)} run output vs opponent allowance`} · one five-man unit grade`,
        statProfile:[
          ...(opponentEdgePercent(opponentRelative) === null ? [] : [{
            label:"RUN VS OPP",
            value:signedPercent(opponentEdgePercent(opponentRelative) ?? 0),
            tone:(opponentEdgePercent(opponentRelative) ?? 0) >= 5 ? "positive" as const : (opponentEdgePercent(opponentRelative) ?? 0) <= -5 ? "warning" as const : "neutral" as const,
          }]),
          ...(opponentUnitQuality === null ? [] : [{ label:"FRONTS",value:`${Math.round(opponentUnitQuality * 100)}`,tone:opponentUnitQuality >= .6 ? "positive" as const : "neutral" as const }]),
          ...(supportQuality === null ? [] : [{ label:"PASS HELP",value:`${Math.round(supportQuality * 100)}`,tone:"neutral" as const }]),
        ],
        metrics:{unitScore:overall,opponentRelative,opponentUnitQuality,supportQuality} satisfies PlayerStatsMetrics,
        hasStatEvidence:overall!==null||opponentRelative!==null||opponentUnitQuality!==null,
        advancedEvidence:true,
      };
    });
    if(statsView){
      const positionStats=[...individualRatings,...lineUnitRatings]
        .filter((row)=>row.position===statsPosition&&row.hasStatEvidence);
      if(scatterView){
        const qualifiedNationalStats=positionStats.filter((row)=>
          playerQualifiesForStat(row,statsPosition,scatterX)
          &&playerQualifiesForStat(row,statsPosition,scatterY)
        );
        const nationalRanks=playerStatsOrdinalRanks(
          qualifiedNationalStats,
          scatterY,
          defaultPlayerStatsSortDirection(scatterY,statsPosition),
          playerStatsRankKey,
        );
        const scoped=qualifiedNationalStats
          .filter((row)=>matchesConferenceFilter(row.conference,selectedConference))
          .filter((row)=>!searchQuery||`${row.name} ${row.team} ${row.conference}`.toLowerCase().includes(searchQuery));
        const ordered=sortPlayerStatsRows(scoped,scatterY,defaultPlayerStatsSortDirection(scatterY,statsPosition));
        const rows=ordered.map((row,index)=>{
          const {allEraScore,...publicRow}=row;
          void allEraScore;
          return{
            ...publicRow,
            rank:index+1,
            nationalRank:nationalRanks.get(playerStatsRankKey(row))??0,
            allEraRank:null,
          };
        });
        return response({
          configured:Boolean(runtime.CFBD_API_KEY),
          season,
          status:profileTeams>0?"ready":"building",
          message:profileTeams>0?null:"Player profiles are still building for this season.",
          availableSeasons:seasonResult.results.map((row:Record<string, unknown>)=>Number(row.season)).filter(Number.isFinite),
          positions:supportedPositions,
          teams:teamResult.results,
          conferences:[...new Set(teamResult.results.map((row:Record<string, unknown>)=>text(row.conference)).filter(Boolean))].sort(),
          filters:{conference:selectedConference,position:statsPosition,query:searchQuery,x:scatterX,y:scatterY},
          qualification:{
            x:playerStatsQualification(statsPosition,scatterX).label,
            y:playerStatsQualification(statsPosition,scatterY).label,
            excluded:positionStats.length-qualifiedNationalStats.length,
            considered:positionStats.length,
          },
          coverage:{advanced:ordered.filter((row)=>row.advancedEvidence).length,total:ordered.length},
          pagination:{page:1,pageCount:1,limit:ordered.length,total:ordered.length},
          rows,
        },200,"public, max-age=300, stale-while-revalidate=1800");
      }
      const qualificationRule=playerStatsQualification(statsPosition,statsMetric);
      const qualifiedNationalStats=positionStats.filter((row)=>playerQualifiesForStat(row,statsPosition,statsMetric));
      const nationalRanks=playerStatsOrdinalRanks(
        qualifiedNationalStats,
        statsMetric,
        defaultPlayerStatsSortDirection(statsMetric,statsPosition),
        playerStatsRankKey,
      );
      const allEraScoreResult=await runtime.DB.prepare(`SELECT score,COUNT(*) AS scoreCount
          FROM player_production_scores
          WHERE season BETWEEN ? AND ? AND position=? AND score IS NOT NULL
          GROUP BY score`)
        .bind(FIRST_PLAYER_SEASON,INITIAL_PLAYER_SEASON,statsPosition)
        .all<Record<string,unknown>>();
      const allEraScoreGroups=allEraScoreResult.results.map((row)=>({
        score:Number(row.score),
        count:Number(row.scoreCount),
      })).filter((row)=>Number.isFinite(row.score)&&Number.isFinite(row.count)&&row.count>0);
      const scopedPositionStats=positionStats.filter((row)=>matchesConferenceFilter(row.conference,selectedConference));
      const scopedQualifiedStats=qualifiedNationalStats.filter((row)=>matchesConferenceFilter(row.conference,selectedConference));
      const scopedRanks=playerStatsOrdinalRanks(scopedQualifiedStats,statsSort,direction,playerStatsRankKey);
      const ordered=sortPlayerStatsRows(scopedQualifiedStats,statsSort,direction)
        .filter((row)=>!searchQuery||`${row.name} ${row.team} ${row.conference}`.toLowerCase().includes(searchQuery));
      const advancedCount=ordered.filter((row)=>row.advancedEvidence).length;
      const total=ordered.length;
      const pageCount=Math.max(1,Math.ceil(total/limit));
      const activePage=Math.min(page,pageCount);
      const start=(activePage-1)*limit;
      const rows=ordered.slice(start,start+limit).map((row)=>{
        const {allEraScore,...publicRow}=row;
        return {
          ...publicRow,
          rank:scopedRanks.get(playerStatsRankKey(row))??0,
          nationalRank:nationalRanks.get(playerStatsRankKey(row))??0,
          allEraRank:historicalProductionRank(allEraScore,allEraScoreGroups),
        };
      });
      const allEraCount=allEraScoreGroups.reduce((sum,row)=>sum+row.count,0);
      return response({
        configured:Boolean(runtime.CFBD_API_KEY),
        season,
        status:profileTeams>0?"ready":"building",
        message:profileTeams>0?null:"Player profiles are still building for this season.",
        availableSeasons:seasonResult.results.map((row:Record<string, unknown>)=>Number(row.season)).filter(Number.isFinite),
        positions:supportedPositions,
        teams:teamResult.results,
        conferences:[...new Set(teamResult.results.map((row:Record<string, unknown>)=>text(row.conference)).filter(Boolean))].sort(),
        filters:{conference:selectedConference,position:statsPosition,query:searchQuery,metric:statsMetric,sort:statsSort,direction},
        qualification:{label:qualificationRule.label,excluded:scopedPositionStats.length-scopedQualifiedStats.length,considered:scopedPositionStats.length},
        coverage:{advanced:advancedCount,total},
        rankingContext:{nationalCount:qualifiedNationalStats.length,allEraCount,firstSeason:FIRST_PLAYER_SEASON,lastSeason:INITIAL_PLAYER_SEASON},
        pagination:{page:activePage,pageCount,limit,total},
        rows,
      },200,"public, max-age=300, stale-while-revalidate=1800");
    }
    const rated = [...individualRatings, ...lineUnitRatings]
      .filter((row): row is typeof row & { overall:number } => row.overall !== null);

    rated.sort((left, right) => {
      const leftValue = sort === "name" ? left.name
        : sort === "team" ? left.team
          : sort === "conference" ? left.conference
          : sort === "position" ? left.position
            : left.overall ?? -1;
      const rightValue = sort === "name" ? right.name
        : sort === "team" ? right.team
          : sort === "conference" ? right.conference
          : sort === "position" ? right.position
            : right.overall ?? -1;
      const primary = comparison(leftValue, rightValue) * (direction === "asc" ? 1 : -1);
      if (primary) return primary;
      const evidenceOrder = comparePlayerRatingEvidence(left, right);
      return sort === "overall" && direction === "asc" ? -evidenceOrder : evidenceOrder;
    });

    const total = rated.length;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const activePage = Math.min(page, pageCount);
    const start = (activePage - 1) * limit;
    const rows = rated.slice(start, start + limit).map((row, index) => ({
      ...row,
      rank:start + index + 1,
    }));
    const baselineReady = baseline.scale.length > 0;
    return response({
      configured:Boolean(runtime.CFBD_API_KEY),
      season,
      status:baselineReady ? "ready" : "building",
      message:baselineReady
        ? null
        : "The historical production percentile scale is rebuilding.",
      baseline:{
        firstSeason:baseline.firstSeason,
        lastSeason:baseline.lastSeason,
        playerSeasonCount:baseline.playerSeasonCount,
        currentGenerationReady:baseline.currentGenerationReady,
        seasonGenerationReady,
      },
      availableSeasons:seasonResult.results.map((row:Record<string, unknown>) => Number(row.season)).filter(Number.isFinite),
      positions:supportedPositions,
      teams:teamResult.results,
      conferences:[...new Set(teamResult.results.map((row:Record<string, unknown>) => text(row.conference)).filter(Boolean))].sort(),
      filters:{team:selectedTeam,conference:selectedConference,position:selectedPosition,sort,direction},
      pagination:{page:activePage,pageCount,limit,total},
      rows,
    }, 200, baselineReady
      ? "public, max-age=300, stale-while-revalidate=1800"
      : "no-store");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player ratings are temporarily unavailable";
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const result = response({
      configured:Boolean(runtime.CFBD_API_KEY),
      season,
      status:overloaded ? "waiting" : "error",
      message:overloaded ? "The player database is briefly queued. Retrying automatically." : message,
      retryAfterSeconds:overloaded ? 30 : undefined,
      rows:[],
      teams:[],
      positions:supportedPositions,
    }, overloaded ? 503 : 500);
    if (overloaded) result.headers.set("retry-after", "30");
    return result;
  }
}
