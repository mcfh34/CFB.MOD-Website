import type {AdvancedMetricKey,AdvancedProfile,AdvancedSideProjection} from './advancedMetrics';
import {passingDirectionalMatchup,type PassingDirectionalProfile} from './passingMatchup';
import {matchupTurnovers} from './predictiveSignals';

/** User-supplied defensive priorities, in their original order. Weights are a
 * transparent coaching rubric, not fitted coefficients or an extra score model. */
export const defensivePriorities=[
  {id:'middle',title:'Defend the middle · run and pass',weight:8},
  {id:'run',title:'Stop the run · win the line',weight:7},
  {id:'turnovers',title:'Create a positive turnover margin',weight:6},
  {id:'explosive',title:'Prevent big plays',weight:5},
  {id:'third',title:'Get off the field on third down',weight:4},
  {id:'pressure',title:'Pressure the quarterback',weight:3},
  {id:'situations',title:'Win critical situations',weight:2},
  {id:'discipline',title:'Stay disciplined and adjust',weight:1},
] as const;
export type DefensiveKey={
  id:typeof defensivePriorities[number]['id'];priority:number;title:string;weight:number;
  score:number|null;status:'Favorable'|'Mixed'|'Concern'|'Untested';
  evidence:'Matchup projection'|'Partial / proxy'|'Unavailable';
  metrics:string[];read:string;limitation:string;target?:string;complete?:boolean;
};
export type DefensiveKeysAnalysis={
  team:string;opponent:string;score:number|null;coverage:number;tested:number;
  outlook:'Strong defensive outlook'|'Scoring risk elevated'|'Mixed defensive outlook'|'Insufficient evidence';
  summary:string;keys:DefensiveKey[];strength:string|null;concern:string|null;
};
type Input={team:string;opponent:string;opponentProjection?:AdvancedSideProjection|null;defenseProfile?:AdvancedProfile|null;offenseProfile?:AdvancedProfile|null};
const valid=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const clamp=(v:number,l=0,h=100)=>Math.min(h,Math.max(l,v));
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const pct=(v:number)=>`${(v*100).toFixed(1)}%`;
const signed=(v:number)=>`${v>0?'+':''}${v.toFixed(1)}`;

export function analyzeDefensiveKeys({team,opponent,opponentProjection:p,defenseProfile:d,offenseProfile:o}:Input):DefensiveKeysAnalysis{
  const games=Math.min(d?.coverage.advancedGames??0,o?.coverage.advancedGames??0);
  const enough=games>=3;
  const reliability=games/(games+3);
  const baseline=(key:AdvancedMetricKey)=>mean([d?.baseline[key],o?.baseline[key]].filter(valid));
  const relative=(value:number|null|undefined,key:AdvancedMetricKey,higherBetter=false)=>{
    const base=baseline(key);
    return enough&&valid(value)&&valid(base)&&base>0?50+50*clamp((higherBetter?value/base-1:1-value/base)/.25,-1,1)*reliability:null;
  };
  const rows:DefensiveKey[]=[];
  const add=(index:number,scores:(number|null)[],metrics:string[],read:string,limitation:string,proxy=false,target?:string)=>{
    const values=scores.filter(valid),average=mean(values),score=average===null?null:Math.round(average),meta=defensivePriorities[index];
    rows.push({...meta,priority:index+1,score:score===null?null:Math.round(score),status:score===null?'Untested':score>=60?'Favorable':score<=40?'Concern':'Mixed',evidence:score===null?'Unavailable':proxy||values.length<scores.length?'Partial / proxy':'Matchup projection',metrics,read:score===null?'Not enough comparable evidence to grade this priority.':read,limitation,target});
  };
  const metric=(label:string,value:number|null|undefined,key:AdvancedMetricKey,rate=false)=>{
    const base=baseline(key);
    return valid(value)?`${label}: ${rate?pct(value):value.toFixed(2)}${valid(base)?` · baseline ${rate?pct(base):base.toFixed(2)}`:''}`:null;
  };
  const list=(...v:(string|null)[])=>v.filter((x):x is string=>x!==null);
  const middleOff=o?.directional?.offense.middle,middleDef=d?.directional?.defense.middle;
  const middleReady=enough&&Math.min(middleOff?.comparedOwnCarries??0,middleDef?.comparedOwnCarries??0)>=3&&valid(middleOff?.relativePercent)&&valid(middleDef?.relativePercent);
  const middleNet=middleReady?middleOff!.relativePercent!+middleDef!.relativePercent!:null;
  add(0,[middleNet===null?null:50-50*clamp(middleNet/25,-1,1)],middleNet===null?[]:[`Opponent middle-run edge: ${signed(middleNet)}%`,`Compared carries: ${middleOff!.comparedOwnCarries} offense / ${middleDef!.comparedOwnCarries} defense`],
    'A negative opponent middle-run edge supports control of the interior; a positive edge points to a vulnerability.',
    'Middle-run evidence only. Middle-field pass coverage, route leverage and safety assignments are not graded. Missing pass evidence cannot establish that the entire middle is secure.',true);
  add(1,[relative(p?.run.rushingSuccessRate,'rushingSuccessRate'),relative(p?.run.lineYards,'lineYards'),relative(p?.run.stuffRate,'stuffRate',true)],
    list(metric('Opponent rush success',p?.run.rushingSuccessRate,'rushingSuccessRate',true),metric('Line yards allowed',p?.run.lineYards,'lineYards'),metric('Rushes stopped at/before line',p?.run.stuffRate,'stuffRate',true)),
    'Lower rushing success and line yards, with more stuffed runs, create longer-yardage downs.',
    'Line yards estimate line control; they do not isolate an individual lineman. Success uses the 50/70/100 on-schedule definition.');
  const turnoverReady=(d?.turnoverProfile?.games??0)>=3&&(o?.turnoverProfile?.games??0)>=3;
  const takeaways=turnoverReady?matchupTurnovers(o?.turnoverProfile,d?.turnoverProfile):null;
  const giveaways=turnoverReady?matchupTurnovers(d?.turnoverProfile,o?.turnoverProfile):null;
  const net=takeaways!==null&&giveaways!==null?takeaways-giveaways:null;
  add(2,[net===null?null:clamp(50+net*25)],net===null?[]:[`Expected takeaways: ${takeaways!.toFixed(1)}`,`Own expected giveaways: ${giveaways!.toFixed(1)}`,`Expected team turnover margin: ${signed(net)}`],
    'Taking the ball away ends drives; protecting it on offense preserves the benefit.',
    'Uses the existing regressed giveaway/force-rate estimate. Turnover margin includes both units and is volatile; +3 is an aspirational game target, not the normal expectation.',false,net===null?'Target: +3 turnover margin':`Target +3 · expectation ${signed(net)} (${net>=3?'at target':'below target'})`);
  add(3,[relative(p?.run.rushingExplosiveness,'rushingExplosiveness'),relative(p?.pass.passingExplosiveness,'passingExplosiveness')],
    list(metric('Opponent rush explosiveness',p?.run.rushingExplosiveness,'rushingExplosiveness'),metric('Opponent pass explosiveness',p?.pass.passingExplosiveness,'passingExplosiveness')),
    'Limiting explosive production makes the opponent sustain more successful plays to score.',
    'CFBD explosiveness is a value-based proxy, not the number of long gains. Missed tackles and assignment errors are not measured.',true);
  const third=p?.overall.thirdDownSuccessRate,stops=valid(third)&&third>=0&&third<=1?1-third:null;
  add(4,[stops===null?null:relative(third,'thirdDownSuccessRate')],stops===null?[]:[`Projected third-down stop rate: ${pct(stops)}`,`Opponent conversion rate: ${pct(third!)}`],
    'Third-down stops end possessions and keep the defense off the field.',
    'The 70% target means allowing no more than 30% conversions. The grade compares the matchup with its baseline, while the target is shown separately.',false,stops===null?'Target: 70% stops':`Target 70% stops · ${stops>=.7?'met':'not met'} in projection`);
  add(5,[relative(p?.overall.frontSevenHavoc,'frontSevenHavoc',true)],
    list(metric('Front-seven havoc',p?.overall.frontSevenHavoc,'frontSevenHavoc',true)),
    'More front-seven disruption suggests a better chance to disturb the quarterback’s rhythm.',
    'Havoc includes disruptive plays beyond pressures. It does not measure pressure rate or locate pressure inside the pocket.',true);
  add(6,[relative(p?.overall.redZoneEfficiency,'redZoneEfficiency'),relative(p?.run.powerSuccess,'powerSuccess')],
    list(metric('Opponent red-zone scoring',p?.overall.redZoneEfficiency,'redZoneEfficiency',true),metric('Opponent short-yardage success',p?.run.powerSuccess,'powerSuccess',true)),
    'Reducing red-zone scoring and short-yardage conversions helps keep promising drives from paying off.',
    'Red-zone efficiency counts scoring, not only touchdowns. Power success is a short-yardage proxy; goal-line calls and two-minute execution are not separately measured.',true);
  const penalties=d?.offense.raw.penaltyYards,penaltyBaseline=d?.baseline.penaltyYards;
  const disciplineScore=(d?.coverage.advancedGames??0)>=3&&valid(penalties)&&valid(penaltyBaseline)&&penaltyBaseline>0?50+50*clamp((1-penalties/penaltyBaseline)/.25,-1,1)*((d?.coverage.advancedGames??0)/((d?.coverage.advancedGames??0)+3)):null;
  add(7,[disciplineScore],valid(penalties)?[`Team penalty yards/game: ${penalties.toFixed(1)}${valid(penaltyBaseline)?` · baseline ${penaltyBaseline.toFixed(1)}`:''}`]:[],
    'Avoiding penalties protects field position and prevents free first downs.',
    'Whole-team historical penalty yardage is a proxy. Defensive penalties per snap, in-game adjustments and poise are not measured.',true,'Target: no more than 1 penalty per 30 plays · frequency unavailable');
  return summarizeDefensiveKeys(team,opponent,rows);
}

export function summarizeDefensiveKeys(team:string,opponent:string,keys:DefensiveKey[]):DefensiveKeysAnalysis{
  const totalWeight=defensivePriorities.reduce((sum,k)=>sum+k.weight,0);
  const measured=keys.filter(k=>k.score!==null),weight=measured.reduce((sum,k)=>sum+k.weight,0);
  const score=weight?Math.round(measured.reduce((sum,k)=>sum+k.score!*k.weight,0)/weight):null;
  const coverage=weight/totalWeight;
  const concerns=keys.filter(k=>k.status==='Concern'),strengths=keys.filter(k=>k.status==='Favorable');
  // A major early-priority weakness cannot be erased by lower-priority strengths.
  const coreConcern=concerns.some(k=>k.priority<=2)||concerns.filter(k=>k.priority<=4).length>=2;
  const outlook:DefensiveKeysAnalysis['outlook']=coverage<.5||measured.length<4?'Insufficient evidence':coreConcern||(score!==null&&score<=40)?'Scoring risk elevated':score!==null&&score>=65&&keys.slice(0,2).every(k=>k.status==='Favorable')&&keys[0].complete===true?'Strong defensive outlook':'Mixed defensive outlook';
  const missing=keys.filter(k=>k.score===null).map(k=>`#${k.priority}`).join(', ');
  const summary=outlook==='Insufficient evidence'?`Too many priorities are untested to make a complete defensive read against ${opponent}.`:outlook==='Scoring risk elevated'?`${team} has vulnerabilities in ${concerns.slice(0,2).map(k=>k.title.toLowerCase()).join(' and ')}. Those can extend drives or create quick scores for ${opponent}.`:outlook==='Strong defensive outlook'?`${team} has supportive evidence in the highest-priority measured areas. That favors limiting ${opponent}'s scoring opportunities, subject to the gaps below.`:`The evidence is split: ${team} has areas to protect and areas ${opponent} can challenge.`;
  return{team,opponent,score,coverage,tested:measured.length,outlook,summary:summary+(missing?` Untested priorities: ${missing}.`:''),keys,strength:strengths[0]?.title??null,concern:concerns[0]?.title??null};
}

/** Enrich the same rubric with the point-in-time passing feed used by play art.
 * Neither the prediction nor unrelated priority grades are altered. */
export function withMiddlePassing(analysis:DefensiveKeysAnalysis,offense?:PassingDirectionalProfile|null,defense?:PassingDirectionalProfile|null):DefensiveKeysAnalysis{
  const base=analysis.keys[0];
  const lanes=passingDirectionalMatchup(offense,defense).lanes.filter(l=>l.lane==='short middle'||l.lane==='deep middle');
  const tested=lanes.filter(l=>l.tested&&valid(l.edgePercent));
  if(!tested.length)return analysis;
  const scores=[base.score,...tested.map(l=>50-50*clamp(l.edgePercent/25,-1,1))].filter(valid);
  const score=Math.round(mean(scores)!);
  const missing=['short middle','deep middle'].filter(name=>!tested.some(l=>l.lane===name));
  const middle:DefensiveKey={...base,score,status:score>=60?'Favorable':score<=40?'Concern':'Mixed',evidence:'Partial / proxy',complete:base.score!==null&&tested.length===2,
    metrics:[...base.metrics,...tested.flatMap(l=>[`Opponent ${l.lane} pass edge: ${signed(l.edgePercent)}%`,`Compared ${l.lane} attempts: ${offense!.offense[l.lane].comparedOwnAttempts} offense / ${defense!.defense[l.lane].comparedOwnAttempts} defense`])],
    read:'Negative opponent edges favor the defense; positive edges favor the offense. Middle run, short-middle pass and deep-middle pass receive equal weight when tested.',
    limitation:`Uses opponent-relative yards per carry/attempt with sample shrinkage, not charted coverage assignments. ${base.score===null?'Middle run untested. ':''}${missing.length?`Untested passing: ${missing.join(', ')}. `:''}Short/deep are source play-description tags, not verified air-yard ranges. Route leverage and safety assignments remain unmeasured.`};
  return summarizeDefensiveKeys(analysis.team,analysis.opponent,[middle,...analysis.keys.slice(1)]);
}
