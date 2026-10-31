import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("Scores feature is isolated from the main page",async()=>{
  const [page,board,toolbar,filters,forecast]=await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/scores/ScoresBoard.tsx"),
    read("../app/components/scores/ScoresToolbar.tsx"),
    read("../app/components/scores/ScoresFilters.tsx"),
    read("../app/components/scores/ScoresForecastPanel.tsx"),
  ]);
  assert.match(page,/import \{ ScoresBoard \}/);
  assert.match(page,/import \{ ScoresToolbar \}/);
  assert.doesNotMatch(page,/function MobileGameCard/);
  assert.doesNotMatch(page,/function MobileScoreboard/);
  assert.match(board,/data-testid="scores-board"/);
  assert.doesNotMatch(toolbar,/Full season/i);
  assert.match(filters,/Additional score filters/);
  assert.match(forecast,/projected remaining schedule/);
});

test("Scores stylesheet has one compact card system and fixed breakpoints",async()=>{
  const styles=await read("../app/score-rushing.css");
  assert.match(styles,/score-window-board \{[\s\S]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,320px\),400px\)\)/);
  assert.match(styles,/@media\(max-width:720px\)[\s\S]*score-window-board \{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles,/grid-template-columns:46px minmax\(70px,1fr\) 34px 46px 50px/);
  assert.match(styles,/text-overflow:ellipsis/);
  assert.doesNotMatch(styles,/min-height:82px/);
  assert.doesNotMatch(styles,/font-size:28px/);
});

test("Scores cards keep Vegas and model decisions independent",async()=>{
  const board=await read("../app/components/scores/ScoresBoard.tsx");
  assert.match(board,/const closeFavorite=favoriteFromHomeSpread\(closingSpread,modelFavorite\)/);
  assert.match(board,/const favorite=kind==="close"\?closeFavorite:modelFavorite/);
  assert.match(board,/side===favorite/);
  assert.match(board,/className="score-card-ledger-head"/);
  assert.match(board,/SCORE<\/small><small[^>]*>MARKET<\/small><small>MODEL/);
  assert.match(board,/score-card-value score-card-close/);
  assert.doesNotMatch(board,/side===projectedWinner\?modelSpread:modelTotal/);
});

test("mirrored percentages and untested units stay inside an opened game",async()=>{
  const [page,board,route,styles]=await Promise.all([read("../app/page.tsx"),read("../app/components/scores/ScoresBoard.tsx"),read("../app/api/data/route.ts"),read("../app/score-rushing.css")]);
  assert.doesNotMatch(board,/score-card-tests|matchupTests/);
  assert.match(page,/<GameMatchupStats row=\{row\}\/>/);
  assert.match(page,/function GameUntestedUnits/);
  assert.match(page,/test\.credibleTests===0/);
  assert.match(page,/matchup-mirror-row/);
  assert.match(page,/Rush forced/);
  assert.match(page,/Pass allowed/);
  assert.match(styles,/\.matchup-mirror-value\.good b/);
  assert.match(styles,/\.matchup-mirror-value\.average b/);
  assert.match(styles,/\.matchup-mirror-value\.poor b/);
  assert.match(page,/variant="helmet"/);
  assert.match(page,/gameStatLeaderSide\(item\.away\.raw,item\.home\.raw,item\.lowerIsBetter\)/);
  assert.match(route,/matchupTests:gameMatchupTests/);
  assert.doesNotMatch(route,/const testProfiles=await db\.prepare/);
  assert.match(styles,/\.matchup-mirror-row\{grid-template-columns/);
});

test("play-by-play lives inside the opened game stats, not the score card",async()=>{
  const [page,board,panel,route,logic,styles]=await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/scores/ScoresBoard.tsx"),
    read("../app/components/scores/PlayByPlayDropdown.tsx"),
    read("../app/api/play-by-play/route.ts"),
    read("../lib/playByPlay.ts"),
    read("../app/score-rushing.css"),
  ]);
  assert.doesNotMatch(board,/PlayByPlayDropdown/);
  assert.match(page,/<GameMatchupStats row=\{row\}\/><GameUntestedUnits row=\{row\}\/><PlayByPlayDropdown/);
  assert.doesNotMatch(page,/<details className="game-detail-full-stats"/);
  assert.match(page,/<PlayByPlayDropdown key=\{row\.gameId\} row=\{row\}/);
  assert.match(panel,/PLAY BY PLAY/);
  assert.match(panel,/DRIVE SUMMARY/);
  assert.match(panel,/score-pbp-drive-list/);
  assert.match(panel,/resolveTeamLogoAsset\(drive\.offense\)/);
  assert.match(panel,/SACK YARD RECLASSIFICATION/);
  assert.match(panel,/NCAA RUSHING/);
  assert.match(panel,/function lossLabel/);
  assert.match(panel,/REMOVE \{lossLabel/);
  assert.match(panel,/CHARGE \{lossLabel/);
  assert.match(panel,/HARPER\+ NET PASS/);
  assert.match(panel,/SACK LOSS → PASSING/);
  assert.match(panel,/className="score-pbp-drive-tile"/);
  assert.match(panel,/className="score-pbp-inline-plays"/);
  assert.match(route,/cfbd\("\/plays"/);
  assert.match(route,/normalizePlayByPlay/);
  assert.match(route,/cache\.put\(cacheKey/);
  assert.match(logic,/officialRushingYards \+ sackYards/);
  assert.match(logic,/officialPassingYards - sackYards/);
  assert.match(styles,/\.score-pbp-play\.sack/);
  assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Scores controls match the compact week and filter pattern",async()=>{
  const [toolbar,filters]=await Promise.all([read("../app/components/scores/ScoresToolbar.tsx"),read("../app/components/scores/ScoresFilters.tsx")]);
  assert.match(toolbar,/className="scores-week-label">Week/);
  assert.match(toolbar,/aria-label="Week"/);
  assert.match(toolbar,/aria-label="Season"/);
  assert.match(toolbar,/viewBox="0 0 24 24"/);
  assert.doesNotMatch(toolbar,/>SEASON<\/label>/);
  assert.doesNotMatch(toolbar,/>Week \{index\}<\/option>/);
  assert.doesNotMatch(toolbar,/scores-game-count/);
  assert.match(filters,/role="dialog" aria-label="Additional score filters"/);
  assert.doesNotMatch(filters,/resultCount/);
  assert.match(filters,/APPLY FILTERS/);
});

test("Scores phone layout keeps one full card inside the iPhone width",async()=>{
  const styles=await read("../app/score-rushing.css");
  assert.match(styles,/@media\(max-width:720px\)[\s\S]*max-width:440px!important/);
  assert.match(styles,/scores-season-select \{ width:78px!important; min-width:78px!important/);
  assert.match(styles,/grid-template-columns:1fr!important/);
  assert.match(styles,/team-mark-sm \{[^}]*width:34px!important/);
  assert.match(styles,/score-card-team-copy \{[^}]*width:100%/);
});

test("layout fixtures cover clipping-prone score cards",async()=>{
  const fixtures=await read("../app/components/scores/layoutFixtures.ts");
  for(const token of ["desktop","narrow-desktop","tablet","phone","long-abbreviation","market-model-disagree","#25","#137","CHAR","100","-42.5"]){
    assert.match(fixtures,new RegExp(token.replace(/[+]/g,"\\+")));
  }
});

test("active season refreshes stale incomplete finals",async()=>{
  const [pipeline,worker]=await Promise.all([read("../lib/dataPipeline.ts"),read("../worker/index.ts")]);
  assert.match(pipeline,/shouldRefreshActiveSeason/);
  assert.match(pipeline,/completed=0[\s\S]*datetime\(start_date\)<=datetime\(\?,'-3 hours'\)/);
  assert.match(pipeline,/ACTIVE_SEASON_REFRESH_MAX_AGE_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(worker,/getActiveSeasonFreshness/);
  assert.match(worker,/freshness\.shouldRefresh[\s\S]*syncSeason\(env, freshness\.season, "scheduled"\)/);
});
