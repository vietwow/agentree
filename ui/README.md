# ui

The web UI of agentree. It reads the daemon (`agentree serve`) and
writes through it: the pages ported from
[gr8r-studio](https://github.com/gr8rstudio/gr8r-studio) (the side bar,
Projects, Favorites, Activity, Tasks with its List, Board and Table,
Progress as its Timeline, and the task drawer) and Home, Slots, Review,
Memory, Documents, Agents, Live and Numbers in the same look. It holds
no data of its own: `agentree demo <directory>` makes the sample
projects it was built on.

## Running it

Node.js 26.13.1 and pnpm 12.23.0, as [RFC 0001](../rfcs/0001-agentree/README.md#what-it-is-written-in)
names them:

```sh
node src/command/main.ts demo ../agentree-demo   # once, from the repository's root: the sample projects
node src/command/main.ts serve                   # the daemon, on 127.0.0.1:4517; open the address it prints
cd ui
pnpm install
pnpm dev        # http://127.0.0.1:5173, passing /api on to the daemon (AGENTREE_DAEMON names another)
pnpm build      # typecheck, then the build into dist/, which the daemon serves at its own address
pnpm lint       # oxlint, stylelint, and scripts/check-design.mjs
```

The page carries the daemon's token as a cookie, set by opening the
address `agentree serve` prints; the development server's page sends
the same cookie.

## Visual checks

`tests/visual/` shoots every page, and the task drawer, in the light and
dark themes at 1440 and 465 pixels wide, with the clock fixed and motion
reduced, and compares each shot pixel by pixel with the one taken before.
Each run makes the sample projects anew under `.demo/` and starts a
daemon of its own on them, its clock held at the moment the sample is
counted back from:

```sh
npx playwright install chromium   # once
pnpm test:visual:update           # take the shots a change is compared with
pnpm test:visual                  # compare; the report is in playwright-report/
```

The shots depend on the machine's fonts and rendering, so each machine
takes its own and none is committed.

## Where things are

| Path             | What                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/design/`    | The design system: tokens, base, motion, components and formatting. It imports nothing from the app                            |
| `src/themes/`    | Themes over the tokens: Live's paper palette, and agentree's status, priority, kind and tool colours                           |
| `src/board/`     | The shapes the pages read, the reads and writes of the daemon (`daemon.ts`), and the counts made from them, as plain functions |
| `src/shell/`     | The side bar, the top bar, the command menu, the pages and the theme                                                           |
| `src/pages/`     | Home, Projects, Favorites, Activity, Progress, Slots, Review, Memory, Documents, Agents, Live and Numbers                      |
| `src/tasks/`     | The Tasks page: the view toolbar, the List, Board and Table, and the task drawer                                               |
| `src/ui/`        | agentree's marks: a status, a priority and a tool, and their colours                                                           |
| `src/gr8r.css`   | The app's own parts after gr8r-studio: shell, task rows, board, table, timeline, drawer                                        |
| `src/live.css`   | The Live page's parts, after pequalnp's live fleet viewer                                                                      |
| `src/styles.css` | The entry: Tailwind, the fonts, the imports in cascade order, and the Home page's parts                                        |

## The design system

`src/design/` is meant to carry to another project as it is.

- **Tokens, in three tiers.** `tokens/palette.css` holds the raw colours,
  and only a theme reads them. `tokens/theme.css` holds the semantic
  colours (`--ink-2`, `--line`, `--good`) for light and dark.
  `tokens/scale.css` holds type, radius, shadow, motion and layers. A part
  that needs its own value names it as a component token (`--side-row`,
  `--btn-disabled-opacity`) on top of these.
- **Styling.** A part is a React component in `components/` with its
  semantic class in `components.css`. Tailwind in markup is for layout. An
  inline style carries only a value computed at run time.
- **A page theme** sets the semantic tokens inside its page (`.page.live`
  in `themes/live.css`), so shared components on that page take its colours.
- **Escape** closes the topmost open layer only (`components/escape.ts`).
- **The guards** live in `pnpm lint`:
  - oxlint keeps `src/design/` from importing the app.
  - stylelint checks the CSS.
  - `scripts/check-design.mjs` fails on a colour, font size, duration,
    z-index above 9, or palette read written outside the tokens, the themes
    and the sample data.

A tool's mark is a letter on a colour of agentree's own, never the
tool's logo.
