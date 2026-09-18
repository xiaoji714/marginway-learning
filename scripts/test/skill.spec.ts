import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
test("Agent skill exposes portable CLI and explicit provenance", () => {
  const s = readFileSync("skills/SKILL.md", "utf8");
  expect(s).toContain("learning capabilities");
  expect(s).toContain("--actor");
  expect(s).not.toMatch(/\/Users\/|[A-Z]:\\Users\\/);
});
