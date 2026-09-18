import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const versionFiles = [
  "package.json",
  "apps/cli/package.json",
  "apps/extension/package.json",
  "apps/native-host/package.json",
  "packages/learning/core/package.json",
  "apps/extension/public/manifest.json",
];
export function readVersion(root = resolve(import.meta.dirname, "..")): string {
  const version: string = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ).version;
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    version.split(".").some((n) => Number(n) > 65535)
  )
    throw Error("Use a Chrome-compatible stable x.y.z version (0..65535)");
  return version;
}
export function checkVersions(
  root = resolve(import.meta.dirname, ".."),
  tag?: string,
) {
  const version = readVersion(root);
  for (const file of versionFiles)
    if (
      JSON.parse(readFileSync(resolve(root, file), "utf8")).version !== version
    )
      throw Error("Version mismatch: " + file);
  if (tag !== undefined && tag !== `v${version}`)
    throw Error("Tag must match package version: v" + version);
  return version;
}
export function setVersion(
  next: string,
  root = resolve(import.meta.dirname, ".."),
) {
  const current = checkVersions(root);
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(next) ||
    next.split(".").some((n) => Number(n) > 65535)
  )
    throw Error("Invalid stable version");
  const a = next.split(".").map(Number),
    b = current.split(".").map(Number);
  const first = a.findIndex((n, i) => n !== b[i]);
  if (first < 0 || a[first]! < b[first]!) throw Error("Version must increase");
  const edits = versionFiles.map((file) => {
    const path = resolve(root, file);
    const data = JSON.parse(readFileSync(path, "utf8"));
    data.version = next;
    return { path, text: JSON.stringify(data, null, 2) + "\n" };
  });
  for (const edit of edits) writeFileSync(edit.path, edit.text);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, value] = process.argv.slice(2);
  if (mode === "set" && value) setVersion(value);
  else if (mode !== "check")
    throw Error("Usage: version.ts check [vX.Y.Z] | set X.Y.Z");
  console.log(checkVersions(undefined, mode === "check" ? value : undefined));
}
