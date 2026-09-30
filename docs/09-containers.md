# Docker, PostgreSQL и CI/CD

Текущая архитектура заменяет первоначальный план SQLite/systemd из документа 08. Сам фронт и игровая механика не меняются.

## Контейнеры

| Сервис | Содержимое | Доступ |
|---|---|---|
| web | nginx + собранный Vite | 127.0.0.1:8080 на хосте |
| api | Node 22, Hono, драйвер pg | только Docker-сеть, порт 3000 |
| postgres | PostgreSQL 17 | только внутренняя Docker-сеть, порт 5432 |

Caddy остаётся на хосте: принимает HTTPS и передаёт запросы в web. nginx проксирует `/api/` в API и повторно разрешает имя сервиса при замене контейнера. API подключён к двум сетям: frontend для nginx и исходящей почты, database для PostgreSQL. База находится только в сети database (`internal: true`).

В `/srv/echo/containers/.env` находятся `POSTGRES_PASSWORD` (случайный hex, безопасный для URL), `NODE_ENV=production`, `PUBLIC_ORIGIN=https://vencera.jeanark.dev`, `RESEND_API_KEY`, `MAIL_FROM`. Значения не выводятся в CI и не встраиваются в Docker-образы.

## CI/CD

Workflow `.github/workflows/deploy.yml` запускает `test → build → deploy`.

- Test: фронт, типы API и тесты на настоящем PostgreSQL. Каждый тест получает отдельную схему и удаляет её после выполнения.
- Build: собирает два образа с тегом SHA коммита, поднимает полный стек, проверяет HTTP и сохранение гостевой сессии. Проверяются именно образы, которые затем доставляются на сервер.
- Deploy: загружает архив образов и вызывает `deploy/release.sh`. Скрипт блокирует одновременные релизы через `flock`, делает приватный `pg_dump`, ждёт healthcheck и сохраняет SHA в `.release`. При неудаче возвращает предыдущие образы. База автоматически назад не откатывается: изменения схемы должны сохранять совместимость с предыдущим приложением.

Существующие секреты GitHub: SSH_KEY, SSH_HOST, SSH_USER, SSH_KNOWN_HOSTS. Для PR выполняются тесты и сборка без деплоя. Образы передаются архивом по SSH; registry не нужен. Старые образы оставляются для отката, дампы — в `/srv/echo/backups`; их ротация пока ручная.

## Однократный перенос SQLite

1. Запустить `deploy/setup-server.sh` на VM: Docker, Compose, каталог контейнеров и бэкапов, swap. Старое приложение продолжает работать.
2. Подготовить `.env` с новым паролем PostgreSQL и действующим почтовым ключом. Загрузить протестированные образы, Compose и скрипты в `/srv/echo/containers`.
3. Запустить `bash migrate-sqlite.sh <SHA>`.
4. Скрипт поднимает PostgreSQL, останавливает старый API, сохраняет SQLite и логический экспорт, переносит пользователей, хеши сессий, коды, результаты и прогресс в одной транзакции. Содержимое всех строк сравнивается, последовательность runs.id переводится за последний импортированный ID.
5. Только после успешной проверки новые контейнеры получают трафик через Caddy. Старый systemd API отключается. Маркер `.postgres-ready` разрешает последующие CI-деплои.

Импорт не перезаписывает непустую базу. При сбое до завершения переключения скрипт возвращает прежний Caddyfile и старый API. Если импорт успел завершиться, остаётся `.sqlite-imported`: повторный запуск остановится для проверки состояния, чтобы не потерять новые записи старого API. Исходная SQLite остаётся в `/srv/echo/data` и в каталоге бэкапа. Не включай её обратно после появления новых production-данных в PostgreSQL без обратного переноса.

## Команды на production

```bash
cd /srv/echo/containers
export IMAGE_TAG="$(cat .release)"
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail 100 api
curl -fsS http://127.0.0.1:8080/api/health
```

Ручной бэкап:

```bash
umask 077
docker compose -f compose.yml exec -T postgres pg_dump -U echo -d echo -Fc > /srv/echo/backups/manual.dump
```

Откат приложения на доступный предыдущий тег:

```bash
IMAGE_TAG=<previous-commit-sha> docker compose -f compose.previous.yml up -d --no-build --wait
```

После проверки успешного ручного отката нужно обновить `.release` и `compose.yml`, чтобы следующий CI правильно определил предыдущую версию.

Том PostgreSQL сохраняется при пересоздании контейнеров. Не использовать `docker compose down -v` на production: эта команда удаляет данные.
