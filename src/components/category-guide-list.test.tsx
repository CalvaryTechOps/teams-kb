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
