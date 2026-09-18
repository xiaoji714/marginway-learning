import { test, expect, onTestFinished } from "vitest";
import { JSDOM } from "jsdom";
import { script } from "./support.js";
import { readFileSync } from "node:fs";
test.each(["success", "read-error", "write-error"])(
  "settings page handles %s without leaking keys into status",
  async (mode) => {
    const dom = new JSDOM(
      readFileSync("apps/extension/public/options.html", "utf8"),
      { runScripts: "outside-only" },
    );
    onTestFinished(() => dom.window.close());
    const w = dom.window as any;
    let saved: any;
    w.chrome = {
      runtime: { id: "test-extension" },
      storage: {
        local: {
          setAccessLevel: async () => {},
          get: async () => {
            if (mode === "read-error") throw Error("read");
            return {
              context_settings: {
                aiApiKey: "test-ai",
                supadataApiKey: "test-subtitle",
              },
            };
          },
          set: async (data: any) => {
            if (mode === "write-error") throw Error("write");
            saved = data;
          },
        },
      },
    };
    w.eval(script("settings"));
    w.eval(script("options"));
    await new Promise((r) => setTimeout(r, 0));
    const status = w.document.querySelector("#status");
    if (mode === "read-error") {
      expect(status.textContent).toContain("读取设置失败");
      return;
    }
    expect(w.document.querySelector("#aiApiKey").value).toBe("test-ai");
    w.document
      .querySelector("form")
      .dispatchEvent(new w.Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(status.textContent).toContain(
      mode === "success" ? "设置已保存" : "保存失败",
    );
    expect(status.textContent).not.toContain("test-ai");
    if (mode === "success")
      expect(saved.context_settings.supadataApiKey).toBe("test-subtitle");
  },
);
