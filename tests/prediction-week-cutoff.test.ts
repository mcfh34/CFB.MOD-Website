import test from 'node:test';
import assert from 'node:assert/strict';
import {enteringWeekSnapshotWeek} from '../lib/weeklyRankingSnapshot';
import {simulationCutoffs} from '../lib/simulationCutoffs';
test('Week 8 predictions use through Week 7; Week 9 predictions use through Week 8',()=>{
 assert.equal(enteringWeekSnapshotWeek(8),7);
 assert.equal(enteringWeekSnapshotWeek(9),8);
 assert.deepEqual(simulationCutoffs(enteringWeekSnapshotWeek(8),8),{resultsWeek:7,profileWeek:7});
 assert.deepEqual(simulationCutoffs(enteringWeekSnapshotWeek(9),8),{resultsWeek:8,profileWeek:8});
 assert.deepEqual(simulationCutoffs(enteringWeekSnapshotWeek(9),7),{resultsWeek:8,profileWeek:7});
});
