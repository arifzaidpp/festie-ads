import { describe, expect, it } from "vitest";
import { analyticsCsv, buildReport, groupRows, type BreakdownRow } from "./analytics";
import type { ReportFilters } from "./reports";

const row = (over: Partial<BreakdownRow> = {}): BreakdownRow => ({
  date: "2026-11-10", hour: 9, adId: "ad1", adTitle: "Acme", sponsorName: "Acme Ltd", subFestId: "f1", screen: "main",
  country: "IN", region: "Kerala", city: "Kochi", lat: 9.93, lon: 76.27, deviceType: "tv", os: "Android", browser: "Chrome",
  placement: "SCREEN_FOOTER", impressions: 2, displayMs: 3_600_000, watchMs: 0, posterGenerated: 0, posterDownloads: 0, ...over,
});
const filters: ReportFilters = { from: "2026-11-09", to: "2026-11-11" };
const fest = (id: string) => (id === "f1" ? "Main fest" : id);

describe("buildReport", () => {
  const rows = [
    row(),
    row({ hour: 21, screen: "hall", city: "Thrissur", lat: 10.52, lon: 76.21, displayMs: 1_800_000, impressions: 1 }),
    row({ date: "2026-11-11", screen: "", country: "", region: "", city: "", lat: null, lon: null, deviceType: "", os: "", browser: "", placement: "POSTER_FOOTER", displayMs: 0, impressions: 0, posterGenerated: 5, posterDownloads: 3 }),
  ];
  const report = buildReport(rows, filters, fest, new Date("2026-11-12T10:00:00Z"));

  it("totals and counts distinct screens, countries and places", () => {
    expect(report.totals).toMatchObject({ impressions: 3, displayMs: 5_400_000, posterGenerated: 5, posterDownloads: 3, screens: 2, countries: 1, places: 2, fests: 1 });
  });
  it("has one point per day and 24 hours", () => {
    expect(report.daily.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(report.hourly).toHaveLength(24);
    expect(report.hourly[9]!.displayMs).toBe(3_600_000);
    expect(report.hourly[21]!.impressions).toBe(1);
  });
  it("groups places by city with an unknown bucket for posters", () => {
    expect(report.byCity.map((g) => g.label)).toEqual(["Kochi", "Thrissur", "Unknown"]);
    expect(report.byCountry.find((g) => g.key === "IN")!.label).toBe("India");
    expect(report.byPlace.map((g) => g.sub)).toEqual(["9.93, 76.27 · India", "10.52, 76.21 · India"]);
  });
  it("orders by usage and labels devices", () => {
    expect(report.byDevice[0]).toMatchObject({ key: "tv", label: "TV / signage", screens: 2 });
    expect(report.byScreen.map((g) => g.label)).toEqual(["main", "hall", "No screen (poster)"]);
  });
  it("does not report today as counting for a past range", () => expect(report.includesToday).toBe(false));
  it("exports a dimension as csv", () => {
    const csv = analyticsCsv(report, "city");
    expect(csv.split("\r\n")[0]).toBe("Name,Detail,Impressions,Hours shown,Hours watched,Poster generated,Poster downloads");
    expect(csv).toContain("Kochi,\"Kerala, India\",2,1.0000,0.0000,0,0");
  });
});

describe("groupRows", () => {
  it("skips rows whose describe returns null", () => {
    expect(groupRows([row()], () => null)).toEqual([]);
  });
});
