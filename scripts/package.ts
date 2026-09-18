import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, relative, join } from "node:path";
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { checkVersions } from "./version.js";
import { execFileSync } from "node:child_process";
const version = checkVersions();
const root = resolve(import.meta.dirname, "..");
const stage = join(root, "dist/marginway-learning");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "runtime"), { recursive: true });
cpSync(join(root, "apps/extension/lib"), join(stage, "extension"), {
  recursive: true,
  filter: (s) => !s.endsWith(".map"),
});
await build({
  entryPoints: {
    learning: join(root, "apps/cli/src/index.ts"),
    "native-host": join(root, "apps/native-host/src/index.ts"),
    install: join(root, "scripts/install.ts"),
  },
  outdir: join(stage, "runtime"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  sourcemap: false,
});
for (const f of [
  "README.md",
  "LICENSE",
  "PRIVACY.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md",
])
  cpSync(join(root, f), join(stage, f));
cpSync(join(root, "skills"), join(stage, "skills"), { recursive: true });
writeFileSync(
  join(stage, "build-info.json"),
  JSON.stringify(
    {
      version,
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    null,
    2,
  ) + "\n",
);
const files: Record<string, Uint8Array> = {};
function walk(dir: string) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    if (f.isDirectory()) walk(path);
    else
      files[relative(stage, path).replaceAll("\\", "/")] = new Uint8Array(
        readFileSync(path),
      );
  }
}
walk(stage);
const archive = zipSync(files, {
  level: 9,
  mtime: new Date("2026-01-01T00:00:00Z"),
});
const out = join(root, `dist/marginway-learning-${version}.zip`);
writeFileSync(out, archive);
writeFileSync(
  out + ".sha256",
  createHash("sha256").update(archive).digest("hex") +
    `  marginway-learning-${version}.zip\n`,
);
console.log(out);
