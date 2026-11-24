# The task board

The work on AEP, as tasks a worker picks up and finishes without
conflicting with another: an agent in Claude Code, Antigravity or Cursor,
or a person. One file per task in [`tasks/`](./tasks). The design and its
reasons are in [RFC 0006](../rfcs/0006-agent-task-board/README.md).

Each worker builds its task in a git worktree of its own, beside the
repository, and the board stays one, in the main checkout
([Trees](#trees)). The steps that make, check and remove a tree, and the
move to review, are done by the [task command](#the-task-command)
(`scripts/task.mjs`, which needs Node and nothing installed): `claim`,
`submit`, `release` and `land`. The others (a Log entry, a beat, a review
mark) are written here as they are done by hand, with a shell and an
editor, on the same files.

## Read first, in this order

1. [`AGENTS.md`](../AGENTS.md): the rules of the repository. All of it.
2. This file.
3. [`agreements.md`](./agreements.md): how the owner wants the work done.
   It binds every task.
4. The task you take, then the RFC and step it names, then the README of
   each package it writes.

## Name yourself

By tool and model, never by a person's name or email:

```
claude-code/<model>   antigravity/<model>   cursor/<model>   person/<handle>
```

Use the same name in the claim, the task file and every Log entry.

## The task command

Each line does the section of this file it names, and refuses what that
section forbids. Name yourself in `AEP_WORKER` first; the command refuses
to change the board without it, and refuses an email address.

```sh
export AEP_WORKER=cursor/<model>
yarn task board                       # every task by status, who holds it, stale claims
yarn task next --can docker,network   # "Find a task": the ready tasks you can claim now
yarn task show T-0042                 # the task, its dependencies, its paths, its last Log entries
yarn task claim T-0042                # "Claim it", and the brief to work from
yarn task beat T-0042                 # sets `beat` of your claim, or of your review mark, to now
yarn task log T-0042 < entry.md       # "Log": the entry from stdin, under the time and your name
yarn task scope T-0042                # the files changed since the claim, by whose they are
yarn task submit T-0042               # "Submit for review": the scope check, the checks, review
yarn task run -- yarn platform:test   # any command; a heavy one waits for a slot of the machine
yarn task sweep                       # the whole tree under a slot; a failure files or updates one task
yarn task withdraw T-0042 < why.md    # take back your own task from review to in-progress
yarn task release T-0042 < why.md     # "Release without finishing"; --blocked instead of ready
yarn task review T-0042               # "Review": marks the task as under review by you
yarn task accept T-0042 < review.md   # "Review": done, and the tasks that waited are ready
yarn task promote                     # every backlog task whose dependencies are all done is ready
yarn task land T-0042                 # "Trees": the coordinator lands an accepted task on main
yarn task reject T-0042 < findings.md # "Review": ready again
yarn task new --title 'What it is' --kind fix --priority 2   # "A new task": ready, or backlog
# new: --depends-on, --writes, --appends, --needs and --check repeat (all but --check also take a comma list); a repeat of any other option is refused
yarn lint:tasks                       # the lint of the board; part of yarn lint:repo
```

`yarn task help` lists every option; a subcommand refuses an option it
does not take (`--drop` is `review`'s alone). What the command adds to the
steps by hand:

- `next` without `--can` lists every task that does not need `owner`, each
  with its `needs`; with `--can` it lists only the tasks whose `needs` are
  all named. When it lists none it says why: that no task is ready, or
  each ready task with what keeps it from being claimed (the `needs` that
  `--can` does not name, a dependency that is not done, a held task that
  overlaps, sections not written yet), and the backlog tasks that
  `promote` would make ready. After the claimable tasks (or why none can
  be claimed), it lists every task in `review` that `AEP_WORKER` did not
  submit and holds no claim on, oldest submission first, marking those
  accepted by the owner only; when no task can be claimed it also says how
  many wait for a review even if none is for `AEP_WORKER` to review. Who
  submitted a task is read only from the entry `task submit` wrote: a task
  in `review` whose last Log entry is another one is offered to no worker,
  neither the one that wrote that entry nor the one that submitted, and
  `next` names it apart as not offered. `next` runs without `AEP_WORKER`,
  and then lists every such task; a name there that is not a worker's is
  refused, as by every other command.
- `new` writes the task as `ready` when every task it depends on is done,
  and as `backlog` otherwise. Its three sections hold `To be written.`,
  and `claim` refuses the task, and `next` does not offer it, while one
  still does.
- `promote` sets to `ready` every `backlog` task whose dependencies are
  all done: one whose `depends-on` was edited, or that was written by
  hand.
- `claim` also refuses a task whose `writes` overlap an `appends` entry of
  a held task: a `writes` entry conflicts with another task's `writes` and
  `appends`, in both directions. A task that needs `owner` is claimed with
  `--owner-told`, which writes that into the Log.
- A task of kind `build` or `fix` needs at least one command in `checks`:
  `claim` refuses one with none, as it refuses unwritten sections, and
  `submit` refuses it before any check runs, each saying to add the
  commands. The other kinds may have none. The lint does not refuse the
  task, so that one unfinished file does not fail every other worker's
  submit; `new` hints at `--check` for such a kind.
- `log`, `beat`, `submit` and `release` are for the worker that holds the
  task. The times of the Log are UTC, like those of the claim.
- When two commands meet on one task file, or a command meets an edit by
  hand, neither change is lost. A command writes a task file only while it
  still holds the text the command read. When it does not, the command
  writes nothing to it, says
  `<file> changed since this command read it ... it starts again from the board as it is now`,
  and decides again on the task as it is: a Log entry is added after the
  one that came first, and an `accept` that meets a `withdraw` is refused
  because the task is no longer in review. After three such runs it is
  refused with `Run the command again`. For the moment of the write the
  command holds `work/claims/<task file>.lock`, and another command waits
  for it; a lock still there after five seconds was left by a command that
  was killed, and the refusal says to remove it. An entry on stdin is
  waited for until the pipe closes.
- `submit` asks for a Log entry of yours since the claim, runs every
  command of `checks` from the root of the task's tree, and adds an entry of its
  own with each result. A check that fails stops it, unless you pass
  `--allow-failing-checks` because the failure is in files outside the task
  and your Log entry names them.
- `submit` works in this order: the Log entry of yours since the claim;
  the commit the task's tree is at, which must be clean and have its
  branch out; the scope check; the checks, in the tree; the commit again;
  its entry and the move to `review`. What needs no check is decided
  before the first check runs: a change not committed, or a scope check
  that fails, refuses the submission with no check run. So does a task of
  kind `build` or `fix` of which no file under `writes` or `appends`
  differs from its tree's base, as the narrowing reads them: its checks
  would run on nothing. The refusal names the tree and the base. A tree
  that is not at the same commit after the checks, or that holds a change
  not committed then, refuses the submission: what was checked is what
  lands.
- `submit` runs a heavy check under a slot of the machine, so that the
  submits of the workers of every tree do not run their suites all at
  once. A check is heavy when one of its words is `e2e`, `platform:test`,
  `platform:check` or `test:demo`, or when it runs Vitest (`vitest`, a
  path to it such as `node_modules/.bin/vitest`) or Jest through
  `backstage-cli repo test` or `package test` (the root's `test` and
  `test:all`), by itself or through a Yarn script of the root or of a
  workspace whose text runs it, read from its package.json,
  beyond a few named test files: a run that names a directory, a filter,
  a project alone, `related` or no file runs more than it names and
  waits, while one that names at most three test files, of them at most
  one `*.integration.test.ts`, runs at once. Vitest keeps every file whose
  path holds a word, so a word names a file only when it is the path,
  with a directory, of an existing test file from where the run starts
  (the root, the workspace of `yarn workspace`, or after a `cd`); a
  suffix such as `.test.ts`, a bare name or a glob waits. Vitest gives a file a worker
  and starts a project only for its files, so three files take three
  cores for seconds, less than a slot's share; an integration file
  composes the modules in a schema of its own on the one PostgreSQL every
  slot shares. Any other check takes no slot and never waits. The machine has `AEP_CHECK_SLOTS` slots, by default the cores
  divided by the workers a Playwright run starts, which is half the cores:
  two. A check under a slot is told its number of workers in
  `AEP_CHECK_WORKERS` (the cores divided by the slots, and no more than
  Playwright's own number), which `apps/web/playwright.config.ts` reads,
  and the root's `vitest.config.mts`: a Vitest run by it starts no more
  workers than that, whatever `--maxWorkers` asks beyond it. A run by
  another configuration has that configuration's own number. A
  slot is a ticket in `node_modules/.cache/check-slots/`, numbered in the
  order the checks asked: a check runs when fewer tickets than the machine
  has slots are before its own, so the first to ask is the first to run.
  While it waits, the command says so and names every check before it (the
  worker, the task, the command, the process), again when they change and
  every five minutes. After `AEP_CHECK_SLOT_WAIT_MINUTES` (120) it refuses
  the submission, naming them; the task stays in progress, and `submit` is
  run again. A ticket is held while the process that wrote it runs. One
  whose process is gone (a submit that was killed), or whose pid is that
  of a process that began after the ticket was written (the pid given to
  another process, or the machine started again; `ps` tells), is removed
  by the next submit that looks, which says so and takes its turn. The
  command a ticket is taken for runs in a process group of its own,
  recorded in the ticket, so a ticket whose process is gone is held while
  that command still runs: the next to look sends its group SIGTERM, and
  SIGKILL 10 s later, says so, and removes the ticket once the command has
  ended. The group is signalled only while `ps` tells that its leader is
  the command, which began no later than the ticket says; a group whose
  id another process has since, also after the machine started again, or
  whose leader has ended and is not reaped (a zombie, `ps` state `Z`), is
  never signalled, and a zombie holder holds nothing. The shell that
  starts the command creates a mark beside the ticket
  (`000001.group.<pid>`) before it becomes the command, so a holder killed
  right after starting it leaves a ticket the group is still told from,
  and a ticket whose holder started a command a moment ago (10 s) and
  records no group yet is held for that moment. A submit's heavy check is
  run by a process of `scripts/checkSlots.mjs` that starts it in that
  group, records itself in the ticket, and passes on the signals it
  receives: a Ctrl-C at the terminal ends the submit and not that
  process, which gives the check its graceful end, and the ticket is held
  while that process runs and is not stopped. The mark of a command being
  ended names its ticket, and a new ticket removes the marks of its
  number, so a mark never meets a ticket it was not made for. On Linux
  `ps` tells the time a process has run from the boot clock, which this
  compares with the ticket's wall-clock time within 5 s: a step of the
  wall clock of more than that can make a running command read as ended,
  or a reused leader as the command. This is not checked on Linux (only
  on macOS); `ps -o stat=` is the field that gives the state on both.
  Nothing serves the slots and nothing is installed
  for them. A heavy check's line in the Log entry of a submit adds
  `, waited 4 min` after its run time (`pass, 58 s, waited 4 min`): the
  time from the writing of its ticket, which the queue stamps when the
  check asks, to the moment the queue grants the slot and the check starts
  (seconds below a minute, whole minutes above). A check that waited under
  half a second and a light check, which has no ticket, have no such
  addition. The Log entry of a failing `sweep` says it the same way
  (`after waiting 4 min for its slot`), and `sweep` prints it when it waited.
- `submit` and `sweep` run every check as CI runs it, so that a tool runs
  once and exits: with `CI=true` in its environment, which GitHub Actions
  sets for every step (with it `backstage-cli package test` runs Jest once
  instead of watching, and a suite that would skip its integration tests
  without the local services fails instead), and with no input, so a
  check that reads its input reads its end. A check that runs a root
  script CI runs with `CI` empty (`.github/workflows/ci.yml`:
  `yarn test:e2e`, with any arguments) has it empty; `GITHUB_ACTIONS` is
  not set, since it changes how a tool reports, not whether it ends. `run`
  sets neither: a worker may want watch mode. Under `CI=true` an
  end-to-end run of `apps/web` reuses no server it finds on its ports, so
  each heavy check under a slot is given the `E2E_PORT_OFFSET` of its
  seat (20000, 20100, ...: a seat is the lowest number no other ticket
  holds, recorded in the ticket when the slot is granted; with no lock,
  so that none is left to hold the seats: a ticket that then finds its
  seat in another gives it up and takes one again, and a seat is free
  once its ticket is gone), unless the worker's environment names one;
  every such port is off 5173. The `sign-in` project's preview is on 5173 in every
  run, since the realm names it: a sign-in run while
  `yarn workspace @aep/web dev` or another sign-in run listens there
  fails at once. No check runs longer than `AEP_CHECK_TIMEOUT_MINUTES`
  (90). That is above the longest parity suite a submit has recorded, 83
  min (failing; the parity comparison is not retried, with `CI=true`
  either), the longest check whose line could not hold a wait; a
  `platform:check` of 165 min was recorded before a line said its wait,
  and may hold one or a hang. Every check, heavy or light,
  is run by the process of `scripts/checkSlots.mjs` that starts it in a
  process group of its own; at the bound that process sends the group
  SIGTERM, and SIGKILL 10 s later while its leader still runs, as a
  command whose holder is gone is ended. The check's line in the Log
  entry says `FAIL (timed out after 90 min)`, its slot is free, the
  submit runs its next check, and a sweep's entry names the step
  (`- lint: it timed out after 90 min`). A bound that is not a number of
  minutes above 0 refuses the submit before any check runs.
- `run [T-NNNN] -- <command>` runs a command as `submit` runs a check, in
  the same queue: a heavy one waits for a slot, saying where it waits, and
  is told `AEP_CHECK_WORKERS`; a light one runs at once and writes no
  ticket. The task and `AEP_WORKER` name the run in the queue and are both
  optional. The command runs in a process group of its own, so a Ctrl-C
  at the terminal reaches the run alone, which passes it (SIGINT, SIGTERM
  or SIGHUP, from the terminal or sent to the run's process) once to the
  command's group, or ends the wait; either way the ticket is removed. The
  command has no controlling terminal: Ctrl-Z stops the run, not it. The run exits with
  the command's code, or is ended by the signal that ended it. A suite run
  any other way takes no slot.
- `submit` tells a check that runs the parity comparison (one of its
  words is `e2e`, and it names no project or the project `parity`) which
  parts it compares, in
  `AEP_PARITY_PARTS`: the parts that the files of the task's scope its
  tree changed can change, as `apps/web/e2e/parity/scope.ts`
  places them (a file of a page on the parts of that page, a part's record
  or driver on that part), and every part when one of the files is shared
  by the parts or placed by no rule. It prints which parts and, for each
  file that decides, why, and writes the parts into its entry
  (`Parity: compared ...`). A value of the variable in the caller's
  environment is not passed on. The other projects of the suite and every other check
  run whole. On a board without `scope.ts` the checks are told nothing.
- `submit` runs a check of the whole tree (`yarn platform:check` or
  `yarn platform:test`, with options and no file named) on what the task
  changed: the files of its scope that its tree changed from its base,
  committed or not. For
  `platform:check` that is the typecheck of the packages of those files
  and of every package that depends on them, directly or not (the
  dependencies of each `package.json`); oxlint on the changed files; and
  `vitest related` on them. A changed file Vitest follows no imports of
  (SQL, JSON, a deleted file) runs every test of its package and of its
  dependants instead. `platform:test` runs only the tests. A file that the
  checks of every package read (the root's `package.json`, `yarn.lock`,
  `vitest.config.mts`, `tsconfig.platform.json` and the like) runs the
  whole tree. A file that a file of the new tree reads by path, outside
  its own package, runs what reads it: the test itself, or every test of
  the reader's package and its dependants when the reader is no test
  (`apps/web/src/testing/fixtures.ts` and `modules/model-store/src/testing/demo.ts`
  read `examples/port-demo`, `modules/identity/src/testing/realm.ts`
  `deploy/dev/keycloak/realm.json`, `checkTenancy.test.ts`
  `scripts/check-tenancy.mjs`). The readers are found in the packages'
  code where their Vitest looks (`include` of a package's
  `vitest.config.ts`), from `join` or `resolve` of `import.meta.dirname`
  with literal arguments, `new URL('...', import.meta.url)` and relative
  imports; a path built any other way is not found. What such a file
  names in its own package outside `include` is followed (a file, and the
  modules at the top of a directory it names, but not the package's own
  directory), and what that reads outside the package is read by the
  file that led there: `apps/web/src/api/search.test.ts` imports
  `e2e/fixtureApi.ts`, which loads `e2e/fixtures/`, whose `delivery.ts`
  reads `modules/packs/src`. A test that reads the
  whole repository from its root (`actor.test.ts` of `@aep/platform`,
  `wholeEntityRead.test.ts` of `@aep/model-store`) runs for every change
  but one of `work/tasks/` alone. A task that changed no file of a package
  and none read this way runs nothing. A file the tree deleted is among
  the changed files.
  `submit` prints what it runs and why, and writes it in the check's line
  of its entry (`narrowed to ...`). A check written
  `AEP_WHOLE_TREE=1 yarn platform:check` runs the whole tree, for a task
  whose change reaches further than its files' packages. A file of the
  task that changes during the checks so that a check would run on other
  files refuses the submission.
- `submit` runs `yarn prettier:check` on the same changed files (Prettier
  with `--ignore-unknown`, which skips what `.prettierignore` ignores), so
  another task's half-edited file does not fail it. A change to, or the
  deletion of, a file that decides how other files are formatted formats
  the whole tree: a `.prettierrc`, `.prettierrc.*`, `prettier.config.*`
  or `.editorconfig` at any depth, any `package.json` (its `prettier` key
  is a configuration, and a checkout with no commit cannot tell whether
  that key changed), and the root's `.prettierignore`, `.gitignore` and
  `yarn.lock`. `yarn lint:repo` runs each of its parts that takes files on
  the changed files and every other part as it is (`LINT_REPO_PARTS` in
  `scripts/task.mjs`, and a test that every part is there):
  - `lint:docs` takes files, the changed and the deleted ones: the rules
    of one Markdown file (its links, its `yarn` commands, its HTML blocks)
    run on the changed Markdown files, and every Markdown file is read for
    its links into a changed or deleted file and their anchors; every
    file's commands are read when `package.json` or `yarn.lock` changed,
    and the ADR index and each package's README are still checked
    against the whole tree.
  - `lint:code-rules` takes the changed files: each of its rules reads
    one file, so it checks the changed files in its scope and no other.

  A part that takes files runs as it is when the task changed or deleted
  the program its script runs (`scripts/check-docs.mjs`,
  `scripts/check-code-rules.mjs`) or a local module that program imports,
  directly or through another (a relative `import` read from the source):
  they hold the part's rules, and a changed rule has to read every file.
  The Log's line says so.

  Every other part runs as it is:
  - `lint:ui-boundaries` and `lint:data-model`: their scripts take no
    files, a library or the HTTP client is allowed in one place, and an
    exempt package fails when it no longer needs its exemption;
  - `lint:module-boundaries`: a table is owned by the module whose
    migrations create it, across every package;
  - `lint:tenancy`: the tables partitioned by organization share one
    modulus, across every migration;
  - `lint:icon-library`: the index is compared with the whole folder;
  - `lint:tasks`: the board's rules hold across every task;
  - `lint:deploy-environment`: each role and render (needs `kubectl`);
  - `lint:network-policies`: the union on every render (needs `kubectl`);
  - `lint:unused`: knip reads the whole import graph.

  A check that names one of these parts directly (`yarn lint:docs`) runs
  as the same part does inside `lint:repo`.
  `AEP_WHOLE_TREE=1` before any of them runs it on the whole tree. What each
  ran is printed and written in the check's line of the entry, as above.

- `sweep` checks the whole tree as `platform:check` does (the typecheck,
  oxlint and every test), then `prettier:check` and each part of
  `lint:repo`, each whatever the one before did, under one slot, by hand
  or on a schedule. A test or a file that a narrowed check skips and that
  fails on the whole tree is found here; the task it files has the three
  checks with `AEP_WHOLE_TREE=1`. On a failure it files the task
  "The whole tree passes its checks again", or, while that task is not
  done, adds an entry to it (and, while it is not held, the failing files
  to its `writes`): each failure with its step, its file, the failing test
  and the task whose paths hold the file with the latest Log entry. It
  exits with 1 on a failure and files nothing when the tree passes.
- The scope check (`scope`, and `submit`) lists the files of the task's
  tree that differ from its base, the last commit its branch shares with
  `main` (`git merge-base`): the diff of the working tree against it,
  committed or not, a deleted file among them, and the files git does not
  know and does not ignore. Yours are those under `writes` and `appends`.
  A tree holds one task's change, all of which lands, so every other file
  fails the check, and so does a task file changed in the tree: the board
  is the main checkout's. No file is set aside and no other commit is
  measured from: the command takes no `--base` or `--not-mine`.
- The scope check ignores only what the repository's `.gitignore` files
  and `.git/info/exclude` ignore: it skips the user's and system's git
  configuration, caller `GIT_*` variables and any `core.excludesFile`
  (including `$XDG_CONFIG_HOME/git/ignore` and
  `$HOME/.config/git/ignore`), so it lists the same files on every
  machine, and refuses when a git command fails instead of reading it as
  no change.
- A task that adds a dependency lists `yarn.lock`, and the `package.json`
  it changes when that is outside its `writes`, under `appends`. They are
  not implied by a package directory: a path that is written down is one
  that `claim` compares with the held tasks and the reviewer can see.
- Every task file the command writes is formatted by the repository's own
  Prettier (`node_modules/prettier`, with its configuration), so that
  `yarn prettier:check` passes on it: Prettier formats Markdown by its
  structure, which no fixed form of an entry can match. Prettier runs until
  the file no longer changes (a table right after a list item takes two
  runs), at most five times; a file it still changes is written as the
  last run made it, and the command says so. Without an install
  the file is written as it is, and the command says so. When what Prettier
  makes of the file is not a task the command can read, the file is written
  as the command made it, and the command says so: formatting it would
  break the task.
- `withdraw` takes a task in `review` back to `in-progress` for the worker
  that submitted it (its last Log entry), with a claim and a Log entry read
  from stdin that says why. Any other worker is refused, and a task whose
  paths overlap a held task is refused just as `claim` refuses it. A task
  whose last Log entry is not the one `task submit` wrote is refused for
  every worker, since no entry tells who submitted it: a reviewer rejects
  it.
- `accept` and `reject` refuse the worker that wrote the task's last Log
  entry, which is the one that submitted it. `accept` sets to `ready` every
  backlog task whose dependencies are all done, as [Review](#review)
  says; a task of kind `decision`, or one that needs `owner`,
  is accepted with `--owner` by a `person/<handle>`.
- `review` sets the review mark of a task in review, as [Review](#review)
  says, and refuses it while another reviewer's mark holds, for the worker
  that submitted it, and for a task not in review. Two reviewers that run
  it at once meet on the task file, and the second is refused. `next` does
  not offer a task under another reviewer's mark, and names it apart with
  who reviews it; `board` and `show` show the mark. `beat` beats the mark
  of its reviewer. `accept` and `reject` by any worker but the reviewer are
  refused while the mark holds, unless the owner decides (`--owner`, as a
  `person/<handle>`). `accept`, `reject` and `withdraw` remove the mark,
  and `review T-0042 --drop` gives it back. The lint holds the mark to the
  schema and refuses one on a task that is not in review.
- The lint (`yarn lint:tasks`) holds every task file to
  [`schema.json`](./schema.json): the fields and their values, a path with
  no wildcard. Beyond the schema: the file is named by its id, no id is
  there twice, every dependency exists and none leads back to its task, a
  directory ends in `/`, a task has its `claim` block exactly while it is
  `in-progress`, no two held tasks overlap, the four sections are
  there in their order, and no `backlog` task has every dependency done
  (the lint names `yarn task promote`, which makes it ready). And the Log: every heading is of the form of
  [Log](#log), and no line but `No entry yet.` is above the first one;
  the last entry of a task in `review` is the one
  `task submit` wrote; the entry before the last of a task `done` (its
  acceptance) is that one. `accept` refuses a task in review without it.
- The Log rules hold from `CHECKED_FROM` in `scripts/task.mjs` (2026-11-20
  10:40 UTC). A heading dated before it that is not of the form, and lines
  above the first entry dated before it, are named on every run of the
  lint and do not fail it. A task done before it is not held to its
  submission, since its review is over and its Log stays as it is: it is
  dated by its last entry, or, with no entry, by the lines of its Log. The
  tasks of `SUBMITTED_BY_HAND` there were in review without the entry of
  `submit` when the rules came, and were accepted so: the lint passes each
  without a word, and names an id that no longer needs the list. The list
  only shrinks, and no id is added: a task in review without the entry of
  `submit` fails the lint and is not accepted, on the list or not.
- A heading with a date and no time is dated before `CHECKED_FROM` when
  its day is before the day of `CHECKED_FROM`, or, when its day is that of
  `CHECKED_FROM`, when an entry after it in the Log is dated before
  `CHECKED_FROM` (the Log is written in order). A heading with no date, or
  with a later one, is refused like any heading since, wherever it is.
- Lines above the first entry are dated before `CHECKED_FROM` only when
  they hold a date and time (as `2026-11-20T09:44`) and every one they hold
  is before it; otherwise they are refused. A task done with a Log that
  cannot be dated so, by its last entry or by such lines, is refused: no
  task on the board is, and one done since the check that is breaks the
  rules, so it does not go on the list.

## Trees

The board's one way of working. The design and its reasons are in
[docs/engineering/worktrees.md](../docs/engineering/worktrees.md); the
owner's answers to its questions are in T-1062's Log, and the git a worker
and the coordinator may run is in [`agreements.md`](./agreements.md).
Nothing is built in the main checkout but a landing.

- **One board.** The board is the main checkout's: its `work/tasks/`, its
  `work/claims/` (with the locks) and its slot queue
  (`node_modules/.cache/check-slots/`). A command run for a linked
  worktree, from that tree's own `scripts/task.mjs` or with `--root`, is
  refused and names the board's checkout (the first worktree of
  `git worktree list --porcelain`), as a tree's copy of the board is that
  of its commit; `lint` alone runs, on the board's tasks, since a tree's
  `yarn lint:repo` runs it. A worker runs
  `node <main checkout>/scripts/task.mjs ...` from anywhere.
- **A claim makes the task's tree.** `git worktree add -b task/T-NNNN
../aep-trees/T-NNNN <head of main>`, refused while `main` has no commit,
  or when that directory or branch is there and no record names it; then
  its own install (the Yarn its `.yarnrc.yml` names, `install
--immutable`). The record `work/claims/T-NNNN/tree` holds the tree, the
  branch, the commit of `main` it was made at and that branch's name. An
  install that fails removes the new tree and branch and refuses the claim.
  The record stays after the claim ends, through the review and a release,
  so that the task's next claim works in the same tree, or makes it again
  from the kept branch and installs it; the claim itself is the file
  `work/claims/T-NNNN/claim`, which one worker alone creates. The claim
  is refused while a task in progress writes the same paths, as is the
  claim of the higher id of two that overlap and were taken at once.
- **The worker works in the tree.** It changes files only there, under the
  task's paths, and commits them on `task/T-NNNN`; it may rebase that
  branch. No file of `work/tasks/` is changed in a tree.
- **The scope check, the narrowing, the parity scope, the weighing of a
  check (`takesSlot`) and the checks run in the tree**, against its base:
  the last commit its branch shares with `main` (`git merge-base`), the
  commit it was made at until a rebase on `main`. Every file outside the
  task's paths fails the check, and so does a task file changed in the
  tree. A heavy check waits in the board's queue, so a seat's
  `E2E_PORT_OFFSET` is unique on the machine; Prettier formats task files
  with the main checkout's install. `run T-NNNN -- <command>` weighs its
  command by the task's tree and waits in the same queue.
- **A submit checks a commit.** It refuses a tree that has another branch
  out, or that holds a change not committed, before any check runs, and
  one whose branch moved or that changed during the checks. Its entry
  holds `Committed as <commit> on task/T-NNNN, from main at <base>.`
  The task's tree and record stay through the review.
- **A claim waits for a change that is not on `main`**: one of a task it
  depends on that was accepted and is not landed, and one of a task not in
  progress whose tree is not landed and whose paths overlap its own.
- **The coordinator lands** an accepted task: `task land T-NNNN` (without
  a task, the accepted tasks that wait). One landing at a time, under
  `work/claims/landing.lock` (a landing that finds it waits up to 30
  minutes; a lock whose process is gone is removed under
  `work/claims/landing.lock.takeover`, for one landing alone, and taken;
  the wait for the takeover lock ends within the same 30 minutes, and a
  lock that names no holder, empty or that cannot be read, still there
  then is named in the refusal, to be removed by hand), in the main
  checkout,
  which must have `main` out:
  1. A branch already on `main` is only cleaned up.
  2. A change is sent back, the task `ready` again with the lander's entry
     naming its submitter, its tree and branch kept, when its branch is
     not at the commit its submission checked, when `main` is not an
     ancestor of it (stale: its checks ran without what landed since; its
     worker rebases it in its own tree, runs the checks and submits it
     again, and it is reviewed again), when it holds a file outside the
     task's `writes` and `appends`, or when it holds a task file.
  3. `git merge --ff-only task/T-NNNN`, which moves `main` only by a
     fast-forward and stops when the main checkout's own changes meet the
     files it updates. The record holds the commit that landed.
  4. A change that holds `yarn.lock` installs the main checkout before the
     lock is given back; an install that fails says that `main` moved,
     and a second `land` of the task, after an install by hand, removes
     its tree.
  5. The tree and the branch are removed, as at a release.
- **A release and a landing remove the tree and the branch**, by the
  names of the record, a release while its claim still holds: `git worktree remove` without `--force`, so a tree
  that is not clean is left and the files that hold it are named; the
  branch is deleted once `main` holds all its commits, and a branch that
  holds commits of its own is kept for the next claim. The record goes
  when nothing of it is left.
- **Git.** No command pushes, fetches or names a remote. A claim and a
  release change only the task's tree and branch; only `land` changes the
  main checkout. The review reads a change with
  `git diff <base>...task/T-NNNN` and runs the checks in the tree, through
  `task run T-NNNN -- <check>` from the tree.

## Find a task

Run these from the repository's root. Each task's frontmatter is plain
YAML, with lists written one entry a line.

```sh
# The ready tasks, first priority first.
grep -l '^status: ready' work/tasks/*.md | xargs grep -H '^priority:' | sort -t: -k3 -n

# What one task is, and what it needs (owner, browser, docker, network, reference-app).
grep -E '^(title|kind|step|needs|status):' work/tasks/T-0042-*.md

# A list field of a task: writes, appends, depends-on, checks.
field() { sed -n "/^$1:/,/^[a-z-]*:/p" "$2" | sed -n 's/^  - //p'; }
field writes work/tasks/T-0042-*.md

# The tasks that are held, by whom, and the paths they write.
for f in $(grep -l '^status: in-progress' work/tasks/*.md); do
  echo "$f: $(sed -n 's/^  by: //p' "$f")"; field writes "$f"
done

# The whole board, one line a task.
grep -H '^status:' work/tasks/*.md | sed 's|work/tasks/||' | sort -t: -k3
```

Take the first ready task for which all of this holds:

- You can meet its `needs`. A task that needs `owner` is taken only when
  the owner has told you to take it.
- Every task in its `depends-on` has `status: done`.
- None of its `writes` or `appends` overlaps a `writes` entry of a task
  that is in progress. Two paths overlap when they are equal, or when one
  ends in `/` and the other starts with it.

## Claim it

```sh
yarn task claim T-0042
```

The claim writes `work/claims/T-0042/claim` (one worker alone creates it),
sets in the task file `status: in-progress` and

```yaml
claim:
  by: claude-code/<model>
  since: 2026-11-20T02:10:00Z
  beat: 2026-11-20T02:10:00Z
```

and makes the task's tree ([Trees](#trees)), whose path it prints. A
claim is not taken by hand: no tree would be made. `work/claims/` is not
committed.

## Work

- Change files only in your tree, and only the paths in `writes`. In a
  file under `appends`, make small additions only. Commit them on
  `task/T-0042` in the tree.
- Run every heavy command (`e2e`, `platform:test`, `platform:check`,
  `test:demo`, `vitest`, `yarn test`, `yarn test:all`) through
  `node <main checkout>/scripts/task.mjs run T-0042 -- <command>`, from
  the tree. Every worker shares the one machine with the submits of the
  others: a suite started beside
  the queue takes cores the slots count as free, so every run and every
  submit on the machine slows down.
- Something wrong in a file that is not yours is written into your Log
  entry under "Found", or becomes a new task with the next free id, `ready`
  or, while a task it depends on is not done, `backlog`. It is not edited.
- A check that fails only in files outside your `writes` is not yours to
  fix: name the files in the Log.
- Set `beat` to the current time when you add a Log entry. A claim whose
  `beat` is older than four hours is stale.
- Stop when "Done when" holds, when you are blocked, or when your session
  ends. In each case, log first.

## Log

Add an entry at the end of the task's `## Log` before you stop, whatever
the reason. An entry holds:

```markdown
### 2026-11-20 03:40, claude-code/<model>

Did: what was built, measured or decided.
Checks: each command of `checks`, with pass or fail and the numbers (tests,
parity: matched, differing, missing, excepted).
Left: what "Done when" still asks for.
Found: what is wrong outside this task's files, with the path.
Files: what was created, changed and deleted.
Not verified: what was assumed or not run.
```

The heading is `### YYYY-MM-DD HH:MM, <worker>`, the time in UTC, with
nothing after the worker. The lint refuses any other heading, quoting it.
The command still reads two other forms, ` UTC` after the time and words in
parentheses after the worker, so that the Logs written so stay readable.

The Log is the report. Whatever the next worker needs is in it and nowhere
else.

## Submit for review

A task reaches `review` only through `task submit`
(`node scripts/task.mjs submit T-0042`, which needs Node and nothing
installed): it does the steps below and writes the entry the reviewer and
the lint look for. A task moved to `review` by editing its file fails the
lint and is not accepted.

1. Commit the change on `task/T-0042` in the tree.
2. Run every command in `checks`, in the tree. All pass, or the Log says
   which fails and why that is outside this task.
3. Check the scope: every file the tree changed from its base is under
   `writes` or `appends` (`yarn task scope T-0042`, or
   `git -C <tree> diff --name-only $(git -C <tree> merge-base main HEAD)`).
4. Add the Log entry, and submit. `submit` sets `status: review`, removes
   the three lines under `claim:` and the claim file, and writes the
   commit it checked into its entry.

## Release without finishing

Log what was done and what is left, and run `yarn task release T-0042`
(`--blocked` with the task or decision it waits for named in the Log).
Commit what the next worker should start from: a clean tree is removed,
and a branch with commits of its own is kept for the next claim; a tree
that is not clean is left as it is. Leave the change in a state that
passes the task's checks, or say in the Log which do not.

## Review

A reviewer is any worker that did not submit the task. A task of kind
`decision`, or one that needs `owner`, is accepted by the owner only.

Before you start, mark the task as under review, so that no second
reviewer starts the same review: `yarn task review T-0042`, or by hand,
in the task file, after the last field,

```yaml
review:
  by: claude-code/<model>
  since: 2026-11-20T04:00:00Z
  beat: 2026-11-20T04:00:00Z
```

A task that holds another worker's mark is not yours to review; a task
in review without a mark is anyone's. Set `beat` to the current time while
the review runs. A mark whose `beat` is older than four hours is stale,
as a claim is, and another reviewer takes it over. While a mark holds, the
verdict is its reviewer's or the owner's. The verdict, a withdrawal, or
`review T-0042 --drop` removes the mark (the four lines). When a reviewer
stops before its mark is stale, the way past the mark is the owner's
decision with `--owner`, as a `person/<handle>`; any other reviewer waits
until the mark is stale.

1. Read the task and its Log. Rerun `checks`. Read the changed files, and
   check that each is under `writes` or `appends`. A check rerun by hand
   compares every part of the parity comparison, which is what a task
   that changes a path the parts share is accepted on: one whose
   submission says `Parity: compared every part`, or whose checks hold
   no parity comparison. For a task whose
   submission names its parts, the reviewer may compare those alone
   (`AEP_PARITY_PARTS=<part>,<part>` before the command).
2. **Accept**: add a Log entry with the checks' results, set `status:
done`. Then set to `ready` every `backlog` task whose `depends-on` are
   all done, whatever its priority: a task waits only for what it depends
   on, and the backlog holds only tasks that wait. A step that has to
   follow another names that step's tasks in `depends-on`.
3. **Reject**: add a Log entry with the findings, each one checkable, and
   set `status: ready`.

## What a worker never does

- Edit a file outside its task's `writes` and `appends`.
- Edit another task's file, or its Log.
- Run `prettier --write`, or any command that rewrites files, on paths
  that are not its own. Format your own files by naming them.
- Delete anything outside its `writes`.
- Run a git command that changes anything outside its own tree and
  branch: no commit, rebase or checkout in the main checkout or another's
  tree, and no `push` or `fetch` anywhere. Only `land` changes the main
  checkout.
- Accept its own task.
- Break an agreement of [`agreements.md`](./agreements.md).

## A new task

Copy the frontmatter of a neighbour, take the next free id, and fill
every field: `id`, `title`, `status`, `kind`, `step`, `rfc`, `priority`,
`depends-on`, `writes`, `appends`, `needs`, `checks`, `claim`; then
`## Context`, `## Done when`, `## Out of scope`, `## Log`. Its `status` is
`ready` when every task in `depends-on` is done (or it names none), and
`backlog` otherwise. Paths have no wildcards; a directory ends in `/`. A task is never renumbered or deleted;
one that is no longer wanted gets `status: dropped` and a Log entry saying
why.

| Field    | Values                                                                    |
| -------- | ------------------------------------------------------------------------- |
| `status` | `backlog`, `ready`, `in-progress`, `review`, `done`, `blocked`, `dropped` |
| `kind`   | `build`, `measure`, `fix`, `research`, `review`, `decision`               |
| `needs`  | `owner`, `browser`, `docker`, `network`, `reference-app`                  |
