import { describe, expect, it } from "vitest";

// Temporary probe: it exists only to prove that a failing pull request cannot be
// merged, and is removed together with its branch right after the run.
describe("Merge gate probe", () => {
  it("fails on purpose", () => {
    expect(1).toBe(2);
  });
});
