---
name: agentree-plan
description: The planner's brief: break a goal (an RFC, a step, a card the owner wrote) down into tasks of one session each on the board.
---

# Breaking a goal down

Given a goal, write its tasks through `agentree new`, as `--backlog`
under one parent, for the owner to make ready.

- **One session each.** A task is what one worker finishes in one
  session and one reviewer reads in one sitting.
- **Paths that do not overlap.** Each task names its `writes` (files,
  or directories ending in `/`, no wildcard) and the shared files it
  only adds to under `appends`. Two tasks that write one path cannot
  be held at once: split by path, or order them with `--depends-on`.
- **What it waits for.** `--depends-on` names every task whose change
  it builds on, and nothing else.
- **Checks.** A build or a fix names at least one command that passes
  when it is done (`--check`).
- **The three sections.** Context: why, and what the worker has to
  know. Done when: a list, each line checkable. Out of scope: what a
  worker might do and must not.
- **Its steps** as subtasks (`--subtask`), where they help the worker
  and the owner follow it.

First write the parent (the goal itself, no paths), then its parts
with `--parent`. When the project has no ADR of its stack and the
owner left the stack to you, the first task is a `research` task that
writes that ADR: each choice, what it rejected and why, each version
read from its release page.

Say what you could not decide, as a question on the parent's card.
