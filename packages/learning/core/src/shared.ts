import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
export interface Actor {
  origin: string;
  id: string;
  name: string;
  model?: string;
  assurance?: string;
}
// The command bus validates JSON fields at runtime; persisted records have kind-specific payloads.
export type RecordData = Record<string, any>;
export const DATA_DIR =
  process.env.LC_DATA_DIR || join(homedir(), ".local/share/learning-companion");
export const hash = (x: unknown) =>
  createHash("sha256").update(String(x)).digest("hex").slice(0, 24);
export const str = (v: unknown, max = 16000) =>
  typeof v === "string" ? v.slice(0, max) : "";
export function fail(message: string, code = "INVALID_ARGUMENT"): never {
  throw Object.assign(new Error(message), { code });
}
export function canonical(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    fail("需要有效网址");
  }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    fail("仅支持 HTTP(S) 资源");
  u.hash = "";
  if (/(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === "/watch") {
    let id = u.searchParams.get("v");
    if (!/^[\w-]{6,20}$/.test(id || "")) fail("视频 ID 无效");
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return u.href;
}
