// Local documentation preview. Never opens DATA_DIR or uses provider credentials.
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { openStore } from "../packages/learning/core/src/store.js";
const temp = mkdtempSync(join(tmpdir(), "marginway-product-demo-"));
const store = openStore(join(temp, "demo.sqlite"));
const actor = { origin: "human", id: "demo", name: "演示用户" };
const run = (command: string, params: Record<string, unknown> = {}) =>
  store.execute(command, params, actor);
const resource = run("resources.upsert", {
  url: "https://example.com/learning",
  title: "在语境中学习 · 演示资料",
  tags: ["语言学习", "阅读方法"],
});
const anchor = run("anchors.upsert", {
  resourceId: resource.id,
  quote: "We understand a word through the context in which we encounter it.",
  context:
    "We understand a word through the context in which we encounter it. Returning to that moment helps us remember.",
});
run("vocabulary.save", {
  anchorId: anchor.id,
  word: "context",
  meaning: "语境；理解一个词时所处的上下文。",
});
run("notes.append", {
  anchorId: anchor.id,
  text: "不只记住一个释义，也保留当时的句子。回到原文，才能重新理解这个词。",
});
const fixture = {
  resource,
  anchor,
  selected: "context",
  translation: "我们通过遇见一个词时的语境来理解它。",
};
const root = resolve(import.meta.dirname, "../apps/extension/lib");
const bridge = (
  await build({
    entryPoints: [resolve(import.meta.dirname, "demo-bridge.ts")],
    bundle: true,
    write: false,
    platform: "browser",
  })
).outputFiles[0]!.text;
const cardPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marginway 语境卡片 · 演示资料</title><style>body{margin:0;background:#f6f7ef;color:#183b36;font:16px/1.8 system-ui}main{max-width:1000px;margin:38px auto;padding:24px;display:grid;grid-template-columns:1fr 420px;gap:44px}h1{font-size:32px;line-height:1.4;margin-top:80px}small{color:#6d7d72}mark{background:#dcebdd;color:#183b36}p{max-width:420px}#demo-card{align-self:start}@media(max-width:760px){main{grid-template-columns:1fr}h1{margin-top:0}}</style><main><article><small>Marginway · 从内容出发，让思考延续。</small><h1>理解一个词，<br>也记住它出现的时刻。</h1><p>We understand a word through the <mark>context</mark> in which we encounter it.</p><p>Returning to that moment helps us remember.</p><small>当前产品组件 · 演示文本与释义<br>本页不调用外部服务，不读写个人资料</small></article><div id="demo-card"></div></main><script src="/demo-bridge.js"></script><script src="/common.js"></script></html>`;
const server = createServer(async (req, res) => {
  const send = (body: string | Buffer, type: string, code = 200) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };
  try {
    if (req.url === "/rpc" && req.method === "POST") {
      let body = "";
      for await (const part of req) {
        body += String(part);
        if (body.length > 64000) throw new Error("Request too large");
      }
      const m = JSON.parse(body);
      let result;
      if (m.command === "jobs.submit") result = { id: "demo-lookup" };
      else if (m.command === "jobs.get")
        result = {
          status: "done",
          result: "语境；上下文\n指遇见一个词时，帮助理解其含义的前后内容。",
        };
      else if (
        m.command === "export" ||
        m.command === "context.export" ||
        m.command === "stats" ||
        m.command === "records.get" ||
        m.command?.endsWith(".list")
      )
        result = run(m.command, m.params);
      else throw new Error("演示预览只读");
      return send(JSON.stringify({ ok: true, result }), "application/json");
    }
    if (req.url === "/fixture")
      return send(JSON.stringify(fixture), "application/json");
    if (req.url === "/demo-bridge.js") return send(bridge, "text/javascript");
    if (req.url === "/card") return send(cardPage, "text/html");
    if (req.url === "/" || req.url === "/library.html")
      return send(
        readFileSync(join(root, "library.html"), "utf8").replace(
          '<script src="common.js">',
          '<script src="/demo-bridge.js"></script><script src="common.js">',
        ),
        "text/html",
      );
    const file = req.url?.slice(1) || "";
    if (
      ["app.css", "common.js", "library.js", "icons/book-open.svg"].includes(
        file,
      )
    )
      return send(
        readFileSync(join(root, file)),
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "text/css",
      );
    send("Not found", "text/plain", 404);
  } catch (error) {
    send(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      "application/json",
      400,
    );
  }
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address === "object")
    console.log(`Demo: http://127.0.0.1:${address.port}/card`);
});
function close() {
  server.close(() => {
    store.close();
    rmSync(temp, { recursive: true, force: true });
    process.exit(0);
  });
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
