import { Command, FolderKanban, Layers, ListChecks, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ic } from "../ui/ic.tsx";

export type PaletteItem = {
  key: string;
  icon: ReactNode;
  name: string;
  sub?: string;
  r?: string;
  kbd?: string;
  run: () => void;
};

export type PaletteGroup = { name: string; items: PaletteItem[] };

export type PaletteMode = "cmd" | "search";
type Scope = "all" | "tasks" | "projects";

type Props = {
  mode: PaletteMode;
  /** Groups with no query: suggestions, recent tasks, navigation. */
  idle: PaletteGroup[];
  commands: PaletteItem[];
  tasks: PaletteItem[];
  projects: PaletteItem[];
  suggested: PaletteItem[];
  onClose: () => void;
};

const SCOPES: [Scope, string, typeof Layers][] = [
  ["all", "All", Layers],
  ["tasks", "Tasks", ListChecks],
  ["projects", "Projects", FolderKanban],
];

function mark(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const has = (item: PaletteItem, q: string) =>
  item.name.toLowerCase().includes(q) || (item.r ?? "").toLowerCase().includes(q);

export function Palette({ mode: start, idle, commands, tasks, projects, suggested, onClose }: Props) {
  const [mode, setMode] = useState(start);
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [hl, setHl] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const query = q.trim().toLowerCase();
  const groups: PaletteGroup[] = [];
  if (mode === "cmd" && !query) groups.push(...idle);
  else if (mode === "search" && !query) groups.push({ name: "Suggested", items: suggested });
  else {
    if (mode === "cmd") {
      const found = commands.filter((c) => has(c, query));
      if (found.length) groups.push({ name: "Commands", items: found.slice(0, 5) });
    }
    const limit = scope === "all" ? 4 : 12;
    if (scope !== "projects") groups.push({ name: "Tasks", items: tasks.filter((t) => has(t, query)).slice(0, limit) });
    if (scope !== "tasks")
      groups.push({ name: "Projects", items: projects.filter((p) => has(p, query)).slice(0, limit) });
  }
  const shown = groups.filter((g) => g.items.length);
  const flat = shown.flatMap((g) => g.items);
  const at = Math.min(hl, Math.max(flat.length - 1, 0));

  useEffect(() => input.current?.focus(), [mode]);
  useEffect(() => {
    list.current?.querySelector(".pi.hl")?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const run = (item?: PaletteItem) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHl((at + step + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(flat[at]);
    } else if (event.key === "Tab") {
      event.preventDefault();
      setMode(mode === "cmd" ? "search" : "cmd");
      setHl(0);
    } else if (event.key === "Backspace" && !q && mode === "search") {
      setMode("cmd");
      setHl(0);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  let index = 0;
  return createPortal(
    <>
      <div className="scrim" style={{ zIndex: 89 }} onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command menu" onKeyDown={onKey}>
        <div className="pal-in">
          {ic(mode === "search" ? Search : Command, 17)}
          {mode === "search" && (
            <span className="badge" style={{ flexShrink: 0 }}>
              Search
            </span>
          )}
          <input
            ref={input}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setHl(0);
            }}
            placeholder={mode === "search" ? "Search tasks and projects…" : "Type a command or search…"}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={`pi-${at}`}
          />
          <kbd>Esc</kbd>
        </div>
        {mode === "search" && (
          <div className="pal-scope" role="tablist">
            {SCOPES.map(([key, name, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={scope === key}
                className={scope === key ? "on" : ""}
                onClick={() => {
                  setScope(key);
                  setHl(0);
                  input.current?.focus();
                }}
              >
                {ic(Icon, 12)}
                {name}
              </button>
            ))}
          </div>
        )}
        <div ref={list} className="pal-list" id="pal-list" role="listbox">
          {flat.length ? (
            shown.map((group) => (
              <div key={group.name} className="pal-group">
                {group.name && <div className="pal-sec">{group.name}</div>}
                {group.items.map((item) => {
                  const i = index++;
                  return (
                    <div
                      key={item.key}
                      id={`pi-${i}`}
                      role="option"
                      aria-selected={i === at}
                      className={`pi ${i === at ? "hl" : ""}`}
                      onMouseMove={() => i !== at && setHl(i)}
                      onClick={() => run(item)}
                    >
                      {item.icon}
                      <span className="trunc">{mark(item.name, q.trim())}</span>
                      {item.sub && <span className="sub">{item.sub}</span>}
                      <span className="r">
                        {item.r && <span className="mono">{item.r}</span>}
                        {item.kbd?.split(" ").map((k) => <kbd key={k}>{k}</kbd>)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="empty-state sm">
              <div className="glyph">{ic(SearchX, 18)}</div>
              <h2 className="es-h">No results found</h2>
              <p>Try a different keyword, or press Tab to search everything.</p>
            </div>
          )}
        </div>
        <div className="pal-f">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>navigate
          </span>
          <span>
            <kbd>↵</kbd>select
          </span>
          {mode === "cmd" ? (
            <span>
              <kbd>Tab</kbd>search mode
            </span>
          ) : (
            <span>
              <kbd>⌫</kbd>back to commands
            </span>
          )}
          <span className="sp" style={{ flex: 1 }} />
          <span>agentree</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
