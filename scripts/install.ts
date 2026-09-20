import {
  cpSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const option = (key: string) => {
  const at = args.indexOf(key);
  return at < 0 ? undefined : args[at + 1];
};
const id = option("--extension-id"),
  destination = option("--extension-dir");
if (!id || !/^[a-p]{32}$/.test(id) || !destination) {
  console.error(
    "Usage: node runtime/install.js --extension-id <Chrome extension ID> --extension-dir <permanent unpacked folder> [--home <home>]",
  );
  process.exit(1);
}
const home = resolve(option("--home") || homedir());
const media = existsSync(join(import.meta.dirname, "native-host.js"))
  ? resolve(import.meta.dirname, "..")
  : resolve(import.meta.dirname, "../dist/marginway-learning");
if (!existsSync(join(media, "runtime/native-host.js")))
  throw new Error("Build the release first: pnpm run package");
const target = resolve(destination);
if (target !== join(media, "extension")) {
  if (existsSync(target) && readdirSync(target).length) {
    const manifestPath = join(target, "manifest.json");
    if (
      !existsSync(manifestPath) ||
      !["Marginway · 语境", "语境 Context · 双语学习"].includes(
        String(JSON.parse(readFileSync(manifestPath, "utf8")).name),
      )
    )
      throw new Error(
        "Target must be empty or an existing Marginway extension folder",
      );
    const backup = join(
      home,
      ".local/share/learning-companion/backups",
      new Date().toISOString().replaceAll(":", "-"),
    );
    mkdirSync(backup, { recursive: true });
    cpSync(target, backup, {
      recursive: true,
    });
    console.log("Previous extension backup:", backup);
    for (const entry of readdirSync(target))
      rmSync(join(target, entry), { recursive: true, force: true });
  }
  mkdirSync(target, { recursive: true });
  cpSync(join(media, "extension"), target, { recursive: true });
}
const runtime = join(home, ".local/share/learning-companion/runtime");
mkdirSync(runtime, { recursive: true, mode: 0o700 });
cpSync(join(media, "runtime"), runtime, { recursive: true });
const skillPath = join(runtime, "skills");
cpSync(join(media, "skills"), skillPath, { recursive: true });
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
const bin = join(home, ".local/bin");
mkdirSync(bin, { recursive: true });
const win = platform() === "win32";
const launcher = join(runtime, win ? "native-host.cmd" : "native-host");
const cli = join(bin, win ? "learning.cmd" : "learning");
if (win) {
  writeFileSync(
    launcher,
    `@echo off\r\nset "LC_EXTENSION_ID=${id}"\r\n"${process.execPath}" --no-warnings "${join(runtime, "native-host.js")}" %*\r\n`,
  );
  writeFileSync(
    cli,
    `@echo off\r\n"${process.execPath}" --no-warnings "${join(runtime, "learning.js")}" %*\r\n`,
  );
} else {
  writeFileSync(
    launcher,
    `#!/bin/sh\nexport LC_EXTENSION_ID=${quote(id)}\nexec ${quote(process.execPath)} --no-warnings ${quote(join(runtime, "native-host.js"))} "$@"\n`,
    { mode: 0o700 },
  );
  writeFileSync(
    cli,
    `#!/bin/sh\nexec ${quote(process.execPath)} --no-warnings ${quote(join(runtime, "learning.js"))} "$@"\n`,
    { mode: 0o700 },
  );
  chmodSync(launcher, 0o700);
  chmodSync(cli, 0o700);
}
const hostDir = win
  ? runtime
  : platform() === "darwin"
    ? join(
        home,
        "Library/Application Support/Google/Chrome/NativeMessagingHosts",
      )
    : join(home, ".config/google-chrome/NativeMessagingHosts");
mkdirSync(hostDir, { recursive: true });
const manifest = join(hostDir, "com.learning_companion.host.json");
writeFileSync(
  manifest,
  JSON.stringify(
    {
      name: "com.learning_companion.host",
      description: "Marginway local SQLite bridge",
      path: launcher,
      type: "stdio",
      allowed_origins: [`chrome-extension://${id}/`],
    },
    null,
    2,
  ),
);
if (win && !args.includes("--skip-registration")) {
  const p = spawnSync(
    "reg",
    [
      "add",
      "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.learning_companion.host",
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      manifest,
      "/f",
    ],
    { stdio: "inherit" },
  );
  if (p.status) throw new Error("Native host registration failed");
}
console.log(
  `Extension: ${target}\nCLI: ${cli}\nSkill: ${join(skillPath, "SKILL.md")}\nNative host: ${manifest}\nReload the extension and refresh open pages.`,
);
