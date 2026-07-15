import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanCommand } from '../../src/cli/clean.js';
import { readRegistry, type RegistryEntry } from '../../src/storage/repo-manager.js';

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const writeRegistry = async (home: string, entries: RegistryEntry[]): Promise<void> => {
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(path.join(home, 'registry.json'), JSON.stringify(entries, null, 2), 'utf-8');
};

describe('clean --gc', () => {
  const savedHome = process.env.GITNEXUS_HOME;

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedHome === undefined) delete process.env.GITNEXUS_HOME;
    else process.env.GITNEXUS_HOME = savedHome;
  });

  it('dry-runs by default and leaves candidate indexes registered', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-clean-gc-dry-'));
    const home = path.join(root, 'home');
    const repoPath = path.join(root, 'repo');
    const storagePath = path.join(repoPath, '.gitnexus');
    try {
      process.env.GITNEXUS_HOME = home;
      await fs.mkdir(storagePath, { recursive: true });
      await fs.writeFile(path.join(storagePath, 'orphan.txt'), 'x', 'utf-8');
      await writeRegistry(home, [
        {
          name: 'stale',
          path: repoPath,
          storagePath,
          indexedAt: '2024-01-01T00:00:00.000Z',
          lastCommit: 'abc',
        },
      ]);

      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });

      await cleanCommand({ gc: true });

      expect(await exists(storagePath)).toBe(true);
      expect(await readRegistry()).toHaveLength(1);
      expect(logs.join('\n')).toContain('Would delete 1 GitNexus index');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('deletes GC candidates and unregisters them with --force', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-clean-gc-force-'));
    const home = path.join(root, 'home');
    const repoPath = path.join(root, 'repo');
    const storagePath = path.join(repoPath, '.gitnexus');
    try {
      process.env.GITNEXUS_HOME = home;
      await fs.mkdir(storagePath, { recursive: true });
      await fs.writeFile(path.join(storagePath, 'orphan.txt'), 'x', 'utf-8');
      await writeRegistry(home, [
        {
          name: 'stale',
          path: repoPath,
          storagePath,
          indexedAt: '2024-01-01T00:00:00.000Z',
          lastCommit: 'abc',
        },
      ]);

      vi.spyOn(console, 'log').mockImplementation(() => {});

      await cleanCommand({ gc: true, force: true });

      expect(await exists(storagePath)).toBe(false);
      expect(await readRegistry()).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
