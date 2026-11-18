import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilePreview } from "./file-preview";
import type { File as FileDTO } from "@/lib/types/file";
import { MAX_TEXT_PREVIEW_BYTES } from "@/lib/utils/file-preview";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/components/context/theme-context", () => ({
    useTheme: () => ({
        resolvedTheme: "light",
    }),
}));

vi.mock("motion/react", () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@uiw/react-codemirror", () => ({
    default: ({ value, readOnly, editable }: { value: string; readOnly?: boolean; editable?: boolean }) => (
        <pre data-testid="codemirror-readonly" data-readonly={String(readOnly)} data-editable={String(editable)}>
            {value}
        </pre>
    ),
}));

function makeFile(path: string, size = 128): FileDTO {
    return {
        path,
        pathHash: "hash-1",
        contentHash: "chash-1",
        size,
        ctime: 1,
        mtime: 1,
        lastTime: 1,
    };
}

describe("FilePreview (#357)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("应拉取并只读展示 .py 代码文件内容", async () => {
        const code = "def greet(name):\n    return f'hi {name}'\n";
        const buffer = new TextEncoder().encode(code).buffer;
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ "content-length": String(buffer.byteLength) }),
            arrayBuffer: async () => buffer,
        });
        vi.stubGlobal("fetch", fetchMock);

        render(<FilePreview file={makeFile("scripts/app.py", buffer.byteLength)} url="/api/file?path=scripts/app.py" onClose={vi.fn()} />);

        const editor = await screen.findByTestId("codemirror-readonly");
        expect(editor).toHaveAttribute("data-readonly", "true");
        expect(editor).toHaveAttribute("data-editable", "false");
        expect(editor.textContent).toBe(code);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("文件超过 2MB 上限时不应拉取内容而应提示下载", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        render(
            <FilePreview
                file={makeFile("logs/huge.log", MAX_TEXT_PREVIEW_BYTES + 10)}
                url="/api/file?path=logs/huge.log"
                onClose={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("ui.file.textTooLarge")).toBeInTheDocument();
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("文本扩展名但实际包含二进制数据时退回下载提示", async () => {
        const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]).buffer;
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers(),
                arrayBuffer: async () => binary,
            })
        );

        render(<FilePreview file={makeFile("data/fake.txt", 7)} url="/api/file?path=data/fake.txt" onClose={vi.fn()} />);

        expect(await screen.findByText("ui.file.binaryPreviewFallback")).toBeInTheDocument();
    });

    it("不支持预览的二进制扩展名应显示降级提示", async () => {
        render(<FilePreview file={makeFile("archive/backup.zip", 1024)} url="/api/file?path=archive/backup.zip" onClose={vi.fn()} />);

        expect(await screen.findByText("ui.file.unsupportedPreview")).toBeInTheDocument();
    });
});
