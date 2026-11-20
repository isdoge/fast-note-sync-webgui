import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitConfigForm } from "./git-config-form";
import { GitAutomation } from "./git-automation";
import { createGitSyncSchema } from "@/lib/validations/git-sync-schema";
import { formatGitSyncMessage } from "@/lib/utils/git-sync-message";
import zhCN from "@/i18n/locales/zh-CN";
import en from "@/i18n/locales/en";
import type { GitSyncConfigDTO, GitSyncHistoryDTO } from "@/lib/types/git";
import type { VaultType } from "@/lib/types/vault";

const mocks = vi.hoisted(() => ({
    handleVaultList: vi.fn(),
    handleGitSyncList: vi.fn(),
    handleGitSyncUpdate: vi.fn(),
    handleGitSyncDelete: vi.fn(),
    handleGitSyncExecute: vi.fn(),
    handleGitSyncClean: vi.fn(),
    handleGitSyncHistories: vi.fn(),
    handleGitSyncValidate: vi.fn(),
}));

function makeInterpolatingT(dict: Record<string, string>) {
    return (key: string, options?: Record<string, unknown>) => {
        const template = dict[key] ?? key;
        if (!options) return template;
        return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(options[k] ?? ""));
    };
}

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            if (!options) return key;
            const suffix = Object.entries(options)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(",");
            return `${key}(${suffix})`;
        },
    }),
}));

vi.mock("@/components/context/confirm-dialog-context", () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: vi.fn(),
    }),
}));

vi.mock("@/components/api-handle/vault-handle", () => ({
    useVaultHandle: () => ({
        handleVaultList: mocks.handleVaultList,
    }),
}));

vi.mock("@/components/api-handle/git-handle", () => ({
    useGitHandle: () => ({
        handleGitSyncList: mocks.handleGitSyncList,
        handleGitSyncUpdate: mocks.handleGitSyncUpdate,
        handleGitSyncDelete: mocks.handleGitSyncDelete,
        handleGitSyncExecute: mocks.handleGitSyncExecute,
        handleGitSyncClean: mocks.handleGitSyncClean,
        handleGitSyncHistories: mocks.handleGitSyncHistories,
        handleGitSyncValidate: mocks.handleGitSyncValidate,
    }),
}));

const sampleVaults: VaultType[] = [
    { id: "1", vault: "my-vault", noteCount: 10, noteSize: 100, fileCount: 2, fileSize: 200 },
];

describe("Git Firefly subdir mapping & blog publish", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "ResizeObserver",
            class MockResizeObserver {
                observe = vi.fn();
                unobserve = vi.fn();
                disconnect = vi.fn();
            }
        );
        Element.prototype.hasPointerCapture = vi.fn(() => false);
        Element.prototype.setPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.scrollIntoView = vi.fn();
    });

    it("createGitSyncSchema validates subdir paths, requireFrontmatter, and webhookUrl", () => {
        const schema = createGitSyncSchema((k) => k);
        const base = {
            vault: "my-vault",
            repoUrl: "https://github.com/username/blog-repo.git",
            branch: "main",
            delay: 60,
            retentionDays: 30,
            isEnabled: true,
            includeConfig: false,
            configSyncRules: [],
        };

        expect(schema.safeParse({
            ...base,
            sourceDir: "Blog",
            targetSubdir: "src/content/posts",
            requireFrontmatter: "type=share",
            validateFrontmatter: true,
            bundleAssets: true,
            webhookUrl: "https://example.com/webhooks/rebuild",
        }).success).toBe(true);

        expect(schema.safeParse({ ...base, sourceDir: "/Blog" }).success).toBe(false);
        expect(schema.safeParse({ ...base, targetSubdir: "../outside" }).success).toBe(false);
        expect(schema.safeParse({ ...base, targetSubdir: "src/.git/hooks" }).success).toBe(false);
        expect(schema.safeParse({ ...base, requireFrontmatter: "=share" }).success).toBe(false);
        expect(schema.safeParse({ ...base, webhookUrl: "ftp://example.com/hook" }).success).toBe(false);
    });

    it("GitConfigForm Firefly preset fills generic defaults without overwriting existing branch, sourceDir, repo, or auth", async () => {
        render(<GitConfigForm vaults={sampleVaults} onSubmit={vi.fn()} />);

        const repoInput = screen.getByLabelText("ui.git.repoUrl") as HTMLInputElement;
        const branchInput = screen.getByLabelText("ui.git.form.branch") as HTMLInputElement;
        const usernameInput = screen.getByLabelText("ui.auth.username") as HTMLInputElement;
        const passwordInput = screen.getByLabelText("ui.auth.password / Token") as HTMLInputElement;

        expect(repoInput.placeholder).toBe("https://github.com/username/blog-repo.git");

        fireEvent.change(repoInput, { target: { value: "https://github.com/alice/my-blog.git" } });
        fireEvent.change(branchInput, { target: { value: "blog-main" } });
        fireEvent.change(usernameInput, { target: { value: "blogbot" } });
        fireEvent.change(passwordInput, { target: { value: "secret" } });

        fireEvent.click(screen.getByRole("button", { name: "ui.git.form.applyFireflyPreset" }));

        await waitFor(() => {
            expect((screen.getByLabelText("ui.git.form.branch") as HTMLInputElement).value).toBe("blog-main");
            expect((screen.getByLabelText("ui.git.form.sourceDir") as HTMLInputElement).value).toBe("Blog");
            expect((screen.getByLabelText("ui.git.form.targetSubdir") as HTMLInputElement).value).toBe("src/content/posts");
            expect((screen.getByLabelText("ui.git.form.requireFrontmatter") as HTMLInputElement).value).toBe("type=share");
            expect((screen.getByLabelText("ui.git.form.delay") as HTMLInputElement).value).toBe("60");
        });

        expect(repoInput.value).toBe("https://github.com/alice/my-blog.git");
        expect(repoInput.placeholder).toBe("https://github.com/username/blog-repo.git");
        expect(usernameInput.value).toBe("blogbot");
        expect(passwordInput.value).toBe("secret");

        // User clears branch and customizes sourceDir, then clicks preset again:
        // empty branch defaults to "main", non-empty sourceDir is preserved.
        fireEvent.change(branchInput, { target: { value: "" } });
        const sourceDirInput = screen.getByLabelText("ui.git.form.sourceDir") as HTMLInputElement;
        fireEvent.change(sourceDirInput, { target: { value: "Articles/Public" } });
        fireEvent.click(screen.getByRole("button", { name: "ui.git.form.applyFireflyPreset" }));

        await waitFor(() => {
            expect(branchInput.value).toBe("main");
            expect(sourceDirInput.value).toBe("Articles/Public");
        });
    });

    it("GitAutomation renders multi-config tip, subdir mapping badge, and localized messages", async () => {
        const sampleConfigs: GitSyncConfigDTO[] = [
            {
                id: 1,
                vault: "my-vault",
                repoUrl: "https://github.com/alice/my-blog.git",
                branch: "main",
                username: "git",
                delay: 60,
                retentionDays: 30,
                isEnabled: true,
                lastSyncTime: "2026-11-20 14:30:00",
                lastStatus: 2,
                lastMessage: "Sync completed at 2026-11-20 14:30:05 | Preview deployed: bd8a3a2",
                includeConfig: false,
                configSyncRules: [],
                sourceDir: "Blog",
                targetSubdir: "src/content/posts",
                requireFrontmatter: "type=share",
                validateFrontmatter: true,
                bundleAssets: true,
                updatedAt: "2026-11-20 14:30:05",
            },
        ];

        const sampleHistories: GitSyncHistoryDTO[] = [
            {
                id: 10,
                configId: 1,
                startTime: "2026-11-20 14:30:00",
                endTime: "2026-11-20 14:30:05",
                status: 2,
                message: "Sync completed at 2026-11-20 14:30:05 | skipped 2 invalid posts: draft.md: missing title",
            },
        ];

        mocks.handleVaultList.mockImplementation((cb: (data: VaultType[]) => void) => cb(sampleVaults));
        mocks.handleGitSyncList.mockImplementation((cb: (data: GitSyncConfigDTO[]) => void) => cb(sampleConfigs));
        mocks.handleGitSyncHistories.mockImplementation(
            (_p: number, _s: number, _c: number | undefined, cb: (data: { list: GitSyncHistoryDTO[]; total: number }) => void) =>
                cb({ list: sampleHistories, total: 1 })
        );

        render(<GitAutomation />);

        expect(await screen.findByText("ui.git.multiConfigTip")).toBeInTheDocument();
        expect(screen.getByText("Blog → src/content/posts")).toBeInTheDocument();
        expect(screen.getByText("type=share")).toBeInTheDocument();
        expect(
            screen.getByText("ui.git.message.syncCompletedAt(time=2026-11-20 14:30:05) | ui.git.message.previewDeployed(detail=bd8a3a2)")
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "ui.git.message.syncCompletedAt(time=2026-11-20 14:30:05) | ui.git.message.skippedPosts(count=2,detail=draft.md: missing title)"
            )
        ).toBeInTheDocument();
    });

    it("formatGitSyncMessage localizes server receipts in zh-CN and preserves English in en", () => {
        const tZh = makeInterpolatingT(zhCN);
        const tEn = makeInterpolatingT(en);

        expect(formatGitSyncMessage("Sync completed at 2026-11-20 14:30:05", tZh)).toBe(
            "已于 2026-11-20 14:30:05 完成同步"
        );
        expect(formatGitSyncMessage("Sync completed at 2026-11-20 14:30:05", tEn)).toBe(
            "Sync completed at 2026-11-20 14:30:05"
        );

        expect(
            formatGitSyncMessage(
                "Sync completed at 2026-11-20 14:30:05 | Preview deployed: bd8a3a2 | skipped 2 invalid posts: a.md: missing title",
                tZh
            )
        ).toBe("已于 2026-11-20 14:30:05 完成同步 | 预览已部署：bd8a3a2 | 已跳过 2 篇未通过预检的文章：a.md: missing title");

        expect(
            formatGitSyncMessage(
                "git pushed, but remote hook deploy failed: Saved settings await confirmation: rebuild from /settings/",
                tZh
            )
        ).toBe("Git 已推送，但远端部署钩子执行失败：已保存的站点设置正等待确认：rebuild from /settings/");

        expect(
            formatGitSyncMessage("Preview deployment failed: astro build error", tZh)
        ).toBe("预览部署失败：astro build error");

        expect(
            formatGitSyncMessage("Preview deployment failed: astro build error", tEn)
        ).toBe("Preview deployment failed: astro build error");
    });
});
