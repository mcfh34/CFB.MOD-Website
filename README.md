# Harper+ College Football Model

Harper+ is a full-stack college football analytics site built from the CFB MOD 25 workbook logic. It stores weekly team profiles, recalculates opponent-adjusted projections, grades predictions against closing market lines, produces BCS-style rankings, and simulates the remainder of each season and playoff.

## Product surfaces

- season- and week-aware Harper+ Top 25
- matchup lab with offensive and defensive opponent-average percentages, adaptive formations, play art, and color-scaled attack zones
- All137 neutral-field round robin, including a postseason-aware Every Season comparison
- weekly team-stat and team-profile databases
- complete schedules, model scores, final scores, betting lines, ATS/total grades, and error
- predictive conference championship and College Football Playoff simulation
- historical model vintages from 2014 forward

## Model v13

The projection engine combines:

- a 25% iterative opponent adjustment that rises as high as 52% for early, FCS-heavy, or weakly connected schedules
- reliability-weighted Bayesian shrinkage toward the preseason prior, with extra regression until a schedule contains credible opponent evidence, so a weak closed schedule cannot masquerade as an elite profile
- a four-season preseason prior weighted 40/30/20/10, adjusted by returning production and a deliberately capped recruiting signal
- a 35% result-only Elo margin seeded from the preseason profile
- opponent expectation and capped margin-of-victory Elo updates
- a 1.5-point home-field advantage
- a bounded advanced-component correction that decomposes rushing into CFBD line, second-level, and open-field yards, and passing into completion rate, yards per completion, success rate, and explosiveness
- sample-aware passing efficiency regression, so selective low-volume play-action attacks do not receive the same preseason certainty as complete, repeatable passing profiles

All performance reporting is time-safe: forecasts use only the prior weekly profile. Workbook columns that reconstruct scores from the completed game's box score are excluded from model accuracy.

The component layer keeps the final targets as YPC and YPA. Rushing weights are 52% line yards, 30% second-level yards, and 18% open-field yards; passing weights are 78% completion rate × yards per completion, 13% passing success, and 9% passing explosiveness. Corrections are capped at ±12% for YPC and ±10% for YPA so correlated components cannot double-count the same production. Every component is opponent-adjusted and regressed according to schedule proof. CFBD line yards are labeled as an OL/front proxy rather than literal player-tracking yards before contact. Air yards per target and YAC per reception are not available in the team-game source and are never fabricated.

Harper BCS v5 is résumé-led: 54% results and strength of record, 18% schedule and verified-win evidence, and 28% trimmed computer ratings. SOS blends opponent results with opponent-adjusted on-field power so closed schedules do not grade artificially low. The three best wins receive concentrated weight; margin is judged relative to opponent quality; bad losses and narrow escapes against weak opponents are explicit penalties. Undefeated protection strengthens only after a credible win, while direct head-to-head controls close comparisons. Recruiting is not used in the ranking, so a conference label or roster reputation cannot manufacture a résumé.

Every Season comparisons add completed bowl and playoff evidence, final record, championship status, and the season's résumé score to the neutral-field matchup engine. Season simulations preserve known results, then convert future matchup probabilities into a representative record instead of treating every small projected edge as a certain win or loss.

Selecting `Final · bowls + playoff` for both Matchup Lab teams and keeping the neutral-site switch on uses the same core scoring path as Every Season. A score receipt separates the on-field profile, results/Elo, schedule proof, title résumé, and venue contributions so a cross-era result can be reconciled instead of appearing as a black box. The coordinator view uses projected pass/run volume plus advanced matchup components to choose an Air Raid, spread, balanced, I-formation, or flexbone look; it then draws a recommended concept and grades deep pass, quick game, interior run, and edge run zones.

## Data pipeline

The site uses CollegeFootballData from the server only. Raw schedules, scores, team-game statistics, advanced team-game components, lines, team identities, and logos are stored in D1. Historical source data is cached once; changing `MODEL_VERSION` recomputes profiles and predictions without repeatedly downloading completed seasons. Advanced game data is fetched in one season-level request and refreshed only when that season's completed-game count changes. Older box-score rows receive a bounded, one-week-at-a-time completion-data repair so completion rate and yards per completion remain historically time-safe without causing an API burst. Accuracy requests can calculate the current formula read-only from that cached archive while the background repair queue persists the most recent incomplete season first. Schedule displays are ordered by kickoff date so postseason week-number resets cannot mix bowl games into opening week.

Scheduled jobs:

- Monday 11:00 UTC: refresh the active season
- Every 2 minutes: repair up to eight rate-limit-safe archive slices, completing each season oldest-to-newest so later preseason priors can use the finished earlier archive. Once complete, the scheduled check makes no CollegeFootballData request.
- If the hosting tier delays cron delivery, the archive status request uses the same server-controlled queue and can advance a paced batch. An atomic D1 lease prevents overlapping cron and visitor jobs, while two-second spacing prevents a CFBD request burst.

## Security

- `CFBD_API_KEY` and `SYNC_TOKEN` are server-side environment variables and must never be placed in client code or committed files.
- `.env*`, certificates, build output, local databases, and runtime state are ignored by Git.
- administrative data-changing endpoints require the private bearer token
- public archive status checks cannot select CFBD endpoints or seasons; a server-side D1 lease limits the recovery queue to one bounded, paced batch every 75 seconds
- responses include CSP, anti-framing, MIME-sniffing, referrer, permissions, and HTTPS security headers

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm test
```

## Runtime configuration

Configure these values in the hosting provider rather than the repository:

```text
CFBD_API_KEY=<private CollegeFootballData key>
SYNC_TOKEN=<long random administrative token>
```

The app also requires the D1 binding declared in `.openai/hosting.json`.

## Custom domain

Attach a domain you control at the hosting layer, then add the supplied DNS validation and routing records at the registrar. Do not place registrar credentials in this repository.

Team names and marks identify their respective institutions. Harper+ is an independent analytics project and is not affiliated with the NCAA, College Football Playoff, ESPN, or any university.
