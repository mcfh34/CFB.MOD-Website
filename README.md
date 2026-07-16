# Harper+ College Football Model

Harper+ is a full-stack college football analytics site built from the CFB MOD 25 workbook logic. It stores weekly team profiles, recalculates opponent-adjusted projections, grades predictions against closing market lines, produces BCS-style rankings, and simulates the remainder of each season and playoff.

## Product surfaces

- season- and week-aware Harper+ Top 25
- matchup lab with offensive and defensive opponent-average percentages
- All137 neutral-field round robin
- weekly team-stat and team-profile databases
- complete schedules, model scores, final scores, betting lines, ATS/total grades, and error
- predictive conference championship and College Football Playoff simulation
- historical model vintages from 2021 forward

## Model v6

The projection engine combines:

- a 25% iterative opponent adjustment that rises as high as 52% for early, FCS-heavy, or weakly connected schedules
- reliability-weighted Bayesian shrinkage toward the preseason prior so a small sample against weak opposition cannot masquerade as an elite profile
- a four-season preseason prior weighted 40/30/20/10, adjusted by returning production and a deliberately capped recruiting signal
- a 35% result-only Elo margin seeded from the preseason profile
- opponent expectation and capped margin-of-victory Elo updates
- a 1.5-point home-field advantage

All performance reporting is time-safe: forecasts use only the prior weekly profile. Workbook columns that reconstruct scores from the completed game's box score are excluded from model accuracy.

Harper BCS v3 is résumé-led: 50% results and strength of record, 20% schedule and quality wins, and 30% trimmed computer ratings. Mature undefeated and one-loss résumés receive explicit protection, while direct head-to-head controls close comparisons. Recruiting is not used in the ranking, so a conference label or roster reputation cannot manufacture a résumé.

## Data pipeline

The site uses CollegeFootballData from the server only. Raw schedules, scores, team-game statistics, lines, team identities, and logos are stored in D1. Historical source data is cached once; changing `MODEL_VERSION` recomputes profiles and predictions without repeatedly downloading completed seasons. Accuracy requests can calculate the current formula read-only from that cached archive while the background repair queue persists the most recent incomplete season first. Schedule displays are ordered by kickoff date so postseason week-number resets cannot mix bowl games into opening week.

Scheduled jobs:

- Monday 11:00 UTC: refresh the active season
- Tuesday–Saturday 12:00 UTC: repair one incomplete historical slice until the archive is complete

## Security

- `CFBD_API_KEY` and `SYNC_TOKEN` are server-side environment variables and must never be placed in client code or committed files.
- `.env*`, certificates, build output, local databases, and runtime state are ignored by Git.
- all data-changing endpoints require the private bearer token
- public browser controls can inspect refresh status but cannot trigger paid API traffic
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
