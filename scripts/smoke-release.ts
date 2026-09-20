import {
  existsSync,
  realpathSync,
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
import { checkVersions } from "./version.js";
const version = checkVersions();
const temp = mkdtempSync(join(tmpdir(), "context-release-"));
try {
  const entries = unzipSync(
    readFileSync(`dist/marginway-learning-${version}.zip`),
  );
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
  const unpackedSkill = spawnSync(
    process.execPath,
    ["--no-warnings", join(temp, "media/runtime/learning.js"), "skill"],
    { encoding: "utf8" },
  );
  assert.equal(unpackedSkill.status, 0, unpackedSkill.stderr);
  assert.equal(
    realpathSync(JSON.parse(unpackedSkill.stdout).result.path),
    realpathSync(join(temp, "media/skills/SKILL.md")),
  );
  const home = join(temp, "home"),
    dir = join(temp, "chosen-extension");
  const foreign = join(temp, "unrelated-folder");
  mkdirSync(foreign);
  writeFileSync(join(foreign, "keep.txt"), "unrelated data");
  const rejected = spawnSync(
    process.execPath,
    [
      join(temp, "media/runtime/install.js"),
      "--skip-registration",
      "--home",
      home,
      "--extension-id",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--extension-dir",
      foreign,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.equal(
    readFileSync(join(foreign, "keep.txt"), "utf8"),
    "unrelated data",
  );
  assert(!existsSync(join(home, ".local/share/learning-companion/runtime")));
  const installed = spawnSync(
    process.execPath,
    [
      join(temp, "media/runtime/install.js"),
      "--skip-registration",
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

  assert(run("capabilities").commands["notes.append"]);
  const r = run(
    "resources.upsert",
    "--json",
    JSON.stringify({ url: "https://example.com/release" }),
  );
  writeFileSync(join(dir, "obsolete.js"), "old output");
  const upgraded = spawnSync(
    process.execPath,
    [
      join(temp, "media/runtime/install.js"),
      "--skip-registration",
      "--home",
      home,
      "--extension-id",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--extension-dir",
      dir,
    ],
    { encoding: "utf8" },
  );
  assert.equal(upgraded.status, 0, upgraded.stderr);
  assert(!existsSync(join(dir, "obsolete.js")));
  rmSync(join(temp, "media"), { recursive: true });
  assert.equal(run("resources.list").items[0].id, r.id);
  assert.equal(run("--version").version, version);
  assert.match(run("skill").content, /Marginway/);
  assert(existsSync(run("skill").path));
  assert(existsSync(join(dirname(run("skill").path), "references/usage.md")));
  assert.match(installed.stdout, /Skill:/);
  const info = JSON.parse(strFromU8(entries["build-info.json"]!));
  assert.equal(info.version, version);
  assert.match(info.commit, /^[a-f0-9]{40}$/);
  assert.equal(
    JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).version,
    version,
  );
  console.log(
    "Release extraction, configurable installation and independent CLI persistence passed.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
