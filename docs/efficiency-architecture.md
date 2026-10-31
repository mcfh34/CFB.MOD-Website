# Harper+ UI and data architecture

## Visitor experience

Five primary destinations: This Week, Matchup, Teams, Season, Explore. Existing tools have secondary links and a searchable dialog. Native controls and Radix primitives provide keyboard and focus behavior; editable shadcn-style Button components share the existing theme. Team selection is searchable. The team directory uses TanStack Table and Virtual; server-paginated player lists retain their pagination rather than downloading all players to virtualize them.

TanStack Query deduplicates browser data requests and caches successful responses for five minutes. Refresh clears browser query state. Public read-only aggregate endpoints also have a five-minute edge cache. Charts, maps and games load as separate chunks when opened. Cross-era comparisons use a browser Web Worker; published current-season All137 results are reused only when profile fingerprints and formula revisions match.

The global year/week remains in URLs across navigation. Matchup links retain teams, venue and alternate snapshots. Team links preserve the selected vintage. Stats coverage displays basic, advanced and player state separately. Historical cross-era controls remain local where they intentionally select different snapshots.

## Storage

D1 remains the structured query database. R2 BUCKET stores raw API payloads and calculated reports. api_payload_index holds object locations, checksums, byte counts and timestamps. Content-addressed raw history objects are immutable. Legacy D1 payload chunks migrate in bounded administrative batches; each payload is read back and verified before its old chunks are removed. No football API call is made by migration.

## Ingestion

The existing Sunday-noon America/Chicago slot and 40-request ceiling remain authoritative. Only that context can call CFBD. Visitor reads use R2 first, then legacy D1 while migration is incomplete. Duplicate in-flight or sequential feed requests share work; completed large payloads are not retained in memory throughout an entire ingestion run. Historical repair does not consume weekly source quota.

## Separate computation

.github/workflows/weekly-model.yml runs at Sunday 12:30 Central (two UTC candidates, one local-time guard). It can also run manually, and initially runs when this workflow file changes on main. It reads only already-published site data, never CFBD, so scheduling a calculation does not change source ingestion frequency.

The job calculates the shared-formula current-season round robin and 50,000 regular-season outcome samples. Completed results are fixed; remaining games are independent Bernoulli draws from the stored model probabilities. This output is a win distribution, not a playoff or national-title probability. Interactive What If retains its existing detailed conference and playoff logic.

Publishing uses a short-lived GitHub OIDC token, with signature, expiry, audience, numeric repository ID, repository name, branch and exact workflow restrictions. There is no CFBD key or site sync token in GitHub. A stale source timestamp or different formula cannot overwrite the latest published calculation. Reports live in R2 and D1 contains only their pointers. GitHub Actions start times can be delayed; noon ingestion remains a separate Worker schedule.

## Validation

Run `node --import tsx --test tests/weekly-api-policy.test.ts tests/efficiency.test.ts`, schema generation/inspection and `npm run build`. The legacy rendered-html source-assertion suite contains expectations for the retired mobile menu, development metadata and two-minute archive scheduler; it is not the acceptance contract for this redesign.
