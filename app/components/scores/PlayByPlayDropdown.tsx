"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock3, ListTree, MoveRight } from "lucide-react";
import type { PlayByPlayDrive, PlayByPlayPlay, SackAccounting } from "../../../lib/playByPlay";
import { resolveTeamLogoAsset } from "../../../lib/teamLogoAssets";

type PlayByPlayGame = {
  gameId: string;
  season: number;
  completed: boolean | number;
  homeTeam: string;
  awayTeam: string;
};

type PlayByPlayPayload = {
  status: "ready" | "partial" | "pending" | "invalid" | "unavailable";
  gameId: string;
  playCount?: number;
  driveCount?: number;
  drives: PlayByPlayDrive[];
  accounting: SackAccounting[];
  message?: string | null;
};

function periodLabel(period: number) {
  if (period <= 0) return "—";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

function clockLabel(clock: PlayByPlayPlay["clock"]) {
  if (clock.minutes === null || clock.seconds === null) return "—";
  return `${Math.max(0, clock.minutes)}:${Math.max(0, clock.seconds).toString().padStart(2, "0")}`;
}

function downLabel(down: number, distance: number) {
  if (!down) return "Special teams";
  const suffix = down === 1 ? "st" : down === 2 ? "nd" : down === 3 ? "rd" : "th";
  return `${down}${suffix} & ${distance}`;
}

function numberLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function signedYards(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} yds`;
}

function lossLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(Math.round(value));
  return rounded ? `−${rounded.toLocaleString()}` : "0";
}

function scoreLabel(drive: Pick<PlayByPlayDrive, "awayScore" | "homeScore">, awayCode: string, homeCode: string) {
  if (drive.awayScore === null || drive.homeScore === null) return "Score unavailable";
  return `${awayCode} ${drive.awayScore} · ${homeCode} ${drive.homeScore}`;
}

function driveTone(drive: PlayByPlayDrive) {
  const result = drive.result.toLowerCase();
  if (/touchdown|field goal|score/.test(result)) return "score";
  if (/interception|fumble|downs|safety/.test(result)) return "turnover";
  if (/punt/.test(result)) return "punt";
  return "neutral";
}

function SackAccountingCard({ row, teamCode }: { row: SackAccounting; teamCode: (team: string) => string }) {
  const source = row.source === "play-by-play" ? "ITEMIZED PLAY FEED" : row.source === "box-score" ? "BOX-SCORE FALLBACK" : "NO SACKS RECORDED";
  return <article className="score-pbp-accounting-card">
    <header>
      <span><small>OFFENSE</small><strong>{teamCode(row.team)}</strong></span>
      <b>{numberLabel(row.sacksAllowed)} SACKS <i>·</i> {lossLabel(row.sackYards)} YARDS</b>
    </header>
    <div className="score-pbp-transfer">
      <div className="score-pbp-transfer-line rushing">
        <span><small>NCAA RUSHING</small><strong>{numberLabel(row.officialRushingYards)}</strong><em>{numberLabel(row.officialRushingAttempts)} recorded attempts</em></span>
        <i><MoveRight aria-hidden="true"/><b>REMOVE {lossLabel(row.sackYards)}</b><small>SACK ENTRY</small></i>
        <span><small>HARPER+ RUSHING</small><strong>{numberLabel(row.harperRushingYards)}</strong><em>{numberLabel(row.harperRushingAttempts)} true carries</em></span>
      </div>
      <div className="score-pbp-transfer-line passing">
        <span><small>NCAA PASSING</small><strong>{numberLabel(row.officialPassingYards)}</strong><em>{numberLabel(row.officialPassAttempts)} throws</em></span>
        <i><MoveRight aria-hidden="true"/><b>CHARGE {lossLabel(row.sackYards)}</b><small>TO PASSING</small></i>
        <span><small>HARPER+ NET PASS</small><strong>{numberLabel(row.harperNetPassingYards)}</strong><em>{numberLabel(row.harperDropbacks)} dropbacks</em></span>
      </div>
    </div>
    <footer><span>Total offense does not change. Only the rush/pass accounting moves.</span><small>{source}</small></footer>
  </article>;
}

function PlayCard({ play, number, awayCode, homeCode }: { play: PlayByPlayPlay; number: number; awayCode: string; homeCode: string }) {
  const hasScore = play.scoring && play.awayScore !== null && play.homeScore !== null;
  return <article className={`score-pbp-play ${play.isSack ? "sack" : ""} ${play.scoring ? "scoring" : ""}`}>
    <span className="score-pbp-play-index" aria-hidden="true"><b>{number}</b><i/></span>
    <div className="score-pbp-play-content">
      <header>
        <span><Clock3 aria-hidden="true"/>{periodLabel(play.period)} · {clockLabel(play.clock)}</span>
        <strong>{downLabel(play.down, play.distance)}</strong>
        <i>{signedYards(play.yardsGained)}</i>
      </header>
      <p>{play.playText}</p>
      {play.isSack || hasScore ? <footer>
        {play.isSack ? <b className="sack-tag">SACK LOSS → PASSING · {lossLabel(play.sackYards)} YDS</b> : null}
        {hasScore ? <small>{awayCode} {play.awayScore} · {homeCode} {play.homeScore}</small> : null}
      </footer> : null}
    </div>
  </article>;
}

function DriveTile({ drive, selected, panelId, awayCode, homeCode, teamCode, onSelect }: {
  drive: PlayByPlayDrive;
  selected: boolean;
  panelId: string;
  awayCode: string;
  homeCode: string;
  teamCode: (team: string) => string;
  onSelect: () => void;
}) {
  const logo=resolveTeamLogoAsset(drive.offense);
  return <button type="button" className="score-pbp-drive-tile" data-tone={driveTone(drive)} aria-expanded={selected} aria-controls={panelId} onClick={onSelect}>
    <span className="score-pbp-drive-logo">{logo?<img src={logo} alt=""/>:<b>{teamCode(drive.offense).slice(0,2)}</b>}</span>
    <span className="score-pbp-drive-copy"><small>DRIVE {String(drive.number).padStart(2, "0")} · {periodLabel(drive.period)} {clockLabel(drive.clock)}</small><strong>{teamCode(drive.offense)} · {drive.result}</strong><em>{drive.playCount} plays · {Math.round(drive.yards)} yards</em></span>
    <span className="score-pbp-drive-score">{scoreLabel(drive, awayCode, homeCode)}</span>
    <ChevronDown className="score-pbp-drive-chevron" aria-hidden="true"/>
  </button>;
}

export function PlayByPlayDropdown({ row, teamCode }: { row: PlayByPlayGame; teamCode: (team: string) => string }) {
  const completed = Boolean(row.completed);
  const [expanded, setExpanded] = useState(false);
  const [quarter, setQuarter] = useState<number | "ALL">("ALL");
  const [selectedDriveId, setSelectedDriveId] = useState("");
  const [data, setData] = useState<PlayByPlayPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const panelId = `score-pbp-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    requestRef.current?.abort();
    setData(null);setExpanded(false);setLoading(false);setError("");setQuarter("ALL");setSelectedDriveId("");
    return () => requestRef.current?.abort();
  }, [row.gameId,row.season]);

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || !completed || data || loading) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    fetch(`/api/play-by-play?season=${encodeURIComponent(row.season)}&gameId=${encodeURIComponent(row.gameId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as PlayByPlayPayload & { message?: string };
        if (!response.ok && response.status !== 409) throw new Error(payload.message || "Play-by-play is unavailable.");
        if(controller.signal.aborted)return;
        setData(payload);
        setSelectedDriveId(payload.drives[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Play-by-play is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        if (requestRef.current === controller) requestRef.current = null;
      });
  };

  const totalSacks = useMemo(() => data?.accounting.reduce((sum, team) => sum + team.sacksAllowed, 0) ?? 0, [data]);
  const summary = !completed
    ? "Available after final"
    : data
      ? `${data.driveCount ?? data.drives.length} drives · ${totalSacks} sacks`
      : expanded ? "Loading drives" : "Drives, plays and sack yards";
  const awayCode = teamCode(row.awayTeam);
  const homeCode = teamCode(row.homeTeam);
  const playCount = data?.playCount ?? data?.drives.reduce((sum, drive) => sum + drive.playCount, 0) ?? 0;
  const driveCount = data?.driveCount ?? data?.drives.length ?? 0;
  const periods = useMemo(() => [...new Set((data?.drives ?? []).map((drive) => drive.period).filter((period) => period > 0))].sort((a, b) => a - b), [data]);
  const visibleDrives = useMemo(() => (data?.drives ?? []).filter((drive) => quarter === "ALL" || drive.period === quarter), [data, quarter]);

  return <section className={`score-play-by-play ${expanded ? "open" : ""} ${completed ? "" : "unavailable"}`}>
    <button type="button" className="score-pbp-toggle" aria-expanded={expanded} aria-controls={panelId} disabled={!completed} onClick={toggleExpanded}>
      <span className="score-pbp-toggle-icon"><ListTree aria-hidden="true"/></span>
      <span><small>GAME FLOW</small><b>PLAY BY PLAY</b><em>{summary}</em></span>
      <ChevronDown className="score-pbp-toggle-chevron" aria-hidden="true"/>
    </button>
    {expanded ? <div className="score-pbp-body" id={panelId} aria-live="polite">
      {loading ? <div className="score-pbp-loading" aria-label="Loading play-by-play"><span/><span/><span/></div> : error ? <p className="score-pbp-status error">{error}</p> : data ? <>
        <header className="score-pbp-overview">
          <div><small>DRIVE SUMMARY</small><strong>{awayCode} <i>at</i> {homeCode}</strong><p>Open a drive to see its plays. Sack losses count against passing.</p></div>
          <dl><div><dt>PLAYS</dt><dd>{playCount}</dd></div><div><dt>DRIVES</dt><dd>{driveCount}</dd></div><div><dt>SACKS</dt><dd>{totalSacks}</dd></div></dl>
        </header>

        {data.drives.length ? <div className="score-pbp-workspace">
          <section className="score-pbp-drive-browser">
            <header><div><small>POSSESSIONS</small><strong>DRIVES</strong></div><span>{visibleDrives.length} shown</span></header>
            <div className="score-pbp-quarter-filter" role="group" aria-label="Filter drives by quarter">
              <button type="button" aria-pressed={quarter === "ALL"} onClick={() => setQuarter("ALL")}>ALL</button>
              {periods.map((period) => <button type="button" aria-pressed={quarter === period} onClick={() => setQuarter(period)} key={period}>{periodLabel(period)}</button>)}
            </div>
            <div className="score-pbp-drive-list">{visibleDrives.map((drive,index) => {
              const selected=drive.id===selectedDriveId;
              const drivePanelId=`${panelId}-drive-${index}`;
              return <article className="score-pbp-drive" key={drive.id}>
                <DriveTile drive={drive} selected={selected} panelId={drivePanelId} awayCode={awayCode} homeCode={homeCode} teamCode={teamCode} onSelect={()=>setSelectedDriveId(selected?"":drive.id)}/>
                {selected?<div className="score-pbp-inline-plays" id={drivePanelId} role="region" aria-label={`Drive ${drive.number} plays`}>
                  {drive.plays.length?drive.plays.map((play,playIndex)=><PlayCard key={play.id} play={play} number={playIndex+1} awayCode={awayCode} homeCode={homeCode}/>):<p className="score-pbp-status">Play detail is unavailable for this drive.</p>}
                </div>:null}
              </article>;
            })}</div>
          </section>
        </div> : <p className="score-pbp-status">An itemized drive feed is not available for this final.</p>}
        <details className="score-pbp-accounting-disclosure">
          <summary><span><b>SACK YARD ADJUSTMENT</b><small>Move sack losses from rushing to passing</small></span><ChevronDown aria-hidden="true"/></summary>
          <section className="score-pbp-accounting" aria-label="Sack yard reclassification">
            <header><div><b>SACK YARD RECLASSIFICATION</b><small>The official total stays intact while rushing and passing efficiency use the correct football context.</small></div><span>RUSH → PASS</span></header>
            <div className="score-pbp-accounting-grid">{data.accounting.map((team) => <SackAccountingCard key={team.team} row={team} teamCode={teamCode}/>)}</div>
          </section>
        </details>
        {data.message ? <p className="score-pbp-note">{data.message}</p> : null}
      </> : null}
    </div> : null}
  </section>;
}
