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
              ? anchors
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
  expect(root.querySelector(".body").textContent).toBe("offline");
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
