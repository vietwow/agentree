import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { useDaemon, type Trouble } from "./board/daemon.ts";
import "./styles.css";

const TROUBLES: Record<Trouble, [string, string]> = {
  down: ["The daemon does not answer", "Run `agentree serve`; this page reads it again every few seconds."],
  "no-token": [
    "This page carries no token of the daemon",
    "Open the address `agentree serve` printed: it holds the token once, and the browser keeps it.",
  ],
  empty: [
    "No project is registered on this machine",
    "Run `agentree init` and `agentree register` in a repository, or `agentree demo <directory>` for the sample projects.",
  ],
};

/** The pages once the daemon gave its first read; before it, or without it, what is missing and what to run. */
function Root() {
  const [project, setProject] = useState<string>();
  const daemon = useDaemon(project);
  if (!daemon) return null;
  if ("trouble" in daemon) {
    const [title, text] = TROUBLES[daemon.trouble];
    return (
      <div className="empty-state h-full" role="status">
        <h2 className="es-h">{title}</h2>
        <p>{text}</p>
      </div>
    );
  }
  return <App projects={daemon.projects} board={daemon.board} onProject={setProject} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
