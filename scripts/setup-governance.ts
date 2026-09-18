import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { types, kinds, areas, openStates } from "./governance.js";
const repo = execFileSync(
  "gh",
  ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
  { encoding: "utf8" },
).trim();
function api(path: string, method = "GET", body?: unknown): any {
  return JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        `repos/${repo}/${path}`,
        "--method",
        method,
        ...(body ? ["--input", "-"] : []),
      ],
      { encoding: "utf8", input: body ? JSON.stringify(body) : undefined },
    ) || "null",
  );
}
if (process.argv[2] === "labels") {
  const existing = new Set(
    (api("labels?per_page=100") as { name: string }[]).map((x) => x.name),
  );
  for (const [prefix, names, color] of [
    ["type", types, "1d76db"],
    ["kind", kinds, "5319e7"],
    ["area", areas, "006b75"],
    ["status", [...openStates, "done", "no-action"], "0e8a16"],
  ] as const)
    for (const name of names) {
      const full = `${prefix}/${name}`;
      if (!existing.has(full)) api("labels", "POST", { name: full, color });
    }
  console.log(`Labels ready: ${repo}`);
} else if (process.argv[2] === "rules") {
  const desired = JSON.parse(readFileSync(".github/main-ruleset.json", "utf8"));
  const existing = api("rulesets?per_page=100").find(
    (x: any) => x.name === desired.name,
  );
  const saved = api(
    existing ? `rulesets/${existing.id}` : "rulesets",
    existing ? "PUT" : "POST",
    desired,
  );
  const actual = api(`rulesets/${saved.id}`);
  if (actual.enforcement !== "active") throw Error("Ruleset is not active");
  const effective = api("rules/branches/main");
  for (const type of [
    "deletion",
    "non_fast_forward",
    "pull_request",
    "required_status_checks",
  ])
    if (!effective.some((x: any) => x.type === type))
      throw Error(`Missing effective rule: ${type}`);
  for (const context of ["pr-gate", "Issue policy"])
    if (
      !effective.some((x: any) =>
        x.parameters?.required_status_checks?.some(
          (c: any) => c.context === context && c.integration_id === 15368,
        ),
      )
    )
      throw Error(`Missing required check: ${context}`);
  console.log(`Ruleset ${saved.id} active and read back: ${repo}`);
} else
  throw Error(
    "Use labels or rules; rules requires both check names to be live on the PR before applying",
  );
