"use client";
import { useEffect, useState } from "react";
import { passingMetrics, passingObject, passingYpa, passLocations, type PassingRow, type PassingView } from "../../lib/passing";
import {rushingNumber as passingNumber} from "../../lib/rushing";
import { PassingDirectionScout } from "./PassingDirectionScout";

import { filterPassingRows, passingPlayerOptions } from "../../lib/passing";
import { weekLabel } from "../../lib/weekLabels";

const views: [PassingView, string][] = [["team-season", "Team season"], ["player-season", "Player season"], ["team-games", "Team games"], ["player-games", "Player games"], ["plays", "Passing plays"]];
type Game = { gameId: string; completed?: boolean | number; homeTeam: string; awayTeam: string; week: number };
function Production({ row }: { row: PassingRow }) {
  const directions = passingObject(row.locations);
  row={...row,yardsPerAttempt:passingYpa(row)};
  return <>
    <dl className="rushing-metrics">{passingMetrics.filter(([key]) => key in row).map(([key, label, percent]) => <div key={key}><dt>{label}</dt><dd>{passingNumber(row[key], percent)}</dd></div>)}</dl>
    {Object.keys(directions).length ? <div className="rushing-table-wrap"><table><caption>Pass-location breakdown</caption><thead><tr><th>Location</th><th>Attempts</th><th>Completion</th><th>Yards / attempt</th><th>ADOT</th><th>Success</th><th>PPA / play</th></tr></thead><tbody>{[...passLocations,"unknown"].map((direction) => {
      const stats = passingObject(directions[direction]);
      return <tr key={direction}><th>{direction}</th><td>{passingNumber(stats.attempts)}</td><td>{passingNumber(stats.completionRate,true)}</td><td>{passingNumber(passingYpa(stats))}</td><td>{passingNumber(stats.averageDepthOfTarget)}</td><td>{passingNumber(stats.successRate, true)}</td><td>{passingNumber(stats.ppa)}</td></tr>;
    })}</tbody></table></div> : null}
  </>;
}

export function PassingPanel({ season, team, games,profiles=[],modelWeek=0 }: { season: number; team: string; games: Game[];profiles?:{team:string;week:number;logo?:string}[];modelWeek?:number }) {
  const [view, setView] = useState<PassingView>("team-season");
  const [gameId, setGameId] = useState("");
  const [playerId,setPlayerId]=useState("");
  const [direction,setDirection]=useState("");
  const [result, setResult] = useState<{ key: string; rows: PassingRow[]; message?: string; updatedAt?: string }>({ key: "", rows: [] });
  const [visibleCount, setVisibleCount] = useState(25);
  const completed = games.filter((game) => game.completed);
  const selectedGame = completed.some((game) => game.gameId === gameId) ? gameId : completed.at(-1)?.gameId ?? "";
  const key = `${season}:${team}:${view}:${view === "plays" ? selectedGame : ""}`;
  useEffect(() => {
    if (view === "plays" && !selectedGame) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ season: String(season), team, view, ...(view === "plays" ? { gameId: selectedGame } : {}) });
    fetch(`/api/passing?${params}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      setResult({ key, rows: Array.isArray(payload.rows) ? payload.rows : [], message: payload.message, updatedAt: payload.updatedAt });
    }).catch((error) => { if (error.name !== "AbortError") setResult({ key, rows: [], message: "Passing data could not be loaded. Try another view or return shortly." }); });
    return () => controller.abort();
  }, [key, season, team, view, selectedGame]);
  const ready = result.key === key;
  const playerView=view.startsWith("player")||view==="plays";
  const gameView=view.endsWith("games")||view==="plays";
  const activeGame=view==="plays"?selectedGame:gameView?gameId:"";
  const gameRows=filterPassingRows(ready?result.rows:[],{game:activeGame});
  const players=passingPlayerOptions(gameRows);
  const activePlayer=playerView&&players.some(p=>p.key===playerId)?playerId:"";
  const filteredRows=filterPassingRows(ready?result.rows:[],{game:activeGame,player:activePlayer,location:view==="plays"?direction:""});
  return <section className="rushing-panel" aria-label={`${team} passing analysis`}>
    <header><h2>Passing analysis</h2><p>{season} · Latest CFBD season data, independent of the model’s selected week.</p></header>
    <PassingDirectionScout season={season} team={team} profiles={profiles} modelWeek={modelWeek} opponents={[...games.filter(g=>!g.completed).map(g=>g.homeTeam===team?g.awayTeam:g.homeTeam),...games.map(g=>g.homeTeam===team?g.awayTeam:g.homeTeam)]}/>
    <div className="rushing-controls"><label>View<select value={view} onChange={(event) => { setView(event.target.value as PassingView);setPlayerId("");setGameId("");setDirection(""); setVisibleCount(25); }}>{views.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {gameView ? <label>Game<select value={view==="plays"?selectedGame:gameId} onChange={(event) => { setGameId(event.target.value);setPlayerId(""); setVisibleCount(25); }}>
        {view!=="plays"?<option value="">All completed games</option>:null}
        {completed.map((game) => <option key={game.gameId} value={game.gameId}>{weekLabel(game.week)} · {game.awayTeam} at {game.homeTeam}</option>)}
      </select></label> : null}
      {playerView?<label>{view==="plays"?"Passer":"Player"}<select value={activePlayer} disabled={!ready} onChange={e=>{setPlayerId(e.target.value);setVisibleCount(25);}}><option value="">All players</option>{players.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label>:null}
      {view==="plays"?<label>Location<select value={direction} onChange={e=>{setDirection(e.target.value);setVisibleCount(25);}}><option value="">All locations</option>{[...passLocations,"unknown"].map(d=><option key={d}>{d}</option>)}</select></label>:null}
    </div>
    <p className="rushing-note">Six zones combine short/deep with left/middle/right. Unknown locations remain unknown. Location analysis excludes spikes, intentional grounding and invalid parses; overall production can include those attempts; “—” means unavailable.</p>
    {view === "plays" && !selectedGame ? <p>No completed games are available yet.</p> : !ready ? <p role="status">Loading passing data…</p> : <>
      {result.message ? <p role="status">{result.message}</p> : null}
      {result.updatedAt ? <p className="rushing-note">Retrieved {new Date(result.updatedAt).toLocaleString()} · {filteredRows.length} of {result.rows.length} records</p> : null}
      {filteredRows.slice(0, visibleCount).map((row, index) => <article className="rushing-record" key={`${key}:${String(row.playId ?? row.playerId ?? row.team ?? "row")}:${String(row.gameId ?? index)}`}>
        <h3>{String(row.player ?? row.passer ?? row.team ?? row.offense ?? team)}{row.opponent ? ` vs ${String(row.opponent)}` : ""}{row.week !== undefined ? ` · ${weekLabel(String(row.week))}` : ""}</h3>
        {view === "plays" ? <><p>{String(row.playText ?? "No play description available")}</p><dl className="rushing-metrics">{[["Period", row.period], ["Down", row.down], ["Distance", row.distance], ["Yards", row.totalYards], ["PPA", row.ppa]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{passingNumber(value)}</dd></div>)}</dl><p className="rushing-note">{String(row.offense)} vs {String(row.defense)} · Location: {String(row.passLocation ?? "unknown")} · {String(row.outcome??"Unknown outcome")} · Air yards: {passingNumber(row.airYards)} · YAC: {passingNumber(row.yardsAfterCatch)} · Location eligible: {row.locationAnalysisEligible?"yes":"no"}{row.isSpike?" · Spike":""}{row.isThrowaway?" · Throwaway":""}</p></> : view.startsWith("team") ? <div className="rushing-units"><section><h4>Offense</h4><Production row={passingObject(row.offense)} /></section><section><h4>Defense · Allowed</h4><Production row={passingObject(row.defense)} /></section></div> : <Production row={row} />}
      </article>)}
      {!filteredRows.length&&!result.message?<p role="status">No passing records match these selections.</p>:null}
      {filteredRows.length > visibleCount ? <button type="button" onClick={() => setVisibleCount((count) => count + 25)}>Show more ({filteredRows.length - visibleCount} remaining)</button> : null}
    </>}
  </section>;
}
