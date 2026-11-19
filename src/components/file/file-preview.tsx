import { X, ExternalLink, Download, FileText, FileCode, Paperclip, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRef, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { useTheme } from "@/components/context/theme-context";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { File } from "@/lib/types/file";
import {
    decodeTextPreviewBuffer,
    getFileCategory,
    getFileExtension,
    isTextPreviewCategory,
    MAX_TEXT_PREVIEW_BYTES,
} from "@/lib/utils/file-preview";


interface FilePreviewProps {
    file: File;
    url: string;
    onClose: () => void;
}

type TextPreviewStatus = "idle" | "loading" | "ready" | "too_large" | "binary" | "error";

function isApiErrorJsonPayload(text: string): boolean {
    try {
        const parsed = JSON.parse(text) as { status?: unknown; code?: unknown } | null;
        return Boolean(
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            parsed.status === false &&
            typeof parsed.code === "number"
        );
    } catch {
        return false;
    }
}

async function readResponseUpTo(response: Response, maxBytes: number): Promise<ArrayBuffer | null> {
    if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;

                totalBytes += value.byteLength;
                if (totalBytes > maxBytes) {
                    await reader.cancel().catch(() => undefined);
                    return null;
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock?.();
        }

        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return merged.buffer;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
        return null;
    }
    return buffer;
}

export function FilePreview({ file, url, onClose }: FilePreviewProps) {
    const { t } = useTranslation();
    const { resolvedTheme } = useTheme();
    const category = getFileCategory(file.path);
    const isImage = category === "image";
    const isAudio = category === "audio";
    const isVideo = category === "video";
    const isPdf = category === "pdf";
    const isCode = category === "code";
    const isText = category === "text";
    const isTextPreview = isTextPreviewCategory(category);

    const fileName = file.path.split('/').pop() || file.path;
    const fileExt = getFileExtension(file.path);
    const mediaRef = useRef<HTMLMediaElement>(null);
    const [isLoading, setIsLoading] = useState(isImage || isAudio || isVideo || isTextPreview);
    const [textContent, setTextContent] = useState("");
    const [textStatus, setTextStatus] = useState<TextPreviewStatus>(isTextPreview ? "loading" : "idle");

    // 当 URL 或文件类型变化时重置加载状态
    useEffect(() => {
        if (!isTextPreview) {
            setTextContent("");
            setTextStatus("idle");
            setIsLoading(isImage || isAudio || isVideo);
            return;
        }

        if (file.size > MAX_TEXT_PREVIEW_BYTES) {
            setTextContent("");
            setTextStatus("too_large");
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);
        setTextStatus("loading");
        setTextContent("");

        const loadTextPreview = async () => {
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
                const isJsonResponse = contentType.includes("application/json");
                const hasAttachmentHeaders = Boolean(
                    response.headers?.get?.("etag") ||
                    response.headers?.get?.("last-modified") ||
                    response.headers?.get?.("content-disposition") ||
                    response.headers?.get?.("cache-control")?.includes("max-age=")
                );

                if (isJsonResponse && !hasAttachmentHeaders && fileExt !== "json") {
                    if (!controller.signal.aborted) {
                        setTextStatus("error");
                        setIsLoading(false);
                    }
                    return;
                }

                const contentLengthHeader = response.headers?.get?.("content-length");
                if (contentLengthHeader) {
                    const contentLength = Number(contentLengthHeader);
                    if (Number.isFinite(contentLength) && contentLength > MAX_TEXT_PREVIEW_BYTES) {
                        if (!controller.signal.aborted) {
                            setTextStatus("too_large");
                            setIsLoading(false);
                        }
                        return;
                    }
                }

                const buffer = await readResponseUpTo(response, MAX_TEXT_PREVIEW_BYTES);
                if (controller.signal.aborted) return;

                if (buffer === null) {
                    setTextStatus("too_large");
                    setIsLoading(false);
                    return;
                }

                const decoded = decodeTextPreviewBuffer(buffer, MAX_TEXT_PREVIEW_BYTES);
                if (controller.signal.aborted) return;

                if (decoded.ok) {
                    if (isJsonResponse && !hasAttachmentHeaders && isApiErrorJsonPayload(decoded.text)) {
                        setTextStatus("error");
                        return;
                    }
                    setTextContent(decoded.text);
                    setTextStatus("ready");
                } else {
                    setTextStatus(decoded.reason);
                }
            } catch (error) {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                    return;
                }
                setTextStatus("error");
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        void loadTextPreview();

        return () => {
            controller.abort();
        };
    }, [url, file.size, fileExt, isImage, isAudio, isVideo, isTextPreview]);

    // 加载记忆的音量
    useEffect(() => {
        const savedVolume = localStorage.getItem('preview-volume');
        if (savedVolume && mediaRef.current) {
            mediaRef.current.volume = parseFloat(savedVolume);
        }
    }, [url]);

    // 处理音量变化并保存
    const handleVolumeChange = (e: React.SyntheticEvent<HTMLMediaElement>) => {
        localStorage.setItem('preview-volume', e.currentTarget.volume.toString());
    };

    const handleLoaded = () => {
        setIsLoading(false);
    };

    const previewHeaderLabel = isImage
        ? t("ui.file.imagePreview")
        : isAudio
            ? t("ui.file.audioPreview")
            : isVideo
                ? t("ui.file.videoPreview")
                : isPdf
                    ? t("ui.file.pdfPreview")
                    : isCode
                        ? t("ui.file.codePreview")
                        : isText
                            ? t("ui.file.textPreview")
                            : t("ui.file.fileDetail");

    const fallbackMessage = textStatus === "too_large"
        ? t("ui.file.textTooLarge")
        : textStatus === "binary"
            ? t("ui.file.binaryPreviewFallback")
            : textStatus === "error"
                ? t("ui.file.previewLoadError")
                : t("ui.file.unsupportedPreview");

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.9 }}
                className={`fixed bottom-6 right-6 z-100 ${isTextPreview ? "w-[90vw] sm:w-[600px] max-w-[90vw]" : "w-[320px] sm:w-100"} bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]`}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {previewHeaderLabel}
                        </span>
                        <h3 className="text-sm font-semibold truncate pr-2" title={fileName}>
                            {fileName}
                        </h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl"
                            aria-label={t("ui.file.openInNewWindow")}
                            onClick={() => window.open(url, '_blank')}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("ui.common.close")}
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* 内容区域 */}
                <div className="relative p-4 flex items-center justify-center bg-black/5 min-h-50 overflow-hidden text-center">
                    {/* 加载动画过度层 */}
                    <AnimatePresence>
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/80 backdrop-blur-sm pointer-events-none"
                            >
                                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {isImage && (
                        <img
                            key={url}
                            src={url}
                            alt={fileName}
                            className={`max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                            onLoad={handleLoaded}
                            onError={handleLoaded}
                        />
                    )}
                    {isAudio && (
                        <div key={url} className="w-full py-8">
                            <div className="mb-4 flex justify-center">
                                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                    </svg>
                                </div>
                            </div>
                            <audio
                                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                                src={url}
                                controls
                                autoPlay
                                className="w-full"
                                onVolumeChange={handleVolumeChange}
                                onLoadedMetadata={handleLoaded}
                                onCanPlay={handleLoaded}
                                onError={handleLoaded}
                            />
                        </div>
                    )}
                    {isVideo && (
                        <video
                            key={url}
                            ref={mediaRef as React.RefObject<HTMLVideoElement>}
                            src={url}
                            controls
                            autoPlay
                            className={`max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                            onVolumeChange={handleVolumeChange}
                            onLoadedMetadata={handleLoaded}
                            onCanPlay={handleLoaded}
                            onError={handleLoaded}
                        />
                    )}
                    {isTextPreview && textStatus === "ready" && (
                        <div className="w-full max-h-[60vh] overflow-auto rounded-lg border border-border bg-background text-left font-mono [&_.cm-editor]:font-mono [&_.cm-scroller]:overflow-auto">
                            <CodeMirror
                                value={textContent}
                                readOnly={true}
                                editable={false}
                                theme={resolvedTheme === "dark" ? "dark" : "light"}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: false,
                                    highlightActiveLine: false,
                                    highlightActiveLineGutter: false,
                                }}
                                className="text-xs font-mono"
                            />
                        </div>
                    )}
                    {!isImage && !isAudio && !isVideo && !(isTextPreview && (textStatus === "ready" || textStatus === "loading")) && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center text-primary/60 border border-primary/10">
                                {isPdf || isText ? <FileText className="w-10 h-10" /> : isCode ? <FileCode className="w-10 h-10" /> : <Paperclip className="w-10 h-10" />}
                            </div>
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">{fallbackMessage}</p>
                                <Button
                                    variant="link"
                                    className="text-primary mt-1 h-auto p-0"
                                    onClick={() => window.open(url, '_blank')}
                                >
                                    {t("ui.file.openInNewWindow")}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div className="p-3 border-t border-border bg-muted/30 flex justify-end">
                    <Button
                        variant="default"
                        size="sm"
                        className="rounded-xl gap-2 text-xs"
                        onClick={() => window.open(url, '_blank')}
                    >
                        <Download className="h-3.5 w-3.5" />
                        {t("ui.file.browserDownload")}
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

