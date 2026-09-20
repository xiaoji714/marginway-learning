import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("CLI rejects malformed options and supports discoverable independent learning workflows", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "marginway-cli-"));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--no-warnings", "--import", "tsx", "apps/cli/src/index.ts", ...args],
      { encoding: "utf8", env: { ...process.env, LC_DATA_DIR: dir } },
    );
  const call = (cmd: string, p?: object) => {
    const r = run(
      cmd,
      ...(p ? ["--json", JSON.stringify(p)] : []),
      "--actor",
      "Test Agent",
      "--model",
      "test-model",
    );
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout).result;
  };
  expect(call("--help").usage).toContain("--input");
  expect(call("--version").version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(call("skill").content).toContain("Marginway");
  for (const args of [
    ["status", "--actro", "a"],
    ["status", "--actor"],
    ["status", "--actor", "--model", "x"],
    ["status", "--actor", "a", "--actor", "b"],
    ["status", "--json", "{}", "--input", "x"],
    ["status", "--json", "{"],
    ["status", "--json", "[]"],
    ["status", "--json", "null"],
  ]) {
    const r = run(...args);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr).error.code).toBe("INVALID_ARGUMENT");
  }
  const r = call("resources.upsert", { url: "https://example.com" });
  const a = call("anchors.upsert", { resourceId: r.id, quote: "Context" });
  expect(
    run(
      "notes.append",
      "--json",
      JSON.stringify({ anchorId: a.id, text: "Missing ID" }),
    ).status,
  ).toBe(1);
  const n = call("notes.append", {
    anchorId: a.id,
    text: "Thought",
    operationId: "note-1",
  });
  expect(n.origin).toBe("agent");
  expect(n.createdBy.model).toBe("test-model");
  expect(
    call("notes.append", {
      anchorId: a.id,
      text: "Thought",
      operationId: "note-1",
    }).id,
  ).toBe(n.id);
  expect(call("notes.list").total).toBe(1);
  const v = call("vocabulary.save", {
    anchorId: a.id,
    word: "context",
    meaning: "语境",
    operationId: "word-1",
  }).vocabulary;
  const review = call("reviews.record", {
    vocabularyId: v.id,
    rating: "good",
    feedbackSource: "user-confirmed",
    operationId: "review-1",
  });
  expect(review.origin).toBe("agent");
  expect(call("activity.list").items.map((x: any) => x.id)).toEqual([
    review.id,
  ]);
  expect(call("records.get", { id: review.id }).createdBy.name).toBe(
    "Test Agent",
  );
});
