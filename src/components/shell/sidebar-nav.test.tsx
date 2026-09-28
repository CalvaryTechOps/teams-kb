import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/spaces/ops" }));
vi.mock("@/app/(kb)/actions", () => ({ setShowEmptyDepartments: vi.fn() }));

import { SidebarNav, type SidebarSpace } from "./sidebar-nav";

const ops: SidebarSpace = {
  slug: "ops",
  name: "Operations",
  articleCount: 3,
  isMine: true,
  categories: [{ slug: "rooms", name: "Rooms" }],
};

function render(favoriteCount: number) {
  return renderToStaticMarkup(
    <SidebarNav spaces={[ops]} initialShowEmpty={false} favoriteCount={favoriteCount} />,
  );
}

describe("SidebarNav favorites row", () => {
  it("sits between the Show empty switch and the first department", () => {
    const html = render(2);
    const switchAt = html.indexOf("Show empty");
    const favAt = html.indexOf('href="/favorites"');
    const deptAt = html.indexOf('href="/spaces/ops"');
    expect(switchAt).toBeGreaterThan(-1);
    expect(favAt).toBeGreaterThan(switchAt);
    expect(deptAt).toBeGreaterThan(favAt);
    expect(html).toContain(">2<span");
    expect(html).toContain(" favorites</span>");
  });

  it("still shows at zero, with the muted pill", () => {
    const html = render(0);
    expect(html).toContain('href="/favorites"');
    expect(html).toContain(">0<span");
    expect(html).toContain(" favorites</span>");
  });
});
