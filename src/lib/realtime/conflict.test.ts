import { describe, expect, it } from "vitest";
import {
    isFolderAncestor,
    isSelfWriteEcho,
    replaceFolderPrefix,
    shouldReloadRemote,
    type SelfWriteRecord,
} from "./conflict";
import type { RealtimeChangeEvent } from "./types";

function makeEvent(overrides: Partial<RealtimeChangeEvent> = {}): RealtimeChangeEvent {
    return {
        v: 1,
        vault: "doge",
        action: "NoteSyncModify",
        path: "notes/hello.md",
        pathHash: "hash-hello",
        oldPath: "",
        oldPathHash: "",
        contentHash: "ch-1",
        ctime: 0,
        mtime: 0,
        updatedTimestamp: 0,
        ts: 1000,
        ...overrides,
    };
}

describe("realtime conflict & self-write echo detection", () => {
    it("recognizes self-write echo within time window with matching contentHash", () => {
        const selfWrites: SelfWriteRecord[] = [
            { pathHash: "hash-hello", contentHash: "ch-1", at: 10000, path: "notes/hello.md" },
        ];

        expect(isSelfWriteEcho(makeEvent(), selfWrites, 12500, 3000)).toBe(true);
        // Outside 3000ms window
        expect(isSelfWriteEcho(makeEvent(), selfWrites, 13500, 3000)).toBe(false);
        // Different contentHash means another client wrote different content
        expect(
            isSelfWriteEcho(makeEvent({ contentHash: "ch-other" }), selfWrites, 11000, 3000)
        ).toBe(false);
        // Empty contentHash falls back to time window
        expect(
            isSelfWriteEcho(makeEvent({ contentHash: "" }), selfWrites, 11000, 3000)
        ).toBe(true);
    });

    it("ignores self-write echo even when user continued typing afterwards", () => {
        const selfWrites: SelfWriteRecord[] = [
            { pathHash: "hash-hello", contentHash: "ch-saved", at: 10000 },
        ];

        const decision = shouldReloadRemote(makeEvent({ contentHash: "ch-saved" }), {
            notePath: "notes/hello.md",
            notePathHash: "hash-hello",
            currentContentHash: "ch-newer-local-typing",
            hasPendingChanges: true,
            selfWrites,
            now: 11200,
        });

        expect(decision).toBe("ignore");
    });

    it("returns reload when local has no pending changes and content differs", () => {
        const decision = shouldReloadRemote(makeEvent({ contentHash: "ch-remote" }), {
            notePath: "notes/hello.md",
            notePathHash: "hash-hello",
            currentContentHash: "ch-local",
            hasPendingChanges: false,
            selfWrites: [],
            now: 20000,
        });

        expect(decision).toBe("reload");
    });

    it("returns conflict when local has pending unsaved changes and content differs", () => {
        const decision = shouldReloadRemote(makeEvent({ contentHash: "ch-remote" }), {
            notePath: "notes/hello.md",
            notePathHash: "hash-hello",
            currentContentHash: "ch-local",
            hasPendingChanges: true,
            selfWrites: [],
            now: 20000,
        });

        expect(decision).toBe("conflict");
    });

    it("ignores remote modify when contentHash already matches local content", () => {
        const decision = shouldReloadRemote(makeEvent({ contentHash: "ch-same" }), {
            notePath: "notes/hello.md",
            notePathHash: "hash-hello",
            currentContentHash: "ch-same",
            hasPendingChanges: true,
            selfWrites: [],
            now: 20000,
        });

        expect(decision).toBe("ignore");
    });

    it("returns deleted and renamed decisions when matching open note", () => {
        expect(
            shouldReloadRemote(makeEvent({ action: "NoteSyncDelete" }), {
                notePath: "notes/hello.md",
                notePathHash: "hash-hello",
                currentContentHash: "ch-1",
                hasPendingChanges: false,
                selfWrites: [],
            })
        ).toBe("deleted");

        expect(
            shouldReloadRemote(
                makeEvent({
                    action: "NoteSyncRename",
                    path: "notes/renamed.md",
                    pathHash: "hash-renamed",
                    oldPath: "notes/hello.md",
                    oldPathHash: "hash-hello",
                }),
                {
                    notePath: "notes/hello.md",
                    notePathHash: "hash-hello",
                    currentContentHash: "ch-1",
                    hasPendingChanges: false,
                    selfWrites: [],
                }
            )
        ).toBe("renamed");
    });

    it("matches FolderSyncDelete and FolderSyncRename by segment-safe ancestor path", () => {
        expect(isFolderAncestor("a/b", "a/b/c.md")).toBe(true);
        expect(isFolderAncestor("a/b", "a/bc.md")).toBe(false);
        expect(isFolderAncestor("a/b/", "a/b/sub/c.md")).toBe(true);
        expect(replaceFolderPrefix("a/b/c.md", "a/b", "x/y")).toBe("x/y/c.md");
        expect(replaceFolderPrefix("a/bc.md", "a/b", "x/y")).toBeNull();

        expect(
            shouldReloadRemote(
                makeEvent({ action: "FolderSyncDelete", path: "a/b", pathHash: "h-folder" }),
                {
                    notePath: "a/b/c.md",
                    notePathHash: "h-c",
                    currentContentHash: "ch-1",
                    hasPendingChanges: true,
                    selfWrites: [],
                }
            )
        ).toBe("deleted");

        expect(
            shouldReloadRemote(
                makeEvent({ action: "FolderSyncDelete", path: "a/b", pathHash: "h-folder" }),
                {
                    notePath: "a/bc.md",
                    notePathHash: "h-bc",
                    currentContentHash: "ch-1",
                    hasPendingChanges: true,
                    selfWrites: [],
                }
            )
        ).toBe("ignore");

        expect(
            shouldReloadRemote(
                makeEvent({
                    action: "FolderSyncRename",
                    path: "x/y",
                    pathHash: "h-xy",
                    oldPath: "a/b",
                    oldPathHash: "h-ab",
                }),
                {
                    notePath: "a/b/c.md",
                    notePathHash: "h-c",
                    currentContentHash: "ch-1",
                    hasPendingChanges: false,
                    selfWrites: [],
                }
            )
        ).toBe("renamed");
    });
});
