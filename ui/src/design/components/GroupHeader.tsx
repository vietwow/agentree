import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./Button.tsx";
import { ic } from "./icon.tsx";

type Props = {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** A mark before the name: the group's icon, status or tool. */
  lead?: ReactNode;
  /** Controls after the count. */
  actions?: ReactNode;
};

/** The head of a group of rows in a table: a toggle that folds it, its mark, its name and how many rows it holds. */
export function GroupHeader({ name, count, open, onToggle, lead, actions }: Props) {
  return (
    <div className="grp">
      <IconButton label={`${open ? "Fold" : "Unfold"} ${name}`} size="xs" onClick={onToggle} aria-expanded={open}>
        {ic(open ? ChevronDown : ChevronRight, 13)}
      </IconButton>
      {lead}
      <span>{name}</span>
      <span className="cnt">{count}</span>
      {actions}
    </div>
  );
}
