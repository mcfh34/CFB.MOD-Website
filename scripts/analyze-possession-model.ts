import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseAdvancedProfile, type AdvancedProfile, type AdvancedSideProjection } from "../lib/advancedMetrics";
import { assessOffensiveViability } from "../lib/offensiveViability";
import {
  buildPregameElo,
  buildPregameMatchupEvidence,
  latestProfile,
  project,
  type NormalizedGame,
  type Profile,
} from "../lib/dataPipeline";

type ApiScheduleRow = {
  gameId:string;season:number;week:number;seasonType:string;completed:boolean|number;neutralSite:boolean|number;
  startDate:string|null;homeTeam:string;homeConference:string|null;homePoints:number|null;
  awayTeam:string;awayConference:string|null;awayPoints:number|null;vegasSpread:number|null;vegasTotal:number|null;
  predictedHomeScore?:number|null;predictedAwayScore?:number|null;
};

type ApiProfileRow = {
  season:number;week:number;team:string;gamesPlayed:number;
  offYpp:number;offYpa:number;offYpc:number;offPatt:number;offRatt:number;
  defYpp:number;defYpa:number;defYpc:number;defPatt:number;defRatt:number;
  offYppIndex:number;offYpaIndex:number;offYpcIndex:number;offPattIndex:number;offRattIndex:number;
  defYppIndex:number;defYpaIndex:number;defYpcIndex:number;defPattIndex:number;defRattIndex:number;
  advancedProfile?:unknown;
};

type SideFeatures = {
  driveAnchor:number;scoringAnchor:number;efficiency:number;explosiveness:number;finishing:number;
  protection:number;fieldPosition:number;viability:number;runPassBalance:number;dataQuality:number;
};

type GameSample = {
  season:number;gameId:string;week:number;neutral:boolean;actualHome:number;actualAway:number;
  actualMargin:number;actualTotal:number;vegasSpread:number|null;vegasTotal:number|null;
  possessions:number;home:SideFeatures;away:SideFeatures;homeOutcomeMargin:number;proofGap:number;
  positionScore:number;
  previousHome:number;previousAway:number;simpleHome:number;simpleAway:number;
};

type FeatureKey = keyof SideFeatures;
type Regression = { intercept:number;coefficients:Record<string,number>;means:number[];deviations:number[];features:string[] };
type GameModel = { ppd:Regression;total:Regression;margin:Regression };

const baseUrl=process.env.HARPER_DATA_URL??"https://harpercfbmodel.com/api/data";
const cacheDirectory=process.env.HARPER_ANALYSIS_CACHE??"/tmp/harper-scoring-analysis-v1";
const seasons=[2021,2022,2023,2024,2025] as const;
const trainingSeasons=new Set([2021,2022,2023,2024]);
const holdoutSeason=2025;
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const finite=(value:number|null|undefined,fallback:number)=>value===null||value===undefined||!Number.isFinite(value)?fallback:Number(value);
const ratio=(value:number|null|undefined,baseline:number|null|undefined)=>{
  if(value===null||value===undefined||baseline===null||baseline===undefined||!Number.isFinite(value)||!Number.isFinite(baseline)||Math.abs(baseline)<1e-6) return 1;
  return value/baseline;
};
const average=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);

async function fetchJson<T>(url:string):Promise<T> {
  await mkdir(cacheDirectory,{recursive:true});
  const path=join(cacheDirectory,`${Buffer.from(url).toString("base64url")}.json`);
  try { return JSON.parse(await readFile(path,"utf8")) as T; } catch { /* cache miss */ }
  const response=await fetch(url,{headers:{accept:"application/json"}});
  const body=await response.text();
  if(!response.ok) throw new Error(`${response.status} ${body.slice(0,180)}`);
  await writeFile(path,body);
  return JSON.parse(body) as T;
}

async function concurrentMap<T,R>(items:T[],concurrency:number,mapper:(item:T)=>Promise<R>) {
  const output=new Array<R>(items.length); let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(cursor<items.length) { const index=cursor++; output[index]=await mapper(items[index]); }
  }));
  return output;
}

function normalizedGame(row:ApiScheduleRow):NormalizedGame {
  return {id:String(row.gameId),season:Number(row.season),week:Number(row.week),seasonType:String(row.seasonType??"regular"),startDate:row.startDate??null,
    completed:Boolean(row.completed),neutralSite:Boolean(row.neutralSite),conferenceGame:false,venue:null,
    homeTeam:row.homeTeam,homeConference:row.homeConference??null,homePoints:row.homePoints===null?null:Number(row.homePoints),
    awayTeam:row.awayTeam,awayConference:row.awayConference??null,awayPoints:row.awayPoints===null?null:Number(row.awayPoints)};
}

function profile(row:ApiProfileRow):Profile {
  return {season:Number(row.season),week:Number(row.week),team:row.team,gamesPlayed:Number(row.gamesPlayed),
    off:[row.offYpp,row.offYpa,row.offYpc,row.offPatt,row.offRatt].map(Number) as Profile["off"],
    def:[row.defYpp,row.defYpa,row.defYpc,row.defPatt,row.defRatt].map(Number) as Profile["def"],
    oi:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex].map(Number) as Profile["oi"],
    di:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex].map(Number) as Profile["di"],
    advanced:parseAdvancedProfile(row.advancedProfile)};
}

function expectedPossessions(home:{patt:number;ratt:number;advanced:AdvancedSideProjection|null},away:{patt:number;ratt:number;advanced:AdvancedSideProjection|null}) {
  const implied=(side:typeof home)=>{
    const plays=Math.max(48,Math.min(88,side.patt+side.ratt));
    const playsPerDrive=clamp(finite(side.advanced?.overall.playsPerDrive,5.85),4.2,8.2);
    return plays/playsPerDrive;
  };
  return clamp((implied(home)+implied(away))/2,8.5,15.5);
}

function sideFeatures(projection:AdvancedSideProjection,profile:AdvancedProfile,possessions:number) : SideFeatures {
  const baseline=profile.baseline;
  const efficiency=average([
    Math.log(clamp(ratio(projection.overall.yardsPerPlay,baseline.yardsPerPlay),.55,1.65)),
    Math.log(clamp(ratio(projection.overall.successRate,baseline.successRate),.55,1.65)),
    finite(projection.overall.ppa,finite(baseline.ppa,.18))-finite(baseline.ppa,.18),
  ]);
  const explosiveness=average([
    Math.log(clamp(ratio(projection.overall.explosiveness,baseline.explosiveness),.55,1.75)),
    Math.log(clamp(ratio(projection.pass.passingExplosiveness,baseline.passingExplosiveness),.55,1.75)),
    Math.log(clamp(ratio(projection.run.rushingExplosiveness,baseline.rushingExplosiveness),.55,1.75)),
  ]);
  const finishing=average([
    Math.log(clamp(ratio(projection.overall.thirdDownSuccessRate,baseline.thirdDownSuccessRate),.55,1.65)),
    Math.log(clamp(ratio(projection.overall.redZoneEfficiency,baseline.redZoneEfficiency),.65,1.45)),
  ]);
  const protection=average([
    Math.log(clamp(ratio(baseline.havocRate,projection.overall.havocRate),.55,1.75)),
    Math.log(clamp(ratio(projection.pass.passingDownSuccessRate,baseline.passingDownSuccessRate),.55,1.65)),
  ]);
  const runPassBalance=Math.min(
    Math.log(clamp(ratio(projection.run.rushingSuccessRate,baseline.rushingSuccessRate),.55,1.65)),
    Math.log(clamp(ratio(projection.pass.passingSuccessRate,baseline.passingSuccessRate),.55,1.65)),
  );
  const fieldPosition=(finite(projection.specialTeams.fieldPosition,finite(baseline.fieldPosition,25))-finite(baseline.fieldPosition,25))/10
    + finite(projection.specialTeams.hiddenYards,0)/100;
  const pointsPerDrive=finite(projection.overall.pointsPerDrive,finite(baseline.pointsPerDrive,2.45));
  const scoringPoints=finite(projection.scoringPoints,finite(profile.offense.raw.pointsPerGame,27));
  return {
    driveAnchor:clamp(pointsPerDrive,.45,5.4),scoringAnchor:clamp(scoringPoints/possessions,.45,5.4),efficiency,explosiveness,
    finishing,protection,fieldPosition:clamp(fieldPosition,-1.5,1.5),viability:assessOffensiveViability(projection).risk,runPassBalance,
    dataQuality:clamp(profile.coverage.advancedGames/8,0,1),
  };
}

async function seasonSamples(season:number) {
  const [schedulePayload,profilePayloads]=await Promise.all([
    fetchJson<{rows:ApiScheduleRow[]}>(`${baseUrl}?view=schedule&season=${season}&week=0`),
    concurrentMap(Array.from({length:17},(_,week)=>week),4,(week)=>fetchJson<{rows:ApiProfileRow[]}>(`${baseUrl}?view=profiles&season=${season}&week=${week}`)),
  ]);
  const deduped=new Map<string,Profile>();
  for(const payload of profilePayloads) for(const row of payload.rows??[]) deduped.set(`${row.week}|${row.team}`,profile(row));
  const profiles=[...deduped.values()];
  const maxProfileWeek=Math.max(0,...profiles.map((row)=>row.week));
  const eligibleTeams=new Set(profiles.map((row)=>row.team));
  const games=(schedulePayload.rows??[]).map(normalizedGame);
  const pregameElo=buildPregameElo(games,profiles.filter((row)=>row.week===0),eligibleTeams);
  const pregameEvidence=buildPregameMatchupEvidence(games,pregameElo,eligibleTeams);
  const samples:GameSample[]=[];
  for(const row of schedulePayload.rows??[]) {
    if(!Boolean(row.completed)||row.homePoints===null||row.awayPoints===null||(!eligibleTeams.has(row.homeTeam)||!eligibleTeams.has(row.awayTeam))) continue;
    if(row.week<5&&row.seasonType!=="postseason") continue;
    const generatedFromWeek=row.seasonType==="postseason"?maxProfileWeek:Math.max(0,row.week-1);
    const hp=latestProfile(profiles,row.homeTeam,generatedFromWeek),ap=latestProfile(profiles,row.awayTeam,generatedFromWeek);
    if(!hp||!ap||!hp.advanced||!ap.advanced) continue;
    const ratings=pregameElo.get(String(row.gameId)),evidence=pregameEvidence.get(String(row.gameId));
    const prediction=project(hp,ap,Boolean(row.neutralSite),ratings?.get(row.homeTeam),ratings?.get(row.awayTeam),evidence?.get(row.homeTeam),evidence?.get(row.awayTeam));
    if(!prediction.homeStats.advanced||!prediction.awayStats.advanced||!prediction.calibratedHome.advanced||!prediction.calibratedAway.advanced) continue;
    const possessions=expectedPossessions(prediction.homeStats,prediction.awayStats);
    const proof=(value:typeof prediction.calibratedHome.evidence)=>.4*value.scheduleStrength+.2*value.bestOpponentStrength+.25*value.qualityWinStrength+.15*value.reliability;
    samples.push({season,gameId:String(row.gameId),week:Number(row.week),neutral:Boolean(row.neutralSite),actualHome:Number(row.homePoints),actualAway:Number(row.awayPoints),
      actualMargin:Number(row.homePoints)-Number(row.awayPoints),actualTotal:Number(row.homePoints)+Number(row.awayPoints),
      vegasSpread:row.vegasSpread===null?null:Number(row.vegasSpread),vegasTotal:row.vegasTotal===null?null:Number(row.vegasTotal),possessions,
      home:sideFeatures(prediction.homeStats.advanced,prediction.calibratedHome.advanced,possessions),
      away:sideFeatures(prediction.awayStats.advanced,prediction.calibratedAway.advanced,possessions),
      homeOutcomeMargin:prediction.outcomeMargin,proofGap:proof(prediction.calibratedHome.evidence)-proof(prediction.calibratedAway.evidence),
      positionScore:(prediction.homeStats.ypa-prediction.awayStats.ypa)/.75+(prediction.homeStats.ypc-prediction.awayStats.ypc)/.4
        +(average(prediction.calibratedAway.defense.slice(0,3))-average(prediction.calibratedHome.defense.slice(0,3)))/.06,
      previousHome:Number(row.predictedHomeScore??prediction.homeScore),previousAway:Number(row.predictedAwayScore??prediction.awayScore),simpleHome:prediction.homeStats.baseScore,simpleAway:prediction.awayStats.baseScore});
  }
  return samples;
}

function solve(system:number[][],values:number[]) {
  const matrix=system.map((row,index)=>[...row,values[index]]);
  for(let column=0;column<matrix.length;column+=1) {
    let pivot=column;
    for(let row=column+1;row<matrix.length;row+=1) if(Math.abs(matrix[row][column])>Math.abs(matrix[pivot][column])) pivot=row;
    [matrix[column],matrix[pivot]]=[matrix[pivot],matrix[column]];
    const divisor=matrix[column][column]||1e-12;
    for(let index=column;index<=matrix.length;index+=1) matrix[column][index]/=divisor;
    for(let row=0;row<matrix.length;row+=1) if(row!==column) {
      const multiplier=matrix[row][column];
      for(let index=column;index<=matrix.length;index+=1) matrix[row][index]-=multiplier*matrix[column][index];
    }
  }
  return matrix.map((row)=>row[matrix.length]);
}

function fit(rows:Array<{x:number[];y:number}>,features:string[],lambda:number):Regression {
  const means=features.map((_,index)=>average(rows.map((row)=>row.x[index])));
  const deviations=features.map((_,index)=>Math.sqrt(average(rows.map((row)=>(row.x[index]-means[index])**2)))||1);
  const matrix=rows.map((row)=>[1,...row.x.map((value,index)=>(value-means[index])/deviations[index])]);
  const size=features.length+1;
  const system=Array.from({length:size},(_,left)=>Array.from({length:size},(_,right)=>matrix.reduce((sum,row)=>sum+row[left]*row[right],0)+(left===right&&left>0?lambda:0)));
  const values=Array.from({length:size},(_,index)=>matrix.reduce((sum,row,rowIndex)=>sum+row[index]*rows[rowIndex].y,0));
  const coefficients=solve(system,values);
  return {intercept:coefficients[0],coefficients:Object.fromEntries(features.map((feature,index)=>[feature,coefficients[index+1]])),means,deviations,features};
}

function predict(model:Regression,values:number[]) {
  return model.intercept+model.features.reduce((sum,feature,index)=>sum+(model.coefficients[feature]??0)*(values[index]-model.means[index])/model.deviations[index],0);
}

const ppdFeatures:FeatureKey[]=["driveAnchor","scoringAnchor","efficiency","explosiveness","finishing","protection","fieldPosition","viability","runPassBalance","dataQuality"];
const sideVector=(side:SideFeatures)=>ppdFeatures.map((key)=>side[key]);
const totalFeatures=["rawTotal","possessions","explosiveness","viability"];
const marginFeatures=["rawMargin","outcomeMargin","proofGap","homeField"];

function trainModel(samples:GameSample[],lambda=12,totalLambda=lambda,marginLambda=lambda):GameModel {
  const sideRows=samples.flatMap((game)=>[
    {x:sideVector(game.home),y:game.actualHome/game.possessions},
    {x:sideVector(game.away),y:game.actualAway/game.possessions},
  ]);
  const ppd=fit(sideRows,[...ppdFeatures],lambda);
  const raw=(game:GameSample)=>{
    const home=clamp(predict(ppd,sideVector(game.home)),.2,5.8)*game.possessions;
    const away=clamp(predict(ppd,sideVector(game.away)),.2,5.8)*game.possessions;
    return {home,away};
  };
  const total=fit(samples.map((game)=>{const value=raw(game);return {x:[value.home+value.away,game.possessions,average([game.home.explosiveness,game.away.explosiveness]),average([game.home.viability,game.away.viability])],y:game.actualTotal};}),totalFeatures,totalLambda);
  const margin=fit(samples.map((game)=>{const value=raw(game);return {x:[value.home-value.away,game.homeOutcomeMargin,game.proofGap,game.neutral?0:1],y:game.actualMargin};}),marginFeatures,marginLambda);
  return {ppd,total,margin};
}

function gamePrediction(game:GameSample,model:GameModel) {
  const homePpd=clamp(predict(model.ppd,sideVector(game.home)),.2,5.8),awayPpd=clamp(predict(model.ppd,sideVector(game.away)),.2,5.8);
  const rawHome=homePpd*game.possessions,rawAway=awayPpd*game.possessions;
  const total=predict(model.total,[rawHome+rawAway,game.possessions,average([game.home.explosiveness,game.away.explosiveness]),average([game.home.viability,game.away.viability])]);
  const margin=predict(model.margin,[rawHome-rawAway,game.homeOutcomeMargin,game.proofGap,game.neutral?0:1]);
  return {home:total/2+margin/2,away:total/2-margin/2,total,margin};
}

type Prediction={home:number;away:number;total:number;margin:number};
function evaluate(samples:GameSample[],predictor:(game:GameSample)=>Prediction) {
  let teamError=0,totalError=0,marginError=0,su=0,brier=0,shutouts=0,oneScore=0,blowouts=0;
  const totals:number[]=[]; const edges=[0,1,2,3,5,Infinity];
  const buckets=edges.slice(0,-1).map((minimum,index)=>({label:index===4?"5+":`${minimum}–${edges[index+1]}`,minimum,maximum:edges[index+1],atsW:0,atsL:0,totalW:0,totalL:0}));
  for(const game of samples) {
    const value=predictor(game); const actualHomeWin=game.actualMargin>0?1:0;
    teamError+=Math.abs(value.home-game.actualHome)+Math.abs(value.away-game.actualAway);
    totalError+=Math.abs(value.total-game.actualTotal); marginError+=Math.abs(value.margin-game.actualMargin);
    if(Math.sign(value.margin)===Math.sign(game.actualMargin)) su+=1;
    const probability=1/(1+Math.exp(-value.margin/11.8)); brier+=(probability-actualHomeWin)**2;
    totals.push(value.total); if(value.home<.5||value.away<.5) shutouts+=1;
    if(Math.abs(value.margin)<=8) oneScore+=1; if(Math.abs(value.margin)>=21) blowouts+=1;
    if(game.vegasSpread!==null) {
      const edge=game.vegasSpread-(-value.margin),actual=game.actualMargin+game.vegasSpread;
      const bucket=buckets.find((row)=>Math.abs(edge)>=row.minimum&&Math.abs(edge)<row.maximum);
      if(bucket&&edge!==0&&actual!==0) { if(Math.sign(edge)===Math.sign(actual)) bucket.atsW+=1; else bucket.atsL+=1; }
    }
    if(game.vegasTotal!==null) {
      const edge=value.total-game.vegasTotal,actual=game.actualTotal-game.vegasTotal;
      const bucket=buckets.find((row)=>Math.abs(edge)>=row.minimum&&Math.abs(edge)<row.maximum);
      if(bucket&&edge!==0&&actual!==0) { if(Math.sign(edge)===Math.sign(actual)) bucket.totalW+=1; else bucket.totalL+=1; }
    }
  }
  const frequency=(limit:number)=>totals.filter((value)=>value<limit).length/Math.max(1,totals.length);
  return {games:samples.length,scoreMae:teamError/Math.max(1,samples.length*2),totalMae:totalError/Math.max(1,samples.length),spreadMae:marginError/Math.max(1,samples.length),straightUp:su/Math.max(1,samples.length),brier:brier/Math.max(1,samples.length),averageTotal:average(totals),
    below20:frequency(20),below30:frequency(30),below40:frequency(40),below50:frequency(50),below60:frequency(60),below70:frequency(70),
    shutouts:shutouts/Math.max(1,samples.length),oneScore:oneScore/Math.max(1,samples.length),blowouts:blowouts/Math.max(1,samples.length),
    edgeBuckets:buckets.map((row)=>({...row,ats:row.atsW+row.atsL?row.atsW/(row.atsW+row.atsL):null,total:row.totalW+row.totalL?row.totalW/(row.totalW+row.totalL):null}))};
}

function previous(game:GameSample):Prediction { return {home:game.previousHome,away:game.previousAway,total:game.previousHome+game.previousAway,margin:game.previousHome-game.previousAway}; }
function simple(game:GameSample):Prediction { return {home:game.simpleHome,away:game.simpleAway,total:game.simpleHome+game.simpleAway,margin:game.simpleHome-game.simpleAway}; }
function actualDistribution(samples:GameSample[]) {
  const totals=samples.map((row)=>row.actualTotal); const frequency=(limit:number)=>totals.filter((value)=>value<limit).length/Math.max(1,totals.length);
  return {averageTotal:average(totals),below20:frequency(20),below30:frequency(30),below40:frequency(40),below50:frequency(50),below60:frequency(60),below70:frequency(70),shutouts:samples.filter((row)=>row.actualHome===0||row.actualAway===0).length/Math.max(1,samples.length),oneScore:samples.filter((row)=>Math.abs(row.actualMargin)<=8).length/Math.max(1,samples.length),blowouts:samples.filter((row)=>Math.abs(row.actualMargin)>=21).length/Math.max(1,samples.length)};
}

function bettingMetrics(samples:GameSample[],predictor:(game:GameSample)=>Prediction,atsEdgeMinimum:number,positionMinimum:number,totalEdgeMinimum:number) {
  let atsWins=0,atsLosses=0,atsPushes=0,atsPasses=0,totalWins=0,totalLosses=0,totalPushes=0,totalPasses=0;
  for(const game of samples) {
    const value=predictor(game);
    if(game.vegasSpread!==null) {
      const edge=game.vegasSpread-(-value.margin),actual=game.actualMargin+game.vegasSpread;
      const qualifies=Math.abs(edge)>=atsEdgeMinimum&&Math.abs(game.positionScore)>=positionMinimum&&Math.sign(edge)===Math.sign(game.positionScore);
      if(!qualifies) atsPasses+=1; else if(actual===0) atsPushes+=1; else if(Math.sign(edge)===Math.sign(actual)) atsWins+=1; else atsLosses+=1;
    }
    if(game.vegasTotal!==null) {
      const edge=value.total-game.vegasTotal,actual=game.actualTotal-game.vegasTotal;
      if(Math.abs(edge)<totalEdgeMinimum) totalPasses+=1; else if(actual===0) totalPushes+=1; else if(Math.sign(edge)===Math.sign(actual)) totalWins+=1; else totalLosses+=1;
    }
  }
  return {ats:{wins:atsWins,losses:atsLosses,pushes:atsPushes,passes:atsPasses,graded:atsWins+atsLosses,accuracy:atsWins+atsLosses?atsWins/(atsWins+atsLosses):null},
    total:{wins:totalWins,losses:totalLosses,pushes:totalPushes,passes:totalPasses,graded:totalWins+totalLosses,accuracy:totalWins+totalLosses?totalWins/(totalWins+totalLosses):null}};
}

function marketBaseline(samples:GameSample[]) {
  const spreadRows=samples.filter((row)=>row.vegasSpread!==null),totalRows=samples.filter((row)=>row.vegasTotal!==null);
  return {spreadGames:spreadRows.length,spreadMae:average(spreadRows.map((row)=>Math.abs(-Number(row.vegasSpread)-row.actualMargin))),
    totalGames:totalRows.length,totalMae:average(totalRows.map((row)=>Math.abs(Number(row.vegasTotal)-row.actualTotal)))};
}

function totalDirectionAudit(samples:GameSample[],predictor:(game:GameSample)=>Prediction) {
  return [0,1,2,3,4,5,6,7,8,10].map((minimum)=>{
    const grade=(direction:"over"|"under")=>{
      const rows=samples.flatMap((game)=>{
        if(game.vegasTotal===null) return [];
        const edge=predictor(game).total-game.vegasTotal;
        if(Math.abs(edge)<minimum||(direction==="over"?edge<=0:edge>=0)) return [];
        const actual=game.actualTotal-game.vegasTotal;
        if(actual===0) return [];
        return [Math.sign(edge)===Math.sign(actual)];
      });
      const wins=rows.filter(Boolean).length;
      return {wins,losses:rows.length-wins,accuracy:rows.length?wins/rows.length:null};
    };
    return {minimum,over:grade("over"),under:grade("under")};
  });
}

function rounded(value:unknown):unknown {
  if(typeof value==="number") return Number(value.toFixed(5));
  if(Array.isArray(value)) return value.map(rounded);
  if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,rounded(item)]));
  return value;
}

const samples=(await concurrentMap([...seasons],2,seasonSamples)).flat();
const training=samples.filter((row)=>trainingSeasons.has(row.season));
const holdout=samples.filter((row)=>row.season===holdoutSeason);
const lambdas=[.3,1,3,8,12,20,40,80];
const selected=lambdas.map((lambda)=>{
  const folds=[...trainingSeasons].map((season)=>{
    const model=trainModel(training.filter((row)=>row.season!==season),lambda);
    return evaluate(training.filter((row)=>row.season===season),(game)=>gamePrediction(game,model));
  });
  const score=average(folds.map((row)=>row.scoreMae+.25*row.totalMae+.25*row.spreadMae));
  return {lambda,score,folds};
}).sort((a,b)=>a.score-b.score)[0];
const marginLambdaAudit=[0,.3,1,3,8,12,20,40,80,160].map((marginLambda)=>{
  const folds=[...trainingSeasons].map((season)=>{
    const fitted=trainModel(training.filter((row)=>row.season!==season),selected.lambda,selected.lambda,marginLambda);
    return evaluate(training.filter((row)=>row.season===season),(game)=>gamePrediction(game,fitted));
  });
  return {marginLambda,spreadMae:average(folds.map((row)=>row.spreadMae)),brier:average(folds.map((row)=>row.brier)),straightUp:average(folds.map((row)=>row.straightUp))};
}).sort((a,b)=>(a.spreadMae+.8*a.brier)-(b.spreadMae+.8*b.brier));
const selectedMarginLambda=marginLambdaAudit[0].marginLambda;
const model=trainModel(training,selected.lambda,selected.lambda,selectedMarginLambda);
const holdoutCurrent=evaluate(holdout,(game)=>gamePrediction(game,model));
const currentPredictor=(game:GameSample)=>gamePrediction(game,model);
const marginBlendAudit=[0,.2,.4,.6,.8,1].map((currentWeight)=>({currentWeight,metrics:evaluate(holdout,(game)=>{
  const current=currentPredictor(game),old=previous(game),margin=currentWeight*current.margin+(1-currentWeight)*old.margin;
  return {...current,margin,home:current.total/2+margin/2,away:current.total/2-margin/2};
})}));
const marketCandidates=[];
for(const atsEdgeMinimum of [0,1,1.5,2,3,4,5]) for(const positionMinimum of [0,.75,1.5,2,2.5]) for(const totalEdgeMinimum of [1,2,3,4,5,6,7]) {
  const metrics=bettingMetrics(training,currentPredictor,atsEdgeMinimum,positionMinimum,totalEdgeMinimum);
  if(metrics.ats.graded>=240&&metrics.total.graded>=360) marketCandidates.push({atsEdgeMinimum,positionMinimum,totalEdgeMinimum,metrics,
    score:(metrics.ats.accuracy??0)+(metrics.total.accuracy??0)-.000015*(metrics.ats.graded+metrics.total.graded)});
}
const marketSelection=marketCandidates.sort((a,b)=>b.score-a.score)[0];
const seasonValidation=Object.fromEntries(seasons.map((season)=>{
  const rows=samples.filter((row)=>row.season===season);
  const fitted=season===holdoutSeason?model:trainModel(training.filter((row)=>row.season!==season),selected.lambda);
  return [season,{evaluation:season===holdoutSeason?"untouched holdout":"leave-one-season-out",previous:evaluate(rows,previous),current:evaluate(rows,(game)=>gamePrediction(game,fitted)),actual:actualDistribution(rows)}];
}));

console.log(JSON.stringify(rounded({generatedAt:new Date().toISOString(),validation:"FBS-vs-FBS; week 5+ and postseason; prior-week profiles only; 2021-24 training; 2025 untouched holdout",
  samples:samples.length,trainingSamples:training.length,holdoutSamples:holdout.length,selectedLambda:selected.lambda,selectedMarginLambda,marginLambdaAudit,
  coefficients:model,trainingCrossValidation:selected.folds.map((row,index)=>({season:[...trainingSeasons][index],metrics:row})),
  marginBlendAudit,
  marketCalibration:{selected:{atsEdgeMinimum:marketSelection.atsEdgeMinimum,positionMinimum:marketSelection.positionMinimum,totalEdgeMinimum:marketSelection.totalEdgeMinimum},training:marketSelection.metrics,
    holdout:bettingMetrics(holdout,currentPredictor,marketSelection.atsEdgeMinimum,marketSelection.positionMinimum,marketSelection.totalEdgeMinimum),
    totalDirectionAudit:{training:totalDirectionAudit(training,currentPredictor),holdout:totalDirectionAudit(holdout,currentPredictor)}},
  holdout:{previous:evaluate(holdout,previous),simple:evaluate(holdout,simple),current:holdoutCurrent,market:marketBaseline(holdout),actual:actualDistribution(holdout)},seasonValidation}),null,2));
