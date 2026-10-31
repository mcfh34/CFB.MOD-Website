"use client";
import {SelectionContext} from "./SelectionContext";
import {CopyImageButton} from "./CopyImageButton";
import {TeamAccent,teamIdentityStyle} from "./TeamAccent";
/* eslint-disable @next/next/no-img-element -- weekly stories use the same dynamic team marks as Scores */

import { useContext,useEffect, useMemo, useState, type CSSProperties } from "react";
import { resolveTeamLogoAsset } from "../../lib/teamLogoAssets";
import { modelDataFetch } from "../../lib/formulaRevision";
import { WeeklyPreview } from "./WeeklyPreview";
import { NetSuccessRateChart } from "./NetSuccessRateChart";
import type { PlayerWeeklyMetricMap } from "../../lib/playerWeekly";
import {weeklyPlayerRole,weeklySpiderAxes,type WeeklyPlayerRole,type WeeklySpiderAxis,type WeeklySpiderCandidate} from "../../lib/weeklyPlayerSpider";
import {
  buildWeeklyGameRead,
  orderWeeklyStories,
  weeklyGameAnalysis,
  weeklyStoryHeadline,
  weeklyStoryLabel,
  type WeeklyGameRead,
  type WeeklyProjectedRank,
  type WeeklyReviewGame,
} from "../../lib/weeklyReview";
import type { WeeklyApRank } from "../../lib/weeklyApPoll";
import { weekLabel } from "../../lib/weekLabels";
import { scoreRankingSnapshotWeek } from "../../lib/weeklyRankingSnapshot";
import { useCurrentWeek } from "./CurrentWeekContext";

type PlayerLine = {gameId:string;playerId:string;playerName:string;position?:string|null;metrics:PlayerWeeklyMetricMap};
type PlayerTeam = {team:string;color?:string|null;altColor?:string|null;game:PlayerLine[]};
type PlayerPayload = {status:string;teams?:PlayerTeam[]};
type PlayerStory = {id:string;name:string;team:string;position:string;logo?:string;color:string;summary:string;impact:number;role:WeeklyPlayerRole;metrics:PlayerWeeklyMetricMap;axes:WeeklySpiderAxis[]};
type ProjectionTeam={team:string;color:string|null;games:number;players:{id:string;name:string;position:string;metrics:PlayerWeeklyMetricMap}[]};

const metric=(line:PlayerLine,key:keyof PlayerWeeklyMetricMap)=>{
  const value=line.metrics[key];
  return typeof value==="number"&&Number.isFinite(value)?value:0;
};

function playerImpact(line:PlayerLine){
  return .65*metric(line,"passYards")+metric(line,"rushYards")+metric(line,"receivingYards")
    +40*metric(line,"passTd")+60*(metric(line,"rushTd")+metric(line,"receivingTd"))-50*metric(line,"passInterceptions")
    +6*metric(line,"tackles")+24*metric(line,"tfl")+50*metric(line,"sacks")+70*metric(line,"defensiveInterceptions");
}

function playerSummary(line:PlayerLine){
  if(metric(line,"passAttempts")>0)return`${Math.round(metric(line,"passYards"))} pass yds · ${Math.round(metric(line,"passTd"))} TD · ${Math.round(metric(line,"passInterceptions"))} INT`;
  if(metric(line,"rushAttempts")>0)return`${Math.round(metric(line,"rushYards"))} rush yds · ${Math.round(metric(line,"rushTd"))} TD`;
  if(metric(line,"receptions")>0)return`${Math.round(metric(line,"receptions"))} rec · ${Math.round(metric(line,"receivingYards"))} yds · ${Math.round(metric(line,"receivingTd"))} TD`;
  if(metric(line,"tackles")+metric(line,"sacks")+metric(line,"defensiveInterceptions")>0)return`${Math.round(metric(line,"tackles"))} tackles · ${metric(line,"sacks").toFixed(1)} sacks · ${Math.round(metric(line,"defensiveInterceptions"))} INT`;
  return"Impact performance";
}

function dateLine(reads:WeeklyGameRead[]){
  const dates=reads.map((read)=>read.game.startDate?new Date(read.game.startDate):null).filter((date):date is Date=>Boolean(date&&!Number.isNaN(date.getTime()))).sort((a,b)=>a.getTime()-b.getTime());
  if(!dates.length)return"WEEKLY EDITION";
  const format=(date:Date)=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"America/Chicago"}).format(date).toUpperCase();
  const first=format(dates[0]),last=format(dates[dates.length-1]);
  return first===last?first:`${first} — ${last}`;
}

function TeamCrest({team,logo}:{team:string;logo?:string}){
  const source=resolveTeamLogoAsset(team)??logo;
  return <span className="weekly-team-crest team-identity-surface" style={teamIdentityStyle(team)} aria-hidden="true">{source?<img src={source} alt=""/>:<b>{team.slice(0,2).toUpperCase()}</b>}</span>;
}

function MiniPlayerSpider({player}:{player:PlayerStory}){
  const axes=player.axes;
  if(axes.length<3)return <span className="weekly-mini-spider-empty">Game chart unavailable</span>;
  const center=63,radius=35,angle=(index:number)=>index*2*Math.PI/axes.length;
  const point=(index:number,length:number)=>`${(center+Math.sin(angle(index))*length).toFixed(1)},${(center-Math.cos(angle(index))*length).toFixed(1)}`;
  const polygon=(lengths:number[])=>lengths.map((length,index)=>point(index,length)).join(" ");
  return <figure className="weekly-mini-spider" style={{"--team-color":player.color} as CSSProperties}><svg viewBox="0 0 126 126" role="img" aria-label={`${player.name} game percentiles versus ${player.role.toLowerCase()} performances in this week: ${axes.map(axis=>`${axis.name} ${axis.percentile}th percentile`).join(", ")}`}>
    {[25,50,75,100].map(tick=><polygon key={tick} points={polygon(axes.map(()=>radius*tick/100))} className="weekly-mini-ring"/>)}
    {axes.map((axis,index)=><g key={axis.name}><line x1={center} y1={center} x2={center+Math.sin(angle(index))*radius} y2={center-Math.cos(angle(index))*radius} className="weekly-mini-spoke"/><text x={center+Math.sin(angle(index))*53} y={center-Math.cos(angle(index))*53+3} textAnchor="middle" className="weekly-mini-axis">{axis.label}</text></g>)}
    <polygon points={polygon(axes.map(axis=>radius*axis.percentile/100))} className="weekly-mini-area"/>
    {axes.map((axis,index)=><circle key={axis.name} cx={center+Math.sin(angle(index))*radius*axis.percentile/100} cy={center-Math.cos(angle(index))*radius*axis.percentile/100} r="2.5" className="weekly-mini-point"><title>{axis.name}: {Number.isInteger(axis.value)?axis.value:axis.value.toFixed(2)} · {axis.percentile}th percentile among weekly {player.role.toLowerCase()} peers</title></circle>)}
  </svg><figcaption>GAME PERCENTILES</figcaption><CopyImageButton scope=".weekly-mini-spider" title={`${player.name} · ${player.team} · ${player.role} game percentiles`}/></figure>;
}

function projectedRankLine(rank:number|null,record?:string){
  return `H+ ${rank?`#${rank}`:"NR"}${record?` · ${record}`:""}`;
}

function scorePanelStyle(read:WeeklyGameRead,side:"winner"|"loser"):CSSProperties{
  const color=(side==="winner"?read.winner:read.loser)==="home"?read.game.homeColor:read.game.awayColor;
  return {"--team-color":color&&/^#[0-9a-f]{6}$/i.test(color)?color:"#344759"} as CSSProperties;
}

function WeeklyScorePanel({read,side}:{read:WeeklyGameRead;side:"winner"|"loser"}){
  return <span className="weekly-result-team" style={scorePanelStyle(read,side)}>
    <TeamCrest team={read[`${side}Team`]} logo={read[`${side}Logo`]}/>
    <span className="weekly-team-copy"><strong>{read[`${side}Team`]}</strong><small>{read[`${side}ApRank`]!==null?`AP #${read[`${side}ApRank`]} · `:""}{projectedRankLine(read[`${side}Rank`],read[`${side}ProjectedRecord`])}</small></span>
    <b className="weekly-team-score">{read[`${side}Score`]}</b>
  </span>;
}

function ProjectedPlayers({season,week,games}:{season:number;week:number;games:WeeklyReviewGame[]}){
  const [result,setResult]=useState<{key:string;teams:ProjectionTeam[]}>({key:"",teams:[]});
  const key=`${season}:${week}`;
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/weekly-player-projections?season=${season}&week=${week}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error("Player projection unavailable");
      return (await response.json()) as {teams:ProjectionTeam[]};
    }).then(payload=>{if(!controller.signal.aborted)setResult({key,teams:payload.teams??[]});}).catch(()=>{if(!controller.signal.aborted)setResult({key,teams:[]});});
    return()=>controller.abort();
  },[season,week,key]);
  const candidates=result.key!==key?[]:result.teams.flatMap(team=>{
    if(team.games<1)return[];
    const game=games.find(row=>row.homeTeam===team.team||row.awayTeam===team.team);
    const predicted=game?.homeTeam===team.team?game.homePredictedStats:game?.awayPredictedStats;
    if(!predicted||predicted.passYards===null||predicted.rushYards===null)return[];
    const perGame=(value:number)=>value/team.games;
    const total=(key:keyof PlayerWeeklyMetricMap)=>team.players.reduce((sum,player)=>sum+Math.max(0,player.metrics[key]??0),0);
    const ratio=(estimate:number|null|undefined,actual:number)=>actual>0&&typeof estimate==="number"?Math.max(.6,Math.min(1.5,estimate/perGame(actual))):1;
    const passScale=ratio(predicted.passYards,total("passYards")),rushScale=ratio(predicted.rushYards,total("rushYards"));
    const passVolume=ratio(predicted.passAttempts,total("passAttempts")),rushVolume=ratio(predicted.rushAttempts,total("rushAttempts"));
    return team.players.flatMap(player=>{
      const base=player.metrics,position=player.position;
      if(!["QB","RB","WR","TE"].includes(position))return[];
      const metrics:PlayerWeeklyMetricMap={
        passAttempts:perGame((base.passAttempts??0)*passVolume),passCompletions:perGame((base.passCompletions??0)*passVolume),passYards:perGame((base.passYards??0)*passScale),passTd:perGame((base.passTd??0)*passScale),passInterceptions:perGame((base.passInterceptions??0)*passVolume),
        rushAttempts:perGame((base.rushAttempts??0)*rushVolume),rushYards:perGame((base.rushYards??0)*rushScale),rushTd:perGame((base.rushTd??0)*rushScale),
        receptions:perGame((base.receptions??0)*passVolume),receivingYards:perGame((base.receivingYards??0)*passScale),receivingTd:perGame((base.receivingTd??0)*passScale),
        allPurposeYards:perGame((base.rushYards??0)*rushScale+(base.receivingYards??0)*passScale),
      };
      const role:WeeklyPlayerRole=position==="QB"?"QB":position==="RB"?"Rusher":"Receiver";
      const impact=playerImpact({gameId:game?.gameId??"",playerId:player.id,playerName:player.name,metrics});
      if(impact<12)return[];
      return [{id:`${team.team}:${player.id}`,name:player.name,team:team.team,position,logo:resolveTeamLogoAsset(team.team)??undefined,color:team.color&&/^#[0-9a-f]{6}$/i.test(team.color)?team.color:"#4b8d7b",summary:`~${playerSummary({gameId:game?.gameId??"",playerId:player.id,playerName:player.name,metrics})}`,impact,role,metrics,axes:[]} satisfies PlayerStory];
    });
  });
  const cohort:WeeklySpiderCandidate[]=candidates.map(({metrics,role})=>({metrics,role}));
  const top=candidates.sort((a,b)=>b.impact-a.impact).slice(0,5).map(player=>({...player,axes:weeklySpiderAxes(player,cohort)}));
  return <section className="weekly-projected-players weekly-performers" aria-label="Projected top weekly players">
    <header><span>MODEL PROJECTION · SEASON TO DATE</span><h2>Projected players of the week</h2></header>
    {top.length?top.map((player,index)=><div key={player.id}><i>{index+1}</i><TeamCrest team={player.team} logo={player.logo}/><span><strong>{player.name}</strong><small>{player.position} · <TeamAccent name={player.team} color={player.color}/></small></span><MiniPlayerSpider player={player}/><b>{player.summary}</b></div>):<p>Player estimates will appear when season production and projected team box scores are available.</p>}
    {top.length?<p>Estimated game lines scale each player’s season pace to the model’s projected team passing and rushing workload. Spider percentiles compare these estimates with projected players in this week.</p>:null}
  </section>;
}

export function WeeklyReview({initialSeason,initialWeek,seasons,onOpenScores,onOpenGame}:{initialSeason:number;initialWeek:number;seasons:number[];onOpenScores:()=>void;onOpenGame:(game:WeeklyReviewGame)=>void}){
  const current=useCurrentWeek();
  const shared=useContext(SelectionContext);
  const [localSeason,setLocalSeason]=useState(initialSeason);
  const [localWeek,setLocalWeek]=useState(Math.max(0,Math.min(16,initialWeek)));
  const season=shared?.season??localSeason,setSeason=shared?.setSeason??setLocalSeason;
  const week=shared?.week??localWeek,setWeek=shared?.setWeek??setLocalWeek;
  const requestKey=`${season}:${week}`;
  const [edition,setEdition]=useState<{key:string;games:WeeklyReviewGame[];rankings:WeeklyProjectedRank[];previousRankings:WeeklyProjectedRank[];forecastRankings:WeeklyProjectedRank[];error:string}>({key:"",games:[],rankings:[],previousRankings:[],forecastRankings:[],error:""});
  const [apPoll,setApPoll]=useState<{key:string;rows:WeeklyApRank[]}>({key:"",rows:[]});
  const apRanks=useMemo(()=>new Map((apPoll.key===requestKey?apPoll.rows:[]).map(row=>[row.team,row.rank])),[apPoll,requestKey]);
  const reads=useMemo(()=>{
    if(edition.key!==requestKey)return[];
    const rankMap=new Map(edition.rankings.map((ranking)=>[ranking.team,ranking]));
    const previousRankMap=new Map(edition.previousRankings.map((ranking)=>[ranking.team,ranking]));
    return orderWeeklyStories(edition.games.map((game)=>buildWeeklyGameRead(game,rankMap,previousRankMap,apRanks)).filter((read):read is WeeklyGameRead=>Boolean(read)));
  },[edition,requestKey,apRanks]);
  const featuredKey=requestKey;
  const hasFinals=reads.length>0;
  const upcoming=edition.key===requestKey?edition.games.filter(game=>!game.completed&&game.seasonType!=="postseason"):[];
  const [players,setPlayers]=useState<{key:string;rows:PlayerStory[]}>({key:"",rows:[]});

  useEffect(()=>{
    const controller=new AbortController();
    modelDataFetch(`/api/data?view=weekly-ap-poll&season=${season}&week=${week}`,{signal:controller.signal})
      .then(async response=>response.ok?(await response.json() as {rows?:WeeklyApRank[]}):{rows:[]})
      .then(payload=>{if(!controller.signal.aborted)setApPoll({key:requestKey,rows:payload.rows??[]});})
      .catch(()=>{if(!controller.signal.aborted)setApPoll({key:requestKey,rows:[]});});
    const scheduleParams=new URLSearchParams({view:"schedule",season:String(season),week:String(week),compactSchedule:"1",includeActualAdvanced:"1"});
    const rankingParams=new URLSearchParams({view:"rankings",season:String(season),week:String(week)});
    const previousRankingParams=new URLSearchParams({view:"rankings",season:String(season),week:String(Math.max(0,week-1))});
    const forecastParams=new URLSearchParams({view:"projected-ranks",season:String(season),week:String(scoreRankingSnapshotWeek(week)),scope:"all",engine:"shared-season-forecast-v5"});
    const schedulePromise=modelDataFetch(`/api/data?${scheduleParams}`,{signal:controller.signal}).then(async(response)=>{
      const payload=await response.json() as {rows?:WeeklyReviewGame[];message?:string};
      if(!response.ok)throw new Error(payload.message||"The weekly scores are temporarily unavailable.");
      return payload.rows??[];
    }).then(async(games)=>{
      if(games.some(game=>!game.completed)){
        try{
          const fullParams=new URLSearchParams({view:"schedule",season:String(season),week:String(week),includeAnalysis:"1"});
          const response=await modelDataFetch(`/api/data?${fullParams}`,{signal:controller.signal});
          if(response.ok){
            const payload=await response.json() as {rows?:WeeklyReviewGame[]};
            const full=new Map((payload.rows??[]).map(game=>[game.gameId,game]));
            games=games.map(game=>{
              const enriched=full.get(game.gameId);
              return enriched?{...game,generatedFromWeek:enriched.generatedFromWeek??game.generatedFromWeek,homePredictedAdvanced:enriched.homePredictedAdvanced??game.homePredictedAdvanced,awayPredictedAdvanced:enriched.awayPredictedAdvanced??game.awayPredictedAdvanced,homePredictedStats:enriched.homePredictedStats??game.homePredictedStats,awayPredictedStats:enriched.awayPredictedStats??game.awayPredictedStats,edgeAnalysis:enriched.edgeAnalysis,matchupTests:enriched.matchupTests}:game;
            });
          }
        }catch{/* Keep compact projections if the full model is temporarily unavailable. */}
      }
      return games;
    });

    const readRankings=async(params:URLSearchParams)=>{
      const response=await modelDataFetch(`/api/data?${params}`,{signal:controller.signal});
      if(!response.ok)return[] as WeeklyProjectedRank[];
      const payload=await response.json() as {rows?:Array<{team:string;rank:number;record?:string}>};
      return(payload.rows??[]).map((row)=>({team:row.team,rank:row.rank,projectedRecord:row.record}));
    };
    const forecastPromise=modelDataFetch(`/api/data?${forecastParams}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return[] as WeeklyProjectedRank[];
      const payload=await response.json() as {rankings?:Array<{team:string;rank:number;projectedRecord?:string}>};
      return(payload.rankings??[]).filter(row=>row.team&&Number.isInteger(row.rank)&&row.rank>0)
        .map(row=>({team:row.team,rank:row.rank,projectedRecord:row.projectedRecord}));
    }).catch(()=>[] as WeeklyProjectedRank[]);
    Promise.all([schedulePromise,readRankings(rankingParams).catch(()=>[] as WeeklyProjectedRank[]),week>0?readRankings(previousRankingParams).catch(()=>[] as WeeklyProjectedRank[]):Promise.resolve([] as WeeklyProjectedRank[]),forecastPromise])
      .then(([games,rankings,previousRankings,forecastRankings])=>{if(!controller.signal.aborted)setEdition({key:requestKey,games,rankings,previousRankings,forecastRankings,error:""});})
      .catch((error)=>{if(error instanceof Error&&error.name!=="AbortError")setEdition({key:requestKey,games:[],rankings:[],previousRankings:[],forecastRankings:[],error:error.message});});
    return()=>controller.abort();
  },[requestKey,season,week]);

  useEffect(()=>{
    if(!featuredKey||!hasFinals)return;
    const controller=new AbortController();
    const params=new URLSearchParams({season:String(season),week:String(week)});
    fetch(`/api/weekly-performers?${params}`,{signal:controller.signal}).then(async(response)=>{
      if(!response.ok)return[] as PlayerStory[];
      const payload=await response.json() as PlayerPayload;
      const all=(payload.teams??[]).flatMap((team)=>(team.game??[]).map((line)=>({
        id:`${line.gameId}:${team.team}:${line.playerId||line.playerName}`,name:line.playerName,team:team.team,
        logo:resolveTeamLogoAsset(team.team)??undefined,summary:playerSummary(line),impact:playerImpact(line),metrics:line.metrics,role:weeklyPlayerRole(line.metrics),
        position:line.position?.trim().toUpperCase()||weeklyPlayerRole(line.metrics),
        color:[team.color,team.altColor].find(value=>typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value))??"#4b8d7b",
      })));
      const cohort:WeeklySpiderCandidate[]=all.map(({metrics,role})=>({metrics,role}));
      return all.sort((a,b)=>b.impact-a.impact).slice(0,5).map(player=>({...player,axes:weeklySpiderAxes(player,cohort)}));
    }).then((results)=>{
      if(controller.signal.aborted)return;
      setPlayers({key:`${season}:${featuredKey}`,rows:results});
    }).catch(()=>{if(!controller.signal.aborted)setPlayers({key:`${season}:${featuredKey}`,rows:[]});});
    return()=>controller.abort();
  },[featuredKey,season,week,hasFinals]);

  const loading=edition.key!==requestKey;
  const lead=reads[0];
  const secondary=reads.slice(5,9);
  const extraStories=reads.slice(1,5);
  const playerRows=players.key===`${season}:${featuredKey}`?players.rows:[];
  const upsetCount=reads.filter((read)=>read.modelUpset||read.projectedUpset).length;

  return <section className="overview weekly-newspaper">
    <div className="weekly-paper">
      <header className="weekly-masthead">
        <div className="weekly-edition-line"><span>EST. 2014 · INDEPENDENT COLLEGE FOOTBALL REVIEW</span><div className="weekly-edition-controls">
          {!shared?<>
          <label><span>YEAR</span><select aria-label="Weekly review year" value={season} onChange={(event)=>setSeason(Number(event.target.value))}>{seasons.map((value)=><option key={value}>{value}</option>)}</select></label>
          <label><span>WEEK</span><select aria-label="Weekly review week" value={week} onChange={(event)=>setWeek(Number(event.target.value))}>{Array.from({length:17},(_,value)=><option key={value} value={value}>{value===14||value===15?weekLabel(value,"compact"):value}{current?.season===season&&current.week===value?" · NOW":""}</option>)}</select></label>
          </>:null}
        </div></div>
        <div className="weekly-nameplate"><img src="/harper-football.svg" alt=""/><h1>The Harper+ Weekly</h1></div>
        <div className="weekly-dateline"><span>{season} SEASON · {weekLabel(week,"upper")} {hasFinals?upcoming.length?"REVIEW & PREVIEW":"REVIEW":"PREVIEW"}</span><strong>{dateLine(reads)}</strong><span>{apRanks.size?"WEEKLY AP POLL ORDER":"H+ RESULTS ORDER"}</span></div>
      </header>

      <div className="weekly-net-graph"><NetSuccessRateChart key={`${season}:${week}:${!hasFinals&&upcoming.length?"projected":"actual"}`} initialSeason={season} initialWeek={week} latestSeason={Math.max(...seasons)} embedded projectedGames={!hasFinals&&upcoming.length?upcoming:undefined}/></div>

      {loading?<div className="weekly-loading"><strong>Loading {weekLabel(week)}…</strong><span>Scores and performances are being assembled.</span></div>:edition.error?<div className="weekly-loading error"><strong>Weekly edition unavailable</strong><span>{edition.error}</span></div>:!lead?upcoming.length?<><WeeklyPreview games={upcoming} rankings={edition.forecastRankings} apRankings={apPoll.key===requestKey?apPoll.rows:[]} onOpenGame={onOpenGame}/><ProjectedPlayers season={season} week={week} games={upcoming}/></>:<div className="weekly-loading"><strong>No games are scheduled for {weekLabel(week)}.</strong></div>:<>
        <section className="weekly-front-page">
          <article className="weekly-lead-story">
            <span className="weekly-section-label">{weeklyStoryLabel(lead)}</span>
            <h2>{weeklyStoryHeadline(lead)}</h2>
            <p className="weekly-deck"><TeamAccent name={lead.winnerTeam}/> {lead.winnerScore}, <TeamAccent name={lead.loserTeam}/> {lead.loserScore}</p>
            <div className="weekly-lead-score">
              <WeeklyScorePanel read={lead} side="winner"/>
              <i>FINAL</i>
              <WeeklyScorePanel read={lead} side="loser"/>
            </div>
            <p className="weekly-byline">H+ ANALYSIS DESK</p>
            <p className="weekly-analysis">{weeklyGameAnalysis(lead)}</p>
            <button className="weekly-game-link" onClick={()=>onOpenGame(lead.game)}>View game in Scores →</button>
            <section className="weekly-extra-stories weekly-scoreboard" aria-label="More games of the week">
              {extraStories.map((read)=><article key={read.game.gameId}>
                <span>{weeklyStoryLabel(read)}</span>
                <h3>{weeklyStoryHeadline(read)}</h3>
                <div className="weekly-result-pair"><WeeklyScorePanel read={read} side="winner"/><WeeklyScorePanel read={read} side="loser"/></div>
                <p>{weeklyGameAnalysis(read)}</p>
                <button className="weekly-game-link" onClick={()=>onOpenGame(read.game)}>View game in Scores →</button>
              </article>)}
            </section>
          </article>

          <aside className="weekly-scoreboard" aria-label="Other top games">
            <header><span>NATIONAL SCOREBOARD</span><strong>Games that shaped the week</strong></header>
            {secondary.map((read)=><article key={read.game.gameId}>
              <span>{weeklyStoryLabel(read)}</span>
              <h3>{weeklyStoryHeadline(read)}</h3>
              <div className="weekly-result-pair"><WeeklyScorePanel read={read} side="winner"/><WeeklyScorePanel read={read} side="loser"/></div>
              <p>{weeklyGameAnalysis(read)}</p>
              <button className="weekly-game-link" onClick={()=>onOpenGame(read.game)}>View game in Scores →</button>
            </article>)}
          </aside>
        </section>

        <section className="weekly-notebook">
          <article className="weekly-performers">
            <header><span>PLAYERS OF THE WEEK</span><h2>Saturday&apos;s standouts</h2></header>
            {playerRows.length?playerRows.map((player,index)=><div key={player.id}><i>{index+1}</i><TeamCrest team={player.team} logo={player.logo}/><span><strong>{player.name}</strong><small>{player.position} · <TeamAccent name={player.team} color={player.color}/></small></span><MiniPlayerSpider player={player}/><b>{player.summary}</b></div>):<p>Verified individual box scores are still being assembled. Team-level factors above remain based on the completed game data.</p>}
          </article>
          <article className="weekly-at-glance">
            <header><span>THE WEEK IN NUMBERS</span><h2>What changed</h2></header>
            <div><strong>{reads.length}</strong><span>completed games</span></div>
            <div><strong>{upsetCount}</strong><span>rank or model upsets</span></div>
            <div><strong>{reads.filter((read)=>read.margin<=7).length}</strong><span>one-score finishes</span></div>
            <button type="button" onClick={onOpenScores}>OPEN THE FULL {weekLabel(week,"upper")} SCOREBOARD <span aria-hidden="true">›</span></button>
          </article>
        </section>
        {upcoming.length>0?<><div className="weekly-net-graph"><NetSuccessRateChart key={`${season}:${week}:projected`} initialSeason={season} initialWeek={week} latestSeason={Math.max(...seasons)} embedded projectedGames={upcoming}/></div><WeeklyPreview games={upcoming} rankings={edition.forecastRankings} apRankings={apPoll.key===requestKey?apPoll.rows:[]} onOpenGame={onOpenGame}/><ProjectedPlayers season={season} week={week} games={upcoming}/></>:null}
      </>}
    </div>
  </section>;
}
