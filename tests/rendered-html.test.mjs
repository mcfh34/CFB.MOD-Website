import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /id=["']primary-navigation["']/i);
  assert.match(html, /aria-label=["']Primary mobile navigation["']/i);
  assert.match(html, /aria-controls=["']mobile-more-menu["']/i);
  assert.match(html, /class=["'][^"']*simple-home/i);
  assert.match(html, /aria-label=["']Harper Plus pages["']/i);
  assert.match(html, /href=["']https:\/\/formsubmit\.co\/el\/sifele["']/i);
  assert.match(html, /OPEN CONTACT FORM/i);
  assert.doesNotMatch(html, /formsubmit\.co\/(?:ajax\/)?mcfh34@gmail\.com/i);
});

test("ships the leakage-safe preseason transition and its calibration audit",async()=>{
  const [route,transition,backtest,pipeline,rankings,simulation]=await Promise.all([
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/preseasonTransition.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/preseasonBacktest.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/dataPipeline.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/rankings.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/simulation.ts",import.meta.url),"utf8"),
  ]);
  assert.match(route,/preseason-transition-backtest/i);
  assert.match(route,/MAX\(week\).*weekly_profiles/is);
  assert.match(transition,/m_pre|transitionLogMetric/i);
  assert.match(transition,/positive one-year jump is treated as a breakout penalty/i);
  assert.match(transition,/calculateFinalEloRatings/i);
  assert.match(backtest,/latest completed season is audit-only/i);
  assert.match(backtest,/Weeks 1–4 margin MAE/i);
  assert.match(backtest,/ratingCalibration/i);
  assert.match(backtest,/Georgia regression test/i);
  assert.match(pipeline,/harper-plus-v16-preseason-state-transition/i);
  assert.match(pipeline,/return buildPreseasonStateTransition\(/i);
  assert.doesNotMatch(pipeline,/const PRESEASON_WEIGHTS\s*=/i);
  assert.match(rankings,/Results Rankings intentionally keep the 1500 default/i);
  assert.match(simulation,/usePreseasonElo:\s*true/i);
});

test("carries sparse weekly profiles forward for the complete team field",async()=>{
  const [route,snapshots]=await Promise.all([
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/profileSnapshots.ts",import.meta.url),"utf8"),
  ]);
  assert.match(route,/latestTeamProfileAtOrBeforeWeekSql/);
  assert.match(route,/profile_snapshot\.team=wp\.team/);
  assert.match(route,/async function loadPointInTimeProfileRows/);
  assert.match(route,/\[\.\.\.preseasonRows,\.\.\.weeklyRows\]/);
  assert.ok((route.match(/loadPointInTimeProfileRows\(/g)??[]).length>=8,"all point-in-time consumers must use the complete-field loader");
  assert.match(route,/latestTeamProfilesAtOrBeforeWeek\(/);
  assert.match(snapshots,/team without a row in the newest week must therefore carry its most recent\s+\* profile forward/i);
});

test("ships the rebuilt opponent-relative Matchup Lab",async()=>{
  const [page,styles,interfaceStyles,dataRoute,contextEngine,fieldMap]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
    readFile(new URL("../app/interface.css",import.meta.url),"utf8"),
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/matchupContext.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/matchupFieldMap.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/function MatchupLabV2/i);
  assert.match(page,/01 · MATCHUP CONTROL/i);
  assert.match(page,/02 · OPPONENT EFFECT/i);
  assert.match(page,/03 · COMPARABLE OPPONENTS/i);
  assert.match(page,/05 · STALL POINTS/i);
  assert.match(page,/06 · PERFORMANCE AUDIT/i);
  assert.match(page,/07 · CFBD ADVANCED METRICS/i);
  assert.match(page,/08 · PLAY ART/i);
  assert.match(page,/100% CONTROL SHARE/i);
  assert.match(page,/mlab-analog-comparison/i);
  assert.match(page,/aria-label="Team 1 season"/i);
  assert.match(page,/aria-label="Team 2 season"/i);
  assert.match(page,/className="mlab-team-name-short"/i);
  assert.match(page,/data-compact-name=\{first\.abbr\}/i);
  assert.match(page,/const \[secondSeason,setSecondSeason\]=useState\(season\)/i);
  assert.match(page,/useDynamicProfiles\(secondSeason,secondWeek\)/i);
  assert.match(styles,/Harper\+ v40/i);
  assert.match(styles,/\.matchup-lab-v2/i);
  assert.match(dataRoute,/view === "matchup-context"/i);
  assert.match(dataRoute,/team_game_advanced_stats/i);
  assert.match(dataRoute,/season_type AS seasonType/i);
  assert.match(dataRoute,/\? >= 16 OR \(LOWER\(COALESCE\(g\.season_type/i);
  assert.match(contextEngine,/buildMatchupContext/i);
  assert.match(contextEngine,/matchupProfileSimilarity/i);
  assert.match(contextEngine,/seasonType/i);
  assert.match(fieldMap,/buildPffFieldTendency/i);
  assert.match(fieldMap,/buildMatchupFieldMap/i);
  assert.match(styles,/\.mlab-field-zones/i);
  assert.match(page,/mlab-field-markings/i);
  assert.match(page,/"LT","LG","C","RG","RT","TE"/i);
  assert.match(page,/mlab-field-legend/i);
  assert.match(styles,/\.mlab-offensive-front/i);
  assert.match(styles,/\.mlab-field-legend p/i);
  assert.match(styles,/\.mlab-pass-field:before,\.mlab-pass-field:after[^}]*width:14px/i);
  assert.match(styles,/\.mlab-field-markings>span:after[^}]*right:8px/i);
  assert.match(styles,/\.mlab-front-player i[^}]*border-radius:50%/i);
  assert.match(styles,/\.matchup-lab-v2 \.team-mark-sm\.has-logo img[^}]*scale\(1\.12\)/i);
  assert.match(styles,/\.mlab-scoreboard>footer \{[^}]*min-height:0[^}]*margin-left:0[^}]*padding:0/i);
  assert.match(styles,/@media \(max-width:900px\)[\s\S]*\.mlab-controls \{[^}]*grid-template-columns:minmax\(62px,.58fr\)[^}]*minmax\(120px,2fr\)/i);
  assert.match(styles,/@media \(max-width:430px\)[\s\S]*\.mlab-team-name-short \{ display:block/i);
  assert.match(interfaceStyles,/\.wc-summary > article > b \{[^}]*white-space:nowrap/i);
  assert.match(interfaceStyles,/@media \(max-width:760px\)[\s\S]*\.wc-summary > article > b \{font-size:clamp\(22px,4\.6vw,28px\)/i);
});

test("ships the dedicated responsive application shell", async () => {
  const [shell, page, layout, interfaceStyles, globalStyles, dataRoute, dataPipeline, logoAssets, gamePlayerRoute, gameMarketSummary] = await Promise.all([
    readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/interface.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/dataPipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/teamLogoAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game-players/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/gameMarketSummary.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<AppShell/i);
  assert.match(layout, /import "\.\/interface\.css"/i);
  assert.doesNotMatch(layout, /readability\.css/i);
  assert.match(shell, /primaryMobileSections/i);
  assert.match(shell, /app-mobile-tabs/i);
  assert.match(shell, /app-mobile-primary-button/i);
  assert.match(shell, /!compact && !top \? <span className="app-nav-mark"/i);
  assert.match(shell, /className="main-header app-desktop-header"/i);
  assert.match(shell, /harper-plus-theme/i);
  assert.match(shell, /className="app-theme-toggle"/i);
  assert.match(shell, /Switch to \$\{nextTheme\} theme/i);
  assert.match(shell, /className="app-theme-toggle-label">\{nextTheme\}/i);
  assert.match(layout, /id="theme-initializer"/i);
  assert.match(layout, /prefers-color-scheme: light/i);
  assert.match(layout, /suppressHydrationWarning/i);
  assert.match(interfaceStyles, /html\[data-theme="light"\]/i);
  assert.match(interfaceStyles, /\.app-theme-toggle-label \{[\s\S]*text-transform:uppercase/i);
  assert.match(interfaceStyles, /--app-panel-inset:#f1ede3/i);
  assert.match(interfaceStyles, /--app-on-accent:#f8f5ed/i);
  assert.match(interfaceStyles, /Harper\+ v44 — editorial newspaper treatment/i);
  assert.match(interfaceStyles, /--app-news-serif:Georgia,"Times New Roman",Times,serif/i);
  assert.match(interfaceStyles, /\.section-title-row \{[\s\S]*border-bottom:3px double var\(--app-ink\)!important/i);
  assert.match(interfaceStyles, /html\[data-theme="light"\] \.app-page-slot :where\([\s\S]*background-image:none!important/i);
  assert.match(interfaceStyles, /\.team-identity-grid > article[\s\S]*background-color:var\(--app-panel\)!important/i);
  assert.match(interfaceStyles, /\.depth-roster-section[\s\S]*background-color:var\(--app-panel\)!important/i);
  assert.match(interfaceStyles, /\.mlab-scoreboard > p[\s\S]*background-color:var\(--lab-card-2\)!important/i);
  assert.doesNotMatch(interfaceStyles, /background:#(?:11120f|10110e|0f100e|0d0e0c|121310|141512|151613|181916|1c1d19|20211d|242520|25261f|2a2b26)/i);
  assert.match(globalStyles, /html,body \{ background:var\(--app-bg\); color:var\(--app-ink\); \}/i);
  assert.match(globalStyles, /\.edge-unit \{[^}]*background:var\(--app-panel-inset\)/i);
  assert.match(globalStyles, /\.football-intelligence-head > aside \{[^}]*background:var\(--app-panel-inset\)/i);
  assert.match(globalStyles, /\.style-clash-grid > article \{[^}]*background:var\(--app-panel-raised\)/i);
  assert.match(globalStyles, /\.position-xray-grid article \{[^}]*background:var\(--app-panel-inset\)/i);
  assert.match(globalStyles, /\.validation-slices-disclosure \{[^}]*background:var\(--app-panel-inset\)/i);
  assert.match(globalStyles, /\.player-number \{[^}]*background:var\(--app-ink\)[^}]*color:var\(--app-on-accent\)/i);
  assert.match(shell, /navigation\.map[\s\S]*app-top-navigation-button|navigation\.map[\s\S]*top \/>/i);
  assert.match(shell, /app-more-sheet/i);
  assert.match(shell, /Game Day/i);
  assert.match(shell, /Rankings/i);
  assert.match(shell, /Research/i);
  assert.match(shell, /label:"Accuracy History"/i);
  assert.match(shell, /label:"What If"/i);
  assert.doesNotMatch(shell, /label:"Season Sim"/i);
  assert.match(shell, /label:"Standings"/i);
  assert.match(shell, /compact \|\| top \? item\.shortLabel : item\.label/i);
  assert.doesNotMatch(shell, /label:"Model HQ"/i);
  assert.match(page, /function AccuracyHistoryPage/i);
  assert.match(page, /function CompactAccuracyTable/i);
  assert.match(page, /GOOD FITS/i);
  assert.match(page, /ALL GAMES/i);
  assert.match(page, /aria-label="Filter accuracy by team"/i);
  assert.match(page, /aria-label="Filter accuracy by conference"/i);
  assert.match(page, /function ConferenceStandingsPage/i);
  assert.match(page, /Select conference standings/i);
  assert.match(page, /OFFICIAL POLICY/i);
  assert.match(page, /<CompactAccuracyTable home \/>/i);
  assert.match(page, /function WhatIfPage/i);
  assert.match(page, /tab==="simulation"\?<SeasonSimulationPage[\s\S]*embedded/i);
  assert.doesNotMatch(page, /section === "simulation"/i);
  assert.match(page, /TEAM PLAYING/i);
  assert.match(page, /SCHEDULE BORROWED/i);
  assert.match(page, /<span>WK<\/span><span>OPPONENT<\/span><span>SITE<\/span><span>RESULT<\/span><span>SCORE<\/span><span>MARGIN<\/span><span>WIN CHANCE<\/span><span>RECORD<\/span>/i);
  assert.match(interfaceStyles, /\.what-if-schedule > article \{[\s\S]*grid-template-columns:54px minmax\(210px,1fr\) 90px 70px 112px 82px 108px 78px/i);
  assert.match(dataRoute, /const accuracyScope = url\.searchParams\.get\("scope"\) === "all"/i);
  assert.match(dataRoute, /accuracyConditions\.push\("\(g\.home_team=\? OR g\.away_team=\?\)"\)/i);
  assert.match(dataRoute, /conferenceFilterSqlValues\(conference\)/i);
  assert.match(dataRoute, /view === "standings"/i);
  assert.match(dataRoute, /buildConferenceStandings/i);
  assert.match(dataRoute, /JOIN cfb_teams ht ON ht\.season=g\.season AND ht\.team=g\.home_team/i);
  assert.match(dataRoute, /all predicted games/i);
  assert.match(page, /SEASON TO DATE/i);
  assert.match(interfaceStyles, /game-detail-scoreboard > span b[\s\S]*white-space:nowrap!important/i);
  assert.match(interfaceStyles, /env\(safe-area-inset-top\)/i);
  assert.match(interfaceStyles, /env\(safe-area-inset-bottom\)/i);
  assert.match(interfaceStyles, /font-size:16px!important/i);
  assert.match(interfaceStyles, /\.ranking-row[\s\S]*grid-template-columns:35px minmax\(0,1fr\)/i);
  assert.match(page, /BEST PROJECTED WINS/);
  assert.match(page, /PROJECTED LOSSES/);
  assert.match(page, /row\.projectedWinsOver/);
  assert.match(page, /row\.projectedLossesTo/);
  assert.match(page, /ranking-record-pair/);
  assert.match(page, /row\.conferenceRecord/);
  assert.match(interfaceStyles, /weekly-projected-ranking-entry[\s\S]*min-width:860px/);
  assert.match(interfaceStyles, /Desktop chrome follows a compact broadcast-site pattern/i);
  assert.match(interfaceStyles, /\.app-desktop-header[\s\S]*grid-template-columns:184px minmax\(0,1fr\) 94px/i);
  assert.match(interfaceStyles, /Keep every desktop destination visible/i);
  assert.match(interfaceStyles, /\.app-desktop-header > nav[\s\S]*overflow-x:hidden!important/i);
  assert.match(interfaceStyles, /\.app-top-navigation-button[\s\S]*flex:1 1 0!important[\s\S]*min-width:0!important/i);
  assert.match(interfaceStyles, /\.standings-row[\s\S]*grid-template-columns:42px minmax\(190px,1\.5fr\)/i);
  assert.match(interfaceStyles, /\.accuracy-entity-filters[\s\S]*grid-template-columns:minmax\(0,1fr\) 28px minmax\(0,1fr\) auto/i);
  assert.match(interfaceStyles, /\.app-top-navigation-button\.active::after[\s\S]*background:var\(--app-ink\)/i);
  assert.match(interfaceStyles, /@media \(max-width:900px\)[\s\S]*\.app-desktop-header \{[\s\S]*display:none!important/i);
  assert.match(interfaceStyles, /\.stats-head > :first-child[\s\S]*position:sticky/i);
  assert.match(page, /className="schedule-filter" aria-label="Schedule filters"/i);
  assert.match(page, /className="schedule-filter-toggle"/i);
  assert.match(page, /function GameStatLegend/i);
  assert.match(page, /AVG \{stat\.averageDisplay\}/i);
  assert.match(page, /className="schedule-filter-status" role="status" aria-live="polite"/i);
  assert.match(shell, /className="app-background-maintenance" aria-hidden="true"/i);
  assert.match(interfaceStyles, /\.app-background-maintenance \{[\s\S]*display:none!important/i);
  assert.match(interfaceStyles, /\.game-stat-readout\.good[\s\S]*var\(--app-positive\)/i);
  assert.doesNotMatch(page, /game-stat-readout \$\{tone\}[\s\S]{0,180}<i aria-hidden="true"/i);
  assert.match(page, /stats-summary stats-leader-summary/i);
  assert.match(page, /TeamMark name=\{topOffense\.team\}/i);
  assert.match(page, /TeamMark name=\{topDefense\.team\}/i);
  assert.doesNotMatch(page, /FBS PROFILES|AVG GAMES IN SAMPLE/i);
  assert.match(page, /stats-filter-drawer team-stats-filter-drawer/i);
  assert.match(interfaceStyles, /team-stats-filter-drawer > \.stats-toolbar-controls[\s\S]*display:flex[\s\S]*flex-wrap:nowrap/i);
  assert.match(interfaceStyles, /Scores uses one card system at every breakpoint/i);
  assert.match(interfaceStyles, /schedule-page \.mobile-score-day > div[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(interfaceStyles, /@media \(max-width:900px\)[\s\S]*schedule-page \.mobile-score-day > div[\s\S]*grid-template-columns:minmax\(0,1fr\)/i);
  assert.match(interfaceStyles, /\.schedule-filter-panel\.open[\s\S]*display:grid/i);
  assert.doesNotMatch(page, /schedule-desktop-ledger|className="schedule-row"/i);
  assert.match(page, /aria-label="Select team page"/i);
  assert.doesNotMatch(page, /placeholder="Search team or conference"/i);
  assert.match(page, /includeGameTimeRanks:"1"/i);
  assert.match(page, /function TeamScheduleList/i);
  assert.match(page, /function scheduleColumnGridStyle/i);
  assert.match(page, /team-schedule-list schedule-column-grid/i);
  assert.match(page, /mobile-score-day[\s\S]*schedule-column-grid/i);
  assert.match(page, /Harper\+ entering-week rank/i);
  assert.match(dataRoute, /function schedulePregameRanks/i);
  assert.match(dataRoute, /scoreRankingSnapshotWeek\(Number\(row\.week/);
  assert.match(dataRoute, /homePregameRank/i);
  assert.match(dataRoute, /hydratePostseasonGameStats/i);
  assert.match(dataPipeline, /export async function hydratePostseasonGameStats/i);
  assert.match(dataPipeline, /seasonType: "postseason"/i);
  assert.match(dataPipeline, /completedPostseasonWeeks/i);
  assert.match(page, /GAME CONTRIBUTORS/i);
  assert.match(page, /OFFENSIVE LINE UNIT/i);
  assert.match(page, /DEFENSIVE TACKLE UNIT/i);
  assert.match(page, /game-player-row[\s\S]*PlayerStatsJersey/i);
  assert.match(interfaceStyles, /game-player-row > span:first-child[\s\S]*grid-template-columns:52px minmax\(0,1fr\)/i);
  assert.match(interfaceStyles, /@media \(max-width:430px\)[\s\S]*game-player-row[\s\S]*grid-template-columns:minmax\(0,1fr\)/i);
  assert.match(interfaceStyles, /\.team-schedule-list[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(interfaceStyles, /@media \(max-width:760px\)[\s\S]*\.team-schedule-list[\s\S]*grid-template-columns:minmax\(0,1fr\)/i);
  assert.match(interfaceStyles, /\.schedule-column-grid[\s\S]*grid-auto-flow:column/i);
  assert.match(interfaceStyles, /\.schedule-field-card[\s\S]*repeating-linear-gradient[\s\S]*#173e2b/i);
  assert.match(page, /function isFcsTeam/i);
  assert.match(page, /\[suppliedLogo,logo,ranked\?\.logo,espnFallback,"\/fcs-logo\.png"\]/i);
  assert.match(page, /logoCandidates\.find\(\(source\)=>!failedSources\.includes\(source\)\)/i);
  assert.match(page, /genericLabel=\{game\.opponentIsFcs\?"FCS":undefined\}/i);
  assert.match(page, /ranking-schedule-game schedule-field-card \$\{game\.result==="L"\?"loss":""\}/i);
  assert.match(interfaceStyles, /\.schedule-field-card\.loss[\s\S]*#4a211f/i);
  assert.match(interfaceStyles, /\.team-mark\.generic-fcs-mark/i);
  assert.match(interfaceStyles, /\.ranking-schedule-week[\s\S]*color:#f7f7f2[\s\S]*font:900 9px/i);
  assert.match(interfaceStyles, /\.ranking-schedule-game \.team-mark-sm[\s\S]*width:38px!important/i);
  assert.match(page, /scheduleGameLabel\(detailRow\)/i);
  assert.match(page, /function LinkedScheduleGameDetail/i);
  assert.match(page, /onSelectGame=\{openScheduleGame\}/i);
  assert.match(page, /ranking-schedule-game schedule-field-card[\s\S]*onClick=\{\(\)=>onSelectGame/i);
  assert.match(page, /resolveTeamLogoAsset\(name,variant\)/i);
  assert.match(page, /data-logo-variant=\{variant\}/i);
  assert.match(page, /variant="helmet"/i);
  assert.match(page, /gameStatLeaderSide/i);
  assert.match(page, /leader==="away"[\s\S]*variant="helmet"/i);
  assert.match(page, /className="game-team-site-label">AWAY/i);
  assert.match(page, /<b>HOME TEAM<\/b>/i);
  assert.match(page, /CLOSING SPREAD/i);
  assert.match(page, /marketTotalLabel\(row\)/i);
  assert.match(page, /function modelSpreadLabel/i);
  assert.match(page, /function compactMarketSpreadLabel/i);
  assert.match(page, /<i>MKT SPREAD<\/i><b>\{compactMarketSpreadLabel\(row\)\}<\/b>/i);
  assert.match(page, /<i>H\+ TOTAL<\/i><b>\{modelTotalLabel\(row\)\}<\/b>/i);
  assert.match(page, /H\+ MODEL SPREAD/i);
  assert.match(page, /OFFICIAL ATS SET/i);
  assert.match(page, /<GameModelAudit row=\{row\}\/>/i);
  assert.match(gameMarketSummary, /export function modelSpreadRead/i);
  assert.match(gameMarketSummary, /export function officialAtsSetRead/i);
  assert.match(page, /This game<\/button>[\s\S]*Season to date<\/button>/i);
  assert.match(page, /\/api\/game-players/i);
  assert.match(gamePlayerRoute, /playerGameBoxLines/i);
  assert.match(gamePlayerRoute, /aggregatePlayerGameLines/i);
  assert.match(gamePlayerRoute, /includedGameIds/i);
  assert.match(interfaceStyles, /game-stat-readout > \.team-mark-sm[\s\S]*width:25px/i);
  assert.match(interfaceStyles, /\.game-detail-market/i);
  assert.match(interfaceStyles, /\.game-detail-market \{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/i);
  assert.match(interfaceStyles, /\.game-model-audit/i);
  assert.match(logoAssets, /"Alabama"[\s\S]*alabama\.webp[\s\S]*alabama-helmet\.webp/i);
  assert.match(logoAssets, /"San Jose State": "San José State"/i);
  assert.match(logoAssets, /"Missouri State"[\s\S]*missouri-state\.webp/i);
  assert.match(logoAssets, /"North Dakota State"[\s\S]*north-dakota-state\.webp/i);
  assert.match(logoAssets, /"Sacramento State"[\s\S]*sacramento-state\.webp/i);
  assert.match(logoAssets, /"Iowa"[\s\S]*primary": "\/team-logos\/michigan\.webp"[\s\S]*iowa-helmet\.webp/i);
  assert.match(logoAssets, /"Michigan"[\s\S]*primary": "\/team-logos\/iowa\.webp"[\s\S]*michigan-helmet\.webp/i);
  assert.match(logoAssets, /"Cincinnati"[\s\S]*primary": "\/team-logos\/tcu\.webp"/i);
  assert.match(logoAssets, /"Colorado"[\s\S]*primary": "\/team-logos\/cincinnati\.webp"/i);
  assert.match(logoAssets, /"UCF"[\s\S]*helmet": "\/team-logos\/arizona-helmet\.webp"/i);
  assert.match(logoAssets, /"Oklahoma State"[\s\S]*helmet": "\/team-logos\/ucf-helmet\.webp"/i);
  assert.match(logoAssets, /missingPrimary: \[\]/i);
  assert.match(interfaceStyles, /normalized visible bounds without a backing tile/i);
  assert.match(interfaceStyles, /\.team-mark\.has-logo[\s\S]*padding:0!important[\s\S]*background:transparent!important/i);
  assert.doesNotMatch(interfaceStyles, /warm, chalk-white identity card|#f8f6ec|#efecdf|#ddd9ca/i);
});

test("separates results-only Rankings from the shared Scores and Season Sim forecast",async()=>{
  const [page,dataRoute,playerRoute,conferenceFilters,weeklySnapshot,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/player-ratings/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/conferenceFilters.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/weeklyRankingSnapshot.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/interface.css",import.meta.url),"utf8"),
  ]);
  assert.ok((page.match(/value=\{POWER_4_FILTER\}/g)??[]).length>=6);
  assert.match(conferenceFilters,/\["ACC", "Big 12", "Big Ten", "SEC"\]/);
  assert.match(dataRoute,/view === "simulation" \|\| view === "projected-ranks"/);
  assert.match(dataRoute,/const topRankings=fullSimulation\.rankings\.slice\(0,25\)/);
  assert.match(dataRoute,/requestedTeamRanking=team\?fullSimulation\.rankings\.find/);
  assert.match(playerRoute,/conferenceFilterSqlValues\(selectedConference\)/);
  assert.match(playerRoute,/matchesConferenceFilter\(row\.conference,selectedConference\)/);
  assert.match(page,/function useProjectedFinalRanks/);
  assert.match(page,/function useSeasonRankings/);
  assert.match(page,/scoreRankingSnapshotWeek\(week,16\)/);
  assert.match(page,/section === "schedule" \? <SchedulePage/);
  assert.match(page,/section === "rankings" \? <ResultsRankingsPage/);
  assert.match(page,/function ResultsRankingsPage/);
  assert.match(page,/function ResultsOnlyRankingsTable/);
  assert.match(page,/useSeasonRankings\(season,snapshotWeek\)/);
  assert.match(page,/const snapshotWeek=enteringWeekSnapshotWeek\(week\);[\s\S]*useSeasonSimulation\(season, snapshotWeek\)/);
  assert.match(page,/Week \$\{week\} results are excluded here/);
  assert.match(page,/same projected-final order produced by Season Sim/);
  assert.match(page,/<h1>Score H\+ Top 25<\/h1>/);
  assert.doesNotMatch(page,/<h1>Scores \+ H\+ Top 25<\/h1>/);
  assert.match(page,/H\+ FORECAST TOP 25/);
  assert.match(page,/function WeeklyProjectedRankingsTable/);
  assert.match(page,/useProjectedFinalRanks\(season,week,resolvedSelectedName\?\?""\)/);
  assert.match(page,/className="team-record-callout"/);
  assert.match(page,/PROJECTED RECORD/);
  assert.match(page,/FINALS \+ FUTURE PICKS/);
  assert.match(page,/ranked\?\.projectedRecord/);
  assert.match(styles,/\.team-record-callout strong/);
  assert.match(page,/rank&&rank<=25/);
  assert.match(page,/H\+ #\{rank\}/);
  assert.match(dataRoute,/Season Sim projected-final ranking/i);
  assert.match(dataRoute,/Results-only Harper BCS v5/i);
  assert.match(dataRoute,/no future projections/i);
  assert.match(dataRoute,/buildSeasonSimulation\(season,rankingWeek,rankingWeek,simulationSchedule,profiles\)/);
  assert.match(weeklySnapshot,/normalizedWeek>0\?normalizedWeek-1/);
  assert.match(weeklySnapshot,/normalizedWeek-1/);
  assert.ok((page.match(/includeGameTimeRanks:"1"/g)??[]).length>=5);
  assert.match(page,/game-detail-pregame-rank/);
  assert.match(page,/schedule-game-rank/);
  assert.match(styles,/\.mobile-game-team-rank/);
  assert.match(styles,/\.mobile-game-team-rank[\s\S]*font:900 9px/);
  assert.match(styles,/\.game-detail-pregame-rank/);
  assert.match(styles,/\.scores-rankings-tabs/);
  assert.match(styles,/\.weekly-ranking-snapshot/);
  assert.match(styles,/\.results-only-ranking-entry/);
  assert.match(styles,/\.unified-ranking-row \.ranking-metrics > :first-child \{[\s\S]*width:100%[\s\S]*align-items:center[\s\S]*text-align:center/i);
  assert.match(page,/className="mobile-game-matchup"/);
  assert.match(page,/className="mobile-game-market-strip"/);
  assert.match(page,/MKT SPREAD/);
  assert.match(page,/H\+ SPREAD/);
  assert.match(styles,/\.mobile-game-matchup \{[\s\S]*grid-template-columns:minmax\(0,1fr\) 64px minmax\(0,1fr\)/i);
  assert.match(styles,/html\[data-theme="light"\][\s\S]*\.mobile-game-card\.schedule-field-card \{[\s\S]*var\(--app-panel\)!important/i);
});

test("ships the matchup and season-path analysis surfaces", async () => {
  const [source,styles,interfaceStyles,dataRoute,tacticalPlan,playDiagram,simulation,matchupEngine,teamStatsSort,footballIntelligence] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/interface.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tacticalPlan.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/playDiagram.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/matchupEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/teamStatsSort.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/footballIntelligence.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /UNIT MATCHUPS/i);
  assert.match(source, /Who controls each position group\?/i);
  assert.match(source, /OL vs DL/i);
  assert.match(source, /WR \/ TE vs CB \/ S/i);
  assert.match(source, /QB vs SECONDARY/i);
  assert.match(source, /RB vs LB/i);
  assert.match(source, /function PositionMatchupComparison/i);
  assert.match(source, /function PositionUnitRatings/i);
  assert.match(source, /function positionUnitRatingSummary/i);
  assert.match(source, /function averageUnitStars/i);
  assert.match(source, /STARTER AVG/i);
  assert.match(source, /DEPTH AVG/i);
  assert.match(source, /matched transfer grades replace high-school grades/i);
  assert.doesNotMatch(source, /function PositionUnitPucks/i);
  assert.match(source, /function battleGrade/i);
  assert.match(source, /type PositionCoreStats/i);
  assert.match(source, /source:"ADVANCED"\|"CORE PROXY"/i);
  assert.match(source, /buildPositionBattles\(homeProjection,homeCore\)/i);
  assert.match(source, /homeCore=\{projection\.homeStats\}/i);
  assert.match(source, /role="tablist" aria-label="Matchup analysis sections"/i);
  assert.match(source, /aria-controls="matchup-analysis-panel"/i);
  assert.match(source, /label:"Overview"/i);
  assert.match(source, /label:"Unit Matchups"/i);
  assert.match(source, /label:"Playbook"/i);
  assert.match(source, /label:"Data"/i);
  assert.doesNotMatch(source, /eyebrow:"0[1-9]"/i);
  assert.match(source, /resolvedMatchupTab==="positions"&&projection&&displayHome&&displayAway\?<PositionMatchupComparison/i);
  assert.doesNotMatch(source, /projection\?\.homeStats\.advanced&&projection\.awayStats\.advanced&&displayHome&&displayAway/i);
  assert.doesNotMatch(source, /<MatchupIntelligenceCard/i);
  assert.match(source, /function AdvancedMatchupCard/i);
  assert.match(source, /<AdvancedMatchupCard/i);
  assert.match(source, /ADVANCED METRICS/i);
  assert.match(source, /Full matchup evidence/i);
  assert.match(source, /data-surface="Projected stat profile"/i);
  assert.match(source, /function MatchupStatProfilePanel/i);
  assert.match(source, /<h2>Stat profile<\/h2>/i);
  assert.match(source, /OPPONENT OUTPUT ALLOWED/i);
  assert.doesNotMatch(source, /<PlayerMatchupImpact/i);
  assert.match(source, /WHY \{gameFavoriteName\(row\)\.toUpperCase\(\)\} IS FAVORED/i);
  assert.match(source, /BEST WINS/i);
  assert.match(source, /WORST LOSSES/i);
  assert.match(source, /function UnifiedRankingEntry/i);
  assert.match(source, /function RankingSchedulePanel/i);
  assert.match(source, /className="rankings-shell unified-rankings-shell weekly-projected-rankings-shell"/i);
  assert.match(source, /className="all137-ranking-entry"/i);
  assert.match(source, /className="simulation-ranking-entry"/i);
  assert.match(source, /simulatedSchedule=\{row\.schedule\}/i);
  assert.match(source, /function simulationMatchupDetailRow/i);
  assert.match(source, /className="simulation-matchup-preview/i);
  assert.match(source, /MATCHUP PREVIEW/i);
  assert.match(source, /simulationMatchupDetailRow\(game,season,data\.effectiveWeek,logoByTeam\)/i);
  assert.match(source, /ranking-schedule-week/i);
  assert.match(source, /ranking-schedule-list schedule-column-grid/i);
  assert.match(source, /ranking-schedule-game schedule-field-card/i);
  assert.doesNotMatch(source, /className="sim-team-schedule"/i);
  assert.match(interfaceStyles, /\.unified-ranking-row[\s\S]*min-height:76px!important/i);
  assert.match(interfaceStyles, /\.ranking-schedule-list[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(interfaceStyles, /\.simulation-page \.bracket-game footer[\s\S]*margin:0!important/i);
  assert.match(interfaceStyles, /\.simulation-page \.bracket-round > div[\s\S]*justify-content:space-evenly/i);
  assert.match(interfaceStyles, /\.simulation-matchup-preview[\s\S]*cursor:pointer/i);
  assert.match(interfaceStyles, /@media \(max-width:900px\)[\s\S]*\.ranking-schedule-list[\s\S]*grid-template-columns:minmax\(0,1fr\)/i);
  assert.match(source, /H\+ COORDINATOR VIEW/i);
  assert.match(source, /Formation, play call and the grass each offense should attack/i);
  assert.match(source, /HOME ·/i);
  assert.match(source, /OFFENSE CALL/i);
  assert.match(source, /First read/i);
  assert.match(source, /Fake \/ read/i);
  assert.match(source, /PLAY-STYLE FINGERPRINT/i);
  assert.match(source, /PASS RUSH/i);
  assert.match(source, /COVERAGE/i);
  assert.match(source, /RUN FIT/i);
  assert.match(source, /PASSING DOWN/i);
  assert.match(source, /BroadcastStats/i);
  assert.match(source, /OFFENSE COUNTERS/i);
  assert.match(source, /DEFENSE PLAN · PASS RUSH/i);
  assert.match(source, /OFFENSE COUNTER/i);
  assert.match(source, /DEFENSE EDGE/i);
  assert.match(source, /coordinator-role-strip/i);
  assert.match(styles, /\.position-battle-directions[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(styles, /@media \(max-width:900px\)[\s\S]*\.position-battle-directions[\s\S]*grid-template-columns:1fr/i);
  assert.match(styles, /\.position-battle-meter > i[\s\S]*linear-gradient\(90deg,var\(--position-red\),var\(--position-yellow\) 50%,var\(--position-green\)\)/i);
  assert.match(styles, /\.position-unit-ratings > div[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(styles, /\.position-unit-ratings article strong[\s\S]*color:#efd16f/i);
  assert.doesNotMatch(styles, /\.position-unit-puck \.team-mark-sm/i);
  assert.match(styles, /\.broadcast-stat-row[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(styles, /\.matchup-page[\s\S]*--broadcast-white:#f4f1e4/i);
  assert.match(styles, /--drawer-paper:#131413/i);
  assert.match(styles, /\.matchup-page details\.analysis-disclosure[\s\S]*background:var\(--drawer-paper\)!important/i);
  assert.match(styles, /\.broadcast-owner[\s\S]*font:900 6px\/1/i);
  assert.match(styles, /\.coordinator-scout-grid[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/i);
  assert.match(styles, /Harper\+ v29[\s\S]*\.playbook-detail \.tactical-field-grid[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/i);
  assert.match(styles, /Harper\+ v30[\s\S]*footer\.tactical-call-sheet[\s\S]*margin:0!important/i);
  assert.match(styles, /\.broadcast-owner[\s\S]*order:4/i);
  assert.match(source, /market-team-pick/i);
  assert.match(styles, /--matchup-panel:#141514/i);
  assert.match(styles, /\.pressure-threat\.threat-severe/i);
  assert.match(source, /CROSS-ERA SCORE RECEIPT/i);
  assert.match(source, /All137 scoring path/i);
  assert.match(source, /Final · bowls \+ playoff/i);
  assert.match(source, /function DisclosureControl/i);
  assert.match(source, /analysis-disclosure/i);
  assert.match(source, /className="matchup-tactical-board matchup-tab-surface playbook-detail"/i);
  assert.match(styles, /\.matchup-page-tabs[\s\S]*role="tablist"|\.matchup-page-tabs/i);
  assert.match(source, /className="summary-team-pick"/i);
  assert.match(source, /EXPAND/i);
  assert.match(source, /MINIMIZE/i);
  assert.match(tacticalPlan, /AIR RAID SPREAD/i);
  assert.match(tacticalPlan, /I-FORM POWER/i);
  assert.match(tacticalPlan, /FLEXBONE OPTION/i);
  assert.match(playDiagram, /LT/);
  assert.match(playDiagram, /scrimmage is y=61\.5/i);
  assert.match(dataRoute, /finalContextApplied/i);
  assert.match(dataRoute, /crossEraRating/i);
  assert.doesNotMatch(dataRoute, /refreshViabilityCalibrationFromDatabase/i);
  assert.match(dataRoute, /compactSchedule/);
  assert.match(source, /compactSchedule:"1"/);
  assert.ok(source.indexOf('className="playoff-card"') < source.indexOf('className="simulation-stack"'));
  assert.match(interfaceStyles, /Season Sim follows the decision flow: CFP bracket, title weekend, final Top 25/i);
  assert.match(source, /Every Season/i);
  assert.match(source, /BEST WINS/i);
  assert.match(source, /schedule-conference/i);
  assert.match(source, /schedule-picks/i);
  assert.match(source, /ATS picks only/i);
  assert.match(source, /O\/U test picks only/i);
  assert.match(source, /Week, then date/i);
  assert.match(source, /includeMarketDecisions/i);
  assert.match(source, /<MobileScoreboard rows=\{activeRows\}/i);
  assert.doesNotMatch(source, /schedule-desktop-ledger|PROJECTED AFTER GAME/i);
  assert.match(dataRoute, /buildScheduleRecordTimeline/i);
  assert.match(source, /idPrefix="matchup-home"/i);
  assert.match(source, /idPrefix="matchup-away"/i);
  assert.match(source, /STAT DEFINITIONS/i);
  assert.match(source, /className="stat-help"/i);
  assert.match(source, /Choose advanced stat data view/i);
  assert.match(source, /stats-head-cell/i);
  assert.match(teamStatsSort, /All Advanced/i);
  assert.match(teamStatsSort, /Defense · Adjusted % Allowed/i);
  assert.match(styles, /\.stats-head-cell[\s\S]*grid-template-columns:minmax\(0,1fr\) 19px/i);
  assert.match(source, /FIRST_MODEL_SEASON = 2014/i);
  assert.match(source, /O\/U TEST/i);
  assert.match(source, /O\/U RECORD/i);
  assert.match(dataRoute, /totalDiagnosticWinSql/i);
  assert.match(source, /snapshot-badge frozen/i);
  assert.match(source, /harper-football-mark/i);
  assert.match(source, /\/harper-football\.svg/i);
  assert.match(styles, /readable Matchup Lab copy on narrow phone screens/i);
  assert.match(source, /95% CI/i);
  assert.match(source, /row\.spread\.quarantined[\s\S]*excluded/i);
  assert.match(dataRoute, /legacyConsensusQuarantineSql/i);
  assert.match(dataRoute, /marketLineSeasonStatus/i);
  assert.match(dataRoute, /off_patt_index AS offPattIndex/i);
  assert.match(dataRoute, /def_ratt_index AS defRattIndex/i);
  assert.match(simulation, /projectSeasonMatchup/i);
  assert.match(simulation, /exact Matchup Lab engine/i);
  assert.match(matchupEngine, /Canonical Harper\+ single-game path/i);
  assert.match(source, /Why the game projects this way/i);
  assert.match(source, /DERIVED MATCHUP EDGES/i);
  assert.match(source, /mode="advantages"/i);
  assert.match(source, /TEAM IDENTITY ENGINE/i);
  assert.match(source, /HISTORICAL DNA/i);
  assert.match(source, /MODEL CHANGE LOG/i);
  assert.match(dataRoute, /view === "similar-teams"/i);
  assert.match(dataRoute, /view === "team-history"/i);
  assert.match(footballIntelligence, /deriveMatchupIntelligence/i);
  assert.match(footballIntelligence, /deriveTeamIdentity/i);
  assert.match(footballIntelligence, /findHistoricalComparisons/i);
  assert.match(styles, /\.football-intelligence-board/i);
  assert.match(styles, /\.team-intelligence-panel/i);
});

test("ships the bounded archive scheduler without removing its global lease", async () => {
  const [page, bootstrap, worker, config] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /60_000/);
  assert.doesNotMatch(page, /fetch\("\/api\/bootstrap", \{ cache:"no-store" \}\)/);
  assert.match(bootstrap, /ARCHIVE_REPAIR_COOLDOWN_SECONDS/);
  assert.match(bootstrap, /syncArchiveBatch/);
  assert.match(worker, /syncArchiveBatch\(env, repairSeason, "scheduled"\)/);
  assert.match(config, /"\*\/2 \* \* \* \*"/);
  assert.match(bootstrap, /getBackfillStatus/);
});

test("repairs historical player ratings independently of an unpublished active-season roster", async () => {
  const [pipeline,bootstrap,worker] = await Promise.all([
    readFile(new URL("../lib/playerPipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pipeline, /MAX\(season\) AS lastReadySeason/);
  assert.match(pipeline, /nextSeason <= lastReadySeason/);
  assert.match(pipeline, /lastReadySeason \+ 1/);
  assert.match(bootstrap, /playerSyncError/);
  assert.match(bootstrap, /if \(!status\.missing\.length\) \{/);
  assert.match(worker, /refreshPlayerProductionBaselineIfNeeded\(env\.DB\)/);
});

test("ships the sortable Player Ratings index without loading full depth charts into the browser", async () => {
  const [page,shell,route,styles,pipeline,ratings] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-ratings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/interface.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/playerPipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/playerProductionRatings.ts", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /id:"players",label:"Player Ratings"/);
  assert.match(page, /function PlayerRatingsPage/);
  assert.match(page, /ALL TEAMS/);
  assert.match(page, /ALL CONFERENCES/);
  assert.match(page, /ALL POSITIONS/);
  assert.match(page, /HIGH → LOW/);
  assert.match(page, /PLAYER_RATING_COLUMN/);
  assert.match(page, /player-ratings-filter-drawer/);
  assert.match(page, /player-ratings-table-shell/);
  assert.match(page, /player-rating-table-row/);
  assert.match(page, /function PlayerStatsJersey/);
  assert.match(page, /className="player-stats-jersey-card"/);
  assert.match(page, /className="player-stats-jersey"/);
  assert.match(page, /playerOverallTier/);
  assert.doesNotMatch(page, /player-ratings-baseline|LIVE RATING SET|COMPARISON SET/);
  assert.match(ratings, /ELITE OF THE ELITE/);
  assert.match(page, /top 4%/);
  assert.match(page, /section === "players"/);
  assert.match(route, /loadPlayerProductionBaseline/);
  assert.match(route, /loadSeasonOffensiveLineUnitScores/);
  assert.match(route, /projectedProductionRating/);
  assert.match(route, /productionRatingFromScale/);
  assert.match(route, /productionPercentileFromScale/);
  assert.match(route, /comparePlayerRatingEvidence/);
  assert.match(route, /json_each\(profile\.profile_json,'\$\.players'\)/);
  assert.match(route, /normalized\.score AS normalizedScore/);
  assert.match(route, /normalized\.percentile AS normalizedPercentile/);
  assert.match(route, /LEFT JOIN normalized/);
  assert.match(route, /provisionalProductionOverallFromPercentile/);
  assert.match(route, /normalized\.opponent_relative AS opponentRelative/);
  assert.match(route, /playerStatProfile/);
  assert.match(route, /player_stat_rows AS/);
  assert.doesNotMatch(route, /player\.value AS playerJson/);
  assert.match(route, /VS OPP/);
  assert.match(route, /sort === "conference"/);
  assert.match(route, /name:`\$\{teamName\} OLine`/);
  assert.match(route, /jersey:offensiveLineJerseyNumber\(teamName\)/);
  assert.match(route, /offensiveLineJerseyNumber/);
  assert.doesNotMatch(route, /competitionAdjustedOffensiveLineScore/);
  assert.match(route, /baseline\.currentGenerationReady/);
  assert.match(pipeline, /const loadEntireSeason = uniqueTeams\.length > 80/);
  assert.match(pipeline, /storedTeamFilter = loadEntireSeason/);
  assert.match(pipeline, /loadEntireSeason \? \[season\] : \[season, \.\.\.uniqueTeams\]/);
  assert.match(pipeline, /loadEntireSeason \? \[season, season\]/);
  assert.match(pipeline, /category_key IN \('defensive','defense','interceptions'\)/);
  assert.match(pipeline, /WHEN position IN \('EDGE','DL','LB','CB','S'\) THEN NULL/);
  assert.match(styles, /\.player-ratings-controls/);
  assert.match(styles, /\.player-rating-table-row/);
  assert.match(styles, /\.player-rating-table-value/);
  assert.match(styles, /\.player-ratings-table-head,[\s\S]*\.player-rating-table-row[\s\S]*min-width:0;[\s\S]*grid-template-columns:minmax\(0,1fr\) 76px/);
  assert.match(styles, /\.player-ratings-table-shell[\s\S]*overflow-x:hidden/);
  assert.match(styles, /\.player-ratings-filter-drawer > \.player-ratings-controls[\s\S]*display:flex[\s\S]*flex-wrap:nowrap/);
  assert.doesNotMatch(page, /className="player-ratings-list"|className="player-rating-stat-profile"/);
});

test("ships the position-specific sortable Player Stats tab", async () => {
  const [page,shell,route,wrapper,styles,playerStats] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-ratings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-stats/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/interface.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/playerStats.ts", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /id:"stats",label:"Stats"/);
  assert.match(page, /function PlayerStatsPage/);
  assert.match(page, /function StatsHubPage/);
  assert.match(page, /Choose team or player statistics/);
  assert.match(page, /section === "playerstats"/);
  assert.match(page, /Filter player stats by conference/);
  assert.match(page, /Choose player statistic/);
  assert.match(page, /Only the selected statistic is shown/);
  assert.match(page, /visibleColumns\.map/);
  assert.match(page, /function playerStatsJerseyStyle/);
  assert.match(page, /const visibleColumns=useMemo\(\(\)=>\[columns\[0\],selectedMetric\]/);
  assert.match(page, /className="player-stats-jersey-card"/);
  assert.match(page, /className="player-stats-jersey"/);
  assert.match(page, /className="player-stats-ranks"/);
  assert.match(page, /NAT <b>\{row\.nationalRank\}/);
  assert.match(page, /ERA <b>\{row\.allEraRank\?\?"—"\}/);
  assert.match(page, /RANK BADGES/);
  assert.match(page, /const \[season,setSeason\]=useState\(activeModelSeason\)/);
  assert.match(page, /2014–\{activeModelSeason\}/);
  assert.match(page, /row\.team\} · \{row\.conference\|\|"FBS"\}/);
  assert.doesNotMatch(page, /className="player-stats-team"/);
  assert.doesNotMatch(page, /className=\{`player-stats-conference/);
  assert.doesNotMatch(page, /player-stats-metrics/);
  assert.match(page, /playerStatsColumns\(position\)/);
  assert.match(wrapper, /searchParams\.set\("view","stats"\)/);
  assert.match(route, /if\(statsView\)/);
  assert.match(route, /sortPlayerStatsRows/);
  assert.match(route, /playerStatsOrdinalRanks/);
  assert.match(route, /historicalProductionRank/);
  assert.match(route, /season BETWEEN \? AND \? AND position=\?/);
  assert.match(route, /nationalRank:nationalRanks\.get/);
  assert.doesNotMatch(route, /player\.value AS playerJson/);
  assert.match(route, /json_extract\(player\.value,'\$\.stats'\) AS playerStatsJson/);
  assert.match(route, /json_extract\(player\.value,'\$\.advanced'\) AS playerAdvancedJson/);
  assert.match(route, /allEraScore:normalizedScore\?\?fallbackAllEraScore/);
  assert.match(route, /observedPlayerProductionScore\(player\)/);
  assert.match(route, /allEraRank:historicalProductionRank\(allEraScore/);
  assert.doesNotMatch(route, /historicalProductionRank\(row\.productionScore/);
  assert.match(route, /playerQualifiesForStat/);
  assert.match(route, /qualification:\{label:qualificationRule\.label/);
  assert.match(route, /metric:statsMetric/);
  assert.match(route, /stats\.stat_rows AS statRows/);
  assert.match(route, /json_extract\(player\.value,'\$\.advanced\.overallUsage'\)/);
  assert.match(playerStats, /QB:\[/);
  assert.match(playerStats, /EDGE:\[/);
  assert.match(playerStats, /function offensiveLineJerseyNumber/);
  assert.match(playerStats, /function defensiveTackleUnitJerseyNumber/);
  assert.match(playerStats, /CONFERENCE/);
  assert.match(playerStats, /passPpa/);
  assert.match(playerStats, /100\+ pass attempts/);
  assert.match(playerStats, /8\+ field-goal attempts/);
  assert.match(styles, /\.player-stats-table-shell/);
  assert.match(styles, /\.player-stats-jersey-card \{/);
  assert.match(styles, /background:radial-gradient\(circle at 34% 26%,#f3f5f3 0,#dfe4e1 48%,#aeb9b5 100%\)/);
  assert.match(styles, /\.player-stats-jersey-card::after \{/);
  assert.match(styles, /\.player-stats-jersey \{/);
  assert.match(styles, /\.player-stats-ranks \{/);
  assert.match(styles, /clip-path:polygon/);
  assert.match(styles, /\.player-stats-head,[\s\S]*column-gap:18px/);
  assert.match(styles, /@media \(max-width:900px\)[\s\S]*\.player-stats-head \{[\s\S]*display:grid/);
  assert.match(styles, /@media \(max-width:900px\)[\s\S]*\.player-stats-row \{[\s\S]*display:grid/);
});

test("ships the filter-only team and player scatterplot visualizer",async()=>{
  const [page,shell,route,weeklyRoute,weeklyModel,styles,scatter]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/components/AppShell.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/player-ratings/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/player-weekly/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/playerWeekly.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/interface.css",import.meta.url),"utf8"),
    readFile(new URL("../lib/scatterplot.ts",import.meta.url),"utf8"),
  ]);
  assert.match(shell,/id:"visualize",label:"Visualize"/);
  assert.match(shell,/id:"overview",label:"Home"/);
  assert.match(shell,/navigate\("overview"\).*aria-label="Harper Plus home"/);
  assert.match(page,/function DataVisualizerPage/);
  assert.match(page,/useState<TeamScatterFamily>\("basic"\)/);
  assert.match(page,/useState\("ypp"\)/);
  assert.match(page,/useState\("ypa"\)/);
  assert.match(page,/useState<Section>\("overview"\)/);
  assert.match(page,/function SimpleHomePage/);
  assert.match(page,/navigation\.filter\(\(item\)=>item\.id!=="overview"\)/);
  assert.match(page,/href="https:\/\/formsubmit\.co\/el\/sifele"/);
  assert.match(page,/OPEN CONTACT FORM/);
  assert.doesNotMatch(page,/formsubmit\.co\/(?:ajax\/)?mcfh34@gmail\.com/);
  assert.match(page,/section === "visualize"/);
  assert.match(page,/aria-label="Scatterplot filters"/);
  assert.match(page,/TEAM STATS/);
  assert.match(page,/PLAYER STATS/);
  assert.match(page,/Choose X axis statistic/);
  assert.match(page,/Choose Y axis statistic/);
  assert.match(page,/Filter scatterplot by conference/);
  assert.match(page,/Filter scatterplot by teams/);
  assert.match(page,/ALL YEARS · 14–\$\{String\(activeModelSeason\)\.slice\(-2\)\}/);
  assert.match(page,/compactSelectedYears/);
  assert.match(page,/function ScatterMultiSelect/);
  assert.match(page,/selectedYears\.length>1/);
  assert.match(page,/selectedTeams,setSelectedTeams/);
  assert.match(page,/useScatterPlayerStats\(selectedYears,position,mode==="player"\)/);
  assert.match(page,/Math\.min\(2,requestedSeasons\.length\)/);
  assert.match(page,/scatterPlayerPayloadCache/);
  assert.match(page,/profile:"qualified-v3"/);
  assert.match(page,/open=\{open\} onToggle=/);
  assert.match(page,/playerMeetsScatterParticipationThreshold\(row,position\)/);
  assert.doesNotMatch(page,/setMode\(nextMode\);setConference\(""\);setSelectedTeams\(\[\]\)/);
  assert.match(page,/playerQualifiesForStat\(row,position,metric\.key/);
  assert.match(page,/id:`team-\$\{row\.season\}-\$\{row\.team\}`/);
  assert.match(page,/id:`player-\$\{row\.season\}-\$\{row\.team\}-\$\{row\.id\}`/);
  assert.match(page,/scatter-season-tag/);
  assert.match(page,/className="scatter-chart-brand"[\s\S]*\/harper-football\.svg/);
  assert.match(page,/useSyncExternalStore/);
  assert.match(page,/width:390,height:570/);
  assert.match(page,/TEAM_STATS_ADVANCED_METRICS/);
  assert.match(page,/OL_SCATTER_ADVANCED_METRICS/);
  assert.match(page,/LINE YARDS \/ RUSH/);
  assert.match(page,/PASSING-DOWN SUCCESS/);
  assert.match(page,/const plottedTeamLogo=resolveTeamLogoAsset\(point\.team\)\?\?point\.logo/);
  assert.match(page,/mode==="team"\?\(plottedTeamLogo\?<img/);
  assert.match(page,/<PlayerStatsJersey team=\{point\.team\}/);
  assert.match(page,/scatter-average-line/);
  assert.match(page,/scatter-trend-line/);
  assert.match(page,/WEEKLY PROGRESSION/);
  assert.match(page,/PFF 2025 OFFENSE/);
  assert.match(page,/PFF metrics are reproduced from a user-supplied 2025 data export/);
  assert.match(page,/pffMetricSampleQualified/);
  assert.match(page,/STAT GROUP/);
  assert.match(page,/function PlayerWeeklyTrend/);
  assert.match(page,/GAME WEEK/);
  assert.match(page,/chronological-opponent-logos-v2/);
  assert.match(page,/player-weekly-opponent-logo/);
  assert.match(page,/opponentLogo=resolveTeamLogoAsset\(point\.game\.opponent\)\?\?point\.game\.opponentLogo/);
  assert.match(page,/opponentLogo/);
  assert.match(page,/RUNNING AVG/);
  assert.match(page,/usePlayerWeeklyTimeline/);
  assert.match(route,/const scatterView/);
  assert.match(route,/optimizedPlayerScatterResponse/);
  assert.match(route,/x-harper-scatter-path","qualified-player-json-v3/);
  assert.match(route,/url\.searchParams\.getAll\("team"\)/);
  assert.match(route,/filtered_players AS/);
  assert.match(route,/scatterParticipationSql/);
  assert.match(route,/fp\.player_json AS playerJson/);
  assert.match(route,/playerBasicMetric\(player,key\)/);
  assert.match(route,/COALESCE\(stats\.pass_attempts,0\)>=100/);
  assert.match(route,/playerMeetsScatterParticipationThreshold\(publicRow,statsPosition\)/);
  assert.match(route,/playerQualifiesForStat\(row,statsPosition,scatterX\)/);
  assert.match(route,/playerQualifiesForStat\(row,statsPosition,scatterY\)/);
  assert.match(weeklyRoute,/cfbd\("\/games\/players"/);
  assert.match(weeklyRoute,/\/ppa\/players\/games/);
  assert.match(weeklyRoute,/\/stats\/player\/success\/game/);
  assert.match(weeklyRoute,/x-harper-player-weekly-source/);
  assert.match(weeklyRoute,/opponent\.logo AS opponentLogo/);
  assert.match(weeklyRoute,/sort\(comparePlayerWeeklyGames\)/);
  assert.match(weeklyModel,/playerWeeklyBoxGames/);
  assert.match(weeklyModel,/playerWeeklySupportedMetric/);
  assert.match(styles,/\.scatter-controls/);
  assert.match(styles,/\.scatter-multi-select/);
  assert.match(styles,/\.scatter-multi-menu/);
  assert.match(styles,/\.scatter-stage/);
  assert.match(styles,/\.scatter-marker\.team-marker[\s\S]*width:48px[\s\S]*height:48px/);
  assert.match(styles,/\.scatter-marker > img[\s\S]*width:38px[\s\S]*height:38px/);
  assert.match(styles,/\.scatter-chart-brand/);
  assert.match(styles,/\.scatter-marker \.player-stats-jersey-card/);
  assert.match(styles,/\.player-weekly-actual/);
  assert.match(styles,/\.player-weekly-average/);
  assert.match(styles,/\.player-weekly-opponent-logo/);
  assert.match(styles,/\.scatter-controls select[\s\S]*background-color:var\(--app-panel-inset\)/);
  assert.match(styles,/@media \(max-width:700px\)[\s\S]*\.scatter-controls/);
  assert.match(styles,/@media \(max-width:700px\)[\s\S]*\.scatter-stage \{[\s\S]*min-width:0/);
  assert.match(styles,/@media \(max-width:700px\)[\s\S]*\.scatter-controls select \{[\s\S]*font-size:16px/);
  assert.doesNotMatch(styles,/SWIPE TO EXPLORE|min-width:680px/);
  assert.match(scatter,/function scatterRegression/);
});

test("historical box-score gaps receive a direct retry and an explicit source marker", async () => {
  const pipeline = await readFile(new URL("../lib/dataPipeline.ts", import.meta.url), "utf8");
  assert.match(pipeline, /cfbdOptional\("\/games\/teams", key, \{ id: game\.id \}\)/);
  assert.match(pipeline, /"source-gap"/);
  assert.match(pipeline, /excluded from statistical profiles/);
});

test("ships the 2014-forward player archive, transfer-first ratings and depth-chart surface", async () => {
  const [page,playerModel,playerPipeline,playerRoute,schema,styles,depthArchive,depthRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/playerModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/playerPipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/players/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/depthChartArchive.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/depth-charts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Depth Chart/);
  assert.match(page, /KEY PERSONNEL/);
  assert.match(page, /model-projected starter/i);
  assert.match(page, /player-matchup-call/);
  assert.match(page, /function TacticalPuck/);
  assert.match(page, /chalk-player team-puck \$\{side\}-marker/);
  assert.match(page, /puck-school-mark/);
  assert.match(page, /puck-jersey/);
  assert.match(page, /puck-stars/);
  assert.match(page, /playerRecruitingLabel\(starter\?\.profile\)/);
  assert.match(page, /Depth chart season/);
  assert.match(page, /function StarterFormationBoard/);
  assert.match(page, /function DepthRosterTable/);
  assert.match(page, /PUBLISHED DEPTH CHART/);
  assert.match(page, /SOURCE-AWARE PROJECTION/);
  assert.match(page, /VERIFIED WHEN PUBLISHED/);
  assert.match(page, /function depthOffenseFormation/);
  assert.match(page, /AIR RAID 10/);
  assert.match(page, /POWER 21/);
  assert.match(page, /LINE OF SCRIMMAGE/);
  assert.match(page, /HOW PRODUCTION RATINGS WORK/);
  assert.match(page, /QB grades require passing-volume proof/);
  assert.match(page, /46% proven production load/);
  assert.match(page, /27% output versus opponent allowance/);
  assert.match(page, /nonlinear workhorse test/);
  assert.match(page, /50–99 OVERALL/);
  assert.match(page, /top 0\.1%/);
  assert.match(page, /historical outcome of same-position players/);
  assert.match(page, /All five linemen share/);
  assert.match(page, /Second unit and reserves/);
  assert.match(page, /aria-label="Depth chart team"/);
  assert.match(page, /depth-roster-position-tabs/);
  assert.match(page, /stars-five/);
  assert.match(page, /PROD \/ STARS/);
  assert.match(page, /TeamMark name=\{teamName\} size="sm" logo=\{team\.logo\}/);
  assert.doesNotMatch(page, /<i>\{player\.role\}<\/i>/);
  assert.match(page, /--offense-primary/);
  assert.match(page, /--offense-secondary/);
  assert.match(page, /--defense-primary/);
  assert.match(page, /--defense-secondary/);
  assert.doesNotMatch(page, /className=\{`chalk-player[^`]+`\}[^;]+starter\?\.lastName/);
  assert.match(playerModel, /assignFormationPlayers/);
  assert.match(playerModel, /resolveProjectedStarters/);
  assert.match(playerModel, /defaultDefenseStarterRoles/);
  assert.match(playerModel, /46% proven production load, 27% output versus opponent allowance/i);
  assert.match(playerModel, /observedPlayerProductionScore/);
  assert.match(playerModel, /productionVolumeScore/);
  assert.match(playerPipeline, /RANK\(\) OVER/);
  assert.match(playerPipeline, /team_competition/);
  assert.match(playerPipeline, /competition_quality/);
  assert.match(playerPipeline, /pass_attempts\/300\.0/);
  assert.match(playerPipeline, /\.45\+\.55\*sample_proof/);
  assert.match(playerPipeline, /\.27\*opponent_proof/);
  assert.match(playerPipeline, /production_load/);
  assert.match(playerPipeline, /opponent_relative/);
  assert.match(playerPipeline, /player_offense_game_residual/);
  assert.match(playerPipeline, /printf\('%s-offensive-line-unit',team\)/);
  assert.match(playerPipeline, /percentile>=\.999 THEN 99/);
  assert.match(playerPipeline, /currentGenerationReady/);
  assert.doesNotMatch(playerPipeline, /offensiveLineBaselineSql/);
  assert.match(playerPipeline, /FROM player_production_baselines WHERE id=\?/);
  assert.match(playerPipeline, /FROM player_production_scores/);
  assert.match(playerPipeline, /JOIN selected_player_season selected ON selected\.season=ptp\.season/);
  assert.match(playerPipeline, /refreshPlayerProductionBaselineIfNeeded/);
  assert.match(playerPipeline, /\/stats\/player\/season/);
  assert.match(playerPipeline, /\/stats\/player\/success/);
  assert.match(playerPipeline, /\/player\/usage/);
  assert.match(playerPipeline, /\/ppa\/players\/season/);
  assert.match(playerPipeline, /\/player\/portal/);
  assert.match(playerPipeline, /\/recruiting\/players/);
  assert.match(playerPipeline, /FIRST_PLAYER_SEASON/);
  assert.match(playerPipeline, /recruitIds/);
  assert.match(playerRoute, /loadPlayerModels/);
  assert.doesNotMatch(playerRoute, /claimPlayerSync|syncPlayerSeasonBatch/);
  assert.match(schema, /player_team_profiles/);
  assert.match(schema, /opponentRelative: real\("opponent_relative"\)/);
  assert.match(schema, /depth_chart_snapshots/);
  assert.match(schema, /depth_chart_entries/);
  assert.match(schema, /depth_chart_coverage/);
  assert.match(schema, /depth_chart_import_runs/);
  assert.match(depthArchive, /source_verified_unmatched/);
  assert.match(depthArchive, /batchStatements/);
  assert.match(depthRoute, /projectionsNeverPromotedToVerified/);
  assert.match(depthRoute, /SYNC_TOKEN/);
  assert.match(schema, /playerProductionBaselines/);
  assert.match(schema, /playerProductionScores/);
  assert.match(schema, /recruitingJson/);
  assert.match(schema, /transferJson/);
  assert.match(styles, /\.depth-chart-layout/);
  assert.match(styles, /\.depth-formation-field/);
  assert.match(styles, /production-percentile depth room and play-style formations/i);
  assert.match(styles, /\.depth-starter-jersey::before/);
  assert.match(styles, /\.depth-line-of-scrimmage/);
  assert.match(styles, /\.depth-rating-method/);
  assert.match(styles, /\.depth-roster-table-shell/);
  assert.match(styles, /team-color play-art pucks/i);
  assert.match(styles, /\.chalk-player\.team-puck\.offense-marker/);
  assert.match(styles, /\.chalk-player\.team-puck\.defense-marker/);
  assert.match(styles, /\.chalk-player\.team-puck > \.puck-jersey[\s\S]*background:#050505!important/);
  assert.match(styles, /\.chalk-player\.team-puck > \.puck-stars/);
  assert.match(styles, /slot-resolved offensive lines and recruiting-grade pucks/i);
  assert.match(styles, /site-wide containment and readable responsive layouts/i);
  assert.match(styles, /logo-first playboard pucks and a focused Model HQ/i);
  assert.match(page, /function SimpleHomePage/i);
  assert.match(page, /College Football Model/i);
  assert.match(page, /Leave a note/i);
});

test("ships an isolated game-flip What If branch with league-wide ripple effects",async()=>{
  const [page,dataRoute,simulation,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/simulation.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/interface.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/function BorrowedScheduleWhatIf/);
  assert.match(page,/function GameFlipWhatIf/);
  assert.match(page,/function WhatIfPage/);
  assert.match(page,/SEASON SIM/);
  assert.match(page,/BORROW A SCHEDULE/);
  assert.match(page,/FLIP GAME OUTCOMES/);
  assert.match(page,/DIRECT OPPONENT EFFECT/);
  assert.match(page,/NATIONAL RIPPLE/);
  assert.match(page,/Completed and projected regular-season results can be changed/);
  assert.match(page,/If the selected team reaches its conference championship, Week 15 appears too/);
  assert.match(page,/function ScenarioMiniBracket/);
  assert.match(page,/BASELINE PLAYOFF/);
  assert.match(page,/WHAT IF PLAYOFF/);
  assert.match(page,/useState\(activeModelSeason\)[\s\S]*useState\(activeModelWeek\)/);
  assert.match(page,/useSimulationScenario\(season,snapshotWeek,resolvedTeam,overrideRows\)/);
  assert.match(dataRoute,/view==="simulation-scenario"/);
  assert.match(dataRoute,/simulationGameOverrides/);
  assert.match(dataRoute,/gameOverrides:appliedOverrides/);
  assert.match(dataRoute,/regularGames=baselineTeam\.schedule\.filter/);
  assert.match(dataRoute,/conferenceGames=\(provisionalTeam\?\.schedule/);
  assert.match(dataRoute,/simulationScenarioBracket/);
  assert.match(dataRoute,/baseline:\{champion:baseline\.champion,format:baseline\.format/);
  assert.match(dataRoute,/each seed equals its final Season Sim rank/);
  assert.doesNotMatch(dataRoute,/forceProjectedField/);
  assert.match(dataRoute,/Scores, Rankings and the normal Season Sim remain unchanged/);
  assert.match(simulation,/function realisticScenarioScore/);
  assert.match(simulation,/function applySimulationGameOverride/);
  assert.match(simulation,/function completedGameProjection/);
  assert.doesNotMatch(simulation,/const overrideWinner=known\?undefined/);
  assert.match(simulation,/finalRankings\.slice\(0,format\)\.map\(\(row\)=>\(\{seed:row\.rank,team:row\.team\}\)\)/);
  assert.doesNotMatch(simulation,/historicalFields/);
  assert.match(simulation,/Manual scenario results are fixed before conference standings/);
  assert.match(page,/SEASON SIM RANKINGS → CFP SEEDS/);
  assert.match(page,/SEEDS = FINAL H\+ RANKS/);
  assert.match(page,/Seeds follow each branch&apos;s final Season Sim ranking/);
  assert.match(styles,/\.what-if-tabs/);
  assert.match(styles,/\.what-if-tabs \{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles,/\.scenario-outcome-toggle/);
  assert.match(styles,/\.scenario-impact-grid/);
  assert.match(styles,/\.scenario-playoff-ripple/);
  assert.match(styles,/\.scenario-mini-rounds/);
  assert.match(styles,/@media \(max-width:430px\)[\s\S]*\.what-if-tabs \{ grid-template-columns:minmax\(0,1fr\)/);
});

test("ships one shared H+ Win Conditions engine to Scores and Matchup Lab",async()=>{
  const [page,dataRoute,engine,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/data/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/winConditions.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/interface.css",import.meta.url),"utf8"),
  ]);
  assert.match(dataRoute,/view==="win-conditions"/);
  assert.match(dataRoute,/buildWinConditionAnalysis/);
  assert.match(dataRoute,/winConditionHistoricalSamples/);
  assert.match(dataRoute,/generatedFromWeek/);
  assert.match(engine,/complete, point-in-time historical team-game vectors/i);
  assert.match(engine,/H\+ Path Width is intentionally conditional/);
  assert.match(engine,/H\+ Fragility is a local stress test/);
  assert.match(engine,/buildSimulationRows/);
  assert.match(engine,/assignClusters/);
  assert.match(engine,/upsetPath/);
  assert.match(engine,/evaluateWinConditionScenario/);
  assert.match(page,/HOW THIS GAME IS WON/);
  assert.match(page,/EXPLORE WIN CONDITIONS/);
  assert.match(page,/MATCHUP ANALYSIS/);
  assert.match(page,/WIN CONDITIONS/);
  assert.match(page,/EASIEST REALISTIC UPSET PATH/);
  assert.match(page,/INTERACTIVE SCENARIO LAB/);
  assert.match(page,/GAME SCRIPT MAP/);
  assert.match(page,/RESET TO H\+ PROJECTION/);
  assert.match(styles,/H\+ Win Conditions/);
  assert.match(styles,/\.score-win-conditions/);
  assert.match(styles,/\.wc-script-map/);
  assert.match(styles,/@media \(max-width:430px\)[\s\S]*\.wc-summary/);
});
