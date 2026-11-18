import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupForm } from "./backup-form";
import { GitConfigForm } from "./git-config-form";
import type { StorageConfig } from "@/lib/types/storage";
import type { VaultType } from "@/lib/types/vault";

const mocks = vi.hoisted(() => ({
    handleVaultList: vi.fn(),
    handleBackupConfigUpdate: vi.fn(),
    handleGitSyncUpdate: vi.fn(),
    handleGitSyncValidate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/components/api-handle/vault-handle", () => ({
    useVaultHandle: () => ({
        handleVaultList: mocks.handleVaultList,
    }),
}));

vi.mock("@/components/api-handle/backup-handle", () => ({
    useBackupHandle: () => ({
        handleBackupConfigUpdate: mocks.handleBackupConfigUpdate,
    }),
}));

vi.mock("@/components/api-handle/git-handle", () => ({
    useGitHandle: () => ({
        handleGitSyncUpdate: mocks.handleGitSyncUpdate,
        handleGitSyncValidate: mocks.handleGitSyncValidate,
    }),
}));

const sampleVaults: VaultType[] = [
    { id: "1", vault: "AlphaVault", noteCount: 1, noteSize: 10, fileCount: 0, fileSize: 0 },
    { id: "2", vault: "BetaVault", noteCount: 2, noteSize: 20, fileCount: 0, fileSize: 0 },
];

const sampleStorages: StorageConfig[] = [
    { id: "10", type: "localfs", isEnabled: true, customPath: "/tmp/bak" },
];

describe("BackupForm & GitConfigForm Select regression (#421)", () => {
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

        mocks.handleVaultList.mockImplementation((cb: (list: VaultType[]) => void) => {
            cb(sampleVaults);
        });
    });

    it("BackupForm 选中第一个笔记库后可以再次打开并切换到其他笔记库", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(<BackupForm storages={sampleStorages} onSubmit={vi.fn()} />);

        const triggers = await screen.findAllByRole("combobox");
        const vaultTrigger = triggers[0];
        expect(vaultTrigger).toHaveTextContent("ui.backup.selectVault");

        fireEvent.click(vaultTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "AlphaVault" }));

        await waitFor(() => {
            expect(vaultTrigger).toHaveTextContent("AlphaVault");
        });

        fireEvent.click(vaultTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "BetaVault" }));

        await waitFor(() => {
            expect(vaultTrigger).toHaveTextContent("BetaVault");
        });

        const controlledWarnings = errorSpy.mock.calls.filter((args) =>
            args.some((arg) => typeof arg === "string" && arg.includes("uncontrolled"))
        );
        expect(controlledWarnings).toHaveLength(0);
        errorSpy.mockRestore();
    });

    it("BackupForm 在 storages 异步更新后不应重置已选中的笔记库与备份类型", async () => {
        const { rerender } = render(<BackupForm storages={[]} onSubmit={vi.fn()} />);

        const triggers = await screen.findAllByRole("combobox");
        const vaultTrigger = triggers[0];
        const typeTrigger = triggers[1];

        fireEvent.click(vaultTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "AlphaVault" }));
        fireEvent.click(typeTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "ui.backup.backupType.full" }));

        await waitFor(() => {
            expect(vaultTrigger).toHaveTextContent("AlphaVault");
            expect(typeTrigger).toHaveTextContent("ui.backup.backupType.full");
        });

        // 模拟父组件异步拉取 storages 完成后传入新数组引用
        rerender(<BackupForm storages={sampleStorages} onSubmit={vi.fn()} />);

        expect(vaultTrigger).toHaveTextContent("AlphaVault");
        expect(typeTrigger).toHaveTextContent("ui.backup.backupType.full");
    });

    it("GitConfigForm 选中笔记库后可再次切换且不产生受控状态警告", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(<GitConfigForm vaults={sampleVaults} onSubmit={vi.fn()} />);

        const vaultTrigger = await screen.findByRole("combobox");
        expect(vaultTrigger).toHaveTextContent("ui.backup.selectVault");

        fireEvent.click(vaultTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "AlphaVault" }));

        await waitFor(() => {
            expect(vaultTrigger).toHaveTextContent("AlphaVault");
        });

        fireEvent.click(vaultTrigger);
        fireEvent.click(await screen.findByRole("option", { name: "BetaVault" }));

        await waitFor(() => {
            expect(vaultTrigger).toHaveTextContent("BetaVault");
        });

        const controlledWarnings = errorSpy.mock.calls.filter((args) =>
            args.some((arg) => typeof arg === "string" && arg.includes("uncontrolled"))
        );
        expect(controlledWarnings).toHaveLength(0);
        errorSpy.mockRestore();
    });
});
