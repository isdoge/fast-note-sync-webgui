import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenManager } from "./token-manager";
import type { TokenInfo } from "@/components/api-handle/token-handle";

const mocks = vi.hoisted(() => ({
  tokens: [] as TokenInfo[],
  handleListTokens: vi.fn(),
  handleRevokeToken: vi.fn(),
  handleCreateToken: vi.fn(),
  handleUpdateToken: vi.fn(),
  handleFetchTokenLogs: vi.fn(),
  handleRotateToken: vi.fn(),
  handleCleanExpiredTokens: vi.fn(),
  handleVaultList: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/api-handle/token-handle", () => ({
  useTokenHandle: () => ({
    tokens: mocks.tokens,
    isLoading: false,
    currentTokenID: null,
    handleListTokens: mocks.handleListTokens,
    handleRevokeToken: mocks.handleRevokeToken,
    handleCreateToken: mocks.handleCreateToken,
    handleUpdateToken: mocks.handleUpdateToken,
    handleFetchTokenLogs: mocks.handleFetchTokenLogs,
    handleRotateToken: mocks.handleRotateToken,
    handleCleanExpiredTokens: mocks.handleCleanExpiredTokens,
  }),
}));

vi.mock("@/components/api-handle/vault-handle", () => ({
  useVaultHandle: () => ({
    handleVaultList: mocks.handleVaultList,
  }),
}));

vi.mock("@/components/common/Toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TokenManager new function dimensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tokens = [];
    mocks.handleListTokens.mockResolvedValue(undefined);
    mocks.handleVaultList.mockImplementation(async (cb?: (list: Array<{ id: string; vault: string }>) => void) => {
      cb?.([{ id: "1", vault: "MainVault" }]);
    });
    mocks.handleCreateToken.mockResolvedValue("new-token-secret");
    mocks.handleUpdateToken.mockResolvedValue(true);
  });

  it("renders and submits the four new function permissions while preserving wildcard and request shape", async () => {
    const { container } = render(<TokenManager />);

    const addButtons = container.querySelectorAll("button");
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("ui.token.funcVaultR")).toBeInTheDocument();
      expect(screen.getByText("ui.token.funcVaultW")).toBeInTheDocument();
      expect(screen.getByText("ui.token.funcNotePurge")).toBeInTheDocument();
      expect(screen.getByText("ui.token.funcFilePurge")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("ui.token.funcVaultR"));
    fireEvent.click(screen.getByLabelText("ui.token.funcVaultW"));
    fireEvent.click(screen.getByLabelText("ui.token.funcNotePurge"));
    fireEvent.click(screen.getByLabelText("ui.token.funcFilePurge"));

    fireEvent.click(screen.getByRole("button", { name: "ui.common.confirm" }));

    await waitFor(() => {
      expect(mocks.handleCreateToken).toHaveBeenCalledWith(
        "Other",
        "",
        30,
        "",
        "",
        "rest,ws",
        "*",
        "vault_w,note_purge,file_purge",
        ""
      );
    });

    fireEvent.click(screen.getAllByRole("button", { name: "ui.common.close" })[0]);

    fireEvent.click(addButtons[addButtons.length - 1]);
    await waitFor(() => {
      expect(document.getElementById("f-all")).toBeChecked();
    });
    fireEvent.click(screen.getByRole("button", { name: "ui.common.confirm" }));

    await waitFor(() => {
      expect(mocks.handleCreateToken).toHaveBeenLastCalledWith(
        "Other",
        "",
        30,
        "",
        "",
        "rest,ws",
        "*",
        "*",
        ""
      );
    });
  });

  it("renders permission badges and restores checked states when editing an existing token", async () => {
    mocks.tokens = [
      {
        id: 7,
        scope: "p:rest,mcp c:* f:vault_r,vault_w,note_purge,file_purge",
        vaults: "MainVault",
        clientType: "CLI-Agent",
        boundIp: "",
        userAgent: "",
        createdAt: "2026-11-19T00:00:00Z",
        expiredAt: "2026-12-19T00:00:00Z",
        issueType: 2,
        isWsOnline: false,
      },
    ];

    render(<TokenManager />);

    expect(screen.getByText("ui.token.permVaultR")).toBeInTheDocument();
    expect(screen.getByText("ui.token.permVaultW")).toBeInTheDocument();
    expect(screen.getByText("ui.token.permNotePurge")).toBeInTheDocument();
    expect(screen.getByText("ui.token.permFilePurge")).toBeInTheDocument();

    const menuTrigger = document.querySelector("#token-card-7 button");
    expect(menuTrigger).not.toBeNull();
    fireEvent.pointerDown(menuTrigger!);
    fireEvent.click(menuTrigger!);

    const editItem = await screen.findByText("ui.common.edit");
    fireEvent.click(editItem);

    await waitFor(() => {
      expect(screen.getByLabelText("ui.token.funcVaultR")).toBeChecked();
      expect(screen.getByLabelText("ui.token.funcVaultW")).toBeChecked();
      expect(screen.getByLabelText("ui.token.funcNotePurge")).toBeChecked();
      expect(screen.getByLabelText("ui.token.funcFilePurge")).toBeChecked();
    });

    fireEvent.click(screen.getByLabelText("ui.token.funcNotePurge"));
    fireEvent.click(screen.getByRole("button", { name: "ui.common.confirm" }));

    await waitFor(() => {
      expect(mocks.handleUpdateToken).toHaveBeenCalledWith(
        7,
        "CLI-Agent",
        "",
        expect.any(Number),
        "",
        "",
        "rest,mcp",
        "*",
        "vault_r,vault_w,file_purge",
        "MainVault"
      );
    });
  });

  it("treats vault_r and vault_w as mutually exclusive when toggling", async () => {
    const { container } = render(<TokenManager />);

    const addButtons = container.querySelectorAll("button");
    fireEvent.click(addButtons[addButtons.length - 1]);

    const vaultR = await screen.findByLabelText("ui.token.funcVaultR");
    const vaultW = screen.getByLabelText("ui.token.funcVaultW");

    fireEvent.click(vaultW);
    expect(vaultW).toBeChecked();
    expect(vaultR).not.toBeChecked();

    // Downgrading to read-only must deselect vault_w
    fireEvent.click(vaultR);
    expect(vaultR).toBeChecked();
    expect(vaultW).not.toBeChecked();

    // Upgrading back to write must deselect vault_r
    fireEvent.click(vaultW);
    expect(vaultW).toBeChecked();
    expect(vaultR).not.toBeChecked();
  });
});
