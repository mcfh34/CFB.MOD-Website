export type WeeklyRecordGame={gameId:string;week:number;startDate?:string|null;completed:boolean|number;homeTeam:string;awayTeam:string;homePoints:number|null;awayPoints:number|null;conferenceGame:boolean|number};
export type WeeklyPregameRecord={homeRecordBefore:string;awayRecordBefore:string;homeConferenceRecordBefore:string;awayConferenceRecordBefore:string};

/** Actual standings entering each game, excluding every unplayed projection. */
export function buildWeeklyPregameRecords(games:readonly WeeklyRecordGame[]):Map<string,WeeklyPregameRecord>{
  const overall=new Map<string,[number,number,number]>(),conference=new Map<string,[number,number,number]>();
  const get=(map:Map<string,[number,number,number]>,team:string)=>{
    const value=map.get(team)??[0,0,0];map.set(team,value);return value;
  };
  const format=(map:Map<string,[number,number,number]>,team:string)=>{
    const [wins,losses,ties]=get(map,team);
    return ties?`${wins}–${losses}–${ties}`:`${wins}–${losses}`;
  };
  const snapshots=new Map<string,WeeklyPregameRecord>();
  for(const game of [...games].sort((a,b)=>a.week-b.week||String(a.startDate??"").localeCompare(String(b.startDate??""))||a.gameId.localeCompare(b.gameId))){
    snapshots.set(game.gameId,{
      homeRecordBefore:format(overall,game.homeTeam),awayRecordBefore:format(overall,game.awayTeam),
      homeConferenceRecordBefore:format(conference,game.homeTeam),awayConferenceRecordBefore:format(conference,game.awayTeam),
    });
    if(!game.completed||game.homePoints===null||game.awayPoints===null)continue;
    for(const records of [overall,...(game.conferenceGame?[conference]:[])]){
      const home=get(records,game.homeTeam),away=get(records,game.awayTeam);
      if(game.homePoints>game.awayPoints){home[0]++;away[1]++;}
      else if(game.homePoints<game.awayPoints){away[0]++;home[1]++;}
      else{home[2]++;away[2]++;}
    }
  }
  return snapshots;
}

/** Latest actual records in the selected season; never include projected wins. */
export function buildLatestSeasonRecords(games:readonly WeeklyRecordGame[]){
 const records=new Map<string,{wins:number;losses:number;ties:number;confWins:number;confLosses:number;confTies:number}>();
 const get=(team:string)=>{let r=records.get(team);if(!r){r={wins:0,losses:0,ties:0,confWins:0,confLosses:0,confTies:0};records.set(team,r);}return r;};
 for(const g of games){if(!g.completed||g.homePoints===null||g.awayPoints===null)continue;
  const home=get(g.homeTeam),away=get(g.awayTeam);
  if(g.homePoints>g.awayPoints){home.wins++;away.losses++;if(g.conferenceGame){home.confWins++;away.confLosses++;}}
  else if(g.homePoints<g.awayPoints){away.wins++;home.losses++;if(g.conferenceGame){away.confWins++;home.confLosses++;}}
  else{home.ties++;away.ties++;if(g.conferenceGame){home.confTies++;away.confTies++;}}
 }
 const format=(w:number,l:number,t:number)=>`${w}–${l}${t?`–${t}`:''}`;
 return new Map([...records].map(([team,r])=>[team,{record:format(r.wins,r.losses,r.ties),conferenceRecord:format(r.confWins,r.confLosses,r.confTies)}]));
}
