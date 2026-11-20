import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Shield, Loader2, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "@/components/common/Toast";
import { addCacheBuster } from "@/lib/utils/cache-buster";
import { buildApiHeaders } from "@/lib/utils/api-headers";
import env from "@/env.ts";

interface AdminSetupDialogProps {
  onDone: (adminUid?: number) => void;
  retryDelayMs?: number;
}

const DEFAULT_RETRY_DELAY_MS = 800;
const MAX_VERIFY_RETRIES = 2;

function isTransientFetchError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AdminSetupDialog({ onDone, retryDelayMs = DEFAULT_RETRY_DELAY_MS }: AdminSetupDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const verifyAdminUidAfterReload = async (apiUrl: string, token: string, expectedUid: number): Promise<boolean> => {
    for (let attempt = 0; attempt < MAX_VERIFY_RETRIES; attempt++) {
      await sleep(retryDelayMs);
      try {
        const res = await fetch(addCacheBuster(`${apiUrl}/api/admin/config`), {
          headers: buildApiHeaders({ token, includeDomain: false, includeContentType: false }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.code > 0 && data.data?.adminUid === expectedUid) {
          return true;
        }
      } catch {
        // 服务端仍在热重载，继续等待下一次重试
      }
    }
    return false;
  };

  const handleSetAdmin = async () => {
    setLoading(true);
    const token = localStorage.getItem("token") || "";
    const currentUidStr = localStorage.getItem("uid");

    if (!currentUidStr) {
      toast.error(t("ui.auth.sessionExpired"));
      setLoading(false);
      return;
    }

    const currentUid = parseInt(currentUidStr);
    const apiUrl = env.API_URL.endsWith("/") ? env.API_URL.slice(0, -1) : env.API_URL;

    try {
      // Directly POST the update
      const saveRes = await fetch(addCacheBuster(`${apiUrl}/api/admin/config`), {
        method: "POST",
        headers: buildApiHeaders({ token }),
        body: JSON.stringify({ adminUid: currentUid }),
      });

      if (!saveRes.ok && saveRes.status >= 500) {
        if (await verifyAdminUidAfterReload(apiUrl, token, currentUid)) {
          toast.success(t("ui.settings.settingAdminSuccess"));
          onDone(currentUid);
          return;
        }
        toast.error(t("ui.settings.saveFailed"));
        return;
      }

      const saveResult = await saveRes.json();

      if (saveResult.code > 0) {
        toast.success(t("ui.settings.settingAdminSuccess"));
        onDone(currentUid);
      } else {
        toast.error(saveResult.message || t("ui.settings.saveFailed"));
      }
    } catch (error) {
      if (isTransientFetchError(error) && await verifyAdminUidAfterReload(apiUrl, token, currentUid)) {
        toast.success(t("ui.settings.settingAdminSuccess"));
        onDone(currentUid);
        return;
      }
      console.error("Admin setup failed:", error);
      toast.error(t("ui.settings.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="rounded-2xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t("ui.settings.adminSetupTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2 text-base">
            {t("ui.settings.adminSetupDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="pt-4">
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleSetAdmin();
            }}
            disabled={loading}
            className="rounded-xl w-full sm:w-auto gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            {t("ui.settings.setCurrentAsAdmin")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
