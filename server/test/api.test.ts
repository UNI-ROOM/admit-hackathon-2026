import { test, type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db';
import { levelScore } from '../../shared/score';
async function testDatabase(t: TestContext) {
 const schema = 'test_' + randomUUID().replaceAll('-', '');
 const db = await openDatabase(process.env.TEST_DATABASE_URL || 'postgresql://echo_test:echo_test@127.0.0.1:55432/echo_test', schema);
 t.after(async () => { await db.run(`DROP SCHEMA ${schema} CASCADE`); await db.close(); });
 return db;
}
async function setup(t: TestContext) {
 const db = await testDatabase(t); let clock = 100000; let code = '';
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
test('guest, server score, monotonic progress and leaderboard', async (t) => {
 const s=await setup(t); const c=s.client();
 assert.equal((await c('/me',undefined,'GET')).status,401);
 const guest=await c('/session'); assert.equal(guest.body.user.isGuest,true);
 const run=await c('/runs',{levelId:1,score:999999,timeLeftMs:5000,echoesUsed:1,deaths:0,resets:0});
 assert.equal(run.body.score,1500); assert.equal(run.body.rank,1);
 await c('/progress',{maxLevel:1,tutorialDone:true},'PUT');
 assert.equal((await c('/me',undefined,'GET')).body.progress.max_level,2);
 assert.equal((await c('/leaderboard',undefined,'GET')).body[0].isMe,true);
 assert.equal((await c('/runs',{levelId:99})).status,400);
});
test('rank is null with no runs, then reflects standing among players',async(t)=>{
 const s=await setup(t);const a=s.client();const b=s.client();
 await a('/session');
 assert.deepEqual((await a('/me/rank',undefined,'GET')).body,{rank:null,total:0,levels:0,players:0});
 await a('/runs',{levelId:1,timeLeftMs:1000,echoesUsed:1,deaths:0,resets:0});
 const aRank=await a('/me/rank',undefined,'GET');
 assert.equal(aRank.body.rank,1);assert.equal(aRank.body.players,1);assert.ok(aRank.body.total>0);
 await b('/session');
 await b('/runs',{levelId:1,timeLeftMs:5000,echoesUsed:1,deaths:0,resets:0});
 const aAfter=await a('/me/rank',undefined,'GET');const bAfter=await b('/me/rank',undefined,'GET');
 assert.equal(bAfter.body.rank,1);assert.equal(aAfter.body.rank,2);assert.equal(aAfter.body.players,2);assert.equal(bAfter.body.players,2);
});
test('five wrong guesses exhaust code, throttle and expiration',async(t)=>{
 const s=await setup(t);const c=s.client();await c('/session');
 await c('/auth/request',{email:'a@example.com'});const valid=s.code;
 assert.equal((await c('/auth/request',{email:'a@example.com'})).status,429);
 for(let i=0;i<5;i++) assert.equal((await c('/auth/verify',{email:'a@example.com',code:valid==='000000'?'111111':'000000'})).status,400);
 assert.equal((await c('/auth/verify',{email:'a@example.com',code:valid})).status,400);
 s.tick();await c('/auth/request',{email:'a@example.com'});
 for(let i=0;i<10;i++)s.tick();
 assert.equal((await c('/auth/verify',{email:'a@example.com',code:s.code})).status,400);
});
test('email attachment, guest merge, and code cannot be replayed',async(t)=>{
 const s=await setup(t);const a=s.client(); const b=s.client();
 const original=(await a('/session')).body.user.id;
 await a('/auth/request',{email:'A@example.com'});
 assert.equal((await a('/auth/verify',{email:'a@example.com',code:s.code})).body.user.id,original);
 await a('/runs',{levelId:1,timeLeftMs:1000,echoesUsed:1,deaths:0,resets:0});
 await b('/session');await b('/runs',{levelId:2,timeLeftMs:2000,echoesUsed:1,deaths:0,resets:0});
 await b('/progress',{maxLevel:3,tutorialDone:true},'PUT');
 s.tick();await b('/auth/request',{email:'a@example.com'});
 const merged=await b('/auth/verify',{email:'a@example.com',code:s.code});
 assert.equal(merged.body.user.id,original);assert.deepEqual(merged.body.best,{'1':1100,'2':1500});assert.equal(merged.body.progress.max_level,3);
 assert.equal((await b('/auth/verify',{email:'a@example.com',code:s.code})).status,400);
 assert.equal((await a('/me',undefined,'GET')).body.user.id,original);
});
test('production cookies and origin rejection; delivery failure is visible',async(t)=>{
 const db=await testDatabase(t);const app=createApp({db,production:true,origin:'https://example.com',sendCode:async()=>{throw Error();}});
 const r=await app.request('/api/session',{method:'POST'}); const cookie=r.headers.get('set-cookie')!;
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 const bad=await app.request('/api/session',{method:'POST',headers:{Origin:'https://evil.example'}});assert.equal(bad.status,403);
 const mail=await app.request('/api/auth/request',{method:'POST',headers:{cookie:cookie.split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({email:'a@example.com'})});assert.equal(mail.status,503);
});

test('PostgreSQL rolls back failed transactions', async t => {
 const db=await testDatabase(t);
 await assert.rejects(db.transaction(async tx=>{
  await tx.run('INSERT INTO users VALUES ($1,NULL,$2,$3)', ['rollback-user','Rollback',1]);
  throw new Error('abort');
 }));
 assert.equal(await db.one('SELECT id FROM users WHERE id=$1',['rollback-user']),undefined);
});
test('concurrent verification consumes a code once',async t=>{
 const s=await setup(t);const c=s.client();await c('/session');
 await c('/auth/request',{email:'race@example.com'});const code=s.code;
 const results=await Promise.all([c('/auth/verify',{email:'race@example.com',code}),c('/auth/verify',{email:'race@example.com',code})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});
test('concurrent code requests enforce cooldown',async t=>{
 const s=await setup(t);const a=s.client();const b=s.client();await a('/session');await b('/session');
 const results=await Promise.all([a('/auth/request',{email:'race@example.com'}),b('/auth/request',{email:'race@example.com'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
});
test('SQLite import preserves sessions, runs and progress and advances the sequence', async t=>{
 const {importSqliteSnapshot}=await import('../src/import-sqlite');
 const db=await testDatabase(t);
 const snapshot={
  users:[{id:'legacy',email:null,nickname:'Старый гость',created_at:100000}],
  sessions:[{token:createHash('sha256').update('legacy-session-token').digest('hex'),user_id:'legacy',created_at:100000,expires_at:9999999999999}],
  login_codes:[{email:'legacy@example.com',code_hash:'existing-code-hash',expires_at:9999999999999,attempts:2,requested_at:100000}],
  runs:[{id:42,user_id:'legacy',level_id:1,score:1500,time_left_ms:5000,echoes_used:1,deaths:0,resets:0,created_at:100000}],
  progress:[{user_id:'legacy',max_level:3,tutorial_done:1,updated_at:100000}],
 };
 assert.deepEqual(await importSqliteSnapshot(db,snapshot),{users:1,sessions:1,login_codes:1,runs:1,progress:1});
 const app=createApp({db,sendCode:async()=>{}});
 const me=await app.request('/api/me',{headers:{cookie:'echo_sid=legacy-session-token'}});
 assert.equal(me.status,200);
 const restored=await me.json() as any;assert.equal(restored.user.id,'legacy');assert.equal(restored.best['1'],1500);
 assert.equal((await db.one('SELECT max_level FROM progress'))!.max_level,3);
 const next=await db.one("INSERT INTO runs (user_id,level_id,score,created_at) VALUES ('legacy',2,1000,1) RETURNING id");
 assert.equal(Number(next!.id),43);
 await assert.rejects(importSqliteSnapshot(db,snapshot),/empty database/);
 assert.equal((await db.one('SELECT COUNT(*)::integer n FROM runs'))!.n,2);
});
test('invalid SQLite import rolls back every table',async t=>{
 const {importSqliteSnapshot}=await import('../src/import-sqlite');const db=await testDatabase(t);
 await assert.rejects(importSqliteSnapshot(db,{
  users:[{id:'legacy',email:null,nickname:'Guest',created_at:1}],sessions:[],login_codes:[],progress:[],
  runs:[{id:1,user_id:'missing',level_id:1,score:10,time_left_ms:0,echoes_used:1,deaths:0,resets:0,created_at:1}],
 }));
 assert.equal((await db.one('SELECT COUNT(*)::integer n FROM users'))!.n,0);
});

test('difficulty is validated, persisted and selects the matching echo bonus', async t => {
 const s=await setup(t); const c=s.client(); await c('/session');
 const run={levelId:3,timeLeftMs:5000,echoesUsed:1,deaths:0,resets:0};
 assert.equal((await c('/runs',{...run,difficulty:'easy'})).body.score,1800);
 assert.equal((await c('/runs',{...run,difficulty:'hard'})).body.score,2100);
 assert.equal((await c('/runs',run)).body.score,2100);
 assert.equal((await c('/runs',{...run,difficulty:'impossible'})).status,400);
 const rows=await s.db.all('SELECT difficulty FROM runs ORDER BY id');
 assert.deepEqual(rows.map(row=>row.difficulty),['easy','hard','hard']);
});

test('difficulty migration preserves legacy runs and can be repeated', async t => {
 const db=await testDatabase(t);
 const schema=(await db.one('SELECT current_schema() AS name'))!.name;
 await db.run('ALTER TABLE runs DROP COLUMN difficulty');
 await db.run("INSERT INTO users VALUES ('legacy-difficulty',NULL,'Guest',1)");
 await db.run("INSERT INTO runs (user_id,level_id,score,created_at) VALUES ('legacy-difficulty',1,1500,1)");
 for(let i=0;i<2;i++) {
  const reopened=await openDatabase(process.env.TEST_DATABASE_URL || 'postgresql://echo_test:echo_test@127.0.0.1:55432/echo_test',schema);
  try { assert.deepEqual(await reopened.one('SELECT score,difficulty FROM runs'),{score:1500,difficulty:'hard'}); }
  finally { await reopened.close(); }
 }
});
