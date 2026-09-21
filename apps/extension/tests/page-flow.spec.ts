import { test, expect, onTestFinished } from "vitest";
import { JSDOM } from "jsdom";
import { evaluate } from "./support.js";
const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture({ empty = false, missing = false } = {}) {
  const w = new JSDOM(
    '<h1><yt-formatted-string>Fixture</yt-formatted-string></h1><div id="player"><video></video></div><p>Context matters here.</p>',
    {
      url: "https://www.youtube.com/watch?v=abcdef12345",
      runScripts: "outside-only",
    },
  ).window as any;
  onTestFinished(() => w.close());
  let interval: any, message: any;
  const calls: any[] = [];
  const resource = {
    id: "r",
    url: w.location.href,
    type: "video",
    title: "Fixture",
  };
  let anchors: any[] = empty
    ? []
    : [
        {
          id: "a",
          resourceId: "r",
          start: 0,
          end: 10,
          quote: "Context matters here.",
        },
        {
          id: "b",
          resourceId: "r",
          start: 10,
          end: 20,
          quote: "Second sentence",
        },
      ];
  let translations: any[] = missing
    ? []
    : anchors.map((a) => ({ anchorId: a.id, text: "中文译文" }));
  let failed = false,
    plays = 0,
    pauses = 0;
  const video = w.document.querySelector("video");
  let paused = true;
  Object.defineProperty(video, "paused", { get: () => paused });
  video.play = async () => {
    plays++;
    paused = false;
  };
  video.pause = () => {
    pauses++;
    paused = true;
  };
  w.setInterval = (fn: any) => {
    interval = fn;
    return 1;
  };
  w.clearInterval = () => {};
  w.chrome = {
    runtime: {
      getManifest: () => ({}),
      getURL: (p: string) => "chrome-extension://test/" + p,
      onMessage: {
        addListener(fn: any) {
          message = fn;
        },
      },
      sendMessage: async (m: any) => {
        calls.push(m);
        if (failed) return { ok: false, error: "offline" };
        let result: any = {};
        if (m.command === "resources.upsert") result = resource;
        if (m.command?.endsWith(".list")) {
          const items =
            m.command === "anchors.list"
              ? anchors.map((a: any) => ({
                  origin: "import",
                  createdBy: { id: "supadata" },
                  ...a,
                }))
              : m.command === "translations.list"
                ? translations
                : [];
          result = { items, total: items.length, next: null };
        }
        if (m.command === "jobs.submit") result = { id: "j" };
        if (m.command === "jobs.get")
          result = { status: "done", result: "语境" };
        if (m.command === "anchors.upsert")
          result = { id: "web-anchor", ...m.params, start: null };
        return { ok: true, result };
      },
    },
  };
  evaluate(w, "common");
  evaluate(w, "page");
  return {
    w,
    video,
    calls,
    poll: () => interval(),
    send: (m: any) => {
      let reply: any;
      message(m, {}, (r: any) => (reply = r));
      return reply;
    },
    setFailed: (v: boolean) => (failed = v),
    setAnchors: (v: any[]) => (anchors = v),
    setTranslations: (v: any[]) => (translations = v),
    setPaused: (v: boolean) => (paused = v),
    plays: () => plays,
    pauses: () => pauses,
  };
}
const find = (root: any, label: string) =>
  Array.from(root.querySelectorAll("button")).find(
    (b: any) => b.textContent === label,
  ) as HTMLButtonElement;
async function ready(f: ReturnType<typeof fixture>) {
  f.poll();
  await tick();
  f.poll();
  return f.w.document.querySelector("#learning-companion-subtitles").shadowRoot;
}

test("paused page controls, seek messages, single mount and extension invalidation", async () => {
  const f = fixture();
  const root = await ready(f);
  evaluate(f.w, "page");
  expect(f.send({ lc: "ping" })).toEqual({ ok: true });
  expect(f.send({ lc: "time" }).seconds).toBe(0);
  expect(f.send({ lc: "seek", resourceId: "other", seconds: 12 })).toEqual({
    ok: false,
  });
  expect(f.send({ lc: "seek", resourceId: "r", seconds: 12 })).toEqual({
    ok: true,
  });
  expect(root.querySelector(".original").textContent).toBe("Second sentence");
  expect(f.plays()).toBe(0);
  find(root, "收起").click();
  expect(root.querySelector(".shell").classList.contains("collapsed")).toBe(
    true,
  );
  find(root, "展开字幕").click();
  find(root, "侧边栏").click();
  expect(f.calls.some((m) => m.lc === "open")).toBe(true);
  find(root, "记笔记").click();
  let popup = Array.from(f.w.document.querySelectorAll("div")).find((el: any) =>
    el.shadowRoot?.querySelector(".lc-card"),
  ) as any;
  expect(popup).toBeTruthy();
  find(root, "记笔记").click();
  expect(popup.isConnected).toBe(false);
  popup = Array.from(f.w.document.querySelectorAll("div")).find((el: any) =>
    el.shadowRoot?.querySelector(".lc-card"),
  ) as any;
  find(popup.shadowRoot, "关闭").click();
  expect(f.plays()).toBe(0);
  f.video.remove();
  expect(f.send({ lc: "seek", resourceId: "r", seconds: 1 }).ok).toBe(false);
  expect(f.send({ lc: "time" }).seconds).toBe(0);
  f.send({ lc: "pause", token: "none" });
  f.send({ lc: "resume", token: "none" });
  f.w.chrome.runtime.getManifest = () => {
    throw Error("extension invalidated");
  };
  f.poll();
  expect(
    f.w.document.querySelector("#learning-companion-subtitles"),
  ).toBeNull();
});

test("playback ownership resumes only once after last pause token; replay is explicit", async () => {
  const f = fixture();
  const root = await ready(f);
  f.setPaused(false);
  f.send({ lc: "pause", token: "one" });
  f.send({ lc: "pause", token: "two" });
  expect(f.pauses()).toBe(1);
  f.send({ lc: "resume", token: "one" });
  expect(f.plays()).toBe(0);
  f.send({ lc: "resume", token: "two" });
  expect(f.plays()).toBe(1);
  f.send({ lc: "resume", token: "two" });
  expect(f.plays()).toBe(1);
  find(root, "重播此句").click();
  expect(f.plays()).toBe(2);
  f.video.play = async () => {
    throw Error("autoplay denied");
  };
  find(root, "重播此句").click();
  await tick();
});

test("mount follows fullscreen and wide player without duplication, missing player is harmless", async () => {
  const f = fixture();
  const root = await ready(f);
  const d = f.w.document;
  const host = d.querySelector("#learning-companion-subtitles");
  const full = d.createElement("section");
  d.body.append(full);
  Object.defineProperty(d, "fullscreenElement", {
    value: full,
    writable: true,
  });
  f.poll();
  expect(host.parentElement).toBe(full);
  f.poll();
  d.fullscreenElement = null;
  const wide = d.createElement("div");
  wide.id = "player-wide-container";
  Object.defineProperty(wide, "offsetHeight", { value: 300 });
  d.body.append(wide);
  f.poll();
  expect(host.previousElementSibling).toBe(wide);
  wide.remove();
  d.querySelector("#player").remove();
  f.poll();
  expect(d.querySelectorAll("#learning-companion-subtitles")).toHaveLength(1);
  f.w.history.pushState({}, "", "/");
  f.poll();
  expect(host.isConnected).toBe(false);
});

test("manual transcript load uses cache and reports failure without starting playback", async () => {
  const f = fixture({ empty: true });
  const root = await ready(f);
  find(root, "加载字幕").click();
  await tick();
  expect(
    f.calls.some(
      (m) => m.command === "jobs.submit" && m.params.type === "transcript",
    ),
  ).toBe(true);
  f.setAnchors([{ id: "a", start: 0, quote: "Loaded" }]);
  f.setTranslations([{ anchorId: "a", text: "已加载" }]);
  find(root, "加载字幕").click();
  await tick();
  expect(root.querySelector(".translated").textContent).toBe("已加载");
  expect(
    f.calls.filter(
      (m) => m.command === "jobs.submit" && m.params.type === "transcript",
    ),
  ).toHaveLength(1);
  f.setFailed(true);
  find(root, "加载字幕").click();
  await tick();
  expect(root.querySelector(".body").textContent).toContain("offline");
  expect(f.plays()).toBe(0);
});

test("failed automatic translations surface an error and do not loop paid requests", async () => {
  const f = fixture({ missing: true });
  let failedSubmissions = 0;
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = async (m: any) => {
    if (m.command === "jobs.submit") {
      failedSubmissions++;
      return { ok: false, error: "offline" };
    }
    return original(m);
  };
  const root = await ready(f);
  await tick();
  expect(root.querySelector(".translated").textContent).toContain(
    "翻译暂不可用：offline",
  );
  f.poll();
  f.poll();
  await tick();
  expect(failedSubmissions).toBe(1);
  expect(f.plays()).toBe(0);
  expect(root.querySelector(".translated").textContent).toContain(
    "翻译暂不可用：offline",
  );
});

test("selection uses captured subtitle identity, ignores editable controls and invalid selections", async () => {
  const f = fixture();
  const root = await ready(f);
  const d = f.w.document;
  const selected = (element: any, text = "Context", collapsed = false) => {
    const range = d.createRange();
    range.selectNodeContents(element);
    range.getBoundingClientRect = () => ({ left: 30, bottom: 40 });
    return {
      isCollapsed: collapsed,
      toString: () => text,
      getRangeAt: () => range,
      removeAllRanges() {},
    };
  };
  root.getSelection = () => selected(root.querySelector(".original"));
  const callbacks: any[] = [];
  f.w.ResizeObserver = class {
    constructor(fn: any) {
      callbacks.push(fn);
    }
    observe() {}
    disconnect() {}
  };
  root
    .querySelector(".original")
    .dispatchEvent(
      new f.w.MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
  await tick();
  await tick();
  let popup = Array.from(d.querySelectorAll("div")).find((el: any) =>
    el.shadowRoot?.querySelector(".lc-card"),
  ) as any;
  expect(popup.shadowRoot.querySelector(".lc-word").textContent).toBe(
    "Context",
  );
  expect(f.calls.some((m) => m.command === "anchors.upsert")).toBe(false);
  popup.shadowRoot
    .querySelector("textarea")
    .dispatchEvent(
      new f.w.MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
  find(popup.shadowRoot, "关闭").click();
  callbacks[0]();
  root.getSelection = () => ({ toString: () => "" });
  const p = d.querySelector("p");
  for (const value of [
    null,
    selected(p, "", true),
    selected(p, "  "),
    selected(p, "a".repeat(2001)),
  ]) {
    f.w.getSelection = () => value;
    p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
    await tick();
  }
  expect(
    Array.from(d.querySelectorAll("div")).some((el: any) =>
      el.shadowRoot?.querySelector(".lc-card"),
    ),
  ).toBe(false);
  f.w.getSelection = () => selected(p);
  p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await tick();
  await tick();
  expect(f.calls.filter((m) => m.command === "anchors.upsert")).toHaveLength(2);
  expect(
    Array.from(d.querySelectorAll("div")).filter((el: any) =>
      el.shadowRoot?.querySelector(".lc-card"),
    ),
  ).toHaveLength(1);
  popup = Array.from(d.querySelectorAll("div")).find((el: any) =>
    el.shadowRoot?.querySelector(".lc-card"),
  ) as any;
  find(popup.shadowRoot, "关闭").click();
  const editable = d.createElement("div");
  Object.defineProperty(editable, "isContentEditable", { value: true });
  d.body.append(editable);
  editable.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await tick();
  expect(f.calls.filter((m) => m.command === "anchors.upsert")).toHaveLength(2);
});

test("selection failure, stale anchor response and detached text are handled without opening a wrong card", async () => {
  const f = fixture();
  await ready(f);
  const d = f.w.document;
  let release: any;
  const original = f.w.chrome.runtime.sendMessage;
  const p = d.createElement("div");
  p.textContent = "Fallback text";
  d.body.append(p);
  let range: any = {
    commonAncestorContainer: p,
    getBoundingClientRect: () => ({ left: 20, bottom: 20 }),
  };
  f.w.getSelection = () => ({
    isCollapsed: false,
    toString: () => "Fallback",
    getRangeAt: () => range,
    removeAllRanges() {},
  });
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "anchors.upsert"
      ? new Promise(
          (resolve) =>
            (release = () =>
              resolve({
                ok: true,
                result: { id: "late", quote: "Fallback", start: null },
              })),
        )
      : original(m);
  p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await expect.poll(() => !!release).toBe(true);
  f.w.history.pushState({}, "", "/");
  f.poll();
  release();
  await tick();
  expect(
    Array.from(d.querySelectorAll("div")).some((el: any) =>
      el.shadowRoot?.querySelector(".lc-card"),
    ),
  ).toBe(false);
  f.w.console.warn = () => {};
  f.setFailed(true);
  f.w.chrome.runtime.sendMessage = original;
  p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await tick();
  await tick();
  expect(
    Array.from(d.querySelectorAll("div")).some((el: any) =>
      el.shadowRoot?.querySelector(".lc-card"),
    ),
  ).toBe(false);
  f.setFailed(false);
  range = {
    commonAncestorContainer: d.createTextNode("detached"),
    getBoundingClientRect: () => ({}),
  };
  p.dispatchEvent(new f.w.MouseEvent("mouseup", { bubbles: true }));
  await tick();
  await tick();
  expect(
    f.calls.findLast((m) => m.command === "anchors.upsert").params.context,
  ).toBe("Fallback");
});

test("initial stale host and pending registration cannot attach old video data after navigation", async () => {
  const f = fixture();
  const stale = f.w.document.createElement("div");
  stale.id = "learning-companion-subtitles";
  f.w.document.body.append(stale);
  f.send({ event: "changed" });
  let release: any;
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "resources.upsert"
      ? new Promise(
          (resolve) =>
            (release = () =>
              resolve({ ok: true, result: { id: "r", url: m.params.url } })),
        )
      : original(m);
  f.poll();
  expect(stale.isConnected).toBe(false);
  await tick();
  f.w.history.pushState({}, "", "/");
  release();
  await tick();
  f.poll();
  expect(
    f.w.document.querySelector("#learning-companion-subtitles"),
  ).toBeNull();
});

test("stale refresh and delayed translation success/failure never overwrite a new video", async () => {
  for (const ok of [true, false]) {
    const f = fixture({ missing: true });
    let release: any;
    const original = f.w.chrome.runtime.sendMessage;
    f.w.chrome.runtime.sendMessage = async (m: any) =>
      m.command === "jobs.submit"
        ? new Promise(
            (resolve) =>
              (release = () =>
                resolve(
                  ok
                    ? { ok: true, result: { id: "j" } }
                    : { ok: false, error: "late" },
                )),
          )
        : original(m);
    await ready(f);
    await expect.poll(() => !!release).toBe(true);
    f.w.history.pushState({}, "", "/");
    f.poll();
    release();
    await tick();
    expect(
      f.w.document.querySelector("#learning-companion-subtitles"),
    ).toBeNull();
  }
  const f = fixture();
  await ready(f);
  let release: any;
  const original = f.w.chrome.runtime.sendMessage;
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "anchors.list"
      ? new Promise(
          (resolve) =>
            (release = () =>
              resolve({ ok: true, result: { items: [], next: null } })),
        )
      : original(m);
  f.send({ event: "changed" });
  await tick();
  f.w.history.pushState({}, "", "/");
  f.poll();
  release();
  await tick();
  expect(
    f.w.document.querySelector("#learning-companion-subtitles"),
  ).toBeNull();
});

test("card events are ignored and blocked playback restoration does not leak a rejection", async () => {
  const f = fixture();
  const root = await ready(f);
  f.setPaused(false);
  f.video.play = async () => {
    throw Error("Autoplay denied");
  };
  find(root, "记笔记").click();
  await tick();
  const popup = Array.from(f.w.document.querySelectorAll("div")).find(
    (el: any) => el.shadowRoot?.querySelector(".lc-card"),
  ) as any;
  const event = new f.w.MouseEvent("mouseup", { bubbles: true });
  event.composedPath = () => [popup, f.w.document];
  f.w.document.dispatchEvent(event);
  expect(f.calls.some((m) => m.command === "anchors.upsert")).toBe(false);
  find(popup.shadowRoot, "关闭").click();
  await tick();
  expect(popup.isConnected).toBe(false);
  f.setFailed(true);
  f.send({ event: "changed" });
  await tick();
  expect(root.querySelector(".original").textContent).toContain("Context");
});

test("a delayed translation failure for the previous caption does not replace the current caption", async () => {
  const f = fixture({ missing: true });
  const original = f.w.chrome.runtime.sendMessage;
  let release: any;
  f.w.chrome.runtime.sendMessage = (m: any) =>
    m.command === "jobs.submit"
      ? new Promise(
          (resolve) =>
            (release = () => resolve({ ok: false, error: "offline" })),
        )
      : original(m);
  const root = await ready(f);
  expect(release).toBeTruthy();
  const reject = release;
  f.video.currentTime = 12;
  f.poll();
  reject();
  await tick();
  expect(root.querySelector(".original").textContent).toBe("Second sentence");
});

test("subtitle failure offers retry, excludes UI selection and never treats excerpts as cached subtitles", async () => {
  const f = fixture({ empty: true });
  f.setAnchors([
    { id: "excerpt", start: null, quote: "signal timed out", origin: "human" },
  ]);
  const root = await ready(f);
  const original = f.w.chrome.runtime.sendMessage;
  let release: any;
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "jobs.get"
      ? new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              result: { status: "error", error: "Supadata 响应超时" },
            });
        })
      : original(m);
  find(root, "加载字幕").click();
  find(root, "加载字幕").click();
  await tick();
  expect(f.calls.filter((m) => m.command === "jobs.submit")).toHaveLength(1);
  release();
  await tick();
  expect(root.querySelector('[role="alert"]').textContent).toContain(
    "响应超时",
  );
  const event = new f.w.MouseEvent("mouseup", { bubbles: true });
  event.composedPath = () => [
    root.querySelector("p"),
    f.w.document.querySelector("#learning-companion-subtitles"),
    f.w.document,
  ];
  f.w.document.dispatchEvent(event);
  expect(f.calls.some((m) => m.command === "anchors.upsert")).toBe(false);
  find(root, "重试获取").click();
  await tick();
  expect(f.calls.filter((m) => m.command === "jobs.submit")).toHaveLength(2);
  f.w.history.pushState({}, "", "/watch?v=nextvideo11");
  f.poll();
  release();
  await tick();
  expect(
    f.w.document.querySelector("#learning-companion-subtitles").shadowRoot
      .textContent,
  ).not.toContain("响应超时");
});

test("page mirrors queued, running and failed transcript jobs started by another surface", async () => {
  const f = fixture({ empty: true });
  const original = f.w.chrome.runtime.sendMessage;
  let state = "queued";
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "jobs.list"
      ? {
          ok: true,
          result: {
            items: [
              { type: "lookup" },
              {
                type: "transcript",
                status: state,
                error: state === "error" ? "HTTP 500" : null,
              },
            ],
            next: null,
          },
        }
      : original(m);
  const root = await ready(f);
  expect(root.textContent).toContain("正在获取字幕");
  for (const status of ["running", "error", "cancelled", "done"]) {
    state = status;
    f.send({ event: "changed" });
    await tick();
    if (status === "error") expect(root.textContent).toContain("HTTP 500");
    if (status === "cancelled")
      expect(root.textContent).toContain("字幕任务已取消");
  }
  let release: any;
  f.w.chrome.runtime.sendMessage = async (m: any) =>
    m.command === "jobs.list"
      ? new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, result: { items: [], next: null } });
        })
      : original(m);
  f.send({ event: "changed" });
  await tick();
  f.w.history.pushState({}, "", "/");
  f.poll();
  release();
  await tick();
  expect(
    f.w.document.querySelector("#learning-companion-subtitles"),
  ).toBeNull();
});

test.each(["anchors.list", "jobs.get"])(
  "navigation discards stale transcript %s completion",
  async (phase) => {
    const f = fixture({ empty: true });
    const root = await ready(f);
    const original = f.w.chrome.runtime.sendMessage;
    let release: any;
    f.w.chrome.runtime.sendMessage = async (m: any) =>
      m.command === phase
        ? new Promise((resolve) => {
            release = () =>
              resolve({
                ok: true,
                result:
                  phase === "jobs.get"
                    ? { status: "done" }
                    : { items: [], next: null },
              });
          })
        : original(m);
    find(root, "加载字幕").click();
    await tick();
    f.w.history.pushState({}, "", "/");
    f.poll();
    release();
    await tick();
    expect(
      f.w.document.querySelector("#learning-companion-subtitles"),
    ).toBeNull();
  },
);
