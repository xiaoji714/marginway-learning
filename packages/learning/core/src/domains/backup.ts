import { canonical, fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createBackup(repository: Repository): Record<string, Handler> {
  const { db, get, maybe, put, rows, save, resourceFor, anchorFor } =
    repository;
  return {
    "backup.import": (p, actor) => {
      let result;
      const data = p.data;
      if (
        data?.schemaVersion !== 1 ||
        !Array.isArray(data.objects) ||
        data.objects.length > 50000
      )
        fail("备份格式无效");
      const kinds = new Set([
        "resource",
        "anchor",
        "note",
        "vocabulary",
        "occurrence",
        "review",
        "discussion",
        "translation",
        "job",
      ]);
      for (const o of data.objects) {
        if (
          !kinds.has(o.kind) ||
          typeof o.id !== "string" ||
          !o.updatedAt ||
          !o.revision
        )
          fail("备份记录无效");
        if (o.kind === "resource") canonical(o.url);
        const old = maybe(o.id);
        if (old && JSON.stringify(old) !== JSON.stringify(o))
          fail("备份包含冲突记录：" + o.id, "CONFLICT");
      }
      for (const o of data.objects) {
        if (!maybe(o.id)) {
          put(o);
          db.prepare("INSERT INTO revisions(id,data) VALUES(?,?)").run(
            o.id,
            JSON.stringify(o),
          );
        }
      }
      for (const o of data.objects) {
        if (o.resourceId) resourceFor(o.resourceId, true);
        if (o.anchorId) anchorFor(o.anchorId, true);
      }
      result = { imported: data.objects.length };

      return result;
    },
  };
}
