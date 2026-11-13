import type { ActivationAction } from '../types/battle'
import type { RuleRef } from '../types/list'
import type { ResolveContext } from './rules/resolve'

export const BASE_MOVE: Record<ActivationAction, number> = { hold: 0, advance: 6, rush: 12, charge: 12, idle: 0 }

/** Difficult terrain caps a unit's total move at this, unless it ignores it. */
export const DIFFICULT_TERRAIN_CAP = 6

type Bonus = Partial<Record<'advance' | 'rush' | 'charge', number>>

/** Movement rules by name. Reskins (Runner, Lustbound…) reach these through their declared alias. */
const BONUSES: Record<string, Bonus> = {
  Slow: { advance: -2, rush: -4, charge: -4 },
  Fast: { advance: 2, rush: 4, charge: 4 },
  Quick: { advance: 2, rush: 2, charge: 2 },
  Agile: { advance: 1, rush: 2, charge: 2 },
  'Rapid Advance': { advance: 4 },
  'Rapid Rush': { rush: 6 },
  'Rapid Charge': { charge: 4 },
  Musician: { advance: 1, rush: 1, charge: 1 },
  Aircraft: { advance: 30 },
}

/** Enhanced versions replace their base bonus. */
const ENHANCED: Record<string, { base: string; bonus: Bonus }> = {
  'Enhanced Agile': { base: 'Agile', bonus: { advance: 2, rush: 4, charge: 4 } },
}

export interface Movement {
  /** Inches for each action, after rules. */
  moves: Record<ActivationAction, number>
  /** Actions the unit can't take. */
  blocked: ActivationAction[]
  canShootAfterRush: boolean
  /** Rules that matter for moving, e.g. "Flying: ignores Difficult and Dangerous terrain". */
  notes: string[]
  /** Rules that changed the distances, for showing why. */
  sources: string[]
}

function baseName(name: string, context: ResolveContext): string {
  let current = name.replace(/ Aura$/, '')
  for (let i = 0; i < 4; i++) {
    const next = context.aliasOf(current)
    if (!next || next === current) break
    current = next
  }
  return current
}

export function movement(rules: RuleRef[], context: ResolveContext): Movement {
  const names = new Set(rules.map((r) => baseName(r.name, context)))
  const total: Required<Bonus> = { advance: 0, rush: 0, charge: 0 }
  const sources: string[] = []
  const add = (label: string, bonus: Bonus) => {
    sources.push(label)
    for (const key of ['advance', 'rush', 'charge'] as const) total[key] += bonus[key] ?? 0
  }

  const replaced = new Set(Object.entries(ENHANCED).flatMap(([name, e]) => (names.has(name) && names.has(e.base) ? [e.base] : [])))
  for (const name of names) {
    if (name === 'Slow' && names.has('Swift')) continue
    if (BONUSES[name] && !replaced.has(name)) add(name, BONUSES[name])
    const enhanced = ENHANCED[name]
    if (enhanced && names.has(enhanced.base)) add(name, enhanced.bonus)
  }

  const blocked: ActivationAction[] = names.has('Immobile')
    ? ['advance', 'rush', 'charge']
    : names.has('Aircraft')
      ? ['hold', 'rush', 'charge']
      : []

  const notes: string[] = []
  if (names.has('Aircraft')) notes.push('Aircraft: straight line, ignores units and terrain, can’t seize objectives')
  if (names.has('Flying')) notes.push('Flying: moves through units and terrain, ignores Difficult and Dangerous terrain, passes jumps')
  else if (names.has('Strider')) notes.push('Strider: ignores Difficult terrain, half dice when jumping')
  else if (!names.has('Aircraft')) notes.push(`Difficult terrain: max ${DIFFICULT_TERRAIN_CAP}" total move`)
  if (names.has('Slow') && names.has('Swift')) notes.push('Swift: ignores Slow')

  const moves: Record<ActivationAction, number> = {
    hold: 0,
    idle: 0,
    advance: Math.max(0, BASE_MOVE.advance + total.advance),
    rush: Math.max(0, BASE_MOVE.rush + total.rush),
    charge: Math.max(0, BASE_MOVE.charge + total.charge),
  }
  return { moves, blocked, canShootAfterRush: names.has('Quick Shot'), notes, sources }
}
