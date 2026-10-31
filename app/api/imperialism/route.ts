import locationsSnapshot from "../../../lib/data/team-locations.json";
import {visualizationCacheControl} from "../../../lib/visualizationFreshness";
import {visualizationStatus} from "../../../lib/visualizationStatus";
import { currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import type { ImperialGame } from "../../../lib/imperialism";

type StoredTeam = { season:number; team: string; teamId: string | null; conference: string | null; color: string | null; altColor: string | null; logo: string | null };
type CfbdTeam = { id?: number; school?: string; conference?: string; color?: string; alternateColor?: string; logos?: string[]; location?: { latitude?: number; longitude?: number } };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const allYears=query.get("season")==="all";
  const season = allYears?currentCollegeFootballSeason():Number(query.get("season"));
  const firstSeason=allYears?2014:season;
  if (!Number.isInteger(season) || season < 2014 || season > currentCollegeFootballSeason()) {
    return Response.json({ message: "Choose a season from 2014 onward." }, { status: 400 });
  }
  try {
    const { env: runtime } = await import("cloudflare:workers");
    const env = runtime as unknown as PipelineEnv;
    if (!env.DB) return Response.json({ message: "Team locations are unavailable." }, { status: 503 });
    const [teamsResult, gamesResult, freshness] = await Promise.all([
      env.DB.prepare("SELECT season,team,team_id AS teamId,conference,color,alt_color AS altColor,logo FROM cfb_teams WHERE season BETWEEN ? AND ? ORDER BY season DESC,team")
        .bind(firstSeason,season).all<StoredTeam>(),
      env.DB.prepare(`SELECT game_id AS id,g.season,week,season_type AS seasonType,start_date AS startDate,
        home_team AS homeTeam,away_team AS awayTeam,home_points AS homePoints,away_points AS awayPoints
        FROM cfb_games g WHERE g.season BETWEEN ? AND ? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL
        AND EXISTS (SELECT 1 FROM cfb_teams t WHERE t.season=g.season AND t.team=g.home_team)
        AND EXISTS (SELECT 1 FROM cfb_teams t WHERE t.season=g.season AND t.team=g.away_team)
        ORDER BY start_date,game_id`).bind(firstSeason,season).all<{
          id: string; season:number; week: number; seasonType: string; startDate: string | null;
          homeTeam: string; awayTeam: string; homePoints: number; awayPoints: number;
        }>(),
      visualizationStatus(env.DB,season),
    ]);
    const locationRows: CfbdTeam[] = locationsSnapshot.teams.map(team=>({id:Number(team.id),school:team.school,location:{latitude:team.lat,longitude:team.lon}}));
    const storedTeams: StoredTeam[] = [...new Map([...teamsResult.results].reverse().map(team=>[team.team,team])).values()];
    const startingTeams=teamsResult.results.filter(team=>team.season===firstSeason).map(team=>team.team);
    const storedNames = new Set(storedTeams.map(team => team.team));
    const games: ImperialGame[] = gamesResult.results.filter(game =>
      storedNames.has(game.homeTeam) && storedNames.has(game.awayTeam));
    const byId = new Map<string,CfbdTeam>(locationRows.map(team => [String(team.id), team]));
    const byName = new Map<string | undefined,CfbdTeam>(locationRows.map(team => [team.school, team]));
    const teams = storedTeams.flatMap(team => {
      const location = byId.get(String(team.teamId)) ?? byName.get(team.team);
      const lat = location?.location?.latitude, lon = location?.location?.longitude;
      if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      return [{ ...team, lat, lon }];
    });
    return Response.json({
      season, firstSeason, allYears, startingTeams, teams, games, freshness, locationSource:locationsSnapshot.source,
      missingLocations: storedTeams.filter(team => !teams.some(mapped => mapped.team === team.team)).map(team => team.team),
    }, { headers: { "cache-control": visualizationCacheControl(season===currentCollegeFootballSeason()) } });
  } catch {
    return Response.json({ message: "Imperialism data could not be loaded. Try again shortly." }, { status: 503 });
  }
}
