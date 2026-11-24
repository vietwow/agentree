# ui

The web UI of agentree, on sample data (`src/board/fixtures.ts`): the
pages ported from [gr8r-studio](https://github.com/gr8rstudio/gr8r-studio)
(the side bar, Projects, Favorites, Activity, Tasks with its List, Board
and Table, Progress as its Timeline, and the task drawer) and Slots,
Review, Memory, Documents, Agents and Numbers in the same look. It reads no daemon and writes nothing.

## Running it

Node.js 26.13.1 and pnpm 12.21.0, as [RFC 0001](../rfcs/0001-agentree/README.md#what-it-is-written-in)
names them:

```sh
cd ui
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm build      # typecheck, then the build into dist/
```

## Visual checks

`tests/visual/` shoots every page, and the task drawer, in the light and
dark themes at 1440 and 465 pixels wide, with the clock fixed and motion
reduced, and compares each shot pixel by pixel with the one taken before:

```sh
npx playwright install chromium   # once
pnpm test:visual:update           # take the shots a change is compared with
pnpm test:visual                  # compare; the report is in playwright-report/
```

The shots depend on the machine's fonts and rendering, so each machine
takes its own and none is committed.

## Where things are

| Path                | What                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `src/board/`        | The task as the UI sees it, the sample tasks, and the counts and filters, as plain functions |
| `src/shell/`        | The side bar, the top bar, the pages and the theme                     |
| `src/pages/`        | Projects, Favorites, Activity, Progress, Slots, Review, Memory, Documents, Agents and Numbers |
| `src/tasks/`        | The Tasks page: the four cards, the view toolbar (search, filter, sort, group, columns), the List, Board and Table, and the task drawer |
| `src/ui/`           | The design's controls: button, select, pop, badge, a tool's and a kind's mark |
| `src/gr8r.css`      | gr8r-studio's styles, ported: its tokens unlayered, its rules in `@layer components` |
| `src/styles.css`    | agentree's tokens of colour, radius and shadow, light and dark, the fonts (Geist and Geist Mono, gr8r-studio's, from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`), and what it adds to gr8r-studio's rules |

The sample tasks are read against a clock fixed at 15:00 of the current
day, so the page shows the same whenever it is opened. A tool's mark is
a letter on a colour of agentree's own, never the tool's logo.
