import type { Profile } from "./dataPipeline";

type ProjectedSide={ypa:number;ypc:number;patt:number;ratt:number};

/** Every average and rank is taken from the snapshot before this game. */
export function pregameMatchupStats(home:Profile|null,away:Profile|null,field:readonly Profile[],homeExpected:ProjectedSide,awayExpected:ProjectedSide){
  const rank=(profile:Profile|null,index:number,defense=false)=>{
    if(!profile||profile.gamesPlayed<1)return null;
    const value=defense?profile.def[index]:profile.off[index];
    if(!Number.isFinite(value))return null;
    return 1+field.filter(other=>other.gamesPlayed>0&&other.team!==profile.team&&Number.isFinite(defense?other.def[index]:other.off[index])
      &&(defense?other.def[index]<value:other.off[index]>value)).length;
  };
  const rate=(value:number|undefined,profile:Profile|null)=>profile&&profile.gamesPlayed>0&&Number.isFinite(value)?value:null;
  const side=(offense:Profile|null,opponent:Profile|null,expected:ProjectedSide)=>({
    rushing:{
      average:rate(offense?.off[2],offense),rank:rank(offense,2),forcedPercent:rate(offense?.oi[2],offense)===null?null:offense!.oi[2]*100,
      opponentAllowedAverage:rate(opponent?.def[2],opponent),opponentAllowedRank:rank(opponent,2,true),opponentAllowedPercent:rate(opponent?.di[2],opponent)===null?null:opponent!.di[2]*100,
      expected:expected.ypc,expectedYards:expected.ypc*expected.ratt,
    },
    passing:{
      average:rate(offense?.off[1],offense),rank:rank(offense,1),forcedPercent:rate(offense?.oi[1],offense)===null?null:offense!.oi[1]*100,
      opponentAllowedAverage:rate(opponent?.def[1],opponent),opponentAllowedRank:rank(opponent,1,true),opponentAllowedPercent:rate(opponent?.di[1],opponent)===null?null:opponent!.di[1]*100,
      expected:expected.ypa,expectedYards:expected.ypa*expected.patt,
    },
  });
  return {home:side(home,away,homeExpected),away:side(away,home,awayExpected)};
}
