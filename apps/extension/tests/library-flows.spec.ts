import { test, expect, onTestFinished } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../../../packages/learning/core/src/store.js";
import { evaluate } from "./support.js";
const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "marginway-library-flow-"));
  const store = openStore(join(dir, "learning.sqlite"));
  const w = new JSDOM(
    readFileSync("apps/extension/public/library.html", "utf8"),
    { url: "https://example.com/", runScripts: "outside-only" },
  ).window as any;
  onTestFinished(() => {
    w.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const actor = { origin: "human", id: "chrome-ui", name: "Fixture" };
  const execute = (cmd: string, p: object = {}) => store.execute(cmd, p, actor);
  let fail = "";
  let notify: any;
  const messages: any[] = [];
  const exports: any[] = [];
  let revoked = "";
  w.URL.createObjectURL = (blob: any) => {
    exports.push(blob);
    return "blob:test";
  };
  w.URL.revokeObjectURL = (s: string) => (revoked = s);
  w.HTMLAnchorElement.prototype.click = function () {
    exports.push(this.download);
  };
  const timer = w.setTimeout.bind(w);
  w.setTimeout = (fn: any, ms: number) =>
    timer(fn, ms === 1000 || ms === 350 ? 0 : ms);
  w.document.execCommand = () => false;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.dispatchEvent(new w.Event("close"));
  };
  w.chrome = {
    runtime: {
      connect: () => ({
        onMessage: {
          addListener(fn: any) {
            notify = fn;
          },
        },
      }),
      sendMessage: async (m: any) => {
        messages.push(m);
        if (m.command === fail)
          return { ok: false, error: "simulated failure" };
        try {
          return {
            ok: true,
            result: m.command ? execute(m.command, m.params) : {},
          };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      },
    },
  };
  evaluate(w, "common");
  evaluate(w, "library");
  return {
    w,
    store,
    execute,
    messages,
    exports,
    revoked: () => revoked,
    fail: (s: string) => (fail = s),
    notify: () => notify({ event: "changed" }),
  };
}
function click(w: any, text: string) {
  const b = Array.from(w.document.querySelectorAll("button")).find(
    (b: any) => b.textContent === text,
  ) as HTMLButtonElement;
  expect(b).toBeTruthy();
  b.click();
}

test("library search handles Enter/empty results, exports a backup and reports IO failure", async () => {
  const f = fixture();
  await tick();
  const r = f.execute("resources.upsert", {
    url: "https://example.com/read",
    title: "Source",
  });
  const a = f.execute("anchors.upsert", {
    resourceId: r.id,
    quote: "A distinctive excerpt",
  });
  f.execute("notes.append", { anchorId: a.id, text: "A distinctive thought" });
  f.execute("discussions.create", {
    anchorId: a.id,
    question: "A distinctive question",
  });
  const query = f.w.document.querySelector("#query");
  query.value = "distinctive";
  query.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Enter" }));
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "原文摘录",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "distinctive question",
  );
  click(f.w, "在 Agent 中讨论");
  await tick();
  expect(f.w.document.querySelector("#status").textContent).toContain(
    "请手动复制",
  );
  query.value = "missingxyz";
  query.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Escape" }));
  click(f.w, "搜索");
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "没有找到",
  );
  click(f.w, "设置");
  expect(f.messages.some((m) => m.lc === "options")).toBe(true);
  click(f.w, "备份导出");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#status").textContent).toBe("备份已导出");
  expect(f.exports[1]).toMatch(/^marginway-learning-.*\.json$/);
  expect(f.revoked()).toBe("blob:test");
  f.fail("export");
  click(f.w, "备份导出");
  await tick();
  expect(f.w.document.querySelector("#status").textContent).toBe(
    "simulated failure",
  );
});

test("review errors re-enable rating buttons, success updates scheduling", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://example.com/review",
  });
  const a = f.execute("anchors.upsert", {
    resourceId: r.id,
    quote: "A context",
  });
  const v = f.execute("vocabulary.save", {
    anchorId: a.id,
    word: "context",
  }).vocabulary;
  await tick();
  click(f.w, "今日复习");
  await tick();
  await tick();
  click(f.w, "显示答案");
  f.fail("reviews.record");
  click(f.w, "有点难");
  await tick();
  expect(f.w.document.querySelector("#status").textContent).toContain(
    "simulated failure",
  );
  expect(
    Array.from(f.w.document.querySelectorAll(".review-rating button")).every(
      (b: any) => !b.disabled,
    ),
  ).toBe(true);
  f.fail("");
  click(f.w, "记住了");
  await tick();
  await tick();
  expect(f.execute("vocabulary.list", { due: true }).items).toHaveLength(0);
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "今天的复习已完成",
  );
});

test("job cancellation reports failure then succeeds and retains history", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://www.youtube.com/watch?v=abcdef12345",
  });
  const j = f.execute("jobs.submit", { type: "transcript", resourceId: r.id });
  await tick();
  click(f.w, "任务状态");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "正在排队",
  );
  f.fail("jobs.cancel");
  click(f.w, "取消任务");
  await tick();
  expect(f.execute("jobs.get", { id: j.id }).status).toBe("queued");
  f.fail("");
  click(f.w, "取消任务");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "本次任务已停止",
  );
  expect(f.execute("jobs.get", { id: j.id }).status).toBe("cancelled");
});

test("resource editing cancellation, duplicate submit and failed save preserve draft", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://example.com/",
    title: "Original",
  });
  await tick();
  click(f.w, "全部资源");
  await tick();
  await tick();
  click(f.w, "编辑资源");
  let dialog = f.w.document.querySelector("dialog");
  expect(dialog.open).toBe(true);
  click(f.w, "取消");
  expect(dialog.isConnected).toBe(false);
  click(f.w, "编辑资源");
  dialog = f.w.document.querySelector("dialog");
  const form = dialog.querySelector("form");
  const input = dialog.querySelector("input");
  input.value = "";
  form.dispatchEvent(new f.w.Event("submit", { cancelable: true }));
  await tick();
  expect(dialog.textContent).toContain("必填内容不能为空");
  input.value = "New title";
  let resume: any;
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = (m: any) =>
    m.command === "resources.update"
      ? new Promise(
          (resolve) =>
            (resume = () => resolve({ ok: false, error: "conflict" })),
        )
      : original(m);
  form.dispatchEvent(new f.w.Event("submit", { cancelable: true }));
  form.dispatchEvent(new f.w.Event("submit", { cancelable: true }));
  const cancelled = new f.w.Event("cancel", { cancelable: true });
  dialog.dispatchEvent(cancelled);
  expect(cancelled.defaultPrevented).toBe(true);
  resume();
  await tick();
  expect(input.value).toBe("New title");
  expect(dialog.textContent).toContain("内容已保留");
  const freeCancel = new f.w.Event("cancel", { cancelable: true });
  dialog.dispatchEvent(freeCancel);
  expect(freeCancel.defaultPrevented).toBe(false);
  expect(f.execute("records.get", { id: r.id }).title).toBe("Original");
});

test("timed source links, missing legacy provenance and task states render readable fallbacks", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://www.youtube.com/watch?v=abcdef12345",
    title: "Video",
  });
  const a = f.execute("anchors.upsert", {
    resourceId: r.id,
    start: 12,
    quote: "Timed source",
  });
  const n = f.execute("notes.append", { anchorId: a.id, text: "Legacy note" });
  await tick();
  const original = f.w.chrome.runtime.sendMessage;
  const variants = [
    {
      ...n,
      origin: "agent",
      createdBy: { name: "Model", model: "actual-model" },
    },
    {
      ...n,
      id: "unknown",
      origin: "agent",
      createdBy: { model: "unknown" },
      updatedAt: "invalid",
    },
    {
      ...n,
      id: "source",
      origin: "source",
      updatedAt: null,
      createdAt: "2024-01-01",
    },
  ];
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "notes.list"
      ? { ok: true, result: { items: variants, next: null } }
      : original(m);
  click(f.w, "思考笔记");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "actual-model",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "身份未提供",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "来源资料",
  );
  expect(f.w.document.querySelector(".source-link").href).toContain("t=12");
  const jobs = [
    {
      id: "j1",
      kind: "job",
      type: "unknown",
      status: "unknown",
      createdAt: "invalid",
    },
    {
      id: "j2",
      kind: "job",
      type: "lookup",
      status: "running",
      resourceId: "missing",
      createdAt: "invalid",
      anchorIds: [],
    },
    {
      id: "j3",
      kind: "job",
      type: "lookup",
      status: "error",
      error: "Provider failed",
      createdAt: "invalid",
    },
  ];
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "jobs.list"
      ? { ok: true, result: { items: jobs, next: null } }
      : original(m);
  click(f.w, "任务状态");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "学习任务",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "正在处理",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "Provider failed",
  );
});

test("resource details stay current across empty records, deletion and late list responses", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://example.com/",
    title: "Empty resource",
  });
  await tick();
  click(f.w, "全部资源");
  await tick();
  click(f.w, "查看资源记录");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "还没有学习记录",
  );
  f.execute("records.setDeleted", {
    id: r.id,
    expectedRevision: r.revision,
    deleted: true,
    operationId: "remove",
  });
  f.notify();
  await tick();
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "还没有学习资源",
  );
  const original = f.w.chrome.runtime.sendMessage;
  let release: any;
  f.w.chrome.runtime.sendMessage = (m: any) =>
    m.command === "resources.list"
      ? new Promise(
          (resolve) =>
            (release = () =>
              resolve({ ok: true, result: { items: [], next: null } })),
        )
      : original(m);
  click(f.w, "全部资源");
  click(f.w, "思考笔记");
  await tick();
  release();
  await tick();
  expect(f.w.document.querySelector("#breadcrumbs").textContent).toContain(
    "思考笔记",
  );
  f.w.document.querySelector("#breadcrumbs").remove();
  click(f.w, "单词簿");
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "从遇见一个词开始",
  );
});

test("unchanged list notifications preserve DOM, medium activity level and empty job state", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", { url: "https://example.com/" });
  const a = f.execute("anchors.upsert", { resourceId: r.id, quote: "Context" });
  for (let i = 0; i < 7; i++)
    f.execute("notes.append", { anchorId: a.id, text: `Thought ${i}` });
  await tick();
  click(f.w, "学习统计");
  await tick();
  expect(
    f.w.document.querySelectorAll('.activity-day[data-level="3"]'),
  ).toHaveLength(1);
  click(f.w, "全部资源");
  await tick();
  const card = f.w.document.querySelector("article");
  f.notify();
  await tick();
  await tick();
  expect(f.w.document.querySelector("article")).toBe(card);
  click(f.w, "任务状态");
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "当前没有任务",
  );
});

test("legacy empty fields and video resources retain editing and deletion actions", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://www.youtube.com/watch?v=abcdef12345",
    title: "Video",
  });
  const a = f.execute("anchors.upsert", { resourceId: r.id, quote: "Context" });
  const saved = f.execute("vocabulary.save", {
    anchorId: a.id,
    word: "context",
  });
  await tick();
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = async (m: any) => {
    const reply = await original(m);
    if (m.command === "resources.list")
      reply.result.items = reply.result.items.map((x: any) => ({
        ...x,
        tags: undefined,
      }));
    return reply;
  };
  click(f.w, "全部资源");
  await tick();
  expect(f.w.document.querySelector(".badge").textContent).toBe("视频");
  click(f.w, "编辑资源");
  expect(f.w.document.querySelectorAll("dialog input")[1].value).toBe("");
  click(f.w, "取消");
  click(f.w, "查看资源记录");
  await tick();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "尚未保存释义",
  );
  click(f.w, "编辑释义");
  expect(f.w.document.querySelector("dialog textarea").value).toBe("");
  click(f.w, "取消");
  f.fail("records.get");
  click(f.w, "编辑单词");
  await tick();
  expect(f.w.document.querySelector("#status").textContent).toBe(
    "simulated failure",
  );
  f.fail("");
  click(f.w, "单词簿");
  await tick();
  await tick();
  click(f.w, "编辑单词");
  expect(f.w.document.querySelector("dialog input").value).toBe("context");
  click(f.w, "取消");
  const blank = {
    ...saved.occurrence,
    kind: "occurrence",
    word: "",
    text: "",
    title: "",
  };
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "trash.list"
      ? { ok: true, result: { items: [blank], next: null } }
      : original(m);
  click(f.w, "回收站");
  await tick();
  click(f.w, "恢复");
  expect(f.w.document.querySelector("dialog").textContent).toContain(
    "恢复这处语境",
  );
});

test("completed job summaries and generic search records have readable fallback content", async () => {
  const f = fixture();
  await tick();
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "jobs.list"
      ? {
          ok: true,
          result: {
            items: [
              {
                id: "done",
                kind: "job",
                type: "translate",
                status: "done",
                anchorIds: ["a"],
                createdAt: "2026-09-21",
              },
            ],
            next: null,
          },
        }
      : m.command === "search"
        ? {
            ok: true,
            result: {
              items: [
                { id: "one", kind: "discussion", word: "word" },
                { id: "two", kind: "discussion", text: "text" },
                { id: "three", kind: "discussion" },
              ],
              next: null,
            },
          }
        : original(m);
  click(f.w, "任务状态");
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "1 段原文",
  );
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "结果已保存在资料库",
  );
  click(f.w, "搜索");
  await tick();
  for (const text of ["word", "text", "three"])
    expect(f.w.document.querySelector("#content").textContent).toContain(text);
});

test("late record details cannot overwrite a newer list or resource view", async () => {
  const f = fixture();
  const r = f.execute("resources.upsert", {
    url: "https://example.com/",
    title: "Source",
  });
  const a = f.execute("anchors.upsert", { resourceId: r.id, quote: "Context" });
  f.execute("notes.append", { anchorId: a.id, text: "Thought" });
  await tick();
  const original = f.w.chrome.runtime.sendMessage;
  let release: any;
  const delay = (id: string) => {
    release = undefined;
    f.w.chrome.runtime.sendMessage = (m: any) =>
      m.command === "records.get" && m.params.id === id
        ? new Promise(
            (resolve) => (release = async () => resolve(await original(m))),
          )
        : original(m);
  };
  delay(a.id);
  click(f.w, "思考笔记");
  await expect.poll(() => !!release).toBe(true);
  click(f.w, "单词簿");
  await tick();
  await release();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "从遇见一个词开始",
  );
  f.w.chrome.runtime.sendMessage = original;
  click(f.w, "全部资源");
  await tick();
  delay(r.id);
  click(f.w, "查看资源记录");
  await expect.poll(() => !!release).toBe(true);
  click(f.w, "单词簿");
  await tick();
  await release();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "从遇见一个词开始",
  );
  f.w.chrome.runtime.sendMessage = original;
  click(f.w, "全部资源");
  await tick();
  delay(a.id);
  click(f.w, "查看资源记录");
  await expect.poll(() => !!release).toBe(true);
  click(f.w, "单词簿");
  await tick();
  await release();
  await tick();
  expect(f.w.document.querySelector("#content").textContent).toContain(
    "从遇见一个词开始",
  );
});
