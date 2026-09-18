/** Runtime configuration belongs to Marginway; credentials never enter SQLite or exports. */
const SETTINGS_KEY = "context_settings";
interface Settings {
  aiApiKey: string;
  supadataApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
}
const defaults: Settings = {
  aiApiKey: "",
  supadataApiKey: "",
  aiModel: "deepseek-v4-flash",
  aiBaseUrl: "https://api.deepseek.com",
};
function normalize(value: unknown = {}): Settings {
  const input = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Settings>;
  return {
    ...defaults,
    aiApiKey: typeof input.aiApiKey === "string" ? input.aiApiKey.trim() : "",
    supadataApiKey:
      typeof input.supadataApiKey === "string"
        ? input.supadataApiKey.trim()
        : "",
  };
}
Object.assign(globalThis, {
  CONTEXT_SETTINGS: {
    STORAGE_KEY: SETTINGS_KEY,
    DEFAULTS: defaults,
    normalize,
  },
});
