import fs from 'node:fs';

const [checkpointPath, schedulePath] = process.argv.slice(2);
if (!checkpointPath || !schedulePath) {
  console.error('Usage: node scripts/score-market-checkpoint.mjs <market-checkpoint.json> <schedule-response.json>');
  process.exit(2);
}
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const results = new Map(JSON.parse(fs.readFileSync(schedulePath, 'utf8')).rows.map((row) => [String(row.gameId), row]));
const complete = checkpoint.games.filter((game) => {
  const result = results.get(game.gameId);
  return result?.completed && result.homeTeam === game.homeTeam && result.awayTeam === game.awayTeam
    && Number.isFinite(result.homePoints) && Number.isFinite(result.awayPoints);
});
const mae = (games, forecast, actual) => games.length
  ? games.reduce((sum, game) => sum + Math.abs(forecast(game) - actual(results.get(game.gameId))), 0) / games.length
  : null;
const modelMargin = (game) => game.modelHomeScore - game.modelAwayScore;
const modelTotal = (game) => game.modelHomeScore + game.modelAwayScore;
const actualMargin = (result) => result.homePoints - result.awayPoints;
const actualTotal = (result) => result.homePoints + result.awayPoints;
const spreadGames = complete.filter((game) => Number.isFinite(game.spreadAtCapture));
const totalGames = complete.filter((game) => Number.isFinite(game.totalAtCapture));
const openingSpreadGames = complete.filter((game) => Number.isFinite(game.openingSpread));
console.log(JSON.stringify({
  capturedAt: checkpoint.capturedAt,
  scheduled: checkpoint.games.length,
  completed: complete.length,
  spread: { n: spreadGames.length, modelMAE: mae(spreadGames, modelMargin, actualMargin),
    capturedMarketMAE: mae(spreadGames, (game) => -game.spreadAtCapture, actualMargin) },
  openingSpread: { n: openingSpreadGames.length,
    modelMAE: mae(openingSpreadGames, modelMargin, actualMargin),
    marketMAE: mae(openingSpreadGames, (game) => -game.openingSpread, actualMargin) },
  total: { n: totalGames.length, modelMAE: mae(totalGames, modelTotal, actualTotal),
    capturedMarketMAE: mae(totalGames, (game) => game.totalAtCapture, actualTotal) },
}, null, 2));
