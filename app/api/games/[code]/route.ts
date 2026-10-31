import { getStoredGame } from "@/db/game-store";
import { buildGameView, parseSeat, tokenMatches } from "@/lib/game/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const url = new URL(request.url);
  const seat = parseSeat(url.searchParams.get("seat"));
  const token = url.searchParams.get("token") ?? "";
  if (!seat || !token) {
    return Response.json({ error: "This invite link is incomplete." }, { status: 400 });
  }
  const stored = await getStoredGame(code.toUpperCase());
  if (!stored) {
    return Response.json({ error: "Game room not found." }, { status: 404 });
  }
  if (!tokenMatches(stored, seat, token)) {
    return Response.json({ error: "This seat key is invalid." }, { status: 403 });
  }
  return Response.json(buildGameView(stored.state, seat), {
    headers: { "Cache-Control": "no-store" },
  });
}
