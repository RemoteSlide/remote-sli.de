import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS } from "../src/protocol";
import { TestClient, createSession } from "./helpers";

describe("GET /api/session", () => {
  it("creates a session with a cookie and an SVG QR code", async () => {
    const response = await SELF.fetch("https://example.com/api/session");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await response.json()) as { session: string; qr: string };
    expect(body.session).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(body.qr.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = atob(body.qr.slice("data:image/svg+xml;base64,".length));
    expect(svg).toContain("<svg");

    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`rs-session-id=${body.session}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("continues the session named by the cookie", async () => {
    const first = await createSession();
    const response = await SELF.fetch("https://example.com/api/session", { headers: { Cookie: first.cookie } });
    const body = (await response.json()) as { session: string };
    expect(body.session).toBe(first.id);
  });

  it("starts over when the cookie names an unknown or malformed session", async () => {
    for (const cookie of ["rs-session-id=zzzzzzzzzz", "rs-session-id=../../etc", "rs-session-id="]) {
      const response = await SELF.fetch("https://example.com/api/session", { headers: { Cookie: cookie } });
      const body = (await response.json()) as { session: string };
      expect(body.session).not.toBe("zzzzzzzzzz");
      expect(body.session).toMatch(/^[A-Za-z0-9]{10}$/);
    }
  });

  it("rejects other methods", async () => {
    const response = await SELF.fetch("https://example.com/api/session", { method: "POST" });
    expect(response.status).toBe(405);
  });
});

describe("routing", () => {
  it("answers preflight requests", async () => {
    const response = await SELF.fetch("https://example.com/api/session", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("redirects www to the canonical origin", async () => {
    const response = await SELF.fetch("https://www.remote-sli.de/abc?x=1", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://remote-sli.de/abc?x=1");
  });

  it("requires a WebSocket upgrade and a valid role on /ws", async () => {
    const plain = await SELF.fetch("https://example.com/ws/abcdefghij?as=host");
    expect(plain.status).toBe(426);
    const badId = await SELF.fetch("https://example.com/ws/short?as=host", { headers: { Upgrade: "websocket" } });
    expect(badId.status).toBe(400);
    const badRole = await SELF.fetch("https://example.com/ws/abcdefghij?as=admin", {
      headers: { Upgrade: "websocket" },
    });
    expect(badRole.status).toBe(400);
  });

  it("serves static assets and the SPA fallback with CORS", async () => {
    const asset = await SELF.fetch("https://example.com/robots.txt");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const fallback = await SELF.fetch("https://example.com/abcdefghij");
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain('ng-app="slideApp"');
  });
});

describe("session room", () => {
  it("tells a client when the session does not exist", async () => {
    const client = await TestClient.connect("nosuchsess", "remote");
    expect(await client.next()).toEqual({ event: "init", state: "not_found" });
    expect((await client.closed).code).toBe(4004);
  });

  it("connects host, remote and observer and announces them to each other", async () => {
    const { id } = await createSession();

    const observer = await TestClient.connect(id, "observer");
    expect(await observer.next()).toMatchObject({
      event: "init",
      state: "success",
      youAre: "observer",
      yourId: 0,
      info: { observer: { id: 0 }, host: false, remotes: [] },
    });

    const host = await TestClient.connect(id, "host", "bookmark");
    expect(await host.next()).toMatchObject({
      event: "init",
      state: "success",
      youAre: "host",
      yourId: 1,
      info: { host: { id: 1, injector: "bookmark" } },
    });
    expect(await observer.next()).toMatchObject({
      event: "info",
      type: "client_connected",
      clientType: "host",
      who: "host",
      info: { host: { id: 1, injector: "bookmark" } },
    });

    const remote = await TestClient.connect(id, "remote");
    expect(await remote.next()).toMatchObject({
      event: "init",
      youAre: "remote",
      yourId: 2,
      info: { host: { id: 1 }, remotes: [{ id: 2 }] },
    });
    for (const peer of [observer, host]) {
      expect(await peer.next()).toMatchObject({
        event: "info",
        type: "client_connected",
        clientType: "remote",
        who: 2,
        info: { remotes: [{ id: 2 }] },
      });
    }
  });

  it("relays control events from remotes to the host and the other remotes", async () => {
    const { id } = await createSession();
    const observer = await TestClient.connect(id, "observer");
    const host = await TestClient.connect(id, "host");
    const remote = await TestClient.connect(id, "remote");
    const other = await TestClient.connect(id, "remote");
    await Promise.all([observer.nextEvent("init"), host.nextEvent("init"), remote.nextEvent("init"), other.nextEvent("init")]);
    // Drain the connection announcements.
    await observer.nextEvent("info");
    await observer.nextEvent("info");
    await observer.nextEvent("info");
    await host.nextEvent("info");
    await host.nextEvent("info");

    remote.send({ event: "control", keyCode: 39, keys: { shift: true, bogus: true } });
    const expected = { event: "control", keyCode: 39, keys: { shift: true }, from: 2 };
    expect(await host.next()).toEqual(expected);
    expect(await remote.next()).toEqual(expected);
    expect(await other.next()).toEqual(expected);
    await observer.expectSilence();

    host.send({ event: "control", keyCode: 39 });
    expect(await host.next()).toMatchObject({ event: "err", code: 403 });

    remote.send({ event: "control" });
    expect(await remote.next()).toMatchObject({ event: "err", code: 400 });
  });

  it("forwards application events between remote and host and remembers settings", async () => {
    const { id } = await createSession();
    const host = await TestClient.connect(id, "host");
    const remote = await TestClient.connect(id, "remote");
    await host.nextEvent("init");
    await remote.nextEvent("init");
    await host.nextEvent("info");

    const settings = { username: "Haylee", laserStyle: { color: "red" } };
    remote.send({ event: "settings", settings });
    expect(await host.next()).toEqual({ event: "settings", settings, from: 1, fromType: "remote" });

    remote.send({ event: "get", what: "connectionInfo" });
    expect(await remote.next()).toMatchObject({
      event: "connectionInfo",
      info: { host: { id: 0 }, remotes: [{ id: 1, settings }] },
    });

    host.send({ event: "screenshot", data: { image: "abc" } });
    expect(await remote.next()).toEqual({ event: "screenshot", data: { image: "abc" }, from: 0, fromType: "host" });

    remote.send({ event: "deviceOrientation", v: [1, 2, 3] });
    expect(await host.next()).toEqual({ event: "deviceOrientation", v: [1, 2, 3], from: 1, fromType: "remote" });
    await remote.expectSilence();

    // Reserved names cannot be spoofed.
    remote.send({ event: "init", state: "success" });
    expect(await remote.next()).toMatchObject({ event: "err", code: 400 });
    await host.expectSilence();
  });

  it("answers heartbeats and rejects garbage", async () => {
    const { id } = await createSession();
    const remote = await TestClient.connect(id, "remote");
    await remote.nextEvent("init");

    remote.sendRaw('{"event":"latency"}');
    expect(await remote.next()).toEqual({ event: "latency" });

    remote.send({ event: "latency", t: 123 });
    expect(await remote.next()).toMatchObject({ event: "latency", t: expect.any(Number) });

    remote.sendRaw("not json");
    expect(await remote.next()).toMatchObject({ event: "err", code: 400 });
    remote.sendRaw("[1,2]");
    expect(await remote.next()).toMatchObject({ event: "err", code: 400 });
  });

  it("replaces an existing host without announcing a disconnect", async () => {
    const { id } = await createSession();
    const remote = await TestClient.connect(id, "remote");
    await remote.nextEvent("init");
    const host1 = await TestClient.connect(id, "host", "extension_chrome");
    await host1.nextEvent("init");
    await remote.nextEvent("info");

    const host2 = await TestClient.connect(id, "host", "bookmark");
    expect(await host2.next()).toMatchObject({ event: "init", info: { host: { id: 2, injector: "bookmark" } } });
    expect((await host1.closed).code).toBe(4001);
    expect(await remote.next()).toMatchObject({
      event: "info",
      type: "client_connected",
      clientType: "host",
      info: { host: { id: 2, injector: "bookmark" } },
    });
    await remote.expectSilence();
  });

  it("announces disconnects", async () => {
    const { id } = await createSession();
    const observer = await TestClient.connect(id, "observer");
    const host = await TestClient.connect(id, "host");
    const remote = await TestClient.connect(id, "remote");
    await observer.nextEvent("init");
    await host.nextEvent("init");
    await remote.nextEvent("init");
    await observer.nextEvent("info");
    await observer.nextEvent("info");
    await host.nextEvent("info");

    remote.close();
    for (const peer of [observer, host]) {
      expect(await peer.next()).toMatchObject({
        event: "info",
        type: "client_disconnected",
        clientType: "remote",
        who: 2,
        info: { remotes: [] },
      });
    }

    host.close();
    expect(await observer.next()).toMatchObject({
      event: "info",
      type: "client_disconnected",
      clientType: "host",
      info: { host: false },
    });
  });

  it("expires idle sessions from the alarm", async () => {
    const { id, cookie } = await createSession();
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));

    // Fresh session: the alarm just reschedules.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.touch()).toBe(true);

    await runInDurableObject(stub, async (_instance, state) => {
      const meta = (await state.storage.get("meta")) as { lastActivity: number };
      meta.lastActivity = Date.now() - SESSION_TTL_MS - 1;
      await state.storage.put("meta", meta);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.touch()).toBe(false);

    // The observer's cookie no longer resolves, so it gets a new session.
    const response = await SELF.fetch("https://example.com/api/session", { headers: { Cookie: cookie } });
    const body = (await response.json()) as { session: string };
    expect(body.session).not.toBe(id);

    const client = await TestClient.connect(id, "remote");
    expect(await client.next()).toEqual({ event: "init", state: "not_found" });
  });

  it("keeps a session alive while sockets are connected", async () => {
    const { id } = await createSession();
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
    const host = await TestClient.connect(id, "host");
    await host.nextEvent("init");

    await runInDurableObject(stub, async (_instance, state) => {
      const meta = (await state.storage.get("meta")) as { lastActivity: number };
      meta.lastActivity = Date.now() - SESSION_TTL_MS - 1;
      await state.storage.put("meta", meta);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.touch()).toBe(true);
  });
});
