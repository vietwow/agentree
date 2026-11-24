# Seed: the board as copied from `../aep`

A copy of the files of `../aep` that agentree starts from, taken on
2026-11-23, after that repository's T-1063 (a worktree a task) was
accepted and its first real task landed (commit `dbd6230` there: T-1072 bounds the landing lock's waits).
They are the material to split into agentree's core and a project's
adapter; they are not agentree's code yet, and nothing here runs as it is.

| Path                                                              | What it is                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aep/scripts/task.mjs`, `task.test.mjs`                           | The task command and its tests (trees only: one board, a worktree and branch a claim, landing by fast-forward under a lock; T-1066's guard on an empty submit).                                                   |
| `aep/scripts/lib/worktrees.mjs` and its test                      | The git work of trees: the board's root, making and removing a tree, the landing lock, `merge --ff-only`.                                                                                                         |
| `aep/scripts/checkSlots.mjs` and its test                         | The machine's queue of heavy checks.                                                                                                                                                                              |
| `aep/scripts/lib/shellWords.mjs` and its test                     | Splitting a check's command into words, used by the narrowing.                                                                                                                                                    |
| `aep/scripts/lib/newTree.mjs`                                     | Which packages of that repository a check covers: an example of what belongs in a project's adapter, not in the core.                                                                                             |
| `aep/work/README.md`, `aep/work/schema.json`                      | The protocol and the schema of a task file.                                                                                                                                                                       |
| `aep/rfcs/0006-agent-task-board/README.md`                        | The board's design.                                                                                                                                                                                               |
| `aep/docs/engineering/worktrees.md`                               | The design of a worktree a task and the owner's answers.                                                                                                                                                          |
| `aep/briefs/`                                                     | The briefs the coordinator gave its workers and reviewers, and its notes. Much of them is that project's own (its services, its providers).                                                                       |
| `aep/apps/web/parity/README.md`, `aep/apps/web/parity/tools/`     | How that repository reproduced an interface from a reference application: the record's form, how it was measured, and the reader (`measure.js`, with that reference's part definitions) and its inventory script. |
| `icon-grab/icon-grab-prompt.md`, `icon-grab/tools/split_icons.py` | The owner's template for a session that fetches a set of icons from a site, and the script its step 6 runs. Not from `../aep`; kept as written, in the owner's language.                                          |

In the copies, the owner's handle and the paths of the machine are
replaced by placeholders. The tests import paths of that repository
(`package.json` scripts, `.github/workflows`, `vitest.config.mts`) and
expect its layout; they will not pass here until the split.
