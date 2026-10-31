"use client";
/* eslint-disable @next/next/no-img-element -- shared local team artwork */
import { useEffect,useMemo,useRef,useState } from "react";
import {buildRoundRobinStandingsAsync,type RoundRobinProfile,type RoundRobinStanding} from "../../lib/roundRobin";
import {conferenceRatingSeries,conferenceRatingLayout,conferenceRatingProfiles} from "../../lib/conferenceRatingChart";
import {weekLabel} from "../../lib/weekLabels";
import {ConferenceStrengthView} from "./ConferenceStrengthView";
import "./ConferenceRatingChart.css";
import {copyConferenceRatingImage} from "../../lib/exportConferenceRatingPng";
export function ConferenceRatingChart({profiles,loading,season,week,effectiveWeek,controls}:{profiles:RoundRobinProfile[];loading:boolean;season:number;week:number;effectiveWeek?:number|null;controls:React.ReactNode}){
 const container=useRef<HTMLElement>(null);
 const [view,setView]=useState<"ranked"|"strength">("ranked");
 const [includeAdjustment,setIncludeAdjustment]=useState(false);
 const [calculation,setCalculation]=useState<{profiles:RoundRobinProfile[];includeAdjustment:boolean;rows:RoundRobinStanding[];error:string;done:boolean}>({profiles:[],includeAdjustment:false,rows:[],error:"",done:false});
 const [selection,setSelection]=useState<string[]|null>(null),[exporting,setExporting]=useState<"pdf"|"copy"|null>(null),[exportError,setExportError]=useState(""),[copied,setCopied]=useState(false);
 useEffect(()=>{const controller=new AbortController();setCalculation({profiles,includeAdjustment,rows:[],error:"",done:false});if(loading)return()=>controller.abort();buildRoundRobinStandingsAsync((includeAdjustment?profiles:conferenceRatingProfiles(profiles)),controller.signal).then(rows=>{if(!controller.signal.aborted)setCalculation({profiles,includeAdjustment,rows,error:"",done:true});}).catch(e=>{if(e.name!=="AbortError")setCalculation({profiles,includeAdjustment,rows:[],error:"Ratings could not be calculated. Try another week.",done:true});});return()=>controller.abort();},[profiles,loading,includeAdjustment]);
 const all=useMemo(()=>conferenceRatingSeries(calculation.profiles===profiles&&calculation.includeAdjustment===includeAdjustment?calculation.rows:[]),[calculation,profiles,includeAdjustment]);
 const defaults=season<=2023?["SEC","Big Ten","Big 12","ACC","Pac-12"]:["SEC","Big Ten","Big 12","ACC"];
 const selected=selection??defaults,series=all.filter(s=>selected.includes(s.conference)),layout=useMemo(()=>conferenceRatingLayout(series),[series]);
 const busy=loading||calculation.profiles!==profiles||calculation.includeAdjustment!==includeAdjustment||!calculation.done;
 const subtitle=`${season} · ${weekLabel(week)}${effectiveWeek!=null?` · Stats through ${weekLabel(effectiveWeek)}`:""} · H+ neutral ratings · ${includeAdjustment?"Conference adjustment included":"No conference adjustment"}`;
 const exportPdf=async()=>{setExporting("pdf");setExportError("");try{const {exportConferenceRatingPdf}=await import("../../lib/exportConferenceRatingPdf");await exportConferenceRatingPdf(series,subtitle,`harper-conference-${view}-${season}-${week}.pdf`,includeAdjustment,view);}catch{setExportError("PDF export failed. Please try again.");}finally{setExporting(null);}};
 const copyImage=async()=>{const svg=container.current?.querySelector<SVGSVGElement>(".crc-scroll svg");if(!svg)return;setExporting("copy");setExportError("");setCopied(false);try{await copyConferenceRatingImage(svg);setCopied(true);window.setTimeout(()=>setCopied(false),3000);}catch(e){setExportError(e instanceof Error?e.message:"Image could not be copied. Please try again.");}finally{setExporting(null);}};
 return <section ref={container} className="conference-rating-chart">
 <div className="crc-toolbar">{controls}<label className="crc-view">View<select value={view} onChange={e=>setView(e.target.value as "ranked"|"strength")}><option value="ranked">Rank within conference</option><option value="strength">Average strength bands</option></select></label><label className="crc-adjustment"><input type="checkbox" checked={includeAdjustment} onChange={event=>setIncludeAdjustment(event.target.checked)}/>Include conference adjustment</label><button type="button" onClick={exportPdf} disabled={busy||!series.length||!!exporting}>{exporting==="pdf"?"BUILDING PDF…":"EXPORT PDF"}</button><button type="button" onClick={copyImage} disabled={busy||!series.length||!!exporting}>{exporting==="copy"?"COPYING IMAGE…":copied?"COPIED":"COPY IMAGE"}</button></div>
 <fieldset className="crc-conferences"><legend>Conferences</legend><button type="button" onClick={()=>setSelection(all.map(s=>s.conference))}>All</button><button type="button" onClick={()=>setSelection(null)}>{season<=2023?"Power 5":"Power 4"}</button><button type="button" onClick={()=>setSelection(all.filter(s=>![...defaults,"Independent"].includes(s.conference)).map(s=>s.conference))}>{season<=2023?"Group of 5":"Group of 6"}</button>{all.map(s=><label key={s.conference}><input type="checkbox" checked={selected.includes(s.conference)} onChange={()=>setSelection(selected.includes(s.conference)?selected.filter(c=>c!==s.conference):[...selected,s.conference])}/><span className="crc-swatch" style={{background:s.color}}/>{s.conference}</label>)}</fieldset>
 {exportError&&<p role="alert">{exportError}</p>}
 {busy?<p role="status">Calculating H+ conference ratings…</p>:calculation.error?<p role="alert">{calculation.error}</p>:!series.length?<p>Select at least one conference with available ratings.</p>:<>
 {view==="strength"?<ConferenceStrengthView series={series} subtitle={subtitle}/>:<div className="crc-scroll" role="region" aria-label="Conference rating chart. Scroll horizontally on small screens." tabIndex={0}>
 <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-labelledby="crc-title crc-desc">
 <title id="crc-title">Conference Rating Comparison</title><desc id="crc-desc">Teams ranked within their conference by average projected neutral-field margin against the entire FBS field. Each line follows one conference; team logos mark the ratings. {subtitle}</desc>
 <rect width="1100" height="650" className="crc-background"/><image href="/harper-football.svg" x="24" y="22" width="66" height="48"/>
 <text x="550" y="42" textAnchor="middle" className="crc-title">Conference Rating Comparison</text><text x="550" y="66" textAnchor="middle" className="crc-subtitle">{subtitle}</text>
 {Array.from({length:(layout.high-layout.low)/5+1},(_,i)=>layout.low+i*5).map(value=><g key={value}><line x1={layout.left} x2={layout.right} y1={layout.y(value)} y2={layout.y(value)} className={value===0?"crc-zero":"crc-grid"}/><text x={layout.left-16} y={layout.y(value)+5} textAnchor="end" className="crc-tick">{value}</text></g>)}
 {Array.from({length:layout.maxRank},(_,i)=>i+1).map(rank=><g key={rank}><line x1={layout.x(rank)} x2={layout.x(rank)} y1={layout.top} y2={layout.bottom} className="crc-grid crc-vertical"/><text x={layout.x(rank)} y="590" textAnchor="middle" className="crc-tick">{rank}</text></g>)}
 <text x="550" y="619" textAnchor="middle" className="crc-axis">Rank Within Conference</text><text transform="translate(25 340) rotate(-90)" textAnchor="middle" className="crc-axis">H+ Power Rating (points)</text>
 {series.map(s=><polyline key={s.conference} points={s.teams.map(t=>`${layout.x(t.rank)},${layout.y(t.rating)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="3"/>)}
 {layout.points.map(p=><g key={p.team}><title>{p.team} · {p.conference} #{p.rank} · H+ {p.rating.toFixed(1)} pts</title><circle cx={p.x} cy={p.y} r="3" fill={p.color}/>{p.logo?<image href={p.logo} x={p.logoX-15} y={p.logoY-15} width="30" height="30"/>:<text x={p.logoX} y={p.logoY+4} textAnchor="middle" className="crc-tick">{p.team.slice(0,3)}</text>}</g>)}
 <text x="550" y="644" textAnchor="middle" className="crc-note">Rating: average projected margin vs the full FBS field · H+ neutral projections · Conference adjustment {includeAdjustment?"included":"excluded"}</text>
 </svg></div>}
 <div className="crc-legend">{series.map(s=><span key={s.conference}><i style={{background:s.color}}/>{s.conference} <small>({s.teams.length})</small></span>)}</div>
 <p className="crc-mobile-hint">Hover over a logo for its rating, or open View team ratings below. On phones, swipe the chart horizontally.</p>
 <details className="crc-data"><summary>View team ratings</summary><div>{series.map(s=><section key={s.conference}><h3>{s.conference}</h3><table><thead><tr><th>Rank</th><th>Team</th><th>H+ pts</th></tr></thead><tbody>{s.teams.map(t=><tr key={t.team}><td>{t.rank}</td><td>{t.team}</td><td>{t.rating.toFixed(1)}</td></tr>)}</tbody></table></section>)}</div></details>
 </>}
 </section>;
}
