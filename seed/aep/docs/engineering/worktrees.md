# Worktrees: each worker builds in a tree of its own

Each worker builds its task in a git worktree of its own, beside the
repository, while the board (`work/tasks`, `work/claims`, the slot queue)
stays one, in the main checkout. It is the board's one way of working:
nothing is built in the main checkout but a landing. This is the design
as T-1063 built it, and its reasons;
[`work/README.md`](../../work/README.md#trees) says how a worker and the
coordinator run it.

Every git fact below was read in git's own documentation at the installed
version, 2.54.0 (Apple Git-157): `git help worktree`, `git help branch`,
`git help merge`, `git help merge-base`, `git help rebase` and
`git help gitrepository-layout`, and is held by the tests of the task
command (`scripts/task.test.mjs`, "trees"; `scripts/lib/worktrees.test.mjs`).
Where an output was kept, [Outputs](#outputs) names its file.

## Why

On 2026-11-22 every worker built in one checkout, and three failures came
from that alone: a file landed under another worker's submit and turned 38
of its tests red; a change of `scripts/task.mjs` refused the submits that
were running it; and every run had a share of one machine's 14 cores,
whoever was building what. A tree of its own gives each task a change
that is its own, measured from a commit, and that reaches `main` only as
a whole, after its review.

## What git gives

- A repository has one main worktree and any number of linked ones
  (`git worktree add <path> <commit-ish>`). A linked worktree shares
  everything with the main one except its per-worktree files, such as
  `HEAD` and the index; every ref under `refs/` is shared, but
  `refs/bisect`, `refs/worktree` and `refs/rewritten`.
- The configuration file and `info/exclude` are those of the common
  directory, so every worktree has the same ones. `.gitignore` is a file
  of each tree, at its commit.
- `git worktree add` refuses a branch that another worktree has checked
  out, and `git branch -f` refuses to move one. `git worktree list` names
  the main worktree first, and `--porcelain` gives it in a stable form.
- `git worktree remove` removes only a clean worktree (no untracked file,
  no modified tracked file) unless `--force` is given; the main worktree
  cannot be removed. A worktree deleted any other way leaves its entry
  under `.git/worktrees/` until `git worktree prune`.
- `git merge --ff-only` fast-forwards or refuses with a non-zero status.
  `git merge` stops, changing nothing, when uncommitted changes overlap
  the files it would update. `git merge-base --is-ancestor A B` exits 0
  when A is an ancestor of B, 1 when not, and with another status on an
  error.
- `git update-ref` moves a ref with no check for a worktree that has it
  checked out (its documentation names no worktree). Moving `main` with
  it while the main checkout is on `main` would leave that checkout's
  index and files behind its `HEAD`. No step below uses it.

## The owner's answers

The owner decided on 2026-11-23 (T-1062's Log, and T-1063's "Done when"
for the last):

1. A task's change is measured from a commit, not from the claim's
   record of hashes, which only a shared checkout needed.
2. The worker commits on `task/T-NNNN` in its own tree; the base is the
   head of `main`.
3. The coordinator lands accepted tasks, in order, by fast-forward of
   `main` in the main checkout.
4. A stale change is refused: its worker rebases in its own tree, runs
   the checks again and is reviewed again.
5. The board stays in the index, committed only on the owner's word.
6. Each tree has its own install.
7. The trees live beside the repository, in `../aep-trees/`.
8. The check slots stay at 3 (`AEP_CHECK_SLOTS`).
9. Trees are the board's only way of working (03:18): the modes in which
   workers built in the main checkout are removed.

`work/agreements.md` allows the git this needs: a worker commits and
rebases on its own task's branch, in its own tree; the coordinator
fast-forwards `main` in the main checkout with an accepted task; a claim
makes the task's tree and branch in `../aep-trees/`, and the task's end
removes them. Nothing is pushed.

## The design

### One board, in the main checkout

The main checkout is the board's: its `work/tasks/`, its `work/claims/`
(the claims, the locks and the records of the trees) and its slot queue
(`node_modules/.cache/check-slots/`) are the only ones. The task command
finds it from any tree (`checkoutOf`, `scripts/lib/worktrees.mjs`): a
checkout whose `git rev-parse --git-dir` is not its `--git-common-dir`
is a linked worktree, and the board is the first worktree of
`git worktree list --porcelain`. A worker runs the command of the main
checkout (`node <board>/scripts/task.mjs ...`), so that every worker runs
one version of it and reads one board; one run from a tree's own copy, or
with `--root` naming a tree, is refused and names the board's, as a
tree's copy of the board is that of its commit. `lint` alone runs there,
on the board's tasks, since the tree's `yarn lint:repo` runs it.

### A task's tree

- **The claim.** The claim file `work/claims/T-NNNN/claim` is created with
  exclusive create, for one worker alone. The command then runs
  `git worktree add -b task/T-NNNN ../aep-trees/T-NNNN <head of main>`,
  refused while `main` has no commit, or when that directory or branch is
  there and no record names it, and records the tree, the branch, the
  base commit and `main` in `work/claims/T-NNNN/tree`, ignored by git.
  The tree is installed (`install --immutable` with the Yarn of its
  `.yarnrc.yml`); a new tree whose install fails is removed with its
  branch, and the claim is refused.
- **The record outlives the claim.** It stays through the review, a
  rejection, a release and a change sent back, so that the task's next
  claim works in the same tree, or makes it again from the kept branch.
- **What waits.** A claim is refused while a task in progress writes the
  same paths, while a task it depends on is accepted and not landed, and
  while a task not in progress whose tree is not landed writes the same
  paths: the claim's tree is made from `main`, which lacks those changes.
- **The worker** changes files only in its tree, under its task's paths,
  and commits them on its branch; no file of `work/tasks/` is changed in
  a tree.
- **The scope check** is `git diff` of the tree against its base, the last
  commit its branch shares with `main` (`git merge-base`): the commit it
  was made at, until a rebase on `main`. Every file outside the task's
  paths fails it, and so does a task file. No other commit is measured
  from, and no file is set aside: a hidden file would land.
- **The end.** A release (while its claim still holds) and a landing
  remove the tree with `git worktree remove`, without `--force`, so a
  tree that is not clean is left and the files that hold it are named;
  and the branch, once `main` holds every commit of it. A branch with
  commits of its own is kept for the next claim: nothing committed is
  lost by a release. The record goes when nothing of it is left.

### Checks in a tree

- **What runs there.** The narrowing, the parity scope, the weighing of a
  check (`takesSlot` reads the tree's `package.json`), Prettier's check
  and the checks themselves run in the task's tree. A submit refuses a
  tree that is not clean or has another branch out before any check runs,
  and one not at the same commit after them; its entry names the commit
  it checked (a line `Committed as <commit> on task/T-NNNN, from main at <base>.`).
- **Dependencies.** Each tree has an install of its own. A tree that
  links to the main checkout's `node_modules` would run the main
  checkout's code: Yarn's `node-modules` linker writes each workspace as
  a relative link (`node_modules/@aep/platform -> ../../modules/platform`,
  kept in `machine.txt`), which resolves inside the directory the link is
  in.
- **Slots.** Every check of every tree waits in the board's one queue
  (`checkRunner` and `runInTurn` of `scripts/checkSlots.mjs`, with
  `board`), so a seat's `E2E_PORT_OFFSET` is unique on the machine.
- **Databases.** An integration test makes a schema of its own in
  `aep_test`, and a test of the cache keeps its keys under a prefix of its
  own, so trees share them as tests always have. The database `aep` is
  never migrated from a tree.
- **Ports.** The `sign-in` project's preview stays on 5173 in every run,
  so one sign-in run at a time on the machine. The dev servers (`api`
  7100, `worker` 7101, the web app 5173) are the main checkout's.

### Landing

`task land T-NNNN`, by the coordinator, one landing at a time under
`work/claims/landing.lock`. The lock holds its holder's pid and a token;
its holder removes it only while it holds that text. A lock whose process
is gone is removed under a second lock, `landing.lock.takeover`, created
for one process alone: under it the lock is read again and removed only
while it still holds the dead holder's text, so of the landings that find
it at once one alone goes in (held by a test of eight processes, eight
rounds). In the main checkout, which must have `main` out:

1. A branch already on `main` is only cleaned up.
2. The change is sent back, the task `ready` again with the lander's
   entry, its tree and branch kept, when its branch is not at the commit
   its submission checked; when it is stale (`git merge-base
--is-ancestor main task/T-NNNN` exits 1: its checks ran without what
   landed since); when it holds a file outside the task's paths; or when
   it holds a task file, which `git merge` would stop on, since the
   board's task files are the main checkout's own changes.
3. `git merge --ff-only task/T-NNNN`, which moves `main` only by a
   fast-forward and stops, changing nothing, when the main checkout's own
   changes meet the files it updates.
4. When the change holds `yarn.lock`, the main checkout installs again
   before the lock is given back.
5. The tree and the branch are removed.

`task sweep` keeps running on the main checkout: the whole tree after
the landings, which finds what two changes that landed one after the
other break together.

### Review

The reviewer reads the change as `git diff <base>...task/T-NNNN` and runs
the checks again in the task's tree, through the board's queue
(`task run T-NNNN -- <check>`). Both only read git.

### Git

No command pushes, fetches or names a remote. A claim and a release change
only the task's own tree and branch; only a landing changes the main
checkout. `git worktree add` refuses a branch another tree has out, and
`git status` in a tree is run with `--no-optional-locks`, so reading a
tree takes no lock of its index.

## What it costs

The measurement ran on 2026-11-23 at about 00:40Z, with `main` at the
owner's first commit `f45a6c7`, with a worktree of it in the scratch
directory, made with
`git worktree add -b w139-measure-t1060 <path> f45a6c7`. Only some of its
outputs were kept; a value marked "seen" was read on the screen and its
output was not kept, and nothing below rests on it.

| Step                                                                               | Value                                                                                         | Output              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| `git worktree add` of 4,762 files                                                  | 3.2 s, 209 MB                                                                                 | seen, not kept      |
| `node .yarn/releases/yarn-4.18.1.cjs install --immutable`                          | 50.6 s: fetch 1.3 s from the global cache, link 48.5 s; built `better-sqlite3`; exit 0        | kept, `install.log` |
| The tree's `node_modules`, the tree                                                | 2.0 GB, 2.4 GB                                                                                | seen, not kept      |
| `vitest run packages/model/src/blueprint.test.ts --maxWorkers=1`, first and second | 1.9 s, 1.0 s; 39 tests pass                                                                   | seen, not kept      |
| The same in the main checkout                                                      | 1.1 s                                                                                         | seen, not kept      |
| `git worktree remove <path>`, without `--force`, with `node_modules` in it         | 31.4 s, exit 0                                                                                | seen, not kept      |
| `git branch -D w139-measure-t1060`; `git worktree list` names the main checkout    | done                                                                                          | seen, not kept      |
| The machine, at 00:53Z                                                             | 14 cores; 502 GiB free of 3.6 TiB (87% used); global cache 2.0 GB; main `node_modules` 2.4 GB | kept, `machine.txt` |

What the kept outputs support: an install from the global cache takes
about 51 s, nearly all of it writing `node_modules`, and one install's
`node_modules` is of the order of the main checkout's 2.4 GB. The claim's install in a tree of this repository has not been timed
since.

## Outputs

In the scratch directory of the session that wrote this design,
`<session scratchpad>/claude-code-fable-5.2-cli-w139/`,
which a reboot or a cleanup removes:

- `install.log`: the install's output.
- `machine.txt`: the cores, the free disk, the sizes of the global cache
  and the main checkout's `node_modules`, and a workspace link, at
  00:53Z.
- `git-state.txt`: `git status`, `git branch --list`,
  `git worktree list --porcelain` and the count of `git ls-files`, at
  00:53Z.
- `worktree.txt`, `branch.txt`, `merge.txt`, `merge-base.txt`,
  `rebase.txt`, `gitrepository-layout.txt`: git's pages as read.

## Not verified

- That Node resolves an import through a linked `node_modules` to the
  main checkout's sources: read from the links, not tried in a tree.
- Whether the install asked the registry: it ran on a full global cache.
- The claim's install and a tree's removal in this repository since the
  measurement; the tests make trees of small repositories with an install
  that only writes a file.
- The time of a typecheck, lint or integration test file in a new tree.
- The cost of more slots, and of an APFS clone of `node_modules`.
