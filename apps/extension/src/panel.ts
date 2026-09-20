const { api, call, el, button, time, all, waitJob } = LC;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
let tab: any = null,
  resource: any = null,
  anchors: any = [],
  notes = [],
  translations: any = [],
  follow = true,
  renderVersion = "",
  generation = 0,
  currentDialog: any = null,
  pendingOrigin: any = null;
let refreshSequence = 0;
const connection = chrome.runtime.connect({ name: "lc-view" });
let refreshTimer: any;
connection.onMessage.addListener((m) => {
  if (m.event === "changed") {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(showError), 300);
  }
});
const showError = (e: any) => {
  $("status").textContent = e.message || String(e);
  $("status").className = "status error";
};
async function active() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
async function load(fetchCaptions = true) {
  const gen = ++generation;
  currentDialog?.dispose();
  currentDialog = null;
  const targetTab = await active();
  if (gen !== generation) return;
  tab = targetTab;
  refreshSequence++;
  if (!/^https?:/.test(targetTab?.url || ""))
    throw new Error("请打开 YouTube 视频或普通网页");
  const currentUrl = new URL(targetTab.url);
  if (
    /(^|\.)youtube\.com$/.test(currentUrl.hostname) &&
    currentUrl.pathname !== "/watch"
  ) {
    resource = null;
    anchors = [];
    $("follow").hidden = true;
    $("load").hidden = true;
    $("translation-progress").hidden = true;
    $("status").className = "status";
    $("timeline").replaceChildren();
    $("title").textContent = "打开一个 YouTube 视频，开始学习";
    $("status").textContent = "首页、搜索和频道页不会自动加入资料库。";
    return;
  }
  try {
    await call({ lc: "activate", tabId: targetTab.id });
    if (gen !== generation) return;
    pendingOrigin = null;
    $("load").hidden = true;
  } catch (e) {
    if (gen !== generation) return;
    $("load").hidden = false;
    pendingOrigin = new URL(targetTab.url).origin + "/*";
    $("load").textContent = "启用当前网页";
    throw new Error(
      "点击“启用当前网页”允许读取此网站，之后即可划词翻译和记笔记。",
    );
  }
  const u = new URL(targetTab.url);
  const url =
    u.hostname === "www.youtube.com" && u.pathname === "/watch"
      ? `https://www.youtube.com/watch?v=${u.searchParams.get("v")}`
      : targetTab.url.split("#")[0];
  const resolved = await api("resources.upsert", {
    url,
    title: targetTab.title,
  });
  if (gen !== generation) return;
  resource = resolved;
  $("title").textContent = resource.title;
  $("title").title = resource.title;
  $("status").className = "status";
  $("status").textContent = "本机资料库已连接";
  renderVersion = "";
  if (resource.type === "video" && fetchCaptions) {
    const found = await api("anchors.list", {
      resourceId: resource.id,
      limit: 1,
    });
    if (gen !== generation) return;
    if (!found.total) {
      $("status").textContent = "正在获取字幕…";
      const j = await api("jobs.submit", {
        type: "transcript",
        resourceId: resource.id,
      });
      await waitJob(j.id);
    }
  }
  if (gen === generation) {
    await refresh();
    if (resource.type === "video" && anchors.length) {
      await api("jobs.submit", {
        type: "translate",
        resourceId: resource.id,
        anchorIds: anchors
          .filter((a: any) => a.start !== null)
          .slice(0, 4)
          .map((a: any) => a.id),
      });
      await syncPlayback(true);
    }
  }
}
async function refresh() {
  const seq = ++refreshSequence;
  if (!resource) return;
  const rid = resource.id;
  const [a, n, t, o] = await Promise.all([
    all("anchors.list", { resourceId: rid }),
    all("notes.list", { resourceId: rid }),
    all("translations.list", { resourceId: rid }),
    all("occurrences.list", { resourceId: rid }),
  ]);
  if (seq !== refreshSequence || rid !== resource?.id) return;
  anchors = a.sort((x, y) => (x.start ?? Infinity) - (y.start ?? Infinity));
  notes = n;
  translations = t;
  const version = JSON.stringify([
    a.map((x) => x.id),
    n.map((x) => [x.id, x.revision]),
    o.map((x) => x.id),
  ]);
  if (version === renderVersion) {
    updateTranslations();
    updateProgress(o.length);
    return;
  }
  renderVersion = version;
  const scroll = window.scrollY;
  $("timeline").replaceChildren();
  if (!a.length)
    $("timeline").append(
      el("div", "在网页中划词，即可翻译、收藏或写笔记。", "empty"),
    );
  for (const anchor of anchors) {
    const node = el("article", null, "node");
    node.dataset.id = anchor.id;
    const top = el("div", null, "toolbar");
    if (anchor.start !== null) {
      const seek = button(time(anchor.start), () =>
        call({
          lc: "seek",
          tabId: tab.id,
          seconds: anchor.start,
          resourceId: rid,
        }).catch(showError),
      );
      seek.className = "time";
      top.append(seek);
    }
    top.append(button("记笔记", () => card(anchor, "")));
    node.append(
      top,
      el("div", anchor.quote, "quote"),
      el(
        "div",
        t.find((x) => x.anchorId === anchor.id)?.text || "正在翻译…",
        "translation",
      ),
    );
    const count = o.filter((x) => x.anchorId === anchor.id).length;
    if (count) node.append(el("span", `已收藏 ${count} 条词句`, "badge"));
    const related = n.filter((x) => x.anchorId === anchor.id);
    for (const note of related) {
      const block = el("div", null, "note-list");
      block.append(
        el(
          "span",
          `${note.origin === "agent" ? "Agent 生成" : "我的笔记"} · ${note.createdBy?.name || ""}${note.revision > 1 ? " · 已编辑" : ""}`,
          `badge ${note.origin === "agent" ? "agent" : ""}`,
        ),
        el("div", note.text, "note-body"),
      );
      node.append(block);
    }
    node.addEventListener("mouseup", (e) => {
      if ((e.target as HTMLElement).closest("button,textarea")) return;
      const s = window.getSelection()?.toString().trim();
      if (s) card(anchor, s.slice(0, 2000));
    });
    $("timeline").append(node);
  }
  window.scrollTo(0, scroll);
  updateProgress(o.length);
}
function updateTranslations() {
  const map = new Map<string, string>(
    translations.map((t: any) => [t.anchorId, t.text]),
  );
  for (const node of document.querySelectorAll<HTMLElement>(".node")) {
    const target = node.querySelector<HTMLElement>(".translation")!;
    const text = map.get(node.dataset.id!) || "正在翻译…";
    if (target.textContent !== text) target.textContent = text;
  }
}
function updateProgress(words: any) {
  const translated = new Set(translations.map((t: any) => t.anchorId));
  const count = anchors.filter((a: any) => translated.has(a.id)).length;
  $("status").textContent =
    resource.type === "video"
      ? `${count === anchors.length ? "全文翻译完成" : "全文翻译中"} · ${count}/${anchors.length} 段`
      : `${anchors.length} 处摘录 · ${notes.length} 条笔记 · ${words} 条词句`;
  $("follow").hidden = resource.type !== "video";
  const progress = $<HTMLProgressElement>("translation-progress");
  if (progress) {
    progress.hidden = resource.type !== "video" || !anchors.length;
    progress.max = anchors.length || 1;
    progress.value = count;
  }
}
function card(anchor: any, selected: any) {
  currentDialog?.dispose();
  const capturedTabId = tab.id;
  const dialog = el("div", null, "dialog");
  const shadow = dialog.attachShadow({ mode: "open" });
  shadow.append(el("style", LC.css));
  document.body.append(dialog);
  currentDialog = LC.discussionCard({
    container: shadow,
    resource: { ...resource },
    anchor: { ...anchor },
    selected,
    translation:
      translations.find((t: any) => t.anchorId === anchor.id)?.text || "",
    pause: (token) =>
      call({ lc: "pause", tabId: capturedTabId, token }).catch(() => {}),
    resume: (token) =>
      call({ lc: "resume", tabId: capturedTabId, token }).catch(() => {}),
    close: () => dialog.remove(),
  });
}
async function translate(ids: any) {
  $("status").textContent = "正在翻译…";
  for (let i = 0; i < ids.length; i += 4) {
    const j = await api("jobs.submit", {
      type: "translate",
      resourceId: resource.id,
      anchorIds: ids.slice(i, i + 4),
    });
    await waitJob(j.id);
  }
  await refresh();
}
$("load").onclick = () => {
  if (pendingOrigin) {
    chrome.permissions
      .request({ origins: [pendingOrigin] })
      .then((granted) => {
        if (!granted) throw new Error("尚未启用此网站；可随时再次点击启用。");
        return load();
      })
      .catch(showError);
  } else load().catch(showError);
};
$("library").onclick = () => call({ lc: "library" });
$("options").onclick = () => call({ lc: "options" });
$("follow").onclick = () => {
  follow = true;
  $("follow").textContent = "跟随播放";
  $("follow").setAttribute("aria-pressed", "true");
  syncPlayback(true).catch(showError);
};
window.addEventListener(
  "wheel",
  () => {
    follow = false;
    $("follow").textContent = "回到当前句";
    $("follow").setAttribute("aria-pressed", "false");
  },
  { passive: true },
);
window.addEventListener(
  "touchmove",
  () => {
    follow = false;
    $("follow").textContent = "回到当前句";
    $("follow").setAttribute("aria-pressed", "false");
  },
  { passive: true },
);
async function syncPlayback(force = false) {
  if (!anchors.length || resource?.type !== "video") return;
  const rid = resource.id;
  const result = await chrome.tabs.sendMessage(tab.id, { lc: "time" });
  if (rid !== resource?.id) return;
  const current = anchors.find(
    (a: any, i: any) =>
      a.start <= result.seconds &&
      (!anchors[i + 1] || anchors[i + 1].start > result.seconds),
  );
  if (!current) return;
  for (const n of document.querySelectorAll<HTMLElement>(".node")) {
    const isCurrent = n.dataset.id === current.id;
    const newly = isCurrent && !n.classList.contains("active");
    n.classList.toggle("active", isCurrent);
    if (
      isCurrent &&
      follow &&
      (force || newly) &&
      !document.querySelector(".dialog")
    )
      n.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
setInterval(async () => {
  try {
    const t = await active();
    if (t?.id !== tab?.id || t?.url !== tab?.url) {
      await load();
      return;
    }
    await syncPlayback();
  } catch {}
}, 700);
load().catch(showError);
