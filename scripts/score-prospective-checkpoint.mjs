import fs from 'node:fs';

const [checkpointPath, schedulePath] = process.argv.slice(2);
if (!checkpointPath || !schedulePath) {
  console.error('Usage: node scripts/score-prospective-checkpoint.mjs <checkpoint.json> <schedule-response.json>');
  process.exit(2);
}

const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const results = new Map(schedule.rows.map((row) => [String(row.gameId), row]));
const eligible = checkpoint.games.filter((game) => {
  const row = results.get(game.gameId);
  return row?.completed && row.homeTeam === game.homeTeam && row.awayTeam === game.awayTeam
    && Number.isFinite(row.homePoints) && Number.isFinite(row.awayPoints)
    && row.homePoints !== row.awayPoints;
});
const metric = (scale) => {
  let brier = 0, logLoss = 0;
  for (const game of eligible) {
    const row = results.get(game.gameId);
    const p = 1 / (1 + Math.exp(-game.projectedMargin / scale));
    const actual = row.homePoints > row.awayPoints ? 1 : 0;
    brier += (p - actual) ** 2;
    logLoss += -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
  }
  return eligible.length ? { brier: brier / eligible.length, logLoss: logLoss / eligible.length } : null;
};
console.log(JSON.stringify({
  capturedAt: checkpoint.capturedAt,
  scheduled: checkpoint.games.length,
  completed: eligible.length,
  pending: checkpoint.games.length - eligible.length,
  previousScale11_8: metric(11.8),
  currentScale8: metric(8),
}, null, 2));
