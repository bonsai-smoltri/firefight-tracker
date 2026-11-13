import type { AttackMode, RuleIndex, RuleMapping } from '../../types/rules.ts'
import { RULE_MAPPINGS } from './mapping.ts'

export type GrantScope = 'aura' | 'buff' | 'debuff' | 'mark'

export type ResolvedRule =
  | {
      kind: 'mapped'
      /** Name as it appears on the unit, e.g. "Rending in Melee". */
      label: string
      mapping: RuleMapping
      rating: number | null
      /** Extra mode restriction from a wrapper such as "X in Melee". */
      mode: AttackMode | null
      /** Names walked to reach the mapping, e.g. ["Berserker", "Brutal"]. */
      via: string[]
    }
  | {
      /** A Buff, Debuff or Mark: the holder grants it to other units, so it does nothing for itself. */
      kind: 'grant'
      label: string
      scope: Exclude<GrantScope, 'aura'>
      base: ResolvedRule
    }
  | { kind: 'unmapped'; label: string; name: string }

export interface ResolveContext {
  mappings: ReadonlyMap<string, RuleMapping>
  /** Name of the rule this one is declared a reskin of, if any. */
  aliasOf: (name: string) => string | null
}

const WRAPPERS: { pattern: RegExp; mode?: AttackMode; scope?: GrantScope }[] = [
  { pattern: /^(.+) in Melee$/, mode: 'melee' },
  { pattern: /^(.+) when Shooting$/, mode: 'shooting' },
  { pattern: /^(.+) Aura$/, scope: 'aura' },
  { pattern: /^(.+) Buff$/, scope: 'buff' },
  { pattern: /^(.+) Debuff$/, scope: 'debuff' },
  { pattern: /^(.+) Mark$/, scope: 'mark' },
]

const MAX_DEPTH = 6

/** Builds the alias lookup from the generated rule index. */
export function aliasLookup(index: RuleIndex): (name: string) => string | null {
  const byName = new Map<string, string>()
  for (const entry of Object.values(index)) {
    const target = entry.alias ? index[entry.alias]?.name : undefined
    if (target && target !== entry.name) byName.set(entry.name, target)
  }
  return (name) => byName.get(name) ?? null
}

/** Resolution order: mapping by name, then declared alias, then name wrappers. */
export function resolveRule(
  name: string,
  rating: number | null,
  context: ResolveContext,
  label: string = name,
): ResolvedRule {
  return resolve(name, rating, context, label, [], 0)
}

function resolve(
  name: string,
  rating: number | null,
  context: ResolveContext,
  label: string,
  via: string[],
  depth: number,
): ResolvedRule {
  const path = [...via, name]
  const unmapped = { kind: 'unmapped', label, name: path[0] } as const
  if (depth > MAX_DEPTH) return unmapped

  const mapping = context.mappings.get(name)
  if (mapping) return { kind: 'mapped', label, mapping, rating, mode: null, via: path }

  const alias = context.aliasOf(name)
  if (alias) {
    const resolved = resolve(alias, rating, context, label, path, depth + 1)
    if (resolved.kind !== 'unmapped') return resolved
  }

  for (const wrapper of WRAPPERS) {
    const base = wrapper.pattern.exec(name)?.[1]
    if (!base) continue
    const resolved = resolve(base, rating, context, label, path, depth + 1)
    if (resolved.kind === 'unmapped') return unmapped
    if (wrapper.scope && wrapper.scope !== 'aura') return { kind: 'grant', label, scope: wrapper.scope, base: resolved }
    if (wrapper.mode && resolved.kind === 'mapped') {
      if (resolved.mode && resolved.mode !== wrapper.mode) return unmapped
      return { ...resolved, mode: wrapper.mode }
    }
    return resolved
  }

  return unmapped
}

export function defaultContext(index: RuleIndex): ResolveContext {
  return { mappings: RULE_MAPPINGS, aliasOf: aliasLookup(index) }
}

export interface GrantOption {
  /** Rule label on the giver, e.g. "Stealth Buff". */
  label: string
  scope: Exclude<GrantScope, 'aura'>
  /** The rule the receiving unit gets, e.g. Stealth. */
  rule: { id: string; name: string; rating: number | null; label: string }
}

/**
 * Buffs and Marks an army can hand out, deduplicated by rule. Debuffs are left out: their base
 * rule usually reads the opposite way (Defense Debuff is -1 Defense), so applying the base rule
 * would get the sign wrong.
 */
export function grantOptions(
  refs: { name: string; rating: number | null; label: string }[],
  context: ResolveContext,
): GrantOption[] {
  const options = new Map<string, GrantOption>()
  for (const ref of refs) {
    const resolved = resolveRule(ref.name, ref.rating, context, ref.label)
    if (resolved.kind !== 'grant' || resolved.scope === 'debuff' || options.has(ref.name)) continue
    const name = ref.name.replace(/ (Buff|Mark)$/, '')
    options.set(ref.name, { label: ref.name, scope: resolved.scope, rule: { id: '', name, rating: ref.rating, label: ref.name } })
  }
  return [...options.values()]
}
