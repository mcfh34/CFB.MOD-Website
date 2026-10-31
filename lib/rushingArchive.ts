/** Basic rushing production from the same completed box scores used by the model. */
export type RushingBox = { gameId: string; week: number; team: string; opponent: string; attempts: number | null; yards: number | null };

export function archiveRushingRows(boxes: RushingBox[], team: string, byGame: boolean) {
  const own = boxes.filter((row) => row.team === team);
  const production = (rows: RushingBox[]) => {
    const known = rows.filter((row) => row.attempts !== null && row.yards !== null);
    if (!known.length) return {};
    const attempts = known.reduce((sum, row) => sum + row.attempts!, 0);
    const totalRushingYards = known.reduce((sum, row) => sum + row.yards!, 0);
    return { attempts, totalRushingYards, yardsPerCarry: attempts ? totalRushingYards / attempts : null };
  };
  if (!own.length) return [];
  return byGame ? own.map((row) => ({ team, gameId: row.gameId, week: row.week, opponent: row.opponent,
    offense: production([row]), defense: production(boxes.filter((other) => other.gameId === row.gameId && other.team !== team)),
  })) : [{ team, offense: production(own), defense: production(boxes.filter((row) => row.opponent === team)) }];
}
