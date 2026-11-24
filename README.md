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
a tree's install into a volume at its claim, and what the RFC lists
after its first version beyond these.

```sh
pnpm install
pnpm test        # node:test, on real repositories in a temporary directory
pnpm typecheck
pnpm lint        # oxlint; the core imports Node's own modules only
node src/command/main.ts --help
pnpm link --global   # puts `agentree` on the path, as the hooks and MCP entries of a project run it
```

Node.js 26.13.1 runs the TypeScript files as they are; nothing is built.

With Docker, the daemon runs in a container and starts a project's
commands as containers of the project's image:

```sh
AGENTREE_PROJECTS=/absolute/path/of/your/projects docker compose up --detach --build
ln -s "$PWD/bin/agentree" /usr/local/bin/agentree   # the host's script: the command in the daemon's container
docker exec agentree cat /var/lib/agentree/token     # the token of the address to open: http://127.0.0.1:4517/?token=...
```

Where it comes from: the way of working was built and used first inside
another repository, as files and a command (`scripts/task.mjs`). What was
learned there is in [`docs/origin.md`](./docs/origin.md).
