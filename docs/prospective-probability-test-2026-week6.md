# 2026 win-probability checkpoint — Week 6

At **2026-10-08 17:52:11 UTC**, the public schedule response was saved before the first Week 6 kickoff (**23:00 UTC**). The [checkpoint](prospective-2026-week6-checkpoint.json) locks 55 FBS–FBS game IDs, teams, kickoffs, projected margins, and home-win probabilities using formula revision `2026-predictive-matchups-v15-win-probability` and probability scale `8`. All 55 were uncompleted at capture. It includes no later result or updated prediction.

The prospective comparison is scale `8` against the former scale `11.8` **on exactly those frozen margins**. Grade completed games by Brier score and log loss; lower is better. Do not refit the scale on Week 6 outcomes. To score it after the games, save the then-current `view=schedule&season=2026&week=0` API JSON and run:

```sh
node scripts/score-prospective-checkpoint.mjs docs/prospective-2026-week6-checkpoint.json /path/to/schedule.json
```

As of capture, **0 of 55** games were complete, so no prospective accuracy result exists yet. The source database's `model_predictions` table overwrites predictions and `created_at` on refresh; its completed-game rows are not an immutable pregame ledger. This file is the independent checkpoint for these Week 6 games.

For context only, the 59 completed Week 5 games in the same API response score as follows when today's live-profile margins are transformed by the two scales:

| Retrospective Week 5 replay | Brier | Log loss |
| --- | ---: | ---: |
| Previous scale 11.8 | 0.19518 | 0.57576 |
| Current scale 8 | 0.18874 | 0.56218 |

Those Week 5 forecasts were regenerated after completion with the current formula, so the difference is **not** a forward test and may reflect later model revisions. The checkpointed Week 6 comparison will be the first direct forward test of this probability change.
