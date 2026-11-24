---
status: draft
---

# RFC 0001: agentree

A draft for the owner to judge. Each claim about a tool or about git names
where it was read in [Verified](#verified); what was not checked is in
[Not verified](#not-verified). Nothing here is decided until the owner
accepts it; [The owner's answers](#the-owners-answers) holds what is
answered, and [the questions](#questions-for-the-owner) what is not.
Nothing is built before the RFC is accepted.

## The problem

AI coding agents of different tools, and people, work on one repository at
once. Without a shared, enforced way of working they overwrite each
other's files, check half-made changes, accept their own work and leave
nothing for the next worker when they stop. [`docs/origin.md`](../../docs/origin.md)
lists what that cost in practice.

## What the owner asked for

1. **A kickstart.** One command of a CLI sets a new project up; after it,
   agents of any tool start working with no further setup. The UI does
   the same: it makes the folder and sets it up, by that command.
2. **Cloning an interface, as an option of the kickstart.** The UI asks
   whether the project reproduces the interface of a site. When it does,
   the project follows the way the origin reproduced its reference
   application: every value read from the running site in Chrome, none
   guessed, and a comparison that holds the build to 100%.
3. **Every tool, side by side, in parallel, without conflict, using what
   git gives:** several Claude Code CLI sessions (each on its own
   account, possibly on one machine), Claude Desktop, Cursor, Codex,
   Antigravity, and a person.
4. **A web UI to track the work:**
   - the tasks a piece of work is broken down into;
   - each task's status, live: a person changes a task in the UI, an
     agent changes it by working, and both show on the board at once;
   - a long-term memory of the project;
   - options, among them a switch per tool for whether that tool may
     start an agent that reviews a task the same tool built;
   - the machine's slots: how many there are, set in the UI, and which
     task each one is running now;
   - a question an agent has for the owner, read and answered on the
     task's card.
5. **As many agents as the machine can carry, and no more.** An agent
   that starts agents starts as many as the machine's load admits, by a
   rule of the project's prompts and skills, not by a monitor; heavy runs
   (an end-to-end suite) at one moment follow the load as it is
   measured, not a fixed number.
6. **Any repository** can use it, not only the one it was built in.
7. **Whatever else an agentic coding platform needs**, proposed here
   ([What else it has](#what-else-it-has)).

## The parts

| Part             | What it is                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The core         | Every rule of the board: tasks, claims, scope, review, landing, memory, questions. A library with no knowledge of a project or of a tool.           |
| The command      | `agentree <subcommand>`: the core on the command line. An agent with a shell and a person use it.                                                   |
| The daemon       | `agentree serve`: one process a machine, for every project registered on it. It serves the UI, pushes changes, serves MCP, and runs checks and landings in order. |
| The MCP server   | The core as MCP tools, for a session whose sandbox or tool keeps it from running the command or from writing where the board is.                    |
| A project's part | `agentree.config.*` in the repository: its checks, how a check is narrowed to a change, which checks are heavy, how a tree is set up.               |
| A tool's part    | What `agentree init` writes for each tool: its rules file, its MCP entry, its hooks.                                                                |

**agentree starts no agent.** The owner works with the tools as they
are, Claude Code, Claude Desktop, Codex, Cursor and Antigravity; an
agent in one of them takes work from the board and may start agents of
its own (subagents, or sessions of its tool), as a coordinator of the
origin did. How it does so is in the project's rules and skills, which
`init` writes ([The skills of a project](#the-skills-of-a-project)). The
UI shows the work, sets a project up, and holds what only the owner
does; it has no chat with an agent and starts none.

The UI holds no rule. Every write, from the UI, from MCP and from the
command, is one call of the core, made by the daemon: it is the one
writer of the board, so two writes never meet and the UI learns of each
from the process that made it.

## How it runs

agentree is installed and run with Docker Compose (`compose.yaml`), and
needs nothing else on the machine but git and the agents' own tools.

| Where                       | What                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The `agentree` container    | The daemon: the core, the UI, MCP over streamable HTTP, the queues. Its port is published on `127.0.0.1` only.                     |
| A project's containers      | The project's toolchain, from an image its part names. Every install and every command of the project runs in one, in its tree.   |
| The directory of projects   | One directory of the host, named once, mounted into the container at the same absolute path, so that a path means one place to both. |
| The host                    | The agents' tools and the owner's browser. A tool reaches the board by MCP at the loopback address.                               |
| The host's `agentree`       | A small script `init` writes: it passes its arguments to the command in the container. Hooks and people use it.                   |

- **Git's links are relative.** A worktree made with `--relative-paths`
  keeps working when the repository is seen at another path; one made
  without it does not (tried). The same path on both sides and relative
  links are both kept, so that neither alone is relied on.
- **The daemon does not rely on file events.** Node's documentation says
  watching is unreliable on a host's files seen through Docker. Every
  write of the board is the daemon's own, so it tells the UI itself; an
  edit by hand of a board file is found by reading the files' times on a
  period.
- **The project's commands run in its container**, never on the host:
  an install of a tree, a check of a submit, a sweep, and every command
  an agent runs that needs the project's toolchain, which it runs as
  `agentree run -- <command>` (or the MCP tool of that name) in its
  tree. The run goes through the queue when it is heavy and starts at
  once when it is light. The reasons:
  - **One place for the work, so one place to measure and bound it.** A
    run in a container of its own is held to the processors and memory
    it is given, and the system counts what it took (below).
  - **The same toolchain for every agent of every tool**, whatever each
    has installed on the host, and on Linux, as a project's CI usually
    is.
  - **A sandbox does not stop it.** Codex keeps its network off and
    `.git` read-only; Claude Code's sandbox writes only where it is
    told. A command run by the daemon through MCP is outside both.
  - **Its ports and services are its own.** A tree's servers listen
    inside its container, so two trees' servers never meet on one port
    of the host.
- **What it costs.**
  - The project gives an image with its toolchain; `init` writes one
    from what it finds in the project's manifest, for the owner to
    change.
  - A tree's dependencies are in a volume of its container and not in
    the tree on the host: Docker's documentation says a mount shared
    with the host is slower for such directories, and a module built for
    Linux does not load on macOS. So an editor on the host, and an agent
    reading a library's sources, do not find them there; `agentree run`
    is the way to them.
  - The daemon starts the project's containers, so it is given Docker's
    socket: whatever reaches the daemon can start any container. Its
    port is on the loopback address and asks for its token for that
    reason.
  - Docker Desktop runs every container in one virtual machine with a
    share of the host that its settings give: on this machine 14
    processors and 7.7 GiB of memory, of a host with 48 GiB. The heavy
    runs of a project are bounded by that share, so `agentree doctor`
    tells the owner when it is smaller than the project's runs have been
    measured to need.
- **Where it was answered**: [question 1](#the-owners-answers), left to
  this RFC by the owner.

## Where the board lives

A task's tree is a checkout of a branch, so a file of the board inside it
is a copy as old as its commit: the origin saw a board per worktree
answer `no task` for a task written after the commit
([`worktrees.md`](../../seed/aep/docs/engineering/worktrees.md), "A board
per worktree"). The board is therefore in two places, neither of them a
task's tree and neither of them `main`:

- **What a task is** is a file on a branch of its own,
  `agentree/board`, which shares no history with `main`
  (`git worktree add --orphan`), checked out once, beside the trees:
  `work/tasks/T-NNNN-*.md` (its fields, Context, Done when, Out of
  scope, Log, Questions), the memory under `work/memory/` and the
  options. The daemon commits each write there, so the board's history
  is git's. `main` and every task's branch hold no file of the board, so
  a landing never meets one. The branch is pushed only by the owner.
- **What is true of this machine now** is under the repository's git
  common directory, `<git-common-dir>/agentree/`, which every worktree of
  the repository shares and no commit holds: the claims and their beats,
  the review marks, the slot queue, the landing queue, each session's
  identity. A beat writes a small file there and commits nothing.

An agent in its tree has no file of the board to read: it reads its task
through the command or MCP, which is also the only way it writes one.

As built: the board's checkout is `<repository>-trees/board`, beside the
main checkout, and a task's tree is `<repository>-trees/T-NNNN`. The
machine's state holds `claims/T-NNNN.json` and `reviews/T-NNNN.json`
(the worker, its session, since when, its last beat, and for a claim the
tree, the branch and the base), the lock of a board write, and the
owner's token. The board's git reads neither the user's nor the
system's configuration, so that a person's signing, hooks path or ignore
file changes nothing of it.

## A task

The origin's task file ([`schema.json`](../../seed/aep/work/schema.json))
with these changes:

- `parent`: the task this one is a part of, so that a breakdown is a
  tree. A parent is done when its parts are.
- `claim` and `review` leave the file for the machine's state (above);
  the file keeps `status` and, in the Log, who did what and when.
- `worker` names every tool: `claude-code`, `claude-desktop`, `cursor`,
  `codex`, `antigravity`, `person`.
- `created`, the time it was written. The time in each status is read
  from the Log: a change of status writes an entry whose first line is
  `Status: <from> -> <to>.`, and a Log heading holds its time to the
  second (`### YYYY-MM-DD HH:MM:SS, <worker>`, UTC).
- Two sections more, before the Log: `## Subtasks`, a checklist, and
  `## Questions`, each question under a heading as a Log entry's, its
  choices in a list under `Choices:`, and the owner's answer under
  `#### Answered YYYY-MM-DD HH:MM:SS`.
- The kinds `review` and `assets` beside the origin's.
- Two statuses more:

```
backlog ─▶ ready ─claim─▶ in-progress ─submit─▶ checking ─pass─▶ review ─accept─▶ accepted ─land─▶ done
                              ▲   │                 │ fail          │ reject          │ stale
                              │   └─ask─▶ (waits for the owner)     ▼                 ▼
                              └──────────────◀──────┴───────────────┴─────────────────┘
```

- `checking`: the task's checks run in the daemon's queue after `submit`
  returns, and the worker takes its next task. The task's paths stay
  held. The origin designed this and did not build it
  (`design/async-checks.md` there).
- `accepted`: reviewed, waiting for its turn to land. `done` means its
  change is on `main`.

As built: a submit is refused before any check runs for a missing Log
entry, a change not committed, a file outside the task's paths, no
change at all (build and fix) or a conflict with what landed. A failing
check gives the task back to its worker, in progress and still held; a
rejection and a landing that is sent back make it `ready`, with its tree
and branch kept for its next claim. The machine's state also holds the
submission (who built it, the commit that was checked, its base) and the
result of each check. Until the daemon's queue runs them (step 10),
`agentree submit` runs the checks before it returns, by the shell, in
the task's tree. A landing makes ready each backlog task that waited
for it and now waits for nothing, and done the parent whose parts are
all done. `agentree commit` commits under the worker's name.

## A worktree a task, and what git is used for

| Need                                         | What git gives                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers do not see each other's half changes | `git worktree add -b task/T-NNNN <trees>/T-NNNN main` at the claim. A branch is checked out in one worktree only; git refuses a second.           |
| A tree is not removed under its worker       | `git worktree lock --reason` at the claim, `unlock` at its end.                                                                                   |
| What a task changed                          | `git diff --name-only <base>` in its tree, with the files git does not know. The base is recorded at the claim.                                   |
| Two tasks will conflict                      | `git merge-tree --write-tree main task/T-NNNN` exits 1 and names the files, and touches no tree. Run at submit and again before landing.          |
| `main` moved since the base                  | `git merge-base --is-ancestor main task/T-NNNN` exits 1.                                                                                          |
| Landing                                      | `git merge --ff-only task/T-NNNN` in the main checkout, one at a time; it refuses anything but a fast-forward.                                    |
| History and recovery                         | The worker commits on its branch in its tree; a session that stops leaves commits, and what is uncommitted stays in the locked tree for the next. |

The claim still refuses a task whose `writes` overlap a held task's:
overlap is refused before the work, and `merge-tree` finds what the
declared paths did not foresee.

Nothing is pushed, fetched or named as a remote by the tool.

There are trees only: no shared checkout, and none of the origin's
modes. In a tree the record of hashes of the origin (T-1059 there) is
not needed: the base tells the change whatever is committed since. The
guard on an empty submit stays. A repository with no commit gets its
first from `init`, since a tree is made only from a commit.

**A stale change.** With N workers and one `main`, every landing but the
first of a round is stale. The origin's answer was to refuse it back to
its worker and review it again; its own board, without trees, already
has 187 of 553 submitted tasks submitted more than once. Here the lander
rebases the accepted branch onto `main` in a landing tree of its own
when `merge-tree` reports no conflict, and runs the task's narrowed
checks on the result. When the rebase changed no file of the task (the
task's own diff is the same before and after), the review stands and
the change lands. When it changed one, the task goes back to review
with the difference shown. A conflict goes back to the worker.

**A tree's setup.** The project's part names the commands that make a
new tree runnable (an install, a copy of ignored files it lists) and the
ports and names a tree gets from its seat. Each tree has an install of
its own; the origin measured one at 51 s and about 2 GB. A clone of the
dependencies by the file system is not faster: 70 s for the origin's
2.4 GB, and 40 s to remove it (tried, [Verified](#verified)). So the
install starts at the claim and runs while the agent reads its task,
with the package manager's cache shared by every tree, and a tree's
removal runs in the background after its landing. A pool of trees kept
and reused is not built: what one task left would reach the next.

## The tools

What each tool gives, as its documentation says today:

| Tool                   | Rules file it reads                                           | MCP, set in the project               | Hooks                                         | Headless run        | Several accounts    |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ------------------- | ------------------- |
| Claude Code            | `CLAUDE.md`; `AGENTS.md` when there is no `CLAUDE.md`         | `.mcp.json`                           | `PreToolUse`, `Stop`, `SessionStart`, others  | `claude -p`         | `CLAUDE_CONFIG_DIR` |
| Claude Desktop (Code)  | The same files as the CLI                                     | The same, and its own desktop config  | The same                                      | None: interactive   | Not verified        |
| Cursor                 | `AGENTS.md`, `.cursor/rules/*.mdc`                            | `.cursor/mcp.json`                    | `.cursor/hooks.json`: `preToolUse`, `stop`... | `agent -p`          | `CURSOR_CONFIG_DIR` |
| Codex                  | `AGENTS.md` from the root down to the directory               | `.codex/config.toml`, trusted project | `.codex/hooks.json`: `PreToolUse`, `Stop`...  | `codex exec`        | `CODEX_HOME`        |
| Antigravity            | `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md`                | `.agents/mcp_config.json`             | `.agents/hooks.json`: `PreToolUse`, `Stop`... | `agy -p`            | Not verified        |

What follows from it:

- **One source of rules.** `AGENTS.md` holds the rules; `CLAUDE.md` holds
  the line `@AGENTS.md`. No other rules file is written, so none can
  contradict it.
- **A sandbox decides which way in a session uses.** Codex in
  `workspace-write` keeps `.git` read-only, and, for a linked worktree,
  the git directory it points to: a Codex worker in its tree cannot
  commit and cannot write the machine's state by itself. Claude Code's
  sandbox allows writes to the shared `.git` from a linked worktree, and
  not to a sibling directory unless it is added. So every tool is given
  the MCP server, which runs outside the session's sandbox, and the
  command where the tool can run it; `agentree commit` through MCP makes
  the commit for a session that cannot.
- **The tools make worktrees of their own**, each in its own place
  (Claude Code under `.claude/worktrees/`, Cursor's CLI under
  `~/.cursor/worktrees/`, Codex under `$CODEX_HOME/worktrees` on a
  detached `HEAD`). agentree makes the tree and the session is started
  in it; a tool's own worktree mode is left off.
- **Hooks hold what a brief can only ask for**, where the tool has them:
  a hook before a tool call refuses an edit outside the task's `writes`
  at the moment of the edit, not at the submit; a hook at each call
  beats the claim; a hook at the stop writes a Log entry of what the
  session's tree holds. A tool without the hook is held by the scope
  check at the submit, as in the origin.

## Who a worker is

A worker's name is `<tool>/<model>[-suffix]`, given by the session, and a
name alone can be changed. The claim therefore also records the session:
`CLAUDE_CODE_SESSION_ID` in Claude Code's subprocesses, and the session
or conversation id that Codex, Cursor and Antigravity give their hooks.
A session holds one task at a time; two sessions of one account are two
workers.

This is a record, not a wall: every session of one machine runs as one
user of the operating system and can write the same files. What is the
owner's alone (accepting a `decision`, answering a question, changing an
option) is asked of the daemon with the owner's token, and the command
without that token refuses it.

## Review, and the switch for a tool's own tasks

- A session never reviews the task it built: it holds the builder's
  reasons and reads its own change with them.
- An option per tool, set in the UI: **may this tool start a reviewer
  for a task the same tool built.** Off, a task is offered for review
  only to another tool. On, the tool may start a new session
  as the reviewer, with the reviewer's brief and nothing of the builder's
  conversation.
- The options are a file of the board, `work/options.yaml`, changed
  through the command (`agentree option`) with the owner's token, and
  the Log of a review says under which option it ran.

"Its own" is told by the tool, whatever the model: while the switch is
off, no session of Cursor reviews a task a session of Cursor built.

## A question for the owner

`agentree ask T-NNNN` (text on stdin, choices optional) writes the
question into the task's `## Questions` section and marks the task as
waiting for the owner; its claim and its paths stay held. The card shows
the question; the owner answers on it (`agentree answer`, with the
owner's token), and the answer is written under the question with the
time. A session that still runs reads it with `agentree wait T-NNNN`; a
session that stopped left the question in the file, and the next worker
reads question and answer in the brief its claim prints. The origin has
43 tasks that need the owner, 27 of them ready and waiting.

## The breakdown

The skill `agentree-plan` holds the planner's brief. An agent given a
goal (an RFC, a step, a card the owner wrote) and told to break it down
follows it: tasks of one session each, their `writes` not overlapping,
their `depends-on`, their checks and Done when, written through the
command as `backlog` under one parent. The owner moves them to `ready`
on the board, or all at once. The UI shows a parent with its parts and
how many are done, and the tasks as a graph of what waits for what.

## The memory of a project

What a session learns is lost with it unless it is in the repository,
and a tool's own memory is read by that tool alone: the origin found the
owner's standing rules in one assistant's private notes
(RFC 0006 there, "Motivation").

- `work/memory/` holds one Markdown file a fact, with a kind (`agreement`
  the owner's standing instruction, `decision`, `pitfall`, `how-to`),
  the paths it is about, and the task it came from.
- `agentree remember` proposes a fact from a session; an `agreement` is
  written by the owner only, and any other kind is accepted by a
  reviewer with the task it came with.
- The brief a claim prints holds the agreements, and the facts whose
  paths overlap the task's `writes`. `agentree recall <words>` and the
  MCP tool search the rest.
- The UI lists, edits and retires them.

As built: a fact's file holds its kind, title, state (`proposed`,
`in-force`, `retired`), paths, task, who wrote it and when, then its
words. A worker's fact is proposed and is put in force by the owner or
by a worker other than the one that proposed it; the owner's is in
force at once. A claim or a review mark is stale after 30 minutes
without a beat.

Plain Markdown files and a search of their text. No open-source memory
for agents is taken as the store: those read keep their facts in a
database no person reviews in git (mem0, Graphiti, cognee, MemOS,
claude-mem, Beads), or need a model's key to work at all (mem0,
Graphiti, memU, LangMem). The nearest, basic-memory, is Markdown with an
index beside it, the form chosen here; it is not taken because of its
licence (AGPL-3.0), its age (1.0.0 of 2026-10-29) and a grammar of notes
that is not a fact tied to paths and a task. Reading a thousand files
takes a tenth of a second ([Performance](#performance)), so the search
reads the files; an index made from them (SQLite's full-text search,
then vectors from a model run on the machine) is added when the search
is slow or misses, and is never the source.

## The UI and the daemon

- **The board.** A column a status. A card: the title, the holder and
  its tool, the last beat, the tree and branch, the checks running or
  their place in the queue, a mark for an open question and for a stale
  claim.
- **A card opened.** Its fields (kind, priority, parent, RFC,
  dependencies and their state, `writes` and `appends`, checks), Context,
  Done when, Out of scope, the Log, the questions and their answers, the
  tree and branch with its base, the diff against the base, the result of
  each check with its time and its wait, the review and its findings, the
  facts of memory it was given, and its time in each status.
- **The sessions of a card.** A row for each session that worked on the
  task, as builder or reviewer: the tool, the model (and each model it
  changed to), when it started and ended, and what it used: tokens by
  kind (input, cached input, output, reasoning) and the cost, as its tool
  reports them. The sums are shown by role (building, reviewing, work
  done again after a rejection or a stale landing) and for the task. A
  value the tool did not report is shown as not known, never estimated,
  with the reason. The Numbers page sums the same over tasks, tools and
  days.

  What each tool reports, as its documentation says:

  | Tool        | The model                                                                  | Tokens and cost                                                                                                       |
  | ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
  | Claude Code | `SessionStart` hook, "not always"; `PostModelSwitch` on a change; the status line's `model.id`; `system/init` of a headless run | Headless (`--output-format json`): usage, `total_cost_usd` and a cost by model, estimates of the client. Interactive: the status line's `cost.total_cost_usd`, the session's estimated cost; its token fields are the context window's, not the session's use |
  | Codex       | Its hooks' input has `model`                                                | Headless (`codex exec --json`): `usage` of each `turn.completed` (input, cached input, output, reasoning). Interactive: not documented |
  | Cursor      | Its hooks' input has `model`; `system/init` of a headless run              | Not documented on the page read                                                                                       |
  | Antigravity | Its hooks' input has `modelName`; `init` of a headless run, when set       | Headless (`--output-format json`): `usage` (input, output, thinking, cache read, total). Interactive: not documented  |

  So a session an agent starts headless through `agentree agent --
  <the tool's command>` (below) reports its use in full, but Cursor's; a
  session a person starts reports its model through its hooks, and its
  tokens are mostly not known. Claude Code's status line,
  which `init` sets to a script of agentree's that also prints what the
  owner had there, sends the model and the estimated cost on each update.
  Reading a tool's own transcript files would give more, and is not done:
  their form is no documented interface.
- **Where it is kept.** Each session's record is a file of the board's
  branch beside its task (`work/usage/T-NNNN.jsonl`), written by the
  daemon when the session reports and when it ends, so it has the
  board's history.
- **The slots.** A row a run: the task it runs, the worker, the
  command, since when, what it takes of the machine, and its seat's
  ports; below them the queue in its order, each entry with how long it
  has waited and why. The number of runs follows the load
  ([Following the machine's load](#following-the-machines-load)); the
  owner sets its bounds there, holds it fixed, ends a run or moves a
  waiting one first. The bounds are the machine's, kept in its state
  and not in the repository: two machines differ.
- **Progress.** A page that answers "how far along is the project", as
  the owner asks it of agents in chat today, read from the board and
  never estimated:
  - **Done over the whole**, by kind (build, fix, research, decision,
    measure) and in all: tasks `done` over every task that is not
    `dropped`, with the share. `accepted` and `review` are shown beside
    `done`, not counted in it: done means landed on `main`.
  - **By RFC and by parent**: each RFC's and each breakdown's tasks done
    over its whole, so that "the feature of RFC 0013" has its own share.
  - **Done and scope over time**, one line each (a burn-up), by day. The
    share alone misleads: in the origin it fell from 54% to 50% on a day
    on which some 60 tasks were done, because about 190 were added. The
    two lines show which moved.
  - **Today**, or since a time the owner picks: the tasks landed, grouped
    by RFC and parent, each with its title; the tasks added, each with
    the task or RFC that filed it; the RFCs and ADRs accepted.
  - **The rate**: tasks landed and tasks added a day, over the last week.
    While more land than are added, the page says when the open tasks
    would be done at that rate, as a projection and labelled so; while
    more are added, it says so and projects nothing.
  - A share of the product "usable from end to end", which an agent
    gives in chat as its own guess, is not shown: nothing on the board
    measures it. A project that wants it names its measure (the steps of
    an RFC done, the flows of its end-to-end tests that pass), and the
    page shows that measure.
  - The history is read from the board's branch: each write is a commit
    there, so the board of any past day is in git, and the daemon keeps
    each day's counts once it has read them.
- **Documents.** A page that reads the project's RFCs and ADRs, and
  changes none. A list of each, with its number, title, status (draft,
  accepted, superseded) and date, read from its front matter or its
  heading, and a search of their text. One opened shows its Markdown
  rendered, with its table of contents, its links to other documents
  opened in the page, and the tasks whose `rfc` field names it, each
  with its status. An ADR that supersedes another links both ways. It
  reads the files of `main` in the main checkout, so it shows what has
  landed; a document still on a task's branch is shown on that task's
  card, as part of its diff. Rendered Markdown is shown as text and
  markup only: no script and no HTML of the file runs. The directories
  are `rfcs/` and `docs/adr/` unless the project's part names others.
- **What a person does.** Creates and edits a task, drags it between
  backlog and ready, sets its priority, answers a question, releases a
  stale claim, changes an option, sets the slots, edits memory. The
  review is an agent's and the landing the lander's
  ([The owner's answers](#the-owners-answers)).
- **Live.** The daemon keeps the parsed board in memory, and sends each change to the browser as a
  server-sent event; a write by the UI is a call of the core, and shows
  through the same event.
- **The first version reads only.** It shows the board, the cards, the
  slots, the questions, the memory, the progress and the documents,
  live, and changes nothing; every
  write is the command's. The writes from the UI come after.
- **Safe.** The daemon runs commands of the repository, so it listens on
  the loopback address only, asks every request for a token it wrote
  into the machine's state, and refuses a request whose `Origin` is not
  its own. Text an agent wrote (a Log, a question, a diff) is shown as
  text, never run as markup, and is never an instruction to the daemon.

### How it looks

The owner gave a picture of an interface to follow (a screenshot of a
dashboard of another product, given in chat on 2026-11-22; not kept in
the repository). What the picture shows, and what each part holds in
agentree:

| In the picture                                                       | In agentree                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A light page on a soft grey ground, the content on one rounded sheet | The same frame for every page                                                                         |
| A side bar: at its top a switch of workspace with a mark and a name  | agentree's mark and the machine; the projects are a section of their own (below)                      |
| Search with its key hint, and an inbox with a count                  | Search of tasks and memory; the inbox is the questions that wait for the owner, with their count      |
| A list of pages, each with an icon, the open one filled, counts      | Board, Progress, Tasks, Slots, Review, Memory, Documents, Agents, Numbers; counts of what waits, a red dot where it is old |
| Folders that open                                                    | The projects of the machine, each with its open tasks, "New project", and all of them; the current one open on its claimed tasks, each with its status and its tool (a second picture the owner gave, 2026-11-23). The parents of a breakdown are a filter of the list |
| A card near the foot with one dark button                            | The planner: "break a goal down"                                                                      |
| Settings, help, and the person at the foot                           | The options, the documents, the owner                                                                 |
| A top bar: the page's name, a counted notice, a bell, a dark mode    | The page's name, the notices, the switch of mode                                                      |
| A title with a line of totals, and two buttons, the main one dark    | The project's name with its totals; "New task" the dark one                                           |
| Four cards of one number each, a line under each                     | In progress, in review, waiting for the owner, landed today; under each its change                    |
| Tabs with counts, a search, three filters                            | A tab a status with its count; filters by tool, kind and parent                                       |
| A table: a picture and two lines, a badge, a bar with a number       | The list of tasks: the tool's mark, the title and id, a badge (stale, question), the checks as a bar  |
| Pages at the foot                                                    | The same                                                                                              |

The board is a second view of the same list, a column a status, chosen
by a switch beside the tabs (List, Cards) and kept by the browser. Its
look follows a third picture the owner gave on 2026-11-23: a column with
its status's ring, its count, the tools working in it, and "+" where a
task starts (backlog, ready); a card with its priority as bars, its id,
"Working" with the tool's mark while it is claimed, its title, its
worker, and the time of its last beat or of its status.

A task opened, from a row of the list or a card of the board, is a
panel on the right of the frame (the owner's answer of 2026-11-23); the
page beside it keeps what fits its width, and on a narrow screen the
panel covers the page. It holds what [a card opened](#the-ui-and-the-daemon)
names: at its head the kind, id, title, status, priority, the marks of
a question and of a stale claim, and the holder with its last beat;
then four sections. Overview has the questions and their answers, the
fields, Context, Done when, Out of scope, the tree, branch and base
with the diff by file, the review, the facts of memory it was given,
and its time in each status. Checks has each check's result, its time
and its wait for a slot. Sessions has each session with its tool, its
models, its tokens by kind and its cost, the sums by role, and "not
known" with the reason where a tool does not report them. Log has the
Log. It slides in from the right and slides back out when it shuts:
by Escape, the close button, a second click on the task it shows, or a
click anywhere outside it; a click on another task shows that task.

Items of a list or a board appear, the first time they are shown, by
fading in and rising a little, one after another (the owner's answer of
2026-11-23, for every page). A timeline, such as a task's Log, draws
itself from the top: a node and its text, then the rail down to the
next. Nothing moves for a person whose system asks for reduced motion.

The dark theme has the same structure as the light and takes its
colours and the shapes of its boxes from a fourth picture the owner
gave on 2026-11-23: a ground near black, the frame edged a shade
lighter, the side bar flush with the frame and parted from the page by
a line, the current item and the search outlined, boxes of a dark grey
with a thin line and no shadow, a kind's mark a filled tile of its hue,
and a badge outlined in its own tone. Every page, the top bar and the
side bar share one neutral scale with the Home page (the owner's answer
of 2026-11-24): the page and the top bar `#0b0b0c`, the side bar
`#09090a`, a card or a panel `#131315`, a drawer, a dialog or a menu
`#161618`, lines `#2a2a2f` and `#3a3a40`, so a box stays apart from the
ground by its shade and a brighter edge; the side bar's pages are
written in the text's full white. Its main button is amber, a pill
36 pixels high, filled from `#d7b075` to `#d3a969`, its text `#0d0e12`,
with a glow of its own colour, pressed `#be985f` (values the owner gave
on 2026-11-23); the light theme's main button stays as it is. A row of
tabs, and the side bar's pages from Inbox to Help, move their
highlight to the item chosen, in both themes. The search is the top
bar's alone; the side bar has no search of its own.

**No element is misaligned, overlaps, or is out of proportion.**
agentree's UI is held to the rules of
[visual quality](./standard/non-functional.md#visual-quality), the same
a kicked-off project starts with, by the audit of rendered pages and
the screenshots those rules name. A throwaway prototype built on
2026-11-23 showed two of their classes, and the owner asked that no
interface of agentree or of a project it starts has them:

- a native select beside the design's controls, its text sitting low and
  its chevron the browser's own (native controls take the design);
- the mark under the current page of the side bar drawn some 14 pixels
  below its item: the item's offset was measured from the side bar's
  box, which includes its padding, and applied from inside that padding
  (one coordinate system).

Nothing of the prototype was looked at in a browser before it was shown;
the rule "a look before submitting" is there for that.

The UI follows the picture in its structure and in its look: the frame
and its panels, the trays that hold a white card, the controls, the
type's weights and the palette's roles (the owner's answer of
2026-11-23). Its content is agentree's, and no name, text, mark or
picture of the product it shows is taken. A picture is no measure: each
size and colour is matched to the picture by eye, none was read from a
running page, so the values are the UI's own tokens. They are settled
on a first page, built and shown to the owner, and what the owner
accepts is written down as the UI's tokens before any other page is
built.

## Checks

- **The queue of the machine.** The origin's slots, held by the daemon. A
  check names what it takes (a slot, and any resource only one run may
  hold, such as a fixed port), which the project's part declares.
- **A slot is told what it holds.** The origin's ticket already records
  the worker, the task, the command and the process; the board's row of
  a run is that record. The origin reads the number of slots from a
  variable of each command's environment (`AEP_CHECK_SLOTS`); here the
  controller decides at each grant.
- **Narrowing** is the project's: given the files a task changed, which
  commands run. The origin's narrowing is about a thousand lines about
  one repository's packages; the core only asks for it.
- **A sweep** of the whole tree on `main` after landings finds what two
  changes break together.

## Following the machine's load

The origin's lesson: machine load makes tests flaky, and its answer was
a fixed number of slots (half the cores by default, three in use on 14
cores), for which its own design says no evidence was taken. Its submits
waited 17 hours in all for a slot, and five checks ran into their bound.
A fixed number is too many when the runs are heavy and too few when
they are light.

**What is admitted.** Heavy runs (a check or a command that takes a
slot), by the queue in the daemon. Agents are not started by agentree;
how many an agent starts is the agent's to decide, by the rule its skill
gives it and the numbers the command tells it (below). Nothing watches
the agents.

**What is measured.**

- The machine: the share of the processors in use and the load average
  against the number of processors, the memory free, and where the
  system gives it, how long work stood waiting for a processor, memory
  or the disk.
- Each run: its time, the processors and the memory it took at its
  peak, written with its command and kept as that command's cost. A
  heavy run is a container of its own, so the system counts this for
  it alone: the time of the processors it used (`cpu.stat`), its peak
  of memory (`memory.peak`), and how long it stood waiting for a
  processor or for memory (`cpu.pressure`, `memory.pressure`). It is
  also held to what it was given (`--cpus`, `--memory`), so a run that
  needs more than it was told cannot take it from the others. A command
  not yet seen is given the cost of the heaviest.
- Each check's history: one that fails beside other runs and passes
  alone is marked as sensitive to load, with the runs it failed beside.

**How the queue decides.**

- A heavy run starts when its command's cost fits in what is free now,
  with a margin kept free. The number of slots is therefore not a
  setting: it is what fits. Light runs many at once; an end-to-end suite
  that takes half the machine, two.
- A run is told how many workers it may start, from what is free when
  it starts, as the origin tells a check `AEP_CHECK_WORKERS`.
- A check marked as sensitive to load runs with nothing heavy beside
  it.
- It moves gently: it adds while the machine stays under its mark for a
  time, and stops adding at once when it goes over. Nothing running is
  ever ended to make room; a run ends only at its bound.
- Order stays: the first to ask is the first to run, but for a run that
  fits while the one before it does not, which goes ahead when it will
  not delay that one.

**What an agent is told.** `agentree load` (and the MCP tool of that
name) answers in a few lines: the load of the host and of Docker's
virtual machine, the heavy runs running and waiting, the cost of the
heaviest checks of the tasks that are ready, and from them how many
more workers the machine can take now and why. The skill of a
coordinator says: before starting a worker, ask; start no more than it
says; start none while heavy runs wait; ask again before the next. A
claim also says when the machine is past its mark, so a worker a person
started learns it too. The rule is the agent's to keep, as the owner
wants it, and the queue still bounds what they run whatever they do.

**What the owner sets and sees.** The lowest and the highest number of
heavy runs, the margin, and a switch to hold the number fixed. The
Slots page shows the load over time, what runs and what it takes, what
waits and why (no room, its turn, sensitive to load), and each decision
of the queue with its reason.

**Two loads, both read.** A container sees the load of Docker's
virtual machine, not of the host: read in the same minute on this
machine, a container's `/proc/loadavg` gave 3.5 and the host's 34.8,
on 14 processors each. The host carries the agents' tools, the owner's
browser and whatever else runs there, and its processors are the ones
the virtual machine runs on. So both are read: the virtual machine's
from the system, and the host's by the host's script, which reads
`sysctl vm.loadavg` and the memory and sends them with each call it
passes on. Agents call it at every claim, beat and run, so the reading
is as fresh as the work. A heavy run starts only when both have room;
with no reading of the host for a while, the queue admits no more than
the lowest bound.

## The skills of a project

What an agent of any tool has to remember is written into the project
at its kickstart, in two forms:

- **The rules**, in `AGENTS.md`, read by every tool at every start:
  taking work, never reviewing one's own task, running the project's
  commands through `agentree run`, asking `agentree load` before
  starting a worker.
- **Skills**, each a directory with a `SKILL.md`, the open form Claude
  Code, Codex, Cursor and Antigravity all read, and each tool may load on
  its own when a task fits the skill's description, or when asked by
  name. Codex, Cursor and Antigravity read `.agents/skills/`; Claude Code
  reads `.claude/skills/`. `init` writes them once in `.agents/skills/`
  and the same files into `.claude/skills/`, both from agentree's
  templates, and a check of `agentree doctor` says when the two differ.

| Skill                  | What it holds                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentree-coordinate`  | The coordinator's brief: which ready tasks to hand out, to which tool; starting workers, each in its task's tree, no more than `agentree load` admits; following them on the board; landing.          |
| `agentree-plan`        | The planner's brief ([The breakdown](#the-breakdown)), and the ADR of the stack when the owner left it to an agent ([The stack](#the-stack)).                                                         |
| `agentree-measure`     | For a project that clones an interface: the measure task's way, the record's form, the rules of the reference ([Cloning an interface](#cloning-an-interface-from-a-site)).                          |
| `agentree-grab-icons`  | For the same: prepares the folder of a run of the icon template; it fetches nothing ([The drawings](#the-drawings)).                                                                                  |

### Skill, agent of its own, or session of its own

Each role is put where what it needs is given. What each tool's
documentation says of the two forms:

- **A skill** loads into the session that uses it, with all that session
  holds: its conversation, the project's rules, its tools, the owner to
  talk to. It costs nothing until it is loaded.
- **An agent of its own** (a subagent defined in the project) starts with
  a fresh context, without the conversation, and returns a summary to
  the session that started it. In Claude Code it still loads the
  project's `CLAUDE.md`, it cannot ask the owner (`AskUserQuestion` is
  removed from every subagent), and it inherits the session's MCP tools;
  it can start subagents itself, up to three layers. Cursor, Codex and
  Antigravity give a subagent its own context too; whether it loads the
  project's rules, and whether it can ask the owner, their pages do not
  say. The definitions are files of the project: `.claude/agents/*.md`
  (Claude Code, and Cursor), `.codex/agents/*.toml` (Codex, and
  Cursor), `.agents/agents/*.md` (Antigravity).
- **A session of its own**, opened in another folder, holds nothing of
  the project but what that folder gives it, and talks to the owner.

**The coordinator is a skill**, invoked by name in the session the owner
talks to, and never loaded on its own:

- it talks to the owner for the whole round (a hand-over to confirm, a
  question to relay), which a subagent cannot;
- it keeps the round's state in its conversation, which a subagent loses
  when it returns its summary;
- a skill is the one form every tool reads alike, so the owner makes a
  coordinator of whichever tool is open;
- a coordinator is chosen by the owner, never by a match of a
  description, so the skill is marked as not loaded by the model
  (`disable-model-invocation: true` in Claude Code and Cursor,
  `allow_implicit_invocation: false` in Codex); whether Antigravity has
  such a mark was not read.

A session started as a named agent (`claude --agent <name>`) was weighed
and not taken: in Claude Code the agent's prompt replaces the tool's own
system prompt entirely, and the other tools do not document the same.

**The worker and the reviewer may be agents of their own**, offered and
not needed. The owner works in each tool as it is, and the tool starts
and manages its own subagents; agentree follows them
([Following the tools' own agents](#following-the-tools-own-agents)).
A subagent of any kind takes work by the rules of `AGENTS.md`, which a
subagent of Claude Code loads. The two definitions add, where a tool
uses them when it delegates:

- each task needs a clean start, without the coordinator's conversation:
  a worker reads its task and its memory from the board, and a reviewer
  must not hold the builder's reasons, which a fresh context gives;
- a worker never needs to talk to the owner in the session: its question
  goes to the card (`agentree ask`), so the lack of `AskUserQuestion` is
  no loss;
- the definition holds what a prompt only asks for: the tools (a
  reviewer has no tool that edits files), the MCP server of the board,
  the model;
- the switch of a tool's own tasks holds: a reviewer started by a
  coordinator of the same tool is that tool's, so it reviews only while
  the owner's switch allows it.

`init` writes `agentree-worker` and `agentree-reviewer` in each tool's
form, from one template each. Nothing of the owner's way of working
changes with them: the owner still talks to the tool, and the tool
still decides when to delegate; a tool that delegates to a subagent of
its own kind is followed the same way. A coordinator may also start a worker as a
session of a tool run headless, to give a task to another tool than its
own; it does so through `agentree agent -- <the tool's command>`, which
asks the load before it starts it, records the session on its card, and
reads its model and its use from the tool's own JSON output when it
ends. agentree starts nothing by itself: the command runs only when an
agent calls it. A worker a person starts, in any tool,
follows the same brief from `AGENTS.md` and the board.

### Following the tools' own agents

Each tool starts and manages its own subagents; agentree does not start
them and does not need to. It follows them by two things every agent
does anyway:

- **Its calls of the board.** A subagent that claims, logs, asks or
  submits does so through the command or MCP, and the claim records who
  it is.
- **The tools' hooks.** Claude Code gives a hook `agent_id` and
  `agent_type` inside a subagent and has `SubagentStart` and
  `SubagentStop`; Codex and Cursor have `SubagentStart` and
  `SubagentStop` (`subagentStart`, `subagentStop`); Antigravity has
  `PreInvocation` and `PostInvocation`, which its page does not tie to
  subagents. `init` sets them to the host's script, which tells the
  board which session started which subagent, when it ended, and on
  which task it worked.

So the worker's identity is the session and, inside it, the subagent:
two subagents of one session are two workers, each with its claim, and
the card shows the session that started them. The UI shows the tree of
sessions and subagents of a task as the tool made it.

**The run of the icon template is a session of its own**, neither a
skill nor a subagent: it must hold nothing of the project, drive the
owner's Chrome, and stop to ask the owner and wait (a sign-in, a button
that changes data, icons of an open-source library). A skill would run
it in a session that holds the project; a subagent of Claude Code loads
the project's `CLAUDE.md` and cannot ask the owner. See
[The drawings](#the-drawings).

## The kickstart

`agentree init` in a directory:

1. Makes it a git repository with a first commit when it is none (a tree
   is made only from a commit), asking first.
2. Makes the board's branch and its checkout (the protocol, the schema,
   empty tasks, memory and options), and writes `agentree.config.*` with
   the checks it found in the project's manifest.
3. Writes each chosen tool's part: the section "Taking work" of
   `AGENTS.md`, `CLAUDE.md` with `@AGENTS.md`, the MCP entry and the
   hooks in that tool's project file.
4. Says what it could not do for a tool and what the person does by hand
   (trusting the project in Codex, approving the MCP server in Claude
   Code).

`agentree doctor` then says, for each tool, whether its session can
reach the board, and by which way in.

### The engineering standard a project starts with

The origin is built as an enterprise application, and its rules say so
in three places: `AGENTS.md` (its seven non-negotiables, its comments
and names, what to do before finishing), `docs/engineering/`
(`code-standards.md`, `non-functional.md`, `system-conventions.md`), and
its ADRs (a modular monolith built for an enterprise, ADR 0006; one
image deployed, ADR 0002). It does not use the words SOLID or clean
architecture; what it holds in their place, read from those files:

- one responsibility per module, a file named after the one thing it
  does;
- logic apart from rendering and I/O, as plain functions with tests;
- interfaces at the seams where an implementation will change, chosen
  in one place;
- dependencies that point one way;
- one interface per package, a module that owns its tables, and nothing
  reached into or copied;
- no speculative generality, and nothing unused;
- the problem solved in the layer that owns it, with a guard so that its
  class cannot come back;
- the non-functional requirements (security, performance, reliability,
  accessibility, observability, privacy, internationalisation,
  upgradability) designed into each change;
- docs that describe the system as it is, in the same change; every
  library on its latest release; a fact verified, never recalled; a
  decision written as an RFC or an ADR before it is built;
- each rule held by a check that fails, not by a request.

None of it reaches a new project today: `init` as designed above writes
only the section "Taking work". So `init` writes it, from a template of
agentree's own made from those files with what is the origin's alone
taken out (Backstage, its reference application, its tenancy by
organization, its UI rules of ADR 0003):

- `AGENTS.md` with the non-negotiables, comments and names, before you
  finish, and taking work; among the non-negotiables, that an interface
  is not done while anything in it is misaligned, overlaps, or is out of
  proportion, and that a task changing it puts its screenshots in its
  Log;
- `docs/engineering/code-standards.md` and `non-functional.md`, whose
  drafts are [`standard/code-standards.md`](./standard/code-standards.md)
  and [`standard/non-functional.md`](./standard/non-functional.md): the
  origin's two pages made free of its stack, with what they lacked of
  SOLID, of clean architecture and of common practice added (the
  layers and the rule of dependencies, ports owned by the inside, one
  composition root, contract tests for every implementation,
  concurrency, persistence, APIs, threat models, budgets, metrics and
  traces, backups, operability, and the visual quality of an interface
  with the audit that holds it), and `system-conventions.md` empty, filled as the project
  chooses its one way for each need;
- `docs/adr/` and `rfcs/` with their templates, and the stack as the
  project's first ADR (below);
- the checks that hold the rules, chosen for the project's stack once it
  is known, and named in its `agentree.config.*` so that every submit
  runs them.

The parity rules join only a project that clones an interface.

### The stack

The kickstart asks for the stack, every question optional, in the UI and
as options of `agentree init`:

| Asked                    | For example                                                     |
| ------------------------ | --------------------------------------------------------------- |
| The language and runtime | TypeScript on Node, Go, Python, Java, Kotlin                    |
| The frontend             | none, a web application and its framework, mobile               |
| Frontend and backend     | one application, or apart                                       |
| The backend's shape      | a modular monolith, or services apart                           |
| The data                 | PostgreSQL, MySQL, SQLite, a document store, a cache, a queue   |
| Where it runs            | locally with Compose, Kubernetes (local and a cloud), a cloud's own services |
| Sign-in                  | none, its own, an identity provider                             |
| The tests and CI         | the project's test runner, CI on a provider                     |

What the owner leaves empty is decided by an agent, as the owner asked:
the planner, with the goal of the first card, writes the project's
first ADR, "The stack", with each choice, what it rejected and why, and
each version read from its release page. It starts from the origin's
shape (one modular monolith, one image, the standard above) and leaves
it only where the goal asks for more. The ADR is a task of kind
`research`, reviewed by a session of another tool as any task is, and
shown to the owner on the board; the owner may reopen it, and the tasks
that build on the stack wait for it. What the owner gave is written into
the ADR as the owner's, and no agent changes it.

The answers decide the project's image (where its commands run), its
checks, its tree's setup and the standard's checks, which `init` writes
once the ADR is accepted.

### In the UI

The daemon is the machine's, and a project is a repository registered
with it (`agentree init` registers it; the list is in the user's
configuration directory, and each project's state stays in its own git
common directory). The UI opens on the list of projects. "New project"
asks, in order:

1. the name, and the folder it is made in, under a directory the owner
   named once as the place for projects: the daemon makes no folder
   elsewhere;
2. the tools that will work on it;
3. the slots of the machine, when it is the first project;
4. whether it reproduces the interface of a site
   ([below](#cloning-an-interface-from-a-site));
5. the stack ([The stack](#the-stack)), each question optional;
6. a first goal, in words, which becomes the first card and can be
   given to the planner.

It then runs `agentree init` with those answers, shows each step's
output as it runs, and opens the new board. The UI holds no step of its
own: what it asks is what the command takes as options.

## Cloning an interface from a site

An option of a project, off unless asked for. It is two pieces of work
kept apart:

- **The measures**: structure, sizes, fonts, colours, the side bar,
  effects, animations and every state. The origin's way of reproducing
  its reference application, read from its files
  ([`docs/origin.md`](../../docs/origin.md) names them), with what was
  that project's own taken out. The rest of this section, down to
  [The drawings](#the-drawings).
- **The drawings**: icons and pictures, fetched by an agent of their
  own that knows nothing of the project.

**What the project is given.**

- **The reference, declared**: its address, how a session is signed in
  to it (by the owner, in the owner's browser; a worker never enters a
  password), the viewport, the theme.
- **The agreements about it**, in the project's memory as the owner's:
  the reference is read-only; it is read only in a tab the worker opens
  and closes; no token, cookie, storage or request header is read; the
  page makes no request on the record's behalf; nothing is saved,
  created or deleted there; the owner's name and organization are never
  written into a record.
- **The definition of done for a part**: the record holds the part and
  every sub-part down to the leaves, with the states that appear only on
  interaction (pointed at, focused, pressed, open, selected, disabled,
  empty, loading, an error); every value was read from the reference; a
  value that was not read is listed as not measured, with the reason,
  and never filled in; the comparison matches 100%, or each difference
  is an exception with a stated reason, and what is only not built yet
  is no exception.
- **The reader**: the library the origin read its records with
  (`measure.js`), which reads, for each element, its box, its computed
  style by a fixed list of properties, its role, name, text, state
  attributes and icon, and gives each element an id that is a path.
- **The record's form**: a directory a part, with `inventory.md` (the
  checklist of every sub-part, and where each is recorded or why not),
  `base.json` (every element at rest) and a file a state holding only
  what differs from its base.
- **The comparison**: an end-to-end test that brings the project's page
  to the record's viewport, theme and state, reads the same elements
  with the same reader (an element is matched by the record's id in an
  attribute), and reports each property that differs. Expected values
  are never written by hand.

**How the work runs on the board.**

1. A task of kind `measure` a part, needing `browser` and
   `reference-app`, written from one template: measure in one session,
   following the record's README, to the leaves, with what was not
   measured listed. States are produced for real: a hover with the
   pointer, an open with a click, a close with Escape, a focus with a
   key press, recorded only when the element shows the focus.
2. A task of kind `build` a part, depending on its measure task, whose
   checks run the comparison of that part.
3. A value a record holds is not measured again; a value from any other
   product is never used as the reference's.
4. A submit compares the parts the task's files can change; a task that
   changes what every part shares compares every part, and is not
   claimed before the owner says yes, with the cost named (40 to 50
   minutes in the origin).
5. The reviewer runs the comparison again.

**What a project chooses.** The origin's agreement keeps two things its
own, the colour palette and the font family: colours are recorded to
tell the role each plays, and its comparison skips colour values and
the font family. Here the kickstart asks, for each project: whether the
colours and the font are the project's own or the reference's, in which
case the comparison holds them too; and whether the drawings stay on
the machine or are committed with the project.

**The comparison is agentree's own.** The origin's is a test inside its
application's own test suite. Here `agentree compare <part>` starts the
project's application by the command its part names, opens the part's
address in a browser of its own (Playwright's Chromium, in the
container), brings the page to the record's viewport, theme and state
by the part's steps, reads it with the reader and compares. It asks of
a project only that it serves pages to a browser and marks an element
with its record's id, whatever it is built or tested with. An interface
that is no web page is not compared.

**Measuring, and the extension.** A measure task is offered only to a
tool whose session can drive the owner's Chrome, which the project's
options name. The origin carried its records out of the page as
pictures it then decoded, since its session could not copy text. Here
an extension of Chrome, loaded unpacked from agentree's files, does the
carrying: it adds the reader to the page, and on the reader's call
sends each record from its own background script to the daemon at the
loopback address, with the daemon's token. It reads the page's elements
and nothing else: no cookie, storage or header, and it asks for no
permission to debug. States are still produced for real, by the session
or by the owner's hand.

**What is not general yet.** The reader's general functions (capture,
difference, overlays, focus, export) are apart from its part
definitions, which hold the origin's reference's selectors; a project
writes its own part definitions.

### The drawings

The owner's own template and script, kept as they are in
[`seed/icon-grab/`](../../seed/icon-grab/): `icon-grab-prompt.md` and
`tools/split_icons.py`, which step 6 of the template runs.

**One set, one new session.** The skill `agentree-grab-icons` fills
the template's seven lines of "this time" and adds the statement of
rights, for each place of the reference that shows icons:

| Line of the template | Filled from                                                                 | When left empty, by the template     |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| The page             | The address of the part's record                                            | Asked for                            |
| Where the icons are  | The steps the measure task's inventory holds for reaching that state        | Asked for                            |
| The set's name       | The request                                                                 | Asked for                            |
| The range            | The request                                                                 | Every icon of that area              |
| The colour           | The request                                                                 | `currentColor` kept, others as shown |
| The file names       | The request                                                                 | The site's own identifiers           |
| The project's folder | A folder made for the run, outside the repository and its parents          | The current folder                   |

The skill does not fetch in its own session, which holds the project.
It makes the folder of the run, outside the repository and its parents,
as a small workspace of its own:

- `AGENTS.md`: the template with its seven lines filled, and the
  statement of rights;
- `CLAUDE.md`: the line `@AGENTS.md`, for Claude Code;
- `tools/split_icons.py`: the owner's script, which step 6 runs.

The owner opens a tool that can drive Chrome in that folder and tells it
to follow `AGENTS.md`, in place of pasting the file. Every tool of this
RFC reads `AGENTS.md` there, so the run starts with the template as the
project's rules and nothing else.

**It holds nothing of the project.** The folder has no rules file above
it, no MCP server of the board, no brief and no fact of the project's
memory. The session is no worker: it claims nothing and is given no
name of a task. What a tool keeps of its own for every session of a
user (its global rules, its own memory) is that tool's, and whether each
tool can be started without it is not verified.

**What it is asked.** A request is a card of kind `assets`, made by the
owner in the UI or by a measure task that found icons (the origin's
record holds each drawing's hash, and the hashes no set holds are what
is still to fetch). The card holds the filled prompt and the folder.
The template's three stops (the area is not found; reaching it needs a
button that changes data; the site asks for a sign-in) are answered by
the owner in that session, and its last report is copied into the
card's Log by the agent that moves the set into the project.

**What comes back.** As the template says: `raw-<set>/` with the
downloaded file and `source.txt` (the address, the day, the steps),
`icons-<set>/` with one cleaned `.svg` a drawing, and
`preview-<set>.html`. A set is never written into again. A task of the
project then moves `icons-<set>/` into the paths it writes; the
downloaded file is data, never run, and the script reads it with
`python3 -I`, apart from it.

**Emoji.** A character of text is in the record as text and is fetched
by nobody. A picture that stands for one is an `img` and is fetched as
any picture. The template names inline `svg`, a sprite, `img`, a
background image and an icon font; it does not name emoji.

**What the session is told of rights.** After the seven lines the
prompt holds the owner's statement of use and rights
([`usage-and-rights.md`](../../seed/icon-grab/usage-and-rights.md)), so
that the session does not ask: whose the drawings are, how they are
reached, what they are used for, and the three more cases in which it
stops and asks (the icons are an open-source library's, and the package
is proposed instead; fetching needs a protection passed; what is asked
for is plainly a product for sale). Each is a question on the card.

The statement says the interface runs on the owner's machine alone, in
no public repository, and is not deployed. It is the owner's word and is
sent as written only while the project's own settings agree with it: a
project whose drawings are committed and whose repository has a remote
is asked, at that choice, which of the two holds, and a run starts
again only once they agree.

## What else it has

Proposed beyond what was asked, in the order of what they buy:

1. **Recovery.** A claim not beaten is marked stale on the board; the
   owner, or an option, releases it. Its tree, its commits and its Log
   stay for the next worker.
2. **Numbers.** From the Logs and the queue: the time a task spends in
   each status, the share rejected, the wait for a slot, the checks that
   fail most; and the tokens of a session where its tool reports them.
3. **Notices.** A question, a failed check, a review that waits: in the
   browser, and through a command the project names.
4. **Landing in batches.** Several accepted changes checked together and
   landed together, split when the batch fails. After the single landing
   has run.
5. **Review on the diff.** A reviewer's comment on a line of the diff
   becomes a finding in the reject entry.
6. **Keeping trees few.** A bound on trees, and removal of the trees of
   done tasks in the background.

Not proposed for the first version: a board across machines (the claim
and the queue are one machine's; the origin's design of a claim as a
pushed commit is the way there), containers a task, and other version
control than git.

## Performance

Measured on the origin's board (1,071 task files, 13 MB) and read from
its Logs:

| What                                              | Value                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| `board`, `next`, `lint` of the origin's command   | 0.10 to 0.14 s each                                  |
| Checks recorded by submits (2,486)                | 72 h in all; median 14 s, 90th percentile 248 s      |
| Waits for a slot recorded (98)                    | 17 h in all; median 9 min, longest 57 min            |
| A tree's install, its `node_modules`, its removal | 51 s, about 2 GB, 31 s (the origin's `worktrees.md`) |
| Tasks submitted more than once                    | 187 of 553                                           |

What it says:

- Reading a thousand task files is no cost. The daemon keeps them parsed
  and reads again only a file that changed. No index and no database.
- The cost is checks, waits, a tree's setup and work done twice. So:
  checks run after the submit returns; narrowing stays; a stale change
  is rebased and checked by the lander, and reviewed again only when
  the rebase changed it; a tree's install runs while the agent reads,
  and its removal in the background.
- A beat writes one small file and formats nothing. The origin's beat
  rewrites the task file and runs the formatter on it.
- In a tree the change is one `git diff` against the base, in place of a
  `stat` of every file of the repository.
- The daemon reads git with `--no-optional-locks`, so that it takes no
  lock a worker's git command waits for, and reads no task's tree but
  for a diff a card asks for.
- A project's dependencies and caches are in volumes of the container,
  not in the mounted directory: Docker's documentation says a mount
  shared with the host is slower for them.
- One event stream a browser tab: a browser allows six connections to one
  origin over HTTP/1.1.

## The core and the project's part, from the origin's code

Read from [`task.mjs`](../../seed/aep/scripts/task.mjs) and
[`checkSlots.mjs`](../../seed/aep/scripts/checkSlots.mjs) of the seed:

| Of the origin                                                                                                  | Goes to                                                  |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Parsing and writing a task, the schema's lint, overlap, claim, beat, log, review, accept, reject, withdraw, new | The core                                                 |
| The write that is refused when the file changed since it was read (`fromItsRead`, `writeTask`)                  | The core                                                 |
| The scope check (`changedFiles`, `changesOf`) with a base                                                       | The core                                                 |
| The scope check by time and by the claim's hashes, `--not-mine`, the modes `single` and `parallel`              | Nowhere: there is no shared checkout                     |
| Tickets, seats, process groups, the bound of a check (`checkSlots.mjs` from `shareOfTheMachine` on)             | The core                                                 |
| Which command is heavy (`HEAVY_SCRIPTS`, the rules for Vitest, `takesSlot`)                                     | The project's part                                       |
| Narrowing (`narrowedCheck`, `narrowedRepositoryCheck`, `readersOf`, `workspaceOf`), `newTree.mjs`               | The project's part                                       |
| The parity comparison (`PARITY_*`, `parityPartsOf`), the port offset of a seat                                  | The project's part                                       |
| The sweep's steps and its task's title                                                                          | The steps to the project's part, the filing to the core |
| The formatter run on each task file (`prettierOf`, `formatted`)                                                 | The project's part, off unless named                     |
| `CHECKED_FROM`, `SUBMITTED_BY_HAND`                                                                             | Nowhere: the origin's own history                        |

The queue tells a process by `ps`, and the origin says its reading on
Linux was not checked. In a container the queue runs on Linux, so that
reading is checked first.

## What it is written in

Each version is the latest release, read on 2026-11-22 from its
registry or release page, and read again on 2026-11-23 for the packages
of the UI.

| For                      | What                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| The language and runtime | TypeScript 7.0.2 on Node.js 26.13.1, the line in long-term support. Node runs the files as they are.      |
| The tests                | Node's own runner (`node:test`), as the origin.                                                           |
| MCP                      | `@modelcontextprotocol/server` 2.4.0, over standard input and over streamable HTTP.                       |
| The daemon's HTTP        | Hono 4.13.20 with `@hono/node-server` 2.1.11; its `streamSSE` for the events.                             |
| The UI                   | React 19.3.1, Vite 8.3.8, Tailwind CSS 4.3.5, TanStack Query 5.108.3, React Router 8.5.2.                 |
| The UI's parts           | Base UI (`@base-ui/react`) 1.9.0; `@dnd-kit/react` 0.5.3 for the board; `lucide-react` 1.78.0 for icons.  |
| The comparison           | Playwright 1.65.1.                                                                                        |
| Packages                 | pnpm 12.21.0.                                                                                             |
| Running it               | Docker Compose 5.8.0, a `compose.yaml`; git 2.48 or later in the image, for relative links of worktrees. |

- Node runs TypeScript that only erases to JavaScript and no `.tsx`: the
  core, the command and the daemon are written so and need no build;
  the UI is built by Vite.
- The core takes no library: the origin's command runs on Node alone,
  and the core keeps that.
- `@dnd-kit/react` is the line its authors maintain and is before its
  version 1; the line before it has had no release in two years.

## The owner's answers

Given on 2026-11-22, in the owner's chat.

| On                                    | The answer                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the first version holds          | The core, the command, trees and landing, the kickstart, and the UI reading only.                                                                           |
| When the board's files are committed  | On a branch of their own.                                                                                                                                   |
| A shared checkout without trees       | None: trees only.                                                                                                                                           |
| A stale change                        | Rebased by the lander when git reports no conflict and checked again; reviewed again only when the rebase changed a file of the task.                       |
| The switch for a tool's own tasks     | By tool; the same session never reviews its task.                                                                                                           |
| A tree's setup                        | The best way, left to this RFC: an install a tree, started at the claim, the cache shared; no clone (measured slower) and no pool.                          |
| The memory's form                     | An open-source memory for agents if one fits, Markdown otherwise: none fits, so Markdown.                                                                   |
| The language, and how it is installed | The language left to this RFC; installed with Docker and Docker Compose.                                                                                    |
| What a clone copies                   | Each of the four is offered and chosen for a project; the session that fetches drawings is given the owner's statement of use and rights so it does not ask. |
| Which projects are compared           | The best way, left to this RFC, an extension of the browser allowed: a comparison of agentree's own, and an extension that carries the records.             |
| Which tool measures                   | Only a tool whose session can drive the owner's Chrome.                                                                                                     |
| The UI's look                         | The picture's structure and its look, matched by eye, with agentree's content; its values accepted by the owner from a first page built and shown (2026-11-23, in place of the answer of 2026-11-22: the structure only). |
| Where a project's commands run        | The best way, left to this RFC: in the project's containers, every one through `agentree run`, the heavy ones a container each ([How it runs](#how-it-runs)). |
| The UI's first page, before the RFC   | Built ahead of the other steps, on sample data and with no tests, to settle the look: the Tasks page in [`ui/`](../../ui/README.md). Given on 2026-11-23. |
| The UI's other pages, and their source | Built the same way, as the pages of [gr8r-studio](https://github.com/gr8rstudio/gr8r-studio) are: its side bar (collapsing, Favorites, Projects, Activity, the owner's menu), its task drawer, its List and Table, its board's dragging, and its Projects, Activity, Favorites and Timeline pages. That repository has no licence; its code is ported into `ui/` and the owner answers for that. agentree's content, name and mark stay its own. Given on 2026-11-23. |
| A task's fields in the drawer         | Assignee is the tool and model holding it; Labels its kind and RFC; Blocked by its `depends-on`; Description its Context, Done when and Out of scope; Subtasks a task's subtasks, and an epic's its tasks. No estimate. Given on 2026-11-23. |
| Dragging a card                       | Between Backlog and Ready only, as [What a person does](#the-ui-and-the-daemon) says; dropped elsewhere it goes back. Given on 2026-11-23. |
| The Tasks page's views                | List, Board and Table as gr8r-studio's, one toolbar over the three (search, filter, sort, group, columns); the Board holds agentree's columns and cards. Given on 2026-11-23. |
| The Progress page                     | gr8r-studio's Timeline, under a row of the numbers [Progress](#the-ui-and-the-daemon) names: a bar a task from its claim to its landing, as gr8r-studio's runs from a task's start to its due date, so a task never claimed has none; an arrow from what a task waits for to it; and a row of milestones, each an RFC or ADR accepted or an epic done (its last task landed). Given on 2026-11-23. |
| A project open in the side bar        | Its Board, Tasks, Progress and Documents; the Board is a project's only, not a page of the workspace. Given on 2026-11-23. |
| The levels of the work                | Three, as Jira's: an epic, its tasks, a task's subtasks. A subtask is shown as gr8r-studio's: a title with a done mark, counted done of all on its task's card, row and drawer; an epic's card counts its tasks the same way. A subtask's title opens its page in the drawer, as gr8r-studio's. Its mark is set by its task's worker or by the owner (below, "What a subtask is on disk"). Given on 2026-11-23. |
| The Review and Numbers pages          | Kept in the side bar; built as the other pages are, on sample data, to show what each holds. Given on 2026-11-23. |
| Who reviews                           | An agent: it accepts a task, or rejects it with findings. The Review page shows each verdict and where an accepted task is on its way to `main`, with no button to accept, reject or land. Given on 2026-11-23. |
| Who lands                             | The lander, by itself: each accepted task in turn, as it is accepted, with no word of the owner. Given on 2026-11-23. |
| The Slots page                        | Built as the other pages are, on sample data: the load of the last hour against its mark, each run in its seat with what it takes, the queue in its order with why each waits, the bounds, and each decision of the queue with its reason. Given on 2026-11-23. |
| The Memory page                       | Built as the other pages are, on sample data: the facts of `work/memory/` by kind, what each is about, the task it came from, its state (in force, proposed, retired) and its file. Given on 2026-11-23. |
| The Agents page                       | Built as the other pages are, on sample data: each session by its tool, who started it, the task it holds, its state, its model and its last beat, its subagents under it, and what each tool's setup gives (hooks, MCP, worker and reviewer, what it reports of its use, whether it may review its own tasks). Given on 2026-11-23. |
| The Documents page                    | Built as the other pages are, on sample data: the RFCs and ADRs of main, by kind, with each one's state, what it supersedes or is superseded by, and the tasks that name it; the page reads them and changes none. Given on 2026-11-23. |
| The Home page                        | The side bar's first page, in the look of the owner's picture of a command center (both themes), on sample data: five numbers of the board with their last fourteen days; every file of the repository by area, marked held (a claim's writes), in checks, landed this week or wanted by a ready task, with each area's share free to claim; the open tasks of the next 12 or 24 hours with and without the agents, each held task landing after an estimate from its status; and each tool's sessions. A file of the board and an hour of the chart show what they are when the pointer is on them, and a file held by a task opens it. The dark theme's panels are grey, of the ground's hue. Given on 2026-11-24. |
| Favorites                             | A star on a project or a task, kept by the browser of the machine. Given on 2026-11-23. |
| Building before the RFC is accepted   | The backend is built while the RFC stays a draft, and the RFC follows the code. Given on 2026-11-24. |
| What a subtask is on disk             | A line of its task's file, under `## Subtasks`, as a checklist item (`- [ ]`, `- [x]`); the task's worker or the owner marks it done (`agentree tick`). It has no file, claim or landing of its own. Given on 2026-11-24. |
| The backend and the UI's sample data  | The daemon serves everything the UI's pages show, in the shapes they read, and `agentree demo` makes a project whose board holds the sample content the UI was built on. What the UI has beyond this RFC is the backend's too: the status `blocked` and the kinds `review` and `assets`, a project's state (planning, in progress, at risk, on hold, completed), the Live page's seats and what they say to each other, the Home page's files by area and its forecast, Activity, and the milestones of Progress. Given on 2026-11-24. |
| The owner's menu                      | gr8r-studio's items, View profile and Sign out included, which do nothing: agentree has no sign-in. Given on 2026-11-23. |

## Questions for the owner

Each answered question is in
[The owner's answers](#the-owners-answers); a new one is added here as
it comes up. None is open.

## The steps in order

Each becomes a task once the RFC is accepted.

The first version:

1. The core split from the seed, in TypeScript, with the seed's tests
   moved with it, and the project's part as an interface.
2. The board's two places (its branch, the machine's state) and the
   task's new fields and statuses.
3. The daemon and its container, the host's script, and the queue read
   on Linux, with the controller of the load for heavy runs: what it
   measures is tried first, and a fixed number stays until it is.
4. Trees: claim, lock, install, scope by base, commit, release.
5. Landing: the queue, the conflict check, the rebase by the lander,
   the fast-forward.
6. The MCP server and `init` for each tool, each tried in that tool;
   the engineering standard's template made from the origin's files;
   the stack's options and the planner's ADR of the stack.
7. The UI, reading only, on the look the owner accepts from its first
   page. The first page is in `ui/`, on sample data; this step connects
   it to the daemon and builds the other pages.

After it:

8. Questions, options, the review switch, and the writes from the UI.
9. Memory.
10. Checks after the submit returns.
11. The breakdown.
12. Onboarding a new project in the UI.
13. Cloning an interface, the measures: the reader and the record's
    form copied from the origin into the seed and made general, the
    extension, the templates of the measure and build tasks, the
    comparison, and the option in the onboarding.
14. Cloning an interface, the drawings: the skill that fills the
    template, its card, and the move of a set into the project.
15. What [What else it has](#what-else-it-has) lists.

## Proving it

The design is done when:

- a new, small repository is set up by `agentree init` alone and five
  sessions, one of each tool, each land a task on it with no change to
  the core;
- two of those tasks are made to touch one file, and one is refused
  before its work or sent back at its landing, never landed over the
  other;
- the origin repository runs on agentree in place of its own command.

## Verified

Git, tried on 2026-11-22 with git 2.54.0 in a throwaway repository:

- `git merge --ff-only` of a task's branch succeeds in a main checkout
  that holds an uncommitted change of a file the branch does not touch.
- It refuses a branch that `main` has moved past (exit 128).
- `git merge-tree --write-tree --name-only main <branch>` exits 0 with
  no conflict and 1 with one, naming the file, and changes no tree.
- `git fetch . <branch>:main` refuses while `main` is checked out.
- `git worktree lock --reason` shows in `git worktree list --porcelain`.
- A branch rebased onto `main` in its own tree then fast-forwards.
- `git worktree add --orphan -b <branch>` makes a worktree on a branch
  with no history, and a commit there.
- A worktree made with `--relative-paths` still answers `git status`
  after the repository and its trees were moved together to another
  path; one made without it answers `not a git repository`. The option
  sets `extensions.relativeworktrees` in the repository.

Docker Desktop 29.9.3, tried on 2026-11-22: `docker info` gives 14
processors and 8,318,910,464 bytes of memory to its virtual machine, on
a host of 14 processors and 51,539,607,552 bytes. A container run with
`--cpus 2 --memory 512m` reads `200000 100000` in `cpu.max` and
536870912 in `memory.max`, and has `cpu.stat`, `memory.peak`,
`cpu.pressure` and `memory.pressure` of its own; its `/proc/loadavg`
read 3.52 while the host's `vm.loadavg` read 34.78 to 38.34 in the same
minute.

Tried on 2026-11-22 on macOS (APFS): `cp -c -R` of the origin's
`node_modules` (2.4 GB) took 70 s, and its removal 40 s.

The versions of [What it is written in](#what-it-is-written-in), read on
2026-11-22: the [npm registry](https://registry.npmjs.org/) entry of
each package, [Node.js's index of releases](https://nodejs.org/dist/index.json)
and [its page on TypeScript](https://nodejs.org/docs/latest-v26.x/api/typescript.html),
[TypeScript 7.0's announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[the MCP SDK's README](https://github.com/modelcontextprotocol/typescript-sdk),
[Compose's releases](https://github.com/docker/compose/releases) and
[its specification](https://github.com/compose-spec/compose-spec/blob/main/spec.md).

Docker, Node, git and Chrome, read on 2026-11-22:
[publishing a port](https://docs.docker.com/engine/network/port-publishing/),
[Docker Desktop's settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/),
[Node's `fs.watch`](https://nodejs.org/docs/latest-v26.x/api/fs.html),
[`git worktree`](https://git-scm.com/docs/git-worktree),
[content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
[an extension's requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).

What each tool reports of its model and its use, read on 2026-11-22:
Claude Code's [headless runs](https://code.claude.com/docs/en/headless),
[hooks](https://code.claude.com/docs/en/hooks) and
[status line](https://code.claude.com/docs/en/statusline); Codex's
[non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode.md);
Cursor's [headless CLI](https://cursor.com/docs/cli/headless);
Antigravity's [headless CLI](https://antigravity.google/docs/cli/headless/).
The pages of Codex, Cursor and Antigravity were read through a summary.

Skills, read on 2026-11-22: [Claude Code](https://code.claude.com/docs/en/skills)
(`.claude/skills/<name>/SKILL.md`, loaded when relevant, or by name),
[Codex](https://learn.chatgpt.com/docs/build-skills) (`.agents/skills`
from the current directory up to the root), [Cursor](https://cursor.com/docs/context/skills)
(`.agents/skills/` and `.cursor/skills/`, and `.claude/skills/`),
[Antigravity](https://antigravity.google/docs/skills/)
(`.agents/skills/`). The last three through a summary.

The memories for agents, read on 2026-11-22 in each project's README:
[basic-memory](https://github.com/basicmachines-co/basic-memory),
[mem0](https://github.com/mem0ai/mem0),
[Graphiti](https://github.com/getzep/graphiti),
[cognee](https://github.com/topoteretes/cognee),
[LangMem](https://github.com/langchain-ai/langmem),
[claude-mem](https://github.com/thedotmack/claude-mem),
[Beads](https://github.com/gastownhall/beads),
[memU](https://github.com/NevaMind-AI/memU),
[MemOS](https://github.com/MemTensor/MemOS). None was installed or run.

The tools, read on 2026-11-22:

- Claude Code: [memory](https://code.claude.com/docs/en/memory),
  [sandboxing](https://code.claude.com/docs/en/sandboxing),
  [MCP](https://code.claude.com/docs/en/mcp),
  [worktrees](https://code.claude.com/docs/en/worktrees),
  [hooks](https://code.claude.com/docs/en/hooks),
  [environment variables](https://code.claude.com/docs/en/env-vars),
  [headless](https://code.claude.com/docs/en/headless),
  [desktop](https://code.claude.com/docs/en/desktop).
- Cursor: [rules](https://cursor.com/docs/context/rules),
  [MCP](https://cursor.com/docs/context/mcp),
  [hooks](https://cursor.com/docs/agent/hooks),
  [worktrees](https://cursor.com/docs/configuration/worktrees),
  [CLI parameters](https://cursor.com/docs/cli/reference/parameters),
  [headless](https://cursor.com/docs/cli/headless),
  [CLI configuration](https://cursor.com/docs/cli/reference/configuration).
- Codex: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security.md),
  [MCP](https://learn.chatgpt.com/docs/extend/mcp.md),
  [hooks](https://learn.chatgpt.com/docs/hooks),
  [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees),
  [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode.md),
  [environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables.md).
- Antigravity: [rules](https://antigravity.google/docs/rules/),
  [MCP](https://antigravity.google/docs/mcp/),
  [hooks](https://antigravity.google/docs/hooks/),
  [headless](https://antigravity.google/docs/cli/headless/).
- The connection limit of server-sent events:
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

The origin's engineering rules were read on 2026-11-22 in its
`AGENTS.md` ("Non-negotiables", "Comments and names", the rules of
"The new platform"), `docs/engineering/code-standards.md` ("Design"),
the headings of `non-functional.md` and `system-conventions.md`, and
ADR 0006; the words SOLID and clean architecture appear in none of
them.

The origin's way of cloning an interface was read on 2026-11-22 in its
`apps/web/parity/README.md`, `work/agreements.md`, the comment at the
head of `apps/web/e2e/parity/harness.ts`, `work/README.md` (the parts a
submit compares) and one of its measure tasks.

The numbers of [Performance](#performance) were counted in the origin's
`work/tasks/` and timed with its command on 2026-11-22.

## Not verified

- Nothing of this design has run. In the origin the mode of trees is
  designed and answered by the owner, and not built.
- Only Claude Code's pages were read in their own text; the pages of
  Cursor, Codex and Antigravity were read through a summary, and each
  sentence used here is to be read again on its page.
- Whether a `git commit` by Codex in a linked worktree under
  `workspace-write` asks or fails: the page says only that the directory
  is read-only.
- Whether Cursor removes a worktree it did not make: its page appears to
  say so and was not read in its own words.
- How Claude Desktop and Antigravity keep several accounts apart on one
  machine, and any variable by which Cursor, Codex or Antigravity tell a
  shell command its session.
- The report of use: what the Cursor CLI's output gives of tokens (its
  page of output formats was not read); whether Claude Desktop runs the
  status line; and whether the figures of interactive sessions of Codex,
  Cursor and Antigravity can be had through any documented interface.
- That each tool's hook before a tool call can refuse an edit by its
  path in every way that tool edits a file.
- Whether Docker Desktop brings a host's file changes into a container
  as events; the design does not rely on it.
- Following the load: nothing of the controller has run, and its marks
  and margins are numbers to be found by measuring, none is given here.
  The readings were seen in one small container (above); that they
  count a real check's work, and how the virtual machine's load and the
  host's move together under it, was not tried.
- How much slower a project's checks are in Docker's virtual machine
  than on the host, with the sources on a mount shared with the host:
  not measured. The origin's checks ran on the host.
- That the daemon's container can start the project's containers
  through Docker's socket with the tree mounted at the same path: the
  design's, not tried.
- The host's script reading the host's load: `sysctl` on macOS is the
  design; what it reads on Linux and on Windows was not looked at.
- That each tool loads a skill on its own when a task fits it, as its
  documentation says: not tried in any tool. That Claude Code reads
  `.agents/skills/`: not stated on its page, so the files are written
  twice.
- That the subagent hooks of Codex and Cursor carry an id of the
  subagent and of the session that started it, and what Antigravity's
  invocation hooks carry: read from their pages through a summary, the
  fields not read.
- What a subagent of Cursor, Codex and Antigravity loads of the
  project's rules, and whether it can ask the owner; whether a subagent
  of each tool can edit the files of a tree beside the repository, which
  is outside the folder its session was started in.
- What a tool keeps for every session of a user (its global rules, its
  own memory) reaches the icon run; a memory keyed by folder starts
  empty in a new folder, as this session's own memory plugin said of
  this repository at its first session.
- That an agent keeps the rule of the load: a rule of a prompt, which
  the queue backs and nothing enforces.
- The time of the host's script, which every hook calls, and of an
  install into a volume of the container.
- That SQLite as Node builds it has full-text search.
- The extension: nothing of it is built, and what Chrome shows the
  owner when it is loaded unpacked was not looked at.
- The queue's reading of processes on Linux, and everything on Windows.
- The engineering standard's template: the origin's rules were read and
  sorted into what is general and what is the origin's; which tool of
  each stack holds each rule as a check (unused code, boundaries between
  modules) was not looked at.
- Cloning an interface outside the origin: it ran against one reference
  and one stack. The origin's own README says the reader's two part
  definitions were not run again after the reader was put into one
  file. The reader's code (`measure.js`), the comparison's code beyond
  its head comment, and the scripts beside the reader were not read
  here.
- Which tools' sessions can drive the owner's Chrome.
- That a session of each tool can be started with none of that tool's
  own global rules and memory; only that it starts outside the project
  is by design here.
- The template and its script were read, not run, here.
- No tool was tried: every row of [The tools](#the-tools) is its
  documentation's word.
