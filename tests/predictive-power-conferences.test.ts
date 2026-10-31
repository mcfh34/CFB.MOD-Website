import test from "node:test";
import assert from "node:assert/strict";
import { projectMatchupCore,projectMatchupAtSite,matchupScoreCard } from "../lib/matchupEngine";
import { buildRoundRobinStandings,buildRoundRobinStandingsAsync,type RoundRobinProfile } from "../lib/roundRobin";
import { buildConferenceComparison,type ConferenceGame } from "../lib/conferenceComparison";
import { buildConferenceAdjustments } from "../lib/conferenceAdjustment";
import { emptyAdvancedMetricValues,type AdvancedProfile } from "../lib/advancedMetrics";
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const first={team:"Alpha",offense:[1.12,1.2,1.08,1.06,.98],defense:[.92,.95,.9,1,1],outcomeRating:1675};
const second={team:"Beta",offense:[1.04,1.08,1.01,1,1],defense:[.98,1,.98,1,1],outcomeRating:1580};
test("neutral results are invariant to listed-team order and equal profiles are a tossup",()=>{
 const ab=projectMatchupCore(first,second,true),ba=projectMatchupCore(second,first,true);
 close(ab.margin,-ba.margin);close(ab.homeScore,ba.awayScore);close(ab.homeWinProbability,1-ba.homeWinProbability);
 const same=projectMatchupCore(first,{...first,team:"Clone"},true);close(same.margin,0);close(same.homeWinProbability,.5);
});
test("both home venues move the correct score and away-home receipts preserve selected-team order",()=>{
 const n=projectMatchupAtSite(first,second,"neutral"),h=projectMatchupAtSite(first,second,"home"),a=projectMatchupAtSite(first,second,"away");
 assert.ok(h.margin>n.margin&&a.margin<n.margin);close(h.modelTotal,n.modelTotal);close(a.modelTotal,n.modelTotal);
 const actual=projectMatchupCore(second,first,false);close(a.homeScore,actual.awayScore);close(a.awayScore,actual.homeScore);close(a.homeWinProbability,1-actual.homeWinProbability);
 close(a.reconciliation.components.reduce((n,c)=>n+c.points,0),a.margin);
 close(a.homeStats.scoreReceipt.reconciliation!.margin,a.margin);
 const swapped=projectMatchupAtSite(second,first,"home");assert.deepEqual(matchupScoreCard(a),{homeScore:matchupScoreCard(swapped).awayScore,awayScore:matchupScoreCard(swapped).homeScore});
});
test("All137 uses every canonical pairing including advanced inputs; resume is not added twice",async()=>{
 const advanced:AdvancedProfile={source:"cfbd-advanced",rushingDefinition:"line-and-open-field-proxy",passingDefinition:"box-score-and-cfbd-proxy",
 baseline:{...emptyAdvancedMetricValues(),successRate:.42,passingSuccessRate:.42,rushingSuccessRate:.42,lineYards:2.8},
 offense:{raw:{...emptyAdvancedMetricValues(),successRate:.48},index:{...emptyAdvancedMetricValues(),successRate:1.15,passingSuccessRate:1.1,rushingSuccessRate:1.08,lineYards:1.1}},
 defense:{raw:emptyAdvancedMetricValues(),index:emptyAdvancedMetricValues()},coverage:{advancedGames:4,completionGames:4}};
 const p:RoundRobinProfile[]=[{...first,id:"a",season:2026,week:4,rating:first.outcomeRating,resumeScore:1,advanced},
  {...second,id:"b",season:2026,week:4,rating:second.outcomeRating,resumeScore:0}];
 const canonical=projectMatchupCore({...first,advanced},second,true);
 const rows=buildRoundRobinStandings(p),a=rows.find(r=>r.profile.id==="a")!;
 close(a.averageMargin,canonical.margin);close(a.expectedWins,canonical.homeWinProbability);
 assert.deepEqual(await buildRoundRobinStandingsAsync(p),rows);
 assert.deepEqual(buildRoundRobinStandings(p.map(r=>({...r,resumeScore:.5}))).map(r=>r.averageMargin),rows.map(r=>r.averageMargin));
 assert.ok(rows.every((r,i)=>!i||rows[i-1].expectedWins>=r.expectedWins));
});
const teams=[{team:"A",conference:"ACC"},{team:"S",conference:"SEC"},{team:"B",conference:"Big Ten"},{team:"U",conference:"Unlinked"}];
const game=(id:string,h:string,a:string,hp:number,ap:number,other:Partial<ConferenceGame>={}):ConferenceGame=>({gameId:id,week:1,seasonType:"regular",completed:true,neutralSite:true,homeTeam:h,awayTeam:a,homePoints:hp,awayPoints:ap,...other});
test("weekly team adjustments use only dated FBS cross-conference residuals and preserve snapshot cutoffs",()=>{
 const evidence=game("r","S","A",30,20,{generatedFromWeek:0,predictedHomeScore:25,predictedAwayScore:25});
 const rows=[evidence,game("future","S","B",70,0,{week:3,generatedFromWeek:2,predictedHomeScore:21,predictedAwayScore:21}),
  game("fcs","S","FCS",99,0,{generatedFromWeek:0,predictedHomeScore:40,predictedAwayScore:0}),
  game("undated","S","B",99,0),game("late","S","B",99,0,{generatedFromWeek:1,predictedHomeScore:20,predictedAwayScore:20})];
 const baseline=buildConferenceAdjustments(teams,[evidence],1),current=buildConferenceAdjustments(teams,rows,1);
 assert.deepEqual(current,baseline);assert.equal(current.get("S")!.games,1);assert.equal(current.get("U")!.points,0);
 close(current.get("S")!.points,1);close(current.get("A")!.points,-1);
 assert.ok(buildConferenceAdjustments(teams,rows,3).get("S")!.points>current.get("S")!.points);
 assert.ok([...buildConferenceAdjustments(teams,rows,0).values()].every(r=>r.points===0&&r.games===0));
 const corrected={...evidence,predictedHomeScore:28,predictedAwayScore:25,predictionConferenceMargin:3};
 assert.deepEqual(buildConferenceAdjustments(teams,[corrected],1),baseline);
});
test("conference corrections cap sparse blowouts, share member offsets and do not pool independents",()=>{
 const field=[...teams,{team:"S2",conference:"SEC"},{team:"I1",conference:"FBS Independents"},{team:"I2",conference:"FBS Independents"}];
 const games=Array.from({length:40},(_,i)=>game(String(i),"S","A",99,0,{generatedFromWeek:0,predictedHomeScore:20,predictedAwayScore:20}));
 const adjustment=buildConferenceAdjustments(field,games,1);
 close(adjustment.get("S")!.points,6);close(adjustment.get("A")!.points,-6);assert.deepEqual(adjustment.get("S"),adjustment.get("S2"));
 const independent=buildConferenceAdjustments(field,[game("i","I1","A",30,20,{generatedFromWeek:0,predictedHomeScore:25,predictedAwayScore:25})],1);
 assert.ok(independent.get("I1")!.points>0);assert.equal(independent.get("I2")!.points,0);
});
test("weekly conference points enter the canonical margin, cancel within a conference and preserve site orientation",()=>{
 const baseline=projectMatchupCore(first,second,true),home={...first,conferenceAdjustment:2},away={...second,conferenceAdjustment:-1};
 const adjusted=projectMatchupCore(home,away,true);close(adjusted.margin-baseline.margin,3);close(adjusted.modelTotal,baseline.modelTotal);
 close(adjusted.reconciliation.components.find(r=>r.id==="conferenceStrength")!.points,3);
 close(adjusted.reconciliation.components.reduce((sum,r)=>sum+r.points,0),adjusted.margin);
 close(projectMatchupCore({...first,conferenceAdjustment:2},{...second,conferenceAdjustment:2},true).margin,baseline.margin);
 const reverse=projectMatchupAtSite(home,away,"away"),actual=projectMatchupCore(away,home,false);close(reverse.margin,-actual.margin);close(reverse.conferenceMargin,3);
 const p:RoundRobinProfile[]=[{...home,id:"a",season:2026,week:4,rating:home.outcomeRating},{...away,id:"b",season:2026,week:4,rating:away.outcomeRating}];
 close(buildRoundRobinStandings(p).find(r=>r.profile.id==="a")!.averageMargin,adjusted.margin);
});
test("conference evidence excludes future, same-conference, incomplete, duplicate and FCS links",()=>{
 const report=buildConferenceComparison(teams,[game("1","S","A",28,21),game("1","S","A",28,21),game("2","S","FCS",50,0),game("3","S","A",0,10,{week:5}),game("4","S","A",0,10,{completed:false}),game("5","A","A",20,10),game("6","A","B",10,20,{seasonType:"postseason"})],1);
 assert.equal(report.games.length,1);const s=report.rows.find(r=>r.conference==="SEC")!;assert.equal(s.wins,1);assert.equal(s.fcsWins,1);assert.equal(s.averageMargin,7);
 assert.equal(report.rows.find(r=>r.conference==="Unlinked")!.rating,null);
 assert.equal(buildConferenceComparison(teams,[game("6","A","B",10,20,{seasonType:"postseason"})],1,true).games.length,1);
});
test("conference network adjusts indirect opponents, shrinks small samples, caps blowouts and preserves groups",()=>{
 const r=buildConferenceComparison(teams,[game("1","S","A",35,21),game("2","A","B",28,21)],1);
 const sec=r.rows.find(r=>r.conference==="SEC")!,acc=r.rows.find(r=>r.conference==="ACC")!,big=r.rows.find(r=>r.conference==="Big Ten")!;
 assert.ok(sec.rating!>acc.rating!&&acc.rating!>big.rating!);assert.equal(sec.component,big.component);assert.ok(sec.rating!<14);
 close(r.rows.reduce((n,row)=>n+(row.rating??0),0),0);
 const capped=buildConferenceComparison(teams,[game("1","S","A",99,0)],1);assert.equal(capped.games[0].ratingMargin,28);assert.equal(capped.rows.find(x=>x.conference==="SEC")!.averageMargin,99);
 const venue=buildConferenceComparison(teams,[game("1","S","A",28,21,{neutralSite:false})],1);close(venue.games[0].neutralMargin,7-venue.venueAdjustment);
});

test("expected versus actual conference margins share a denominator, orient away teams, and reject later snapshots",()=>{
 const r=buildConferenceComparison(teams,[
  game("1","S","A",35,21,{week:2,generatedFromWeek:1,predictedHomeScore:28,predictedAwayScore:24}),
  game("2","B","S",14,28,{week:3,generatedFromWeek:2,predictedHomeScore:20,predictedAwayScore:24}),
  game("3","S","A",70,0,{week:4,generatedFromWeek:4,predictedHomeScore:40,predictedAwayScore:20}),
  game("4","S","A",50,0,{week:4}),
  game("5","S","FCS",99,0,{week:2,generatedFromWeek:1,predictedHomeScore:35,predictedAwayScore:0}),
 ],4);
 const sec=r.rows.find(x=>x.conference==="SEC")!;
 assert.equal(sec.games,4);assert.equal(sec.predictionGames,2);
 close(sec.averageExpectedMargin!,4);close(sec.averageActualMargin!,14);close(sec.averageMarginDelta!,10);
 assert.equal(r.games.find(x=>x.gameId==="3")!.expectedHomeMargin,null);
 assert.equal(r.games.find(x=>x.gameId==="4")!.homeMarginDelta,null);
 close(r.games.find(x=>x.gameId==="2")!.homeMarginDelta!,-10);
 const sparse=buildConferenceComparison(teams,[game("0","S","A",30,10)],1).rows.find(x=>x.conference==="SEC")!;
 assert.equal(sparse.averageExpectedMargin,null);assert.equal(sparse.averageActualMargin,null);assert.equal(sparse.averageMarginDelta,null);
});
