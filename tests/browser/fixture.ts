import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
} from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { openStore } from "../../packages/learning/core/src/store.js";

import { installFixedClock } from "../../scripts/testing/fixed-clock.js";
const fixedNow = "2026-09-21T00:00:00Z";
const videoUrl = "https://www.youtube.com/watch?v=marginway01";
export const test = base.extend<{
  fixture: {
    context: BrowserContext;
    extension: string;
    directory: string;
    resourceId: string;
    anchorId: string;
    cli: (command: string, params?: object) => any;
    metadataRequests: string[];
  };
}>({
  fixture: async ({}, use, testInfo) => {
    if (!process.env.MARGINWAY_CHROME)
      throw Error(
        "Set MARGINWAY_CHROME to Chrome for Testing executable; do not silently substitute Chromium.",
      );
    if (process.platform !== "linux")
      throw Error("Browser harness currently supports isolated Linux CI only.");
    const directory = mkdtempSync(join(tmpdir(), "marginway-browser-"));
    const extensionPath = resolve("apps/extension/lib");
    // Unpacked extensions without a key use a SHA-256-derived path identity.
    const extension = createHash("sha256")
      .update(extensionPath)
      .digest("hex")
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    const data = join(directory, "data");
    mkdirSync(data, { recursive: true });
    const restoreClock = installFixedClock(fixedNow);
    const store = openStore(join(data, "learning.sqlite"));
    const human = { origin: "human", id: "chrome-ui", name: "Fixture" };
    const resource = store.execute(
      "resources.upsert",
      { url: videoUrl, title: "Learning in context", tags: ["AI"] },
      human,
    );
    const anchors = [0, 10, 20].map((start, i) =>
      store.execute(
        "anchors.upsert",
        {
          resourceId: resource.id,
          start,
          end: start + 10,
          quote: [
            "Context makes learning meaningful.",
            "Agents connect ideas across resources.",
            "Keep your own thoughts beside the source.",
          ][i],
        },
        human,
      ),
    );
    const job = store.execute(
      "jobs.submit",
      {
        type: "translate",
        resourceId: resource.id,
        anchorIds: anchors.map((a) => a.id),
      },
      human,
    );
    store.execute("jobs.claim", {}, human);
    store.execute(
      "jobs.complete",
      {
        id: job.id,
        translations: anchors.map((a, i) => ({
          id: a.id,
          text: [
            "语境让学习更有意义。",
            "Agent 把不同资料中的想法连接起来。",
            "在原文旁留下自己的思考。",
          ][i],
        })),
      },
      human,
    );
    store.execute(
      "vocabulary.save",
      { anchorId: anchors[0]!.id, word: "Context", meaning: "语境" },
      human,
    );
    const lookup = store.execute(
      "jobs.submit",
      {
        type: "lookup",
        resourceId: resource.id,
        anchorId: anchors[0]!.id,
        text: "Context",
      },
      human,
    );
    store.execute("jobs.claim", {}, human);
    store.execute("jobs.complete", { id: lookup.id, text: "语境" }, human);
    store.close();
    restoreClock();
    const launcher = join(directory, "native-host");
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    writeFileSync(
      launcher,
      `#!/bin/sh\nexport LC_DATA_DIR=${quote(data)}\nexport LC_EXTENSION_ID=${quote(extension)}\nexport LC_TEST_NOW=${quote(fixedNow)}\nexec ${quote(process.execPath)} --no-warnings --import ${quote(resolve("node_modules/tsx/dist/loader.mjs"))} --import ${quote(resolve("scripts/testing/fixed-clock.ts"))} ${quote(resolve("apps/native-host/lib/index.js"))} "$@"\n`,
      { mode: 0o700 },
    );
    const config = join(directory, "config");
    for (const hosts of [
      ...["google-chrome", "google-chrome-for-testing", "chromium"].map(
        (product) => join(config, product, "NativeMessagingHosts"),
      ),
      join(directory, "profile", "NativeMessagingHosts"),
    ]) {
      mkdirSync(hosts, { recursive: true });
      writeFileSync(
        join(hosts, "com.learning_companion.host.json"),
        JSON.stringify({
          name: "com.learning_companion.host",
          description: "Marginway isolated browser test",
          path: launcher,
          type: "stdio",
          allowed_origins: [`chrome-extension://${extension}/`],
        }),
      );
    }
    const cli = (command: string, params: object = {}) => {
      const p = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          "--import",
          resolve("node_modules/tsx/dist/loader.mjs"),
          "--import",
          resolve("scripts/testing/fixed-clock.ts"),
          resolve("apps/cli/lib/index.js"),
          command,
          "--json",
          JSON.stringify(params),
          "--actor",
          "Browser acceptance",
          "--model",
          "test",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            LC_DATA_DIR: data,
            LC_TEST_NOW: "2026-09-21T00:01:00Z",
          },
        },
      );
      if (p.status !== 0) throw Error(p.stderr);
      return JSON.parse(p.stdout).result;
    };
    let context: BrowserContext | undefined;
    const paidRequests: string[] = [];
    const metadataRequests: string[] = [];
    try {
      context = await chromium.launchPersistentContext(
        join(directory, "profile"),
        {
          executablePath: process.env.MARGINWAY_CHROME,
          headless: false,
          viewport: { width: 1280, height: 900 },
          locale: "zh-CN",
          timezoneId: "Asia/Shanghai",
          env: { ...process.env, HOME: directory, XDG_CONFIG_HOME: config },
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            "--no-sandbox",
          ],
        },
      );
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (["api.deepseek.com", "api.supadata.ai"].includes(url.hostname))
          paidRequests.push(url.href);
        if (url.hostname === "www.youtube.com" && url.pathname === "/oembed")
          metadataRequests.push(url.href);
      });
      await context.addInitScript(
        ({ now }) => {
          const Original = Date;
          const value = Original.parse(now);
          globalThis.Date = new Proxy(Original, {
            construct(target, args) {
              return Reflect.construct(target, args.length ? args : [value]);
            },
            apply() {
              return new Original(value).toString();
            },
            get(target, key, receiver) {
              return key === "now"
                ? () => value
                : Reflect.get(target, key, receiver);
            },
          });
        },
        { now: fixedNow },
      );
      await context.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        if (
          u.hostname === "api.supadata.ai" ||
          u.hostname === "api.deepseek.com"
        ) {
          paidRequests.push(u.hostname);
          await route.abort();
          return;
        }
        if (u.hostname === "www.youtube.com") {
          if (u.pathname === "/oembed") {
            await route.fulfill({ json: { title: "Learning in context" } });
            return;
          }
          await route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><html lang="en"><head><title>Learning in context</title><style>body{margin:32px;font:18px sans-serif;background:#fff}#player{height:320px;background:#183b36;border-radius:12px}video{width:100%;height:100%}</style></head><body><main><h1>Learning in context</h1><div id="player"><video preload="none" controls></video></div></main></body></html>',
          });
          return;
        }
        if (["http:", "https:"].includes(u.protocol)) {
          await route.abort();
          return;
        }
        await route.continue();
      });
      const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker"));
      expect(new URL(worker.url()).host).toBe(extension);
      await expect
        .poll(() => cli("status").bridge?.at, { timeout: 15000 })
        .toBeTruthy();
      await testInfo.attach("browser", {
        body: context.browser()!.version(),
        contentType: "text/plain",
      });
      await use({
        context,
        extension,
        directory,
        resourceId: resource.id,
        anchorId: anchors[0]!.id,
        cli,
        metadataRequests,
      });
      expect(
        paidRequests,
        "cached workflows must not contact paid providers",
      ).toEqual([]);
      expect(
        cli("jobs.list").items.filter((j: any) => j.type === "transcript"),
      ).toHaveLength(0);
      expect(
        cli("jobs.list").items.filter((j: any) => j.type === "lookup"),
      ).toHaveLength(1);
    } finally {
      await context?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
});
export { expect, videoUrl };
