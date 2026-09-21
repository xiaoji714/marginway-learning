import { test, expect, onTestFinished } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { evaluate } from "./support.js";
const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture({
  url = "https://www.youtube.com/watch?v=abcdef12345",
  anchors = [
    { id: "a", start: 0, quote: "Context matters" },
    { id: "b", start: 10, quote: "Second context" },
  ],
  denied = false,
}: { url?: string; anchors?: any[]; denied?: boolean } = {}) {
  const w = new JSDOM(
    readFileSync("apps/extension/public/panel.html", "utf8"),
    { url: "https://example.com/", runScripts: "outside-only" },
  ).window as any;
  onTestFinished(() => w.close());
  let interval: any, changed: any;
  const messages: any[] = [];
  let active: any = { id: 1, url, title: "Fixture" };
  let notes: any[] = [
    {
      anchorId: "a",
      origin: "agent",
      text: "Agent thought",
      createdBy: { name: "Test Agent" },
      revision: 2,
    },
    { anchorId: "b", origin: "human", text: "My thought", revision: 1 },
  ];
  let translations: any[] = [{ anchorId: "a", text: "语境很重要" }];
  let occurrences: any[] = [{ anchorId: "a" }];
  const real = w.setTimeout.bind(w);
  w.setTimeout = (fn: any, ms: number) =>
    real(fn, ms === 300 || ms === 750 ? 0 : ms);
  w.setInterval = (fn: any) => {
    interval = fn;
    return 1;
  };
  let scrolls = 0;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => scrolls++;
  const chrome: any = {
    tabs: {
      query: async () => (active ? [active] : []),
      sendMessage: async () => ({ seconds: 0 }),
    },
    permissions: { request: async () => !denied },
    runtime: {
      getURL: (p: string) => "chrome-extension://test/" + p,
      connect: () => ({
        onMessage: {
          addListener(fn: any) {
            changed = fn;
          },
        },
      }),
      sendMessage: async (m: any) => {
        messages.push(m);
        if (m.lc === "activate" && denied)
          return { ok: false, error: "denied" };
        let result: any = {};
        if (m.command === "resources.upsert")
          result = {
            id: "r",
            title: "Fixture",
            url: active.url,
            type: active.url.includes("youtube") ? "video" : "web",
          };
        if (m.command?.endsWith(".list")) {
          const items =
            m.command === "anchors.list"
              ? anchors
              : m.command === "notes.list"
                ? notes
                : m.command === "translations.list"
                  ? translations
                  : m.command === "occurrences.list"
                    ? occurrences
                    : [];
          result = { items, total: items.length, next: null };
        }
        if (m.command === "jobs.submit") result = { id: "j" };
        if (m.command === "jobs.get")
          result = { status: "done", result: "语境" };
        return { ok: true, result };
      },
    },
  };
  w.chrome = chrome;
  evaluate(w, "common");
  evaluate(w, "panel");
  return {
    w,
    chrome,
    messages,
    changed: (m: any = { event: "changed" }) => changed(m),
    poll: () => interval(),
    setActive: (v: any) => (active = v),
    setDenied: (v: boolean) => (denied = v),
    setNotes: (v: any[]) => (notes = v),
    setTranslations: (v: any[]) => (translations = v),
    scrolls: () => scrolls,
  };
}

test("panel renders notes and words, updates translations, opens and closes cards without playing", async () => {
  const f = fixture();
  await tick();
  await tick();
  const d = f.w.document;
  expect(d.querySelector("#timeline").textContent).toContain(
    "Agent 生成 · Test Agent · 已编辑",
  );
  expect(d.querySelector("#timeline").textContent).toContain("已收藏 1 条词句");
  expect(d.querySelector("#status").textContent).toContain("全文翻译中");
  f.changed({ event: "irrelevant" });
  f.setTranslations([
    { anchorId: "a", text: "新的译文" },
    { anchorId: "b", text: "第二句" },
  ]);
  f.changed();
  await tick();
  await tick();
  expect(d.querySelector(".translation").textContent).toBe("新的译文");
  expect(d.querySelector("#status").textContent).toContain("全文翻译完成");
  d.querySelector(".time").click();
  await tick();
  expect(f.messages.some((m) => m.lc === "seek")).toBe(true);
  const node = d.querySelector(".node");
  Array.from(node.querySelectorAll("button"))
    .find((b: any) => b.textContent === "记笔记")!
    .click();
  await tick();
  const dialog = d.querySelector(".dialog");
  expect(dialog).toBeTruthy();
  expect(f.messages.some((m) => m.lc === "pause")).toBe(true);
  Array.from(dialog.shadowRoot.querySelectorAll("button"))
    .find((b: any) => b.textContent === "关闭")!
    .click();
  await tick();
  expect(d.querySelector(".dialog")).toBeNull();
  expect(f.messages.some((m) => m.lc === "resume")).toBe(true);
  f.w.getSelection = () => ({
    toString: () => "Context",
    removeAllRanges() {},
  });
  node.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await tick();
  expect(d.querySelector(".dialog")).toBeTruthy();
  f.w.dispatchEvent(new f.w.Event("touchmove"));
  expect(d.querySelector("#follow").textContent).toBe("回到当前句");
  d.querySelector("#follow").click();
  await tick();
  d.querySelector("#library").click();
  d.querySelector("#options").click();
  expect(f.messages.some((m) => m.lc === "library")).toBe(true);
  expect(f.messages.some((m) => m.lc === "options")).toBe(true);
  f.setActive({ id: 2, url: "https://www.youtube.com/", title: "Home" });
  await f.poll();
  expect(d.querySelector(".dialog")).toBeNull();
  expect(d.querySelector("#timeline").textContent).toBe("");
});

test("ordinary web permission denial is recoverable, empty excerpts remain usable", async () => {
  const f = fixture({ url: "https://example.com/", anchors: [], denied: true });
  await tick();
  await tick();
  const d = f.w.document;
  expect(d.querySelector("#load").hidden).toBe(false);
  expect(d.querySelector("#status").textContent).toContain("允许读取");
  d.querySelector("#load").click();
  await tick();
  expect(d.querySelector("#status").textContent).toContain("尚未启用");
  f.setDenied(false);
  d.querySelector("#load").click();
  await tick();
  await tick();
  expect(d.querySelector("#timeline").textContent).toContain("在网页中划词");
  expect(d.querySelector("#status").textContent).toContain("0 处摘录");
  expect(d.querySelector("#follow").hidden).toBe(true);
  d.querySelector("#load").click();
  await tick();
});

test("uncached transcript requests once and displays errors; non-web tabs do not register resources", async () => {
  const f = fixture({ anchors: [] });
  await tick();
  await tick();
  expect(
    f.messages.filter(
      (m) => m.command === "jobs.submit" && m.params.type === "transcript",
    ),
  ).toHaveLength(1);
  f.setActive({ id: 2, url: "chrome://settings" });
  await f.poll();
  expect(
    f.messages.filter((m) => m.command === "resources.upsert"),
  ).toHaveLength(1);
  f.setActive(null);
  await f.poll();
});
