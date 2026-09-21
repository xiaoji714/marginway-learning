import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { openStore } from "../../../packages/learning/core/src/store.js";
const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const entry = process.env.LC_RUNTIME_COVERAGE
  ? "apps/native-host/lib/index.coverage.js"
  : "apps/native-host/lib/index.js";

test("native stream handles coalesced frames, change notifications, oversized output and clean EOF", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "marginway-protocol-"));
  const store = openStore(join(dir, "learning.sqlite"));
  const actor = { origin: "human", id: "chrome-ui", name: "Fixture" };
  const r = store.execute(
    "resources.upsert",
    { url: "https://example.com/native" },
    actor,
  );
  const a = store.execute(
    "anchors.upsert",
    { resourceId: r.id, quote: "Fixture" },
    actor,
  );
  for (let i = 0; i < 120; i++)
    store.execute(
      "notes.append",
      { anchorId: a.id, text: "x".repeat(10000) },
      actor,
    );
  const child = spawn(process.execPath, [entry, `chrome-extension://${id}/`], {
    env: { ...process.env, LC_DATA_DIR: dir, LC_EXTENSION_ID: id },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.onTestFinished(async () => {
    if (child.exitCode === null) {
      const done = once(child, "exit");
      child.stdin.end();
      await done;
    }
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let buffer = Buffer.alloc(0);
  const replies: any[] = [];
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE() + 4) {
      const len = buffer.readUInt32LE();
      replies.push(JSON.parse(buffer.subarray(4, 4 + len).toString()));
      buffer = buffer.subarray(4 + len);
    }
  });
  const frame = (value: any) => {
    const body = Buffer.from(JSON.stringify(value));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    return Buffer.concat([header, body]);
  };
  child.stdin.write(
    Buffer.concat([
      frame(null),
      frame({ id: 1, command: "missing" }),
      frame({ id: 2, command: "export" }),
    ]),
  );
  await expect.poll(() => replies.length).toBeGreaterThanOrEqual(3);
  expect(replies.find((x) => x.id === 2).error.code).toBe("TOO_LARGE");
  expect(replies.find((x) => x.id === 1).ok).toBe(false);
  expect(replies.find((x) => x.id === undefined).error.code).toBe("INTERNAL");
  await new Promise((resolve) => setTimeout(resolve, 950));
  store.execute(
    "notes.append",
    { anchorId: a.id, text: "new external note" },
    actor,
  );
  await expect
    .poll(() => replies.some((x) => x.event === "changed"), { timeout: 5000 })
    .toBe(true);
  child.stdin.write(frame({ id: 3, command: "stats" }).subarray(0, 7));
  const exited = once(child, "exit");
  child.stdin.end();
  expect((await exited)[0]).toBe(0);
});

test("native rejects oversized incoming frames before parsing content", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "marginway-frame-"));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(16000001);
  const result = spawnSync(
    process.execPath,
    [entry, `chrome-extension://${id}/`],
    {
      input: header,
      env: { ...process.env, LC_DATA_DIR: dir, LC_EXTENSION_ID: id },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stdout.length).toBe(0);
});
