import type { Callsite, SymbolDefinition } from 'gitnexus-shared';

export function scalaArityCompatibility(
  def: SymbolDefinition,
  callsite: Callsite,
): 'compatible' | 'unknown' | 'incompatible' {
  const min = def.requiredParameterCount;
  const max = def.parameterCount;
  if (min === undefined && max === undefined) return 'unknown';

  const argCount = callsite.arity;
  if (!Number.isFinite(argCount) || argCount < 0) return 'unknown';

  const hasVararg = def.parameterTypes?.some((typeName) => typeName === 'vararg') ?? false;
  if (min !== undefined && argCount < min) return 'incompatible';
  if (max !== undefined && argCount > max && !hasVararg) return 'incompatible';
  return 'compatible';
}
