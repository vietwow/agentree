const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Whether the owner asked for less motion. CSS motion follows it on its own
 * (base.css); script motion (Web Animations, smooth scrolling, timers that
 * stage an exit) asks this before it starts.
 */
export const reducedMotion = () => matchMedia(REDUCED).matches;

/** How long a number takes to count up to its value. */
const COUNT_MS = 520;

/**
 * Counts every whole number marked `data-count` under `root` up from zero,
 * once, easing out. A number under 2, or one the page has changed since,
 * is left as it is.
 */
export function countUp(root: ParentNode = document) {
  if (reducedMotion()) return;
  for (const el of root.querySelectorAll<HTMLElement>("[data-count]")) {
    const text = el.childNodes.length === 1 ? el.firstChild : null;
    const m = text?.nodeValue?.match(/^(\d+)(%?)$/);
    if (!text || !m) continue;
    const to = Number(m[1]);
    const suffix = m[2] ?? "";
    if (to < 2) continue;
    const t0 = performance.now();
    let shown = "0" + suffix;
    const step = (now: number) => {
      if (!el.isConnected || text.nodeValue !== shown) return;
      const k = Math.min(1, (now - t0) / COUNT_MS);
      shown = Math.round(to * (1 - Math.pow(1 - k, 3))) + suffix;
      text.nodeValue = shown;
      if (k < 1) requestAnimationFrame(step);
    };
    text.nodeValue = shown;
    requestAnimationFrame(step);
  }
}
