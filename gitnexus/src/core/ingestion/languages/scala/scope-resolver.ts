import type { ParsedFile } from 'gitnexus-shared';
import { SupportedLanguages } from 'gitnexus-shared';
import { buildMro, defaultLinearize } from '../../scope-resolution/passes/mro.js';
import { populateClassOwnedMembers } from '../../scope-resolution/scope/walkers.js';
import type { ScopeResolver } from '../../scope-resolution/contract/scope-resolver.js';
import { scalaProvider } from '../scala.js';
import { scalaArityCompatibility } from './arity.js';
import { resolveScalaImportTarget, type ScalaResolveContext } from './import-target.js';
import { scalaMergeBindings } from './merge-bindings.js';

export const scalaScopeResolver: ScopeResolver = {
  language: SupportedLanguages.Scala,
  get languageProvider() {
    return scalaProvider;
  },
  importEdgeReason: 'scala-scope: import',

  resolveImportTarget: (targetRaw, fromFile, allFilePaths) => {
    const ws: ScalaResolveContext = { fromFile, allFilePaths };
    return resolveScalaImportTarget(
      { kind: 'named', localName: '_', importedName: '_', targetRaw },
      ws,
    );
  },

  mergeBindings: (existing, incoming) => [...scalaMergeBindings([...existing, ...incoming])],

  arityCompatibility: (callsite, def) => scalaArityCompatibility(def, callsite),

  buildMro: (graph, parsedFiles, nodeLookup) =>
    buildMro(graph, parsedFiles, nodeLookup, defaultLinearize),

  populateOwners: (parsed: ParsedFile) => populateClassOwnedMembers(parsed),

  isSuperReceiver: (text) => text.trim() === 'super',

  fieldFallbackOnMethodLookup: false,
  propagatesReturnTypesAcrossImports: true,
  collapseMemberCallsByCallerTarget: true,
  hoistTypeBindingsToModule: true,
};
