import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
export function validateNote(path: string, text: string): void {
  text = text.replaceAll("\r\n", "\n");
  const lifecycle = path.split("/")[2];
  if (
    !["proposed", "implemented", "rejected", "archived"].includes(
      lifecycle ?? "",
    )
  )
    throw Error(`Invalid Note lifecycle: ${path}`);
  if (
    !/^# Agent Note: .+/m.test(text) ||
    !new RegExp(`^Status: ${lifecycle}$`, "m").test(text)
  )
    throw Error(`Note title/status mismatch: ${path}`);
  for (const section of ["为什么", "决策", "放弃了什么", "怎么验证"]) {
    const body = text.split(`## ${section}\n`)[1]?.split(/^## /m)[0]?.trim();
    if (!body) throw Error(`Missing Note section ${section}: ${path}`);
  }
  if (lifecycle === "archived" && !/^Archived: \S.+/m.test(text))
    throw Error(`Archive needs reason and replacement: ${path}`);
}
export function verifyDocs(root = process.cwd()): void {
  const manifest = JSON.parse(
    readFileSync(join(root, "scripts/doc-budgets.json"), "utf8"),
  ) as Record<string, number>;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        [".git", "node_modules", "lib", "dist", "coverage"].includes(entry.name)
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md"))
        files.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  walk(root);
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    if (file.startsWith(".agents/notes/") && file !== ".agents/notes/README.md")
      validateNote(file, text);
    else {
      const budget = manifest[file];
      if (!Number.isInteger(budget) || budget! <= 0)
        throw Error(`Missing document budget: ${file}`);
      if ([...text].length > budget!)
        throw Error(`Document budget exceeded: ${file}`);
    }
  }
  for (const file of Object.keys(manifest))
    if (!files.includes(file)) throw Error(`Stale document budget: ${file}`);
  console.log("Documentation budgets and Note lifecycle passed");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  verifyDocs();
