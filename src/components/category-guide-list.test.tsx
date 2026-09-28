import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryGuideList, type CategoryGuideRow } from "./category-guide-list";

const row = (over: Partial<CategoryGuideRow>): CategoryGuideRow => ({
  id: "g1",
  href: "/spaces/ops/guides/g1",
  title: "Projector setup",
  status: "published",
  audience: "department",
  tags: [],
  createdLabel: "Jan 2, 2026",
  createdIso: "2026-01-02T00:00:00.000Z",
  updatedLabel: "Mar 4, 2026",
  updatedIso: "2026-03-04T00:00:00.000Z",
  updatedBy: "Sam Example",
  ...over,
});

describe("CategoryGuideList", () => {
  it("renders the search box with its label and one row per guide", () => {
    const html = renderToStaticMarkup(
      <CategoryGuideList
        guides={[
          row({ id: "a", title: "Projector setup" }),
          row({ id: "b", title: "Sound check", status: "draft", audience: "all_staff" }),
          row({ id: "c", title: "Stream", audience: "groups" }),
        ]}
      />,
    );
    expect(html).toContain('placeholder="Search this category"');
    expect(html).toContain('aria-label="Search this category"');
    expect(html.match(/href="\/spaces\/ops\/guides\/g1"/g)).toHaveLength(3);
    expect(html).toContain("Created <time");
    expect(html).toContain("by Sam Example");
    expect(html).toContain(">Draft<");
    expect(html).toContain('aria-label="Shared with this team"');
    expect(html).toContain('aria-label="Shared with all staff"');
    expect(html).toContain('aria-label="Shared with other teams"');
  });
});

describe("CategoryGuideList on the favorites page", () => {
  it("takes a placeholder, shows the department cell and an unstar per row", () => {
    const html = renderToStaticMarkup(
      <CategoryGuideList
        placeholder="Search your favorites"
        showDepartment
        onUnfavorite={() => {}}
        guides={[
          row({ id: "a", title: "Projector setup", spaceName: "Facilities", categoryName: "Rooms" }),
          row({ id: "b", title: "Sound check", spaceName: "Worship", categoryName: null }),
        ]}
      />,
    );
    expect(html).toContain('placeholder="Search your favorites"');
    expect(html).toContain('aria-label="Search your favorites"');
    expect(html).toContain(">Facilities<");
    expect(html).toContain(">Rooms<");
    expect(html).toContain(">Worship<");
    expect(html).toContain(">General<");
    expect(html.match(/aria-label="Remove from favorites: /g)).toHaveLength(2);
    expect(html).toContain('aria-label="Remove from favorites: Sound check"');
  });

  it("hides the department cell and the star by default", () => {
    const html = renderToStaticMarkup(
      <CategoryGuideList
        guides={[row({ id: "a", spaceName: "Facilities", categoryName: "Rooms" })]}
      />,
    );
    expect(html).not.toContain(">Facilities<");
    expect(html).not.toContain("Remove from favorites");
  });
});
