export type ImperialGame = {
  id: string;
  season?: number;
  week: number;
  seasonType: string;
  startDate: string | null;
  homeTeam: string;
  awayTeam: string;
  homePoints: number;
  awayPoints: number;
};

/** A seed team's counties travel together with the empire that currently owns them. */
export function territoryOwners(teams: string[], games: ImperialGame[], throughGameCount: number) {
  const eligible = new Set(teams);
  const owners = new Map(teams.map(team => [team, team]));
  const sorted = [...games].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "") || a.id.localeCompare(b.id))
    .slice(0, throughGameCount);
  for (const game of sorted) {
    if (game.homePoints === game.awayPoints || !eligible.has(game.homeTeam) || !eligible.has(game.awayTeam)) continue;
    const winner = game.homePoints > game.awayPoints ? game.homeTeam : game.awayTeam;
    const loser = winner === game.homeTeam ? game.awayTeam : game.homeTeam;
    for (const [seed, owner] of owners) if (owner === loser) owners.set(seed, winner);
  }
  return owners;
}

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians, dLon = (lon2 - lon1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 3958.76 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** One connected patch of counties gets one map logo. */
export function connectedTerritories(ownerByCounty: string[], adjacency: number[][]) {
  const visited = new Uint8Array(ownerByCounty.length);
  const regions: { owner: string; counties: number[] }[] = [];
  for (let start=0;start<ownerByCounty.length;start++) {
    if (visited[start]) continue;
    const owner=ownerByCounty[start], counties=[start];
    visited[start]=1;
    for(let head=0;head<counties.length;head++) {
      for(const neighbor of adjacency[counties[head]] ?? []) {
        if(neighbor<0 || neighbor>=ownerByCounty.length || visited[neighbor] || ownerByCounty[neighbor]!==owner)continue;
        visited[neighbor]=1;
        counties.push(neighbor);
      }
    }
    regions.push({owner,counties});
  }
  return regions;
}

/** Largest axis-aligned square wholly within each rasterized territory. */
export function largestInteriorSquares(labels: Uint16Array, width: number, height: number) {
  const prior = new Uint16Array(width), current = new Uint16Array(width);
  const best = new Map<number,{x:number;y:number;side:number}>();
  for(let y=0;y<height;y++) {
    current.fill(0);
    for(let x=0;x<width;x++) {
      const label=labels[y*width+x];
      if(!label)continue;
      const side=1+Math.min(
        x && labels[y*width+x-1]===label ? current[x-1] : 0,
        y && labels[(y-1)*width+x]===label ? prior[x] : 0,
        x && y && labels[(y-1)*width+x-1]===label ? prior[x-1] : 0,
      );
      current[x]=side;
      if(side>(best.get(label)?.side ?? 0))best.set(label,{x:x-(side-1)/2,y:y-(side-1)/2,side});
    }
    prior.set(current);
  }
  return best;
}

/** Every season continues the prior empire; year is part of each timeline key. */
export function imperialismStages(games:ImperialGame[],allYears=false){
 const ordered=[...games].sort((a,b)=>(a.startDate??"").localeCompare(b.startDate??"")||a.id.localeCompare(b.id));
 const result=[{label:allYears?"2014 · Opening map":"Opening map",count:0,key:"opening"}];
 for(let index=0;index<ordered.length;index++){
  const game=ordered[index],key=`${game.season??""}:${game.seasonType}:${game.week}`;
  const week=game.seasonType!=="regular"?`Postseason · Week ${game.week}`:game.week===14?"Rivalry":game.week===15?"CC":`Week ${game.week}`;
  const label=allYears?`${game.season} · ${week}`:week;
  const prior=result[result.length-1];
  if(prior.key===key)prior.count=index+1;else result.push({key,label,count:index+1});
 }
 return result;
}
