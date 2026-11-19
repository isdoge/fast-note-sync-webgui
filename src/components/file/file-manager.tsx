import { useVaultHandle } from "@/components/api-handle/vault-handle";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { VaultType } from "@/lib/types/vault";
import { Database } from "lucide-react";

import { toast } from "@/components/common/Toast";
import { CanvasViewer } from "@/components/note/canvas-viewer";
import { isFolderAncestor, replaceFolderPrefix } from "@/lib/realtime/conflict";
import { hashCode } from "@/lib/utils/hash";
import { subscribeChangeEvents } from "@/stores/realtime-store";
import { FileList } from "./file-list";


interface FileManagerProps {
    vault: string;
    onVaultChange?: (vault: string) => void;
    onNavigateToVaults?: () => void;
    isRecycle?: boolean;
}

/**
 * 附件管理器组件
 * 管理附件列表状态和仓库切换
 */
export function FileManager({
    vault,
    onVaultChange,
    onNavigateToVaults,
    isRecycle = false
}: FileManagerProps) {
    const { t } = useTranslation();
    const [vaults, setVaults] = useState<VaultType[]>([]);
    const vaultsLoaded = useRef(false);

    // Lifted state for pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => {
        const saved = localStorage.getItem("filePageSize");
        return saved ? parseInt(saved, 10) : 10;
    });
    const [searchKeyword, setSearchKeyword] = useState("");

    // Lifted state for folder navigation (reset on vault change)
    const [currentPath, setCurrentPath] = useState("");
    const [currentPathHash, setCurrentPathHash] = useState("");
    const [pathHashMap, setPathHashMap] = useState<Record<string, string>>({});

    // Canvas viewer state
    const [canvasFile, setCanvasFile] = useState<{ path: string; pathHash: string } | null>(null);
    const canvasFileRef = useRef(canvasFile);
    useEffect(() => {
        canvasFileRef.current = canvasFile;
    }, [canvasFile]);

    useEffect(() => {
        if (isRecycle || !canvasFile) return;

        return subscribeChangeEvents((event) => {
            const current = canvasFileRef.current;
            if (!current) return;
            if (event.vault && event.vault !== vault) return;

            if (event.action === "FileSyncDelete" || event.action === "NoteSyncDelete") {
                const matched = event.pathHash
                    ? event.pathHash === current.pathHash
                    : event.path === current.path;
                if (matched) {
                    canvasFileRef.current = null;
                    toast.warning(t("ui.realtime.remoteDeletedToast", { defaultValue: "The open file was deleted on another device." }));
                    setCanvasFile(null);
                }
                return;
            }

            if (event.action === "FolderSyncDelete") {
                if (isFolderAncestor(event.path, current.path)) {
                    canvasFileRef.current = null;
                    toast.warning(t("ui.realtime.remoteDeletedToast", { defaultValue: "The open file was deleted on another device." }));
                    setCanvasFile(null);
                }
                return;
            }

            if (event.action === "FileSyncRename" || event.action === "NoteSyncRename") {
                const matched = event.oldPathHash
                    ? event.oldPathHash === current.pathHash
                    : event.oldPath === current.path;
                if (matched && event.path) {
                    const nextPath = event.path;
                    const nextPathHash = event.pathHash || hashCode(nextPath);
                    const nextCanvas = { path: nextPath, pathHash: nextPathHash };
                    canvasFileRef.current = nextCanvas;
                    setCanvasFile(nextCanvas);
                }
                return;
            }

            if (event.action === "FolderSyncRename" && event.path) {
                const nextPath = replaceFolderPrefix(current.path, event.oldPath, event.path);
                if (nextPath) {
                    const nextPathHash = hashCode(nextPath);
                    const nextCanvas = { path: nextPath, pathHash: nextPathHash };
                    canvasFileRef.current = nextCanvas;
                    setCanvasFile(nextCanvas);
                }
            }
        });
    }, [isRecycle, canvasFile, vault, t]);

    useEffect(() => {
        localStorage.setItem("filePageSize", pageSize.toString());
    }, [pageSize]);

    const { handleVaultList } = useVaultHandle();

    useEffect(() => {
        let isMounted = true;

        const loadVaults = async () => {
            try {
                await handleVaultList((data) => {
                    if (!isMounted) return;
                    setVaults(data);
                });
            } catch (error: unknown) {
                if (!isMounted) return;
                toast.error(error instanceof Error ? error.message : String(error));
                setVaults([]);
            } finally {
                if (isMounted) {
                    vaultsLoaded.current = true;
                }
            }
        };

        void loadVaults();

        return () => {
            isMounted = false;
        };
    }, [handleVaultList]);

    // Reset page and folder navigation state when vault changes
    useEffect(() => {
        setPage(1);
        setCurrentPath("");
        setCurrentPathHash("");
        setPathHashMap({});
        setCanvasFile(null);
    }, [vault]);

    const handleCanvasOpen = useCallback((file: { path: string; pathHash: string }) => {
        setCanvasFile(file);
    }, []);

    const handleCanvasBack = useCallback(() => {
        setCanvasFile(null);
    }, []);

    // 检查是否有仓库（只在加载完成后显示空状态）
    if (vaultsLoaded.current && vaults.length === 0) {
        return (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center">
                <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t("ui.file.noVaults")}
                </h3>
                <p className="text-muted-foreground mb-6 text-center">
                    {t("ui.file.createVaultFirst")}
                </p>
                <Button
                    onClick={() => {
                        if (onNavigateToVaults) {
                            onNavigateToVaults();
                        }
                    }}
                    className="rounded-xl"
                >
                    {t("ui.note.goToVaultManagement")}
                </Button>
            </div>
        );
    }

    // Canvas viewer mode
    if (canvasFile) {
        return (
            <CanvasViewer
                vault={vault}
                note={canvasFile}
                onBack={handleCanvasBack}
                isRecycle={isRecycle}
            />
        );
    }

    return (
        <FileList
            vault={vault}
            vaults={vaults}
            onVaultChange={onVaultChange}
            isRecycle={isRecycle}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            currentPathHash={currentPathHash}
            setCurrentPathHash={setCurrentPathHash}
            pathHashMap={pathHashMap}
            setPathHashMap={setPathHashMap}
            onCanvasOpen={handleCanvasOpen}
        />
    );
}
