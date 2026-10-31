/** Pregame box-score estimate. Yardage is net of sacks in passing, not rushing. */
export function projectedGameStatProfile(stats:{ypp:number;ypa:number;ypc:number;patt:number;ratt:number;expectedTurnovers?:number|null}){
  const plays=Math.max(0,stats.patt)+Math.max(0,stats.ratt);
  return {
    totalYards:stats.ypp*plays,
    yardsPerPlay:stats.ypp,
    passYards:stats.ypa*stats.patt,
    passAttempts:stats.patt,
    passCompletions:null,
    yardsPerPass:stats.ypa,
    rushYards:stats.ypc*stats.ratt,
    rushAttempts:stats.ratt,
    yardsPerRush:stats.ypc,
    turnovers:stats.expectedTurnovers??null,
    sacksAllowed:null,
    sackYardsLost:null,
  };
}
