import { describe, expect, it } from "vitest";
import { MAX_EVENTS_PER_MINUTE, contextColumns, eventContext, eventInput, rejectReason, withinRateLimit, type AdFacts, type EventInput } from "./events";

const now = new Date("2026-11-12T10:00:00Z");
const GROUP = "11111111-1111-4111-8111-111111111111";
const AD = "22222222-2222-4222-8222-222222222222";

const ad = (over: Partial<AdFacts> = {}): AdFacts => ({
  accountId: GROUP,
  placement: "SCREEN_FOOTER",
  mediaType: "IMAGE",
  status: "ACTIVE",
  ...over,
});
const event = (over: Partial<EventInput> = {}): EventInput => ({
  id: "s1:1",
  ad_id: AD,
  kind: "SCREEN_DISPLAY_MS",
  placement: "SCREEN_FOOTER",
  sub_fest_id: "fest-1",
  value: 15000,
  occurred_at: "2026-11-12T09:59:00Z",
  ...over,
});
const check = (e: EventInput, a: AdFacts | null = ad(), festIds = ["fest-1"]) =>
  rejectReason(e, { ad: a ?? undefined, accountId: GROUP, festIds: new Set(festIds), now });

describe("rejectReason", () => {
  it("accepts a normal heartbeat", () => expect(check(event())).toBeNull());
  it("rejects an unknown ad and an ad of another group", () => {
    expect(check(event(), null)).toBe("unknown_ad");
    expect(check(event(), ad({ accountId: "33333333-3333-4333-8333-333333333333" }))).toBe("unknown_ad");
  });
  it("rejects draft ads but accepts paused and archived ones that were on screen", () => {
    expect(check(event(), ad({ status: "DRAFT" }))).toBe("ad_not_live");
    expect(check(event(), ad({ status: "PAUSED" }))).toBeNull();
    expect(check(event(), ad({ status: "ARCHIVED" }))).toBeNull();
  });
  it("rejects a placement that is not the ad's", () => {
    expect(check(event({ placement: "SCREEN_FULLSCREEN" }))).toBe("wrong_placement");
  });
  it("rejects a fest outside the connection", () => {
    expect(check(event({ sub_fest_id: "other" }))).toBe("fest_not_connected");
    expect(check(event({ sub_fest_id: "-" }))).toBeNull(); // a screen of the whole festival
  });
  it("keeps poster kinds on the poster footer and screen kinds off it", () => {
    expect(check(event({ kind: "POSTER_GENERATED" }))).toBe("kind_not_allowed");
    const poster = ad({ placement: "POSTER_FOOTER" });
    expect(check(event({ kind: "POSTER_GENERATED", placement: "POSTER_FOOTER", value: 0 }), poster)).toBeNull();
    expect(check(event({ placement: "POSTER_FOOTER" }), poster)).toBe("kind_not_allowed");
  });
  it("lets a poster event stand for many files, up to a limit", () => {
    const poster = ad({ placement: "POSTER_FOOTER" });
    const e = (value: number) => event({ kind: "POSTER_DOWNLOADED", placement: "POSTER_FOOTER", value });
    expect(check(e(0), poster)).toBeNull(); // counts as one
    expect(check(e(120), poster)).toBeNull();
    expect(check(e(5000), poster)).toBeNull();
    expect(check(e(5001), poster)).toBe("value_out_of_range");
  });
  it("counts video watch time only for video ads", () => {
    expect(check(event({ kind: "VIDEO_WATCH_MS" }))).toBe("kind_not_allowed");
    expect(check(event({ kind: "VIDEO_WATCH_MS" }), ad({ mediaType: "VIDEO" }))).toBeNull();
  });
  it("caps one beat at 20 seconds and refuses zero", () => {
    expect(check(event({ value: 20000 }))).toBeNull();
    expect(check(event({ value: 20001 }))).toBe("value_out_of_range");
    expect(check(event({ value: 0 }))).toBe("value_out_of_range");
  });
  it("refuses old and future events", () => {
    expect(check(event({ occurred_at: "2026-11-11T09:59:00Z" }))).toBe("too_old");
    expect(check(event({ occurred_at: "2026-11-12T10:04:00Z" }))).toBeNull();
    expect(check(event({ occurred_at: "2026-11-12T10:06:00Z" }))).toBe("in_future");
  });
});

describe("withinRateLimit", () => {
  it("allows up to the cap and no more", () => {
    expect(withinRateLimit(0, 100)).toBe(true);
    expect(withinRateLimit(MAX_EVENTS_PER_MINUTE - 100, 100)).toBe(true);
    expect(withinRateLimit(MAX_EVENTS_PER_MINUTE - 100, 101)).toBe(false);
    expect(withinRateLimit(MAX_EVENTS_PER_MINUTE, 1)).toBe(false);
  });
});

describe("eventInput", () => {
  it("requires a uuid ad id and an ISO time", () => {
    expect(eventInput.safeParse({ ...event(), ad_id: "nope" }).success).toBe(false);
    expect(eventInput.safeParse({ ...event(), occurred_at: "yesterday" }).success).toBe(false);
    expect(eventInput.safeParse(event()).success).toBe(true);
  });
});

describe("event context", () => {
  it("rounds coordinates to about 1 km and upper-cases the country", () => {
    const columns = contextColumns({ screen: "main", geo: { country: "in", city: "Kochi", lat: 9.931233, lon: 76.267304 }, device: { type: "tv", os: "Android", browser: "Chrome" } });
    expect(columns).toMatchObject({ screenKey: "main", country: "IN", city: "Kochi", lat: 9.93, lon: 76.27, deviceType: "tv", os: "Android", browser: "Chrome" });
  });
  it("is all null without context, and a lone latitude is dropped", () => {
    expect(Object.values(contextColumns(undefined)).every((v) => v === null)).toBe(true);
    expect(contextColumns({ geo: { lat: 10 } }).lat).toBeNull();
  });
  it("rejects a bad country code or coordinates", () => {
    expect(eventContext.safeParse({ geo: { country: "IND" } }).success).toBe(false);
    expect(eventContext.safeParse({ geo: { lat: 99, lon: 0 } }).success).toBe(false);
  });
});
