import { fail } from "../shared.js";
import type { Repository, Handler } from "../repository.js";

export function createTrash(repository: Repository): Record<string, Handler> {
  const { get, active, save, rows } = repository;
  return {
    "records.setDeleted": (p, actor) => {
      const record = get(p.id);
      if (
        !["resource", "vocabulary", "note", "occurrence"].includes(record.kind)
      )
        fail("只能删除或恢复资源、词条、笔记和词汇语境");
      if (typeof p.deleted !== "boolean") fail("deleted 必须为布尔值");
      if (record.revision !== p.expectedRevision)
        fail("记录已更新，请重新读取", "CONFLICT");
      if (!p.deleted) active({ ...record, deleted: false });
      if (Boolean(record.deleted) === p.deleted) return record;
      if (p.deleted && record.kind === "resource") {
        for (const job of rows("job").filter(
          (job) =>
            job.resourceId === record.id &&
            ["queued", "running"].includes(job.status),
        ))
          save("job", { ...job, status: "cancelled" }, actor, job.id, true);
      }
      return save(
        record.kind,
        {
          ...record,
          deleted: p.deleted,
          deletedAt: p.deleted ? new Date().toISOString() : null,
        },
        actor,
        record.id,
        true,
      );
    },
  };
}
