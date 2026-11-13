import { describe, expect, it } from "vitest";
import { toMinor, todayUtc } from "./rates";

describe("rates helpers", () => {
  it("converts major to minor units without float drift", () => {
    expect(toMinor(1.25)).toBe(125);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(19.99)).toBe(1999);
  });

  it("uses the UTC date", () => {
    expect(todayUtc(new Date("2026-11-11T23:30:00-05:00"))).toBe("2026-11-12");
  });
});
