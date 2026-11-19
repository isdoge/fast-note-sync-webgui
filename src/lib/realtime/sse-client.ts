import { buildApiHeaders } from "@/lib/utils/api-headers";
import { createSseParser, parseRealtimeFrame } from "./sse-parser";
import type { RealtimeConnectionStatus, RealtimeFrame } from "./types";

export const BACKOFF_DELAYS_MS = [1000, 2000, 5000, 10000, 30000] as const;
export const RATE_LIMIT_BACKOFF_MS = 60000;

export function computeBackoffDelay(
    attempt: number,
    options: { isRateLimited?: boolean; retryAfterMs?: number; random?: () => number } = {}
): number {
    const random = options.random ?? Math.random;
    let baseDelay: number;

    if (options.isRateLimited) {
        baseDelay = Math.max(RATE_LIMIT_BACKOFF_MS, options.retryAfterMs ?? 0);
        baseDelay = Math.min(baseDelay, 300000);
    } else {
        const index = Math.min(Math.max(0, attempt), BACKOFF_DELAYS_MS.length - 1);
        baseDelay = BACKOFF_DELAYS_MS[index];
    }

    const jitter = Math.round(baseDelay * 0.25 * Math.max(0, Math.min(1, random())));
    return baseDelay + jitter;
}

function parseRetryAfterMs(headerValue: string | null): number {
    if (!headerValue) return 0;
    const seconds = Number(headerValue.trim());
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.round(seconds * 1000);
    }
    return 0;
}

export interface SseClientOptions {
    url: string;
    token: string;
    onFrame: (frame: RealtimeFrame) => void;
    onStatusChange?: (status: RealtimeConnectionStatus) => void;
    fetchFn?: typeof fetch;
    random?: () => number;
}

export interface SseClient {
    start: () => void;
    stop: () => void;
    getStatus: () => RealtimeConnectionStatus;
}

export function createSseClient(options: SseClientOptions): SseClient {
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    const random = options.random ?? Math.random;

    let status: RealtimeConnectionStatus = "idle";
    let stopped = false;
    let attempt = 0;
    let abortController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let listenersAttached = false;

    const setStatus = (next: RealtimeConnectionStatus) => {
        if (status === next) return;
        status = next;
        options.onStatusChange?.(next);
    };

    const clearReconnectTimer = () => {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    const scheduleReconnect = (isRateLimited = false, retryAfterMs = 0) => {
        if (stopped) return;
        clearReconnectTimer();
        const delay = computeBackoffDelay(attempt, {
            isRateLimited,
            retryAfterMs,
            random,
        });
        if (!isRateLimited) {
            attempt += 1;
        }
        setStatus("backoff");
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (!stopped) {
                void connect();
            }
        }, delay);
    };

    const handleOnlineOrVisible = () => {
        if (stopped) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            return;
        }
        if (status === "backoff") {
            clearReconnectTimer();
            void connect();
        }
    };

    const attachListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;
        if (typeof window !== "undefined") {
            window.addEventListener("online", handleOnlineOrVisible);
        }
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", handleOnlineOrVisible);
        }
    };

    const detachListeners = () => {
        if (!listenersAttached) return;
        listenersAttached = false;
        if (typeof window !== "undefined") {
            window.removeEventListener("online", handleOnlineOrVisible);
        }
        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", handleOnlineOrVisible);
        }
    };

    const stopPermanent = () => {
        stopped = true;
        clearReconnectTimer();
        abortController?.abort();
        abortController = null;
        detachListeners();
        setStatus("stopped");
    };

    const connect = async () => {
        if (stopped) return;
        clearReconnectTimer();
        abortController?.abort();

        const controller = new AbortController();
        abortController = controller;
        setStatus("connecting");

        try {
            const headers = buildApiHeaders({
                token: options.token,
                includeContentType: false,
                includeDomain: false,
                extraHeaders: {
                    Accept: "text/event-stream",
                },
            });

            const response = await fetchFn(options.url, {
                method: "GET",
                headers,
                signal: controller.signal,
                cache: "no-store",
            });

            if (stopped || controller.signal.aborted) {
                return;
            }

            if (response.status === 401 || response.status === 403) {
                stopPermanent();
                return;
            }

            if (response.status === 404 || response.status === 405 || response.status === 501) {
                stopPermanent();
                return;
            }

            if (response.status === 429) {
                const retryAfterMs = parseRetryAfterMs(response.headers?.get?.("retry-after") ?? null);
                scheduleReconnect(true, retryAfterMs);
                return;
            }

            if (!response.ok || !response.body) {
                scheduleReconnect();
                return;
            }

            const contentType = response.headers?.get?.("content-type");
            if (contentType && !contentType.toLowerCase().includes("text/event-stream")) {
                stopPermanent();
                return;
            }

            let receivedFirstFrame = false;
            const parser = createSseParser((rawFrame) => {
                if (stopped || controller.signal.aborted) return;
                const parsed = parseRealtimeFrame(rawFrame);
                if (!parsed) return;

                if (!receivedFirstFrame) {
                    receivedFirstFrame = true;
                    attempt = 0;
                    setStatus("connected");
                }
                options.onFrame(parsed);
            });

            const reader = response.body.getReader();
            try {
                while (!stopped && !controller.signal.aborted) {
                    const { done, value } = await reader.read();
                    if (done) {
                        parser.flush();
                        break;
                    }
                    if (value) {
                        parser.feedBytes(value);
                    }
                }
            } finally {
                reader.releaseLock?.();
            }

            if (!stopped && !controller.signal.aborted) {
                scheduleReconnect();
            }
        } catch {
            if (!stopped && !controller.signal.aborted) {
                scheduleReconnect();
            }
        }
    };

    const start = () => {
        if (stopped) return;
        if (status !== "idle") return;
        attachListeners();
        void connect();
    };

    const stop = () => {
        stopped = true;
        clearReconnectTimer();
        abortController?.abort();
        abortController = null;
        detachListeners();
        setStatus("idle");
    };

    return {
        start,
        stop,
        getStatus: () => status,
    };
}
