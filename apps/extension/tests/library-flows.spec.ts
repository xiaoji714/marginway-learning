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
