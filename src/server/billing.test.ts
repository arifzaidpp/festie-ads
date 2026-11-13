import { describe, expect, it } from "vitest";
import {
  amountFor,
  csvField,
  invoiceLines,
  minorToDecimal,
  priceRows,
  quantityLabel,
  rateOn,
  toCsv,
  totalsByCurrency,
  type RateRow,
  type StatRow,
} from "./billing";

const H = 3_600_000;
const rate = (over: Partial<RateRow>): RateRow => ({
  placement: "SCREEN_FOOTER",
  mediaType: "IMAGE",
  amountMinor: 500,
  currency: "USD",
  effectiveFrom: "2026-11-01",
  ...over,
});
const stat = (over: Partial<StatRow>): StatRow => ({
  date: "2026-11-10",
  adId: "a1",
  adTitle: "Ad 1",
  sponsorId: "s1",
  sponsorName: "Acme",
  accountId: "g1",
  accountName: "Fest 2026",
  subFestId: "f1",
  placement: "SCREEN_FOOTER",
  mediaType: "IMAGE",
  posterGenerated: 0,
  posterDownloads: 0,
  displayMs: 0,
  watchMs: 0,
  impressions: 0,
  ...over,
});

describe("rateOn", () => {
  const rates = [rate({ effectiveFrom: "2026-11-01", amountMinor: 500 }), rate({ effectiveFrom: "2026-11-10", amountMinor: 800 })];
  it("uses the latest rate that started on or before the day", () => {
    expect(rateOn(rates, "SCREEN_FOOTER", "IMAGE", "2026-11-09")?.amountMinor).toBe(500);
    expect(rateOn(rates, "SCREEN_FOOTER", "IMAGE", "2026-11-10")?.amountMinor).toBe(800);
    expect(rateOn(rates, "SCREEN_FOOTER", "IMAGE", "2026-12-01")?.amountMinor).toBe(800);
  });
  it("is null before the first rate and for another combination", () => {
    expect(rateOn(rates, "SCREEN_FOOTER", "IMAGE", "2026-10-31")).toBeNull();
    expect(rateOn(rates, "SCREEN_FULLSCREEN", "IMAGE", "2026-11-10")).toBeNull();
  });
});

describe("amountFor", () => {
  it("prices hours by the millisecond and downloads by the piece", () => {
    expect(amountFor("PER_HOUR_DISPLAYED", 2 * H, 500)).toBe(1000);
    expect(amountFor("PER_HOUR_DISPLAYED", 30 * 60_000, 500)).toBe(250);
    expect(amountFor("PER_DOWNLOAD", 12, 25)).toBe(300);
  });
  it("rounds once to a minor unit", () => {
    expect(amountFor("PER_HOUR_DISPLAYED", 10_000, 500)).toBe(1); // 1.39 cents
    expect(amountFor("PER_HOUR_DISPLAYED", 1000, 500)).toBe(0);
  });
});

describe("priceRows", () => {
  const rates = [
    rate({ effectiveFrom: "2026-11-01", amountMinor: 500 }),
    rate({ effectiveFrom: "2026-11-10", amountMinor: 1000 }),
    rate({ placement: "SCREEN_FOOTER", mediaType: "VIDEO", amountMinor: 2000, effectiveFrom: "2026-11-01" }),
    rate({ placement: "POSTER_FOOTER", amountMinor: 10, effectiveFrom: "2026-11-01" }),
  ];
  it("prices each day with the rate of that day", () => {
    const [before, after] = priceRows(
      [stat({ date: "2026-11-09", displayMs: H }), stat({ date: "2026-11-10", displayMs: H })],
      rates,
    );
    expect(before!.amountMinor).toBe(500);
    expect(after!.amountMinor).toBe(1000);
  });
  it("bills video by watch time, images by display time and posters by downloads", () => {
    const [video, image, poster] = priceRows(
      [
        stat({ mediaType: "VIDEO", watchMs: H, displayMs: 10 * H }),
        stat({ displayMs: H, watchMs: 10 * H }),
        stat({ placement: "POSTER_FOOTER", posterDownloads: 7, posterGenerated: 50, displayMs: 5 * H }),
      ],
      rates,
    );
    expect(video).toMatchObject({ unit: "PER_HOUR_WATCHED", quantity: H, amountMinor: 2000 });
    expect(image).toMatchObject({ unit: "PER_HOUR_DISPLAYED", quantity: H, amountMinor: 1000 });
    expect(poster).toMatchObject({ unit: "PER_DOWNLOAD", quantity: 7, amountMinor: 70 });
  });
  it("leaves a day without a price unpriced instead of guessing", () => {
    const [row] = priceRows([stat({ date: "2026-10-01", displayMs: H })], rates);
    expect(row!.rate).toBeNull();
    expect(row!.amountMinor).toBe(0);
  });
});

describe("invoiceLines", () => {
  const rates = [rate({ effectiveFrom: "2026-11-01", amountMinor: 500 }), rate({ effectiveFrom: "2026-11-10", amountMinor: 1000 })];
  it("adds days with the same price before rounding, and splits a price change into two lines", () => {
    const priced = priceRows(
      [
        stat({ date: "2026-11-08", displayMs: 10_000 }),
        stat({ date: "2026-11-09", displayMs: 10_000, subFestId: "f2" }),
        stat({ date: "2026-11-10", displayMs: 30 * 60_000 }),
      ],
      rates,
    );
    const lines = invoiceLines(priced);
    expect(lines).toHaveLength(2);
    // 20 s at 5.00/h = 2.78 cents -> 3, not 1 + 1
    expect(lines.find((l) => l.rateMinor === 500)).toMatchObject({ quantity: 20_000, amountMinor: 3 });
    expect(lines.find((l) => l.rateMinor === 1000)).toMatchObject({ amountMinor: 500 });
  });
  it("keeps unpriced usage visible and totals per currency", () => {
    const priced = priceRows(
      [stat({ date: "2026-10-01", displayMs: H }), stat({ date: "2026-11-10", displayMs: H }), stat({ adId: "a2", displayMs: 0 })],
      rates,
    );
    const lines = invoiceLines(priced);
    expect(lines).toHaveLength(2); // the zero-usage row is not a line
    expect(lines.find((l) => l.rateMinor === null)).toMatchObject({ amountMinor: 0, unpricedQuantity: H });
    expect(totalsByCurrency(lines)).toEqual([{ currency: "USD", amountMinor: 1000 }]);
  });
  it("separates sponsors", () => {
    const priced = priceRows([stat({ displayMs: H }), stat({ sponsorId: "s2", sponsorName: "Beta", adId: "a2", displayMs: H })], rates);
    expect(invoiceLines(priced).map((l) => l.sponsorName)).toEqual(["Acme", "Beta"]);
  });
});

describe("formatting", () => {
  it("formats minor units and quantities", () => {
    expect(minorToDecimal(0)).toBe("0.00");
    expect(minorToDecimal(5)).toBe("0.05");
    expect(minorToDecimal(123456)).toBe("1234.56");
    expect(quantityLabel("PER_HOUR_DISPLAYED", 5400000)).toBe("1.5000");
    expect(quantityLabel("PER_DOWNLOAD", 7)).toBe("7");
  });
  it("quotes CSV fields and defuses formulas", () => {
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(-5)).toBe("-5");
    expect(csvField(null)).toBe("");
    expect(toCsv([["a", 1], ["b", 2]])).toBe("a,1\r\nb,2\r\n");
  });
});
