import { GET as getPlayerData } from "../player-ratings/route";

export function GET(request:Request) {
  const url=new URL(request.url);
  url.searchParams.set("view","stats");
  return getPlayerData(new Request(url,request));
}
