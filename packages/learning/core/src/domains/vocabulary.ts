import { randomUUID } from "node:crypto";
import { fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createVocabulary(
  repository: Repository,
): Record<string, Handler> {
  const { db, get, maybe, put, rows, save, resourceFor, anchorFor, active } =
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
        rows("vocabulary").find(
          (v) =>
            v.language === language &&
            v.word.toLocaleLowerCase() === word.toLocaleLowerCase(),
        ) ||
        save(
          "vocabulary",
          {
            word,
            language,
            dueAt: new Date().toISOString(),
            intervalDays: 0,
          },
          actor,
          maybe(id) ? randomUUID() : id,
        );
      active(v);
      const oid = "o_" + hash(v.id + ":" + a.id + ":" + word);
      result = {
        vocabulary: v,
        occurrence:
          rows("occurrence").find(
            (o) =>
              o.vocabularyId === v.id && o.anchorId === a.id && o.word === word,
          ) ||
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
            maybe(oid) ? randomUUID() : oid,
          ),
      };

      active(result.occurrence);
      return result;
    },
    "vocabulary.update": (p, actor) => {
      const v = active(get(p.id));
      if (v.kind !== "vocabulary") fail("需要词条 ID");
      if (v.revision !== p.expectedRevision)
        fail("词条已更新，请重新打开编辑", "CONFLICT");
      const word = str(p.word, 300).trim();
      if (!word) fail("词条不能为空");
      if (
        rows("vocabulary").some(
          (other) =>
            other.id !== v.id &&
            other.language === v.language &&
            other.word.toLocaleLowerCase() === word.toLocaleLowerCase(),
        )
      )
        fail("该词条已存在，请在单词簿中编辑已有词条", "CONFLICT");
      // Keep stable IDs so review history and external Agent references survive corrections.
      for (const o of rows("occurrence").filter((o) => o.vocabularyId === v.id))
        save("occurrence", { ...o, word }, actor, o.id, true);
      return save("vocabulary", { ...v, word }, actor, v.id);
    },
    "occurrences.update": (p, actor) => {
      const o = active(get(p.id));
      if (o.kind !== "occurrence") fail("需要词汇语境 ID");
      if (o.revision !== p.expectedRevision)
        fail("释义已更新，请重新打开编辑", "CONFLICT");
      return save(
        "occurrence",
        { ...o, meaning: str(p.meaning, 4000) },
        actor,
        o.id,
      );
    },
    "reviews.record": (p, actor) => {
      let result;
      const v = active(get(p.vocabularyId));
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
