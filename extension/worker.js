// The extension's background script. It adds the reader to the tab the owner or the session points it at, and
// sends each record the reader made to the daemon of this machine, at the address and with the token the
// owner gave. It reads no cookie, storage or header of the page, and asks for no permission to debug.

/** What the owner set in the popup: where the daemon is, and what is being measured. */
const SETTINGS = ["address", "token", "project", "task", "part", "root", "theme", "state", "base"];
const settings = () => chrome.storage.local.get(SETTINGS);

/** Adds the reader and its listener to a tab, in the extension's own world: the page's scripts reach neither. */
async function attach(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["reader.js", "page.js"] });
}

/** Sends a reading to the daemon as the record of the task that measures. The address is the owner's, never the page's. */
async function send(reading, source) {
  const { address, token, project, task, part, theme } = await settings();
  if (!address || !token || !project || !task || !part)
    return { ok: false, text: "The daemon's address and token, the project, the task and the part are set in the extension's popup first." };
  if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(address))
    return { ok: false, text: "The daemon answers on the loopback address only, as http://127.0.0.1:4517." };
  try {
    const response = await fetch(`${address}/api/projects/${encodeURIComponent(project)}/records`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, part, theme: theme || "light", source, ...reading }),
    });
    const answer = await response.json();
    return response.ok
      ? { ok: true, text: `${answer.part}, ${answer.state}: ${answer.elements} elements recorded.` }
      : { ok: false, text: answer.error ?? `The daemon answered ${response.status}.` };
  } catch (error) {
    return { ok: false, text: `The daemon did not answer at ${address}: ${error.message}` };
  }
}

// A reading comes only from the listener this extension added to a tab; what it names is the state, never where it goes.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !message?.reading) return false;
  send(message.reading, sender.tab.url ?? "").then(respond);
  return true;
});

// The shortcut records the state the page shows now, without the pointer leaving the page: a state under the
// pointer stays as it is. The state's name is the one the popup holds.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "record" || !tab?.id) return;
  const { root, state, base } = await settings();
  await attach(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (ask) => window.postMessage({ agentree: "record", ...ask }, window.location.origin),
    args: [{ root: root || "", state: state || "base", ...(base ? { base } : {}) }],
  });
});

// For the popup, and for a test: the same two calls by name.
globalThis.agentree = { attach, send, settings };
