import { describe, expect, it } from "vitest";
import { validateUpload } from "./media";

describe("validateUpload", () => {
  it("accepts allowed images and videos", () => {
    expect(validateUpload({ contentType: "image/png", bytes: 1000 })).toEqual({ ok: true, kind: "IMAGE", ext: "png" });
    expect(validateUpload({ contentType: "video/mp4", bytes: 10 * 1024 * 1024 })).toEqual({
      ok: true,
      kind: "VIDEO",
      ext: "mp4",
    });
  });

  it("rejects other types, svg and oversize files", () => {
    expect(validateUpload({ contentType: "image/svg+xml", bytes: 1000 }).ok).toBe(false);
    expect(validateUpload({ contentType: "application/pdf", bytes: 1000 }).ok).toBe(false);
    expect(validateUpload({ contentType: "image/jpeg", bytes: 6 * 1024 * 1024 }).ok).toBe(false);
    expect(validateUpload({ contentType: "video/mp4", bytes: 51 * 1024 * 1024 }).ok).toBe(false);
  });
});
