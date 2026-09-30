import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, evaluateRules, levers, lever, door } from '../src/game';
test('level 3 lever opens the door only while held',()=>{
 gameState.currentLevel=3;gameState.mode='PLAYING';resetLevel();
 assert.equal(levers.length,1);assert.equal(lever,levers[0]);
 evaluateRules();assert.equal(door.open,false);
 lever.handleY=lever.y+0.2;lever.grabbedBy='ghost_0';evaluateRules();assert.equal(door.open,true);
 lever.grabbedBy=null;for(let i=0;i<3;i++)evaluateRules();assert.equal(door.open,false);
});
