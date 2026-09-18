import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const packages = JSON.parse(
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["list", "-r", "--depth", "-1", "--json"],
    { encoding: "utf8", shell: process.platform === "win32" },
  ),
) as { path: string }[];
for (const pkg of packages.filter((x) => x.path !== process.cwd())) {
  const manifest = JSON.parse(
    readFileSync(join(pkg.path, "package.json"), "utf8"),
  );
  if (!manifest.scripts?.test)
    throw Error(`Missing test entry: ${manifest.name}`);
  if (
    !readdirSync(join(pkg.path, "tests"), { recursive: true }).some((x) =>
      String(x).endsWith(".spec.ts"),
    )
  )
    throw Error(`Missing discoverable tests: ${manifest.name}`);
}
console.log("Every workspace package has a test entry and discoverable cases");
