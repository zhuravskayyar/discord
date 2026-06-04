# Nova Chat

Discord-подобный чат для деплоя на Render: frontend, backend API, realtime-чат и база данных запускаются на Render, а голос и демонстрация экрана подключаются через LiveKit Cloud или отдельный VPS.

## Стек

- `client`: React, Vite, TypeScript, Socket.IO client
- `server`: Node.js, Express, Socket.IO
- `database`: подготовка под PostgreSQL через `DATABASE_URL`
- `realtime`: Socket.IO, опционально Redis adapter через `REDIS_URL`
- `voice`: endpoint для LiveKit token через `LIVEKIT_*`

## Как запустить локально

1. Установи зависимости:

```bash
npm install
```

2. Создай файл окружения:

```bash
copy .env.example .env
```

3. Запусти frontend и backend одной командой:

```bash
npm run dev
```

4. Открой приложение:

```txt
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

## Как пользоваться приложением

1. Слева находится список серверов. Кнопка `+` создает новый сервер.
2. В панели каналов выбери текстовый канал, например `общий`.
3. Напиши сообщение в поле внизу и нажми кнопку отправки.
4. Пользователи справа показывают онлайн-статус.
5. Голосовые каналы уже есть в интерфейсе, но для реального голоса нужно настроить LiveKit.

## Голос и демонстрация экрана

Для голоса нужны переменные:

```env
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

После этого backend endpoint `/api/livekit/token` начнет выдавать токены для подключения к комнате LiveKit.

## Render

Рекомендуемая схема:

- Static Site: `client`
- Web Service: `server`
- Database: Render PostgreSQL
- Redis-compatible cache: опционально для масштабирования Socket.IO
- Voice/screen share: LiveKit Cloud или LiveKit на отдельном VPS

Для Render можно использовать [render.yaml](render.yaml). Перед деплоем заполни секреты `LIVEKIT_*` и при необходимости `REDIS_URL`.

### Быстрая настройка через Blueprint

1. Открой Render Dashboard.
2. Нажми `New +` -> `Blueprint`.
3. Подключи GitHub-репозиторий:

```txt
https://github.com/zhuravskayyar/discord.git
```

4. Render найдет файл `render.yaml` в корне репозитория.
5. При создании Render подготовит:

```txt
zhuravskayyar-discord-web  - frontend Static Site
zhuravskayyar-discord-api  - backend Web Service, plan free
zhuravskayyar-discord-db   - PostgreSQL, plan free
```

6. После первого деплоя проверь переменные:

```env
# Backend service: zhuravskayyar-discord-api
CLIENT_ORIGIN=https://zhuravskayyar-discord-web.onrender.com
DATABASE_URL=создается Render автоматически
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Frontend service: zhuravskayyar-discord-web
VITE_API_URL=https://zhuravskayyar-discord-api.onrender.com
VITE_LIVEKIT_URL=wss://your-livekit-host
```

7. Если LiveKit пока нет, оставь `LIVEKIT_*` пустыми. Текстовый чат будет работать, голос покажет статус `LiveKit не настроен`.

### Ручная настройка без Blueprint

Если создаешь сервисы вручную:

Backend Web Service:

```txt
Root Directory: оставить пустым
Build Command: npm ci && npm run build --workspace server
Start Command: npm run start --workspace server
Health Check Path: /health
Environment:
  NODE_ENV=production
  CLIENT_ORIGIN=https://твой-frontend.onrender.com
  DATABASE_URL=строка Render PostgreSQL
```

Frontend Static Site:

```txt
Root Directory: оставить пустым
Build Command: npm ci && npm run build --workspace client
Publish Directory: client/dist
Environment:
  VITE_API_URL=https://твой-backend.onrender.com
```

PostgreSQL:

```txt
Create -> PostgreSQL
Copy Internal Database URL или External Database URL в DATABASE_URL backend-сервиса.
```

Для стабильного realtime-чата на нескольких backend-инстансах добавь Render Key Value / Redis-compatible сервис и укажи `REDIS_URL`.

Для production лучше перевести backend с `free` на `starter`, потому что free-инстансы могут засыпать после простоя, а WebSocket-соединения при этом будут обрываться.

## Команды

```bash
npm run dev      # локальная разработка
npm run build    # проверка TypeScript и production build
npm run start    # запуск server/dist после build
```

## GitHub

Репозиторий для публикации:

```txt
https://github.com/zhuravskayyar/discord.git
```

Если репозиторий пустой, первый push можно сделать так:

```bash
git init
git branch -M main
git remote add origin https://github.com/zhuravskayyar/discord.git
git add .
git commit -m "Initial Discord-style chat app"
git push -u origin main
```

Если GitHub запросит авторизацию, установи GitHub CLI и выполни:

```bash
gh auth login
```
