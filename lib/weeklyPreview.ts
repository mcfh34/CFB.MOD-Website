import type { WeeklyReviewGame, WeeklyProjectedRank } from "./weeklyReview";
import { apMatchupPriority, type WeeklyApRank } from "./weeklyApPoll";

export function buildWeeklyPreviews(games:WeeklyReviewGame[],rankings:WeeklyProjectedRank[],apRankings:WeeklyApRank[]=[]){
  const ranks=new Map(rankings.map(row=>[row.team,row]));
  const apRanks=new Map(apRankings.map(row=>[row.team,row.rank]));
  const uses=new Map<string,number>();
  const phrase=(key:string,variants:string[])=>{
    const count=uses.get(key)??0;
    uses.set(key,count+1);
    return variants[count%variants.length];
  };
  return games.filter(game=>!game.completed&&game.seasonType!=="postseason").map(game=>{
    const home=ranks.get(game.homeTeam),away=ranks.get(game.awayTeam);
    const probability=typeof game.homeWinProbability==="number"&&Number.isFinite(game.homeWinProbability)?game.homeWinProbability:null;
    const underdogChance=probability===null?null:Math.min(probability,1-probability);
    const favorite=probability===null||probability===.5?null:probability>.5?game.homeTeam:game.awayTeam;
    const underdog=favorite===game.homeTeam?game.awayTeam:game.homeTeam;
    const upset=underdogChance!==null&&underdogChance>=.28&&underdogChance<.5;
    const conference=Boolean(game.homeConference&&game.homeConference===game.awayConference&&!/independent/i.test(game.homeConference));
    const playoff=[home,away].some(row=>row&&row.rank<=(game.season<=2023?8:20));
    const marquee=Boolean(home&&away&&home.rank<=25&&away.rank<=25);
    const notes:string[]=[];
    const chance=Math.round((underdogChance??0)*100);
    if(upset)notes.push(phrase("upset",[
      `${underdog} is a credible upset threat: H+ gives it a ${chance}% chance of beating ${favorite}.`,
      `${favorite} gets the nod, but the ${chance}% assigned to ${underdog} makes this one worth watching.`,
      `The upset case for ${underdog} starts with the forecast itself—${chance}% to win despite being the underdog.`,
      `This is no comfortable favorite: ${underdog} holds a ${chance}% model win chance against ${favorite}.`,
    ]));
    else if(probability===.5)notes.push("The model has this matchup at 50–50: neither side has a clear edge.");
    else if(favorite)notes.push(phrase("favorite",[
      `H+ leans toward ${favorite}, with a ${100-chance}% win probability.`,
      `${underdog} faces the longer odds here: ${chance}% to win against ${favorite}.`,
      `The forecast favors ${favorite} over ${underdog} (${100-chance}% to win).`,
    ]));
    const hs=game.predictedHomeScore,as=game.predictedAwayScore;
    if(typeof hs==="number"&&Number.isFinite(hs)&&typeof as==="number"&&Number.isFinite(as)){
      const margin=Math.abs(hs-as),total=hs+as;
      if(total>=60)notes.push(phrase("scoring",[
        `A projected ${Math.round(total)} combined points puts scoring pace at the center of this matchup; the expected margin is ${margin.toFixed(1)}.`,
        `The score projection points toward offense: ${Math.round(total)} total points, with ${margin.toFixed(1)} separating the teams.`,
      ]));
      else if(total<=44)notes.push(`Only ${Math.round(total)} combined points are projected. In that scoring environment, a missed scoring opportunity could carry considerable weight.`);
      else if(margin<=7)notes.push(`The projected gap is ${margin.toFixed(1)} points—within one touchdown. The forecast leaves little separation between these teams.`);
    }
    if(conference)notes.push(phrase("conference",[
      `There is a direct ${game.homeConference} consequence: a league victory and a head-to-head result that may matter in a tie.`,
      `Both sides have conference ground to gain. This ${game.homeConference} meeting also establishes their head-to-head result for any applicable tiebreak.`,
      `Beyond the weekly score, this counts in the ${game.homeConference} race; even a close finish leaves one team with the league loss.`,
    ]));
    if(playoff){
      const contenders=[home,away].filter((row):row is WeeklyProjectedRank=>Boolean(row&&row.rank<=(game.season<=2023?8:20)));
      const context=contenders.map(row=>`${row.team}: projected No. ${row.rank}${row.projectedRecord?` (${row.projectedRecord})`:""}`).join("; ");
      notes.push(phrase("playoff",[
        `The national stakes come from the projected finish: ${context}. An upset would force a reassessment of that path.`,
        `Season Sim puts this on the postseason watch list—${context}. An unexpected loss would add pressure to the remaining schedule.`,
        `Keep the final-season picture in view: ${context}. This result contributes to the résumé those projections anticipate.`,
      ]));
    }
    if(!notes.length)notes.push("A model projection is not available for this matchup yet.");
    return {game,home,away,homeApRank:apRanks.get(game.homeTeam)??null,awayApRank:apRanks.get(game.awayTeam)??null,upset,conference,playoff,notes,priority:(marquee?200:0)+(playoff?100:0)+(upset?80:0)+(conference?35:0)+(home?Math.max(0,30-home.rank):0)+(away?Math.max(0,30-away.rank):0)};
  }).sort((a,b)=>apMatchupPriority(b.homeApRank,b.awayApRank)-apMatchupPriority(a.homeApRank,a.awayApRank)||b.priority-a.priority);
}
