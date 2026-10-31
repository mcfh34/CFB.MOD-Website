# Harper+ accuracy audit — 2026-10-08

The replay uses completed FBS–FBS games from Week 5 onward plus postseason and each game's prior-week profile. The existing scoring coefficients and new probability scale were fitted on 2021–24. The 2025 results are retrospective diagnostics because prior model revisions examined that season; prospective 2026 predictions are the next independent test.

| Production forecast | 2021–24 games | 2021–24 score MAE | 2021–24 margin MAE | 2021–24 total MAE | 2025 games | 2025 score MAE | 2025 margin MAE | 2025 total MAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current | 2,311 | 9.131 | 12.629 | 12.909 | 613 | 8.823 | 12.123 | 12.631 |
| Linear score/total recalibration | 2,311 | 9.098 | 12.632 | 12.882 | 613 | 8.804 | 12.100 | 12.627 |

The scalar score gains were too small to replace the scoring formula. The exploratory total fit was `-10.189 + 1.187 × predicted total`; the exploratory margin fit was `-1.244 + 1.109 × predicted margin`. Neither is used in production.

The full model component replay included weekly conference adjustments derived from earlier completed games. It graded regular-season Week 5+ games; its margin MAE differs slightly from the broader sample above.

| Margin variant | 2021–24 margin MAE | 2025 margin MAE |
| --- | ---: | ---: |
| Current | 12.553 | 12.109 |
| No conference adjustment | 12.585 | 12.116 |
| Half conference adjustment | 12.555 | 12.093 |
| No direct home field | 12.598 | 12.205 |
| Half direct home field | 12.547 | 12.127 |
| Half outcome rating | 12.771 | 12.432 |

The conference, home field, and outcome components stay. The half-conference variant gained 0.016 points on the retrospective 2025 season without a training improvement; it is not a stable replacement signal. Directional rushing already shrinks lane effects by sample size and caps its total multiplier. The passing directional split is display-only in the score forecast. No further low-sample split weight is justified by this audit.

The earlier win probability was `sigmoid(margin / 11.8)`. A scale of `8`, fitted on 2021–24, preserves the 50% point at a projected tie and neutral-site symmetry.

| Probability scale | 2021–24 Brier | 2025 Brier |
| --- | ---: | ---: |
| 11.8 | 0.19547 | 0.18729 |
| 8 | 0.19304 | 0.18152 |

Only win probabilities change. Projected scores, totals, spreads, ATS selection, and totals selection retain their rules. Totals recommendations remain disabled after the earlier failed threshold holdout. The Brier improvement does not establish betting profitability. The live accuracy ledger retains archived per-game formula versions; its numbers are distinct from a replay of the current formula.
