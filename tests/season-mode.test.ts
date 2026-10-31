import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  advanceSeason,
  canAdvance,
  continueDynastySeason,
  createSeasonSave,
  currentUserGame,
  projectedPlayoffSeeds,
  rankingFor,
  recalculateSeason,
  simulateGame,
  simulateUserGame,
  starterFromRating,
} from "../lib/season/simulation";
import { upgradeSeasonSave } from "../lib/season/storage";
import type { ModelProfileRow, ModelScheduleRow, PlayerRatingRow, SeasonSave } from "../lib/season/types";

const conferences=["SEC","Big Ten","Big 12","ACC"];
const profiles:ModelProfileRow[]=Array.from({length:16},(_,index)=>({
  team:`Team ${index+1}`,
  teamId:index+1,
  abbreviation:`T${index+1}`,
  mascot:"Testers",
  conference:conferences[Math.floor(index/4)],
  color:"#123456",
  altColor:"#ffffff",
  eloRating:1700-index*20,
  offYppIndex:1.15-index*.01,
  defYppIndex:.85+index*.01,
}));

const schedule:ModelScheduleRow[]=[];
for(let week=1;week<=3;week+=1){
  for(let pair=0;pair<8;pair+=1){
    const homeIndex=(pair*2+week-1)%16;
    const awayIndex=(homeIndex+1)%16;
    schedule.push({gameId:`${week}-${pair}`,week,seasonType:"regular",homeTeam:profiles[homeIndex].team,awayTeam:profiles[awayIndex].team,
      conferenceGame:profiles[homeIndex].conference===profiles[awayIndex].conference,neutralSite:false,predictedHomeScore:31-homeIndex*.2,predictedAwayScore:21+awayIndex*.1,homeWinProbability:.7});
  }
}

function makeSave(){return createSeasonSave({season:2026,selectedTeam:"Team 1",profiles,schedule,rosters:{}});}

function completeUserGame(save:SeasonSave){
  const game=currentUserGame(save);
  if(!game)return;
  game.completed=true;game.userPlayed=true;game.homeScore=28;game.awayScore=17;
  recalculateSeason(save);
}

test("creates a versioned browser-season ledger from model teams and the real schedule",()=>{
  const save=makeSave();
  assert.equal(save.schemaVersion,5);
  assert.equal(save.difficulty,"easy");
  assert.equal(save.quarterLengthMinutes,15);
  assert.equal(save.dynastyStartSeason,2026);
  assert.deepEqual(save.seasonHistory,[]);
  assert.equal(save.phase,"regular");
  assert.equal(save.currentWeek,1);
  assert.equal(Object.keys(save.teams).length,16);
  assert.equal(save.games.length,schedule.length);
  assert.equal(save.teams["Team 1"].roster.offense.length,11);
  assert.deepEqual(save.teams["Team 1"].roster.offense.map((player)=>player.position),["QB","RB","WR","WR","WR","TE","LT","RT","LG","RG","C"]);
  assert.deepEqual(save.teams["Team 1"].roster.defense.map((player)=>player.position),["DE","DE","DT","DT","LB","LB","LB","CB","CB","FS","SS"]);
  assert.ok(rankingFor(save,"Team 1"));
});

test("loads every schedule week and renders Down by Down outside the Harper shell",async()=>{
  const [seasonMode,game,page]=await Promise.all([
    readFile(new URL("../app/components/SeasonMode.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/components/DownByDownGame.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(seasonMode,/view=schedule&season=\$\{targetSeason\}&week=0&compactSchedule=1/);
  assert.doesNotMatch(seasonMode,/view=schedule&season=\$\{targetSeason\}&week=16/);
  assert.match(seasonMode,/resolveTeamLogoAsset\(team\.name\) \?\? team\.logo/);
  assert.match(game,/resolveTeamLogoAsset\(team\.name\) \?\? team\.logo/);
  assert.match(game,/resolveTeamLogoAsset\(state\.homeTeam\.name\) \?\? state\.homeTeam\.logo/);
  assert.match(page,/if \(section === "game"\)[\s\S]*down-by-down-standalone[\s\S]*onExit=\{\(\) => navigateTo\("overview"\)\}/);
});

test("season saves use the same canonical primary logo as the Scores tab",()=>{
  const alabama:ModelProfileRow={...profiles[0],team:"Alabama",teamId:333,abbreviation:"ALA",mascot:"Crimson Tide",conference:"SEC",logo:"https://example.com/provider-logo.png"};
  const auburn:ModelProfileRow={...profiles[1],team:"Auburn",teamId:2,abbreviation:"AUB",mascot:"Tigers",conference:"SEC",logo:"https://example.com/other-provider-logo.png"};
  const save=createSeasonSave({season:2026,selectedTeam:"Alabama",profiles:[alabama,auburn],schedule:[{gameId:"iron-bowl",week:1,seasonType:"regular",homeTeam:"Alabama",awayTeam:"Auburn"}],rosters:{}});
  assert.equal(save.teams.Alabama.logo,"/team-logos/alabama.webp");
  assert.equal(save.teams.Auburn.logo,"/team-logos/auburn.webp");
});

test("model strength centers simulations while variance still produces occasional upsets",()=>{
  let favoriteWins=0;
  for(let index=0;index<120;index+=1){
    const save=makeSave();save.id=`variance-${index}`;
    const game={...save.games[0],id:`sample-${index}`,predictedHomeScore:34,predictedAwayScore:20,homeWinProbability:.82,homeTeam:"Team 1",awayTeam:"Team 16"};
    const result=simulateGame(game,save);
    if(Number(result.homeScore)>Number(result.awayScore))favoriteWins+=1;
  }
  assert.ok(favoriteWins>82,`favorites won only ${favoriteWins}/120`);
  assert.ok(favoriteWins<120,"variance never produced an upset");
});

test("advances through regular season, conference championships, the 12-team CFP, and a title game",()=>{
  const save=makeSave();
  for(let guard=0;guard<30&&save.phase!=="complete";guard+=1){
    completeUserGame(save);
    assert.equal(canAdvance(save),true);
    advanceSeason(save);
  }
  assert.equal(save.phase,"complete");
  assert.equal(save.playoffSeeds.length,12);
  assert.ok(save.games.some((game)=>game.stage==="conference"));
  assert.equal(save.games.filter((game)=>game.stage==="playoff-first").length,4);
  assert.equal(save.games.filter((game)=>game.stage==="playoff-quarterfinal").length,4);
  assert.equal(save.games.filter((game)=>game.stage==="playoff-semifinal").length,2);
  assert.equal(save.games.filter((game)=>game.stage==="championship").length,1);
  assert.ok(save.rankings.length>=12);
});

test("2014-2023 dynasties use the era-correct four-team playoff",()=>{
  const save=createSeasonSave({season:2014,selectedTeam:"Team 1",profiles,schedule,rosters:{}});
  for(let guard=0;guard<30&&save.phase!=="complete";guard+=1){completeUserGame(save);advanceSeason(save);}
  assert.equal(save.phase,"complete");
  assert.equal(save.playoffSeeds.length,4);
  assert.equal(save.games.filter((game)=>game.stage==="playoff-first").length,0);
  assert.equal(save.games.filter((game)=>game.stage==="playoff-quarterfinal").length,0);
  assert.equal(save.games.filter((game)=>game.stage==="playoff-semifinal").length,2);
  assert.equal(save.games.filter((game)=>game.stage==="championship").length,1);
});

test("non-playoff teams receive fictional sponsored bowls and can watch the CFP finish",()=>{
  const bowlConferences=["SEC","Big Ten","Big 12","ACC"];
  const bowlProfiles:ModelProfileRow[]=Array.from({length:32},(_,index)=>({
    team:`Bowl Team ${index+1}`,teamId:index+1,abbreviation:`B${index+1}`,mascot:"Testers",
    conference:bowlConferences[Math.floor(index/8)],color:"#173d2a",altColor:"#ffffff",
    eloRating:1900-index*25,offYppIndex:1.25-index*.01,defYppIndex:.75+index*.01,
  }));
  const bowlSchedule:ModelScheduleRow[]=[];
  for(let week=1;week<=6;week+=1){
    for(let index=0;index<16;index+=1){
      const home=bowlProfiles[index].team,away=bowlProfiles[16+((index+week)%16)].team;
      bowlSchedule.push({gameId:`bowl-test-${week}-${index}`,week,seasonType:"regular",homeTeam:home,awayTeam:away,conferenceGame:false,predictedHomeScore:31,predictedAwayScore:20,homeWinProbability:.76});
    }
  }
  const selectedTeam="Bowl Team 32";
  const save=createSeasonSave({season:2026,selectedTeam,profiles:bowlProfiles,schedule:bowlSchedule,rosters:{}});
  while(save.phase==="regular"){
    const game=currentUserGame(save);assert.ok(game);
    const userHome=game.homeTeam===selectedTeam,userWins=save.currentWeek<=4;
    game.completed=true;game.userPlayed=true;game.homeScore=userHome===userWins?27:17;game.awayScore=userHome===userWins?17:27;
    recalculateSeason(save);advanceSeason(save);
  }
  const conferenceGame=currentUserGame(save);
  if(conferenceGame){conferenceGame.completed=true;conferenceGame.userPlayed=true;conferenceGame.homeScore=14;conferenceGame.awayScore=31;recalculateSeason(save);}
  advanceSeason(save);
  assert.equal(save.playoffSeeds.includes(selectedTeam),false);
  assert.ok(save.games.some((game)=>game.stage==="bowl"&&/ Bowl$/.test(game.label)));
  for(let guard=0;guard<12&&save.phase!=="complete";guard+=1){simulateUserGame(save);advanceSeason(save);}
  assert.equal(save.phase,"complete");
  assert.ok(save.games.some((game)=>game.stage==="championship"&&game.completed));
});

test("simulates the user's game with local stats and builds a current 12-team projection",()=>{
  const save=makeSave();
  const game=currentUserGame(save);
  assert.ok(game);
  simulateUserGame(save);
  assert.equal(currentUserGame(save)?.completed,true);
  assert.ok(save.userTeamStats.plays>0);
  assert.ok(save.userTeamStats.pointsFor>=0);
  assert.ok(Object.values(save.userPlayerStats).some((stats)=>stats.passAttempts>0));
  const seeds=projectedPlayoffSeeds(save);
  assert.equal(seeds.length,12);
  assert.equal(new Set(seeds).size,12);
});

test("lineup selections retain authoritative player data while adopting the selected starter slot",()=>{
  const row:PlayerRatingRow={id:"qb-7",name:"Test Quarterback",jersey:7,position:"ATH",overall:91,projectedStarter:true};
  const starter=starterFromRating(row,"QB","Team 1",12);
  assert.deepEqual(starter,{id:"qb-7",name:"Test Quarterback",number:7,position:"QB",rating:91});
});

test("dynasties advance between year-specific ledgers while preserving local history",()=>{
  const previous=createSeasonSave({season:2014,selectedTeam:"Team 1",profiles,schedule,rosters:{}});
  previous.difficulty="impossible";
  previous.quarterLengthMinutes=0;
  previous.phase="complete";previous.records["Team 1"]={wins:11,losses:2,conferenceWins:7,conferenceLosses:1,pointsFor:400,pointsAgainst:250};
  const next=createSeasonSave({season:2015,selectedTeam:"Team 1",profiles,schedule,rosters:{}});
  const continued=continueDynastySeason(previous,next);
  assert.equal(continued.id,previous.id);
  assert.equal(continued.createdAt,previous.createdAt);
  assert.equal(continued.dynastyStartSeason,2014);
  assert.equal(continued.season,2015);
  assert.equal(continued.seasonHistory.length,1);
  assert.equal(continued.seasonHistory[0].season,2014);
  assert.equal(continued.seasonHistory[0].finalRecord.wins,11);
  assert.equal(continued.difficulty,"impossible");
  assert.equal(continued.quarterLengthMinutes,0);
});

test("version-one browser saves upgrade without losing their season",()=>{
  const save=makeSave();
  const legacy={...save,schemaVersion:1};
  delete (legacy as Partial<SeasonSave>).dynastyStartSeason;
  delete (legacy as Partial<SeasonSave>).seasonHistory;
  delete (legacy as Partial<SeasonSave>).difficulty;
  delete (legacy as Partial<SeasonSave>).quarterLengthMinutes;
  const upgraded=upgradeSeasonSave(legacy as unknown as SeasonSave);
  assert.equal(upgraded.schemaVersion,5);
  assert.equal(upgraded.dynastyStartSeason,2026);
  assert.deepEqual(upgraded.seasonHistory,[]);
  assert.equal(upgraded.difficulty,"easy");
  assert.equal(upgraded.quarterLengthMinutes,15);
});

test("simulated league games retain box scores and FCS opponents never enter the rankings",()=>{
  const extendedSchedule=[...schedule,{gameId:"fcs",week:1,seasonType:"regular",homeTeam:"Team 2",awayTeam:"FCS Guest",homeConference:"SEC",awayConference:"FCS"}];
  const save=createSeasonSave({season:2026,selectedTeam:"Team 1",profiles,schedule:extendedSchedule,rosters:{}});
  completeUserGame(save);advanceSeason(save);
  const completed=save.games.filter((game)=>game.week===1&&game.completed);
  assert.ok(completed.length>1);
  assert.ok(completed.every((game)=>game.teamStats?.[game.homeTeam]&&game.teamStats?.[game.awayTeam]));
  assert.equal(save.rankings.includes("FCS Guest"),false);
  save.rankings=[...Array.from({length:25},(_,index)=>`Rank ${index+1}`),"East Carolina"];
  assert.equal(rankingFor(save,"East Carolina"),null);
});

test("season hub exposes 2014-2026 dynasty years, tabbed rankings, and expandable box scores",async()=>{
  const [seasonMode,seasonCss]=await Promise.all([
    readFile(new URL("../app/components/SeasonMode.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/season-mode.css",import.meta.url),"utf8"),
  ]);
  assert.match(seasonMode,/FIRST_DYNASTY_SEASON=2014/);
  assert.match(seasonMode,/CONTINUE TO \$\{save\.season\+1\}/);
  assert.match(seasonMode,/function SeasonHubTabs/);
  assert.match(seasonMode,/value="rankings">TOP 25/);
  assert.match(seasonMode,/value="standings">STANDINGS/);
  assert.match(seasonMode,/value="news">NEWS/);
  assert.match(seasonMode,/function ConferenceStandings/);
  assert.match(seasonMode,/function NewsView/);
  assert.match(seasonMode,/projectedLine\(game\)/);
  assert.match(seasonMode,/>New dynasty</);
  assert.match(seasonMode,/>Load dynasty</);
  assert.doesNotMatch(seasonMode,/Scenarios/i);
  assert.match(seasonMode,/function LeagueSchedule/);
  assert.match(seasonMode,/function GameStatRows/);
  assert.match(seasonMode,/function ExhibitionSetup/);
  assert.match(seasonMode,/SET YOUR DEPTH CHART/);
  assert.match(seasonMode,/fetchPlayers\(exhibitionConfig\.homeSeason/);
  assert.match(seasonMode,/fetchPlayers\(exhibitionConfig\.awaySeason/);
  assert.match(seasonMode,/difficulty:exhibitionConfig\.difficulty/);
  assert.match(seasonMode,/quarterLengthMinutes:exhibitionConfig\.quarterLengthMinutes/);
  assert.match(seasonMode,/JOIN PRIVATE GAME/);
  assert.match(seasonMode,/\/join/);
  assert.match(seasonMode,/swapExhibitionTeams/);
  assert.match(seasonMode,/>Just OT</);
  assert.match(seasonMode,/function SeasonScreenHeader/);
  assert.match(seasonMode,/function DifficultyPicker/);
  assert.match(seasonMode,/function SeasonPlayerJersey/);
  assert.match(seasonMode,/POINTS \/ GAME/);
  assert.match(seasonMode,/NATIONALLY/);
  assert.match(seasonMode,/aria-labelledby="down-by-down-menu-title"/);
  assert.doesNotMatch(seasonMode,/SeasonScreenHeader eyebrow=\{`\$\{save\.season\}/);
  assert.match(seasonMode,/down-by-down-season-theme/);
  assert.match(seasonMode,/defaultTheme=\{theme\}/);
  assert.match(seasonCss,/\.season-hub-tabs-list/);
  assert.match(seasonCss,/\.season-box-score-stats/);
  assert.match(seasonCss,/dynasty-stadium\.webp/);
  assert.match(seasonCss,/\.season-mode-shell\.theme-dark/);
  assert.match(seasonCss,/\.season-mode-shell\.theme-light/);
  assert.match(seasonCss,/\.exhibition-setup-card/);
  assert.match(seasonCss,/\.season-screen-header/);
});

test("season game completion returns to the weekly view and play calls submit on tap",async()=>{
  const [seasonMode,game,gameCss]=await Promise.all([
    readFile(new URL("../app/components/SeasonMode.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/components/DownByDownGame.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/down-by-down.css",import.meta.url),"utf8"),
  ]);
  assert.match(seasonMode,/finishGame[\s\S]*setView\("season"\)/);
  assert.match(seasonMode,/SET STARTERS/);
  assert.match(seasonMode,/function LineupEditor/);
  assert.match(seasonMode,/starterFromRating[\s\S]*await persist\(next\)/);
  assert.match(game,/onClick=\{\(\) => selectPlay\(play\.id\)\}/);
  assert.match(game,/function stopTimingMeter/);
  assert.match(game,/onPointerDownCapture=\{\(event\) => \{/);
  assert.match(game,/if \(!selectedTimingPlay \|\| timingFeedback\) return/);
  assert.doesNotMatch(game,/LOCK CALL/);
  assert.match(game,/function CompactField/);
  assert.match(game,/title=\{displayEntry\?\.summary\}>\{marker\.label\}<\/span>/);
  assert.ok(game.indexOf('<GameTabs state={state} seat={session.seat} />')<game.indexOf('<div className="room-actions">'));
  assert.match(gameCss,/play-call-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(gameCss,/game-shell>\.box-score-console\{order:7\}/);
  assert.match(game,/down-by-down-theme-/);
  assert.match(game,/theme-toggle-button/);
  assert.match(gameCss,/\.theme-light\.game-shell \.game-tabs-list/);
});
