import { test, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("doctor is read-only, handles missing/corrupt databases and never treats a heartbeat as readiness", (t) => {
  const root = mkdtempSync(join(tmpdir(), "marginway-doctor-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const entry = resolve(
    process.env.LC_RUNTIME_COVERAGE
      ? "apps/cli/lib/index.coverage.js"
      : "apps/cli/lib/index.js",
  );
  const run = (dir: string) => {
    const p = spawnSync(process.execPath, ["--no-warnings", entry, "doctor"], {
      encoding: "utf8",
      env: { ...process.env, LC_DATA_DIR: dir },
    });
    expect(p.status, p.stderr).toBe(0);
    return JSON.parse(p.stdout).result;
  };
  const missing = join(root, "uninstalled");
  expect(run(missing).checks[0].code).toBe("DATABASE_MISSING");
  expect(existsSync(missing)).toBe(false);
  const file = join(root, "learning.sqlite");
  writeFileSync(file, "broken database");
  expect(run(root).checks[0].code).toBe("DATABASE_UNREADABLE");
  expect(readFileSync(file, "utf8")).toBe("broken database");
  rmSync(file);
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE objects(id TEXT); CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)",
  );
  const verify = (expected: unknown) => {
    const before = readFileSync(file);
    const result = run(root);
    expect(result.checks[0].code).toBe("DATABASE_READABLE");
    expect(result.lastHeartbeat).toEqual(expected);
    expect(result.readiness).toBe("unknown");
    expect(
      result.checks.slice(1).every((x: any) => x.status === "unknown"),
    ).toBe(true);
    expect(result.runtime.executablePath).toBe(process.execPath);
    expect(readFileSync(file)).toEqual(before);
  };
  verify(null);
  for (const value of [
    null,
    {},
    { at: 42 },
    { at: "2000-01-01T00:00:00Z" },
    { at: new Date().toISOString() },
  ]) {
    db.prepare("INSERT OR REPLACE INTO meta VALUES('bridge', ?)").run(
      JSON.stringify(value),
    );
    verify(typeof value?.at === "string" ? value.at : null);
  }
  db.prepare("UPDATE meta SET value='{' WHERE key='bridge'").run();
  expect(
    run(root)
      .checks.slice(0, 2)
      .map((c: any) => c.code),
  ).toEqual(["DATABASE_READABLE", "HEARTBEAT_METADATA_INVALID"]);
  db.prepare("DELETE FROM meta").run();
  db.exec("PRAGMA journal_mode=WAL");
  db.prepare("INSERT INTO objects VALUES('wal-record')").run();
  verify(null);
  expect(db.prepare("SELECT id FROM objects").get()?.id).toBe("wal-record");
  db.close();
});
