import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory()
      ? x.name === "node_modules"
        ? []
        : walk(join(dir, x.name))
      : [join(dir, x.name)],
  );
const folder = join(root, "apps/extension/lib");
const m = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
for (const f of [
  m.background.service_worker,
  m.side_panel.default_path,
  m.options_ui.page,
  ...m.content_scripts.flatMap((x: { js: string[] }) => x.js),
])
  if (!existsSync(join(folder, f))) throw Error("Missing " + f);
for (const dir of ["apps", "packages", "scripts", "skills"])
  for (const f of walk(join(root, dir)).filter(
    (f) => !f.includes("/node_modules/") && !f.endsWith(".map"),
  )) {
    if (!/\.(ts|js|html|json|css|md)$/.test(f)) continue;
    const text = readFileSync(f, "utf8");
    if (/\b(?:sk-[A-Za-z0-9_-]{24,}|sd_[A-Za-z0-9_-]{20,})/.test(text))
      throw Error("Possible credential in " + f);
    if (/@ts-(?:nocheck|ignore)/.test(text))
      throw Error("Suppressed typecheck in " + f);
  }
console.log("Manifest, credentials and type-suppression checks passed.");
