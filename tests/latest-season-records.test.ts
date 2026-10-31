import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLatestSeasonRecords,type WeeklyRecordGame} from '../lib/weeklyRecords';
test('all schedule rows use latest actual overall and conference records; projections excluded',()=>{
 const g=(week:number,h:string,a:string,hp:number,ap:number,conf:boolean,completed=true):WeeklyRecordGame=>({gameId:String(week),week,homeTeam:h,awayTeam:a,homePoints:hp,awayPoints:ap,conferenceGame:conf,completed});
 const records=buildLatestSeasonRecords([g(1,'A','B',30,20,false),g(2,'B','C',21,14,true),g(3,'B','A',14,28,true),g(4,'B','C',35,0,true,false)]);
 assert.deepEqual(records.get('B'),{record:'1–2',conferenceRecord:'1–1'});assert.deepEqual(records.get('A'),{record:'2–0',conferenceRecord:'1–0'});
});
