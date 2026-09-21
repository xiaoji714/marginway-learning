import {
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import coverageLib from "istanbul-lib-coverage";
const { createCoverageMap } = coverageLib;
import reportLib from "istanbul-lib-report";
const { createContext } = reportLib;
import reports from "istanbul-reports";
const { create } = reports;
import { instrument } from "./testing/instrument.js";

const directory = resolve(".local/runtime-coverage");
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });
const map = createCoverageMap({});
const entries: string[] = [];
try {
  for (const app of readdirSync("apps").filter((name) =>
    existsSync(`apps/${name}/src`),
  )) {
    for (const entry of readdirSync(`apps/${app}/src`, { recursive: true })) {
      const name = String(entry);
      if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
      const file = `apps/${app}/src/${name}`;
      const { coverage, code } = instrument(file);
      map.addFileCoverage(coverage);
      if (["cli", "native-host"].includes(app) && name === "index.ts") {
        const target = `apps/${app}/lib/index.coverage.js`;
        entries.push(target);
        writeFileSync(
          target,
          `import { writeFileSync as coverageWrite } from 'node:fs';\n` +
            `process.on('exit', () => coverageWrite(${JSON.stringify(directory)} + '/' + process.pid + '.json', JSON.stringify(globalThis.__coverage__ || {})));\n` +
            code.replace(/^#!.*\n/, ""),
        );
      }
    }
  }
  const test = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "apps"],
    {
      stdio: "inherit",
      env: { ...process.env, LC_RUNTIME_COVERAGE: directory },
    },
  );
  if (test.status !== 0) throw Error("Runtime tests failed");
  for (const name of readdirSync(directory))
    map.merge(JSON.parse(readFileSync(join(directory, name), "utf8")));
  const context = createContext({ dir: "coverage/runtime", coverageMap: map });
  for (const reporter of ["text", "json", "html"] as const)
    create(reporter).execute(context);
  if (!process.argv.includes("--report-only")) {
    const missing = map.files().filter((file) => {
      const summary = map.fileCoverageFor(file).toSummary();
      return [
        summary.statements,
        summary.branches,
        summary.functions,
        summary.lines,
      ].some((metric) => metric.pct !== 100);
    });
    if (missing.length)
      throw Error("Runtime coverage below 100%: " + missing.join(", "));
  }
} finally {
  for (const file of entries) rmSync(file, { force: true });
}
