import type { MatchupEdgeAnalysis } from "./matchupAnalysis";
import type { MatchupTest } from "./matchupTests";
import { apMatchupPriority } from "./weeklyApPoll";

export type WeeklyGameStats = {
  totalYards:number|null;
  yardsPerPlay:number|null;
  passYards:number|null;
  passAttempts:number|null;
  passCompletions:number|null;
  yardsPerPass:number|null;
  rushYards:number|null;
  rushAttempts:number|null;
  yardsPerRush:number|null;
  turnovers:number|null;
};

export type WeeklyGameAdvanced = {
  successRate:number|null;
  explosiveness:number|null;
  ppa:number|null;
  pointsPerDrive:number|null;
  playsPerDrive:number|null;
  thirdDownSuccessRate:number|null;
  redZoneEfficiency:number|null;
  havocRate:number|null;
  lineYards:number|null;
  secondLevelYards:number|null;
  openFieldYards:number|null;
  stuffRate:number|null;
  powerSuccess:number|null;
  rushingSuccessRate:number|null;
  rushingExplosiveness:number|null;
  rushingPpa:number|null;
  completionRate:number|null;
  yardsPerCompletion:number|null;
  passingSuccessRate:number|null;
  passingExplosiveness:number|null;
  passingPpa:number|null;
  standardDownSuccessRate:number|null;
  passingDownSuccessRate:number|null;
};

export type WeeklyReviewGame = {
  generatedFromWeek?:number;
  gameId:string;
  season:number;
  week:number;
  seasonType?:string;
  startDate?:string;
  completed:boolean|number;
  homeTeam:string;
  awayTeam:string;
  homeConference?:string|null;
  awayConference?:string|null;
  homePoints:number|null;
  awayPoints:number|null;
  homeWinProbability:number|null;
  predictedHomeScore:number|null;
  predictedAwayScore:number|null;
  homeLogo?:string;
  awayLogo?:string;
  homeColor?:string|null;
  awayColor?:string|null;
  homeRecordBefore?:string|null;
  awayRecordBefore?:string|null;
  homeConferenceRecordBefore?:string|null;
  awayConferenceRecordBefore?:string|null;
  homePredictedStats?:{passYards:number|null;rushYards:number|null;passAttempts:number|null;rushAttempts:number|null}|null;
  awayPredictedStats?:{passYards:number|null;rushYards:number|null;passAttempts:number|null;rushAttempts:number|null}|null;
  homePredictedAdvanced?:{successRate:number|null}|null;
  awayPredictedAdvanced?:{successRate:number|null}|null;
  edgeAnalysis?:MatchupEdgeAnalysis|null;
  matchupTests?:MatchupTest[]|null;
  homeActualStats?:WeeklyGameStats|null;
  awayActualStats?:WeeklyGameStats|null;
  homeActualAdvanced?:WeeklyGameAdvanced|null;
  awayActualAdvanced?:WeeklyGameAdvanced|null;
  homeStreakAfter?:number|null;
  awayStreakAfter?:number|null;
};

export type WeeklyProjectedRank = {
  team:string;
  rank:number;
  projectedRecord?:string;
};

export type WeeklyGameRead = {
  game:WeeklyReviewGame;
  winner:"home"|"away";
  loser:"home"|"away";
  winnerTeam:string;
  loserTeam:string;
  winnerScore:number;
  loserScore:number;
  winnerLogo?:string;
  loserLogo?:string;
  winnerRank:number|null;
  loserRank:number|null;
  winnerApRank:number|null;
  loserApRank:number|null;
  winnerProjectedRecord?:string;
  loserProjectedRecord?:string;
  winnerPreviousRank:number|null;
  loserPreviousRank:number|null;
  winnerStreak:number|null;
  loserStreak:number|null;
  margin:number;
  modelUpset:boolean;
  projectedUpset:boolean;
  eliteScare:boolean;
  impressiveBlowout:boolean;
  storyScore:number;
};

type Factor = {score:number;text:string};

const finite=(value:number|null|undefined):value is number=>typeof value==="number"&&Number.isFinite(value);
const pct=(value:number)=>`${Math.round(value*100)}%`;
const signed=(value:number)=>`${value>=0?"+":""}${value.toFixed(2)}`;

function rankValue(rank:number|null){
  return rank===null?0:Math.max(0,72-rank*2.15);
}

function deterministicIndex(key:string,length:number){
  let hash=2166136261;
  for(let index=0;index<key.length;index+=1){
    hash^=key.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return Math.abs(hash)%length;
}

export function buildWeeklyGameRead(game:WeeklyReviewGame,ranks:Map<string,WeeklyProjectedRank>,previousRanks:Map<string,WeeklyProjectedRank>=new Map(),apRanks:Map<string,number>=new Map()):WeeklyGameRead|null{
  if(game.seasonType==="postseason")return null;
  if(!Boolean(game.completed)||!finite(game.homePoints)||!finite(game.awayPoints)||game.homePoints===game.awayPoints)return null;
  const winner=game.homePoints>game.awayPoints?"home":"away";
  const loser=winner==="home"?"away":"home";
  const winnerScore=winner==="home"?game.homePoints:game.awayPoints;
  const loserScore=loser==="home"?game.homePoints:game.awayPoints;
  const winnerTeam=winner==="home"?game.homeTeam:game.awayTeam;
  const loserTeam=loser==="home"?game.homeTeam:game.awayTeam;
  const winnerProjection=ranks.get(winnerTeam);
  const loserProjection=ranks.get(loserTeam);
  const winnerRank=winnerProjection?.rank??null;
  const loserRank=loserProjection?.rank??null;
  const winnerPreviousRank=previousRanks.get(winnerTeam)?.rank??null;
  const loserPreviousRank=previousRanks.get(loserTeam)?.rank??null;
  const winnerStreak=(winner==="home"?game.homeStreakAfter:game.awayStreakAfter)??null;
  const loserStreak=(loser==="home"?game.homeStreakAfter:game.awayStreakAfter)??null;
  const expected=game.homeWinProbability===null?null:(game.homeWinProbability>=.5?"home":"away");
  const winnerProbability=game.homeWinProbability===null?.5:winner==="home"?game.homeWinProbability:1-game.homeWinProbability;
  const modelUpset=expected!==null&&expected!==winner;
  const projectedUpset=winnerRank!==null&&loserRank!==null&&winnerRank>loserRank;
  const margin=Math.abs(winnerScore-loserScore);
  const bestRank=winnerRank===null?loserRank:loserRank===null?winnerRank:Math.min(winnerRank,loserRank);
  const bothTop25=winnerRank!==null&&winnerRank<=25&&loserRank!==null&&loserRank<=25;
  const bothTop12=winnerRank!==null&&winnerRank<=12&&loserRank!==null&&loserRank<=12;
  const eliteScare=winnerRank!==null&&winnerRank<=12&&margin<=7;
  const impressiveBlowout=winnerRank!==null&&winnerRank<=20&&margin>=21;
  const marquee=(bothTop25?175+rankValue(winnerRank)+rankValue(loserRank):0)+(bothTop12?85:0);
  const projectedSurprise=projectedUpset
    ?95+Math.min(90,Math.max(0,(winnerRank??0)-(loserRank??0))*2.5)+(loserRank!==null&&loserRank<=12?45:0)
    :0;
  const modelSurprise=modelUpset?65+Math.max(0,.5-winnerProbability)*150:0;
  const scareScore=eliteScare?105+(8-margin)*8:0;
  const blowoutScore=impressiveBlowout?65+Math.min(70,(margin-20)*2)+(loserRank!==null&&loserRank<=40?30:0):0;
  const closeMarquee=bothTop25&&margin<=8?55+(9-margin)*4:0;
  const nationalWeight=rankValue(bestRank)+(winnerRank!==null&&winnerRank<=10?35:0)+(loserRank!==null&&loserRank<=10?35:0);
  const storyScore=marquee+projectedSurprise+modelSurprise+scareScore+blowoutScore+closeMarquee+nationalWeight;
  return{
    game,winner,loser,winnerTeam,loserTeam,winnerScore,loserScore,
    winnerLogo:winner==="home"?game.homeLogo:game.awayLogo,
    loserLogo:loser==="home"?game.homeLogo:game.awayLogo,
    winnerRank,loserRank,winnerApRank:apRanks.get(winnerTeam)??null,loserApRank:apRanks.get(loserTeam)??null,winnerProjectedRecord:winnerProjection?.projectedRecord,loserProjectedRecord:loserProjection?.projectedRecord,
    winnerPreviousRank,loserPreviousRank,winnerStreak,loserStreak,
    margin,modelUpset,projectedUpset,eliteScare,impressiveBlowout,storyScore,
  };
}

export function weeklyStoryLabel(read:WeeklyGameRead){
  if(read.projectedUpset||read.modelUpset){
    if(read.loserRank!==null&&read.loserRank<=10)return"NATIONAL SHOCKER";
    if(read.margin>=14)return"STATEMENT UPSET";
    return"SURPRISE RESULT";
  }
  if(read.eliteScare)return"TOP TEAM TESTED";
  if(read.winnerApRank!==null&&read.loserApRank!==null)return"AP TOP-25 MATCHUP";
  if(read.winnerRank!==null&&read.winnerRank<=25&&read.loserRank!==null&&read.loserRank<=25)return"GAME OF THE WEEK";
  if(read.impressiveBlowout)return"STATEMENT WIN";
  if(read.margin<=7)return"ONE-SCORE FINISH";
  return"AROUND THE COUNTRY";
}

export function weeklyStoryHeadline(read:WeeklyGameRead){
  if(read.projectedUpset||read.modelUpset){
    const templates=[
      `${read.winnerTeam} knocks off ${read.loserTeam}`,
      `${read.winnerTeam} stuns ${read.loserTeam}`,
      `${read.winnerTeam} springs the upset over ${read.loserTeam}`,
      `${read.winnerTeam} shocks ${read.loserTeam}`,
      `${read.winnerTeam} surprises ${read.loserTeam}`,
    ];
    return templates[deterministicIndex(read.game.gameId,templates.length)];
  }
  if(read.eliteScare){
    const templates=[
      `${read.winnerTeam} survives a scare from ${read.loserTeam}`,
      `${read.loserTeam} pushes ${read.winnerTeam} to the brink`,
      `${read.winnerTeam} escapes ${read.loserTeam}`,
    ];
    return templates[deterministicIndex(read.game.gameId,templates.length)];
  }
  if(read.impressiveBlowout){
    const templates=[
      `${read.winnerTeam} overwhelms ${read.loserTeam}`,
      `${read.winnerTeam} delivers a statement against ${read.loserTeam}`,
      `${read.winnerTeam} leaves no doubt against ${read.loserTeam}`,
    ];
    return templates[deterministicIndex(read.game.gameId,templates.length)];
  }
  if(read.winnerRank!==null&&read.winnerRank<=25&&read.loserRank!==null&&read.loserRank<=25){
    return read.margin<=7?`${read.winnerTeam} wins a heavyweight fight with ${read.loserTeam}`:`${read.winnerTeam} separates from ${read.loserTeam}`;
  }
  if(read.margin<=3)return`${read.winnerTeam} edges ${read.loserTeam}`;
  return`${read.winnerTeam} handles ${read.loserTeam}`;
}

export function orderWeeklyStories(reads:WeeklyGameRead[]){
  return [...reads].sort((a,b)=>apMatchupPriority(b.winnerApRank,b.loserApRank)-apMatchupPriority(a.winnerApRank,a.loserApRank)||b.storyScore-a.storyScore);
}

function sideProfiles(read:WeeklyGameRead){
  return{
    winnerStats:read.winner==="home"?read.game.homeActualStats:read.game.awayActualStats,
    loserStats:read.loser==="home"?read.game.homeActualStats:read.game.awayActualStats,
    winnerAdvanced:read.winner==="home"?read.game.homeActualAdvanced:read.game.awayActualAdvanced,
    loserAdvanced:read.loser==="home"?read.game.homeActualAdvanced:read.game.awayActualAdvanced,
  };
}

export function weeklyGameFactors(read:WeeklyGameRead){
  const{winnerStats,loserStats,winnerAdvanced,loserAdvanced}=sideProfiles(read);
  const factors:Factor[]=[];
  const add=(score:number,text:string)=>{if(score>0&&text)factors.push({score,text});};

  if(finite(winnerStats?.turnovers)&&finite(loserStats?.turnovers)&&winnerStats.turnovers!==loserStats.turnovers){
    const delta=loserStats.turnovers-winnerStats.turnovers;
    const winnerCare=winnerStats.turnovers===0
      ?`${read.winnerTeam} played turnover-free football.`
      :winnerStats.turnovers===1
        ?`${read.winnerTeam} gave it away once.`
        :`${read.winnerTeam} gave it away ${winnerStats.turnovers} times.`;
    add(130+Math.abs(delta)*34,delta>0
      ?`${read.loserTeam}'s ${loserStats.turnovers} turnover${loserStats.turnovers===1?"":"s"} handed ${read.winnerTeam} ${delta} extra possession${delta===1?"":"s"}. ${winnerCare}`
      :`${read.winnerTeam} won despite a ${Math.abs(delta)}-turnover disadvantage, overcoming ${winnerStats.turnovers} giveaways.`);
  }

  if(finite(winnerAdvanced?.thirdDownSuccessRate)&&finite(loserAdvanced?.thirdDownSuccessRate)){
    const delta=winnerAdvanced.thirdDownSuccessRate-loserAdvanced.thirdDownSuccessRate;
    add(Math.abs(delta)>=.08?145+Math.abs(delta)*200:0,delta>0
      ?`Third down decided the possession battle: ${read.winnerTeam} converted ${pct(winnerAdvanced.thirdDownSuccessRate)} while ${read.loserTeam} managed ${pct(loserAdvanced.thirdDownSuccessRate)}.`
      :`${read.winnerTeam} survived a third-down deficit of ${pct(winnerAdvanced.thirdDownSuccessRate)} to ${pct(loserAdvanced.thirdDownSuccessRate)}.`);
  }

  if(finite(winnerAdvanced?.redZoneEfficiency)&&finite(loserAdvanced?.redZoneEfficiency)){
    const delta=winnerAdvanced.redZoneEfficiency-loserAdvanced.redZoneEfficiency;
    add(Math.abs(delta)>=.1?140+Math.abs(delta)*180:0,delta>0
      ?`The red zone separated them: ${read.winnerTeam} finished ${pct(winnerAdvanced.redZoneEfficiency)} of its chances against ${read.loserTeam}'s ${pct(loserAdvanced.redZoneEfficiency)}.`
      :`${read.winnerTeam} overcame a red-zone efficiency deficit of ${pct(winnerAdvanced.redZoneEfficiency)} to ${pct(loserAdvanced.redZoneEfficiency)}.`);
  }

  if(finite(winnerStats?.rushYards)&&finite(loserStats?.rushYards)&&finite(winnerStats.yardsPerRush)&&finite(loserStats.yardsPerRush)){
    const yardDelta=winnerStats.rushYards-loserStats.rushYards;
    const rateDelta=winnerStats.yardsPerRush-loserStats.yardsPerRush;
    const openings=[`${read.loserTeam} could not close the run lanes`,"The rushing split explains the imbalance","The ground game supplied the clearest advantage"];
    add(yardDelta>=45||rateDelta>=.8?110+Math.max(0,yardDelta*.35)+Math.max(0,rateDelta*22):0,
      `${openings[deterministicIndex(read.game.gameId,openings.length)]}: ${read.winnerTeam} produced ${Math.round(winnerStats.rushYards)} yards at ${winnerStats.yardsPerRush.toFixed(1)} per carry, compared with ${Math.round(loserStats.rushYards)} at ${loserStats.yardsPerRush.toFixed(1)}.`);
  }

  if(finite(winnerAdvanced?.rushingSuccessRate)&&finite(loserAdvanced?.rushingSuccessRate)){
    const delta=winnerAdvanced.rushingSuccessRate-loserAdvanced.rushingSuccessRate;
    add(delta>=.07?108+delta*210:0,`${read.winnerTeam}'s ground game stayed ahead of the chains on ${pct(winnerAdvanced.rushingSuccessRate)} of runs versus ${pct(loserAdvanced.rushingSuccessRate)} for ${read.loserTeam}.`);
  }

  if(finite(winnerAdvanced?.lineYards)&&finite(loserAdvanced?.lineYards)){
    const delta=winnerAdvanced.lineYards-loserAdvanced.lineYards;
    add(delta>=.45?104+delta*35:0,`${read.winnerTeam} won the line of scrimmage with ${winnerAdvanced.lineYards.toFixed(1)} line yards per rush to ${loserAdvanced.lineYards.toFixed(1)}.`);
  }

  if(finite(winnerStats?.passYards)&&finite(loserStats?.passYards)&&finite(winnerStats.yardsPerPass)&&finite(loserStats.yardsPerPass)){
    const yardDelta=winnerStats.passYards-loserStats.passYards;
    const rateDelta=winnerStats.yardsPerPass-loserStats.yardsPerPass;
    const openings=[`${read.loserTeam} struggled against the passing game`,"Production through the air separated the offenses","The passing numbers show where the defense yielded"];
    add(yardDelta>=70||rateDelta>=1.25?108+Math.max(0,yardDelta*.22)+Math.max(0,rateDelta*18):0,
      `${openings[deterministicIndex(read.game.gameId,openings.length)]}: ${read.winnerTeam} threw for ${Math.round(winnerStats.passYards)} yards at ${winnerStats.yardsPerPass.toFixed(1)} per attempt, while ${read.loserTeam} finished at ${loserStats.yardsPerPass.toFixed(1)}.`);
  }

  if(finite(winnerAdvanced?.passingSuccessRate)&&finite(loserAdvanced?.passingSuccessRate)){
    const delta=winnerAdvanced.passingSuccessRate-loserAdvanced.passingSuccessRate;
    add(delta>=.065?112+delta*220:0,`${read.winnerTeam} consistently won through the air, posting a ${pct(winnerAdvanced.passingSuccessRate)} passing success rate against ${pct(loserAdvanced.passingSuccessRate)}.`);
  }

  if(finite(winnerAdvanced?.passingExplosiveness)&&finite(loserAdvanced?.passingExplosiveness)){
    const delta=winnerAdvanced.passingExplosiveness-loserAdvanced.passingExplosiveness;
    add(delta>=.3?102+delta*35:0,`${read.winnerTeam}'s passing explosiveness reached ${winnerAdvanced.passingExplosiveness.toFixed(2)}, well above ${read.loserTeam}'s ${loserAdvanced.passingExplosiveness.toFixed(2)}.`);
  }

  if(finite(winnerAdvanced?.passingPpa)&&finite(loserAdvanced?.passingPpa)){
    const delta=winnerAdvanced.passingPpa-loserAdvanced.passingPpa;
    add(delta>=.12?118+delta*150:0,`Passing efficiency created the scoring separation: ${read.winnerTeam} generated ${signed(winnerAdvanced.passingPpa)} PPA per pass to ${read.loserTeam}'s ${signed(loserAdvanced.passingPpa)}.`);
  }

  if(finite(winnerAdvanced?.pointsPerDrive)&&finite(loserAdvanced?.pointsPerDrive)){
    const delta=winnerAdvanced.pointsPerDrive-loserAdvanced.pointsPerDrive;
    add(delta>=.45?125+delta*38:0,`${read.winnerTeam} converted possessions into ${winnerAdvanced.pointsPerDrive.toFixed(2)} points per drive; ${read.loserTeam} managed ${loserAdvanced.pointsPerDrive.toFixed(2)}.`);
  }

  if(finite(winnerAdvanced?.passingDownSuccessRate)&&finite(loserAdvanced?.passingDownSuccessRate)){
    const delta=winnerAdvanced.passingDownSuccessRate-loserAdvanced.passingDownSuccessRate;
    add(delta>=.07?116+delta*200:0,`${read.winnerTeam} kept drives alive when the defense had leverage, winning passing downs ${pct(winnerAdvanced.passingDownSuccessRate)} to ${pct(loserAdvanced.passingDownSuccessRate)}.`);
  }

  if(finite(winnerAdvanced?.standardDownSuccessRate)&&finite(loserAdvanced?.standardDownSuccessRate)){
    const delta=winnerAdvanced.standardDownSuccessRate-loserAdvanced.standardDownSuccessRate;
    add(delta>=.07?105+delta*180:0,`${read.winnerTeam} controlled early downs with a ${pct(winnerAdvanced.standardDownSuccessRate)} success rate, keeping ${read.loserTeam} from dictating the game.`);
  }

  if(finite(winnerAdvanced?.havocRate)&&finite(loserAdvanced?.havocRate)){
    const delta=loserAdvanced.havocRate-winnerAdvanced.havocRate;
    add(delta>=.05?110+delta*190:0,`${read.winnerTeam} kept negative disruption to ${pct(winnerAdvanced.havocRate)} of snaps; ${read.loserTeam} absorbed havoc on ${pct(loserAdvanced.havocRate)}.`);
  }

  if(finite(winnerAdvanced?.successRate)&&finite(loserAdvanced?.successRate)){
    const delta=winnerAdvanced.successRate-loserAdvanced.successRate;
    add(delta>=.075?100+delta*180:0,`${read.winnerTeam} sustained offense at a ${pct(winnerAdvanced.successRate)} success rate, ${Math.round(delta*100)} points better than ${read.loserTeam}.`);
  }

  if(finite(winnerAdvanced?.ppa)&&finite(loserAdvanced?.ppa)){
    const delta=winnerAdvanced.ppa-loserAdvanced.ppa;
    add(delta>=.13?106+delta*135:0,`${read.winnerTeam} created ${signed(winnerAdvanced.ppa)} PPA per play versus ${signed(loserAdvanced.ppa)} for ${read.loserTeam}.`);
  }

  if(!factors.length&&finite(winnerStats?.totalYards)&&finite(loserStats?.totalYards)){
    const delta=winnerStats.totalYards-loserStats.totalYards;
    add(40,delta>=0
      ?`${read.winnerTeam} built the clearest overall edge with ${Math.round(winnerStats.totalYards)} total yards to ${Math.round(loserStats.totalYards)}.`
      :`${read.winnerTeam} won despite being outgained ${Math.round(loserStats.totalYards)}-${Math.round(winnerStats.totalYards)}, making its scoring chances count.`);
  }

  const used=new Set<string>();
  return factors.sort((a,b)=>b.score-a.score).filter(({text})=>{
    const category=/per carry|ground game|line of scrimmage/.test(text)?"run":/passing|through the air|PPA per pass/.test(text)?"pass":/turnover|giveaway/.test(text)?"turnover":/drive|downs|Third down/.test(text)?"drives":"other";
    if(used.has(category))return false;
    used.add(category);
    return true;
  }).slice(0,2).map((factor)=>factor.text);
}

export function weeklyGameAnalysis(read:WeeklyGameRead){
  const factors=weeklyGameFactors(read);
  const context=weeklyResultContext(read);
  if(!factors.length&&!context.length)return"Detailed game statistics are not available yet.";
  return [...factors,...context].join(" ");
}

function ordinal(value:number){
  const mod100=value%100;
  if(mod100>=11&&mod100<=13)return`${value}th`;
  return`${value}${value%10===1?"st":value%10===2?"nd":value%10===3?"rd":"th"}`;
}

function rankMove(team:string,won:boolean,current:number|null,previous:number|null,opponent:string,streak:number|null,key:string){
  if(current===null||previous===null)return null;
  const movement=previous-current;
  if(movement===0){
    if((streak??0)>=3&&current<=25)return`${team}'s ${ordinal(streak!)} straight win kept its expected final H+ position at #${current}.`;
    if((streak??0)<=-3&&current<=40)return`${team} remains projected #${current} despite its ${ordinal(Math.abs(streak!))} consecutive loss.`;
    return null;
  }
  const places=Math.abs(movement);
  const crossedPlayoff=movement>0&&previous>12&&current<=12;
  const fellFromPlayoff=movement<0&&previous<=12&&current>12;
  if(crossedPlayoff)return`${team}'s win over ${opponent} moved its expected finish into the H+ top 12, from #${previous} to #${current}.`;
  if(fellFromPlayoff)return`${team}'s loss to ${opponent} moved its expected finish out of the H+ top 12, from #${previous} to #${current}.`;
  const verbs=movement>0?(places>=8?["vaulted","surged","jumped"]:["rose","climbed","improved"]):(places>=8?["tumbled","fell sharply","slid"]:["slipped","fell","dropped"]);
  const verb=verbs[deterministicIndex(`${key}:${team}:rank`,verbs.length)];
  const lead=won&&movement<0?`Even after beating ${opponent}, ${team}`:!won&&movement>0?`Even after losing to ${opponent}, ${team}`:`${team}`;
  return`${lead} ${verb} ${places} spot${places===1?"":"s"}, moving from an expected #${previous} finish to #${current}.`;
}

export function weeklyResultContext(read:WeeklyGameRead){
  const context:string[]=[];
  const winnerRun=read.winnerStreak!==null&&read.winnerStreak>=2?read.winnerStreak:0;
  const loserRun=read.loserStreak!==null&&read.loserStreak<=-2?Math.abs(read.loserStreak):0;
  if(winnerRun&&loserRun){
    context.push(`${read.winnerTeam} extended its run to ${winnerRun} straight wins while handing ${read.loserTeam} a ${ordinal(loserRun)} consecutive loss.`);
  }else if(winnerRun){
    const forms=[
      `${read.winnerTeam} has now won ${winnerRun} straight, with this result extending its climb through the season.`,
      `The victory was ${read.winnerTeam}'s ${ordinal(winnerRun)} in a row, turning one good week into a sustained run.`,
      `${read.winnerTeam}'s winning streak reached ${winnerRun}; ${read.loserTeam} became the latest team unable to stop it.`,
    ];
    context.push(forms[deterministicIndex(`${read.game.gameId}:winner-streak`,forms.length)]);
  }else if(loserRun){
    const forms=[
      `${read.loserTeam}'s slide reached ${loserRun} consecutive losses after this result.`,
      `This was the ${ordinal(loserRun)} straight loss for ${read.loserTeam}, deepening a trend that now extends beyond one bad week.`,
      `${read.loserTeam} has now dropped ${loserRun} in a row, with ${read.winnerTeam} adding to the losing streak.`,
    ];
    context.push(forms[deterministicIndex(`${read.game.gameId}:loser-streak`,forms.length)]);
  }

  const winnerMove=rankMove(read.winnerTeam,true,read.winnerRank,read.winnerPreviousRank,read.loserTeam,read.winnerStreak,read.game.gameId);
  const loserMove=rankMove(read.loserTeam,false,read.loserRank,read.loserPreviousRank,read.winnerTeam,read.loserStreak,read.game.gameId);
  const moves=[winnerMove,loserMove].filter((value):value is string=>Boolean(value));
  if(moves.length===2){
    const winnerDelta=Math.abs((read.winnerPreviousRank??0)-(read.winnerRank??0));
    const loserDelta=Math.abs((read.loserPreviousRank??0)-(read.loserRank??0));
    context.push(winnerDelta>=loserDelta?moves[0]:moves[1]);
  }else if(moves.length)context.push(moves[0]);
  return context;
}
