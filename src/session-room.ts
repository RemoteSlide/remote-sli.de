import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_REPLACED,
  CLOSE_SESSION_NOT_FOUND,
  CLOSE_TIMED_OUT,
  HEARTBEAT_REQUEST,
  HEARTBEAT_RESPONSE,
  RESERVED_EVENTS,
  SESSION_TTL_MS,
  isRole,
  parseClientMessage,
  sanitizeKeys,
  type ConnectionInfo,
  type Role,
} from "./protocol";

/** How often the alarm checks connected sockets for liveness. */
const LIVENESS_CHECK_MS = 15_000;
/** A socket that has not sent anything (heartbeats included) for this long is dropped. */
const LIVENESS_TIMEOUT_MS = 45_000;
/** Attachments are capped at 16 KiB by the runtime; leave room for the rest of the record. */
const MAX_SETTINGS_BYTES = 8_192;
/** Incoming frames larger than this are refused (screenshots are ~50-100 KB). */
const MAX_MESSAGE_BYTES = 1_000_000;

interface Meta {
  id: string;
  createdAt: number;
  lastActivity: number;
  clientCounter: number;
}

/** Per-connection state; survives hibernation via serializeAttachment. */
interface Attachment {
  id: number;
  role: Role;
  injector?: string;
  connectedAt: number;
  settings?: unknown;
}

const META_KEY = "meta";

/**
 * One Durable Object per session. Holds the host, the remotes and the
 * observer of that session as hibernatable WebSockets and relays messages
 * between them. The object itself only wakes up for real traffic; heartbeats
 * are answered by the runtime.
 */
export class SessionRoom extends DurableObject<Env> {
  /** Sockets whose departure has already been announced. */
  private readonly gone = new WeakSet<WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_REQUEST, HEARTBEAT_RESPONSE));
  }

  // ---------------------------------------------------------------- RPC ---

  /** Creates the session if it does not exist yet. Returns the session id. */
  async create(id: string): Promise<string> {
    const existing = await this.getMeta();
    if (existing) {
      await this.touchMeta(existing);
      return existing.id;
    }
    const now = Date.now();
    const meta: Meta = { id, createdAt: now, lastActivity: now, clientCounter: 0 };
    await this.ctx.storage.put(META_KEY, meta);
    await this.scheduleAlarm(meta);
    return id;
  }

  /** Refreshes the session's activity timestamp. Returns false if the session does not exist. */
  async touch(): Promise<boolean> {
    const meta = await this.getMeta();
    if (!meta) {
      return false;
    }
    await this.touchMeta(meta);
    return true;
  }

  /** Read-only snapshot of who is connected. */
  async connectionInfo(): Promise<ConnectionInfo | undefined> {
    const meta = await this.getMeta();
    return meta ? this.buildConnectionInfo() : undefined;
  }

  // ---------------------------------------------------------- WebSocket ---

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get("as");
    if (!isRole(role)) {
      return new Response("Query parameter 'as' must be host, remote or observer", { status: 400 });
    }
    const injector = url.searchParams.get("injector")?.slice(0, 64) || undefined;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const meta = await this.getMeta();
    if (!meta) {
      // Tell the client why before closing so it can show "session not found"
      // instead of retrying forever.
      server.accept();
      server.send(JSON.stringify({ event: "init", state: "not_found" }));
      server.close(CLOSE_SESSION_NOT_FOUND, "Session not found");
      return new Response(null, { status: 101, webSocket: client });
    }

    const attachment: Attachment = {
      id: meta.clientCounter++,
      role,
      injector,
      connectedAt: Date.now(),
    };
    meta.lastActivity = attachment.connectedAt;
    await this.ctx.storage.put(META_KEY, meta);

    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(attachment);

    // Only one host and one observer per session: a newer connection wins.
    if (role === "host" || role === "observer") {
      for (const other of this.openSockets(role)) {
        if (other !== server) {
          this.gone.add(other);
          other.close(CLOSE_REPLACED, "Replaced by a newer connection");
        }
      }
    }

    const info = this.buildConnectionInfo();
    this.send(server, {
      event: "init",
      state: "success",
      youAre: role,
      yourId: attachment.id,
      info,
    });

    if (role === "host") {
      this.broadcast(["observer", "remote"], {
        event: "info",
        type: "client_connected",
        clientType: "host",
        who: "host",
        info,
      });
    } else if (role === "remote") {
      this.broadcast(["observer", "host"], {
        event: "info",
        type: "client_connected",
        clientType: "remote",
        who: attachment.id,
        info,
      });
    }

    await this.scheduleAlarm(meta);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") {
      this.sendError(ws, 400, "Binary frames are not supported");
      return;
    }
    if (raw.length > MAX_MESSAGE_BYTES) {
      this.sendError(ws, 413, "Message too large");
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      this.sendError(ws, 400, "Expected a JSON object with an 'event' field");
      return;
    }
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me) {
      this.sendError(ws, 400, "Invalid session");
      return;
    }

    switch (message.event) {
      case "latency":
        // Heartbeats with extra fields miss the auto-response; answer them here.
        this.send(ws, { event: "latency", t: Date.now() });
        return;

      case "get":
        if (message.what === "connectionInfo") {
          this.send(ws, { event: "connectionInfo", info: this.buildConnectionInfo() });
        } else {
          this.sendError(ws, 400, "Unknown 'what' for get");
        }
        return;

      case "control": {
        if (me.role !== "remote") {
          this.sendError(ws, 403, "Only remotes can send control events");
          return;
        }
        const keyCode = message.keyCode;
        if (typeof keyCode !== "number" || !Number.isInteger(keyCode) || keyCode <= 0 || keyCode > 255) {
          this.sendError(ws, 400, "Missing keyCode");
          return;
        }
        const payload = { event: "control", keyCode, keys: sanitizeKeys(message.keys), from: me.id };
        // The host acts on it, the remotes use it for feedback (vibration).
        this.broadcast(["host", "remote"], payload);
        return;
      }

      default:
        if (RESERVED_EVENTS.has(message.event)) {
          this.sendError(ws, 400, `'${message.event}' cannot be sent by clients`);
          return;
        }
        this.forward(ws, me, message);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    await this.handleGone(ws);
    void code;
    void reason;
    void wasClean;
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.warn("WebSocket error", error);
    await this.handleGone(ws);
  }

  // -------------------------------------------------------------- Alarm ---

  override async alarm(): Promise<void> {
    const meta = await this.getMeta();
    if (!meta) {
      return;
    }
    const now = Date.now();

    const sockets = this.ctx.getWebSockets();
    if (sockets.length > 0) {
      for (const ws of sockets) {
        if (ws.readyState !== WebSocket.READY_STATE_OPEN) {
          continue;
        }
        const attachment = ws.deserializeAttachment() as Attachment | null;
        const lastHeartbeat = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
        const lastSeen = Math.max(lastHeartbeat, attachment?.connectedAt ?? 0);
        if (now - lastSeen > LIVENESS_TIMEOUT_MS) {
          ws.close(CLOSE_TIMED_OUT, "Heartbeat timed out");
          await this.handleGone(ws);
        }
      }
    }

    if (this.openSockets().length > 0) {
      meta.lastActivity = now;
      await this.ctx.storage.put(META_KEY, meta);
      await this.scheduleAlarm(meta);
      return;
    }

    if (now - meta.lastActivity >= SESSION_TTL_MS) {
      console.info(`Session ${meta.id} expired`);
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.scheduleAlarm(meta);
  }

  // ------------------------------------------------------------ Helpers ---

  private async getMeta(): Promise<Meta | undefined> {
    return this.ctx.storage.get<Meta>(META_KEY);
  }

  private async touchMeta(meta: Meta): Promise<void> {
    meta.lastActivity = Date.now();
    await this.ctx.storage.put(META_KEY, meta);
    await this.scheduleAlarm(meta);
  }

  private async scheduleAlarm(meta: Meta): Promise<void> {
    const next =
      this.openSockets().length > 0 ? Date.now() + LIVENESS_CHECK_MS : meta.lastActivity + SESSION_TTL_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || Math.abs(current - next) > 1_000) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  private openSockets(role?: Role): WebSocket[] {
    return this.ctx.getWebSockets(role).filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private attachmentOf(ws: WebSocket): Attachment | null {
    return ws.deserializeAttachment() as Attachment | null;
  }

  private buildConnectionInfo(): ConnectionInfo {
    const host = this.openSockets("host").map((ws) => this.attachmentOf(ws)).find(Boolean);
    const observer = this.openSockets("observer").map((ws) => this.attachmentOf(ws)).find(Boolean);
    const remotes = this.openSockets("remote")
      .map((ws) => this.attachmentOf(ws))
      .filter((a): a is Attachment => a !== null)
      .map((a) => ({ id: a.id, settings: a.settings }));
    return {
      observer: observer ? { id: observer.id } : false,
      host: host ? { id: host.id, injector: host.injector } : false,
      remotes,
    };
  }

  private send(ws: WebSocket, payload: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to send", error);
    }
  }

  private sendError(ws: WebSocket, code: number, msg: string): void {
    this.send(ws, { event: "err", code, msg });
  }

  private broadcast(roles: Role[], payload: Record<string, unknown>, except?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const role of roles) {
      for (const ws of this.openSockets(role)) {
        if (ws === except) continue;
        try {
          ws.send(encoded);
        } catch (error) {
          console.warn("Failed to broadcast", error);
        }
      }
    }
  }

  /** Relays an application event from a remote to the host, or from the host to all remotes. */
  private forward(ws: WebSocket, me: Attachment, message: Record<string, unknown>): void {
    const { event, ...data } = message;

    if (event === "settings") {
      const settings = data.settings;
      if (JSON.stringify(settings ?? null).length > MAX_SETTINGS_BYTES) {
        this.sendError(ws, 413, "Settings too large");
        return;
      }
      me.settings = settings;
      ws.serializeAttachment(me);
    }

    const payload = { ...data, event, from: me.id, fromType: me.role };
    if (me.role === "remote") {
      this.broadcast(["host"], payload);
    } else if (me.role === "host") {
      this.broadcast(["remote"], payload);
    } else {
      this.sendError(ws, 403, "Observers cannot forward events");
    }
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    if (this.gone.has(ws)) {
      return;
    }
    this.gone.add(ws);

    const me = this.attachmentOf(ws);
    if (me) {
      const info = this.buildConnectionInfo();
      if (me.role === "host" && !info.host) {
        this.broadcast(["observer", "remote"], {
          event: "info",
          type: "client_disconnected",
          clientType: "host",
          who: "host",
          info,
        });
      } else if (me.role === "remote") {
        this.broadcast(
          ["observer", "host", "remote"],
          { event: "info", type: "client_disconnected", clientType: "remote", who: me.id, info },
          ws,
        );
      }
    }

    const meta = await this.getMeta();
    if (meta) {
      meta.lastActivity = Date.now();
      await this.ctx.storage.put(META_KEY, meta);
      await this.scheduleAlarm(meta);
    }
  }
}
