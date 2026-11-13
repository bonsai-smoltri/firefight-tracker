import type { ParsedUnit, ParsedWeapon, RuleRef } from '../../types/list.ts'
import { defaultSituation, type Situation } from '../../types/rules.ts'
import type { AttackInput } from './engine.ts'
import { RULE_MAPPINGS } from './mapping.ts'
import type { ResolveContext } from './resolve.ts'

export function rule(label: string): RuleRef {
  const match = /^(.+?)\((\d+)\+?\)$/.exec(label)
  return match
    ? { id: '', name: match[1], rating: Number(match[2]), label }
    : { id: '', name: label, rating: null, label }
}

export function unit(overrides: Partial<ParsedUnit> & { rules?: RuleRef[] } = {}): ParsedUnit {
  return {
    id: 'u',
    name: 'Unit',
    customName: null,
    size: 1,
    quality: 4,
    defense: 4,
    tough: 1,
    points: 0,
    rules: [],
    weapons: [],
    joinedTo: null,
    caster: null,
    armyId: '',
    ...overrides,
  }
}

export function weapon(overrides: Partial<ParsedWeapon> = {}): ParsedWeapon {
  return { name: 'Gun', label: 'Gun', range: 24, attacks: 1, count: 1, rules: [], ...overrides }
}

const ALIASES: Record<string, string> = { Berserker: 'Brutal', Devout: 'Brutal', Bloodborn: 'Predator' }

export const testContext: ResolveContext = { mappings: RULE_MAPPINGS, aliasOf: (name) => ALIASES[name] ?? null }

export function attack(
  overrides: Partial<Omit<AttackInput, 'situation'>> & { situation?: Partial<Situation> } = {},
): AttackInput {
  const { situation, ...rest } = overrides
  return {
    attacker: unit(),
    weapon: weapon(),
    target: unit(),
    mode: 'shooting',
    context: testContext,
    ...rest,
    situation: { ...defaultSituation(), ...situation },
  }
}
