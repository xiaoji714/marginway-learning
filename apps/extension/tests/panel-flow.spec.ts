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
    setAnchors: (v: any[]) => (anchors = v),
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

test.each(["active", "activate", "activate-reject", "anchors", "transcript"])(
  "navigation invalidates stale %s results",
  async (phase) => {
    const f = fixture();
    await tick();
    await tick();
    let release: any;
    let held = false;
    let queries = 0;
    const original = f.chrome.runtime.sendMessage;
    const originalQuery = f.chrome.tabs.query;
    f.chrome.tabs.query = async () => {
      const value = await originalQuery();
      if (phase === "active" && ++queries === 2 && !held) {
        held = true;
        return new Promise((resolve) => (release = () => resolve(value)));
      }
      return value;
    };
    if (phase === "transcript") f.setAnchors([]);
    f.chrome.runtime.sendMessage = async (m: any) => {
      const matches =
        (phase.startsWith("activate") && m.lc === "activate") ||
        (phase === "anchors" && m.command === "anchors.list") ||
        (phase === "transcript" && m.command === "jobs.get");
      if (matches && !held) {
        held = true;
        const value = await original(m);
        return new Promise(
          (resolve) =>
            (release = () =>
              resolve(
                phase === "activate-reject"
                  ? { ok: false, error: "stale denied" }
                  : value,
              )),
        );
      }
      return original(m);
    };
    f.setActive({
      id: 2,
      url: "https://www.youtube.com/watch?v=second12345",
      title: "Second",
    });
    const pending = f.poll();
    await expect.poll(() => !!release).toBe(true);
    f.setActive({ id: 3, url: "https://www.youtube.com/", title: "Home" });
    await f.poll();
    release();
    await pending;
    await tick();
    expect(f.w.document.querySelector("#title").textContent).toContain(
      "打开一个 YouTube 视频",
    );
    expect(f.w.document.querySelector("#timeline").textContent).toBe("");
    f.changed();
    await tick();
    await tick();
  },
);

test("stale refresh and playback responses cannot restore an earlier resource", async () => {
  const f = fixture();
  await tick();
  await tick();
  const original = f.chrome.runtime.sendMessage;
  let release: any;
  f.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "notes.list"
      ? new Promise(
          (resolve) =>
            (release = () =>
              resolve({ ok: true, result: { items: [], next: null } })),
        )
      : original(m);
  f.changed();
  await expect.poll(() => !!release).toBe(true);
  f.setActive({ id: 2, url: "https://www.youtube.com/" });
  await f.poll();
  release();
  await tick();
  expect(f.w.document.querySelector("#timeline").textContent).toBe("");
  f.chrome.runtime.sendMessage = original;
  f.setActive({ id: 3, url: "https://www.youtube.com/watch?v=third12345" });
  await f.poll();
  f.chrome.tabs.sendMessage = () =>
    new Promise((resolve) => (release = () => resolve({ seconds: 0 })));
  const pending = f.poll();
  await tick();
  f.setActive({ id: 4, url: "https://www.youtube.com/" });
  await f.poll();
  release();
  await pending;
  expect(f.w.document.querySelector("#timeline").textContent).toBe("");
});

test("web excerpts, no selection, missing progress and denied page messaging are handled", async () => {
  const f = fixture({
    anchors: [
      { id: "a", start: null, quote: "Web quote" },
      { id: "b", start: 10, quote: "Second quote" },
    ],
  });
  await tick();
  await tick();
  const d = f.w.document;
  const node = d.querySelector(".node");
  node
    .querySelector("button")
    .dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  f.w.getSelection = () => null;
  node.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  expect(d.querySelector(".dialog")).toBeNull();
  f.chrome.tabs.sendMessage = async () => ({ seconds: -1 });
  await f.poll();
  f.setTranslations([]);
  f.changed();
  await tick();
  await tick();
  f.changed();
  await tick();
  await tick();
  d.querySelector("#translation-progress").remove();
  f.changed();
  await tick();
  await tick();
  const original = f.chrome.runtime.sendMessage;
  f.chrome.runtime.sendMessage = async (m: any) =>
    ["pause", "resume", "seek"].includes(m.lc)
      ? { ok: false, error: "tab disappeared" }
      : original(m);
  d.querySelector(".time").click();
  await tick(); // second node's seek
  expect(d.querySelector("#status").className).toContain("error");
  const second = d.querySelectorAll(".node")[1];
  Array.from(second.querySelectorAll("button"))
    .find((b: any) => b.textContent === "记笔记")!
    .click();
  await tick();
  const dialog = d.querySelector(".dialog");
  Array.from(dialog.shadowRoot.querySelectorAll("button"))
    .find((b: any) => b.textContent === "关闭")!
    .click();
  await tick();
  const permission = fixture({ url: "https://example.com/", denied: true });
  await tick();
  permission.chrome.permissions.request = async () => {
    throw "permission failure";
  };
  permission.w.document.querySelector("#load").click();
  await tick();
  expect(permission.w.document.querySelector("#status").textContent).toBe(
    "permission failure",
  );
});

test("untimed excerpt ordering and paused current-node transitions do not force repeated scrolling", async () => {
  const f = fixture({
    anchors: [
      { id: "a", start: null, quote: "A" },
      { id: "b", start: null, quote: "B" },
      { id: "c", start: 0, quote: "C" },
      { id: "d", start: 10, quote: "D" },
    ],
  });
  await tick();
  await tick();
  f.chrome.tabs.sendMessage = async () => ({ seconds: 12 });
  await f.poll();
  const scrolled = f.scrolls();
  await f.poll();
  expect(f.scrolls()).toBe(scrolled);
  expect(f.w.document.querySelector(".node.active").dataset.id).toBe("d");
});
