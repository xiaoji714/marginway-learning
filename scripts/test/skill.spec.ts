import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
test("Agent skill exposes portable CLI and explicit provenance", () => {
  const entry = readFileSync("skills/SKILL.md", "utf8");
  expect(entry).toContain("## 安装与配置");
  expect(entry).toContain("references/usage.md");
  expect(entry).toContain("docs/installation.md");
  const s = entry + readFileSync("skills/references/usage.md", "utf8");
  expect(s).toContain("learning capabilities");
  expect(s).toContain("--actor");
  expect(s).toContain("name: marginway");
  expect(s).toContain("learning skill");
  expect(s).toContain('feedbackSource="user-confirmed"');
  expect(s).toContain("result.next");
  expect(s).not.toMatch(/\/Users\/|[A-Z]:\\Users\\/);
});
