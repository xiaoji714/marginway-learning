import { test, expect } from "vitest";
import { runInContext } from "node:vm";
import { script, createContext } from "./support.js";
function fixture(
  reply: (url: string, body: any) => any,
  settings: Record<string, string> = {
    aiApiKey: "test-ai",
    supadataApiKey: "test-subtitle",
  },
) {
  const calls: { url: string; body: any }[] = [];
  const sandbox: any = {
    console,
    URL,
    URLSearchParams,
    AbortSignal,
    setTimeout: (fn: () => void) => {
      queueMicrotask(fn);
      return 1;
    },
    chrome: {
      storage: {
        local: {
          setAccessLevel: async () => {},
          get: async () => ({ context_settings: settings }),
        },
      },
    },
    fetch: async (url: string, body: any) => {
      calls.push({ url: String(url), body });
      return reply(String(url), body);
    },
  };
  const ctx = createContext(sandbox);
  sandbox.importScripts = () => runInContext(script("settings"), ctx);
  runInContext(script("providers"), ctx);
  return { ctx, calls };
}
const response = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
test("independent settings and native subtitle adapter strip tracking parameters", async () => {
  const { ctx, calls } = fixture(() =>
    response({
      content: [
        { text: "Hello", offset: 3200, duration: 1400 },
        { text: "invalid", offset: -1 },
      ],
    }),
  );
  const r = await ctx.handleFetchTranscript("abcdefghijk");
  expect(r.transcript).toEqual([{ text: "Hello", start: 3.2, duration: 1.4 }]);
  const u = new URL(calls[0]!.url);
  expect(u.searchParams.get("mode")).toBe("native");
  expect(u.searchParams.get("url")).toBe(
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});
test("DeepSeek request preserves nonthinking mode and key isolation", async () => {
  const { ctx, calls } = fixture(() =>
    response({ choices: [{ message: { content: "语境" } }] }),
  );
  expect(
    (
      await ctx.requestAiCompletion({
        messages: [{ role: "user", content: "Hello" }],
      })
    ).text,
  ).toBe("语境");
  expect(JSON.parse(calls[0]!.body.body).thinking.type).toBe("disabled");
  expect(calls[0]!.body.headers.Authorization).toBe("Bearer test-ai");
});
test("subtitle adapter reports unavailable, rejected and pending responses", async () => {
  for (const status of [206, 401, 429]) {
    const { ctx } = fixture(() => response({}, status));
    expect((await ctx.handleFetchTranscript("abcdefghijk")).success).toBe(
      false,
    );
  }
  const { ctx, calls } = fixture(() => response({}), {});
  expect((await ctx.handleFetchTranscript("bad")).success).toBe(false);
  expect((await ctx.handleFetchTranscript("abcdefghijk")).success).toBe(false);
  expect(calls).toHaveLength(0);
  await expect(ctx.requestAiCompletion({ messages: [] })).rejects.toThrow();
});
test("asynchronous native subtitle response is polled and normalized", async () => {
  let n = 0;
  const { ctx } = fixture(() =>
    response(
      n++
        ? { status: "completed", content: [{ text: "Caption", offset: 0 }] }
        : { jobId: "safe-id" },
      n === 1 ? 202 : 200,
    ),
  );
  expect(
    (await ctx.handleFetchTranscript("abcdefghijk")).transcript[0].start,
  ).toBe(0);
});
test("translation batch preserves exact IDs and rejects missing/duplicate outputs", async () => {
  for (const segments of [
    [{ id: "a", text: "翻译" }],
    [{ id: "wrong", text: "翻译" }],
    [{ id: "a", text: "" }],
    [],
  ]) {
    const { ctx } = fixture(() =>
      response({
        choices: [{ message: { content: JSON.stringify({ segments }) } }],
      }),
    );
    const r = await ctx.handleTranslateContent(
      { segments: [{ id: "a", text: "Source" }] },
      "transcriptBatch",
      "zh",
      "Title",
    );
    expect(r.success).toBe(
      segments.length === 1 && segments[0]?.id === "a" && !!segments[0]?.text,
    );
  }
});

test("provider rejects malformed text, batches and exhausted polling without paid retries", async () => {
  for (const payload of [
    {},
    { choices: [] },
    { choices: [{}] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: 1 } }] },
    { choices: [{ message: { content: "  " } }] },
  ]) {
    const { ctx } = fixture(() => response(payload));
    await expect(
      ctx.requestAiCompletion({ messages: [], maxTokens: 50, temperature: 0 }),
    ).rejects.toThrow("模型未返回有效文本");
  }
  for (const content of [
    {},
    { segments: [] },
    { segments: Array(5).fill({ id: "a", text: "x" }) },
  ]) {
    const { ctx, calls } = fixture(() => {
      throw Error("must not call");
    });
    expect(
      (await ctx.handleTranslateContent(content, "", "", "")).success,
    ).toBe(false);
    expect(calls).toHaveLength(0);
  }
  for (const text of [
    "not JSON",
    "{}",
    '{"segments":[{"id":"a","text":1}]}',
    '{"segments":[{"id":"a","text":"x"},{"id":"a","text":"y"}]}',
  ]) {
    const { ctx } = fixture(() =>
      response({ choices: [{ message: { content: text } }] }),
    );
    const segments = text.includes('"y"')
      ? [
          { id: "a", text: "x" },
          { id: "b", text: "y" },
        ]
      : [{ id: "a", text: "x" }];
    expect(
      (await ctx.handleTranslateContent({ segments }, "", "", "")).success,
    ).toBe(false);
  }
  for (const data of [
    { content: [] },
    {
      content: [
        { text: 3, offset: 0 },
        { text: "x", offset: "0" },
      ],
    },
    { status: "failed" },
    { status: "running" },
  ]) {
    let n = 0;
    const { ctx, calls } = fixture(() =>
      response(n++ === 0 ? { jobId: "a/b" } : data),
    );
    expect((await ctx.handleFetchTranscript("abcdefghijk")).success).toBe(
      false,
    );
    expect(calls[1]!.url).toContain("a%2Fb");
    expect(calls.length).toBe(data.status === "running" ? 41 : 2);
  }
  const { ctx } = fixture(() =>
    response({ content: [{ text: "x", offset: 10, duration: -2 }] }),
  );
  expect((await ctx.handleFetchTranscript("abcdefghijk")).transcript).toEqual([
    { text: "x", start: 0.01, duration: 0 },
  ]);
});

test("settings normalize missing and invalid data without accepting arbitrary endpoints", () => {
  const { ctx } = fixture(() => response({}));
  for (const value of [
    undefined,
    null,
    false,
    "invalid",
    { aiApiKey: 3, supadataApiKey: [] },
  ]) {
    const config = ctx.CONTEXT_SETTINGS.normalize(value);
    expect(config.aiApiKey).toBe("");
    expect(config.supadataApiKey).toBe("");
    expect(config.aiBaseUrl).toBe("https://api.deepseek.com");
  }
});

test("subtitle failures distinguish provider HTTP, network and deadline without leaking response bodies", async () => {
  for (const [status, expected] of [
    [401, "授权失败"],
    [403, "授权失败"],
    [402, "额度"],
    [429, "受限"],
    [500, "HTTP 500"],
  ] as const) {
    const { ctx, calls } = fixture(() =>
      response({ secret: "must-not-leak" }, status),
    );
    const r = await ctx.handleFetchTranscript("abcdefghijk");
    expect(r.message).toContain(expected);
    expect(r.message).not.toContain("must-not-leak");
    expect(calls).toHaveLength(1);
  }
  for (const [name, expected] of [
    ["TimeoutError", "90 秒"],
    ["AbortError", "90 秒"],
    ["TypeError", "检查网络"],
  ]) {
    const { ctx } = fixture(() => {
      throw Object.assign(new Error("test-subtitle"), { name });
    });
    const r = await ctx.handleFetchTranscript("abcdefghijk");
    expect(r.message).toContain(expected);
    expect(r.message).not.toContain("test-subtitle");
  }
});

test("AI HTTP errors remain explicit", async () => {
  const { ctx } = fixture(() => response({}, 503));
  await expect(ctx.requestAiCompletion({ messages: [] })).rejects.toThrow(
    "503",
  );
});
