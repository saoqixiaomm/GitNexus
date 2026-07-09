import type { ParsedImport, WorkspaceIndex } from 'gitnexus-shared';

export interface ScalaResolveContext {
  readonly fromFile: string;
  readonly allFilePaths: ReadonlySet<string>;
}

const JVM_EXTENSIONS = ['.scala', '.sc', '.java', '.kt', '.kts'] as const;

export function resolveScalaImportTarget(
  parsedImport: ParsedImport,
  workspaceIndex: WorkspaceIndex,
): string | readonly string[] | null {
  const ctx = workspaceIndex as ScalaResolveContext | undefined;
  if (
    ctx === undefined ||
    typeof (ctx as { fromFile?: unknown }).fromFile !== 'string' ||
    !((ctx as { allFilePaths?: unknown }).allFilePaths instanceof Set)
  ) {
    return null;
  }
  if (parsedImport.kind === 'dynamic-unresolved') return null;
  if (parsedImport.targetRaw === null || parsedImport.targetRaw === '') return null;

  const wildcard = parsedImport.targetRaw.endsWith('.*');
  const target = wildcard ? parsedImport.targetRaw.slice(0, -2) : parsedImport.targetRaw;
  const pathLike = target.replace(/\./g, '/');
  const rootPrefix = preferredSourceRoot(ctx.fromFile);
  if (wildcard) {
    return (
      findJvmPackageFiles(ctx.allFilePaths, pathLike, rootPrefix) ??
      findJvmPackageFiles(ctx.allFilePaths, pathLike)
    );
  }

  const stripped = pathLike.split('/').slice(0, -1).join('/');
  return (
    findJvmFile(ctx.allFilePaths, pathLike, rootPrefix) ??
    findJvmFile(ctx.allFilePaths, pathLike) ??
    findJvmExactOrSuffix(ctx.allFilePaths, stripped, rootPrefix) ??
    findJvmExactOrSuffix(ctx.allFilePaths, stripped) ??
    findJvmPackageFiles(ctx.allFilePaths, stripped, rootPrefix) ??
    findJvmPackageFiles(ctx.allFilePaths, stripped) ??
    findByProgressivePrefixStrip(ctx.allFilePaths, pathLike, rootPrefix) ??
    findByProgressivePrefixStrip(ctx.allFilePaths, pathLike)
  );
}

function findJvmFile(
  allFilePaths: ReadonlySet<string>,
  pathLike: string,
  rootPrefix?: string | null,
): string | null {
  return (
    findJvmExactOrSuffix(allFilePaths, pathLike, rootPrefix) ??
    findJvmDirectoryChild(allFilePaths, pathLike, rootPrefix)
  );
}

function findJvmExactOrSuffix(
  allFilePaths: ReadonlySet<string>,
  pathLike: string,
  rootPrefix?: string | null,
): string | null {
  if (pathLike === '') return null;
  if (rootPrefix !== undefined && rootPrefix !== null) {
    const rooted = `${rootPrefix}${pathLike}`;
    for (const raw of allFilePaths) {
      const file = raw.replace(/\\/g, '/');
      if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
      for (const ext of JVM_EXTENSIONS) {
        if (file === `${rooted}${ext}`) return raw;
      }
    }
  }

  const suffix = `/${pathLike}`;
  let suffixFile: string | null = null;

  for (const raw of allFilePaths) {
    const file = raw.replace(/\\/g, '/');
    if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    for (const ext of JVM_EXTENSIONS) {
      if (file === `${pathLike}${ext}`) return raw;
      if (suffixFile === null && file.endsWith(`${suffix}${ext}`)) suffixFile = raw;
    }
  }

  return suffixFile;
}

function findJvmDirectoryChild(
  allFilePaths: ReadonlySet<string>,
  pathLike: string,
  rootPrefix?: string | null,
): string | null {
  if (pathLike === '') return null;
  if (rootPrefix !== undefined && rootPrefix !== null) {
    const rootedDirPrefix = `${rootPrefix}${pathLike}/`;
    for (const raw of allFilePaths) {
      const file = raw.replace(/\\/g, '/');
      if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
      if (!file.startsWith(rootedDirPrefix)) continue;
      const after = file.slice(rootedDirPrefix.length);
      if (after.length > 0 && !after.includes('/')) return raw;
    }
  }

  const dirPrefix = `${pathLike}/`;
  const suffixDirPrefix = `/${dirPrefix}`;

  for (const raw of allFilePaths) {
    const file = raw.replace(/\\/g, '/');
    if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    const atRoot = file.startsWith(dirPrefix);
    const atNested = file.includes(suffixDirPrefix);
    if (!atRoot && !atNested) continue;
    const idx = atRoot ? 0 : file.indexOf(suffixDirPrefix) + 1;
    const after = file.slice(idx + dirPrefix.length);
    if (after.length > 0 && !after.includes('/')) return raw;
  }

  return null;
}

function findJvmPackageFiles(
  allFilePaths: ReadonlySet<string>,
  dirPath: string,
  rootPrefix?: string | null,
): readonly string[] | null {
  if (dirPath === '') return null;
  if (rootPrefix !== undefined && rootPrefix !== null) {
    const rootedDirPrefix = `${rootPrefix}${dirPath}/`;
    const rooted: string[] = [];
    for (const raw of allFilePaths) {
      const file = raw.replace(/\\/g, '/');
      if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
      if (!file.startsWith(rootedDirPrefix)) continue;
      const after = file.slice(rootedDirPrefix.length);
      if (after.length === 0 || after.includes('/')) continue;
      rooted.push(raw);
    }
    if (rooted.length > 0) return rooted;
  }

  const dirPrefix = `${dirPath}/`;
  const suffixDirPrefix = `/${dirPrefix}`;
  const out: string[] = [];

  for (const raw of allFilePaths) {
    const file = raw.replace(/\\/g, '/');
    if (!JVM_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    const atRoot = file.startsWith(dirPrefix);
    const atNested = file.includes(suffixDirPrefix);
    if (!atRoot && !atNested) continue;
    const idx = atRoot ? 0 : file.indexOf(suffixDirPrefix) + 1;
    const after = file.slice(idx + dirPrefix.length);
    if (after.length === 0 || after.includes('/')) continue;
    out.push(raw);
  }

  return out.length === 0 ? null : out;
}

function findByProgressivePrefixStrip(
  allFilePaths: ReadonlySet<string>,
  pathLike: string,
  rootPrefix?: string | null,
): string | null {
  const segments = pathLike.split('/').filter(Boolean);
  for (let skip = 1; skip < segments.length; skip++) {
    const found = findJvmFile(allFilePaths, segments.slice(skip).join('/'), rootPrefix);
    if (found !== null) return found;
  }
  return null;
}

function preferredSourceRoot(fromFile: string): string | null {
  const normalized = fromFile.replace(/\\/g, '/');
  const markers = ['/src/main/scala/', '/src/test/scala/', '/app/', '/test/'];
  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx !== -1) return normalized.slice(0, idx + marker.length);
  }
  for (const marker of ['src/main/scala/', 'src/test/scala/', 'app/', 'test/']) {
    if (normalized.startsWith(marker)) return marker;
  }
  return null;
}
