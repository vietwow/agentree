import { Bell, ChevronDown, CircleCheck, FolderPlus, Menu, Plus, Search, Sparkles } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ic } from "../ui/ic.tsx";
import { Pop, usePop } from "../ui/Pop.tsx";
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
      <button type="button" className="ibtn mnav-btn" onClick={onMenu} aria-label="Open navigation">
        {ic(Menu, 17)}
      </button>
      <nav className="crumbs trunc" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => {
          const cur = i === crumbs.length - 1;
          return (
            <Fragment key={crumb.label}>
              {i > 0 && <span className="sep">/</span>}
              <button
                type="button"
                className={cur ? "cur" : ""}
                onClick={crumb.onClick}
                aria-current={cur ? "page" : undefined}
              >
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
      <button type="button" className="ibtn" onClick={onNotices} data-tip="Notifications" aria-label="Notifications">
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
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={pop.toggle("create")}
        aria-haspopup="menu"
        aria-expanded={pop.open?.key === "create"}
        aria-label="Create new"
      >
        {ic(Plus, 14)}
        <span className="hide-m">New</span>
        {ic(ChevronDown, 12, "hide-m")}
      </button>
      <button
        type="button"
        className="ibtn hide-m"
        onClick={pop.toggle("user")}
        aria-haspopup="menu"
        aria-expanded={pop.open?.key === "user"}
        aria-label="Account menu"
        style={{ width: "auto", padding: "0 2px" }}
      >
        <OwnerAvatar size="md" />
      </button>

      {pop.open?.key === "create" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={220}>
          <div className="mh">Create</div>
          <button type="button" className="mi" onClick={onNewTask}>
            {ic(CircleCheck, 15)}Task
            <span className="r">
              <kbd>N</kbd>
            </span>
          </button>
          <button type="button" className="mi" onClick={onNewProject}>
            {ic(FolderPlus, 15)}Project
            <span className="r">
              <kbd>P</kbd>
            </span>
          </button>
          <div className="msep" />
          <button type="button" className="mi" onClick={onPlan}>
            {ic(Sparkles, 15)}Break a goal down
          </button>
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
