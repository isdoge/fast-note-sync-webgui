import { describe, expect, it } from "vitest";
import { isScrollAtBottom, resolveActiveHeadingId } from "./toc-active";

describe("toc-active (#477)", () => {
    it("内容未溢出不可滚动时 isScrollAtBottom 应返回 false", () => {
        expect(isScrollAtBottom({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 })).toBe(false);
        expect(isScrollAtBottom({ scrollTop: 0, clientHeight: 600, scrollHeight: 500 })).toBe(false);
    });

    it("滚动到距离底部阈值内时 isScrollAtBottom 应返回 true，否则返回 false", () => {
        expect(isScrollAtBottom({ scrollTop: 300, clientHeight: 600, scrollHeight: 1200 })).toBe(false);
        expect(isScrollAtBottom({ scrollTop: 598, clientHeight: 600, scrollHeight: 1200 })).toBe(true);
        expect(isScrollAtBottom({ scrollTop: 600, clientHeight: 600, scrollHeight: 1200 })).toBe(true);
    });

    it("触底时应优先高亮最后一个标题，即使可见集合仍包含较前标题", () => {
        const headings = [{ id: "h1" }, { id: "h2" }, { id: "h3" }];
        expect(
            resolveActiveHeadingId({
                headings,
                visibleIds: new Set(["h1", "h2"]),
                isAtBottom: true,
            })
        ).toBe("h3");

        expect(
            resolveActiveHeadingId({
                headings,
                visibleIds: new Set(),
                isAtBottom: true,
            })
        ).toBe("h3");
    });

    it("非触底时按文档顺序高亮第一个可见标题，无可见标题时返回 null", () => {
        const headings = [{ id: "h1" }, { id: "h2" }, { id: "h3" }];
        expect(
            resolveActiveHeadingId({
                headings,
                visibleIds: new Set(["h3", "h2"]),
                isAtBottom: false,
            })
        ).toBe("h2");

        expect(
            resolveActiveHeadingId({
                headings,
                visibleIds: new Set(),
                isAtBottom: false,
            })
        ).toBeNull();
    });
});
