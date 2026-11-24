/**
 * The tests of the git of the task board (scripts/lib/worktrees.mjs), each
 * in a repository of its own in a temporary directory. The command's steps
 * built on it are tested in scripts/task.test.mjs, "trees".
 *
 * Usage: node --test scripts/lib/worktrees.test.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

import {
  checkoutOf,
  makeTree,
  removeTree,
  treeRecordOf,
  TreeRefusal,
  unclean,
  withLandingLock,
} from './worktrees.mjs';

const roots = [];
after(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** git in a directory, configured by the repository alone. */
const gitIn =
  cwd =>
  (...command) => {
    const result = spawnSync(
      'git',
      [
        '-C',
        cwd,
        '-c',
        'user.name=A test',
        '-c',
        'user.email=test@example.invalid',
        ...command,
      ],
      {
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) => !name.startsWith('GIT_'),
            ),
          ),
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_CONFIG_NOSYSTEM: 'true',
        },
      },
    );
    assert.equal(
      result.status,
      0,
      `git ${command.join(' ')}: ${result.stderr}`,
    );
    return result.stdout.trim();
  };

/** A repository `<parent>/aep` whose `main` has one commit. */
function repository() {
  const parent = mkdtempSync(join(tmpdir(), 'aep-worktrees-'));
  roots.push(parent);
  const root = join(parent, 'aep');
  mkdirSync(root);
  writeFileSync(join(root, 'a'), 'a\n');
  writeFileSync(join(root, '.gitignore'), 'ignored/\n');
  const git = gitIn(root);
  git('init', '--quiet', '--initial-branch=main');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'First');
  return { root, parent, git };
}

describe('the board of a checkout', () => {
  test('is the checkout itself when it is the main worktree or no checkout', () => {
    const { root } = repository();
    assert.deepEqual(checkoutOf(root), { board: root, linked: false });
    const plain = mkdtempSync(join(tmpdir(), 'aep-worktrees-plain-'));
    roots.push(plain);
    assert.deepEqual(checkoutOf(plain), { board: plain, linked: false });
  });

  test('is the main worktree, from a linked one', () => {
    const { root, parent, git } = repository();
    const linked = join(parent, 'linked');
    git('worktree', 'add', '--quiet', '-b', 'other', linked);
    const { board, linked: isLinked } = checkoutOf(linked);
    assert.equal(isLinked, true);
    assert.equal(realpathSync(board), realpathSync(root));
  });
});

describe('a tree', () => {
  test('is made from the head of main on its own branch, and refused where main has no commit', () => {
    const { root, parent, git } = repository();
    const record = makeTree(root, 'T-0001');
    assert.equal(record.tree, join(parent, 'aep-trees', 'T-0001'));
    assert.equal(record.base, git('rev-parse', 'main'));
    assert.equal(
      gitIn(record.tree)('symbolic-ref', 'HEAD'),
      'refs/heads/task/T-0001',
    );
    const empty = mkdtempSync(join(tmpdir(), 'aep-worktrees-empty-'));
    roots.push(empty);
    gitIn(empty)('init', '--quiet', '--initial-branch=main');
    assert.throws(() => makeTree(empty, 'T-0001'), TreeRefusal);
  });

  test('is unclean by its untracked and changed files, both paths of a rename, and not by ignored ones', () => {
    const { root } = repository();
    const { tree } = makeTree(root, 'T-0001');
    const git = gitIn(tree);
    mkdirSync(join(tree, 'ignored'));
    writeFileSync(join(tree, 'ignored/file'), 'x\n');
    assert.deepEqual(unclean(tree), []);
    git('mv', 'a', 'b');
    writeFileSync(join(tree, 'new'), 'x\n');
    assert.deepEqual(unclean(tree).toSorted(), ['a', 'b', 'new']);
  });

  test('is removed when clean, its branch deleted only when main holds its commits', () => {
    const { root } = repository();
    const record = makeTree(root, 'T-0001');
    const git = gitIn(record.tree);
    writeFileSync(join(record.tree, 'draft'), 'x\n');
    const left = removeTree(root, record);
    assert.equal(left.removed, false);
    assert.deepEqual(left.holding, ['draft']);
    assert.ok(existsSync(record.tree));
    git('add', '-A');
    git('commit', '--quiet', '-m', 'Draft');
    const kept = removeTree(root, record);
    assert.equal(kept.removed, false);
    assert.equal(kept.keptBranch, true);
    assert.ok(!existsSync(record.tree));
    assert.notEqual(gitIn(root)('branch', '--list', 'task/T-0001'), '');
    gitIn(root)('merge', '--quiet', '--ff-only', 'task/T-0001');
    const gone = removeTree(root, record);
    assert.equal(gone.removed, true);
    assert.equal(gitIn(root)('branch', '--list', 'task/T-0001'), '');
  });

  test('has a record the command wrote, and one it cannot read is refused', () => {
    const { root } = repository();
    assert.equal(treeRecordOf(root, 'T-0001'), undefined);
    mkdirSync(join(root, 'work/claims/T-0001'), { recursive: true });
    writeFileSync(join(root, 'work/claims/T-0001/tree'), '{"tree": "x"}\n');
    assert.throws(
      () => treeRecordOf(root, 'T-0001'),
      /is not the record of a tree \(it has no "branch"\)/,
    );
  });
});

describe('the landing lock', () => {
  test('is waited for while its process runs, up to the bound, and taken from one that is gone', () => {
    const { root } = repository();
    mkdirSync(join(root, 'work/claims'), { recursive: true });
    const lock = join(root, 'work/claims/landing.lock');
    writeFileSync(lock, `${process.pid} now\n`);
    const said = [];
    assert.throws(
      () =>
        withLandingLock(root, () => 'landed', {
          waitMs: 300,
          say: line => said.push(line),
        }),
      /another landing holds work\/claims\/landing\.lock/,
    );
    assert.match(said.join('\n'), /waits for the landing that holds/);
    const gone = spawnSync('true').pid;
    writeFileSync(lock, `${gone} then\n`);
    assert.equal(
      withLandingLock(root, () => 'landed', { waitMs: 300, say: () => {} }),
      'landed',
    );
    assert.ok(!existsSync(lock));
  });
});

describe('the landing lock, past the bound', () => {
  /** The refusal of a landing with a bound of 300 ms, and how long it took. */
  const refusalOf = root => {
    const since = Date.now();
    try {
      withLandingLock(root, () => 'landed', { waitMs: 300, say: () => {} });
    } catch (error) {
      return { message: error.message, took: Date.now() - since };
    }
    assert.fail('the landing was not refused');
  };

  test('refuses a takeover lock that a process that runs holds, naming the file and its holder', () => {
    const { root } = repository();
    mkdirSync(join(root, 'work/claims'), { recursive: true });
    const lock = join(root, 'work/claims/landing.lock');
    writeFileSync(lock, `${spawnSync('true').pid} then x\n`);
    writeFileSync(`${lock}.takeover`, `${process.pid} stopped\n`);
    const { message, took } = refusalOf(root);
    assert.match(
      message,
      new RegExp(
        `another landing holds work/claims/landing\\.lock\\.takeover \\(${process.pid} stopped\\) after`,
      ),
    );
    assert.ok(took < 3000, `refused after ${took} ms`);
  });

  for (const [what, make, why] of [
    ['that is empty', path => writeFileSync(path, ''), /it is empty/],
    [
      'that cannot be read',
      path => mkdirSync(path),
      /it cannot be read: EISDIR/,
    ],
  ]) {
    test(`names a takeover lock ${what} and how to remove it`, () => {
      const { root } = repository();
      mkdirSync(join(root, 'work/claims'), { recursive: true });
      const lock = join(root, 'work/claims/landing.lock');
      writeFileSync(lock, `${spawnSync('true').pid} then x\n`);
      make(`${lock}.takeover`);
      const { message, took } = refusalOf(root);
      assert.match(
        message,
        /^work\/claims\/landing\.lock\.takeover names no holder after \d+ s/,
      );
      assert.match(message, why);
      assert.ok(message.includes(`remove ${lock}.takeover and run`), message);
      assert.ok(took < 3000, `refused after ${took} ms`);
    });

    test(`names a landing lock ${what} and how to remove it`, () => {
      const { root } = repository();
      mkdirSync(join(root, 'work/claims'), { recursive: true });
      const lock = join(root, 'work/claims/landing.lock');
      make(lock);
      const said = [];
      const since = Date.now();
      assert.throws(
        () =>
          withLandingLock(root, () => 'landed', {
            waitMs: 300,
            say: line => said.push(line),
          }),
        error =>
          /^work\/claims\/landing\.lock names no holder after \d+ s/.test(
            error.message,
          ) &&
          why.test(error.message) &&
          error.message.includes(`remove ${lock} and run`),
      );
      assert.ok(Date.now() - since < 3000);
      assert.match(said.join('\n'), /landing\.lock \(no holder: /);
    });
  }

  test('takes a lock that was empty for the moment of its write', async () => {
    const { root } = repository();
    mkdirSync(join(root, 'work/claims'), { recursive: true });
    const lock = join(root, 'work/claims/landing.lock');
    writeFileSync(lock, '');
    const writer = spawn(process.execPath, [
      '-e',
      `setTimeout(() => require('node:fs').rmSync(${JSON.stringify(lock)}), 300)`,
    ]);
    const ended = new Promise(done => writer.on('exit', done));
    const said = [];
    assert.equal(
      withLandingLock(root, () => 'landed', {
        waitMs: 10_000,
        say: line => said.push(line),
      }),
      'landed',
    );
    assert.match(said.join('\n'), /\(no holder: it is empty\)/);
    assert.equal(await ended, 0);
  });
});

describe('the landing lock, held', () => {
  test('is this process’s while its work runs, and is removed only while it is', () => {
    const { root } = repository();
    const lock = join(root, 'work/claims/landing.lock');
    const held = withLandingLock(root, () => readFileSync(lock, 'utf8'), {
      waitMs: 300,
      say: () => {},
    });
    assert.match(held, new RegExp(`^${process.pid} \\S+ [0-9a-f-]{36}\\n$`));
    assert.ok(!existsSync(lock));
    // Another process's lock, written over this one's, is left.
    withLandingLock(root, () => writeFileSync(lock, '1 another\n'), {
      waitMs: 300,
      say: () => {},
    });
    assert.equal(readFileSync(lock, 'utf8'), '1 another\n');
  });
});

describe('the landing lock, left by a landing that was killed', () => {
  const LIBRARY = fileURLToPath(new URL('./worktrees.mjs', import.meta.url));

  test('lets one landing in at a time, however many find it at once', async () => {
    const { root, parent } = repository();
    const trace = join(parent, 'trace');
    const lander = join(parent, 'lander.mjs');
    writeFileSync(
      lander,
      `import { appendFileSync } from 'node:fs';\n` +
        `import { withLandingLock } from ${JSON.stringify(LIBRARY)};\n` +
        `withLandingLock(${JSON.stringify(root)}, () => {\n` +
        `  appendFileSync(${JSON.stringify(trace)}, 'in\\n');\n` +
        '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);\n' +
        `  appendFileSync(${JSON.stringify(trace)}, 'out\\n');\n` +
        '}, { waitMs: 60_000, say: () => {} });\n',
    );
    mkdirSync(join(root, 'work/claims'), { recursive: true });
    const lock = join(root, 'work/claims/landing.lock');
    for (let round = 0; round < 8; round++) {
      rmSync(trace, { force: true });
      writeFileSync(lock, `${spawnSync('true').pid} then x\n`);
      const ends = await Promise.all(
        Array.from(
          { length: 8 },
          () =>
            new Promise(done => {
              const child = spawn(process.execPath, [lander], {
                stdio: 'inherit',
              });
              child.on('exit', done);
            }),
        ),
      );
      assert.deepEqual(ends, Array(8).fill(0));
      let inside = 0;
      let most = 0;
      const lines = readFileSync(trace, 'utf8').trim().split('\n');
      for (const line of lines) {
        inside += line === 'in' ? 1 : -1;
        most = Math.max(most, inside);
      }
      assert.equal(lines.length, 16, `round ${round}`);
      assert.equal(most, 1, `round ${round}: ${lines.join(' ')}`);
      assert.ok(!existsSync(lock));
      assert.ok(!existsSync(`${lock}.takeover`));
    }
  });

  test('refuses a takeover lock left by a process that is gone, and names it', () => {
    const { root } = repository();
    mkdirSync(join(root, 'work/claims'), { recursive: true });
    const lock = join(root, 'work/claims/landing.lock');
    writeFileSync(lock, `${spawnSync('true').pid} then x\n`);
    writeFileSync(`${lock}.takeover`, `${spawnSync('true').pid} y\n`);
    assert.throws(
      () =>
        withLandingLock(root, () => 'landed', {
          waitMs: 60_000,
          say: () => {},
        }),
      /landing\.lock\.takeover was left by process \d+, which is gone, while it removed a landing lock: remove it/,
    );
  });
});
