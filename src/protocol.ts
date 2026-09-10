/**
 * Wire protocol shared by the website, the injected page controller and the
 * Chrome extension. Every frame is a JSON object with an `event` name; the
 * remaining keys are the payload. See PROTOCOL.md for the full description.
 */

export type Role = "host" | "remote" | "observer";
export const ROLES: readonly Role[] = ["host", "remote", "observer"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Session IDs are 10 alphanumeric characters; the client router relies on that. */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9]{10}$/;
export const SESSION_ID_LENGTH = 10;
const SESSION_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateSessionId(): string {
  const bytes = new Uint8Array(SESSION_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += SESSION_ID_ALPHABET[byte % SESSION_ID_ALPHABET.length];
  }
  return id;
}

/** Name of the cookie that lets an observer resume its session on reload. */
export const SESSION_COOKIE = "rs-session-id";

/** Sessions are dropped an hour after the last activity. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Heartbeat. Clients send exactly HEARTBEAT_REQUEST every couple of seconds;
 * the Durable Object answers with HEARTBEAT_RESPONSE without waking up. The
 * client uses the round trip to display its latency.
 */
export const HEARTBEAT_REQUEST = '{"event":"latency"}';
export const HEARTBEAT_RESPONSE = '{"event":"latency"}';

/** Events the server handles itself; anything else is relayed between peers. */
export const RESERVED_EVENTS: ReadonlySet<string> = new Set([
  "init",
  "info",
  "connectionInfo",
  "err",
  "control",
  "latency",
  "get",
  "connect",
  "disconnect",
]);

/** Close codes used by the server. Codes >= 4000 tell the client not to reconnect. */
export const CLOSE_SESSION_NOT_FOUND = 4004;
export const CLOSE_REPLACED = 4001;
export const CLOSE_TIMED_OUT = 4008;

export interface RemoteInfo {
  id: number;
  settings?: unknown;
}

export interface ConnectionInfo {
  observer: { id: number } | false;
  host: { id: number; injector?: string } | false;
  remotes: RemoteInfo[];
}

export interface ControlKeys {
  ctrl?: true;
  shift?: true;
  alt?: true;
}

export interface ClientMessage {
  event: string;
  [key: string]: unknown;
}

export function parseClientMessage(raw: unknown): ClientMessage | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const event = (parsed as { event?: unknown }).event;
  if (typeof event !== "string" || event.length === 0 || event.length > 64) {
    return undefined;
  }
  return parsed as ClientMessage;
}

export function sanitizeKeys(value: unknown): ControlKeys {
  const keys: ControlKeys = {};
  if (typeof value === "object" && value !== null) {
    const raw = value as Record<string, unknown>;
    if (raw.ctrl) keys.ctrl = true;
    if (raw.shift) keys.shift = true;
    if (raw.alt) keys.alt = true;
  }
  return keys;
}
