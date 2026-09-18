import { test, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { checkVersions, setVersion, versionFiles } from "../version.js";
test("version updates every manifest; drift, invalid tags and downgrade fail", (t) => {
  const root = mkdtempSync(join(tmpdir(), "marginway-version-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const f of versionFiles) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(
      join(root, f),
      JSON.stringify({ version: "0.2.0", name: "keep-me" }),
    );
  }
  expect(checkVersions(root, "v0.2.0")).toBe("0.2.0");
  for (const invalid of ["0.1.0", "0.2.0", "1.0.0-rc.1", "01.2.3", "99999.0.0"])
    expect(() => setVersion(invalid, root)).toThrow();
  expect(() => checkVersions(root, "v0.3.0")).toThrow();
  setVersion("0.3.0", root);
  expect(checkVersions(root, "v0.3.0")).toBe("0.3.0");
  for (const f of versionFiles)
    expect(JSON.parse(readFileSync(join(root, f), "utf8")).name).toBe(
      "keep-me",
    );
  writeFileSync(
    join(root, versionFiles[1]!),
    JSON.stringify({ version: "0.2.0" }),
  );
  expect(() => checkVersions(root)).toThrow(/mismatch/);
  expect(() => setVersion("0.4.0", root)).toThrow();
  expect(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  ).toBe("0.3.0");
});
