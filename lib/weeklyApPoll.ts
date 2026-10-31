export type WeeklyApRank={team:string;rank:number};

type PollRank={rank?:unknown;school?:unknown;teamId?:unknown};
type Poll={poll?:unknown;ranks?:PollRank[]};
type PollWeek={season?:unknown;seasonType?:unknown;week?:unknown;polls?:Poll[]};

/** Week 1 is the preseason poll; only the selected game's poll may order its edition. */
export function weeklyApPoll(payload:unknown,season:number,gameWeek:number,teamsById:Map<number,string>=new Map()):WeeklyApRank[]{
  if(!Array.isArray(payload))return[];
  const pollWeek=Math.max(1,gameWeek);
  const editions=(payload as PollWeek[]).filter(item=>item.season===season&&item.seasonType==="regular"&&item.week===pollWeek);
  for(const edition of editions){
    const ap=edition.polls?.find(item=>typeof item.poll==="string"&&/^AP(?: Top 25)?$/i.test(item.poll.trim()));
    if(!ap?.ranks?.length)continue;
    const ranks=ap.ranks.flatMap(item=>{
      const rank=Number(item.rank);
      const mapped=teamsById.get(Number(item.teamId));
      const team=mapped??(typeof item.school==="string"?item.school.trim():"");
      return Number.isInteger(rank)&&rank>=1&&rank<=25&&team?[{team,rank}]:[];
    });
    if(ranks.length)return ranks;
  }
  return[];
}

export function apMatchupPriority(home:number|null|undefined,away:number|null|undefined){
  const value=(rank:number|null|undefined)=>typeof rank==="number"&&rank>=1&&rank<=25?26-rank:0;
  return value(home)+value(away);
}
