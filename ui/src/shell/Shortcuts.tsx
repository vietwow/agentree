import { Modal } from "../design/components/Modal.tsx";

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
  [
    "Navigate",
    [
      ["Go to Home", ["G", "H"]],
      ["Go to Projects", ["G", "P"]],
      ["Go to Inbox", ["G", "I"]],
      ["Go to Tasks", ["G", "T"]],
      ["Go to Board", ["G", "B"]],
      ["Go to Activity", ["G", "A"]],
      ["Go to Favorites", ["G", "F"]],
      ["Go to Options", ["G", "S"]],
    ],
  ],
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
      <div className="modal-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 22 }}>
        {SHORTCUTS.map(([group, list]) => (
          <div key={group}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {group}
            </div>
            {list.map(([name, keys]) => (
              <div key={name} className="row" style={{ height: 30, fontSize: 13, borderBottom: "1px solid var(--divider)" }}>
                <span className="grow">{name}</span>
                {keys.map((k, i) => (
                  <span key={k + i} className="row" style={{ gap: 8 }}>
                    {i > 0 && keys[0] === "G" && (
                      <span className="faint" style={{ fontSize: 11 }}>
                        then
                      </span>
                    )}
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
