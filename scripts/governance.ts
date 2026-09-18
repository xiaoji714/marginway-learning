import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const types = ["bug", "feature", "task", "research"];
export const kinds = ["fix", "feature", "maintenance", "docs"];
export const areas = ["extension", "core", "agent", "tooling", "docs"];
export const openStates = ["inbox", "ready", "in-progress", "in-review"];
export function nextStatus(
  state: string,
  reason: string | null,
  labels: string[],
  selected?: string,
): string {
  if (state === "closed")
    return reason === "not_planned" ? "no-action" : "done";
  const current = labels.filter((x) =>
    openStates.includes(x.replace(/^status\//, "")),
  );
  if (selected && current.includes(selected)) return selected.slice(7);
  return current[0]?.slice(7) ?? "inbox";
}
export function validatePr(
  labels: string[],
  body: string,
  files: string[],
): number[] {
  const count = (prefix: string, allowed: string[]) => {
    const found = labels.filter((x) => x.startsWith(prefix + "/"));
    if (found.some((x) => !allowed.includes(x.slice(prefix.length + 1))))
      throw Error(`Unknown ${prefix} label`);
    return found.length;
  };
  if (count("kind", kinds) !== 1 || count("area", areas) < 1)
    throw Error("PR needs exactly one kind/* and at least one area/*");
  // Explicit same-repository references only; URL/cross-repository references do not satisfy this contract.
  const ids = [
    ...body.matchAll(/\b(?:Refs|Closes|Fixes|Resolves)\s+#([1-9]\d*)\b/gi),
  ].map((x) => Number(x[1]));
  if (!ids.length)
    throw Error("PR needs Refs #N or Closes #N for a same-repository Issue");
  if (
    !files.some((x) =>
      /^\.agents\/notes\/(proposed|implemented|rejected|archived)\/.+\.md$/.test(
        x,
      ),
    ) &&
    !/^Note: not-needed — .{12,}$/m.test(body)
  )
    throw Error(
      "Update an Agent Note or explain a mechanical/local exemption: Note: not-needed — <reason>",
    );
  return [...new Set(ids)];
}
export function validateIssue(labels: string[]): void {
  const found = labels.filter((x) => x.startsWith("type/"));
  if (found.length !== 1 || !types.includes(found[0]!.slice(5)))
    throw Error("Linked Issue needs exactly one supported type/* label");
  const statuses = labels.filter((x) => x.startsWith("status/"));
  if (
    statuses.length !== 1 ||
    ![...openStates, "done", "no-action"].includes(statuses[0]!.slice(7))
  )
    throw Error("Linked Issue needs one supported status/* label");
}
function api(path: string, method = "GET", body?: unknown): any {
  return JSON.parse(
    execFileSync(
      "gh",
      ["api", path, "--method", method, ...(body ? ["--input", "-"] : [])],
      {
        encoding: "utf8",
        input: body ? JSON.stringify(body) : undefined,
      },
    ) || "null",
  );
}
export function run(mode: string): void {
  const event = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"),
  );
  const repo = process.env.GITHUB_REPOSITORY!;
  if (mode === "pr") {
    const number = event.pull_request?.number ?? Number(process.env.PR_NUMBER);
    if (!number) throw Error("Missing PR number");
    const pr = api(`repos/${repo}/pulls/${number}`);
    const files: string[] = [];
    for (let page = 1; ; page++) {
      const batch = api(
        `repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      );
      files.push(
        ...batch
          .filter((x: any) => x.status !== "removed")
          .map((x: any) => x.filename),
      );
      if (batch.length < 100) break;
    }
    for (const id of validatePr(
      pr.labels.map((x: any) => x.name),
      pr.body ?? "",
      files,
    )) {
      const issue = api(`repos/${repo}/issues/${id}`);
      if (issue.pull_request) throw Error(`#${id} is a PR, not an Issue`);
      validateIssue(issue.labels.map((x: any) => x.name));
    }
  } else if (mode === "issue") {
    const number = event.issue?.number ?? Number(process.env.ISSUE_NUMBER);
    if (!number) throw Error("Missing Issue number");
    const path = `repos/${repo}/issues/${number}`;
    const issue = api(path); // Read current state; never replay the event's stale issue snapshot.
    if (issue.pull_request) throw Error("Expected an Issue");
    const labels: string[] = issue.labels.map((x: any) => x.name);
    const status =
      "status/" +
      nextStatus(
        issue.state,
        issue.state_reason,
        labels,
        event.action === "labeled" ? event.label?.name : undefined,
      );
    // Only modify our status labels; preserve concurrent type/area/user labels.
    for (const label of labels.filter(
      (x) => x.startsWith("status/") && x !== status,
    ))
      api(`${path}/labels/${encodeURIComponent(label)}`, "DELETE");
    if (!labels.includes(status))
      api(`${path}/labels`, "POST", { labels: [status] });
  } else throw Error("Expected pr or issue");
  console.log(`${mode} governance passed`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv[2] ?? "");
