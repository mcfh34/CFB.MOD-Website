import {readFile,writeFile} from 'node:fs/promises';
import {buildRoundRobinStandings} from '../lib/roundRobin';
import {buildBcsRankings} from '../lib/rankings';
import {scoringEvidenceFields} from '../lib/matchupEvidenceFields';
import {configureViabilityCalibration} from '../lib/offensiveViability';
import {frozenViabilityCalibration} from '../lib/frozenViabilityCalibration';
import {legacyMatchupPolicy,currentMatchupPolicy} from '../lib/matchupPolicy';
const snapshot=JSON.parse(await readFile('/workspace/scratch/fd5945e15a5d/live-profiles.json','utf8'));
const schedule=JSON.parse(await readFile('/workspace/scratch/fd5945e15a5d/model-audit-cache/2026--1.json','utf8')).rows;
const games=schedule.filter((r:any)=>r.completed&&r.seasonType!=='postseason'&&r.week<=snapshot.effectiveWeek&&r.homePoints!=null&&r.awayPoints!=null).map((r:any)=>({...r,homePlays:r.homeActualPassAttempts!=null&&r.homeActualRushAttempts!=null?r.homeActualPassAttempts+r.homeActualRushAttempts:undefined,awayPlays:r.awayActualPassAttempts!=null&&r.awayActualRushAttempts!=null?r.awayActualPassAttempts+r.awayActualRushAttempts:undefined}));
const ranking=buildBcsRankings(games,snapshot.rows.map((r:any)=>({...r,advanced:r.advancedProfile})),{usePreseasonElo:false}),byTeam=new Map(ranking.map(r=>[r.team,r]));
const original=snapshot.rows.map((r:any)=>({id:r.team,team:r.team,season:2026,week:7,conference:r.conference,conferenceAdjustment:r.conferenceAdjustment,rating:r.crossEraRating??r.eloRating,offense:[r.offYppIndex,r.offYpaIndex,r.offYpcIndex,r.offPattIndex,r.offRattIndex],defense:[r.defYppIndex,r.defYpaIndex,r.defYpcIndex,r.defPattIndex,r.defRattIndex],evidence:{gamesPlayed:r.gamesPlayed,scheduleStrength:r.scheduleStrength??.5,bestOpponentStrength:r.bestOpponentStrength??.5,qualityWinStrength:r.qualityWinStrength??.5,reliability:r.matchupReliability??1},advanced:r.advancedProfile,roster:r.roster}));
const revised=original.map((p:any)=>({...p,evidence:{...p.evidence,...scoringEvidenceFields(byTeam.get(p.team))}}));
const reports=[];
for(const adjustment of [false,true]){
 const oldProfiles=original.map((p:any)=>({...p,conferenceAdjustment:adjustment?p.conferenceAdjustment:0})),newProfiles=revised.map((p:any)=>({...p,conferenceAdjustment:adjustment?p.conferenceAdjustment:0}));
 configureViabilityCalibration(snapshot.viabilityCalibration);const before=buildRoundRobinStandings(oldProfiles,legacyMatchupPolicy);
 configureViabilityCalibration(frozenViabilityCalibration);const after=buildRoundRobinStandings(newProfiles,currentMatchupPolicy);
 reports.push({conferenceAdjustment:adjustment,teams:after.map(r=>{const old=before.find(o=>o.profile.team===r.profile.team)!;return {team:r.profile.team,oldRank:old.rank,newRank:r.rank,oldRating:old.averageMargin,newRating:r.averageMargin,delta:r.averageMargin-old.averageMargin,evidence:scoringEvidenceFields(r.profile.evidence)};})});
}
await writeFile('docs/evidence-rating-changes-2026-10-06.json',JSON.stringify({season:2026,requestedWeek:7,effectiveWeek:snapshot.effectiveWeek,method:'Same Week 5 production snapshot; full FBS neutral round robin; old public missing-evidence path vs corrected evidence, selected policy, and frozen training calibration.',reports},null,2)+'\n');
for(const report of reports)console.log('Adjustment',report.conferenceAdjustment,report.teams.filter(r=>['Utah','BYU','Georgia','Ohio State','Texas Tech'].includes(r.team)));
