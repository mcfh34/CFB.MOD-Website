import test from 'node:test';
import assert from 'node:assert/strict';
import {imperialismBorders,imperialismOutline} from '../lib/imperialismBorders';
const county=(ring:number[][])=>({g:[[ring]]});
test('one shared border is drawn once and exterior shorelines receive no stroke',()=>{
 const left=county([[-80,35],[-79,35],[-79,36],[-80,36],[-80,35]]),right=county([[-79,35],[-78,35],[-78,36],[-79,36],[-79,35]]);
 const borders=imperialismBorders([left,right]);assert.equal(borders.length,1);assert.equal(borders[0].first,0);assert.equal(borders[0].second,1);assert.equal((borders[0].path.match(/M/g)||[]).length,1);
});
test('national outline excludes shared seams and keeps isolated island perimeters',()=>{
 const left=county([[-80,35],[-79,35],[-79,36],[-80,36],[-80,35]]),right=county([[-79,35],[-78,35],[-78,36],[-79,36],[-79,35]]);
 assert.equal((imperialismOutline([left,right]).match(/M/g)||[]).length,6);
 const island=county([[-77,35],[-76,35],[-76,36],[-77,36],[-77,35]]);
 assert.equal((imperialismOutline([left,right,island]).match(/M/g)||[]).length,10);
});
test('isolated barrier islands cannot generate offshore loops or lines to mainland',()=>{
 const mainland=county([[-80,35],[-79,35],[-79,36],[-80,36],[-80,35]]),island=county([[-78.9,35],[-78.88,35],[-78.88,36],[-78.9,36],[-78.9,35]]);
 assert.deepEqual(imperialismBorders([mainland,island]),[]);
});
