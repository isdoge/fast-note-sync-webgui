import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitConfigForm } from "./git-config-form";
import { GitAutomation } from "./git-automation";
import { createGitSyncSchema } from "@/lib/validations/git-sync-schema";
import type { GitSyncConfigDTO } from "@/lib/types/git";
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

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
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
    { id: "1", vault: "doge", noteCount: 10, noteSize: 100, fileCount: 2, fileSize: 200 },
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
            vault: "doge",
            repoUrl: "http://127.0.0.1:4323/blog.git",
            branch: "master",
            delay: 60,
            retentionDays: 30,
            isEnabled: true,
            includeConfig: false,
            configSyncRules: [],
        };

        expect(schema.safeParse({
            ...base,
            sourceDir: "Blog",
            targetSubdir: "src/content/posts/经验分享",
            requireFrontmatter: "type=share",
            validateFrontmatter: true,
            bundleAssets: true,
            webhookUrl: "http://127.0.0.1:4323/__republish",
        }).success).toBe(true);

        expect(schema.safeParse({ ...base, sourceDir: "/Blog" }).success).toBe(false);
        expect(schema.safeParse({ ...base, targetSubdir: "../outside" }).success).toBe(false);
        expect(schema.safeParse({ ...base, targetSubdir: "src/.git/hooks" }).success).toBe(false);
        expect(schema.safeParse({ ...base, requireFrontmatter: "=share" }).success).toBe(false);
        expect(schema.safeParse({ ...base, webhookUrl: "ftp://127.0.0.1/hook" }).success).toBe(false);
    });

    it("GitConfigForm Firefly preset fills blog fields without overwriting user auth/repo/vault", async () => {
        render(<GitConfigForm vaults={sampleVaults} onSubmit={vi.fn()} />);

        const repoInput = screen.getByLabelText("ui.git.repoUrl") as HTMLInputElement;
        const usernameInput = screen.getByLabelText("ui.auth.username") as HTMLInputElement;
        const passwordInput = screen.getByLabelText("ui.auth.password / Token") as HTMLInputElement;

        fireEvent.change(repoInput, { target: { value: "http://127.0.0.1:4323/custom.git" } });
        fireEvent.change(usernameInput, { target: { value: "blogbot" } });
        fireEvent.change(passwordInput, { target: { value: "secret" } });

        fireEvent.click(screen.getByRole("button", { name: "ui.git.form.applyFireflyPreset" }));

        await waitFor(() => {
            expect((screen.getByLabelText("ui.git.form.branch") as HTMLInputElement).value).toBe("master");
            expect((screen.getByLabelText("ui.git.form.targetSubdir") as HTMLInputElement).value).toBe("src/content/posts/经验分享");
            expect((screen.getByLabelText("ui.git.form.requireFrontmatter") as HTMLInputElement).value).toBe("type=share");
            expect((screen.getByLabelText("ui.git.form.delay") as HTMLInputElement).value).toBe("60");
        });

        expect(repoInput.value).toBe("http://127.0.0.1:4323/custom.git");
        expect(repoInput.placeholder).toBe("http://127.0.0.1:4323/blog.git");
        expect(usernameInput.value).toBe("blogbot");
        expect(passwordInput.value).toBe("secret");
    });

    it("GitAutomation renders subdir mapping badge, frontmatter filter badge, and lastMessage", async () => {
        const sampleConfigs: GitSyncConfigDTO[] = [
            {
                id: 1,
                vault: "doge",
                repoUrl: "http://127.0.0.1:4323/blog.git",
                branch: "master",
                username: "git",
                delay: 60,
                retentionDays: 30,
                isEnabled: true,
                lastSyncTime: "2026-11-20 14:30:00",
                lastStatus: 2,
                lastMessage: "Sync completed | Preview deployed: bd8a3a2",
                includeConfig: false,
                configSyncRules: [],
                sourceDir: "",
                targetSubdir: "src/content/posts/经验分享",
                requireFrontmatter: "type=share",
                validateFrontmatter: true,
                bundleAssets: true,
                updatedAt: "2026-11-20 14:30:05",
            },
        ];

        mocks.handleVaultList.mockImplementation((cb: (data: VaultType[]) => void) => cb(sampleVaults));
        mocks.handleGitSyncList.mockImplementation((cb: (data: GitSyncConfigDTO[]) => void) => cb(sampleConfigs));
        mocks.handleGitSyncHistories.mockImplementation(
            (_p: number, _s: number, _c: number | undefined, cb: (data: { list: []; total: number }) => void) => cb({ list: [], total: 0 })
        );

        render(<GitAutomation />);

        expect(await screen.findByText("/ → src/content/posts/经验分享")).toBeInTheDocument();
        expect(screen.getByText("type=share")).toBeInTheDocument();
        expect(screen.getByText("Sync completed | Preview deployed: bd8a3a2")).toBeInTheDocument();
    });
});
