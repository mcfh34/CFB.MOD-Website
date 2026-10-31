import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateEpaSuccessRates} from '../lib/epaSuccessRate';
import {buildNetSuccessReport} from '../lib/netSuccessRate';
test('positive EPA alone defines success; zero is failure and missing values are excluded',()=>{
 const base={gameId:7,offense:'Alabama',down:1,playType:'Rush'};
 const rates=aggregateEpaSuccessRates([{...base,id:'1',ppa:0.1},{...base,id:'2',ppa:0},{...base,id:'3',ppa:-1},{...base,id:'4',ppa:null},{...base,id:'1',ppa:0.1}]);
 assert.equal(rates.get('7\u0000Alabama'),1/3);
});
test('special teams, no-plays, spikes and kneels cannot inflate the denominator',()=>{
 const base={gameId:7,offense:'Alabama',down:1,ppa:1};
 const rates=aggregateEpaSuccessRates(['Rush','Punt','Kickoff','Extra Point','Pass Incompletion','Quarterback Kneel','Pass','Pass'].map((playType,i)=>({...base,id:String(i),playType,playText:i===6?'no play':'',ppa:i===4?-1:1,down:i===7?0:1})));
 assert.equal(rates.get('7\u0000Alabama'),1/2);
});
test('EPA net uses the scoreboard winner and does not substitute yardage success rates',()=>{
 const report=buildNetSuccessReport([{gameId:'7',season:2026,week:4,seasonType:'regular',completed:true,homeTeam:'Alabama',awayTeam:'Georgia',homePoints:20,awayPoints:30,homeLogo:null,awayLogo:null,homeSuccessRate:.9,awaySuccessRate:.2,homeValues:{epaSuccessRate:.3},awayValues:{epaSuccessRate:.6}}],new Set(['Alabama','Georgia']),2026,4,'regular','epaSuccessRate');
 assert.equal(report.rows[0].winner,'Georgia');assert.equal(report.rows[0].netSuccessRate,.3);
});
