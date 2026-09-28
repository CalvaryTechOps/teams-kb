import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(kb)/actions", () => ({ toggleFavorite: vi.fn() }));

import { FavoriteButton } from "./favorite-button";

// Server-render contract: the first paint already shows the right state,
// and the state is exposed as aria-pressed with a label naming the action.
describe("FavoriteButton", () => {
  it("renders an outline star that offers to add", () => {
    const html = renderToStaticMarkup(
      <FavoriteButton guideId="g1" initialIsFavorite={false} />,
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Add to favorites"');
    expect(html).toMatch(/<svg[^>]*fill="none"/);
    expect(html).not.toContain("text-accent");
  });

  it("renders a filled star that offers to remove", () => {
    const html = renderToStaticMarkup(
      <FavoriteButton guideId="g1" initialIsFavorite={true} />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Remove from favorites"');
    expect(html).toMatch(/<svg[^>]*fill="currentColor"/);
    expect(html).toContain("text-accent");
  });

  it("never prints", () => {
    const html = renderToStaticMarkup(
      <FavoriteButton guideId="g1" initialIsFavorite={false} />,
    );
    expect(html).toContain("print:hidden");
  });
});
