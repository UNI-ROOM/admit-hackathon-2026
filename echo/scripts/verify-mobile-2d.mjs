import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = fileURLToPath(new URL('../test-artifacts/mobile-2d/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5188, hmr: false, watch: null } });
const report = { checks: [], layouts: [], errors: [] };
let browser;
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.route(/^https:\/\//, route => route.abort());
    const session = { user: { id: 'mobile-test', nickname: 'Mobile', isGuest: true }, progress: { max_level: 3, tutorial_done: 0 }, best: {} };
    await context.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const body = path.includes('leaderboard') ? [] : path.includes('rank') ? { rank: null, total: 0 }
            : path.endsWith('/runs') ? { best: 123, rank: 1 } : session;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.addInitScript(() => {
        window.__cameraRequests = 0;
        navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; throw new Error('No camera in touch tests'); };
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('touch-device')));
    await page.screenshot({ path: `${artifacts}/menu.png` });
    await page.setViewportSize({width:320,height:568});
    for (const name of ['PROFILE','LEADERBOARD','SETTINGS']) {
        await page.locator('#scene-menu button').filter({hasText:name}).tap();
        await page.locator('dialog[open]').waitFor();
        const bounds=await page.locator('dialog[open]').boundingBox();
        assert.ok(bounds.x>=0 && bounds.x+bounds.width<=320 && bounds.y+bounds.height<=568, `${name} fits narrow phone`);
        assert.equal(await page.locator('dialog[open]').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,`${name} has no horizontal overflow`);
        await page.screenshot({path:`${artifacts}/${name.toLowerCase()}-320x568.png`});
        await page.locator('dialog[open] > button').last().tap();
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.menu-btn--primary').tap();
    await page.locator('.level-card').nth(2).locator('button').first().waitFor();
    assert.equal(await page.locator('.level-card').count(), 3);
    await page.screenshot({ path: `${artifacts}/levels.png` });
    await page.locator('.level-card').first().locator('button').first().tap();
    await page.evaluate(async () => { window.__mobileGame = await import('/src/game.ts'); });
    const state = () => page.evaluate(async () => {
        const g = await import('/src/game.ts');
        return { mode: g.gameState.mode, difficulty: g.gameState.difficulty, step: g.gameState.tutorialStep,
            index: g.gameState.echoIndex, deaths: g.gameState.deaths, echoes: g.gameState.recordedEchoes.length,
            time: g.playingTimeLeft(), recordTime: Date.now() - g.gameState.recordStartTime,
            man: { ...g.man }, prism: g.prism && { ...g.prism }, plate: g.plate && { ...g.plate },
            crystal: g.crystal && { ...g.crystal }, door: { ...g.door }, laser: g.laser && { ...g.laser },
            levers: g.levers.map(lever => ({ ...lever })) };
    });
    const enter = async (level, difficulty) => {
        await page.evaluate(async ({level,difficulty}) => (await import('/src/scenes/levels.ts')).goToLevel(level,difficulty), {level,difficulty});
        await page.waitForTimeout(100);
    };
    for (const [width,height] of [[320,568],[360,800],[390,844],[430,932],[844,390]]) {
        await page.setViewportSize({width,height});
        await page.waitForTimeout(120);
        const layout = await page.evaluate(() => {
            const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
            return { viewport: [innerWidth,innerHeight], scrollWidth:document.documentElement.scrollWidth,
                canvas:bounds('#game-canvas'),header:bounds('.game-header'),footer:bounds('.game-footer') };
        });
        assert.ok(layout.scrollWidth <= width, 'no horizontal page overflow');
        assert.ok(layout.canvas.width >= 200 && Math.abs(layout.canvas.width-layout.canvas.height)<1, 'square playable world');
        assert.ok(layout.canvas.y >= layout.header.bottom-1, 'header does not cover the world');
        assert.ok(height<width ? layout.canvas.right <= layout.footer.x+1 : layout.canvas.bottom <= layout.footer.y+1, 'actions do not cover the world');
        assert.ok(layout.footer.bottom<=height+1, 'actions fit within viewport');
        const buttons = await page.locator('#game-container button:visible').evaluateAll(elements => elements.map(e => ({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})));
        assert.ok(buttons.every(b=>b.height>=44&&b.width>=44), '44px action targets');
        report.layouts.push(layout);
        await page.screenshot({path:`${artifacts}/game-${width}x${height}.png`});
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(150);

    const cdp = await context.newCDPSession(page);
    const contacts = new Map();
    const point = async (x,y,id) => {
        const box = await page.locator('#game-canvas').boundingBox();
        return { id, x:box.x+x*box.width, y:box.y+y*box.height, radiusX:8, radiusY:8, force:1 };
    };
    const dispatch = type => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:[...contacts.values()]});
    const down = async (id,x,y) => { contacts.set(id,await point(x,y,id)); await dispatch('touchStart'); await page.waitForTimeout(80); };
    const move = async (id,x,y) => { contacts.set(id,await point(x,y,id)); await dispatch('touchMove'); };
    const up = async id => {
        const released = contacts.get(id);
        contacts.delete(id);
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[released]});
        await page.waitForTimeout(70);
    };
    const cancel = async () => { contacts.clear(); await dispatch('touchCancel'); await page.waitForTimeout(70); };
    const path = async (id,x,y,steps=20) => {
        const start=contacts.get(id); const box=await page.locator('#game-canvas').boundingBox();
        const sx=(start.x-box.x)/box.width,sy=(start.y-box.y)/box.height;
        for(let i=1;i<=steps;i++){await move(id,sx+(x-sx)*i/steps,sy+(y-sy)*i/steps);await page.waitForTimeout(35);}
        await page.waitForTimeout(250);
    };
    const followShield = async (until, manDestination) => {
        while(true){
            const s=await state();
            if(until(s))break;
            if(s.mode==='IDLE'||s.mode==='WON')break;
            await move(1,s.laser.x,.2);
            if(manDestination)await move(2,manDestination.x,manDestination.y);
            await page.waitForTimeout(45);
        }
    };
    const rescue = async () => {
        const s=await state();
        await down(1,s.man.x,s.man.y);
        await path(1,s.door.x,s.door.y,35);
        await page.waitForFunction(()=> window.__mobileGame.gameState.mode==='WON',{},{timeout:2500});
        await cancel();
        assert.equal((await state()).deaths,0,'safe rescue path');
    };

    console.log('Checking touch tutorial and lifecycle…');
    await page.evaluate(async()=> (await import('/src/scenes/levels.ts')).goToTutorial());
    await page.locator('#touch-tutorial-button').tap();
    assert.equal((await state()).step,2);
    await down(1,.3,.5);await path(1,.7,.5);await up(1);
    assert.equal((await state()).step,3);
    await page.locator('#touch-tutorial-button').tap();
    assert.equal((await state()).step,4);
    await page.locator('#hud-menu-button').tap();
    await page.locator('#scene-levels:not([hidden])').waitFor();
    report.checks.push('Four-step touch tutorial completes without camera gestures');

    await enter(1,'hard');await page.locator('#play-button').tap();
    let s=await state();await down(1,s.prism.x,s.prism.y);await down(2,s.man.x,s.man.y);
    s=await state();assert.equal(s.prism.grabbedBy,'live');assert.equal(s.man.grabbedBy,'live_1');
    await up(1);s=await state();assert.equal(s.prism.grabbedBy,null);assert.equal(s.man.grabbedBy,'live_1');
    await cancel();assert.equal((await state()).man.grabbedBy,null);
    await page.locator('#hud-menu-button').tap();
    const before=(await state()).time;await page.waitForTimeout(450);
    await page.locator('dialog[open] button').filter({hasText:'Resume'}).tap();
    assert.ok(Math.abs(before-(await state()).time)<150,'pause does not consume the live timer');
    await page.locator('#hud-menu-button').tap();await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(),0,'Escape closes and resumes pause');
    await page.locator('#touch-restart-button').tap();assert.equal((await state()).mode,'IDLE');
    report.checks.push('Independent fingers, cancel, restart, pause timers and Escape verified');
    await enter(1,'hard');await page.locator('#record-button').tap();
    s=await state();await down(1,s.prism.x,s.prism.y);await down(2,s.man.x,s.man.y);
    await page.waitForTimeout(120);
    assert.ok(await page.evaluate(()=>window.__mobileGame.gameState.recordedEchoes[0].at(-1).hands.every(Boolean)), 'Hard records both actual touch identities');
    await cancel();await page.locator('#touch-restart-button').tap();
    report.checks.push('Hard recording captures both independent fingers in the shared echo format');

    await page.locator('#play-button').tap();
    const otherPage=await context.newPage();
    await otherPage.goto('about:blank');await otherPage.bringToFront();
    await page.waitForTimeout(200);
    if(await page.evaluate(()=>document.hidden)) {
        assert.equal(await page.locator('dialog[open]').count(),1,'backgrounded attempt opens pause');
        const before=(await state()).time;await page.waitForTimeout(300);
        await page.bringToFront();
        await page.locator('dialog[open] button').filter({hasText:'Resume'}).tap();
        assert.ok((await state()).time>=before-150,'background pause restores elapsed time');
        report.checks.push('Background tab automatically pauses and resumes without consuming attempt time');
    } else {
        // Headless builds may keep all tabs visible. Exercise the same browser event.
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
        assert.equal(await page.locator('dialog[open]').count(),1);
        await page.waitForTimeout(300);
        await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
        await page.locator('dialog[open] button').filter({hasText:'Resume'}).tap();
        report.checks.push('Visibility change handler pauses the attempt (headless visibility simulated)');
    }
    await otherPage.close();await page.bringToFront();await page.locator('#touch-restart-button').tap();

    for(const level of [1,2,3]) {
        console.log(`Solving Easy ${level} with real timed echo recordings…`);
        await enter(level,'easy');await page.locator('#record-button').tap();
        if(level===1){
            s=await state();await down(1,s.prism.x,s.prism.y);await path(1,.5,.45);
            await page.waitForFunction(()=> window.__mobileGame.gameState.mode==='PLAYING',{},{timeout:11500});
            await cancel();
            await page.waitForFunction(()=> window.__mobileGame.crystal.charged,{},{timeout:6000});
        } else {
            if(level===3){
                s=await state();await down(1,s.levers[0].x,s.levers[0].handleY);await path(1,s.levers[0].x,.5);
                await page.waitForFunction(()=> window.__mobileGame.gameState.echoIndex===1,{},{timeout:11500});
                await cancel();
            }
            s=await state();await down(1,s.plate.x,s.plate.y);await path(1,s.laser.x,.2,8);
            await followShield(state=>state.mode==='PLAYING');await cancel();
            await page.waitForTimeout(1300);
        }
        s=await state();
        if(s.mode!=='PLAYING')console.log('Unexpected puzzle state:',JSON.stringify(s));
        assert.equal(s.mode,'PLAYING');assert.ok(s.echoes>=1);
        await rescue();
        await page.screenshot({path:`${artifacts}/easy-${level}-complete.png`});
        report.checks.push(`Easy ${level}: actual touch recording, timed echo playback and rescue complete`);
        await page.evaluate(async()=> (await import('/src/ui/account.ts')).closePanel());
    }

    for(const level of [1,2,3]) {
        console.log(`Solving Hard ${level} with two fingers…`);
        await enter(level,'hard');await page.locator('#play-button').tap();
        if(level===1){
            s=await state();await down(1,s.prism.x,s.prism.y);await path(1,.5,.45,8);
            s=await state();await down(2,s.man.x,s.man.y);
            await page.waitForFunction(()=> window.__mobileGame.crystal.charged,{},{timeout:6000});
            await path(2,.15,.8,30);
        }else{
            for(let i=0;i<(await state()).levers.length;i++){
                s=await state();const lever=s.levers[i];await down(1,lever.x,lever.handleY);await path(1,lever.x,lever.y+.2,5);await up(1);
            }
            s=await state();assert.ok(s.levers.every(l=>l.active));
            await down(1,s.plate.x,s.plate.y);await path(1,s.laser.x,.2,8);
            s=await state();await down(2,s.man.x,s.man.y);
            const end=Date.now()+2300;
            await followShield(state=>state.mode==='WON'||Date.now()>end,{x:s.door.x,y:s.door.y});
        }
        await page.waitForFunction(()=> window.__mobileGame.gameState.mode==='WON',{},{timeout:2500});
        await cancel();assert.equal((await state()).deaths,0);
        await page.screenshot({path:`${artifacts}/hard-${level}-complete.png`});
        report.checks.push(`Hard ${level}: two-finger live puzzle and rescue complete`);
        await page.evaluate(async()=> (await import('/src/ui/account.ts')).closePanel());
    }
    await enter(1,'easy');await page.locator('#play-button').tap();
    await down(1,(await state()).prism.x,(await state()).prism.y);
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(150);
    assert.equal((await state()).mode,'PLAYING','rotation preserves attempt');
    await cancel();await page.locator('#hud-menu-button').tap();
    assert.ok(await page.locator('dialog[open]').isVisible());
    await page.screenshot({path:`${artifacts}/landscape-pause.png`});
    assert.equal(await page.evaluate(()=>window.__cameraRequests),0);
    assert.equal(requested.some(url=>/\/src\/three\/|mediapipe|cdn\.tailwindcss/.test(url)),false);
    assert.deepEqual(report.errors,[]);
    report.checks.push('Rotation preserves state; no camera, MediaPipe, Tailwind runtime or Three.js loaded');
    report.checks.push('Profile, leaderboard and touch-only settings fit 320px phone dialogs');
    await writeFile(`${artifacts}/report.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report.checks,null,2));
} finally {
    await browser?.close();
    await server.close();
}
