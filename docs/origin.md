# Origin: what was built and learned in `../aep`

agentree's design comes from the task board of a sibling repository,
`../aep`, where many agents of several tools built one product side by side
for days. This page says what to read there and what was learned. Read the
files there; do not change them from here.

## What to read in `../aep`

| Path                                                  | What it holds                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work/README.md`                                      | The protocol: task files, statuses, claim, beat, Log, scope, submit, review, accept.                                                                                                                                                                       |
| `work/schema.json`                                    | The schema of a task file, the statuses, the kinds and the grammar of a worker's name.                                                                                                                                                                     |
| `work/agreements.md`                                  | The owner's standing instructions for that repository. An example of the kind of file a project keeps; its content is that project's own.                                                                                                                  |
| `work/tasks/`                                         | About a thousand real task files with their Logs: how tasks are written, claimed, rejected, repaired, accepted.                                                                                                                                            |
| `scripts/task.mjs`, `scripts/task.test.mjs`           | The command (`task next`, `claim`, `beat`, `log`, `scope`, `submit`, `withdraw`, `release`, `review`, `accept`, `reject`, `new`, `lint`, `run`, `sweep`, `land`). About 4,400 lines; the core to extract and the project's adapters are mixed in it today. |
| `scripts/checkSlots.mjs` and its test                 | The machine's queue of heavy checks (slots), shared by every worker on one machine.                                                                                                                                                                        |
| `scripts/lib/worktrees.mjs` and its test              | The git work of trees.                                                                                                                                                                                                                                     |
| `rfcs/0006-agent-task-board/README.md`                | The board's design, why files in the repository, several machines and accounts.                                                                                                                                                                            |
| `docs/engineering/worktrees.md`                       | The design of a worktree a task (T-1060), its costs measured on one machine, and the owner's answers (T-1062's Log).                                                                                                                                       |
| `apps/web/parity/README.md`, `apps/web/parity/tools/` | How an interface was reproduced from a reference application: the record's form, how it was measured in Chrome, the reader (`measure.js`) and its scripts.                                                                                                 |
| `apps/web/e2e/parity/`, `apps/web/e2e/parity.test.ts` | The comparison of the built pages with the records, and which parts a changed file can change (`scope.ts`).                                                                                                                                                |
| `AGENTS.md` ("Non-negotiables", "Comments and names"), `docs/engineering/` | The engineering standard the origin is built to: what a new project's template is made from. |
| `AGENTS.md` ("Taking work")                           | How every tool is told to use the board.                                                                                                                                                                                                                   |

A copy of the files to start from is in [`seed/`](../seed/README.md).

## The state there on 2026-11-23

- The board ran in a shared checkout, first with many workers at once
  (`parallel`), then with one (`single`). T-1063 (accepted that day)
  replaced both with trees: each task a branch `task/T-NNNN` in its own
  worktree beside the repository, landed on `main` by
  `git merge --ff-only` under a lock. The first real task (T-1072) was
  claimed, built, reviewed and landed in a tree that day, and eleven
  builders then worked in eleven trees at once.
- A claim records a SHA-256 of each file of its scope, and changes are
  read from that record, not from `HEAD` (T-1059).
- A build or fix submit that changed no file of its paths is refused
  before any check runs (T-1066).
- Review is independent in every mode: no worker accepts its own task.

## What was learned

Each of these cost hours there; the design here should make them
impossible rather than repeat their fixes.

1. **Reading changes from git's `HEAD` makes the board blind after a
   commit.** The first commit hid every change made before it, and a
   submit's checks narrowed to nothing and passed. Fixed by the claim's
   record of hashes, plus a guard on an empty submit.
2. **Changing the board's own code under a running submit breaks it.**
   Landings of the command waited for every submit to end.
3. **Workers sharing one checkout see each other's half-made changes.**
   A change landed under another task's submit turned its tests red.
   This is the reason for a worktree a task.
4. **Machine load makes tests flaky.** Tests that read query plans or
   races of the UI failed only under load; a slot queue bounds the heavy
   checks, and each flaky test got its own task.
5. **A whole visual comparison takes 40 to 50 minutes.** The board
   narrows it to the parts a task's files can change; the owner is asked
   before a task that changes what every part shares.
6. **Independent review catches what builders and checks miss.** Leaks
   of secrets, races, files outside a task's scope reaching `main`
   (through an "not mine" flag, or a base given by hand), a release that
   could remove another worker's tree, a lock taken twice. An early
   review of a copy, before the submit, saved a round of rejection.
7. **Sessions stop without warning** (a quota, a closed app). The next
   worker has nothing but the task's Log, so every stop writes one; a
   claim that is not beaten goes stale.
8. **Some tools cannot run every command.** A session's permission system
   may refuse a command; a refused command is never sent again in
   another form, and the person is told.
9. **Several tools worked side by side**: Claude Code in a terminal
   (several sessions), Claude Desktop, Antigravity, Cursor. Worker names
   are `<tool>/<model>[-suffix]`; Desktop sessions used a `-desktop-`
   suffix under `claude-code`, and Codex had no name yet.

10. **Trees cost about a minute and 2.4 GB each.** Measured on the first
    real task: the claim with its own `yarn install` took 61 s (55 s of it
    linking), and the tree held 2.4 GB, 2.0 GB of it `node_modules`. Many
    claims at once make the machine slow, so builders were started in
    waves.
11. **Every landing makes every other tree stale.** A landing takes only
    a fast-forward, so after one task lands each other task rebases on
    `main` in its own tree and reruns its checks before it submits.
12. **A reviewer reads the branch, not the board.** `review` and `accept`
    read the task file; what ties an accept to code is the landing, which
    refuses any head other than the submitted commit. A reviewer reads
    `git diff <base>...task/T-NNNN` itself.
13. **A bounded wait that regresses hangs the test run.** The lock's
    waits are a synchronous loop that the test runner's timeout cannot
    stop; such a case belongs in a child process with a timeout.
14. **The landing becomes the board's bottleneck.** With about eighteen
    builders and four slots for heavy checks, 21 accepted tasks waited to
    land on 2026-11-24. Almost every accepted branch was stale, so each
    landing rebased it and ran its checks again while it held the
    landing lock, and those checks waited in the slot queue behind every
    submit's (four slots held by checks of 40 to 73 minutes, twelve
    tickets waiting). Claims whose paths met an accepted, unlanded tree
    were refused, so builders stopped with nothing to take. The answers
    there are T-1088 (a landing rebases, installs and checks before it
    takes the lock; under the lock it confirms `main` has not moved and
    fast-forwards, or starts again) and T-1115 (a landing's checks take
    the next free slot before any submit's). Here the daemon lands
    (`src/daemon/landings.ts`): a landing rebases and checks before it
    takes the lock and goes ahead only on the `main` its checks ran on
    (`landThrough` in `src/core/board/lifecycle.ts`), and its checks
    wait in the queue before every run but another landing's.
