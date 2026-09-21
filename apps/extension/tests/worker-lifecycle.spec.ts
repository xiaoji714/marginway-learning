import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { script, runInNewContext } from "./support.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture(handler: (command: string, params: any) => any = () => null) {
  let message: any,
    disconnect: any,
    request: any,
    connectView: any,
    clicked: any,
    interval: any;
  let connections = 0;
  const calls: any[] = [],
    tabMessages: any[] = [],
    injected: any[] = [],
    opened: any[] = [];
  const noop = { addListener() {} };
  const port = {
    onMessage: {
      addListener(fn: any) {
        message = fn;
      },
    },
    onDisconnect: {
      addListener(fn: any) {
        disconnect = fn;
      },
    },
    postMessage(m: any) {
      calls.push(m);
      Promise.resolve()
        .then(() => handler(m.command, m.params))
        .then(
          (result) => {
            if (result !== HOLD) message({ id: m.id, ok: true, result });
          },
          (error) =>
            message({ id: m.id, ok: false, error: { message: error.message } }),
        );
    },
  };
  const chrome: any = {
    runtime: {
      getURL: (path: string) => "chrome-extension://test/" + path,
      connectNative() {
        connections++;
        return port;
      },
      onConnect: {
        addListener(fn: any) {
          connectView = fn;
        },
      },
      onMessage: {
        addListener(fn: any) {
          request = fn;
        },
      },
      openOptionsPage: async () => {
        opened.push("options");
      },
    },
    tabs: {
      query: async () => [],
      sendMessage: async (...args: any[]) => {
        tabMessages.push(args);
        return { ok: true };
      },
      create: async (p: any) => {
        opened.push(p);
      },
      get: async () => ({ url: "https://example.com/", id: 1 }),
    },
    scripting: {
      executeScript: async (p: any) => {
        injected.push(p);
      },
    },
    action: {
      onClicked: {
        addListener(fn: any) {
          clicked = fn;
        },
      },
    },
    sidePanel: {
      setPanelBehavior() {},
      open: async (p: any) => {
        opened.push(p);
      },
    },
  };
  const timers: (() => void)[] = [];
  const sandbox: any = {
    importScripts() {},
    crypto: { randomUUID },
    URL,
    URLSearchParams,
    AbortSignal,
    setTimeout(fn: () => void) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout(id: number) {
      timers[id - 1] = () => {};
    },
    setInterval(fn: any) {
      interval = fn;
    },
    chrome,
    getSettings: async () => ({ aiApiKey: "test", supadataApiKey: "" }),
    handleFetchTranscript: async () => ({
      success: true,
      transcript: [{ text: "Hello", start: 0 }],
    }),
    handleTranslateContent: async () => ({
      success: true,
      translatedContent: { segments: [{ id: "a", text: "你好" }] },
    }),
    requestAiCompletion: async () => ({ text: "语境" }),
  };
  runInNewContext(script("worker"), sandbox);
  return {
    calls,
    tabMessages,
    injected,
    opened,
    chrome,
    sandbox,
    request: (m: any, sender: any = {}) =>
      new Promise<any>((resolve) => request(m, sender, resolve)),
    send: (m: any, sender: any = {}) => request(m, sender, () => {}),
    event: (m: any) => message(m),
    disconnect: () => disconnect(),
    view: (p: any) => connectView(p),
    click: (p: any) => clicked(p),
    poll: () => interval(),
    timeout: () => timers.forEach((fn) => fn()),
    connections: () => connections,
  };
}
const HOLD = Symbol("hold");

test("native disconnect rejects pending callers and next request reconnects; stale replies are ignored", async () => {
  let hold = true;
  const f = fixture((cmd) => (cmd === "stats" && hold ? HOLD : { count: 3 }));
  await tick();
  const pending = f.request({ lc: "rpc", command: "stats" });
  await tick();
  f.disconnect();
  expect((await pending).error).toContain("断开");
  f.event({ id: "unknown", ok: true, result: {} });
  hold = false;
  expect((await f.request({ lc: "rpc", command: "stats" })).result.count).toBe(
    3,
  );
  expect(f.connections()).toBe(2);
  hold = true;
  const timed = f.request({ lc: "rpc", command: "stats" });
  f.timeout();
  expect((await timed).error).toContain("超时");
  const again = f.request({ lc: "rpc", command: "stats" });
  f.chrome.runtime.lastError = { message: "host stopped" };
  f.disconnect();
  expect((await again).error).toBe("host stopped");
  f.chrome.runtime.connectNative = () => {
    throw Error("missing host");
  };
  expect((await f.request({ lc: "rpc", command: "stats" })).error).toBe(
    "missing host",
  );
});

test("native notifications reach live views and tabs, tolerating closed recipients", async () => {
  const f = fixture();
  await tick();
  const received: any[] = [];
  let leave: any;
  f.view({ name: "irrelevant" });
  f.view({
    name: "lc-view",
    postMessage: (m: any) => received.push(m),
    onDisconnect: {
      addListener(fn: any) {
        leave = fn;
      },
    },
  });
  f.view({
    name: "lc-view",
    postMessage() {
      throw Error("closed");
    },
    onDisconnect: { addListener() {} },
  });
  f.chrome.tabs.query = async () => [{ id: 7 }];
  f.chrome.tabs.sendMessage = async () => {
    throw Error("tab closed");
  };
  f.event({ event: "changed", version: 2 });
  await tick();
  expect(received).toEqual([{ event: "changed", version: 2 }]);
  leave();
  f.event({ event: "changed", version: 3 });
  await tick();
  expect(received).toHaveLength(1);
});

test("extension controls route to Chrome; arbitrary page cannot activate extension actions", async () => {
  const f = fixture();
  await tick();
  expect(await f.request({ action: "checkConfig" })).toEqual({
    hasAiKey: true,
    hasSupadataKey: false,
  });
  expect((await f.request({ lc: "config" })).result.hasAiKey).toBe(true);
  for (const lc of [
    "options",
    "library",
    "seek",
    "pause",
    "resume",
    "activate",
  ])
    expect(
      (
        await f.request({
          lc,
          tabId: 1,
          token: "p",
          seconds: 4,
          resourceId: "r",
        })
      ).ok,
    ).toBe(true);
  f.send({});
  f.send({ lc: "open" });
  f.send({ lc: "open" }, { tab: { id: 1 } });
  expect(f.opened).toContain("options");
  expect((await f.request({ lc: "unknown" })).error).toContain("未知");
  expect(
    (
      await f.request(
        { lc: "options" },
        { tab: { id: 1 }, url: "https://example.com/" },
      )
    ).error,
  ).toContain("仅扩展");
  f.click({});
  f.click({ url: "chrome://settings" });
  f.chrome.tabs.sendMessage = async () => {
    throw Error("not injected");
  };
  f.click({ id: 1, url: "https://example.com/" });
  await tick();
  expect(f.injected[0].target.tabId).toBe(1);
  f.chrome.scripting.executeScript = async () => {
    throw Error("denied");
  };
  f.click({ id: 1, url: "https://example.com/" });
  await tick();
});

test.each(["lookup", "translate", "transcript", "seek"])(
  "job lifecycle completes %s through real worker entry",
  async (type) => {
    let claimed = false;
    const f = fixture((cmd, p) => {
      if (cmd === "jobs.claim") {
        if (claimed) return null;
        claimed = true;
        return {
          id: "j",
          type,
          resourceId: "r",
          anchorIds: ["a"],
          text: "context",
          seconds: 2,
        };
      }
      if (cmd === "records.get")
        return p.id === "r"
          ? {
              id: "r",
              type: "video",
              url: "https://www.youtube.com/watch?v=abcdef12345",
              title: "Fixture",
            }
          : { id: "a", quote: "Hello", context: "Example", start: 0 };
      if (cmd.endsWith(".list")) return { items: [], next: null };
      return {};
    });
    f.chrome.tabs.query = async () => [
      { id: 1, url: "invalid" },
      { id: 2, url: "https://www.youtube.com/watch?v=other12345" },
      {
        id: 3,
        url: "https://www.youtube.com/watch?v=abcdef12345",
        active: true,
      },
    ];
    for (
      let i = 0;
      i < 20 && !f.calls.some((x) => x.command === "jobs.complete");
      i++
    )
      await tick();
    const completion = f.calls.find((x) => x.command === "jobs.complete");
    expect(completion.params.error).toBeUndefined();
    if (type === "lookup") expect(completion.params.text).toBe("语境");
    if (type === "translate")
      expect(completion.params.translations).toEqual([
        { id: "a", text: "你好" },
      ]);
    if (type === "transcript")
      expect(completion.params.segments).toHaveLength(1);
  },
);

test.each([
  "translate-failed",
  "translate-empty",
  "transcript-error",
  "transcript-message",
  "lookup",
  "seek-closed",
  "seek-disconnected",
])("job failure %s is recorded, never reported as success", async (mode) => {
  const type = mode.startsWith("translate")
    ? "translate"
    : mode.startsWith("transcript")
      ? "transcript"
      : mode.startsWith("seek")
        ? "seek"
        : "lookup";
  let claimed = false;
  const f = fixture((cmd, p) => {
    if (cmd === "jobs.claim") {
      if (claimed) return null;
      claimed = true;
      return { id: "j", type, resourceId: "r", anchorIds: ["a"] };
    }
    if (cmd === "records.get")
      return p.id === "r"
        ? { id: "r", url: "https://www.youtube.com/watch?v=abcdef12345" }
        : { id: "a", quote: "Hello" };
    if (cmd === "translations.list") return { items: [], next: null };
    return {};
  });
  f.sandbox.handleTranslateContent = async () =>
    mode === "translate-failed"
      ? { success: false, error: "provider error" }
      : {
          success: true,
          translatedContent: { segments: [{ id: "a", text: "" }] },
        };
  f.sandbox.handleFetchTranscript = async () =>
    mode === "transcript-message"
      ? { success: false, message: "no transcript" }
      : { success: false, error: "no transcript" };
  f.sandbox.requestAiCompletion = async () => {
    throw Error("lookup failed");
  };
  if (mode === "seek-disconnected") {
    f.chrome.tabs.query = async () => [
      { id: 1, url: "https://www.youtube.com/watch?v=abcdef12345" },
    ];
    f.chrome.tabs.sendMessage = async () => ({ ok: false });
  }
  for (
    let i = 0;
    i < 20 && !f.calls.some((x) => x.command === "jobs.complete");
    i++
  )
    await tick();
  expect(
    f.calls.find((x) => x.command === "jobs.complete").params.error,
  ).toBeTruthy();
});
