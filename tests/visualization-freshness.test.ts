import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceIssue} from '../lib/sourceStatus';
import {visualizationCacheControl,visualizationDataUrl} from '../lib/visualizationFreshness';
import locations from '../lib/data/team-locations.json';
test('upstream quotas are not described as successful or briefly rate limited',()=>{
 assert.equal(sourceIssue('manual: CollegeFootballData /teams/fbs returned 429: Monthly quota exceeded')?.code,'source-quota');
 assert.equal(sourceIssue('CollegeFootballData /teams returned 429: Too many requests')?.code,'source-rate-limit');
 assert.equal(sourceIssue('CollegeFootballData /games returned 401')?.code,'source-access');
 assert.equal(sourceIssue('complete'),null);
});
test('active result responses cannot retain an old map in browser caches',()=>{
 assert.equal(visualizationCacheControl(true),'no-store');
 assert.match(visualizationDataUrl('/api/imperialism?season=all'),/&dataRevision=/);
 assert.match(visualizationDataUrl('/api/food-chain'),/\?dataRevision=/);
});
test('Imperialism can load without a working CFBD key, with FBS membership still enforced',()=>{
 const code=readFileSync(new URL('../app/api/imperialism/route.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bcfbd\(/);assert.doesNotMatch(code,/!env.CFBD_API_KEY/);
 assert.match(code,/t.team=g.home_team/);assert.match(code,/t.team=g.away_team/);
 assert.ok(locations.teams.some(t=>t.school==='Alabama'&&t.lat>33&&t.lat<34&&t.lon< -87));
 assert.ok(locations.teams.every(t=>Number.isFinite(t.lat)&&Number.isFinite(t.lon)&&Math.abs(t.lat)<=90&&Math.abs(t.lon)<=180));
});
