import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fail, type Actor, type RecordData } from "./shared.js";
export function openRepository(file: string) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,resource_id TEXT,updated TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS object_kind ON objects(kind,resource_id);
 CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT); PRAGMA user_version=1;`);
  const get = (id: string): RecordData => {
    const row = db.prepare("SELECT data FROM objects WHERE id=?").get(id);
    if (!row) fail("记录不存在", "NOT_FOUND");
    return JSON.parse(String(row.data));
  };
  const maybe = (id: string): RecordData | null => {
    try {
      return get(id);
    } catch {
      return null;
    }
  };
  const isDeleted = (obj: RecordData): boolean =>
    Boolean(
      obj.deleted ||
      (obj.resourceId && maybe(obj.resourceId)?.deleted) ||
      (obj.vocabularyId && maybe(obj.vocabularyId)?.deleted),
    );
  const active = (obj: RecordData): RecordData => {
    if (isDeleted(obj))
      fail("记录或所属资料已删除，请先从回收站恢复", "DELETED");
    return obj;
  };
  const put = (obj: RecordData) => {
    db.prepare(
      "INSERT INTO objects VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,data=excluded.data",
    ).run(
      obj.id,
      obj.kind,
      obj.resourceId || null,
      obj.updatedAt,
      JSON.stringify(obj),
    );
    return obj;
  };
  const rows = (kind: string): RecordData[] =>
    db
      .prepare("SELECT data FROM objects WHERE kind=? ORDER BY updated DESC")
      .all(kind)
      .map((x) => JSON.parse(String(x.data)));
  const save = (
    kind: string,
    data: RecordData,
    actor: Actor,
    id: string = randomUUID(),
    allowDeleted = false,
  ) => {
    if (!allowDeleted) active(data);
    const before = maybe(id);
    const now = new Date().toISOString();
    const obj = {
      ...data,
      id,
      kind,
      revision: (before?.revision || 0) + 1,
      createdAt: before?.createdAt || now,
      updatedAt: now,
      origin: before?.origin || actor.origin,
      createdBy: before?.createdBy || actor,
      editedBy: actor,
    };
    put(obj);
    db.prepare("INSERT INTO revisions(id,data) VALUES(?,?)").run(
      id,
      JSON.stringify(obj),
    );
    return obj;
  };
  const resourceFor = (id: string, includeArchived = false) => {
    const r = get(id);
    if (r.kind !== "resource") fail("需要资源 ID");
    if (!includeArchived) active(r);
    if (r.archived && !includeArchived) fail("资源已归档，请先恢复");
    return r;
  };
  const anchorFor = (id: string, includeDeleted = false) => {
    const a = get(id);
    if (a.kind !== "anchor") fail("需要位置 ID");
    if (!includeDeleted) active(a);
    return a;
  };

  return {
    db,
    get,
    maybe,
    put,
    rows,
    save,
    resourceFor,
    anchorFor,
    isDeleted,
    active,
  };
}
export type Repository = ReturnType<typeof openRepository>;
export type Handler = (params: RecordData, actor: Actor) => any;
