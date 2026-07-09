import type { CaptureMatch } from 'gitnexus-shared';
import { nodeToCapture, syntheticCapture, type SyntaxNode } from '../../utils/ast-helpers.js';

interface ScalaImportSpec {
  readonly kind: 'named' | 'wildcard';
  readonly source: string;
  readonly localName?: string;
}

export function splitScalaImportDeclaration(importNode: SyntaxNode): CaptureMatch[] | null {
  if (importNode.type !== 'import_declaration') return null;

  const specs = collectImportSpecs(importNode);
  if (specs.length === 0) return null;

  return specs.map((spec) => ({
    '@import.statement': nodeToCapture('@import.statement', importNode),
    '@import.kind': syntheticCapture('@import.kind', importNode, spec.kind),
    '@import.source': syntheticCapture('@import.source', importNode, spec.source),
    '@import.name': syntheticCapture(
      '@import.name',
      importNode,
      spec.localName ?? simpleName(spec.source),
    ),
  }));
}

function collectImportSpecs(importNode: SyntaxNode): ScalaImportSpec[] {
  const selector = importNode.namedChildren.find((child) => child.type === 'namespace_selectors');
  const wildcard = importNode.namedChildren.find((child) => child.type === 'namespace_wildcard');
  const prefix = importPrefix(importNode);

  if (selector !== undefined) {
    return selectorSpecs(selector, prefix);
  }

  if (wildcard !== undefined && prefix.length > 0) {
    return [{ kind: 'wildcard', source: prefix.join('.') }];
  }

  const parts = importNode.namedChildren
    .filter((child) => child.type === 'identifier')
    .map((child) => child.text)
    .filter(Boolean);
  return parts.length > 0 ? [{ kind: 'named', source: parts.join('.') }] : [];
}

function importPrefix(importNode: SyntaxNode): string[] {
  const parts: string[] = [];
  for (const child of importNode.namedChildren) {
    if (child.type === 'namespace_selectors' || child.type === 'namespace_wildcard') break;
    if (child.type === 'identifier') parts.push(child.text);
  }
  return parts;
}

function selectorSpecs(selector: SyntaxNode, prefix: readonly string[]): ScalaImportSpec[] {
  const specs: ScalaImportSpec[] = [];
  const prefixText = prefix.join('.');

  for (const child of selector.namedChildren) {
    if (child.type === 'identifier') {
      specs.push({ kind: 'named', source: joinImportPath(prefixText, child.text) });
      continue;
    }
    if (child.type === 'namespace_wildcard') {
      specs.push({ kind: 'wildcard', source: prefixText });
      continue;
    }

    const rename = renamedSelector(child, prefixText);
    if (rename !== null) specs.push(rename);
  }

  return specs;
}

function renamedSelector(node: SyntaxNode, prefixText: string): ScalaImportSpec | null {
  if (node.type !== 'arrow_renamed_identifier' && node.type !== 'as_renamed_identifier')
    return null;
  const ids = node.namedChildren.filter((child) => child.type === 'identifier');
  if (ids.length < 2) return null;

  const originalName = ids[0]!.text;
  const localName = ids[1]!.text;
  if (localName === '_') return null;

  return {
    kind: 'named',
    source: joinImportPath(prefixText, originalName),
    localName,
  };
}

function joinImportPath(prefixText: string, name: string): string {
  return prefixText.length > 0 ? `${prefixText}.${name}` : name;
}

function simpleName(path: string): string {
  return path.split('.').filter(Boolean).pop() ?? path;
}
