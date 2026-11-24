import { MessageSquarePlus, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { diffOf, send, type Diff } from "../board/daemon.ts";
import { Button, IconButton } from "../design/components/Button.tsx";

type Row = { kind: "+" | "-" | " " | "@"; line?: number; text: string };

/** A patch as rows: each added line and each line of its context has its number in the file after the change. */
function rows(patch: string): Row[] {
  const found: Row[] = [];
  let at = 0;
  for (const text of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text);
    if (hunk) {
      at = Number(hunk[1]);
      found.push({ kind: "@", text });
    } else if (at && (text.startsWith("+") || text.startsWith(" "))) found.push({ kind: text[0] as "+" | " ", line: at++, text: text.slice(1) });
    else if (at && text.startsWith("-")) found.push({ kind: "-", text: text.slice(1) });
  }
  return found;
}

const GROUND = { "+": "bg-(--good-soft)", "-": "bg-(--bad-soft)", " ": "", "@": "text-ink-4" };

/**
 * Review on the diff, for a task in review: what it changed, file by file. A
 * line the diff shows takes a comment; a rejection writes each comment as a
 * finding, and a task with comments is not accepted.
 */
export function DiffReview({ project, task }: { project: string; task: string }) {
  const [diff, setDiff] = useState<Diff>();
  const [on, setOn] = useState<{ file: string; line: number }>();
  const [text, setText] = useState("");
  const [words, setWords] = useState("");
  const at = `/api/projects/${project}/tasks/${task}`;
  const load = useCallback(() => void diffOf(project, task).then(setDiff, () => setDiff(undefined)), [project, task]);
  useEffect(load, [load]);
  if (!diff) return null;

  const add = async () => {
    if (!on || !(await send(`${at}/comment`, { ...on, text }))) return;
    setOn(undefined);
    setText("");
    load();
  };
  const remove = async (comment: number) => (await send(`${at}/uncomment`, { comment })) && load();
  const { comments } = diff;

  return (
    <div className="dsec">
      <div className="dsec-h">
        <h3>The change</h3>
        <span className="cnt num">{diff.files.length}</span>
      </div>
      <p className="faint mx-0 my-1.5 text-(length:--text-base)">
        Comment a line to send the task back: each comment is written as a finding when you reject it.
      </p>
      {diff.files.map((file) => (
        <div key={file.path} className="mb-3 rounded-md border border-line overflow-hidden">
          <div className="font-mono text-xs px-2 py-1 bg-surface-3 break-all">{file.path}</div>
          <div className="font-mono text-xs leading-5 overflow-x-auto">
            {rows(file.patch).map((row, index) => {
              const here = comments.map((each, n) => ({ ...each, n })).filter((each) => each.file === file.path && each.line === row.line);
              const open = on?.file === file.path && on.line === row.line;
              return (
                <Fragment key={index}>
                  <div className={`group flex ${GROUND[row.kind]}`}>
                    <span className="w-10 shrink-0 text-right pr-2 text-ink-4 select-none tabular-nums">{row.line ?? ""}</span>
                    <span className="w-3 shrink-0 text-ink-4 select-none">{row.kind === " " || row.kind === "@" ? "" : row.kind}</span>
                    <span className="flex-1 whitespace-pre">{row.text}</span>
                    {row.line !== undefined && (
                      <IconButton
                        label={`Comment line ${row.line} of ${file.path}`}
                        size="xs"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                        onClick={() => setOn({ file: file.path, line: row.line! })}
                      >
                        <MessageSquarePlus size={13} aria-hidden />
                      </IconButton>
                    )}
                  </div>
                  {here.map((each) => (
                    <div key={each.n} className="flex items-start gap-2 px-2 py-1.5 font-sans text-sm bg-surface-2 border-y border-line">
                      <span className="flex-1 whitespace-pre-wrap">{each.text}</span>
                      <IconButton label="Remove the comment" size="xs" onClick={() => void remove(each.n)}>
                        <X size={13} aria-hidden />
                      </IconButton>
                    </div>
                  ))}
                  {open && (
                    <div className="flex flex-col gap-1.5 p-2 font-sans bg-surface-2 border-y border-line">
                      <textarea
                        className="textarea"
                        autoFocus
                        value={text}
                        placeholder="What is wrong on this line, so that the worker can check it"
                        aria-label={`Comment on line ${row.line} of ${file.path}`}
                        onChange={(event) => setText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" disabled={text.trim() === ""} onClick={() => void add()}>
                          Comment
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setOn(undefined)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <textarea
          className="textarea"
          value={words}
          placeholder="Findings that are on no line, each one checkable"
          aria-label="Findings in words"
          onChange={(event) => setWords(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={comments.length === 0 && words.trim() === ""} onClick={() => void send(`${at}/reject`, { findings: words })}>
            Reject{comments.length ? ` with ${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : ""}
          </Button>
          <span className="faint text-(length:--text-xs)">The task is ready again, with the findings in its Log.</span>
        </div>
      </div>
    </div>
  );
}
