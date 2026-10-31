export type TeamSchedulePerformanceGame = {
  homeTeam:string;awayTeam:string;completed:boolean|number;
  homePoints:number|null;awayPoints:number|null;
  pregameHomeScore?:number|null;pregameAwayScore?:number|null;
};

/** Retain only a stored score generated from a model week before kickoff week. */
export function datedPregameScores(game:{completed:boolean|number;week:number;generatedFromWeek:number|null;predictedHomeScore:number|null;predictedAwayScore:number|null}){
  if(!Boolean(game.completed)||game.generatedFromWeek===null||game.generatedFromWeek>=game.week||
    game.predictedHomeScore===null||game.predictedAwayScore===null||
    !Number.isFinite(game.predictedHomeScore)||!Number.isFinite(game.predictedAwayScore))return null;
  return {home:game.predictedHomeScore,away:game.predictedAwayScore};
}

/** Positive values mean the team's actual margin exceeded its pregame margin. */
export function averageMarginVsPregame(team:string,games:TeamSchedulePerformanceGame[],fbsTeams:ReadonlySet<string>){
  const deltas=games.flatMap(game=>{
    if(!Boolean(game.completed)||game.homeTeam!==team&&game.awayTeam!==team)return [];
    if(!fbsTeams.has(game.homeTeam)||!fbsTeams.has(game.awayTeam))return [];
    const numbers=[game.homePoints,game.awayPoints,game.pregameHomeScore,game.pregameAwayScore];
    if(numbers.some(value=>typeof value!=="number"||!Number.isFinite(value)))return [];
    const [home,away,projectedHome,projectedAway]=numbers as number[];
    const direction=game.homeTeam===team?1:-1;
    return [direction*((home-away)-(projectedHome-projectedAway))];
  });
  return {games:deltas.length,pointsPerGame:deltas.length?deltas.reduce((sum,delta)=>sum+delta,0)/deltas.length:null};
}
