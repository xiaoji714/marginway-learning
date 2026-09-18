import { build } from "esbuild";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../apps/extension");
rmSync(resolve(root, "lib"), { recursive: true, force: true });
mkdirSync(resolve(root, "lib"), { recursive: true });
cpSync(resolve(root, "public"), resolve(root, "lib"), { recursive: true });
await build({
  entryPoints: readdirSync(resolve(root, "src"))
    .filter((x) => x.endsWith(".ts") && !x.endsWith(".d.ts"))
    .map((x) => resolve(root, "src", x)),
  outdir: resolve(root, "lib"),
  bundle: false,
  format: "iife",
  target: "chrome116",
  sourcemap: true,
});
