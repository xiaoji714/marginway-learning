import { test, expect, onTestFinished } from "vitest";
import { JSDOM } from "jsdom";
import { evaluate } from "./support.js";
const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture(t: any, handler: (m: any) => any) {
  const dom = new JSDOM("<body></body>", {
    url: "https://example.com/",
    runScripts: "outside-only",
  });
  const w = dom.window as any;
  onTestFinished(() => w.close());
  const realTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn: any, ms: number) => realTimeout(fn, ms === 750 ? 0 : ms);
  w.chrome = {
    runtime: {
      getURL: (s: string) => "chrome-extension://test/" + s,
      sendMessage: async (m: any) => ({ ok: true, result: await handler(m) }),
    },
  };
  w.document.execCommand = () => false;
  evaluate(w, "common");
  const create = (selected = "word", url = "https://example.com/") =>
    w.LC.discussionCard({
      container: w.document.body,
      resource: { id: "r", url },
      anchor: { id: "a", quote: "A word in context", start: null },
      selected,
    });
  return { w, create };
}
const button = (card: any, label: string) =>
  Array.from(card.querySelectorAll("button")).find((b: any) =>
    b.textContent.includes(label),
  ) as HTMLButtonElement;

test("card handles blank thought, icon sources and fallback clipboard success/failure", async (t) => {
  const messages: any[] = [];
  const { w, create } = fixture(t, (m) => {
    messages.push(m);
    return m.command === "discussions.create"
      ? { id: "d" }
      : m.command === "context.export"
        ? { prompt: "Use marginway skill. anchorId=a" }
        : { items: [], next: null };
  });
  evaluate(w, "common"); // reinjection must preserve the original helper and events.
  const card = create("", "file:///untrusted");
  button(card, "保存笔记").click();
  await tick();
  expect(card.textContent).toContain("先写下想法");
  expect(card.querySelector("textarea")).toBe(w.document.activeElement);
  expect(card.querySelector("img").src).toContain(
    "chrome-extension://test/icons",
  );
  button(card, "在 Agent").click();
  await tick();
  expect(card.textContent).toContain("请手动复制");
  expect(card.querySelector("textarea[readonly]").value).toContain(
    "anchorId=a",
  );
  expect(
    messages.find((m) => m.command === "discussions.create").params.question,
  ).toContain("A word in context");
  w.document.execCommand = () => true;
  button(card, "在 Agent").click();
  await tick();
  expect(card.textContent).toContain("已复制");
  expect(card.querySelector(".lc-source")).toBeNull();
});

test.each(["error", "cancelled", "empty", "timeout"])(
  "lookup reports %s without editable translation controls",
  async (mode, t) => {
    let reads = 0;
    const { create } = fixture(t, (m) => {
      if (m.command === "occurrences.list") return { items: [], next: null };
      if (m.command === "jobs.submit") return { id: "j" };
      reads++;
      return mode === "empty"
        ? { status: "done" }
        : {
            status: mode === "timeout" ? "running" : mode,
            error: mode === "error" ? "provider unavailable" : undefined,
          };
    });
    const card = create();
    await expect
      .poll(() => card.querySelector(".lc-meaning").textContent, {
        timeout: 5000,
      })
      .not.toBe("正在翻译…");
    // Wait for the queued initial lookup; a pre-timer empty DOM is not success.
    await expect.poll(() => reads).toBeGreaterThan(0);
    if (mode === "timeout")
      await expect
        .poll(() => card.textContent, { timeout: 5000 })
        .toContain("翻译仍在执行");
    if (mode === "error")
      await expect
        .poll(() => card.textContent)
        .toContain("provider unavailable");
    if (mode === "cancelled")
      await expect.poll(() => card.textContent).toContain("翻译未完成");
    if (mode === "empty")
      expect(card.querySelector(".lc-definition").textContent).toBe("");
    expect(card.querySelectorAll("textarea")).toHaveLength(1);
  },
);

test("closing during lookup and save prevents late results from altering another card", async (t) => {
  let resolveLookup: any, resolveSave: any;
  const { create } = fixture(t, (m) => {
    if (m.command === "occurrences.list") return { items: [], next: null };
    if (m.command === "jobs.submit") return { id: "j" };
    if (m.command === "jobs.get")
      return new Promise((r) => (resolveLookup = r));
    if (m.command === "vocabulary.save")
      return new Promise((r) => (resolveSave = r));
  });
  const first = create();
  await expect.poll(() => !!resolveLookup).toBe(true);
  button(first, "收藏单词").click();
  await tick();
  button(first, "关闭").click();
  resolveLookup({ status: "done", result: "Late" });
  resolveSave({ id: "v" });
  await tick();
  expect(first.isConnected).toBe(false);
  expect(first.textContent).not.toContain("Late");
  first.dispose();
});

test("typing while a note saves preserves the newer thought; API failures remain visible", async (t) => {
  let resolveSave: any;
  const { create, w } = fixture(t, (m) => {
    if (m.command === "notes.append")
      return new Promise((r) => (resolveSave = r));
    return { items: [], next: null };
  });
  const card = create("");
  const input = card.querySelector("textarea");
  input.value = "first";
  button(card, "保存笔记").click();
  await tick();
  input.value = "new thought";
  resolveSave({ id: "n" });
  await tick();
  expect(input.value).toBe("new thought");
  w.chrome.runtime.sendMessage = async () => undefined;
  button(card, "保存笔记").click();
  await tick();
  expect(card.textContent).toContain("扩展已更新");
});

test("job waiter handles cancelled, error and timeout, with queued status callbacks", async (t) => {
  let mode = "cancelled";
  let polls = 0;
  const { w } = fixture(t, () => {
    polls++;
    return { status: mode, error: mode === "error" ? "failure" : undefined };
  });
  await expect(w.LC.waitJob("j")).rejects.toThrow("任务已取消");
  mode = "error";
  await expect(w.LC.waitJob("j")).rejects.toThrow("failure");
  mode = "queued";
  const statuses: string[] = [];
  await expect(
    w.LC.waitJob("j", (s: string) => statuses.push(s)),
  ).rejects.toThrow("任务仍在执行");
  expect(statuses).toHaveLength(240);
  expect(polls).toBe(242);
});

test("completed lookup goes into the short discussion request and redundant collect events are harmless", async (t) => {
  const calls: any[] = [];
  let occurrences: any;
  const { create, w } = fixture(t, (m) => {
    calls.push(m);
    if (m.command === "occurrences.list")
      return new Promise((r) => (occurrences = r));
    if (m.command === "jobs.submit") return { id: "j" };
    if (m.command === "jobs.get") return { status: "done", result: "释义" };
    if (m.command === "discussions.create") return { id: "d" };
    if (m.command === "context.export") return { prompt: "short" };
    return {};
  });
  const card = create();
  await expect
    .poll(() => card.querySelector(".lc-definition")?.textContent)
    .toBe("释义");
  button(card, "在 Agent").click();
  await tick();
  expect(
    calls.find((m) => m.command === "discussions.create").params
      .selectionTranslation,
  ).toBe("释义");
  button(card, "收藏单词").click();
  await tick();
  occurrences({ items: [], next: null });
  await tick();
  const collect = button(card, "已收藏");
  collect.dispatchEvent(new w.MouseEvent("click"));
  await tick();
  expect(calls.filter((m) => m.command === "vocabulary.save")).toHaveLength(1);
});

test("disposed card ignores pending lookup submission, rejection and already queued callbacks", async (t) => {
  for (const mode of [
    "submission",
    "lookup-reject",
    "save-reject",
    "callback",
  ]) {
    let resolvePending: any, rejectPending: any;
    let scheduled: any;
    const { create, w } = fixture(t, (m) => {
      if (m.command === "occurrences.list") return { items: [], next: null };
      if (
        (mode === "submission" && m.command === "jobs.submit") ||
        (mode === "lookup-reject" && m.command === "jobs.get") ||
        (mode === "save-reject" && m.command === "notes.append")
      )
        return new Promise((resolve, reject) => {
          resolvePending = resolve;
          rejectPending = reject;
        });
      return { id: "j", status: "done", result: "word" };
    });
    if (mode === "callback")
      w.setTimeout = (fn: any) => {
        scheduled = fn;
        return 1;
      };
    const card = create();
    if (mode === "save-reject") {
      card.querySelector("textarea").value = "thought";
      button(card, "保存笔记").click();
    }
    if (mode !== "callback")
      await expect.poll(() => !!resolvePending).toBe(true);
    button(card, "关闭").click();
    if (mode === "submission") resolvePending({ id: "j" });
    else if (mode === "callback") scheduled();
    else rejectPending(Error("late failure"));
    await tick();
    expect(card.isConnected).toBe(false);
    expect(card.textContent).not.toContain("late failure");
  }
});

test("caption provenance and clipboard denial remain actionable", (t) => {
  const { w } = fixture(t, () => ({}));
  expect(w.LC.isCaption({ origin: "import" })).toBe(false);
  expect(
    w.LC.isCaption({
      origin: "import",
      createdBy: { id: "supadata" },
      start: null,
    }),
  ).toBe(false);
  w.LC.captionFailure(w.document.body, "HTTP 500", () => {}, {
    url: "https://example.com/",
  });
  button(w.document.body, "复制诊断").click();
  return expect.poll(() => w.document.body.textContent).toContain("复制失败");
});
