import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSseClient } from "./sse-client";
import type { RealtimeConnectionStatus, RealtimeFrame } from "./types";

function makeSseResponse(chunks: string[], status = 200, headers: Record<string, string> = { "content-type": "text/event-stream; charset=utf-8" }) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
    return new Response(stream, { status, headers });
}

describe("sse-client", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sends auth headers and follows backoff sequence 1s -> 2s -> 5s -> 10s -> 30s and resets after frame", async () => {
        const statuses: RealtimeConnectionStatus[] = [];
        const frames: RealtimeFrame[] = [];
        let callCount = 0;

        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            callCount++;
            const headers = init?.headers as Record<string, string>;
            expect(headers["Authorization"]).toBe("Bearer tok-1");
            expect(headers["X-Client"]).toBe("WebGui");
            expect(headers["Accept"]).toBe("text/event-stream");

            // Fail first 5 times, succeed on 6th with hello frame, then close stream
            if (callCount <= 5) {
                return new Response("", { status: 503 });
            }
            if (callCount === 6) {
                return makeSseResponse(['event: hello\ndata: {"v":1,"ts":1}\n\n']);
            }
            return new Response("", { status: 503 });
        });

        const client = createSseClient({
            url: "/api/webgui/events?vault=doge",
            token: "tok-1",
            fetchFn: fetchMock as unknown as typeof fetch,
            random: () => 0, // deterministic zero jitter
            onFrame: (f) => frames.push(f),
            onStatusChange: (s) => statuses.push(s),
        });

        client.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(callCount).toBe(1);

        // Attempt 0 -> 1000ms
        await vi.advanceTimersByTimeAsync(999);
        expect(callCount).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(callCount).toBe(2);

        // Attempt 1 -> 2000ms
        await vi.advanceTimersByTimeAsync(2000);
        expect(callCount).toBe(3);

        // Attempt 2 -> 5000ms
        await vi.advanceTimersByTimeAsync(5000);
        expect(callCount).toBe(4);

        // Attempt 3 -> 10000ms
        await vi.advanceTimersByTimeAsync(10000);
        expect(callCount).toBe(5);

        // Attempt 4 -> 30000ms -> 6th call succeeds with hello, then closes
        await vi.advanceTimersByTimeAsync(30000);
        expect(callCount).toBe(6);
        expect(frames).toHaveLength(1);
        expect(statuses).toContain("connected");

        // After successful frame, backoff resets to 1000ms
        await vi.advanceTimersByTimeAsync(1000);
        expect(callCount).toBe(7);

        client.stop();
    });

    it("stops permanently without retrying on 401, 403, 404, or non-SSE html fallback", async () => {
        for (const scenario of [
            new Response("", { status: 401 }),
            new Response("", { status: 403 }),
            new Response("", { status: 404 }),
            new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
        ]) {
            const fetchMock = vi.fn(async () => scenario);
            const statuses: RealtimeConnectionStatus[] = [];

            const client = createSseClient({
                url: "/api/webgui/events?vault=doge",
                token: "tok-1",
                fetchFn: fetchMock as unknown as typeof fetch,
                onFrame: () => {},
                onStatusChange: (s) => statuses.push(s),
            });

            client.start();
            await vi.advanceTimersByTimeAsync(120000);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(client.getStatus()).toBe("stopped");
            expect(statuses.at(-1)).toBe("stopped");
            client.stop();
        }
    });

    it("uses long backoff (>= 60s) on 429", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 429 }));

        const client = createSseClient({
            url: "/api/webgui/events?vault=doge",
            token: "tok-1",
            fetchFn: fetchMock as unknown as typeof fetch,
            random: () => 0,
            onFrame: () => {},
        });

        client.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(59999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        client.stop();
    });

    it("reconnects immediately on online or visibilitychange -> visible while in backoff", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 503 }));

        const client = createSseClient({
            url: "/api/webgui/events?vault=doge",
            token: "tok-1",
            fetchFn: fetchMock as unknown as typeof fetch,
            random: () => 0,
            onFrame: () => {},
        });

        client.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(client.getStatus()).toBe("backoff");

        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        client.stop();
    });

    it("ignores visibilitychange and online events during 429 rate-limit backoff until Retry-After expires", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "90" } }));

        const client = createSseClient({
            url: "/api/webgui/events?vault=doge",
            token: "tok-1",
            fetchFn: fetchMock as unknown as typeof fetch,
            random: () => 0,
            onFrame: () => {},
        });

        client.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(client.getStatus()).toBe("backoff");

        // Tab switch and online event during 90s rate-limit window must not interrupt backoff
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(89999);
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Once Retry-After (90s) expires, scheduled reconnect fires
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        client.stop();
    });
});
