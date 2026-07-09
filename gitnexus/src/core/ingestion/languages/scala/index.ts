export { scalaArityCompatibility } from './arity.js';
export { emitScalaScopeCaptures } from './captures.js';
export { resolveScalaImportTarget, type ScalaResolveContext } from './import-target.js';
export { interpretScalaImport, interpretScalaTypeBinding } from './interpret.js';
export { scalaMergeBindings } from './merge-bindings.js';
export {
  scalaBindingScopeFor,
  scalaImportOwningScope,
  scalaReceiverBinding,
} from './simple-hooks.js';
