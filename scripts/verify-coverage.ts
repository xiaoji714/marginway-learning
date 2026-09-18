import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const report = JSON.parse(readFileSync("coverage/coverage-final.json", "utf8"));
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory()
      ? x.name === "node_modules"
        ? []
        : walk(join(d, x.name))
      : [join(d, x.name)],
  );
for (const file of walk("packages").filter(
  (x) =>
    x.includes("/src/") &&
    x.endsWith(".ts") &&
    !x.endsWith(".d.ts") &&
    !x.includes("node_modules"),
)) {
  const entry = report[resolve(file)];
  if (!entry) throw Error("Missing coverage: " + file);
  for (const counts of [
    ...Object.values(entry.s),
    ...Object.values(entry.f),
    ...Object.values(entry.b).flat(),
  ] as number[])
    if (counts <= 0) throw Error("Uncovered branch: " + file);
}
console.log("Coverage report includes every core source file.");
