import { Modal } from "../design/components/Modal.tsx";
import { GO, PAGE_INFO } from "./pages.ts";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const SHORTCUTS: [string, [string, string[]][]][] = [
  [
    "General",
    [
      ["Command menu", [MOD, "K"]],
      ["Search", ["/"]],
      ["Keyboard shortcuts", ["?"]],
      ["Toggle sidebar", ["["]],
      ["Toggle dark mode", [MOD, "Shift", "L"]],
      ["Close panel or dialog", ["Esc"]],
    ],
  ],
  [
    "Create",
    [
      ["New task", ["N"]],
      ["New project", ["P"]],
    ],
  ],
  ["Navigate", Object.entries(GO).map(([key, page]): [string, string[]] => [`Go to ${PAGE_INFO[page].label}`, ["G", key.toUpperCase()]])],
  [
    "Command menu",
    [
      ["Move selection", ["↑", "↓"]],
      ["Run command", ["↵"]],
      ["Search mode", ["Tab"]],
    ],
  ],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" size="lg" onClose={onClose}>
      <div className="modal-b grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5.5">
        {SHORTCUTS.map(([group, list]) => (
          <div key={group}>
            <div className="eyebrow mb-1.5">{group}</div>
            {list.map(([name, keys]) => (
              <div key={name} className="flex items-center gap-2 h-7.5 border-b border-divider text-(length:--text-base)">
                <span className="flex-1 min-w-0">{name}</span>
                {keys.map((k, i) => (
                  <span key={k + i} className="flex items-center gap-2">
                    {i > 0 && keys[0] === "G" && <span className="faint text-2xs">then</span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
