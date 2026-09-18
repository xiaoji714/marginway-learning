import {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import assert from "node:assert/strict";
const temp = mkdtempSync(join(tmpdir(), "context-release-"));
try {
  const entries = unzipSync(readFileSync("dist/marginway-learning-0.2.0.zip"));
  for (const [file, content] of Object.entries(entries)) {
    assert(!/(?:node_modules|\/src\/|\.sqlite|\.env)/.test(file), file);
    assert(!file.split("/").includes(".."));
    const target = join(temp, "media", file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    if (/\.(js|html|json)$/.test(file))
      assert(
        !/\/Users\/[^/]+\/(?:xj|Projects|Documents)\//.test(strFromU8(content)),
        file,
      );
  }
  const home = join(temp, "home"),
    dir = join(temp, "chosen-extension");
  const installed = spawnSync(
    process.execPath,
    [
      join(temp, "media/runtime/install.js"),
      "--home",
      home,
      "--extension-id",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--extension-dir",
      dir,
    ],
    { encoding: "utf8" },
  );
  assert.equal(installed.status, 0, installed.stderr);
  const env = { ...process.env, LC_DATA_DIR: join(temp, "data") };
  const cli = join(home, ".local/share/learning-companion/runtime/learning.js");
  const run = (...args: string[]) => {
    const p = spawnSync(process.execPath, ["--no-warnings", cli, ...args], {
      encoding: "utf8",
      env,
    });
    assert.equal(p.status, 0, p.stderr);
    return JSON.parse(p.stdout).result;
  };
  // Prove the installed CLI does not depend on the extracted media or source checkout.
  rmSync(join(temp, "media"), { recursive: true });
  assert(run("capabilities").commands["notes.append"]);
  const r = run(
    "resources.upsert",
    "--json",
    JSON.stringify({ url: "https://example.com/release" }),
  );
  assert.equal(run("resources.list").items[0].id, r.id);
  assert.equal(
    JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).version,
    "0.2.0",
  );
  console.log(
    "Release extraction, configurable installation and independent CLI persistence passed.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
