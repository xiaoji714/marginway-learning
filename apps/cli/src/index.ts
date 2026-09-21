#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openStore, DATA_DIR } from "@context/core";
import { DatabaseSync } from "node:sqlite";
const args = process.argv.slice(2);
const cmd = args.shift() || "capabilities";
const allowed = new Set(["--input", "--json", "--actor", "--model"]);
const options = new Map<string, string>();
function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: "INVALID_ARGUMENT" });
}
let store;
try {
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    if (!allowed.has(name)) invalid("未知选项：" + name);
    if (options.has(name)) invalid("重复选项：" + name);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) invalid("选项缺少值：" + name);
    options.set(name, value);
  }
  if (options.has("--json") && options.has("--input"))
    invalid("--input 和 --json 只能选择一个");
  const input = options.get("--input");
  const raw = input
    ? readFileSync(input === "-" ? 0 : input, "utf8")
    : options.get("--json");
  let params: Record<string, unknown> = {};
  if (raw !== undefined) {
    try {
      params = JSON.parse(raw);
    } catch {
      invalid("输入不是有效 JSON");
    }
    if (!params || typeof params !== "object" || Array.isArray(params))
      invalid("参数必须是 JSON 对象");
  }
  let result: unknown;
  if (cmd === "help" || cmd === "--help") {
    result = {
      usage:
        "learning <command> [--input <file|-> | --json <object>] [--actor <client>] [--model <model>]",
      discovery: ["doctor", "capabilities", "status", "skill", "--version"],
      writes:
        "commands declaring operationId require a nonempty ID; reuse it and identical input on retry",
      setup:
        "Use the installer output for the full CLI path. Run skill to discover the installed Skill.",
    };
  } else if (cmd === "--version" || cmd === "version") {
    const packaged = join(import.meta.dirname, "cli-version.json");
    result = {
      version: JSON.parse(
        readFileSync(
          existsSync(packaged)
            ? packaged
            : join(import.meta.dirname, "../package.json"),
          "utf8",
        ),
      ).version,
    };
  } else if (cmd === "doctor") {
    const database = join(DATA_DIR, "learning.sqlite");
    const checks: { id: string; status: string; code: string }[] = [];
    let lastHeartbeat: unknown = null;
    let db: DatabaseSync | undefined;
    if (!existsSync(database)) {
      checks.push({
        id: "database",
        status: "unknown",
        code: "DATABASE_MISSING",
      });
    } else {
      try {
        db = new DatabaseSync(database, { readOnly: true });
        db.prepare("SELECT id FROM objects LIMIT 0").all();
        const row = db
          .prepare("SELECT value FROM meta WHERE key='bridge'")
          .get();
        checks.push({
          id: "database",
          status: "pass",
          code: "DATABASE_READABLE",
        });
        if (row) {
          try {
            const heartbeat = JSON.parse(String(row.value));
            if (typeof heartbeat?.at === "string") lastHeartbeat = heartbeat.at;
          } catch {
            checks.push({
              id: "heartbeat",
              status: "fail",
              code: "HEARTBEAT_METADATA_INVALID",
            });
          }
        }
      } catch {
        checks.push({
          id: "database",
          status: "fail",
          code: "DATABASE_UNREADABLE",
        });
      } finally {
        db?.close();
      }
    }
    result = {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      readiness: "unknown",
      runtime: {
        node: process.versions.node,
        executablePath: process.execPath,
        platform: process.platform,
        arch: process.arch,
      },
      database,
      lastHeartbeat,
      checks: [
        ...checks,
        {
          id: "nativeRegistration",
          status: "unknown",
          code: "MANUAL_CHECK_REQUIRED",
        },
        {
          id: "browserConnection",
          status: "unknown",
          code: "LIVE_PROBE_NOT_IMPLEMENTED",
        },
        {
          id: "providerConfiguration",
          status: "unknown",
          code: "CHECK_IN_EXTENSION",
        },
      ],
      guidance:
        "Read the Skill and installation guide. Compare Node with the required version; verify the exact Chrome ID and native registration, then open the extension and check configuration there. Historical heartbeat is not proof of a live connection. Never delete the database to repair installation.",
    };
  } else if (cmd === "skill") {
    const path = [
      join(import.meta.dirname, "skills/SKILL.md"),
      join(import.meta.dirname, "../skills/SKILL.md"),
      join(import.meta.dirname, "../../../skills/SKILL.md"),
    ].find(existsSync);
    if (!path)
      throw Object.assign(new Error("Skill 未找到，请重新安装完整发布包"), {
        code: "NOT_FOUND",
      });
    result = {
      path,
      content: readFileSync(path, "utf8"),
      integration:
        "Read this Skill directly or install its directory using your Agent's supported Skill mechanism.",
    };
  } else {
    const actor = {
      origin: "agent",
      id: `cli:${options.get("--actor") || "external-agent"}`,
      name: options.get("--actor") || "External Agent",
      model: options.get("--model") || "unknown",
      assurance: "local-os-user; client self-reported",
    };
    store = openStore();
    const capabilities = store.execute("capabilities");
    const descriptor = capabilities.commands[cmd];
    if (
      descriptor?.operationId &&
      (typeof params.operationId !== "string" || !params.operationId.trim())
    )
      invalid("写入需要非空 operationId；重试请复用同一个 ID");
    result = store.execute(cmd, params, actor);
  }
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
