import test from 'node:test';
import assert from 'node:assert/strict';
import {directionalArt} from '../lib/directionalArt';
import type {DirectionalProfile} from '../lib/rushingMatchup';
const profile=(sample=30):DirectionalProfile=>({schema:2,coverage:sample*3,eligible:{offense:sample*3,defense:sample*3},knownFraction:{offense:1,defense:1},offense:{left:{index:1.4,share:1/3,carries:sample,ypc:7,relativePercent:20},middle:{index:1,share:1/3,carries:sample,ypc:4},right:{index:1,share:1/3,carries:sample,ypc:0}},defense:{left:{index:1,share:1/3,carries:sample,ypc:4,relativePercent:-5},middle:{index:1,share:1/3,carries:sample,ypc:4},right:{index:1,share:1/3,carries:sample,ypc:4}}});
test('art uses three generic rush lanes and six source passing zones without manufacturing missing evidence',()=>{
 const art=directionalArt(profile(),profile());
 assert.deepEqual(art.rushing.map(z=>z.id),['left','middle','right']);assert.equal(art.passing.length,6);
 assert.ok(art.passing.every(z=>z.tone==='untested'&&z.edge===null&&z.off===null));
 assert.equal(art.rushing[0].tone,'attack');assert.equal(art.rushing[2].off,0);
});
test('displayed rushing edge uses signed OFF plus DEF percentages regardless of sample gate',()=>{
 const art=directionalArt(profile(5),profile());assert.equal(art.rushing[0].edge,15);assert.equal(art.rushing[0].off,7);
});
