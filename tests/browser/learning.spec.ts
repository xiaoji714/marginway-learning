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
  expect(fixture.metadataRequests.length).toBeGreaterThan(0);
  expect(new URL(fixture.metadataRequests[0]!).searchParams.get("url")).toBe(
    videoUrl,
  );
  await expect(page.locator("#learning-companion-subtitles")).toHaveCount(1);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  await expect(caption).toHaveScreenshot("paused-bilingual.png");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(videoUrl).origin,
  });
  await caption.locator(".original").dblclick({ position: { x: 30, y: 12 } });
  const selectedCard = page.getByRole("region", { name: "学习选区" });
  await expect(selectedCard.locator(".lc-word")).toHaveText("Context");
  await expect(selectedCard.locator(".lc-definition")).toHaveText("语境");
  await expect(
    selectedCard.getByRole("button", { name: /已收藏/ }),
  ).toBeDisabled();
  await expect(selectedCard).toHaveScreenshot("saved-word-card.png");
  await selectedCard.getByRole("button", { name: "在 Agent 中讨论" }).click();
  await expect(selectedCard).toContainText("已复制");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.length).toBeLessThanOrEqual(2000);
  expect(copied).toContain(anchorId);
  expect(copied).toContain("SKILL.md");
  expect(copied).not.toContain('"context":');
  await selectedCard.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(selectedCard).toHaveCount(0);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
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
      await expect(page.locator("#status")).not.toHaveClass(/error/);
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

test("library edits preserve context, conflicts preserve drafts, deletion can be restored", async ({
  fixture,
}) => {
  const { context, extension, cli, anchorId, resourceId } = fixture;
  const original = cli("notes.append", {
    anchorId,
    text: "Original test thought",
    operationId: "edit-fixture",
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extension}/library.html`);
  await page.getByRole("button", { name: "思考笔记", exact: true }).click();
  await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("笔记内容").fill("My unsaved draft");
  cli("notes.update", {
    id: original.id,
    expectedRevision: original.revision,
    text: "External newer thought",
    operationId: "external-edit",
  });
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toContainText("内容已保留");
  await expect(dialog.getByLabel("笔记内容")).toHaveValue("My unsaved draft");
  expect(cli("records.get", { id: original.id }).text).toBe(
    "External newer thought",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#content")).toContainText(
    "External newer thought",
  );
  await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("笔记内容").fill("Reconciled thought");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#content")).toContainText("Reconciled thought");
  expect(cli("records.get", { id: original.id }).anchorId).toBe(anchorId);
  await page.getByRole("button", { name: "删除笔记", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "移入回收站", exact: true })
    .click();
  await expect.poll(() => cli("notes.list").total).toBe(0);
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await expect(page.locator("#content")).toContainText("Reconciled thought");
  await page
    .locator("#content")
    .getByRole("button", { name: "恢复", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "恢复", exact: true })
    .click();
  await expect.poll(() => cli("notes.list").total).toBe(1);
  await page.getByRole("button", { name: "全部资源", exact: true }).click();
  await page.getByRole("button", { name: "编辑资源", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("资源标题").fill("Renamed resource");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#content")).toContainText("Renamed resource");
  expect(cli("records.get", { id: resourceId }).url).toBe(videoUrl);
  await page.getByRole("button", { name: "单词簿", exact: true }).click();
  await page.getByRole("button", { name: "编辑单词", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("单词或短语").fill("context");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".word-title")).toHaveText("context");
});
