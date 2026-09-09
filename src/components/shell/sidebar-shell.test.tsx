import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { SidebarClose, SidebarShell, SidebarToggle } from "./sidebar-shell";

// Server-render contract: the first paint must already reflect the cookie
// (no sidebar sliding away after hydration), the drawer starts closed, and
// nothing is made inert before the viewport is known.
function render(initialCollapsed: boolean) {
  return renderToStaticMarkup(
    <SidebarShell
      initialCollapsed={initialCollapsed}
      sidebar={
        <aside>
          <SidebarClose />
        </aside>
      }
    >
      <header>
        <SidebarToggle />
      </header>
    </SidebarShell>,
  );
}

const wrapperClass = (html: string) =>
  html.match(/<div id="app-sidebar"[^>]*class="([^"]*)"/)?.[1] ?? "";

describe("SidebarShell", () => {
  it("renders the column shown by default, drawer closed, no scrim", () => {
    const html = render(false);
    const cls = wrapperClass(html);
    expect(cls).toContain("md:w-[268px]");
    expect(cls).toContain("-translate-x-full");
    expect(html).toContain("md:translate-x-0");
    expect(html).not.toContain("md:-translate-x-full");
    expect(html).not.toContain("bg-sidebar/60");
    expect(html).not.toContain("inert");
  });

  it("paints the collapsed column straight from the cookie", () => {
    const html = render(true);
    const cls = wrapperClass(html);
    expect(cls).toContain("md:w-0");
    expect(cls).not.toContain("md:w-[268px]");
    expect(html).toContain("md:-translate-x-full");
    expect(html).not.toContain("inert");
  });
});

describe("SidebarToggle", () => {
  it("is hidden on wide screens while the sidebar is shown", () => {
    const html = render(false);
    const btn = html.match(/<button[^>]*aria-controls="app-sidebar"[^>]*>/)?.[0];
    expect(btn).toBeDefined();
    expect(btn).toContain("md:hidden");
    expect(btn).toContain('aria-label="Open navigation"');
  });

  it("appears on wide screens once the sidebar is collapsed", () => {
    const html = render(true);
    const btn = html.match(/<button[^>]*aria-controls="app-sidebar"[^>]*>/)?.[0];
    expect(btn).toBeDefined();
    expect(btn).not.toContain("md:hidden");
  });
});

describe("SidebarClose", () => {
  it("renders at every width with an X below md and a panel glyph above", () => {
    const html = render(false);
    const btn = html.match(
      /<button[^>]*aria-label="Close navigation"[^>]*>[\s\S]*?<\/button>/,
    )?.[0];
    expect(btn).toBeDefined();
    expect(btn).not.toMatch(/<button[^>]*class="[^"]*md:hidden/);
    expect(btn).toMatch(/<svg[^>]*class="md:hidden"/);
    expect(btn).toMatch(/<svg[^>]*class="hidden md:block"/);
    expect(btn).toContain("Ctrl+\\");
  });
});
