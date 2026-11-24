import { Keyboard, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { ic } from "../ui/ic.tsx";
import type { ThemeChoice } from "./theme.ts";

export type OwnerMenuProps = {
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  onSettings: () => void;
  onShortcuts: () => void;
};

const OWNER_COLOR = "#5A67D8";

export function OwnerAvatar({ size, presence = false }: { size: "sm" | "md" | "lg"; presence?: boolean }) {
  return (
    <span className={`av ${size} ${presence ? "presence" : ""}`} style={{ "--c": OWNER_COLOR } as React.CSSProperties} aria-label="Owner">
      O
    </span>
  );
}

const THEMES: [ThemeChoice, typeof Sun, string][] = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
];

/** The owner's menu: who is signed in, the theme, and the way out. View profile and Sign out do nothing yet. */
export function OwnerMenu({ theme, onTheme, onSettings, onShortcuts }: OwnerMenuProps) {
  return (
    <>
      <div className="row" style={{ padding: "8px 8px 10px", gap: 10 }}>
        <OwnerAvatar size="lg" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Owner</div>
          <div className="faint trunc" style={{ fontSize: 12 }}>
            This machine
          </div>
        </div>
      </div>
      <div className="msep" />
      <button type="button" className="mi">
        {ic(User, 15)}View profile
      </button>
      <button type="button" className="mi" onClick={onSettings}>
        {ic(Settings, 15)}Account settings
      </button>
      <div className="msep" />
      <div className="mh">Theme</div>
      <div style={{ padding: "2px 6px 6px" }}>
        <div className="seg" style={{ width: "100%" }}>
          {THEMES.map(([key, Icon, name]) => (
            <button
              key={key}
              type="button"
              className={theme === key ? "on" : ""}
              aria-pressed={theme === key}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => onTheme(key)}
            >
              {ic(Icon, 13)}
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="msep" />
      <button type="button" className="mi" onClick={onShortcuts}>
        {ic(Keyboard, 15)}Keyboard shortcuts
        <span className="r">
          <kbd>?</kbd>
        </span>
      </button>
      <button type="button" className="mi">
        {ic(LogOut, 15)}Sign out
      </button>
    </>
  );
}
