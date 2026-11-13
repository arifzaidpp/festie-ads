import { describe, expect, it } from "vitest";
import { pickWeighted } from "./serve";

describe("pickWeighted", () => {
  const items = [
    { id: "a", weight: 1 },
    { id: "b", weight: 3 },
  ];

  it("returns null for no items", () => {
    expect(pickWeighted([])).toBeNull();
  });

  it("follows the weights", () => {
    expect(pickWeighted(items, () => 0)?.id).toBe("a");
    expect(pickWeighted(items, () => 0.24)?.id).toBe("a");
    expect(pickWeighted(items, () => 0.26)?.id).toBe("b");
    expect(pickWeighted(items, () => 0.999)?.id).toBe("b");
  });

  it("is close to the weights over many draws", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) counts[pickWeighted(items, random)!.id as "a" | "b"]++;
    expect(counts.b / counts.a).toBeGreaterThan(2.5);
    expect(counts.b / counts.a).toBeLessThan(3.5);
  });

  it("treats a weight below 1 as 1", () => {
    expect(pickWeighted([{ id: "z", weight: 0 }], () => 0.5)?.id).toBe("z");
  });
});

describe("pickWeighted with relevance weights", () => {
  it("takes fractional weights", () => {
    const items = [{ id: "a", weight: 0.25 }, { id: "b", weight: 0.75 }];
    expect(pickWeighted(items, () => 0.24)?.id).toBe("a");
    expect(pickWeighted(items, () => 0.26)?.id).toBe("b");
  });
});
