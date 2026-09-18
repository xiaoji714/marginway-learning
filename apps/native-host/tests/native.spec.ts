import { test, expect, onTestFinished } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const entry = "apps/native-host/lib/index.js";
test("native framing and CLI share durable records, invalid JSON does not kill the bridge", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lc-native-"));
  const env = { ...process.env, LC_DATA_DIR: dir, LC_EXTENSION_ID: id };
  const child = spawn(
    process.execPath,
    ["--no-warnings", entry, `chrome-extension://${id}/`],
    { env, stdio: ["pipe", "pipe", "pipe"] },
  );
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit");
      child.kill();
      await done;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  let buffer = Buffer.alloc(0),
    seq = 0;
  const pending = new Map<number | undefined, (v: any) => void>();
  child.stdout.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE()) {
      const n = buffer.readUInt32LE(),
        m = JSON.parse(buffer.subarray(4, 4 + n).toString());
      buffer = buffer.subarray(4 + n);
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    }
  });
  const send = (body: string, key: number | undefined) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("native timeout")), 5000);
      pending.set(key, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      const b = Buffer.from(body),
        h = Buffer.alloc(4);
      h.writeUInt32LE(b.length);
      child.stdin.write(h.subarray(0, 2));
      child.stdin.write(Buffer.concat([h.subarray(2), b]));
    });
  const rpc = async (command: string, params = {}) => {
    const n = ++seq;
    const reply = await send(JSON.stringify({ id: n, command, params }), n);
    expect(reply.ok).toBe(true);
    return reply.result;
  };
  expect((await send("{", undefined)).ok).toBe(false);
  const r = await rpc("resources.upsert", {
    url: "https://example.com/learning",
  });
  const a = await rpc("anchors.upsert", {
    resourceId: r.id,
    quote: "Study in context",
  });
  await rpc("notes.append", { anchorId: a.id, text: "Human thought" });
  const cli = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "apps/cli/lib/index.js",
      "notes.append",
      "--actor",
      "Integration Agent",
      "--json",
      JSON.stringify({
        anchorId: a.id,
        text: "Agent follow-up",
        operationId: "native-test",
      }),
    ],
    { env, encoding: "utf8" },
  );
  expect(cli.status, cli.stderr).toBe(0);
  const n = JSON.parse(cli.stdout).result;
  expect(n.origin).toBe("agent");
  const notes = await rpc("notes.list", { resourceId: r.id });
  expect(notes.total).toBe(2);
  expect(notes.items.find((x: any) => x.id === n.id).createdBy.name).toBe(
    "Integration Agent",
  );
});
test.each([
  {
    configured: id,
    origin: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/",
  },
  { configured: "", origin: `chrome-extension://${id}/` },
  { configured: "invalid", origin: `chrome-extension://${id}/` },
])(
  "rejects origin or configuration before opening a database: $configured $origin",
  ({ configured, origin }) => {
    const dir = mkdtempSync(join(tmpdir(), "lc-origin-"));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    const p = spawnSync(process.execPath, [entry, origin], {
      encoding: "utf8",
      env: { ...process.env, LC_DATA_DIR: dir, LC_EXTENSION_ID: configured },
    });
    expect(p.status).toBe(1);
    expect(p.stdout).toBe("");
    expect(existsSync(join(dir, "learning.sqlite"))).toBe(false);
  },
);
