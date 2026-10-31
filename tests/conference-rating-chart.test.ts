import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conferenceRatingSeries,conferenceRatingLayout,conferenceRatingProfiles} from '../lib/conferenceRatingChart';
import {buildRoundRobinStandings,type RoundRobinStanding,type RoundRobinProfile} from '../lib/roundRobin';
import {buildConferenceRatingPdf} from '../lib/exportConferenceRatingPdf';
import {readFileSync,existsSync} from 'node:fs';
const row=(team:string,conference:string,rating:number)=>({profile:{team,conference},averageMargin:rating} as RoundRobinStanding);
test('conference ranks follow predictive margin and season membership with canonical logos',()=>{
 const series=conferenceRatingSeries([row('Texas','SEC',20),row('Alabama','SEC',25),row('Oregon','Big Ten',22),row('Bad','SEC',NaN)]);
 assert.deepEqual(series.find(s=>s.conference==='SEC')?.teams.map(t=>[t.team,t.rank,t.rating]),[['Alabama',1,25],['Texas',2,20]]);
 assert.equal(series.find(s=>s.conference==='Big Ten')?.teams[0].team,'Oregon');
 assert.equal(series.find(s=>s.conference==='SEC')?.teams[0].logo,'/team-logos/alabama.webp');
});
test('every logo remains centered on its true rating point even when values are close',()=>{
 const series=conferenceRatingSeries(['SEC','Big Ten','Big 12','ACC'].flatMap((c,i)=>[row(`A${i}`,c,10+i*.05),row(`B${i}`,c,-3+i*.05)]));
 const layout=conferenceRatingLayout(series);
 for(const p of layout.points){assert.equal(p.x,layout.x(p.rank));assert.equal(p.y,layout.y(p.rating));assert.equal(p.logoX,p.x);assert.equal(p.logoY,p.y);}
 assert.ok(layout.low< -3);assert.ok(layout.high>10);
});
test('PDF embeds shared artwork and generates a valid one-page comparison',async()=>{
 const series=conferenceRatingSeries([row('Alabama','SEC',20),row('Texas','SEC',10),row('Oregon','Big Ten',20)]);
 const logos=new Map(series.flatMap(s=>s.teams.map(t=>{const path='public'+t.logo!.replace('/team-logos/','/pdf-team-logos/').replace('.webp','.png');assert.ok(existsSync(path));return [t.logo!,{bytes:new Uint8Array(readFileSync(path)),type:'png' as const}] as const;})));
 const bytes=await buildConferenceRatingPdf(series,'2026 | Week 5',logos);assert.ok(bytes.length>10000);assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');
 const {PDFDocument}=await import('pdf-lib');assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});

test('conference chart removes only the conference margin and leaves shared model inputs unchanged',()=>{
 const profiles:RoundRobinProfile[]=[{id:'A',team:'A',season:2026,week:5,offense:[1,1,1,1,1],defense:[1,1,1,1,1],conferenceAdjustment:8},{id:'B',team:'B',season:2026,week:5,offense:[1,1,1,1,1],defense:[1,1,1,1,1],conferenceAdjustment:-8}];
 const adjusted=buildRoundRobinStandings(profiles),chartInputs=conferenceRatingProfiles(profiles),unadjusted=buildRoundRobinStandings(chartInputs);
 assert.ok(Math.abs(adjusted.find(row=>row.profile.id==='A')!.averageMargin)>1);
 assert.ok(Math.abs(unadjusted.find(row=>row.profile.id==='A')!.averageMargin)<1e-8);
 assert.deepEqual(profiles.map(p=>p.conferenceAdjustment),[8,-8]);
 assert.equal(chartInputs[0].offense,profiles[0].offense);
 assert.equal(chartInputs[0].defense,profiles[0].defense);
});
