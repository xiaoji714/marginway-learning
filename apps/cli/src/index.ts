#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { openStore } from "@context/core";
const args = process.argv.slice(2);
const cmd = args.shift() || "capabilities";
function option(name: string) {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
}
let store;
try {
  const path = option("--input");
  let params = path
    ? JSON.parse(readFileSync(path === "-" ? 0 : path, "utf8"))
    : {};
  if (option("--json"))
    params = { ...params, ...JSON.parse(option("--json")!) };
  const actor = {
    origin: "agent",
    id: `cli:${option("--actor") || "external-agent"}`,
    name: option("--actor") || "External Agent",
    model: option("--model") || "unknown",
    assurance: "local-os-user; client self-reported",
  };
  store = openStore();
  const result = store.execute(cmd, params, actor);
  process.stdout.write(JSON.stringify({ ok: true, result }, null, 2) + "\n");
} catch (e) {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: { code: e.code || "INTERNAL", message: e.message },
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
