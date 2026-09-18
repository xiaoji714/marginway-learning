import { test } from "vitest";
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
