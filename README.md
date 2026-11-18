# Календарь звонков

«Календарь звонков» — это упрощённый сервис бронирования времени по мотивам Cal.com.
Владелец календаря (один, задан заранее) настраивает типы встреч и просматривает расписание. Гость без регистрации выбирает тип встречи и бронирует свободный слот.

**Продолжение проекта «Календарь звонков».** Приложение, тесты, линтеры, воркфлоу и настройки агента перенесены из [ai-for-developers-project-386](https://github.com/kmarenov/ai-for-developers-project-386). Исходные решения и словарь остаются в первом проекте:

- [спецификация API — `spec/main.tsp`](https://github.com/kmarenov/ai-for-developers-project-386/blob/main/spec/main.tsp)
- [ADR-0001: правила времени бронирования](https://github.com/kmarenov/ai-for-developers-project-386/blob/main/docs/adr/0001-time-rules.md)
- [ADR-0002: занятость и конфликты при создании брони](https://github.com/kmarenov/ai-for-developers-project-386/blob/main/docs/adr/0002-booking-conflicts.md)
- [GLOSSARY.md: словарь проекта](https://github.com/kmarenov/ai-for-developers-project-386/blob/main/GLOSSARY.md)

**Публичный демо-стенд:** [https://web-main-production-bb7a7b4d.up.railway.app](https://web-main-production-bb7a7b4d.up.railway.app) — развёрнут из проекта 386 на Railway. Бэкенд in-memory, поэтому типы встреч и брони сбрасываются при рестарте.

## 🚀 Запуск и проверки

Для управления инструментами используется [mise](https://mise.jdx.dev/).

```bash
mise install
mise run setup
mise run dev
```

- Backend: http://localhost:8081
- Frontend: http://localhost:5173
- Все проверки: `mise run check`

`mise run dev` запускает оба сервиса в фоне и завершается; управление — `mise daemons status|logs|stop`. Порт backend переопределяется через `PORT`, разрешённый origin — через `CORS_ALLOWED_ORIGIN`. Подробности по командам и структуре — в [AGENTS.md](AGENTS.md).

### 🎭 E2E-тесты

```bash
mise run e2e:install   # один раз: скачать chromium
mise run test:e2e      # E2E на настоящих backend и frontend
```

- Playwright сам поднимает backend на `:8091` и frontend на `:5191` и гасит их после прогона, поэтому `mise run dev` на `:8081`/`:5173` можно не останавливать. `reuseExistingServer: false` гарантирует чистый in-memory backend на каждый прогон.
- `mise run check` запускает `hk check --all` и `mise run test:e2e`; `mise run check:fast` — только быстрые проверки без браузеров, её использует pre-commit.
- Конфиг — `playwright.config.ts` в корне, сценарии и фикстуры — `e2e/`. Прогон последовательный (`workers: 1`, только chromium), с обязательным `globalTimeout`.
- Отчёты и артефакты попадают в `playwright-report/` и `test-results/` и не коммитятся. В CI job `check` ставит chromium с системными зависимостями и складывает `playwright-report/` артефактом.
- Тесты ходят в настоящий API без моков; нужные данные готовятся через API в самих сценариях.

### 🐳 Docker

```bash
mise run build:docker
mise run test:docker
docker run --rm -p 8080:8080 -e PORT=8080 calendar-slot-code:local
```

`mise run test:docker` собирает образ, запускает его на нестандартном `SMOKE_PORT` (по умолчанию `18080`), проверяет `/health`, SPA и API, затем удаляет контейнер.

Полноценный образ собирает SPA и Go API в один контейнер: nginx отдаёт фронтенд и проксирует API на внутренний `:8081`, наружу смотрит `$PORT` (по умолчанию `8080`). Этот же `Dockerfile` использует hexlet-check.

### 🌐 Деплой на Railway

Стенд развёрнут на [Railway](https://railway.com/) из проекта 386; в этом репозитории лежат те же настройки деплоя (`Dockerfile`, `railway.json`, `opencode.json`), поэтому его можно пересобрать отсюда:

- **Публичный URL:** https://web-main-production-bb7a7b4d.up.railway.app
- **Сборка:** корневой `Dockerfile`; Railway не использует собственный билдер.
- **Порт:** платформа передаёт `PORT`, приложение слушает его. Локально значение по умолчанию — `8080`.
- **Healthcheck:** `GET /health`.
- **Конфигурация:** `railway.json` (Dockerfile, healthcheck, рестарты, без засыпания) и `opencode.json` (MCP и разрешение `external_directory` для headless-агента).

Проверить стенд:

```bash
curl -fsS https://web-main-production-bb7a7b4d.up.railway.app/health
curl -fsS https://web-main-production-bb7a7b4d.up.railway.app/config
```

### 🔌 MCP для деплоя

В репозитории лежит проектная конфигурация OpenCode — `opencode.json` с remote MCP Railway и `permission.external_directory: allow` для headless-агента. Секретов в ней нет. Разрешение нужно, чтобы агент в GitHub Actions не ждал подтверждения на `/tmp` и `/tmp/pnpm-shim`; для локальной работы оно расширяет доступ агента за пределы репозитория.

Порядок подключения:

1. Установите зависимости и откройте OpenCode в корне репозитория:

   ```bash
   mise install
   ```

2. В OpenCode выполните `/mcps`, выберите `railway` и пройдите OAuth-вход в браузере.
3. Проверьте подключение:

   ```bash
   opencode mcp list
   ```

   Ожидается `railway connected`.

4. Попросите агента выполнить деплой. Агент использует MCP-инструменты Railway: создание проекта и сервиса из GitHub-репозитория, настройка healthcheck, генерация домена, чтение логов и статуса.

Точная последовательность MCP-вызовов, известные ограничения и команды приёмки — в [docs/deploy.md](docs/deploy.md).

OAuth-токены хранятся в данных OpenCode вне репозитория. Файлы `.env` и `.env.*` исключены из Git; `.env.example` — безопасный шаблон на случай перехода на `RAILWAY_API_TOKEN` вместо OAuth.

### 💾 Данные на публичном стенде

Бэкенд хранит типы встреч и брони в памяти процесса. После **любого перезапуска или redeploy** контейнера на Railway данные сбрасываются: типы встреч и записи исчезают. Базы данных и постоянного хранилища нет.

После деплоя создайте демо-тип встречи заново:

```bash
curl -fsS -X POST https://web-main-production-bb7a7b4d.up.railway.app/meeting-types \
  -H 'Content-Type: application/json' \
  -d '{"title":"Демо-встреча 30 минут","description":"Проверка публичного стенда","duration_minutes":30}'
```

## 🤖 Агент в GitHub

[OpenCode](https://opencode.ai/docs/github/) подключён к репозиторию: команда в issue, PR или в комментарии к строке diff запускает интерактивного агента, а каждое изменение PR дополнительно проходит независимое авторевью. Раннер использует тот же `AGENTS.md`, `docs/agents/`, `REVIEW.md` и скиллы из `.opencode/skills/`, что и локальный агент.

### Интерактивный агент

- **Воркфлоу:** `.github/workflows/opencode.yml`. Результаты — ответный комментарий в issue/PR со ссылкой `[github run]` и прогон в **Actions → opencode**.
- **События:** `issue_comment` (обсуждение issue или PR), `pull_request_review_comment` (комментарий к строке diff) с `types: [created]` и `issues` (`types: [opened]`) для автотриажа. Для `issues` текст задания задан в `prompt` job `triage`. Воркфлоу всегда берётся из `main`, поэтому изменения в нём начинают работать только после мержа.
- **Команды (`mentions`):** `/oc` и `/opencode`, поиск по подстроке. Цитата команды тоже запускает агента.
- **Автотриаж:** job `triage` разбирает новое issue, не меняя код и не создавая спеку и тикеты. Метки — по `docs/agents/triage-labels.md`. Issue с `ready-for-agent` пропускается.
- **Модель:** `opencode/deepseek-v4.1-flash`; ключ только в секрете `OPENCODE_API_KEY`.
- **Публикация сессий:** `share: false`.
- **Headless-разрешения:** `opencode.json` разрешает `external_directory`, иначе агент в CI ждёт подтверждения на `/tmp`/`/tmp/pnpm-shim` и падает по таймауту. Job `report` задаёт `GH_REPO`, чтобы опубликовать причину сбоя без checkout.

Кого слушает интерактивный агент:

- только `OWNER`, `MEMBER` или `COLLABORATOR` — проверка в `if` до запуска шагов;
- не ботов: иначе агент отвечал бы на собственные сообщения;
- недоверенные PR из fork не получают секреты: нет `pull_request_target`, а checkout берёт основную ветку.

### Авторевью pull request

- **Воркфлоу:** `.github/workflows/pr-review.yml`, событие `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`).
- **Область:** только ветки своего репозитория (`head.repo.full_name == github.repository`), draft пропускается. Автора-бота **не** фильтруем: PR, созданный приложением, тоже должен получать ревью. PR из fork не получают секрет модели.
- **Запуск:** обычный OpenCode CLI (`opencode run`), а не `opencode github run`: обработчик action проверяет права отправителя и на PR приложения может вернуть `permission: none`.
- **Критерии:** `REVIEW.md` передаётся ревьюеру отдельным шагом. Ревьюер читает спецификацию, тикеты и согласование по ссылкам из тела PR, diff и результаты CI. Если ссылки недоступны или изменение выходит за согласованный объём, он отмечает пробел.
- **Ограничения ревьюера:** `.opencode/agents/pr-reviewer.md` запрещает edit, subagent, skill и изменяющие shell-команды; разрешены только чтение и `gh pr view/diff/checks`, `gh issue view`, `gh run view`, `git diff/show/log`.
- **Публикация:** отдельным шагом `gh pr comment`; ревьюер не меняет код и не продолжает сессию реализации. Форматирование не комментируется — его проверяет линтер.
- **Тайм-аут и параллельность:** `timeout-minutes: 15`, `concurrency` на номер PR с `cancel-in-progress: true`: устаревшее ревью отменяется.
- **Доверенная конфигурация:** `REVIEW.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `opencode.json` и `.opencode/agents/pr-reviewer.md` перезаписываются версией из base перед запуском, чтобы PR не мог ослабить собственную проверку. PR, который вводит эти файлы впервые, использует head — это единственный bootstrap-случай.
- **Ограничение:** для события `pull_request` GitHub берёт сам `pr-review.yml` из версии PR. PR, который меняет воркфлоу авторевью, требует отдельного человеческого ревью изменений прав и шагов; пиннинг файлов это не закрывает.

Права и ограничения:

| Настройка                                                         | Значение                        | Зачем                                       |
| :---------------------------------------------------------------- | :------------------------------ | :------------------------------------------ |
| `contents: read`                                                  | чтение репозитория              | checkout и `REVIEW.md`                      |
| `id-token: write`                                                 | только `opencode.yml`           | OIDC-обмен на токен OpenCode App            |
| `issues: write`                                                   | интерактивный агент             | скиллы публикуют issue и комментарии        |
| `pull-requests: write`                                            | оба воркфлоу                    | драфт-PR и комментарий ревью                |
| `issues: read`, `actions: read`, `checks: read`, `statuses: read` | только `pr-review.yml`          | спецификация, прогоны и статусы CI          |
| `persist-credentials: false`                                      | checkout без credentials        | push только токеном приложения              |
| `timeout-minutes: 45` / `15`                                      | интерактивный агент / автотриаж | зависший прогон не тратит токены бесконечно |
| `concurrency: opencode-<номер>`                                   | без отмены                      | команды и автотриаж ждут друг друга         |

### Бюджет запусков на PR

- Job `budget` в `opencode.yml` выполняется **до** вызова модели. Лимит — 3 допущенных запуска на один PR.
- Счёт хранится в истории Actions: учитываются запуски `opencode.yml` с тем же номером PR, у которых job `opencode` не `skipped`, плюс отменённые после успешного `budget`; сумма `run_attempt`. Пропущенные боты/не-команды и заблокированные лимитом прогоны не считаются. Логика — `scripts/agent-budget.mjs`, тесты — `scripts/agent-budget.test.mjs`.
- Отмена, тайм-аут и повторный **Re-run** расходуют попытку.
- При исчерпании публикуется `limit_exhausted`, последний SHA, ссылка на логи и статус «нужен человек»; job с моделью пропускается. `budget` публикует `limit_exhausted` и `infra`; отдельный job `report` без модели публикует `timeout` и `agent_failed`.
- Комментарий PR — только отчёт; его текст бюджет не меняет. Ограничение действует при сохранённой истории и неизменённой конфигурации; администратор репозитория может изменить условия. Новый PR получает новый бюджет.

### CI и браузерный артефакт

- `ci.yml` запускается на `pull_request` и на `push` в `main`. На PR checkout идёт на `github.event.pull_request.head.sha`, а не на временный merge-коммит.
- `git rev-parse HEAD` пишется в `test-results/head-sha.txt` и step summary.
- Playwright trace включается на CI даже для успешного прогона. Артефакт `e2e-<sha>` содержит `playwright-report/`, `test-results/` и `head-sha.txt`. После нового push артефакт прежней версии не считается доказательством: проверку повторяют и сверяют SHA с текущим head PR.
- Авторевью может запуститься параллельно с CI и ещё не видеть артефакт; его сверяет человек перед мержем.

### Скиллы на раннере

- Раннер стартует с чистого окружения, поэтому проектные копии лежат в `.opencode/skills/`: `to-spec`, `to-tickets`, `implement-spec` и их зависимости `tdd`, `code-review`, `codebase-design`. Каталоги скопированы из [mattpocock/skills](https://github.com/mattpocock/skills) как есть.
- Автотриаж не зависит от скилла: инструкция целиком лежит в `prompt` job `triage`.
- Настройки трекера (`AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`) едут вместе с кодом.
- Новый скилл добавляется копированием каталога с `SKILL.md` в `.opencode/skills/<id>/` и коммитом. Форматтер `oxfmt` каталог `.opencode/skills/**` не трогает.
- Скилл вызывается текстом команды, например: `/oc запусти скилл to-spec по обсуждению этого issue`.

### Проверка после мержа

```bash
gh issue create --title "Проверка агента" --body "Тестовый issue для /oc"
gh issue comment <номер> --body "/oc explain this issue"
```

Для автотриажа:

```bash
# Новое обращение без меток: ожидается комментарий с разбором
gh issue create --title "Проверка автотриажа" --body "Тестовое обращение"

# Готовый тикет: прогона и комментария быть не должно
gh issue create --title "Проверка пропуска" --body "Готовый тикет" --label ready-for-agent
```

Для авторевью и бюджета:

```bash
# Авторевью: открыть или обновить PR, затем проверить прогон pr-review
gh run list --workflow pr-review.yml --limit 5

# Бюджет: четыре команды /oc в одном PR; четвёртая должна завершиться
# комментарием limit_exhausted без job opencode
gh pr comment <номер> --body "/oc ответь одним словом, код не меняй"
```

### Ограничение авторизации

OpenCode App имеет права `contents`, `issues`, `pull_requests`, `actions: read`, но не имеет `workflows`. Поэтому push, меняющий `.github/workflows/*`, отклоняется:

```text
refusing to allow a GitHub App to create or update workflow ... without `workflows` permission
```

PR, который не трогает workflow-файлы, агент создаёт штатно. Для изменений workflow нужен токен с правом Workflows: отдельное GitHub App с `workflows: write` или PAT со scope `workflow`, переданный как `GITHUB_TOKEN` вместе с `use_github_token: true`. Обычный `GITHUB_TOKEN` это ограничение не обходит: в `permissions` нет ключа `workflows`. PAT от пользователя делает комментарии агента комментариями пользователя, поэтому фильтр ботов перестаёт работать — такой режим требует отдельной проверки на самозапуск.

Инфраструктурный PR, который вводит эти воркфлоу, подготовлен локальным агентом по той же причине: он меняет `.github/workflows/*`. PR реализации workflow-файлы не трогает, поэтому его создаёт GitHub-агент.

## 🛠 Технологический стек

### Backend

| Компонент                 | Технология                                         |
| :------------------------ | :------------------------------------------------- |
| **Язык**                  | Go                                                 |
| **HTTP-сервер и роутинг** | `net/http` + `http.ServeMux`                       |
| **JSON**                  | `encoding/json`                                    |
| **Логирование**           | `log/slog`                                         |
| **Конфигурация**          | `os.Getenv`                                        |
| **Синхронизация**         | `sync` (Mutex/RWMutex для защиты In-Memory данных) |
| **Тестирование**          | `testing` + `httptest`                             |
| **API Контракт**          | TypeSpec -> OpenAPI                                |
| **Хранение данных**       | В оперативной памяти процесса (In-Memory)          |

#### Архитектурные принципы (Backend)

- **Standard Library First** — минимум внешних зависимостей.
- **Modular Monolith** — организация кода по бизнес-модулям.
- **Explicit Dependency Injection** — зависимости через конструкторы.
- **Thin Handlers** — отделение HTTP-слоя от бизнес-логики.
- **Simplicity over Abstraction** — интерфейсы и абстракции только по необходимости.
- **Middleware** — обязательное использование CORS-мидлвари для взаимодействия с фронтендом.

### Frontend

| Компонент               | Технология          | Назначение                              |
| :---------------------- | :------------------ | :-------------------------------------- |
| **UI-фреймворк**        | React               | Компонентная архитектура                |
| **Язык**                | TypeScript          | Строгая типизация                       |
| **Сборка**              | Vite                | Разработка и production-сборка          |
| **Маршрутизация**       | React Router        | Навигация и маршруты                    |
| **UI-компоненты**       | shadcn/ui           | Основа собственной дизайн-системы       |
| **Стили**               | Tailwind CSS        | Адаптивная стилизация                   |
| **Иконки**              | Lucide              | Единый набор иконок                     |
| **API-клиент**          | Orval               | Генерация клиента из OpenAPI            |
| **Серверное состояние** | TanStack Query      | Запросы, кеширование, обновление данных |
| **Работа с датами**     | `date-fns`          | Форматирование, парсинг и таймзоны      |
| **Формы**               | React Hook Form     | Управление формами                      |
| **Валидация**           | Zod                 | Проверка пользовательского ввода        |
| **Тестирование**        | Vitest + Playwright | Модульные и E2E-тесты                   |

`date-fns` (вместе с `@date-fns/tz`) форматирует даты и время в таймзоне владельца из `GET /config`, React Hook Form управляет формой записи, Zod проверяет имя и email по правилам контракта.

## 🚢 Релизы

Релизы ведёт [release-please](https://github.com/googleapis/release-please) в manifest-режиме: workflow `.github/workflows/release-please.yml` запускается по `push` в `main`, конфиг — `release-please-config.json`, текущие версии — `.release-please-manifest.json`. Пакетов два: `frontend` (`release-type: node`, версия в `frontend/package.json`) и `backend` (`release-type: go`, только `backend/CHANGELOG.md`). `spec/` отдельно не версионируется и уезжает вместе с `frontend`.

- Текущая версия — `1.0.0`. При манифесте `0.0.0` release-please-action v5 выпустил `1.0.0`; чтобы начать с `0.1.0`, задайте `initial-version` до первого релиза. Дальше `feat` двигает minor, `fix`/`perf` — patch.
- Теги: `frontend-vX.Y.Z` и `backend/vX.Y.Z` — слэш у Go нужен, чтобы тег работал как тег подмодуля (`tag-separator: "/"`).
- Один релизный PR `chore: release main` обновляет оба пакета и манифест.
- Заголовки PR при squash-мерже должны быть conventional: в `main` попадает именно заголовок PR, и release-please парсит его как коммит.

Чтобы workflow мог создавать PR, в настройках репозитория должно быть включено **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Без этой опции запуск падает на создании релизного PR.

## ⚠️ Ограничения и правила работы

- **Хранение данных:** База данных не используется. Все данные (типы встреч и бронирования) хранятся в памяти. **При перезапуске сервера все записи сбрасываются**, в том числе при restart или redeploy контейнера на Railway.
- **Отсутствие интеграций:** Нет авторизации, личных кабинетов, уведомлений и синхронизации с внешними календарями (Google Calendar, Outlook и т.д.).
- **Правила слотов и бронирования:**
  - Окно записи: 14 календарных дней (сдвигается динамически с течением времени).
  - Пересечение интервалов строго запрещено (включая частичное наложение разных типов встреч).
  - Следующая встреча может начаться ровно в момент окончания предыдущей.
  - Защита от состояния гонки (race condition): правила пересечения интервалов действуют и для двух запросов, пришедших одновременно (проверка занятости и вставка брони выполняются в одной критической секции под `sync.RWMutex` на бэкенде).
  - Рабочие часы — 09:00–18:00, часовой пояс владельца — Europe/Moscow.
  - Шаг доступных стартов фиксируется в спецификации (например, каждые 15 минут).
  - Длительность слота совпадает с длительностью выбранного типа встречи.

---

## 📖 Пользовательские сценарии

### 👤 Сценарий Владельца (Администратора)

1.  **Публикация типа встречи:** формы создания в админке нет. Владелец создаёт тип встречи запросом `POST /meeting-types` (см. curl-демо ниже), после чего тип появляется в каталоге для гостей.
2.  **Просмотр записей:** В разделе «Админка» (`/admin`) владелец видит список предстоящих встреч, сгруппированных по дням: название и длительность типа, интервал времени, имя гостя и его email. Список обновляется автоматически.

### 🚶 Сценарий Гостя

1.  **Главная страница:** Гость открывает приложение и видит приветственный экран с кнопкой «Записаться».
2.  **Каталог встреч:** Гость попадает на страницу со списком доступных типов встреч. Нажимает на карточку, например, «Встреча 15 минут».
3.  **Выбор даты и времени:**
    - Открывается календарь на ближайшие 14 дней.
    - Гость выбирает день.
    - Система запрашивает свободные слоты у бэкенда и отображает их (с учетом занятости и рабочих часов).
    - Гость выбирает свободное время (например, 09:45 – 10:00).
4.  **Оформление записи:** Гость вводит свои данные (Имя, Email), при желании — необязательную тему разговора до 200 символов и нажимает «Записаться».
5.  **Успех:** Гость видит экран успешной записи. Созданная бронь немедленно появляется в списке предстоящих встреч у Владельца.

---

## 🔌 Требования к API и Контракту

В `TypeSpec` контракте заданы модели и роуты, из которых генерируется `openapi.yaml`. На основе этой спецификации с помощью **Orval** генерируется типизированный API-клиент для фронтенда.

**Основные модели:**

- `HealthResponse`: `status`.
- `ConfigResponse`: `timezone`, `working_hours_start`, `working_hours_end`, `slot_step_minutes`, `booking_window_days`, `today`.
- `MeetingType`: `id`, `title`, `description`, `duration_minutes`.
- `CreateMeetingTypeRequest`: `title`, `description`, `duration_minutes` (без `id`).
- `TimeSlot`: `start_time`, `end_time` — только свободные слоты, без `is_available`.
- `Booking`: `id`, `meeting_type_id`, `start_time`, `end_time`, `guest_name`, `guest_email`, `topic` (всегда строка; пустая, если гость не указал тему).
- `CreateBookingRequest`: `meeting_type_id`, `start_time`, `guest_name`, `guest_email`, необязательный `topic` до 200 Unicode-символов после trim (без `end_time`).
- `ErrorResponse`: `{code, message}`; `code` — закрытый union: `invalid_request`, `invalid_slot`, `meeting_type_not_found`, `slot_taken`, `not_found`, `method_not_allowed`, `internal_error`.

**Основные эндпоинты:**

| Метод  | Путь                                      | Успех | Ошибки                                                                                           |
| :----- | :---------------------------------------- | :---- | :----------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                                 | `200` | `500`                                                                                            |
| `GET`  | `/config`                                 | `200` | `500`                                                                                            |
| `GET`  | `/meeting-types`                          | `200` | `500`                                                                                            |
| `POST` | `/meeting-types`                          | `201` | `400 invalid_request`, `500`                                                                     |
| `GET`  | `/available-slots?meeting_type_id={uuid}` | `200` | `400 invalid_request`, `404 meeting_type_not_found`, `500`                                       |
| `GET`  | `/bookings`                               | `200` | `500`                                                                                            |
| `POST` | `/bookings`                               | `201` | `400 invalid_request`, `404 meeting_type_not_found`, `400 invalid_slot`, `409 slot_taken`, `500` |

### 🧪 curl-демо каталога

После `mise run dev` (на свежем сервере стор в памяти пуст):

```bash
# 1. Пустой список типов встреч
curl -s http://localhost:8081/meeting-types
# []

# 2. Создание типа встречи: title тримится, сервер выдаёт UUID v4
curl -s -X POST http://localhost:8081/meeting-types \
  -H 'Content-Type: application/json' \
  -d '{"title":"  Встреча 30 минут  ","description":"Обсудим проект","duration_minutes":30}'
# {"id":"<uuid-v4>","title":"Встреча 30 минут","description":"Обсудим проект","duration_minutes":30}

# 3. Список с созданным типом
curl -s http://localhost:8081/meeting-types

# 4. Ошибка валидации — 400 invalid_request
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8081/meeting-types \
  -H 'Content-Type: application/json' \
  -d '{"title":"","description":"","duration_minutes":4}'
# {"code":"invalid_request","message":"Некорректные данные типа встречи"}
# 400

# 5. Неподдерживаемый метод — 405 method_not_allowed
curl -s -w '\n%{http_code}\n' -X PUT http://localhost:8081/meeting-types
# {"code":"method_not_allowed","message":"Метод не поддерживается"}
# 405

# 6. Неизвестный путь — 404 not_found
curl -s -w '\n%{http_code}\n' http://localhost:8081/unknown
# {"code":"not_found","message":"Ресурс не найден"}
# 404
```
