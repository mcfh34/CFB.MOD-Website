import test from 'node:test';
import assert from 'node:assert/strict';
import {foodEdges,findFoodChains,type FoodGame} from '../lib/foodChain';
const game=(homeTeam:string,awayTeam:string,homePoints:number,awayPoints:number,week=1):FoodGame=>({gameId:`${homeTeam}-${awayTeam}-${week}`,homeTeam,awayTeam,homePoints,awayPoints,week,completed:true,seasonType:'regular'});
test('cycles follow actual winners, include a required team and deduplicate rotations',()=>{
  const edges=foodEdges([game('A','B',30,10),game('B','C',24,17),game('C','A',20,14)],new Set(['A','B','C']),5);
  const found=findFoodChains(edges,3,'cycle');assert.equal(found.chains.length,1);
  assert.deepEqual(found.chains[0].edges.map(row=>[row.winner,row.loser]),[['A','B'],['B','C'],['C','A']]);
  assert.equal(findFoodChains(edges,3,'cycle','B').chains[0].teams[0],'B');
  assert.equal(findFoodChains(edges,3,'cycle','D').chains.length,0);
});
test('open chains do not imply a closing win and exclude ties, FCS and future results',()=>{
  const edges=foodEdges([game('A','B',30,10),game('C','B',7,24),game('C','A',20,14,6),game('A','FCS',70,0),game('A','C',17,17)],new Set(['A','B','C']),5);
  assert.equal(edges.length,2);assert.equal(findFoodChains(edges,3,'cycle').chains.length,0);
  assert.deepEqual(findFoodChains(edges,3,'chain').chains[0].teams,['A','B','C']);
  assert.equal(findFoodChains(edges,3,'chain','C').chains.length,1);
});
test('postseason is opt-in and search reports bounded results',()=>{
  const playoff={...game('C','A',21,20),seasonType:'postseason'};
  const games=[game('A','B',30,10),game('B','C',24,17),playoff];
  const members=new Set(['A','B','C']);
  assert.equal(foodEdges(games,members,16).length,2);
  const matches=findFoodChains(foodEdges(games,members,16,true),3,'cycle','',1);
  assert.equal(matches.chains.length,1);assert.equal(matches.limited,true);
});
