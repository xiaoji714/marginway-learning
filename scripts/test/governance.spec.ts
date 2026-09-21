import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validatePr, validateIssue, nextStatus } from "../governance.js";
import { validateNote, verifyDocs } from "../doc-sync.js";

const labels = ["kind/maintenance", "area/tooling"];
const note = ".agents/notes/implemented/2026-09-18-test.md";
const content =
  "# Agent Note: Test\n\nStatus: implemented\n\n" +
  ["为什么", "决策", "放弃了什么", "怎么验证"]
    .map((x) => `## ${x}\n\nEvidence.\n`)
    .join("\n");
test("PR accepts scoped references and Note; rejects missing or ambiguous policy metadata", () => {
  expect(validatePr(labels, "Refs #3\nCloses #4\nRefs #3", [note])).toEqual([
    3, 4,
  ]);
  for (const invalid of [
    [],
    ["kind/fix"],
    [...labels, "kind/fix"],
    [...labels, "area/unknown"],
  ])
    expect(() => validatePr(invalid, "Refs #3", [note])).toThrow();
  for (const body of [
    "",
    "Refs other/repo#3",
    "Refs https://github.com/other/repo/issues/3",
  ])
    expect(() => validatePr(labels, body, [note])).toThrow();
  expect(() => validatePr(labels, "Refs #3", ["README.md"])).toThrow(/Note/);
  expect(() =>
    validatePr(labels, "Refs #3\nNote: not-needed — tiny", []),
  ).toThrow();
  expect(
    validatePr(
      labels,
      "Refs #3\nNote: not-needed — Correct only a typo; no behavior or contract changes.",
      [],
    ),
  ).toEqual([3]);
});
test("linked Issue requires exactly one known type and status", () => {
  expect(() => validateIssue(["type/task", "status/in-review"])).not.toThrow();
  for (const labels of [
    [],
    ["type/task"],
    ["type/task", "type/bug", "status/ready"],
    ["type/nope", "status/ready"],
    ["type/task", "status/done", "status/ready"],
  ])
    expect(() => validateIssue(labels)).toThrow();
});
test("real closed state wins over labels; reopening terminal returns to inbox", () => {
  expect(nextStatus("closed", "completed", ["status/in-progress"])).toBe(
    "done",
  );
  expect(nextStatus("closed", "not_planned", ["status/done"])).toBe(
    "no-action",
  );
  expect(nextStatus("open", null, ["status/done"])).toBe("inbox");
  expect(
    nextStatus(
      "open",
      null,
      ["status/ready", "status/in-review"],
      "status/in-review",
    ),
  ).toBe("in-review");
  expect(nextStatus("open", null, ["status/ready"], "status/in-review")).toBe(
    "ready",
  );
});
test("Note lifecycle matches path and required sections have content", () => {
  expect(() => validateNote(note, content)).not.toThrow();
  expect(() =>
    validateNote(note, content.replaceAll("\n", "\r\n")),
  ).not.toThrow();
  expect(() =>
    validateNote(note.replace("implemented", "proposed"), content),
  ).toThrow();
  expect(() =>
    validateNote(note, content.replace("## 决策\n\nEvidence.", "## 决策")),
  ).toThrow();
  const archived = content.replace("Status: implemented", "Status: archived");
  expect(() =>
    validateNote(note.replace("implemented", "archived"), archived),
  ).toThrow(/Archive/);
  expect(() =>
    validateNote(
      note.replace("implemented", "archived"),
      archived + "\nArchived: 2026-09-18; superseded; no replacement\n",
    ),
  ).not.toThrow();
});
test("new, oversized and stale document budgets fail independently", (t) => {
  const root = mkdtempSync(join(tmpdir(), "marginway-doc-policy-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".local/browser-report/error-context.md", "generated browser evidence");
  write("README.md", "😀");
  write("scripts/doc-budgets.json", '{"README.md":1}');
  expect(() => verifyDocs(root)).not.toThrow();
  write("README.md", "too large");
  expect(() => verifyDocs(root)).toThrow(/exceeded/);
  write("README.md", "a");
  write("new.md", "new");
  expect(() => verifyDocs(root)).toThrow(/Missing/);
  rmSync(join(root, "new.md"));
  write("scripts/doc-budgets.json", '{"README.md":1,"gone.md":12}');
  expect(() => verifyDocs(root)).toThrow(/Stale/);
});

test("package guard rejects missing test entry and undiscoverable cases", async (t) => {
  const { verifyPackageTests } = await import("../verify-package-tests.js");
  const root = mkdtempSync(join(tmpdir(), "marginway-package-policy-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const pkg = join(root, "apps", "example");
  mkdirSync(join(pkg, "tests"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), '{"name":"example"}');
  expect(() => verifyPackageTests([root, pkg], root)).toThrow(/test entry/);
  writeFileSync(
    join(pkg, "package.json"),
    '{"name":"example","scripts":{"test":"vitest run"}}',
  );
  expect(() => verifyPackageTests([root, pkg], root)).toThrow(/discoverable/);
  writeFileSync(join(pkg, "tests", "entry.spec.ts"), "// fixture");
  expect(() => verifyPackageTests([root, pkg], root)).not.toThrow();
});
