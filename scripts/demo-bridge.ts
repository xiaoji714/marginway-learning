// Preview transport only: production components use a disposable, synthetic library.
const demoGlobal = globalThis as unknown as {
  chrome: { runtime: Record<string, unknown> };
  LC: {
    css: string;
    discussionCard: (options: Record<string, unknown>) => HTMLElement;
  };
};
demoGlobal.chrome = {
  runtime: {
    connect: () => ({ onMessage: { addListener() {} } }),
    sendMessage: async (message: unknown) =>
      (
        await fetch("/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        })
      ).json(),
  },
};
window.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("demo-card");
  if (!container) return;
  const fixture = await (await fetch("/fixture")).json();
  const root = container.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = demoGlobal.LC.css;
  root.append(style);
  const card = demoGlobal.LC.discussionCard({ container: root, ...fixture });
  const input = card.querySelector("textarea");
  if (input) input.value = "为什么相同的词在不同句子里会有不同含义？";
});
