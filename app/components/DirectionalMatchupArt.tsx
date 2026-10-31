'use client';
import {useEffect,useId,useState} from 'react';
import {directionalArt,type ArtZone} from '../../lib/directionalArt';
import {actualGameDirection,type GameDirectionSide,type GameDirectionZone} from '../../lib/gameDirectional';
import type {DirectionalProfile} from '../../lib/rushingMatchup';
import type {PassingDirectionalProfile} from '../../lib/passingMatchup';
import {resolveTeamLogoAsset} from '../../lib/teamLogoAssets';
import {weekLabel} from '../../lib/weekLabels';
import {CopyImageButton} from './CopyImageButton';
import './matchup-lab-compact.css';
type Team={name:string;abbr:string;logo?:string;color?:string;season:number;week:number;directional?:DirectionalProfile|null};
type View='adjusted'|'raw';
type Game={id:string;week:number;completed:boolean};
type Payload<P>={rows:{team:string;directional:P}[];message?:string};
const passCache=new Map<string,Promise<Payload<PassingDirectionalProfile>>>();
const rushCache=new Map<string,Promise<Payload<DirectionalProfile>>>();
const gamesCache=new Map<string,Promise<{rows?:unknown[]}>>();
function gameRows(kind:'passing'|'rushing',team:Team){
 const url=`/api/${kind}?${new URLSearchParams({view:'team-games',season:String(team.season),team:team.name})}`;
 let pending=gamesCache.get(url);
 if(!pending){pending=fetch(url).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'Game direction unavailable.');return data as {rows?:unknown[]};}).catch(error=>{gamesCache.delete(url);throw error;});gamesCache.set(url,pending);}
 return pending;
}
function useActualGame(first:Team,second:Team,game?:Game){
 const key=game?.completed?`${first.season}:${game.id}:${game.week}:${first.name}:${second.name}`:'';
 const [data,setData]=useState<{key:string;sides?:[GameDirectionSide,GameDirectionSide];error?:string}>({key:''});
 useEffect(()=>{
  if(!key||!game)return;
  let live=true;
  const teams=[first,second];
  Promise.allSettled(teams.flatMap(team=>[gameRows('passing',team),team.season===2026?gameRows('rushing',team):Promise.resolve({rows:[]})])).then(results=>{
   const rows=(i:number)=>results[i].status==='fulfilled'?results[i].value.rows??[]:[];
   const sides=teams.map((team,i)=>actualGameDirection({gameId:game.id,week:game.week,team:team.name,opponent:teams[1-i].name,passing:rows(i*2),rushing:rows(i*2+1),opponentPassing:rows((1-i)*2),opponentRushing:rows((1-i)*2+1)})) as [GameDirectionSide,GameDirectionSide];
   if(live)setData({key,sides,error:results.some(result=>result.status==='rejected')?'Some game direction data is unavailable.':undefined});
  });
  return()=>{live=false;};
 },[key,first,second,game]);
 return {loading:!!key&&data.key!==key,sides:data.key===key?data.sides:undefined,error:data.key===key?data.error:undefined};
}
function useProfile<P>(team:Team,kind:'passing'|'rushing',cache:Map<string,Promise<Payload<P>>>){
 const key=`${team.season}:${team.week}:${team.name}`;
 const [data,setData]=useState<{key:string;profile?:P;error?:string}>({key:''});
 useEffect(()=>{
  if(kind==='rushing'&&team.season!==2026)return;
  let live=true;const cacheKey=`${team.season}:${team.week}`;
  let request=cache.get(cacheKey);
  if(!request){const query=new URLSearchParams({view:'matchup',season:String(team.season),week:String(team.week),team:team.name,rev:kind==='passing'?'3':'1'});
   request=fetch(`/api/${kind}?${query}`).then(async response=>{const payload=await response.json();if(!response.ok)throw Error(payload.message||'Directional data unavailable.');return payload as Payload<P>;}).catch(e=>{cache.delete(cacheKey);throw e;});cache.set(cacheKey,request);}
  request.then(payload=>{if(live)setData({key,profile:payload.rows.find(r=>r.team===team.name)?.directional,error:payload.message});}).catch(e=>{if(live)setData({key,error:e.message});});
  return()=>{live=false;};
 },[key,team.season,team.week,team.name,kind,cache]);
 return {loading:(kind!=='rushing'||team.season===2026)&&data.key!==key,profile:data.key===key?data.profile:undefined,error:data.key===key?data.error:undefined};
}
const palette={attack:{fill:'#d9efdf',ink:'#145b32'},defense:{fill:'#f4dddd',ink:'#8d2027'},even:{fill:'#f3eccd',ink:'#725913'},untested:{fill:'#e8ebeb',ink:'#546166'}};
const fieldTeamColor=(team:Team)=>/^#[\da-f]{6}$/i.test(team.color??'')?team.color!:'#315a46';
const fieldTeamInk=(team:Team)=>{const color=fieldTeamColor(team);const rgb=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));return rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>150?'#13241a':'#fff';};
function FieldBackdrop({team,x}:{team:Team;x:number}){
 const color=fieldTeamColor(team);
 return <g transform={`translate(${x} 0)`}>
  <rect x="1" y="1" width="598" height="673" rx="5" fill="#225b36" stroke={color} strokeWidth="2"/>
  <rect x="8" y="8" width="584" height="46" fill={color}/>
  {Array.from({length:10},(_,i)=><g key={i} opacity=".28"><line x1="8" x2="592" y1={83+i*58} y2={83+i*58} stroke="#fff" strokeWidth="2"/><text x="36" y={78+i*58} fill="#fff" fontSize="12" fontFamily="Consolas,monospace">{i<5?(i+1)*10:(10-i)*10}</text><text x="564" y={78+i*58} textAnchor="end" fill="#fff" fontSize="12" fontFamily="Consolas,monospace">{i<5?(i+1)*10:(10-i)*10}</text></g>)}
  <line x1="300" x2="300" y1="54" y2="669" stroke="#fff" strokeOpacity=".12" strokeDasharray="7 9"/>
 </g>;
}
const number=(n:number|null)=>n===null?'—':n.toFixed(1);
const signed=(n:number|null|undefined)=>n==null?'—':`${n>0?'+':''}${n.toFixed(1)}%`;
type Graphic={offense:Team;defense:Team;offRush?:DirectionalProfile;defRush?:DirectionalProfile;offPass?:PassingDirectionalProfile;defPass?:PassingDirectionalProfile};
function FieldGraphic({graphic,view,x}:{graphic:Graphic;view:View;x:number}){
 const {offense,defense,offRush,defRush,offPass,defPass}=graphic;
 const art=directionalArt(offRush,defRush,offPass,defPass),id=useId().replace(/:/g,'');
 const logo=(team:Team)=>resolveTeamLogoAsset(team.name)??team.logo;
 const zone=(z:ArtZone,zx:number,zy:number,run=false)=>{const color=view==='raw'?{fill:'#edf2f0',ink:'#425852'}:palette[z.tone];return <g key={z.id}>
  <title>{view==='raw'?`${z.label}: offense ${number(z.off)} ${run?'YPC':'YPA'}; defense allowed ${number(z.def)}. ${z.offSamples} offensive and ${z.defSamples} defensive ${run?'carries':'attempts'}.`:`${z.label}: OFF ${signed(z.offRelative)}, DEF ${signed(z.defRelative)}, net ${signed(z.edge)}. OFF ${number(z.off)}, DEF allowed ${number(z.def)} ${run?'YPC':'YPA'}.`}</title>
  <rect x={zx} y={zy} width="182" height={run?94:64} rx="5" fill={color.fill} stroke={color.ink} strokeOpacity=".28"/>
  <text x={zx+91} y={zy+17} textAnchor="middle" fill="#263237" fontSize="13" fontWeight="bold">{z.label.toUpperCase()}</text>
  <text x={zx+91} y={zy+34} textAnchor="middle" fill="#263237" fontSize="11">{view==='raw'?`OFF ${number(z.off)} / DEF ${number(z.def)} ${run?'YPC':'YPA'}`:`OFF ${signed(z.offRelative)} · DEF ${signed(z.defRelative)}`}</text>
  <text x={zx+91} y={zy+51} textAnchor="middle" fill={color.ink} fontSize={view==='raw'?10:12} fontWeight="bold">{view==='raw'?`${z.offSamples} OFF / ${z.defSamples} DEF ${run?'CARRIES':'ATTEMPTS'}`:z.edge===null?'UNDER 3 / NO BASELINE':`${signed(z.edge)} · ${z.tone==='attack'?'OFF EDGE':z.tone==='defense'?'DEF EDGE':'EVEN'}`}</text>
  {run?<><text x={zx+91} y={zy+69} textAnchor="middle" fill="#263237" fontSize="10">{view==='raw'?'OBSERVED FBS PRODUCTION':`${number(z.off)} / ${number(z.def)} YPC`}</text><path d={`M${zx+91},${zy+87} L${zx+91+(z.id==='left'?-25:z.id==='right'?25:0)},${zy+76}`} fill="none" stroke={color.ink} strokeWidth="2" markerEnd={`url(#${id}-arrow)`}/></>:null}
 </g>;};
 return <g transform={`translate(${x} 0)`} fontFamily="Consolas,monospace">
  <image href="/harper-football.svg" x="12" y="10" width="42" height="32"/>
  {logo(offense)?<image href={logo(offense)} x="68" y="9" width="35" height="35"/>:null}
  <text x="300" y="23" textAnchor="middle" fill={fieldTeamInk(offense)} fontSize="15" fontWeight="bold">{offense.abbr} OFF → {defense.abbr} DEF</text>
  <text x="300" y="40" textAnchor="middle" fill={fieldTeamInk(offense)} fontSize="11">{offense.season} {weekLabel(offense.week,'compact')} / {defense.season} {weekLabel(defense.week,'compact')}</text>
  {logo(defense)?<image href={logo(defense)} x="548" y="9" width="35" height="35"/>:null}
  <text x="300" y="65" textAnchor="middle" fontSize="11" fill="#fff">PASSING · OFF / DEF ALLOWED</text>
  {art.passing.map(z=>{const [depth,side]=z.id.split(' '),col=['left','middle','right'].indexOf(side);return zone(z,16+col*193,depth==='deep'?75:145);})}
  <line x1="16" x2="584" y1="218" y2="218" stroke="#fff" strokeOpacity=".6" strokeDasharray="5 4"/>
  <text x="300" y="234" textAnchor="middle" fontSize="11" fill="#fff">RUSHING · OFF / DEF ALLOWED · UPFIELD ↑</text>
  <defs><marker id={`${id}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3b5148"/></marker></defs>
  {art.rushing.map((z,i)=>zone(z,16+i*193,244,true))}
  <text x="300" y="357" textAnchor="middle" fontSize="11" fill="#fff">{view==='raw'?'OBSERVED OFFENSE / DEFENSE ALLOWED':'GREEN OFF · RED DEF · GOLD EVEN · GRAY NO BASELINE'}</text>
 </g>;
}
function SamplesTable({left,right}:{left:ReturnType<typeof directionalArt>;right:ReturnType<typeof directionalArt>}){
 const rows=(data:ArtZone[],offset:number)=>data.map((z,i)=>{const y=447+i*25,unit=i<6?'YPA':'YPC';return <g key={z.id} transform={`translate(${offset} 0)`}>
  <line x1="16" x2="584" y1={y+7} y2={y+7} stroke="#fff" strokeOpacity=".25"/>
  <text x="20" y={y} fill="#fff" fontSize="11" fontWeight="bold">{z.label.toUpperCase()}</text>
  <text x="182" y={y} fill="#fff" fontSize="11">{number(z.off)} / {number(z.def)} {unit}</text>
  <text x="393" y={y} fill="#fff" fontSize="11">{z.offSamples} / {z.defSamples}</text>
  <text x="550" y={y} textAnchor="end" fill="#fff" fontSize="11">{z.usage===null?'—':`${(z.usage*100).toFixed(0)}%`}</text>
 </g>});
 return <g fontFamily="Consolas,monospace">
  {[0,610].map(offset=><g key={offset} transform={`translate(${offset} 0)`}><rect x="10" y="383" width="580" height="282" rx="5" fill="#102a1b" fillOpacity=".88"/><text x="20" y="400" fill="#fff" fontSize="12" fontWeight="bold">SAMPLES &amp; RAW YPA / YPC</text><g fill="#e5efe8" fontSize="10"><text x="20" y="424">ZONE</text><text x="182" y="424">OFF / DEF ALLOWED</text><text x="393" y="424">ATT/CARRIES</text><text x="550" y="424" textAnchor="end">USAGE</text></g></g>)}
  {rows([...left.passing,...left.rushing],0)}{rows([...right.passing,...right.rushing],610)}
 </g>;
}
function ActualFieldGraphic({offense,defense,side,x,week}:{offense:Team;defense:Team;side?:GameDirectionSide;x:number;week:number}){
 const logo=(team:Team)=>resolveTeamLogoAsset(team.name)??team.logo;
 const zone=(z:GameDirectionZone,zx:number,zy:number,run=false)=>{const color=palette[z.relativePercent===null?'untested':z.relativePercent>5?'attack':z.relativePercent< -5?'defense':'even'];return <g key={z.label}>
  <title>{z.label}: {run?`${z.attempts} carries`:`${z.completions??'—'}/${z.attempts} completions/attempts`}, {number(z.yardsPerAttempt)} {z.unit}, {signed(z.relativePercent)} vs opponent average {number(z.baseline)} {z.unit} allowed in other charted games.</title>
  <rect x={zx} y={zy} width="182" height={run?94:64} rx="5" fill={color.fill} stroke={color.ink} strokeOpacity=".28"/>
  <text x={zx+91} y={zy+17} textAnchor="middle" fill="#263237" fontSize="13" fontWeight="bold">{z.label.toUpperCase()}</text>
  <text x={zx+91} y={zy+34} textAnchor="middle" fill="#263237" fontSize="11">{run?`${z.attempts} CARRIES · ${number(z.yardsPerAttempt)} YPC`:`${z.completions??'—'}/${z.attempts} · ${number(z.yardsPerAttempt)} YPA`}</text>
  <text x={zx+91} y={zy+51} textAnchor="middle" fill={color.ink} fontSize="12" fontWeight="bold">{z.relativePercent===null?'UNDER 3 / NO BASELINE':`${signed(z.relativePercent)} VS OPP AVG`}</text>
  {run?<text x={zx+91} y={zy+73} textAnchor="middle" fill="#263237" fontSize="10">OPP AVG {number(z.baseline)} YPC</text>:null}
 </g>;};
 return <g transform={`translate(${x} 0)`} fontFamily="Consolas,monospace">
  <image href="/harper-football.svg" x="12" y="10" width="42" height="32"/>
  {logo(offense)?<image href={logo(offense)} x="68" y="9" width="35" height="35"/>:null}
  <text x="300" y="23" textAnchor="middle" fill={fieldTeamInk(offense)} fontSize="15" fontWeight="bold">{offense.abbr} OFF → {defense.abbr} DEF</text>
  <text x="300" y="40" textAnchor="middle" fill={fieldTeamInk(offense)} fontSize="11">{offense.season} {weekLabel(week,'compact')} · FINAL GAME DIRECTION</text>
  {logo(defense)?<image href={logo(defense)} x="548" y="9" width="35" height="35"/>:null}
  {side&&!side.available?<text x="300" y="190" textAnchor="middle" fill="#fff" fontSize="15">GAME DIRECTION DATA UNAVAILABLE</text>:null}
  <text x="300" y="65" textAnchor="middle" fontSize="11" fill="#fff">PASSING · COMPLETIONS / ATTEMPTS · YPA</text>
  {side?.passAvailable?side.passing.map(z=>{const [depth,location]=z.label.split(' '),col=['left','middle','right'].indexOf(location);return zone(z,16+col*193,depth==='deep'?75:145);}):null}
  <line x1="16" x2="584" y1="218" y2="218" stroke="#fff" strokeOpacity=".6" strokeDasharray="5 4"/>
  <text x="300" y="234" textAnchor="middle" fontSize="11" fill="#fff">RUSHING · CARRIES · YPC · UPFIELD ↑</text>
  {side?.rushAvailable?side.rushing.map((z,i)=>zone(z,16+i*193,244,true)):null}
  <text x="300" y="357" textAnchor="middle" fontSize="11" fill="#fff">GREEN ABOVE OPP AVG · RED BELOW · GRAY NO BASELINE</text>
 </g>;
}
function ActualSamplesTable({left,right}:{left?:GameDirectionSide;right?:GameDirectionSide}){
 const rows=(side:GameDirectionSide|undefined,offset:number)=>[...(side?.passAvailable?side.passing:[]),...(side?.rushAvailable?side.rushing:[])].map((z,i)=>{const y=447+i*25;return <g key={z.label} transform={`translate(${offset} 0)`}>
  <line x1="16" x2="584" y1={y+7} y2={y+7} stroke="#fff" strokeOpacity=".25"/>
  <text x="20" y={y} fill="#fff" fontSize="11" fontWeight="bold">{z.label.toUpperCase()}</text>
  <text x="182" y={y} fill="#fff" fontSize="11">{z.unit==='YPA'?`${z.completions??'—'}/${z.attempts}`:`${z.attempts} CAR`}</text>
  <text x="320" y={y} fill="#fff" fontSize="11">{number(z.yardsPerAttempt)} {z.unit}</text>
  <text x="460" y={y} fill="#fff" fontSize="11">{signed(z.relativePercent)}</text>
  <text x="566" y={y} textAnchor="end" fill="#fff" fontSize="11">{number(z.baseline)}</text>
 </g>});
 return <g fontFamily="Consolas,monospace">
  {[0,610].map(offset=><g key={offset} transform={`translate(${offset} 0)`}><rect x="10" y="383" width="580" height="282" rx="5" fill="#102a1b" fillOpacity=".88"/><text x="20" y="400" fill="#fff" fontSize="12" fontWeight="bold">ACTUAL GAME · VS OPPONENT'S OTHER GAMES</text><g fill="#e5efe8" fontSize="10"><text x="20" y="424">ZONE</text><text x="182" y="424">COMP/ATT OR CAR</text><text x="320" y="424">RATE</text><text x="460" y="424">VS AVG</text><text x="566" y="424" textAnchor="end">OPP AVG</text></g></g>)}
  {rows(left,0)}{rows(right,610)}
 </g>;
}
export function DirectionalMatchupArt({first,second,game,briefing=false}:{first:Team;second:Team;game?:Game;briefing?:boolean}){
 const [view,setView]=useState<View>('adjusted');
 const [mode,setMode]=useState<'projected'|'actual'>('projected');
 const a=useProfile(first,'passing',passCache),b=useProfile(second,'passing',passCache),ar=useProfile(first,'rushing',rushCache),br=useProfile(second,'rushing',rushCache);
 const actual=useActualGame(first,second,game);
 const left:Graphic={offense:first,defense:second,offRush:ar.profile,defRush:br.profile,offPass:a.profile,defPass:b.profile};
 const right:Graphic={offense:second,defense:first,offRush:br.profile,defRush:ar.profile,offPass:b.profile,defPass:a.profile};
 const leftArt=directionalArt(left.offRush,left.defRush,left.offPass,left.defPass),rightArt=directionalArt(right.offRush,right.defRush,right.offPass,right.defPass);
 return <section className="mlab-section mlab-direction-art"><header><div><span>PLAY ART · DIRECTIONAL MATCHUPS</span><h2>{game?'Game directional matchup':'Where each offense has an opening'}</h2></div></header>
  {briefing?<><div className="direction-quick-reads">{[{team:first,art:leftArt},{team:second,art:rightArt}].map(({team,art})=>{const zones=[...art.passing,...art.rushing],qualified=zones.filter(z=>z.edge!==null),best=[...qualified].sort((a,b)=>b.edge!-a.edge!)[0],worst=[...qualified].sort((a,b)=>a.edge!-b.edge!)[0];return <article key={team.name}><h3>{team.name}: the field read</h3>{a.loading||b.loading||ar.loading||br.loading?<p role="status">Loading directional evidence…</p>:<><p><strong>Attack:</strong> {best&&best.edge!>5?`${art.passing.includes(best)?'Throw':'Run'} ${best.label.toLowerCase()}. Its ${signed(best.edge)} combined relative edge is the strongest qualified opening.`:'No qualified area shows a clear offensive edge. Do not force a direction based on a thin sample.'}</p><p><strong>Be careful:</strong> {worst&&worst.edge!< -5?`${worst.label} ${art.passing.includes(worst)?'passing':'rushing'} favors the defense (${signed(worst.edge)}).`:'No qualified area shows a clear defensive edge.'}</p><small>{qualified.length} of {zones.length} areas have a usable comparison. Gray areas are untested, not weaknesses. These reads use opponent-adjusted rates even when the field shows raw stats.</small></>}</article>;})}</div><p className="direction-mobile-hint">Swipe the field sideways to inspect both teams at readable size. The combined image includes both fields and sample tables.</p></>:null}
  <article className="direction-art-combined">
   <div className="direction-art-tools">{game?.completed?<label>Game view <select aria-label="Game directional view" value={mode} onChange={e=>setMode(e.target.value as 'projected'|'actual')}><option value="projected">Pregame projection</option><option value="actual">Actual result</option></select></label>:null}{mode==='projected'?<label>Stats <select aria-label="Directional art view" value={view} onChange={e=>setView(e.target.value as View)}><option value="adjusted">Opponent adjusted</option><option value="raw">Raw stats</option></select></label>:null}<CopyImageButton scope=".direction-art-combined"/></div>
   <div className="direction-art-canvas"><svg viewBox="0 0 1210 675" role="img" aria-label={`${first.name} and ${second.name} ${mode==='actual'?'actual game direction':'pregame directional matchup'}, with sample table`}>
    <rect width="1210" height="675" fill="#0c2115"/>
    <FieldBackdrop team={first} x={0}/><FieldBackdrop team={second} x={610}/>
    {mode==='actual'&&game?<><ActualFieldGraphic offense={first} defense={second} side={actual.sides?.[0]} x={0} week={game.week}/><ActualFieldGraphic offense={second} defense={first} side={actual.sides?.[1]} x={610} week={game.week}/><ActualSamplesTable left={actual.sides?.[0]} right={actual.sides?.[1]}/></>:<><FieldGraphic graphic={left} view={view} x={0}/><FieldGraphic graphic={right} view={view} x={610}/><SamplesTable left={leftArt} right={rightArt}/></>}
   </svg></div>
  </article>
  {mode==='actual'&&actual.loading?<p role="status">Loading final-game direction…</p>:null}
  {mode==='actual'&&actual.error?<p role="status">{actual.error}</p>:null}
  {mode==='projected'&&(a.error||b.error||ar.error||br.error)?<p role="status">{a.error||b.error||ar.error||br.error}</p>:null}
  <p className="direction-art-note">{mode==='actual'?'Actual passing shows completions/attempts and YPA; rushing shows carries and YPC. The percentage compares each game rate with what the opponent allowed in its other charted games through this week. Each side needs at least 3 game and 3 baseline attempts/carries; missing baselines show no percentage.':view==='raw'?'Raw view shows observed FBS YPA and YPC against the defense’s observed allowed rate, with attempts and carries. No opponent adjustment or matchup percentage is applied.':'Pregame adjusted OFF % compares with what previous opponents usually allowed. DEF % is negative when a defense allowed less than prior opponents usually gained. Net = OFF % + DEF %. Passing locations need at least 3 compared attempts on each side; qualified samples are still weighted toward zero. Missing opponent baselines have no percentage.'} <strong>Short</strong> counts throws whose CFBD play description is tagged “short left,” “short middle,” or “short right”; <strong>deep</strong> counts its “deep” tag. CFBD has not specified a numeric air-yard cutoff for these tags, so this chart does not treat them as 0–9 or 20+. Unlocated passes stay outside these six areas. {mode==='projected'?'The table includes raw YPA/YPC, samples, and offensive usage for both directions. The displayed percentages do not alter the score projection.':''}</p>
 </section>;
}
