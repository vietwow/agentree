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
pnpm lint       # oxlint, stylelint, and scripts/check-design.mjs
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

| Path             | What                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `src/design/`    | The design system: tokens, base, motion, components and formatting. It imports nothing from the app       |
| `src/themes/`    | Themes over the tokens: Live's paper palette, and agentree's status, priority, kind and tool colours      |
| `src/board/`     | The task as the UI sees it, the sample tasks, and the counts and filters, as plain functions              |
| `src/shell/`     | The side bar, the top bar, the command menu, the pages and the theme                                      |
| `src/pages/`     | Home, Projects, Favorites, Activity, Progress, Slots, Review, Memory, Documents, Agents, Live and Numbers |
| `src/tasks/`     | The Tasks page: the view toolbar, the List, Board and Table, and the task drawer                          |
| `src/ui/`        | agentree's marks: a status, a priority and a tool, and their colours                                      |
| `src/gr8r.css`   | The app's own parts after gr8r-studio: shell, task rows, board, table, timeline, drawer                   |
| `src/live.css`   | The Live page's parts, after pequalnp's live fleet viewer                                                 |
| `src/styles.css` | The entry: Tailwind, the fonts, the imports in cascade order, and the Home page's parts                   |

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

The sample tasks are read against a clock fixed at 15:00 of the current
day, so the page shows the same whenever it is opened. A tool's mark is
a letter on a colour of agentree's own, never the tool's logo.
