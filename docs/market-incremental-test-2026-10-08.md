# Harper+ versus market lines — next accuracy test

**Question:** Do the current score projections improve on the selected spread or total when both are available? The calculation uses completed FBS–FBS games from Week 5 onward, including postseason. It uses today's archived schedule API responses and the current formula's regenerated projections. The selected `vegasSpread` is expressed from the home team's perspective; the market's expected home margin is `-vegasSpread`.

An intercept and weight for `actual - market = intercept + weight × (model - market)` were fit on 2021–24, with 2025 evaluated separately. Opening spreads have adequate coverage only from 2023, so that fit uses 2023–24. MAE is in points; lower is better.

| 2025 test | Games | Model MAE | Line MAE | Fitted blend MAE | Blend minus line |
| --- | ---: | ---: | ---: | ---: | ---: |
| Selected spread | 613 | 12.101 | **11.741** | 11.752 | +0.011 |
| Opening spread | 557 | 12.075 | 11.873 | **11.853** | −0.020 |
| Selected total | 613 | 12.633 | **12.391** | 12.427 | +0.036 |

The selected-spread fit gave the model disagreement a weight of 0.137; the selected-total fit gave it 0.148. In 2025, neither beat its selected market line. The opening-spread fit gave the disagreement a weight of 0.471 and reduced MAE by only 0.020. A game-level paired bootstrap places that opening improvement's 95% interval at **−0.177 to +0.135 points** (blend minus opening line), so the result is unresolved. The selected-spread interval is −0.033 to +0.055 and the selected-total interval is −0.023 to +0.093. Games involving the same teams are correlated, so these game-level intervals may be too narrow.

The main diagnostic is that the model's standalone selected-spread MAE is 0.360 points higher than the line on 2025 games; its total MAE is 0.242 points higher. That does not prove the model cannot find profitable selections. Profitability depends on price, vig, the rule for selecting bets, and genuinely available pregame lines. A projection designed to beat a market also should not be fitted to that same market without changing the purpose of the model.

**Decision:** Keep the independent H+ scoring formula. Do not add a market blend to production based on this test. The Week 6 frozen checkpoint remains the first prospective probability test. A [separate market checkpoint](prospective-2026-week6-market-checkpoint.json) records the model scores and prices available at the same pregame capture time for all 55 Week 6 games. Run `node scripts/score-market-checkpoint.mjs docs/prospective-2026-week6-market-checkpoint.json /path/to/schedule.json` after completion. This will provide a forward comparison at capture time, not a closing-line comparison. The stored `model_predictions` rows are overwritten during refresh, and `selected` historical lines are not a verified record of the price available at a particular decision time. Opening totals show very few changes and were excluded from this retrospective comparison.

The calculation is reproducible with [the script](../scripts/test-market-incremental.mjs) and the five `view=schedule&season=YYYY&week=0` JSON responses saved as `harper-schedule-YYYY.json` in one directory. Run `node scripts/test-market-incremental.mjs /path/to/directory`. The script reports fitted weights, both period MAEs, and paired bootstrap differences.
