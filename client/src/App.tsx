import {
  Bell,
  ChevronDown,
  Hash,
  Headphones,
  Mic,
  MonitorUp,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  UserRound,
  Volume2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

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

type BootstrapPayload = {
  currentUser: User;
  users: User[];
  servers: GuildServer[];
};

type TypingUpdate = {
  channelId: string;
  userId: string;
  isTyping: boolean;
};

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL ?? "http://localhost:4000");

function normalizeApiUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}

const formatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit"
});

const statusLabels: Record<User["status"], string> = {
  online: "в сети",
  idle: "неактивен",
  offline: "не в сети"
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [servers, setServers] = useState<GuildServer[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>("");
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [voiceState, setVoiceState] = useState("Отключено");
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? servers[0],
    [activeServerId, servers]
  );

  const activeChannel = useMemo(
    () =>
      activeServer?.channels.find((channel) => channel.id === activeChannelId) ??
      activeServer?.channels.find((channel) => channel.type === "text") ??
      activeServer?.channels[0],
    [activeChannelId, activeServer]
  );

  const members = useMemo(() => {
    if (!activeServer) {
      return [];
    }

    const memberSet = new Set(activeServer.memberIds);
    return users.filter((user) => memberSet.has(user.id));
  }, [activeServer, users]);

  const typingNames = useMemo(
    () =>
      typingUserIds
        .map((userId) => users.find((user) => user.id === userId)?.displayName)
        .filter(Boolean)
        .join(", "),
    [typingUserIds, users]
  );

  useEffect(() => {
    let isMounted = true;

    fetch(`${API_URL}/api/bootstrap`)
      .then((response) => response.json() as Promise<BootstrapPayload>)
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        setCurrentUser(payload.currentUser);
        setUsers(payload.users);
        setServers(payload.servers);
        setActiveServerId(payload.servers[0]?.id ?? "");
        const firstTextChannel = payload.servers[0]?.channels.find(
          (channel) => channel.type === "text"
        );
        setActiveChannelId(firstTextChannel?.id ?? payload.servers[0]?.channels[0]?.id ?? "");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const socket = io(API_URL, {
      auth: {
        userId: currentUser.id,
        displayName: currentUser.displayName
      }
    });

    socketRef.current = socket;

    socket.on("presence:update", (payload: User[]) => {
      setUsers(payload);
    });

    socket.on("message:new", (message: Message) => {
      setMessages((current) => {
        if (current.some((existing) => existing.id === message.id)) {
          return current;
        }

        return [...current, message];
      });
    });

    socket.on("server:created", (server: GuildServer) => {
      setServers((current) => [...current, server]);
    });

    socket.on(
      "channel:created",
      (payload: { serverId: string; channel: Channel }) => {
        setServers((current) =>
          current.map((server) =>
            server.id === payload.serverId
              ? { ...server, channels: [...server.channels, payload.channel] }
              : server
          )
        );
      }
    );

    socket.on("typing:update", (payload: TypingUpdate) => {
      if (payload.userId === currentUser.id || payload.channelId !== activeChannelId) {
        return;
      }

      setTypingUserIds((current) => {
        const next = new Set(current);
        if (payload.isTyping) {
          next.add(payload.userId);
        } else {
          next.delete(payload.userId);
        }
        return Array.from(next);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeChannelId, currentUser]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }

    socketRef.current?.emit("server:join", activeServerId);
  }, [activeServerId]);

  useEffect(() => {
    if (!activeChannel) {
      return;
    }

    socketRef.current?.emit("channel:join", activeChannel.id);
    setTypingUserIds([]);

    if (activeChannel.type === "voice") {
      setMessages([]);
      return;
    }

    fetch(`${API_URL}/api/channels/${activeChannel.id}/messages`)
      .then((response) => response.json() as Promise<Message[]>)
      .then(setMessages);
  }, [activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const usersById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users]
  );

  function stopTyping(channelId: string) {
    socketRef.current?.emit("typing:stop", { channelId });
  }

  function handleDraftChange(value: string) {
    setDraft(value);

    if (!activeChannel || activeChannel.type !== "text") {
      return;
    }

    socketRef.current?.emit("typing:start", { channelId: activeChannel.id });

    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
    }

    typingTimer.current = window.setTimeout(() => {
      stopTyping(activeChannel.id);
    }, 900);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!draft.trim() || !activeChannel || activeChannel.type !== "text") {
      return;
    }

    const body = draft.trim();
    setDraft("");
    stopTyping(activeChannel.id);

    socketRef.current?.emit(
      "message:send",
      { channelId: activeChannel.id, body },
      (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          setDraft(body);
        }
      }
    );
  }

  async function createServer() {
    const name = window.prompt("Название сервера");
    if (!name?.trim()) {
      return;
    }

    const response = await fetch(`${API_URL}/api/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const server = (await response.json()) as GuildServer;
    setActiveServerId(server.id);
    setActiveChannelId(server.channels[0]?.id ?? "");
  }

  async function createChannel(type: ChannelType) {
    if (!activeServer) {
      return;
    }

    const name = window.prompt(
      `${type === "text" ? "Текстовый" : "Голосовой"} канал`
    );
    if (!name?.trim()) {
      return;
    }

    const response = await fetch(`${API_URL}/api/servers/${activeServer.id}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type })
    });
    const channel = (await response.json()) as Channel;
    setActiveChannelId(channel.id);
  }

  async function connectVoice() {
    if (!activeChannel || !currentUser) {
      return;
    }

    setVoiceState("Подключение");

    const response = await fetch(`${API_URL}/api/livekit/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: activeChannel.id,
        identity: currentUser.id,
        name: currentUser.displayName
      })
    });

    if (!response.ok) {
      setVoiceState("LiveKit не настроен");
      return;
    }

    setVoiceState("Токен готов");
  }

  if (isLoading || !activeServer || !activeChannel || !currentUser) {
    return (
      <main className="loading-shell">
        <div className="loading-mark">N</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <nav className="server-rail" aria-label="Серверы">
        {servers.map((server) => (
          <button
            className={`server-pill ${server.id === activeServer.id ? "active" : ""}`}
            key={server.id}
            onClick={() => {
              setActiveServerId(server.id);
              setActiveChannelId(
                server.channels.find((channel) => channel.type === "text")?.id ??
                  server.channels[0]?.id ??
                  ""
              );
            }}
            title={server.name}
          >
            {server.initials}
          </button>
        ))}
        <button className="server-pill add" onClick={createServer} title="Создать сервер">
          <Plus size={22} />
        </button>
      </nav>

      <aside className="channel-panel">
        <button className="server-title" title="Меню сервера">
          <span>{activeServer.name}</span>
          <ChevronDown size={17} />
        </button>

        <div className="channel-section">
          <div className="section-title">
            <span>Текстовые каналы</span>
            <button onClick={() => createChannel("text")} title="Создать текстовый канал">
              <Plus size={15} />
            </button>
          </div>
          {activeServer.channels
            .filter((channel) => channel.type === "text")
            .map((channel) => (
              <button
                key={channel.id}
                className={`channel-row ${channel.id === activeChannel.id ? "active" : ""}`}
                onClick={() => setActiveChannelId(channel.id)}
              >
                <Hash size={17} />
                <span>{channel.name}</span>
              </button>
            ))}
        </div>

        <div className="channel-section">
          <div className="section-title">
            <span>Голосовые каналы</span>
            <button onClick={() => createChannel("voice")} title="Создать голосовой канал">
              <Plus size={15} />
            </button>
          </div>
          {activeServer.channels
            .filter((channel) => channel.type === "voice")
            .map((channel) => (
              <button
                key={channel.id}
                className={`channel-row ${channel.id === activeChannel.id ? "active" : ""}`}
                onClick={() => setActiveChannelId(channel.id)}
              >
                <Volume2 size={17} />
                <span>{channel.name}</span>
              </button>
            ))}
        </div>

        <div className="voice-card">
          <div>
            <strong>{voiceState}</strong>
            <span>{activeChannel.type === "voice" ? activeChannel.name : "Голосовой канал не выбран"}</span>
          </div>
          <div className="voice-actions">
            <button
              onClick={connectVoice}
              disabled={activeChannel.type !== "voice"}
              title="Подключиться к голосу"
            >
              <Headphones size={17} />
            </button>
            <button disabled={activeChannel.type !== "voice"} title="Демонстрация экрана">
              <MonitorUp size={17} />
            </button>
          </div>
        </div>

        <div className="profile-strip">
          <Avatar user={currentUser} />
          <div>
            <strong>{currentUser.displayName}</strong>
            <span>{statusLabels[currentUser.status]}</span>
          </div>
          <button title="Выключить микрофон">
            <Mic size={16} />
          </button>
          <button title="Настройки">
            <Settings size={16} />
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="channel-heading">
            {activeChannel.type === "text" ? <Hash size={22} /> : <Volume2 size={22} />}
            <div>
              <h1>{activeChannel.name}</h1>
              <span>{activeChannel.type === "text" ? "Чат в реальном времени" : "Комната LiveKit"}</span>
            </div>
          </div>
          <div className="header-actions">
            <button title="Уведомления">
              <Bell size={18} />
            </button>
            <button title="Поиск">
              <Search size={18} />
            </button>
            <button title="Участники">
              <UserRound size={18} />
            </button>
          </div>
        </header>

        {activeChannel.type === "text" ? (
          <>
            <div className="message-list">
              {messages.map((message) => {
                const author = usersById.get(message.authorId);

                return (
                  <article className="message-row" key={message.id}>
                    {author ? <Avatar user={author} /> : <div className="avatar fallback" />}
                    <div>
                      <div className="message-meta">
                        <strong>{author?.displayName ?? "Неизвестный пользователь"}</strong>
                        <time>{formatter.format(new Date(message.createdAt))}</time>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="typing-line">{typingNames ? `${typingNames} печатает` : ""}</div>

            <form className="composer" onSubmit={handleSubmit}>
              <input
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                placeholder={`Сообщение в #${activeChannel.name}`}
              />
              <button disabled={!draft.trim()} title="Отправить сообщение">
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="voice-room">
            <div className="voice-orb">
              <Volume2 size={52} />
            </div>
            <h2>{activeChannel.name}</h2>
            <p>{voiceState}</p>
            <button onClick={connectVoice}>
              <Headphones size={18} />
              Подключиться
            </button>
          </div>
        )}
      </section>

      <aside className="member-panel">
        <div className="member-block">
          <div className="section-title plain">
            <span>Роли</span>
            <Shield size={15} />
          </div>
          <div className="role-list">
            {activeServer.roles.map((role) => (
              <span className="role-chip" key={role.id} style={{ borderColor: role.color }}>
                <i style={{ background: role.color }} />
                {role.name}
              </span>
            ))}
          </div>
        </div>

        <div className="member-block">
          <div className="section-title plain">
            <span>Участники</span>
            <span>{members.length}</span>
          </div>
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <Avatar user={member} />
              <div>
                <strong>{member.displayName}</strong>
                <span>{statusLabels[member.status]}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}

function Avatar({ user }: { user: User }) {
  return (
    <div className="avatar" style={{ "--accent": user.accent } as React.CSSProperties}>
      <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
      <i className={`status-dot ${user.status}`} />
    </div>
  );
}

export default App;
