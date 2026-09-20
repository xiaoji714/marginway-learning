import { fail, str, type RecordData } from "../shared.js";
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
      const note = discussionNote(repository, a.id, p.noteId);
      result = save(
        "discussion",
        {
          anchorId: a.id,
          ...(note ? { noteId: note.id } : {}),
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

// A note focus is a live reference, never a copy of every note at this anchor.
export function discussionNote(
  repository: Repository,
  anchorId: string,
  noteId: unknown,
) {
  if (noteId == null) return null;
  if (typeof noteId !== "string" || !noteId) fail("需要笔记 ID");
  const note = repository.active(repository.get(noteId));
  if (note.kind !== "note" || note.anchorId !== anchorId)
    fail("笔记不属于该位置");
  return note;
}

// Clipboard text is a bounded handoff; context.export.context remains machine-readable.
export function discussionPrompt(
  resource: RecordData,
  anchor: RecordData,
  discussion: RecordData | null,
  note: RecordData | null,
) {
  const excerpt = (value: string, limit: number) => {
    const chars = Array.from(value.trim());
    return chars.length > limit
      ? chars.slice(0, limit).join("") + "…〔节选〕"
      : chars.join("");
  };
  const lines = [
    "请使用 Marginway Skill，围绕下面的引用材料与我讨论。",
    "Skill：https://github.com/xiaoji714/marginway-learning/blob/main/skills/SKILL.md",
    "已接入时直接使用；本机也可通过 learning skill 获取。",
    "",
    "我的问题：" +
      excerpt(discussion?.question || "我想进一步理解这段内容", 240),
  ];
  if (discussion?.selected && discussion.selected !== anchor.quote)
    lines.push("选中内容：" + excerpt(discussion.selected, 120));
  if (note)
    lines.push(
      "当前笔记（" +
        (note.origin === "agent" ? "Agent 生成" : "用户记录") +
        "）：" +
        excerpt(note.text, 240),
    );
  lines.push("原文：" + excerpt(anchor.quote, 280));
  lines.push("来源：" + excerpt(resource.title, 80));
  let url = resource.url;
  if (resource.type === "video" && anchor.start != null) {
    const seconds = Math.floor(anchor.start);
    lines.push(
      "位置：" +
        Math.floor(seconds / 60) +
        ":" +
        String(seconds % 60).padStart(2, "0"),
    );
    url += "&t=" + seconds + "s";
  }
  if (url.length <= 350) lines.push(url);
  lines.push("", "Marginway 引用：anchorId=" + anchor.id);
  if (discussion) lines.push("discussionId=" + discussion.id);
  if (note) lines.push("noteId=" + note.id);
  lines.push(
    "完整材料按 Skill 按需读取；无法访问时先基于以上节选讨论，并说明限制。",
  );
  const prompt = lines.join("\n");
  if (Array.from(prompt).length > 2000)
    fail(
      "讨论交接超过 2000 字符：引用信息异常，不能截断 ID。可通过 records.get 读取原记录后重新整理引用。",
    );
  return prompt;
}
