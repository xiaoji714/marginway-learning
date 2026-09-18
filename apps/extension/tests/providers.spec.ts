import { test, expect } from "vitest";
import { createContext, runInContext } from "node:vm";
import { script } from "./support.js";
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
