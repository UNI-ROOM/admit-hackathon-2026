# 09 — Main menu, English UI, "Vencera Echo Game" rebrand

> Написано 30.09 14:30. До сдачи 30 минут — этот план **не** для сегодняшнего пуша в `main` (каждый пуш = деплой на прод). Ветка `menu`, PR, мёрж после отправки формы или к финалу 3–4.10.

## 1. Цель

Игра открывается не сразу в камеру, а в **главное меню**, как в обычных играх:

```
┌──────────────────────────────────────────────────────────────┐
│  [ADMIT HACKATHON logo]                        ● Guest-1234  │
│                                                              │
│                    V E N C E R A                             │
│                    ECHO GAME                                 │
│          cooperate with your past self · webcam only         │
│                                                              │
│            ┌──────────────────────────┐                      │
│            │        ▶  START          │   ← открывает выбор  │
│            ├──────────────────────────┤      уровней         │
│            │       👤 PROFILE         │                      │
│            │      🏆 LEADERBOARD      │                      │
│            │       ⚙  SETTINGS        │                      │
│            └──────────────────────────┘                      │
│                                                              │
│   Camera: ● allowed   Hand tracking: ready   v1.0 · f883686  │
└──────────────────────────────────────────────────────────────┘
```

Экраны: **Menu → Level Select → Game → Result → Level Select**. Profile / Leaderboard / Settings — модальные панели поверх меню (тот же `<dialog>`, что уже используется в `account.ts`).

## 2. Что уже есть и переиспользуется

| Есть | Где | Как используем |
|---|---|---|
| `<dialog class="account-panel">`, кнопки с `data-dwell`, курсор-палец | `ui/account.ts` | Все панели меню — тот же dialog. Dwell 1 с уже работает |
| Вход по коду, ник, выход, топ-10, результат уровня | `ui/account.ts` | Становятся содержимым Profile и Leaderboard |
| `LEVELS`, `LEVEL_ECHOES`, `session.best`, `progress.max_level` | `levels.ts`, `shared/score.ts`, `api.ts` | Карточки уровней: название, клоны, лучший счёт, замок |
| `getAudioContext / unlockAudioContext / playSfx` | `audio.ts` | Settings → SFX on/off (флаг `muted` внутри `playSfx`) |
| `#level-switcher` (select) + tutorial step 4 | `index.html`, `main.ts` | **Удаляется**: выбор уровня переезжает в Level Select |
| Camera (`camera_utils`) стартует при загрузке | `main.ts` низ | Стартует по кнопке START (или в меню для превью-миниатюры) |

## 3. Структура

```
echo/src/
├─ i18n.ts              # все строки UI, en (+ ru на будущее): t('menu.start')
├─ settings.ts          # { sfx, music, mirror, showSkeleton, hints } → localStorage 'vencera.settings'
├─ audio.ts             # + music: процедурный дрон/арпеджио на WebAudio (0 файлов), setMusic(on), setSfx(on)
├─ scenes/
│  ├─ router.ts         # show('menu'|'levels'|'game'), скрывает/показывает секции, ставит gameState.mode
│  ├─ menu.ts           # главный экран
│  ├─ levels.ts         # выбор уровня (3 карточки)
│  └─ settings.ts       # панель настроек
├─ ui/account.ts        # Profile + Leaderboard (рефакторинг под i18n)
└─ main.ts              # только игровой цикл; камера стартует из router.show('game')
echo/public/brand/admit-hackathon.jpg   # логотип (уже скопирован, 640×640)
```

`index.html` получает три секции: `<section id="scene-menu">`, `<section id="scene-levels">`, `#game-container` (существующий). Router переключает `hidden`.

## 4. Экраны — детали

### 4.1 Menu
- Логотип ADMIT Hackathon — в углу как «partner badge» (это бренд хакатона, не игры), 96–128 px, `object-fit: contain`. Под ним мелко `built at ADMIT Hackathon 2026`.
- Заголовок: `VENCERA` крупно + `ECHO GAME` подзаголовок. Шрифт под пиксельный логотип: `"Press Start 2P"` для заголовков (Google Fonts, 1 запрос) или системный monospace как фолбэк; текст — `Inter`/system-ui.
- Кнопки: START, PROFILE, LEADERBOARD, SETTINGS — вертикальный столбик, все `data-dwell`.
- Строка статуса внизу: камера (`allowed / blocked / not asked`), модель Hands (`loading / ready`), версия из `import.meta.env.VITE_GIT_SHA`.
- Фон: чёрный с сеткой (как на логотипе: `background-image: linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, ...)`, 64 px) + медленно движущиеся призрачные скелеты рук из записанного JSON (опционально).
- В меню камера **не** запущена → при первом открытии нет всплывающего запроса разрешения. Запрос — на START.

### 4.2 Level Select
Три карточки в ряд:
```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ 01             │ │ 02             │ │ 03         🔒  │
│ PRISM &        │ │ BEAM &         │ │ MULTI-ECHO     │
│ CRYSTAL        │ │ SHIELD         │ │                │
│ 👻 1 echo      │ │ 👻 1 echo      │ │ 👻 2 echoes    │
│ best 1 480     │ │ best —         │ │ unlock: beat 2 │
│ [ PLAY ]       │ │ [ PLAY ]       │ │                │
└────────────────┘ └────────────────┘ └────────────────┘
      [ ◀ BACK ]                [ ▶ TUTORIAL ]
```
- Замок по `progress.max_level` с сервера (гость тоже имеет прогресс — он на сервере). Кнопка «Unlock all» в Settings для жюри, чтобы посмотреть любой уровень сразу.
- Названия уровней (EN): `Prism & Crystal`, `Beam & Shield`, `Multi-Echo`. Обучение: `Tutorial`.
- PLAY → `router.show('game')` → камера стартует (если ещё нет), `gameState.currentLevel = n`, `resetLevel()`, `mode = 'IDLE'`.

### 4.3 Game
Без изменений по логике. HUD: вместо `<select>` — кнопка `☰ MENU` (пауза: `mode` сохраняется, камера продолжает работать, поверх — панель Resume / Restart level / Level select / Settings). Все тексты через `t()`.

### 4.4 Result (после WON)
Существующий `showResult` → добавить кнопки `NEXT LEVEL`, `REPLAY`, `LEVEL SELECT`. Автопереход через 8 с оставить, но показывать таймер.

### 4.5 Profile
Содержимое сегодняшнего HUD-аккаунта: ник, e-mail или «Guest», суммарные очки, лучший результат по каждому уровню, кнопки `Sign in with email` / `Change nickname` / `Sign out`. Сессия у гостя уже есть, поэтому профиль показывается всегда.

### 4.6 Leaderboard
Топ-10 (уже есть) + строка «You: #rank · total» под таблицей, если не в топе. Endpoint `GET /api/leaderboard` уже возвращает `isMe`; ранг своей записи — `rank` из `POST /api/runs` или добавить `GET /api/me/rank` (одна SQL-строка с `RANK() OVER`).

### 4.7 Settings
| Настройка | Тип | Реализация |
|---|---|---|
| Sound effects | toggle | `setSfx(on)` в `audio.ts`, ранний `return` в `playSfx` |
| Music | toggle | новый процедурный луп в `audio.ts` (2 осциллятора + фильтр, громкость 0.08); стартует после `unlockAudioContext` |
| Camera | статус + кнопка | `navigator.permissions.query({name:'camera'})` → `granted/denied/prompt`; кнопка `Request access` = `getUserMedia`; при `denied` — инструкция для Chrome/Safari, как разрешить |
| Select camera | select | `enumerateDevices()` → `videoinput`; `Camera` из camera_utils пересоздаётся с `deviceId` |
| Mirror video | toggle | класс на `#webcam`/canvas (`scaleX(-1)`) — уже так, делаем переключаемым |
| Show hand skeleton | toggle | флаг для `drawConnectors/drawLandmarks` |
| Hints (Error mode) | toggle | по умолчанию on; влияет только на панель подсказок, не на игру |
| Unlock all levels | toggle | локально, для жюри |
| Language | select | `en` (default) / `ru` — если строки уже в `i18n.ts`, это бесплатно |
| Reset progress | button | подтверждение → `api.logout()` (новый гость) |

Хранение: `localStorage['vencera.settings']` — это **клиентские предпочтения устройства**, не игровой прогресс, поэтому не противоречит решению «всё на сервере».

## 5. English + rebrand

- `<html lang="en">`, `<title>Vencera Echo Game</title>`, `<meta name="description">`, OpenGraph-теги с логотипом.
- Все строки → `i18n.ts`. Сейчас русских строк: `main.ts` 44, `game.ts` 17, `account.ts` 18, `levels.ts` 11, `index.html` 5 — около 95 штук, ~1 час механической работы. Тексты подсказок в `levels.ts` содержат HTML (`<b class='text-cyan-400'>`) — оставляем как есть, только переводим.
- Тексты режима «ошибка» переводить точно, сохраняя цифры: `Missed! You pinched near the LEVER — move your hand 40 px left.`
- Письмо с кодом: `subject: "{code} — your Vencera Echo Game sign-in code"`, `MAIL_FROM="Vencera Echo Game <echo@vencera.jeanark.dev>"` (только `.env` на сервере).
- README: заголовок `Vencera Echo Game`, раздел `Built at ADMIT Hackathon 2026`.
- Canvas-тексты (`drawUnmirroredText`: `РЫЧАГ`, `ЩИТ`, `ДВЕРЬ`, `ПРИЗМА`, …) → `LEVER`, `SHIELD`, `DOOR`, `PRISM`.

## 6. Порядок работ (≈ 5–6 часов)

| # | Шаг | Оценка | Проверка |
|---|---|---|---|
| 1 | Ветка `menu`. `i18n.ts`, перевод всех строк, `lang="en"`, title | 1 ч | Игра работает как раньше, но на английском; тесты зелёные (в `engine.test.ts` есть проверка уникальности `title` — обновить ожидания) |
| 2 | `router.ts` + секции в `index.html`; камера стартует по START | 45 мин | Открытие сайта не запрашивает камеру; START → запрос → игра |
| 3 | Menu + Level Select (карточки, замки, best из `session`) | 1,5 ч | Уровень 3 заблокирован у нового гостя, открывается после победы на 2 |
| 4 | Settings + `settings.ts` + music | 1 ч | Тогглы переживают перезагрузку; music без файлов |
| 5 | Profile/Leaderboard в новую оболочку, кнопка MENU в игре, Result-кнопки | 45 мин | Dwell-курсор нажимает всё без мыши |
| 6 | Дизайн-полировка: сетка-фон, шрифт, анимация кнопок, логотип | 45 мин | Скриншот в README |
| 7 | PR → CI (test + build без деплоя) → пройти все 3 уровня → мёрж | 30 мин | Прод обновился, `/api/health` ок |

## 7. Риски
- Tailwind через CDN генерирует классы в рантайме — для нового меню это ок, но при желании убрать мигание стилей — перейти на `@tailwindcss/vite` (15 мин).
- Google Fonts — внешний запрос; если жюри без интернета к шрифтам, фолбэк на `monospace` должен выглядеть нормально.
- `navigator.permissions.query({name:'camera'})` не поддерживается в Firefox → try/catch, статус `unknown`.
- Tutorial step 4 сейчас учит жест «палец» на `<select>` уровней. После удаления select шаг 4 должен указывать на кнопки Level Select — не забыть, иначе обучение зависнет.
