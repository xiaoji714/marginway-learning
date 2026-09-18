import { canonical, fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createVocabulary(
  repository: Repository,
): Record<string, Handler> {
  const { db, get, maybe, put, rows, save, resourceFor, anchorFor } =
    repository;
  return {
    "vocabulary.save": (p, actor) => {
      let result;
      const a = anchorFor(p.anchorId),
        word = str(p.word, 300).trim();
      if (!word) fail("词条不能为空");
      const language = str(p.language || "en", 20),
        id = "v_" + hash(language + ":" + word.toLocaleLowerCase());
      const v =
        maybe(id) ||
        save(
          "vocabulary",
          {
            word,
            language,
            dueAt: new Date().toISOString(),
            intervalDays: 0,
          },
          actor,
          id,
        );
      const oid = "o_" + hash(v.id + ":" + a.id + ":" + word);
      result = {
        vocabulary: v,
        occurrence:
          maybe(oid) ||
          save(
            "occurrence",
            {
              resourceId: a.resourceId,
              anchorId: a.id,
              vocabularyId: v.id,
              word,
              meaning: str(p.meaning, 4000),
            },
            actor,
            oid,
          ),
      };

      return result;
    },
    "reviews.record": (p, actor) => {
      let result;
      const v = get(p.vocabularyId);
      if (
        v.kind !== "vocabulary" ||
        !["again", "hard", "good"].includes(p.rating)
      )
        fail("复习参数无效");
      const days =
        p.rating === "again"
          ? 0
          : p.rating === "hard"
            ? 1
            : Math.max(2, (v.intervalDays || 1) * 2);
      result = save("review", { vocabularyId: v.id, rating: p.rating }, actor);
      save(
        "vocabulary",
        {
          ...v,
          intervalDays: days,
          dueAt: new Date(
            Date.now() + (days ? days * 86400000 : 600000),
          ).toISOString(),
        },
        actor,
        v.id,
      );

      return result;
    },
  };
}
