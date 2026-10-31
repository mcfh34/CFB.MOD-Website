export type FoodTeam={team:string;conference:string;logo:string|null;color:string|null;abbreviation:string|null};
export type FoodGame={gameId:string;week:number;seasonType:string;homeTeam:string;awayTeam:string;homePoints:number|null;awayPoints:number|null;completed:boolean|number};
export type FoodEdge={gameId:string;winner:string;loser:string;winnerPoints:number;loserPoints:number;week:number};
export type FoodChain={teams:string[];edges:FoodEdge[];key:string};
export function foodEdges(games:FoodGame[],members:Set<string>,throughWeek:number,postseason=false):FoodEdge[]{
  const pairs=new Map<string,FoodEdge>();
  for(const game of games){
    if(!game.completed||game.homePoints===null||game.awayPoints===null||game.homePoints===game.awayPoints||!members.has(game.homeTeam)||!members.has(game.awayTeam))continue;
    if(game.seasonType==='postseason'?!postseason:game.week>throughWeek)continue;
    const home=game.homePoints>game.awayPoints;
    const edge={gameId:game.gameId,winner:home?game.homeTeam:game.awayTeam,loser:home?game.awayTeam:game.homeTeam,winnerPoints:home?game.homePoints:game.awayPoints,loserPoints:home?game.awayPoints:game.homePoints,week:game.week};
    const key=JSON.stringify([edge.winner,edge.loser]);
    if(!pairs.has(key)||pairs.get(key)!.week<edge.week)pairs.set(key,edge);
  }
  return [...pairs.values()];
}
export function findFoodChains(edges:FoodEdge[],size:number,mode:'cycle'|'chain',requiredTeam='',limit=200){
  const outgoing=new Map<string,FoodEdge[]>();
  for(const edge of edges)outgoing.set(edge.winner,[...(outgoing.get(edge.winner)??[]),edge]);
  for(const rows of outgoing.values())rows.sort((a,b)=>a.loser.localeCompare(b.loser));
  const starts=mode==='cycle'&&requiredTeam?[requiredTeam]:[...outgoing.keys()].sort();
  const chains:FoodChain[]=[];let steps=0;const budget=150000;
  function walk(path:string[],links:FoodEdge[]){
    if(chains.length>=limit||steps++>=budget)return;
    const last=path.at(-1)!;
    if(path.length===size){
      if(requiredTeam&&!path.includes(requiredTeam))return;
      const closing=mode==='cycle'?(outgoing.get(last)??[]).find(edge=>edge.loser===path[0]):null;
      if(mode==='cycle'&&!closing)return;
      const chainEdges=closing?[...links,closing]:links;
      chains.push({teams:[...path],edges:chainEdges,key:JSON.stringify(path)});return;
    }
    for(const edge of outgoing.get(last)??[]){
      if(path.includes(edge.loser))continue;
      // The alphabetically first team anchors a cycle, so rotations appear once.
      if(mode==='cycle'&&!requiredTeam&&edge.loser.localeCompare(path[0])<0)continue;
      walk([...path,edge.loser],[...links,edge]);
      if(chains.length>=limit||steps>=budget)break;
    }
  }
  if(size>=3&&size<=12)for(const start of starts){walk([start],[]);if(chains.length>=limit||steps>=budget)break;}
  return {chains,limited:chains.length>=limit||steps>=budget};
}
