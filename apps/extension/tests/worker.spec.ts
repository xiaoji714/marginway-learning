import { script } from "./support.js";
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
test("translation cache beyond first page avoids another paid provider request", async () => {
  let onMessage,
    completed = false,
    providerCalls = 0;
  const offsets = [];
  const job = {
    id: "job",
    type: "translate",
    resourceId: "resource",
    anchorIds: ["a_old"],
  };
  const port = {
    onMessage: { addListener: (fn) => (onMessage = fn) },
    onDisconnect: { addListener() {} },
    postMessage(m) {
      let result;
      if (m.command === "jobs.claim") result = job;
      else if (m.command === "records.get")
        result =
          m.params.id === "resource"
            ? { id: "resource", title: "Test" }
            : { id: "a_old", quote: "Already translated" };
      else if (m.command === "translations.list") {
        offsets.push(m.params.offset);
        result =
          m.params.offset === 0
            ? {
                items: Array.from({ length: 200 }, (_, i) => ({
                  anchorId: "a" + i,
                })),
                next: 200,
              }
            : { items: [{ anchorId: "a_old", text: "Cached" }], next: null };
      } else if (m.command === "jobs.complete") completed = true;
      queueMicrotask(() => onMessage({ id: m.id, ok: true, result }));
    },
  };
  const listener = { addListener() {} };
  runInNewContext(script("worker"), {
    importScripts() {},
    crypto: { randomUUID },
    setTimeout,
    clearTimeout,
    setInterval() {},
    queueMicrotask,
    console,
    chrome: {
      runtime: {
        connectNative: () => port,
        onConnect: listener,
        onMessage: listener,
      },
      action: { onClicked: listener },
      sidePanel: { setPanelBehavior() {} },
    },
    handleTranslateContent: () => {
      providerCalls++;
      throw Error("must use cache");
    },
  });
  for (let i = 0; i < 20 && !completed; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(completed, true);
  assert.deepEqual(offsets, [0, 200]);
  assert.equal(providerCalls, 0);
});
test("seek prefers the active matching video instead of a stale duplicate", async () => {
  let onMessage,
    completed = false;
  const sought = [];
  const listener = { addListener() {} };
  const port = {
    onMessage: { addListener: (fn) => (onMessage = fn) },
    onDisconnect: listener,
    postMessage(m) {
      const result =
        m.command === "jobs.claim"
          ? { id: "j", type: "seek", resourceId: "r", seconds: 108 }
          : m.command === "records.get"
            ? { id: "r", url: "https://www.youtube.com/watch?v=abcdefghijk" }
            : null;
      if (m.command === "jobs.complete") {
        assert.equal(m.params.error, undefined);
        completed = true;
      }
      queueMicrotask(() => onMessage({ id: m.id, ok: true, result }));
    },
  };
  runInNewContext(script("worker"), {
    importScripts() {},
    crypto: { randomUUID },
    setTimeout,
    clearTimeout,
    setInterval() {},
    queueMicrotask,
    console,
    URL,
    chrome: {
      runtime: {
        connectNative: () => port,
        onConnect: listener,
        onMessage: listener,
      },
      action: { onClicked: listener },
      sidePanel: { setPanelBehavior() {} },
      tabs: {
        query: async () => [
          {
            id: 1,
            active: false,
            url: "https://www.youtube.com/watch?v=abcdefghijk",
          },
          {
            id: 2,
            active: true,
            url: "https://www.youtube.com/watch?v=abcdefghijk",
          },
        ],
        sendMessage: async (id, m) => {
          if (m.lc === "seek") {
            sought.push(id);
            return { ok: id === 2 };
          }
          return { ok: true };
        },
      },
    },
  });
  for (let i = 0; i < 20 && !completed; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(completed, true);
  assert.deepEqual(sought, [2]);
});
test("whole transcript queue includes offscreen anchors and skips cached translations", async () => {
  const submissions = [];
  const code = script("worker");
  const start = code.indexOf("async function queueWholeTranscript");
  const context = {
    wholeQueued: new Set(),
    rpc: async (command, p) => {
      if (command === "records.get") return { type: "video" };
      if (command === "anchors.list")
        return {
          items: Array.from({ length: 11 }, (_, i) => ({
            id: "a" + i,
            start: i,
          })),
          next: null,
        };
      if (command === "translations.list")
        return { items: [{ anchorId: "a0" }], next: null };
      if (command === "jobs.submit") submissions.push(p);
    },
  };
  await runInNewContext(
    code.slice(start) + '\nqueueWholeTranscript("r");',
    context,
  );
  assert.deepEqual(
    submissions.flatMap((p) => Array.from(p.anchorIds)),
    Array.from({ length: 10 }, (_, i) => "a" + (i + 1)),
  );
  assert.ok(submissions.every((p) => p.anchorIds.length <= 4));
});
async function pageRpc({
  documentUrl,
  currentUrl,
  requestedUrl,
  frameId = 0,
  knownResource = true,
  params,
  command = "resources.upsert",
}) {
  let listener, nativeListener;
  const writes = [];
  const noop = { addListener() {} };
  const port = {
    onMessage: { addListener: (fn) => (nativeListener = fn) },
    onDisconnect: noop,
    postMessage(m) {
      writes.push(m);
      let result = null;
      if (m.command === "resources.upsert")
        result = {
          id: new URL(m.params.url).searchParams.get("v") || "web",
          url: m.params.url,
        };
      if (m.command === "resources.list")
        result = {
          items: knownResource
            ? [
                {
                  id: new URL(currentUrl).searchParams.get("v") || "web",
                  url: m.params.query,
                },
              ]
            : [],
        };
      queueMicrotask(() => nativeListener({ id: m.id, ok: true, result }));
    },
  };
  runInNewContext(script("worker"), {
    importScripts() {},
    crypto: { randomUUID },
    setTimeout,
    clearTimeout,
    setInterval() {},
    queueMicrotask,
    console,
    URL,
    chrome: {
      runtime: {
        getURL: () => "chrome-extension://test/",
        connectNative: () => port,
        onConnect: noop,
        onMessage: { addListener: (fn) => (listener = fn) },
      },
      action: { onClicked: noop },
      sidePanel: { setPanelBehavior() {} },
      tabs: {
        get: async () => ({ id: 1, url: currentUrl, title: "Current video" }),
      },
    },
  });
  const response = await new Promise((resolve) =>
    listener(
      { lc: "rpc", command, params: params || { url: requestedUrl } },
      {
        url: documentUrl,
        frameId,
        tab: { id: 1, url: documentUrl, title: "Initial page" },
      },
      resolve,
    ),
  );
  return { response, writes };
}
test("YouTube same-document navigation authorizes current tab video instead of initial document URL", async () => {
  const { response } = await pageRpc({
    documentUrl: "https://www.youtube.com/",
    currentUrl:
      "https://www.youtube.com/watch?v=videoBBBBBB&list=playlist&t=20",
    requestedUrl: "https://www.youtube.com/watch?v=videoBBBBBB",
  });
  assert.equal(response.ok, true, response.error);
  assert.equal(response.result.id, "videoBBBBBB");
});
test("navigation from video A to B permits B and rejects stale resource A", async () => {
  const base = {
    documentUrl: "https://www.youtube.com/watch?v=videoAAAAAA",
    currentUrl: "https://www.youtube.com/watch?v=videoBBBBBB",
  };
  assert.equal(
    (await pageRpc({ ...base, requestedUrl: base.currentUrl })).response.ok,
    true,
  );
  assert.equal(
    (await pageRpc({ ...base, requestedUrl: base.documentUrl })).response.ok,
    false,
  );
  assert.equal(
    (
      await pageRpc({
        ...base,
        command: "anchors.list",
        params: { resourceId: "videoAAAAAA" },
      })
    ).response.ok,
    false,
  );
});
test("same video ID on another origin and subframe cannot bypass page resource isolation", async () => {
  const base = {
    documentUrl: "https://www.youtube.com/watch?v=videoBBBBBB",
    currentUrl: "https://www.youtube.com/watch?v=videoBBBBBB",
  };
  assert.equal(
    (
      await pageRpc({
        ...base,
        requestedUrl: "https://attacker.example/watch?v=videoBBBBBB",
      })
    ).response.ok,
    false,
  );
  assert.equal(
    (await pageRpc({ ...base, requestedUrl: base.currentUrl, frameId: 2 }))
      .response.ok,
    false,
  );
  assert.equal(
    (
      await pageRpc({
        ...base,
        documentUrl: "https://other.example/",
        requestedUrl: base.currentUrl,
      })
    ).response.ok,
    false,
  );
});

test("resource authorization reads never create a homepage during stale video requests", async () => {
  const moved = await pageRpc({
    documentUrl: "https://www.youtube.com/watch?v=videoAAAAAA",
    currentUrl: "https://www.youtube.com/",
    command: "anchors.list",
    params: { resourceId: "videoAAAAAA" },
    knownResource: false,
  });
  assert.equal(moved.response.ok, false);
  assert.equal(
    moved.writes.some((m) => m.command === "resources.upsert"),
    false,
  );
  const same = await pageRpc({
    documentUrl: "https://www.youtube.com/",
    currentUrl: "https://www.youtube.com/watch?v=videoBBBBBB",
    command: "anchors.list",
    params: { resourceId: "videoBBBBBB" },
  });
  assert.equal(same.response.ok, true, same.response.error);
  assert.equal(
    same.writes.some((m) => m.command === "resources.upsert"),
    false,
  );
});
