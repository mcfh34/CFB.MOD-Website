import { getStoredGame } from "@/db/game-store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const roomCode = code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) {
    return Response.json({ error: "Enter the six-character game key." }, { status: 400 });
  }
  const stored = await getStoredGame(roomCode);
  if (!stored) {
    return Response.json({ error: "Game key not found." }, { status: 404 });
  }
  if (stored.state.opponentType !== "human") {
    return Response.json({ error: "That game is not open for a second player." }, { status: 409 });
  }
  if (stored.state.status === "final") {
    return Response.json({ error: "That exhibition game is already final." }, { status: 409 });
  }
  return Response.json(
    { roomCode, seat: "away", token: stored.awayToken },
    { headers: { "Cache-Control": "no-store" } },
  );
}
