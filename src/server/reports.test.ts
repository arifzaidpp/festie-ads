import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { dailySeries, daysBetween, parseFilters, totalsByAd } from "./reports";
import type { StatRow } from "./billing";

const now = new Date("2026-11-12T10:00:00Z");

describe("parseFilters", () => {
  it("defaults to the last 30 days up to today (UTC)", () => {
    expect(parseFilters({}, now)).toMatchObject({ from: "2026-10-14", to: "2026-11-12" });
  });
  it("treats empty select values as unset", () => {
    const f = parseFilters({ from: "2026-11-01", to: "2026-11-05", sponsorId: "", placement: "" }, now);
    expect(f.sponsorId).toBeUndefined();
    expect(f.placement).toBeUndefined();
  });
  it("rejects bad dates, reversed and oversized ranges, and non-uuid ids", () => {
    expect(() => parseFilters({ from: "2026-02-30" }, now)).toThrow(HttpError);
    expect(() => parseFilters({ from: "2026-11-05", to: "2026-11-01" }, now)).toThrow(HttpError);
    expect(() => parseFilters({ from: "2025-01-01", to: "2026-11-01" }, now)).toThrow(HttpError);
    expect(() => parseFilters({ adId: "nope" }, now)).toThrow(HttpError);
  });
});

const row = (over: Partial<StatRow>): StatRow => ({
  date: "2026-11-02", adId: "a", adTitle: "A", sponsorId: "s", sponsorName: "S", accountId: "g", accountName: "G",
  subFestId: "f", placement: "SCREEN_FOOTER", mediaType: "IMAGE",
  posterGenerated: 0, posterDownloads: 0, displayMs: 1000, watchMs: 0, impressions: 1, ...over,
});

describe("dailySeries", () => {
  it("has a point for every day, zeros included, and sums fests", () => {
    const series = dailySeries([row({}), row({ subFestId: "g", displayMs: 500, impressions: 2 })], "2026-11-01", "2026-11-03");
    expect(series.map((p) => p.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(series[1]).toMatchObject({ displayMs: 1500, impressions: 3 });
    expect(series[0]).toMatchObject({ displayMs: 0, impressions: 0 });
  });
  it("counts days across a month end", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("totalsByAd", () => {
  it("adds days per ad and puts the busiest first", () => {
    const totals = totalsByAd([row({}), row({ date: "2026-11-03" }), row({ adId: "b", adTitle: "B", displayMs: 9000 })]);
    expect(totals.map((t) => [t.adId, t.displayMs])).toEqual([["b", 9000], ["a", 2000]]);
  });
});
