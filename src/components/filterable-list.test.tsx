import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FilterableCheckboxList } from "./filterable-list";

const groups = [
  { id: "a", name: "AV Team" },
  { id: "b", name: "Worship" },
  { id: "c", name: "Facilities" },
];

describe("FilterableCheckboxList", () => {
  it("posts every selected id through always-mounted hidden inputs", () => {
    const html = renderToStaticMarkup(
      <form>
        <FilterableCheckboxList
          items={groups}
          name="audienceGroupIds"
          defaultSelectedIds={["c", "a", "stale-id"]}
          noun="teams"
        />
      </form>,
    );
    const hidden = [
      ...html.matchAll(
        /type="hidden" name="audienceGroupIds" value="([^"]+)"/g,
      ),
    ].map((m) => m[1]);
    expect(hidden.sort()).toEqual(["a", "c"]);
    // Visible checkboxes carry no name, so the filter can never change the post.
    expect(html).not.toMatch(/type="checkbox"[^>]*name=/);
    expect(html).toContain("2 selected");
  });

  it("sorts checked rows to the top of the list", () => {
    const html = renderToStaticMarkup(
      <FilterableCheckboxList
        items={groups}
        name="ids"
        defaultSelectedIds={["c"]}
        noun="teams"
      />,
    );
    const labels = [
      ...html.matchAll(/<span class="truncate">([^<]+)<\/span>/g),
    ].map((m) => m[1]);
    expect(labels).toEqual(["Facilities", "AV Team", "Worship"]);
  });

  it("renders a single column when columns={1}", () => {
    const one = renderToStaticMarkup(
      <FilterableCheckboxList
        items={groups}
        name="ids"
        defaultSelectedIds={[]}
        noun="teams"
        columns={1}
      />,
    );
    const two = renderToStaticMarkup(
      <FilterableCheckboxList
        items={groups}
        name="ids"
        defaultSelectedIds={[]}
        noun="teams"
      />,
    );
    expect(one).not.toContain("sm:grid-cols-2");
    expect(two).toContain("sm:grid-cols-2");
  });
});
