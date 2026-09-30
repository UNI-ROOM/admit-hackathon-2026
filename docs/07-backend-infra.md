# 07 — Бэкенд, аккаунты, сервер, CI/CD

## 0. Приоритет

Решение от 30.09: **всё хранится на сервере, без localStorage.** При открытии игры сервер автоматически создаёт гостевую сессию (cookie), результаты и прогресс сразу пишутся в БД. Вход по коду из письма привязывает почту к гостю и переносит его результаты. Так жюри играет без регистрации, а данные всё равно на сервере. Детали и код — в [08-implementation.md](08-implementation.md); этот документ — про инфраструктуру.

Фолбэк: если API недоступен, игра продолжает работать и показывает «офлайн, результаты не сохраняются». Это нужно, чтобы падение сервера не обнулило 30 баллов за работоспособность.

## 1. Сервер (проверено по SSH 30.09)

| | Факт |
|---|---|
| Хост | Azure, `20.215.241.63`, Ubuntu 24.04 |
| Ресурсы | 2 vCPU, **892 МБ RAM**, 29 ГБ диск |
| Установлено | только git. Нет docker, node, caddy, nginx |
| Домен | `vencera.jeanark.dev` → уже указывает на этот IP ✅ |
| Порты 80/443 | ничего не слушает (проверить NSG в Azure, что 80/443 открыты снаружи) |

**Мощностей хватает с большим запасом.** Весь трекинг и игра выполняются в браузере игрока; сервер отдаёт статику и обрабатывает пару запросов рекордов в минуту. 892 МБ — узкое место только для Docker + Node вместе; поэтому без Docker.

## 2. Стек

### Фронт
- **Vite + TypeScript + canvas** (как в [03-architecture.md](03-architecture.md)). Без React.
- **WebAssembly уже есть**: MediaPipe Tasks Vision — это WASM + WebGPU/WebGL. Писать свой WASM (Rust/C++) для распознавания жестов не нужно: наша логика — десятки сравнений чисел на кадр, JS делает это за микросекунды. Узкое место — инференс модели, он уже в WASM. Своё WASM = день работы и ноль прироста.
- Оптимизации, которые реально влияют: кадр 640×480 в модель, модель `lite`, `delegate: GPU`, детект через кадр при fps < 20, никаких аллокаций в цикле.

### Мини-бэк
- **Node 22 + Hono + SQLite (`better-sqlite3`)**. Один процесс, один файл БД, ~150 строк кода. Запуск через `systemd`.
- Альтернатива без сервера вообще — Supabase (auth + Postgres + REST из коробки, 0 строк бэкенда). Если бэкенд начинаем позже 12:00 — брать Supabase.
- **Caddy** как реверс-прокси: HTTPS от Let's Encrypt автоматически, конфиг 6 строк, статика + прокси `/api` на Node.

### Аккаунты — упрощённо
Пароль + подтверждение кодом — два потока, две формы, восстановление пароля. Для хакатона достаточно **входа по коду из письма** (magic code), это «по фэншую» и в 2 раза меньше кода:

```
POST /api/auth/request   { email }          → Resend шлёт 6-значный код, TTL 10 мин
POST /api/auth/verify    { email, code }     → cookie-сессия (httpOnly, 30 дней), создаём user
GET  /api/me                                 → { email, nickname, best, progress }
POST /api/scores         { levelId, score, echoes, timeLeft, hits }   // требует сессии
GET  /api/leaderboard?limit=10               → публично
PUT  /api/progress       { levelsDone, calibration }                  // прогресс между устройствами
```

Схема БД:
```sql
users(id, email UNIQUE, nickname, created_at)
login_codes(email, code_hash, expires_at, attempts)
scores(id, user_id, level_id, score, echoes_used, time_left, hits, created_at)
progress(user_id PRIMARY KEY, data JSON, updated_at)
```
Лидерборд: `SELECT nickname, SUM(best per level)` или проще — лучший суммарный прогон.

Никнейм спрашиваем один раз после первого входа (ввод с клавиатуры допустим — это не игровое действие; в игре мыши и клавиатуры нет).

### Resend
- Ключ `re_...` был вставлен в чат → **отозвать и выпустить новый** на https://resend.com/api-keys. Хранить только в `.env` на сервере, в репо — `.env.example`.
- Отправка с домена: добавить DNS-записи, которые Resend покажет для `jeanark.dev` (SPF/DKIM), иначе письма от `onboarding@resend.dev` — работает, но только на свою почту аккаунта. Для жюри нужен верифицированный домен → сделать DNS в первую очередь, он распространяется не мгновенно.

## 3. Раскладка на сервере

```
/srv/echo/
├─ web/            # dist фронта (Caddy отдаёт статику)
├─ api/            # node-приложение, node_modules, .env
└─ data/echo.db    # SQLite
/etc/caddy/Caddyfile
/etc/systemd/system/echo-api.service
```

Caddyfile:
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
}
```

Разовая подготовка сервера (~10 мин):
```bash
sudo apt update && sudo apt install -y caddy   # + репозиторий caddy по докам
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo mkdir -p /srv/echo/{web,api,data} && sudo chown -R azureuser /srv/echo
# Azure NSG: открыть 80 и 443 входящие
```

## 4. CI/CD (GitHub Actions, ~20 строк)

При пуше в `main`:
1. `npm ci && npm run build` фронта; `npm ci --omit=dev` бэкенда.
2. `rsync` через SSH: `dist/ → /srv/echo/web/`, `api/ → /srv/echo/api/` (кроме `.env`, `data/`).
3. `ssh ... 'sudo systemctl restart echo-api'`.

Секреты в GitHub: `SSH_KEY` (содержимое `~/.ssh/appsec-panda-key`), `SSH_HOST`, `SSH_USER`. Ключ **не** коммитить.

Деплой пустой страницы с этим пайплайном — первый шаг, чтобы проверить HTTPS и камеру на реальном домене. Дальше каждый пуш = обновление за ~1 минуту.

## 5. Порядок внедрения (зависит от оставшегося времени)

| Осталось до сдачи | Что делаем |
|---|---|
| < 4 ч | Только статика на Caddy + CI. Рекорды в localStorage. Аккаунты — нет |
| 4–8 ч | + `GET/POST /api/scores` и `/leaderboard` **без аккаунтов** (никнейм вводится на итогах). Это уже даёт «таблицу рекордов» для бонуса |
| > 8 ч | + magic-code вход через Resend, прогресс между устройствами |

## 6. Что писать в README про инфраструктуру
- Фронт: статика, работает с любого HTTPS-хостинга. Локально `npm run dev`.
- Бэкенд опционален: без `VITE_API_URL` игра работает полностью офлайн с локальными рекордами. Это важно жюри — если сервер лёг, работоспособность не страдает.
