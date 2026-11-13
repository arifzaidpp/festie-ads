import { describe, expect, it } from "vitest";
import { haversineKm, scoreAd } from "./targeting";

const none = {};
describe("scoreAd", () => {
  it("is neutral without targeting", () => {
    expect(scoreAd(none, { country: "IN" })).toEqual({ eligible: true, multiplier: 1 });
    expect(scoreAd(none, {})).toEqual({ eligible: true, multiplier: 1 });
  });
  it("uses the strongest level, case-insensitive and trimmed", () => {
    const ad = { targetCountries: ["IN"], targetRegions: ["Kerala"], targetCities: ["Kozhikode"] };
    expect(scoreAd(ad, { country: " in " }).multiplier).toBe(1.5);
    expect(scoreAd(ad, { country: "IN", region: "KERALA" }).multiplier).toBe(2.5);
    expect(scoreAd(ad, { country: "IN", region: "kerala", city: "kozhikode " }).multiplier).toBe(4);
  });
  it("matches a radius", () => {
    const ad = { targetRadius: { lat: 11.25, lon: 75.78, km: 20 } };
    expect(scoreAd(ad, { lat: 11.3, lon: 75.8 }).multiplier).toBe(4);
    expect(scoreAd(ad, { lat: 12.9, lon: 77.6 }).multiplier).toBe(0.25);
  });
  it("mismatch: strict excludes, non-strict is 0.25", () => {
    expect(scoreAd({ targetCountries: ["IN"] }, { country: "AE" })).toEqual({ eligible: true, multiplier: 0.25 });
    expect(scoreAd({ targetCountries: ["IN"], targetStrict: true }, { country: "AE" }).eligible).toBe(false);
  });
  it("unknown location: strict excludes, non-strict keeps", () => {
    expect(scoreAd({ targetCountries: ["IN"], targetStrict: true }, {}).eligible).toBe(false);
    expect(scoreAd({ targetCountries: ["IN"] }, {})).toEqual({ eligible: true, multiplier: 1 });
  });
  it("interest doubles", () => {
    expect(scoreAd({ category: "food" }, { interests: ["food"] }).multiplier).toBe(2);
    expect(scoreAd({ category: "food", targetCities: ["x"] }, { city: "x", interests: ["Food"] }).multiplier).toBe(8);
    expect(scoreAd({ category: "food" }, { interests: ["travel"] }).multiplier).toBe(1);
  });
});
describe("haversineKm", () => {
  it("is zero for the same point and about 111 km per degree", () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
    expect(haversineKm(0, 0, 1, 0)).toBeGreaterThan(110);
    expect(haversineKm(0, 0, 1, 0)).toBeLessThan(112);
  });
});
