/**
 * The git of the task board (work/README.md, "Trees"; the design is
 * docs/engineering/worktrees.md): how the command runs git with the
 * repository's own configuration alone, where the board of a checkout is,
 * and a task's tree and branch beside the repository, their record under `work/claims/T-NNNN/`, their removal,
 * and the steps of a landing on `main`.
 *
 * No function here pushes, fetches or names a remote. Each one that
 * changes git changes the task's own tree and branch, or, in a landing
 * alone, the main checkout (`fastForward`).
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { devNull } from 'node:os';
import { join, resolve } from 'node:path';

/** What the command refuses about trees and git, said without a stack. */
export class TreeRefusal extends Error {}

/** Where the trees are, from the main checkout: beside the repository. */
const TREES_DIRECTORY = '../aep-trees';

/** The branch every tree is made from and every landing moves. */
const BASE_BRANCH = 'main';

/** The branch of a task's tree. */
const branchOf = id => `task/${id}`;

/** The record of a task's tree, in its directory under `work/claims/`. */
export const TREE_RECORD = 'tree';

/** The lock of the board that one landing at a time holds. */
const LANDING_LOCK = 'work/claims/landing.lock';

/**
 * The environment for git: the repository's own configuration alone.
 * Caller `GIT_*` variables are left out, the user's and system's
 * configuration files are skipped (`devNull`), and `GIT_CONFIG_NOSYSTEM`
 * also keeps out a distribution's extra system file (git(1), ENVIRONMENT).
 */
function gitEnvironment() {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  return {
    ...inherited,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: 'true',
  };
}

/**
 * Runs git on `root` with the repository's own configuration alone: no
 * global or system configuration, no user exclusion (`core.excludesFile`)
 * or attribute (`core.attributesFile`) files, and no caller `GIT_*`
 * variables, so that it answers the same on every machine.
 */
export function git(root, ...command) {
  return spawnSync(
    'git',
    [
      '-C',
      root,
      '-c',
      `core.excludesFile=${devNull}`,
      '-c',
      `core.attributesFile=${devNull}`,
      ...command,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      env: gitEnvironment(),
    },
  );
}

/** Why a git command failed, from its spawn error, stderr, signal or status. */
export function gitFailure(result) {
  if (result.error) {
    return result.error.message;
  }
  const detail = result.stderr?.trim();
  if (detail) {
    return detail;
  }
  return result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
}

/** Runs a git command that must succeed, or refuses with why. */
function must(root, ...command) {
  const result = git(root, ...command);
  if (result.status !== 0) {
    throw new TreeRefusal(
      `git ${command.join(' ')} failed in ${root}: ${gitFailure(result)}`,
    );
  }
  return result.stdout;
}

/** Whether `root` holds a `.git` entry (directory, gitfile or symlink). */
function hasGitEntry(root) {
  try {
    lstatSync(join(root, '.git'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

const sameDirectory = (a, b) =>
  existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b);

/**
 * The worktrees of the repository of `root`, as `git worktree list
 * --porcelain` gives them, the main one first: each one's path and the
 * branch it has out (`refs/heads/...`, or nothing when detached).
 */
function worktreesOf(root) {
  return must(root, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .filter(block => block.startsWith('worktree '))
    .map(block => ({
      path: /^worktree (.*)$/m.exec(block)[1],
      branch: /^branch (.*)$/m.exec(block)?.[1],
    }));
}

/**
 * Where the board of the checkout at `root` is: the main worktree, the
 * first of `git worktree list --porcelain`. `linked` tells that `root` is
 * a linked worktree (its git directory is not the common one), whose own
 * copy of the board is not the board. A directory that is no checkout is
 * its own board.
 */
export function checkoutOf(root) {
  if (!hasGitEntry(root)) {
    return { board: root, linked: false };
  }
  const [gitDirectory, common] = must(
    root,
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
    '--git-common-dir',
  )
    .trim()
    .split('\n');
  if (sameDirectory(gitDirectory, common)) {
    return { board: root, linked: false };
  }
  return { board: worktreesOf(root)[0].path, linked: true };
}

/** The commit a ref names, or nothing when it names none. */
export function commitOf(root, ref) {
  const result = git(
    root,
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  );
  if (result.status === 0) {
    return result.stdout.trim();
  }
  if (result.status === 1 && !result.error && result.stderr.trim() === '') {
    return undefined;
  }
  throw new TreeRefusal(
    `git rev-parse --verify ${ref} failed in ${root}: ${gitFailure(result)}`,
  );
}

/** Whether commit `a` is an ancestor of commit `b` (or is `b`). */
export function isAncestor(root, a, b) {
  const result = git(root, 'merge-base', '--is-ancestor', a, b);
  if (result.status === 0 || result.status === 1) {
    return result.status === 0;
  }
  throw new TreeRefusal(
    `git merge-base --is-ancestor ${a} ${b} failed: ${gitFailure(result)}`,
  );
}

/** The files that differ between two commits. */
export const filesBetween = (root, a, b) =>
  must(root, 'diff', '--name-only', '-z', a, b).split('\0').filter(Boolean);

/**
 * The files that keep a tree from being removed clean: those git does not
 * ignore that are untracked, and the tracked ones modified, staged or not.
 * Of a rename or a copy in the index, `--porcelain -z` gives the new path
 * and then the old one as an entry of its own, with no status.
 */
export function unclean(tree) {
  const entries = must(
    tree,
    '--no-optional-locks',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ).split('\0');
  const files = [];
  for (let at = 0; at < entries.length; at++) {
    const entry = entries[at];
    if (entry.length > 3) {
      files.push(entry.slice(3));
      if (entry[0] === 'R' || entry[0] === 'C') {
        files.push(entries[++at]);
      }
    }
  }
  return files;
}

/** The branch the checkout at `root` has out (`refs/heads/...`), or nothing. */
export function branchOut(root) {
  const result = git(root, 'symbolic-ref', '--quiet', 'HEAD');
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * The commit a task's change is measured from in its tree: the last that
 * its branch shares with `main` (`git merge-base`). It is the commit the
 * tree was made at until the worker rebases or merges `main`, and `main`'s
 * head after, so a scope check against it holds the task's change alone.
 */
export const baseOf = tree =>
  must(tree, 'merge-base', `refs/heads/${BASE_BRANCH}`, 'HEAD').trim();

// The record of a task's tree.

const recordFile = (board, id) => join(board, 'work/claims', id, TREE_RECORD);

/**
 * What the claim of a task recorded of its tree: its
 * path, its branch, the commit of `main` it was made at (`base`, and the
 * branch, `from`), and, once its change is on `main`, the commit that
 * landed (`landed`). Nothing when the task has no tree. The record stays
 * from the claim until the tree and the branch are removed, across the
 * review and a claim given back, as the task's files stay in the shared
 * checkout.
 */
export function treeRecordOf(board, id) {
  const file = recordFile(board, id);
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    for (const field of ['tree', 'branch', 'base', 'from']) {
      if (typeof record[field] !== 'string' || record[field] === '') {
        throw new Error(`it has no "${field}"`);
      }
    }
    return record;
  } catch (error) {
    throw new TreeRefusal(
      `work/claims/${id}/${TREE_RECORD} is not the record of a tree ` +
        `(${error.message}): it was written by the task command and is ` +
        'not edited',
    );
  }
}

/** Writes the record of a task's tree, in one rename. */
export function writeTreeRecord(board, id, record) {
  const file = recordFile(board, id);
  mkdirSync(join(board, 'work/claims', id), { recursive: true });
  const draft = `${file}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(draft, file);
}

/**
 * Removes the record of a task's tree, and the task's directory under
 * `work/claims/` when nothing else is left in it.
 */
export function removeTreeRecord(board, id) {
  rmSync(recordFile(board, id), { force: true });
  const directory = join(board, 'work/claims', id);
  if (existsSync(directory) && readdirSync(directory).length === 0) {
    rmdirSync(directory);
  }
}

/** Every task with a tree on the board: its id and its record. */
export function treeRecords(board) {
  const claims = join(board, 'work/claims');
  if (!existsSync(claims)) {
    return [];
  }
  return readdirSync(claims)
    .filter(name => /^T-\d{4}$/.test(name))
    .sort()
    .flatMap(id => {
      const record = treeRecordOf(board, id);
      return record === undefined ? [] : [{ id, record }];
    });
}

/** Whether the record's tree is a worktree of the repository now. */
export const treeIsThere = (board, record) =>
  worktreesOf(board).some(each => sameDirectory(each.path, record.tree));

/** Whether a branch is there. */
const branchIsThere = (board, branch) =>
  commitOf(board, `refs/heads/${branch}`) !== undefined;

// Making a tree, and removing it.

/**
 * Makes the tree of task `id` from the head of `main`, on a new branch
 * `task/T-NNNN`, in `TREES_DIRECTORY`: `git worktree add -b`. It refuses
 * when `main` has no commit, or when the tree's directory or the branch is
 * there already and no record of the task names them. Returns the record,
 * which it does not write.
 */
export function makeTree(board, id) {
  const base = commitOf(board, `refs/heads/${BASE_BRANCH}`);
  if (base === undefined) {
    throw new TreeRefusal(
      `${BASE_BRANCH} has no commit, and a tree is made from its head: the ` +
        `owner makes ${BASE_BRANCH}'s commit first`,
    );
  }
  const tree = resolve(board, TREES_DIRECTORY, id);
  const branch = branchOf(id);
  if (existsSync(tree)) {
    throw new TreeRefusal(
      `${tree} is there, and no claim of ${id} records it: it is not the ` +
        "command's to take or remove",
    );
  }
  if (branchIsThere(board, branch)) {
    throw new TreeRefusal(
      `the branch ${branch} is there, and no claim of ${id} records it: it ` +
        "is not the command's to take or delete",
    );
  }
  mkdirSync(resolve(board, TREES_DIRECTORY), { recursive: true });
  must(board, 'worktree', 'add', '--quiet', '-b', branch, tree, base);
  return { tree, branch, base, from: BASE_BRANCH };
}

/**
 * Makes the tree of a record again from its branch, which holds the work of
 * an earlier claim (`git worktree add` with no new branch).
 */
export function reopenTree(board, record) {
  if (existsSync(record.tree)) {
    throw new TreeRefusal(
      `${record.tree} is there and is no worktree of the repository: it is ` +
        "not the command's to take or remove",
    );
  }
  mkdirSync(resolve(record.tree, '..'), { recursive: true });
  must(board, 'worktree', 'add', '--quiet', record.tree, record.branch);
}

/** The path of Yarn a checkout's `.yarnrc.yml` names, or nothing. */
function yarnPathOf(tree) {
  const file = join(tree, '.yarnrc.yml');
  if (!existsSync(file)) {
    return undefined;
  }
  return /^yarnPath:\s*['"]?([^'"\s#]+)/m.exec(readFileSync(file, 'utf8'))?.[1];
}

/**
 * Installs a checkout's dependencies, its own: the Yarn its `.yarnrc.yml`
 * names, `install --immutable`, with what it says on stderr. A checkout
 * with no `package.json` has nothing to install. Says what it did, or
 * refuses with why.
 */
export function install(tree) {
  if (!existsSync(join(tree, 'package.json'))) {
    return `${tree} has no package.json: nothing to install`;
  }
  const yarn = yarnPathOf(tree);
  if (yarn === undefined) {
    throw new TreeRefusal(
      `${tree} has a package.json and its .yarnrc.yml names no yarnPath, so ` +
        'the command cannot install it',
    );
  }
  const result = spawnSync(
    process.execPath,
    [join(tree, yarn), 'install', '--immutable'],
    { cwd: tree, stdio: ['ignore', 2, 2], env: process.env },
  );
  if (result.status !== 0) {
    throw new TreeRefusal(
      `the install of ${tree} failed (${gitFailure({ ...result, stderr: '' })})`,
    );
  }
  return `${tree} is installed (${yarn} install --immutable)`;
}

/**
 * Removes the tree and the branch of a record, by their names, and says
 * what is left:
 *
 * - a tree that is not clean is left, and `holding` names the files that
 *   hold it (`unclean`); `git worktree remove` is run without `--force`;
 * - a branch that holds a commit `main` does not is left (`keptBranch`):
 *   its work is no one's to delete; one that holds none is deleted.
 *
 * Returns `{ removed, holding, keptBranch, said }`; `removed` is whether
 * nothing of the record is left.
 */
export function removeTree(board, record) {
  const said = [];
  if (treeIsThere(board, record)) {
    const holding = unclean(record.tree);
    if (holding.length > 0) {
      return {
        removed: false,
        holding,
        said: [
          `${record.tree} is left: it is not clean, and these files hold it:\n` +
            holding.map(file => `  ${file}`).join('\n'),
        ],
      };
    }
    must(board, 'worktree', 'remove', record.tree);
    said.push(`${record.tree} is removed`);
  }
  const head = commitOf(board, `refs/heads/${record.branch}`);
  if (head !== undefined) {
    if (!isAncestor(board, head, `refs/heads/${BASE_BRANCH}`)) {
      said.push(
        `the branch ${record.branch} is kept: it holds commits ` +
          `${BASE_BRANCH} does not, and the next claim makes the tree from it`,
      );
      return { removed: false, holding: [], keptBranch: true, said };
    }
    // Every commit of the branch is on main, so deleting it loses nothing.
    must(board, 'branch', '-D', record.branch);
    said.push(`the branch ${record.branch} is deleted`);
  }
  return { removed: true, holding: [], keptBranch: false, said };
}

// Landing.

/** Waits on the spot: the command is synchronous from end to end. */
const pause = milliseconds =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

/** Whether a process of that pid runs now. */
function runs(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const LANDING_POLL_MS = 100;

/**
 * Runs `work` while this process holds the board's landing lock
 * (`LANDING_LOCK`), so that landings run one at a time. The lock holds the
 * pid of its holder and a token of its own, and its holder removes it only
 * while it still holds that text. A process that finds the lock waits,
 * saying once whose it is, up to `waitMs`, which bounds every wait of the
 * landing. A lock whose process is gone (a landing that was killed) is
 * removed under a second lock (`takeOver`), so that of the processes that
 * read the same dead lock one alone removes it, and none removes the lock
 * another has taken since. A lock that names no holder (empty, or that
 * cannot be read) is waited for like a held one: past the bound it was
 * left by a process killed while it wrote it, and the refusal names it, to
 * be removed by hand.
 */
export function withLandingLock(board, work, { waitMs, say }) {
  const lock = join(board, LANDING_LOCK);
  const mine = `${process.pid} ${new Date().toISOString()} ${randomUUID()}`;
  mkdirSync(join(board, 'work/claims'), { recursive: true });
  const bound = { until: Date.now() + waitMs, waitMs };
  let told = false;
  for (;;) {
    if (createdAlone(lock, mine)) {
      break;
    }
    const holder = holderOf(lock);
    if (holder === undefined) {
      continue;
    }
    if (holder.text !== undefined && isLeft(holder.text)) {
      if (takeOver(lock, holder.text, bound)) {
        say(
          `${LANDING_LOCK} was left by process ${holder.text.split(' ')[0]}, ` +
            'which is gone: removed',
        );
      }
      continue;
    }
    if (Date.now() > bound.until) {
      throw heldPastBound(LANDING_LOCK, lock, holder, waitMs);
    }
    if (!told) {
      say(
        `waits for the landing that holds ${LANDING_LOCK} (${named(holder)})`,
      );
      told = true;
    }
    pause(LANDING_POLL_MS);
  }
  try {
    return work();
  } finally {
    if (textOf(lock) === mine) {
      rmSync(lock, { force: true });
    }
  }
}

/** Creates a file with its text, when no file is there: for one process alone. */
function createdAlone(file, text) {
  try {
    writeFileSync(file, `${text}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

/** Whether the text of a lock names a process that is gone. */
function isLeft(text) {
  const pid = Number(text.split(' ')[0]);
  return Number.isInteger(pid) && pid > 0 && !runs(pid);
}

/** The text of a file, trimmed, or nothing when it is gone. */
function textOf(file) {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Who holds a lock: its text, or why it names no holder (`unnamed`: it is
 * empty, or it cannot be read), or nothing when it is gone. A lock is
 * empty for the moment between its creation and its write, and for good
 * when its process was killed in that moment.
 */
function holderOf(lock) {
  try {
    const text = readFileSync(lock, 'utf8').trim();
    return text === '' ? { unnamed: 'it is empty' } : { text };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    return { unnamed: `it cannot be read: ${error.code ?? error.message}` };
  }
}

/** A holder of a lock, in words. */
const named = holder => holder.text ?? `no holder: ${holder.unnamed}`;

/**
 * The refusal of a landing that waited for a lock (`name`, at `path`) up
 * to its bound: one held by a process that runs ends by itself, and one
 * that names no holder was left by a process killed while it wrote it.
 */
function heldPastBound(name, path, holder, waitMs) {
  const after = `after ${Math.round(waitMs / 1000)} s`;
  if (holder.text !== undefined) {
    return new TreeRefusal(
      `another landing holds ${name} (${holder.text}) ${after}: run the ` +
        'command again once it ends',
    );
  }
  return new TreeRefusal(
    `${name} names no holder ${after} (${holder.unnamed}): it was left by ` +
      `a process killed while it wrote it; remove ${path} and run the ` +
      'command again',
  );
}

/** How long a takeover waits for another's whose process is gone, at most. */
const TAKEOVER_WAIT_MS = 5000;

/**
 * Removes a lock whose holder is gone, when it still holds the text read
 * of it (`left`), and says whether it did. It is done under a second lock,
 * `<lock>.takeover`, created for one process alone and held only for the
 * read and the removal: a lock that another process took once the dead
 * one was gone holds another text, and is left. The wait for another's
 * takeover lock ends at the landing's bound (`bound.until`), and the
 * refusal names the file and its holder. A takeover lock still there after
 * `TAKEOVER_WAIT_MS`, or at the bound, its process gone, was left by a
 * process killed in that moment: the refusal names it, to be removed by
 * hand.
 */
function takeOver(lock, left, bound) {
  const guard = `${lock}.takeover`;
  const mine = `${process.pid} ${randomUUID()}`;
  const since = Date.now();
  while (!createdAlone(guard, mine)) {
    const holder = holderOf(guard);
    const now = Date.now();
    if (
      holder?.text !== undefined &&
      isLeft(holder.text) &&
      (now - since > TAKEOVER_WAIT_MS || now > bound.until)
    ) {
      throw new TreeRefusal(
        `${guard} was left by process ${holder.text.split(' ')[0]}, which ` +
          'is gone, while it removed a landing lock: remove it and run the ' +
          'command again',
      );
    }
    if (holder !== undefined && now > bound.until) {
      throw heldPastBound(
        `${LANDING_LOCK}.takeover`,
        guard,
        holder,
        bound.waitMs,
      );
    }
    pause(LANDING_POLL_MS / 10);
  }
  try {
    if (holderOf(lock)?.text !== left) {
      return false;
    }
    rmSync(lock, { force: true });
    return true;
  } finally {
    if (textOf(guard) === mine) {
      rmSync(guard, { force: true });
    }
  }
}

/**
 * Moves `main` in the main checkout to the branch's head, by
 * `git merge --ff-only`, which refuses anything but a fast-forward and
 * stops, changing nothing, when the checkout's own changes meet the files
 * it would update.
 */
export function fastForward(board, branch) {
  const result = git(
    board,
    'merge',
    '--ff-only',
    '--quiet',
    `refs/heads/${branch}`,
  );
  if (result.status !== 0) {
    throw new TreeRefusal(
      `git merge --ff-only ${branch} did not move ${BASE_BRANCH}: ${gitFailure(result)}`,
    );
  }
}
