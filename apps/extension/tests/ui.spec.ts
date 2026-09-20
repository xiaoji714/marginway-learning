import { script } from "./support.js";
import { test } from "vitest";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../../packages/learning/core/src/store.js";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
test("selection card binds notes and copied discussion to original anchor and preserves text safely", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lc-ui-"));
  const store = openStore(join(dir, "db"));
  t.onTestFinished(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const human = { origin: "human", id: "chrome-ui", name: "用户" };
  const r = store.execute(
      "resources.upsert",
      { url: "https://example.com", title: "Resource" },
      human,
    ),
    a = store.execute(
      "anchors.upsert",
      {
        resourceId: r.id,
        quote: "context <script>unsafe()</script>",
        start: 20,
      },
      human,
    );
  const dom = new JSDOM("<body></body>", {
      url: "https://example.com",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let copied = "",
    paused = 0,
    resumed = 0;
  w.chrome = {
    runtime: {
      sendMessage: async (m) => {
        try {
          return {
            ok: true,
            result: store.execute(m.command, m.params, human),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
    },
  };
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });
  w.eval(script("common"));
  const card = w.LC.discussionCard({
    container: w.document.body,
    resource: r,
    anchor: a,
    selected: "context",
    pause: () => paused++,
    resume: () => resumed++,
  });
  assert.equal(paused, 1);
  assert.equal(card.querySelectorAll("script").length, 0);
  card.querySelector("textarea").value = "My thought";
  [...card.querySelectorAll("button")]
    .find((x) => x.textContent === "保存笔记")
    .click();
  await pause(10);
  const n = store.execute("notes.list").items[0];
  assert.equal(n.anchorId, a.id);
  assert.equal(n.text, "My thought");
  card.querySelector("textarea").value = "Explain why";
  [...card.querySelectorAll("button")]
    .find((x) => x.textContent === "在 Agent 中讨论")
    .click();
  await pause(10);
  assert.ok(copied.includes(a.id));
  assert.ok(copied.includes("Explain why"));
  assert.ok(copied.includes("context"));
  card.dispose();
  card.dispose();
  assert.equal(resumed, 1);
});
test("under-video captions follow playback, mount once and seek to captured node", async (t) => {
  const dom = new JSDOM('<body><div id="player"><video></video></div></body>', {
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  const callbacks = [],
    messages = [];
  const resource = {
    id: "r_test",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    title: "Test",
  };
  const anchors = [
    {
      id: "a_1",
      resourceId: resource.id,
      start: 0,
      end: 5,
      quote: "First sentence",
    },
    {
      id: "a_2",
      resourceId: resource.id,
      start: 5,
      end: 10,
      quote: "Second sentence",
    },
  ];
  w.setInterval = (fn) => {
    callbacks.push(fn);
    return callbacks.length;
  };
  w.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => messages.push(fn) },
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "resources.upsert"
            ? resource
            : {
                items: m.command === "anchors.list" ? anchors : [],
                next: null,
                total: anchors.length,
              },
      }),
    },
  };
  const video = w.document.querySelector("video");
  video.play = async () => {};
  video.pause = () => {};
  w.eval(script("common"));
  w.eval(script("page"));
  callbacks[0]();
  await pause(10);
  callbacks[0]();
  const host = w.document.getElementById("learning-companion-subtitles");
  assert.ok(host);
  assert.equal(
    host.shadowRoot.querySelector(".original").textContent,
    "First sentence",
  );
  video.currentTime = 6;
  callbacks[0]();
  assert.equal(
    host.shadowRoot.querySelector(".original").textContent,
    "Second sentence",
  );
  callbacks[0]();
  assert.equal(
    w.document.querySelectorAll("#learning-companion-subtitles").length,
    1,
  );
  messages[0](
    { lc: "seek", seconds: 0, resourceId: resource.id },
    {},
    () => {},
  );
  assert.equal(video.currentTime, 0);
  assert.equal(
    host.shadowRoot.querySelector(".original").textContent,
    "First sentence",
  );
});
test("resource detail survives database notifications and shows agent provenance", async (t) => {
  const dom = new JSDOM(
      '<body><input id="query"><div id="status"></div><div id="content"></div><button id="search"></button><button id="settings"></button><button id="export"></button><button data-view="resources.list"></button></body>',
      { url: "https://example.com", runScripts: "outside-only" },
    ),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let change;
  const r = {
      id: "r1",
      kind: "resource",
      title: "Resource",
      url: "https://example.com",
      tags: [],
    },
    a = { id: "a1", resourceId: "r1", quote: "Original context" },
    n = {
      id: "n1",
      kind: "note",
      anchorId: "a1",
      text: "Agent conclusion",
      origin: "agent",
      createdBy: { name: "Codex" },
    };
  w.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener: (fn) => (change = fn) } }),
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "records.get"
            ? m.params.id === "a1"
              ? a
              : r
            : {
                items:
                  m.command === "resources.list"
                    ? [r]
                    : m.command === "notes.list"
                      ? [n]
                      : [],
                next: null,
              },
      }),
    },
  };
  w.eval(script("common"));
  w.eval(script("library"));
  await pause(10);
  w.document.querySelector('[data-view="resources.list"]').click();
  await pause(10);
  [...w.document.querySelectorAll("button")]
    .find((b) => b.textContent === "查看资源记录")
    .click();
  await pause(10);
  change({ event: "changed" });
  await pause(400);
  assert.match(
    w.document.getElementById("content").textContent,
    /Agent conclusion/,
  );
  assert.match(
    w.document.getElementById("content").textContent,
    /Agent 生成 · Codex/,
  );
  assert.match(
    w.document.getElementById("content").textContent,
    /返回全部资源/,
  );
});
test("deferred mouse selection preserves shadow path and does not reopen an active card", async (t) => {
  const dom = new JSDOM("<body><p>Test word in context</p></body>", {
      url: "https://example.com/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let anchors = 0;
  w.setInterval = () => 0;
  w.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "resources.upsert"
            ? { id: "r", url: "https://example.com/" }
            : m.command === "anchors.upsert"
              ? (anchors++, { id: "a", resourceId: "r", quote: "word" })
              : {},
      }),
    },
  };
  w.eval(script("common"));
  w.eval(script("page"));
  w.getSelection = () => ({
    isCollapsed: false,
    toString: () => "word",
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 10, bottom: 10 }),
      commonAncestorContainer: w.document.querySelector("p").firstChild,
    }),
  });
  w.document
    .querySelector("p")
    .dispatchEvent(
      new w.MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
  await pause(40);
  const popup = [...w.document.documentElement.children].find(
    (x) => x.shadowRoot,
  );
  assert.ok(popup);
  const input = popup.shadowRoot.querySelector("textarea");
  input.value = "keep draft";
  input.dispatchEvent(
    new w.MouseEvent("mouseup", { bubbles: true, composed: true }),
  );
  await pause(40);
  assert.equal(anchors, 1);
  assert.equal(popup.isConnected, true);
  assert.equal(input.value, "keep draft");
  const close = [...popup.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent === "关闭",
  );
  close.dispatchEvent(
    new w.MouseEvent("mouseup", { bubbles: true, composed: true }),
  );
  close.click();
  await pause(50);
  assert.equal(
    [...w.document.documentElement.children].filter((x) => x.shadowRoot).length,
    0,
    "one click must close without the delayed mouseup reopening it",
  );
  assert.equal(anchors, 1);
  w.document
    .querySelector("p")
    .dispatchEvent(
      new w.MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
  await pause(40);
  assert.equal(
    [...w.document.documentElement.children].filter((x) => x.shadowRoot).length,
    1,
    "a new selection can still open a card",
  );
});
test("default bilingual captions keep one stable node through translation notifications", async (t) => {
  const dom = new JSDOM('<body><div id="player"><video></video></div></body>', {
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let tick, onMessage;
  const requests = [];
  let translated = false;
  const r = { id: "r", url: w.location.href },
    a = { id: "a", resourceId: "r", quote: "Hello", start: 0, end: 10 };
  w.setInterval = (fn) => (tick = fn);
  w.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => (onMessage = fn) },
      sendMessage: async (m) => {
        requests.push(m);
        return {
          ok: true,
          result:
            m.command === "resources.upsert"
              ? r
              : m.command === "jobs.submit"
                ? { id: "j" }
                : m.command === "jobs.get"
                  ? { status: "done" }
                  : {
                      items:
                        m.command === "anchors.list"
                          ? [a]
                          : translated
                            ? [{ anchorId: "a", text: "你好" }]
                            : [],
                      next: null,
                    },
        };
      },
    },
  };
  w.eval(script("common"));
  w.eval(script("page"));
  tick();
  await pause(30);
  const host = w.document.getElementById("learning-companion-subtitles"),
    source = host.shadowRoot.querySelector(".original");
  assert.ok(
    requests.some(
      (m) => m.command === "jobs.submit" && m.params.type === "translate",
    ),
  );
  assert.equal(host.shadowRoot.textContent.includes("开启双语"), false);
  assert.equal(
    w.document.documentElement.hasAttribute("data-lc-captions"),
    true,
  );
  translated = true;
  onMessage({ event: "changed" }, {}, () => {});
  await pause(20);
  assert.equal(host.shadowRoot.querySelector(".original"), source);
  assert.equal(
    host.shadowRoot.querySelector(".translated").textContent,
    "你好",
  );
  onMessage({ event: "changed" }, {}, () => {});
  await pause(20);
  assert.equal(host.shadowRoot.querySelector(".original"), source);
  assert.equal(
    w.document.querySelectorAll("#learning-companion-subtitles").length,
    1,
  );
});
test("follow button immediately locates a paused current caption and panel loads automatically", async (t) => {
  const dom = new JSDOM(readFileSync("apps/extension/lib/panel.html", "utf8"), {
      url: "https://example.com/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  const r = { id: "r", type: "video", title: "Video" },
    anchors = [{ id: "a", start: 0, quote: "Hello" }];
  let scrolls = 0;
  const submissions = [];
  w.HTMLElement.prototype.scrollIntoView = function () {
    scrolls++;
  };
  w.scrollTo = () => {};
  w.setInterval = () => 0;
  w.chrome = {
    tabs: {
      query: async () => [
        { id: 1, url: "https://www.youtube.com/watch?v=abcdefghijk" },
      ],
      sendMessage: async () => ({ seconds: 1 }),
    },
    runtime: {
      connect: () => ({ onMessage: { addListener() {} } }),
      sendMessage: async (m) => {
        let result = {};
        if (m.command === "resources.upsert") result = r;
        else if (m.command?.endsWith(".list"))
          result = {
            items: m.command === "anchors.list" ? anchors : [],
            total: m.command === "anchors.list" ? 1 : 0,
            next: null,
          };
        else if (m.command === "jobs.submit") {
          submissions.push(m.params);
          result = { id: "j" };
        }
        return { ok: true, result };
      },
    },
  };
  w.eval(script("common"));
  w.eval(script("panel"));
  await pause(30);
  assert.equal(w.document.getElementById("load").hidden, true);
  assert.equal(w.document.getElementById("translate"), null);
  assert.ok(submissions.some((p) => p.type === "translate"));
  assert.equal(scrolls, 1);
  w.dispatchEvent(new w.Event("wheel"));
  w.document.getElementById("follow").click();
  await pause(20);
  assert.equal(
    scrolls,
    2,
    "paused caption must scroll even when already marked active",
  );
  assert.match(w.document.getElementById("status").textContent, /全文翻译中/);
});
test("review conceals the word and ratings until answer reveal, and feedback is explicit", async (t) => {
  const dom = new JSDOM(
      readFileSync("apps/extension/lib/library.html", "utf8"),
      { url: "https://example.com", runScripts: "outside-only" },
    ),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let reviews = 0;
  const v = {
      id: "v1",
      kind: "vocabulary",
      word: "Context",
      revision: 1,
      origin: "human",
    },
    a = { id: "a1", quote: "Context builds CONTEXT.", resourceId: "r1" },
    r = { id: "r1", url: "https://example.com", title: "Source" };
  w.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener() {} } }),
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "reviews.record"
            ? (reviews++, {})
            : m.command === "records.get"
              ? m.params.id === "a1"
                ? a
                : r
              : {
                  items:
                    m.command === "vocabulary.list"
                      ? [v]
                      : m.command === "occurrences.list"
                        ? [{ anchorId: "a1", meaning: "语境" }]
                        : [],
                  next: null,
                },
      }),
    },
  };
  w.eval(script("common"));
  w.eval(script("library"));
  await pause(10);
  w.document.querySelector('[data-view="review"]').click();
  await pause(10);
  assert.equal(
    w.document.querySelector(".quote").textContent,
    "_____ builds _____.",
  );
  assert.equal(w.document.querySelector(".review-answer").hidden, true);
  assert.equal(w.document.querySelector(".review-rating").hidden, true);
  assert.equal(reviews, 0);
  [...w.document.querySelectorAll("button")]
    .find((b) => b.textContent === "显示答案")
    .click();
  assert.equal(w.document.querySelector(".quote").textContent, a.quote);
  assert.equal(w.document.querySelector(".review-answer").hidden, false);
  assert.equal(w.document.querySelector(".review-rating").hidden, false);
  assert.equal(reviews, 0);
});
test("late stats response cannot overwrite another library tab", async (t) => {
  const dom = new JSDOM(
      readFileSync("apps/extension/lib/library.html", "utf8"),
      { url: "https://example.com", runScripts: "outside-only" },
    ),
    w = dom.window;
  t.onTestFinished(() => w.close());
  let resolveStats;
  w.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener() {} } }),
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "stats"
            ? await new Promise((r) => (resolveStats = r))
            : { items: [], next: null },
      }),
    },
  };
  w.eval(script("common"));
  w.eval(script("library"));
  await pause(10);
  w.document.querySelector('[data-view="stats"]').click();
  await pause(10);
  w.document.querySelector('[data-view="notes.list"]').click();
  await pause(10);
  resolveStats({ note: 99 });
  await pause(10);
  assert.equal(w.document.querySelector(".stats-grid"), null);
  assert.match(w.document.getElementById("content").textContent, /第一条笔记/);
});
test("selection popup stays within short viewport and releases resize handling on close", async (t) => {
  const dom = new JSDOM("<body><p>word in context</p></body>", {
      url: "https://example.com",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  w.setInterval = () => 0;
  Object.defineProperty(w, "innerHeight", { value: 600, writable: true });
  const rect = { height: 480, left: 10, bottom: 560 };
  w.HTMLElement.prototype.getBoundingClientRect = () => rect;
  w.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async (m) => ({
        ok: true,
        result:
          m.command === "resources.upsert"
            ? { id: "r", url: w.location.href }
            : { id: "a", quote: "word", resourceId: "r" },
      }),
    },
  };
  w.getSelection = () => ({
    isCollapsed: false,
    toString: () => "word",
    removeAllRanges() {},
    getRangeAt: () => ({
      getBoundingClientRect: () => rect,
      commonAncestorContainer: w.document.querySelector("p").firstChild,
    }),
  });
  w.eval(script("common"));
  w.eval(script("page"));
  w.document
    .querySelector("p")
    .dispatchEvent(
      new w.MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
  await pause(40);
  const popup = [...w.document.documentElement.children].find(
    (x) => x.shadowRoot,
  );
  assert.equal(popup.style.top, "108px");
  w.innerHeight = 540;
  w.dispatchEvent(new w.Event("resize"));
  assert.equal(popup.style.top, "48px");
  [...popup.shadowRoot.querySelectorAll("button")]
    .find((b) => b.textContent === "关闭")
    .click();
  assert.equal(popup.isConnected, false);
  w.dispatchEvent(new w.Event("resize"));
});
test("card freezes selected word and context; only the thought is editable", async (t) => {
  const dom = new JSDOM("<body></body>", {
      url: "https://example.com",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.onTestFinished(() => w.close());
  const writes = [];
  w.chrome = {
    runtime: {
      sendMessage: async (m) => {
        writes.push(m);
        return {
          ok: true,
          result:
            m.command === "jobs.submit"
              ? { id: "j" }
              : m.command === "jobs.get"
                ? { status: "done", result: "语境" }
                : {},
        };
      },
    },
  };
  w.eval(script("common"));
  const args = {
    container: w.document.body,
    resource: { id: "r", title: "Video" },
    anchor: {
      id: "a",
      quote: "The context is a complete sentence.",
      start: 30,
    },
  };
  const card = w.LC.discussionCard({ ...args, selected: "context" });
  await pause(10);
  assert.equal(card.querySelectorAll("input").length, 0);
  assert.equal(card.querySelectorAll("textarea").length, 1);
  assert.equal(
    card.querySelector("textarea").getAttribute("aria-label"),
    "我的笔记",
  );
  assert.equal(
    [...card.querySelectorAll("button")].some((b) =>
      /修改|翻译/.test(b.textContent),
    ),
    false,
  );
  const quote = card.querySelector(".lc-quote");
  quote.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  [...card.querySelectorAll("button")]
    .find((b) => b.textContent === "收藏单词")
    .click();
  await pause(10);
  const saves = writes.filter((m) => m.command === "vocabulary.save");
  assert.equal(saves[0].params.word, "context");
  assert.equal(saves[0].params.anchorId, "a");
  assert.equal(writes.filter((m) => m.command === "jobs.submit").length, 1);
  card.dispose();
  const note = w.LC.discussionCard({ ...args, selected: "" });
  await pause(10);
  assert.equal(note.querySelector(".lc-word-section").hidden, true);
  assert.equal(writes.filter((m) => m.command === "jobs.submit").length, 1);
  note.dispose();
});

test("selection card expresses saved state on the button and removes duplicate context metadata", async (t) => {
  const dom = new JSDOM("<body></body>", {
    url: "https://example.com",
    runScripts: "outside-only",
  });
  const w = dom.window;
  t.onTestFinished(() => w.close());
  let saved = false,
    failSave = true,
    saves = 0;
  w.chrome = {
    runtime: {
      sendMessage: async (m) => {
        if (m.command === "vocabulary.save") {
          saves++;
          assert.equal(m.params.anchorId, "anchor");
          assert.equal(m.params.word, "penalty");
          if (failSave) return { ok: false, error: "保存失败，请重试" };
          saved = true;
        }
        return {
          ok: true,
          result:
            m.command === "occurrences.list"
              ? {
                  items: saved ? [{ anchorId: "anchor", word: "penalty" }] : [],
                  next: null,
                }
              : m.command === "jobs.submit"
                ? { id: "job" }
                : m.command === "jobs.get"
                  ? {
                      status: "done",
                      result: "代价、性能损失\n译文：重复的整句翻译",
                    }
                  : {},
        };
      },
    },
  };
  w.eval(script("common"));
  const args = {
    container: w.document.body,
    resource: {
      id: "resource",
      title: "Do not repeat this video title",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
    anchor: { id: "anchor", quote: "A parallelization penalty.", start: 189 },
    selected: "penalty",
    translation: "并行化的代价。",
  };
  let card = w.LC.discussionCard(args);
  await pause(20);
  assert.equal(
    card.querySelector(".lc-definition").textContent,
    "代价、性能损失",
  );
  assert.equal(card.textContent.includes("重复的整句翻译"), false);
  assert.equal(card.textContent.includes(args.resource.title), false);
  assert.equal(
    card.querySelector(".lc-translation").textContent,
    args.translation,
  );
  assert.equal(card.querySelector(".lc-context-head a").textContent, "3:09");
  assert.match(card.querySelector(".lc-context-head a").href, /t=189/);
  const collect = card.querySelector(".lc-word-actions button");
  collect.click();
  await pause(10);
  assert.equal(collect.disabled, false);
  assert.equal(collect.textContent, "收藏单词");
  assert.equal(
    card.querySelector(".lc-status").textContent,
    "保存失败，请重试",
  );
  failSave = false;
  collect.click();
  await pause(10);
  assert.equal(collect.textContent, "✓已收藏");
  assert.equal(collect.disabled, true);
  assert.equal(card.querySelector(".lc-status").textContent, "");
  collect.click();
  await pause(10);
  assert.equal(saves, 2);
  card.dispose();
  card = w.LC.discussionCard(args);
  await pause(20);
  assert.equal(
    card.querySelector(".lc-word-actions button").textContent,
    "✓已收藏",
  );
  card.dispose();
  card = w.LC.discussionCard({
    ...args,
    anchor: { id: "other", quote: "A different penalty." },
  });
  await pause(20);
  assert.equal(
    card.querySelector(".lc-word-actions button").textContent,
    "收藏单词",
  );
  assert.equal(card.querySelector(".lc-source"), null);
  card.dispose();
});

test("learning heatmap uses 365 local calendar days, paginated records and clickable day counts", async (t) => {
  const dom = new JSDOM(
    readFileSync("apps/extension/lib/library.html", "utf8"),
    { url: "https://example.com", runScripts: "outside-only" },
  );
  const w = dom.window;
  t.onTestFinished(() => w.close());
  w.Date = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : [2024, 2, 1, 12]));
    }
  };
  const events = [
    ...["note", "review", "occurrence"].map((kind) => ({
      kind,
      createdAt: "2024-03-01T00:30:00",
    })),
    ...Array.from({ length: 10 }, () => ({
      kind: "review",
      createdAt: "2024-02-29T23:30:00",
    })),
    { kind: "note", createdAt: "2025-01-01" },
    { kind: "note", createdAt: "2022-01-01" },
    { kind: "note", createdAt: "invalid" },
  ];
  const offsets = [];
  w.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener() {} } }),
      sendMessage: async (m) => {
        if (m.command === "activity.list") offsets.push(m.params.offset);
        return {
          ok: true,
          result:
            m.command === "stats"
              ? { note: 1 }
              : m.command === "activity.list"
                ? {
                    items:
                      m.params.offset === 0
                        ? events.slice(0, 3)
                        : events.slice(3),
                    next: m.params.offset === 0 ? 200 : null,
                  }
                : { items: [], next: null },
        };
      },
    },
  };
  w.eval(script("common"));
  w.eval(script("library"));
  await pause(10);
  await pause(20);
  assert.equal(w.document.querySelector("[data-view]").dataset.view, "stats");
  assert.equal(
    w.document
      .querySelector('[data-view="stats"]')
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(w.document.getElementById("view-title").textContent, "学习统计");
  const cells = [...w.document.querySelectorAll(".activity-day")];
  assert.equal(cells.length, 365);
  assert.equal(new Set(cells.map((x) => x.dataset.date)).size, 365);
  assert.equal(cells.at(-1).dataset.date, "2024-03-01");
  assert.deepEqual(offsets, [0, 200]);
  const today = cells.at(-1);
  assert.equal(today.dataset.level, "2");
  today.click();
  assert.match(
    w.document.querySelector(".activity-detail").textContent,
    /收藏词句 1 · 笔记 1 · 复习 1/,
  );
  assert.equal(
    w.document.querySelector('[data-date="2024-02-29"]').dataset.level,
    "4",
  );
  assert.match(
    w.document.querySelector(".activity-section").textContent,
    /13 条记录 · 2 个活跃日/,
  );
  cells[0].click();
  assert.equal(today.getAttribute("aria-pressed"), "false");
  assert.match(
    w.document.querySelector(".activity-detail").textContent,
    /收藏词句 0 · 笔记 0 · 复习 0/,
  );
});

test("YouTube homepage with stale video title is not auto-registered by page polling or sidebar", async (t) => {
  for (const entry of ["page", "panel"]) {
    const dom = new JSDOM(
      entry === "panel"
        ? readFileSync("apps/extension/lib/panel.html", "utf8")
        : "<title>Old video title</title><body></body>",
      { url: "https://www.youtube.com/", runScripts: "outside-only" },
    );
    const w = dom.window;
    t.onTestFinished(() => w.close());
    let tick;
    const requests = [];
    w.setInterval = (fn) => (tick = fn);
    w.chrome = {
      runtime: {
        connect: () => ({ onMessage: { addListener() {} } }),
        onMessage: { addListener() {} },
        sendMessage: async (m) => {
          requests.push(m);
          return { ok: true, result: { items: [], next: null } };
        },
      },
      tabs: {
        query: async () => [
          { id: 1, url: w.location.href, title: "Old video title" },
        ],
      },
    };
    w.eval(script("common"));
    w.eval(script(entry));
    await pause(10);
    await tick();
    await pause(10);
    assert.equal(
      requests.some((m) => m.command === "resources.upsert"),
      false,
      entry,
    );
    if (entry === "panel")
      assert.match(
        w.document.getElementById("status").textContent,
        /不会自动加入/,
      );
  }
});

test("late video registration cannot overwrite sidebar after navigation to YouTube home", async (t) => {
  const dom = new JSDOM(readFileSync("apps/extension/lib/panel.html", "utf8"), {
    url: "https://example.com",
    runScripts: "outside-only",
  });
  const w = dom.window;
  t.onTestFinished(() => w.close());
  let tick, finish;
  let url = "https://www.youtube.com/watch?v=abcdefghijk";
  const requests = [];
  w.setInterval = (fn) => (tick = fn);
  w.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener() {} } }),
      sendMessage: async (m) => {
        requests.push(m);
        return {
          ok: true,
          result:
            m.command === "resources.upsert"
              ? await new Promise((r) => (finish = r))
              : { items: [], next: null },
        };
      },
    },
    tabs: { query: async () => [{ id: 1, url, title: "Video title" }] },
  };
  w.eval(script("common"));
  w.eval(script("panel"));
  await pause(10);
  url = "https://www.youtube.com/";
  await tick();
  finish({
    id: "r",
    type: "video",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    title: "Old title",
  });
  await pause(10);
  assert.match(
    w.document.getElementById("title").textContent,
    /打开一个 YouTube 视频/,
  );
  assert.equal(
    requests.filter((m) => m.command === "resources.upsert").length,
    1,
  );
  assert.equal(
    requests.some((m) => m.command === "jobs.submit"),
    false,
  );
  assert.equal(w.document.getElementById("translation-progress").hidden, true);
});
