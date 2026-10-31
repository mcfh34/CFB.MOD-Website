import type { NormalizedGame, Profile } from "./dataPipeline";

export type MatchupTest = {
  team:string; area:"pass defense"|"rush defense"|"passing offense"|"rushing offense";
  priorOpponents:number; credibleTests:number; opponent:string;
  upcomingChallengePercent:number|null; ownIndexPercent:number|null;
};

/** Compare each unit with opponents it faced before kickoff, never with its final-season schedule. */
export function matchupTests(game:NormalizedGame,games:readonly NormalizedGame[],profileFor:(team:string,week:number)=>Profile|null,snapshotWeek:number):MatchupTest[]{
  const earlier=(prior:NormalizedGame)=>prior.id!==game.id&&prior.completed&&(
    game.seasonType==="postseason"&&prior.seasonType!=="postseason" ||
    prior.seasonType===game.seasonType&&prior.week<game.week
  );
  const result:MatchupTest[]=[];
  for(const [team,opponent] of [[game.homeTeam,game.awayTeam],[game.awayTeam,game.homeTeam]]){
    const own=profileFor(team,snapshotWeek),upcoming=profileFor(opponent,snapshotWeek);
    const past=games.filter(prior=>earlier(prior)&&(prior.homeTeam===team||prior.awayTeam===team))
      .map(prior=>profileFor(prior.homeTeam===team?prior.awayTeam:prior.homeTeam,snapshotWeek))
      .filter((candidate):candidate is Profile=>Boolean(candidate&&candidate.gamesPlayed>=2));
    for(const [area,index,side] of [["pass defense",1,"off"],["rush defense",2,"off"],["passing offense",1,"def"],["rushing offense",2,"def"]] as const){
      const challenge=(profile:Profile)=>side==="off"?profile.oi[index]:profile.di[index];
      const credible=past.filter(candidate=>side==="off"?challenge(candidate)>=1.06:challenge(candidate)<=.94).length;
      const upcomingIndex=upcoming&&upcoming.gamesPlayed>0?challenge(upcoming):null;
      const ownIndex=own&&own.gamesPlayed>0?(side==="off"?own.di[index]:own.oi[index]):null;
      result.push({team,area,priorOpponents:past.length,credibleTests:credible,opponent,
        upcomingChallengePercent:upcomingIndex===null?null:Math.round(upcomingIndex*100),
        ownIndexPercent:ownIndex!==null&&Number.isFinite(ownIndex)?Math.round(ownIndex*100):null});
    }
  }
  return result;
}
