---
name: agentree-plan
description: The planner's brief: break a goal (an RFC, a step, a card the owner wrote) down into tasks of one session each on the board.
---

# Breaking a goal down

Given a goal, write its tasks through `agentree new` (or the MCP tool
`new`), as `--backlog` under one parent, for the owner to make ready.
A card is all a worker has: it is written for a session that knows
nothing of this conversation.

## How the tasks are cut

- **One session each.** A task is what one worker finishes in one
  session and one reviewer reads in one sitting.
- **Paths that do not overlap.** Each task names its `writes` (files,
  or directories ending in `/`, no wildcard: the file and its test)
  and the shared files it only adds to under `appends`. Two tasks
  that write one path cannot be held at once: split by path, or order
  them with `--depends-on`.
- **What it waits for.** `--depends-on` names every task whose change
  it builds on, and nothing else.
- **The parent first.** The goal itself is one card with no paths; its
  title is a short name of the whole, as `The core split from the
  seed`. Its parts are written with `--parent`. A parent is done when
  its parts are.

## The form of a card

Every part has all of these. `agentree new` says, under `form:`,
what a card you wrote lacks: write it again until it says nothing.

- **Title.** What the change does, in one line of 3 words at least and
  90 letters at most, with no period: the thing and what happens to
  it. `Refuse a write when the file changed since it was read`, not
  `Store improvements` and not `Implement T-0005`.
- **Context.** Two to four sentences: what is there now, what this
  adds, the rule it must hold, and the file or the decision it follows
  (an RFC's section, an ADR). Name the things by their names in the
  code.
- **Done when.** A list of two to five lines, each a thing a reviewer
  can check without asking: a behaviour with its case, a command that
  passes, a file that holds something. Never "works" or "is clean".
- **Out of scope.** What a worker might do here and must not, each with
  where it belongs (another task's id, a later step).
- **Subtasks.** For a build or a fix, 2 to 6 steps in the order they
  are done, each a short line that begins with what is done:
  `Hash the file at its read`. They are ticked as the work goes, and
  the owner follows a task by them.
- **Checks.** A build or a fix names at least one command that passes
  when it is done (`--check`); the narrowest that proves it.
- **Kind and priority.** The kind says what comes out; 1 is taken
  first, and parts of one parent that must go in order differ in
  priority or depend on each other.

What "Done when" holds, by kind:

| Kind | Done when |
| --- | --- |
| build, fix | Each behaviour named in Context has a test; the checks pass; no file outside its paths changed. A fix names the case that failed. |
| research | A note under docs/ answers the question, each claim with its source; what was not verified is said plainly. |
| decision | An ADR records the choice and the options weighed; the owner accepted it. |
| measure | The record holds every value read, with the viewport and the state; what was not measured is listed with its reason. |
| review | Each finding names its file and line; the verdict is in the Log. |

## A card, whole

    agentree new --backlog --parent T-0001 --kind build --priority 1 \
      --title "Refuse a write when the file changed since it was read" \
      --context "A task file is read, changed in memory and written back; two commands that do so at once lose one of the two changes. The store keeps the text each file had at its read and writes only when the file still holds that text; a write that finds another text is refused with the word Changed, and the command reads again. RFC 0001, 'Where the board lives'." \
      --done-when="- A write after another command's write of the same file is refused, and the file holds the other command's text.
    - A write of a file nobody changed since its read succeeds.
    - The refusal names the file and says that it changed since it was read.
    - pnpm test passes." \
      --out-of-scope "Merging the two changes: the command reads again and decides. The lock of the board's commits, which is T-0008's." \
      --writes src/core/board/store.ts,src/core/board/store.test.ts \
      --check "pnpm test" \
      --subtask "Keep the text of each file at its read" \
      --subtask "Refuse the write when the file holds another text" \
      --subtask "Read again and retry in the commands that write"

A value that begins with a dash is given as `--option=<value>`, as
`--done-when` above.

## When the stack is not decided

When the project has no ADR of its stack and the owner left the stack
to you, the first task is a `research` task that writes that ADR:
each choice, what it rejected and why, each version read from its
release page.

Say what you could not decide, as a question on the parent's card.
