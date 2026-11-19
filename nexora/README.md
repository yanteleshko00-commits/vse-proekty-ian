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
