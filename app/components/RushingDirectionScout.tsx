'use client';
import {useEffect,useState} from 'react';
import {directionalMatchup,rushingRelativeMatchup,runLanes,type DirectionalProfile} from '../../lib/rushingMatchup';
import {resolveTeamLogoAsset} from '../../lib/teamLogoAssets';
import {weekLabel} from '../../lib/weekLabels';
type Profile={team:string;week:number;logo?:string;advancedProfile?:{directional?:DirectionalProfile}|null};
export function RushingDirectionScout({team,season,modelWeek,profiles,opponents}:{team:string;season:number;modelWeek:number;profiles:Profile[];opponents:string[]}){
 const [choice,setChoice]=useState('');
 const [view,setView]=useState<'adjusted'|'raw'>('adjusted');
 const key=`${season}:${modelWeek}`;
 const [data,setData]=useState<{key:string;rows:{team:string;directional:DirectionalProfile}[];message?:string}>({key:'',rows:[]});
 useEffect(()=>{
  if(season!==2026)return;
  const controller=new AbortController();
  fetch(`/api/rushing?${new URLSearchParams({view:'matchup',season:String(season),week:String(modelWeek),team,rev:'1'})}`,{signal:controller.signal}).then(async r=>{
   const payload=await r.json();setData({key,rows:Array.isArray(payload.rows)?payload.rows:[],message:payload.message});
  }).catch(e=>{if(e.name!=='AbortError')setData({key,rows:[],message:'Rushing direction data could not be loaded.'});});
  return()=>controller.abort();
 },[key,season,modelWeek,team]);
 const options=profiles.filter(p=>p.team!==team).sort((a,b)=>a.team.localeCompare(b.team));
 const name=options.some(p=>p.team===choice)?choice:opponents.find(n=>options.some(p=>p.team===n))??options[0]?.team??'';
 const rows=data.key===key?data.rows:[];
 const own=rows.find(p=>p.team===team)?.directional,opponent=rows.find(p=>p.team===name)?.directional;
 const comparisons=[{offName:team,defName:name,off:own,def:opponent},{offName:name,defName:team,off:opponent,def:own}];
 const percent=(v:number)=>`${(v*100).toFixed(0)}%`;
 const signed=(v:number|null|undefined)=>v==null?'—':`${v>0?'+':''}${v.toFixed(1)}%`;
 const ypc=(v:number|null|undefined)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(1):'—';
 const mark=(n:string)=>{const logo=resolveTeamLogoAsset(n)??profiles.find(p=>p.team===n)?.logo;return <span className="rush-team-label">{logo?<img src={logo} alt=""/>:null}<b>{n}</b></span>;};
 return <section className="rushing-direction-scout">
  <header><div><h3>Direction matchup</h3><small>{season} · Through {weekLabel(modelWeek)}</small></div><label>View<select aria-label="Rushing direction view" value={view} onChange={e=>setView(e.target.value as 'adjusted'|'raw')}><option value="adjusted">Opponent adjusted</option><option value="raw">Raw stats</option></select></label><label>Opponent<select value={name} onChange={e=>setChoice(e.target.value)}>{options.map(p=><option key={p.team}>{p.team}</option>)}</select></label></header>
  {season!==2026?<p className="rushing-note">Direction adjustments are enabled only for 2026; historical seasons use aggregate rushing.</p>:<>
   {data.key!==key?<p role="status">Loading rushing comparisons…</p>:data.message?<p role="status">{data.message}</p>:null}
   <div className="rushing-table-wrap rushing-matchup-table"><table><thead>{view==='raw'?<tr><th>Direction</th><th>OFF YPC</th><th>DEF YPC allowed</th><th>OFF / DEF carries</th><th>OFF usage</th></tr>:<tr><th>Direction</th><th>OFF YPC</th><th>DEF YPC allowed</th><th>OFF vs prior DEF</th><th>DEF allowed vs prior OFF</th><th>Matched / total carries</th><th>OFF usage</th><th>Net edge</th><th>Advantage</th></tr>}</thead>
    {comparisons.map(({offName,defName,off,def})=>{const display=rushingRelativeMatchup(off,def);const model=directionalMatchup(profiles.find(p=>p.team===offName)?.advancedProfile?.directional,profiles.find(p=>p.team===defName)?.advancedProfile?.directional);return <tbody key={offName}>
     <tr className="rush-matchup-group"><th colSpan={view==='raw'?5:9}><span className="rush-matchup-heading">{mark(offName)}<span className="rush-unit-label">OFF vs DEF</span>{mark(defName)}<span className="rush-matchup-impact">{view==='raw'?'Observed FBS production':model.available?`Model rush adjustment ${signed((model.multiplier-1)*100)} · Coverage ${percent(model.offCoverage)} / ${percent(model.defCoverage)}`:'Aggregate model only'}</span></span></th></tr>
     {runLanes.map(lane=>{const l=display.lanes.find(r=>r.lane===lane)!,o=off?.offense[lane],d=def?.defense[lane],edge=l.edgePercent,t=edge===null?'':edge>5?'good':edge< -5?'bad':'average';return <tr key={lane}><th>{lane}</th><td>{ypc(o?.ypc)}</td><td>{ypc(d?.ypc)}</td>{view==='raw'?<><td>{o?.carries??0} / {d?.carries??0}</td><td>{percent(l.share)}</td></>:<><td>{signed(l.offRelative)}</td><td>{signed(l.defRelative)}</td><td>{o?.comparedOwnCarries??0}/{o?.carries??0} · {d?.comparedOwnCarries??0}/{d?.carries??0}</td><td>{percent(l.share)}</td><td className={t}>{signed(edge)}</td><td className={t}>{edge===null?'No baseline':edge>5?mark(offName):edge< -5?mark(defName):'Even'}</td></>}</tr>;})}
    </tbody>;})}
   </table></div>
  </>}
  <p className="rushing-note">{view==='raw'?'Raw YPC shows observed offense and defensive allowance through the cutoff, with raw carries and offensive usage. Unknown directions remain unknown.':'OFF % compares YPC with what prior opponents usually allowed; DEF % is negative when fewer yards were allowed than prior opponents usually gained. Net = OFF % + DEF %. Each baseline excludes the head-to-head game. Small samples are continuously weighted toward zero.'} The displayed view is diagnostic. The separate 2026 model adjustment still uses bounded direction evidence to project rushing YPC.</p>
 </section>;
}
