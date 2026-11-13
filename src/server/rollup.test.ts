import { describe, expect, it } from "vitest";
import { isDay, utcDay } from "./rollup";

describe("utcDay", () => {
  it("is the UTC date, whatever the local zone", () => {
    expect(utcDay(new Date("2026-11-12T00:10:00Z"))).toBe("2026-11-12");
    expect(utcDay(new Date("2026-11-12T00:10:00Z"), 1)).toBe("2026-11-11");
    expect(utcDay(new Date("2026-03-01T00:10:00Z"), 2)).toBe("2026-02-27");
  });
});

describe("isDay", () => {
  it("accepts real dates only", () => {
    expect(isDay("2026-11-12")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("12-11-2026")).toBe(false);
    expect(isDay("2026-11-12; drop table")).toBe(false);
  });
});
