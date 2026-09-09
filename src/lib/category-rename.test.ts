import { describe, expect, it } from "vitest";
import { renameConflict, renameConflictMessage } from "./category-rename";
import { slugify } from "./slug";

const others = [
  { slug: "policies", name: "Policies" },
  // A category renamed earlier with its address kept: name and slug differ.
  { slug: "sound-equipment", name: "AV Gear" },
];

describe("renameConflict", () => {
  it("reports a duplicate when the slug is another category's slug", () => {
    expect(renameConflict(slugify("Policies"), others)).toBe("duplicate");
    expect(renameConflict(slugify("Sound Equipment"), others)).toBe("duplicate");
  });

  it("reports a duplicate when the slug matches another category's slugified name", () => {
    expect(renameConflict(slugify("AV Gear"), others)).toBe("duplicate");
    expect(renameConflict(slugify("av gear"), others)).toBe("duplicate");
    expect(renameConflict(slugify("AV-Gear?"), others)).toBe("duplicate");
  });

  it("refuses the reserved General slug regardless of the other categories", () => {
    expect(renameConflict(slugify("General"), others)).toBe("reserved");
    expect(renameConflict(slugify("  general "), [])).toBe("reserved");
  });

  it("allows a name nobody else holds", () => {
    expect(renameConflict(slugify("Streaming"), others)).toBeNull();
    expect(renameConflict(slugify("Policies"), [])).toBeNull();
  });

  it("treats a name as free when only the category being renamed holds it", () => {
    // The caller passes every *other* category, so a rename that keeps or
    // merely re-cases the current name sees no conflict.
    const withoutSelf = others.filter((c) => c.slug !== "policies");
    expect(renameConflict(slugify("Policies"), withoutSelf)).toBeNull();
    expect(renameConflict(slugify("policies"), withoutSelf)).toBeNull();
  });
});

describe("renameConflictMessage", () => {
  it("maps known codes to a sentence and unknown codes to null", () => {
    expect(renameConflictMessage("duplicate")).toMatch(/already has that name/);
    expect(renameConflictMessage("reserved")).toMatch(/reserved/);
    expect(renameConflictMessage("")).toBeNull();
    expect(renameConflictMessage("nope")).toBeNull();
  });
});
