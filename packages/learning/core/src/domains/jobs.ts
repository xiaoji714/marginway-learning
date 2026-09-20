import { canonical, fail, hash, str } from "../shared.js";
import type { Repository, Handler } from "../repository.js";
export function createJobs(repository: Repository): Record<string, Handler> {
  const {
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
  } = repository;
  return {
    "jobs.submit": (p, actor) => {
      let result;
      const r = resourceFor(p.resourceId);
      if (!["transcript", "translate", "lookup", "seek"].includes(p.type))
        fail("任务类型无效");
      if (["transcript", "seek"].includes(p.type) && r.type !== "video")
        fail("仅支持 YouTube 字幕");
      const ids =
        p.type === "translate"
          ? p.anchorIds
          : p.type === "lookup"
            ? [p.anchorId]
            : [];
      if (
        !Array.isArray(ids) ||
        ids.length > 4 ||
        (["translate", "lookup"].includes(p.type) && !ids.length)
      )
        fail("需提供 1 到 4 个位置");
      ids.forEach((id: string) => {
        if (anchorFor(id).resourceId !== r.id) fail("位置不属于资源");
      });
      if (p.type === "seek" && (!Number.isFinite(p.seconds) || p.seconds < 0))
        fail("播放时间无效");
      const payload = {
        seconds: p.type === "seek" ? p.seconds : null,
        type: p.type,
        resourceId: r.id,
        anchorIds: ids,
        text: p.type === "lookup" ? str(p.text, 2000) : "",
      };
      if (p.type === "lookup" && !payload.text.trim()) fail("选词不能为空");
      const cacheKey = hash(
        JSON.stringify(payload) + "deepseek-v4-flash:zh:prompt-v1",
      );
      result =
        (p.type === "seek"
          ? null
          : rows("job").find(
              (j) =>
                j.cacheKey === cacheKey &&
                ["queued", "running", "done"].includes(j.status),
            )) ||
        save("job", { ...payload, cacheKey, status: "queued" }, actor);

      return result;
    },
    "jobs.get": (p, actor) => {
      let result;
      result = get(p.id);
      if (result.kind !== "job") fail("需要任务 ID");

      return result;
    },
    "jobs.cancel": (p, actor) => {
      let result;
      const j = get(p.id);
      if (j.kind !== "job") fail("需要任务 ID");
      result = ["queued", "running"].includes(j.status)
        ? save("job", { ...j, status: "cancelled" }, actor, j.id)
        : j;

      return result;
    },
    "bridge.heartbeat": (p, actor) => {
      let result;
      if (actor.id !== "chrome-ui") fail("仅扩展可调用", "FORBIDDEN");
      db.prepare(
        "INSERT INTO meta VALUES('bridge',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify({ at: new Date().toISOString() }));
      result = { ok: true };

      return result;
    },
    "jobs.claim": (p, actor) => {
      let result;
      if (actor.id !== "chrome-ui") fail("仅扩展可领取", "FORBIDDEN");
      for (const j of rows("job").filter(
        (x) =>
          !isDeleted(x) &&
          x.status === "running" &&
          Date.now() - Date.parse(x.updatedAt) > 180000,
      ))
        save(
          "job",
          {
            ...j,
            status: "error",
            error: "上次执行中断，请重新提交；不会自动重复付费请求",
          },
          actor,
          j.id,
        );
      const j = rows("job")
        .reverse()
        .find((x) => x.status === "queued" && !isDeleted(x));
      result = j ? save("job", { ...j, status: "running" }, actor, j.id) : null;

      return result;
    },
    "jobs.complete": (p, actor) => {
      let result;
      if (actor.id !== "chrome-ui") fail("仅扩展可完成", "FORBIDDEN");
      const j = get(p.id);
      active(j);
      if (j.kind !== "job" || j.status !== "running")
        fail("任务状态已改变", "CONFLICT");
      const ai = {
        origin: "agent",
        id: "deepseek",
        name: "DeepSeek",
        model: "deepseek-v4-flash",
        assurance: "configured-provider",
      };
      if (!p.error && j.type === "transcript") {
        if (
          !Array.isArray(p.segments) ||
          !p.segments.length ||
          p.segments.length > 12000
        )
          fail("字幕返回格式无效");
        // Nested mutations are applied directly within this transaction.
        for (const s of p.segments) {
          const quote = str(s.text, 12000),
            start = Number(s.start),
            duration = Number(s.duration) || 0;
          if (!quote || !Number.isFinite(start) || start < 0) continue;
          const id =
            "a_" + hash(JSON.stringify([j.resourceId, start, quote, "", ""]));
          if (!maybe(id))
            save(
              "anchor",
              {
                resourceId: j.resourceId,
                quote,
                context: quote,
                start,
                end: start + duration,
                prefix: "",
                suffix: "",
              },
              {
                origin: "import",
                id: "supadata",
                name: "Native subtitles",
                assurance: "provider",
              },
              id,
            );
        }
      }
      if (!p.error && j.type === "translate")
        for (const item of p.translations || []) {
          if (!j.anchorIds.includes(item.id) || !str(item.text).trim())
            continue;
          save(
            "translation",
            {
              resourceId: j.resourceId,
              anchorId: item.id,
              text: str(item.text),
              cacheKey: j.cacheKey,
            },
            ai,
            "t_" + hash(item.id + ":" + j.cacheKey),
          );
        }
      result = save(
        "job",
        {
          ...j,
          status: p.error ? "error" : "done",
          error: p.error ? str(p.error, 500) : null,
          result: j.type === "lookup" ? str(p.text, 8000) : null,
        },
        actor,
        j.id,
      );

      return result;
    },
  };
}
