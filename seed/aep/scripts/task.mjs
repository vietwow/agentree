#!/usr/bin/env node
/**
 * The task board's command (work/README.md, RFC 0006), run in the main
 * checkout, which holds the one board, for tasks each built in a git
 * worktree of its own (scripts/lib/worktrees.mjs):
 *
 * - a task is `work/tasks/T-NNNN-short-name.md`, its state the frontmatter,
 * - a claim is the file `work/claims/T-NNNN/claim`, which one worker alone
 *   creates, and the claim makes the task's tree and branch,
 * - a report is an entry under the task's `## Log`,
 * - an accepted task lands on `main` by fast-forward (`land`).
 *
 * Usage: node scripts/task.mjs <subcommand> [T-NNNN] [options] [--root <dir>]
 * `node scripts/task.mjs help` lists the subcommands.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { isatty } from 'node:tty';
import { fileURLToPath } from 'node:url';

import { checkRunner, NoSlot, runInTurn, spawnCheck } from './checkSlots.mjs';
import { newTreePackages, packagesIn } from './lib/newTree.mjs';
import { shellWords, simpleCommands } from './lib/shellWords.mjs';
import {
  baseOf,
  branchOut,
  checkoutOf,
  commitOf,
  fastForward,
  filesBetween,
  git,
  gitFailure,
  install,
  isAncestor,
  makeTree,
  removeTree,
  removeTreeRecord,
  reopenTree,
  TREE_RECORD,
  TreeRefusal,
  treeIsThere,
  treeRecordOf,
  treeRecords,
  unclean,
  withLandingLock,
  writeTreeRecord,
} from './lib/worktrees.mjs';

const USAGE = `Usage: node scripts/task.mjs <subcommand> [options] [--root <dir>]

  board                    Every task by status; who holds it, since when; stale claims.
  next [--can a,b]         The ready tasks that can be claimed now, first priority first,
                           and the tasks in review this worker may review, oldest first.
                           Without --can: every task that does not need the owner.
                           With it: only tasks whose needs are all in the list.
                           When no task can be claimed: why, for each ready task, and
                           how many wait for a review.
  show T-NNNN [--log n]    The task, its dependencies, its paths, its last n Log entries (2).
  claim T-NNNN             Takes the task, and makes its tree: the branch task/T-NNNN
                           in ../aep-trees/T-NNNN from the head of main, with its own
                           install, or the tree an earlier claim left.
                           --owner-told for a task that needs the owner.
  beat T-NNNN              Marks the claim alive, or this worker's review mark.
  log T-NNNN               Appends the Log entry read from stdin.
  scope T-NNNN             The files the task's tree changed from its base (the last
                           commit its branch shares with main), against its paths.
  submit T-NNNN            Checks the scope of the commit the tree is at, clean, runs the
                           checks in the tree, and moves the task to review. A scope that
                           fails, or a change not committed, stops it before the first
                           check runs; a tree that moved during the checks refuses it.
                           A heavy check (e2e, platform:test,
                           platform:check, test:demo) waits for one of the machine's
                           AEP_CHECK_SLOTS slots, at most AEP_CHECK_SLOT_WAIT_MINUTES.
                           The parity comparison of an e2e check compares the parts the
                           task's changed files can change (AEP_PARITY_PARTS), and every
                           part when they change what the parts share.
                           A check of the whole tree (yarn platform:check, yarn
                           platform:test) runs on what the task changed: the typecheck
                           of its packages and their dependants, oxlint on its files,
                           the tests related to them; AEP_WHOLE_TREE=1 before the
                           check runs it whole. What it ran is in the Log entry.
                           --allow-failing-checks: a check fails only in files outside
                           the task, and the Log entry names them.
  run [T-NNNN] -- <command> [arguments]
                           Runs the command as submit runs a check: a heavy one waits for
                           a slot of the machine in the same queue, with AEP_CHECK_WORKERS
                           set; a light one runs at once. A signal is passed to the
                           command, or ends the wait; the exit is the command's. The task
                           and AEP_WORKER, both optional, name the run in the queue.
  sweep                    Checks the whole tree (platform:check) under one slot, and
                           on a failure files the task "The whole tree passes its
                           checks again", or adds an entry to it while it is open:
                           each failing test, its file and the task that last wrote it.
  withdraw T-NNNN          Takes a task in review back to in-progress for its submitter;
                           the reason from stdin.
  release T-NNNN           Gives the task back as ready, or --blocked; the reason from stdin.
                           It removes the tree when it is clean, and the branch when it
                           holds no commit main does not.
  review T-NNNN            Marks the task in review as under review by this worker, so
                           that no other reviewer starts it; refused while another's
                           mark holds. --drop gives the mark back. beat keeps it alive.
  accept T-NNNN            The reviewer's Log entry from stdin; the task is done, and the
                           backlog tasks whose dependencies are all done are ready.
                           --owner for a decision, or over another reviewer's mark.
  reject T-NNNN            The reviewer's findings from stdin; the task is ready again.
                           --owner over another reviewer's mark.
  new --title <t> --kind <k> --priority <n>
      [--rfc <NNNN>] [--step <s>] [--depends-on a,b]... [--writes a,b]...
      [--appends a,b]... [--needs a,b]... [--check <command>]...
                           A task with the next free id: ready, or in the backlog while
                           a task it depends on is not done. The options marked ...
                           may be repeated (and take a comma list, but --check); the
                           others take one value and refuse a repeat.
  promote                  Every backlog task whose dependencies are all done is ready.
  lint                     Every task file against work/schema.json and the board's rules.
  land [T-NNNN]            Lands the accepted task on main in this checkout, by
                           git merge --ff-only of its branch, one landing at a time; a
                           stale change, one not as submitted, or one holding a file
                           outside its paths or a task file is sent back, ready again. Then removes the tree and the
                           branch. Without a task: the accepted tasks that wait to land.

A command run from a linked worktree's own copy is refused, and names the
board's checkout (lint reads the board's tasks).

The worker is named by AEP_WORKER: claude-code/<model>, antigravity/<model>,
cursor/<model> or person/<handle>.`;

const STALE_AFTER_MS = 4 * 60 * 60 * 1000;
const STATUS_ORDER = [
  'in-progress',
  'review',
  'blocked',
  'ready',
  'backlog',
  'done',
  'dropped',
];
const SECTIONS = ['## Context', '## Done when', '## Out of scope', '## Log'];
const NO_ENTRY = 'No entry yet.';
/** What `new` writes into a section for its author to replace. */
const TO_BE_WRITTEN = 'To be written.';
/** The first line of the Log entry that `submit` writes. */
const SUBMITTED = 'Submitted for review. Checks, as run by `task submit`:';

/**
 * The lint holds the Log to its form and a task in review or done to its
 * submission from this time on (UTC, to the minute). A done task accepted
 * before it is not refused for having been submitted by hand, and a Log
 * heading dated before it that is not of the form, or lines above the first
 * entry that are dated before it, are named, not refused.
 */
const CHECKED_FROM = '2026-11-20T10:40';

/**
 * The tasks that were in review without the entry of `submit` when the lint
 * began to hold it, and were accepted so. Each is done, so its Log stays as
 * it is: the lint passes it without a word, and names an id of the list
 * only when its task no longer needs it. The list only shrinks: such an id
 * is removed, and none is added.
 */
const SUBMITTED_BY_HAND = new Set([
  'T-0002',
  'T-0005',
  'T-0007',
  'T-0008',
  'T-0012',
  'T-0014',
]);

/** What the command refuses to do, said to the worker without a stack. */
class Refusal extends Error {}

/**
 * A task file that is no longer what the command read: another command
 * wrote it, or a worker by hand. The command does not write it.
 */
class Changed extends Refusal {
  constructor(file) {
    super(
      `${file} changed since this command read it (another command, or an ` +
        'edit by hand), so the command did not write it',
    );
  }
}

/** How often a command starts again from its read of the board, at most. */
const ATTEMPTS = 3;

/**
 * Runs a change of the board: its read, what it decides from it, and its
 * writes. When a task file changed between the read and its write, nothing
 * is written to it and the change runs again from its read, so that it
 * decides on the board as it is now; after ATTEMPTS such runs the command
 * is refused. A change reads the board itself, and is written so that a
 * second run does only what the first left undone.
 */
function fromItsRead(change) {
  for (let attempt = 1; ; attempt++) {
    try {
      return change();
    } catch (error) {
      if (!(error instanceof Changed)) {
        throw error;
      }
      if (attempt === ATTEMPTS) {
        throw new Refusal(
          `${error.message}, ${ATTEMPTS} times over. Run the command again`,
        );
      }
      console.error(
        `task: ${error.message}: it starts again from the board as it is now`,
      );
    }
  }
}

/** Waits on the spot: the command is synchronous from end to end. */
const pause = milliseconds =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

// The command line.

const FLAGS = new Set([
  '--owner-told',
  '--owner',
  '--blocked',
  '--allow-failing-checks',
  '--drop',
]);
const OPTIONS = new Set([
  '--root',
  '--can',
  '--log',
  '--title',
  '--kind',
  '--priority',
  '--rfc',
  '--step',
]);
// Options that may be given again: each value is kept, in order. Those that
// are lists of paths or ids also take a comma list (`list`); the rest of
// OPTIONS takes one value, and a repeat of it is refused.
const REPEATED = new Set([
  '--check',
  '--depends-on',
  '--writes',
  '--appends',
  '--needs',
]);

/**
 * The options each subcommand takes besides `--root`, which every one
 * takes. Any other option is refused before the subcommand runs.
 */
const TAKES = {
  next: ['--can'],
  show: ['--log'],
  claim: ['--owner-told'],
  submit: ['--allow-failing-checks'],
  release: ['--blocked'],
  review: ['--drop'],
  accept: ['--owner'],
  reject: ['--owner'],
  new: [
    '--title',
    '--kind',
    '--priority',
    '--rfc',
    '--step',
    '--depends-on',
    '--writes',
    '--appends',
    '--needs',
    '--check',
  ],
};

function parseArguments(argv) {
  const positional = [];
  const given = new Set();
  const options = Object.fromEntries([...REPEATED].map(name => [name, []]));
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (
      FLAGS.has(argument) ||
      OPTIONS.has(argument) ||
      REPEATED.has(argument)
    ) {
      given.add(argument);
    }
    if (FLAGS.has(argument)) {
      options[argument] = true;
    } else if (OPTIONS.has(argument) || REPEATED.has(argument)) {
      const value = argv[++index];
      if (value === undefined) {
        throw new Refusal(`${argument} needs a value`);
      }
      if (REPEATED.has(argument)) {
        options[argument].push(value);
      } else if (options[argument] !== undefined) {
        throw new Refusal(`${argument} takes one value and was given twice`);
      } else {
        options[argument] = value;
      }
    } else if (argument.startsWith('--')) {
      throw new Refusal(`unknown option ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  return { positional, options, given };
}

/** Refuses an option that `subcommand` does not take. */
function takenBy(subcommand, given) {
  const refused = [...given].filter(
    option =>
      option !== '--root' && !(TAKES[subcommand] ?? []).includes(option),
  );
  if (refused.length > 0) {
    throw new Refusal(
      `${subcommand} does not take ${refused.join(', ')}` +
        (TAKES[subcommand]
          ? `; it takes ${TAKES[subcommand].join(', ')}`
          : '; it takes no option but --root'),
    );
  }
}

const list = value =>
  (Array.isArray(value) ? value : [value])
    .flatMap(each => (each === undefined || each === '' ? [] : each.split(',')))
    .map(item => item.trim());

// The task format: scalars, one-line lists, block lists of strings, and the
// claim block. Nothing else of YAML.

function parseScalar(raw) {
  const value = raw.trim();
  let match;
  if ((match = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(value))) {
    return match[1].replaceAll("''", "'");
  }
  if ((match = /^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(value))) {
    return JSON.parse(match[1]);
  }
  const bare = value.replace(/(^|\s+)#.*$/, '');
  if (bare === '') {
    return null;
  }
  if (bare.startsWith('[')) {
    if (!bare.endsWith(']')) {
      throw new Error(`a list that does not close: ${bare}`);
    }
    const inner = bare.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map(parseScalar);
  }
  return /^-?\d+$/.test(bare) ? Number(bare) : bare;
}

/** An entry of a block list is a string as written: a command may hold `#`. */
function parseItem(raw) {
  const value = raw.trim();
  return /^'.*'$|^".*"$/.test(value) ? parseScalar(value) : value;
}

function parseTask(text) {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 0) {
    throw new Error('no frontmatter between two lines of ---');
  }
  const fields = {};
  let key;
  for (let index = 1; index < end; index++) {
    const line = lines[index];
    let match;
    if (line.trim() === '') {
      continue;
    }
    if ((match = /^([a-z][a-z-]*):(?:\s+(.*))?$/.exec(line))) {
      key = match[1];
      if (key in fields) {
        throw new Error(`line ${index + 1}: the field "${key}" is there twice`);
      }
      fields[key] = parseScalar(match[2] ?? '');
    } else if (
      key !== undefined &&
      (match = /^ {2}- (.*)$/.exec(line)) &&
      (fields[key] === null || Array.isArray(fields[key]))
    ) {
      fields[key] = [...(fields[key] ?? []), parseItem(match[1])];
    } else if (
      key !== undefined &&
      (match = /^ {2}([a-z][a-z-]*):\s+(.*)$/.exec(line)) &&
      (fields[key] === null ||
        (typeof fields[key] === 'object' && !Array.isArray(fields[key])))
    ) {
      fields[key] = { ...fields[key], [match[1]]: parseScalar(match[2]) };
    } else {
      throw new Error(`line ${index + 1}: not a line of the task format`);
    }
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
const blockList = (key, items) =>
  items.length === 0
    ? `${key}: []`
    : [`${key}:`, ...items.map(item => `  - ${item}`)].join('\n');

/** Replaces a field of the frontmatter, with the indented lines under it. */
function withField(text, key, replacement) {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  const start = lines.findIndex(
    (line, index) => index < end && line.startsWith(`${key}:`),
  );
  if (start < 0) {
    throw new Refusal(`the task has no field "${key}"`);
  }
  let after = start + 1;
  while (after < end && lines[after].startsWith('  ')) {
    after++;
  }
  lines.splice(start, after - start, ...replacement.split('\n'));
  return lines.join('\n');
}

const withStatus = (text, status) =>
  withField(text, 'status', `status: ${status}`);
const withClaim = (text, claim) =>
  withField(
    text,
    'claim',
    claim
      ? `claim:\n  by: ${claim.by}\n  since: ${claim.since}\n  beat: ${claim.beat}`
      : 'claim:',
  );

/**
 * Sets the review mark of a task in review (`review:` with `by`, `since`
 * and `beat`, the shape of a claim), or removes it with `null`. The field
 * is optional: a task without a mark has none, and one is written after
 * the last field.
 */
function withReview(text, mark) {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  const start = lines.findIndex(
    (line, index) => index < end && /^review:/.test(line),
  );
  const replacement = mark
    ? [
        'review:',
        `  by: ${mark.by}`,
        `  since: ${mark.since}`,
        `  beat: ${mark.beat}`,
      ]
    : [];
  if (start < 0) {
    lines.splice(end, 0, ...replacement);
  } else {
    let after = start + 1;
    while (after < end && lines[after].startsWith('  ')) {
      after++;
    }
    lines.splice(start, after - start, ...replacement);
  }
  return lines.join('\n');
}

// The Log.

/**
 * The entries under `## Log`: who wrote each, and when (UTC, to the minute).
 * It also reads two headings that are not of the form, so that the Logs
 * written so are still read: a time followed by ` UTC`, and words in
 * parentheses after the worker. The lint names every such heading.
 */
function logEntries(body) {
  const lines = body.split('\n');
  const start = lines.indexOf('## Log');
  const entries = [];
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    const heading = /^### (.*)$/.exec(line);
    if (heading) {
      const match =
        /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?: UTC)?)?, ([^\s(]+)/.exec(
          heading[1],
        );
      entries.push({
        heading: heading[1],
        at: match?.[2] ? `${match[1]}T${match[2]}` : undefined,
        by: match?.[3],
        lines: [],
      });
    } else if (entries.length > 0) {
      entries.at(-1).lines.push(line);
    }
  }
  return entries;
}

const HEADING_FORM =
  '"### YYYY-MM-DD HH:MM, <worker>", the time in UTC and nothing after ' +
  'the worker (as "### 2026-11-20 03:40, cursor/<model>")';

/** A Log heading of the form, without its `### `. */
function headingPattern(root) {
  const worker = readSchema(root).$defs.worker.pattern.replace(/^\^|\$$/g, '');
  return new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}, ${worker}$`);
}

/** Whether a Log entry is the one `submit` writes, under a heading of the form. */
const isSubmission = (entry, heading) =>
  heading.test(entry.heading) &&
  entry.lines.find(line => line.trim() !== '')?.trim() === SUBMITTED;

/**
 * Whether a heading, of the form or not, is dated before CHECKED_FROM: true
 * or false, or undefined for a date with no time on the day of the check,
 * which its place in the Log tells. A heading with no date is not before.
 */
function datedBeforeTheCheck(heading) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(heading);
  if (match === null) {
    return false;
  }
  if (match[2] !== undefined) {
    return `${match[1]}T${match[2]}` < CHECKED_FROM;
  }
  const day = CHECKED_FROM.slice(0, 10);
  return match[1] === day ? undefined : match[1] < day;
}

/**
 * For each Log entry, whether it was written before CHECKED_FROM. Entries
 * are appended in order, so one dated on the day of the check with no time
 * was written before it when an entry after it is dated before it.
 */
function writtenBeforeTheCheck(entries) {
  const before = entries.map(entry => datedBeforeTheCheck(entry.heading));
  for (let index = before.length - 2; index >= 0; index--) {
    before[index] ??= before[index + 1] === true || undefined;
  }
  return before.map(value => value === true);
}

/** The lines under `## Log` above its first `### ` heading, but for blank lines and NO_ENTRY. */
function linesBeforeTheFirstEntry(body) {
  const lines = body.split('\n');
  const start = lines.indexOf('## Log');
  const preamble = [];
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (/^### /.test(line)) {
      break;
    }
    if (line.trim() !== '' && line.trim() !== NO_ENTRY) {
      preamble.push(line);
    }
  }
  return preamble;
}

/**
 * Whether lines that are no entry were written before CHECKED_FROM: they
 * hold a date and time (as `2026-11-20T09:44` or `2026-11-20 09:44`), and
 * every one they hold is before it. Lines with none are not before.
 */
function datedLinesBeforeTheCheck(lines) {
  const times = [
    ...lines.join('\n').matchAll(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/g),
  ].map(match => `${match[1]}T${match[2]}`);
  return times.length > 0 && times.every(time => time < CHECKED_FROM);
}

function withLogEntry(text, worker, time, entry) {
  if (!text.split('\n').includes('## Log')) {
    throw new Refusal('the task has no "## Log" section');
  }
  const kept = text
    .trimEnd()
    .split('\n')
    .filter(
      (line, index, lines) =>
        !(line === NO_ENTRY && lines.lastIndexOf('## Log') < index),
    )
    .join('\n')
    .trimEnd();
  const heading = `### ${time.slice(0, 10)} ${time.slice(11, 16)}, ${worker}`;
  return `${kept}\n\n${heading}\n\n${entry.trim()}\n`;
}

// The board.

function loadBoard(root) {
  const directory = join(root, 'work/tasks');
  if (!existsSync(directory)) {
    throw new Refusal(`no task board at ${directory}`);
  }
  const tasks = [];
  const unreadable = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.md')) {
      continue;
    }
    const file = `work/tasks/${name}`;
    const text = readFileSync(join(root, file), 'utf8');
    try {
      tasks.push({ file, text, ...parseTask(text) });
    } catch (error) {
      unreadable.push(`${file}: ${error.message}`);
    }
  }
  return { root, tasks, unreadable };
}

/** The board for a command that acts on it: what cannot be read is said. */
function readBoard(root) {
  const board = loadBoard(root);
  for (const problem of board.unreadable) {
    console.error(`task: skipped ${problem}`);
  }
  return board;
}

const array = value => (Array.isArray(value) ? value : []);
const idOf = task => String(task.fields.id);
const statusOf = task => task.fields.status;
const held = board => board.tasks.filter(t => statusOf(t) === 'in-progress');

function taskOf(board, id) {
  if (!/^T-\d{4}$/.test(id ?? '')) {
    throw new Refusal('name the task by its id, as T-0042');
  }
  const found = board.tasks.filter(task => idOf(task) === id);
  if (found.length !== 1) {
    throw new Refusal(
      found.length === 0
        ? `no task ${id}`
        : `${found.length} files have the id ${id}`,
    );
  }
  return found[0];
}

/** How many times Prettier runs on a task file, at most, before its text settles. */
const PRETTIER_RUNS = 5;

/** The executable of the repository's own Prettier, or nothing where none is installed. */
function prettierOf(root) {
  try {
    const manifest = createRequire(join(root, 'package.json')).resolve(
      'prettier/package.json',
    );
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
    return join(
      dirname(manifest),
      typeof bin === 'string' ? bin : bin.prettier,
    );
  } catch {
    return undefined;
  }
}

/**
 * The task file as `prettier --check` wants it. Prettier formats Markdown
 * by its structure (blank lines around lists, the indentation of what
 * continues an item), which the command cannot reproduce for any entry, so
 * the repository's own Prettier formats the one file, with its
 * configuration. One run is not always Prettier's last word (a table right
 * after a list item is indented by one run and aligned by the next), so it
 * runs until the text no longer changes, at most PRETTIER_RUNS times; a
 * text that does not settle is written as the last run made it, and the
 * worker is told. Without Prettier (no `yarn install` yet) the text is
 * written as it is, and the worker is told. A formatted text that is not of
 * the task format is not written: the text is written as the command made
 * it, and the worker is told that formatting it would break the task.
 */
function formatted(root, file, text) {
  const prettier = prettierOf(root);
  if (prettier === undefined) {
    console.error(
      `task: ${file} is written without Prettier (it is not installed): ` +
        `run "yarn prettier --write ${file}"`,
    );
    return text;
  }
  let current = text;
  let settled = false;
  for (let run = 0; run < PRETTIER_RUNS && !settled; run++) {
    const result = spawnSync(
      process.execPath,
      [prettier, '--stdin-filepath', file],
      { cwd: root, input: current, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      console.error(
        `task: ${file} is written without Prettier (it failed): ` +
          `run "yarn prettier --write ${file}"`,
      );
      return text;
    }
    settled = result.stdout === current;
    current = result.stdout;
  }
  try {
    parseTask(current);
  } catch (error) {
    console.error(
      `task: ${file} is written without Prettier: what Prettier makes of ` +
        `it is not of the task format (${error.message}), so formatting ` +
        'it would break the task. Do not format it; name the file and ' +
        "Prettier's configuration in your Log entry",
    );
    return text;
  }
  if (!settled) {
    console.error(
      `task: ${file} is written as Prettier's run ${PRETTIER_RUNS} made it, ` +
        'and Prettier still changes it, so "yarn prettier --check" fails on ' +
        'it: name the file in your Log entry',
    );
  }
  return current;
}

/** How long a command waits for another to finish writing a task file. */
const WRITE_LOCK_WAIT_MS = 5000;
const WRITE_LOCK_POLL_MS = 20;

/**
 * Runs `write` while no other command writes the same task file: the two
 * exclude each other by a file in `work/claims/`, named after the task
 * file, that only one of them can create. It is held for a comparison and
 * a rename, so a command that finds it waits; one that still finds it
 * after WRITE_LOCK_WAIT_MS is refused, since a command that was killed
 * while it held the file left it there.
 */
function whileNoOtherWrites(root, task, write) {
  const lock = `work/claims/${basename(task.file)}.lock`;
  mkdirSync(join(root, 'work/claims'), { recursive: true });
  const waitingSince = Date.now();
  for (;;) {
    try {
      writeFileSync(join(root, lock), `${process.pid}\n`, { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - waitingSince > WRITE_LOCK_WAIT_MS) {
        throw new Refusal(
          `${task.file} is not written: ${lock} is still there after ` +
            `${WRITE_LOCK_WAIT_MS / 1000} s. A task command holds it only ` +
            'for the moment it writes the task file; if no task command is ' +
            `running, one was killed in that moment: remove ${lock} and run ` +
            'the command again',
        );
      }
      pause(WRITE_LOCK_POLL_MS);
    }
  }
  try {
    return write();
  } finally {
    rmSync(join(root, lock), { force: true });
  }
}

/**
 * Writes a task file from the text the command read (`task.text`), changed.
 * It writes only when the file still holds that text, and no other command
 * can write the file between that comparison and the write; a file that
 * holds another text is left as it is, with `Changed`.
 */
function writeTask(root, task, unformatted) {
  const text = formatted(root, task.file, unformatted);
  const path = join(root, task.file);
  whileNoOtherWrites(root, task, () => {
    if (readFileSync(path, 'utf8') !== task.text) {
      throw new Changed(task.file);
    }
    const draft = `${path}.${process.pid}.tmp`;
    writeFileSync(draft, text);
    renameSync(draft, path);
  });
  task.text = text;
  Object.assign(task, parseTask(text));
}

// Overlap: two paths overlap when they are equal, or when one is a
// directory (ends in `/`) and the other is inside it. Two tasks conflict
// when a `writes` of one overlaps a `writes` or an `appends` of the other.

const pathsOverlap = (a, b) =>
  a === b ||
  (a.endsWith('/') && b.startsWith(a)) ||
  (b.endsWith('/') && a.startsWith(b));

function overlaps(a, b) {
  const found = [];
  const compare = (mine, theirs) => {
    for (const path of mine) {
      for (const other of theirs) {
        if (pathsOverlap(path, other)) {
          found.push(path === other ? path : `${path} and ${other}`);
        }
      }
    }
  };
  const writes = task => array(task.fields.writes);
  const appends = task => array(task.fields.appends);
  compare(writes(a), [...writes(b), ...appends(b)]);
  compare(appends(a), writes(b));
  return found;
}

const inScope = (task, file) =>
  file === task.file ||
  [...array(task.fields.writes), ...array(task.fields.appends)].some(path =>
    path.endsWith('/') ? file.startsWith(path) : file === path,
  );

// The worker, the time, the claim directory.

function workerPattern(root) {
  return new RegExp(readSchema(root).$defs.worker.pattern);
}

/** The worker AEP_WORKER names, or nothing when it is not set. */
function namedWorker(root) {
  const name = process.env.AEP_WORKER;
  if (!name) {
    return undefined;
  }
  if (name.includes('@')) {
    throw new Refusal(
      'AEP_WORKER looks like an email address; a worker is named by its ' +
        'tool and model, never by a person',
    );
  }
  if (!workerPattern(root).test(name)) {
    throw new Refusal(
      `AEP_WORKER is "${name}"; it is claude-code/<model>, ` +
        'antigravity/<model>, cursor/<model> or person/<handle>',
    );
  }
  return name;
}

/** The worker a command that changes the board runs as. */
function theWorker(root) {
  const name = namedWorker(root);
  if (name === undefined) {
    throw new Refusal(
      'set AEP_WORKER to name yourself: claude-code/<model>, ' +
        'antigravity/<model>, cursor/<model> or person/<handle>',
    );
  }
  return name;
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const claimDirectory = (root, id) => join(root, 'work/claims', id);

/**
 * Whether a task is claimed: its claim file is there. Its directory also
 * holds the record of its tree (`TREE_RECORD`), which stays between
 * claims, from the claim that made the tree to its removal.
 */
const isClaimed = (root, id) =>
  existsSync(join(claimDirectory(root, id), 'claim'));

/** Ends a claim: its file, and its directory when it holds no tree's record. */
function removeClaim(root, id) {
  const directory = claimDirectory(root, id);
  rmSync(join(directory, 'claim'), { force: true });
  if (existsSync(directory) && !existsSync(join(directory, TREE_RECORD))) {
    rmdirSync(directory);
  }
}

function holding(board, id, worker) {
  const task = taskOf(board, id);
  if (statusOf(task) !== 'in-progress' || task.fields.claim?.by !== worker) {
    throw new Refusal(
      `${id} is not held by ${worker}: it is ${statusOf(task)}` +
        (task.fields.claim ? `, held by ${task.fields.claim.by}` : ''),
    );
  }
  return task;
}

const STDIN_POLL_MS = 20;

/**
 * What is written to stdin, up to its end. The read waits for a pipe that
 * holds nothing yet; on a pipe that its other holder made non-blocking the
 * read fails with EAGAIN instead, and is done again. `process.stdin` is
 * not used: reading that property makes the pipe non-blocking.
 */
function readStdin() {
  const chunks = [];
  const buffer = Buffer.alloc(64 * 1024);
  for (;;) {
    let length;
    try {
      length = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code !== 'EAGAIN') {
        throw error;
      }
      pause(STDIN_POLL_MS);
      continue;
    }
    if (length === 0) {
      return Buffer.concat(chunks).toString('utf8');
    }
    chunks.push(Buffer.from(buffer.subarray(0, length)));
  }
}

let stdin;

/** The entry on stdin, read once: a change that runs again has it still. */
function entryFromStdin(what) {
  stdin ??= isatty(0) ? '' : readStdin().trim();
  const entry = stdin;
  if (entry === '') {
    throw new Refusal(`${what} is read from stdin, and stdin is empty`);
  }
  return entry;
}

// The lint.

function readSchema(root) {
  return JSON.parse(readFileSync(join(root, 'work/schema.json'), 'utf8'));
}

function typeOf(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return Number.isInteger(value) ? 'integer' : typeof value;
}

const shown = value => JSON.stringify(value);

/**
 * What of `value` breaks `schema`. It reads the keywords work/schema.json
 * uses and refuses any other, so the schema states nothing that is not held.
 */
function violations(schema, value, where, root) {
  const found = [];
  const say = message => found.push(where ? `${where}: ${message}` : message);
  for (const [keyword, rule] of Object.entries(schema)) {
    switch (keyword) {
      case '$schema':
      case '$defs':
      case 'title':
      case 'description':
        break;
      case '$ref': {
        const { description, ...definition } =
          root.$defs[rule.replace('#/$defs/', '')];
        for (const violation of violations(definition, value, where, root)) {
          found.push(description ? `${violation} (${description})` : violation);
        }
        break;
      }
      case 'type':
        if (![rule].flat().includes(typeOf(value))) {
          say(`${shown(value)} is not of type ${[rule].flat().join(' or ')}`);
        }
        break;
      case 'enum':
        if (!rule.includes(value)) {
          say(`${shown(value)} is none of ${rule.join(', ')}`);
        }
        break;
      case 'pattern':
        if (typeof value === 'string' && !new RegExp(rule).test(value)) {
          say(`${shown(value)} does not match ${rule}`);
        }
        break;
      case 'minLength':
        if (typeof value === 'string' && value.length < rule) {
          say('is empty');
        }
        break;
      case 'minimum':
        if (typeof value === 'number' && value < rule) {
          say(`${value} is below ${rule}`);
        }
        break;
      case 'uniqueItems':
        if (Array.isArray(value) && new Set(value).size !== value.length) {
          say('names an entry twice');
        }
        break;
      case 'items':
        for (const item of array(value)) {
          found.push(...violations(rule, item, where, root));
        }
        break;
      case 'required':
        for (const name of typeOf(value) === 'object' ? rule : []) {
          if (!(name in value)) {
            say(`the field "${name}" is missing`);
          }
        }
        break;
      case 'additionalProperties':
        for (const name of typeOf(value) === 'object'
          ? Object.keys(value)
          : []) {
          if (rule === false && !(name in (schema.properties ?? {}))) {
            say(`the field "${name}" is unknown`);
          }
        }
        break;
      case 'properties':
        for (const [name, property] of Object.entries(rule)) {
          if (typeOf(value) === 'object' && name in value) {
            const inner = where ? `${where}.${name}` : name;
            found.push(...violations(property, value[name], inner, root));
          }
        }
        break;
      default:
        throw new Error(
          `work/schema.json uses "${keyword}", which the lint does not check`,
        );
    }
  }
  return found;
}

/** The dependencies that lead from a task back to itself, or nothing. */
function cycleFrom(start, dependencies) {
  const path = [];
  const seen = new Set();
  const visit = id => {
    if (seen.has(id)) {
      return id === start;
    }
    seen.add(id);
    path.push(id);
    if ((dependencies.get(id) ?? []).some(visit)) {
      return true;
    }
    path.pop();
    return false;
  };
  return visit(start) ? [...path, start] : undefined;
}

/**
 * What breaks the board's rules: `problems` fail the lint; `known` are those
 * of the Log rules that were there before CHECKED_FROM, named and not
 * refused.
 */
function lintProblems(board) {
  const schema = readSchema(board.root);
  const heading = headingPattern(board.root);
  const problems = [...board.unreadable];
  const known = [];
  const byHand = new Set();
  const byId = new Map();
  // A file with a problem of its own is still a task others may depend on.
  const named = new Set(
    readdirSync(join(board.root, 'work/tasks')).flatMap(
      name => /^T-\d{4}/.exec(name) ?? [],
    ),
  );
  for (const task of board.tasks) {
    const say = message => problems.push(`${task.file}: ${message}`);
    const before = problems.length;
    violations(schema, task.fields, '', schema).forEach(say);
    if (problems.length > before) {
      continue;
    }
    const id = idOf(task);
    if (!task.file.startsWith(`work/tasks/${id}-`)) {
      say(`the file of ${id} is named ${id}-short-name.md`);
    }
    if (byId.has(id)) {
      say(`the id ${id} is also that of ${byId.get(id).file}`);
      continue;
    }
    byId.set(id, task);
    if ((statusOf(task) === 'in-progress') !== (task.fields.claim !== null)) {
      say(
        'a task has its claim block exactly while it is in-progress; ' +
          `this one is ${statusOf(task)}`,
      );
    }
    if (statusOf(task) !== 'review' && (task.fields.review ?? null) !== null) {
      say(
        'a task has a review mark only while it is in review; this one is ' +
          statusOf(task),
      );
    }
    for (const path of [...task.fields.writes, ...task.fields.appends]) {
      const target = join(board.root, path);
      const isDirectory = existsSync(target) && statSync(target).isDirectory();
      if (isDirectory && !path.endsWith('/')) {
        say(`${path} is a directory: it ends in /`);
      } else if (existsSync(target) && !isDirectory && path.endsWith('/')) {
        say(`${path} is a file: it does not end in /`);
      }
    }
    const lines = task.body.split('\n');
    const places = SECTIONS.map(section => lines.indexOf(section));
    if (places.some((place, index) => place < (places[index - 1] ?? 0))) {
      say(`the sections are ${SECTIONS.join(', ')}, in this order`);
    }
    const sayKnown = message => known.push(`${task.file}: ${message}`);
    const preamble = linesBeforeTheFirstEntry(task.body);
    const preambleBefore =
      preamble.length > 0 && datedLinesBeforeTheCheck(preamble);
    if (preamble.length > 0) {
      const first = preamble[0].trim();
      (preambleBefore ? sayKnown : say)(
        'the Log has lines before its first entry, which are not read as ' +
          `an entry ("${first.length > 60 ? `${first.slice(0, 60)}…` : first}"): ` +
          `an entry starts with a heading ${HEADING_FORM}`,
      );
    }
    const entries = logEntries(task.body);
    const writtenBefore = writtenBeforeTheCheck(entries);
    for (const [index, entry] of entries.entries()) {
      if (!heading.test(entry.heading)) {
        (writtenBefore[index] ? sayKnown : say)(
          `the Log heading "### ${entry.heading}" is not read as an entry: ` +
            `a heading is ${HEADING_FORM}`,
        );
      }
    }
    // `submit` writes the last entry of a task in review; `accept` adds one
    // after it.
    const submitted = entries.findLastIndex(entry =>
      isSubmission(entry, heading),
    );
    if (
      statusOf(task) === 'review' &&
      (submitted < 0 || submitted !== entries.length - 1)
    ) {
      say(
        'it is in review, and its last Log entry is not the one ' +
          '`task submit` writes: a task reaches review only through ' +
          '`task submit`, which its worker runs again',
      );
    }
    if (
      statusOf(task) === 'done' &&
      (submitted < 0 || submitted !== entries.length - 2)
    ) {
      // Accepted from the list, or before the check: its Log stays as it was.
      if (SUBMITTED_BY_HAND.has(id)) {
        byHand.add(id);
        continue;
      }
      const acceptedBefore =
        entries.length > 0 ? writtenBefore.at(-1) : preambleBefore;
      if (acceptedBefore) {
        continue;
      }
      say(
        'it is done, and the Log entry before its acceptance is not the one ' +
          '`task submit` writes: a task reaches review only through ' +
          '`task submit`',
      );
    }
  }
  for (const id of SUBMITTED_BY_HAND) {
    if (byId.has(id) && !byHand.has(id)) {
      known.push(
        `${id} is on the list of tasks submitted by hand (SUBMITTED_BY_HAND ` +
          'in scripts/task.mjs) and no longer needs it: remove it',
      );
    }
  }
  const dependencies = new Map(
    [...byId].map(([id, task]) => [id, task.fields['depends-on']]),
  );
  for (const [id, task] of byId) {
    for (const dependency of dependencies.get(id)) {
      if (!byId.has(dependency) && !named.has(dependency)) {
        problems.push(
          `${task.file}: depends on ${dependency}, which no task is`,
        );
      }
    }
    if (
      statusOf(task) === 'backlog' &&
      dependencies
        .get(id)
        .every(other => byId.get(other)?.fields.status === 'done')
    ) {
      problems.push(
        `${task.file}: it is in the backlog and waits for nothing (every ` +
          'task it depends on is done), so no worker sees it: "yarn task ' +
          'promote" makes it ready',
      );
    }
    const cycle = cycleFrom(id, dependencies);
    if (cycle && id === [...cycle].sort()[0]) {
      problems.push(
        `${task.file}: a cycle of dependencies: ${cycle.join(' → ')}`,
      );
    }
  }
  const inProgress = [...byId.values()].filter(
    task => statusOf(task) === 'in-progress',
  );
  for (const [index, task] of inProgress.entries()) {
    for (const other of inProgress.slice(index + 1)) {
      const shared = overlaps(task, other);
      if (shared.length > 0) {
        problems.push(
          `${task.file}: held at the same time as ${idOf(other)}, and ` +
            `both change ${shared.join(', ')}`,
        );
      }
    }
  }
  return { problems, known };
}

// The scope check.

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.yarn', '.git', 'dist']);

function filesUnder(root, directory = '') {
  const files = [];
  for (const entry of readdirSync(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && path !== 'work/claims') {
        files.push(...filesUnder(root, `${path}/`));
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

/** Runs a read-only git command that must succeed, or refuses with why. */
function gitOutput(root, ...command) {
  const result = git(root, ...command);
  if (result.status !== 0) {
    throw new Refusal(`git ${command.join(' ')} failed: ${gitFailure(result)}`);
  }
  return result.stdout;
}

const names = output => output.split('\0').filter(Boolean);

/**
 * The files of a task's tree that differ from `base`: the diff of the
 * working tree against that commit, committed or not, a deleted file
 * among them, and the files git does not know and does not ignore. Git
 * ignores only what the repository's `.gitignore` files and
 * `.git/info/exclude` ignore (`git`), and a git command that fails is
 * reported, never read as no change.
 */
function changedFiles(root, base) {
  const top = git(root, 'rev-parse', '--show-toplevel');
  if (top.status !== 0) {
    throw new Refusal(
      `git rev-parse --show-toplevel failed in ${root}: ${gitFailure(top)}`,
    );
  }
  if (realpathSync(top.stdout.trim()) !== realpathSync(root)) {
    throw new Refusal(
      `${root} has .git, and git did not read it as a checkout ` +
        `(top level is ${top.stdout.trim()})`,
    );
  }
  const diff = git(root, 'diff', '--name-only', '-z', base);
  if (diff.status !== 0) {
    throw new Refusal(
      `git cannot compare the working tree with ${base}: ${gitFailure(diff)}`,
    );
  }
  const unknown = names(
    gitOutput(root, 'ls-files', '--others', '--exclude-standard', '-z'),
  );
  return [...new Set([...names(diff.stdout), ...unknown])].sort();
}

/**
 * The changed files of a task's tree, sorted: those of its scope
 * (`mine`), the task files of the board changed in the tree
 * (`boardInTree`), and every other (`outside`). A tree holds one task's
 * change, all of which lands, so every file but its own fails the check.
 */
function scopeOf(task, { root, base }) {
  const scope = { mine: [], boardInTree: [], outside: [] };
  for (const file of changedFiles(root, base)) {
    if (file.startsWith('work/tasks/')) {
      // The board is the main checkout's: a tree's copy of it is never
      // changed, and a task file on a branch stops its landing.
      scope.boardInTree.push(file);
    } else if (inScope(task, file)) {
      scope.mine.push(file);
    } else {
      scope.outside.push(file);
    }
  }
  return scope;
}

/**
 * Where a task's change is, and what it is measured from: its tree
 * (`root`), the last commit its branch shares with `main` (`base`,
 * `baseOf`), and the record (`record`). A task with no tree, or whose
 * tree is gone, is refused.
 */
function placeOf(board, task) {
  const record = treeRecordOf(board.root, idOf(task));
  if (record === undefined) {
    throw new Refusal(
      `${idOf(task)} has no tree: its claim makes it ` +
        `(work/claims/${idOf(task)}/${TREE_RECORD})`,
    );
  }
  if (!treeIsThere(board.root, record)) {
    throw new Refusal(
      `${idOf(task)}'s tree ${record.tree} is not there` +
        (commitOf(board.root, `refs/heads/${record.branch}`) === undefined
          ? ''
          : `; its branch ${record.branch} is`) +
        ': a claim of the task makes it again',
    );
  }
  return { root: record.tree, base: baseOf(record.tree), record };
}

/**
 * The commit a task's change is at in its tree, which a submit checks and
 * a landing moves `main` to: the head of its branch, in a clean tree, and
 * the base it is measured from. A tree that has another branch out, or
 * that holds a change not committed, is refused: neither the result of the
 * checks nor the landing would hold that change.
 */
function committedIn(id, record) {
  const out = branchOut(record.tree);
  if (out !== `refs/heads/${record.branch}`) {
    throw new Refusal(
      `${id} is not submitted: its tree ${record.tree} has ` +
        `${out ?? 'no branch'} out, not ${record.branch}`,
    );
  }
  const left = unclean(record.tree);
  if (left.length > 0) {
    throw new Refusal(
      `${id} is not submitted: its tree holds changes that are not ` +
        `committed on ${record.branch}; commit them there first:\n` +
        left.map(file => `  ${file}`).join('\n'),
    );
  }
  return { commit: commitOf(record.tree, 'HEAD'), base: baseOf(record.tree) };
}

/** The line of a submit's entry that records the commit it checked. */
const committedLine = ({ commit, base }, record) =>
  `Committed as ${commit} on ${record.branch}, from ${record.from} at ${base}.`;
const COMMITTED =
  /^Committed as ([0-9a-f]{40,64}) on (task\/T-\d{4}), from \S+ at ([0-9a-f]{40,64})\.$/;

function printScope(task, scope) {
  const part = (title, files) => {
    if (files.length > 0) {
      console.log(`${title}\n${files.map(file => `  ${file}`).join('\n')}`);
    }
  };
  part(`In the scope of ${idOf(task)}:`, scope.mine);
  part('Task files changed in the tree:', scope.boardInTree);
  part(`Outside ${idOf(task)}'s scope:`, scope.outside);
}

/** Why the scope check fails, or nothing: every file that fails it, counted. */
function outOfScope(task, scope) {
  const said = [];
  if (scope.boardInTree.length > 0) {
    said.push(
      `${scope.boardInTree.length} task file(s) changed in the tree: the ` +
        "board is the main checkout's, and a task file on a branch stops " +
        'its landing; undo the change on the branch',
    );
  }
  if (scope.outside.length > 0) {
    said.push(
      `${scope.outside.length} changed file(s) are outside ` +
        `${idOf(task)}'s writes and appends; undo them on the branch`,
    );
  }
  return said.length > 0 ? said.join('; ') : undefined;
}

// The subcommands.

const describe = task =>
  `${idOf(task)}  p${task.fields.priority}  ${task.fields.title}`;

/** Whether a claim or a review mark has not been beaten for STALE_AFTER_MS. */
const markIsStale = mark =>
  Date.now() - Date.parse(mark?.beat) > STALE_AFTER_MS;

const isStale = task => markIsStale(task.fields.claim);

/**
 * The review mark of a task that holds: one that another worker set and
 * beat within STALE_AFTER_MS. A stale mark holds nobody back, as a stale
 * claim does not.
 */
function reviewMarkAgainst(task, worker) {
  const mark = task.fields.review ?? null;
  return mark !== null && mark.by !== worker && !markIsStale(mark)
    ? mark
    : undefined;
}

/** A review mark in words: who, since when, the last beat. */
const markInWords = mark =>
  `${mark.by}, since ${mark.since}, beat ${mark.beat}` +
  (markIsStale(mark) ? ', STALE' : '');

function board({ root }) {
  const tasks = readBoard(root).tasks;
  for (const status of STATUS_ORDER) {
    const column = tasks.filter(task => statusOf(task) === status);
    console.log(`${status} (${column.length})`);
    for (const task of column) {
      const claim = task.fields.claim;
      const holder = claim
        ? `\n          ${claim.by}, since ${claim.since}, beat ${claim.beat}` +
          (isStale(task) ? ', STALE' : '')
        : task.fields.review
          ? `\n          under review by ${markInWords(task.fields.review)}`
          : '';
      console.log(`  ${describe(task)}${holder}`);
    }
  }
}

/** The held tasks whose paths overlap `task`, each as a reason to refuse. */
function overlappingHeld(all, task) {
  const found = [];
  for (const other of held(all)) {
    const shared = other === task ? [] : overlaps(task, other);
    if (shared.length > 0) {
      found.push(
        `${idOf(other)}, held by ${other.fields.claim?.by}, changes ` +
          shared.join(', '),
      );
    }
  }
  return found;
}

/** The status of the task of an id, or nothing when the board has none. */
const statusOfId = (all, id) =>
  all.tasks.find(task => idOf(task) === id)?.fields.status;

/** Whether a task waits for nothing: every task it depends on is done. */
const dependenciesAreDone = (all, task) =>
  array(task.fields['depends-on']).every(id => statusOfId(all, id) === 'done');

/**
 * The backlog tasks that wait for nothing. The backlog holds only tasks
 * that wait for a dependency, so each of these is ready: `new`, `accept`
 * and `promote` move it, and the lint refuses one that stayed.
 */
const promotable = all =>
  all.tasks.filter(
    task => statusOf(task) === 'backlog' && dependenciesAreDone(all, task),
  );

/** The sections of a task that still hold only what `new` wrote there. */
function unwrittenSections(task) {
  const lines = task.body.split('\n');
  return SECTIONS.slice(0, 3).filter((section, index) => {
    const start = lines.indexOf(section);
    const end = lines.indexOf(SECTIONS[index + 1]);
    const content = lines.slice(start + 1, end < 0 ? undefined : end);
    return start >= 0 && content.join('\n').trim() === TO_BE_WRITTEN;
  });
}

/** The kinds of task that deliver code, which its submit has to check. */
const CHECKED_KINDS = new Set(['build', 'fix']);

/** What a task of a kind that needs a check lacks while it has none, or nothing. */
function missingCheck(task) {
  return CHECKED_KINDS.has(task.fields.kind) &&
    array(task.fields.checks).length === 0
    ? `a task of kind ${task.fields.kind} has no check: add the commands its ` +
        'submit runs to `checks` in its file'
    : undefined;
}

/**
 * Why a task cannot be claimed now, or nothing.
 */
function obstacles(all, task) {
  const found = [];
  if (statusOf(task) !== 'ready') {
    found.push(`it is ${statusOf(task)}, not ready`);
  }
  const unwritten = unwrittenSections(task);
  if (unwritten.length > 0) {
    found.push(
      `its author has not written ${unwritten.join(', ')} yet ` +
        `("${TO_BE_WRITTEN}")`,
    );
  }
  const unchecked = missingCheck(task);
  if (unchecked !== undefined) {
    found.push(unchecked);
  }
  for (const dependency of array(task.fields['depends-on'])) {
    const status = statusOfId(all, dependency);
    if (status !== 'done') {
      found.push(
        `it depends on ${dependency}, which is ${status ?? 'not on the board'}`,
      );
    }
  }
  found.push(...overlappingHeld(all, task), ...waitsForLanding(all, task));
  return found;
}

/**
 * The changes a task waits for to reach `main`, from
 * whose head its tree is made: that of a task it depends on, accepted and
 * not landed, and that of any task not in progress whose tree is not
 * landed and whose paths overlap its own (one in progress is in
 * `overlappingHeld`).
 */
function waitsForLanding(all, task) {
  const found = [];
  for (const { id, record } of treeRecords(all.root)) {
    const other = all.tasks.find(each => idOf(each) === id);
    if (other === undefined || other === task || record.landed !== undefined) {
      continue;
    }
    if (array(task.fields['depends-on']).includes(id)) {
      if (statusOf(other) === 'done') {
        found.push(
          `it depends on ${id}, which is accepted and not landed on ` +
            `${record.from} yet`,
        );
      }
    } else if (statusOf(other) !== 'in-progress') {
      const shared = overlaps(task, other);
      if (shared.length > 0) {
        found.push(
          `${id} (${statusOf(other)}) changes ${shared.join(', ')} in its ` +
            `tree, and its change is not on ${record.from} yet`,
        );
      }
    }
  }
  return found;
}

/** Why `next` does not offer a ready task to a worker, or nothing. */
function notOffered(all, task, can) {
  const found = obstacles(all, task);
  if (isClaimed(all.root, idOf(task))) {
    found.push(`another worker is claiming it (work/claims/${idOf(task)})`);
  }
  const unmet = array(task.fields.needs).filter(need =>
    can ? !can.includes(need) : need === 'owner',
  );
  if (unmet.length > 0) {
    found.push(
      can
        ? `it needs ${unmet.join(', ')}, which --can does not name`
        : 'it needs the owner, who tells a worker to take it',
    );
  }
  return found;
}

/** Whether only the owner accepts the task (a decision, or one that needs the owner). */
const isOwnersDecision = task =>
  task.fields.kind === 'decision' || array(task.fields.needs).includes('owner');

/**
 * The entry `submit` wrote, when it is the last of the task's Log: it names
 * the worker that submitted and the time. Any other last entry names
 * whoever wrote it, so the task has no submission to read.
 */
function submissionIn(task, heading) {
  const last = logEntries(task.body).at(-1);
  return last !== undefined && isSubmission(last, heading) ? last : undefined;
}

/** Tasks in review, oldest submission first (tied by id). */
function bySubmission(a, b) {
  if (a.submission.at !== b.submission.at) {
    return a.submission.at < b.submission.at ? -1 : 1;
  }
  const aId = idOf(a.task);
  const bId = idOf(b.task);
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/** Whether a task holds a claim in its frontmatter or under `work/claims/`. */
const hasClaim = (root, task) =>
  task.fields.claim !== null || isClaimed(root, idOf(task));

function next({ root, options }) {
  const all = readBoard(root);
  const can = options['--can'] === undefined ? null : list(options['--can']);
  const worker = namedWorker(root);
  const ready = all.tasks
    .filter(task => statusOf(task) === 'ready')
    .sort((a, b) => a.fields.priority - b.fields.priority);
  const refused = new Map(
    ready.map(task => [task, notOffered(all, task, can)]),
  );
  const takeable = ready.filter(task => refused.get(task).length === 0);
  for (const task of takeable) {
    const needs = array(task.fields.needs).join(', ') || 'nothing';
    console.log(`${describe(task)}\n          needs ${needs}`);
  }
  if (takeable.length === 0) {
    console.log(
      ready.length === 0
        ? 'No task can be claimed now: no task is ready.'
        : `No task can be claimed now. The ${ready.length} ready task(s), ` +
            'and why not each:',
    );
    for (const task of ready) {
      console.log(
        `  ${describe(task)}\n          ${refused.get(task).join('; ')}`,
      );
    }
    const waiting = promotable(all);
    if (waiting.length > 0) {
      console.log(
        `${waiting.length} task(s) in the backlog have every dependency done ` +
          `(${waiting.map(idOf).join(', ')}): "yarn task promote" makes them ` +
          'ready.',
      );
    }
  }
  const heading = headingPattern(all.root);
  const inReviewTasks = all.tasks
    .filter(task => statusOf(task) === 'review')
    .map(task => ({ task, submission: submissionIn(task, heading) }));
  const submitted = inReviewTasks.filter(({ submission }) => submission);
  const reviewable = submitted
    .filter(
      ({ task, submission }) =>
        submission.by !== worker &&
        !hasClaim(all.root, task) &&
        reviewMarkAgainst(task, worker) === undefined,
    )
    .sort(bySubmission);
  // A task another reviewer reviews is offered to no other, while its mark
  // holds.
  const underReview = submitted
    .filter(
      ({ task, submission }) =>
        submission.by !== worker && reviewMarkAgainst(task, worker),
    )
    .sort(bySubmission);
  if (reviewable.length > 0) {
    console.log('');
    console.log(
      `${reviewable.length} task(s) wait for a review` +
        (reviewable.length < inReviewTasks.length
          ? ` (${inReviewTasks.length} in review)`
          : '') +
        ', oldest first:',
    );
    for (const { task, submission } of reviewable) {
      const detail = `submitted ${submission.at}Z by ${submission.by}`;
      const mark = task.fields.review;
      console.log(
        `  ${describe(task)}\n          ${detail}` +
          (isOwnersDecision(task) ? '; accepted by the owner only' : '') +
          (mark && mark.by === worker
            ? `; under review by you since ${mark.since}`
            : mark
              ? `; the review mark of ${markInWords(mark)}: "review ` +
                `${idOf(task)}" takes it over`
              : ''),
      );
    }
  } else if (takeable.length === 0 && submitted.length > 0) {
    console.log('');
    console.log(
      `${submitted.length} task(s) wait for a review, none of them ` +
        (worker ? `for ${worker} to review.` : 'without a claim.'),
    );
  }
  if (underReview.length > 0) {
    console.log('');
    console.log(
      `${underReview.length} task(s) in review are under review by another ` +
        'worker, and not offered until its mark is stale:',
    );
    for (const { task } of underReview) {
      console.log(
        `  ${describe(task)}\n          under review by ` +
          markInWords(task.fields.review),
      );
    }
  }
  // No entry of such a task tells who submitted it, so it is a review for
  // no worker: the lint refuses it.
  const notSubmitted = inReviewTasks.filter(({ submission }) => !submission);
  if (notSubmitted.length > 0) {
    console.log('');
    console.log(
      `${notSubmitted.length} task(s) in review are not offered for a review ` +
        `(${notSubmitted.map(({ task }) => idOf(task)).join(', ')}): the last ` +
        'Log entry of each is not the one "task submit" writes, so no entry ' +
        'tells who submitted it. A reviewer rejects each.',
    );
  }
}

function brief(all, task, entries) {
  const fields = task.fields;
  const part = (title, items) =>
    `${title}:${array(items).length === 0 ? ' none' : ''}\n` +
    array(items)
      .map(item => `  ${item}\n`)
      .join('');
  const dependencies = array(fields['depends-on']).map(id => {
    return `${id} (${statusOfId(all, id) ?? 'not on the board'})`;
  });
  const claim = fields.claim
    ? `Held by ${fields.claim.by} since ${fields.claim.since}, beat ` +
      `${fields.claim.beat}${isStale(task) ? ' (STALE)' : ''}\n`
    : fields.review
      ? `Under review by ${fields.review.by} since ${fields.review.since}, ` +
        `beat ${fields.review.beat}` +
        `${markIsStale(fields.review) ? ' (STALE)' : ''}\n`
      : '';
  const log = entries === 0 ? [] : logEntries(task.body).slice(-entries);
  return (
    `${idOf(task)}: ${fields.title}\n` +
    `${task.file}\n` +
    `Status ${fields.status}, kind ${fields.kind}, priority ` +
    `${fields.priority}, RFC ${fields.rfc || 'none'}, step ` +
    `${fields.step || 'none'}\n` +
    claim +
    treeInWords(all.root, idOf(task)) +
    part('Needs', fields.needs) +
    part('Depends on', dependencies) +
    part('Writes', fields.writes) +
    part('Appends', fields.appends) +
    part('Checks', fields.checks) +
    (log.length === 0
      ? 'Log: no entry\n'
      : log
          .map(
            entry =>
              `Log, ${entry.heading}:\n${entry.lines.join('\n').trim()}\n`,
          )
          .join(''))
  );
}

/** The tree a task has, in a line of `show`, or nothing. */
function treeInWords(root, id) {
  const record = treeRecordOf(root, id);
  if (record === undefined) {
    return '';
  }
  return (
    `Tree ${record.tree}` +
    (treeIsThere(root, record) ? '' : ' (not there)') +
    `, on ${record.branch}, made from ${record.from} at ${record.base}` +
    (record.landed === undefined ? '' : `; landed as ${record.landed}`) +
    '\n'
  );
}

function show({ root, id, options }) {
  const all = readBoard(root);
  const entries = Number(options['--log'] ?? 2);
  if (!Number.isInteger(entries) || entries < 0) {
    throw new Refusal('--log takes a number of entries');
  }
  process.stdout.write(brief(all, taskOf(all, id), entries));
}

/**
 * Takes the claim of `task`, its file `work/claims/T-NNNN/claim`, which
 * one worker alone creates; moves the task to `in-progress` with a claim
 * (and optional Log entry); and checks for overlapping tasks claimed in
 * the same moment: the higher id restores the task and releases. It then
 * gives the task its tree (`treeFor`), and a tree that cannot be had
 * restores the task and ends the claim. The task's directory there holds
 * the record of its tree between claims.
 */
function acquireClaim(root, task, worker, { logEntry, onHeld, onLower }) {
  const id = idOf(task);
  const before = task.text;
  const time = now();
  let text = withReview(
    withClaim(withStatus(before, 'in-progress'), {
      by: worker,
      since: time,
      beat: time,
    }),
    null,
  );
  if (logEntry !== undefined) {
    text = withLogEntry(text, worker, time, logEntry);
  }
  mkdirSync(claimDirectory(root, id), { recursive: true });
  try {
    writeFileSync(
      join(claimDirectory(root, id), 'claim'),
      `${worker} ${time}\n`,
      { flag: 'wx' },
    );
  } catch (error) {
    throw error.code === 'EEXIST' ? new Refusal(onHeld) : error;
  }
  try {
    writeTask(root, task, text);
  } catch (error) {
    // The task is not claimed in its file, so its directory does not stay.
    removeClaim(root, id);
    throw error;
  }

  // Two workers can pass the checks above at the same moment for two tasks
  // that overlap; each then sees the other's claim, and the higher id
  // releases.
  const all = readBoard(root);
  const current = taskOf(all, id);
  const rivals = readdirSync(join(root, 'work/claims'))
    .filter(other => other !== id && isClaimed(root, other))
    .map(other => all.tasks.find(candidate => idOf(candidate) === other))
    .filter(other => other && overlaps(current, other).length > 0);
  const lower = rivals.filter(other => idOf(other) < id);
  if (lower.length > 0) {
    writeTask(root, current, before);
    removeClaim(root, id);
    throw new Refusal(onLower(lower));
  }
  for (const other of rivals) {
    console.error(
      `task: ${idOf(other)} was claimed in the same moment and overlaps ` +
        `${id}; its worker releases it`,
    );
  }
  try {
    for (const line of treeFor(root, id)) {
      console.error(`task: ${line}`);
    }
  } catch (error) {
    writeTask(root, current, before);
    removeClaim(root, id);
    throw error instanceof TreeRefusal
      ? new Refusal(`${id} is not claimed: ${error.message}`)
      : error;
  }
  return { all, task: current };
}

/**
 * The tree of a task just claimed, and what was done
 * to give it: the tree its record names, as an earlier claim left it; one
 * made again from its branch, which a release kept for the commits it
 * holds; or a new one (`makeTree`), recorded as soon as git has made it.
 * A tree with a `package.json` and no `node_modules` is installed
 * (`install`). A new tree whose install fails is removed with its branch,
 * so that the claim leaves nothing.
 */
function treeFor(root, id) {
  let record = treeRecordOf(root, id);
  const said = [];
  let made = false;
  if (
    record !== undefined &&
    !treeIsThere(root, record) &&
    commitOf(root, `refs/heads/${record.branch}`) === undefined
  ) {
    said.push(
      `the record of ${id}'s tree names ${record.tree} and ${record.branch}, ` +
        'and neither is there: a tree is made anew',
    );
    removeTreeRecord(root, id);
    record = undefined;
  }
  if (record === undefined) {
    record = makeTree(root, id);
    writeTreeRecord(root, id, record);
    made = true;
    said.push(
      `${record.tree} is made on ${record.branch}, from ${record.from} at ` +
        record.base,
    );
  } else if (treeIsThere(root, record)) {
    said.push(
      `${id}'s tree is ${record.tree}, on ${record.branch}, as an earlier ` +
        'claim left it',
    );
  } else {
    reopenTree(root, record);
    said.push(
      `${record.tree} is made again from ${record.branch}, which holds the ` +
        'commits of an earlier claim',
    );
  }
  if (
    existsSync(join(record.tree, 'package.json')) &&
    !existsSync(join(record.tree, 'node_modules'))
  ) {
    try {
      said.push(install(record.tree));
    } catch (error) {
      if (made) {
        const removal = removeTree(root, record);
        if (removal.removed) {
          removeTreeRecord(root, id);
        }
        throw new TreeRefusal(
          `${error.message}; ${removal.said.join('; ') || 'nothing was left'}`,
        );
      }
      throw error;
    }
  }
  return said;
}

function claim({ root, id, options }) {
  const worker = theWorker(root);
  const claimed = fromItsRead(() => {
    const all = readBoard(root);
    const task = taskOf(all, id);
    const refused = obstacles(all, task);
    if (
      array(task.fields.needs).includes('owner') &&
      !options['--owner-told']
    ) {
      refused.push(
        'it needs the owner: claim it with --owner-told once the owner has ' +
          'told you to take it',
      );
    }
    if (refused.length > 0) {
      throw new Refusal(`${id} cannot be claimed: ${refused.join('; ')}`);
    }
    return acquireClaim(root, task, worker, {
      logEntry: options['--owner-told']
        ? 'Claimed: the owner said so.'
        : undefined,
      onHeld: `${id} is held by another worker: take another task`,
      onLower: lower =>
        `${id} was released at once: ${lower.map(idOf).join(', ')} was ` +
        'claimed in the same moment and overlaps it. Take another task',
    });
  });
  console.log(
    `${id} is yours, ${worker}. Read AGENTS.md, work/README.md and ` +
      'work/agreements.md, then the task, the RFC and step it names, and ' +
      'the README of each package it writes.\n',
  );
  const record = treeRecordOf(root, id);
  if (record !== undefined) {
    console.log(
      `Your tree is ${record.tree}, on ${record.branch}. Change files only ` +
        `there, and commit them on ${record.branch} before you submit. Run ` +
        `this command, not the tree's copy of it, as ` +
        `"node ${join(root, 'scripts/task.mjs')} <subcommand>": the board ` +
        `is ${root}'s.\n`,
    );
  }
  process.stdout.write(brief(claimed.all, claimed.task, Infinity));
}

function beat({ root, id }) {
  const worker = theWorker(root);
  const said = fromItsRead(() => {
    const all = readBoard(root);
    const task = taskOf(all, id);
    // A reviewer beats its review mark as a worker beats its claim.
    if (statusOf(task) === 'review' && task.fields.review?.by === worker) {
      const time = now();
      writeTask(
        root,
        task,
        withReview(task.text, { ...task.fields.review, beat: time }),
      );
      return `${id}: review beat ${time}`;
    }
    if (statusOf(task) !== 'in-progress' || task.fields.claim?.by !== worker) {
      throw new Refusal(
        `${id} is neither claimed nor under review by ${worker}: ` +
          `it is ${statusOf(task)}` +
          (task.fields.claim ? `, held by ${task.fields.claim.by}` : '') +
          (task.fields.review
            ? `, under review by ${markInWords(task.fields.review)}`
            : ''),
      );
    }
    const time = now();
    writeTask(
      root,
      task,
      withClaim(task.text, { ...task.fields.claim, beat: time }),
    );
    return `${id}: beat ${time}`;
  });
  console.log(said);
}

function log({ root, id }) {
  const worker = theWorker(root);
  const time = fromItsRead(() => {
    const task = holding(readBoard(root), id, worker);
    const written = now();
    writeTask(
      root,
      task,
      withLogEntry(
        withClaim(task.text, { ...task.fields.claim, beat: written }),
        worker,
        written,
        entryFromStdin('the Log entry'),
      ),
    );
    return written;
  });
  console.log(`${id}: Log entry added, beat ${time}`);
}

function scope({ root, id }) {
  const all = readBoard(root);
  const task = taskOf(all, id);
  const found = scopeOf(task, placeOf(all, task));
  printScope(task, found);
  const refused = outOfScope(task, found);
  if (refused !== undefined) {
    throw new Refusal(refused);
  }
  console.log(`Scope OK (${found.mine.length} file(s) of ${id}).`);
}

/**
 * What says which parts of the interface a task's changed files can
 * change, in the checkout the command runs on. It is TypeScript that
 * imports nothing, which Node runs as it is.
 */
const PARITY_SCOPE = 'apps/web/e2e/parity/scope.ts';

/** The variable by which the parity comparison is told its parts, as `PARITY_SCOPE` names it. */
const PARITY_PARTS_VARIABLE = 'AEP_PARITY_PARTS';

/** Asks `PARITY_SCOPE` for the files read from stdin, and prints its answer. */
const PARITY_SETTING = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { paritySetting } = await import(pathToFileURL(process.argv[1]).href);
console.log(JSON.stringify(paritySetting(JSON.parse(readFileSync(0, 'utf8')))));
`;

/**
 * Whether a check runs the parity comparison: the end-to-end suite (one of
 * its words is `e2e`) with no project named, or with one that names the
 * project `parity` (`--project=<name>` or `--project <name> ...`, without
 * case, `*` for any text). The words are those the shell hands on
 * (`shellWords`), and the options are those after `e2e` up to a `--`, which
 * ends them: what `projectsNamedOn` of `apps/web/playwright.config.ts`
 * reads of the same command line.
 */
function runsParity(command) {
  const words = shellWords(command);
  if (!words.includes('e2e')) {
    return false;
  }
  const passed = words.slice(words.indexOf('e2e') + 1);
  const named = [];
  let listing = false;
  for (const [index, word] of passed.entries()) {
    if (word === '--') {
      break;
    }
    if (passed[index - 1] === '--project') {
      named.push(word);
    } else if (word === '--project') {
      listing = true;
    } else if (word.length > 1 && word.startsWith('-')) {
      listing = false;
      if (word.startsWith('--project=')) {
        named.push(word.slice('--project='.length));
      }
    } else if (listing) {
      named.push(word);
    }
  }
  return (
    named.length === 0 ||
    named.some(name =>
      new RegExp(
        `^${name
          .toLowerCase()
          .split('*')
          .map(text => text.replace(/[\\^$.+?()[\]{}|]/g, '\\$&'))
          .join('.*')}$`,
      ).test('parity'),
    )
  );
}

/**
 * Why a submit of a build or fix task is refused before its checks run
 * when none of the files of its `writes` or `appends` differs from its
 * tree's base: its checks would be narrowed to what it changed, which is
 * nothing, and pass without testing anything. Nothing when the task
 * changed one, or is of another kind.
 */
function changedNothing(task, place) {
  if (!CHECKED_KINDS.has(task.fields.kind)) {
    return undefined;
  }
  if (changedByTask(task, place).length > 0) {
    return undefined;
  }
  return (
    `it is a task of kind ${task.fields.kind}, and no file of its writes or ` +
    `appends in its tree ${place.record.tree} differs from its base ` +
    `${place.base}, so its checks would run on nothing. Change its files, ` +
    'or, when nothing is left to change, say why in its Log and release it'
  );
}

/**
 * The files of the task's scope that its tree changed from its base,
 * committed or not, a deleted one among them: what its checks are
 * narrowed to.
 */
const changedByTask = (task, { root, base }) =>
  changedFiles(root, base).filter(
    file => !file.startsWith('work/tasks/') && inScope(task, file),
  );

/**
 * The parts the parity comparison of a submit compares, for the task's
 * changed files: the value that names them to the run (none when every
 * part is compared), the parts (`every`, or their names) and the lines
 * that say which and why. Nothing on a board
 * without `PARITY_SCOPE`. When it cannot be asked, every part is
 * compared, and the lines say so.
 */
function parityPartsOf(root, files) {
  const scope = join(root, PARITY_SCOPE);
  if (!existsSync(scope)) {
    return undefined;
  }
  const asked = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', PARITY_SETTING, scope],
    { input: JSON.stringify(files), encoding: 'utf8' },
  );
  try {
    if (asked.status === 0) {
      const setting = JSON.parse(asked.stdout);
      if (
        (setting.parts === 'every' || Array.isArray(setting.parts)) &&
        Array.isArray(setting.lines)
      ) {
        return setting;
      }
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }
  return {
    parts: 'every',
    lines: [
      `the parity comparison compares every part: ${PARITY_SCOPE} did not ` +
        'say which parts the changed files of the task can change' +
        (asked.stderr?.trim() ? `:\n${asked.stderr.trim()}` : ''),
    ],
  };
}

/** The parts of a parity setting, in words. */
const partsInWords = ({ parts }) =>
  parts === 'every'
    ? 'every part'
    : parts.length === 0
      ? 'no part'
      : parts.join(', ');

/**
 * The environment of a check with the parts its parity comparison
 * compares: the variable with the setting's value, or without the
 * variable when every part is compared, whatever the caller set.
 */
function withParityParts(environment, setting) {
  const { [PARITY_PARTS_VARIABLE]: _callers, ...others } = environment;
  return setting.value === undefined
    ? others
    : { ...others, [PARITY_PARTS_VARIABLE]: setting.value };
}

// A check of the whole tree, narrowed to what the task changed.

/**
 * The scripts of the whole new tree that a submit runs on what the task
 * changed instead (`narrowedCheck`).
 */
const NARROWED_SCRIPTS = new Set(['platform:check', 'platform:test']);

/** The word before a check that asks for the whole tree, not narrowed. */
const WHOLE_TREE = 'AEP_WHOLE_TREE=1';

/**
 * Files outside every package that the checks of every package read: a
 * change to one runs the whole tree.
 */
const READ_BY_EVERY_PACKAGE = new Set([
  '.oxlintrc.json',
  '.yarnrc.yml',
  'deploy/dev/local.env',
  'package.json',
  'scripts/lib/newTree.mjs',
  'tsconfig.json',
  'tsconfig.platform.json',
  'vitest.config.mts',
  'yarn.lock',
]);

/** The files whose imports Vitest follows, so that it finds their tests. */
const IN_THE_IMPORT_GRAPH = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** A literal argument of a call, or the text of a template before its `${`. */
const LITERAL_ARGUMENT =
  /^\s*,\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)(?:`|(\$\{)))/;

/**
 * The paths a source file of the repository names relative to where it
 * is, each from the repository's root (`''` is the root itself), in the
 * forms the tests of the new tree read files by:
 *
 * - `join(import.meta.dirname, ...)` and `resolve(import.meta.dirname, ...)`,
 *   with the literal arguments that lead it (a template up to the
 *   directory before its first `${`);
 * - `new URL('...', import.meta.url)`;
 * - an import of a relative specifier.
 *
 * A path above the root is left out.
 */
export function pathsNamedBy(file, source) {
  const directory = posix.dirname(file);
  const found = new Set();
  const named = parts => {
    const path = posix.join(directory, ...parts);
    if (path !== '..' && !path.startsWith('../')) {
      found.add(path === '.' ? '' : path.replace(/\/$/, ''));
    }
  };
  for (const call of source.matchAll(
    /\b(?:join|resolve)\(\s*import\.meta\.dirname\b/g,
  )) {
    const parts = [];
    let rest = source.slice(call.index + call[0].length);
    for (let literal; (literal = LITERAL_ARGUMENT.exec(rest)) !== null;) {
      const text = literal[1] ?? literal[2] ?? literal[3];
      if (literal[4] !== undefined) {
        parts.push(text.slice(0, text.lastIndexOf('/') + 1));
        break;
      }
      parts.push(text);
      rest = rest.slice(literal[0].length);
    }
    named(parts);
  }
  for (const url of source.matchAll(
    /\bnew URL\(\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)")\s*,\s*import\.meta\.url\s*\)/g,
  )) {
    named([url[1] ?? url[2]]);
  }
  for (const specifier of source.matchAll(
    /(?:\bfrom|\bimport\s*\(|\bimport)\s*['"](\.\.?\/[^'"\n]*)['"]/g,
  )) {
    named([specifier[1]]);
  }
  return [...found].sort();
}

/**
 * The directories of a package, from the repository's root, that hold
 * what its Vitest runs: those before the first wildcard of each pattern
 * of `include` in its `vitest.config.ts`, or the whole package when it
 * names none.
 */
function testedDirectoriesOf(root, directory) {
  const configuration = join(root, directory, 'vitest.config.ts');
  const include = existsSync(configuration)
    ? /\binclude:\s*\[([^\]]*)\]/.exec(readFileSync(configuration, 'utf8'))
    : null;
  const patterns = [...(include?.[1] ?? '').matchAll(/'([^']*)'|"([^"]*)"/g)];
  if (patterns.length === 0) {
    return [directory];
  }
  return patterns.map(([, single, double]) => {
    const pattern = single ?? double;
    const fixed = pattern.slice(0, pattern.search(/[*?{[]|$/));
    return posix
      .join(directory, fixed.slice(0, fixed.lastIndexOf('/') + 1))
      .replace(/\/$/, '');
  });
}

/**
 * The source files of the new tree's packages, in the directories their
 * Vitest runs (`testedDirectoriesOf`), that name a path outside their own
 * package (`pathsNamedBy`): each with its package's directory and the
 * path, `''` when it reads the whole repository from its root. What such
 * a file names inside its package but outside those directories is
 * followed: a file, and the modules at the top of a directory, which is
 * what a loader by directory imports (`e2e/fixtures/` of apps/web); the
 * package's own directory, a base that paths are built on, is not. What
 * a followed file names outside the package is read by the file that led
 * there. A narrowed check runs what reads a changed file this way, which
 * no import graph ties to it.
 */
function readersOf(root, packages) {
  return packages
    .filter(found => found.newTree)
    .flatMap(({ directory }) => {
      const within = (path, parent) =>
        path === parent || path.startsWith(`${parent}/`);
      const tested = [...new Set(testedDirectoriesOf(root, directory))].filter(
        path => existsSync(join(root, path)),
      );
      const isTested = path => tested.some(parent => within(path, parent));
      const named = new Map();
      const namedBy = file => {
        if (!named.has(file)) {
          named.set(
            file,
            pathsNamedBy(file, readFileSync(join(root, file), 'utf8')),
          );
        }
        return named.get(file);
      };
      const codeAt = path => {
        const stats = statSync(join(root, path), { throwIfNoEntry: false });
        const files = stats?.isDirectory()
          ? readdirSync(join(root, path), { withFileTypes: true })
              .filter(entry => entry.isFile())
              .map(entry => `${path}/${entry.name}`)
          : stats?.isFile()
            ? [path]
            : [];
        return files.filter(
          file => IN_THE_IMPORT_GRAPH.test(file) && !isTested(file),
        );
      };
      return tested
        .flatMap(path => filesUnder(root, `${path}/`))
        .filter(file => IN_THE_IMPORT_GRAPH.test(file))
        .flatMap(file => {
          const outside = new Set();
          const seen = new Set([file]);
          for (const queue = [file]; queue.length > 0;) {
            for (const path of namedBy(queue.pop())) {
              if (!within(path, directory)) {
                outside.add(path);
              } else if (path !== directory && !isTested(path)) {
                for (const followed of codeAt(path)) {
                  if (!seen.has(followed)) {
                    seen.add(followed);
                    queue.push(followed);
                  }
                }
              }
            }
          }
          return [...outside].sort().map(path => ({ file, directory, path }));
        });
    });
}

/** A test file, as Vitest finds one. */
const IS_TEST = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/;

/** A path as one word of the shell. */
const shellWord = path =>
  /^[\w./@:=+-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;

/**
 * The workspace's packages under the patterns of the root's `workspaces`:
 * each one's directory, name, whether it is of the new tree, and the
 * packages it names among its dependencies; the root's scripts; and the
 * files of the new tree that read a path outside their package
 * (`readersOf`).
 */
function workspaceOf(root) {
  const file = join(root, 'package.json');
  const manifest = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {};
  const newTree = new Set(newTreePackages(root));
  const packages = packagesIn(root, array(manifest.workspaces)).map(
    directory => {
      const own = JSON.parse(
        readFileSync(join(root, directory, 'package.json'), 'utf8'),
      );
      return {
        directory,
        name: own.name,
        newTree: newTree.has(directory),
        uses: ['dependencies', 'devDependencies', 'peerDependencies'].flatMap(
          group => Object.keys(own[group] ?? {}),
        ),
      };
    },
  );
  return {
    packages,
    scripts: manifest.scripts ?? {},
    readers: readersOf(root, packages),
  };
}

/**
 * The program of a root script with its options, up to its first word
 * that is neither: what a narrowed check keeps of `platform:lint`.
 */
function programOf(script) {
  const words = shellWords(script ?? '');
  const end = words.findIndex((word, at) => at > 0 && !word.startsWith('-'));
  return end === -1 ? words : words.slice(0, end);
}

/**
 * `platform:typecheck` on the packages of `directories`: the script's
 * `yarn workspaces foreach` with its options, its `--include` and
 * `--exclude` replaced by one `--include` for each directory, and with
 * `extra` options.
 */
function typecheckOf(script, directories, extra = []) {
  const words = shellWords(script ?? '');
  const exec = words.indexOf('exec');
  if (exec === -1) {
    throw new Refusal(
      `the root's platform:typecheck (\`${script}\`) runs no \`exec\``,
    );
  }
  const head = words
    .slice(0, exec)
    .filter(
      (word, at, all) =>
        !['--include', '--exclude'].includes(word) &&
        !['--include', '--exclude'].includes(all[at - 1]),
    );
  return [
    ...head,
    ...extra,
    ...directories.flatMap(directory => ['--include', directory]),
    ...words.slice(exec),
  ]
    .map(shellWord)
    .join(' ');
}

/**
 * What a submit runs for a check of the whole new tree
 * (`yarn platform:check` or `yarn platform:test`, with options and no
 * file named), given the files the task changed (`changed`, those that
 * exist, and `deleted`) and the workspace (`workspaceOf`):
 *
 * - the typecheck of the packages of the changed files and of every
 *   package that depends on them, directly or not;
 * - oxlint on the changed files;
 * - `vitest related` on the changed files Vitest follows the imports of,
 *   and the tests of the packages (with their dependants) of every other
 *   changed or deleted file, which no import graph ties to its tests;
 * - for a changed or deleted file that a file of the new tree reads by
 *   path (`workspace.readers`), that file when it is a test, and the
 *   tests of its package with their dependants when it is not;
 * - the tests that read the whole repository from its root, for any
 *   changed or deleted file but those of the board (`work/tasks/`), which
 *   every task's Log changes.
 *
 * `platform:test` runs only the tests. A file that every package's checks
 * read (`READ_BY_EVERY_PACKAGE`), or a check that starts with
 * `AEP_WHOLE_TREE=1`, runs the whole tree. Undefined for any other check.
 * The result is `{ command, lines }`: the command (undefined when nothing
 * is to run) and the lines that say why.
 */
export function narrowedCheck(command, { changed, deleted = [] }, workspace) {
  const words = shellWords(command);
  if (
    words[0] === WHOLE_TREE &&
    words[1] === 'yarn' &&
    NARROWED_SCRIPTS.has(words[2])
  ) {
    return { command, lines: [`it asks for the whole tree (${WHOLE_TREE})`] };
  }
  const options = words.slice(2);
  if (
    words[0] !== 'yarn' ||
    !NARROWED_SCRIPTS.has(words[1]) ||
    options.some(option => !option.startsWith('-'))
  ) {
    return undefined;
  }
  const files = [...changed, ...deleted];
  const everyPackage = files.filter(file => READ_BY_EVERY_PACKAGE.has(file));
  if (everyPackage.length > 0) {
    return {
      command,
      lines: [
        `the whole tree: the checks of every package read ${everyPackage.join(', ')}`,
      ],
    };
  }
  const { packages, scripts } = workspace;
  const packageOf = file =>
    packages
      .filter(candidate => file.startsWith(`${candidate.directory}/`))
      .sort((a, b) => b.directory.length - a.directory.length)[0];
  const withDependants = start => {
    const found = new Set(start);
    for (let added = true; added;) {
      added = false;
      for (const candidate of packages) {
        if (
          !found.has(candidate) &&
          [...found].some(used => candidate.uses.includes(used.name))
        ) {
          found.add(candidate);
          added = true;
        }
      }
    }
    return [...found]
      .filter(found => found.newTree)
      .map(found => found.directory)
      .sort();
  };
  const followed = changed.filter(
    file => IN_THE_IMPORT_GRAPH.test(file) && packageOf(file)?.newTree,
  );
  const unfollowed = files.filter(
    file => packageOf(file) !== undefined && !followed.includes(file),
  );
  const changedPackages = [...new Set(files.map(packageOf))].filter(Boolean);
  const typechecked = withDependants(changedPackages);
  const readers = workspace.readers ?? [];
  const readsOf = reader =>
    reader.path === ''
      ? []
      : files.filter(
          file => file === reader.path || file.startsWith(`${reader.path}/`),
        );
  const byPath = readers
    .map(reader => ({ reader, read: readsOf(reader) }))
    .filter(({ read }) => read.length > 0);
  const wholeRepository = files.some(file => !file.startsWith('work/tasks/'))
    ? readers.filter(reader => reader.path === '')
    : [];
  const readerPackages = [
    ...byPath.map(({ reader }) => reader),
    ...wholeRepository,
  ]
    .filter(reader => !IS_TEST.test(reader.file))
    .map(reader =>
      packages.find(found => found.directory === reader.directory),
    );
  const tested = withDependants(
    new Set([...unfollowed.map(packageOf), ...readerPackages]),
  );
  const testFiles = [
    ...new Set(
      [...byPath.map(({ reader }) => reader), ...wholeRepository]
        .map(reader => reader.file)
        .filter(file => IS_TEST.test(file))
        .filter(
          file => !tested.some(directory => file.startsWith(`${directory}/`)),
        ),
    ),
  ].sort();
  const passed = options.map(shellWord).join(' ');
  const tail = passed === '' ? '' : ` ${passed}`;
  const commands = [];
  const lines = [];
  if (words[1] === 'platform:check' && typechecked.length > 0) {
    commands.push(typecheckOf(scripts['platform:typecheck'], typechecked));
    const direct = changedPackages
      .filter(found => found.newTree)
      .map(found => found.directory);
    const dependants = typechecked.filter(
      directory => !direct.includes(directory),
    );
    lines.push(
      `typecheck: ${direct.join(', ') || 'no package of the new tree'}` +
        (dependants.length > 0
          ? `, and what depends on them: ${dependants.join(', ')}`
          : ''),
    );
  }
  if (words[1] === 'platform:check' && followed.length > 0) {
    commands.push(
      [
        'yarn',
        ...programOf(scripts['platform:lint']).map(shellWord),
        ...followed.map(shellWord),
      ].join(' '),
    );
    lines.push(`oxlint: the ${followed.length} changed file(s)`);
  }
  if (followed.length > 0) {
    commands.push(
      `yarn vitest related --run --passWithNoTests${tail} ` +
        followed.map(shellWord).join(' '),
    );
    lines.push(
      `tests: those related to the ${followed.length} changed file(s)`,
    );
  }
  if (tested.length > 0 || testFiles.length > 0) {
    commands.push(
      `yarn platform:test --passWithNoTests${tail} ` +
        [...tested.map(directory => `${directory}/`), ...testFiles]
          .map(shellWord)
          .join(' '),
    );
  }
  if (unfollowed.length > 0) {
    lines.push(
      `tests: every test of ${withDependants(new Set(unfollowed.map(packageOf))).join(', ')}, ` +
        `for ${unfollowed.join(', ')}, which no import graph ties to its tests`,
    );
  }
  const testsOf = reader =>
    IS_TEST.test(reader.file)
      ? reader.file
      : `every test of ${withDependants([packages.find(found => found.directory === reader.directory)]).join(', ')}`;
  for (const { reader, read } of byPath) {
    lines.push(
      `tests: ${testsOf(reader)}, for ${read.join(', ')}, which ` +
        `${reader.file} reads by path`,
    );
  }
  if (wholeRepository.length > 0) {
    lines.push(
      `tests: ${[...new Set(wholeRepository.map(testsOf))].join(', ')}, for ` +
        `${wholeRepository.map(reader => reader.file).join(', ')} read(s) ` +
        'the whole repository by path',
    );
  }
  if (commands.length === 0) {
    lines.push(
      'nothing: the task changed no file of a package of the new tree, ' +
        'and none that a file of the new tree reads by path',
    );
  }
  return {
    command: commands.length === 0 ? undefined : commands.join(' && '),
    lines,
  };
}

/**
 * Whether a file decides what Prettier says of other files, so that a
 * change to it, or its deletion, formats the whole tree: a configuration
 * at any depth (`.prettierrc`, `.prettierrc.*`, `prettier.config.*`,
 * `.editorconfig`, which Prettier reads up from each file), any
 * `package.json`, since its `prettier` key is a configuration and a
 * checkout with no commit cannot tell whether that key changed, and the
 * root's ignore files (Prettier reads those of where it runs) and
 * `yarn.lock` (its version, and that of the shared configuration).
 */
const readByPrettier = file => {
  const name = file.slice(file.lastIndexOf('/') + 1);
  return (
    name === '.prettierrc' ||
    name.startsWith('.prettierrc.') ||
    name.startsWith('prettier.config.') ||
    name === '.editorconfig' ||
    name === 'package.json' ||
    ['.gitignore', '.prettierignore', 'yarn.lock'].includes(file)
  );
};

/**
 * How each part of `lint:repo` runs for a submit. A part whose script
 * takes the files to check (`files: true`) runs on the task's changed
 * files, with its deleted ones too when it reads what a deletion breaks
 * (`deleted: true`), and not at all when there are none; every other part
 * runs as it is, for the reason given (work/README.md lists them).
 */
export const LINT_REPO_PARTS = {
  'lint:ui-boundaries': {
    files: false,
    reason:
      'its script takes no files, and a library or the HTTP client is ' +
      'allowed in one place, a rule across files',
  },
  'lint:data-model': {
    files: false,
    reason:
      'its script takes no files, and it fails when an exempt package ' +
      'no longer needs its exemption, which no one file tells',
  },
  'lint:module-boundaries': {
    files: false,
    reason:
      'a table is owned by the module whose migrations create it, a rule ' +
      'across every package',
  },
  'lint:tenancy': {
    files: false,
    reason:
      'the tables partitioned by organization share one modulus, a rule ' +
      'across every migration',
  },
  'lint:code-rules': {
    files: true,
    reason: 'each of its rules reads one file',
  },
  'lint:docs': {
    files: true,
    deleted: true,
    reason:
      'the rules of one Markdown file run on the changed ones, and every ' +
      'file is read for its links into a changed or deleted file; the ADR ' +
      'index and the README of each package are checked against the ' +
      'whole tree',
  },
  'lint:icon-library': {
    files: false,
    reason: 'the index is compared with what the whole folder produces',
  },
  'lint:tasks': {
    files: false,
    reason:
      "the board's rules (ids, dependencies, paths in conflict) hold " +
      'across every task',
  },
  'lint:unused': {
    files: false,
    reason: 'knip reads the import graph of the whole repository',
  },
  'lint:deploy-environment': {
    files: false,
    reason:
      'what each role declares comes from every module the server ' +
      'composes, and is compared with every render of the manifests',
  },
  'lint:network-policies': {
    files: false,
    reason:
      'policies add up: the union is evaluated on every render of the ' +
      'manifests and on what a release applies',
  },
};

/**
 * The files of a program that the root's script `name` runs
 * (`node scripts/check-docs.mjs` gives `scripts/check-docs.mjs`), with
 * the local modules it imports, directly or through one another, as
 * `pathsNamedBy` reads them from the sources under `root`: a module
 * that a program imports holds the part's rules as much as the program
 * does. A file that does not exist (one the task deleted) is named but
 * not read. Without `root`, only the programs the script names.
 */
function programFilesOf(scripts, name, root) {
  const found = new Set(
    shellWords(scripts[name] ?? '').filter(word =>
      /^[\w./-]+\.[cm]?[jt]s$/.test(word),
    ),
  );
  if (root === undefined) {
    return [...found];
  }
  for (const queue = [...found]; queue.length > 0;) {
    const file = queue.pop();
    const source = join(root, file);
    if (!existsSync(source)) {
      continue;
    }
    for (const path of pathsNamedBy(file, readFileSync(source, 'utf8'))) {
      if (IN_THE_IMPORT_GRAPH.test(path) && !found.has(path)) {
        found.add(path);
        queue.push(path);
      }
    }
  }
  return [...found];
}

/**
 * How the part `name` of `lint:repo` runs for a submit, given the files the
 * task changed and deleted, whether inside `lint:repo` or named as a check
 * of its own: `{ command, line, onFiles }`, where `command` is undefined
 * when it runs on files and there are none, and `line` says what ran. A
 * part that takes files runs as it is when the task changed or deleted the
 * program its script runs or a local module that program imports
 * (`programFilesOf`, read under `root`), since they hold the part's rules
 * and a changed rule has to read every file.
 */
function partRun(name, { changed, deleted, root }, parts, scripts) {
  const known = parts[name];
  if (!known.files) {
    return {
      command: `yarn ${name}`,
      line: `${name} as it is: ${known.reason}`,
    };
  }
  const program = programFilesOf(scripts, name, root).filter(
    file => changed.includes(file) || deleted.includes(file),
  );
  if (program.length > 0) {
    return {
      command: `yarn ${name}`,
      line: `${name} as it is: the task changed ${program.join(', ')}, of the program it runs`,
    };
  }
  const given = known.deleted ? [...changed, ...deleted] : changed;
  return given.length === 0
    ? { onFiles: true, line: `${name}: nothing, the task changed no file` }
    : {
        onFiles: true,
        command: `yarn ${name} ${given.map(shellWord).join(' ')}`,
        line:
          `${name}: the ${changed.length} changed file(s)` +
          (given.length > changed.length
            ? ` and the ${deleted.length} deleted`
            : ''),
      };
}

/**
 * The parts of the root's `lint:repo`, the commands its `&&` joins, each
 * `{ words, text }` (`simpleCommands`).
 */
const lintRepoParts = scripts =>
  simpleCommands(scripts['lint:repo'] ?? '', ['&&']);

/**
 * What a submit runs for `yarn prettier:check`, `yarn lint:repo` or one of
 * its parts, with no option or file named, given the files the task changed (`changed`,
 * those that exist, and `deleted`) and the root's scripts:
 *
 * - `prettier:check`: the script's program and options on the changed
 *   files, with `--ignore-unknown`; Prettier skips what `.prettierignore`
 *   ignores of the files it is given, as it does of the tree. A change to
 *   or the deletion (`deleted`) of a file that decides how others are
 *   formatted (`readByPrettier`) runs the whole tree, and a task that
 *   changed no file runs nothing.
 * - `lint:repo`: each of its parts (`yarn lint:<part>`, joined by `&&`)
 *   as `LINT_REPO_PARTS` says (`partRun`): on the changed files, or as it
 *   is. When no part runs on files, the check runs as it is written.
 * - a part of `lint:repo` named directly (`yarn lint:docs`): as the same
 *   part runs inside `lint:repo`.
 *
 * A check that starts with `AEP_WHOLE_TREE=1` runs as it is. Undefined for
 * any other check. `root` is the repository whose programs' imports a
 * part follows (`partRun`). `parts` is how each part of `lint:repo` runs. The
 * result is `{ command, lines }`, as `narrowedCheck` gives: its first line
 * says in a few words what ran, for the Log.
 */
export function narrowedRepositoryCheck(
  command,
  { changed, deleted = [], root },
  scripts,
  parts = LINT_REPO_PARTS,
) {
  const words = shellWords(command);
  const checked = name => ['prettier:check', 'lint:repo'].includes(name);
  const part = name => Object.hasOwn(parts, name);
  if (
    words.length === 3 &&
    words[0] === WHOLE_TREE &&
    words[1] === 'yarn' &&
    (checked(words[2]) || part(words[2]))
  ) {
    return { command, lines: [`it asks for the whole tree (${WHOLE_TREE})`] };
  }
  if (words.length !== 2 || words[0] !== 'yarn') {
    return undefined;
  }
  if (part(words[1])) {
    const run = partRun(words[1], { changed, deleted, root }, parts, scripts);
    return { command: run.command, lines: [run.line] };
  }
  if (!checked(words[1])) {
    return undefined;
  }
  const files = changed.map(shellWord).join(' ');
  if (words[1] === 'prettier:check') {
    const everyFile = [...changed, ...deleted].filter(readByPrettier);
    if (everyFile.length > 0) {
      return {
        command,
        lines: [
          `the whole tree: ${everyFile.join(', ')} decide(s) how other files are formatted`,
        ],
      };
    }
    if (changed.length === 0) {
      return {
        command: undefined,
        lines: ['nothing: the task changed no file'],
      };
    }
    return {
      command: [
        'yarn',
        ...programOf(scripts['prettier:check']).map(shellWord),
        '--ignore-unknown',
        files,
      ].join(' '),
      lines: [
        `Prettier: the ${changed.length} changed file(s), but those ` +
          '.prettierignore ignores',
      ],
    };
  }
  const ran = lintRepoParts(scripts).map(part => {
    const [program, name, ...rest] = part.words;
    if (program !== 'yarn' || rest.length > 0 || parts[name] === undefined) {
      return {
        command: part.text,
        line: `\`${part.text}\` as it is: task.mjs does not know how it reads the repository (LINT_REPO_PARTS)`,
      };
    }
    return partRun(name, { changed, deleted, root }, parts, scripts);
  });
  const lines = ran.map(part => part.line);
  if (!ran.some(part => part.onFiles)) {
    return {
      command,
      lines: ['the whole repository: no part of it runs on files', ...lines],
    };
  }
  const commands = ran.flatMap(part => part.command ?? []);
  return {
    command: commands.length === 0 ? undefined : commands.join(' && '),
    lines: ['its parts, each as below', ...lines],
  };
}

/**
 * What the submit of a task runs for each of its checks that is narrowed
 * (`narrowedCheck`, `narrowedRepositoryCheck`), by the files of its scope
 * that changed since its first claim (`changedByTask`).
 */
function narrowingsOf(task, place) {
  const files = changedByTask(task, place);
  const deleted = files.filter(file => !existsSync(join(place.root, file)));
  const changes = {
    changed: files.filter(file => !deleted.includes(file)),
    deleted,
  };
  const workspace = workspaceOf(place.root);
  return new Map(
    task.fields.checks.flatMap(command => {
      const narrowed =
        narrowedCheck(command, changes, workspace) ??
        narrowedRepositoryCheck(
          command,
          { ...changes, root: place.root },
          workspace.scripts,
        );
      return narrowed === undefined ? [] : [[command, narrowed]];
    }),
  );
}

/** How a check ran, for its line in the Log: as it is, or narrowed. */
const ranAs = (command, narrowed) =>
  narrowed === undefined
    ? ''
    : narrowed.command === command
      ? `, on the whole tree: ${narrowed.lines[0]}`
      : narrowed.command === undefined
        ? ', narrowed to nothing'
        : `, narrowed to \`${narrowed.command}\``;

/**
 * Decides all that needs no check before the first check runs: the Log
 * entry, the commit its tree is at (`committedIn`) and the scope. The
 * checks run in the tree on that commit, and the submit is refused when
 * the tree is not at it after them: what was checked is what lands.
 */
function submit({ root, id, options }) {
  const worker = theWorker(root);
  const board = readBoard(root);
  const claimed = holding(board, id, worker);
  const place = placeOf(board, claimed);
  const committed = committedIn(id, place.record);
  const since = claimed.fields.claim.since.slice(0, 16);
  const entries = logEntries(claimed.body);
  const reported = entries.some(
    entry => entry.by === worker && entry.at !== undefined && entry.at >= since,
  );
  if (!reported) {
    const heading = headingPattern(root);
    const unread = entries
      .filter(entry => !heading.test(entry.heading))
      .map(entry => `"### ${entry.heading}"`);
    throw new Refusal(
      `${id} has no Log entry of ${worker} since the claim: add it with ` +
        `"log ${id}" first` +
        (unread.length > 0
          ? `. Not read as entries: ${unread.join(', ')}; a heading is ` +
            HEADING_FORM
          : ''),
    );
  }
  const unchecked = missingCheck(claimed);
  if (unchecked !== undefined) {
    throw new Refusal(`${id} is not submitted: ${unchecked}`);
  }
  const found = scopeOf(claimed, place);
  printScope(claimed, found);
  const refusedScope = outOfScope(claimed, found);
  if (refusedScope !== undefined) {
    throw new Refusal(`${id} is not submitted: ${refusedScope}`);
  }
  const nothing = changedNothing(claimed, place);
  if (nothing !== undefined) {
    throw new Refusal(`${id} is not submitted: ${nothing}`);
  }
  // The parity comparison of a check compares the parts the task's
  // changed files can change (PARITY_SCOPE).
  const parity = claimed.fields.checks.some(runsParity)
    ? parityPartsOf(place.root, changedByTask(claimed, place))
    : undefined;
  if (parity !== undefined) {
    console.log(`\ntask: ${parity.lines.join('\n')}`);
  }
  // A check of the whole tree runs on what the task changed.
  const narrowings = narrowingsOf(claimed, place);
  for (const [command, narrowed] of narrowings) {
    console.log(
      `\ntask: \`${command}\` runs ${narrowed.command === undefined ? 'nothing' : `\`${narrowed.command}\``}:\n` +
        narrowed.lines.map(line => `  ${line}`).join('\n'),
    );
  }
  const results = [];
  const notSubmittedFor = error =>
    error instanceof NoSlot
      ? new Refusal(`${id} is not submitted: ${error.message}`)
      : error;
  // A heavy check runs under a slot of the machine (scripts/checkSlots.mjs).
  let runCheck;
  try {
    runCheck = checkRunner({
      root: place.root,
      board: root,
      checks: claimed.fields.checks,
      holder: { worker, task: id },
      environment: process.env,
      say: message => console.log(`task: ${message}`),
    });
  } catch (error) {
    throw notSubmittedFor(error);
  }
  for (const command of claimed.fields.checks) {
    const narrowed = narrowings.get(command);
    const ran = narrowed === undefined ? command : narrowed.command;
    if (ran === undefined) {
      results.push(`- \`${command}\`${ranAs(command, narrowed)}: pass, 0 s`);
      continue;
    }
    console.log(`\n$ ${ran}`);
    let started;
    let waited = '';
    let result;
    try {
      result = runCheck(command, (environment, ticket, waitedMs, bound) => {
        started = Date.now();
        waited = waitedFor(waitedMs);
        return {
          bound,
          ...spawnCheck(
            ran,
            {
              cwd: place.root,
              stdio: 'inherit',
              env:
                parity !== undefined && runsParity(command)
                  ? withParityParts(environment, parity)
                  : environment,
            },
            ticket,
            bound.ms,
          ),
        };
      });
    } catch (error) {
      throw notSubmittedFor(error);
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    results.push(
      `- \`${command}\`${ranAs(command, narrowed)}: ${checkOutcome(result)}, ${seconds} s${waited === '' ? '' : `, waited ${waited}`}`,
    );
  }
  console.log(`\nChecks:\n${results.join('\n')}\n`);

  // What was checked is what lands: the tree at the commit it was at.
  const after = committedIn(id, place.record);
  if (after.commit !== committed.commit) {
    throw new Refusal(
      `${id} is not submitted: ${place.record.branch} moved during the ` +
        `checks, from ${committed.commit} to ${after.commit}. Submit it again`,
    );
  }
  fromItsRead(() => {
    const task = holding(readBoard(root), id, worker);
    const failed = results.filter(result => result.includes(': FAIL')).length;
    if (failed > 0 && !options['--allow-failing-checks']) {
      throw new Refusal(
        `${id} is not submitted: ${failed} check(s) fail. A check that ` +
          'fails only in files outside the task is named in the Log, and ' +
          'the task submitted with --allow-failing-checks',
      );
    }
    const entry =
      `${SUBMITTED}\n\n` +
      `${results.join('\n')}\n\n` +
      (parity === undefined
        ? ''
        : `Parity: compared ${partsInWords(parity)}, by the task's ` +
          `changed files (\`${PARITY_PARTS_VARIABLE}\`).\n\n`) +
      `${committedLine(committed, place.record)}\n\n` +
      `Scope: ${found.mine.length} changed file(s), all under \`writes\` or ` +
      '`appends`.';
    writeTask(
      root,
      task,
      withLogEntry(
        withClaim(withStatus(task.text, 'review'), null),
        worker,
        now(),
        entry,
      ),
    );
  });
  removeClaim(root, id);
  console.log(`${id} is in review.`);
}

/** How a check of a submit ended, as its line of the Log says it. */
function checkOutcome({ status, signal, timedOut, bound }) {
  if (timedOut) {
    return `FAIL (timed out after ${bound.minutes} min)`;
  }
  return status === 0 ? 'pass' : `FAIL (exit ${status ?? signal})`;
}

/**
 * Runs a command a worker starts by hand under the slots of the machine
 * (scripts/checkSlots.mjs), so that its heavy suites and the checks of
 * submits share the cores; the process ends as the command did.
 */
async function run({ root, id, command }) {
  if (command === undefined || command.length === 0) {
    throw new Refusal(
      'run needs the command after --: run [T-NNNN] -- <command>',
    );
  }
  if (id !== undefined && !/^T-\d{4,}$/.test(id)) {
    throw new Refusal(`run names a task as T-NNNN, not "${id}"`);
  }
  // A task's own command runs as its tree's checks do: its weight read
  // from the tree, in the board's queue.
  const record = id === undefined ? undefined : treeRecordOf(root, id);
  let end;
  try {
    end = await runInTurn({
      root: record === undefined ? root : record.tree,
      board: root,
      argv: command,
      holder: {
        worker: namedWorker(root) ?? 'a worker not named in AEP_WORKER',
        task: id ?? 'no task',
      },
      environment: process.env,
      say: message => console.error(`task: ${message}`),
    });
  } catch (error) {
    throw error instanceof NoSlot
      ? new Refusal(`\`${command.join(' ')}\` did not run: ${error.message}`)
      : error;
  }
  if (end.signal !== null) {
    // Ended as the command was, so that what started this run sees it.
    process.kill(process.pid, end.signal);
    return;
  }
  process.exitCode = end.status;
}

// The sweep: the whole tree, on its own schedule.

/** The one task a failing sweep files, and every later failing one updates. */
const SWEEP_TITLE = 'The whole tree passes its checks again';

/** The check of the task the sweep files: the whole tree, not narrowed. */
const SWEEP_CHECK = `${WHOLE_TREE} yarn platform:check`;

/** The checks of the task the sweep files: every check it runs, on the whole tree. */
const SWEEP_CHECKS = [
  SWEEP_CHECK,
  `${WHOLE_TREE} yarn prettier:check`,
  `${WHOLE_TREE} yarn lint:repo`,
];

/** Where a sweep's test run writes its results, where git ignores them. */
const SWEEP_RESULTS = 'node_modules/.cache/sweep';

/** A path in the form `writes` holds (work/schema.json, `path`). */
const WRITABLE = /^[^/*?[\]{}\s][^*?[\]{}\s]*$/;

/**
 * The failures in what the whole tree's checks said: each with the step
 * that failed, the file (from the repository's root) and, for a test, its
 * name. `typecheck` is the output of the typecheck with each line after
 * its package's name (`yarn workspaces foreach --verbose`), `lint` that
 * of oxlint, `tests` Vitest's JSON report with `root` its paths' root,
 * `formatting` what Prettier said (step `prettier:check`); `failed` the
 * steps that ended other than with 0, `timedOut` those of them that ran
 * past their bound, each with the bound. A step that failed with no file
 * found in what it said is one failure with no file; one that timed out
 * is that failure, with its bound, whatever else it said.
 */
export function failuresIn(
  { typecheck, lint, tests, formatting, failed, timedOut = {} },
  root,
  packages,
) {
  const failures = [];
  const directoryOf = new Map(
    packages.map(found => [found.name, found.directory]),
  );
  for (const match of (typecheck ?? '').matchAll(
    /^\[([^\]]+)\]: (.+?)\(\d+,\d+\): error (TS\d+)/gm,
  )) {
    const directory = directoryOf.get(match[1]);
    failures.push({
      step: 'typecheck',
      file: directory === undefined ? match[2] : `${directory}/${match[2]}`,
      test: match[3],
    });
  }
  for (const match of (lint ?? '').matchAll(
    /^\s*(?:\S*\[)?([^\s[\]]+?):\d+:\d+(?:\]|: (?:error|warning))/gm,
  )) {
    failures.push({ step: 'lint', file: match[1] });
  }
  for (const match of (formatting ?? '').matchAll(
    /^\[(?:warn|error)\] ([^\s:]+?)(?::\s|$)/gm,
  )) {
    failures.push({ step: 'prettier:check', file: match[1] });
  }
  for (const result of tests?.testResults ?? []) {
    if (result.status !== 'failed') {
      continue;
    }
    const file = relative(root, result.name).split('\\').join('/');
    const failing = (result.assertionResults ?? []).filter(
      assertion => assertion.status === 'failed',
    );
    if (failing.length === 0) {
      failures.push({ step: 'tests', file });
    }
    for (const assertion of failing) {
      failures.push({ step: 'tests', file, test: assertion.fullName });
    }
  }
  for (const step of failed) {
    if (step in timedOut) {
      failures.push({ step, timedOut: timedOut[step] });
    } else if (!failures.some(failure => failure.step === step)) {
      failures.push({ step });
    }
  }
  const seen = new Set();
  return failures.filter(failure => {
    const key = JSON.stringify(failure);
    return !seen.has(key) && seen.add(key);
  });
}

/**
 * The task that last wrote a file: of the tasks whose paths hold it, the
 * one with the latest Log entry.
 */
function lastWriterOf(board, file) {
  const latest = task =>
    logEntries(task.body)
      .map(entry => entry.at ?? '')
      .sort()
      .at(-1) ?? '';
  return board.tasks
    .filter(task => inScope(task, file) && task.file !== file)
    .sort((a, b) => latest(b).localeCompare(latest(a)))[0];
}

/**
 * How long a check waited for its slot, as its Log line says it, from the
 * milliseconds the queue measured (ticket written to slot granted). Empty
 * for a light check (0) and for a wait under half a second.
 */
export function waitedFor(waitedMs) {
  const seconds = Math.round(waitedMs / 1000);
  if (!(seconds > 0)) {
    return '';
  }
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

/** The Log entry of a failing sweep: each failure, with the task that last wrote its file. */
export function sweepEntry(board, failures, waited) {
  const lines = failures.map(failure => {
    const writer =
      failure.file === undefined
        ? undefined
        : lastWriterOf(board, failure.file);
    if (failure.timedOut !== undefined) {
      return `- ${failure.step}: it timed out after ${failure.timedOut}`;
    }
    return (
      `- ${failure.step}: ` +
      (failure.file === undefined
        ? 'it failed, and named no file'
        : `\`${failure.file}\`` +
          (failure.test === undefined ? '' : `, ${failure.test}`) +
          `; last written by ${writer === undefined ? 'no task' : idOf(writer)}`)
    );
  });
  return (
    `\`yarn task sweep\` ran the whole tree (${SWEEP_CHECKS.map(check => `\`${check}\``).join(', ')}), ` +
    `${waited === '' ? '' : `after waiting ${waited} for its slot, `}and it failed:\n\n${lines.join('\n')}`
  );
}

/**
 * Runs a step of the sweep in the terminal, under the ticket of its slot
 * (`spawnCheck`), and keeps what it says when `capture`: what the sweep
 * reads the failures from.
 */
function sweepStep(root, environment, command, capture, ticket, bound) {
  console.log(`\n$ ${command}`);
  const result = spawnCheck(
    command,
    {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 1024 ** 3,
      stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    },
    ticket,
    bound.ms,
  );
  if (capture) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }
  return {
    passed: result.status === 0 && !result.timedOut,
    timedOut: result.timedOut ? `${bound.minutes} min` : undefined,
    said: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/**
 * Checks the whole new tree, as `platform:check` does, and the whole
 * repository, as `prettier:check` and each part of `lint:repo` do, under
 * one slot of the machine: its typecheck, its lint, every test, Prettier
 * and each part, each run whatever the one before did. A failure files
 * the sweep's task, or adds an entry
 * to it while it is not done: every failure, with the task that last
 * wrote its file. It finds what the narrowed checks of a submit skip.
 */
function sweep({ root }) {
  const worker = theWorker(root);
  const { packages, scripts } = workspaceOf(root);
  const results = join(root, SWEEP_RESULTS, `${process.pid}.json`);
  mkdirSync(dirname(results), { recursive: true });
  rmSync(results, { force: true });
  const steps = {
    typecheck: [
      typecheckOf(scripts['platform:typecheck'], newTreePackages(root), [
        '--verbose',
      ]),
      true,
    ],
    lint: ['yarn platform:lint', true],
    tests: [
      'yarn platform:test --reporter=default --reporter=json ' +
        `--outputFile.json=${shellWord(results)}`,
      false,
    ],
    'prettier:check': ['yarn prettier:check', true],
    ...Object.fromEntries(
      lintRepoParts(scripts).map(part => [
        part.words[1] ?? part.text,
        [part.text, false],
      ]),
    ),
  };
  let said;
  let waited = '';
  try {
    const runCheck = checkRunner({
      root,
      checks: [SWEEP_CHECK],
      holder: { worker, task: 'the sweep' },
      environment: process.env,
      say: message => console.log(`task: ${message}`),
    });
    said = runCheck(SWEEP_CHECK, (environment, ticket, waitedMs, bound) => {
      waited = waitedFor(waitedMs);
      return Object.fromEntries(
        Object.entries(steps).map(([step, [command, capture]]) => [
          step,
          sweepStep(root, environment, command, capture, ticket, bound),
        ]),
      );
    });
  } catch (error) {
    throw error instanceof NoSlot
      ? new Refusal(`the sweep did not run: ${error.message}`)
      : error;
  }
  const failures = failuresIn(
    {
      typecheck: said.typecheck.said,
      lint: said.lint.said,
      formatting: said['prettier:check'].said,
      tests: existsSync(results)
        ? JSON.parse(readFileSync(results, 'utf8'))
        : undefined,
      failed: Object.keys(said).filter(step => !said[step].passed),
      timedOut: Object.fromEntries(
        Object.entries(said).flatMap(([step, { timedOut }]) =>
          timedOut === undefined ? [] : [[step, timedOut]],
        ),
      ),
    },
    root,
    packages,
  );
  rmSync(results, { force: true });
  if (waited !== '') {
    console.log(`\ntask: the sweep waited ${waited} for its slot.`);
  }
  if (failures.length === 0) {
    console.log('\nThe whole tree passes its checks.');
    return;
  }
  const files = [
    ...new Set(failures.flatMap(failure => failure.file ?? [])),
  ].sort();
  fromItsRead(() => {
    const all = readBoard(root);
    const entry = sweepEntry(all, failures, waited);
    const open = all.tasks.find(
      task =>
        task.fields.title === SWEEP_TITLE &&
        !['done', 'dropped'].includes(statusOf(task)),
    );
    if (open === undefined) {
      const { id } = writeNewTask(
        root,
        {
          title: SWEEP_TITLE,
          status: 'ready',
          kind: 'fix',
          step: '',
          rfc: '0006',
          priority: 1,
          'depends-on': [],
          writes: files.filter(file => WRITABLE.test(file)),
          appends: [],
          needs: [],
          checks: SWEEP_CHECKS,
        },
        {
          Context:
            '`yarn task sweep` checks the whole new tree and the whole ' +
            'repository on its own schedule, and found them failing. A ' +
            'submit runs only the checks of what its task changed, so a ' +
            'failure here can be in a test or a file that no narrowed check ' +
            'ran. Each failure, with the task that ' +
            'last wrote its file, is in the Log; every later sweep that ' +
            'fails adds an entry.',
          'Done when':
            `- ${SWEEP_CHECKS.map(check => `\`${check}\``).join(', ')} pass.\n` +
            '- Each failure is fixed where it belongs (AGENTS.md, ' +
            'Non-negotiables): in the task that holds its file, by an ' +
            'entry in that task’s Log, or here.',
          'Out of scope': '- What the sweep did not report.',
          Log: withLogEntry('## Log', worker, now(), entry).slice(
            '## Log\n\n'.length,
          ),
        },
      );
      console.log(`\ntask: the whole tree fails; ${id} is filed for it.`);
      return;
    }
    const writes = array(open.fields.writes);
    const widened = ['in-progress', 'review'].includes(statusOf(open))
      ? writes
      : [
          ...writes,
          ...files.filter(file => WRITABLE.test(file) && !inScope(open, file)),
        ];
    writeTask(
      root,
      open,
      withLogEntry(
        widened === writes
          ? open.text
          : withField(open.text, 'writes', blockList('writes', widened)),
        worker,
        now(),
        entry,
      ),
    );
    console.log(`\ntask: the whole tree fails; ${idOf(open)} has its entry.`);
  });
  process.exitCode = 1;
}

function release({ root, id, options }) {
  const worker = theWorker(root);
  const status = options['--blocked'] ? 'blocked' : 'ready';
  holding(readBoard(root), id, worker);
  const reason = entryFromStdin('why the task is released');
  // The tree ends while the claim holds, so that no claim taken once the
  // task is ready meets a tree being removed; a tree that cannot be ended
  // keeps the claim.
  const record = treeRecordOf(root, id);
  if (record !== undefined) {
    endTree(root, id, record);
  }
  fromItsRead(() => {
    const task = holding(readBoard(root), id, worker);
    writeTask(
      root,
      task,
      withLogEntry(
        withClaim(withStatus(task.text, status), null),
        worker,
        now(),
        reason,
      ),
    );
  });
  removeClaim(root, id);
  console.log(`${id} is released: ${status}.`);
}

/**
 * Removes the tree and the branch of a task whose claim or landing ended
 * (`removeTree`), says what is left and why, and removes the record once
 * nothing of it is left. A record that stays is what the next claim of the
 * task, or the next landing, finds the tree and the branch by.
 */
function endTree(root, id, record) {
  const removal = removeTree(root, record);
  for (const line of removal.said) {
    console.log(`task: ${line}`);
  }
  if (removal.removed) {
    removeTreeRecord(root, id);
  }
  return removal;
}

/** The task in review and the worker that submitted it (its last Log entry). */
function inReview(all, id) {
  const task = taskOf(all, id);
  if (statusOf(task) !== 'review') {
    throw new Refusal(`${id} is ${statusOf(task)}, not in review`);
  }
  const submitter = logEntries(task.body).at(-1)?.by;
  if (submitter === undefined) {
    throw new Refusal(`${id} has no Log entry that names who submitted it`);
  }
  return { task, submitter };
}

function withdraw({ root, id }) {
  const worker = theWorker(root);
  fromItsRead(() => {
    const all = readBoard(root);
    const { task, submitter } = inReview(all, id);
    // Only the entry of `submit` names the worker that submitted: any other
    // last entry names whoever wrote it.
    if (!isSubmission(logEntries(task.body).at(-1), headingPattern(root))) {
      throw new Refusal(
        `${id} cannot be withdrawn: its last Log entry is not the one ` +
          '"task submit" writes, so it does not tell who submitted the ' +
          'task. A reviewer rejects it',
      );
    }
    if (submitter !== worker) {
      throw new Refusal(
        `${id} was submitted by ${submitter}: only ${submitter} can withdraw it`,
      );
    }
    const conflicts = overlappingHeld(all, task);
    if (conflicts.length > 0) {
      throw new Refusal(`${id} cannot be withdrawn: ${conflicts.join('; ')}`);
    }
    const reason = entryFromStdin('why the task is withdrawn');
    if (task.fields.review) {
      console.error(
        `task: ${id} was under review by ${task.fields.review.by}; the ` +
          'withdrawal ends that review',
      );
    }
    acquireClaim(root, task, worker, {
      logEntry: reason,
      onHeld: `${id} is held by another worker`,
      onLower: lower =>
        `${id} was left in review: ${lower.map(idOf).join(', ')} was ` +
        'claimed in the same moment and overlaps it',
    });
  });
  console.log(`${id} is withdrawn: in-progress, held by ${worker}.`);
}

/** The task in review and its reviewer, who is not the worker that submitted. */
function reviewing(all, id, worker) {
  const { task, submitter } = inReview(all, id);
  if (submitter === worker) {
    throw new Refusal(
      `${id} was submitted by ${worker}: another worker reviews`,
    );
  }
  return task;
}

/**
 * The task in review, for a verdict of `worker`: refused while another
 * reviewer's mark holds, unless the owner decides (`--owner`, as
 * `person/<handle>`).
 */
function decidedBy(all, id, worker, options) {
  const task = reviewing(all, id, worker);
  const mark = reviewMarkAgainst(task, worker);
  if (
    mark !== undefined &&
    !(options['--owner'] && worker.startsWith('person/'))
  ) {
    throw new Refusal(
      `${id} is under review by ${markInWords(mark)}: ${mark.by} accepts or ` +
        'rejects it, or the owner with --owner; another reviewer takes it ' +
        'over with "review" once the mark is stale (no beat for four hours)',
    );
  }
  return task;
}

function review({ root, id, options }) {
  const worker = theWorker(root);
  const said = fromItsRead(() => {
    const task = reviewing(readBoard(root), id, worker);
    const mark = task.fields.review ?? null;
    if (options['--drop']) {
      if (mark?.by !== worker) {
        throw new Refusal(
          `${id} is not under review by ${worker}` +
            (mark ? `: it is under review by ${markInWords(mark)}` : ''),
        );
      }
      writeTask(root, task, withReview(task.text, null));
      return `${id}: the review mark of ${worker} is given back; the task is offered to every reviewer.`;
    }
    const another = reviewMarkAgainst(task, worker);
    if (another !== undefined) {
      throw new Refusal(
        `${id} is under review by ${markInWords(another)}: take another task`,
      );
    }
    const time = now();
    const since = mark?.by === worker ? mark.since : time;
    writeTask(
      root,
      task,
      withReview(task.text, { by: worker, since, beat: time }),
    );
    return (
      (mark !== null && mark.by !== worker
        ? `task: the review mark of ${markInWords(mark)} is taken over.\n`
        : '') +
      `${id} is under review by ${worker} since ${since}, beat ${time}. ` +
      `Beat it with "beat ${id}" while the review runs; accept or reject ` +
      `ends it, and "review ${id} --drop" gives it back.`
    );
  });
  console.log(said);
}

function accept({ root, id, options }) {
  const worker = theWorker(root);
  fromItsRead(() => {
    const task = decidedBy(readBoard(root), id, worker, options);
    // A task done without the entry of `submit` before its acceptance fails
    // the lint, so one in review without it is not accepted.
    if (!isSubmission(logEntries(task.body).at(-1), headingPattern(root))) {
      throw new Refusal(
        `${id} was not submitted with "task submit": its last Log entry is ` +
          'not the one submit writes, so its checks and scope check were not ' +
          'run. Its worker submits it with the command',
      );
    }
    if (
      isOwnersDecision(task) &&
      !(options['--owner'] && worker.startsWith('person/'))
    ) {
      throw new Refusal(
        `${id} is accepted by the owner only (a decision, or a task that ` +
          'needs the owner): as person/<handle>, with --owner',
      );
    }
    const entry = entryFromStdin('the review, with the results of the checks');
    writeTask(
      root,
      task,
      withLogEntry(
        withReview(withStatus(task.text, 'done'), null),
        worker,
        now(),
        entry,
      ),
    );
  });
  console.log(`${id} is done.`);
  promoteAll(root);
}

/** How long a landing waits for another to give the landing lock back. */
const LANDING_WAIT_MS = 30 * 60 * 1000;

/**
 * The commit a task's submission checked, from the line of its entry
 * (`committedLine`), or nothing.
 */
function submittedCommitOf(task) {
  const submission = logEntries(task.body).findLast(entry =>
    entry.lines.some(line => line.trim() === SUBMITTED),
  );
  for (const line of submission?.lines ?? []) {
    const match = COMMITTED.exec(line.trim());
    if (match !== null) {
      return { commit: match[1], branch: match[2] };
    }
  }
  return undefined;
}

/**
 * Lands an accepted task on `main`, in the main
 * checkout, one landing at a time under the board's lock
 * (`withLandingLock`): `git merge --ff-only` of its branch, at the commit
 * its submission checked. A change that cannot land as it was reviewed is
 * sent back to its worker, the task ready again with the lander's entry:
 * one whose base is not `main`'s head (stale: `main` moved since, so its
 * checks ran without what landed), one whose branch moved since its
 * submission, and one that holds a task file. A landing that holds
 * `yarn.lock` installs the main checkout before the lock is given back.
 * The tree and the branch are removed after (`endTree`). Nothing is pushed
 * or fetched. Without a task, the accepted tasks that wait to land.
 */
function land({ root, id }) {
  const worker = theWorker(root);
  if (id === undefined) {
    const all = readBoard(root);
    const waiting = treeRecords(root).filter(
      ({ id: each, record }) =>
        record.landed === undefined && statusOfId(all, each) === 'done',
    );
    console.log(
      waiting.length === 0
        ? 'No accepted task waits to land.'
        : `${waiting.length} accepted task(s) wait to land:\n` +
            waiting
              .map(({ id: each, record }) => `  ${each}  ${record.branch}`)
              .join('\n'),
    );
    return;
  }
  const said = withLandingLock(root, () => landNow(root, id, worker), {
    waitMs: LANDING_WAIT_MS,
    say: message => console.error(`task: ${message}`),
  });
  console.log(said);
  const record = treeRecordOf(root, id);
  // A task that landed is done, and no claim takes it; one claimed since
  // was sent back and claimed again, and its tree is its claimer's.
  if (record !== undefined && !isClaimed(root, id)) {
    endTree(root, id, record);
  }
}

/** The landing itself, under the lock: what it did, in words. */
function landNow(root, id, worker) {
  const all = readBoard(root);
  const task = taskOf(all, id);
  const record = treeRecordOf(root, id);
  if (record === undefined) {
    throw new Refusal(`${id} has no tree, so nothing of it lands`);
  }
  if (record.landed !== undefined) {
    return `${id} landed on ${record.from} as ${record.landed} already.`;
  }
  if (statusOf(task) !== 'done') {
    throw new Refusal(
      `${id} is ${statusOf(task)}: a task lands once its review accepts it`,
    );
  }
  const main = `refs/heads/${record.from}`;
  if (branchOut(root) !== main) {
    throw new Refusal(
      `${root} has ${branchOut(root) ?? 'no branch'} out, not ${main}: a ` +
        'landing moves main in the main checkout',
    );
  }
  const head = commitOf(root, `refs/heads/${record.branch}`);
  if (head === undefined) {
    throw new Refusal(`${id}'s branch ${record.branch} is not there`);
  }
  if (isAncestor(root, head, main)) {
    writeTreeRecord(root, id, { ...record, landed: head });
    return `${id} is on ${record.from} already, at ${head}.`;
  }
  const submitted = submittedCommitOf(task);
  const back = sendBack(root, task, worker, record);
  if (submitted === undefined || submitted.branch !== record.branch) {
    throw new Refusal(
      `${id} is not landed: its submission names no commit of ` +
        `${record.branch}, so nothing tells what was checked`,
    );
  }
  if (submitted.commit !== head) {
    back(
      `${record.branch} is at ${head}, and its submission checked ` +
        `${submitted.commit}: what would land is not what was checked and ` +
        'reviewed',
    );
  }
  if (!isAncestor(root, main, head)) {
    back(
      `it is stale: ${record.from} moved since its base, so its checks ran ` +
        `without what landed since. Rebase ${record.branch} on ${record.from} ` +
        'in its tree, run the checks, and submit it again; it is reviewed again',
    );
  }
  const files = filesBetween(root, main, head);
  const taskFiles = files.filter(file => file.startsWith('work/tasks/'));
  if (taskFiles.length > 0) {
    back(
      `its change holds task files (${taskFiles.join(', ')}), which are the ` +
        "main checkout's board: take them out of the branch's commits",
    );
  }
  const outside = files.filter(file => !inScope(task, file));
  if (outside.length > 0) {
    back(
      `its change holds files outside its writes and appends ` +
        `(${outside.join(', ')}): take them out of the branch's commits`,
    );
  }
  fastForward(root, record.branch);
  writeTreeRecord(root, id, { ...record, landed: head });
  const lines = [`${id} landed: ${record.from} is at ${head}.`];
  if (files.includes('yarn.lock')) {
    try {
      lines.push(install(root));
    } catch (error) {
      throw new Refusal(
        `${id} landed, and ${record.from} is at ${head}; its change holds ` +
          `yarn.lock, and ${error.message}: install the main checkout by ` +
          `hand, then run "land ${id}" again, which removes its tree`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * What sends a change back to its worker: the task ready again, with an
 * entry of the lander that says why, addressed to the worker that
 * submitted it, and the landing refused. Its tree and branch stay for the
 * next claim of the task.
 */
function sendBack(root, task, worker, record) {
  return why => {
    const submitter =
      logEntries(task.body).findLast(entry =>
        entry.lines.some(line => line.trim() === SUBMITTED),
      )?.by ?? 'its worker';
    fromItsRead(() => {
      const current = taskOf(readBoard(root), idOf(task));
      if (statusOf(current) !== 'done') {
        throw new Refusal(`${idOf(task)} is ${statusOf(current)}, not done`);
      }
      writeTask(
        root,
        current,
        withLogEntry(
          withStatus(current.text, 'ready'),
          worker,
          now(),
          `Not landed, and ready again for ${submitter}: ${why}.\n\n` +
            `Its tree ${record.tree} and its branch ${record.branch} stay, ` +
            'and its next claim works in them.',
        ),
      );
    });
    throw new Refusal(`${idOf(task)} is not landed and is ready again: ${why}`);
  };
}

/**
 * Sets every backlog task that waits for nothing to ready, says which, and
 * returns how many.
 */
function promoteAll(root) {
  let promoted = 0;
  fromItsRead(() => {
    for (const task of promotable(loadBoard(root))) {
      writeTask(root, task, withStatus(task.text, 'ready'));
      console.log(`${idOf(task)} is ready: ${task.fields.title}`);
      promoted++;
    }
  });
  return promoted;
}

function promote({ root }) {
  theWorker(root);
  readBoard(root);
  if (promoteAll(root) === 0) {
    console.log('No task in the backlog has every dependency done.');
  }
}

function reject({ root, id, options }) {
  const worker = theWorker(root);
  fromItsRead(() => {
    const task = decidedBy(readBoard(root), id, worker, options);
    const entry = entryFromStdin('the findings');
    writeTask(
      root,
      task,
      withLogEntry(
        withReview(withStatus(task.text, 'ready'), null),
        worker,
        now(),
        entry,
      ),
    );
  });
  console.log(`${id} is ready again.`);
}

function create({ root, options }) {
  for (const required of ['--title', '--kind', '--priority']) {
    if (options[required] === undefined) {
      throw new Refusal(`a new task needs ${required}`);
    }
  }
  const title = options['--title'];
  const all = readBoard(root);
  const waitsFor = list(options['--depends-on'])
    .filter(id => statusOfId(all, id) !== 'done')
    .map(id => `${id} (${statusOfId(all, id) ?? 'not on the board'})`);
  const fields = {
    title,
    status: waitsFor.length === 0 ? 'ready' : 'backlog',
    kind: options['--kind'],
    step: options['--step'] ?? '',
    rfc: options['--rfc'] ?? '',
    priority: parseScalar(options['--priority']),
    'depends-on': list(options['--depends-on']),
    writes: list(options['--writes']),
    appends: list(options['--appends']),
    needs: list(options['--needs']),
    checks: options['--check'],
  };
  const { id, file } = writeNewTask(root, fields, {});
  console.log(file);
  if (CHECKED_KINDS.has(fields.kind) && fields.checks.length === 0) {
    console.error(
      `task: a ${fields.kind} task needs a check, or its claim and its submit ` +
        'are refused: add one with --check "<command>" (repeat it), or write ' +
        '`checks` in the file',
    );
  }
  console.error(
    waitsFor.length === 0
      ? `task: ${id} is ready; it can be claimed once its sections are written`
      : `task: ${id} is in the backlog: it waits for ${waitsFor.join(', ')}`,
  );
}

/**
 * Writes a task with the next free id: the frontmatter of `fields` with
 * no claim, and the sections of `sections` (by heading, without `## `;
 * one not given is to be written, and the Log has no entry).
 */
function writeNewTask(root, fields, sections) {
  const slug = fields.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 8)
    .join('-');
  const directory = join(root, 'work/tasks');
  const idsIn = () =>
    readdirSync(directory).flatMap(name => /^T-\d{4}/.exec(name) ?? []);
  for (;;) {
    const last = Math.max(0, ...idsIn().map(id => Number(id.slice(2))));
    const id = `T-${String(last + 1).padStart(4, '0')}`;
    const schema = readSchema(root);
    const wrong = violations(
      schema,
      { id, ...fields, claim: null },
      '',
      schema,
    );
    if (wrong.length > 0 || slug === '') {
      throw new Refusal(
        `not a task: ${wrong.join('; ') || 'the title has no letter or digit'}`,
      );
    }
    const text = [
      '---',
      `id: ${id}`,
      `title: ${quoted(fields.title)}`,
      `status: ${fields.status}`,
      `kind: ${fields.kind}`,
      `step: ${quoted(fields.step)}`,
      `rfc: ${quoted(fields.rfc)}`,
      `priority: ${fields.priority}`,
      blockList('depends-on', fields['depends-on']),
      blockList('writes', fields.writes),
      blockList('appends', fields.appends),
      blockList('needs', fields.needs),
      blockList('checks', fields.checks),
      'claim:',
      '---',
      '',
      ...SECTIONS.flatMap(section => [
        section,
        '',
        sections[section.slice(3)] ??
          (section === '## Log' ? NO_ENTRY : TO_BE_WRITTEN),
        '',
      ]),
    ].join('\n');
    const file = `work/tasks/${id}-${slug}.md`;
    try {
      writeFileSync(join(root, file), formatted(root, file, text), {
        flag: 'wx',
      });
    } catch (error) {
      if (error.code === 'EEXIST') {
        continue;
      }
      throw error;
    }
    // Another worker can take the same id in the same moment under another
    // name: the file that sorts first keeps it, the other takes the next.
    const same = readdirSync(directory)
      .filter(name => name.startsWith(id))
      .sort();
    if (same[0] === `${id}-${slug}.md`) {
      return { id, file };
    }
    rmSync(join(root, file));
  }
}

function lint({ root }) {
  const all = loadBoard(root);
  const { problems, known } = lintProblems(all);
  if (known.length > 0) {
    console.log(
      `Known since before ${CHECKED_FROM}Z, not refused (work/README.md, ` +
        `Log):\n${known.map(problem => `  ${problem}`).join('\n')}`,
    );
  }
  if (problems.length > 0) {
    console.error(problems.map(problem => `  ${problem}`).join('\n'));
    throw new Refusal(
      `${problems.length} problem(s) on the task board. See work/README.md.`,
    );
  }
  console.log(`Task board OK (${all.tasks.length} task(s) checked).`);
}

const SUBCOMMANDS = {
  board,
  next,
  show,
  claim,
  beat,
  log,
  scope,
  submit,
  withdraw,
  release,
  run,
  sweep,
  review,
  accept,
  reject,
  new: create,
  promote,
  lint,
  land,
  help: () => console.log(USAGE),
};

/**
 * The board a command acts on, from the checkout it is run for: that
 * checkout, when it is the main one or no git checkout. A linked worktree's
 * copy of the board is the board of its commit, not the board, so a
 * command run for one is refused and names the board's, but `lint` (which
 * a check of the tree runs) and `help`: `lint` reads the board itself.
 */
function boardOf(checkout, subcommand) {
  const { board, linked } = checkoutOf(checkout);
  if (!linked || subcommand === 'help') {
    return checkout;
  }
  if (subcommand === 'lint') {
    return board;
  }
  throw new Refusal(
    `${checkout} is a linked worktree, whose copy of the board is not the ` +
      `board: the board is ${board}'s. Run its command, ` +
      `"node ${join(board, 'scripts/task.mjs')} ${subcommand} ..."`,
  );
}

/** What the command says of a refusal, without a stack; anything else is thrown. */
function refused(error) {
  if (!(error instanceof Refusal || error instanceof TreeRefusal)) {
    throw error;
  }
  console.error(`task: ${error.message}`);
  process.exit(1);
}

// Run as a command; imported, by its tests, it only exports.
if (import.meta.main) {
  try {
    // What follows `--` is the command `run` runs, whatever its options.
    const argv = process.argv.slice(2);
    const dashes = argv.indexOf('--');
    const { positional, options, given } = parseArguments(
      dashes === -1 ? argv : argv.slice(0, dashes),
    );
    const [subcommand, id, ...rest] = positional;
    if (
      !Object.hasOwn(SUBCOMMANDS, subcommand ?? '') ||
      rest.length > 0 ||
      (dashes !== -1 && subcommand !== 'run')
    ) {
      console.error(USAGE);
      process.exit(2);
    }
    takenBy(subcommand, given);
    const root = boardOf(
      resolve(
        options['--root'] ?? resolve(fileURLToPath(import.meta.url), '../..'),
      ),
      subcommand,
    );
    const done = SUBCOMMANDS[subcommand]({
      root,
      id,
      options,
      command: dashes === -1 ? undefined : argv.slice(dashes + 1),
    });
    if (done instanceof Promise) {
      done.catch(refused);
    }
  } catch (error) {
    refused(error);
  }
}
