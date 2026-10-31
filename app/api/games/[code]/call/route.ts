import { getStoredGame, updateStoredGame } from "@/db/game-store";
import {
  applyPlayCall,
  buildGameView,
  parseSeat,
  snapshotTargetsCurrentSnap,
  tokenMatches,
} from "@/lib/game/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const payload = (await request.json()) as {
      seat?: string;
      token?: string;
      playId?: string;
      expectedVersion?: number;
      expectedPlayNumber?: number;
      executionScore?: number;
    };
    const seat = parseSeat(payload.seat ?? null);
    if (!seat || !payload.token) {
      return Response.json({ error: "Seat authentication is required." }, { status: 400 });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stored = await getStoredGame(code.toUpperCase());
      if (!stored) {
        return Response.json({ error: "Game room not found." }, { status: 404 });
      }
      if (!tokenMatches(stored, seat, payload.token)) {
        return Response.json({ error: "This seat key is invalid." }, { status: 403 });
      }
      if (
        !snapshotTargetsCurrentSnap(
          stored.state,
          payload.expectedPlayNumber,
          payload.expectedVersion,
          stored.version,
        )
      ) {
        return Response.json(
          { error: "The game advanced. Refreshing the current situation." },
          { status: 409 },
        );
      }
      if (stored.state.status === "final") {
        return Response.json({ error: "This game is final." }, { status: 409 });
      }
      const applied = applyPlayCall(
        stored.state,
        seat,
        payload.playId,
        new Date().toISOString(),
        payload.executionScore,
      );
      stored.state = applied.state;
      if (applied.duplicate) {
        return Response.json(buildGameView(stored.state, seat), {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (await updateStoredGame(stored, stored.state)) {
        return Response.json(buildGameView(stored.state, seat), {
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    return Response.json(
      { error: "The calls arrived together. Retrying the current snap." },
      { status: 409 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit that play.";
    return Response.json({ error: message }, { status: 400 });
  }
}
