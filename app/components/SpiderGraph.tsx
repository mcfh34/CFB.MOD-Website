"use client";
import {CopyImageButton} from "./CopyImageButton";
import {useEffect,useMemo,useState} from "react";
import {DEFAULT_SPIDER_METRICS,LOWER_IS_BETTER,ZERO_IS_BEST,SPIDER_METRICS,spiderPercentile,type SpiderMetricKey} from "../../lib/spiderMetrics";
import "../spider-graph.css";

type Player={id:string;name:string;team:string;season:number;attempts:number;color?:string;altColor?:string;logo?:string;metrics:Record<SpiderMetricKey,number|null>};
type Payload={status:string;message?:string;players?:Player[];cohortSize?:number;coverage?:"season-aggregate"|"play-by-play"};
const cache=new Map<number,Payload>();
const colors=["#800018","#009c80"];
const point=(angle:number,radius:number)=>({x:500+Math.sin(angle)*radius,y:410-Math.cos(angle)*radius});
const path=(angles:number[],radii:number[])=>angles.map((angle,index)=>{const p=point(angle,radii[index]);return `${index?"L":"M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;}).join(" ")+" Z";
function contrastColor(raw:string|undefined,index:number){if(!raw||!/^#[0-9a-f]{6}$/i.test(raw))return colors[index];const [r,g,b]=[1,3,5].map(n=>parseInt(raw.slice(n,n+2),16));return .2126*r+.7152*g+.0722*b>180?colors[index]:raw;}
function label(name:string){const parts=name.trim().split(/\s+/);return parts.length>1?`${parts[0][0]}. ${parts.slice(1).join(" ")}`:name;}

export function SpiderGraph({initialSeason,latestSeason}:{initialSeason:number;latestSeason:number}){
  const [seasonA,setSeasonA]=useState(initialSeason);
  const [seasonB,setSeasonB]=useState(initialSeason);
  const [compare,setCompare]=useState(false);
  const [playerA,setPlayerA]=useState("");const [playerB,setPlayerB]=useState("");
  const [preset,setPreset]=useState<"default"|"custom">("default");
  const [custom,setCustom]=useState<SpiderMetricKey[]>(DEFAULT_SPIDER_METRICS);
  const [data,setData]=useState<Record<number,Payload>>({});
  const [loading,setLoading]=useState<Record<number,boolean>>({});
  const [retry,setRetry]=useState(0);
  const years=Array.from({length:latestSeason-2013},(_,i)=>latestSeason-i);
  useEffect(()=>{
    let live=true;
    for(const year of [...new Set(compare?[seasonA,seasonB]:[seasonA])]){
      const previous=cache.get(year);
      if(previous){setData(current=>({...current,[year]:previous}));continue;}
      setLoading(current=>({...current,[year]:true}));
      fetch(`/api/player-spider?season=${year}&v=3`).then(async response=>await response.json() as Payload)
        .then(payload=>{if(!live)return;if(payload.status==="ready")cache.set(year,payload);setData(current=>({...current,[year]:payload}));})
        .catch(()=>{if(live)setData(current=>({...current,[year]:{status:"error",message:"Could not load QB plays."}}));})
        .finally(()=>{if(live)setLoading(current=>({...current,[year]:false}));});
    }
    return()=>{live=false;};
  },[seasonA,seasonB,compare,retry]);
  const firstPlayers=useMemo(()=>(data[seasonA]?.players??[]).slice().sort((a,b)=>a.name.localeCompare(b.name)),[data,seasonA]);
  const secondPlayers=useMemo(()=>(data[seasonB]?.players??[]).slice().sort((a,b)=>a.name.localeCompare(b.name)),[data,seasonB]);
  const first=firstPlayers.find(player=>`${player.team}:${player.id}`===playerA)??firstPlayers[0];
  const second=secondPlayers.find(player=>`${player.team}:${player.id}`===playerB&&`${seasonB}:${player.team}:${player.id}`!==`${seasonA}:${first?.team}:${first?.id}`)
    ??secondPlayers.find(player=>`${seasonB}:${player.team}:${player.id}`!==`${seasonA}:${first?.team}:${first?.id}`);
  const metrics=preset==="default"?DEFAULT_SPIDER_METRICS:custom;
  const plotted=compare?[first,second].filter((value):value is Player=>Boolean(value)):first?[first]:[];
  const plotColor=(player:Player,index:number)=>{
    const own=contrastColor(player.color,index);
    return index===1&&(player.team===plotted[0]?.team||own.toLowerCase()===contrastColor(plotted[0]?.color,0).toLowerCase())?"#d4a116":own;
  };
  const angles=metrics.map((_,index)=>2*Math.PI*index/metrics.length);
  const cohorts=compare&&seasonA!==seasonB?[data[seasonA]?.players??[],data[seasonB]?.players??[]]:[data[seasonA]?.players??[],data[seasonA]?.players??[]];
  const values=plotted.map((player,index)=>metrics.map(key=>{
    const value=player.metrics[key];
    if(value===null||!Number.isFinite(value))return null;
    if(ZERO_IS_BEST.has(key)&&value===0)return 100;
    return spiderPercentile(value,cohorts[index].map(candidate=>candidate.metrics[key]).filter((n):n is number=>n!==null&&Number.isFinite(n)),LOWER_IS_BETTER.has(key));
  }));
  const title=compare?"QB Comparison":first?`${label(first.name)} QB Play`:"QB Play";
  const subtitle=compare?`Percentiles among QBs with 100+ passes in each player’s season`:`Percentiles from QBs in ${seasonA} season with 100+ passes`;
  const busy=loading[seasonA]||(compare&&loading[seasonB]);
  const error=data[seasonA]?.status==="error"||(compare&&data[seasonB]?.status==="error");
  const archive=plotted.some(player=>data[player.season]?.coverage==="season-aggregate");
  const toggle=(key:SpiderMetricKey)=>setCustom(current=>current.includes(key)?current.length<=3?current:current.filter(value=>value!==key):SPIDER_METRICS.filter(option=>current.includes(option.key)||option.key===key).map(option=>option.key));
  return <section className="spider-panel">
    <div className="spider-controls">
      <CopyImageButton scope=".spider-panel" disabled={!!busy||!plotted.length||metrics.length<3}/>
      <label><span>SEASON</span><select value={seasonA} onChange={e=>{setSeasonA(Number(e.target.value));setPlayerA("");}}>{years.map(year=><option key={year}>{year}</option>)}</select></label>
      <label><span>QB</span><select aria-label="First quarterback" value={first?`${first.team}:${first.id}`:""} onChange={e=>setPlayerA(e.target.value)}>{firstPlayers.map(player=><option key={`${player.team}:${player.id}`} value={`${player.team}:${player.id}`}>{player.name} · {player.team}</option>)}</select></label>
      <label className="spider-compare"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/> COMPARE TWO QBS</label>
      {compare&&<><label><span>COMPARE SEASON</span><select value={seasonB} onChange={e=>{setSeasonB(Number(e.target.value));setPlayerB("");}}>{years.map(year=><option key={year}>{year}</option>)}</select></label>
        <label><span>SECOND QB</span><select aria-label="Second quarterback" value={second?`${second.team}:${second.id}`:""} onChange={e=>setPlayerB(e.target.value)}>{secondPlayers.filter(player=>`${seasonB}:${player.team}:${player.id}`!==`${seasonA}:${first?.team}:${first?.id}`).map(player=><option key={`${player.team}:${player.id}`} value={`${player.team}:${player.id}`}>{player.name} · {player.team}</option>)}</select></label></>}
      <label><span>STATS</span><select value={preset} onChange={e=>setPreset(e.target.value as "default"|"custom")}><option value="default">DEFAULT NINE</option><option value="custom">CUSTOM STATS</option></select></label>
      {preset==="custom"&&<details className="spider-metrics"><summary>SELECT STATS · {custom.length} SELECTED</summary><div>{SPIDER_METRICS.map(metric=><label key={metric.key} title={metric.detail}><input type="checkbox" checked={custom.includes(metric.key)} onChange={()=>toggle(metric.key)}/>{metric.label}</label>)}</div></details>}
    </div>
    {busy&&<p className="spider-status" role="status">Loading {compare&&seasonA!==seasonB?`${seasonA} and ${seasonB}`:seasonA} QB plays and percentiles…</p>}
    {error&&<p className="spider-status" role="alert">{data[seasonA]?.message??data[seasonB]?.message??"QB play data could not be loaded."} <button onClick={()=>{cache.delete(seasonA);cache.delete(seasonB);setRetry(n=>n+1);}}>Retry</button></p>}
    {archive&&<p className="spider-status spider-coverage">Historical seasons use CFBD season aggregates and archived player profiles. Axes without a historical value, including turnover EPA, sack rate, early-down EPA and explosive-play rate, stay unplotted. Historical late-down EPA uses the third-down split.</p>}
    {!busy&&!error&&!plotted.length&&<p className="spider-status">No qualifying QBs are available for this season.</p>}
    {!!plotted.length&&metrics.length>=3&&<div className="spider-frame"><svg className="spider-svg" viewBox="0 0 1000 800" role="img" aria-label={`${title}: ${metrics.map((metric,index)=>`${SPIDER_METRICS.find(option=>option.key===metric)?.label} ${plotted.map((player,i)=>`${label(player.name)} ${values[i]?.[index]===null?"unavailable":`${values[i]?.[index]}th percentile`}`).join("; ")}`).join(", ")}`}>
      <text x="500" y="55" textAnchor="middle" className="spider-title">{title}</text>
      <text x="500" y="91" textAnchor="middle" className="spider-subtitle">{subtitle}</text>
      {angles.map((angle,index)=>{const end=point(angle,252);return <line key={`spoke-${index}`} x1="500" y1="410" x2={end.x} y2={end.y} className="spider-spoke"/>;})}
      {[25,50,75,100].map(tick=><g key={tick}><path d={path(angles,angles.map(()=>tick*2.52))} className="spider-ring"/>{angles.map((angle,index)=>{const p=point(angle,tick*2.52);return <text key={index} x={p.x} y={p.y-3} textAnchor="middle" className="spider-tick">{tick}</text>;})}</g>)}
      {plotted.map((player,index)=>player.logo?<image key={`mark-${index}`} href={player.logo} x={compare?index?505:385:440} y="345" width="110" height="110" preserveAspectRatio="xMidYMid meet" opacity="0.17"/>:null)}
      {plotted.map((player,index)=>{const color=plotColor(player,index);const points=values[index]??[];const present=points.flatMap((value,i)=>value===null?[]:[{angle:angles[i],radius:value*2.52}]);return <g key={`${player.season}-${player.team}-${player.id}`} style={{color}}>{present.length>=3&&<path d={path(present.map(p=>p.angle),present.map(p=>p.radius))} className="spider-area" fill={color} stroke={color}/ >}{points.map((value,i)=>{if(value===null)return null;const p=point(angles[i],value*2.52);return <circle key={i} cx={p.x} cy={p.y} r="7.5" fill={color} className="spider-dot"><title>{player.season} {player.name}: {SPIDER_METRICS.find(metric=>metric.key===metrics[i])?.label} · {value}th percentile · {player.metrics[metrics[i]]?.toFixed(3)}</title></circle>;})}</g>;})}
      {angles.map((angle,index)=>{const p=point(angle,285);const x=p.x;return <text key={`label-${index}`} x={x} y={p.y} textAnchor={x<405?"end":x>595?"start":"middle"} dominantBaseline="middle" className="spider-axis">{SPIDER_METRICS.find(metric=>metric.key===metrics[index])?.label}</text>;})}
      {plotted.map((player,index)=>{const color=plotColor(player,index);const x=compare?index?635:315:500;return <g key={`legend-${index}`}><line x1={x-95} y1="745" x2={x-70} y2="745" stroke={color} strokeWidth="4"/><circle cx={x-82} cy="745" r="7" fill={color}/><text x={x-62} y="752" className="spider-legend">{player.season} {label(player.name)}</text></g>;})}
      <text x="500" y="786" textAnchor="middle" className="spider-credit">Harper+ | Data: College Football Data</text>
    </svg></div>}
    <details className="spider-method"><summary>Metric definitions and percentile group</summary><p>Each point ranks a QB against FBS quarterbacks with at least 100 charted pass attempts in that season. Cross-season comparison uses each player’s own season as the reference. A higher percentile always means better; sack and interception rates are inverted. CFBD PPA is its implementation of expected points added. Sacks count in sack rate but are excluded from attributed rushing EPA. The chart uses recorded play attribution and may differ from another provider’s EPA model.</p><ul>{metrics.map(key=><li key={key}><strong>{SPIDER_METRICS.find(option=>option.key===key)?.label}:</strong> {SPIDER_METRICS.find(option=>option.key===key)?.detail}</li>)}</ul></details>
  </section>;
}
