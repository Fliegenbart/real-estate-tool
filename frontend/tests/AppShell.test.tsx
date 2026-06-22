import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/AppShell";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/datenquellen"
}));

function cssRuleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] || "";
}

describe("AppShell", () => {
  it("renders a named main navigation with the active desk section", () => {
    render(
      <AppShell>
        <section>Page content starts here</section>
      </AppShell>
    );

    const navigation = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(within(navigation).getByRole("link", { name: /Datenquellen/i })).toHaveClass("active");
    expect(screen.getByText("Page content starts here")).toBeInTheDocument();
  });

  it("keeps the mobile navigation compact and horizontally scrollable", () => {
    const css = readFileSync(resolve(__dirname, "../src/app/globals.css"), "utf8");
    const tabletStart = css.lastIndexOf("@media (max-width: 1080px)");
    const mobileStart = css.lastIndexOf("@media (max-width: 720px)");
    const tabletCss = css.slice(tabletStart, mobileStart);
    const mobileCss = css.slice(mobileStart);

    expect(cssRuleBody(tabletCss, ".nav-list")).toContain("display: flex");
    expect(cssRuleBody(tabletCss, ".nav-list")).toContain("width: 100%");
    expect(cssRuleBody(tabletCss, ".nav-list")).toContain("min-width: 0");
    expect(cssRuleBody(tabletCss, ".nav-list")).toContain("max-width: 100%");
    expect(cssRuleBody(tabletCss, ".nav-list")).toContain("overflow-x: auto");
    expect(cssRuleBody(tabletCss, ".nav-item")).toContain("flex: 0 0 auto");
    expect(cssRuleBody(tabletCss, ".sidebar")).toContain("overflow-x: hidden");
    expect(cssRuleBody(tabletCss, ".sidebar-footer")).toContain("display: none");
    expect(cssRuleBody(mobileCss, ".topbar")).toContain("min-height: auto");
  });
});
