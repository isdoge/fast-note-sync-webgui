import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    COALESCE_WINDOW_MS,
    mapActionToScopes,
    STORM_EVENT_THRESHOLD,
    STORM_SETTLE_MS,
    subscribeChangeEvents,
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

    it("delivers every synchronous change event in arrival order and stops calling after unsubscribe", () => {
        const received: Array<{ path: string; action: RealtimeAction; seq: number }> = [];
        const unsubscribe = subscribeChangeEvents((event, seq) => {
            received.push({ path: event.path, action: event.action, seq });
        });

        const store = useRealtimeStore.getState();
        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncRename", { path: "a2.md", oldPath: "a.md", ts: 10 }) },
            "doge",
            1000
        );
        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { path: "a2.md", ts: 11 }) },
            "doge",
            1001
        );
        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { path: "b.md", ts: 12 }) },
            "doge",
            1002
        );

        expect(received).toEqual([
            { path: "a2.md", action: "NoteSyncRename", seq: 1 },
            { path: "a2.md", action: "NoteSyncModify", seq: 2 },
            { path: "b.md", action: "NoteSyncModify", seq: 3 },
        ]);

        unsubscribe();

        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncDelete", { path: "c.md", ts: 13 }) },
            "doge",
            1003
        );
        expect(received).toHaveLength(3);
    });

    it("does not replay old events after reset or vault switch and drops mismatched vault frames", () => {
        const store = useRealtimeStore.getState();
        store.setActiveVault("vaultA");
        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { vault: "vaultA", path: "old.md" }) },
            "vaultA",
            1000
        );
        expect(useRealtimeStore.getState().lastChangeEvent?.path).toBe("old.md");

        // 切换笔记库清空旧库事件槽位，新订阅方不会收到旧事件，且旧库迟到事件被拦截
        store.setActiveVault("vaultB");
        expect(useRealtimeStore.getState().lastChangeEvent).toBeNull();

        const receivedAfterSwitch: string[] = [];
        const unsubAfterSwitch = subscribeChangeEvents((event) => {
            receivedAfterSwitch.push(event.path);
        });

        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { vault: "vaultA", path: "stale-from-a.md" }) },
            "vaultB",
            1010
        );
        expect(receivedAfterSwitch).toEqual([]);

        // reset() 后同样不重放旧事件
        store.ingestFrame(
            { type: "change", data: makeChange("NoteSyncModify", { vault: "vaultB", path: "in-b.md" }) },
            "vaultB",
            1020
        );
        expect(receivedAfterSwitch).toEqual(["in-b.md"]);
        unsubAfterSwitch();

        store.reset();
        expect(useRealtimeStore.getState().lastChangeEvent).toBeNull();
        expect(useRealtimeStore.getState().lastChangeSeq).toBe(0);

        const receivedAfterReset: string[] = [];
        const unsubAfterReset = subscribeChangeEvents((event) => {
            receivedAfterReset.push(event.path);
        });
        expect(receivedAfterReset).toEqual([]);
        unsubAfterReset();
    });
});
