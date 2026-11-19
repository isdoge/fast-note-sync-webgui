import { useEffect } from "react";
import env from "@/env.ts";
import { createSseClient } from "@/lib/realtime/sse-client";
import { useRealtimeStore } from "@/stores/realtime-store";

export interface UseRealtimeSyncOptions {
    enabled: boolean;
    vault: string | null;
}

export function buildRealtimeEventsUrl(apiUrl: string, vault: string): string {
    const normalizedBase = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
    return `${normalizedBase}/api/webgui/events?vault=${encodeURIComponent(vault)}`;
}

export function useRealtimeSync({ enabled, vault }: UseRealtimeSyncOptions) {
    useEffect(() => {
        const store = useRealtimeStore.getState();

        if (!enabled || !vault) {
            store.reset();
            return;
        }

        const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
        if (!token) {
            store.reset();
            return;
        }

        store.setActiveVault(vault);

        const url = buildRealtimeEventsUrl(env.API_URL, vault);
        const client = createSseClient({
            url,
            token,
            onStatusChange: (status) => {
                useRealtimeStore.getState().setStatus(status);
            },
            onFrame: (frame) => {
                useRealtimeStore.getState().ingestFrame(frame, vault);
            },
        });

        client.start();

        return () => {
            client.stop();
            useRealtimeStore.getState().setStatus("idle");
        };
    }, [enabled, vault]);
}
