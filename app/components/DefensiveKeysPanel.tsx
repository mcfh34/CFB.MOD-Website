'use client';
import {useEffect,useState} from 'react';
import {withMiddlePassing} from '../../lib/defensiveKeys';
import type {PassingDirectionalProfile} from '../../lib/passingMatchup';
import type {DefensiveKeysAnalysis} from '../../lib/defensiveKeys';
import {resolveTeamLogoAsset} from '../../lib/teamLogoAssets';
import {teamIdentityStyle} from './TeamAccent';

export type DefensiveSnapshot={season:number;week:number};
type Payload={rows?:{team:string;directional:PassingDirectionalProfile}[]};
const passingCache=new Map<string,Promise<Payload>>();
function useMiddleProfile(team:string|undefined,snapshot?:DefensiveSnapshot){
 const key=team&&snapshot?`${team}:${snapshot.season}:${snapshot.week}`:'';
 const [state,setState]=useState<{key:string;profile?:PassingDirectionalProfile}>({key:''});
 useEffect(()=>{
  if(!key||!team||!snapshot)return;
  let live=true;
  const cacheKey=`${snapshot.season}:${snapshot.week}`;
  let request=passingCache.get(cacheKey);
  if(!request){
   const query=new URLSearchParams({view:'matchup',season:String(snapshot.season),week:String(snapshot.week),team,rev:'3'});
   request=fetch(`/api/passing?${query}`).then(async response=>{if(!response.ok)throw new Error('Passing unavailable');return response.json() as Promise<Payload>;}).catch(error=>{passingCache.delete(cacheKey);throw error;});
   passingCache.set(cacheKey,request);
  }
  request.then(data=>{if(live)setState({key,profile:data.rows?.find(row=>row.team===team)?.directional});}).catch(()=>{if(live)setState({key});});
  return()=>{live=false;};
 },[key,team,snapshot?.season,snapshot?.week]);
 return state.key===key?state.profile:undefined;
}
export function DefensiveKeysPanel({analysis:base,color,pointsAllowed,compact=false,defenseSnapshot,offenseSnapshot}:{analysis?:DefensiveKeysAnalysis|null;color?:string;pointsAllowed?:number|null;compact?:boolean;defenseSnapshot?:DefensiveSnapshot;offenseSnapshot?:DefensiveSnapshot}){
 const defense=useMiddleProfile(base?.team,defenseSnapshot),offense=useMiddleProfile(base?.opponent,offenseSnapshot);
 const analysis=base?withMiddlePassing(base,offense,defense):null;
 if(!analysis)return <div className="defense-keys-unavailable">Defensive priorities are unavailable for this snapshot.</div>;
 const {team,opponent,keys,outlook,summary,score,coverage,strength,concern}=analysis;
 const tone=outlook==='Strong defensive outlook'?'good':outlook==='Scoring risk elevated'?'bad':outlook==='Insufficient evidence'?'unknown':'mixed';
 return <article className={`defense-keys-panel${compact?' compact':''}`} aria-label={`${team} defensive priorities against ${opponent}`}>
  <header style={teamIdentityStyle(team,color)}>{resolveTeamLogoAsset(team)?<img src={resolveTeamLogoAsset(team)} alt=""/>:null}<div><strong>{team} defense</strong><small>vs. {opponent} offense</small></div></header>
  <div className="defense-keys-body">
   <div className="defense-keys-verdict" data-tone={tone}><strong>{outlook}</strong><span>{score===null?'Ungraded':`${score}/100 priority index`}</span></div>
   <p>{summary}</p>
   <div className="defense-keys-facts"><span><small>MODEL POINTS ALLOWED</small><b>{typeof pointsAllowed==='number'&&Number.isFinite(pointsAllowed)?pointsAllowed.toFixed(1):'—'}</b></span><span><small>PRIORITIES GRADED</small><b>{analysis.tested}/8</b></span></div>
   <p className="defense-keys-focus"><b>First strength:</b> {strength??'None established'}<br/><b>First concern:</b> {concern??'None established'}.</p>
   <details className="defense-keys-checklist"><summary>Eight priorities · highest importance first</summary><ol>{keys.map(key=><li key={key.id} data-status={key.status}><div className="defense-key-title"><b>{key.priority}. {key.title}</b><span>{key.status}</span></div><small>Weight {key.weight}/36 · {key.evidence}{key.score===null?'':` · ${key.score}/100`}</small>{key.target?<p className="defense-key-target">{key.target}</p>:null}<details><summary>Evidence & meaning</summary>{key.metrics.length?<ul>{key.metrics.map((metric,i)=><li key={i}>{metric}</li>)}</ul>:null}<p>{key.read}</p><p className="defense-key-limit">{key.limitation}</p></details></li>)}</ol></details>
   <small className="defense-keys-footnote">{Math.round(coverage*100)}% of priority weight has usable evidence, including proxies. Untested does not mean bad. The index is a coaching rubric, not a probability or a second points projection.</small>
  </div>
 </article>;
}
export function DefensiveKeysMethod(){return <details className="defense-keys-method"><summary>How the defensive priorities are graded</summary><p>Order follows the defensive checklist supplied for this model: defend the middle; stop the run; turnovers; big plays; third downs; pressure; critical situations; discipline. Weights decline from 8 to 1 (36 total). These weights express that priority order; they are not coefficients fitted to past scores.</p><p>For comparable efficiency metrics, 50 is the selected profiles’ average baseline. A 25% favorable or unfavorable relative difference spans the scale before shrinking it by games / (games + 3). At least three advanced games on each side are required. Middle run and short/deep-middle pass comparisons each require three compared attempts on both sides; their opponent-relative percentages are already sample-shrunk. Their net edge adds the offensive and defensive relative percentages; a negative net favors the defense. The tested middle lanes have equal weight within priority 1. Turnover margin uses the existing regressed giveaway and takeaway estimates; penalties use the defending team’s historical total penalty yardage.</p><p>Favorable is 60 or above; concern is 40 or below. Missing metrics are excluded and reduce coverage. An overall outlook needs at least four graded priorities and half the total weight. A concern in priority 1 or 2, or two concerns among the first four, raises scoring risk even if lower priorities are favorable. Strong requires an index of at least 65, favorable evidence in both first priorities, and tested middle-run and both middle-pass zones.</p><p>The +3 turnover margin, 70% third-down stop rate, and one penalty per 30 plays are coaching targets from the supplied checklist. Targets are separate from baseline grades; penalty frequency is not inferred from yardage. Coverage assignments, actual pressure locations, missed tackles, mental errors, two-minute execution and in-game poise remain unmeasured.</p><p>Use this to explain the existing matchup projection. No extra points are added or removed, avoiding double-counting rushing, explosiveness and drive efficiency already used by H+. This rubric has not been validated as an improvement in predictive accuracy.</p></details>;}
