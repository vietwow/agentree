/**
 * The slots of one machine for the heavy checks of `task submit`
 * (work/README.md, "Submit for review"). Every submit of a checkout runs
 * its heavy checks under a slot, so that only as many run at once as the
 * machine has cores for; a light check takes none.
 *
 * The slots are a queue of tickets in a directory. A submit writes a
 * ticket with the next number, and has a slot while fewer tickets than
 * the machine has slots are numbered before its own. Nothing serves the
 * queue: each submit reads the directory, and removes the tickets of
 * processes that are gone. A command a worker runs by hand (`task run`)
 * waits in the same queue as the checks of a submit.
 *
 * The command a ticket is taken for runs in a process group of its own,
 * recorded in the ticket, so that it is held while that command runs even
 * when the process that wrote it was killed; the next to read the
 * directory ends such a command, and frees the slot once it has ended.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { cpus } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { shellScript, simpleCommands } from './lib/shellWords.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);

/** What a submit is refused for the slots, said without a stack. */
export class NoSlot extends Error {}

/**
 * The tickets, under the root of the board's checkout, where git ignores
 * them: one queue for the checks of every tree of the board.
 */
export const SLOTS_DIRECTORY = 'node_modules/.cache/check-slots';

/** The variable a check under a slot reads its number of workers from. */
export const WORKERS_VARIABLE = 'AEP_CHECK_WORKERS';

/**
 * The scripts whose runs fill the machine whatever they are given: the
 * end-to-end suite, the tests and checks of the whole new tree, and the
 * demo organization through the API.
 */
const HEAVY_SCRIPTS = new Set([
  'e2e',
  'platform:test',
  'platform:check',
  'test:demo',
]);

/**
 * The line of a Vitest run that runs at once. Vitest runs each file in a
 * worker of its own and starts a project only for the files it holds, so
 * a run of three named test files takes at most three cores for seconds:
 * less than the share of one slot on a machine of four cores or more,
 * which is not worth a wait behind runs of minutes. An integration test
 * file composes the modules in a schema of its own on the machine's one
 * PostgreSQL, which every slot's suite shares, so a run names at most one
 * of them to run at once.
 */
const VITEST_FILES_AT_ONCE = 3;
const VITEST_INTEGRATION_FILES_AT_ONCE = 1;

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
/** What makes a word a pattern for the shell or Vitest, not one path. */
const GLOB = /[*?[\]{}!]/;
const INTEGRATION_TEST_FILE = /\.integration\.test\.[cm]?[jt]sx?$/;

/** Vitest's options that take the next word as their value. */
const VITEST_VALUE_OPTIONS = new Set([
  '-c',
  '--config',
  '-t',
  '--testNamePattern',
  '--project',
  '--maxWorkers',
  '--minWorkers',
  '--reporter',
  '--pool',
  '--environment',
  '--shard',
  '--dir',
  '--root',
  '-r',
  '--exclude',
  '--since',
]);

/**
 * Whether a word of a Vitest run started in `directory` names one test
 * file. Vitest keeps every test file whose path holds a word, so a word
 * is one file only when it is the path of an existing test file under a
 * directory of its own: a suffix (`.test.ts`), a bare name that other
 * packages' files end with too, or a glob, which the shell may expand to
 * many, each runs more than it names.
 */
function namesOneTestFile(word, directory) {
  if (!TEST_FILE.test(word) || GLOB.test(word)) {
    return false;
  }
  const path = resolve(directory, word);
  if (!relative(directory, path).includes('/')) {
    return false;
  }
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether a test run (Vitest, or Jest through `backstage-cli`), given
 * the words after the program, fills the machine: anything but a run
 * (`run`, or watch) of a few named test files does. A word that does not name one test file (a directory, a
 * filter, a package, `related` and its sources) runs more than it names,
 * and a run that names no file runs every project.
 */
function testRunIsHeavy(words, directory) {
  const files = [];
  const rest = ['run', 'watch', 'dev'].includes(words[0])
    ? words.slice(1)
    : words;
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at];
    if (word.startsWith('-')) {
      if (!word.includes('=') && VITEST_VALUE_OPTIONS.has(word)) {
        at += 1;
      }
    } else if (namesOneTestFile(word, directory)) {
      files.push(word);
    } else {
      return true;
    }
  }
  return (
    files.length === 0 ||
    files.length > VITEST_FILES_AT_ONCE ||
    files.filter(file => INTEGRATION_TEST_FILE.test(file)).length >
      VITEST_INTEGRATION_FILES_AT_ONCE
  );
}

/** The words of each simple command of a line (`simpleCommands`). */
const commandWords = line => simpleCommands(line).map(({ words }) => words);

function packageOf(directory) {
  try {
    return Object(JSON.parse(readFileSync(join(directory, 'package.json'))));
  } catch {
    return {};
  }
}

/** The directories of the workspaces of a checkout, by package name. */
function workspacesOf(root) {
  const directories = new Map();
  for (const pattern of packageOf(root).workspaces ?? []) {
    const parent = pattern.endsWith('/*') ? pattern.slice(0, -2) : undefined;
    let names = [pattern];
    if (parent !== undefined) {
      try {
        names = readdirSync(join(root, parent)).map(name => join(parent, name));
      } catch {
        names = [];
      }
    }
    for (const name of names) {
      const { name: packageName } = packageOf(join(root, name));
      if (typeof packageName === 'string') {
        directories.set(packageName, join(root, name));
      }
    }
  }
  return directories;
}

/** How deep scripts that run scripts are followed. */
const SCRIPT_DEPTH = 8;

/**
 * What a simple command run in `directory` starts: `undefined` when no
 * Vitest and no heavy script, else whether it fills the machine. A Yarn
 * script, of the package or of a workspace, is read from its
 * package.json, with the words after it added to its last command, as
 * Yarn runs it; one run in every workspace starts Vitest heavily when it
 * starts it in any.
 */
function weigh(words, { root, directory, depth }) {
  if (words.some(word => HEAVY_SCRIPTS.has(word))) {
    return true;
  }
  const vitest = words.findIndex(
    word => word === 'vitest' || word.endsWith('/vitest'),
  );
  if (vitest !== -1) {
    return testRunIsHeavy(words.slice(vitest + 1), directory);
  }
  const jest = words.findIndex(word => word === 'backstage-cli');
  if (
    jest !== -1 &&
    ['repo', 'package'].includes(words[jest + 1]) &&
    words[jest + 2] === 'test'
  ) {
    return testRunIsHeavy(words.slice(jest + 3), directory);
  }
  const line = shellScript(words);
  if (line !== undefined) {
    return heaviest(commandWords(line), { root, directory, depth: depth + 1 });
  }
  if (words[0] !== 'yarn' || depth >= SCRIPT_DEPTH) {
    return undefined;
  }
  const next = { root, directory, depth: depth + 1 };
  const [first, second, ...rest] = words.slice(1);
  if (first === 'workspace') {
    const workspace = workspacesOf(root).get(second);
    return workspace === undefined
      ? undefined
      : script(rest, { ...next, directory: workspace });
  }
  if (first === 'workspaces' && second === 'foreach') {
    const run = rest.findIndex(word => word === 'run' || word === 'exec');
    if (run === -1) {
      return undefined;
    }
    const each = rest.slice(run + 1);
    const started = [...workspacesOf(root).values()].some(
      workspace =>
        (rest[run] === 'exec'
          ? weigh(each, { ...next, directory: workspace })
          : script(each, { ...next, directory: workspace })) !== undefined,
    );
    return started || undefined;
  }
  return script(words.slice(1), next);
}

/** What a Yarn script with the words given after it starts (`weigh`). */
function script(words, context) {
  const [name, ...given] = words[0] === 'run' ? words.slice(1) : words;
  const text = packageOf(context.directory).scripts?.[name];
  if (typeof text !== 'string') {
    return undefined;
  }
  const commands = commandWords(text);
  commands.at(-1)?.push(...given);
  return heaviest(commands, context);
}

/**
 * The weight of the heaviest of commands run one after another, each in
 * the directory a `cd` before it moved to.
 */
function heaviest(commands, context) {
  let found;
  let directory = context.directory;
  for (const words of commands) {
    if (words[0] === 'cd') {
      directory = resolve(directory, words[1] ?? context.root);
      continue;
    }
    const weight = weigh(words, { ...context, directory });
    if (weight === true) {
      return true;
    }
    found ??= weight;
  }
  return found;
}

/**
 * Whether a check is run under a slot: one of its commands is a heavy
 * script, or runs Vitest or Jest (`backstage-cli repo test`, `package test`) beyond a few named test files
 * (`VITEST_FILES_AT_ONCE`), by itself (`vitest`, `node_modules/.bin/vitest`)
 * or through a script of the checkout's packages, read from `root`.
 */
export function takesSlot(command, root = REPOSITORY_ROOT) {
  return (
    heaviest(commandWords(command), {
      root,
      directory: root,
      depth: 0,
    }) === true
  );
}

const DEFAULT_WAIT_MINUTES = 120;

/**
 * How the machine is shared: the number of slots, the workers a run under
 * one may start, and how long a check waits for one. A Playwright run
 * starts a browser for half the cores, so by default the machine has as
 * many slots as such runs fit its cores; with more slots a run has the
 * cores divided by them, and never more than Playwright's own number.
 */
export function shareOfTheMachine(environment, cores = cpus().length) {
  const browsersOfARun = Math.max(1, Math.floor(cores / 2));
  const named = environment.AEP_CHECK_SLOTS ?? '';
  if (named !== '' && !/^[1-9]\d*$/.test(named)) {
    throw new NoSlot(
      `AEP_CHECK_SLOTS is "${named}", which is not a whole number of at least 1`,
    );
  }
  const slots =
    named === ''
      ? Math.max(1, Math.floor(cores / browsersOfARun))
      : Number(named);
  const wait = environment.AEP_CHECK_SLOT_WAIT_MINUTES ?? '';
  const minutes = wait === '' ? DEFAULT_WAIT_MINUTES : Number(wait);
  if (!(minutes > 0) || minutes === Infinity) {
    throw new NoSlot(
      `AEP_CHECK_SLOT_WAIT_MINUTES is "${wait}", which is not a number of minutes above 0`,
    );
  }
  return {
    slots,
    workers: Math.max(1, Math.min(browsersOfARun, Math.floor(cores / slots))),
    waitMs: minutes * 60_000,
  };
}

/** The setting of how long a check of a submit or a sweep may run. */
export const CHECK_TIMEOUT_VARIABLE = 'AEP_CHECK_TIMEOUT_MINUTES';

/**
 * Above the longest parity suite a submit has recorded (83 min, failing;
 * the parity comparison is not retried, with `CI=true` either), which is
 * the longest check whose line says no wait could be in its time; a check
 * that never ends frees its slot after it.
 */
const DEFAULT_CHECK_TIMEOUT_MINUTES = 90;

/**
 * How long a check may run (`AEP_CHECK_TIMEOUT_MINUTES`): its `minutes`
 * as the setting says them, and in `ms`.
 */
export function checkBound(environment) {
  const named = environment[CHECK_TIMEOUT_VARIABLE] ?? '';
  const minutes = named === '' ? DEFAULT_CHECK_TIMEOUT_MINUTES : Number(named);
  if (!(minutes > 0) || minutes === Infinity) {
    throw new NoSlot(
      `${CHECK_TIMEOUT_VARIABLE} is "${named}", which is not a number of minutes above 0`,
    );
  }
  return { minutes, ms: minutes * 60_000 };
}

/**
 * The scripts of the root that CI runs with `CI` empty
 * (.github/workflows/ci.yml): the frozen tree's end-to-end suite starts
 * its own servers only so.
 */
export const SCRIPTS_RUN_WITH_CI_EMPTY = new Set(['test:e2e']);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Whether a line runs one of `SCRIPTS_RUN_WITH_CI_EMPTY`, with any arguments. */
const runsWithCiEmpty = command =>
  commandWords(command).some(words => {
    const [program, ...rest] = words.filter(word => !ASSIGNMENT.test(word));
    const [name] = rest[0] === 'run' ? rest.slice(1) : rest;
    return program === 'yarn' && SCRIPTS_RUN_WITH_CI_EMPTY.has(name);
  });

/**
 * What a check's environment has as CI gives it: `CI=true`, which GitHub
 * Actions sets for every step, and by which a tool runs once and exits
 * where it would otherwise watch (`backstage-cli package test`), or fails
 * where it would skip. `GITHUB_ACTIONS` is not set: it changes how a tool
 * reports, not whether it ends.
 */
export const asInCi = command => ({
  CI: runsWithCiEmpty(command) ? '' : 'true',
});

/** The setting by which an end-to-end run has ports of its own. */
export const PORT_OFFSET_VARIABLE = 'E2E_PORT_OFFSET';

/**
 * The port offset of the seat of a slot: each of the checks that run at
 * once has its own servers (apps/web/playwright.config.ts), since under
 * `CI=true` a run does not reuse a server it finds on its port. The
 * offsets are far above those a worker picks by hand, and keep every
 * port off 5173, the sign-in preview's in every run.
 */
export const portOffsetOfSeat = seat => String(20_000 + 100 * seat);

/** Waits on the spot: a submit is synchronous from end to end. */
const pause = milliseconds =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

const TICKET = /^(\d+)\.json$/;
const DRAFT = /^draft-(\d+)$/;
/** Beside a ticket whose command is being ended: which ticket it is for. */
const ENDING = /^(\d+)\.ending$/;
/**
 * Beside a ticket whose command has started: the shell that became the
 * command creates it, named by its own pid, which leads the command's
 * group; its time is when the command started (`ended`).
 */
const GROUP_MARK = /^(\d+)\.group\.(\d+)$/;
/** How much earlier than its ticket a group mark may seem to be. */
const MARK_SLACK_MS = 1000;

/**
 * A process id a ticket may name: above 1, since a signal to 1 or to a group
 * of 1, 0 or -1 reaches the machine's init or every process of the user.
 */
const positive = value => (Number.isInteger(value) && value > 1 ? value : null);

/**
 * The tickets of the directory, first number first, the drafts, and the
 * marks of the commands being ended.
 */
function read(directory) {
  const tickets = [];
  const drafts = [];
  const endings = [];
  const marks = [];
  for (const name of readdirSync(directory)) {
    const started = GROUP_MARK.exec(name);
    if (started !== null) {
      const path = join(directory, name);
      try {
        marks.push({
          path,
          number: Number(started[1]),
          pid: Number(started[2]),
          at: statSync(path).mtimeMs,
        });
      } catch {
        // It was removed.
      }
      continue;
    }
    const draft = DRAFT.exec(name);
    if (draft !== null) {
      drafts.push({ path: join(directory, name), pid: Number(draft[1]) });
      continue;
    }
    const ending = ENDING.exec(name);
    if (ending !== null) {
      endings.push({ path: join(directory, name), number: Number(ending[1]) });
      continue;
    }
    const ticket = TICKET.exec(name);
    if (ticket === null) {
      continue;
    }
    const path = join(directory, name);
    let holder = {};
    try {
      holder = Object(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
    }
    tickets.push({
      number: Number(ticket[1]),
      path,
      pid: positive(holder.pid),
      at: Date.parse(holder.at),
      group: positive(holder.group),
      groupAt: Date.parse(holder.groupAt),
      runner: positive(holder.runner),
      runnerAt: Date.parse(holder.runnerAt),
      spawning: Date.parse(holder.spawning),
      seat:
        Number.isInteger(holder.seat) && holder.seat >= 0 ? holder.seat : null,
      who:
        holder.worker === undefined
          ? `the ticket ${name}, which cannot be read`
          : `${holder.worker}, ${holder.task}, \`${holder.command}\``,
    });
  }
  for (const ticket of tickets) {
    // The command of a ticket that records no group was started by its
    // holder, which was gone before it could write the group: the mark of
    // the shell that became the command names it. A mark older than the
    // ticket is the one of a ticket the number had before.
    // A mark that names no process a signal may reach (`positive`) is
    // skipped, so that it cannot shadow a valid one; it stays in `marks`
    // to be removed with the ticket.
    const started = marks.find(
      each =>
        each.number === ticket.number &&
        each.at >= ticket.at - MARK_SLACK_MS &&
        positive(each.pid) !== null,
    );
    if (ticket.group === null && started !== undefined) {
      ticket.group = started.pid;
      ticket.groupAt = started.at;
    }
  }
  return {
    tickets: tickets.sort((a, b) => a.number - b.number),
    drafts,
    endings,
    marks,
  };
}

function processIsThere(pid) {
  if (positive(pid) === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * What `ps` tells of each of the processes: its process group, its state
 * (`stat`, of which the first letter is the state: `Z` for a process that
 * has ended and is not reaped yet, `T` for one that is stopped), and for
 * how many seconds it has run (`etime`, `[[dd-]hh:]mm:ss`). A process
 * `ps` does not tell of, or every one where there is no `ps`, has no
 * entry.
 */
function processesTold(pids) {
  const told = new Map();
  if (pids.length === 0) {
    return told;
  }
  const { stdout } = spawnSync(
    'ps',
    ['-o', 'pid=,pgid=,stat=,etime=', '-p', [...new Set(pids)].join(',')],
    { encoding: 'utf8' },
  );
  for (const line of (stdout ?? '').split('\n')) {
    const parts =
      /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)\s*$/.exec(
        line,
      );
    if (parts !== null) {
      const [days, hours, minutes, seconds] = parts
        .slice(4)
        .map(part => Number(part ?? 0));
      told.set(Number(parts[1]), {
        group: Number(parts[2]),
        state: parts[3],
        seconds: ((days * 24 + hours) * 60 + minutes) * 60 + seconds,
      });
    }
  }
  return told;
}

/**
 * By how much a process may seem younger than the ticket it wrote: `ps`
 * tells whole seconds. Only macOS is checked. On Linux `etime` counts
 * from the boot clock and a ticket's times are the wall clock, so a step
 * of the wall clock of more than this can make a running command read as
 * ended, or a reused leader as the command; that is not checked there.
 */
const YOUNGER_BY_MS = 5000;

/** Whether a process `ps` told of began no later than `at`. */
const begunBy = (told, at, now) =>
  told.seconds * 1000 + YOUNGER_BY_MS >= now - at;

/** Whether a process `ps` told of has ended and no one has reaped it. */
const isZombie = told => told.state.startsWith('Z');

/**
 * Whether the command of a ticket still runs: the process group the
 * ticket records has as its leader the process the ticket was written
 * for, which `ps` tells is the leader of that group and began no later
 * than the ticket says the command started. A leader that began after it
 * has the group's id since the command ended, on this run of the machine
 * or after it started again (every process after a restart began after
 * the ticket); a group whose leader is gone, or has ended and is not
 * reaped (a zombie), cannot be told from one that has its id since.
 * Only such a group is ever signalled.
 */
const commandRuns = (ticket, told, now) => {
  const leader = told.get(ticket.group);
  return (
    ticket.group !== null &&
    leader !== undefined &&
    leader.group === ticket.group &&
    !isZombie(leader) &&
    begunBy(leader, ticket.groupAt, now)
  );
};

/** How long a ticket whose holder is gone may wait for its command's group. */
const STARTING_GRACE_MS = 10_000;

/**
 * How each ticket stands: `held` while the process that wrote it runs,
 * which is the one with the ticket's pid that began before the ticket was
 * written, while the process that runs its check (`runner`, a submit's
 * `--in-group` process, which a Ctrl-C leaves running to end the check
 * gracefully) runs and is not stopped, and, for `STARTING_GRACE_MS` after
 * its holder started the command, while the command has not recorded its
 * group yet; `command` when its holder is gone and the command it started
 * still runs (`commandRuns`); `left` otherwise. No process with the pid,
 * a zombie, or one that began after the ticket (the pid given to another
 * process, on this run of the machine or after it started again), means
 * the holder exited or was killed without removing its ticket. A ticket
 * that cannot be read names no process, and is held by none.
 */
function standing(tickets, now) {
  const there = tickets.filter(
    ticket => ticket.pid !== null && processIsThere(ticket.pid),
  );
  const told = processesTold([
    ...there.map(ticket => ticket.pid),
    ...tickets.flatMap(ticket =>
      ticket.runner === null ? [] : [ticket.runner],
    ),
    ...tickets.flatMap(ticket => (ticket.group === null ? [] : [ticket.group])),
  ]);
  return new Map(
    tickets.map(ticket => {
      const holder = told.get(ticket.pid);
      if (
        there.includes(ticket) &&
        (holder === undefined ||
          (!isZombie(holder) && begunBy(holder, ticket.at, now)))
      ) {
        return [ticket, 'held'];
      }
      const runner = told.get(ticket.runner);
      if (
        runner !== undefined &&
        !isZombie(runner) &&
        !runner.state.startsWith('T') &&
        begunBy(runner, ticket.runnerAt, now)
      ) {
        return [ticket, 'held'];
      }
      if (ticket.group === null && now - ticket.spawning < STARTING_GRACE_MS) {
        return [ticket, 'held'];
      }
      return [ticket, commandRuns(ticket, told, now) ? 'command' : 'left'];
    }),
  );
}

/** How long a command left running is given to end before it is killed. */
const ENDING_GRACE_MS = 10_000;

function signalGroup(group, signal) {
  if (positive(group) === null) {
    return;
  }
  try {
    process.kill(-group, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

const endingOf = ticket => ticket.path.replace(/\.json$/, '.ending');

/**
 * Removes a ticket and what is beside it: the mark of its command being
 * ended and the marks of its command's group.
 */
function removeTicket(path) {
  // The marks go first: once the ticket is gone its number may be taken by
  // a new ticket, whose marks must not be removed with these.
  const number = Number(TICKET.exec(basename(path))?.[1]);
  clearBeside(dirname(path), number);
  rmSync(path, { force: true });
}

/** Removes the marks beside the ticket with `number`, wherever it is. */
function clearBeside(directory, number) {
  const { endings, marks } = read(directory);
  for (const { path, number: of } of [...endings, ...marks]) {
    if (of === number) {
      rmSync(path, { force: true });
    }
  }
}

/**
 * Marks a ticket as its command being ended, with the ticket's identity
 * in the mark: a mark of another ticket, which the number had before, is
 * replaced. Returns whether this call made the mark, or since when the
 * mark of this ticket is, or `undefined` when it was removed meanwhile.
 */
function markEnding(ticket) {
  const ending = endingOf(ticket);
  const identity = `${ticket.pid}:${ticket.at}:${ticket.group}`;
  const draft = join(dirname(ending), `draft-${process.pid}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    writeFileSync(draft, identity);
    try {
      linkSync(draft, ending);
      return { made: true };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    } finally {
      rmSync(draft, { force: true });
    }
    try {
      if (readFileSync(ending, 'utf8') === identity) {
        return { made: false, since: statSync(ending).mtimeMs };
      }
      rmSync(ending, { force: true });
    } catch {
      // It was removed.
    }
  }
  return { made: false, since: undefined };
}

/**
 * Ends the command of a ticket whose holder is gone: the first to find it
 * marks the ticket and sends its group SIGTERM, and whoever finds it still
 * running `graceMs` after the mark sends SIGKILL. The slot stays taken
 * until the command has ended.
 */
function endCommand(ticket, graceMs, say) {
  const { made, since } = markEnding(ticket);
  if (!made) {
    if (since !== undefined && Date.now() - since >= graceMs) {
      signalGroup(ticket.group, 'SIGKILL');
    }
    return;
  }
  say(
    `the process ${ticket.pid ?? '(not named)'} of ${ticket.who} is gone, ` +
      `and its command still runs (process group ${ticket.group}): it is ` +
      `sent SIGTERM, and SIGKILL after ${lasting(graceMs)}; its slot is ` +
      'free once it has ended',
  );
  signalGroup(ticket.group, 'SIGTERM');
}

/**
 * The tickets that are held, after removing what processes left behind
 * and ending the commands whose holders are gone.
 */
function heldTickets(directory, say, graceMs = ENDING_GRACE_MS) {
  const { tickets, drafts, endings, marks } = read(directory);
  for (const draft of drafts) {
    if (!processIsThere(draft.pid)) {
      rmSync(draft.path, { force: true });
    }
  }
  const numbers = new Set(tickets.map(ticket => ticket.number));
  for (const beside of [...endings, ...marks]) {
    if (!numbers.has(beside.number)) {
      rmSync(beside.path, { force: true });
    }
  }
  const held = [];
  for (const [ticket, stands] of standing(tickets, Date.now())) {
    if (stands === 'command') {
      endCommand(ticket, graceMs, say);
    }
    if (stands !== 'left') {
      held.push(ticket);
      continue;
    }
    removeTicket(ticket.path);
    say(
      `the slot of ${ticket.who} is free: its process ${ticket.pid ?? '(not named)'} is gone`,
    );
  }
  return held;
}

/** Adds `fields` to a ticket. A ticket that is no longer there is left so. */
function recordInTicket(path, fields) {
  let holder;
  try {
    holder = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return;
  }
  const draft = join(path, '..', `draft-${process.pid}`);
  writeFileSync(draft, JSON.stringify({ ...holder, ...fields }));
  renameSync(draft, path);
}

/**
 * Writes into a ticket the process group of the command it was taken
 * for, which the command leads, and when it started.
 */
const recordGroup = (path, group) =>
  recordInTicket(path, { group, groupAt: new Date().toISOString() });

const RETREAT_MS = 20;

/** The seats the other tickets of the directory record. */
const seatsBeside = (directory, mine) =>
  new Set(
    read(directory)
      .tickets.filter(ticket => ticket.number !== mine.number)
      .map(ticket => ticket.seat),
  );

/**
 * Takes the seat of a ticket that has its slot: the lowest number no
 * other ticket of the directory records, recorded in the ticket. No lock
 * is taken, so none can be left behind: a ticket that finds, after
 * recording its seat, another ticket with the same one gives it up and
 * takes one again after a pause of its own length. Of two tickets that
 * record a seat, the one that reads the other's last finds it, so two
 * never keep the same seat; and a seat is free again once its ticket is
 * gone, by the rule that frees the ticket's slot (`standing`).
 */
function takeSeat(directory, mine) {
  for (;;) {
    const taken = seatsBeside(directory, mine);
    let seat = 0;
    while (taken.has(seat)) {
      seat += 1;
    }
    recordInTicket(mine.path, { seat });
    if (!seatsBeside(directory, mine).has(seat)) {
      return seat;
    }
    recordInTicket(mine.path, { seat: null });
    pause(1 + Math.random() * RETREAT_MS);
  }
}

/**
 * Writes this process's ticket under a number above every ticket there,
 * and returns it. The ticket appears whole, by a link that fails when the
 * number is taken. A process that finds a higher number after writing its
 * own read the directory before that ticket was there: it takes a new
 * number, so that a ticket once written is never preceded by a later one,
 * and a process that has a slot keeps it. It does so after a pause of its
 * own length, so that two processes do not find each other's again.
 */
function writeTicket(directory, holder) {
  mkdirSync(directory, { recursive: true });
  const draft = join(directory, `draft-${process.pid}`);
  const highest = () => read(directory).tickets.at(-1)?.number ?? 0;
  try {
    for (;;) {
      const number = highest() + 1;
      const path = join(directory, `${String(number).padStart(6, '0')}.json`);
      writeFileSync(
        draft,
        JSON.stringify({
          pid: process.pid,
          at: new Date().toISOString(),
          ...holder,
        }),
      );
      try {
        linkSync(draft, path);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        continue;
      }
      if (highest() === number) {
        // A new ticket has none of the marks a ticket of its number left.
        clearBeside(directory, number);
        return { number, path };
      }
      rmSync(path, { force: true });
      pause(1 + Math.random() * RETREAT_MS);
    }
  } finally {
    rmSync(draft, { force: true });
  }
}

const lasting = milliseconds =>
  milliseconds < 60_000
    ? `${Math.round(milliseconds / 1000)} s`
    : `${Math.round(milliseconds / 60_000)} min`;

/** The tickets before a check, one a line: which run, which wait. */
function listed(before, slots, now) {
  return before
    .map(
      (ticket, index) =>
        `  ${index < slots ? 'runs' : 'waits'}: ${ticket.who}, there for ` +
        `${lasting(now - ticket.at)} (process ${ticket.pid})`,
    )
    .join('\n');
}

const POLL_MS = 1000;
/** A check that still waits for the same submits says so again after this. */
const SAY_AGAIN_MS = 5 * 60_000;

/**
 * The wait of the ticket `mine` for a slot: yields how long to pause
 * before it reads the queue again, and returns once fewer tickets than the
 * machine has slots are before it. While other processes hold every slot
 * it says for which whenever they change; after `waitMs` it is refused,
 * naming them. It pauses nothing itself, so that a synchronous submit and
 * a run that keeps taking signals wait in the same queue.
 */
function* slotWait(
  { directory, holder, slots, waitMs, pollMs = POLL_MS, graceMs, say },
  mine,
) {
  const since = Date.now();
  let told = '';
  let toldAt = 0;
  for (;;) {
    const before = heldTickets(directory, say, graceMs).filter(
      ticket => ticket.number < mine.number,
    );
    const now = Date.now();
    if (before.length < slots) {
      if (told !== '') {
        say(`\`${holder.command}\` has a slot, after ${lasting(now - since)}`);
      }
      return;
    }
    if (now - since >= waitMs) {
      throw new NoSlot(
        `\`${holder.command}\` got no slot of the machine in ` +
          `${lasting(waitMs)} (AEP_CHECK_SLOT_WAIT_MINUTES): ` +
          `${before.length} heavy check(s) are still before it:\n` +
          listed(before, slots, now),
      );
    }
    const whom = before.map(ticket => ticket.path).join();
    if (whom !== told || now - toldAt >= SAY_AGAIN_MS) {
      say(
        `\`${holder.command}\` waits for a slot (${lasting(now - since)} ` +
          `so far): this machine runs ${slots} heavy check(s) at once ` +
          `(AEP_CHECK_SLOTS), and ${before.length} are before it:\n` +
          listed(before, slots, now),
      );
      told = whom;
      toldAt = now;
    }
    yield Math.min(pollMs, since + waitMs - now);
  }
}

/**
 * Runs `run` while this process has a slot of the machine, and gives the
 * slot back after it, waiting on the spot as `slotWait` says. `run` is
 * given the path of the ticket, which `spawnCheck` records the command's
 * group in, how long the ticket waited, in milliseconds, from its
 * writing to the grant of the slot, and its seat (`takeSeat`). A process that is killed leaves its ticket, which the next to
 * read the directory removes once the command it started has ended.
 */
export function withSlot(slot, run) {
  const mine = writeTicket(slot.directory, slot.holder);
  const asked = Date.now();
  try {
    const waiting = slotWait(slot, mine);
    for (let step = waiting.next(); !step.done; step = waiting.next()) {
      pause(step.value);
    }
    const waitedMs = Date.now() - asked;
    return run(mine.path, waitedMs, takeSeat(slot.directory, mine));
  } finally {
    removeTicket(mine.path);
  }
}

/**
 * How a submit or the sweep runs its checks: the function that runs one,
 * under a slot when it is heavy, with the environment the check is
 * started in (as CI gives it, `asInCi`, and with the port offset of its
 * seat, `portOffsetOfSeat`, unless the environment names one), the
 * ticket of its slot
 * (`undefined` for a light check), the milliseconds the ticket waited for
 * the slot (0 for a light check) and the bound of its time
 * (`checkBound`), the last three of which it hands to `spawnCheck`. A
 * setting that cannot be read is refused here, before any check runs.
 * Whether a check is heavy is read from the checkout it runs in (`root`);
 * it waits in the queue of the board's checkout (`board`, by default
 * `root`), whose seats give every check of every tree of the board its own
 * port offset.
 */
export function checkRunner({
  root,
  board = root,
  checks,
  holder,
  environment,
  say,
}) {
  const heavy = command => takesSlot(command, root);
  const bound = checkBound(environment);
  const share = checks.some(heavy) ? shareOfTheMachine(environment) : undefined;
  return (command, run) => {
    const asCiRuns = { ...environment, ...asInCi(command) };
    return heavy(command)
      ? withSlot(
          {
            directory: join(board, SLOTS_DIRECTORY),
            holder: { ...holder, command },
            slots: share.slots,
            waitMs: share.waitMs,
            say,
          },
          (ticket, waitedMs, seat) =>
            run(
              {
                ...asCiRuns,
                [WORKERS_VARIABLE]: String(share.workers),
                [PORT_OFFSET_VARIABLE]:
                  environment[PORT_OFFSET_VARIABLE] || portOffsetOfSeat(seat),
              },
              ticket,
              waitedMs,
              bound,
            ),
        )
      : run(asCiRuns, undefined, 0, bound);
  };
}

/**
 * The signals a run passes to its command, and ends on while it waits.
 * The command leads a process group (and session) of its own, so a
 * terminal's Ctrl-C reaches the run and not the command, and the run
 * passes it on once, to the command's whole group, as a terminal would.
 * So does a SIGINT sent to the run's process alone. The command has no
 * controlling terminal: Ctrl-Z stops the run, not the command.
 */
const PASSED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const stillRuns = child =>
  child !== undefined && child.exitCode === null && child.signalCode === null;

/** Passes the signals to `react` until the function it returns is called. */
function takingSignals(react) {
  for (const signal of PASSED_SIGNALS) {
    process.on(signal, react);
  }
  return () => {
    for (const signal of PASSED_SIGNALS) {
      process.off(signal, react);
    }
  };
}

/**
 * The program that starts a command whose ticket is `ticket`: a shell that
 * creates, as the first thing it does, the mark of the command's group
 * beside the ticket (`GROUP_MARK`, named by its own pid) and then becomes
 * the command, so that the group is told even when the process that
 * started the command is killed before it records it.
 */
function recording(ticket, argv, shell) {
  const base = ticket.replace(/\.json$/, '.group');
  return shell
    ? ['/bin/sh', ['-c', ': > "$0.$$"; exec /bin/sh -c "$1"', base, argv[0]]]
    : ['/bin/sh', ['-c', ': > "$0.$$"; exec "$@"', base, ...argv]];
}

/**
 * Starts the command in a process group of its own, records the group in
 * the ticket when it has one, and resolves to how the command ended. A
 * command with a ticket is started by `recording`, after the ticket says
 * when it is being started (`spawning`).
 */
function ended({ argv, shell = false, environment, ticket }, started, say) {
  return new Promise(resolve => {
    let program = argv[0];
    let args = argv.slice(1);
    if (ticket !== undefined) {
      recordInTicket(ticket, { spawning: new Date().toISOString() });
      [program, args] = recording(ticket, argv, shell);
    }
    const child = spawn(program, args, {
      stdio: 'inherit',
      env: environment,
      shell: ticket === undefined && shell,
      detached: true,
    });
    started(child);
    if (ticket !== undefined && child.pid !== undefined) {
      recordGroup(ticket, child.pid);
    }
    child.on('error', error => {
      say(`\`${argv.join(' ')}\` did not start: ${error.message}`);
      resolve({ status: 127, signal: null });
    });
    child.on('exit', (status, signal) => resolve({ status, signal }));
  });
}

/**
 * Runs a command (`argv`) as a submit runs a check: under a slot of the
 * machine, with its number of workers in AEP_CHECK_WORKERS, when it is
 * heavy, and at once when it is not. The command runs in a process group
 * of its own (`PASSED_SIGNALS`), recorded in the ticket. A signal this
 * process receives is passed to that group while the command runs; one
 * received while it waits for its slot ends the wait. Either way the
 * ticket is removed before the run resolves, to how the command ended
 * (`status`, or the `signal` that ended it or the wait). A setting that cannot be read, or a slot not
 * had within the bound, is NoSlot, and the command does not start.
 * `onSpawn`, which the tests use, is called with the command's process as
 * soon as it is started, before anything is recorded. Its weight is read
 * from `root`, and it waits in the queue of `board`, as `checkRunner` says.
 */
export async function runInTurn({
  root,
  board = root,
  argv,
  holder,
  environment,
  say,
  onSpawn,
}) {
  const command = argv.join(' ');
  const heavy = takesSlot(command, root);
  const share = heavy ? shareOfTheMachine(environment) : undefined;
  const waiting = new AbortController();
  let child;
  let received = null;
  const stopTaking = takingSignals(signal => {
    received ??= signal;
    if (stillRuns(child)) {
      signalGroup(child.pid, signal);
    } else {
      waiting.abort();
    }
  });
  const started = running => {
    child = running;
    onSpawn?.(running);
  };
  try {
    if (!heavy) {
      return await ended({ argv, environment }, started, say);
    }
    const slot = {
      directory: join(board, SLOTS_DIRECTORY),
      holder: { ...holder, command },
      slots: share.slots,
      waitMs: share.waitMs,
      say,
    };
    const mine = writeTicket(slot.directory, slot.holder);
    try {
      const wait = slotWait(slot, mine);
      for (let step = wait.next(); !step.done; step = wait.next()) {
        try {
          await delay(step.value, undefined, { signal: waiting.signal });
        } catch (error) {
          if (error.name !== 'AbortError') {
            throw error;
          }
          return { status: null, signal: received };
        }
      }
      return await ended(
        {
          argv,
          environment: {
            ...environment,
            [WORKERS_VARIABLE]: String(share.workers),
          },
          ticket: mine.path,
        },
        started,
        say,
      );
    } finally {
      removeTicket(mine.path);
    }
  } finally {
    stopTaking();
  }
}

/** The argument by which this file runs a check in a group of its own. */
const IN_GROUP = '--in-group';

/** The longest a timer of Node waits; a longer one fires at once. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

/** What the process of a check says on its own pipe when the bound ended it. */
const TIMED_OUT = 'timed out';

/**
 * Runs a check, a line for the shell, as `spawnSync` does with `options`,
 * and tells whether its bound ended it (`timedOut`). The check is run by a
 * process of this file, which starts it in a process group of its own,
 * records the group in the ticket of its slot when it has one, passes on
 * the signals it receives, as `task run` does, and ends as the check did.
 * A submit, synchronous, cannot pass a signal on itself. A check that
 * runs `boundMs` is sent SIGTERM, its group SIGKILL if it still runs
 * `ENDING_GRACE_MS` after, as a command whose holder is gone is ended.
 * The check reads no input, as in CI. When that process is gone while the
 * check's group still runs, the group is ended before this returns, as
 * the next reader of the slots would end it.
 */
export function spawnCheck(command, options, ticket, boundMs) {
  const stdio = options.stdio ?? 'pipe';
  const [, out, err] =
    typeof stdio === 'string' ? [stdio, stdio, stdio] : stdio;
  const result = spawnSync(
    process.execPath,
    [THIS_FILE, IN_GROUP, ticket ?? '', String(boundMs), command],
    { ...options, stdio: ['ignore', out, err, 'pipe'] },
  );
  const timedOut = String(result.output?.[3] ?? '').includes(TIMED_OUT);
  if (ticket === undefined) {
    return { ...result, timedOut };
  }
  const runs = () => {
    const mine = read(join(ticket, '..')).tickets.find(
      each => each.path === ticket,
    );
    return mine !== undefined &&
      mine.group !== null &&
      commandRuns(mine, processesTold([mine.group]), Date.now())
      ? mine.group
      : undefined;
  };
  const group = runs();
  if (group !== undefined) {
    signalGroup(group, 'SIGTERM');
    const deadline = Date.now() + ENDING_GRACE_MS;
    while (runs() !== undefined) {
      if (Date.now() >= deadline) {
        signalGroup(group, 'SIGKILL');
        break;
      }
      pause(POLL_MS / 10);
    }
  }
  return { ...result, timedOut };
}

/**
 * The process of `spawnCheck`: the check in its group, ended at its
 * bound, and its end. It tells `spawnCheck` that the bound ended the
 * check on the pipe `spawnCheck` gives it beside the three of the check.
 */
async function runInGroup(ticket, boundMs, command) {
  if (ticket !== '') {
    // The ticket's holder, a submit, may be gone while this runs: a Ctrl-C
    // ends it and not this process, which gives the check its graceful end.
    recordInTicket(ticket, {
      runner: process.pid,
      runnerAt: new Date().toISOString(),
    });
  }
  let child;
  const stopTaking = takingSignals(signal => {
    if (stillRuns(child)) {
      signalGroup(child.pid, signal);
    }
  });
  let killing;
  const bounding = setTimeout(
    () => {
      if (!stillRuns(child)) {
        return;
      }
      writeSync(3, `${TIMED_OUT}\n`);
      signalGroup(child.pid, 'SIGTERM');
      killing = setTimeout(() => {
        if (stillRuns(child)) {
          signalGroup(child.pid, 'SIGKILL');
        }
      }, ENDING_GRACE_MS);
    },
    Math.min(boundMs, LONGEST_TIMER_MS),
  );
  const end = await ended(
    {
      argv: [command],
      shell: true,
      environment: process.env,
      ticket: ticket === '' ? undefined : ticket,
    },
    running => {
      child = running;
    },
    message => console.error(`task: ${message}`),
  );
  clearTimeout(bounding);
  clearTimeout(killing);
  stopTaking();
  if (end.signal !== null) {
    process.kill(process.pid, end.signal);
    return;
  }
  process.exitCode = end.status;
}

if (process.argv[1] === THIS_FILE && process.argv[2] === IN_GROUP) {
  await runInGroup(process.argv[3], Number(process.argv[4]), process.argv[5]);
}
