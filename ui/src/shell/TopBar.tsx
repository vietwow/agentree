import { Bell, ChevronDown, CircleCheck, FolderPlus, Menu, Plus, Search, Sparkles } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Button, IconButton } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem, MenuLabel, MenuSeparator } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { OwnerAvatar, OwnerMenu, type OwnerMenuProps } from "./OwnerMenu.tsx";

export type Crumb = { label: string; icon?: ReactNode; onClick?: () => void };

type Props = {
  crumbs: Crumb[];
  unread: boolean;
  onMenu: () => void;
  onSearch: () => void;
  onNotices: () => void;
  onNewTask: () => void;
  onNewProject: () => void;
  onPlan: () => void;
  owner: OwnerMenuProps;
};

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

export function TopBar({ crumbs, unread, onMenu, onSearch, onNotices, onNewTask, onNewProject, onPlan, owner }: Props) {
  const pop = usePop<"create" | "user">();

  return (
    <header className="topbar">
      <IconButton label="Open navigation" className="mnav-btn" onClick={onMenu}>
        {ic(Menu, 17)}
      </IconButton>
      <nav className="crumbs trunc" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => {
          const cur = i === crumbs.length - 1;
          return (
            <Fragment key={crumb.label}>
              {i > 0 && <span className="sep">/</span>}
              <button type="button" className={cur ? "cur" : ""} onClick={crumb.onClick} aria-current={cur ? "page" : undefined}>
                {crumb.icon}
                {crumb.label}
              </button>
            </Fragment>
          );
        })}
      </nav>
      <span className="sp" />
      <button type="button" className="topsearch" onClick={onSearch} aria-label="Search and commands">
        {ic(Search, 14)}
        <span className="lbltxt">Search or jump to…</span>
        <span className="kbd">{MOD}K</span>
      </button>
      <IconButton label="Notifications" tip onClick={onNotices}>
        {ic(Bell, 16)}
        {unread && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 0 2px var(--surface)",
            }}
          />
        )}
      </IconButton>
      <Button size="sm" onClick={pop.toggle("create")} aria-haspopup="menu" aria-expanded={pop.open?.key === "create"} aria-label="Create new">
        {ic(Plus, 14)}
        <span className="hide-m">New</span>
        {ic(ChevronDown, 12, "hide-m")}
      </Button>
      <IconButton
        label="Account menu"
        className="hide-m"
        onClick={pop.toggle("user")}
        aria-haspopup="menu"
        aria-expanded={pop.open?.key === "user"}
        style={{ width: "auto", padding: "0 2px" }}
      >
        <OwnerAvatar size="md" />
      </IconButton>

      {pop.open?.key === "create" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={220}>
          <MenuLabel>Create</MenuLabel>
          <MenuItem icon={CircleCheck} keys="N" onClick={onNewTask}>
            Task
          </MenuItem>
          <MenuItem icon={FolderPlus} keys="P" onClick={onNewProject}>
            Project
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Sparkles} onClick={onPlan}>
            Break a goal down
          </MenuItem>
        </Pop>
      )}
      {pop.open?.key === "user" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={260}>
          <OwnerMenu {...owner} />
        </Pop>
      )}
    </header>
  );
}
