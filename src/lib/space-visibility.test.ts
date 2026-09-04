import { describe, expect, it } from "vitest";
import { isSpaceShown } from "./space-visibility";

describe("isSpaceShown", () => {
  it("hides a department with nothing to read that the user is not in", () => {
    expect(isSpaceShown({ articles: 0, isMine: false }, false)).toBe(false);
  });

  it("shows a department with at least one readable article", () => {
    expect(isSpaceShown({ articles: 1, isMine: false }, false)).toBe(true);
  });

  it("always shows the user's own department, even when empty", () => {
    expect(isSpaceShown({ articles: 0, isMine: true }, false)).toBe(true);
  });

  it("shows everything when 'Show empty' is on", () => {
    expect(isSpaceShown({ articles: 0, isMine: false }, true)).toBe(true);
  });
});
