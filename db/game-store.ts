import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { games } from "./schema";
import type { GameState } from "@/lib/game/types";

export interface StoredGame {
  roomCode: string;
  homeToken: string;
  awayToken: string;
  state: GameState;
  version: number;
}

function decode(row: typeof games.$inferSelect): StoredGame {
  return {
    roomCode: row.roomCode,
    homeToken: row.homeToken,
    awayToken: row.awayToken,
    state: JSON.parse(row.stateJson) as GameState,
    version: row.version,
  };
}

export async function getStoredGame(roomCode: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(games)
    .where(eq(games.roomCode, roomCode))
    .limit(1);
  return row ? decode(row) : null;
}

export async function tryCreateStoredGame(
  state: GameState,
  homeToken: string,
  awayToken: string,
) {
  const db = await getDb();
  const rows = await db
    .insert(games)
    .values({
      roomCode: state.roomCode,
      homeToken,
      awayToken,
      stateJson: JSON.stringify(state),
      version: state.version,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: games.roomCode })
    .returning();
  return rows.length === 1 ? decode(rows[0]) : null;
}

export async function updateStoredGame(
  stored: StoredGame,
  state: GameState,
) {
  const nextVersion = stored.version + 1;
  state.version = nextVersion;
  const db = await getDb();
  const rows = await db
    .update(games)
    .set({
      stateJson: JSON.stringify(state),
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(games.roomCode, stored.roomCode),
        eq(games.version, stored.version),
      ),
    )
    .returning({ version: games.version });
  return rows.length === 1;
}
