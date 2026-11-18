import { describe, expect, it } from "vitest";
import {
    decodeTextPreviewBuffer,
    getFileCategory,
    getFileExtension,
    isTextPreviewCategory,
    MAX_TEXT_PREVIEW_BYTES,
} from "./file-preview";

describe("file-preview utils (#357)", () => {
    it("正确识别代码、文本及媒体文件分类", () => {
        expect(getFileExtension("scripts/main.py")).toBe("py");
        expect(getFileExtension(".gitignore")).toBe("");

        for (const ext of ["py", "go", "rs", "java", "c", "cpp", "h", "rb", "php", "toml", "ini", "sh", "json", "yaml", "yml"]) {
            const cat = getFileCategory(`demo.${ext}`);
            expect(cat).toBe("code");
            expect(isTextPreviewCategory(cat)).toBe(true);
        }

        for (const ext of ["txt", "log", "csv"]) {
            const cat = getFileCategory(`demo.${ext}`);
            expect(cat).toBe("text");
            expect(isTextPreviewCategory(cat)).toBe(true);
        }

        expect(getFileCategory("photo.png")).toBe("image");
        expect(getFileCategory("doc.pdf")).toBe("pdf");
        expect(getFileCategory("song.mp3")).toBe("audio");
        expect(getFileCategory("clip.mp4")).toBe("video");
        expect(getFileCategory("archive.zip")).toBe("other");
        expect(isTextPreviewCategory("other")).toBe(false);
    });

    it("正确解码 UTF-8 代码文本并保留缩进", () => {
        const source = "def hello():\n    print('你好')\n";
        const buf = new TextEncoder().encode(source).buffer;
        expect(decodeTextPreviewBuffer(buf)).toEqual({ ok: true, text: source });
    });

    it("超过大小上限时拒绝解码", () => {
        const big = new Uint8Array(MAX_TEXT_PREVIEW_BYTES + 1);
        expect(decodeTextPreviewBuffer(big.buffer)).toEqual({ ok: false, reason: "too_large" });
    });

    it("包含空字节或大量替换字符时识别为二进制", () => {
        const withNull = new Uint8Array([0x61, 0x00, 0x62]);
        expect(decodeTextPreviewBuffer(withNull.buffer)).toEqual({ ok: false, reason: "binary" });

        const invalidUtf8 = new Uint8Array(40).fill(0xff);
        expect(decodeTextPreviewBuffer(invalidUtf8.buffer)).toEqual({ ok: false, reason: "binary" });
    });
});
