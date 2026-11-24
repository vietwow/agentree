/**
 * The tests of the task command (scripts/task.mjs): each runs the command
 * as a worker does, on a board of its own in a temporary directory.
 *
 * Usage: node --test scripts/task.test.mjs
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
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { simpleCommands } from './lib/shellWords.mjs';
import {
  failuresIn,
  LINT_REPO_PARTS,
  narrowedCheck,
  narrowedRepositoryCheck,
  pathsNamedBy,
  sweepEntry,
  waitedFor,
} from './task.mjs';

const TASK = fileURLToPath(new URL('./task.mjs', import.meta.url));
const SCHEMA = fileURLToPath(new URL('../work/schema.json', import.meta.url));
const ALICE = 'cursor/model-a';
const BOB = 'claude-code/model-b';

const roots = [];
after(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const block = (key, items) =>
  items.length === 0
    ? `${key}: []`
    : [`${key}:`, ...items.map(item => `  - ${item}`)].join('\n');

/** A task file; `fields` replace the defaults, `log` is the Log's content. */
function taskText({ log = 'No entry yet.', ...fields } = {}) {
  const task = {
    id: 'T-0001',
    title: 'A task',
    status: 'ready',
    kind: 'build',
    step: '',
    rfc: '',
    priority: 1,
    'depends-on': [],
    writes: ['a/'],
    appends: [],
    needs: [],
    checks: ['exit 0'],
    claim: undefined,
    review: undefined,
    ...fields,
  };
  const claim = task.claim
    ? `claim:\n  by: ${task.claim.by}\n  since: ${task.claim.since}\n  beat: ${task.claim.beat}`
    : 'claim:';
  return [
    '---',
    `id: ${task.id}`,
    `title: '${task.title}'`,
    `status: ${task.status}`,
    `kind: ${task.kind}`,
    `step: '${task.step}'`,
    `rfc: '${task.rfc}'`,
    `priority: ${task.priority}`,
    block('depends-on', task['depends-on']),
    block('writes', task.writes),
    block('appends', task.appends),
    block('needs', task.needs),
    block('checks', task.checks),
    claim,
    ...(task.review
      ? [
          `review:\n  by: ${task.review.by}\n  since: ${task.review.since}\n  beat: ${task.review.beat}`,
        ]
      : []),
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
    log,
    '',
  ].join('\n');
}

const fileOf = id => `work/tasks/${id}-a-task.md`;

/**
 * A board holding the tasks given: `main` of a repository of its own,
 * `<directory>/aep`, with one commit of what it holds. The trees of its
 * claims are in `<directory>/aep-trees`.
 */
function boardOf(...tasks) {
  const parent = mkdtempSync(join(tmpdir(), 'aep-task-'));
  roots.push(parent);
  const root = join(parent, 'aep');
  mkdirSync(join(root, 'work/tasks'), { recursive: true });
  copyFileSync(SCHEMA, join(root, 'work/schema.json'));
  writeFileSync(join(root, '.gitignore'), 'work/claims/\nnode_modules/\n');
  for (const task of tasks) {
    writeFileSync(join(root, fileOf(task.id ?? 'T-0001')), taskText(task));
  }
  const git = gitIn(root);
  git('init', '--quiet', '--initial-branch=main');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'The board');
  return root;
}

/** Another worker's claim file of a task, written before its task file. */
function claimedBy(root, id) {
  mkdirSync(join(root, 'work/claims', id), { recursive: true });
  writeFileSync(join(root, 'work/claims', id, 'claim'), `${BOB} now\n`);
}

/** Commits what the main checkout holds, as its owner does before a claim. */
function commitBoard(root) {
  const git = gitIn(root);
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', 'The board as it is');
}

/** The tree of a task of the board at `root`. */
const treeOf = (root, id = 'T-0001') => join(dirname(root), 'aep-trees', id);

/** git in a directory, configured by the repository alone. */
function gitIn(directory) {
  return (...command) => {
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
      { encoding: 'utf8', env: environment(null) },
    );
    assert.equal(
      result.status,
      0,
      `git ${command.join(' ')}: ${result.stderr}`,
    );
    return result.stdout.trim();
  };
}

/**
 * Writes files in the tree of a task, as `name: content` or names alone,
 * and commits them there, so that a submit takes them.
 */
function commitIn(root, id, ...files) {
  const tree = treeOf(root, id);
  for (const file of files) {
    mkdirSync(dirname(join(tree, file)), { recursive: true });
    writeFileSync(join(tree, file), `${id} changed ${file}\n`);
  }
  const git = gitIn(tree);
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', `${id}'s change`);
  return git;
}

/**
 * The directory git takes as the user's ($XDG_CONFIG_HOME) in every command
 * of the tests, with an empty file for its configuration: it holds no
 * `git/ignore` and no `git/attributes`.
 */
const GIT_HOME = mkdtempSync(join(tmpdir(), 'aep-task-git-'));
roots.push(GIT_HOME);
const GIT_CONFIGURATION = join(GIT_HOME, 'config');
writeFileSync(GIT_CONFIGURATION, '');

/**
 * The environment of every process the tests start. git, run by a test or
 * by the command, is configured by the repository alone: the variables of
 * the caller that configure git are left out, the files of the user and of
 * the system are replaced by an empty one, the user's exclusions are read
 * from a directory that has none, and GIT_CONFIG_NOSYSTEM also keeps out
 * the file a distribution of git adds to the system's (git(1),
 * ENVIRONMENT; gitignore(5)).
 */
const environment = (worker, caller = process.env) => {
  const inherited = Object.fromEntries(
    Object.entries(caller).filter(
      ([name]) => name !== 'AEP_WORKER' && !name.startsWith('GIT_'),
    ),
  );
  const own = {
    ...inherited,
    XDG_CONFIG_HOME: GIT_HOME,
    GIT_CONFIG_GLOBAL: GIT_CONFIGURATION,
    GIT_CONFIG_SYSTEM: GIT_CONFIGURATION,
    GIT_CONFIG_NOSYSTEM: 'true',
  };
  return worker === null ? own : { ...own, AEP_WORKER: worker };
};

/**
 * Runs the command on a board; `input` is its stdin, `variables` are set
 * in its environment.
 */
function run(root, command, { worker = ALICE, input = '', variables } = {}) {
  const result = spawnSync(
    process.execPath,
    [TASK, ...command, '--root', root],
    {
      encoding: 'utf8',
      input,
      env: { ...environment(worker), ...variables },
    },
  );
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function passes(root, command, options) {
  const result = run(root, command, options);
  assert.equal(result.status, 0, result.output);
  return result;
}

function refuses(root, command, message, options) {
  const result = run(root, command, options);
  assert.equal(result.status, 1, result.output);
  assert.match(result.stderr, message);
  return result;
}

const read = (root, id) => readFileSync(join(root, fileOf(id)), 'utf8');
const statusOf = (root, id) => /^status: (.*)$/m.exec(read(root, id))[1];

/** Writes a file and dates it after every claim of the test. */
function change(root, file) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), 'changed\n');
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(root, file), later, later);
}

const HELD = {
  status: 'in-progress',
  claim: {
    by: BOB,
    since: '2026-11-20T02:10:00Z',
    beat: '2026-11-20T02:10:00Z',
  },
};
const SUBMISSION =
  '### 2026-11-20 03:41, cursor/model-a\n\n' +
  'Submitted for review. Checks, as run by `task submit`:\n\n' +
  '- `exit 0`: pass, 0 s';
const IN_REVIEW = {
  status: 'review',
  log: `### 2026-11-20 03:40, cursor/model-a\n\nDid: all of it.\n\n${SUBMISSION}`,
};
const DONE = {
  status: 'done',
  log: `${IN_REVIEW.log}\n\n### 2026-11-20 04:00, claude-code/model-b\n\nChecks: pass.`,
};

describe('the environment of the tests', () => {
  test('gives git no configuration of the user, the system or the caller', () => {
    const home = mkdtempSync(join(tmpdir(), 'aep-task-home-'));
    roots.push(home);
    writeFileSync(join(home, '.gitconfig'), '[commit]\n\tgpgsign = true\n');
    mkdirSync(join(home, '.config/git'), { recursive: true });
    writeFileSync(join(home, '.config/git/ignore'), '*\n');
    const { XDG_CONFIG_HOME: _, ...rest } = process.env;
    const env = environment(null, {
      ...rest,
      HOME: home,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'commit.gpgsign',
      GIT_CONFIG_VALUE_0: 'true',
    });
    const git = (...command) => {
      const result = spawnSync('git', ['-C', home, ...command], {
        encoding: 'utf8',
        env,
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    assert.equal(git('config', '--list', '--show-origin'), '');
    git('init', '--quiet');
    assert.equal(
      git('config', '--list', '--show-scope').replaceAll(/^local\t.*\n/gm, ''),
      '',
    );
    assert.match(
      git('ls-files', '--others', '--exclude-standard'),
      /^\.gitconfig$/m,
    );
  });
});

describe('lint', () => {
  test('passes on a board that follows the protocol', () => {
    const root = boardOf(
      { id: 'T-0001', ...DONE },
      { id: 'T-0002', 'depends-on': ['T-0001'], writes: ['b/'] },
      { id: 'T-0003', ...HELD, writes: ['c/'], appends: ['README.md'] },
      { id: 'T-0004', ...HELD, writes: ['d/x.ts'], appends: ['README.md'] },
    );
    const result = passes(root, ['lint']);
    assert.match(result.stdout, /Task board OK \(4 task\(s\) checked\)/);
  });

  const edit = (root, id, from, to) => {
    const text = read(root, id);
    assert.ok(text.includes(from), `the fixture holds "${from}"`);
    writeFileSync(join(root, fileOf(id)), text.replace(from, to));
  };
  const violations = {
    'a missing field': [
      root => edit(root, 'T-0001', 'kind: build\n', ''),
      /T-0001-a-task\.md: the field "kind" is missing/,
    ],
    'an unknown field': [
      root => edit(root, 'T-0001', 'kind: build', 'kind: build\nowner: me'),
      /the field "owner" is unknown/,
    ],
    'a value the schema does not have': [
      root => edit(root, 'T-0001', 'status: ready', 'status: started'),
      /status: "started" is none of backlog, ready/,
    ],
    'a line that is not of the format': [
      root => edit(root, 'T-0001', 'kind: build', 'kind build'),
      /T-0001-a-task\.md: line 5: not a line of the task format/,
    ],
    'a duplicate id': [
      root =>
        writeFileSync(
          join(root, 'work/tasks/T-0001-again.md'),
          taskText({ writes: ['z/'] }),
        ),
      /the id T-0001 is also that of work\/tasks\/T-0001-a-task\.md/,
    ],
    'a file not named by its id': [
      root =>
        writeFileSync(
          join(root, 'work/tasks/T-0009-other.md'),
          taskText({ id: 'T-0008', writes: ['z/'] }),
        ),
      /the file of T-0008 is named T-0008-short-name\.md/,
    ],
    'a dependency that does not exist': [
      root => edit(root, 'T-0001', 'depends-on: []', 'depends-on: [T-0404]'),
      /depends on T-0404, which no task is/,
    ],
    'a cycle': [
      root => edit(root, 'T-0001', 'depends-on: []', 'depends-on: [T-0003]'),
      /a cycle of dependencies: T-0001 → T-0003 → T-0002 → T-0001/,
    ],
    'two held tasks that overlap': [
      root => {
        edit(root, 'T-0002', 'status: ready', 'status: in-progress');
        edit(
          root,
          'T-0002',
          'claim:',
          /claim:\n(?: {2}.*\n){3}/.exec(taskText(HELD))[0].trimEnd(),
        );
        edit(root, 'T-0002', '  - b/', '  - c/sub/');
      },
      /held at the same time as T-0004, and both change c\/sub\/ and c\//,
    ],
    'a path with a wildcard': [
      root => edit(root, 'T-0001', '  - a/', '  - a/*.ts'),
      /writes: "a\/\*\.ts" does not match .* No wildcard\.\)/,
    ],
    'a directory without a trailing /': [
      root => {
        mkdirSync(join(root, 'a'));
        edit(root, 'T-0001', '  - a/', '  - a');
      },
      /a is a directory: it ends in \//,
    ],
    'a claim on a task that is not in progress': [
      root => edit(root, 'T-0004', 'status: in-progress', 'status: ready'),
      /claim block exactly while it is in-progress; this one is ready/,
    ],
    'a missing section': [
      root => edit(root, 'T-0001', '## Done when', '## Finished when'),
      /the sections are ## Context, ## Done when, ## Out of scope, ## Log/,
    ],
  };
  for (const [name, [plant, message]] of Object.entries(violations)) {
    test(`fails on ${name}`, () => {
      const root = boardOf(
        { id: 'T-0001' },
        { id: 'T-0002', 'depends-on': ['T-0001'], writes: ['b/'] },
        { id: 'T-0003', 'depends-on': ['T-0002'], writes: ['c/x.ts'] },
        { id: 'T-0004', ...HELD, writes: ['c/'] },
      );
      passes(root, ['lint']);
      plant(root);
      const result = refuses(root, ['lint'], message);
      assert.match(result.stderr, /1 problem\(s\) on the task board/);
    });
  }
});

describe('lint, the backlog', () => {
  test('fails on a backlog task that waits for nothing, with the command that promotes it', () => {
    const root = boardOf(
      { id: 'T-0001', ...DONE },
      { id: 'T-0002', writes: ['b/'] },
      { id: 'T-0003', status: 'backlog', 'depends-on': ['T-0001'] },
      { id: 'T-0004', status: 'backlog', priority: 7, rfc: '0007', step: 'C' },
      { id: 'T-0005', status: 'backlog', 'depends-on': ['T-0001', 'T-0002'] },
    );
    const { stderr } = refuses(
      root,
      ['lint'],
      /2 problem\(s\) on the task board/,
    );
    for (const id of ['T-0003', 'T-0004']) {
      assert.match(
        stderr,
        new RegExp(
          `${id}-a-task\\.md: it is in the backlog and waits for nothing ` +
            '\\(every task it depends on is done\\), so no worker sees it: ' +
            '"yarn task promote" makes it ready',
        ),
      );
    }
    passes(root, ['promote']);
    passes(root, ['lint']);
  });
});

describe('a task with no check', () => {
  const edit = (root, id, from, to) => {
    const text = read(root, id);
    assert.ok(text.includes(from), `the fixture holds "${from}"`);
    writeFileSync(join(root, fileOf(id)), text.replace(from, to));
  };

  test('cannot be claimed when it is of kind build or fix, and can with one', () => {
    for (const kind of ['build', 'fix']) {
      const root = boardOf({ id: 'T-0001', kind, checks: [] });
      refuses(
        root,
        ['claim', 'T-0001'],
        new RegExp(
          `T-0001 cannot be claimed: a task of kind ${kind} has no check: add the commands`,
        ),
      );
      edit(root, 'T-0001', 'checks: []', 'checks:\n  - exit 0');
      passes(root, ['claim', 'T-0001']);
    }
  });

  test('can be claimed when it is of kind docs, research or decision', () => {
    for (const kind of ['research', 'decision']) {
      const root = boardOf({ id: 'T-0001', kind, checks: [] });
      passes(root, ['claim', 'T-0001']);
    }
  });

  test('is refused by submit before any check runs', () => {
    const root = boardOf({ id: 'T-0001', checks: ['exit 0'] });
    passes(root, ['claim', 'T-0001']);
    edit(root, 'T-0001', 'checks:\n  - exit 0', 'checks: []');
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    refuses(
      root,
      ['submit', 'T-0001'],
      /T-0001 is not submitted: a task of kind build has no check: add the commands/,
    );
  });

  test('is passed by the lint, so that it fails no other task', () => {
    const root = boardOf(
      { id: 'T-0001', checks: [] },
      { id: 'T-0002', kind: 'fix', checks: [], writes: ['b/'] },
    );
    passes(root, ['lint']);
  });

  test('new says the claim and the submit refuse a build or fix task with none', () => {
    const root = boardOf({ id: 'T-0001', ...DONE });
    const base = ['new', '--title', 'X', '--priority', '2'];
    const fix = passes(root, [...base, '--kind', 'fix']);
    assert.match(
      fix.stderr,
      /a fix task needs a check[^\n]*claim[^\n]*--check/,
    );
    const withCheck = passes(root, [
      ...base,
      '--kind',
      'fix',
      '--check',
      'exit 0',
    ]);
    assert.doesNotMatch(withCheck.stderr, /needs a check/);
    const research = passes(root, [...base, '--kind', 'research']);
    assert.doesNotMatch(research.stderr, /needs a check/);
  });
});

describe('lint, the Log', () => {
  const submitted = text => `### 2026-11-21 08:00, cursor/model-a\n\n${text}`;
  const fails = {
    'a task in review with no entry of submit': [
      { status: 'review', log: submitted('Did: all of it. Ready for review.') },
      /T-0001-a-task\.md: it is in review, and its last Log entry is not the one `task submit` writes/,
    ],
    'a task in review with an entry after that of submit': [
      {
        status: 'review',
        log: `${SUBMISSION}\n\n${submitted('Did: one more thing.')}`,
      },
      /it is in review, and its last Log entry is not the one `task submit`/,
    ],
    'a task done since the check without the entry of submit': [
      {
        status: 'done',
        log: `${submitted('Did: all of it.')}\n\n### 2026-11-21 09:00, claude-code/model-b\n\nChecks: pass.`,
      },
      /it is done, and the Log entry before its acceptance is not the one `task submit` writes/,
    ],
    'a heading of another form, dated since the check': [
      {
        status: 'ready',
        log: '### 2026-11-21 09:21 UTC, cursor/model-a\n\nDid: half.',
      },
      /the Log heading "### 2026-11-21 09:21 UTC, cursor\/model-a" is not read as an entry: a heading is "### YYYY-MM-DD HH:MM, <worker>"/,
    ],
    'a heading with words after the worker': [
      {
        status: 'ready',
        log: '### 2026-11-21 09:21, cursor/model-a (ready for review)\n\nDid.',
      },
      /the Log heading "### 2026-11-21 09:21, cursor\/model-a \(ready for review\)" is not read/,
    ],
  };
  for (const [name, [task, message]] of Object.entries(fails)) {
    test(`fails on ${name}`, () => {
      const result = refuses(
        boardOf({ id: 'T-0001', ...task }),
        ['lint'],
        message,
      );
      assert.match(result.stderr, /1 problem\(s\) on the task board/);
    });
  }

  test('passes on a task submitted, and on one rejected and submitted again', () => {
    const again =
      `${SUBMISSION}\n\n### 2026-11-20 05:00, claude-code/model-b\n\n` +
      `Found: a test fails.\n\n${submitted('Did: the test.')}\n\n` +
      '### 2026-11-21 08:10, cursor/model-a\n\n' +
      'Submitted for review. Checks, as run by `task submit`:\n\n- `exit 0`: pass, 0 s';
    passes(
      boardOf(
        { id: 'T-0001', ...IN_REVIEW },
        { id: 'T-0002', ...DONE, writes: ['b/'] },
        { id: 'T-0003', status: 'review', log: again, writes: ['c/'] },
      ),
      ['lint'],
    );
  });

  test('names, and does not refuse, what was there before the check', () => {
    const root = boardOf(
      // Accepted before the check, submitted by hand.
      {
        id: 'T-0001',
        status: 'done',
        log: '### 2026-11-20 03:00, cursor/model-a\n\nDid: it.\n\n### 2026-11-20 04:00, claude-code/model-b\n\nChecks: pass.',
      },
      // T-0002 is on SUBMITTED_BY_HAND in scripts/task.mjs for good: it was
      // accepted from the list, which passes it without a word.
      {
        id: 'T-0002',
        status: 'done',
        writes: ['c/'],
        log: '### 2026-11-20 11:00, claude-code/model-b\n\nChecks: pass.',
      },
      {
        id: 'T-0003',
        writes: ['b/'],
        log: '### 2026-11-20 09:21 UTC, cursor/model-a\n\nDid: half.',
      },
      {
        id: 'T-0004',
        writes: ['d/'],
        log: '- **2026-11-20T09:44:00Z** (`cursor/model-a`): Did half.\n  - Checks: pass.\n\n### 2026-11-20 11:09, claude-code/model-b\n\nFound: x.',
      },
    );
    const result = passes(root, ['lint']);
    assert.match(
      result.stdout,
      /^Known since before \S+Z, not refused[^\n]*\n {2}work\/tasks\/T-0003-a-task\.md: the Log heading "### 2026-11-20 09:21 UTC, cursor\/model-a" is not read as an entry[^\n]*\n {2}work\/tasks\/T-0004-a-task\.md: the Log has lines before its first entry, which are not read as an entry \("- \*\*2026-11-20T09:44:00Z\*\* \(`cursor\/model-a`\): Did half\."\): an entry starts with a heading "### YYYY-MM-DD HH:MM, <worker>"[^\n]*\nTask board OK \(4 task\(s\) checked\)\.\n$/,
    );
    assert.doesNotMatch(result.stdout, /T-0001|T-0002/);
  });

  test('fails on lines above the first entry, unless each date and time they hold is before the check', () => {
    const above = first =>
      new RegExp(
        `T-0001-a-task\\.md: the Log has lines before its first entry, which are not read as an entry \\("${first}"\\)`,
      );
    for (const [log, first] of [
      ['- Did: all of it.\n- Ready for review.', '- Did: all of it\\.'],
      ['#### Notes\n\nDid: it.', '#### Notes'],
      [
        '- **2026-11-20T11:00:00Z** (`cursor/model-a`): Did it.',
        '- \\*\\*2026-11-20T11:00:00Z\\*\\* \\(`cursor/model-a`\\): Did it\\.',
      ],
      [
        '- **2026-11-20T09:00:00Z**: Did half.\n- **2026-11-20 10:41**: the rest.',
        '- \\*\\*2026-11-20T09:00:00Z\\*\\*: Did half\\.',
      ],
    ]) {
      const result = refuses(
        boardOf({
          id: 'T-0001',
          log: `${log}\n\n### 2026-11-20 03:00, cursor/model-a\n\nDid: more.`,
        }),
        ['lint'],
        above(first),
      );
      assert.match(result.stderr, /1 problem\(s\) on the task board/);
    }
  });

  test('takes a done task whose Log is only lines dated before the check as accepted before it', () => {
    const dated = '- **2026-11-20T09:44:00Z** (`cursor/model-a`): Did it.';
    assert.match(
      passes(boardOf({ id: 'T-0001', status: 'done', log: dated }), ['lint'])
        .stdout,
      /T-0001-a-task\.md: the Log has lines before its first entry/,
    );
    const result = refuses(
      boardOf({ id: 'T-0001', status: 'done', log: '- Did it.' }),
      ['lint'],
      /it is done, and the Log entry before its acceptance is not the one `task submit` writes/,
    );
    assert.match(result.stderr, /the Log has lines before its first entry/);
    assert.match(result.stderr, /2 problem\(s\) on the task board/);
  });

  test('dates a heading with no time before the check only by its day, or by an entry after it', () => {
    const dateOnly = day => `### ${day}, cursor/model-a (notes)\n\nDid: it.`;
    const unread = day =>
      new RegExp(
        `T-0001-a-task\\.md: the Log heading "### ${day}, cursor/model-a \\(notes\\)" is not read as an entry`,
      );
    // The day of CHECKED_FROM in scripts/task.mjs, and the day before.
    const result = refuses(
      boardOf({ id: 'T-0001', log: dateOnly('2026-11-20') }),
      ['lint'],
      unread('2026-11-20'),
    );
    assert.match(result.stderr, /1 problem\(s\) on the task board/);
    assert.match(
      passes(boardOf({ id: 'T-0001', log: dateOnly('2026-11-19') }), ['lint'])
        .stdout,
      unread('2026-11-19'),
    );
    const followed = `${dateOnly('2026-11-20')}\n\n### 2026-11-20 10:09, cursor/model-a\n\nDid: more.`;
    assert.match(
      passes(boardOf({ id: 'T-0001', log: followed }), ['lint']).stdout,
      unread('2026-11-20'),
    );
    const late = `${dateOnly('2026-11-20')}\n\n### 2026-11-20 10:41, cursor/model-a\n\nDid: more.`;
    refuses(
      boardOf({ id: 'T-0001', log: late }),
      ['lint'],
      unread('2026-11-20'),
    );
    // Only a heading dated on the day of the check takes its date from the
    // entry after it: one with no date, or a later date, does not.
    for (const planted of [
      'Notes added later by anyone',
      '2026-11-21, cursor/late (inserted)',
    ]) {
      const result = refuses(
        boardOf({
          id: 'T-0001',
          log: `### ${planted}\n\nDid: it.\n\n### 2026-11-20 10:09, cursor/model-a\n\nDid: more.`,
        }),
        ['lint'],
        new RegExp(
          `T-0001-a-task\\.md: the Log heading "### ${planted.replace(/[()]/g, '\\$&')}" is not read as an entry`,
        ),
      );
      assert.match(result.stderr, /1 problem\(s\) on the task board/);
    }
  });

  test('says when a task submitted by hand no longer needs its exception', () => {
    const root = boardOf({ id: 'T-0002', ...IN_REVIEW });
    const result = passes(root, ['lint']);
    assert.match(
      result.stdout,
      /T-0002 is on the list of tasks submitted by hand \(SUBMITTED_BY_HAND in scripts\/task\.mjs\) and no longer needs it: remove it/,
    );
  });
});

describe('claim', () => {
  test('takes the task: its claim file, its frontmatter and its tree', () => {
    const root = boardOf({ id: 'T-0001' });
    const result = passes(root, ['claim', 'T-0001']);
    assert.match(result.stdout, /T-0001 is yours, cursor\/model-a/);
    assert.match(
      readFileSync(join(root, 'work/claims/T-0001/claim'), 'utf8'),
      /^cursor\/model-a \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n$/,
    );
    assert.match(
      read(root, 'T-0001'),
      /^status: in-progress$[\s\S]*^claim:\n {2}by: cursor\/model-a\n {2}since: (\S+Z)\n {2}beat: \1\n---$/m,
    );
    assert.ok(existsSync(join(treeOf(root), 'work/schema.json')));
    passes(root, ['lint']);
  });

  test('of two workers at once, exactly one wins', async () => {
    const ids = ['T-0001', 'T-0002', 'T-0003', 'T-0004', 'T-0005', 'T-0006'];
    const root = boardOf(...ids.map(id => ({ id, writes: [`${id}/`] })));
    const claimed = (id, worker) =>
      new Promise(done => {
        spawn(process.execPath, [TASK, 'claim', id, '--root', root], {
          env: environment(worker),
          stdio: 'ignore',
        }).on('exit', code => done({ worker, code }));
      });
    for (const id of ids) {
      const results = await Promise.all([claimed(id, ALICE), claimed(id, BOB)]);
      const winners = results.filter(result => result.code === 0);
      assert.equal(winners.length, 1, `${id}: ${JSON.stringify(results)}`);
      assert.ok(read(root, id).includes(`  by: ${winners[0].worker}\n`));
      assert.ok(
        readFileSync(join(root, 'work/claims', id, 'claim'), 'utf8').startsWith(
          `${winners[0].worker} `,
        ),
      );
    }
    passes(root, ['lint']);
  });

  test('is refused when another worker wrote its claim file', () => {
    const root = boardOf({ id: 'T-0001' });
    mkdirSync(join(root, 'work/claims/T-0001'), { recursive: true });
    writeFileSync(join(root, 'work/claims/T-0001/claim'), `${BOB} now\n`);
    refuses(root, ['claim', 'T-0001'], /T-0001 is held by another worker/);
    assert.equal(statusOf(root, 'T-0001'), 'ready');
  });

  test('is refused without AEP_WORKER, and with a name that is not a worker’s', () => {
    const root = boardOf({ id: 'T-0001' });
    const claim = ['claim', 'T-0001'];
    refuses(root, claim, /set AEP_WORKER/, { worker: null });
    refuses(root, claim, /looks like an email address/, {
      worker: 'someone@example.com',
    });
    refuses(root, claim, /AEP_WORKER is "Some One"/, { worker: 'Some One' });
    assert.equal(existsSync(join(root, 'work/claims')), false);
  });

  test('is refused when a held task overlaps', () => {
    const root = boardOf(
      { id: 'T-0001', ...HELD, writes: ['a/'], appends: ['README.md'] },
      { id: 'T-0002', writes: ['a/b.ts'] },
      { id: 'T-0003', writes: ['c/'], appends: ['a/b.ts'] },
      { id: 'T-0004', writes: ['README.md'] },
      { id: 'T-0005', writes: ['c/'], appends: ['README.md'] },
    );
    const held = /T-0001, held by claude-code\/model-b, changes/;
    refuses(root, ['claim', 'T-0002'], held);
    refuses(root, ['claim', 'T-0003'], held);
    refuses(root, ['claim', 'T-0004'], held);
    passes(root, ['claim', 'T-0005']);
  });

  test('is refused when a dependency is not done, or the task is not ready', () => {
    const root = boardOf(
      { id: 'T-0001', status: 'review' },
      { id: 'T-0002', 'depends-on': ['T-0001'], writes: ['b/'] },
    );
    refuses(root, ['claim', 'T-0002'], /depends on T-0001, which is review/);
    refuses(root, ['claim', 'T-0001'], /it is review, not ready/);
  });

  test('of a task that needs the owner takes the owner’s word', () => {
    const root = boardOf({ id: 'T-0001', needs: ['owner'] });
    refuses(root, ['claim', 'T-0001'], /it needs the owner/);
    passes(root, ['claim', 'T-0001', '--owner-told']);
    assert.match(read(root, 'T-0001'), /Claimed: the owner said so\./);
  });

  test('gives way to a lower id claimed in the same moment that overlaps', () => {
    const tasks = [
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', writes: ['a/b.ts'] },
    ];
    // Another worker has written its claim file and not yet its task file.
    const lower = boardOf(...tasks);
    claimedBy(lower, 'T-0001');
    refuses(lower, ['claim', 'T-0002'], /T-0002 was released at once: T-0001/);
    assert.equal(statusOf(lower, 'T-0002'), 'ready');
    assert.deepEqual(readdirSync(join(lower, 'work/claims')), ['T-0001']);
    passes(lower, ['lint']);

    const higher = boardOf(...tasks);
    claimedBy(higher, 'T-0002');
    const result = passes(higher, ['claim', 'T-0001']);
    assert.match(result.stderr, /T-0002 was claimed in the same moment/);
    assert.equal(statusOf(higher, 'T-0001'), 'in-progress');
  });
});

describe('a held task', () => {
  test('beats, and logs from stdin', () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    refuses(
      root,
      ['beat', 'T-0001'],
      /T-0001 is neither claimed nor under review by cursor\/model-a: it is in-progress, held by claude-code\/model-b$/m,
    );
    refuses(root, ['log', 'T-0001'], /not held by cursor\/model-a/, {
      input: 'Did: nothing.',
    });
    passes(root, ['beat', 'T-0001'], { worker: BOB });
    const beat = /^ {2}beat: (.*)$/m.exec(read(root, 'T-0001'))[1];
    assert.notEqual(beat, HELD.claim.beat);
    assert.match(read(root, 'T-0001'), /^ {2}since: 2026-11-20T02:10:00Z$/m);

    refuses(root, ['log', 'T-0001'], /stdin is empty/, { worker: BOB });
    passes(root, ['log', 'T-0001'], { worker: BOB, input: 'Did: one.\n' });
    passes(root, ['log', 'T-0001'], { worker: BOB, input: 'Did: two.' });
    assert.match(
      read(root, 'T-0001'),
      /## Log\n\n### \d{4}-\d{2}-\d{2} \d{2}:\d{2}, claude-code\/model-b\n\nDid: one\.\n\n### [^\n]*, claude-code\/model-b\n\nDid: two\.\n$/,
    );
    passes(root, ['lint']);
  });

  test('is released as ready or blocked, with the reason', () => {
    const root = boardOf(
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', writes: ['b/'] },
    );
    passes(root, ['claim', 'T-0001']);
    passes(root, ['claim', 'T-0002']);
    refuses(root, ['release', 'T-0001'], /stdin is empty/);
    passes(root, ['release', 'T-0001'], { input: 'Left: all of it.' });
    passes(root, ['release', 'T-0002', '--blocked'], {
      input: 'Waits for the decision of T-0009.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'ready');
    assert.equal(statusOf(root, 'T-0002'), 'blocked');
    assert.match(read(root, 'T-0001'), /^claim:\n---$/m);
    assert.match(read(root, 'T-0002'), /Waits for the decision of T-0009\.\n$/);
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
    passes(root, ['lint']);
  });
});

describe('submit', () => {
  const claimed = (...tasks) => {
    const root = boardOf(...tasks);
    passes(root, ['claim', 'T-0001']);
    return root;
  };

  test('runs the checks in the tree and the scope check, and moves the task to review', () => {
    const root = claimed(
      { id: 'T-0001', writes: ['a/'], appends: ['README.md'] },
      { id: 'T-0002', ...HELD, writes: ['b/'] },
    );
    refuses(root, ['submit', 'T-0001'], /no Log entry of cursor\/model-a/);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    const git = commitIn(root, 'T-0001', 'a/new.ts', 'README.md');
    // An ignored file of the tree is no change.
    mkdirSync(join(treeOf(root), 'node_modules/package'), { recursive: true });
    writeFileSync(join(treeOf(root), 'node_modules/package/index.js'), 'x\n');
    // A change of the main checkout is no change of the task.
    change(root, 'b/theirs.ts');
    const result = passes(root, ['submit', 'T-0001']);
    assert.match(
      result.stdout,
      /In the scope of T-0001:\n {2}README\.md\n {2}a\/new\.ts\n(?! )/,
    );
    assert.doesNotMatch(result.stdout, /node_modules|theirs/);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    assert.match(read(root, 'T-0001'), /^claim:\n---$/m);
    assert.match(read(root, 'T-0001'), /- `exit 0`: pass, \d+ s\n/);
    assert.match(
      read(root, 'T-0001'),
      new RegExp(
        `\\nCommitted as ${git('rev-parse', 'HEAD')} on task/T-0001, from main at [0-9a-f]{40}\\.\\n\\nScope: 2 changed file\\(s\\), all under \`writes\` or \`appends\`\\.\\n$`,
      ),
    );
    assert.deepEqual(readdirSync(join(root, 'work/claims/T-0001')), ['tree']);
    passes(root, ['lint']);
  });

  test('is refused on a file outside the task’s paths, and on a task file changed in the tree', () => {
    const root = claimed({ id: 'T-0001', writes: ['a/'] });
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(root, 'T-0001', 'a/work.ts', 'elsewhere/file.ts');
    const result = refuses(
      root,
      ['submit', 'T-0001'],
      /not submitted: 1 changed file\(s\) are outside T-0001's writes and appends/,
    );
    assert.match(
      result.stdout,
      /Outside T-0001's scope:\n {2}elsewhere\/file\.ts\n/,
    );
    refuses(root, ['scope', 'T-0001'], /1 changed file\(s\) are outside/);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    const own = claimed({ id: 'T-0001', writes: ['a/'] });
    passes(own, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(own, 'T-0001', 'a/work.ts', fileOf('T-0001'));
    refuses(own, ['submit', 'T-0001'], /1 task file\(s\) changed in the tree/);
  });

  test('takes no commit to measure from, and no file set aside as not the task’s', () => {
    // A file outside the paths, hidden from a scope measured from a later
    // commit, or set aside with --not-mine, would land on main.
    const root = claimed({ id: 'T-0001', writes: ['a/'] });
    const git = commitIn(root, 'T-0001', 'outside');
    const first = git('rev-parse', 'HEAD');
    commitIn(root, 'T-0001', 'a/T-0001');
    passes(root, ['log', 'T-0001'], { input: 'Did: it. outside is not mine.' });
    refuses(
      root,
      ['submit', 'T-0001', '--base', first],
      /unknown option --base/,
    );
    refuses(
      root,
      ['submit', 'T-0001', '--not-mine', 'outside'],
      /unknown option --not-mine/,
    );
    refuses(
      root,
      ['scope', 'T-0001', '--base', first],
      /unknown option --base/,
    );
    refuses(root, ['submit', 'T-0001'], /1 changed file\(s\) are outside/);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
  });

  test('is refused for a change not committed, before any check runs', () => {
    const root = claimed({
      id: 'T-0001',
      writes: ['a/'],
      checks: [
        `${process.execPath} -e "require('node:fs').writeFileSync('../ran', '')"`,
      ],
    });
    commitIn(root, 'T-0001', 'a/one.ts');
    writeFileSync(join(treeOf(root), 'a/two.ts'), 'not committed\n');
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    refuses(
      root,
      ['submit', 'T-0001'],
      /T-0001 is not submitted: its tree holds changes that are not committed on task\/T-0001; commit them there first:\n {2}a\/two\.ts/,
    );
    assert.equal(existsSync(join(dirname(root), 'aep-trees/ran')), false);
    gitIn(treeOf(root))('switch', '--quiet', '-c', 'other');
    refuses(
      root,
      ['submit', 'T-0001'],
      /has refs\/heads\/other out, not task\/T-0001/,
    );
  });

  test('is refused when its tree changed during the checks', () => {
    for (const [during, refused] of [
      ['echo x > a/during.ts', /its tree holds changes that are not committed/],
      [
        'echo x > a/during.ts && git add -A && git -c user.name=t -c user.email=t@example.invalid commit --quiet -m during',
        /task\/T-0001 moved during the checks, from [0-9a-f]+ to [0-9a-f]+\. Submit it again/,
      ],
    ]) {
      const root = claimed({ id: 'T-0001', writes: ['a/'], checks: [during] });
      commitIn(root, 'T-0001', 'a/work.ts');
      passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
      refuses(root, ['submit', 'T-0001'], refused);
      assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    }
  });

  test('says which headings it did not read when no entry is the worker’s', () => {
    const root = claimed({ id: 'T-0001' });
    const text = read(root, 'T-0001').replace(
      'No entry yet.',
      '### 30 Nov 2026 09:00, cursor/model-a\n\nDid: it.',
    );
    writeFileSync(join(root, fileOf('T-0001')), text);
    refuses(
      root,
      ['submit', 'T-0001'],
      /no Log entry of cursor\/model-a since the claim[^\n]*Not read as entries: "### 30 Nov 2026 09:00, cursor\/model-a"; a heading is "### YYYY-MM-DD HH:MM, <worker>"/,
    );
  });

  test('is refused on a failing check, unless the worker says it is not the task’s', () => {
    const root = claimed({ id: 'T-0001', checks: ['exit 0', 'exit 3'] });
    commitIn(root, 'T-0001', 'a/work.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    refuses(root, ['submit', 'T-0001'], /not submitted: 1 check\(s\) fail/);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    passes(root, ['submit', 'T-0001', '--allow-failing-checks']);
    assert.match(read(root, 'T-0001'), /- `exit 3`: FAIL \(exit 3\), \d+ s\n/);
    assert.equal(statusOf(root, 'T-0001'), 'review');
  });
});

describe('submit, a build or fix task that changed none of its files', () => {
  /** A check that leaves `ran` beside the trees when it runs. */
  const MARKS = `${process.execPath} -e "require('node:fs').writeFileSync('../ran', '')"`;
  const ran = root => existsSync(join(dirname(root), 'aep-trees/ran'));
  const claimed = (...tasks) => {
    const root = boardOf(...tasks);
    passes(root, ['claim', 'T-0001']);
    return root;
  };

  test('is refused before any check runs, naming its tree and its base', () => {
    for (const kind of ['build', 'fix']) {
      const root = claimed({ id: 'T-0001', kind, checks: [MARKS] });
      passes(root, ['log', 'T-0001'], { input: 'Did: nothing yet.' });
      refuses(
        root,
        ['submit', 'T-0001'],
        new RegExp(
          `^task: T-0001 is not submitted: it is a task of kind ${kind}, and no ` +
            'file of its writes or appends in its tree \\S+aep-trees/T-0001 ' +
            'differs from its base [0-9a-f]{40}, so its checks would run on nothing\\. ',
          'm',
        ),
      );
      assert.equal(ran(root), false);
      assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    }
  });

  test('takes a change committed under an earlier claim of the task as its change', () => {
    const root = claimed({ id: 'T-0001' });
    commitIn(root, 'T-0001', 'a/work.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: part of it.' });
    passes(root, ['release', 'T-0001'], { input: 'Back later.' });
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], {
      input: 'Did: the rest, by checking it.',
    });
    passes(root, ['submit', 'T-0001']);
    assert.equal(statusOf(root, 'T-0001'), 'review');
  });

  test('takes a deleted file, and a file of its appends, as its change', () => {
    const root = boardOf({ id: 'T-0001', appends: ['README.md'] });
    mkdirSync(join(root, 'a'));
    writeFileSync(join(root, 'a/gone.ts'), 'here\n');
    gitIn(root)('add', '-A');
    gitIn(root)('commit', '--quiet', '-m', 'A file');
    passes(root, ['claim', 'T-0001']);
    rmSync(join(treeOf(root), 'a/gone.ts'));
    commitIn(root, 'T-0001');
    passes(root, ['log', 'T-0001'], { input: 'Did: removed it.' });
    passes(root, ['submit', 'T-0001']);
    const appended = claimed({ id: 'T-0001', appends: ['README.md'] });
    commitIn(appended, 'T-0001', 'README.md');
    passes(appended, ['log', 'T-0001'], { input: 'Did: a line.' });
    passes(appended, ['submit', 'T-0001']);
  });

  test('does not hold a task of another kind', () => {
    const root = claimed({ id: 'T-0001', kind: 'research' });
    passes(root, ['log', 'T-0001'], {
      input: 'Found: what the research asks.',
    });
    passes(root, ['submit', 'T-0001']);
    assert.equal(statusOf(root, 'T-0001'), 'review');
  });
});

describe('scope, git', () => {
  const runWithEnv = (root, command, env) => {
    const result = spawnSync(
      process.execPath,
      [TASK, ...command, '--root', root],
      { encoding: 'utf8', env },
    );
    return { ...result, output: `${result.stdout}${result.stderr}` };
  };

  test('lists the files of the tree not ignored by .gitignore or .git/info/exclude, whatever the user exclusion file and git configuration hold', () => {
    const root = boardOf({ id: 'T-0001', writes: ['a/'] });
    const git = gitIn(root);
    writeFileSync(
      join(root, '.gitignore'),
      'work/claims/\nnode_modules/\nrepo-ignored.txt\n',
    );
    git('commit', '--quiet', '-am', 'An ignored file');
    writeFileSync(join(root, '.git/info/exclude'), 'info-ignored.txt\n');

    const home = mkdtempSync(join(tmpdir(), 'aep-task-hostile-home-'));
    const xdg = mkdtempSync(join(tmpdir(), 'aep-task-hostile-xdg-'));
    roots.push(home, xdg);
    mkdirSync(join(home, '.config/git'), { recursive: true });
    mkdirSync(join(xdg, 'git'), { recursive: true });
    const extraIgnore = join(home, 'extra-ignore');
    writeFileSync(
      join(home, '.config/git/ignore'),
      '**/.claude/settings.local.json\nhome-ignored.txt\n',
    );
    writeFileSync(
      join(xdg, 'git/ignore'),
      '**/.claude/settings.local.json\nxdg-ignored.txt\n',
    );
    writeFileSync(
      extraIgnore,
      'config-ignored.txt\nenv-ignored.txt\nlocal-cfg-ignored.txt\n',
    );
    writeFileSync(
      join(home, '.gitconfig'),
      `[core]\n\texcludesFile = ${extraIgnore}\n\tquotePath = true\n` +
        '[color]\n\tui = always\n[commit]\n\tgpgsign = true\n',
    );
    writeFileSync(
      join(xdg, 'git/config'),
      `[core]\n\texcludesFile = ${extraIgnore}\n`,
    );
    git('config', 'core.excludesFile', extraIgnore);

    passes(root, ['claim', 'T-0001']);
    const expectedOutside = [
      '.claude/settings.local.json',
      'config-ignored.txt',
      'env-ignored.txt',
      'home-ignored.txt',
      'local-cfg-ignored.txt',
      'xdg-ignored.txt',
    ];
    for (const file of [
      'a/ok.ts',
      'a/café.txt',
      ...expectedOutside,
      'repo-ignored.txt',
      'info-ignored.txt',
    ]) {
      change(treeOf(root), file);
    }

    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !name.startsWith('GIT_') && name !== 'XDG_CONFIG_HOME',
      ),
    );
    const hostileDefaultXdg = { ...baseEnv, HOME: home };
    const hostileWithXdg = {
      ...baseEnv,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.excludesFile',
      GIT_CONFIG_VALUE_0: extraIgnore,
    };
    const hostileWithGitDir = {
      ...hostileWithXdg,
      GIT_DIR: join(home, 'not-a-repo'),
    };
    for (const env of [hostileDefaultXdg, hostileWithXdg, hostileWithGitDir]) {
      const result = runWithEnv(root, ['scope', 'T-0001'], env);
      assert.equal(result.status, 1, result.output);
      assert.match(
        result.stderr,
        /6 changed file\(s\) are outside T-0001's writes and appends/,
      );
      assert.match(
        result.stdout,
        /In the scope of T-0001:\n {2}a\/café\.txt\n {2}a\/ok\.ts\n/,
      );
      for (const file of expectedOutside) {
        assert.ok(
          result.stdout.includes(`  ${file}\n`),
          `expected ${file} in:\n${result.stdout}`,
        );
      }
      assert.doesNotMatch(result.stdout, /repo-ignored\.txt|info-ignored\.txt/);
    }
  });

  test('sees what the tree committed, what it did not, and what it deleted, from its base', () => {
    const root = boardOf({ id: 'T-0001', writes: ['a/'] });
    mkdirSync(join(root, 'a'));
    writeFileSync(join(root, 'a/kept.ts'), 'as it was\n');
    writeFileSync(join(root, 'a/gone.ts'), 'here\n');
    gitIn(root)('add', '-A');
    gitIn(root)('commit', '--quiet', '-m', 'Two files');
    passes(root, ['claim', 'T-0001']);
    const tree = treeOf(root);
    commitIn(root, 'T-0001', 'a/committed.ts');
    rmSync(join(tree, 'a/gone.ts'));
    writeFileSync(join(tree, 'a/untracked.ts'), 'new\n');
    // A file only touched, its content the same, is no change.
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(tree, 'a/kept.ts'), later, later);
    const { stdout } = passes(root, ['scope', 'T-0001']);
    assert.match(
      stdout,
      /In the scope of T-0001:\n {2}a\/committed\.ts\n {2}a\/gone\.ts\n {2}a\/untracked\.ts\n(?! )/,
    );
    assert.match(stdout, /Scope OK \(3 file\(s\) of T-0001\)\./);
  });

  test('reports a failing git command instead of reading it as no change', () => {
    // A corrupt configuration fails the command that finds the board.
    const badConfig = boardOf({ id: 'T-0001', writes: ['a/'] });
    passes(badConfig, ['claim', 'T-0001']);
    writeFileSync(join(badConfig, '.git/config'), '[broken\n');
    const configResult = refuses(
      badConfig,
      ['scope', 'T-0001'],
      /git rev-parse --path-format=absolute --git-dir --git-common-dir failed in .*bad config line 1/,
    );
    assert.equal(configResult.stdout, '');

    // A broken gitfile of the board.
    const badGitFile = boardOf({ id: 'T-0001', writes: ['a/'] });
    passes(badGitFile, ['claim', 'T-0001']);
    rmSync(join(badGitFile, '.git'), { recursive: true });
    writeFileSync(join(badGitFile, '.git'), 'gitdir: /nonexistent/gitdir\n');
    refuses(
      badGitFile,
      ['scope', 'T-0001'],
      /git rev-parse --path-format=absolute --git-dir --git-common-dir failed in /,
    );

    // A corrupt index of the tree fails the comparison with its base.
    const badIndex = boardOf({ id: 'T-0001', writes: ['a/'] });
    passes(badIndex, ['claim', 'T-0001']);
    writeFileSync(
      join(
        gitIn(treeOf(badIndex))(
          'rev-parse',
          '--path-format=absolute',
          '--git-dir',
        ),
        'index',
      ),
      'not-an-index',
    );
    refuses(badIndex, ['scope', 'T-0001'], /index/);

    // No git on PATH.
    const noGit = boardOf({ id: 'T-0001', writes: ['a/'] });
    passes(noGit, ['claim', 'T-0001']);
    const missingGit = runWithEnv(noGit, ['scope', 'T-0001'], {
      ...environment(ALICE),
      PATH: '',
    });
    assert.equal(missingGit.status, 1, missingGit.output);
    assert.match(
      missingGit.stderr,
      /git rev-parse --path-format=absolute --git-dir --git-common-dir failed in .*ENOENT/,
    );
  });

  test('refuses a task with no tree, and one whose tree is gone', () => {
    const root = boardOf(
      { id: 'T-0001', ...HELD },
      { id: 'T-0002', writes: ['b/'] },
    );
    refuses(
      root,
      ['scope', 'T-0001'],
      /T-0001 has no tree: its claim makes it/,
    );
    passes(root, ['claim', 'T-0002']);
    commitIn(root, 'T-0002', 'b/work.ts');
    gitIn(root)('worktree', 'remove', '--force', treeOf(root, 'T-0002'));
    refuses(
      root,
      ['scope', 'T-0002'],
      /T-0002's tree \S+ is not there; its branch task\/T-0002 is: a claim of the task makes it again/,
    );
  });
});

describe('the wait for a slot, in words', () => {
  test('is empty for no wait and for under half a second', () => {
    assert.equal(waitedFor(0), '');
    assert.equal(waitedFor(499), '');
  });

  test('is in seconds below a minute and in minutes above', () => {
    assert.equal(waitedFor(2200), '2 s');
    assert.equal(waitedFor(4 * 60_000), '4 min');
  });

  test('is in the Log entry of a failing sweep only when it waited', () => {
    const failures = [{ step: 'lint' }];
    assert.match(
      sweepEntry(undefined, failures, '4 min'),
      /\), after waiting 4 min for its slot, and it failed:/,
    );
    assert.doesNotMatch(sweepEntry(undefined, failures, ''), /waiting/);
  });
});

describe('submit: the wait for a slot', () => {
  const SLOTS = 'node_modules/.cache/check-slots';

  /** A claimed, logged task whose one check is `check`. */
  function submittable(check) {
    const root = boardOf({ checks: [check] });
    passes(root, ['claim', 'T-0001']);
    commitIn(root, 'T-0001', 'a/work.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    return root;
  }

  const submitEnvironment = { ...environment(ALICE), AEP_CHECK_SLOTS: '1' };

  test('a heavy check that has its slot at once says nothing of a wait', () => {
    const root = submittable('true e2e');
    const result = run(root, ['submit', 'T-0001'], {
      variables: { AEP_CHECK_SLOTS: '1' },
    });
    assert.equal(result.status, 0, result.output);
    assert.match(read(root, 'T-0001'), /- `true e2e`: pass, \d+ s\n/);
    assert.doesNotMatch(read(root, 'T-0001'), /waited/);
  });

  test('a light check says nothing of a wait', () => {
    const root = submittable('true');
    passes(root, ['submit', 'T-0001']);
    assert.doesNotMatch(read(root, 'T-0001'), /waited/);
  });

  test('a heavy check behind a held slot says how long its ticket waited', async () => {
    const root = submittable('true e2e');
    mkdirSync(join(root, SLOTS), { recursive: true });
    // A ticket of a live process holds the one slot until it is killed.
    const holder = spawn('sleep', ['60'], { stdio: 'ignore' });
    await new Promise(resolve => holder.on('spawn', resolve));
    await new Promise(resolve => setTimeout(resolve, 1100));
    writeFileSync(
      join(root, SLOTS, '000001.json'),
      JSON.stringify({
        pid: holder.pid,
        at: new Date().toISOString(),
        worker: BOB,
        task: 'T-0002',
        command: 'yarn e2e',
      }),
    );
    const submit = spawn(
      process.execPath,
      [TASK, 'submit', 'T-0001', '--root', root],
      { env: submitEnvironment },
    );
    let output = '';
    for (const stream of [submit.stdout, submit.stderr]) {
      stream.on('data', data => {
        output += data;
      });
    }
    const ended = new Promise(resolve => submit.on('close', resolve));
    const deadline = Date.now() + 30_000;
    while (!/waits for a slot/.test(output)) {
      assert.ok(Date.now() < deadline, `no wait started: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await new Promise(resolve => setTimeout(resolve, 2200));
    holder.kill();
    assert.equal(await ended, 0, output);
    const line = /- `true e2e`: pass, \d+ s, waited (\d+) s\n/.exec(
      read(root, 'T-0001'),
    );
    assert.notEqual(line, null, read(root, 'T-0001'));
    assert.ok(Number(line[1]) >= 2, `waited ${line[1]} s`);
  });
});

describe('review of a task submitted by hand before the check', () => {
  const NEON = 'antigravity/neon';
  const withTime = {
    status: 'review',
    log: `### 2026-11-20 09:21 UTC, ${NEON}\n\nDid: all of it.`,
  };
  const withWords = {
    status: 'review',
    log:
      `### 2026-11-20 08:44 UTC, ${NEON} (state established before edits)\n\nDid: half.\n\n` +
      `### 2026-11-20 08:52 UTC, ${NEON} (submitted for review)\n\nDid: the rest.`,
  };

  test('reads a heading with " UTC" after the time as an entry of its worker', () => {
    const root = boardOf({ id: 'T-0001', ...withTime });
    refuses(
      root,
      ['reject', 'T-0001'],
      /T-0001 was submitted by antigravity\/neon/,
      { worker: NEON, input: 'Not fine.' },
    );
    passes(root, ['reject', 'T-0001'], { worker: BOB, input: 'Submit it.' });
    assert.equal(statusOf(root, 'T-0001'), 'ready');
    const { stdout } = passes(root, ['lint']);
    assert.match(
      stdout,
      /T-0001-a-task\.md: the Log heading "### 2026-11-20 09:21 UTC, antigravity\/neon" is not read as an entry: a heading is "### YYYY-MM-DD HH:MM, <worker>"/,
    );
  });

  test('reads a heading with words after the worker as an entry of its worker', () => {
    const root = boardOf({ id: 'T-0001', ...withWords });
    refuses(
      root,
      ['accept', 'T-0001'],
      /T-0001 was submitted by antigravity\/neon/,
      { worker: NEON, input: 'Fine.' },
    );
    passes(root, ['reject', 'T-0001'], { worker: BOB, input: 'Found: x.' });
    assert.equal(statusOf(root, 'T-0001'), 'ready');
    assert.match(
      passes(root, ['show', 'T-0001', '--log', '3']).stdout,
      /Log, 2026-11-20 08:52 UTC, antigravity\/neon \(submitted for review\):\nDid: the rest\./,
    );
    assert.match(
      passes(root, ['lint']).stdout,
      /"### 2026-11-20 08:52 UTC, antigravity\/neon \(submitted for review\)" is not read as an entry/,
    );
  });

  test('the same headings dated since the check fail the lint', () => {
    for (const log of [
      `### 2026-11-21 09:21 UTC, ${NEON}\n\nDid.`,
      `### 2026-11-21 08:52, ${NEON} (submitted for review)\n\nDid.`,
    ]) {
      refuses(
        boardOf({ id: 'T-0001', log }),
        ['lint'],
        /is not read as an entry: a heading is "### YYYY-MM-DD HH:MM, <worker>"/,
      );
    }
  });

  test('is not accepted, from the list or not, and one whose Log names no worker is not reviewed', () => {
    // T-0002 is on SUBMITTED_BY_HAND in scripts/task.mjs for good: the list
    // holds tasks that are done, and gives one in review nothing.
    const root = boardOf(
      { id: 'T-0001', ...withTime },
      { id: 'T-0002', ...withTime, writes: ['b/'] },
      { id: 'T-0003', status: 'review', writes: ['c/'], log: '- Did: it.' },
    );
    for (const id of ['T-0001', 'T-0002']) {
      refuses(
        root,
        ['accept', id],
        new RegExp(`${id} was not submitted with "task submit"`),
        { worker: BOB, input: 'Fine.' },
      );
    }
    for (const command of ['accept', 'reject']) {
      refuses(
        root,
        [command, 'T-0003'],
        /^task: T-0003 has no Log entry that names who submitted it$/m,
        { worker: BOB, input: 'Fine.' },
      );
    }
    const result = refuses(root, ['lint'], /4 problem\(s\)/);
    for (const id of ['T-0001', 'T-0002', 'T-0003']) {
      assert.match(
        result.stderr,
        new RegExp(
          `${id}-a-task\\.md: it is in review, and its last Log entry is not the one \`task submit\` writes`,
        ),
      );
    }
    assert.match(
      result.stderr,
      /T-0003-a-task\.md: the Log has lines before its first entry/,
    );
  });
});

describe('review', () => {
  test('accept moves every backlog task whose dependencies are all done to ready, whatever its priority', () => {
    const later = { status: 'backlog', priority: 6, rfc: '0007' };
    const root = boardOf(
      { id: 'T-0001', ...IN_REVIEW, rfc: '0007', step: 'A' },
      { id: 'T-0002', status: 'backlog', 'depends-on': ['T-0001'] },
      { id: 'T-0003', status: 'backlog', 'depends-on': ['T-0001', 'T-0004'] },
      { id: 'T-0004' },
      { id: 'T-0005', status: 'backlog', 'depends-on': ['T-0010'] },
      { id: 'T-0006', ...later, step: 'B', 'depends-on': ['T-0001'] },
      { id: 'T-0007', ...later, step: 'C' },
      { id: 'T-0008', ...later, step: 'B', 'depends-on': ['T-0004'] },
      { id: 'T-0009', status: 'blocked', 'depends-on': ['T-0001'] },
      { id: 'T-0010', ...DONE },
    );
    refuses(root, ['accept', 'T-0001'], /stdin is empty/, { worker: BOB });
    const result = passes(root, ['accept', 'T-0001'], {
      worker: BOB,
      input: 'Checks: all pass.',
    });
    assert.equal(
      result.stdout,
      'T-0001 is done.\n' +
        ['T-0002', 'T-0005', 'T-0006', 'T-0007']
          .map(id => `${id} is ready: A task\n`)
          .join(''),
    );
    assert.match(read(root, 'T-0001'), /claude-code\/model-b\n\nChecks: all/);
    const statuses = readdirSync(join(root, 'work/tasks')).map(name =>
      statusOf(root, name.slice(0, 6)),
    );
    assert.deepEqual(statuses, [
      'done',
      'ready',
      'backlog',
      'ready',
      'ready',
      'ready',
      'ready',
      'backlog',
      'blocked',
      'done',
    ]);
    passes(root, ['lint']);
  });

  test('promote moves every backlog task whose dependencies are all done to ready', () => {
    const root = boardOf(
      { id: 'T-0001', ...DONE },
      { id: 'T-0002' },
      { id: 'T-0003', status: 'backlog', 'depends-on': ['T-0001'] },
      { id: 'T-0004', status: 'backlog', priority: 7, rfc: '0007', step: 'C' },
      { id: 'T-0005', status: 'backlog', 'depends-on': ['T-0001', 'T-0002'] },
      { id: 'T-0006', status: 'blocked' },
    );
    refuses(root, ['promote'], /set AEP_WORKER/, { worker: null });
    assert.equal(
      passes(root, ['promote']).stdout,
      'T-0003 is ready: A task\nT-0004 is ready: A task\n',
    );
    assert.deepEqual(
      [3, 4, 5, 6].map(number => statusOf(root, `T-000${number}`)),
      ['ready', 'ready', 'backlog', 'blocked'],
    );
    assert.equal(
      passes(root, ['promote']).stdout,
      'No task in the backlog has every dependency done.\n',
    );
    passes(root, ['lint']);
  });

  test('is not done by the worker that submitted, nor on a task not in review', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW }, { id: 'T-0002' });
    const mine = /T-0001 was submitted by cursor\/model-a: another worker/;
    refuses(root, ['accept', 'T-0001'], mine, { input: 'Fine.' });
    refuses(root, ['reject', 'T-0001'], mine, { input: 'Not fine.' });
    refuses(root, ['accept', 'T-0002'], /T-0002 is ready, not in review/, {
      worker: BOB,
      input: 'Fine.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'review');
  });

  test('accept refuses a task that was not submitted with the command', () => {
    const root = boardOf({
      id: 'T-0001',
      status: 'review',
      log: '### 2026-11-20 03:40, cursor/model-a\n\nDid: all of it. Ready for review.',
    });
    refuses(
      root,
      ['accept', 'T-0001'],
      /T-0001 was not submitted with "task submit"/,
      {
        worker: BOB,
        input: 'Fine.',
      },
    );
    assert.equal(statusOf(root, 'T-0001'), 'review');
    passes(root, ['reject', 'T-0001'], { worker: BOB, input: 'Submit it.' });
  });

  test('accepts a decision, or a task that needs the owner, from the owner only', () => {
    const root = boardOf(
      { id: 'T-0001', ...IN_REVIEW, kind: 'decision' },
      { id: 'T-0002', ...IN_REVIEW, needs: ['owner'] },
    );
    const owner = /accepted by the owner only/;
    refuses(root, ['accept', 'T-0001'], owner, { worker: BOB, input: 'Yes.' });
    refuses(root, ['accept', 'T-0002', '--owner'], owner, {
      worker: BOB,
      input: 'Yes.',
    });
    passes(root, ['accept', 'T-0001', '--owner'], {
      worker: 'person/owner',
      input: 'Decided.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'done');
  });

  test('reject gives the task back with the findings', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW });
    passes(root, ['reject', 'T-0001'], {
      worker: BOB,
      input: 'Found: the test of x fails.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'ready');
    assert.match(read(root, 'T-0001'), /Found: the test of x fails\.\n$/);
    passes(root, ['claim', 'T-0001']);
  });
});

describe('a review mark', () => {
  const CAROL = 'antigravity/model-c';
  const time = (offset = 0) =>
    new Date(Date.now() + offset).toISOString().replace(/\.\d{3}Z$/, 'Z');
  /** A task in review that `by` reviews, beaten `ago` ms ago. */
  const marked = (by, ago = 0) => ({
    ...IN_REVIEW,
    review: { by, since: '2026-11-20T05:00:00Z', beat: time(-ago) },
  });
  const STALE = 5 * 60 * 60 * 1000;
  const MARK =
    /^review:\n {2}by: (\S+)\n {2}since: (\S+Z)\n {2}beat: (\S+Z)\n---$/m;

  test('review records who reviews and since when, in the frontmatter as a claim', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW });
    const result = passes(root, ['review', 'T-0001'], { worker: BOB });
    assert.match(
      result.stdout,
      /T-0001 is under review by claude-code\/model-b since \S+Z, beat \S+Z\./,
    );
    const [, by, since, beat] = MARK.exec(read(root, 'T-0001'));
    assert.equal(by, BOB);
    assert.equal(since, beat);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    assert.match(
      passes(root, ['show', 'T-0001'], { worker: null }).stdout,
      /^Under review by claude-code\/model-b since \S+Z, beat \S+Z$/m,
    );
    assert.match(
      passes(root, ['board'], { worker: null }).stdout,
      /^review \(1\)\n {2}T-0001 {2}p1 {2}A task\n\s+under review by claude-code\/model-b, since \S+Z, beat \S+Z\n/m,
    );
    passes(root, ['lint']);
  });

  test('review is refused while another reviewer\u2019s mark holds, and for the submitter', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW }, { id: 'T-0002' });
    refuses(
      root,
      ['review', 'T-0001'],
      /T-0001 was submitted by cursor\/model-a: another worker reviews/,
    );
    refuses(root, ['review', 'T-0002'], /T-0002 is ready, not in review/, {
      worker: BOB,
    });
    refuses(root, ['review', 'T-0001'], /set AEP_WORKER/, { worker: null });
    passes(root, ['review', 'T-0001'], { worker: BOB });
    const before = read(root, 'T-0001');
    refuses(
      root,
      ['review', 'T-0001'],
      /T-0001 is under review by claude-code\/model-b, since \S+Z, beat \S+Z: take another task/,
      { worker: CAROL },
    );
    assert.equal(read(root, 'T-0001'), before);
  });

  test('review again by its reviewer keeps the start and beats the mark', () => {
    const root = boardOf({ id: 'T-0001', ...marked(BOB, 60_000) });
    passes(root, ['review', 'T-0001'], { worker: BOB });
    const [, by, since, beat] = MARK.exec(read(root, 'T-0001'));
    assert.equal(by, BOB);
    assert.equal(since, '2026-11-20T05:00:00Z');
    assert.ok(Date.parse(beat) > Date.now() - 30_000, beat);
  });

  test('of two reviewers at once, exactly one marks the task', async () => {
    const ids = ['T-0001', 'T-0002', 'T-0003', 'T-0004'];
    const root = boardOf(
      ...ids.map(id => ({ id, ...IN_REVIEW, writes: [`${id}/`] })),
    );
    const reviewed = (id, worker) =>
      new Promise(done => {
        spawn(process.execPath, [TASK, 'review', id, '--root', root], {
          env: environment(worker),
          stdio: 'ignore',
        }).on('exit', code => done({ worker, code }));
      });
    for (const id of ids) {
      const results = await Promise.all([
        reviewed(id, BOB),
        reviewed(id, CAROL),
      ]);
      const winners = results.filter(result => result.code === 0);
      assert.equal(winners.length, 1, `${id}: ${JSON.stringify(results)}`);
      assert.equal(MARK.exec(read(root, id))[1], winners[0].worker);
    }
    passes(root, ['lint']);
  });

  test('beat keeps the mark alive for its reviewer only', () => {
    const root = boardOf({ id: 'T-0001', ...marked(BOB, 60 * 60 * 1000) });
    assert.match(
      passes(root, ['beat', 'T-0001'], { worker: BOB }).stdout,
      /^T-0001: review beat \S+Z\n$/,
    );
    const [, , since, beat] = MARK.exec(read(root, 'T-0001'));
    assert.equal(since, '2026-11-20T05:00:00Z');
    assert.ok(Date.parse(beat) > Date.now() - 30_000, beat);
    refuses(
      root,
      ['beat', 'T-0001'],
      /T-0001 is neither claimed nor under review by antigravity\/model-c: it is review, under review by claude-code\/model-b, since /,
      {
        worker: CAROL,
      },
    );
  });

  test('next does not offer a task under review to another reviewer, and offers it again once the mark is stale', () => {
    const root = boardOf(
      { id: 'T-0001', ...marked(BOB) },
      { id: 'T-0002', ...marked(BOB, STALE) },
      { id: 'T-0003', ...IN_REVIEW },
    );
    const forCarol = passes(root, ['next'], { worker: CAROL }).stdout;
    assert.match(
      forCarol,
      /2 task\(s\) wait for a review \(3 in review\), oldest first:\n {2}T-0002 {2}p1 {2}A task\n {10}submitted 2026-11-20T03:41Z by cursor\/model-a; the review mark of claude-code\/model-b, since 2026-11-20T05:00:00Z, beat \S+Z, STALE: "review T-0002" takes it over\n {2}T-0003 {2}p1 {2}A task\n {10}submitted 2026-11-20T03:41Z by cursor\/model-a\n/,
    );
    assert.match(
      forCarol,
      /1 task\(s\) in review are under review by another worker, and not offered until its mark is stale:\n {2}T-0001 {2}p1 {2}A task\n {10}under review by claude-code\/model-b, since 2026-11-20T05:00:00Z, beat \S+Z\n/,
    );
    const forBob = passes(root, ['next'], { worker: BOB }).stdout;
    assert.match(
      forBob,
      /T-0001 {2}p1 {2}A task\n {10}submitted [^\n]*; under review by you since 2026-11-20T05:00:00Z\n/,
    );
    assert.doesNotMatch(forBob, /under review by another worker/);
    assert.match(
      passes(root, ['board'], { worker: null }).stdout,
      /T-0002 {2}p1 {2}A task\n\s+under review by claude-code\/model-b, since \S+Z, beat \S+Z, STALE\n/,
    );
    // A stale mark is taken over, as a stale claim is.
    const taken = passes(root, ['review', 'T-0002'], { worker: CAROL });
    assert.match(
      taken.stdout,
      /the review mark of claude-code\/model-b, since \S+Z, beat \S+Z, STALE is taken over/,
    );
    const [, by, since] = MARK.exec(read(root, 'T-0002'));
    assert.equal(by, CAROL);
    assert.notEqual(since, '2026-11-20T05:00:00Z');
  });

  test('accept and reject by another worker are refused while the mark holds, unless the owner decides', () => {
    const root = boardOf(
      { id: 'T-0001', ...marked(BOB) },
      { id: 'T-0002', ...marked(BOB) },
      { id: 'T-0003', ...marked(BOB, STALE) },
      { id: 'T-0004', ...marked(BOB) },
    );
    const held =
      /T-0001 is under review by claude-code\/model-b, since \S+Z, beat \S+Z: claude-code\/model-b accepts or rejects it, or the owner with --owner/;
    refuses(root, ['accept', 'T-0001'], held, {
      worker: CAROL,
      input: 'Fine.',
    });
    refuses(root, ['reject', 'T-0001'], held, { worker: CAROL, input: 'No.' });
    refuses(root, ['accept', 'T-0001', '--owner'], held, {
      worker: CAROL,
      input: 'Fine.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'review');
    // The owner may always decide.
    passes(root, ['reject', 'T-0002', '--owner'], {
      worker: 'person/owner',
      input: 'No.',
    });
    assert.equal(statusOf(root, 'T-0002'), 'ready');
    passes(root, ['accept', 'T-0004', '--owner'], {
      worker: 'person/owner',
      input: 'Yes.',
    });
    assert.equal(statusOf(root, 'T-0004'), 'done');
    // A stale mark holds nobody back.
    passes(root, ['accept', 'T-0003'], { worker: CAROL, input: 'Fine.' });
    // The reviewer decides, and the verdict ends the mark.
    passes(root, ['accept', 'T-0001'], { worker: BOB, input: 'Checks: pass.' });
    for (const id of ['T-0001', 'T-0002', 'T-0003', 'T-0004']) {
      assert.doesNotMatch(read(root, id), /^review:/m, id);
    }
    passes(root, ['lint']);
  });

  test('reject by the reviewer ends the mark, and the task is claimed again', () => {
    const root = boardOf({ id: 'T-0001', ...marked(BOB) });
    passes(root, ['reject', 'T-0001'], { worker: BOB, input: 'Found: x.' });
    assert.doesNotMatch(read(root, 'T-0001'), /^review:/m);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['lint']);
  });

  test('withdraw by the submitter clears the mark', () => {
    const root = boardOf({ id: 'T-0001', ...marked(BOB) });
    const result = passes(root, ['withdraw', 'T-0001'], {
      input: 'Back to fix y.',
    });
    assert.match(
      result.stderr,
      /T-0001 was under review by claude-code\/model-b; the withdrawal ends that review/,
    );
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    assert.doesNotMatch(read(root, 'T-0001'), /^review:/m);
    passes(root, ['lint']);
  });

  test('review --drop gives the mark back, for its reviewer only', () => {
    const root = boardOf(
      { id: 'T-0001', ...marked(BOB) },
      { id: 'T-0002', ...IN_REVIEW },
    );
    refuses(
      root,
      ['review', 'T-0001', '--drop'],
      /T-0001 is not under review by antigravity\/model-c: it is under review by claude-code\/model-b/,
      {
        worker: CAROL,
      },
    );
    refuses(
      root,
      ['review', 'T-0002', '--drop'],
      /T-0002 is not under review by antigravity\/model-c$/m,
      {
        worker: CAROL,
      },
    );
    passes(root, ['review', 'T-0001', '--drop'], { worker: BOB });
    assert.doesNotMatch(read(root, 'T-0001'), /^review:/m);
    assert.match(
      passes(root, ['next'], { worker: CAROL }).stdout,
      /2 task\(s\) wait for a review/,
    );
  });

  test('--drop is taken by review alone, and every subcommand refuses an option it does not take', () => {
    const root = boardOf({ id: 'T-0001', ...marked(BOB) });
    const before = read(root, 'T-0001');
    for (const command of [
      ['beat', 'T-0001', '--drop'],
      ['accept', 'T-0001', '--drop'],
      ['reject', 'T-0001', '--drop'],
      ['withdraw', 'T-0001', '--drop'],
    ]) {
      refuses(
        root,
        command,
        new RegExp(`^task: ${command[0]} does not take --drop`, 'm'),
        { worker: BOB, input: 'Findings.' },
      );
    }
    refuses(
      root,
      ['beat', 'T-0001', '--blocked', '--owner'],
      /^task: beat does not take --blocked, --owner; it takes no option but --root$/m,
      { worker: BOB },
    );
    refuses(
      root,
      ['next', '--log', '3'],
      /^task: next does not take --log; it takes --can$/m,
      { worker: BOB },
    );
    assert.equal(read(root, 'T-0001'), before);
    passes(root, ['review', 'T-0001', '--drop'], { worker: BOB });
    assert.doesNotMatch(read(root, 'T-0001'), /^review:/m);
  });

  test('lint holds the mark to the schema, and to a task in review', () => {
    const root = boardOf(
      { id: 'T-0001', ...marked(BOB) },
      {
        id: 'T-0002',
        ...DONE,
        review: {
          by: BOB,
          since: '2026-11-20T05:00:00Z',
          beat: '2026-11-20T05:00:00Z',
        },
      },
      {
        id: 'T-0003',
        ...IN_REVIEW,
        review: { by: 'bob', since: 'now', beat: '2026-11-20T05:00:00Z' },
      },
    );
    const result = refuses(root, ['lint'], /3 problem\(s\) on the task board/);
    assert.match(
      result.stderr,
      /T-0002-a-task\.md: a task has a review mark only while it is in review; this one is done/,
    );
    assert.match(
      result.stderr,
      /T-0003-a-task\.md: review\.by: "bob" does not match/,
    );
    assert.match(
      result.stderr,
      /T-0003-a-task\.md: review\.since: "now" does not match/,
    );
    assert.doesNotMatch(result.stderr, /T-0001/);
  });
});

describe('withdraw', () => {
  test('takes a task in review back to in-progress for its submitter, with a claim and Log entry', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW, needs: ['owner'] });
    const result = passes(root, ['withdraw', 'T-0001'], {
      input: 'Withdrawn to fix four points from review.',
    });
    assert.match(
      result.stdout,
      /T-0001 is withdrawn: in-progress, held by cursor\/model-a\./,
    );
    assert.match(
      readFileSync(join(root, 'work/claims/T-0001/claim'), 'utf8'),
      /^cursor\/model-a \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n$/,
    );
    assert.match(
      read(root, 'T-0001'),
      /^status: in-progress$[\s\S]*^claim:\n {2}by: cursor\/model-a\n {2}since: (\S+Z)\n {2}beat: \1\n---$/m,
    );
    assert.match(
      read(root, 'T-0001'),
      /### \d{4}-\d{2}-\d{2} \d{2}:\d{2}, cursor\/model-a\n\nWithdrawn to fix four points from review\.\n$/,
    );
    passes(root, ['lint']);

    // The submitter can work on it, log, submit again, and another worker can accept.
    commitIn(root, 'T-0001', 'a/fixed.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: fixed the four points.' });
    passes(root, ['submit', 'T-0001']);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    passes(root, ['accept', 'T-0001', '--owner'], {
      worker: 'person/owner',
      input: 'Checks: pass.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'done');
    passes(root, ['lint']);
  });

  test('refuses any worker other than the submitter, empty stdin, or a task not in review', () => {
    const root = boardOf(
      { id: 'T-0001', ...IN_REVIEW },
      { id: 'T-0002', writes: ['b/'] },
      { id: 'T-0003', ...HELD, writes: ['c/'] },
      { id: 'T-0004', ...DONE, writes: ['d/'] },
      { id: 'T-0005', status: 'review', writes: ['e/'], log: '- Did: it.' },
    );
    const before = read(root, 'T-0001');
    for (const worker of [BOB, 'person/owner']) {
      refuses(
        root,
        ['withdraw', 'T-0001'],
        /T-0001 was submitted by cursor\/model-a: only cursor\/model-a can withdraw it/,
        { worker, input: 'Taking it.' },
      );
    }
    refuses(root, ['withdraw', 'T-0001'], /stdin is empty/);
    assert.equal(read(root, 'T-0001'), before);
    assert.equal(existsSync(join(root, 'work/claims')), false);

    refuses(root, ['withdraw', 'T-0002'], /T-0002 is ready, not in review/, {
      input: 'Why.',
    });
    refuses(
      root,
      ['withdraw', 'T-0003'],
      /T-0003 is in-progress, not in review/,
      { worker: BOB, input: 'Why.' },
    );
    refuses(root, ['withdraw', 'T-0004'], /T-0004 is done, not in review/, {
      input: 'Why.',
    });
    refuses(
      root,
      ['withdraw', 'T-0005'],
      /T-0005 has no Log entry that names who submitted it/,
      { input: 'Why.' },
    );
  });

  test('refuses a task in review whose last Log entry is not the one submit writes', () => {
    const byHand = '### 2026-11-20 03:40, cursor/model-a\n\nDid: all of it.';
    const root = boardOf(
      // Moved to review by editing the file.
      { id: 'T-0001', status: 'review', log: byHand },
      // Submitted by one worker, then an entry of another added by hand.
      {
        id: 'T-0002',
        status: 'review',
        writes: ['b/'],
        log: `${IN_REVIEW.log}\n\n### 2026-11-20 03:50, claude-code/model-b\n\nMine now.`,
      },
      // The words of submit under a heading that is not of the form.
      {
        id: 'T-0003',
        status: 'review',
        writes: ['c/'],
        log: SUBMISSION.replace('03:41,', '03:41 UTC,'),
      },
    );
    const refusal = id =>
      new RegExp(
        `${id} cannot be withdrawn: its last Log entry is not the one "task submit" writes`,
      );
    for (const [id, worker] of [
      ['T-0001', ALICE],
      ['T-0002', BOB],
      ['T-0002', ALICE],
      ['T-0003', ALICE],
    ]) {
      const before = read(root, id);
      refuses(root, ['withdraw', id], refusal(id), { worker, input: 'Fix.' });
      assert.equal(read(root, id), before);
    }
    assert.equal(existsSync(join(root, 'work/claims')), false);

    // A reviewer still gives such a task back.
    passes(root, ['reject', 'T-0002'], { worker: ALICE, input: 'By hand.' });
    assert.equal(statusOf(root, 'T-0002'), 'ready');
  });

  test('follows the latest submitter after a reject and resubmission by another worker', () => {
    const root = boardOf({ id: 'T-0001', ...IN_REVIEW });
    passes(root, ['reject', 'T-0001'], { worker: BOB, input: 'Found: bug.' });
    passes(root, ['claim', 'T-0001'], { worker: BOB });
    commitIn(root, 'T-0001', 'a/work.ts');
    passes(root, ['log', 'T-0001'], { worker: BOB, input: 'Did: fixed.' });
    passes(root, ['submit', 'T-0001'], { worker: BOB });

    refuses(
      root,
      ['withdraw', 'T-0001'],
      /T-0001 was submitted by claude-code\/model-b: only claude-code\/model-b can withdraw it/,
      { worker: ALICE, input: 'Mine.' },
    );
    passes(root, ['withdraw', 'T-0001'], {
      worker: BOB,
      input: 'One more fix.',
    });
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    assert.match(read(root, 'T-0001'), /^ {2}by: claude-code\/model-b$/m);
    passes(root, ['lint']);
  });

  test('refuses when a held task overlaps or a claim file already exists', () => {
    const root = boardOf(
      { id: 'T-0001', ...HELD, writes: ['a/'], appends: ['README.md'] },
      { id: 'T-0002', ...IN_REVIEW, writes: ['a/b.ts'] },
      { id: 'T-0003', ...IN_REVIEW, writes: ['c/'], appends: ['a/b.ts'] },
      { id: 'T-0004', ...IN_REVIEW, writes: ['README.md'] },
      { id: 'T-0005', ...IN_REVIEW, writes: ['c/'], appends: ['README.md'] },
      { id: 'T-0006', ...IN_REVIEW, writes: ['d/'] },
    );
    const conflict =
      /cannot be withdrawn: T-0001, held by claude-code\/model-b, changes/;
    for (const id of ['T-0002', 'T-0003', 'T-0004']) {
      refuses(root, ['withdraw', id], conflict, { input: 'Fix.' });
      assert.equal(statusOf(root, id), 'review');
    }
    claimedBy(root, 'T-0006');
    refuses(root, ['withdraw', 'T-0006'], /T-0006 is held by another worker/, {
      input: 'Fix.',
    });
    assert.equal(statusOf(root, 'T-0006'), 'review');
    // Shared appends with no writes overlap is allowed.
    passes(root, ['withdraw', 'T-0005'], { input: 'Fix.' });
    assert.equal(statusOf(root, 'T-0005'), 'in-progress');
    passes(root, ['lint']);
  });

  test('gives way to a lower id claimed in the same moment that overlaps, leaving the task intact in review', () => {
    const lower = boardOf(
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', ...IN_REVIEW, writes: ['a/b.ts'] },
    );
    const before = read(lower, 'T-0002');
    claimedBy(lower, 'T-0001');
    refuses(
      lower,
      ['withdraw', 'T-0002'],
      /T-0002 was left in review: T-0001 was claimed in the same moment and overlaps it/,
      { input: 'Fix.' },
    );
    assert.equal(statusOf(lower, 'T-0002'), 'review');
    assert.equal(read(lower, 'T-0002'), before);
    assert.deepEqual(readdirSync(join(lower, 'work/claims')), ['T-0001']);
    passes(lower, ['lint']);

    const higher = boardOf(
      { id: 'T-0001', ...IN_REVIEW, writes: ['a/'] },
      { id: 'T-0002', writes: ['a/b.ts'] },
    );
    claimedBy(higher, 'T-0002');
    const result = passes(higher, ['withdraw', 'T-0001'], { input: 'Fix.' });
    assert.match(result.stderr, /T-0002 was claimed in the same moment/);
    assert.equal(statusOf(higher, 'T-0001'), 'in-progress');
  });
});

describe('a change that lands between the read and the write', () => {
  const CAROL = 'antigravity/model-c';
  /**
   * A board whose Prettier is a stand-in that prints its input. The command
   * runs it after it read the task and before it writes it, so what the
   * stand-in does first lands between the two: `once` runs in its first
   * run only, `always` in every run.
   */
  const meetingBoard = (...tasks) => {
    const root = boardOf(...tasks);
    const fake = join(root, 'node_modules/prettier');
    mkdirSync(join(fake, 'bin'), { recursive: true });
    writeFileSync(
      join(fake, 'package.json'),
      '{ "name": "prettier", "bin": { "prettier": "bin/prettier.cjs" } }\n',
    );
    writeFileSync(
      join(fake, 'bin/prettier.cjs'),
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const input = fs.readFileSync(0, 'utf8');",
        "const modules = path.join(__dirname, '../..');",
        "const once = path.join(modules, 'once.cjs');",
        "const ran = path.join(modules, 'ran.cjs');",
        "const always = path.join(modules, 'always.cjs');",
        'if (fs.existsSync(once)) {',
        '  fs.renameSync(once, ran);',
        '  require(ran);',
        '}',
        'if (fs.existsSync(always)) {',
        '  require(always);',
        '}',
        'process.stdout.write(input);',
        '',
      ].join('\n'),
    );
    return root;
  };
  const rival = (root, name, code) =>
    writeFileSync(join(root, 'node_modules', name), code);
  /** A worker's edit of a task file by hand. */
  const edit = (root, id, from, to) =>
    `const fs = require('node:fs');\n` +
    `const file = ${JSON.stringify(join(root, fileOf(id)))};\n` +
    `const text = fs.readFileSync(file, 'utf8');\n` +
    `if (!text.includes(${JSON.stringify(from)})) throw new Error('no text to edit');\n` +
    `fs.writeFileSync(file, text.replace(${JSON.stringify(from)}, ${JSON.stringify(to)}));\n`;
  /** Another worker's command, which has to pass. */
  const command = (root, worker, args, input) =>
    `const result = require('node:child_process').spawnSync(\n` +
    `  process.execPath,\n` +
    `  ${JSON.stringify([TASK, ...args, '--root', root])},\n` +
    `  { input: ${JSON.stringify(input ?? '')}, encoding: 'utf8',\n` +
    `    env: { ...process.env, AEP_WORKER: ${JSON.stringify(worker)} } },\n` +
    `);\n` +
    `if (result.status !== 0) throw new Error(result.stderr);\n`;
  const landed = root =>
    assert.ok(
      existsSync(join(root, 'node_modules/ran.cjs')),
      'the change landed between the read and the write',
    );
  const STARTS_AGAIN =
    /task: work\/tasks\/T-000\d-a-task\.md changed since this command read it \(another command, or an edit by hand\), so the command did not write it: it starts again from the board as it is now/;
  const entry = (worker, text) =>
    new RegExp(
      `### \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}, ${worker}\\n\\n${text}`,
    );

  test('claim keeps an edit of the task by hand, and claims the task as it is now', () => {
    const root = meetingBoard({ id: 'T-0001' });
    rival(root, 'once.cjs', edit(root, 'T-0001', 'Why.', 'Why, in full.'));
    const result = passes(root, ['claim', 'T-0001']);
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.match(read(root, 'T-0001'), /^Why, in full\.$/m);
    assert.match(read(root, 'T-0001'), /^ {2}by: cursor\/model-a$/m);
    assert.deepEqual(readdirSync(join(root, 'work/claims')), ['T-0001']);
    passes(root, ['lint']);
  });

  test('claim leaves no claim behind when the task is no longer ready', () => {
    const root = meetingBoard({ id: 'T-0001' });
    rival(
      root,
      'once.cjs',
      edit(root, 'T-0001', 'status: ready', 'status: dropped'),
    );
    refuses(root, ['claim', 'T-0001'], /it is dropped, not ready/);
    landed(root);
    assert.equal(statusOf(root, 'T-0001'), 'dropped');
    assert.match(read(root, 'T-0001'), /^claim:\n---$/m);
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
    passes(root, ['lint']);
  });

  test('beat keeps a Log entry added meanwhile', () => {
    const root = meetingBoard({ id: 'T-0001', ...HELD });
    rival(root, 'once.cjs', command(root, BOB, ['log', 'T-0001'], 'Did: one.'));
    const result = passes(root, ['beat', 'T-0001'], { worker: BOB });
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.match(read(root, 'T-0001'), entry(BOB, 'Did: one\\.\\n$'));
    assert.match(read(root, 'T-0001'), /^ {2}since: 2026-11-20T02:10:00Z$/m);
    passes(root, ['lint']);
  });

  test('log adds its entry after the one added meanwhile', () => {
    const root = meetingBoard({ id: 'T-0001', ...HELD });
    rival(root, 'once.cjs', command(root, BOB, ['log', 'T-0001'], 'Did: one.'));
    const result = passes(root, ['log', 'T-0001'], {
      worker: BOB,
      input: 'Did: two.',
    });
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.match(
      read(root, 'T-0001'),
      /## Log\n\n### [^\n]*, claude-code\/model-b\n\nDid: one\.\n\n### [^\n]*, claude-code\/model-b\n\nDid: two\.\n$/,
    );
    passes(root, ['lint']);
  });

  test('submit keeps a Log entry added meanwhile, and its own entry is the last', () => {
    const root = meetingBoard({ id: 'T-0001' });
    passes(root, ['claim', 'T-0001']);
    commitIn(root, 'T-0001', 'a/work.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    rival(
      root,
      'once.cjs',
      command(root, ALICE, ['log', 'T-0001'], 'Did: more.'),
    );
    const result = passes(root, ['submit', 'T-0001']);
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.equal(statusOf(root, 'T-0001'), 'review');
    assert.match(
      read(root, 'T-0001'),
      /Did: the work\.\n\n### [^\n]*\n\nDid: more\.\n\n### [^\n]*\n\nSubmitted for review\./,
    );
    assert.deepEqual(readdirSync(join(root, 'work/claims/T-0001')), ['tree']);
    passes(root, ['lint']);
  });

  test('release keeps a Log entry added meanwhile', () => {
    const root = meetingBoard({ id: 'T-0001', ...HELD });
    rival(root, 'once.cjs', command(root, BOB, ['log', 'T-0001'], 'Did: one.'));
    const result = passes(root, ['release', 'T-0001'], {
      worker: BOB,
      input: 'Left: the rest.',
    });
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.equal(statusOf(root, 'T-0001'), 'ready');
    assert.match(
      read(root, 'T-0001'),
      /Did: one\.\n\n### [^\n]*\n\nLeft: the rest\.\n$/,
    );
    passes(root, ['lint']);
  });

  test('withdraw does not undo an acceptance that landed meanwhile', () => {
    const root = meetingBoard(
      { id: 'T-0001', ...IN_REVIEW },
      {
        id: 'T-0002',
        status: 'backlog',
        'depends-on': ['T-0001'],
        writes: ['b/'],
      },
    );
    rival(
      root,
      'once.cjs',
      command(root, BOB, ['accept', 'T-0001'], 'Checks: pass.'),
    );
    const result = refuses(
      root,
      ['withdraw', 'T-0001'],
      /T-0001 is done, not in review/,
      { input: 'One more fix.' },
    );
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.equal(statusOf(root, 'T-0001'), 'done');
    assert.match(read(root, 'T-0001'), entry(BOB, 'Checks: pass\\.\\n$'));
    assert.match(read(root, 'T-0001'), /^claim:\n---$/m);
    assert.doesNotMatch(read(root, 'T-0001'), /One more fix/);
    assert.equal(statusOf(root, 'T-0002'), 'ready');
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
    passes(root, ['lint']);
  });

  test('accept does not take a task that was withdrawn meanwhile', () => {
    const root = meetingBoard(
      { id: 'T-0001', ...IN_REVIEW },
      {
        id: 'T-0002',
        status: 'backlog',
        'depends-on': ['T-0001'],
        writes: ['b/'],
      },
    );
    rival(
      root,
      'once.cjs',
      command(root, ALICE, ['withdraw', 'T-0001'], 'One more fix.'),
    );
    const result = refuses(
      root,
      ['accept', 'T-0001'],
      /T-0001 is in-progress, not in review/,
      { worker: BOB, input: 'Checks: pass.' },
    );
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.equal(statusOf(root, 'T-0001'), 'in-progress');
    assert.match(read(root, 'T-0001'), /^ {2}by: cursor\/model-a$/m);
    assert.match(read(root, 'T-0001'), entry(ALICE, 'One more fix\\.\\n$'));
    assert.equal(statusOf(root, 'T-0002'), 'backlog');
    assert.deepEqual(readdirSync(join(root, 'work/claims')), ['T-0001']);
    passes(root, ['lint']);
  });

  test('reject does not give back a task that was accepted meanwhile', () => {
    const root = meetingBoard({ id: 'T-0001', ...IN_REVIEW });
    rival(
      root,
      'once.cjs',
      command(root, CAROL, ['accept', 'T-0001'], 'Checks: pass.'),
    );
    const result = refuses(
      root,
      ['reject', 'T-0001'],
      /T-0001 is done, not in review/,
      { worker: BOB, input: 'Found: a bug.' },
    );
    landed(root);
    assert.match(result.stderr, STARTS_AGAIN);
    assert.equal(statusOf(root, 'T-0001'), 'done');
    assert.match(read(root, 'T-0001'), entry(CAROL, 'Checks: pass\\.\\n$'));
    assert.doesNotMatch(read(root, 'T-0001'), /Found: a bug/);
    passes(root, ['lint']);
  });

  test('promote, and the promotion of accept, leave a backlog task that was given a dependency meanwhile', () => {
    const waiting = { status: 'backlog', 'depends-on': ['T-0001'] };
    for (const [first, run] of [
      [DONE, root => passes(root, ['promote'])],
      [
        IN_REVIEW,
        root =>
          passes(root, ['accept', 'T-0001'], {
            worker: BOB,
            input: 'Checks: pass.',
          }),
      ],
    ]) {
      const root = meetingBoard(
        { id: 'T-0001', ...first },
        { id: 'T-0002', ...waiting, writes: ['b/'] },
        { id: 'T-0003', ...waiting, writes: ['c/'] },
        { id: 'T-0004', writes: ['d/'] },
      );
      // The first task file that a promotion formats is that of T-0002.
      const promotion = edit(
        root,
        'T-0002',
        '  - T-0001',
        '  - T-0001\n  - T-0004',
      );
      rival(
        root,
        'once.cjs',
        `if (!/^status: done$/m.test(require('node:fs').readFileSync(${JSON.stringify(join(root, fileOf('T-0001')))}, 'utf8'))) {\n` +
          `  require('node:fs').copyFileSync(__filename, ${JSON.stringify(join(root, 'node_modules/once.cjs'))});\n` +
          `} else {\n${promotion}}\n`,
      );
      const result = run(root);
      assert.match(read(root, 'T-0002'), /^ {2}- T-0004$/m);
      assert.match(result.stderr, STARTS_AGAIN);
      assert.equal(statusOf(root, 'T-0002'), 'backlog');
      assert.equal(statusOf(root, 'T-0003'), 'ready');
      assert.doesNotMatch(result.stdout, /T-0002 is ready/);
      passes(root, ['lint']);
    }
  });

  test('a command is refused, with nothing of its own written, when the task changes every time it reads it', () => {
    const root = meetingBoard({ id: 'T-0001', ...HELD });
    rival(
      root,
      'always.cjs',
      `require('node:fs').appendFileSync(${JSON.stringify(join(root, fileOf('T-0001')))}, 'By hand.\\n');\n`,
    );
    const result = refuses(
      root,
      ['log', 'T-0001'],
      /task: work\/tasks\/T-0001-a-task\.md changed since this command read it \(another command, or an edit by hand\), so the command did not write it, 3 times over\. Run the command again/,
      { worker: BOB, input: 'Did: one.' },
    );
    assert.equal(result.stderr.match(/starts again/g).length, 2);
    assert.equal(
      read(root, 'T-0001'),
      `${taskText({ id: 'T-0001', ...HELD })}${'By hand.\n'.repeat(3)}`,
    );
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
  });
});

describe('two commands at once', () => {
  /** Runs the command without waiting for it; `input` is written `after` ms. */
  const started = (root, command, { worker = BOB, input, after = 0 } = {}) =>
    new Promise(done => {
      const child = spawn(
        process.execPath,
        [TASK, ...command, '--root', root],
        { env: environment(worker), stdio: ['pipe', 'ignore', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', chunk => (stderr += chunk));
      child.on('exit', code => done({ code, stderr }));
      setTimeout(() => child.stdin.end(input ?? ''), after);
    });
  const LOCK = 'work/claims/T-0001-a-task.md.lock';

  test('of two Log entries written at once, both are kept', async () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    for (const round of [1, 2, 3, 4, 5, 6]) {
      const results = await Promise.all(
        ['a', 'b'].map(name =>
          started(root, ['log', 'T-0001'], {
            input: `Did: ${round}${name}.`,
          }),
        ),
      );
      assert.deepEqual(
        results.map(result => result.code),
        [0, 0],
        JSON.stringify(results),
      );
      for (const name of ['a', 'b']) {
        assert.ok(read(root, 'T-0001').includes(`Did: ${round}${name}.\n`));
      }
    }
    assert.equal(read(root, 'T-0001').match(/^### /gm).length, 12);
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
    passes(root, ['lint']);
  });

  test('a command waits while another writes the task file', async () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    const before = read(root, 'T-0001');
    mkdirSync(join(root, 'work/claims'));
    writeFileSync(join(root, LOCK), '1\n');
    const logged = started(root, ['log', 'T-0001'], { input: 'Did: one.' });
    await new Promise(done => setTimeout(done, 1000));
    assert.equal(read(root, 'T-0001'), before);
    rmSync(join(root, LOCK));
    const result = await logged;
    assert.equal(result.code, 0, result.stderr);
    assert.match(read(root, 'T-0001'), /Did: one\.\n$/);
    assert.deepEqual(readdirSync(join(root, 'work/claims')), []);
  });

  test('a command is refused when the file of a write stays, and says how to go on', () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    const before = read(root, 'T-0001');
    mkdirSync(join(root, 'work/claims'));
    writeFileSync(join(root, LOCK), '1\n');
    refuses(
      root,
      ['log', 'T-0001'],
      /task: work\/tasks\/T-0001-a-task\.md is not written: work\/claims\/T-0001-a-task\.md\.lock is still there after 5 s\. A task command holds it only for the moment it writes the task file; if no task command is running, one was killed in that moment: remove work\/claims\/T-0001-a-task\.md\.lock and run the command again/,
      { worker: BOB, input: 'Did: one.' },
    );
    assert.equal(read(root, 'T-0001'), before);
    assert.ok(existsSync(join(root, LOCK)));
  });

  test('a command waits for an entry that is not on stdin yet', async () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    const result = await started(root, ['log', 'T-0001'], {
      input: 'Did: one.',
      after: 700,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(read(root, 'T-0001'), /Did: one\.\n$/);
  });

  test('a command waits for an entry on a pipe that its other holder made non-blocking', async () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    // The wrapper hands its stdin to the command and then reads the property
    // `process.stdin`, which makes the pipe they share non-blocking.
    const wrapper =
      "const { spawn } = require('node:child_process');\n" +
      `const child = spawn(process.execPath, ${JSON.stringify([TASK, 'log', 'T-0001', '--root', root])}, { stdio: 'inherit' });\n` +
      'process.stdin.pause();\n' +
      "child.on('exit', code => process.exit(code));\n";
    const result = await new Promise(done => {
      const child = spawn(process.execPath, ['-e', wrapper], {
        env: environment(BOB),
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', chunk => (stderr += chunk));
      child.on('exit', code => done({ code, stderr }));
      setTimeout(() => child.stdin.end('Did: one.'), 700);
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(read(root, 'T-0001'), /Did: one\.\n$/);
  });
});

describe('Prettier', () => {
  const MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));
  const PRETTIER = join(MODULES, 'prettier');
  const installed = existsSync(join(PRETTIER, 'bin/prettier.cjs'));
  /**
   * A board with the repository's Prettier and its configuration: the
   * `prettier` key of the repository's package.json, resolved from its
   * node_modules as Prettier resolves it there.
   */
  const formattedBoard = (...tasks) => {
    const root = boardOf(...tasks);
    symlinkSync(MODULES, join(root, 'node_modules'), 'dir');
    const { prettier } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ prettier })}\n`,
    );
    return root;
  };
  const checked = (root, id) => {
    const result = spawnSync(
      process.execPath,
      [join(PRETTIER, 'bin/prettier.cjs'), '--check', fileOf(id)],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  };
  // Prettier puts a blank line before a list and indents what continues an
  // item: an entry written as a worker types it is not as Prettier wants it.
  const entry = 'Did: two things.\n- one\ncontinued\n- two';
  // A table right after a list item: one run of Prettier indents it under
  // the item, the next aligns its columns.
  const table =
    'Did: the checks.\n\n- two\n| Check | Result |\n|---|---|\n| a | b |';

  test(
    'formats every task file the command writes',
    { skip: !installed && 'Prettier is not installed in this checkout' },
    () => {
      const root = formattedBoard(
        { id: 'T-0001', writes: ['a/'] },
        { id: 'T-0002', writes: ['b/'], needs: ['owner'] },
      );
      const step = (command, id, options) => {
        const result = passes(root, command, options);
        assert.doesNotMatch(result.stderr, /without Prettier/);
        checked(root, id);
      };
      step(['claim', 'T-0001'], 'T-0001');
      step(['claim', 'T-0002', '--owner-told'], 'T-0002');
      step(['beat', 'T-0001'], 'T-0001');
      step(['log', 'T-0001'], 'T-0001', { input: entry });
      assert.match(
        read(root, 'T-0001'),
        /two things\.\n\n- one\n {2}continued\n- two\n$/,
      );
      step(['release', 'T-0002'], 'T-0002', { input: table });
      commitIn(root, 'T-0001', 'a/work.ts');
      step(['submit', 'T-0001'], 'T-0001');
      step(['reject', 'T-0001'], 'T-0001', { worker: BOB, input: table });
      step(['claim', 'T-0001'], 'T-0001');
      step(['log', 'T-0001'], 'T-0001', { input: table });
      assert.match(
        read(root, 'T-0001'),
        /\n- two\n {2}\| Check \| Result \|\n {2}\| ----- \| ------ \|\n {2}\| a {5}\| b {6}\|\n$/,
      );
      step(['submit', 'T-0001'], 'T-0001');
      step(['withdraw', 'T-0001'], 'T-0001', { input: table });
      step(['submit', 'T-0001'], 'T-0001');
      step(['accept', 'T-0001'], 'T-0001', { worker: BOB, input: table });
      passes(root, ['lint']);
    },
  );

  /** A board whose Prettier prints what `script` makes of its input. */
  const standInBoard = script => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    const fake = join(root, 'node_modules/prettier');
    mkdirSync(join(fake, 'bin'), { recursive: true });
    writeFileSync(
      join(fake, 'package.json'),
      '{ "name": "prettier", "bin": { "prettier": "bin/prettier.cjs" } }\n',
    );
    writeFileSync(join(fake, 'bin/prettier.cjs'), script);
    return root;
  };

  test('says so when Prettier does not settle, and writes what its last run made', () => {
    // A stand-in that adds a line to every text it is given.
    const root = standInBoard(
      "const input = require('node:fs').readFileSync(0, 'utf8');\n" +
        'process.stdout.write(`${input}\\n`);\n',
    );
    const result = passes(root, ['log', 'T-0001'], {
      worker: BOB,
      input: 'Did: it.',
    });
    assert.match(
      result.stderr,
      /task: work\/tasks\/T-0001-a-task\.md is written as Prettier's run 5 made it, and Prettier still changes it, so "yarn prettier --check" fails on it/,
    );
    assert.match(read(root, 'T-0001'), /Did: it\.\n{6}$/);
  });

  test('writes the file as it is when what Prettier makes of it is not a task, and says why', () => {
    const root = standInBoard("process.stdout.write('not a task\\n');\n");
    const result = passes(root, ['log', 'T-0001'], {
      worker: BOB,
      input: entry,
    });
    assert.match(
      result.stderr,
      /task: work\/tasks\/T-0001-a-task\.md is written without Prettier: what Prettier makes of it is not of the task format \(no frontmatter between two lines of ---\), so formatting it would break the task/,
    );
    assert.doesNotMatch(result.stderr, /prettier --write/);
    assert.match(
      read(root, 'T-0001'),
      /two things\.\n- one\ncontinued\n- two\n$/,
    );
    passes(root, ['lint']);
  });

  test('without Prettier writes the file as it is, and says so', () => {
    const root = boardOf({ id: 'T-0001', ...HELD });
    const result = passes(root, ['log', 'T-0001'], {
      worker: BOB,
      input: entry,
    });
    assert.match(
      result.stderr,
      /task: work\/tasks\/T-0001-a-task\.md is written without Prettier \(it is not installed\): run "yarn prettier --write work\/tasks\/T-0001-a-task\.md"/,
    );
    assert.match(
      read(root, 'T-0001'),
      /two things\.\n- one\ncontinued\n- two\n$/,
    );
  });
});

describe('the board', () => {
  const stale = {
    ...HELD,
    claim: { ...HELD.claim, beat: '2026-11-19T02:10:00Z' },
  };
  const alive = () => {
    const beat = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    return { ...HELD, claim: { ...HELD.claim, beat } };
  };

  test('board lists every task under its status, and marks a stale claim', () => {
    const root = boardOf(
      { id: 'T-0001', ...stale, writes: ['a/'] },
      { id: 'T-0002', ...alive(), writes: ['b/'] },
      { id: 'T-0003', status: 'done' },
    );
    const { stdout } = passes(root, ['board'], { worker: null });
    assert.match(
      stdout,
      /^in-progress \(2\)\n {2}T-0001 {2}p1 {2}A task\n\s+claude-code\/model-b, since 2026-11-20T02:10:00Z, beat 2026-11-19T02:10:00Z, STALE\n {2}T-0002 {2}p1 {2}A task\n[^\n]*Z\nreview \(0\)\n/,
    );
    assert.match(stdout, /\ndone \(1\)\n {2}T-0003 {2}p1 {2}A task\n/);
  });

  test('next lists what can be claimed now, by priority', () => {
    const root = boardOf(
      { id: 'T-0001', ...alive(), writes: ['a/'] },
      { id: 'T-0002', writes: ['a/b.ts'] },
      { id: 'T-0003', writes: ['c/'], priority: 3 },
      { id: 'T-0004', writes: ['d/'], priority: 2, needs: ['docker'] },
      { id: 'T-0005', writes: ['e/'], needs: ['owner'] },
      { id: 'T-0006', writes: ['f/'], 'depends-on': ['T-0001'] },
      { id: 'T-0007', writes: ['g/'], status: 'backlog' },
      { id: 'T-0008', writes: ['h/'] },
    );
    claimedBy(root, 'T-0008');
    const ids = command =>
      passes(root, command, { worker: null }).stdout.match(/^T-\d{4}/gm);
    assert.deepEqual(ids(['next']), ['T-0004', 'T-0003']);
    assert.deepEqual(ids(['next', '--can', 'network']), ['T-0003']);
    assert.deepEqual(ids(['next', '--can', 'owner,docker']), [
      'T-0005',
      'T-0004',
      'T-0003',
    ]);
  });

  test('next lists a task of any priority, and says why when it lists none', () => {
    const root = boardOf(
      { id: 'T-0001', ...alive(), writes: ['a/'] },
      { id: 'T-0002', writes: ['a/b.ts'] },
      { id: 'T-0003', writes: ['c/'], needs: ['docker', 'network'] },
      { id: 'T-0004', writes: ['d/'], needs: ['owner'] },
      { id: 'T-0005', writes: ['e/'], 'depends-on': ['T-0001'] },
      { id: 'T-0006', writes: ['f/'] },
      { id: 'T-0007', writes: ['g/'], status: 'backlog' },
      { id: 'T-0008', writes: ['h/'], priority: 7, rfc: '0007', step: 'C' },
    );
    const next = command => passes(root, command, { worker: null }).stdout;
    assert.match(next(['next']), /\nT-0006 {2}p1[^\n]*\n[^\n]*\nT-0008 {2}p7/);

    claimedBy(root, 'T-0006');
    claimedBy(root, 'T-0008');
    const none = next(['next', '--can', 'docker']);
    assert.match(
      none,
      /^No task can be claimed now\. The 6 ready task\(s\), and why not each:\n/,
    );
    assert.doesNotMatch(none, /^T-\d{4}/m);
    const why = id =>
      new RegExp(`^  ${id}  p\\d  A task\\n +(.*)$`, 'm').exec(none)[1];
    assert.equal(
      why('T-0002'),
      'T-0001, held by claude-code/model-b, changes a/b.ts and a/',
    );
    assert.equal(why('T-0003'), 'it needs network, which --can does not name');
    assert.equal(why('T-0004'), 'it needs owner, which --can does not name');
    assert.equal(why('T-0005'), 'it depends on T-0001, which is in-progress');
    assert.equal(
      why('T-0006'),
      'another worker is claiming it (work/claims/T-0006)',
    );
    assert.match(
      none,
      /\n1 task\(s\) in the backlog have every dependency done \(T-0007\): "yarn task promote" makes them ready\.\n$/,
    );
    claimedBy(root, 'T-0003');
    assert.match(
      next(['next']),
      /^ {2}T-0004 [^\n]*\n +it needs the owner, who tells a worker to take it$/m,
    );

    const empty = boardOf(
      { id: 'T-0001', ...alive() },
      { id: 'T-0002', status: 'backlog', 'depends-on': ['T-0001'] },
    );
    assert.equal(
      passes(empty, ['next'], { worker: null }).stdout,
      'No task can be claimed now: no task is ready.\n',
    );
  });

  test('next lists the tasks in review that AEP_WORKER may review, oldest submission first', () => {
    const submitted = (at, by) => ({
      status: 'review',
      log:
        `### ${at}, ${by}\n\n` +
        'Submitted for review. Checks, as run by `task submit`:\n\n' +
        '- `exit 0`: pass, 0 s',
    });
    const resubmitted = {
      status: 'review',
      log:
        `${submitted('2026-11-20 01:00', ALICE).log}\n\n` +
        `### 2026-11-20 02:00, ${BOB}\n\nFound: bug.\n\n` +
        `${submitted('2026-11-20 07:00', BOB).log}`,
    };
    const root = boardOf(
      { id: 'T-0001', writes: ['a/'] },
      {
        id: 'T-0002',
        ...submitted('2026-11-20 06:00', ALICE),
        writes: ['b/'],
        priority: 1,
      },
      {
        id: 'T-0003',
        ...submitted('2026-11-20 03:00', ALICE),
        writes: ['c/'],
        priority: 4,
        kind: 'decision',
      },
      {
        id: 'T-0004',
        ...submitted('2026-11-20 04:00', ALICE),
        writes: ['d/'],
        needs: ['owner'],
      },
      {
        id: 'T-0005',
        ...submitted('2026-11-20 04:00', ALICE),
        writes: ['e/'],
      },
      {
        id: 'T-0006',
        ...submitted('2026-11-20 02:00', BOB),
        writes: ['f/'],
      },
      {
        id: 'T-0007',
        ...submitted('2026-11-20 01:00', ALICE),
        writes: ['g/'],
      },
      {
        id: 'T-0008',
        ...submitted('2026-11-20 01:30', ALICE),
        writes: ['h/'],
        claim: HELD.claim,
      },
      {
        id: 'T-0009',
        ...resubmitted,
        writes: ['i/'],
      },
    );
    claimedBy(root, 'T-0007');

    const reviewIds = output =>
      [...output.matchAll(/^ {2}(T-\d{4}) {2}p\d/gm)].map(match => match[1]);

    const forBob = passes(root, ['next'], { worker: BOB }).stdout;
    assert.match(forBob, /^T-0001 {2}p1 {2}A task\n {10}needs nothing\n\n/);
    assert.match(
      forBob,
      /\n4 task\(s\) wait for a review \(8 in review\), oldest first:\n/,
    );
    assert.deepEqual(reviewIds(forBob), [
      'T-0003',
      'T-0004',
      'T-0005',
      'T-0002',
    ]);
    assert.match(
      forBob,
      / {2}T-0003 {2}p4 {2}A task\n {10}submitted 2026-11-20T03:00Z by cursor\/model-a; accepted by the owner only\n/,
    );
    assert.match(
      forBob,
      / {2}T-0004 {2}p1 {2}A task\n {10}submitted 2026-11-20T04:00Z by cursor\/model-a; accepted by the owner only\n/,
    );
    assert.match(
      forBob,
      / {2}T-0005 {2}p1 {2}A task\n {10}submitted 2026-11-20T04:00Z by cursor\/model-a\n/,
    );
    assert.match(
      forBob,
      / {2}T-0002 {2}p1 {2}A task\n {10}submitted 2026-11-20T06:00Z by cursor\/model-a\n$/,
    );

    const forAlice = passes(root, ['next'], { worker: ALICE }).stdout;
    assert.match(
      forAlice,
      /\n2 task\(s\) wait for a review \(8 in review\), oldest first:\n/,
    );
    assert.deepEqual(reviewIds(forAlice), ['T-0006', 'T-0009']);

    const unnamed = passes(root, ['next'], { worker: null }).stdout;
    assert.match(
      unnamed,
      /\n6 task\(s\) wait for a review \(8 in review\), oldest first:\n/,
    );
    assert.deepEqual(reviewIds(unnamed), [
      'T-0006',
      'T-0003',
      'T-0004',
      'T-0005',
      'T-0002',
      'T-0009',
    ]);
  });

  test('next says how many tasks wait for a review when no task can be claimed', () => {
    const submitted = (at, by) => ({
      status: 'review',
      log:
        `### ${at}, ${by}\n\n` +
        'Submitted for review. Checks, as run by `task submit`:\n\n' +
        '- `exit 0`: pass, 0 s',
    });
    const withUnclaimableReady = boardOf(
      { id: 'T-0001', writes: ['a/'], needs: ['owner'] },
      { id: 'T-0002', ...submitted('2026-11-20 04:00', ALICE), writes: ['b/'] },
      {
        id: 'T-0003',
        ...submitted('2026-11-20 03:00', ALICE),
        writes: ['c/'],
        kind: 'decision',
      },
    );
    const forBob = passes(withUnclaimableReady, ['next'], {
      worker: BOB,
    }).stdout;
    assert.match(
      forBob,
      /^No task can be claimed now\. The 1 ready task\(s\), and why not each:\n {2}T-0001/,
    );
    assert.match(
      forBob,
      /\n\n2 task\(s\) wait for a review, oldest first:\n {2}T-0003 {2}p1 {2}A task\n {10}submitted 2026-11-20T03:00Z by cursor\/model-a; accepted by the owner only\n {2}T-0002 {2}p1 {2}A task\n {10}submitted 2026-11-20T04:00Z by cursor\/model-a\n$/,
    );

    const forAlice = passes(withUnclaimableReady, ['next'], {
      worker: ALICE,
    }).stdout;
    assert.match(
      forAlice,
      /\n\n2 task\(s\) wait for a review, none of them for cursor\/model-a to review\.\n$/,
    );

    const noReady = boardOf({
      id: 'T-0001',
      ...submitted('2026-11-20 03:00', ALICE),
    });
    assert.equal(
      passes(noReady, ['next'], { worker: BOB }).stdout,
      'No task can be claimed now: no task is ready.\n\n' +
        '1 task(s) wait for a review, oldest first:\n' +
        '  T-0001  p1  A task\n' +
        '          submitted 2026-11-20T03:00Z by cursor/model-a\n',
    );
    assert.equal(
      passes(noReady, ['next'], { worker: ALICE }).stdout,
      'No task can be claimed now: no task is ready.\n\n' +
        '1 task(s) wait for a review, none of them for cursor/model-a to review.\n',
    );
  });

  test('next offers nobody a task in review whose last Log entry is not the one submit writes', () => {
    const root = boardOf(
      { id: 'T-0001', ...IN_REVIEW },
      // Submitted by one worker, then an entry of another added by hand.
      {
        id: 'T-0002',
        status: 'review',
        writes: ['b/'],
        log: `${IN_REVIEW.log}\n\n### 2026-11-20 03:50, ${BOB}\n\nRead it.`,
      },
      // Moved to review by editing the file.
      {
        id: 'T-0003',
        status: 'review',
        writes: ['c/'],
        log: `### 2026-11-20 03:40, ${ALICE}\n\nDid: all of it.`,
      },
    );
    const notOffered =
      '\n2 task(s) in review are not offered for a review (T-0002, T-0003): ' +
      'the last Log entry of each is not the one "task submit" writes, so ' +
      'no entry tells who submitted it. A reviewer rejects each.\n';
    const start = 'No task can be claimed now: no task is ready.\n\n';
    const offered =
      '1 task(s) wait for a review (3 in review), oldest first:\n' +
      '  T-0001  p1  A task\n' +
      '          submitted 2026-11-20T03:41Z by cursor/model-a\n';

    // The worker that wrote the last entry of T-0002 did not submit it.
    assert.equal(
      passes(root, ['next'], { worker: BOB }).stdout,
      start + offered + notOffered,
    );
    // The worker that submitted T-0002 is not offered its own task.
    assert.equal(
      passes(root, ['next'], { worker: ALICE }).stdout,
      `${start}1 task(s) wait for a review, none of them for cursor/model-a ` +
        `to review.\n${notOffered}`,
    );
    assert.equal(
      passes(root, ['next'], { worker: null }).stdout,
      start + offered + notOffered,
    );

    const onlyByHand = boardOf(
      { id: 'T-0001', writes: ['a/'] },
      {
        id: 'T-0002',
        status: 'review',
        writes: ['b/'],
        log: `### 2026-11-20 03:40, ${ALICE}\n\nDid: all of it.`,
      },
    );
    assert.equal(
      passes(onlyByHand, ['next'], { worker: BOB }).stdout,
      'T-0001  p1  A task\n          needs nothing\n\n' +
        '1 task(s) in review are not offered for a review (T-0002): ' +
        'the last Log entry of each is not the one "task submit" writes, so ' +
        'no entry tells who submitted it. A reviewer rejects each.\n',
    );
  });

  test('next is refused with a name in AEP_WORKER that is not a worker’s', () => {
    const root = boardOf({ id: 'T-0001' }, { id: 'T-0002', ...IN_REVIEW });
    const refused = (worker, message) =>
      assert.equal(refuses(root, ['next'], message, { worker }).stdout, '');
    refused('someone@example.com', /looks like an email address/);
    refused('Some One', /AEP_WORKER is "Some One"/);
    refused('cursor', /AEP_WORKER is "cursor"/);
  });

  test('show prints the task, its dependencies and its last Log entries', () => {
    const root = boardOf(
      { id: 'T-0001', status: 'done' },
      {
        id: 'T-0002',
        ...IN_REVIEW,
        'depends-on': ['T-0001'],
        writes: ['b/', 'c.ts'],
        log: '### 2026-11-20 01:00, cursor/model-a\n\nDid: first.\n\n### 2026-11-20 02:00, cursor/model-a\n\nDid: second.',
      },
    );
    const { stdout } = passes(root, ['show', 'T-0002', '--log', '1']);
    assert.match(stdout, /^T-0002: A task\nwork\/tasks\/T-0002-a-task\.md\n/);
    assert.match(stdout, /Depends on:\n {2}T-0001 \(done\)\n/);
    assert.match(stdout, /Writes:\n {2}b\/\n {2}c\.ts\nAppends: none\n/);
    assert.match(
      stdout,
      /Log, 2026-11-20 02:00, cursor\/model-a:\nDid: second/,
    );
    assert.doesNotMatch(stdout, /Did: first/);
    refuses(root, ['show', 'T-0404'], /no task T-0404/);
  });

  test('new writes a task with the next free id, in the backlog while a dependency is not done', () => {
    const root = boardOf({ id: 'T-0001' }, { id: 'T-0007', writes: ['b/'] });
    const { stdout, stderr } = passes(root, [
      'new',
      '--title',
      "The page's table sorts",
      '--kind',
      'fix',
      '--priority',
      '2',
      '--rfc',
      '0005',
      '--step',
      '1.11',
      '--depends-on',
      'T-0001,T-0007',
      '--writes',
      'apps/web/src/pages/catalog/',
      '--check',
      'yarn platform:check',
      '--check',
      'yarn prettier:check',
    ]);
    assert.equal(stdout, 'work/tasks/T-0008-the-page-s-table-sorts.md\n');
    assert.match(
      stderr,
      /^task: T-0008 is in the backlog: it waits for T-0001 \(ready\), T-0007 \(ready\)$/m,
    );
    const text = readFileSync(join(root, stdout.trim()), 'utf8');
    assert.match(
      text,
      /^---\nid: T-0008\ntitle: 'The page''s table sorts'\nstatus: backlog\nkind: fix\nstep: '1\.11'\nrfc: '0005'\npriority: 2\ndepends-on:\n {2}- T-0001\n {2}- T-0007\nwrites:\n {2}- apps\/web\/src\/pages\/catalog\/\nappends: \[\]\nneeds: \[\]\nchecks:\n {2}- yarn platform:check\n {2}- yarn prettier:check\nclaim:\n---\n/,
    );
    passes(root, ['lint']);
    assert.match(passes(root, ['show', 'T-0008']).stdout, /The page's table/);

    const wrong = ['new', '--title', 'x', '--kind', 'chore', '--priority', '2'];
    refuses(root, wrong, /not a task: kind: "chore" is none of build/);
    refuses(root, ['new', '--title', 'x'], /a new task needs --kind/);
    assert.equal(readdirSync(join(root, 'work/tasks')).length, 3);
  });

  test('new keeps every repeated list option, and refuses a repeat of a single one', () => {
    const root = boardOf(
      { id: 'T-0001', ...DONE },
      { id: 'T-0002', ...DONE },
      { id: 'T-0003', ...DONE },
    );
    const base = ['new', '--title', 'Many', '--kind', 'fix', '--priority', '2'];
    const { stdout } = passes(root, [
      ...base,
      '--depends-on',
      'T-0001',
      '--depends-on',
      'T-0002,T-0003',
      '--writes',
      'a/',
      '--writes',
      'b/,c/',
      '--appends',
      'd.md',
      '--appends',
      'e.md',
      '--needs',
      'owner',
      '--needs',
      'docker,network',
      '--check',
      'yarn one',
      '--check',
      'yarn two',
    ]);
    const text = readFileSync(join(root, stdout.trim()), 'utf8');
    for (const [field, items] of Object.entries({
      'depends-on': ['T-0001', 'T-0002', 'T-0003'],
      writes: ['a/', 'b/', 'c/'],
      appends: ['d.md', 'e.md'],
      needs: ['owner', 'docker', 'network'],
      checks: ['yarn one', 'yarn two'],
    })) {
      assert.ok(
        text.includes(
          `${field}:\n${items.map(item => `  - ${item}\n`).join('')}`,
        ),
        field,
      );
    }
    refuses(
      root,
      [...base, '--rfc', '0005', '--rfc', '0006'],
      /--rfc takes one value/,
    );
    refuses(
      root,
      [...base, '--step', '1', '--step', '2'],
      /--step takes one value/,
    );
  });

  test('new writes a ready task when every dependency is done, claimed once its sections are written', () => {
    const root = boardOf({ id: 'T-0001', ...DONE }, { id: 'T-0002' });
    const create = (title, ...rest) =>
      passes(root, [
        'new',
        '--title',
        title,
        '--kind',
        'fix',
        '--priority',
        '6',
        '--check',
        'exit 0',
        ...rest,
      ]);
    const alone = create('Alone');
    assert.equal(alone.stdout, 'work/tasks/T-0003-alone.md\n');
    assert.match(
      alone.stderr,
      /^task: T-0003 is ready; it can be claimed once its sections are written$/m,
    );
    create('After a done task', '--depends-on', 'T-0001');
    create('After a ready task', '--depends-on', 'T-0001,T-0002');
    create('After no task', '--depends-on', 'T-0404');
    const status = name =>
      /^status: (.*)$/m.exec(
        readFileSync(join(root, 'work/tasks', name), 'utf8'),
      )[1];
    assert.equal(status('T-0003-alone.md'), 'ready');
    assert.equal(status('T-0004-after-a-done-task.md'), 'ready');
    assert.equal(status('T-0005-after-a-ready-task.md'), 'backlog');
    assert.equal(status('T-0006-after-no-task.md'), 'backlog');
    rmSync(join(root, 'work/tasks/T-0006-after-no-task.md'));
    passes(root, ['lint']);

    const unwritten =
      /T-0003 cannot be claimed: its author has not written ## Context, ## Done when, ## Out of scope yet \("To be written\."\)/;
    refuses(root, ['claim', 'T-0003'], unwritten);
    assert.doesNotMatch(passes(root, ['next']).stdout, /^T-000[34]/m);
    const file = join(root, 'work/tasks/T-0003-alone.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replaceAll('To be written.', 'Written.'),
    );
    assert.match(passes(root, ['next']).stdout, /^T-0003 {2}p6 {2}Alone$/m);
    passes(root, ['claim', 'T-0003']);
  });

  test('an unknown subcommand prints the usage', () => {
    const result = run(boardOf(), ['take', 'T-0001']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Usage: node scripts\/task\.mjs/);
  });
});

/** The scripts of the root that a narrowed check is built from. */
const SCRIPTS = {
  'platform:typecheck':
    "yarn workspaces foreach --all --parallel --include 'modules/*' --exclude packages/app exec tsc",
  'platform:lint': 'oxlint --type-aware --deny-warnings apps modules packages',
  'platform:test': 'vitest run',
  'platform:check':
    'yarn platform:typecheck && yarn platform:lint && yarn platform:test',
  'prettier:check': 'prettier --check .',
  'lint:repo': 'yarn lint:code-rules && yarn lint:unused',
};

/** A shared package, one that uses it, one that uses that one, and one of its own. */
const WORKSPACE = {
  scripts: SCRIPTS,
  packages: [
    { directory: 'modules/platform', name: '@aep/platform', uses: [] },
    { directory: 'modules/jobs', name: '@aep/jobs', uses: ['@aep/platform'] },
    { directory: 'apps/server', name: '@aep/server', uses: ['@aep/jobs'] },
    { directory: 'packages/model', name: '@aep/model', uses: ['vitest'] },
    { directory: 'packages/tokens', name: '@aep/tokens', uses: [] },
    { directory: 'apps/web', name: '@aep/web', uses: ['@aep/tokens'] },
  ].map(found => ({
    ...found,
    newTree: found.directory !== 'packages/tokens',
  })),
};

describe('a check of the whole tree, narrowed to what the task changed', () => {
  const narrowed = (command, changed, deleted) =>
    narrowedCheck(command, { changed, deleted }, WORKSPACE);

  test('a change in one package runs its typecheck, lint and related tests, and no other package’s', () => {
    const { command, lines } = narrowed('yarn platform:check', [
      'apps/server/src/api.ts',
      'docs/README.md',
    ]);
    assert.equal(
      command,
      'yarn workspaces foreach --all --parallel --include apps/server exec tsc' +
        ' && yarn oxlint --type-aware --deny-warnings apps/server/src/api.ts' +
        ' && yarn vitest related --run --passWithNoTests apps/server/src/api.ts',
    );
    assert.doesNotMatch(command, /modules\/|packages\//);
    assert.deepEqual(lines, [
      'typecheck: apps/server',
      'oxlint: the 1 changed file(s)',
      'tests: those related to the 1 changed file(s)',
    ]);
  });

  test('a shared package’s change typechecks what depends on it, directly or not', () => {
    const { command, lines } = narrowed('yarn platform:check', [
      'modules/platform/src/http.ts',
    ]);
    assert.match(
      command,
      /^yarn workspaces foreach --all --parallel --include apps\/server --include modules\/jobs --include modules\/platform exec tsc && /,
    );
    assert.doesNotMatch(command, /packages\/model|apps\/web/);
    assert.equal(
      lines[0],
      'typecheck: modules/platform, and what depends on them: apps/server, modules/jobs',
    );
  });

  test('a file with no import graph, or a deleted one, runs every test of its package and its dependants', () => {
    const sql = narrowed('yarn platform:check', [
      'modules/jobs/migrations/0002_more.sql',
    ]);
    assert.match(
      sql.command,
      / && yarn platform:test --passWithNoTests apps\/server\/ modules\/jobs\/$/,
    );
    assert.doesNotMatch(sql.command, /vitest related|oxlint|modules\/platform/);
    assert.match(sql.lines.at(-1), /no import graph ties to its tests$/);
    const deleted = narrowed(
      'yarn platform:test',
      ['packages/model/src/entity.ts'],
      ['packages/model/src/gone.ts'],
    );
    assert.equal(
      deleted.command,
      'yarn vitest related --run --passWithNoTests packages/model/src/entity.ts' +
        ' && yarn platform:test --passWithNoTests packages/model/',
    );
    // A package outside the new tree is not checked; what depends on it is.
    const outside = narrowed('yarn platform:check', [
      'packages/tokens/src/colours.ts',
    ]);
    assert.equal(
      outside.command,
      'yarn workspaces foreach --all --parallel --include apps/web exec tsc' +
        ' && yarn platform:test --passWithNoTests apps/web/',
    );
  });

  test('platform:test runs only the tests, with the options of the check', () => {
    assert.equal(
      narrowed('yarn platform:test --maxWorkers=1', [
        'packages/model/src/entity.ts',
      ]).command,
      'yarn vitest related --run --passWithNoTests --maxWorkers=1 packages/model/src/entity.ts',
    );
  });

  test('the explicit flag, or a file every package reads, runs the whole tree', () => {
    assert.deepEqual(
      narrowed('AEP_WHOLE_TREE=1 yarn platform:check', [
        'apps/server/src/api.ts',
      ]),
      {
        command: 'AEP_WHOLE_TREE=1 yarn platform:check',
        lines: ['it asks for the whole tree (AEP_WHOLE_TREE=1)'],
      },
    );
    assert.deepEqual(narrowed('yarn platform:test', ['vitest.config.mts']), {
      command: 'yarn platform:test',
      lines: [
        'the whole tree: the checks of every package read vitest.config.mts',
      ],
    });
  });

  test('a check that names its files, or another check, is not narrowed; a task with no package file runs nothing', () => {
    assert.equal(
      narrowed('yarn platform:test modules/jobs', ['modules/jobs/src/a.ts']),
      undefined,
    );
    assert.equal(
      narrowed('yarn platform:typecheck', ['modules/jobs/src/a.ts']),
      undefined,
    );
    assert.deepEqual(narrowed('yarn platform:check', ['scripts/task.mjs']), {
      command: undefined,
      lines: [
        'nothing: the task changed no file of a package of the new tree, ' +
          'and none that a file of the new tree reads by path',
      ],
    });
  });
});

describe('the paths a file of the new tree reads, and the narrowed check of what reads them', () => {
  test('a path is named by import.meta.dirname, new URL or a relative import, from the root', () => {
    const source = [
      "const DEMO = join(import.meta.dirname, '../../../examples/port-demo');",
      'export const REALM = join(',
      '  import.meta.dirname,',
      "  '../../../deploy/dev/keycloak/realm.json',",
      ');',
      "const CHECK = resolve(import.meta.dirname, '../../..', 'scripts', 'check-tenancy.mjs');",
      "const REPOSITORY = join(import.meta.dirname, '../../..');",
      'const folder = resolve(import.meta.dirname, `../parity/${part}`);',
      "const PACK = join(import.meta.dirname, '..', name);",
      "const worker = new URL('../../../packages/jq/src/jqWorker.ts', import.meta.url);",
      "import application from '../../../modules/packs/src/cd/application.json';",
      "const ABOVE = join(import.meta.dirname, '../../../../elsewhere');",
      "import { a } from 'node:path';",
    ].join('\n');
    assert.deepEqual(pathsNamedBy('modules/identity/src/realm.ts', source), [
      '',
      'deploy/dev/keycloak/realm.json',
      'examples/port-demo',
      'modules/identity',
      'modules/identity/parity',
      'modules/packs/src/cd/application.json',
      'packages/jq/src/jqWorker.ts',
      'scripts/check-tenancy.mjs',
    ]);
  });

  /** The workspace of the narrowed checks, with files that read by path. */
  const READING = {
    ...WORKSPACE,
    readers: [
      {
        file: 'packages/model/src/demo.test.ts',
        directory: 'packages/model',
        path: 'examples/port-demo',
      },
      {
        file: 'modules/jobs/src/testing/realm.ts',
        directory: 'modules/jobs',
        path: 'deploy/dev/keycloak/realm.json',
      },
      {
        file: 'modules/platform/src/actor.test.ts',
        directory: 'modules/platform',
        path: '',
      },
    ],
  };
  const narrowed = (command, changed, deleted) =>
    narrowedCheck(command, { changed, deleted }, READING);
  const BOARD = 'work/tasks/T-0001-a-task.md';

  test('a changed file outside every package runs the test that reads it, and what reads the whole repository', () => {
    const { command, lines } = narrowed('yarn platform:check', [
      'examples/port-demo/blueprints.json',
      BOARD,
    ]);
    assert.equal(
      command,
      'yarn platform:test --passWithNoTests modules/platform/src/actor.test.ts packages/model/src/demo.test.ts',
    );
    assert.deepEqual(lines, [
      'tests: packages/model/src/demo.test.ts, for examples/port-demo/blueprints.json, which packages/model/src/demo.test.ts reads by path',
      'tests: modules/platform/src/actor.test.ts, for modules/platform/src/actor.test.ts read(s) the whole repository by path',
    ]);
  });

  test('a deleted file read by a module that is no test runs its package and its dependants', () => {
    const { command, lines } = narrowed(
      'yarn platform:test --maxWorkers=1',
      [],
      ['deploy/dev/keycloak/realm.json'],
    );
    assert.equal(
      command,
      'yarn platform:test --passWithNoTests --maxWorkers=1 apps/server/ modules/jobs/ modules/platform/src/actor.test.ts',
    );
    assert.equal(
      lines[0],
      'tests: every test of apps/server, modules/jobs, for deploy/dev/keycloak/realm.json, which modules/jobs/src/testing/realm.ts reads by path',
    );
  });

  test('what reads the whole repository runs for any change but the board’s, inside the tests of its package', () => {
    assert.match(
      narrowed('yarn platform:check', ['scripts/task.mjs']).command,
      /^yarn platform:test --passWithNoTests modules\/platform\/src\/actor\.test\.ts$/,
    );
    assert.deepEqual(narrowed('yarn platform:check', [BOARD]), {
      command: undefined,
      lines: [
        'nothing: the task changed no file of a package of the new tree, ' +
          'and none that a file of the new tree reads by path',
      ],
    });
    assert.match(
      narrowed('yarn platform:test', ['modules/platform/migrations/0002.sql'])
        .command,
      / modules\/platform\/$/,
    );
  });
});

describe('Prettier and the repository’s checks, narrowed to what the task changed', () => {
  const narrowed = (command, changed, parts, deleted) =>
    narrowedRepositoryCheck(command, { changed, deleted }, SCRIPTS, parts);

  test('prettier:check formats the changed files, and the whole tree for a file Prettier reads for every file', () => {
    assert.deepEqual(
      narrowed('yarn prettier:check', ['scripts/task.mjs', 'docs/a b.md']),
      {
        command:
          "yarn prettier --check --ignore-unknown scripts/task.mjs 'docs/a b.md'",
        lines: [
          'Prettier: the 2 changed file(s), but those .prettierignore ignores',
        ],
      },
    );
    assert.deepEqual(
      narrowed('yarn prettier:check', ['scripts/task.mjs', '.prettierignore']),
      {
        command: 'yarn prettier:check',
        lines: [
          'the whole tree: .prettierignore decide(s) how other files are formatted',
        ],
      },
    );
    for (const nested of [
      'apps/web/.prettierrc',
      'modules/x/.prettierrc.json',
      'modules/x/prettier.config.mjs',
      'apps/web/src/.editorconfig',
      'modules/x/package.json',
    ]) {
      assert.equal(
        narrowed('yarn prettier:check', ['scripts/task.mjs', nested]).command,
        'yarn prettier:check',
        nested,
      );
    }
    assert.deepEqual(
      narrowed('yarn prettier:check', ['scripts/task.mjs'], undefined, [
        '.prettierignore',
      ]),
      {
        command: 'yarn prettier:check',
        lines: [
          'the whole tree: .prettierignore decide(s) how other files are formatted',
        ],
      },
    );
    // A nested ignore file is not one Prettier reads from the root.
    assert.match(
      narrowed('yarn prettier:check', ['docs/.prettierignore']).command,
      /--ignore-unknown docs\/\.prettierignore$/,
    );
    assert.deepEqual(narrowed('yarn prettier:check', []), {
      command: undefined,
      lines: ['nothing: the task changed no file'],
    });
  });

  test('lint:repo runs a part that takes files on them, and every other part as it is', () => {
    const asItIs = {
      ...LINT_REPO_PARTS,
      'lint:code-rules': { files: false, reason: 'a reason' },
    };
    assert.deepEqual(narrowed('yarn lint:repo', ['scripts/a.mjs'], asItIs), {
      command: 'yarn lint:repo',
      lines: [
        'the whole repository: no part of it runs on files',
        'lint:code-rules as it is: a reason',
        `lint:unused as it is: ${LINT_REPO_PARTS['lint:unused'].reason}`,
      ],
    });
    assert.deepEqual(
      narrowed('yarn lint:repo', ['scripts/a.mjs', 'docs/b.md']),
      {
        command:
          'yarn lint:code-rules scripts/a.mjs docs/b.md && yarn lint:unused',
        lines: [
          'its parts, each as below',
          'lint:code-rules: the 2 changed file(s)',
          `lint:unused as it is: ${LINT_REPO_PARTS['lint:unused'].reason}`,
        ],
      },
    );
    // lint:code-rules reads no deleted file: a deletion breaks none of its rules.
    assert.equal(
      narrowed('yarn lint:repo', ['scripts/a.mjs'], undefined, [
        'scripts/gone.mjs',
      ]).command,
      'yarn lint:code-rules scripts/a.mjs && yarn lint:unused',
    );
    assert.equal(narrowed('yarn lint:repo', []).command, 'yarn lint:unused');
  });

  test('lint:docs runs on the changed and the deleted files', () => {
    const scripts = { 'lint:repo': 'yarn lint:docs' };
    assert.deepEqual(
      narrowedRepositoryCheck(
        'yarn lint:repo',
        { changed: ['docs/a.md'], deleted: ['docs/b.md'] },
        scripts,
      ),
      {
        command: 'yarn lint:docs docs/a.md docs/b.md',
        lines: [
          'its parts, each as below',
          'lint:docs: the 1 changed file(s) and the 1 deleted',
        ],
      },
    );
    assert.equal(
      narrowedRepositoryCheck(
        'yarn lint:repo',
        { changed: [], deleted: ['docs/b.md'] },
        scripts,
      ).command,
      'yarn lint:docs docs/b.md',
    );
  });

  test('a part runs as it is when the task changed the program its script runs', () => {
    const scripts = {
      'lint:repo': 'yarn lint:code-rules && yarn lint:docs',
      'lint:code-rules': 'node scripts/check-code-rules.mjs',
      'lint:docs': 'node scripts/check-docs.mjs',
    };
    const run = (changed, deleted = []) =>
      narrowedRepositoryCheck('yarn lint:repo', { changed, deleted }, scripts);
    assert.deepEqual(run(['scripts/check-code-rules.mjs', 'docs/a.md']), {
      command:
        'yarn lint:code-rules && yarn lint:docs scripts/check-code-rules.mjs docs/a.md',
      lines: [
        'its parts, each as below',
        'lint:code-rules as it is: the task changed scripts/check-code-rules.mjs, of the program it runs',
        'lint:docs: the 2 changed file(s)',
      ],
    });
    assert.deepEqual(run(['scripts/check-docs.mjs']), {
      command: 'yarn lint:code-rules scripts/check-docs.mjs && yarn lint:docs',
      lines: [
        'its parts, each as below',
        'lint:code-rules: the 1 changed file(s)',
        'lint:docs as it is: the task changed scripts/check-docs.mjs, of the program it runs',
      ],
    });
    assert.equal(run([], ['scripts/check-docs.mjs']).command, 'yarn lint:docs');
    // Named directly, the same holds.
    assert.equal(
      narrowedRepositoryCheck(
        'yarn lint:code-rules',
        { changed: ['scripts/check-code-rules.mjs'] },
        scripts,
      ).command,
      'yarn lint:code-rules',
    );
    // A change elsewhere still narrows.
    assert.equal(
      run(['scripts/check-docs.test.mjs', 'scripts/a.mjs']).command,
      'yarn lint:code-rules scripts/check-docs.test.mjs scripts/a.mjs && ' +
        'yarn lint:docs scripts/check-docs.test.mjs scripts/a.mjs',
    );
  });

  test('a part runs as it is when the task changed a local module its program imports', () => {
    const root = boardOf();
    const write = (file, text) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    };
    write(
      'scripts/check-code-rules.mjs',
      "import { readFileSync } from 'node:fs';\nimport { rules } from './lib/rules.mjs';\n",
    );
    write(
      'scripts/lib/rules.mjs',
      "import { words } from './shellWords.mjs';\nexport const rules = words;\n",
    );
    write('scripts/lib/shellWords.mjs', 'export const words = [];\n');
    write('scripts/check-docs.mjs', "import { join } from 'node:path';\n");
    const scripts = {
      'lint:repo': 'yarn lint:code-rules && yarn lint:docs',
      'lint:code-rules': 'node scripts/check-code-rules.mjs',
      'lint:docs': 'node scripts/check-docs.mjs',
    };
    const run = (changed, deleted = []) =>
      narrowedRepositoryCheck(
        'yarn lint:repo',
        { changed, deleted, root },
        scripts,
      );
    // A module imported through another one holds the part's rules too.
    assert.deepEqual(run(['scripts/lib/shellWords.mjs']), {
      command:
        'yarn lint:code-rules && yarn lint:docs scripts/lib/shellWords.mjs',
      lines: [
        'its parts, each as below',
        'lint:code-rules as it is: the task changed scripts/lib/shellWords.mjs, of the program it runs',
        'lint:docs: the 1 changed file(s)',
      ],
    });
    assert.equal(
      run([], ['scripts/lib/rules.mjs']).command,
      'yarn lint:code-rules && yarn lint:docs scripts/lib/rules.mjs',
    );
    // A change elsewhere still narrows, and a program that imports only
    // builtins runs as it is only when it changed.
    assert.equal(
      run(['scripts/lib/other.mjs', 'docs/a.md']).command,
      'yarn lint:code-rules scripts/lib/other.mjs docs/a.md && ' +
        'yarn lint:docs scripts/lib/other.mjs docs/a.md',
    );
    assert.equal(
      run(['scripts/check-docs.mjs']).command,
      'yarn lint:code-rules scripts/check-docs.mjs && yarn lint:docs',
    );
  });

  test('the flag runs the whole tree; a check with options or files, or another check, is not narrowed', () => {
    assert.deepEqual(
      narrowed('AEP_WHOLE_TREE=1 yarn prettier:check', ['scripts/a.mjs']),
      {
        command: 'AEP_WHOLE_TREE=1 yarn prettier:check',
        lines: ['it asks for the whole tree (AEP_WHOLE_TREE=1)'],
      },
    );
    assert.equal(
      narrowed('AEP_WHOLE_TREE=1 yarn lint:repo', ['scripts/a.mjs']).command,
      'AEP_WHOLE_TREE=1 yarn lint:repo',
    );
    assert.equal(narrowed('yarn prettier:check docs', ['a.md']), undefined);
    assert.equal(narrowed('yarn lint:docs docs', ['a.md']), undefined);
    assert.equal(narrowed('yarn lint:all', ['a.md']), undefined);
  });

  test('a part of lint:repo named directly runs as it does inside lint:repo', () => {
    assert.deepEqual(
      narrowed('yarn lint:docs', ['docs/a.md'], undefined, ['docs/b.md']),
      {
        command: 'yarn lint:docs docs/a.md docs/b.md',
        lines: ['lint:docs: the 1 changed file(s) and the 1 deleted'],
      },
    );
    assert.deepEqual(narrowed('yarn lint:docs', []), {
      command: undefined,
      lines: ['lint:docs: nothing, the task changed no file'],
    });
    assert.deepEqual(narrowed('yarn lint:code-rules', ['scripts/a.mjs']), {
      command: 'yarn lint:code-rules scripts/a.mjs',
      lines: ['lint:code-rules: the 1 changed file(s)'],
    });
    assert.deepEqual(narrowed('yarn lint:unused', ['scripts/a.mjs']), {
      command: 'yarn lint:unused',
      lines: [`lint:unused as it is: ${LINT_REPO_PARTS['lint:unused'].reason}`],
    });
    assert.deepEqual(
      narrowed('AEP_WHOLE_TREE=1 yarn lint:docs', ['docs/a.md']),
      {
        command: 'AEP_WHOLE_TREE=1 yarn lint:docs',
        lines: ['it asks for the whole tree (AEP_WHOLE_TREE=1)'],
      },
    );
  });

  test('every part of the repository’s lint:repo says how it runs', () => {
    const { scripts } = JSON.parse(
      readFileSync(join(dirname(TASK), '..', 'package.json'), 'utf8'),
    );
    const named = simpleCommands(scripts['lint:repo'], ['&&']).map(
      ({ words }) => words,
    );
    for (const [program, name, ...rest] of named) {
      assert.equal(program, 'yarn');
      assert.deepEqual(rest, []);
      assert.ok(name in LINT_REPO_PARTS, `${name} is not in LINT_REPO_PARTS`);
    }
    assert.deepEqual(
      Object.keys(LINT_REPO_PARTS).toSorted(),
      named.map(([, name]) => name).toSorted(),
    );
  });
});

/**
 * A directory with a program `yarn` that writes each call's arguments to
 * `calls` and answers as `answers` says (JavaScript run with `argv`, the
 * arguments): the commands a submit or a sweep runs, without the
 * workspace's tools.
 */
function fakeYarn(answers = '') {
  const directory = mkdtempSync(join(tmpdir(), 'aep-task-yarn-'));
  roots.push(directory);
  const program = join(directory, 'yarn');
  writeFileSync(
    program,
    `#!${process.execPath}\n` +
      "const { appendFileSync, writeFileSync } = require('node:fs');\n" +
      'const argv = process.argv.slice(2);\n' +
      `appendFileSync(${JSON.stringify(join(directory, 'calls'))}, argv.join(' ') + '\\n');\n` +
      answers,
    { mode: 0o755 },
  );
  return {
    variables: { PATH: `${directory}${delimiter}${process.env.PATH}` },
    calls: () =>
      existsSync(join(directory, 'calls'))
        ? readFileSync(join(directory, 'calls'), 'utf8')
        : '',
  };
}

/** Dates a file of the board's setup before every claim of the test. */
function datedBefore(root, file) {
  const earlier = new Date(Date.now() - 3_600_000);
  utimesSync(join(root, file), earlier, earlier);
}

/** A board with a workspace: `modules/a`, and `modules/b` that uses it. */
function workspaceBoard(...tasks) {
  const root = boardOf(...tasks);
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `${JSON.stringify(content, null, 2)}\n`);
    datedBefore(root, file);
  };
  write('package.json', {
    name: 'root',
    private: true,
    workspaces: ['apps/*', 'modules/*', 'packages/*'],
    scripts: SCRIPTS,
  });
  write('modules/a/package.json', { name: '@aep/a', version: '0.0.0' });
  write('modules/b/package.json', {
    name: '@aep/b',
    version: '0.0.0',
    dependencies: { '@aep/a': 'workspace:^' },
  });
  // The Yarn a tree is installed with makes its node_modules alone.
  writeFileSync(join(root, '.yarnrc.yml'), 'yarnPath: .yarn/install.cjs\n');
  mkdirSync(join(root, '.yarn'));
  writeFileSync(
    join(root, '.yarn/install.cjs'),
    "require('node:fs').mkdirSync('node_modules', { recursive: true });\n",
  );
  commitBoard(root);
  return root;
}

describe('submit, a check of the whole tree', () => {
  test('runs it narrowed to the task’s changed files, prints what it ran and writes it in the Log', () => {
    const root = workspaceBoard({
      id: 'T-0001',
      writes: ['modules/a/'],
      checks: ['yarn platform:check', 'AEP_WHOLE_TREE=1 yarn platform:test'],
    });
    const yarn = fakeYarn();
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(root, 'T-0001', 'modules/a/src/index.ts');
    const narrowedTo =
      'yarn workspaces foreach --all --parallel --include modules/a --include modules/b exec tsc' +
      ' && yarn oxlint --type-aware --deny-warnings modules/a/src/index.ts' +
      ' && yarn vitest related --run --passWithNoTests modules/a/src/index.ts';
    const result = passes(root, ['submit', 'T-0001'], yarn);
    assert.ok(
      result.stdout.includes(
        `task: \`yarn platform:check\` runs \`${narrowedTo}\`:\n` +
          '  typecheck: modules/a, and what depends on them: modules/b\n',
      ),
      result.stdout,
    );
    assert.equal(
      yarn.calls(),
      'workspaces foreach --all --parallel --include modules/a --include modules/b exec tsc\n' +
        'oxlint --type-aware --deny-warnings modules/a/src/index.ts\n' +
        'vitest related --run --passWithNoTests modules/a/src/index.ts\n' +
        'platform:test\n',
    );
    const task = read(root, 'T-0001');
    assert.ok(
      task.includes(
        `- \`yarn platform:check\`, narrowed to \`${narrowedTo}\`: pass, `,
      ),
      task,
    );
    assert.match(
      task,
      /- `AEP_WHOLE_TREE=1 yarn platform:test`, on the whole tree: it asks for the whole tree \(AEP_WHOLE_TREE=1\): pass, \d+ s\n/,
    );
    passes(root, ['lint']);
  });
});

describe('submit, what a check of the whole tree reads', () => {
  const written = (root, file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
    datedBefore(root, file);
  };

  test('runs the tests that read a changed file by path, found in the packages, but where Vitest does not look', () => {
    const root = workspaceBoard({
      id: 'T-0001',
      writes: ['examples/demo/'],
      checks: ['yarn platform:test'],
    });
    written(
      root,
      'modules/a/src/demo.test.ts',
      "const DEMO = join(import.meta.dirname, '../../../examples/demo');\n",
    );
    written(
      root,
      'modules/b/src/rule.test.ts',
      "const REPOSITORY = join(import.meta.dirname, '../../..');\n",
    );
    written(
      root,
      'modules/b/e2e/far.test.ts',
      "const DEMO = join(import.meta.dirname, '../../../examples/demo');\n",
    );
    written(
      root,
      'modules/b/vitest.config.ts',
      "export default { test: { include: ['src/**/*.test.ts'] } };\n",
    );
    written(root, 'examples/demo/blueprints.json', '[]\n');
    const yarn = fakeYarn();
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(root, 'T-0001', 'examples/demo/blueprints.json');
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(
      yarn.calls(),
      'platform:test --passWithNoTests modules/a/src/demo.test.ts modules/b/src/rule.test.ts\n',
    );
  });

  const fixtureBoard = () => {
    const root = workspaceBoard({
      id: 'T-0001',
      writes: ['examples/demo/'],
      checks: ['yarn platform:test'],
    });
    written(
      root,
      'modules/b/vitest.config.ts',
      "export default { test: { include: ['src/**/*.test.ts'] } };\n",
    );
    written(
      root,
      'modules/b/src/api.test.ts',
      "import { createFixtureServer } from '../e2e/fixtureApi.ts';\n",
    );
    written(
      root,
      'modules/b/src/build.test.ts',
      "const PACKAGE = resolve(import.meta.dirname, '..');\n",
    );
    written(
      root,
      'modules/b/far.ts',
      "const DEMO = join(import.meta.dirname, '../../examples/demo');\n",
    );
    written(root, 'examples/demo/blueprints.json', '[]\n');
    return root;
  };

  test('runs a test whose fixture, outside include, loads a module that reads a changed file', () => {
    const root = fixtureBoard();
    written(
      root,
      'modules/b/e2e/fixtureApi.ts',
      "const FIXTURES = resolve(import.meta.dirname, 'fixtures');\n",
    );
    written(
      root,
      'modules/b/e2e/fixtures/delivery.ts',
      "import type { Route } from '../fixtureApi.ts';\n" +
        "const DEMO = resolve(import.meta.dirname, '../../../../examples/demo');\n",
    );
    const yarn = fakeYarn();
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(root, 'T-0001', 'examples/demo/blueprints.json');
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(
      yarn.calls(),
      'platform:test --passWithNoTests modules/b/src/api.test.ts\n',
    );
  });

  test('runs no test whose fixture, outside include, reads nothing outside its package', () => {
    const root = fixtureBoard();
    written(root, 'modules/b/e2e/fixtureApi.ts', 'export const routes = [];\n');
    const yarn = fakeYarn();
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    commitIn(root, 'T-0001', 'examples/demo/blueprints.json');
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(yarn.calls(), '');
  });

  test('narrows to a change committed under an earlier claim of the task', () => {
    const root = workspaceBoard({
      id: 'T-0001',
      writes: ['modules/a/'],
      checks: ['yarn platform:test'],
    });
    written(root, 'modules/a/src/kept.ts', 'export const kept = 1;\n');
    const yarn = fakeYarn();
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    commitIn(root, 'T-0001', 'modules/a/src/kept.ts');
    passes(root, ['log', 'T-0001'], { input: 'Did: part of it.' });
    passes(root, ['release', 'T-0001'], { input: 'Back later.' });
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the rest.' });
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(
      yarn.calls(),
      'vitest related --run --passWithNoTests modules/a/src/kept.ts\n',
    );
  });

  test('sees a file of its scope that the task deleted in its tree', () => {
    const root = workspaceBoard({
      id: 'T-0001',
      writes: ['modules/a/'],
      checks: ['yarn platform:test'],
    });
    written(root, 'modules/a/migrations/0001_gone.sql', 'select 1;\n');
    const yarn = fakeYarn();
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: deleted the migration.' });
    rmSync(join(treeOf(root), 'modules/a/migrations/0001_gone.sql'));
    commitIn(root, 'T-0001');
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(
      yarn.calls(),
      'platform:test --passWithNoTests modules/a/ modules/b/\n',
    );
  });
});

describe('submit, Prettier on what the task changed', () => {
  // `yarn` runs the repository's Prettier, which formats with its defaults
  // in a board that configures none.
  const PRETTIER = fileURLToPath(
    new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
  );
  const prettierYarn = () =>
    fakeYarn(
      "const { spawnSync } = require('node:child_process');\n" +
        "const words = argv[0] === 'prettier:check' ? ['--check', '.'] : argv.slice(1);\n" +
        `process.exit(spawnSync(process.execPath, [${JSON.stringify(PRETTIER)}, ...words], { stdio: 'inherit' }).status);\n`,
    );
  const UNFORMATTED = 'const a   =  1\n';
  /** A board whose `main` holds an unformatted file of another task's. */
  const board = check => {
    const root = workspaceBoard(
      { id: 'T-0001', writes: ['modules/a/'], checks: [check] },
      { id: 'T-0002', writes: ['modules/b/'], ...HELD },
    );
    writeFileSync(join(root, '.prettierignore'), 'work/\n');
    mkdirSync(join(root, 'modules/b/src'), { recursive: true });
    writeFileSync(join(root, 'modules/b/src/b.ts'), UNFORMATTED);
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    return root;
  };
  /** Writes and commits a file of the task in its tree. */
  const written = (root, file, text) => {
    mkdirSync(dirname(join(treeOf(root), file)), { recursive: true });
    writeFileSync(join(treeOf(root), file), text);
    commitIn(root, 'T-0001');
  };

  test('another task’s unformatted file does not fail it, and its own does', () => {
    const root = board('yarn prettier:check');
    written(root, 'modules/a/src/a.ts', 'export const a = 1;\n');
    const yarn = prettierYarn();
    const result = passes(root, ['submit', 'T-0001'], yarn);
    assert.match(
      result.stdout,
      /task: `yarn prettier:check` runs `yarn prettier --check --ignore-unknown modules\/a\/src\/a\.ts`:\n {2}Prettier: the 1 changed file\(s\)/,
    );
    assert.match(
      read(root, 'T-0001'),
      /- `yarn prettier:check`, narrowed to `yarn prettier --check --ignore-unknown modules\/a\/src\/a\.ts`: pass, \d+ s\n/,
    );

    const own = board('yarn prettier:check');
    written(own, 'modules/a/src/a.ts', UNFORMATTED);
    refuses(own, ['submit', 'T-0001'], /1 check\(s\) fail/, prettierYarn());
  });

  test('the flag formats the whole tree', () => {
    const root = board('AEP_WHOLE_TREE=1 yarn prettier:check');
    written(root, 'modules/a/src/a.ts', 'export const a = 1;\n');
    const yarn = prettierYarn();
    refuses(root, ['submit', 'T-0001'], /1 check\(s\) fail/, yarn);
    assert.equal(yarn.calls(), 'prettier:check\n');
  });
});

describe('submit, the docs check on what the task changed', () => {
  // `yarn lint:docs` runs the repository's docs check on the board.
  const CHECK_DOCS = fileURLToPath(
    new URL('./check-docs.mjs', import.meta.url),
  );
  const docsYarn = () =>
    fakeYarn(
      "const { spawnSync } = require('node:child_process');\n" +
        "const words = argv[0] === 'lint:repo' ? [] : argv.slice(1);\n" +
        `process.exit(spawnSync(process.execPath, [${JSON.stringify(CHECK_DOCS)}, '--root', process.cwd(), ...words], { stdio: 'inherit' }).status);\n`,
    );
  const board = (check = 'yarn lint:repo') => {
    const root = workspaceBoard(
      { id: 'T-0001', writes: ['modules/a/'], checks: [check] },
      { id: 'T-0002', writes: ['modules/b/'], ...HELD },
    );
    const planted = {
      'package.json': `${JSON.stringify({ name: 'root', private: true, scripts: { 'lint:repo': 'yarn lint:docs', 'lint:docs': 'node check-docs.mjs' } })}\n`,
      'docs/adr/README.md': '# ADRs\n',
      'modules/a/README.md': '# A\n\nThe first.\n',
      'modules/b/README.md': '# B\n\n[Gone](./gone.md).\n',
    };
    for (const [file, text] of Object.entries(planted)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    return root;
  };
  /** Writes and commits a file of the task in its tree. */
  const written = (root, file, text) => {
    writeFileSync(join(treeOf(root), file), text);
    commitIn(root, 'T-0001');
  };

  test('another task’s broken link does not fail it, and its own does', () => {
    const root = board();
    written(root, 'modules/a/README.md', '# A\n\n[B](../b/README.md#b).\n');
    const yarn = docsYarn();
    const result = passes(root, ['submit', 'T-0001'], yarn);
    assert.match(
      result.stdout,
      /task: `yarn lint:repo` runs `yarn lint:docs modules\/a\/README\.md`:\n {2}its parts, each as below\n {2}lint:docs: the 1 changed file\(s\)\n/,
    );
    assert.equal(yarn.calls(), 'lint:docs modules/a/README.md\n');

    const own = board();
    written(own, 'modules/a/README.md', '# A\n\n[Gone](./gone.md).\n');
    refuses(own, ['submit', 'T-0001'], /1 check\(s\) fail/, docsYarn());
  });

  test('named directly, it runs on the same files, and the Log says so', () => {
    const root = board('yarn lint:docs');
    written(
      root,
      'modules/a/package.json',
      '{ "name": "@aep/a", "version": "0.0.1" }\n',
    );
    const yarn = docsYarn();
    passes(root, ['submit', 'T-0001'], yarn);
    assert.equal(yarn.calls(), 'lint:docs modules/a/package.json\n');
    assert.match(
      readFileSync(join(root, 'work/tasks/T-0001-a-task.md'), 'utf8'),
      /- `yarn lint:docs`, narrowed to `yarn lint:docs modules\/a\/package\.json`: pass/,
    );

    const own = board('yarn lint:docs');
    written(own, 'modules/a/README.md', '# A\n\n[Gone](./gone.md).\n');
    refuses(own, ['submit', 'T-0001'], /1 check\(s\) fail/, docsYarn());
  });
});

describe('check-code-rules, on given files and on what the task changed', () => {
  const CHECK_CODE_RULES = fileURLToPath(
    new URL('./check-code-rules.mjs', import.meta.url),
  );
  // Split, so that this file does not break the rule it plants.
  const SUPPRESSED = `// @ts-${'ignore'}\nexport const a = 1;\n`;
  const plant = (root, files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
  };
  const check = (root, ...files) =>
    spawnSync(process.execPath, [CHECK_CODE_RULES, '--root', root, ...files], {
      encoding: 'utf8',
    });

  test('given files, it checks only those in its scope; with none, every file', () => {
    const root = mkdtempSync(join(tmpdir(), 'aep-code-rules-'));
    roots.push(root);
    plant(root, {
      'modules/a/src/a.ts': 'export const a = 1;\n',
      'modules/b/src/b.ts': SUPPRESSED,
      'docs/c.ts': SUPPRESSED,
    });

    const clean = check(root, 'modules/a/src/a.ts', 'docs/c.ts', 'gone.ts');
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(
      clean.stdout,
      /^Code rules OK \(1 of the 3 given file\(s\) are in its scope and were checked\)\.$/m,
    );

    const own = check(root, 'modules/a/src/a.ts', 'modules/b/src/b.ts');
    assert.equal(own.status, 1);
    assert.match(own.stderr, /modules\/b\/src\/b\.ts:1 {2}no-ts-suppression/);
    assert.match(own.stderr, /1 code rule violation\(s\) in 2 file\(s\)/);

    const whole = check(root);
    assert.equal(whole.status, 1);
    assert.match(whole.stderr, /1 code rule violation\(s\) in 2 file\(s\)/);
  });

  // `yarn lint:code-rules` runs the repository's check on the board, and
  // every other part of lint:repo answers that it passes.
  const codeRulesYarn = () =>
    fakeYarn(
      "const { spawnSync } = require('node:child_process');\n" +
        "if (argv[0] !== 'lint:code-rules') process.exit(0);\n" +
        `process.exit(spawnSync(process.execPath, [${JSON.stringify(CHECK_CODE_RULES)}, '--root', process.cwd(), ...argv.slice(1)], { stdio: 'inherit' }).status);\n`,
    );
  const board = () => {
    const root = workspaceBoard(
      { id: 'T-0001', writes: ['modules/a/'], checks: ['yarn lint:repo'] },
      { id: 'T-0002', writes: ['modules/b/'], ...HELD },
    );
    plant(root, {
      'modules/a/src/a.ts': 'export const a = 1;\n',
      'modules/b/src/b.ts': SUPPRESSED,
    });
    commitBoard(root);
    passes(root, ['claim', 'T-0001']);
    passes(root, ['log', 'T-0001'], { input: 'Did: the work.' });
    return root;
  };
  /** Writes and commits a file of the task in its tree. */
  const written = (root, file, text) => {
    writeFileSync(join(treeOf(root), file), text);
    commitIn(root, 'T-0001');
  };

  test('a submit of lint:repo runs it on the changed files and every other part as it is', () => {
    const root = board();
    written(root, 'modules/a/src/a.ts', 'export const a = 2;\n');
    const yarn = codeRulesYarn();
    const result = passes(root, ['submit', 'T-0001'], yarn);
    assert.match(
      result.stdout,
      /task: `yarn lint:repo` runs `yarn lint:code-rules modules\/a\/src\/a\.ts && yarn lint:unused`:\n {2}its parts, each as below\n {2}lint:code-rules: the 1 changed file\(s\)\n {2}lint:unused as it is: /,
    );
    assert.equal(
      yarn.calls(),
      'lint:code-rules modules/a/src/a.ts\nlint:unused\n',
    );

    const own = board();
    written(own, 'modules/a/src/a.ts', SUPPRESSED);
    refuses(own, ['submit', 'T-0001'], /1 check\(s\) fail/, codeRulesYarn());
  });
});

describe('sweep', () => {
  const failing =
    "if (argv[0] === 'workspaces') { console.log('[@aep/a]: src/index.ts(3,7): error TS2322: Type is wrong.'); process.exit(1); }\n" +
    "const report = argv.find(word => word.startsWith('--outputFile.json='));\n" +
    'if (report) {\n' +
    "  writeFileSync(report.slice('--outputFile.json='.length), JSON.stringify({ testResults: [\n" +
    "    { name: join('modules/b/src/b.test.ts'), status: 'failed', assertionResults: [\n" +
    "      { fullName: 'b counts', status: 'failed' }, { fullName: 'b names', status: 'passed' } ] },\n" +
    "    { name: join('modules/a/src/a.test.ts'), status: 'passed', assertionResults: [] } ] }));\n" +
    '  process.exit(1);\n' +
    '}\n';
  const sweepTask = root =>
    readdirSync(join(root, 'work/tasks')).filter(name =>
      name.includes('the-whole-tree-passes-its-checks-again'),
    );

  test('files one task on a failure, naming each failing test, its file and the task that last wrote it, and adds to it after', () => {
    const root = workspaceBoard(
      {
        id: 'T-0001',
        writes: ['modules/a/'],
        ...DONE,
      },
      {
        id: 'T-0002',
        writes: ['modules/b/'],
        status: 'done',
        log: `${DONE.log.replaceAll('2026-11-20', '2026-11-21')}`,
      },
    );
    const yarn = fakeYarn(
      `const { join } = require('node:path');\n` +
        failing.replaceAll("join('", `join(${JSON.stringify(root)}, '`),
    );
    const first = run(root, ['sweep'], yarn);
    assert.equal(first.status, 1, first.output);
    assert.match(first.stdout, /the whole tree fails; T-0003 is filed for it/);
    assert.match(
      yarn.calls(),
      /^workspaces foreach --all --parallel --verbose --include modules\/a --include modules\/b exec tsc\nplatform:lint\nplatform:test --reporter=default --reporter=json --outputFile\.json=\S+\nprettier:check\nlint:code-rules\nlint:unused\n$/,
    );
    assert.deepEqual(sweepTask(root), [
      'T-0003-the-whole-tree-passes-its-checks-again.md',
    ]);
    const text = readFileSync(
      join(root, 'work/tasks', sweepTask(root)[0]),
      'utf8',
    );
    assert.match(text, /^status: ready$/m);
    assert.match(
      text,
      /^writes:\n {2}- modules\/a\/src\/index\.ts\n {2}- modules\/b\/src\/b\.test\.ts$/m,
    );
    assert.match(
      text,
      /^checks:\n {2}- AEP_WHOLE_TREE=1 yarn platform:check\n {2}- AEP_WHOLE_TREE=1 yarn prettier:check\n {2}- AEP_WHOLE_TREE=1 yarn lint:repo$/m,
    );
    assert.match(
      text,
      /- typecheck: `modules\/a\/src\/index\.ts`, TS2322; last written by T-0001\n/,
    );
    assert.match(
      text,
      /- tests: `modules\/b\/src\/b\.test\.ts`, b counts; last written by T-0002\n/,
    );
    assert.doesNotMatch(text, /b names|a\.test\.ts/);
    passes(root, ['lint']);

    const second = run(root, ['sweep'], yarn);
    assert.equal(second.status, 1, second.output);
    assert.match(second.stdout, /the whole tree fails; T-0003 has its entry/);
    assert.equal(sweepTask(root).length, 1);
    const updated = readFileSync(
      join(root, 'work/tasks', sweepTask(root)[0]),
      'utf8',
    );
    assert.equal(
      updated.match(/`yarn task sweep` ran the whole tree/g).length,
      2,
    );
    passes(root, ['lint']);
  });

  test('files nothing when the whole tree passes', () => {
    const root = workspaceBoard();
    const yarn = fakeYarn();
    const result = passes(root, ['sweep'], yarn);
    assert.match(result.stdout, /The whole tree passes its checks\./);
    assert.deepEqual(sweepTask(root), []);
  });

  test('runs every step as in CI, and names a step that ran past its bound', () => {
    const root = workspaceBoard();
    const told = join(mkdtempSync(join(tmpdir(), 'aep-task-ci-')), 'told');
    roots.push(dirname(told));
    const yarn = fakeYarn(
      `appendFileSync(${JSON.stringify(told)}, 'CI=' + process.env.CI + '\\n');\n` +
        "if (argv[0] === 'platform:lint') setInterval(() => {}, 1000);\n",
    );
    const result = run(root, ['sweep'], {
      variables: {
        ...yarn.variables,
        CI: '',
        AEP_CHECK_TIMEOUT_MINUTES: '0.02',
      },
    });
    assert.equal(result.status, 1, result.output);
    assert.match(yarn.calls(), /^platform:lint\nplatform:test /m);
    assert.deepEqual(
      [...new Set(readFileSync(told, 'utf8').trim().split('\n'))],
      ['CI=true'],
    );
    const text = readFileSync(
      join(root, 'work/tasks', sweepTask(root)[0]),
      'utf8',
    );
    assert.match(text, /^- lint: it timed out after 0\.02 min$/m);
  });

  test('reads the failures of oxlint and of a step that names no file', () => {
    assert.deepEqual(
      failuresIn(
        {
          typecheck: '',
          lint: 'modules/a/src/x.ts:1:7: error eslint(no-unused-vars): unused\n',
          tests: undefined,
          failed: ['lint', 'tests'],
        },
        '/root',
        [],
      ),
      [{ step: 'lint', file: 'modules/a/src/x.ts' }, { step: 'tests' }],
    );
  });

  test('reads the files Prettier names, and a part of lint:repo that failed', () => {
    assert.deepEqual(
      failuresIn(
        {
          formatting:
            'Checking formatting...\n[warn] modules/a/src/x.ts\n' +
            '[error] docs/b.md: SyntaxError: Unexpected token\n' +
            '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.\n',
          failed: ['prettier:check', 'lint:docs'],
        },
        '/root',
        [],
      ),
      [
        { step: 'prettier:check', file: 'modules/a/src/x.ts' },
        { step: 'prettier:check', file: 'docs/b.md' },
        { step: 'lint:docs' },
      ],
    );
  });
});

describe('trees', () => {
  const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));
  /** The Yarn a board names: it installs by writing what it was asked. */
  const FAKE_YARN = [
    "const fs = require('node:fs');",
    "if (fs.existsSync('fail-install')) process.exit(3);",
    "fs.mkdirSync('node_modules', { recursive: true });",
    // Whether the landing lock is held while it installs.
    "const lock = fs.existsSync('work/claims/landing.lock') ? 'under the landing lock' : 'with no landing lock';",
    "fs.appendFileSync('node_modules/.installed', process.argv.slice(2).join(' ') + ' ' + lock + '\\n');",
  ].join('\n');

  /**
   * A board in a git repository whose `main` holds the tasks, with a
   * package.json and the Yarn that installs a tree: `<parent>/aep`, its
   * trees in `<parent>/aep-trees`. With
   * `withScripts` the commit holds the task command too, as the
   * repository's does.
   */
  function treesBoard(tasks, { commit = true, withScripts = false } = {}) {
    const parent = mkdtempSync(join(tmpdir(), 'aep-trees-'));
    roots.push(parent);
    const root = join(parent, 'aep');
    mkdirSync(join(root, 'work/tasks'), { recursive: true });
    copyFileSync(SCHEMA, join(root, 'work/schema.json'));
    for (const task of tasks) {
      writeFileSync(join(root, fileOf(task.id ?? 'T-0001')), taskText(task));
    }
    writeFileSync(join(root, '.gitignore'), 'work/claims/\nnode_modules/\n');
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'board', private: true, scripts: { heavy: 'vitest' } })}\n`,
    );
    writeFileSync(join(root, '.yarnrc.yml'), 'yarnPath: .yarn/fake.cjs\n');
    mkdirSync(join(root, '.yarn'));
    writeFileSync(join(root, '.yarn/fake.cjs'), FAKE_YARN);
    mkdirSync(join(root, 'a'));
    writeFileSync(join(root, 'a/x'), 'first\n');
    if (withScripts) {
      for (const file of ['task.mjs', 'checkSlots.mjs']) {
        mkdirSync(join(root, 'scripts/lib'), { recursive: true });
        copyFileSync(join(SCRIPTS, file), join(root, 'scripts', file));
      }
      for (const file of readdirSync(join(SCRIPTS, 'lib'))) {
        copyFileSync(
          join(SCRIPTS, 'lib', file),
          join(root, 'scripts/lib', file),
        );
      }
    }
    const git = gitIn(root);
    git('init', '--quiet', '--initial-branch=main');
    if (commit) {
      git('add', '-A');
      git('commit', '--quiet', '-m', 'The first commit');
    }
    return { root, parent, git, treeOf: id => join(parent, 'aep-trees', id) };
  }

  const recordOf = (root, id) =>
    JSON.parse(readFileSync(join(root, 'work/claims', id, 'tree'), 'utf8'));

  /**
   * What a checkout is at: its head, its status, its index. The board's
   * task files, which the command writes, are left out of the status.
   */
  const stateOf = (git, directory) => ({
    head: git('rev-parse', 'HEAD'),
    status: git('status', '--porcelain=v1', '--untracked-files=all')
      .split('\n')
      .filter(line => !line.includes('work/tasks/'))
      .join('\n'),
    index: readFileSync(
      join(git('rev-parse', '--path-format=absolute', '--git-dir'), 'index'),
    ).toString('base64'),
    directory,
  });

  /** Claims, commits a change of `a/` in the tree, logs and submits. */
  function submitted(board, id, { worker = ALICE, file = `a/${id}` } = {}) {
    passes(board.root, ['claim', id], { worker });
    const tree = board.treeOf(id);
    mkdirSync(dirname(join(tree, file)), { recursive: true });
    writeFileSync(join(tree, file), `${id}\n`);
    const git = gitIn(tree);
    git('add', '-A');
    git('commit', '--quiet', '-m', `${id}'s change`);
    passes(board.root, ['log', id], { worker, input: 'Did: all of it.' });
    passes(board.root, ['submit', id], { worker });
    return git;
  }

  function accepted(board, id, options) {
    const git = submitted(board, id, options);
    passes(board.root, ['review', id], { worker: BOB });
    passes(board.root, ['accept', id], { worker: BOB, input: 'Checks: pass.' });
    return git;
  }

  test('a claim makes task/T-NNNN and its tree from the head of main, installs it, and records them', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    const main = board.git('rev-parse', 'main');
    // A change of the main checkout that no commit holds stays out of the tree.
    writeFileSync(join(board.root, 'a/x'), 'not committed\n');
    const before = stateOf(board.git, board.root);
    const result = passes(board.root, ['claim', 'T-0001']);
    const tree = board.treeOf('T-0001');
    assert.match(
      result.stdout,
      /Your tree is .*aep-trees\/T-0001, on task\/T-0001/,
    );
    assert.deepEqual(recordOf(board.root, 'T-0001'), {
      tree,
      branch: 'task/T-0001',
      base: main,
      from: 'main',
    });
    const inTree = gitIn(tree);
    assert.equal(inTree('rev-parse', 'HEAD'), main);
    assert.equal(inTree('symbolic-ref', 'HEAD'), 'refs/heads/task/T-0001');
    assert.equal(readFileSync(join(tree, 'a/x'), 'utf8'), 'first\n');
    assert.equal(
      readFileSync(join(tree, 'node_modules/.installed'), 'utf8'),
      'install --immutable with no landing lock\n',
    );
    assert.ok(!existsSync(join(board.root, 'node_modules/.installed')));
    assert.ok(existsSync(join(board.root, 'work/claims/T-0001/claim')));
    assert.equal(statusOf(board.root, 'T-0001'), 'in-progress');
    // The main checkout is as it was: its head, its files, its index.
    assert.deepEqual(stateOf(board.git, board.root), before);
    assert.match(
      passes(board.root, ['show', 'T-0001']).stdout,
      /^Tree .*T-0001, on task\/T-0001, made from main at [0-9a-f]{40}$/m,
    );
  });

  test('a claim is refused while main has no commit, and leaves nothing', () => {
    const board = treesBoard([{ id: 'T-0001' }], { commit: false });
    refuses(
      board.root,
      ['claim', 'T-0001'],
      /T-0001 is not claimed: main has no commit, and a tree is made from its head/,
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'ready');
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001')));
    assert.ok(!existsSync(board.treeOf('T-0001')));
  });

  test('a claim whose install fails removes the tree and the branch it made, and is refused', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    writeFileSync(join(board.root, 'fail-install'), '');
    board.git('add', 'fail-install');
    board.git('commit', '--quiet', '-m', 'An install that fails');
    refuses(
      board.root,
      ['claim', 'T-0001'],
      /T-0001 is not claimed: the install of .* failed/,
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'ready');
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001')));
    assert.ok(!existsSync(board.treeOf('T-0001')));
    assert.equal(board.git('branch', '--list', 'task/*'), '');
  });

  test('a claim is refused when a directory or a branch that no record names is there', () => {
    const board = treesBoard([
      { id: 'T-0001' },
      { id: 'T-0002', writes: ['b/'] },
    ]);
    mkdirSync(board.treeOf('T-0001'), { recursive: true });
    refuses(
      board.root,
      ['claim', 'T-0001'],
      /aep-trees\/T-0001 is there, and no claim of T-0001 records it/,
    );
    board.git('branch', 'task/T-0002');
    refuses(
      board.root,
      ['claim', 'T-0002'],
      /the branch task\/T-0002 is there, and no claim of T-0002 records it/,
    );
    assert.equal(statusOf(board.root, 'T-0002'), 'ready');
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0002')));
  });

  test("a linked tree's own command refuses and names the board's, and its lint reads the board", () => {
    const board = treesBoard([{ id: 'T-0001' }], { withScripts: true });
    passes(board.root, ['claim', 'T-0001']);
    // A task the commit of the tree does not hold.
    writeFileSync(
      join(board.root, fileOf('T-0002')),
      taskText({ id: 'T-0002', writes: ['b/'] }),
    );
    const tree = board.treeOf('T-0001');
    const own = (...command) =>
      spawnSync(
        process.execPath,
        [join(tree, 'scripts/task.mjs'), ...command],
        {
          encoding: 'utf8',
          env: environment(ALICE),
        },
      );
    for (const command of [
      ['board'],
      ['show', 'T-0001'],
      ['land'],
      ['claim', 'T-0002'],
    ]) {
      const result = own(...command);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(
        result.stderr,
        new RegExp(
          `is a linked worktree, whose copy of the board is not the board: the board is ${realpathSync(board.root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'s`,
        ),
      );
      assert.match(
        result.stderr,
        /Run its command, "node .*\/aep\/scripts\/task\.mjs/,
      );
    }
    // The board's command run for the tree is refused the same way.
    refuses(
      tree,
      ['board'],
      /is a linked worktree, whose copy of the board is not the board/,
    );
    const lint = own('lint');
    assert.equal(lint.status, 0, lint.stderr);
    assert.match(lint.stdout, /Task board OK \(2 task\(s\) checked\)/);
    assert.equal(statusOf(board.root, 'T-0002'), 'ready');
  });

  test("the scope check and a submit read the tree, from its base: committed and not, and not the main checkout's changes", () => {
    const board = treesBoard([{ id: 'T-0001', writes: ['a/'] }]);
    passes(board.root, ['claim', 'T-0001']);
    const tree = board.treeOf('T-0001');
    const git = gitIn(tree);
    writeFileSync(join(tree, 'a/committed'), 'x\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'One');
    writeFileSync(join(tree, 'a/x'), 'not committed\n');
    // The main checkout's own change is no change of the task.
    writeFileSync(join(board.root, 'outside'), 'main checkout\n');
    const scope = passes(board.root, ['scope', 'T-0001']);
    assert.match(
      scope.stdout,
      /In the scope of T-0001:\n {2}a\/committed\n {2}a\/x\n/,
    );
    assert.doesNotMatch(scope.stdout, /outside/);
    writeFileSync(join(tree, 'elsewhere'), 'x\n');
    refuses(
      board.root,
      ['scope', 'T-0001'],
      /1 changed file\(s\) are outside T-0001's writes and appends/,
    );
    rmSync(join(tree, 'elsewhere'));
    // A task file changed in the tree, even the task's own, fails it.
    writeFileSync(join(tree, fileOf('T-0001')), 'changed\n');
    const refused = refuses(
      board.root,
      ['scope', 'T-0001'],
      /1 task file\(s\) changed in the tree/,
    );
    assert.match(
      refused.stdout,
      /Task files changed in the tree:\n {2}work\/tasks\/T-0001-a-task\.md/,
    );
    git('checkout', '--', fileOf('T-0001'));
    // A submit takes only what is committed.
    passes(board.root, ['log', 'T-0001'], { input: 'Did: one.' });
    const uncommitted = refuses(
      board.root,
      ['submit', 'T-0001'],
      /T-0001 is not submitted: its tree holds changes that are not committed on task\/T-0001; commit them there first:\n {2}a\/x/,
    );
    assert.doesNotMatch(uncommitted.stdout, /\$ exit 0/);
    git('commit', '--quiet', '-am', 'Two');
    passes(board.root, ['submit', 'T-0001']);
    const head = git('rev-parse', 'HEAD');
    const base = recordOf(board.root, 'T-0001').base;
    assert.match(
      read(board.root, 'T-0001'),
      new RegExp(
        `Committed as ${head} on task/T-0001, from main at ${base}\\.`,
      ),
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'review');
    // The review keeps the tree and its record; the claim is gone.
    assert.ok(existsSync(tree));
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001/claim')));
    assert.ok(existsSync(join(board.root, 'work/claims/T-0001/tree')));
  });

  test('the checks run in the tree, weighed by its own package.json, and wait in the board’s queue', () => {
    const fake = mkdtempSync(join(tmpdir(), 'aep-trees-bin-'));
    roots.push(fake);
    writeFileSync(
      join(fake, 'yarn'),
      '#!/bin/sh\nls "$BOARD_QUEUE" > "$OUT.queue"; pwd > "$OUT.cwd"; ' +
        'ls node_modules/.cache > "$OUT.caches" 2>&1; true\n',
      { mode: 0o755 },
    );
    const board = treesBoard([{ id: 'T-0001', checks: ['yarn heavy'] }]);
    passes(board.root, ['claim', 'T-0001']);
    // The board's own manifest says nothing heavy; the tree's does.
    writeFileSync(
      join(board.root, 'package.json'),
      '{"name":"board","private":true}\n',
    );
    const tree = board.treeOf('T-0001');
    writeFileSync(join(tree, 'a/y'), 'y\n');
    gitIn(tree)('add', '-A');
    gitIn(tree)('commit', '--quiet', '-m', 'y');
    passes(board.root, ['log', 'T-0001'], { input: 'Did: y.' });
    const out = join(fake, 'out');
    const queue = join(board.root, 'node_modules/.cache/check-slots');
    passes(board.root, ['submit', 'T-0001'], {
      variables: {
        PATH: `${fake}${delimiter}${process.env.PATH}`,
        BOARD_QUEUE: queue,
        OUT: out,
        AEP_CHECK_SLOTS: '2',
      },
    });
    assert.match(readFileSync(`${out}.queue`, 'utf8'), /^000001\.json$/m);
    assert.equal(
      realpathSync(readFileSync(`${out}.cwd`, 'utf8').trim()),
      realpathSync(tree),
    );
    assert.match(readFileSync(`${out}.caches`, 'utf8'), /No such file/);
  });

  test('every check of every tree waits in the one queue, each with its own port offset', async () => {
    const board = treesBoard([
      { id: 'T-0001', writes: ['a/'], checks: [] },
      { id: 'T-0002', writes: ['b/'], checks: [] },
    ]);
    const told = join(board.parent, 'offsets');
    for (const id of ['T-0001', 'T-0002']) {
      const file = join(board.root, fileOf(id));
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(
          'checks: []',
          `checks:\n  - echo ${id}=$E2E_PORT_OFFSET >> ${told}; sleep 2; true e2e`,
        ),
      );
      passes(board.root, ['claim', id]);
      const tree = board.treeOf(id);
      mkdirSync(join(tree, id === 'T-0001' ? 'a' : 'b'), { recursive: true });
      writeFileSync(join(tree, id === 'T-0001' ? 'a/one' : 'b/two'), `${id}\n`);
      gitIn(tree)('add', '-A');
      gitIn(tree)('commit', '--quiet', '-m', id);
      passes(board.root, ['log', id], { input: 'Did: it.' });
    }
    const submits = ['T-0001', 'T-0002'].map(
      id =>
        new Promise(done => {
          const child = spawn(
            process.execPath,
            [TASK, 'submit', id, '--root', board.root],
            {
              env: {
                ...environment(ALICE),
                AEP_CHECK_SLOTS: '2',
                E2E_PORT_OFFSET: '',
              },
            },
          );
          let output = '';
          child.stdout.on('data', chunk => (output += chunk));
          child.stderr.on('data', chunk => (output += chunk));
          child.on('exit', status => done({ status, output }));
        }),
    );
    for (const { status, output } of await Promise.all(submits)) {
      assert.equal(status, 0, output);
    }
    const offsets = readFileSync(told, 'utf8')
      .trim()
      .split('\n')
      .map(line => line.split('=')[1]);
    assert.deepEqual(offsets.toSorted(), ['20000', '20100']);
    for (const id of ['T-0001', 'T-0002']) {
      assert.ok(
        !existsSync(join(board.treeOf(id), 'node_modules/.cache/check-slots')),
      );
    }
  });

  test('a release removes a clean tree and its branch, leaves one that is not clean, and keeps a branch that holds commits', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    const tree = board.treeOf('T-0001');
    // Nothing changed: nothing is left.
    passes(board.root, ['claim', 'T-0001']);
    passes(board.root, ['release', 'T-0001'], { input: 'Not now.' });
    assert.ok(!existsSync(tree));
    assert.equal(board.git('branch', '--list', 'task/*'), '');
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001')));
    // A file not committed holds the tree, and the next claim works in it.
    passes(board.root, ['claim', 'T-0001']);
    writeFileSync(join(tree, 'a/draft'), 'draft\n');
    const left = passes(board.root, ['release', 'T-0001'], {
      input: 'Not now.',
    });
    assert.match(
      left.stdout,
      /T-0001 is left: it is not clean, and these files hold it:\n {2}a\/draft/,
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'ready');
    assert.ok(existsSync(join(tree, 'a/draft')));
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001/claim')));
    const again = passes(board.root, ['claim', 'T-0001'], { worker: BOB });
    assert.match(
      again.stderr,
      /T-0001's tree is .*, on task\/T-0001, as an earlier claim left it/,
    );
    // A commit keeps the branch, and the next claim makes the tree from it.
    const git = gitIn(tree);
    git('add', '-A');
    git('commit', '--quiet', '-m', 'Draft');
    const kept = passes(board.root, ['release', 'T-0001'], {
      worker: BOB,
      input: 'Not now.',
    });
    assert.match(
      kept.stdout,
      /is removed\ntask: the branch task\/T-0001 is kept: it holds commits main does not/,
    );
    assert.ok(!existsSync(tree));
    assert.notEqual(board.git('branch', '--list', 'task/T-0001'), '');
    const remade = passes(board.root, ['claim', 'T-0001']);
    assert.match(
      remade.stderr,
      /is made again from task\/T-0001, which holds the commits of an earlier claim/,
    );
    assert.equal(readFileSync(join(tree, 'a/draft'), 'utf8'), 'draft\n');
    assert.ok(existsSync(join(tree, 'node_modules/.installed')));
  });

  test("no step of a task changes another task's tree, or the main checkout outside a landing", () => {
    const board = treesBoard([
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', writes: ['b/'] },
    ]);
    passes(board.root, ['claim', 'T-0001']);
    const other = gitIn(board.treeOf('T-0001'));
    writeFileSync(join(board.treeOf('T-0001'), 'a/x'), 'in progress\n');
    const main = stateOf(board.git, board.root);
    const first = stateOf(other, board.treeOf('T-0001'));
    accepted(board, 'T-0002', { file: 'b/two' });
    passes(board.root, ['scope', 'T-0001']);
    assert.deepEqual(stateOf(other, board.treeOf('T-0001')), first);
    assert.deepEqual(stateOf(board.git, board.root), main);
    // The landing alone moves main, and leaves T-0001's tree as it was.
    passes(board.root, ['land', 'T-0002'], { worker: BOB });
    assert.notEqual(board.git('rev-parse', 'HEAD'), main.head);
    assert.deepEqual(stateOf(other, board.treeOf('T-0001')), first);
  });

  test('an accepted task lands by fast-forward, and its tree and branch are removed', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    // A remote, which a landing never reaches.
    const remote = join(board.parent, 'remote.git');
    gitIn(board.parent)('init', '--quiet', '--bare', remote);
    board.git('remote', 'add', 'origin', remote);
    const git = accepted(board, 'T-0001');
    const head = git('rev-parse', 'HEAD');
    assert.match(
      passes(board.root, ['land'], { worker: BOB }).stdout,
      /1 accepted task\(s\) wait to land:\n {2}T-0001 {2}task\/T-0001/,
    );
    const landed = passes(board.root, ['land', 'T-0001'], { worker: BOB });
    assert.match(
      landed.stdout,
      new RegExp(`T-0001 landed: main is at ${head}\\.`),
    );
    assert.equal(board.git('rev-parse', 'main'), head);
    assert.equal(
      readFileSync(join(board.root, 'a/T-0001'), 'utf8'),
      'T-0001\n',
    );
    assert.ok(!existsSync(board.treeOf('T-0001')));
    assert.equal(board.git('branch', '--list', 'task/*'), '');
    assert.ok(!existsSync(join(board.root, 'work/claims/T-0001')));
    assert.ok(!existsSync(join(board.root, 'node_modules/.installed')));
    assert.equal(gitIn(remote)('for-each-ref'), '');
    assert.equal(statusOf(board.root, 'T-0001'), 'done');
    passes(board.root, ['lint']);
    assert.match(
      passes(board.root, ['land'], { worker: BOB }).stdout,
      /No accepted task waits to land\./,
    );
  });

  test('a landing that holds yarn.lock installs the main checkout before the lock is given back', () => {
    const board = treesBoard([{ id: 'T-0001', appends: ['yarn.lock'] }]);
    accepted(board, 'T-0001', { file: 'yarn.lock' });
    passes(board.root, ['land', 'T-0001'], { worker: BOB });
    assert.equal(
      readFileSync(join(board.root, 'node_modules/.installed'), 'utf8'),
      'install --immutable under the landing lock\n',
    );
  });

  /**
   * An accepted task whose branch then takes one more commit of `files`,
   * the submission rewritten to name it, as if it had been checked so:
   * what only the landing's own checks can refuse.
   */
  function acceptedThenCommitted(board, id, files) {
    const git = accepted(board, id);
    const tree = board.treeOf(id);
    for (const file of files) {
      mkdirSync(dirname(join(tree, file)), { recursive: true });
      writeFileSync(join(tree, file), 'after the review\n');
    }
    git('add', '-A');
    git('commit', '--quiet', '-m', 'After the review');
    const file = join(board.root, fileOf(id));
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        /Committed as [0-9a-f]+/,
        `Committed as ${git('rev-parse', 'HEAD')}`,
      ),
    );
  }

  test('a change that holds a file outside the task’s paths is sent back, and never lands', () => {
    // r48's cases: such a file reaches the branch only past the scope check
    // of a submit, which takes no --base or --not-mine to hide it.
    const board = treesBoard([{ id: 'T-0001', writes: ['a/'] }]);
    const main = board.git('rev-parse', 'main');
    acceptedThenCommitted(board, 'T-0001', ['outside']);
    refuses(
      board.root,
      ['land', 'T-0001'],
      /T-0001 is not landed and is ready again: its change holds files outside its writes and appends \(outside\)/,
    );
    assert.equal(board.git('rev-parse', 'main'), main);
    assert.doesNotMatch(
      board.git('ls-tree', '--name-only', 'main'),
      /^outside$/m,
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'ready');
  });

  test('a landing refused by git leaves main, the main checkout and the task as they were', () => {
    const board = treesBoard([{ id: 'T-0001', writes: ['a/'] }]);
    const head = accepted(board, 'T-0001', { file: 'a/x' })(
      'rev-parse',
      'HEAD',
    );
    const main = board.git('rev-parse', 'main');
    // The main checkout's own change of a file the landing updates.
    writeFileSync(join(board.root, 'a/x'), 'dirty in main\n');
    refuses(
      board.root,
      ['land', 'T-0001'],
      /git merge --ff-only task\/T-0001 did not move main/,
    );
    assert.equal(board.git('rev-parse', 'main'), main);
    assert.equal(
      readFileSync(join(board.root, 'a/x'), 'utf8'),
      'dirty in main\n',
    );
    assert.equal(statusOf(board.root, 'T-0001'), 'done');
    assert.equal(recordOf(board.root, 'T-0001').landed, undefined);
    assert.ok(existsSync(board.treeOf('T-0001')));
    board.git('checkout', '--quiet', '--', 'a/x');
    // A main checkout with another branch out is no place to land.
    board.git('switch', '--quiet', '-c', 'elsewhere');
    refuses(
      board.root,
      ['land', 'T-0001'],
      /has refs\/heads\/elsewhere out, not refs\/heads\/main/,
    );
    board.git('switch', '--quiet', 'main');
    passes(board.root, ['land', 'T-0001'], { worker: BOB });
    assert.equal(board.git('rev-parse', 'main'), head);
  });

  test('a release ends the tree while the claim holds, and one that cannot be ended keeps the claim', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    passes(board.root, ['claim', 'T-0001']);
    // A tree whose status git cannot read cannot be told clean.
    const index = join(
      gitIn(board.treeOf('T-0001'))(
        'rev-parse',
        '--path-format=absolute',
        '--git-dir',
      ),
      'index',
    );
    writeFileSync(index, 'not-an-index');
    refuses(board.root, ['release', 'T-0001'], /index/, { input: 'Not now.' });
    assert.equal(statusOf(board.root, 'T-0001'), 'in-progress');
    assert.ok(existsSync(join(board.root, 'work/claims/T-0001/claim')));
    assert.doesNotMatch(read(board.root, 'T-0001'), /Not now\./);
  });

  test('a stale change, one not as submitted, and one holding a task file are sent back, ready again', () => {
    const board = treesBoard([
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', writes: ['b/'] },
      { id: 'T-0003', writes: ['c/'] },
      { id: 'T-0004', writes: ['d/'] },
    ]);
    accepted(board, 'T-0001');
    const two = accepted(board, 'T-0002', { file: 'b/two' });
    passes(board.root, ['land', 'T-0001'], { worker: BOB });
    const main = board.git('rev-parse', 'main');
    // T-0002 was made from main before T-0001 landed.
    refuses(
      board.root,
      ['land', 'T-0002'],
      /T-0002 is not landed and is ready again: it is stale: main moved since its base/,
    );
    assert.equal(statusOf(board.root, 'T-0002'), 'ready');
    assert.match(
      read(board.root, 'T-0002'),
      /Not landed, and ready again for cursor\/model-a: it is stale/,
    );
    assert.equal(board.git('rev-parse', 'main'), main);
    assert.ok(existsSync(board.treeOf('T-0002')));
    passes(board.root, ['lint']);
    // Its worker rebases in its own tree, is checked and reviewed again, and lands.
    passes(board.root, ['claim', 'T-0002']);
    two('rebase', '--quiet', 'main');
    passes(board.root, ['log', 'T-0002'], { input: 'Did: rebased on main.' });
    passes(board.root, ['submit', 'T-0002']);
    passes(board.root, ['review', 'T-0002'], { worker: BOB });
    passes(board.root, ['accept', 'T-0002'], {
      worker: BOB,
      input: 'Checks: pass.',
    });
    passes(board.root, ['land', 'T-0002'], { worker: BOB });
    // A branch that moved after its submission.
    const three = accepted(board, 'T-0003', { file: 'c/three' });
    writeFileSync(join(board.treeOf('T-0003'), 'c/more'), 'more\n');
    three('add', '-A');
    three('commit', '--quiet', '-m', 'After the review');
    refuses(
      board.root,
      ['land', 'T-0003'],
      /T-0003 is not landed and is ready again: task\/T-0003 is at [0-9a-f]+, and its submission checked [0-9a-f]+/,
    );
    // A change that holds a task file, committed after its scope check.
    passes(board.root, ['claim', 'T-0004']);
    const tree = board.treeOf('T-0004');
    mkdirSync(join(tree, 'd'));
    writeFileSync(join(tree, 'd/four'), 'four\n');
    const four = gitIn(tree);
    four('add', '-A');
    four('commit', '--quiet', '-m', 'Four');
    passes(board.root, ['log', 'T-0004'], { input: 'Did: four.' });
    passes(board.root, ['submit', 'T-0004']);
    passes(board.root, ['review', 'T-0004'], { worker: BOB });
    passes(board.root, ['accept', 'T-0004'], {
      worker: BOB,
      input: 'Checks: pass.',
    });
    writeFileSync(join(tree, fileOf('T-0004')), 'a task file\n');
    four('commit', '--quiet', '-am', 'A task file');
    const head = four('rev-parse', 'HEAD');
    // The text of the submission names the commit with the task file.
    const file = join(board.root, fileOf('T-0004'));
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        /Committed as [0-9a-f]+/,
        `Committed as ${head}`,
      ),
    );
    refuses(
      board.root,
      ['land', 'T-0004'],
      /T-0004 is not landed and is ready again: its change holds task files \(work\/tasks\/T-0004-a-task\.md\)/,
    );
    assert.equal(statusOf(board.root, 'T-0004'), 'ready');
  });

  test('two landings at once are one after the other', async () => {
    const board = treesBoard([
      { id: 'T-0001', writes: ['a/'] },
      { id: 'T-0002', writes: ['b/'] },
    ]);
    accepted(board, 'T-0001');
    accepted(board, 'T-0002', { file: 'b/two' });
    // A landing that holds the lock, in a process that runs.
    const holder = spawn('sleep', ['30']);
    const lock = join(board.root, 'work/claims/landing.lock');
    writeFileSync(lock, `${holder.pid} 2026-11-23T00:00:00Z\n`);
    const landing = id =>
      new Promise(done => {
        const child = spawn(
          process.execPath,
          [TASK, 'land', id, '--root', board.root],
          { env: environment(BOB) },
        );
        let output = '';
        child.stdout.on('data', chunk => (output += chunk));
        child.stderr.on('data', chunk => (output += chunk));
        child.on('exit', status => done({ id, status, output }));
      });
    const both = Promise.all([landing('T-0001'), landing('T-0002')]);
    await new Promise(resolveWait => setTimeout(resolveWait, 1500));
    // While the lock is held neither has landed.
    assert.equal(board.git('branch', '--list', 'task/*').split('\n').length, 2);
    holder.kill();
    rmSync(lock);
    const ends = await both;
    for (const { output } of ends) {
      assert.match(
        output,
        /waits for the landing that holds work\/claims\/landing\.lock/,
      );
    }
    // One lands; the other, made from the same main, is stale after it.
    const landed = ends.filter(end => end.status === 0);
    const sent = ends.filter(end => end.status === 1);
    assert.equal(landed.length, 1, ends.map(end => end.output).join('\n'));
    assert.match(
      sent[0].output,
      /is not landed and is ready again: it is stale/,
    );
    assert.ok(!existsSync(lock));
  });

  test('a landing lock whose process is gone is taken', () => {
    const board = treesBoard([{ id: 'T-0001' }]);
    accepted(board, 'T-0001');
    const gone = spawnSync('true').pid;
    writeFileSync(
      join(board.root, 'work/claims/landing.lock'),
      `${gone} 2026-11-23T00:00:00Z\n`,
    );
    const result = passes(board.root, ['land', 'T-0001'], { worker: BOB });
    assert.match(
      result.stderr,
      new RegExp(
        `landing\\.lock was left by process ${gone}, which is gone: removed`,
      ),
    );
  });

  test('a task waits to be claimed for the landing of an accepted dependency, and of an overlapping tree', () => {
    const board = treesBoard([
      { id: 'T-0001', writes: ['a/'] },
      {
        id: 'T-0002',
        writes: ['b/'],
        'depends-on': ['T-0001'],
        status: 'backlog',
      },
      { id: 'T-0003', writes: ['a/x'] },
    ]);
    accepted(board, 'T-0001');
    assert.equal(statusOf(board.root, 'T-0002'), 'ready');
    refuses(
      board.root,
      ['claim', 'T-0002'],
      /it depends on T-0001, which is accepted and not landed on main yet/,
    );
    refuses(
      board.root,
      ['claim', 'T-0003'],
      /T-0001 \(done\) changes a\/x and a\/ in its tree, and its change is not on main yet/,
    );
    passes(board.root, ['land', 'T-0001'], { worker: BOB });
    passes(board.root, ['claim', 'T-0002']);
  });

  test('no git command of the command pushes, fetches or names a remote', () => {
    for (const file of ['task.mjs', 'lib/worktrees.mjs']) {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      for (const word of [
        'push',
        'fetch',
        'pull',
        'remote',
        'origin',
        'ls-remote',
      ]) {
        assert.doesNotMatch(
          source,
          new RegExp(`'${word}'`),
          `${file} names '${word}'`,
        );
      }
    }
  });
});
