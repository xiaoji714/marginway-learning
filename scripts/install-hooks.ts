import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Do not install hooks into a parent repository or change its configuration.
if (!process.env.CI && existsSync(".git")) {
  const r = spawnSync("pnpm", ["exec", "lefthook", "install"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status) process.exit(r.status);
}
