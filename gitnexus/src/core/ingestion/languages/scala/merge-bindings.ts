import type { BindingRef } from 'gitnexus-shared';

const TIER_LOCAL = 0;
const TIER_IMPORT = 1;
const TIER_WILDCARD = 2;
const TIER_UNKNOWN = 3;

function tierOf(binding: BindingRef): number {
  switch (binding.origin) {
    case 'local':
      return TIER_LOCAL;
    case 'reexport':
    case 'import':
    case 'namespace':
      return TIER_IMPORT;
    case 'wildcard':
      return TIER_WILDCARD;
    default:
      return TIER_UNKNOWN;
  }
}

export function scalaMergeBindings(bindings: readonly BindingRef[]): readonly BindingRef[] {
  if (bindings.length === 0) return bindings;

  let bestTier = Number.POSITIVE_INFINITY;
  for (const binding of bindings) bestTier = Math.min(bestTier, tierOf(binding));

  const seen = new Map<string, BindingRef>();
  for (const binding of bindings) {
    if (tierOf(binding) !== bestTier) continue;
    seen.set(binding.def.nodeId, binding);
  }
  return [...seen.values()];
}
