import { create } from "zustand";
import { SELF_WRITE_RETENTION_MS, type SelfWriteRecord } from "@/lib/realtime/conflict";
import {
    REALTIME_ACTION_SET,
    REALTIME_SCOPES,
    type RealtimeAction,
    type RealtimeChangeEvent,
    type RealtimeConnectionStatus,
    type RealtimeFrame,
    type RealtimeScope,
} from "@/lib/realtime/types";

/**
 * 常规防抖合并窗口：350ms
 * 依据：人类交互感知的即时阈值约为 200-500ms，350ms 既能让单次笔记/附件编辑保持秒级响应，
 * 又能把紧邻发生的成对事件（如创建笔记+创建目录/上传附件）合并为一次列表拉取。
 */
export const COALESCE_WINDOW_MS = 350;

/**
 * 事件风暴判定阈值与窗口：1000ms 内达到 50 条事件
 * 依据：正常 Web/Obsidian 单条编辑每秒仅 1-5 条事件；全库同步或批量操作会在 1 秒内推入
 * 数十至上千条事件。达到 50 条后直接坍缩为全范围失效，并进入风暴静默窗口避免多轮重复全量拉取。
 */
export const STORM_WINDOW_MS = 1000;
export const STORM_EVENT_THRESHOLD = 50;
export const STORM_SETTLE_MS = 500;
export const STORM_MAX_WAIT_MS = 1500;

export function mapActionToScopes(action: RealtimeAction, path = ""): RealtimeScope[] {
    const isCanvas = path.toLowerCase().endsWith(".canvas");

    switch (action) {
        case "NoteSyncModify":
            return ["notes"];
        case "NoteSyncDelete":
            return ["notes", "trash"];
        case "NoteSyncRename":
            return ["notes", "tree"];
        case "FolderSyncModify":
        case "FolderSyncDelete":
        case "FolderSyncRename":
            return ["tree", "notes", "files"];
        case "FileSyncUpdate":
            return isCanvas ? ["files", "tree"] : ["files"];
        case "FileSyncDelete":
            return isCanvas ? ["files", "trash", "tree"] : ["files", "trash"];
        case "FileSyncRename":
            return isCanvas ? ["files", "tree"] : ["files"];
        case "SettingSyncModify":
        case "SettingSyncDelete":
        case "SettingSyncClear":
            return ["settings"];
        case "ShareSyncRefresh":
            return ["shares"];
    }
}

export type RealtimeRevisions = Record<RealtimeScope, number>;

const createInitialRevisions = (): RealtimeRevisions => ({
    notes: 0,
    tree: 0,
    files: 0,
    shares: 0,
    settings: 0,
    trash: 0,
});

interface CoalescerState {
    pendingScopes: Set<RealtimeScope>;
    flushTimer: ReturnType<typeof setTimeout> | null;
    recentTimestamps: number[];
    stormActive: boolean;
    stormStartAt: number;
}

const coalescer: CoalescerState = {
    pendingScopes: new Set<RealtimeScope>(),
    flushTimer: null,
    recentTimestamps: [],
    stormActive: false,
    stormStartAt: 0,
};

function clearCoalescer() {
    if (coalescer.flushTimer !== null) {
        clearTimeout(coalescer.flushTimer);
        coalescer.flushTimer = null;
    }
    coalescer.pendingScopes.clear();
    coalescer.recentTimestamps = [];
    coalescer.stormActive = false;
    coalescer.stormStartAt = 0;
}

export type ChangeEventListener = (event: RealtimeChangeEvent, seq: number) => void;

const changeListeners = new Set<ChangeEventListener>();
let changeSeq = 0;

/**
 * 订阅通过校验的实时变更事件（按到达顺序同步回调，不经 React 批处理槽位覆盖）。
 */
export function subscribeChangeEvents(listener: ChangeEventListener): () => void {
    changeListeners.add(listener);
    return () => {
        changeListeners.delete(listener);
    };
}

export interface RealtimeState {
    status: RealtimeConnectionStatus;
    activeVault: string | null;
    revisions: RealtimeRevisions;
    resyncSeq: number;
    selfWrites: SelfWriteRecord[];

    setStatus: (status: RealtimeConnectionStatus) => void;
    setActiveVault: (vault: string | null) => void;
    bump: (scopes: RealtimeScope | RealtimeScope[]) => void;
    resyncAll: () => void;
    markSelfWrite: (pathHash: string, contentHash: string, at?: number, path?: string) => void;
    ingestFrame: (frame: RealtimeFrame, currentVault: string | null, now?: number) => void;
    reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => {
    const flushPendingScopes = () => {
        coalescer.flushTimer = null;
        if (coalescer.pendingScopes.size === 0 && !coalescer.stormActive) {
            return;
        }

        const scopesToBump = coalescer.stormActive
            ? [...REALTIME_SCOPES]
            : Array.from(coalescer.pendingScopes);
        const wasStorm = coalescer.stormActive;

        coalescer.pendingScopes.clear();
        coalescer.stormActive = false;
        coalescer.stormStartAt = 0;

        set((state) => {
            const nextRevisions = { ...state.revisions };
            for (const scope of scopesToBump) {
                nextRevisions[scope] += 1;
            }
            return {
                revisions: nextRevisions,
                resyncSeq: wasStorm ? state.resyncSeq + 1 : state.resyncSeq,
            };
        });
    };

    const scheduleCoalescedScopes = (scopes: RealtimeScope[], now: number) => {
        for (const scope of scopes) {
            coalescer.pendingScopes.add(scope);
        }

        coalescer.recentTimestamps = coalescer.recentTimestamps.filter(
            (ts) => now - ts <= STORM_WINDOW_MS
        );
        coalescer.recentTimestamps.push(now);

        if (coalescer.recentTimestamps.length >= STORM_EVENT_THRESHOLD) {
            if (!coalescer.stormActive) {
                coalescer.stormActive = true;
                coalescer.stormStartAt = now;
            }
            for (const scope of REALTIME_SCOPES) {
                coalescer.pendingScopes.add(scope);
            }

            if (coalescer.flushTimer !== null) {
                clearTimeout(coalescer.flushTimer);
                coalescer.flushTimer = null;
            }

            const elapsed = now - coalescer.stormStartAt;
            const remainingMaxWait = Math.max(0, STORM_MAX_WAIT_MS - elapsed);
            const delay = Math.min(STORM_SETTLE_MS, remainingMaxWait);
            coalescer.flushTimer = setTimeout(flushPendingScopes, delay);
            return;
        }

        if (coalescer.flushTimer === null) {
            coalescer.flushTimer = setTimeout(flushPendingScopes, COALESCE_WINDOW_MS);
        }
    };

    return {
        status: "idle",
        activeVault: null,
        revisions: createInitialRevisions(),
        resyncSeq: 0,
        selfWrites: [],

        setStatus: (status) => set({ status }),

        setActiveVault: (vault) => {
            clearCoalescer();
            set((state) => ({
                activeVault: vault,
                selfWrites: state.activeVault !== vault ? [] : state.selfWrites,
            }));
        },

        bump: (scopes) => {
            const list = Array.isArray(scopes) ? scopes : [scopes];
            if (list.length === 0) return;
            set((state) => {
                const next = { ...state.revisions };
                for (const scope of list) {
                    next[scope] += 1;
                }
                return { revisions: next };
            });
        },

        resyncAll: () => {
            clearCoalescer();
            set((state) => {
                const next = { ...state.revisions };
                for (const scope of REALTIME_SCOPES) {
                    next[scope] += 1;
                }
                return {
                    revisions: next,
                    resyncSeq: state.resyncSeq + 1,
                };
            });
        },

        markSelfWrite: (pathHash, contentHash, at = Date.now(), path) => {
            set((state) => {
                const fresh = state.selfWrites.filter(
                    (item) => at - item.at <= SELF_WRITE_RETENTION_MS
                );
                fresh.push({ pathHash, contentHash, at, path });
                if (fresh.length > 50) {
                    fresh.splice(0, fresh.length - 50);
                }
                return { selfWrites: fresh };
            });
        },

        ingestFrame: (frame, currentVault, now = Date.now()) => {
            if (frame.type === "hello" || frame.type === "resync") {
                get().resyncAll();
                return;
            }

            if (frame.type !== "change") {
                return;
            }

            const event = frame.data;
            if (!REALTIME_ACTION_SET.has(event.action)) {
                return;
            }
            if (event.vault && currentVault && event.vault !== currentVault) {
                return;
            }

            const nextSeq = ++changeSeq;

            for (const listener of Array.from(changeListeners)) {
                if (changeListeners.has(listener)) {
                    listener(event, nextSeq);
                }
            }

            const scopes = mapActionToScopes(event.action, event.path);
            scheduleCoalescedScopes(scopes, now);
        },

        reset: () => {
            clearCoalescer();
            changeSeq = 0;
            set({
                status: "idle",
                activeVault: null,
                revisions: createInitialRevisions(),
                resyncSeq: 0,
                selfWrites: [],
            });
        },
    };
});
