import { SELF } from "cloudflare:test";
import type { Role } from "../src/protocol";

export interface Frame {
  event: string;
  [key: string]: unknown;
}

/** Small WebSocket client that queues incoming frames so tests can await them in order. */
export class TestClient {
  private readonly queue: Frame[] = [];
  private readonly waiters: Array<(frame: Frame) => void> = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const frame = JSON.parse(String(event.data)) as Frame;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(frame);
      } else {
        this.queue.push(frame);
      }
    });
    this.closed = new Promise((resolve) => {
      ws.addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
    });
  }

  static async connect(sessionId: string, role: Role, injector?: string): Promise<TestClient> {
    const url = new URL(`https://example.com/ws/${sessionId}`);
    url.searchParams.set("as", role);
    if (injector) url.searchParams.set("injector", injector);
    const response = await SELF.fetch(url, { headers: { Upgrade: "websocket" } });
    if (response.status !== 101 || !response.webSocket) {
      throw new Error(`Expected a WebSocket upgrade, got ${response.status}: ${await response.text()}`);
    }
    response.webSocket.accept();
    return new TestClient(response.webSocket);
  }

  send(frame: Frame): void {
    this.ws.send(JSON.stringify(frame));
  }

  sendRaw(data: string): void {
    this.ws.send(data);
  }

  /** Resolves with the next frame, failing the test if nothing arrives in time. */
  next(timeoutMs = 2_000): Promise<Frame> {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for a frame"));
      }, timeoutMs);
      const waiter = (frame: Frame) => {
        clearTimeout(timer);
        resolve(frame);
      };
      this.waiters.push(waiter);
    });
  }

  /** Waits for the next frame with the given event name, skipping others. */
  async nextEvent(event: string, timeoutMs = 2_000): Promise<Frame> {
    for (;;) {
      const frame = await this.next(timeoutMs);
      if (frame.event === event) return frame;
    }
  }

  /** Asserts that nothing arrives for a short while. */
  async expectSilence(ms = 150): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (this.queue.length > 0) {
      throw new Error(`Expected no frames, got ${JSON.stringify(this.queue)}`);
    }
  }

  close(code = 1000, reason = ""): void {
    this.ws.close(code, reason);
  }
}

export async function createSession(): Promise<{ id: string; cookie: string; qr: string }> {
  const response = await SELF.fetch("https://example.com/api/session");
  if (!response.ok) {
    throw new Error(`Session creation failed: ${response.status}`);
  }
  const body = (await response.json()) as { session: string; qr: string };
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";
  return { id: body.session, cookie, qr: body.qr };
}
