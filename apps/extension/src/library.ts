const { api, call, el, button, all } = LC;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
let view = "stats",
  detailResource: any = null,
  renderGeneration = 0,
  lastRenderKey = "";
const views: Record<string, string> = {
  "resources.list": "全部资源",
  "vocabulary.list": "单词簿",
  "notes.list": "思考笔记",
  review: "今日复习",
  "jobs.list": "任务状态",
  stats: "学习统计",
  "trash.list": "回收站",
  search: "搜索结果",
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
function navigate(next: string, clearQuery = false) {
  detailResource = null;
  view = next;
  lastRenderKey = "";
  if (clearQuery) $<HTMLInputElement>("query").value = "";
  render().catch(error);
}
function breadcrumbs() {
  const nav = $("breadcrumbs");
  if (!nav) return;
  const list = el("ol");
  const entries: [string, (() => void) | null][] = [
    ["资料库", () => navigate("stats", true)],
    [views[view]!, detailResource ? () => navigate(view) : null],
  ];
  if (detailResource) entries.push([detailResource.title, null]);
  for (const [label, action] of entries) {
    const item = el("li");
    const node = action ? button(label, action) : el("span", label);
    if (!action) node.setAttribute("aria-current", "page");
    item.append(node);
    list.append(item);
  }
  nav.replaceChildren(list);
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
type EditField = {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
};
function editDialog(
  title: string,
  fields: EditField[],
  save: (values: Record<string, string>, operationId: string) => Promise<any>,
  hint = "",
  submitLabel = "保存",
) {
  const d = el("dialog", null, "dialog");
  d.setAttribute("aria-label", title);
  const form = el("form");
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  form.append(el("h2", title));
  if (hint) form.append(el("p", hint, "muted"));
  for (const field of fields) {
    const label = el("label", field.label, "edit-field");
    const input = field.multiline ? el("textarea") : el("input");
    input.value = field.value;
    input.required = !!field.required;
    input.maxLength = field.maxLength || 12000;
    input.setAttribute("aria-label", field.label);
    inputs.set(field.key, input);
    label.append(input);
    form.append(label);
  }
  const status = el("div", null, "status");
  status.setAttribute("role", "status");
  const actions = el("div", null, "actions");
  const submit = el(
    "button",
    submitLabel,
    submitLabel === "移入回收站" ? "danger" : "primary",
  );
  submit.type = "submit";
  const cancel = button("取消", () => (d.close ? d.close() : d.remove()));
  cancel.type = "button";
  let attempt: { fingerprint: string; operationId: string } | undefined;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const values = Object.fromEntries(
      [...inputs].map(([key, input]) => [key, input.value]),
    );
    if (fields.some((f) => f.required && !values[f.key]!.trim())) {
      status.textContent = "必填内容不能为空";
      return;
    }
    submit.disabled = true;
    cancel.disabled = true;
    try {
      const fingerprint = JSON.stringify(values);
      if (!attempt || attempt.fingerprint !== fingerprint)
        attempt = { fingerprint, operationId: crypto.randomUUID() };
      await save(values, attempt.operationId);
      d.remove();
      lastRenderKey = "";
      await render();
    } catch (e) {
      status.textContent = fields.length
        ? `${e.message}。内容已保留；如有版本冲突，请复制草稿后取消并重新打开编辑。`
        : `${e.message}。请取消后重新打开再试。`;
    } finally {
      submit.disabled = false;
      cancel.disabled = false;
    }
  };
  d.addEventListener("cancel", (event) => {
    if (submit.disabled) event.preventDefault();
  });
  actions.append(submit, cancel);
  form.append(actions, status);
  d.append(form);
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  if (d.showModal) d.showModal();
  else d.setAttribute("open", "");
  (
    inputs.values().next().value ||
    (submitLabel === "移入回收站" ? cancel : submit)
  ).focus();
}
const recordNames: Record<string, string> = {
  resource: "资源",
  vocabulary: "单词",
  occurrence: "这处语境",
  note: "笔记",
};
function trashAction(item: any, deleted = true) {
  const name = recordNames[item.kind]!;
  const label = deleted ? `删除${name}` : `恢复${name}`;
  const scope =
    item.kind === "resource"
      ? "该资源的笔记、词汇语境、字幕将一并隐藏，未完成的任务会取消。全局词条与复习历史保留，其他资源不受影响。"
      : item.kind === "vocabulary"
        ? "该词条的所有语境及复习记录将一并隐藏，资源和笔记不受影响。"
        : "只移除这条记录，原文和其他记录不受影响。";
  editDialog(
    label,
    [],
    async (_values, operationId) => {
      const result = await api("records.setDeleted", {
        id: item.id,
        expectedRevision: item.revision,
        deleted,
        operationId,
      });
      if (deleted && detailResource?.id === item.id) detailResource = null;
      return result;
    },
    `${item.title || item.word || item.text || name}
${deleted ? scope + " 可在回收站恢复。" : "恢复后回到原来的位置；先前单独删除的关联记录保持删除状态。"}`,
    deleted ? "移入回收站" : "恢复",
  );
}
function deleteButton(item: any) {
  const b = button(`删除${recordNames[item.kind]}`, () => trashAction(item));
  b.classList.add("danger-text");
  return b;
}
function editResource(item: any) {
  editDialog(
    "编辑资源",
    [
      {
        key: "title",
        label: "资源标题",
        value: item.title,
        required: true,
        maxLength: 500,
      },
      {
        key: "tags",
        label: "分类（用逗号分隔）",
        value: (item.tags || []).join(", "),
      },
    ],
    ({ title, tags }, operationId) =>
      api("resources.update", {
        id: item.id,
        expectedRevision: item.revision,
        title,
        tags: tags!
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
        operationId,
      }),
    "修改名称与分类，不改变来源网址和原文语境。",
  );
}
function editWord(item: any) {
  editDialog(
    "编辑单词",
    [
      {
        key: "word",
        label: "单词或短语",
        value: item.word,
        required: true,
        maxLength: 300,
      },
    ],
    ({ word }, operationId) =>
      api("vocabulary.update", {
        id: item.id,
        expectedRevision: item.revision,
        word,
        operationId,
      }),
    "修改会应用于这个词条的所有语境，原文与复习记录保持不变。",
  );
}
function editMeaning(item: any) {
  editDialog(
    "编辑释义",
    [
      {
        key: "meaning",
        label: "这处语境的释义",
        value: item.meaning || "",
        multiline: true,
        maxLength: 4000,
      },
    ],
    ({ meaning }, operationId) =>
      api("occurrences.update", {
        id: item.id,
        expectedRevision: item.revision,
        meaning,
        operationId,
      }),
    "只修改这处语境的释义，其他语境不受影响。",
  );
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
    copyContext(item, card).catch(error),
  );
  discuss.title = "复制上下文，粘贴到 Agent 中继续讨论";
  actions.append(discuss);
  if (item.kind === "note")
    actions.append(
      button("编辑笔记", () =>
        editDialog(
          "编辑笔记",
          [
            {
              key: "text",
              label: "笔记内容",
              value: item.text,
              multiline: true,
              required: true,
            },
          ],
          ({ text }, operationId) =>
            api("notes.update", {
              id: item.id,
              expectedRevision: item.revision,
              text,
              operationId,
            }),
        ),
      ),
    );
  if (item.kind === "occurrence") {
    card.append(el("div", item.meaning || "尚未保存释义", "translation"));
    actions.append(
      button("编辑单词", async () => {
        try {
          editWord(await api("records.get", { id: item.vocabularyId }));
        } catch (e) {
          error(e);
        }
      }),
      button("编辑释义", () => editMeaning(item)),
    );
  }
  actions.append(deleteButton(item));
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
      `${key(start)} — ${key(end)} · 按本地日期统计你保存的词句、新笔记和复习反馈；编辑不重复计数，含 Agent 代记的用户明确复习反馈；自动翻译与其他 Agent 生成内容不计入。`,
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
  breadcrumbs();
  const help = $("view-help");
  if (help) help.hidden = Boolean(detailResource) || view !== "trash.list";
  if (detailResource) return resourceDetails(detailResource, gen);
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
    $("status").textContent = "";
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
  if (
    key === lastRenderKey &&
    !["vocabulary.list", "review", "search"].includes(view)
  )
    return;
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    let card = el("article", null, "record");
    if (currentView === "trash.list") {
      card.append(
        provenance(item),
        el("h2", item.title || item.word || item.text),
        el("p", `${recordNames[item.kind]} · 已移入回收站`, "muted"),
      );
      const actions = el("div", null, "actions");
      actions.append(button("恢复", () => trashAction(item, false)));
      card.append(actions);
    } else if (item.kind === "resource") {
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
        button("编辑资源", () => editResource(item)),
        deleteButton(item),
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
      if (!os.length)
        card.append(
          el("p", "暂无可见语境，可在回收站恢复相关资源或语境。", "muted"),
        );
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
        const meaning = el(
          "div",
          o.meaning || "尚未保存释义，可回到原文重新翻译。",
          "translation",
        );
        if (review) answer.append(meaning);
        else {
          const actions = el("div", null, "actions");
          actions.append(
            button("编辑释义", () => editMeaning(o)),
            deleteButton(o),
          );
          block.append(meaning, actions);
        }
      }
      if (!review) {
        const actions = el("div", null, "actions");
        actions.append(
          button("编辑单词", () => editWord(item)),
          deleteButton(item),
        );
        card.append(actions);
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
    } else if (item.kind === "note" || item.kind === "occurrence") {
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
      currentView === "trash.list"
        ? ["回收站是空的", "删除的资源、单词和笔记会出现在这里，可随时恢复。"]
        : currentView === "search"
          ? ["没有找到匹配记录", "试试原文里的词、资源名称或分类标签。"]
          : currentView === "review"
            ? [
                "今天的复习已完成",
                "之后有词条到期，会出现在这里。也可以去单词簿自由回顾。",
              ]
            : currentView === "jobs.list"
              ? [
                  "当前没有任务",
                  "获取字幕或使用翻译时，可以在这里查看处理状态。",
                ]
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
                  : [
                      "还没有学习资源",
                      "打开一个视频或网页，使用语境开始学习。",
                    ];
    fragment.append(empty(copy[0], copy[1]));
  }
  // Every asynchronous iteration checks generation before appending.
  $("content").replaceChildren(fragment);
  lastRenderKey = key;
}
async function copyContext(note: any, container: any) {
  const anchorId = note.anchorId;
  const d = await api("discussions.create", {
    anchorId,
    ...(note.kind === "note"
      ? { noteId: note.id, question: "继续讨论这条笔记及其原文" }
      : {
          selected: note.word,
          selectionTranslation: note.meaning,
          question: `我想理解“${note.word}”在这处语境中的含义`,
        }),
    operationId: crypto.randomUUID(),
  });
  const x = await api("context.export", { anchorId, discussionId: d.id });
  if (await LC.clipboard(x.prompt, container))
    $("status").textContent = "讨论上下文已复制，请粘贴到 Agent 中继续讨论。";
  else $("status").textContent = "请手动复制下方讨论上下文";
}
async function resourceDetails(r: any, gen: any) {
  const [latest, notes, occ] = await Promise.all([
    api("records.get", { id: r.id }),
    all("notes.list", { resourceId: r.id }),
    all("occurrences.list", { resourceId: r.id }),
  ]);
  if (detailResource?.id !== r.id || gen !== renderGeneration) return;
  if (latest.deleted) {
    navigate(view);
    return;
  }
  r = latest;
  detailResource = latest;
  breadcrumbs();
  const fragment = document.createDocumentFragment();
  const actions = el("div", null, "actions resource-actions");
  actions.append(
    button("编辑资源", () => editResource(r)),
    link(r),
    deleteButton(r),
  );
  fragment.append(actions);
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
    navigate(b.dataset.view!, true);
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
