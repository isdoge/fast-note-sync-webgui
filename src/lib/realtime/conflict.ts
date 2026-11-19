import type { RealtimeChangeEvent } from "./types";

export const SELF_WRITE_WINDOW_MS = 3000;
export const SELF_WRITE_RETENTION_MS = 10000;

export interface SelfWriteRecord {
    pathHash: string;
    contentHash: string;
    at: number;
    path?: string;
}

export interface LocalNoteState {
    notePath: string;
    notePathHash: string;
    currentContentHash: string;
    hasPendingChanges: boolean;
    selfWrites: readonly SelfWriteRecord[];
    now?: number;
    selfWriteWindowMs?: number;
}

export type RemoteNoteDecision =
    | "ignore"
    | "reload"
    | "conflict"
    | "deleted"
    | "renamed";

function normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, "");
}

/**
 * 按 `/` 分段判断 folderPath 是否是 targetPath 的祖先目录（或同路径）。
 * 例如 "a/b" 是 "a/b/c.md" 的祖先，但不是 "a/bc.md" 的祖先。
 */
export function isFolderAncestor(folderPath: string, targetPath: string): boolean {
    const folder = normalizePath(folderPath);
    const target = targetPath.replace(/^\/+/, "");
    if (!folder || !target) return false;
    return target === folder || target.startsWith(`${folder}/`);
}

/**
 * 若 targetPath 位于 oldFolderPath 下，将其目录前缀替换为 newFolderPath；否则返回 null。
 */
export function replaceFolderPrefix(
    targetPath: string,
    oldFolderPath: string,
    newFolderPath: string
): string | null {
    const oldFolder = normalizePath(oldFolderPath);
    const newFolder = normalizePath(newFolderPath);
    const target = targetPath.replace(/^\/+/, "");
    if (!oldFolder || !target) return null;
    if (target === oldFolder) return newFolder;
    if (!target.startsWith(`${oldFolder}/`)) return null;
    const suffix = target.slice(oldFolder.length + 1);
    return newFolder ? `${newFolder}/${suffix}` : suffix;
}

function matchesCurrentTarget(
    eventPathHash: string,
    eventPath: string,
    targetPathHash: string,
    targetPath: string
): boolean {
    if (eventPathHash && targetPathHash) {
        return eventPathHash === targetPathHash;
    }
    if (eventPath && targetPath) {
        return eventPath === targetPath;
    }
    return false;
}

/**
 * 判断远端变更事件是否由当前 WebGUI 刚执行过的保存操作回显引起。
 * 纯函数：结合 pathHash、contentHash 与保存时间窗（默认 3 秒）判断。
 */
export function isSelfWriteEcho(
    event: Pick<RealtimeChangeEvent, "action" | "path" | "pathHash" | "contentHash">,
    selfWrites: readonly SelfWriteRecord[],
    now: number,
    windowMs: number = SELF_WRITE_WINDOW_MS
): boolean {
    if (event.action !== "NoteSyncModify") {
        return false;
    }
    if (!selfWrites.length) {
        return false;
    }

    for (let i = selfWrites.length - 1; i >= 0; i--) {
        const record = selfWrites[i];
        const age = now - record.at;
        if (age < 0 || age > windowMs) {
            continue;
        }

        const pathMatched = matchesCurrentTarget(
            event.pathHash,
            event.path,
            record.pathHash,
            record.path || ""
        );
        if (!pathMatched) {
            continue;
        }

        // 若双方均有 contentHash，必须一致才认定为本次自写回显；
        // 若事件或记录缺少 contentHash，则回退为同一路径在时间窗内的自写抑制。
        if (event.contentHash && record.contentHash) {
            if (event.contentHash === record.contentHash) {
                return true;
            }
            continue;
        }

        return true;
    }

    return false;
}

/**
 * 决定当前打开的笔记在收到远端实时事件后的处理策略。
 */
export function shouldReloadRemote(
    event: RealtimeChangeEvent,
    local: LocalNoteState
): RemoteNoteDecision {
    const now = local.now ?? Date.now();
    const windowMs = local.selfWriteWindowMs ?? SELF_WRITE_WINDOW_MS;

    if (event.action === "NoteSyncRename") {
        const renameMatched = matchesCurrentTarget(
            event.oldPathHash,
            event.oldPath,
            local.notePathHash,
            local.notePath
        );
        return renameMatched ? "renamed" : "ignore";
    }

    if (event.action === "FolderSyncRename") {
        return isFolderAncestor(event.oldPath, local.notePath) ? "renamed" : "ignore";
    }

    if (event.action === "NoteSyncDelete") {
        const deleteMatched = matchesCurrentTarget(
            event.pathHash,
            event.path,
            local.notePathHash,
            local.notePath
        );
        return deleteMatched ? "deleted" : "ignore";
    }

    if (event.action === "FolderSyncDelete") {
        return isFolderAncestor(event.path, local.notePath) ? "deleted" : "ignore";
    }

    if (event.action !== "NoteSyncModify") {
        return "ignore";
    }

    const modifyMatched = matchesCurrentTarget(
        event.pathHash,
        event.path,
        local.notePathHash,
        local.notePath
    );
    if (!modifyMatched) {
        return "ignore";
    }

    if (isSelfWriteEcho(event, local.selfWrites, now, windowMs)) {
        return "ignore";
    }

    if (
        event.contentHash &&
        local.currentContentHash &&
        event.contentHash === local.currentContentHash
    ) {
        return "ignore";
    }

    if (local.hasPendingChanges) {
        return "conflict";
    }

    return "reload";
}
