/** Reproducible forward-only audit. Inputs are cached public API snapshots.
 * Tune policy on 2021–24 only; report 2025 once, without retuning on it.
 * The underlying possession coefficients were previously fitted on 2021–24.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildPregameElo,buildPregameMatchupEvidence,type NormalizedGame,type Profile} from '../lib/dataPipeline';
import {parseAdvancedProfile} from '../lib/advancedMetrics';
import {configureViabilityCalibration} from '../lib/offensiveViability';
import {projectCalibratedMatchup,type MatchupTeamInput} from '../lib/matchupModel';
import {frozenViabilityCalibration} from '../lib/frozenViabilityCalibration';
import {buildConferenceAdjustments} from '../lib/conferenceAdjustment';
import type {ConferenceGame} from '../lib/conferenceComparison';
import type {MatchupPolicy} from '../lib/matchupPolicy';
const cache=process.env.HARPER_AUDIT_CACHE??'/workspace/scratch/fd5945e15a5d/model-audit-cache';
const output=process.env.HARPER_AUDIT_OUTPUT??'docs/evidence-policy-audit-2026-10-06.json';
const policies:MatchupPolicy[]=[];for(const earlyFormWeight of [0,.25,.5,1])for(const extraShrinkage of [0,.1,.2,.35])policies.push({earlyFormWeight,extraShrinkage});
type Counter={n:number;mae:number;brier:number;wins:number;residual:number;bins:{n:number;p:number;y:number}[]};
const empty=():Counter=>({n:0,mae:0,brier:0,wins:0,residual:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))});
const results=policies.map(policy=>({policy,training:empty(),holdout:empty(),earlyTraining:empty(),earlyHoldout:empty(),untestedFavoriteTraining:empty(),untestedFavoriteHoldout:empty(),years:{} as Record<number,Counter>}));
const summary=(c:Counter)=>({games:c.n,marginMAE:c.mae/c.n,brier:c.brier/c.n,winnerAccuracy:c.wins/c.n,meanHomeMarginError:c.residual/c.n,calibrationError:c.bins.reduce((sum,b)=>sum+(b.n?Math.abs(b.p/b.n-b.y/b.n)*b.n:0),0)/c.n});
function grade(c:Counter,margin:number,prob:number,actual:number){if(actual===0)return;c.n++;c.mae+=Math.abs(margin-actual);const win=actual>0?1:0;c.brier+=(prob-win)**2;c.wins+=Number((margin>0)===(actual>0));c.residual+=margin-actual;const b=c.bins[Math.min(9,Math.floor(prob*10))];b.n++;b.p+=prob;b.y+=win;}
let missing=0;const coverage:Record<number,number>={};
for(const season of [2021,2022,2023,2024,2025]){
 const schedule=JSON.parse(await readFile(join(cache,`${season}--1.json`),'utf8')).rows;
 const snapshots=await Promise.all(Array.from({length:16},async(_,week)=>JSON.parse(await readFile(join(cache,`${season}-${week}.json`),'utf8'))));
 const rows=snapshots.flatMap(p=>p.rows),dedup=new Map<string,any>(rows.map(r=>[`${r.team}|${r.week}`,r]));
 const profiles:Profile[]=[...dedup.values()].map(r=>({season,week:r.week,team:r.team,gamesPlayed:r.gamesPlayed,off:[r.offYpp,r.offYpa,r.offYpc,r.offPatt,r.offRatt],def:[r.defYpp,r.defYpa,r.defYpc,r.defPatt,r.defRatt],oi:[r.offYppIndex,r.offYpaIndex,r.offYpcIndex,r.offPattIndex,r.offRattIndex],di:[r.defYppIndex,r.defYpaIndex,r.defYpcIndex,r.defPattIndex,r.defRattIndex],preseasonElo:r.preseasonElo,advanced:parseAdvancedProfile(r.advancedProfile),conferenceAdjustment:r.conferenceAdjustment}));
 const eligible=new Set(profiles.map(p=>p.team));
 const games:NormalizedGame[]=schedule.map((r:any)=>({id:String(r.gameId),season,week:r.week,seasonType:r.seasonType,startDate:r.startDate??null,completed:Boolean(r.completed),neutralSite:Boolean(r.neutralSite),conferenceGame:Boolean(r.conferenceGame),venue:null,homeTeam:r.homeTeam,awayTeam:r.awayTeam,homeConference:r.homeConference,awayConference:r.awayConference,homePoints:r.homePoints,awayPoints:r.awayPoints,homePlays:r.homeActualPassAttempts!=null&&r.homeActualRushAttempts!=null?r.homeActualPassAttempts+r.homeActualRushAttempts:undefined,awayPlays:r.awayActualPassAttempts!=null&&r.awayActualRushAttempts!=null?r.awayActualPassAttempts+r.awayActualRushAttempts:undefined}));
 const elo=buildPregameElo(games,profiles.filter(p=>p.week===0),eligible),evidence=buildPregameMatchupEvidence(games,elo,eligible);
 const indexed=new Map<string,Profile[]>();for(const p of profiles){const list=indexed.get(p.team)??[];list.push(p);indexed.set(p.team,list);}for(const list of indexed.values())list.sort((a,b)=>b.week-a.week);
 coverage[season]=0;
 const conferenceTeams=snapshots[0].rows.map((r:any)=>({team:r.team,conference:r.conference}));
 const histories=policies.map(()=>[] as ConferenceGame[]);let adjustmentWeek=-1;
 let adjustments=policies.map(()=>new Map<string,{points:number}>());
 for(const game of [...games].sort((a,b)=>a.week-b.week||a.id.localeCompare(b.id))){
  if(!game.completed||game.homePoints==null||game.awayPoints==null||game.seasonType==='postseason'||game.week<1||game.week>15||!eligible.has(game.homeTeam)||!eligible.has(game.awayTeam))continue;
  const cutoff=game.week-1,hp=indexed.get(game.homeTeam)?.find(p=>p.week<=cutoff),ap=indexed.get(game.awayTeam)?.find(p=>p.week<=cutoff);
  if(!hp?.advanced||!ap?.advanced){missing++;continue;}
  // Only a pregame snapshot's calibration is used. No season-final inputs.
  configureViabilityCalibration(frozenViabilityCalibration);
  const he=evidence.get(game.id)?.get(game.homeTeam),ae=evidence.get(game.id)?.get(game.awayTeam);
  const h:MatchupTeamInput={offense:hp.oi,defense:hp.di,advanced:hp.advanced,evidence:he,conferenceAdjustment:hp.conferenceAdjustment},a:MatchupTeamInput={offense:ap.oi,defense:ap.di,advanced:ap.advanced,evidence:ae,conferenceAdjustment:ap.conferenceAdjustment};
  if(adjustmentWeek!==game.week){adjustments=histories.map(history=>buildConferenceAdjustments(conferenceTeams,history,game.week-1));adjustmentWeek=game.week;}
  const actual=game.homePoints-game.awayPoints,training=season<2025;
  const baselineIndex=policies.findIndex(p=>p.earlyFormWeight===1&&p.extraShrinkage===0);
  const baseline=projectCalibratedMatchup({...h,conferenceAdjustment:adjustments[baselineIndex].get(game.homeTeam)?.points??0},{...a,conferenceAdjustment:adjustments[baselineIndex].get(game.awayTeam)?.points??0},game.neutralSite,elo.get(game.id)?.get(game.homeTeam),elo.get(game.id)?.get(game.awayTeam),false,{}, {earlyFormWeight:1,extraShrinkage:0});
  const favoriteEvidence=baseline.margin>=0?he:ae,untested=Math.abs(baseline.margin)>=14&&(favoriteEvidence?.fbsGamesPlayed??0)<4;
  for(const [policyIndex,r] of results.entries()){const p=r.policy.earlyFormWeight===1&&r.policy.extraShrinkage===0?baseline:projectCalibratedMatchup({...h,conferenceAdjustment:adjustments[policyIndex].get(game.homeTeam)?.points??0},{...a,conferenceAdjustment:adjustments[policyIndex].get(game.awayTeam)?.points??0},game.neutralSite,elo.get(game.id)?.get(game.homeTeam),elo.get(game.id)?.get(game.awayTeam),false,{},r.policy);histories[policyIndex].push({gameId:game.id,week:game.week,seasonType:game.seasonType,completed:true,neutralSite:game.neutralSite,homeTeam:game.homeTeam,awayTeam:game.awayTeam,homePoints:game.homePoints,awayPoints:game.awayPoints,generatedFromWeek:cutoff,predictedHomeScore:p.homeScore,predictedAwayScore:p.awayScore,predictionConferenceMargin:p.conferenceMargin});if(game.week<2)continue;grade(training?r.training:r.holdout,p.margin,p.homeWinProbability,actual);grade(r.years[season]??(r.years[season]=empty()),p.margin,p.homeWinProbability,actual);if(game.week<=5)grade(training?r.earlyTraining:r.earlyHoldout,p.margin,p.homeWinProbability,actual);if(untested)grade(training?r.untestedFavoriteTraining:r.untestedFavoriteHoldout,p.margin,p.homeWinProbability,actual);}
  if(game.week>=2)coverage[season]++;
 }
 console.log('Evaluated',season,coverage[season]);
}
const selected=[...results].sort((a,b)=>a.training.mae/a.training.n-b.training.mae/b.training.n||a.training.brier/a.training.n-b.training.brier/b.training.n)[0].policy;
const report={createdAt:new Date().toISOString(),method:'Current fixed possession model; choose policy by 2021–24 FBS margin MAE; 2025 untouched holdout; regular-season Weeks 2–15 only; prior-week snapshots and pregame Elo/evidence; frozen 2021–24 viability calibration; weekly conference corrections replayed separately for each policy from prior weeks only; no postseason/final-context profiles.',coverage,skippedMissingAdvanced:missing,selected,results:results.map(r=>({...r,training:summary(r.training),holdout:summary(r.holdout),earlyTraining:summary(r.earlyTraining),earlyHoldout:summary(r.earlyHoldout),untestedFavoriteTraining:summary(r.untestedFavoriteTraining),untestedFavoriteHoldout:summary(r.untestedFavoriteHoldout),years:Object.fromEntries(Object.entries(r.years).map(([y,c])=>[y,summary(c)]))}))};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
