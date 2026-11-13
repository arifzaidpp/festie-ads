import { describe, expect, it } from "vitest";
import { pickAccount } from "./account";

const list = [{ id: "a" }, { id: "b" }];

describe("pickAccount", () => {
  it("uses the wanted account when it is the owner's", () => expect(pickAccount(list, "b")).toEqual({ id: "b" }));
  it("falls back to the oldest for a missing or foreign id", () => {
    expect(pickAccount(list, "zzz")).toEqual({ id: "a" });
    expect(pickAccount(list, undefined)).toEqual({ id: "a" });
  });
  it("is null with no accounts", () => expect(pickAccount([], "a")).toBeNull());
});
