/**
 * Clean Command
 *
 * Removes the .gitnexus index from the current repository.
 * Also unregisters it from the global registry.
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../core/logger.js';
import {
  findRepo,
  unregisterRepo,
  listRegisteredRepos,
  readRegistry,
  assertSafeStoragePath,
  getStoragePaths,
  removeBranchIndex,
  UnsafeStoragePathError,
  type RegistryEntry,
} from '../storage/repo-manager.js';
import {
  cleanQuarantinedMissingShadowWals,
  inspectLbugSidecars,
  listQuarantinedMissingShadowWals,
} from '../core/lbug/sidecar-recovery.js';
import { t } from './i18n/index.js';

export const cleanCommand = async (options?: {
  force?: boolean;
  all?: boolean;
  lbugSidecars?: boolean;
  branch?: string;
  gc?: boolean;
  dryRun?: boolean;
  olderThanDays?: string | number;
}) => {
  if (options?.gc) {
    await cleanGc(options);
    return;
  }

  // --branch <name>: remove a single non-primary branch's index (#2106 R7).
  // Resolve against the RECORDED branches[] summary (never by slugging the
  // user's raw input, which can disagree with the index-time-sanitized label).
  if (options?.branch) {
    const cwd = process.cwd();
    const repo = await findRepo(cwd);
    if (!repo) {
      console.log(t('clean.notFoundHere'));
      return;
    }
    const entries = await listRegisteredRepos();
    const entry = entries.find((e) => path.resolve(e.path) === path.resolve(repo.repoPath));
    const summary = entry?.branches?.find((b) => b.branch === options.branch);
    if (!summary) {
      console.log(t('clean.branchNotIndexed', { branch: options.branch }));
      return;
    }
    const { storagePath, lbugPath } = getStoragePaths(repo.repoPath, summary.branch);
    const branchDir = path.dirname(lbugPath);
    // Safety guard: the target MUST live under <repo>/.gitnexus/branches/.
    // assertSafeStoragePath only validates the flat `<repo>/.gitnexus`, so this
    // is a dedicated branches-sub-dir check before any destructive fs.rm.
    const branchesRoot = path.join(storagePath, 'branches') + path.sep;
    if (!branchDir.startsWith(branchesRoot)) {
      logger.error(`Refusing to clean branch index outside .gitnexus/branches: ${branchDir}`);
      return;
    }
    if (!options.force) {
      console.log(t('clean.deleteBranch', { branch: summary.branch, path: branchDir }));
      console.log(`\n${t('common.runForceConfirm')}`);
      return;
    }
    try {
      await fs.rm(branchDir, { recursive: true, force: true });
      await removeBranchIndex(repo.repoPath, summary.branch);
      console.log(t('clean.deletedBranch', { branch: summary.branch }));
    } catch (err) {
      logger.error({ err }, 'Failed to delete branch index:');
    }
    return;
  }

  if (options?.lbugSidecars) {
    const cwd = process.cwd();
    const repo = await findRepo(cwd);

    if (!repo) {
      console.log(t('clean.notFoundHere'));
      return;
    }

    const lbugPath = path.join(repo.storagePath, 'lbug');
    const state = await inspectLbugSidecars(lbugPath);
    const quarantined = await listQuarantinedMissingShadowWals(lbugPath);

    console.log(t('clean.lbugSidecars.state', { state: state.kind }));
    if (quarantined.length === 0) {
      console.log(t('clean.lbugSidecars.none'));
      return;
    }

    if (!options.force) {
      console.log(t('clean.lbugSidecars.preview', { count: quarantined.length }));
      for (const file of quarantined) {
        console.log(`  - ${file}`);
      }
      console.log(`\n${t('common.runForceConfirm')}`);
      return;
    }

    const deleted = await cleanQuarantinedMissingShadowWals(lbugPath);
    console.log(t('clean.lbugSidecars.deleted', { count: deleted.length }));
    return;
  }

  // --all flag: clean all indexed repos
  if (options?.all) {
    if (!options?.force) {
      const entries = await listRegisteredRepos();
      if (entries.length === 0) {
        console.log(t('common.notIndexed'));
        return;
      }
      console.log(t('clean.deleteAll', { count: entries.length }));
      for (const entry of entries) {
        console.log(`  - ${entry.name} (${entry.path})`);
      }
      console.log(`\n${t('common.runForceConfirm')}`);
      return;
    }

    const entries = await listRegisteredRepos();
    for (const entry of entries) {
      // Safety guard (#1003 review — @magyargergo): same rationale as
      // remove.ts. `~/.gitnexus/registry.json` is user-writable, so a
      // corrupted or hand-edited entry could point storagePath at the
      // repo root, an empty string, or anywhere else — and
      // fs.rm(recursive: true) on any of those would be catastrophic.
      // Skip poisoned entries without touching disk, but keep going
      // through the rest of the registry (preserves the existing
      // per-repo error-tolerance semantics of `clean --all`).
      try {
        assertSafeStoragePath(entry);
      } catch (err) {
        if (err instanceof UnsafeStoragePathError) {
          logger.error(`Refusing to clean ${entry.name}: ${err.message}`);
          continue;
        }
        throw err;
      }

      try {
        await fs.rm(entry.storagePath, { recursive: true, force: true });
        await unregisterRepo(entry.path);
        console.log(t('clean.deletedRepo', { name: entry.name, storagePath: entry.storagePath }));
      } catch (err) {
        logger.error({ err }, `Failed to delete ${entry.name}:`);
      }
    }
    return;
  }

  // Default: clean current repo
  const cwd = process.cwd();
  const repo = await findRepo(cwd);

  if (!repo) {
    console.log(t('clean.notFoundHere'));
    return;
  }

  const repoName = repo.repoPath.split(/[/\\]/).pop() || repo.repoPath;

  if (!options?.force) {
    console.log(t('clean.deleteCurrent', { repoName }));
    console.log(`   ${t('common.path')}: ${repo.storagePath}`);
    console.log(`\n${t('common.runForceConfirm')}`);
    return;
  }

  try {
    await fs.rm(repo.storagePath, { recursive: true, force: true });
    await unregisterRepo(repo.repoPath);
    console.log(t('common.deleted', { target: repo.storagePath }));
  } catch (err) {
    logger.error({ err }, 'Failed to delete:');
  }
};

interface GcCandidate {
  entry: RegistryEntry;
  reason: string;
  sizeBytes: number;
}

const parseOlderThanDays = (value: string | number | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const days = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 0) {
    throw new Error(`--older-than-days must be a non-negative integer, got: ${value}`);
  }
  return days;
};

const isMissingPathError = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const directorySizeBytes = async (target: string): Promise<number> => {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch (err) {
    if (isMissingPathError(err)) return 0;
    throw err;
  }
  for (const entry of entries) {
    const p = path.join(target, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(p);
    } else if (entry.isFile()) {
      try {
        total += (await fs.stat(p)).size;
      } catch (err) {
        if (!isMissingPathError(err)) throw err;
      }
    }
  }
  return total;
};

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`;
};

const getEntryGcReason = async (
  entry: RegistryEntry,
  olderThanDays: number | undefined,
  nowMs: number,
): Promise<string | null> => {
  try {
    await fs.access(entry.storagePath);
  } catch (err) {
    if (isMissingPathError(err)) return 'storage missing';
    logger.warn(
      {
        name: entry.name,
        storagePath: entry.storagePath,
        code: (err as NodeJS.ErrnoException)?.code,
      },
      'Skipping GitNexus GC candidate because storage access failed but was not provably missing.',
    );
    return null;
  }

  try {
    await fs.access(path.join(entry.storagePath, 'meta.json'));
  } catch (err) {
    if (isMissingPathError(err)) return 'meta missing';
    logger.warn(
      {
        name: entry.name,
        storagePath: entry.storagePath,
        code: (err as NodeJS.ErrnoException)?.code,
      },
      'Skipping GitNexus GC candidate because meta access failed but was not provably missing.',
    );
    return null;
  }

  if (olderThanDays !== undefined) {
    const indexedAtMs = Date.parse(entry.indexedAt);
    if (Number.isFinite(indexedAtMs)) {
      const ageMs = nowMs - indexedAtMs;
      if (ageMs >= olderThanDays * 24 * 60 * 60 * 1000) {
        return `older than ${olderThanDays} day(s)`;
      }
    }
  }

  return null;
};

const collectGcCandidates = async (
  entries: RegistryEntry[],
  olderThanDays: number | undefined,
): Promise<GcCandidate[]> => {
  const nowMs = Date.now();
  const candidates: GcCandidate[] = [];
  for (const entry of entries) {
    const reason = await getEntryGcReason(entry, olderThanDays, nowMs);
    if (!reason) continue;
    let sizeBytes = 0;
    try {
      sizeBytes = await directorySizeBytes(entry.storagePath);
    } catch (err) {
      logger.warn(
        {
          name: entry.name,
          storagePath: entry.storagePath,
          code: (err as NodeJS.ErrnoException)?.code,
        },
        'Could not measure GitNexus GC candidate size.',
      );
    }
    candidates.push({ entry, reason, sizeBytes });
  }
  return candidates;
};

const cleanGc = async (options: {
  force?: boolean;
  dryRun?: boolean;
  olderThanDays?: string | number;
}): Promise<void> => {
  const olderThanDays = parseOlderThanDays(options.olderThanDays);
  const entries = await readRegistry();
  if (entries.length === 0) {
    console.log(t('common.notIndexed'));
    return;
  }

  const candidates = await collectGcCandidates(entries, olderThanDays);
  if (candidates.length === 0) {
    console.log('No GitNexus GC candidates found.');
    if (olderThanDays === undefined) {
      console.log('Tip: pass --older-than-days <days> to include old but still-present indexes.');
    }
    return;
  }

  const dryRun = options.dryRun === true || options.force !== true;
  console.log(`${dryRun ? 'Would delete' : 'Deleting'} ${candidates.length} GitNexus index(es):`);
  for (const candidate of candidates) {
    console.log(
      `  - ${candidate.entry.name} (${candidate.reason}, ${formatBytes(candidate.sizeBytes)})`,
    );
    console.log(`    ${candidate.entry.storagePath}`);
  }

  if (dryRun) {
    console.log('\nRun with --gc --force to apply this cleanup.');
    return;
  }

  for (const candidate of candidates) {
    const { entry } = candidate;
    try {
      assertSafeStoragePath(entry);
    } catch (err) {
      if (err instanceof UnsafeStoragePathError) {
        logger.error(`Refusing to clean ${entry.name}: ${err.message}`);
        continue;
      }
      throw err;
    }

    try {
      await fs.rm(entry.storagePath, { recursive: true, force: true });
      await unregisterRepo(entry.path);
      console.log(t('clean.deletedRepo', { name: entry.name, storagePath: entry.storagePath }));
    } catch (err) {
      logger.error({ err }, `Failed to delete ${entry.name}:`);
    }
  }
};
