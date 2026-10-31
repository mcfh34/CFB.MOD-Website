'use client';
import {useEffect,useState} from 'react';
import {passingDirectionalMatchup,type PassingDirectionalProfile} from '../../lib/passingMatchup';
import {passLocations} from '../../lib/passing';
import {resolveTeamLogoAsset} from '../../lib/teamLogoAssets';
import {weekLabel} from '../../lib/weekLabels';
type Profile={team:string;week:number;logo?:string};
export function PassingDirectionScout({team,season,modelWeek,profiles,opponents}:{team:string;season:number;modelWeek:number;profiles:Profile[];opponents:string[]}){
 const [choice,setChoice]=useState('');
 const [view,setView]=useState<'adjusted'|'raw'>('adjusted');
 const key=`${season}:${modelWeek}`;
 const [data,setData]=useState<{key:string;rows:{team:string;directional:PassingDirectionalProfile}[];message?:string}>({key:'',rows:[]});
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/passing?${new URLSearchParams({view:'matchup',season:String(season),week:String(modelWeek),team,rev:'3'})}`,{signal:controller.signal}).then(async r=>{
   const payload=await r.json();setData({key,rows:Array.isArray(payload.rows)?payload.rows:[],message:payload.message});
  }).catch(e=>{if(e.name!=='AbortError')setData({key,rows:[],message:'Passing matchup data could not be loaded.'});});
  return()=>controller.abort();
 },[key,season,modelWeek,team]);
 const options=profiles.filter(p=>p.team!==team).sort((a,b)=>a.team.localeCompare(b.team));
 const name=options.some(p=>p.team===choice)?choice:opponents.find(n=>options.some(p=>p.team===n))??options[0]?.team??'';
 const rows=data.key===key?data.rows:[],own=rows.find(p=>p.team===team)?.directional,other=rows.find(p=>p.team===name)?.directional;
 const comparisons=[{offName:team,defName:name,off:own,def:other},{offName:name,defName:team,off:other,def:own}];
 const percent=(n:number)=>`${(n*100).toFixed(0)}%`,number=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(1):'—';
 const mark=(n:string)=>{const logo=resolveTeamLogoAsset(n)??profiles.find(p=>p.team===n)?.logo;return <span className="rush-team-label">{logo?<img src={logo} alt=""/>:null}<b>{n}</b></span>;};
 return <section className="rushing-direction-scout">
  <header><div><h3>Pass-location matchup</h3><small>{season} · Through {weekLabel(modelWeek)}</small></div><label>View<select aria-label="Passing direction view" value={view} onChange={e=>setView(e.target.value as 'adjusted'|'raw')}><option value="adjusted">Opponent adjusted</option><option value="raw">Raw stats</option></select></label><label>Opponent<select value={name} onChange={e=>setChoice(e.target.value)}>{options.map(p=><option key={p.team}>{p.team}</option>)}</select></label></header>
  {data.key!==key?<p role="status">Loading passing matchup…</p>:data.message?<p role="status">{data.message}</p>:null}
  <div className="rushing-table-wrap rushing-matchup-table"><table><thead>{view==='raw'?<tr><th>Location</th><th>OFF YPA</th><th>DEF YPA allowed</th><th>OFF / DEF attempts</th><th>OFF usage</th></tr>:<tr><th>Location</th><th>OFF YPA</th><th>DEF YPA allowed</th><th>OFF vs prior DEF</th><th>DEF allowed vs prior OFF</th><th>Matched / total attempts</th><th>OFF usage</th><th>Net edge</th><th>Advantage</th></tr>}</thead>
   {comparisons.map(({offName,defName,off,def})=>{const result=passingDirectionalMatchup(off,def);return <tbody key={offName}>
    <tr className="rush-matchup-group"><th colSpan={view==='raw'?5:9}><span className="rush-matchup-heading">{mark(offName)}<span className="rush-unit-label">OFF vs DEF</span>{mark(defName)}<span className="rush-matchup-impact">{view==='raw'?'Observed FBS production':result.available?`Usage-weighted delta ${result.multiplier>=1?'+':''}${((result.multiplier-1)*100).toFixed(1)}% · Coverage ${percent(result.offCoverage)} / ${percent(result.defCoverage)}`:'Under 3 attempts / no baseline'}</span></span></th></tr>
    {passLocations.map(location=>{const lane=result.lanes.find(l=>l.lane===location),o=off?.offense[location],d=def?.defense[location],edge=lane?.tested?lane.edgePercent:null,tone=edge===null?'':edge>5?'good':edge< -5?'bad':'average',signed=(value:number|null|undefined)=>value==null?'—':`${value>0?'+':''}${value.toFixed(1)}%`;return <tr key={location}><th>{location}</th><td>{number(o?.ypa)}</td><td>{number(d?.ypa)}</td>{view==='raw'?<><td>{o?.attempts??0} / {d?.attempts??0}</td><td>{lane?percent(lane.share):'—'}</td></>:<><td>{signed(lane?.offRelative)}</td><td>{signed(lane?.defRelative)}</td><td title="Matched to past opponents' other FBS games / total attempts">{o?.comparedOwnAttempts??0}/{o?.attempts??0} · {d?.comparedOwnAttempts??0}/{d?.attempts??0}</td><td>{lane?percent(lane.share):'—'}</td><td className={tone}>{edge===null?'—':signed(edge)}</td><td className={tone}>{edge===null?'Under 3 / no baseline':edge>5?mark(offName):edge< -5?mark(defName):'Even'}</td></>}</tr>;})}
   </tbody>;})}
  </table></div>
  <p className="rushing-note">{view==='raw'?'FBS games only through the cutoff. YPA shows observed offensive output and observed defensive allowance; attempts are the raw sample counts. Unknown pass locations stay unknown.':'FBS games only through the cutoff. OFF % compares YPA to what prior opponents usually allowed; DEF % is negative when fewer yards were allowed than prior opponents usually gained. Net edge = OFF % + DEF %. Each opponent baseline excludes the head-to-head game. At least 3 compared attempts are needed on each side of a location; smaller samples remain untested. Qualified samples are still weighted toward 0.'} Short counts throws whose CFBD play description is tagged “short left,” “short middle,” or “short right”; deep counts its “deep” tag. CFBD has not specified a numeric air-yard cutoff for those tags, so these are not exact 0–9, 10–19, and 20+ bins. This diagnostic does not change projected scores.</p>
 </section>;
}
