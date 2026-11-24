/**
 * The RFCs and ADRs of a project, read from what has landed: the files of
 * the main checkout's commit, never its working tree and never a task's
 * branch. The page that shows them changes none.
 */
import { tryGit } from "../git.ts";
import { frontmatter } from "../task/file.ts";
import type { Places } from "../board/places.ts";

export type DocumentView = {
  id: string;
  kind: "RFC" | "ADR";
  number: string;
  title: string;
  status: "draft" | "accepted" | "superseded";
  /** The day it was accepted or last dated, as its front matter says, or the empty string. */
  date: string;
  path: string;
  supersedes?: string;
  supersededBy?: string;
  /** Its text under each `##` heading, a paragraph an entry. */
  sections: { h: string; body: string[] }[];
  markdown: string;
};

/** Where a project keeps each kind, unless its part names others. */
const DIRECTORIES: [DocumentView["kind"], string][] = [
  ["RFC", "rfcs"],
  ["ADR", "docs/adr"],
];

const STATUSES = ["draft", "accepted", "superseded"] as const;

function parse(kind: DocumentView["kind"], number: string, path: string, text: string): DocumentView {
  const lines = text.split("\n");
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  let fields: Record<string, string | string[]> = {};
  try {
    fields = end > 0 ? frontmatter(lines.slice(1, end)) : {};
  } catch {
    fields = {};
  }
  const field = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : "");
  const body = lines.slice(end + 1);
  const heading =
    body
      .find((line) => line.startsWith("# "))
      ?.slice(2)
      .trim() ?? path;
  const title = heading.replace(new RegExp(`^(${kind}\\s+)?0*${Number(number)}\\s*[:.]\\s*`, "i"), "");
  const sections: DocumentView["sections"] = [];
  let fenced = false;
  for (const line of body) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && line.startsWith("## ")) sections.push({ h: line.slice(3).trim(), body: [""] });
    else if (sections.length) {
      const section = sections.at(-1)!.body;
      if (line.trim() === "" && !fenced) section.push("");
      else section[section.length - 1] = section.at(-1) ? `${section.at(-1)}\n${line}` : line;
    }
  }
  const status = field("status").toLowerCase();
  const supersedes = field("supersedes");
  const supersededBy = field("superseded-by");
  return {
    id: `${kind.toLowerCase()}-${number}`,
    kind,
    number,
    title,
    status: (STATUSES as readonly string[]).includes(status) ? (status as DocumentView["status"]) : "draft",
    date: field("date"),
    path,
    ...(supersedes ? { supersedes } : {}),
    ...(supersededBy ? { supersededBy } : {}),
    sections: sections.map((section) => ({ h: section.h, body: section.body.filter(Boolean) })),
    markdown: body.join("\n").trim(),
  };
}

/** Every RFC and ADR the main checkout's commit holds, by kind and number. */
export function documentsView(places: Places): DocumentView[] {
  const documents: DocumentView[] = [];
  for (const [kind, directory] of DIRECTORIES) {
    const listed = tryGit(places.root, "ls-tree", "-r", "--name-only", "HEAD", "--", `${directory}/`);
    if (listed.status !== 0) continue;
    for (const path of listed.stdout.split("\n").filter(Boolean)) {
      const named = new RegExp(`^${directory}/(\\d{4})[^/]*(?:\\.md|/README\\.md)$`).exec(path);
      if (!named) continue;
      const shown = tryGit(places.root, "show", `HEAD:${path}`);
      if (shown.status === 0) documents.push(parse(kind, named[1]!, path, shown.stdout));
    }
  }
  return documents.sort((a, b) => a.kind.localeCompare(b.kind) * -1 || a.number.localeCompare(b.number));
}
