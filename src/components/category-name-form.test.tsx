import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryNameForm } from "./category-name-form";

const noop = () => {};

describe("CategoryNameForm", () => {
  it("hides the address choice when the name's slug matches the current slug", () => {
    const html = renderToStaticMarkup(
      <CategoryNameForm
        action={noop}
        name="Policies"
        slug="policies"
        spaceSlug="ops"
        cancelHref="/spaces/ops/categories/policies"
      />,
    );
    expect(html).toContain('name="name"');
    expect(html).toContain('value="Policies"');
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('type="hidden" name="address" value="keep"');
    // Nothing changed yet, so Save is disabled and Cancel points home.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
    expect(html).toContain('href="/spaces/ops/categories/policies"');
  });

  it("offers keep (default) or change when the slug would differ", () => {
    const html = renderToStaticMarkup(
      <CategoryNameForm
        action={noop}
        name="AV Gear"
        slug="sound-equipment"
        spaceSlug="ops"
        cancelHref="/spaces/ops/categories/sound-equipment"
      />,
    );
    expect(html).toContain("Web address");
    // Attribute order is React's, not ours: pull each radio tag out and
    // check its attributes independently.
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    const keep = radios.find((r) => r.includes('value="keep"'));
    const change = radios.find((r) => r.includes('value="change"'));
    expect(keep).toContain('name="address"');
    expect(keep).toContain('checked=""');
    expect(change).toContain('name="address"');
    expect(change).not.toContain("checked");
    expect(html).toContain("/spaces/ops/categories/sound-equipment</code>");
    expect(html).toContain("/spaces/ops/categories/av-gear</code>");
    expect(html).toContain("Category not found");
    expect(html).not.toContain('type="hidden" name="address"');
  });
});
