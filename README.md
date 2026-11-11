# HECHO

**HECHO** — учебная клиент-серверная доска заказов для одной организации: заказчик создаёт заказ, исполнитель выполняет работу, администратор управляет пользователями, распределением заказов, счетами и оплатой.

[Документация](./docs/README.md) · [Русская документация](./docs/ru/README.md) · [English documentation](./docs/en/README.md) · [English README](./README.en.md) · [Схема базы данных](./docs/ru/database-schema.md)

> [!IMPORTANT]
> **О проекте и качестве кода**
>
> Проект полностью создан в режиме вайб-кодинга (AI-assisted development) и может содержать неточности, неоптимальные решения и неполные сценарии. Автор — не профессиональный разработчик, а QA-инженер. Основная задача проекта — быть лёгкой и понятной базой для демонстрации автора как QA-инженера: навыков тест-дизайна, работы с требованиями, API и UI, QA-документации и автоматизации. Не рассматривайте этот код как production-ready эталон.

## Что это

Приложение для приёма заказов от зарегистрированных заказчиков, распределения и выполнения работ, учёта времени и выставления внутренних счетов. Поддерживаются три роли:

- **Заказчик** — создаёт заказы, согласует оценку, принимает работу, отправляет подтверждение оплаты.
- **Исполнитель** — берёт заказы из общего пула, предлагает часы и стоимость, выполняет работу, ведёт учёт времени.
- **Администратор** — управляет пользователями, распределяет и переназначает заказы, выставляет счета, проверяет оплату и завершает заказы.

Интерфейс локализован на английский (по умолчанию), русский и испанский языки.

## Технологии

| Слой | Что используется |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, React Router, собственная i18n (`en` / `ru` / `es`) |
| Backend | NestJS 12, REST API, Swagger/OpenAPI, class-validator, PDFKit |
| Авторизация | Better Auth, серверные сессии в PostgreSQL, роли `CUSTOMER`, `EXECUTOR`, `ADMIN` |
| База данных | PostgreSQL 17, Prisma 7, миграции и SQL-ограничения |
| Файлы | SeaweedFS 4.52 через S3-совместимый API, лимит 1 MB на файл |
| Инфраструктура | Docker Compose, Nginx для раздачи frontend |
| Тесты | Unit- и интеграционные тесты API на Vitest; e2e-автотесты ведутся в отдельном репозитории |

## Архитектура

Проект построен по клиент-серверной схеме. Браузер загружает статическое React-приложение с Nginx и обращается к NestJS API по REST; API проверяет сессию и права, работает с PostgreSQL через Prisma и хранит файлы в SeaweedFS.

```mermaid
flowchart LR
    U["Браузер<br/>React SPA"]

    subgraph DC["Docker Compose"]
        N["Nginx<br/>frontend :6200"]
        A["NestJS API<br/>REST + Better Auth :6201"]
        P[("PostgreSQL<br/>:6202")]
        S[("SeaweedFS<br/>S3 API :6203")]
    end

    U -->|"HTTP, статика"| N
    U -->|"REST /api, session cookie"| A
    A -->|"Prisma"| P
    A -->|"S3 API"| S
```

- Frontend — одностраничное приложение с панелями `/customer`, `/executor` и `/admin`; прямые переходы по URL поддерживаются Nginx.
- API — доменная логика, авторизация, проверка ролей и переходов статусов, работа с файлами и генерация PDF-счетов.
- PostgreSQL — пользователи, категории, заказы, история, оценки, счета и платежи.
- SeaweedFS — вложения заказов и подтверждения оплаты.
- Docker Compose поднимает все сервисы, ждёт готовности PostgreSQL и применяет миграции перед стартом API.

## Быстрый старт

### Требования

- Docker Engine с Docker Compose v2 (`docker compose`); Docker Desktop подходит для Windows и macOS.
- Git.
- Свободные локальные порты `6200`–`6204`.
- Node.js `22.18+` и pnpm `12.15` нужны только для разработки на хосте; для запуска через Compose они не требуются.

### Запуск через Docker Compose

1. Клонируйте репозиторий и перейдите в его корень.
2. Создайте локальный файл окружения: `cp .env.example .env` (в Windows PowerShell: `Copy-Item .env.example .env`).
3. Замените в `.env` все значения `replace-this-*` на уникальные локальные пароли и секреты. Задайте `ADMIN_EMAIL` и `ADMIN_PASSWORD` для первого администратора. Пароль PostgreSQL должен быть URL-safe (буквы, цифры и `._~-`), потому что он используется в `DATABASE_URL`.
4. Соберите образы и запустите сервисы: `docker compose up --build -d`. Первый запуск может занять несколько минут; API дождётся PostgreSQL и применит миграции.
5. Создайте начального администратора: `docker compose exec api pnpm --filter @order-desk/api db:seed:admin`. Команда безопасна для повторного запуска.
6. Откройте `http://localhost:6200` и войдите под `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Исполнителей создаёт администратор, заказчики регистрируются самостоятельно.

Контейнеры объявлены с `restart: "no"`, поэтому после перезагрузки ПК они не запускаются автоматически: поднимите стек вручную командой `docker compose up -d`.

| Сервис | Адрес по умолчанию |
|---|---|
| Frontend | `http://localhost:6200` |
| API | `http://localhost:6201/api` |
| Swagger | `http://localhost:6201/api/docs` |
| Health check | `http://localhost:6201/api/health` |
| PostgreSQL | `localhost:6202` |
| SeaweedFS S3 API | `http://localhost:6203` |
| SeaweedFS Admin UI | `http://localhost:6204` |

Все порты привязаны к `127.0.0.1` и доступны только с локальной машины. Подробности о настройке портов, разработке с hot reload и devtools API — в [инструкции по запуску](./docs/ru/README.md#запуск-проекта-локально).

Для публикации используется домашняя ВМ с `docker-compose.prod.yml` и туннелем Cloudflare: TLS завершается на границе Cloudflare, служба `cloudflared` ходит в локальный nginx, а frontend и API (`/api`, `/api/docs`) доступны через один домен без открытых входящих портов. Порядок действий, схема хранения секретов и эксплуатация описаны в разделе [«Развёртывание на домашней ВМ»](./docs/ru/README.md#развёртывание-на-домашней-вм-cloudflare-tunnel).

## Документация

| Раздел | Русский | English |
|---|---|---|
| Полная документация | [docs/ru/README.md](./docs/ru/README.md) | [docs/en/README.md](./docs/en/README.md) |
| Назначение и функционал | [Функционал](./docs/ru/README.md#согласованный-функционал) | [Functionality](./docs/en/README.md#agreed-functionality) |
| Технические ограничения | [Ограничения](./docs/ru/README.md#технические-ограничения-и-пожелания) | [Constraints](./docs/en/README.md#technical-constraints-and-preferences) |
| План и статус реализации | [План](./docs/ru/README.md#план-реализации) | [Plan](./docs/en/README.md#implementation-plan) |
| Бэклог и очередь работ | [Бэклог](./docs/ru/README.md#бэклог) | [Backlog](./docs/en/README.md#backlog) |
| Запуск и эксплуатация | [Запуск](./docs/ru/README.md#запуск-проекта-локально) | [Setup](./docs/en/README.md#running-the-project-locally) |
| Развёртывание на домашней ВМ | [Cloudflare Tunnel](./docs/ru/README.md#развёртывание-на-домашней-вм-cloudflare-tunnel) | [Cloudflare Tunnel](./docs/en/README.md#deploying-to-a-home-vm-cloudflare-tunnel) |
| Схема базы данных | [Схема БД](./docs/ru/database-schema.md) | [Database schema](./docs/en/database-schema.md) |

## Структура репозитория

```text
apps/web/            React SPA: лендинг, авторизация, панели ролей
apps/api/            NestJS API, Prisma-схема и миграции, тесты
docs/                двуязычная документация проекта
.github/ISSUE_TEMPLATE/  форма баг-репорта для GitHub Issues
docker-compose.yml   PostgreSQL, SeaweedFS, API и frontend
docker-compose.prod.yml  продовый override: автоперезапуск и адреса от DOMAIN
deploy/prod.env      продовая конфигурация без секретов
.github/workflows/   деплой на домашнюю ВМ через self-hosted runner
```

## QA и тестирование

- Интерактивные элементы размечены стабильными `data-testid`, не зависящими от CSS и структуры DOM.
- Контракт API доступен в Swagger: `http://localhost:6201/api/docs`. У каждой ручки с телом запроса описана схема с реалистичным примером, а поля и параметры с фиксированным набором значений (роли, статусы, флаги) показывают все допустимые варианты; значения перечислений чувствительны к регистру (`ADMIN`, а не `admin`).
- Для подготовки данных есть devtools API; по умолчанию он выключен и защищён отдельным ключом. Полный сброс проекта (данные, пользователи, сессии и файлы) выполняется ручкой `POST /api/devtools/reset` или командой `pnpm db:reset`; администратор из `.env` создаётся заново. Пока `DEVTOOLS_ENABLED` не равен `true`, ручки отвечают `404` и не показываются в Swagger.
- Unit-тесты API на Vitest: `pnpm --filter @order-desk/api test`. Они работают офлайн, без базы и сети, и лежат рядом с кодом в `apps/api/src/**/*.spec.ts`.
- Интеграционные тесты API: `pnpm --filter @order-desk/api test:integration`. Набор сам собирает и поднимает отдельный стек `docker-compose.test.yml` (проект `order-desk-test`, порты `7101`–`7102`), ждёт `/api/health`, очищает базу через `POST /api/devtools/reset`, а после прогона удаляет контейнеры вместе с данными. Сценарии покрывают жизненный цикл заказа, конкурентный захват из пула, права доступа и валидацию запросов.
- Проверки типов и сборка: `pnpm typecheck`, `pnpm build`.
- Отчёты о прогонах можно отправлять в Qase TestOps (проект `HECHO`): `pnpm --filter @order-desk/api test:qase` и `test:qase:integration`. Кейсы описаны в каталоге `apps/api/src/test-support/qase/`, команда `pnpm qase:sync` создаёт и обновляет их в Qase (описание, предусловия, шаги, теги) и записывает ID в `qase-case-ids.ts`; кейс опознаётся по тегу `order-desk:<key>`, поэтому переименование сохраняет его историю, а снятая с каталога запись уезжает в `Archive / <исходный верхний suite>` вместо удаления. Токен хранится только в `.env`.
- Баг-репорты создаются через форму `.github/ISSUE_TEMPLATE/bug-report.yml`: прекондиции, шаги воспроизведения, ожидаемый и фактический результат. Пустые issues отключены, поэтому «New Issue» сразу открывает эту форму.
- Сквозные e2e-сценарии поддерживаются в отдельном учебном репозитории и не входят в этот проект.

## Связанные репозитории и артефакты

Ссылки на связанные материалы будут добавлены сюда позже:

- репозиторий с e2e-автотестами;
- тест-кейсы и чек-листы;
- коллекция API/Postman;
- баг-репорты и результаты тестирования.
