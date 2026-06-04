import "dotenv/config";

import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { AccessToken } from "livekit-server-sdk";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { z } from "zod";

type ChannelType = "text" | "voice";

type Role = {
  id: string;
  name: string;
  color: string;
};

type User = {
  id: string;
  displayName: string;
  status: "online" | "idle" | "offline";
  accent: string;
};

type Channel = {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
};

type GuildServer = {
  id: string;
  name: string;
  initials: string;
  roles: Role[];
  channels: Channel[];
  memberIds: string[];
};

type Message = {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

const now = () => new Date().toISOString();

const users = new Map<string, User>([
  [
    "u_aria",
    {
      id: "u_aria",
      displayName: "Aria",
      status: "online",
      accent: "#34d399"
    }
  ],
  [
    "u_maks",
    {
      id: "u_maks",
      displayName: "Maks",
      status: "idle",
      accent: "#60a5fa"
    }
  ],
  [
    "u_nika",
    {
      id: "u_nika",
      displayName: "Nika",
      status: "online",
      accent: "#f97316"
    }
  ]
]);

const channels: Channel[] = [
  { id: "c_general", serverId: "s_nova", name: "общий", type: "text" },
  { id: "c_builds", serverId: "s_nova", name: "сборки", type: "text" },
  { id: "c_design", serverId: "s_nova", name: "дизайн", type: "text" },
  { id: "c_voice", serverId: "s_nova", name: "голосовой", type: "voice" }
];

const servers = new Map<string, GuildServer>([
  [
    "s_nova",
    {
      id: "s_nova",
      name: "Рабочее пространство Nova",
      initials: "NW",
      roles: [
        { id: "r_owner", name: "Владелец", color: "#f97316" },
        { id: "r_builder", name: "Разработчик", color: "#60a5fa" }
      ],
      channels,
      memberIds: ["u_aria", "u_maks", "u_nika"]
    }
  ]
]);

const messages = new Map<string, Message[]>([
  [
    "c_general",
    [
      {
        id: "m_welcome",
        channelId: "c_general",
        authorId: "u_aria",
        body: "Первый канал готов. Сообщения в реальном времени уже идут через Socket.IO.",
        createdAt: now()
      },
      {
        id: "m_arch",
        channelId: "c_general",
        authorId: "u_maks",
        body: "Backend подготовлен под Postgres, Redis adapter и токены LiveKit.",
        createdAt: now()
      }
    ]
  ],
  [
    "c_builds",
    [
      {
        id: "m_builds",
        channelId: "c_builds",
        authorId: "u_nika",
        body: "Следующий шаг - подключить постоянное хранение данных и авторизацию.",
        createdAt: now()
      }
    ]
  ],
  ["c_design", []]
]);

const messageInput = z.object({
  channelId: z.string().min(1),
  authorId: z.string().min(1),
  body: z.string().trim().min(1).max(2000)
});

const createServerInput = z.object({
  name: z.string().trim().min(2).max(60)
});

const createChannelInput = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((name) =>
      name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
    ),
  type: z.enum(["text", "voice"]).default("text")
});

const liveKitTokenInput = z.object({
  roomName: z.string().min(1).max(120),
  identity: z.string().min(1).max(120),
  name: z.string().min(1).max(120)
});

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT ?? 4000);
const clientOrigin = normalizeOrigin(
  process.env.CLIENT_ORIGIN ?? "http://localhost:5173"
);

function normalizeOrigin(origin: string) {
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    return origin;
  }

  return `https://${origin}`;
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    credentials: true
  }
});
let redisAdapterEnabled = false;

async function configureRedisAdapter() {
  if (!process.env.REDIS_URL) {
    return;
  }

  try {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (error) => console.error("Redis pub error", error));
    subClient.on("error", (error) => console.error("Redis sub error", error));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    redisAdapterEnabled = true;
    console.log("Redis adapter включен");
  } catch (error) {
    console.warn("Redis adapter отключен: не удалось подключиться", error);
  }
}

function serializeBootstrap(currentUserId = "u_aria") {
  return {
    currentUser: users.get(currentUserId) ?? users.get("u_aria"),
    users: Array.from(users.values()),
    servers: Array.from(servers.values())
  };
}

function findChannel(channelId: string) {
  return Array.from(servers.values())
    .flatMap((server) => server.channels)
    .find((channel) => channel.id === channelId);
}

function createMessage(input: z.infer<typeof messageInput>): Message {
  const parsed = messageInput.parse(input);
  const channel = findChannel(parsed.channelId);

  if (!channel || channel.type !== "text") {
    throw new Error("Текстовый канал не найден");
  }

  if (!users.has(parsed.authorId)) {
    throw new Error("Автор не найден");
  }

  const message: Message = {
    id: uuid(),
    channelId: parsed.channelId,
    authorId: parsed.authorId,
    body: parsed.body,
    createdAt: now()
  };

  const channelMessages = messages.get(parsed.channelId) ?? [];
  channelMessages.push(message);
  messages.set(parsed.channelId, channelMessages);

  return message;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    realtime: "socket.io",
    redis: redisAdapterEnabled,
    livekit: Boolean(
      process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
    )
  });
});

app.get("/api/bootstrap", (request, response) => {
  const userId =
    typeof request.query.userId === "string" ? request.query.userId : undefined;
  response.json(serializeBootstrap(userId));
});

app.get("/api/channels/:channelId/messages", (request, response) => {
  const { channelId } = request.params;
  response.json(messages.get(channelId) ?? []);
});

app.post("/api/servers", (request, response) => {
  const parsed = createServerInput.parse(request.body);
  const id = `s_${uuid()}`;
  const generalChannel: Channel = {
    id: `c_${uuid()}`,
    serverId: id,
    name: "общий",
    type: "text"
  };

  const server: GuildServer = {
    id,
    name: parsed.name,
    initials: parsed.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
    roles: [{ id: `r_${uuid()}`, name: "Владелец", color: "#f97316" }],
    channels: [generalChannel],
    memberIds: ["u_aria"]
  };

  servers.set(id, server);
  messages.set(generalChannel.id, []);
  io.emit("server:created", server);
  response.status(201).json(server);
});

app.post("/api/servers/:serverId/channels", (request, response) => {
  const { serverId } = request.params;
  const server = servers.get(serverId);

  if (!server) {
    response.status(404).json({ error: "Сервер не найден" });
    return;
  }

  const parsed = createChannelInput.parse(request.body);
  const channel: Channel = {
    id: `c_${uuid()}`,
    serverId,
    name: parsed.name || "channel",
    type: parsed.type
  };

  server.channels.push(channel);
  messages.set(channel.id, []);
  io.to(serverId).emit("channel:created", { serverId, channel });
  response.status(201).json(channel);
});

app.post("/api/livekit/token", async (request, response) => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    response.status(501).json({
      error: "LiveKit не настроен",
      requiredEnv: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
    });
    return;
  }

  const parsed = liveKitTokenInput.parse(request.body);
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: parsed.identity,
    name: parsed.name
  });

  token.addGrant({
    room: parsed.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  response.json({
    url: LIVEKIT_URL,
    token: await token.toJwt()
  });
});

io.on("connection", (socket) => {
  const auth = socket.handshake.auth as {
    userId?: string;
    displayName?: string;
  };
  const userId = auth.userId || `guest_${socket.id}`;

  if (!users.has(userId)) {
    users.set(userId, {
      id: userId,
      displayName: auth.displayName || "Гость",
      status: "online",
      accent: "#a78bfa"
    });
  }

  const user = users.get(userId);
  if (user) {
    user.status = "online";
  }

  io.emit("presence:update", Array.from(users.values()));

  socket.on("server:join", (serverId: string) => {
    socket.join(serverId);
  });

  socket.on("channel:join", (channelId: string) => {
    socket.join(channelId);
  });

  socket.on("typing:start", (payload: { channelId: string }) => {
    socket.to(payload.channelId).emit("typing:update", {
      channelId: payload.channelId,
      userId,
      isTyping: true
    });
  });

  socket.on("typing:stop", (payload: { channelId: string }) => {
    socket.to(payload.channelId).emit("typing:update", {
      channelId: payload.channelId,
      userId,
      isTyping: false
    });
  });

  socket.on(
    "message:send",
    (
      payload: { channelId: string; body: string },
      ack?: (result: { ok: boolean; message?: Message; error?: string }) => void
    ) => {
      try {
        const message = createMessage({
          channelId: payload.channelId,
          authorId: userId,
          body: payload.body
        });
        io.to(payload.channelId).emit("message:new", message);
        ack?.({ ok: true, message });
      } catch (error) {
        ack?.({
          ok: false,
          error: error instanceof Error ? error.message : "Сообщение не отправлено"
        });
      }
    }
  );

  socket.on("disconnect", () => {
    const disconnectedUser = users.get(userId);
    if (disconnectedUser) {
      disconnectedUser.status = "offline";
    }
    io.emit("presence:update", Array.from(users.values()));
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`API запущен на http://localhost:${port}`);
});

configureRedisAdapter().catch((error) => {
  console.warn("Redis adapter отключен: ошибка настройки", error);
});
