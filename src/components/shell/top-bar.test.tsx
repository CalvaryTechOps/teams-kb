import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { SidebarShell } from "./sidebar-shell";
import { TopBar } from "./top-bar";

// The bar is screen chrome: breadcrumbs, actions, theme toggle and avatar
// all go with it when a page is printed (plans/print-guide-chrome.md).
describe("TopBar", () => {
  it("renders every part on screen and hides the whole bar in print", () => {
    const html = renderToStaticMarkup(
      <SidebarShell initialCollapsed={false} sidebar={<aside />}>
        <TopBar
          crumbs={[
            { label: "Teams KB", href: "/" },
            { label: "Fourth General guide" },
          ]}
          userName="Casey Adams"
          actions={<button type="button">Edit guide</button>}
        />
      </SidebarShell>,
    );
    const bar = html.match(/<div class="sticky top-0[^"]*"/)?.[0] ?? "";
    expect(bar).toContain("print:hidden");
    expect(html).toContain("Teams KB");
    expect(html).toContain("Fourth General guide");
    expect(html).toContain("Edit guide");
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain("CA");
  });
});
