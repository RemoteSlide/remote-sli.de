import { qrDataUrl } from "./qr";
import { SESSION_COOKIE, SESSION_ID_PATTERN, SESSION_TTL_MS, generateSessionId, isRole } from "./protocol";

export { SessionRoom } from "./session-room";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const redirect = canonicalRedirect(url, env);
    if (redirect) {
      return redirect;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/session") {
      return withCors(await handleSession(request, env));
    }

    const wsMatch = /^\/ws\/([A-Za-z0-9]+)$/.exec(url.pathname);
    if (wsMatch) {
      return handleWebSocket(request, env, wsMatch[1] ?? "");
    }

    if (url.pathname === "/api/health") {
      return withCors(Response.json({ ok: true }));
    }

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) {
      return withCors(new Response("Not found", { status: 404 }));
    }

    // The injected controller loads overlay.html and scripts from here into
    // third-party presentation pages, so assets need permissive CORS.
    return withCors(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;

/** Redirects alternative hostnames to the canonical origin. */
function canonicalRedirect(url: URL, env: Env): Response | undefined {
  const hosts = (env.REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!env.CANONICAL_ORIGIN || !hosts.includes(url.hostname.toLowerCase())) {
    return undefined;
  }
  return Response.redirect(`${env.CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
}

/**
 * GET /api/session — continues the observer's session (from its cookie) or
 * creates a new one, and returns the id together with a QR code that points
 * at the remote page.
 */
async function handleSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, OPTIONS" } });
  }
  const url = new URL(request.url);

  let sessionId = readCookie(request, SESSION_COOKIE);
  let resumed = false;
  if (sessionId && SESSION_ID_PATTERN.test(sessionId)) {
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
    resumed = await stub.touch();
  }
  if (!resumed) {
    sessionId = generateSessionId();
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
    await stub.create(sessionId);
    console.info(`New session: ${sessionId}`);
  }

  const remoteUrl = `${env.CANONICAL_ORIGIN ?? url.origin}/${sessionId}`;
  const qr = await qrDataUrl(remoteUrl);

  const cookie = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
    url.protocol === "https:" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return Response.json(
    { session: sessionId, qr },
    { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
  );
}

/** GET /ws/:session?as=host|remote|observer — joins a session over WebSocket. */
function handleWebSocket(request: Request, env: Env, sessionId: string): Response | Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return new Response("Invalid session id", { status: 400 });
  }
  const role = new URL(request.url).searchParams.get("as");
  if (!isRole(role)) {
    return new Response("Query parameter 'as' must be host, remote or observer", { status: 400 });
  }
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
  return stub.fetch(request);
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
