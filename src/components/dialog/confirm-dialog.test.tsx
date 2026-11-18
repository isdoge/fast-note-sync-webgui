import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialogProvider, useConfirmDialog } from "@/components/context/confirm-dialog-context";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function TestHarness({
  onConfirmAction,
  onBackgroundEscape,
}: {
  onConfirmAction?: (openNext: (msg: string, type?: string) => void) => void;
  onBackgroundEscape?: () => void;
}) {
  const { openConfirmDialog, isDialogOpen } = useConfirmDialog();
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (!onBackgroundEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBackgroundEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onBackgroundEscape]);

  return (
    <div>
      <span data-testid="dialog-state">{isDialogOpen ? "open" : "closed"}</span>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>
        bg-action-{clicks}
      </button>
      <button type="button" onClick={() => openConfirmDialog("保存成功", "success")}>
        open-success
      </button>
      <button type="button" onClick={() => openConfirmDialog("保存失败", "error")}>
        open-error
      </button>
      <button
        type="button"
        onClick={() =>
          openConfirmDialog(
            "确定继续？",
            "confirm",
            () => onConfirmAction?.(openConfirmDialog),
            <input aria-label="rename-input" defaultValue="alpha" />
          )
        }
      >
        open-confirm
      </button>
    </div>
  );
}

describe("ConfirmDialog & ConfirmDialogProvider", () => {
  it("closes informational alerts via close button, Escape, and overlay click without blocking background", async () => {
    const onBackgroundEscape = vi.fn();
    render(
      <ConfirmDialogProvider>
        <TestHarness onBackgroundEscape={onBackgroundEscape} />
      </ConfirmDialogProvider>
    );

    // 1. Close via button
    fireEvent.click(screen.getByText("open-success"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ui.common.close" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("bg-action-0"));
    expect(screen.getByText("bg-action-1")).toBeInTheDocument();

    // 2. Close via Escape without leaking to background form listener
    fireEvent.click(screen.getByText("open-error"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(onBackgroundEscape).not.toHaveBeenCalled();

    // 3. Close informational dialog via overlay click
    fireEvent.click(screen.getByText("open-success"));
    const overlay = document.querySelector(".fixed.inset-0.z-50");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("does not swallow follow-up alert opened inside confirm callback and ignores Enter inside inputs or cancel button", async () => {
    const confirmSpy = vi.fn((openNext: (msg: string, type?: string) => void) => {
      openNext("后续成功提示", "success");
    });

    render(
      <ConfirmDialogProvider>
        <TestHarness onConfirmAction={confirmSpy} />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("open-confirm"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Overlay click must NOT dismiss a confirm dialog
    const overlay = document.querySelector(".fixed.inset-0.z-50");
    fireEvent.click(overlay!);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Pressing Enter inside input or on Cancel button must NOT fire confirm
    const input = screen.getByLabelText("rename-input");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(confirmSpy).not.toHaveBeenCalled();

    const cancelBtn = screen.getByRole("button", { name: "ui.common.cancel" });
    fireEvent.keyDown(cancelBtn, { key: "Enter" });
    expect(confirmSpy).not.toHaveBeenCalled();

    // Clicking Confirm opens the follow-up success dialog without closing it
    fireEvent.click(screen.getByRole("button", { name: "ui.common.confirm" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("后续成功提示")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "ui.common.close" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "ui.common.close" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
