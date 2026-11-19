import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileList } from "@/components/file/file-list";
import { SettingManager } from "@/components/setting/setting-manager";
import { NoteTreeSidebar } from "@/components/note/note-tree-sidebar";
import { useRealtimeStore } from "@/stores/realtime-store";
import zhCN from "@/i18n/locales/zh-CN";
import zhTW from "@/i18n/locales/zh-TW";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import ko from "@/i18n/locales/ko";
import type { File as FileDTO, FileListResponse } from "@/lib/types/file";
import type { Folder } from "@/lib/types/folder";
import type { NoteListResponse } from "@/lib/types/note";
import type { SettingListResponse } from "@/lib/types/setting";

const mocks = vi.hoisted(() => ({
    handleFileList: vi.fn(),
    handleFolderFiles: vi.fn(),
    handleFolderList: vi.fn(),
    handleFolderNotes: vi.fn(),
    handleNoteList: vi.fn(),
    handleSettingList: vi.fn(),
    handleVaultList: vi.fn(),
    getRawFileUrl: vi.fn(),
    openConfirmDialog: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/components/api-handle/file-handle", () => ({
    useFileHandle: () => ({
        handleFileList: mocks.handleFileList,
        handleDeleteFile: vi.fn(),
        handleRestoreFile: vi.fn(),
        getRawFileUrl: mocks.getRawFileUrl,
        handleFolderFiles: mocks.handleFolderFiles,
        handleFolderList: mocks.handleFolderList,
        handlePermanentDeleteFile: vi.fn(),
        handleClearFileRecycle: vi.fn(),
        handleRenameFile: vi.fn(),
    }),
}));

vi.mock("@/components/api-handle/note-handle", () => ({
    useNoteHandle: () => ({
        handleFolderList: mocks.handleFolderList,
        handleFolderNotes: mocks.handleFolderNotes,
        handleNoteList: mocks.handleNoteList,
    }),
}));

vi.mock("@/components/api-handle/setting-handle", () => ({
    useSettingHandle: () => ({
        handleSettingList: mocks.handleSettingList,
        handleSaveSetting: vi.fn(),
        handleDeleteSetting: vi.fn(),
        handleRenameSetting: vi.fn(),
    }),
}));

vi.mock("@/components/api-handle/vault-handle", () => ({
    useVaultHandle: () => ({
        handleVaultList: mocks.handleVaultList,
    }),
}));

vi.mock("@/components/context/confirm-dialog-context", () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: mocks.openConfirmDialog,
    }),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/file/file-preview", () => ({
    FilePreview: ({ file, url }: { file: FileDTO; url: string }) => (
        <div data-testid="file-preview-url" data-path={file.path} data-url={url} />
    ),
}));

describe("realtime scope wiring (files, trash, settings, tree, i18n)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRealtimeStore.getState().reset();
        mocks.handleVaultList.mockImplementation((cb: (v: unknown[]) => void) => cb([]));
        mocks.getRawFileUrl.mockImplementation((vault: string, path: string) => `/api/file?vault=${vault}&path=${path}`);
        mocks.handleFolderList.mockImplementation((_v: string, _p: string, _ph: string, cb: (d: Folder[]) => void) => cb([]));
        mocks.handleFolderNotes.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: NoteListResponse) => void) =>
            cb({ list: [], pager: { page: 1, pageSize: 10, totalRows: 0 } })
        );
        mocks.handleFolderFiles.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({ list: [], pager: { page: 1, pageSize: 10, totalRows: 0, totalPages: 0 } })
        );
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "img.png", pathHash: "h-img", contentHash: "c-img", size: 10, ctime: 1, mtime: 1, lastTime: 1 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );
        mocks.handleSettingList.mockImplementation((_v: string, cb: (d: SettingListResponse) => void) =>
            cb({ list: [], pager: { page: 1, pageSize: 20, totalRows: 0 } })
        );
    });

    afterEach(() => {
        useRealtimeStore.getState().reset();
    });

    it("refreshes FileList in trash mode on trash revision and reloads preview on FileSyncUpdate", async () => {
        render(
            <FileList
                vault="doge"
                isRecycle={true}
                page={1}
                setPage={vi.fn()}
                pageSize={10}
                setPageSize={vi.fn()}
                searchKeyword=""
                setSearchKeyword={vi.fn()}
                currentPath=""
                setCurrentPath={vi.fn()}
                currentPathHash=""
                setCurrentPathHash={vi.fn()}
                pathHashMap={{}}
                setPathHashMap={vi.fn()}
            />
        );

        expect(await screen.findByText("img.png")).toBeInTheDocument();
        expect(mocks.handleFileList).toHaveBeenCalledTimes(1);

        // Open preview
        fireEvent.click(screen.getByText("img.png"));
        const previewEl = await screen.findByTestId("file-preview-url");
        const initialUrl = previewEl.getAttribute("data-url");

        // Bump trash revision -> refetches trash files
        act(() => {
            useRealtimeStore.getState().bump("trash");
        });

        await waitFor(() => {
            expect(mocks.handleFileList).toHaveBeenCalledTimes(2);
        });

        // FileSyncUpdate matching previewFile updates preview URL with cache buster
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FileSyncUpdate",
                        path: "img.png",
                        pathHash: "h-img",
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "c-img-2",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2,
                    },
                },
                "doge"
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId("file-preview-url").getAttribute("data-url")).not.toBe(initialUrl);
        });
    });

    it("refreshes SettingManager/SettingList when settings revision bumps", async () => {
        render(
            <SettingManager
                vault="doge"
                onVaultChange={vi.fn()}
                onNavigateToVaults={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(mocks.handleSettingList).toHaveBeenCalledTimes(1);
        });

        act(() => {
            useRealtimeStore.getState().bump("settings");
        });

        await waitFor(() => {
            expect(mocks.handleSettingList).toHaveBeenCalledTimes(2);
        });
    });

    it("refreshes NoteTreeSidebar root and expanded folders without collapsing tree", async () => {
        mocks.handleFolderList.mockImplementation((_v: string, path: string, _ph: string, cb: (d: Folder[]) => void) => {
            if (path === "") {
                cb([{ path: "Docs", pathHash: "f-docs", ctime: 1, mtime: 1, lastTime: 1 }]);
                return;
            }
            cb([]);
        });

        render(<NoteTreeSidebar vault="doge" onSelectNote={vi.fn()} />);

        const docsBtn = await screen.findByRole("button", { name: "Docs" });
        fireEvent.click(docsBtn);

        await waitFor(() => {
            expect(docsBtn).toHaveAttribute("aria-expanded", "true");
        });

        const callsBefore = mocks.handleFolderList.mock.calls.length;

        act(() => {
            useRealtimeStore.getState().bump("tree");
        });

        await waitFor(() => {
            // Re-fetched both root "" and expanded "Docs"
            expect(mocks.handleFolderList.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2);
        });
        expect(screen.getByRole("button", { name: "Docs" })).toHaveAttribute("aria-expanded", "true");
    });

    it("has all ui.realtime.* keys in all 5 locales", () => {
        const expectedKeys = [
            "ui.realtime.remoteUpdatedConflict",
            "ui.realtime.reloadRemote",
            "ui.realtime.keepCurrent",
            "ui.realtime.remoteDeletedMessage",
            "ui.realtime.remoteDeletedToast",
            "ui.realtime.backToList",
        ] as const;

        for (const locale of [zhCN, zhTW, en, ja, ko]) {
            for (const key of expectedKeys) {
                expect(locale[key]).toBeTruthy();
            }
        }
    });
});
