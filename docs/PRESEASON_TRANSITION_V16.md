# H+ Preseason State Transition (v16)

## Why this changed

The former preseason pipeline reconstructed a team as 40% of its previous final profile, 30% of the profile from two seasons earlier, 20% from three seasons earlier, and 10% from four seasons earlier. It then applied a second 84–93% roster-proof shrinkage. The statistical profile therefore regressed twice. Preseason Elo was subsequently rebuilt from that already-regressed profile, and one Week 0 cross-season path could fall back to 1500, adding another effective regression.

That architecture treated older seasons as direct pieces of the new roster and could produce implausibly large offseason changes without corresponding roster evidence. It also gave recruiting a small independent effect instead of using talent primarily to answer the relevant question: how well can a team replace measured production loss?

## Production formula

For every opponent-adjusted efficiency index, calculations occur on the log-index scale:

```text
m_pre = m_prev + lambda * (programWeight * stability * m_program - m_prev) + rosterAdjustment
```

where:

- `m_prev` is the prior season's final H+ metric.
- `m_program` is the weighted center of the three older final profiles (55%, 30%, 15%).
- `stability` is a 0–1 confidence score derived from historical coverage, dispersion around the older program center, and a one-sided breakout penalty.
- `rosterAdjustment` is an opponent-relative returning-production adjustment whose downside can be buffered by replacement talent.
- `lambda = 0.28` and `programWeight = 0.85` were selected by the point-in-time backtest.

The previous final profile is always the state being transitioned. Older profiles only control the structural target and confidence in it; they are not blended directly into the new team at fixed 30/20/10 shares.

Style/volume metrics (pass and rush attempts) use 35% of the main transition rate and receive no roster-quality multiplier. Advanced metrics use the same state-transition architecture when historical advanced data exists, but advanced metrics were excluded from coefficient selection because their archived coverage changes by year.

### Program stability

```text
coverage = min(1, olderSeasonCount / 3)
consistency = exp(-0.5 * (historicalDeviation / 0.12)^2)
positiveBreakout = max(0, priorFinalPower - olderProgramPower)
breakoutPenalty = exp(-positiveBreakout / 0.16)
stability = clamp(coverage * (0.35 + 0.65 * consistency) * breakoutPenalty, 0, 1)
```

Only a positive one-year jump receives the breakout penalty. This lets an established strong program rebound partially from one poor season without granting a chronically weak program an unexplained reset toward average.

### Returning production and replacement talent

Returning-production inputs are converted to season-relative centered percentiles in `[-1, 1]`, separately for overall, passing, and rushing continuity. Recruiting points/rank are converted to a centered replacement-quality percentile.

```text
continuityLevel = (continuitySignal + 1) / 2
replacementNeed = 1 - continuityLevel
talentBuffer = continuitySignal < 0
  ? 0.35 * max(0, replacementSignal) * replacementNeed
  : 0

rosterAdjustment = clamp(
  0.035 * continuitySignal * (1 - talentBuffer)
  + 0.026 * replacementSignal * replacementNeed,
  -0.045,
  +0.045
)
```

Recruiting is therefore replacement capacity, not an independent brand bonus. If no returning-production observation exists, there is no measured vacancy to price and `rosterAdjustment` is exactly zero. The 0.045 log-index cap prevents recruiting or continuity inputs from overpowering prior on-field performance.

### Preseason Elo

Elo carries only the prior result signal not already represented in the final statistical profile:

```text
priorResultResidual = clamp(Elo_prev_final - Elo(profile_prev), -120, 120)
residualPersistence = clamp(0.00 + 0.20 * stability, 0, 0.90)
Elo_pre = clamp(Elo(profile_pre) + residualPersistence * priorResultResidual, 1260, 1780)
```

The transitioned statistical profile supplies the new season's base Elo. Mean reversion and roster effects are not applied again through Elo. The Rankings page remains results-only and starts its separate result ranking at 1500; Season Sim, Scores forecast ranks, Matchup Lab, and Win Conditions opt into the transitioned preseason Elo.

## Calibration design

- Candidate grid: 48 bounded state-transition structures.
- Development: 2018–2023.
- Validation/model selection: 2024.
- Audit-only holdout: 2025; its outcomes did not select coefficients.
- Game scope: completed FBS-vs-FBS regular-season and conference-championship games. Postseason is excluded from game-error scoring but included in the prior season's final result-only Elo.
- Early-season evaluation: Weeks 1–4.
- Selection objective: 70% development + 30% validation. Within each split: 30% early margin MAE, 8% early score MAE, 12% full-season margin MAE, 15% next-final H+ MAE, 8% Brier, 10% winner error, and 17% absolute elite/average/poor tier bias.
- Every target season uses only information available before that season: prior completed profiles/results and that season's published preseason inputs.

## Backtest results versus 40/30/20/10

Lower is better for MAE and Brier; higher is better for straight-up accuracy.

| Split | Metric | Legacy | State transition |
|---|---:|---:|---:|
| Development 2018–2023 | Early margin MAE | 15.908 | 15.781 |
| Development 2018–2023 | Early score MAE | 10.728 | 10.635 |
| Development 2018–2023 | Early straight-up | 71.52% | 73.19% |
| Development 2018–2023 | Early Brier | 0.2053 | 0.2021 |
| Development 2018–2023 | Full margin MAE | 15.028 | 14.890 |
| Development 2018–2023 | Final H+ MAE | 2.748 | 2.637 |
| Validation 2024 | Early margin MAE | 17.410 | 17.481 |
| Validation 2024 | Early straight-up | 66.49% | 68.04% |
| Validation 2024 | Full margin MAE | 15.188 | 15.087 |
| Validation 2024 | Final H+ MAE | 3.174 | 2.987 |
| Audit-only 2025 | Early margin MAE | 16.788 | 16.684 |
| Audit-only 2025 | Early straight-up | 70.26% | 68.72% |
| Audit-only 2025 | Early Brier | 0.2105 | 0.2090 |
| Audit-only 2025 | Full margin MAE | 15.235 | 15.072 |
| Audit-only 2025 | Full straight-up | 65.09% | 65.49% |
| Audit-only 2025 | Final H+ MAE | 3.164 | 3.066 |
| All 2018–2025 | Early margin MAE | 16.224 | 16.126 |
| All 2018–2025 | Early straight-up | 70.69% | 71.92% |
| All 2018–2025 | Early Brier | 0.2068 | 0.2046 |
| All 2018–2025 | Full margin MAE | 15.077 | 14.940 |
| All 2018–2025 | Full straight-up | 66.50% | 67.12% |
| All 2018–2025 | Final H+ MAE | 2.855 | 2.737 |

Across 2018–2025, final-rating MAE improved for prior elite teams (2.589 to 2.423) and average teams (2.885 to 2.709); poor-team MAE was essentially flat (2.852 to 2.855). The 2024 early margin and Brier results and the 2025 early straight-up result are explicit regressions, so the evidence is not presented as a universal win. The selected method improves the combined point-in-time objective and the principal all-season measures.

The year-over-year H+ change distribution also became less volatile: standard deviation fell from 2.656 to 1.893, with p10/p50/p90 moving from `-3.636 / -0.201 / +3.225` to `-2.664 / -0.072 / +2.127`.

## 2026 regression diagnostics

The live debug response includes the full row structure:

```text
Team | Prior Season Final H+ | New Preseason H+ | Change | Program Stability |
Returning Production | Recruiting/Replacement Signal | Final Adjustment
```

Current 2026 returning-production coverage is absent in the stored source feed while recruiting data is present. The production system records partial coverage and intentionally makes no recruiting-only roster adjustment instead of inventing continuity.

| Team / archetype | Prior final H+ | Legacy preseason H+ | New preseason H+ | New change | Stability |
|---|---:|---:|---:|---:|---:|
| Georgia / established elite regression test | 7.33 | 1.00 | 4.71 | -2.63 | 0.792 |
| Ohio State / established elite | 7.70 | 1.48 | 7.66 | -0.04 | 0.631 |
| Texas Tech / one-year breakout | 8.48 | 0.14 | 5.90 | -2.58 | 0.037 |
| Minnesota / established average | 0.21 | -0.91 | -1.96 | -2.17 | 0.674 |
| Akron / historically weak | -3.41 | -2.12 | -4.61 | -1.20 | 0.704 |

In the coefficient diagnostic, advanced metrics are deliberately removed so old and new methods have identical historical coverage. That controlled Georgia comparison moves from 28.0–21.9 (6.1 points) under the reproduced legacy path to 25.1–23.0 (2.1 points) under the transition. The previously reported Matchup Lab result was roughly a 12-point gap because that UI path also included the stale Week 0 Elo fallback and full matchup evidence.

The deployed full Matchup Lab check, which retains 2025 completed-game résumé and available advanced evidence, now projects 2025 Georgia 26.9–20.0 over 2026 Georgia on a neutral field (6.8 points). That full matchup number is intentionally not presented as the isolated offseason rating change; the calibrated H+ transition itself is 7.33 to 4.71, or -2.63 points. No Georgia-specific coefficient or manual adjustment exists.

The live audit endpoint also reports a historical major-turnover row from the 2025 audit season, where returning-production data is actually available.

## Source locations

- Transition engine and formulas: `lib/preseasonTransition.ts`
- Point-in-time backtest and diagnostics: `lib/preseasonBacktest.ts`
- Production profile/Elo construction: `lib/dataPipeline.ts`
- Results-only versus forecast Elo boundary: `lib/rankings.ts`, `lib/simulation.ts`
- Live audit: `/api/data?view=preseason-transition-backtest`
