import { describe, expect, it } from "vitest";
import { adInput, adPatchInput, adRuleErrors, ratesInput } from "./validation";

const id = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const base = {
  title: "Spring sale",
  accountId: id,
  sponsorId: id,
  assetId: id,
};

describe("adInput", () => {
  it("accepts an image screen ad with display seconds", () => {
    const parsed = adInput.parse({ ...base, placement: "SCREEN_FOOTER", mediaType: "IMAGE", displaySeconds: 10 });
    expect(parsed.weight).toBe(1);
    expect(parsed.status).toBe("DRAFT");
  });

  it("rejects video in the poster footer", () => {
    const result = adInput.safeParse({ ...base, placement: "POSTER_FOOTER", mediaType: "VIDEO" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Video is not allowed in the poster footer");
  });

  it("requires display seconds for screen images and forbids them elsewhere", () => {
    expect(adInput.safeParse({ ...base, placement: "SCREEN_FOOTER", mediaType: "IMAGE" }).success).toBe(false);
    expect(
      adInput.safeParse({ ...base, placement: "POSTER_FOOTER", mediaType: "IMAGE", displaySeconds: 10 }).success,
    ).toBe(false);
    expect(
      adInput.safeParse({ ...base, placement: "SCREEN_FOOTER", mediaType: "VIDEO", displaySeconds: 10 }).success,
    ).toBe(false);
    expect(adInput.safeParse({ ...base, placement: "POSTER_FOOTER", mediaType: "IMAGE" }).success).toBe(true);
  });

  it("rejects an end before the start and a weight out of range", () => {
    const schedule = {
      ...base,
      placement: "POSTER_FOOTER",
      mediaType: "IMAGE",
      startsAt: "2026-12-02T00:00:00Z",
      endsAt: "2026-12-01T00:00:00Z",
    };
    expect(adInput.safeParse(schedule).success).toBe(false);
    expect(adInput.safeParse({ ...base, placement: "POSTER_FOOTER", mediaType: "IMAGE", weight: 101 }).success).toBe(false);
  });
});

describe("adPatchInput", () => {
  it("does not add defaults for fields the patch leaves out", () => {
    expect(adPatchInput.parse({ status: "PAUSED" })).toEqual({ status: "PAUSED" });
  });
});

describe("adRuleErrors", () => {
  it("is empty for a valid ad", () => {
    expect(adRuleErrors({ placement: "SCREEN_FULLSCREEN", mediaType: "VIDEO" })).toEqual([]);
  });
});

describe("ratesInput", () => {
  const all = [
    { placement: "POSTER_FOOTER", mediaType: "IMAGE", amount: 0.5 },
    { placement: "SCREEN_FOOTER", mediaType: "IMAGE", amount: 2 },
    { placement: "SCREEN_FULLSCREEN", mediaType: "IMAGE", amount: 4 },
    { placement: "SCREEN_FOOTER", mediaType: "VIDEO", amount: 5 },
    { placement: "SCREEN_FULLSCREEN", mediaType: "VIDEO", amount: 8 },
  ];

  it("accepts all five prices and upper-cases the currency", () => {
    expect(ratesInput.parse({ currency: "inr", rates: all }).currency).toBe("INR");
  });

  it("rejects a missing price, a negative price and poster video", () => {
    expect(ratesInput.safeParse({ currency: "USD", rates: all.slice(1) }).success).toBe(false);
    expect(ratesInput.safeParse({ currency: "USD", rates: [{ ...all[0], amount: -1 }, ...all.slice(1)] }).success).toBe(false);
    expect(
      ratesInput.safeParse({ currency: "USD", rates: [...all, { placement: "POSTER_FOOTER", mediaType: "VIDEO", amount: 1 }] })
        .success,
    ).toBe(false);
  });
});
