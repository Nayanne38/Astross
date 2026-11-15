import { describe, expect, it } from "vitest";
import { classColors, classOf, quantileBreaks } from "../lib/palettes";

describe("class breaks", () => {
  it("gives k-1 quantile breaks over positive values", () => {
    const b = quantileBreaks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(b).toHaveLength(4);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
  });
  it("assigns every value to a class in 0..k-1", () => {
    const b = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(classOf(1, b)).toBe(0);
    expect(classOf(8, b)).toBe(3);
  });
  it("palette has k colors and inverts", () => {
    const c = classColors("inferno", 6);
    expect(c).toHaveLength(6);
    expect(classColors("inferno", 6, true)).toEqual([...c].reverse());
  });
});
