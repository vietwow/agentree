import type { KeyboardEvent } from "react";

/**
 * What makes an element that is no button act as one: its role, a place in
 * the tab order, and Enter and Space doing what a click does. A key pressed
 * on a control inside it is that control's own.
 */
export const press = (act: () => void, role: "button" | "link" = "button") => ({
  role,
  tabIndex: 0,
  onClick: act,
  onKeyDown: (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    act();
  },
});
