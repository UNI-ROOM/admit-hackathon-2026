import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, evaluateRules, man, plate, levers, lever, door, handleDragAndDrop } from '../src/game';
test('pit kills unsupported man, even while dragged',()=>{
 gameState.currentLevel=4;gameState.mode='PLAYING';gameState.deaths=0;resetLevel();
 man.x=0.5;man.y=0.8;man.grabbedBy='live';
 for(let i=0;i<8;i++) evaluateRules();
 assert.equal(gameState.deaths,1);assert.equal(man.x,0.2);
});
test('only a held bridge supports the man',()=>{
 gameState.currentLevel=4;gameState.mode='PLAYING';resetLevel();
 plate!.x=0.5;plate!.y=0.8;plate!.grabbedBy='ghost_0';man.x=0.5;man.y=0.8;
 for(let i=0;i<20;i++)evaluateRules();
 assert.ok(man.y<0.8);assert.equal(man.x,0.5);
 plate!.grabbedBy=null;evaluateRules();assert.ok(man.y>0.8);
});
test('both levers must be held; legacy lever aliases first',()=>{
 gameState.currentLevel=5;gameState.mode='PLAYING';resetLevel();assert.equal(lever,levers[0]);
 levers[0].handleY=0.5;levers[0].grabbedBy='ghost_0';evaluateRules();assert.equal(door.open,false);
 levers[1].handleY=0.5;levers[1].grabbedBy='ghost_1';evaluateRules();assert.equal(door.open,true);
 levers[0].grabbedBy=null;for(let i=0;i<3;i++)evaluateRules();assert.equal(door.open,false);
});

test('repeated re-grabbing cannot cancel falling',()=>{
 gameState.currentLevel=4;gameState.mode='PLAYING';gameState.deaths=0;resetLevel();
 man.x=0.5;
 for(let i=0;i<6;i++){man.grabbedBy='live';man.y=0.2;evaluateRules();}
 assert.equal(gameState.deaths,1);assert.equal(man.x,0.2);
});
test('second lever can be grabbed, dragged and released independently',()=>{
 gameState.currentLevel=5;gameState.mode='PLAYING';resetLevel();
 const ctx=new Proxy({}, {get:()=>()=>{}}) as CanvasRenderingContext2D;
 const hand=Array.from({length:21},()=>({x:0.85,y:0.3}));
 handleDragAndDrop(ctx,1000,1000,hand,'ghost_1');
 assert.equal(levers[1].grabbedBy,'ghost_1');assert.equal(levers[0].grabbedBy,null);
 hand.forEach(p=>p.y=0.5);handleDragAndDrop(ctx,1000,1000,hand,'ghost_1');evaluateRules();assert.equal(levers[1].active,true);
 handleDragAndDrop(ctx,1000,1000,null,'ghost_1');assert.equal(levers[1].grabbedBy,null);
});
