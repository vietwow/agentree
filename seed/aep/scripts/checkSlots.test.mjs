/**
 * The tests of the slots of the machine (scripts/checkSlots.mjs), by
 * themselves and as `task submit` and `task run` take them: each runs the
 * command as a worker does, on a board of its own in a temporary directory.
 *
 * Usage: node --test scripts/checkSlots.test.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHECK_TIMEOUT_VARIABLE,
  NoSlot,
  PORT_OFFSET_VARIABLE,
  SCRIPTS_RUN_WITH_CI_EMPTY,
  SLOTS_DIRECTORY,
  WORKERS_VARIABLE,
  asInCi,
  checkBound,
  portOffsetOfSeat,
  shareOfTheMachine,
  takesSlot,
  withSlot,
} from './checkSlots.mjs';

const TASK = fileURLToPath(new URL('./task.mjs', import.meta.url));
const SLOTS = fileURLToPath(new URL('./checkSlots.mjs', import.meta.url));
const SCHEMA = fileURLToPath(new URL('../work/schema.json', import.meta.url));
const CI_WORKFLOW = fileURLToPath(
  new URL('../.github/workflows/ci.yml', import.meta.url),
);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WEB = fileURLToPath(new URL('../apps/web/', import.meta.url));
const ALICE = 'cursor/model-a';
const BOB = 'claude-code/model-b';

const directories = [];
const processes = [];
after(() => {
  for (const pid of processes) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // It ended by itself.
    }
  }
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporary() {
  const directory = mkdtempSync(join(tmpdir(), 'aep-machine-'));
  directories.push(directory);
  return directory;
}

/** A process that outlives the test's use of it, and its pid. */
function sleeper() {
  const { pid } = spawn('sleep', ['600'], { stdio: 'ignore' });
  processes.push(pid);
  return pid;
}

/**
 * A process that leads a process group of its own, running `script` in a
 * shell, and its pid. It is not a child of this process, whose waits for
 * a slot cannot take note of a child's end.
 */
function leader(script) {
  const { stdout } = spawnSync(
    process.execPath,
    [
      '-e',
      "const child = require('node:child_process').spawn('sh', ['-c', " +
        "process.argv[1]], { detached: true, stdio: 'ignore' }); " +
        'child.unref(); console.log(child.pid);',
      script,
    ],
    { encoding: 'utf8' },
  );
  const pid = Number(stdout);
  processes.push(-pid);
  return pid;
}

const isRunning = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * A ticket written as another process would have: who holds it, since
 * when, the process group of its command, since when, and its seat.
 */
function ticket(
  directory,
  number,
  {
    pid,
    at = new Date(),
    task = 'T-0009',
    group,
    groupAt = new Date(),
    seat,
    runner,
    runnerAt = new Date(),
    spawning,
  },
) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${String(number).padStart(6, '0')}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      pid,
      at: at.toISOString(),
      worker: BOB,
      task,
      command: 'yarn platform:check',
      ...(group === undefined ? {} : { group, groupAt: groupAt.toISOString() }),
      ...(seat === undefined ? {} : { seat }),
      ...(runner === undefined
        ? {}
        : { runner, runnerAt: runnerAt.toISOString() }),
      ...(spawning === undefined ? {} : { spawning: spawning.toISOString() }),
    }),
  );
  return path;
}

const HOUR_MS = 60 * 60 * 1000;

describe('which checks take a slot', () => {
  test('the end-to-end suite, the tests of the tree and the demo do, whatever they are given', () => {
    for (const command of [
      'yarn workspace @aep/web e2e',
      'yarn workspace @aep/web e2e --project=parity -g connectors-page',
      'yarn platform:test',
      'yarn platform:test apps/server/src/auditCoverage',
      'yarn platform:test apps/web/src/ui/Chip.test.tsx',
      'yarn platform:check',
      'yarn workspace @aep/model-store test:demo',
      'yarn platform:typecheck && yarn platform:test',
    ]) {
      assert.equal(takesSlot(command), true, command);
    }
  });

  /**
   * A checkout of two packages, each with a unit and an integration test
   * file of the same names, and the root's and the packages' scripts.
   */
  function checkout() {
    const root = temporary();
    const write = (path, contents) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), contents);
    };
    const manifest = (directory, contents) =>
      write(join(directory, 'package.json'), JSON.stringify(contents));
    manifest('.', {
      workspaces: ['packages/*'],
      scripts: {
        unit: 'vitest run --passWithNoTests',
        'unit:again': 'yarn unit',
        each: 'yarn workspaces foreach --all run test',
        typecheck:
          "yarn workspaces foreach --all --include 'packages/*' exec tsc",
        wrapped: "sh -c 'yarn vitest run'",
        moved: 'cd packages/one && vitest run',
      },
    });
    manifest('packages/one', {
      name: '@aep/one',
      scripts: { test: 'vitest run', lint: 'node --test lint.test.mjs' },
    });
    manifest('packages/two', { name: '@aep/two', scripts: {} });
    for (const name of ['one', 'two']) {
      for (const file of [
        'a.test.ts',
        'b.test.tsx',
        'c.test.mjs',
        'd.test.ts',
        'audit.integration.test.ts',
        'queue.integration.test.ts',
      ]) {
        write(join('packages', name, 'src', file), '');
      }
    }
    write('top.test.ts', '');
    return root;
  }

  test('a Vitest run of a few named test files does not', () => {
    const root = checkout();
    for (const command of [
      'yarn vitest run packages/one/src/a.test.ts',
      'node_modules/.bin/vitest run packages/one/src/a.test.ts',
      'yarn vitest run --maxWorkers=1 packages/one/src/a.test.ts packages/one/src/b.test.tsx packages/two/src/c.test.mjs',
      'yarn vitest run --maxWorkers 1 --reporter dot ./packages/one/src/a.test.ts',
      'yarn vitest run packages/one/src/audit.integration.test.ts packages/one/src/a.test.ts',
      'yarn vitest run --project @aep/one packages/one/src/a.test.ts',
      'yarn vitest run --dir packages packages/one/src/a.test.ts',
      'yarn vitest run --dir=packages packages/one/src/a.test.ts',
      'yarn unit packages/one/src/a.test.ts',
      'yarn unit:again packages/one/src/a.test.ts',
      'yarn workspace @aep/one test src/a.test.ts',
      'yarn moved src/a.test.ts',
    ]) {
      assert.equal(takesSlot(command, root), false, command);
    }
  });

  test('a Vitest run beyond the line, or of more than it names, does', () => {
    const root = checkout();
    for (const command of [
      // Over the line: four files, or two integration files.
      'yarn vitest run packages/one/src/a.test.ts packages/one/src/b.test.tsx packages/one/src/c.test.mjs packages/one/src/d.test.ts',
      'yarn vitest run packages/one/src/audit.integration.test.ts packages/one/src/queue.integration.test.ts',
      // Words Vitest keeps every file that holds.
      'yarn vitest run .test.ts',
      'yarn vitest run .integration.test.ts',
      'yarn vitest run audit.integration.test.ts',
      'yarn vitest run a.test.ts',
      'yarn vitest run top.test.ts',
      'yarn vitest run packages/one/src/missing.test.ts',
      'yarn vitest run packages/*/src/a.test.ts',
      "yarn vitest run 'packages/{one,two}/src/a.test.ts'",
      'yarn vitest run packages/one',
      'yarn vitest run identifiers',
      'yarn vitest run packages/one packages/one/src/a.test.ts',
      // Runs of more than files.
      'node_modules/.bin/vitest run packages/one',
      'yarn vitest related --run packages/one/src/a.ts',
      'yarn vitest related --run packages/one/src/a.test.ts',
      'yarn vitest run --project @aep/one',
      'yarn vitest run',
      'yarn vitest',
      'yarn prettier:check && yarn vitest run',
      "sh -c 'yarn vitest run'",
      'yarn wrapped',
    ]) {
      assert.equal(takesSlot(command, root), true, command);
    }
  });

  test("a package's script is weighed by what it runs", () => {
    const root = checkout();
    for (const [command, heavy] of [
      ['yarn workspace @aep/one test', true],
      ['yarn workspace @aep/one run test', true],
      ['yarn workspace @aep/one test src/a.test.ts', false],
      ['yarn workspace @aep/one test packages/one/src/a.test.ts', true],
      ['yarn workspace @aep/one test src src/a.test.ts', true],
      [
        'yarn workspace @aep/one test src/a.test.ts src/b.test.tsx src/c.test.mjs src/d.test.ts',
        true,
      ],
      [
        'yarn workspace @aep/one test src/audit.integration.test.ts src/queue.integration.test.ts',
        true,
      ],
      ['yarn workspace @aep/one lint', false],
      ['yarn unit', true],
      ['yarn unit:again', true],
      ['yarn moved', true],
      ['yarn each', true],
      ['yarn typecheck', false],
    ]) {
      assert.equal(takesSlot(command, root), heavy, command);
    }
  });

  test('a Jest run of the whole tree through backstage-cli waits, one of named files does not', () => {
    const root = checkout();
    for (const [command, heavy] of [
      ['backstage-cli repo test', true],
      ['yarn backstage-cli repo test --coverage', true],
      ['yarn backstage-cli repo test --since origin/main', true],
      ['yarn backstage-cli repo test packages/one', true],
      ['yarn backstage-cli package test', true],
      ['yarn backstage-cli repo test packages/one/src/a.test.ts', false],
      [
        'yarn backstage-cli repo test --maxWorkers=1 packages/one/src/a.test.ts packages/two/src/a.test.ts',
        false,
      ],
      ['yarn backstage-cli repo lint', false],
      ['yarn backstage-cli repo build', false],
    ]) {
      assert.equal(takesSlot(command, root), heavy, command);
    }
  });

  test("this checkout's root test scripts wait, as they run the whole tree", () => {
    assert.equal(takesSlot('yarn test'), true);
    assert.equal(takesSlot('yarn test:all'), true);
    assert.equal(takesSlot('yarn run test:all --watchAll=false'), true);
  });

  test("this checkout's workspace test script waits, and one file of it does not", () => {
    assert.equal(takesSlot('yarn workspace @aep/web test'), true);
    assert.equal(
      takesSlot('yarn workspace @aep/web test src/ui/Chip.test.tsx'),
      false,
    );
  });

  test('the formatting, the lints and the scripts that run no Vitest do not', () => {
    for (const command of [
      'yarn prettier:check',
      'yarn prettier --check apps/web/e2e/start.test.ts',
      'yarn lint:tasks',
      'yarn lint:repo',
      'yarn test:task',
      'yarn platform:typecheck',
      'exit 0',
    ]) {
      assert.equal(takesSlot(command), false, command);
    }
  });

  test('a line a shell is given to run is read as the line it runs, whatever the flags before it', () => {
    for (const shell of [
      "bash -lc '%'",
      "sh -ec '%'",
      "sh -e -c '%'",
      "bash -o pipefail -c '%'",
      "bash -c -- '%'",
    ]) {
      const heavy = shell.replace('%', 'yarn platform:test');
      const light = shell.replace('%', 'true');
      assert.equal(takesSlot(heavy), true, heavy);
      assert.equal(takesSlot(light), false, light);
    }
  });
});

describe('the share of the machine', () => {
  const share = (environment, cores) => {
    const { slots, workers } = shareOfTheMachine(environment, cores);
    return { slots, workers };
  };

  test('by default as many slots as runs of half the cores fit', () => {
    assert.deepEqual(share({}, 14), { slots: 2, workers: 7 });
    assert.deepEqual(share({}, 8), { slots: 2, workers: 4 });
    assert.deepEqual(share({}, 1), { slots: 1, workers: 1 });
  });

  test('AEP_CHECK_SLOTS sets the slots, and a run has its part of the cores', () => {
    assert.deepEqual(share({ AEP_CHECK_SLOTS: '4' }, 14), {
      slots: 4,
      workers: 3,
    });
    assert.deepEqual(share({ AEP_CHECK_SLOTS: '20' }, 14), {
      slots: 20,
      workers: 1,
    });
  });

  test('one slot starts no more workers than a run does by itself', () => {
    assert.deepEqual(share({ AEP_CHECK_SLOTS: '1' }, 14), {
      slots: 1,
      workers: 7,
    });
  });

  test('a wait of two hours, or AEP_CHECK_SLOT_WAIT_MINUTES', () => {
    assert.equal(shareOfTheMachine({}, 14).waitMs, 2 * HOUR_MS);
    assert.equal(
      shareOfTheMachine({ AEP_CHECK_SLOT_WAIT_MINUTES: '0.5' }, 14).waitMs,
      30_000,
    );
  });

  test('a setting that is no such number is refused', () => {
    for (const AEP_CHECK_SLOTS of ['0', '-1', '1.5', 'two']) {
      assert.throws(
        () => shareOfTheMachine({ AEP_CHECK_SLOTS }, 14),
        error =>
          error instanceof NoSlot && /AEP_CHECK_SLOTS is/.test(error.message),
      );
    }
    for (const AEP_CHECK_SLOT_WAIT_MINUTES of ['0', '-5', 'long', 'Infinity']) {
      assert.throws(
        () => shareOfTheMachine({ AEP_CHECK_SLOT_WAIT_MINUTES }, 14),
        error =>
          error instanceof NoSlot &&
          /AEP_CHECK_SLOT_WAIT_MINUTES is/.test(error.message),
      );
    }
  });
});

describe('a check as CI runs it', () => {
  test('has CI set, but for the checks CI runs with it empty', () => {
    assert.deepEqual(asInCi('yarn platform:check'), { CI: 'true' });
    for (const command of [
      'yarn test:e2e',
      'yarn test:e2e --headed',
      'yarn run test:e2e',
      'AEP_WHOLE_TREE=1 yarn test:e2e',
      'yarn tsc && yarn test:e2e',
    ]) {
      assert.deepEqual(asInCi(command), { CI: '' }, command);
    }
    assert.deepEqual(asInCi('yarn workspace @aep/web e2e'), { CI: 'true' });
  });

  test('has CI empty exactly where the workflow empties it', () => {
    // Each step of the workflow whose env sets CI to '' is the step
    // `run:` before it.
    const lines = readFileSync(CI_WORKFLOW, 'utf8').split('\n');
    const emptied = [];
    let step;
    for (const line of lines) {
      const ran = /^\s*- run: (.+)$/.exec(line);
      if (ran !== null) {
        step = ran[1];
      } else if (/^\s*-\s/.test(line)) {
        step = undefined;
      } else if (/^\s+CI: ''$/.test(line) && step !== undefined) {
        emptied.push(step);
      }
    }
    assert.ok(emptied.length > 0, 'the workflow empties CI for no step');
    assert.deepEqual(
      emptied.toSorted(),
      [...SCRIPTS_RUN_WITH_CI_EMPTY].map(name => `yarn ${name}`).toSorted(),
    );
  });

  test('runs for 90 min at most, or AEP_CHECK_TIMEOUT_MINUTES', () => {
    assert.deepEqual(checkBound({}), { minutes: 90, ms: 90 * 60_000 });
    assert.deepEqual(checkBound({ [CHECK_TIMEOUT_VARIABLE]: '0.5' }), {
      minutes: 0.5,
      ms: 30_000,
    });
    for (const minutes of ['0', '-5', 'long', 'Infinity']) {
      assert.throws(
        () => checkBound({ [CHECK_TIMEOUT_VARIABLE]: minutes }),
        error =>
          error instanceof NoSlot &&
          /AEP_CHECK_TIMEOUT_MINUTES is/.test(error.message),
      );
    }
  });
});

describe('a slot', () => {
  /** Asks for a slot as a check of ALICE's, and returns what it said. */
  function taking(directory, { slots = 1, waitMs = 300, graceMs } = {}) {
    const said = [];
    let waited;
    let seat;
    const result = withSlot(
      {
        directory,
        holder: { worker: ALICE, task: 'T-0001', command: 'yarn e2e' },
        slots,
        waitMs,
        pollMs: 20,
        graceMs,
        say: message => said.push(message),
      },
      (_ticket, waitedMs, seatTaken) => {
        waited = waitedMs;
        seat = seatTaken;
        return 'ran';
      },
    );
    return { result, said: said.join('\n'), waited, seat };
  }

  test('is taken at once while one is free, and given back', () => {
    const directory = join(temporary(), 'slots');
    const { result, said } = taking(directory);
    assert.equal(result, 'ran');
    assert.equal(said, '');
    assert.deepEqual(readdirSync(directory), []);
  });

  test('is given back when the check throws', () => {
    const directory = join(temporary(), 'slots');
    assert.throws(
      () =>
        withSlot(
          {
            directory,
            holder: { worker: ALICE, task: 'T-0001', command: 'yarn e2e' },
            slots: 1,
            waitMs: 300,
            say: () => {},
          },
          () => {
            throw new Error('the check broke');
          },
        ),
      /the check broke/,
    );
    assert.deepEqual(readdirSync(directory), []);
  });

  test('held by a running process is waited for, up to the bound, and named', () => {
    const directory = join(temporary(), 'slots');
    // This process began before the ticket was written, as a holder did.
    const held = ticket(directory, 1, { pid: process.pid });
    const started = Date.now();
    assert.throws(
      () => taking(directory),
      error => {
        assert.ok(error instanceof NoSlot);
        assert.match(error.message, /`yarn e2e` got no slot of the machine/);
        assert.match(error.message, /AEP_CHECK_SLOT_WAIT_MINUTES/);
        assert.match(
          error.message,
          new RegExp(
            `runs: ${BOB}, T-0009, \`yarn platform:check\`, there for \\d+ s \\(process ${process.pid}\\)`,
          ),
        );
        return true;
      },
    );
    assert.ok(Date.now() - started >= 300);
    assert.deepEqual(readdirSync(directory), ['000001.json']);
    assert.ok(existsSync(held));
  });

  test('is free beside a held one when the machine has two', () => {
    const directory = join(temporary(), 'slots');
    ticket(directory, 1, { pid: process.pid });
    const { result, said } = taking(directory, { slots: 2 });
    assert.equal(result, 'ran');
    assert.equal(said, '');
  });

  test('hands the run how long its ticket waited: about nothing for a free slot', () => {
    const { waited } = taking(join(temporary(), 'slots'));
    assert.ok(waited >= 0 && waited < 500, `waited ${waited} ms`);
  });

  test('hands the run how long its ticket waited behind a held one', () => {
    const directory = join(temporary(), 'slots');
    const holder = {
      pid: Number(
        spawnSync('sh', ['-c', 'sleep 2 > /dev/null 2>&1 & echo $!'], {
          encoding: 'utf8',
        }).stdout,
      ),
    };
    ticket(directory, 1, { pid: holder.pid });
    const { waited } = taking(directory, { waitMs: 20_000 });
    assert.ok(waited >= 500, `waited ${waited} ms`);
  });

  test('says for whom it waits, and that it has the slot when they are gone', () => {
    const directory = join(temporary(), 'slots');
    // Not a child of this process, which cannot take note of a child's end
    // while it waits for the slot.
    const holder = {
      pid: Number(
        spawnSync('sh', ['-c', 'sleep 1 > /dev/null 2>&1 & echo $!'], {
          encoding: 'utf8',
        }).stdout,
      ),
    };
    ticket(directory, 3, { pid: holder.pid });
    const { result, said } = taking(directory, { waitMs: 20_000 });
    assert.equal(result, 'ran');
    assert.match(
      said,
      new RegExp(
        '^`yarn e2e` waits for a slot \\(\\d+ s so far\\): this machine runs 1 ' +
          'heavy check\\(s\\) at once \\(AEP_CHECK_SLOTS\\), and 1 are before it:\\n' +
          `  runs: ${BOB}, T-0009, \`yarn platform:check\`, there for \\d+ s \\(process ${holder.pid}\\)\\n`,
      ),
    );
    assert.match(said, /is free: its process \d+ is gone\n/);
    assert.match(said, /`yarn e2e` has a slot, after \d+ s$/);
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose process is gone is taken over', () => {
    const directory = join(temporary(), 'slots');
    const gone = spawnSync('true');
    ticket(directory, 1, { pid: gone.pid });
    const { result, said } = taking(directory);
    assert.equal(result, 'ran');
    assert.match(
      said,
      new RegExp(
        `^the slot of ${BOB}, T-0009, \`yarn platform:check\` is free: its process ${gone.pid} is gone$`,
      ),
    );
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose pid another process has since is taken over', () => {
    const directory = join(temporary(), 'slots');
    // A process that began after the ticket was written is not its holder:
    // the machine gave the pid again, or started again.
    ticket(directory, 1, {
      pid: sleeper(),
      at: new Date(Date.now() - HOUR_MS),
    });
    const { result, said } = taking(directory);
    assert.equal(result, 'ran');
    assert.match(said, /is free: its process \d+ is gone$/);
  });

  test('whose process is gone is taken once the command it started has ended, killed if it outlasts SIGTERM', () => {
    const directory = join(temporary(), 'slots');
    const command = leader('trap "" TERM; sleep 600');
    ticket(directory, 1, { pid: spawnSync('true').pid, group: command });
    const started = Date.now();
    const { result, said } = taking(directory, {
      waitMs: 20_000,
      graceMs: 300,
    });
    assert.equal(result, 'ran');
    assert.ok(Date.now() - started >= 300);
    assert.equal(isRunning(command), false);
    assert.match(
      said,
      new RegExp(
        `^the process \\d+ of ${BOB}, T-0009, \`yarn platform:check\` is gone, ` +
          `and its command still runs \\(process group ${command}\\): it is ` +
          'sent SIGTERM, and SIGKILL after 0 s; its slot is free once it has ended\\n',
      ),
    );
    assert.match(said, /is free: its process \d+ is gone\n/);
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose command group is led by a process begun after it, or by none, signals nothing', () => {
    const directory = join(temporary(), 'slots');
    // The group's id given to a process that began after the ticket, as
    // after the command ended or the machine started again.
    const later = leader('sleep 600');
    ticket(directory, 1, {
      pid: spawnSync('true').pid,
      group: later,
      groupAt: new Date(Date.now() - HOUR_MS),
    });
    // A process with the group's id that leads no group.
    const member = sleeper();
    ticket(directory, 2, { pid: spawnSync('true').pid, group: member });
    const { result, said } = taking(directory, { slots: 1 });
    assert.equal(result, 'ran');
    assert.doesNotMatch(said, /SIGTERM/);
    assert.ok(isRunning(later));
    assert.ok(isRunning(member));
    assert.deepEqual(readdirSync(directory), []);
  });

  test('that cannot be read is held by no process', () => {
    const directory = join(temporary(), 'slots');
    mkdirSync(directory);
    writeFileSync(join(directory, '000001.json'), '{"pid": ');
    writeFileSync(join(directory, '000002.json'), 'null');
    const { result, said } = taking(directory);
    assert.equal(result, 'ran');
    assert.match(said, /the ticket 000001\.json, which cannot be read/);
    assert.deepEqual(readdirSync(directory), []);
  });

  /**
   * A zombie: a process that leads a process group of its own, has ended,
   * and whose parent, which lives on, does not reap it. Its pid, or
   * undefined when this machine has no Python to make one.
   */
  function zombie() {
    const parent = spawn(
      'python3',
      [
        '-I',
        '-c',
        [
          'import os, sys, time',
          'pid = os.fork()',
          'if pid == 0:',
          '    os.setpgid(0, 0)',
          '    os._exit(0)',
          'print(pid, flush=True)',
          'time.sleep(600)',
        ].join('\n'),
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    processes.push(parent.pid);
    return new Promise(resolve => {
      parent.on('error', () => resolve(undefined));
      parent.stdout.once('data', data => {
        const pid = Number(String(data));
        setTimeout(() => resolve(pid), 200);
      });
    });
  }

  test('whose holder, or whose command leader, has ended and is not reaped is taken over', async t => {
    const gone = await zombie();
    if (gone === undefined) {
      t.skip('no python3 to make a zombie');
      return;
    }
    const { stdout } = spawnSync('ps', ['-o', 'stat=', '-p', String(gone)], {
      encoding: 'utf8',
    });
    assert.match(stdout, /^\s*Z/, 'the process is a zombie');
    const directory = join(temporary(), 'slots');
    ticket(directory, 1, { pid: gone });
    ticket(directory, 2, { pid: spawnSync('true').pid, group: gone });
    const started = Date.now();
    const { result, said } = taking(directory, { slots: 1, waitMs: 20_000 });
    assert.equal(result, 'ran');
    assert.doesNotMatch(said, /SIGTERM/);
    assert.match(said, /is free: its process \d+ is gone\n/);
    assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose command was started a moment ago, and records no group yet, is held until that moment has passed', () => {
    const directory = join(temporary(), 'slots');
    ticket(directory, 1, { pid: spawnSync('true').pid, spawning: new Date() });
    assert.throws(() => taking(directory), NoSlot);
    assert.deepEqual(readdirSync(directory), ['000001.json']);
    rmSync(join(directory, '000001.json'));
    ticket(directory, 1, {
      pid: spawnSync('true').pid,
      spawning: new Date(Date.now() - HOUR_MS),
    });
    const { result } = taking(directory);
    assert.equal(result, 'ran');
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose command was started by a process that was killed before it recorded the group is ended by the next reader', async () => {
    const root = temporary();
    const directory = join(root, SLOTS_DIRECTORY);
    const told = join(temporary(), 'told');
    const spawned = join(temporary(), 'spawned');
    // The holder is killed as soon as the command is spawned, before it
    // records the command's group; the command, a shell that becomes it,
    // records its own, and runs on.
    const program = `
      import { writeFileSync } from 'node:fs';
      import { runInTurn } from ${JSON.stringify(SLOTS)};
      await runInTurn({
        root: ${JSON.stringify(root)},
        argv: ['sh', '-c', 'true e2e; trap "echo term >> ${told}; exit 0" TERM; echo ready >> ${told}.ready; while true; do sleep 1; done'],
        holder: { worker: 'cursor/x', task: 'T-0001' },
        environment: { ...process.env, AEP_CHECK_SLOTS: '1' },
        say: () => {},
        onSpawn: command => {
          writeFileSync(${JSON.stringify(spawned)}, String(command.pid));
          process.kill(process.pid, 'SIGKILL');
        },
      });`;
    const killed = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', program],
      { stdio: 'ignore' },
    );
    assert.equal(killed.signal, 'SIGKILL');
    // The command leads its own group: recorded, so that it is ended with
    // this test whatever happens.
    processes.push(-Number(readFileSync(spawned, 'utf8')));
    const marked = () =>
      readdirSync(directory).find(name => /^000001\.group\.\d+$/.test(name));
    const started = Date.now();
    while (marked() === undefined) {
      assert.ok(Date.now() - started < 30_000, 'the command to record itself');
      await new Promise(resolve => {
        setTimeout(resolve, 20);
      });
    }
    const command = Number(marked().split('.').at(-1));
    // The command has its handler once it says so: a SIGTERM before it
    // would end it with no trace.
    while (!existsSync(`${told}.ready`)) {
      assert.ok(Date.now() - started < 30_000, 'the command to be ready');
      await new Promise(resolve => {
        setTimeout(resolve, 20);
      });
    }
    assert.equal(
      JSON.parse(readFileSync(join(directory, '000001.json'), 'utf8')).group,
      undefined,
      'the killed holder did not record the group',
    );
    assert.ok(isRunning(command));

    const said = [];
    withSlot(
      {
        directory,
        holder: { worker: ALICE, task: 'T-0002', command: 'yarn e2e' },
        slots: 1,
        waitMs: 30_000,
        pollMs: 20,
        graceMs: 5000,
        say: message => said.push(message),
      },
      () => {},
    );
    assert.match(said.join('\n'), /it is sent SIGTERM/);
    assert.equal(readFileSync(told, 'utf8'), 'term\n');
    assert.equal(isRunning(command), false);
    assert.deepEqual(readdirSync(directory), []);
  });

  test('whose runner still runs is held, and is ended when its runner is stopped', () => {
    const directory = join(temporary(), 'slots');
    const command = leader('sleep 600');
    const runner = sleeper();
    ticket(directory, 1, {
      pid: spawnSync('true').pid,
      group: command,
      runner,
    });
    assert.throws(() => taking(directory), NoSlot);
    assert.ok(isRunning(command), 'the command is not signalled');
    assert.deepEqual(readdirSync(directory), ['000001.json']);

    process.kill(runner, 'SIGSTOP');
    const { result, said } = taking(directory, {
      waitMs: 20_000,
      graceMs: 300,
    });
    assert.equal(result, 'ran');
    assert.match(said, /it is sent SIGTERM/);
    assert.equal(isRunning(command), false);
  });

  test('whose command is marked as being ended for another ticket of its number is sent SIGTERM first', () => {
    const directory = join(temporary(), 'slots');
    const told = join(temporary(), 'told');
    const command = leader(
      `trap "echo term >> ${told}; exit 0" TERM; while true; do sleep 1; done`,
    );
    ticket(directory, 1, { pid: spawnSync('true').pid, group: command });
    // The mark of a ticket that had this number, long ago: its grace is over.
    const stale = join(directory, '000001.ending');
    writeFileSync(stale, '4242:0:4242');
    const longAgo = new Date(Date.now() - HOUR_MS);
    utimesSync(stale, longAgo, longAgo);
    const { result, said } = taking(directory, {
      waitMs: 20_000,
      graceMs: 5000,
    });
    assert.equal(result, 'ran');
    assert.match(said, /it is sent SIGTERM/);
    assert.equal(readFileSync(told, 'utf8'), 'term\n');
    assert.deepEqual(readdirSync(directory), []);
  });

  test('is written with none of the marks a ticket of its number left', () => {
    const directory = join(temporary(), 'slots');
    mkdirSync(directory);
    writeFileSync(join(directory, '000001.ending'), '');
    writeFileSync(join(directory, '000001.group.4242'), '');
    let beside;
    withSlot(
      {
        directory,
        holder: { worker: ALICE, task: 'T-0001', command: 'yarn e2e' },
        slots: 1,
        waitMs: 300,
        say: () => {},
      },
      () => {
        beside = readdirSync(directory);
      },
    );
    assert.deepEqual(beside, ['000001.json']);
    assert.deepEqual(readdirSync(directory), []);
  });

  test('never signals the process group 1, 0 or -1, whatever the tickets name', t => {
    const directory = join(temporary(), 'slots');
    const gone = spawnSync('true').pid;
    // Groups that no signal may reach, named by the group, the runner or a
    // mark of the command's own group.
    for (const [number, fields] of [
      [1, { pid: gone, group: 1 }],
      [2, { pid: gone, group: 0 }],
      [3, { pid: gone, group: -1 }],
      [4, { pid: gone, runner: 1 }],
      [5, { pid: gone }],
    ]) {
      ticket(directory, number, fields);
    }
    writeFileSync(join(directory, '000005.group.1'), '');
    writeFileSync(join(directory, '000006.group.0'), '');
    writeFileSync(join(directory, 'draft-0'), '');
    const original = process.kill;
    const called = [];
    // The stand-in never lets a signal through to those, as a bug would.
    t.mock.method(process, 'kill', (pid, signal) => {
      called.push(pid);
      if (pid > 1 || pid < -1) {
        return original.call(process, pid, signal);
      }
      throw Object.assign(new Error('refused by the test'), { code: 'EPERM' });
    });
    const { result } = taking(directory, { slots: 1, waitMs: 20_000 });
    assert.equal(result, 'ran');
    for (const pid of called) {
      assert.ok(pid > 1 || pid < -1, `process.kill(${pid}, ...) was called`);
    }
    assert.deepEqual(readdirSync(directory), []);
  });

  test('has its command found from the valid mark beside an invalid one', () => {
    const directory = join(temporary(), 'slots');
    const told = join(temporary(), 'told');
    const command = leader(
      `trap "echo term >> ${told}; exit 0" TERM; while true; do sleep 1; done`,
    );
    ticket(directory, 1, { pid: spawnSync('true').pid });
    // Marks that name no process a signal may reach, beside the command's.
    for (const name of ['000001.group.0', '000001.group.1']) {
      writeFileSync(join(directory, name), '');
    }
    writeFileSync(join(directory, `000001.group.${command}`), '');
    const { result, said } = taking(directory, {
      waitMs: 20_000,
      graceMs: 5000,
    });
    assert.equal(result, 'ran');
    assert.match(said, /it is sent SIGTERM/);
    assert.equal(readFileSync(told, 'utf8'), 'term\n');
    assert.deepEqual(readdirSync(directory), []);
  });

  test('is removed with its marks first, so that the ticket is never gone while its marks are', () => {
    const directory = join(temporary(), 'slots');
    const watched = join(temporary(), 'watched');
    const ready = join(temporary(), 'ready');
    // A watcher process reads the directory in a loop; it records whether
    // it ever saw marks of the number with the ticket already gone, which is
    // when a new ticket of that number could be written.
    const watcher = `
      import { existsSync, readdirSync, writeFileSync } from 'node:fs';
      const directory = ${JSON.stringify(directory)};
      writeFileSync(${JSON.stringify(ready)}, '');
      for (;;) {
        if (!existsSync(directory + '/000001.json')) {
          if (readdirSync(directory).some(name => name.startsWith('000001.group.'))) {
            writeFileSync(${JSON.stringify(watched)}, '');
            break;
          }
        }
        if (existsSync(${JSON.stringify(watched)} + '.stop')) break;
      }`;
    const pause = milliseconds =>
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        milliseconds,
      );
    let finished;
    withSlot(
      {
        directory,
        holder: { worker: ALICE, task: 'T-0001', command: 'yarn e2e' },
        slots: 1,
        waitMs: 300,
        say: () => {},
      },
      () => {
        // Many marks, so that removing them takes a while.
        for (let pid = 2; pid < 3000; pid += 1) {
          writeFileSync(join(directory, `000001.group.${pid}`), '');
        }
        const child = spawn(
          process.execPath,
          ['--input-type=module', '--eval', watcher],
          { stdio: 'ignore' },
        );
        processes.push(child.pid);
        finished = new Promise(resolve => child.on('exit', resolve));
        const started = Date.now();
        while (!existsSync(ready)) {
          assert.ok(Date.now() - started < 30_000, 'the watcher to start');
          pause(10);
        }
      },
    );
    writeFileSync(`${watched}.stop`, '');
    return finished.then(() => {
      assert.equal(
        existsSync(watched),
        false,
        'marks seen without their ticket',
      );
      assert.deepEqual(readdirSync(directory), []);
    });
  });

  test('has the lowest seat no held ticket records', () => {
    const directory = join(temporary(), 'slots');
    ticket(directory, 1, { pid: process.pid, seat: 0 });
    ticket(directory, 2, { pid: process.pid, seat: 2 });
    const { result, seat } = taking(directory, { slots: 3 });
    assert.equal(result, 'ran');
    assert.equal(seat, 1);
    assert.equal(existsSync(join(directory, '000003.json')), false);
  });

  test('has the seat of a ticket whose process is gone, whose pid another process has since, or that cannot be read', () => {
    const left = {
      gone: directory =>
        ticket(directory, 1, { pid: spawnSync('true').pid, seat: 0 }),
      'given again': directory =>
        ticket(directory, 1, {
          pid: sleeper(),
          at: new Date(Date.now() - HOUR_MS),
          seat: 0,
        }),
      unreadable: directory => {
        mkdirSync(directory);
        writeFileSync(join(directory, '000001.json'), '{"seat": 0, ');
      },
    };
    for (const [how, leave] of Object.entries(left)) {
      const directory = join(temporary(), 'slots');
      leave(directory);
      const started = Date.now();
      const { result, seat } = taking(directory);
      assert.equal(result, 'ran', how);
      assert.equal(seat, 0, how);
      assert.ok(
        Date.now() - started < 5000,
        `${how}: took ${Date.now() - started} ms`,
      );
      assert.deepEqual(readdirSync(directory), [], how);
    }
  });

  test('is never the seat of another ticket, when many take theirs at once beside a left one', async () => {
    const holders = 8;
    const directory = join(temporary(), 'slots');
    // A seat a process left as it was killed: every taker finds it at once.
    ticket(directory, 1, { pid: spawnSync('true').pid, seat: 0 });
    const trace = join(temporary(), 'trace');
    writeFileSync(trace, '');
    // Each holder keeps its seat until every one has taken its own, so that
    // all hold at once by construction.
    const program = `
      import { appendFileSync, readFileSync } from 'node:fs';
      import { withSlot } from ${JSON.stringify(SLOTS)};
      const trace = ${JSON.stringify(trace)};
      const pause = ms =>
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      withSlot(
        {
          directory: ${JSON.stringify(directory)},
          holder: { worker: 'cursor/x', task: 'T-0001', command: 'yarn e2e' },
          slots: ${holders},
          waitMs: 120_000,
          pollMs: 5,
          say: () => {},
        },
        (_ticket, _waited, seat) => {
          appendFileSync(trace, 'seat ' + seat + '\\n');
          const deadline = Date.now() + 60_000;
          while (readFileSync(trace, 'utf8').trim().split('\\n').length < ${holders}) {
            if (Date.now() > deadline) {
              process.exit(1);
            }
            pause(5);
          }
        },
      );`;
    const exits = await Promise.all(
      Array.from(
        { length: holders },
        () =>
          new Promise(resolve => {
            spawn(
              process.execPath,
              ['--input-type=module', '--eval', program],
              {
                stdio: 'inherit',
              },
            ).on('exit', resolve);
          }),
      ),
    );
    const seats = readFileSync(trace, 'utf8').trim().split('\n');
    assert.deepEqual(exits, Array(holders).fill(0), seats.join('\n'));
    assert.deepEqual(
      seats.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      Array.from({ length: holders }, (_, seat) => `seat ${seat}`),
    );
    assert.deepEqual(readdirSync(directory), []);
  });

  test('is never held by more processes than the machine has slots', async () => {
    const holders = 10;
    const directory = join(temporary(), 'slots');
    const trace = join(temporary(), 'trace');
    // Each holder stays in its slot until the next one has started, so that
    // two hold at once by construction, however slowly the processes start;
    // a holder that waits longer than any start takes fails the test.
    const program = `
      import { appendFileSync, readFileSync } from 'node:fs';
      import { withSlot } from ${JSON.stringify(SLOTS)};
      const trace = ${JSON.stringify(trace)};
      const pause = ms =>
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      const starts = () =>
        readFileSync(trace, 'utf8')
          .split('\\n')
          .filter(line => line.startsWith('start'));
      withSlot(
        {
          directory: ${JSON.stringify(directory)},
          holder: { worker: 'cursor/x', task: 'T-0001', command: 'yarn e2e' },
          slots: 2,
          waitMs: 120_000,
          pollMs: 5,
          say: () => {},
        },
        () => {
          appendFileSync(trace, 'start ' + process.pid + '\\n');
          const place = starts().indexOf('start ' + process.pid) + 1;
          const deadline = Date.now() + 60_000;
          while (place < ${holders} && starts().length <= place) {
            if (Date.now() > deadline) {
              appendFileSync(trace, 'no next start ' + process.pid + '\\n');
              process.exit(1);
            }
            pause(5);
          }
          appendFileSync(trace, 'end ' + process.pid + '\\n');
        },
      );`;
    const exits = await Promise.all(
      Array.from(
        { length: holders },
        () =>
          new Promise(resolve => {
            spawn(
              process.execPath,
              ['--input-type=module', '--eval', program],
              {
                stdio: 'inherit',
              },
            ).on('exit', resolve);
          }),
      ),
    );
    const events = existsSync(trace)
      ? readFileSync(trace, 'utf8').trim().split('\n')
      : [];
    const told = `the trace, in order:\n${events.join('\n')}`;
    assert.deepEqual(exits, Array(holders).fill(0), `the exits; ${told}`);
    let running = 0;
    let most = 0;
    for (const event of events) {
      running += event.startsWith('start') ? 1 : -1;
      most = Math.max(most, running);
    }
    assert.equal(events.length, 2 * holders, `the events; ${told}`);
    assert.ok(most <= 2, `${most} held the 2 slots at once; ${told}`);
    assert.equal(most, 2, `no two held the slots at once; ${told}`);
    assert.deepEqual(readdirSync(directory), [], `the tickets left; ${told}`);
  });
});

describe('task submit', () => {
  const taskText = (id, checks) =>
    [
      '---',
      `id: ${id}`,
      "title: 'A task'",
      'status: ready',
      'kind: build',
      "step: ''",
      "rfc: ''",
      'priority: 1',
      'depends-on: []',
      'writes:',
      `  - ${id}/`,
      'appends: []',
      'needs: []',
      'checks:',
      ...checks.map(check => `  - ${check}`),
      'claim:',
      '---',
      '',
      '## Context',
      '',
      'Why.',
      '',
      '## Done when',
      '',
      'It works.',
      '',
      '## Out of scope',
      '',
      'The rest.',
      '',
      '## Log',
      '',
      'No entry yet.',
      '',
    ].join('\n');

  const WORKERS = { 'T-0001': ALICE, 'T-0002': BOB };

  /** git in a directory, with the repository's configuration alone. */
  const gitIn =
    directory =>
    (...command) => {
      const result = spawnSync(
        'git',
        [
          '-C',
          directory,
          '-c',
          'user.name=A test',
          '-c',
          'user.email=test@example.invalid',
          ...command,
        ],
        {
          encoding: 'utf8',
          env: {
            ...environment('T-0001'),
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_SYSTEM: '/dev/null',
            GIT_CONFIG_NOSYSTEM: 'true',
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
    };

  /**
   * A board, `main` of a repository of its own, whose tasks are claimed
   * and logged, each by its worker, each with a change committed in its
   * tree.
   */
  function boardOf(tasks) {
    const root = join(temporary(), 'aep');
    mkdirSync(join(root, 'work/tasks'), { recursive: true });
    copyFileSync(SCHEMA, join(root, 'work/schema.json'));
    writeFileSync(join(root, '.gitignore'), 'work/claims/\nnode_modules/\n');
    for (const [id, checks] of Object.entries(tasks)) {
      writeFileSync(
        join(root, `work/tasks/${id}-a-task.md`),
        taskText(id, checks),
      );
    }
    const git = gitIn(root);
    git('init', '--quiet', '--initial-branch=main');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'The board');
    for (const id of Object.keys(tasks)) {
      for (const [command, input] of [
        ['claim', ''],
        ['log', 'Did: the work.'],
      ]) {
        const result = spawnSync(
          process.execPath,
          [TASK, command, id, '--root', root],
          { encoding: 'utf8', input, env: environment(id) },
        );
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
      }
      // A change of the task's own, committed in its tree: a build task
      // that changed none of its files is not submitted.
      const tree = join(root, '..', 'aep-trees', id);
      mkdirSync(join(tree, id), { recursive: true });
      writeFileSync(join(tree, `${id}/work.ts`), 'changed\n');
      gitIn(tree)('add', '-A');
      gitIn(tree)('commit', '--quiet', '-m', 'The work');
    }
    return root;
  }

  /** The caller's environment without its worker and its slots. */
  const environment = (id, settings = {}) => ({
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !name.startsWith('AEP_') && !name.startsWith('GIT_'),
      ),
    ),
    AEP_WORKER: WORKERS[id],
    ...settings,
  });

  /** A submit as a process, and its end: the exit code and all it wrote. */
  function submitting(root, id, settings) {
    const child = spawn(
      process.execPath,
      [TASK, 'submit', id, '--root', root],
      { env: environment(id, settings), detached: true },
    );
    let output = '';
    child.stdout.on('data', data => {
      output += data;
    });
    child.stderr.on('data', data => {
      output += data;
    });
    return {
      pid: child.pid,
      exited: new Promise(resolve => {
        child.on('exit', (status, signal) => resolve({ status, signal }));
      }),
      ended: new Promise(resolve => {
        child.on('close', (status, signal) =>
          resolve({ status, signal, output }),
        );
      }),
    };
  }

  const statusOf = (root, id) =>
    /^status: (.*)$/m.exec(
      readFileSync(join(root, `work/tasks/${id}-a-task.md`), 'utf8'),
    )[1];

  async function until(condition, what) {
    const started = Date.now();
    while (!condition()) {
      assert.ok(Date.now() - started < 30_000, `waited 30 s for ${what}`);
      await new Promise(resolve => {
        setTimeout(resolve, 20);
      });
    }
  }

  /**
   * A heavy check that writes when it starts and ends into a file outside
   * the board, and lasts between the two.
   */
  const traced = (trace, id, seconds = 1) =>
    `echo start ${id} >> ${trace}; sleep ${seconds}; echo end ${id} >> ${trace}; true e2e`;

  test('two submits at once run their heavy checks one after the other on one slot', async () => {
    const trace = join(temporary(), 'trace');
    const root = boardOf({
      'T-0001': [traced(trace, 'T-0001')],
      'T-0002': [traced(trace, 'T-0002')],
    });
    const settings = { AEP_CHECK_SLOTS: '1' };
    const first = submitting(root, 'T-0001', settings);
    await until(() => existsSync(trace), 'the first check to start');
    const second = submitting(root, 'T-0002', settings);
    const [one, two] = await Promise.all([first.ended, second.ended]);
    assert.equal(one.status, 0, one.output);
    assert.equal(two.status, 0, two.output);
    assert.equal(
      readFileSync(trace, 'utf8'),
      'start T-0001\nend T-0001\nstart T-0002\nend T-0002\n',
    );
    assert.doesNotMatch(one.output, /slot/);
    assert.match(
      two.output,
      new RegExp(
        'task: `[^`]+` waits for a slot \\(\\d+ s so far\\): this machine runs 1 ' +
          'heavy check\\(s\\) at once \\(AEP_CHECK_SLOTS\\), and 1 are before it:\\n' +
          `  runs: ${ALICE}, T-0001, \`[^\`]+\`, there for \\d+ s \\(process ${first.pid}\\)\\n`,
      ),
    );
    assert.match(two.output, /task: `[^`]+` has a slot, after \d+ s\n/);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    assert.equal(statusOf(root, 'T-0002'), 'review');
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), []);
  });

  test('two submits at once run their heavy checks together on two slots', async () => {
    const trace = join(temporary(), 'trace');
    const root = boardOf({
      'T-0001': [traced(trace, 'T-0001', 5)],
      'T-0002': [traced(trace, 'T-0002', 0)],
    });
    const settings = { AEP_CHECK_SLOTS: '2' };
    const first = submitting(root, 'T-0001', settings);
    await until(() => existsSync(trace), 'the first check to start');
    const second = submitting(root, 'T-0002', settings);
    const [one, two] = await Promise.all([first.ended, second.ended]);
    assert.equal(one.status, 0, one.output);
    assert.equal(two.status, 0, two.output);
    assert.doesNotMatch(`${one.output}${two.output}`, /slot/);
    assert.match(
      readFileSync(trace, 'utf8'),
      /^start T-0001\nstart T-0002\nend T-0002\nend T-0001\n$/,
    );
  });

  test('a slot left by a killed submit is free once the check it started has ended', async () => {
    const started = join(temporary(), 'started');
    const seen = join(temporary(), 'seen');
    // The check tells the pid of what it runs once that is running; the
    // next check tells whether that still runs when it starts.
    const root = boardOf({
      'T-0001': [`sleep 600 & echo $! >> ${started}; wait; true e2e`],
      'T-0002': [
        `if kill -0 $(cat ${started}) 2>/dev/null; then echo runs >> ${seen}; ` +
          `else echo ended >> ${seen}; fi; true e2e`,
      ],
    });
    const settings = { AEP_CHECK_SLOTS: '1' };
    const killed = submitting(root, 'T-0001', settings);
    await until(
      () => existsSync(started) && readFileSync(started, 'utf8').endsWith('\n'),
      'the check to start',
    );
    const check = Number(readFileSync(started, 'utf8'));
    processes.push(check);
    // The submit and the process that runs its check, which are in the
    // submit's process group, and not the check, which has its own.
    process.kill(-killed.pid, 'SIGKILL');
    assert.equal((await killed.exited).signal, 'SIGKILL');
    assert.deepEqual(
      readdirSync(join(root, SLOTS_DIRECTORY)).filter(name =>
        name.endsWith('.json'),
      ),
      ['000001.json'],
    );
    process.kill(check, 0);

    const next = await submitting(root, 'T-0002', settings).ended;
    assert.equal(next.status, 0, next.output);
    assert.match(
      next.output,
      new RegExp(
        `task: the process ${killed.pid} of ${ALICE}, T-0001, \`[^\`]+\` is gone, ` +
          'and its command still runs \\(process group \\d+\\): it is sent SIGTERM, ' +
          'and SIGKILL after 10 s; its slot is free once it has ended\\n',
      ),
    );
    assert.match(
      next.output,
      new RegExp(
        `task: the slot of ${ALICE}, T-0001, \`[^\`]+\` is free: its process ${killed.pid} is gone\\n`,
      ),
    );
    assert.equal(readFileSync(seen, 'utf8'), 'ended\n');
    assert.throws(() => process.kill(check, 0), { code: 'ESRCH' });
    assert.equal(statusOf(root, 'T-0002'), 'review');
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), []);
  });

  test("a terminal's Ctrl-C during a submit gives its heavy check its graceful end, and its slot is held until then", async () => {
    const told = join(temporary(), 'told');
    // The check takes SIGINT as a check that shuts down gracefully does,
    // and records a SIGTERM, which would cut that short.
    const root = boardOf({
      'T-0001': [
        `trap "echo term >> ${told}" TERM; ` +
          `trap "echo int >> ${told}; sleep 2; echo done >> ${told}; exit 0" INT; ` +
          `echo $$ >> ${told}.pid; echo ready >> ${told}; i=0; while [ $i -lt 600 ]; do sleep 1; i=$((i+1)); done; true e2e`,
      ],
    });
    const killed = submitting(root, 'T-0001', { AEP_CHECK_SLOTS: '1' });
    await until(() => existsSync(told), 'the check to start');
    // The check leads its own group: recorded, so that it is ended with
    // this test whatever happens.
    processes.push(-Number(readFileSync(`${told}.pid`, 'utf8')));
    // The submit and the process that runs its check, in the submit's
    // process group, as a terminal's Ctrl-C reaches them.
    process.kill(-killed.pid, 'SIGINT');
    assert.equal((await killed.exited).signal, 'SIGINT');
    const said = [];
    withSlot(
      {
        directory: join(root, SLOTS_DIRECTORY),
        holder: { worker: BOB, task: 'T-0002', command: 'yarn e2e' },
        slots: 1,
        waitMs: 30_000,
        pollMs: 20,
        graceMs: 100,
        say: message => said.push(message),
      },
      () => {},
    );
    assert.equal(readFileSync(told, 'utf8'), 'ready\nint\ndone\n');
    assert.doesNotMatch(said.join('\n'), /SIGTERM/);
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), []);
  });

  test('light checks run without a slot, while every slot is held', async () => {
    const root = boardOf({ 'T-0001': ['exit 0', 'true prettier:check'] });
    const held = ticket(join(root, SLOTS_DIRECTORY), 1, { pid: process.pid });
    const { status, output } = await submitting(root, 'T-0001', {
      AEP_CHECK_SLOTS: '1',
      AEP_CHECK_SLOT_WAIT_MINUTES: '0.005',
    }).ended;
    assert.equal(status, 0, output);
    assert.doesNotMatch(output, /slot/);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    assert.ok(existsSync(held));
  });

  test('a submit of light checks alone writes no ticket', async () => {
    const root = boardOf({ 'T-0001': ['exit 0'] });
    const { status, output } = await submitting(root, 'T-0001').ended;
    assert.equal(status, 0, output);
    assert.equal(existsSync(join(root, SLOTS_DIRECTORY)), false);
  });

  test('a heavy check that gets no slot within the bound refuses the submit, naming the holder', async () => {
    const ran = join(temporary(), 'ran');
    const root = boardOf({ 'T-0001': [`echo ran >> ${ran}; true e2e`] });
    ticket(join(root, SLOTS_DIRECTORY), 1, { pid: process.pid });
    const { status, output } = await submitting(root, 'T-0001', {
      AEP_CHECK_SLOTS: '1',
      AEP_CHECK_SLOT_WAIT_MINUTES: '0.005',
    }).ended;
    assert.equal(status, 1, output);
    assert.match(
      output,
      new RegExp(
        'task: T-0001 is not submitted: `[^`]+` got no slot of the machine in ' +
          '0 s \\(AEP_CHECK_SLOT_WAIT_MINUTES\\): 1 heavy check\\(s\\) are still before it:\\n' +
          `  runs: ${BOB}, T-0009, \`yarn platform:check\`, there for \\d+ s \\(process ${process.pid}\\)\\n`,
      ),
    );
    assert.equal(existsSync(ran), false);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), ['000001.json']);
  });

  test('a setting that cannot be read refuses the submit before any check runs', async () => {
    const ran = join(temporary(), 'ran');
    const root = boardOf({
      'T-0001': [`echo ran >> ${ran}`, 'true e2e'],
    });
    const { status, output } = await submitting(root, 'T-0001', {
      AEP_CHECK_SLOTS: 'many',
    }).ended;
    assert.equal(status, 1, output);
    assert.match(
      output,
      /task: T-0001 is not submitted: AEP_CHECK_SLOTS is "many"/,
    );
    assert.equal(existsSync(ran), false);
  });

  test('a heavy check is told the workers of its slot, a light one is not', async () => {
    const told = join(temporary(), 'told');
    const root = boardOf({
      'T-0001': [
        `echo light=$${WORKERS_VARIABLE} >> ${told}`,
        `echo heavy=$${WORKERS_VARIABLE} >> ${told}; true e2e`,
      ],
    });
    const { status, output } = await submitting(root, 'T-0001', {
      AEP_CHECK_SLOTS: '1',
    }).ended;
    assert.equal(status, 0, output);
    const { workers } = shareOfTheMachine({ AEP_CHECK_SLOTS: '1' });
    assert.equal(readFileSync(told, 'utf8'), `light=\nheavy=${workers}\n`);
  });

  test('heavy checks that run at once have port offsets of their own, off the sign-in port', async () => {
    const told = join(temporary(), 'told');
    const telling = (file, id) =>
      `echo ${id}=$${PORT_OFFSET_VARIABLE} >> ${file}; sleep 2; true e2e`;
    const root = boardOf({
      'T-0001': [
        telling(told, 'T-0001'),
        `echo light=$${PORT_OFFSET_VARIABLE} >> ${told}`,
      ],
      'T-0002': [telling(told, 'T-0002')],
    });
    const settings = { AEP_CHECK_SLOTS: '2', [PORT_OFFSET_VARIABLE]: '' };
    const first = submitting(root, 'T-0001', settings);
    await until(() => existsSync(told), 'the first check to start');
    const second = submitting(root, 'T-0002', settings);
    const [one, two] = await Promise.all([first.ended, second.ended]);
    assert.equal(one.status, 0, one.output);
    assert.equal(two.status, 0, two.output);
    const offsets = Object.fromEntries(
      readFileSync(told, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('=')),
    );
    assert.equal(offsets.light, '');
    assert.deepEqual([offsets['T-0001'], offsets['T-0002']].toSorted(), [
      portOffsetOfSeat(0),
      portOffsetOfSeat(1),
    ]);
    for (const offset of [offsets['T-0001'], offsets['T-0002']]) {
      assert.notEqual(4173 + Number(offset), 5173);
      assert.notEqual(7199 + Number(offset), 5173);
    }
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), []);

    const keptTold = join(temporary(), 'told');
    const named = boardOf({ 'T-0001': [telling(keptTold, 'named')] });
    const kept = await submitting(named, 'T-0001', {
      AEP_CHECK_SLOTS: '2',
      [PORT_OFFSET_VARIABLE]: '40',
    }).ended;
    assert.equal(kept.status, 0, kept.output);
    assert.equal(readFileSync(keptTold, 'utf8'), 'named=40\n');
  });

  test('a check runs as in CI: one that watches unless CI is set, or reads its input, ends', async () => {
    const scripts = temporary();
    const watching = join(scripts, 'watching.mjs');
    writeFileSync(
      watching,
      "if (process.env.CI !== 'true') setInterval(() => {}, 1000);\n",
    );
    const root = boardOf({
      'T-0001': [
        `node ${watching}`,
        'cat >/dev/null',
        `node ${watching}; true e2e`,
      ],
    });
    // The submit's own input is a pipe that stays open, and its CI empty.
    const { status, output } = await submitting(root, 'T-0001', {
      CI: '',
      [CHECK_TIMEOUT_VARIABLE]: '0.25',
      AEP_CHECK_SLOTS: '1',
    }).ended;
    assert.equal(status, 0, output);
    assert.equal(output.match(/^- `[^`]+`: pass, \d+ s$/gm)?.length, 3, output);
    assert.equal(statusOf(root, 'T-0001'), 'review');
  });

  test('a check past its bound is ended with its group, said so, and frees its slot', async () => {
    const started = join(temporary(), 'started');
    const next = join(temporary(), 'next');
    const root = boardOf({
      'T-0001': [
        `sleep 600 & echo $! >> ${started}; wait; true e2e`,
        // Deaf to SIGTERM, as is the sleep it starts: it ends by SIGKILL.
        `trap '' TERM; sleep 600 & echo $! >> ${started}; wait`,
        `echo ran >> ${next}`,
      ],
    });
    const { status, output } = await submitting(root, 'T-0001', {
      [CHECK_TIMEOUT_VARIABLE]: '0.02',
      AEP_CHECK_SLOTS: '1',
    }).ended;
    assert.equal(status, 1, output);
    assert.equal(
      output.match(/^- `[^`]+`: FAIL \(timed out after 0\.02 min\), \d+ s$/gm)
        ?.length,
      2,
      output,
    );
    assert.match(output, /T-0001 is not submitted: 2 check\(s\) fail/);
    const pids = readFileSync(started, 'utf8').trim().split('\n').map(Number);
    processes.push(...pids);
    assert.equal(pids.length, 2);
    for (const pid of pids) {
      assert.equal(isRunning(pid), false, `the check's sleep ${pid} runs`);
    }
    assert.equal(readFileSync(next, 'utf8'), 'ran\n');
    assert.deepEqual(readdirSync(join(root, SLOTS_DIRECTORY)), []);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
  });

  test('a bound that cannot be read refuses the submit before any check runs', async () => {
    const ran = join(temporary(), 'ran');
    const root = boardOf({ 'T-0001': [`echo ran >> ${ran}`] });
    const { status, output } = await submitting(root, 'T-0001', {
      [CHECK_TIMEOUT_VARIABLE]: 'soon',
    }).ended;
    assert.equal(status, 1, output);
    assert.match(
      output,
      /task: T-0001 is not submitted: AEP_CHECK_TIMEOUT_MINUTES is "soon"/,
    );
    assert.equal(existsSync(ran), false);
  });
});

describe('task run', () => {
  /** A checkout with the board's schema, where the run's tickets go. */
  function checkout() {
    const root = temporary();
    mkdirSync(join(root, 'work'), { recursive: true });
    copyFileSync(SCHEMA, join(root, 'work/schema.json'));
    return root;
  }

  /**
   * A run as a process, by ALICE, of `script` in a shell; `detached`, in
   * a process group of its own, as a terminal starts a job.
   */
  function running(root, script, settings = {}, { detached = false } = {}) {
    const child = spawn(
      process.execPath,
      [TASK, 'run', 'T-0001', '--root', root, '--', 'sh', '-c', script],
      {
        detached,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) => !name.startsWith('AEP_'),
            ),
          ),
          AEP_WORKER: ALICE,
          ...settings,
        },
      },
    );
    processes.push(child.pid);
    let output = '';
    child.stdout.on('data', data => {
      output += data;
    });
    child.stderr.on('data', data => {
      output += data;
    });
    return {
      child,
      output: () => output,
      exited: new Promise(resolve => {
        child.on('exit', (status, signal) => resolve({ status, signal }));
      }),
      ended: new Promise(resolve => {
        child.on('close', (status, signal) =>
          resolve({ status, signal, output }),
        );
      }),
    };
  }

  async function until(condition, what) {
    const started = Date.now();
    while (!condition()) {
      assert.ok(Date.now() - started < 30_000, `waited 30 s for ${what}`);
      await new Promise(resolve => {
        setTimeout(resolve, 20);
      });
    }
  }

  /** The tickets, not the marks of their commands beside them. */
  const slotsOf = root =>
    readdirSync(join(root, SLOTS_DIRECTORY)).filter(name =>
      name.endsWith('.json'),
    );

  test('leaves CI as the worker has it, for a command that watches', async () => {
    const root = checkout();
    const told = join(temporary(), 'told');
    const { status, output } = await running(root, `echo "CI=$CI" >> ${told}`, {
      CI: '',
    }).ended;
    assert.equal(status, 0, output);
    assert.equal(readFileSync(told, 'utf8'), 'CI=\n');
  });

  test('two heavy runs at once on one slot run one after the other', async () => {
    const root = checkout();
    const trace = join(temporary(), 'trace');
    const traced = name =>
      `echo start ${name} >> ${trace}; sleep 1; echo end ${name} >> ${trace}; true e2e`;
    const settings = { AEP_CHECK_SLOTS: '1' };
    const first = running(root, traced('one'), settings);
    await until(() => existsSync(trace), 'the first run to start');
    const second = running(root, traced('two'), settings);
    const [one, two] = await Promise.all([first.ended, second.ended]);
    assert.equal(one.status, 0, one.output);
    assert.equal(two.status, 0, two.output);
    assert.equal(
      readFileSync(trace, 'utf8'),
      'start one\nend one\nstart two\nend two\n',
    );
    assert.doesNotMatch(one.output, /slot/);
    assert.match(
      two.output,
      new RegExp(
        'task: `sh -c [^`]+` waits for a slot \\(\\d+ s so far\\): this machine ' +
          'runs 1 heavy check\\(s\\) at once \\(AEP_CHECK_SLOTS\\), and 1 are before it:\\n' +
          `  runs: ${ALICE}, T-0001, \`sh -c [^\`]+\`, there for \\d+ s \\(process ${first.child.pid}\\)\\n`,
      ),
    );
    assert.match(two.output, /task: `sh -c [^`]+` has a slot, after \d+ s\n/);
    assert.deepEqual(slotsOf(root), []);
  });

  test('a heavy run waits behind a submit, in the one queue', async () => {
    const root = checkout();
    ticket(join(root, SLOTS_DIRECTORY), 1, { pid: process.pid });
    const { status, output } = await running(root, 'true e2e', {
      AEP_CHECK_SLOTS: '1',
      AEP_CHECK_SLOT_WAIT_MINUTES: '0.005',
    }).ended;
    assert.equal(status, 1, output);
    assert.match(
      output,
      new RegExp(
        'task: `sh -c true e2e` did not run: `sh -c true e2e` got no slot of the machine in ' +
          '0 s \\(AEP_CHECK_SLOT_WAIT_MINUTES\\): 1 heavy check\\(s\\) are still before it:\\n' +
          `  runs: ${BOB}, T-0009, \`yarn platform:check\`, there for \\d+ s \\(process ${process.pid}\\)\\n`,
      ),
    );
    assert.deepEqual(slotsOf(root), ['000001.json']);
  });

  test('a light run takes no slot, while every slot is held, and ends as its command', async () => {
    const root = checkout();
    const held = ticket(join(root, SLOTS_DIRECTORY), 1, { pid: process.pid });
    const { status, output } = await running(
      root,
      `echo workers=$${WORKERS_VARIABLE}; exit 3`,
      { AEP_CHECK_SLOTS: '1', AEP_CHECK_SLOT_WAIT_MINUTES: '0.005' },
    ).ended;
    assert.equal(status, 3, output);
    assert.equal(output, 'workers=\n');
    assert.deepEqual(slotsOf(root), ['000001.json']);
    assert.ok(existsSync(held));
  });

  test('a heavy run is told the workers of its slot and ends as its command', async () => {
    const root = checkout();
    const { status, output } = await running(
      root,
      `echo workers=$${WORKERS_VARIABLE}; exit 4; true e2e`,
      { AEP_CHECK_SLOTS: '1' },
    ).ended;
    const { workers } = shareOfTheMachine({ AEP_CHECK_SLOTS: '1' });
    assert.equal(status, 4, output);
    assert.equal(output, `workers=${workers}\n`);
    assert.deepEqual(slotsOf(root), []);
  });

  test('a run interrupted while its command runs passes the signal on and leaves no ticket', async () => {
    const root = checkout();
    const told = join(temporary(), 'told');
    const run = running(
      root,
      `sleep 600 & held=$!; trap "kill $held; echo interrupted >> ${told}; exit 130" INT; ` +
        `echo started >> ${told}; wait; true e2e`,
      { AEP_CHECK_SLOTS: '1' },
    );
    await until(() => existsSync(told), 'the command to start');
    assert.equal(slotsOf(root).length, 1);
    run.child.kill('SIGINT');
    const { status, output } = await run.ended;
    // The command took the signal and chose its exit, which is the run's.
    assert.equal(status, 130, output);
    assert.equal(readFileSync(told, 'utf8'), 'started\ninterrupted\n');
    assert.deepEqual(slotsOf(root), []);
  });

  test('a run whose command a signal ends is ended by the same signal', async () => {
    const root = checkout();
    const started = join(temporary(), 'started');
    const run = running(root, `echo >> ${started}; exec sleep 600 # e2e`, {
      AEP_CHECK_SLOTS: '1',
    });
    await until(() => existsSync(started), 'the command to start');
    run.child.kill('SIGINT');
    const { signal, output } = await run.ended;
    assert.equal(signal, 'SIGINT', output);
    assert.deepEqual(slotsOf(root), []);
  });

  test("a terminal's Ctrl-C, to the run's process group, reaches the command once", async () => {
    // A command that counts the SIGINTs it receives, each as it comes.
    const counter = join(temporary(), 'counter.cjs');
    writeFileSync(
      counter,
      "const { appendFileSync } = require('node:fs');\n" +
        'const told = process.argv[2];\n' +
        "process.on('SIGINT', () => appendFileSync(told, 'interrupted\\n'));\n" +
        "appendFileSync(told, 'started\\n');\n" +
        'setInterval(() => {}, 1000);\n',
    );
    for (const script of ['', ' # e2e']) {
      const root = checkout();
      const told = join(temporary(), 'told');
      const run = running(
        root,
        `exec "${process.execPath}" ${counter} ${told}${script}`,
        { AEP_CHECK_SLOTS: '1' },
        { detached: true },
      );
      await until(() => existsSync(told), 'the command to start');
      process.kill(-run.child.pid, 'SIGINT');
      await until(
        () => readFileSync(told, 'utf8').includes('interrupted'),
        'the command to take the signal',
      );
      await new Promise(resolve => {
        setTimeout(resolve, 500);
      });
      run.child.kill('SIGTERM');
      const { signal, output } = await run.ended;
      assert.equal(signal, 'SIGTERM', output);
      assert.equal(readFileSync(told, 'utf8'), 'started\ninterrupted\n');
      assert.equal(
        existsSync(join(root, SLOTS_DIRECTORY)) && slotsOf(root).length,
        script === '' ? false : 0,
      );
    }
  });

  test('a run killed while its command runs leaves its slot taken until the command has ended', async () => {
    const root = checkout();
    const started = join(temporary(), 'started');
    const seen = join(temporary(), 'seen');
    const settings = { AEP_CHECK_SLOTS: '1' };
    const killed = running(
      root,
      `sleep 600 & echo $! >> ${started}; wait; true e2e`,
      settings,
    );
    await until(
      () => existsSync(started) && readFileSync(started, 'utf8').endsWith('\n'),
      'the command to start',
    );
    const command = Number(readFileSync(started, 'utf8'));
    processes.push(command);
    killed.child.kill('SIGKILL');
    // Its output stays open while the command it started runs.
    assert.equal((await killed.exited).signal, 'SIGKILL');
    assert.ok(isRunning(command));
    assert.deepEqual(slotsOf(root), ['000001.json']);

    const next = await running(
      root,
      `if kill -0 ${command} 2>/dev/null; then echo runs >> ${seen}; ` +
        `else echo ended >> ${seen}; fi; true e2e`,
      settings,
    ).ended;
    assert.equal(next.status, 0, next.output);
    assert.match(
      next.output,
      new RegExp(
        `task: the process ${killed.child.pid} of ${ALICE}, T-0001, \`sh -c [^\`]+\` is gone, ` +
          'and its command still runs \\(process group \\d+\\): it is sent SIGTERM',
      ),
    );
    assert.match(next.output, /task: `sh -c [^`]+` has a slot, after \d+ s\n/);
    assert.equal(readFileSync(seen, 'utf8'), 'ended\n');
    assert.equal(isRunning(command), false);
    assert.deepEqual(slotsOf(root), []);
  });

  test('a run ended while it waits for its slot starts nothing and leaves no ticket', async () => {
    const root = checkout();
    const ran = join(temporary(), 'ran');
    ticket(join(root, SLOTS_DIRECTORY), 1, { pid: process.pid });
    const run = running(root, `echo ran >> ${ran}; true e2e`, {
      AEP_CHECK_SLOTS: '1',
    });
    await until(() => /waits for a slot/.test(run.output()), 'the wait');
    assert.deepEqual(slotsOf(root), ['000001.json', '000002.json']);
    run.child.kill('SIGTERM');
    const { signal, output } = await run.ended;
    assert.equal(signal, 'SIGTERM', output);
    assert.equal(existsSync(ran), false);
    assert.deepEqual(slotsOf(root), ['000001.json']);
  });

  test('a run without a command is refused, and no other subcommand takes one', () => {
    const root = checkout();
    for (const argv of [
      ['run', '--root', root],
      ['run', '--root', root, '--'],
    ]) {
      const result = spawnSync(process.execPath, [TASK, ...argv], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /task: run needs the command after --/);
    }
    const other = spawnSync(
      process.execPath,
      [TASK, 'board', '--root', root, '--', 'true'],
      { encoding: 'utf8' },
    );
    assert.equal(other.status, 2, other.stderr);
  });
});

describe('the end-to-end suite', () => {
  const installed = (() => {
    try {
      createRequire(join(WEB, 'package.json')).resolve('@playwright/test');
      return true;
    } catch {
      return false;
    }
  })();

  /** The `workers` of the suite's configuration, read in a run of its own. */
  function workersWith(settings) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const { default: config } = await import('./playwright.config.ts');" +
          "console.log(JSON.stringify({ workers: config.workers ?? 'its own' }));",
      ],
      {
        cwd: WEB,
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) => name !== WORKERS_VARIABLE,
            ),
          ),
          ...settings,
        },
      },
    );
    return result.status === 0
      ? JSON.parse(result.stdout.trim().split('\n').at(-1)).workers
      : result.stderr;
  }

  test(
    'starts the workers its slot allows, and its own number without a slot',
    { skip: installed ? false : 'needs the installed @playwright/test' },
    () => {
      assert.equal(workersWith({ [WORKERS_VARIABLE]: '3' }), 3);
      assert.equal(workersWith({}), 'its own');
      assert.match(
        workersWith({ [WORKERS_VARIABLE]: 'some' }),
        /AEP_CHECK_WORKERS is "some", which is not a whole number of at least 1/,
      );
    },
  );
});

describe('the tests of the new tree', () => {
  const installed = [ROOT, WEB].every(directory =>
    existsSync(join(directory, 'node_modules', 'vitest', 'package.json')),
  );

  /**
   * A test file that runs until `EXPECTED` have started and a moment
   * longer, and records how many run then.
   */
  const heldTest = root => `
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'vitest';

test('runs beside the others', { timeout: 60_000 }, async () => {
  const root = ${JSON.stringify(root)};
  writeFileSync(root + '/running/' + process.pid, '');
  appendFileSync(root + '/started', process.pid + '\\n');
  const expected = Number(process.env.EXPECTED);
  const started = () => readFileSync(root + '/started', 'utf8').trim().split('\\n').length;
  for (const until = Date.now() + 20_000; started() < expected && Date.now() < until; ) {
    await delay(20);
  }
  await delay(700);
  appendFileSync(root + '/seen', readdirSync(root + '/running').length + '\\n');
  rmSync(root + '/running/' + process.pid);
});
`;

  /**
   * A checkout with the root's configuration and the installed Vitest, and
   * how a test writes its files and gives a package a Vitest of its own.
   */
  function checkoutOfTests() {
    const root = realpathSync(temporary());
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    const install = (into, from, name) => {
      mkdirSync(join(root, into, 'node_modules'), { recursive: true });
      symlinkSync(
        realpathSync(join(from, 'node_modules', name)),
        join(root, into, 'node_modules', name),
      );
    };
    const addPackage = directory =>
      write(
        `${directory}/package.json`,
        JSON.stringify({
          name: `@aep/${basename(directory)}`,
          version: '0.0.0',
          type: 'module',
        }),
      );
    install('.', ROOT, 'vitest');
    install('.', ROOT, 'vite');
    for (const path of ['vitest.config.mts', 'scripts/lib/newTree.mjs']) {
      write(path, readFileSync(join(ROOT, path)));
    }
    write('package.json', '{ "type": "module" }');
    write(
      'modules/platform/src/testing/globalSetup.ts',
      'export default () => {};\n',
    );
    return { root, write, install, addPackage };
  }

  /**
   * A checkout of three packages, one of them with a Vitest of its own as
   * apps/web has, so that its tests run in the pool of that Vitest. Each
   * package has two test files.
   */
  function treeOfTests() {
    const { root, write, install, addPackage } = checkoutOfTests();
    install('apps/three', WEB, 'vitest');
    for (const directory of ['modules/one', 'modules/two', 'apps/three']) {
      addPackage(directory);
      for (const file of ['a', 'b']) {
        write(`${directory}/src/${file}.test.ts`, heldTest(root));
      }
    }
    return root;
  }

  /**
   * A run of the root's configuration in a tree of its own: how many
   * processes ran a test file, and the most that ran one at once.
   */
  function runOfTests(expected, settings, words = []) {
    const root = treeOfTests();
    mkdirSync(join(root, 'running'));
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...words],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) =>
                name !== WORKERS_VARIABLE && !name.startsWith('VITEST'),
            ),
          ),
          EXPECTED: String(expected),
          ...settings,
        },
      },
    );
    if (result.status !== 0) {
      return `${result.stdout}${result.stderr}`;
    }
    const lines = name =>
      readFileSync(join(root, name), 'utf8').trim().split('\n');
    return {
      processes: new Set(lines('started')).size,
      atOnce: Math.max(...lines('seen').map(Number)),
    };
  }

  const needsVitest = {
    skip: installed ? false : 'needs the installed Vitest',
  };

  test(
    'start no more workers than the slot allows, over every project',
    needsVitest,
    () => {
      assert.deepEqual(runOfTests(2, { [WORKERS_VARIABLE]: '2' }), {
        processes: 6,
        atOnce: 2,
      });
    },
  );

  test(
    'start no more than the slot allows when the command asks for more',
    needsVitest,
    () => {
      assert.deepEqual(
        runOfTests(2, { [WORKERS_VARIABLE]: '2' }, ['--maxWorkers=4']),
        { processes: 6, atOnce: 2 },
      );
    },
  );

  test('start fewer when the command asks for fewer', needsVitest, () => {
    assert.deepEqual(
      runOfTests(1, { [WORKERS_VARIABLE]: '2' }, ['--maxWorkers=1']),
      { processes: 6, atOnce: 1 },
    );
  });

  test('start what the command asks for without a slot', needsVitest, () => {
    assert.deepEqual(runOfTests(4, {}, ['--maxWorkers=4']), {
      processes: 6,
      atOnce: 4,
    });
  });

  test('are refused a share that is no number of workers', needsVitest, () => {
    for (const named of ['some', '0', '1.5']) {
      assert.match(
        runOfTests(1, { [WORKERS_VARIABLE]: named }),
        new RegExp(
          `AEP_CHECK_WORKERS is "${named}", which is not a whole number of at least 1`,
        ),
      );
    }
  });

  /** The files Vitest takes as a directory's configuration, in its order. */
  async function vitestConfigurationFiles() {
    const chunks = join(ROOT, 'node_modules', 'vitest', 'dist', 'chunks');
    for (const file of readdirSync(chunks).filter(name =>
      /^constants\..*\.js$/.test(name),
    )) {
      const lists = Object.values(await import(join(chunks, file))).filter(
        value => Array.isArray(value) && value.includes('vitest.config.ts'),
      );
      if (lists.length === 1) {
        return lists[0];
      }
    }
    throw new Error(`no list of configuration files in ${chunks}`);
  }

  /**
   * A run of the root's configuration over one package whose
   * configuration is in `file` and names two test files that Vitest does
   * not find by itself, beside one it does.
   */
  function runWithConfiguration(file) {
    const { root, write, addPackage } = checkoutOfTests();
    addPackage('modules/one');
    write(
      `modules/one/${file}`,
      /\.c[jt]s$/.test(file)
        ? "module.exports = { test: { include: ['src/**/*.check.ts'] } };\n"
        : "export default { test: { include: ['src/**/*.check.ts'] } };\n",
    );
    const passing = "import { test } from 'vitest';\ntest('runs', () => {});\n";
    for (const name of ['a.check.ts', 'b.check.ts', 'c.test.ts']) {
      write(`modules/one/src/${name}`, passing);
    }
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/vitest/vitest.mjs'), 'run'],
      {
        cwd: root,
        encoding: 'utf8',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => name !== WORKERS_VARIABLE && !name.startsWith('VITEST'),
          ),
        ),
      },
    );
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  }

  test(
    "take a package's configuration by its one name and refuse every other name Vitest reads",
    needsVitest,
    async () => {
      const files = await vitestConfigurationFiles();
      assert.ok(files.length > 1, String(files));
      for (const file of files) {
        const { status, output } = runWithConfiguration(file);
        if (file === 'vitest.config.ts') {
          assert.equal(status, 0, output);
          assert.match(output, /Test Files {2}2 passed \(2\)/, output);
        } else {
          assert.notEqual(status, 0, `${file}: ${output}`);
          assert.match(
            output,
            new RegExp(
              `@aep/one keeps its Vitest configuration in modules/one/${file.replaceAll('.', '\\.')}, which the root run does not read`,
            ),
            `${file}: ${output}`,
          );
        }
      }
    },
  );
});
