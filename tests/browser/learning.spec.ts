import { test, expect, videoUrl } from "./fixture.js";

test("paused video → note → library → Agent writeback, with visual checkpoints", async ({
  fixture,
}, testInfo) => {
  const { context, extension, cli, anchorId } = fixture;
  const page = await context.newPage();
  await page.goto(videoUrl);
  const caption = page.getByRole("region", { name: "语境双语字幕" });
  // section has an accessible name and implicit region role.
  await expect(caption).toContainText("语境让学习更有意义");
  await expect(page.locator("#learning-companion-subtitles")).toHaveCount(1);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  await expect(caption).toHaveScreenshot("paused-bilingual.png");
  await caption.getByRole("button", { name: "记笔记", exact: true }).click();
  const card = page.getByRole("region", { name: "学习选区" });
  await expect(card).toBeVisible();
  await card.locator("textarea").fill("A thought beside the original context.");
  await expect(card).toHaveScreenshot("thought-card.png");
  await card.getByRole("button", { name: "保存笔记" }).click();
  await expect.poll(() => cli("notes.list").total).toBe(1);
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extension}/library.html`);
  await expect(library.locator("#status")).not.toHaveClass(/error/);
  await library.getByRole("button", { name: "思考笔记", exact: true }).click();
  await expect(library.locator("#content")).toContainText(
    "A thought beside the original context.",
  );
  await expect(library.locator("main")).toHaveScreenshot("library-notes.png");
  cli("notes.append", {
    anchorId,
    text: "Agent follow-up from the original context.",
    operationId: "browser-agent-note",
  });
  await expect(library.locator("#content")).toContainText("Agent follow-up");
  await expect(library.locator("#content")).toContainText("Browser acceptance");
  await expect(library.locator("main")).toHaveScreenshot(
    "library-agent-writeback.png",
  );
  expect(
    cli("notes.list").items.find((n: any) => n.text.startsWith("Agent")).origin,
  ).toBe("agent");
  await testInfo.attach("flow", {
    body: JSON.stringify({ paused: true, notes: cli("notes.list").total }),
    contentType: "application/json",
  });
});

test("library categories and settings keep consistent layout at desktop and narrow widths", async ({
  fixture,
}) => {
  const page = await fixture.context.newPage();
  await page.goto(`chrome-extension://${fixture.extension}/library.html`);
  for (const width of [1280, 600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, key] of [
      ["学习统计", "stats"],
      ["全部资源", "resources"],
      ["单词簿", "vocabulary"],
      ["思考笔记", "notes"],
      ["今日复习", "review"],
      ["任务状态", "jobs"],
      ["回收站", "trash"],
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator("#breadcrumbs")).toContainText(name!);
      await expect(page.locator("main")).toHaveScreenshot(
        `${key}-${width}.png`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.goto(`chrome-extension://${fixture.extension}/options.html`);
  await expect(page.locator("#aiApiKey")).toHaveValue("");
  await expect(page).toHaveScreenshot("settings-empty.png");
});
