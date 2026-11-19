import { describe, expect, it } from "vitest";
import { createSseParser, parseRealtimeFrame, type SseRawFrame } from "./sse-parser";

describe("sse-parser", () => {
    it("parses events across arbitrary chunk boundaries including mid-UTF-8 and mid-CRLF", () => {
        const frames: SseRawFrame[] = [];
        const parser = createSseParser((frame) => frames.push(frame));

        const payload =
            ": ping\r\n\r\n" +
            "event: hello\r\n" +
            'data: {"v":1,"ts":100}\r\n\r\n' +
            "event: change\r\n" +
            'data: {"v":1,"vault":"doge",\r\n' +
            'data: "action":"NoteSyncModify","path":"笔记/测试.md"}\r\n\r\n';

        const bytes = new TextEncoder().encode(payload);
        // Feed 1 byte at a time to stress-test chunk & UTF-8 & CRLF boundaries
        for (let i = 0; i < bytes.length; i++) {
            parser.feedBytes(bytes.slice(i, i + 1));
        }
        parser.flush();

        expect(frames).toHaveLength(2);
        expect(frames[0]).toEqual({
            event: "hello",
            data: '{"v":1,"ts":100}',
        });
        expect(frames[1]).toEqual({
            event: "change",
            data: '{"v":1,"vault":"doge",\n"action":"NoteSyncModify","path":"笔记/测试.md"}',
        });
    });

    it("handles \\r at chunk boundary followed by \\n in next chunk without producing phantom empty line", () => {
        const frames: SseRawFrame[] = [];
        const parser = createSseParser((frame) => frames.push(frame));

        parser.feed("event: change\r");
        parser.feed('\ndata: {"v":1}\r');
        parser.feed("\n\r\n");
        parser.flush();

        expect(frames).toEqual([
            {
                event: "change",
                data: '{"v":1}',
            },
        ]);
    });

    it("ignores comment heartbeats and strips UTF-8 BOM", () => {
        const frames: SseRawFrame[] = [];
        const parser = createSseParser((frame) => frames.push(frame));

        parser.feed("﻿: ping\n: keepalive\n\n");
        parser.feed('data: {"v":1,"ts":200}\n\n');
        parser.flush();

        expect(frames).toEqual([
            {
                event: "message",
                data: '{"v":1,"ts":200}',
            },
        ]);
    });

    it("parseRealtimeFrame validates known events and whitelisted actions", () => {
        expect(
            parseRealtimeFrame({ event: "hello", data: '{"v":1,"ts":123}' })
        ).toEqual({ type: "hello", data: { v: 1, ts: 123 } });

        expect(
            parseRealtimeFrame({
                event: "resync",
                data: '{"v":1,"reason":"overflow","ts":456}',
            })
        ).toEqual({ type: "resync", data: { v: 1, reason: "overflow", ts: 456 } });

        expect(
            parseRealtimeFrame({
                event: "change",
                data: '{"v":1,"vault":"doge","action":"NoteSyncModify","path":"a.md","pathHash":"123"}',
            })
        ).toMatchObject({
            type: "change",
            data: {
                vault: "doge",
                action: "NoteSyncModify",
                path: "a.md",
                pathHash: "123",
            },
        });

        // Disallowed action or malformed JSON returns null without throwing
        expect(
            parseRealtimeFrame({
                event: "change",
                data: '{"v":1,"vault":"doge","action":"UnknownAction"}',
            })
        ).toBeNull();
        expect(
            parseRealtimeFrame({ event: "change", data: "{not-json" })
        ).toBeNull();
    });
});
