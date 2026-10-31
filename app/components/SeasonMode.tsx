"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { FolderOpen, Gauge, Moon, Play, Sun } from "lucide-react";
import type { GameDifficulty, GameState, GameTheme, OpponentType, Player, TeamInput, TeamRoster } from "@/lib/game/types";
import { GridironWire, type DownByDownSession } from "./DownByDownGame";
import { modelDataFetch } from "@/lib/formulaRevision";
import { TeamLink } from "./TeamLink";
import { TeamAccent, teamIdentityStyle } from "./TeamAccent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  advanceSeason,
  applyUserGameResult,
  continueDynastySeason,
  buildRoster,
  canAdvance,
  createSeasonSave,
  currentUserGame,
  modelRating,
  phaseLabel,
  projectedPlayoffSeeds,
  rankingFor,
  recalculateSeason,
  recordLabel,
  simulateUserGame,
  starterFromRating,
  topPlayerLeaders,
} from "@/lib/season/simulation";
import { deleteSeason, listSeasons, saveSeason } from "@/lib/season/storage";
import { buildSeasonPdf } from "@/lib/season/pdf";
import { resolveTeamLogoAsset } from "@/lib/teamLogoAssets";
import type {
  ModelProfileRow,
  ModelScheduleRow,
  PlayerRatingRow,
  SeasonGame,
  SeasonSave,
  SeasonTeam,
} from "@/lib/season/types";

type HubView = "menu" | "load" | "new" | "season" | "lineup" | "game" | "quick" | "quick-lineup" | "quick-game";
type LineupUnit = "offense" | "defense" | "specialTeams";
type LineupSlot = { label: string; position: Player["position"]; accepted: string[] };
type ExhibitionConfig = {
  homeSeason: number;
  awaySeason: number;
  homeTeam: string;
  awayTeam: string;
  opponentType: OpponentType;
  difficulty: GameDifficulty;
  quarterLengthMinutes: number;
  homeRating: number;
  awayRating: number;
};
type ConfiguredExhibitionTeam = TeamInput & {roster:TeamRoster};
const FIRST_DYNASTY_SEASON=2014;

const LINEUP_SLOTS: Record<LineupUnit, LineupSlot[]> = {
  offense: [
    { label:"QB",position:"QB",accepted:["QB"] },
    { label:"RB",position:"RB",accepted:["RB","HB","FB"] },
    { label:"WR1",position:"WR",accepted:["WR"] },
    { label:"WR2",position:"WR",accepted:["WR"] },
    { label:"WR3",position:"WR",accepted:["WR"] },
    { label:"TE",position:"TE",accepted:["TE"] },
  ],
  defense: [
    { label:"DE1",position:"DE",accepted:["EDGE","DE","DL"] },
    { label:"DE2",position:"DE",accepted:["EDGE","DE","DL"] },
    { label:"DT1",position:"DT",accepted:["DT","NT","DL"] },
    { label:"DT2",position:"DT",accepted:["DT","NT","DL"] },
    { label:"LB1",position:"LB",accepted:["LB","MLB","ILB","OLB"] },
    { label:"LB2",position:"LB",accepted:["LB","MLB","ILB","OLB"] },
    { label:"LB3",position:"LB",accepted:["LB","MLB","ILB","OLB"] },
    { label:"CB1",position:"CB",accepted:["CB","DB"] },
    { label:"CB2",position:"CB",accepted:["CB","DB"] },
    { label:"FS",position:"FS",accepted:["S","FS","SS","DB"] },
    { label:"SS",position:"SS",accepted:["S","FS","SS","DB"] },
  ],
  specialTeams: [
    { label:"K",position:"K",accepted:["K","PK"] },
    { label:"P",position:"P",accepted:["P"] },
    { label:"LS",position:"LS",accepted:["LS"] },
    { label:"H",position:"H",accepted:["H","QB","P"] },
  ],
};

const ROSTER_SLOT_POSITIONS:Record<LineupUnit,Player["position"][]>={
  offense:["QB","RB","WR","WR","WR","TE","LT","RT","LG","RG","C"],
  defense:["DE","DE","DT","DT","LB","LB","LB","CB","CB","FS","SS"],
  specialTeams:["K","P","LS","H"],
};

const LINEUP_UNIT_LABELS: Record<LineupUnit, string> = {
  offense: "Offense",
  defense: "Defense",
  specialTeams: "Special Teams",
};

function rosterUnit(team: Pick<SeasonTeam,"roster">, unit: LineupUnit) {
  return unit === "specialTeams" ? team.roster.specialTeams ?? [] : team.roster[unit];
}

function normalizeRosterSlots(team: Pick<SeasonTeam,"roster">) {
  let changed=false;
  for(const unit of Object.keys(ROSTER_SLOT_POSITIONS) as LineupUnit[]){
    const players=rosterUnit(team,unit);
    ROSTER_SLOT_POSITIONS[unit].forEach((position,index)=>{
      const player=players[index];
      if(player&&player.position!==position){player.position=position;changed=true;}
    });
  }
  return changed;
}

function lineupCandidates(rows: PlayerRatingRow[], slot: LineupSlot, current?: Player) {
  const accepted = new Set(slot.accepted);
  const candidates = rows
    .filter((row) => accepted.has(String(row.position??"").trim().toUpperCase()))
  if(current&&!candidates.some((row)=>row.id===current.id))candidates.push({id:current.id,name:current.name,jersey:current.number,position:current.position,overall:current.rating,projectedStarter:true});
  return candidates.sort((left,right)=>number(right.overall)-number(left.overall)||left.name.localeCompare(right.name));
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.round(seconds % 60).toString().padStart(2,"0")}`;
}

function TeamMark({ team, small = false }: { team?: TeamInput; small?: boolean }) {
  if (!team) return <span className={`season-team-mark fallback ${small ? "small" : ""}`}>CFB</span>;
  const logo = resolveTeamLogoAsset(team.name) ?? team.logo;
  if (logo) return <TeamLink team={team.name} className={`season-team-mark ${small ? "small" : ""}`} style={{...teamIdentityStyle(team.name,team.primaryColor),background:team.primaryColor}}><img src={logo} alt="" /></TeamLink>;
  return <TeamLink team={team.name} className={`season-team-mark fallback ${small ? "small" : ""}`} style={{background:team.primaryColor,color:team.secondaryColor}}>{team.abbreviation.slice(0,2)}</TeamLink>;
}

function SeasonPlayerJersey({team,number}:{team?:TeamInput;number?:number|null}){
  const primary=team?.primaryColor&&/^#[0-9a-f]{6}$/i.test(team.primaryColor)?team.primaryColor:"#343630";
  const alternate=team?.secondaryColor&&/^#[0-9a-f]{6}$/i.test(team.secondaryColor)?team.secondaryColor:"#f1efe6";
  const style={"--season-jersey":primary,"--season-jersey-trim":alternate,"--season-jersey-ink":alternate} as CSSProperties;
  return <div className="season-player-jersey-card"><div className="season-player-jersey" style={style} role="img" aria-label={`${team?.name??"Team"} jersey number ${number??"unavailable"}`}><span aria-hidden="true">{number??"—"}</span></div></div>;
}

const DIFFICULTY_DETAILS: Record<GameDifficulty,{label:string;description:string}> = {
  easy:{label:"Easy",description:"Current meter speed"},
  hard:{label:"Hard",description:"Fast timing window"},
  impossible:{label:"Impossible",description:"Ultra-fast timing"},
};

function DifficultyPicker({value,onChange,compact=false}:{value:GameDifficulty;onChange:(value:GameDifficulty)=>void;compact?:boolean}){
  return <div className={`season-difficulty-picker ${compact?"compact":""}`} role="radiogroup" aria-label="Timing difficulty">
    {(["easy","hard","impossible"] as GameDifficulty[]).map((difficulty)=><button key={difficulty} type="button" role="radio" aria-checked={value===difficulty} className={value===difficulty?"selected":""} onClick={()=>onChange(difficulty)}><Gauge/><span><strong>{DIFFICULTY_DETAILS[difficulty].label}</strong>{compact?null:<small>{DIFFICULTY_DETAILS[difficulty].description}</small>}</span></button>)}
  </div>;
}

function GameLengthPicker({value,onChange,compact=false}:{value:number;onChange:(value:number)=>void;compact?:boolean}){
  return <label className={`game-length-picker ${compact?"compact":""}`}><span>GAME LENGTH</span><select value={value} onChange={(event)=>onChange(Number(event.target.value))}>
    <option value={0}>Just OT</option>
    {Array.from({length:15},(_,index)=>index+1).map((minutes)=><option key={minutes} value={minutes}>{minutes}-minute quarters</option>)}
  </select></label>;
}

async function fetchTeamProfiles(targetSeason:number){
  const response=await modelDataFetch(`/api/data?season=${targetSeason}&week=16`,{cache:"no-store"});
  if(!response.ok)throw new Error(`The ${targetSeason} Harper+ team directory could not be loaded.`);
  const payload=await response.json() as {rows?:ModelProfileRow[]};
  const rows=(payload.rows??[]).filter((row)=>row.team);
  if(!rows.length)throw new Error(`Harper+ does not yet have a usable ${targetSeason} team directory.`);
  return rows;
}

function SeasonScreenHeader({eyebrow,title,description,team,aside,centered=false}:{eyebrow:string;title:string;description?:string;team?:TeamInput;aside?:ReactNode;centered?:boolean}){
  return <header className={`season-screen-header ${centered?"centered":""}`}>
    <div className="season-screen-header-copy"><span>{eyebrow}</span><h1>{title}</h1>{description?<p>{description}</p>:null}</div>
    {team?<TeamMark team={team}/>:null}{aside?<div className="season-screen-header-aside">{aside}</div>:null}
  </header>;
}

async function fetchPlayers(season:number,team:string) {
  const response=await fetch(`/api/player-ratings?season=${season}&team=${encodeURIComponent(team)}&limit=100`,{cache:"no-store"});
  if(!response.ok)return [];
  const payload=await response.json() as {rows?:PlayerRatingRow[]};
  return payload.rows??[];
}

function teamSideFor(game:SeasonGame,team:string){return game.homeTeam===team?"home" as const:"away" as const;}

function teamInputFromProfile(profile: ModelProfileRow, ranking?: number | null): TeamInput {
  return {
    teamId: String(profile.teamId ?? profile.team),
    name: profile.team,
    mascot: profile.mascot ?? "",
    abbreviation: profile.abbreviation ?? profile.team.slice(0, 4).toUpperCase(),
    conference: profile.conference ?? "Independent",
    primaryColor: profile.color && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : "#1F5132",
    secondaryColor: profile.altColor && /^#[0-9a-f]{6}$/i.test(profile.altColor) ? profile.altColor : "#FFFFFF",
    logo: resolveTeamLogoAsset(profile.team) ?? profile.logo ?? "",
    rating: modelRating(profile),
    ranking: ranking ?? profile.resultsRank ?? null,
    record: profile.record ?? undefined,
  };
}

function scheduleResult(game:SeasonGame,team:string){
  if(!game.completed||game.homeScore===null||game.awayScore===null)return "—";
  const own=game.homeTeam===team?game.homeScore:game.awayScore;
  const opponent=game.homeTeam===team?game.awayScore:game.homeScore;
  return `${own>opponent?"W":"L"} ${own}–${opponent}`;
}

type LeagueMetric={games:number;points:number;pointsAllowed:number;rushYards:number;passYards:number;yardsAllowed:number;turnovers:number;timeOfPossessionSeconds:number};
type RankedMetric="points"|"pointsAllowed"|"totalYards"|"rushYards"|"passYards"|"yardsAllowed"|"turnovers"|"timeOfPossessionSeconds";

function leagueMetrics(save:SeasonSave){
  const metrics:Record<string,LeagueMetric>=Object.fromEntries(save.rankings.map((team)=>[team,{games:0,points:0,pointsAllowed:0,rushYards:0,passYards:0,yardsAllowed:0,turnovers:0,timeOfPossessionSeconds:0}]));
  for(const game of save.games){
    if(!game.completed||game.homeScore===null||game.awayScore===null||!game.teamStats)continue;
    for(const team of [game.homeTeam,game.awayTeam]){
      const row=metrics[team],stats=game.teamStats[team];const opponent=team===game.homeTeam?game.awayTeam:game.homeTeam;const opponentStats=game.teamStats[opponent];
      if(!row||!stats||!opponentStats)continue;
      row.games+=1;row.points+=team===game.homeTeam?game.homeScore:game.awayScore;row.pointsAllowed+=team===game.homeTeam?game.awayScore:game.homeScore;
      row.rushYards+=stats.rushYards;row.passYards+=stats.passYards;row.yardsAllowed+=opponentStats.rushYards+opponentStats.passYards;row.turnovers+=stats.interceptionsThrown+stats.fumblesLost;row.timeOfPossessionSeconds+=stats.timeOfPossessionSeconds;
    }
  }
  return metrics;
}

function metricValue(row:LeagueMetric|undefined,key:RankedMetric){
  if(!row?.games)return null;
  if(key==="totalYards")return (row.rushYards+row.passYards)/row.games;
  return row[key]/row.games;
}

function metricRank(metrics:Record<string,LeagueMetric>,team:string,key:RankedMetric,lowerIsBetter=false){
  const rows=Object.keys(metrics).filter((name)=>metricValue(metrics[name],key)!==null).sort((left,right)=>{
    const difference=Number(metricValue(metrics[right],key))-Number(metricValue(metrics[left],key));
    return lowerIsBetter?-difference:difference;
  });
  const index=rows.indexOf(team);return index>=0?index+1:null;
}

function turnovers(stats:NonNullable<SeasonGame["teamStats"]>[string]){return stats.interceptionsThrown+stats.fumblesLost;}

function winnerOf(game:SeasonGame){
  if(!game.completed||game.homeScore===null||game.awayScore===null)return null;
  return game.homeScore>game.awayScore?game.homeTeam:game.awayTeam;
}

function projectedLine(game:SeasonGame){
  const margin=game.predictedHomeScore-game.predictedAwayScore;
  if(Math.abs(margin)<.25)return "PICK 'EM";
  const favorite=margin>0?game.homeTeam:game.awayTeam;
  return `${favorite} -${Math.abs(margin).toFixed(1)}`;
}

async function exportSeasonPdf(save:SeasonSave){
  const team=save.teams[save.selectedTeam];
  const teamLogo=team ? resolveTeamLogoAsset(team.name) ?? team.logo : "";
  let logo: {bytes:ArrayBuffer;type:string}|undefined;
  if(teamLogo){
    try{
      const image=new Image();image.crossOrigin="anonymous";image.src=teamLogo;
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Logo unavailable"));});
      const canvas=document.createElement("canvas");canvas.width=Math.max(128,image.naturalWidth);canvas.height=Math.max(128,image.naturalHeight);
      const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("Logo conversion failed")),"image/png"));
      logo={bytes:await blob.arrayBuffer(),type:"image/png"};
    }catch{/* The PDF retains the team name if a browser blocks image conversion. */}
  }
  const bytes=await buildSeasonPdf(save,logo);
  const blob=new Blob([new Uint8Array(bytes)],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);const anchor=document.createElement("a");
  anchor.href=url;anchor.download=`harper-season-${save.selectedTeam.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${save.season}.pdf`;anchor.click();URL.revokeObjectURL(url);
}

function SeasonThemeToggle({theme,onToggle}:{theme:GameTheme;onToggle:()=>void}){
  return <button className="season-theme-toggle" type="button" onClick={onToggle} aria-label={theme==="dark"?"Use light theme":"Use dark theme"} title={theme==="dark"?"Use light theme":"Use dark theme"}>
    {theme==="dark"?<Sun/>:<Moon/>}<span>{theme==="dark"?"LIGHT":"DARK"}</span>
  </button>;
}

function SeasonMenu({hasSaves,onNew,onLoad,onQuick,onExit}:{hasSaves:boolean;onNew:()=>void;onLoad:()=>void;onQuick:()=>void;onExit?:()=>void}){
  return <section className="season-menu season-menu-home" aria-labelledby="down-by-down-menu-title">
    <header><h1 id="down-by-down-menu-title">Down by Down</h1><p>Choose how you want to play.</p></header>
    <div className="season-main-actions">
      <button type="button" onClick={onQuick}><i aria-hidden="true"><Play/></i><span><strong>Exhibition</strong><small>Play a single game</small></span><b aria-hidden="true">›</b></button>
      <button type="button" onClick={onNew}><i aria-hidden="true"><Play/></i><span><strong>New dynasty</strong><small>Start a college football season</small></span><b aria-hidden="true">›</b></button>
      <button type="button" onClick={onLoad}><i aria-hidden="true"><FolderOpen/></i><span><strong>Load dynasty</strong><small>{hasSaves?"Continue a save on this device":"No saved dynasties on this device"}</small></span><b aria-hidden="true">›</b></button>
    </div>
    {onExit?<button className="season-model-return" type="button" onClick={onExit}>← Back to Harper+ Model</button>:null}
  </section>;
}

function LoadGame({saves,onContinue,onDelete,onBack}:{saves:SeasonSave[];onContinue:(save:SeasonSave)=>void;onDelete:(id:string)=>void;onBack:()=>void}){
  return <section className="season-load">
    <button className="season-back" type="button" onClick={onBack}>← GAME MENU</button>
    <SeasonScreenHeader eyebrow="LOCAL DYNASTIES" title="Load Game" description="Continue from the exact week, lineup, rankings, and postseason state saved on this device."/>
    {saves.length?<div className="season-save-list"><h2>Saved Dynasties</h2>{saves.map((save)=><article key={save.id}>
      <TeamMark team={save.teams[save.selectedTeam]} small/><div><strong>{save.selectedTeam}</strong><span>{save.dynastyStartSeason===save.season?save.season:`${save.dynastyStartSeason}–${save.season}`} · {recordLabel(save.records[save.selectedTeam])} · {phaseLabel(save.phase,save.currentWeek)}</span></div>
      <button type="button" onClick={()=>onContinue(save)}>LOAD</button><button className="delete" type="button" aria-label={`Delete ${save.selectedTeam} dynasty`} onClick={()=>onDelete(save.id)}>×</button>
    </article>)}</div>:<div className="season-empty-save"><FolderOpen/><strong>No saved dynasties</strong><span>Start a new game to create the first local save.</span></div>}
  </section>;
}

function NewSeason({maxSeason,selectedSeason,difficulty,quarterLengthMinutes,profiles,loading,error,onBack,onSeasonChange,onDifficultyChange,onQuarterLengthChange,onStart}:{maxSeason:number;selectedSeason:number;difficulty:GameDifficulty;quarterLengthMinutes:number;profiles:ModelProfileRow[];loading:boolean;error:string;onBack:()=>void;onSeasonChange:(season:number)=>void;onDifficultyChange:(difficulty:GameDifficulty)=>void;onQuarterLengthChange:(minutes:number)=>void;onStart:(team:string,season:number,difficulty:GameDifficulty,quarterLengthMinutes:number)=>void}){
  const [team,setTeam]=useState("");
  const effectiveTeam=profiles.some((row)=>row.team===team)?team:profiles[0]?.team??"";
  const selected=profiles.find((row)=>row.team===effectiveTeam);
  return <section className="season-new">
    <button className="season-back" type="button" onClick={onBack}>← GAME MENU</button>
    <SeasonScreenHeader eyebrow="NEW LOCAL DYNASTY" title="Choose your starting point" description={`Begin from any season from ${FIRST_DYNASTY_SEASON} through ${maxSeason}. Each year uses that season's schedule, roster, ratings, and Harper+ model data.`}/>
    {loading?<p className="season-status">Loading the Harper+ team directory…</p>:error?<p className="season-status error">{error}</p>:<div className="season-team-select">
      <TeamMark team={selected?teamInputFromProfile(selected):undefined}/>
      <div className="season-start-fields"><label><span>STARTING SEASON</span><select value={selectedSeason} onChange={(event)=>{setTeam("");onSeasonChange(Number(event.target.value));}}>{Array.from({length:maxSeason-FIRST_DYNASTY_SEASON+1},(_,index)=>maxSeason-index).map((year)=><option key={year} value={year}>{year}</option>)}</select></label><label><span>TEAM</span><select value={effectiveTeam} onChange={(event)=>setTeam(event.target.value)}>{profiles.map((row)=><option key={row.team} value={row.team}>{row.team} — {row.conference??"Independent"}</option>)}</select></label></div>
      <dl><div><dt>MODEL ELO</dt><dd>{Math.round(number(selected?.eloRating,1500))}</dd></div><div><dt>OFFENSE INDEX</dt><dd>{number(selected?.offYppIndex,1).toFixed(2)}</dd></div><div><dt>DEFENSE INDEX</dt><dd>{number(selected?.defYppIndex,1).toFixed(2)}</dd></div></dl>
      <div className="season-difficulty-field"><span>TIMING DIFFICULTY</span><DifficultyPicker value={difficulty} onChange={onDifficultyChange}/></div>
      <GameLengthPicker value={quarterLengthMinutes} onChange={onQuarterLengthChange}/>
      <button className="season-primary" type="button" disabled={!effectiveTeam} onClick={()=>onStart(effectiveTeam,selectedSeason,difficulty,quarterLengthMinutes)}>START {selectedSeason} DYNASTY</button>
    </div>}
  </section>;
}

function DepthChartEditor({team,candidates,busy,onBack,onSelect,context="SEASON HUB",autosave=true}:{team:TeamInput & {roster:TeamRoster};candidates:PlayerRatingRow[];busy:boolean;onBack:()=>void;onSelect:(unit:LineupUnit,slotIndex:number,playerId:string)=>void;context?:string;autosave?:boolean}){
  return <section className="season-lineup">
    <div className="season-weekly-top"><button className="season-back" type="button" onClick={onBack}>← {context}</button><span>{busy?"SAVING…":autosave?"AUTOSAVES ON THIS DEVICE":"APPLIES TO THIS EXHIBITION"}</span></div>
    <SeasonScreenHeader eyebrow="DEPTH CHART" title={`Set ${team.name} starters`} description="Players are listed from highest to lowest overall. The offensive line remains one automatically rated unit." team={team}/>
    <div className="season-lineup-groups">
      {(Object.keys(LINEUP_SLOTS) as LineupUnit[]).map((unit)=><details key={unit} open={unit==="offense"}>
        <summary><strong>{LINEUP_UNIT_LABELS[unit]}</strong><span>{LINEUP_SLOTS[unit].length} selectable</span></summary>
        <div className="season-lineup-slots">
          {LINEUP_SLOTS[unit].map((slot,slotIndex)=>{
            const current=rosterUnit(team,unit)[slotIndex];
            const rows=lineupCandidates(candidates,slot,current);
            return <label className="season-lineup-slot" key={`${unit}-${slot.label}`}>
              <span>{slot.label}</span>
              <select value={current?.id??""} disabled={busy||!rows.length} onChange={(event)=>onSelect(unit,slotIndex,event.target.value)}>
                {rows.map((row)=><option key={row.id} value={row.id}>#{row.jersey??"—"} {row.name} · {Math.round(number(row.overall,78))} OVR</option>)}
              </select>
            </label>;
          })}
        </div>
      </details>)}
    </div>
    <button className="season-primary lineup-done" type="button" disabled={busy} onClick={onBack}>DONE</button>
  </section>;
}

function LineupEditor({save,candidates,busy,onBack,onSelect}:{save:SeasonSave;candidates:PlayerRatingRow[];busy:boolean;onBack:()=>void;onSelect:(unit:LineupUnit,slotIndex:number,playerId:string)=>void}){
  return <DepthChartEditor team={save.teams[save.selectedTeam]} candidates={candidates} busy={busy} onBack={onBack} onSelect={onSelect}/>;
}

function ExhibitionSetup({maxSeason,config,homeProfiles,awayProfiles,joinKey,loading,busy,error,hasDepthChart,onBack,onSeasonChange,onChange,onSwap,onJoinKeyChange,onJoin,onDepthChart,onStart}:{maxSeason:number;config:ExhibitionConfig;homeProfiles:ModelProfileRow[];awayProfiles:ModelProfileRow[];joinKey:string;loading:boolean;busy:boolean;error:string;hasDepthChart:boolean;onBack:()=>void;onSeasonChange:(side:"home"|"away",season:number)=>void;onChange:(patch:Partial<ExhibitionConfig>)=>void;onSwap:()=>void;onJoinKeyChange:(key:string)=>void;onJoin:()=>void;onDepthChart:()=>void;onStart:()=>void}){
  const orderedHome=useMemo(()=>homeProfiles.slice().sort((left,right)=>modelRating(right)-modelRating(left)||left.team.localeCompare(right.team)),[homeProfiles]);
  const orderedAway=useMemo(()=>awayProfiles.slice().sort((left,right)=>modelRating(right)-modelRating(left)||left.team.localeCompare(right.team)),[awayProfiles]);
  const homeProfile=orderedHome.find((profile)=>profile.team===config.homeTeam)??orderedHome[0];
  const awayProfile=orderedAway.find((profile)=>profile.team===config.awayTeam)??orderedAway[0];
  const home=homeProfile?{...teamInputFromProfile(homeProfile),rating:config.homeRating}:undefined;
  const away=awayProfile?{...teamInputFromProfile(awayProfile),rating:config.awayRating}:undefined;
  const canStart=Boolean(home&&away&&(home.name!==away.name||config.homeSeason!==config.awaySeason)&&!loading&&!busy);
  function chooseTeam(side:"home"|"away",teamName:string){const profile=(side==="home"?orderedHome:orderedAway).find((row)=>row.team===teamName);if(!profile)return;onChange(side==="home"?{homeTeam:teamName,homeRating:modelRating(profile)}:{awayTeam:teamName,awayRating:modelRating(profile)});}
  const years=Array.from({length:maxSeason-FIRST_DYNASTY_SEASON+1},(_,index)=>maxSeason-index);
  return <section className="season-exhibition">
    <button className="season-back" type="button" onClick={onBack}>← GAME MENU</button>
    <SeasonScreenHeader eyebrow="EXHIBITION" title="Build a matchup" description="Match teams and real rosters from any seasons between 2014 and 2026, then play the CPU or a friend."/>
    {loading&&!homeProfiles.length&&!awayProfiles.length?<p className="season-status">Loading team directories…</p>:<>{error?<p className="season-status error">{error}</p>:null}<div className="exhibition-setup-card">
      <div className="exhibition-toolbar"><div className="exhibition-opponent" role="radiogroup" aria-label="Opponent type"><span>OPPONENT</span><div><button type="button" role="radio" aria-checked={config.opponentType==="cpu"} className={config.opponentType==="cpu"?"selected":""} onClick={()=>onChange({opponentType:"cpu"})}>CPU</button><button type="button" role="radio" aria-checked={config.opponentType==="human"} className={config.opponentType==="human"?"selected":""} onClick={()=>onChange({opponentType:"human"})}>FRIEND</button></div></div><GameLengthPicker value={config.quarterLengthMinutes} onChange={(quarterLengthMinutes)=>onChange({quarterLengthMinutes})}/></div>
      <div className="exhibition-matchup">
        <article>{home?<TeamMark team={home}/>:null}<label><span>YOUR TEAM · HOME</span><select value={config.homeSeason} onChange={(event)=>onSeasonChange("home",Number(event.target.value))}>{years.map((year)=><option key={year} value={year}>{year} season</option>)}</select><select value={homeProfile?.team??""} onChange={(event)=>chooseTeam("home",event.target.value)}>{orderedHome.map((profile)=><option key={profile.team} value={profile.team}>{profile.team} — {profile.conference??"Independent"}</option>)}</select></label><strong>OVR {config.homeRating}</strong></article>
        <button className="exhibition-swap" type="button" onClick={onSwap} disabled={busy} aria-label="Switch home and away teams">⇄<span>SWAP</span></button>
        <article>{away?<TeamMark team={away}/>:null}<label><span>{config.opponentType==="cpu"?"CPU TEAM":"OPPONENT"} · AWAY</span><select value={config.awaySeason} onChange={(event)=>onSeasonChange("away",Number(event.target.value))}>{years.map((year)=><option key={year} value={year}>{year} season</option>)}</select><select value={awayProfile?.team??""} onChange={(event)=>chooseTeam("away",event.target.value)}>{orderedAway.map((profile)=><option key={profile.team} value={profile.team}>{profile.team} — {profile.conference??"Independent"}</option>)}</select></label><strong>OVR {config.awayRating}</strong></article>
      </div>
      <div className="exhibition-difficulty"><span>TIMING DIFFICULTY</span><DifficultyPicker value={config.difficulty} onChange={(difficulty)=>onChange({difficulty})}/></div>
      <details className="exhibition-advanced"><summary>ADVANCED RATINGS</summary><div><label><span>{homeProfile?.team??"HOME"} OVR</span><input type="number" min="60" max="99" value={config.homeRating} onChange={(event)=>onChange({homeRating:Math.max(60,Math.min(99,Number(event.target.value)))})}/></label><label><span>{awayProfile?.team??"AWAY"} OVR</span><input type="number" min="60" max="99" value={config.awayRating} onChange={(event)=>onChange({awayRating:Math.max(60,Math.min(99,Number(event.target.value)))})}/></label></div></details>
      <div className="exhibition-actions"><button className="season-primary lineup" type="button" disabled={!home||busy} onClick={onDepthChart}>{busy?"LOADING ROSTER…":hasDepthChart?"EDIT YOUR DEPTH CHART":"SET YOUR DEPTH CHART"}</button><button className="season-primary" type="button" disabled={!canStart} onClick={onStart}>{busy?"BUILDING GAME…":config.opponentType==="cpu"?"PLAY CPU":"CREATE FRIEND GAME"}</button></div>
      <p className="exhibition-note">Each team uses its selected season&apos;s real Harper+ roster. Your depth-chart changes apply to the home team for this matchup only.</p>
      <div className="exhibition-join"><div><strong>JOIN PRIVATE GAME</strong><small>Enter the six-character key shown at the top of your friend&apos;s game.</small></div><input value={joinKey} maxLength={6} autoCapitalize="characters" spellCheck={false} placeholder="GAME KEY" onChange={(event)=>onJoinKeyChange(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,""))}/><button type="button" disabled={busy||joinKey.length!==6} onClick={onJoin}>JOIN</button></div>
    </div></>}
  </section>;
}

function TeamRankStrip({save,team,metrics}:{save:SeasonSave;team:string;metrics:Record<string,LeagueMetric>}){
  const overallIndex=save.rankings.indexOf(team);const row=metrics[team];
  const cards=[
    ["TOP 25",overallIndex>=0&&overallIndex<25?`#${overallIndex+1}`:"NR"],
    ["SCORING",metricRank(metrics,team,"points")],
    ["TOTAL OFF",metricRank(metrics,team,"totalYards")],
    ["TOTAL DEF",metricRank(metrics,team,"yardsAllowed",true)],
    ["PTS ALLOWED",metricRank(metrics,team,"pointsAllowed",true)],
  ];
  return <div className="season-rank-strip">{cards.map(([label,value])=><span key={String(label)}><small>{label}</small><strong>{typeof value==="number"?`#${value}`:value}</strong></span>)}{row?.games?<span><small>YARDS/G</small><strong>{Math.round(Number(metricValue(row,"totalYards")))}</strong></span>:null}</div>;
}

function RankingsView({save,metrics}:{save:SeasonSave;metrics:Record<string,LeagueMetric>}){
  return <section className="season-rankings season-rankings-full"><header><div><span>NATIONAL RANKINGS</span><h2>Top 25</h2></div><small>RESULTS + HARPER+ STRENGTH</small></header>
    <div className="season-ranking-table"><div className="season-ranking-head"><span>#</span><span>TEAM</span><span>REC</span><span>CONF</span><span>OVR</span></div>{save.rankings.slice(0,25).map((team,index)=>{
      const row=metrics[team],record=save.records[team],config=save.teams[team];
      return <article className={team===save.selectedTeam?"is-user-team":""} key={team}><b className={index<3?`medal medal-${index+1}`:""}>{index+1}</b><span className="season-ranked-team"><TeamMark team={config} small/><span><strong>{team}</strong><small>{config?.conference??"Independent"}{row?.games?` · ${(row.points/row.games).toFixed(1)} PPG`:" · PRESEASON"}</small></span></span><em>{recordLabel(record)}</em><em>{record?`${record.conferenceWins}-${record.conferenceLosses}`:"0-0"}</em><strong className="season-overall-pill">{config?.rating??"—"}</strong></article>;
    })}</div>
  </section>;
}

function PlayoffView({save}:{save:SeasonSave}){
  const seeds=save.playoffSeeds.length?save.playoffSeeds:projectedPlayoffSeeds(save);const twelveTeam=save.season>=2024;
  const playoffStages: Array<{stage:SeasonGame["stage"];label:string}> = twelveTeam
    ? [{stage:"playoff-first",label:"FIRST ROUND"},{stage:"playoff-quarterfinal",label:"QUARTERFINALS"},{stage:"playoff-semifinal",label:"SEMIFINALS"},{stage:"championship",label:"NATIONAL TITLE"}]
    : [{stage:"playoff-semifinal",label:"SEMIFINALS"},{stage:"championship",label:"NATIONAL TITLE"}];
  const actualPlayoffGames=save.games.filter((game)=>playoffStages.some((round)=>round.stage===game.stage));
  const projectedPairings=twelveTeam?[[4,11],[5,10],[6,9],[7,8]]:[[0,3],[1,2]];
  const titleGame=save.games.find((game)=>game.stage==="championship"&&game.completed);const champion=titleGame?winnerOf(titleGame):null;
  const bowls=save.games.filter((game)=>game.stage==="bowl");
  return <div className="season-postseason-stack"><section className="season-playoff-view"><header><span>{actualPlayoffGames.length?"CURRENT BRACKET":"PROJECTED BRACKET"}</span><h2>{twelveTeam?"12-Team":"Four-Team"} College Football Playoff</h2><p>Based on games completed through {phaseLabel(save.phase,save.currentWeek)}.</p></header>
    {champion?<div className="season-national-champion"><TeamMark team={save.teams[champion]}/><span><small>NATIONAL CHAMPION</small><strong>{champion}</strong><b>{titleGame?.homeScore}–{titleGame?.awayScore}</b></span></div>:null}
    <div className="season-playoff-grid"><div className="season-seed-list"><span>SEEDS</span>{seeds.map((team,index)=><article key={`${team}-${index}`}><b>{index+1}</b><TeamMark team={save.teams[team]} small/><strong>{team??"TBD"}</strong><small>{recordLabel(save.records[team])}</small></article>)}</div>
      {actualPlayoffGames.length?<div className="season-bracket-rounds">{playoffStages.map((round)=>{const games=save.games.filter((game)=>game.stage===round.stage);return <section key={round.stage}><span>{round.label}</span>{games.length?games.map((game)=>{const winner=winnerOf(game);return <article key={game.id}><div className={`team-identity-surface ${winner===game.homeTeam?"winner":""}`} style={teamIdentityStyle(game.homeTeam,save.teams[game.homeTeam]?.primaryColor)}><TeamMark team={save.teams[game.homeTeam]} small/><strong><TeamAccent name={game.homeTeam} color={save.teams[game.homeTeam]?.primaryColor}/></strong><b>{game.homeScore??"—"}</b></div><div className={`team-identity-surface ${winner===game.awayTeam?"winner":""}`} style={teamIdentityStyle(game.awayTeam,save.teams[game.awayTeam]?.primaryColor)}><TeamMark team={save.teams[game.awayTeam]} small/><strong><TeamAccent name={game.awayTeam} color={save.teams[game.awayTeam]?.primaryColor}/></strong><b>{game.awayScore??"—"}</b></div></article>}):<p>Awaiting prior round</p>}</section>})}</div>
      :<div className="season-first-round"><span>{twelveTeam?"PROJECTED FIRST ROUND":"PROJECTED SEMIFINALS"}</span>{projectedPairings.map(([homeIndex,awayIndex])=><article key={`${homeIndex}-${awayIndex}`}><div><b>#{homeIndex+1}</b><TeamMark team={save.teams[seeds[homeIndex]]} small/><strong>{seeds[homeIndex]??"TBD"}</strong></div><em>VS</em><div><b>#{awayIndex+1}</b><TeamMark team={save.teams[seeds[awayIndex]]} small/><strong>{seeds[awayIndex]??"TBD"}</strong></div></article>)}{twelveTeam?<div className="season-bye-note"><strong>TOP FOUR SEEDS</strong><span>First-round byes</span></div>:null}</div>}
    </div></section>{bowls.length?<ScheduleTable title="Bowl Games" games={bowls} save={save} team={save.selectedTeam} neutralPerspective/>:null}</div>;
}

function ConferenceStandings({save}:{save:SeasonSave}){
  const conferences=useMemo(()=>[...new Set(Object.values(save.teams).map((team)=>team.conference).filter((conference)=>conference&&conference!=="FCS"&&conference!=="Independent"))].sort(),[save.teams]);
  const userConference=save.teams[save.selectedTeam]?.conference??conferences[0]??"";const [conference,setConference]=useState(userConference);
  const activeConference=conferences.includes(conference)?conference:userConference;
  const teams=Object.values(save.teams).filter((team)=>team.conference===activeConference).sort((left,right)=>{const a=save.records[left.name],b=save.records[right.name];return (b?.conferenceWins??0)-(a?.conferenceWins??0)||(a?.conferenceLosses??0)-(b?.conferenceLosses??0)||(b?.wins??0)-(a?.wins??0)||(left.name.localeCompare(right.name));});
  return <section className="season-standings-view"><header><div><span>CONFERENCE STANDINGS</span><h2>{activeConference}</h2></div><label><span>CONFERENCE</span><select value={activeConference} onChange={(event)=>setConference(event.target.value)}>{conferences.map((name)=><option key={name}>{name}</option>)}</select></label></header><div className="season-standings-table"><div><span>#</span><span>TEAM</span><span>CONF</span><span>OVR</span></div>{teams.map((team,index)=>{const record=save.records[team.name];return <article className={team.name===save.selectedTeam?"is-user-team":""} key={team.name}><b className={index<3?`medal medal-${index+1}`:""}>{index+1}</b><span className="team-identity-surface" style={teamIdentityStyle(team.name,team.primaryColor)}><TeamMark team={team} small/><strong><TeamAccent name={team.name} color={team.primaryColor}/></strong></span><em>{record?`${record.conferenceWins}-${record.conferenceLosses}`:"0-0"}</em><em>{recordLabel(record)}</em></article>})}</div></section>;
}

type SeasonNewsStory={game:SeasonGame;category:string;tone:string;title:string;summary:string};
function seasonNews(save:SeasonSave):SeasonNewsStory[]{
  return save.games.filter((game)=>game.completed&&game.homeScore!==null&&game.awayScore!==null).sort((left,right)=>right.week-left.week||right.id.localeCompare(left.id)).map((game)=>{
    const winner=winnerOf(game)??game.homeTeam,loser=winner===game.homeTeam?game.awayTeam:game.homeTeam;
    const winnerScore=winner===game.homeTeam?Number(game.homeScore):Number(game.awayScore),loserScore=winner===game.homeTeam?Number(game.awayScore):Number(game.homeScore);
    const winnerRank=rankingFor(save,winner),loserRank=rankingFor(save,loser);const predictedWinner=game.predictedHomeScore>=game.predictedAwayScore?game.homeTeam:game.awayTeam;
    const upset=winner!==predictedWinner&&Math.abs(game.predictedHomeScore-game.predictedAwayScore)>=3;const winnerStats=game.teamStats?.[winner];const loserStats=game.teamStats?.[loser];
    const yards=winnerStats?winnerStats.rushYards+winnerStats.passYards:null;const turnoverEdge=winnerStats&&loserStats?turnovers(loserStats)-turnovers(winnerStats):0;
    let category="AROUND THE COUNTRY",tone="national",title=`${winnerRank?`#${winnerRank} `:""}${winner} defeats ${loserRank?`#${loserRank} `:""}${loser}`;
    if(game.stage==="championship"){category="NATIONAL CHAMPIONSHIP";tone="championship";title=`${winner} wins the national championship`;}
    else if(game.stage==="playoff-first"||game.stage==="playoff-quarterfinal"||game.stage==="playoff-semifinal"){category="COLLEGE FOOTBALL PLAYOFF";tone="playoff";title=`${winner} advances past ${loser}`;}
    else if(game.stage==="bowl"){category="BOWL RESULT";tone="bowl";title=`${winner} wins the ${game.label}`;}
    else if(game.stage==="conference"){category="CONFERENCE CHAMPIONSHIP";tone="conference";title=`${winner} claims the ${game.label}`;}
    else if(upset){category="UPSET ALERT";tone="upset";title=`Upset alert: ${winner} knocks off ${loserRank?`No. ${loserRank} `:""}${loser}`;}
    else if(winnerRank||loserRank){category="RANKED MATCHUP";tone="ranked";}
    const detail=yards!==null?`${winner} generated ${yards} total yards${turnoverEdge>0?` and won the turnover margin by ${turnoverEdge}`:""}. `:"";
    return {game,category,tone,title,summary:`${detail}${winner} finished a ${winnerScore}–${loserScore} victory in ${game.label}.`};
  }).slice(0,16);
}

function NewsView({save}:{save:SeasonSave}){
  const stories=seasonNews(save);
  return <section className="season-news-view"><header><span>NATIONAL NEWS</span><h2>Around college football</h2><p>Results and storylines generated from this dynasty&apos;s games.</p></header>{stories.length?<div>{stories.map((story)=><article className={story.tone} key={story.game.id}><header><strong>{story.category}</strong><span>{story.game.label}</span></header><h3>{story.title}</h3><p>{story.summary}</p><div className="season-news-score"><span><TeamMark team={save.teams[story.game.homeTeam]} small/><strong>{story.game.homeTeam}</strong><b>{story.game.homeScore}</b></span><em>FINAL</em><span><b>{story.game.awayScore}</b><strong>{story.game.awayTeam}</strong><TeamMark team={save.teams[story.game.awayTeam]} small/></span></div></article>)}</div>:<p className="season-news-empty">National results will appear after the first week is completed.</p>}</section>;
}

function GameStatRows({game}:{game:SeasonGame}){
  const home=game.teamStats?.[game.homeTeam],away=game.teamStats?.[game.awayTeam];
  if(!home||!away)return <p className="season-no-box-score">Detailed statistics will appear after this game is played or simulated.</p>;
  const rows:[string,string|number,string|number][]= [
    ["Total yards",home.rushYards+home.passYards,away.rushYards+away.passYards],
    ["Rush yards",home.rushYards,away.rushYards],
    ["Pass yards",home.passYards,away.passYards],
    ["First downs",home.firstDowns,away.firstDowns],
    ["Passing",`${home.completions}/${home.passAttempts}`,`${away.completions}/${away.passAttempts}`],
    ["Turnovers",turnovers(home),turnovers(away)],
    ["Possession",formatDuration(home.timeOfPossessionSeconds),formatDuration(away.timeOfPossessionSeconds)],
  ];
  return <div className="season-box-score-stats"><header><strong><TeamAccent name={game.homeTeam}/></strong><span>TEAM STATS</span><strong><TeamAccent name={game.awayTeam}/></strong></header>{rows.map(([label,homeValue,awayValue])=><div key={label}><b>{homeValue}</b><span>{label}</span><b>{awayValue}</b></div>)}</div>;
}

function ScheduleTable({title="Season Schedule",games,save,team,neutralPerspective=false}:{title?:string;games:SeasonGame[];save:SeasonSave;team:string;neutralPerspective?:boolean}){
  return <section className="season-schedule season-schedule-expanded"><h2>{title}</h2><div>{games.length?games.map((game)=>{
    const opponent=game.homeTeam===team?game.awayTeam:game.homeTeam;
    const isTeamGame=game.homeTeam===team||game.awayTeam===team;
    const location=game.neutralSite?"NEUTRAL":game.homeTeam===team?"HOME":"AWAY";
    const result=isTeamGame?scheduleResult(game,team):game.completed&&game.homeScore!==null&&game.awayScore!==null?`${game.homeScore}–${game.awayScore}`:"—";
    return <details key={game.id} className={game.completed?"complete":""}><summary className="season-game-summary"><span>{game.label}</span>{neutralPerspective?<><TeamMark team={save.teams[game.homeTeam]} small/><strong><TeamAccent name={game.homeTeam} color={save.teams[game.homeTeam]?.primaryColor}/> vs <TeamAccent name={game.awayTeam} color={save.teams[game.awayTeam]?.primaryColor}/></strong></>:<><TeamMark team={save.teams[opponent]} small/><strong><TeamAccent name={opponent} color={save.teams[opponent]?.primaryColor}/></strong></>}<small>{neutralPerspective?(game.neutralSite?"N":`AT ${game.homeTeam.toUpperCase()}`):location}</small><b>{result}</b></summary><div className="season-game-box"><div className="season-game-score"><div className="team-identity-surface" style={teamIdentityStyle(game.homeTeam,save.teams[game.homeTeam]?.primaryColor)}><TeamMark team={save.teams[game.homeTeam]} small/><span><strong><TeamAccent name={game.homeTeam} color={save.teams[game.homeTeam]?.primaryColor}/></strong><small>{recordLabel(save.records[game.homeTeam])}</small></span><b>{game.homeScore??"—"}</b></div><div className="team-identity-surface" style={teamIdentityStyle(game.awayTeam,save.teams[game.awayTeam]?.primaryColor)}><TeamMark team={save.teams[game.awayTeam]} small/><span><strong><TeamAccent name={game.awayTeam} color={save.teams[game.awayTeam]?.primaryColor}/></strong><small>{recordLabel(save.records[game.awayTeam])}</small></span><b>{game.awayScore??"—"}</b></div></div>{game.completed?<GameStatRows game={game}/>:<div className="season-game-projection"><span>HARPER+ PROJECTION</span><strong><TeamAccent name={game.homeTeam} color={save.teams[game.homeTeam]?.primaryColor}/> {Math.round(game.predictedHomeScore)} · <TeamAccent name={game.awayTeam} color={save.teams[game.awayTeam]?.primaryColor}/> {Math.round(game.predictedAwayScore)}</strong><small>{Math.round(game.homeWinProbability*100)}% {game.homeTeam} win probability</small></div>}</div></details>;
  }):<p className="season-empty-list">No games are available in this view yet.</p>}</div></section>;
}

function SeasonLeaders({save}:{save:SeasonSave}){
  const leaders=topPlayerLeaders(save);
  const team=save.teams[save.selectedTeam];
  const cards=[
    {label:"PASS",leader:leaders.passing,value:leaders.passing?.stats.passYards??0,suffix:"YDS"},
    {label:"RUSH",leader:leaders.rushing,value:leaders.rushing?.stats.rushYards??0,suffix:"YDS"},
    {label:"REC",leader:leaders.receiving,value:leaders.receiving?.stats.receivingYards??0,suffix:"YDS"},
    {label:"TACKLES",leader:leaders.tackles,value:leaders.tackles?.stats.tackles??0,suffix:"TACKLES"},
  ];
  return <section className="season-leaders"><h2>Season Leaders</h2>{cards.map(({label,leader,value,suffix})=><div key={label}><SeasonPlayerJersey team={team} number={leader?.player?.number}/><span><small>{label}</small><strong>{leader?.player?.name??"—"}</strong></span><b>{Number(value)}<small>{suffix}</small></b></div>)}</section>;
}

function LeagueSchedule({save,metrics}:{save:SeasonSave;metrics:Record<string,LeagueMetric>}){
  const [team,setTeam]=useState(save.selectedTeam);
  const activeTeam=save.rankings.includes(team)?team:save.selectedTeam;
  const games=save.games.filter((game)=>game.homeTeam===activeTeam||game.awayTeam===activeTeam).sort((left,right)=>left.week-right.week);
  return <section className="season-league-view"><div className="season-league-toolbar"><div><span>LEAGUE EXPLORER</span><h2>Team schedules &amp; results</h2></div><label><span>TEAM</span><select value={activeTeam} onChange={(event)=>setTeam(event.target.value)}>{save.rankings.map((name)=><option key={name} value={name}>{rankingFor(save,name)?`#${rankingFor(save,name)} `:""}{name}</option>)}</select></label></div><TeamRankStrip save={save} team={activeTeam} metrics={metrics}/><ScheduleTable title={`${activeTeam} Schedule`} games={games} save={save} team={activeTeam}/></section>;
}

function DynastyHistory({save}:{save:SeasonSave}){
  if(!save.seasonHistory.length)return null;
  return <section className="season-dynasty-history"><h2>Dynasty History</h2><div>{save.seasonHistory.slice().sort((left,right)=>right.season-left.season).map((season)=><article key={season.season}><b>{season.season}</b><TeamMark team={save.teams[save.selectedTeam]} small/><span><strong>{season.team}</strong><small>{season.accomplishments.nationalChampion?"National Champion":season.accomplishments.conferenceChampion?"Conference Champion":season.accomplishments.playoffQualifier?season.accomplishments.playoffRoundReached??"CFP Qualifier":"Season Complete"}</small></span><em>{recordLabel(season.finalRecord)}</em><em>{season.finalRanking?`#${season.finalRanking}`:"NR"}</em></article>)}</div></section>;
}

function SeasonHubTabs({save,week}:{save:SeasonSave;week:ReactNode}){
  const metrics=useMemo(()=>leagueMetrics(save),[save]);
  const userGames=save.games.filter((game)=>game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam);
  return <Tabs defaultValue="week" className="season-hub-tabs"><TabsList className="season-hub-tabs-list"><TabsTrigger value="week">WEEK</TabsTrigger><TabsTrigger value="rankings">TOP 25</TabsTrigger><TabsTrigger value="standings">STANDINGS</TabsTrigger><TabsTrigger value="news">NEWS</TabsTrigger><TabsTrigger value="playoff">PLAYOFF</TabsTrigger><TabsTrigger value="league">TEAMS</TabsTrigger></TabsList><TabsContent value="week">{week}<TeamRankStrip save={save} team={save.selectedTeam} metrics={metrics}/><div className="season-dashboard-grid"><ScheduleTable games={userGames} save={save} team={save.selectedTeam}/><SeasonLeaders save={save}/></div><SeasonStats save={save} metrics={metrics}/><DynastyHistory save={save}/></TabsContent><TabsContent value="rankings"><RankingsView save={save} metrics={metrics}/></TabsContent><TabsContent value="standings"><ConferenceStandings save={save}/></TabsContent><TabsContent value="news"><NewsView save={save}/></TabsContent><TabsContent value="playoff"><PlayoffView save={save}/></TabsContent><TabsContent value="league"><LeagueSchedule save={save} metrics={metrics}/></TabsContent></Tabs>;
}

function WeeklySnapshot({save,maxSeason,onPlay,onSimulate,onAdvance,onNextSeason,onLineup,onMenu,onExport,onDifficultyChange,onQuarterLengthChange,busy}:{save:SeasonSave;maxSeason:number;onPlay:()=>void;onSimulate:()=>void;onAdvance:()=>void;onNextSeason:()=>void;onLineup:()=>void;onMenu:()=>void;onExport:()=>void;onDifficultyChange:(difficulty:GameDifficulty)=>void;onQuarterLengthChange:(minutes:number)=>void;busy:boolean}){
  const game=currentUserGame(save);const user=save.teams[save.selectedTeam];
  const opponentName=game?(game.homeTeam===save.selectedTeam?game.awayTeam:game.homeTeam):null;const opponent=opponentName?save.teams[opponentName]:undefined;
  const userRank=rankingFor(save,save.selectedTeam),opponentRank=opponentName?rankingFor(save,opponentName):null;
  const userGames=save.games.filter((item)=>item.homeTeam===save.selectedTeam||item.awayTeam===save.selectedTeam);
  const userWinProbability=game?Math.round((game.homeTeam===save.selectedTeam?game.homeWinProbability:1-game.homeWinProbability)*100):null;
  if(save.phase==="complete")return <section className="season-complete">
    <button className="season-back" type="button" onClick={onMenu}>← GAME MENU</button>
    <SeasonScreenHeader centered eyebrow="SEASON COMPLETE" title={save.selectedTeam} team={user} aside={<strong>{recordLabel(save.records[save.selectedTeam])}</strong>}/>
    <div className="season-accomplishments"><span>{save.accomplishments.conferenceChampion?"CONFERENCE CHAMPION":"CONFERENCE SEASON COMPLETE"}</span>{save.accomplishments.bowlGame?<span>{save.accomplishments.bowlChampion?`${save.accomplishments.bowlGame.toUpperCase()} CHAMPION`:save.accomplishments.bowlGame.toUpperCase()}</span>:null}<span>{save.accomplishments.playoffQualifier?`CFP #${save.accomplishments.playoffSeed} · ${save.accomplishments.playoffRoundReached}`:"NO CFP BERTH"}</span>{save.accomplishments.nationalChampion?<b>NATIONAL CHAMPION</b>:null}</div>
    <div className="season-complete-actions"><button className="season-primary" type="button" onClick={onExport}>EXPORT SEASON PDF</button>{save.season<maxSeason?<button className="season-primary advance" type="button" disabled={busy} onClick={onNextSeason}>{busy?"LOADING NEXT SEASON…":`CONTINUE TO ${save.season+1}`}</button>:null}</div>
    <PlayoffView save={save}/><ScheduleTable games={userGames} save={save} team={save.selectedTeam}/><SeasonStats save={save}/><DynastyHistory save={save}/>
  </section>;
  const weekPanel=<div className="season-week-panel"><article className="season-matchup-card">
      <div><small>{userRank?`#${userRank}`:"NR"}</small><TeamMark team={user}/><strong>{user.name}</strong><span>{recordLabel(save.records[user.name])} · OVR {user.rating}</span></div>
      <section><small>{game?.neutralSite?"NEUTRAL SITE":game?.homeTeam===save.selectedTeam?"HOME":"AWAY"}</small><b>VS</b><span>{game?.venue??game?.label??"BYE WEEK"}</span></section>
      <div><small>{opponentRank?`#${opponentRank}`:"NR"}</small><TeamMark team={opponent}/><strong>{opponentName??"BYE"}</strong><span>{opponentName?`${recordLabel(save.records[opponentName])} · OVR ${opponent?.rating??"—"}`:"No game"}</span></div>
    </article>
    {game?<div className="season-week-metrics"><span><small>LINE</small><strong>{projectedLine(game)}</strong></span><span><small>YOUR OVR</small><strong>{user.rating}</strong></span><span><small>WIN %</small><strong>{userWinProbability}%</strong></span></div>:null}
    {game?<div className="season-projection"><span>HARPER+ PREDICTION</span><strong>{game.homeTeam} {Math.round(game.predictedHomeScore)} · {game.awayTeam} {Math.round(game.predictedAwayScore)}</strong><small>{userWinProbability}% {save.selectedTeam} win probability</small></div>:null}
    <div className="season-actions">
      {game&&!game.completed?<button className="season-primary" type="button" disabled={busy} onClick={onPlay}>{busy?"BUILDING GAME…":"PLAY GAME"}</button>:null}
      {game&&!game.completed?<button className="season-primary simulate" type="button" disabled={busy} onClick={onSimulate}>SIMULATE GAME</button>:null}
      <button className="season-primary lineup" type="button" disabled={busy} onClick={onLineup}>SET STARTERS</button>
      <button className="season-primary advance" type="button" disabled={!canAdvance(save)||busy} onClick={onAdvance}>{save.phase==="regular"?"ADVANCE WEEK":save.phase==="bowl"?"ADVANCE TO CFP":"ADVANCE POSTSEASON"}</button>
    </div></div>;
  return <section className="season-weekly">
    <div className="season-weekly-top"><button className="season-back" type="button" onClick={onMenu}>← GAME MENU</button><span>AUTOSAVED ON THIS DEVICE</span></div>
    <div className="season-hub-difficulty"><span><strong>PLAYED GAME SETTINGS</strong><small>Applies to your next Dynasty game.</small></span><DifficultyPicker compact value={save.difficulty} onChange={onDifficultyChange}/><GameLengthPicker compact value={save.quarterLengthMinutes} onChange={onQuarterLengthChange}/></div>
    <SeasonHubTabs save={save} week={weekPanel}/>
  </section>;
}

function SeasonStats({save,metrics}:{save:SeasonSave;metrics?:Record<string,LeagueMetric>}){
  const league=metrics??leagueMetrics(save);const row=league[save.selectedTeam];const games=row?.games??0;
  const cards:Array<{label:string;key:RankedMetric;lower?:boolean;format?:(value:number)=>string}>=[
    {label:"POINTS / GAME",key:"points"},
    {label:"YARDS / GAME",key:"totalYards"},
    {label:"RUSH YDS / GAME",key:"rushYards"},
    {label:"PASS YDS / GAME",key:"passYards"},
    {label:"TURNOVERS / GAME",key:"turnovers",lower:true},
    {label:"POSSESSION / GAME",key:"timeOfPossessionSeconds",format:(value)=>formatDuration(Math.round(value))},
    {label:"POINTS ALLOWED / GAME",key:"pointsAllowed",lower:true},
    {label:"YARDS ALLOWED / GAME",key:"yardsAllowed",lower:true},
  ];
  return <section className="season-stats"><header><h2>Team Season Stats</h2><small>{games?`${games} GAME${games===1?"":"S"} · PER GAME`:"PER GAME · AWAITING FIRST RESULT"}</small></header><div>{cards.map(({label,key,lower=false,format})=>{const value=metricValue(row,key);const rank=metricRank(league,save.selectedTeam,key,lower);return <span key={key}><small>{label}</small><strong>{value===null?"—":format?format(value):value.toFixed(1)}</strong><em>{rank?`#${rank} NATIONALLY`:"NATIONAL RANK —"}</em></span>})}</div></section>;
}

export function SeasonMode({season,onExit}:{season:number;onExit?:()=>void}){
  const [view,setView]=useState<HubView>("menu");const [saves,setSaves]=useState<SeasonSave[]>([]);const [active,setActive]=useState<SeasonSave|null>(null);
  const [profiles,setProfiles]=useState<ModelProfileRow[]>([]);const [schedule,setSchedule]=useState<ModelScheduleRow[]>([]);const [directorySeason,setDirectorySeason]=useState(season);const [rosterCandidates,setRosterCandidates]=useState<PlayerRatingRow[]>([]);const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [theme,setTheme]=useState<GameTheme>("dark");const [newDifficulty,setNewDifficulty]=useState<GameDifficulty>("easy");const [newQuarterLength,setNewQuarterLength]=useState(15);
  const [exhibitionConfig,setExhibitionConfig]=useState<ExhibitionConfig>({homeSeason:season,awaySeason:season,homeTeam:"",awayTeam:"",opponentType:"cpu",difficulty:"easy",quarterLengthMinutes:15,homeRating:82,awayRating:82});
  const [homeExhibitionProfiles,setHomeExhibitionProfiles]=useState<ModelProfileRow[]>([]);const [awayExhibitionProfiles,setAwayExhibitionProfiles]=useState<ModelProfileRow[]>([]);const [joinKey,setJoinKey]=useState("");
  const [exhibitionTeam,setExhibitionTeam]=useState<ConfiguredExhibitionTeam|null>(null);const [exhibitionCandidates,setExhibitionCandidates]=useState<PlayerRatingRow[]>([]);const [exhibitionSession,setExhibitionSession]=useState<DownByDownSession|null>(null);const [exhibitionInvite,setExhibitionInvite]=useState("");
  const refreshSaves=useCallback(async()=>setSaves(await listSeasons()),[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refreshSaves(),0);return()=>window.clearTimeout(timer);},[refreshSaves]);
  useEffect(()=>{const stored=window.localStorage.getItem("down-by-down-season-theme");const next:GameTheme=stored==="light"||stored==="dark"?stored:window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark";const timer=window.setTimeout(()=>setTheme(next),0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{const url=new URL(window.location.href);const code=url.searchParams.get("game")?.toUpperCase()??"";const seat=url.searchParams.get("seat");const token=url.searchParams.get("token")??"";if(code&&(seat==="home"||seat==="away")&&token){const timer=window.setTimeout(()=>{setExhibitionSession({code,seat,token});setView("quick-game");},0);return()=>window.clearTimeout(timer);}},[]);
  function toggleTheme(){const next:GameTheme=theme==="dark"?"light":"dark";setTheme(next);window.localStorage.setItem("down-by-down-season-theme",next);}
  const loadAuthoritative=useCallback(async(targetSeason=season)=>{
    if(directorySeason===targetSeason&&profiles.length&&schedule.length)return {profiles,schedule};setLoading(true);setError("");
    try{
      const [profileResponse,scheduleResponse]=await Promise.all([modelDataFetch(`/api/data?season=${targetSeason}&week=16`,{cache:"no-store"}),modelDataFetch(`/api/data?view=schedule&season=${targetSeason}&week=0&compactSchedule=1`,{cache:"no-store"})]);
      if(!profileResponse.ok||!scheduleResponse.ok)throw new Error("The Harper+ season data could not be loaded.");
      const profilePayload=await profileResponse.json() as {rows?:ModelProfileRow[]};const schedulePayload=await scheduleResponse.json() as {rows?:ModelScheduleRow[]};
      const nextProfiles=(profilePayload.rows??[]).filter((row)=>row.team);const nextSchedule=schedulePayload.rows??[];
      if(!nextProfiles.length||!nextSchedule.length)throw new Error(`Harper+ does not yet have a usable ${targetSeason} team directory and schedule.`);
      setDirectorySeason(targetSeason);setProfiles(nextProfiles);setSchedule(nextSchedule);return {profiles:nextProfiles,schedule:nextSchedule};
    }catch(caught){const message=caught instanceof Error?caught.message:"Season data could not be loaded.";setError(message);throw caught;}finally{setLoading(false);}
  },[directorySeason,profiles,schedule,season]);
  async function openNew(){setView("new");try{await loadAuthoritative(directorySeason);}catch{/* error is rendered in the new-season panel */}}
  async function changeDirectorySeason(targetSeason:number){setDirectorySeason(targetSeason);setProfiles([]);setSchedule([]);try{await loadAuthoritative(targetSeason);}catch{/* error is rendered in the new-season panel */}}
  async function openQuick(){setBusy(true);setError("");try{const rows=await fetchTeamProfiles(season);const ordered=rows.slice().sort((left,right)=>modelRating(right)-modelRating(left)||left.team.localeCompare(right.team));const home=ordered.find((row)=>row.team==="Alabama")??ordered[0];const away=ordered.find((row)=>row.team==="Auburn")??ordered.find((row)=>row.team!==home?.team)??ordered[0];setHomeExhibitionProfiles(rows);setAwayExhibitionProfiles(rows);setExhibitionConfig({homeSeason:season,awaySeason:season,homeTeam:home?.team??"",awayTeam:away?.team??"",opponentType:"cpu",difficulty:"easy",quarterLengthMinutes:15,homeRating:home?modelRating(home):82,awayRating:away?modelRating(away):82});setExhibitionTeam(null);setExhibitionCandidates([]);setJoinKey("");setView("quick");}catch(caught){setError(caught instanceof Error?caught.message:"The exhibition directory could not be loaded.");}finally{setBusy(false);}}
  async function startSeason(team:string,targetSeason:number,difficulty:GameDifficulty,quarterLengthMinutes:number){setBusy(true);setError("");try{const data=await loadAuthoritative(targetSeason);const players=await fetchPlayers(targetSeason,team);let save=createSeasonSave({season:targetSeason,selectedTeam:team,difficulty,quarterLengthMinutes,profiles:data.profiles,schedule:data.schedule,rosters:{[team]:players}});save=await saveSeason(save);setActive(save);setView("season");await refreshSaves();}catch(caught){setError(caught instanceof Error?caught.message:"Dynasty creation failed.");}finally{setBusy(false);}}
  function updateExhibition(patch:Partial<ExhibitionConfig>){if(patch.homeTeam&&patch.homeTeam!==exhibitionConfig.homeTeam){setExhibitionTeam(null);setExhibitionCandidates([]);}setExhibitionConfig((current)=>({...current,...patch}));}
  async function changeExhibitionSeason(side:"home"|"away",targetSeason:number){setBusy(true);setError("");if(side==="home"){setExhibitionTeam(null);setExhibitionCandidates([]);}try{const rows=await fetchTeamProfiles(targetSeason);const currentTeam=side==="home"?exhibitionConfig.homeTeam:exhibitionConfig.awayTeam;const profile=rows.find((row)=>row.team===currentTeam)??rows.slice().sort((left,right)=>modelRating(right)-modelRating(left))[0];if(side==="home"){setHomeExhibitionProfiles(rows);setExhibitionConfig((current)=>({...current,homeSeason:targetSeason,homeTeam:profile?.team??"",homeRating:profile?modelRating(profile):82}));}else{setAwayExhibitionProfiles(rows);setExhibitionConfig((current)=>({...current,awaySeason:targetSeason,awayTeam:profile?.team??"",awayRating:profile?modelRating(profile):82}));}}catch(caught){setError(caught instanceof Error?caught.message:"The exhibition directory could not be loaded.");}finally{setBusy(false);}}
  function swapExhibitionTeams(){setExhibitionTeam(null);setExhibitionCandidates([]);setHomeExhibitionProfiles(awayExhibitionProfiles);setAwayExhibitionProfiles(homeExhibitionProfiles);setExhibitionConfig((current)=>({...current,homeSeason:current.awaySeason,awaySeason:current.homeSeason,homeTeam:current.awayTeam,awayTeam:current.homeTeam,homeRating:current.awayRating,awayRating:current.homeRating}));}
  async function openExhibitionLineup(){setBusy(true);setError("");try{const profile=homeExhibitionProfiles.find((row)=>row.team===exhibitionConfig.homeTeam);if(!profile)throw new Error("Choose a home team before setting the depth chart.");const players=await fetchPlayers(exhibitionConfig.homeSeason,profile.team);if(!players.length)throw new Error(`The ${exhibitionConfig.homeSeason} ${profile.team} roster is not available.`);const team={...teamInputFromProfile(profile),teamId:`${profile.teamId??profile.team}-${exhibitionConfig.homeSeason}`,rating:exhibitionConfig.homeRating,roster:buildRoster(profile.team,players)} as ConfiguredExhibitionTeam;normalizeRosterSlots(team);setExhibitionTeam(team);setExhibitionCandidates(players);setView("quick-lineup");}catch(caught){setError(caught instanceof Error?caught.message:"The exhibition roster could not be loaded.");}finally{setBusy(false);}}
  function selectExhibitionStarter(unit:LineupUnit,slotIndex:number,playerId:string){if(!exhibitionTeam)return;const row=exhibitionCandidates.find((candidate)=>candidate.id===playerId);const slot=LINEUP_SLOTS[unit][slotIndex];if(!row||!slot)return;const next=structuredClone(exhibitionTeam);const players=[...rosterUnit(next,unit)];const current=players[slotIndex];const duplicateIndex=players.findIndex((player)=>player.id===playerId);if(duplicateIndex>=0&&duplicateIndex!==slotIndex&&current)players[duplicateIndex]=current;players[slotIndex]=starterFromRating(row,slot.position,next.name,current?.number??0);if(unit==="specialTeams")next.roster.specialTeams=players;else next.roster[unit]=players;normalizeRosterSlots(next);setExhibitionTeam(next);}
  async function startExhibition(){
    setBusy(true);setError("");
    try{
      if(exhibitionConfig.homeTeam===exhibitionConfig.awayTeam&&exhibitionConfig.homeSeason===exhibitionConfig.awaySeason)throw new Error("Choose different teams or different seasons.");
      const homeProfile=homeExhibitionProfiles.find((row)=>row.team===exhibitionConfig.homeTeam),awayProfile=awayExhibitionProfiles.find((row)=>row.team===exhibitionConfig.awayTeam);
      if(!homeProfile||!awayProfile)throw new Error("One of the selected teams is unavailable for its season.");
      const [homePlayers,awayPlayers]=await Promise.all([exhibitionTeam?Promise.resolve([]):fetchPlayers(exhibitionConfig.homeSeason,homeProfile.team),fetchPlayers(exhibitionConfig.awaySeason,awayProfile.team)]);
      if(!exhibitionTeam&&!homePlayers.length)throw new Error(`The ${exhibitionConfig.homeSeason} ${homeProfile.team} roster is not available.`);
      if(!awayPlayers.length)throw new Error(`The ${exhibitionConfig.awaySeason} ${awayProfile.team} roster is not available.`);
      const orderedHome=homeExhibitionProfiles.slice().sort((left,right)=>modelRating(right)-modelRating(left)),orderedAway=awayExhibitionProfiles.slice().sort((left,right)=>modelRating(right)-modelRating(left));
      const homeIndex=orderedHome.findIndex((row)=>row.team===homeProfile.team),awayIndex=orderedAway.findIndex((row)=>row.team===awayProfile.team);
      const homeTeam=exhibitionTeam?structuredClone(exhibitionTeam):({...teamInputFromProfile(homeProfile,homeIndex>=0&&homeIndex<25?homeIndex+1:null),teamId:`${homeProfile.teamId??homeProfile.team}-${exhibitionConfig.homeSeason}`,roster:buildRoster(homeProfile.team,homePlayers)} as ConfiguredExhibitionTeam);
      const awayTeam={...teamInputFromProfile(awayProfile,awayIndex>=0&&awayIndex<25?awayIndex+1:null),teamId:`${awayProfile.teamId??awayProfile.team}-${exhibitionConfig.awaySeason}`,roster:buildRoster(awayProfile.team,awayPlayers)} as ConfiguredExhibitionTeam;
      homeTeam.rating=exhibitionConfig.homeRating;awayTeam.rating=exhibitionConfig.awayRating;normalizeRosterSlots(homeTeam);normalizeRosterSlots(awayTeam);
      const response=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({homeTeam,awayTeam,opponentType:exhibitionConfig.opponentType,theme,difficulty:exhibitionConfig.difficulty,quarterLengthMinutes:exhibitionConfig.quarterLengthMinutes,userSeat:"home"})});
      const payload=await response.json() as {error?:string;roomCode?:string;homeToken?:string;awayToken?:string};
      if(!response.ok||!payload.roomCode||!payload.homeToken||!payload.awayToken)throw new Error(payload.error??"The exhibition game could not be created.");
      const session={code:payload.roomCode,seat:"home" as const,token:payload.homeToken};const ownUrl=new URL(window.location.href);ownUrl.searchParams.set("game",session.code);ownUrl.searchParams.set("seat",session.seat);ownUrl.searchParams.set("token",session.token);window.history.replaceState({},"",ownUrl.toString());
      let invite="";if(exhibitionConfig.opponentType==="human"){const awayUrl=new URL(window.location.href);awayUrl.searchParams.set("game",session.code);awayUrl.searchParams.set("seat","away");awayUrl.searchParams.set("token",payload.awayToken);invite=awayUrl.toString();window.localStorage.setItem(`gridiron-wire-invite-${session.code}`,invite);}
      setExhibitionSession(session);setExhibitionInvite(invite);setView("quick-game");
    }catch(caught){setError(caught instanceof Error?caught.message:"The exhibition game could not be created.");}finally{setBusy(false);}
  }
  async function joinExhibition(){setBusy(true);setError("");try{const response=await fetch(`/api/games/${encodeURIComponent(joinKey)}/join`,{method:"POST"});const payload=await response.json() as {error?:string;roomCode?:string;seat?:"away";token?:string};if(!response.ok||!payload.roomCode||!payload.seat||!payload.token)throw new Error(payload.error??"That private game could not be joined.");const session={code:payload.roomCode,seat:payload.seat,token:payload.token};const url=new URL(window.location.href);url.searchParams.set("game",session.code);url.searchParams.set("seat",session.seat);url.searchParams.set("token",session.token);window.history.replaceState({},"",url.toString());setExhibitionSession(session);setExhibitionInvite("");setView("quick-game");}catch(caught){setError(caught instanceof Error?caught.message:"That private game could not be joined.");}finally{setBusy(false);}}
  function closeExhibitionGame(){const url=new URL(window.location.href);url.searchParams.delete("game");url.searchParams.delete("seat");url.searchParams.delete("token");window.history.replaceState({},"",url.toString());setExhibitionSession(null);setExhibitionInvite("");setView(homeExhibitionProfiles.length?"quick":"menu");}
  async function persist(next:SeasonSave){const saved=await saveSeason({...next});setActive(saved);await refreshSaves();return saved;}
  async function changeActiveDifficulty(difficulty:GameDifficulty){if(!active)return;await persist({...active,difficulty});}
  async function changeActiveQuarterLength(quarterLengthMinutes:number){if(!active)return;await persist({...active,quarterLengthMinutes});}
  async function openLineup(){if(!active)return;setBusy(true);setError("");try{const players=await fetchPlayers(active.season,active.selectedTeam);if(!players.length)throw new Error(`The ${active.selectedTeam} roster is not available yet.`);const next=structuredClone(active);if(normalizeRosterSlots(next.teams[next.selectedTeam]))await persist(next);setRosterCandidates(players);setView("lineup");}catch(caught){setError(caught instanceof Error?caught.message:"The roster could not be loaded.");}finally{setBusy(false);}}
  async function selectStarter(unit:LineupUnit,slotIndex:number,playerId:string){if(!active)return;const row=rosterCandidates.find((candidate)=>candidate.id===playerId);const slot=LINEUP_SLOTS[unit][slotIndex];if(!row||!slot)return;setBusy(true);setError("");try{
    const next=structuredClone(active);const team=next.teams[next.selectedTeam];const players=[...rosterUnit(team,unit)];const current=players[slotIndex];const duplicateIndex=players.findIndex((player)=>player.id===playerId);
    if(duplicateIndex>=0&&duplicateIndex!==slotIndex&&current)players[duplicateIndex]=current;
    players[slotIndex]=starterFromRating(row,slot.position,team.name,current?.number??0);
    if(unit==="specialTeams")team.roster.specialTeams=players;else team.roster[unit]=players;normalizeRosterSlots(team);
    await persist(next);
  }catch(caught){setError(caught instanceof Error?caught.message:"The lineup change could not be saved.");}finally{setBusy(false);}}
  async function playGame(){if(!active)return;const game=currentUserGame(active);if(!game)return;setBusy(true);setError("");try{
    const next=structuredClone(active);for(const teamName of [game.homeTeam,game.awayTeam]){const team=next.teams[teamName];if(!team)throw new Error(`${teamName} is not available in the game directory.`);const looksSynthetic=team.roster.offense.some((player)=>player.name.startsWith(`${teamName} `));if(looksSynthetic){const players=await fetchPlayers(next.season,teamName);if(players.length)team.roster=buildRoster(teamName,players);}normalizeRosterSlots(team);}
    const userSeat=teamSideFor(game,next.selectedTeam);const homeTeam={...next.teams[game.homeTeam],ranking:rankingFor(next,game.homeTeam),record:recordLabel(next.records[game.homeTeam])};const awayTeam={...next.teams[game.awayTeam],ranking:rankingFor(next,game.awayTeam),record:recordLabel(next.records[game.awayTeam])};const response=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({homeTeam,awayTeam,opponentType:"cpu",theme,difficulty:next.difficulty,quarterLengthMinutes:next.quarterLengthMinutes,userSeat})});
    const payload=await response.json() as {error?:string;roomCode?:string;homeToken?:string;awayToken?:string};if(!response.ok||!payload.roomCode||!payload.homeToken||!payload.awayToken)throw new Error(payload.error??"The season game could not be created.");
    next.activeGame={gameId:game.id,code:payload.roomCode,seat:userSeat,token:userSeat==="home"?payload.homeToken:payload.awayToken};await persist(next);setView("game");
  }catch(caught){setError(caught instanceof Error?caught.message:"The season game could not be created.");}finally{setBusy(false);}}
  async function finishGame(state:GameState){if(!active?.activeGame)return;const next=applyUserGameResult(structuredClone(active),active.activeGame.gameId,state);setActive(next);setView("season");await persist(next);}
  async function simulateCurrent(){if(!active)return;setBusy(true);setError("");try{await persist(simulateUserGame(structuredClone(active)));}catch(caught){setError(caught instanceof Error?caught.message:"The game could not be simulated.");}finally{setBusy(false);}}
  async function advance(){if(!active)return;setBusy(true);const next=advanceSeason(structuredClone(active));await persist(recalculateSeason(next));setBusy(false);}
  async function nextDynastySeason(){if(!active||active.phase!=="complete"||active.season>=season)return;setBusy(true);setError("");try{
    const targetSeason=active.season+1;const data=await loadAuthoritative(targetSeason);const priorTeam=active.teams[active.selectedTeam];
    const profile=data.profiles.find((row)=>row.team===active.selectedTeam)??data.profiles.find((row)=>String(row.teamId??"")===String(priorTeam?.teamId??""));
    if(!profile)throw new Error(`${active.selectedTeam} is not available in the ${targetSeason} Harper+ team directory.`);
    const players=await fetchPlayers(targetSeason,profile.team);const fresh=createSeasonSave({season:targetSeason,selectedTeam:profile.team,difficulty:active.difficulty,quarterLengthMinutes:active.quarterLengthMinutes,profiles:data.profiles,schedule:data.schedule,rosters:{[profile.team]:players}});
    await persist(continueDynastySeason(active,fresh));setView("season");
  }catch(caught){setError(caught instanceof Error?caught.message:"The next dynasty season could not be loaded.");}finally{setBusy(false);}}
  async function remove(id:string){await deleteSeason(id);if(active?.id===id)setActive(null);await refreshSaves();}
  const session=useMemo<DownByDownSession|null>(()=>active?.activeGame?{code:active.activeGame.code,seat:active.activeGame.seat,token:active.activeGame.token}:null,[active]);
  if(view==="quick-game"&&exhibitionSession)return <div className={`down-by-down-app theme-${theme}`}><GridironWire initialSession={exhibitionSession} initialInvite={exhibitionInvite} defaultTheme={theme} onExit={closeExhibitionGame}/></div>;
  if(view==="game"&&session)return <div className={`down-by-down-app theme-${theme}`}><GridironWire initialSession={session} defaultTheme={theme} onFinal={(state)=>void finishGame(state)} onExit={()=>setView("season")}/></div>;
  return <div className={`season-mode-shell theme-${theme}${view === "menu" ? " harper-menu-screen" : ""}`}>
    <div className="season-global-toolbar"><span/><SeasonThemeToggle theme={theme} onToggle={toggleTheme}/></div>
    {view==="menu"?<SeasonMenu hasSaves={Boolean(saves.length)} onNew={()=>void openNew()} onLoad={()=>setView("load")} onQuick={()=>void openQuick()} onExit={onExit}/>:null}
    {view==="load"?<LoadGame saves={saves} onContinue={(save)=>{setActive(save);setView(save.activeGame?"game":"season");}} onDelete={(id)=>void remove(id)} onBack={()=>setView("menu")}/>:null}
    {view==="new"?<NewSeason maxSeason={season} selectedSeason={directorySeason} difficulty={newDifficulty} quarterLengthMinutes={newQuarterLength} profiles={profiles} loading={loading||busy} error={error} onBack={()=>setView("menu")} onSeasonChange={(targetSeason)=>void changeDirectorySeason(targetSeason)} onDifficultyChange={setNewDifficulty} onQuarterLengthChange={setNewQuarterLength} onStart={(team,targetSeason,difficulty,quarterLengthMinutes)=>void startSeason(team,targetSeason,difficulty,quarterLengthMinutes)}/>:null}
    {view==="quick"?<ExhibitionSetup maxSeason={season} config={exhibitionConfig} homeProfiles={homeExhibitionProfiles} awayProfiles={awayExhibitionProfiles} joinKey={joinKey} loading={loading} busy={busy} error={error} hasDepthChart={Boolean(exhibitionTeam)} onBack={()=>setView("menu")} onSeasonChange={(side,targetSeason)=>void changeExhibitionSeason(side,targetSeason)} onChange={updateExhibition} onSwap={swapExhibitionTeams} onJoinKeyChange={setJoinKey} onJoin={()=>void joinExhibition()} onDepthChart={()=>void openExhibitionLineup()} onStart={()=>void startExhibition()}/>:null}
    {view==="quick-lineup"&&exhibitionTeam?<DepthChartEditor team={exhibitionTeam} candidates={exhibitionCandidates} busy={busy} autosave={false} context="EXHIBITION SETUP" onBack={()=>setView("quick")} onSelect={selectExhibitionStarter}/>:null}
    {view==="season"&&active?<WeeklySnapshot save={active} maxSeason={season} busy={busy} onPlay={()=>void playGame()} onSimulate={()=>void simulateCurrent()} onAdvance={()=>void advance()} onNextSeason={()=>void nextDynastySeason()} onLineup={()=>void openLineup()} onMenu={()=>setView("menu")} onExport={()=>void exportSeasonPdf(active)} onDifficultyChange={(difficulty)=>void changeActiveDifficulty(difficulty)} onQuarterLengthChange={(minutes)=>void changeActiveQuarterLength(minutes)}/>:null}
    {view==="lineup"&&active?<LineupEditor save={active} candidates={rosterCandidates} busy={busy} onBack={()=>setView("season")} onSelect={(unit,slotIndex,playerId)=>void selectStarter(unit,slotIndex,playerId)}/>:null}
    {error&&(view==="season"||view==="lineup"||view==="quick-lineup")?<p className="season-status error">{error}</p>:null}
  </div>;
}
