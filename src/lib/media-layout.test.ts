import { describe, expect, it } from "vitest";
import { clampLayout, coverScale, defaultLayout, mediaBox, resizeFromCorner, snapToCenter, zoomAbout } from "./media-layout";

const frame = { width: 1920, height: 270 };

describe("mediaBox", () => {
  it("fits a square file inside a wide frame and centres it", () => {
    const box = mediaBox(frame, { width: 500, height: 500 }, defaultLayout("SCREEN_FOOTER"));
    expect(box.height).toBeCloseTo(1);
    expect(box.width).toBeCloseTo(270 / 1920);
    expect(box.left + box.width / 2).toBeCloseTo(0.5);
  });
  it("fills the frame width for a wide file", () => {
    const box = mediaBox(frame, { width: 3840, height: 540 }, defaultLayout("SCREEN_FOOTER"));
    expect(box).toMatchObject({ width: 1, height: 1, left: 0, top: 0 });
  });
  it("scales around the centre and moves with x and y", () => {
    const box = mediaBox({ width: 100, height: 100 }, { width: 100, height: 100 }, { background: "#000000", scale: 0.5, x: 0.25, y: -0.25 });
    expect(box).toMatchObject({ width: 0.5, height: 0.5, left: 0.5, top: 0 });
  });
});

describe("coverScale", () => {
  it("is the scale that removes the background", () => {
    const media = { width: 500, height: 500 };
    const box = mediaBox(frame, media, { ...defaultLayout("SCREEN_FOOTER"), scale: coverScale(frame, media) });
    expect(box.width).toBeCloseTo(1);
  });
});

describe("clampLayout", () => {
  it("keeps values in range and the colour valid", () => {
    expect(clampLayout({ background: "red", scale: 99, x: 5, y: -5 })).toEqual({ background: "#000000", scale: 4, x: 1, y: -1 });
  });
});

describe("zoomAbout", () => {
  const media = { width: 1000, height: 500 };
  it("keeps the point under the pointer fixed", () => {
    const start = { background: "#000000", scale: 1, x: 0, y: 0 };
    const at = { x: 0.8, y: 0.3 };
    const next = zoomAbout(start, 2, at);
    const a = mediaBox(frame, media, start);
    const b = mediaBox(frame, media, next);
    expect((at.x - b.left) / b.width).toBeCloseTo((at.x - a.left) / a.width);
    expect((at.y - b.top) / b.height).toBeCloseTo((at.y - a.top) / a.height);
  });
  it("stays inside the scale range", () => {
    expect(zoomAbout({ background: "#000000", scale: 3.9, x: 0, y: 0 }, 5, { x: 0.5, y: 0.5 }).scale).toBe(4);
  });
});

describe("resizeFromCorner", () => {
  it("keeps the opposite corner fixed", () => {
    const media = { width: 1000, height: 500 };
    const start = { background: "#000000", scale: 0.5, x: 0.1, y: 0 };
    const b = mediaBox(frame, media, start);
    const next = resizeFromCorner(frame, media, start, { sx: 1, sy: 1 }, { x: b.left + b.width * 1.5, y: b.top + b.height * 1.5 });
    const n = mediaBox(frame, media, next);
    expect(next.scale).toBeCloseTo(0.75);
    expect(n.left).toBeCloseTo(b.left);
    expect(n.top).toBeCloseTo(b.top);
  });
});

describe("snapToCenter", () => {
  it("snaps near the centre only", () => {
    const r = snapToCenter({ background: "#000000", scale: 1, x: 0.005, y: 0.2 });
    expect(r.layout).toMatchObject({ x: 0, y: 0.2 });
    expect(r.snapX).toBe(true);
    expect(r.snapY).toBe(false);
  });
});
