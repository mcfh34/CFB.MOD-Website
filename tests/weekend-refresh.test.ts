import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedResultsSnapshots,selectReviewedResults} from '../lib/reviewedResults';
import {applyPlayFeedSackAdjustments} from '../lib/playByPlay';
import {buildProfiles,normalizeStats,type NormalizedGame} from '../lib/dataPipeline';
test('Week 8 recovery validates every final and box score and advances percentage profiles',()=>{
 const snapshot=reviewedResultsSnapshots.find(s=>s.week===8)!;
 assert.equal(snapshot.games.length,56);
 const stored:NormalizedGame[]=snapshot.games.map(g=>({...g,completed:false,homePoints:null,awayPoints:null,seasonType:'regular',neutralSite:false,conferenceGame:true,venue:null,homeConference:null,awayConference:null}));
 const finals=selectReviewedResults(stored,Date.parse('2026-10-26T12:00:00Z'),snapshot);
 const stats=applyPlayFeedSackAdjustments(normalizeStats(snapshot.games,finals,2026),snapshot.games.flatMap(g=>g.sackPlays),true);
 assert.equal(finals.length,56);assert.equal(stats.length,112);
 assert.equal(stats.reduce((n,s)=>n+s.sacksAllowed,0),250);
 for(const row of stats){assert.equal(row.totalYards,row.passYards+row.rushYards);assert.equal(row.sackAdjustmentVersion,1);}
 const eligible=new Set(finals.flatMap(g=>[g.homeTeam,g.awayTeam]));
 const profiles=buildProfiles(finals,stats,2026,eligible);
 assert.equal(Math.max(...profiles.map(p=>p.week)),8);
 assert.ok(profiles.every(p=>[...p.off,...p.def,...p.oi,...p.di].every(Number.isFinite)));
 assert.throws(()=>selectReviewedResults([{...stored[0],awayTeam:'Wrong opponent'}],Date.parse('2026-10-26T12:00:00Z'),snapshot),/identity mismatch/);
});
test('Week 9 midweek recovery includes only completed games and verified box scores',()=>{
 const snapshot=reviewedResultsSnapshots.find(s=>s.week===9)!;
 assert.equal(snapshot.games.length,4);
 const stored:NormalizedGame[]=snapshot.games.map(g=>({...g,completed:false,homePoints:null,awayPoints:null,seasonType:'regular',neutralSite:false,conferenceGame:true,venue:null,homeConference:null,awayConference:null}));
 const finals=selectReviewedResults(stored,Date.parse('2026-10-29T18:00:00Z'),snapshot);
 const stats=applyPlayFeedSackAdjustments(normalizeStats(snapshot.games,finals,2026),snapshot.games.flatMap(g=>g.sackPlays),true);
 assert.equal(finals.length,4);assert.equal(stats.length,8);
 assert.equal(stats.reduce((n,s)=>n+s.sacksAllowed,0),18);
 for(const row of stats)assert.equal(row.totalYards,row.passYards+row.rushYards);
 const profiles=buildProfiles(finals,stats,2026,new Set(finals.flatMap(g=>[g.homeTeam,g.awayTeam])));
 assert.equal(Math.max(...profiles.map(p=>p.week)),9);
 assert.ok(profiles.every(p=>[...p.off,...p.def,...p.oi,...p.di].every(Number.isFinite)));
});
