/** Unit ranks use the dated FBS profile field, with matchup evidence dominant. */
export type UnitRankingProfile = {
  team:string;
  gamesPlayed:unknown;
  offYppIndex:unknown;offYpaIndex:unknown;offYpcIndex:unknown;
  defYppIndex:unknown;defYpaIndex:unknown;defYpcIndex:unknown;
  offYpp:unknown;offYpa:unknown;offYpc:unknown;
  defYpp:unknown;defYpa:unknown;defYpc:unknown;
};
export type UnitRanks = {
  offenseRank:number|null;rushOffenseRank:number|null;passOffenseRank:number|null;
  defenseRank:number|null;rushDefenseRank:number|null;passDefenseRank:number|null;
};

const weights=[.4,.35,.25];
const median=(values:number[])=>{
  const ordered=[...values].sort((a,b)=>a-b);
  if(!ordered.length)return 1;
  const middle=Math.floor(ordered.length/2);
  return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
};
const positive=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>0?value:null;
const boundedLogRatio=(value:number,baseline:number)=>Math.log(Math.max(.5,Math.min(2,value/baseline)));

export function rankOffenseAndDefense(profiles:UnitRankingProfile[]) {
  const played=profiles.filter((row)=>Number(row.gamesPlayed)>0);
  const sides:[keyof UnitRanks,(keyof UnitRankingProfile)[],(keyof UnitRankingProfile)[],number][]=[
    ["offenseRank",["offYppIndex","offYpaIndex","offYpcIndex"],["offYpp","offYpa","offYpc"],1],
    ["rushOffenseRank",["offYpcIndex"],["offYpc"],1],
    ["passOffenseRank",["offYpaIndex"],["offYpa"],1],
    ["defenseRank",["defYppIndex","defYpaIndex","defYpcIndex"],["defYpp","defYpa","defYpc"],-1],
    ["rushDefenseRank",["defYpcIndex"],["defYpc"],-1],
    ["passDefenseRank",["defYpaIndex"],["defYpa"],-1],
  ];
  const ranks=new Map<string,UnitRanks>();
  for(const row of profiles)ranks.set(row.team,{
    offenseRank:null,rushOffenseRank:null,passOffenseRank:null,
    defenseRank:null,rushDefenseRank:null,passDefenseRank:null,
  });
  for(const [name,indexKeys,rawKeys,direction] of sides){
    const metrics=[...indexKeys,...rawKeys];
    const baselines=metrics.map(key=>median(played.map(row=>positive(row[key])).filter((value):value is number=>value!==null)));
    const scores=played.flatMap(row=>{
      const values=metrics.map(key=>positive(row[key]));
      if(values.some(value=>value===null))return [];
      const unit=values as number[];
      const score=indexKeys.reduce((sum,_,index)=>sum+(indexKeys.length===1?1:weights[index])*(
        .75*boundedLogRatio(unit[index],baselines[index])+
        .25*boundedLogRatio(unit[index+indexKeys.length],baselines[index+indexKeys.length])
      ),0)*direction;
      return [{team:row.team,score}];
    }).sort((a,b)=>b.score-a.score||a.team.localeCompare(b.team));
    scores.forEach(({team},index)=>{
      ranks.get(team)![name]=index+1;
    });
  }
  return ranks;
}
