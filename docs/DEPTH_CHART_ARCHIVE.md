# Harper+ Depth Chart Archive

## Why this is a separate data product

CollegeFootballData supplies historical rosters, player statistics, usage, PPA,
recruiting and transfer records. It does not publish a historical depth-chart
endpoint. A roster position is therefore evidence about a player's position,
not evidence that the player started or occupied a specific role.

The same limitation applies to the other providers inspected for this build:

- SportsDataIO explicitly states that it does not provide college depth charts
  or lineups: https://sportsdata.io/developers/workflow-guide/ncaa-football
- Sportradar documents NCAA team rosters and historical statistics back to
  2013, but not a historical depth-order feed:
  https://developer.sportradar.com/football/reference/ncaafb-overview
- College Pressbox is the official Division I football media repository and is
  the strongest centralized document-discovery source, but its gamebooks and
  flipcards require authorized membership:
  https://collegefootballplayoff.com/sports/2021/10/4/collegepressbox.aspx

There is consequently no verified public API that can truthfully fill every
2014–2025 team-season. The archive is built from official documents and keeps
unknown records visible instead of manufacturing them.

Harper+ keeps three concepts separate:

1. **Published position and depth** — a dated depth chart from the school or a
   licensed provider.
2. **Production rating** — the player's 1–99 grade from FBS production at the
   same position.
3. **Fallback projection** — a visibly labeled estimate used only when no
   published chart is available.

Changing the depth source must never change a player's production grade.

## Source order

1. Official school game notes or media guide.
2. Official conference or bowl game notes reproducing the school chart.
3. Licensed depth-chart feed with historical snapshots.
4. Source-aware projection from roster, transfer and recruiting positions.

Unofficial web pages are discovery aids only. Their data is not published in
Harper+ without permission and a retained source record.

## Archive grain

The target archive grain is one **team-season-date snapshot**, not one permanent
chart per season. A snapshot stores:

- season, team and published date;
- source label and canonical URL;
- offense, defense and specialists;
- football role exactly as published (for example MIKE, WILL, STAR, JACK);
- normalized position used by the model;
- depth number, jersey and player name;
- roster-player match status and reviewer status.

For historical week views, Harper+ should use the newest verified snapshot
published on or before the selected game's date. It must not use a bowl depth
chart to describe the opening week.

The D1 archive uses three related tables:

- `depth_chart_snapshots` — one retained source document and its compact chart
  JSON, used by the public application.
- `depth_chart_entries` — one normalized row per listed player, including roster
  match method, confidence and review status.
- `depth_chart_coverage` — one row for every FBS team-season from 2014–2025,
  including unsourced targets, search query, source counts and next action.

`depth_chart_import_runs` records every batch outcome. Source PDFs are not
stored in D1, which avoids oversized SQLite values and retains only the
normalized football facts and provenance needed by the model.

## Position safety rules

The fallback may rank players only within a compatible football family.

- RB cannot fill FB unless the source lists FB.
- WR cannot fill TE.
- CB cannot fill S or FS.
- S or FS cannot fill CB.
- EDGE or OLB cannot fill MIKE/WILL.
- DE or DT cannot fill NT.
- Generic OL may receive a projected display slot, but its stored position
  remains OL/OT/OG/C unless a published source resolves LT/LG/C/RG/RT.

An unresolved role is displayed as open instead of being filled by an
incompatible player.

## Validation gates

A chart is publishable only when:

- its source URL is retained;
- its publication date is known;
- each entry matches a same-team roster player by normalized name or by jersey
  plus last name;
- duplicate player assignments are reviewed;
- required position families do not conflict;
- the offense, defense and specialist counts are plausible;
- unmatched entries and source coverage are visible in the UI.

## Current implementation

The built-in verified pilot contains five official snapshots:

- 2014 Arkansas State opening-game notes;
- 2014 UL Monroe game notes;
- 2015 Alabama game notes;
- 2015 Michigan game notes;
- 2025 Alabama SEC Championship game notes.

Those documents prove the importer against several school PDF formats and
correct the known Derrick Henry, offensive-line, secondary, interior-line and
linebacker errors in the available team-seasons. Every other team-season is a
coverage-ledger target and remains explicitly source-aware projection until an
official chart is reviewed and imported.

The scalable completion path is either:

- recover official school game notes, media guides and gamebooks, with manual
  verification of low-confidence PDF extraction;
- use game-by-game starter records only as a separately labeled observed layer;
  or
- connect an authorized archive such as College Pressbox and retain the
  effective date and canonical document URL for every imported chart.

## Import contract

Authenticated imports accept one to 25 charts at `/api/depth-charts`. A chart
must include season, team, publication date, canonical HTTPS source URL, source
kind and normalized entries. The importer:

1. rejects incomplete or malformed charts before any write;
2. matches entries to the archived roster by normalized name, then by last name
   plus jersey;
3. writes small bounded D1 batches;
4. retains unmatched official names as `source_verified_unmatched`;
5. refreshes the team-season coverage ledger;
6. never promotes a projection to verified status.

The public GET endpoint reports archive coverage and source provenance. It does
not expose the private import token.
