# agentree

A task board for AI coding agents of every tool, with a git worktree per
task, independent review, landing by fast-forward, and a live board in the
browser.

Status: being built while its first RFC,
[`rfcs/0001-agentree`](./rfcs/0001-agentree/README.md), is a draft.

| Path           | What                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/core/`    | Every rule of the board, as a library on Node alone: the task file, the board's two places, its changes                 |
| `src/command/` | `agentree <subcommand>`: the core on the command line                                                                   |
| `src/daemon/`  | `agentree serve`: the HTTP API the UI reads and writes, the events, and the queue of heavy runs                         |
| `src/mcp/`     | The board's tools as an MCP server: at the daemon's `/mcp/<project>`, and `agentree mcp` over standard input and output |
| `src/demo/`    | `agentree demo <directory>`: four sample projects as real repositories, from the content the UI was built on            |
| `ui/`          | The web UI, reading the daemon ([`ui/README.md`](./ui/README.md))                                                       |
| `seed/`        | The origin's command and protocol, the material the core is split from                                                  |

Built: the task file, the board on its branch `agentree/board`, the
machine's state under the git common directory, a task's whole way from
`new` to `land`, the memory, what each session used, the documents, the
machine's list of projects, the sessions of the tools, the queue of
heavy runs, and the daemon with its API and its events. Not built yet:
the project's container and what a run is measured to take, and the
kickstart of each tool.

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
