import { fail, str, type Actor, type RecordData } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createNotes(repository: Repository): Record<string, Handler> {
  const { get, anchorFor, save } = repository;
  function write(cmd: string, p: RecordData, actor: Actor) {
    let result;
    const prev = cmd === "notes.update" ? get(p.id) : null;
    if (prev && (prev.kind !== "note" || prev.revision !== p.expectedRevision))
      fail("笔记版本冲突", "CONFLICT");
    const a = anchorFor(prev?.anchorId || p.anchorId);
    const text = str(p.text);
    if (!text.trim()) fail("笔记不能为空");
    if (p.discussionId) {
      const d = get(p.discussionId);
      if (d.kind !== "discussion" || d.anchorId !== a.id)
        fail("讨论与位置不匹配");
    }
    result = save(
      "note",
      {
        ...(prev || {}),
        resourceId: a.resourceId,
        anchorId: a.id,
        text,
        discussionId: prev?.discussionId || p.discussionId || null,
      },
      actor,
      prev?.id,
    );

    return result;
  }
  return {
    "notes.append": (p, a) => write("notes.append", p, a),
    "notes.update": (p, a) => write("notes.update", p, a),
  };
}
