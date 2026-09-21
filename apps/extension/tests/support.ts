import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { transformSync } from "esbuild";
import { onTestFinished } from "vitest";
import {
  createContext as createVmContext,
  runInNewContext as runVm,
} from "node:vm";
import { instrument } from "../../../scripts/testing/instrument.js";
const tracked = new WeakSet<object>();
function track(target: any) {
  const directory = process.env.LC_RUNTIME_COVERAGE;
  if (!directory || tracked.has(target)) return;
  tracked.add(target);
  onTestFinished(() => {
    if (target.__coverage__)
      writeFileSync(
        join(directory, randomUUID() + ".json"),
        JSON.stringify(target.__coverage__),
      );
  });
}
export function evaluate(target: any, name: string) {
  track(target);
  return target.eval(script(name));
}
export function createContext(sandbox: any) {
  track(sandbox);
  return createVmContext(sandbox);
}
export function runInNewContext(code: string, sandbox: any) {
  track(sandbox);
  return runVm(code, sandbox);
}
export function script(name: string) {
  const file = resolve(import.meta.dirname, "../src", name + ".ts");
  if (process.env.LC_RUNTIME_COVERAGE) return instrument(file).code;
  return transformSync(readFileSync(file, "utf8"), {
    loader: "ts",
    target: "es2022",
    tsconfigRaw: { compilerOptions: { moduleDetection: "auto" } },
  }).code;
}
