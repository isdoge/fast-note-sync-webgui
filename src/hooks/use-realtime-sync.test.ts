import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtimeStore } from "@/stores/realtime-store";

describe("useRealtimeSync", () => {
    beforeEach(() => {
        localStorage.clear();
        useRealtimeStore.getState().reset();
        vi.restoreAllMocks();
    });

    it("does not connect when logged out or when vault is null", () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        localStorage.setItem("token", "tok-1");

        const { rerender } = renderHook(
            ({ enabled, vault }: { enabled: boolean; vault: string | null }) =>
                useRealtimeSync({ enabled, vault }),
            { initialProps: { enabled: false, vault: "doge" as string | null } }
        );
        expect(fetchSpy).not.toHaveBeenCalled();

        rerender({ enabled: true, vault: null });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("aborts old stream and reconnects when vault changes, and cleans up on logout", () => {
        localStorage.setItem("token", "tok-1");
        const signals: AbortSignal[] = [];

        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
            if (init?.signal) {
                signals.push(init.signal);
            }
            return new Promise<Response>(() => {
                // Keep pending until aborted
            });
        });

        const { rerender, unmount } = renderHook(
            ({ enabled, vault }: { enabled: boolean; vault: string | null }) =>
                useRealtimeSync({ enabled, vault }),
            { initialProps: { enabled: true, vault: "vaultA" as string | null } }
        );

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/webgui/events?vault=vaultA");
        expect(signals[0].aborted).toBe(false);

        // Switch vault -> aborts vaultA and opens vaultB
        rerender({ enabled: true, vault: "vaultB" });
        expect(signals[0].aborted).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/webgui/events?vault=vaultB");
        expect(signals[1].aborted).toBe(false);

        // Logout -> aborts vaultB and resets store
        rerender({ enabled: false, vault: "vaultB" });
        expect(signals[1].aborted).toBe(true);
        expect(useRealtimeStore.getState().status).toBe("idle");

        unmount();
    });
});
