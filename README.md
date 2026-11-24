# agentree

A task board for AI coding agents of every tool, with a git worktree per
task, independent review, landing by fast-forward, and a live board in the
browser.

Status: being built while its first RFC,
[`rfcs/0001-agentree`](./rfcs/0001-agentree/README.md), is a draft.

| Path           | What                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `src/core/`    | Every rule of the board, as a library on Node alone: the task file, the board's two places, its changes |
| `src/command/` | `agentree <subcommand>`: the core on the command line                                                   |
| `ui/`          | The web UI, on sample data ([`ui/README.md`](./ui/README.md))                                           |
| `seed/`        | The origin's command and protocol, the material the core is split from                                  |

The core holds the task file, the board on its branch `agentree/board`,
the machine's state under the git common directory, and these changes:
`init`, `new`, `claim` (with the task's tree), `beat`, `log`, `ask`,
`answer`, `tick`, `release`, `move`, `promote` and `lint`. Submitting,
checks, review, landing, the daemon, MCP and the kickstart of each tool
are not built yet.

```sh
pnpm install
pnpm test        # node:test, on real repositories in a temporary directory
pnpm typecheck
pnpm lint        # oxlint; the core imports Node's own modules only
node src/command/main.ts --help
```

Node.js 26.13.1 runs the TypeScript files as they are; nothing is built.

Where it comes from: the way of working was built and used first inside
another repository, as files and a command (`scripts/task.mjs`). What was
learned there is in [`docs/origin.md`](./docs/origin.md).
