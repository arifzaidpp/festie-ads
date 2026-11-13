import { describe, expect, it } from "vitest";
import { VALID_COMBOS, checkDimensions, isValidCombo, unitFor, usesDisplaySeconds } from "./placements";

describe("combinations", () => {
  it("has exactly the five sellable pairs and never video in the poster footer", () => {
    expect(VALID_COMBOS).toHaveLength(5);
    expect(isValidCombo("POSTER_FOOTER", "VIDEO")).toBe(false);
    expect(isValidCombo("POSTER_FOOTER", "IMAGE")).toBe(true);
    expect(isValidCombo("SCREEN_FOOTER", "VIDEO")).toBe(true);
    expect(isValidCombo("SCREEN_FULLSCREEN", "VIDEO")).toBe(true);
  });

  it("maps each pair to its billing unit", () => {
    expect(unitFor("POSTER_FOOTER", "IMAGE")).toBe("PER_DOWNLOAD");
    expect(unitFor("SCREEN_FOOTER", "IMAGE")).toBe("PER_HOUR_DISPLAYED");
    expect(unitFor("SCREEN_FULLSCREEN", "IMAGE")).toBe("PER_HOUR_DISPLAYED");
    expect(unitFor("SCREEN_FOOTER", "VIDEO")).toBe("PER_HOUR_WATCHED");
    expect(unitFor("SCREEN_FULLSCREEN", "VIDEO")).toBe("PER_HOUR_WATCHED");
  });

  it("uses display seconds only for images on screens", () => {
    expect(usesDisplaySeconds("SCREEN_FOOTER", "IMAGE")).toBe(true);
    expect(usesDisplaySeconds("SCREEN_FULLSCREEN", "IMAGE")).toBe(true);
    expect(usesDisplaySeconds("POSTER_FOOTER", "IMAGE")).toBe(false);
    expect(usesDisplaySeconds("SCREEN_FOOTER", "VIDEO")).toBe(false);
  });
});

describe("checkDimensions", () => {
  it("accepts the exact screen footer and fullscreen sizes", () => {
    expect(checkDimensions("SCREEN_FOOTER", 1920, 270)).toBeNull();
    expect(checkDimensions("SCREEN_FULLSCREEN", 1920, 1080)).toBeNull();
  });

  it("rejects the wrong shape or a too small file", () => {
    expect(checkDimensions("SCREEN_FOOTER", 1920, 1080)).toMatch(/Wrong shape/);
    expect(checkDimensions("SCREEN_FULLSCREEN", 1080, 1920)).toMatch(/Wrong shape/);
    expect(checkDimensions("SCREEN_FOOTER", 480, 68)).toMatch(/Too small/);
    expect(checkDimensions("SCREEN_FOOTER", 0, 0)).toMatch(/no size/);
  });

  it("accepts a wide poster banner only", () => {
    expect(checkDimensions("POSTER_FOOTER", 1200, 200)).toBeNull();
    expect(checkDimensions("POSTER_FOOTER", 1200, 1200)).toMatch(/Wrong shape/);
    expect(checkDimensions("POSTER_FOOTER", 1200, 100)).toMatch(/Wrong shape/);
  });
});
