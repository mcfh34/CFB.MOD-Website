"use client";
import { weekLabel } from "../../../lib/weekLabels";

import type { ReactNode } from "react";
import { scoreboardDay } from "../../../lib/scheduleFilters";
import { TeamAction } from "../TeamAction";
import { TeamAccent, teamIdentityStyle } from "../TeamAccent";

export type ScoreboardRow = {
  gameId:string;
  season:number;
  week:number;
  startDate?:string;
  completed:boolean|number;
  neutralSite:boolean|number;
  homeTeam:string;
  awayTeam:string;
  homeConference?:string;
  awayConference?:string;
  homePoints:number|null;
  awayPoints:number|null;
  predictedHomeScore:number|null;
  predictedAwayScore:number|null;
  homeWinProbability:number|null;
  modelHomeSpread:number|null;
  modelTotal:number|null;
  vegasSpread:number|null;
  vegasTotal:number|null;
  spreadOpen?:number|null;
  overUnderOpen?:number|null;
  formattedSpread?:string;
  homeLogo?:string;
  awayLogo?:string;
  homeColor?:string;
  awayColor?:string;
  homePregameRank?:number|null;
  awayPregameRank?:number|null;
  rankingWeek?:number|null;
  homeRecordAfter?:string|null;
  awayRecordAfter?:string|null;
  homePredictedStats?:CardStats|null;awayPredictedStats?:CardStats|null;
  homeActualStats?:CardStats|null;awayActualStats?:CardStats|null;
};

type CardStats={passYards?:number|null;rushYards?:number|null;turnovers?:number|null};

type Side="home"|"away";

type ScoresBoardProps<Row extends ScoreboardRow>={
  rows:Row[];
  onOpen:(row:Row)=>void;
  projectedFinalRanks:Map<string,number>;
  rankingWeek:number;
  teamCode:(team:string)=>string;
  renderTeamMark:(team:string,logo:string|undefined,conference:string|undefined)=>ReactNode;
  renderWinConditions:(row:Row)=>ReactNode;
};

function displayScore(row:ScoreboardRow,side:Side){
  const actual=side==="home"?row.homePoints:row.awayPoints;
  const predicted=side==="home"?row.predictedHomeScore:row.predictedAwayScore;
  return Boolean(row.completed)&&actual!==null?actual:predicted===null?null:Math.round(predicted);
}

function resultClass(row:ScoreboardRow,side:Side){
  const home=displayScore(row,"home"),away=displayScore(row,"away");
  if(home===null||away===null||home===away)return"";
  return side==="home"?(home>away?"winner":"loser"):(away>home?"winner":"loser");
}

function finite(value:number|null|undefined):value is number{
  return typeof value==="number"&&Number.isFinite(value);
}

function compactNumber(value:number){
  return value.toFixed(Number.isInteger(value)?0:1);
}

function vegasHomeSpread(row:ScoreboardRow){
  return finite(row.vegasSpread)?row.vegasSpread:null;
}

function favoriteFromHomeSpread(spread:number|null,fallback:Side):Side{
  if(spread===null||Math.abs(spread)<.05)return fallback;
  return spread<0?"home":"away";
}

function gameTime(value?:string){
  if(!value)return"TIME TBD";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"TIME TBD":new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Chicago"}).format(date);
}

function compactGameDate(value?:string){
  if(!value)return"TBD";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"America/Chicago"}).format(date).toUpperCase();
}

export function scoreboardTimeWindow(value?:string){
  if(!value)return"NIGHT / TBD";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return"NIGHT / TBD";
  const hour=Number(new Intl.DateTimeFormat("en-US",{hour:"2-digit",hourCycle:"h23",timeZone:"America/Chicago"}).format(date));
  if(hour<14)return"EARLY";
  if(hour<18)return"AFTERNOON";
  return"NIGHT / TBD";
}

function fullScoreDay(value?:string){
  if(!value||Number.isNaN(new Date(value).getTime()))return"DATE TBD";
  return new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",timeZone:"America/Chicago"}).format(new Date(value));
}

function ScoresGameCard<Row extends ScoreboardRow>({row,onOpen,projectedFinalRanks,rankingWeek,teamCode,renderTeamMark,renderWinConditions}:Omit<ScoresBoardProps<Row>,"rows">&{row:Row}){
  const completed=Boolean(row.completed);
  const projectedWinner:Side=(row.homeWinProbability??.5)>=.5?"home":"away";
  const modelFavorite=favoriteFromHomeSpread(finite(row.modelHomeSpread)?row.modelHomeSpread:null,projectedWinner);
  const closingSpread=vegasHomeSpread(row);
  const closeFavorite=favoriteFromHomeSpread(closingSpread,modelFavorite);
  const closingTotal=finite(row.vegasTotal)?row.vegasTotal:null;
  const lineValue=(kind:"close"|"model",side:Side)=>{
    const favorite=kind==="close"?closeFavorite:modelFavorite;
    const spread=kind==="close"?closingSpread:(finite(row.modelHomeSpread)?row.modelHomeSpread:null);
    const total=kind==="close"?closingTotal:(finite(row.modelTotal)?row.modelTotal:null);
    if(side===favorite)return{label:"LINE",value:spread===null?"—":Math.abs(spread)<.05?"PK":`-${compactNumber(Math.abs(spread))}`,spread:true};
    return{label:"O/U",value:total===null?"—":compactNumber(total),spread:false};
  };
  const evidenceWeek=row.rankingWeek??rankingWeek;
  const rankingEvidence=evidenceWeek?`results through ${weekLabel(evidenceWeek)}`:"the preseason snapshot";
  const projectedRank=(team:string,side:Side)=>{
    const gameTimeRank=side==="home"?row.homePregameRank:row.awayPregameRank;
    const rank=gameTimeRank??projectedFinalRanks.get(team);
    return rank&&Number.isInteger(rank)&&rank>0?<em className="score-card-logo-rank" aria-label={`Harper Plus projected final season rank ${rank}, based on ${rankingEvidence}`}>#{rank}</em>:null;
  };
  const teamRow=(side:Side)=>{
    const home=side==="home";
    const team=home?row.homeTeam:row.awayTeam;
    const conference=home?row.homeConference:row.awayConference;
    const logo=home?row.homeLogo:row.awayLogo;
    const color=home?row.homeColor:row.awayColor;
    const record=home?row.homeRecordAfter:row.awayRecordAfter;
    const close=lineValue("close",side);
    const model=lineValue("model",side);
    return <span className={`score-card-team team-identity-surface ${side}-side ${resultClass(row,side)}`} style={teamIdentityStyle(team,color)}>
      <span className="score-card-logo">{renderTeamMark(team,logo,conference)}{projectedRank(team,side)}</span>
      <span className="score-card-team-copy"><span className="mobile-game-team-title"><strong title={team}><TeamAccent name={team} color={color}>{teamCode(team)}</TeamAccent></strong></span><small>{record??"0-0"} · {home?(row.neutralSite?"N":"H"):"A"}</small></span>
      <span className="score-card-value score-card-score"><b>{displayScore(row,side)??"—"}</b></span>
      <span className={`score-card-value score-card-close ${close.spread?"spread":"total"}`}><b>{close.value}</b><small>{close.label}</small></span>
      <span className={`score-card-value score-card-model ${model.spread?"spread":"total"}`}><b>{model.value}</b><small>{model.label}</small></span>
    </span>;
  };
  const statValue=(value:number|null|undefined,projected:boolean)=>finite(value)?projected&&value<10?value.toFixed(1):String(Math.round(value)):"—";
  const statRows:Side[]=["away","home"];
  const hasStats=statRows.some(side=>Boolean(side==="home"?row.homePredictedStats||row.homeActualStats:row.awayPredictedStats||row.awayActualStats));
  const statCell=(side:Side,metric:keyof CardStats)=>{
    const projected=(side==="home"?row.homePredictedStats:row.awayPredictedStats)?.[metric];
    const actual=(side==="home"?row.homeActualStats:row.awayActualStats)?.[metric];
    return <span className="score-card-stat-cell">
      {completed?<span className="score-card-stat-actual"><small>ACT</small><b>{statValue(actual,false)}</b></span>:null}
      <span className="score-card-stat-projected"><small>H+</small><b>{statValue(projected,true)}</b></span>
    </span>;
  };
  return <article className="mobile-game-card-shell">
    <TeamAction type="button" className="mobile-game-card schedule-field-card" onClick={()=>onOpen(row)} aria-label={`Open ${row.awayTeam} at ${row.homeTeam}`}>
      <span className="score-card-head"><span><i aria-hidden="true"/><strong>{compactGameDate(row.startDate)}</strong></span><small>{completed?"FINAL":row.neutralSite?"NEUTRAL":"UPCOMING"}</small></span>
      <span className="score-card-ledger-head"><strong>{gameTime(row.startDate)}</strong><small>SCORE</small><small title="Latest imported sportsbook line; opening lines are separate">MARKET</small><small>MODEL</small></span>
      <span className="score-card-teams">{teamRow("away")}{teamRow("home")}</span>
      {hasStats?<span className="score-card-stat-ledger" aria-label={completed?"Actual and pregame projected statistics":"Projected statistics"}>
        <span className="score-card-stat-labels"><b>TEAM</b><b>PASS YDS</b><b>RUSH YDS</b><b>TO</b></span>
        {statRows.map(side=><span className="score-card-stat-line" key={side}><strong><TeamAccent name={side==="home"?row.homeTeam:row.awayTeam} color={side==="home"?row.homeColor:row.awayColor}>{teamCode(side==="home"?row.homeTeam:row.awayTeam)}</TeamAccent></strong>{statCell(side,"passYards")}{statCell(side,"rushYards")}{statCell(side,"turnovers")}</span>)}
      </span>:null}
    </TeamAction>
    {renderWinConditions(row)}
  </article>;
}

export function ScoresBoard<Row extends ScoreboardRow>(props:ScoresBoardProps<Row>){
  const days=[...new Set(props.rows.map((row)=>scoreboardDay(row.startDate)))].sort();
  return <div className="mobile-scoreboard" data-testid="scores-board">
    {days.map((day)=>{
      const dayRows=props.rows.filter((row)=>scoreboardDay(row.startDate)===day);
      const groups=["EARLY","AFTERNOON","NIGHT / TBD"].map((label)=>({label,rows:dayRows.filter((row)=>scoreboardTimeWindow(row.startDate)===label).sort((a,b)=>String(a.startDate??"9999").localeCompare(String(b.startDate??"9999"))||a.gameId.localeCompare(b.gameId))})).filter((group)=>group.rows.length);
      return <section className="score-calendar-day" key={day}><h2>{fullScoreDay(dayRows[0]?.startDate)}</h2><div className="score-window-board">
        {groups.map((group)=><section className="mobile-score-day score-window-column" key={group.label}><h2><span>{group.label}</span></h2><div className="schedule-column-grid">{group.rows.map((row)=><ScoresGameCard key={row.gameId} {...props} row={row}/>)}</div></section>)}
      </div></section>;
    })}
  </div>;
}
