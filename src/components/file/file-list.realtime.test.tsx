import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileList } from "./file-list";
import { useRealtimeStore } from "@/stores/realtime-store";
import type { File as FileDTO, FileListResponse } from "@/lib/types/file";
import type { Folder } from "@/lib/types/folder";

const mocks = vi.hoisted(() => ({
    handleFileList: vi.fn(),
    handleFolderFiles: vi.fn(),
    handleFolderList: vi.fn(),
    getRawFileUrl: vi.fn((vault: string, path: string) => `/api/file?vault=${vault}&path=${path}`),
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

vi.mock("@/components/context/confirm-dialog-context", () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: vi.fn(),
    }),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/file/file-preview", () => ({
    FilePreview: ({ file, url }: { file: FileDTO; url: string }) => (
        <div data-testid="file-preview-url" data-path={file.path} data-url={url} data-size={String(file.size)} />
    ),
}));

describe("FileList realtime preview", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRealtimeStore.getState().reset();
        mocks.handleFolderList.mockImplementation((_v: string, _p: string, _ph: string, cb: (d: Folder[]) => void) => cb([]));
        mocks.handleFolderFiles.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "img.png", pathHash: "h-img", contentHash: "c-img", size: 10, ctime: 1, mtime: 1, lastTime: 1 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "img.png", pathHash: "h-img", contentHash: "c-img", size: 10, ctime: 1, mtime: 1, lastTime: 1 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );
    });

    afterEach(() => {
        useRealtimeStore.getState().reset();
    });

    it("refreshes attachment preview when matching FileSyncUpdate is followed synchronously by another event", async () => {
        render(
            <FileList
                vault="doge"
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

        fireEvent.click(await screen.findByText("img.png"));
        const previewEl = await screen.findByTestId("file-preview-url");
        const initialUrl = previewEl.getAttribute("data-url");
        expect(initialUrl).toBe("/api/file?vault=doge&path=img.png");

        act(() => {
            const store = useRealtimeStore.getState();
            store.ingestFrame(
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
                        ts: 2000,
                    },
                },
                "doge"
            );
            store.ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/other.md",
                        pathHash: "h-other",
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "c-other",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2001,
                    },
                },
                "doge"
            );
        });

        await waitFor(() => {
            const nextUrl = screen.getByTestId("file-preview-url").getAttribute("data-url");
            expect(nextUrl).not.toBe(initialUrl);
            expect(nextUrl).toContain("_=");
        });
    });

    it("passes version arg to getRawFileUrl and syncs previewFile.size when list refreshes after FileSyncUpdate", async () => {
        let currentFile: FileDTO = {
            path: "big.log",
            pathHash: "h-big",
            contentHash: "c-big-1",
            size: 3 * 1024 * 1024,
            ctime: 1,
            mtime: 100,
            lastTime: 100,
        };
        mocks.handleFolderFiles.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [currentFile],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );

        render(
            <FileList
                vault="doge"
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

        fireEvent.click(await screen.findByText("big.log"));
        expect(mocks.getRawFileUrl).toHaveBeenCalledWith("doge", "big.log", "h-big", "c-big-1");
        expect(await screen.findByTestId("file-preview-url")).toHaveAttribute("data-size", String(3 * 1024 * 1024));

        currentFile = { ...currentFile, size: 128, contentHash: "c-small-2", mtime: 200 };
        act(() => {
            useRealtimeStore.getState().bump("files");
        });

        await waitFor(() => {
            expect(screen.getByTestId("file-preview-url")).toHaveAttribute("data-size", "128");
        });
    });

    it("clears open preview when switching vault", async () => {
        const props = {
            page: 1,
            setPage: vi.fn(),
            pageSize: 10,
            setPageSize: vi.fn(),
            searchKeyword: "",
            setSearchKeyword: vi.fn(),
            currentPath: "",
            setCurrentPath: vi.fn(),
            currentPathHash: "",
            setCurrentPathHash: vi.fn(),
            pathHashMap: {},
            setPathHashMap: vi.fn(),
        };
        const { rerender } = render(<FileList vault="doge" {...props} />);

        fireEvent.click(await screen.findByText("img.png"));
        expect(await screen.findByTestId("file-preview-url")).toBeInTheDocument();

        rerender(<FileList vault="other-vault" {...props} />);
        await waitFor(() => {
            expect(screen.queryByTestId("file-preview-url")).not.toBeInTheDocument();
        });
    });

    it("updates open preview on FolderSyncRename and closes on ancestor FolderSyncDelete", async () => {
        mocks.handleFolderFiles.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "a/b/img.png", pathHash: "h-ab-img", contentHash: "c-img", size: 10, ctime: 1, mtime: 1, lastTime: 1 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );

        render(
            <FileList
                vault="doge"
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

        fireEvent.click(await screen.findByText("img.png"));
        expect(await screen.findByTestId("file-preview-url")).toHaveAttribute("data-path", "a/b/img.png");

        // Folder rename a/b -> x/y
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncRename",
                        path: "x/y",
                        pathHash: "h-xy",
                        oldPath: "a/b",
                        oldPathHash: "h-ab",
                        contentHash: "",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2000,
                    },
                },
                "doge"
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId("file-preview-url")).toHaveAttribute("data-path", "x/y/img.png");
        });

        // Non-ancestor delete x/yz does not close
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncDelete",
                        path: "x/yz",
                        pathHash: "h-xyz",
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2500,
                    },
                },
                "doge"
            );
        });
        expect(screen.getByTestId("file-preview-url")).toBeInTheDocument();

        // Ancestor delete x/y closes preview
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncDelete",
                        path: "x/y",
                        pathHash: "h-xy",
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 3000,
                    },
                },
                "doge"
            );
        });

        await waitFor(() => {
            expect(screen.queryByTestId("file-preview-url")).not.toBeInTheDocument();
        });
    });
});
