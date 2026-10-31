/** Team results remain final even when the statistical profile has not caught up. */
export function shouldForecastScheduleGame(game:{completed:unknown;week:unknown;seasonType:unknown},seasonForecast:boolean,forecastWeek:number,preserveFinals:boolean){
 if(!Boolean(game.completed))return true;
 return !preserveFinals&&seasonForecast&&Number(game.week)>forecastWeek&&game.seasonType!=="postseason";
}
