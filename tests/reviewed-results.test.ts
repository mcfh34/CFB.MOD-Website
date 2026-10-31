import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedResultsSnapshot,selectReviewedResults} from '../lib/reviewedResults';
import {normalizeStats,type NormalizedGame} from '../lib/dataPipeline';
import {applyPlayFeedSackAdjustments} from '../lib/playByPlay';
const games:NormalizedGame[]=reviewedResultsSnapshot.games.map(game=>({...game,completed:false,neutralSite:false,conferenceGame:true,seasonType:'regular',venue:null,homeConference:null,awayConference:null,homePoints:null,awayPoints:null}));
const now=Date.parse('2026-10-20T18:00:00Z');
test('reviewed recovery validates 62 identities and supplies two finite sack-adjusted boxes per final',()=>{
 const results=selectReviewedResults(games,now);assert.equal(results.length,62);
 const stats=applyPlayFeedSackAdjustments(normalizeStats(reviewedResultsSnapshot.games,results,2026),reviewedResultsSnapshot.games.flatMap(game=>game.sackPlays),true);
 assert.equal(stats.length,124);
 for(const row of stats){assert.equal(row.sackAdjustmentVersion,1);assert.equal(row.totalYards,row.passYards+row.rushYards);assert.ok(Number.isFinite(row.yardsPerPlay));}
 const del=stats.find(row=>row.gameId==='401871067'&&row.team==='Delaware')!;
 assert.ok(del.sacksAllowed>0);assert.ok(del.sackYardsLost>0);assert.equal(del.passYards,321-del.sackYardsLost);assert.equal(del.rushYards,70+del.sackYardsLost);
});
test('reviewed recovery refuses identity mismatches, future games, and conflicting existing finals',()=>{
 assert.throws(()=>selectReviewedResults([{...games[0],homeTeam:'Wrong team'}],now),/identity mismatch/);
 assert.throws(()=>selectReviewedResults([{...games[0],season:2025}],now),/identity mismatch/);
 assert.throws(()=>selectReviewedResults([games[0]],0),/identity mismatch/);
 assert.throws(()=>selectReviewedResults([{...games[0],completed:true,homePoints:999,awayPoints:0}],now),/conflicts/);
 assert.equal(selectReviewedResults([],now).length,0);
});
