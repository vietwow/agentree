---
title: A task board in the repository for agents and people
status: implementable
authors:
  - '@owner'
owners:
  - '@owner'
areas:
  - platform
creation-date: 2026-11-19
---

# RFC: A task board in the repository for agents and people

## Summary

AEP is built by many workers at once: Claude Code sessions, agents in
Antigravity, agents in Cursor, and people, each on its own account and with
no memory of the others' conversations. The work itself lives in the
repository: one file per task under [`work/tasks/`](../../work/tasks), with
a status, the paths the task may change, the tasks it waits for and what
done means. A worker finds a task it may take, claims it so that no one
else takes it or touches its files, records what it did, and hands it on.

The owner accepted this RFC on 2026-11-20. Version 1 of the protocol is in
use: [`work/README.md`](../../work/README.md) is the protocol as a worker
follows it, and [`work/agreements.md`](../../work/agreements.md) holds the
owner's standing instructions. The steps that make, check and remove a
task's tree, and the move to review, are done by the task command
(`scripts/task.mjs`, built by task T-0001 and made the board of trees by
T-1063), which needs Node and nothing installed: `claim`, `submit`,
`release` and `land`; the others can be done by hand with a shell and an
editor. The checks it runs are
the task's own commands and need what those need. The task command does
the other steps on the same files too, and its lint and scope check hold
what this RFC describes.

## Motivation

Until 2026-11-20 the plan of the work was in the RFCs (phase 1's steps and
rounds), and the state of the work was in one coordinator's conversation:
who is building what, which files each builder owns, which results were
checked, what was asked of whom. That worked for one session, and it cost
three things:

- **The state is lost with the conversation.** A worker on another account,
  or the same person in another tool, cannot tell what is in progress, what
  is done, what was found blocked and why. It rebuilds that from the files,
  or redoes the work. On 2026-11-20 seven builders were interrupted in the
  middle of their work, and what each had finished was known only from the
  files' modification times.
- **Ownership is agreed in prose, not held.** Each builder's brief names the
  files it owns and those it must not edit. Nothing stops a builder that
  ignores it, and the coordinator finds out by reading reports.
- **Standing decisions live in private notes.** Some rules the owner gave
  (how the reference application may be used, what done means for a part
  measured from it, that measurements are reused) were written in one
  assistant's own memory, not in the repository, so another worker did not
  see them.

### Goals

1. A worker with nothing but a checkout and `AGENTS.md` can find a task it
   may take, take it, finish or hand it on, and leave the next worker
   everything it needs, in under five minutes of reading.
2. Two workers never hold the same task, and never hold tasks whose writable
   paths overlap. This is checked, not agreed.
3. A change that touches files outside its task's paths fails a check
   before it is merged.
4. Anyone can see the board: what is ready, in progress (by whom, since
   when), in review, blocked (on what), done.
5. It works with any agent that can read files and run a shell command:
   nothing in the protocol depends on one vendor's features (subagents,
   skills, memory).
6. It works on one machine, each worker in a git worktree of its own and
   the board in the main checkout, and later across machines and accounts
   through git, with the same files.

### Non-goals

- Estimates, velocity, sprints or story points. Tasks are ordered by
  dependency and priority, not planned into time boxes.
- Replacing RFCs and ADRs. An RFC says what is built and why; an ADR
  records a decision; a task says who is building one piece of it now.
- A hosted tracker. A view in GitHub Projects or elsewhere may mirror the
  board later; the repository stays the source.
- Scheduling agents. Which worker runs when is the people's choice.

## Proposal

### Where each kind of knowledge lives

A worker that starts with no history reads, in this order:

| What                              | Where                               | Changes how                       |
| --------------------------------- | ----------------------------------- | --------------------------------- |
| The rules of the repository       | `AGENTS.md`                         | In the change that changes a rule |
| How work is taken and handed on   | `work/README.md`                    | With this RFC                     |
| How the owner wants the work done | `work/agreements.md`                | By the owner only                 |
| Who is building what, now         | `work/tasks/`                       | By the protocol below             |
| What is being built, and why      | `rfcs/`                             | The RFC, while implementable      |
| Decisions and their reasons       | `docs/adr/`                         | A new ADR                         |
| How the system works              | package READMEs, `docs/engineering` | In the same change                |

`work/agreements.md` holds the owner's standing instructions that are not a
rule of the code and not a design decision: how the reference application
may be used (read-only, in the owner's browser, the throwaway-object rule),
what done means for a part measured from it, that measurements are reused
and never estimated, what is never captured (tokens, cookies, personal
data), and that nothing is committed or pushed until the owner says so. It
holds none of the owner's personal details and none of the reference
organization's identifiers.

### A task

One Markdown file per task, `work/tasks/T-NNNN-short-name.md`:

```markdown
---
id: T-0042
title: The catalog table stays usable at 100,000 rows
status: ready # backlog | ready | in-progress | review | done | blocked | dropped
kind: build # build | measure | fix | research | review | decision
step: '1.11' # the RFC step it delivers, if any
rfc: '0005'
priority: 2 # 1 first
depends-on: [T-0040]
writes: # paths only this task may change while it is held
  - apps/web/src/ui/DataTable.tsx
  - apps/web/src/ui/DataTable.test.tsx
  - apps/web/src/pages/catalog/
appends: # shared files it may make small additive edits to
  - apps/web/README.md
needs: [docker] # owner | browser | docker | network | reference-app
checks: # what must pass before review
  - yarn platform:check
  - yarn workspace @aep/web e2e --project=app
claim: # written when the task is claimed, removed when it is released
  by: claude-code/opus-5.5
  since: 2026-11-19T15:04:00Z
  beat: 2026-11-19T16:30:00Z
---

## Context

What the next worker needs that the linked RFC step does not say.

## Done when

The checkable conditions. For a part measured from the reference, the
definition of done of `work/agreements.md`, with the parts named.

## Out of scope

What looks related and is another task's (with its id).

## Log

### 2026-11-19 16:40, claude-code/opus-5.5

Did: ... Left: ... Found: ... Files: ... Checks: ...
```

A task is sized so that one worker finishes it in one session: one owning
directory, one reviewable change. A step of an RFC becomes several tasks,
split along the boundaries the repository already has (a module, a page, a
component), so that their `writes` do not overlap.

### Status, and who moves it

```
backlog ──▶ ready ──claim──▶ in-progress ──submit──▶ review ──accept──▶ done
              ▲                  │   ▲  ◀──withdraw──    │
              │                release │                reject
              │                  ▼   │                   │
              └──────────────── blocked ◀────────────────┘ (back to ready)
```

- **backlog → ready**: the task has `writes`, `checks` and "Done when", and
  every task it depends on is done. The reviewer that accepts the last
  dependency moves it. The steps of an RFC are taken in order: a task of a
  later step stays in the backlog until the step before it is done, even
  when it depends on nothing.
- **ready → in-progress**: a claim. Refused when another held task writes an
  overlapping path or when a dependency is not done. A task that needs
  `owner` is claimed only once the owner has said so, and the Log says when.
- **in-progress → review**: a submission: the task's checks pass, every
  changed file is inside `writes` and `appends`, and the Log has an entry.
- **review → done or back to ready**: a reviewer that is not the worker
  that submitted (another agent or a person) reruns the checks, reads the
  change, and accepts or rejects with findings in the Log.
- **review → in-progress**: a withdrawal (`task withdraw`). The worker that
  submitted the task, and no other, takes it back to fix it: the task gets
  a claim again and a Log entry, read from stdin, that says why. The
  submitter is the worker of the task's last Log entry, which has to be the
  one `task submit` wrote. When it is not, no entry tells who submitted the
  task: the command refuses every worker, and a reviewer rejects the task.
  The command also refuses a task that is not in review, an empty stdin,
  and a task whose paths overlap those of a held task or whose claim
  directory exists, as a claim does. Of two overlapping tasks taken in the
  same moment the one with the higher id gives way here too: a withdrawn
  task that gives way stays in review as it was.
- **blocked**: with the task or decision it waits for, named in the Log.
  Releasing a task keeps its Log, so the next worker starts from it.
- A task of kind `decision`, or one that needs `owner`, is accepted only by
  the owner.

### How a claim is atomic

Creating a file with exclusive create (`O_EXCL`) succeeds for exactly one
process and fails for every other, on every file system the checkout can
be on. So a claim is the file `work/claims/T-NNNN/claim`, which
`task claim` creates so, with its worker name and the time. Around it:

1. **Before**: every task in `depends-on` has `status: done` and is on
   `main`, and no task with `status: in-progress`, nor one whose change is
   not on `main` yet, has a `writes` entry that overlaps one of this
   task's `writes` or `appends`.
2. **The claim**: the claim file.
3. **After**: the command sets `status: in-progress` and the `claim`
   block in the task file, and looks at `work/claims/` once more. Two
   workers can pass step 1 at the same moment for two different tasks
   whose paths overlap; each then sees the other's claim here, and the one
   with the higher task id releases. Then it makes the task's tree
   ([Trees](#trees)).

Releasing removes the tree when it is clean, then the claim file and the
`claim` block, sets the status (`ready` or `blocked`) and adds a Log
entry. A submission ends the claim the same way with the status
`review`, and only `task submit` does it. A claim whose `beat` is older
than four hours, with no Log entry since, is stale; it is taken over only
by a worker the owner told to, with a Log entry saying so.

`work/claims/` is not committed (`.gitignore`): a claim is a fact about one
checkout at one moment.

### Trees

The board's one way of working
([docs/engineering/worktrees.md](../../docs/engineering/worktrees.md)):
the board stays one, in the main checkout, and each worker builds its task
in a git worktree of its own, `../aep-trees/T-0042` on the branch
`task/T-0042`, made by its claim from the head of `main` with its own
install. The worker commits there; the scope check, the narrowing and the
checks run in the tree, in the board's one queue of slots, and a submit
checks the commit the tree is at. An accepted task reaches `main` when the
coordinator lands it (`task land T-0042`): one landing at a time, under a
lock of the board, by `git merge --ff-only` in the main checkout. A change
made from a `main` that has moved since is stale, and goes back to its
worker, who rebases in its own tree, runs the checks again and is
reviewed again. Nothing is built in the main checkout but a landing, and
nothing is pushed or fetched.

### Several machines and accounts

Two workers on two machines are not protected yet. Once the repository
is shared, a claim would also be a commit of the task file to the main
branch, pushed at once: a push is accepted only on top of the branch's
current head, so of two workers claiming at the same moment one push is
refused, and that worker fetches, sees the claim and gives up. That is not
built.

### The task command

The task command (`scripts/task.mjs`, run as `yarn task` or directly with
Node) runs with Node and nothing installed, so every agent runs the same
code. When the repository's Prettier (`node_modules/prettier`) is
installed, the command formats each task file it writes with it; when it
is not, the command writes the file as it is and says so. `task submit` is
the one way a task reaches `review`, and `claim`, `release` and `land`
the one way to make and remove its tree; the other subcommands do what
`work/README.md` lists by hand, on the same files:

| Subcommand                | Does                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `task board`              | The board: each column with its tasks, who holds them and since when; stale claims marked.                             |
| `task next [--can ...]`   | The ready tasks this worker may take now (no overlap with held tasks, its `needs` met), by priority.                   |
| `task show T-0042`        | The task, its dependencies' state, the files it may write, its last Log entries.                                       |
| `task claim T-0042`       | Takes the task as above, makes its tree; prints the brief to work from.                                                |
| `task beat T-0042`        | Marks the claim alive, or the review mark of the worker that reviews the task.                                         |
| `task log T-0042`         | Appends a Log entry (from stdin), with time and worker.                                                                |
| `task scope T-0042`       | The scope check alone: the files the task's tree changed from its base, against the task's paths.                      |
| `task submit T-0042`      | Runs the scope check and the checks in the tree, on the commit it is at, and moves to review.                          |
| `task withdraw T-0042`    | Takes a task in review back to in-progress for the worker that submitted it, with a Log entry (from stdin) saying why. |
| `task release T-0042`     | Gives the task back (ready or blocked), with a Log entry saying why.                                                   |
| `task review T-0042`      | Marks a task in review as under review by this worker, refused while another's mark holds; `--drop` gives it back.     |
| `task accept` / `reject`  | The reviewer's verdict; accepting moves the tasks that waited for this one to ready.                                   |
| `task new`                | A task from the schema, with the next free id.                                                                         |
| `task land T-0042`        | The accepted task's branch fast-forwards `main` in the main checkout, and its tree is removed.                         |
| `task lint`, in the check | Every task file against the schema; ids unique; dependencies exist and have no cycle; no two held tasks overlap.       |

A worker names itself with `AEP_WORKER` (`claude-code/<model>`,
`antigravity/<model>`, `cursor/<model>`, `person/<handle>`): the tool and
the model, never a person's name or email. The command refuses to change
the board without it, and its tests are `yarn test:task`.

### What holds it

- The lint of the task files (`yarn lint:tasks`), as part of
  `yarn lint:repo` and CI.
- The scope check: the files a task's change touches are inside its
  `writes` and `appends`. It is `git diff` of the task's tree against its
  base, the last commit its branch shares with `main`, where every file
  outside the task fails it; a landing holds the change to the same rule.
- `AGENTS.md` has a short section, "Taking work", that every tool's agent
  reads first: read `work/README.md`, claim one task, change only what it
  writes, log before you stop, submit, never edit another task's file.

### Hot files

Overlaps come mostly from a few files that every piece of work appends to:
`apps/web/e2e/fixtureApi.ts`, `apps/web/src/routes.ts`, the parity part
registry in `apps/web/e2e/parity.test.ts`, `apps/web/README.md`. `appends`
allows small additive edits to such a file by several tasks, re-read right
before the edit. The lasting fix is to make them collections the code
discovers (a fixture module per part found by its directory, a route table
per page), so that two tasks add two files instead of editing one. Those
are tasks on the board.

### Which file each tool reads

`AGENTS.md` is the one source of rules, and the repository adds no
`GEMINI.md`, no `.cursor/rules` and no `.agents/rules`, so that no second
file can contradict or override it.

| Tool        | Reads                                                                                                                           | Verified from                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Claude Code | `AGENTS.md`, through `CLAUDE.md`, which holds the one line `@AGENTS.md`.                                                        | The file in this repository.                                     |
| Antigravity | `AGENTS.md`, `GEMINI.md` and `.agents/rules/*.md` in the workspace and its parents.                                             | [Its rules documentation](https://antigravity.google/docs/rules) |
| Cursor      | `AGENTS.md` in the project root, as an alternative to `.cursor/rules`; its command-line tool reads `AGENTS.md` and `CLAUDE.md`. | [Its rules documentation](https://cursor.com/docs/rules)         |

A worker's own global rules (in its home directory) are not part of the
protocol and must not be needed for it.

## Design details

- **Layout.** `work/README.md` (the protocol, short), `work/agreements.md`,
  `work/tasks/*.md`, `work/claims/` (not committed), `work/schema.json`
  (the frontmatter's JSON schema) and `scripts/task.mjs` with its tests
  (`scripts/task.test.mjs`).
- **Overlap.** `writes` entries are files or directories ending in `/`; no
  wildcards, so that "do two tasks overlap" is a prefix comparison and
  never a guess. Two entries overlap when they are equal or when one ends
  in `/` and the other starts with it. `appends` never conflicts with
  `appends`, and conflicts with another task's `writes`.
- **Ids.** `T-` and four digits, the next free one; a task is never
  renumbered or deleted, only `dropped` with a reason.
- **The board.** There is no board file: a file every claim rewrites would
  conflict in every merge. The board is read from the task files.
- **Reports.** A worker's report is its Log entry: what it did, the numbers
  (checks, parity), what is left, what it found in other tasks' files (as a
  new task or a note in its own Log, never as an edit). A coordinator's
  conversation then holds nothing the board does not.
- **Failure modes.** A worker that dies leaves a stale claim, taken over
  explicitly. A worker that changes a file outside its task's paths fails
  the scope check in `task submit`, and a landing sends such a change
  back. A task moved to `review` by hand, by editing its file
  instead of running `task submit`, fails the lint and is not accepted. A
  task file edited by hand into an invalid state fails the lint. Two
  workers on two machines claiming before the repository is shared are not
  protected.
- **A submit checks what its task changed.** `task submit` runs a check
  of the whole tree (`yarn platform:check`, `yarn platform:test`) on the
  task's changed files: the typecheck of their packages and of those that
  depend on them, oxlint on the files, `vitest related` on them, or the
  tests of the packages of a file no import graph ties to its tests;
  `AEP_WHOLE_TREE=1` before the check runs it whole. `yarn task sweep`
  checks the whole tree under a slot, on a schedule or by hand, and files
  or updates one task for what fails, which finds what a narrowed check
  skipped (T-0763; `work/README.md`).
- **A submit that does not wait for its checks.** Proposed by T-0764 and
  not accepted yet: [design/async-checks.md](./design/async-checks.md)
  designs a status `checking`, in which a task's checks run after
  `task submit` has returned, under the machine's slots, while its paths
  stay held; built by T-0768 and T-0769 once it is accepted.

## Security and compliance

- Task files and Logs are part of the repository and are published with
  it. They hold no secret, token, personal detail, or identifier of the
  owner's organization in the reference application; the repository's
  secret scan (`yarn lint:secrets`) reads them like every file.
- A task that needs the owner's browser or the reference application says
  so in `needs`, and `work/agreements.md` says what such a task may do
  there. No worker uses the owner's browser for a task that does not.
- A worker cannot accept its own task, and cannot accept a `decision`.

## Rollout plan

1. Accepted by the owner on 2026-11-20.
2. `work/README.md`, `work/agreements.md` and the tasks of all known work
   are written (2026-11-20). The protocol is followed by hand.
3. T-0001 built the task command, the schema, the lint and the scope
   check (2026-11-20).
4. T-1063 made trees the board's one way of working (2026-11-23).
5. Git across machines starts when the repository is shared; its
   statement above is checked then, by a task on the board.

## Dependencies

- RFC 0005 and [RFC 0007](../0007-agentic-delivery-platform/README.md),
  whose steps the tasks deliver.
- Git across machines needs a shared repository. Nothing is pushed, and
  [phase-1.md](../0005-standalone-platform/phase-1.md) lists what must be
  settled before anything is.

## Alternatives

- **GitHub Issues and a Projects board.** A real board UI, assignees, links
  to pull requests. Not chosen as the source: the repository's remote is
  public, so the plan and its Logs would be too; every worker needs network
  access and the GitHub CLI signed in; and an issue cannot express or check
  "the files this task may change". It can be a mirror later.
- **One board file.** Simple to read. Not chosen: every claim edits the same
  file, so parallel workers conflict on it in every merge.
- **A claim directory made with `mkdir`.** Version 1, for workers with a
  shell alone. Not kept: a claim makes a tree, which a shell alone does
  not, and the task's directory holds the record of its tree between
  claims, so the claim is its file, created with exclusive create.
- **A hosted tracker (Jira, Linear).** Not chosen: a dependency and an
  account outside the repository for every worker, and the same missing
  file scope.
- **Keeping it in the coordinator's conversation.** Not chosen: lost with
  the conversation, invisible to other tools' agents, and not checked.

## Not verified

- That Antigravity and Cursor read `AGENTS.md` as their documentation
  states was read from the two pages named above and not tried in either
  tool.
- Git across machines: nothing of it has run, since nothing is pushed.
