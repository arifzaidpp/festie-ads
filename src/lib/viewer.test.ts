import { describe, expect, it } from "vitest";
import { viewerFromParams } from "./viewer";

const v = (q: string) => viewerFromParams(new URLSearchParams(q));
describe("viewerFromParams", () => {
  it("reads good values", () => {
    expect(v("country=in&region=Kerala&city=Kochi&lat=9.9&lon=76.2&device=TV&interests=food,travel")).toEqual({
      country: "IN", region: "Kerala", city: "Kochi", lat: 9.9, lon: 76.2, device: "tv", interests: ["food", "travel"],
    });
  });
  it("drops bad values", () => {
    expect(v("country=India&lat=abc&lon=10&device=fridge&interests=nope,food,food")).toEqual({ interests: ["food"] });
    expect(v("lat=95&lon=10")).toEqual({});
  });
  it("limits interests to 5", () => {
    expect(v("interests=food,fashion,health,travel,finance,services").interests).toHaveLength(5);
  });
});
