import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalizePath, getGlobalDir } from './repo-manager.js';
import { resolveRepoIdentityRoot } from './git.js';

export interface SharedCacheIdentity {
  kind: 'remote' | 'identity-root';
  value: string;
}

export interface SharedCachePaths {
  repoId: string;
  rootPath: string;
  parseCachePath: string;
  identity: SharedCacheIdentity;
}

const hashIdentity = (identity: SharedCacheIdentity): string =>
  createHash('sha256').update(`${identity.kind}:${identity.value}`).digest('hex').slice(0, 32);

export const resolveSharedCacheIdentity = (
  repoPath: string,
  remoteUrl?: string,
): SharedCacheIdentity => {
  const remote = remoteUrl?.trim();
  if (remote) return { kind: 'remote', value: remote };
  return {
    kind: 'identity-root',
    value: canonicalizePath(resolveRepoIdentityRoot(repoPath)),
  };
};

export const getSharedCachePaths = (repoPath: string, remoteUrl?: string): SharedCachePaths => {
  const identity = resolveSharedCacheIdentity(repoPath, remoteUrl);
  const repoId = hashIdentity(identity);
  const rootPath = path.join(getGlobalDir(), 'cache', 'repos', repoId);
  return {
    repoId,
    rootPath,
    parseCachePath: path.join(rootPath, 'parse'),
    identity,
  };
};
