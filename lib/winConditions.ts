import type { AdvancedSideProjection } from "./advancedMetrics";
import { predictPointsPerPossession, type PossessionFeatures, type PossessionScoreReceipt } from "./scoringModel";

export type WinConditionMetric =
  | "successRate"
  | "yardsPerPass"
  | "yardsPerRush"
  | "passingExplosiveness"
  | "rushingExplosiveness"
  | "havocAllowed"
  | "pointsPerDrive"
  | "turnoverMargin"
  | "possessions";

export type WinConditionUnit = "percent" | "yards" | "rating" | "points" | "count" | "margin";
export type WinConditionSide = "home" | "away" | "game";
export type WinConditionQuality = "full" | "limited" | "baseline-only";

export type WinConditionHistoricalSample = {
  gameId:string;
  season:number;
  week:number;
  successRate:number|null;
  yardsPerPass:number|null;
  yardsPerRush:number|null;
  passingExplosiveness:number|null;
  rushingExplosiveness:number|null;
  havocAllowed:number|null;
  havocCreated:number|null;
  pointsPerDrive:number|null;
  possessions:number|null;
  turnoverMargin:number|null;
  points:number|null;
  opponentPoints:number|null;
};

export type WinConditionVariable = {
  key:string;
  metric:WinConditionMetric;
  side:WinConditionSide;
  team:string|null;
  label:string;
  shortLabel:string;
  unit:WinConditionUnit;
  baseline:number;
  minimum:number;
  maximum:number;
  step:number;
  standardDeviation:number;
  higherIsBetter:boolean;
  homeScoreSensitivity:number;
  awayScoreSensitivity:number;
  importance:number;
  explanation:string;
};

export type WinCondition = {
  id:string;
  variableKey:string;
  metric:WinConditionMetric;
  category:string;
  label:string;
  threshold:number;
  baseline:number;
  unit:WinConditionUnit;
  higherIsBetter:boolean;
  achievementProbability:number;
  winProbabilityIfAchieved:number;
  requiredStandardDeviations:number;
  impact:number;
  explanation:string;
};

export type VictoryPath = {
  id:string;
  label:string;
  occurrenceProbability:number;
  winProbabilityWithinPath:number;
  typicalHomeScore:number;
  typicalAwayScore:number;
  definingConditions:string[];
  explanation:string;
};

export type GameScriptCluster = {
  id:string;
  label:string;
  occurrenceProbability:number;
  homeWinProbability:number;
  typicalHomeScore:number;
  typicalAwayScore:number;
  homeMargin:number;
  total:number;
  beneficiary:string;
  chaos:boolean;
  definingCharacteristics:string[];
  explanation:string;
};

export type UpsetPath = {
  underdog:string;
  scenarioWinProbability:number;
  estimatedOccurrenceProbability:number;
  typicalHomeScore:number;
  typicalAwayScore:number;
  combinedDeviation:number;
  conditions:Array<{label:string;value:number;baseline:number;unit:WinConditionUnit;higherIsBetter:boolean;standardDeviations:number}>;
  explanation:string;
};

export type WinConditionTeamAnalysis = {
  team:string;
  side:"home"|"away";
  winProbability:number;
  pathWidth:number|null;
  fragility:number|null;
  conditions:WinCondition[];
  paths:VictoryPath[];
};

export type WinConditionScenarioModel = {
  homeFeatures:PossessionFeatures;
  awayFeatures:PossessionFeatures;
  homeRawExpectedPoints:number;
  awayRawExpectedPoints:number;
  homeYardsPerPass:number;
  homeYardsPerRush:number;
  homePassAttempts:number;
  homeRushAttempts:number;
  awayYardsPerPass:number;
  awayYardsPerRush:number;
  awayPassAttempts:number;
  awayRushAttempts:number;
  outcomeBlend:number;
  turnoverPointsPerMargin:number;
  logisticScale:number;
};

export type WinConditionAnalysis = {
  version:"hplus-win-conditions-v1";
  generatedFromWeek:{home:number;away:number};
  simulationCount:number;
  historicalSampleSize:{home:number;away:number};
  dataQuality:WinConditionQuality;
  baseline:{
    homeTeam:string;awayTeam:string;neutralSite:boolean;
    homeScore:number;awayScore:number;homeWinProbability:number;
    modelHomeSpread:number;modelTotal:number;possessions:number;
    interpretation:string;
  };
  variables:WinConditionVariable[];
  home:WinConditionTeamAnalysis;
  away:WinConditionTeamAnalysis;
  easiestUpsetPath:UpsetPath|null;
  clusters:GameScriptCluster[];
  scenarioModel:WinConditionScenarioModel;
  methodology:string;
};

export type WinConditionProjection = {
  homeScore:number;
  awayScore:number;
  margin:number;
  homeWinProbability:number;
  modelHomeSpread:number;
  modelTotal:number;
  possessions:number;
  volatility:number;
  outcomeBlend:number;
  homeStats:{
    ypa:number;ypc:number;patt:number;ratt:number;ypp:number;
    advanced:AdvancedSideProjection|null;
    scoreReceipt:PossessionScoreReceipt;
  };
  awayStats:{
    ypa:number;ypc:number;patt:number;ratt:number;ypp:number;
    advanced:AdvancedSideProjection|null;
    scoreReceipt:PossessionScoreReceipt;
  };
  edgeAnalysis?:{summary?:string}|null;
};

export type BuildWinConditionInput = {
  homeTeam:string;
  awayTeam:string;
  homeWeek:number;
  awayWeek:number;
  neutralSite:boolean;
  projection:WinConditionProjection;
  homeSamples:WinConditionHistoricalSample[];
  awaySamples:WinConditionHistoricalSample[];
  simulationCount?:number;
  clusterCount?:number;
  seed?:string;
};

export type WinConditionScenarioResult = {
  homeScore:number;
  awayScore:number;
  homeWinProbability:number;
  homePathWidth:number|null;
  awayPathWidth:number|null;
  homeFragility:number|null;
  awayFragility:number|null;
};

type VariableDefinition = {
  metric:Exclude<WinConditionMetric,"turnoverMargin"|"possessions">;
  label:string;
  shortLabel:string;
  unit:WinConditionUnit;
  higherIsBetter:boolean;
  minimum:number;
  maximum:number;
  step:number;
  explanation:string;
  baseline:(side:"home"|"away",projection:WinConditionProjection)=>number|null;
  sample:(row:WinConditionHistoricalSample)=>number|null;
};

type SimulationRow = {
  id:number;
  values:Record<string,number>;
  rawHomeScore:number;
  rawAwayScore:number;
  homeScore:number;
  awayScore:number;
  homeMargin:number;
  total:number;
  homeWon:boolean;
  cluster:number;
};

const logisticScale=11.8;
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const finite=(value:number|null|undefined):value is number=>value!==null&&value!==undefined&&Number.isFinite(value);
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const standardDeviation=(values:number[])=>{
  if(values.length<2)return 0;
  const center=average(values);
  return Math.sqrt(values.reduce((sum,value)=>sum+(value-center)**2,0)/(values.length-1));
};
const quantile=(values:number[],probability:number)=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((left,right)=>left-right);
  const index=clamp(probability,0,1)*(sorted.length-1);
  const lower=Math.floor(index),upper=Math.ceil(index),weight=index-lower;
  return sorted[lower]*(1-weight)+sorted[upper]*weight;
};
const normalizedEntropy=(values:number[])=>{
  const total=values.reduce((sum,value)=>sum+value,0);
  const probabilities=values.filter((value)=>value>0).map((value)=>value/Math.max(1e-9,total));
  if(probabilities.length<2)return 0;
  return -probabilities.reduce((sum,value)=>sum+value*Math.log(value),0)/Math.log(probabilities.length);
};
const hashSeed=(value:string)=>{
  let hash=2166136261;
  for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return hash>>>0;
};
const seededRandom=(seed:number)=>()=>{
  seed|=0;seed=seed+0x6D2B79F5|0;
  let value=Math.imul(seed^seed>>>15,1|seed);
  value=value+Math.imul(value^value>>>7,61|value)^value;
  return((value^value>>>14)>>>0)/4294967296;
};

const variableDefinitions:VariableDefinition[]=[
  {
    metric:"successRate",label:"Offensive success rate",shortLabel:"Success rate",unit:"percent",higherIsBetter:true,minimum:.15,maximum:.72,step:.005,
    explanation:"Opponent-adjusted share of plays that gain enough yardage for the down and distance.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).advanced?.overall.successRate??null,
    sample:(row)=>row.successRate,
  },
  {
    metric:"yardsPerPass",label:"Passing efficiency",shortLabel:"Yards / pass",unit:"yards",higherIsBetter:true,minimum:2.5,maximum:14,step:.1,
    explanation:"Opponent-adjusted yards per pass attempt from the canonical H+ matchup projection.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).ypa,
    sample:(row)=>row.yardsPerPass,
  },
  {
    metric:"yardsPerRush",label:"Rushing efficiency",shortLabel:"Yards / rush",unit:"yards",higherIsBetter:true,minimum:1.5,maximum:9,step:.1,
    explanation:"Opponent-adjusted yards per rush from the canonical H+ matchup projection.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).ypc,
    sample:(row)=>row.yardsPerRush,
  },
  {
    metric:"passingExplosiveness",label:"Passing explosiveness",shortLabel:"Pass explosiveness",unit:"rating",higherIsBetter:true,minimum:.35,maximum:3.2,step:.02,
    explanation:"CFBD passing explosiveness translated through the selected offense and opposing defense.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).advanced?.pass.passingExplosiveness??null,
    sample:(row)=>row.passingExplosiveness,
  },
  {
    metric:"rushingExplosiveness",label:"Rushing explosiveness",shortLabel:"Rush explosiveness",unit:"rating",higherIsBetter:true,minimum:.25,maximum:2.8,step:.02,
    explanation:"CFBD rushing explosiveness translated through the selected offense and opposing defense.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).advanced?.run.rushingExplosiveness??null,
    sample:(row)=>row.rushingExplosiveness,
  },
  {
    metric:"havocAllowed",label:"Havoc allowed",shortLabel:"Havoc allowed",unit:"percent",higherIsBetter:false,minimum:.03,maximum:.38,step:.005,
    explanation:"Projected share of offensive plays disrupted by sacks, tackles for loss, forced fumbles, interceptions or breakups.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).advanced?.overall.havocRate??null,
    sample:(row)=>row.havocAllowed,
  },
  {
    metric:"pointsPerDrive",label:"Points per drive",shortLabel:"Points / drive",unit:"points",higherIsBetter:true,minimum:.2,maximum:5.5,step:.05,
    explanation:"Scoring output per possession, preserving the H+ possession model and finishing component.",
    baseline:(side,projection)=>(side==="home"?projection.homeStats:projection.awayStats).scoreReceipt.features.driveAnchor,
    sample:(row)=>row.pointsPerDrive,
  },
];

function physicalRange(definition:VariableDefinition,baseline:number,deviation:number,values:number[]){
  const empiricalLow=quantile(values,.04),empiricalHigh=quantile(values,.96);
  const width=Math.max(deviation,definition.step*4);
  return {
    minimum:clamp(Math.min(baseline-2.15*width,empiricalLow),definition.minimum,definition.maximum),
    maximum:clamp(Math.max(baseline+2.15*width,empiricalHigh),definition.minimum,definition.maximum),
  };
}

function sampleValues(samples:WinConditionHistoricalSample[],definition:VariableDefinition){
  return samples.map(definition.sample).filter(finite);
}

function buildBaseVariables(input:BuildWinConditionInput){
  const variables:WinConditionVariable[]=[];
  for(const side of ["home","away"] as const){
    const samples=side==="home"?input.homeSamples:input.awaySamples;
    const team=side==="home"?input.homeTeam:input.awayTeam;
    for(const definition of variableDefinitions){
      const baseline=definition.baseline(side,input.projection);
      const values=sampleValues(samples,definition);
      const deviation=standardDeviation(values);
      if(!finite(baseline)||values.length<4||deviation<=definition.step*1.25)continue;
      const range=physicalRange(definition,baseline,deviation,values);
      variables.push({
        key:`${side}:${definition.metric}`,metric:definition.metric,side,team,label:definition.label,shortLabel:definition.shortLabel,unit:definition.unit,
        baseline:clamp(baseline,definition.minimum,definition.maximum),minimum:range.minimum,maximum:range.maximum,step:definition.step,
        standardDeviation:deviation,higherIsBetter:definition.higherIsBetter,homeScoreSensitivity:0,awayScoreSensitivity:0,importance:0,explanation:definition.explanation,
      });
    }
  }
  const homeTurnovers=input.homeSamples.map((row)=>row.turnoverMargin).filter(finite);
  const awayTurnovers=input.awaySamples.map((row)=>row.turnoverMargin).filter(finite);
  if(homeTurnovers.length>=4&&awayTurnovers.length>=4){
    const homeProjected=input.projection.homeStats.advanced?.specialTeams.turnoverMargin;
    const awayProjected=input.projection.awayStats.advanced?.specialTeams.turnoverMargin;
    const baseline=finite(homeProjected)&&finite(awayProjected)?(homeProjected-awayProjected)/2:(average(homeTurnovers)-average(awayTurnovers))/2;
    const deviation=Math.max(.5,Math.sqrt(standardDeviation(homeTurnovers)**2+standardDeviation(awayTurnovers)**2)/2);
    variables.push({
      key:"game:turnoverMargin",metric:"turnoverMargin",side:"game",team:null,label:`${input.homeTeam} turnover margin`,shortLabel:"Turnover margin",unit:"margin",
      baseline:clamp(baseline,-3,3),minimum:-4,maximum:4,step:1,standardDeviation:deviation,higherIsBetter:true,
      homeScoreSensitivity:0,awayScoreSensitivity:0,importance:0,
      explanation:`Turnover margin from ${input.homeTeam}'s perspective. Positive values favor ${input.homeTeam}; negative values favor ${input.awayTeam}.`,
    });
  }
  const homePossessions=input.homeSamples.map((row)=>row.possessions).filter(finite);
  const awayPossessions=input.awaySamples.map((row)=>row.possessions).filter(finite);
  if(homePossessions.length>=4&&awayPossessions.length>=4){
    const values=[...homePossessions,...awayPossessions];
    const deviation=standardDeviation(values);
    variables.push({
      key:"game:possessions",metric:"possessions",side:"game",team:null,label:"Possessions per team",shortLabel:"Possessions",unit:"count",
      baseline:input.projection.possessions,minimum:clamp(Math.min(quantile(values,.04),input.projection.possessions-2*deviation),7,17),
      maximum:clamp(Math.max(quantile(values,.96),input.projection.possessions+2*deviation),7,17),step:.25,standardDeviation:deviation,
      higherIsBetter:true,homeScoreSensitivity:0,awayScoreSensitivity:0,importance:0,
      explanation:"Shared game-level possession environment inferred from both teams' actual pace and drive histories.",
    });
  }
  return variables;
}

function modelValues(variables:WinConditionVariable[],overrides:Record<string,number>={}){
  return Object.fromEntries(variables.map((variable)=>[
    variable.key,
    clamp(finite(overrides[variable.key])?overrides[variable.key]:variable.baseline,variable.minimum,variable.maximum),
  ]));
}

function scenarioScores(
  baseline:WinConditionAnalysis["baseline"],
  variables:WinConditionVariable[],
  model:WinConditionScenarioModel,
  overrides:Record<string,number>={},
){
  const values=modelValues(variables,overrides);
  const possessions=values["game:possessions"]??baseline.possessions;
  const sidePoints=(side:"home"|"away")=>{
    const features:{[key:string]:number}={...(side==="home"?model.homeFeatures:model.awayFeatures)};
    const prefix=`${side}:`;
    const baseYpa=side==="home"?model.homeYardsPerPass:model.awayYardsPerPass;
    const baseYpc=side==="home"?model.homeYardsPerRush:model.awayYardsPerRush;
    const passAttempts=side==="home"?model.homePassAttempts:model.awayPassAttempts;
    const rushAttempts=side==="home"?model.homeRushAttempts:model.awayRushAttempts;
    const plays=Math.max(1,passAttempts+rushAttempts);
    const ypa=values[`${prefix}yardsPerPass`]??baseYpa;
    const ypc=values[`${prefix}yardsPerRush`]??baseYpc;
    const baseYpp=(baseYpa*passAttempts+baseYpc*rushAttempts)/plays;
    const changedYpp=(ypa*passAttempts+ypc*rushAttempts)/plays;
    features.efficiency+=Math.log(clamp(changedYpp/Math.max(.1,baseYpp),.55,1.75))/3;
    const successKey=`${prefix}successRate`,successVariable=variables.find((row)=>row.key===successKey);
    if(successVariable)features.efficiency+=Math.log(clamp((values[successKey]??successVariable.baseline)/Math.max(.01,successVariable.baseline),.55,1.75))/3;
    for(const metric of ["passingExplosiveness","rushingExplosiveness"] as const){
      const key=`${prefix}${metric}`,variable=variables.find((row)=>row.key===key);
      if(variable)features.explosiveness+=Math.log(clamp((values[key]??variable.baseline)/Math.max(.01,variable.baseline),.5,1.9))/3;
    }
    const havocKey=`${prefix}havocAllowed`,havoc=variables.find((row)=>row.key===havocKey);
    if(havoc)features.protection+=Math.log(clamp(havoc.baseline/Math.max(.01,values[havocKey]??havoc.baseline),.5,1.9))/2;
    const driveKey=`${prefix}pointsPerDrive`,drive=variables.find((row)=>row.key===driveKey);
    if(drive){
      const driveValue=values[driveKey]??drive.baseline;
      // Drive production and the simpler scoring anchor move together in real
      // team-game rows. Moving only the ridge model's driveAnchor would break
      // that covariance and can invert an otherwise obvious football effect.
      features.driveAnchor=driveValue;
      features.scoringAnchor+=driveValue-drive.baseline;
    }
    const expectedPoints=predictPointsPerPossession(features as PossessionFeatures)*possessions;
    const baselineRaw=side==="home"?model.homeRawExpectedPoints:model.awayRawExpectedPoints;
    const baselineFinal=side==="home"?baseline.homeScore:baseline.awayScore;
    const retainedStatisticalWeight=1-.55*clamp(model.outcomeBlend,0,.8);
    return baselineFinal+(expectedPoints-baselineRaw)*retainedStatisticalWeight;
  };
  let homeScore=sidePoints("home"),awayScore=sidePoints("away");
  const turnover=values["game:turnoverMargin"];
  const turnoverVariable=variables.find((row)=>row.key==="game:turnoverMargin");
  if(turnoverVariable&&finite(turnover)){
    const marginSwing=model.turnoverPointsPerMargin*(turnover-turnoverVariable.baseline);
    homeScore+=marginSwing/2;
    awayScore-=marginSwing/2;
  }
  homeScore=Math.max(0,homeScore);awayScore=Math.max(0,awayScore);
  return {homeScore,awayScore,homeWinProbability:1/(1+Math.exp(-(homeScore-awayScore)/model.logisticScale)),values};
}

function empiricalTurnoverCoefficient(home:WinConditionHistoricalSample[],away:WinConditionHistoricalSample[]){
  const rows=[...home,...away].filter((row)=>finite(row.turnoverMargin)&&finite(row.points)&&finite(row.opponentPoints));
  if(rows.length<6)return 3.4;
  const x=rows.map((row)=>Number(row.turnoverMargin)),y=rows.map((row)=>Number(row.points)-Number(row.opponentPoints));
  const xMean=average(x),yMean=average(y);
  const variance=x.reduce((sum,value)=>sum+(value-xMean)**2,0);
  if(variance<1e-6)return 3.4;
  return clamp(x.reduce((sum,value,index)=>sum+(value-xMean)*(y[index]-yMean),0)/variance,1.5,6.5);
}

function scenarioModel(input:BuildWinConditionInput):WinConditionScenarioModel{
  return {
    homeFeatures:{...input.projection.homeStats.scoreReceipt.features},
    awayFeatures:{...input.projection.awayStats.scoreReceipt.features},
    homeRawExpectedPoints:input.projection.homeStats.scoreReceipt.rawExpectedPoints,
    awayRawExpectedPoints:input.projection.awayStats.scoreReceipt.rawExpectedPoints,
    homeYardsPerPass:input.projection.homeStats.ypa,homeYardsPerRush:input.projection.homeStats.ypc,
    homePassAttempts:input.projection.homeStats.patt,homeRushAttempts:input.projection.homeStats.ratt,
    awayYardsPerPass:input.projection.awayStats.ypa,awayYardsPerRush:input.projection.awayStats.ypc,
    awayPassAttempts:input.projection.awayStats.patt,awayRushAttempts:input.projection.awayStats.ratt,
    outcomeBlend:input.projection.outcomeBlend,turnoverPointsPerMargin:empiricalTurnoverCoefficient(input.homeSamples,input.awaySamples),logisticScale,
  };
}

function applySensitivities(baseline:WinConditionAnalysis["baseline"],variables:WinConditionVariable[],model:WinConditionScenarioModel){
  const base=scenarioScores(baseline,variables,model);
  return variables.map((variable)=>{
    const favorableDelta=Math.max(variable.step,variable.standardDeviation*.65)*(variable.higherIsBetter?1:-1);
    const changed=scenarioScores(baseline,variables,model,{[variable.key]:variable.baseline+favorableDelta});
    const scale=Math.max(variable.step,Math.abs(favorableDelta));
    const homeSensitivity=(changed.homeScore-base.homeScore)/scale;
    const awaySensitivity=(changed.awayScore-base.awayScore)/scale;
    return {...variable,homeScoreSensitivity:homeSensitivity,awayScoreSensitivity:awaySensitivity,importance:Math.abs(homeSensitivity-awaySensitivity)*variable.standardDeviation};
  }).sort((left,right)=>right.importance-left.importance||left.key.localeCompare(right.key));
}

function sampleMetric(row:WinConditionHistoricalSample,metric:WinConditionMetric){
  if(metric==="turnoverMargin"||metric==="possessions")return row[metric];
  return row[metric];
}

function residualValue(variable:WinConditionVariable,sample:WinConditionHistoricalSample,samples:WinConditionHistoricalSample[]){
  const values=samples.map((row)=>sampleMetric(row,variable.metric)).filter(finite);
  const sampled=sampleMetric(sample,variable.metric);
  if(!finite(sampled)||values.length<4)return variable.baseline;
  return clamp(variable.baseline+.84*(sampled-average(values)),variable.minimum,variable.maximum);
}

function buildSimulationRows(input:BuildWinConditionInput,baseline:WinConditionAnalysis["baseline"],variables:WinConditionVariable[],model:WinConditionScenarioModel,count:number){
  const random=seededRandom(hashSeed(input.seed??`${input.homeTeam}|${input.awayTeam}|${input.homeWeek}|${input.awayWeek}|${input.neutralSite}`));
  const rows:SimulationRow[]=[];
  const homeTurnoverMean=average(input.homeSamples.map((row)=>row.turnoverMargin).filter(finite));
  const awayTurnoverMean=average(input.awaySamples.map((row)=>row.turnoverMargin).filter(finite));
  const homePossessionMean=average(input.homeSamples.map((row)=>row.possessions).filter(finite));
  const awayPossessionMean=average(input.awaySamples.map((row)=>row.possessions).filter(finite));
  const homePointsMean=average(input.homeSamples.map((row)=>row.points).filter(finite));
  const awayPointsMean=average(input.awaySamples.map((row)=>row.points).filter(finite));
  for(let index=0;index<count;index+=1){
    const homeSample=input.homeSamples[Math.floor(random()*input.homeSamples.length)]??input.homeSamples[0];
    const awaySample=input.awaySamples[Math.floor(random()*input.awaySamples.length)]??input.awaySamples[0];
    const values:Record<string,number>={};
    for(const variable of variables){
      if(variable.side==="home"&&homeSample)values[variable.key]=residualValue(variable,homeSample,input.homeSamples);
      else if(variable.side==="away"&&awaySample)values[variable.key]=residualValue(variable,awaySample,input.awaySamples);
      else if(variable.metric==="turnoverMargin"&&homeSample&&awaySample){
        const homeResidual=finite(homeSample.turnoverMargin)?homeSample.turnoverMargin-homeTurnoverMean:0;
        const awayResidual=finite(awaySample.turnoverMargin)?awaySample.turnoverMargin-awayTurnoverMean:0;
        values[variable.key]=clamp(Math.round(variable.baseline+.5*(homeResidual-awayResidual)),variable.minimum,variable.maximum);
      }else if(variable.metric==="possessions"&&homeSample&&awaySample){
        const homeResidual=finite(homeSample.possessions)?homeSample.possessions-homePossessionMean:0;
        const awayResidual=finite(awaySample.possessions)?awaySample.possessions-awayPossessionMean:0;
        values[variable.key]=clamp(variable.baseline+.5*(homeResidual+awayResidual),variable.minimum,variable.maximum);
      }
    }
    const scored=scenarioScores(baseline,variables,model,values);
    // Remaining scoring noise is drawn from the same empirical game row as
    // every metric. This preserves correlation instead of layering an
    // independent score shock on top of the sampled football performance.
    const homeResidual=homeSample&&finite(homeSample.points)?.22*(homeSample.points-homePointsMean):0;
    const awayResidual=awaySample&&finite(awaySample.points)?.22*(awaySample.points-awayPointsMean):0;
    const rawHomeScore=Math.max(0,scored.homeScore+homeResidual);
    const rawAwayScore=Math.max(0,scored.awayScore+awayResidual);
    rows.push({id:index,values,rawHomeScore,rawAwayScore,homeScore:rawHomeScore,awayScore:rawAwayScore,homeMargin:rawHomeScore-rawAwayScore,total:rawHomeScore+rawAwayScore,homeWon:rawHomeScore>=rawAwayScore,cluster:0});
  }
  // Map the empirical ordering of simulated margins to the same logistic
  // distribution used by the canonical H+ win-probability formula. The rank
  // transform keeps all variable relationships while making the Monte Carlo
  // frequency reconcile with the displayed H+ probability.
  const marginOrder=[...rows].sort((left,right)=>(left.rawHomeScore-left.rawAwayScore)-(right.rawHomeScore-right.rawAwayScore)||left.id-right.id);
  const marginResidual=new Map<number,number>();
  marginOrder.forEach((row,index)=>{
    const probability=clamp((index+.5)/marginOrder.length,.012,.988);
    marginResidual.set(row.id,logisticScale*Math.log(probability/(1-probability)));
  });
  const rawTotals=rows.map((row)=>row.total),rawTotalCenter=average(rawTotals),rawTotalDeviation=Math.max(1,standardDeviation(rawTotals));
  const observedTotals=[...input.homeSamples,...input.awaySamples].flatMap((row)=>finite(row.points)&&finite(row.opponentPoints)?[row.points+row.opponentPoints]:[]);
  const targetTotalDeviation=clamp(standardDeviation(observedTotals),7,20);
  for(const row of rows){
    const margin=baseline.homeScore-baseline.awayScore+(marginResidual.get(row.id)??0);
    const total=clamp(baseline.modelTotal+(row.total-rawTotalCenter)*targetTotalDeviation/rawTotalDeviation,10,110);
    row.homeScore=Math.max(0,(total+margin)/2);
    row.awayScore=Math.max(0,(total-margin)/2);
    row.homeMargin=row.homeScore-row.awayScore;
    row.total=row.homeScore+row.awayScore;
    row.homeWon=row.homeMargin>=0;
  }
  return rows;
}

function conditionCategory(metric:WinConditionMetric){
  if(metric==="yardsPerPass"||metric==="passingExplosiveness")return"PASSING";
  if(metric==="yardsPerRush"||metric==="rushingExplosiveness")return"RUSHING";
  if(metric==="havocAllowed")return"DISRUPTION";
  if(metric==="turnoverMargin")return"TURNOVERS";
  if(metric==="possessions")return"GAME SHAPE";
  if(metric==="pointsPerDrive")return"FINISHING";
  return"EFFICIENCY";
}

function teamVariablePerspective(variable:WinConditionVariable,side:"home"|"away",baselineWin:number){
  if(variable.side==="game"){
    if(variable.metric==="turnoverMargin")return {higherIsBetter:side==="home",label:"Win the turnover margin"};
    const favorite=baselineWin>=.5;
    return {higherIsBetter:favorite,label:favorite?"Create more possessions":"Shorten the game"};
  }
  const owns=variable.side===side;
  if(owns)return {higherIsBetter:variable.higherIsBetter,label:variable.label};
  if(variable.metric==="havocAllowed")return {higherIsBetter:true,label:"Create havoc"};
  if(variable.metric==="yardsPerPass")return {higherIsBetter:false,label:"Limit passing efficiency"};
  if(variable.metric==="yardsPerRush")return {higherIsBetter:false,label:"Limit rushing efficiency"};
  if(variable.metric==="passingExplosiveness")return {higherIsBetter:false,label:"Prevent explosive passes"};
  if(variable.metric==="rushingExplosiveness")return {higherIsBetter:false,label:"Prevent explosive runs"};
  if(variable.metric==="pointsPerDrive")return {higherIsBetter:false,label:"Limit points per drive"};
  return {higherIsBetter:false,label:"Suppress offensive success"};
}

function buildConditions(team:string,side:"home"|"away",baselineWin:number,variables:WinConditionVariable[],rows:SimulationRow[]){
  const conditions:WinCondition[]=[];
  for(const variable of variables){
    const perspective=teamVariablePerspective(variable,side,baselineWin);
    const values=rows.map((row)=>row.values[variable.key]??variable.baseline);
    const candidateQuantiles=perspective.higherIsBetter?[.52,.6,.68,.76]:[.48,.4,.32,.24];
    let best:WinCondition|null=null,bestScore=-Infinity;
    for(const probability of candidateQuantiles){
      const threshold=quantile(values,probability);
      const required=(threshold-variable.baseline)/Math.max(variable.step,variable.standardDeviation)*(perspective.higherIsBetter?1:-1);
      if(required<-.2||required>1.9)continue;
      const achieved=rows.filter((row)=>perspective.higherIsBetter?(row.values[variable.key]??variable.baseline)>=threshold:(row.values[variable.key]??variable.baseline)<=threshold);
      if(achieved.length<Math.max(16,rows.length*.08))continue;
      const wins=achieved.filter((row)=>side==="home"?row.homeWon:!row.homeWon).length;
      const achievementProbability=achieved.length/rows.length;
      const conditional=wins/achieved.length;
      const impact=conditional-baselineWin;
      const score=impact*Math.sqrt(achievementProbability)+.015*variable.importance-.018*Math.max(0,required)**2;
      if(score<=bestScore)continue;
      bestScore=score;
      best={
        id:`${side}:${variable.key}`,variableKey:variable.key,metric:variable.metric,category:conditionCategory(variable.metric),label:perspective.label,
        threshold,baseline:variable.baseline,unit:variable.unit,higherIsBetter:perspective.higherIsBetter,achievementProbability,
        winProbabilityIfAchieved:conditional,requiredStandardDeviations:Math.max(0,required),impact,
        explanation:`This threshold raises ${team}'s simulated win rate by ${Math.max(0,impact*100).toFixed(0)} points while occurring in ${(achievementProbability*100).toFixed(0)}% of modeled games.`,
      };
    }
    if(best&&(best.impact>.008||conditions.length<4))conditions.push(best);
  }
  const ordered=conditions.sort((left,right)=>
    (right.impact*Math.sqrt(right.achievementProbability)-.012*right.requiredStandardDeviations**2)
    -(left.impact*Math.sqrt(left.achievementProbability)-.012*left.requiredStandardDeviations**2)
  );
  const selected:WinCondition[]=[];
  const categories=new Map<string,number>();
  for(const condition of ordered){
    if((categories.get(condition.category)??0)>=2)continue;
    selected.push(condition);categories.set(condition.category,(categories.get(condition.category)??0)+1);
    if(selected.length>=5)break;
  }
  return selected;
}

function clusterFeatures(row:SimulationRow,variables:WinConditionVariable[],baseline:WinConditionAnalysis["baseline"]){
  const value=(key:string)=>{
    const variable=variables.find((candidate)=>candidate.key===key);
    return variable?(row.values[key]-variable.baseline)/Math.max(variable.step,variable.standardDeviation):0;
  };
  return [
    row.homeMargin/14,(row.total-baseline.modelTotal)/12,
    value("home:yardsPerPass"),value("home:yardsPerRush"),value("away:yardsPerPass"),value("away:yardsPerRush"),
    value("game:turnoverMargin"),value("game:possessions"),value("home:havocAllowed"),value("away:havocAllowed"),
  ];
}

function squaredDistance(left:number[],right:number[]){return left.reduce((sum,value,index)=>sum+(value-(right[index]??0))**2,0);}

function assignClusters(rows:SimulationRow[],variables:WinConditionVariable[],baseline:WinConditionAnalysis["baseline"],requestedClusters:number){
  const features=rows.map((row)=>clusterFeatures(row,variables,baseline));
  const clusterCount=clamp(Math.trunc(requestedClusters),3,7);
  const centers:number[][]=[];
  const first=features.reduce((best,current)=>current[0]<best[0]?current:best,features[0]);
  centers.push([...first]);
  while(centers.length<clusterCount){
    const next=features.reduce((best,current)=>{
      const distance=Math.min(...centers.map((center)=>squaredDistance(current,center)));
      return distance>best.distance?{feature:current,distance}:best;
    },{feature:features[0],distance:-1});
    centers.push([...next.feature]);
  }
  for(let iteration=0;iteration<20;iteration+=1){
    const groups=Array.from({length:clusterCount},()=>[] as number[][]);
    features.forEach((feature,index)=>{
      const cluster=centers.reduce((best,center,centerIndex)=>{
        const distance=squaredDistance(feature,center);
        return distance<best.distance?{index:centerIndex,distance}:best;
      },{index:0,distance:Infinity}).index;
      rows[index].cluster=cluster;groups[cluster].push(feature);
    });
    groups.forEach((group,index)=>{
      if(!group.length)return;
      centers[index]=centers[index].map((_,dimension)=>average(group.map((row)=>row[dimension])));
    });
  }
  return centers;
}

function formatConditionValue(value:number,unit:WinConditionUnit){
  if(unit==="percent")return`${(value*100).toFixed(0)}%`;
  if(unit==="yards")return`${value.toFixed(1)} yards`;
  if(unit==="rating")return value.toFixed(2);
  if(unit==="points")return`${value.toFixed(1)} points`;
  if(unit==="margin")return`${value>=0?"+":""}${value.toFixed(0)}`;
  return value.toFixed(1);
}

function clusterDefinition(variable:WinConditionVariable,z:number,homeTeam:string,awayTeam:string){
  const team=variable.side==="home"?homeTeam:variable.side==="away"?awayTeam:homeTeam;
  if(variable.metric==="turnoverMargin")return`${homeTeam} turnover margin ${z>=0?"positive":"negative"}`;
  if(variable.metric==="possessions")return`${z>=0?"More":"Fewer"} possessions than projected`;
  if(variable.metric==="havocAllowed")return`${team} ${z>=0?"allows more":"avoids"} havoc`;
  return`${team} ${variable.shortLabel.toLowerCase()} ${z>=0?"above":"below"} projection`;
}

function clusterLabel(characteristics:Array<{variable:WinConditionVariable;z:number}>,totalZ:number,margin:number,homeTeam:string,awayTeam:string){
  const strongest=characteristics[0];
  if(strongest?.variable.metric==="turnoverMargin"&&Math.abs(strongest.z)>=.8)return"Turnover-driven swing";
  if(strongest?.variable.metric==="possessions"&&strongest.z<-.55)return"Shortened-possession game";
  if(totalZ>=.7)return"High-scoring exchange";
  if(totalZ<=-.7)return"Defensive scoring environment";
  if(strongest?.variable.metric==="yardsPerPass"||strongest?.variable.metric==="passingExplosiveness")return"Passing-game separation";
  if(strongest?.variable.metric==="yardsPerRush"||strongest?.variable.metric==="rushingExplosiveness")return"Run-game control";
  if(strongest?.variable.metric==="havocAllowed")return"Disruption-led script";
  return`${margin>=0?homeTeam:awayTeam} controls the median script`;
}

function buildClusters(rows:SimulationRow[],variables:WinConditionVariable[],baseline:WinConditionAnalysis["baseline"],homeTeam:string,awayTeam:string,clusterCount:number){
  assignClusters(rows,variables,baseline,clusterCount);
  return [...new Set(rows.map((row)=>row.cluster))].flatMap((clusterIndex)=>{
    const members=rows.filter((row)=>row.cluster===clusterIndex);
    if(members.length<Math.max(10,rows.length*.015))return[];
    const occurrenceProbability=members.length/rows.length;
    const homeMargin=average(members.map((row)=>row.homeMargin));
    const total=average(members.map((row)=>row.total));
    const characteristics=variables.map((variable)=>({
      variable,
      z:(average(members.map((row)=>row.values[variable.key]??variable.baseline))-variable.baseline)/Math.max(variable.step,variable.standardDeviation),
    })).sort((left,right)=>Math.abs(right.z)-Math.abs(left.z));
    const defining=characteristics.filter((row)=>Math.abs(row.z)>=.28).slice(0,3);
    const homeWinProbability=members.filter((row)=>row.homeWon).length/members.length;
    const beneficiary=homeWinProbability>=.5?homeTeam:awayTeam;
    const label=clusterLabel(defining,(total-baseline.modelTotal)/12,homeMargin,homeTeam,awayTeam);
    const chaos=characteristics.some((row)=>row.variable.metric==="turnoverMargin"&&Math.abs(row.z)>=.8);
    const definingCharacteristics=defining.map((row)=>clusterDefinition(row.variable,row.z,homeTeam,awayTeam));
    return [{
      id:`script-${clusterIndex+1}`,label,occurrenceProbability,homeWinProbability,
      typicalHomeScore:average(members.map((row)=>row.homeScore)),typicalAwayScore:average(members.map((row)=>row.awayScore)),
      homeMargin,total,beneficiary,chaos,definingCharacteristics,
      explanation:`${beneficiary} wins ${(beneficiary===homeTeam?homeWinProbability:1-homeWinProbability)*100>=50?"most":"a meaningful share of"} games in this cluster. ${definingCharacteristics.join(" · ")||"Results stay close to the H+ baseline."}`,
    } satisfies GameScriptCluster];
  }).sort((left,right)=>right.occurrenceProbability-left.occurrenceProbability);
}

function pathsForTeam(team:string,side:"home"|"away",clusters:GameScriptCluster[]){
  return clusters.flatMap((cluster)=>{
    const winProbability=side==="home"?cluster.homeWinProbability:1-cluster.homeWinProbability;
    if(winProbability<.5||cluster.occurrenceProbability<.025)return[];
    return [{
      id:`${side}:${cluster.id}`,label:cluster.label,occurrenceProbability:cluster.occurrenceProbability,winProbabilityWithinPath:winProbability,
      typicalHomeScore:cluster.typicalHomeScore,typicalAwayScore:cluster.typicalAwayScore,definingConditions:cluster.definingCharacteristics,
      explanation:`${team} wins ${(winProbability*100).toFixed(0)}% of this ${(cluster.occurrenceProbability*100).toFixed(0)}%-frequency game script.`,
    } satisfies VictoryPath];
  }).sort((left,right)=>right.occurrenceProbability*right.winProbabilityWithinPath-left.occurrenceProbability*left.winProbabilityWithinPath).slice(0,4);
}

/**
 * H+ Path Width is intentionally conditional on the games a team wins, not on
 * how often it wins. It combines (55%) normalized entropy across materially
 * different winning script clusters, (25%) the effective number of those
 * clusters, and (20%) the number of distinct attainable condition families.
 * A large favorite and a small underdog can therefore both have broad paths.
 */
function pathWidth(side:"home"|"away",clusters:GameScriptCluster[],conditions:WinCondition[]){
  const winning=clusters.filter((cluster)=>(side==="home"?cluster.homeWinProbability:1-cluster.homeWinProbability)>.5&&cluster.occurrenceProbability>=.025);
  if(!winning.length)return 0;
  const shares=winning.map((cluster)=>cluster.occurrenceProbability*(side==="home"?cluster.homeWinProbability:1-cluster.homeWinProbability));
  const entropy=normalizedEntropy(shares);
  const effectivePaths=Math.exp(-shares.map((value)=>value/shares.reduce((sum,item)=>sum+item,0)).reduce((sum,value)=>sum+value*Math.log(Math.max(1e-9,value)),0));
  const attainableFamilies=new Set(conditions.filter((condition)=>condition.achievementProbability>=.15&&condition.requiredStandardDeviations<=1.5).map((condition)=>condition.category)).size;
  return Math.round(clamp(100*(.55*entropy+.25*clamp((effectivePaths-1)/3,0,1)+.2*clamp(attainableFamilies/4,0,1)),0,100));
}

/**
 * H+ Fragility is a local stress test, not 100 minus Path Width. Each material
 * variable is moved 0.75 empirical standard deviations against the team. The
 * score is 60% the largest win-probability loss and 40% the mean of the three
 * largest losses, scaled to football-relevant 25- and 18-point probability
 * drops. It measures sensitivity of the projected edge, not baseline strength.
 */
function fragility(side:"home"|"away",baseline:WinConditionAnalysis["baseline"],variables:WinConditionVariable[],model:WinConditionScenarioModel){
  const base=side==="home"?baseline.homeWinProbability:1-baseline.homeWinProbability;
  const losses=variables.map((variable)=>{
    const perspective=teamVariablePerspective(variable,side,base);
    const adverse=variable.baseline+(perspective.higherIsBetter?-1:1)*.75*variable.standardDeviation;
    const scenario=scenarioScores(baseline,variables,model,{[variable.key]:adverse});
    const changed=side==="home"?scenario.homeWinProbability:1-scenario.homeWinProbability;
    return Math.max(0,base-changed);
  }).sort((left,right)=>right-left);
  if(!losses.length)return 0;
  const largest=losses[0],topMean=average(losses.slice(0,3));
  return Math.round(clamp(100*(.6*largest/.25+.4*topMean/.18),0,100));
}

function upsetPath(homeTeam:string,awayTeam:string,baseline:WinConditionAnalysis["baseline"],variables:WinConditionVariable[],rows:SimulationRow[],homeConditions:WinCondition[],awayConditions:WinCondition[],clusters:GameScriptCluster[]){
  const underdogSide=baseline.homeWinProbability<.5?"home":"away";
  const underdog=underdogSide==="home"?homeTeam:awayTeam;
  const conditions=underdogSide==="home"?homeConditions:awayConditions;
  const keys=conditions.slice(0,6).map((condition)=>condition.variableKey);
  const candidates=rows.filter((row)=>underdogSide==="home"?row.homeMargin>0:row.homeMargin<0);
  let best:{row:SimulationRow;cost:number;deviations:Array<{condition:WinCondition;z:number;value:number}>}|null=null;
  for(const row of candidates){
    const deviations=conditions.flatMap((condition)=>{
      const variable=variables.find((candidate)=>candidate.key===condition.variableKey);
      if(!variable||!keys.includes(variable.key))return[];
      const value=row.values[variable.key]??variable.baseline;
      const z=(value-variable.baseline)/Math.max(variable.step,variable.standardDeviation)*(condition.higherIsBetter?1:-1);
      return z>0?[{condition,z,value}]:[];
    }).sort((left,right)=>right.z-left.z);
    const primary=deviations.slice(0,4);
    if(!primary.length)continue;
    const extremes=primary.filter((item)=>item.z>1.75).length;
    const simultaneous=primary.filter((item)=>item.z>.9).length;
    const cost=primary.reduce((sum,item)=>sum+item.z**2,0)+1.5*extremes+.45*Math.max(0,simultaneous-1);
    if(!best||cost<best.cost)best={row,cost,deviations:primary};
  }
  if(!best)return null;
  const cluster=clusters.find((candidate)=>candidate.id===`script-${best!.row.cluster+1}`);
  const probability=1/(1+Math.exp(-Math.abs(best.row.homeMargin)/logisticScale));
  const estimatedOccurrenceProbability=clamp(Math.exp(-.5*best.cost)*(cluster?.occurrenceProbability??.12),.005,.5);
  return {
    underdog,scenarioWinProbability:probability,estimatedOccurrenceProbability,typicalHomeScore:best.row.homeScore,typicalAwayScore:best.row.awayScore,
    combinedDeviation:Math.sqrt(best.cost),conditions:best.deviations.slice(0,3).map((item)=>({
      label:item.condition.label,value:item.value,baseline:item.condition.baseline,unit:item.condition.unit,
      higherIsBetter:item.condition.higherIsBetter,standardDeviations:item.z,
    })),
    explanation:`This is the lowest-cost empirically correlated simulation in which ${underdog} moves above 50% without requiring an extreme or incompatible combination.`,
  } satisfies UpsetPath;
}

function baselineInterpretation(input:BuildWinConditionInput){
  const favorite=input.projection.homeWinProbability>=.5?input.homeTeam:input.awayTeam;
  const margin=Math.abs(input.projection.homeScore-input.projection.awayScore);
  const supplied=input.projection.edgeAnalysis?.summary?.trim();
  return supplied||`${favorite} owns the baseline H+ edge by ${margin.toFixed(1)} points, with the win-condition model testing how that edge changes across correlated game scripts.`;
}

export function buildWinConditionAnalysis(input:BuildWinConditionInput):WinConditionAnalysis{
  const simulationCount=clamp(Math.trunc(input.simulationCount??1600),400,5000);
  const baseline:WinConditionAnalysis["baseline"]={
    homeTeam:input.homeTeam,awayTeam:input.awayTeam,neutralSite:input.neutralSite,
    homeScore:input.projection.homeScore,awayScore:input.projection.awayScore,homeWinProbability:input.projection.homeWinProbability,
    modelHomeSpread:input.projection.modelHomeSpread,modelTotal:input.projection.modelTotal,possessions:input.projection.possessions,
    interpretation:baselineInterpretation(input),
  };
  const model=scenarioModel(input);
  let variables=applySensitivities(baseline,buildBaseVariables(input),model);
  const minimumSamples=Math.min(input.homeSamples.length,input.awaySamples.length);
  const advancedVariables=variables.filter((variable)=>!["yardsPerPass","yardsPerRush","turnoverMargin","possessions"].includes(variable.metric)).length;
  const dataQuality:WinConditionQuality=minimumSamples<5||variables.length<5?"baseline-only":minimumSamples<8||advancedVariables<4?"limited":"full";
  if(dataQuality==="baseline-only")variables=variables.slice(0,4);
  const rows=dataQuality==="baseline-only"?[]:buildSimulationRows(input,baseline,variables,model,simulationCount);
  const homeConditions=rows.length?buildConditions(input.homeTeam,"home",baseline.homeWinProbability,variables,rows):[];
  const awayConditions=rows.length?buildConditions(input.awayTeam,"away",1-baseline.homeWinProbability,variables,rows):[];
  const clusters=rows.length?buildClusters(rows,variables,baseline,input.homeTeam,input.awayTeam,input.clusterCount??6):[];
  const homePaths=pathsForTeam(input.homeTeam,"home",clusters),awayPaths=pathsForTeam(input.awayTeam,"away",clusters);
  const homePathWidth=rows.length?pathWidth("home",clusters,homeConditions):null;
  const awayPathWidth=rows.length?pathWidth("away",clusters,awayConditions):null;
  const homeFragility=rows.length?fragility("home",baseline,variables,model):null;
  const awayFragility=rows.length?fragility("away",baseline,variables,model):null;
  return {
    version:"hplus-win-conditions-v1",generatedFromWeek:{home:input.homeWeek,away:input.awayWeek},simulationCount,
    historicalSampleSize:{home:input.homeSamples.length,away:input.awaySamples.length},dataQuality,baseline,variables,
    home:{team:input.homeTeam,side:"home",winProbability:baseline.homeWinProbability,pathWidth:homePathWidth,fragility:homeFragility,conditions:homeConditions,paths:homePaths},
    away:{team:input.awayTeam,side:"away",winProbability:1-baseline.homeWinProbability,pathWidth:awayPathWidth,fragility:awayFragility,conditions:awayConditions,paths:awayPaths},
    easiestUpsetPath:rows.length?upsetPath(input.homeTeam,input.awayTeam,baseline,variables,rows,homeConditions,awayConditions,clusters):null,
    clusters,scenarioModel:model,
    methodology:"H+ Win Conditions v1 starts with the canonical matchup score and win probability. It samples complete, point-in-time historical team-game vectors so efficiency, explosiveness, disruption, turnovers, pace and scoring remain correlated. The empirical margin order is reconciled to the same logistic probability distribution used by H+. Path Width measures diversity within winning scripts; Fragility measures local probability loss under adverse 0.75-standard-deviation stress. No game after either selected snapshot is included.",
  };
}

function scenarioStructuralMetrics(analysis:WinConditionAnalysis,values:Record<string,number>,side:"home"|"away"){
  const team=side==="home"?analysis.home:analysis.away;
  if(team.pathWidth===null||team.fragility===null)return{pathWidth:null,fragility:null};
  const moves=team.conditions.flatMap((condition)=>{
    const variable=analysis.variables.find((candidate)=>candidate.key===condition.variableKey);
    if(!variable)return[];
    const value=values[variable.key]??variable.baseline;
    return[(value-variable.baseline)/Math.max(variable.step,variable.standardDeviation)*(condition.higherIsBetter?1:-1)];
  });
  const favorable=moves.filter((value)=>value>0),adverse=moves.filter((value)=>value<0).map(Math.abs);
  const categories=new Set(team.conditions.filter((condition,index)=>(moves[index]??0)>.25).map((condition)=>condition.category)).size;
  const pathWidth=Math.round(clamp(team.pathWidth+4*categories+3*average(favorable)-4*average(adverse),0,100));
  const fragility=Math.round(clamp(team.fragility+10*average(adverse)-5*average(favorable),0,100));
  return{pathWidth,fragility};
}

export function evaluateWinConditionScenario(analysis:WinConditionAnalysis,overrides:Record<string,number>):WinConditionScenarioResult{
  const scored=scenarioScores(analysis.baseline,analysis.variables,analysis.scenarioModel,overrides);
  const home=scenarioStructuralMetrics(analysis,scored.values,"home"),away=scenarioStructuralMetrics(analysis,scored.values,"away");
  return {
    homeScore:scored.homeScore,awayScore:scored.awayScore,homeWinProbability:scored.homeWinProbability,
    homePathWidth:home.pathWidth,awayPathWidth:away.pathWidth,homeFragility:home.fragility,awayFragility:away.fragility,
  };
}

export function formatWinConditionValue(value:number,unit:WinConditionUnit){return formatConditionValue(value,unit);}
