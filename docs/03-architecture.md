# 03 — Архитектура

## 1. Выбор стека (и почему)

| Вопрос | Выбор | Отклонено | Почему |
|---|---|---|---|
| Трекер | **`@mediapipe/tasks-vision` → `PoseLandmarker`**, модель `pose_landmarker_lite`, delegate `GPU`, `runningMode: 'VIDEO'` | `@mediapipe/pose` (legacy, как в текущем index.html с Hands) — заморожен, нет TS-типов, хуже перф. `Hands` — не видит тело. `Holistic` — тяжёлый, не нужен. TF.js MoveNet — тоже норм, но Pose даёт 33 точки и стабильнее на руках | Lite даёт 25–30 fps на ноутбуке с GPU, точек хватает: плечи, запястья, таз, колени |
| Сборка | **Vite + TypeScript** | CRA/Next — лишнее; «без сборки» — нет модулей и типов | `npm create vite@latest echo -- --template vanilla-ts`, деплой — статический `dist/` |
| UI | **Один `<canvas>` для игры + минимальный DOM-оверлей для меню/подсказок** | React — ререндеры в игровом цикле мешают; Phaser/Pixi — учить API дольше, чем нарисовать 5 прямоугольников и скелет | Игра — 5 дорожек и линии, canvas 2D хватает |
| Состояние | Простой конечный автомат сцен | Redux и т.п. | Сцены: `boot → menu → calibrate → tutorial → play(level, round) → rewind → results` |
| Хранение | `localStorage` | бэкенд | Рекорды и последняя калибровка |
| Деплой | GitHub Pages (`vite build --base=/repo/`) или Vercel | — | HTTPS обязателен для `getUserMedia` |

Подключение модели:
```ts
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
const vision = await FilesetResolver.forVisionTasks(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
const landmarker = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    delegate: 'GPU',
  },
  runningMode: 'VIDEO',
  numPoses: 1,
});
// в цикле:
if (video.currentTime !== lastVideoTime) {
  const res = landmarker.detectForVideo(video, performance.now());
  const lm = res.landmarks[0]; // 33 × {x,y,z,visibility}
}
```
Зафиксировать версию `@mediapipe/tasks-vision` в package.json и в URL wasm (не `latest`) перед сдачей — чтобы у жюри ничего не сломалось.

## 2. Структура проекта

```
echo/
├─ index.html
├─ src/
│  ├─ main.ts                 # boot: камера, модель, запуск SceneManager
│  ├─ core/
│  │  ├─ clock.ts             # время раунда (pause/resume), fixed-step тики
│  │  ├─ scenes.ts            # конечный автомат сцен
│  │  └─ events.ts            # простой EventEmitter (lever:on, hit, hint, ...)
│  ├─ tracking/
│  │  ├─ camera.ts            # getUserMedia, facingMode user, зеркалирование
│  │  ├─ poseTracker.ts       # обёртка над PoseLandmarker → Landmarks | null
│  │  ├─ smoothing.ts         # EMA по точкам + гистерезис булевых состояний
│  │  ├─ calibration.ts       # standHipY, torso, видимость ног
│  │  └─ poseState.ts         # Landmarks → PoseState (СВОЙ распознаватель)
│  ├─ echo/
│  │  ├─ recorder.ts          # запись кадров раунда
│  │  ├─ playback.ts          # выборка кадра по t + интерполяция
│  │  └─ timeline.ts          # «сухой» прогон записи → таймлайн действий для экрана Перемотки
│  ├─ game/
│  │  ├─ types.ts             # Level, Actor, PoseState, WorldState
│  │  ├─ levels.ts            # данные уровней L0–L3
│  │  ├─ rules.ts             # evaluate(level, actors, t) → WorldState (рычаги, двери, лучи, поражения, победа)
│  │  ├─ hints.ts             # режим «ошибка»: правила → Hint[] с приоритетом
│  │  ├─ score.ts
│  │  └─ storage.ts           # рекорды, калибровка
│  ├─ render/
│  │  ├─ renderer.ts          # кадр: фон, дорожки, объекты, лучи, актёры, HUD
│  │  ├─ skeleton.ts          # рисование скелета по 33 точкам (живой / эхо с alpha)
│  │  ├─ effects.ts           # частицы, вспышки, щит
│  │  └─ ui.ts                # DOM-оверлей: кнопки с dwell, подсказки, таймлайн
│  └─ audio/sfx.ts            # WebAudio-синтез
├─ docs/                      # эти документы
└─ README.md
```

## 3. Модель данных

```ts
// 33 точки × (x, y, z, visibility) — плоский массив, дешёво копировать
type Landmarks = Float32Array; // length 132
const P = { NOSE:0, L_SHOULDER:11, R_SHOULDER:12, L_ELBOW:13, R_ELBOW:14,
            L_WRIST:15, R_WRIST:16, L_HIP:23, R_HIP:24, L_KNEE:25, R_KNEE:26,
            L_ANKLE:27, R_ANKLE:28 } as const;

interface Frame { t: number; lm: Landmarks }          // t — секунды от начала раунда
interface Recording { frames: Frame[]; duration: number; echoIndex: number }

interface Calibration { standHipY: number; torso: number; legsVisible: boolean }

// Результат СВОЕГО распознавателя. Одинаков для человека и Эхо.
interface PoseState {
  visible: boolean;           // достаточно точек с visibility > 0.5
  x: number;                  // центр таза, 0..1 (уже зеркальный)
  lane: number;               // 1..5
  armUp: { left: boolean; right: boolean };
  crouch: boolean;
  shield: boolean;
  bothUp: boolean;
  // «сырые» величины для подсказок:
  raw: {
    wristAboveHead: { left: number; right: number }; // в долях торса, >0 = выше
    crouchDepth: number;      // в долях торса
    wristGap: number;         // расстояние между запястьями / торс
    wristsCrossed: boolean;
    distToLaneCenter: number; // для «шагни левее»
  };
}

interface Actor { id: 'player' | `echo${number}`; state: PoseState; stunnedUntil: number; color: string }

interface WorldState {
  levers: Record<string, boolean>; plates: Record<string, boolean>;
  doors: Record<string, boolean>;
  laserStops: Record<string, number>;   // до какой дорожки дошёл луч
  hits: string[];                       // id актёров под лучом
  exitProgress: number;                 // 0..1 удержания на выходе
  won: boolean;
}
```

Уровни — данные:
```ts
const L1: Level = {
  id: 'door', name: 'Дверь', roundSec: 20, maxEchoes: 1, startLane: 3,
  objects: [
    { type: 'lever', id: 'lv1', lane: 1, hand: 'any' },
    { type: 'door',  id: 'd1',  lane: 5, openedBy: ['lv1'], mode: 'all' },
    { type: 'exit',  lane: 5, door: 'd1', holdSec: 1 },
  ],
};
```

## 4. Игровой цикл раунда

```
requestAnimationFrame(loop):
  1. tracker.update(video)            → Landmarks | null   (≈30 fps, пропускаем, если кадр видео не сменился)
  2. smoothing.apply(lm)              → EMA α≈0.5
  3. t = clock.roundTime()            // секунды с начала раунда
  4. recorder.push({t, lm})           // только если lm != null; при паузе трекинга — предыдущий кадр
  5. actors = [
       { id:'player', state: recognize(lm, calib) },
       ...recordings.map((rec,i) => ({ id:`echo${i+1}`, state: recognize(playback.sample(rec, t), calib) }))
     ]
  6. world = rules.evaluate(level, actors, t, prevWorld)
  7. hints = hints.evaluate(level, actors, world, recordings, t)   // режим «ошибка»
  8. renderer.draw(video, level, actors, world, hints, t)
  9. if (world.won) → finishLevel();  else if (t >= roundSec) → finishRound()
```

Принципы:
- **Одна функция `recognize()` для всех актёров.** Клон — это просто другой источник `Landmarks`.
- **Один клок раунда.** Запись хранит `t` относительно старта раунда, воспроизведение — по этому же `t`. Никаких `Date.now()` внутри геймплея.
- Запись пишем не чаще 20 fps (проверка `t - lastT >= 0.05`), чтобы 20 с раунда = 400 кадров ≈ 200 КБ. Три Эхо — 600 КБ. Норм.
- Если трекер потерял тело (нет `lm`), в запись кладём **последний известный кадр** с флагом `lost: true` — Эхо не должно исчезать с экрана; в подсказку игроку идёт «Тебя не видно».
- Стан: актёр со `stunnedUntil > t` не учитывается в рычагах/плитах/щите, рисуется серым.

Воспроизведение:
```ts
sample(rec, t): Landmarks {
  // бинарный поиск кадра i: frames[i].t <= t < frames[i+1].t; лерп по 132 числам
  // t > duration → последний кадр (Эхо «замирает» в конечной позе; можно уводить в fade)
}
```

## 5. Распознаватель поз

Все координаты **уже зеркалены** (`x = 1 - x`), чтобы «влево» совпадало с экраном.

```ts
const torso = dist(mid(L_SHOULDER,R_SHOULDER), mid(L_HIP,R_HIP));  // в калибровке; в раунде брать max(calib.torso*0.7, текущий)
const headY = nose.y - 0.35*torso;                                  // макушка ≈ выше носа
// Рука вверх (y растёт вниз!)
wristAboveHead.left  = (headY - lWrist.y) / torso;    // > 0 → выше макушки
armUp.left = hyst(wristAboveHead.left, on: 0.05, off: -0.15);
// Присед — от калиброванной стойки
crouchDepth = (midHip.y - calib.standHipY) / calib.torso;
crouch = hyst(crouchDepth, on: 0.35, off: 0.20);
//   fallback, если ног не видно (сидит за столом): по плечам: (midShoulder.y - calib.standShoulderY)/torso, порог 0.25
// Щит: руки скрещены перед грудью
wristsCrossed = lWrist.x > rWrist.x;   // после зеркала левая должна быть левее; если правее — скрещены
inChestBand = both wrists.y in [midShoulder.y - 0.1*torso, midHip.y]
wristGap = dist(lWrist, rWrist) / torso;
shield = hyst(wristsCrossed && inChestBand ? 1 : 0) && wristGap < 0.9;
// Обе руки вверх
bothUp = armUp.left && armUp.right;   // + удержание 2 с в ui
// Дорожка
x = midHip.x; lane = laneOf(x); distToLaneCenter = (x - laneCenter[lane]) / laneWidth;
```

`hyst(value, on, off)` — гистерезис: включается при `value > on`, выключается при `value < off`. Плюс **debounce по кадрам**: состояние меняется, если новое значение держится ≥ 3 кадра. Это убирает мерцание рычага.

Видимость: `visible = все из [0, 11, 12, 23, 24] имеют visibility > 0.5`. Ноги (`25–28`) — отдельный флаг `legsVisible` для выбора формулы приседа и подсказки «отойди от камеры».

## 6. Правила уровня (`rules.ts`)

```ts
evaluate(level, actors, t, prev):
  active = actors.filter(a => a.state.visible && a.stunnedUntil <= t)
  for lever:  levers[id] = active.some(a => a.state.lane===lever.lane && handMatches(a, lever.hand))
  for plate:  plates[id] = active.some(a => a.state.lane===plate.lane && a.state.crouch)
  for door:   doors[id]  = mode==='all' ? openedBy.every(on) : openedBy.some(on)
  for laser (if patternOn(t)):
     stop = first lane in path where active.some(a => a.lane===lane && a.state.shield) ?? toLane
     laserStops[id] = stop
     for lane in path up to stop: actors in lane && !crouch && !shield → hit
  for hit actor: stunnedUntil = t + 2; hits.push(id)   // и событие 'hit' для звука/вспышки/подсказки
  exit: player.lane===exit.lane && doors[exit.door] → exitProgress += dt / holdSec, иначе 0
  won = exitProgress >= 1
```

Порядок важен: сначала щит/лучи, потом рычаги/плиты (станнутый актёр перестаёт держать рычаг — это создаёт честную головоломку: не ставь Эхо с рычагом под луч).

## 7. Рендер

- Canvas на весь viewport, внутренняя логическая система координат 1000×600, масштаб под окно (`letterbox`).
- Слои: (1) видео с камеры, затемнено до 25 % + лёгкий blur через CSS на `<video>` под canvas; (2) дорожки и объекты; (3) лучи (градиент + glow через `shadowBlur`); (4) Эхо скелеты (alpha 0.45, цвет по номеру, номер над головой); (5) игрок (alpha 1, белый/зелёный); (6) HUD: таймер, номер раунда, очки, панель подсказки.
- Скелет: 12 линий по `POSE_CONNECTIONS` (плечи–локти–запястья, плечи–таз, таз–колени–стопы) + круг головы. Положение актёра на экране = его реальная позиция в кадре камеры (масштабированная) — так игрок физически чувствует дорожки. Объекты рисуются в центрах дорожек.
- 60 fps рендер не обязателен; рисуем в том же rAF, что и трекинг.

## 8. UI без мыши

- Курсор = правое запястье (`x, y` → экран). Кнопка активируется, если курсор внутри ≥ 1.2 с; рисуем кольцо прогресса. `mousemove`/`click` дублируют.
- «Готов к раунду» — обе руки вверх 2 с. Так игрок гарантированно стоит в кадре целиком к моменту старта записи.
- Пауза: если тело потерялось > 1.5 с во время раунда — клок раунда **останавливается** (`clock.pause()`), на экране «Тебя не видно — вернись в кадр». Иначе Эхо будут «рваными».

## 9. Производительность и совместимость

- `PoseLandmarker lite + GPU`: Chrome/Edge macOS/Windows — 25–35 fps. Safari — работает, медленнее; проверить один раз.
- Видео 640×480 достаточно; не подавать в модель 1080p.
- Не создавать объекты в горячем цикле (переиспользовать `Float32Array`).
- Мобильный (бонус): `facingMode: 'user'`, портрет — тело в кадр помещается хуже; предупредить «поверни телефон горизонтально». Делать в последний день только если всё остальное готово.

## 10. Тест-режим для разработки (сэкономит часы)

- `?mock=1` — вместо камеры воспроизводить заранее записанный `Recording` из JSON как «игрока» → можно отлаживать правила уровней и рендер, не вставая со стула.
- `?debug=1` — показывать сырые величины `raw.*` и пороги на экране. Это же пригодится для настройки порогов на разных людях.
- Кнопка «Экспорт записи» в debug — сохранить текущий раунд в JSON для моков и для тестов `rules.ts`.
