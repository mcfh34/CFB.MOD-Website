import test from 'node:test';
import assert from 'node:assert/strict';
import {imperialismControlHistory} from '../lib/imperialismHistory';
const game=(id:string,date:string,winner:string,loser:string)=>({id,week:1,seasonType:'regular',startDate:date,homeTeam:winner,awayTeam:loser,homePoints:21,awayPoints:7});
test('weighted county shares, full-map takeovers, returning holders and new entrants retain the 2014 land total',()=>{
 const games=[game('1','2014-09-01','B','A'),game('2','2015-09-01','C','B'),game('3','2016-09-01','B','C')];
 const history=imperialismControlHistory(['A','A','A','B','B'],['A','B','C'],games,'2016-10-01');
 assert.deepEqual(history.stints.map(row=>[row.team,row.peakShare,row.endDate]),[['A',60,'2014-09-01'],['B',100,'2015-09-01'],['C',100,'2016-09-01'],['B',100,null]]);
 assert.equal(history.stints[1].fullControlDate,'2014-09-01');
 assert.equal((Date.parse(history.stints[1].endDate!)-Date.parse(history.stints[1].startDate))/86400000,365);
 assert.equal(history.asOf,'2016-10-01');
});
test('ties retain the leader and neither FCS games nor tied scores break a streak',()=>{
 const games=[game('1','2014-09-02','B','C'),game('2','2014-09-03','FCS','A'),{...game('3','2014-09-04','B','A'),awayPoints:21}];
 const history=imperialismControlHistory(['A','A','B','C'],['A','B','C'],games,'2014-09-05');
 assert.equal(history.stints.length,1);assert.equal(history.stints[0].team,'A');assert.equal(history.stints[0].peakShare,50);assert.equal(history.stints[0].fullControlDate,null);
});
