import fs from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/test-market-incremental.mjs <directory-with-harper-schedule-YYYY.json>');
  process.exit(2);
}

const fbsConferences = new Set([
  'American Athletic', 'ACC', 'Big 12', 'Big Ten', 'Conference USA',
  'FBS Independents', 'Mid-American', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt',
]);
const games = [];
for (let season = 2021; season <= 2025; season++) {
  const payload = JSON.parse(fs.readFileSync(path.join(directory, `harper-schedule-${season}.json`), 'utf8'));
  for (const row of payload.rows) {
    if (!row.completed || row.week < 5 && row.seasonType !== 'postseason'
      || !fbsConferences.has(row.homeConference) || !fbsConferences.has(row.awayConference)
      || ![row.homePoints, row.awayPoints, row.predictedHomeScore, row.predictedAwayScore].every(Number.isFinite)) continue;
    games.push({ season, ...row });
  }
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const mae = (rows, actual, forecast) => mean(rows.map((row) => Math.abs(actual(row) - forecast(row))));
const metrics = (rows, actual, model, market, blended) => ({
  n: rows.length,
  modelMAE: mae(rows, actual, model),
  marketMAE: mae(rows, actual, market),
  blendMAE: mae(rows, actual, blended),
});
const fitResidualBlend = (rows, actual, model, market) => {
  const x = rows.map((row) => model(row) - market(row));
  const y = rows.map((row) => actual(row) - market(row));
  const xMean = mean(x), yMean = mean(y);
  const slope = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0)
    / x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  return { slope, intercept: yMean - slope * xMean };
};
const bootstrapDifference = (rows, actual, reference, other) => {
  const differences = rows.map((row) => Math.abs(actual(row) - other(row)) - Math.abs(actual(row) - reference(row)));
  let state = 20261008;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const estimates = [];
  for (let draw = 0; draw < 5000; draw++) {
    let sum = 0;
    for (let i = 0; i < differences.length; i++) sum += differences[Math.floor(random() * differences.length)];
    estimates.push(sum / differences.length);
  }
  estimates.sort((a, b) => a - b);
  return { averageDifference: mean(differences), percentile95: [estimates[125], estimates[4874]] };
};
const evaluate = (label, trainingYears, train, holdout, actual, model, market) => {
  const fit = fitResidualBlend(train, actual, model, market);
  const blend = (row) => market(row) + fit.intercept + fit.slope * (model(row) - market(row));
  return {
    label,
    fittedOn: trainingYears,
    fit,
    training: metrics(train, actual, model, market, blend),
    holdout: metrics(holdout, actual, model, market, blend),
    holdoutDifferenceModelMinusMarket: bootstrapDifference(holdout, actual, market, model),
    holdoutDifferenceBlendMinusMarket: bootstrapDifference(holdout, actual, market, blend),
  };
};
const margin = (row) => row.homePoints - row.awayPoints;
const predictedMargin = (row) => row.predictedHomeScore - row.predictedAwayScore;
const total = (row) => row.homePoints + row.awayPoints;
const predictedTotal = (row) => row.predictedHomeScore + row.predictedAwayScore;
const tests = [
  ['selected spread', (row) => Number.isFinite(row.vegasSpread), margin, predictedMargin, (row) => -row.vegasSpread, 2021],
  ['opening spread', (row) => Number.isFinite(row.spreadOpen), margin, predictedMargin, (row) => -row.spreadOpen, 2023],
  ['selected total', (row) => Number.isFinite(row.vegasTotal), total, predictedTotal, (row) => row.vegasTotal, 2021],
];
console.log(JSON.stringify(tests.map(([label, eligible, actual, model, market, firstTrainingSeason]) => {
  const rows = games.filter(eligible);
  return evaluate(label, `${firstTrainingSeason}–24`, rows.filter((row) => row.season >= firstTrainingSeason && row.season < 2025),
    rows.filter((row) => row.season === 2025), actual, model, market);
}), null, 2));
