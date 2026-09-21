import { test, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { processCoveragePrelude } from "../testing/process-coverage.js";

test("reused process IDs cannot overwrite earlier coverage evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "marginway-coverage-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  for (const count of [1, 2]) {
    const run = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        processCoveragePrelude(directory) +
          `Object.defineProperty(process, 'pid', {value:42}); globalThis.__coverage__={count:${count}};`,
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
  }
  const files = readdirSync(directory);
  expect(files).toHaveLength(2);
  expect(
    files
      .map(
        (file) => JSON.parse(readFileSync(join(directory, file), "utf8")).count,
      )
      .sort(),
  ).toEqual([1, 2]);
});
