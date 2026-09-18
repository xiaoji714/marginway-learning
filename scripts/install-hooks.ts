import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Do not install hooks into a parent repository or change its configuration.
if (existsSync(".git")) {
  const r = spawnSync("pnpm", ["exec", "lefthook", "install"], {
    stdio: "inherit",
  });
  if (r.status) process.exit(r.status);
}
