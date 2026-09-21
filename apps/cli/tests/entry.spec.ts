import { test, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

test("CLI accepts stdin/files, aliases and defaults; IO errors stay structured", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "marginway-entry-"));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const entry = resolve(
    process.env.LC_RUNTIME_COVERAGE
      ? "apps/cli/lib/index.coverage.js"
      : "apps/cli/lib/index.js",
  );
  const run = (args: string[], input?: string, path = entry) =>
    spawnSync(process.execPath, ["--no-warnings", path, ...args], {
      input,
      encoding: "utf8",
      env: { ...process.env, LC_DATA_DIR: dir },
    });
  for (const args of [[], ["help"], ["version"], ["status", "--input", "-"]]) {
    const p = run(args, "{}");
    expect(p.status, p.stderr).toBe(0);
    expect(JSON.parse(p.stdout).ok).toBe(true);
  }
  const file = join(dir, "request.json");
  writeFileSync(file, '{"url":"https://example.com/input"}');
  expect(
    JSON.parse(run(["resources.upsert", "--input", file]).stdout).result.url,
  ).toBe("https://example.com/input");
  for (const args of [
    ["status", "--input", join(dir, "missing")],
    ["status", "--input", "-"],
    ["unknown-command"],
    ["notes.append", "--json", '{"operationId":" "}'],
  ]) {
    const p = run(args, "{");
    expect(p.status).toBe(1);
    expect(JSON.parse(p.stderr).error.message).toBeTruthy();
    expect(p.stdout).toBe("");
  }
  // A relocated runtime must report incomplete packaging, not guess a Skill.
  const relocated = mkdtempSync(resolve("apps/cli/lib/entry-test-"));
  t.onTestFinished(() => rmSync(relocated, { recursive: true, force: true }));
  const nested = join(relocated, "a", "b");
  mkdirSync(nested, { recursive: true });
  const copy = join(nested, "index.js");
  copyFileSync(entry, copy);
  expect(JSON.parse(run(["skill"], undefined, copy).stderr).error.code).toBe(
    "NOT_FOUND",
  );
  writeFileSync(join(nested, "cli-version.json"), '{"version":"1.2.3"}');
  expect(
    JSON.parse(run(["--version"], undefined, copy).stdout).result.version,
  ).toBe("1.2.3");
  writeFileSync(join(nested, "cli-version.json"), "{");
  expect(
    JSON.parse(run(["--version"], undefined, copy).stderr).error.code,
  ).toBe("INTERNAL");
});
