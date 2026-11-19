import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    COALESCE_WINDOW_MS,
    mapActionToScopes,
    STORM_EVENT_THRESHOLD,
    STORM_SETTLE_MS,
    useRealtimeStore,
} from "./realtime-store";
import type { RealtimeAction, RealtimeChangeEvent } from "./types";

function makeChange(action: RealtimeAction, overrides: Partial<RealtimeChangeEvent> = {}): RealtimeChangeEvent {
    return {
        v: 1,
        vault: "doge",
        action,
        path: "a.md",
        pathHash: "h1",
        oldPath: "",
        oldPathHash: "",
        contentHash: "c1",
        ctime: 0,
        mtime: 0,
        updatedTimestamp: 0,
        ts: 1,
        ...overrides,
    };
}

describe("realtime-store", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useRealtimeStore.getState().reset();
    });

    afterEach(() => {
        useRealtimeStore.getState().reset();
        vi.useRealTimers();
    });

    it("maps whitelisted actions to expected scopes", () => {
        expect(mapActionToScopes("NoteSyncModify")).toEqual(["notes"]);
        expect(mapActionToScopes("NoteSyncDelete")).toEqual(["notes", "trash"]);
        expect(mapActionToScopes("NoteSyncRename")).toEqual(["notes", "tree"]);
        expect(mapActionToScopes("FolderSyncModify")).toEqual(["tree", "notes", "files"]);
        expect(mapActionToScopes("FolderSyncDelete")).toEqual(["tree", "notes", "files"]);
        expect(mapActionToScopes("FolderSyncRename")).toEqual(["tree", "notes", "files"]);
        expect(mapActionToScopes("FileSyncUpdate", "img.png")).toEqual(["files"]);
        expect(mapActionToScopes("FileSyncUpdate", "board.canvas")).toEqual(["files", "tree"]);
        expect(mapActionToScopes("FileSyncDelete", "img.png")).toEqual(["files", "trash"]);
        expect(mapActionToScopes("FileSyncRename", "img.png")).toEqual(["files"]);
        expect(mapActionToScopes("SettingSyncModify")).toEqual(["settings"]);
        expect(mapActionToScopes("SettingSyncDelete")).toEqual(["settings"]);
        expect(mapActionToScopes("SettingSyncClear")).toEqual(["settings"]);
        expect(mapActionToScopes("ShareSyncRefresh")).toEqual(["shares"]);
    });

    it("ignores events belonging to other vaults", () => {
        useRealtimeStore.getState().ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { vault: "other" }) },
            "doge",
            1000
        );
        vi.advanceTimersByTime(COALESCE_WINDOW_MS + 50);

        expect(useRealtimeStore.getState().revisions.notes).toBe(0);
        expect(useRealtimeStore.getState().lastChangeSeq).toBe(0);
    });

    it("bumps all scopes on hello and resync", () => {
        useRealtimeStore.getState().ingestFrame({ type: "hello", data: { v: 1, ts: 1 } }, "doge");
        expect(useRealtimeStore.getState().revisions).toEqual({
            notes: 1,
            tree: 1,
            files: 1,
            shares: 1,
            settings: 1,
            trash: 1,
        });

        useRealtimeStore.getState().ingestFrame(
            { type: "resync", data: { v: 1, reason: "overflow", ts: 2 } },
            "doge"
        );
        expect(useRealtimeStore.getState().revisions).toEqual({
            notes: 2,
            tree: 2,
            files: 2,
            shares: 2,
            settings: 2,
            trash: 2,
        });
    });

    it("coalesces burst events within window into a single revision bump per scope", () => {
        for (let i = 0; i < 10; i++) {
            useRealtimeStore.getState().ingestFrame(
                { type: "change", data: makeChange("NoteSyncModify", { path: `n-${i}.md` }) },
                "doge",
                1000 + i * 10
            );
        }

        // Not flushed before COALESCE_WINDOW_MS
        expect(useRealtimeStore.getState().revisions.notes).toBe(0);

        vi.advanceTimersByTime(COALESCE_WINDOW_MS);
        expect(useRealtimeStore.getState().revisions.notes).toBe(1);
        expect(useRealtimeStore.getState().revisions.files).toBe(0);
    });

    it("collapses event storm into a single full invalidation across all scopes", () => {
        for (let i = 0; i < STORM_EVENT_THRESHOLD + 20; i++) {
            useRealtimeStore.getState().ingestFrame(
                { type: "change", data: makeChange("NoteSyncModify", { path: `s-${i}.md` }) },
                "doge",
                1000 + i * 5
            );
        }

        expect(useRealtimeStore.getState().revisions.notes).toBe(0);

        vi.advanceTimersByTime(STORM_SETTLE_MS);
        expect(useRealtimeStore.getState().revisions).toEqual({
            notes: 1,
            tree: 1,
            files: 1,
            shares: 1,
            settings: 1,
            trash: 1,
        });
        expect(useRealtimeStore.getState().resyncSeq).toBe(1);
    });
});
