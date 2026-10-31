import { createInitialGameState, normalizeQuarterLengthMinutes } from "@/lib/game/engine";
import {
  createRoomCode,
  createSeatToken,
  validateTeamInput,
} from "@/lib/game/server";
import { tryCreateStoredGame } from "@/db/game-store";
import { TEAM_BY_NAME, teamInputFromDefinition } from "@/lib/game/teams";

export const dynamic = "force-dynamic";

const DEFAULT_HOME = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")!);
const DEFAULT_AWAY = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")!);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      homeTeam?: unknown;
      awayTeam?: unknown;
      opponentType?: unknown;
      theme?: unknown;
      difficulty?: unknown;
      quarterLengthMinutes?: unknown;
      userSeat?: unknown;
    };
    const homeTeam = validateTeamInput(payload.homeTeam, DEFAULT_HOME);
    const awayTeam = validateTeamInput(payload.awayTeam, DEFAULT_AWAY);
    const opponentType = payload.opponentType === "cpu" ? "cpu" : "human";
    const theme = payload.theme === "light" ? "light" : "dark";
    const difficulty = payload.difficulty === "hard" || payload.difficulty === "impossible"
      ? payload.difficulty
      : "easy";
    const quarterLengthMinutes = normalizeQuarterLengthMinutes(payload.quarterLengthMinutes ?? 15);
    if (homeTeam.teamId === awayTeam.teamId) {
      return Response.json(
        { error: "Select two different teams." },
        { status: 400 },
      );
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomCode = createRoomCode();
      const seed = createSeatToken();
      const homeToken = createSeatToken();
      const awayToken = createSeatToken();
      const userSeat = payload.userSeat === "away" ? "away" : "home";
      const cpuSide = userSeat === "home" ? "away" : "home";
      const state = createInitialGameState(roomCode, homeTeam, awayTeam, seed, opponentType, theme, cpuSide, difficulty, quarterLengthMinutes);
      const stored = await tryCreateStoredGame(state, homeToken, awayToken);
      if (stored) {
        return Response.json(
          { roomCode, homeToken, awayToken, opponentType, theme, difficulty, quarterLengthMinutes, state },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    return Response.json(
      { error: "Could not allocate a game room. Try again." },
      { status: 503 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid game setup.";
    return Response.json({ error: message }, { status: 400 });
  }
}
