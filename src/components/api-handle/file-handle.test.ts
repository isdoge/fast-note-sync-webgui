import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFileHandle } from "./file-handle";

describe("useFileHandle.getRawFileUrl", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("token", "tok-123");
    });

    it("appends version query parameter when contentHash or mtime is provided", () => {
        const { result } = renderHook(() => useFileHandle());

        const urlWithHash = result.current.getRawFileUrl("doge", "docs/pic.png", "h-pic", "ch-abc");
        expect(urlWithHash).toContain("v=ch-abc");

        const urlWithMtime = result.current.getRawFileUrl("doge", "docs/pic.png", "h-pic", 1700000123);
        expect(urlWithMtime).toContain("v=1700000123");

        const urlWithoutVersion = result.current.getRawFileUrl("doge", "docs/pic.png", "h-pic");
        expect(urlWithoutVersion).not.toContain("&v=");
    });
});
