import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSetupDialog } from "./admin-setup-dialog";

const toastMocks = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-i18next")>();
    return {
        ...actual,
        useTranslation: () => ({
            t: (key: string) => key,
        }),
    };
});

vi.mock("@/components/common/Toast", () => ({
    toast: toastMocks,
}));

describe("AdminSetupDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem("token", "test-token");
        localStorage.setItem("uid", "1");
    });

    it("passes currentUid to onDone after successful save", async () => {
        const onDone = vi.fn();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ code: 1, message: "ok" }),
            })
        );

        render(<AdminSetupDialog onDone={onDone} retryDelayMs={10} />);
        fireEvent.click(screen.getByRole("button", { name: "ui.settings.setCurrentAsAdmin" }));

        await waitFor(() => {
            expect(onDone).toHaveBeenCalledWith(1);
        });
        expect(toastMocks.success).toHaveBeenCalledWith("ui.settings.settingAdminSuccess");
        expect(toastMocks.error).not.toHaveBeenCalled();
    });

    it("recovers silently when POST throws transient Failed to fetch during server hot-reload", async () => {
        const onDone = vi.fn();
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ code: 1, data: { adminUid: 1 } }),
            });
        vi.stubGlobal("fetch", fetchMock);

        render(<AdminSetupDialog onDone={onDone} retryDelayMs={10} />);
        fireEvent.click(screen.getByRole("button", { name: "ui.settings.setCurrentAsAdmin" }));

        await waitFor(() => {
            expect(onDone).toHaveBeenCalledWith(1);
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(toastMocks.success).toHaveBeenCalledWith("ui.settings.settingAdminSuccess");
        expect(toastMocks.error).not.toHaveBeenCalled();
    });
});
