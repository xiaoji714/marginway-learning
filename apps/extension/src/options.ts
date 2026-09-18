const ai = document.querySelector<HTMLInputElement>("#aiApiKey")!;
const supadata = document.querySelector<HTMLInputElement>("#supadataApiKey")!;
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector("#extensionId")!.textContent = chrome.runtime.id;
void chrome.storage.local
  .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  .then(() => chrome.storage.local.get(CONTEXT_SETTINGS.STORAGE_KEY))
  .then((data) => {
    const s = CONTEXT_SETTINGS.normalize(data[CONTEXT_SETTINGS.STORAGE_KEY]);
    ai.value = s.aiApiKey;
    supadata.value = s.supadataApiKey;
  })
  .catch(() => {
    status.textContent = "读取设置失败，请重新打开设置页";
  });
document.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  void chrome.storage.local
    .set({
      [CONTEXT_SETTINGS.STORAGE_KEY]: CONTEXT_SETTINGS.normalize({
        aiApiKey: ai.value,
        supadataApiKey: supadata.value,
      }),
    })
    .then(() => {
      status.textContent = "设置已保存";
    })
    .catch(() => {
      status.textContent = "保存失败，请重试";
    });
});
