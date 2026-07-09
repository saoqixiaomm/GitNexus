import type { Capture, CaptureMatch } from 'gitnexus-shared';
import {
  nodeIfType,
  nodeToCapture,
  syntheticCapture,
  type SyntaxNode,
} from '../../utils/ast-helpers.js';
import { getTreeSitterBufferSize } from '../../constants.js';
import { parseSourceSafe } from '../../../tree-sitter/safe-parse.js';
import { splitScalaImportDeclaration } from './import-decomposer.js';
import { getScalaParser, getScalaScopeQuery } from './query.js';

const CLASS_LIKE_TYPES = new Set([
  'class_definition',
  'trait_definition',
  'object_definition',
  'enum_definition',
]);

export function emitScalaScopeCaptures(
  sourceText: string,
  _filePath: string,
  cachedTree?: unknown,
): readonly CaptureMatch[] {
  let tree = cachedTree as ReturnType<ReturnType<typeof getScalaParser>['parse']> | undefined;
  if (tree === undefined) {
    tree = parseSourceSafe(getScalaParser(), sourceText, undefined, {
      bufferSize: getTreeSitterBufferSize(sourceText),
    });
  }

  const out: CaptureMatch[] = [];
  out.push(...synthesizeScalaInheritanceReferences(tree.rootNode));
  out.push(...synthesizeScalaReceiverBindings(tree.rootNode));

  for (const match of getScalaScopeQuery().matches(tree.rootNode)) {
    const grouped: Record<string, Capture> = {};
    const nodeMap: Record<string, SyntaxNode> = {};
    for (const capture of match.captures) {
      const tag = '@' + capture.name;
      grouped[tag] = nodeToCapture(tag, capture.node);
      nodeMap[tag] = capture.node;
    }
    if (Object.keys(grouped).length === 0) continue;

    if (grouped['@import.statement'] !== undefined) {
      const importNode = nodeIfType(nodeMap['@import.statement'], 'import_declaration');
      if (importNode !== null) {
        const decomposed = splitScalaImportDeclaration(importNode);
        if (decomposed !== null) {
          out.push(...decomposed);
          continue;
        }
      }
    }

    normalizeScalaMethodDeclaration(grouped, nodeMap);
    addScalaDeclarationArity(grouped, nodeMap);
    addScalaCallArity(grouped, nodeMap);
    out.push(grouped);
  }

  return out;
}

function normalizeScalaMethodDeclaration(
  grouped: Record<string, Capture>,
  nodeMap: Record<string, SyntaxNode>,
): void {
  const fnNode = nodeMap['@declaration.function'];
  if (fnNode === undefined || !isInsideClassLike(fnNode)) return;
  delete grouped['@declaration.function'];
  delete nodeMap['@declaration.function'];
  grouped['@declaration.method'] = nodeToCapture('@declaration.method', fnNode);
  nodeMap['@declaration.method'] = fnNode;
}

function addScalaDeclarationArity(
  grouped: Record<string, Capture>,
  nodeMap: Record<string, SyntaxNode>,
): void {
  const declTag = (['@declaration.method', '@declaration.function'] as const).find(
    (tag) => grouped[tag] !== undefined,
  );
  if (declTag === undefined) return;

  const fnNode = nodeMap[declTag];
  if (fnNode === undefined) return;

  const params = parameterNodes(fnNode);
  grouped['@declaration.parameter-count'] = syntheticCapture(
    '@declaration.parameter-count',
    fnNode,
    String(params.length),
  );
  grouped['@declaration.required-parameter-count'] = syntheticCapture(
    '@declaration.required-parameter-count',
    fnNode,
    String(params.filter((param) => !hasDefaultValue(param)).length),
  );
  if (params.length > 0) {
    grouped['@declaration.parameter-types'] = syntheticCapture(
      '@declaration.parameter-types',
      fnNode,
      JSON.stringify(params.map((param) => parameterTypeText(param))),
    );
  }
}

function addScalaCallArity(
  grouped: Record<string, Capture>,
  nodeMap: Record<string, SyntaxNode>,
): void {
  const callTag = (
    ['@reference.call.free', '@reference.call.member', '@reference.call.constructor'] as const
  ).find((tag) => grouped[tag] !== undefined);
  if (callTag === undefined || grouped['@reference.arity'] !== undefined) return;

  const anchor = nodeMap[callTag];
  if (anchor === undefined) return;
  const callNode = anchor.type === 'instance_expression' ? anchor.parent : anchor;
  if (
    callNode === null ||
    (callNode.type !== 'call_expression' && callNode.type !== 'instance_expression')
  ) {
    return;
  }

  const args = argumentNodes(callNode);
  grouped['@reference.arity'] = syntheticCapture('@reference.arity', callNode, String(args.length));
  grouped['@reference.parameter-types'] = syntheticCapture(
    '@reference.parameter-types',
    callNode,
    JSON.stringify(args.map((arg) => inferScalaArgType(arg))),
  );
}

function synthesizeScalaInheritanceReferences(rootNode: SyntaxNode): CaptureMatch[] {
  const out: CaptureMatch[] = [];
  walk(rootNode, (node) => {
    if (!CLASS_LIKE_TYPES.has(node.type)) return;
    const extendsClause = node.namedChildren.find((child) => child.type === 'extends_clause');
    if (extendsClause === undefined) return;

    for (const base of extendsClause.namedChildren) {
      const nameNode = scalaTypeNameNode(base);
      if (nameNode === null) continue;
      out.push({
        '@reference.inherits': nodeToCapture('@reference.inherits', base),
        '@reference.name': nodeToCapture('@reference.name', nameNode),
      });
    }
  });
  return out;
}

function synthesizeScalaReceiverBindings(rootNode: SyntaxNode): CaptureMatch[] {
  const out: CaptureMatch[] = [];
  walk(rootNode, (classNode) => {
    if (!CLASS_LIKE_TYPES.has(classNode.type)) return;
    const classNameNode =
      classNode.childForFieldName('name') ?? firstNamedChildOfType(classNode, 'identifier');
    if (classNameNode === null) return;
    const superName = firstSuperTypeName(classNode);

    walk(classNode, (fnNode) => {
      if (fnNode.type !== 'function_definition' && fnNode.type !== 'function_declaration') return;
      if (nearestClassLike(fnNode) !== classNode) return;
      out.push(typeBindingCapture(fnNode, 'this', classNameNode.text, '@type-binding.self'));
      if (superName !== null) {
        out.push(typeBindingCapture(fnNode, 'super', superName.text, '@type-binding.self'));
      }
    });
  });
  return out;
}

function typeBindingCapture(
  anchor: SyntaxNode,
  name: string,
  typeName: string,
  tag: '@type-binding.self' | '@type-binding.constructor',
): CaptureMatch {
  return {
    [tag]: nodeToCapture(tag, anchor),
    '@type-binding.name': syntheticCapture('@type-binding.name', anchor, name),
    '@type-binding.type': syntheticCapture('@type-binding.type', anchor, typeName),
  };
}

function firstSuperTypeName(classNode: SyntaxNode): SyntaxNode | null {
  const extendsClause = classNode.namedChildren.find((child) => child.type === 'extends_clause');
  if (extendsClause === undefined) return null;
  for (const child of extendsClause.namedChildren) {
    const nameNode = scalaTypeNameNode(child);
    if (nameNode !== null) return nameNode;
  }
  return null;
}

function scalaTypeNameNode(node: SyntaxNode): SyntaxNode | null {
  if (node.type === 'identifier' || node.type === 'type_identifier') return node;
  if (node.type === 'generic_type') {
    return node.namedChildren.find((child) => child.type === 'type_identifier') ?? null;
  }
  for (const child of node.namedChildren) {
    const found = scalaTypeNameNode(child);
    if (found !== null) return found;
  }
  return null;
}

function parameterNodes(fnNode: SyntaxNode): SyntaxNode[] {
  const paramsNode = fnNode.namedChildren.find((child) => child.type === 'parameters');
  if (paramsNode === undefined) return [];
  return paramsNode.namedChildren.filter((child) => child.type === 'parameter');
}

function hasDefaultValue(paramNode: SyntaxNode): boolean {
  return paramNode.children.some((child) => child.text === '=');
}

function parameterTypeText(paramNode: SyntaxNode): string {
  const typeNode = paramNode.namedChildren.find(
    (child) => child.type === 'type_identifier' || child.type === 'generic_type',
  );
  return typeNode?.text ?? '';
}

function argumentNodes(callNode: SyntaxNode): SyntaxNode[] {
  const argsNode = callNode.namedChildren.find((child) => child.type === 'arguments');
  if (argsNode === undefined) return [];
  return argsNode.namedChildren.filter((child) => child.type !== 'comment');
}

function inferScalaArgType(argNode: SyntaxNode): string {
  switch (argNode.type) {
    case 'string':
      return 'String';
    case 'integer_literal':
      return 'Int';
    case 'floating_point_literal':
      return 'Double';
    case 'true':
    case 'false':
    case 'boolean_literal':
      return 'Boolean';
    default:
      return '';
  }
}

function isInsideClassLike(node: SyntaxNode): boolean {
  return nearestClassLike(node) !== null;
}

function nearestClassLike(node: SyntaxNode): SyntaxNode | null {
  let cur = node.parent;
  while (cur !== null) {
    if (CLASS_LIKE_TYPES.has(cur.type)) return cur;
    cur = cur.parent;
  }
  return null;
}

function firstNamedChildOfType(node: SyntaxNode, type: string): SyntaxNode | null {
  return node.namedChildren.find((child) => child.type === type) ?? null;
}

function walk(node: SyntaxNode, cb: (node: SyntaxNode) => void): void {
  cb(node);
  for (const child of node.namedChildren) walk(child, cb);
}
