# NEXORA Image Studio

Генератор изображений работает как **отдельный сайт и отдельный Render Web Service**.

- Адрес: https://nexora-image-studio.onrender.com/
- Render service: `nexora-image-studio`
- Исходный код: `nexora-image-studio/`
- Страница: `nexora-image-studio/public/index.html`
- API: `POST /api/images/generate`
- Проверка состояния: `GET /health`

## Переход из Lobby

Плитка «Создать картинку» в NEXORA Lobby открывает самостоятельный сайт NEXORA Image Studio. Старый адрес `/image` перенаправляет на новый сайт. Старый API Lobby `/api/images/generate` отключён и возвращает HTTP 410.

## Генераторы

NEXORA Image Studio самостоятельно выполняет запросы к подключённым провайдерам. В режиме Parallel auto запросы запускаются параллельно, используется первый успешный результат.

Поддерживаются:
- GigaChat — основной рекомендуемый провайдер для текущей настройки;
- OpenAI — дополнительный провайдер, если добавлен действующий API-ключ.

## Настройка Render

Откройте сервис **nexora-image-studio** → **Environment**. Ключи хранятся только в Render, не в GitHub и не в HTML.

Переменные:
- `GIGACHAT_API_KEY` или `GIGACHAT_AUTH_KEY` — основной ключ авторизации GigaChat;
- `GIGACHAT_BACKUP_AUTH` — резервный ключ авторизации GigaChat;
- `GIGACHAT_SCOPE` — необязательная область доступа, по умолчанию `GIGACHAT_API_PERS`;
- `GIGACHAT_IMAGE_MODEL` — необязательное переопределение модели;
- `OPENAI_API_KEY` — необязательный второй провайдер.

При запуске `start.js` загружает и проверяет официальный российский корневой сертификат, затем запускает Node.js с настроенным доверием к нему.

## Архитектура

NEXORA Lobby отвечает за лобби и навигацию. NEXORA Image Studio отвечает за интерфейс, API генерации, авторизацию у провайдера, скачивание готового файла и ограничение частоты запросов. Генерация изображений не зависит от API Lobby.
