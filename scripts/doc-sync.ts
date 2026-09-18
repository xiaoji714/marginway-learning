import { readFileSync, readdirSync } from "node:fs";
for (const f of readdirSync(".agents/notes/implemented")) {
  const text = readFileSync(".agents/notes/implemented/" + f, "utf8");
  for (const section of [
    "Status: implemented",
    "## 为什么",
    "## 决策",
    "## 放弃了什么",
    "## 怎么验证",
  ])
    if (!text.includes(section)) throw Error(`Missing ${section}: ${f}`);
}
for (const f of ["README.md", "AGENTS.md", "docs/engineering.md"])
  if (readFileSync(f, "utf8").length > 14000)
    throw Error("Document budget exceeded: " + f);
console.log("Documentation budgets and Agent Notes passed.");
