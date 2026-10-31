import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMarketLine} from '../lib/marketLineAudit';
const row={homeTeam:'Alabama',awayTeam:'Tennessee',provider:'DraftKings',spread:-3.5,spreadOpen:-2.5,formattedSpread:'Alabama -3.5',overUnder:48.5,overUnderOpen:47.5,homeMoneyline:-150,awayMoneyline:130};
test('home and away favorites retain the correct home-relative sign and separate opening lines',()=>{
 assert.deepEqual(inspectMarketLine(row).issues,[]);
 assert.deepEqual(inspectMarketLine({...row,spread:3.5,formattedSpread:'Tennessee -3.5'}).issues,[]);
 assert.equal(inspectMarketLine({...row,spread:null,formattedSpread:null}).line.spread,null);
 assert.equal(inspectMarketLine({...row,spread:null,formattedSpread:null}).line.spreadOpen,-2.5);
});
test('conflicting favorites and amounts are withheld without manufacturing a corrected bet',()=>{
 const result=inspectMarketLine({...row,spread:3.5});assert.equal(result.line.spread,null);assert.equal(result.line.formattedSpread,null);
 assert.equal(result.line.overUnder,48.5);assert.equal(result.line.spreadOpen,-2.5);assert.ok(result.issues.length);
 assert.equal(inspectMarketLine({...row,formattedSpread:'Alabama -7.5'}).line.spread,null);
});
test('invalid totals and missing sources cannot appear as posted sportsbook values',()=>{
 const result=inspectMarketLine({...row,overUnder:0,overUnderOpen:-1});assert.equal(result.line.overUnder,null);assert.equal(result.line.overUnderOpen,null);
 assert.equal(inspectMarketLine({...row,provider:null}).line.spread,null);
 assert.equal(inspectMarketLine({...row,spread:0,formattedSpread:'PK'}).line.spread,0);
});
