# Harper+ maintenance workflow

Use the smallest validation lane that matches the edit while working:

- `npm run test:scores` — Scores components, layout contracts, and active-season freshness wiring.
- `npm run test:ui` — rendered application shell plus Scores layout.
- `npm run test:game` — Down by Down rules and gameplay.
- `npm run test:season` — dynasty saves, schedules, postseason, and season UI.
- `npm run test:model` — ratings, projections, stats, rankings, and data pipeline.
- `npm run test:full` — production build and every regression lane before saving a release.

For preview work, start the supported Sites preview from the repository root and run `npm run preview:check` to confirm its managed process is healthy. Keep it running through the edit so Vite can hot reload normal component and CSS changes. If the managed browser blocks a framework-internal development URL, do not deploy over production for review; save an unpublished Sites version and review that exact validated artifact before publishing.

Scores-specific structure lives in `app/components/scores/`. Keep card, filter, toolbar, and forecast layout changes there. `app/score-rushing.css` contains the single compact Scores rule set followed by the unrelated rushing panel styles; do not add a second Scores override block elsewhere.

The fixed layout fixtures cover desktop, narrow desktop, tablet, phone, long abbreviations, three-digit scores, rankings, and large lines. Extend those fixtures whenever a new clipping case is reported.

During the active season, stale games whose kickoff passed at least three hours ago are eligible for an automatic refresh after the six-hour source cooldown. Historical seasons remain immutable unless explicitly repaired.
