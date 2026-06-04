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
