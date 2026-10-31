import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPassingRows,passingPlayerOptions,passingYpa,passLocations} from '../lib/passing';
import {archivePassingRows} from '../lib/passingArchive';
import {buildPassingDirectionalProfiles,parsePassingDirectionalGames,passingDirectionalMatchup,MIN_PASS_ZONE_ATTEMPTS} from '../lib/passingMatchup';
test('passing selections combine player, game and location with normalized IDs',()=>{
 const rows=[{playerId:1,player:'A',gameId:2,passLocation:'deep left'},{passerId:'1',passer:'A',gameId:3,passLocation:'short left'},{passerId:4,passer:'B',gameId:2,passLocation:null}];
 assert.equal(passingPlayerOptions(rows).length,2);
 assert.equal(filterPassingRows(rows,{player:'1',game:'2',location:'deep left'}).length,1);
 assert.equal(filterPassingRows(rows,{location:'unknown'})[0].passer,'B');
});
test('passing YPA uses yard-covered attempts and preserves missing values',()=>{
 assert.equal(passingYpa({totalYards:100,attempts:20,totalYardsAttemptsAvailable:10}),10);
 assert.equal(passingYpa({totalYards:null,totalYardsAttemptsAvailable:10}),null);
 assert.equal(passingYpa({totalYards:0,totalYardsAttemptsAvailable:10}),0);
});
const side=(unknown=0)=>({locationEligibleAttempts:120+unknown,locations:Object.fromEntries([...passLocations.map(l=>[l,{attempts:20,totalYardsAttemptsAvailable:20,totalYards:l.startsWith('deep')?240:100}]),['unknown',{attempts:unknown}]])});
const game=(id:string,week:number,team:string,opponent:string,unknown=0)=>({gameId:id,week,team,opponent,offense:side(unknown),defense:side()});
test('passing zones respect cutoff and FBS opponents, preserve unknown usage, and require yard evidence',()=>{
 const payload=[game('1',1,'A','B',120),game('1',1,'B','A'),game('2',2,'A','B'),game('3',1,'A','FCS')];
 const profiles=buildPassingDirectionalProfiles(parsePassingDirectionalGames(payload),1,new Set(['A','B']));
 const a=profiles.get('A')!,b=profiles.get('B')!;
 assert.equal(a.offense['short left'].attempts,20);
 assert.equal(a.offense['short left'].ypa,5);
 assert.equal(a.knownFraction?.offense,.5);
 const fit=passingDirectionalMatchup(a,b);assert.equal(fit.lanes.length,6);assert.ok(fit.lanes.every(l=>!l.tested));
 assert.ok(Math.abs(fit.lanes.reduce((sum,l)=>sum+l.share,0)-.5)<1e-12);
 const missing=game('4',1,'C','B');missing.offense.locations['short left'].totalYards=null as unknown as number;
 const c=buildPassingDirectionalProfiles(parsePassingDirectionalGames([missing,game('4',1,'B','C')]),1,new Set(['B','C'])).get('C')!;
 assert.equal(c.offense['short left'].ypa,null);assert.equal(passingDirectionalMatchup(c,b).lanes[0].tested,false);
});
test('passing archive combines exact completed production without inventing location stats',()=>{
 const rows=archivePassingRows([{gameId:'1',week:1,team:'A',opponent:'B',attempts:20,yards:200,completions:10},{gameId:'1',week:1,team:'B',opponent:'A',attempts:30,yards:240,completions:null}],'A',false);
 assert.equal(rows[0].offense.yardsPerAttempt,10);assert.equal(rows[0].defense.yardsPerAttempt,8);
 assert.equal(rows[0].defense.completionRate,null);assert.ok(!('locations' in rows[0].offense));
});

test('passing edge adds signed offense and defense opponent-relative percentages with continuous small-sample shrinkage',()=>{
 const a=game('1',1,'A','X'),x=game('1',1,'X','A'),b=game('2',1,'B','Y'),y=game('2',1,'Y','B');
 a.offense.locations['deep left']={attempts:20,totalYardsAttemptsAvailable:20,totalYards:200};
 b.defense.locations['deep left']={attempts:20,totalYardsAttemptsAvailable:20,totalYards:120};
 const xOther=game('3',1,'X','Z'),yOther=game('4',1,'Y','Z');
 xOther.defense.locations['deep left']={attempts:20,totalYardsAttemptsAvailable:20,totalYards:100};
 yOther.offense.locations['deep left']={attempts:20,totalYardsAttemptsAvailable:20,totalYards:160};
 const rows=parsePassingDirectionalGames([a,x,b,y,xOther,yOther]);
 const profiles=buildPassingDirectionalProfiles(rows,1,new Set(['A','B','X','Y','Z']));
 const off=profiles.get('A')!,def=profiles.get('B')!;
 const fit=passingDirectionalMatchup(off,def).lanes.find(l=>l.lane==='deep left')!;
 assert.ok(fit.tested);
 assert.ok(Math.abs(fit.offRelative!-100*20/45)<1e-8); // 10 YPA versus X's usual 5
 assert.ok(Math.abs(fit.defRelative!+25*20/45)<1e-8); // 6 allowed versus Y's usual 8
 assert.ok(Math.abs(fit.edgePercent-(fit.offRelative!+fit.defRelative!))<1e-8);
 const signed=structuredClone(off);signed.offense['deep left'].relativePercent=10;
 const signedDefense=structuredClone(def);signedDefense.defense['deep left'].relativePercent=-5;
 assert.equal(passingDirectionalMatchup(signed,signedDefense).lanes.find(l=>l.lane==='deep left')!.edgePercent,5);
 const s=game('5',1,'S','X');s.offense.locations['deep left']={attempts:1,totalYardsAttemptsAvailable:1,totalYards:20};
 const small=buildPassingDirectionalProfiles(parsePassingDirectionalGames([s,xOther]),1,new Set(['S','X','Z'])).get('S')!;
 assert.ok(Math.abs(small.offense['deep left'].relativePercent!-100/26)<1e-8);
 assert.equal(passingDirectionalMatchup(small,def).lanes.find(l=>l.lane==='deep left')!.tested,false);
 const unmatched=profiles.get('Y')!;
 assert.equal(passingDirectionalMatchup(unmatched,def).lanes.find(l=>l.lane==='short right')!.tested,false);
});
test('passing edges require three compared attempts on both sides of the zone',()=>{
 assert.equal(MIN_PASS_ZONE_ATTEMPTS,3);
 const a=game('1',1,'A','X'),x=game('1',1,'X','A'),b=game('2',1,'B','Y'),y=game('2',1,'Y','B');
 const xOther=game('3',1,'X','Z'),yOther=game('4',1,'Y','Z');
 for(const row of [a,b,xOther,yOther])row[row===a||row===yOther?'offense':'defense'].locations['deep left']={attempts:3,totalYardsAttemptsAvailable:3,totalYards:24};
 const profiles=buildPassingDirectionalProfiles(parsePassingDirectionalGames([a,x,b,y,xOther,yOther]),1,new Set(['A','B','X','Y','Z']));
 const off=profiles.get('A')!,def=profiles.get('B')!;
 const lane=()=>passingDirectionalMatchup(off,def).lanes.find(l=>l.lane==='deep left')!;
 assert.equal(lane().tested,true);
 off.offense['deep left'].comparedOwnAttempts=2;
 assert.equal(lane().tested,false);assert.equal(lane().offRelative,null);
 off.offense['deep left'].comparedOwnAttempts=3;
 def.defense['deep left'].comparedOwnAttempts=2;
 assert.equal(lane().tested,false);assert.equal(lane().defRelative,null);
});
