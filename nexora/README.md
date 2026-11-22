# NEXORA — главное лобби

NEXORA развёртывается как отдельный Node.js Web Service из папки `nexora`. Основной сайт «Все проекты» не заменяется и продолжает жить отдельно.

## Render

Создайте новый **Web Service** из этого же GitHub-репозитория:
- Root Directory: `nexora`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Добавьте переменные окружения:
- `NODE_ENV=production`
- `APP_URL=https://АДРЕС-NEXORA-В-RENDER`
- `AUTH_PUBLIC_URL=https://ecosystem-auth-service.onrender.com`
- `OAUTH_CLIENT_ID=nexora`
- `OAUTH_CLIENT_SECRET` — случайный секрет не короче 32 символов
- `SESSION_SECRET` — отдельный случайный секрет не короче 32 символов

## NEXORA ID

На Render у центрального сервиса `ecosystem-auth-service` добавьте OAuth-клиент в переменную `OAUTH_CLIENTS_JSON`. Значения `clientId`, `clientSecret` и callback URL должны точно совпадать с NEXORA:

```json
[
  {
    "clientId": "nexora",
    "clientSecret": "ТОТ_ЖЕ_OAUTH_CLIENT_SECRET_ИЗ_RENDER_NEXORA",
    "serviceApiKey": "ОТДЕЛЬНЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ",
    "redirectUris": ["https://АДРЕС-NEXORA-В-RENDER/auth/callback"]
  }
]
```

После изменения переменной сохраните настройки и перезапустите центральный сервис. Секреты не добавляйте в GitHub, HTML, переписку или скриншоты.

## Проверка

- `GET /health` — состояние NEXORA и готовность OAuth.
- `GET /api/me` — профиль текущего пользователя после входа.
- `/auth/start` — запуск входа через NEXORA ID.

На первом этапе активен переход в существующий генератор «Все проекты». Остальные плитки видны в лобби, но честно отмечены как находящиеся в разработке.

## Публикация через Render Blueprint

В корне репозитория добавлен `render.yaml`. В Render:
1. Откройте **New + → Blueprint**.
2. Выберите репозиторий `yanteleshko00-commits/vse-proekty-ian`.
3. Render прочитает Blueprint и создаст сервис `nexora-lobby` из папки `nexora`.
4. Для `APP_URL` укажите выданный адрес сервиса, например `https://nexora-lobby.onrender.com`.
5. Для `OAUTH_CLIENT_SECRET` создайте случайный секрет длиной не менее 32 символов и сохраните его в менеджере секретов. Не публикуйте его.
6. `SESSION_SECRET` Render сгенерирует автоматически.

Затем в Environment центрального сервиса `ecosystem-auth-service` добавьте/обновите `OAUTH_CLIENTS_JSON`, сохранив существующих OAuth-клиентов. Добавьте в массив ещё один объект:
```json
{
  "clientId": "nexora",
  "clientSecret": "ТОТ_ЖЕ_OAUTH_CLIENT_SECRET_ИЗ_NEXORA",
  "serviceApiKey": "НОВЫЙ_ОТДЕЛЬНЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ",
  "redirectUris": ["https://ВАШ-АДРЕС-NEXORA.onrender.com/auth/callback"]
}
```
Не заменяйте весь массив, если в нём уже зарегистрированы другие сайты. После сохранения перезапустите центральный auth-сервис. Проверка: откройте `https://ВАШ-АДРЕС-NEXORA.onrender.com/health`; после заполнения переменных `oauthConfigured` должен стать `true`.


## NEXORA Image Studio

Генератор изображений развёрнут как самостоятельный сервис: https://nexora-image-studio.onrender.com/. Переход из плитки «Создать картинку» открывает отдельный сайт. Настройка API и ключей находится в папке `nexora-image-studio`; описание — в `IMAGE-GENERATOR-SETUP.md`.
