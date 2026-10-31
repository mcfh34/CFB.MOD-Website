"use client";
import {visualizationDataUrl} from "../../lib/visualizationFreshness";
import {useVisualizationRefresh} from "./useVisualizationRefresh";
import {CopyImageButton} from "./CopyImageButton";
/* eslint-disable @next/next/no-img-element -- season-specific team logos */
import {useEffect,useMemo,useState} from 'react';
import {foodEdges,findFoodChains,type FoodGame,type FoodTeam} from '../../lib/foodChain';
import {canonicalNetSuccessConference} from '../../lib/netSuccessRate';
import {resolveTeamLogoAsset} from '../../lib/teamLogoAssets';
import {weekLabel} from '../../lib/weekLabels';
import {useCurrentWeek} from './CurrentWeekContext';
type Payload={teams:FoodTeam[];games:FoodGame[]};
export function FoodChainChart({initialSeason,initialWeek,latestSeason}:{initialSeason:number;initialWeek:number;latestSeason:number}){
  const current=useCurrentWeek();
  const [season,setSeason]=useState(initialSeason);
  const refreshRevision=useVisualizationRefresh(season===latestSeason);
  const [week,setWeek]=useState(initialWeek);
  const [conference,setConference]=useState('All conferences');
  const [team,setTeam]=useState('');
  const [size,setSize]=useState(6);
  const [mode,setMode]=useState<'cycle'|'chain'>('cycle');
  const [postseason,setPostseason]=useState(false);
  const [index,setIndex]=useState(0);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{season:number;data:Payload|null;error:string}>({season:0,data:null,error:''});
  useEffect(()=>{
    const controller=new AbortController();
    setResult({season:0,data:null,error:''});
    fetch(visualizationDataUrl(`/api/food-chain?season=${season}`),{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const payload=await response.json();if(!response.ok||!Array.isArray(payload.games)||!Array.isArray(payload.teams))throw new Error(payload.message??'Results unavailable.');return payload as Payload;
    }).then(data=>setResult({season,data,error:''})).catch(error=>{if(!controller.signal.aborted)setResult({season,data:null,error:String(error.message)});});
    return()=>controller.abort();
  },[season,retry,refreshRevision]);
  const data=result.season===season?result.data:null;
  const loading=result.season!==season;
  const conferences=useMemo(()=>['All conferences',...[...new Set((data?.teams??[]).map(row=>canonicalNetSuccessConference(row.conference)))].sort()],[data]);
  const teams=useMemo(()=>(data?.teams??[]).filter(row=>conference==='All conferences'||canonicalNetSuccessConference(row.conference)===conference),[data,conference]);
  const teamMap=useMemo(()=>new Map(teams.map(row=>[row.team,row])),[teams]);
  const edges=useMemo(()=>foodEdges(data?.games??[],new Set(teamMap.keys()),week,postseason),[data,teamMap,week,postseason]);
  const matches=useMemo(()=>findFoodChains(edges,size,mode,team),[edges,size,mode,team]);
  useEffect(()=>setIndex(0),[season,week,conference,size,mode,team,postseason]);
  const activeIndex=Math.min(index,Math.max(0,matches.chains.length-1));
  const chain=matches.chains[activeIndex];
  const center=550,ringRadius=300,nameRadius=430,scoreRadius=225;
  const positions=chain?.teams.map((name,i)=>{const angle=-Math.PI/2+i*2*Math.PI/chain.teams.length;return {name,angle,x:center+ringRadius*Math.cos(angle),y:center+ringRadius*Math.sin(angle),labelX:center+nameRadius*Math.cos(angle),labelY:center+nameRadius*Math.sin(angle)};})??[];
  const error=result.season===season?result.error:'';
  const period=week===16?'Full season':`Through ${weekLabel(week)}`;
  return <section className="food-chain-view" aria-label="Food Chain Chart">
    <div className="food-chain-controls">
      <label><span>SEASON</span><select aria-label="Food Chain season" value={season} onChange={e=>{setSeason(Number(e.target.value));setTeam('');setConference('All conferences');}}>{Array.from({length:latestSeason-2014+1},(_,i)=>latestSeason-i).map(value=><option key={value}>{value}</option>)}</select></label>
      <label><span>RESULTS THROUGH</span><select aria-label="Food Chain results through week" value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:17},(_,value)=><option key={value} value={value}>{value===16?'Full season':weekLabel(value)}{current?.season===season&&current.week===value?' · NOW':''}</option>)}</select></label>
      <label><span>CONFERENCE</span><select aria-label="Food Chain conference" value={conference} onChange={e=>{setConference(e.target.value);setTeam('');}}>{conferences.map(value=><option key={value}>{value}</option>)}</select></label>
      <label><span>TEAMS INVOLVED</span><select aria-label="Food Chain number of teams" value={size} onChange={e=>setSize(Number(e.target.value))}>{Array.from({length:10},(_,i)=>i+3).map(value=><option key={value} value={value}>{value} teams</option>)}</select></label>
      <label><span>INCLUDE TEAM</span><select aria-label="Food Chain required team" value={team} onChange={e=>setTeam(e.target.value)}><option value="">Any team</option>{teams.map(row=><option key={row.team}>{row.team}</option>)}</select></label>
      <label><span>CONNECTION</span><select aria-label="Food Chain connection type" value={mode} onChange={e=>setMode(e.target.value as 'cycle'|'chain')}><option value="cycle">Closed cycle</option><option value="chain">Open chain</option></select></label>
      <label className="food-chain-post"><input type="checkbox" checked={postseason} onChange={e=>setPostseason(e.target.checked)}/><span>Include postseason</span></label>
    </div>
    <div className="food-chain-panel" aria-busy={loading}>
      <header className="food-chain-heading"><div><span>HARPER+ · WINNER → OPPONENT</span><h2>Food Chain Chart</h2><p>{season} · {period}{postseason?' + postseason':''} · {conference}</p></div><div className="food-chain-pagination"><CopyImageButton scope=".food-chain-panel" disabled={loading||!chain}/><button aria-label="Previous food chain" disabled={activeIndex===0||!chain} onClick={()=>setIndex(activeIndex-1)}>←</button><span>{chain?`${activeIndex+1} / ${matches.chains.length}${matches.limited?'+':''}`:'0 matches'}</span><button aria-label="Next food chain" disabled={!chain||activeIndex>=matches.chains.length-1} onClick={()=>setIndex(activeIndex+1)}>→</button></div></header>
      {loading||error||!chain?<div className="food-chain-empty"><strong>{loading?'Finding connections…':error||`No ${size}-team ${mode==='cycle'?'closed cycles':'open chains'} in this selection.`}</strong><p>{loading?'Loading completed FBS game results.':error?'Results could not be loaded.':'Try fewer teams, another conference, or a later week.'}</p>{error?<button onClick={()=>setRetry(retry+1)}>Retry</button>:!loading&&mode==='cycle'?<button onClick={()=>setMode('chain')}>Show open chains</button>:null}</div>:<>
        <p className="food-chain-mobile-hint">Swipe across the chart to explore. Every result is listed below.</p>
        <div className="food-chain-canvas"><svg viewBox="0 0 1100 1100" role="img" aria-labelledby="food-chain-title food-chain-desc">
          <title id="food-chain-title">{season} {conference} {size}-team food {mode}</title><desc id="food-chain-desc">{chain.edges.map(edge=>`${edge.winner} beat ${edge.loser} ${edge.winnerPoints} to ${edge.loserPoints}`).join('. ')}{mode==='cycle'?'. The last team beat the first, completing the cycle.':'. This chain does not require a closing result.'}</desc>
          <defs>{chain.edges.map((edge,i)=><marker key={edge.gameId} id={`food-arrow-${i}`} markerWidth="18" markerHeight="18" refX="16" refY="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L18,9 L0,18 Z" fill={teamMap.get(edge.winner)?.color||'currentColor'}/></marker>)}</defs>
          <circle className="food-chain-guide" cx={center} cy={center} r={ringRadius}/>
          {chain.edges.map((edge,i)=>{
            const startAngle=positions[i].angle,step=2*Math.PI/positions.length;
            const gap=2*Math.asin(60/(2*ringRadius));
            const from=startAngle+gap,to=startAngle+step-gap;
            const path=`M ${center+ringRadius*Math.cos(from)} ${center+ringRadius*Math.sin(from)} A ${ringRadius} ${ringRadius} 0 0 1 ${center+ringRadius*Math.cos(to)} ${center+ringRadius*Math.sin(to)}`;
            const middle=startAngle+step/2,lx=center+scoreRadius*Math.cos(middle),ly=center+scoreRadius*Math.sin(middle);
            return <g key={edge.gameId}>
              <title>{edge.winner} beat {edge.loser} {edge.winnerPoints}–{edge.loserPoints}, {weekLabel(edge.week)}</title>
              <path className="food-chain-arrow-outline" d={path}/>
              <path className="food-chain-arrow" d={path} markerEnd={`url(#food-arrow-${i})`} style={{stroke:teamMap.get(edge.winner)?.color||undefined}}/>
              <rect className="food-chain-score-bg" x={lx-43} y={ly-22} width="86" height="44" rx="9"/>
              <text className="food-chain-beat" x={lx} y={ly-5} textAnchor="middle">BEAT</text>
              <text className="food-chain-score" x={lx} y={ly+14} textAnchor="middle">{edge.winnerPoints}–{edge.loserPoints}</text>
            </g>;
          })}
          <image href="/harper-football.svg" x="522" y="455" width="56" height="40"/>
          <text className="food-chain-center-label" x="550" y="523" textAnchor="middle">{conference==='All conferences'?'COLLEGE FOOTBALL':conference.toUpperCase()}</text>
          <text className="food-chain-center-title" x="550" y="555" textAnchor="middle">FOOD CHAIN</text>
          <text className="food-chain-center-sub" x="550" y="586" textAnchor="middle">{size} TEAMS · {mode==='cycle'?'CLOSED CYCLE':'OPEN CHAIN'}</text>
          <text className="food-chain-center-sub" x="550" y="611" textAnchor="middle">{season} · {period}</text>
          {positions.map(point=>{const row=teamMap.get(point.name)!,logo=resolveTeamLogoAsset(row.team)??row.logo;return <g key={point.name}><title>{row.team}</title><circle className="food-chain-node" cx={point.x} cy={point.y} r="48" style={{stroke:row.color||undefined}}/>{logo?<image href={logo} x={point.x-34} y={point.y-34} width="68" height="68" preserveAspectRatio="xMidYMid meet"/>:<text className="food-chain-abbreviation" x={point.x} y={point.y+6} textAnchor="middle">{row.abbreviation??row.team.slice(0,4)}</text>}<rect className="food-chain-name-bg" x={point.labelX-75} y={point.labelY-12} width="150" height="23" rx="6"/><text className="food-chain-team-name" x={point.labelX} y={point.labelY+4} textAnchor="middle">{row.team.length>18?(row.abbreviation??row.team.slice(0,17)):row.team}</text></g>;})}
        </svg></div>
        <div className="food-chain-results" aria-label="Food Chain game results">{chain.edges.map((edge,i)=><div key={edge.gameId}><b>{i+1}</b><span><strong>{edge.winner}</strong><small>beat {edge.loser} · {weekLabel(edge.week)}</small></span><strong>{edge.winnerPoints}–{edge.loserPoints}</strong></div>)}</div>
        <p className="food-chain-note">Completed FBS results · arrows point from winner to opponent. {mode==='cycle'?'Every team leads to the next, and the final win closes the circle.':'The chain ends at the final team; no closing win is implied.'}{matches.limited?' Search preview is bounded; narrow the filters to explore more connections.':''}</p>
      </>}
    </div>
  </section>;
}
