import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function verifyPackageTests(
  packages: string[],
  root = process.cwd(),
): void {
  for (const path of packages.filter((x) => resolve(x) !== resolve(root))) {
    const manifest = JSON.parse(
      readFileSync(join(path, "package.json"), "utf8"),
    );
    if (!manifest.scripts?.test)
      throw Error(`Missing test entry: ${manifest.name}`);
    if (
      !readdirSync(join(path, "tests"), { recursive: true }).some((x) =>
        String(x).endsWith(".spec.ts"),
      )
    )
      throw Error(`Missing discoverable tests: ${manifest.name}`);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const packages = JSON.parse(
    execFileSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["list", "-r", "--depth", "-1", "--json"],
      { encoding: "utf8", shell: process.platform === "win32" },
    ),
  ) as { path: string }[];
  verifyPackageTests(packages.map((x) => x.path));
  console.log(
    "Every workspace package has a test entry and discoverable cases",
  );
}
