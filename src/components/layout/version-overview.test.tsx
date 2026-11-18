import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersionOverview } from "./version-overview";

const mocks = vi.hoisted(() => ({
  versionInfo: {
    version: "3.8.0",
    gitTag: "2000.01.01.release",
    buildTime: "2000-01-01T00:00:00+0800",
    versionIsNew: true,
    versionNewName: "3.9.0",
    versionNewLink: "https://github.com/isdoge/fast-note-sync-service/releases/tag/3.9.0",
    versionNewChangelog: "",
    versionNewChangelogContent: "",
    versionHistory: null,
  },
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

vi.mock("@/components/api-handle/use-version", () => ({
  useVersion: () => ({
    versionInfo: mocks.versionInfo,
    isLoading: false,
  }),
}));

vi.mock("@/components/api-handle/use-update-check", () => ({
  useUpdateCheck: () => ({
    checkUpdate: vi.fn(),
    isChecking: false,
    updateResult: null,
  }),
}));

vi.mock("@/components/context/theme-context", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
  }),
}));

vi.mock("@/components/context/confirm-dialog-context", () => ({
  useConfirmDialog: () => ({
    openConfirmDialog: vi.fn(),
  }),
}));

describe("VersionOverview version links", () => {
  it("links current version to its own release tag while keeping new version link on update banner", () => {
    render(<VersionOverview showUpgrade={false} />);

    const currentVersionLink = screen.getByRole("link", { name: "3.8.0" });
    expect(currentVersionLink).toHaveAttribute(
      "href",
      "https://github.com/isdoge/fast-note-sync-service/releases/tag/3.8.0"
    );

    const viewReleaseLink = screen.getByRole("link", { name: /ui\.system\.viewRelease/ });
    expect(viewReleaseLink).toHaveAttribute(
      "href",
      "https://github.com/isdoge/fast-note-sync-service/releases/tag/3.9.0"
    );
  });
});
