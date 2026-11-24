import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "agentree.theme";
const SYSTEM = "(prefers-color-scheme: dark)";

function stored(): ThemeChoice {
  const value = localStorage.getItem(KEY);
  return value === "light" || value === "dark" ? value : "system";
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && matchMedia(SYSTEM).matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** The theme the owner chose, and whether the page is dark now. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    apply(choice);
    setDark(document.documentElement.classList.contains("dark"));
    if (choice !== "system") return;
    const query = matchMedia(SYSTEM);
    const changed = () => {
      apply("system");
      setDark(query.matches);
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, [choice]);

  const choose = (next: ThemeChoice) => {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
    setChoice(next);
  };
  const toggle = () => choose(dark ? "light" : "dark");

  return { choice, dark, choose, toggle };
}
