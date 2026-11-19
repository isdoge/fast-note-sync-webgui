export const REALTIME_ACTIONS = [
    "NoteSyncModify",
    "NoteSyncDelete",
    "NoteSyncRename",
    "FolderSyncModify",
    "FolderSyncDelete",
    "FolderSyncRename",
    "FileSyncUpdate",
    "FileSyncDelete",
    "FileSyncRename",
    "SettingSyncModify",
    "SettingSyncDelete",
    "SettingSyncClear",
    "ShareSyncRefresh",
] as const;

export type RealtimeAction = (typeof REALTIME_ACTIONS)[number];

export const REALTIME_ACTION_SET: ReadonlySet<string> = new Set(REALTIME_ACTIONS);

export const REALTIME_SCOPES = [
    "notes",
    "tree",
    "files",
    "shares",
    "settings",
    "trash",
] as const;

export type RealtimeScope = (typeof REALTIME_SCOPES)[number];

export type RealtimeConnectionStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "backoff"
    | "stopped";

export interface RealtimeHelloPayload {
    v: number;
    ts: number;
}

export interface RealtimeResyncPayload {
    v: number;
    reason?: string;
    ts: number;
}

export interface RealtimeChangeEvent {
    v: number;
    vault: string;
    action: RealtimeAction;
    path: string;
    pathHash: string;
    oldPath: string;
    oldPathHash: string;
    contentHash: string;
    ctime: number;
    mtime: number;
    updatedTimestamp: number;
    ts: number;
}

export type RealtimeFrame =
    | { type: "hello"; data: RealtimeHelloPayload }
    | { type: "resync"; data: RealtimeResyncPayload }
    | { type: "change"; data: RealtimeChangeEvent };
