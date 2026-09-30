import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db';
import { levelScore } from '../../shared/score';
function setup() {
 const db = openDatabase(':memory:'); let clock = 100000; let code = '';
 const app = createApp({ db, now: () => clock, sendCode: async (_email, c) => { code = c; } });
 const client = () => { let cookie = ''; return async (path: string, body?: unknown, method = 'POST') => {
  const res = await app.request('/api' + path, { method, headers: { cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { status: res.status, body: await res.json() as any };
 }; };
 return { db, client, get code() { return code; }, tick: () => { clock += 61000; } };
}
test('formula and zero floor', () => {
 assert.equal(levelScore({timeLeftMs:5000,echoesUsed:1,maxEchoes:2,deaths:1,resets:1}),1600);
 assert.equal(levelScore({timeLeftMs:0,echoesUsed:1,maxEchoes:1,deaths:100,resets:0}),0);
});
test('guest, server score, monotonic progress and leaderboard', async () => {
 const s=setup(); const c=s.client();
 assert.equal((await c('/me',undefined,'GET')).status,401);
 const guest=await c('/session'); assert.equal(guest.body.user.isGuest,true);
 const run=await c('/runs',{levelId:1,score:999999,timeLeftMs:5000,echoesUsed:1,deaths:0,resets:0});
 assert.equal(run.body.score,1500); assert.equal(run.body.rank,1);
 await c('/progress',{maxLevel:1,tutorialDone:true},'PUT');
 assert.equal((await c('/me',undefined,'GET')).body.progress.max_level,2);
 assert.equal((await c('/leaderboard',undefined,'GET')).body[0].isMe,true);
 assert.equal((await c('/runs',{levelId:99})).status,400); s.db.close();
});
test('five wrong guesses exhaust code, throttle and expiration',async()=>{
 const s=setup();const c=s.client();await c('/session');
 await c('/auth/request',{email:'a@example.com'});const valid=s.code;
 assert.equal((await c('/auth/request',{email:'a@example.com'})).status,429);
 for(let i=0;i<5;i++) assert.equal((await c('/auth/verify',{email:'a@example.com',code:valid==='000000'?'111111':'000000'})).status,400);
 assert.equal((await c('/auth/verify',{email:'a@example.com',code:valid})).status,400);
 s.tick();await c('/auth/request',{email:'a@example.com'});
 for(let i=0;i<10;i++)s.tick();
 assert.equal((await c('/auth/verify',{email:'a@example.com',code:s.code})).status,400);s.db.close();
});
test('email attachment, guest merge, and code cannot be replayed',async()=>{
 const s=setup();const a=s.client(); const b=s.client();
 const original=(await a('/session')).body.user.id;
 await a('/auth/request',{email:'A@example.com'});
 assert.equal((await a('/auth/verify',{email:'a@example.com',code:s.code})).body.user.id,original);
 await a('/runs',{levelId:1,timeLeftMs:1000,echoesUsed:1,deaths:0,resets:0});
 await b('/session');await b('/runs',{levelId:2,timeLeftMs:2000,echoesUsed:1,deaths:0,resets:0});
 await b('/progress',{maxLevel:4,tutorialDone:true},'PUT');
 s.tick();await b('/auth/request',{email:'a@example.com'});
 const merged=await b('/auth/verify',{email:'a@example.com',code:s.code});
 assert.equal(merged.body.user.id,original);assert.deepEqual(merged.body.best,{'1':1100,'2':1200});assert.equal(merged.body.progress.max_level,4);
 assert.equal((await b('/auth/verify',{email:'a@example.com',code:s.code})).status,400);
 assert.equal((await a('/me',undefined,'GET')).body.user.id,original);s.db.close();
});
test('production cookies and origin rejection; delivery failure is visible',async()=>{
 const db=openDatabase(':memory:');const app=createApp({db,production:true,origin:'https://example.com',sendCode:async()=>{throw Error();}});
 const r=await app.request('/api/session',{method:'POST'}); const cookie=r.headers.get('set-cookie')!;
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 const bad=await app.request('/api/session',{method:'POST',headers:{Origin:'https://evil.example'}});assert.equal(bad.status,403);
 const mail=await app.request('/api/auth/request',{method:'POST',headers:{cookie:cookie.split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({email:'a@example.com'})});assert.equal(mail.status,503);db.close();
});
