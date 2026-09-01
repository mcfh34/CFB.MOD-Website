import type { PlayerStatsMetricKey, PlayerStatsMetrics } from "./playerStats";

type JsonRecord=Record<string,unknown>;

export type PlayerWeeklyMetricMap=Partial<Record<PlayerStatsMetricKey,number|null>>;

export type PlayerWeeklyBoxGame={
  gameId:string;
  opponent:string;
  metrics:PlayerWeeklyMetricMap;
};

export type PlayerGameBoxLine=PlayerWeeklyBoxGame&{
  playerId:string;
  playerName:string;
};

export type PlayerWeeklyAdvancedGame={
  week:number;
  opponent:string;
  metrics:PlayerWeeklyMetricMap;
};

export type PlayerWeeklySortableGame={gameId:string;week:number;seasonType:string;date:string};

export function comparePlayerWeeklyGames(left:PlayerWeeklySortableGame,right:PlayerWeeklySortableGame){
  const leftDate=Date.parse(left.date),rightDate=Date.parse(right.date);
  if(Number.isFinite(leftDate)&&Number.isFinite(rightDate)&&leftDate!==rightDate)return leftDate-rightDate;
  if(Number.isFinite(leftDate)!==Number.isFinite(rightDate))return Number.isFinite(leftDate)?-1:1;
  const leftPostseason=left.seasonType==="postseason"?1:0,rightPostseason=right.seasonType==="postseason"?1:0;
  return leftPostseason-rightPostseason||left.week-right.week||left.gameId.localeCompare(right.gameId);
}

const records=(value:unknown):JsonRecord[]=>Array.isArray(value)
  ?value.filter((entry):entry is JsonRecord=>Boolean(entry&&typeof entry==="object"))
  :[];
const text=(value:unknown)=>String(value??"").trim();
const normalized=(value:unknown)=>text(value).toLowerCase().replace(/[^a-z0-9]/g,"");
const nameKey=(value:unknown)=>text(value).toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean).sort().join("");
const finite=(value:unknown)=>{
  if(value===null||value===undefined||value==="")return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const numericStat=(value:unknown)=>{
  const match=text(value).replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);
  return match?finite(match[0]):null;
};
const pairedStat=(value:unknown):[number|null,number|null]=>{
  const match=text(value).replace(/,/g,"").match(/^\s*(-?\d+(?:\.\d+)?)\s*[\/-]\s*(-?\d+(?:\.\d+)?)\s*$/);
  return match?[finite(match[1]),finite(match[2])]:[null,null];
};
const sumPresent=(values:Array<number|null>)=>values.some((value)=>value!==null)
  ?values.reduce<number>((total,value)=>total+(value??0),0)
  :null;

function athleteMatches(athlete:JsonRecord,playerId:string,playerName:string){
  const athleteId=text(athlete.id);
  if(playerId&&athleteId&&athleteId===playerId)return true;
  return Boolean(playerName&&nameKey(athlete.name)===nameKey(playerName));
}

function playerStatLookup(team:JsonRecord,playerId:string,playerName:string){
  const values=new Map<string,string>();
  for(const category of records(team.categories)){
    const categoryName=normalized(category.name);
    for(const type of records(category.types)){
      const athlete=records(type.athletes).find((entry)=>athleteMatches(entry,playerId,playerName));
      if(athlete)values.set(`${categoryName}:${normalized(type.name)}`,text(athlete.stat));
    }
  }
  return(categoryAliases:string[],typeAliases:string[])=>{
    for(const category of categoryAliases.map(normalized)){
      for(const type of typeAliases.map(normalized)){
        const exact=values.get(`${category}:${type}`);
        if(exact!==undefined)return exact;
      }
    }
    return undefined;
  };
}

function playerBoxMetrics(team:JsonRecord,playerId:string,playerName:string):PlayerWeeklyMetricMap{
  const lookup=playerStatLookup(team,playerId,playerName);
  const passing=["passing"],rushing=["rushing"],receiving=["receiving"];
  const defense=["defensive","defense"],kicking=["kicking"],punting=["punting"];
  const passPair=pairedStat(lookup(passing,["C/ATT","CMP/ATT","completions/attempts"]));
  const fgPair=pairedStat(lookup(kicking,["FG","FGM/FGA","field goals"]));
  const xpPair=pairedStat(lookup(kicking,["XP","XPM/XPA","PAT"]));
  const passCompletions=passPair[0]??numericStat(lookup(passing,["CMP","completions"]));
  const passAttempts=passPair[1]??numericStat(lookup(passing,["ATT","attempts"]));
  const passYards=numericStat(lookup(passing,["YDS","yards"]));
  const rushAttempts=numericStat(lookup(rushing,["CAR","ATT","carries","attempts"]));
  const rushYards=numericStat(lookup(rushing,["YDS","yards"]));
  const receptions=numericStat(lookup(receiving,["REC","receptions"]));
  const receivingYards=numericStat(lookup(receiving,["YDS","yards"]));
  const kickReturnYards=numericStat(lookup(["kick returns","kickreturns"],["YDS","yards"]));
  const puntReturnYards=numericStat(lookup(["punt returns","puntreturns"],["YDS","yards"]));
  const sacks=numericStat(lookup(defense,["SACK","SACKS"]));
  const qbHurries=numericStat(lookup(defense,["QB HUR","QB HURRIES","HURRIES"]));
  const passesDefended=numericStat(lookup(defense,["PD","passes defended","pass breakups"]));
  const defensiveInterceptions=numericStat(lookup(["interceptions","defensive","defense"],["INT","interceptions"]));
  const fumbleRecoveries=numericStat(lookup(["fumbles","defensive","defense"],["REC","recoveries","fumble recoveries"]));
  const fieldGoalsMade=fgPair[0]??numericStat(lookup(kicking,["FGM","field goals made"]));
  const fieldGoalsAttempted=fgPair[1]??numericStat(lookup(kicking,["FGA","field goals attempted"]));
  const punts=numericStat(lookup(punting,["NO","PUNTS","punt attempts"]));
  const puntYards=numericStat(lookup(punting,["YDS","yards"]));
  return{
    passAttempts,passCompletions,
    completionRate:passAttempts&&passCompletions!==null?passCompletions/passAttempts:null,
    passYards,yardsPerAttempt:passAttempts&&passYards!==null?passYards/passAttempts:null,
    passTd:numericStat(lookup(passing,["TD","touchdowns"])),
    passInterceptions:numericStat(lookup(passing,["INT","interceptions"])),
    rushAttempts,rushYards,yardsPerCarry:rushAttempts&&rushYards!==null?rushYards/rushAttempts:null,
    rushTd:numericStat(lookup(rushing,["TD","touchdowns"])),
    receptions,receivingYards,yardsPerReception:receptions&&receivingYards!==null?receivingYards/receptions:null,
    receivingTd:numericStat(lookup(receiving,["TD","touchdowns"])),
    allPurposeYards:sumPresent([rushYards,receivingYards,kickReturnYards,puntReturnYards]),
    tackles:numericStat(lookup(defense,["TOT","TOTAL","TACKLES"])),
    tfl:numericStat(lookup(defense,["TFL","tackles for loss"])),
    sacks,qbHurries,pressures:sumPresent([sacks,qbHurries]),passesDefended,defensiveInterceptions,fumbleRecoveries,
    ballPlays:sumPresent([passesDefended,defensiveInterceptions,fumbleRecoveries]),
    fieldGoalsMade,fieldGoalsAttempted,
    fieldGoalRate:fieldGoalsAttempted&&fieldGoalsMade!==null?fieldGoalsMade/fieldGoalsAttempted:null,
    extraPointsMade:xpPair[0]??numericStat(lookup(kicking,["XPM","extra points made","PAT made"])),
    punts,puntYards,puntAverage:punts&&puntYards!==null?puntYards/punts:null,
  };
}

export function playerWeeklyBoxGames(payload:unknown,teamName:string,playerId:string,playerName:string):PlayerWeeklyBoxGame[]{
  return records(payload).flatMap((game)=>{
    const teams=records(game.teams);
    const team=teams.find((entry)=>text(entry.team)===teamName);
    if(!team)return[];
    const metrics=playerBoxMetrics(team,playerId,playerName);
    if(!Object.values(metrics).some((value)=>value!==null&&value!==undefined))return[];
    const opponent=teams.find((entry)=>entry!==team);
    return[{gameId:text(game.id),opponent:text(opponent?.team)||"Opponent",metrics}];
  });
}

export function playerGameBoxLines(payload:unknown,teamName:string):PlayerGameBoxLine[]{
  return records(payload).flatMap((game)=>{
    const teams=records(game.teams);
    const team=teams.find((entry)=>text(entry.team)===teamName);
    if(!team)return[];
    const athletes=new Map<string,{id:string;name:string}>();
    for(const category of records(team.categories))for(const type of records(category.types))for(const athlete of records(type.athletes)){
      const id=text(athlete.id),name=text(athlete.name);
      if(!id&&!name)continue;
      const key=id||nameKey(name);
      if(!athletes.has(key))athletes.set(key,{id,name});
    }
    const opponent=teams.find((entry)=>entry!==team);
    return[...athletes.values()].flatMap((athlete)=>{
      const metrics=playerBoxMetrics(team,athlete.id,athlete.name);
      if(!Object.values(metrics).some((value)=>value!==null&&value!==undefined))return[];
      return[{gameId:text(game.id),opponent:text(opponent?.team)||"Opponent",playerId:athlete.id,playerName:athlete.name,metrics}];
    });
  });
}

export function aggregatePlayerGameLines(lines:PlayerGameBoxLine[]):PlayerGameBoxLine[]{
  const rateKeys=new Set(["completionRate","yardsPerAttempt","yardsPerCarry","yardsPerReception","fieldGoalRate","puntAverage"]);
  const groups=new Map<string,PlayerGameBoxLine>();
  for(const line of lines){
    const key=line.playerId||nameKey(line.playerName);
    const current=groups.get(key)??{gameId:"season-to-date",opponent:"Season to date",playerId:line.playerId,playerName:line.playerName,metrics:{}};
    for(const [metric,value] of Object.entries(line.metrics)){
      if(rateKeys.has(metric)||typeof value!=="number"||!Number.isFinite(value))continue;
      const stat=metric as keyof PlayerWeeklyMetricMap;
      current.metrics[stat]=(current.metrics[stat]??0)+value;
    }
    groups.set(key,current);
  }
  for(const line of groups.values()){
    const metric=(key:keyof PlayerWeeklyMetricMap)=>line.metrics[key]??null;
    const rate=(numerator:keyof PlayerWeeklyMetricMap,denominator:keyof PlayerWeeklyMetricMap)=>{
      const top=metric(numerator),bottom=metric(denominator);
      return typeof top==="number"&&typeof bottom==="number"&&bottom>0?top/bottom:null;
    };
    line.metrics.completionRate=rate("passCompletions","passAttempts");
    line.metrics.yardsPerAttempt=rate("passYards","passAttempts");
    line.metrics.yardsPerCarry=rate("rushYards","rushAttempts");
    line.metrics.yardsPerReception=rate("receivingYards","receptions");
    line.metrics.fieldGoalRate=rate("fieldGoalsMade","fieldGoalsAttempted");
    line.metrics.puntAverage=rate("puntYards","punts");
  }
  return[...groups.values()];
}

export function playerWeeklyPpaGames(payload:unknown,playerId:string,playerName:string):PlayerWeeklyAdvancedGame[]{
  return records(payload).flatMap((row)=>{
    if(!athleteMatches(row,playerId,playerName))return[];
    const average=row.averagePPA&&typeof row.averagePPA==="object"?row.averagePPA as JsonRecord:{};
    return[{week:finite(row.week)??0,opponent:text(row.opponent),metrics:{
      passPpa:finite(average.pass),rushPpa:finite(average.rush),
    }}];
  });
}

export function playerWeeklySuccessGames(payload:unknown,playerId:string,playerName:string):PlayerWeeklyAdvancedGame[]{
  return records(payload).flatMap((row)=>{
    if(!athleteMatches(row,playerId,playerName))return[];
    const passing=row.passing&&typeof row.passing==="object"?row.passing as JsonRecord:{};
    const rushing=row.rushing&&typeof row.rushing==="object"?row.rushing as JsonRecord:{};
    return[{week:finite(row.week)??0,opponent:text(row.opponent),metrics:{
      passingSuccessRate:finite(passing.successRate),rushingSuccessRate:finite(rushing.successRate),
    }}];
  });
}

export function playerWeeklySupportedMetric(key:PlayerStatsMetricKey){
  const unsupported=new Set<PlayerStatsMetricKey>(["usageRate","opponentRelative","opponentUnitQuality","supportQuality","unitScore"]);
  return!unsupported.has(key);
}

export function playerWeeklyMetricValue(metrics:PlayerWeeklyMetricMap,key:PlayerStatsMetricKey){
  const value=metrics[key as keyof PlayerStatsMetrics];
  return typeof value==="number"&&Number.isFinite(value)?value:null;
}
