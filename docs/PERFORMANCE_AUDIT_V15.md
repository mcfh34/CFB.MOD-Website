# Harper+ v15 performance audit

## Scope

This audit covers the scoring, schedule, round-robin, profile lookup, and pregame evidence paths changed with Matchup Engine v2.1. It deliberately avoids a full application rewrite.

## Bottlenecks found and removed

| Area | Before | After | Effect |
| --- | --- | --- | --- |
| Schedule ledger | Every request loaded all weekly profiles, every game, and every team; then rebuilt a full matchup X-ray for every schedule row. | A materialized schedule uses one compact query. A single game X-ray is fetched only when expanded. | A cached 2025 response fell from 16,031,343 bytes to about 1,113,801 bytes when the repeated X-rays were removed (93.1% smaller). |
| Single-season All137 | Each pairing was evaluated in both directions and built the full explanation object. | Each neutral pairing is evaluated once and credited to both teams through the compact round-robin kernel. | 137 teams fall from 18,632 full analyst projections to 9,316 compact matchup calculations. |
| Pregame Elo | Each weekly group repeatedly filtered the entire ordered game list. | Games are grouped in one pass and each group is reused. | Removes the repeated `weeks × games` scan. |
| Matchup evidence | Every team filtered the full completed-game history at every weekly checkpoint. | Completed history is indexed incrementally by team. | Replaces `weeks × teams × history` filtering with indexed team-history reads. |
| Weekly profile lookup | Every game repeatedly scanned the season profile array for each prior week. | A weakly cached team index is built once per profile array and searched newest-first. | Stable profile data is parsed/indexed once per request or archive build. |
| Score calculation | UI, simulation, schedule, and round robin could follow different scoring paths. | All call the same possession, points-per-possession, total, and margin layers. | Removes duplicate calculation logic and prevents output drift across tabs. |

## Measured checks

- The compact 136-team embedded round robin evaluates 9,180 neutral pairings in a 27.09 ms median over 10 warm runs (25.53–28.70 ms in the current runtime).
- The prior implementation performed the equivalent work in both directions and allocated a complete analyst explanation for every call. That previous runtime was not retained, so the audit reports the exact calculation-count reduction rather than inventing a before-time.
- The compact schedule-payload measurement is based on the same cached 934-game 2025 ledger before and after removing repeated full matchup-analysis objects.

## Calculation consolidation

- Removed the additive score bridge that independently deducted opponent defense, poor efficiency, havoc, threshold failure, field position, and discipline.
- Replaced three overlapping threshold concepts with one Offensive Viability Threshold.
- The threshold is now a single nonlinear feature inside the regularized points-per-possession model.
- Total and margin use separate calibrated layers; total is not just two separately over-adjusted team scores.
- The Matchup Lab receives model outputs and explanations. It no longer calculates scoring adjustments in the component tree.

## API and render behavior

- Stable schedule rows are cacheable for five minutes with stale-while-revalidate.
- Full game analysis is requested only after the user expands a game.
- Opening an accordion, changing display sorting, or reading a tooltip does not trigger a season simulation.
- Single-season and cross-era round robins are memoized by their actual model profiles.

## Remaining technical debt

1. The first request after a model-version bump can still calculate missing schedule predictions until the archive materializes v15 rows.
2. Cross-era fields above 1,000 team-seasons remain computationally heavy even with the compact kernel; a server-side persisted matrix would be the next scaling step.
3. The 1.1 MB compact full-season schedule can be reduced further with pagination or date windows, but the current payload preserves the user’s all-games view.
4. Dynamic validation slices depend on completed v15 prediction rows; the frozen 2021–2025 audit remains the replacement gate while those rows populate.
