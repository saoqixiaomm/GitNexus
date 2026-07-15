import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getSharedCachePaths } from '../../src/storage/shared-cache.js';

describe('shared cache paths', () => {
  const savedHome = process.env.GITNEXUS_HOME;

  afterEach(async () => {
    if (savedHome === undefined) delete process.env.GITNEXUS_HOME;
    else process.env.GITNEXUS_HOME = savedHome;
  });

  it('uses GITNEXUS_HOME and shares one repo cache for the same remote', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-shared-cache-home-'));
    try {
      process.env.GITNEXUS_HOME = home;
      const first = getSharedCachePaths('/tmp/worktree-a', 'git@github.com:acme/app');
      const second = getSharedCachePaths('/tmp/worktree-b', 'git@github.com:acme/app');

      expect(first.repoId).toBe(second.repoId);
      expect(first.parseCachePath).toBe(second.parseCachePath);
      expect(first.parseCachePath).toBe(path.join(home, 'cache', 'repos', first.repoId, 'parse'));
      expect(first.identity).toEqual({ kind: 'remote', value: 'git@github.com:acme/app' });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it('does not collapse different remotes', () => {
    const first = getSharedCachePaths('/tmp/worktree-a', 'git@github.com:acme/app');
    const second = getSharedCachePaths('/tmp/worktree-b', 'git@github.com:acme/other');

    expect(first.repoId).not.toBe(second.repoId);
    expect(first.parseCachePath).not.toBe(second.parseCachePath);
  });
});
