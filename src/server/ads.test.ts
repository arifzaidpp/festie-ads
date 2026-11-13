import { describe, expect, it } from "vitest";
import { assetErrors } from "./ads";

describe("assetErrors", () => {
  const image = { kind: "IMAGE" as const, width: 1920, height: 270, durationMs: null };

  it("accepts a matching file", () => {
    expect(assetErrors({ placement: "SCREEN_FOOTER", mediaType: "IMAGE" }, image)).toEqual([]);
  });

  it("rejects a file of the wrong kind", () => {
    const errors = assetErrors({ placement: "SCREEN_FOOTER", mediaType: "VIDEO" }, image);
    expect(errors.join(" ")).toMatch(/file is image/);
  });

  it("rejects the wrong shape for the placement", () => {
    expect(assetErrors({ placement: "SCREEN_FULLSCREEN", mediaType: "IMAGE" }, image).join(" ")).toMatch(/Wrong shape/);
  });

  it("does not check the size of a video: the player fits it in the frame", () => {
    const video = { kind: "VIDEO" as const, width: 640, height: 640, durationMs: 10_000 };
    expect(assetErrors({ placement: "SCREEN_FOOTER", mediaType: "VIDEO" }, video)).toEqual([]);
  });

  it("rejects a video longer than the limit", () => {
    const video = { kind: "VIDEO" as const, width: 1920, height: 1080, durationMs: 61_000 };
    expect(assetErrors({ placement: "SCREEN_FULLSCREEN", mediaType: "VIDEO" }, video).join(" ")).toMatch(/at most 60/);
  });
});
