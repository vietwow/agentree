import { useEffect, useLayoutEffect, useRef } from "react";

const layers: { close: () => void }[] = [];

function onKey(event: KeyboardEvent) {
  const top = layers.at(-1);
  if (event.key !== "Escape" || !top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top.close();
}

/**
 * Escape closes the layer opened last, and only that one: a menu over a
 * dialog over the drawer closes from the top down.
 */
export function useEscape(onEscape: () => void, active = true) {
  const handler = useRef(onEscape);
  useLayoutEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const layer = { close: () => handler.current() };
    if (!layers.length) addEventListener("keydown", onKey, true);
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
      if (!layers.length) removeEventListener("keydown", onKey, true);
    };
  }, [active]);
}
