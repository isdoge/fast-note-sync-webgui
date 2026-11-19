import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteList, type ShareFilterType, type ViewModeType } from "./note-list";
import { useRealtimeStore } from "@/stores/realtime-store";
import type { File as FileDTO, FileListResponse } from "@/lib/types/file";
import type { Note, NoteListResponse } from "@/lib/types/note";

const mocks = vi.hoisted(() => ({
    handleNoteList: vi.fn(),
    handleFolderList: vi.fn(),
    handleFolderNotes: vi.fn(),
    handleFolderFiles: vi.fn(),
    handleFileList: vi.fn(),
    handleGetNoteSharePaths: vi.fn(),
    handleNoteListByPaths: vi.fn(),
    getRawFileUrl: vi.fn((v: string, p: string) => `/api/file?vault=${v}&path=${p}`),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/components/api-handle/note-handle", () => ({
    useNoteHandle: () => ({
        handleNoteList: mocks.handleNoteList,
        handleDeleteNote: vi.fn(),
        handleRestoreNote: vi.fn(),
        handleFolderList: mocks.handleFolderList,
        handleFolderNotes: mocks.handleFolderNotes,
        handlePermanentDeleteNote: vi.fn(),
        handleClearNoteRecycle: vi.fn(),
        handleRenameNote: vi.fn(),
        handleNoteListByPaths: mocks.handleNoteListByPaths,
        handleDeleteFolder: vi.fn(),
        handleCreateFolder: vi.fn(),
    }),
}));

vi.mock("@/components/api-handle/file-handle", () => ({
    useFileHandle: () => ({
        handleFileList: mocks.handleFileList,
        handleDeleteFile: vi.fn(),
        getRawFileUrl: mocks.getRawFileUrl,
        handleFolderFiles: mocks.handleFolderFiles,
        handleRenameFile: vi.fn(),
        handleFileUpload: vi.fn(),
    }),
}));

vi.mock("@/components/api-handle/share-handle", () => ({
    useShareHandle: () => ({
        handleGetNoteSharePaths: mocks.handleGetNoteSharePaths,
    }),
}));

vi.mock("@/components/context/confirm-dialog-context", () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: vi.fn(),
    }),
}));

vi.mock("@/hooks/use-mobile", () => ({
    useMobile: () => false,
}));

vi.mock("@/components/share/share-modal", () => ({
    ShareModal: () => null,
}));

vi.mock("@/components/file/file-preview", () => ({
    FilePreview: ({ file, url }: { file: FileDTO; url: string }) => (
        <div data-testid="file-preview-url" data-path={file.path} data-url={url} data-size={String(file.size)} />
    ),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

function Harness({ vault = "doge", initialViewMode = "flat-file", isRecycle = false, onSelectNote = vi.fn() }: { vault?: string; initialViewMode?: ViewModeType; isRecycle?: boolean; onSelectNote?: (note: Note, previewMode?: boolean) => void }) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [currentPath, setCurrentPath] = useState("");
    const [currentPathHash, setCurrentPathHash] = useState("");
    const [pathHashMap, setPathHashMap] = useState<Record<string, string>>({});
    const [shareFilter, setShareFilter] = useState<ShareFilterType>(null);
    const [viewMode, setViewMode] = useState<ViewModeType>(initialViewMode);

    return (
        <NoteList
            vault={vault}
            onSelectNote={onSelectNote}
            onCreateNote={vi.fn()}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            onViewHistory={vi.fn()}
            isRecycle={isRecycle}
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            currentPathHash={currentPathHash}
            setCurrentPathHash={setCurrentPathHash}
            pathHashMap={pathHashMap}
            setPathHashMap={setPathHashMap}
            shareFilter={shareFilter}
            setShareFilter={setShareFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
        />
    );
}

describe("NoteList realtime scopes (shares, files, trash)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRealtimeStore.getState().reset();
        mocks.handleGetNoteSharePaths.mockImplementation((_v: string, cb: (p: string[]) => void) => cb([]));
        mocks.handleFolderList.mockImplementation((_v: string, _p: string, _ph: string, cb: (d: unknown[]) => void) => cb([]));
        mocks.handleFolderNotes.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: NoteListResponse) => void) =>
            cb({ list: [], pager: { page: 1, pageSize: 10, totalRows: 0 } })
        );
        mocks.handleFolderFiles.mockImplementation((_v: string, _p: string, _ph: string, _pg: number, _ps: number, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({ list: [], pager: { page: 1, pageSize: 10, totalRows: 0, totalPages: 0 } })
        );
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "a.png", pathHash: "h-a", contentHash: "c-a", size: 1, ctime: 1, mtime: 1, lastTime: 1 }] as FileDTO[],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );
        mocks.handleNoteList.mockImplementation((_v: string, _pg: number, _ps: number, _kw: string, _r: boolean, _sm: string, _sc: boolean, _sb: string, _so: string, cb: (d: NoteListResponse) => void) =>
            cb({
                list: [{ id: 1, action: "", path: "trash.md", pathHash: "h-t", ctime: 1, mtime: 1, updatedTimestamp: 1, updatedAt: "", createdAt: "", version: 1 }] as Note[],
                pager: { page: 1, pageSize: 10, totalRows: 1 },
            })
        );
    });

    afterEach(() => {
        useRealtimeStore.getState().reset();
    });

    it("refreshes share paths on shares bump and flat-file list on files bump", async () => {
        render(<Harness initialViewMode="flat-file" />);

        expect(await screen.findByText("a.png")).toBeInTheDocument();
        expect(mocks.handleGetNoteSharePaths).toHaveBeenCalledTimes(1);
        expect(mocks.handleFileList).toHaveBeenCalledTimes(1);

        act(() => {
            useRealtimeStore.getState().bump("shares");
        });
        await waitFor(() => {
            expect(mocks.handleGetNoteSharePaths).toHaveBeenCalledTimes(2);
        });
        // Bumping shares does not refetch flat-file list unnecessarily
        expect(mocks.handleFileList).toHaveBeenCalledTimes(1);

        act(() => {
            useRealtimeStore.getState().bump("files");
        });
        await waitFor(() => {
            expect(mocks.handleFileList).toHaveBeenCalledTimes(2);
        });
    });

    it("refreshes trash note list on trash bump when in recycle mode", async () => {
        render(<Harness initialViewMode="flat" isRecycle={true} />);

        expect(await screen.findByText("trash")).toBeInTheDocument();
        expect(mocks.handleNoteList).toHaveBeenCalledTimes(1);

        act(() => {
            useRealtimeStore.getState().bump("trash");
        });
        await waitFor(() => {
            expect(mocks.handleNoteList).toHaveBeenCalledTimes(2);
        });
    });

    it("refreshes attachment preview when matching FileSyncUpdate is followed synchronously by another event", async () => {
        render(<Harness initialViewMode="flat-file" />);

        const fileItem = await screen.findByText("a.png");
        fireEvent.click(fileItem);

        const previewEl = await screen.findByTestId("file-preview-url");
        const initialUrl = previewEl.getAttribute("data-url");
        expect(initialUrl).toBe("/api/file?vault=doge&path=a.png");

        act(() => {
            const store = useRealtimeStore.getState();
            store.ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FileSyncUpdate",
                        path: "a.png",
                        pathHash: "h-a",
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "c-a-2",
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

    it("passes version arg to getRawFileUrl and syncs previewFile.size when NoteList refreshes", async () => {
        let currentFile: FileDTO = {
            path: "big.log",
            pathHash: "h-big",
            contentHash: "",
            size: 3 * 1024 * 1024,
            ctime: 1,
            mtime: 100,
            lastTime: 100,
        };
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [currentFile],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );

        render(<Harness initialViewMode="flat-file" />);

        fireEvent.click(await screen.findByText("big.log"));
        // Falls back to mtime when contentHash is empty
        expect(mocks.getRawFileUrl).toHaveBeenCalledWith("doge", "big.log", "h-big", 100);
        expect(await screen.findByTestId("file-preview-url")).toHaveAttribute("data-size", String(3 * 1024 * 1024));

        currentFile = { ...currentFile, size: 64, contentHash: "c-small-2", mtime: 200 };
        act(() => {
            useRealtimeStore.getState().bump("files");
        });

        await waitFor(() => {
            expect(screen.getByTestId("file-preview-url")).toHaveAttribute("data-size", "64");
        });
    });

    it("clears open preview when switching vault", async () => {
        const { rerender } = render(<Harness vault="doge" initialViewMode="flat-file" />);

        fireEvent.click(await screen.findByText("a.png"));
        expect(await screen.findByTestId("file-preview-url")).toBeInTheDocument();

        rerender(<Harness vault="other-vault" initialViewMode="flat-file" />);
        await waitFor(() => {
            expect(screen.queryByTestId("file-preview-url")).not.toBeInTheDocument();
        });
    });

    it("opens .canvas files via onSelectNote (CanvasViewer) instead of FilePreview", async () => {
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "diagrams/board.canvas", pathHash: "h-canvas", contentHash: "c-canvas", size: 50, ctime: 10, mtime: 20, lastTime: 20 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );

        const onSelectNote = vi.fn();
        render(<Harness initialViewMode="flat-file" onSelectNote={onSelectNote} />);

        fireEvent.click(await screen.findByText("diagrams/board.canvas"));

        expect(onSelectNote).toHaveBeenCalledWith(
            expect.objectContaining({
                path: "diagrams/board.canvas",
                pathHash: "h-canvas",
            }),
            true
        );
        expect(screen.queryByTestId("file-preview-url")).not.toBeInTheDocument();
    });

    it("updates open preview on FolderSyncRename and closes on ancestor FolderSyncDelete in NoteList", async () => {
        mocks.handleFileList.mockImplementation((_v: string, _pg: number, _ps: number, _r: boolean, _kw: string, _sb: string, _so: string, cb: (d: FileListResponse) => void) =>
            cb({
                list: [{ path: "a/b/doc.png", pathHash: "h-ab-doc", contentHash: "c-doc", size: 10, ctime: 1, mtime: 1, lastTime: 1 }],
                pager: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 },
            })
        );

        render(<Harness initialViewMode="flat-file" />);

        fireEvent.click(await screen.findByText("a/b/doc.png"));
        expect(await screen.findByTestId("file-preview-url")).toHaveAttribute("data-path", "a/b/doc.png");

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
            expect(screen.getByTestId("file-preview-url")).toHaveAttribute("data-path", "x/y/doc.png");
        });

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
