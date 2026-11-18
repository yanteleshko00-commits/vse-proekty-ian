# Генерация проектов на MacBook через Cloudflare Tunnel

## Архитектура

- Публичный сайт и его интерфейс продолжают работать на Render.
- Render пересылает только запросы генерации на MacBook.
- На MacBook работает тот же Node.js-сервер проекта: он обращается к внешним API нейросетей и собирает PPTX, PDF, DOCX и ZIP.
- Cloudflare Tunnel создаёт исходящее соединение с MacBook. Не нужно открывать входящие порты на домашнем роутере.
- Cloudflare Access с Service Auth ограничивает доступ к адресу генератора. Дополнительно сервер проверяет отдельный секретный токен.
- Если Mac выключен, спит или потерял интернет, новые задачи не выполняются. Сайт останется доступен, но генерация вернёт понятную ошибку.

Это не запуск локальной языковой модели: Mac выполняет серверную логику и сборку файлов, а запросы к Gemini/Groq и другим подключённым ИИ-провайдерам идут через интернет.

## Важные ограничения

MacBook Air 2015 с Intel i5 подходит для предварительного теста, но не рассчитан на большую одновременную нагрузку. Для постоянной работы держать его подключённым к питанию, с открытой крышкой и стабильным интернетом. Отключить автоматический переход в сон на время работы. Не использовать эту схему как гарантию круглосуточной доступности.

Условия Cloudflare, домена и аккаунтов должен проверить и принять взрослый владелец. Не указывайте фиктивный возраст и не передавайте пароль или секретные ключи в переписку.

## 1. Подготовить MacBook

1. Установить Node.js 22 LTS для macOS Intel (x64) с официального сайта Node.js.
2. Открыть Terminal и проверить:
   ```bash
   node -v
   npm -v
   ```
   Команда `node -v` должна показать версию 22.x.
3. Склонировать ветку проекта:
   ```bash
   git clone --branch mac-local-generator https://github.com/yanteleshko00-commits/vse-proekty-ian.git
   cd vse-proekty-ian
   npm install
   ```
4. Создать локальный файл настроек:
   ```bash
   cp .env.example .env
   ```
5. Сгенерировать длинный случайный секрет:
   ```bash
   openssl rand -hex 32
   ```
   Сохранить его в менеджере паролей и вставить в `MAC_WORKER_TOKEN` в локальном файле `.env`. Тот же секрет позже будет добавлен в Render. Не публиковать его и не отправлять в чат.
6. В `.env` на Mac установить:
   ```dotenv
   NODE_ENV=production
   PORT=3000
   MAC_WORKER_MODE=true
   MAC_WORKER_TOKEN=ВСТАВЬ_СЛУЧАЙНЫЙ_СЕКРЕТ
   GENERATION_JOBS_DIR=/Users/ИМЯ_ПОЛЬЗОВАТЕЛЯ/vse-proekty-data/generation-jobs
   ```
   Замени путь на свой реальный домашний каталог. Создай папку:
   ```bash
   mkdir -p "$HOME/vse-proekty-data/generation-jobs"
   ```
7. Перенести на Mac используемые API-ключи ИИ-провайдеров из защищённых настроек хостинга. Вставлять их только в локальный `.env`, не в GitHub. Имена переменных смотри в `.env.example`.
8. Запустить:
   ```bash
   npm start
   ```
   Оставить Terminal открытым. В другом окне проверить локальный health endpoint:
   ```bash
   curl -H "Authorization: Bearer ВСТАВЬ_СЕКРЕТ" http://127.0.0.1:3000/api/health
   ```
   Должен вернуться JSON с `"ok":true`. Не публикуй вывод, если в нём есть приватные сведения.

## 2. Создать защищённый Cloudflare Tunnel

Нужен домен, подключённый к Cloudflare DNS. Если `vseproekty.com` ещё не использует DNS Cloudflare, сначала отдельно проверь текущую DNS-конфигурацию и не меняй nameservers без согласования со взрослым владельцем домена.

1. В Cloudflare Dashboard открыть **Networking → Tunnels** и создать tunnel, например `vse-proekty-mac`.
2. Выбрать macOS и архитектуру Intel/amd64. Установить `cloudflared` по команде, которую покажет сам Dashboard. Официальная инструкция: https://developers.cloudflare.com/tunnel/get-started/
3. В настройках tunnel добавить Published application route:
   - Hostname: `generator.vseproekty.com`
   - Service: `http://localhost:3000`
4. До публикации адреса создать в **Zero Trust → Access → Applications** приложение для `generator.vseproekty.com`.
5. Создать Service Auth policy и Service Token. Сохранить Client ID и Client Secret в защищённом месте. Не помещать их в код, `.env.example`, GitHub или браузер.
6. Убедиться, что доступ к hostname разрешён только через эту Service Auth policy. Не оставлять публичную Bypass policy и не использовать Quick Tunnel для production.

Документация:
- Tunnel setup: https://developers.cloudflare.com/tunnel/get-started/
- macOS service: https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/macos/
- Access service tokens: https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/

Для автоматического запуска туннеля при входе пользователя в macOS Cloudflare документирует команду `cloudflared service install`. Сначала убедись, что tunnel работает в обычном режиме, затем включай автозапуск. На Mac сервис генератора и сам компьютер также должны оставаться включёнными.

## 3. Настроить Render как защищённый прокси

В Render → Environment добавить секретные переменные:

| Переменная | Значение |
|---|---|
| `MAC_GENERATOR_URL` | `https://generator.vseproekty.com` |
| `MAC_WORKER_TOKEN` | Тот же случайный секрет, что на Mac |
| `CF_ACCESS_CLIENT_ID` | Client ID Cloudflare Service Token |
| `CF_ACCESS_CLIENT_SECRET` | Client Secret Cloudflare Service Token |

Не добавлять кавычки вокруг значений. Не публиковать их в GitHub и не отправлять в чат. После изменения переменных перезапустить Render service.

Проксируются только известные API-маршруты генерации, редактирования и подсказки тем. Остальные маршруты и статические файлы продолжают обслуживаться Render. Секреты не передаются браузеру.

## 4. Проверка перед переключением

1. Проверить, что tunnel в Cloudflare имеет статус Healthy.
2. Убедиться, что Mac отвечает на локальный `/api/health` с правильным bearer-токеном.
3. Убедиться, что запрос без токена получает HTTP 401.
4. Проверить Service Auth: запрос без Cloudflare Service Token должен быть заблокирован Cloudflare Access.
5. На сайте создать тестовый проект. Скачать PPTX и PDF и открыть их.
6. Проверить редактирование проекта и восстановление статуса задания после обновления страницы.
7. Выключить Mac на короткое время и убедиться, что сайт остаётся доступен, а генерация сообщает о недоступности удалённого генератора.
8. Только после успешных проверок переносить API-ключи окончательно и отдельно решать, нужен ли переход с Render. DNS основного сайта пока не менять.

## 5. Возврат к генерации на Render

Если Mac временно не используется, удалить `MAC_GENERATOR_URL` и связанные с ним секреты из Render Environment, затем перезапустить сервис. При отсутствии `MAC_GENERATOR_URL` приложение продолжит обрабатывать эти API-маршруты локально на Render. Не удалять старые ключи с Render до завершения тестирования Mac.
