# 08 — Детальный план реализации: релиз ECHO с бэкендом

Дата: 30.09, дедлайн 15:00. База — ветка `kebi` (рабочая игра). Этот документ — пошаговая инструкция, по которой пишется код. Разделы идут в порядке выполнения.

---

## 0. Что уже есть в `kebi` (не переписываем)

```
echo/
├─ index.html          # Tailwind CDN, <video>, <canvas>, HUD (#mode-indicator, #instruction, #level-switcher, #level-title)
├─ src/main.ts         # MediaPipe Hands (legacy CDN), onResults() — игровой цикл, конечный автомат TUTORIAL/IDLE/RECORDING/PLAYING/WON
├─ src/game.ts         # gameState, сущности (man, lever, door, laser, plate, crystal, prism), evaluateRules(), drag&drop, частицы, resetLevel()
├─ src/levels.ts       # LEVELS: LevelConfig[] — 3 уровня
├─ src/types.ts        # типы сущностей и LevelConfig
├─ src/utils.ts        # жесты: isOpenPalm / isPinch / isFist / isPointing, StateStabilizer
├─ src/audio.ts        # WebAudio SFX
├─ tests/, test/       # 31 тест (tsx --test)
├─ Dockerfile, nginx.conf; ../docker-compose.yml
```

Управление: 🖐️ ладонь — старт раунда, 🤏 щипок — схватить/тащить, ✊ кулак 5 с — сброс петли, 👆 палец — меню уровней. Раунд записи — 10 с (`RECORD_DURATION`). Клоны — записанные кадры кисти, прогоняемые через тот же `handleDragAndDrop(..., 'ghost_i')`.

Точки, куда встраиваемся:
- `main.ts` ~L208 `if (gameState.mode === 'WON')` — **уровень пройден** → сюда отправка результата.
- `main.ts` ~L405 `currentFrame >= maxFrames` → **провал** (время вышло).
- `game.ts` `triggerManDeath()` → **смерть** (счётчик для очков).
- `main.ts` L313 `IDLE → RECORDING` — старт попытки (фиксируем `attemptStart`).
- `levels.ts` — новые уровни; `types.ts` — новые поля; `game.ts` `evaluateRules()` / `drawWorld()` / `resetLevel()` — новые механики.

Решение: **не переводим на Pose и не меняем Hands на Tasks Vision сегодня.** Работает — не трогаем. Идея «Эхо телом» ([01](01-concept.md)–[04](04-error-mode.md)) остаётся на финал (3–4.10).

---

## 1. Целевая структура репозитория

```
/                       # main (сливаем kebi → main в начале)
├─ echo/                # фронт (как есть) + src/api.ts, src/ui/auth.ts, src/ui/board.ts, src/score.ts
├─ server/              # НОВОЕ: Node 22 + Hono + SQLite
│  ├─ src/index.ts      # роуты
│  ├─ src/db.ts         # схема + миграция при старте
│  ├─ src/auth.ts       # magic code, сессии
│  ├─ src/mail.ts       # Resend
│  ├─ package.json, tsconfig.json, .env.example
├─ deploy/
│  ├─ Caddyfile
│  ├─ echo-api.service
│  └─ setup-server.sh   # разовая подготовка сервера
├─ .github/workflows/deploy.yml
├─ docs/
└─ README.md
```

---

## 2. Новые уровни (отличаются от kebi)

В kebi механики: рычаг, щит-плита, бегающий лазер, призма→кристалл. Наши новые уровни вводят **две новые механики**: пропасть и синхронные рычаги. Оба реализуются в `evaluateRules()` за ~40 строк каждый.

### L4 — «Пропасть и мост» (1 Эхо)
```
man ─────▶ [ПРОПАСТЬ x∈(0.4,0.6)] ─────▶ ДВЕРЬ
                 ▲ мост (плита), которую надо ДЕРЖАТЬ над пропастью
```
- Новое поле `LevelConfig.pit?: { minX, maxX }`.
- Гравитация человечка: `floor_y = 0.8`, но если `man.x ∈ pit` и под ним нет моста (`plate` с `|plate.x - man.x| < plate.width/2` и `plate.y ∈ [man.y, 0.85]`) → `man.y += 0.03`; при `man.y > 0.95` → `triggerManDeath('ЧЕЛОВЕЧЕК УПАЛ В ПРОПАСТЬ 🕳️')`.
- Если мост держит клон, человечек стоит на нём: `man.y = plate.y - plate.height/2 - 0.03`.
- Почему интересно: игрок понимает, что мост нельзя держать и тащить человечка одной рукой (Hands = 1 рука) → нужен клон. Отличается от «щит от лазера» визуально и по логике (падение вместо сожжения).
- Режим «ошибка»: «Мост слишком высоко — опусти на N px, человечек не достаёт», «Мост правее пропасти на N px» — через уже существующий механизм подсказок промаха.

### L5 — «Два ключа» (2 Эхо, синхронизация)
```
[РЫЧАГ A x=0.15]                       [РЫЧАГ B x=0.85]
      man x=0.5   ─────▶ ДВЕРЬ x=0.5 (y=0.2, наверху — человечка надо ПОДНЯТЬ)
```
- `LevelConfig.levers?: {x,y}[]` (массив), дверь открыта, когда **все** активны. Обобщаем `lever` → `levers: Lever[]` в `game.ts` (старое поле `lever` оставить как `levers[0]` для совместимости тестов).
- Рычаг «отпускает» через 0.02/кадр (уже есть) → клон должен **держать**, а не дёрнуть. Два клона держат два рычага, ты поднимаешь человечка к двери.
- Режим «ошибка»: если открыта только одна: «Рычаг B не дожат — потяни ниже на N px». Если тащишь человечка, а рычаги не держат: «Дверь закрыта: рычаг A отпущен на 6-й секунде — перезапиши клона 1».

### L6 — «Двойная призма» (2 Эхо, опционально, если есть время)
Лазер → призма 1 (право) → призма 2 (влево, выше) → кристалл. Расширение существующего рейкаста: `prisms: Prism[]`, отражённый луч проверяет вторую призму. Делать только после бэкенда и деплоя.

Нумерация в игре: уровни kebi 1–3 остаются, новые 4–5(–6). Кампания = 5–6 уровней, `LEVELS.length` везде уже используется динамически.

---

## 3. Очки (`echo/src/score.ts`)

```ts
export function levelScore(p: { timeLeftMs: number; echoesUsed: number; maxEchoes: number; deaths: number; resets: number }) {
  return Math.max(0,
    1000
    + Math.round(p.timeLeftMs / 10)            // 10 с петли = до +1000
    + (p.maxEchoes - p.echoesUsed) * 300
    - p.deaths * 150
    - p.resets * 50);
}
```
Сбор метрик в `gameState`: `attemptStart`, `deaths`, `resets` — инкременты в `triggerManDeath()` и обработчике кулака. `timeLeftMs = RECORD_DURATION - currentFrame * (RECORD_DURATION / maxFrames)` в момент `WON`.

---

## 4. Бэкенд (`server/`)

### 4.1 Стек и запуск
```bash
mkdir server && cd server && npm init -y
npm i hono @hono/node-server better-sqlite3 resend zod
npm i -D typescript tsx @types/better-sqlite3 @types/node
```
`package.json`: `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"` (tsx в prod — ок для хакатона, экономим шаг сборки). Порт 3000, слушает `127.0.0.1`.

### 4.2 Схема (`db.ts`, выполняется при старте)
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- crypto.randomUUID()
  email TEXT UNIQUE,                 -- NULL для гостя
  nickname TEXT NOT NULL DEFAULT 'Игрок',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,            -- 32 байта hex, в cookie
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT NOT NULL, code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email)
);
CREATE TABLE IF NOT EXISTS runs (                 -- каждое прохождение уровня
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  level_id INTEGER NOT NULL, score INTEGER NOT NULL,
  time_left_ms INTEGER, echoes_used INTEGER, deaths INTEGER, resets INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_user_level ON runs(user_id, level_id);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  max_level INTEGER NOT NULL DEFAULT 1,
  tutorial_done INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
```
Лидерборд = лучший результат по каждому уровню, суммированный:
```sql
SELECT u.nickname, SUM(b.best) AS total, COUNT(b.level_id) AS levels
FROM (SELECT user_id, level_id, MAX(score) best FROM runs GROUP BY user_id, level_id) b
JOIN users u ON u.id = b.user_id
GROUP BY u.id ORDER BY total DESC LIMIT ?;
```

### 4.3 Гость + вход по коду — как это работает вместе
Жюри не должно вводить почту, чтобы поиграть. Поэтому:
1. Первый запрос `POST /api/session` без cookie → создаём пользователя-гостя (`email NULL`, `nickname 'Гость-1234'`) и сессию → cookie. **Все результаты сразу пишутся на сервер.**
2. Вход по коду **привязывает** почту к текущему гостю (`UPDATE users SET email=? WHERE id=?`). Если почта уже есть у другого пользователя → переносим `runs`/`progress` гостя на него и переключаем сессию. Прогресс не теряется ни в одном сценарии.

### 4.4 Роуты (`index.ts`)
| Метод | Путь | Тело / ответ | Заметки |
|---|---|---|---|
| POST | `/api/session` | → `{ user: {id, nickname, email, isGuest}, progress, best: {levelId: score} }` | Создаёт гостя, если нет cookie. Вызывается при загрузке игры |
| GET | `/api/me` | → то же | 401, если нет сессии |
| POST | `/api/auth/request` | `{ email }` → `{ ok: true }` | Код 6 цифр, `sha256(code+email)`, TTL 10 мин, не чаще 1 раза в 60 с на почту, ответ всегда `ok` (не раскрываем существование) |
| POST | `/api/auth/verify` | `{ email, code }` → `{ user }` | ≤5 попыток, затем код сгорает. Привязка/слияние по 4.3 |
| POST | `/api/auth/logout` | → `{ ok }` | Удаляет сессию, следующий `/api/session` создаст нового гостя |
| PATCH | `/api/me` | `{ nickname }` (2–16 символов) | Без клавиатуры в игре — форма в HTML-оверлее, это не игровое действие |
| POST | `/api/runs` | `{ levelId, score, timeLeftMs, echoesUsed, deaths, resets }` → `{ best, rank }` | Сервер **пересчитывает** score по той же формуле и клампит поля (защита от подделки) |
| PUT | `/api/progress` | `{ maxLevel, tutorialDone }` | Только вверх (`MAX`) |
| GET | `/api/leaderboard?limit=10` | → `[{ nickname, total, levels, isMe }]` | Публично, кэш 5 с в памяти |
| GET | `/api/health` | `{ ok, uptime }` | Для CI после деплоя |

Cookie: `echo_sid`, `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. Фронт и API на одном домене → CORS не нужен.

Валидация — `zod` на каждое тело. Ошибки → `{ error: 'code' }` с 400/401/429.

### 4.5 Почта (`mail.ts`)
```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
export async function sendCode(email: string, code: string) {
  await resend.emails.send({
    from: process.env.MAIL_FROM!,            // 'ECHO <echo@jeanark.dev>' после верификации домена
    to: email,
    subject: `${code} — код входа в ECHO`,
    html: `<p>Твой код: <b style="font-size:24px;letter-spacing:4px">${code}</b></p><p>Действует 10 минут.</p>`,
  });
}
```
**DNS для Resend (сделать первым делом, распространяется 5–30 мин):** в Resend → Domains → Add `jeanark.dev` → добавить в DNS записи, которые покажет Resend (TXT `resend._domainkey`, MX/TXT для `send` поддомена, DMARC). До верификации `MAIL_FROM='onboarding@resend.dev'` — письма доходят **только** на почту владельца аккаунта Resend; для теста на себе достаточно.

В `.env` (на сервере, не в git):
```
RESEND_API_KEY=re_...           # новый, старый отозван
MAIL_FROM=ECHO <echo@jeanark.dev>
DB_PATH=/srv/echo/data/echo.db
PORT=3000
NODE_ENV=production
```

---

## 5. Интеграция во фронт (`echo/src/`)

### 5.1 `api.ts` — тонкий клиент
```ts
const j = (r: Response) => r.ok ? r.json() : r.json().then(e => Promise.reject(e));
const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(j);
export const api = {
  session:     () => post('/api/session'),
  requestCode: (email: string) => post('/api/auth/request', { email }),
  verify:      (email: string, code: string) => post('/api/auth/verify', { email, code }),
  logout:      () => post('/api/auth/logout'),
  nickname:    (nickname: string) => fetch('/api/me', { method: 'PATCH', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nickname }) }).then(j),
  run:         (r: RunPayload) => post('/api/runs', r),
  progress:    (p: { maxLevel: number; tutorialDone: boolean }) => fetch('/api/progress', { method: 'PUT', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(p) }).then(j),
  leaderboard: () => fetch('/api/leaderboard?limit=10', { credentials: 'include' }).then(j),
};
```
Все вызовы обёрнуты в `try/catch` → при недоступном API игра **продолжает работать**, в углу показывается «офлайн, результаты не сохраняются». Для локальной разработки `vite.config.ts`: `server.proxy = { '/api': 'http://localhost:3000' }`.

### 5.2 Где вызывать
| Событие | Место | Действие |
|---|---|---|
| Загрузка страницы | `main.ts` до `camera.start()` | `api.session()` → показать ник в HUD, `gameState.currentLevel = progress.max_level`, пропустить обучение, если `tutorial_done` |
| Уровень пройден | `main.ts`, вход в `WON` (там, где `wonTimeoutSet = true`) | посчитать `levelScore`, `api.run(...)`, `api.progress(...)`, показать оверлей «Уровень пройден: +N очков · Лучший: M · Место: #k» и топ-10 |
| Обучение завершено | `main.ts`, переход `tutorialStep 4 → IDLE` | `api.progress({ tutorialDone: true })` |
| Смерть / сброс | `game.ts triggerManDeath`, кулак в `main.ts` | `gameState.deaths++` / `resets++` |
| Кнопка «Войти» в HUD | `ui/auth.ts` | Модалка: поле email → «Отправить код» → поле кода → `verify` → HUD показывает почту и ник, кнопка «Ник» |

### 5.3 UI (минималистично, Tailwind уже подключён)
- HUD справа сверху: `🏅 Ник · 12 340 очков · [Войти]` или `✉ mail@… · [Ник] · [Выйти]`.
- Оверлей результата уровня: полупрозрачный фон, крупный счёт, таблица топ-10 с подсветкой своей строки, кнопка «Дальше» (плюс автопереход через 8 с — сохраняем текущее поведение).
- Кнопка «🏆 Рекорды» в IDLE — та же таблица.
- Все кнопки кликаются мышью и 👆 dwell-курсором (в kebi уже есть dwell для меню уровней — переиспользовать `hoveredButtonIndex` логику или сделать `data-dwell` атрибут).

---

## 6. Сервер и деплой

### 6.1 `deploy/setup-server.sh` (запускается один раз вручную по SSH)
```bash
set -e
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get update && sudo apt-get install -y caddy nodejs
sudo mkdir -p /srv/echo/{web,api,data} && sudo chown -R azureuser:azureuser /srv/echo
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
sudo cp deploy/echo-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable echo-api
# создать /srv/echo/api/.env вручную (RESEND_API_KEY и т.д.)
```
Проверить в Azure: NSG входящие правила — TCP 80 и 443 открыты (сейчас порты никто не слушает, поэтому снаружи не проверить, пока Caddy не поднят).

### 6.2 `deploy/Caddyfile`
```
vencera.jeanark.dev {
    encode zstd gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        root * /srv/echo/web
        try_files {path} /index.html
        file_server
    }
    header {
        Permissions-Policy "camera=(self)"
    }
}
```

### 6.3 `deploy/echo-api.service`
```ini
[Unit]
Description=ECHO API
After=network.target
[Service]
User=azureuser
WorkingDirectory=/srv/echo/api
EnvironmentFile=/srv/echo/api/.env
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=3
MemoryMax=300M
[Install]
WantedBy=multi-user.target
```

### 6.4 `.github/workflows/deploy.yml`
```yaml
name: deploy
on: { push: { branches: [main] } }
concurrency: deploy
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: '**/package-lock.json' }
      - run: cd echo && npm ci && npm test && npm run build
      - run: cd server && npm ci --omit=dev
      - uses: webfactory/ssh-agent@v0.9.0
        with: { ssh-private-key: ${{ secrets.SSH_KEY }} }
      - run: ssh-keyscan -H ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts
      - run: rsync -az --delete echo/dist/ ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:/srv/echo/web/
      - run: rsync -az --delete --exclude .env --exclude data server/ ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:/srv/echo/api/
      - run: ssh ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }} 'sudo systemctl restart echo-api && sleep 2 && curl -fs http://127.0.0.1:3000/api/health'
```
Секреты репозитория: `SSH_KEY` (содержимое `~/.ssh/appsec-panda-key`), `SSH_HOST=20.215.241.63`, `SSH_USER=azureuser`. Для `sudo systemctl restart` без пароля: `echo 'azureuser ALL=NOPASSWD: /bin/systemctl restart echo-api' | sudo tee /etc/sudoers.d/echo`.

Docker из kebi оставляем для локального запуска жюри (`docker compose up`), на сервере не используем — 892 МБ RAM.

---

## 7. Тесты (минимум, чтобы CI не был декорацией)
- `server/test/score.test.ts` — формула очков (общая с фронтом: вынести в `shared/score.ts`, импортировать в обоих).
- `server/test/auth.test.ts` — запрос кода → verify с неверным кодом ×5 → блок; верный код → сессия; слияние гостя.
- `echo/tests/levels_new.test.ts` — L4: человечек над пропастью без моста падает; с мостом стоит. L5: дверь открыта только при двух рычагах.

---

## 8. Порядок работы сегодня (см. также [05-roadmap.md](05-roadmap.md))

Две параллельные дорожки: **ты** — инфраструктура и ручные действия, **Claude** — код.

| Время | Ты | Claude |
|---|---|---|
| 08:45–09:15 | Отозвать ключ Resend, выпустить новый. Resend → добавить домен `jeanark.dev`, внести DNS. Azure NSG: открыть 80/443. Слить `kebi` → `main` | `server/` целиком: схема, сессии, гость, magic code, runs, leaderboard, health. Локальный запуск |
| 09:15–10:00 | Запустить `setup-server.sh` по SSH, создать `.env`, проверить `https://vencera.jeanark.dev` (Caddy отдаёт заглушку) | `echo/src/api.ts`, вызовы в `main.ts`, HUD, модалка входа, оверлей результата с топ-10 |
| 10:00–10:30 | Добавить секреты в GitHub, первый прогон `deploy.yml` | `deploy/*`, workflow, `vite.config.ts` proxy |
| 10:30–12:00 | Тестировать на реальном домене с почтой, ловить баги | L4 «Пропасть и мост», L5 «Два ключа», тесты, подсказки режима «ошибка» для них |
| 12:00–13:00 | Пройти всю кампанию на чужом ноутбуке | Фиксы, `shared/score.ts`, кэш лидерборда, лимиты |
| 13:00–14:00 | Скринкаст 30 с / gif | README (объединить kebi README + бэкенд + новые уровни + режим «ошибка»), описание для формы |
| 14:00–14:30 | **Отправить форму** | Финальный деплой, проверка в инкогнито |

Точка невозврата: если к **12:00** бэкенд не работает на домене — переключаем фронт на localStorage-фолбэк (в `api.ts` уже есть try/catch, добавить запись лучшего результата локально) и сдаём без аккаунтов. Игра и деплой важнее 5 баллов бонуса.

---

## Статус реализации 30.09

- `kebi` слита в `main`, локальные документы сохранены перед слиянием.
- Реализованы API, SQLite, гости, привязка/слияние почты, очки, прогресс, топ-10, HUD и результат уровня.
- Добавлены L4 и L5; L6 не включён.
- Azure NSG: открыты TCP 80/443. Caddy, Node 22 и systemd установлены. GitHub Actions выполняет тесты и деплой; первый запуск успешен.
- Домен `vencera.jeanark.dev` уже был верифицирован в Resend. Фактический отправитель — **`ECHO <echo@vencera.jeanark.dev>`**, вместо планировавшегося `echo@jeanark.dev`; новые DNS-записи корневого домена не потребовались.
- Засвеченный ключ `for_hackathon` отозван. Новый ограничен отправкой с игрового домена, находится только в игнорируемом `server/.env` и `/srv/echo/api/.env` (права 600).
- Подтверждены HTTPS, production-сессия, реальная загрузка MediaPipe в Chrome с тестовым видеопотоком, отрисовка и запрос кода через тестовый адрес Resend. Ручное прохождение с настоящей рукой и доставка в личный почтовый ящик ещё не проверены.
- CI дополнительно использует `SSH_KNOWN_HOSTS`; `shared/` публикуется рядом с API. SQLite-зависимость устанавливается на Linux-сервере. Формула ограничивает значения, но не является серверной проверкой самого прохождения.

## Обновление по Docker/PostgreSQL

По запросу пользователя архитектура перенесена на три отдельных контейнера: frontend (nginx), backend (Hono) и PostgreSQL 17. Текущие команды, CI/CD и порядок переноса старых данных описаны в [09-containers.md](09-containers.md). Первоначальные инструкции SQLite/systemd выше оставлены как история первого релиза.
