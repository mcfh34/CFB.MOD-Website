export type PhaseGame = {
  gameId:string;
  week:number;
  seasonType?:string|null;
  conferenceGame?:boolean|number|null;
  homeConference?:string|null;
  awayConference?:string|null;
};

function normalizedConference(game:PhaseGame) {
  const home=game.homeConference?.trim();
  const away=game.awayConference?.trim();
  return home&&away&&home===away?home:null;
}

/**
 * CFBD stores conference championships inside the regular-season feed. The
 * championship week has changed across calendar layouts (2023 is Week 14,
 * newer seasons are commonly Week 15), so a fixed week number is not safe.
 *
 * An explicit phase always wins. For legacy rows, the title game is the lone
 * late conference game in that league's latest scheduled week. Regular-season
 * rivalry weeks contain several league games and therefore remain regular.
 */
export function conferenceChampionshipGameIds(games:PhaseGame[]) {
  const ids=new Set<string>();
  const inferredByConference=new Map<string,PhaseGame[]>();

  for(const game of games){
    const seasonType=(game.seasonType??"regular").toLowerCase();
    if(seasonType==="postseason")continue;
    if(seasonType==="conference-championship"){
      ids.add(game.gameId);
      continue;
    }
    const conference=normalizedConference(game);
    if(!conference||!Boolean(game.conferenceGame)||game.week<14)continue;
    const rows=inferredByConference.get(conference)??[];
    rows.push(game);
    inferredByConference.set(conference,rows);
  }

  for(const rows of inferredByConference.values()){
    const latestWeek=Math.max(...rows.map((game)=>game.week));
    const latest=rows.filter((game)=>game.week===latestWeek);
    if(latest.length===1)ids.add(latest[0].gameId);
  }
  return ids;
}

export function gameConference(game:PhaseGame) {
  return normalizedConference(game);
}
