import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatchupEvidence,validateMatchupProfile} from '../lib/matchupModel';
import {buildPregameElo,buildPregameMatchupEvidence,type NormalizedGame} from '../lib/dataPipeline';
import {buildBcsRankings} from '../lib/rankings';
import {scoringEvidenceFields} from '../lib/matchupEvidenceFields';
import {evidencePrecision,legacyMatchupPolicy,currentMatchupPolicy} from '../lib/matchupPolicy';
const g=(id:string,week:number,opponent:string,points:number,opponentPoints:number,homeConference='A',awayConference='B'):NormalizedGame=>({id,season:2026,week,seasonType:'regular',startDate:`2026-09-${String(week*5).padStart(2,'0')}`,completed:true,neutralSite:true,conferenceGame:false,venue:null,homeTeam:'Team A',awayTeam:opponent,homeConference,awayConference,homePoints:points,awayPoints:opponentPoints,homePlays:70,awayPlays:65});
test('zero FBS evidence survives the API-to-browser projection payload',()=>{
 const e=buildMatchupEvidence([.05],[.05],1,{fbsMargins:[],fcsResults:[{actualMargin:60,expectedMargin:27}],fbsPlays:0,scheduleConnectivity:0});
 assert.equal(e.fbsGamesPlayed,0);assert.equal(e.fcsGamesPlayed,1);assert.equal(e.fcsResultAdjustment,1.98);assert.deepEqual(scoringEvidenceFields(e),{fbsScoringMargin:0,fcsResultAdjustment:1.98,fcsGamesPlayed:1,fbsGamesPlayed:0,fbsPlays:0,scheduleConnectivity:0});
});
test('pregame evidence counts only previous completed FBS plays and separates FCS margins',()=>{
 const games=[g('fcs',1,'FCS',63,7),g('fbs',2,'Team B',28,17),g('future',3,'Team C',70,0)],eligible=new Set(['Team A','Team B','Team C']);
 const elo=buildPregameElo(games,[],eligible,false),e=buildPregameMatchupEvidence(games,elo,eligible).get('future')!.get('Team A')!;
 assert.equal(e.fbsGamesPlayed,1);assert.equal(e.fcsGamesPlayed,1);assert.equal(e.fbsPlays,70);assert.equal(e.fbsScoringMargin,11);assert.equal(e.scheduleConnectivity,1);assert.ok(e.fcsResultAdjustment!<=2);
});
test('weekly ranking evidence distinguishes an FCS blowout from FBS scoring and preserves play counts',()=>{
 const profiles=['Team A','Team B'].map(team=>({team,conference:team==='Team A'?'A':'B',offYppIndex:1,offYpaIndex:1,offYpcIndex:1,defYppIndex:1,defYpaIndex:1,defYpcIndex:1}));
 const games=[g('fcs',1,'FCS',63,7),g('fbs',2,'Team B',28,17)].map(({id,...r})=>({...r,gameId:id,homePoints:r.homePoints!,awayPoints:r.awayPoints!}));
 const row=buildBcsRankings(games,profiles,{usePreseasonElo:false}).find(r=>r.team==='Team A')!;
 assert.equal(row.fbsScoringMargin,11);assert.equal(row.fbsGamesPlayed,1);assert.equal(row.fcsGamesPlayed,1);assert.equal(row.fbsPlays,70);assert.ok(row.fcsResultAdjustment!<=2);
});
test('current-season shrinkage responds to FBS sample size and network proof without changing result evidence',()=>{
 const small={gamesPlayed:4,fbsGamesPlayed:1,fbsPlays:60,scheduleConnectivity:0,scheduleStrength:.5,bestOpponentStrength:.5,qualityWinStrength:.5,reliability:.8};
 const large={...small,gamesPlayed:10,fbsGamesPlayed:10,fbsPlays:650,scheduleConnectivity:1};
 assert.ok(evidencePrecision(large)>evidencePrecision(small));
 const team={offense:[1.5,1.5,1.5,1,1],defense:[.6,.6,.6,1,1],evidence:small};
 const old=validateMatchupProfile(team,legacyMatchupPolicy),now=validateMatchupProfile(team,currentMatchupPolicy),mature=validateMatchupProfile({...team,evidence:large},currentMatchupPolicy);
 assert.ok(now.offense[0]<old.offense[0]);assert.ok(now.defense[0]>old.defense[0]);assert.ok(mature.offense[0]>now.offense[0]);assert.equal(now.evidence.reliability,.8);assert.equal(now.evidence.fbsPlays,60);
});
