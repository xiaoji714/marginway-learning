import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import instrumentLib from "istanbul-lib-instrument";
const { createInstrumenter } = instrumentLib;
import { transformSync } from "esbuild";

// Instrument TypeScript before transpiling so counters refer to original source.
export function instrument(file: string) {
  const path = resolve(file);
  const instrumenter = createInstrumenter({
    esModules: true,
    parserPlugins: ["typescript"],
  });
  const code = instrumenter.instrumentSync(readFileSync(path, "utf8"), path);
  return {
    coverage: instrumenter.lastFileCoverage(),
    code: transformSync(code, {
      loader: "ts",
      target: "es2022",
      tsconfigRaw: JSON.stringify({
        compilerOptions: { moduleDetection: "auto" },
      }),
    }).code,
  };
}
