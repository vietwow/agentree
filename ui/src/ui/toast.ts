type Options = { kind?: "ok" | "err" | "info"; ms?: number; action?: string; onAction?: () => void; countdown?: boolean };

const SVG = (inner: string, cls = "") =>
  `<svg class="i ${cls}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  ok: SVG('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', "ok"),
  err: SVG('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>', "bad"),
  info: SVG('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
};
const CLOSE = SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>').replace('width="15" height="15"', 'width="13" height="13"');

function host() {
  let el = document.getElementById("toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "toasts";
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  return el;
}

/** A short message at the bottom right that leaves by itself. */
export function toast(message: string, options: Options = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  const text = document.createElement("span");
  text.className = "grow";
  text.textContent = message;
  el.innerHTML = ICONS[options.kind ?? "ok"];
  el.append(text);
  const ms = options.ms ?? 4200;
  let tick: ReturnType<typeof setInterval> | undefined;
  const kill = () => {
    clearInterval(tick);
    el.classList.add("out");
    setTimeout(() => el.remove(), 160);
  };
  if (options.action) {
    const action = document.createElement("button");
    action.className = "ta";
    action.textContent = options.action;
    action.onclick = () => {
      options.onAction?.();
      kill();
    };
    el.append(action);
  }
  if (options.countdown) {
    const ring = document.createElement("span");
    ring.className = "tcount";
    ring.setAttribute("aria-hidden", "true");
    ring.style.setProperty("--tcount-ms", `${ms}ms`);
    ring.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><circle class="track" cx="11" cy="11" r="9"/><circle class="left" cx="11" cy="11" r="9"/></svg>';
    const count = document.createElement("b");
    const end = Date.now() + ms;
    const show = () => (count.textContent = String(Math.max(1, Math.ceil((end - Date.now()) / 1000))));
    show();
    tick = setInterval(show, 250);
    ring.append(count);
    el.append(ring);
  }
  const close = document.createElement("button");
  close.className = "ibtn ibtn-xs";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "color:inherit;opacity:.6";
  close.innerHTML = CLOSE;
  close.onclick = kill;
  el.append(close);
  host().append(el);
  setTimeout(kill, ms);
}

export async function copy(text: string, message = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast(`Copy isn't available here — ${text}`, { kind: "info", ms: 6000 });
  }
}
