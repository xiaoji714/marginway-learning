import { test, expect } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";
const agent = {
    origin: "agent",
    id: "cli:test",
    name: "Test Agent",
    model: "test",
    assurance: "self-reported",
  },
  human = {
    origin: "human",
    id: "chrome-ui",
    name: "用户",
    assurance: "chrome-native-host-allowlist",
  };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "lc-test-"));
  const s = openStore(join(dir, "test.sqlite"));
  t.onTestFinished(() => {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const r = s.execute(
    "resources.upsert",
    {
      url: "https://www.youtube.com/watch?v=abcdefghijk&t=20",
      title: "Test video",
    },
    human,
  );
  const a = s.execute(
    "anchors.upsert",
    {
      resourceId: r.id,
      quote: "Learning in context matters.",
      start: 20,
      end: 25,
    },
    human,
  );
  return { s, r, a };
}
test("canonical resource and repeated word preserve separate contexts durably", (t) => {
  const { s, r, a } = fixture(t);
  assert.equal(r.url, "https://www.youtube.com/watch?v=abcdefghijk");
  const b = s.execute(
    "anchors.upsert",
    { resourceId: r.id, quote: "Another context.", start: 50 },
    human,
  );
  const v1 = s.execute(
      "vocabulary.save",
      { anchorId: a.id, word: "context" },
      human,
    ),
    v2 = s.execute(
      "vocabulary.save",
      { anchorId: b.id, word: "context" },
      human,
    );
  assert.equal(v1.vocabulary.id, v2.vocabulary.id);
  assert.equal(s.execute("occurrences.list").total, 2);
  const second = openStore(s.execute("status").database);
  assert.equal(second.execute("occurrences.list").total, 2);
  second.close();
});
test("agent identity, idempotency and revision conflicts", (t) => {
  const { s, a } = fixture(t);
  const p = { anchorId: a.id, text: "Agent reasoning", operationId: "one" };
  const n = s.execute("notes.append", p, agent);
  assert.equal(s.execute("notes.append", p, agent).id, n.id);
  assert.equal(s.execute("notes.list").total, 1);
  assert.equal(n.origin, "agent");
  assert.throws(
    () => s.execute("notes.append", { ...p, text: "different" }, agent),
    { code: "CONFLICT" },
  );
  const u = s.execute(
    "notes.update",
    { id: n.id, text: "Human edit", expectedRevision: 1 },
    human,
  );
  assert.equal(u.origin, "agent");
  assert.equal(u.editedBy.name, "用户");
  assert.throws(
    () =>
      s.execute(
        "notes.update",
        { id: n.id, text: "stale", expectedRevision: 1 },
        agent,
      ),
    { code: "CONFLICT" },
  );
  assert.equal(s.execute("records.history", { id: n.id }).length, 2);
});
test("two views share job and cancellation rejects late result", (t) => {
  const { s, r, a } = fixture(t);
  const p = { type: "translate", resourceId: r.id, anchorIds: [a.id] };
  const j = s.execute("jobs.submit", p, human);
  assert.equal(s.execute("jobs.submit", p, human).id, j.id);
  assert.throws(() => s.execute("jobs.claim", {}, agent), {
    code: "FORBIDDEN",
  });
  s.execute("jobs.claim", {}, human);
  s.execute("jobs.cancel", { id: j.id }, human);
  assert.throws(
    () =>
      s.execute(
        "jobs.complete",
        { id: j.id, translations: [{ id: a.id, text: "语境学习" }] },
        human,
      ),
    { code: "CONFLICT" },
  );
  assert.equal(s.execute("translations.list").total, 0);
});
test("prompt links exact discussion and backup excludes keys", (t) => {
  const { s, a } = fixture(t);
  const d = s.execute(
    "discussions.create",
    { anchorId: a.id, question: "Why?" },
    human,
  );
  s.execute(
    "notes.append",
    { anchorId: a.id, discussionId: d.id, text: "Reasoning" },
    agent,
  );
  const x = s.execute("context.export", { anchorId: a.id, discussionId: d.id });
  assert.match(x.prompt, /Why\?/);
  assert.ok(x.prompt.includes(a.id));
  const b = s.execute("export");
  assert.ok(b.objects.some((x) => x.kind === "note"));
  assert.ok(!JSON.stringify(b).includes("aiApiKey"));
  assert.throws(() =>
    s.execute("resources.upsert", { url: "javascript:alert(1)" }, human),
  );
});
test("review scheduling and transactional import conflict handling", (t) => {
  const { s, a } = fixture(t);
  const v = s.execute(
    "vocabulary.save",
    { anchorId: a.id, word: "learning" },
    human,
  ).vocabulary;
  assert.equal(s.execute("vocabulary.list", { due: true }).total, 1);
  s.execute("reviews.record", { vocabularyId: v.id, rating: "good" }, human);
  assert.equal(s.execute("vocabulary.list", { due: true }).total, 0);
  const b = s.execute("export");
  b.objects[0].title = "changed";
  assert.throws(() => s.execute("backup.import", { data: b }, agent), {
    code: "CONFLICT",
  });
  assert.equal(s.execute("reviews.list").total, 1);
});
test("playback actions are repeatable commands, not cached results", (t) => {
  const { s, r } = fixture(t);
  const a = s.execute(
    "jobs.submit",
    { resourceId: r.id, type: "seek", seconds: 20 },
    agent,
  );
  const b = s.execute(
    "jobs.submit",
    { resourceId: r.id, type: "seek", seconds: 20 },
    agent,
  );
  assert.notEqual(a.id, b.id);
  assert.throws(() =>
    s.execute(
      "jobs.submit",
      { resourceId: r.id, type: "seek", seconds: -1 },
      agent,
    ),
  );
});

test("word corrections preserve IDs, contexts, reviews and creation provenance without breaking future saves", (t) => {
  const { s, r, a } = fixture(t);
  const run = (cmd, params = {}, actor = human) =>
    s.execute(cmd, params, actor);
  const first = run("vocabulary.save", {
    anchorId: a.id,
    word: "contex",
    meaning: "语境",
  });
  const b = run("anchors.upsert", {
    resourceId: r.id,
    quote: "A second context",
  });
  run("vocabulary.save", { anchorId: b.id, word: "contex", meaning: "上下文" });
  run("vocabulary.save", { anchorId: b.id, word: "other", language: "fr" });
  const other = run("vocabulary.save", { anchorId: b.id, word: "taken" });
  const review = run("reviews.record", {
    vocabularyId: first.vocabulary.id,
    rating: "good",
  });
  const v = run("records.get", { id: first.vocabulary.id });
  for (const [params, message] of [
    [{ id: r.id, word: "x", expectedRevision: 1 }, /需要词条/],
    [{ id: v.id, word: "x", expectedRevision: 1 }, /词条已更新/],
    [{ id: v.id, word: "  ", expectedRevision: v.revision }, /不能为空/],
    [{ id: v.id, word: "TAKEN", expectedRevision: v.revision }, /已存在/],
  ])
    assert.throws(() => run("vocabulary.update", params), message);
  const beforeActivity = run("activity.list").total;
  const corrected = run(
    "vocabulary.update",
    {
      id: v.id,
      word: "context",
      expectedRevision: v.revision,
      operationId: "correct-word",
    },
    agent,
  );
  assert.equal(corrected.id, v.id);
  assert.equal(corrected.dueAt, v.dueAt);
  assert.equal(corrected.createdAt, v.createdAt);
  assert.deepEqual(corrected.createdBy, human);
  assert.deepEqual(corrected.editedBy, agent);
  assert.equal(corrected.origin, "human");
  assert.equal(run("records.get", { id: review.id }).vocabularyId, v.id);
  const occurrences = run("occurrences.list", { vocabularyId: v.id }).items;
  assert.equal(occurrences.length, 2);
  assert.ok(occurrences.every((o) => o.word === "context"));
  const occurrence = run("records.get", { id: first.occurrence.id });
  assert.equal(occurrence.anchorId, a.id);
  assert.equal(occurrence.createdAt, first.occurrence.createdAt);
  assert.equal(run("records.get", { id: a.id }).quote, a.quote);
  assert.equal(
    run("vocabulary.save", { anchorId: a.id, word: "context" }).occurrence.id,
    occurrence.id,
  );
  const old = run("vocabulary.save", { anchorId: a.id, word: "contex" });
  assert.notEqual(old.vocabulary.id, v.id);
  assert.equal(old.vocabulary.word, "contex");
  assert.equal(run("records.get", { id: v.id }).word, "context");
  assert.throws(
    () =>
      run("occurrences.update", {
        id: r.id,
        expectedRevision: 1,
        meaning: "x",
      }),
    /需要词汇语境/,
  );
  assert.throws(
    () =>
      run("occurrences.update", {
        id: occurrence.id,
        expectedRevision: 1,
        meaning: "x",
      }),
    /释义已更新/,
  );
  const params = {
    id: occurrence.id,
    expectedRevision: occurrence.revision,
    meaning: "具体语境",
    operationId: "meaning",
  };
  const changed = run("occurrences.update", params, agent);
  assert.deepEqual(run("occurrences.update", params, agent), changed);
  assert.equal(changed.meaning, "具体语境");
  assert.equal(changed.word, "context");
  assert.equal(
    run("occurrences.list", { vocabularyId: v.id }).items.find(
      (o) => o.id !== changed.id,
    ).meaning,
    "上下文",
  );
  assert.equal(run("activity.list").total, beforeActivity + 1);
  assert.equal(run("records.history", { id: changed.id }).length, 3);
  assert.equal(run("records.get", { id: other.vocabulary.id }).word, "taken");
  // Case-only correction keeps canonical vocabulary identity but may leave the original hash occupied.
  const upper = run("vocabulary.update", {
    id: v.id,
    expectedRevision: corrected.revision,
    word: "CONTEXT",
  });
  const recaptured = run("vocabulary.save", {
    anchorId: a.id,
    word: "context",
  });
  assert.equal(recaptured.vocabulary.id, upper.id);
  assert.notEqual(recaptured.occurrence.id, changed.id);
  const refreshed = run("records.get", { id: recaptured.occurrence.id });
  run("occurrences.update", {
    id: refreshed.id,
    expectedRevision: refreshed.revision,
  });
  assert.equal(run("records.get", { id: refreshed.id }).meaning, "");
});

test("case correction can recapture the original spelling without overwriting occurrence history", (t) => {
  const { s, a } = fixture(t);
  const original = s.execute(
    "vocabulary.save",
    { anchorId: a.id, word: "shape", meaning: "Original" },
    human,
  );
  s.execute(
    "vocabulary.update",
    { id: original.vocabulary.id, expectedRevision: 1, word: "SHAPE" },
    human,
  );
  const next = s.execute(
    "vocabulary.save",
    { anchorId: a.id, word: "shape", meaning: "New capture" },
    human,
  );
  assert.equal(next.vocabulary.id, original.vocabulary.id);
  assert.notEqual(next.occurrence.id, original.occurrence.id);
  assert.equal(
    s.execute("records.get", { id: original.occurrence.id }).word,
    "SHAPE",
  );
  assert.equal(
    s.execute("records.get", { id: original.occurrence.id }).meaning,
    "Original",
  );
  assert.equal(
    s.execute("vocabulary.save", { anchorId: a.id, word: "shape" }, human)
      .occurrence.id,
    next.occurrence.id,
  );
});

test("recycle bin hides descendants, preserves shared vocabulary and independently deleted children, and restores without new activity", (t) => {
  const { s, r, a } = fixture(t);
  const run = (cmd, params = {}, actor = human) =>
    s.execute(cmd, params, actor);
  const trash = (record, deleted = true) =>
    run("records.setDeleted", {
      id: record.id,
      expectedRevision: record.revision,
      deleted,
    });
  const r2 = run("resources.upsert", { url: "https://example.com/other" });
  const a2 = run("anchors.upsert", {
    resourceId: r2.id,
    quote: "Second context",
  });
  const n = run("notes.append", { anchorId: a.id, text: "Independent note" });
  const n2 = run("notes.append", { anchorId: a.id, text: "Inherited note" });
  const n3 = run("notes.append", {
    anchorId: a2.id,
    text: "Other resource note",
  });
  const capture = run("vocabulary.save", { anchorId: a.id, word: "context" });
  const elsewhere = run("vocabulary.save", {
    anchorId: a2.id,
    word: "context",
  });
  run("reviews.record", {
    vocabularyId: capture.vocabulary.id,
    rating: "good",
  });
  const v = run("records.get", { id: capture.vocabulary.id });
  const initialActivity = run("activity.list").total;
  const hiddenNote = trash(n);
  assert.equal(run("notes.list").total, 2);
  assert.equal(
    run("context.export", { anchorId: a.id }).context.notes.length,
    1,
  );
  assert.throws(
    () =>
      run("notes.update", {
        id: n.id,
        expectedRevision: hiddenNote.revision,
        text: "overwrite",
      }),
    { code: "DELETED" },
  );
  assert.equal(run("activity.list").total, initialActivity - 1);
  const hiddenResource = trash(r);
  assert.deepEqual(
    run("notes.list").items.map((n) => n.id),
    [n3.id],
  );
  assert.deepEqual(
    run("occurrences.list").items.map((o) => o.id),
    [elsewhere.occurrence.id],
  );
  assert.equal(
    run("vocabulary.list").total,
    1,
    "shared global word survives resource deletion",
  );
  assert.equal(run("stats").resource, 1);
  assert.equal(run("stats").note, 1);
  assert.equal(run("search", { query: "Inherited" }).total, 0);
  assert.equal(run("anchors.list", { resourceId: r.id }).total, 0);
  for (const [cmd, params] of [
    ["resources.upsert", { url: r.url }],
    [
      "resources.update",
      { id: r.id, expectedRevision: hiddenResource.revision, title: "again" },
    ],
    ["anchors.upsert", { resourceId: r.id, quote: "Again" }],
    ["notes.append", { anchorId: a.id, text: "Again" }],
    ["vocabulary.save", { anchorId: a.id, word: "new" }],
    ["context.export", { anchorId: a.id }],
    ["jobs.submit", { resourceId: r.id, type: "transcript" }],
  ])
    assert.throws(() => run(cmd, params), { code: "DELETED" });
  assert.throws(() => trash(hiddenNote, false), { code: "DELETED" });
  const hiddenWord = trash(v);
  assert.equal(run("occurrences.list").total, 0);
  assert.equal(run("reviews.list").total, 0);
  assert.equal(run("vocabulary.list", { due: true }).total, 0);
  assert.equal(run("stats").vocabulary, undefined);
  assert.throws(
    () => run("reviews.record", { vocabularyId: v.id, rating: "good" }),
    { code: "DELETED" },
  );
  assert.throws(
    () => run("vocabulary.save", { anchorId: a2.id, word: "context" }),
    { code: "DELETED" },
  );
  const first = run("trash.list", { limit: 2 });
  assert.equal(first.total, 3);
  assert.equal(run("trash.list", { offset: first.next }).items.length, 1);
  trash(hiddenWord, false);
  assert.equal(run("occurrences.list").total, 1);
  const restored = trash(hiddenResource, false);
  assert.equal(
    run("notes.list").total,
    2,
    "restoring a resource does not undo a direct note deletion",
  );
  assert.equal(run("records.get", { id: n2.id }).revision, n2.revision);
  assert.equal(restored.createdAt, r.createdAt);
  assert.deepEqual(restored.createdBy, r.createdBy);
  trash(hiddenNote, false);
  assert.equal(run("notes.list").total, 3);
  assert.equal(run("activity.list").total, initialActivity);
  assert.equal(run("trash.list").total, 0);
});

test("individual context deletion is audited, revision guarded, replayable and backup compatible", (t) => {
  const { s, r, a } = fixture(t);
  const run = (cmd, params = {}, actor = human) =>
    s.execute(cmd, params, actor);
  const { vocabulary: v, occurrence: o } = run("vocabulary.save", {
    anchorId: a.id,
    word: "context",
    meaning: "语境",
  });
  const params = {
    id: o.id,
    expectedRevision: o.revision,
    deleted: true,
    operationId: "delete-context",
  };
  const removed = run("records.setDeleted", params, agent);
  assert.deepEqual(run("records.setDeleted", params, agent), removed);
  assert.equal(removed.origin, o.origin);
  assert.deepEqual(removed.editedBy, agent);
  assert.equal(run("records.history", { id: o.id }).length, 2);
  assert.equal(run("occurrences.list").total, 0);
  assert.equal(run("vocabulary.list").total, 1);
  assert.throws(
    () => run("vocabulary.save", { anchorId: a.id, word: "context" }),
    { code: "DELETED" },
  );
  assert.throws(
    () =>
      run("occurrences.update", {
        id: o.id,
        expectedRevision: removed.revision,
        meaning: "x",
      }),
    { code: "DELETED" },
  );
  for (const p of [
    { ...params, id: a.id, operationId: "bad-kind" },
    { ...params, deleted: "yes", operationId: "bad-type" },
    { ...params, expectedRevision: 1, operationId: "stale" },
  ])
    assert.throws(() => run("records.setDeleted", p));
  const noop = run("records.setDeleted", {
    id: o.id,
    deleted: true,
    expectedRevision: removed.revision,
  });
  assert.equal(noop.revision, removed.revision);
  run("vocabulary.update", {
    id: v.id,
    expectedRevision: v.revision,
    word: "Context",
  });
  const updated = run("records.get", { id: o.id });
  assert.equal(updated.deleted, true);
  assert.equal(updated.word, "Context");
  const deletedResource = run("records.setDeleted", {
    id: r.id,
    expectedRevision: r.revision,
    deleted: true,
  });
  const backup = run("export");
  const dir = mkdtempSync(join(tmpdir(), "lc-trash-backup-"));
  const clone = openStore(join(dir, "db"));
  t.onTestFinished(() => {
    clone.close();
    rmSync(dir, { recursive: true, force: true });
  });
  clone.execute("backup.import", { data: backup });
  assert.equal(clone.execute("trash.list").total, 2);
  assert.equal(clone.execute("occurrences.list").total, 0);
  clone.execute("records.setDeleted", {
    id: r.id,
    expectedRevision: deletedResource.revision,
    deleted: false,
  });
  clone.execute("records.setDeleted", {
    id: o.id,
    expectedRevision: updated.revision,
    deleted: false,
  });
  assert.equal(clone.execute("occurrences.list").items[0].meaning, "语境");
  assert.equal(clone.execute("occurrences.list").items[0].anchorId, a.id);
});

test("resource deletion cancels queued work and rejects late completions without reviving captures", (t) => {
  const { s, r, a } = fixture(t);
  const run = (cmd, params = {}) => s.execute(cmd, params, human);
  const j = run("jobs.submit", { resourceId: r.id, type: "transcript" });
  run("jobs.claim");
  const q = run("jobs.submit", {
    resourceId: r.id,
    type: "lookup",
    anchorId: a.id,
    text: "context",
  });
  const r2 = run("resources.upsert", {
    url: "https://www.youtube.com/watch?v=ijklmnopqrs",
  });
  const other = run("jobs.submit", { resourceId: r2.id, type: "transcript" });
  const tombstone = run("records.setDeleted", {
    id: r.id,
    expectedRevision: r.revision,
    deleted: true,
  });
  for (const id of [j.id, q.id])
    assert.equal(run("records.get", { id }).status, "cancelled");
  assert.throws(
    () =>
      run("jobs.complete", {
        id: j.id,
        segments: [{ text: "Late", start: 1 }],
      }),
    { code: "DELETED" },
  );
  assert.equal(run("jobs.claim").id, other.id);
  assert.equal(run("jobs.claim"), null);
  run("records.setDeleted", {
    id: r.id,
    expectedRevision: tombstone.revision,
    deleted: false,
  });
  assert.equal(
    run("jobs.claim"),
    null,
    "restoring must not restart cancelled requests",
  );
  assert.equal(run("anchors.list", { resourceId: r.id }).total, 1);
});

test("explicit relayed user review counts as activity without changing agent provenance", (t) => {
  const { s } = fixture(t);
  const r = s.execute("resources.upsert", {
    url: "https://example.com/feedback",
  });
  const a = s.execute("anchors.upsert", { resourceId: r.id, quote: "context" });
  const v = s.execute("vocabulary.save", {
    anchorId: a.id,
    word: "context",
  }).vocabulary;
  expect(() =>
    s.execute("reviews.record", {
      vocabularyId: v.id,
      rating: "good",
      feedbackSource: "automatic",
    }),
  ).toThrow();
  const review = s.execute("reviews.record", {
    vocabularyId: v.id,
    rating: "good",
    feedbackSource: "user-confirmed",
  });
  expect(review.origin).toBe("agent");
  expect(s.execute("activity.list").items.map((x: any) => x.id)).toContain(
    review.id,
  );
});
