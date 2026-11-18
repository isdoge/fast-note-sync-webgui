export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "ogg", "m4a"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mkv", "avi", "mov"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

const CODE_EXTENSIONS = new Set([
    "js", "mjs", "cjs", "ts", "mts", "cts", "jsx", "tsx",
    "py", "pyw", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
    "go", "rs", "java", "kt", "kts", "scala",
    "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx",
    "cs", "rb", "php", "pl", "lua", "r", "swift", "dart", "sql",
    "css", "scss", "sass", "less", "html", "htm", "xml",
    "vue", "svelte", "astro",
    "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "properties",
    "diff", "patch", "canvas",
]);

const PLAIN_TEXT_EXTENSIONS = new Set([
    "txt", "text", "log", "csv", "tsv", "md", "markdown", "rst",
]);

export type FileCategory = "image" | "pdf" | "audio" | "video" | "code" | "text" | "other";

export function getFileExtension(path: string): string {
    const fileName = path.split("/").pop() || path;
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0) return "";
    return fileName.slice(dotIndex + 1).toLowerCase();
}

export function getFileCategory(path: string): FileCategory {
    const ext = getFileExtension(path);
    if (!ext) return "other";
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (PDF_EXTENSIONS.has(ext)) return "pdf";
    if (AUDIO_EXTENSIONS.has(ext)) return "audio";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    if (CODE_EXTENSIONS.has(ext)) return "code";
    if (PLAIN_TEXT_EXTENSIONS.has(ext)) return "text";
    return "other";
}

export function isTextPreviewCategory(category: FileCategory): boolean {
    return category === "code" || category === "text";
}

export type DecodeTextPreviewResult =
    | { ok: true; text: string }
    | { ok: false; reason: "too_large" | "binary" };

/**
 * 将二进制缓冲区按 UTF-8 解码为文本，超过大小限制或包含明显二进制数据时拒绝内联预览。
 */
export function decodeTextPreviewBuffer(
    buffer: ArrayBuffer,
    maxBytes: number = MAX_TEXT_PREVIEW_BYTES
): DecodeTextPreviewResult {
    if (buffer.byteLength > maxBytes) {
        return { ok: false, reason: "too_large" };
    }

    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) {
            return { ok: false, reason: "binary" };
        }
    }

    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.length === 0) {
        return { ok: true, text: "" };
    }

    let replacementCount = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 0xfffd) {
            replacementCount++;
        }
    }

    if (replacementCount >= 16 || replacementCount / text.length > 0.05) {
        return { ok: false, reason: "binary" };
    }

    return { ok: true, text };
}
