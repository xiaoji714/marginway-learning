import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
export function script(name: string) {
  return transformSync(
    readFileSync(resolve(import.meta.dirname, "../src", name + ".ts"), "utf8"),
    {
      loader: "ts",
      target: "es2022",
      tsconfigRaw: { compilerOptions: { moduleDetection: "auto" } },
    },
  ).code;
}
