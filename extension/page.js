// The listener this extension adds to a page it was pointed at, in the extension's own world beside the reader.
// A session that drives the page asks for a record by a message to the window; the answer comes back the same way:
//
//   window.postMessage({ agentree: "record", state: "menu-open", root: "#app" }, location.origin)
//   window.addEventListener("message", (event) => event.data?.agentree === "recorded" && console.log(event.data.text))
//
// The page's own scripts can send that message too. It can name only a state, the root to read from and what
// was not measured: the part, the task and the daemon are the owner's, set in the popup.
(() => {
  if (window.__agentreeListens) return;
  window.__agentreeListens = true;
  const answer = (result) => window.postMessage({ agentree: "recorded", ...result }, window.location.origin);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.agentree !== "record") return;
    const { root, state, base, notMeasured } = event.data;
    const { part: named, root: usual } = await chrome.storage.local.get(["part", "root"]);
    const from = document.querySelector(root || usual || "body");
    if (!named) return answer({ ok: false, text: "No part is named in the extension's popup." });
    if (!from) return answer({ ok: false, text: `The page has no element "${root || usual}" to read the part from.` });
    const reading = {
      state: typeof state === "string" && state ? state : "base",
      ...(typeof base === "string" && base ? { base } : {}),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      elements: window.__agentree.capture(from, named),
      notMeasured: Array.isArray(notMeasured) ? notMeasured : [],
    };
    answer(await chrome.runtime.sendMessage({ reading }));
  });
})();
