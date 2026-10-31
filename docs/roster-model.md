# Roster-aware predictions

Model version: `harper-plus-v17-roster-aware`.

- Offensive continuity no longer automatically improves defense. Missing defensive roster evidence produces no player-specific defensive adjustment.
- Verified, dated depth charts establish membership and projected roles. Prior-season player production is normalized within position and shrunk for sample size; matched incoming players are compared with the departing unit, not counted as a portal-class bonus.
- Normal maintenance also captures one immutable, explicitly model-projected lineup per team per day from the existing player model. Its actual capture time prevents it from changing predictions for earlier weeks. These snapshots are labeled modeled, never official or verified.
- QB co-starters are probability-weighted scenarios. Explicitly sourced starter probability, expected snap share, availability probability and coaching continuity are optional depth-chart fields. Unknown availability is not an injury assertion.
- Early-season basic and advanced profiles retain less prior weight for uncertain rosters. Existing CFBD advanced and player feeds request garbage-time exclusions.
- Scores archive their possession receipts, exact margin contributions, roster evidence and QB scenarios in `model_predictions.forecast_json`. A read uses the stored score and its stored receipt together.
- Matchup Lab and game details expose score reconciliation and coverage. No additional transfer points are added to the final spread.

## Validation

`/api/data?view=roster-validation&season=2025` compares the baseline, independent-defense correction, quarterback layer and full roster candidate on the same completed Week 1–5 FBS games. Dates are conservatively bounded by the week's earliest kickoff. Date-only publications become available at the end of that day.

The report includes score MAE, margin MAE, Brier score, calibration bins, and stable/rebuilt splits. It cannot certify a roster improvement with fewer than 100 paired games having sufficient dated lineup coverage. This is a diagnostic eligibility flag, not an automated deployment switch. New roster coefficients are provisional; passing software tests is not evidence of increased forecasting accuracy.

## Coverage limits

Projected role weights are not measured snap shares. OL quality is unchanged where individual evidence is absent. Only matched prior-season players contribute observed production; unmatched freshmen, ambiguous names and missing player histories remain uncertain. Coaching and availability require explicit dated source inputs, not speculation. Complete historical membership, individual snap and availability archives are not supplied by this change. Retrospectively reconstructed forecasts are not immutable forecasts originally issued before kickoff.
