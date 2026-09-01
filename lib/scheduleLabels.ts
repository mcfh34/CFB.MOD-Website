export type ScheduleLabelGame={
  season:number;
  week:number;
  seasonType?:string|null;
  startDate?:string|null;
  homeTeam:string;
  awayTeam:string;
};

const playoffFields:Record<number,Set<string>>={
  2014:new Set(["Alabama","Oregon","Florida State","Ohio State"]),
  2015:new Set(["Clemson","Alabama","Michigan State","Oklahoma"]),
  2016:new Set(["Alabama","Clemson","Ohio State","Washington"]),
  2017:new Set(["Clemson","Oklahoma","Georgia","Alabama"]),
  2018:new Set(["Alabama","Clemson","Notre Dame","Oklahoma"]),
  2019:new Set(["LSU","Ohio State","Clemson","Oklahoma"]),
  2020:new Set(["Alabama","Clemson","Ohio State","Notre Dame"]),
  2021:new Set(["Alabama","Michigan","Georgia","Cincinnati"]),
  2022:new Set(["Georgia","Michigan","TCU","Ohio State"]),
  2023:new Set(["Michigan","Washington","Texas","Alabama"]),
  2024:new Set(["Oregon","Georgia","Boise State","Arizona State","Texas","Penn State","Notre Dame","Ohio State","Tennessee","Indiana","SMU","Clemson"]),
  2025:new Set(["Indiana","Ohio State","Georgia","Texas Tech","Oregon","Ole Miss","Texas A&M","Oklahoma","Alabama","Miami","Tulane","James Madison"]),
};

function isArmyNavy(game:ScheduleLabelGame){
  return new Set([game.homeTeam,game.awayTeam]).size===2&&[game.homeTeam,game.awayTeam].includes("Army")&&[game.homeTeam,game.awayTeam].includes("Navy");
}

function isPlayoffGame(game:ScheduleLabelGame){
  const field=playoffFields[game.season];
  return Boolean(field?.has(game.homeTeam)&&field.has(game.awayTeam));
}

function postseasonDate(game:ScheduleLabelGame){
  if(!game.startDate)return null;
  const value=new Date(game.startDate);
  return Number.isNaN(value.getTime())?null:{month:value.getUTCMonth()+1,day:value.getUTCDate()};
}

function playoffRound(game:ScheduleLabelGame){
  const date=postseasonDate(game);
  if(game.season<=2023){
    if(date?.month===1&&date.day>=5)return"CFP NC";
    return"CFP SF";
  }
  if(!date)return"CFP";
  if(date.month===12&&date.day<=23)return"CFP R1";
  if(date.month===12||date.month===1&&date.day<=3)return"CFP QF";
  if(date.month===1&&date.day<=14)return"CFP SF";
  return"CFP NC";
}

export function scheduleGameLabel(game:ScheduleLabelGame){
  if(isArmyNavy(game))return`W${game.week}`;
  const seasonType=(game.seasonType??"regular").toLowerCase();
  if(seasonType==="conference-championship"||seasonType!=="postseason"&&game.week===15)return"CC";
  if(seasonType!=="postseason")return`W${game.week}`;
  return isPlayoffGame(game)?playoffRound(game):"BOWL";
}
