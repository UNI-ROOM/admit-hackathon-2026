import * as THREE from 'three';
import { Workshop, buildPanda, buildPrism, buildReceiver, buildDoor, buildRobot } from './models';
import { Level3DRules, TARGET, PRISM_START, PANDA_START, DOOR, emptyInput, type Input3D, type Difficulty3D } from './rules';
import type { HandLandmarks } from '../hands';
import { getSettings } from '../settings';
import { pointerHandPose, trackedHandPose, StableHandControl, tabletopHandBasis, pettingHandOrigin } from './hand-pose';
import { PandaRotation } from './panda-rotation';
import { playSfx } from '../audio';
import { buildTerrain } from './terrain';
import { buildMechanisms } from './mechanisms';
import { surfaceHeight } from './surfaces';
import { UPPER_TARGET, LIFT_CENTER, SURFACES } from './level-layout';
import { t } from '../i18n';
import { isPointing } from '../utils';
import './style.css';
import './feedback.css';

export interface MountOptions { onExit?: () => void; onCameraRequest?: () => void | boolean | Promise<void | boolean> }

export function mountLevel3D(container: HTMLElement, difficulty: Difficulty3D, options: MountOptions = {}): { dispose(): void } {
    const host = document.createElement('section'); host.className = 'echo3d'; host.setAttribute('aria-label', 'ECHO 3D laboratory');
    const text = (key: string) => t(`e3.${key}`);
    host.innerHTML = `
    <div class="e3-top"><div><div class="e3-brand">${text('brand')}</div><h1 class="e3-title">${text('title')}</h1><div class="e3-subtitle">${text('subtitle')}</div></div>
    <div class="e3-actions"><span class="e3-mode">${difficulty === 'easy' ? 'SIMPLE · ONE HAND' : 'HARD · TWO HANDS'}</span><button data-action="restart">${text('restart')}</button><button data-action="pause">${text('pause')}</button><button data-action="exit">${text('menu')}</button></div></div>
    <aside class="e3-side"><div class="e3-side-title">${text('next')}</div><div class="e3-task"></div><div class="e3-charge"><div class="e3-charge-fill"></div></div><div class="e3-charge-label"><span>${text('chargeLabel')}</span><span class="e3-percent">0%</span></div><div class="e3-live-note">${text(difficulty === 'easy' ? 'noteEasy' : 'noteHard')}</div><div class="e3-power-state"></div><button data-action="lift" hidden>${text('liftButton')}</button><button data-action="bridge" hidden>${text('bridgeButton')}</button></aside>
    <div class="e3-label" data-label="target">${text('socketI')}</div><div class="e3-label" data-label="prism">${text('prism')}</div><div class="e3-label" data-label="panda">${text('panda')}</div><div class="e3-label" data-label="exit">${text('exitLocked')}</div>
    <div class="e3-label" data-label="upper">${text('socketII')}</div><div class="e3-label zone" data-label="lift">${text('liftLabel')}</div><div class="e3-label zone" data-label="gallery">${text('gallery')}</div>
    <div class="e3-bottom"><section class="e3-echo"><div class="e3-echo-head"><span>◌ ${text('memory')}</span><span class="e3-record-status">${text('noMemory')}</span></div><div class="e3-timeline"><div class="e3-timeline-fill"></div></div><div class="e3-echo-buttons"><button class="primary" data-action="record">${text('record')}</button><button class="record" data-action="save" disabled>${text('save')}</button></div><div class="e3-controls">${text('controls')}</div></section>
    <section class="e3-hands"><div class="e3-hands-title">${difficulty === 'easy' ? 'ROBOT OPERATOR' : 'ROBOT OPERATORS'}</div><div class="e3-hand-status"><span><i class="e3-hand-dot"></i>L <span class="e3-status-left">${text('mouseKeys')}</span></span><span ${difficulty === 'easy' ? 'hidden' : ''}><i class="e3-hand-dot right"></i>R <span class="e3-status-right">${text('ready')}</span></span></div><button data-action="camera">${text('camera')}</button><div class="e3-camera-preview" hidden><video muted autoplay playsinline></video><svg viewBox="0 0 160 100" aria-label="Tracked hands"></svg></div><p class="e3-camera-note">${text('cameraNote')}</p></section></div>
    <div class="e3-grip-feedback" data-hand="0" hidden></div><div class="e3-grip-feedback" data-hand="1" hidden></div>
    <div class="e3-toast" hidden></div><div class="e3-overlay" hidden><div class="e3-dialog"><div class="e3-dialog-icon">ECHO / OBSERVATORY</div><h2></h2><p></p><div class="e3-dialog-actions"><button class="primary" data-action="resume">${text('resume')}</button><button data-action="again">${text('restart')}</button><button data-action="exit">${text('menu')}</button></div></div></div>`;
    container.replaceChildren(host);
    const w = new Workshop();
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor('#24182f'); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '3D laboratory. Drag prism and panda, or use keyboard controls.');
    host.prepend(renderer.domElement);
    w.scene.fog = new THREE.Fog('#24182f', 22, 70);
    w.scene.add(new THREE.HemisphereLight('#ffe7d6', '#382347', 1.8));
    const light = new THREE.DirectionalLight('#ffe5c4', 3.1); light.position.set(-4, 10, 6); light.castShadow = true;
    light.shadow.mapSize.set(512, 512); Object.assign(light.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 25 });
    light.shadow.bias = -0.001; light.shadow.normalBias = 0.03; w.scene.add(light);
    const rimLight = new THREE.DirectionalLight('#a7acff', 1.3); rimLight.position.set(5, 5, -7); w.scene.add(rimLight);
    const camera = new THREE.OrthographicCamera(-7, 7, 5, -5, 0.1, 100);
    camera.position.set(0, 10.8, 14.6); camera.lookAt(0, 1.3, 0);
    const terrain = buildTerrain(w);
    const mechanisms = buildMechanisms(w);
    const panda = buildPanda(w), prism = buildPrism(w), receiver = buildReceiver(w), door = buildDoor(w);
    receiver.root.position.set(-.05, 0, .93);
    door.root.position.set(DOOR.x, DOOR.y, DOOR.z);
    const robots = [buildRobot(w, '#769bff', false, -1), buildRobot(w, '#ff876a', false, 1), buildRobot(w, '#c8a0ff', true, -1), buildRobot(w, '#c8a0ff', true, 1)];
    for (const robot of robots) {
        robot.root.rotation.x = Math.PI;
        robot.root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false; });
    }
    const fallbackPoses = robots.map(robot => [false, true].map(pinch => pointerHandPose(robot.side, pinch).map(point => {
        const angle = robot.side * .7, cos = Math.cos(angle), sin = Math.sin(angle);
        return { x: point.x * cos + point.z * sin, y: -point.y, z: point.z * cos - point.x * sin };
    })));
    const handBasis = tabletopHandBasis(Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y));
    const prismHalo = w.ring(prism.root, 0.43, [0, 0.16, 0], '#8c9eff', 0.035);
    const gripHalos = [panda.ring, prismHalo];
    for (const halo of gripHalos) { halo.material = halo.material.clone(); w.resources.add(halo.material as THREE.Material); }
    const rules = new Level3DRules(difficulty);
    const pointerHands: [Input3D, Input3D] = [emptyInput(difficulty === 'easy' ? 0 : -2.6, 2.4), emptyInput(2.6, 2.4)];
    const pettingBlend = robots.map(() => 0);
    const pettingCrown = new THREE.Vector3();
    const cameraHands: [Input3D, Input3D] = [emptyInput(), emptyInput()];
    const pandaRotation = new PandaRotation();
    const cameraControls = [new StableHandControl(), new StableHandControl()];
    const uiDwell: { button: HTMLButtonElement | null; since: number; clicked: boolean }[] = [{ button: null, since: 0, clicked: false }, { button: null, since: 0, clicked: false }];
    const pointerOffsets: ({ x: number; z: number } | null)[] = [null, null];
    const cameraOffsets: ({ x: number; z: number } | null)[] = [null, null];
    let cameraAt = -Infinity, cameraPoseKey = '', selected = 0, paused = false, disposed = false, raf = 0, last = performance.now(), time = 0;
    let previousLaserWarning = false;
    let previousDoor = false, previousWin = false, previousMistakes = 0, previousOwner: number | null = null;
    let victoryAt = -1;
    let frames = 0, fpsSum = 0, width = 1, height = 1, hudAt = 0;
    let cameraState: 'idle' | 'requesting' | 'ready' | 'unavailable' = 'idle';
    let shadowKey = '', performanceTime = 0, performanceFrames = 0, quality = 0, renderDirty = true;
    let pointerSlot: number | null = null;
    let pandaPress: { x: number; y: number; time: number } | null = null;
    const keys = new Set<string>(), cleanups: (() => void)[] = [];
    const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14), hit = new THREE.Vector3();
    const vector = new THREE.Vector3();
    const query = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
    const task = query('.e3-task'), chargeFill = query('.e3-charge-fill'), percent = query('.e3-percent'), recordStatus = query('.e3-record-status'), timeline = query('.e3-timeline-fill');
    const save = query<HTMLButtonElement>('[data-action="save"]'), record = query<HTMLButtonElement>('[data-action="record"]'), toast = query('.e3-toast'), overlay = query('.e3-overlay');
    const labels = ['target', 'prism', 'panda', 'exit', 'upper', 'lift', 'gallery'].map(name => query(`[data-label="${name}"]`));
    const leftStatus = query('.e3-status-left'), rightStatus = query('.e3-status-right');
    const gripLabels = [query('[data-hand="0"]'), query('[data-hand="1"]')];
    const preview = query('.e3-camera-preview'), previewVideo = query<HTMLVideoElement>('.e3-camera-preview video');
    const skeleton = query<SVGSVGElement & HTMLElement>('.e3-camera-preview svg');
    const handEdges = [[0,1,2,3,4], [0,5,6,7,8], [5,9,10,11,12], [9,13,14,15,16], [13,17,18,19,20], [0,17]];
    const skeletonPaths = [0, 1].map(index => handEdges.map(() => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', index ? '#ff876a' : '#769bff');
        path.setAttribute('stroke-width', '2'); skeleton.append(path); return path;
    }));
    function listen(target: EventTarget, event: string, listener: EventListener, options?: AddEventListenerOptions) {
        target.addEventListener(event, listener, options); cleanups.push(() => target.removeEventListener(event, listener, options));
    }
    function resize() {
        width = host.clientWidth || window.innerWidth; height = host.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        const aspect = width / height;
        const halfWidth = Math.max(6.9, 3.75 * aspect), halfHeight = halfWidth / aspect;
        camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
        camera.setViewOffset(width, height, 0, -height * .03, width, height); camera.updateProjectionMatrix();
        renderDirty = true;
    }
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    function screenPoint(clientX: number, clientY: number, index = selected, source = pointerHands): Input3D {
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
        const held = [rules.panda, rules.prism].find(o => o.owner === index);
        if (held) {
            // Keep the cursor on the held deck even where an upper floor overlaps it.
            const elevation = held === rules.panda ? .85 : .55;
            let y = held.y;
            for (let i = 0; i < 3; i++) {
                plane.constant = -(y + elevation);
                raycaster.ray.intersectPlane(plane, hit);
                y = surfaceHeight(held.surface, { x: hit.x, z: hit.z }, rules.terrain);
            }
            return { x: hit.x, z: hit.z, y, surface: held.surface, pinch: source[index].pinch, active: true };
        }
        w.scene.updateMatrixWorld(true);
        const surfaces = terrain.surfaceMeshes.filter(mesh => mesh.userData.surface !== 'bridge' || rules.bridgeLocked);
        const intersections = raycaster.intersectObjects(surfaces, false);
        if (intersections.length) {
            const picked = intersections[0], surface = picked.object.userData.surface;
            return { x: picked.point.x, z: picked.point.z, y: surfaceHeight(surface, { x: picked.point.x, z: picked.point.z }, rules.terrain), surface, pinch: source[index].pinch, active: true };
        }
        plane.constant = 0; raycaster.ray.intersectPlane(plane, hit);
        return { x: hit.x, z: hit.z, y: 0, pinch: source[index].pinch, active: true };
    }
    function pickControl(clientX: number, clientY: number): string | null {
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
        const hit = raycaster.intersectObjects(mechanisms.buttons.filter(button => button.parent?.visible), false)[0];
        return hit?.object.userData.action || null;
    }
    function activate(action: string | null) {
        if (action === 'lift') rules.activateLift();
        if (action === 'bridge') rules.activateBridge();
    }
    function project(x: number, z: number, y = 0.14) {
        vector.set(x, y, z).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: rect.left + (vector.x + 1) * width / 2, y: rect.top + (1 - vector.y) * height / 2 };
    }
    function pickObject(clientX: number, clientY: number) {
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
        w.scene.updateMatrixWorld(true);
        const intersections = raycaster.intersectObjects([panda.root, prism.root], true);
        for (const intersection of intersections) {
            let object: THREE.Object3D | null = intersection.object;
            while (object && object !== panda.root && object !== prism.root) object = object.parent;
            if (object === panda.root) return rules.panda;
            if (object === prism.root) return rules.prism;
        }
        // A modest halo also catches a returning spring and imperfect hand tracking.
        const candidates = [rules.panda, rules.prism].map(o => {
            const center = project(o.x, o.z, o.y + (o === rules.panda ? .85 : .55));
            const edge = project(o.x + .43, o.z, o.y + .55);
            return { o, distance: Math.hypot(center.x - clientX, center.y - clientY), radius: Math.abs(edge.x - center.x) };
        }).filter(c => c.distance < c.radius).sort((a, b) => a.distance - b.distance);
        return candidates[0]?.o || null;
    }
    function updatePointer(event: PointerEvent) {
        const index = pointerSlot ?? selected, point = screenPoint(event.clientX, event.clientY, index), offset = pointerOffsets[index];
        const hovered = !pointerHands[index].pinch ? pickObject(event.clientX, event.clientY) : null;
        Object.assign(pointerHands[index], offset ? { x: point.x + offset.x, z: point.z + offset.z } : hovered || point, { active: true });
    }
    listen(renderer.domElement, 'pointermove', ((event: PointerEvent) => { if (!paused && !rules.won) updatePointer(event); }) as EventListener);
    listen(renderer.domElement, 'pointerleave', (() => { if (pointerSlot === null) pointerHands[selected].active = false; }) as EventListener);
    listen(renderer.domElement, 'pointerdown', ((event: PointerEvent) => {
        if (paused || rules.won) return;
        renderer.domElement.focus();
        const control = pickControl(event.clientX, event.clientY);
        if (control) { activate(control); return; }
        pointerSlot = selected;
        const object = pickObject(event.clientX, event.clientY);
        // Pickup uses the same height plane as subsequent moves, preventing a jump.
        if (object) { plane.constant = -(object.y + (object === rules.panda ? .85 : .55)); raycaster.ray.intersectPlane(plane, hit); }
        const floor = object ? { x: hit.x, z: hit.z } : screenPoint(event.clientX, event.clientY);
        pandaPress = object === rules.panda ? { x: event.clientX, y: event.clientY, time: performance.now() } : null;
        pointerOffsets[selected] = object ? { x: object.x - floor.x, z: object.z - floor.z } : null;
        if (object) Object.assign(pointerHands[selected], object, { active: true });
        else updatePointer(event);
        pointerHands[selected].pinch = true;
        rules.hands[selected] = { ...pointerHands[selected] }; rules.step(0);
        renderer.domElement.setPointerCapture(event.pointerId);
    }) as EventListener);
    const releasePointer = (event?: PointerEvent) => {
        if (event?.type === 'pointerup' && pandaPress && !paused && !rules.won && performance.now() - pandaPress.time < 350 && Math.hypot(event.clientX - pandaPress.x, event.clientY - pandaPress.y) < 8) panda.animator.pet();
        pandaPress = null;
        if (pointerSlot !== null) { pointerHands[pointerSlot].pinch = false; pointerOffsets[pointerSlot] = null; } pointerSlot = null; };
    listen(window, 'pointerup', releasePointer as EventListener);
    listen(renderer.domElement, 'wheel', ((event: WheelEvent) => {
        if (paused || rules.won || (rules.panda.owner === null && pickObject(event.clientX, event.clientY) !== rules.panda)) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
        pandaRotation.turn(Math.max(-.45, Math.min(.45, delta * .006)));
    }) as EventListener, { passive: false });
    listen(renderer.domElement, 'pointercancel', releasePointer as EventListener);
    function setPaused(value: boolean) {
        paused = value; renderDirty = true; pointerSlot = null; pointerOffsets.fill(null); keys.clear(); pointerHands.forEach(hand => { hand.pinch = false; });
        if (rules.won) return;
        overlay.hidden = !paused; query('.e3-dialog h2').textContent = text('pauseTitle');
        query('.e3-dialog-icon').textContent = 'ECHO LAB / 01';
        query('.e3-dialog p').textContent = text('pauseNote');
        query('[data-action="resume"]').hidden = false;
    }
    function restart() { pettingBlend.fill(0); rules.reset(); panda.animator.reset(); pandaRotation.reset(); pandaPress = null; victoryAt = -1; delete overlay.dataset.victory; pointerSlot = null; pointerOffsets.fill(null); cameraOffsets.fill(null); cameraControls.forEach(control => control.reset()); pointerHands.forEach(hand => { hand.pinch = false; hand.active = false; }); keys.clear(); paused = false; overlay.hidden = true; previousWin = previousDoor = false; previousMistakes = 0; }
    function begin() { rules.beginRecording(); pointerOffsets.fill(null); cameraOffsets.fill(null); pointerHands.forEach(hand => { hand.pinch = false; }); paused = false; overlay.hidden = true; previousWin = false; }
    function finish() { if (rules.finishRecording()) pointerHands.forEach(hand => { hand.pinch = false; hand.active = false; }); }
    listen(window, 'keydown', ((event: KeyboardEvent) => {
        if (disposed || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
        if (event.repeat && ['r', 'f', ' ', 'escape'].includes(key)) return;
        if (key === 'escape') { setPaused(!paused); return; }
        if (paused || rules.won) return;
        if (key === 'r') begin();
        else if (key === ' ') finish();
        else if (key === 'enter') activate(rules.canLift ? 'lift' : rules.canBridge ? 'bridge' : null);
        else if (key === '1' || (key === '2' && rules.handCount === 2)) selected = Number(key) - 1;
        else if (key === 'f') {
            const hand = pointerHands[selected]; hand.active = true; hand.pinch = !hand.pinch;
            const near = [rules.panda, rules.prism].find(o => Math.hypot(o.x - hand.x, o.z - hand.z) < .5);
            if (near) { hand.y = near.y; hand.surface = near.surface; }
        }
        keys.add(key);
    }) as EventListener);
    listen(window, 'keyup', ((event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); }) as EventListener);
    listen(window, 'blur', (() => { if (!rules.won) setPaused(true); }) as EventListener);
    listen(document, 'visibilitychange', (() => { if (document.hidden && !rules.won) setPaused(true); }) as EventListener);
    listen(window, 'echo:hands', ((event: CustomEvent<[HandLandmarks | null, HandLandmarks | null]>) => {
        if (!Array.isArray(event.detail)) return;
        const incoming = difficulty === 'easy' ? [event.detail[0] || event.detail[1], null] : event.detail;
        const sourceVideo = document.getElementById('webcam') as HTMLVideoElement | null;
        const aspect = sourceVideo?.videoWidth && sourceVideo.videoHeight ? sourceVideo.videoWidth / sourceVideo.videoHeight : 1280 / 720;
        const poseKey = `${getSettings().mirror}:${aspect}`;
        const lostTracking = performance.now() - cameraAt > 350 || poseKey !== cameraPoseKey;
        cameraPoseKey = poseKey;
        preview.style.aspectRatio = String(aspect); preview.style.height = 'auto';
        skeleton.setAttribute('preserveAspectRatio', 'none');
        cameraAt = performance.now();
        for (let i = 0; i < 2; i++) {
            const hand = incoming[i];
            const pose = hand ? trackedHandPose(hand, getSettings().mirror, aspect, handBasis) : null;
            if (!hand || !pose) { uiDwell[i].button?.classList.remove('hand-hover'); uiDwell[i].button = null; cameraHands[i].active = false; cameraHands[i].pinch = false; cameraHands[i].pose = undefined; cameraOffsets[i] = null; cameraControls[i].reset(); skeletonPaths[i].forEach(path => path.setAttribute('points', '')); continue; }
            if (lostTracking) cameraControls[i].reset();
            const controlled = cameraControls[i].update(hand, pose);
            const point = controlled.point, tip = hand[8], thumb = hand[4], rect = renderer.domElement.getBoundingClientRect();
            const x = getSettings().mirror ? 1 - point.x : point.x;
            const clientX = rect.left + x * rect.width, clientY = rect.top + point.y * rect.height;
            const mapped = screenPoint(clientX, clientY, i, cameraHands);
            const palmSize = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
            const ratio = Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / Math.max(0.06, palmSize);
            const pinch = ratio < (cameraHands[i].pinch ? 0.62 : 0.44);
            const button = document.elementFromPoint(clientX, clientY)?.closest('button');
            const ui = uiDwell[i];
            const target = button instanceof HTMLButtonElement && host.contains(button) && !button.disabled ? button : null;
            if (target !== ui.button) { ui.button?.classList.remove('hand-hover'); ui.button = target; ui.since = performance.now(); ui.clicked = false; }
            if (target) {
                target.classList.add('hand-hover');
                if (!ui.clicked && ((pinch && !cameraHands[i].pinch) || (isPointing(hand) && performance.now() - ui.since > 1000))) {
                    ui.clicked = true; target.click();
                    if (disposed) return;
                }
                cameraHands[i].active = false; cameraHands[i].pinch = pinch;
                continue;
            }
            if (paused || rules.won) continue;
            if (!pinch) cameraOffsets[i] = null;
            if (pinch && !cameraHands[i].pinch && ![rules.panda, rules.prism].some(o => o.owner === i)) activate(pickControl(clientX, clientY));
            const hovered = pickObject(clientX, clientY);
            if (hovered && hovered.owner === null && pinch && !cameraOffsets[i]) {
                plane.constant = -(hovered.y + (hovered === rules.panda ? .85 : .55));
                raycaster.ray.intersectPlane(plane, hit); mapped.x = hit.x; mapped.z = hit.z;
            }
            if (pinch && !cameraOffsets[i] && hovered && (hovered.owner === null || hovered.owner === i)) cameraOffsets[i] = { x: hovered.x - mapped.x, z: hovered.z - mapped.z };
            if (cameraOffsets[i]) { mapped.x += cameraOffsets[i]!.x; mapped.z += cameraOffsets[i]!.z; }
            else if (!pinch && hovered) { Object.assign(mapped, { x: hovered.x, z: hovered.z, y: hovered.y, surface: hovered.surface }); }
            if (!cameraHands[i].active) Object.assign(cameraHands[i], mapped);
            else { cameraHands[i].x += (mapped.x - cameraHands[i].x) * 0.45; cameraHands[i].z += (mapped.z - cameraHands[i].z) * 0.45; }
            Object.assign(cameraHands[i], { active: true, pinch, y: hovered?.y ?? mapped.y, surface: mapped.surface, pose: controlled.pose });
            skeletonPaths[i].forEach((path, edge) => path.setAttribute('points', handEdges[edge].map(index => `${(getSettings().mirror ? 1 - hand[index].x : hand[index].x) * 160},${hand[index].y * 100}`).join(' ')));
        }
    }) as EventListener);
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-action]')) {
        const action = button.dataset.action;
        listen(button, action === 'save' ? 'pointerdown' : 'click', (() => {
            if (action === 'exit') options.onExit?.();
            else if (action === 'restart' || action === 'again') restart();
            else if (action === 'pause') setPaused(!paused);
            else if (action === 'resume') setPaused(false);
            else if (action === 'record') begin();
            else if (action === 'save') finish();
            else if (action === 'lift' || action === 'bridge') activate(action);
            else if (action === 'camera') {
                cameraState = 'requesting';
                query('.e3-camera-note').textContent = text('cameraAllow');
                Promise.resolve(options.onCameraRequest?.()).then(result => {
                    if (disposed) return;
                    cameraState = result === false ? 'unavailable' : 'ready';
                    if (result === false) query('.e3-camera-note').textContent = text('cameraUnavailable');
                }).catch(() => {
                    if (disposed) return;
                    cameraState = 'unavailable'; query('.e3-camera-note').textContent = text('cameraUnavailable');
                });
            }
        }) as EventListener);
    }
    listen(save, 'click', finish as EventListener);
    function label(element: HTMLElement, x: number, z: number, y = 0.15) {
        const p = project(x, z, y), rect = host.getBoundingClientRect();
        element.style.left = `${p.x - rect.left}px`; element.style.top = `${p.y - rect.top}px`;
    }
    function updateHud(now: number) {
        if (now - hudAt < 100) return; hudAt = now;
        host.dataset.stage = rules.stage;
        task.textContent = text(rules.stage);
        chargeFill.style.width = `${rules.charge * 100}%`; percent.textContent = `${Math.round(rules.charge * 100)}%`;
        recordStatus.textContent = rules.recording ? `REC ${rules.recordTime.toFixed(1)} / 8s` : rules.echoReady ? text(rules.echoTime < rules.echoDuration ? 'playing' : 'holding') : text('noMemory');
        timeline.style.width = `${rules.recording ? rules.recordTime / 8 * 100 : rules.echoReady ? Math.min(100, rules.echoTime / rules.echoDuration * 100) : 0}%`;
        save.disabled = !rules.canSave; record.disabled = !rules.lowerPowered || rules.won;
        record.textContent = text(rules.echoReady || rules.recording ? 'recordAgain' : 'record');
        query('[data-action="lift"]').hidden = !rules.canLift;
        query('[data-action="bridge"]').hidden = !rules.canBridge;
        query('.e3-power-state').textContent = !rules.lowerPowered ? '' : rules.bridgeLocked ? `${text(rules.laserActive ? 'laserOn' : rules.laserWarning ? 'laserWarn' : 'laserSafe')} · ${rules.laserRemaining.toFixed(1)}s` : text(rules.powered ? 'powerOn' : 'powerOff');
        query('.e3-power-state').dataset.danger = String(rules.laserActive || rules.laserWarning);
        toast.hidden = rules.messageTime <= 0; toast.textContent = t(rules.message);
        for (const [index, status] of [leftStatus, rightStatus].entries()) {
            const held = rules.panda.owner === index ? text('panda') : rules.prism.owner === index ? text('prism') : '';
            status.textContent = rules.won ? text('rescued') : held ? t('e3.holdingObject', { object: held }) : cameraHands[index].active && now - cameraAt < 350 ? text(cameraHands[index].pinch ? 'pinch' : 'openHand') : selected === index ? text('mouseKeys') : text('ready');
            status.dataset.holding = held ? 'true' : 'false';
            const hand = rules.hands[index];
            if (index >= rules.handCount) { gripLabels[index].hidden = true; continue; }
            const hovered = hand.active ? [rules.panda, rules.prism].find(object => Math.hypot(object.x - hand.x, object.z - hand.z) < 0.58 && object.owner === null) : null;
            const gripLabel = gripLabels[index];
            gripLabel.hidden = rules.won || !hand.active || (hand.pinch && !held && !hovered);
            gripLabel.textContent = `${index ? 'R' : 'L'} · ` + (held ? t('e3.holdingObject', { object: held }) : hovered ? t('e3.pinchObject', { object: text(hovered === rules.panda ? 'panda' : 'prism') }) : text(hand.pinch ? 'pinch' : 'openHand'));
            gripLabel.dataset.holding = held ? 'true' : 'false';
            const robot = robots[index], rect = host.getBoundingClientRect();
            const anchor = project(hand.x, hand.z, hand.y ?? 0);
            let handTop = Infinity;
            for (const point of robot.getPose()) {
                handTop = Math.min(handTop, project(robot.root.position.x + point.x, robot.root.position.z - point.z, robot.root.position.y - point.y).y);
            }
            gripLabel.style.left = `${anchor.x - rect.left}px`;
            gripLabel.style.top = `${Math.max(rect.top + 112, handTop - 9) - rect.top}px`;
        }
        const sourceVideo = document.getElementById('webcam') as HTMLVideoElement | null;
        if (sourceVideo?.srcObject && previewVideo.srcObject !== sourceVideo.srcObject) {
            previewVideo.srcObject = sourceVideo.srcObject; preview.hidden = false;
            previewVideo.style.transform = getSettings().mirror ? 'scaleX(-1)' : '';
            void previewVideo.play().catch(() => {});
        }
        if (cameraState === 'ready') query('.e3-camera-note').textContent = text(cameraHands.some(hand => hand.active) && now - cameraAt < 350 ? 'cameraNote' : 'cameraWait');
        labels[3].textContent = text(rules.doorOpen ? 'exitOpen' : 'exitLocked');
        labels[1].textContent = (rules.echoReady ? 'ECHO · ' : '') + text('prism');
        labels[0].hidden = rules.lowerPowered;
        label(labels[0], TARGET.x, TARGET.z, .35); label(labels[1], rules.prism.x, rules.prism.z, rules.prism.y + 1.15);
        labels[2].hidden = rules.won; label(labels[2], rules.panda.x, rules.panda.z, rules.panda.y + 1.65);
        label(labels[3], DOOR.x, DOOR.z, DOOR.y + 2.0);
        labels[4].hidden = !rules.lowerPowered || rules.bridgeLocked; label(labels[4], UPPER_TARGET.x, UPPER_TARGET.z, .48);
        labels[5].hidden = rules.liftHeight > 1.79; label(labels[5], LIFT_CENTER.x, LIFT_CENTER.z, rules.liftHeight + .2);
        labels[6].hidden = rules.liftHeight < 1.79 || rules.bridgeLocked; label(labels[6], 2.1, -1.6, 1.95);
    }
    function isPettingHand(hand: Input3D) {
        return !rules.won && rules.panda.owner === null && hand.active && !hand.pinch
            && Math.hypot(hand.x - rules.panda.x, hand.z - rules.panda.z) < .58;
    }
    function tick(now: number) {
        if (disposed) return;
        const frameSeconds = (now - last) / 1000;
        const dt = Math.min(frameSeconds, 0.05); last = now;
        if (!document.hidden && (!paused || renderDirty)) {
            if (!paused) time += dt;
            if (!paused && !rules.won) {
                const hand = pointerHands[selected], speed = 2.7 * dt;
                const dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
                const dz = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
                if (dx || dz) { hand.active = true; hand.x = Math.max(-3.8, Math.min(3.8, hand.x + dx * speed)); hand.z = Math.max(-2.1, Math.min(2.2, hand.z + dz * speed)); }
                rules.hands = pointerHands.map((mouse, index) => cameraHands[index].active && now - cameraAt < 350 && !mouse.pinch ? { ...cameraHands[index] } : { ...mouse }) as [Input3D, Input3D];
                rules.step(dt);
            }
            panda.root.position.set(rules.panda.x, rules.panda.y, rules.panda.z);
            const nearbyHand = rules.hands.find(hand => hand.active && Math.hypot(hand.x - rules.panda.x, hand.z - rules.panda.z) < 1.2);
            if (!paused && !rules.won) {
                const owner = rules.panda.owner;
                pandaRotation.update(owner, owner === null ? undefined : [...rules.hands, ...rules.ghosts][owner]?.pose);
                if (owner !== null || nearbyHand) pandaRotation.turn((Number(keys.has('e')) - Number(keys.has('q'))) * dt * 2.4);
            }
            panda.animator.update(paused ? 0 : dt, {
                x: rules.panda.x, z: rules.panda.z, held: rules.panda.owner !== null,
                hovered: !!nearbyHand,
                petting: rules.hands.some(isPettingHand),
                charge: rules.charge, ready: rules.doorOpen,
                mistakes: rules.mistakes, won: rules.won,
                lookX: nearbyHand?.x ?? rules.prism.x, lookZ: nearbyHand?.z ?? rules.prism.z, rotation: rules.won ? 0 : pandaRotation.angle
            });
            for (const [index, object] of [rules.panda, rules.prism].entries()) {
                const hovered = rules.hands.some(hand => hand.active && Math.hypot(hand.x - object.x, hand.z - object.z) < 0.58);
                const halo = gripHalos[index], material = halo.material as THREE.MeshStandardMaterial;
                halo.scale.setScalar(object.owner !== null ? 1.25 : hovered ? 1.14 : 1);
                const color = object.owner === 0 ? '#769bff' : object.owner === 1 ? '#ff876a' : object.owner !== null ? '#c8a0ff' : '#b69ad8';
                material.color.set(color); material.emissive.set(color); material.emissiveIntensity = object.owner !== null ? 1.7 : hovered ? 1.1 : 0.4;
            }
            prism.root.position.set(rules.prism.x, rules.prism.y, rules.prism.z); prism.crystal.rotation.y = Math.PI / 2 + Math.sin(time) * 0.04;
            receiver.crystal.rotation.y = time * 0.15; receiver.ring.visible = rules.charge > 0.05;
            receiver.crystal.scale.setScalar(0.9 + rules.charge * 0.2); receiver.crystal.scale.y *= 1.3;
            const receiverMat = receiver.crystal.material as THREE.MeshStandardMaterial; receiverMat.emissiveIntensity = 0.1 + rules.charge * 1.7;
            door.panels.forEach((panel, i) => { const side = i ? 1 : -1; panel.position.x += (side * (rules.doorOpen ? 0.72 : 0.29) - panel.position.x) * 0.12; });
            door.ring.visible = rules.doorOpen;
            terrain.update(rules, time); mechanisms.update(rules);
            pettingCrown.set(0, .43, 0);
            panda.head.localToWorld(pettingCrown);
            [...rules.hands, ...rules.ghosts].forEach((input, index) => {
                const robot = robots[index], ghost = index >= 2;
                robot.root.visible = robot.cursor.visible = !rules.won && index % 2 < rules.handCount && (ghost ? input.active && rules.echoReady : true);
                const x = input.active ? input.x : difficulty === 'easy' ? 0 : index % 2 ? 2.6 : -2.6, z = input.active ? input.z : 2.55;
                const held = [rules.panda, rules.prism].find(object => object.owner === index);
                const pose = input.pose || fallbackPoses[index][Number(input.pinch)];
                const floorY = held?.y ?? input.y ?? 0;
                robot.setPose(pose, 1 - Math.exp(-20 * dt));
                const stroke = !ghost && isPettingHand(input);
                if (held || input.pinch || !input.active || rules.won) pettingBlend[index] = 0;
                else pettingBlend[index] += (Number(stroke) - pettingBlend[index]) * (1 - Math.exp(-12 * (paused ? 0 : dt)));
                if (pettingBlend[index] < .001) pettingBlend[index] = 0;
                const amount = pettingBlend[index];
                const aboveHead = amount ? pettingHandOrigin(robot.getPose(), pettingCrown) : null;
                robot.root.position.set(
                    x + ((aboveHead?.x ?? x) - x) * amount,
                    floorY + .68 + ((aboveHead?.y ?? (floorY + .68)) - (floorY + .68)) * amount,
                    z + ((aboveHead?.z ?? z) - z) * amount
                );
                robot.cursor.position.set(x, floorY + .17, z); robot.cursor.scale.setScalar(held ? 1.6 : input.pinch ? 1.15 : 1);
            });
            if (rules.laserWarning && !previousLaserWarning && !paused) playSfx('switch');
            previousLaserWarning = rules.laserWarning;
            if (rules.prism.owner !== previousOwner && rules.prism.owner !== null) playSfx('grab'); previousOwner = rules.prism.owner;
            if (rules.mistakes > previousMistakes) playSfx('burn'); previousMistakes = rules.mistakes;
            if (rules.doorOpen && !previousDoor) playSfx('crystal_ready'); previousDoor = rules.doorOpen;
            if (rules.won && !previousWin) {
                playSfx('win'); previousWin = true; victoryAt = time; overlay.dataset.victory = 'true';
                query('.e3-dialog-icon').textContent = 'MEMORY + YOU = TEAM'; query('.e3-dialog h2').textContent = text('victory');
                query('.e3-dialog p').textContent = t('e3.result', { time: Math.floor(rules.elapsed), mistakes: rules.mistakes, method: text(rules.echoReady ? 'echoMethod' : 'handsMethod') });
                query('[data-action="resume"]').hidden = true;
            }
            if (rules.won && time - victoryAt > 1.1) overlay.hidden = false;
            const currentShadowKey = `${Math.floor(time * 12)}:${rules.panda.x.toFixed(2)}:${rules.panda.z.toFixed(2)}:${rules.prism.x.toFixed(2)}:${rules.prism.z.toFixed(2)}:${rules.doorOpen}:${rules.liftHeight.toFixed(2)}:${rules.bridgeProgress.toFixed(2)}`;
            if (currentShadowKey !== shadowKey) { renderer.shadowMap.needsUpdate = true; shadowKey = currentShadowKey; }
            updateHud(now); renderer.render(w.scene, camera); renderDirty = false; frames++; fpsSum += frameSeconds;
            if (!paused && frameSeconds < 0.5) {
                performanceTime += frameSeconds; performanceFrames++;
                if (performanceTime > 2) {
                    const measuredFps = performanceFrames / performanceTime;
                    if (measuredFps < 43 && quality < 3) {
                        quality++; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1.5, 0.9, 0.72, 0.6][quality])); resize();
                    }
                    performanceTime = performanceFrames = 0;
                }
            }
        }
        raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    const debug = { rules, project, getPandaAnimation: () => ({ mood: panda.animator.mood, rotation: pandaRotation.angle, facing: panda.body.rotation.y, playful: panda.animator.playful, petting: panda.animator.petting, eyes: panda.animator.eyeOpenness, crown: { x: pettingCrown.x, y: pettingCrown.y, z: pettingCrown.z }, elapsed: panda.animator.elapsed, lift: panda.body.position.y, head: panda.head.rotation.toArray() }), getHandPoses: () => robots.map(robot => ({ visible: robot.root.visible, position: { x: robot.root.position.x, y: robot.root.position.y, z: robot.root.position.z }, pose: robot.getPose().map(point => ({ x: point.x, y: -point.y, z: -point.z })) })), getMetrics: () => ({ fps: fpsSum ? frames / fpsSum : 0, handCount: rules.handCount, liveRobots: robots.slice(0, 2).filter(robot => robot.root.visible).length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio(), quality, paused, disposed }), starts: { prism: PRISM_START, panda: PANDA_START, target: TARGET, upper: UPPER_TARGET, lift: LIFT_CENTER, door: DOOR }, surfaces: SURFACES };
    const debugWindow = window as unknown as { __echo3D?: typeof debug };
    if (import.meta.env.DEV) debugWindow.__echo3D = debug;
    return { dispose() {
        if (disposed) return; disposed = true; cancelAnimationFrame(raf); observer.disconnect(); cleanups.forEach(cleanup => cleanup());
        keys.clear(); previewVideo.pause(); previewVideo.srcObject = null; w.dispose(); renderer.dispose(); renderer.forceContextLoss(); host.remove();
        if (debugWindow.__echo3D === debug) delete debugWindow.__echo3D;
    } };
}
