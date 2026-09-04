import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TagPicker } from "./tag-picker";

const allTags = [
  { id: "1", name: "MFA", slug: "mfa", guideCount: 3 },
  { id: "2", name: "two-step", slug: "two-step", guideCount: 2 },
];

describe("TagPicker", () => {
  it("posts the selected names through one hidden comma-separated field", () => {
    const html = renderToStaticMarkup(
      <form>
        <TagPicker
          allTags={allTags}
          defaultSelected={["MFA", "mfa", "two-step", ""]}
        />
      </form>,
    );
    expect(html).toMatch(/type="hidden" name="tags" value="MFA, two-step"/);
    // The visible text box carries no name, so half-typed text never posts.
    expect(html).not.toMatch(/role="combobox"[^>]*name=/);
    expect(html).toContain('aria-label="Remove tag MFA"');
    expect(html).toContain('aria-label="Remove tag two-step"');
    // Closed until focused: no listbox in the initial markup.
    expect(html).not.toContain('role="listbox"');
  });

  it("in filter mode posts one slug per tag and never offers Create", () => {
    const html = renderToStaticMarkup(
      <form action="/search">
        <TagPicker
          allTags={allTags}
          defaultSelected={["mfa", "Two Step"]}
          name="tag"
          allowCreate={false}
          repeatedField
          fieldValue="slug"
          submitFormOnChange
          hint={null}
        />
      </form>,
    );
    const values = [
      ...html.matchAll(/type="hidden" name="tag" value="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(values).toEqual(["mfa", "two-step"]);
    expect(html).not.toContain("Pick an existing tag");
  });

  it("disables the input at the tag cap", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `tag ${i}`);
    const html = renderToStaticMarkup(
      <TagPicker allTags={allTags} defaultSelected={twelve} />,
    );
    expect(html).toMatch(/role="combobox"[^>]*disabled=""/);
    expect(html).toContain("Up to 12 tags.");
  });
});
