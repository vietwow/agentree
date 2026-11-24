import { Keyboard, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { MenuItem, MenuLabel, MenuSeparator } from "../design/components/Menu.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
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
      <MenuSeparator />
      <MenuItem icon={User}>View profile</MenuItem>
      <MenuItem icon={Settings} onClick={onSettings}>
        Account settings
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <div style={{ padding: "2px 6px 6px" }}>
        <Segmented label="Theme" fill value={theme} onChange={onTheme} options={THEMES.map(([value, icon, label]) => ({ value, label, icon }))} />
      </div>
      <MenuSeparator />
      <MenuItem icon={Keyboard} keys="?" onClick={onShortcuts}>
        Keyboard shortcuts
      </MenuItem>
      <MenuItem icon={LogOut}>Sign out</MenuItem>
    </>
  );
}
