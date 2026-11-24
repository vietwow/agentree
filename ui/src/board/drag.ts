/** Drag and drop of board cards, list rows and side bar projects, on the browser's own drag events. */

type Drag =
  | { type: "card"; id: string; col?: string; before?: string | null }
  | { type: "row"; id: string; target?: string; pos?: "before" | "after"; group?: string }
  | { type: "proj"; id: string; before?: string };

export type DropHandlers = {
  /** Whether a card may be dropped in a column; a refused drop leaves the card where it was. */
  cardAccepts?: (id: string, col: string) => boolean;
  card?: (id: string, col: string, before: string | null) => void;
  rowAccepts?: (id: string, group: string | undefined) => boolean;
  row?: (id: string, target: string, pos: "before" | "after", group: string | undefined) => void;
  proj?: (id: string, before: string) => void;
};

let drag: Drag | null = null;
let handlers: DropHandlers = {};
let installed = false;

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

function clearDropMarks() {
  all(".drop-line").forEach((x) => x.remove());
  all(".over").forEach((x) => x.classList.remove("over"));
  all(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
  all(".dragging").forEach((x) => x.classList.remove("dragging"));
}

export function setDropHandlers(next: DropHandlers) {
  handlers = { ...handlers, ...next };
  if (installed) return;
  installed = true;

  document.addEventListener("dragstart", (e) => {
    const target = e.target as Element;
    const card = target.closest?.<HTMLElement>("[data-drag-card]");
    const row = target.closest?.<HTMLElement>("[data-drag-row]");
    const sp = target.closest?.<HTMLElement>("[data-drag-proj]");
    const el = card ?? row ?? sp;
    if (!el || !e.dataTransfer) return;
    drag = card
      ? { type: "card", id: card.dataset.dragCard! }
      : row
        ? { type: "row", id: row.dataset.dragRow! }
        : { type: "proj", id: sp!.dataset.dragProj! };
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", drag.id);
    } catch {
      /* not supported here; safe to skip */
    }
    const vis = row ? (row.closest<HTMLElement>(".trow") ?? el) : el;
    if (row)
      try {
        e.dataTransfer.setDragImage(vis, 20, 18);
      } catch {
        /* not supported here; safe to skip */
      }
    setTimeout(() => vis.classList.add("dragging"), 0);
  });

  document.addEventListener("dragend", () => {
    drag = null;
    clearDropMarks();
  });

  document.addEventListener("dragover", (e) => {
    if (!drag) return;
    const target = e.target as Element;
    if (drag.type === "card") {
      const col = target.closest<HTMLElement>("[data-drop-col]");
      if (!col || !(handlers.cardAccepts?.(drag.id, col.dataset.dropCol!) ?? true)) {
        all("[data-drop-col].over").forEach((x) => x.classList.remove("over"));
        document.querySelector(".drop-line")?.remove();
        drag.col = undefined;
        return;
      }
      e.preventDefault();
      all("[data-drop-col].over").forEach((x) => x !== col && x.classList.remove("over"));
      col.classList.add("over");
      const body = col.querySelector<HTMLElement>("[data-col-body]");
      if (!body) return;
      const cards = [...body.querySelectorAll<HTMLElement>("[data-drag-card]:not(.dragging)")];
      const after = cards.find((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      let line = document.querySelector<HTMLElement>(".drop-line");
      if (!line) {
        line = document.createElement("div");
        line.className = "drop-line";
      }
      const ref = after ?? body.querySelector(".addcard, .composer");
      if (line.nextSibling !== ref || line.parentNode !== body) body.insertBefore(line, ref);
      drag.col = col.dataset.dropCol;
      drag.before = after ? after.dataset.dragCard : null;
    } else if (drag.type === "row") {
      const row = target.closest<HTMLElement>(".trow[data-task-row]");
      if (!row || row.dataset.taskRow === drag.id) return;
      if (!(handlers.rowAccepts?.(drag.id, row.dataset.group) ?? true)) {
        all(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
        drag.target = undefined;
        return;
      }
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      all(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
      row.classList.add(before ? "drop-before" : "drop-after");
      drag.target = row.dataset.taskRow;
      drag.pos = before ? "before" : "after";
      drag.group = row.dataset.group;
    } else {
      const it = target.closest<HTMLElement>("[data-proj-drop]");
      if (!it) return;
      e.preventDefault();
      all(".drop-before").forEach((x) => x.classList.remove("drop-before"));
      it.querySelector(".sitem")?.classList.add("drop-before");
      drag.before = it.dataset.projDrop;
    }
  });

  document.addEventListener("drop", (e) => {
    if (!drag) return;
    e.preventDefault();
    const d = drag;
    drag = null;
    clearDropMarks();
    if (d.type === "card" && d.col) handlers.card?.(d.id, d.col, d.before ?? null);
    else if (d.type === "row" && d.target && d.pos) handlers.row?.(d.id, d.target, d.pos, d.group);
    else if (d.type === "proj" && d.before && d.before !== d.id) handlers.proj?.(d.id, d.before);
  });
}
