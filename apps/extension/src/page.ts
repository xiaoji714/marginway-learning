(() => {
  if (globalThis.__lcPage) return;
  globalThis.__lcPage = true;
  const { api, call, el, button, time, all, css, discussionCard } = LC;
  let resource: any = null,
    anchors: any = [],
    translations = new Map(),
    current: any = null,
    currentUrl = "",
    loadGeneration = 0,
    activeCard: any = null,
    host: any = null,
    root: any = null,
    playingVideo: any = null,
    refreshSequence = 0,
    selectionSequence = 0;
  const requestedTranslations = new Set();
  const translationErrors = new Map<string, string>();
  const pauses = new Map();
  let originallyPlaying = false;
  function pause(token: any) {
    const v = document.querySelector("video");
    if (!v) return;
    if (!pauses.size) {
      originallyPlaying = !v.paused;
      playingVideo = v;
    }
    pauses.set(token, true);
    if (!v.paused) v.pause();
  }
  function resume(token: any) {
    if (!pauses.has(token)) return;
    pauses.delete(token);
    if (
      !pauses.size &&
      originallyPlaying &&
      playingVideo === document.querySelector("video")
    ) {
      originallyPlaying = false;
      playingVideo.play().catch(() => {});
    }
  }
  const videoId = () =>
    location.hostname === "www.youtube.com" && location.pathname === "/watch"
      ? new URL(location.href).searchParams.get("v")
      : null;
  const pageResourceUrl = () =>
    videoId()
      ? `https://www.youtube.com/watch?v=${videoId()}`
      : location.href.split("#")[0];
  async function ensureResource() {
    const url = pageResourceUrl();
    if (resource && resource.url === url) return resource;
    const resolved = await api("resources.upsert", {
      url,
      title:
        document.querySelector("h1 yt-formatted-string")?.textContent ||
        document.title,
    });
    if (pageResourceUrl() !== url)
      throw new Error("页面已切换，请在当前视频重试");
    resource = resolved;
    return resource;
  }

  function makeRoot() {
    if (root) return;
    document
      .querySelectorAll("#learning-companion-subtitles")
      .forEach((n) => n.remove());
    host = el("div");
    host.id = "learning-companion-subtitles";
    root = host.attachShadow({ mode: "open" });
    root.append(
      el(
        "style",
        css +
          `:host{display:block;box-sizing:border-box;margin:0;padding:0}.caption-frame{display:flow-root;padding:24px 0 16px}.shell{background:#fcfcf8;border:1px solid #e2e7dc;border-radius:10px;padding:12px 18px 14px}.original{font-size:19px;line-height:1.6}.translated{font-size:18px;line-height:1.7;color:#355746}.bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}.bar button{font-size:11px;min-height:26px;padding:2px 7px;border-color:transparent;background:transparent}.bar button:hover{background:#eaf0e7}.brand{font-size:11px;color:#68796d;margin-right:auto}.lc-text{margin:8px 0;white-space:normal;overflow-wrap:anywhere}.lc-row{margin:12px 0 0}.lc-row button{font-size:12px;padding:4px 9px;min-height:30px}.collapsed .body{display:none}.shell:has(.body[data-anchor]) .load-caption{display:none}`,
      ),
    );
    const shell = el("section", null, "shell");
    shell.setAttribute("aria-label", "语境双语字幕");
    const bar = el("div", null, "bar");
    const loadButton = button("加载字幕", () => loadTranscript());
    loadButton.className = "load-caption";
    const collapse = button("收起", () => {
      const collapsed = shell.classList.toggle("collapsed");
      collapse.textContent = collapsed ? "展开字幕" : "收起";
      collapse.setAttribute("aria-expanded", String(!collapsed));
      document.documentElement.toggleAttribute(
        "data-lc-captions",
        !collapsed && anchors.length > 0,
      );
    });
    collapse.setAttribute("aria-expanded", "true");
    bar.append(
      el("span", "语境 · 双语字幕", "brand"),
      loadButton,
      button("侧边栏", () => chrome.runtime.sendMessage({ lc: "open" })),
      collapse,
    );
    const body = el("div", null, "body");
    body.append(el("div", "加载字幕，开始双语学习。", "lc-muted"));
    shell.append(bar, body);
    const frame = el("div", null, "caption-frame");
    frame.append(shell);
    root.append(frame);
  }
  function mount() {
    if (!videoId()) {
      host?.remove();
      return;
    }
    makeRoot();
    if (document.fullscreenElement) {
      host.style.cssText =
        "position:absolute;bottom:55px;left:10%;width:80%;z-index:2147483646;";
      if (host.parentElement !== document.fullscreenElement)
        document.fullscreenElement.append(host);
      return;
    }
    host.style.cssText = "";
    const player = document.querySelector<HTMLElement>("#player-wide-container")
      ?.offsetHeight
      ? document.querySelector("#player-wide-container")
      : document.querySelector("#player");
    if (!player) return;
    if (!host.isConnected || host.previousElementSibling !== player) {
      player.after(host);
    }
  }
  async function refreshData() {
    const seq = ++refreshSequence;
    if (!resource || !videoId()) return;
    const id = resource.id;
    const [a, t] = await Promise.all([
      all("anchors.list", { resourceId: id }),
      all("translations.list", { resourceId: id }),
    ]);
    if (seq !== refreshSequence || id !== resource?.id) return;
    anchors = a.filter(LC.isCaption).sort((a, b) => a.start - b.start);
    translations = new Map(t.map((x) => [x.anchorId, x.text]));
    if (!anchors.length) {
      const jobs = await all("jobs.list", { resourceId: id });
      if (seq !== refreshSequence || id !== resource?.id) return;
      const job = jobs.find((j) => j.type === "transcript");
      makeRoot();
      const body = root.querySelector(".body");
      if (job?.status === "error" || job?.status === "cancelled") {
        LC.captionFailure(
          body,
          job.error || "字幕任务已取消",
          loadTranscript,
          resource,
        );
      } else if (job?.status === "queued" || job?.status === "running") {
        body.textContent = "正在获取字幕…（最多 90 秒，排队时间另计）";
      }
    }
    renderCurrent();
  }
  let captionLoading = false;
  async function loadTranscript() {
    if (captionLoading) return;
    captionLoading = true;
    const gen = loadGeneration;
    makeRoot();
    const status = root.querySelector(".body");
    if (!anchors.length) {
      delete status.dataset.anchor;
      status.textContent = "正在加载字幕…";
    }
    try {
      await ensureResource();
      const existing = await all("anchors.list", { resourceId: resource.id });
      if (gen !== loadGeneration) return;
      if (!existing.some(LC.isCaption)) {
        const j = await api("jobs.submit", {
          type: "transcript",
          resourceId: resource.id,
        });
        await LC.waitJob(j.id);
      }
      if (gen === loadGeneration) await refreshData();
    } catch (e) {
      if (gen === loadGeneration)
        LC.captionFailure(status, e.message, loadTranscript, {
          url: pageResourceUrl(),
        });
    } finally {
      if (gen === loadGeneration) captionLoading = false;
    }
  }
  // Keep one caption DOM: job notifications must not reset text selection or flash placeholders.
  function renderCurrent() {
    if (!root || activeCard || !anchors.length) return;
    const v = document.querySelector("video");
    if (!v) return;
    const index = Math.max(
        0,
        anchors.findLastIndex((x: any) => x.start <= v.currentTime),
      ),
      a = anchors[index];
    current = a;
    document.documentElement.toggleAttribute(
      "data-lc-captions",
      !root.querySelector(".shell").classList.contains("collapsed"),
    );
    if (!document.getElementById("lc-native-caption-style")) {
      const style = el(
        "style",
        "html[data-lc-captions] .ytp-caption-window-container{display:none!important}",
      );
      style.id = "lc-native-caption-style";
      document.head.append(style);
    }
    const body = root.querySelector(".body");
    if (body.dataset.anchor !== a.id) {
      body.replaceChildren();
      body.dataset.anchor = a.id;
      const controls = el("div", null, "lc-row");
      controls.append(
        el("span", time(a.start), "lc-muted"),
        button("记笔记", () => openCard(a, "", null)),
        button("重播此句", () => {
          v.currentTime = a.start;
          v.play().catch(() => {});
        }),
      );
      body.append(
        el("div", a.quote, "lc-text original"),
        el("div", "", "lc-text translated"),
        controls,
      );
    }
    const translated = body.querySelector(".translated");
    const text =
      translations.get(a.id) || translationErrors.get(a.id) || "正在翻译…";
    if (translated.textContent !== text) translated.textContent = text;
    const missing = anchors
      .slice(index, index + 4)
      .filter(
        (x: any) => !translations.has(x.id) && !requestedTranslations.has(x.id),
      );
    if (missing.length) {
      const rid = resource.id;
      missing.forEach((x: any) => requestedTranslations.add(x.id));
      void api("jobs.submit", {
        type: "translate",
        resourceId: rid,
        anchorIds: missing.map((x: any) => x.id),
      })
        .then((j) => LC.waitJob(j.id))
        .then(() => {
          if (resource?.id === rid) return refreshData();
        })
        .catch((e) => {
          if (resource?.id === rid) {
            const message = "翻译暂不可用：" + e.message;
            for (const item of missing) translationErrors.set(item.id, message);
            if (body.dataset.anchor === a.id) translated.textContent = message;
          }
        });
    }
  }
  function openCard(anchor: any, selected: any, rect: any) {
    if (activeCard) {
      activeCard.cleanup?.();
      activeCard.remove();
      resume("card");
    }
    const popup = el("div");
    popup.style.cssText = `position:fixed;z-index:2147483647;width:380px;max-width:calc(100vw - 24px);left:${Math.max(12, Math.min(rect?.left || innerWidth / 2 - 190, innerWidth - 392))}px;top:${Math.max(12, Math.min((rect?.bottom || 100) + 8, innerHeight - 430))}px`;
    const sr = popup.attachShadow({ mode: "open" });
    sr.append(el("style", css + `.lc-card{max-height:calc(100vh - 24px)}`));
    (document.fullscreenElement || document.documentElement).append(popup);
    activeCard = popup;
    const fit = () => {
      if (!popup.isConnected) return;
      const height = popup.getBoundingClientRect().height;
      popup.style.top =
        Math.max(
          12,
          Math.min((rect?.bottom || 100) + 8, innerHeight - height - 12),
        ) + "px";
    };
    const resize =
      typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    resize?.observe(popup);
    window.addEventListener("resize", fit);
    popup.cleanup = () => {
      resize?.disconnect();
      window.removeEventListener("resize", fit);
    };
    const capturedResource = { ...resource };
    discussionCard({
      container: sr,
      resource: capturedResource,
      anchor,
      selected,
      translation: translations.get(anchor.id) || "",
      pause: () => pause("card"),
      resume: () => resume("card"),
      close: () => {
        selectionSequence++;
        popup.cleanup?.();
        popup.remove();
        activeCard = null;
        renderCurrent();
      },
    });
    fit();
  }
  async function selected(event: any, sequence: any) {
    // The mouseup listener filters editable controls and card events before
    // taking this immutable event-path snapshot. Freshness is checked after asynchronous lookups.
    const inSubs = event.composedPath().includes(host);
    const shadowSelection = inSubs ? root?.getSelection?.() : null;
    const sel = shadowSelection?.toString()
      ? shadowSelection
      : window.getSelection();
    if (
      !sel ||
      sel.isCollapsed ||
      !sel.toString().trim() ||
      sel.toString().length > 2000
    )
      return;
    const text = sel.toString().trim(),
      range = sel.getRangeAt(0),
      rect = range.getBoundingClientRect();
    const capturedAnchor = inSubs && current ? { ...current } : null;
    const gen = loadGeneration;
    try {
      const r = await ensureResource();
      let a;
      if (capturedAnchor) {
        a = capturedAnchor;
      } else {
        const parent =
          range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        const paragraph =
          (parent?.closest("p,li,article,section") || parent)?.textContent ||
          text;
        const i = paragraph.indexOf(text);
        a = await api("anchors.upsert", {
          resourceId: r.id,
          quote: text,
          context: paragraph.slice(
            Math.max(0, i - 600),
            Math.max(0, i - 600) + 1800,
          ),
          prefix: paragraph.slice(Math.max(0, i - 80), i),
          suffix: paragraph.slice(i + text.length, i + text.length + 80),
        });
      }
      if (gen !== loadGeneration || sequence !== selectionSequence) return;
      openCard(a, text, rect);
    } catch (e) {
      console.warn("Learning Companion selection:", e.message);
    }
  }
  document.addEventListener("mouseup", (event) => {
    const path = event.composedPath();
    // Decide while the card is still attached: click may dispose it before the timer runs.
    if (
      (activeCard && path.includes(activeCard)) ||
      (path.includes(host) &&
        !path.some(
          (n) => n instanceof HTMLElement && n.matches(".original,.translated"),
        )) ||
      path.some(
        (n) =>
          n instanceof HTMLElement &&
          (n.isContentEditable ||
            ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(n.tagName)),
      )
    )
      return;
    const sequence = ++selectionSequence,
      snapshot = { composedPath: () => path };
    // Capture text and anchor before asynchronous resource lookups or the next caption tick.
    void selected(snapshot, sequence);
  });
  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (m.lc === "ping") {
      respond({ ok: true });
      return;
    }
    if (m.event === "changed") {
      void refreshData().catch(() => {});
      return;
    }
    if (m.lc === "seek") {
      if (resource?.id !== m.resourceId) {
        respond({ ok: false });
        return;
      }
      const v = document.querySelector("video");
      if (v) {
        v.currentTime = m.seconds;
        renderCurrent();
      }
      respond({ ok: !!v });
    }
    if (m.lc === "pause") {
      pause(m.token);
      respond({ ok: true });
    }
    if (m.lc === "resume") {
      resume(m.token);
      respond({ ok: true });
    }
    if (m.lc === "time") {
      const v = document.querySelector("video");
      respond({ seconds: v?.currentTime || 0, url: location.href });
    }
  });
  const pageTimer = setInterval(() => {
    try {
      chrome.runtime.getManifest?.();
    } catch {
      clearInterval(pageTimer);
      host?.remove();
      return;
    }
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      loadGeneration++;
      captionLoading = false;
      refreshSequence++;
      selectionSequence++;
      document.documentElement.removeAttribute("data-lc-captions");
      resource = null;
      anchors = [];
      translations.clear();
      requestedTranslations.clear();
      translationErrors.clear();
      current = null;
      activeCard?.cleanup?.();
      activeCard?.remove();
      activeCard = null;
      pauses.clear();
      originallyPlaying = false;
      host?.remove();
      host = null;
      root = null;
      // Background page polling only registers actual video resources.
      // Normal webpages are registered when the user selects content.
      if (videoId())
        void ensureResource()
          .then(() => refreshData())
          .catch(() => {});
    }
    mount();
    renderCurrent();
  }, 450);
})();
