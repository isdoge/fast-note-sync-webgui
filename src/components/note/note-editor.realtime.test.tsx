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
});
