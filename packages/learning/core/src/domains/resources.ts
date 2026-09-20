import { canonical, fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createResources(
  repository: Repository,
): Record<string, Handler> {
  const { db, get, maybe, put, rows, save, resourceFor, anchorFor } =
    repository;
  return {
    "resources.upsert": (p, actor) => {
      let result;
      const url = canonical(p.url),
        id = "r_" + hash(url),
        prev = maybe(id);
      result =
        (prev?.archived
          ? save("resource", { ...prev, archived: false }, actor, id)
          : prev) ||
        save(
          "resource",
          {
            url,
            title: str(p.title, 500) || url,
            tags: Array.isArray(p.tags)
              ? p.tags.map((x: unknown) => str(x, 60)).slice(0, 20)
              : [],
            type: url.startsWith("https://www.youtube.com/watch?")
              ? "video"
              : "web",
          },
          actor,
          id,
        );

      return result;
    },
    "resources.setArchived": (p, actor) => {
      const r = resourceFor(p.id, true);
      if (typeof p.archived !== "boolean") fail("archived 必须为布尔值");
      if (r.revision !== p.expectedRevision)
        fail("资源已更新，请重新读取", "CONFLICT");
      if (
        p.archived &&
        db
          .prepare("SELECT 1 FROM objects WHERE resource_id=? LIMIT 1")
          .get(r.id)
      )
        fail("仅允许归档没有关联记录的空资源");
      return save("resource", { ...r, archived: p.archived }, actor, r.id);
    },
    "resources.update": (p, actor) => {
      let result;
      const r = resourceFor(p.id);
      if (r.revision !== p.expectedRevision)
        fail("资源已更新，请重新读取", "CONFLICT");
      result = save(
        "resource",
        {
          ...r,
          title: str(p.title, 500) || r.title,
          tags: Array.isArray(p.tags)
            ? p.tags.map((x: unknown) => str(x, 60)).slice(0, 20)
            : r.tags,
        },
        actor,
        r.id,
      );

      return result;
    },
    "anchors.upsert": (p, actor) => {
      let result;
      resourceFor(p.resourceId);
      const quote = str(p.quote, 12000);
      if (!quote.trim()) fail("原文不能为空");
      const start = p.start == null ? null : Number(p.start),
        end = p.end == null ? null : Number(p.end);
      if (
        (start !== null && (!Number.isFinite(start) || start < 0)) ||
        (end !== null && (!Number.isFinite(end) || end < (start || 0)))
      )
        fail("时间区间无效");
      const id =
        "a_" +
        hash(
          JSON.stringify([
            p.resourceId,
            start,
            quote,
            str(p.prefix, 300),
            str(p.suffix, 300),
          ]),
        );
      result =
        maybe(id) ||
        save(
          "anchor",
          {
            resourceId: p.resourceId,
            quote,
            context: str(p.context, 16000),
            start,
            end,
            prefix: str(p.prefix, 300),
            suffix: str(p.suffix, 300),
          },
          actor,
          id,
        );

      return result;
    },
  };
}
