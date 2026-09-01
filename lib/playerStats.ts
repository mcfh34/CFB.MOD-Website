export const PLAYER_STATS_POSITIONS = ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S", "K", "P"] as const;

function teamJerseyHash(teamName:string) {
  let teamHash=0;
  for(const character of teamName)teamHash=(Math.imul(teamHash,31)+character.charCodeAt(0))>>>0;
  return teamHash;
}

export function offensiveLineJerseyNumber(teamName:string) {
  return 50+(teamJerseyHash(teamName)%30);
}

export function defensiveTackleUnitJerseyNumber(teamName:string) {
  return 90+(teamJerseyHash(`${teamName}:DT`)%10);
}

export type PlayerStatsPosition = (typeof PLAYER_STATS_POSITIONS)[number];
export type PlayerStatsDirection = "asc" | "desc";
export type PlayerStatsFixedSortKey = "name" | "team" | "conference";
export type PlayerStatsMetricKey =
  | "passAttempts" | "passCompletions" | "completionRate" | "passYards" | "yardsPerAttempt" | "passTd" | "passInterceptions"
  | "rushAttempts" | "rushYards" | "yardsPerCarry" | "rushTd"
  | "receptions" | "receivingYards" | "yardsPerReception" | "receivingTd" | "allPurposeYards"
  | "usageRate" | "passPpa" | "rushPpa" | "passingSuccessRate" | "rushingSuccessRate"
  | "opponentRelative" | "opponentUnitQuality" | "supportQuality" | "unitScore"
  | "tackles" | "tfl" | "sacks" | "qbHurries" | "pressures" | "passesDefended" | "defensiveInterceptions" | "fumbleRecoveries" | "ballPlays"
  | "fieldGoalsMade" | "fieldGoalsAttempted" | "fieldGoalRate" | "extraPointsMade"
  | "punts" | "puntYards" | "puntAverage";
export type PlayerStatsSortKey = PlayerStatsFixedSortKey | PlayerStatsMetricKey;
export type PlayerStatsValueFormat = "text" | "integer" | "number1" | "number2" | "number3" | "rate" | "relative" | "quality";
export type PlayerStatsMetrics = Partial<Record<PlayerStatsMetricKey, number | null>>;

export type PlayerStatsSortableRow = {
  name:string;
  team:string;
  conference:string;
  metrics:PlayerStatsMetrics;
};

export type PlayerStatsRow = PlayerStatsSortableRow & {
  id:string;
  rank:number;
  nationalRank:number;
  allEraRank:number|null;
  season:number;
  teamId?:string;
  abbreviation?:string;
  color?:string;
  altColor?:string;
  logo?:string;
  jersey:number|null;
  position:PlayerStatsPosition;
  year:number|null;
  advancedEvidence:boolean;
};

export type PlayerStatsColumn = {
  key:PlayerStatsSortKey;
  label:string;
  dataLabel:string;
  description:string;
  format:PlayerStatsValueFormat;
  defaultDirection:PlayerStatsDirection;
};
export type PlayerStatsMetricColumn = Omit<PlayerStatsColumn,"key"> & {key:PlayerStatsMetricKey};

export type PlayerStatsQualification = {
  label:string;
  minimum:number;
  sampleKeys:readonly PlayerStatsMetricKey[];
};

const fixedColumns:PlayerStatsColumn[] = [
  { key:"name",label:"PLAYER",dataLabel:"PLAYER",description:"Player name, listed position, jersey number and class year for the selected season.",format:"text",defaultDirection:"asc" },
  { key:"team",label:"TEAM",dataLabel:"TEAM",description:"School represented by the player during the selected season.",format:"text",defaultDirection:"asc" },
  { key:"conference",label:"CONFERENCE",dataLabel:"CONF",description:"The school’s conference during the selected season. This column can be sorted independently of the conference filter.",format:"text",defaultDirection:"asc" },
];

const metric = (
  key:PlayerStatsMetricKey,
  label:string,
  description:string,
  format:PlayerStatsValueFormat = "integer",
  defaultDirection:PlayerStatsDirection = "desc",
):PlayerStatsMetricColumn => ({ key,label,dataLabel:label,description,format,defaultDirection });

const positionMetrics:Record<PlayerStatsPosition,PlayerStatsMetricColumn[]> = {
  QB:[
    metric("passAttempts","ATT","Pass attempts recorded for the selected season."),
    metric("passCompletions","CMP","Completed passes recorded for the selected season."),
    metric("completionRate","CMP %","Completions divided by pass attempts.","rate"),
    metric("passYards","PASS YDS","Total passing yards."),
    metric("yardsPerAttempt","YPA","Passing yards divided by pass attempts.","number2"),
    metric("passTd","PASS TD","Passing touchdowns."),
    metric("passInterceptions","INT","Interceptions thrown. Lower is generally better.","integer","asc"),
    metric("passPpa","PASS PPA","Average predicted points added by the player’s passing plays.","number3"),
    metric("passingSuccessRate","PASS SUCCESS","Share of passing plays that kept the offense on schedule for down and distance.","rate"),
    metric("rushPpa","RUSH PPA","Average predicted points added by the player’s rushing plays.","number3"),
    metric("opponentRelative","VS OPP","Production relative to the exact opponent units faced; zero is average schedule-adjusted output.","relative"),
  ],
  RB:[
    metric("rushAttempts","CARRIES","Rushing attempts."),
    metric("rushYards","RUSH YDS","Total rushing yards."),
    metric("yardsPerCarry","YPC","Rushing yards divided by carries.","number2"),
    metric("rushTd","RUSH TD","Rushing touchdowns."),
    metric("receptions","REC","Receptions."),
    metric("receivingYards","REC YDS","Receiving yards."),
    metric("allPurposeYards","ALL-PURPOSE","Rushing, receiving, kickoff-return and punt-return yards combined."),
    metric("rushPpa","RUSH PPA","Average predicted points added by rushing plays.","number3"),
    metric("rushingSuccessRate","RUSH SUCCESS","Share of rushing plays that kept the offense on schedule.","rate"),
    metric("usageRate","USAGE","Share of team opportunities attributed to the player.","rate"),
    metric("opponentRelative","VS OPP","Production relative to the exact opponent units faced.","relative"),
  ],
  WR:[
    metric("receptions","REC","Receptions."),
    metric("receivingYards","REC YDS","Receiving yards."),
    metric("yardsPerReception","YDS / REC","Receiving yards divided by receptions.","number2"),
    metric("receivingTd","REC TD","Receiving touchdowns."),
    metric("allPurposeYards","ALL-PURPOSE","Receiving, rushing and return yards combined."),
    metric("passPpa","REC PPA","Average predicted points added on passing-game opportunities.","number3"),
    metric("passingSuccessRate","REC SUCCESS","Share of passing-game opportunities that kept the offense on schedule.","rate"),
    metric("usageRate","USAGE","Share of team opportunities attributed to the player.","rate"),
    metric("opponentRelative","VS OPP","Production relative to the exact opponent units faced.","relative"),
  ],
  TE:[
    metric("receptions","REC","Receptions."),
    metric("receivingYards","REC YDS","Receiving yards."),
    metric("yardsPerReception","YDS / REC","Receiving yards divided by receptions.","number2"),
    metric("receivingTd","REC TD","Receiving touchdowns."),
    metric("passPpa","REC PPA","Average predicted points added on passing-game opportunities.","number3"),
    metric("passingSuccessRate","REC SUCCESS","Share of passing-game opportunities that kept the offense on schedule.","rate"),
    metric("usageRate","USAGE","Share of team opportunities attributed to the player.","rate"),
    metric("opponentRelative","VS OPP","Production relative to the exact opponent units faced.","relative"),
    metric("supportQuality","TEAM SUPPORT","Quality of the complementary offensive production around the player.","quality"),
  ],
  OL:[
    metric("unitScore","OL GRADE","Opponent-relative five-man offensive-line unit grade on the 50–99 player scale.","integer"),
    metric("opponentRelative","RUN VS OPP","Run output relative to the defensive fronts faced.","relative"),
    metric("opponentUnitQuality","FRONTS FACED","Strength of the defensive fronts in the unit’s schedule.","quality"),
    metric("supportQuality","PASS SUPPORT","Passing-game support surrounding the offensive line.","quality"),
  ],
  EDGE:[
    metric("tackles","TACKLES","Total tackles."),
    metric("tfl","TFL","Tackles for loss.","number1"),
    metric("sacks","SACKS","Quarterback sacks.","number1"),
    metric("qbHurries","HURRIES","Recorded quarterback hurries.","number1"),
    metric("pressures","SACK + HURRY","Sacks and quarterback hurries combined.","number1"),
    metric("fumbleRecoveries","FUM REC","Fumble recoveries."),
    metric("opponentRelative","VS OPP","Production relative to the exact offensive units faced.","relative"),
  ],
  DL:[
    metric("tackles","TACKLES","Total tackles."),
    metric("tfl","TFL","Tackles for loss.","number1"),
    metric("sacks","SACKS","Quarterback sacks.","number1"),
    metric("qbHurries","HURRIES","Recorded quarterback hurries.","number1"),
    metric("pressures","SACK + HURRY","Sacks and quarterback hurries combined.","number1"),
    metric("opponentRelative","VS OPP","Production relative to the exact offensive lines faced.","relative"),
  ],
  LB:[
    metric("tackles","TACKLES","Total tackles."),
    metric("tfl","TFL","Tackles for loss.","number1"),
    metric("sacks","SACKS","Quarterback sacks.","number1"),
    metric("qbHurries","HURRIES","Recorded quarterback hurries.","number1"),
    metric("passesDefended","PD","Passes defended."),
    metric("defensiveInterceptions","INT","Defensive interceptions."),
    metric("fumbleRecoveries","FUM REC","Fumble recoveries."),
    metric("ballPlays","BALL PLAYS","Passes defended, interceptions and fumble recoveries combined."),
    metric("opponentRelative","VS OPP","Production relative to the exact offensive units faced.","relative"),
  ],
  CB:[
    metric("passesDefended","PD","Passes defended."),
    metric("defensiveInterceptions","INT","Defensive interceptions."),
    metric("ballPlays","BALL PLAYS","Passes defended, interceptions and fumble recoveries combined."),
    metric("tackles","TACKLES","Total tackles."),
    metric("tfl","TFL","Tackles for loss.","number1"),
    metric("sacks","SACKS","Quarterback sacks.","number1"),
    metric("opponentRelative","VS OPP","Production relative to the exact passing offenses faced.","relative"),
  ],
  S:[
    metric("tackles","TACKLES","Total tackles."),
    metric("passesDefended","PD","Passes defended."),
    metric("defensiveInterceptions","INT","Defensive interceptions."),
    metric("ballPlays","BALL PLAYS","Passes defended, interceptions and fumble recoveries combined."),
    metric("tfl","TFL","Tackles for loss.","number1"),
    metric("sacks","SACKS","Quarterback sacks.","number1"),
    metric("opponentRelative","VS OPP","Production relative to the exact offensive units faced.","relative"),
  ],
  K:[
    metric("fieldGoalsMade","FGM","Field goals made."),
    metric("fieldGoalsAttempted","FGA","Field goals attempted."),
    metric("fieldGoalRate","FG %","Field goals made divided by attempts.","rate"),
    metric("extraPointsMade","XPM","Extra points made."),
  ],
  P:[
    metric("punts","PUNTS","Total punts."),
    metric("puntYards","PUNT YDS","Total punt yardage."),
    metric("puntAverage","PUNT AVG","Punt yards divided by punts.","number1"),
  ],
};

const defaultSortByPosition:Record<PlayerStatsPosition,PlayerStatsMetricKey> = {
  QB:"passYards",RB:"rushYards",WR:"receivingYards",TE:"receivingYards",OL:"unitScore",EDGE:"sacks",DL:"tfl",LB:"tackles",CB:"passesDefended",S:"tackles",K:"fieldGoalRate",P:"puntAverage",
};

const qualification = (
  minimum:number,
  label:string,
  ...sampleKeys:PlayerStatsMetricKey[]
):PlayerStatsQualification => ({ minimum,label,sampleKeys });

const defensiveSample:PlayerStatsMetricKey[] = [
  "tackles","tfl","sacks","qbHurries","passesDefended","defensiveInterceptions","fumbleRecoveries",
];

const defensiveQualifications = {
  tackles:qualification(10,"10+ recorded defensive events",...defensiveSample),
  tfl:qualification(10,"10+ recorded defensive events",...defensiveSample),
  sacks:qualification(10,"10+ recorded defensive events",...defensiveSample),
  qbHurries:qualification(10,"10+ recorded defensive events",...defensiveSample),
  pressures:qualification(10,"10+ recorded defensive events",...defensiveSample),
  passesDefended:qualification(10,"10+ recorded defensive events",...defensiveSample),
  defensiveInterceptions:qualification(10,"10+ recorded defensive events",...defensiveSample),
  fumbleRecoveries:qualification(10,"10+ recorded defensive events",...defensiveSample),
  ballPlays:qualification(10,"10+ recorded defensive events",...defensiveSample),
  opponentRelative:qualification(10,"10+ recorded defensive events",...defensiveSample),
} satisfies Partial<Record<PlayerStatsMetricKey,PlayerStatsQualification>>;

const positionQualifications:Record<PlayerStatsPosition,Partial<Record<PlayerStatsMetricKey,PlayerStatsQualification>>> = {
  QB:{
    passAttempts:qualification(50,"50+ pass attempts","passAttempts"),
    passCompletions:qualification(50,"50+ pass attempts","passAttempts"),
    completionRate:qualification(100,"100+ pass attempts","passAttempts"),
    passYards:qualification(50,"50+ pass attempts","passAttempts"),
    yardsPerAttempt:qualification(100,"100+ pass attempts","passAttempts"),
    passTd:qualification(50,"50+ pass attempts","passAttempts"),
    passInterceptions:qualification(100,"100+ pass attempts","passAttempts"),
    passPpa:qualification(100,"100+ pass attempts","passAttempts"),
    passingSuccessRate:qualification(100,"100+ pass attempts","passAttempts"),
    rushPpa:qualification(40,"40+ carries","rushAttempts"),
    opponentRelative:qualification(100,"100+ pass attempts","passAttempts"),
  },
  RB:{
    rushAttempts:qualification(40,"40+ carries","rushAttempts"),
    rushYards:qualification(40,"40+ carries","rushAttempts"),
    yardsPerCarry:qualification(75,"75+ carries","rushAttempts"),
    rushTd:qualification(40,"40+ carries","rushAttempts"),
    receptions:qualification(10,"10+ receptions","receptions"),
    receivingYards:qualification(10,"10+ receptions","receptions"),
    allPurposeYards:qualification(250,"250+ all-purpose yards","allPurposeYards"),
    rushPpa:qualification(75,"75+ carries","rushAttempts"),
    rushingSuccessRate:qualification(75,"75+ carries","rushAttempts"),
    usageRate:qualification(75,"75+ carries and receptions","rushAttempts","receptions"),
    opponentRelative:qualification(75,"75+ carries and receptions","rushAttempts","receptions"),
  },
  WR:{
    receptions:qualification(10,"10+ receptions","receptions"),
    receivingYards:qualification(10,"10+ receptions","receptions"),
    yardsPerReception:qualification(20,"20+ receptions","receptions"),
    receivingTd:qualification(10,"10+ receptions","receptions"),
    allPurposeYards:qualification(250,"250+ all-purpose yards","allPurposeYards"),
    passPpa:qualification(20,"20+ receptions","receptions"),
    passingSuccessRate:qualification(20,"20+ receptions","receptions"),
    usageRate:qualification(20,"20+ receptions","receptions"),
    opponentRelative:qualification(20,"20+ receptions","receptions"),
  },
  TE:{
    receptions:qualification(8,"8+ receptions","receptions"),
    receivingYards:qualification(8,"8+ receptions","receptions"),
    yardsPerReception:qualification(15,"15+ receptions","receptions"),
    receivingTd:qualification(8,"8+ receptions","receptions"),
    passPpa:qualification(15,"15+ receptions","receptions"),
    passingSuccessRate:qualification(15,"15+ receptions","receptions"),
    usageRate:qualification(15,"15+ receptions","receptions"),
    opponentRelative:qualification(15,"15+ receptions","receptions"),
    supportQuality:qualification(15,"15+ receptions","receptions"),
  },
  OL:{
    unitScore:qualification(1,"Complete team-unit season profile","unitScore"),
    opponentRelative:qualification(1,"Complete team-unit season profile","unitScore"),
    opponentUnitQuality:qualification(1,"Complete team-unit season profile","unitScore"),
    supportQuality:qualification(1,"Complete team-unit season profile","unitScore"),
  },
  EDGE:{...defensiveQualifications},
  DL:{...defensiveQualifications},
  LB:{...defensiveQualifications},
  CB:{...defensiveQualifications},
  S:{...defensiveQualifications},
  K:{
    fieldGoalsMade:qualification(3,"3+ field-goal attempts","fieldGoalsAttempted"),
    fieldGoalsAttempted:qualification(3,"3+ field-goal attempts","fieldGoalsAttempted"),
    fieldGoalRate:qualification(8,"8+ field-goal attempts","fieldGoalsAttempted"),
    extraPointsMade:qualification(10,"10+ extra points made","extraPointsMade"),
  },
  P:{
    punts:qualification(10,"10+ punts","punts"),
    puntYards:qualification(10,"10+ punts","punts"),
    puntAverage:qualification(20,"20+ punts","punts"),
  },
};

export function playerStatsColumns(position:PlayerStatsPosition) {
  return [...fixedColumns, ...positionMetrics[position]];
}

export function playerStatsMetricColumns(position:PlayerStatsPosition) {
  return [...positionMetrics[position]];
}

export function playerStatsDefaultSortKey(position:PlayerStatsPosition):PlayerStatsMetricKey {
  return defaultSortByPosition[position];
}

export function playerStatsQualification(position:PlayerStatsPosition,key:PlayerStatsMetricKey):PlayerStatsQualification {
  return positionQualifications[position][key] ?? qualification(1,"At least one recorded result",key);
}

export function playerQualifiesForStat(
  row:PlayerStatsSortableRow,
  position:PlayerStatsPosition,
  key:PlayerStatsMetricKey,
) {
  if(playerStatsNumericValue(row,key)===null)return false;
  const rule=playerStatsQualification(position,key);
  const sample=rule.sampleKeys.reduce((total,sampleKey)=>total+(playerStatsNumericValue(row,sampleKey)??0),0);
  return sample>=rule.minimum;
}

export function playerMeetsScatterParticipationThreshold(
  row:PlayerStatsSortableRow,
  position:PlayerStatsPosition,
) {
  const value=(key:PlayerStatsMetricKey)=>playerStatsNumericValue(row,key)??0;
  if(position==="QB")return value("passAttempts")>=100;
  if(position==="RB")return value("rushAttempts")>=75||value("receptions")>=20;
  if(position==="WR")return value("receptions")>=20;
  if(position==="TE")return value("receptions")>=15;
  if(position==="OL")return playerStatsNumericValue(row,"unitScore")!==null;
  if(position==="K")return value("fieldGoalsAttempted")>=8||value("extraPointsMade")>=20;
  if(position==="P")return value("punts")>=20;
  const defensiveEvents=["tackles","tfl","sacks","qbHurries","passesDefended","defensiveInterceptions","fumbleRecoveries"] as const;
  return defensiveEvents.reduce((total,key)=>total+value(key),0)>=20;
}

export function defaultPlayerStatsSortDirection(key:PlayerStatsSortKey, position:PlayerStatsPosition):PlayerStatsDirection {
  return playerStatsColumns(position).find((column) => column.key === key)?.defaultDirection ?? "desc";
}

export function playerStatsNumericValue(row:PlayerStatsSortableRow,key:PlayerStatsSortKey) {
  if (key === "name" || key === "team" || key === "conference") return null;
  const value = row.metrics[key];
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

export function formatPlayerStatsValue(row:PlayerStatsSortableRow,column:PlayerStatsColumn) {
  if (column.key === "name") return row.name;
  if (column.key === "team") return row.team;
  if (column.key === "conference") return row.conference || "FBS";
  const value = playerStatsNumericValue(row,column.key);
  if (value === null) return "—";
  if (column.format === "integer") return Math.round(value).toLocaleString("en-US");
  if (column.format === "number1") return value.toFixed(1);
  if (column.format === "number2") return value.toFixed(2);
  if (column.format === "number3") return value.toFixed(3);
  if (column.format === "rate") return `${(value*100).toFixed(1)}%`;
  if (column.format === "relative") {
    const relative = Math.round((value-.5)*50);
    return `${relative>0?"+":""}${relative}%`;
  }
  if (column.format === "quality") return `${Math.round(value*100)}`;
  return String(value);
}

export function playerStatsValueTone(row:PlayerStatsSortableRow,key:PlayerStatsSortKey):"positive"|"negative"|"" {
  const value=playerStatsNumericValue(row,key);
  if(value===null)return"";
  if(key==="opponentRelative")return value>=.55?"positive":value<=.45?"negative":"";
  if(key==="passPpa"||key==="rushPpa")return value>=.08?"positive":value<=-.08?"negative":"";
  if(key==="fieldGoalRate")return value>=.82?"positive":value<.65?"negative":"";
  if(key==="unitScore")return value>=85?"positive":value<70?"negative":"";
  return"";
}

export function sortPlayerStatsRows<T extends PlayerStatsSortableRow>(
  rows:readonly T[],
  key:PlayerStatsSortKey,
  direction:PlayerStatsDirection,
):T[] {
  const multiplier=direction==="asc"?1:-1;
  return [...rows].sort((first,second)=>{
    if(key==="name"||key==="team"||key==="conference"){
      const left=key==="name"?first.name:key==="team"?first.team:first.conference;
      const right=key==="name"?second.name:key==="team"?second.team:second.conference;
      const compared=left.localeCompare(right,undefined,{sensitivity:"base"});
      if(compared)return compared*multiplier;
    }else{
      const left=playerStatsNumericValue(first,key),right=playerStatsNumericValue(second,key);
      if(left===null&&right!==null)return 1;
      if(left!==null&&right===null)return-1;
      if(left!==null&&right!==null&&left!==right)return(left-right)*multiplier;
    }
    return first.name.localeCompare(second.name,undefined,{sensitivity:"base"})
      ||first.team.localeCompare(second.team,undefined,{sensitivity:"base"});
  });
}

export function playerStatsOrdinalRanks<T extends PlayerStatsSortableRow>(
  rows:readonly T[],
  key:PlayerStatsSortKey,
  direction:PlayerStatsDirection,
  rowKey:(row:T)=>string,
) {
  return new Map(sortPlayerStatsRows(rows,key,direction).map((row,index)=>[rowKey(row),index+1]));
}

export type HistoricalProductionScoreGroup = {score:number;count:number};

export function historicalProductionRank(
  score:number|null,
  groups:readonly HistoricalProductionScoreGroup[],
) {
  if(score===null||!Number.isFinite(score)||groups.length===0)return null;
  return 1+groups.reduce((better,group)=>group.score>score?better+group.count:better,0);
}
