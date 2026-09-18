import { canonical, fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createDiscussions(
  repository: Repository,
): Record<string, Handler> {
  const { db, get, maybe, put, rows, save, resourceFor, anchorFor } =
    repository;
  return {
    "discussions.create": (p, actor) => {
      let result;
      const a = anchorFor(p.anchorId);
      result = save(
        "discussion",
        {
          anchorId: a.id,
          resourceId: a.resourceId,
          question: str(p.question, 4000) || "我想进一步理解这段内容",
          selected: str(p.selected, 2000),
          selectionTranslation: str(p.selectionTranslation, 8000),
        },
        actor,
      );

      return result;
    },
  };
}
