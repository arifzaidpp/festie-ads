import { describe, expect, it } from "vitest";
import { isStillReferenced, pgCode } from "./http";

describe("pg error helpers", () => {
  it("reads the code from a wrapped driver error", () => {
    expect(pgCode({ message: "Failed query", cause: { code: "23001" } })).toBe("23001");
    expect(pgCode({ code: "23503" })).toBe("23503");
    expect(pgCode(new Error("plain"))).toBeUndefined();
    expect(pgCode(null)).toBeUndefined();
  });

  it("treats RESTRICT and foreign key violations as still referenced", () => {
    expect(isStillReferenced({ cause: { code: "23001" } })).toBe(true);
    expect(isStillReferenced({ code: "23503" })).toBe(true);
    expect(isStillReferenced({ code: "23505" })).toBe(false);
  });
});
