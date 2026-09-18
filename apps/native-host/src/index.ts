import { openStore } from "@context/core";
const extensionId = process.env.LC_EXTENSION_ID;
if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) process.exit(1);
const allowed = `chrome-extension://${extensionId}/`;
if (process.argv[2] !== allowed) process.exit(1);
const store = openStore();
const actor = {
  origin: "human",
  id: "chrome-ui",
  name: "用户",
  assurance: "chrome-native-host-allowlist",
};
let buffer = Buffer.alloc(0);
function send(message: Record<string, any>) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > 1000000) {
    send({
      id: message.id,
      ok: false,
      error: { code: "TOO_LARGE", message: "结果过大，请分页或使用 CLI 导出" },
    });
    return;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
process.stdin.on("data", (data) => {
  buffer = Buffer.concat([buffer, data]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE();
    if (length > 16000000) process.exit(1);
    if (buffer.length < length + 4) return;
    const chunk = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);
    let req;
    try {
      req = JSON.parse(chunk.toString());
      send({
        id: req.id,
        ok: true,
        result: store.execute(req.command, req.params, actor),
      });
    } catch (e) {
      send({
        id: req?.id,
        ok: false,
        error: { code: e.code || "INTERNAL", message: e.message },
      });
    }
  }
});
let previous = store.version();
const timer = setInterval(() => {
  const version = store.version();
  if (version !== previous) {
    previous = version;
    send({ event: "changed", version });
  }
}, 800);
process.stdin.on("end", () => {
  clearInterval(timer);
  store.close();
  process.exit(0);
});
