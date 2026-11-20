type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function formatSegment(segment: string, t: TranslateFn): string {
    const trimmed = segment.trim();
    if (!trimmed) return "";

    const remoteHookMatch = trimmed.match(/^git pushed,\s*but remote hook deploy failed:\s*(.+)$/i);
    if (remoteHookMatch) {
        const inner = formatSegment(remoteHookMatch[1], t);
        return t("ui.git.message.remoteHookFailed", { detail: inner });
    }

    const syncCompletedAtMatch = trimmed.match(/^Sync completed at\s+(.+)$/i);
    if (syncCompletedAtMatch) {
        return t("ui.git.message.syncCompletedAt", { time: syncCompletedAtMatch[1].trim() });
    }

    if (/^Sync completed$/i.test(trimmed)) {
        return t("ui.git.message.syncCompleted");
    }

    const syncStoppedMatch = trimmed.match(/^Sync stopped by system shutdown(?::\s*(.+))?$/i);
    if (syncStoppedMatch) {
        const detail = syncStoppedMatch[1]?.trim();
        return detail
            ? t("ui.git.message.syncStoppedWithDetail", { detail })
            : t("ui.git.message.syncStopped");
    }

    const skippedMatch = trimmed.match(/^skipped\s+(\d+)\s+invalid\s+posts?(?::\s*(.+))?$/i);
    if (skippedMatch) {
        const count = Number(skippedMatch[1]);
        const detail = skippedMatch[2]?.trim();
        return detail
            ? t("ui.git.message.skippedPosts", { count, detail })
            : t("ui.git.message.skippedPostsCount", { count });
    }

    const previewDeployedMatch = trimmed.match(/^(?:Unified\s+)?Preview deployed:\s*(.+)$/i);
    if (previewDeployedMatch) {
        return t("ui.git.message.previewDeployed", { detail: previewDeployedMatch[1].trim() });
    }

    const awaitConfirmMatch = trimmed.match(/^Saved settings await confirmation(?::\s*(.+))?$/i);
    if (awaitConfirmMatch) {
        const detail = awaitConfirmMatch[1]?.trim();
        return detail
            ? t("ui.git.message.awaitConfirmationWithDetail", { detail })
            : t("ui.git.message.awaitConfirmation");
    }

    const previewFailedMatch = trimmed.match(/^Preview deployment failed(?::\s*(.+))?$/i);
    if (previewFailedMatch) {
        const detail = previewFailedMatch[1]?.trim();
        return detail
            ? t("ui.git.message.previewDeployFailedWithDetail", { detail })
            : t("ui.git.message.previewDeployFailed");
    }

    return trimmed;
}

/**
 * 将服务端返回的 Git 同步回执消息按当前语言本地化展示
 */
export function formatGitSyncMessage(msg: string | null | undefined, t: TranslateFn): string {
    if (!msg) return "";
    const segments = msg.split(/\s*\|\s*/);
    return segments
        .map((segment) => formatSegment(segment, t))
        .filter(Boolean)
        .join(" | ");
}
