import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteList, type ShareFilterType, type ViewModeType } from "./note-list";
import type { File as FileDTO, FileListResponse } from "@/lib/types/file";
import type { Folder } from "@/lib/types/folder";
import type { Note, NoteListResponse } from "@/lib/types/note";

const mocks = vi.hoisted(() => ({
    handleNoteList: vi.fn(),
    handleDeleteNote: vi.fn(),
    handleRestoreNote: vi.fn(),
    handleFolderList: vi.fn(),
    handleFolderNotes: vi.fn(),
    handlePermanentDeleteNote: vi.fn(),
    handleClearNoteRecycle: vi.fn(),
    handleRenameNote: vi.fn(),
    handleNoteListByPaths: vi.fn(),
    handleDeleteFolder: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleGetNoteSharePaths: vi.fn(),
    handleFileList: vi.fn(),
    handleDeleteFile: vi.fn(),
    getRawFileUrl: vi.fn(),
    handleFolderFiles: vi.fn(),
    handleRenameFile: vi.fn(),
    handleFileUpload: vi.fn(),
    openConfirmDialog: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/components/api-handle/note-handle", () => ({
    useNoteHandle: () => ({
        handleNoteList: mocks.handleNoteList,
        handleDeleteNote: mocks.handleDeleteNote,
        handleRestoreNote: mocks.handleRestoreNote,
        handleFolderList: mocks.handleFolderList,
        handleFolderNotes: mocks.handleFolderNotes,
        handlePermanentDeleteNote: mocks.handlePermanentDeleteNote,
        handleClearNoteRecycle: mocks.handleClearNoteRecycle,
        handleRenameNote: mocks.handleRenameNote,
        handleNoteListByPaths: mocks.handleNoteListByPaths,
        handleDeleteFolder: mocks.handleDeleteFolder,
        handleCreateFolder: mocks.handleCreateFolder,
    }),
}));

vi.mock("@/components/api-handle/file-handle", () => ({
    useFileHandle: () => ({
        handleFileList: mocks.handleFileList,
        handleDeleteFile: mocks.handleDeleteFile,
        getRawFileUrl: mocks.getRawFileUrl,
        handleFolderFiles: mocks.handleFolderFiles,
        handleRenameFile: mocks.handleRenameFile,
        handleFileUpload: mocks.handleFileUpload,
    }),
}));

vi.mock("@/components/api-handle/share-handle", () => ({
    useShareHandle: () => ({
        handleGetNoteSharePaths: mocks.handleGetNoteSharePaths,
    }),
}));

vi.mock("@/components/context/confirm-dialog-context", () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: mocks.openConfirmDialog,
    }),
}));

vi.mock("@/hooks/use-mobile", () => ({
    useMobile: () => false,
}));

vi.mock("@/components/share/share-modal", () => ({
    ShareModal: () => null,
}));

vi.mock("@/components/file/file-preview", () => ({
    FilePreview: ({ file, url, onClose }: { file: FileDTO; url: string; onClose: () => void }) => (
        <div data-testid="file-preview-mock" data-path={file.path} data-url={url}>
            <span>{file.path}</span>
            <button type="button" onClick={onClose}>
                close-preview
            </button>
        </div>
    ),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
        children,
        onClick,
        disabled,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <button type="button" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
}));

function makeNote(path: string, pathHash: string, mtime = 1000): Note {
    return {
        id: pathHash.length,
        action: "create",
        path,
        pathHash,
        ctime: mtime,
        mtime,
        updatedTimestamp: mtime,
        updatedAt: "",
        createdAt: "",
        version: 1,
    };
}

function makeFile(path: string, pathHash: string, mtime = 2000): FileDTO {
    return {
        path,
        pathHash,
        contentHash: `hash-${pathHash}`,
        size: 128,
        ctime: mtime,
        mtime,
        lastTime: mtime,
    };
}

function makeFolder(path: string, pathHash: string): Folder {
    return {
        path,
        pathHash,
        ctime: 1000,
        mtime: 1000,
        lastTime: 1000,
    };
}

function NoteListHarness({ initialViewMode = "folder" }: { initialViewMode?: ViewModeType }) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [currentPath, setCurrentPath] = useState("");
    const [currentPathHash, setCurrentPathHash] = useState("");
    const [pathHashMap, setPathHashMap] = useState<Record<string, string>>({});
    const [shareFilter, setShareFilter] = useState<ShareFilterType>(null);
    const [viewMode, setViewMode] = useState<ViewModeType>(initialViewMode);

    return (
        <div>
            <span data-testid="current-view-mode">{viewMode}</span>
            <NoteList
                vault="AlphaVault"
                onSelectNote={vi.fn()}
                onCreateNote={vi.fn()}
                page={page}
                setPage={setPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                onViewHistory={vi.fn()}
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
        </div>
    );
}

describe("NoteList (#357 root & search attachments)", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.handleGetNoteSharePaths.mockImplementation((_vault: string, cb: (paths: string[]) => void) => {
            cb([]);
        });

        mocks.getRawFileUrl.mockImplementation((vault: string, path: string) => {
            return `/api/file?vault=${encodeURIComponent(vault)}&path=${encodeURIComponent(path)}`;
        });

        mocks.handleFolderList.mockImplementation(
            (_vault: string, path: string, _pathHash: string, cb: (data: Folder[] | null) => void) => {
                if (path === "") {
                    cb([makeFolder("scripts", "folder-scripts")]);
                } else {
                    cb([]);
                }
            }
        );

        mocks.handleFolderNotes.mockImplementation(
            (
                _vault: string,
                path: string,
                _pathHash: string,
                _page: number,
                _pageSize: number,
                _sortBy: string,
                _sortOrder: string,
                cb: (data: NoteListResponse | null) => void
            ) => {
                if (path === "") {
                    cb({
                        list: [makeNote("README.md", "note-readme", 3000)],
                        pager: { page: 1, pageSize: 99999, totalRows: 1 },
                    });
                } else if (path === "scripts") {
                    cb({
                        list: [makeNote("scripts/guide.md", "note-guide", 2500)],
                        pager: { page: 1, pageSize: 99999, totalRows: 1 },
                    });
                } else {
                    cb({ list: [], pager: { page: 1, pageSize: 99999, totalRows: 0 } });
                }
            }
        );

        mocks.handleFolderFiles.mockImplementation(
            (
                _vault: string,
                path: string,
                _pathHash: string,
                _page: number,
                _pageSize: number,
                _sortBy: string,
                _sortOrder: string,
                cb: (data: FileListResponse | null) => void
            ) => {
                if (path === "") {
                    cb({
                        list: [makeFile("root-demo.py", "file-root-py", 2900)],
                        pager: { page: 1, pageSize: 99999, totalRows: 1, totalPages: 1 },
                    });
                } else if (path === "scripts") {
                    cb({
                        list: [makeFile("scripts/app.py", "file-sub-py", 2800)],
                        pager: { page: 1, pageSize: 99999, totalRows: 1, totalPages: 1 },
                    });
                } else {
                    cb({ list: [], pager: { page: 1, pageSize: 99999, totalRows: 0, totalPages: 0 } });
                }
            }
        );

        mocks.handleNoteList.mockImplementation(
            (
                _vault: string,
                _page: number,
                _pageSize: number,
                keyword: string,
                _isRecycle: boolean,
                _searchMode: string,
                _searchContent: boolean,
                _sortBy: string,
                _sortOrder: string,
                cb: (data: NoteListResponse | null) => void
            ) => {
                if (keyword === "py") {
                    cb({
                        list: [makeNote("docs/python-notes.md", "note-py", 1500)],
                        pager: { page: 1, pageSize: 99999, totalRows: 1 },
                    });
                } else if (keyword === "paged") {
                    const list = Array.from({ length: 6 }, (_, i) =>
                        makeNote(`paged-note-${i}.md`, `note-p-${i}`, 2000 + i)
                    );
                    cb({ list, pager: { page: 1, pageSize: 99999, totalRows: 6 } });
                } else {
                    cb({ list: [], pager: { page: 1, pageSize: 99999, totalRows: 0 } });
                }
            }
        );

        mocks.handleFileList.mockImplementation(
            (
                _vault: string,
                _page: number,
                _pageSize: number,
                _isRecycle: boolean,
                keyword: string,
                _sortBy: string,
                _sortOrder: string,
                cb: (data: FileListResponse | null) => void
            ) => {
                if (keyword === "py") {
                    cb({
                        list: [
                            makeFile("root-demo.py", "file-root-py", 2900),
                            makeFile("scripts/app.py", "file-sub-py", 2800),
                        ],
                        pager: { page: 1, pageSize: 99999, totalRows: 2, totalPages: 1 },
                    });
                } else if (keyword === "paged") {
                    const list = Array.from({ length: 6 }, (_, i) =>
                        makeFile(`paged-file-${i}.py`, `file-p-${i}`, 1000 + i)
                    );
                    cb({ list, pager: { page: 1, pageSize: 99999, totalRows: 6, totalPages: 1 } });
                } else {
                    cb({ list: [], pager: { page: 1, pageSize: 99999, totalRows: 0, totalPages: 0 } });
                }
            }
        );
    });

    it("lists and previews attachments in root directory, subfolder, and mixed search state", async () => {
        render(<NoteListHarness />);

        // 1. 根目录应同时显示根笔记与根附件，并统计准确数量 (1 笔记 / 1 附件)
        expect(await screen.findByText("README")).toBeInTheDocument();
        expect(screen.getByText("root-demo.py")).toBeInTheDocument();
        expect(screen.getByText("1 ui.note.note / 1 ui.file.file")).toBeInTheDocument();

        // 点击根附件即可走原有 FilePreview 逻辑
        fireEvent.click(screen.getByText("root-demo.py"));
        expect(await screen.findByTestId("file-preview-mock")).toHaveAttribute("data-path", "root-demo.py");
        fireEvent.click(screen.getByText("close-preview"));

        // 2. 进入子目录后同样可查看与预览子目录附件
        fireEvent.click(screen.getByText("scripts"));
        expect(await screen.findByText("guide")).toBeInTheDocument();
        expect(screen.getByText("app.py")).toBeInTheDocument();

        // 3. 在搜索框输入关键词，默认展示命中的笔记和附件（含完整相对路径），并保留原 folder 模式
        const searchInput = screen.getByPlaceholderText("ui.note.searchAllPlaceholder");
        fireEvent.change(searchInput, { target: { value: "py" } });

        await waitFor(() => {
            expect(mocks.handleNoteList).toHaveBeenCalledWith(
                "AlphaVault",
                1,
                99999,
                "py",
                false,
                "path",
                false,
                "mtime",
                "desc",
                expect.any(Function)
            );
            expect(mocks.handleFileList).toHaveBeenCalledWith(
                "AlphaVault",
                1,
                99999,
                false,
                "py",
                "mtime",
                "desc",
                expect.any(Function)
            );
        });

        expect(await screen.findByText("docs/python-notes")).toBeInTheDocument();
        expect(screen.getByText("root-demo.py")).toBeInTheDocument();
        expect(screen.getByText("scripts/app.py")).toBeInTheDocument();
        expect(screen.getByTestId("current-view-mode")).toHaveTextContent("folder");

        // 搜索结果里点开子目录附件可直接打开 FilePreview
        fireEvent.click(screen.getByText("scripts/app.py"));
        expect(await screen.findByTestId("file-preview-mock")).toHaveAttribute("data-path", "scripts/app.py");
        fireEvent.click(screen.getByText("close-preview"));

        // 4. 切换搜索模式为“内容”时，仍按文件名匹配保留附件结果
        fireEvent.click(screen.getByText("ui.note.searchContentMode"));
        await waitFor(() => {
            expect(mocks.handleNoteList).toHaveBeenCalledWith(
                "AlphaVault",
                1,
                99999,
                "py",
                false,
                "content",
                false,
                "mtime",
                "desc",
                expect.any(Function)
            );
        });
        expect(await screen.findByText("scripts/app.py")).toBeInTheDocument();

        // 5. 清空搜索词后恢复目录浏览，不被强切为平铺视图
        fireEvent.change(searchInput, { target: { value: "" } });
        expect(await screen.findByText("guide")).toBeInTheDocument();
        expect(screen.getByText("app.py")).toBeInTheDocument();
    });

    it("supports pagination, sorting, empty state, and type filter in search mode", async () => {
        render(<NoteListHarness />);
        expect(await screen.findByText("README")).toBeInTheDocument();

        const searchInput = screen.getByPlaceholderText("ui.note.searchAllPlaceholder");

        // 1. 搜索无匹配显示空状态
        fireEvent.change(searchInput, { target: { value: "not-found" } });
        expect(await screen.findByText("ui.common.noSearchResults")).toBeInTheDocument();

        // 2. 多页混合搜索（6 笔记 + 6 附件 = 12 条，默认每页 10 条 -> 2 页）
        fireEvent.change(searchInput, { target: { value: "paged" } });
        expect(await screen.findByText("1 / 2")).toBeInTheDocument();
        expect(screen.getByText("ui.common.of 12 ui.common.results")).toBeInTheDocument();
        // 第一页 mtime 较高的是 6 条笔记和前 4 条附件
        expect(screen.getByText("paged-note-5")).toBeInTheDocument();
        expect(screen.getByText("paged-file-5.py")).toBeInTheDocument();

        // 翻到第 2 页显示剩余 2 条附件
        fireEvent.click(screen.getByRole("button", { name: "ui.common.next" }));
        expect(await screen.findByText("2 / 2")).toBeInTheDocument();
        expect(screen.getByText("paged-file-1.py")).toBeInTheDocument();
        expect(screen.getByText("paged-file-0.py")).toBeInTheDocument();

        // 按路径排序可刷新并重置/重排
        fireEvent.click(screen.getByRole("button", { name: "ui.note.sortByPath" }));
        await waitFor(() => {
            expect(mocks.handleFileList).toHaveBeenCalledWith(
                "AlphaVault",
                1,
                99999,
                false,
                "paged",
                "path",
                "desc",
                expect.any(Function)
            );
        });

        // 3. 限制类型为“仅看附件”时切换至 flat-file 且不再请求 handleNoteList
        mocks.handleNoteList.mockClear();
        fireEvent.click(screen.getByText("ui.file.file"));
        await waitFor(() => {
            expect(screen.getByTestId("current-view-mode")).toHaveTextContent("flat-file");
        });
        expect(mocks.handleNoteList).not.toHaveBeenCalled();
    });
});
