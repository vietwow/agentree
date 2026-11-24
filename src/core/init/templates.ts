/** The words `agentree init` writes into a project: the rules every tool reads, the skills, and the worker's and reviewer's briefs. */

/** The marks around agentree's section of `AGENTS.md`: a second `init` replaces what is between them and nothing else. */
export const RULES_START = "<!-- agentree:start -->";
export const RULES_END = "<!-- agentree:end -->";

export const TAKING_WORK = `${RULES_START}

## Taking work

The work of this repository is on a board: one task a file, read and
written only through \`agentree\` (the command) or its MCP tools of the
same names. No task file is edited by hand, and none is in your tree.

Name yourself by tool and model, never by a person: \`<tool>/<model>\`,
as \`claude-code/opus-5.5\` or \`codex/gpt-5.6\`, in \`AGENTREE_WORKER\`
for the command and in \`worker\` for a tool call, with your session's id.

1. \`agentree next\` lists the ready tasks and what keeps each from being
   claimed. \`agentree claim T-NNNN\` takes one and prints its tree, its
   brief and what the project remembers for it. A session holds one task.
2. Work only in the task's tree, on its branch, and change only the
   paths under its \`writes\`; in a file under \`appends\`, add only.
   Commit there (\`agentree commit T-NNNN -m ...\` when you cannot).
3. Run every command of the project through \`agentree run T-NNNN --
   <command>\`: a heavy one waits for its turn on the machine.
4. A question for the owner goes on the card: \`agentree ask T-NNNN\`.
   The task stays yours; read the answer with \`agentree wait T-NNNN\`.
5. Before you stop, whatever the reason, \`agentree log T-NNNN\`: what was
   done, the checks and their numbers, what is left, what you found
   wrong outside your paths, what was not verified.
6. \`agentree submit T-NNNN\` when "Done when" holds. Its checks run in
   the queue; take your next task meanwhile. \`agentree release T-NNNN\`
   gives it back unfinished, with what the next worker starts from.
7. Never review a task your session built. \`agentree review T-NNNN\`
   marks a task as yours to review; read its diff against its base in
   its tree, run its checks again, then \`agentree accept\` or
   \`agentree reject\` with findings, each one checkable.
8. Before you start another agent, \`agentree load\`: start no more than
   it says, and none while heavy runs wait.

Never: edit outside your task's paths; edit another task's file or
Log; run git in the main checkout or in another's tree; push or fetch.
What the project should remember goes to \`agentree remember\`.

${RULES_END}
`;

export type Skill = { name: string; description: string; body: string; byModel: boolean };

export const SKILLS: Skill[] = [
  {
    name: "agentree-coordinate",
    description:
      "The coordinator's brief: hand the ready tasks of the board to workers, follow them, and land what is accepted. Used only when the owner asks for a coordinator by name.",
    byModel: false,
    body: `# Coordinating a round

You are the coordinator the owner talks to. You build nothing yourself.

1. \`agentree board\` and \`agentree next\`: what is ready, what is held,
   what is stale, what waits for a review, what asks the owner. Tell
   the owner what you see and which tasks you mean to hand out.
2. Before each worker you start, \`agentree load\`. Start no more than it
   says; start none while heavy runs wait; ask again before the next.
3. Hand a ready task to a worker of a tool that can meet its \`needs\`:
   a subagent of your own tool (the definition \`agentree-worker\`), or a
   session of another tool through \`agentree agent -- <that tool's
   headless command>\`. The worker claims the task itself and works in
   the task's tree.
4. A task in review goes to a reviewer that did not build it, and of
   another tool unless the owner's switch allows the same
   (\`agentree-reviewer\`).
5. Relay a question a worker asked (\`agentree board\` marks it) to the
   owner; the owner answers on the card.
6. \`agentree land\` lands each accepted task in its turn. A task sent
   back names why in its Log: hand it out again.
7. A claim marked stale is the owner's to release. Say so; do not
   take it over.

Keep the round's state in this conversation: who holds what, what you
are waiting for. End by telling the owner what landed, what is left
and what needs them.
`,
  },
  {
    name: "agentree-plan",
    description: "The planner's brief: break a goal (an RFC, a step, a card the owner wrote) down into tasks of one session each on the board.",
    byModel: true,
    body: `# Breaking a goal down

Given a goal, write its tasks through \`agentree new\`, as \`--backlog\`
under one parent, for the owner to make ready.

- **One session each.** A task is what one worker finishes in one
  session and one reviewer reads in one sitting.
- **Paths that do not overlap.** Each task names its \`writes\` (files,
  or directories ending in \`/\`, no wildcard) and the shared files it
  only adds to under \`appends\`. Two tasks that write one path cannot
  be held at once: split by path, or order them with \`--depends-on\`.
- **What it waits for.** \`--depends-on\` names every task whose change
  it builds on, and nothing else.
- **Checks.** A build or a fix names at least one command that passes
  when it is done (\`--check\`).
- **The three sections.** Context: why, and what the worker has to
  know. Done when: a list, each line checkable. Out of scope: what a
  worker might do and must not.
- **Its steps** as subtasks (\`--subtask\`), where they help the worker
  and the owner follow it.

First write the parent (the goal itself, no paths), then its parts
with \`--parent\`. When the project has no ADR of its stack and the
owner left the stack to you, the first task is a \`research\` task that
writes that ADR: each choice, what it rejected and why, each version
read from its release page.

Say what you could not decide, as a question on the parent's card.
`,
  },
];

const BRIEF = (role: "worker" | "reviewer") =>
  role === "worker"
    ? `You are a worker of this repository's board. Read "Taking work" in
AGENTS.md and follow it.

You were given one task. Claim it (\`claim\`), work only in the tree the
claim names and only under its paths, run the project's commands
through \`run\`, and commit in the tree. You cannot ask the owner in
this conversation: a question goes on the task's card (\`ask\`), and you
go on with what does not wait for it, or release the task saying what
it waits for.

Before you return, write the Log entry (\`log\`), then \`submit\` when
"Done when" holds or \`release\` when it does not. Return in a few
lines: the task, what you did, whether it is submitted, what is left.
`
    : `You are a reviewer of this repository's board. Read "Taking work" in
AGENTS.md and follow it. You change no file.

You were given one task in review. Mark it (\`review\`); you are refused
if your session built it. Read the task and its Log, then its change:
the diff of its tree against its base. Check that every changed file
is under its paths, that "Done when" holds line by line, and run its
checks again through \`run\`.

\`accept\` with what you read and which checks passed, or \`reject\` with
findings, each naming its file and what is wrong so that the worker
can check it. Return the verdict in a few lines.
`;

/** A subagent's definition in the Markdown form Claude Code and Cursor read: front matter, then its brief. */
export function agentDefinition(role: "worker" | "reviewer"): string {
  const description =
    role === "worker"
      ? "Builds one task of the agentree board in the task's own tree. Use it to hand a ready task to a fresh context."
      : "Reviews one task of the agentree board that another session built. Use it for a task in review; it edits no file.";
  const tools = role === "reviewer" ? "disallowedTools: Edit, Write, MultiEdit, NotebookEdit\n" : "";
  return `---\nname: agentree-${role}\ndescription: ${description}\n${tools}---\n\n${BRIEF(role)}`;
}

/** A skill's file in the open form: front matter with its name and what it is for, then its words. */
export function skillFile(skill: Skill): string {
  const marks = skill.byModel ? "" : "disable-model-invocation: true\n";
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n${marks}---\n\n${skill.body}`;
}

/** What a project's own documents start from: the files `init` writes beside its RFCs and its ADRs, under names the Documents page does not list. */
export const DOCUMENT_TEMPLATES: Record<string, string> = {
  "docs/adr/TEMPLATE.md": `---
status: draft
date: YYYY-MM-DD
---

# ADR NNNN: The decision in a line

Copy this file to \`docs/adr/NNNN-short-name.md\` with the next number.
\`status\` is \`draft\`, \`accepted\` or \`superseded\`; an ADR that replaces
another names it in \`supersedes: adr-NNNN\`, and the one replaced names
its successor in \`superseded-by\`.

## Context

What forces the decision: the need, the constraints, what was measured.

## Decision

What is chosen, in the present tense.

## Options weighed

Each option that was looked at, and why it was not taken.

## Consequences

What becomes easier, what becomes harder, and what has to be watched.

## Verified

Each fact about a tool, a library or an API, with where it was read.
What was not verified is said plainly.
`,
  "rfcs/TEMPLATE.md": `---
status: draft
date: YYYY-MM-DD
---

# RFC NNNN: What is proposed

Copy this file to \`rfcs/NNNN-short-name/README.md\` with the next number.
A task that builds a part of it names the number in its \`rfc\` field.

## The problem

What is wrong or missing today, with what it costs.

## What is proposed

The design, a part a section. What it does not do.

## The steps in order

Each becomes a task once the RFC is accepted.

## Proving it

What is true when the design is done, each line checkable.

## Questions for the owner

What only the owner decides; each answered one moves to the design.

## Verified

Each claim about a tool, a library or an API, with where it was read.

## Not verified

What was assumed and not checked.
`,
  "docs/engineering/system-conventions.md": `# System conventions

The one way this project does each thing it needs: a line here when the
project chooses it, with the ADR that decided it. A need that is not
here has no convention yet: decide it in an ADR before the second place
that needs it is written.

| Need | The one way | Decided in |
| ---- | ----------- | ---------- |
`,
};
