(() => {
  if (globalThis.LC) return;
  const call = async (message: DataRecord) => {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw new Error(r?.error || "扩展已更新，请刷新页面");
    return r.result;
  };
  const api = (command: string, params: DataRecord = {}) =>
    call({ lc: "rpc", command, params });
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string | null,
    cls?: string,
  ) => {
    const x = document.createElement(tag);
    if (text != null) x.textContent = text;
    if (cls) x.className = cls;
    return x;
  };
  const button = (label: string, handler: (event: MouseEvent) => unknown) => {
    const b = el("button", label);
    b.type = "button";
    b.onclick = handler;
    return b;
  };
  const time = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  async function all(command: string, params: DataRecord = {}) {
    let items: DataRecord[] = [],
      offset = 0;
    while (true) {
      const r = await api(command, { ...params, offset, limit: 200 });
      items.push(...r.items);
      if (r.next == null) return items;
      offset = r.next;
    }
  }
  async function waitJob(id: string, onStatus?: (status: string) => void) {
    for (let i = 0; i < 240; i++) {
      const j = await api("jobs.get", { id });
      if (j.status === "done") return j;
      if (["error", "cancelled"].includes(j.status))
        throw new Error(j.error || "任务已取消");
      onStatus?.(j.status);
      await new Promise((r) => setTimeout(r, 750));
    }
    throw new Error("任务仍在执行，可在资料库查看状态");
  }
  const css = `:host{all:initial;font-family:system-ui,-apple-system,sans-serif;color:#183b36;font-size:14px;line-height:1.6}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;border:1px solid #d0ddd6;border-radius:8px;background:white;color:#24594c;padding:6px 10px}button:hover{background:#edf4ee}button:disabled{opacity:.5;cursor:wait}textarea,input{width:100%;background:white;border:1px solid #c5d4ca;border-radius:8px;padding:9px;color:#183b36}textarea{resize:vertical;min-height:75px}.lc-card{background:#fffef9;border:1px solid #ccdbd1;border-radius:14px;padding:16px;box-shadow:0 12px 50px #152f3429;color:#183b36;font-size:14px;line-height:1.6;max-height:80vh;overflow:auto}.lc-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0}.lc-muted{color:#637870;font-size:12px}.lc-quote{border-left:3px solid #d4a462;padding:6px 12px;margin:10px 0;white-space:pre-wrap;max-height:130px;overflow:auto}.lc-status{white-space:pre-wrap;font-size:13px}.lc-card button[data-saved="true"]{opacity:1;cursor:default}.lc-primary{background:#24594c!important;color:white!important}.lc-card .lc-head{justify-content:space-between;align-items:flex-start;margin-top:0}.lc-head strong{max-width:calc(100% - 62px);font-size:18px;line-height:1.5;overflow-wrap:anywhere}.lc-head button{flex-shrink:0;font-size:12px;border-color:transparent}.lc-card textarea{margin-top:18px}.lc-card .lc-quote{border-left:2px solid #c8d7c7;background:#f0f3eb;border-radius:0;color:#4d6659;font-size:14px;line-height:1.75}.lc-card .lc-status{padding:10px 0;font-size:14px;line-height:1.75}.lc-card{background:#fcfcf8;border-radius:12px;padding:20px}.lc-card button{min-height:34px}.lc-card button:focus-visible,.lc-card textarea:focus-visible{outline:2px solid #28564a;outline-offset:3px}.lc-label{font-size:11px;letter-spacing:.1em;color:#657a71}.lc-text{white-space:pre-wrap;user-select:text}.lc-error{color:#a44131}
.lc-definition-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.lc-card .lc-definition-row .lc-word-actions{display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-top:8px}.lc-definition-row .lc-primary{font-size:12px}.lc-card [hidden]{display:none!important}.lc-card{padding:16px;background:#fcfcf8;border:1px solid #d8e1dc;border-radius:12px;font-size:14px;line-height:1.6}.lc-card .lc-head{margin:0 0 10px;align-items:center}.lc-head strong{font-size:14px;font-weight:500;color:#60766d}.lc-card button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px}.lc-card .lc-icon{width:16px;height:16px;flex-shrink:0}.lc-card .lc-primary .lc-icon{filter:brightness(0) invert(1)}.lc-word-row{margin:0 0 6px;gap:10px}.lc-word{font-size:30px;line-height:1.2;font-weight:700;overflow-wrap:anywhere}.lc-card .lc-text-button{border-color:transparent;background:transparent;padding:2px 4px;font-size:12px;color:#62796f;min-height:28px}.lc-meaning{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.55;margin-top:8px}.lc-meaning:empty{display:none}.lc-word-actions{margin:12px 0 0;justify-content:space-between}.lc-definition{font-size:19px;font-weight:600;line-height:1.5}.lc-explanation{font-size:12px;color:#647a70;line-height:1.6;margin-top:8px}.lc-word-section{padding-bottom:10px;border-bottom:1px solid #dce4de}.lc-context-section{padding:8px 0 12px;border-bottom:1px solid #dce4de}.lc-context-head{justify-content:space-between;margin:0 0 4px}.lc-card .lc-quote{margin:4px 0 8px;padding:8px 10px;border-left:3px solid #ccd9cf;border-radius:0 7px 7px 0;background:#f1f4ee;color:#39564b;font-size:14px;line-height:1.65;max-height:140px;overflow:auto;overflow-wrap:anywhere}.lc-card mark{color:#19483b;background:#dcebdd;border-radius:3px;padding:1px 2px}.lc-source-time{flex-shrink:0}.lc-source{display:flex;gap:8px;color:#718078;font-size:11px;text-decoration:none;line-height:1.5;margin-top:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lc-source:hover{text-decoration:underline}.lc-note-section{padding-top:10px}.lc-note-label{display:block;font-size:14px;font-weight:600}.lc-card textarea{display:block;margin-top:8px;min-height:70px;font-size:14px;font-weight:400;line-height:1.6}.lc-footer{display:grid;grid-template-columns:1fr 1.25fr;gap:8px;margin-top:12px}.lc-footer button{white-space:nowrap;padding:8px 6px;font-size:13px;background:transparent;border-color:#a9beb4;border-radius:7px;min-width:0}.lc-agent-hint{text-align:right;color:#728078;font-size:10px;margin-top:5px}.lc-card .lc-status{font-size:12px;line-height:1.5;padding:8px 0 0;overflow-wrap:anywhere}.lc-status:empty{display:none}.lc-card input:focus-visible,.lc-card a:focus-visible{outline:2px solid #28564a;outline-offset:2px}
`;
  async function clipboard(text: string, container: HTMLElement | ShadowRoot) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = el("textarea");
      area.value = text;
      area.readOnly = true;
      container.append(area);
      area.select();
      return document.execCommand("copy");
    }
  }
  function discussionCard({
    container,
    resource,
    anchor,
    selected,
    translation = "",
    close,
    pause,
    resume,
  }: CardOptions) {
    let lookup = "",
      lookupFor = "",
      collected = false,
      disposed = false,
      lookupSequence = 0,
      lookupTimer: ReturnType<typeof setTimeout> | undefined;
    const selectionText = (selected || "").trim();
    const token = crypto.randomUUID();
    pause?.(token);
    const card = el("section", null, "lc-card");
    card.setAttribute("aria-label", "学习选区");
    card.addEventListener("mouseup", (e) => e.stopPropagation());
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      lookupSequence++;
      clearTimeout(lookupTimer);
      card.remove();
      resume?.(token);
      close?.();
    };
    card.dispose = dispose;
    const icon = (b: HTMLButtonElement, name: string) => {
      if (chrome.runtime.getURL) {
        const img = el("img", null, "lc-icon");
        img.src = chrome.runtime.getURL(`icons/${name}.svg`);
        img.alt = "";
        b.prepend(img);
      }
      return b;
    };
    const head = el("div", null, "lc-row lc-head");
    const heading = el("strong", "语境 · 划词与笔记");
    head.append(
      heading,
      button("关闭", (e) => {
        e.stopPropagation();
        container.getSelection?.()?.removeAllRanges?.();
        window.getSelection()?.removeAllRanges?.();
        dispose();
      }),
    );
    card.append(head);
    const wordSection = el("div", null, "lc-word-section");
    const wordRow = el("div", null, "lc-row lc-word-row");
    const word = el("strong", selectionText, "lc-word");
    wordRow.append(word);
    wordSection.append(wordRow);
    const explanation = el("div", "AI 释义", "lc-explanation");
    const meaning = el("div", null, "lc-meaning");
    meaning.setAttribute("aria-live", "polite");
    const wordActions = el("div", null, "lc-row lc-word-actions");
    const result = el("div", null, "lc-status");
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    const busy = async (b: HTMLButtonElement, fn: () => Promise<void>) => {
      b.disabled = true;
      try {
        result.classList.remove("lc-error");
        await fn();
      } catch (e) {
        if (!disposed) {
          result.textContent = e.message;
          result.classList.add("lc-error");
        }
      } finally {
        b.disabled = b === collect && collected;
      }
    };
    const collect = icon(
      button("收藏单词", () =>
        busy(collect, async () => {
          if (!selectionText || collected) return;
          const selectedWord = selectionText;
          await api("vocabulary.save", {
            anchorId: anchor.id,
            word: selectedWord,
            meaning: lookupFor === selectedWord ? lookup : "",
            operationId: crypto.randomUUID(),
          });
          if (disposed) return;
          collected = true;
          result.textContent = "";
          renderCollection();
        }),
      ),
      "bookmark-simple",
    );
    collect.className = "lc-primary";
    wordActions.append(collect);
    const definitionRow = el("div", null, "lc-definition-row");
    definitionRow.append(meaning, wordActions);
    wordSection.append(definitionRow, explanation);
    card.append(wordSection);
    const contextSection = el("div", null, "lc-context-section");
    const contextHead = el("div", null, "lc-row lc-context-head");
    contextHead.append(el("span", "原文语境", "lc-muted"));
    const quote = el("div", anchor.context || anchor.quote, "lc-quote");
    const translatedLabel = el("div", "中文翻译", "lc-muted");
    const translated = el("div", translation, "lc-quote lc-translation");
    translated.hidden = translatedLabel.hidden = !translation;
    const source = el("a", null, "lc-source");
    if (anchor.start != null)
      source.append(el("span", time(anchor.start), "lc-source-time"));
    try {
      const u = new URL(resource.url);
      if (["http:", "https:"].includes(u.protocol)) {
        if (anchor.start != null)
          u.searchParams.set("t", String(Math.floor(anchor.start)));
        source.href = u.href;
        source.target = "_blank";
        source.rel = "noopener";
      }
    } catch {}
    source.title = `在视频中查看 ${time(anchor.start || 0)}`;
    if (anchor.start != null && source.hasAttribute("href"))
      contextHead.append(source);
    contextSection.append(contextHead, quote, translatedLabel, translated);
    card.append(contextSection);
    const noteSection = el("div", null, "lc-note-section");
    const noteLabel = el("label", "我的想法", "lc-note-label");
    const note = el("textarea");
    note.placeholder = "写下理解，或想继续讨论的问题…";
    note.setAttribute("aria-label", "我的笔记");
    noteLabel.append(note);
    noteSection.append(noteLabel);
    const footer = el("div", null, "lc-footer");
    const save = icon(
      button("保存笔记", () =>
        busy(save, async () => {
          const text = note.value;
          if (!text.trim()) {
            note.focus();
            throw new Error("先写下想法，再保存笔记");
          }
          await api("notes.append", {
            anchorId: anchor.id,
            text,
            operationId: crypto.randomUUID(),
          });
          result.textContent = "笔记已保存，已关联原文位置";
          if (note.value === text) note.value = "";
        }),
      ),
      "note",
    );
    const discuss = icon(
      button("在 Agent 中讨论", () =>
        busy(discuss, async () => {
          const d = await api("discussions.create", {
            anchorId: anchor.id,
            question:
              note.value || `我想理解“${selectionText || anchor.quote}”`,
            selected: selectionText || anchor.quote,
            selectionTranslation:
              lookupFor === (selectionText || anchor.quote) ? lookup : "",
            operationId: crypto.randomUUID(),
          });
          const x = await api("context.export", {
            anchorId: anchor.id,
            discussionId: d.id,
          });
          if (await clipboard(x.prompt, card))
            result.textContent =
              "讨论上下文已复制，请粘贴到 Agent 中继续讨论。";
          else result.textContent = "请手动复制下方内容";
        }),
      ),
      "chat-circle-dots",
    );
    discuss.title = "复制上下文，粘贴到 Agent 中继续讨论";
    footer.append(save, discuss);
    noteSection.append(
      footer,
      el("div", "复制上下文，粘贴到 Agent 中继续讨论", "lc-agent-hint"),
      result,
    );
    card.append(noteSection);
    function highlight() {
      const text = anchor.context || anchor.quote;
      quote.replaceChildren();
      const at = selectionText
        ? text.toLowerCase().indexOf(selectionText.toLowerCase())
        : -1;
      if (at < 0) {
        quote.textContent = text;
        return;
      }
      quote.append(
        document.createTextNode(text.slice(0, at)),
        el("mark", text.slice(at, at + selectionText.length)),
        document.createTextNode(text.slice(at + selectionText.length)),
      );
    }
    wordSection.hidden = !selectionText;
    heading.textContent = selectionText ? "语境 · 划词与笔记" : "记录想法";
    function renderCollection() {
      collect.textContent = collected
        ? "已收藏"
        : selectionText && !/\s/.test(selectionText)
          ? "收藏单词"
          : "收藏选中内容";
      collect.disabled = !selectionText || collected;
      collect.dataset.saved = String(collected);
      if (collected) {
        const check = el("span", "✓");
        check.setAttribute("aria-hidden", "true");
        collect.prepend(check);
      } else icon(collect, "bookmark-simple");
    }
    collect.setAttribute("aria-live", "polite");
    renderCollection();
    if (selectionText)
      void all("occurrences.list", { resourceId: resource.id })
        .then((items) => {
          if (disposed || collected) return;
          if (
            items.some(
              (item) =>
                item.anchorId === anchor.id && item.word === selectionText,
            )
          ) {
            collected = true;
            renderCollection();
          }
        })
        .catch(() => {
          /* Saving remains idempotent if status lookup is unavailable. */
        });
    highlight();
    async function translateSelection() {
      clearTimeout(lookupTimer);
      const requested = selectionText;
      if (!requested || disposed) return;
      const seq = ++lookupSequence;
      const stale = () => disposed || seq !== lookupSequence;
      const target = meaning;
      target.textContent = "正在翻译…";
      try {
        const job = await api("jobs.submit", {
          type: "lookup",
          resourceId: resource.id,
          anchorId: anchor.id,
          text: requested,
          operationId: crypto.randomUUID(),
        });
        for (let i = 0; i < 240; i++) {
          if (stale()) return;
          const done = await api("jobs.get", { id: job.id });
          if (done.status === "done") {
            if (stale()) return;
            const text = done.result || "";
            {
              const lines = text.trim().split(/\n+/);
              target.replaceChildren(
                el("div", lines.shift() || "", "lc-definition"),
              );
              // The full context translation has its own section below.
              // Older lookup jobs may contain additional sentence translations.
              explanation.textContent = "AI 释义";
            }
            {
              lookup = text;
              lookupFor = requested;
            }
            return;
          }
          if (["error", "cancelled"].includes(done.status))
            throw new Error(done.error || "翻译未完成");
          await new Promise((r) => setTimeout(r, 750));
        }
        throw new Error("翻译仍在执行，可稍后重新划词");
      } catch (e) {
        if (!stale()) {
          target.textContent = e.message;
        }
      }
    }
    if (selectionText)
      lookupTimer = setTimeout(() => void translateSelection(), 0);
    container.append(card);
    return card;
  }

  globalThis.LC = {
    call,
    api,
    el,
    button,
    time,
    all,
    waitJob,
    css,
    discussionCard,
    clipboard,
  };
})();
