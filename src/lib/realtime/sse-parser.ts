import {
    REALTIME_ACTION_SET,
    type RealtimeAction,
    type RealtimeChangeEvent,
    type RealtimeFrame,
    type RealtimeHelloPayload,
    type RealtimeResyncPayload,
} from "./types";

export interface SseRawFrame {
    event: string;
    data: string;
    id?: string;
}

export interface SseParser {
    feed: (chunk: string) => void;
    feedBytes: (bytes: Uint8Array) => void;
    flush: () => void;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createSseParser(onFrame: (frame: SseRawFrame) => void): SseParser {
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let isFirstChunk = true;
    let endsWithCarriageReturn = false;

    let currentEvent = "";
    let currentDataLines: string[] = [];
    let currentId: string | undefined;

    const dispatchBlock = () => {
        if (currentDataLines.length === 0) {
            currentEvent = "";
            currentId = undefined;
            return;
        }

        const frame: SseRawFrame = {
            event: currentEvent || "message",
            data: currentDataLines.join("\n"),
        };
        if (currentId !== undefined) {
            frame.id = currentId;
        }

        currentEvent = "";
        currentDataLines = [];
        currentId = undefined;

        onFrame(frame);
    };

    const processLine = (line: string) => {
        if (line === "") {
            dispatchBlock();
            return;
        }

        // Comment / heartbeat line (e.g. ": ping")
        if (line.startsWith(":")) {
            return;
        }

        const colonIndex = line.indexOf(":");
        let field: string;
        let value: string;

        if (colonIndex === -1) {
            field = line;
            value = "";
        } else {
            field = line.slice(0, colonIndex);
            value = line.slice(colonIndex + 1);
            if (value.startsWith(" ")) {
                value = value.slice(1);
            }
        }

        switch (field) {
            case "event":
                currentEvent = value;
                break;
            case "data":
                currentDataLines.push(value);
                break;
            case "id":
                if (!value.includes("\0")) {
                    currentId = value;
                }
                break;
            default:
                break;
        }
    };

    const feed = (chunk: string) => {
        if (!chunk) return;

        let text = chunk;
        if (isFirstChunk) {
            isFirstChunk = false;
            if (text.charCodeAt(0) === 0xfeff) {
                text = text.slice(1);
            }
        }

        if (endsWithCarriageReturn) {
            endsWithCarriageReturn = false;
            if (text.startsWith("\n")) {
                text = text.slice(1);
            }
        }

        if (text.endsWith("\r")) {
            endsWithCarriageReturn = true;
        }

        buffer += text;

        let lineStart = 0;
        for (let i = 0; i < buffer.length; i++) {
            const ch = buffer.charCodeAt(i);
            if (ch === 10 /* \n */) {
                processLine(buffer.slice(lineStart, i));
                lineStart = i + 1;
            } else if (ch === 13 /* \r */) {
                if (i + 1 < buffer.length) {
                    processLine(buffer.slice(lineStart, i));
                    if (buffer.charCodeAt(i + 1) === 10 /* \n */) {
                        i++;
                    }
                    lineStart = i + 1;
                } else {
                    // Trailing '\r' at end of current chunk: process line now,
                    // and remember to swallow a leading '\n' in the next chunk.
                    processLine(buffer.slice(lineStart, i));
                    lineStart = i + 1;
                }
            }
        }

        buffer = lineStart < buffer.length ? buffer.slice(lineStart) : "";
    };

    const feedBytes = (bytes: Uint8Array) => {
        if (!bytes || bytes.byteLength === 0) return;
        const decoded = decoder.decode(bytes, { stream: true });
        feed(decoded);
    };

    const flush = () => {
        const trailing = decoder.decode();
        if (trailing) {
            feed(trailing);
        }
        if (buffer.length > 0) {
            processLine(buffer);
            buffer = "";
        }
        dispatchBlock();
    };

    return { feed, feedBytes, flush };
}

export function parseRealtimeFrame(raw: SseRawFrame): RealtimeFrame | null {
    if (!raw.data) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.data);
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
    }

    const record = parsed as Record<string, unknown>;

    if (raw.event === "hello") {
        const data: RealtimeHelloPayload = {
            v: asNumber(record.v) || 1,
            ts: asNumber(record.ts),
        };
        return { type: "hello", data };
    }

    if (raw.event === "resync") {
        const data: RealtimeResyncPayload = {
            v: asNumber(record.v) || 1,
            reason: typeof record.reason === "string" ? record.reason : undefined,
            ts: asNumber(record.ts),
        };
        return { type: "resync", data };
    }

    if (raw.event === "change") {
        const action = asString(record.action);
        if (!REALTIME_ACTION_SET.has(action)) {
            return null;
        }
        const data: RealtimeChangeEvent = {
            v: asNumber(record.v) || 1,
            vault: asString(record.vault),
            action: action as RealtimeAction,
            path: asString(record.path),
            pathHash: asString(record.pathHash),
            oldPath: asString(record.oldPath),
            oldPathHash: asString(record.oldPathHash),
            contentHash: asString(record.contentHash),
            ctime: asNumber(record.ctime),
            mtime: asNumber(record.mtime),
            updatedTimestamp: asNumber(record.updatedTimestamp),
            ts: asNumber(record.ts),
        };
        return { type: "change", data };
    }

    return null;
}
