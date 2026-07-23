"use client";
/* eslint-disable @next/next/no-img-element -- team logos are dynamic remote assets supplied by the season feed */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  baselines,
  modelCalibration,
  modelSnapshot,
  scoreCoefficients,
  teams,
  top25,
  workbookTabs,
  type TeamModel,
  type WeekProfile,
} from "./modelData";
import { analyzeMatchupEdges, type MatchupEdgeAnalysis } from "../lib/matchupAnalysis";
import {
  TEAM_STATS_SORT_COLUMNS,
  defaultTeamStatsSortDirection,
  sortTeamStatsRows,
  type TeamStatsSortDirection,
  type TeamStatsSortKey,
} from "../lib/teamStatsSort";
import { buildTeamProjectedSeason } from "../lib/teamProjectedRecords";

type Section = "overview" | "rankings" | "simulation" | "matchup" | "all137" | "stats" | "schedule" | "teams" | "methodology";

const nav: { id: Section; label: string }[] = [
  { id: "overview", label: "Model HQ" },
  { id: "rankings", label: "Top 25" },
  { id: "simulation", label: "Season Sim" },
  { id: "matchup", label: "Matchup Lab" },
  { id: "all137", label: "All137" },
  { id: "stats", label: "Team Stats" },
  { id: "schedule", label: "Schedule" },
  { id: "teams", label: "Team Lab" },
  { id: "methodology", label: "Methodology" },
];

const teamMap = new Map(teams.map((team) => [team.name, team]));
const rankedMap = new Map(top25.map((team) => [team.team, team]));

type DynamicProfileRow = {
  season:number;week:number;team:string;gamesPlayed:number;teamId?:string;abbreviation?:string;mascot?:string;conference?:string;color?:string;altColor?:string;logo?:string;
  offYpp:number;offYpa:number;offYpc:number;offPatt:number;offRatt:number;defYpp:number;defYpa:number;defYpc:number;defPatt:number;defRatt:number;
  offYppIndex:number;offYpaIndex:number;offYpcIndex:number;offPattIndex:number;offRattIndex:number;defYppIndex:number;defYpaIndex:number;defYpcIndex:number;defPattIndex:number;defRattIndex:number;
};

type ScheduleRow = {
  gameId:string;season:number;week:number;seasonType:string;startDate?:string;completed:boolean|number;neutralSite:boolean|number;venue?:string;
  homeTeam:string;homeConference?:string;homePoints:number|null;awayTeam:string;awayConference?:string;awayPoints:number|null;
  generatedFromWeek?:number;predictedHomeScore:number|null;predictedAwayScore:number|null;homeWinProbability:number|null;modelHomeSpread:number|null;modelTotal:number|null;
  vegasSpread:number|null;vegasTotal:number|null;spreadEdge:number|null;totalEdge:number|null;spreadError:number|null;totalError:number|null;spreadResult?:string;totalResult?:string;
  provider?:string;formattedSpread?:string;spreadOpen?:number|null;overUnderOpen?:number|null;
  homeLogo?:string;awayLogo?:string;
  storedModelVersion?:string;predictionSource?:"materialized"|"live-profile"|"pending";
  edgeAnalysis?:MatchupEdgeAnalysis;
};

type AccuracyMetric = { wins:number;losses:number;pushes:number;graded:number;accuracy:number|null;meanAbsoluteError:number|null };
type SeasonPerformance = {
  season:number;modelVersion:string;minMarketWeek:number;gameCount:number;profileCount:number;
  straightUp:{wins:number;graded:number;accuracy:number|null};spread:AccuracyMetric;total:AccuracyMetric;
};
type CalibrationSeason = { season:number;spread:AccuracyMetric;total:AccuracyMetric };
type CalibrationReport = { modelVersion:string;minMarketWeek:number;validation:string;rows:CalibrationSeason[] };

type ChampionRow = { conference:string;team:string;status:"actual"|"predicted";gameId?:string };
type SeasonRankingRow = {
  rank:number;team:string;teamId?:string;abbreviation?:string;mascot?:string;conference?:string;color?:string;altColor?:string;logo?:string;
  wins:number;losses:number;ties:number;record:string;bcsScore:number;resultsScore:number;scheduleScore:number;computerScore:number;
  sorRank:number;sosRank:number;powerRank:number;eloRank:number;colleyRank:number;headToHeadRank:number;
};
type SimulatedRankingRow = SeasonRankingRow & { expectedWins:number;projectedWins:number;projectedLosses:number;projectedRecord:string;projectedWinsOver:string[];projectedLossesTo:string[];conferenceChampion:boolean;playoffSeed:number|null };
type ConferenceProjection = { conference:string;firstTeam:string;secondTeam:string;winner:string;firstScore:number;secondScore:number;winnerProbability:number };
type BracketProjection = { id:string;round:"First Round"|"Quarterfinal"|"Semifinal"|"Championship";slot:number;firstTeam:string;secondTeam:string;firstSeed:number;secondSeed:number;firstScore:number;secondScore:number;winner:string;winnerSeed:number;winnerProbability:number;campusGame:boolean };
type SeasonSimulation = {
  season:number;requestedWeek:number;effectiveWeek:number;fieldMode:"actual-field"|"projected-field";format:4|12;methodology:string;champion:string|null;championshipProbability:number|null;
  rankings:SimulatedRankingRow[];conferenceChampionships:ConferenceProjection[];bracket:BracketProjection[];
};
type BackfillResult = { season:number;stage:"teams"|"priors"|"schedule"|"stats"|"complete";week?:number;teams?:number;games?:number;stats?:number;profiles?:number;predictions?:number };
type BackfillPayload = { configured?:boolean;currentSeason?:number;missing?:number[];seasons?:Array<{season:number;ready:boolean;teamCount:number;logoCount:number;gameCount:number;postseasonGameCount:number;statRowCount:number;profileTeamCount:number;profileCount:number;predictionCount:number;lineCount:number;completedWeekCount:number;statWeekCount:number;stage:string;progressPercent:number}>;message?:string;importedSeason?:number;retryAfterSeconds?:number;result?:BackfillResult };

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
  return `CFBD archive ready · ${games.toLocaleString()} games · ${profiles.toLocaleString()} team-week profiles · 2021–${payload.currentSeason}`;
}

const verified2025Champions: ChampionRow[] = [
  { conference:"ACC",team:"Duke",status:"actual" },
  { conference:"American Athletic",team:"Tulane",status:"actual" },
  { conference:"Big 12",team:"Texas Tech",status:"actual" },
  { conference:"Big Ten",team:"Indiana",status:"actual" },
  { conference:"Conference USA",team:"Kennesaw State",status:"actual" },
  { conference:"Mid-American",team:"Western Michigan",status:"actual" },
  { conference:"Mountain West",team:"Boise State",status:"actual" },
  { conference:"SEC",team:"Georgia",status:"actual" },
  { conference:"Sun Belt",team:"James Madison",status:"actual" },
];

const seasonOptions = Array.from({ length: Math.max(5, new Date().getUTCFullYear() - 2020) }, (_, index) => 2021 + index);
const now = new Date();
const activeModelSeason = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const activeSeasonKickoff = Date.UTC(activeModelSeason, 7, 23);
const activeModelWeek = now.getTime() < activeSeasonKickoff ? 0 : Math.min(16, Math.floor((now.getTime() - activeSeasonKickoff) / (7 * 24 * 60 * 60 * 1000)) + 1);

function useDynamicProfiles(season:number, week:number) {
  const [rows,setRows] = useState<DynamicProfileRow[]>([]);
  const [source,setSource] = useState<"database"|"embedded"|"loading">("loading");
  const [loadedKey,setLoadedKey] = useState("");
  const requestKey = `${season}:${week}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=profiles&season=${season}&week=${week}`, { signal:controller.signal })
      .then((response) => readJsonBody<{source?:string;rows?:DynamicProfileRow[]}>(response))
      .then((payload:{source?:string;rows?:DynamicProfileRow[]}) => {
        if (payload.rows?.length) { setRows(payload.rows); setSource("database"); }
        else { setRows([]); setSource("embedded"); }
        setLoadedKey(requestKey);
      }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setRows([]); setSource("embedded"); setLoadedKey(requestKey); } });
    return () => controller.abort();
  },[season,week,requestKey]);

  const activeRows = useMemo(() => loadedKey === requestKey ? rows : [], [loadedKey, requestKey, rows]);
  const activeSource = loadedKey === requestKey ? source : "loading";
  const dynamicTeams = useMemo<TeamModel[]>(() => activeRows.map((row) => ({
    id:String(row.teamId || row.team),name:row.team,mascot:row.mascot || "",abbr:row.abbreviation || row.team.slice(0,4).toUpperCase(),conference:row.conference || "FBS",
    color:row.color ? `#${row.color.replace(/^#/,"")}` : teamMap.get(row.team)?.color || "#333333",altColor:row.altColor ? `#${row.altColor.replace(/^#/,"")}` : teamMap.get(row.team)?.altColor || "#ffffff",
    logo:row.logo || teamMap.get(row.team)?.logo,
    weeks:{[String(row.week)]:{o:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex],d:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex],rank:null}},
  })),[activeRows]);
  const fallback = season === modelSnapshot.season ? teams : [];
  return { rows:activeRows, teams:dynamicTeams.length ? dynamicTeams : fallback, source:activeSource, loading:activeSource === "loading" };
}

function useSeasonPerformance(season:number) {
  const [data,setData] = useState<SeasonPerformance|null>(null);
  const [loadedSeason,setLoadedSeason] = useState<number|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=performance&season=${season}`, { signal:controller.signal })
      .then((response) => readJsonBody<SeasonPerformance>(response))
      .then((payload) => { setData(payload?.spread && payload?.total ? payload : null); setLoadedSeason(season); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setData(null); setLoadedSeason(season); } });
    return () => controller.abort();
  }, [season]);
  return { data:loadedSeason === season ? data : null, loading:loadedSeason !== season };
}

function useCalibrationReport() {
  const [data,setData] = useState<CalibrationReport|null>(null);
  const [loaded,setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data?view=calibration", { signal:controller.signal })
      .then((response) => readJsonBody<CalibrationReport>(response))
      .then((payload) => { setData(payload?.rows ? payload : null); setLoaded(true); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setData(null); setLoaded(true); } });
    return () => controller.abort();
  }, []);
  return { data, loading:!loaded };
}

function useSeasonRankings(season:number, week:number) {
  const [rows,setRows] = useState<SeasonRankingRow[]>([]);
  const [loadedKey,setLoadedKey] = useState("");
  const requestKey = `${season}:${week}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=rankings&season=${season}&week=${week}`, { signal:controller.signal })
      .then((response) => readJsonBody<{rows?:SeasonRankingRow[]}>(response))
      .then((payload) => { setRows(payload.rows ?? []); setLoadedKey(requestKey); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setRows([]); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [season, week, requestKey]);
  const fallback = useMemo<SeasonRankingRow[]>(() => season === modelSnapshot.season ? top25.map((entry) => ({
    rank:entry.rank,team:entry.team,conference:teamMap.get(entry.team)?.conference,logo:entry.logo,wins:Number(entry.record.split("–")[0]) || 0,losses:Number(entry.record.split("–")[1]) || 0,ties:0,record:entry.record,
    bcsScore:(26-entry.rank)/25,resultsScore:(26-entry.rank)/25,scheduleScore:(26-entry.projectedRank)/25,computerScore:(26-entry.projectedRank)/25,
    sorRank:entry.rank,sosRank:entry.projectedRank,powerRank:entry.projectedRank,eloRank:entry.rank,colleyRank:entry.rank,headToHeadRank:entry.rank,
  })) : [], [season]);
  const activeRows = loadedKey === requestKey ? rows : [];
  return { rows:activeRows.length ? activeRows : fallback, loading:loadedKey !== requestKey };
}

function useSeasonSimulation(season:number, week:number) {
  const [data,setData] = useState<SeasonSimulation|null>(null);
  const [loadedKey,setLoadedKey] = useState("");
  const [error,setError] = useState("");
  const requestKey = `${season}:${week}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=simulation&season=${season}&week=${week}`, { signal:controller.signal })
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

function VintageControl({season,week,setSeason,setWeek,allWeeks=false}:{season:number;week:number;setSeason:(value:number)=>void;setWeek:(value:number)=>void;allWeeks?:boolean}) {
  return <div className="vintage-control">
    <div><label htmlFor={`season-${allWeeks ? "all" : "profile"}`}>SEASON</label><select id={`season-${allWeeks ? "all" : "profile"}`} value={season} onChange={(event)=>setSeason(Number(event.target.value))}>{seasonOptions.map((value)=><option key={value}>{value}</option>)}</select></div>
    <div><label htmlFor={`week-${allWeeks ? "all" : "profile"}`}>MODEL WEEK</label><select id={`week-${allWeeks ? "all" : "profile"}`} value={week} onChange={(event)=>setWeek(Number(event.target.value))}>{allWeeks?<option value={0}>Full season</option>:null}{Array.from({length:17},(_,index)=><option key={index} value={index}>Week {index}</option>)}</select></div>
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
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreFromStats(ypc: number, ypp: number, ypa: number, ratt: number, patt: number) {
  return Math.max(
    0,
    scoreCoefficients.intercept +
      scoreCoefficients.ypc * ypc +
      scoreCoefficients.ypp * ypp +
      scoreCoefficients.ypa * ypa +
      scoreCoefficients.ratt * ratt +
      scoreCoefficients.patt * patt,
  );
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

function projectMatchup(home: TeamModel, away: TeamModel, week: number, neutral: boolean) {
  const hp = latestProfile(home, week);
  const ap = latestProfile(away, week);
  if (!hp || !ap) return null;

  const side = (offense: WeekProfile, defense: WeekProfile) => {
    const ypa = baselines.ypa * offense.o[1] * defense.d[1];
    const ypc = baselines.ypc * offense.o[2] * defense.d[2];
    const patt = baselines.patt * offense.o[3] * defense.d[3];
    const ratt = baselines.ratt * offense.o[4] * defense.d[4];
    const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
    return { ypa, ypc, patt, ratt, ypp, score: scoreFromStats(ypc, ypp, ypa, ratt, patt) };
  };

  const homeStats = side(hp, ap);
  const awayStats = side(ap, hp);
  const homeField = neutral ? 0 : modelCalibration.homeFieldAdvantage;
  const homeScore = Math.max(0, homeStats.score + homeField / 2);
  const awayScore = Math.max(0, awayStats.score - homeField / 2);
  const margin = homeScore - awayScore;
  const volatility = 13.8 + Math.abs(average(hp.o.slice(0, 3)) - average(ap.o.slice(0, 3))) * 3;
  const homeWin = normalCdf(margin / volatility);
  const edgeAnalysis = analyzeMatchupEdges(home.name, away.name, hp.o, hp.d, ap.o, ap.d, neutral, margin);
  return {
    homeScore,
    awayScore,
    margin,
    total: homeScore + awayScore,
    homeWin,
    homeStats,
    awayStats,
    volatility,
    edgeAnalysis,
  };
}

function TeamMark({ name, size = "md", logo }: { name: string; size?: "sm" | "md" | "lg"; logo?: string }) {
  const team = teamMap.get(name);
  const ranked = rankedMap.get(name);
  const [failedSource, setFailedSource] = useState<string>();
  const initials = team?.abbr || name.slice(0, 3).toUpperCase();
  const espnFallback = team?.id && /^\d+$/.test(team.id) ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png` : undefined;
  const logoSource = logo || ranked?.logo || espnFallback;
  const hasLogo = Boolean(logoSource) && failedSource !== logoSource;
  return (
    <span
      className={`team-mark team-mark-${size} ${hasLogo ? "has-logo" : "fallback-mark"}`}
      style={hasLogo ? undefined : {
        background: team?.color || "#334155",
        borderColor: team?.altColor || "#ffffff",
      }}
      aria-hidden="true"
    >
      {hasLogo ? <>{/* Remote school marks come from the season identity feed. */}<img src={logoSource} alt="" onError={() => setFailedSource(logoSource)} /></> : <span>{initials}</span>}
    </span>
  );
}

function EdgeAnalysisCard({ analysis, compact = false }: { analysis: MatchupEdgeAnalysis; compact?: boolean }) {
  const units = [analysis.pass, analysis.run, analysis.defense];
  return <section className={`edge-analysis-card ${compact ? "compact" : ""}`}>
    <header><div><span>MATCHUP EDGE</span><h3>{analysis.headline}</h3></div><b>{analysis.projectedMargin.toFixed(1)} PTS</b></header>
    <p>{analysis.summary}</p>
    <div className="edge-unit-grid">{units.map((unit) => <article className={`edge-unit ${unit.strength}`} key={unit.unit}>
      <span>{unit.unit === "defense" ? "DEFENSIVE EDGE" : `${unit.unit.toUpperCase()} GAME`}</span>
      <strong>{unit.edgeTeam || "EVEN"}</strong>
      <small>{unit.unit === "defense" ? `${unit.homeValue.toFixed(0)}% vs ${unit.awayValue.toFixed(0)}% allowed` : `${unit.homeValue.toFixed(1)} vs ${unit.awayValue.toFixed(1)} projected`}</small>
    </article>)}</div>
    {!compact ? <div className="edge-factor-list">{analysis.factors.map((factor) => <span key={factor}>{factor}</span>)}</div> : null}
  </section>;
}

type ProfileNumberKey = keyof Pick<DynamicProfileRow,
  "offYpp"|"offYpa"|"offYpc"|"offPatt"|"offRatt"|"defYpp"|"defYpa"|"defYpc"|"defPatt"|"defRatt"|
  "offYppIndex"|"offYpaIndex"|"offYpcIndex"|"offPattIndex"|"offRattIndex"|"defYppIndex"|"defYpaIndex"|"defYpcIndex"|"defPattIndex"|"defRattIndex">;

const teamMetricDefinitions:Array<{label:string;digits:number;offRaw:ProfileNumberKey;offIndex:ProfileNumberKey;defRaw:ProfileNumberKey;defIndex:ProfileNumberKey}> = [
  {label:"Yards / play",digits:2,offRaw:"offYpp",offIndex:"offYppIndex",defRaw:"defYpp",defIndex:"defYppIndex"},
  {label:"Yards / pass",digits:2,offRaw:"offYpa",offIndex:"offYpaIndex",defRaw:"defYpa",defIndex:"defYpaIndex"},
  {label:"Yards / rush",digits:2,offRaw:"offYpc",offIndex:"offYpcIndex",defRaw:"defYpc",defIndex:"defYpcIndex"},
  {label:"Pass attempts / game",digits:1,offRaw:"offPatt",offIndex:"offPattIndex",defRaw:"defPatt",defIndex:"defPattIndex"},
  {label:"Rush attempts / game",digits:1,offRaw:"offRatt",offIndex:"offRattIndex",defRaw:"defRatt",defIndex:"defRattIndex"},
];

function nationalRank(rows:DynamicProfileRow[], selected:DynamicProfileRow, key:ProfileNumberKey, lowerIsBetter:boolean) {
  const selectedValue = Number(selected[key]);
  return 1 + rows.filter((row) => lowerIsBetter ? Number(row[key]) < selectedValue : Number(row[key]) > selectedValue).length;
}

function TeamMetricPanel({title,subtitle,row,rows,side}:{title:string;subtitle:string;row:DynamicProfileRow;rows:DynamicProfileRow[];side:"offense"|"defense"}) {
  const defense = side === "defense";
  return <section className={`team-metric-panel ${side}`}>
    <div className="team-metric-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{defense ? "LOWER IS BETTER" : "RANK 1 = HIGHEST"}</span></div>
    <div className="team-metric-labels"><span>METRIC</span><span>RAW</span><span>ADJ % AVG</span><span>NATL RK</span></div>
    {teamMetricDefinitions.map((metric) => {
      const rawKey = defense ? metric.defRaw : metric.offRaw;
      const indexKey = defense ? metric.defIndex : metric.offIndex;
      const index = Number(row[indexKey]);
      const rank = nationalRank(rows, row, rawKey, defense);
      return <div className="team-metric-row" key={`${side}-${metric.label}`}>
        <div><strong>{metric.label}</strong><i><span style={{width:`${Math.max(4,Math.min(100,index*50))}%`}} /></i></div>
        <b>{Number(row[rawKey]).toFixed(metric.digits)}</b>
        <span className={defense ? (index<1?"positive":"negative") : (index>=1?"positive":"negative")}>{(index*100).toFixed(0)}%</span>
        <em>#{rank}</em>
      </div>;
    })}
  </section>;
}

function useConferenceChampions(season:number, week:number) {
  const [rows, setRows] = useState<ChampionRow[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?view=champions&season=${season}&week=${week}`, { signal:controller.signal })
      .then((response) => readJsonBody<{rows?:ChampionRow[]}>(response))
      .then((payload:{rows?:ChampionRow[]}) => setRows(payload.rows?.length ? payload.rows : (season === 2025 && week >= 15 ? verified2025Champions : [])))
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setRows(season === 2025 && week >= 15 ? verified2025Champions : []); });
    return () => controller.abort();
  }, [season, week]);
  return useMemo(() => new Map(rows.map((row) => [row.team, row])), [rows]);
}

function RankingsTable({ rows, season, week, limit, loading=false }: { rows:SeasonRankingRow[];season:number;week:number;limit?:number;loading?:boolean }) {
  const champions = useConferenceChampions(season, week);
  return (
    <div className="rankings-shell">
      <div className="rankings-head">
        <span>RK</span>
        <span>TEAM</span>
        <span>RECORD</span>
        <span>BCS AVG</span>
        <span>RESULTS</span>
        <span>H2H RK</span>
        <span>SOS RK</span>
        <span>H+ RK</span>
        <span>CONF TITLE</span>
      </div>
      {loading && !rows.length ? <div className="rankings-loading">Calculating season résumé and schedule strength…</div> : rows.slice(0, limit).map((entry) => (
        <div className="ranking-row" key={entry.team}>
          <strong className="ranking-number">{entry.rank}</strong>
          <div className="ranking-team">
            <TeamMark name={entry.team} size="sm" logo={entry.logo} />
            <span>
              <strong>{entry.team}</strong>
              <small>{entry.conference || teamMap.get(entry.team)?.conference}</small>
            </span>
          </div>
          <div className="ranking-metrics">
            <span data-label="RECORD">{entry.record}</span>
            <strong data-label="BCS AVG">{(entry.bcsScore*100).toFixed(1)}</strong>
            <span data-label="RESULTS">{(entry.resultsScore*100).toFixed(0)}</span>
            <strong data-label="H2H RK">#{entry.headToHeadRank}</strong>
            <strong data-label="SOS RK">#{entry.sosRank}</strong>
            <strong data-label="H+ RK">#{entry.powerRank}</strong>
            <span data-label="CONF TITLE">{champions.has(entry.team) ? <small className={`champ-tag ${champions.get(entry.team)?.status}`}>{champions.get(entry.team)?.status === "actual" ? "ACTUAL CHAMP" : "PRED CHAMP"}</small> : <i className="dash">—</i>}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BackfillBanner() {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{status:"checking"|"running"|"done"|"error"|"unconfigured";message:string}>({ status:"checking",message:"Checking historical season archive…" });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/bootstrap", { cache:"no-store" });
        const payload = await readJsonBody<BackfillPayload>(response);
        if (!response.ok) throw new Error(payload.message || "Could not inspect the historical archive");
        if (!payload.configured) { if (!cancelled) setState({ status:"unconfigured",message:"Historical archive is waiting for its private data connection." }); return; }
        const missing = payload.missing || [];
        if (!missing.length) { if (!cancelled) setState({ status:"done",message:archiveSummary(payload) }); return; }
        const importing = missing[0];
        const seasonStatus = payload.seasons?.find((row) => row.season === importing);
        const stageLabel = seasonStatus?.stage === "teams" ? "team identities and logos" : seasonStatus?.stage === "priors" ? "returning production and recruiting priors" : seasonStatus?.stage === "schedule" ? "schedule and final scores" : seasonStatus?.stage === "stats" ? `weekly box scores (${seasonStatus.statWeekCount}/${seasonStatus.completedWeekCount})` : "Harper+ v6 formula snapshots";
        if (!cancelled) setState({ status:"running",message:`Automatic archive work: ${importing} ${stageLabel} · ${seasonStatus?.progressPercent ?? 0}%` });
      } catch (error) {
        if (!cancelled) setState({ status:"error",message:error instanceof Error ? error.message : "Historical backfill failed" });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [retry]);
  return <div className={`backfill-banner ${state.status}`}><div><span className="backfill-pulse" /><strong>{state.status === "running" ? "BUILDING ARCHIVE" : state.status === "done" ? "ARCHIVE READY" : state.status === "error" ? "ARCHIVE NEEDS ATTENTION" : "HISTORICAL ARCHIVE"}</strong><small>{state.message}</small></div>{state.status === "error" ? <button onClick={() => setRetry((value) => value + 1)}>RETRY</button> : null}</div>;
}

type ModelVintageProps = {
  season: number;
  week: number;
  setSeason: (value: number) => void;
  setWeek: (value: number) => void;
};

function sourceLabel(source: "database" | "embedded" | "loading", season: number) {
  if (source === "loading") return "LOADING SNAPSHOT";
  if (source === "database") return "LIVE WEEKLY SNAPSHOT";
  return season === modelSnapshot.season ? "WORKBOOK FALLBACK" : "AWAITING HISTORICAL SYNC";
}

function MatchupLab({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [homeName, setHomeName] = useState("Indiana");
  const [awayName, setAwayName] = useState("Ohio State");
  const [neutral, setNeutral] = useState(false);
  const dynamic = useDynamicProfiles(season, week);
  const availableTeams = dynamic.teams;
  const lookup = useMemo(() => new Map(availableTeams.map((team) => [team.name, team])), [availableTeams]);

  const resolvedHomeName = lookup.has(homeName) ? homeName : (lookup.has("Indiana") ? "Indiana" : availableTeams[0]?.name);
  const resolvedAwayName = lookup.has(awayName) ? awayName : (lookup.has("Ohio State") ? "Ohio State" : (availableTeams[1] || availableTeams[0])?.name);
  const home = resolvedHomeName ? lookup.get(resolvedHomeName) : undefined;
  const away = resolvedAwayName ? lookup.get(resolvedAwayName) : undefined;
  const projection = useMemo(() => home && away ? projectMatchup(home, away, week, neutral) : null, [home, away, week, neutral]);
  const swap = () => { if (resolvedAwayName && resolvedHomeName) { setHomeName(resolvedAwayName); setAwayName(resolvedHomeName); } };

  return (
    <section className="page-section matchup-page">
      <div className="section-kicker">HISTORICAL PROFILE ENGINE · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
      <div className="section-title-row">
        <div><h1>Matchup Lab</h1><p>Choose any FBS teams and replay the matchup with the exact weekly statistical profile available at that point in the season.</p></div>
        <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} />
      </div>

      {!home || !away ? <div className="data-empty"><strong>No model snapshot is loaded for {season}, week {week}.</strong><span>The automatic historical loader will populate this season after the data connection is activated.</span></div> : <>
        <div className="matchup-board">
          <div className="matchup-side">
            <span className="side-label">HOME</span>
            <TeamMark name={home.name} size="lg" logo={home.logo} />
            <select aria-label="Home team" value={home.name} onChange={(event) => setHomeName(event.target.value)}>{availableTeams.map((team) => <option key={team.name}>{team.name}</option>)}</select>
            <small>{home.conference} · {home.mascot}</small>
            {projection ? <strong className="projected-score">{projection.homeScore.toFixed(0)}</strong> : null}
            {projection ? <b>{(projection.homeWin * 100).toFixed(0)}% WIN</b> : null}
          </div>

          <div className="matchup-center">
            <span>HARPER+ PROJECTION</span>
            <strong>{projection ? `${projection.margin >= 0 ? home.abbr : away.abbr} ${Math.abs(projection.margin).toFixed(1)}` : "—"}</strong>
            <small>{projection ? `TOTAL ${projection.total.toFixed(1)}` : "PROFILE UNAVAILABLE"}</small>
            <button className="swap-button" type="button" onClick={swap}>SWAP SIDES</button>
            <label className="toggle-row"><input type="checkbox" checked={neutral} onChange={(event) => setNeutral(event.target.checked)} /><span>Neutral site</span></label>
          </div>

          <div className="matchup-side">
            <span className="side-label">AWAY</span>
            <TeamMark name={away.name} size="lg" logo={away.logo} />
            <select aria-label="Away team" value={away.name} onChange={(event) => setAwayName(event.target.value)}>{availableTeams.map((team) => <option key={team.name}>{team.name}</option>)}</select>
            <small>{away.conference} · {away.mascot}</small>
            {projection ? <strong className="projected-score">{projection.awayScore.toFixed(0)}</strong> : null}
            {projection ? <b>{((1 - projection.homeWin) * 100).toFixed(0)}% WIN</b> : null}
          </div>
        </div>

        {projection ? <EdgeAnalysisCard analysis={projection.edgeAnalysis} /> : null}

        {projection ? <div className="matchup-data-grid">
          <div className="stat-comparison">
            <div className="comparison-head"><span>{home.abbr}</span><b>PROJECTED PROFILE</b><span>{away.abbr}</span></div>
            {[["Yards / Play", projection.homeStats.ypp, projection.awayStats.ypp], ["Yards / Pass", projection.homeStats.ypa, projection.awayStats.ypa], ["Yards / Rush", projection.homeStats.ypc, projection.awayStats.ypc], ["Pass Attempts", projection.homeStats.patt, projection.awayStats.patt], ["Rush Attempts", projection.homeStats.ratt, projection.awayStats.ratt]].map(([label, homeValue, awayValue]) => <div className="comparison-row" key={String(label)}><strong>{Number(homeValue).toFixed(1)}</strong><span>{label}</span><strong>{Number(awayValue).toFixed(1)}</strong></div>)}
          </div>
          <div className="allowance-card">
            <div className="comparison-head"><span>{home.abbr}</span><b>OPPONENT OUTPUT ALLOWED</b><span>{away.abbr}</span></div>
            {[["Yards / Play", latestProfile(home, week)?.d[0], latestProfile(away, week)?.d[0]], ["Yards / Pass", latestProfile(home, week)?.d[1], latestProfile(away, week)?.d[1]], ["Yards / Rush", latestProfile(home, week)?.d[2], latestProfile(away, week)?.d[2]], ["Pass Attempts", latestProfile(home, week)?.d[3], latestProfile(away, week)?.d[3]], ["Rush Attempts", latestProfile(home, week)?.d[4], latestProfile(away, week)?.d[4]]].map(([label, homeValue, awayValue]) => <div className="comparison-row allowance-row" key={String(label)}><strong>{homeValue === undefined ? "—" : `${(Number(homeValue) * 100).toFixed(0)}%`}</strong><span>{label}</span><strong>{awayValue === undefined ? "—" : `${(Number(awayValue) * 100).toFixed(0)}%`}</strong></div>)}
            <p className="allowance-note">100% is the schedule-adjusted FBS average opponent output. Lower is better: 82% means that defense holds opponents to 82% of average after opponent quality is accounted for.</p>
          </div>
          <p className="model-note">Each matchup combines the selected week’s schedule-adjusted offense with the opponent’s schedule-adjusted allowance profile, then applies the workbook-recovered scoring function and a calibrated {modelCalibration.homeFieldAdvantage.toFixed(1)}-point home edge.</p>
        </div> : null}
      </>}
    </section>
  );
}

function All137({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [query, setQuery] = useState("");
  const dynamic = useDynamicProfiles(season, week);
  const availableTeams = dynamic.teams;
  const rows = useMemo(() => availableTeams.map((team) => {
    let wins = 0, losses = 0, expectedWins = 0, marginTotal = 0, games = 0;
    for (const opponent of availableTeams) {
      if (opponent.name === team.name) continue;
      const result = projectMatchup(team, opponent, week, true);
      if (!result) continue;
      games += 1; expectedWins += result.homeWin; marginTotal += result.margin;
      if (result.margin > 0) wins += 1; else losses += 1;
    }
    return { team, wins, losses, games, expectedWins, winPct: games ? wins / games : 0, averageMargin: games ? marginTotal / games : 0 };
  }).sort((a, b) => b.wins - a.wins || b.expectedWins - a.expectedWins || b.averageMargin - a.averageMargin).map((row, index) => ({ ...row, rank: index + 1 })), [availableTeams, week]);
  const filtered = rows.filter((row) => `${row.team.name} ${row.team.conference}`.toLowerCase().includes(query.toLowerCase()));
  const leader = rows[0];
  const uniqueMatchups = (availableTeams.length * (availableTeams.length - 1)) / 2;

  return <section className="page-section all137-page">
    <div className="section-kicker">NEUTRAL-FIELD ROUND ROBIN · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>All137</h1><p>Every model-ready FBS team plays every other team once. Teams rank by projected wins, then expected wins and average margin.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} /></div>
    {!leader ? <div className="data-empty"><strong>No All137 field exists for this model vintage yet.</strong><span>Select a populated season and week, or activate the historical sync.</span></div> : <>
      <div className="all137-summary">
        <article><span>ROUND-ROBIN LEADER</span><div><TeamMark name={leader.team.name} size="md" logo={leader.team.logo} /><strong>{leader.team.name}</strong></div><b>{leader.wins}–{leader.losses}</b></article>
        <article><span>TEAMS LOADED</span><strong>{availableTeams.length}</strong><small>{season} model-ready profiles</small></article>
        <article><span>UNIQUE MATCHUPS</span><strong>{uniqueMatchups.toLocaleString()}</strong><small>neutral-field simulations</small></article>
        <article><span>MODEL VINTAGE</span><strong>W{week}</strong><small>{season} snapshot</small></article>
      </div>
      <div className="all137-toolbar"><div><strong>Round-robin standings</strong><span>Each record contains {availableTeams.length - 1} neutral-field games.</span></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team or conference" aria-label="Search All137 rankings" /></div>
      <div className="all137-table-shell">
        <div className="all137-head"><span>RK</span><span>TEAM</span><span>PROJECTED RECORD</span><span>WIN %</span><span>EXPECTED WINS</span><span>AVG MARGIN</span></div>
        {filtered.map((row) => <div className="all137-row" key={row.team.name}><strong>{row.rank}</strong><div><TeamMark name={row.team.name} size="sm" logo={row.team.logo} /><span><strong>{row.team.name}</strong><small>{row.team.conference}</small></span></div><div className="all137-metrics"><b data-label="RECORD">{row.wins}–{row.losses}</b><span data-label="WIN %">{(row.winPct * 100).toFixed(1)}%</span><span data-label="EXP WINS">{row.expectedWins.toFixed(1)}</span><span data-label="AVG MARGIN" className={row.averageMargin >= 0 ? "positive" : "negative"}>{row.averageMargin >= 0 ? "+" : ""}{row.averageMargin.toFixed(1)}</span></div></div>)}
      </div>
      <p className="all137-disclaimer">The field automatically follows the official FBS membership returned for the selected season. In this snapshot, each team is evaluated against {availableTeams.length - 1} opponents.</p>
    </>}
  </section>;
}

function TeamStatsPage({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("ALL");
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
  const filtered = useMemo(() => sortTeamStatsRows(rows.filter((row) =>
    (conference === "ALL" || row.conference === conference)
    && `${row.team} ${row.conference}`.toLowerCase().includes(query.toLowerCase())
  ), sortKey, sortDirection), [conference, query, rows, sortDirection, sortKey]);
  const topOffense = [...rows].sort((a, b) => average([b.offYppIndex, b.offYpaIndex, b.offYpcIndex]) - average([a.offYppIndex, a.offYpaIndex, a.offYpcIndex]))[0];
  const topDefense = [...rows].sort((a, b) => average([a.defYppIndex, a.defYpaIndex, a.defYpcIndex]) - average([b.defYppIndex, b.defYpaIndex, b.defYpcIndex]))[0];
  const averageGames = rows.length ? average(rows.map((row) => row.gamesPlayed)) : 0;
  const activeSort = TEAM_STATS_SORT_COLUMNS.find((column) => column.key === sortKey) ?? TEAM_STATS_SORT_COLUMNS[2];
  const changeSort = (nextKey:TeamStatsSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(defaultTeamStatsSortDirection(nextKey));
  };

  return <section className="page-section stats-page">
    <div className="section-kicker">TEAM STAT DATABASE · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>Team Stats</h1><p>Weekly cumulative team production, raw defensive allowances and opponent-adjusted efficiency indices frozen after each week.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} /></div>
    {!rows.length ? <div className="data-empty"><strong>No team-stat snapshot is available for {season}, week {week}.</strong><span>Historical seasons populate automatically when the data pipeline is activated.</span></div> : <>
      <div className="stats-summary">
        <article><span>FBS PROFILES</span><strong>{rows.length}</strong><small>{season} week {week}</small></article>
        <article><span>AVG GAMES IN SAMPLE</span><strong>{averageGames ? averageGames.toFixed(1) : "—"}</strong><small>cumulative through selected week</small></article>
        <article><span>TOP OFFENSE INDEX</span><strong>{topOffense?.team}</strong><small>{topOffense ? `${(average([topOffense.offYppIndex, topOffense.offYpaIndex, topOffense.offYpcIndex]) * 100).toFixed(0)} rating` : "—"}</small></article>
        <article><span>TOP DEFENSE INDEX</span><strong>{topDefense?.team}</strong><small>{topDefense ? `${(average([topDefense.defYppIndex, topDefense.defYpaIndex, topDefense.defYpcIndex]) * 100).toFixed(0)}% allowed` : "—"}</small></article>
      </div>
      <div className="data-toolbar"><div><strong>Weekly team profiles</strong><span>Sorted by {activeSort.label} {sortDirection === "asc" ? "ascending" : "descending"}. Opponent allowed percentages: lower is better.</span></div><div><select value={conference} onChange={(event) => setConference(event.target.value)} aria-label="Filter conference"><option value="ALL">All conferences</option>{conferences.map((value) => <option key={value}>{value}</option>)}</select><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team" aria-label="Search team stats" /><div className="stats-mobile-sort"><label htmlFor="team-stats-sort">SORT TEAM STATS</label><select id="team-stats-sort" value={sortKey} onChange={(event) => changeSort(event.target.value as TeamStatsSortKey)} aria-label="Sort team stats by column">{TEAM_STATS_SORT_COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select><button type="button" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={`Change sort direction to ${sortDirection === "asc" ? "descending" : "ascending"}`}>{sortDirection === "asc" ? "↑ ASC" : "↓ DESC"}</button></div></div></div>
      <div className="stats-table-shell">
        <div className="stats-head" role="row">{TEAM_STATS_SORT_COLUMNS.map((column) => {
          const active = column.key === sortKey;
          return <div role="columnheader" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} key={column.key}><button type="button" className={active ? "active" : ""} onClick={() => changeSort(column.key)} aria-label={`Sort by ${column.label}${active ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}><span>{column.label}</span><i aria-hidden="true">{active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</i></button></div>;
        })}</div>
        {filtered.map((row) => <div className="stats-row" key={row.team}><div><TeamMark name={row.team} size="sm" logo={row.logo} /><span><strong>{row.team}</strong><small>{row.conference || "FBS"}</small></span></div><div className="stats-metrics"><span data-label="GP">{row.gamesPlayed || "—"}</span><b data-label="OFF YPP">{row.offYpp.toFixed(2)}</b><span data-label="OFF YPA">{row.offYpa.toFixed(2)}</span><span data-label="OFF YPC">{row.offYpc.toFixed(2)}</span><span data-label="PASS / GM">{row.offPatt.toFixed(1)}</span><span data-label="RUSH / GM">{row.offRatt.toFixed(1)}</span><b data-label="OPP YPP" className={row.defYppIndex < 1 ? "positive" : "negative"}>{(row.defYppIndex * 100).toFixed(0)}%</b><span data-label="OPP YPA">{(row.defYpaIndex * 100).toFixed(0)}%</span><span data-label="OPP YPC">{(row.defYpcIndex * 100).toFixed(0)}%</span></div></div>)}
      </div>
      <p className="all137-disclaimer">Raw offensive efficiencies stay cumulative through the selected week. The opponent columns use the revised iterative schedule correction, preserving both era context and the quality of offenses each defense actually faced.</p>
    </>}
  </section>;
}

function formatGameDate(value?: string) {
  if (!value) return "TBD";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function signed(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function SchedulePage({ season, setSeason }: Pick<ModelVintageProps, "season" | "setSeason">) {
  const [week, setWeek] = useState(0);
  const [teamFilter, setTeamFilter] = useState("");
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const requestKey = `${season}:${week}:${teamFilter}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "schedule", season: String(season), week: String(week) });
    if (teamFilter) params.set("team", teamFilter);
    fetch(`/api/data?${params}`, { signal: controller.signal }).then((response) => readJsonBody<{ rows?: ScheduleRow[]; configured?: boolean }>(response)).then((payload) => { setRows(payload.rows || []); setConfigured(Boolean(payload.configured)); setLoadedKey(requestKey); }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setRows([]); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [season, week, teamFilter, requestKey]);
  const loading = loadedKey !== requestKey;
  const activeRows = loading ? [] : rows;
  const performance = useSeasonPerformance(season);
  const teamOptions = useMemo(() => [...new Set([...teams.map((team) => team.name), ...rows.flatMap((row) => [row.homeTeam, row.awayTeam])])].sort(), [rows]);
  const spread = performance.data?.spread;
  const total = performance.data?.total;
  const teamProjection = useMemo(() => buildTeamProjectedSeason(activeRows, teamFilter), [activeRows, teamFilter]);

  return <section className="page-section schedule-page">
    <div className="section-kicker">EVERY TEAM · EVERY GAME · MODEL VS MARKET</div>
    <div className="section-title-row"><div><h1>Schedule</h1><p>Predictions, final scores and closing-market grades for every FBS game, with a team-by-team schedule view.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} allWeeks /></div>
    <div className="schedule-filter"><label htmlFor="schedule-team">TEAM SCHEDULE</label><select id="schedule-team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="">All FBS games</option>{teamOptions.map((team) => <option key={team}>{team}</option>)}</select><span>{loading ? "Loading games…" : teamFilter && teamProjection.games.length ? `${activeRows.length} games · H+ ${teamProjection.finalProjectedRecord} · ${teamProjection.expectedWins.toFixed(1)} xW` : `${activeRows.length} games shown`}</span></div>
    <div className="schedule-summary">
      <article><span>SEASON ATS · WEEK 5+</span><strong>{performance.loading ? "…" : spread?.accuracy === null || spread?.accuracy === undefined ? "—" : `${(spread.accuracy*100).toFixed(1)}%`}</strong><small>{spread?.graded ?? 0} graded picks · {spread?.wins ?? 0}-{spread?.losses ?? 0}{spread?.pushes ? `-${spread.pushes}P` : ""}</small></article>
      <article><span>SEASON TOTALS · WEEK 5+</span><strong>{performance.loading ? "…" : total?.accuracy === null || total?.accuracy === undefined ? "—" : `${(total.accuracy*100).toFixed(1)}%`}</strong><small>{total?.graded ?? 0} graded picks · {total?.wins ?? 0}-{total?.losses ?? 0}{total?.pushes ? `-${total.pushes}P` : ""}</small></article>
      <article><span>SPREAD ERROR · WEEK 5+</span><strong>{performance.loading ? "…" : spread?.meanAbsoluteError === null || spread?.meanAbsoluteError === undefined ? "—" : spread.meanAbsoluteError.toFixed(1)}</strong><small>mean absolute points · season-wide</small></article>
      <article><span>TOTAL ERROR · WEEK 5+</span><strong>{performance.loading ? "…" : total?.meanAbsoluteError === null || total?.meanAbsoluteError === undefined ? "—" : total.meanAbsoluteError.toFixed(1)}</strong><small>mean absolute points · season-wide</small></article>
    </div>
    {!activeRows.length ? <div className="data-empty"><strong>{loading ? "Loading the schedule…" : `No schedule data is loaded for ${season}${week ? ` week ${week}` : ""}.`}</strong><span>{configured ? "Try another season or week." : "The schedule will backfill from 2021 forward when the private data connection is activated."}</span></div> : <div className="schedule-table-shell">
      <div className="schedule-head"><span>DATE / PHASE</span><span>MATCHUP</span><span>H+ PREDICTION</span><span>FINAL</span><span>VEGAS MARKET</span><span>MODEL EDGE</span><span>GRADE / ERROR</span></div>
      {activeRows.map((row) => {
        const perspective = teamFilter ? (row.homeTeam === teamFilter ? `vs ${row.awayTeam}` : `@ ${row.homeTeam}`) : `${row.awayTeam} @ ${row.homeTeam}`;
        const location = row.neutralSite ? "NEUTRAL" : teamFilter ? (row.homeTeam === teamFilter ? "HOME" : "AWAY") : (row.venue || "");
        const projected = teamFilter ? teamProjection.byGame.get(row.gameId) : undefined;
        return <article className={`schedule-game-entry ${expandedGameId === row.gameId ? "open" : ""}`} key={row.gameId}><div className="schedule-row">
          <div data-label="DATE / PHASE"><strong>{formatGameDate(row.startDate)}</strong><small>{row.seasonType === "postseason" ? `POSTSEASON · W${row.week}` : `REGULAR · W${row.week}`}</small></div>
          <div data-label="MATCHUP" className="schedule-matchup-cell"><span className="schedule-logo-pair"><TeamMark name={row.awayTeam} size="sm" logo={row.awayLogo} /><TeamMark name={row.homeTeam} size="sm" logo={row.homeLogo} /></span><span><strong>{perspective}</strong><small>{location}</small></span></div>
          <div data-label="H+ MODEL" className="schedule-model-cell"><b>{row.predictedAwayScore === null || row.predictedHomeScore === null ? "—" : `${row.predictedAwayScore.toFixed(0)}–${row.predictedHomeScore.toFixed(0)}`}</b><small>Spread {signed(row.modelHomeSpread)} · Total {row.modelTotal === null ? "—" : row.modelTotal.toFixed(1)}</small><small>{row.homeWinProbability === null ? "MODEL BUILD PENDING" : `${row.homeTeam} ${(row.homeWinProbability * 100).toFixed(0)}% · ${row.predictionSource === "live-profile" ? "LIVE PROFILE" : `FROM WK ${row.generatedFromWeek ?? "—"}`}`}</small>{projected ? <small className={projected.projectedResult === "W" ? "positive" : projected.projectedResult === "L" ? "negative" : ""}>H+ {projected.projectedResult} · PROJ RECORD {projected.projectedRecord} · xW {projected.expectedWins.toFixed(1)}</small> : null}</div>
          <div data-label="FINAL"><b>{row.awayPoints === null || row.homePoints === null ? "—" : `${row.awayPoints}–${row.homePoints}`}</b><small>{row.completed ? "FINAL" : "UPCOMING"}</small></div>
          <div data-label="VEGAS"><span>{row.formattedSpread || (row.vegasSpread === null ? "Spread —" : `${row.homeTeam} ${signed(row.vegasSpread)}`)}</span><small>O/U {row.vegasTotal === null ? "—" : row.vegasTotal.toFixed(1)} · {row.provider || "market"}</small></div>
          <div data-label="MODEL EDGE"><span>Spread {signed(row.spreadEdge)}</span><small>Total {signed(row.totalEdge)}</small>{row.edgeAnalysis ? <button className="schedule-edge-toggle" type="button" aria-expanded={expandedGameId === row.gameId} onClick={() => setExpandedGameId((current) => current === row.gameId ? null : row.gameId)}>{expandedGameId === row.gameId ? "HIDE WHY" : "WHY FAVORED"}</button> : null}</div>
          <div data-label="GRADE" className="result-stack"><span className={`result-pill ${row.spreadResult || "pending"}`}>ATS {row.spreadResult || "—"}</span><span className={`result-pill ${row.totalResult || "pending"}`}>O/U {row.totalResult || "—"}</span><small>{row.spreadError === null ? "" : `Err ${row.spreadError.toFixed(1)} / ${row.totalError?.toFixed(1) ?? "—"}`}</small></div>
        </div>{expandedGameId === row.gameId && row.edgeAnalysis ? <EdgeAnalysisCard analysis={row.edgeAnalysis} compact /> : null}</article>;
      })}
    </div>}
    <p className="all137-disclaimer">Predictions are generated from the prior week’s profile so completed-game results never leak into the forecast. When a team is selected, H+ projected record is the cumulative win/loss path from those game-level picks; xW is the cumulative probability-based expected-win total. The season ATS, totals and error cards are intentionally graded from Week 5 onward.</p>
  </section>;
}

function TeamLab({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const [selectedName, setSelectedName] = useState("Indiana");
  const [query, setQuery] = useState("");
  const dynamic = useDynamicProfiles(season, week);
  const availableTeams = dynamic.teams;
  const lookup = useMemo(() => new Map(availableTeams.map((team) => [team.name, team])), [availableTeams]);
  const resolvedSelectedName = lookup.has(selectedName) ? selectedName : (lookup.has("Indiana") ? "Indiana" : availableTeams[0]?.name);
  const selected = resolvedSelectedName ? lookup.get(resolvedSelectedName) : undefined;
  const profile = selected ? latestProfile(selected, week) : null;
  const profileRows = useMemo(() => dynamic.rows.length ? dynamic.rows : availableTeams.map((team) => modelTeamProfileRow(team, season, week)).filter((row):row is DynamicProfileRow => Boolean(row)), [availableTeams, dynamic.rows, season, week]);
  const selectedRow = selected ? profileRows.find((row) => row.team === selected.name) : undefined;
  const seasonRankings = useSeasonRankings(season, week);
  const ranked = selected ? seasonRankings.rows.find((entry) => entry.team === selected.name) : undefined;
  const filtered = availableTeams.filter((team) => `${team.name} ${team.conference}`.toLowerCase().includes(query.toLowerCase()));
  const selectTeam = (teamName:string) => {
    setSelectedName(teamName);
    if (window.innerWidth <= 760) window.requestAnimationFrame(() => document.getElementById("team-profile-card")?.scrollIntoView({ behavior:"smooth", block:"start" }));
  };

  return <section className="page-section">
    <div className="section-kicker">{availableTeams.length} TEAMS · {season} {week===0?"PRESEASON BASELINE":`WEEK ${week}`} · <span className={`data-source ${dynamic.source}`}>{sourceLabel(dynamic.source, season)}</span></div>
    <div className="section-title-row"><div><h1>Team Lab</h1><p>Raw offense, opponent output allowed, opponent-adjusted percentages of the FBS average and correctly oriented national ranks.</p></div><VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} /></div>
    {!selected ? <div className="data-empty"><strong>No team profile is available for this model vintage.</strong><span>Choose a populated snapshot or activate historical sync.</span></div> : <div className="team-lab-grid">
      <aside className="team-directory"><div className="team-directory-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team or conference" aria-label="Search teams" /><span>{filtered.length} of {availableTeams.length} teams</span></div><div className="team-directory-list">{filtered.map((team) => <button key={team.name} className={selected.name === team.name ? "active" : ""} onClick={() => selectTeam(team.name)}><TeamMark name={team.name} size="sm" logo={team.logo} /><span><strong>{team.name}</strong><small>{team.conference}</small></span></button>)}</div></aside>
      <article id="team-profile-card" className="team-profile-card" style={{ "--team": selected.color } as CSSProperties}>
        <div className="team-profile-hero"><TeamMark name={selected.name} size="lg" logo={selected.logo} /><div><span>{selected.conference}</span><h2>{selected.name}</h2><p>{selected.mascot}</p></div><div className="team-rank-callout"><small>BCS-STYLE RK</small><strong>{ranked ? `#${ranked.rank}` : profile?.rank ? `#${profile.rank}` : "—"}</strong></div></div>
        {profile && selectedRow ? <><div className="profile-columns"><TeamMetricPanel title="OFFENSIVE PRODUCTION" subtitle="Raw output with opponent-adjusted percentage indices" row={selectedRow} rows={profileRows} side="offense" /><TeamMetricPanel title="DEFENSIVE OUTPUT ALLOWED" subtitle="Raw allowances with opponent-adjusted percentage indices" row={selectedRow} rows={profileRows} side="defense" /></div><div className="trend-panel"><div><strong>MODEL VINTAGE</strong><span>{week===0?`${season} preseason · four-season history + returning production + recruiting`:`${season} cumulative profile through week ${week}`}</span></div><div className="index-readout"><span>ADJ OFFENSE VS FBS AVG</span><strong>{(average(profile.o.slice(0, 3))*100).toFixed(0)}%</strong><span>ADJ OPP OUTPUT ALLOWED</span><strong>{(average(profile.d.slice(0, 3))*100).toFixed(0)}%</strong></div></div></> : <div className="empty-state">No completed profile exists at or before this week.</div>}
      </article>
    </div>}
  </section>;
}

function SeasonSimulationPage({ season, week, setSeason, setWeek }: ModelVintageProps) {
  const simulation = useSeasonSimulation(season, week);
  const data = simulation.data;
  const logoByTeam = useMemo(() => new Map((data?.rankings ?? []).map((row) => [row.team, row.logo])), [data]);
  const rounds: BracketProjection["round"][] = data?.format === 4
    ? ["Semifinal", "Championship"]
    : ["First Round", "Quarterfinal", "Semifinal", "Championship"];
  return <section className="page-section simulation-page">
    <div className="section-kicker">ALWAYS PREDICTIVE · SCHEDULE → TITLE GAMES → CFP</div>
    <div className="section-title-row">
      <div><h1>Season Simulation</h1><p>Project every remaining matchup, determine conference title games, seed the playoff and re-simulate the bracket from the selected weekly model state.</p></div>
      <VintageControl season={season} week={week} setSeason={setSeason} setWeek={setWeek} />
    </div>

    {simulation.loading ? <div className="simulation-state">Running the full-season projection…</div> : null}
    {!simulation.loading && !data ? <div className="simulation-state error"><strong>Simulation waiting for season data</strong><span>{simulation.error || "The automatic archive will populate this view when the season schedule and profiles are ready."}</span></div> : null}
    {data ? <>
      <div className="simulation-hero">
        <div>
          <span>{data.fieldMode === "actual-field" ? "HISTORICAL FIELD · MODEL-SIMULATED RESULTS" : "PROJECTED CFP CHAMPION"}</span>
          <h2>{data.champion || "Field pending"}</h2>
          <p>{data.fieldMode === "actual-field"
            ? `${season} preserves the teams and seeds that actually made the playoff, but none of the displayed matchup results use the real bracket outcomes.`
            : `${season} uses projected records, conference standings, head-to-head tiebreaks and the résumé-protected Harper BCS v3. The five highest-ranked projected conference champions plus seven at-larges qualify; the top four seeds receive byes.`}</p>
        </div>
        {data.champion ? <TeamMark name={data.champion} size="lg" logo={logoByTeam.get(data.champion)} /> : null}
        <div className="simulation-hero-metrics"><div><small>FORMAT</small><strong>{data.format} TEAM</strong></div><div><small>TITLE GAME EDGE</small><strong>{data.championshipProbability === null ? "—" : `${(data.championshipProbability*100).toFixed(0)}%`}</strong></div><div><small>DATA VINTAGE</small><strong>WK {data.effectiveWeek}</strong></div></div>
      </div>

      <div className="simulation-grid">
        <article className="simulation-rankings-card">
          <div className="block-head"><div><span className="section-kicker">PROJECTED FINAL TABLE</span><h2>Top 25 after championship week</h2></div><small>H2H APPLIED</small></div>
          <div className="sim-rankings-shell">
            <div className="sim-rankings-head"><span>RK</span><span>TEAM / KEY RESULTS</span><span>RECORD</span><span>EXP W</span><span>SOS</span><span>H2H</span><span>CFP</span></div>
            {data.rankings.slice(0,25).map((row) => <div className="sim-ranking-row" key={row.team}>
              <strong>{row.rank}</strong>
              <div><TeamMark name={row.team} size="sm" logo={row.logo} /><span className="sim-team-copy"><strong>{row.team}</strong><small className="sim-best-wins"><b>BEST WINS</b>{row.projectedWinsOver.length ? row.projectedWinsOver.join(", ") : "No wins projected"}</small><small className="sim-worst-losses"><b>WORST LOSSES</b>{row.projectedLossesTo.length ? row.projectedLossesTo.join(", ") : "None"}</small></span></div>
              <div className="sim-ranking-metrics">
                <b data-label="RECORD">{row.projectedRecord}</b>
                <span data-label="EXP W">{row.expectedWins.toFixed(1)}</span>
                <span data-label="SOS">#{row.sosRank}</span>
                <span data-label="H2H">#{row.headToHeadRank}</span>
                <span data-label="CFP">{row.playoffSeed ? <b className="seed-pill">#{row.playoffSeed}</b> : row.conferenceChampion ? <b className="champ-pill">CHAMP</b> : "—"}</span>
              </div>
            </div>)}
          </div>
        </article>

        <aside className="conference-projections">
          <div className="block-head"><div><span className="section-kicker">TITLE WEEK</span><h2>Conference projections</h2></div></div>
          <div>{data.conferenceChampionships.map((game) => <article key={game.conference}>
            <header><span>{game.conference}</span><b>{game.winner} · {(game.winnerProbability*100).toFixed(0)}%</b></header>
            <div className="conference-matchup">
              <div className={game.winner === game.firstTeam ? "winner" : ""}><TeamMark name={game.firstTeam} size="sm" logo={logoByTeam.get(game.firstTeam)} /><span>{game.firstTeam}</span><strong>{game.firstScore}</strong></div>
              <i>VS</i>
              <div className={game.winner === game.secondTeam ? "winner" : ""}><TeamMark name={game.secondTeam} size="sm" logo={logoByTeam.get(game.secondTeam)} /><span>{game.secondTeam}</span><strong>{game.secondScore}</strong></div>
            </div>
          </article>)}</div>
        </aside>
      </div>

      <article className="playoff-card">
        <div className="block-head"><div><span className="section-kicker">COLLEGE FOOTBALL PLAYOFF</span><h2>{data.fieldMode === "actual-field" ? `${season} actual field · Harper+ simulated bracket` : `${season} projected field and bracket`}</h2></div><small>NO REAL BRACKET RESULTS USED</small></div>
        <div className={`playoff-bracket format-${data.format}`}>{rounds.map((round) => <section key={round} className="bracket-round"><header>{round}</header><div>{data.bracket.filter((game) => game.round === round).map((game) => <article className="bracket-game" key={game.id}>
          <div className={game.winner === game.firstTeam ? "winner" : ""}><span className="bracket-seed">{game.firstSeed}</span><TeamMark name={game.firstTeam} size="sm" logo={logoByTeam.get(game.firstTeam)} /><strong>{game.firstTeam}</strong><b>{game.firstScore}</b></div>
          <div className={game.winner === game.secondTeam ? "winner" : ""}><span className="bracket-seed">{game.secondSeed}</span><TeamMark name={game.secondTeam} size="sm" logo={logoByTeam.get(game.secondTeam)} /><strong>{game.secondTeam}</strong><b>{game.secondScore}</b></div>
          <footer><span>{game.campusGame ? "CAMPUS" : "NEUTRAL"}</span><b>{game.winner} {(game.winnerProbability*100).toFixed(0)}%</b></footer>
        </article>)}</div></section>)}</div>
      </article>
      <p className="simulation-method">{data.methodology}</p>
    </> : null}
  </section>;
}

function Methodology() {
  const calibration = useCalibrationReport();
  return (
    <section className="page-section methodology-page">
      <div className="section-kicker">AUDITABLE MODEL ARCHITECTURE</div>
      <div className="section-title-row"><div><h1>How Harper+ Works</h1><p>The website ports the workbook’s calculation layers instead of treating the spreadsheet as a black box.</p></div></div>

      <div className="pipeline">
        {[
          ["01", "INGEST", "Schedules, box scores, lines, team identity"],
          ["02", "ADJUST", "Efficiency corrected for opponent quality and schedule connectivity"],
          ["03", "MATCH", "Team efficiency against opponent allowances"],
          ["04", "SCORE", "Regression converts efficiency and volume into points"],
          ["05", "RANK", "Results, schedule and a trimmed computer composite"],
        ].map(([number, label, text]) => <div key={number}><span>{number}</span><strong>{label}</strong><p>{text}</p></div>)}
      </div>

      <div className="method-grid">
        <article className="formula-card wide">
          <span className="card-label">RECOVERED SCORE FUNCTION</span>
          <h2>Expected points from efficiency + play volume</h2>
          <code>
            SCORE = {scoreCoefficients.intercept.toFixed(3)} + {scoreCoefficients.ypc.toFixed(3)}·YPC + {scoreCoefficients.ypp.toFixed(3)}·YPP + {scoreCoefficients.ypa.toFixed(3)}·YPA + {scoreCoefficients.ratt.toFixed(3)}·RATT + {scoreCoefficients.patt.toFixed(3)}·PATT
          </code>
          <p>Recovered against 703 clean workbook rows with an in-sample reconstruction RMSE of approximately 0.003 points.</p>
        </article>

        <article className="formula-card">
          <span className="card-label">CALIBRATED MATCHUP LAYER</span>
          <h2>Efficiency plus opponent-aware results</h2>
          <code>STAT INDEX = 25–52% ITERATIVE OPPONENT CORRECTION<br />FINAL MARGIN = 65% STAT PROFILE + 35% PRESEASON-SEEDED ELO<br />HOME FIELD = {modelCalibration.homeFieldAdvantage.toFixed(1)} POINTS</code>
          <p>Five offense/defense iterations discount production against weak units. The 25% base correction rises automatically when a profile is early, FCS-heavy or poorly connected; those same profiles receive extra Bayesian regression toward the four-season prior. Result-only Elo still updates from opponent expectation and capped margin of victory.</p>
        </article>

        <article className="formula-card">
          <span className="card-label">HARPER BCS</span>
          <h2>Résumé-led, schedule-aware</h2>
          <div className="weight-list">
            <div><span>Results + strength of record</span><strong>50%</strong></div>
            <div><span>SOS + quality wins</span><strong>20%</strong></div>
            <div><span>Trimmed six-signal computer</span><strong>30%</strong></div>
          </div>
          <p>The best and worst of six normalized computer signals are removed before the remaining four are averaged. Record protection keeps mature undefeated and one-loss résumés from being erased by conference-connected SOS, while direct head-to-head controls close comparisons and materially fewer losses break near-ties.</p>
        </article>
      </div>

      <div className="model-governance">
        <article><span className="card-label">PRESEASON PRIOR</span><h2>History plus roster continuity</h2><strong>40 · 30 · 20 · 10 + RP + RECRUIT</strong><p>The four-season performance blend remains the anchor. CFBD returning-production splits make the meaningful offensive adjustment, while recruiting class strength receives only a capped nudge so brand and conference talent cannot overwhelm demonstrated performance.</p></article>
        <article><span className="card-label">DURABLE DATA LAYERS</span><h2>Raw history stays fixed; formulas can evolve</h2><strong>STATS + OUTCOMES CACHED ONCE</strong><p>Completed schedules, scores, lines and team-game stats are retained. A model-version change rebuilds profiles and projections from that archive without downloading unchanged historical results again.</p></article>
        <article><span className="card-label">LEAKAGE GATE</span><h2>Only information available before kickoff counts</h2><strong>PRIOR-WEEK PROFILES ONLY</strong><p>The workbook’s postgame “real stats” reconstruction is intentionally excluded from forecast accuracy because it uses the completed game’s box score. Harper+ grades only predictions generated from the prior weekly snapshot.</p></article>
      </div>

      <div className="calibration-ledger">
        <div className="workbook-map-head"><div><span className="card-label">LIVE VALIDATION LEDGER</span><h2>Every model-ready season · Week 5+</h2></div><b>{calibration.data?.modelVersion || "V6"}</b></div>
        <div className="calibration-head"><span>SEASON</span><span>ATS</span><span>ATS RECORD</span><span>SPREAD MAE</span><span>TOTALS</span><span>TOTAL RECORD</span></div>
        {calibration.loading ? <div className="calibration-empty">Loading prior-week-only audits…</div> : calibration.data?.rows.length ? calibration.data.rows.map((row) => <div className="calibration-row" key={row.season}><strong>{row.season}</strong><b>{row.spread.accuracy === null ? "—" : `${(row.spread.accuracy*100).toFixed(1)}%`}</b><span>{row.spread.wins}–{row.spread.losses}{row.spread.pushes ? `–${row.spread.pushes}P` : ""}</span><span>{row.spread.meanAbsoluteError === null ? "—" : row.spread.meanAbsoluteError.toFixed(1)}</span><b>{row.total.accuracy === null ? "—" : `${(row.total.accuracy*100).toFixed(1)}%`}</b><span>{row.total.wins}–{row.total.losses}{row.total.pushes ? `–${row.total.pushes}P` : ""}</span></div>) : <div className="calibration-empty">V6 audits will appear as cached seasons finish recalculating. No postgame box-score columns are used.</div>}
        <p>Accuracy is descriptive, not guaranteed. A formula change is evaluated across the historical archive, with market grading beginning in Week 5 and postseason games retained.</p>
      </div>

      <div className="workbook-map">
        <div className="workbook-map-head"><div><span className="card-label">WORKBOOK AUDIT</span><h2>All 25 tabs mapped</h2></div><b>{workbookTabs.length} / 25</b></div>
        <div>{workbookTabs.map((tab) => <article key={tab.name}><strong>{tab.name}</strong><span>{tab.role}</span></article>)}</div>
      </div>
    </section>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modelSeason, setModelSeason] = useState(modelSnapshot.season);
  const [modelWeek, setModelWeek] = useState(modelSnapshot.week);
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState("Historical model snapshot ready");
  const seasonRankings = useSeasonRankings(modelSeason, modelWeek);
  const leader = seasonRankings.rows[0] ?? ({ rank:1,team:top25[0].team,conference:teamMap.get(top25[0].team)?.conference,logo:top25[0].logo,wins:13,losses:0,ties:0,record:top25[0].record,bcsScore:1,resultsScore:1,scheduleScore:1,computerScore:1,sorRank:1,sosRank:1,powerRank:1,eloRank:1,colleyRank:1,headToHeadRank:1 } satisfies SeasonRankingRow);
  const leaderTeam = teamMap.get(leader.team);
  const featuredProjection = projectMatchup(teamMap.get("Indiana")!, teamMap.get("Ohio State")!, modelSnapshot.week, true);
  const seasonPerformance = useSeasonPerformance(modelSeason);
  const activeNavLabel = nav.find((item) => item.id === section)?.label || "Model HQ";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    const closeOnDesktop = () => { if (window.innerWidth > 760) setMobileNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  const navigateTo = (nextSection: Section) => {
    setSection(nextSection);
    setMobileNavOpen(false);
    if (nextSection === "simulation" && modelSeason === modelSnapshot.season && activeModelSeason > modelSnapshot.season) {
      setModelSeason(activeModelSeason);
      setModelWeek(activeModelWeek);
    }
    window.requestAnimationFrame(() => window.scrollTo({ top:0, behavior:"smooth" }));
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
      <div className="topline">
        <div><span className="live-dot" /> MODEL VINTAGE · {modelSeason} WEEK {modelWeek}</div>
        <div className="ticker">{seasonRankings.rows.slice(0, 8).map((team) => <span key={team.team}><b>{team.rank}</b> {team.team}</span>)}</div>
        <div>{seasonPerformance.loading ? "…" : (seasonPerformance.data?.gameCount ?? 0).toLocaleString()} GAMES TRACKED</div>
      </div>

      <header className={`main-header ${mobileNavOpen ? "menu-open" : ""}`}>
        <button className="brand" onClick={() => { setModelSeason(modelSnapshot.season); setModelWeek(modelSnapshot.week); navigateTo("overview"); }} aria-label="Harper Plus home">
          <span className="brand-mark" aria-hidden="true"><b>H</b><i>+</i></span>
          <div><strong>HARPER+</strong><small>COLLEGE FOOTBALL MODEL</small></div>
        </button>
        <button className="mobile-menu-toggle" type="button" aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={() => setMobileNavOpen((open) => !open)}>
          <span className="mobile-menu-bars" aria-hidden="true"><i /><i /><i /></span>
          <span><small>NAVIGATE</small><strong>{activeNavLabel}</strong></span>
        </button>
        <nav id="primary-navigation" className={mobileNavOpen ? "open" : ""} aria-label="Main navigation">
          {nav.map((item, index) => <button key={item.id} data-index={String(index + 1).padStart(2, "0")} className={section === item.id ? "active" : ""} onClick={() => navigateTo(item.id)}>{item.label}</button>)}
        </nav>
        <button className={`refresh-button ${refreshState}`} onClick={refresh} disabled={refreshState === "running"}>
          <span>↻</span>{refreshState === "running" ? "CHECKING" : "CHECK DATA"}
        </button>
      </header>

      <div className="refresh-strip"><span className={refreshState}>{refreshMessage}</span><small>Automatic data run: early Monday morning · durable weekly snapshots from 2021 forward</small></div>
      <BackfillBanner />

      {section === "overview" ? (
        <section className="overview">
          <div className="hero-grid">
            <article className="leader-card" style={{ "--team": leader.color ? `#${leader.color.replace(/^#/,"")}` : leaderTeam?.color || "#990000" } as CSSProperties}>
              <div className="field-lines" />
              <div className="hero-copy">
                <span className="hero-eyebrow">{modelSeason} HARPER BCS NO. 1</span>
                <h1>{leader.team}</h1>
                <p>The model’s current national leader pairs an elite offensive index with one of the strongest defensive efficiency profiles in the field.</p>
                <div className="leader-meta">
                  <div><small>RECORD</small><strong>{leader.record}</strong></div>
                  <div><small>BCS AVG</small><strong>{(leader.bcsScore*100).toFixed(1)}</strong></div>
                  <div><small>SOR RK</small><strong>#{leader.sorRank}</strong></div>
                  <div><small>SOS RK</small><strong>#{leader.sosRank}</strong></div>
                </div>
              </div>
              <TeamMark name={leader.team} size="lg" logo={leader.logo} />
              <span className="watermark-one">1</span>
            </article>

            <article className="scorebug-card">
              <div className="scorebug-head"><span>FEATURED NEUTRAL PROJECTION</span><b>WEEK {modelSnapshot.week}</b></div>
              <div className="scorebug-team">
                <TeamMark name="Indiana" size="md" /><div><strong>INDIANA</strong><small>BIG TEN</small></div><b>{featuredProjection?.homeScore.toFixed(0)}</b>
              </div>
              <div className="scorebug-team">
                <TeamMark name="Ohio State" size="md" /><div><strong>OHIO STATE</strong><small>BIG TEN</small></div><b>{featuredProjection?.awayScore.toFixed(0)}</b>
              </div>
              <div className="scorebug-foot"><span>H+ EDGE</span><strong>{featuredProjection && featuredProjection.margin >= 0 ? "INDIANA" : "OHIO STATE"} {featuredProjection ? Math.abs(featuredProjection.margin).toFixed(1) : "—"}</strong><button onClick={() => setSection("matchup")}>OPEN LAB →</button></div>
            </article>
          </div>

          <div className="performance-row">
            <div><span>STRAIGHT UP</span><strong>{seasonPerformance.loading ? "…" : seasonPerformance.data?.straightUp.accuracy === null || seasonPerformance.data?.straightUp.accuracy === undefined ? "—" : `${(seasonPerformance.data.straightUp.accuracy*100).toFixed(1)}%`}</strong><small>{seasonPerformance.data?.straightUp.graded ?? 0} completed forecasts</small></div>
            <div><span>AGAINST SPREAD · WEEK 5+</span><strong>{seasonPerformance.loading ? "…" : seasonPerformance.data?.spread.accuracy === null || seasonPerformance.data?.spread.accuracy === undefined ? "—" : `${(seasonPerformance.data.spread.accuracy*100).toFixed(1)}%`}</strong><small>{seasonPerformance.data?.spread.graded ?? 0} graded picks</small></div>
            <div><span>OVER / UNDER · WEEK 5+</span><strong>{seasonPerformance.loading ? "…" : seasonPerformance.data?.total.accuracy === null || seasonPerformance.data?.total.accuracy === undefined ? "—" : `${(seasonPerformance.data.total.accuracy*100).toFixed(1)}%`}</strong><small>{seasonPerformance.data?.total.graded ?? 0} graded totals</small></div>
            <div><span>WEEKLY PROFILES</span><strong>{seasonPerformance.loading ? "…" : (seasonPerformance.data?.profileCount ?? 0).toLocaleString()}</strong><small>cached team states</small></div>
          </div>

          <div className="overview-lower">
            <article>
              <div className="block-head"><div><span className="section-kicker">NATIONAL PICTURE</span><h2>Harper+ Top 10</h2></div><button onClick={() => setSection("rankings")}>VIEW ALL 25</button></div>
              <RankingsTable rows={seasonRankings.rows} season={modelSeason} week={modelWeek} limit={10} loading={seasonRankings.loading} />
            </article>
            <aside>
              <div className="block-head"><div><span className="section-kicker">MODEL SIGNAL</span><h2>What drives the ranking</h2></div></div>
              <div className="signal-card"><b>50%</b><div><strong>RESULTS + SOR</strong><p>The loss column and head-to-head results anchor the ranking.</p></div></div>
              <div className="signal-card"><b>20%</b><div><strong>SCHEDULE + QUALITY WINS</strong><p>Opponent quality adds context without becoming a conference-size bonus.</p></div></div>
              <div className="signal-card"><b>30%</b><div><strong>TRIMMED COMPUTER SCORE</strong><p>The best and worst of six signals are removed, BCS-style.</p></div></div>
              <div className="source-card"><span>SELF-CONTAINED DATA PIPELINE</span><strong>Automatic Monday refresh</strong><p>Schedules → box scores → market lines → weekly percentages → projections → historical snapshots.</p><button onClick={() => setSection("schedule")}>OPEN SCHEDULE →</button></div>
            </aside>
          </div>
        </section>
      ) : null}

      {section === "rankings" ? <section className="page-section"><div className="section-kicker">SEASON-AWARE BCS-STYLE NATIONAL RANKINGS</div><div className="section-title-row"><div><h1>Harper+ Top 25</h1><p>Results, strength of record, schedule quality and a trimmed six-signal computer composite for the selected season and week.</p></div><VintageControl season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /></div><RankingsTable rows={seasonRankings.rows} season={modelSeason} week={modelWeek} loading={seasonRankings.loading} /></section> : null}
      {section === "simulation" ? <SeasonSimulationPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
      {section === "matchup" ? <MatchupLab season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
      {section === "all137" ? <All137 season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
      {section === "stats" ? <TeamStatsPage season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
      {section === "schedule" ? <SchedulePage season={modelSeason} setSeason={setModelSeason} /> : null}
      {section === "teams" ? <TeamLab season={modelSeason} week={modelWeek} setSeason={setModelSeason} setWeek={setModelWeek} /> : null}
      {section === "methodology" ? <Methodology /> : null}

      <footer><div className="brand compact"><span className="brand-mark" aria-hidden="true"><b>H</b><i>+</i></span><div><strong>HARPER+</strong><small>COLLEGE FOOTBALL MODEL</small></div></div><p>Independent model. Team marks identify their respective institutions. Model logic derived from CFB MOD 25 and applied to timestamped weekly data.</p><span>AUTO · MONDAY AM</span></footer>
    </main>
  );
}
