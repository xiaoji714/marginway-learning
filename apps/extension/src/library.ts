const { api, call, el, button, all } = LC;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
let view = "stats",
  detailResource: any = null,
  renderGeneration = 0,
  lastRenderKey = "";
const views: Record<string, [string, string]> = {
  "resources.list": ["全部资源", "从一个视频或网页，找回相关的词句与思考。"],
  "vocabulary.list": ["单词簿", "每个词，都保留你遇见它时的原文语境。"],
  "notes.list": ["思考笔记", "回到当时的问题，也可以带着上下文继续讨论。"],
  review: ["今日复习", "先回想语境，再查看答案，按真实记忆程度记录。"],
  "jobs.list": ["任务状态", "查看字幕获取与翻译的进度。"],
  stats: ["学习统计", "查看这台电脑上积累的学习记录。"],
  search: ["搜索结果", "同时查找资源、原文、词汇、笔记与分类。"],
};
const jobNames: Record<string, string> = {
  transcript: "获取视频字幕",
  translate: "翻译字幕",
  lookup: "划词翻译",
  seek: "定位视频",
};
const jobStates: Record<string, string> = {
  queued: "等待处理",
  running: "正在处理",
  done: "已完成",
  error: "未完成",
  cancelled: "已取消",
};
const port = chrome.runtime.connect({ name: "lc-view" });
let timer: any;
port.onMessage.addListener(() => {
  clearTimeout(timer);
  timer = setTimeout(() => render().catch(error), 350);
});
function error(e: any) {
  $("status").textContent = e.message;
  $("status").className = "status error";
}
function heading(title: any, description: any) {
  if ($("view-title")) $("view-title").textContent = title;
  if ($("view-description")) $("view-description").textContent = description;
}
function link(r: any, a?: any) {
  const u = new URL(r.url);
  if (a?.start != null) u.searchParams.set("t", String(Math.floor(a.start)));
  else if (a?.quote)
    u.hash = ":~:text=" + encodeURIComponent(a.quote.slice(0, 200));
  const l = el(
    "a",
    a?.start != null
      ? `回到视频 ${LC.time(a.start)}`
      : a
        ? "回到原文"
        : `打开来源 · ${u.hostname.replace(/^www\./, "")}`,
    "source-link",
  );
  l.title = r.title;
  l.href = u.href;
  l.target = "_blank";
  l.rel = "noopener";
  return l;
}
async function details(anchorId: any) {
  const a = await api("records.get", { id: anchorId });
  const r = await api("records.get", { id: a.resourceId });
  return { a, r };
}
function provenance(item: any) {
  const row = el("div", null, "record-meta");
  let label = "我的记录";
  if (item.origin === "agent") {
    label = `Agent 生成 · ${item.createdBy?.name || "身份未提供"}`;
    const model = item.createdBy?.model;
    if (model && model !== "unknown") label += ` · ${model}`;
  } else if (item.origin !== "human") label = "来源资料";
  const badge = el(
    "span",
    label,
    `badge ${item.origin === "agent" ? "agent" : ""}`,
  );
  if (
    item.origin === "agent" &&
    (!item.createdBy?.model || item.createdBy.model === "unknown")
  )
    badge.title = "Agent 未提供模型身份";
  row.append(badge);
  if (item.updatedAt || item.createdAt) {
    const date = new Date(item.updatedAt || item.createdAt);
    if (!Number.isNaN(date.getTime())) {
      const t = el(
        "time",
        new Intl.DateTimeFormat("zh-CN", {
          month: "short",
          day: "numeric",
        }).format(date),
      );
      t.dateTime = date.toISOString();
      t.title = date.toLocaleString("zh-CN");
      row.append(t);
    }
  }
  return row;
}
function context(a: any, r: any) {
  const block = el("div", null, "context-block");
  block.append(el("div", a.context || a.quote, "quote"), link(r, a));
  return block;
}
function empty(title: any, description: any) {
  const block = el("div", null, "empty");
  block.append(el("h3", title), el("p", description));
  return block;
}
function editDialog(title: any, initial: any, save: any) {
  const d = el("dialog", null, "dialog");
  const input = el("textarea");
  input.value = initial;
  input.setAttribute("aria-label", title);
  const status = el("div", null, "status");
  status.setAttribute("role", "status");
  const actions = el("div", null, "actions");
  const submit = button("保存", async () => {
    submit.disabled = true;
    try {
      await save(input.value);
      d.remove();
      await render();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      submit.disabled = false;
    }
  });
  submit.className = "primary";
  actions.append(
    submit,
    button("取消", () => d.remove()),
  );
  d.append(el("h2", title), input, actions, status);
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  if (d.showModal) d.showModal();
  else d.setAttribute("open", "");
  input.focus();
}
async function noteCard(item: any) {
  const card = el("article", null, "record");
  const { a, r } = await details(item.anchorId);
  card.append(
    provenance(item),
    el("div", item.text || item.word, "note-body"),
    context(a, r),
  );
  const actions = el("div", null, "actions");
  const discuss = button("在 Agent 中讨论", () =>
    copyContext(item.anchorId, card).catch(error),
  );
  discuss.title = "复制上下文，粘贴到 Agent 中继续讨论";
  actions.append(discuss);
  if (item.kind === "note")
    actions.append(
      button("编辑笔记", () =>
        editDialog("编辑笔记", item.text, (text: any) =>
          api("notes.update", {
            id: item.id,
            expectedRevision: item.revision,
            text,
            operationId: crypto.randomUUID(),
          }),
        ),
      ),
    );
  card.append(actions);
  return card;
}
function activityHeatmap(events: DataRecord[], today = new Date()) {
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const days: {
    date: string;
    weekday: number;
    month: number;
    day: number;
    counts: Record<string, number>;
    total: number;
  }[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    days.push({
      date: key(d),
      weekday: d.getDay(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      counts: { occurrence: 0, note: 0, review: 0 },
      total: 0,
    });
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const event of events) {
    const date = new Date(event.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const day = byDate.get(key(date));
    if (day && Object.hasOwn(day.counts, event.kind)) {
      day.counts[event.kind]!++;
      day.total++;
    }
  }
  const section = el("section", null, "activity-section");
  section.setAttribute("aria-label", "学习记录热力图");
  const total = days.reduce((n, d) => n + d.total, 0);
  const active = days.filter((d) => d.total).length;
  section.append(
    el("h3", "学习足迹"),
    el("p", `近一年 ${total} 条记录 · ${active} 个活跃日`, "muted"),
  );
  const scroll = el("div", null, "activity-scroll");
  const calendar = el("div", null, "activity-calendar");
  const months = el("div", null, "activity-months");
  const grid = el("div", null, "activity-grid");
  for (let i = 0; i < start.getDay(); i++) grid.append(el("span"));
  const detail = el("p", "点击日期，查看当天的学习记录。", "activity-detail");
  detail.setAttribute("role", "status");
  days.forEach((day, i) => {
    if (day.day === 1) {
      const label = el("span", `${day.month}月`);
      label.style.gridColumn = `${Math.floor((i + start.getDay()) / 7) + 1} / span 3`;
      months.append(label);
    }
    const label = `${day.date} · ${day.total} 条记录`;
    const cell = button("", () => {
      grid
        .querySelectorAll("button")
        .forEach((b) => b.setAttribute("aria-pressed", "false"));
      cell.setAttribute("aria-pressed", "true");
      detail.textContent = `${day.date}：收藏词句 ${day.counts.occurrence} · 笔记 ${day.counts.note} · 复习 ${day.counts.review}`;
    });
    cell.className = "activity-day";
    cell.dataset.level = String(
      day.total === 0
        ? 0
        : day.total < 3
          ? 1
          : day.total < 6
            ? 2
            : day.total < 10
              ? 3
              : 4,
    );
    cell.dataset.date = day.date;
    cell.title = label;
    cell.setAttribute("aria-label", label);
    cell.setAttribute("aria-pressed", "false");
    grid.append(cell);
  });
  const weekday = el("div", null, "activity-weekdays");
  for (const name of ["日", "", "二", "", "四", "", "六"])
    weekday.append(el("span", name));
  const body = el("div", null, "activity-body");
  body.append(weekday, grid);
  calendar.append(months, body);
  scroll.append(calendar);
  const legend = el("div", null, "activity-legend");
  legend.append(el("span", "少"));
  for (let i = 0; i < 5; i++) {
    const swatch = el("span", null, "activity-swatch");
    swatch.dataset.level = String(i);
    legend.append(swatch);
  }
  legend.append(el("span", "多"));
  section.append(
    scroll,
    legend,
    detail,
    el(
      "p",
      `${key(start)} — ${key(end)} · 按本地日期统计你保存的词句、新笔记和复习反馈；编辑不重复计数，自动翻译与 Agent 生成内容不计入。`,
      "muted stats-footnote",
    ),
  );
  return section;
}
async function render() {
  const gen = ++renderGeneration;
  const currentView = view;
  for (const b of document.querySelectorAll<HTMLElement>("[data-view]"))
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  $("status").className = "status";
  if (detailResource) return resourceDetails(detailResource, gen);
  heading(...(views[view] || views.search!));
  if (view === "stats") {
    const [s, events] = await Promise.all([api("stats"), all("activity.list")]);
    if (gen !== renderGeneration) return;
    lastRenderKey = "";
    const grid = el("div", null, "stats-grid");
    for (const [k, label] of [
      ["resource", "学习资源"],
      ["vocabulary", "收藏词条"],
      ["note", "思考笔记"],
      ["review", "复习次数"],
      ["occurrence", "词汇语境"],
      ["translation", "译文段落"],
    ]) {
      const c = el("div", null, "stat");
      c.append(el("div", String(s[k!] || 0), "count"), el("div", label));
      grid.append(c);
    }
    $("content").replaceChildren(
      activityHeatmap(events),
      grid,
      el(
        "p",
        "按本机已保存记录累计；复习次数只统计你实际提交的反馈。",
        "muted stats-footnote",
      ),
    );
    $("status").textContent = "本机累计";
    return;
  }
  const params = { query: $<HTMLInputElement>("query").value };
  const items = await all(view === "review" ? "vocabulary.list" : view, {
    ...params,
    ...(view === "review" ? { due: true } : {}),
  });
  if (currentView !== view || gen !== renderGeneration) return;
  const key = JSON.stringify([
    view,
    params.query,
    items.map((x) => [x.id, x.revision]),
  ]);
  $("status").textContent =
    view === "review"
      ? `${items.length} 个待复习词条`
      : `${items.length} 条记录 · 本机保存`;
  if (key === lastRenderKey) return;
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    let card = el("article", null, "record");
    if (item.kind === "resource") {
      card.classList.add("resource-card");
      card.append(
        el("span", item.type === "video" ? "视频" : "网页", "badge"),
        el("h2", item.title.replace(/ - YouTube$/, "")),
        link(item),
      );
      const tags = el("div", null, "resource-tags");
      for (const tag of item.tags || []) tags.append(el("span", tag, "badge"));
      if (!item.tags?.length) tags.append(el("span", "尚未分类", "muted"));
      const actions = el("div", null, "actions");
      const open = button("查看资源记录", () => {
        detailResource = item;
        lastRenderKey = "";
        render().catch(error);
      });
      open.className = "primary";
      actions.append(
        open,
        button("编辑分类", () =>
          editDialog(
            "资源分类 · 用逗号分隔",
            (item.tags || []).join(", "),
            (text: any) =>
              api("resources.update", {
                id: item.id,
                expectedRevision: item.revision,
                tags: text
                  .split(/[,，]/)
                  .map((x: any) => x.trim())
                  .filter(Boolean),
                operationId: crypto.randomUUID(),
              }),
          ),
        ),
      );
      card.append(tags, actions);
    } else if (item.kind === "vocabulary") {
      const review = currentView === "review";
      if (review) card.classList.add("review-card");
      card.append(
        provenance(item),
        el("h2", review ? "回想这个词" : item.word, "word-title"),
      );
      const os = await all("occurrences.list", { vocabularyId: item.id });
      const answer = el("div", null, "review-answer");
      if (review) {
        answer.hidden = true;
        answer.append(el("h3", item.word));
      }
      const quotes: any = [];
      for (const o of os) {
        const { a, r } = await details(o.anchorId);
        const original = a.context || a.quote;
        const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const q = el(
          "div",
          review
            ? original.replace(new RegExp(escaped, "gi"), "_____")
            : original,
          "quote",
        );
        quotes.push([q, original]);
        const block = el("div", null, "context-block");
        block.append(q, link(r, a));
        card.append(block);
        answer.append(
          el(
            "div",
            o.meaning || "尚未保存释义，可回到原文重新翻译。",
            "translation",
          ),
        );
      }
      card.append(answer);
      if (review) {
        const reveal = button("显示答案", () => {
          answer.hidden = false;
          reveal.hidden = true;
          ratings.hidden = false;
          for (const [q, text] of quotes) q.textContent = text;
        });
        reveal.className = "primary";
        const ratings = el("div", null, "actions review-rating");
        ratings.hidden = true;
        ratings.append(el("div", "这次记得怎么样？", "muted"));
        for (const [rating, label] of [
          ["again", "忘记了"],
          ["hard", "有点难"],
          ["good", "记住了"],
        ])
          ratings.append(
            button(label!, async () => {
              for (const b of ratings.querySelectorAll("button"))
                b.disabled = true;
              try {
                await api("reviews.record", {
                  vocabularyId: item.id,
                  rating,
                  operationId: crypto.randomUUID(),
                });
                await render();
              } catch (e) {
                error(e);
                for (const b of ratings.querySelectorAll("button"))
                  b.disabled = false;
              }
            }),
          );
        card.append(reveal, ratings);
      }
    } else if (item.kind === "note") {
      card = await noteCard(item);
    } else if (item.kind === "anchor") {
      const r = await api("records.get", { id: item.resourceId });
      card.append(el("span", "原文摘录", "badge"), context(item, r));
    } else if (item.kind === "job") {
      const top = el("div", null, "job-heading");
      top.append(
        el("h2", jobNames[item.type] || "学习任务"),
        el(
          "span",
          jobStates[item.status] || item.status,
          `badge job-state ${item.status}`,
        ),
      );
      card.append(top);
      const when = new Date(item.createdAt);
      const stamp = Number.isNaN(when.getTime())
        ? ""
        : when.toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
      card.append(
        el(
          "div",
          [
            stamp,
            item.anchorIds?.length ? `${item.anchorIds.length} 段原文` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          "job-detail",
        ),
      );
      if (item.resourceId) {
        try {
          const r = await api("records.get", { id: item.resourceId });
          card.append(el("p", r.title, "job-detail"));
        } catch {}
      }
      const description =
        item.error ||
        (item.status === "done"
          ? "结果已保存在资料库。"
          : item.status === "queued"
            ? "正在排队，请保持浏览器开启。"
            : item.status === "running"
              ? "正在处理，完成后会自动更新。"
              : "本次任务已停止。");
      card.append(el("div", description, "job-detail"));
      if (["queued", "running"].includes(item.status)) {
        const actions = el("div", null, "actions");
        actions.append(
          button("取消任务", async () => {
            try {
              await api("jobs.cancel", { id: item.id });
              await render();
            } catch (e) {
              error(e);
            }
          }),
        );
        card.append(actions);
      }
    } else
      card.append(
        el("div", item.question || item.word || item.text || item.id),
      );
    if (gen !== renderGeneration) return;
    fragment.append(card);
  }
  if (!items.length) {
    const copy =
      currentView === "search"
        ? ["没有找到匹配记录", "试试原文里的词、资源名称或分类标签。"]
        : currentView === "review"
          ? [
              "今天的复习已完成",
              "之后有词条到期，会出现在这里。也可以去单词簿自由回顾。",
            ]
          : currentView === "jobs.list"
            ? ["当前没有任务", "获取字幕或使用翻译时，可以在这里查看处理状态。"]
            : currentView === "notes.list"
              ? [
                  "把一个想法留在原文旁",
                  "在网页或字幕中选中文字，写下你的第一条笔记。",
                ]
              : currentView === "vocabulary.list"
                ? [
                    "从遇见一个词开始",
                    "在网页或双语字幕中划词，翻译后收藏到单词簿。",
                  ]
                : ["还没有学习资源", "打开一个视频或网页，使用语境开始学习。"];
    fragment.append(empty(copy[0], copy[1]));
  }
  if (gen === renderGeneration) {
    $("content").replaceChildren(fragment);
    lastRenderKey = key;
  }
}
async function copyContext(anchorId: any, container: any) {
  const d = await api("discussions.create", {
    anchorId,
    question: "继续讨论这条笔记及其原文",
  });
  const x = await api("context.export", { anchorId, discussionId: d.id });
  if (await LC.clipboard(x.prompt, container))
    $("status").textContent = "讨论上下文已复制，请粘贴到 Agent 中继续讨论。";
  else $("status").textContent = "请手动复制下方讨论上下文";
}
async function resourceDetails(r: any, gen: any) {
  const [notes, occ] = await Promise.all([
    all("notes.list", { resourceId: r.id }),
    all("occurrences.list", { resourceId: r.id }),
  ]);
  if (detailResource?.id !== r.id || gen !== renderGeneration) return;
  heading("资源记录", r.title);
  const fragment = document.createDocumentFragment();
  const back = button("返回全部资源", () => {
    detailResource = null;
    view = "resources.list";
    lastRenderKey = "";
    render().catch(error);
  });
  back.className = "back";
  fragment.append(back, link(r));
  for (const item of [...notes, ...occ]) {
    fragment.append(await noteCard(item));
    if (gen !== renderGeneration) return;
  }
  if (!notes.length && !occ.length)
    fragment.append(
      empty(
        "这个资源还没有学习记录",
        "选中原文或字幕，收藏词句或记录你的想法。",
      ),
    );
  $("content").replaceChildren(fragment);
  $("status").textContent = `${notes.length} 条笔记 · ${occ.length} 条词句`;
}
for (const b of document.querySelectorAll<HTMLElement>("[data-view]"))
  b.onclick = () => {
    detailResource = null;
    view = b.dataset.view!;
    render().catch(error);
  };
$("search").onclick = () => {
  detailResource = null;
  view = "search";
  render().catch(error);
};
$("query").onkeydown = (e) => {
  if (e.key === "Enter") $("search").click();
};
$("settings").onclick = () => call({ lc: "options" });
$("export").onclick = async () => {
  try {
    const data = await api("export");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = el("a");
    a.href = url;
    a.download = `marginway-learning-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("status").textContent = "备份已导出";
  } catch (e) {
    error(e);
  }
};
render().catch(error);
