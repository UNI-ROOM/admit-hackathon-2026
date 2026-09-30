import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, evaluateRules, levers, lever, door } from '../src/game';
test('level 3 needs both levers held by different echoes and closes when either releases', () => {
 gameState.currentLevel=3;gameState.mode='PLAYING';resetLevel();
 assert.equal(levers.length,2);assert.equal(lever,levers[0]);
 evaluateRules();assert.equal(door.open,false);
 lever.handleY=lever.y+0.2;lever.grabbedBy='ghost_0';evaluateRules();assert.equal(door.open,false);
 levers[1].handleY=levers[1].y+0.2;levers[1].grabbedBy='ghost_1';evaluateRules();assert.equal(door.open,true);
 lever.grabbedBy=null;for(let i=0;i<3;i++)evaluateRules();assert.equal(door.open,false);
});
