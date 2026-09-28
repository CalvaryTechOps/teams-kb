import { describe, expect, it } from "vitest";
import { FAVORITES_PATH, favoriteLabel } from "./favorites";

describe("favoriteLabel", () => {
  it("describes the click, not the state", () => {
    expect(favoriteLabel(false)).toBe("Add to favorites");
    expect(favoriteLabel(true)).toBe("Remove from favorites");
  });
});

describe("FAVORITES_PATH", () => {
  it("is the page's route", () => {
    expect(FAVORITES_PATH).toBe("/favorites");
  });
});
