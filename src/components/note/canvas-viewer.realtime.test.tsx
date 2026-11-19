import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasViewer } from "./canvas-viewer";
import { hashCode } from "@/lib/utils/hash";
import { useRealtimeStore } from "@/stores/realtime-store";
import type { CanvasNode } from "@/lib/types/canvas";

const mocks = vi.hoisted(() => ({
    getRawFileUrl: (vault: string, path: string) => `/api/file?vault=${vault}&path=${path}`,
}));

vi.mock("@/components/api-handle/file-handle", () => ({
    useFileHandle: () => ({
        getRawFileUrl: mocks.getRawFileUrl,
    }),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./canvas-renderer", () => ({
    CanvasRenderer: ({ nodes }: { nodes: CanvasNode[] }) => (
        <div data-testid="mock-canvas-renderer" data-nodes={JSON.stringify(nodes)} />
    ),
}));

describe("CanvasViewer realtime integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRealtimeStore.getState().reset();
        vi.stubGlobal(
            "ResizeObserver",
            class MockResizeObserver {
                observe() {}
                disconnect() {}
            }
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        useRealtimeStore.getState().reset();
    });

    it("reloads open canvas A when FileSyncUpdate for A is followed synchronously by NoteSyncModify for B", async () => {
        let canvasPayload = JSON.stringify({
            nodes: [{ id: "n1", type: "text", text: "v1", x: 0, y: 0, width: 100, height: 50 }],
            edges: [],
        });

        const fetchMock = vi.fn().mockImplementation(async () => ({
            ok: true,
            status: 200,
            text: async () => canvasPayload,
        }));
        vi.stubGlobal("fetch", fetchMock);

        render(
            <CanvasViewer
                vault="doge"
                note={{ path: "boards/demo.canvas", pathHash: hashCode("boards/demo.canvas") }}
                onBack={vi.fn()}
            />
        );

        const renderer = await screen.findByTestId("mock-canvas-renderer");
        expect(renderer.getAttribute("data-nodes")).toContain('"text":"v1"');

        canvasPayload = JSON.stringify({
            nodes: [{ id: "n1", type: "text", text: "v2", x: 0, y: 0, width: 100, height: 50 }],
            edges: [],
        });

        act(() => {
            const store = useRealtimeStore.getState();
            store.ingestFrame(
                {
                    type: "change",
                    data: {
                        v: 1,
                        vault: "doge",
                        action: "FileSyncUpdate",
                        path: "boards/demo.canvas",
                        pathHash: hashCode("boards/demo.canvas"),
                        oldPath: "",
                        oldPathHash: "",
                        contentHash: "c-v2",
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
            expect(screen.getByTestId("mock-canvas-renderer").getAttribute("data-nodes")).toContain('"text":"v2"');
        });
    });
});
