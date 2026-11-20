import { z } from "zod";

const isValidRelativeSubdir = (val?: string): boolean => {
    if (!val || val.trim() === "") return true;
    const trimmed = val.trim();
    if (trimmed.startsWith("/") || trimmed.startsWith("\\")) return false;
    const segments = trimmed.split(/[/\\]+/);
    return !segments.some((seg) => seg === ".." || seg === ".git");
};

const isValidFrontmatterFilter = (val?: string): boolean => {
    if (!val || val.trim() === "") return true;
    const tokens = val.split(",");
    return tokens.every((token) => {
        const trimmed = token.trim();
        if (!trimmed) return false;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === 0) return false;
        const key = eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx).trim();
        return key.length > 0 && !/\s/.test(key);
    });
};

const isValidWebhookUrl = (val?: string): boolean => {
    if (!val || val.trim() === "") return true;
    try {
        const parsed = new URL(val.trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};

/**
 * Git 同步配置校验 Schema（工厂函数，支持 i18n）
 */
export const createGitSyncSchema = (t: (key: string) => string) => z.object({
    id: z.number().optional(),
    vault: z.string().min(1, t("ui.validation.git.vaultRequired")),
    repoUrl: z.string().min(1, t("ui.validation.git.repoUrlRequired")).url(t("ui.validation.git.repoUrlInvalid")),
    branch: z.string().min(1, t("ui.validation.git.branchRequired")),
    username: z.string().optional(),
    password: z.string().optional(),
    delay: z.number().min(0, t("ui.validation.git.delayMin")),
    retentionDays: z.number().min(-1, t("ui.validation.git.retentionDaysMin")).default(0),
    isEnabled: z.boolean().default(true),
    includeConfig: z.boolean().default(false),
    configSyncRules: z.array(z.string()).default([]),
    sourceDir: z.string().optional().refine(isValidRelativeSubdir, t("ui.validation.git.subdirPathInvalid")),
    targetSubdir: z.string().optional().refine(isValidRelativeSubdir, t("ui.validation.git.subdirPathInvalid")),
    requireFrontmatter: z.string().optional().refine(isValidFrontmatterFilter, t("ui.validation.git.requireFrontmatterInvalid")),
    validateFrontmatter: z.boolean().optional(),
    bundleAssets: z.boolean().optional(),
    webhookUrl: z.string().optional().refine(isValidWebhookUrl, t("ui.validation.git.webhookUrlInvalid")),
}).superRefine((data, ctx) => {
    if (data.includeConfig && data.configSyncRules.filter(r => r.trim() !== "").length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("ui.validation.git.configSyncRulesRequired"),
            path: ["configSyncRules"],
        });
    }
});

export type GitSyncFormData = z.infer<ReturnType<typeof createGitSyncSchema>>;
