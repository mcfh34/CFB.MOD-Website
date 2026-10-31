import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRushingRows,rushingPlayerOptions} from '../lib/rushingFilters';
const rows=[{gameId:1,playerId:'a',player:'Alpha',rushDirection:'left'},{gameId:2,playerId:'a',player:'Alpha',rushDirection:'right'},{gameId:1,playerId:'b',player:'Beta',rushDirection:null}];
test('player and game selections combine and treat numeric game ids consistently',()=>{assert.equal(filterRushingRows(rows,{game:'1',player:'a'}).length,1);assert.equal(filterRushingRows(rows,{player:'a'}).length,2);});
test('player options deduplicate identities and follow the selected game',()=>{assert.deepEqual(rushingPlayerOptions(rows).map(p=>p.key),['a','b']);assert.equal(rushingPlayerOptions(filterRushingRows(rows,{game:'2'})).length,1);});
test('unknown direction and all-selection preserve source data',()=>{assert.equal(filterRushingRows(rows,{direction:'unknown'})[0].playerId,'b');assert.equal(filterRushingRows(rows,{}).length,3);});
