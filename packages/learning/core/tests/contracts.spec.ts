import { test, expect, vi } from "vitest";
import { openStore, canonical } from "../src/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestContext } from "vitest";
const human = { origin: "human", id: "chrome-ui", name: "Human" };
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "context-contract-"));
  const store = openStore(join(dir, "db"));
  t.onTestFinished(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (cmd: string, p: Record<string, any> = {}) =>
    store.execute(cmd, p, human);
  const r = run("resources.upsert", {
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      tags: ["test", 123],
    }),
    a = run("anchors.upsert", {
      resourceId: r.id,
      quote: "A valid context",
      start: 0,
      end: 2,
    });
  return { store, run, r, a };
}
test("default data directory can be isolated and empty stores report a zero revision", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "context-default-"));
  vi.stubEnv("LC_DATA_DIR", dir);
  vi.resetModules();
  const { openStore: open } = await import("../src/store.js");
  const s = open();
  t.onTestFinished(() => {
    s.close();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });
  expect(s.version()).toBe(0);
  expect(s.execute("capabilities").commands["notes.append"]).toBeDefined();
  expect(s.execute("status").database).toBe(join(dir, "learning.sqlite"));
});
test("canonical URLs reject malformed, credentialed and missing video identities", () => {
  for (const u of [
    "broken",
    "https://user:pass@example.com",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=x",
  ])
    expect(() => canonical(u)).toThrow();
  expect(canonical("https://example.com/read#part")).toBe(
    "https://example.com/read",
  );
});
test("command boundary rejects invalid parameters and wrong record kinds without partial writes", (t) => {
  const { store, run, r, a } = fixture(t);
  for (const p of [null, [], 42])
    expect(() => store.execute("status", p as any)).toThrow();
  for (const [cmd, p] of [
    ["unknown", {}],
    ["unknown.list", {}],
    ["anchors.upsert", { resourceId: a.id, quote: "bad" }],
    ["notes.append", { anchorId: r.id, text: "bad" }],
    ["records.get", { id: "missing" }],
    ["jobs.get", { id: r.id }],
    ["jobs.cancel", { id: a.id }],
    ["jobs.complete", { id: a.id }],
    ["resources.update", { id: r.id, expectedRevision: 0 }],
  ] as const)
    expect(() => run(cmd, p)).toThrow();
  expect(run("notes.list").total).toBe(0);
  expect(store.version()).toBeGreaterThan(0);
});
test("resource editing, search, paging and filters retain identity", (t) => {
  const { run, r, a } = fixture(t);
  expect(run("resources.upsert", { url: r.url }).id).toBe(r.id);
  const u = run("resources.update", {
    id: r.id,
    expectedRevision: 1,
    title: "Edited",
    tags: ["updated"],
  });
  expect(u.tags).toEqual(["updated"]);
  expect(run("resources.update", { id: r.id, expectedRevision: 2 }).title).toBe(
    "Edited",
  );
  run("resources.upsert", {
    url: "https://example.com/other",
    title: "Elsewhere",
  });
  const v = run("vocabulary.save", {
    anchorId: a.id,
    word: "context",
    language: "en",
  }).vocabulary;
  run("notes.append", { anchorId: a.id, text: "find me" });
  expect(
    run("search", { query: "find me", resourceId: r.id }).items[0].text,
  ).toBe("find me");
  expect(run("resources.list", { limit: 1 }).next).toBe(1);
  expect(run("resources.list", { offset: 1, limit: 1 }).next).toBe(null);
  expect(run("resources.list", { resourceId: r.id, due: true }).total).toBe(1);
  expect(run("occurrences.list", { vocabularyId: v.id }).total).toBe(1);
  expect(run("occurrences.list", { vocabularyId: "other" }).total).toBe(0);
  expect(run("search", { resourceId: "absent" }).total).toBe(0);
});
test("anchor bounds and note/discussion guards reject invalid references", (t) => {
  const { run, r, a } = fixture(t);
  for (const p of [
    { quote: "" },
    { quote: "x", start: "NaN" },
    { quote: "x", start: -1 },
    { quote: "x", end: "bad" },
    { quote: "x", end: -1 },
    { quote: "x", start: 10, end: 5 },
  ])
    expect(() => run("anchors.upsert", { resourceId: r.id, ...p })).toThrow();
  const b = run("anchors.upsert", { resourceId: r.id, quote: "no time" });
  expect(b.start).toBe(null);
  expect(run("anchors.upsert", { resourceId: r.id, quote: "no time" }).id).toBe(
    b.id,
  );
  expect(() => run("notes.append", { anchorId: a.id, text: " " })).toThrow();
  expect(() =>
    run("notes.update", { id: r.id, text: "x", expectedRevision: 1 }),
  ).toThrow();
  expect(() => run("vocabulary.save", { anchorId: a.id, word: " " })).toThrow();
  const d = run("discussions.create", { anchorId: b.id });
  expect(d.question).toContain("理解");
  for (const cmd of ["notes.append", "context.export"])
    for (const discussionId of [r.id, d.id])
      expect(() =>
        run(cmd, { anchorId: a.id, discussionId, text: "test" }),
      ).toThrow();
  expect(run("context.export", { anchorId: a.id }).context.discussion).toBe(
    null,
  );
});
test("review feedback schedules again, hard and successive good intervals", (t) => {
  const { run, a, r } = fixture(t);
  const v = run("vocabulary.save", { anchorId: a.id, word: "word" }).vocabulary;
  expect(() =>
    run("reviews.record", { vocabularyId: r.id, rating: "good" }),
  ).toThrow();
  expect(() =>
    run("reviews.record", { vocabularyId: v.id, rating: "invalid" }),
  ).toThrow();
  for (const rating of ["again", "hard", "good", "good"])
    run("reviews.record", { vocabularyId: v.id, rating });
  expect(run("records.get", { id: v.id }).intervalDays).toBe(4);
  expect(run("reviews.list").total).toBe(4);
});
test("job guards, heartbeat permissions and empty queue are explicit", (t) => {
  const { store, run, r, a } = fixture(t);
  const web = run("resources.upsert", { url: "https://example.com" }),
    other = run("anchors.upsert", { resourceId: web.id, quote: "other" });
  for (const p of [
    { type: "bad" },
    { type: "transcript", resourceId: web.id },
    { type: "translate" },
    { type: "translate", anchorIds: [] },
    { type: "translate", anchorIds: Array(5).fill(a.id) },
    { type: "translate", anchorIds: [other.id] },
    { type: "lookup", anchorId: a.id, text: " " },
    { type: "seek", seconds: NaN },
  ])
    expect(() => run("jobs.submit", { resourceId: r.id, ...p })).toThrow();
  for (const cmd of ["bridge.heartbeat", "jobs.claim", "jobs.complete"])
    expect(() => store.execute(cmd, { id: a.id })).toThrow();
  expect(run("jobs.claim")).toBe(null);
  run("bridge.heartbeat");
  expect(run("status").bridge.at).toBeTruthy();
});
test("transcript completion validates segments and imports native timestamps once", (t) => {
  const { run, r, a } = fixture(t);
  const j = run("jobs.submit", { type: "transcript", resourceId: r.id });
  run("jobs.claim");
  for (const segments of [undefined, [], Array(12001).fill({})])
    expect(() => run("jobs.complete", { id: j.id, segments })).toThrow();
  const segments = [
    { text: "Native sentence", start: 3, duration: 2 },
    { text: "No duration", start: 4 },
    { text: "A valid context", start: 0, duration: 2 },
    { text: "", start: 1 },
    { text: "bad", start: "bad" },
    { text: "bad", start: -1 },
  ];
  run("jobs.complete", { id: j.id, segments });
  expect(run("jobs.get", { id: j.id }).status).toBe("done");
  expect(run("anchors.list", { resourceId: r.id }).total).toBe(3);
  expect(run("jobs.cancel", { id: j.id }).status).toBe("done");
  expect(run("records.get", { id: a.id }).revision).toBe(1);
});
test("translation completion ignores unrequested or blank segments and exports cached context", (t) => {
  const { run, r, a } = fixture(t);
  let j = run("jobs.submit", {
    type: "translate",
    resourceId: r.id,
    anchorIds: [a.id],
  });
  run("jobs.claim");
  run("jobs.complete", {
    id: j.id,
    translations: [
      { id: "other", text: "bad" },
      { id: a.id, text: "" },
      { id: a.id, text: "有效语境" },
    ],
  });
  expect(run("context.export", { anchorId: a.id }).context.translation).toBe(
    "有效语境",
  );
  const b = run("anchors.upsert", { resourceId: r.id, quote: "second" });
  j = run("jobs.submit", {
    type: "translate",
    resourceId: r.id,
    anchorIds: [b.id],
  });
  run("jobs.claim");
  run("jobs.complete", { id: j.id });
  expect(run("translations.list").total).toBe(1);
  j = run("jobs.submit", {
    type: "lookup",
    resourceId: r.id,
    anchorId: a.id,
    text: "context",
  });
  run("jobs.claim");
  run("jobs.complete", { id: j.id, text: "语境" });
  expect(run("jobs.get", { id: j.id }).result).toBe("语境");
  const failure = run("jobs.submit", {
    type: "lookup",
    resourceId: r.id,
    anchorId: a.id,
    text: "failure",
  });
  run("jobs.claim");
  run("jobs.complete", { id: failure.id, error: "Provider unavailable" });
  expect(run("jobs.get", { id: failure.id }).error).toBe(
    "Provider unavailable",
  );
});
test("abandoned running jobs expire without an automatic paid retry", (t) => {
  const { run, r, a } = fixture(t);
  const j = run("jobs.submit", {
    type: "lookup",
    resourceId: r.id,
    anchorId: a.id,
    text: "word",
  });
  run("jobs.claim");
  expect(run("jobs.claim")).toBe(null);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200000);
  expect(run("jobs.claim")).toBe(null);
  expect(run("jobs.get", { id: j.id }).status).toBe("error");
});
test("backup merges new records atomically, checks references and keeps existing records", (t) => {
  const { run, store, r, a } = fixture(t);
  for (const data of [
    undefined,
    {},
    { schemaVersion: 1 },
    { schemaVersion: 1, objects: Array(50001).fill({}) },
  ])
    expect(() => run("backup.import", { data })).toThrow();
  for (const record of [
    { kind: "bad" },
    { kind: "note", id: 42 },
    { kind: "note", id: "new" },
    { kind: "note", id: "new", updatedAt: "now" },
  ])
    expect(() =>
      run("backup.import", { data: { schemaVersion: 1, objects: [record] } }),
    ).toThrow();
  const backup = run("export");
  expect(run("backup.import", { data: backup }).imported).toBe(2);
  const note = {
    id: "imported",
    kind: "note",
    resourceId: r.id,
    anchorId: a.id,
    text: "Imported",
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
  expect(
    run("backup.import", { data: { schemaVersion: 1, objects: [note] } })
      .imported,
  ).toBe(1);
  expect(run("records.get", { id: note.id }).text).toBe("Imported");
  const bad = { ...note, id: "bad-ref", anchorId: "missing" };
  expect(() =>
    run("backup.import", { data: { schemaVersion: 1, objects: [bad] } }),
  ).toThrow();
  expect(() => run("records.get", { id: bad.id })).toThrow();
  expect(store.version()).toBeGreaterThan(0);
});
