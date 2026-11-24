// The popup: what the owner sets once (the daemon, the project, the task, the part), and the two buttons.
// Opening it on a tab is what lets the extension read that tab, until the tab goes to another site.
const FIELDS = ["address", "token", "project", "task", "part", "root", "theme", "state", "base"];
const field = (id) => document.getElementById(id);
const say = (text) => (field("said").textContent = text);
const tab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

chrome.storage.local.get(FIELDS).then((kept) => {
  for (const id of FIELDS) {
    if (kept[id]) field(id).value = kept[id];
    field(id).addEventListener("change", () => chrome.storage.local.set({ [id]: field(id).value.trim() }));
  }
});

const attach = async () => {
  const { id } = await tab();
  await chrome.scripting.executeScript({ target: { tabId: id }, files: ["reader.js", "page.js"] });
  return id;
};

field("attach").addEventListener("click", () =>
  attach().then(
    () => say("This tab is read on a message to its window, and on the shortcut."),
    (error) => say(error.message),
  ),
);

field("record").addEventListener("click", async () => {
  try {
    const id = await attach();
    const ask = { state: field("state").value.trim() || "base", ...(field("base").value.trim() ? { base: field("base").value.trim() } : {}) };
    await chrome.scripting.executeScript({
      target: { tabId: id },
      func: (given) => window.postMessage({ agentree: "record", ...given }, window.location.origin),
      args: [ask],
    });
    say("Asked. A state under the pointer is gone by now: use the shortcut for those.");
  } catch (error) {
    say(error.message);
  }
});
