export type ConferenceStandingGame = {
  gameId:string;
  week:number;
  seasonType?:string|null;
  conferenceGame?:boolean|null;
  conferenceChampionship?:boolean|null;
  homeTeam:string;
  homePoints:number;
  awayTeam:string;
  awayPoints:number;
};

export type ConferenceStandingTeam = {
  team:string;
  teamId?:string|null;
  abbreviation?:string|null;
  mascot?:string|null;
  conference:string;
  color?:string|null;
  altColor?:string|null;
  logo?:string|null;
  hPlusRank?:number|null;
  hPlusScore?:number|null;
};

type TiebreakStep =
  | "head-to-head"
  | "mini-league"
  | "division-record"
  | "common-opponents"
  | "ranked-common"
  | "opponent-record"
  | "overall-record"
  | "scoring-margin"
  | "rating";

export type ConferenceRuleProfile = {
  conference:string;
  season:number;
  format:string;
  qualification:string;
  steps:string[];
  note:string;
  sourceUrl:string;
  usesDivisions:boolean;
  standingsCutoffWeek:number|null;
};

export type ConferenceStandingRow = ConferenceStandingTeam & {
  rank:number;
  division:string|null;
  divisionRank:number|null;
  conferenceWins:number;
  conferenceLosses:number;
  conferenceTies:number;
  conferenceRecord:string;
  conferencePct:number;
  overallWins:number;
  overallLosses:number;
  overallTies:number;
  overallRecord:string;
  homeConferenceRecord:string;
  awayConferenceRecord:string;
  opponentConferenceWinPct:number;
  averageConferenceMargin:number;
  tiebreak:string;
  tied:boolean;
  titleGamePosition:boolean;
};

type ResultRecord = { wins:number;losses:number;ties:number };
type WorkingStanding = ConferenceStandingTeam & {
  division:string|null;
  conferenceWins:number;
  conferenceLosses:number;
  conferenceTies:number;
  overallWins:number;
  overallLosses:number;
  overallTies:number;
  divisionWins:number;
  divisionLosses:number;
  divisionTies:number;
  homeConferenceWins:number;
  homeConferenceLosses:number;
  homeConferenceTies:number;
  awayConferenceWins:number;
  awayConferenceLosses:number;
  awayConferenceTies:number;
  conferencePointsFor:number;
  conferencePointsAgainst:number;
  cappedConferenceMargin:number;
  results:Map<string,ResultRecord>;
  opponentConferenceWinPct:number;
};

type InternalRule = ConferenceRuleProfile & { procedure:TiebreakStep[] };

const officialSources:Record<string,string>={
  ACC:"https://theacc.com/news/2026/7/15/acc-announces-new-football-championship-tiebreaker-policy.aspx",
  "American Athletic":"https://theamerican.org/sports/football",
  "Big 12":"https://big12sports.com/sports/2024/9/6/FB_0906243427.aspx?path=football",
  "Big Ten":"https://bigten.org/fb/article/blt6104802d94ebe1ab/",
  "Conference USA":"https://conferenceusa.com/sports/football",
  "Mid-American":"https://getsomemaction.com/sports/2025/11/12/FB_1112255434.aspx",
  "Mountain West":"https://themw.com/sports/football/",
  "Pac-12":"https://pac-12.com/news/2026/5/26/pac-12s-2026-football-broadcast-schedule-and-kickoff-times-announced.aspx",
  SEC:"https://www.secsports.com/news/2024/08/sec-announces-football-tie-breaking-process",
  "Sun Belt":"https://sunbeltsports.org/sports/2018/8/30/FB_Tie-Breakers.aspx",
};

const stepLabels:Record<TiebreakStep,string>={
  "head-to-head":"Head-to-head result",
  "mini-league":"Tied-team mini-league",
  "division-record":"Divisional win percentage",
  "common-opponents":"All common conference opponents",
  "ranked-common":"Common opponents from highest to lowest",
  "opponent-record":"Combined conference record of opponents",
  "overall-record":"Overall FBS record",
  "scoring-margin":"Capped conference scoring margin",
  rating:"Official rating metric / H+ proxy",
};

const sunBeltEast=new Set(["App State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Marshall","Old Dominion"]);
const sunBeltWest=new Set(["Arkansas State","Louisiana","ULM","South Alabama","Southern Miss","Troy","Texas State","Louisiana Tech"]);

export function conferenceDivision(conference:string,team:string,season:number) {
  if(conference!=="Sun Belt"||season<2018)return null;
  if(sunBeltEast.has(team))return "East";
  if(sunBeltWest.has(team)){
    if(team==="Texas State"&&season>=2026)return null;
    if(team==="Louisiana Tech"&&season<2026)return null;
    return "West";
  }
  return null;
}

function ruleProfile(conference:string,season:number):InternalRule {
  const common={conference,season,sourceUrl:officialSources[conference]??"",usesDivisions:false,standingsCutoffWeek:null};
  if(conference==="ACC"&&season>=2026)return {...common,
    format:"Single table · uneven-schedule safeguards",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","opponent-record","overall-record","rating"],
    steps:["Head-to-head and tied-team results","Common conference opponents","Conference-opponent record","Overall body of work","Official rating metric or deterministic fallback"],
    note:"The 2026 ACC policy gives head-to-head priority while accounting for teams playing eight or nine league games.",
  };
  if(conference==="American Athletic")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","rating","overall-record"],
    steps:["Head-to-head and tied-team results","CFP/composite performance ranking","Overall record"],
    note:"The American uses head-to-head when available, then its published CFP or composite performance metrics.",
  };
  if(conference==="Big 12")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","ranked-common","opponent-record","overall-record","rating"],
    steps:["Head-to-head or tied-team mini-league","All common conference opponents","Highest-placed common opponent downward","Combined conference record of opponents","Total wins","SportSource rating or deterministic fallback"],
    note:"Conference games determine the table; multi-team ties restart as teams are separated.",
  };
  if(conference==="Big Ten")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","ranked-common","opponent-record","rating"],
    steps:["Head-to-head or tied-team mini-league","All common conference opponents","Highest-placed common opponent downward","Combined conference record of opponents","SportSource rating or deterministic fallback"],
    note:"The Big Ten compares common opponents collectively before moving down the conference table.",
  };
  if(conference==="Mid-American")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","rating","ranked-common","opponent-record"],
    steps:["Head-to-head or tied-team mini-league","All common opponents","SportSource Team Rating Score","Highest-placed common opponent downward","Combined conference record of opponents"],
    note:"The MAC places its official Team Rating Score before later schedule-based criteria.",
  };
  if(conference==="Mountain West")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","rating","overall-record"],
    steps:["Head-to-head or tied-team results","CFP/composite computer ranking","Overall record"],
    note:"When head-to-head cannot settle the tie, the Mountain West uses its selected ranking composite.",
  };
  if(conference==="Pac-12"&&season>=2026)return {...common,
    format:"Eight-team round robin",
    qualification:"Top two after the seven-game conference round robin",
    procedure:["head-to-head","mini-league","rating"],
    steps:["Head-to-head result","Tied-team mini-league","Official ranking metric or deterministic fallback"],
    note:"The 2026 title matchup is fixed after Week 12. Week 13 flex games do not alter the conference table.",
    standingsCutoffWeek:12,
  };
  if(conference==="SEC")return {...common,
    format:season>=2024?"Single table":"Divisional-era table",
    qualification:season>=2024?"Top two teams by conference winning percentage":"Conference order by league winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","ranked-common","opponent-record","scoring-margin","rating"],
    steps:["Head-to-head or tied-team mini-league","All common conference opponents","Highest-placed common opponent downward","Combined conference record of opponents","Capped relative conference scoring margin","Deterministic fallback"],
    note:"The SEC uses only conference results through its opponent-record step, followed by a capped scoring-margin metric.",
  };
  if(conference==="Sun Belt"&&season>=2018)return {...common,
    format:"East and West divisions",
    qualification:"Each division winner advances to the championship game",
    procedure:["head-to-head","mini-league","division-record","ranked-common","common-opponents","rating","overall-record"],
    steps:["Head-to-head or tied-team mini-league","Divisional win percentage","Next-highest divisional opponent downward","Common non-divisional conference opponents","CFP/computer composite","Overall FBS record"],
    note:"Teams are ordered inside their division; the East and West leaders occupy the two title-game positions.",
    usesDivisions:true,
  };
  if(conference==="Conference USA")return {...common,
    format:"Single table",
    qualification:"Top two teams by conference winning percentage",
    procedure:["head-to-head","mini-league","rating","overall-record"],
    steps:["Head-to-head or tied-team results","CFP/computer ranking","Overall record"],
    note:"CUSA publishes a single table and uses head-to-head first when teams finish with the same league record.",
  };
  return {...common,
    format:"Single table",
    qualification:"Conference order by league winning percentage",
    procedure:["head-to-head","mini-league","common-opponents","opponent-record","overall-record","rating"],
    steps:["Head-to-head or tied-team mini-league","Common conference opponents","Conference-opponent record","Overall record","Deterministic fallback"],
    note:"The available on-field tiebreak sequence is applied before the Harper+ deterministic fallback.",
  };
}

export function conferenceRuleProfile(conference:string,season:number):ConferenceRuleProfile {
  const {procedure:_,...profile}=ruleProfile(conference,season);
  void _;
  return profile;
}

function winPct(wins:number,losses:number,ties=0) {
  const games=wins+losses+ties;
  return games?(wins+ties*.5)/games:0;
}

function recordLabel(wins:number,losses:number,ties=0) {
  return ties?`${wins}–${losses}–${ties}`:`${wins}–${losses}`;
}

function addResult(record:ResultRecord|undefined,won:boolean,tied:boolean) {
  const next=record??{wins:0,losses:0,ties:0};
  if(tied)next.ties+=1;
  else if(won)next.wins+=1;
  else next.losses+=1;
  return next;
}

function resultAgainst(row:WorkingStanding,opponents:Set<string>) {
  const record={wins:0,losses:0,ties:0};
  for(const opponent of opponents){
    const result=row.results.get(opponent);
    if(!result)continue;
    record.wins+=result.wins;
    record.losses+=result.losses;
    record.ties+=result.ties;
  }
  return record;
}

function commonOpponents(group:WorkingStanding[]) {
  if(!group.length)return new Set<string>();
  const tiedTeams=new Set(group.map((row)=>row.team));
  const common=[...group[0].results.keys()].filter((opponent)=>!tiedTeams.has(opponent)&&group.every((row)=>row.results.has(opponent)));
  return new Set(common);
}

function vectorCompare(left:number[],right:number[]) {
  const length=Math.max(left.length,right.length);
  for(let index=0;index<length;index+=1){
    const difference=(right[index]??.5)-(left[index]??.5);
    if(Math.abs(difference)>1e-9)return difference;
  }
  return 0;
}

function rankedOpponentVector(row:WorkingStanding,opponents:Set<string>,allRows:WorkingStanding[]) {
  const placements=[...new Set(allRows.filter((candidate)=>opponents.has(candidate.team)).map((candidate)=>winPct(candidate.conferenceWins,candidate.conferenceLosses,candidate.conferenceTies)))].sort((a,b)=>b-a);
  return placements.map((placement)=>{
    const placementOpponents=new Set(allRows.filter((candidate)=>opponents.has(candidate.team)&&Math.abs(winPct(candidate.conferenceWins,candidate.conferenceLosses,candidate.conferenceTies)-placement)<1e-9).map((candidate)=>candidate.team));
    const record=resultAgainst(row,placementOpponents);
    return winPct(record.wins,record.losses,record.ties);
  });
}

function compareStep(step:TiebreakStep,left:WorkingStanding,right:WorkingStanding,group:WorkingStanding[],allRows:WorkingStanding[]) {
  if(step==="head-to-head"){
    if(group.length!==2)return 0;
    const leftRecord=left.results.get(right.team),rightRecord=right.results.get(left.team);
    if(!leftRecord||!rightRecord)return 0;
    return winPct(rightRecord.wins,rightRecord.losses,rightRecord.ties)-winPct(leftRecord.wins,leftRecord.losses,leftRecord.ties);
  }
  if(step==="mini-league"){
    if(group.length<3)return 0;
    const tiedTeams=new Set(group.map((row)=>row.team));
    const leftRecord=resultAgainst(left,tiedTeams),rightRecord=resultAgainst(right,tiedTeams);
    if(leftRecord.wins+leftRecord.losses+leftRecord.ties===0||rightRecord.wins+rightRecord.losses+rightRecord.ties===0)return 0;
    return winPct(rightRecord.wins,rightRecord.losses,rightRecord.ties)-winPct(leftRecord.wins,leftRecord.losses,leftRecord.ties);
  }
  if(step==="division-record")return winPct(right.divisionWins,right.divisionLosses,right.divisionTies)-winPct(left.divisionWins,left.divisionLosses,left.divisionTies);
  const common=commonOpponents(group);
  if(step==="common-opponents"){
    if(!common.size)return 0;
    const leftRecord=resultAgainst(left,common),rightRecord=resultAgainst(right,common);
    return winPct(rightRecord.wins,rightRecord.losses,rightRecord.ties)-winPct(leftRecord.wins,leftRecord.losses,leftRecord.ties);
  }
  if(step==="ranked-common"){
    if(!common.size)return 0;
    return vectorCompare(rankedOpponentVector(left,common,allRows),rankedOpponentVector(right,common,allRows));
  }
  if(step==="opponent-record")return right.opponentConferenceWinPct-left.opponentConferenceWinPct;
  if(step==="overall-record")return winPct(right.overallWins,right.overallLosses,right.overallTies)-winPct(left.overallWins,left.overallLosses,left.overallTies);
  if(step==="scoring-margin"){
    const leftGames=left.conferenceWins+left.conferenceLosses+left.conferenceTies;
    const rightGames=right.conferenceWins+right.conferenceLosses+right.conferenceTies;
    return right.cappedConferenceMargin/Math.max(1,rightGames)-left.cappedConferenceMargin/Math.max(1,leftGames);
  }
  const leftScore=left.hPlusScore??(left.hPlusRank?1/left.hPlusRank:0);
  const rightScore=right.hPlusScore??(right.hPlusRank?1/right.hPlusRank:0);
  return rightScore-leftScore;
}

function sortTiedGroup(group:WorkingStanding[],procedure:TiebreakStep[],allRows:WorkingStanding[]) {
  const sorted=[...group].sort((left,right)=>{
    for(const step of procedure){
      const difference=compareStep(step,left,right,group,allRows);
      if(Math.abs(difference)>1e-9)return difference;
    }
    return (left.hPlusRank??999)-(right.hPlusRank??999)||left.team.localeCompare(right.team);
  });
  const reasonFor=(row:WorkingStanding,index:number)=>{
    const neighbor=sorted[index===sorted.length-1?Math.max(0,index-1):index+1];
    for(const step of procedure){
      if(Math.abs(compareStep(step,row,neighbor,group,allRows))>1e-9)return stepLabels[step];
    }
    return "Harper+ rank fallback";
  };
  return sorted.map((row,index)=>({row,tiebreak:reasonFor(row,index)}));
}

function orderTable(rows:WorkingStanding[],procedure:TiebreakStep[]) {
  const recordGroups=new Map<string,WorkingStanding[]>();
  for(const row of rows){
    const key=winPct(row.conferenceWins,row.conferenceLosses,row.conferenceTies).toFixed(9);
    const group=recordGroups.get(key)??[];
    group.push(row);
    recordGroups.set(key,group);
  }
  return [...recordGroups.entries()].sort((left,right)=>Number(right[0])-Number(left[0])).flatMap(([,group])=>group.length===1
    ?[{row:group[0],tiebreak:"Conference winning percentage",tied:false}]
    :sortTiedGroup(group,procedure,rows).map((entry)=>({...entry,tied:true})));
}

export function buildConferenceStandings(args:{conference:string;season:number;teams:ConferenceStandingTeam[];games:ConferenceStandingGame[]}) {
  const rule=ruleProfile(args.conference,args.season);
  const rows=args.teams.filter((team)=>team.conference===args.conference).map<WorkingStanding>((team)=>({
    ...team,
    division:conferenceDivision(args.conference,team.team,args.season),
    conferenceWins:0,conferenceLosses:0,conferenceTies:0,overallWins:0,overallLosses:0,overallTies:0,
    divisionWins:0,divisionLosses:0,divisionTies:0,homeConferenceWins:0,homeConferenceLosses:0,homeConferenceTies:0,
    awayConferenceWins:0,awayConferenceLosses:0,awayConferenceTies:0,conferencePointsFor:0,conferencePointsAgainst:0,
    cappedConferenceMargin:0,results:new Map(),opponentConferenceWinPct:0,
  }));
  const byTeam=new Map(rows.map((row)=>[row.team,row]));
  const recordOverall=(row:WorkingStanding,points:number,opponentPoints:number)=>{
    if(points===opponentPoints)row.overallTies+=1;
    else if(points>opponentPoints)row.overallWins+=1;
    else row.overallLosses+=1;
  };
  for(const game of args.games){
    if((game.seasonType??"regular")==="postseason")continue;
    const home=byTeam.get(game.homeTeam),away=byTeam.get(game.awayTeam);
    if(home)recordOverall(home,game.homePoints,game.awayPoints);
    if(away)recordOverall(away,game.awayPoints,game.homePoints);
    const withinConference=!game.conferenceChampionship&&Boolean(game.conferenceGame)&&home&&away;
    const beforeCutoff=rule.standingsCutoffWeek===null||game.week<=rule.standingsCutoffWeek;
    if(!withinConference||!beforeCutoff)continue;
    const tied=game.homePoints===game.awayPoints,homeWon=game.homePoints>game.awayPoints;
    if(tied){home.conferenceTies+=1;away.conferenceTies+=1;home.homeConferenceTies+=1;away.awayConferenceTies+=1;}
    else if(homeWon){home.conferenceWins+=1;away.conferenceLosses+=1;home.homeConferenceWins+=1;away.awayConferenceLosses+=1;}
    else{away.conferenceWins+=1;home.conferenceLosses+=1;away.awayConferenceWins+=1;home.homeConferenceLosses+=1;}
    home.results.set(away.team,addResult(home.results.get(away.team),homeWon,tied));
    away.results.set(home.team,addResult(away.results.get(home.team),!homeWon,tied));
    home.conferencePointsFor+=game.homePoints;home.conferencePointsAgainst+=game.awayPoints;
    away.conferencePointsFor+=game.awayPoints;away.conferencePointsAgainst+=game.homePoints;
    home.cappedConferenceMargin+=Math.max(-21,Math.min(21,game.homePoints-game.awayPoints));
    away.cappedConferenceMargin+=Math.max(-21,Math.min(21,game.awayPoints-game.homePoints));
    if(home.division&&home.division===away.division){
      if(tied){home.divisionTies+=1;away.divisionTies+=1;}
      else if(homeWon){home.divisionWins+=1;away.divisionLosses+=1;}
      else{away.divisionWins+=1;home.divisionLosses+=1;}
    }
  }
  for(const row of rows){
    let opponentWins=0,opponentLosses=0,opponentTies=0;
    for(const opponent of row.results.keys()){
      const opponentRow=byTeam.get(opponent);
      if(!opponentRow)continue;
      opponentWins+=opponentRow.conferenceWins;
      opponentLosses+=opponentRow.conferenceLosses;
      opponentTies+=opponentRow.conferenceTies;
    }
    row.opponentConferenceWinPct=winPct(opponentWins,opponentLosses,opponentTies);
  }

  const groups=rule.usesDivisions
    ?[...new Set(rows.map((row)=>row.division??"Conference"))].sort((left,right)=>left==="East"?-1:right==="East"?1:left==="West"?-1:right==="West"?1:left.localeCompare(right)).map((division)=>({division,rows:rows.filter((row)=>(row.division??"Conference")===division)}))
    :[{division:null,rows}];
  let globalRank=0;
  const standings:ConferenceStandingRow[]=groups.flatMap((group)=>orderTable(group.rows,rule.procedure).map((entry,index)=>{
    const row=entry.row;
    globalRank+=1;
    const conferenceGames=row.conferenceWins+row.conferenceLosses+row.conferenceTies;
    const divisionRank=rule.usesDivisions?index+1:null;
    return {
      team:row.team,teamId:row.teamId,abbreviation:row.abbreviation,mascot:row.mascot,conference:row.conference,
      color:row.color,altColor:row.altColor,logo:row.logo,hPlusRank:row.hPlusRank,hPlusScore:row.hPlusScore,
      rank:rule.usesDivisions?index+1:globalRank,division:row.division,divisionRank,
      conferenceWins:row.conferenceWins,conferenceLosses:row.conferenceLosses,conferenceTies:row.conferenceTies,
      conferenceRecord:recordLabel(row.conferenceWins,row.conferenceLosses,row.conferenceTies),
      conferencePct:winPct(row.conferenceWins,row.conferenceLosses,row.conferenceTies),
      overallWins:row.overallWins,overallLosses:row.overallLosses,overallTies:row.overallTies,
      overallRecord:recordLabel(row.overallWins,row.overallLosses,row.overallTies),
      homeConferenceRecord:recordLabel(row.homeConferenceWins,row.homeConferenceLosses,row.homeConferenceTies),
      awayConferenceRecord:recordLabel(row.awayConferenceWins,row.awayConferenceLosses,row.awayConferenceTies),
      opponentConferenceWinPct:row.opponentConferenceWinPct,
      averageConferenceMargin:conferenceGames?(row.conferencePointsFor-row.conferencePointsAgainst)/conferenceGames:0,
      tiebreak:entry.tiebreak,tied:entry.tied,
      titleGamePosition:conferenceGames>0&&(rule.usesDivisions?divisionRank===1:globalRank<=2),
    };
  }));
  const {procedure:_,...publicRule}=rule;
  void _;
  return {rules:publicRule,rows:standings};
}
