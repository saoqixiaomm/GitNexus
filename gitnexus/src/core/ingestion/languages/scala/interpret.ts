import type { CaptureMatch, ParsedImport, ParsedTypeBinding, TypeRef } from 'gitnexus-shared';

export function interpretScalaImport(captures: CaptureMatch): ParsedImport | null {
  const kindCap = captures['@import.kind'];
  const sourceCap = captures['@import.source'];
  const nameCap = captures['@import.name'];

  const kind = kindCap?.text;
  if (kind === undefined || sourceCap === undefined) return null;

  if (kind === 'wildcard') {
    return {
      kind: 'wildcard',
      targetRaw: sourceCap.text + '.*',
    };
  }

  if (kind === 'named') {
    const importedName = simpleName(sourceCap.text);
    const localName = nameCap?.text ?? importedName;
    const common = {
      localName,
      importedName,
      targetRaw: sourceCap.text,
      targetIncludesImportedName: true,
    } as const;
    return localName === importedName
      ? { kind: 'named', ...common }
      : { kind: 'alias', ...common, alias: localName };
  }

  return null;
}

export function interpretScalaTypeBinding(captures: CaptureMatch): ParsedTypeBinding | null {
  const nameCap = captures['@type-binding.name'];
  const typeCap = captures['@type-binding.type'];
  if (nameCap === undefined || typeCap === undefined) return null;

  const rawType = normalizeScalaType(typeCap.text);
  if (rawType.length === 0) return null;

  let source: TypeRef['source'] = 'parameter-annotation';
  if (captures['@type-binding.self'] !== undefined) source = 'self';
  else if (captures['@type-binding.constructor'] !== undefined) source = 'constructor-inferred';
  else if (captures['@type-binding.annotation'] !== undefined) source = 'annotation';
  else if (captures['@type-binding.return'] !== undefined) source = 'return-annotation';

  return { boundName: nameCap.text, rawTypeName: rawType, source };
}

export function normalizeScalaType(text: string): string {
  let value = text.trim();
  if (value.startsWith('=>')) value = value.slice(2).trim();
  value = value.replace(/^`|`$/g, '');
  value = stripGeneric(value);
  value = stripQualifier(value);
  return value.replace(/^`|`$/g, '').trim();
}

function stripGeneric(text: string): string {
  const trimmed = text.trim();
  const firstBracket = trimmed.search(/[\[<]/);
  if (firstBracket === -1) return trimmed;
  return trimmed.slice(0, firstBracket).trim();
}

function stripQualifier(text: string): string {
  const lastDot = text.lastIndexOf('.');
  if (lastDot === -1) return text;
  return text.slice(lastDot + 1);
}

function simpleName(path: string): string {
  return path.split('.').filter(Boolean).pop() ?? path;
}
