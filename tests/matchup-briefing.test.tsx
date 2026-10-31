import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MatchupBriefing} from '../app/components/MatchupBriefing';
import {teams} from '../app/modelData';
import {projectMatchupAtSite,type MatchupEngineTeam} from '../lib/matchupEngine';
import type {MatchupIntelligenceBoard,MatchupAdvantageCard} from '../lib/footballIntelligence';
const first=teams.find(t=>t.name==='Alabama')!,second=teams.find(t=>t.name==='Georgia')!;
const input=(team:typeof first):MatchupEngineTeam=>({team:team.name,offense:[1.04,1.05,1.03,1,1],defense:[.96,.97,.95,1,1]});
const a=input(first),b=input(second),p=projectMatchupAtSite(a,b,'neutral');
function markup(board:MatchupIntelligenceBoard|null){return renderToStaticMarkup(<MatchupBriefing first={first} second={second} board={board} analysis={p.edgeAnalysis} home={p.homeStats} away={p.awayStats} onField={()=>{}} onEvidence={()=>{}}/>);}
test('missing unit evidence does not manufacture a favored offense or direction',()=>{
 const html=markup(null);
 assert.match(html,/Not enough evidence/);assert.match(html,/Detailed unit evidence is unavailable/);
 assert.doesNotMatch(html,/undefined|NaN|Make the passing game the first option/);
});
test('unit reads distinguish the attacking offense from the defending team',()=>{
 const card=(offenseTeam:string,defenseTeam:string,edgeSide:'OFFENSE'|'DEFENSE'):MatchupAdvantageCard=>({id:'run',label:'RUN GAME',offenseTeam,defenseTeam,edgeSide,edgeTeam:edgeSide==='OFFENSE'?offenseTeam:defenseTeam,score:edgeSide==='OFFENSE'?70:30,magnitude:'MODERATE EDGE',confidence:'SOLID',impact:'Measured matchup read.',drivers:[]});
 const board={homeCards:[card(first.name,second.name,'DEFENSE')],awayCards:[card(second.name,first.name,'OFFENSE')],uncertainties:[]} as unknown as MatchupIntelligenceBoard;
 const html=markup(board);assert.match(html,/Georgia defense/);assert.match(html,/Georgia offense/);assert.doesNotMatch(html,/Alabama defense<\/b>/);
});
test('home choice benefits the selected side and swapping preserves physical home team',()=>{
 const home=projectMatchupAtSite(a,b,'home'),away=projectMatchupAtSite(a,b,'away'),swap=projectMatchupAtSite(b,a,'home');
 assert.ok(home.margin>p.margin);assert.ok(away.margin<p.margin);
 assert.ok(Math.abs(away.homeScore-swap.awayScore)<1e-8);assert.ok(Math.abs(away.awayScore-swap.homeScore)<1e-8);
 assert.ok(Math.abs(away.homeWinProbability-(1-swap.homeWinProbability))<1e-8);
});
