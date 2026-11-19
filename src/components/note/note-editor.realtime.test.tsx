import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "./note-editor";
import { hashCode } from "@/lib/utils/hash";
import { useRealtimeStore } from "@/stores/realtime-store";
import type { Note, NoteDetail } from "@/lib/types/note";

const mocks = vi.hoisted(() => ({
    handleGetNote: vi.fn(),
    handleSaveNote: vi.fn(),
    handleRenameNote: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
    }),
}));

vi.mock("@/components/api-handle/note-handle", () => ({
    useNoteHandle: () => ({
        handleGetNote: mocks.handleGetNote,
        handleSaveNote: mocks.handleSaveNote,
        handleRenameNote: mocks.handleRenameNote,
    }),
}));

vi.mock("@/components/share/share-modal", () => ({
    ShareModal: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./table-of-contents", () => ({
    TableOfContents: () => null,
}));

vi.mock("./markdown-editor", async () => {
    const React = await import("react");
    return {
        MarkdownEditor: React.forwardRef(
            (
                props: { value: string; onChange?: (v: string) => void },
                ref: React.Ref<{ getValue: () => string; setValue: (v: string) => void }>
            ) => {
                const [val, setVal] = React.useState(props.value);
                React.useEffect(() => {
                    setVal(props.value);
                }, [props.value]);
                React.useImperativeHandle(ref, () => ({
                    getValue: () => val,
                    setValue: (next: string) => setVal(next),
                }));
                return (
                    <textarea
                        data-testid="mock-markdown-editor"
                        value={val}
                        onChange={(e) => {
                            setVal(e.target.value);
                            props.onChange?.(e.target.value);
                        }}
                    />
                );
            }
        ),
    };
});

function makeNote(path = "docs/demo.md"): Note {
    return {
        id: 1,
        action: "",
        path,
        pathHash: hashCode(path),
        ctime: 1000,
        mtime: 1000,
        updatedTimestamp: 1000,
        updatedAt: "",
        createdAt: "",
        version: 1,
    };
}

function makeDetail(content: string, path = "docs/demo.md"): NoteDetail {
    return {
        ...makeNote(path),
        content,
        contentHash: hashCode(content),
        fileLinks: {},
    };
}

describe("NoteEditor realtime integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRealtimeStore.getState().reset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reloads automatically on remote modify when there are no local unsaved changes", async () => {
        let serverContent = "initial content";
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(serverContent));
                onSettled?.();
            }
        );

        render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        const editor = await screen.findByTestId("mock-markdown-editor");
        expect(editor).toHaveValue("initial content");

        serverContent = "remote updated content";
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode(serverContent),
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
            expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("remote updated content");
        });
    });

    it("does not overwrite dirty edits and offers Reload / Keep current conflict banner", async () => {
        let serverContent = "initial content";
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(serverContent));
                onSettled?.();
            }
        );

        render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        const editor = await screen.findByTestId("mock-markdown-editor");
        fireEvent.change(editor, { target: { value: "local unsaved edit" } });
        expect(editor).toHaveValue("local unsaved edit");

        serverContent = "remote content";
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode(serverContent),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2000,
                    },
                },
                "doge"
            );
        });

        expect(await screen.findByRole("status")).toBeInTheDocument();
        expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("local unsaved edit");

        // Clicking Keep current preserves local edits and hides banner
        fireEvent.click(screen.getByRole("button", { name: "Keep current" }));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("local unsaved edit");

        // Another remote change arrives -> banner appears again -> click Reload
        serverContent = "remote content v2";
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode(serverContent),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 3000,
                    },
                },
                "doge"
            );
        });

        expect(await screen.findByRole("status")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Reload" }));

        await waitFor(() => {
            expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("remote content v2");
        });
        expect(mocks.handleSaveNote).not.toHaveBeenCalled();
    });

    it("ignores self-write echo after autosave", async () => {
        vi.useFakeTimers();
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail("initial"));
                onSettled?.();
            }
        );
        mocks.handleSaveNote.mockImplementation(
            (_v: string, _p: string, _c: string, _o: unknown, onSuccess: () => void) => {
                onSuccess();
            }
        );

        render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        await vi.advanceTimersByTimeAsync(0);
        const editor = screen.getByTestId("mock-markdown-editor");
        fireEvent.change(editor, { target: { value: "saved by webgui" } });

        await vi.advanceTimersByTimeAsync(1000);
        expect(mocks.handleSaveNote).toHaveBeenCalledTimes(1);

        const initialGetCount = mocks.handleGetNote.mock.calls.length;

        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode("saved by webgui"),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: Date.now(),
                    },
                },
                "doge"
            );
        });

        expect(mocks.handleGetNote.mock.calls.length).toBe(initialGetCount);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("blocks saving and warns user when open note is deleted remotely, and updates path on remote rename", async () => {
        vi.useFakeTimers();
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail("initial"));
                onSettled?.();
            }
        );

        const onRemoteRename = vi.fn();
        const { unmount } = render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
                onRemoteRename={onRemoteRename}
            />
        );

        await vi.advanceTimersByTimeAsync(0);

        // Remote rename updates path
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncRename",
                        path: "docs/renamed.md",
                        pathHash: hashCode("docs/renamed.md"),
                        oldPath: "docs/demo.md",
                        oldPathHash: hashCode("docs/demo.md"),
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

        expect(onRemoteRename).toHaveBeenCalledWith("docs/renamed.md", hashCode("docs/renamed.md"));

        // User starts typing, then remote deletes the renamed note
        fireEvent.change(screen.getByTestId("mock-markdown-editor"), { target: { value: "unsaved" } });
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncDelete",
                        path: "docs/renamed.md",
                        pathHash: hashCode("docs/renamed.md"),
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

        expect(screen.getByRole("alert")).toBeInTheDocument();

        await vi.advanceTimersByTimeAsync(2000);
        unmount();
        expect(mocks.handleSaveNote).not.toHaveBeenCalled();
    });

    it("pauses pending autosave while remote conflict banner is active until user keeps current", async () => {
        vi.useFakeTimers();
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail("initial"));
                onSettled?.();
            }
        );

        render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        await vi.advanceTimersByTimeAsync(0);
        const editor = screen.getByTestId("mock-markdown-editor");
        fireEvent.change(editor, { target: { value: "local unsaved edit" } });

        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode("remote edit"),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2000,
                    },
                },
                "doge"
            );
        });

        expect(screen.getByRole("status")).toBeInTheDocument();
        await vi.advanceTimersByTimeAsync(2000);
        expect(mocks.handleSaveNote).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Keep current" }));
        await vi.advanceTimersByTimeAsync(1100);
        expect(mocks.handleSaveNote).toHaveBeenCalledTimes(1);
    });

    it("reloads open note A when A modify is followed synchronously by B modify in the same batch", async () => {
        let serverContent = "initial content";
        mocks.handleGetNote.mockImplementation(
            (_v: string, _p: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(serverContent));
                onSettled?.();
            }
        );

        render(
            <NoteEditor
                vault="doge"
                note={makeNote()}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        const editor = await screen.findByTestId("mock-markdown-editor");
        expect(editor).toHaveValue("initial content");

        serverContent = "remote updated A";
        act(() => {
            const store = useRealtimeStore.getState();
            store.ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/demo.md",
                        pathHash: hashCode("docs/demo.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode(serverContent),
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
                        pathHash: hashCode("docs/other.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode("other content"),
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
            expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("remote updated A");
        });
    });

    it("follows rename A -> A2 and reloads A2 when both arrive synchronously in the same batch", async () => {
        const contentByPath: Record<string, string> = {
            "docs/demo.md": "initial content",
            "docs/renamed.md": "initial content",
        };
        mocks.handleGetNote.mockImplementation(
            (_v: string, path: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(contentByPath[path] ?? "", path));
                onSettled?.();
            }
        );

        const onRemoteRename = vi.fn();
        render(
            <NoteEditor
                vault="doge"
                note={makeNote("docs/demo.md")}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
                onRemoteRename={onRemoteRename}
            />
        );

        const editor = await screen.findByTestId("mock-markdown-editor");
        expect(editor).toHaveValue("initial content");

        contentByPath["docs/renamed.md"] = "updated content on A2";
        act(() => {
            const store = useRealtimeStore.getState();
            store.ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncRename",
                        path: "docs/renamed.md",
                        pathHash: hashCode("docs/renamed.md"),
                        oldPath: "docs/demo.md",
                        oldPathHash: hashCode("docs/demo.md"),
                        contentHash: "",
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
                        path: "docs/renamed.md",
                        pathHash: hashCode("docs/renamed.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode("updated content on A2"),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 2001,
                    },
                },
                "doge"
            );
        });

        expect(onRemoteRename).toHaveBeenCalledWith("docs/renamed.md", hashCode("docs/renamed.md"));
        await waitFor(() => {
            expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("updated content on A2");
        });
        expect(mocks.handleGetNote).toHaveBeenLastCalledWith(
            "doge",
            "docs/renamed.md",
            hashCode("docs/renamed.md"),
            false,
            expect.any(Function),
            expect.any(Function)
        );
    });

    it("keeps renamed path across refresh, autosave, and remote events after saveTitle", async () => {
        vi.useFakeTimers();
        const contentByPath: Record<string, string> = {
            "docs/demo.md": "initial content",
            "docs/renamed-local.md": "initial content",
        };
        mocks.handleGetNote.mockImplementation(
            (_v: string, path: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(contentByPath[path] ?? "", path));
                onSettled?.();
            }
        );
        mocks.handleRenameNote.mockImplementation(
            (_params: unknown, onSuccess: () => void) => {
                onSuccess();
            }
        );
        mocks.handleSaveNote.mockImplementation(
            (_v: string, path: string, content: string, _o: unknown, onSuccess: () => void) => {
                contentByPath[path] = content;
                onSuccess();
            }
        );

        const React = await import("react");
        const onRemoteRename = vi.fn();
        const onSaveSuccess = vi.fn();
        function RenameHarness() {
            const [currentNote, setCurrentNote] = React.useState<Note>(() => makeNote("docs/demo.md"));
            return (
                <NoteEditor
                    vault="doge"
                    note={currentNote}
                    onBack={vi.fn()}
                    onSaveSuccess={onSaveSuccess}
                    onRemoteRename={(newPath, newPathHash) => {
                        onRemoteRename(newPath, newPathHash);
                        setCurrentNote(prev => ({ ...prev, path: newPath, pathHash: newPathHash }));
                    }}
                />
            );
        }
        render(<RenameHarness />);

        await vi.advanceTimersByTimeAsync(0);
        expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("initial content");
        expect(mocks.handleGetNote).toHaveBeenCalledTimes(1);

        // Rename title in web UI: demo -> renamed-local
        fireEvent.click(screen.getByText("demo"));
        const titleInput = screen.getByDisplayValue("demo");
        fireEvent.change(titleInput, { target: { value: "renamed-local" } });
        fireEvent.keyDown(titleInput, { key: "Enter" });

        expect(mocks.handleRenameNote).toHaveBeenCalledWith(
            expect.objectContaining({
                vault: "doge",
                oldPath: "docs/demo.md",
                path: "docs/renamed-local.md",
            }),
            expect.any(Function)
        );
        expect(onSaveSuccess).toHaveBeenCalledWith("docs/renamed-local.md", hashCode("docs/renamed-local.md"));
        expect(onRemoteRename).toHaveBeenCalledWith("docs/renamed-local.md", hashCode("docs/renamed-local.md"));
        // Updating note prop via onRemoteRename must not trigger a spurious reload
        expect(mocks.handleGetNote).toHaveBeenCalledTimes(1);

        // Click Refresh button -> must fetch the new path, not the old path
        fireEvent.click(screen.getByRole("button", { name: "ui.common.refresh" }));
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.handleGetNote).toHaveBeenLastCalledWith(
            "doge",
            "docs/renamed-local.md",
            hashCode("docs/renamed-local.md"),
            false,
            expect.any(Function),
            expect.any(Function)
        );

        // Edit and wait for autosave -> must save to the new path
        fireEvent.change(screen.getByTestId("mock-markdown-editor"), { target: { value: "edited after rename" } });
        await vi.advanceTimersByTimeAsync(1100);

        expect(mocks.handleSaveNote).toHaveBeenLastCalledWith(
            "doge",
            "docs/renamed-local.md",
            "edited after rename",
            expect.objectContaining({ pathHash: hashCode("docs/renamed-local.md") }),
            expect.any(Function),
            expect.any(Function),
            true
        );

        // Remote modify on the new path -> must reload when clean
        contentByPath["docs/renamed-local.md"] = "remote after rename";
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "NoteSyncModify",
                        path: "docs/renamed-local.md",
                        pathHash: hashCode("docs/renamed-local.md"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: hashCode("remote after rename"),
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 5000,
                    },
                },
                "doge"
            );
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("remote after rename");
    });

    it("reloads restored content and cancels pending autosave when note.version increments after history restore", async () => {
        vi.useFakeTimers();
        let serverContent = "current content";
        mocks.handleGetNote.mockImplementation(
            (_v: string, path: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail(serverContent, path));
                onSettled?.();
            }
        );

        const initialNote = makeNote("docs/demo.md");
        const { rerender } = render(
            <NoteEditor
                vault="doge"
                note={initialNote}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        await vi.advanceTimersByTimeAsync(0);
        const editor = screen.getByTestId("mock-markdown-editor");
        expect(editor).toHaveValue("current content");

        // Local unsaved edit starts autosave debounce timer
        fireEvent.change(editor, { target: { value: "unsaved edit before restore" } });

        // Simulate NoteManager.handleHistoryRestoreSuccess incrementing note.version
        serverContent = "restored historical content";
        rerender(
            <NoteEditor
                vault="doge"
                note={{ ...initialNote, version: (initialNote.version || 0) + 1 }}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
            />
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(screen.getByTestId("mock-markdown-editor")).toHaveValue("restored historical content");

        // Pending autosave must have been cancelled so restored version is not overwritten
        await vi.advanceTimersByTimeAsync(2000);
        expect(mocks.handleSaveNote).not.toHaveBeenCalled();
    });

    it("handles FolderSyncRename and FolderSyncDelete with segment-safe ancestor matching", async () => {
        vi.useFakeTimers();
        mocks.handleGetNote.mockImplementation(
            (_v: string, path: string, _ph: string | undefined, _r: boolean, cb: (d: NoteDetail) => void, onSettled?: () => void) => {
                cb(makeDetail("initial", path));
                onSettled?.();
            }
        );

        const onRemoteRename = vi.fn();
        render(
            <NoteEditor
                vault="doge"
                note={makeNote("a/b/c.md")}
                onBack={vi.fn()}
                onSaveSuccess={vi.fn()}
                onRemoteRename={onRemoteRename}
            />
        );

        await vi.advanceTimersByTimeAsync(0);

        // Non-ancestor folder a/bc must be ignored
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncDelete",
                        path: "a/bc",
                        pathHash: hashCode("a/bc"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "",
                        ctime: 0,
                        mtime: 0,
                        updatedTimestamp: 0,
                        ts: 1000,
                    },
                },
                "doge"
            );
        });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();

        // Ancestor folder rename a/b -> x/y updates open note path to x/y/c.md
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncRename",
                        path: "x/y",
                        pathHash: hashCode("x/y"),
                        oldPath: "a/b",
                        oldPathHash: hashCode("a/b"),
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
        expect(onRemoteRename).toHaveBeenCalledWith("x/y/c.md", hashCode("x/y/c.md"));

        // Local unsaved edit, then ancestor folder x/y deleted -> stops autosave and shows alert
        fireEvent.change(screen.getByTestId("mock-markdown-editor"), { target: { value: "unsaved edit" } });
        act(() => {
            useRealtimeStore.getState().ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FolderSyncDelete",
                        path: "x/y",
                        pathHash: hashCode("x/y"),
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
        expect(screen.getByRole("alert")).toBeInTheDocument();

        await vi.advanceTimersByTimeAsync(2000);
        expect(mocks.handleSaveNote).not.toHaveBeenCalled();
    });
});
