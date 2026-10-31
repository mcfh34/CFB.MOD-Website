import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDefensiveKeys,defensivePriorities,summarizeDefensiveKeys,withMiddlePassing,type DefensiveKey} from '../lib/defensiveKeys';
import {advancedMetricKeys,type AdvancedProfile,type AdvancedSideProjection} from '../lib/advancedMetrics';
import {passLocations} from '../lib/passing';
import type {PassingDirectionalProfile} from '../lib/passingMatchup';
function profile(games=6):AdvancedProfile{
 const values=Object.fromEntries(advancedMetricKeys.map(key=>[key,1]));
 return {baseline:{...values,thirdDownSuccessRate:.4},offense:{raw:{...values},index:{...values}},defense:{raw:{...values},index:{...values}},coverage:{advancedGames:games,completionGames:games}} as AdvancedProfile;
}
const projection=(third=.3)=>({run:{rushingSuccessRate:.7,lineYards:.7,stuffRate:1.3,powerSuccess:.7,rushingExplosiveness:.7},pass:{passingExplosiveness:.7},overall:{thirdDownSuccessRate:third,redZoneEfficiency:.7,frontSevenHavoc:1.3}} as AdvancedSideProjection);
const analyze=(d=profile(),o=profile(),p=projection())=>analyzeDefensiveKeys({team:'Defense',opponent:'Offense',defenseProfile:d,offenseProfile:o,opponentProjection:p});
const keys=(scores:number[])=>defensivePriorities.map((k,i)=>({...k,priority:i+1,score:scores[i],status:scores[i]>=60?'Favorable':scores[i]<=40?'Concern':'Mixed',evidence:'Matchup projection',metrics:[],read:'',limitation:'',complete:true})) as DefensiveKey[];
const pass=(off:number,def:number,n=3):PassingDirectionalProfile=>({schema:2,coverage:10,offense:Object.fromEntries(passLocations.map(l=>[l,{relativePercent:off,comparedOwnAttempts:n,attempts:n,available:n,index:1,share:1/6}])),defense:Object.fromEntries(passLocations.map(l=>[l,{relativePercent:def,comparedOwnAttempts:n,attempts:n,available:n,index:1,share:1/6}]))} as PassingDirectionalProfile);
test('missing evidence stays untested and cannot manufacture a favorable defense',()=>{
 const a=analyzeDefensiveKeys({team:'D',opponent:'O'});
 assert.equal(a.score,null);assert.equal(a.tested,0);assert.equal(a.coverage,0);assert.equal(a.outlook,'Insufficient evidence');assert.ok(a.keys.every(k=>k.status==='Untested'));
 assert.ok(analyze(profile(2),profile(2)).keys.every(k=>k.status==='Untested'));
});
test('uses the opponent projection and inverses bad defensive outcomes',()=>{
 const a=analyze();
 assert.equal(a.keys[1].status,'Favorable');assert.equal(a.keys[3].status,'Favorable');assert.equal(a.keys[5].status,'Favorable');
 const bad=projection(.5);bad.run.lineYards=1.3;bad.run.rushingSuccessRate=1.3;bad.run.stuffRate=.7;
 assert.equal(analyze(profile(),profile(),bad).keys[1].status,'Concern');
 assert.equal(a.keys[4].target,'Target 70% stops · met in projection');
 assert.match(a.keys[4].metrics[0],/70.0%/);
 assert.equal(a.keys[0].status,'Untested');assert.notEqual(a.outlook,'Strong defensive outlook');
});
test('high-priority failures cannot be averaged away by lower-priority strengths',()=>{
 assert.equal(summarizeDefensiveKeys('D','O',keys([30,100,100,100,100,100,100,100])).outlook,'Scoring risk elevated');
 assert.equal(summarizeDefensiveKeys('D','O',keys([100,100,30,30,100,100,100,100])).outlook,'Scoring risk elevated');
 const a=summarizeDefensiveKeys('D','O',keys([80,80,80,80,80,80,80,80]));assert.equal(a.outlook,'Strong defensive outlook');
 a.keys[0].complete=false;assert.notEqual(summarizeDefensiveKeys('D','O',a.keys).outlook,'Strong defensive outlook');
});
test('middle passing adds offense and defense relative percentages and requires three attempts',()=>{
 const base=analyze();
 assert.equal(withMiddlePassing(base,pass(10,0,2),pass(0,-5)),base);
 const updated=withMiddlePassing(base,pass(10,0),pass(0,-5));
 assert.equal(updated.keys[0].score,40); // +10 offense + (-5) defense = +5 net, not +15
 assert.equal(updated.keys[0].status,'Concern');assert.match(updated.keys[0].metrics[0],/\+5.0%/);
 assert.equal(updated.keys[0].complete,false);assert.equal(updated.keys[1],base.keys[1]);
 assert.notEqual(updated.outlook,'Strong defensive outlook');
});
test('positive turnover margin belongs to the defending team, and +3 remains a target',()=>{
 const d=profile(),o=profile();
 d.turnoverProfile={games:6,lostPerGame:.5,forcedPerGame:2} as AdvancedProfile['turnoverProfile'];
 o.turnoverProfile={games:6,lostPerGame:2,forcedPerGame:.5} as AdvancedProfile['turnoverProfile'];
 const a=analyze(d,o),b=analyze(o,d);
 assert.ok(a.keys[2].score!>50);assert.ok(b.keys[2].score!<50);assert.match(a.keys[2].target!,/below target/);
});
