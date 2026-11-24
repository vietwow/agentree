/**
 * Which packages are the new platform's (RFC 0005), and which belong to
 * the Backstage-based tree that is frozen beside it. The checks and the
 * test runner of the new tree read it here.
 */
import { globSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The frozen tree, which the new tree never imports: its packages under
 * `packages/`, and every plugin. Entries are removed as the tree is.
 */
export const FROZEN_PACKAGES = [
  'packages/app',
  'packages/backend',
  'packages/ui',
  'plugins/*',
];

/**
 * Packages the new tree keeps using that are still built and checked by
 * the frozen tree's tools.
 */
const CARRIED_OVER_PACKAGES = ['packages/design-tokens'];

/** Where a package of the new tree can be. */
const NEW_TREE = ['apps/*', 'modules/*', 'packages/*'];

const toPosix = path => path.split('\\').join('/');

/** The directories of the workspace packages a list of patterns matches. */
export function packagesIn(root, patterns) {
  return patterns
    .flatMap(pattern => globSync(`${pattern}/package.json`, { cwd: root }))
    .map(manifest => toPosix(dirname(manifest)))
    .sort();
}

/**
 * The directories of the new tree's packages, relative to the repository
 * root: everything under apps/, modules/ and packages/ that the frozen
 * tree's tools do not cover.
 */
export function newTreePackages(root) {
  const covered = new Set(
    packagesIn(root, [...FROZEN_PACKAGES, ...CARRIED_OVER_PACKAGES]),
  );
  return packagesIn(root, NEW_TREE).filter(dir => !covered.has(dir));
}
